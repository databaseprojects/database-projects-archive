#!/usr/bin/env python3
"""Add the remaining operating lower-48 downhill ski areas.

The top 200 are already drawn. This keeps those records as they are and
appends areas that OpenSkiMap marks operating, in the lower 48, with
downhill runs on the ground. Cross-country areas are left out. A polygon
wider than 50 km is a pass, not one hill.

    python3 ski-hills/build-usa-rest.py --prepare --src /tmp/ski
    python3 ski-hills/build-usa-rest.py --apply --states wa,or,ca
"""
import argparse
import importlib.util
import json
from collections import Counter
from pathlib import Path

import ijson


LOWER_48 = {
    "al", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "id", "il", "in", "ia",
    "ks", "ky", "la", "me", "md", "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv",
    "nh", "nj", "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc", "sd",
    "tn", "tx", "ut", "vt", "va", "wa", "wv", "wi", "wy",
}
STATE_NAMES = {
    "al": "Alabama", "az": "Arizona", "ar": "Arkansas", "ca": "California",
    "co": "Colorado", "ct": "Connecticut", "de": "Delaware", "fl": "Florida",
    "ga": "Georgia", "id": "Idaho", "il": "Illinois", "in": "Indiana",
    "ia": "Iowa", "ks": "Kansas", "ky": "Kentucky", "la": "Louisiana",
    "me": "Maine", "md": "Maryland", "ma": "Massachusetts", "mi": "Michigan",
    "mn": "Minnesota", "ms": "Mississippi", "mo": "Missouri", "mt": "Montana",
    "ne": "Nebraska", "nv": "Nevada", "nh": "New Hampshire", "nj": "New Jersey",
    "nm": "New Mexico", "ny": "New York", "nc": "North Carolina", "nd": "North Dakota",
    "oh": "Ohio", "ok": "Oklahoma", "or": "Oregon", "pa": "Pennsylvania",
    "ri": "Rhode Island", "sc": "South Carolina", "sd": "South Dakota",
    "tn": "Tennessee", "tx": "Texas", "ut": "Utah", "vt": "Vermont",
    "va": "Virginia", "wa": "Washington", "wv": "West Virginia", "wi": "Wisconsin",
    "wy": "Wyoming",
}
PASS_M = 50000
RUN_M = 56000
MANIFEST = Path("/tmp/ski/usa-rest-manifest.json")


def load_module(name):
    path = Path(__file__).resolve().parent / name
    spec = importlib.util.spec_from_file_location(name.replace(".py", "").replace("-", "_"), path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def existing_ids(root):
    found = set()
    usa = root / "usa"
    for path in usa.glob("*.json"):
        data = json.loads(path.read_text())
        for hill in data.get("hills") or []:
            if hill.get("id"):
                found.add(hill["id"])
    return found


def used_slugs(root):
    used = set()
    for folder, pattern in (
        (root, "*.json"),
        (root / "usa", "*.json"),
        (root / "europe", "*.json"),
    ):
        if not folder.exists():
            continue
        for path in folder.glob(pattern):
            if path.name.endswith("-names.json") or path.name.endswith("-index.json"):
                continue
            if path.name in ("boundaries.json", "cd-regions.json", "canada-select.json", "hill-index.json"):
                continue
            try:
                data = json.loads(path.read_text())
            except Exception:
                continue
            hills = data.get("hills") if isinstance(data, dict) else None
            if not isinstance(hills, list):
                continue
            for hill in hills:
                if hill.get("slug"):
                    used.add(hill["slug"])
    for folder in (root / "frontal",):
        if folder.exists():
            for path in folder.glob("*.svg"):
                used.add(path.stem)
    contours = root / "contours"
    if contours.exists():
        for path in contours.glob("*.json"):
            if path.name.endswith("-index.json") or path.name == "index.json":
                continue
            used.add(path.stem)
    return used


def prepare(args, ab, usa):
    root = Path(__file__).resolve().parent
    src = Path(args.src)
    have = existing_ids(root)
    areas = json.loads((src / "ski_areas.geojson").read_text())
    by_id = {}
    for feat in areas["features"]:
        props = feat.get("properties") or {}
        oid = props.get("id")
        if not oid or oid in have:
            continue
        geom = (feat.get("geometry") or {}).get("type") or ""
        prev = by_id.get(oid)
        if prev and prev["geom"] in ("Polygon", "MultiPolygon") and geom == "Point":
            continue
        code = usa.state_code(props)
        if code not in LOWER_48:
            continue
        if (props.get("status") or "operating") not in ("operating", ""):
            continue
        activities = set(props.get("activities") or [])
        km = usa.downhill_km(props)
        if "downhill" not in activities and km <= 0:
            continue
        name = (props.get("name") or "").strip()
        if usa.is_private(name):
            continue
        hint = props.get("viewportHint") or {}
        span = max(float(hint.get("rotatedWidthMeters") or 0), float(hint.get("rotatedHeightMeters") or 0))
        if geom in ("Polygon", "MultiPolygon") and span > PASS_M:
            continue
        loc = ab.hill_point(feat)
        base, drop = ab.elevations(props.get("statistics"))
        by_id[oid] = {
            "id": oid,
            "name": name,
            "state": code,
            "km": km,
            "span": span,
            "geom": geom,
            "lon": round(loc[0], 5) if loc else None,
            "lat": round(loc[1], 5) if loc else None,
            "base": base,
            "drop": drop,
            "activities": list(activities),
            "runs": [],
            "lifts": [],
            "geom_runs": [],
            "geom_lifts": [],
            "use_m": {"downhill": 0.0, "cross-country": 0.0, "backcountry": 0.0},
        }
    print("candidates", len(by_id), "already drawn", len(have), flush=True)
    del areas

    def take(path, keep_diff):
        kept = 0
        seen = 0
        with open(path, "rb") as handle:
            for feat in ijson.items(handle, "features.item", use_float=True):
                seen += 1
                if seen % 200000 == 0:
                    print(path.name, seen, "kept", kept, flush=True)
                props = feat.get("properties") or {}
                ids = ab.linked_ids(props, by_id)
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
                kind = (feat.get("geometry") or {}).get("type") or ""
                buckets = ab.use_buckets(props.get("uses")) if keep_diff else set()
                dist = sum(ab.line_metres(line) for line in lines) if buckets else 0
                for oid in ids:
                    hill = by_id[oid]
                    if keep_diff:
                        for line in lines:
                            hill["runs"].append((diff, line))
                        hill["geom_runs"].append(
                            {"name": name, "difficulty": diff, "kind": kind, "lines": lines}
                        )
                        for bucket in buckets:
                            hill["use_m"][bucket] += dist
                    else:
                        hill["lifts"].extend(lines)
                        hill["geom_lifts"].append({"name": name, "difficulty": None, "lines": lines})
                kept += 1
        print(path.name, "features", seen, "linked", kept, flush=True)

    take(src / "lifts.geojson", False)
    take(src / "runs.geojson", True)

    used = used_slugs(root)
    kept = []
    skipped = Counter()
    for hill in by_id.values():
        if hill["lat"] is None or hill["lon"] is None:
            skipped["no location"] += 1
            continue
        run_lines = [item[1] for item in hill["runs"]]
        if not run_lines:
            skipped["no linked runs"] += 1
            continue
        metres = sum(ab.line_metres(line) for line in run_lines)
        if metres < 400:
            skipped["under 400 m"] += 1
            continue
        framed = ab.frame_of(run_lines, False)
        if not framed or framed["span"] > RUN_M:
            skipped["run span"] += 1
            continue
        runs, lifts, geom_runs, stats, _raw = ab.framed_parts(hill["runs"], hill["lifts"], hill["geom_runs"])
        kind = ab.hill_type(
            hill["name"],
            hill.get("activities"),
            bool(lifts),
            hill["use_m"].get("downhill", 0),
            hill["use_m"].get("cross-country", 0),
            hill["use_m"].get("backcountry", 0),
        )
        if kind != "downhill":
            skipped["type " + kind] += 1
            continue
        label = usa.clean_name(hill["name"] or hill["id"], hill["state"], hill["id"])
        base = ab.slugify(label, hill["id"])
        slug = base
        n = 2
        while slug in used:
            slug = base + "-" + str(n)
            n += 1
        used.add(slug)
        record = {
            "id": hill["id"],
            "slug": slug,
            "name": label,
            "region": hill["state"],
            "state": hill["state"].upper(),
            "range": usa.mountain_range(hill["state"], hill["lat"], hill["lon"], slug),
            "province": "us",
            "lon": hill["lon"],
            "lat": hill["lat"],
            "type": "downhill",
            "runs": runs,
            "lifts": lifts,
            "stacked": True,
        }
        if hill["base"] is not None:
            record["base"] = hill["base"]
            record["drop"] = hill["drop"]
        Path("/tmp/%s-geom.json" % slug).write_text(
            json.dumps({"runs": geom_runs, "lifts": hill["geom_lifts"]}, ensure_ascii=False)
        )
        kept.append({
            "state": hill["state"],
            "name": label,
            "slug": slug,
            "id": hill["id"],
            "km": round(hill["km"], 1),
            "runs": len(runs),
            "lifts": len(lifts),
            "dedupe": stats,
            "record": record,
        })
        if stats["dropped"] or stats["replaced"] or stats["dupes"]:
            print("dedupe", label, stats, flush=True)
    kept.sort(key=lambda item: (-item["km"], item["name"], item["id"]))
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps({"hills": kept}, ensure_ascii=False))
    counts = Counter(item["state"] for item in kept)
    print("kept", len(kept), "skipped", dict(skipped), flush=True)
    for code, count in sorted(counts.items(), key=lambda item: (-item[1], item[0])):
        print(f"  {code} {count} {STATE_NAMES.get(code, code)}", flush=True)


def apply(args):
    root = Path(__file__).resolve().parent
    states = [item.strip().lower() for item in args.states.split(",") if item.strip()]
    manifest = json.loads(MANIFEST.read_text())
    chosen = [item for item in manifest["hills"] if item["state"] in states]
    if not chosen:
        raise SystemExit("no hills for " + ",".join(states))
    grouped = {}
    for item in chosen:
        grouped.setdefault(item["state"], []).append(item["record"])
    out_dir = root / "usa"
    for code, records in grouped.items():
        dest = out_dir / ("%s.json" % code)
        if dest.exists():
            data = json.loads(dest.read_text())
            before = [json.dumps(hill, separators=(",", ":"), ensure_ascii=False) for hill in data["hills"]]
            have = {hill.get("id") for hill in data["hills"]}
            added = [row for row in records if row["id"] not in have]
            data["hills"].extend(added)
            data["counts"]["hills"] = len(data["hills"])
            text = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
            after = json.loads(text)["hills"]
            for old, hill in zip(before, after):
                if json.dumps(hill, separators=(",", ":"), ensure_ascii=False) != old:
                    raise SystemExit("existing hill changed in " + dest.name)
            dest.write_text(text)
            print("appended", dest.name, len(added), "now", len(data["hills"]), flush=True)
        else:
            payload = {
                "attribution": "© OpenStreetMap contributors, OpenSkiMap.org (ODbL)",
                "province": "us",
                "regions": [{"id": code, "name": STATE_NAMES.get(code, code.upper())}],
                "counts": {"hills": len(records)},
                "hills": records,
            }
            dest.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False))
            print("created", dest.name, len(records), flush=True)
    hills_path = Path("/tmp/ski/usa-rest-batch-hills.json")
    hills_path.write_text(json.dumps({"hills": [item["record"] for item in chosen]}, ensure_ascii=False))
    print("batch hills", len(chosen), "->", hills_path, flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--prepare", action="store_true")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--states", default="")
    parser.add_argument("--src", default="/tmp/ski")
    args = parser.parse_args()
    if args.prepare:
        prepare(args, load_module("build-alberta.py"), load_module("build-usa.py"))
    elif args.apply:
        if not args.states:
            raise SystemExit("--states is required with --apply")
        apply(args)
    else:
        raise SystemExit("pass --prepare or --apply")


if __name__ == "__main__":
    main()
