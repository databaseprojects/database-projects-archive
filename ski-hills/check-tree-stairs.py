#!/usr/bin/env python3
"""Flag stair-step edges on bird's-eye tree washes.

A whole mesh quad used to be dropped when any corner failed the 40 m / 2.6 px
hiding test. Along a ridge that leaves a run of vertical risers whose sideways
treads equal the mesh column width. Clipping each quad at the skyline removes
that stair.

  python3 ski-hills/check-tree-stairs.py --base origin/main
      Scan ski-hills/frontal/*.wash.svg and any frontal sheet that still has
      a tree-wash or tree-band path. A file this diff adds or changes fails
      when it still has a stair run. The same pattern in a file the diff does
      not touch is a warning. Stdlib only.

  python3 ski-hills/check-tree-stairs.py --measure PATH [PATH ...]
      Print stair counts and, when the matching sheet is present, how much of
      the 30 px band under the contour skyline is tree-covered.
"""

import argparse
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
FRONTAL = REPO / "ski-hills" / "frontal"

# Axis tolerance, in sheet pixels. Compact paths are integer tenths.
SLANT = 0.25
MIN_RISER = 0.8
# Shorter horizontals are the polygoniser's own half-pixel grid.
MIN_TREAD = 1.5
# Three risers is one step-step-step. A single box corner is two.
MIN_RUN = 3
# A changed file fails on a run at least this long.
FAIL_RUN = 4
TOP_Y = 1000.0 / 3.0
RIDGE_BAND = 30.0

PATH_D = re.compile(
    rb'<path\b[^>]*class="[^"]*sh-frontal-tree-(?:wash|band)[^"]*"[^>]*\sd="([^"]+)"'
    rb'|'
    rb'<path\b[^>]*\sd="([^"]+)"[^>]*class="[^"]*sh-frontal-tree-(?:wash|band)[^"]*"',
    re.S,
)
CONTOUR_D = re.compile(rb'<path\b[^>]*class="[^"]*sh-frontal-contour[^"]*"[^>]*\sd="([^"]+)"', re.S)
NUM = re.compile(rb"[-+]?\d+")


def fail(message):
    print("error: " + message, file=sys.stderr)
    raise SystemExit(1)


def decode_subpaths(d):
    """Compact tenths (M x,y l dx,dy) and plain absolute M/L, in sheet pixels."""
    if not d:
        return
    text = d if isinstance(d, str) else d.decode("ascii", "ignore")
    for chunk in re.findall(r"M[^M]+", text):
        closed = "Z" in chunk or "z" in chunk
        body = chunk[1:]
        head = re.match(r"\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)", body)
        if not head:
            continue
        x = float(head.group(1))
        y = float(head.group(2))
        # Integer tenths are the compact form. A decimal is already in pixels.
        tenths = "." not in head.group(1) and "." not in head.group(2)
        scale = 0.1 if tenths else 1.0
        pts = [(x * scale, y * scale)]
        rest = body[head.end():]
        rel_at = rest.find("l")
        if rel_at >= 0 and tenths:
            rel = rest[rel_at + 1:].replace("Z", "").replace("z", "")
            nums = re.findall(r"[-+]?\d+", rel)
            ix = int(round(x))
            iy = int(round(y))
            pts = [(ix * 0.1, iy * 0.1)]
            for i in range(0, len(nums) - 1, 2):
                ix += int(nums[i])
                iy += int(nums[i + 1])
                pts.append((ix * 0.1, iy * 0.1))
        elif rel_at < 0:
            nums = re.findall(r"[-+]?(?:\d+\.\d+|\d+)", rest.replace("Z", "").replace("z", ""))
            # Skip the command letters' absence: remaining pairs are absolute L.
            for i in range(0, len(nums) - 1, 2):
                x = float(nums[i])
                y = float(nums[i + 1])
                pts.append((x * scale, y * scale))
        if len(pts) >= 2:
            yield pts, closed


def segments(subpaths):
    for pts, closed in subpaths:
        seq = list(pts)
        if closed and seq[0] != seq[-1]:
            seq.append(seq[0])
        for a, b in zip(seq, seq[1:]):
            yield a[0], a[1], b[0], b[1]


def _bin(length):
    return round(length * 2.0) / 2.0


def mesh_bins(tread_lengths):
    """Dominant horizontal tread, plus a shoulder bin when it is the same step."""
    counts = Counter()
    for length in tread_lengths:
        if length < MIN_TREAD:
            continue
        counts[_bin(length)] += 1
    if not counts:
        return None, None
    mode, mode_n = counts.most_common(1)[0]
    if mode_n < 12:
        return None, None
    chosen = {mode}
    for extra in (mode - 0.5, mode + 0.5):
        if counts.get(extra, 0) >= 0.30 * mode_n:
            chosen.add(round(extra, 1))
    return chosen, mode


def stair_stats(subpaths):
    """Riser counts for runs whose treads match the mesh column."""
    segs = list(segments(subpaths))
    if not segs:
        return {
            "column": None,
            "runs": 0,
            "fail_runs": 0,
            "risers": 0,
            "top_risers": 0,
            "sky_risers": 0,
        }
    # Upper envelope of the wash, in 2 px columns. A riser on that edge is
    # the skyline; a riser inside a clearing is not.
    envelope = {}
    for x0, y0, x1, y1 in segs:
        for x, y in ((x0, y0), (x1, y1)):
            key = int(round(x / 2.0))
            prev = envelope.get(key)
            if prev is None or y < prev:
                envelope[key] = y
    kinds = []
    for x0, y0, x1, y1 in segs:
        dx = x1 - x0
        dy = y1 - y0
        adx = abs(dx)
        ady = abs(dy)
        midx = (x0 + x1) * 0.5
        midy = (y0 + y1) * 0.5
        if adx <= SLANT and ady >= MIN_RISER:
            kinds.append(("V", 0, midy, ady, midx))
        elif ady <= SLANT and adx >= MIN_TREAD:
            kinds.append(("H", 1 if dx > 0 else -1, midy, adx, midx))
        else:
            kinds.append(("o", 0, midy, 0.0, midx))
    # Treads that actually step between risers, not every horizontal edge.
    treads = []
    n = len(kinds)
    for i, (k, sign, _mid, length, _x) in enumerate(kinds):
        if k != "H":
            continue
        prev = kinds[i - 1][0] if i else ""
        nxt = kinds[i + 1][0] if i + 1 < n else ""
        if prev == "V" or nxt == "V":
            treads.append(length)
    bins, column = mesh_bins(treads)
    if not bins:
        return {
            "column": None,
            "runs": 0,
            "fail_runs": 0,
            "risers": 0,
            "top_risers": 0,
            "sky_risers": 0,
        }
    def on_skyline(midx, midy):
        key = int(round(midx / 2.0))
        top = None
        for look in (key - 1, key, key + 1):
            y = envelope.get(look)
            if y is not None and (top is None or y < top):
                top = y
        return top is not None and midy <= top + 6.0

    runs = 0
    fail_runs = 0
    risers = 0
    top_risers = 0
    sky_risers = 0
    i = 0
    while i < n:
        if kinds[i][0] == "o":
            i += 1
            continue
        j = i
        sign = 0
        run_risers = []
        reversed_at = None
        while j < n and kinds[j][0] != "o":
            k, ksign, midy, length, midx = kinds[j]
            if k == "H":
                if _bin(length) not in bins:
                    break
                if sign == 0:
                    sign = ksign
                elif ksign != sign:
                    reversed_at = j
                    break
            else:
                run_risers.append((midx, midy))
            j += 1
        sky = [(x, y) for x, y in run_risers if on_skyline(x, y)]
        if len(sky) >= MIN_RUN:
            runs += 1
            risers += len(sky)
            sky_risers += len(sky)
            top_risers += sum(1 for _x, y in sky if y < TOP_Y)
            if len(sky) >= FAIL_RUN:
                fail_runs += 1
        if reversed_at is not None:
            i = reversed_at
        elif j < n and kinds[j][0] != "o" and j == i:
            i = j + 1
        else:
            i = j if j > i else j + 1
    return {
        "column": column,
        "runs": runs,
        "fail_runs": fail_runs,
        "risers": risers,
        "top_risers": top_risers,
        "sky_risers": sky_risers,
    }


def tree_paths(data):
    found = []
    for a, b in PATH_D.findall(data):
        raw = a or b
        if raw:
            found.append(raw)
    return found


def load_tree_subpaths(path):
    data = path.read_bytes()
    subs = []
    for raw in tree_paths(data):
        subs.extend(decode_subpaths(raw))
    return subs


def iter_sheets():
    if not FRONTAL.is_dir():
        return
    for path in sorted(FRONTAL.glob("*.wash.svg")):
        yield path
    for path in sorted(FRONTAL.glob("*.svg")):
        if path.name.endswith(".wash.svg"):
            continue
        data = path.read_bytes()
        if b"sh-frontal-tree-wash" in data or b"sh-frontal-tree-band" in data:
            yield path


def git_changed(base):
    result = subprocess.run(
        ["git", "diff", "--name-status", "--diff-filter=ACMR", f"{base}...HEAD"],
        cwd=REPO,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        fail(f"git diff {base}...HEAD failed: {result.stderr.strip()}")
    changed = set()
    for line in result.stdout.splitlines():
        parts = line.split("\t")
        if len(parts) >= 2:
            changed.add(parts[-1].strip())
    return changed


def default_base():
    for ref in ("origin/main", "main"):
        result = subprocess.run(
            ["git", "rev-parse", "--verify", "--quiet", ref],
            cwd=REPO,
            capture_output=True,
        )
        if result.returncode == 0:
            return ref
    return "origin/main"


def _raster_mask(subpaths, size=1040, origin=-20):
    """Even-odd fill. Returns a uint8 array, index (y - origin, x - origin)."""
    import numpy as np

    edges = []
    for pts, closed in subpaths:
        seq = list(pts)
        if len(seq) < 3:
            continue
        if closed and seq[0] != seq[-1]:
            seq.append(seq[0])
        for (x0, y0), (x1, y1) in zip(seq, seq[1:]):
            if y0 == y1:
                continue
            edges.append((y0, y1, x0, x1))
    mask = np.zeros((size, size), dtype=np.uint8)
    buckets = [[] for _ in range(size)]
    for y0, y1, x0, x1 in edges:
        if y0 > y1:
            y0, y1 = y1, y0
            x0, x1 = x1, x0
        r0 = int(np.ceil(y0 - origin - 1e-9))
        r1 = int(np.floor(y1 - origin - 1e-9))
        if r1 < r0:
            continue
        r0 = max(r0, 0)
        r1 = min(r1, size - 1)
        dy = y1 - y0
        if dy == 0:
            continue
        for r in range(r0, r1 + 1):
            y = r + origin + 0.5
            t = (y - y0) / dy
            buckets[r].append(x0 + (x1 - x0) * t)
    for r, xs in enumerate(buckets):
        if len(xs) < 2:
            continue
        xs.sort()
        row = mask[r]
        for i in range(0, len(xs) - 1, 2):
            a = int(np.ceil(xs[i] - origin - 1e-9))
            b = int(np.floor(xs[i + 1] - origin - 1e-9))
            if b < a:
                continue
            a = max(a, 0)
            b = min(b, size - 1)
            row[a : b + 1] = 1
    return mask, origin


def contour_skyline(sheet, origin, size):
    import numpy as np

    if not sheet.is_file():
        return None
    data = sheet.read_bytes()
    sky = np.full(size, np.inf)
    for raw in CONTOUR_D.findall(data):
        for pts, _closed in decode_subpaths(raw):
            for x, y in pts:
                col = int(round(x - origin))
                if 0 <= col < size and y < sky[col]:
                    sky[col] = y
    return sky


def ridge_report(wash_path, stats):
    """Tree cover in the 30 px band immediately under the contour skyline."""
    import numpy as np

    subs = load_tree_subpaths(wash_path)
    mask, origin = _raster_mask(subs)
    sheet = wash_path.with_name(wash_path.name.replace(".wash.svg", ".svg"))
    sky = contour_skyline(sheet, origin, mask.shape[1])
    filled = int(mask.sum())
    top = mask[:, :]
    # Frame y < 1000/3 maps to rows origin .. 
    y0 = int(np.ceil(0 - origin))
    y1 = int(np.floor(TOP_Y - origin))
    y0 = max(y0, 0)
    y1 = min(y1, mask.shape[0] - 1)
    top_area = int(mask[y0 : y1 + 1].sum()) if y1 >= y0 else 0
    band_filled = 0
    band_cells = 0
    gaps = []
    top_filled = 0
    top_cells = 0
    top_gaps = []
    if sky is not None:
        h, w = mask.shape
        for col in range(w):
            ridge = sky[col]
            if not np.isfinite(ridge):
                continue
            r0 = int(np.ceil(ridge - origin - 1e-9))
            r1 = int(np.floor(ridge + RIDGE_BAND - origin - 1e-9))
            r0 = max(r0, 0)
            r1 = min(r1, h - 1)
            if r1 < r0:
                continue
            column = mask[r0 : r1 + 1, col]
            cells = r1 - r0 + 1
            got = int(column.sum())
            band_cells += cells
            band_filled += got
            hits = np.flatnonzero(column)
            if len(hits):
                tree_y = (r0 + int(hits[0])) + origin + 0.5
                gap = tree_y - ridge
            else:
                gap = RIDGE_BAND
            gaps.append(gap)
            # The ridges Billy is looking at sit in the top third of the sheet.
            if ridge < TOP_Y:
                top_filled += got
                top_cells += cells
                top_gaps.append(gap)
    gaps.sort()
    top_gaps.sort()
    median_gap = gaps[len(gaps) // 2] if gaps else None
    top_median_gap = top_gaps[len(top_gaps) // 2] if top_gaps else None
    return {
        "filled": filled,
        "top_area": top_area,
        "band_filled": band_filled,
        "band_cells": band_cells,
        "median_gap": median_gap,
        "top_filled": top_filled,
        "top_cells": top_cells,
        "top_median_gap": top_median_gap,
        "stats": stats,
    }


def fmt_stats(path, stats):
    column = "none" if stats["column"] is None else f"{stats['column']:.1f}px"
    return (
        f"{path} column {column} runs {stats['runs']} "
        f"long-runs {stats['fail_runs']} skyline-risers {stats['sky_risers']} "
        f"top-ridge {stats['top_risers']}"
    )


def self_test():
    step = b"0,40 31,0 0,50 31,0 0,45 31,0 0,35 31,0 "
    stair = decode_subpaths(b"M0,100 l " + step * 4 + b"0,40 Z")
    smooth = decode_subpaths(b"M0,100 l 12,4 12,5 12,4 12,5 12,4 12,5 Z")
    stair_stats_ok = stair_stats(list(stair))
    smooth_stats = stair_stats(list(smooth))
    if stair_stats_ok["fail_runs"] < 1 or stair_stats_ok["top_risers"] < 4:
        fail(f"stair fixture was not flagged: {stair_stats_ok}")
    if smooth_stats["fail_runs"] or smooth_stats["runs"]:
        fail(f"smooth fixture was flagged: {smooth_stats}")


def measure(paths):
    for raw in paths:
        path = Path(raw)
        if not path.is_file():
            fail(f"no such file {raw}")
        subs = load_tree_subpaths(path)
        stats = stair_stats(subs)
        print(fmt_stats(path.as_posix(), stats))
        if path.name.endswith(".wash.svg"):
            report = ridge_report(path, stats)
            gap = report["median_gap"]
            gap_s = "n/a" if gap is None else f"{gap:.2f}"
            tgap = report["top_median_gap"]
            tgap_s = "n/a" if tgap is None else f"{tgap:.2f}"
            frac = 0.0 if not report["band_cells"] else report["band_filled"] / report["band_cells"]
            tfrac = 0.0 if not report["top_cells"] else report["top_filled"] / report["top_cells"]
            print(
                f"  filled {report['filled']} top-third-area {report['top_area']} "
                f"ridge-band {report['band_filled']}/{report['band_cells']} "
                f"({frac:.3f}) median-gap {gap_s}px "
                f"top-ridge-band {report['top_filled']}/{report['top_cells']} "
                f"({tfrac:.3f}) top-median-gap {tgap_s}px"
            )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="", help="Merge-base ref for changed files.")
    parser.add_argument(
        "--measure",
        nargs="+",
        default=None,
        help="Report stair and ridge-band numbers for these wash files and exit.",
    )
    args = parser.parse_args()
    self_test()
    if args.measure:
        measure(args.measure)
        return

    base = args.base or default_base()
    changed = git_changed(base)
    errors = []
    warnings = []
    checked = 0
    for path in iter_sheets():
        subs = load_tree_subpaths(path)
        if not subs:
            continue
        checked += 1
        stats = stair_stats(subs)
        if stats["fail_runs"] < 1:
            continue
        rel = path.relative_to(REPO).as_posix()
        detail = fmt_stats(rel, stats)
        if rel in changed:
            errors.append(detail)
        else:
            warnings.append(detail)

    print(f"base: {base}")
    print(f"tree sheets scanned: {checked}")
    print(f"stair warnings: {len(warnings)}")
    print(f"stair failures: {len(errors)}")
    if warnings:
        print(
            f"::warning::{len(warnings)} unchanged tree sheets still have "
            "mesh-column stair runs. They are not in this diff."
        )
        for detail in warnings:
            print(f"warning: {detail}")
    for detail in errors:
        print(f"::error::{detail}")
        print(f"error: {detail}")
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
