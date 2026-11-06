#!/usr/bin/env python3
"""Rebuild found-photographs/photo-tags.json from the published Google Sheet.

Stdlib only. Writes the file only when the rebuilt JSON differs. If the
published CSV still matches the current file, re-downloads every 60 seconds
for about 6 minutes, because "publish to web" can lag behind an edit.
"""

import csv
import io
import json
import sys
import time
import urllib.request

CSV_URL = (
    "https://docs.google.com/spreadsheets/d/e/"
    "2PACX-1vQzbbdEfft47eW9qGX4v9mTAIwRETW_Ets3QIC-fKydLOF_u_FUKhFvVgXEfaWT5kNaSwJYWNLrG2pi"
    "/pub?output=csv"
)
HEADER = ["file", "publicId", "tags", "back_file", "back_publicId", "back_text"]
RETRY_SECONDS = 60
MAX_WAIT_SECONDS = 6 * 60


def download_csv():
    request = urllib.request.Request(
        CSV_URL,
        headers={"User-Agent": "found-photographs-sheet-sync"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def fail(message):
    print("sheet sync refused: " + message, file=sys.stderr)
    raise SystemExit(1)


def parse_csv(raw, current_count):
    text = raw.decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(text)))
    if not rows:
        fail("the CSV has no header")
    header = [cell.strip() for cell in rows[0]]
    if header != HEADER:
        fail("header is " + ",".join(header) + ", expected " + ",".join(HEADER))
    data = rows[1:]
    if len(data) == 0:
        fail("the CSV has zero photo rows")
    if current_count and len(data) * 2 < current_count:
        fail(
            "the CSV has %d rows and the current file has %d photos"
            % (len(data), current_count)
        )
    photos = []
    seen = {}
    for index, row in enumerate(data, start=2):
        cells = list(row) + [""] * (len(HEADER) - len(row))
        file_name = cells[0].strip()
        public_id = cells[1].strip()
        if not file_name or not public_id:
            fail("row %d is missing file or publicId" % index)
        if file_name in seen:
            fail("duplicate file %s (rows %d and %d)" % (file_name, seen[file_name], index))
        seen[file_name] = index
        tags = [part.strip() for part in cells[2].split(",") if part.strip()]
        photo = {"file": file_name, "publicId": public_id, "tags": tags}
        back_file = cells[3].strip()
        if back_file:
            photo["back"] = {
                "file": back_file,
                "publicId": cells[4].strip(),
                "text": cells[5],
            }
        photos.append(photo)
    return photos


def serialize(existing, photos):
    out = {}
    for key, value in existing.items():
        out[key] = photos if key == "photos" else value
    if "photos" not in out:
        fail("the current photo-tags.json has no photos array")
    return (json.dumps(out, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def main():
    if len(sys.argv) != 2:
        fail("usage: sheet_to_tags.py found-photographs/photo-tags.json")
    path = sys.argv[1]
    with open(path, "rb") as handle:
        current = handle.read()
    existing = json.loads(current.decode("utf-8"))
    current_count = len(existing.get("photos") or [])
    deadline = time.monotonic() + MAX_WAIT_SECONDS
    while True:
        photos = parse_csv(download_csv(), current_count)
        rebuilt = serialize(existing, photos)
        if rebuilt != current:
            with open(path, "wb") as handle:
                handle.write(rebuilt)
            print("updated %d photos" % len(photos))
            return
        if time.monotonic() >= deadline:
            print("unchanged (%d photos)" % len(photos))
            return
        print("CSV still matches the current file; waiting %ds" % RETRY_SECONDS)
        time.sleep(RETRY_SECONDS)


if __name__ == "__main__":
    main()
