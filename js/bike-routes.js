/* Bike Routes. Drawings are local. The map loads only after Map is opened. */
(function () {
  var grid = document.getElementById("br-grid");
  var count = document.querySelector(".br-count");
  var tags = document.querySelector(".br-tags");
  var routes = [];
  var byId = {};
  var kind = "all";
  var query = "";
  var view = "grid";
  var mapField = null;
  var map = null;
  var mapStarting = false;
  var mapTip = null;
  var boundary = null;
  var positron = null;
  var DRAW = 880;
  var SQUARE = 1000;
  var NS = "http://www.w3.org/2000/svg";
  var STROKE = {
    "Protected Bike Lanes": { w: 3.1, c: "#1b7a32" },
    "Painted Lanes": { w: 2.3, c: "#1a4f9c" },
    "Shared Lanes": { w: 1.7, c: "#5c5c5c" },
    "Local Street": { w: 1.5, c: "#111111" }
  };

  function fold(text) {
    return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function matches(route) {
    if (kind !== "all" && route.types.indexOf(kind) === -1) return false;
    if (!query) return true;
    var hay = fold(route.name + " " + (route.areas || []).join(" ") + " " + (route.streets || []).join(" "));
    return hay.indexOf(query) !== -1;
  }

  function visible() {
    return routes.filter(matches);
  }

  function caption(route) {
    var line = route.type + "  ·  " + route.km.toFixed(1) + " km";
    if (route.areas && route.areas.length) line += "  ·  " + route.areas.slice(0, 4).join(", ");
    return line;
  }

  function project(route) {
    var pts = [];
    (route.lines || []).forEach(function (line) {
      (line.c || []).forEach(function (p) { pts.push(p); });
    });
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    pts.forEach(function (p) {
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
    });
    var span = Math.max(maxX - minX, maxY - minY) || 1e-6;
    var pad = 36;
    var inner = DRAW - pad * 2;
    return function (lon, lat) {
      var x = pad + (lon - minX) / span * inner + (inner - (maxX - minX) / span * inner) / 2;
      var y = pad + (maxY - lat) / span * inner + (inner - (maxY - minY) / span * inner) / 2;
      return x.toFixed(1) + "," + y.toFixed(1);
    };
  }

  function fitSize(text, size, width) {
    while (size > 11 && text.length * size * 0.62 > width) size -= 1;
    return size;
  }

  function drawing(route) {
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + SQUARE + " " + SQUARE);
    svg.setAttribute("aria-hidden", "true");
    var xy = project(route);
    (route.lines || []).forEach(function (line) {
      var look = STROKE[line.t] || STROKE["Local Street"];
      var node = document.createElementNS(NS, "polyline");
      node.setAttribute("points", (line.c || []).map(function (p) { return xy(p[0], p[1]); }).join(" "));
      node.setAttribute("stroke", look.c);
      node.setAttribute("stroke-width", String(look.w));
      svg.appendChild(node);
    });
    var rule = document.createElementNS(NS, "line");
    rule.setAttribute("x1", "0");
    rule.setAttribute("y1", String(DRAW));
    rule.setAttribute("x2", String(SQUARE));
    rule.setAttribute("y2", String(DRAW));
    rule.setAttribute("stroke", "#111");
    rule.setAttribute("stroke-width", "1");
    svg.appendChild(rule);
    var name = document.createElementNS(NS, "text");
    name.setAttribute("x", "36");
    name.setAttribute("y", "932");
    name.setAttribute("font-size", String(fitSize(route.name, 28, 920)));
    name.textContent = route.name;
    svg.appendChild(name);
    var sub = caption(route);
    var second = document.createElementNS(NS, "text");
    second.setAttribute("x", "36");
    second.setAttribute("y", "972");
    second.setAttribute("font-size", String(fitSize(sub, 16, 920)));
    second.textContent = sub;
    svg.appendChild(second);
    return svg;
  }

  function paint() {
    var shown = 0;
    routes.forEach(function (route) {
      var on = matches(route);
      route.el.hidden = !on;
      if (on) shown += 1;
    });
    if (count) {
      count.textContent = (query && !shown) ? "No routes match" : (shown + " of " + routes.length);
    }
    if (view === "map") syncMap();
  }

  function setPressed() {
    if (!tags) return;
    Array.prototype.forEach.call(tags.querySelectorAll("[data-br-type]"), function (btn) {
      var on = btn.getAttribute("data-br-type") === kind;
      btn.classList.toggle("br-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function drawAll() {
    routes.forEach(function (route) {
      var card = document.createElement("a");
      card.className = "br-route";
      card.id = route.id;
      card.href = "#" + route.id;
      card.setAttribute("aria-label", route.name);
      card.appendChild(drawing(route));
      route.el = card;
      grid.appendChild(card);
    });
    paint();
  }

  function slugFromHash() {
    return decodeURIComponent((location.hash || "").replace(/^#/, "")).trim();
  }

  function closeLb() {
    var lb = document.getElementById("br-lb");
    if (lb && lb.parentNode) lb.parentNode.removeChild(lb);
    document.documentElement.classList.remove("br-lb-open");
    if (slugFromHash()) history.pushState(null, "", location.pathname + location.search);
  }

  function setFramed(lb, on) {
    lb.classList.toggle("br-framed", !!on);
    var track = lb.querySelector(".br-track");
    if (track) track.style.transform = "";
  }

  function openLb(route) {
    var existing = document.getElementById("br-lb");
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    var lb = document.createElement("div");
    lb.id = "br-lb";
    lb.className = "br-lb";
    lb.setAttribute("role", "dialog");
    lb.setAttribute("aria-modal", "true");
    lb.setAttribute("aria-label", route.name);
    var maxW = Math.min(window.innerWidth * 0.92, 1100);
    var maxH = window.innerHeight * 0.86 - 24;
    var px = Math.min(maxW, maxH);
    var stage = document.createElement("div");
    stage.className = "br-stage";
    stage.style.width = px.toFixed(1) + "px";
    var track = document.createElement("div");
    track.className = "br-track";
    var plain = document.createElement("div");
    plain.className = "br-slide";
    var art = drawing(route);
    art.removeAttribute("aria-hidden");
    plain.appendChild(art);
    var framed = document.createElement("div");
    framed.className = "br-slide";
    var wall = document.createElement("div");
    wall.className = "br-wall";
    wall.style.height = px.toFixed(1) + "px";
    wall.innerHTML = '<div class="br-hang"><div class="br-mould"><div class="br-mat"><div class="br-frame-art"></div></div></div></div>';
    wall.querySelector(".br-frame-art").appendChild(drawing(route));
    framed.appendChild(wall);
    track.appendChild(plain);
    track.appendChild(framed);
    stage.appendChild(track);
    function chevron(dir) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "br-edge br-edge-" + dir;
      btn.setAttribute("aria-label", dir === "next" ? "Framed view" : "Plain view");
      btn.innerHTML = '<svg viewBox="0 0 11 18" aria-hidden="true"><polyline points="' +
        (dir === "next" ? "2,2 9,9 2,16" : "9,2 2,9 9,16") +
        '" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"></polyline></svg>';
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        setFramed(lb, dir === "next");
      });
      return btn;
    }
    stage.appendChild(chevron("next"));
    stage.appendChild(chevron("prev"));
    var drag = null;
    stage.addEventListener("pointerdown", function (e) {
      if (e.target.closest && e.target.closest(".br-edge")) return;
      drag = { id: e.pointerId, x: e.clientX, moved: false };
      stage.setPointerCapture(e.pointerId);
      stage.classList.add("br-dragging");
      if (e.pointerType === "touch") {
        stage.classList.add("br-touch-hint");
        setTimeout(function () { stage.classList.remove("br-touch-hint"); }, 1000);
      }
    });
    stage.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x;
      if (Math.abs(dx) > 4) drag.moved = true;
      var base = lb.classList.contains("br-framed") ? -stage.clientWidth : 0;
      track.style.transition = "none";
      track.style.transform = "translateX(" + (base + dx) + "px)";
    });
    function endDrag(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x;
      var toward = !lb.classList.contains("br-framed");
      var snap = toward ? dx < -stage.clientWidth * 0.2 : dx > stage.clientWidth * 0.2;
      drag = null;
      stage.classList.remove("br-dragging");
      track.style.transition = "";
      track.style.transform = "";
      if (snap) setFramed(lb, toward);
    }
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);
    var viewBox = document.createElement("div");
    viewBox.className = "br-view";
    viewBox.appendChild(stage);
    lb.appendChild(viewBox);
    lb.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest(".br-stage, .br-edge")) return;
      closeLb();
    });
    document.body.appendChild(lb);
    document.documentElement.classList.add("br-lb-open");
    requestAnimationFrame(function () { lb.classList.add("br-lb-on"); });
    var want = "#" + route.id;
    if (location.hash !== want) history.pushState(null, "", location.pathname + location.search + want);
  }

  function showRoute(id) {
    var route = byId[id];
    if (!route) return;
    openLb(route);
  }

  function syncFromHash() {
    var slug = slugFromHash();
    if (slug && byId[slug]) openLb(byId[slug]);
    else closeLb();
  }

  if (grid) {
    grid.addEventListener("click", function (e) {
      var card = e.target.closest ? e.target.closest(".br-route") : null;
      if (!card) return;
      e.preventDefault();
      showRoute(card.id);
    });
  }

  if (tags) {
    tags.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-br-type]") : null;
      if (!btn) return;
      var next = btn.getAttribute("data-br-type");
      kind = next === kind && next !== "all" ? "all" : next;
      setPressed();
      paint();
    });
  }

  var find = document.querySelector(".br-find");
  if (find) {
    find.addEventListener("input", function () {
      query = fold(find.value).trim();
      paint();
    });
  }

  var slider = document.querySelector(".br-zslider");
  function setCols(n) {
    n = Math.round(+n);
    if (n < 4) n = 4;
    if (n > 8) n = 8;
    if (grid) {
      grid.style.setProperty("--br-cols", String(n));
      grid.setAttribute("data-columns", String(n));
    }
    if (slider) {
      slider.value = String(n);
      slider.style.setProperty("--br-p", (((n - 4) / 4) * 100).toFixed(0) + "%");
    }
    try { localStorage.setItem("brZoomCols", String(n)); } catch (err) {}
  }
  if (slider) {
    var stored = 5;
    try {
      var raw = parseInt(localStorage.getItem("brZoomCols"), 10);
      if (raw) stored = raw;
    } catch (err) {}
    setCols(window.matchMedia("(max-width: 767px)").matches ? 4 : stored);
    slider.addEventListener("input", function () { setCols(slider.value); });
  }

  window.addEventListener("hashchange", syncFromHash);
  window.addEventListener("popstate", syncFromHash);
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && document.getElementById("br-lb")) closeLb();
  });

  function mapLibre() {
    if (window.maplibregl) return Promise.resolve();
    if (mapLibre.promise) return mapLibre.promise;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.css";
    document.head.appendChild(link);
    mapLibre.promise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = "https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.js";
      script.async = true;
      script.onload = function () { resolve(); };
      script.onerror = function () {
        mapLibre.promise = null;
        reject(new Error("map"));
      };
      document.head.appendChild(script);
    });
    return mapLibre.promise;
  }

  function loadPositron() {
    if (positron) return positron;
    positron = fetch("https://tiles.openfreemap.org/styles/positron").then(function (res) {
      return res.json();
    }).then(function (style) {
      delete style.sprite;
      delete style.glyphs;
      style.layers = style.layers.filter(function (layer) { return layer.type !== "symbol"; });
      style.layers.forEach(function (layer) {
        var paint = layer.paint || (layer.paint = {});
        if (layer.id === "water") paint["fill-color"] = "#c3d3de";
        if (layer.id === "park") paint["fill-color"] = "#d3e0d2";
      });
      return style;
    }).catch(function (err) {
      positron = null;
      throw err;
    });
    return positron;
  }

  function loadBoundary() {
    if (boundary) return Promise.resolve(boundary);
    return fetch("boundary.json?v=20261017d").then(function (res) {
      if (!res.ok) throw new Error("boundary");
      return res.json();
    }).then(function (data) {
      boundary = data;
      return data;
    });
  }

  function lineFeatures() {
    var features = [];
    visible().forEach(function (route) {
      (route.lines || []).forEach(function (line) {
        features.push({
          type: "Feature",
          properties: { id: route.id, name: route.name, type: line.t },
          geometry: { type: "LineString", coordinates: line.c }
        });
      });
    });
    return { type: "FeatureCollection", features: features };
  }

  function syncMap() {
    if (!map || !map.getSource("br-lines")) return;
    map.getSource("br-lines").setData(lineFeatures());
  }

  function sizeMap() {
    if (!mapField) return;
    var width = mapField.clientWidth || 640;
    mapField.style.height = Math.max(640, Math.round(Math.max(280, width) * 100 / 120)) + "px";
    if (map) map.resize();
  }

  function ensureTip() {
    if (mapTip) return mapTip;
    mapTip = document.createElement("p");
    mapTip.className = "br-map-tip";
    mapTip.hidden = true;
    document.body.appendChild(mapTip);
    return mapTip;
  }

  function showTip(name, x, y) {
    var tip = ensureTip();
    if (!name || document.getElementById("br-lb")) {
      tip.hidden = true;
      return;
    }
    tip.hidden = false;
    tip.textContent = name;
    tip.style.left = (x + 10) + "px";
    tip.style.top = (y - 8) + "px";
  }

  function mountMap() {
    if (mapField) return;
    var field = document.createElement("div");
    field.className = "br-map";
    field.hidden = true;
    var tiles = document.createElement("div");
    tiles.className = "br-map-tiles";
    field.appendChild(tiles);
    var zoom = document.createElement("div");
    zoom.className = "br-map-zoom";
    zoom.innerHTML = '<button type="button" data-z="1" aria-label="Zoom in">+</button><button type="button" data-z="-1" aria-label="Zoom out">−</button>';
    zoom.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("button") : null;
      if (!btn || !map) return;
      e.preventDefault();
      e.stopPropagation();
      map.zoomTo(map.getZoom() + (+btn.getAttribute("data-z") || 1), { duration: 200 });
    });
    var credit = document.createElement("p");
    credit.className = "br-map-credit";
    credit.textContent = "\u00a9 OpenStreetMap";
    field.appendChild(zoom);
    field.appendChild(credit);
    grid.parentNode.insertBefore(field, grid.nextSibling);
    mapField = field;
    sizeMap();
    window.addEventListener("resize", function () {
      if (view === "map") sizeMap();
    });
  }

  function enterMap() {
    view = "map";
    mountMap();
    mapField.hidden = false;
    if (grid) grid.classList.add("br-held");
    var btn = document.getElementById("br-map-btn");
    if (btn) {
      btn.classList.add("br-icon-on");
      btn.setAttribute("aria-pressed", "true");
    }
    sizeMap();
    if (map || mapStarting) {
      if (map) {
        map.resize();
        syncMap();
      }
      return;
    }
    mapStarting = true;
    Promise.all([mapLibre(), loadPositron(), loadBoundary()]).then(function (ready) {
      if (view !== "map" || map) return;
      var style = JSON.parse(JSON.stringify(ready[1]));
      map = new maplibregl.Map({
        container: mapField.querySelector(".br-map-tiles"),
        style: style,
        bounds: [[-123.27, 49.198], [-123.02, 49.315]],
        fitBoundsOptions: { padding: 28, animate: false },
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        fadeDuration: 0
      });
      if (map.touchZoomRotate) map.touchZoomRotate.disableRotation();
      if (map.dragRotate) map.dragRotate.disable();
      map.on("load", function () {
        var mask = boundary;
        map.addSource("br-mask", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "Polygon", coordinates: [mask.outer].concat(mask.holes || []) }
          }
        });
        map.addLayer({
          id: "br-mask",
          type: "fill",
          source: "br-mask",
          paint: { "fill-color": "#ffffff", "fill-opacity": 0.9 }
        });
        map.addSource("br-lines", { type: "geojson", data: lineFeatures() });
        map.addLayer({
          id: "br-lines",
          type: "line",
          source: "br-lines",
          paint: {
            "line-color": [
              "match", ["get", "type"],
              "Protected Bike Lanes", "#1b7a32",
              "Painted Lanes", "#1a4f9c",
              "Shared Lanes", "#5c5c5c",
              "#111111"
            ],
            "line-width": 2.4
          }
        });
        map.on("click", "br-lines", function (e) {
          var feat = e.features && e.features[0];
          if (!feat) return;
          showTip("", 0, 0);
          showRoute(feat.properties.id);
        });
        map.on("mousemove", "br-lines", function (e) {
          map.getCanvas().style.cursor = "pointer";
          var feat = e.features && e.features[0];
          if (feat) showTip(feat.properties.name, e.originalEvent.clientX, e.originalEvent.clientY);
        });
        map.on("mouseleave", "br-lines", function () {
          map.getCanvas().style.cursor = "";
          showTip("", 0, 0);
        });
      });
    }).catch(function () {
      if (count) count.textContent = "The map did not load.";
    });
  }

  function leaveMap() {
    view = "grid";
    if (mapField) mapField.hidden = true;
    if (grid) grid.classList.remove("br-held");
    var btn = document.getElementById("br-map-btn");
    if (btn) {
      btn.classList.remove("br-icon-on");
      btn.setAttribute("aria-pressed", "false");
    }
    showTip("", 0, 0);
  }

  var mapBtn = document.getElementById("br-map-btn");
  if (mapBtn) {
    mapBtn.addEventListener("click", function () {
      if (view === "map") leaveMap();
      else enterMap();
    });
  }

  fetch("routes.json?v=20261017d").then(function (res) {
    if (!res.ok) throw new Error("routes");
    return res.json();
  }).then(function (data) {
    routes = data.routes || [];
    routes.forEach(function (route) { byId[route.id] = route; });
    drawAll();
    if (slugFromHash() && byId[slugFromHash()]) openLb(byId[slugFromHash()]);
  }).catch(function () {
    if (count) count.textContent = "The route drawings did not load.";
  });
})();
