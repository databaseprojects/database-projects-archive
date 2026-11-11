#!/usr/bin/env python3
"""Gather a hill's working files into ski-hills/build-inputs/.

Usage:
    python3 ski-hills/setup-build-inputs.py <slug> [...]

For each of the geom, DEM, WorldCover, and canopy files, the script
checks in this order and copies the first hit into ski-hills/build-inputs/
(gitignored):

  1. ski-hills/build-inputs/ in this checkout
  2. /workspace/ski-cache/<slug>/  (override with SKI_CACHE_DIR)
  3. the public Worker
     https://ski-hills.databaseprojects.workers.dev/build-inputs/<slug>/<file>
  4. the original source: OpenSkiMap for runs and lifts, MRDEM or Copernicus
     for the DEM, ESA WorldCover for the forest map, and Sentinel-2 for canopy

It prints which source each file came from, and lists files fetched from
original sources so they can be added to the cache.

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
import shutil
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import ijson

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in __import__("sys").path:
    __import__("sys").path.insert(0, str(ROOT))

from build_paths import (
    BUILD_INPUTS,
    cache_root,
    canopy_name,
    cloud_url,
    dem_name,
    geom_name,
    worldcover_name,
)

HILL_INDEX = ROOT / "hill-index.json"
BUILD_ALBERTA = ROOT / "build-alberta.py"
BUILD_FRONTAL = ROOT / "build-frontal.py"
BUILD_TREES = ROOT / "build-tree-overlays.py"

RUNS_URL = "https://tiles.openskimap.org/geojson/runs.geojson"
LIFTS_URL = "https://tiles.openskimap.org/geojson/lifts.geojson"
OSM_CACHE_CANDIDATES = (
    Path("/workspace/osm-full"),
    Path("/tmp/ski"),
    Path("/tmp/openskimap-cache"),
)
DOWNLOAD_CACHE = Path("/tmp/openskimap-cache")

USER_AGENT = "ski-hills-setup-build-inputs/1.0"


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def load_alberta():
    return load_module("build_alberta", BUILD_ALBERTA)


def load_frontal():
    return load_module("build_frontal", BUILD_FRONTAL)


def load_trees():
    return load_module("build_tree_overlays", BUILD_TREES)


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


def osm_cache_has_sources(folder: Path) -> bool:
    return (folder / "runs.geojson").is_file() and (folder / "lifts.geojson").is_file()


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    print("download", url, "->", dest, flush=True)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req) as resp, tmp.open("wb") as out:
        while True:
            chunk = resp.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
    tmp.replace(dest)


def resolve_osm_cache() -> Path:
    for folder in OSM_CACHE_CANDIDATES:
        if osm_cache_has_sources(folder):
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


def present(path: Path, min_size: int = 50) -> bool:
    return path.is_file() and path.stat().st_size > min_size


def place(src: Path, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if src.resolve() != dest.resolve():
        shutil.copy2(src, dest)
    return dest


def fetch_cloud(url: str, dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=180) as resp, tmp.open("wb") as out:
            status = getattr(resp, "status", 200)
            if status != 200:
                if tmp.exists():
                    tmp.unlink()
                return False
            while True:
                chunk = resp.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
    except urllib.error.HTTPError as err:
        if tmp.exists():
            tmp.unlink()
        if err.code == 404:
            return False
        raise
    except urllib.error.URLError:
        if tmp.exists():
            tmp.unlink()
        return False
    if not tmp.exists() or tmp.stat().st_size <= 50:
        if tmp.exists():
            tmp.unlink()
        return False
    tmp.replace(dest)
    return True


def source_label(kind, slug, name):
    if kind == "build-inputs":
        return "ski-hills/build-inputs/"
    if kind == "ski-cache":
        return str(cache_root() / slug) + "/"
    if kind == "cloudflare":
        return cloud_url(slug, name)
    if kind == "original":
        labels = {
            "geom": "OpenSkiMap",
            "dem": "MRDEM/Copernicus",
            "worldcover": "ESA WorldCover",
            "canopy": "Sentinel-2",
        }
        return "original source (" + labels.get(kind, "original") + ")"
    return kind


class OriginalBuilders:
    def __init__(self):
        self.ab = None
        self.bf = None
        self.trees = None
        self.osm_src = None
        self.geom_payloads = {}

    def _need_alberta(self):
        if self.ab is None:
            self.ab = load_alberta()
        return self.ab

    def _need_frontal(self):
        if self.bf is None:
            self.bf = load_frontal()
        return self.bf

    def _need_trees(self):
        if self.trees is None:
            self.trees = load_trees()
        return self.trees

    def geom(self, slug, dest: Path):
        if slug not in self.geom_payloads:
            if self.osm_src is None:
                self.osm_src = resolve_osm_cache()
            extracted = extract_geom([slug], self._need_alberta(), self.osm_src)
            self.geom_payloads.update({s: payload for s, (payload, _s) in extracted.items()})
        payload = self.geom_payloads[slug]
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(payload, ensure_ascii=False))
        print(slug, "geom runs", len(payload["runs"]), "lifts", len(payload["lifts"]), flush=True)

    def _load_payload(self, slug):
        geom_path = BUILD_INPUTS / geom_name(slug)
        if slug in self.geom_payloads:
            return self.geom_payloads[slug]
        if present(geom_path):
            return json.loads(geom_path.read_text())
        self.geom(slug, geom_path)
        return json.loads(geom_path.read_text())

    def dem(self, slug, dest: Path):
        bf = self._need_frontal()
        payload = self._load_payload(slug)
        dest.parent.mkdir(parents=True, exist_ok=True)
        bf.GEOM = BUILD_INPUTS / geom_name(slug)
        bf.DEM = dest
        box = bf.wide_box(payload["runs"], payload["lifts"])
        print(slug, "dem_box", tuple(round(v, 5) for v in box), flush=True)
        bf.ensure_dem(box)

    def worldcover(self, slug, dest: Path):
        trees = self._need_trees()
        bf = self._need_frontal()
        payload = self._load_payload(slug)
        bf.GEOM = BUILD_INPUTS / geom_name(slug)
        box = bf.wide_box(payload["runs"], payload["lifts"])
        path = trees.ensure_worldcover(slug, box)
        if path.resolve() != dest.resolve():
            place(path, dest)

    def canopy(self, slug, dest: Path):
        trees = self._need_trees()
        bf = self._need_frontal()
        payload = self._load_payload(slug)
        bf.GEOM = BUILD_INPUTS / geom_name(slug)
        box = bf.wide_box(payload["runs"], payload["lifts"])
        wc = BUILD_INPUTS / worldcover_name(slug)
        if not present(wc, 1000):
            self.worldcover(slug, wc)
        path = trees.ensure_canopy(slug, box, wc)
        if path.resolve() != dest.resolve():
            place(path, dest)


def resolve_file(slug, name, kind, builders: OriginalBuilders):
    dest = BUILD_INPUTS / name
    if present(dest, 50 if kind == "geom" else 1000):
        return dest, "build-inputs", False
    cached = cache_root() / slug / name
    if present(cached, 50 if kind == "geom" else 1000):
        place(cached, dest)
        return dest, "ski-cache", False
    url = cloud_url(slug, name)
    if fetch_cloud(url, dest) and present(dest, 50 if kind == "geom" else 1000):
        return dest, "cloudflare", False
    if dest.exists():
        dest.unlink()
    getattr(builders, kind)(slug, dest)
    if not present(dest, 50 if kind == "geom" else 1000):
        raise SystemExit(f"failed to build {slug} {name} from the original source")
    return dest, "original", True


def main(argv):
    slugs = argv[1:]
    if not slugs:
        raise SystemExit("usage: python3 ski-hills/setup-build-inputs.py <slug> [...]")
    # Confirm slugs exist in the index up front
    load_hills(slugs)
    BUILD_INPUTS.mkdir(parents=True, exist_ok=True)
    builders = OriginalBuilders()
    reports = []
    originals = []
    t0 = time.perf_counter()
    kinds = (
        ("geom", geom_name),
        ("dem", dem_name),
        ("worldcover", worldcover_name),
        ("canopy", canopy_name),
    )
    for slug in slugs:
        for kind, namer in kinds:
            name = namer(slug)
            path, source, from_original = resolve_file(slug, name, kind, builders)
            label = source_label(source, slug, name)
            size = path.stat().st_size if path.exists() else 0
            print(f"{slug} {name} from {label} ({size} bytes)", flush=True)
            reports.append((slug, name, label, size, from_original))
            if from_original:
                originals.append(f"{slug}/{name}")
    elapsed = time.perf_counter() - t0
    print("setup_seconds", round(elapsed, 3), "hills", len(slugs), flush=True)
    print("Files fetched from original sources:", flush=True)
    if originals:
        for item in originals:
            print("  ", item, flush=True)
    else:
        print("  (none)", flush=True)


if __name__ == "__main__":
    main(sys.argv)
