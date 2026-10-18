#!/usr/bin/env python3
"""Build one rest-of-Canada province file from local OpenSkiMap GeoJSON.

Same geometry rules as Alberta: every run and lift vertex, one decimal
on the 1000-unit drawing, elevations from OpenSkiMap statistics, lifts
snapped onto runs within 30 m. The hill list is ski-hills/canada-select.json.
Bird's-eye geometry is written to /tmp/{slug}-geom.json for build-frontal.py.

    python3 ski-hills/build-canada.py --province qc --src /tmp/ski
"""
import argparse
import importlib.util
import json
import math
from pathlib import Path

import ijson


def load_alberta():
    path = Path(__file__).resolve().parent / "build-alberta.py"
    spec = importlib.util.spec_from_file_location("build_alberta", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# Quebec tourism groups. Boxes partition the hills; the map outlines are
# the province clipped to the same cuts.
QC_REGIONS = [
    ("outaouais", "Outaouais"),
    ("laurentides", "Laurentides"),
    ("mauricie", "Mauricie"),
    ("cantons-de-lest", "Cantons-de-l'Est"),
    ("quebec", "Québec"),
    ("saguenay", "Saguenay–Lac-Saint-Jean"),
    ("bas-saint-laurent-gaspesie", "Bas-Saint-Laurent & Gaspésie"),
]


def qc_region(lon, lat):
    if lon is None or lat is None:
        return "quebec"
    if lon > -69.3:
        return "bas-saint-laurent-gaspesie"
    if lat >= 48.05:
        return "saguenay"
    if lat < 45.65 and lon > -73.0:
        return "cantons-de-lest"
    if lon < -75.15 and lat < 47.2:
        return "outaouais"
    if lon < -73.35 and lat < 47.6:
        return "laurentides"
    if -73.4 < lon < -72.15 and 46.05 < lat < 47.4:
        return "mauricie"
    return "quebec"


def region_of(province, lon, lat):
    if province == "qc":
        return qc_region(lon, lat)
    return province


def regions_for(province):
    if province == "qc":
        return QC_REGIONS
    return []


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--province", required=True)
    parser.add_argument("--src", default="/tmp/ski")
    args = parser.parse_args()
    ab = load_alberta()
    root = Path(__file__).resolve().parent
    src = Path(args.src)
    code = args.province.lower()
    selected = json.loads((root / "canada-select.json").read_text())
    wanted_rows = [row for row in selected["hills"] if row["province"] == code]
    if not wanted_rows:
        raise SystemExit("no hills for " + code)
    by_id = {row["id"]: row for row in wanted_rows}

    bc = json.loads((root / "hills.json").read_text())
    used = {hill["slug"] for hill in bc["hills"]}
    alberta_path = root / "alberta.json"
    if alberta_path.exists():
        used.update(hill["slug"] for hill in json.loads(alberta_path.read_text())["hills"])

    areas = json.loads((src / "ski_areas.geojson").read_text())
    hills = {}
    for feat in areas["features"]:
        oid = feat["properties"].get("id")
        if oid not in by_id:
            continue
        loc = ab.hill_point(feat)
        base, drop = ab.elevations(feat["properties"].get("statistics"))
        row = by_id[oid]
        lon = round(loc[0], 5) if loc else row.get("lon")
        lat = round(loc[1], 5) if loc else row.get("lat")
        hills[oid] = {
            "id": oid,
            "name": row["name"],
            "lon": lon,
            "lat": lat,
            "base": base,
            "drop": drop,
            "activities": list(feat["properties"].get("activities") or []),
            "runs": [],
            "lifts": [],
            "geom_runs": [],
            "geom_lifts": [],
            "use_m": {"downhill": 0.0, "cross-country": 0.0, "backcountry": 0.0},
        }
    missing = [oid for oid in by_id if oid not in hills]
    if missing:
        raise SystemExit("missing areas " + ", ".join(missing))
    print("areas", len(hills), flush=True)

    def take(path, key, keep_diff):
        kept = 0
        with open(path, "rb") as handle:
            for feat in ijson.items(handle, "features.item", use_float=True):
                props = feat.get("properties") or {}
                ids = ab.linked_ids(props, hills)
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
                if isinstance(name, str):
                    name = name.strip() or None
                else:
                    name = None
                buckets = ab.use_buckets(props.get("uses")) if keep_diff else set()
                dist = sum(ab.line_metres(line) for line in lines) if buckets else 0
                for oid in ids:
                    if keep_diff:
                        for line in lines:
                            hills[oid]["runs"].append((diff, line))
                        hills[oid]["geom_runs"].append(
                            {"name": name, "difficulty": diff, "lines": lines}
                        )
                        for bucket in buckets:
                            hills[oid]["use_m"][bucket] += dist
                    else:
                        hills[oid]["lifts"].extend(lines)
                        hills[oid]["geom_lifts"].append(
                            {"name": name, "difficulty": None, "lines": lines}
                        )
                kept += 1
        return kept

    print("lifts", take(src / "lifts.geojson", "lifts", False), flush=True)
    print("runs", take(src / "runs.geojson", "runs", True), flush=True)

    records = []
    omitted = 0
    geom_dir_note = 0
    for row in wanted_rows:
        hill = hills[row["id"]]
        run_lines = [item[1] for item in hill["runs"]]
        fr = ab.frame_of(run_lines, False)
        lifts_ll = ab.snap_terminals(hill["lifts"], run_lines, fr["cos"]) if fr else []
        runs = ab.project_in(hill["runs"], fr, True)
        lifts = ab.project_in(lifts_ll, fr, False)
        if not runs:
            omitted += 1
            print("omit", hill["name"], flush=True)
            continue
        pts = [p for line in run_lines for p in line]
        lons = [p[0] for p in pts]
        lats = [p[1] for p in pts]
        span_km = 0.0
        if pts:
            mid = sum(lats) / len(lats)
            cos = math.cos(mid * math.pi / 180)
            span_km = max(
                (max(lons) - min(lons)) * 111.32 * cos,
                (max(lats) - min(lats)) * 110.54,
            )
        label = hill["name"]
        base = ab.slugify(label, hill["id"])
        slug = base
        n = 2
        while slug in used:
            slug = base + "-" + str(n)
            n += 1
        used.add(slug)
        lon, lat = hill["lon"], hill["lat"]
        record = {
            "id": hill["id"],
            "slug": slug,
            "name": label,
            "region": region_of(code, lon, lat),
            "province": code,
            "lon": lon,
            "lat": lat,
            "type": ab.hill_type(
                label,
                hill.get("activities"),
                bool(lifts),
                hill["use_m"].get("downhill", 0),
                hill["use_m"].get("cross-country", 0),
                hill["use_m"].get("backcountry", 0),
            ),
            "runs": runs,
            "lifts": lifts,
            "stacked": True,
        }
        if hill["base"] is not None:
            record["base"] = hill["base"]
            record["drop"] = hill["drop"]
        records.append(record)
        geom = {"runs": hill["geom_runs"], "lifts": hill["geom_lifts"]}
        Path("/tmp/%s-geom.json" % slug).write_text(json.dumps(geom, ensure_ascii=False))
        geom_dir_note += 1
        print(
            "hill",
            slug,
            record["region"],
            record["type"],
            "runs",
            len(runs),
            "lifts",
            len(lifts),
            "span_km",
            round(span_km, 1),
            flush=True,
        )

    names = {code: [{"id": rid, "name": name} for rid, name in regions_for(code)]}
    payload = {
        "attribution": "© OpenStreetMap contributors, OpenSkiMap.org (ODbL)",
        "province": code,
        "regions": names[code],
        "counts": {"hills": len(records), "omittedEmpty": omitted},
        "hills": records,
    }
    dest = root / ("%s.json" % ("quebec" if code == "qc" else code))
    dest.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False))
    (root / ("%s-names.json" % dest.stem)).write_text("{}\n")
    print("wrote", dest.name, "hills", len(records), "bytes", dest.stat().st_size, "geom", geom_dir_note)


if __name__ == "__main__":
    main()
