#!/usr/bin/env python3
"""Run one ski-hill bird's-eye job start to finish.

    python3 tools/ski-hill-job.py <slug> --token 20261116xyz --title "..." [edits] [options]

Steps (each timed in the summary):
  1. sparse worktree from the current origin/main: tooling, js/, css/, data
     and index json, plus only this slug's frontal/contour/wash files
  2. setup-build-inputs.py with the castle-gdal Python, cache first
     (ski-hills/build-inputs, /workspace/ski-cache, R2 build-inputs, then the
     original sources, which are written back to the cache)
  3. optional "before" crossing report on the unedited sheet
  4. edits: built-in (ridge clip, facing, frame_scale, DEM_PAD, plan turn
     angle) plus any --edit command
  5. build-frontal.py <slug> with RIDGE_CROSSING_REPORT=1 (report only; the
     render is the same with or without it)
  6. trees guard: the job fails if the sheet lost its wash flag / inline
     trees group, or the .wash.svg lost its tree bands (PR #528 bug)
  7. build-tree-overlays.py --frontal-only <slug> (skyline quad clip)
  8. check-tree-stairs.py, check-tree-opacity.py and the 30 m crossing
     count, run at the same time; stair/opacity checks only see this slug's
     sheets because the worktree is sparse
  9. token update: FRONTAL_V[slug], washFileV list and ski-hills/index.html
     ?v=, touching only this slug's entries
 10. commit, PR, token-aware rebase on the fresh tip right before the
     squash merge (CI is left running; its result is checked at the end)
 11. Pages publish (flock /workspace/.pages-publish.lock, current remote tip,
     never forced, re-fetch and retry on a rejected push) in parallel with
     R2 upload + Worker verify and Drive staging
 12. live check, then a summary (also written to <worktree>/.job/summary.json)

Rules kept: bird's-eye counter-clockwise ADDS to facing (--be-ccw), plan
clockwise INCREASES the plan angle (--plan-cw), banner text and print
stylesheets are never edited (the job fails if css/ or a prints file
changes), tree layers stay skyline-clipped with a stair check, and
ski-hills/frontal + ski-hills/contours never go to the Pages branch.

Secrets: CLOUDFLARE_API_TOKEN is read from the environment for the R2 PUT
and is never printed, logged, or written to any file.

Drive: this script cannot call the Drive connector. It stages
<token>-<file> copies under /workspace/drive-staging/<token>/ and prints
the paths; the calling agent uploads them to the masters folder with
UploadFile (folder 14g0N6V7r5Sr2F3feKqa3jCL_uywP4N8B).

--dry-run renders and checks without edits, PR, publish or upload, then
byte-compares this slug's sheets with origin/main and with the live Worker
copy. Use it to prove the pipeline reproduces a live hill.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import fcntl
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

REPO_MAIN = Path(os.environ.get("SKI_JOB_REPO", "/workspace/database-projects-archive"))
GH_REPO = "databaseprojects/database-projects-archive"
PAGES_BRANCH = "cursor/archive-portfolio-b69f"
PAGES_LOCK = Path("/workspace/.pages-publish.lock")
WORK_ROOT = Path(os.environ.get("SKI_JOB_ROOT", "/workspace"))
CASTLE = Path("/workspace/castle-gdal")
PY = str(CASTLE / "bin" / "python")
WORKER = "https://ski-hills.databaseprojects.workers.dev"
LIVE = "https://databaseprojects.ca"
R2_ACCOUNT = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "bf180861f3be064076ac8fd5b278e0d8")
R2_BUCKET = "ski-hills"
DRIVE_FOLDER = "14g0N6V7r5Sr2F3feKqa3jCL_uywP4N8B"
DRIVE_STAGE = Path("/workspace/drive-staging")
MIN_FREE_GB = float(os.environ.get("SKI_JOB_MIN_FREE_GB", "4"))
NEVER_MERGE = {447, 511}
UA = "ski-hill-job/1.0"

# Big tracked trees a job never needs except for its own slug.
SPARSE_EXCLUDE = ("/ski-hills/frontal/", "/ski-hills/contours/")

TIMES: dict[str, float] = {}
LOG: list[str] = []


def now() -> str:
    return datetime.now().strftime("%H:%M:%S")


def say(*parts) -> None:
    line = " ".join(str(p) for p in parts)
    LOG.append(line)
    print(f"[{now()}] {line}", flush=True)


class Step:
    def __init__(self, name):
        self.name = name

    def __enter__(self):
        self.t = time.perf_counter()
        say("step", self.name)
        return self

    def __exit__(self, *exc):
        TIMES[self.name] = round(time.perf_counter() - self.t, 1)
        return False


def run(cmd, cwd=None, env=None, check=True, capture=False, quiet=False):
    if not quiet:
        say("$", " ".join(str(c) for c in cmd) if isinstance(cmd, (list, tuple)) else cmd)
    res = subprocess.run(
        cmd, cwd=cwd, env=env, text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.STDOUT if capture else None,
        shell=isinstance(cmd, str),
    )
    if check and res.returncode != 0:
        out = (res.stdout or "")[-3000:] if capture else ""
        raise SystemExit(f"command failed ({res.returncode}): {cmd}\n{out}")
    return res


def git(wt, *args, check=True, capture=True):
    return run(["git", "-C", str(wt), *args], check=check, capture=capture, quiet=True)


def gitout(wt, *args) -> str:
    return git(wt, *args).stdout.strip()


def build_env() -> dict:
    env = dict(os.environ)
    share = CASTLE / "share"
    env["PROJ_DATA"] = str(share / "proj")
    env["PROJ_LIB"] = str(share / "proj")
    env["GDAL_DATA"] = str(share / "gdal")
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    # Build steps never need the Cloudflare token.
    env.pop("CLOUDFLARE_API_TOKEN", None)
    return env


def free_gb(path: Path) -> float:
    return shutil.disk_usage(path).free / 1e9


# ----------------------------------------------------------------- worktree

def slug_patterns(slug: str) -> list[str]:
    pats = ["/*"]
    pats += [f"!{p}" for p in SPARSE_EXCLUDE]
    for stem in (slug, f"{slug}-front", f"{slug}-back"):
        pats.append(f"/ski-hills/frontal/{stem}.svg")
        pats.append(f"/ski-hills/frontal/{stem}.wash.svg")
    pats.append(f"/ski-hills/contours/{slug}.json")
    pats.append(f"/ski-hills/contours/{slug}.wash.json")
    pats.append("/ski-hills/contours/*index.json")
    return pats


def make_sparse_worktree(path: Path, branch: str, base: str, patterns: list[str]) -> None:
    if path.exists():
        raise SystemExit(f"{path} already exists (use --resume to reuse it)")
    run(["git", "-C", str(REPO_MAIN), "worktree", "add", "-q", "--no-checkout", "-B", branch, str(path), base])
    git(path, "sparse-checkout", "init", "--no-cone")
    p = subprocess.run(
        ["git", "-C", str(path), "sparse-checkout", "set", "--no-cone", "--stdin"],
        input="\n".join(patterns) + "\n", text=True, capture_output=True,
    )
    if p.returncode != 0:
        raise SystemExit("sparse-checkout failed: " + p.stderr[-500:])
    git(path, "checkout", "-q", branch)


def make_pages_worktree(path: Path) -> None:
    run(["git", "-C", str(REPO_MAIN), "worktree", "add", "-q", "--detach", "--no-checkout", str(path), f"origin/{PAGES_BRANCH}"])
    git(path, "sparse-checkout", "init", "--no-cone")
    p = subprocess.run(
        ["git", "-C", str(path), "sparse-checkout", "set", "--no-cone", "--stdin"],
        input="/*\n!/ski-hills/frontal/\n!/ski-hills/contours/\n", text=True, capture_output=True,
    )
    if p.returncode != 0:
        raise SystemExit("pages sparse-checkout failed: " + p.stderr[-500:])
    git(path, "checkout", "-q", "--detach", f"origin/{PAGES_BRANCH}")


# -------------------------------------------------------------- edit helpers

def _dict_block(src: str, name: str) -> tuple[int, int]:
    """(start, end) of a top-level `NAME = {` ... `}` literal. end points at '}'."""
    m = re.search(rf"^{name} = \{{", src, re.M)
    if not m:
        raise SystemExit(f"{name} not found in build-frontal.py")
    line_end = src.index("\n", m.end())
    if "}" in src[m.end():line_end]:  # one-line literal
        return m.start(), m.end() + src[m.end():line_end].rindex("}")
    end = src.index("\n}", m.end()) + 1
    return m.start(), end


def set_member(src: str, name: str, slug: str) -> str:
    """Add "slug" to a one-line set literal NAME = {...}."""
    s, e = _dict_block(src, name)
    body = src[s:e]
    if f'"{slug}"' in body:
        return src
    return src[:e] + f', "{slug}"' + src[e:]


def set_entry(src: str, name: str, slug: str, value: str, comment: str = "") -> str:
    """Set "slug": value in dict NAME (one-line or multi-line literal)."""
    s, e = _dict_block(src, name)
    body = src[s:e]
    one_line = "\n" not in body
    pat = re.compile(rf'("{re.escape(slug)}":\s*)([^,\n}}]+)')
    if pat.search(body):
        body = pat.sub(lambda m: m.group(1) + value, body, count=1)
        return src[:s] + body + src[e:]
    if one_line:
        sep = "" if body.rstrip().endswith("{") else ", "
        return src[:e] + f'{sep}"{slug}": {value}' + src[e:]
    note = f"    # {comment}\n" if comment else ""
    return src[:e] + f'{note}    "{slug}": {value},\n' + src[e:]


def camera_block(src: str, slug: str) -> tuple[int, int] | None:
    s, e = _dict_block(src, "CAMERAS")
    m = re.search(rf'^    "{re.escape(slug)}": \{{', src[s:e], re.M)
    if not m:
        return None
    start = s + m.start()
    i = s + m.end()
    depth = 1
    while depth:
        c = src[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
        i += 1
    return start, i  # i is just after the closing brace


def camera_set(src: str, slug: str, key: str, value: str, comment: str) -> str:
    blk = camera_block(src, slug)
    if blk is None:
        s, e = _dict_block(src, "CAMERAS")
        return src[:e] + f"    # {comment}\n    \"{slug}\": {{\"{key}\": {value}}},\n" + src[e:]
    a, b = blk
    body = src[a:b]
    if '"views"' in body:
        raise SystemExit(f"{slug} has front/back views; use --edit for this camera change")
    pat = re.compile(rf'("{key}":\s*)([^,\n}}]+)')
    if pat.search(body):
        body = pat.sub(lambda m: m.group(1) + value, body, count=1)
    elif "\n" in body:
        last = body.rindex("\n")
        head = body[:last].rstrip()
        if not head.endswith((",", "{")):
            head += ","
        body = head + f'\n        "{key}": {value},' + body[last:]
    else:
        inner = body[:-1].rstrip()
        sep = "" if inner.endswith("{") else ", "
        body = inner.rstrip(",") + f'{sep}"{key}": {value}' + "}"
    above = src[max(0, a - 400):a]
    note = "" if f"# {comment}\n" in above else f"    # {comment}\n"
    return src[:a] + note + body + src[b:]


def current_facing(wt: Path, slug: str, env: dict) -> float | None:
    code = (
        "import importlib.util,sys,json;sys.path.insert(0,'ski-hills');"
        "s=importlib.util.spec_from_file_location('bf','ski-hills/build-frontal.py');"
        "m=importlib.util.module_from_spec(s);s.loader.exec_module(m);"
        f"c=m.CAMERAS.get({slug!r}) or {{}};print(json.dumps([c.get('facing'),c.get('frame_scale',1.0)]))"
    )
    out = run([PY, "-c", code], cwd=wt, env=env, capture=True, quiet=True).stdout.strip().splitlines()[-1]
    return json.loads(out)


def apply_builtin_edits(wt: Path, args, env: dict, notes: list[str]) -> None:
    """Idempotent edits, re-run on a fresh tip by the token-aware rebase."""
    bf = wt / "ski-hills" / "build-frontal.py"
    src = bf.read_text()
    slug = args.slug
    if args.ridge_clip:
        c = "ridge clip (Stevens Pass no-cross tests), job " + args.token
        src = set_entry(src, "FLOATING_HORIZON", slug, "1.0", c)
        src = set_entry(src, "HORIZON_MIN_RUN", slug, "4", c)
        src = set_member(src, "CONTOUR_NO_CROSS", slug)
        src = set_entry(src, "CONTOUR_NO_CROSS_BASE", slug, "0", c)
        src = set_member(src, "HORIZON_RELEASE_NO_CROSS", slug)
    bf.write_text(src)
    if args.facing is not None or args.be_ccw or args.be_cw or args.frame_scale or args.frame_scale_mult:
        facing, fscale = current_facing(wt, slug, env)
        if not hasattr(args, "_orig_facing"):
            args._orig_facing, args._orig_fscale = facing, fscale
        facing, fscale = args._orig_facing, args._orig_fscale
        src = bf.read_text()
        if args.facing is not None or args.be_ccw or args.be_cw:
            if args.facing is not None:
                new = args.facing
            else:
                if facing is None:
                    raise SystemExit(f"{slug} facing is automatic (not locked); pass --facing <deg>")
                # Bird's-eye: counter-clockwise ADDS to facing.
                new = facing + (args.be_ccw or 0.0) - (args.be_cw or 0.0)
            new = round(new % 360.0, 2)
            src = camera_set(src, slug, "facing", repr(new), f"job {args.token}: facing {facing} -> {new}")
            notes.append(f"facing {facing} -> {new}")
        if args.frame_scale or args.frame_scale_mult:
            new = args.frame_scale or round(float(fscale or 1.0) * args.frame_scale_mult, 4)
            src = camera_set(src, slug, "frame_scale", repr(new), f"job {args.token}: frame_scale {fscale} -> {new}")
            notes.append(f"frame_scale {fscale} -> {new}")
        bf.write_text(src)
    if args.dem_pad:
        src = bf.read_text()
        src = set_entry(src, "DEM_PAD", slug, repr(args.dem_pad), f"job {args.token}")
        bf.write_text(src)
        notes.append(f"DEM_PAD {args.dem_pad}")
    if args.plan_cw or args.plan_ccw:
        tro = wt / "ski-hills" / "build-tree-overlays.py"
        tsrc = tro.read_text()
        s, e = _dict_block(tsrc, "PLAN_TURN_DEG")
        m = re.search(rf'"{re.escape(slug)}":\s*([-0-9.]+)', tsrc[s:e])
        if not hasattr(args, "_orig_plan"):
            args._orig_plan = float(m.group(1)) if m else 0.0
        old = args._orig_plan
        # Plan: clockwise INCREASES the plan angle.
        new = round(old + (args.plan_cw or 0.0) - (args.plan_ccw or 0.0), 2)
        tsrc = set_entry(tsrc, "PLAN_TURN_DEG", slug, repr(new), f"job {args.token}: {old} -> {new}")
        tro.write_text(tsrc)
        notes.append(f"PLAN_TURN_DEG {old} -> {new}")


def update_tokens(wt: Path, slug: str, token: str) -> None:
    """FRONTAL_V[slug], washFileV special list and index.html ?v= only."""
    js = wt / "js" / "ski-hills.js"
    s = js.read_text()
    m = re.search(r"var FRONTAL_V = \{\n(.*?)\n  \};", s, re.S)
    if not m:
        raise SystemExit("FRONTAL_V block not found")
    body = m.group(1)
    entry = re.compile(rf'^(\s*)"{re.escape(slug)}": "[^"]*"', re.M)
    if entry.search(body):
        body = entry.sub(lambda mm: f'{mm.group(1)}"{slug}": "{token}"', body, count=1)
    else:
        body = body.rstrip() + f',\n    "{slug}": "{token}"'
    s = s[: m.start(1)] + body + s[m.end(1):]
    # washFileV special list: hill.slug === "a" || ... ) ? washV : ASSET_V
    m2 = re.search(r"((?:\s*hill\.slug === \"[^\"]+\" \|\|)*\s*hill\.slug === \"[^\"]+\")(\s*\) \? washV : ASSET_V;)", s)
    if not m2:
        raise SystemExit("washFileV special list not found")
    if f'hill.slug === "{slug}"' not in m2.group(1):
        indent = re.search(r"\n(\s*)hill\.slug === ", m2.group(1)).group(1)
        new_list = m2.group(1) + f' ||\n{indent}hill.slug === "{slug}"'
        s = s[: m2.start(1)] + new_list + s[m2.end(1):]
    js.write_text(s)
    idx = wt / "ski-hills" / "index.html"
    h = idx.read_text()
    h2, n = re.subn(r'(js/ski-hills\.js\?v=)[^"]+', rf"\g<1>{token}", h)
    if n != 1:
        raise SystemExit("ski-hills.js ?v= not found once in ski-hills/index.html")
    idx.write_text(h2)


# ---------------------------------------------------------------- checks

def tree_state(svg_text: str) -> bool:
    return 'data-sh-wash="lazy"' in svg_text[:600] or "sh-frontal-trees" in svg_text


def band_count(wash_text: str) -> int:
    return len(set(re.findall(r"sh-frontal-tree-band-(\d+)", wash_text)))


def sheets(wt: Path, slug: str) -> list[Path]:
    d = wt / "ski-hills" / "frontal"
    return sorted(p for p in d.glob(f"{slug}*.svg")
                  if not p.name.endswith(".wash.svg")
                  and re.fullmatch(rf"{re.escape(slug)}(-front|-back)?\.svg", p.name))


def guard_trees(wt: Path, slug: str, stage: str) -> None:
    for svg in sheets(wt, slug):
        rel = svg.relative_to(wt).as_posix()
        before = git(wt, "show", f"HEAD:{rel}", check=False).stdout
        if before and tree_state(before) and not tree_state(svg.read_text()):
            raise SystemExit(f"TREES GUARD ({stage}): {rel} lost its wash flag / trees group")
        wash = svg.with_name(svg.name[:-4] + ".wash.svg")
        wrel = wash.relative_to(wt).as_posix()
        wbefore = git(wt, "show", f"HEAD:{wrel}", check=False).stdout
        if stage == "trees" and wbefore:
            if not wash.exists():
                raise SystemExit(f"TREES GUARD: {wrel} is missing after build-tree-overlays")
            nb, na = band_count(wbefore), band_count(wash.read_text())
            if na == 0:
                raise SystemExit(f"TREES GUARD: {wrel} has no tree bands after build-tree-overlays")
            if na != nb:
                say(f"note: {wrel} band count {nb} -> {na}")


def read_crossings(report_dir: Path, slug: str) -> dict:
    out = {}
    for p in sorted(report_dir.glob(f"{slug}*.json")):
        d = json.loads(p.read_text())
        if d.get("hill") != slug and not d["sheet"].startswith(slug):
            continue
        out[d["sheet"]] = {
            "segments": d["segments"], "pairs": d["pairs"],
            "bands": {k: v["count"] for k, v in d["bands"].items()},
        }
    return out


def forbidden_changes(wt: Path, base: str) -> list[str]:
    changed = gitout(wt, "diff", "--name-only", base, "--").splitlines()
    changed += gitout(wt, "ls-files", "--others", "--exclude-standard").splitlines()
    bad = [
        p for p in changed
        if p.startswith("css/")
        or p.startswith("ski-hills/prints/")
        or (p.endswith(".css") and "print" in Path(p).name.lower())
    ]
    return bad


# ------------------------------------------------------------------ R2

def r2_put(local: Path, key: str) -> None:
    token = os.environ.get("CLOUDFLARE_API_TOKEN")
    if not token:
        raise RuntimeError("CLOUDFLARE_API_TOKEN is not set")
    from urllib.parse import quote
    url = (f"https://api.cloudflare.com/client/v4/accounts/{R2_ACCOUNT}/r2/buckets/{R2_BUCKET}/objects/"
           + "/".join(quote(p, safe="-_.") for p in key.split("/")))
    ctype = "image/svg+xml" if key.endswith(".svg") else "application/json"
    data = local.read_bytes()
    for attempt in range(4):
        req = urllib.request.Request(url, data=data, method="PUT", headers={
            "Authorization": "Bearer " + token, "Content-Type": ctype,
            "Cache-Control": "public, max-age=86400", "User-Agent": UA,
        })
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                body = json.loads(r.read() or b"{}")
                if body.get("success", True):
                    return
        except urllib.error.HTTPError as err:
            if err.code < 500 and err.code != 429:
                raise RuntimeError(f"R2 PUT {key} failed: HTTP {err.code}") from None
        except urllib.error.URLError:
            pass
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"R2 PUT {key} failed after retries")


def worker_sha(key: str, token: str) -> str | None:
    url = f"{WORKER}/{key}?v={token}&t={int(time.time())}"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60) as r:
            return hashlib.sha256(r.read()).hexdigest()
    except urllib.error.URLError:
        return None


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def r2_upload_and_verify(wt: Path, files: list[str], token: str) -> dict:
    res = {}
    def one(rel):
        key = rel.split("ski-hills/", 1)[1]
        local = wt / rel
        r2_put(local, key)
        for _ in range(6):
            if worker_sha(key, token) == sha(local):
                return rel, "verified"
            time.sleep(3)
        return rel, "UPLOADED-BUT-UNVERIFIED"
    with cf.ThreadPoolExecutor(max_workers=6) as ex:
        for rel, status in ex.map(one, files):
            res[rel] = status
    return res


def stage_drive(wt: Path, files: list[str], token: str) -> list[str]:
    out = DRIVE_STAGE / token
    out.mkdir(parents=True, exist_ok=True)
    paths = []
    for rel in files:
        dest = out / f"{token}-{Path(rel).name}"
        shutil.copy2(wt / rel, dest)
        paths.append(str(dest))
    return paths


# ---------------------------------------------------------------- Pages

def publish_pages(pages_wt: Path, merge_sha: str, files: list[str], msg: str) -> str:
    files = [f for f in files if not f.startswith(("ski-hills/frontal/", "ski-hills/contours/"))]
    if not files:
        return "nothing to publish"
    PAGES_LOCK.touch(exist_ok=True)
    with PAGES_LOCK.open("w") as lockf:
        t = time.perf_counter()
        fcntl.flock(lockf, fcntl.LOCK_EX)
        say(f"pages lock acquired after {time.perf_counter() - t:.1f}s")
        for attempt in range(6):
            git(pages_wt, "fetch", "-q", "origin", PAGES_BRANCH, "main")
            git(pages_wt, "checkout", "-q", "--detach", "-f", f"origin/{PAGES_BRANCH}")
            git(pages_wt, "checkout", merge_sha, "--", *files)
            if not gitout(pages_wt, "status", "--porcelain"):
                return gitout(pages_wt, "rev-parse", "HEAD") + " (already published)"
            git(pages_wt, "add", "--", *files)
            git(pages_wt, "commit", "-q", "-m", msg)
            tree = gitout(pages_wt, "ls-tree", "--name-only", "HEAD", "ski-hills/")
            if re.search(r"^ski-hills/(frontal|contours)$", tree, re.M):
                raise SystemExit("Pages tree would contain ski-hills/frontal or ski-hills/contours; refusing")
            push = git(pages_wt, "push", "origin", f"HEAD:refs/heads/{PAGES_BRANCH}", check=False)
            if push.returncode == 0:
                return gitout(pages_wt, "rev-parse", "HEAD")
            say(f"pages push rejected (attempt {attempt + 1}); re-fetching")
            time.sleep(2 + attempt)
        raise SystemExit("Pages push kept being rejected")


def live_check(slug: str, token: str, timeout_s: int) -> str | None:
    end = time.time() + timeout_s
    url = f"{LIVE}/js/ski-hills.js?v={token}&t="
    while time.time() < end:
        try:
            with urllib.request.urlopen(urllib.request.Request(url + str(int(time.time())), headers={"User-Agent": UA}), timeout=30) as r:
                if f'"{slug}": "{token}"' in r.read().decode("utf-8", "replace"):
                    return now()
        except urllib.error.URLError:
            pass
        time.sleep(15)
    return None


# ----------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("slug")
    ap.add_argument("--token", required=True, help="version token, e.g. 20261116stz")
    ap.add_argument("--title", default="", help="PR title (Canadian spelling)")
    ap.add_argument("--body", default="", help="PR body; the script appends crossings and timings")
    ap.add_argument("--ridge-clip", action="store_true", help="FLOATING_HORIZON 1.0, HORIZON_MIN_RUN 4, CONTOUR_NO_CROSS, CONTOUR_NO_CROSS_BASE 0, HORIZON_RELEASE_NO_CROSS")
    ap.add_argument("--facing", type=float, help="absolute bird's-eye facing")
    ap.add_argument("--be-ccw", type=float, default=0.0, help="turn bird's-eye counter-clockwise (ADDS to facing)")
    ap.add_argument("--be-cw", type=float, default=0.0, help="turn bird's-eye clockwise (subtracts from facing)")
    ap.add_argument("--frame-scale", type=float, help="absolute frame_scale")
    ap.add_argument("--frame-scale-mult", type=float, help="multiply the current frame_scale (0.88 = zoom out ~12%%)")
    ap.add_argument("--dem-pad", type=float, help="DEM_PAD for this slug")
    ap.add_argument("--plan-cw", type=float, default=0.0, help="plan clockwise (INCREASES PLAN_TURN_DEG); needs --edit for the contour refit")
    ap.add_argument("--plan-ccw", type=float, default=0.0)
    ap.add_argument("--edit", action="append", default=[], help="extra shell command run in the worktree after built-in edits")
    ap.add_argument("--plan-trees", action="store_true", help="also rebuild the plan wash (build-tree-overlays without --frontal-only)")
    ap.add_argument("--baseline", choices=("auto", "on", "off"), default="auto", help="crossings before the edit (auto: on for --ridge-clip)")
    ap.add_argument("--dry-run", action="store_true", help="no edits/PR/publish/upload; byte-compare with origin/main and the Worker")
    ap.add_argument("--stop-after", choices=("setup", "build", "checks", "pr"), help="stop after this phase")
    ap.add_argument("--resume", action="store_true", help="reuse an existing job worktree")
    ap.add_argument("--live-timeout", type=int, default=600)
    ap.add_argument("--keep-worktree", action="store_true")
    args = ap.parse_args()

    slug, token = args.slug, args.token
    t_job = time.perf_counter()
    env = build_env()
    notes: list[str] = []
    wt = WORK_ROOT / f"dpa-job-{token}"
    jobdir = wt / ".job"
    branch = f"cursor/{slug}-{token}"
    summary: dict = {"slug": slug, "token": token, "worktree": str(wt), "started": now()}

    if free_gb(WORK_ROOT) < MIN_FREE_GB:
        raise SystemExit(f"only {free_gb(WORK_ROOT):.1f} GB free; need {MIN_FREE_GB} GB for a job")

    with Step("worktree"):
        run(["git", "-C", str(REPO_MAIN), "fetch", "-q", "origin", "main", PAGES_BRANCH])
        if args.resume and wt.exists():
            say("reusing", wt)
        else:
            make_sparse_worktree(wt, branch, "origin/main", slug_patterns(slug))
        jobdir.mkdir(exist_ok=True)
        base = gitout(wt, "rev-parse", "origin/main")
        if not sheets(wt, slug) and not args.dry_run:
            say(f"note: {slug} has no published bird's-eye sheet yet")

    with Step("setup"):
        run([PY, "ski-hills/setup-build-inputs.py", slug], cwd=wt, env=env)
    if args.stop_after == "setup":
        return finish(summary, t_job)

    do_baseline = args.baseline == "on" or (args.baseline == "auto" and (args.ridge_clip or args.dry_run))
    if do_baseline and not args.dry_run:
        with Step("baseline-crossings"):
            benv = dict(env, RIDGE_CROSSING_REPORT="1", RIDGE_CROSSING_REPORT_DIR=str(jobdir / "before"))
            run([PY, "ski-hills/build-frontal.py", slug], cwd=wt, env=benv, capture=True)
            git(wt, "checkout", "-q", "HEAD", "--", "ski-hills/frontal", "ski-hills/contours", check=False)
            summary["crossings_before"] = read_crossings(jobdir / "before", slug)
            say("crossings before", summary["crossings_before"])

    if not args.dry_run:
        with Step("edits"):
            apply_builtin_edits(wt, args, env, notes)
            for cmd in args.edit:
                run(cmd, cwd=wt, env=env)
            summary["edits"] = notes

    with Step("render"):
        renv = dict(env, RIDGE_CROSSING_REPORT="1", RIDGE_CROSSING_REPORT_DIR=str(jobdir / "after"))
        r = run([PY, "ski-hills/build-frontal.py", slug], cwd=wt, env=renv, capture=True)
        (jobdir / "render.log").write_text(r.stdout)
        guard_trees(wt, slug, "render")

    with Step("trees"):
        targs = [PY, "ski-hills/build-tree-overlays.py", slug] + ([] if args.plan_trees else ["--frontal-only"])
        r = run(targs, cwd=wt, env=env, capture=True)
        (jobdir / "trees.log").write_text(r.stdout)
        guard_trees(wt, slug, "trees")
    if args.stop_after == "build":
        return finish(summary, t_job)

    with Step("checks"):
        with cf.ThreadPoolExecutor(max_workers=3) as ex:
            f_st = ex.submit(run, [PY, "ski-hills/check-tree-stairs.py", "--base", base], cwd=wt, env=env, check=False, capture=True, quiet=True)
            f_op = ex.submit(run, [PY, "ski-hills/check-tree-opacity.py", "--base", base], cwd=wt, env=env, check=False, capture=True, quiet=True)
            f_cx = ex.submit(read_crossings, jobdir / "after", slug)
            st, op, cx = f_st.result(), f_op.result(), f_cx.result()
        (jobdir / "stairs.log").write_text(st.stdout)
        (jobdir / "opacity.log").write_text(op.stdout)
        summary["crossings_after"] = cx
        summary["stairs"] = "pass" if st.returncode == 0 else "FAIL"
        summary["opacity"] = "pass" if op.returncode == 0 else "FAIL"
        say("stairs", summary["stairs"], "opacity", summary["opacity"], "crossings after", cx)
        if st.returncode or op.returncode:
            raise SystemExit("tree checks failed; see " + str(jobdir))
        bad = forbidden_changes(wt, base)
        if bad:
            raise SystemExit("print stylesheet / css changed: " + ", ".join(bad))

    if args.dry_run:
        with Step("compare"):
            cmp = {}
            for rel in [p.relative_to(wt).as_posix() for s in sheets(wt, slug) for p in (s, s.with_name(s.name[:-4] + ".wash.svg"))]:
                if not (wt / rel).exists():
                    continue
                same_git = git(wt, "diff", "--quiet", "HEAD", "--", rel, check=False).returncode == 0
                key = rel.split("ski-hills/", 1)[1]
                live = worker_sha(key, "dryrun")
                cmp[rel] = {"same_as_origin_main": same_git, "same_as_worker": live == sha(wt / rel)}
            summary["dry_run_compare"] = cmp
            say("compare", cmp)
        return finish(summary, t_job, wt, args)

    if args.stop_after == "checks":
        return finish(summary, t_job)

    with Step("tokens+commit"):
        update_tokens(wt, slug, token)
        stage_job_files(wt)
        title = args.title or f"{slug}: bird's-eye job {token}"
        git(wt, "commit", "-q", "-m", title)
        old_head = gitout(wt, "rev-parse", "HEAD")
        changed = gitout(wt, "diff", "--name-only", "origin/main", "HEAD").splitlines()
        summary["changed_files"] = changed
        git(wt, "push", "-q", "-u", "origin", branch)
        body = (args.body or title) + "\n\n" + pr_footer(summary, token)
        pr = run(["gh", "pr", "create", "-R", GH_REPO, "--base", "main", "--head", branch, "--title", title, "--body", body], capture=True, quiet=True).stdout.strip().splitlines()[-1]
        summary["pr"] = pr
        say("PR", pr)
    if args.stop_after == "pr":
        return finish(summary, t_job)

    with Step("rebase+merge"):
        prnum = int(pr.rstrip("/").split("/")[-1])
        if prnum in NEVER_MERGE:
            raise SystemExit(f"refusing to merge PR #{prnum}")
        merge_sha = None
        for attempt in range(5):
            token_aware_rebase(wt, args, env, notes, old_head)
            git(wt, "push", "-q", "--force-with-lease", "origin", branch)
            m = run(["gh", "pr", "merge", str(prnum), "-R", GH_REPO, "--squash", "--delete-branch=false",
                     "--subject", f"{title} (#{prnum})"], check=False, capture=True, quiet=True)
            if m.returncode == 0:
                break
            say(f"merge attempt {attempt + 1} failed: {m.stdout.strip()[-300:]}")
            time.sleep(5)
        info = json.loads(run(["gh", "pr", "view", str(prnum), "-R", GH_REPO, "--json", "state,mergeCommit"], capture=True, quiet=True).stdout)
        if info.get("state") != "MERGED":
            raise SystemExit(f"PR #{prnum} did not merge")
        merge_sha = info["mergeCommit"]["oid"]
        summary["merge_sha"] = merge_sha
        run(["git", "-C", str(REPO_MAIN), "fetch", "-q", "origin", "main"])
        changed = gitout(wt, "diff", "--name-only", f"{merge_sha}^", merge_sha).splitlines()
        summary["changed_files"] = changed

    with Step("publish+upload"):
        pages_wt = WORK_ROOT / f"dpa-pages-job-{token}"
        if not pages_wt.exists():
            make_pages_worktree(pages_wt)
        assets = [f for f in changed if f.startswith(("ski-hills/frontal/", "ski-hills/contours/"))]
        msg = f"Publish PR #{prnum}: {title} (cache {token})."
        with cf.ThreadPoolExecutor(max_workers=3) as ex:
            f_pages = ex.submit(publish_pages, pages_wt, merge_sha, changed, msg)
            f_r2 = ex.submit(r2_upload_and_verify, wt, assets, token)
            f_drive = ex.submit(stage_drive, wt, assets, token)
            summary["pages_sha"] = f_pages.result()
            summary["r2"] = f_r2.result()
            summary["drive_staged"] = f_drive.result()
        summary["drive_folder"] = DRIVE_FOLDER
        say("pages", summary["pages_sha"], "r2", summary["r2"])

    with Step("live"):
        summary["live_at"] = live_check(slug, token, args.live_timeout) or "NOT LIVE YET"

    ci = run(["gh", "pr", "checks", str(prnum), "-R", GH_REPO], check=False, capture=True, quiet=True)
    summary["ci"] = "pass" if ci.returncode == 0 else ("pending" if ci.returncode == 8 else "FAIL/none: " + ci.stdout.strip()[-300:])
    if not args.keep_worktree:
        for p in (wt, pages_wt):
            run(["git", "-C", str(REPO_MAIN), "worktree", "remove", "--force", str(p)], check=False, quiet=True)
        summary["worktree"] = "removed"
    return finish(summary, t_job)


def token_aware_rebase(wt: Path, args, env, notes, old_head: str) -> None:
    git(wt, "fetch", "-q", "origin", "main")
    if gitout(wt, "merge-base", "HEAD", "origin/main") == gitout(wt, "rev-parse", "origin/main"):
        return
    r = git(wt, "rebase", "-q", "origin/main", check=False)
    if r.returncode == 0:
        say("rebased cleanly on", gitout(wt, "rev-parse", "--short", "origin/main"))
        return
    git(wt, "rebase", "--abort", check=False)
    say("rebase conflict; re-applying this slug's entries on the fresh tip")
    slug, token = args.slug, args.token
    own = [f for f in gitout(wt, "diff", "--name-only", f"{old_head}^", old_head).splitlines()]
    outputs = [f for f in own if f.startswith(("ski-hills/frontal/", "ski-hills/contours/")) and Path(f).name.startswith(slug)]
    other = [f for f in own if f not in outputs and f not in ("js/ski-hills.js", "ski-hills/index.html", "ski-hills/build-frontal.py", "ski-hills/build-tree-overlays.py")]
    if args.edit and other:
        raise SystemExit("rebase conflict with bespoke --edit changes in " + ", ".join(other) + "; resolve by hand")
    git(wt, "reset", "-q", "--hard", "origin/main")
    if outputs:
        git(wt, "checkout", old_head, "--", *outputs)
    if other:
        git(wt, "checkout", old_head, "--", *other)
    apply_builtin_edits(wt, args, env, [])
    update_tokens(wt, slug, token)
    stage_job_files(wt)
    git(wt, "commit", "-q", "-m", gitout(wt, "log", "-1", "--format=%B", old_head))


def stage_job_files(wt: Path) -> None:
    """Stage the job's edits, never bytecode or build inputs."""
    git(wt, "add", "-A", "--", "js", "ski-hills")
    git(wt, "reset", "-q", "--", "ski-hills/build-inputs", "ski-hills/__pycache__")
    git(wt, "checkout", "-q", "--", "ski-hills/__pycache__", check=False)


def pr_footer(summary: dict, token: str) -> str:
    lines = [f"Cache {token}."]
    if "crossings_before" in summary or "crossings_after" in summary:
        lines.append(f"Ridge crossings (30 m): before {summary.get('crossings_before')} after {summary.get('crossings_after')}.")
    lines.append(f"Tree checks: stairs {summary.get('stairs')}, opacity {summary.get('opacity')}. Built with tools/ski-hill-job.py.")
    return "\n".join(lines)


def finish(summary: dict, t_job: float, wt: Path | None = None, args=None):
    summary["timings_s"] = TIMES
    summary["total_s"] = round(time.perf_counter() - t_job, 1)
    summary["finished"] = now()
    text = json.dumps(summary, indent=1)
    try:
        jd = Path(summary["worktree"]) / ".job"
        if jd.exists():
            (jd / "summary.json").write_text(text)
    except Exception:
        pass
    print("\n=== SUMMARY ===\n" + text, flush=True)
    if summary.get("drive_staged"):
        print(f"Drive: upload these to folder {DRIVE_FOLDER} with UploadFile:")
        for p in summary["drive_staged"]:
            print("  ", p)
    return 0


if __name__ == "__main__":
    sys.exit(main())
