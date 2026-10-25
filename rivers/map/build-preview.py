#!/usr/bin/env python3
"""Build rivers/map/lines-preview.json from lines-main.json.

For each catalog river, keep only the highest stream-order class
(order == order_max). Side branches inside a connected piece are dropped:
cycles are opened with a maximum spanning tree (longer channels win), then
one path is kept — from the catalog mouth or area centre when that point
lies on the piece, otherwise the longest path. Separate pieces that are
long enough to be their own river in a bundled entry are kept. Each path
is Douglas-Peucker simplified and rounded to 2 decimals.

lines-main.json and lines-full.json are read only and are not rewritten.
"""

import heapq
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / "lines-main.json"
CATALOG = HERE.parent / "rivers.json"
OUT = HERE / "lines-preview.json"

# Degrees. Inside the requested 0.04–0.08 band.
TOLERANCE = 0.05
DECIMALS = 2
# A disjoint piece is kept when it is a real second river, not a spur.
STEM_KEEP = 0.25
STEM_MIN_DEG = 0.08
# Catalog mouth / area centre counts as "on" a piece inside this distance.
ANCHOR_DEG = 0.5


def dist(a, b):
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5


def path_len(pts):
    return sum(dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))


def douglas_peucker(points, tol):
    n = len(points)
    if n < 3:
        return points
    keep = [False] * n
    keep[0] = True
    keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        i, j = stack.pop()
        ax, ay = points[i]
        bx, by = points[j]
        dx = bx - ax
        dy = by - ay
        denom = dx * dx + dy * dy
        best = -1
        best_d = tol
        for k in range(i + 1, j):
            px, py = points[k]
            if denom == 0:
                d = dist((px, py), (ax, ay))
            else:
                t = ((px - ax) * dx + (py - ay) * dy) / denom
                if t < 0:
                    d = dist((px, py), (ax, ay))
                elif t > 1:
                    d = dist((px, py), (bx, by))
                else:
                    d = dist((px, py), (ax + t * dx, ay + t * dy))
            if d > best_d:
                best_d = d
                best = k
        if best >= 0:
            keep[best] = True
            stack.append((i, best))
            stack.append((best, j))
    return [points[k] for k in range(n) if keep[k]]


def round_coord(value):
    value = round(float(value), DECIMALS)
    if value == 0:
        return 0
    return value


def round_line(points):
    out = []
    for lon, lat in points:
        pt = [round_coord(lon), round_coord(lat)]
        if out and out[-1] == pt:
            continue
        out.append(pt)
    if len(out) < 2:
        return []
    return out


def node_key(pt):
    return (pt[0], pt[1])


def maximum_spanning_forest(segments):
    """Undirected max spanning forest. Longer segments are kept first."""
    edges = []
    for seg in segments:
        if len(seg) < 2:
            continue
        a = node_key(seg[0])
        b = node_key(seg[-1])
        if a == b:
            continue
        pts = [node_key(p) for p in seg]
        edges.append((path_len(pts), a, b, pts))
    edges.sort(key=lambda item: item[0], reverse=True)

    parent = {}

    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    tree = {}
    for length, a, b, pts in edges:
        tree.setdefault(a, [])
        tree.setdefault(b, [])
        ra, rb = find(a), find(b)
        if ra == rb:
            continue
        parent[rb] = ra
        tree[a].append((b, pts, length))
        tree[b].append((a, list(reversed(pts)), length))
    return tree


def forest_components(tree):
    seen = set()
    comps = []
    for start in tree:
        if start in seen:
            continue
        stack = [start]
        seen.add(start)
        nodes = []
        while stack:
            node = stack.pop()
            nodes.append(node)
            for nb, _pts, _length in tree[node]:
                if nb not in seen:
                    seen.add(nb)
                    stack.append(nb)
                    nodes.append(nb)
        comps.append(nodes)
    return comps


def farthest(tree, start):
    """Farthest node in a tree. Nodes are not revisited, so cycles cannot loop."""
    dist_at = {start: 0.0}
    parent = {start: None}
    via = {}
    heap = [(0.0, 0, start)]
    seq = 0
    while heap:
        neg, _seq, node = heapq.heappop(heap)
        walked = -neg
        if walked != dist_at[node]:
            continue
        for nb, pts, length in tree[node]:
            if nb in dist_at:
                continue
            dist_at[nb] = walked + length
            parent[nb] = node
            via[nb] = pts
            seq += 1
            heapq.heappush(heap, (-(walked + length), seq, nb))
    far = start
    best = 0.0
    for node, walked in dist_at.items():
        if walked > best:
            best = walked
            far = node
    return far, best, parent, via


def reconstruct(end, parent, via):
    parts = []
    node = end
    while parent[node] is not None:
        parts.append(via[node])
        node = parent[node]
    parts.reverse()
    if not parts:
        return []
    out = list(parts[0])
    for pts in parts[1:]:
        out.extend(pts[1:])
    return out


def nearest(nodes, anchor, limit):
    best = None
    best_d = limit
    for node in nodes:
        d = dist(node, anchor)
        if d <= best_d:
            best_d = d
            best = node
    return best


def component_stem(tree, nodes, anchor):
    start = nearest(nodes, anchor, ANCHOR_DEG) if anchor is not None else None
    if start is None:
        start, _length, _parent, _via = farthest(tree, nodes[0])
    end, length, parent, via = farthest(tree, start)
    return reconstruct(end, parent, via), length


def preview_lines(entry, anchor):
    order_max = entry.get("order_max")
    chosen = []
    for line, order in zip(entry.get("lines") or [], entry.get("orders") or []):
        if order == order_max and line and len(line) >= 2:
            chosen.append(line)
    if not chosen or order_max is None:
        return []
    tree = maximum_spanning_forest(chosen)
    stems = []
    for nodes in forest_components(tree):
        if len(nodes) < 2:
            continue
        pts, length = component_stem(tree, nodes, anchor)
        if len(pts) >= 2 and length > 0:
            stems.append((length, pts))
    if not stems:
        return []
    stems.sort(key=lambda item: item[0], reverse=True)
    longest = stems[0][0]
    floor = max(STEM_MIN_DEG, STEM_KEEP * longest)
    kept = []
    for length, pts in stems:
        if length + 1e-12 < floor and kept:
            continue
        simple = douglas_peucker(pts, TOLERANCE)
        rounded = round_line(simple)
        if rounded:
            kept.append(rounded)
    return kept


def main():
    source = json.loads(SRC.read_text(encoding="utf-8"))
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    anchors = {}
    for river in catalog.get("rivers") or []:
        point = river.get("map") or {}
        lon = point.get("lon")
        lat = point.get("lat")
        if isinstance(lon, (int, float)) and isinstance(lat, (int, float)):
            anchors[river.get("slug")] = (lon, lat)

    rivers_out = {}
    point_count = 0
    line_count = 0
    multi = 0
    empty = []
    for slug, entry in (source.get("rivers") or {}).items():
        lines = preview_lines(entry, anchors.get(slug))
        order_max = entry.get("order_max")
        rivers_out[slug] = {
            "order_min": order_max,
            "order_max": order_max,
            "lines": lines,
            "orders": [order_max] * len(lines),
        }
        if not lines:
            empty.append(slug)
        if len(lines) > 1:
            multi += 1
        line_count += len(lines)
        for line in lines:
            point_count += len(line)

    payload = {
        "version": source.get("version", 1),
        "tier": "preview",
        "may_change": list(source.get("may_change") or []),
        "rivers": rivers_out,
    }
    text = json.dumps(payload, separators=(",", ":"), ensure_ascii=True)
    OUT.write_text(text + "\n", encoding="utf-8")
    size = OUT.stat().st_size
    print("bytes", size)
    print("rivers", len(rivers_out))
    print("lines", line_count)
    print("points", point_count)
    print("multi_stem", multi)
    print("empty", len(empty))
    if empty:
        print("empty_slugs", ",".join(empty))
    print("tolerance", TOLERANCE)
    print("may_change", ",".join(payload["may_change"]))


if __name__ == "__main__":
    main()
