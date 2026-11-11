#!/usr/bin/env python3
"""Rebuild a hill's working files from the original OpenSkiMap sources.

Usage:
    python3 ski-hills/setup-build-inputs.py <slug> [...]

Writes <slug>-geom.json (Cypress: cypress-mountain-geom.json) to
ski-hills/build-inputs/, which build-frontal.py's _input() reads first.
Then cuts <slug>-dem-wide.tif (Cypress: cypress-dem-wide.tif) into the
same folder through build-frontal.ensure_dem.

Geom selection is the mkgeom.py path: stream OpenSkiMap runs.geojson and
lifts.geojson with ijson, keep features whose skiAreas id is in
hill-index.json, then run build-alberta.framed_parts() so doubled piste
outlines are dropped. All uses linked to that ski area are kept.
OpenSkiMap ski area IDs are content hashes and can change, so a feature
also matches when its ski area name equals the hill-index name.

OpenSkiMap data is © OpenStreetMap contributors, OpenSkiMap.org, ODbL.
Source files: https://tiles.openskimap.org/geojson/runs.geojson
              https://tiles.openskimap.org/geojson/lifts.geojson
Downloads are cached outside the repo. Existing caches in
/workspace/osm-full or /tmp/ski are used as-is.
"""
from __future__ import annotations

import importlib.util
import json
import sys
import time
import urllib.request
from pathlib import Path

import ijson

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
BUILD_INPUTS = ROOT / "build-inputs"
HILL_INDEX = ROOT / "hill-index.json"
BUILD_ALBERTA = ROOT / "build-alberta.py"
BUILD_FRONTAL = ROOT / "build-frontal.py"

RUNS_URL = "https://tiles.openskimap.org/geojson/runs.geojson"
LIFTS_URL = "https://tiles.openskimap.org/geojson/lifts.geojson"
CACHE_CANDIDATES = (
    Path("/workspace/osm-full"),
    Path("/tmp/ski"),
    Path("/tmp/openskimap-cache"),
)
DOWNLOAD_CACHE = Path("/tmp/openskimap-cache")

# Cypress DEM keeps the historical short name the build already looks up.
DEM_NAME_OVERRIDES = {
    "cypress-mountain": "cypress-dem-wide.tif",
}


def load_alberta():
    spec = importlib.util.spec_from_file_location("build_alberta", BUILD_ALBERTA)
    ab = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ab)
    return ab


def load_frontal():
    spec = importlib.util.spec_from_file_location("build_frontal", BUILD_FRONTAL)
    bf = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bf)
    return bf


def geom_name(slug: str) -> str:
    return f"{slug}-geom.json"


def dem_name(slug: str) -> str:
    return DEM_NAME_OVERRIDES.get(slug, f"{slug}-dem-wide.tif")


def load_hills(slugs):
    idx = json.loads(HILL_INDEX.read_text())
    rows = idx if isinstance(idx, list) else idx["hills"]
    by_slug = {h["slug"]: h for h in rows}
    missing = [s for s in slugs if s not in by_slug]
    if missing:
        raise SystemExit("unknown slug%s: %s" % ("s" if len(missing) > 1 else "", ", ".join(missing)))
    wanted = {}
    names = {}
    for slug in slugs:
        hill = by_slug[slug]
        rec = {
            "slug": slug,
            "name": hill.get("name"),
            "runs": [],
            "lifts": [],
            "geom_runs": [],
            "geom_lifts": [],
        }
        wanted[hill["id"]] = rec
        if hill.get("name"):
            names[hill["name"]] = hill["id"]
    return wanted, names


def cache_has_sources(folder: Path) -> bool:
    return (folder / "runs.geojson").is_file() and (folder / "lifts.geojson").is_file()


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    print("download", url, "->", dest, flush=True)
    req = urllib.request.Request(url, headers={"User-Agent": "ski-hills-setup-build-inputs/1.0"})
    with urllib.request.urlopen(req) as resp, tmp.open("wb") as out:
        while True:
            chunk = resp.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
    tmp.replace(dest)


def resolve_cache() -> Path:
    for folder in CACHE_CANDIDATES:
        if cache_has_sources(folder):
            print("openskimap cache", folder, flush=True)
            return folder
    DOWNLOAD_CACHE.mkdir(parents=True, exist_ok=True)
    for url, name in ((RUNS_URL, "runs.geojson"), (LIFTS_URL, "lifts.geojson")):
        dest = DOWNLOAD_CACHE / name
        if not dest.is_file():
            download(url, dest)
    print("openskimap cache", DOWNLOAD_CACHE, flush=True)
    return DOWNLOAD_CACHE


def linked_ids(props, wanted, names):
    """mkgeom/build-alberta linked_ids, plus exact ski area name and flat records.

    OpenSkiMap IDs are content hashes and can change (Grouse and Whistler
    did between hill-index and the current dump). Flattened skiAreas from
    the BC pre-extract omit the nested properties wrapper.
    """
    ids = []
    seen = set()
    for area in props.get("skiAreas") or []:
        if isinstance(area, dict):
            pr = area.get("properties") or area
            pid = pr.get("id")
            area_name = pr.get("name")
        else:
            pid = area if isinstance(area, str) else None
            area_name = None
        oid = pid if pid in wanted else names.get(area_name)
        if oid and oid not in seen:
            seen.add(oid)
            ids.append(oid)
    return ids


def extract_geom(slugs, ab, src: Path):
    """One pass over runs.geojson and lifts.geojson, same loop as mkgeom.py."""
    wanted, names = load_hills(slugs)
    for fn, isrun in (("lifts.geojson", False), ("runs.geojson", True)):
        path = src / fn
        print("read", path, flush=True)
        with path.open("rb") as fh:
            for feat in ijson.items(fh, "features.item", use_float=True):
                props = feat.get("properties") or {}
                ids = linked_ids(props, wanted, names)
                if not ids:
                    continue
                lines = ab.lines_of(feat.get("geometry"))
                if not lines:
                    continue
                name = props.get("name")
                name = name.strip() or None if isinstance(name, str) else None
                diff = props.get("difficulty")
                diff = (
                    diff.strip().lower()
                    if isrun and isinstance(diff, str) and diff.strip()
                    else None
                )
                kind = (feat.get("geometry") or {}).get("type") or ""
                for oid in ids:
                    hill = wanted[oid]
                    if isrun:
                        for line in lines:
                            hill["runs"].append((diff, line))
                        hill["geom_runs"].append(
                            {"name": name, "difficulty": diff, "kind": kind, "lines": lines}
                        )
                    else:
                        hill["lifts"].extend(lines)
                        hill["geom_lifts"].append(
                            {"name": name, "difficulty": None, "lines": lines}
                        )
    out = {}
    for hill in wanted.values():
        _runs, _lifts, geom_runs, stats, _raw = ab.framed_parts(
            hill["runs"], hill["lifts"], hill["geom_runs"]
        )
        payload = {"runs": geom_runs, "lifts": hill["geom_lifts"]}
        out[hill["slug"]] = (payload, stats)
    return out


def write_geom(slug: str, payload) -> Path:
    BUILD_INPUTS.mkdir(parents=True, exist_ok=True)
    path = BUILD_INPUTS / geom_name(slug)
    path.write_text(json.dumps(payload, ensure_ascii=False))
    return path


def cut_dem(bf, slug: str, payload) -> Path:
    """Cut the DEM through build-frontal.ensure_dem into build-inputs/, never /tmp."""
    dem_path = BUILD_INPUTS / dem_name(slug)
    geom_path = BUILD_INPUTS / geom_name(slug)
    BUILD_INPUTS.mkdir(parents=True, exist_ok=True)
    bf.GEOM = geom_path
    bf.DEM = dem_path
    box = bf.wide_box(payload["runs"], payload["lifts"])
    print(slug, "dem_box", tuple(round(v, 5) for v in box), "->", dem_path, flush=True)
    bf.ensure_dem(box)
    return dem_path


def main(argv):
    slugs = argv[1:]
    if not slugs:
        raise SystemExit("usage: python3 ski-hills/setup-build-inputs.py <slug> [...]")
    ab = load_alberta()
    src = resolve_cache()
    t0 = time.perf_counter()
    extracted = extract_geom(slugs, ab, src)
    extract_s = time.perf_counter() - t0
    print(
        "extract_seconds",
        round(extract_s, 2),
        "hills",
        len(extracted),
        flush=True,
    )
    for slug in slugs:
        payload, stats = extracted[slug]
        path = write_geom(slug, payload)
        print(
            slug,
            "geom",
            path,
            "runs",
            len(payload["runs"]),
            "lifts",
            len(payload["lifts"]),
            "stats",
            stats,
            flush=True,
        )
    t1 = time.perf_counter()
    bf = None
    for slug in slugs:
        payload, _stats = extracted[slug]
        if bf is None:
            bf = load_frontal()
        dem_path = cut_dem(bf, slug, payload)
        size = dem_path.stat().st_size if dem_path.exists() else 0
        print(slug, "dem", dem_path, "bytes", size, flush=True)
    dem_s = time.perf_counter() - t1
    print("dem_seconds", round(dem_s, 2), flush=True)


if __name__ == "__main__":
    main(sys.argv)
