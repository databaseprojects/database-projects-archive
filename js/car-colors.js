/* Car colours are read from the published sheet on each visit. No colour list lives in this file.
   The size slider follows Found Photographs. */
(function () {
  var COL_KEY = "ccZoomCols";
  var TONE_KEY = "ccRealWorld";
  var ROWS_KEY = "ccSheetRows";
  var SHEET_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR1RdPX8eQULP_-BojCy1Sxchnj9CNrxUyp1X_674m5Bo6Fa2pecJ2kE4R1pMMAk3B184GqpJ6LhSUF/pub?gid=415065047&single=true&output=csv";
  /* Map privacy. 'block' (default) rounds lat/lon to 3 decimals (~100 m).
     Flip to 'exact' to use the sheet coordinates as recorded. */
  var LOCATION_PRECISION = "block";
  var MIN = 6;
  var MAX = 20;
  var DEF = 6;
  var BIG = 40;
  var SMALL = 14;
  var PHONE_SMALL = 22;
  var HYST = 0.72;
  var REGIONS = ["Kitsilano", "Mount Pleasant", "Commercial Drive", "Gastown", "Dunbar", "Strathcona"];
  var CITY_REGIONS = { Vancouver: REGIONS };
  var city = "Vancouver";
  var CARS = [];
  /* Open on Real world. A saved reading is ignored so an older choice cannot override this. */
  var realOn = true;

  function carsIn(name) {
    return CARS.filter(function (car) { return car.city === name; });
  }

  var stage = document.getElementById("cc-stage");
  var buttons = document.querySelectorAll("[data-cc-mode]");
  var mode = "hue";
  var sizeN = DEF;
  var phone = false;
  var draggingSlider = false;
  var zVal = null;
  var spillGen = 0;
  var pageFill = null;

  function pageBackground(hex) {
    var bg = hex || "";
    document.documentElement.style.background = bg;
    document.body.style.background = bg;
    document.documentElement.classList.toggle("cc-paged", !!hex);
  }

  function removeSpills() {
    var nodes = document.querySelectorAll(".cc-spill");
    var i;
    for (i = 0; i < nodes.length; i++) {
      if (nodes[i].parentNode) nodes[i].parentNode.removeChild(nodes[i]);
    }
  }

  function clearPageColour() {
    spillGen += 1;
    pageFill = null;
    removeSpills();
    pageBackground("");
  }

  /* The fill follows the selected dot: accurate hex in Accurate, real-world hex in Real world. */
  function syncFillToMode() {
    if (!pageFill) return;
    var hex = "";
    var i;
    for (i = 0; i < CARS.length; i++) {
      if (String(CARS[i].i) === String(pageFill.i)) {
        hex = activeHex(CARS[i]);
        break;
      }
    }
    if (!hex) return;
    spillGen += 1;
    removeSpills();
    pageFill.hex = hex;
    pageBackground(hex);
  }

  var SPILL_SOLID = 0.15;

  function spillEase(p) {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    return p * p * (3 - 2 * p);
  }

  function spillRgb(hex) {
    var h = String(hex || "").replace("#", "");
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16)
    };
  }

  function spillFar(cx, cy, vw, vh) {
    var dx = Math.max(cx, vw - cx);
    var dy = Math.max(cy, vh - cy);
    return Math.sqrt(dx * dx + dy * dy);
  }

  function spillFrom(dotEl) {
    var hex = dotEl.dataset.hex;
    if (!hex) return;
    var id = dotEl.dataset.i;
    if (pageFill && pageFill.i === id) {
      clearPageColour();
      return;
    }
    var rect = dotEl.getBoundingClientRect();
    if (!(rect.width > 0)) return;
    spillGen += 1;
    var gen = spillGen;
    pageFill = { i: id, hex: hex };
    removeSpills();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var dotR = rect.width / 2;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var endR = spillFar(cx, cy, vw, vh) / SPILL_SOLID;
    if (!(endR > dotR)) endR = dotR;
    var rgb = spillRgb(hex);
    var ink = "rgb(" + rgb.r + "," + rgb.g + "," + rgb.b + ")";
    var fade = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",0)";
    var spill = document.createElement("div");
    spill.className = "cc-spill";
    spill.style.boxShadow = "none";
    var disk = document.createElement("div");
    disk.className = "cc-spill-disk";
    disk.style.left = cx.toFixed(1) + "px";
    disk.style.top = cy.toFixed(1) + "px";
    disk.style.width = (endR * 2).toFixed(1) + "px";
    disk.style.height = (endR * 2).toFixed(1) + "px";
    disk.style.marginLeft = (-endR).toFixed(1) + "px";
    disk.style.marginTop = (-endR).toFixed(1) + "px";
    var solidStop = Math.round(SPILL_SOLID * 100) + "%";
    disk.style.background = "radial-gradient(circle closest-side, " + ink + " 0%, " + ink + " " + solidStop + ", " + fade + " 100%)";
    disk.style.boxShadow = "none";
    spill.appendChild(disk);
    document.body.appendChild(spill);
    var t0 = performance.now();
    var life = 640;
    var start = dotR / endR;
    function draw(t) {
      var p = t <= 0 ? 0 : t >= life ? 1 : spillEase(t / life);
      var s = start + (1 - start) * p;
      disk.style.transform = "scale(" + s.toFixed(4) + ")";
    }
    function frame(now) {
      if (gen !== spillGen) return;
      var t = now - t0;
      if (t > life) t = life;
      draw(t);
      if (t < life) {
        window.requestAnimationFrame(frame);
        return;
      }
      if (gen !== spillGen) return;
      pageBackground(hex);
      if (spill.parentNode) spill.parentNode.removeChild(spill);
    }
    draw(0);
    window.requestAnimationFrame(frame);
  }

  function phoneSlider() {
    return window.matchMedia("(max-width: 767px)").matches;
  }

  function sliderEnds() {
    return phoneSlider() ? { min: 4, max: 7 } : { min: MIN, max: MAX };
  }

  function clampSlider(n) {
    var ends = sliderEnds();
    n = Math.round(+n);
    if (n < ends.min) return ends.min;
    if (n > ends.max) return ends.max;
    return n;
  }

  /* Left is larger. Hue opens there; Map opens at the small end. */
  function modeSize(next) {
    var ends = sliderEnds();
    if (next === "map") return ends.max;
    if (next === "hue") return ends.min;
    return null;
  }

  function useModeSize(next) {
    var n = modeSize(next);
    if (n == null) return;
    sizeN = clampSlider(n);
    applyMetrics();
    fillSlider(sizeN);
  }

  function storedCols() {
    var n = DEF;
    try {
      n = parseInt(localStorage.getItem(COL_KEY), 10);
    } catch (e) {}
    n = Math.round(+n);
    return n >= MIN && n <= MAX ? n : DEF;
  }

  function saveCols(n) {
    try {
      localStorage.setItem(COL_KEY, String(n));
    } catch (e) {}
  }

  function dotPx() {
    var ends = sliderEnds();
    var t = (sizeN - ends.min) / (ends.max - ends.min);
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    var small = phoneSlider() ? PHONE_SMALL : SMALL;
    return Math.round(BIG + (small - BIG) * t);
  }

  /* Map dots are about 40% smaller than the slider size. Hue stays on dotPx. */
  var MAP_DOT = 0.6;

  function viewPx() {
    var px = dotPx();
    if (mode === "map") return Math.max(1, Math.round(px * MAP_DOT));
    return px;
  }

  function gapPx() {
    return Math.max(8, Math.round(viewPx() * 0.4));
  }

  function applyMetrics() {
    stage.style.setProperty("--cc-dot", viewPx() + "px");
    stage.style.setProperty("--cc-gap", gapPx() + "px");
  }

  function lightness(hex) {
    var n = parseInt(String(hex || "").replace("#", ""), 16);
    if (!isFinite(n)) return 0;
    var r = (n >> 16) & 255;
    var g = (n >> 8) & 255;
    var b = n & 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }

  function hueOf(hex) {
    var n = parseInt(String(hex || "").replace("#", ""), 16);
    if (!isFinite(n)) return null;
    var r = ((n >> 16) & 255) / 255;
    var g = ((n >> 8) & 255) / 255;
    var b = (n & 255) / 255;
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    if (max - min < 0.06) return null;
    var h;
    var d = max - min;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
    return h;
  }

  function normHex(raw) {
    var s = String(raw || "").trim();
    if (!s) return "";
    if (s.charAt(0) !== "#") s = "#" + s;
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
      s = "#" + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2) + s.charAt(3) + s.charAt(3);
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(s)) return "";
    return s.toUpperCase();
  }

  function parseCsv(text) {
    var rows = [];
    var row = [];
    var cell = "";
    var q = false;
    var i;
    for (i = 0; i < text.length; i++) {
      var c = text.charAt(i);
      if (q) {
        if (c === '"') {
          if (text.charAt(i + 1) === '"') { cell += '"'; i += 1; }
          else q = false;
        } else cell += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (c !== "\r") cell += c;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function headerIndex(headers, names, fallback) {
    var i;
    var n;
    for (i = 0; i < headers.length; i++) {
      var h = String(headers[i] || "").trim().toLowerCase();
      for (n = 0; n < names.length; n++) {
        if (h === names[n]) return i;
      }
    }
    return fallback;
  }

  function parseCoord(raw) {
    if (raw == null || raw === "") return null;
    var n = parseFloat(String(raw).trim());
    return isFinite(n) ? n : null;
  }

  function applyLocationPrecision(lat, lng) {
    if (LOCATION_PRECISION === "exact") return { lat: lat, lng: lng };
    return {
      lat: Math.round(lat * 1000) / 1000,
      lng: Math.round(lng * 1000) / 1000
    };
  }

  function rowsFromCsv(text) {
    var rows = parseCsv(text);
    if (!rows.length) return [];
    var head = rows[0];
    var iDate = headerIndex(head, ["date"], 1);
    var iTime = headerIndex(head, ["time (local pt)", "time"], 2);
    var iAcc = headerIndex(head, ["accurate hex"], 3);
    var iLat = headerIndex(head, ["latitude (optional, from photo exif)", "latitude"], 8);
    var iLng = headerIndex(head, ["longitude (optional)", "longitude"], 9);
    var iReal = headerIndex(head, ["real world hex"], 10);
    var out = [];
    var r;
    for (r = 1; r < rows.length; r++) {
      var cols = rows[r];
      var accurate = normHex(cols[iAcc]);
      var real = normHex(cols[iReal]);
      if (!accurate && !real) continue;
      if (!accurate) accurate = real;
      if (!real) real = accurate;
      var lat = parseCoord(cols[iLat]);
      var lng = parseCoord(cols[iLng]);
      if (lat == null || lng == null) {
        lat = null;
        lng = null;
      }
      out.push({
        accurate: accurate,
        real: real,
        date: String(cols[iDate] || "").trim(),
        time: String(cols[iTime] || "").trim(),
        lat: lat,
        lng: lng
      });
    }
    return out;
  }

  function carsFromRows(rows) {
    var out = [];
    var r;
    for (r = 0; r < rows.length; r++) {
      var row = rows[r] || {};
      var accurate = normHex(row.accurate);
      var real = normHex(row.real);
      if (!accurate && !real) continue;
      if (!accurate) accurate = real;
      if (!real) real = accurate;
      var shown = realOn && real ? real : accurate;
      var lat = typeof row.lat === "number" && isFinite(row.lat) ? row.lat : null;
      var lng = typeof row.lng === "number" && isFinite(row.lng) ? row.lng : null;
      var loc = null;
      if (lat != null && lng != null) loc = applyLocationPrecision(lat, lng);
      out.push({
        i: out.length,
        family: "",
        accurate: accurate,
        real: real,
        hex: shown,
        hue: hueOf(shown),
        metallic: false,
        date: String(row.date || "").trim(),
        time: String(row.time || "").trim(),
        lat: loc ? loc.lat : null,
        lng: loc ? loc.lng : null,
        region: REGIONS[out.length % REGIONS.length],
        city: "Vancouver"
      });
    }
    return out;
  }

  function readCachedRows() {
    try {
      var raw = localStorage.getItem(ROWS_KEY);
      if (!raw) return null;
      var rows = JSON.parse(raw);
      return Array.isArray(rows) ? rows : null;
    } catch (e) {
      return null;
    }
  }

  function writeCachedRows(rows) {
    try { localStorage.setItem(ROWS_KEY, JSON.stringify(rows)); } catch (e) {}
  }

  function sheetText() {
    var pending = window.__ccSheet;
    if (pending && typeof pending.then === "function") {
      window.__ccSheet = null;
      return pending;
    }
    return fetch(SHEET_CSV, { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("sheet");
      return res.text();
    });
  }

  function loadSheet() {
    var cached = readCachedRows();
    var had = !!(cached && cached.length);
    var cachedSig = JSON.stringify(cached);
    if (had) {
      CARS = carsFromRows(cached);
      render();
    }
    return sheetText().then(function (text) {
      var rows = rowsFromCsv(text);
      if (JSON.stringify(rows) === cachedSig) return;
      writeCachedRows(rows);
      CARS = carsFromRows(rows);
      render();
    }).catch(function () {
      if (had) {
        try { console.warn("Car Colours sheet did not load. Showing the last saved colours."); } catch (e) {}
        return;
      }
      CARS = [];
      try { console.warn("Car Colours sheet did not load. Showing the page without dots."); } catch (e) {}
      render();
    });
  }

  function activeHex(car) {
    if (realOn && car.real) return car.real;
    return car.accurate || car.hex;
  }

  function labelFor(car) {
    var when = [car.date, car.time].filter(Boolean).join(" ");
    var hex = activeHex(car);
    return when ? when + ", " + hex : hex;
  }

  function dot(car) {
    var el = document.createElement("span");
    var hex = activeHex(car);
    el.className = "cc-dot";
    el.style.background = hex;
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", labelFor(car));
    el.dataset.family = car.family || "";
    el.dataset.metallic = car.metallic ? "metallic" : "flat";
    el.dataset.region = car.region || "";
    el.dataset.hex = hex;
    el.dataset.accurate = car.accurate || "";
    el.dataset.real = car.real || "";
    el.dataset.date = car.date || "";
    el.dataset.time = car.time || "";
    el.dataset.i = String(car.i);
    if (car.hue == null) el.dataset.hue = "";
    else el.dataset.hue = String(car.hue);
    return el;
  }

  function paintDots() {
    var nodes = document.querySelectorAll(".cc-dot");
    var i;
    for (i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var car = CARS[+el.dataset.i];
      if (!car) continue;
      var hex = activeHex(car);
      car.hex = hex;
      car.hue = hueOf(hex);
      el.style.background = hex;
      el.dataset.hex = hex;
      el.setAttribute("aria-label", labelFor(car));
      if (car.hue == null) el.dataset.hue = "";
      else el.dataset.hue = String(car.hue);
    }
  }

  function clear(node) {
    if (node === stage) destroyBasemap();
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, rng) {
    var copy = list.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function growFromCenter(prevPx, px) {
    var shift = (prevPx - px) / 2;
    if (!(Math.abs(shift) > 0.01)) return;
    Array.prototype.forEach.call(stage.querySelectorAll(".cc-dot"), function (el) {
      if (!el.style.left && !el.style.top) return;
      var x = (parseFloat(el.style.left) || 0) + shift;
      var y = (parseFloat(el.style.top) || 0) + shift;
      el.style.left = x.toFixed(3) + "px";
      el.style.top = y.toFixed(3) + "px";
    });
  }

  function regionColumns(width) {
    if (width >= 900) return 3;
    if (width >= 560) return 2;
    return 1;
  }

  function clump(count, maxW) {
    var golden = Math.PI * (3 - Math.sqrt(5));
    var spacing = dotPx() + 10;
    function measure(space) {
      var minX = Infinity;
      var minY = Infinity;
      var maxX = -Infinity;
      var maxY = -Infinity;
      var pts = [];
      var i;
      for (i = 0; i < count; i++) {
        var radius = i === 0 ? 0 : space * Math.sqrt(i);
        var angle = i * golden;
        var x = Math.cos(angle) * radius;
        var y = Math.sin(angle) * radius;
        pts.push({ x: x, y: y });
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
      return {
        pts: pts,
        minX: minX,
        minY: minY,
        w: maxX - minX + dotPx() + 4,
        h: maxY - minY + dotPx() + 4
      };
    }
    var pack = measure(spacing);
    while (spacing > dotPx() + 4 && pack.w > maxW) {
      spacing -= 0.5;
      pack = measure(spacing);
    }
    pack.pts.forEach(function (p) {
      p.x = p.x - pack.minX + 2;
      p.y = p.y - pack.minY + 2;
    });
    pack.spacing = spacing;
    return pack;
  }

  function renderRegion() {
    clear(stage);
    var view = document.createElement("div");
    view.className = "cc-region-view";
    var width = Math.max(160, stage.clientWidth);
    var cols = regionColumns(width);
    var gap = 22;
    var colW = (width - gap * (cols - 1)) / cols;
    var here = carsIn(city);
    var wrap = document.createElement("div");
    wrap.className = "cc-regions";
    (CITY_REGIONS[city] || REGIONS).forEach(function (name) {
      var group = here.filter(function (car) { return car.region === name; });
      if (!group.length) return;
      var pack = clump(group.length, Math.max(dotPx() + 4, colW - 4));
      var block = document.createElement("section");
      block.className = "cc-cluster";
      var field = document.createElement("div");
      field.className = "cc-cluster-field";
      field.style.width = Math.ceil(pack.w) + "px";
      field.style.height = Math.ceil(pack.h) + "px";
      group.forEach(function (car, i) {
        var el = dot(car);
        el.style.left = pack.pts[i].x + "px";
        el.style.top = pack.pts[i].y + "px";
        field.appendChild(el);
      });
      var heading = document.createElement("h2");
      heading.className = "cc-label";
      heading.textContent = name;
      heading.style.marginTop = "0.55rem";
      block.appendChild(field);
      block.appendChild(heading);
      wrap.appendChild(block);
    });
    view.appendChild(wrap);
    stage.appendChild(view);
  }

  /* Dot positions follow these Vancouver street paths.
     The picture under them is OpenFreeMap Positron, with labels removed
     and a faint tint on water and parks. */
  var MAP_WEST = -123.27;
  var MAP_EAST = -123.02;
  var MAP_NORTH = 49.35;
  var MAP_SOUTH = 49.2;
  var ccBasemap = null;
  var mapFadeTimer = 0;
  var mapFlight = null;

  function cancelMapFade() {
    if (!mapFadeTimer) return;
    window.clearTimeout(mapFadeTimer);
    mapFadeTimer = 0;
  }

  function revealMap(field) {
    cancelMapFade();
    if (!field || !field.isConnected || field.classList.contains("cc-map-in")) return;
    projectStreetDots(field);
    releaseMapFlight(field);
    field.classList.add("cc-map-in");
  }

  function armMapFade(field) {
    cancelMapFade();
    mapFadeTimer = window.setTimeout(function () { revealMap(field); }, 1500);
  }

  function destroyBasemap() {
    cancelMapFade();
    if (!ccBasemap) return;
    ccBasemap.remove();
    ccBasemap = null;
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

  var positronStyle = null;

  function loadPositron() {
    if (!positronStyle) {
      positronStyle = fetch("https://tiles.openfreemap.org/styles/positron")
        .then(function (res) { return res.json(); })
        .then(tintStyle);
    }
    return positronStyle;
  }

  function mountBasemap(field) {
    var el = document.createElement("div");
    el.className = "cc-map-tiles";
    el.setAttribute("aria-hidden", "true");
    field.insertBefore(el, field.firstChild);
    armMapFade(field);
    if (!window.maplibregl) {
      revealMap(field);
      return;
    }
    var token = {};
    el._ccToken = token;
    loadPositron().then(function (style) {
      if (el._ccToken !== token || !el.isConnected) return;
      var map = new maplibregl.Map({
        container: el,
        style: JSON.parse(JSON.stringify(style)),
        bounds: [[MAP_WEST, MAP_SOUTH], [MAP_EAST, MAP_NORTH]],
        fitBoundsOptions: { padding: 0, animate: false },
        interactive: false,
        attributionControl: false,
        fadeDuration: 0,
        preserveDrawingBuffer: true,
        failIfMajorPerformanceCaveat: false
      });
      ccBasemap = map;
      function place() {
        if (el._ccToken !== token) return;
        projectStreetDots(field);
      }
      map.on("load", function () {
        if (el._ccToken !== token) return;
        map.resize();
        map.fitBounds([[MAP_WEST, MAP_SOUTH], [MAP_EAST, MAP_NORTH]], { padding: 0, animate: false });
        place();
        function whenTiles() {
          if (el._ccToken !== token) return;
          if (map.areTilesLoaded && !map.areTilesLoaded()) return;
          revealMap(field);
        }
        whenTiles();
        map.on("idle", whenTiles);
      });
      map.on("move", place);
      map.on("resize", place);
    }).catch(function () { revealMap(field); });
  }

  /* Approximate Vancouver arterials, [lng, lat]. Mock positions on real streets. */
  var STREET_LL = [
    [[-123.1855, 49.220], [-123.1855, 49.270]],
    [[-123.1680, 49.218], [-123.1680, 49.270]],
    [[-123.1525, 49.214], [-123.1525, 49.268]],
    [[-123.1386, 49.210], [-123.1386, 49.268]],
    [[-123.1275, 49.210], [-123.1275, 49.268]],
    [[-123.1148, 49.210], [-123.1148, 49.272]],
    [[-123.1005, 49.210], [-123.1005, 49.282]],
    [[-123.0900, 49.210], [-123.0900, 49.270]],
    [[-123.0765, 49.210], [-123.0765, 49.270]],
    [[-123.0693, 49.210], [-123.0693, 49.276]],
    [[-123.0560, 49.210], [-123.0560, 49.268]],
    [[-123.0450, 49.210], [-123.0450, 49.268]],
    [[-123.205, 49.2680], [-123.140, 49.2680]],
    [[-123.205, 49.2634], [-123.045, 49.2634]],
    [[-123.200, 49.2570], [-123.070, 49.2570]],
    [[-123.195, 49.2493], [-123.055, 49.2493]],
    [[-123.190, 49.2415], [-123.050, 49.2415]],
    [[-123.195, 49.2340], [-123.040, 49.2340]],
    [[-123.185, 49.2262], [-123.040, 49.2262]],
    [[-123.150, 49.2120], [-123.070, 49.2120]],
    [[-123.1430, 49.285], [-123.1430, 49.291]],
    [[-123.1290, 49.274], [-123.1290, 49.288]],
    [[-123.138, 49.2795], [-123.115, 49.2795]],
    [[-123.133, 49.2755], [-123.120, 49.2755]],
    [[-123.120, 49.2816], [-123.050, 49.2816]]
  ];

  function streetLngLats(count) {
    var segs = [];
    var total = 0;
    var cos = Math.cos(49.26 * Math.PI / 180);
    STREET_LL.forEach(function (line) {
      var i;
      for (i = 1; i < line.length; i++) {
        var a = line[i - 1];
        var b = line[i];
        var len = Math.hypot((b[0] - a[0]) * cos, b[1] - a[1]);
        if (len < 1e-6) continue;
        segs.push({ a: a, b: b, len: len });
        total += len;
      }
    });
    var pts = [];
    if (!count || !total) return pts;
    var step = total / count;
    var walk = step * 0.5;
    var acc = 0;
    var si = 0;
    while (pts.length < count && si < segs.length) {
      var seg = segs[si];
      if (acc + seg.len < walk) {
        acc += seg.len;
        si += 1;
        continue;
      }
      var u = (walk - acc) / seg.len;
      pts.push([
        seg.a[0] + (seg.b[0] - seg.a[0]) * u,
        seg.a[1] + (seg.b[1] - seg.a[1]) * u
      ]);
      walk += step;
    }
    return pts;
  }

  function assignStreetDots(field) {
    Array.prototype.forEach.call(field.querySelectorAll(".cc-dot"), function (el) {
      var car = CARS[+el.dataset.i];
      if (!car || car.lat == null || car.lng == null) return;
      el.dataset.lng = String(car.lng);
      el.dataset.lat = String(car.lat);
      el.style.visibility = "hidden";
    });
  }

  function projectStreetDots(field) {
    if (!ccBasemap || !field) return;
    var size = viewPx();
    Array.prototype.forEach.call(field.querySelectorAll(".cc-dot"), function (el) {
      if (!el.dataset.lng) return;
      var p = ccBasemap.project([+el.dataset.lng, +el.dataset.lat]);
      var left = (p.x - size / 2).toFixed(1) + "px";
      var top = (p.y - size / 2).toFixed(1) + "px";
      if (mapFlight) {
        el.dataset.mx = left;
        el.dataset.my = top;
        return;
      }
      el.style.left = left;
      el.style.top = top;
      el.style.visibility = "visible";
    });
    if (mapFlight && field.classList.contains("cc-map-in")) releaseMapFlight(field);
  }

  function parkMapDots(field) {
    if (!mapFlight) return;
    var box = field.getBoundingClientRect();
    var size = viewPx();
    Array.prototype.forEach.call(field.querySelectorAll(".cc-dot"), function (el) {
      var a = mapFlight.get(el.dataset.i);
      if (!a) return;
      el.style.left = (a.left + a.width / 2 - box.left - size / 2).toFixed(1) + "px";
      el.style.top = (a.top + a.height / 2 - box.top - size / 2).toFixed(1) + "px";
      el.style.visibility = "visible";
      if (a.width > 0 && size > 0 && Math.abs(a.width - size) > 0.5) {
        el.style.transform = "scale(" + (a.width / size).toFixed(4) + ")";
      }
    });
  }

  function releaseMapFlight(field) {
    if (!mapFlight || !field) return;
    var from = mapFlight;
    var ready = false;
    Array.prototype.forEach.call(field.querySelectorAll(".cc-dot"), function (el) {
      if (!el.dataset.mx) return;
      ready = true;
      el.style.left = el.dataset.mx;
      el.style.top = el.dataset.my;
      el.style.visibility = "visible";
    });
    if (!ready) return;
    mapFlight = null;
    slideInto(from);
  }

  function renderMap() {
    clear(stage);
    var width = Math.max(280, stage.clientWidth);
    var height = Math.max(640, Math.round(width * 100 / 120));
    var field = document.createElement("div");
    field.className = "cc-map";
    field.style.height = height + "px";
    var credit = document.createElement("p");
    credit.className = "cc-map-credit";
    credit.textContent = "© OpenStreetMap";
    field.appendChild(credit);
    var rng = mulberry32(0x5A11);
    var mapped = carsIn("Vancouver").filter(function (car) {
      return car.lat != null && car.lng != null;
    });
    shuffle(mapped, rng).forEach(function (car) {
      field.appendChild(dot(car));
    });
    stage.appendChild(field);
    assignStreetDots(field);
    parkMapDots(field);
    mountBasemap(field);
  }


  function hueOrder(a, b) {
    var aNeutral = a.hue == null;
    var bNeutral = b.hue == null;
    if (aNeutral !== bNeutral) return aNeutral ? 1 : -1;
    if (!aNeutral) {
      var ah = (a.hue + 15) % 360;
      var bh = (b.hue + 15) % 360;
      if (ah !== bh) return ah - bh;
    }
    return lightness(a.hex) - lightness(b.hex);
  }

  function renderHue() {
    clear(stage);
    var width = Math.max(160, stage.clientWidth);
    var gap = gapPx();
    var size = dotPx();
    var cols = Math.max(1, Math.floor((width + gap) / (size + gap)));
    var sorted = carsIn(city).slice().sort(hueOrder);
    var wrap = document.createElement("div");
    wrap.className = "cc-hue";
    wrap.style.gridTemplateColumns = "repeat(" + cols + ", " + size + "px)";
    wrap.style.gridAutoRows = size + "px";
    wrap.style.gap = gap + "px";
    sorted.forEach(function (car, i) {
      var row = Math.floor(i / cols);
      var col = i % cols;
      var el = dot(car);
      el.style.gridRow = String(row + 1);
      el.style.gridColumn = String(col + 1);
      wrap.appendChild(el);
    });
    stage.appendChild(wrap);
  }

  function render() {
    applyMetrics();
    if (mode !== "map") mapFlight = null;
    if (mode === "region") renderRegion();
    else if (mode === "map") renderMap();
    else renderHue();
  }

  function sliderEl() {
    return document.querySelector(".cc-zslider");
  }

  function fillSlider(v) {
    var s = sliderEl();
    if (!s) return;
    var ends = sliderEnds();
    s.min = String(ends.min);
    s.max = String(ends.max);
    s.title = "Size (" + ends.min + " – " + ends.max + ") — left is larger";
    if (draggingSlider) return;
    s.style.setProperty("--cc-p", (((v - ends.min) / (ends.max - ends.min)) * 100).toFixed(2) + "%");
    if (+s.value !== v) s.value = String(v);
  }

  function syncButtons() {
    buttons.forEach(function (button) {
      var on = button.getAttribute("data-cc-mode") === mode;
      button.classList.toggle("cc-icon-on", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
    document.querySelectorAll(".cc-city").forEach(function (button) {
      var on = button.getAttribute("data-cc-city") === city;
      button.classList.toggle("cc-on", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
    var tone = document.querySelector(".cc-tone");
    if (tone) tone.classList.toggle("cc-real", !!realOn);
    var toneSwitch = document.querySelector(".cc-switch");
    if (toneSwitch) toneSwitch.setAttribute("aria-pressed", realOn ? "true" : "false");
    document.querySelectorAll("[data-cc-tone]").forEach(function (button) {
      var on = (button.getAttribute("data-cc-tone") === "real") === !!realOn;
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }


  function pick(v, current) {
    var ends = sliderEnds();
    v = +v;
    if (!(v >= ends.min)) v = ends.min;
    if (v > ends.max) v = ends.max;
    return Math.abs(v - current) < HYST ? current : clampSlider(v);
  }

  function valueFromClientX(s, clientX) {
    var rect = s.getBoundingClientRect();
    var span = rect.width || 1;
    var thumb = 14;
    var usable = Math.max(1, span - thumb);
    var t = (clientX - rect.left - thumb / 2) / usable;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    var ends = sliderEnds();
    s.style.setProperty("--cc-p", (t * 100).toFixed(2) + "%");
    return pick(ends.min + t * (ends.max - ends.min), zVal != null ? zVal : sizeN);
  }


  function snapshotDots() {
    var map = new Map();
    Array.prototype.forEach.call(stage.querySelectorAll(".cc-dot"), function (el) {
      var r = el.getBoundingClientRect();
      if (r.width) map.set(el.dataset.i, { left: r.left, top: r.top, width: r.width, height: r.height });
    });
    return map;
  }

  function slideInto(before) {
    if (!before) return;
    void stage.offsetWidth;
    var items = Array.prototype.slice.call(stage.querySelectorAll(".cc-dot"));
    var step = Math.min(20, 480 / Math.max(items.length, 1));
    var k = 0;
    items.forEach(function (el) {
      var a = before.get(el.dataset.i);
      if (!a) return;
      (el.getAnimations ? el.getAnimations() : []).forEach(function (an) {
        if (an.id === "cc-flow") an.cancel();
      });
      el.style.transform = "";
      var b = el.getBoundingClientRect();
      var layout = el.offsetWidth || b.width;
      if (!layout) return;
      var dx = a.left + a.width / 2 - (b.left + b.width / 2);
      var dy = a.top + a.height / 2 - (b.top + b.height / 2);
      var scale = a.width / layout;
      if (!isFinite(scale) || scale <= 0) scale = 1;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(scale - 1) < 0.04) return;
      var mid = scale + (1 - scale) * 0.82;
      var anim = el.animate(
        [
          { transform: "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px) scale(" + scale.toFixed(4) + ")" },
          { transform: "translate(" + (dx * 0.04).toFixed(1) + "px," + (dy * 0.04 - 2).toFixed(1) + "px) scale(" + mid.toFixed(4) + ")", offset: 0.82 },
          { transform: "none" }
        ],
        { duration: 480, delay: k++ * step, easing: "cubic-bezier(.22,.8,.25,1)", fill: "both" }
      );
      anim.id = "cc-flow";
    });
  }


  function applySize(n) {
    n = clampSlider(n);
    var prevPx = viewPx();
    sizeN = n;
    var px = viewPx();
    applyMetrics();
    fillSlider(n);
    if (stage.querySelector(".cc-dot")) {
      if (Math.abs(prevPx - px) > 0.5) growFromCenter(prevPx, px);
      return;
    }
    render();
  }

  buttons.forEach(function (button) {
    button.addEventListener("click", function () {
      clearPageColour();
      if (draggingSlider) return;
      var next = button.getAttribute("data-cc-mode");
      if (next === "map") city = "Vancouver";
      if (next === mode) return;
      var before = snapshotDots();
      mode = next;
      if (next === "map") mapFlight = before;
      syncButtons();
      useModeSize(next);
      render();
      if (next !== "map") slideInto(before);
    });
  });

  document.querySelectorAll("[data-cc-tone], .cc-switch").forEach(function (button) {
    button.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var next = button.classList.contains("cc-switch") ? !realOn : button.getAttribute("data-cc-tone") === "real";
      if (next === realOn) return;
      realOn = next;
      try { localStorage.setItem(TONE_KEY, realOn ? "1" : "0"); } catch (err) {}
      syncButtons();
      if (stage.querySelector(".cc-dot")) paintDots();
      else render();
      syncFillToMode();
    });
  });

  var pop = document.createElement("div");
  pop.className = "cc-pop";
  pop.hidden = true;
  pop.innerHTML = '<span class="cc-pop-chip" aria-hidden="true"></span><span class="cc-pop-copy"></span>';
  document.body.appendChild(pop);

  function showPop(el) {
    var acc = el.dataset.accurate || "";
    var real = el.dataset.real || "";
    if (!acc && !real) return;
    var when = [el.dataset.date, el.dataset.time].filter(Boolean).join(" ");
    var lines = [];
    if (acc) lines.push(acc);
    if (real && real !== acc) lines.push(real);
    if (when) lines.push(when);
    pop.querySelector(".cc-pop-chip").style.background = acc || real;
    pop.querySelector(".cc-pop-copy").textContent = lines.join("\n");
    pop.hidden = false;
    var rect = el.getBoundingClientRect();
    var width = 148;
    var left = rect.right + 8;
    var top = rect.top + rect.height / 2 - 18;
    if (left + width > window.innerWidth - 8) left = Math.max(8, rect.left - width - 8);
    if (top < 8) top = 8;
    pop.style.left = left + "px";
    pop.style.top = top + "px";
  }

  document.addEventListener("pointerover", function (e) {
    var el = e.target.closest && e.target.closest(".cc-dot");
    if (el) showPop(el);
  });
  document.addEventListener("pointerout", function (e) {
    var el = e.target.closest && e.target.closest(".cc-dot");
    if (!el) return;
    var next = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(".cc-dot");
    if (next !== el) pop.hidden = true;
  });
  document.addEventListener("pointerdown", function (e) {
    var el = e.target.closest && e.target.closest(".cc-dot");
    if (el) showPop(el);
  });

  document.querySelectorAll(".cc-city").forEach(function (button) {
    button.addEventListener("click", function () {
      clearPageColour();
      if (draggingSlider) return;
      var name = button.getAttribute("data-cc-city");
      if (name === city) return;
      var before = snapshotDots();
      city = name;
      syncButtons();
      render();
      slideInto(before);
    });
  });

  document.addEventListener("click", function (e) {
    if (draggingSlider) return;
    var dotEl = e.target.closest && e.target.closest(".cc-dot");
    if (dotEl && dotEl.dataset.hex) {
      spillFrom(dotEl);
      return;
    }
    if (e.target.closest && (e.target.closest("[data-cc-mode]") || e.target.closest(".cc-city") || e.target.closest(".cc-zslider"))) {
      clearPageColour();
    }
  });


  function isSlider(t) {
    return t && t.classList && t.classList.contains("cc-zslider");
  }

  document.addEventListener("pointerdown", function (e) {
    if (!isSlider(e.target)) return;
    clearPageColour();
    draggingSlider = true;
    document.documentElement.classList.add("cc-sizing");
    var n = valueFromClientX(e.target, e.clientX);
    if (n !== sizeN) {
      zVal = n;
      applySize(n);
    }
  }, true);

  document.addEventListener("pointermove", function (e) {
    if (!draggingSlider) return;
    var s = isSlider(e.target) ? e.target : sliderEl();
    if (!s) return;
    var n = valueFromClientX(s, e.clientX);
    if (n !== sizeN) {
      zVal = n;
      applySize(n);
    }
  }, true);

  function endSlider() {
    if (!draggingSlider) return;
    var n = zVal != null ? zVal : sizeN;
    zVal = null;
    draggingSlider = false;
    document.documentElement.classList.remove("cc-sizing");
    applySize(n);
    if (!phoneSlider()) saveCols(n);
  }

  document.addEventListener("pointerup", endSlider, true);
  document.addEventListener("pointercancel", endSlider, true);
  window.addEventListener("blur", endSlider);

  document.addEventListener("input", function (e) {
    if (!isSlider(e.target)) return;
    if (draggingSlider) return;
    var k = clampSlider(e.target.value);
    if (!phoneSlider()) saveCols(k);
    applySize(k);
  });

  phone = phoneSlider();
  applySize(modeSize(mode));
  syncButtons();
  loadSheet();

  var resizeTimer = 0;
  window.addEventListener("resize", function () {
    if (draggingSlider) return;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      var nowPhone = phoneSlider();
      if (nowPhone !== phone) {
        phone = nowPhone;
        applySize(nowPhone ? 4 : storedCols());
        return;
      }
      if (mode !== "family") render();
    }, 80);
  });
})();

(function () {
  var about = document.querySelector(".cc-about");
  var toggle = document.getElementById("cc-about-toggle");
  var panel = document.getElementById("cc-about-panel");
  if (!about || !toggle || !panel) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hideTimer = 0;

  function finishClose() {
    if (!about.classList.contains("cc-open")) panel.hidden = true;
  }

  toggle.addEventListener("click", function () {
    var open = !about.classList.contains("cc-open");
    window.clearTimeout(hideTimer);
    if (open) {
      panel.hidden = false;
      panel.setAttribute("aria-hidden", "false");
      toggle.setAttribute("aria-expanded", "true");
      if (reduce) {
        about.classList.add("cc-open");
        return;
      }
      panel.getBoundingClientRect();
      about.classList.add("cc-open");
      return;
    }
    about.classList.remove("cc-open");
    toggle.setAttribute("aria-expanded", "false");
    panel.setAttribute("aria-hidden", "true");
    if (reduce) {
      panel.hidden = true;
      return;
    }
    hideTimer = window.setTimeout(finishClose, 480);
  });

  panel.addEventListener("transitionend", function (e) {
    if (e.target !== panel || e.propertyName !== "grid-template-rows") return;
    window.clearTimeout(hideTimer);
    finishClose();
  });
})();

(function () {
  var KEY = "ccTagsOpen";
  var root = document.documentElement;
  function sync() {
    var open = root.classList.contains("cc-tags-open");
    var btn = document.getElementById("cc-tags-toggle");
    var drop = document.getElementById("cc-tagdrop");
    if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (drop) drop.setAttribute("aria-hidden", open ? "false" : "true");
  }
  sync();
  var btn = document.getElementById("cc-tags-toggle");
  if (!btn) return;
  btn.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();
    var open = !root.classList.contains("cc-tags-open");
    root.classList.add("cc-tags-motion");
    root.classList.toggle("cc-tags-open", open);
    try { localStorage.setItem(KEY, open ? "1" : "0"); } catch (err) {}
    sync();
  });
})();
