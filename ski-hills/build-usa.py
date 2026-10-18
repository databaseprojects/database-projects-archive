#!/usr/bin/env python3
"""Build United States ski-hill drawings from the local OpenSkiMap GeoJSON.

Same plan geometry as the Canadian hills. One JSON file per state, so the
page can load a state on its own. Bird's-eye geometry is written to
/tmp/{slug}-geom.json for build-frontal.py.

    python3 ski-hills/build-usa.py --batch west --src /tmp/ski
"""
import argparse
import csv
import importlib.util
import json
import math
from pathlib import Path

import ijson


WEST_STATES = ["wa", "or", "ca", "nv", "id", "mt", "wy", "ut", "co", "az", "nm", "sd"]
STATE_NAMES = {
    "wa": "Washington",
    "or": "Oregon",
    "ca": "California",
    "nv": "Nevada",
    "id": "Idaho",
    "mt": "Montana",
    "wy": "Wyoming",
    "ut": "Utah",
    "co": "Colorado",
    "az": "Arizona",
    "nm": "New Mexico",
    "sd": "South Dakota",
}
BATCH_STATES = {"west": WEST_STATES}

# Members-only resorts already dropped from the list, plus the same names
# if they show up again as a backfill.
PRIVATE_NAMES = {
    "yellowstone club",
    "wasatch peaks ranch",
    "the hermitage club at haystack mountain",
    "hermitage club",
    "cimarron mountain club",
    "three forks ranch",
    "jackson creek summit",
    "windham mountain club",
}


def load_alberta():
    path = Path(__file__).resolve().parent / "build-alberta.py"
    spec = importlib.util.spec_from_file_location("build_alberta", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def downhill_km(props):
    stats = props.get("statistics") if isinstance(props.get("statistics"), dict) else {}
    runs = stats.get("runs") if isinstance(stats.get("runs"), dict) else {}
    by = runs.get("byActivity") if isinstance(runs.get("byActivity"), dict) else {}
    down = by.get("downhill") if isinstance(by.get("downhill"), dict) else {}
    total = 0.0
    diff = down.get("byDifficulty") if isinstance(down.get("byDifficulty"), dict) else {}
    for block in diff.values():
        if isinstance(block, dict) and isinstance(block.get("lengthInKm"), (int, float)):
            total += float(block["lengthInKm"])
    return total


def state_code(props):
    for place in props.get("places") or []:
        if not isinstance(place, dict):
            continue
        if place.get("iso3166_1Alpha2") != "US":
            continue
        iso = place.get("iso3166_2") or ""
        if iso.startswith("US-") and len(iso) == 5:
            return iso[3:].lower()
    return ""


def is_private(name):
    text = (name or "").strip().lower()
    if text in PRIVATE_NAMES:
        return True
    if "members" in text or "private" in text:
        return True
    return False


def clean_name(name, state, oid):
    # Two Crystal Mountains. The Michigan hill is a later batch.
    if oid == "89f555b5c8e0e0e0":
        return name
    if name == "Crystal Mountain" and state == "wa":
        return "Crystal Mountain, Washington"
    return name


def used_slugs(root):
    used = set()
    for path in root.glob("*.json"):
        if path.name.endswith("-names.json") or path.name in ("boundaries.json", "cd-regions.json", "canada-select.json"):
            continue
        try:
            data = json.loads(path.read_text())
        except Exception:
            continue
        hills = data.get("hills") if isinstance(data, dict) else None
        if not isinstance(hills, list):
            continue
        for hill in hills:
            slug = hill.get("slug")
            if slug:
                used.add(slug)
    usa = root / "usa"
    if usa.exists():
        for path in usa.glob("*.json"):
            data = json.loads(path.read_text())
            for hill in data.get("hills") or []:
                if hill.get("slug"):
                    used.add(hill["slug"])
    return used


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch", default="west")
    parser.add_argument("--src", default="/tmp/ski")
    parser.add_argument("--list", default="")
    args = parser.parse_args()
    batch = args.batch.lower()
    states = BATCH_STATES[batch]
    ab = load_alberta()
    root = Path(__file__).resolve().parent
    src = Path(args.src)
    list_path = Path(args.list) if args.list else Path("/home/ubuntu/.cursor/projects/workspace/uploads/us-top200_2e77.csv")
    rows = []
    with list_path.open(newline="") as handle:
        for row in csv.DictReader(handle):
            if row["Region/batch"].strip().lower() != batch:
                continue
            rows.append(row)
    selected_ids = [row["OpenSkiMap id"].strip() for row in rows]
    by_row = {row["OpenSkiMap id"].strip(): row for row in rows}
    print("listed", len(rows), flush=True)

    areas = json.loads((src / "ski_areas.geojson").read_text())
    west = {}
    for feat in areas["features"]:
        props = feat.get("properties") or {}
        code = state_code(props)
        if code not in states:
            continue
        if (props.get("status") or "operating") not in ("operating", ""):
            continue
        km = downhill_km(props)
        if km <= 0 and props.get("id") not in by_row:
            continue
        oid = props.get("id")
        if not oid:
            continue
        loc = ab.hill_point(feat)
        base, drop = ab.elevations(props.get("statistics"))
        name = (props.get("name") or "").strip()
        west[oid] = {
            "id": oid,
            "osm_name": name,
            "state": code,
            "km": km,
            "lon": round(loc[0], 5) if loc else None,
            "lat": round(loc[1], 5) if loc else None,
            "base": base,
            "drop": drop,
            "activities": list(props.get("activities") or []),
            "runs": [],
            "lifts": [],
            "geom_runs": [],
            "geom_lifts": [],
            "use_m": {"downhill": 0.0, "cross-country": 0.0, "backcountry": 0.0},
            "private": is_private(name),
        }
    by_name_state = {}
    for oid, hill in west.items():
        by_name_state.setdefault((hill["osm_name"].lower(), hill["state"]), oid)
    remapped = []
    for row in rows:
        oid = row["OpenSkiMap id"].strip()
        if oid in west:
            continue
        alt = by_name_state.get((row["Hill"].strip().lower(), row["State"].strip().lower()))
        if not alt:
            continue
        row["OpenSkiMap id"] = alt
        remapped.append({"name": row["Hill"], "csv": oid, "openskimap": alt})
        print("remap", row["Hill"], oid, "->", alt, flush=True)
    selected_ids = [row["OpenSkiMap id"].strip() for row in rows]
    by_row = {row["OpenSkiMap id"].strip(): row for row in rows}
    missing = [oid for oid in selected_ids if oid not in west]
    if missing:
        raise SystemExit("missing areas " + ", ".join(missing))
    print("west areas with downhill", len(west), "remapped", len(remapped), flush=True)

    def take(path, keep_diff):
        kept = 0
        with open(path, "rb") as handle:
            for feat in ijson.items(handle, "features.item", use_float=True):
                props = feat.get("properties") or {}
                ids = ab.linked_ids(props, west)
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
                            west[oid]["runs"].append((diff, line))
                        west[oid]["geom_runs"].append({"name": name, "difficulty": diff, "lines": lines})
                        for bucket in buckets:
                            west[oid]["use_m"][bucket] += dist
                    else:
                        west[oid]["lifts"].extend(lines)
                        west[oid]["geom_lifts"].append({"name": name, "difficulty": None, "lines": lines})
                kept += 1
        return kept

    print("lifts", take(src / "lifts.geojson", False), flush=True)
    print("runs", take(src / "runs.geojson", True), flush=True)

    def drawable(hill):
        run_lines = [item[1] for item in hill["runs"]]
        if not run_lines:
            return False, "no linked runs"
        metres = sum(ab.line_metres(line) for line in run_lines)
        if metres < 400:
            return False, "only %.0f m of run geometry" % metres
        return True, ""

    skipped = []
    chosen = []
    used_ids = set()

    def consider(oid, reason_prefix):
        hill = west.get(oid)
        if not hill or oid in used_ids:
            return False
        if hill["private"]:
            skipped.append({"id": oid, "name": hill["osm_name"], "state": hill["state"], "reason": "private or members-only"})
            return False
        ok, why = drawable(hill)
        if not ok:
            skipped.append({"id": oid, "name": hill["osm_name"], "state": hill["state"], "reason": why})
            return False
        used_ids.add(oid)
        chosen.append(oid)
        return True

    for oid in selected_ids:
        if consider(oid, "list"):
            continue
    # Backfill from the same West ranking, highest downhill kilometres first.
    ranked = sorted(west.values(), key=lambda item: item["km"], reverse=True)
    target = len(selected_ids)
    backfills = []
    if len(chosen) < target:
        for hill in ranked:
            if len(chosen) >= target:
                break
            if hill["id"] in selected_ids or hill["id"] in used_ids:
                continue
            before = len(chosen)
            if consider(hill["id"], "backfill"):
                if len(chosen) > before:
                    backfills.append({"id": hill["id"], "name": hill["osm_name"], "state": hill["state"], "km": round(hill["km"], 1)})

    used = used_slugs(root)
    out_dir = root / "usa"
    out_dir.mkdir(parents=True, exist_ok=True)
    grouped = {code: [] for code in states}
    for oid in chosen:
        hill = west[oid]
        row = by_row.get(oid)
        label = clean_name(row["Hill"].strip() if row else hill["osm_name"], hill["state"], oid)
        if oid == "89f555b5":
            label = "Crystal Mountain, Washington"
        # full id check
        if hill["osm_name"] == "Crystal Mountain" and hill["state"] == "wa":
            label = "Crystal Mountain, Washington"
        run_lines = [item[1] for item in hill["runs"]]
        fr = ab.frame_of(run_lines, False)
        lifts_ll = ab.snap_terminals(hill["lifts"], run_lines, fr["cos"]) if fr else []
        runs = ab.project_in(hill["runs"], fr, True)
        lifts = ab.project_in(lifts_ll, fr, False)
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
            "province": "us",
            "lon": hill["lon"],
            "lat": hill["lat"],
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
        grouped[hill["state"]].append(record)
        geom = {"runs": hill["geom_runs"], "lifts": hill["geom_lifts"]}
        Path("/tmp/%s-geom.json" % slug).write_text(json.dumps(geom, ensure_ascii=False))
        print("hill", slug, hill["state"], record["type"], "runs", len(runs), "lifts", len(lifts), flush=True)

    names = []
    for code in states:
        records = grouped[code]
        if not records:
            continue
        payload = {
            "attribution": "© OpenStreetMap contributors, OpenSkiMap.org (ODbL)",
            "province": "us",
            "regions": [{"id": code, "name": STATE_NAMES[code]}],
            "counts": {"hills": len(records)},
            "hills": records,
        }
        dest = out_dir / ("%s.json" % code)
        dest.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False))
        names.append({"id": code, "name": STATE_NAMES[code], "file": "usa/%s.json" % code, "hills": len(records)})
        print("wrote", dest.name, len(records), dest.stat().st_size, flush=True)

    report = {
        "batch": batch,
        "listed": len(selected_ids),
        "kept": len(chosen),
        "states": names,
        "skipped": skipped,
        "backfills": backfills,
        "remapped": remapped,
    }
    (root / "usa-west-report.json").write_text(json.dumps(report, indent=2) + "\n")
    print("kept", len(chosen), "skipped", len(skipped), "backfills", len(backfills), flush=True)


if __name__ == "__main__":
    main()
