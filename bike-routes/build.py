#!/usr/bin/env python3
"""Group Vancouver bikeways into routes.json and one print SVG each.

Reads the City of Vancouver Bikeways GeoJSON and local-area-boundary
GeoJSON (Open Government Licence – Vancouver). Active segments only.
"""

import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = Path("/tmp/bike/bikeways.geojson")
AREAS = Path("/tmp/bike/areas.geojson")
DRAW = 880
SQUARE = 1000
TOL = 0.00012  # about 13 m; cards stay readable and the JSON stays slim

TYPES = (
    "Protected Bike Lanes",
    "Painted Lanes",
    "Shared Lanes",
    "Local Street",
)


def hav_km(a, b):
    r = 6371.0
    lon1, lat1 = math.radians(a[0]), math.radians(a[1])
    lon2, lat2 = math.radians(b[0]), math.radians(b[1])
    dlon, dlat = lon2 - lon1, lat2 - lat1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def length_km(pts):
    return sum(hav_km(pts[i], pts[i + 1]) for i in range(len(pts) - 1))


def perp(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    if dx == 0 and dy == 0:
        return math.hypot(p[0] - a[0], p[1] - a[1])
    t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)
    t = 0 if t < 0 else 1 if t > 1 else t
    return math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))


def simplify(pts, tol):
    if len(pts) < 3:
        return pts

    def rec(start, end):
        a, b = pts[start], pts[end]
        idx, best = None, 0
        for i in range(start + 1, end):
            d = perp(pts[i], a, b)
            if d > best:
                best, idx = d, i
        if idx is not None and best > tol:
            return rec(start, idx)[:-1] + rec(idx, end)
        return [a, b]

    out = rec(0, len(pts) - 1)
    cleaned = [out[0]]
    for p in out[1:]:
        if p != cleaned[-1]:
            cleaned.append(p)
    return cleaned


def slugify(name):
    text = name.lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or "route"


def ring_of(geom):
    if geom["type"] == "Polygon":
        return geom["coordinates"][0]
    if geom["type"] == "MultiPolygon":
        return max(geom["coordinates"], key=lambda rings: len(rings[0]))[0]
    return []


def pip(lon, lat, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-15) + xi):
            inside = not inside
        j = i
    return inside


def load_areas():
    data = json.loads(AREAS.read_text())
    areas = []
    for feat in data["features"]:
        ring = ring_of(feat["geometry"])
        if len(ring) < 4:
            continue
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        areas.append({
            "name": feat["properties"]["name"],
            "ring": ring,
            "box": (min(xs), min(ys), max(xs), max(ys)),
        })
    return areas


def area_at(lon, lat, areas):
    for area in areas:
        w, s, e, n = area["box"]
        if lon < w or lon > e or lat < s or lat > n:
            continue
        if pip(lon, lat, area["ring"]):
            return area["name"]
    return None


def xml(text):
    return (text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def fit_line(text, size, width):
    # Courier is about 0.6em wide.
    while size > 11 and len(text) * size * 0.62 > width:
        size -= 1
    return size


def project(lines, pad=36):
    pts = [p for line in lines for p in line["c"]]
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    span = max(maxx - minx, maxy - miny) or 1e-6
    inner = DRAW - pad * 2

    def xy(lon, lat):
        x = pad + (lon - minx) / span * inner + (inner - (maxx - minx) / span * inner) / 2
        y = pad + (maxy - lat) / span * inner + (inner - (maxy - miny) / span * inner) / 2
        return x, y

    return xy


WIDTH = {
    "Protected Bike Lanes": 3.1,
    "Painted Lanes": 2.3,
    "Shared Lanes": 1.7,
    "Local Street": 1.5,
}
COLOR = {
    "Protected Bike Lanes": "#1b7a32",
    "Painted Lanes": "#1a4f9c",
    "Shared Lanes": "#5c5c5c",
    "Local Street": "#111111",
}


def project_city(routes, pad=64):
    """Fit every route in one square. Longitude is scaled so the city is not stretched."""
    pts = [p for route in routes for line in route["lines"] for p in line["c"]]
    mid = sum(p[1] for p in pts) / len(pts)
    cos = math.cos(math.radians(mid))
    xs = [p[0] * cos for p in pts]
    ys = [p[1] for p in pts]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    span = max(maxx - minx, maxy - miny) or 1e-6
    inner = SQUARE - pad * 2
    extra_x = (inner - (maxx - minx) / span * inner) / 2
    extra_y = (inner - (maxy - miny) / span * inner) / 2

    def xy(lon, lat):
        x = pad + (lon * cos - minx) / span * inner + extra_x
        y = pad + (maxy - lat) / span * inner + extra_y
        return x, y

    return xy


def road_layer(lines, xy):
    """Light road underlay. It sits under the bike routes and ignores the pointer."""
    parts = [
        '<g fill="none" stroke="#e6e6e6" stroke-width="0.7" stroke-linejoin="round" stroke-linecap="round" pointer-events="none">',
    ]
    for line in lines:
        pts = " ".join("%.1f,%.1f" % xy(*p) for p in line)
        parts.append('<polyline points="%s"/>' % pts)
    parts.append("</g>")
    return parts


def write_city(routes, path, roads=None):
    xy = project_city(routes)
    rank = {name: i for i, name in enumerate(TYPES)}
    ordered = sorted(routes, key=lambda route: (max(rank.get(line["t"], 0) for line in route["lines"]), route["name"].lower()))
    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">',
        '<rect width="1000" height="1000" fill="#fff"/>',
    ]
    if roads:
        parts.extend(road_layer(roads, xy))
    parts.append('<g fill="none" stroke-linejoin="round" stroke-linecap="round">')
    for route in ordered:
        parts.append('<g class="br-route" data-name="%s">' % xml(route["name"]))
        for line in route["lines"]:
            pts = " ".join("%.1f,%.1f" % xy(*p) for p in line["c"])
            width = WIDTH.get(line["t"], 1.6)
            color = COLOR.get(line["t"], "#111111")
            parts.append('<polyline stroke="%s" stroke-width="%s" points="%s"/>' % (color, width, pts))
        parts.append("</g>")
    parts.append("</g></svg>")
    path.write_text("\n".join(parts) + "\n")


def write_svg(path, route):
    xy = project(route["lines"])
    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">',
        '<rect width="1000" height="1000" fill="#fff"/>',
        '<g fill="none" stroke-linejoin="round" stroke-linecap="round">',
    ]
    for line in route["lines"]:
        pts = " ".join("%.1f,%.1f" % xy(*p) for p in line["c"])
        width = WIDTH.get(line["t"], 1.6)
        color = COLOR.get(line["t"], "#111111")
        parts.append('<polyline stroke="%s" stroke-width="%s" points="%s"/>' % (color, width, pts))
    second = route["type"] + "  ·  " + ("%.1f km" % route["km"])
    if route["areas"]:
        second += "  ·  " + ", ".join(route["areas"][:4])
    name_size = fit_line(route["name"], 28, 920)
    sub_size = fit_line(second, 16, 920)
    parts.append("</g>")
    parts.append('<line x1="0" y1="880" x2="1000" y2="880" stroke="#111" stroke-width="1"/>')
    parts.append(
        '<text x="36" y="932" fill="#111" font-family="Courier New, Courier, monospace" '
        'font-size="%d" letter-spacing="0.5">%s</text>' % (name_size, xml(route["name"]))
    )
    parts.append(
        '<text x="36" y="972" fill="#111" font-family="Courier New, Courier, monospace" '
        'font-size="%d" letter-spacing="0.4">%s</text>' % (sub_size, xml(second))
    )
    parts.append("</svg>")
    path.write_text("\n".join(parts) + "\n")


def mask(areas):
    def close(ring):
        if ring[0] != ring[-1]:
            ring = ring + [ring[0]]
        return [[round(p[0], 5), round(p[1], 5)] for p in simplify(ring, 0.0004)]

    holes = []
    for area in areas:
        ring = close(area["ring"])
        if len(ring) >= 4:
            holes.append(ring)
    xs = [p[0] for area in areas for p in area["ring"]]
    ys = [p[1] for area in areas for p in area["ring"]]
    pad_x, pad_y = 0.18, 0.12
    w, e = min(xs) - pad_x, max(xs) + pad_x
    s, n = min(ys) - pad_y, max(ys) + pad_y
    outer = [[w, s], [e, s], [e, n], [w, n], [w, s]]
    return {"outer": [[round(p[0], 5), round(p[1], 5)] for p in outer], "holes": holes}


def main():
    areas = load_areas()
    data = json.loads(SRC.read_text())
    groups = {}
    for feat in data["features"]:
        props = feat["properties"]
        if (props.get("status") or "").lower() != "active":
            continue
        name = (props.get("bike_route_name") or "").strip()
        if not name:
            continue
        pts = feat["geometry"]["coordinates"]
        if not pts or len(pts) < 2:
            continue
        kind = props.get("bikeway_type") or "Local Street"
        bucket = groups.setdefault(name, {"lines": [], "km": {}, "streets": set(), "areas": {}})
        km = length_km(pts)
        bucket["km"][kind] = bucket["km"].get(kind, 0) + km
        street = (props.get("street_name") or "").strip()
        if street:
            bucket["streets"].add(street)
        samples = [pts[0], pts[len(pts) // 2], pts[-1]]
        for lon, lat in samples:
            hit = area_at(lon, lat, areas)
            if hit:
                bucket["areas"][hit] = bucket["areas"].get(hit, 0) + 1
        slim = simplify([[round(p[0], 5), round(p[1], 5)] for p in pts], TOL)
        if len(slim) >= 2:
            bucket["lines"].append({"t": kind, "c": slim})

    routes = []
    for name in groups:
        bucket = groups[name]
        if not bucket["lines"]:
            continue
        total = sum(bucket["km"].values())
        main = max(bucket["km"], key=lambda k: (bucket["km"][k], k))
        types = [t for t in TYPES if t in bucket["km"]]
        for extra in bucket["km"]:
            if extra not in types:
                types.append(extra)
        area_names = [n for n, _ in sorted(bucket["areas"].items(), key=lambda item: (-item[1], item[0]))]
        pts = [p for line in bucket["lines"] for p in line["c"]]
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        routes.append({
            "id": slugify(name),
            "name": name,
            "km": round(total, 1),
            "type": main,
            "types": types,
            "areas": area_names,
            "streets": sorted(bucket["streets"], key=str.lower),
            "bbox": [round(min(xs), 5), round(min(ys), 5), round(max(xs), 5), round(max(ys), 5)],
            "lines": bucket["lines"],
        })
    # The longer route keeps the plain slug when two names fold together.
    routes.sort(key=lambda route: (-route["km"], route["name"].lower()))
    seen = {}
    for route in routes:
        base = route["id"]
        if base not in seen:
            seen[base] = 1
        else:
            seen[base] += 1
            route["id"] = base + "-" + str(seen[base])
    routes.sort(key=lambda route: route["name"].lower())

    out = {
        "attribution": "Contains information licensed under the Open Government Licence – Vancouver",
        "source": "City of Vancouver Open Data, Bikeways",
        "routes": routes,
    }
    (ROOT / "routes.json").write_text(json.dumps(out, separators=(",", ":")))
    prints = ROOT / "prints"
    prints.mkdir(exist_ok=True)
    for old in prints.glob("*.svg"):
        old.unlink()
    for route in routes:
        write_svg(prints / (route["id"] + ".svg"), route)
    write_city(routes, ROOT / "city.svg")
    (ROOT / "boundary.json").write_text(json.dumps(mask(areas), separators=(",", ":")))
    print("routes", len(routes), "json", (ROOT / "routes.json").stat().st_size)


if __name__ == "__main__":
    main()
