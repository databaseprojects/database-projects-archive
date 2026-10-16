#!/usr/bin/env python3
"""Front-facing trail map for one hill.

Orthographic view from the base, 30 degrees above horizontal, looking up the
fall line. Cross-slope ridge lines with hidden parts removed, a light
hillshade, then runs and lifts on the same surface. No labels.

    python3 ski-hills/build-frontal.py
"""
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
SLUG = "cypress-mountain"
GEOM = Path("/tmp/cypress-geom.json")
DEM = Path("/tmp/cypress-dem.tif")
OUT = ROOT / "frontal" / f"{SLUG}.svg"
PITCH = math.radians(30)
COLS = 120
ROWS = 64


def load_geom():
    data = json.loads(GEOM.read_text())
    return data["runs"], data["lifts"]


def bbox(runs, lifts):
    pts = [p for item in runs + lifts for line in item["lines"] for p in line]
    lons = [p[0] for p in pts]
    lats = [p[1] for p in pts]
    pad_lon = (max(lons) - min(lons)) * 0.08
    pad_lat = (max(lats) - min(lats)) * 0.08
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


def build(arr, gt, runs, lifts, facing):
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

    if not orient(ang):
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

    def project_xy(xr, yr, z):
        return xr, yr * math.cos(PITCH) + z * math.sin(PITCH)

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
    span = max(maxx - minx, maxy - miny, 1)
    margin = 56
    extra_x = span - (maxx - minx)
    extra_y = span - (maxy - miny)

    def paper(sx, sy):
        px = margin + (extra_x / 2 + (sx - minx)) / span * (1000 - margin * 2)
        py = margin + (extra_y / 2 + (maxy - sy)) / span * (1000 - margin * 2)
        return px, py

    shades = []
    # Light from the front-left, so the face toward the base stays pale.
    light = (-0.35, -0.25, 0.9)
    ln = math.sqrt(sum(v * v for v in light))
    light = tuple(v / ln for v in light)
    for r in range(len(grid) - 1):
        for c in range(len(grid[0]) - 1):
            cell = [grid[r][c], grid[r][c + 1], grid[r + 1][c], grid[r + 1][c + 1]]
            if any(p is None for p in cell):
                continue
            e1 = (cell[1][3] - cell[0][3], cell[1][4] - cell[0][4], cell[1][2] - cell[0][2])
            e2 = (cell[2][3] - cell[0][3], cell[2][4] - cell[0][4], cell[2][2] - cell[0][2])
            nx = e1[1] * e2[2] - e1[2] * e2[1]
            ny = e1[2] * e2[0] - e1[0] * e2[2]
            nz = e1[0] * e2[1] - e1[1] * e2[0]
            mag = math.sqrt(nx * nx + ny * ny + nz * nz) or 1
            shade = max(0.0, min(1.0, (nx * light[0] + ny * light[1] + nz * light[2]) / mag))
            opacity = 0.012 + (1 - shade) * 0.10
            poly = []
            for p in (cell[0], cell[1], cell[3], cell[2]):
                px, py = paper(p[0], p[1])
                poly.append(f"{px:.1f},{py:.1f}")
            shades.append((opacity, " ".join(poly)))

    horizon = [1e9] * 900

    def col_of(px):
        i = int((px - margin) / (1000 - margin * 2) * (len(horizon) - 1))
        return max(0, min(len(horizon) - 1, i))

    def stamp(px, py):
        i = col_of(px)
        if py < horizon[i]:
            horizon[i] = py

    ridges = []
    for line in grid:
        run = []
        stamped = []
        for cell in line:
            if not cell:
                if len(run) >= 2:
                    ridges.append(run)
                run = []
                continue
            px, py = paper(cell[0], cell[1])
            stamped.append((px, py))
            if py < horizon[col_of(px)] - 0.35:
                run.append((px, py))
            else:
                if len(run) >= 2:
                    ridges.append(run)
                run = []
        if len(run) >= 2:
            ridges.append(run)
        for a, b in zip(stamped, stamped[1:]):
            steps = max(2, int(abs(b[0] - a[0]) / 2))
            for k in range(steps + 1):
                t = k / steps
                stamp(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)

    def stroke(lines, colour, width):
        parts = []
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
                px, py = paper(*project_xy(xr, yr, z))
                sampled.append((px, py))
            if len(sampled) >= 2:
                chunks.append(sampled)
            for chunk in chunks:
                pts = " ".join(f"{p[0]:.1f},{p[1]:.1f}" for p in chunk)
                parts.append(
                    f'<polyline points="{pts}" fill="none" stroke="{colour}" '
                    f'style="fill:none;stroke:{colour};stroke-width:{width};'
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
        run_parts.extend(stroke(run["lines"], colour, 2.2))
    lift_parts = []
    for lift in lifts:
        lift_parts.extend(stroke(lift["lines"], "#111", 1.15))

    shade_xml = "\n".join(
        f'<polygon points="{pts}" fill="#000" fill-opacity="{op:.3f}"/>'
        for op, pts in shades
    )
    ridge_xml = "\n".join(
        '<polyline points="%s" fill="none" stroke="#000" stroke-opacity="0.42" stroke-width="0.9" '
        'style="fill:none;stroke:#000;stroke-opacity:0.42;stroke-width:0.9;'
        'stroke-linejoin:round;stroke-linecap:round;vector-effect:none"/>'
        % " ".join(f"{p[0]:.1f},{p[1]:.1f}" for p in line)
        for line in ridges
    )
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">\n'
        '<g class="sh-frontal-art">\n'
        f"{shade_xml}\n{ridge_xml}\n"
        + "\n".join(run_parts)
        + "\n"
        + "\n".join(lift_parts)
        + "\n</g>\n</svg>\n"
    )
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(svg)
    az = round(math.degrees(ang) % 360, 1)
    print(
        "wrote",
        OUT,
        "bytes",
        OUT.stat().st_size,
        "facing_deg",
        az,
        "ridges",
        len(ridges),
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
    box = bbox(runs, lifts)
    print("bbox", tuple(round(v, 4) for v in box))
    ensure_dem(box)
    arr, gt = read_grid()
    print("dem", len(arr[0]), len(arr))
    hills = json.loads((ROOT / "hills.json").read_text())
    hill = next(item for item in hills["hills"] if item["slug"] == SLUG)
    facing = hill.get("facing")
    if isinstance(facing, (int, float)):
        ang = math.radians(float(facing))
    else:
        ang = fall_line(arr, gt, runs)
    az = build(arr, gt, runs, lifts, ang)
    if hill.get("facing") != az:
        raw = (ROOT / "hills.json").read_text()
        needle = '"slug":"cypress-mountain","stacked":true'
        at = raw.find(needle)
        if at >= 0 and '"facing"' not in raw[at : at + 90]:
            raw = raw.replace(needle, needle + f',"facing":{az}', 1)
            (ROOT / "hills.json").write_text(raw)
            print("stored facing", az)


if __name__ == "__main__":
    main()
