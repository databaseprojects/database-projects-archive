#!/usr/bin/env python3
"""Candidate clumps for Found Photographs.

Neighbours in the page's original scan order (data-order) are compared
from their Cloudinary fronts: print shape, border, tone, and palette.
A run of similar neighbours becomes one candidate. Confirmed clumps are
a separate file (clumps.json) that Billy edits from the Clump review.

Requires Pillow. From the repo root:

  python3 found-photographs/build-clump-candidates.py

Thumbnails are cached under /tmp/fp-clump-cache so a rerun does not
download again. The script writes found-photographs/clump-candidates.json.
"""

import json
import math
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "found-photographs" / "index.html"
OUT = ROOT / "found-photographs" / "clump-candidates.json"
CACHE = Path("/tmp/fp-clump-cache")

# Same print, not the same scene. Shape and border are gates. Palette and
# tone still have to agree, so two different stacks that merely share a
# drugstore aspect do not join.
ASPECT_LOG = 0.09
SAT_BW = 0.09
SAT_COLOR = 0.18
PAIR_MIN = 0.64
SCAN_GAP = 2

FIG_RE = re.compile(r'<figure class="fp-tile" ([^>]*)>')
ORDER_RE = re.compile(r'data-order="(\d+)"')
FRONT_RE = re.compile(r'data-front="([^"]+)"')
AR_RE = re.compile(r"--fp-ar:\s*([0-9.]+)")
SCAN_RE = re.compile(r"FastFoto_(\d{4})_(\d{2})_(\d+)_")


def thumb_url(url):
    return url.replace(
        "/image/upload/f_auto,q_auto,c_limit,w_800,h_800/",
        "/image/upload/f_jpg,q_60,c_limit,w_200,h_200/",
        1,
    )


def file_of(url):
    name = url.split("/")[-1].split("?")[0]
    return re.sub(r"\.(jpe?g|png|webp)$", "", name, flags=re.I)


def load_tiles():
    text = HTML.read_text(encoding="utf-8")
    tiles = []
    for attrs in FIG_RE.findall(text):
        order = ORDER_RE.search(attrs)
        front = FRONT_RE.search(attrs)
        aspect = AR_RE.search(attrs)
        if not order or not front or not aspect:
            raise SystemExit("unparsed tile " + attrs[:160])
        order, url, aspect = order.group(1), front.group(1), aspect.group(1)
        name = file_of(url)
        match = SCAN_RE.search(name + "_")
        scan = None
        batch = None
        if match:
            batch = match.group(1) + "_" + match.group(2)
            scan = int(match.group(3))
        tiles.append({
            "order": int(order),
            "file": name,
            "url": url,
            "aspect": float(aspect),
            "batch": batch,
            "scan": scan,
        })
    tiles.sort(key=lambda tile: tile["order"])
    return tiles


def download(tile):
    CACHE.mkdir(parents=True, exist_ok=True)
    dest = CACHE / (tile["file"] + ".jpg")
    if dest.exists() and dest.stat().st_size > 500:
        return dest
    request = urllib.request.Request(
        thumb_url(tile["url"]),
        headers={"User-Agent": "found-photographs-clumps"},
    )
    with urllib.request.urlopen(request, timeout=40) as response:
        dest.write_bytes(response.read())
    return dest


def is_paper(sample):
    mean, std, sat = sample
    return std < 18 and sat < 0.14 and (mean >= 190 or mean <= 48)


def edge_run(stats, length):
    """How far a flat paper or dark edge continues, as a fraction.

    The first scan line is often a dirty edge in front of the real border,
    so a single non-paper line at the outside is skipped.
    """
    start = 0
    if len(stats) > 2 and not is_paper(stats[0]) and is_paper(stats[1]):
        start = 1
    limit = max(1, int(length * 0.28))
    run = 0
    tone = 0.0
    for sample in stats[start:limit]:
        if not is_paper(sample):
            break
        run += 1
        tone += sample[0]
    if run == 0:
        return 0.0, None
    return run / float(length), tone / run


def features(path, aspect):
    image = Image.open(path).convert("RGB")
    width, height = image.size
    pixels = image.load()

    def luma(rgb):
        red, green, blue = rgb
        return 0.2126 * red + 0.7152 * green + 0.0722 * blue

    def sat(rgb):
        red, green, blue = rgb
        peak = max(rgb)
        if peak <= 0:
            return 0.0
        return (peak - min(rgb)) / float(peak)

    rows = []
    for y in range(height):
        total = 0.0
        squares = 0.0
        color = 0.0
        for x in range(width):
            rgb = pixels[x, y]
            value = luma(rgb)
            total += value
            squares += value * value
            color += sat(rgb)
        mean = total / width
        rows.append((mean, math.sqrt(max(0.0, squares / width - mean * mean)), color / width))

    cols = []
    for x in range(width):
        total = 0.0
        squares = 0.0
        color = 0.0
        for y in range(height):
            rgb = pixels[x, y]
            value = luma(rgb)
            total += value
            squares += value * value
            color += sat(rgb)
        mean = total / height
        cols.append((mean, math.sqrt(max(0.0, squares / height - mean * mean)), color / height))

    top, top_tone = edge_run(rows, height)
    bottom, bottom_tone = edge_run(list(reversed(rows)), height)
    left, left_tone = edge_run(cols, width)
    right, right_tone = edge_run(list(reversed(cols)), width)
    insets = sorted([top, bottom, left, right])
    # A print border goes around the picture. Use the shorter pair so a
    # one-sided scanner shadow does not count as a border.
    border = (insets[0] + insets[1]) / 2.0
    tones = [tone for tone in (top_tone, bottom_tone, left_tone, right_tone) if tone is not None]
    border_tone = sum(tones) / len(tones) if tones else None

    pad_y = int(round(max(top, bottom) * height)) + 1
    pad_x = int(round(max(left, right) * width)) + 1
    y0 = min(pad_y, height // 3)
    y1 = max(y0 + 1, height - min(pad_y, height // 3))
    x0 = min(pad_x, width // 3)
    x1 = max(x0 + 1, width - min(pad_x, width // 3))

    hist = [0] * 64
    count = 0
    lum_total = 0.0
    sat_total = 0.0
    warm = 0.0
    for y in range(y0, y1):
        for x in range(x0, x1):
            red, green, blue = pixels[x, y]
            hist[((red >> 6) << 4) | ((green >> 6) << 2) | (blue >> 6)] += 1
            lum_total += luma((red, green, blue))
            sat_total += sat((red, green, blue))
            warm += red - blue
            count += 1
    count = count or 1
    return {
        "aspect": aspect,
        "border": border,
        "border_tone": border_tone,
        "lum": lum_total / count,
        "sat": sat_total / count,
        "warm": warm / count,
        "hist": hist,
    }


def hist_overlap(left, right):
    total_left = float(sum(left) or 1)
    total_right = float(sum(right) or 1)
    return sum(min(a / total_left, b / total_right) for a, b in zip(left, right))


def neighbours(left, right):
    if not left["batch"] or left["batch"] != right["batch"]:
        return False
    if left["scan"] is None or right["scan"] is None:
        return False
    gap = right["scan"] - left["scan"]
    return 1 <= gap <= SCAN_GAP


def pair_score(left, right):
    if left["aspect"] <= 0 or right["aspect"] <= 0:
        return 0.0
    if abs(math.log(left["aspect"] / right["aspect"])) > ASPECT_LOG:
        return 0.0
    # A clear paper border against a full-bleed frame is a different print.
    # Smaller differences are scan noise around the same border, so they
    # only pull the score down.
    if max(left["border"], right["border"]) >= 0.06 and min(left["border"], right["border"]) < 0.012:
        return 0.0
    if left["border_tone"] is not None and right["border_tone"] is not None:
        if abs(left["border_tone"] - right["border_tone"]) > 70:
            return 0.0
    sat_left = left["sat"]
    sat_right = right["sat"]
    bw_left = sat_left < SAT_BW
    bw_right = sat_right < SAT_BW
    color_left = sat_left > SAT_COLOR
    color_right = sat_right > SAT_COLOR
    if (bw_left and color_right) or (bw_right and color_left):
        return 0.0
    if abs(sat_left - sat_right) > 0.09 and min(sat_left, sat_right) < 0.1 and max(sat_left, sat_right) > 0.15:
        return 0.0
    overlap = hist_overlap(left["hist"], right["hist"])
    tone = 1.0 - min(1.0, abs(left["lum"] - right["lum"]) / 90.0)
    warm = 1.0 - min(1.0, abs(left["warm"] - right["warm"]) / 40.0)
    border_sim = 1.0 - min(1.0, abs(left["border"] - right["border"]) / 0.08)
    sat_sim = 1.0 - min(1.0, abs(sat_left - sat_right) / 0.25)
    return 0.42 * overlap + 0.22 * border_sim + 0.16 * tone + 0.12 * warm + 0.08 * sat_sim


def clump_runs(tiles, feats):
    runs = []
    current = [0]
    scores = []
    for index in range(len(tiles) - 1):
        left = tiles[index]
        right = tiles[index + 1]
        score = 0.0
        if neighbours(left, right):
            score = pair_score(feats[left["file"]], feats[right["file"]])
        if score >= PAIR_MIN:
            current.append(index + 1)
            scores.append(score)
            continue
        if len(current) >= 2:
            runs.append((current, scores))
        current = [index + 1]
        scores = []
    if len(current) >= 2:
        runs.append((current, scores))
    clumps = []
    for number, (indexes, pair_scores) in enumerate(runs, start=1):
        clumps.append({
            "id": "c%02d" % number,
            "files": [tiles[index]["file"] for index in indexes],
            "score": round(sum(pair_scores) / len(pair_scores), 3),
        })
    return clumps


def main():
    tiles = load_tiles()
    print("tiles %d" % len(tiles))
    paths = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(download, tile): tile for tile in tiles}
        done = 0
        for future in as_completed(futures):
            tile = futures[future]
            paths[tile["file"]] = future.result()
            done += 1
            if done % 50 == 0 or done == len(tiles):
                print("downloaded %d" % done)
    feats = {}
    for tile in tiles:
        feats[tile["file"]] = features(paths[tile["file"]], tile["aspect"])
    clumps = clump_runs(tiles, feats)
    payload = {
        "note": "Candidate groups of adjacent scans that look like one set. Nothing here is confirmed. Open Found Photographs, press Clump, and export clumps.json when a group is right.",
        "clumps": clumps,
    }
    text = json.dumps(payload, indent=2) + "\n"
    OUT.write_text(text, encoding="utf-8")
    sizes = {}
    for clump in clumps:
        sizes[len(clump["files"])] = sizes.get(len(clump["files"]), 0) + 1
    print("candidates %d sizes %s" % (len(clumps), sizes))


if __name__ == "__main__":
    main()
