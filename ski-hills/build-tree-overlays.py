#!/usr/bin/env python3
"""Generate 10 m ESA WorldCover vector tree-wash overlays (Plan view + Bird's-eye view).

The wash is four hard-edge density bands of the same green (#315b38). Opacity
for each band count is read from tree-opacity.json (BAND_OPACITY_BY_COUNT). Density is a summer Sentinel-2 canopy concentration
on the WorldCover grid, and only WorldCover tree pixels are washed. Each pixel
belongs to one band. Kimberley's published wash is left as it is.

Permanent default for Bird's-eye view (`generate_birdseye_tree_wash` / `setup_frontal_projection`):
  - The projection frame (`paper(sx, sy)`) is fitted to the ski runs' ground window
    (`gx0..gx1, gy0..gy1`) identically to `build-frontal.py` so runs, lifts, and contours
    stay 100% aligned.
  - Both the horizon skyline (`samples`) and the ESA WorldCover 10 m forest sampling mesh
    (`full_gx0..full_gx1, full_gy0..full_gy1`) ALWAYS span the entire DEM terrain sheet
    out to the full 1000x1000 bird's-eye frame (with a hard edge (placed outside `#sh-contour-fade-<slug>`)), matching the full-frame coverage of the contour lines
    rather than stopping at the ski runs' bounding box.
  - Each mesh quad is clipped to the visible side of the skyline. On any edge where
    the 40 m / 2.6 px hiding test flips, the edge is split by bisection and only the
    visible polygon is drawn. Quads are never dropped whole because one corner is
    hidden. That clip is the only path for every hill: no whole-quad fallback and
    no per-hill opt-out.

Usage:
  python3 build-tree-overlays.py --all             # Every catalog hill still missing a hard-edge wash
  python3 build-tree-overlays.py                   # Same as --all
  python3 build-tree-overlays.py --targets         # The original 21 hills
  python3 build-tree-overlays.py <slug> [...]      # Specific hill slug(s)
"""
import bisect
import json
import math
import os
import re
import shutil
import sys
import time
import traceback
import types
import urllib.request
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image, ImageDraw
from rasterio.features import rasterize, shapes
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject, transform_bounds
from rasterio.windows import from_bounds
from scipy.ndimage import binary_closing, gaussian_filter
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
from lean_paths import compact_abs_d, compact_point_list, compact_points
from build_paths import BUILD_INPUTS, canopy_name, dem_name, geom_name, locate_input, worldcover_name
from layout_spec import (
    FIT_ART_PAD,
    FRAME,
    PLAN_ART_PAD,
    PLAN_ART_SIZE,
    PRINT_MARGIN_MM,
    PRINT_MARGIN_SVG,
    assert_print_margin_contract,
)
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
    """Load hill records across all regional JSON catalogs in ski-hills/ (Canada, USA, Europe).

    A run-less index row must not replace the hill file that holds the drawn runs.
    """
    by_slug = {}
    by_path = {}
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
    skip = {"hill-index.json"}

    def remember(hill, path):
        slug = hill.get("slug")
        if not isinstance(slug, str) or not slug:
            return
        prev = by_slug.get(slug)
        new_runs = bool(hill.get("runs"))
        if prev is not None and prev.get("runs") and not new_runs:
            return
        by_slug[slug] = hill
        by_path[slug] = str(path)

    for p in json_files:
        if not p.exists() or p in seen or p.name in skip or p.name.endswith("-names.json") or p.name.endswith("-index.json"):
            continue
        seen.add(p)
        try:
            data = json.loads(p.read_text())
        except Exception:
            continue
        if isinstance(data, dict) and isinstance(data.get("hills"), list):
            for h in data["hills"]:
                if isinstance(h, dict):
                    remember(h, p)
        elif isinstance(data, dict) and data.get("slug") and data.get("runs"):
            remember(data, p)
    return by_slug, by_path


def geom_file(slug):
    return locate_input(geom_name(slug), slug)


def materialize_missing_geom(by_slug, slugs):
    """Write /tmp/<slug>-geom.json from OpenSkiMap for hills that have no geometry cache.

    The saved runs are the deduped lines build-frontal.py projects, so the plan
    frame matches the published drawing.
    """
    import ijson
    import importlib.util

    needed = []
    for slug in slugs:
        path = geom_file(slug)
        if path.exists() and path.stat().st_size > 50:
            continue
        hill = by_slug.get(slug)
        if not hill or not hill.get("id"):
            continue
        needed.append(hill)
    if not needed:
        print("geom cache already covers this batch", flush=True)
        return 0
    src = Path("/tmp/ski")
    if not (src / "runs.geojson").exists():
        print("no OpenSkiMap source; missing geom stays missing", flush=True)
        return 0
    spec = importlib.util.spec_from_file_location("build_alberta", str(REPO_ROOT / "build-alberta.py"))
    ab = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ab)
    wanted = {hill["id"] for hill in needed}
    buckets = {hid: {"geom_runs": [], "geom_lifts": [], "runs": [], "lifts": []} for hid in wanted}

    def take(path, keep_diff):
        kept = 0
        seen = 0
        with open(path, "rb") as handle:
            for feat in ijson.items(handle, "features.item", use_float=True):
                seen += 1
                if seen % 250000 == 0:
                    print(path.name, seen, "kept", kept, flush=True)
                props = feat.get("properties") or {}
                ids = ab.linked_ids(props, wanted)
                if not ids:
                    continue
                lines = ab.lines_of(feat.get("geometry"))
                if not lines:
                    continue
                diff = None
                if keep_diff:
                    raw = props.get("difficulty")
                    if isinstance(raw, str) and raw.strip():
                        diff = raw.strip().lower()
                name = props.get("name")
                name = name.strip() if isinstance(name, str) and name.strip() else None
                kind = (feat.get("geometry") or {}).get("type") or ""
                for oid in ids:
                    slot = buckets[oid]
                    if keep_diff:
                        for line in lines:
                            slot["runs"].append((diff, line))
                        slot["geom_runs"].append({"name": name, "difficulty": diff, "kind": kind, "lines": lines})
                    else:
                        slot["lifts"].extend(lines)
                        slot["geom_lifts"].append({"name": name, "difficulty": None, "lines": lines})
                kept += 1
        print("linked", path.name, "features", seen, "kept", kept, flush=True)

    print("linking OpenSkiMap geometry for", len(needed), "hills", flush=True)
    take(src / "lifts.geojson", False)
    take(src / "runs.geojson", True)
    wrote = 0
    for hill in needed:
        slot = buckets[hill["id"]]
        if not slot["geom_runs"]:
            continue
        try:
            _runs, _lifts, geom, _stats, _raw = ab.framed_parts(slot["runs"], slot["lifts"], slot["geom_runs"])
        except Exception as err:
            print("geom frame failed", hill.get("slug"), err, flush=True)
            continue
        if not geom:
            continue
        payload = {"runs": geom, "lifts": slot["geom_lifts"]}
        dest = BUILD_INPUTS / geom_name(hill["slug"])
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(payload, ensure_ascii=False))
        wrote += 1
    print("wrote", wrote, "geom files of", len(needed), "missing", flush=True)
    return wrote


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
    wc_path = locate_input(worldcover_name(slug), slug)
    if wc_path.exists() and wc_path.stat().st_size > 1000:
        return wc_path
    wc_path = BUILD_INPUTS / worldcover_name(slug)
    wc_path.parent.mkdir(parents=True, exist_ok=True)
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


# Exclusive canopy cuts, quarters of the v3 stipple stretch (raw 0.30..0.95 -> 0..1).
# The name is the band index. Opacity is not stored here: band_paths reads
# tree-opacity.json for however many of these bands a hill actually uses.
TREE_BANDS = (
    (0.00, 0.25, "1"),
    (0.25, 0.50, "2"),
    (0.50, 0.75, "3"),
    (0.75, 1.01, "4"),
)


# Kicking Horse keeps a third-length ground step so the canopy mesh on
# that face stays dense. Skyline clipping does not depend on it, and it
# is not an opt-out of the clip.
TREE_STEP_DIV = {"kicking-horse-resort": 3}
# Opt-in sub-cell smoothing for a bird's-eye wash: (ground step divisor,
# canvas blur sigma in canvas px, simplify tolerance in sheet px). At a
# close zoom a 10 m cell is several sheet px wide and the flat-filled
# mesh quads leave a cell-sized stair along every forest edge. A finer
# step puts the bilinear 0.5 edge between cells and the wider blur rounds
# what is left. Hills not listed keep sigma 1.6 and 1.2 px.
# Grouse Mountain, job 20261120grb (about 5.5 px per 10 m cell).
# Density (band) canvas gets the same blur for listed hills only.
# revelstoke-mountain-resort, job 20261122rvs: failed the tree stair check, same smoothing as Grouse.
TREE_SMOOTH = {
    "grouse-mountain": (4, 6.0, 0.65),
    "revelstoke-mountain-resort": (4, 6.0, 0.65),
}


# Same window the visibility grid uses. A corner outside it is hidden.
_FRAME_LO = -60.0
_FRAME_HI = 1060.0
_CLIP_SPLITS = 16


def _point_visible(px, py, yr, covered):
    """Inside the frame and not hidden by the 40 m / 2.6 px skyline test."""
    if px < _FRAME_LO or px > _FRAME_HI or py < _FRAME_LO or py > _FRAME_HI:
        return False
    return not covered(px, py, yr)


def _split_edge(a, b, covered):
    """Point where visibility flips along the edge from a to b.

    a and b are (px, py, yr, visible). Sixteen bisections land well under
    a pixel on an edge that is already shorter than the 32 px quad limit.
    """
    ax, ay, ayr, avis = a
    bx, by, byr, _bvis = b
    lo = 0.0
    hi = 1.0
    for _ in range(_CLIP_SPLITS):
        mid = (lo + hi) * 0.5
        px = ax + (bx - ax) * mid
        py = ay + (by - ay) * mid
        yr = ayr + (byr - ayr) * mid
        if _point_visible(px, py, yr, covered) == avis:
            lo = mid
        else:
            hi = mid
    t = (lo + hi) * 0.5
    return (ax + (bx - ax) * t, ay + (by - ay) * t)


def clip_quad_rings(corners, covered):
    """Visible polygon(s) of one mesh quad. The only bird's-eye wash path.

    corners is four (px, py, yr, visible) values in ring order. visible is
    the corner result of _point_visible (in frame, and not covered by the
    40 m / 2.6 px test). An edge whose visibility flips is split by
    bisection. A fully hidden quad returns nothing. Two opposite visible
    corners stay two polygons so the hidden middle is not filled in.
    """
    vis = (bool(corners[0][3]), bool(corners[1][3]), bool(corners[2][3]), bool(corners[3][3]))
    nvis = vis[0] + vis[1] + vis[2] + vis[3]
    if nvis == 0:
        return []
    if nvis == 4:
        return [[(c[0], c[1]) for c in corners]]
    if nvis == 2 and vis[0] == vis[2]:
        rings = []
        for i in (0, 2):
            if not vis[i]:
                continue
            a = corners[i]
            nxt = corners[(i + 1) % 4]
            prv = corners[(i + 3) % 4]
            rings.append([(a[0], a[1]), _split_edge(a, nxt, covered), _split_edge(a, prv, covered)])
        return rings
    ring = []
    for i in range(4):
        a = corners[i]
        b = corners[(i + 1) % 4]
        if vis[i]:
            ring.append((a[0], a[1]))
        if vis[i] != vis[(i + 1) % 4]:
            ring.append(_split_edge(a, b, covered))
    if len(ring) >= 3:
        return [ring]
    return []


def remap_canopy(raw):
    """Stretch used by the Kimberley v3 stipple. Raw values sit near 0.30..0.95."""
    return np.clip((raw - 0.28) / 0.66, 0.0, 1.0)


def band_labels(tree_mask, norm):
    """One band per tree pixel. Pixels outside the wash stay 0."""
    labels = np.zeros(tree_mask.shape, dtype=np.uint8)
    on = tree_mask == 1
    n = np.nan_to_num(norm, nan=0.0)
    labels[on & (n < 0.25)] = 1
    labels[on & (n >= 0.25) & (n < 0.50)] = 2
    labels[on & (n >= 0.50) & (n < 0.75)] = 3
    labels[on & (n >= 0.75)] = 4
    return labels


def paths_from_mask(mask, affine, simplify_tol=0.65):
    subpaths = []
    for geom_d, val in shapes(mask, mask=(mask == 1)):
        if val != 1:
            continue
        poly = affine_transform(shape(geom_d), affine)
        poly = poly.simplify(simplify_tol, preserve_topology=True)
        if poly.is_empty:
            continue
        polys = [poly] if isinstance(poly, Polygon) else list(poly.geoms) if isinstance(poly, MultiPolygon) else []
        for p in polys:
            if p.area < 2.0:
                continue
            ext = list(p.exterior.coords[:-1])
            if len(ext) < 3:
                continue
            piece = compact_points(ext, close=True)
            if piece:
                subpaths.append(piece)
            for hole in p.interiors:
                h_pts = list(hole.coords[:-1])
                if len(h_pts) >= 3 and Polygon(hole).area >= 1.5:
                    hole_d = compact_points(h_pts, close=True)
                    if hole_d:
                        subpaths.append(hole_d)
    return " ".join(subpaths)


def load_band_opacity(path=None):
    """Opacities by how many density bands a hill uses. Source: tree-opacity.json."""
    src = Path(path) if path else Path(__file__).resolve().parent / "tree-opacity.json"
    raw = json.loads(src.read_text())
    return {
        int(key): tuple(float(value) for value in values)
        for key, values in raw.items()
        if str(key).isdigit()
    }


def load_opacity_multipliers(path=None):
    """Per-slug factors from tree-opacity.json multipliers."""
    src = Path(path) if path else Path(__file__).resolve().parent / "tree-opacity.json"
    raw = json.loads(src.read_text())
    extra = raw.get("multipliers") or {}
    return {str(slug): float(factor) for slug, factor in extra.items()}


def fmt_band_opacity(value):
    text = f"{float(value):.3f}".rstrip("0")
    if text.endswith("."):
        text += "0"
    if "." in text and len(text.split(".", 1)[1]) < 2:
        text = f"{float(value):.2f}"
    return text


# Same table as css/ski-hills.css and js/ski-hills.js TREE_STEP.
BAND_OPACITY_BY_COUNT = load_band_opacity()
OPACITY_MULTIPLIERS = load_opacity_multipliers()


def opacities_for(slug, count):
    ops = BAND_OPACITY_BY_COUNT.get(count, ())
    factor = OPACITY_MULTIPLIERS.get(slug, 1.0)
    if factor == 1.0:
        return ops
    return tuple(round(op * factor, 3) for op in ops)


def band_paths(labels, affine, simplify_tol=0.65, slug=""):
    found = []
    for i, (_lo, _hi, name) in enumerate(TREE_BANDS, start=1):
        d = paths_from_mask((labels == i).astype(np.uint8), affine, simplify_tol)
        if d:
            found.append((name, d))
    ops = opacities_for(slug, len(found))
    return [{"opacity": op, "name": name, "d": d} for op, (name, d) in zip(ops, found)]


def _stac_scenes(box):
    minlon, minlat, maxlon, maxlat = box
    body = json.dumps({
        "collections": ["sentinel-2-l2a"],
        "bbox": [minlon, minlat, maxlon, maxlat],
        "datetime": "2021-07-01T00:00:00Z/2021-09-15T00:00:00Z",
        "limit": 40,
    }).encode()
    req = urllib.request.Request(
        "https://earth-search.aws.element84.com/v1/search",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        feats = json.load(resp).get("features") or []
    clon = (minlon + maxlon) / 2.0
    clat = (minlat + maxlat) / 2.0

    def rank(feat):
        b = feat.get("bbox") or [0, 0, 0, 0]
        covers = b[0] <= clon <= b[2] and b[1] <= clat <= b[3]
        cloud = feat.get("properties", {}).get("eo:cloud_cover", 100)
        return (0 if covers else 1, cloud)

    return sorted(feats, key=rank)


def ensure_canopy(slug, box, wc_path):
    """10 m Sentinel-2 canopy concentration on the WorldCover grid.

    The v3 Kimberley stipple read this as kimberley-canopy-conc-10m.tif and
    stretched raw values from about 0.30..0.95. That range is a summer
    Sentinel-2 NDVI. Each hill gets the same product, `{slug}-canopy-conc-10m.tif`.
    """
    dest = locate_input(canopy_name(slug), slug)
    if not (dest.exists() and dest.stat().st_size > 1000):
        dest = BUILD_INPUTS / canopy_name(slug)
        dest.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(wc_path) as wc:
        wc_tf = wc.transform
        wc_h, wc_w = wc.height, wc.width
        wc_crs = wc.crs or "EPSG:4326"
    if dest.exists() and dest.stat().st_size > 1000:
        with rasterio.open(dest) as ds:
            if ds.width == wc_w and ds.height == wc_h:
                return dest
    minlon, minlat, maxlon, maxlat = box
    scenes = _stac_scenes((minlon, minlat, maxlon, maxlat))
    if not scenes:
        raise RuntimeError(f"no sentinel-2 scene for {slug}")
    last_err = None
    # A wide crop can straddle two Sentinel-2 tiles, so no one scene covers
    # 60% of it. Each scene fills the cells still empty; stop at 60%.
    mosaic = np.full((wc_h, wc_w), -1.0, np.float32)
    used = []
    for feat in scenes[:8]:
        try:
            red_href = feat["assets"]["red"]["href"]
            nir_href = feat["assets"]["nir"]["href"]
            with rasterio.open(red_href) as red_ds:
                bnds = transform_bounds(wc_crs, red_ds.crs, minlon, minlat, maxlon, maxlat, densify_pts=21)
                win = from_bounds(*bnds, red_ds.transform).round_offsets().round_lengths()
                if win.width < 2 or win.height < 2:
                    continue
                red = red_ds.read(1, window=win, boundless=True, fill_value=0)
                src_tf = rasterio.windows.transform(win, red_ds.transform)
                src_crs = red_ds.crs
            with rasterio.open(nir_href) as nir_ds:
                nir = nir_ds.read(1, window=win, boundless=True, fill_value=0)
            if nir.shape != red.shape:
                h = min(nir.shape[0], red.shape[0])
                w = min(nir.shape[1], red.shape[1])
                red = red[:h, :w]
                nir = nir[:h, :w]
            r = red.astype(np.float32)
            n = nir.astype(np.float32)
            valid = (red > 0) & (nir > 0)
            if int(valid.sum()) < 100:
                continue
            ndvi = np.full(red.shape, np.nan, np.float32)
            ndvi[valid] = (n[valid] - r[valid]) / (n[valid] + r[valid])
            dst = np.full((wc_h, wc_w), -1.0, np.float32)
            reproject(
                ndvi,
                dst,
                src_transform=src_tf,
                src_crs=src_crs,
                dst_transform=wc_tf,
                dst_crs=wc_crs,
                src_nodata=np.nan,
                dst_nodata=-1.0,
                resampling=Resampling.bilinear,
            )
            hole = mosaic < 0
            mosaic[hole] = dst[hole]
            used.append(feat)
            if float((mosaic >= 0).mean()) < 0.6:
                continue
            dst = mosaic
            feat = used[0]
            profile = {
                "driver": "GTiff",
                "height": wc_h,
                "width": wc_w,
                "count": 1,
                "dtype": "float32",
                "crs": wc_crs,
                "transform": wc_tf,
                "nodata": -1.0,
                "compress": "deflate",
            }
            with rasterio.open(dest, "w", **profile) as out:
                out.write(dst, 1)
            cloud = feat.get("properties", {}).get("eo:cloud_cover")
            print("canopy", slug, "+".join(f["id"] for f in used), "cloud", cloud, flush=True)
            return dest
        except Exception as err:
            last_err = err
            continue
    raise RuntimeError(f"canopy failed for {slug}: {last_err}")


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
    pad = FIT_ART_PAD
    square = FRAME
    bw = max(max_x - min_x, 1.0)
    bh = max(max_y - min_y, 1.0)
    s = min((square - pad * 2.0) / bw, (limit_y - pad * 2.0) / bh)
    dx = square / 2.0 - ((min_x + max_x) / 2.0) * s
    dy = pad + (limit_y - pad * 2.0) / 2.0 - ((min_y + max_y) / 2.0) * s
    return {"s": s, "dx": dx, "dy": dy, "clip": limit_y, "bounds": (min_x, min_y, max_x, max_y)}


# Plan pixels turned off north-up, then refit into the 48/904 pad.
# The angle is the published bird's-eye facing, negated, so downhill stays
# at the bottom. Red Lodge's plan was already at -214.6; the zoom only
# widens the hill-index bounds and must not turn it again.
PLAN_TURN_DEG = {
    "red-lodge-mountain": -214.6,
    # Stevens Pass. Was -116.9, the negated bird's-eye facing, which is
    # 116.9° counter-clockwise from north-up. -146.9 is another 30°
    # counter-clockwise. Negative is counter-clockwise in this frame.
    "stevens-pass": -191.9,
    # Steamboat. Was -93.0, the negated bird's-eye facing, which is 93°
    # counter-clockwise from north-up. -128.0 is another 35°
    # counter-clockwise. Negative is counter-clockwise in this frame.
    "steamboat-ski-resort": -128.0,
    # Lake Louise. Was -47.9, the negated bird's-eye front facing, which is
    # 47.9° counter-clockwise from north-up. -17.9 is 30° clockwise
    # (clockwise increases the plan angle). Negative is counter-clockwise
    # in this frame.
    "lake-louise-ski-area": -17.9,
    # job 20261117as140: 0.0 -> 140.0
    "aspen-mountain": 152.0,
    # job 20261117ok180: -95.6 -> 84.4 (180° clockwise)
    # job 20261118okp: 84.4 -> 69.4, then scaled 0.94 about the frame centre
    "okemo-mountain": 69.4,
    # job 20261118mb45: 0.0 -> 45.0
    "marmot-basin": 147.0,
    # job 20261118pdz5: plan angle unchanged at 173.5°, then
    # scaled 0.95 about the frame centre.
    "powder-mountain-ski-resort": 173.5,
    # job 20261118ww135: -43.5 -> -178.5 (published plan 135° CCW)
    "whitewater-ski-resort": -135.5,
    # job 20261118pg180: -10.7 -> 169.3 (published plan 180° CW from -10.7)
    "purgatory-resort": 169.3,
    # job 20261120mw10: -46.7 -> -56.7 (published plan 10° CCW; -46.7 was the unlisted published frame)
    "mount-washington-alpine-resort": -56.7,
}

PLAN_TURN_SCALE = {
    # Aspen Mountain: after the 152° clockwise turn is refit to the 48/904
    # pad, the published plan is scaled 0.95 about the frame centre so the
    # content is about 5% smaller. Unmap undoes this scale first.
    "aspen-mountain": 0.95,
    # Okemo Mountain: after the 15° counter-clockwise turn to 69.40°
    # (20261118okp) is refit to the 48/904 pad, the plan is scaled 0.94
    # about the frame centre, same method as Loveland lvz6 / Arapahoe abz6.
    # Unmap undoes this scale first.
    "okemo-mountain": 0.94,
    # Powder Mountain Ski Resort: the published plan, already refit
    # to the 48/904 pad, is scaled 0.95 about the frame centre
    # (20261118pdz5), same method as Arapahoe abz6 / Okemo okp.
    # Unmap undoes this scale first.
    "powder-mountain-ski-resort": 0.95,
    # Whitewater Ski Resort: after the 10° counter-clockwise turn to
    # -135.5 is refit to the 48/904 pad, the plan is scaled 0.95 about
    # the frame centre (20261118ww10z5), same method as Powder Mountain
    # pdz5. Unmap undoes this scale first.
    "whitewater-ski-resort": 0.95,
}



def _geom_run_points(geom_data):
    return [p for r in geom_data.get("runs") or [] for line in r.get("lines") or [] for p in line]


def plan_turn_frames(geom_data, deg):
    """North-up pad frame and the turned pad frame for one plan rotation."""
    pts = _geom_run_points(geom_data)
    lats = [p[1] for p in pts]
    mid = sum(lats) / len(lats)
    cos = math.cos(mid * math.pi / 180.0)
    east = np.array([p[0] * 111320.0 * cos for p in pts], dtype=np.float64)
    north = np.array([p[1] * 110540.0 for p in pts], dtype=np.float64)
    span = max(float(east.max() - east.min()), float(north.max() - north.min()), 1.0)
    # Screen metres: y grows south, the same way the north-up plan does.
    sx = east
    sy = -north
    th = math.radians(deg)
    c, s = math.cos(th), math.sin(th)
    origin = np.array([float(sx.mean()), float(sy.mean())])
    dx = sx - origin[0]
    dy = sy - origin[1]
    rx = origin[0] + c * dx - s * dy
    ry = origin[1] + s * dx + c * dy
    rspan = max(float(rx.max() - rx.min()), float(ry.max() - ry.min()), 1.0)
    return {
        "cos": cos,
        "minx": float(east.min()),
        "maxx": float(east.max()),
        "miny": float(north.min()),
        "maxy": float(north.max()),
        "span": span,
        "c": c,
        "s": s,
        "origin": origin,
        "rminx": float(rx.min()),
        "rminy": float(ry.min()),
        "rspan": rspan,
    }


def turned_px(fr, lon, lat):
    """Lon/lat to the turned plan pixels the page stores."""
    east = lon * 111320.0 * fr["cos"]
    north = lat * 110540.0
    sx, sy = east, -north
    ox, oy = fr["origin"]
    dx, dy = sx - ox, sy - oy
    rx = ox + fr["c"] * dx - fr["s"] * dy
    ry = oy + fr["s"] * dx + fr["c"] * dy
    px = PLAN_ART_PAD + (rx - fr["rminx"]) / fr["rspan"] * PLAN_ART_SIZE
    py = PLAN_ART_PAD + (ry - fr["rminy"]) / fr["rspan"] * PLAN_ART_SIZE
    return px, py


def plan_pixel_unmap(slug, geom_data):
    """Map a turned plan's stored pixels back to the north-up sample frame.

    generate_plan_tree_wash samples WorldCover in that north-up frame.
    A hill with no PLAN_TURN_DEG entry is already north-up.
    """
    deg = PLAN_TURN_DEG.get(slug)
    if deg is None or not geom_data or not _geom_run_points(geom_data):
        return None
    fr = plan_turn_frames(geom_data, deg)
    pad = PLAN_ART_PAD
    size = PLAN_ART_SIZE

    scale = PLAN_TURN_SCALE.get(slug, 1.0)
    cx = pad + size / 2.0
    cy = pad + size / 2.0

    def unmap(px, py):
        if scale != 1.0:
            px = cx + (px - cx) / scale
            py = cy + (py - cy) / scale
        rx = fr["rminx"] + (px - pad) / size * fr["rspan"]
        ry = fr["rminy"] + (py - pad) / size * fr["rspan"]
        ox, oy = fr["origin"]
        dx = rx - ox
        dy = ry - oy
        sx = ox + fr["c"] * dx + fr["s"] * dy
        sy = oy - fr["s"] * dx + fr["c"] * dy
        east = sx
        north = -sy
        nup_x = pad + (east - fr["minx"]) / fr["span"] * size
        nup_y = pad + (fr["maxy"] - north) / fr["span"] * size
        return nup_x, nup_y

    return unmap


def ski_apache_plan_frame(hill, geom_data):
    """Stored Ski Apache pixels are the north-up plan turned about -127.22°.

    The turn is baked into usa/nm.json. Solving the similarity from the geom
    (same lines, same order) recovers it to about 0.1 px, which is the
    stored rounding. to_px maps lon/lat into that stored frame. unmap maps
    stored pixels back to the north-up frame generate_plan_tree_wash samples.
    """
    stored = []
    for run in hill.get("runs") or []:
        text = run["p"] if isinstance(run, dict) else run
        pts = []
        for pair in str(text).split():
            if "," not in pair:
                continue
            x, y = pair.split(",", 1)
            pts.append((float(x), float(y)))
        if pts:
            stored.append(pts)
    geom_lines = []
    for feat in geom_data.get("runs") or []:
        for line in feat.get("lines") or []:
            if line:
                geom_lines.append(line)
    if len(stored) != len(geom_lines):
        raise RuntimeError("plan frame line count does not match the geom")
    # A stored line can drop a repeated vertex (Arapahoe Basin's Gentry).
    # Fit the similarity on the lines that still match point for point.
    # Hills whose lines already match are unchanged.
    paired = [
        (line, pix)
        for line, pix in zip(geom_lines, stored)
        if len(line) == len(pix) and len(line) >= 2
    ]
    if len(paired) < 8 or len(paired) < int(0.9 * len(stored)):
        raise RuntimeError(
            "plan frame geom does not match the stored plan lines (%d/%d)"
            % (len(paired), len(stored))
        )
    lats = [p[1] for line in geom_lines for p in line]
    mid = sum(lats) / len(lats)
    cos = math.cos(mid * math.pi / 180.0)
    src = []
    dst = []
    for line, pix in paired:
        for (lon, lat), (px, py) in zip(line, pix):
            src.append((lon * 111320.0 * cos, -lat * 110540.0))
            dst.append((px, py))
    S = np.asarray(src, dtype=np.float64)
    D = np.asarray(dst, dtype=np.float64)
    sc = S.mean(axis=0)
    dc = D.mean(axis=0)
    M, _, _, _ = np.linalg.lstsq(S - sc, D - dc, rcond=None)
    err = np.linalg.norm((S - sc) @ M + dc - D, axis=1)
    if float(np.median(err)) > 0.5:
        raise RuntimeError("ski-apache plan frame did not fit (median %.2f px)" % float(np.median(err)))
    pts = [p for line in geom_lines for p in line]
    xs = [p[0] * 111320.0 * cos for p in pts]
    ys = [p[1] * 110540.0 for p in pts]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    span = max(maxx - minx, maxy - miny, 1.0)
    Minv = np.linalg.inv(M)

    def to_px(lon, lat):
        x = lon * 111320.0 * cos
        y_south = -lat * 110540.0
        px = (x - sc[0]) * M[0, 0] + (y_south - sc[1]) * M[1, 0] + dc[0]
        py = (x - sc[0]) * M[0, 1] + (y_south - sc[1]) * M[1, 1] + dc[1]
        return px, py

    def unmap(px, py):
        dpx = px - dc[0]
        dpy = py - dc[1]
        x = dpx * Minv[0, 0] + dpy * Minv[1, 0] + sc[0]
        y_south = dpx * Minv[0, 1] + dpy * Minv[1, 1] + sc[1]
        y_north = -y_south
        return (
            PLAN_ART_PAD + (x - minx) / span * PLAN_ART_SIZE,
            PLAN_ART_PAD + (maxy - y_north) / span * PLAN_ART_SIZE,
        )

    return to_px, unmap

# Plans whose stored lines are in a different order than the geom. The tree
# wash uses the order-free solved frame below. Grouse Mountain, 20261120gro.
PLAN_MATCHED_FRAME = {"grouse-mountain"}


def matched_plan_frame(hill, geom_data, tol=1.0):
    """Solved plan frame without relying on line order.

    Returns (to_px, unmap, info) with the same unmap contract as
    ski_apache_plan_frame: stored plan pixels -> the north-up frame
    generate_plan_tree_wash samples (all geom run points, 48/904 pad).
    """
    stored = []
    for run in hill.get("runs") or []:
        text = run["p"] if isinstance(run, dict) else run
        pts = [tuple(float(v) for v in pair.split(",", 1)) for pair in str(text).split() if "," in pair]
        if len(pts) >= 2:
            stored.append(np.asarray(pts, dtype=np.float64))
    geom_lines = [line for feat in geom_data.get("runs") or [] for line in feat.get("lines") or [] if line]
    lats = [p[1] for line in geom_lines for p in line]
    mid = sum(lats) / len(lats)
    cos = math.cos(mid * math.pi / 180.0)
    geo = [np.asarray([(p[0] * 111320.0 * cos, -p[1] * 110540.0) for p in line], dtype=np.float64) for line in geom_lines]
    by_len = {}
    for j, g in enumerate(geo):
        by_len.setdefault(len(g), []).append(j)

    def similarity(src, dst):
        sc, dc = src.mean(0), dst.mean(0)
        A, B = src - sc, dst - dc
        u, sv, vt = np.linalg.svd(A.T @ B)
        R = (u @ vt).T
        if np.linalg.det(R) < 0:
            vt[-1] *= -1
            R = (u @ vt).T
        k = sv.sum() / max((A ** 2).sum(), 1e-12)
        return k, R, dc - k * (R @ sc)

    def matches(k, R, t):
        pairs = []
        used = set()
        for i, sp in enumerate(stored):
            best = None
            for j in by_len.get(len(sp), []):
                if j in used:
                    continue
                e = np.abs((k * (R @ geo[j].T)).T + t - sp).max()
                if e <= tol and (best is None or e < best[0]):
                    best = (e, j)
            if best:
                used.add(best[1])
                pairs.append((i, best[1]))
        return pairs

    best_pairs = []
    for i, sp in enumerate(stored):
        if len(sp) < 6:
            continue
        for j in by_len.get(len(sp), []):
            k, R, t = similarity(geo[j], sp)
            if np.abs((k * (R @ geo[j].T)).T + t - sp).max() > tol:
                continue
            pairs = matches(k, R, t)
            if len(pairs) > len(best_pairs):
                best_pairs = pairs
    if len(best_pairs) < 8 or len(best_pairs) < int(0.8 * len(stored)):
        raise RuntimeError("matched plan frame: only %d/%d stored lines matched" % (len(best_pairs), len(stored)))
    S = np.vstack([geo[j] for _i, j in best_pairs])
    D = np.vstack([stored[i] for i, _j in best_pairs])
    sc, dc = S.mean(axis=0), D.mean(axis=0)
    M, _, _, _ = np.linalg.lstsq(S - sc, D - dc, rcond=None)
    err = np.linalg.norm((S - sc) @ M + dc - D, axis=1)
    if float(np.median(err)) > 0.5:
        raise RuntimeError("matched plan frame did not fit (median %.2f px)" % float(np.median(err)))
    xs = [p[0] * 111320.0 * cos for line in geom_lines for p in line]
    ys = [p[1] * 110540.0 for line in geom_lines for p in line]
    minx, maxy = min(xs), max(ys)
    span = max(max(xs) - minx, maxy - min(ys), 1.0)
    Minv = np.linalg.inv(M)

    def to_px(lon, lat):
        v = np.array([lon * 111320.0 * cos - sc[0], -lat * 110540.0 - sc[1]])
        q = v @ M + dc
        return float(q[0]), float(q[1])

    def unmap(px, py):
        dpx = px - dc[0]
        dpy = py - dc[1]
        x = dpx * Minv[0, 0] + dpy * Minv[1, 0] + sc[0]
        y_south = dpx * Minv[0, 1] + dpy * Minv[1, 1] + sc[1]
        return (
            PLAN_ART_PAD + (x - minx) / span * PLAN_ART_SIZE,
            PLAN_ART_PAD + (maxy + y_south) / span * PLAN_ART_SIZE,
        )

    info = {"matched": len(best_pairs), "stored": len(stored), "geom": len(geo),
            "err_median": round(float(np.median(err)), 3), "err_max": round(float(err.max()), 3),
            "angle": round(math.degrees(math.atan2(M[0, 1], M[0, 0])), 3),
            "px_per_m": round(float(math.sqrt(abs(np.linalg.det(M)))), 5)}
    return to_px, unmap, info


def generate_plan_tree_wash(slug, hill, geom_data, wc_path, conc_path, pixel_unmap=None):
    """Generate Plan-view treeWash path d in unshifted Plan-view coordinates.

    pixel_unmap(px, py) maps the hill's stored plan pixels back to the
    north-up frame the geom was projected in. A plan rotation passes it so
    the wash is sampled in the turned frame, including newly exposed corners.
    """
    pts_runs = [p for r in geom_data["runs"] for line in r["lines"] for p in line]
    lats = [p[1] for p in pts_runs]
    mid = sum(lats) / len(lats)
    cos = math.cos(mid * math.pi / 180.0)
    xs = [p[0] * 111320.0 * cos for p in pts_runs]
    ys = [p[1] * 110540.0 for p in pts_runs]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    span = max(maxx - minx, maxy - miny, 1.0)
    PAD = PLAN_ART_PAD
    SIZE = PLAN_ART_SIZE

    shift_880 = fit_art_shift(hill, 880)
    shift_1000 = fit_art_shift(hill, 1000)
    s_scale = shift_880["s"]

    # Unshifted bounds covering both 1000x880 lightbox and 1000x1000 card.
    # Print white margin (PRINT_MARGIN_MM mm) is CSS on .sh-print — do not inset here.
    ux_min = min((0.0 - shift_880["dx"]) / s_scale, (0.0 - shift_1000["dx"]) / shift_1000["s"], -60.0)
    ux_max = max((1000.0 - shift_880["dx"]) / s_scale, (1000.0 - shift_1000["dx"]) / shift_1000["s"], 1060.0)
    uy_min = min((0.0 - shift_880["dy"]) / s_scale, (0.0 - shift_1000["dy"]) / shift_1000["s"], -160.0)
    uy_max = max((880.0 - shift_880["dy"]) / s_scale, (1000.0 - shift_1000["dy"]) / shift_1000["s"], 1000.0)
    # A zoomed-out or panned plan sets wider hill-index bounds than the runs.
    # Cover the card and lightbox those bounds draw, plus 25 units of bleed.
    try:
        rows = json.loads((REPO_ROOT / "hill-index.json").read_text()).get("hills") or []
        bb = next((r.get("bounds") for r in rows if r.get("slug") == slug), None)
    except Exception:
        bb = None
    if bb:
        bx0, by0, bx1, by1 = bb
        for lim in (1000.0, 880.0):
            sc = min(920.0 / (bx1 - bx0), (lim - 80.0) / (by1 - by0))
            ddx = 500.0 - (bx0 + bx1) / 2.0 * sc
            ddy = 40.0 + (lim - 80.0) / 2.0 - (by0 + by1) / 2.0 * sc
            ux_min = min(ux_min, -ddx / sc - 25.0)
            uy_min = min(uy_min, -ddy / sc - 25.0)
            ux_max = max(ux_max, (1000.0 - ddx) / sc + 25.0)
            uy_max = max(uy_max, (lim - ddy) / sc + 25.0)

    x0 = math.floor(ux_min / 10.0) * 10.0
    x1 = math.ceil(ux_max / 10.0) * 10.0
    y0 = math.floor(uy_min / 10.0) * 10.0
    y1 = math.ceil(uy_max / 10.0) * 10.0

    S = 2.0
    W = int(round((x1 - x0) * S))
    H = int(round((y1 - y0) * S))
    # A hill whose stored drawing is far from the 1000px frame would otherwise
    # rasterize a huge grid. Keep the same window and thin the sample.
    max_cells = 6_000_000
    cells = W * H
    if cells > max_cells and cells > 0:
        S *= (max_cells / cells) ** 0.5
        S = max(S, 0.35)
        W = max(1, int(round((x1 - x0) * S)))
        H = max(1, int(round((y1 - y0) * S)))

    ix = np.arange(W, dtype=np.float64) / S + x0
    iy = np.arange(H, dtype=np.float64) / S + y0
    px_grid, py_grid = np.meshgrid(ix, iy)
    if pixel_unmap is not None:
        px_grid, py_grid = pixel_unmap(px_grid, py_grid)

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

    with rasterio.open(conc_path) as cc_ds:
        conc_arr = cc_ds.read(1).astype(np.float32)
    conc_arr = np.where(conc_arr < 0, 0.0, conc_arr)
    c00 = conc_arr[r0, c0]
    c01 = conc_arr[r0, c1]
    c10 = conc_arr[r1, c0]
    c11 = conc_arr[r1, c1]
    conc_bilin = remap_canopy((1.0 - fr) * ((1.0 - fc) * c00 + fc * c01) + fr * ((1.0 - fc) * c10 + fc * c11))
    # Concentration only counts on WorldCover tree cover. Open ground stays out.
    conc_bilin = np.where(tree_bilin >= 0.50, conc_bilin, 0.0)

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

    labels = band_labels(mask, conc_bilin)
    bands = band_paths(labels, [1.0 / S, 0.0, 0.0, 1.0 / S, x0, y0], slug=slug)
    joined = " ".join(b["d"] for b in bands)
    return joined, int(mask.sum()), W * H, bands


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
    # DEM fit gutter inside the 1000-unit sheet (not the 8 mm / 10×10 print margin).
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

    # Same post-margin zoom-out and pan as build-frontal.build().
    post_scale = cam.get("post_scale", 1.0)
    pan_y = cam.get("pan_y", 0.0)
    if post_scale != 1 or pan_y:
        base_paper = paper

        def paper(sx, sy, _base=base_paper, _s=post_scale, _dy=pan_y):
            px, py = _base(sx, sy)
            return 500.0 + (px - 500.0) * _s, 440.0 + (py - 440.0) * _s + _dy

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
        # The contour depth grid hides line crossings. It also hides the
        # forest on the visible slope, so the tree wash uses the skyline only.
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


def strip_frontal_trees(svg_text):
    """Drop the wash group, including one group per density band."""
    key = '<g class="sh-frontal-trees">'
    i = svg_text.find(key)
    if i < 0:
        return re.sub(r'<path class="sh-frontal-tree-wash"[^>]*/>\n?', "", svg_text)
    depth = 0
    j = i
    n = len(svg_text)
    while j < n:
        if svg_text.startswith("</g>", j):
            depth -= 1
            j += 4
            if depth == 0:
                if j < n and svg_text[j] == "\n":
                    j += 1
                return svg_text[:i] + svg_text[j:]
            continue
        if svg_text.startswith("<g", j) and (j + 2 >= n or svg_text[j + 2] in " \t>"):
            depth += 1
            j += 2
            continue
        j += 1
    return svg_text


def frontal_wash_markup(bands):
    parts = ['<g class="sh-frontal-trees" transform="scale(.1)">']
    for b in bands:
        parts.append(
            f'<g class="sh-frontal-tree-band sh-frontal-tree-band-{b["name"]}">'
            f'<path class="sh-frontal-tree-wash" d="{b["d"]}" fill="#315b38" '
            f'fill-opacity="{fmt_band_opacity(b["opacity"])}" fill-rule="evenodd" stroke="none"/>'
            f"</g>"
        )
    parts.append("</g>\n")
    return "".join(parts)


def generate_birdseye_tree_wash(slug, runs, lifts, arr, gt, wc_path, conc_path, src_svg_path, out_svg_path, facing_override=None):
    """Generate full-frame Bird's-eye treeWash path d across the entire DEM terrain sheet.

    SH_EDGE_MARGIN must match the --edge-margin the sheet was drawn with
    (US sheets), or the trees are fitted to a different frame than the art.
    """
    edge_margin = float(os.environ.get("SH_EDGE_MARGIN") or 0.0)
    pinfo = setup_frontal_projection(slug, runs, lifts, arr, gt, facing_override=facing_override, edge_margin=edge_margin)
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
    with rasterio.open(conc_path) as cc_ds:
        conc_arr = cc_ds.read(1).astype(np.float32)
    conc_arr = np.where(conc_arr < 0, 0.0, conc_arr)

    step_x = max(10.0, (full_gx1 - full_gx0) / 850.0)
    step_y = max(10.0, (full_gy1 - full_gy0) / 850.0)
    # A small hill fills the same 1000px frame, so a 10 m ground step can
    # jump more than the 32px quad limit and drop the whole wash. Refine
    # only enough that each step stays under that limit. Large hills keep
    # the coarser of 10 m and 850 samples.
    px_per_m = abs(paper(1.0, 0.0)[0] - paper(0.0, 0.0)[0])
    py_per_m = abs(paper(0.0, 1.0)[1] - paper(0.0, 0.0)[1])
    if px_per_m > 0:
        step_x = min(step_x, 24.0 / px_per_m)
    if py_per_m > 0:
        step_y = min(step_y, 24.0 / py_per_m)
    # A 2 m floor keeps ordinary hills from oversampling. On a tiny tow the
    # frame is so enlarged that 2 m already exceeds the 32 px quad limit,
    # so the floor cannot be coarser than that screen limit.
    step_x = max(step_x, min(2.0, (24.0 / px_per_m) if px_per_m > 0 else 2.0))
    step_y = max(step_y, min(2.0, (24.0 / py_per_m) if py_per_m > 0 else 2.0))
    # Per hill, a finer ground step. The skyline is clipped per edge, so
    # this only changes mesh density. It is not a substitute for the clip.
    div = TREE_SMOOTH[slug][0] if slug in TREE_SMOOTH else TREE_STEP_DIV.get(slug, 1)
    step_x /= div
    step_y /= div
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
    raw_c = (1 - wfr) * ((1 - wfc) * conc_arr[wc_r0, wc_c0] + wfc * conc_arr[wc_r0, wc_c1]) + wfr * (
        (1 - wfc) * conc_arr[wc_r1, wc_c0] + wfc * conc_arr[wc_r1, wc_c1]
    )
    # Open ground is not a band, even if the summer scene is green there.
    CONC = np.where(TREE >= 0.50, remap_canopy(raw_c), 0.0)

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
    # A quad with trees on only the visible side of a ridge still has to be
    # tested. Gating on the four-corner average dropped that square, and the
    # wash stopped a cell below the skyline.
    tree_corner = TREE > 0.05
    quad_has_tree = (
        tree_corner[:-1, :-1]
        | tree_corner[:-1, 1:]
        | tree_corner[1:, 1:]
        | tree_corner[1:, :-1]
    )
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
    conc_canvas = Image.new("L", (CW, CH), 0)
    draw_c = ImageDraw.Draw(conc_canvas)

    max_edge = 32.0
    for j in range(ny - 2, -1, -1):
        px0 = PX[j]
        py0 = PY[j]
        px1 = PX[j + 1]
        py1 = PY[j + 1]
        t0 = TREE[j]
        t1 = TREE[j + 1]
        c0 = CONC[j]
        c1 = CONC[j + 1]
        v0 = VIS[j]
        v1 = VIS[j + 1]
        yr0 = float(ys[j])
        yr1 = float(ys[j + 1])
        for i in range(nx - 1):
            # Visibility is the 40 m / 2.6 px test. A quad with any visible
            # corner is clipped to that side. Nothing here drops the quad
            # because one corner is hidden.
            vis00 = bool(v0[i])
            vis10 = bool(v0[i + 1])
            vis11 = bool(v1[i + 1])
            vis01 = bool(v1[i])
            if not (vis00 or vis10 or vis11 or vis01):
                continue
            # Density of the part that is drawn. Hidden corners are not in
            # the polygon; averaging them in thins the sliver at the skyline
            # until the 0.50 mask eats it and the trees fall short of the ridge.
            tv = []
            cv = []
            if vis00:
                tv.append(float(t0[i]))
                cv.append(float(c0[i]))
            if vis10:
                tv.append(float(t0[i + 1]))
                cv.append(float(c0[i + 1]))
            if vis11:
                tv.append(float(t1[i + 1]))
                cv.append(float(c1[i + 1]))
            if vis01:
                tv.append(float(t1[i]))
                cv.append(float(c1[i]))
            tm = sum(tv) / len(tv)
            if tm <= 0.05:
                continue
            x00, y00 = float(px0[i]), float(py0[i])
            x10, y10 = float(px0[i + 1]), float(py0[i + 1])
            x11, y11 = float(px1[i + 1]), float(py1[i + 1])
            x01, y01 = float(px1[i]), float(py1[i])
            if (
                not math.isfinite(x00)
                or not math.isfinite(y00)
                or not math.isfinite(x10)
                or not math.isfinite(y10)
                or not math.isfinite(x11)
                or not math.isfinite(y11)
                or not math.isfinite(x01)
                or not math.isfinite(y01)
            ):
                continue
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
            corners = (
                (x00, y00, yr0, vis00),
                (x10, y10, yr0, vis10),
                (x11, y11, yr1, vis11),
                (x01, y01, yr1, vis01),
            )
            rings = clip_quad_rings(corners, covered)
            if not rings:
                continue
            val = int(round(tm * 255.0))
            cm = sum(cv) / len(cv)
            fill_c = int(round(max(0.0, min(1.0, cm)) * 255.0))
            for ring in rings:
                quad = [((x + BLEED) * S, (y + BLEED) * S) for x, y in ring]
                draw.polygon(quad, fill=val)
                draw_c.polygon(quad, fill=fill_c)

    raw_arr = np.array(canvas, dtype=np.float32) / 255.0
    smooth_arr = gaussian_filter(raw_arr, sigma=TREE_SMOOTH[slug][1] if slug in TREE_SMOOTH else 1.6)
    tree_mask = (smooth_arr >= 0.50).astype(np.uint8)
    # One sheet pixel. Clipping removes the dropped-quad castle wall; this
    # only knocks the corners off a 10 m clearing that is still boxy.
    # S canvas pixels is one sheet pixel. Corridors are punched after, so
    # the close cannot fill a run or a lift.
    close_px = max(1, int(round(S)))
    tree_mask = binary_closing(
        tree_mask, structure=np.ones((close_px * 2 + 1, close_px * 2 + 1), dtype=bool)
    ).astype(np.uint8)

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
    conc_u8 = np.array(conc_canvas, dtype=np.float32) / 255.0
    if slug in TREE_SMOOTH:
        # Same blur on density, so band edges inside the forest are not
        # left on the mesh grid.
        conc_u8 = gaussian_filter(conc_u8, sigma=TREE_SMOOTH[slug][1])
    # The corridor already cleared tree_mask, so every band loses the same runs and lifts.
    labels = band_labels(tree_mask, conc_u8)
    # 1.2 px, just past the 1 px close, so a leftover mesh step becomes a
    # diagonal instead of a castle wall. Plan washes stay at 0.65.
    bands = band_paths(
        labels,
        [scale_to_1000, 0.0, 0.0, scale_to_1000, -BLEED, -BLEED],
        simplify_tol=TREE_SMOOTH[slug][2] if slug in TREE_SMOOTH else 1.2,
        slug=slug,
    )
    wash_el = frontal_wash_markup(bands)

    svg_clean = strip_frontal_trees(svg_text)
    # The sheet stays lines-only. The page fetches the wash the first time
    # Trees is on and inserts this group before the contour mask.
    if bands:
        if 'data-sh-wash="' not in svg_clean:
            svg_clean = svg_clean.replace("<svg ", '<svg data-sh-wash="lazy" ', 1)
        wash_path = out_svg_path.with_name(out_svg_path.stem + ".wash.svg")
        wash_path.parent.mkdir(parents=True, exist_ok=True)
        wash_path.write_text(
            '<svg xmlns="http://www.w3.org/2000/svg">' + wash_el.strip() + "</svg>\n"
        )
    out_svg_path.write_text(svg_clean)
    return len(bands), int(tree_mask.sum()), CW * CH



BY_PATH = {}
FRONTAL_ONLY = False
PLAN_ONLY = False
_HILL_CACHE = {}


def _init_worker(path_map, frontal_only, plan_only):
    global BY_PATH, FRONTAL_ONLY, PLAN_ONLY, _HILL_CACHE
    BY_PATH = path_map
    FRONTAL_ONLY = frontal_only
    PLAN_ONLY = plan_only
    _HILL_CACHE = {}


def hill_record(slug):
    path = BY_PATH.get(slug)
    if not path:
        raise KeyError(slug)
    cached = _HILL_CACHE.get(path)
    if cached is None:
        cached = json.loads(Path(path).read_text())
        _HILL_CACHE[path] = cached
    if isinstance(cached, dict) and isinstance(cached.get("hills"), list):
        for hill in cached["hills"]:
            if hill.get("slug") == slug and hill.get("runs"):
                return hill
        for hill in cached["hills"]:
            if hill.get("slug") == slug:
                return hill
    if isinstance(cached, dict) and cached.get("slug") == slug:
        return cached
    raise KeyError(slug)


def frontal_paths(slug):
    cam = bf.CAMERAS.get(slug) or {}
    views = cam.get("views") or {}
    paths = []
    if views:
        for name in views:
            paths.append(REPO_ROOT / "frontal" / f"{slug}-{name}.svg")
        paths.append(REPO_ROOT / "frontal" / f"{slug}.svg")
    else:
        one = REPO_ROOT / "frontal" / f"{slug}.svg"
        if one.exists():
            paths.append(one)
    return [path for path in paths if path.exists()]


def hard_edge_ready(slug):
    """True when every published sheet already has a hard-edge tree wash."""
    svgs = frontal_paths(slug)
    contour = REPO_ROOT / "contours" / f"{slug}.json"
    if not svgs and not contour.exists():
        return False
    for svg in svgs:
        text = svg.read_text(errors="ignore")
        inline = '<g class="sh-frontal-trees"' in text
        lazy = (
            'data-sh-wash="lazy"' in text
            and svg.with_name(svg.stem + ".wash.svg").exists()
        )
        if not inline and not lazy:
            return False
        if inline and re.search(r'<g class="sh-frontal-trees"[^>]*\smask=', text):
            return False
    if contour.exists() and '"treeWash"' not in contour.read_text(errors="ignore"):
        return False
    return True


def _write_plan_bands(contour_path, dst_c_slug, tree_wash_d, bands):
    src_c = json.loads(contour_path.read_text())
    src_c["lines"] = [
        compact_point_list(line) if isinstance(line, str) else line
        for line in (src_c.get("lines") or [])
    ]
    # Bands live in a sibling file so the first contour fetch is lines only.
    # A hill with no bands keeps one inline path, still compact.
    if bands:
        src_c["treeWash"] = "lazy"
        src_c.pop("treeBands", None)
        wash = {
            "treeBands": [
                {
                    "opacity": b["opacity"],
                    "d": compact_abs_d(b["d"]) if isinstance(b.get("d"), str) else "",
                }
                for b in bands
                if b.get("d")
            ]
        }
        dst_c_slug.with_name(dst_c_slug.stem + ".wash.json").write_text(
            json.dumps(wash, separators=(",", ":"))
        )
    else:
        src_c["treeWash"] = compact_abs_d(tree_wash_d) if tree_wash_d else tree_wash_d
        src_c.pop("treeBands", None)
    c_bytes = json.dumps(src_c, separators=(",", ":"))
    dst_c_slug.write_text(c_bytes)
    return len(tree_wash_d or "")


def generate_overlay(slug):
    t0 = time.time()
    hill = hill_record(slug)
    hid = hill["id"]
    name = hill.get("name") or slug
    # Kimberley's plan wash is the kept stipple-era path. Rewriting either
    # view would replace that sheet, so a rebuild leaves both files untouched.
    if slug == "kimberley-alpine-resort":
        print(f"Kept {slug}", flush=True)
        return {"slug": slug, "name": name, "status": "kept", "sec": round(time.time() - t0, 1)}
    geom_path = geom_file(slug)
    if not geom_path.exists() or geom_path.stat().st_size < 50:
        return {"slug": slug, "name": name, "status": "no-geom", "sec": round(time.time() - t0, 1)}
    svgs = frontal_paths(slug)
    contour_path = REPO_ROOT / "contours" / f"{slug}.json"
    if not svgs and not contour_path.exists():
        return {"slug": slug, "name": name, "status": "no-drawing", "sec": round(time.time() - t0, 1)}

    bf.GEOM = geom_path
    bf.DEM = locate_input(dem_name(slug), slug)
    runs, lifts = bf.load_geom()
    if not runs:
        return {"slug": slug, "name": name, "status": "no-geom", "sec": round(time.time() - t0, 1)}
    box = bf.wide_box(runs, lifts)
    bf.ensure_dem(box)
    arr, gt = bf.read_grid()
    wc_path = ensure_worldcover(slug, box)
    conc_path = ensure_canopy(slug, box, wc_path)

    dst_c_slug = OUT_CONTOURS / f"{slug}.json"
    tree_wash_len = 0
    if not FRONTAL_ONLY and contour_path.exists():
        geom_raw = json.loads(geom_path.read_text())
        # Ski Apache's stored turn is not its bird's-eye facing, so it
        # uses the solved frame. Snowbird's plan is the previous drawing
        # turned 50° counter-clockwise and refit, which is also not a
        # single north-up angle. Vail's plan is the published 102.8-matched
        # sheet turned another 15° clockwise and refit into the area above
        # the banner, which is also not a 48/904 PLAN_TURN_DEG frame.
        # Other turned plans use PLAN_TURN_DEG.
        # Beaver Creek's 164.11° plan turn is baked into usa/co.json
        # (and was then scaled 0.95 about the centre). Use the solved frame.
        # Loveland Basin's plan is the baked 107.66° sheet turned
        # 20° counter-clockwise to 87.66° (20261116lov) and then
        # 30° clockwise to 117.66° (20261117lv30), refit to the
        # 48 pad, then scaled 0.94 about the frame centre
        # (20261117lvz6). The turn lives in usa/co.json. Use the solved frame.
        # Arapahoe Basin's plan is the published sheet turned 30°
        # counter-clockwise and recentred, baked into usa/co.json,
        # then scaled 0.94 about the frame centre (20261118abz6).
        # Aspen Mountain's 140° clockwise plan is in PLAN_TURN_DEG and
        # refit to the 48 pad (baked into usa/co.json). It uses that
        # frame, not the point-for-point solved matcher (124/144 lines).
        # Marmot Basin's plan is the published downhill-at-bottom
        # sheet turned 45° clockwise and refit to the 48 pad, baked
        # into alberta.json (20261118mb45). Use the solved frame.
        # Powder Mountain's plan is the published 48/904 sheet scaled
        # 0.95 about the frame centre (20261118pdz5). Use the solved
        # frame so tree unmap follows the baked pixels and zoom.
        # Whitewater's plan is the published sheet turned 135°
        # counter-clockwise and refit to the 48 pad, baked into
        # hills.json (20261118ww135). Use the solved frame.
        if slug in ("ski-apache", "snowbird", "vail", "beaver-creek", "loveland-basin-ski-area", "arapahoe-basin", "marmot-basin", "powder-mountain-ski-resort", "whitewater-ski-resort"):
            _to_px, unmap = ski_apache_plan_frame(hill, geom_raw)
        elif slug in PLAN_MATCHED_FRAME:
            _to_px, unmap, _info = matched_plan_frame(hill, geom_raw)
            print("matched plan frame", slug, _info, flush=True)
        else:
            unmap = plan_pixel_unmap(slug, geom_raw)
        tree_wash_d, _, _, bands = generate_plan_tree_wash(
            slug, hill, geom_raw, wc_path, conc_path, pixel_unmap=unmap
        )
        tree_wash_len = _write_plan_bands(contour_path, dst_c_slug, tree_wash_d, bands)
    elif dst_c_slug.exists():
        tree_wash_len = len(json.loads(dst_c_slug.read_text()).get("treeWash", "") or "")

    frontal_written = []
    if not PLAN_ONLY and svgs:
        cam = bf.CAMERAS.get(slug) or {}
        views = cam.get("views") or {}
        if views:
            for vname, facing_deg in views.items():
                vslug = f"{slug}-{vname}"
                src_svg = REPO_ROOT / "frontal" / f"{vslug}.svg"
                if not src_svg.exists():
                    continue
                dst_svg = OUT_FRONTAL / f"{vslug}.svg"
                generate_birdseye_tree_wash(
                    slug, runs, lifts, arr, gt, wc_path, conc_path, src_svg, dst_svg, facing_override=facing_deg
                )
                frontal_written.append(vslug)
            front_svg = OUT_FRONTAL / f"{slug}-front.svg"
            if front_svg.exists():
                unsuffixed = front_svg.read_text().replace(f"{slug}-front", slug)
                (OUT_FRONTAL / f"{slug}.svg").write_text(unsuffixed)
                front_wash = front_svg.with_name(front_svg.stem + ".wash.svg")
                if front_wash.exists():
                    (OUT_FRONTAL / f"{slug}.wash.svg").write_text(front_wash.read_text())
                frontal_written.append(slug)
        else:
            src_svg = REPO_ROOT / "frontal" / f"{slug}.svg"
            dst_svg = OUT_FRONTAL / f"{slug}.svg"
            generate_birdseye_tree_wash(slug, runs, lifts, arr, gt, wc_path, conc_path, src_svg, dst_svg)
            frontal_written.append(slug)

    dt = round(time.time() - t0, 1)
    print(f"Done {slug} in {dt}s | plan treeWash len={tree_wash_len} | frontal={len(frontal_written)}", flush=True)
    return {
        "slug": slug,
        "id": hid,
        "name": name,
        "status": "generated",
        "plan": tree_wash_len,
        "frontal": frontal_written,
        "sec": dt,
    }


def _worker(slug):
    try:
        return generate_overlay(slug)
    except SystemExit as err:
        return {"slug": slug, "status": "error", "error": str(err)}
    except Exception:
        return {"slug": slug, "status": "error", "error": traceback.format_exc()[-800:]}


def main():
    argv = sys.argv[1:]
    frontal_only = False
    plan_only = False
    use_targets = False
    workers = max(1, min(4, os.cpu_count() or 1))
    slug_args = []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--frontal-only":
            frontal_only = True
        elif a == "--plan-only":
            plan_only = True
        elif a in ("--all",):
            pass
        elif a == "--targets":
            use_targets = True
        elif a == "--workers":
            i += 1
            workers = max(1, int(argv[i]))
        elif a.startswith("--workers="):
            workers = max(1, int(a.split("=", 1)[1]))
        elif not a.startswith("-"):
            slug_args.append(a)
        else:
            raise SystemExit("unknown option " + a)
        i += 1

    by_slug, by_path = load_hill_records()
    if slug_args:
        work = []
        for slug in slug_args:
            if slug not in by_slug and slug not in by_path:
                raise SystemExit("Unknown hill slug: " + slug)
            work.append(slug)
    elif use_targets:
        work = [slug for _num, slug, _name, _prov in TARGETS]
    else:
        catalog = json.loads((REPO_ROOT / "hill-index.json").read_text()).get("hills") or []
        work = []
        for row in catalog:
            slug = row.get("slug")
            if not slug or slug not in by_slug:
                continue
            if frontal_paths(slug) or (REPO_ROOT / "contours" / f"{slug}.json").exists():
                work.append(slug)
        pending = []
        for slug in work:
            if hard_edge_ready(slug):
                continue
            pending.append(slug)
        print(f"catalog drawings {len(work)} already complete {len(work) - len(pending)} remaining {len(pending)}", flush=True)
        work = pending

    if not work:
        print("nothing to generate", flush=True)
        return

    materialize_missing_geom(by_slug, work)
    # A hill whose geometry arrived in this pass can now be drawn.
    global BY_PATH, FRONTAL_ONLY, PLAN_ONLY
    BY_PATH = by_path
    FRONTAL_ONLY = frontal_only
    PLAN_ONLY = plan_only

    summary = []
    if workers == 1 or len(work) == 1:
        for slug in work:
            summary.append(_worker(slug))
    else:
        ctx = __import__("multiprocessing").get_context("spawn")
        with ProcessPoolExecutor(
            max_workers=workers,
            mp_context=ctx,
            initializer=_init_worker,
            initargs=(by_path, frontal_only, plan_only),
        ) as pool:
            futures = [pool.submit(_worker, slug) for slug in work]
            for fut in as_completed(futures):
                summary.append(fut.result())

    ok = [row for row in summary if row.get("status") in ("generated", "kept")]
    bad = [row for row in summary if row.get("status") not in ("generated", "kept")]
    print(f"\nGENERATED {len(ok)}  OTHER {len(bad)}", flush=True)
    for row in bad:
        print(row.get("status"), row.get("slug"), (row.get("error") or "")[:240], flush=True)
    (Path("/tmp") / "tree-overlay-summary.json").write_text(json.dumps(summary))


assert_print_margin_contract()

if __name__ == "__main__":
    main()
