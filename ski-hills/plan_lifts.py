"""Plan-view lifts as lon/lat, for the bird's-eye builder.

Plan catalogs are the source of truth for which lifts exist and where their
terminals sit (including the 30 m run snap). This module unprojects those
already-projected plan polylines back to lon/lat so build-frontal.py can
draw the same set in the bird's-eye camera. Framing, DEM crop, ridge-clip
and tree wash stay on the original geom lifts.
"""
from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PAD = 48
SIZE = 1000 - PAD * 2


def parse_pts(text):
    if not text or not isinstance(text, str):
        return []
    out = []
    for part in text.split():
        if "," not in part:
            continue
        x, y = part.split(",", 1)
        out.append((float(x), float(y)))
    return out


def _plan_run_lines(hill):
    lines = []
    for item in hill.get("runs") or []:
        if isinstance(item, dict):
            pts = parse_pts(item.get("p") or "")
        elif isinstance(item, str):
            pts = parse_pts(item)
        else:
            pts = []
        if len(pts) >= 2:
            lines.append(pts)
    return lines


def _plan_lift_lines(hill):
    lines = []
    for item in hill.get("lifts") or []:
        if isinstance(item, str):
            pts = parse_pts(item)
        elif isinstance(item, dict):
            pts = parse_pts(item.get("p") or "")
        else:
            pts = []
        if len(pts) >= 2:
            lines.append(pts)
    return lines


def _geom_run_lines(runs):
    lines = []
    for item in runs or []:
        for line in item.get("lines") or []:
            if len(line) >= 2:
                lines.append([(float(p[0]), float(p[1])) for p in line])
    return lines


def frame_of(lines):
    pts = [p for line in lines for p in line]
    if not pts:
        return None
    mid = sum(p[1] for p in pts) / len(pts)
    cos = math.cos(mid * math.pi / 180)
    xs = [p[0] * 111320 * cos for p in pts]
    ys = [p[1] * 110540 for p in pts]
    span = max(max(xs) - min(xs), max(ys) - min(ys), 1.0)
    return {
        "cos": cos,
        "minx": min(xs),
        "maxx": max(xs),
        "miny": min(ys),
        "maxy": max(ys),
        "span": span,
    }


def project_xy(fr, lon, lat):
    x = lon * 111320 * fr["cos"]
    y = lat * 110540
    return (
        PAD + (x - fr["minx"]) / fr["span"] * SIZE,
        PAD + (fr["maxy"] - y) / fr["span"] * SIZE,
    )


def unproject_xy(fr, px, py):
    x = fr["minx"] + (px - PAD) / SIZE * fr["span"]
    y = fr["maxy"] - (py - PAD) / SIZE * fr["span"]
    return (x / (111320 * fr["cos"]), y / 110540)


def _centroid(lines):
    pts = [p for line in lines for p in line]
    n = len(pts)
    return (sum(p[0] for p in pts) / n, sum(p[1] for p in pts) / n)


def _principal_angle(lines):
    pts = [p for line in lines for p in line]
    n = len(pts)
    mx = sum(p[0] for p in pts) / n
    my = sum(p[1] for p in pts) / n
    cxx = cxy = cyy = 0.0
    for x, y in pts:
        dx, dy = x - mx, y - my
        cxx += dx * dx
        cxy += dx * dy
        cyy += dy * dy
    return 0.5 * math.atan2(2 * cxy, cxx - cyy)


def _bbox(lines):
    pts = [p for line in lines for p in line]
    return (
        min(p[0] for p in pts),
        min(p[1] for p in pts),
        max(p[0] for p in pts),
        max(p[1] for p in pts),
    )


def _rotate(pt, c, ang):
    ca, sa = math.cos(ang), math.sin(ang)
    x, y = pt[0] - c[0], pt[1] - c[1]
    return (c[0] + ca * x - sa * y, c[1] + sa * x + ca * y)


def _score_angle(geom_xy, plan_lines, gc, ang):
    rot = [[_rotate(p, gc, ang) for p in line] for line in geom_xy]
    rb = _bbox(rot)
    pb = _bbox(plan_lines)
    rw, rh = rb[2] - rb[0], rb[3] - rb[1]
    pw, ph = pb[2] - pb[0], pb[3] - pb[1]
    if rw < 1 or rh < 1 or ph < 1:
        return None
    s = pw / rw
    rc = _centroid(rot)
    pc = _centroid(plan_lines)

    def xf(p):
        return (pc[0] + (p[0] - rc[0]) * s, pc[1] + (p[1] - rc[1]) * s)

    used = set()
    acc = 0.0
    total = 0
    nmatch = 0
    for line in rot:
        n = len(line)
        ql = [xf(p) for p in line]
        best = None
        for i, pr in enumerate(plan_lines):
            if i in used or len(pr) != n:
                continue
            r1 = sum((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 for a, b in zip(ql, pr))
            r2 = sum((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 for a, b in zip(ql, reversed(pr)))
            r = min(r1, r2)
            if best is None or r < best[0]:
                best = (r, i)
        if best is not None:
            used.add(best[1])
            acc += best[0]
            total += n
            nmatch += 1
    if total == 0:
        return None
    rms = math.sqrt(acc / total)
    return rms, nmatch, s, rc, pc


def solve_plan_frame(geom_runs, plan_runs):
    """Map north-up geom paper coords to published plan paper coords.

    Returns a dict with the north-up frame plus rotation, scale and
    centroids, or None when the sheets cannot be registered.
    """
    geom_ll = _geom_run_lines(geom_runs)
    if not geom_ll or not plan_runs:
        return None
    fr = frame_of(geom_ll)
    if not fr:
        return None
    geom_xy = [[project_xy(fr, *p) for p in line] for line in geom_ll]
    gc = _centroid(geom_xy)
    base = _principal_angle(plan_runs) - _principal_angle(geom_xy)
    candidates = []
    for extra in (0.0, math.pi):
        ang0 = base + extra
        # refine ±2.5° in 0.1° steps
        best = None
        for i in range(-25, 26):
            ang = ang0 + i * 0.1 * math.pi / 180
            sc = _score_angle(geom_xy, plan_runs, gc, ang)
            if sc is None:
                continue
            rec = (sc[0], ang, sc[1], sc[2], sc[3], sc[4])
            if best is None or rec[0] < best[0]:
                best = rec
        if best:
            candidates.append(best)
    if not candidates:
        return None
    best = min(candidates, key=lambda r: r[0])
    rms, ang, nmatch, scale, rc, pc = best
    if nmatch < max(1, int(0.7 * min(len(geom_xy), len(plan_runs)))):
        return None
    if rms > 8.0:
        return None
    return {
        "fr": fr,
        "gc": gc,
        "ang": ang,
        "scale": scale,
        "rc": rc,
        "pc": pc,
        "rms": rms,
        "nmatch": nmatch,
    }


def plan_to_lonlat(pt, solved):
    """Inverse of the solved plan-frame map: plan paper -> lon/lat."""
    pc, rc, s, gc, ang = (
        solved["pc"],
        solved["rc"],
        solved["scale"],
        solved["gc"],
        solved["ang"],
    )
    # inverse of xf: plan = pc + (rot - rc) * s
    rx = rc[0] + (pt[0] - pc[0]) / s
    ry = rc[1] + (pt[1] - pc[1]) / s
    # inverse rotate about gc
    north = _rotate((rx, ry), gc, -ang)
    return unproject_xy(solved["fr"], north[0], north[1])


def _catalog_paths():
    paths = [ROOT / "hills.json"]
    for name in (
        "alberta",
        "quebec",
        "ontario",
        "saskatchewan",
        "manitoba",
        "new-brunswick",
        "newfoundland",
        "nova-scotia",
        "prince-edward-island",
        "yukon",
        "northwest-territories",
    ):
        paths.append(ROOT / f"{name}.json")
    usa = ROOT / "usa"
    if usa.is_dir():
        paths.extend(sorted(usa.glob("*.json")))
    eu = ROOT / "europe"
    if eu.is_dir():
        paths.extend(sorted(eu.glob("*.json")))
        paths.extend(sorted(eu.glob("*/*.json")))
    return paths


def _hills_from_file(path: Path):
    data = json.loads(path.read_text())
    if isinstance(data, dict) and isinstance(data.get("hills"), list):
        return data["hills"]
    if isinstance(data, dict) and "slug" in data:
        return [data]
    if isinstance(data, list):
        return [h for h in data if isinstance(h, dict) and "slug" in h]
    return []


@lru_cache(maxsize=1)
def _catalog_index():
    index = {}
    for path in _catalog_paths():
        if not path.is_file():
            continue
        try:
            for hill in _hills_from_file(path):
                slug = hill.get("slug")
                if slug:
                    index[slug] = hill
        except Exception:
            continue
    return index


def load_plan_hill(slug):
    return _catalog_index().get(slug)


def snap_geom_lifts(geom_runs, geom_lifts):
    """Fallback: same 30 m terminal snap the plan builders use."""
    try:
        import importlib.util

        spec = importlib.util.spec_from_file_location(
            "build_alberta_lifts", ROOT / "build-alberta.py"
        )
        mod = importlib.util.module_from_spec(spec)
        # Avoid running main; exec the module
        spec.loader.exec_module(mod)
    except Exception:
        return list(geom_lifts or [])
    raw = _geom_run_lines(geom_runs)
    fr = frame_of(raw)
    if not fr:
        return list(geom_lifts or [])
    out = []
    for item in geom_lifts or []:
        lines = []
        for line in item.get("lines") or []:
            if line:
                lines.append([(float(p[0]), float(p[1])) for p in line])
        if not lines:
            continue
        snapped = mod.snap_terminals(lines, raw, fr["cos"])
        out.append(
            {
                "name": item.get("name"),
                "difficulty": item.get("difficulty"),
                "lines": snapped,
            }
        )
    return out


def lifts_from_plan(slug, geom_runs, geom_lifts):
    """Lon/lat lifts for the bird's-eye stroke, from the published plan.

    Returns (lifts, note). On failure, falls back to snapped geom lifts.
    """
    hill = load_plan_hill(slug)
    plan_runs = _plan_run_lines(hill) if hill else []
    plan_lifts = _plan_lift_lines(hill) if hill else []
    if plan_lifts and plan_runs:
        solved = solve_plan_frame(geom_runs, plan_runs)
        if solved:
            named = list(geom_lifts or [])
            out = []
            for pts in plan_lifts:
                ll = [plan_to_lonlat(p, solved) for p in pts]
                name = None
                # Prefer a geom name with the same vertex count and a close start.
                best = None
                for item in named:
                    for line in item.get("lines") or []:
                        if len(line) != len(ll):
                            continue
                        d0 = (ll[0][0] - float(line[0][0])) ** 2 + (
                            ll[0][1] - float(line[0][1])
                        ) ** 2
                        d1 = (ll[0][0] - float(line[-1][0])) ** 2 + (
                            ll[0][1] - float(line[-1][1])
                        ) ** 2
                        d = min(d0, d1)
                        if best is None or d < best[0]:
                            best = (d, item.get("name"))
                if best is not None and best[0] < 0.01:  # ~deg^2, very loose; names only
                    name = best[1]
                out.append({"name": name, "difficulty": None, "lines": [ll]})
            note = (
                f"plan_lifts {len(out)} rms={solved['rms']:.3f}px "
                f"ang={solved['ang'] * 180 / math.pi:.1f} "
                f"matches={solved['nmatch']}"
            )
            return out, note
    snapped = snap_geom_lifts(geom_runs, geom_lifts)
    return snapped, f"geom_lifts_snapped {len(snapped)}"
