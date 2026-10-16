#!/usr/bin/env python3
"""Build lazy contour files for the Ski Hills drawings.

Reads OpenSkiMap run and lift geometry (the same local GeoJSON used to
build hills.json) and NRCan's MRDEM-30 digital terrain model. Contours
are generated with gdal_contour at 20 m, or 50 m where the vertical drop
is over 1000 m or a 20 m set is too dense. Vertices are projected with
the same equirectangular transform as the runs in hills.json, rounded to
0.1 viewBox units. Copernicus GLO-30 is used only when MRDEM has no
elevation for that window.

hills.json is not modified.

    python3 ski-hills/build-contours.py --src /tmp/ski
"""
import argparse
import json
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

MRDEM = "/vsicurl/https://canelevation-dem.s3.ca-central-1.amazonaws.com/mrdem-30/mrdem-30-dtm.tif"
PAD = 48
SIZE = 1000 - PAD * 2
# A 20 m sheet is too dense past this many stored vertices.
DENSE_POINTS = 14000
DENSE_LINES = 220


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

    return to_px, span, (min(lons), min(lats), max(lons), max(lats))


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


def expand_ll(box, meters):
    minlon, minlat, maxlon, maxlat = box
    mid = (minlat + maxlat) / 2
    dlat = meters / 110540
    dlon = meters / (111320 * max(math.cos(mid * math.pi / 180), 0.2))
    return minlon - dlon, minlat - dlat, maxlon + dlon, maxlat + dlat


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


def store_lines(lines, to_px):
    kept = []
    points = 0
    for line in lines:
        cmd = []
        last = None
        for i, (lon, lat) in enumerate(line):
            px, py = to_px(lon, lat)
            if px < -160 or px > 1160 or py < -160 or py > 1160:
                if len(cmd) >= 2:
                    kept.append(" ".join(cmd))
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
            cmd.append(f"{pair[0]:.1f},{pair[1]:.1f}")
            last = pair
        if len(cmd) >= 2:
            kept.append(" ".join(cmd))
            points += len(cmd)
    return kept, points


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--src", default="/tmp/ski", help="Directory with runs.geojson and lifts.geojson")
    parser.add_argument("--hills", default="", help="Path to hills.json")
    parser.add_argument("--slug", default="", help="Build one hill, for a check")
    parser.add_argument("--index", default="", help="Index path. Default contours/index.json")
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
        }
    if not wanted:
        print("no hills", file=sys.stderr)
        return 1
    print("reading lifts", flush=True)
    print("lifts", absorb(src / "lifts.geojson", wanted, "lifts"), flush=True)
    print("reading runs", flush=True)
    print("runs", absorb(src / "runs.geojson", wanted, "runs"), flush=True)

    forward, back = lambert()
    print("opening MRDEM", flush=True)
    mrdem = gdal.Open(MRDEM)
    if mrdem is None:
        print("MRDEM did not open", file=sys.stderr)
        return 1

    index = {"source": "NRCan MRDEM-30 DTM", "fallback": "Copernicus GLO-30", "hills": {}, "skipped": []}
    checked = 0
    for oid, hill in wanted.items():
        if not hill["runs"]:
            index["skipped"].append({"slug": hill["slug"], "reason": "no source runs"})
            continue
        to_px, span, box = projection(hill["runs"])
        drawn = draw_lines(hill["runs"][:3], to_px)
        if drawn != hill["stored"]:
            print("projection mismatch", hill["slug"], file=sys.stderr)
            print("stored", hill["stored"][0][:80] if hill["stored"] else None, file=sys.stderr)
            print("drawn", drawn[0][:80] if drawn else None, file=sys.stderr)
            return 1
        checked += 1
        margin = max(160.0, min(500.0, span * 0.08))
        wide = expand_ll(box, margin)
        bounds = window_3979(forward, *wide, 0)
        tif = Path("/tmp") / f"sh-dem-{hill['slug']}.tif"
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
        interval = 50 if isinstance(hill["drop"], (int, float)) and hill["drop"] > 1000 else 20
        try:
            raw = contour_lines(tif, interval, back)
        except RuntimeError as exc:
            index["skipped"].append({"slug": hill["slug"], "reason": "contour failed"})
            print("contour failed", hill["slug"], exc, flush=True)
            if tif.exists():
                tif.unlink()
            continue
        stored, npts = store_lines(raw, to_px)
        if interval == 20 and (npts > DENSE_POINTS or len(stored) > DENSE_LINES):
            interval = 50
            raw = contour_lines(tif, interval, back)
            stored, npts = store_lines(raw, to_px)
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
        index_path = Path(args.index) if args.index else out_dir / "index.json"
        index_path.write_text(json.dumps(index, separators=(",", ":")))
    print("checked", checked, "contoured", len(index["hills"]), "skipped", len(index["skipped"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
