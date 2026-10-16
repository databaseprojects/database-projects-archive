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


def project(lines, keyed=False):
    seq = [item[1] for item in lines] if keyed else lines
    pts = [p for line in seq if line for p in line]
    if not pts:
        return []
    lats = [p[1] for p in pts]
    mid = sum(lats) / len(lats)
    cos = math.cos(mid * math.pi / 180)
    xs = [p[0] * 111320 * cos for p in pts]
    ys = [p[1] * 110540 for p in pts]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    span = max(maxx - minx, maxy - miny, 1)
    pad = 48
    size = 1000 - pad * 2
    drawn = []
    for i, line in enumerate(seq):
        if len(line) < 2:
            continue
        cmd = []
        for lon, lat in line:
            x = lon * 111320 * cos
            y = lat * 110540
            px = pad + (x - minx) / span * size
            py = pad + (maxy - y) / span * size
            cmd.append(f"{px:.1f},{py:.1f}")
        if len(cmd) >= 2:
            text = " ".join(cmd)
            drawn.append({"d": lines[i][0], "p": text} if keyed else text)
    return drawn


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
    """Downhill needs lifts and downhill runs. Backcountry is skitour/backcountry,
    or no lifts and no resort name with other non-nordic runs. Cross-country is
    nordic runs only. Mixed hills take the longer run total.
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
            return "downhill"
        if nordic > 0:
            return "cross-country"
        return "backcountry" if not has_lifts else "downhill"
    if len(eligible) == 1:
        return next(iter(eligible))
    return max(eligible, key=lambda key: eligible[key])


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
            buckets = use_buckets(props.get("uses")) if keep_diff else set()
            dist = sum(line_metres(line) for line in lines) if buckets else 0
            for oid in ids:
                if keep_diff:
                    for line in lines:
                        hills[oid][key].append((diff, line))
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
        runs = project(hill["runs"], True)
        lifts = project(hill["lifts"])
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
