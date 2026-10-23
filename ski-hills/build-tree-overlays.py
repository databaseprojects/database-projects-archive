#!/usr/bin/env python3
"""Generate 10 m ESA WorldCover vector tree-wash overlays (Plan view + Bird's-eye view).

Permanent default for Bird's-eye view (`generate_birdseye_tree_wash` / `setup_frontal_projection`):
  - The projection frame (`paper(sx, sy)`) is fitted to the ski runs' ground window
    (`gx0..gx1, gy0..gy1`) identically to `build-frontal.py` so runs, lifts, and contours
    stay 100% aligned.
  - Both the horizon skyline (`samples`) and the ESA WorldCover 10 m forest sampling mesh
    (`full_gx0..full_gx1, full_gy0..full_gy1`) ALWAYS span the entire DEM terrain sheet
    out to the full 1000x1000 bird's-eye frame (with a hard edge (placed outside `#sh-contour-fade-<slug>`)), matching the full-frame coverage of the contour lines
    rather than stopping at the ski runs' bounding box.

Usage:
  python3 build-tree-overlays.py                   # All 21 target hills (Plan + Bird's-eye)
  python3 build-tree-overlays.py --frontal-only    # Regenerate Bird's-eye frontal SVGs only
  python3 build-tree-overlays.py <slug> [...]      # Generate specific hill slug(s) from any regional JSON
"""
import bisect
import json
import math
import re
import shutil
import sys
import time
import types
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image, ImageDraw
from rasterio.features import rasterize, shapes
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject
from rasterio.windows import from_bounds
from scipy.ndimage import gaussian_filter
from shapely.affinity import affine_transform
from shapely.geometry import LineString, MultiPolygon, Polygon, shape


# --- Minimal osgeo.gdal shim backed by rasterio so build-frontal.py works unmodified ---
class _GdalBand:
    def __init__(self, ds):
        self._ds = ds
        self.XSize = ds.width
        self.YSize = ds.height

    def GetNoDataValue(self):
        return self._ds.nodata

    def ReadRaster(self, xoff, yoff, xsize, ysize, buf_xsize, buf_ysize, buf_type):
        arr = self._ds.read(1).astype("<f4")
        return arr.tobytes()


class _GdalDataset:
    def __init__(self, ds):
        self._ds = ds

    def GetRasterBand(self, idx):
        return _GdalBand(self._ds)

    def GetGeoTransform(self):
        t = self._ds.transform
        return (t.c, t.a, t.b, t.f, t.d, t.e)

    def __del__(self):
        try:
            self._ds.close()
        except Exception:
            pass


def _gdal_open(path_or_url):
    try:
        ds = rasterio.open(path_or_url)
        return _GdalDataset(ds)
    except Exception:
        return None


def _gdal_warp(
    dest_path,
    src_or_srcs,
    format="GTiff",
    outputBounds=None,
    outputBoundsSRS="EPSG:4326",
    dstSRS="EPSG:4326",
    xRes=None,
    yRes=None,
    resampleAlg="bilinear",
):
    srcs = [src_or_srcs] if isinstance(src_or_srcs, (str, Path)) else list(src_or_srcs)
    minlon, minlat, maxlon, maxlat = outputBounds
    if xRes is None or yRes is None:
        with rasterio.open(str(srcs[0])) as first_ds:
            xRes = abs(first_ds.transform.a)
            yRes = abs(first_ds.transform.e)
            dtype = first_ds.dtypes[0]
            dst_nodata = 0 if dtype == "uint8" else np.nan
    else:
        dtype = "float32"
        dst_nodata = np.nan

    w = max(1, int(round((maxlon - minlon) / xRes)))
    h = max(1, int(round((maxlat - minlat) / yRes)))
    dst_tf = from_origin(minlon, maxlat, xRes, yRes)
    resamp = Resampling.bilinear if resampleAlg == "bilinear" else Resampling.nearest

    if dtype == "uint8":
        dst_arr = np.zeros((h, w), dtype=np.uint8)
    else:
        dst_arr = np.full((h, w), np.nan, dtype=np.float32)

    for s in srcs:
        try:
            with rasterio.open(str(s)) as src_ds:
                if dtype == "uint8" and src_ds.crs and str(src_ds.crs) == "EPSG:4326":
                    # Fast windowed read + reproject for huge 3x3 deg WorldCover COG tiles
                    win = from_bounds(minlon, minlat, maxlon, maxlat, src_ds.transform)
                    win = win.round_offsets().round_lengths()
                    c_off = max(0, int(win.col_off))
                    r_off = max(0, int(win.row_off))
                    c_end = min(src_ds.width, int(win.col_off + win.width))
                    r_end = min(src_ds.height, int(win.row_off + win.height))
                    if c_end <= c_off or r_end <= r_off:
                        continue
                    sub_win = rasterio.windows.Window(c_off, r_off, c_end - c_off, r_end - r_off)
                    sub_arr = src_ds.read(1, window=sub_win)
                    sub_tf = src_ds.window_transform(sub_win)
                    temp_arr = np.zeros((h, w), dtype=np.uint8)
                    reproject(
                        source=sub_arr,
                        destination=temp_arr,
                        src_transform=sub_tf,
                        src_crs=src_ds.crs,
                        src_nodata=0,
                        dst_transform=dst_tf,
                        dst_crs=dstSRS,
                        dst_nodata=0,
                        resampling=resamp,
                    )
                    mask_valid = temp_arr > 0
                    dst_arr[mask_valid] = temp_arr[mask_valid]
                else:
                    # Merge multi-tile float32 DEMs via temp_arr so later tiles never overwrite earlier tiles with NaN
                    temp_arr = np.full((h, w), np.nan, dtype=np.float32)
                    reproject(
                        source=rasterio.band(src_ds, 1),
                        destination=temp_arr,
                        src_transform=src_ds.transform,
                        src_crs=src_ds.crs,
                        src_nodata=src_ds.nodata,
                        dst_transform=dst_tf,
                        dst_crs=dstSRS,
                        dst_nodata=dst_nodata,
                        resampling=resamp,
                    )
                    mask_valid = ~np.isnan(temp_arr) & (temp_arr > -500.0)
                    dst_arr[mask_valid] = temp_arr[mask_valid]
        except Exception as e:
            print(f"  [warn] warp source {s}: {e}", flush=True)

    profile = {
        "driver": "GTiff",
        "height": h,
        "width": w,
        "count": 1,
        "dtype": dtype,
        "crs": dstSRS,
        "transform": dst_tf,
        "nodata": dst_nodata,
    }
    with rasterio.open(str(dest_path), "w", **profile) as out_ds:
        out_ds.write(dst_arr, 1)


osgeo_mod = types.ModuleType("osgeo")
gdal_mod = types.ModuleType("osgeo.gdal")
gdal_mod.GDT_Float32 = 6
gdal_mod.SetConfigOption = lambda k, v: None
gdal_mod.UseExceptions = lambda: None
gdal_mod.Open = _gdal_open
gdal_mod.Warp = _gdal_warp
osgeo_mod.gdal = gdal_mod
sys.modules["osgeo"] = osgeo_mod
sys.modules["osgeo.gdal"] = gdal_mod

_SCRIPT_DIR = Path(__file__).resolve().parent
if (_SCRIPT_DIR / "build-frontal.py").exists():
    REPO_ROOT = _SCRIPT_DIR
elif Path("/workspace/ski-hills-repo/ski-hills").exists():
    REPO_ROOT = Path("/workspace/ski-hills-repo/ski-hills")
else:
    REPO_ROOT = Path("/workspace/dpa-ro/ski-hills")

sys.path.insert(0, str(REPO_ROOT))
import importlib.util

spec = importlib.util.spec_from_file_location("build_frontal", str(REPO_ROOT / "build-frontal.py"))
bf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bf)

if (_SCRIPT_DIR / "build-frontal.py").exists():
    OUT_ROOT = _SCRIPT_DIR
else:
    OUT_ROOT = Path("/workspace/tree-overlays-20")

OUT_CONTOURS = OUT_ROOT / "contours"
OUT_FRONTAL = OUT_ROOT / "frontal"
OUT_PREVIEWS = OUT_ROOT / "previews"
for d in (OUT_CONTOURS, OUT_FRONTAL):
    d.mkdir(parents=True, exist_ok=True)

TARGETS = [
    (1, "whistler-blackcomb", "Whistler Blackcomb", "BC"),
    (2, "lake-louise-ski-area", "Lake Louise Ski Resort", "AB"),
    (3, "big-white-ski-resort", "Big White Ski Resort", "BC"),
    (4, "banff-sunshine-village", "Banff Sunshine Village", "BC/AB"),
    (5, "sun-peaks-resort", "Sun Peaks Resort", "BC"),
    (6, "revelstoke-mountain-resort", "Revelstoke Mountain Resort", "BC"),
    (7, "fernie-alpine-resort", "Fernie Alpine Resort", "BC"),
    (8, "silver-star-mountain-resort", "SilverStar Mountain Resort", "BC"),
    (9, "kicking-horse-resort", "Kicking Horse Mountain Resort", "BC"),
    (10, "red-mountain-resort", "RED Mountain Resort", "BC"),
    (11, "panorama-mountain-resort", "Panorama Mountain Resort", "BC"),
    (12, "cypress-mountain", "Cypress Mountain", "BC"),
    (13, "grouse-mountain", "Grouse Mountain", "BC"),
    (14, "whitewater-ski-resort", "Whitewater Ski Resort", "BC"),
    (15, "marmot-basin", "Marmot Basin", "AB"),
    (16, "mount-washington-alpine-resort", "Mount Washington Alpine Resort", "BC"),
    (17, "nakiska", "Nakiska Ski Area", "AB"),
    (18, "kimberley-alpine-resort", "Kimberley Alpine Resort", "BC"),
    (19, "castle-mountain-resort", "Castle Mountain Resort", "AB"),
    (20, "apex-mountain-resort", "Apex Mountain Resort", "BC"),
    (21, "mt-bachelor", "Mt. Bachelor", "OR"),
]


def load_hill_records():
    """Load hill records across all regional JSON catalogs in ski-hills/ (Canada, USA, Europe)."""
    by_slug = {}
    json_files = [
        REPO_ROOT / "hills.json",
        REPO_ROOT / "alberta.json",
        REPO_ROOT / "quebec.json",
        REPO_ROOT / "ontario.json",
        REPO_ROOT / "east.json",
    ]
    json_files.extend(sorted(REPO_ROOT.glob("*.json")))
    usa_dir = REPO_ROOT / "usa"
    if usa_dir.exists():
        json_files.extend(sorted(usa_dir.glob("*.json")))
    eu_dir = REPO_ROOT / "europe"
    if eu_dir.exists():
        json_files.extend(sorted(eu_dir.rglob("*.json")))
    seen = set()
    for p in json_files:
        if not p.exists() or p in seen:
            continue
        seen.add(p)
        try:
            data = json.loads(p.read_text())
        except Exception:
            continue
        if isinstance(data, dict) and isinstance(data.get("hills"), list):
            for h in data["hills"]:
                if isinstance(h, dict) and "slug" in h:
                    by_slug[h["slug"]] = h
    return by_slug


def worldcover_sources(box):
    """3-degree ESA WorldCover 10 m tiles covering a lon/lat box."""
    minlon, minlat, maxlon, maxlat = box
    urls = []
    lat0 = int(math.floor(minlat / 3.0) * 3)
    lat1 = int(math.floor(maxlat / 3.0) * 3)
    lon0 = int(math.floor(minlon / 3.0) * 3)
    lon1 = int(math.floor(maxlon / 3.0) * 3)
    for lat in range(lat0, lat1 + 1, 3):
        for lon in range(lon0, lon1 + 1, 3):
            ns = "N" if lat >= 0 else "S"
            ew = "E" if lon >= 0 else "W"
            tile = f"{ns}{abs(lat):02d}{ew}{abs(lon):03d}"
            url = (
                f"/vsicurl/https://esa-worldcover.s3.eu-central-1.amazonaws.com/"
                f"v200/2021/map/ESA_WorldCover_10m_2021_v200_{tile}_Map.tif"
            )
            urls.append(url)
    return urls


def ensure_worldcover(slug, box):
    wc_path = Path(f"/tmp/{slug}-worldcover-10m.tif")
    if wc_path.exists() and wc_path.stat().st_size > 1000:
        return wc_path
    if slug == "kimberley-alpine-resort" and Path("/workspace/kimberley-trees/kimberley-worldcover-10m.tif").exists():
        shutil.copyfile("/workspace/kimberley-trees/kimberley-worldcover-10m.tif", wc_path)
        return wc_path
    minlon, minlat, maxlon, maxlat = box
    urls = worldcover_sources(box)
    _gdal_warp(
        str(wc_path),
        urls,
        format="GTiff",
        outputBounds=[minlon, minlat, maxlon, maxlat],
        outputBoundsSRS="EPSG:4326",
        dstSRS="EPSG:4326",
        resampleAlg="near",
    )
    if not wc_path.exists() or wc_path.stat().st_size < 1000:
        raise RuntimeError(f"Failed to warp WorldCover for {slug}")
    return wc_path


def fit_art_shift(hill, limit_y=880):
    xs, ys = [], []
    for r in hill.get("runs") or []:
        pts = r["p"] if isinstance(r, dict) else r
        for pair in pts.split():
            x, y = map(float, pair.split(","))
            xs.append(x)
            ys.append(y)
    for l in hill.get("lifts") or []:
        for pair in l.split():
            x, y = map(float, pair.split(","))
            xs.append(x)
            ys.append(y)
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    pad = 40.0
    square = 1000.0
    bw = max(max_x - min_x, 1.0)
    bh = max(max_y - min_y, 1.0)
    s = min((square - pad * 2.0) / bw, (limit_y - pad * 2.0) / bh)
    dx = square / 2.0 - ((min_x + max_x) / 2.0) * s
    dy = pad + (limit_y - pad * 2.0) / 2.0 - ((min_y + max_y) / 2.0) * s
    return {"s": s, "dx": dx, "dy": dy, "clip": limit_y, "bounds": (min_x, min_y, max_x, max_y)}


def generate_plan_tree_wash(slug, hill, geom_data, wc_path):
    """Generate Plan-view treeWash path d in unshifted Plan-view coordinates."""
    pts_runs = [p for r in geom_data["runs"] for line in r["lines"] for p in line]
    lats = [p[1] for p in pts_runs]
    mid = sum(lats) / len(lats)
    cos = math.cos(mid * math.pi / 180.0)
    xs = [p[0] * 111320.0 * cos for p in pts_runs]
    ys = [p[1] * 110540.0 for p in pts_runs]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    span = max(maxx - minx, maxy - miny, 1.0)
    PAD = 48.0
    SIZE = 904.0

    shift_880 = fit_art_shift(hill, 880)
    shift_1000 = fit_art_shift(hill, 1000)
    s_scale = shift_880["s"]

    # Unshifted bounds covering both 1000x880 lightbox and 1000x1000 card with margin
    ux_min = min((0.0 - shift_880["dx"]) / s_scale, (0.0 - shift_1000["dx"]) / shift_1000["s"], -60.0)
    ux_max = max((1000.0 - shift_880["dx"]) / s_scale, (1000.0 - shift_1000["dx"]) / shift_1000["s"], 1060.0)
    uy_min = min((0.0 - shift_880["dy"]) / s_scale, (0.0 - shift_1000["dy"]) / shift_1000["s"], -160.0)
    uy_max = max((880.0 - shift_880["dy"]) / s_scale, (1000.0 - shift_1000["dy"]) / shift_1000["s"], 1000.0)

    x0 = math.floor(ux_min / 10.0) * 10.0
    x1 = math.ceil(ux_max / 10.0) * 10.0
    y0 = math.floor(uy_min / 10.0) * 10.0
    y1 = math.ceil(uy_max / 10.0) * 10.0

    S = 2.0
    W = int(round((x1 - x0) * S))
    H = int(round((y1 - y0) * S))

    ix = np.arange(W, dtype=np.float64) / S + x0
    iy = np.arange(H, dtype=np.float64) / S + y0
    px_grid, py_grid = np.meshgrid(ix, iy)

    x_m = minx + (px_grid - PAD) / SIZE * span
    y_m = maxy - (py_grid - PAD) / SIZE * span
    lon_grid = x_m / (111320.0 * cos)
    lat_grid = y_m / 110540.0

    with rasterio.open(wc_path) as wc_ds:
        wc_arr = wc_ds.read(1)
        wc_tf = wc_ds.transform

    wc_c = (lon_grid - wc_tf.c) / wc_tf.a - 0.5
    wc_r = (lat_grid - wc_tf.f) / wc_tf.e - 0.5
    r0 = np.clip(np.floor(wc_r).astype(np.int32), 0, wc_arr.shape[0] - 1)
    c0 = np.clip(np.floor(wc_c).astype(np.int32), 0, wc_arr.shape[1] - 1)
    r1 = np.clip(r0 + 1, 0, wc_arr.shape[0] - 1)
    c1 = np.clip(c0 + 1, 0, wc_arr.shape[1] - 1)
    fr = (wc_r - r0).astype(np.float32)
    fc = (wc_c - c0).astype(np.float32)
    t00 = (wc_arr[r0, c0] == 10).astype(np.float32)
    t01 = (wc_arr[r0, c1] == 10).astype(np.float32)
    t10 = (wc_arr[r1, c0] == 10).astype(np.float32)
    t11 = (wc_arr[r1, c1] == 10).astype(np.float32)
    tree_bilin = (1.0 - fr) * ((1.0 - fc) * t00 + fc * t01) + fr * ((1.0 - fc) * t10 + fc * t11)

    sm = gaussian_filter(tree_bilin, sigma=1.6)
    mask = (sm >= 0.50).astype(np.uint8)

    # Cut out 2.0 px trail clearance corridor around every run and lift in Plan view
    run_sw = 0.897 if slug == "whistler-blackcomb" else 1.15
    lift_sw = 1.15
    run_hw_unshifted = (run_sw / 2.0 + 2.0) / s_scale
    lift_hw_unshifted = (lift_sw / 2.0 + 2.0) / s_scale

    buf_geoms = []
    for r in hill.get("runs") or []:
        pts_str = r["p"] if isinstance(r, dict) else r
        coords = [((float(p.split(",")[0]) - x0) * S, (float(p.split(",")[1]) - y0) * S) for p in pts_str.split()]
        if len(coords) >= 2:
            buf_geoms.append((LineString(coords).buffer(run_hw_unshifted * S, cap_style=1, join_style=1), 1))
    for l in hill.get("lifts") or []:
        coords = [((float(p.split(",")[0]) - x0) * S, (float(p.split(",")[1]) - y0) * S) for p in l.split()]
        if len(coords) >= 2:
            buf_geoms.append((LineString(coords).buffer(lift_hw_unshifted * S, cap_style=1, join_style=1), 1))

    if buf_geoms:
        corridor = rasterize(buf_geoms, out_shape=(H, W), fill=0, dtype=np.uint8)
        mask[corridor == 1] = 0

    subpaths = []
    for geom_d, val in shapes(mask, mask=(mask == 1)):
        if val != 1:
            continue
        poly = affine_transform(shape(geom_d), [1.0 / S, 0.0, 0.0, 1.0 / S, x0, y0])
        poly = poly.simplify(0.65, preserve_topology=True)
        if poly.is_empty:
            continue
        polys = [poly] if isinstance(poly, Polygon) else list(poly.geoms) if isinstance(poly, MultiPolygon) else []
        for p in polys:
            if p.area < 2.0:
                continue
            ext = list(p.exterior.coords[:-1])
            if len(ext) < 3:
                continue
            subpaths.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in ext) + "Z")
            for hole in p.interiors:
                h_pts = list(hole.coords[:-1])
                if len(h_pts) >= 3 and Polygon(hole).area >= 1.5:
                    subpaths.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in h_pts) + "Z")

    return " ".join(subpaths), int(mask.sum()), W * H


def setup_frontal_projection(slug, runs, lifts, arr, gt, facing_override=None, edge_margin=0.0):
    """Exact projection setup from build-frontal.py, with full-DEM horizon & terrain bounds."""
    cam = bf.CAMERAS.get(slug) or {}
    elevation = cam.get("elevation", 15.0)
    depth_scale = cam.get("depth_scale", bf.DEPTH_SCALE)
    full_ground = cam.get("full_ground", False)
    frame_scale = cam.get("frame_scale", 1.0)

    if facing_override is not None:
        ang = math.radians(facing_override)
        lock_facing = True
    elif "facing" in cam:
        ang = math.radians(cam["facing"])
        lock_facing = True
    else:
        ang = bf.default_facing(arr, gt, runs)
        lock_facing = False

    h, w = len(arr), len(arr[0])
    midlat = gt[3] + (h * gt[5]) / 2.0
    cos = math.cos(midlat * math.pi / 180.0)
    minlon, maxlat = gt[0], gt[3]
    maxlon = minlon + w * gt[1]
    minlat = maxlat + h * gt[5]
    origin_lon = (minlon + maxlon) / 2.0
    origin_lat = (minlat + maxlat) / 2.0
    m_lon = 111320.0 * cos
    m_lat = 110540.0

    def metres(lon, lat):
        return (lon - origin_lon) * m_lon, (lat - origin_lat) * m_lat

    def unmetres(x, y):
        return origin_lon + x / m_lon, origin_lat + y / m_lat

    ca, sa = math.cos(ang), math.sin(ang)

    def rot(x, y):
        return x * ca - y * sa, x * sa + y * ca

    def unrot(xr, yr):
        return xr * ca + yr * sa, -xr * sa + yr * ca

    def orient(ang_now):
        nonlocal ca, sa
        ca, sa = math.cos(ang_now), math.sin(ang_now)
        pts = []
        step_r = max(1, h // 40)
        step_c = max(1, w // 40)
        for row in range(0, h, step_r):
            for col in range(0, w, step_c):
                z = arr[row][col]
                if z != z:
                    continue
                lon = minlon + (col + 0.5) * gt[1]
                lat = maxlat + (row + 0.5) * gt[5]
                xr, yr = rot(*metres(lon, lat))
                pts.append((yr, z))
        zs = sorted(p[1] for p in pts)
        high = zs[int(len(zs) * 0.9)]
        low = zs[int(len(zs) * 0.1)]
        hy = sum(p[0] for p in pts if p[1] >= high)
        ly = sum(p[0] for p in pts if p[1] <= low)
        return hy >= ly

    if lock_facing:
        ca, sa = math.cos(ang), math.sin(ang)
    elif not orient(ang):
        ang += math.pi
        orient(ang)

    # Full DEM corners in rotated camera space
    dem_corners = [
        rot(*metres(lon, lat))
        for lon, lat in (
            (minlon, maxlat),
            (maxlon, maxlat),
            (minlon, minlat),
            (maxlon, minlat),
        )
    ]
    dem_gx0 = min(p[0] for p in dem_corners)
    dem_gx1 = max(p[0] for p in dem_corners)
    dem_gy0 = min(p[1] for p in dem_corners)
    dem_gy1 = max(p[1] for p in dem_corners)

    # Keep gx0..gx1, gy0..gy1 strictly for fitting paper(sx, sy) identically to build-frontal.py
    run_xy = [rot(*metres(lon, lat)) for run in runs for line in run["lines"] for lon, lat in line]
    rxs = [p[0] for p in run_xy]
    rys = [p[1] for p in run_xy]
    pad_x = (max(rxs) - min(rxs)) * 0.06
    pad_y = (max(rys) - min(rys)) * 0.08
    gx0, gx1 = min(rxs) - pad_x, max(rxs) + pad_x
    gy0, gy1 = min(rys) - pad_y, max(rys) + pad_y
    if full_ground:
        gx0, gx1, gy0, gy1 = dem_gx0, dem_gx1, dem_gy0, dem_gy1

    pitch_rad = math.radians(90.0 - elevation)
    scale = bf.Z_SCALE
    depth = depth_scale

    def project_xy(xr, yr, z):
        return xr, yr * depth * math.cos(pitch_rad) + z * scale * math.sin(pitch_rad)

    cells = []
    for ri in range(bf.ROWS):
        yr = gy0 + (gy1 - gy0) * ri / (bf.ROWS - 1)
        for ci in range(bf.COLS):
            xr = gx0 + (gx1 - gx0) * ci / (bf.COLS - 1)
            lon, lat = unmetres(*unrot(xr, yr))
            z = bf.sample(arr, gt, lon, lat)
            if z is not None:
                sx, sy = project_xy(xr, yr, z)
                cells.append((sx, sy, z, xr, yr))

    xs = [c[0] for c in cells]
    ys = [c[1] for c in cells]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    margin = 4
    view = 1000 - 2 * margin
    data_w = max(maxx - minx, 1)
    data_h = max(maxy - miny, 1)
    fit = min(view / data_w, view / data_h)
    pad_x_p = (1000 - data_w * fit) / 2
    pad_y_p = (1000 - data_h * fit) / 2

    def paper(sx, sy):
        px = pad_x_p + (sx - minx) * fit
        py = pad_y_p + (maxy - sy) * fit
        return px, py

    safe_l, safe_t, safe_r, safe_b = 18.0, 18.0, 982.0, 862.0

    def run_paper_points():
        pts = []
        for run in runs:
            for line in run["lines"]:
                for lon, lat in line:
                    z = bf.sample(arr, gt, lon, lat)
                    if z is None:
                        continue
                    xr, yr = rot(*metres(lon, lat))
                    pts.append(paper(*project_xy(xr, yr, z + bf.RUN_CLEAR)))
        return pts

    run_pts = run_paper_points()
    if not full_ground and len(run_pts) >= 2:
        rx0 = min(p[0] for p in run_pts)
        rx1 = max(p[0] for p in run_pts)
        ry0 = min(p[1] for p in run_pts)
        ry1 = max(p[1] for p in run_pts)
        outside = rx0 < safe_l or rx1 > safe_r or ry0 < safe_t or ry1 > safe_b
        box_w = rx1 - rx0
        box_h = ry1 - ry0
        safe_w = safe_r - safe_l
        safe_h = safe_b - safe_t
        if outside:
            if box_w <= safe_w and box_h <= safe_h:
                dx = safe_l - rx0 if rx0 < safe_l else (safe_r - rx1 if rx1 > safe_r else 0.0)
                dy = safe_t - ry0 if ry0 < safe_t else (safe_b - ry1 if ry1 > safe_b else 0.0)
                base_paper = paper

                def paper(sx, sy, _base=base_paper, _dx=dx, _dy=dy):
                    px, py = _base(sx, sy)
                    return px + _dx, py + _dy
            else:
                scale_fit = min(safe_w / max(box_w, 1.0), safe_h / max(box_h, 1.0))
                if scale_fit >= 0.82:
                    cx = (rx0 + rx1) / 2.0
                    cy = (ry0 + ry1) / 2.0
                    scx = (safe_l + safe_r) / 2.0
                    scy = (safe_t + safe_b) / 2.0
                    base_paper = paper

                    def paper(sx, sy, _base=base_paper, _cx=cx, _cy=cy, _scx=scx, _scy=scy, _s=scale_fit):
                        px, py = _base(sx, sy)
                        return _scx + (px - _cx) * _s, _scy + (py - _cy) * _s

    centered = [] if full_ground else (run_paper_points() if len(run_pts) >= 2 else [])
    if len(centered) >= 2:
        y0 = min(p[1] for p in centered)
        y1 = max(p[1] for p in centered)
        want = (safe_t + safe_b) / 2.0 - (y0 + y1) / 2.0
        dy_min = safe_t - y0
        dy_max = safe_b - y1
        vdy = min(max(want, dy_min), dy_max) if dy_min <= dy_max else 0.0
        if abs(vdy) >= 0.5:
            base_paper = paper

            def paper(sx, sy, _base=base_paper, _dy=vdy):
                px, py = _base(sx, sy)
                return px, py + _dy

    if frame_scale != 1:
        base_paper = paper

        def paper(sx, sy, _base=base_paper, _s=frame_scale):
            px, py = _base(sx, sy)
            return 500.0 + (px - 500.0) * _s, 500.0 + (py - 500.0) * _s

    if edge_margin > 0:
        run_box = []
        lift_box = []
        for group, z_add, bucket in ((runs, bf.RUN_CLEAR, run_box), (lifts, bf.LIFT_CLEAR, lift_box)):
            for item in group:
                for line in item["lines"]:
                    for lon, lat in line:
                        z = bf.sample(arr, gt, lon, lat)
                        if z is None:
                            continue
                        xr, yr = rot(*metres(lon, lat))
                        bucket.append(paper(*project_xy(xr, yr, z + z_add)))
        drawn_pts = run_box
        if len(run_box) >= 2:
            rx0 = min(p[0] for p in run_box)
            rx1 = max(p[0] for p in run_box)
            ry0 = min(p[1] for p in run_box)
            ry1 = max(p[1] for p in run_box)
            pad = 80.0
            lift_box = [
                p for p in lift_box
                if rx0 - pad <= p[0] <= rx1 + pad and ry0 - pad <= p[1] <= ry1 + pad
            ]
            drawn_pts = run_box + lift_box
        if len(drawn_pts) >= 2:
            margin_s, mcx, mcy, tcx, tcy = bf.edge_fit(drawn_pts, edge_margin)
            if margin_s < 0.999 or abs(tcx - mcx) > 0.5 or abs(tcy - mcy) > 0.5:
                base_paper = paper

                def paper(sx, sy, _base=base_paper, _s=margin_s, _cx=mcx, _cy=mcy, _tx=tcx, _ty=tcy):
                    px, py = _base(sx, sy)
                    return _tx + (px - _cx) * _s, _ty + (py - _cy) * _s

    # Full-frame horizon skyline across the entire DEM sheet (not clipped to gx0..gx1, gy0..gy1).
    # Widen column range to [-120, 1120] so off-frame points never clamp into edge bins 0 or bins-1.
    px_lo, px_hi = -120.0, 1120.0
    bins = 2480
    empty_py = [1e9] * bins
    empty_depth = [0.0] * bins

    def col_of(px):
        i = int((px - px_lo) / (px_hi - px_lo) * (bins - 1))
        return max(0, min(bins - 1, i))

    samples = []
    vis_xrs = []
    vis_yrs = []
    for r in range(h):
        lat = maxlat + (r + 0.5) * gt[5]
        for c in range(w):
            z = arr[r][c]
            if z != z:
                continue
            lon = minlon + (c + 0.5) * gt[1]
            xr, yr = rot(*metres(lon, lat))
            px, py = paper(*project_xy(xr, yr, z))
            if px_lo <= px <= px_hi and -160.0 <= py <= 1160.0:
                samples.append((yr, (px, py)))
            if -80.0 <= px <= 1080.0 and -80.0 <= py <= 1080.0:
                vis_xrs.append(xr)
                vis_yrs.append(yr)

    if vis_xrs and vis_yrs:
        full_gx0 = max(dem_gx0, min(vis_xrs) - 200.0)
        full_gx1 = min(dem_gx1, max(vis_xrs) + 200.0)
        full_gy0 = max(dem_gy0, min(vis_yrs) - 200.0)
        full_gy1 = min(dem_gy1, max(vis_yrs) + 200.0)
    else:
        full_gx0, full_gx1, full_gy0, full_gy1 = dem_gx0, dem_gx1, dem_gy0, dem_gy1

    samples.sort()
    step = 6.0
    horizon_py = empty_py[:]
    horizon_depth = empty_depth[:]
    snap_yr = []
    snap_py = []
    snap_depth = []
    buckets = {}
    for yr, (px, py) in samples:
        buckets.setdefault(int(yr // step), []).append((px, py, yr))

    def paint(px, py, yr):
        i = col_of(px)
        if py < horizon_py[i]:
            horizon_py[i] = py
            horizon_depth[i] = yr

    for key in sorted(buckets):
        snap_yr.append(key * step)
        snap_py.append(horizon_py[:])
        snap_depth.append(horizon_depth[:])
        row = sorted(buckets[key])
        for (ax, ay, ayr), (bx, by, byr) in zip(row, row[1:]):
            paint(ax, ay, ayr)
            gap = bx - ax
            if 0 < gap <= 26:
                steps_n = max(1, int(gap))
                for k in range(1, steps_n):
                    t = k / steps_n
                    paint(ax + (bx - ax) * t, ay + (by - ay) * t, ayr + (byr - ayr) * t)
        if row:
            paint(*row[-1])

    def horizon_at(yr):
        idx = bisect.bisect_right(snap_yr, yr) - 1
        if idx < 0:
            return empty_py, empty_depth
        return snap_py[idx], snap_depth[idx]

    depth_grid = None
    depth_hide = None
    dg_spec = bf.DEPTH_GRIDS.get(slug)
    if dg_spec:
        depth_grid = bf.DepthGrid(dg_spec["cell"], dg_spec["tol"], dg_spec["reach"])
        for yr, (px, py) in samples:
            depth_grid.add(px, py, yr)
        band = dg_spec.get("y")
        if band:
            depth_hide = lambda px, py, lohi=band: lohi[0] <= py <= lohi[1]

    def covered(px, py, yr):
        crest, cdepth = horizon_at(yr)
        i = col_of(px)
        nbin = len(crest)
        for j in (i - 1, i, i + 1):
            if 0 <= j < nbin:
                top = crest[j]
                if top < 1e8 and yr - cdepth[j] >= bf.DEPTH_BIAS and py >= top - bf.RIDGE_MARGIN:
                    return True
        if depth_grid is not None and (depth_hide is None or depth_hide(px, py)):
            near = depth_grid.nearest(px, py)
            if near < 1e8 and yr - near >= depth_grid.tol:
                return True
        return False

    return {
        "origin_lon": origin_lon,
        "origin_lat": origin_lat,
        "m_lon": m_lon,
        "m_lat": m_lat,
        "ang": ang,
        "pitch_rad": pitch_rad,
        "scale": scale,
        "depth": depth,
        "project_xy": project_xy,
        "paper": paper,
        "covered": covered,
        "gx0": gx0,
        "gx1": gx1,
        "gy0": gy0,
        "gy1": gy1,
        "full_gx0": full_gx0,
        "full_gx1": full_gx1,
        "full_gy0": full_gy0,
        "full_gy1": full_gy1,
    }


def generate_birdseye_tree_wash(slug, runs, lifts, arr, gt, wc_path, src_svg_path, out_svg_path, facing_override=None):
    """Generate full-frame Bird's-eye treeWash path d across the entire DEM terrain sheet."""
    pinfo = setup_frontal_projection(slug, runs, lifts, arr, gt, facing_override=facing_override)
    origin_lon = pinfo["origin_lon"]
    origin_lat = pinfo["origin_lat"]
    m_lon = pinfo["m_lon"]
    m_lat = pinfo["m_lat"]
    ang = pinfo["ang"]
    pitch_rad = pinfo["pitch_rad"]
    scale = pinfo["scale"]
    depth = pinfo["depth"]
    paper = pinfo["paper"]
    covered = pinfo["covered"]
    # Permanent default: sample across the full visible DEM terrain sheet out to the 1000x1000 frame
    full_gx0, full_gx1 = pinfo["full_gx0"], pinfo["full_gx1"]
    full_gy0, full_gy1 = pinfo["full_gy0"], pinfo["full_gy1"]

    with rasterio.open(wc_path) as wc_ds:
        wc_arr = wc_ds.read(1)
        wc_tf = wc_ds.transform

    step_x = max(10.0, (full_gx1 - full_gx0) / 850.0)
    step_y = max(10.0, (full_gy1 - full_gy0) / 850.0)
    xs = np.arange(full_gx0, full_gx1 + step_x, step_x, dtype=np.float64)
    ys = np.arange(full_gy0, full_gy1 + step_y, step_y, dtype=np.float64)
    nx, ny = len(xs), len(ys)
    XR, YR = np.meshgrid(xs, ys)

    ca, sa = math.cos(ang), math.sin(ang)
    X = XR * ca + YR * sa
    Y = -XR * sa + YR * ca

    LON = origin_lon + X / m_lon
    LAT = origin_lat + Y / m_lat

    dem_np = np.array(arr, dtype=np.float32)
    h_dem, w_dem = dem_np.shape
    col = (LON - gt[0]) / gt[1]
    row = (LAT - gt[3]) / gt[5]
    valid = (col >= 0) & (row >= 0) & (col < w_dem - 1) & (row < h_dem - 1)
    c0 = np.clip(col.astype(np.int32), 0, w_dem - 2)
    r0 = np.clip(row.astype(np.int32), 0, h_dem - 2)
    fx = (col - c0).astype(np.float32)
    fy = (row - r0).astype(np.float32)
    z00 = dem_np[r0, c0]
    z10 = dem_np[r0, c0 + 1]
    z01 = dem_np[r0 + 1, c0]
    z11 = dem_np[r0 + 1, c0 + 1]
    Z = z00 * (1 - fx) * (1 - fy) + z10 * fx * (1 - fy) + z01 * (1 - fx) * fy + z11 * fx * fy
    valid &= ~np.isnan(Z)

    wc_c = (LON - wc_tf.c) / wc_tf.a - 0.5
    wc_r = (LAT - wc_tf.f) / wc_tf.e - 0.5
    wc_r0 = np.clip(np.floor(wc_r).astype(np.int32), 0, wc_arr.shape[0] - 1)
    wc_c0 = np.clip(np.floor(wc_c).astype(np.int32), 0, wc_arr.shape[1] - 1)
    wc_r1 = np.clip(wc_r0 + 1, 0, wc_arr.shape[0] - 1)
    wc_c1 = np.clip(wc_c0 + 1, 0, wc_arr.shape[1] - 1)
    wfr = (wc_r - wc_r0).astype(np.float32)
    wfc = (wc_c - wc_c0).astype(np.float32)
    t00 = (wc_arr[wc_r0, wc_c0] == 10).astype(np.float32)
    t01 = (wc_arr[wc_r0, wc_c1] == 10).astype(np.float32)
    t10 = (wc_arr[wc_r1, wc_c0] == 10).astype(np.float32)
    t11 = (wc_arr[wc_r1, wc_c1] == 10).astype(np.float32)
    TREE = (1 - wfr) * ((1 - wfc) * t00 + wfc * t01) + wfr * ((1 - wfc) * t10 + wfc * t11)

    # Vectorized screen projection (paper is strictly linear in sx, sy)
    p00_x, p00_y = paper(0.0, 0.0)
    p10_x, _ = paper(1.0, 0.0)
    _, p01_y = paper(0.0, 1.0)
    dpx_dsx = p10_x - p00_x
    dpy_dsy = p01_y - p00_y

    SX = XR
    SY = YR * (depth * math.cos(pitch_rad)) + Z * (scale * math.sin(pitch_rad))
    PX = (p00_x + SX * dpx_dsx).astype(np.float32)
    PY = (p00_y + SY * dpy_dsy).astype(np.float32)

    in_frame = valid & (PX >= -60.0) & (PX <= 1060.0) & (PY >= -60.0) & (PY <= 1060.0)
    # Only need occlusion test on vertices that participate in at least one tree-bearing quad
    quad_has_tree = (TREE[:-1, :-1] + TREE[:-1, 1:] + TREE[1:, 1:] + TREE[1:, :-1]) > 0.20
    need_vis = np.zeros_like(in_frame, dtype=bool)
    need_vis[:-1, :-1] |= quad_has_tree
    need_vis[:-1, 1:] |= quad_has_tree
    need_vis[1:, 1:] |= quad_has_tree
    need_vis[1:, :-1] |= quad_has_tree
    need_vis &= in_frame

    VIS = np.zeros_like(valid, dtype=bool)
    js, is_ = np.nonzero(need_vis)
    for idx in range(len(js)):
        j = int(js[idx])
        i = int(is_[idx])
        px = float(PX[j, i])
        py = float(PY[j, i])
        yr_val = float(ys[j])
        if not covered(px, py, yr_val):
            VIS[j, i] = True

    # 20 SVG-unit bleed around 0..1000 x 0..1000 so Gaussian blur has zero edge drop-off at 0/1000
    # Placed outside #sh-contour-fade-<slug> so tree overlays have a clean hard edge.
    BLEED = 20.0
    S = 2.0
    CW = int(round((1000.0 + 2.0 * BLEED) * S))
    CH = CW
    canvas = Image.new("L", (CW, CH), 0)
    draw = ImageDraw.Draw(canvas)

    max_edge = 32.0
    for j in range(ny - 2, -1, -1):
        px0 = PX[j]
        py0 = PY[j]
        px1 = PX[j + 1]
        py1 = PY[j + 1]
        t0 = TREE[j]
        t1 = TREE[j + 1]
        v0 = VIS[j]
        v1 = VIS[j + 1]
        for i in range(nx - 1):
            if not (v0[i] and v0[i + 1] and v1[i + 1] and v1[i]):
                continue
            tm = 0.25 * (float(t0[i]) + float(t0[i + 1]) + float(t1[i + 1]) + float(t1[i]))
            if tm <= 0.05:
                continue
            x00, y00 = float(px0[i]), float(py0[i])
            x10, y10 = float(px0[i + 1]), float(py0[i + 1])
            x11, y11 = float(px1[i + 1]), float(py1[i + 1])
            x01, y01 = float(px1[i]), float(py1[i])
            if (
                abs(x10 - x00) > max_edge
                or abs(y10 - y00) > max_edge
                or abs(x11 - x10) > max_edge
                or abs(y11 - y10) > max_edge
                or abs(x01 - x11) > max_edge
                or abs(y01 - y11) > max_edge
                or abs(x00 - x01) > max_edge
                or abs(y00 - y01) > max_edge
            ):
                continue
            val = int(round(tm * 255.0))
            draw.polygon(
                [
                    ((x00 + BLEED) * S, (y00 + BLEED) * S),
                    ((x10 + BLEED) * S, (y10 + BLEED) * S),
                    ((x11 + BLEED) * S, (y11 + BLEED) * S),
                    ((x01 + BLEED) * S, (y01 + BLEED) * S),
                ],
                fill=val,
            )

    raw_arr = np.array(canvas, dtype=np.float32) / 255.0
    smooth_arr = gaussian_filter(raw_arr, sigma=1.6)
    tree_mask = (smooth_arr >= 0.50).astype(np.uint8)

    svg_text = src_svg_path.read_text()
    poly_tags = re.findall(r'<polyline[^>]*class="sh-frontal-(?:run|lift)"[^>]*/>', svg_text)
    buffered_geoms = []
    for tag in poly_tags:
        m_pts = re.search(r'points="([^"]+)"', tag)
        if not m_pts:
            continue
        m_sw = re.search(r'stroke-width="([^"]+)"', tag)
        sw = float(m_sw.group(1)) if m_sw else 2.2
        coords = []
        for pair in m_pts.group(1).strip().split():
            x_s, y_s = pair.split(",")
            coords.append(((float(x_s) + BLEED) * S, (float(y_s) + BLEED) * S))
        if len(coords) >= 2:
            half_width = (sw / 2.0 + 2.0) * S
            buffered_geoms.append((LineString(coords).buffer(half_width, cap_style=1, join_style=1), 1))

    if buffered_geoms:
        corridor_mask = rasterize(buffered_geoms, out_shape=(CH, CW), fill=0, dtype=np.uint8)
        tree_mask[corridor_mask == 1] = 0

    scale_to_1000 = 1.0 / S
    subpaths = []
    for geom_dict, val in shapes(tree_mask, mask=(tree_mask == 1)):
        if val != 1:
            continue
        poly = affine_transform(shape(geom_dict), [scale_to_1000, 0.0, 0.0, scale_to_1000, -BLEED, -BLEED])
        poly = poly.simplify(0.65, preserve_topology=True)
        if poly.is_empty:
            continue
        polys = [poly] if isinstance(poly, Polygon) else list(poly.geoms) if isinstance(poly, MultiPolygon) else []
        for p in polys:
            if p.area < 2.0:
                continue
            ext = list(p.exterior.coords[:-1])
            if len(ext) < 3:
                continue
            subpaths.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in ext) + "Z")
            for hole in p.interiors:
                h_pts = list(hole.coords[:-1])
                if len(h_pts) >= 3 and Polygon(hole).area >= 1.5:
                    subpaths.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in h_pts) + "Z")

    path_d = " ".join(subpaths)
    wash_el = (
        f'<g class="sh-frontal-trees">'
        f'<path class="sh-frontal-tree-wash" d="{path_d}" fill="#3a6b42" fill-opacity="0.10" fill-rule="evenodd" stroke="none"/>'
        f"</g>\n"
    )

    svg_clean = re.sub(r'<g class="sh-frontal-trees">.*?</g>\n?', "", svg_text, flags=re.S)
    svg_clean = re.sub(r'<path class="sh-frontal-tree-wash"[^>]*/>\n?', "", svg_clean)

    # Insert outside <g mask="url(#sh-contour-fade-...)"> so tree wash has a hard edge (no edge fade)
    mask_m = re.search(r'<g mask="url\(#sh-contour-fade-[^"]+\)">', svg_clean)
    if mask_m:
        idx = mask_m.start()
    else:
        anchor = '<polyline class="sh-frontal-contour"'
        idx = svg_clean.find(anchor)
        if idx < 0:
            raise RuntimeError(f"Could not find contour anchor in {src_svg_path}")
    out_svg = svg_clean[:idx] + wash_el + svg_clean[idx:]
    out_svg_path.write_text(out_svg)
    return len(subpaths), int(tree_mask.sum()), CW * CH


def main():
    argv = sys.argv[1:]
    frontal_only = False
    plan_only = False
    slug_args = []
    for a in argv:
        if a == "--frontal-only":
            frontal_only = True
        elif a == "--plan-only":
            plan_only = True
        elif not a.startswith("-"):
            slug_args.append(a)

    by_slug = load_hill_records()
    target_map = {slug: (num, slug, name, prov) for num, slug, name, prov in TARGETS}

    if slug_args:
        work_list = []
        for idx, s in enumerate(slug_args, 1):
            if s in target_map:
                work_list.append(target_map[s])
            elif s in by_slug:
                h = by_slug[s]
                work_list.append((idx, s, h.get("name", s), h.get("province") or h.get("state") or ""))
            else:
                raise SystemExit(f"Unknown hill slug: {s}")
    else:
        work_list = TARGETS

    summary = []
    total = len(work_list)

    for num, slug, name, prov in work_list:
        t0 = time.time()
        hill = by_slug[slug]
        hid = hill["id"]
        print(f"\n=== [{num:2d}/{total}] {name} ({slug}) ===", flush=True)

        bf.GEOM = Path("/tmp/cypress-geom.json" if (slug == "cypress-mountain" and Path("/tmp/cypress-geom.json").exists()) else f"/tmp/{slug}-geom.json")
        bf.DEM = Path("/tmp/cypress-dem-wide.tif" if slug == "cypress-mountain" else f"/tmp/{slug}-dem-wide.tif")
        runs, lifts = bf.load_geom()
        box = bf.wide_box(runs, lifts)
        bf.ensure_dem(box)
        arr, gt = bf.read_grid()
        wc_path = ensure_worldcover(slug, box)

        dst_c_slug = OUT_CONTOURS / f"{slug}.json"
        dst_c_id = OUT_CONTOURS / f"{hid}.json"
        tree_wash_len = 0

        # 1. Plan-view treeWash (unless --frontal-only)
        if not frontal_only:
            if slug == "kimberley-alpine-resort" and (REPO_ROOT / "contours" / f"{slug}.json").exists():
                src_c_path = REPO_ROOT / "contours" / f"{slug}.json"
                src_c_obj = json.loads(src_c_path.read_text())
                if "treeWash" in src_c_obj:
                    shutil.copyfile(src_c_path, dst_c_slug)
                    shutil.copyfile(src_c_path, dst_c_id)
                    tree_wash_len = len(src_c_obj["treeWash"])
                else:
                    geom_raw = json.loads(bf.GEOM.read_text())
                    tree_wash_d, _, _ = generate_plan_tree_wash(slug, hill, geom_raw, wc_path)
                    src_c_obj["treeWash"] = tree_wash_d
                    c_bytes = json.dumps(src_c_obj, separators=(",", ":"))
                    dst_c_slug.write_text(c_bytes)
                    dst_c_id.write_text(c_bytes)
                    tree_wash_len = len(tree_wash_d)
            else:
                geom_raw = json.loads(bf.GEOM.read_text())
                tree_wash_d, _, _ = generate_plan_tree_wash(slug, hill, geom_raw, wc_path)
                src_c = json.loads((REPO_ROOT / "contours" / f"{slug}.json").read_text())
                src_c["treeWash"] = tree_wash_d
                c_bytes = json.dumps(src_c, separators=(",", ":"))
                dst_c_slug.write_text(c_bytes)
                dst_c_id.write_text(c_bytes)
                tree_wash_len = len(tree_wash_d)
        elif dst_c_slug.exists():
            tree_wash_len = len(json.loads(dst_c_slug.read_text()).get("treeWash", ""))

        # 2. Bird's-eye frontal SVG(s) (unless --plan-only)
        frontal_written = []
        if not plan_only:
            cam = bf.CAMERAS.get(slug) or {}
            views = cam.get("views") or {}
            if views:
                for vname, facing_deg in views.items():
                    vslug = f"{slug}-{vname}"
                    src_svg = REPO_ROOT / "frontal" / f"{vslug}.svg"
                    dst_svg = OUT_FRONTAL / f"{vslug}.svg"
                    generate_birdseye_tree_wash(
                        slug, runs, lifts, arr, gt, wc_path, src_svg, dst_svg, facing_override=facing_deg
                    )
                    frontal_written.append(str(dst_svg))
                # Write unsuffixed <slug>.svg with unsuffixed filter/mask/label IDs matching <slug>.svg
                front_svg_text = (OUT_FRONTAL / f"{slug}-front.svg").read_text()
                unsuffixed_svg_text = front_svg_text.replace(f"{slug}-front", slug)
                unsuffixed_dst = OUT_FRONTAL / f"{slug}.svg"
                unsuffixed_dst.write_text(unsuffixed_svg_text)
                frontal_written.append(str(unsuffixed_dst))
            else:
                src_svg = REPO_ROOT / "frontal" / f"{slug}.svg"
                dst_svg = OUT_FRONTAL / f"{slug}.svg"
                generate_birdseye_tree_wash(slug, runs, lifts, arr, gt, wc_path, src_svg, dst_svg)
                frontal_written.append(str(dst_svg))

        dt = round(time.time() - t0, 1)
        print(
            f"Done {slug} in {dt}s | plan treeWash len={tree_wash_len} | frontal={len(frontal_written)}",
            flush=True,
        )
        summary.append(
            {
                "num": num,
                "slug": slug,
                "id": hid,
                "name": name,
                "prov": prov,
                "plan_contour": str(dst_c_slug),
                "frontal_svgs": frontal_written,
                "status": "Generated full-frame",
                "sec": dt,
            }
        )

    if OUT_ROOT != REPO_ROOT:
        (OUT_ROOT / "summary.json").write_text(json.dumps(summary, indent=2))
    print(f"\nALL {total} HILLS GENERATED SUCCESSFULLY!", flush=True)


if __name__ == "__main__":
    main()
