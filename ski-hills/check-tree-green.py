#!/usr/bin/env python3
"""Fail if a stale ski-hill tree green is still in a builder or its output.

Stale fills are the two greens builds used to bake. Builders now emit
#336641 (TREE_GREEN). This check fails when either stale colour appears
as one token in ski-hills/*.py, or in a file under a builder output
directory (frontal/, contours/, previews/, and the same folders under
/workspace/tree-overlays-20 when that tree is present).

The builders name the stale colours only as split strings, so this file
can scan them (and itself) without an allow-list. Stdlib only.
"""

import ast
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
STALE = ("#315" + "b38", "#3a6" + "b42")
TREE_GREEN = "#336641"
OUTPUT_DIRS = ("frontal", "contours", "previews")
OUTPUT_SUFFIXES = {".svg", ".json", ".html", ".txt", ".xml"}
EXTRA_ROOTS = (Path("/workspace/tree-overlays-20"),)


def fail(lines):
    print("stale tree green:", file=sys.stderr)
    for line in lines:
        print(line, file=sys.stderr)
    raise SystemExit(1)


def token_hits(text, label):
    found = []
    lower = text.lower()
    for color in STALE:
        start = 0
        while True:
            at = lower.find(color, start)
            if at < 0:
                break
            line = lower.count("\n", 0, at) + 1
            found.append(f"{label}: line {line}: {color}")
            start = at + len(color)
    return found


def output_roots():
    roots = [ROOT]
    roots.extend(path for path in EXTRA_ROOTS if path.is_dir())
    return roots


def scan_outputs():
    found = []
    for root in output_roots():
        for name in OUTPUT_DIRS:
            folder = root / name
            if not folder.is_dir():
                continue
            for path in sorted(folder.rglob("*")):
                if not path.is_file() or path.suffix.lower() not in OUTPUT_SUFFIXES:
                    continue
                data = path.read_bytes()
                lower = data.lower()
                rel = path
                try:
                    rel = path.relative_to(REPO)
                except ValueError:
                    pass
                for color in STALE:
                    if color.encode("ascii") in lower:
                        found.append(f"{rel}: {color}")
    return found


def load_guard(path):
    tree = ast.parse(path.read_text())
    keep = []
    for node in tree.body:
        if isinstance(node, ast.Assign):
            names = [target.id for target in node.targets if isinstance(target, ast.Name)]
            if "TREE_GREEN" in names or "_STALE_TREE_GREENS" in names:
                keep.append(node)
        elif isinstance(node, ast.FunctionDef) and node.name == "force_tree_green":
            keep.append(node)
    if not any(isinstance(node, ast.FunctionDef) for node in keep):
        fail([f"{path.name}: force_tree_green is missing"])
    module = ast.Module(body=keep, type_ignores=[])
    ast.fix_missing_locations(module)
    ns = {"re": __import__("re")}
    exec(compile(module, str(path), "exec"), ns)
    return ns["force_tree_green"], ns.get("TREE_GREEN")


def guard_samples():
    """Both SVG writers rewrite a stale fill and leave every other paint."""
    old_a = "#315" + "b38"
    old_b = "#3a6" + "b42"
    old_a_up = "#315" + "B38"
    old_b_up = "#3A6" + "B42"
    samples = [
        (f'fill="{old_a}"', f'fill="{TREE_GREEN}"'),
        (f"fill='{old_b_up}'", f"fill='{TREE_GREEN}'"),
        (f"fill: {old_a_up};", f"fill: {TREE_GREEN};"),
        (f'"fill":"{old_b}"', f'"fill":"{TREE_GREEN}"'),
        ('fill="#111" stroke="#1a1a1a"', 'fill="#111" stroke="#1a1a1a"'),
    ]
    errors = []
    for path in (ROOT / "build-tree-overlays.py", ROOT / "build-frontal.py"):
        rewrite, green = load_guard(path)
        if green != TREE_GREEN:
            errors.append(f"{path.name}: TREE_GREEN is {green!r}")
        for src, want in samples:
            got = rewrite(src)
            if got != want:
                errors.append(f"{path.name}: {src!r} -> {got!r}, want {want!r}")
            if any(color in got.lower() for color in STALE):
                errors.append(f"{path.name}: stale fill left in {got!r}")
    return errors


def main():
    errors = []
    for path in sorted(ROOT.glob("*.py")):
        errors.extend(token_hits(path.read_text(errors="ignore"), path.relative_to(REPO)))
    errors.extend(scan_outputs())
    errors.extend(guard_samples())
    if errors:
        fail(errors)
    print("tree green ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
