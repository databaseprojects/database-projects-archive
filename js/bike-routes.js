/* Bike Routes. One map of every signed Vancouver route. */
(function () {
  var count = document.querySelector(".br-count");
  var tags = document.querySelector(".br-tags");
  var find = document.querySelector(".br-find");
  var mapField = document.getElementById("br-map");
  var routes = [];
  var kind = "all";
  var query = "";
  var map = null;
  var mapTip = null;
  var boundary = null;
  var positron = null;
  var fitted = "";
  var CITY = [[-123.27, 49.198], [-123.02, 49.315]];

  function fold(text) {
    return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function lineOn(line) {
    return kind === "all" || line.t === kind;
  }

  function named(route) {
    return !!query && fold(route.name).indexOf(query) !== -1;
  }

  function shownCount() {
    var n = 0;
    routes.forEach(function (route) {
      var on = (route.lines || []).some(lineOn);
      if (on) n += 1;
    });
    return n;
  }

  function lineFeatures() {
    var rest = [];
    var hits = [];
    routes.forEach(function (route) {
      var hit = named(route);
      (route.lines || []).forEach(function (line) {
        if (!lineOn(line)) return;
        var feature = {
          type: "Feature",
          properties: {
            id: route.id,
            name: route.name,
            type: line.t,
            hit: hit ? 1 : 0,
            dim: query && !hit ? 1 : 0
          },
          geometry: { type: "LineString", coordinates: line.c }
        };
        (hit ? hits : rest).push(feature);
      });
    });
    return { type: "FeatureCollection", features: rest.concat(hits) };
  }

  function hitBounds() {
    var w = Infinity;
    var s = Infinity;
    var e = -Infinity;
    var n = -Infinity;
    var any = false;
    routes.forEach(function (route) {
      if (!named(route)) return;
      (route.lines || []).forEach(function (line) {
        if (!lineOn(line)) return;
        (line.c || []).forEach(function (p) {
          any = true;
          if (p[0] < w) w = p[0];
          if (p[0] > e) e = p[0];
          if (p[1] < s) s = p[1];
          if (p[1] > n) n = p[1];
        });
      });
    });
    return any ? [[w, s], [e, n]] : null;
  }

  function paint() {
    var n = shownCount();
    if (count) count.textContent = String(n);
    syncMap();
    syncFit();
  }

  function setPressed() {
    if (!tags) return;
    Array.prototype.forEach.call(tags.querySelectorAll("[data-br-type]"), function (btn) {
      var on = btn.getAttribute("data-br-type") === kind;
      btn.classList.toggle("br-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

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

  function syncMap() {
    if (!map || !map.getSource("br-lines")) return;
    map.getSource("br-lines").setData(lineFeatures());
  }

  function syncFit() {
    if (!map) return;
    var key = kind + "\n" + query;
    if (key === fitted) return;
    var hadQuery = fitted.indexOf("\n") !== -1 && fitted.slice(fitted.indexOf("\n") + 1);
    fitted = key;
    var motion = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450;
    if (!query) {
      if (hadQuery) map.fitBounds(CITY, { padding: 28, duration: motion });
      return;
    }
    var box = hitBounds();
    if (box) map.fitBounds(box, { padding: 64, duration: motion, maxZoom: 15 });
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
    if (!name) {
      tip.hidden = true;
      return;
    }
    tip.hidden = false;
    tip.textContent = name;
    tip.style.left = (x + 10) + "px";
    tip.style.top = (y - 8) + "px";
  }

  function startMap() {
    Promise.all([mapLibre(), loadPositron(), loadBoundary()]).then(function (ready) {
      if (map) return;
      var style = JSON.parse(JSON.stringify(ready[1]));
      map = new maplibregl.Map({
        container: mapField.querySelector(".br-map-tiles"),
        style: style,
        bounds: CITY,
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
            "line-width": ["case", ["==", ["get", "hit"], 1], 4, 2.2],
            "line-opacity": ["case", ["==", ["get", "dim"], 1], 0.18, 1]
          }
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
        map.resize();
        syncFit();
      });
    }).catch(function () {
      if (count) count.textContent = "The map did not load.";
    });
  }

  if (tags) {
    tags.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-br-type]") : null;
      if (!btn) return;
      var next = btn.getAttribute("data-br-type");
      kind = kind === next ? "all" : next;
      setPressed();
      paint();
    });
  }

  if (find) {
    find.addEventListener("input", function () {
      query = fold(find.value.trim());
      paint();
    });
  }

  var zoom = mapField.querySelector(".br-map-zoom");
  if (zoom) {
    zoom.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("button") : null;
      if (!btn || !map) return;
      map.zoomTo(map.getZoom() + (+btn.getAttribute("data-z") || 1), { duration: 200 });
    });
  }

  window.addEventListener("resize", function () {
    if (map) map.resize();
  });

  startMap();
  fetch("routes.json?v=20261017d").then(function (res) {
    if (!res.ok) throw new Error("routes");
    return res.json();
  }).then(function (data) {
    routes = data.routes || [];
    paint();
  }).catch(function () {
    if (count) count.textContent = "The routes did not load.";
  });
})();
