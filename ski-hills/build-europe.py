#!/usr/bin/env python3
"""Build European alpine ski-hill drawings from the local OpenSkiMap GeoJSON.

Rank is downhill kilometres plus 0.015 times the vertical drop, the same
size measure used for the United States list. A polygon wider than 50 km
is a pass alliance (Dolomiti Superski, Ski amadé) and is not one hill.
A point keeps its rank; if its linked runs still cover more than 50 km
it is skipped when the drawing is built. One JSON file per country.
Bird's-eye geometry is written to /tmp/{slug}-geom.json.

    python3 ski-hills/build-europe.py --batch alps --src /tmp/ski
"""
import argparse
import importlib.util
import json
from pathlib import Path

import ijson


EUROPE = {
    "AL", "AD", "AT", "BA", "BE", "BG", "BY", "CH", "CZ", "DE", "DK", "EE",
    "ES", "FI", "FR", "GB", "GR", "HR", "HU", "IE", "IS", "IT", "LI", "LT",
    "LU", "LV", "MC", "MD", "ME", "MK", "MT", "NL", "NO", "PL", "PT", "RO",
    "RS", "SE", "SI", "SK", "SM", "UA", "VA", "XK",
}
# Wider than this, a polygon is a multi-valley pass, not a drawing.
PASS_M = 50000
# KitzSki's pistes run just past the polygon hint. Still one hill.
RUN_M = 56000
BATCH_COUNTRIES = {
    "alps": ["fr", "ch", "at", "it", "li", "mc", "sm"],
    "scandinavia": ["no", "se", "fi", "is", "dk"],
    "pyrenees": ["es", "ad"],
}
COUNTRY_NAMES = {
    "fr": "France",
    "ch": "Switzerland",
    "at": "Austria",
    "it": "Italy",
    "li": "Liechtenstein",
    "mc": "Monaco",
    "sm": "San Marino",
    "no": "Norway",
    "se": "Sweden",
    "fi": "Finland",
    "is": "Iceland",
    "dk": "Denmark",
    "es": "Spain",
    "ad": "Andorra",
    "de": "Germany",
    "si": "Slovenia",
    "sk": "Slovakia",
    "cz": "Czechia",
    "pl": "Poland",
    "bg": "Bulgaria",
    "ro": "Romania",
    "gb": "United Kingdom",
    "rs": "Serbia",
    "ua": "Ukraine",
    "ba": "Bosnia and Herzegovina",
    "me": "Montenegro",
    "mk": "North Macedonia",
    "hr": "Croatia",
    "gr": "Greece",
    "al": "Albania",
    "pt": "Portugal",
    "nl": "Netherlands",
    "be": "Belgium",
    "ie": "Ireland",
    "hu": "Hungary",
    "ee": "Estonia",
    "lv": "Latvia",
    "lt": "Lithuania",
    "by": "Belarus",
    "md": "Moldova",
    "xk": "Kosovo",
    "lu": "Luxembourg",
    "mt": "Malta",
    "va": "Vatican City",
}


def load_alberta():
    path = Path(__file__).resolve().parent / "build-alberta.py"
    spec = importlib.util.spec_from_file_location("build_alberta", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def downhill_stats(props):
    stats = props.get("statistics") if isinstance(props.get("statistics"), dict) else {}
    runs = stats.get("runs") if isinstance(stats.get("runs"), dict) else {}
    by = runs.get("byActivity") if isinstance(runs.get("byActivity"), dict) else {}
    down = by.get("downhill") if isinstance(by.get("downhill"), dict) else {}
    diff = down.get("byDifficulty") if isinstance(down.get("byDifficulty"), dict) else {}
    km = 0.0
    elevs = []
    for block in diff.values():
        if not isinstance(block, dict):
            continue
        if isinstance(block.get("lengthInKm"), (int, float)):
            km += float(block["lengthInKm"])
        for key in ("minElevation", "maxElevation"):
            if isinstance(block.get(key), (int, float)):
                elevs.append(float(block[key]))
    vertical = (max(elevs) - min(elevs)) if len(elevs) >= 2 else 0.0
    return km, vertical


def euro_codes(props):
    codes = []
    for place in props.get("places") or []:
        if not isinstance(place, dict):
            continue
        code = place.get("iso3166_1Alpha2") or ""
        if code in EUROPE and code not in codes:
            codes.append(code)
    return codes


def rank_areas(features):
    by_id = {}
    for feat in features:
        props = feat.get("properties") or {}
        oid = props.get("id")
        if not oid:
            continue
        geom = (feat.get("geometry") or {}).get("type") or ""
        prev = by_id.get(oid)
        if prev and prev["geom"] in ("Polygon", "MultiPolygon") and geom == "Point":
            continue
        codes = euro_codes(props)
        if not codes:
            continue
        if (props.get("status") or "operating") not in ("operating", ""):
            continue
        if "downhill" not in set(props.get("activities") or []):
            continue
        name = (props.get("name") or "").strip()
        low = name.lower()
        if "private" in low or "members" in low:
            continue
        km, vertical = downhill_stats(props)
        if km < 1:
            continue
        hint = props.get("viewportHint") or {}
        span = max(float(hint.get("rotatedWidthMeters") or 0), float(hint.get("rotatedHeightMeters") or 0))
        if geom in ("Polygon", "MultiPolygon") and span > PASS_M:
            continue
        by_id[oid] = {
            "id": oid,
            "name": name,
            "cc": codes[0].lower(),
            "countries": [code.lower() for code in codes],
            "km": round(km, 1),
            "vertical": round(vertical),
            "span": round(span),
            "geom": geom,
            "score": round(km + 0.015 * vertical, 2),
            "feat": feat,
        }
    rows = sorted(by_id.values(), key=lambda item: (-item["score"], item["name"], item["id"]))
    return rows


def batch_of(code):
    for name, codes in BATCH_COUNTRIES.items():
        if code in codes:
            return name
    return "rest"


def used_slugs(root, replace_countries=()):
    """Slugs already taken. Country files this batch rewrites are not reserved."""
    replace = set(replace_countries or ())
    used = set()
    for folder in (root, root / "usa", root / "europe"):
        if not folder.exists():
            continue
        for path in folder.glob("*.json"):
            if folder.name == "europe" and path.stem in replace:
                continue
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
                if hill.get("id"):
                    used.add("id:" + hill["id"])
    frontal = root / "frontal"
    if frontal.exists():
        for path in frontal.glob("*.svg"):
            used.add(path.stem)
    contours = root / "contours"
    if contours.exists():
        for path in contours.glob("*.json"):
            if path.name.endswith("-index.json") or path.name == "index.json":
                continue
            used.add(path.stem)
    return used


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch", required=True, choices=["alps", "scandinavia", "pyrenees", "rest"])
    parser.add_argument("--src", default="/tmp/ski")
    parser.add_argument("--top", type=int, default=200)
    args = parser.parse_args()
    ab = load_alberta()
    root = Path(__file__).resolve().parent
    src = Path(args.src)
    areas = json.loads((src / "ski_areas.geojson").read_text())
    ranked = rank_areas(areas["features"])
    print("ranked", len(ranked), "top", args.top, flush=True)
    selected = []
    pool = []
    for index, row in enumerate(ranked):
        if batch_of(row["cc"]) != args.batch:
            continue
        if len(selected) < args.top and index < args.top:
            selected.append(row)
        elif index >= args.top:
            pool.append(row)
    # A top-200 hill whose country is this batch. `index < top` is the
    # global cut; selected is that slice, pool is the regional backfill.
    print("batch", args.batch, "listed", len(selected), "backfill pool", len(pool), flush=True)
    if not selected and not pool:
        raise SystemExit("no hills in " + args.batch)

    wanted_rows = selected + pool
    wanted = {}
    for row in wanted_rows:
        props = row["feat"].get("properties") or {}
        loc = ab.hill_point(row["feat"])
        base, drop = ab.elevations(props.get("statistics"))
        wanted[row["id"]] = {
            "id": row["id"],
            "name": row["name"],
            "cc": row["cc"],
            "km": row["km"],
            "score": row["score"],
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
        }
        row.pop("feat", None)
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
                ids = ab.linked_ids(props, wanted)
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
                            wanted[oid]["runs"].append((diff, line))
                        wanted[oid]["geom_runs"].append(
                            {"name": name, "difficulty": diff, "kind": kind, "lines": lines}
                        )
                        for bucket in buckets:
                            wanted[oid]["use_m"][bucket] += dist
                    else:
                        wanted[oid]["lifts"].extend(lines)
                        wanted[oid]["geom_lifts"].append({"name": name, "difficulty": None, "lines": lines})
                kept += 1
        print(path.name, "features", seen, "linked", kept, flush=True)
        return kept

    print("lifts", take(src / "lifts.geojson", False), flush=True)
    print("runs", take(src / "runs.geojson", True), flush=True)

    def consider(row):
        hill = wanted.get(row["id"])
        if not hill:
            return False, "missing area"
        if hill["lat"] is None or hill["lon"] is None:
            return False, "no location"
        run_lines = [item[1] for item in hill["runs"]]
        if not run_lines:
            return False, "no linked runs"
        metres = sum(ab.line_metres(line) for line in run_lines)
        if metres < 400:
            return False, "only %.0f m of run geometry" % metres
        fr = ab.frame_of(run_lines, False)
        if not fr or fr["span"] > RUN_M:
            span_km = (fr["span"] / 1000.0) if fr else 0
            return False, "runs cover %.1f km" % span_km
        kind = ab.hill_type(
            hill["name"],
            hill.get("activities"),
            bool(hill["lifts"]),
            hill["use_m"].get("downhill", 0),
            hill["use_m"].get("cross-country", 0),
            hill["use_m"].get("backcountry", 0),
        )
        if kind != "downhill":
            return False, "mapped geometry is " + kind
        return True, ""

    skipped = []
    chosen = []
    used_ids = set()
    for row in selected:
        ok, why = consider(row)
        if not ok:
            skipped.append({"id": row["id"], "name": row["name"], "cc": row["cc"], "reason": why, "score": row["score"]})
            print("skip", row["cc"], row["name"], why, flush=True)
            continue
        used_ids.add(row["id"])
        chosen.append(row)
    backfills = []
    target = len(selected)
    if len(chosen) < target:
        for row in pool:
            if len(chosen) >= target:
                break
            if row["id"] in used_ids:
                continue
            ok, why = consider(row)
            if not ok:
                continue
            used_ids.add(row["id"])
            chosen.append(row)
            backfills.append({"id": row["id"], "name": row["name"], "cc": row["cc"], "score": row["score"]})
            print("backfill", row["cc"], row["name"], row["score"], flush=True)

    replace = BATCH_COUNTRIES.get(args.batch) or []
    if args.batch == "rest":
        reserved = {code for codes in BATCH_COUNTRIES.values() for code in codes}
        replace = [path.stem for path in (root / "europe").glob("*.json") if path.stem not in reserved] if (root / "europe").exists() else []
    used = used_slugs(root, replace)
    out_dir = root / "europe"
    out_dir.mkdir(parents=True, exist_ok=True)
    order = BATCH_COUNTRIES.get(args.batch)
    if not order:
        seen = []
        for row in chosen:
            if row["cc"] not in seen:
                seen.append(row["cc"])
        order = seen
    grouped = {code: [] for code in order}
    combined = []
    for row in chosen:
        hill = wanted[row["id"]]
        if ("id:" + hill["id"]) in used:
            print("already drawn", hill["name"], flush=True)
            continue
        runs, lifts, geom_runs, stats, _raw = ab.framed_parts(hill["runs"], hill["lifts"], hill["geom_runs"])
        hill["geom_runs"] = geom_runs
        if stats["dropped"] or stats["replaced"] or stats["dupes"]:
            print("dedupe", hill["name"], stats, flush=True)
        label = hill["name"]
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
            "region": hill["cc"],
            "province": "eu",
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
        grouped.setdefault(hill["cc"], []).append(record)
        combined.append(record)
        geom = {"runs": hill["geom_runs"], "lifts": hill["geom_lifts"]}
        Path("/tmp/%s-geom.json" % slug).write_text(json.dumps(geom, ensure_ascii=False))
        print("hill", slug, hill["cc"], record["type"], "runs", len(runs), "lifts", len(lifts), "score", hill["score"], flush=True)

    written = []
    for code in order:
        records = grouped.get(code) or []
        if not records:
            continue
        payload = {
            "attribution": "© OpenStreetMap contributors, OpenSkiMap.org (ODbL)",
            "province": "eu",
            "regions": [{"id": code, "name": COUNTRY_NAMES.get(code, code.upper())}],
            "counts": {"hills": len(records)},
            "hills": records,
        }
        dest = out_dir / ("%s.json" % code)
        dest.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False))
        written.append({"id": code, "name": COUNTRY_NAMES.get(code, code.upper()), "hills": len(records), "bytes": dest.stat().st_size})
        print("wrote", dest.name, len(records), dest.stat().st_size, flush=True)

    manifest = {
        "batch": args.batch,
        "kept": [
            {"slug": row["slug"], "name": row["name"], "cc": row["region"], "type": row["type"], "runs": len(row["runs"])}
            for row in combined
        ],
        "skipped": skipped,
        "backfills": backfills,
        "files": written,
    }
    Path("/tmp/ski/europe-%s-report.json" % args.batch).write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    Path("/tmp/ski/europe-%s-hills.json" % args.batch).write_text(
        json.dumps({"hills": combined}, ensure_ascii=False)
    )
    print("kept", len(combined), "skipped", len(skipped), "backfills", len(backfills), flush=True)


if __name__ == "__main__":
    main()
