/* Bike Routes. One map of every signed Vancouver route. */
(function () {
  var count = document.querySelector(".br-count");
  var mapField = document.getElementById("br-map");
  var tiles = mapField.querySelector(".br-map-tiles");
  var routes = [];
  var map = null;
  var mapTip = null;
  var boundary = null;
  var positron = null;
  var CITY = [[-123.27, 49.198], [-123.02, 49.315]];

  function scrubStyle(style) {
    (style.layers || []).forEach(function (layer) {
      ["paint", "layout"].forEach(function (bag) {
        var obj = layer[bag];
        if (!obj) return;
        Object.keys(obj).forEach(function (key) {
          if (obj[key] == null) delete obj[key];
        });
      });
    });
    return style;
  }

  function lineFeatures() {
    var features = [];
    routes.forEach(function (route) {
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

  function syncLines() {
    if (!map || !map.getSource("br-lines")) return;
    map.getSource("br-lines").setData(lineFeatures());
  }

  function sizeMap() {
    var width = mapField.clientWidth || (mapField.parentNode && mapField.parentNode.clientWidth) || 640;
    var top = mapField.getBoundingClientRect().top;
    var height = Math.max(520, Math.round(window.innerHeight - top - 78));
    mapField.style.height = height + "px";
    if (map) map.resize();
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
      return scrubStyle(style);
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
    sizeMap();
    Promise.all([mapLibre(), loadPositron(), loadBoundary()]).then(function (ready) {
      if (map) return;
      sizeMap();
      var style = JSON.parse(JSON.stringify(ready[1]));
      map = new maplibregl.Map({
        container: tiles,
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
            "line-width": 2.2
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
        syncLines();
      });
    }).catch(function () {
      if (count) count.textContent = "The map did not load.";
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

  window.addEventListener("resize", sizeMap);
  if (window.ResizeObserver) {
    var watcher = new ResizeObserver(function () { if (map) map.resize(); });
    watcher.observe(mapField);
  }

  startMap();
  fetch("routes.json?v=20261017d").then(function (res) {
    if (!res.ok) throw new Error("routes");
    return res.json();
  }).then(function (data) {
    routes = data.routes || [];
    if (count) count.textContent = String(routes.length);
    syncLines();
    sizeMap();
  }).catch(function () {
    if (count) count.textContent = "The routes did not load.";
  });
})();
