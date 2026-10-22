#!/usr/bin/env python3
"""Build the Alberta ski-hill file from local OpenSkiMap GeoJSON.

Same geometry rules as British Columbia: every run and lift vertex, one
decimal on the 1000-unit drawing. Elevations are OpenSkiMap statistics
(base = minimum, drop = maximum − minimum), rounded to metres. Hills
with no runs are omitted. Unnamed hills are labelled from GPS. No town
or mountain lookups.

Tourism region comes from ski-hills/cd-regions.json: simplified 2021
census divisions, not an official Travel Alberta boundary. Division 15
is Canadian Rockies, 6 is Calgary & Area, 11 is Edmonton & Area,
7–10 are Alberta Central, 1–5 are Alberta South, and the rest are
Alberta North.

    python3 ski-hills/build-alberta.py --src /tmp/ski
"""
import argparse
import json
import math
import re
import unicodedata
from pathlib import Path

import ijson


def slugify(name, oid):
    text = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text or ("hill-" + oid[:8])


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


# A piste area this narrow is the edge of a run, not a trail loop.
# Drawn as a ring it sits on the centreline as a hollow double line.
OUTLINE_WIDTH_M = 80.0
OUTLINE_LENGTH_M = 40.0


def _xy(lon, lat, cos):
    return lon * 111320.0 * cos, lat * 110540.0


def _line_cos(line):
    return math.cos(line[len(line) // 2][1] * math.pi / 180.0)


def _path_length(line):
    cos = _line_cos(line)
    total = 0.0
    prev = None
    for lon, lat in line:
        x, y = _xy(lon, lat, cos)
        if prev is not None:
            total += math.hypot(x - prev[0], y - prev[1])
        prev = (x, y)
    return total


def _ends_meet(line):
    if len(line) < 4:
        return False
    cos = _line_cos(line)
    x1, y1 = _xy(line[0][0], line[0][1], cos)
    x2, y2 = _xy(line[-1][0], line[-1][1], cos)
    return math.hypot(x2 - x1, y2 - y1) < 3.0


def _loop_metrics(line):
    """Width and centreline length of a closed ring, in metres."""
    pts = list(line)
    if _ends_meet(pts):
        pts = pts[:-1]
    if len(pts) < 3:
        return None
    cos = _line_cos(pts)
    xy = [_xy(lon, lat, cos) for lon, lat in pts]
    per = 0.0
    area = 0.0
    for i, (x, y) in enumerate(xy):
        x2, y2 = xy[(i + 1) % len(xy)]
        per += math.hypot(x2 - x, y2 - y)
        area += x * y2 - x2 * y
    if per < 1.0:
        return None
    length = per * 0.5
    return abs(area) * 0.5 / length, length


def _norm_name(name):
    if not name:
        return ""
    text = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def _point_in_ring(lon, lat, ring, cos):
    x, y = _xy(lon, lat, cos)
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = _xy(ring[i][0], ring[i][1], cos)
        xj, yj = _xy(ring[j][0], ring[j][1], cos)
        denom = (yj - yi) or 1e-12
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / denom + xi):
            inside = not inside
        j = i
    return inside


def _bbox(line):
    cos = _line_cos(line)
    xs = []
    ys = []
    for lon, lat in line:
        x, y = _xy(lon, lat, cos)
        xs.append(x)
        ys.append(y)
    return min(xs), min(ys), max(xs), max(ys)


def _bboxes_near(a, b, pad):
    return not (a[2] < b[0] - pad or b[2] < a[0] - pad or a[3] < b[1] - pad or b[3] < a[1] - pad)


def _inside_fraction(line, ring):
    cos = _line_cos(ring)
    step = max(1, len(line) // 16)
    samples = line[::step] or line[:1]
    hit = 0
    for lon, lat in samples:
        if _point_in_ring(lon, lat, ring, cos):
            hit += 1
    return hit / len(samples)


def _centreline(ring):
    """One line down the middle of a thin closed piste."""
    pts = list(ring)
    if _ends_meet(pts):
        pts = pts[:-1]
    if len(pts) < 4:
        return None
    cos = _line_cos(pts)
    xy = [_xy(lon, lat, cos) for lon, lat in pts]
    seg = []
    total = 0.0
    for i in range(len(xy)):
        j = (i + 1) % len(xy)
        dist = math.hypot(xy[j][0] - xy[i][0], xy[j][1] - xy[i][1])
        seg.append(dist)
        total += dist
    if total < 20.0:
        return None
    half = total * 0.5

    def at(dist):
        dist %= total
        acc = 0.0
        for i, step in enumerate(seg):
            if acc + step >= dist - 1e-6:
                t = 0.0 if step < 1e-9 else (dist - acc) / step
                t = max(0.0, min(1.0, t))
                nxt = pts[(i + 1) % len(pts)]
                return (
                    pts[i][0] + (nxt[0] - pts[i][0]) * t,
                    pts[i][1] + (nxt[1] - pts[i][1]) * t,
                )
            acc += step
        return pts[0]

    steps = max(8, min(80, int(half / 12.0)))
    out = []
    for i in range(steps + 1):
        lon1, lat1 = at(half * i / steps)
        lon2, lat2 = at(half * i / steps + half)
        out.append(((lon1 + lon2) * 0.5, (lat1 + lat2) * 0.5))
    cleaned = [out[0]]
    for point in out[1:]:
        if abs(point[0] - cleaned[-1][0]) > 1e-7 or abs(point[1] - cleaned[-1][1]) > 1e-7:
            cleaned.append(point)
    return cleaned if len(cleaned) >= 2 else None


def _shape_class(kind, line):
    """line, thin outline, or wide area.

    A thin ring is the two edges of a piste and reads as a doubled line.
    A wide polygon is a glade boundary. It is removed only when a centreline
    of that same piste is already drawn. A wide closed trail stays a loop.
    """
    is_poly = kind in ("Polygon", "MultiPolygon")
    if not is_poly and not _ends_meet(line):
        return "line"
    metrics = _loop_metrics(line)
    if not metrics:
        return "wide" if is_poly else "line"
    width, length = metrics
    if width < OUTLINE_WIDTH_M and length > OUTLINE_LENGTH_M and length > width * 2.5:
        return "thin"
    if is_poly:
        return "wide"
    return "line"


def _line_key(line):
    pts = tuple((round(p[0], 6), round(p[1], 6)) for p in line)
    rev = tuple(reversed(pts))
    return pts if pts <= rev else rev


def dedupe_keyed_runs(entries):
    """Drop a run that is stored twice, once as a line and once as an area.

    OpenSkiMap keeps many pistes as a LineString centreline and again as a
    Polygon whose outer ring is the piste edge. Stroking both draws a hollow
    double line. The centreline stays. A thin area with no centreline is
    replaced by one line down its middle, so the two edges are not both
    stroked. A wide glade stays a ring unless that same piste already has a
    centreline. A second copy of the same centreline is dropped. Surviving
    runs stay in their original order.
    """
    prepared = []
    for entry in entries:
        line = entry.get("line") or []
        if len(line) < 2:
            continue
        kind = entry.get("kind") or ""
        prepared.append({
            "difficulty": entry.get("difficulty"),
            "name": entry.get("name"),
            "kind": kind,
            "line": line,
            "shape": _shape_class(kind, line),
            "name_key": _norm_name(entry.get("name")),
        })
    lines = []
    for item in prepared:
        if item["shape"] != "line":
            continue
        item["length"] = _path_length(item["line"])
        item["box"] = _bbox(item["line"])
        lines.append(item)
    drop_ids = set()
    replaced_lines = {}
    dropped = 0
    replaced = 0
    for item in prepared:
        if item["shape"] == "line":
            continue
        ring = item["line"]
        metrics = _loop_metrics(ring)
        half = metrics[1] if metrics else _path_length(ring) * 0.5
        box = _bbox(ring)
        matched = False
        for line in lines:
            if not _bboxes_near(box, line["box"], 120.0):
                continue
            if item["name_key"] and item["name_key"] == line["name_key"]:
                matched = True
                break
            if line["length"] < max(40.0, half * 0.35) or line["length"] > half * 1.45:
                continue
            if _inside_fraction(line["line"], ring) >= 0.6:
                matched = True
                break
        if matched:
            drop_ids.add(id(item))
            dropped += 1
            continue
        if item["shape"] == "wide":
            continue
        centre = _centreline(ring)
        if not centre:
            continue
        replaced += 1
        replaced_lines[id(item)] = centre
    seen = set()
    result = []
    dupes = 0
    for item in prepared:
        if id(item) in drop_ids:
            continue
        line = replaced_lines.get(id(item), item["line"])
        key = _line_key(line)
        if key in seen:
            dupes += 1
            continue
        seen.add(key)
        kind = "LineString" if id(item) in replaced_lines else (item.get("kind") or "LineString")
        result.append({
            "difficulty": item.get("difficulty"),
            "name": item.get("name"),
            "kind": kind,
            "line": line,
        })
    return result, {"dropped": dropped, "replaced": replaced, "dupes": dupes}


def collapse_recorded_runs(geom_runs):
    """Flatten recorded piste features and drop doubled area outlines."""
    entries = []
    for feat in geom_runs or []:
        kind = feat.get("kind") or ""
        for line in feat.get("lines") or []:
            entries.append({
                "difficulty": feat.get("difficulty"),
                "name": feat.get("name"),
                "kind": kind,
                "line": line,
            })
    result, stats = dedupe_keyed_runs(entries)
    geom = [
        {
            "name": item.get("name"),
            "difficulty": item.get("difficulty"),
            "lines": [item["line"]],
        }
        for item in result
    ]
    runs = [(item.get("difficulty"), item["line"]) for item in result]
    return runs, geom, stats


def framed_parts(runs_keyed, lifts, geom_runs):
    """Project runs after outlines are dropped, in the original run frame.

    The frame and the lift snap still see every source line, including an
    area ring that will not be drawn. Removing that ring then cannot move
    the sheet or the lifts.
    """
    raw_lines = [item[1] for item in runs_keyed]
    fr = frame_of(raw_lines, False)
    keyed, geom, stats = collapse_recorded_runs(geom_runs)
    lifts_ll = snap_terminals(lifts, raw_lines, fr["cos"]) if fr else []
    runs = project_in(keyed, fr, True)
    lifts_p = project_in(lifts_ll, fr, False)
    return runs, lifts_p, geom, stats, raw_lines


def linked_ids(props, wanted):
    ids = []
    for area in props.get("skiAreas") or []:
        if isinstance(area, dict):
            pid = (area.get("properties") or {}).get("id")
        else:
            pid = area if isinstance(area, str) else None
        if pid in wanted:
            ids.append(pid)
    return ids


PAD = 48
SIZE = 1000 - PAD * 2
# A lift end this close to a run, in metres, is pulled onto that run.
# Farther gaps are real and stay put. The shared frame is the alignment.
SNAP_M = 30.0


def frame_of(lines, keyed=False):
    """One equirectangular frame for a hill.

    Runs and lifts must share it. A separate lift box uses a different
    origin and scale, so the lift drawing cannot meet the runs. The frame
    comes from the runs: contours are built in that same frame.
    """
    seq = [item[1] for item in lines] if keyed else lines
    pts = [p for line in seq if line for p in line]
    if not pts:
        return None
    lats = [p[1] for p in pts]
    mid = sum(lats) / len(lats)
    cos = math.cos(mid * math.pi / 180)
    xs = [p[0] * 111320 * cos for p in pts]
    ys = [p[1] * 110540 for p in pts]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    return {
        "cos": cos,
        "minx": minx,
        "maxx": maxx,
        "miny": miny,
        "maxy": maxy,
        "span": max(maxx - minx, maxy - miny, 1.0),
    }


def project_in(lines, fr, keyed=False):
    if not fr:
        return []
    seq = [item[1] for item in lines] if keyed else lines
    cos = fr["cos"]
    drawn = []
    for i, line in enumerate(seq):
        if len(line) < 2:
            continue
        cmd = []
        for lon, lat in line:
            x = lon * 111320 * cos
            y = lat * 110540
            px = PAD + (x - fr["minx"]) / fr["span"] * SIZE
            py = PAD + (fr["maxy"] - y) / fr["span"] * SIZE
            cmd.append(f"{px:.1f},{py:.1f}")
        if len(cmd) >= 2:
            text = " ".join(cmd)
            drawn.append({"d": lines[i][0], "p": text} if keyed else text)
    return drawn


def snap_terminals(lines, run_lines, cos):
    """Move a terminal onto the nearest run when it is already within 30 m."""
    if not run_lines:
        return lines
    segs = []
    for line in run_lines:
        prev = None
        for lon, lat in line:
            if prev:
                segs.append((prev[0], prev[1], lon, lat))
            prev = (lon, lat)

    def closest(lon, lat):
        x = lon * 111320 * cos
        y = lat * 110540
        best = None
        best_d = SNAP_M
        for ax, ay, bx, by in segs:
            mx, my = ax * 111320 * cos, ay * 110540
            nx, ny = bx * 111320 * cos, by * 110540
            dx, dy = nx - mx, ny - my
            len2 = dx * dx + dy * dy
            if len2 == 0:
                t = 0.0
                d = math.hypot(x - mx, y - my)
            else:
                t = max(0.0, min(1.0, ((x - mx) * dx + (y - my) * dy) / len2))
                d = math.hypot(x - (mx + t * dx), y - (my + t * dy))
            if d < best_d:
                best_d = d
                best = (ax + (bx - ax) * t, ay + (by - ay) * t)
        return best

    snapped = []
    for line in lines:
        if len(line) < 2:
            snapped.append(line)
            continue
        pts = list(line)
        for index in (0, -1):
            hit = closest(pts[index][0], pts[index][1])
            if hit:
                pts[index] = hit
        snapped.append(pts)
    return snapped


def hill_point(feat):
    geom = feat.get("geometry") or {}
    coords = geom.get("coordinates") or []
    if geom.get("type") == "Point" and len(coords) >= 2:
        return float(coords[0]), float(coords[1])
    hint = (feat["properties"].get("viewportHint") or {}).get("center")
    if hint and len(hint) >= 2:
        return float(hint[0]), float(hint[1])
    return None


def elevations(stats):
    if not isinstance(stats, dict):
        return None, None
    runs = stats.get("runs") if isinstance(stats.get("runs"), dict) else {}
    lifts = stats.get("lifts") if isinstance(stats.get("lifts"), dict) else {}
    for block in (runs, lifts, stats):
        mn = block.get("minElevation") if isinstance(block, dict) else None
        mx = block.get("maxElevation") if isinstance(block, dict) else None
        if isinstance(mn, (int, float)) and isinstance(mx, (int, float)) and mx >= mn:
            return int(round(mn)), int(round(mx - mn))
    return None, None


def gps_name(lat, lon):
    ns = "N" if lat >= 0 else "S"
    ew = "E" if lon >= 0 else "W"
    return f"Hill at {abs(lat):.2f}° {ns}, {abs(lon):.2f}° {ew}"


def line_metres(pts):
    if len(pts) < 2:
        return 0.0
    mid = sum(p[1] for p in pts) / len(pts)
    cos = math.cos(mid * math.pi / 180)
    total = 0.0
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        total += math.hypot((x1 - x0) * 111320 * cos, (y1 - y0) * 110540)
    return total


def use_buckets(uses):
    if isinstance(uses, str):
        uses = [uses]
    found = {str(item) for item in (uses or [])}
    buckets = set()
    if "skitour" in found or "backcountry" in found:
        buckets.add("backcountry")
    if "nordic" in found:
        buckets.add("cross-country")
    if "downhill" in found:
        buckets.add("downhill")
    return buckets


def hill_type(name, activities, has_lifts, downhill_m, nordic_m, backcountry_m):
    """Downhill or cross-country only. Nordic-only hills are cross-country.
    Mixed hills take the longer run total. A result that would have been
    backcountry is cross-country when the nordic length is strictly longer
    than the downhill length and the skitour length, and downhill otherwise.
    """
    acts = set(activities or [])
    down, nordic, back = float(downhill_m or 0), float(nordic_m or 0), float(backcountry_m or 0)
    if down == nordic == back == 0:
        if "skitour" in acts or "backcountry" in acts:
            back = 1
        if "nordic" in acts:
            nordic = 1
        if "downhill" in acts:
            down = 1
    resort = bool(re.search(r"\bresorts?\b", name or "", re.I))
    eligible = {}
    if nordic > 0 and down == 0 and back == 0:
        eligible["cross-country"] = nordic
    if has_lifts and down > 0:
        eligible["downhill"] = down
    if back > 0:
        eligible["backcountry"] = back
    if (not has_lifts) and (not resort) and (down > 0 or back > 0):
        eligible["backcountry"] = max(eligible.get("backcountry", 0), down + back)
    if nordic > 0 and (down > 0 or back > 0):
        eligible["cross-country"] = nordic
        if down > 0 and has_lifts:
            eligible["downhill"] = down
        if down > 0 and (not has_lifts) and (not resort):
            eligible["backcountry"] = max(eligible.get("backcountry", 0), down + back)
    if not eligible:
        if down > 0 and (has_lifts or resort):
            kind = "downhill"
        elif nordic > 0:
            kind = "cross-country"
        else:
            kind = "backcountry" if not has_lifts else "downhill"
    elif len(eligible) == 1:
        kind = next(iter(eligible))
    else:
        kind = max(eligible, key=lambda key: eligible[key])
    if kind != "backcountry":
        return kind
    if nordic > down and nordic > back:
        return "cross-country"
    return "downhill"


def absorb(path, hills, key, keep_diff=False):
    kept = 0
    with open(path, "rb") as handle:
        for feat in ijson.items(handle, "features.item", use_float=True):
            props = feat.get("properties") or {}
            ids = linked_ids(props, hills)
            if not ids:
                continue
            lines = lines_of(feat.get("geometry"))
            if not lines:
                continue
            diff = None
            if keep_diff:
                raw = props.get("difficulty")
                if isinstance(raw, str) and raw.strip():
                    diff = raw.strip().lower()
            name = props.get("name")
            if isinstance(name, str):
                name = name.strip() or None
            else:
                name = None
            kind = (feat.get("geometry") or {}).get("type") or ""
            buckets = use_buckets(props.get("uses")) if keep_diff else set()
            dist = sum(line_metres(line) for line in lines) if buckets else 0
            for oid in ids:
                if keep_diff:
                    for line in lines:
                        hills[oid][key].append((diff, line))
                    hills[oid].setdefault("geom_runs", []).append(
                        {"name": name, "difficulty": diff, "kind": kind, "lines": lines}
                    )
                    tally = hills[oid].setdefault("use_m", {"downhill": 0.0, "cross-country": 0.0, "backcountry": 0.0})
                    for bucket in buckets:
                        tally[bucket] += dist
                else:
                    hills[oid][key].extend(lines)
            kept += 1
    return kept


REGION_ORDER = [
    ("canadian-rockies", "Canadian Rockies"),
    ("alberta-south", "Alberta South"),
    ("calgary-area", "Calgary & Area"),
    ("alberta-central", "Alberta Central"),
    ("edmonton-area", "Edmonton & Area"),
    ("alberta-north", "Alberta North"),
]


def load_divisions(root):
    data = json.loads((root / "cd-regions.json").read_text())
    return data["map"], data["features"]


def _inside(lon, lat, rings):
    hit = False
    for ring in rings:
        j = len(ring) - 1
        for i, p in enumerate(ring):
            xi, yi = p[0], p[1]
            xj, yj = ring[j][0], ring[j][1]
            if (yi > lat) != (yj > lat):
                xint = (xj - xi) * (lat - yi) / (yj - yi) + xi
                if lon < xint:
                    hit = not hit
            j = i
    return hit


def region_for(lon, lat, mapping, features):
    if lon is None or lat is None:
        return "alberta-central"
    for feat in features:
        if _inside(lon, lat, feat["rings"]):
            return mapping.get(feat["id"], "alberta-central")
    best, dist = None, None
    for feat in features:
        for ring in feat["rings"]:
            for x, y in ring:
                d = (x - lon) ** 2 + (y - lat) ** 2
                if dist is None or d < dist:
                    dist, best = d, feat["id"]
    return mapping.get(best, "alberta-central")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--src", default="/tmp/ski")
    args = parser.parse_args()
    src = Path(args.src)
    root = Path(__file__).resolve().parent
    bc = json.loads((root / "hills.json").read_text())
    used = {hill["slug"] for hill in bc["hills"]}
    already = {hill["id"] for hill in bc["hills"]}
    areas = json.loads((src / "ski_areas.geojson").read_text())
    hills = {}
    order = []
    for feat in areas["features"]:
        places = feat["properties"].get("places") or []
        if not any(place.get("iso3166_2") == "CA-AB" for place in places):
            continue
        oid = feat["properties"]["id"]
        if oid in already:
            continue
        loc = hill_point(feat)
        base, drop = elevations(feat["properties"].get("statistics"))
        name = feat["properties"].get("name")
        if isinstance(name, str):
            name = name.strip()
        hills[oid] = {
            "id": oid,
            "name": name or "",
            "lon": round(loc[0], 5) if loc else None,
            "lat": round(loc[1], 5) if loc else None,
            "base": base,
            "drop": drop,
            "activities": list(feat["properties"].get("activities") or []),
            "runs": [],
            "lifts": [],
        }
        order.append(oid)
    print("areas", len(order), flush=True)
    print("lifts", absorb(src / "lifts.geojson", hills, "lifts"), flush=True)
    print("runs", absorb(src / "runs.geojson", hills, "runs", True), flush=True)

    mapping, divisions = load_divisions(root)
    records = []
    names = {}
    omitted_empty = 0
    omitted_lift = 0
    with_elev = 0
    for oid in sorted(order, key=lambda i: ((hills[i]["name"] or "").lower(), i)):
        hill = hills[oid]
        runs, lifts, _geom, stats, run_lines = framed_parts(
            hill["runs"], hill["lifts"], hill.get("geom_runs")
        )
        if stats["dropped"] or stats["replaced"] or stats["dupes"]:
            print("dedupe", hill["name"], stats, flush=True)
        if not runs and not lifts:
            omitted_empty += 1
            continue
        if not runs:
            omitted_lift += 1
            continue
        lat = hill["lat"]
        lon = hill["lon"]
        label = hill["name"]
        if not label:
            if lat is None or lon is None:
                continue
            label = gps_name(lat, lon)
            names[oid] = {"name": label, "source": "gps"}
        base = slugify(label, oid)
        slug = base
        n = 2
        while slug in used:
            slug = base + "-" + str(n)
            n += 1
        used.add(slug)
        if hill["base"] is not None:
            with_elev += 1
        row = {
            "id": oid,
            "slug": slug,
            "name": label,
            "region": region_for(lon, lat, mapping, divisions),
            "province": "ab",
            "lon": lon,
            "lat": lat,
            "type": hill_type(
                label,
                hill.get("activities"),
                bool(lifts),
                (hill.get("use_m") or {}).get("downhill", 0),
                (hill.get("use_m") or {}).get("cross-country", 0),
                (hill.get("use_m") or {}).get("backcountry", 0),
            ),
            "runs": runs,
            "lifts": lifts,
        }
        if hill["base"] is not None:
            row["base"] = hill["base"]
            row["drop"] = hill["drop"]
        records.append(row)
    payload = {
        "attribution": "© OpenStreetMap contributors, OpenSkiMap.org (ODbL)",
        "province": "ab",
        "regions": [{"id": rid, "name": name} for rid, name in REGION_ORDER],
        "counts": {
            "hills": len(records),
            "omittedEmpty": omitted_empty,
            "omittedLiftOnly": omitted_lift,
            "withElevation": with_elev,
        },
        "hills": records,
    }
    (root / "alberta.json").write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False))
    (root / "alberta-names.json").write_text(json.dumps(names, indent=2, ensure_ascii=False) + "\n")
    print("hills", len(records), "empty", omitted_empty, "liftOnly", omitted_lift, "elev", with_elev, "gps", len(names))
    print("bytes", (root / "alberta.json").stat().st_size)


if __name__ == "__main__":
    main()
