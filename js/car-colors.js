/* Car colours are read from the published sheet on each visit. No colour list lives in this file.
   The size slider follows Found Photographs. */
(function () {
  var COL_KEY = "ccZoomCols";
  var TONE_KEY = "ccRealWorld";
  var ROWS_KEY = "ccSheetRows";
  var SHEET_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR1RdPX8eQULP_-BojCy1Sxchnj9CNrxUyp1X_674m5Bo6Fa2pecJ2kE4R1pMMAk3B184GqpJ6LhSUF/pub?gid=415065047&single=true&output=csv";
  /* Map dots sit on the sheet latitude and longitude. Those numbers stay off the page. */
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
  /* Neighbourhood names keyed by city. Picks under different cities stay on together.
     A city tag with an empty list means every scan in that city. */
  var areaPick = {};
  var cityOn = {};
  var AREAS = [];
  /* Standing rule: every selectable area, city or neighbourhood, draws the same
     subtle white mask outside its own boundary when selected on Map.
     A city with no neighbourhood picks uses that city's ring. Neighbourhood
     picks use those neighbourhood exteriors. With nothing selected, the
     current city's ring stays. */
  var CITY_LINES = {};
  /* Open on Real world. A saved reading is ignored so an older choice cannot override this. */
  var realOn = true;

  function carsIn(name) {
    return CARS.filter(function (car) { return car.city === name; });
  }

  function pointInRing(x, y, ring) {
    var inside = false;
    var n = ring.length;
    var j = n - 1;
    var i;
    for (i = 0; i < n; i++) {
      var xi = ring[i][0];
      var yi = ring[i][1];
      var xj = ring[j][0];
      var yj = ring[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-15) + xi) inside = !inside;
      j = i;
    }
    return inside;
  }

  function areaAt(lat, lng) {
    if (lat == null || lng == null || !AREAS.length) return "";
    var i, p, h;
    for (i = 0; i < AREAS.length; i++) {
      var polys = AREAS[i].polys;
      for (p = 0; p < polys.length; p++) {
        var rings = polys[p];
        if (!rings.length || !pointInRing(lng, lat, rings[0])) continue;
        var hole = false;
        for (h = 1; h < rings.length; h++) {
          if (pointInRing(lng, lat, rings[h])) { hole = true; break; }
        }
        if (!hole) return AREAS[i].name;
      }
    }
    return "";
  }

  function cityPicks(name) {
    var list = areaPick[name || city];
    return list ? list.slice() : [];
  }

  function setCityPicks(name, list) {
    if (list && list.length) areaPick[name] = list.slice();
    else delete areaPick[name];
  }

  function anyPicks() {
    var keys = Object.keys(areaPick);
    var i;
    for (i = 0; i < keys.length; i++) {
      if (areaPick[keys[i]] && areaPick[keys[i]].length) return true;
    }
    return false;
  }

  function cityChosen() {
    var keys = Object.keys(cityOn);
    var i;
    for (i = 0; i < keys.length; i++) {
      if (cityOn[keys[i]]) return true;
    }
    return false;
  }

  function shownCars() {
    if (!cityChosen() && !anyPicks()) return carsIn(city);
    return CARS.filter(function (car) {
      var list = areaPick[car.city] || [];
      var whole = !!cityOn[car.city];
      if (!whole && !list.length) return false;
      if (!list.length) return true;
      var i;
      for (i = 0; i < list.length; i++) {
        if (list[i] === car.area) return true;
      }
      return false;
    });
  }

  function areasInUse() {
    var seen = {};
    var names = [];
    carsIn(city).forEach(function (car) {
      if (!car.area || seen[car.area]) return;
      seen[car.area] = 1;
      names.push(car.area);
    });
    names.sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; });
    return names;
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
    if (pop) pop.hidden = true;
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
    if (pageFill && String(pageFill.i) === String(id)) {
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
    return Shared.isPhone();
  }

  function sliderEnds() {
    return phoneSlider() ? { min: 4, max: 7 } : { min: MIN, max: MAX };
  }

  function clampSlider(n) {
    var ends = sliderEnds();
    return Shared.clampRange(n, ends.min, ends.max);
  }

  /* Left is larger. Hue and Cluster open there; Map opens at the small end. */
  function modeSize(next) {
    var ends = sliderEnds();
    if (next === "map") return ends.max;
    if (next === "hue" || next === "cluster") return ends.min;
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
    return Shared.clampCount(n, MIN, MAX, DEF);
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

  /* Map dots are about 40% smaller than the slider size, then halved on every screen.
     Phones halve once more. Map dots never go under 3px. Hue stays on dotPx. */
  var MAP_DOT = 0.6;
  var PHONE_MAP_DOT = 0.5;
  var MAP_HALF = 0.5;
  var MAP_MIN = 3;

  function mapBasePx() {
    var px = dotPx();
    var mapPx = Math.max(1, Math.round(px * MAP_DOT));
    if (phoneSlider()) mapPx = mapPx * PHONE_MAP_DOT;
    return Math.max(MAP_MIN, mapPx * MAP_HALF);
  }

  /* Zoom grows dots slower than the map: base * sqrt(scale). Never under the
     unzoomed map size, and never past the Hue dot size. */
  function mapZoomScale() {
    if (!ccBasemap || mapBaseZoom == null) return 1;
    var scale = Math.pow(2, ccBasemap.getZoom() - mapBaseZoom);
    if (!(scale > 0) || !isFinite(scale)) return 1;
    return scale;
  }

  function viewPx() {
    var px = dotPx();
    if (mode !== "map") return px;
    var base = mapBasePx();
    var grown = base * Math.sqrt(mapZoomScale());
    if (grown < base) grown = base;
    if (grown > BIG) grown = BIG;
    return Math.round(grown * 100) / 100;
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
      var area = areaAt(lat, lng);
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
        lat: lat,
        lng: lng,
        area: area,
        region: area,
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
      paintAreaTabs();
      render();
    }
    return sheetText().then(function (text) {
      var rows = rowsFromCsv(text);
      if (JSON.stringify(rows) === cachedSig) return;
      writeCachedRows(rows);
      CARS = carsFromRows(rows);
      paintAreaTabs();
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
    return activeHex(car);
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
  var mapBaseZoom = null;
  var mapZoomTarget = null;
  var mapZoomLock = 0;
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
    mapBaseZoom = null;
    mapZoomTarget = null;
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

  function rememberBoundary(name, boundary) {
    var rings = [];
    if (!name || !boundary) return;
    if (boundary.type === "Polygon" && boundary.coordinates && boundary.coordinates[0]) {
      rings.push(boundary.coordinates[0]);
    } else if (boundary.type === "MultiPolygon") {
      (boundary.coordinates || []).forEach(function (poly) {
        if (poly && poly[0]) rings.push(poly[0]);
      });
    }
    if (rings.length) CITY_LINES[name] = rings;
  }

  function outlineCities() {
    var names = [];
    var seen = {};
    function add(name) {
      if (!name || seen[name] || !(CITY_LINES[name] && CITY_LINES[name].length)) return;
      seen[name] = 1;
      names.push(name);
    }
    Object.keys(cityOn).forEach(function (name) {
      if (!cityOn[name]) return;
      var picks = areaPick[name] || [];
      if (!picks.length) add(name);
      else picks.forEach(add);
    });
    Object.keys(areaPick).forEach(function (name) {
      if (cityOn[name]) return;
      (areaPick[name] || []).forEach(add);
    });
    if (!names.length && CITY_LINES[city]) names.push(city);
    return names;
  }

  function ringArea(ring) {
    var a = 0;
    var i;
    for (i = 0; i < ring.length - 1; i++) {
      a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    return a / 2;
  }

  function holeRing(ring) {
    if (ringArea(ring) > 0) return ring.slice().reverse();
    return ring.slice();
  }

  function boundsOfCities(names) {
    var west = Infinity;
    var south = Infinity;
    var east = -Infinity;
    var north = -Infinity;
    names.forEach(function (name) {
      (CITY_LINES[name] || []).forEach(function (ring) {
        ring.forEach(function (p) {
          if (p[0] < west) west = p[0];
          if (p[0] > east) east = p[0];
          if (p[1] < south) south = p[1];
          if (p[1] > north) north = p[1];
        });
      });
    });
    if (!isFinite(west)) return null;
    return [[west, south], [east, north]];
  }

  function cityOverlayData() {
    var holes = [];
    outlineCities().forEach(function (name) {
      (CITY_LINES[name] || []).forEach(function (ring) {
        holes.push(holeRing(ring));
      });
    });
    var world = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
    return {
      mask: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [world].concat(holes) } }
    };
  }

  function maskOpacityFor(z) {
    var o = 0.26 + (13 - z) * 0.18;
    if (o < 0.1) o = 0.1;
    if (o > 0.86) o = 0.86;
    return Math.round(o * 100) / 100;
  }

  var cityFitKey = "";
  var maskWait = false;

  function waitMask() {
    if (maskWait || !ccBasemap || !ccBasemap.once) return;
    maskWait = true;
    ccBasemap.once("idle", function () {
      maskWait = false;
      syncCityOverlay(true);
    });
  }

  function syncCityOverlay(fit) {
    if (!ccBasemap) return;
    var ready = !!(ccBasemap.isStyleLoaded && ccBasemap.isStyleLoaded());
    var source = null;
    try { source = ccBasemap.getSource("cc-city-mask"); } catch (err) { source = null; }
    if (!ready && !source) {
      if (fit) waitMask();
      return;
    }
    if (!Object.keys(CITY_LINES).length) return;
    var data = cityOverlayData();
    if (data.mask.geometry.coordinates.length < 2) return;
    if (!source) {
      ccBasemap.addSource("cc-city-mask", { type: "geojson", data: data.mask });
      ccBasemap.addLayer({
        id: "cc-city-mask",
        type: "fill",
        source: "cc-city-mask",
        paint: { "fill-color": "#ffffff", "fill-opacity": maskOpacityFor(ccBasemap.getZoom()) }
      });
    } else {
      source.setData(data.mask);
      if (ready) ccBasemap.setPaintProperty("cc-city-mask", "fill-opacity", maskOpacityFor(ccBasemap.getZoom()));
    }
    if (!fit) return;
    if (!ready) {
      waitMask();
      return;
    }
    var key = outlineCities().slice().sort().join("|");
    if (!key || key === cityFitKey) return;
    var box = boundsOfCities(outlineCities());
    if (!box) return;
    cityFitKey = key;
    mapZoomLock += 1;
    ccBasemap.fitBounds(box, { padding: 36, animate: false, duration: 0 });
    mapZoomLock -= 1;
    mapBaseZoom = ccBasemap.getZoom();
    mapZoomTarget = null;
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
        interactive: true,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        fadeDuration: 0,
        preserveDrawingBuffer: true,
        failIfMajorPerformanceCaveat: false
      });
      if (map.touchZoomRotate) map.touchZoomRotate.disableRotation();
      if (map.dragRotate) map.dragRotate.disable();
      if (map.keyboard) map.keyboard.disable();
      ccBasemap = map;
      function place() {
        if (el._ccToken !== token) return;
        projectStreetDots(field);
      }
      map.on("load", function () {
        if (el._ccToken !== token) return;
        map.resize();
        if (Object.keys(CITY_LINES).length) syncCityOverlay(true);
        else map.fitBounds([[MAP_WEST, MAP_SOUTH], [MAP_EAST, MAP_NORTH]], { padding: 0, animate: false });
        mapBaseZoom = map.getZoom();
        place();
        function whenTiles() {
          if (el._ccToken !== token) return;
          if (map.areTilesLoaded && !map.areTilesLoaded()) return;
          revealMap(field);
        }
        whenTiles();
        map.on("idle", whenTiles);
      });
      map.on("move", function () {
        place();
        if (pressMoved && pop && !pop.hidden) pop.hidden = true;
      });
      map.on("zoom", function () {
        if (map.getLayer && map.getLayer("cc-city-mask")) {
          map.setPaintProperty("cc-city-mask", "fill-opacity", maskOpacityFor(map.getZoom()));
        }
      });
      map.on("resize", place);
      map.on("moveend", function () {
        if (!mapZoomLock) mapZoomTarget = null;
      });
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

  function mapCar(el) {
    var car = CARS[+el.dataset.i];
    if (!car || car.lat == null || car.lng == null) return null;
    return car;
  }

  function assignStreetDots(field) {
    Array.prototype.forEach.call(field.querySelectorAll(".cc-dot"), function (el) {
      if (!mapCar(el)) return;
      el.style.visibility = "hidden";
    });
  }

  function projectStreetDots(field) {
    if (!ccBasemap || !field) return;
    var size = viewPx();
    stage.style.setProperty("--cc-dot", size + "px");
    Array.prototype.forEach.call(field.querySelectorAll(".cc-dot"), function (el) {
      var car = mapCar(el);
      if (!car) return;
      var p = ccBasemap.project([car.lng, car.lat]);
      var left = (p.x - size / 2).toFixed(1) + "px";
      var top = (p.y - size / 2).toFixed(1) + "px";
      if (mapFlight) {
        el.dataset.mx = left;
        el.dataset.my = top;
        return;
      }
      el.style.transform = "";
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

  function mapFrame() {
    var width = Math.max(280, stage.clientWidth);
    var height = Math.max(640, Math.round(width * 100 / 120));
    return { width: width, height: height };
  }

  function reflowMapFrame() {
    var field = stage.querySelector(".cc-map");
    if (!field) {
      render();
      return;
    }
    var box = mapFrame();
    field.style.height = box.height + "px";
    applyMetrics();
    if (ccBasemap) {
      ccBasemap.resize();
      projectStreetDots(field);
    }
  }

  function stepMapZoom(dir) {
    if (!ccBasemap) return;
    var current = mapZoomTarget == null ? ccBasemap.getZoom() : mapZoomTarget;
    var next = current + dir;
    var minZ = ccBasemap.getMinZoom();
    var maxZ = ccBasemap.getMaxZoom();
    if (next < minZ) next = minZ;
    if (next > maxZ) next = maxZ;
    mapZoomTarget = next;
    mapZoomLock += 1;
    if (ccBasemap.easeTo) ccBasemap.easeTo({ zoom: next, duration: 200 });
    else ccBasemap.setZoom(next);
    mapZoomLock -= 1;
  }

  function renderMap() {
    clear(stage);
    var box = mapFrame();
    var field = document.createElement("div");
    field.className = "cc-map";
    field.style.height = box.height + "px";
    var zoom = document.createElement("div");
    zoom.className = "cc-map-zoom";
    zoom.setAttribute("role", "group");
    zoom.setAttribute("aria-label", "Map zoom");
    var zin = document.createElement("button");
    zin.type = "button";
    zin.className = "cc-map-zoom-btn";
    zin.setAttribute("aria-label", "Zoom in");
    zin.textContent = "+";
    var zout = document.createElement("button");
    zout.type = "button";
    zout.className = "cc-map-zoom-btn";
    zout.setAttribute("aria-label", "Zoom out");
    zout.textContent = "−";
    zoom.appendChild(zin);
    zoom.appendChild(zout);
    zin.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      stepMapZoom(1);
    });
    zout.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      stepMapZoom(-1);
    });
    var credit = document.createElement("p");
    credit.className = "cc-map-credit";
    credit.textContent = "© OpenStreetMap";
    field.appendChild(zoom);
    field.appendChild(credit);
    var rng = mulberry32(0x5A11);
    var mapped = shownCars().filter(function (car) {
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
    var sorted = shownCars().slice().sort(hueOrder);
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

  function clusterSeed(car) {
    var s = 2166136261;
    var str = [car.i, car.accurate, car.real].join("|");
    var i;
    for (i = 0; i < str.length; i++) {
      s ^= str.charCodeAt(i);
      s = Math.imul(s, 16777619);
    }
    return s >>> 0;
  }

  /* One loose cloud, centred in the area under the controls. The seed keeps each dot put. */
  function renderCluster() {
    clear(stage);
    var width = Math.max(280, stage.clientWidth);
    var size = viewPx();
    var controls = document.querySelector(".cc-controls");
    var below = controls ? window.innerHeight - controls.getBoundingClientRect().bottom - 28 : Math.round(window.innerHeight * 0.7);
    if (below < 360) below = 360;
    var cars = shownCars().slice().sort(function (a, b) { return a.i - b.i; });
    var n = cars.length;
    var golden = Math.PI * (3 - Math.sqrt(5));
    var rx = Math.max(size, (width - size) * 0.46);
    var ry = Math.max(size, (below - size) * 0.42);
    var pts = cars.map(function (car, i) {
      var rng = mulberry32(clusterSeed(car) ^ (i * 0x9E3779B1));
      var base = n <= 1 ? 0 : Math.sqrt((i + 0.35) / n);
      var ang = i * golden + (rng() - 0.5) * 0.45;
      var rad = 0.9 + rng() * 0.2;
      var jAng = rng() * Math.PI * 2;
      var jMag = rng() * size * 0.28;
      return {
        car: car,
        x: Math.cos(ang) * base * rx * rad + Math.cos(jAng) * jMag,
        y: Math.sin(ang) * base * ry * rad + Math.sin(jAng) * jMag
      };
    });
    var sx = 0;
    var sy = 0;
    pts.forEach(function (p) { sx += p.x; sy += p.y; });
    var cx = pts.length ? sx / pts.length : 0;
    var cy = pts.length ? sy / pts.length : 0;
    var reachX = 1;
    var reachY = 1;
    pts.forEach(function (p) {
      reachX = Math.max(reachX, Math.abs(p.x - cx));
      reachY = Math.max(reachY, Math.abs(p.y - cy));
    });
    var fit = Math.min((width - size) / (2 * reachX), (below - size) / (2 * reachY));
    if (!(fit > 0) || !isFinite(fit)) fit = 1;
    var field = document.createElement("div");
    field.className = "cc-gather";
    field.style.height = below + "px";
    pts.forEach(function (p) {
      var el = dot(p.car);
      var left = width / 2 + (p.x - cx) * fit - size / 2;
      var top = below / 2 + (p.y - cy) * fit - size / 2;
      el.style.left = left.toFixed(1) + "px";
      el.style.top = top.toFixed(1) + "px";
      field.appendChild(el);
    });
    stage.appendChild(field);
  }

  function render() {
    applyMetrics();
    if (mode !== "map") mapFlight = null;
    if (mode === "region") renderRegion();
    else if (mode === "map") renderMap();
    else if (mode === "cluster") renderCluster();
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
      if (button.hasAttribute("data-cc-area") || button.id === "cc-city-vancouver") return;
      var on = button.getAttribute("data-cc-city") === city;
      button.classList.toggle("cc-on", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
    syncCityTag(false);
    syncAreaButtons();
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
      if (mode === "hue") {
        var beforeHue = snapshotDots();
        render();
        slideInto(beforeHue);
        return;
      }
      if (mode === "map") {
        var mapField = stage.querySelector(".cc-map");
        if (mapField && ccBasemap) projectStreetDots(mapField);
        else if (Math.abs(prevPx - px) > 0.5) growFromCenter(prevPx, px);
      } else if (Math.abs(prevPx - px) > 0.5) growFromCenter(prevPx, px);
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
    var lines = [];
    if (acc) lines.push(acc);
    if (real && real !== acc) lines.push(real);
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
  var pressX = 0;
  var pressY = 0;
  var pressMoved = false;

  function dotUnder(x, y) {
    if (mode !== "map") return null;
    var field = stage.querySelector(".cc-map");
    if (!field) return null;
    var hits = [];
    Array.prototype.forEach.call(field.querySelectorAll(".cc-dot"), function (el) {
      var r = el.getBoundingClientRect();
      if (!r.width) return;
      var cx = r.left + r.width / 2;
      var cy = r.top + r.height / 2;
      var d = Math.hypot(x - cx, y - cy);
      if (d <= r.width / 2 + 1) hits.push(el);
    });
    return hits.length ? hits[hits.length - 1] : null;
  }

  document.addEventListener("pointermove", function (e) {
    if (Math.hypot(e.clientX - pressX, e.clientY - pressY) > 8) pressMoved = true;
    if (mode !== "map" || e.pointerType === "touch") return;
    var el = dotUnder(e.clientX, e.clientY);
    if (el) showPop(el);
    else if (!pop.hidden) pop.hidden = true;
  });

  document.addEventListener("pointerdown", function (e) {
    pressX = e.clientX;
    pressY = e.clientY;
    pressMoved = false;
    if (e.target.closest && e.target.closest(".cc-map-zoom")) return;
    var el = e.target.closest && e.target.closest(".cc-dot");
    if (!el && mode === "map" && e.target.closest && e.target.closest(".cc-map")) el = dotUnder(e.clientX, e.clientY);
    if (el) showPop(el);
    else if (pop) pop.hidden = true;
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
    if (draggingSlider || pressMoved) return;
    if (e.target.closest && e.target.closest(".cc-map-zoom")) return;
    var dotEl = e.target.closest && e.target.closest(".cc-dot");
    if (!dotEl && mode === "map" && e.target.closest && e.target.closest(".cc-map")) dotEl = dotUnder(e.clientX, e.clientY);
    if (dotEl && dotEl.dataset.hex) {
      spillFrom(dotEl);
      return;
    }
    clearPageColour();
  });


  function isSlider(t) {
    return t && t.classList && t.classList.contains("cc-zslider");
  }

  document.addEventListener("pointerdown", function (e) {
    if (!isSlider(e.target)) return;
    clearPageColour();
    draggingSlider = true;
    Shared.lockScroll({ className: "cc-sizing", overflow: false });
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
    Shared.unlockScroll({ oy: document.documentElement.style.overflowY }, { className: "cc-sizing", overflow: false });
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

  function syncAreaButtons() {
    document.querySelectorAll("[data-cc-area]").forEach(function (button) {
      var on = cityPicks(city).indexOf(button.getAttribute("data-cc-area")) >= 0;
      button.classList.toggle("cc-on", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function paintAreaTabs() {
    var box = document.getElementById("cc-areas");
    if (!box || !AREAS.length || !CARS.length) return;
    var names = areasInUse();
    box.textContent = "";
    names.forEach(function (name) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "cc-city";
      b.setAttribute("data-cc-area", name);
      b.textContent = name;
      box.appendChild(b);
    });
    syncAreaButtons();
  }

  function stampAreas() {
    var i;
    for (i = 0; i < CARS.length; i++) {
      var area = areaAt(CARS[i].lat, CARS[i].lng);
      CARS[i].area = area;
      CARS[i].region = area;
    }
    var live = {};
    areasInUse().forEach(function (n) { live[n] = 1; });
    setCityPicks(city, cityPicks(city).filter(function (n) { return live[n]; }));
  }

  function replaceMapDots() {
    var field = stage.querySelector(".cc-map");
    if (!field) return false;
    Array.prototype.forEach.call(field.querySelectorAll(".cc-dot"), function (el) {
      el.remove();
    });
    var rng = mulberry32(0x5A11);
    var mapped = shownCars().filter(function (car) {
      return car.lat != null && car.lng != null;
    });
    shuffle(mapped, rng).forEach(function (car) {
      field.appendChild(dot(car));
    });
    if (mapFlight) {
      assignStreetDots(field);
      parkMapDots(field);
      if (ccBasemap) projectStreetDots(field);
    } else if (ccBasemap) {
      projectStreetDots(field);
    } else {
      assignStreetDots(field);
    }
    return true;
  }

  function applyAreaFilter() {
    syncAreaButtons();
    clearPageColour();
    var before = snapshotDots();
    if (mode === "map" && replaceMapDots()) {
      syncCityOverlay(true);
      if (!mapFlight) slideInto(before);
      return;
    }
    render();
    if (mode !== "map") slideInto(before);
  }

  function settleCluster() {
    if (mode !== "cluster") return;
    window.setTimeout(function () {
      if (mode !== "cluster") return;
      var before = snapshotDots();
      render();
      slideInto(before);
    }, 240);
  }

  function loadAreas() {
    return fetch("vancouver-areas.geojson?v=20261015c").then(function (res) {
      if (!res.ok) throw new Error("areas");
      return res.json();
    }).then(function (geo) {
      AREAS = [];
      (geo.features || []).forEach(function (f) {
        var name = f.properties && f.properties.name;
        var g = f.geometry;
        if (!name || !g) return;
        var polys = g.type === "Polygon" ? [g.coordinates] : (g.type === "MultiPolygon" ? g.coordinates : []);
        if (!polys.length) return;
        AREAS.push({ name: name, polys: polys });
        rememberBoundary(name, g);
      });
      if (geo.city) rememberBoundary(geo.city, geo.boundary);
      stampAreas();
      paintAreaTabs();
      if (mode === "map") syncCityOverlay(true);
    }).catch(function () {});
  }

  function syncCityTag(animate) {
    var button = document.getElementById("cc-city-vancouver");
    var on = !!cityOn.Vancouver;
    if (button) {
      button.classList.toggle("cc-on", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    }
    var root = document.documentElement;
    if (animate) root.classList.add("cc-tags-motion");
    root.classList.toggle("cc-tags-open", on);
    var drop = document.getElementById("cc-tagdrop");
    if (drop) drop.setAttribute("aria-hidden", on ? "false" : "true");
  }

  function setVancouverOn(on) {
    if (on) cityOn.Vancouver = true;
    else {
      delete cityOn.Vancouver;
      setCityPicks("Vancouver", []);
    }
    syncCityTag(true);
    applyAreaFilter();
    settleCluster();
  }

  var vanBtn = document.getElementById("cc-city-vancouver");
  if (vanBtn) {
    vanBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (draggingSlider) return;
      setVancouverOn(!cityOn.Vancouver);
    });
  }

  var areasBox = document.getElementById("cc-areas");
  if (areasBox) {
    areasBox.addEventListener("click", function (e) {
      var button = e.target.closest && e.target.closest("button");
      if (!button || !areasBox.contains(button)) return;
      if (draggingSlider || !cityOn[city]) return;
      var name = button.getAttribute("data-cc-area");
      if (!name) return;
      var list = cityPicks(city);
      var at = list.indexOf(name);
      if (at >= 0) list.splice(at, 1);
      else list.push(name);
      setCityPicks(city, list);
      applyAreaFilter();
    });
  }

  window.__ccTagsClick = function () {
    settleCluster();
  };

  phone = phoneSlider();
  applySize(modeSize(mode));
  syncButtons();
  loadAreas();
  loadSheet();

  var resizeTimer = 0;
  function reflowViewport() {
    if (draggingSlider) return;
    var nowPhone = phoneSlider();
    if (nowPhone !== phone) {
      phone = nowPhone;
      var n = mode === "map" ? modeSize("map") : (nowPhone ? 4 : storedCols());
      sizeN = clampSlider(n);
      applyMetrics();
      fillSlider(sizeN);
    }
    if (mode === "map") {
      reflowMapFrame();
      return;
    }
    if (mode !== "family") render();
  }
  function scheduleReflow() {
    if (draggingSlider) return;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(reflowViewport, 150);
  }
  window.addEventListener("resize", scheduleReflow);
  window.addEventListener("orientationchange", scheduleReflow);
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
    if (window.__ccTagsClick) window.__ccTagsClick(open);
  });
})();
