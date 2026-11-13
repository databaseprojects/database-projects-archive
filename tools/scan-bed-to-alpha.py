#!/usr/bin/env python3
"""Make the gray scanner bed around a photo scan transparent.

Reads the images in an input folder and writes PNGs of the same pixel size
to an output folder. Each output keeps every photo pixel as it was. The only
change is an alpha channel: the scanner bed around a rough or uncropped edge
is transparent, and the print itself is left alone. Nothing is cropped,
resized, or recolored.

The bed is the neutral gray connected to the image border. Its gray is
sampled from border pixels that give way to the print a short distance
inward, so a full-bleed photograph's own edge is not treated as the bed.
A flood fill then takes only pixels near that gray. Where the scan has a
light print margin, the fill also accepts the shaded range of the same bed
up to just short of the paper, and stops there.

Usage:
    python3 tools/scan-bed-to-alpha.py INPUT_DIR OUTPUT_DIR
    python3 tools/scan-bed-to-alpha.py INPUT_DIR OUTPUT_DIR --tolerance 32

--tolerance is how far a pixel may sit from the bed's gray, per channel,
and still count as the bed. The default is 32.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp", ".bmp"}
DEFAULT_TOLERANCE = 32

# Neutral-gray limits. The bed is gray; the print's paper and the picture
# are often warmer or more colored, and those pixels must stay.
BED_CHROMA = 20
# The fill is stricter than the sample. A pale sky or a warm picture can sit
# just outside the bed's gray; those pixels stay in the print.
FILL_CHROMA = 14
# A border pixel counts as bed only when the print starts within this many
# pixels inward. That rejects a photograph that simply runs to the edge.
INWARD_STEPS = 20
# Below this, a pixel is too dark to be the gray bed.
BED_FLOOR = 50
# The fill stops this far below the print margin so the paper stays.
PAPER_GAP = 14


def flood_from_border(near: np.ndarray) -> np.ndarray:
    """4-connected flood fill of `near`, seeded on the image border."""
    reach = np.zeros(near.shape, dtype=bool)
    reach[0, :] = near[0, :]
    reach[-1, :] = near[-1, :]
    reach[:, 0] = near[:, 0]
    reach[:, -1] = near[:, -1]
    while True:
        grown = reach.copy()
        grown[1:, :] |= reach[:-1, :]
        grown[:-1, :] |= reach[1:, :]
        grown[:, 1:] |= reach[:, :-1]
        grown[:, :-1] |= reach[:, 1:]
        grown &= near
        if np.array_equal(grown, reach):
            return reach
        reach = grown


def _paper_luminance(lum: np.ndarray, chroma: np.ndarray) -> float | None:
    """Median luminance of a light print margin, or None when there isn't one."""
    height, width = lum.shape
    if height < 48 or width < 48:
        return None
    samples = []
    inner = range(8, min(32, height // 5, width // 5))
    for step in inner:
        for row_l, row_c in (
            (lum[step, 8:-8], chroma[step, 8:-8]),
            (lum[-1 - step, 8:-8], chroma[-1 - step, 8:-8]),
            (lum[8:-8, step], chroma[8:-8, step]),
            (lum[8:-8, -1 - step], chroma[8:-8, -1 - step]),
        ):
            neutral = row_l[row_c <= FILL_CHROMA]
            if neutral.size:
                samples.append(neutral)
    if not samples:
        return None
    values = np.concatenate(samples)
    bright = values[values >= 198]
    # A real margin is a long run of paper, not a few light pixels.
    if bright.size < 500:
        return None
    return float(np.median(bright))


def _border_kinds(lum: np.ndarray, chroma: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Classify border pixels that belong to the bed rather than the print.

    Outside a light margin, the bed is the gray that rises into the paper and
    stays light. Around a full-bleed print, the bed is a light rim that drops
    into the picture. A photograph that simply runs off the edge does neither
    in a sustained way, so its pixels are not marked.
    """
    height, width = lum.shape
    margin = np.zeros((height, width), dtype=bool)
    rim = np.zeros((height, width), dtype=bool)

    def consider(y: int, x: int, inward) -> None:
        if int(chroma[y, x]) > BED_CHROMA:
            return
        level = float(lum[y, x])
        if not (BED_FLOOR <= level <= 210):
            return
        levels = []
        for depth in range(1, INWARD_STEPS + 1):
            ny, nx = inward(depth)
            if ny < 0 or nx < 0 or ny >= height or nx >= width:
                break
            levels.append(float(lum[ny, nx]))
        # A real margin stays light. A three-pixel bump inside the picture does not.
        for index in range(2, max(0, len(levels) - 5)):
            window = levels[index:index + 6]
            med = float(np.median(window))
            if med >= max(level + 24, 175) and min(window) >= level + 15:
                margin[y, x] = True
                return
        if level >= 150:
            for index in range(2, max(0, len(levels) - 2)):
                window = levels[index:index + 3]
                if levels[index] <= level - 40 and all(abs(value - level) >= 25 for value in window):
                    rim[y, x] = True
                    return

    for x in range(width):
        consider(0, x, lambda d: (d, x))
        consider(height - 1, x, lambda d: (height - 1 - d, x))
    for y in range(height):
        consider(y, 0, lambda d: (y, d))
        consider(y, width - 1, lambda d: (y, width - 1 - d))
    return margin, rim


def scanner_bed_mask(rgb: np.ndarray, tolerance: int) -> np.ndarray:
    """Boolean mask of the scanner bed. True pixels become transparent.

    `rgb` is uint8 HxWx3. Photo pixels are never selected unless they are
    the neutral gray of the bed and connected to the border through it.
    """
    if tolerance < 0:
        raise ValueError("tolerance must be >= 0")
    height, width = rgb.shape[:2]
    if height < 3 or width < 3:
        return np.zeros((height, width), dtype=bool)

    arr = rgb.astype(np.int16)
    chroma = arr.max(axis=2) - arr.min(axis=2)
    lum = arr.mean(axis=2)
    paper = _paper_luminance(lum, chroma)
    margin, rim = _border_kinds(lum, chroma)
    if int(margin.sum()) < 16 and int(rim.sum()) < 16:
        return np.zeros((height, width), dtype=bool)

    near = np.zeros((height, width), dtype=bool)
    # Shaded bed outside a light print margin: follow the grays actually
    # sampled on that border, expanded by the tolerance, and stop at the paper.
    if int(margin.sum()) >= 16:
        sampled = lum[margin]
        high_sample = float(np.percentile(sampled, 92))
        # Samples that never get near the paper are the picture, not the bed.
        meets_paper = paper is not None and high_sample >= paper - 55
        if meets_paper:
            low = float(np.percentile(sampled, 8)) - tolerance * 0.5
            high = min(high_sample + tolerance, paper - PAPER_GAP)
            near |= (chroma <= FILL_CHROMA) & (lum >= max(BED_FLOOR, low)) & (lum <= high)
    # Light rim around a full-bleed print: only pixels near that rim's gray.
    if int(rim.sum()) >= 16:
        bed = np.median(arr[rim], axis=0)
        distance = np.max(np.abs(arr - bed), axis=2)
        near |= (chroma <= BED_CHROMA) & (distance <= tolerance)

    mask = flood_from_border(near)
    if _leaked(mask):
        # The wide shade range reached the picture. Fall back to pixels near
        # the sampled bed gray and drop the result if that still spills.
        sample = rim if int(rim.sum()) >= 16 else margin
        bed = np.median(arr[sample], axis=0)
        distance = np.max(np.abs(arr - bed), axis=2)
        near = (chroma <= BED_CHROMA) & (distance <= tolerance)
        if paper is not None:
            near &= lum <= (paper - PAPER_GAP)
        mask = flood_from_border(near)
        if _leaked(mask):
            return np.zeros((height, width), dtype=bool)
    return _trim_to_rim(_supported_rays(mask, lum))


def _supported_rays(mask: np.ndarray, lum: np.ndarray) -> np.ndarray:
    """Keep a border ray only when it ends at the print, not inside it.

    Walking in from the frame, the bed stops at paper (a clear rise) or, for
    a light rim on a full-bleed print, drops into the picture. A ray that
    fades into more of the same gray is the photograph and is left opaque.
    """
    if not mask.any():
        return mask
    height, width = mask.shape
    keep = np.zeros_like(mask)

    def walk(y0: int, x0: int, dy: int, dx: int) -> None:
        y, x = y0, x0
        seen = []
        for _ in range(max(height, width)):
            if not (0 <= y < height and 0 <= x < width) or not mask[y, x]:
                break
            seen.append((y, x))
            y += dy
            x += dx
        if not seen:
            return
        if not (0 <= y < height and 0 <= x < width):
            return
        start = float(lum[seen[0]])
        # A few pixels past the bed, so a one-pixel blend does not decide it.
        py, px = y, x
        for _ in range(6):
            ny, nx = py + dy, px + dx
            if not (0 <= ny < height and 0 <= nx < width):
                break
            py, px = ny, nx
        beyond = float(lum[py, px])
        if beyond >= start + 18 or beyond <= start - 35:
            for sy, sx in seen:
                keep[sy, sx] = True

    for x in range(width):
        walk(0, x, 1, 0)
        walk(height - 1, x, -1, 0)
    for y in range(height):
        walk(y, 0, 0, 1)
        walk(y, width - 1, 0, -1)
    return keep


def _trim_to_rim(mask: np.ndarray) -> np.ndarray:
    """Drop a fill that has run into the picture instead of staying a rim.

    A scanner bed is a border. When the median cleared pixel sits far inside
    the frame, the gray being followed is the photograph, and the mask is
    discarded. A long tail past the usual rim, such as snow or sky just inside
    a real bed, is cut off.
    """
    if not mask.any():
        return mask
    height, width = mask.shape
    yy, xx = np.indices(mask.shape)
    depth = np.minimum(np.minimum(yy, height - 1 - yy), np.minimum(xx, width - 1 - xx))
    med = float(np.median(depth[mask]))
    if med > 40:
        return np.zeros(mask.shape, dtype=bool)
    cap = max(72, int(med * 4))
    return mask & (depth <= cap)


def _leaked(mask: np.ndarray) -> bool:
    """True when the fill has run into the picture instead of staying a rim."""
    fraction = float(mask.mean())
    if fraction > 0.15:
        return True
    ys, xs = np.where(mask)
    if ys.size == 0:
        return False
    height, width = mask.shape
    depth = np.minimum(np.minimum(ys, height - 1 - ys), np.minimum(xs, width - 1 - xs))
    return int(depth.max()) > 0.22 * max(height, width)


def _load_rgb(path: Path) -> np.ndarray:
    """RGB uint8 at the file's stored pixel size. Orientation is left as stored."""
    with Image.open(path) as image:
        if image.mode == "RGB":
            return np.array(image)
        if image.mode == "RGBA":
            return np.array(image)[:, :, :3]
        return np.array(image.convert("RGB"))


def clear_scanner_bed(rgb: np.ndarray, tolerance: int) -> tuple[np.ndarray, int]:
    """Return an RGBA image and how many pixels were made transparent.

    RGB is identical to `rgb` everywhere, including inside the transparent bed.
    """
    mask = scanner_bed_mask(rgb, tolerance)
    alpha = np.where(mask, 0, 255).astype(np.uint8)
    rgba = np.dstack([rgb, alpha])
    return rgba, int(mask.sum())


def _images(folder: Path) -> list[Path]:
    files = []
    for path in sorted(folder.iterdir()):
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES and not path.name.startswith("."):
            files.append(path)
    return files


def process_folder(source: Path, dest: Path, tolerance: int) -> int:
    if not source.is_dir():
        print(f"Input folder not found: {source}", file=sys.stderr)
        return 2
    dest.mkdir(parents=True, exist_ok=True)
    files = _images(source)
    if not files:
        print(f"No images in {source}", file=sys.stderr)
        return 1

    cleared = 0
    for path in files:
        rgb = _load_rgb(path)
        rgba, count = clear_scanner_bed(rgb, tolerance)
        # The print's stored channels stay byte-for-byte.
        if not np.array_equal(rgba[:, :, :3], rgb):
            raise RuntimeError(f"photo pixels changed: {path.name}")
        out = dest / f"{path.stem}.png"
        Image.fromarray(rgba, "RGBA").save(out, format="PNG")
        if count:
            cleared += 1
            print(f"{path.name}: {count} bed pixels transparent -> {out.name}")
        else:
            print(f"{path.name}: no scanner bed, photo unchanged -> {out.name}")
    print(f"{cleared} of {len(files)} images had scanner bed removed")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("input_dir", type=Path, help="Folder of scans")
    parser.add_argument("output_dir", type=Path, help="Folder for PNG output")
    parser.add_argument(
        "--tolerance",
        type=int,
        default=DEFAULT_TOLERANCE,
        help=f"Per-channel distance from the bed gray (default {DEFAULT_TOLERANCE})",
    )
    args = parser.parse_args(argv)
    if args.tolerance < 0:
        print("Tolerance must be zero or greater.", file=sys.stderr)
        return 2
    return process_folder(args.input_dir, args.output_dir, args.tolerance)


if __name__ == "__main__":
    raise SystemExit(main())
