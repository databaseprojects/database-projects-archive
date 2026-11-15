#!/usr/bin/env python3
"""Raster previews of the city drawings for the Bike Routes index.

Each preview is the full square, painted by Chrome from the city SVG at
1200px, then stored as WebP. The index shows these. The full SVG is fetched
only when a city is opened. Requires google-chrome and ffmpeg.
"""

import struct
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "previews"
SIZE = 1200
CITIES = (
    ("vancouver", ROOT / "city.svg"),
    ("victoria", ROOT / "prints" / "victoria.svg"),
    ("calgary", ROOT / "prints" / "calgary.svg"),
    ("edmonton", ROOT / "prints" / "edmonton.svg"),
    ("toronto", ROOT / "prints" / "toronto.svg"),
    ("ottawa", ROOT / "prints" / "ottawa.svg"),
    ("hamilton", ROOT / "prints" / "hamilton.svg"),
)
PAGE = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; background: #fff; overflow: hidden; }
  img { display: block; width: %dpx; height: %dpx; }
</style>
</head>
<body>
<img src="%s" width="%d" height="%d" alt="">
</body>
</html>
"""


def png_size(path):
    data = path.read_bytes()[:32]
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    return struct.unpack(">II", data[16:24])


def render(slug, src, tmp):
    page = tmp / (slug + ".html")
    png = tmp / (slug + ".png")
    page.write_text(PAGE % (SIZE, SIZE, src.resolve().as_uri(), SIZE, SIZE))
    if png.exists():
        png.unlink()
    subprocess.run(
        [
            "timeout", "50",
            "google-chrome", "--headless=new", "--disable-gpu", "--no-sandbox",
            "--hide-scrollbars", "--force-device-scale-factor=1",
            "--default-background-color=FFFFFF",
            "--user-data-dir=/tmp/chrome-br-%s" % slug,
            "--window-size=%d,%d" % (SIZE, SIZE),
            "--screenshot=%s" % png,
            page.as_uri(),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    if png_size(png) != (SIZE, SIZE):
        raise SystemExit("preview render failed for %s" % slug)
    subprocess.check_call(
        [
            "ffmpeg", "-y", "-v", "error", "-i", str(png),
            "-c:v", "libwebp", "-quality", "92", "-preset", "drawing",
            "-compression_level", "6", str(OUT / (slug + ".webp")),
        ]
    )


def main():
    tmp = Path("/tmp/br-preview")
    tmp.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    for slug, src in CITIES:
        if not src.is_file():
            raise SystemExit("missing %s" % src)
        print(slug)
        render(slug, src, tmp)


if __name__ == "__main__":
    main()
