#!/usr/bin/env python3
"""Write hill-index.json: one row per drawn ski hill, without run geometry.

The page uses this for dots, counts, search, and filters, then fetches a
province or state file only when that place is open or a card is drawn.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# Same files the page adopts, in the same first-seen order.
# hills.json is first, so the two Alberta hills stored there keep that copy.
SOURCES = [
    ("bc", ROOT / "hills.json", ROOT / "names.json"),
    ("ab", ROOT / "alberta.json", ROOT / "alberta-names.json"),
    ("qc", ROOT / "quebec.json", ROOT / "quebec-names.json"),
    ("on", ROOT / "ontario.json", ROOT / "ontario-names.json"),
    ("sk", ROOT / "saskatchewan.json", ROOT / "saskatchewan-names.json"),
    ("mb", ROOT / "manitoba.json", ROOT / "manitoba-names.json"),
    ("nb", ROOT / "new-brunswick.json", ROOT / "new-brunswick-names.json"),
    ("nl", ROOT / "newfoundland.json", ROOT / "newfoundland-names.json"),
    ("ns", ROOT / "nova-scotia.json", ROOT / "nova-scotia-names.json"),
    ("pe", ROOT / "prince-edward-island.json", ROOT / "prince-edward-island-names.json"),
    ("yt", ROOT / "yukon.json", ROOT / "yukon-names.json"),
    ("nt", ROOT / "northwest-territories.json", ROOT / "northwest-territories-names.json"),
]

US_STATES = [
    "wa", "or", "ca", "nv", "id", "mt", "wy", "ut", "co", "az", "nm", "sd",
    "me", "nh", "vt", "ma", "ny", "pa", "nj", "md", "wv", "mn", "wi", "mi",
    "ct", "ri", "va",
    "oh", "il", "in", "ia", "nd", "mo", "nc", "al", "tn",
]

# Appended after the United States so the first 503 rows stay put.
# Later European batches add countries at the end of this list.
EU_COUNTRIES = ["fr", "ch", "at", "it", "no", "se", "fi", "es", "ad", "rs", "ua", "sk", "bg", "de", "cz"]


def points_of(run):
    if isinstance(run, dict):
        return run.get("p") or ""
    return run or ""


def bounds_of(hill):
    min_x = min_y = float("inf")
    max_x = max_y = float("-inf")

    def take(pts):
        nonlocal min_x, min_y, max_x, max_y
        if not isinstance(pts, str):
            return
        for pair in pts.split():
            if "," not in pair:
                continue
            raw_x, raw_y = pair.split(",", 1)
            x = float(raw_x)
            y = float(raw_y)
            if x < min_x:
                min_x = x
            if y < min_y:
                min_y = y
            if x > max_x:
                max_x = x
            if y > max_y:
                max_y = y

    for run in hill.get("runs") or []:
        take(points_of(run))
    for lift in hill.get("lifts") or []:
        take(lift if isinstance(lift, str) else points_of(lift))
    if min_x == float("inf"):
        return None
    return [min_x, min_y, max_x, max_y]


def load_names(path):
    if path is None or not path.exists():
        return {}
    data = json.loads(path.read_text())
    return data if isinstance(data, dict) else {}


def row_for(hill, catalog, names):
    runs = hill.get("runs") or []
    if not runs:
        return None
    override = names.get(hill.get("id")) or {}
    name = override.get("name") or hill.get("name") or ""
    if hill.get("province"):
        province = hill.get("province")
    elif catalog.startswith("us-"):
        province = "us"
    elif catalog.startswith("eu-"):
        province = "eu"
    else:
        province = "bc"
    row = {
        "id": hill["id"],
        "slug": hill.get("slug") or "",
        "name": name,
        "region": hill.get("region"),
        "province": province,
        "lat": hill.get("lat"),
        "lon": hill.get("lon"),
        "type": hill.get("type") or "",
        "runs": len(runs),
        "bounds": bounds_of(hill),
        "catalog": catalog,
    }
    if hill.get("admin"):
        row["admin"] = hill["admin"]
    boost = hill.get("popularBoost")
    if isinstance(boost, (int, float)) and boost:
        row["popularBoost"] = boost
    return row


def main():
    sources = list(SOURCES)
    for state in US_STATES:
        sources.append(("us-" + state, ROOT / "usa" / (state + ".json"), None))
    for code in EU_COUNTRIES:
        path = ROOT / "europe" / (code + ".json")
        folder = ROOT / "europe" / code
        if path.exists():
            sources.append(("eu-" + code, path, None))
        elif folder.is_dir():
            sources.append(("eu-" + code, folder, None))
    # Canada and the United States rows stay as published. Rebuilding
    # bounds from the deduped runs would move cards that were framed earlier.
    frozen = {}
    out = ROOT / "hill-index.json"
    if out.exists():
        for row in json.loads(out.read_text()).get("hills") or []:
            if not str(row.get("catalog") or "").startswith("eu-"):
                frozen[row["id"]] = row
    seen = set()
    rows = []
    for catalog, path, names_path in sources:
        if path.is_dir():
            data = {"hills": [json.loads(child.read_text()) for child in sorted(path.glob("*.json"))]}
        else:
            data = json.loads(path.read_text())
        names = load_names(names_path)
        for hill in data.get("hills") or []:
            ident = hill.get("id")
            if not ident or ident in seen:
                continue
            row = row_for(hill, catalog, names)
            if not row:
                continue
            if ident in frozen:
                row = frozen[ident]
            seen.add(ident)
            rows.append(row)
    # 503 is Canada and the United States. Europe is appended after that.
    if len(rows) < 503:
        raise SystemExit("expected at least 503 hills, got %s" % len(rows))
    # 503 is the original Canada and United States list. West added 53,
    # New England added 44, the Mid-Atlantic added 60, and the Great Lakes
    # added 67. Later state catalogs brought the frozen Canada/US set to 756.
    if len(frozen) != 756:
        raise SystemExit("expected 756 existing Canada/US rows, found %s" % len(frozen))
    missing = [row["slug"] for row in rows if not row["bounds"] or row["lat"] is None or row["lon"] is None]
    if missing:
        raise SystemExit("hills missing bounds or coordinates: %s" % ", ".join(missing))
    published = json.loads((ROOT / "hill-index.json").read_text()).get("hills") or []
    order = {row["id"]: i for i, row in enumerate(published)}
    rows.sort(key=lambda row: (order.get(row["id"], len(order)), row.get("slug") or ""))
    out = ROOT / "hill-index.json"
    out.write_text(json.dumps({"hills": rows}, separators=(",", ":")) + "\n")
    print("wrote %s (%s hills, %s bytes)" % (out.name, len(rows), out.stat().st_size))


if __name__ == "__main__":
    main()
