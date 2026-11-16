#!/usr/bin/env python3
"""Keep tree-band opacities on one table: ski-hills/tree-opacity.json.

  python3 ski-hills/check-tree-opacity.py --write
      Rewrite the fill-opacity block in css/ski-hills.css and TREE_STEP in
      js/ski-hills.js from the table.

  python3 ski-hills/check-tree-opacity.py [--base REF]
      Fail if the CSS block or TREE_STEP differs from the table.
      Read baked opacities in ski-hills/frontal/*.svg and in treeBands of
      ski-hills/contours/*.json (including *.wash.json). A file added or
      changed since the merge base with REF (default origin/main) fails the
      check when its bake does not match the table for that band count.
      Older bakes in files this diff does not touch are warnings. They are
      not rebaked.

The page paints with the CSS steps, so an old bake does not change the
picture. Stdlib only, so the pull-request job does not need the hill tools.
"""

import argparse
import ast
import json
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
TABLE_PATH = Path(__file__).resolve().parent / "tree-opacity.json"
CSS_PATH = REPO / "css" / "ski-hills.css"
JS_PATH = REPO / "js" / "ski-hills.js"
BUILDER_PATH = Path(__file__).resolve().parent / "build-tree-overlays.py"

CSS_START = "/* tree-opacity:start */"
CSS_END = "/* tree-opacity:end */"
JS_START = "  // tree-opacity:start"
JS_END = "  // tree-opacity:end"
CSS_LEGACY_START = "/* Tree-cover opacity steps"
CSS_LEGACY_END = "/* Inward feather."

FILL_ATTR = re.compile(br'fill-opacity="([0-9.]+)"')
FILL_STYLE = re.compile(br"fill-opacity:\s*([0-9.]+)")
BAND_MARK = b'<g class="sh-frontal-tree-band'
JSON_OPACITY = re.compile(br'"opacity"\s*:\s*([0-9.]+)')
TREE_BANDS_KEY = b'"treeBands"'

COUNT_WORD = {
    1: "One band",
    2: "two",
    3: "three",
    4: "four",
    5: "five",
    6: "six",
    7: "seven",
    8: "eight",
}


def fail(message):
    print("error: " + message, file=sys.stderr)
    raise SystemExit(1)


def load_table(path=TABLE_PATH):
    try:
        raw = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"could not read {path}: {exc}")
    if not isinstance(raw, dict) or not raw:
        fail(f"{path} must be an object of band-count to opacity list")
    table = {}
    for key, values in raw.items():
        try:
            count = int(key)
        except (TypeError, ValueError):
            fail(f"{path} key {key!r} is not a band count")
        if count < 1 or not isinstance(values, list) or len(values) != count:
            fail(f"{path} key {key!r} must list {key} opacities")
        steps = []
        for value in values:
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                fail(f"{path} key {key!r} has a non-numeric opacity")
            number = float(value)
            if not 0.0 <= number <= 1.0:
                fail(f"{path} key {key!r} opacity {number} is outside 0..1")
            steps.append(number)
        table[count] = tuple(steps)
    return dict(sorted(table.items()))


def fmt_opacity(value):
    return f"{value:.2f}"


def fmt_steps(values):
    return "/".join(fmt_opacity(value) for value in values)


def summary(table):
    parts = []
    for count, values in table.items():
        label = COUNT_WORD.get(count, f"{count} bands")
        parts.append(f"{label} {fmt_steps(values)}")
    return "; ".join(parts) + "."


def css_comment(table):
    """The live comment, with the step list wrapped from the table."""
    lines = [
        "/* Tree-cover opacity steps, lowest density to densest. Replaces the",
        "   fill-opacity baked into contour JSON and bird's-eye wash sheets, including",
    ]
    width = 73
    indent = "   "
    current = indent + "copies served from the asset host. "
    for word in summary(table).split(" "):
        candidate = current + word
        if len(candidate) > width and current.strip():
            lines.append(current.rstrip())
            current = indent + word + " "
        else:
            current = candidate + " "
    lines.append(current.rstrip() + " */")
    return "\n".join(lines)


def _has_clause(kind, count, capped):
    has = f":has(> .{kind}:nth-child({count}))"
    if not capped:
        return has
    return has + f":not(:has(> .{kind}:nth-child({count + 1})))"


def css_rules(table):
    """Fill-opacity rules. One band also covers a wash that has no band group."""
    max_count = max(table)
    blocks = []
    for count, values in table.items():
        for index, opacity in enumerate(values, start=1):
            if count == 1:
                selectors = [
                    ".sh-frontal-trees:not(:has(> .sh-frontal-tree-band:nth-child(2))) > .sh-frontal-tree-band > .sh-frontal-tree-wash",
                    ".sh-plan-tree-wash:not(:has(> .sh-plan-tree-band:nth-child(2))) > .sh-plan-tree-band > path",
                    ".sh-plan-tree-wash:not(:has(> .sh-plan-tree-band)) > path",
                ]
            else:
                frontal = _has_clause("sh-frontal-tree-band", count, count != max_count)
                plan = _has_clause("sh-plan-tree-band", count, count != max_count)
                selectors = [
                    f".sh-frontal-trees{frontal} > .sh-frontal-tree-band:nth-child({index}) > .sh-frontal-tree-wash",
                    f".sh-plan-tree-wash{plan} > .sh-plan-tree-band:nth-child({index}) > path",
                ]
            body = ",\n".join(selectors)
            blocks.append(body + " {\n  fill-opacity: " + fmt_opacity(opacity) + ";\n}")
    return "\n".join(blocks)


def css_region(table):
    return "\n".join((
        CSS_START,
        css_comment(table),
        css_rules(table),
        CSS_END,
    ))


def js_region(table):
    lines = [JS_START, "  var TREE_STEP = {"]
    counts = list(table)
    for position, count in enumerate(counts):
        comma = "," if position < len(counts) - 1 else ""
        quoted = ", ".join(f'"{fmt_opacity(value)}"' for value in table[count])
        lines.append(f"    {count}: [{quoted}]{comma}")
    lines.append("  };")
    lines.append(JS_END)
    return "\n".join(lines)


def extract_region(text, start, end):
    begin = text.find(start)
    if begin < 0:
        return None
    finish = text.find(end, begin)
    if finish < 0:
        return None
    return text[begin:finish + len(end)]


def write_css(table):
    text = CSS_PATH.read_text()
    region = css_region(table)
    if CSS_START in text:
        current = extract_region(text, CSS_START, CSS_END)
        if current is None:
            fail(f"{CSS_PATH} has a tree-opacity start marker and no end marker")
        updated = text.replace(current, region, 1)
    else:
        begin = text.find(CSS_LEGACY_START)
        finish = text.find(CSS_LEGACY_END)
        if begin < 0 or finish < 0 or finish < begin:
            fail(f"{CSS_PATH} has no tree-opacity block to replace")
        updated = text[:begin] + region + "\n\n" + text[finish:]
    if updated != text:
        CSS_PATH.write_text(updated)
        print(f"wrote {CSS_PATH.relative_to(REPO)}")
    else:
        print(f"unchanged {CSS_PATH.relative_to(REPO)}")


def write_js(table):
    text = JS_PATH.read_text()
    region = js_region(table)
    if JS_START in text:
        current = extract_region(text, JS_START, JS_END)
        if current is None:
            fail(f"{JS_PATH} has a tree-opacity start marker and no end marker")
        updated = text.replace(current, region, 1)
    else:
        match = re.search(r"  var TREE_STEP = \{.*?\n  \};", text, re.S)
        if not match:
            fail(f"{JS_PATH} has no TREE_STEP object to replace")
        updated = text[:match.start()] + region + text[match.end():]
    if updated != text:
        JS_PATH.write_text(updated)
        print(f"wrote {JS_PATH.relative_to(REPO)}")
    else:
        print(f"unchanged {JS_PATH.relative_to(REPO)}")


def check_generated(table):
    errors = []
    css = extract_region(CSS_PATH.read_text(), CSS_START, CSS_END)
    if css is None:
        errors.append("css/ski-hills.css is missing the tree-opacity block")
    elif css != css_region(table):
        errors.append("css/ski-hills.css tree-opacity block does not match ski-hills/tree-opacity.json")
    js = extract_region(JS_PATH.read_text(), JS_START, JS_END)
    if js is None:
        errors.append("js/ski-hills.js is missing the tree-opacity TREE_STEP block")
    elif js != js_region(table):
        errors.append("js/ski-hills.js TREE_STEP does not match ski-hills/tree-opacity.json")
    return errors


def _call_name(node):
    func = node.func
    if isinstance(func, ast.Name):
        return func.id
    return ""


def _bands_have_no_opacity(value):
    if not isinstance(value, (ast.Tuple, ast.List)):
        return False
    if not value.elts:
        return False
    for band in value.elts:
        if not isinstance(band, (ast.Tuple, ast.List)) or len(band.elts) != 3:
            return False
        name = band.elts[2]
        if not isinstance(name, ast.Constant) or not isinstance(name.value, str):
            return False
    return True


def check_builder():
    src = BUILDER_PATH.read_text()
    errors = []
    if "tree-opacity.json" not in src:
        errors.append("ski-hills/build-tree-overlays.py does not read tree-opacity.json")
    tree = ast.parse(src)
    found_bands = False
    found_opacity = False
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        names = [target.id for target in node.targets if isinstance(target, ast.Name)]
        if "TREE_BANDS" in names:
            found_bands = True
            if not _bands_have_no_opacity(node.value):
                errors.append(
                    "TREE_BANDS must keep only the cuts and names, with no opacity column"
                )
        if "BAND_OPACITY_BY_COUNT" in names:
            found_opacity = True
            call = node.value
            if not isinstance(call, ast.Call) or _call_name(call) != "load_band_opacity":
                errors.append("BAND_OPACITY_BY_COUNT must be load_band_opacity(), not a hardcoded table")
    if not found_bands:
        errors.append("TREE_BANDS is missing from ski-hills/build-tree-overlays.py")
    if not found_opacity:
        errors.append("BAND_OPACITY_BY_COUNT is missing from ski-hills/build-tree-overlays.py")
    return errors


def steps_match(found, table):
    if not found or any(value is None for value in found):
        return False
    expected = table.get(len(found))
    if expected is None:
        return False
    # The bake and the table are both two-decimal literals. Same text parses
    # to the same float; a different step such as 0.10 does not match 0.08.
    return all(abs(got - want) <= 1e-9 for got, want in zip(found, expected))


def svg_steps(data):
    if BAND_MARK not in data:
        return None
    found = []
    for part in data.split(BAND_MARK)[1:]:
        end = part.find(b"</g>")
        chunk = part if end < 0 else part[:end]
        match = FILL_ATTR.search(chunk) or FILL_STYLE.search(chunk)
        found.append(None if match is None else float(match.group(1)))
    return found or None


def json_steps(data):
    start = data.find(TREE_BANDS_KEY)
    if start < 0:
        return None
    found = [float(match.group(1)) for match in JSON_OPACITY.finditer(data, start)]
    return found or None


def iter_tree_files():
    frontal = REPO / "ski-hills" / "frontal"
    contours = REPO / "ski-hills" / "contours"
    if frontal.is_dir():
        for path in frontal.glob("*.svg"):
            yield path
    if contours.is_dir():
        for path in contours.glob("*.json"):
            yield path


def baked_steps(path):
    data = path.read_bytes()
    if path.suffix == ".svg":
        return svg_steps(data)
    return json_steps(data)


def git_changed(base):
    """Paths added or changed on HEAD since the merge base with base."""
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


def describe(found, table):
    baked = "/".join("?" if value is None else fmt_opacity(value) for value in found)
    expected = table.get(len(found))
    if expected is None:
        return f"baked {baked}; no table row for {len(found)} bands"
    return f"baked {baked}; table for {len(found)} bands is {fmt_steps(expected)}"


def scan(table, changed):
    warnings = []
    errors = []
    checked = 0
    matching = 0
    for path in iter_tree_files():
        found = baked_steps(path)
        if not found:
            continue
        checked += 1
        if steps_match(found, table):
            matching += 1
            continue
        rel = path.relative_to(REPO).as_posix()
        detail = describe(found, table)
        if rel in changed:
            errors.append((rel, detail))
        else:
            warnings.append((rel, detail))
    return checked, matching, warnings, errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--write",
        action="store_true",
        help="Regenerate the CSS fill-opacity block and JS TREE_STEP from the table.",
    )
    parser.add_argument(
        "--base",
        default="",
        help="Git ref used as the merge base when deciding which tree files this change touches.",
    )
    args = parser.parse_args()
    table = load_table()
    if args.write:
        write_css(table)
        write_js(table)

    problems = check_generated(table) + check_builder()
    base = args.base or default_base()
    changed = git_changed(base)
    checked, matching, warnings, errors = scan(table, changed)

    print(f"base: {base}")
    print(f"tree files with bands: {checked}")
    print(f"matching table: {matching}")
    print(f"stale unchanged: {len(warnings)}")
    print(f"stale changed: {len(errors)}")
    for message in problems:
        print(f"::error::{message}")
        print(f"error: {message}")
    for rel, detail in errors:
        print(f"::error file={rel}::{detail}")
        print(f"error: {rel} {detail}")
    if warnings:
        print(
            f"::warning::{len(warnings)} unchanged tree files bake opacities that "
            "differ from ski-hills/tree-opacity.json. They are not in this diff, "
            "so they are not being rebaked."
        )
        for rel, detail in sorted(warnings):
            print(f"warning: {rel} {detail}")
    if problems or errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
