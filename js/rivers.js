/* Rivers. Reads rivers/rivers.json and draws the row, captions, and zoom. */
(function (root) {
  "use strict";

  function groupNum(n) {
    if (n == null || n === "") return "";
    var s = String(n);
    var bits = s.split(".");
    bits[0] = bits[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return bits.join(".");
  }

  function coordText(lat, lon) {
    var ns = lat >= 0 ? "N" : "S";
    var ew = lon >= 0 ? "E" : "W";
    return Math.abs(lat).toFixed(3) + "° " + ns + ", " + Math.abs(lon).toFixed(3) + "° " + ew;
  }

  function flowField(flow, label) {
    if (!flow) return null;
    var lines = [];
    if (flow.meanM3s != null && flow.meanM3s !== "") lines.push(groupNum(flow.meanM3s) + " m\u00b3/s");
    if (flow.km3PerYear != null && flow.km3PerYear !== "") lines.push(groupNum(flow.km3PerYear) + " km\u00b3/yr");
    var station = flow.station || "";
    var stationId = flow.stationId || "";
    var years = flow.years || "";
    var modelled = flow.modelled === true;
    if (!lines.length && !station && !stationId && !years && !modelled) return null;
    return {
      label: label || "Flow",
      lines: lines,
      station: station,
      stationId: stationId,
      years: years,
      url: modelled ? "" : (flow.url || ""),
      modelled: modelled
    };
  }

  function fieldsFor(manifest, river) {
    var facts = river.facts || {};
    var fields = [];
    if (river.name) fields.push({ label: "Name", text: river.name });
    var regionText = regionLine(river);
    if (regionText) fields.push({ label: "Region", text: regionText });
    if (facts.stream_segments != null && facts.stream_segments !== "") {
      fields.push({ label: "Segments", text: groupNum(facts.stream_segments) });
    }
    if (facts.highest_stream_order != null && facts.highest_stream_order !== "") {
      fields.push({ label: "Order", text: groupNum(facts.highest_stream_order) });
    }
    if (facts.total_stream_length_km != null && facts.total_stream_length_km !== "") {
      fields.push({ label: "Length", text: groupNum(facts.total_stream_length_km) + " km" });
    }
    if (facts.main_stem_length_km != null && facts.main_stem_length_km !== "") {
      fields.push({ label: "Main stem", text: groupNum(facts.main_stem_length_km) + " km" });
    }
    if (facts.river_surface_area_km2 != null && facts.river_surface_area_km2 !== "") {
      fields.push({ label: "Area", text: groupNum(facts.river_surface_area_km2) + " km\u00b2" });
    }
    if (typeof facts.mouth_lat === "number" && typeof facts.mouth_lon === "number") {
      fields.push({
        label: facts.mouth_label || "Mouth",
        text: coordText(facts.mouth_lat, facts.mouth_lon)
      });
    }
    if (river.flow) {
      var one = flowField(river.flow, "Flow");
      if (one) fields.push(one);
    } else if (river.flow_gauges && river.flow_gauges.length) {
      river.flow_gauges.forEach(function (gauge) {
        var field = flowField(gauge, gauge.river || "Flow");
        if (field) fields.push(field);
      });
    }
    return fields;
  }

  function isAllRegion(region) {
    return !region || String(region).toLowerCase() === "all";
  }

  function regionLine(river) {
    var names = [];
    var seen = {};
    ((river && river.regions) || []).forEach(function (name) {
      if (name == null) return;
      var text = String(name).trim();
      if (!text || isAllRegion(text) || seen[text]) return;
      seen[text] = true;
      names.push(text);
    });
    return names.join(", ");
  }

  function regionNames(manifest) {
    var names = ((manifest && manifest.regions) || []).slice();
    var hasAll = names.some(function (name) { return isAllRegion(name); });
    return hasAll ? names : ["All"].concat(names);
  }

  function regionMatch(river, region) {
    if (isAllRegion(region)) return true;
    return (river.regions || []).indexOf(region) !== -1;
  }

  function fold(text) {
    return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function searchHay(river) {
    var parts = [river && river.name || ""];
    ((river && river.regions) || []).forEach(function (name) {
      parts.push(name);
    });
    return fold(parts.join(" "));
  }

  function searchMatch(river, query) {
    var words = fold(query).split(/\s+/).filter(function (word) { return word; });
    if (!words.length) return true;
    var hay = searchHay(river);
    for (var i = 0; i < words.length; i++) {
      if (hay.indexOf(words[i]) === -1) return false;
    }
    return true;
  }

  function addLine(lines, seen, line) {
    if (!line || seen[line]) return;
    seen[line] = true;
    lines.push(line);
  }

  function attributionLines(manifest) {
    var lines = [];
    var seen = {};
    if (manifest && manifest.attribution) seen[manifest.attribution] = true;
    (manifest && manifest.attribution_additions || []).forEach(function (line) {
      addLine(lines, seen, line);
    });
    ((manifest && manifest.rivers) || []).forEach(function (river) {
      (river.credits || []).forEach(function (line) {
        addLine(lines, seen, line);
      });
    });
    return lines;
  }

  function contourCredits(manifest) {
    var lines = [];
    var seen = {};
    var rivers = (manifest && manifest.rivers) || [];
    var needSite = rivers.some(function (river) {
      return !(river.contours && river.contours.credit);
    });
    if (needSite) addLine(lines, seen, manifest && manifest.contour_credit);
    rivers.forEach(function (river) {
      addLine(lines, seen, river.contours && river.contours.credit);
    });
    rivers.forEach(function (river) {
      addLine(lines, seen, river.contours && river.contours.extra_credit);
    });
    return lines;
  }

  function zoomAt(view, px, py, next, minS, maxS) {
    var s = next;
    if (s < minS) s = minS;
    if (s > maxS) s = maxS;
    var ix = (px - view.x) / view.s;
    var iy = (py - view.y) / view.s;
    return { s: s, x: px - ix * s, y: py - iy * s };
  }

  function boxesOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  var LABEL_ALL_ZOOM = 8;
  var RIVER_BLUE = "#1f4e9c";
  var FULL_ZOOM = 6;
  var FULL_KEEP = 5;

  // Weight follows each river's own order span. Orders are not comparable
  // across rivers. Low zoom is about 0.8 px at order_min and 2.5 px at order_max.
  function lineWeight(order, orderMin, orderMax, zoom, selected) {
    var span = orderMax - orderMin;
    var t = span <= 0 ? 1 : (order - orderMin) / span;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    var base = 0.8 + t * 1.7;
    var z = typeof zoom === "number" ? zoom : 2;
    var scale = 1 + Math.max(0, z - 2) * 0.08;
    if (scale > 1.7) scale = 1.7;
    var weight = base * scale;
    if (selected) weight *= 1.65;
    return Math.round(weight * 100) / 100;
  }

  function latLngsFromLine(line) {
    var out = new Array(line.length);
    var i, pt;
    for (i = 0; i < line.length; i++) {
      pt = line[i];
      out[i] = [pt[1], pt[0]];
    }
    return out;
  }

  function pickFullSlugs(ranked, limit) {
    var list = ranked.slice().sort(function (a, b) {
      if (!!a.selected !== !!b.selected) return a.selected ? -1 : 1;
      return a.d - b.d;
    });
    var cap = limit == null ? FULL_KEEP : limit;
    var out = [];
    var i;
    for (i = 0; i < list.length && out.length < cap; i++) out.push(list[i].slug);
    return out;
  }

  function labelsShown(boxes, zoom) {
    var showAll = zoom >= LABEL_ALL_ZOOM;
    var taken = [];
    var shown = [];
    var i, j, box, clear;
    for (i = 0; i < boxes.length; i++) {
      box = boxes[i];
      clear = true;
      if (!showAll && !box.force) {
        for (j = 0; j < taken.length; j++) {
          if (boxesOverlap(box, taken[j])) {
            clear = false;
            break;
          }
        }
      }
      shown.push(!!(box.force || showAll || clear));
      if (shown[i] && !box.force) taken.push(box);
    }
    return shown;
  }

  var MAX_NATIVE = 2;
  var api = {
    groupNum: groupNum,
    coordText: coordText,
    fieldsFor: fieldsFor,
    regionMatch: regionMatch,
    searchMatch: searchMatch,
    regionNames: regionNames,
    attributionLines: attributionLines,
    contourCredits: contourCredits,
    zoomAt: zoomAt,
    labelsShown: labelsShown,
    labelAllZoom: LABEL_ALL_ZOOM,
    lineWeight: lineWeight,
    latLngsFromLine: latLngsFromLine,
    pickFullSlugs: pickFullSlugs,
    fullZoom: FULL_ZOOM,
    fullKeep: FULL_KEEP,
    riverBlue: RIVER_BLUE,
    maxNative: MAX_NATIVE
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document === "undefined") return;

  var ASSET_V = "20261025n";

  function assetSrc(path) {
    if (typeof path === "string" && path.indexOf("https://") === 0) return path;
    return path + "?v=" + ASSET_V;
  }
  var contourReady = {};
  var contourPending = {};
  var row = document.getElementById("rv-row");
  var notesEl = document.getElementById("rv-notes");
  var creditEl = document.getElementById("rv-credit");
  var titleEl = document.getElementById("rv-title");
  var regionsEl = document.getElementById("rv-regions");
  var findEl = document.getElementById("rv-find");
  var clearEl = document.getElementById("rv-find-clear");
  var emptyEl = document.getElementById("rv-empty");
  var gridBtn = document.getElementById("rv-view-grid");
  var mapBtn = document.getElementById("rv-view-map");
  var mapWrap = document.getElementById("rv-map-wrap");
  var mapEl = document.getElementById("rv-map");
  var manifestNow = null;
  var riverBySlug = Object.create(null);
  var regionFilter = "All";
  var searchQuery = "";
  var viewMode = "grid";
  var lb = null;
  var lbTimer = null;
  var map = null;
  var markerEntries = [];
  var fittedKey = "";
  var mapLibrePromise = null;
  var positronStyle = null;
  var previewPack = null;
  var previewPromise = null;
  var previewKey = "";
  var boundsBySlug = null;
  var boundsPromise = null;
  var fitToken = 0;
  var PREVIEW_INK = "#8aa4b8";

  function el(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function captionEl(manifest, river) {
    var cap = el("div", "rv-caption");
    fieldsFor(manifest, river).forEach(function (field) {
      var cell = el("div", "rv-field");
      var label = el("div", "rv-label");
      label.textContent = field.label;
      var value = el("div", "rv-value");
      if (field.lines) {
        field.lines.forEach(function (line) {
          var rowLine = el("div");
          rowLine.textContent = line;
          value.appendChild(rowLine);
        });
        if (field.station) {
          var station = el("div", "rv-gauge");
          station.textContent = field.station;
          value.appendChild(station);
        }
        if (field.stationId || field.years || field.modelled) {
          var meta = el("div", "rv-gauge");
          var marked = false;
          if (field.stationId) {
            meta.appendChild(document.createTextNode(field.stationId));
            marked = true;
          } else if (field.modelled) {
            meta.appendChild(document.createTextNode("modelled"));
            marked = true;
          }
          if (field.years) {
            meta.appendChild(document.createTextNode((marked ? " \u00b7 " : "") + field.years));
          }
          value.appendChild(meta);
        }
      } else {
        value.textContent = field.text;
      }
      cell.appendChild(label);
      cell.appendChild(value);
      cap.appendChild(cell);
    });
    return cap;
  }

  function closeLb() {
    if (!lb || lb._closing) return;
    lb._closing = true;
    lb.classList.remove("rv-on");
    lb.classList.add("rv-closing");
    var node = lb;
    lb = null;
    clearTimeout(lbTimer);
    lbTimer = setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
      if (!document.querySelector(".rv-lb")) document.documentElement.classList.remove("rv-open");
    }, 340);
  }

  function openLb(manifest, river) {
    if (lb && lb._slug === river.slug && !lb._closing) return;
    if (lb && lb.parentNode) {
      lb.parentNode.removeChild(lb);
      lb = null;
    }
    clearTimeout(lbTimer);
    var W = river.largeWidth || river.width;
    var H = river.largeHeight || river.height;
    var view = { s: 1, x: 0, y: 0 };
    var minS = 1;
    var maxS = MAX_NATIVE;
    var midW = river.midWidth || 0;
    var showing = "mid";
    var drag = null;
    var pointers = new Map();

    var box = el("div", "rv-lb");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", river.name || "River");
    box._slug = river.slug;
    var stage = el("div", "rv-stage");
    var img = document.createElement("img");
    img.alt = river.name || "";
    img.draggable = false;
    img.width = W;
    img.height = H;
    img.style.width = W + "px";
    img.style.height = H + "px";
    img.src = assetSrc(river.mid);
    var overlay = document.createElement("img");
    overlay.className = "rv-contour";
    overlay.alt = "";
    overlay.setAttribute("aria-hidden", "true");
    overlay.draggable = false;
    overlay.hidden = true;
    overlay.width = W;
    overlay.height = H;
    overlay.style.width = W + "px";
    overlay.style.height = H + "px";
    stage.appendChild(img);
    stage.appendChild(overlay);
    var hasContours = !!(river.contours && river.contours.file);
    var capWrap = el("div", "rv-lb-cap");
    capWrap.appendChild(captionEl(manifest, river));
    box.appendChild(stage);
    box.appendChild(capWrap);
    document.body.appendChild(box);
    document.documentElement.classList.add("rv-open");
    lb = box;

    var large = new Image();
    large.src = assetSrc(river.large);

    function fit() {
      var sw = stage.clientWidth;
      var sh = stage.clientHeight;
      if (!(sw > 0) || !(sh > 0) || !(W > 0) || !(H > 0)) return false;
      minS = Math.min(sw / W, sh / H);
      maxS = Math.max(minS, MAX_NATIVE);
      view.s = minS;
      view.x = (sw - W * view.s) / 2;
      view.y = (sh - H * view.s) / 2;
      apply();
      return true;
    }

    function apply() {
      var transform = "translate(" + view.x.toFixed(2) + "px, " + view.y.toFixed(2) + "px) scale(" + view.s + ")";
      img.style.transform = transform;
      overlay.style.transform = transform;
    }

    function contourPromise(item) {
      var slug = item.slug;
      if (contourReady[slug]) return Promise.resolve(contourReady[slug]);
      if (contourPending[slug]) return contourPending[slug];
      contourPending[slug] = fetch(assetSrc(item.contours.file)).then(function (res) {
        if (!res.ok) throw new Error("contours");
        return res.arrayBuffer();
      }).then(function (buf) {
        var url = URL.createObjectURL(new Blob([buf], { type: "image/svg+xml" }));
        contourReady[slug] = url;
        return url;
      }).catch(function (err) {
        delete contourPending[slug];
        throw err;
      });
      return contourPending[slug];
    }

    function showOverlay(url) {
      if (overlay.getAttribute("src") !== url) overlay.src = url;
      overlay.hidden = false;
      apply();
    }

    function syncContours() {
      if (!hasContours) {
        overlay.hidden = true;
        return;
      }
      if (contourReady[river.slug]) {
        showOverlay(contourReady[river.slug]);
        return;
      }
      contourPromise(river).then(function (url) {
        if (lb !== box || box._closing) return;
        showOverlay(url);
      }).catch(function () {
        if (lb === box) overlay.hidden = true;
      });
    }

    function needsLarge() {
      if (!(midW > 0)) return false;
      return W * view.s > midW * 1.02;
    }

    function swap() {
      var want = needsLarge() ? "large" : "mid";
      if (want === showing) return;
      showing = want;
      img.src = assetSrc(want === "large" ? river.large : river.mid);
    }

    function clampPan() {
      var sw = stage.clientWidth;
      var sh = stage.clientHeight;
      var iw = W * view.s;
      var ih = H * view.s;
      var margin = 48;
      if (iw <= sw) view.x = (sw - iw) / 2;
      else view.x = Math.min(margin, Math.max(sw - iw - margin, view.x));
      if (ih <= sh) view.y = (sh - ih) / 2;
      else view.y = Math.min(margin, Math.max(sh - ih - margin, view.y));
    }

    img.addEventListener("load", function () {
      if (showing === "mid") {
        var natural = img.naturalWidth || 0;
        if (natural) midW = natural;
      }
      if (!box._fitted && fit()) box._fitted = true;
      swap();
    });

    function pointOf(e) {
      var rect = stage.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function overImage(px, py) {
      var ix = (px - view.x) / view.s;
      var iy = (py - view.y) / view.s;
      return ix >= 0 && iy >= 0 && ix <= W && iy <= H;
    }

    stage.addEventListener("wheel", function (e) {
      e.preventDefault();
      var dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      else if (e.deltaMode === 2) dy *= stage.clientHeight;
      var p = pointOf(e);
      view = zoomAt(view, p.x, p.y, view.s * Math.exp(-dy * 0.0018), minS, maxS);
      clampPan();
      apply();
      swap();
    }, { passive: false });

    function pinchInfo() {
      var pts = Array.from(pointers.values());
      if (pts.length < 2) return null;
      var dx = pts[1].x - pts[0].x;
      var dy = pts[1].y - pts[0].y;
      return {
        dist: Math.hypot(dx, dy) || 1,
        x: (pts[0].x + pts[1].x) / 2,
        y: (pts[0].y + pts[1].y) / 2
      };
    }

    function beginPinch() {
      var info = pinchInfo();
      if (!info) {
        box._pinch = null;
        return;
      }
      box._pinch = {
        dist: info.dist,
        s: view.s,
        ix: (info.x - view.x) / view.s,
        iy: (info.y - view.y) / view.s
      };
    }

    stage.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button !== 0) return;
      stage.setPointerCapture(e.pointerId);
      var p = pointOf(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) {
        drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, over: overImage(p.x, p.y) };
      } else if (pointers.size >= 2) {
        drag = null;
        beginPinch();
      }
    });

    stage.addEventListener("pointermove", function (e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, pointOf(e));
      if (pointers.size >= 2 && box._pinch) {
        var info = pinchInfo();
        if (!info || !box._pinch.dist) return;
        var next = box._pinch.s * (info.dist / box._pinch.dist);
        if (next < minS) next = minS;
        if (next > maxS) next = maxS;
        view.s = next;
        view.x = info.x - box._pinch.ix * view.s;
        view.y = info.y - box._pinch.iy * view.s;
        clampPan();
        apply();
        swap();
        box.classList.add("rv-drag");
        return;
      }
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) drag.moved = true;
      if (!drag.moved) return;
      view.x += e.clientX - drag.x;
      view.y += e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      clampPan();
      apply();
      box.classList.add("rv-drag");
    });

    function endPointer(e) {
      var was = drag;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) box._pinch = null;
      if (pointers.size === 0) {
        drag = null;
        box.classList.remove("rv-drag");
        if (was && !was.moved && !was.over) closeLb();
      }
    }
    stage.addEventListener("pointerup", endPointer);
    stage.addEventListener("pointercancel", endPointer);

    box.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest(".rv-lb-cap, .rv-stage")) return;
      closeLb();
    });
    syncContours();

    requestAnimationFrame(function () {
      if (lb !== box || box._closing) return;
      if (!box._fitted && fit()) box._fitted = true;
      box.classList.add("rv-on");
    });
  }

  function cardEl(manifest, river) {
    var card = el("article", "rv-card");
    card.id = river.slug;
    var btn = el("button", "rv-open");
    btn.type = "button";
    btn.setAttribute("aria-label", "Open " + (river.name || "river"));
    var img = document.createElement("img");
    img.alt = river.name || "";
    img.src = assetSrc(river.thumb);
    img.loading = "lazy";
    img.decoding = "async";
    if (river.thumbWidth) img.width = river.thumbWidth;
    if (river.thumbHeight) img.height = river.thumbHeight;
    btn.appendChild(img);
    btn.addEventListener("click", function () {
      openLb(manifest, river);
    });
    card._river = river;
    card.appendChild(btn);
    return card;
  }

  function riverShown(river) {
    return regionMatch(river, regionFilter) && searchMatch(river, searchQuery);
  }

  function visibleRivers() {
    if (!manifestNow) return [];
    return (manifestNow.rivers || []).filter(riverShown);
  }

  function applyRegion() {
    if (regionsEl) {
      Array.prototype.forEach.call(regionsEl.querySelectorAll(".rv-tag"), function (btn) {
        var on = btn.getAttribute("data-rv-region") === regionFilter;
        btn.classList.toggle("rv-on", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
    if (row) {
      Array.prototype.forEach.call(row.querySelectorAll(".rv-card"), function (card) {
        card.hidden = !(card._river && riverShown(card._river));
      });
    }
    if (emptyEl) {
      var loaded = manifestNow && (manifestNow.rivers || []).length;
      emptyEl.hidden = !loaded || visibleRivers().length > 0;
    }
    if (lb && !lb._closing) {
      var still = visibleRivers().some(function (river) { return river.slug === lb._slug; });
      if (!still) closeLb();
    }
    syncMap();
  }

  // Same loader and tint as Ski Hills (js/ski-hills.js). The tint is unmodified.
  function ensureMapLibre() {
    if (window.maplibregl) return Promise.resolve();
    if (mapLibrePromise) return mapLibrePromise;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.css";
    document.head.appendChild(link);
    mapLibrePromise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = "https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.js";
      script.async = true;
      script.onload = function () { resolve(); };
      script.onerror = function () {
        mapLibrePromise = null;
        reject(new Error("map"));
      };
      document.head.appendChild(script);
    });
    return mapLibrePromise;
  }

  function tintStyle(style) {
    delete style.sprite;
    delete style.glyphs;
    style.layers = style.layers.filter(function (layer) {
      return layer.type !== "symbol";
    });
    style.layers.forEach(function (layer) {
      var paint = layer.paint || (layer.paint = {});
      if (layer.id === "water") paint["fill-color"] = "#c3d3de";
      if (layer.id === "waterway") paint["line-color"] = "#a9c0ce";
      if (layer.id === "park") paint["fill-color"] = "#d3e0d2";
      if (layer.id === "landcover_wood") paint["fill-color"] = "#c5d4c4";
    });
    return style;
  }

  function loadPositron() {
    if (!positronStyle) {
      positronStyle = fetch("https://tiles.openfreemap.org/styles/positron")
        .then(function (res) { return res.json(); })
        .then(tintStyle)
        .catch(function (err) {
          positronStyle = null;
          throw err;
        });
    }
    return positronStyle;
  }

  function mapPoint(river) {
    var point = river && river.map;
    if (!point) return null;
    if (typeof point.lat !== "number" || typeof point.lon !== "number") return null;
    if (point.kind !== "mouth" && point.kind !== "area") return null;
    return point;
  }

  function readJson(res) {
    if (!res.ok) throw new Error("rivers map");
    return res.json();
  }

  function ensureBounds() {
    if (boundsBySlug) return Promise.resolve(boundsBySlug);
    if (!boundsPromise) {
      boundsPromise = fetch(assetSrc("map/bounds.json")).then(readJson).then(function (data) {
        boundsBySlug = data;
        return data;
      }).catch(function (err) {
        boundsPromise = null;
        throw err;
      });
    }
    return boundsPromise;
  }

  function ensurePreviewLines() {
    if (previewPack) return Promise.resolve(previewPack);
    if (!previewPromise) {
      previewPromise = fetch(assetSrc("map/lines-preview.json")).then(readJson).then(function (data) {
        previewPack = data;
        return data;
      }).catch(function (err) {
        previewPromise = null;
        throw err;
      });
    }
    return previewPromise;
  }

  function emptyLines() {
    return { type: "FeatureCollection", features: [] };
  }

  function ensureMap(style) {
    if (map || !mapEl || !window.maplibregl) return;
    map = new window.maplibregl.Map({
      container: mapEl,
      style: JSON.parse(JSON.stringify(style)),
      center: [0, 20],
      zoom: 2,
      attributionControl: false,
      maplibreLogo: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      pitch: 0,
      bearing: 0,
      maxPitch: 0,
      fadeDuration: 0,
      renderWorldCopies: false
    });
    if (map.touchZoomRotate) map.touchZoomRotate.disableRotation();
    if (map.dragRotate) map.dragRotate.disable();
    map.addControl(new window.maplibregl.NavigationControl({
      showCompass: false,
      visualizePitch: false
    }), "top-right");
    map.on("load", function () {
      if (!map.getSource("rv-lines")) {
        map.addSource("rv-lines", { type: "geojson", data: emptyLines() });
        map.addLayer({
          id: "rv-line",
          type: "line",
          source: "rv-lines",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": PREVIEW_INK,
            "line-width": 1,
            "line-opacity": 0.5
          }
        });
      }
      map.resize();
      if (viewMode === "map") syncMap();
    });
    map.on("zoomend", placeLabels);
    map.on("moveend", placeLabels);
    map.on("idle", syncLines);
    map.on("mousemove", function (ev) {
      var hits = lineHits(ev.point);
      map.getCanvas().style.cursor = hits.length ? "pointer" : "";
    });
    map.on("click", function (ev) {
      var native = ev.originalEvent;
      var target = native && native.target;
      if (native && native._rvHandled) return;
      if (target && target.closest && (target.closest(".maplibregl-ctrl") || target.closest(".rv-mouth"))) return;
      var hits = lineHits(ev.point);
      if (!hits.length) return;
      var slug = hits[0].properties && hits[0].properties.slug;
      var river = slug && riverBySlug[slug];
      if (river && riverShown(river)) openRiver(river);
    });
  }

  function paintMarker(entry) {
    entry.root.classList.toggle("rv-mouth-hot", !!entry.force);
  }

  function paintMarkers() {
    markerEntries.forEach(paintMarker);
  }

  function setForce(entry, on) {
    if (entry.force === on) return;
    entry.force = on;
    paintMarker(entry);
    placeLabels();
  }

  function openRiver(river) {
    if (manifestNow) openLb(manifestNow, river);
  }

  function bindOpen(node, entry) {
    var name = entry.river.name || entry.river.slug || "river";
    node.setAttribute("aria-label", "Open " + name);
    node.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      ev._rvHandled = true;
      openRiver(entry.river);
    });
    node.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      ev.preventDefault();
      openRiver(entry.river);
    });
    node.addEventListener("focus", function () { setForce(entry, true); });
    node.addEventListener("blur", function () { setForce(entry, false); });
  }

  function ensureMarkers() {
    if (markerEntries.length || !manifestNow || !window.maplibregl) return;
    (manifestNow.rivers || []).forEach(function (river) {
      var point = mapPoint(river);
      if (!point) return;
      var entry = { river: river, force: false, onMap: false };
      var root = document.createElement("div");
      root.className = "rv-mouth";
      var dot = document.createElement("button");
      dot.type = "button";
      dot.className = "rv-mouth-dot";
      var label = document.createElement("button");
      label.type = "button";
      label.className = "rv-mouth-name";
      label.textContent = river.name || river.slug || "";
      label.tabIndex = -1;
      root.appendChild(dot);
      root.appendChild(label);
      root.addEventListener("mouseenter", function () { setForce(entry, true); });
      root.addEventListener("mouseleave", function () { setForce(entry, false); });
      bindOpen(dot, entry);
      bindOpen(label, entry);
      entry.root = root;
      entry.nameEl = label;
      entry.marker = new window.maplibregl.Marker({ element: root, anchor: "center" })
        .setLngLat([point.lon, point.lat]);
      markerEntries.push(entry);
    });
  }

  function placeLabels() {
    if (!map) return;
    var boxes = [];
    var nodes = [];
    markerEntries.forEach(function (entry) {
      var node = entry.nameEl;
      if (!node || !entry.onMap) {
        nodes.push(node || null);
        boxes.push(null);
        return;
      }
      var point = mapPoint(entry.river);
      var pt = map.project([point.lon, point.lat]);
      var name = entry.river.name || entry.river.slug || "";
      nodes.push(node);
      boxes.push({
        x: pt.x + 16,
        y: pt.y - 7,
        w: Math.max(28, name.length * 6.6),
        h: 14,
        force: entry.force
      });
    });
    var live = [];
    var index = [];
    boxes.forEach(function (box, i) {
      if (!box) return;
      live.push(box);
      index.push(i);
    });
    var shown = labelsShown(live, map.getZoom());
    var on = {};
    index.forEach(function (entryIndex, i) {
      on[entryIndex] = shown[i];
    });
    nodes.forEach(function (node, i) {
      if (!node) return;
      var visible = !!on[i];
      node.classList.toggle("rv-map-label-off", !visible);
      node.tabIndex = visible ? 0 : -1;
    });
  }

  function boundsOf(slug) {
    var raw = boundsBySlug && boundsBySlug[slug];
    if (!raw || raw.length < 2) return null;
    return {
      south: raw[0][0],
      west: raw[0][1],
      north: raw[1][0],
      east: raw[1][1]
    };
  }

  function fitRivers(rivers, maxZoom) {
    if (!map) return;
    var south = Infinity;
    var west = Infinity;
    var north = -Infinity;
    var east = -Infinity;
    var any = false;
    rivers.forEach(function (river) {
      var part = boundsOf(river.slug);
      var point = mapPoint(river);
      if (part) {
        any = true;
        if (part.south < south) south = part.south;
        if (part.north > north) north = part.north;
        if (part.west < west) west = part.west;
        if (part.east > east) east = part.east;
      }
      if (point) {
        any = true;
        if (point.lat < south) south = point.lat;
        if (point.lat > north) north = point.lat;
        if (point.lon < west) west = point.lon;
        if (point.lon > east) east = point.lon;
      }
    });
    if (!any || south === Infinity) return;
    var cap = maxZoom == null ? 6 : maxZoom;
    if (Math.abs(north - south) < 1e-6 && Math.abs(east - west) < 1e-6) {
      map.jumpTo({ center: [west, south], zoom: Math.min(cap, 5) });
      return;
    }
    map.fitBounds([[west, south], [east, north]], {
      padding: 32,
      maxZoom: cap,
      animate: false,
      duration: 0
    });
  }

  function scheduleFit(rivers, maxZoom, done) {
    var token = ++fitToken;
    var list = rivers.slice();
    ensureBounds().then(function () {
      if (token !== fitToken || viewMode !== "map" || !map) return;
      if (!(lb && !lb._closing)) fitRivers(list, maxZoom);
      if (done) done();
    }).catch(function () {
      if (token === fitToken && done) done();
    });
  }

  function styleReady() {
    return !!(map && map.isStyleLoaded && map.isStyleLoaded());
  }

  function lineHits(point) {
    if (!styleReady() || !map.getLayer("rv-line")) return [];
    var box = [
      [point.x - 8, point.y - 8],
      [point.x + 8, point.y + 8]
    ];
    return map.queryRenderedFeatures(box, { layers: ["rv-line"] });
  }

  function previewFC(rivers) {
    var pack = previewPack && previewPack.rivers;
    var features = [];
    if (!pack) return emptyLines();
    rivers.forEach(function (river) {
      var data = pack[river.slug];
      var lines = data && data.lines;
      if (!lines || !lines.length) return;
      features.push({
        type: "Feature",
        properties: { slug: river.slug },
        geometry: { type: "MultiLineString", coordinates: lines }
      });
    });
    return { type: "FeatureCollection", features: features };
  }

  function syncLines() {
    if (viewMode !== "map" || !map || !previewPack) return;
    if (!styleReady() || !map.getSource("rv-lines")) return;
    var rivers = visibleRivers();
    var key = rivers.map(function (river) { return river.slug; }).join("|");
    if (key === previewKey) return;
    map.getSource("rv-lines").setData(previewFC(rivers));
    previewKey = key;
  }

  function syncMap() {
    if (viewMode !== "map" || !map || !manifestNow) return;
    ensureMarkers();
    var slugs = [];
    markerEntries.forEach(function (entry) {
      var show = riverShown(entry.river);
      if (show && !entry.onMap) {
        entry.marker.addTo(map);
        entry.onMap = true;
      } else if (!show && entry.onMap) {
        entry.marker.remove();
        entry.onMap = false;
      }
      if (show) slugs.push(entry.river.slug);
    });
    var key = slugs.join("|");
    var viewerOpen = lb && !lb._closing;
    if (key !== fittedKey && !viewerOpen) {
      fittedKey = key;
      scheduleFit(visibleRivers(), 6);
    }
    paintMarkers();
    placeLabels();
    if (previewPack) syncLines();
    else {
      ensurePreviewLines().then(function () {
        if (viewMode === "map") syncLines();
      }).catch(function () {});
    }
  }

  function setViewButtons() {
    var gridOn = viewMode === "grid";
    var mapOn = viewMode === "map";
    if (gridBtn) {
      gridBtn.classList.toggle("sh-icon-on", gridOn);
      gridBtn.setAttribute("aria-pressed", gridOn ? "true" : "false");
    }
    if (mapBtn) {
      mapBtn.classList.toggle("sh-icon-on", mapOn);
      mapBtn.setAttribute("aria-pressed", mapOn ? "true" : "false");
    }
  }

  function setViewMode(mode) {
    if (mode !== "grid" && mode !== "map") return;
    if (mode === viewMode) return;
    viewMode = mode;
    setViewButtons();
    if (row) row.hidden = mode === "map";
    if (mapWrap) mapWrap.hidden = mode !== "map";
    if (mode !== "map") return;
    Promise.all([ensureMapLibre(), loadPositron()]).then(function (out) {
      if (viewMode !== "map") return;
      ensureMap(out[1]);
      if (!map) return;
      map.resize();
      if (map.isStyleLoaded && map.isStyleLoaded()) syncMap();
    }).catch(function () {});
  }

  function buildRegions(manifest) {
    if (!regionsEl) return;
    regionsEl.textContent = "";
    regionNames(manifest).forEach(function (name) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "rv-tag";
      btn.setAttribute("data-rv-region", name);
      btn.textContent = name;
      btn.addEventListener("click", function () {
        if (regionFilter === name) return;
        regionFilter = name;
        applyRegion();
      });
      regionsEl.appendChild(btn);
    });
    applyRegion();
  }

  function creditLine(parts) {
    var line = document.createElement("p");
    line.textContent = parts.join(" ");
    return line;
  }

  function fillCredit(manifest) {
    creditEl.textContent = "";
    var sources = [];
    if (manifest.attribution) sources.push(manifest.attribution);
    attributionLines(manifest).forEach(function (line) {
      sources.push(line);
    });
    var disclaimer = contourCredits(manifest);
    if (sources.length) creditEl.appendChild(creditLine(sources));
    if (disclaimer.length) creditEl.appendChild(creditLine(disclaimer));
    creditEl.appendChild(creditLine(["Map data \u00a9 OpenStreetMap contributors, OpenFreeMap"]));
  }

  function render(manifest) {
    manifestNow = manifest;
    riverBySlug = Object.create(null);
    (manifest.rivers || []).forEach(function (river) {
      if (river && river.slug) riverBySlug[river.slug] = river;
    });
    if (titleEl) titleEl.textContent = manifest.title || "Rivers";
    document.title = (manifest.title || "Rivers") + " \u2014 databaseprojects";
    row.textContent = "";
    (manifest.rivers || []).forEach(function (river) {
      row.appendChild(cardEl(manifest, river));
    });
    if (notesEl) {
      notesEl.textContent = "";
      notesEl.hidden = true;
    }
    fillCredit(manifest);
    buildRegions(manifest);
  }

  function stepLb(dir) {
    if (!lb || lb._closing || !manifestNow) return;
    var list = visibleRivers();
    var index = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].slug === lb._slug) {
        index = i;
        break;
      }
    }
    if (index < 0) return;
    var next = index + dir;
    if (next < 0 || next >= list.length) return;
    openLb(manifestNow, list[next]);
  }

  function syncFind() {
    if (clearEl) clearEl.hidden = !searchQuery;
  }

  if (findEl) {
    findEl.addEventListener("input", function () {
      searchQuery = findEl.value;
      syncFind();
      applyRegion();
    });
  }
  if (clearEl) {
    clearEl.addEventListener("click", function () {
      searchQuery = "";
      if (findEl) {
        findEl.value = "";
        findEl.focus();
      }
      syncFind();
      applyRegion();
    });
  }
  if (gridBtn) gridBtn.addEventListener("click", function () { setViewMode("grid"); });
  if (mapBtn) mapBtn.addEventListener("click", function () { setViewMode("map"); });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && lb) {
      e.preventDefault();
      closeLb();
      return;
    }
    var typing = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
    if (typing) return;
    if (!lb || lb._closing) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      stepLb(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      stepLb(-1);
    }
  });

  fetch("rivers.json?v=" + ASSET_V).then(function (res) {
    if (!res.ok) throw new Error("rivers");
    return res.json();
  }).then(render).catch(function () {
    if (notesEl) {
      notesEl.hidden = false;
      notesEl.textContent = "The river list did not load.";
    }
  });

  root.RiversPage = api;
})(typeof window !== "undefined" ? window : globalThis);
