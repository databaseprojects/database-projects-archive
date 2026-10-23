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
NEW_ENGLAND_STATES = ["me", "nh", "vt", "ma"]
MIDATLANTIC_STATES = ["ny", "pa", "nj", "md", "wv"]
MIDWEST_STATES = ["mn", "wi", "mi"]
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
    "me": "Maine",
    "nh": "New Hampshire",
    "vt": "Vermont",
    "ma": "Massachusetts",
    "ny": "New York",
    "pa": "Pennsylvania",
    "nj": "New Jersey",
    "md": "Maryland",
    "wv": "West Virginia",
    "mn": "Minnesota",
    "wi": "Wisconsin",
    "mi": "Michigan",
}
BATCH_STATES = {
    "west": WEST_STATES,
    "new england": NEW_ENGLAND_STATES,
    "new york & mid-atlantic": MIDATLANTIC_STATES,
    "midwest": MIDWEST_STATES,
}

def mountain_range(state, lat, lon, slug=""):
    """Mountain range for a US hill, from its coordinates.

    State filters keep the postal code on ``region``. This is the caption
    REGION: the range itself, with the broader name (Cascades, Sierra
    Nevada, Rockies, Appalachians) where the hill is not in a tighter one.
    """
    state = (state or "").lower()
    slug = slug or ""
    if slug in RANGE_OVERRIDES:
        return RANGE_OVERRIDES[slug]
    if state == "wa":
        if lon < -123.0 and lat > 47.6:
            return "Olympic Mountains"
        if lon > -118.2 and lat > 47.6:
            return "Selkirk Mountains"
        if lat > 48.5 and -119.6 < lon < -118.5:
            return "Kettle River Range"
        if lat < 46.4 and lon > -118.3:
            return "Blue Mountains"
        return "Cascades"
    if state == "or":
        if lon > -117.8:
            return "Wallowa Mountains"
        if lon > -118.6 and lat > 44.6:
            return "Blue Mountains"
        if lat < 42.5 and lon > -121.0:
            return "Warner Mountains"
        if lat < 42.5:
            return "Siskiyou Mountains"
        return "Cascades"
    if state == "ca":
        if lat > 41.1 and lon < -121.6:
            return "Cascades"
        if lat > 41.2 and lon > -120.8:
            return "Warner Mountains"
        if 40.2 < lat < 40.6 and -121.2 < lon < -120.6:
            return "Diamond Mountains"
        if lat < 34.55 and lon > -117.2:
            return "San Bernardino Mountains"
        if lat < 34.55:
            return "San Gabriel Mountains"
        return "Sierra Nevada"
    if state == "nv":
        if lat < 37.5:
            return "Spring Mountains"
        if lat > 40.4:
            return "Ruby Mountains"
        return "Sierra Nevada"
    if state == "id":
        if lat > 47.9:
            return "Selkirk Mountains"
        if lat > 46.8 and lon < -115.2:
            return "Bitterroot Range"
        if 45.5 < lat < 46.0 and -114.3 < lon < -113.6:
            return "Bitterroot Range"
        if 43.3 < lat < 43.9 and -115.0 < lon < -114.1:
            return "Sawtooth Range"
        if 44.2 < lat < 44.8 and -114.7 < lon < -113.9:
            return "Lost River Range"
        if 42.1 < lat < 42.5 and -113.9 < lon < -113.3:
            return "Albion Range"
        if 45.8 < lat < 46.8 and lon < -115.4:
            return "Clearwater Mountains"
        return "Rockies"
    if state == "mt":
        if 45.5 < lat < 46.0 and -114.3 < lon < -113.6:
            return "Bitterroot Range"
        if 44.9 < lat < 45.5 and -109.8 < lon < -109.1:
            return "Beartooth Mountains"
        if lat > 47.9 and -110.2 < lon < -109.2:
            return "Bear Paw Mountains"
        return "Rockies"
    if state == "wy":
        if 43.2 < lat < 44.1 and -111.2 < lon < -110.5:
            return "Teton Range"
        if lat > 44.7 and lon < -109.1:
            return "Beartooth Mountains"
        if 42.7 < lat < 43.3 and -110.2 < lon < -109.4:
            return "Wind River Range"
        if 44.2 < lat < 44.8 and -110.3 < lon < -109.6:
            return "Absaroka Range"
        if 44.0 < lat < 45.2 and -108.0 < lon < -106.8:
            return "Bighorn Mountains"
        if lat < 41.6 and lon > -106.6:
            return "Medicine Bow Mountains"
        return "Rockies"
    if state == "ut":
        if lat < 38.0:
            return "Markagunt Plateau"
        if lat < 39.0 and lon < -112.0:
            return "Tushar Mountains"
        return "Wasatch Range"
    if state == "co":
        if lat < 37.6 and -105.6 < lon < -104.6:
            return "Sangre de Cristo Mountains"
        if lat > 38.5 and lon < -108.0:
            return "Grand Mesa"
        if lat < 38.05 and lon < -106.4:
            return "San Juan Mountains"
        return "Rockies"
    if state == "az":
        if lat > 34.5 and lon < -111.2:
            return "San Francisco Peaks"
        if lat < 33.5:
            return "Santa Catalina Mountains"
        return "White Mountains"
    if state == "nm":
        if 35.6 < lat < 36.2 and lon < -106.1:
            return "Jemez Mountains"
        if lat < 35.6 and lon < -106.0:
            return "Sandia Mountains"
        if lat < 34.0:
            return "Sacramento Mountains"
        return "Sangre de Cristo Mountains"
    if state == "sd":
        if lon > -100.0:
            return "Coteau des Prairies"
        return "Black Hills"
    if state == "me":
        if 44.15 < lat < 44.85 and -71.05 < lon < -70.35:
            return "White Mountains"
        if lat > 44.9 and lon < -69.4:
            return "Longfellow Mountains"
        if lat < 44.4 and lon > -69.5:
            return "Camden Hills"
        return "Appalachians"
    if state == "nh":
        if lat >= 43.70:
            return "White Mountains"
        return "Appalachians"
    if state == "vt":
        return "Green Mountains"
    if state == "ma":
        if lon < -72.75:
            return "Berkshires"
        return "Appalachians"
    if state == "ny":
        if 42.0 < lat < 42.4 and -73.7 < lon < -73.2:
            return "Berkshires"
        if 41.45 < lat < 42.45 and -75.2 < lon < -74.05:
            return "Catskills"
        if -76.2 < lon < -75.2 and 43.15 < lat < 44.3:
            return "Tug Hill"
        if lat > 43.0 and lon < -76.5:
            return "Central Lowland"
        if lat > 43.05 and lon < -73.45:
            return "Adirondacks"
        return "Appalachians"
    if state == "pa":
        if 40.75 < lat < 42.0 and -76.0 < lon < -74.85:
            return "Poconos"
        if lat > 41.6 and lon < -79.8:
            return "Central Lowland"
        return "Appalachians"
    if state in ("nj", "md", "wv", "va", "al", "oh", "in"):
        if state == "va" and lat < 38.1 and lon > -79.3:
            return "Blue Ridge Mountains"
        if state == "oh" and lon < -83.2:
            return "Central Lowland"
        return "Appalachians"
    if state == "nc":
        return "Blue Ridge Mountains"
    if state == "tn":
        return "Great Smoky Mountains"
    if state == "ct":
        if lon < -73.1:
            return "Berkshires"
        return "Appalachians"
    if state == "ri":
        return "Appalachians"
    if state == "mn":
        if lat > 47.4 and -91.3 < lon < -90.2:
            return "Sawtooth Mountains"
        if 47.3 < lat < 47.9 and -92.8 < lon < -91.8:
            return "Laurentian Upland"
        if lat > 46.2 and lon > -94.5:
            return "Superior Upland"
        return "Central Lowland"
    if state == "wi":
        if 46.15 < lat < 46.6 and -90.8 < lon < -90.0:
            return "Penokee Range"
        if slug == "devil-s-head-ski-area":
            return "Baraboo Range"
        if lat < 44.3 and -91.6 < lon < -89.0:
            return "Driftless Area"
        if lat < 43.9 and lon > -89.3:
            return "Kettle Moraine"
        if lat >= 45.0 or (lat >= 44.4 and lon < -89.5):
            return "Superior Upland"
        return "Central Lowland"
    if state == "mi":
        if lat > 46.6 and lon < -89.3:
            return "Porcupine Mountains"
        if 46.35 < lat < 46.65 and -90.4 < lon < -89.85:
            return "Penokee Range"
        if 46.4 < lat < 46.7 and -87.7 < lon < -87.1:
            return "Huron Mountains"
        if lat > 46.9 and lon > -89.0:
            return "Keweenaw Peninsula"
        if lat >= 44.0:
            return "Superior Upland"
        return "Central Lowland"
    if state == "il":
        if lon < -89.5:
            return "Driftless Area"
        return "Central Lowland"
    if state == "ia":
        if lon < -95.3:
            return "Loess Hills"
        if lon > -91.6:
            return "Driftless Area"
        return "Central Lowland"
    if state == "mo":
        if lon > -91.5:
            return "Ozark Mountains"
        return "Loess Hills"
    if state == "nd":
        if lat > 48.7 and lon < -99.5:
            return "Turtle Mountains"
        if lat > 48.5 and lon > -99.0:
            return "Pembina Hills"
        if lon < -100.0:
            return "Missouri Coteau"
        return "Coteau des Prairies"
    return "Rockies"


# A few hills sit on the wrong side of a box edge.
RANGE_OVERRIDES = {
    "storrs-hill-ski-area": "Appalachians",
    "whaleback-mountain": "Appalachians",
    "teton-pass-ski-resort": "Rockies",
    "hoedown-hill": "Rockies",
    "val-bialas-ski-center": "Appalachians",
    "cascade-mountain": "Central Lowland",
    "devil-s-head-ski-area": "Baraboo Range",
}


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
    # Two Crystal Mountains, one in Washington and one in Michigan.
    if name == "Crystal Mountain" and state == "wa":
        return "Crystal Mountain, Washington"
    if name == "Crystal Mountain" and state == "mi":
        return "Crystal Mountain, Michigan"
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
                kind = (feat.get("geometry") or {}).get("type") or ""
                buckets = ab.use_buckets(props.get("uses")) if keep_diff else set()
                dist = sum(ab.line_metres(line) for line in lines) if buckets else 0
                for oid in ids:
                    if keep_diff:
                        for line in lines:
                            west[oid]["runs"].append((diff, line))
                        west[oid]["geom_runs"].append(
                            {"name": name, "difficulty": diff, "kind": kind, "lines": lines}
                        )
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
        if hill["osm_name"] == "Crystal Mountain" and hill["state"] in ("wa", "mi"):
            label = clean_name(hill["osm_name"], hill["state"], oid)
        runs, lifts, geom_runs, stats, run_lines = ab.framed_parts(
            hill["runs"], hill["lifts"], hill["geom_runs"]
        )
        hill["geom_runs"] = geom_runs
        if stats["dropped"] or stats["replaced"] or stats["dupes"]:
            print("dedupe", label, stats, flush=True)
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
            "range": mountain_range(hill["state"], hill["lat"], hill["lon"], slug),
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
    report_name = "usa-%s-report.json" % batch.replace(" & ", "-").replace(" ", "-")
    (root / report_name).write_text(json.dumps(report, indent=2) + "\n")
    print("kept", len(chosen), "skipped", len(skipped), "backfills", len(backfills), flush=True)


if __name__ == "__main__":
    main()
