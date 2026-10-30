#!/usr/bin/env python3
"""Build lazy contour files for the Ski Hills drawings.

Reads OpenSkiMap run and lift geometry (the same local GeoJSON used to
build hills.json) and NRCan's MRDEM-30 digital terrain model. The DEM
window is the square the card draws after the page centres the runs and
lifts, plus the gallery frame when that view shows more ground, plus a
few percent of bleed. The page clips the lines to the frame. Intervals
stay at the value already published for each hill (20 m, or 50 m).
Vertices use the same equirectangular transform as the runs in
hills.json, rounded to 0.1 viewBox units. Copernicus GLO-30 is used only
when MRDEM has no elevation for that window.

hills.json is not modified.

    python3 ski-hills/build-contours.py --src /tmp/ski
"""
import argparse
import json
import os
import math
import sys
from pathlib import Path

import ijson
from osgeo import gdal, ogr, osr

gdal.UseExceptions()
gdal.SetConfigOption("GDAL_HTTP_TIMEOUT", "90")
gdal.SetConfigOption("GDAL_HTTP_MAX_RETRY", "2")
gdal.SetConfigOption("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY")
gdal.SetConfigOption("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif,.TIF")
gdal.SetConfigOption("VSI_CACHE", "TRUE")
gdal.SetConfigOption("GDAL_HTTP_MULTIPLEX", "YES")

_ROOT = Path(__file__).resolve().parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))
from lean_paths import compact_points

MRDEM = "/vsicurl/https://canelevation-dem.s3.ca-central-1.amazonaws.com/mrdem-30/mrdem-30-dtm.tif"
PAD = 48
SIZE = 1000 - PAD * 2
# Same fit as js/ski-hills.js: 40-unit pad, full square on the card,
# and the area above the caption in the gallery.
FRAME_PAD = 40
SQUARE = 1000
DRAW = 880
BLEED = 0.25
# A 20 m sheet is too dense past this many stored vertices.
DENSE_POINTS = 14000
DENSE_LINES = 220


# Contour interval forced for a hill whose 20 m lines pile into each other.
# Mt Seymour's steep faces merged at 20 m; 50 m keeps them apart.
# Sun Peaks drew about 120 lines at 50 m, twice a typical hill; 100 m
# brings it back to the usual density.
M_OVERRIDE = {}  # Mt Seymour and Sun Peaks back on their recorded spacing (reverted)

def lines_of(geom):
    if not geom:
        return []
    kind = geom.get("type")
    coords = geom.get("coordinates") or []
    raw = []
    if kind == "LineString":
        raw = [coords]
    elif kind == "MultiLineString":
        raw = coords
    elif kind == "Polygon":
        raw = coords[:1]
    elif kind == "MultiPolygon":
        raw = [poly[0] for poly in coords if poly]
    out = []
    for line in raw:
        pts = []
        for p in line:
            if isinstance(p, (list, tuple)) and len(p) >= 2:
                pts.append((float(p[0]), float(p[1])))
        if len(pts) >= 2:
            out.append(pts)
    return out


def linked_ids(props):
    ids = []
    for area in props.get("skiAreas") or []:
        if isinstance(area, dict):
            pid = (area.get("properties") or {}).get("id")
        else:
            pid = area if isinstance(area, str) else None
        if pid:
            ids.append(pid)
    return ids


def absorb(path, hills, key):
    kept = 0
    with open(path, "rb") as handle:
        for feat in ijson.items(handle, "features.item", use_float=True):
            props = feat.get("properties") or {}
            ids = [i for i in linked_ids(props) if i in hills]
            if not ids:
                continue
            lines = lines_of(feat.get("geometry"))
            if not lines:
                continue
            for oid in ids:
                hills[oid][key].extend(lines)
            kept += 1
    return kept


def projection(lines):
    """Same transform as ski-hills/hills.json runs. No simplification."""
    pts = [p for line in lines for p in line]
    lats = [p[1] for p in pts]
    lons = [p[0] for p in pts]
    mid = sum(lats) / len(lats)
    cos = math.cos(mid * math.pi / 180)
    xs = [lon * 111320 * cos for lon in lons]
    ys = [lat * 110540 for lat in lats]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    span = max(maxx - minx, maxy - miny, 1.0)

    def to_px(lon, lat):
        x = lon * 111320 * cos
        y = lat * 110540
        px = PAD + (x - minx) / span * SIZE
        py = PAD + (maxy - y) / span * SIZE
        return px, py

    def to_ll(px, py):
        x = minx + (px - PAD) / SIZE * span
        y = maxy - (py - PAD) / SIZE * span
        return x / (111320 * cos), y / 110540

    return to_px, to_ll, span, (min(lons), min(lats), max(lons), max(lats))


def parse_stored(strings):
    lines = []
    for text in strings:
        pts = []
        for pair in (text or "").split():
            if "," not in pair:
                continue
            x, y = pair.split(",")
            pts.append((float(x), float(y)))
        if pts:
            lines.append(pts)
    return lines


def square_frame(point_lines, to_ll):
    """Lon/lat extent of the centred square card, plus gallery overflow.

    point_lines are the drawing coordinates already stored on the hill,
    which is the geometry the page centres. The card fits that geometry
    into the 1000-unit square. The gallery fits it into the area above
    the caption, which can show more ground, so that rectangle is
    included too. The drawing does not continue under the caption. A few
    percent of bleed lets the clip cut the lines at the frame.
    """
    xs = []
    ys = []
    for line in point_lines:
        for px, py in line:
            xs.append(px)
            ys.append(py)
    bw = max(max(xs) - min(xs), 1.0)
    bh = max(max(ys) - min(ys), 1.0)
    cx = (min(xs) + max(xs)) / 2
    cy = (min(ys) + max(ys)) / 2

    def cover(limit):
        scale = min((SQUARE - FRAME_PAD * 2) / bw, (limit - FRAME_PAD * 2) / bh)
        half_x = (SQUARE / 2) / scale
        y_mid = FRAME_PAD + (limit - FRAME_PAD * 2) / 2
        return cx - half_x, cx + half_x, cy - y_mid / scale, cy + (limit - y_mid) / scale

    extents = (cover(SQUARE), cover(DRAW))
    minpx = min(item[0] for item in extents)
    maxpx = max(item[1] for item in extents)
    minpy = min(item[2] for item in extents)
    maxpy = max(item[3] for item in extents)
    bleed = max(maxpx - minpx, maxpy - minpy) * BLEED
    minpx -= bleed
    maxpx += bleed
    minpy -= bleed
    maxpy += bleed
    if os.environ.get("PLAN_BOX"):
        _b = [float(v) for v in os.environ["PLAN_BOX"].split(",")]
        minpx, minpy, maxpx, maxpy = min(minpx, _b[0]), min(minpy, _b[1]), max(maxpx, _b[2]), max(maxpy, _b[3])
    corners = (
        to_ll(minpx, minpy),
        to_ll(minpx, maxpy),
        to_ll(maxpx, minpy),
        to_ll(maxpx, maxpy),
    )
    lons = [point[0] for point in corners]
    lats = [point[1] for point in corners]
    return (min(lons), min(lats), max(lons), max(lats)), (minpx, minpy, maxpx, maxpy)


def draw_lines(lines, to_px):
    drawn = []
    for line in lines:
        cmd = []
        for lon, lat in line:
            px, py = to_px(lon, lat)
            cmd.append(f"{px:.1f},{py:.1f}")
        if len(cmd) >= 2:
            drawn.append(" ".join(cmd))
    return drawn


def same_frame(source_lines, stored, to_px):
    """True when the stored drawing uses this source frame.

    Outline rings are dropped before a run is stored, so the first stored
    line is not always the first source line. A kept centreline still
    matches one of the source lines in the same frame.
    """
    if not stored:
        return False
    made = draw_lines(source_lines[:3], to_px)
    if made == stored[:3]:
        return True
    pool = set()
    for line in source_lines:
        drawn = draw_lines([line], to_px)
        if drawn:
            pool.add(drawn[0])
    hits = sum(1 for row in stored if row in pool)
    return hits >= 3 and (hits >= 8 or hits / len(stored) >= 0.4)


def drawn_geom_matches(hill, to_px):
    """The plan pixels are this frame applied to the deduped run geometry."""
    path = Path("/tmp/%s-geom.json" % hill.get("slug"))
    if not path.exists():
        return False
    try:
        geom = json.loads(path.read_text())
    except Exception:
        return False
    lines = []
    for feat in geom.get("runs") or []:
        for line in feat.get("lines") or []:
            if line:
                lines.append(line)
    stored = hill.get("stored_all") or hill.get("stored") or []
    return bool(stored) and draw_lines(lines, to_px) == stored


def frame_ok(hill, to_px):
    """The stored plan uses this source frame.

    Europe, and a deduped United States hill, can drop an outline ring
    before the first stored line. An exact first-three match still wins.
    A United States hill whose centreline was substituted for a ring still
    passes when that drawn geometry projects to the stored pixels.
    """
    drawn = draw_lines(hill["runs"][:3], to_px)
    if hill.get("province") == "eu":
        return same_frame(hill["runs"], hill.get("stored_all") or hill["stored"], to_px)
    if drawn == hill["stored"]:
        return True
    if hill.get("province") != "us":
        return False
    stored = hill.get("stored_all") or hill["stored"]
    if same_frame(hill["runs"], stored, to_px):
        return True
    # A short hill can have every ring replaced, so no source string matches.
    # One hit in the same frame is enough when most of the drawing is original.
    if stored:
        pool = set()
        for line in hill["runs"]:
            made = draw_lines([line], to_px)
            if made:
                pool.add(made[0])
        hits = sum(1 for row in stored if row in pool)
        if hits and (hits >= 8 or hits / len(stored) >= 0.4):
            return True
    return drawn_geom_matches(hill, to_px)


def lambert():
    src = osr.SpatialReference()
    src.ImportFromEPSG(4326)
    src.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    dst = osr.SpatialReference()
    dst.ImportFromEPSG(3979)
    dst.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    forward = osr.CoordinateTransformation(src, dst)
    back = osr.CoordinateTransformation(dst, src)
    return forward, back


def window_3979(forward, minlon, minlat, maxlon, maxlat, margin_m):
    xs = []
    ys = []
    for lon, lat in (
        (minlon, minlat),
        (minlon, maxlat),
        (maxlon, minlat),
        (maxlon, maxlat),
    ):
        x, y, _z = forward.TransformPoint(lon, lat)
        xs.append(x)
        ys.append(y)
    return min(xs) - margin_m, min(ys) - margin_m, max(xs) + margin_m, max(ys) + margin_m


def clip_mrdem(dataset, bounds, dest):
    minx, miny, maxx, maxy = bounds
    gdal.Translate(
        str(dest),
        dataset,
        projWin=[minx, maxy, maxx, miny],
        projWinSRS="EPSG:3979",
        format="GTiff",
    )


def copernicus_url(lat0, lon0):
    ns = "N" if lat0 >= 0 else "S"
    ew = "E" if lon0 >= 0 else "W"
    name = f"Copernicus_DSM_COG_10_{ns}{abs(lat0):02d}_00_{ew}{abs(lon0):03d}_00_DEM"
    return (
        "https://copernicus-dem-30m.s3.eu-central-1.amazonaws.com/"
        f"{name}/{name}.tif"
    )


def clip_copernicus(box, dest):
    minlon, minlat, maxlon, maxlat = box
    urls = []
    lat = math.floor(minlat)
    while lat <= math.floor(maxlat):
        lon = math.floor(minlon)
        while lon <= math.floor(maxlon):
            urls.append("/vsicurl/" + copernicus_url(lat, lon))
            lon += 1
        lat += 1
    gdal.Warp(
        str(dest),
        urls,
        format="GTiff",
        outputBounds=[minlon, minlat, maxlon, maxlat],
        outputBoundsSRS="EPSG:4326",
        dstSRS="EPSG:3979",
        xRes=30,
        yRes=30,
        resampleAlg="bilinear",
    )


def clip_copernicus_northup(box, dest):
    """Same tiles as clip_copernicus, kept on lon/lat axes.

    EPSG:3979 is centred on Canada. A US window warped into it is rotated
    against the plan drawing, so the top-left and bottom-right of the
    square fall outside the raster. An equirectangular clip lines the
    raster up with the card.
    """
    minlon, minlat, maxlon, maxlat = box
    urls = []
    lat = math.floor(minlat)
    while lat <= math.floor(maxlat):
        lon = math.floor(minlon)
        while lon <= math.floor(maxlon):
            urls.append("/vsicurl/" + copernicus_url(lat, lon))
            lon += 1
        lat += 1
    mid = (minlat + maxlat) / 2
    cos = max(math.cos(mid * math.pi / 180), 0.2)
    gdal.Warp(
        str(dest),
        urls,
        format="GTiff",
        outputBounds=[minlon, minlat, maxlon, maxlat],
        outputBoundsSRS="EPSG:4326",
        dstSRS="EPSG:4326",
        xRes=30 / (111320 * cos),
        yRes=30 / 110540,
        resampleAlg="bilinear",
    )


def geographic():
    srs = osr.SpatialReference()
    srs.ImportFromEPSG(4326)
    srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    return osr.CoordinateTransformation(srs, srs)


def raster_range(path):
    ds = gdal.Open(str(path))
    if ds is None:
        return None
    band = ds.GetRasterBand(1)
    nodata = band.GetNoDataValue()
    try:
        mn, mx = band.ComputeRasterMinMax(True)
    except RuntimeError:
        ds = None
        return None
    ds = None
    if nodata is not None and mn <= nodata and mx <= nodata:
        return None
    if mx - mn < 2:
        return None
    return mn, mx


def contour_lines(path, interval, back):
    ds = gdal.Open(str(path))
    band = ds.GetRasterBand(1)
    nodata = band.GetNoDataValue()
    if nodata is None:
        nodata = -32767
    mem = ogr.GetDriverByName("Memory").CreateDataSource("contours")
    srs = osr.SpatialReference()
    srs.ImportFromWkt(ds.GetProjection())
    layer = mem.CreateLayer("c", srs, ogr.wkbLineString)
    field = ogr.FieldDefn("elev", ogr.OFTReal)
    layer.CreateField(field)
    gdal.ContourGenerate(band, float(interval), 0, [], 1, float(nodata), layer, -1, 0)
    ds = None
    lines = []
    for feat in layer:
        geom = feat.GetGeometryRef()
        if geom is None:
            continue
        parts = [geom] if geom.GetGeometryCount() == 0 else [geom.GetGeometryRef(i) for i in range(geom.GetGeometryCount())]
        for part in parts:
            if part is None or part.GetPointCount() < 2:
                continue
            ll = []
            for i in range(part.GetPointCount()):
                x, y, _z = part.GetPoint(i)
                lon, lat, _h = back.TransformPoint(x, y)
                ll.append((lon, lat))
            lines.append(ll)
    return lines


def store_lines(lines, to_px, window):
    minpx, minpy, maxpx, maxpy = window
    kept = []
    points = 0
    for line in lines:
        cmd = []
        last = None
        for i, (lon, lat) in enumerate(line):
            px, py = to_px(lon, lat)
            if px < minpx or px > maxpx or py < minpy or py > maxpy:
                if len(cmd) >= 2:
                    encoded = compact_points(cmd, close=False)
                    if encoded:
                        kept.append(encoded)
                        points += len(cmd)
                cmd = []
                last = None
                continue
            pair = (round(px, 1), round(py, 1))
            end = i == len(line) - 1
            if last is not None and not end:
                dist = math.hypot(pair[0] - last[0], pair[1] - last[1])
                if dist < 0.4:
                    continue
            if last == pair:
                continue
            cmd.append(pair)
            last = pair
        if len(cmd) >= 2:
            encoded = compact_points(cmd, close=False)
            if encoded:
                kept.append(encoded)
                points += len(cmd)
    return kept, points


def render_us(task):
    """North-up Copernicus contours for one US hill. Canada never calls this."""
    slug = task["slug"]
    to_px, to_ll, _span, _box = projection(task["runs"])
    wide, pixel_window = square_frame(parse_stored(task["drawn"]), to_ll)
    tif = Path("/tmp") / f"sh-dem-{slug}.tif"
    back_hill = geographic()
    try:
        clip_copernicus_northup(wide, tif)
        rng = raster_range(tif)
    except RuntimeError as exc:
        if tif.exists():
            tif.unlink()
        return {"slug": slug, "skipped": "no elevation", "error": str(exc)}
    if rng is None:
        if tif.exists():
            tif.unlink()
        return {"slug": slug, "skipped": "no elevation"}
    recorded = task.get("recorded")
    recorded = M_OVERRIDE.get(slug, recorded)
    drop = task.get("drop")
    if slug in M_OVERRIDE or recorded in (20, 50):
        interval = recorded
    else:
        interval = 50 if isinstance(drop, (int, float)) and drop > 1000 else 20
    try:
        raw = contour_lines(tif, interval, back_hill)
    except RuntimeError as exc:
        if tif.exists():
            tif.unlink()
        return {"slug": slug, "skipped": "contour failed", "error": str(exc)}
    stored, npts = store_lines(raw, to_px, pixel_window)
    if slug not in M_OVERRIDE and recorded not in (20, 50) and interval == 20 and (npts > DENSE_POINTS or len(stored) > DENSE_LINES):
        interval = 50
        raw = contour_lines(tif, interval, back_hill)
        stored, npts = store_lines(raw, to_px, pixel_window)
    if tif.exists():
        tif.unlink()
    if len(stored) < 2:
        return {"slug": slug, "skipped": "flat"}
    payload = {"m": interval, "src": "glo-30", "lines": stored}
    dest = Path(task["dest"])
    dest.write_text(json.dumps(payload, separators=(",", ":")))
    return {
        "slug": slug,
        "m": interval,
        "src": "glo-30",
        "lines": len(stored),
        "points": npts,
        "bytes": dest.stat().st_size,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--src", default="/tmp/ski", help="Directory with runs.geojson and lifts.geojson")
    parser.add_argument("--hills", default="", help="Path to hills.json")
    parser.add_argument("--slug", default="", help="Build one hill, for a check")
    parser.add_argument("--index", default="", help="Index path. Default contours/index.json")
    parser.add_argument("--jobs", type=int, default=1, help="Parallel US hills. Canada stays on one process.")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    hills_path = Path(args.hills) if args.hills else root / "hills.json"
    out_dir = root / "contours"
    out_dir.mkdir(parents=True, exist_ok=True)
    src = Path(args.src)
    data = json.loads(hills_path.read_text())
    wanted = {}
    for hill in data["hills"]:
        if not hill.get("runs"):
            continue
        if args.slug and hill["slug"] != args.slug:
            continue
        wanted[hill["id"]] = {
            "slug": hill["slug"],
            "name": hill["name"],
            "drop": hill.get("drop"),
            "runs": [],
            "lifts": [],
            "stored": [run["p"] for run in hill["runs"][:3]],
            "stored_all": [run["p"] for run in hill["runs"]] if (hill.get("province") or "") in ("eu", "us") else [],
            "drawn": [run["p"] for run in hill["runs"]] + [
                lift if isinstance(lift, str) else (lift.get("p") or "")
                for lift in (hill.get("lifts") or [])
            ],
            "province": hill.get("province") or "",
        }
    if not wanted:
        print("no hills", file=sys.stderr)
        return 1
    print("reading lifts", flush=True)
    print("lifts", absorb(src / "lifts.geojson", wanted, "lifts"), flush=True)
    print("reading runs", flush=True)
    print("runs", absorb(src / "runs.geojson", wanted, "runs"), flush=True)

    forward, back = lambert()
    geo_back = geographic()
    northup = all((hill.get("province") or "") in ("us", "eu") for hill in wanted.values())
    mrdem = None
    if not northup:
        print("opening MRDEM", flush=True)
        mrdem = gdal.Open(MRDEM)
        if mrdem is None:
            print("MRDEM did not open", file=sys.stderr)
            return 1

    index_path = Path(args.index) if args.index else out_dir / "index.json"
    prior = {}
    if index_path.exists():
        prior = json.loads(index_path.read_text()).get("hills") or {}
    if index_path.name == "europe-index.json":
        index = {"source": "Copernicus GLO-30", "fallback": "Copernicus GLO-30", "hills": {}, "skipped": []}
    else:
        index = {"source": "NRCan MRDEM-30 DTM", "fallback": "Copernicus GLO-30", "hills": {}, "skipped": []}
    checked = 0

    def finish_index():
        if index_path.name == "europe-index.json":
            for slug, row in prior.items():
                if slug not in index["hills"]:
                    index["hills"][slug] = row
        index_path.write_text(json.dumps(index, separators=(",", ":")))

    if northup and args.jobs > 1 and not args.slug:
        from concurrent.futures import ProcessPoolExecutor

        tasks = []
        for hill in wanted.values():
            if not hill["runs"]:
                index["skipped"].append({"slug": hill["slug"], "reason": "no source runs"})
                continue
            to_px, _to_ll, _span, _box = projection(hill["runs"])
            if not frame_ok(hill, to_px):
                if hill.get("province") == "eu":
                    index["skipped"].append({"slug": hill["slug"], "reason": "projection mismatch"})
                    print("projection mismatch", hill["slug"], flush=True)
                    continue
                print("projection mismatch", hill["slug"], file=sys.stderr)
                return 1
            checked += 1
            tasks.append({
                "slug": hill["slug"],
                "runs": hill["runs"],
                "drawn": hill["drawn"],
                "drop": hill.get("drop"),
                "recorded": (prior.get(hill["slug"]) or {}).get("m"),
                "dest": str(out_dir / f"{hill['slug']}.json"),
            })
        print("us hills", len(tasks), "jobs", args.jobs, flush=True)
        with ProcessPoolExecutor(max_workers=args.jobs) as pool:
            for result in pool.map(render_us, tasks):
                slug = result["slug"]
                if result.get("skipped"):
                    index["skipped"].append({"slug": slug, "reason": result["skipped"]})
                    print("skip", slug, result["skipped"], result.get("error") or "", flush=True)
                    continue
                index["hills"][slug] = {"m": result["m"], "src": result["src"], "lines": result["lines"], "points": result["points"]}
                print(
                    f"{slug} {result['m']}m {result['src']} lines={result['lines']} pts={result['points']} bytes={result['bytes']}",
                    flush=True,
                )
        if not args.slug:
            finish_index()
        print("checked", checked, "contoured", len(index["hills"]), "skipped", len(index["skipped"]))
        return 0
    for oid, hill in wanted.items():
        if not hill["runs"]:
            index["skipped"].append({"slug": hill["slug"], "reason": "no source runs"})
            continue
        to_px, to_ll, span, _box = projection(hill["runs"])
        if not frame_ok(hill, to_px):
            if hill.get("province") == "eu":
                index["skipped"].append({"slug": hill["slug"], "reason": "projection mismatch"})
                print("projection mismatch", hill["slug"], flush=True)
                continue
            print("projection mismatch", hill["slug"], file=sys.stderr)
            return 1
        checked += 1
        wide, pixel_window = square_frame(parse_stored(hill["drawn"]), to_ll)
        if args.slug:
            print("frame", [round(v, 1) for v in pixel_window], "ll", [round(v, 5) for v in wide], "span", round(span), flush=True)
        tif = Path("/tmp") / f"sh-dem-{hill['slug']}.tif"
        # US plan sheets stay north-up. The Canada path below is unchanged.
        if hill.get("province") in ("us", "eu"):
            source = "glo-30"
            back_hill = geo_back
            try:
                clip_copernicus_northup(wide, tif)
                rng = raster_range(tif)
            except RuntimeError as exc:
                print("glo-30 failed", hill["slug"], exc, flush=True)
                rng = None
        else:
            back_hill = back
            bounds = window_3979(forward, *wide, 0)
            source = "mrdem-30"
            try:
                clip_mrdem(mrdem, bounds, tif)
                rng = raster_range(tif)
            except RuntimeError as exc:
                print("mrdem failed", hill["slug"], exc, flush=True)
                rng = None
            if rng is None:
                source = "glo-30"
                try:
                    clip_copernicus(wide, tif)
                    rng = raster_range(tif)
                except RuntimeError as exc:
                    print("glo-30 failed", hill["slug"], exc, flush=True)
                    rng = None
        if rng is None:
            index["skipped"].append({"slug": hill["slug"], "reason": "no elevation"})
            print("skip", hill["slug"], flush=True)
            if tif.exists():
                tif.unlink()
            continue
        recorded = prior.get(hill["slug"], {}).get("m")
        recorded = M_OVERRIDE.get(hill["slug"], recorded)
        if hill["slug"] in M_OVERRIDE or recorded in (20, 50):
            interval = recorded
        else:
            interval = 50 if isinstance(hill["drop"], (int, float)) and hill["drop"] > 1000 else 20
        try:
            raw = contour_lines(tif, interval, back_hill)
        except RuntimeError as exc:
            index["skipped"].append({"slug": hill["slug"], "reason": "contour failed"})
            print("contour failed", hill["slug"], exc, flush=True)
            if tif.exists():
                tif.unlink()
            continue
        stored, npts = store_lines(raw, to_px, pixel_window)
        if hill["slug"] not in M_OVERRIDE and recorded not in (20, 50) and interval == 20 and (npts > DENSE_POINTS or len(stored) > DENSE_LINES):
            interval = 50
            raw = contour_lines(tif, interval, back_hill)
            stored, npts = store_lines(raw, to_px, pixel_window)
        if tif.exists():
            tif.unlink()
        if len(stored) < 2:
            index["skipped"].append({"slug": hill["slug"], "reason": "flat"})
            print("flat", hill["slug"], flush=True)
            continue
        payload = {"m": interval, "src": source, "lines": stored}
        dest = out_dir / f"{hill['slug']}.json"
        dest.write_text(json.dumps(payload, separators=(",", ":")))
        index["hills"][hill["slug"]] = {"m": interval, "src": source, "lines": len(stored), "points": npts}
        print(
            f"{hill['slug']} {interval}m {source} lines={len(stored)} pts={npts} bytes={dest.stat().st_size}",
            flush=True,
        )
    if not args.slug:
        finish_index()
    print("checked", checked, "contoured", len(index["hills"]), "skipped", len(index["skipped"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
