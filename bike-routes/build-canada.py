#!/usr/bin/env python3
"""Flat north-up maps of named OSM cycle routes for Canadian cities.

One city at a time. Overpass answers are cached under /tmp/bike-canada.
A city that still fails after retries is skipped. Vancouver's files are
not touched.
"""

import json
import math
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from osgeo import ogr

ROOT = Path(__file__).resolve().parent
CACHE = Path("/tmp/bike-canada")
SQUARE = 1000
PAD = 64
TOL = 0.00012
DELAY = 8
RETRIES = 4
ENDPOINTS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)
UA = "databaseprojects-bike-routes/1.0 (city maps; contact via github.com/databaseprojects)"
CREDIT = "© OpenStreetMap contributors"
INDEX_START = "<!-- br-cities:start -->"
INDEX_END = "<!-- br-cities:end -->"

# admin is the OSM admin_level. names are tried in order. fallback is a
# second boundary used only when it covers more ground than the first.
CITIES = (
    {"slug": "victoria", "name": "Victoria", "province": "bc", "province_name": "British Columbia", "iso": "CA-BC", "admin": "8", "names": ("Victoria",)},
    {"slug": "calgary", "name": "Calgary", "province": "ab", "province_name": "Alberta", "iso": "CA-AB", "admin": "8", "names": ("Calgary",)},
    {"slug": "edmonton", "name": "Edmonton", "province": "ab", "province_name": "Alberta", "iso": "CA-AB", "admin": "8", "names": ("Edmonton",)},
    {"slug": "toronto", "name": "Toronto", "province": "on", "province_name": "Ontario", "iso": "CA-ON", "admin": "8", "names": ("Toronto",)},
    {"slug": "ottawa", "name": "Ottawa", "province": "on", "province_name": "Ontario", "iso": "CA-ON", "admin": "8", "names": ("Ottawa",)},
    {"slug": "hamilton", "name": "Hamilton", "province": "on", "province_name": "Ontario", "iso": "CA-ON", "admin": "8", "names": ("Hamilton",)},
    {"slug": "montreal", "name": "Montréal", "province": "qc", "province_name": "Québec", "iso": "CA-QC", "admin": "8", "names": ("Montréal", "Montreal")},
    {"slug": "quebec-city", "name": "Québec", "province": "qc", "province_name": "Québec", "iso": "CA-QC", "admin": "8", "names": ("Québec", "Quebec", "Ville de Québec")},
    {"slug": "winnipeg", "name": "Winnipeg", "province": "mb", "province_name": "Manitoba", "iso": "CA-MB", "admin": "8", "names": ("Winnipeg",)},
    {"slug": "halifax", "name": "Halifax", "province": "ns", "province_name": "Nova Scotia", "iso": "CA-NS", "admin": "8", "names": ("Halifax",), "fallback_admin": "6", "fallback_names": ("Halifax Regional Municipality", "Halifax")},
)


def hav_km(a, b):
    r = 6371.0
    lon1, lat1 = math.radians(a[0]), math.radians(a[1])
    lon2, lat2 = math.radians(b[0]), math.radians(b[1])
    dlon, dlat = lon2 - lon1, lat2 - lat1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))


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


def xml(text):
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def pt_key(p):
    return (round(p[0], 5), round(p[1], 5))


def chain_ways(ways):
    """Join way pieces that share an endpoint into rings."""
    ends = {}
    usable = []
    for way in ways:
        if len(way) < 2:
            continue
        usable.append(way)
    for i, way in enumerate(usable):
        ends.setdefault(pt_key(way[0]), []).append((i, 0))
        ends.setdefault(pt_key(way[-1]), []).append((i, 1))
    used = set()
    rings = []
    for i, way in enumerate(usable):
        if i in used:
            continue
        used.add(i)
        ring = list(way)
        while True:
            nxt = None
            for j, end in ends.get(pt_key(ring[-1]), []):
                if j not in used:
                    nxt = (j, end)
                    break
            if not nxt:
                break
            j, end = nxt
            used.add(j)
            seg = usable[j]
            if end == 1:
                seg = list(reversed(seg))
            ring.extend(seg[1:])
        while True:
            nxt = None
            for j, end in ends.get(pt_key(ring[0]), []):
                if j not in used:
                    nxt = (j, end)
                    break
            if not nxt:
                break
            j, end = nxt
            used.add(j)
            seg = usable[j]
            if end == 0:
                seg = list(reversed(seg))
            ring = list(seg[:-1]) + ring
        if pt_key(ring[0]) != pt_key(ring[-1]):
            ring.append(ring[0])
        if len(ring) >= 4:
            rings.append(ring)
    return rings


def ring_area(ring):
    area = 0.0
    for i in range(len(ring) - 1):
        area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    return abs(area) * 0.5


def way_coords(member):
    geom = member.get("geometry") or []
    return [(p["lon"], p["lat"]) for p in geom if "lon" in p and "lat" in p]


def polygon_from_relation(rel):
    outers, inners = [], []
    for member in rel.get("members") or []:
        if member.get("type") != "way":
            continue
        coords = way_coords(member)
        if len(coords) < 2:
            continue
        role = (member.get("role") or "outer").lower()
        if role == "inner":
            inners.append(coords)
        else:
            outers.append(coords)
    outer_rings = chain_ways(outers)
    inner_rings = chain_ways(inners)
    if not outer_rings:
        return None
    multi = ogr.Geometry(ogr.wkbMultiPolygon)
    for outer in outer_rings:
        poly = ogr.Geometry(ogr.wkbPolygon)
        ring = ogr.Geometry(ogr.wkbLinearRing)
        for lon, lat in outer:
            ring.AddPoint(lon, lat)
        poly.AddGeometry(ring)
        probe = outer[len(outer) // 2]
        for inner in inner_rings:
            mid = inner[len(inner) // 2]
            hold = ogr.Geometry(ogr.wkbPoint)
            hold.AddPoint(mid[0], mid[1])
            if poly.Contains(hold):
                hole = ogr.Geometry(ogr.wkbLinearRing)
                for lon, lat in inner:
                    hole.AddPoint(lon, lat)
                poly.AddGeometry(hole)
        # probe is unused beyond keeping a stable sample; silence lint via area
        if ring_area(outer) <= 0 and probe:
            continue
        multi.AddGeometry(poly)
    if not multi.IsValid():
        fixed = multi.MakeValid()
        if fixed is not None:
            multi = fixed
    return multi


def overpass(query, cache_path):
    if cache_path.exists() and cache_path.stat().st_size > 40:
        try:
            data = json.loads(cache_path.read_text())
        except json.JSONDecodeError:
            data = None
        if data and "elements" in data:
            print("cache", cache_path.name, flush=True)
            return data
    last = "no attempt"
    for attempt in range(RETRIES):
        endpoint = ENDPOINTS[attempt % len(ENDPOINTS)]
        try:
            body = urllib.parse.urlencode({"data": query}).encode()
            req = urllib.request.Request(endpoint, data=body, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=240) as res:
                raw = res.read()
            data = json.loads(raw.decode("utf-8"))
            if "elements" not in data:
                remark = data.get("remark") or data.get("error") or "no elements"
                raise RuntimeError(remark)
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            cache_path.write_bytes(raw)
            print("fetched", cache_path.name, "bytes", len(raw), flush=True)
            time.sleep(DELAY)
            return data
        except Exception as err:
            last = "%s via %s" % (err, endpoint.split("/")[2])
            wait = 20 * (2 ** attempt)
            print("retry", attempt + 1, cache_path.name, last, "wait", wait, flush=True)
            time.sleep(wait)
    raise RuntimeError(last)


def boundary_query(iso, admin, name):
    escaped = name.replace("\\", "\\\\").replace('"', '\\"')
    return (
        '[out:json][timeout:90];\n'
        'area["ISO3166-2"="%s"]->.prov;\n'
        'rel(area.prov)["boundary"="administrative"]["admin_level"="%s"]["name"="%s"];\n'
        "out geom;\n" % (iso, admin, escaped)
    )


def pick_relation(data, name):
    want = name.casefold()
    best = None
    best_area = -1
    for el in data.get("elements") or []:
        if el.get("type") != "relation":
            continue
        tags = el.get("tags") or {}
        label = (tags.get("name") or "").casefold()
        if label != want and (tags.get("name:en") or "").casefold() != want:
            continue
        poly = polygon_from_relation(el)
        if poly is None or poly.IsEmpty():
            continue
        area = poly.GetArea()
        if area > best_area:
            best, best_area = (el, poly), area
    return best


def load_boundary(city):
    CACHE.mkdir(parents=True, exist_ok=True)
    chosen = None
    for name in city["names"]:
        cache = CACHE / ("%s-boundary-%s.json" % (city["slug"], name.casefold()))
        data = overpass(boundary_query(city["iso"], city["admin"], name), cache)
        found = pick_relation(data, name)
        if found:
            chosen = found
            break
    if city.get("fallback_names"):
        alt = None
        for name in city["fallback_names"]:
            cache = CACHE / ("%s-boundary-fb-%s.json" % (city["slug"], name.casefold()))
            data = overpass(boundary_query(city["iso"], city["fallback_admin"], name), cache)
            found = pick_relation(data, name)
            if found:
                alt = found
                break
        if alt and (chosen is None or alt[1].GetArea() > chosen[1].GetArea() * 1.5):
            chosen = alt
    if not chosen:
        raise RuntimeError("no admin boundary")
    rel, poly = chosen
    print("boundary", city["slug"], rel.get("id"), (rel.get("tags") or {}).get("name"), flush=True)
    return rel["id"], poly


def routes_query(area_clause):
    return (
        "[out:json][timeout:180][maxsize:1073741824];\n"
        "%s\n"
        'rel(area.a)["type"="route"]["route"="bicycle"]["name"];\n'
        "out geom;\n" % area_clause
    )


def load_routes(city, rel_id):
    area_id = 3600000000 + int(rel_id)
    primary = CACHE / ("%s-routes.json" % city["slug"])
    try:
        return overpass(routes_query("area(%d)->.a;" % area_id), primary)
    except RuntimeError as err:
        print("area id failed", city["slug"], err, flush=True)
        alt = 'rel(%d); map_to_area ->.a;' % int(rel_id)
        return overpass(routes_query(alt), CACHE / ("%s-routes-map.json" % city["slug"]))


def is_regional(network):
    parts = [p.strip() for p in (network or "").replace(";", ",").split(",")]
    return any(p in ("icn", "ncn", "rcn") for p in parts)


def skip_route(tags):
    if (tags.get("state") or "").lower() in ("proposed", "construction"):
        return True
    if (tags.get("proposed") or "").lower() == "yes":
        return True
    if (tags.get("lifecycle") or "").lower() == "proposed":
        return True
    name = (tags.get("name") or "").strip()
    return len(name) < 2


def line_geom(coords):
    geom = ogr.Geometry(ogr.wkbLineString)
    for lon, lat in coords:
        geom.AddPoint(lon, lat)
    return geom


def clipped_lines(geom):
    if geom is None or geom.IsEmpty():
        return []
    name = geom.GetGeometryName()
    if name == "LINESTRING":
        pts = [(geom.GetX(i), geom.GetY(i)) for i in range(geom.GetPointCount())]
        return [pts] if len(pts) >= 2 else []
    if name in ("MULTILINESTRING", "GEOMETRYCOLLECTION"):
        out = []
        for i in range(geom.GetGeometryCount()):
            out.extend(clipped_lines(geom.GetGeometryRef(i)))
        return out
    return []


def route_lines(rel, city_poly):
    full = []
    inside = []
    inside_km = 0.0
    for member in rel.get("members") or []:
        if member.get("type") != "way":
            continue
        coords = way_coords(member)
        if len(coords) < 2:
            continue
        full_km = length_km(coords)
        if full_km <= 0:
            continue
        full.append(full_km)
        cut = line_geom(coords).Intersection(city_poly)
        for line in clipped_lines(cut):
            km = length_km(line)
            if km <= 0:
                continue
            inside_km += km
            inside.append(line)
    return sum(full), inside_km, inside


def qualifies(network, total_km, inside_km):
    if inside_km < 2.0:
        return False
    if is_regional(network):
        return total_km >= 10.0
    return inside_km >= total_km * 0.5


def collect(city, city_poly, data):
    merged = {}
    for el in data.get("elements") or []:
        if el.get("type") != "relation":
            continue
        tags = el.get("tags") or {}
        if skip_route(tags):
            continue
        name = tags["name"].strip()
        network = (tags.get("network") or "").strip()
        total_km, inside_km, lines = route_lines(el, city_poly)
        if not qualifies(network, total_km, inside_km):
            continue
        key = name.casefold()
        row = merged.get(key)
        if row is None:
            merged[key] = {
                "name": name,
                "km": inside_km,
                "network": network,
                "osm": [int(el["id"])],
                "lines": lines,
            }
            continue
        row["km"] += inside_km
        row["osm"].append(int(el["id"]))
        row["lines"].extend(lines)
        if is_regional(network) and not is_regional(row["network"]):
            row["network"] = network
        elif not row["network"] and network:
            row["network"] = network
    routes = []
    for row in merged.values():
        drawn = []
        for line in row["lines"]:
            slim = simplify([(round(p[0], 5), round(p[1], 5)) for p in line], TOL)
            if len(slim) >= 2 and length_km(slim) >= 0.02:
                drawn.append(slim)
        if not drawn:
            continue
        routes.append({
            "name": row["name"],
            "km": round(row["km"], 1),
            "network": row["network"],
            "osm": row["osm"][0] if len(row["osm"]) == 1 else sorted(set(row["osm"])),
            "source": "OpenStreetMap",
            "lines": drawn,
        })
    routes.sort(key=lambda route: route["name"].casefold())
    return routes


def project(routes):
    pts = [p for route in routes for line in route["lines"] for p in line]
    mid = sum(p[1] for p in pts) / len(pts)
    cos = math.cos(math.radians(mid))
    xs = [p[0] * cos for p in pts]
    ys = [p[1] for p in pts]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    span = max(maxx - minx, maxy - miny, 1e-9)
    inner = SQUARE - PAD * 2
    extra_x = (inner - (maxx - minx) / span * inner) / 2
    extra_y = (inner - (maxy - miny) / span * inner) / 2

    def xy(lon, lat):
        x = PAD + (lon * cos - minx) / span * inner + extra_x
        y = PAD + (maxy - lat) / span * inner + extra_y
        return x, y

    return xy, [min(p[0] for p in pts), miny, max(p[0] for p in pts), max(p[1] for p in pts)]


def write_svg(path, routes):
    xy, bbox = project(routes)
    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">',
        '<rect width="1000" height="1000" fill="#fff"/>',
        '<g fill="none" stroke="#000" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">',
    ]
    for route in routes:
        for line in route["lines"]:
            pts = " ".join("%.1f,%.1f" % xy(*p) for p in line)
            parts.append('<polyline points="%s"/>' % pts)
    parts.append("</g></svg>")
    path.write_text("\n".join(parts) + "\n")
    return [round(v, 5) for v in bbox]


def write_index_html(cities):
    page = ROOT / "index.html"
    text = page.read_text()
    start = text.find(INDEX_START)
    end = text.find(INDEX_END)
    if start < 0 or end < 0:
        raise SystemExit("index markers missing")
    blocks = ['<section class="br-cities" aria-label="Cities">', '<h2 class="br-cities-title">Cities</h2>']
    by_prov = []
    for city in cities:
        if not by_prov or by_prov[-1]["province"] != city["province"]:
            by_prov.append({"province": city["province"], "name": city["province_name"], "cities": []})
        by_prov[-1]["cities"].append(city)
    for group in by_prov:
        blocks.append('<h3 class="br-prov">%s</h3>' % xml(group["name"]))
        blocks.append('<ul class="br-citylist">')
        for city in group["cities"]:
            blocks.append(
                '<li><a href="city.html#%s">%s</a></li>' % (xml(city["slug"]), xml(city["name"]))
            )
        blocks.append("</ul>")
    blocks.append('<p class="br-credit">%s</p>' % xml(CREDIT))
    blocks.append("</section>")
    body = "\n".join(blocks)
    page.write_text(text[:start] + INDEX_START + "\n" + body + "\n" + text[end:])


def public_route(route):
    item = {
        "name": route["name"],
        "km": route["km"],
        "network": route["network"],
        "osm": route["osm"],
        "source": route["source"],
    }
    return item


def build_city(city):
    rel_id, poly = load_boundary(city)
    data = load_routes(city, rel_id)
    routes = collect(city, poly, data)
    if not routes:
        raise RuntimeError("no qualifying routes")
    bbox = write_svg(ROOT / "prints" / (city["slug"] + ".svg"), routes)
    total = round(sum(route["km"] for route in routes), 1)
    record = {
        "slug": city["slug"],
        "name": city["name"],
        "province": city["province"],
        "attribution": CREDIT,
        "km": total,
        "routes": [public_route(route) for route in routes],
    }
    dest = ROOT / "canada" / city["province"] / (city["slug"] + ".json")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    return {
        "slug": city["slug"],
        "name": city["name"],
        "province": city["province"],
        "province_name": city["province_name"],
        "routes": len(routes),
        "km": total,
        "bbox": bbox,
        "status": "built",
    }


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    built = []
    failed = []
    for city in CITIES:
        print("city", city["slug"], flush=True)
        try:
            row = build_city(city)
        except Exception as err:
            print("fail", city["slug"], err, flush=True)
            failed.append({"slug": city["slug"], "name": city["name"], "status": "failed", "why": str(err)})
            continue
        built.append(row)
        print("built", row["slug"], "routes", row["routes"], "km", row["km"], flush=True)
    index = {"attribution": CREDIT, "cities": built}
    (ROOT / "city-index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n")
    write_index_html(built)
    print("SUMMARY", json.dumps({"built": built, "failed": failed}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
