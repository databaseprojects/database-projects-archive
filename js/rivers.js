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
    maxNative: MAX_NATIVE
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document === "undefined") return;

  var ASSET_V = "20261025h";

  function assetSrc(path) {
    if (typeof path === "string" && path.indexOf("https://") === 0) return path;
    return path + "?v=" + ASSET_V;
  }
  var contourReady = {};
  var contourPending = {};
  var row = document.getElementById("rv-row");
  var notesEl = document.getElementById("rv-notes");
  var creditEl = document.getElementById("rv-credit");
  var setEl = document.getElementById("rv-set");
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
  var regionFilter = "All";
  var searchQuery = "";
  var viewMode = "grid";
  var lb = null;
  var lbTimer = null;
  var map = null;
  var markerLayer = null;
  var markerEntries = [];
  var fittedKey = "";
  var leafletPromise = null;

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

  function loadLeaflet() {
    if (window.L && window.L.map) return Promise.resolve(window.L);
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise(function (resolve, reject) {
      var css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "../js/vendor/leaflet/leaflet.css?v=" + ASSET_V;
      document.head.appendChild(css);
      var script = document.createElement("script");
      script.src = "../js/vendor/leaflet/leaflet.js?v=" + ASSET_V;
      script.async = true;
      script.onload = function () {
        if (window.L && window.L.map) resolve(window.L);
        else reject(new Error("leaflet"));
      };
      script.onerror = function () {
        leafletPromise = null;
        reject(new Error("leaflet"));
      };
      document.head.appendChild(script);
    });
    return leafletPromise;
  }

  function markerOptions(kind, hot) {
    var area = kind === "area";
    return {
      radius: hot ? (area ? 8 : 7) : (area ? 6 : 5),
      color: "#111",
      weight: hot ? (area ? 3 : 2) : (area ? 2 : 1),
      fillColor: "#111",
      fillOpacity: area ? 0 : 1,
      opacity: 1
    };
  }

  function mapPoint(river) {
    var point = river && river.map;
    if (!point) return null;
    if (typeof point.lat !== "number" || typeof point.lon !== "number") return null;
    if (point.kind !== "mouth" && point.kind !== "area") return null;
    return point;
  }

  function ensureMap() {
    if (map || !mapEl || !window.L) return;
    map = window.L.map(mapEl, {
      worldCopyJump: false,
      minZoom: 2,
      maxZoom: 12,
      maxBounds: [[-85, -180], [85, 180]],
      maxBoundsViscosity: 1,
      zoomControl: true,
      attributionControl: true
    });
    window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "\u00a9 OpenStreetMap contributors",
      noWrap: true,
      minZoom: 2,
      maxZoom: 12
    }).addTo(map);
    markerLayer = window.L.layerGroup().addTo(map);
    map.on("zoomend moveend", placeLabels);
    map.setView([20, 0], 2);
  }

  function paintMarker(entry, hot) {
    entry.marker.setStyle(markerOptions(entry.river.map.kind, hot));
  }

  function setForce(entry, on) {
    if (entry.force === on) return;
    entry.force = on;
    paintMarker(entry, on);
    placeLabels();
  }

  function openRiver(river) {
    if (manifestNow) openLb(manifestNow, river);
  }

  function armMarker(entry) {
    var marker = entry.marker;
    var node = marker.getElement();
    if (!node || node._rvArmed) return;
    node._rvArmed = true;
    var name = entry.river.name || "river";
    node.setAttribute("tabindex", "0");
    node.setAttribute("role", "button");
    node.setAttribute("aria-label", "Open " + name);
    node.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      ev.preventDefault();
      openRiver(entry.river);
    });
    node.addEventListener("focus", function () { setForce(entry, true); });
    node.addEventListener("blur", function () { setForce(entry, false); });
  }

  function wireMarker(entry) {
    var marker = entry.marker;
    var name = entry.river.name || entry.river.slug || "";
    marker.bindTooltip(name, {
      permanent: true,
      direction: "right",
      offset: [7, 0],
      className: "rv-map-label",
      interactive: false,
      opacity: 1
    });
    marker.on("click", function (e) {
      if (window.L && e.originalEvent) window.L.DomEvent.stop(e.originalEvent);
      openRiver(entry.river);
    });
    marker.on("add", function () { armMarker(entry); });
    marker.on("mouseover", function () { setForce(entry, true); });
    marker.on("mouseout", function () { setForce(entry, false); });
  }

  function ensureMarkers() {
    if (markerEntries.length || !manifestNow || !window.L) return;
    (manifestNow.rivers || []).forEach(function (river) {
      var point = mapPoint(river);
      if (!point) return;
      var marker = window.L.circleMarker([point.lat, point.lon], markerOptions(point.kind, false));
      var entry = { river: river, marker: marker, force: false };
      wireMarker(entry);
      markerEntries.push(entry);
    });
  }

  function placeLabels() {
    if (!map) return;
    var boxes = [];
    var nodes = [];
    markerEntries.forEach(function (entry) {
      var tip = entry.marker.getTooltip();
      var node = tip && tip.getElement();
      if (!node || !entry.marker._map) {
        nodes.push(node || null);
        boxes.push(null);
        return;
      }
      var pt = map.latLngToContainerPoint(entry.marker.getLatLng());
      var name = entry.river.name || entry.river.slug || "";
      nodes.push(node);
      boxes.push({
        x: pt.x + 8,
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
      node.classList.toggle("rv-map-label-off", !on[i]);
    });
  }

  function fitVisible() {
    var pts = [];
    markerEntries.forEach(function (entry) {
      if (entry.marker._map) pts.push(entry.marker.getLatLng());
    });
    if (!pts.length || !map) return;
    if (pts.length === 1) {
      map.setView(pts[0], 5, { animate: false });
      return;
    }
    map.fitBounds(window.L.latLngBounds(pts), { padding: [32, 32], maxZoom: 6, animate: false });
  }

  function syncMap() {
    if (viewMode !== "map" || !map || !manifestNow) return;
    ensureMarkers();
    var slugs = [];
    markerEntries.forEach(function (entry) {
      var show = riverShown(entry.river);
      var onMap = !!entry.marker._map;
      if (show && !onMap) markerLayer.addLayer(entry.marker);
      else if (!show && onMap) markerLayer.removeLayer(entry.marker);
      if (show) slugs.push(entry.river.slug);
    });
    var key = slugs.join("|");
    var viewerOpen = lb && !lb._closing;
    if (key !== fittedKey && !viewerOpen) {
      fitVisible();
      fittedKey = key;
    }
    placeLabels();
  }

  function setViewButtons() {
    var gridOn = viewMode === "grid";
    var mapOn = viewMode === "map";
    if (gridBtn) {
      gridBtn.classList.toggle("rv-on", gridOn);
      gridBtn.setAttribute("aria-pressed", gridOn ? "true" : "false");
    }
    if (mapBtn) {
      mapBtn.classList.toggle("rv-on", mapOn);
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
    loadLeaflet().then(function () {
      if (viewMode !== "map") return;
      ensureMap();
      requestAnimationFrame(function () {
        if (viewMode !== "map" || !map) return;
        map.invalidateSize();
        syncMap();
      });
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
  }

  function render(manifest) {
    manifestNow = manifest;
    if (titleEl) titleEl.textContent = manifest.title || "Rivers";
    document.title = (manifest.title || "Rivers") + " \u2014 databaseprojects";
    if (setEl) setEl.textContent = manifest.set || "";
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
