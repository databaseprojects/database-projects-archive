#!/usr/bin/env python3
"""Shared locations for ski-hill working files (geom, DEM, WorldCover, canopy).

A build reads from ski-hills/build-inputs/ first, then the machine cache at
/workspace/ski-cache/<slug>/ (override with SKI_CACHE_DIR), then /tmp.
setup-build-inputs.py also tries the public Worker and, last, the original
sources, and always lands a copy in ski-hills/build-inputs/.
"""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BUILD_INPUTS = ROOT / "build-inputs"
DEFAULT_CACHE_ROOT = Path("/workspace/ski-cache")
CLOUD_BASE = "https://ski-hills.databaseprojects.workers.dev/build-inputs"

DEM_NAME_OVERRIDES = {
    "cypress-mountain": "cypress-dem-wide.tif",
}

_SUFFIXES = (
    "-geom.json",
    "-dem-wide.tif",
    "-worldcover-10m.tif",
    "-canopy-conc-10m.tif",
)


def cache_root() -> Path:
    raw = os.environ.get("SKI_CACHE_DIR")
    if raw is not None:
        return Path(raw)
    return DEFAULT_CACHE_ROOT


def geom_name(slug: str) -> str:
    return f"{slug}-geom.json"


def dem_name(slug: str) -> str:
    return DEM_NAME_OVERRIDES.get(slug, f"{slug}-dem-wide.tif")


def worldcover_name(slug: str) -> str:
    return f"{slug}-worldcover-10m.tif"


def canopy_name(slug: str) -> str:
    return f"{slug}-canopy-conc-10m.tif"


def input_names(slug: str) -> list[str]:
    return [geom_name(slug), dem_name(slug), worldcover_name(slug), canopy_name(slug)]


def slug_from_name(name: str) -> str | None:
    if name == "cypress-dem-wide.tif":
        return "cypress-mountain"
    for suffix in _SUFFIXES:
        if name.endswith(suffix):
            return name[: -len(suffix)]
    return None


def cloud_url(slug: str, name: str) -> str:
    return f"{CLOUD_BASE}/{slug}/{name}"


def locate_input(name: str, slug: str | None = None) -> Path:
    """Path a build should read (or write, if nothing exists yet).

    Order: ski-hills/build-inputs/, then /workspace/ski-cache/<slug>/,
    then /tmp. If none exist, return the build-inputs path so a writer
    lands the file there.
    """
    dest = BUILD_INPUTS / name
    if dest.exists():
        return dest
    slug = slug or slug_from_name(name)
    if slug:
        cached = cache_root() / slug / name
        if cached.exists():
            return cached
    tmp = Path("/tmp") / name
    if tmp.exists():
        return tmp
    # Historical Cypress alias used by build-tree-overlays.py
    if name == "cypress-mountain-geom.json":
        alt = Path("/tmp/cypress-geom.json")
        if alt.exists():
            return alt
    return dest
