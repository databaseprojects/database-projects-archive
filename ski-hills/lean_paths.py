"""Integer-tenths paths. A scale(.1) transform brings them back to 0.1 px."""
import re

_NUM = re.compile(r"[-+]?(?:\d+\.\d+|\d+)")


def tenth(v):
    """Nearest tenth of a pixel, as an integer. One-decimal strings stay exact."""
    if isinstance(v, str):
        text = v.strip()
    else:
        text = f"{float(v):.1f}"
    sign = 1
    if text[0] == "-":
        sign = -1
        text = text[1:]
    elif text[0] == "+":
        text = text[1:]
    if "." not in text:
        return sign * int(text or "0") * 10
    whole, frac = text.split(".", 1)
    if len(frac) == 1 and frac.isdigit() and (whole.isdigit() or whole == ""):
        return sign * (int(whole or "0") * 10 + int(frac))
    signed = ("-" if sign < 0 else "") + (whole or "0") + "." + frac
    return sign * int(round(float(signed) * 10))


def compact_points(points, close=False):
    """Absolute tenths, then relative steps: M x,y l dx,dy ..."""
    ix = []
    iy = []
    for x, y in points:
        px = tenth(x)
        py = tenth(y)
        if ix and ix[-1] == px and iy[-1] == py:
            continue
        ix.append(px)
        iy.append(py)
    if len(ix) < 2:
        return ""
    parts = [f"M{ix[0]},{iy[0]}"]
    steps = []
    cx, cy = ix[0], iy[0]
    for x, y in zip(ix[1:], iy[1:]):
        steps.append(f"{x - cx},{y - cy}")
        cx, cy = x, y
    if steps:
        parts.append("l" + " ".join(steps))
    if close:
        parts.append("Z")
    return "".join(parts)


def compact_point_list(text):
    """Old 'x,y x,y' contour line, or a path that is already compact."""
    if not text:
        return text
    if text[0] == "M":
        return text
    pts = []
    for pair in text.split():
        if "," not in pair:
            continue
        x, y = pair.split(",", 1)
        pts.append((x, y))
    return compact_points(pts, close=False)


def _abs_subpaths(d):
    subs = []
    for chunk in re.findall(r"M[^M]+", d or ""):
        closed = "Z" in chunk or "z" in chunk
        nums = _NUM.findall(chunk.replace("Z", "").replace("z", ""))
        pts = []
        for i in range(0, len(nums) - 1, 2):
            pts.append((nums[i], nums[i + 1]))
        if len(pts) >= 2:
            subs.append((pts, closed))
    return subs


def compact_abs_d(d):
    """Old absolute M/L/Z path, already at 0.1 px, into integer tenths."""
    if not d:
        return d
    if "." not in d and "l" in d:
        return d
    out = []
    for pts, closed in _abs_subpaths(d):
        piece = compact_points(pts, close=closed)
        if piece:
            out.append(piece)
    return "".join(out)


def decode_compact(d):
    """Inverse of compact_points. Each subpath is (points, closed)."""
    subs = []
    for chunk in re.findall(r"M[^M]+", d or ""):
        closed = "Z" in chunk or "z" in chunk
        body = chunk[1:]
        head = re.match(r"\s*([-+]?\d+)\s*,\s*([-+]?\d+)", body)
        if not head:
            continue
        x = int(head.group(1))
        y = int(head.group(2))
        pts = [(x / 10.0, y / 10.0)]
        rest = body[head.end():]
        rel_at = rest.find("l")
        if rel_at >= 0:
            rel = rest[rel_at + 1:].replace("Z", "").replace("z", "")
            nums = re.findall(r"[-+]?\d+", rel)
            for i in range(0, len(nums) - 1, 2):
                x += int(nums[i])
                y += int(nums[i + 1])
                pts.append((x / 10.0, y / 10.0))
        subs.append((pts, closed))
    return subs
