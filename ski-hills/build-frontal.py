#!/usr/bin/env python3
"""Front-facing trail maps.

Orthographic view. Each hill sets elevation, degrees above the horizon.
Pitch, the tilt up from a flat plan, is 90 minus elevation, so 0 elevation
is a side view and 90 is top-down. Cypress is elevation 15 (pitch 75).
Grass Mountain stays at elevation 73, which is the old pitch of 17.
Heights are stretched 1.5x. Ground depth toward the camera is stretched
by DEPTH_SCALE before projection, so a fixed 20 m interval opens on
gentle slopes and stays tight on steep ones. Cypress uses 2; Grass stays 1.
20 m contours are projected at their true elevation in metres, the same
unit as the ground, stretched 1.5x. Nearer ground hides lines behind it.
There is no filled shade and no drawn silhouette: the paper stays white.
A far contour loses to terrain a short depth in front of it, and stops
just under that ridge. Visibility has to hold for a few pixels, so a
contour stays one solid stroke. Runs sit a few metres above the surface.
Lifts sit higher and are the only dashed strokes. No labels.

Facing is the compass bearing the camera looks, in degrees clockwise from
north. 0 looks due north: the viewer stands south of the hill, west is on the
left, east is on the right. It is not a math angle from east, and it is not
the downhill aspect. 335 looked up Cypress's fall line, 25° west of north.
Default camera facing, for a hill with no hand-set facing: point toward the
flattest side, the side that shows the most runs, same as the plan map.
fall_line weights the downhill direction by run length, then orient() turns
the summit away from the viewer. Hand-set facings are passed in radians and
are not flipped: Cypress 0, Grass Mountain 0. Only those two are rendered.
Contours use a wider DEM and fade softly at the frame edge.

    python3 ski-hills/build-frontal.py
"""
import bisect
import json
import math
import struct
from pathlib import Path

from osgeo import gdal

gdal.SetConfigOption("GDAL_HTTP_TIMEOUT", "60")
gdal.SetConfigOption("GDAL_HTTP_MAX_RETRY", "1")
gdal.SetConfigOption("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY")
gdal.SetConfigOption("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif,.TIF")

ROOT = Path(__file__).resolve().parent
GEOM = Path("/tmp/cypress-geom.json")
# Wider than the old tight crop so the contour field reaches the frame.
DEM = Path("/tmp/cypress-dem-wide.tif")
Z_SCALE = 1.5
# Ground depth (yr, toward the camera) is multiplied by this before
# projection. 1 is true scale. Cypress sets 2 so contour spacing tracks
# slope instead of the vertical stretch. Grass stays at 1.
DEPTH_SCALE = 2.0
# Metres. The occlusion test looks at terrain this far in front of a
# contour, so the near slope wins a near tie. Coordinates are not moved.
DEPTH_BIAS = 40.0
# Pixels under the near skyline. Screen y grows downward. Clipping only:
# nothing is stroked along the skyline.
RIDGE_MARGIN = 1.75
# Path length, in px. Samples sit about 5 px apart, so a 3 px hold never
# contains a whole skyline flicker. 12 px is the short gap or speck we
# refuse to toggle; a longer hidden run still ends in one place.
MIN_RUN = 12.0
LIFT_CLEAR = 12.0
# Runs clear the contour ink, and stay under the lifts.
RUN_CLEAR = 7.0
CONTOUR_M = 20
# Was 0.85. About 22% thinner, every contour including the 100 m steps.
# Runs stay 2.2 and lifts stay 1.7.
CONTOUR_W = 0.66
COLS = 110
ROWS = 72
# facing: look azimuth, degrees clockwise from north. 0 is due north.
# elevation: camera degrees above the horizon. pitch = 90 - elevation
# is the tilt up from a flat plan (0 top-down, 90 a pure side view).
# Grass Mountain's elevation 73 is the previous pitch of 17, unchanged.
# Not passed through orient(), which would flip a hand-set facing 180°.
CAMERAS = {
    "cypress-mountain": {"facing": 0.0, "elevation": 15.0, "depth_scale": DEPTH_SCALE},
    "grass-mountain": {"facing": 0.0, "elevation": 73.0, "depth_scale": 1.0},
}


def load_geom():
    data = json.loads(GEOM.read_text())
    return data["runs"], data["lifts"]


def wide_box(runs, lifts):
    """DEM crop about 3x the run extent, so topo continues past the frame."""
    pts = [p for item in runs + lifts for line in item["lines"] for p in line]
    lons = [p[0] for p in pts]
    lats = [p[1] for p in pts]
    span_lon = max(lons) - min(lons)
    span_lat = max(lats) - min(lats)
    pad_lon = span_lon * 1.0
    pad_lat = span_lat * 1.0
    return min(lons) - pad_lon, min(lats) - pad_lat, max(lons) + pad_lon, max(lats) + pad_lat


def ensure_dem(box):
    if DEM.exists() and DEM.stat().st_size > 1000:
        return
    minlon, minlat, maxlon, maxlat = box
    src = "/vsicurl/https://canelevation-dem.s3.ca-central-1.amazonaws.com/mrdem-30/mrdem-30-dtm.tif"
    try:
        gdal.Warp(
            str(DEM),
            src,
            format="GTiff",
            outputBounds=[minlon, minlat, maxlon, maxlat],
            outputBoundsSRS="EPSG:4326",
            dstSRS="EPSG:4326",
            xRes=0.00035,
            yRes=0.00035,
            resampleAlg="bilinear",
        )
        return
    except Exception as err:
        print("mrdem failed", err)
    url = (
        "https://copernicus-dem-30m.s3.eu-central-1.amazonaws.com/"
        "Copernicus_DSM_COG_10_N49_00_W123_00_DEM/"
        "Copernicus_DSM_COG_10_N49_00_W123_00_DEM.tif"
    )
    gdal.Warp(
        str(DEM),
        "/vsicurl/" + url,
        format="GTiff",
        outputBounds=[minlon, minlat, maxlon, maxlat],
        outputBoundsSRS="EPSG:4326",
        dstSRS="EPSG:4326",
        xRes=0.00035,
        yRes=0.00035,
        resampleAlg="bilinear",
    )


def read_grid():
    ds = gdal.Open(str(DEM))
    band = ds.GetRasterBand(1)
    w, h = band.XSize, band.YSize
    nodata = band.GetNoDataValue()
    gt = ds.GetGeoTransform()
    raw = band.ReadRaster(0, 0, w, h, w, h, gdal.GDT_Float32)
    vals = struct.unpack(f"<{w * h}f", raw)
    arr = []
    for r in range(h):
        row = []
        for c in range(w):
            z = vals[r * w + c]
            if (nodata is not None and z == nodata) or z < -100 or z != z:
                z = float("nan")
            row.append(z)
        arr.append(row)
    for _ in range(6):
        nxt = [row[:] for row in arr]
        missing = False
        for r in range(h):
            for c in range(w):
                if arr[r][c] == arr[r][c]:
                    continue
                missing = True
                acc = cnt = 0.0
                for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    rr, cc = r + dr, c + dc
                    if 0 <= rr < h and 0 <= cc < w and arr[rr][cc] == arr[rr][cc]:
                        acc += arr[rr][cc]
                        cnt += 1
                if cnt:
                    nxt[r][c] = acc / cnt
        arr = nxt
        if not missing:
            break
    # One light blur so ridge lines don't chatter on 30 m noise.
    blurred = [row[:] for row in arr]
    for r in range(1, h - 1):
        for c in range(1, w - 1):
            acc = 0.0
            for dr in (-1, 0, 1):
                for dc in (-1, 0, 1):
                    acc += arr[r + dr][c + dc]
            blurred[r][c] = acc / 9.0
    return blurred, gt


def sample(arr, gt, lon, lat):
    col = (lon - gt[0]) / gt[1]
    row = (lat - gt[3]) / gt[5]
    h, w = len(arr), len(arr[0])
    if col < 0 or row < 0 or col >= w - 1 or row >= h - 1:
        return None
    c0, r0 = int(col), int(row)
    fx, fy = col - c0, row - r0
    vals = [
        arr[r0][c0],
        arr[r0][c0 + 1],
        arr[r0 + 1][c0],
        arr[r0 + 1][c0 + 1],
    ]
    if any(v != v for v in vals):
        return None
    return (
        vals[0] * (1 - fx) * (1 - fy)
        + vals[1] * fx * (1 - fy)
        + vals[2] * (1 - fx) * fy
        + vals[3] * fx * fy
    )


def default_facing(arr, gt, runs):
    """Facing in radians for a hill that has no hand-set camera.

    Points toward the flattest side, the side that shows the most runs, using
    the same weighting as the plan map. build() still runs orient() on this
    result so the summit sits away from the viewer. Cypress and Grass
    Mountain are hand-set to 0 (look north) and do not use this path.
    """
    return fall_line(arr, gt, runs)


def fall_line(arr, gt, runs):
    h = len(arr)
    midlat = gt[3] + (h * gt[5]) / 2
    cos = math.cos(midlat * math.pi / 180)
    vx = vy = wt = 0.0
    for run in runs:
        for line in run["lines"]:
            prev = None
            for lon, lat in line:
                z = sample(arr, gt, lon, lat)
                cur = (lon, lat, z)
                if prev and prev[2] is not None and z is not None and abs(prev[2] - z) > 1:
                    if prev[2] > z:
                        a, b = prev, cur
                    else:
                        a, b = cur, prev
                    dx = (b[0] - a[0]) * 111320 * cos
                    dy = (b[1] - a[1]) * 110540
                    length = math.hypot(dx, dy)
                    if length > 1:
                        vx += dx
                        vy += dy
                        wt += length
                prev = cur
    if wt < 1:
        return 0.0
    return math.atan2(-vx / wt, -vy / wt)


def marching_contours(arr, gt, interval):
    h, w = len(arr), len(arr[0])
    flat = [arr[r][c] for r in range(h) for c in range(w) if arr[r][c] == arr[r][c]]
    if len(flat) < 10:
        return []
    z0 = interval * math.ceil((min(flat) + 0.01) / interval)
    z1 = interval * math.floor((max(flat) - 0.01) / interval)
    levels = []
    level = z0
    while level <= z1 + 0.01:
        levels.append(level)
        level += interval
    buckets = {lv: [] for lv in levels}

    def edge_point(va, vb, c0, r0, c1, r1, elev):
        if va == vb or (va < elev) == (vb < elev):
            return None
        t = (elev - va) / (vb - va)
        lon0 = gt[0] + c0 * gt[1]
        lat0 = gt[3] + r0 * gt[5]
        lon1 = gt[0] + c1 * gt[1]
        lat1 = gt[3] + r1 * gt[5]
        return (lon0 + (lon1 - lon0) * t, lat0 + (lat1 - lat0) * t)

    for r in range(h - 1):
        for c in range(w - 1):
            cell = (arr[r][c], arr[r][c + 1], arr[r + 1][c + 1], arr[r + 1][c])
            if any(v != v for v in cell):
                continue
            lo, hi = min(cell), max(cell)
            for elev in levels:
                if elev < lo or elev > hi:
                    continue
                hits = []
                corners = (
                    (0, 1, c, r, c + 1, r),
                    (1, 2, c + 1, r, c + 1, r + 1),
                    (2, 3, c + 1, r + 1, c, r + 1),
                    (3, 0, c, r + 1, c, r),
                )
                for a, b, c0, r0, c1, r1 in corners:
                    pt = edge_point(cell[a], cell[b], c0, r0, c1, r1, elev)
                    if pt:
                        hits.append(pt)
                if len(hits) == 2:
                    buckets[elev].append(hits)
                elif len(hits) == 4:
                    mid = sum(cell) / 4
                    if (cell[0] >= elev) == (mid >= elev):
                        buckets[elev].append([hits[0], hits[1]])
                        buckets[elev].append([hits[2], hits[3]])
                    else:
                        buckets[elev].append([hits[0], hits[3]])
                        buckets[elev].append([hits[1], hits[2]])
    lines = []
    for elev, segs in buckets.items():
        lines.extend((elev, line) for line in stitch(segs) if len(line) >= 2)
    return lines


def stitch(segments):
    def key(p):
        return (round(p[0], 5), round(p[1], 5))

    links = {}
    for a, b in segments:
        ka, kb = key(a), key(b)
        if ka == kb:
            continue
        links.setdefault(ka, []).append(kb)
        links.setdefault(kb, []).append(ka)
    used = set()

    def edge(a, b):
        return (a, b) if a <= b else (b, a)

    lines = []
    for start in list(links):
        for nxt in links[start]:
            if edge(start, nxt) in used:
                continue
            path = [start]
            prev, cur = start, nxt
            used.add(edge(prev, cur))
            path.append(cur)
            while True:
                choices = [n for n in links.get(cur, []) if edge(cur, n) not in used]
                if not choices:
                    break
                nxt = choices[0]
                used.add(edge(cur, nxt))
                prev, cur = cur, nxt
                path.append(cur)
                if cur == start:
                    break
            if len(path) >= 2:
                lines.append([(p[0], p[1]) for p in path])
    return lines


def _path_dist(pts):
    dist = [0.0] * len(pts)
    for i in range(1, len(pts)):
        dist[i] = dist[i - 1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    return dist


def solid_flags(flags, pts):
    """Hold visibility so a contour is not chopped into dashes.

    A one-sample spike is skyline noise. A hidden gap or a visible piece
    shorter than MIN_RUN pixels is not a real change either: short gaps
    stay drawn, short pieces stay hidden, and a long occluded run ends
    where it actually goes behind the nearer slope.
    """
    n = len(flags)
    if n < 2:
        return flags
    flags = list(flags)
    if n >= 3:
        cleaned = flags[:]
        for i in range(1, n - 1):
            if flags[i - 1] == flags[i + 1] and flags[i] != flags[i - 1]:
                cleaned[i] = flags[i - 1]
        flags = cleaned
    dist = _path_dist(pts)
    for _ in range(8):
        runs = []
        start = 0
        for i in range(1, n + 1):
            if i == n or flags[i] != flags[start]:
                left = dist[start - 1] if start > 0 else dist[0]
                right = dist[i] if i < n else dist[n - 1]
                runs.append((start, i, flags[start], right - left))
                start = i
        changed = False
        new = flags[:]
        for ri, (s, e, flag, length) in enumerate(runs):
            if length >= MIN_RUN:
                continue
            left = runs[ri - 1] if ri else None
            right = runs[ri + 1] if ri + 1 < len(runs) else None
            if left and right and left[2] == right[2]:
                adopt = left[2]
            elif left and right:
                adopt = left[2] if left[3] >= right[3] else right[2]
            elif left and left[3] >= MIN_RUN:
                adopt = left[2]
            elif right and right[3] >= MIN_RUN:
                adopt = right[2]
            else:
                continue
            if adopt != flag:
                for i in range(s, e):
                    new[i] = adopt
                changed = True
        flags = new
        if not changed:
            break
    return flags


def project_contours(arr, gt, paper, project_xy, metres, rot, horizon_at, col_of):
    """Contours across the whole DEM. Nearer ground hides the back.

    A point is hidden only when terrain DEPTH_BIAS metres in front of it
    stands above it. The line stops RIDGE_MARGIN pixels under that
    skyline. Coordinates are not moved, and nothing is drawn along the
    skyline. Visibility is then held for MIN_RUN pixels so a facing
    contour stays one solid stroke.
    """
    raw = marching_contours(arr, gt, CONTOUR_M)
    hidden = 0
    chunks = []
    for elev, line in raw:
        if len(line) < 2:
            continue
        chunk = []

        def flush():
            nonlocal chunk
            if len(chunk) >= 2:
                chunks.append(chunk)
            chunk = []

        for lon, lat in line:
            xr, yr = rot(*metres(lon, lat))
            px, py = paper(*project_xy(xr, yr, elev))
            if px < -220 or px > 1220 or py < -220 or py > 1220:
                flush()
                continue
            crest, cdepth = horizon_at(yr)
            i = col_of(px)
            top = crest[i]
            # Only terrain DEPTH_BIAS metres in front can hide this point,
            # and the line stops RIDGE_MARGIN px under that skyline. A nearer
            # bump that is not that far in front used to flip vertex to vertex
            # and draw the facing slope as dashes. Coordinates are not moved.
            hide = (
                top < 1e8
                and yr - cdepth[i] >= DEPTH_BIAS
                and py >= top - RIDGE_MARGIN
            )
            if hide:
                hidden += 1
            chunk.append((px, py, yr, hide))
        flush()

    drawn = []
    seen = set()
    kept = 0
    for chunk in chunks:
        flags = solid_flags([hide for (_px, _py, _yr, hide) in chunk], chunk)
        part = []
        depth = None

        def flush_part():
            nonlocal part, depth, kept
            if len(part) >= 2:
                length = 0.0
                for a, b in zip(part, part[1:]):
                    length += math.hypot(b[0] - a[0], b[1] - a[1])
                # A piece shorter than the hold is the same flicker, drawn
                # as a dot. A real visible run is longer and stays solid.
                if length < MIN_RUN:
                    part = []
                    depth = None
                    return
                sig = tuple((round(p[0], 1), round(p[1], 1)) for p in part)
                rev = tuple(reversed(sig))
                if sig not in seen and rev not in seen:
                    seen.add(sig)
                    drawn.append((depth, part))
                    kept += len(part)
            part = []
            depth = None

        for (px, py, yr, _hide), flag in zip(chunk, flags):
            if flag:
                flush_part()
                continue
            if depth is None:
                depth = yr
            part.append((px, py))
        flush_part()
    print("occlusion", "kept", kept, "hidden", hidden, "lines", len(drawn))
    return drawn


def build(arr, gt, runs, lifts, facing, lock_facing=False, out_path=None, slug="hill", elevation=73.0, z_scale=None, depth_scale=1.0):
    h, w = len(arr), len(arr[0])
    midlat = gt[3] + (h * gt[5]) / 2
    cos = math.cos(midlat * math.pi / 180)
    minlon, maxlat = gt[0], gt[3]
    maxlon = minlon + w * gt[1]
    minlat = maxlat + h * gt[5]
    origin_lon = (minlon + maxlon) / 2
    origin_lat = (minlat + maxlat) / 2
    m_lon = 111320 * cos
    m_lat = 110540

    def metres(lon, lat):
        return (lon - origin_lon) * m_lon, (lat - origin_lat) * m_lat

    def unmetres(x, y):
        return origin_lon + x / m_lon, origin_lat + y / m_lat

    ang = facing
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

    # Hand-set facings stay as given. A default facing is flipped when the
    # summit would otherwise sit on the near side.
    if lock_facing:
        ca, sa = math.cos(ang), math.sin(ang)
    elif not orient(ang):
        ang += math.pi
        orient(ang)

    # Ground window from the runs, so the resort fills the square.
    run_xy = []
    for run in runs:
        for line in run["lines"]:
            for lon, lat in line:
                run_xy.append(rot(*metres(lon, lat)))
    rxs = [p[0] for p in run_xy]
    rys = [p[1] for p in run_xy]
    pad_x = (max(rxs) - min(rxs)) * 0.06
    pad_y = (max(rys) - min(rys)) * 0.08
    gx0, gx1 = min(rxs) - pad_x, max(rxs) + pad_x
    gy0, gy1 = min(rys) - pad_y, max(rys) + pad_y

    # elevation is degrees above the horizon. pitch tilts up from a flat plan.
    pitch_rad = math.radians(90.0 - elevation)
    scale = Z_SCALE if z_scale is None else z_scale
    depth = depth_scale

    def project_xy(xr, yr, z):
        # xr, yr and z are metres. z is the real elevation, not a 0–1 fraction.
        # depth stretches yr only, so gentle slopes (large ground run per
        # contour) open up and steep slopes stay packed.
        return xr, yr * depth * math.cos(pitch_rad) + z * scale * math.sin(pitch_rad)

    grid = []
    for ri in range(ROWS):
        yr = gy0 + (gy1 - gy0) * ri / (ROWS - 1)
        line = []
        for ci in range(COLS):
            xr = gx0 + (gx1 - gx0) * ci / (COLS - 1)
            lon, lat = unmetres(*unrot(xr, yr))
            z = sample(arr, gt, lon, lat)
            if z is None:
                line.append(None)
                continue
            sx, sy = project_xy(xr, yr, z)
            line.append((sx, sy, z, xr, yr))
        grid.append(line)

    cells = [cell for line in grid for cell in line if cell]
    if len(cells) < 20:
        raise SystemExit("dem empty")
    xs = [c[0] for c in cells]
    ys = [c[1] for c in cells]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    # Fit the whole projection to the sheet. Depth scale 2 makes that
    # projection nearly square, so the topo reaches the card edges
    # instead of sitting in a white gutter. The page caption is painted
    # over the bottom band. Uniform scale: x and y stay true.
    margin = 4
    view = 1000 - 2 * margin
    data_w = max(maxx - minx, 1)
    data_h = max(maxy - miny, 1)
    fit = min(view / data_w, view / data_h)
    pad_x = (1000 - data_w * fit) / 2
    pad_y = (1000 - data_h * fit) / 2

    def paper(sx, sy):
        px = pad_x + (sx - minx) * fit
        py = pad_y + (maxy - sy) * fit
        return px, py

    bins = 2000
    empty_py = [1e9] * bins
    empty_depth = [0.0] * bins

    def col_of(px):
        i = int(px / 1000 * (bins - 1))
        return max(0, min(bins - 1, i))

    # Every DEM sample in the resort window. Contours are interpolated
    # between these samples, so they cannot sit above this skyline.
    samples = []
    for r in range(h):
        lat = maxlat + (r + 0.5) * gt[5]
        for c in range(w):
            z = arr[r][c]
            if z != z:
                continue
            lon = minlon + (c + 0.5) * gt[1]
            xr, yr = rot(*metres(lon, lat))
            if xr < gx0 or xr > gx1 or yr < gy0 or yr > gy1:
                continue
            samples.append((yr, paper(*project_xy(xr, yr, z))))
    samples.sort()
    step = 8.0
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
            # Bridge one DEM cell. A wider gap is a real break in the ridge.
            if gap <= 0 or gap > 18:
                continue
            steps = max(1, int(gap))
            for k in range(1, steps):
                t = k / steps
                paint(ax + (bx - ax) * t, ay + (by - ay) * t, ayr + (byr - ayr) * t)
        if row:
            paint(*row[-1])

    def horizon_at(yr):
        # Skyline of samples strictly nearer than this depth. Comparison only.
        idx = bisect.bisect_right(snap_yr, yr) - 1
        if idx < 0:
            return empty_py, empty_depth
        return snap_py[idx], snap_depth[idx]

    contours = project_contours(
        arr, gt, paper, project_xy, metres, rot, horizon_at, col_of
    )

    def stroke(lines, colour, width, z_add=0.0, dash=None, css_class=None):
        parts = []
        # Dash lives on the element that asks for it. Everything else is
        # explicitly solid so a lift dash cannot inherit onto contours.
        dash_value = dash if dash else "none"
        klass = f' class="{css_class}"' if css_class else ""
        for line in lines:
            sampled = []
            chunks = []
            for lon, lat in line:
                z = sample(arr, gt, lon, lat)
                if z is None:
                    if len(sampled) >= 2:
                        chunks.append(sampled)
                    sampled = []
                    continue
                xr, yr = rot(*metres(lon, lat))
                # Lifts are not occlusion-tested against their own slope.
                px, py = paper(*project_xy(xr, yr, z + z_add))
                sampled.append((px, py))
            if len(sampled) >= 2:
                chunks.append(sampled)
            for chunk in chunks:
                pts = " ".join(f"{p[0]:.1f},{p[1]:.1f}" for p in chunk)
                parts.append(
                    f'<polyline{klass} points="{pts}" fill="none" stroke="{colour}" '
                    f'style="fill:none;stroke:{colour};stroke-width:{width};'
                    f"stroke-dasharray:{dash_value};"
                    f'stroke-linejoin:round;stroke-linecap:round;vector-effect:none"/>'
                )
        return parts

    colours = {
        "novice": "#1b7a32",
        "easy": "#1b7a32",
        "intermediate": "#1a4f9c",
        "advanced": "#111",
        "expert": "#111",
        "freeride": "#111",
        "extreme": "#111",
    }
    run_parts = []
    for run in runs:
        colour = colours.get(run.get("difficulty") or "", "#8a8a8a")
        run_parts.extend(stroke(run["lines"], colour, 2.2, z_add=RUN_CLEAR, css_class="sh-frontal-run"))
    lift_parts = []
    for lift in lifts:
        lift_parts.extend(
            stroke(lift["lines"], "#111", 1.7, z_add=LIFT_CLEAR, dash="6 4", css_class="sh-frontal-lift")
        )

    if not contours:
        raise SystemExit("no contours")
    front = min(item[0] for item in contours)
    back = max(item[0] for item in contours)
    span_d = max(back - front, 1)
    fade_id = "sh-fade-" + slug
    mask_id = "sh-contour-fade-" + slug
    contour_xml = []
    for yr, line in sorted(contours, key=lambda item: -item[0]):
        # Farther up the hill is paler. The near face is a little darker.
        t = (yr - front) / span_d
        opacity = 0.50 - t * 0.26
        pts = " ".join(f"{p[0]:.1f},{p[1]:.1f}" for p in line)
        contour_xml.append(
            f'<polyline class="sh-frontal-contour" points="{pts}" fill="none" stroke="#000" '
            f'stroke-opacity="{opacity:.3f}" stroke-width="{CONTOUR_W}" '
            f'style="fill:none;stroke:#000;stroke-opacity:{opacity:.3f};'
            f'stroke-width:{CONTOUR_W};stroke-dasharray:none;'
            f'stroke-linejoin:round;stroke-linecap:round;vector-effect:none"/>'
        )
    # Soft rectangular fade. The blur eats the hard edge of the wider field.
    defs = (
        "<defs>\n"
        f'<filter id="{fade_id}" x="-25%" y="-25%" width="150%" height="150%">\n'
        '<feGaussianBlur stdDeviation="42"/>\n'
        "</filter>\n"
        f'<mask id="{mask_id}" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="1000">\n'
        '<rect x="0" y="0" width="1000" height="1000" fill="#000"/>\n'
        f'<rect x="8" y="8" width="984" height="984" fill="#fff" filter="url(#{fade_id})"/>\n'
        "</mask>\n"
        "</defs>\n"
    )
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">\n'
        '<g class="sh-frontal-art">\n'
        f"{defs}\n"
        f'<g mask="url(#{mask_id})">\n' + "\n".join(contour_xml) + "\n</g>\n"
        + "\n".join(run_parts)
        + "\n"
        + "\n".join(lift_parts)
        + "\n</g>\n</svg>\n"
    )
    dest = Path(out_path) if out_path else (ROOT / "frontal" / f"{slug}.svg")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(svg)
    az = round(math.degrees(ang) % 360, 1)
    print(
        "wrote",
        dest,
        "bytes",
        dest.stat().st_size,
        "facing_deg",
        az,
        "elevation_deg",
        elevation,
        "pitch_deg",
        round(math.degrees(pitch_rad), 1),
        "z_scale",
        scale,
        "depth_scale",
        depth,
        "aspect",
        round((maxy - miny) / max(maxx - minx, 1), 2),
        "lift_20m",
        round(20 * scale * math.sin(pitch_rad), 2),
        "depth_20m",
        round(20 * depth * math.cos(pitch_rad), 2),
        "contour_w",
        CONTOUR_W,
        "contours",
        len(contours),
        "runs",
        len(run_parts),
        "lifts",
        len(lift_parts),
        "z",
        round(min(c[2] for c in cells)),
        round(max(c[2] for c in cells)),
    )
    return az


def main():
    runs, lifts = load_geom()
    box = wide_box(runs, lifts)
    print("bbox", tuple(round(v, 4) for v in box))
    ensure_dem(box)
    arr, gt = read_grid()
    print("dem", len(arr[0]), len(arr))
    # Kept so a later hill without a hand-set facing still has the rule.
    print("default_facing_deg", round(math.degrees(default_facing(arr, gt, runs)) % 360, 1))
    # Grass stays at elevation 73 (pitch 17) and is not re-rendered.
    slug = "cypress-mountain"
    cam = CAMERAS[slug]
    build(
        arr,
        gt,
        runs,
        lifts,
        math.radians(cam["facing"]),
        lock_facing=True,
        out_path=ROOT / "frontal" / f"{slug}.svg",
        slug=slug,
        elevation=cam["elevation"],
        depth_scale=cam["depth_scale"],
    )


if __name__ == "__main__":
    main()
