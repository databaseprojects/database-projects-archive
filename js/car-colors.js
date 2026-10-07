/* Mock car colours for this preview. Each dot is a placeholder swatch; there are no image files.
   metallic is kept on the record even though the dot shows colour alone.
   The size slider and antigravity follow Found Photographs. */
(function () {
  var COL_KEY = "ccZoomCols";
  var MIN = 6;
  var MAX = 20;
  var DEF = 6;
  var BIG = 40;
  var SMALL = 14;
  var PHONE_SMALL = 22;
  var HYST = 0.72;
  var DRAG_THRESH = 5;
  var AG_SPEED_MIN = 12;
  var AG_SPEED_MAX = 58;
  var REGIONS = ["Kitsilano", "Mount Pleasant", "Commercial Drive", "Gastown", "Dunbar", "Strathcona"];
  /* City choices stay hidden until Region is open. Vancouver keeps the neighbourhoods above. */
  var CITIES = ["Vancouver", "Toronto", "Seattle", "Los Angeles"];
  var CITY_REGIONS = {
    Vancouver: REGIONS,
    Toronto: ["Kensington", "Leslieville", "The Annex", "Parkdale"],
    Seattle: ["Capitol Hill", "Ballard", "Fremont", "Queen Anne"],
    "Los Angeles": ["Silver Lake", "Venice", "Echo Park", "Los Feliz"]
  };
  var city = "Vancouver";

  /* About fifty mock car colours. Placeholder swatches only, not photographed cars. */
  var PAINTS = [
    ["black", "#0C0C0E", null, false],
    ["black", "#141416", null, true],
    ["black", "#1A1C1F", null, false],
    ["black", "#222426", null, true],
    ["black", "#2A2C30", null, false],
    ["black", "#101214", null, true],
    ["black", "#181A1C", null, false],
    ["black", "#303236", null, true],
    ["black", "#0E1012", null, false],
    ["black", "#26282C", null, true],
    ["black", "#16181A", null, false],
    ["black", "#3A3C40", null, true],
    ["grey", "#3E4248", null, false],
    ["grey", "#4A4E54", null, true],
    ["grey", "#555A60", null, false],
    ["grey", "#5C6168", null, true],
    ["grey", "#6E747C", null, false],
    ["grey", "#7A8088", null, true],
    ["grey", "#848A92", null, false],
    ["grey", "#8E949A", null, true],
    ["grey", "#9AA0A6", null, false],
    ["grey", "#A8AEB4", null, true],
    ["grey", "#B0B6BC", null, false],
    ["grey", "#C5C9CE", null, true],
    ["grey", "#C8CCD0", null, false],
    ["grey", "#D4D8DC", null, true],
    ["grey", "#DCDFE2", null, false],
    ["grey", "#E2E4E6", null, true],
    ["grey", "#EEF0F2", null, false],
    ["grey", "#F4F5F6", null, true],
    ["blue", "#5E84A0", 206, false],
    ["blue", "#6E90A8", 207, true],
    ["blue", "#7A9BB5", 205, false],
    ["blue", "#8EADC4", 206, true],
    ["blue", "#9BB4C6", 204, false],
    ["blue", "#A3BDD0", 205, true],
    ["blue", "#A8C0D4", 203, false],
    ["blue", "#B7C9D6", 204, true],
    ["blue", "#C5D4E0", 202, false],
    ["blue", "#D0DCE6", 203, true],
    ["red", "#6A2828", 2, false],
    ["red", "#7A3032", 4, true],
    ["red", "#8C3A36", 6, false],
    ["red", "#A34A42", 8, true],
    ["green", "#2F4A3C", 152, false],
    ["green", "#3E5C48", 148, true],
    ["green", "#5A7A62", 140, false],
    ["teal", "#2A5552", 176, true],
    ["teal", "#3E6E6A", 174, false],
    ["teal", "#5A8A84", 172, true]
  ];

  var CARS = PAINTS.map(function (row, i) {
    return {
      i: i,
      family: row[0],
      hex: row[1],
      hue: row[2],
      metallic: row[3],
      region: REGIONS[i % REGIONS.length],
      city: "Vancouver"
    };
  });

  /* This pass keeps four Vancouver colours. The other city tags stay; they have no samples yet. */
  var OTHER_CITIES = [];
  OTHER_CITIES.forEach(function (row, n) {
    CARS.push({
      i: PAINTS.length + n,
      family: row[2],
      hex: row[3],
      hue: row[4],
      metallic: row[5],
      region: row[1],
      city: row[0]
    });
  });

  function carsIn(name) {
    return CARS.filter(function (car) { return car.city === name; });
  }

  var stage = document.getElementById("cc-stage");
  var buttons = document.querySelectorAll("[data-cc-mode]");
  var mode = "hue";
  var agOn = false;
  var agPrev = "hue";
  var sizeN = DEF;
  var phone = false;
  var draggingSlider = false;
  var zVal = null;
  var agRaf = 0;
  var agBodies = [];
  var agRunning = false;
  var agLastTs = 0;
  var itemDrag = null;
  var skipDotClick = false;
  var spillGen = 0;
  var zTop = 30;

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
    removeSpills();
    pageBackground("");
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
    var rect = dotEl.getBoundingClientRect();
    if (!(rect.width > 0)) return;
    spillGen += 1;
    var gen = spillGen;
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

  /* Left is larger. Hue and Scattered open there; Map opens at the small end. */
  function modeSize(next) {
    var ends = sliderEnds();
    if (next === "map") return ends.max;
    if (next === "hue" || next === "scatter") return ends.min;
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

  function gapPx() {
    return Math.max(8, Math.round(dotPx() * 0.4));
  }

  function applyMetrics() {
    stage.style.setProperty("--cc-dot", dotPx() + "px");
    stage.style.setProperty("--cc-gap", gapPx() + "px");
  }

  function lightness(hex) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255;
    var g = (n >> 8) & 255;
    var b = n & 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }

  function labelFor(car) {
    var finish = car.metallic ? "metallic" : "flat";
    return car.family + ", " + finish + ", " + car.region;
  }

  function dot(car) {
    var el = document.createElement("span");
    el.className = "cc-dot";
    el.style.background = car.hex;
    el.title = labelFor(car);
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", labelFor(car));
    el.dataset.family = car.family;
    el.dataset.metallic = car.metallic ? "metallic" : "flat";
    el.dataset.region = car.region;
    el.dataset.hex = car.hex;
    el.dataset.i = String(car.i);
    if (car.hue == null) el.dataset.hue = "";
    else el.dataset.hue = String(car.hue);
    return el;
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

  function screenBox() {
    var doc = document.documentElement;
    return {
      width: Math.max(160, doc.getBoundingClientRect().width || doc.clientWidth || window.innerWidth || 800),
      height: Math.max(360, doc.clientHeight || window.innerHeight || 800)
    };
  }

  function renderScatter(list, seed) {
    clear(stage);
    document.body.classList.add("cc-screen");
    var box = screenBox();
    var width = box.width;
    var height = box.height;
    var rng = mulberry32(seed == null ? 0xC0105 : seed);
    var order = shuffle(list || carsIn(city), rng);
    var size = dotPx();
    var minD = size + Math.max(8, Math.round(size * 0.28));
    var placed = [];

    function fits(x, y, limit) {
      if (x < 0 || y < 0 || x > width - size || y > limit - size) return false;
      for (var i = 0; i < placed.length; i++) {
        var dx = placed[i].x - x;
        var dy = placed[i].y - y;
        if (dx * dx + dy * dy < minD * minD) return false;
      }
      return true;
    }

    order.forEach(function (car) {
      var found = null;
      var n;
      for (n = 0; n < 240; n++) {
        var x = rng() * (width - size);
        var y = rng() * (height - size);
        if (fits(x, y, height)) {
          found = { x: x, y: y };
          break;
        }
      }
      if (!found) {
        var step = minD;
        var grow;
        scan: for (grow = 0; grow < 40 && !found; grow++) {
          if (grow > 0) height += step;
          var yScan;
          for (yScan = 0; yScan <= height - size; yScan += step) {
            var xScan;
            for (xScan = 0; xScan <= width - size; xScan += step) {
              var jx = Math.min(width - size, Math.max(0, xScan + (rng() - 0.5) * 6));
              var jy = Math.min(height - size, Math.max(0, yScan + (rng() - 0.5) * 6));
              if (fits(jx, jy, height)) {
                found = { x: jx, y: jy };
                break scan;
              }
            }
          }
        }
      }
      placed.push({ car: car, x: found.x, y: found.y });
    });

    var field = document.createElement("div");
    field.className = "cc-scatter";
    field.style.width = width + "px";
    field.style.height = height + "px";
    placed.forEach(function (item) {
      var el = dot(item.car);
      el.style.left = item.x + "px";
      el.style.top = item.y + "px";
      field.appendChild(el);
    });
    stage.appendChild(field);
  }

  function fitScatter() {
    var field = stage.querySelector(".cc-scatter");
    if (!field) return;
    var box = screenBox();
    field.style.width = box.width + "px";
    field.style.height = box.height + "px";
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
    if (stage.querySelector(".cc-scatter")) fitScatter();
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

  function destroyBasemap() {
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
    if (!window.maplibregl) return;
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
      });
      map.on("move", place);
      map.on("resize", place);
    });
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
    var dots = field.querySelectorAll(".cc-dot");
    var pts = streetLngLats(dots.length);
    Array.prototype.forEach.call(dots, function (el, i) {
      if (!pts[i]) return;
      el.dataset.lng = String(pts[i][0]);
      el.dataset.lat = String(pts[i][1]);
      el.style.visibility = "hidden";
    });
  }

  function projectStreetDots(field) {
    if (!ccBasemap || !field) return;
    var size = dotPx();
    Array.prototype.forEach.call(field.querySelectorAll(".cc-dot"), function (el) {
      if (!el.dataset.lng) return;
      var p = ccBasemap.project([+el.dataset.lng, +el.dataset.lat]);
      el.style.left = (p.x - size / 2).toFixed(1) + "px";
      el.style.top = (p.y - size / 2).toFixed(1) + "px";
      el.style.visibility = "visible";
    });
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
    shuffle(carsIn("Vancouver"), rng).forEach(function (car) {
      field.appendChild(dot(car));
    });
    stage.appendChild(field);
    assignStreetDots(field);
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
    document.body.classList.toggle("cc-screen", mode === "scatter");
    if (mode === "region") renderRegion();
    else if (mode === "map") renderMap();
    else if (mode === "hue") renderHue();
    else renderScatter();
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
      var on = !agOn && button.getAttribute("data-cc-mode") === mode;
      button.classList.toggle("cc-icon-on", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
    document.querySelectorAll(".cc-city").forEach(function (button) {
      var on = button.getAttribute("data-cc-city") === city;
      button.classList.toggle("cc-on", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
    var ag = document.querySelector(".cc-ag");
    if (ag) {
      ag.classList.toggle("cc-ag-on", agOn);
      ag.setAttribute("aria-pressed", agOn ? "true" : "false");
    }
    document.body.classList.toggle("cc-under-menu", agOn);
    if (agOn) {
      var nav = document.querySelector(".bk-nav");
      if (nav) document.documentElement.style.setProperty("--cc-nav-h", nav.offsetHeight + "px");
    }
  }

  function agLimits(field, w, h) {
    var rect = field.getBoundingClientRect();
    var root = document.documentElement.getBoundingClientRect();
    var viewW = root.width || document.documentElement.clientWidth || window.innerWidth || 0;
    var viewH = window.innerHeight || 0;
    var minX = -rect.left;
    var minY = -rect.top;
    var maxX = viewW - rect.left - w;
    var maxY = viewH - rect.top - h;
    if (!(maxX > minX)) maxX = minX;
    if (!(maxY > minY)) maxY = minY;
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
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

  function stopAg() {
    agRunning = false;
    if (agRaf) cancelAnimationFrame(agRaf);
    agRaf = 0;
    agBodies = [];
    agLastTs = 0;
  }

  function agSurface(px, count, gw) {
    var area = count * px * px * 1.8;
    var h = Math.ceil(area / Math.max(gw, 1));
    var vh = window.innerHeight || 700;
    return Math.max(Math.floor(vh * 0.78), h, Math.ceil(px * 3));
  }

  function paintBody(b) {
    b.el.style.setProperty("--cc-x", b.x.toFixed(1) + "px");
    b.el.style.setProperty("--cc-y", b.y.toFixed(1) + "px");
  }

  function randSpeed() {
    var s = AG_SPEED_MIN + Math.random() * (AG_SPEED_MAX - AG_SPEED_MIN);
    var a = Math.random() * Math.PI * 2;
    return { vx: Math.cos(a) * s, vy: Math.sin(a) * s };
  }

  function bodyFor(el) {
    for (var i = 0; i < agBodies.length; i++) {
      if (agBodies[i].el === el) return agBodies[i];
    }
    return null;
  }

  function resizeAg(px) {
    agBodies.forEach(function (b) {
      if (Math.abs(b.w - px) < 0.5) return;
      b.x += (b.w - px) / 2;
      b.y += (b.h - px) / 2;
      b.w = px;
      b.h = px;
      paintBody(b);
    });
  }

  function clampBodies() {
    var field = stage.querySelector(".cc-ag-field");
    if (!field) return;
    agBodies.forEach(function (b) {
      var lim = agLimits(field, b.w, b.h);
      if (b.x < lim.minX) b.x = lim.minX;
      else if (b.x > lim.maxX) b.x = lim.maxX;
      if (b.y < lim.minY) b.y = lim.minY;
      else if (b.y > lim.maxY) b.y = lim.maxY;
      paintBody(b);
    });
  }

  function tickAg(ts) {
    if (!agRunning) return;
    if (!agLastTs) agLastTs = ts;
    var dt = Math.min(0.05, (ts - agLastTs) / 1000);
    agLastTs = ts;
    var field = stage.querySelector(".cc-ag-field");
    if (!agOn || !field) {
      stopAg();
      return;
    }
    for (var i = 0; i < agBodies.length; i++) {
      var b = agBodies[i];
      if (!b || !b.el || b.held) continue;
      if (b.driftAt != null && ts < b.driftAt) continue;
      var ramp = 1;
      if (b.easeMs > 1 && b.driftAt != null) {
        var eu = (ts - b.driftAt) / b.easeMs;
        if (eu < 1) {
          if (eu < 0) eu = 0;
          ramp = eu * eu * (3 - 2 * eu);
        }
      }
      if (b.tvx != null && b.tvy != null) {
        b.vx = b.tvx * ramp;
        b.vy = b.tvy * ramp;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      var lim = agLimits(field, b.w, b.h);
      if (b.x < lim.minX) {
        b.x = lim.minX;
        b.vx = Math.abs(b.vx);
        if (b.tvx != null) b.tvx = Math.abs(b.tvx);
      } else if (b.x > lim.maxX) {
        b.x = lim.maxX;
        b.vx = -Math.abs(b.vx);
        if (b.tvx != null) b.tvx = -Math.abs(b.tvx);
      }
      if (b.y < lim.minY) {
        b.y = lim.minY;
        b.vy = Math.abs(b.vy);
        if (b.tvy != null) b.tvy = Math.abs(b.tvy);
      } else if (b.y > lim.maxY) {
        b.y = lim.maxY;
        b.vy = -Math.abs(b.vy);
        if (b.tvy != null) b.tvy = -Math.abs(b.tvy);
      }
      paintBody(b);
    }
    agRaf = requestAnimationFrame(tickAg);
  }

  function enterAg() {
    if (agOn) return;
    document.body.classList.remove("cc-screen");
    agPrev = mode;
    var stageRect = stage.getBoundingClientRect();
    var nodes = Array.prototype.slice.call(stage.querySelectorAll(".cc-dot"));
    var px = dotPx();
    var prevH = stage.offsetHeight;
    var gw = stage.clientWidth || 800;
    var gh = Math.max(prevH, agSurface(px, nodes.length, gw));
    var field = document.createElement("div");
    field.className = "cc-ag-field";
    field.style.setProperty("--cc-ag-h", Math.ceil(gh) + "px");
    field.style.height = Math.ceil(gh) + "px";
    var now = performance.now();
    var bodies = [];
    var seeds = nodes.map(function (el) {
      var r = el.getBoundingClientRect();
      return { el: el, x: r.left - stageRect.left, y: r.top - stageRect.top };
    });
    seeds.forEach(function (s, i) {
      var el = s.el;
      (el.getAnimations ? el.getAnimations() : []).forEach(function (an) {
        if (an.id === "cc-flow") an.cancel();
      });
      el.style.removeProperty("left");
      el.style.removeProperty("top");
      el.style.removeProperty("grid-row");
      el.style.removeProperty("grid-column");
      el.style.setProperty("--cc-x", s.x.toFixed(1) + "px");
      el.style.setProperty("--cc-y", s.y.toFixed(1) + "px");
      el.style.setProperty("--cc-z", String(1 + (i % 24)));
      field.appendChild(el);
      var vel = randSpeed();
      bodies.push({
        el: el,
        x: s.x,
        y: s.y,
        w: px,
        h: px,
        vx: 0,
        vy: 0,
        tvx: vel.vx * 0.85,
        tvy: vel.vy * 0.85,
        held: false,
        driftAt: now + Math.random() * 1400,
        easeMs: 560 + Math.random() * 1640
      });
    });
    clear(stage);
    stage.appendChild(field);
    void field.offsetWidth;
    agBodies = bodies;
    agOn = true;
    agRunning = true;
    agLastTs = 0;
    syncButtons();
    agRaf = requestAnimationFrame(tickAg);
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
      var b = el.getBoundingClientRect();
      if (!b.width) return;
      var dx = a.left + a.width / 2 - (b.left + b.width / 2);
      var dy = a.top + a.height / 2 - (b.top + b.height / 2);
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      var anim = el.animate(
        [
          { transform: "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px)" },
          { transform: "translate(" + (dx * 0.04).toFixed(1) + "px," + (dy * 0.04 - 2).toFixed(1) + "px)", offset: 0.82 },
          { transform: "none" }
        ],
        { duration: 480, delay: k++ * step, easing: "cubic-bezier(.22,.8,.25,1)", fill: "both" }
      );
      anim.id = "cc-flow";
    });
  }

  function leaveAg(next) {
    var before = snapshotDots();
    stopAg();
    agOn = false;
    itemDrag = null;
    mode = next || agPrev || "hue";
    syncButtons();
    render();
    slideInto(before);
  }

  function applySize(n) {
    n = clampSlider(n);
    var prevPx = dotPx();
    sizeN = n;
    var px = dotPx();
    applyMetrics();
    fillSlider(n);
    if (agOn) {
      if (Math.abs(prevPx - px) > 0.5) resizeAg(px);
      return;
    }
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
      if (agOn) {
        useModeSize(next);
        leaveAg(next);
        return;
      }
      if (next === mode) return;
      var before = snapshotDots();
      mode = next;
      syncButtons();
      useModeSize(next);
      render();
      slideInto(before);
    });
  });

  document.querySelectorAll(".cc-city").forEach(function (button) {
    button.addEventListener("click", function () {
      clearPageColour();
      if (draggingSlider) return;
      var name = button.getAttribute("data-cc-city");
      if (agOn) {
        city = name;
        useModeSize("scatter");
        leaveAg("scatter");
        return;
      }
      if (name === city && mode === "scatter") return;
      var before = snapshotDots();
      var enteringScatter = mode !== "scatter";
      city = name;
      mode = "scatter";
      syncButtons();
      if (enteringScatter) useModeSize("scatter");
      render();
      slideInto(before);
    });
  });

  document.addEventListener("click", function (e) {
    if (draggingSlider) return;
    if (skipDotClick) {
      skipDotClick = false;
      return;
    }
    var dotEl = e.target.closest && e.target.closest(".cc-dot");
    if (dotEl && dotEl.dataset.hex) {
      spillFrom(dotEl);
      return;
    }
    if (e.target.closest && (e.target.closest("[data-cc-mode]") || e.target.closest(".cc-city") || e.target.closest(".cc-ag") || e.target.closest(".cc-zslider"))) {
      clearPageColour();
    }
    var ag = e.target.closest && e.target.closest(".cc-ag");
    if (!ag) return;
    e.preventDefault();
    if (agOn) leaveAg(agPrev);
    else enterAg();
  });

  document.addEventListener("pointerdown", function (e) {
    if (!agOn || draggingSlider) return;
    if (e.button != null && e.button !== 0) return;
    if (e.target.closest && e.target.closest(".cc-controls")) return;
    var el = e.target.closest && e.target.closest(".cc-dot");
    if (!el) return;
    var body = bodyFor(el);
    if (!body) return;
    zTop += 1;
    el.style.setProperty("--cc-z", String(zTop));
    body.held = true;
    body.vx = 0;
    body.vy = 0;
    body.tvx = 0;
    body.tvy = 0;
    itemDrag = {
      el: el,
      pid: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      nx0: body.x,
      ny0: body.y,
      moved: false,
      samples: [{ x: e.clientX, y: e.clientY, t: performance.now() }]
    };
    try { el.setPointerCapture(e.pointerId); } catch (err) {}
  });

  document.addEventListener("pointermove", function (e) {
    if (!itemDrag || itemDrag.pid !== e.pointerId) return;
    var dx = e.clientX - itemDrag.x0;
    var dy = e.clientY - itemDrag.y0;
    if (!itemDrag.moved) {
      if (Math.abs(dx) < DRAG_THRESH && Math.abs(dy) < DRAG_THRESH) return;
      itemDrag.moved = true;
      itemDrag.el.classList.add("cc-dragging");
    }
    e.preventDefault();
    var body = bodyFor(itemDrag.el);
    if (!body) return;
    body.x = itemDrag.nx0 + dx;
    body.y = itemDrag.ny0 + dy;
    body.held = true;
    body.driftAt = 0;
    body.easeMs = 1;
    paintBody(body);
    var now = performance.now();
    itemDrag.samples.push({ x: e.clientX, y: e.clientY, t: now });
    while (itemDrag.samples.length > 12 || (itemDrag.samples.length > 2 && now - itemDrag.samples[0].t > 120)) {
      itemDrag.samples.shift();
    }
  });

  function endDrag(e) {
    if (!itemDrag || (e.pointerId != null && itemDrag.pid !== e.pointerId)) return;
    var d = itemDrag;
    itemDrag = null;
    if (d.moved) skipDotClick = true;
    d.el.classList.remove("cc-dragging");
    var body = bodyFor(d.el);
    if (!body) return;
    body.held = false;
    body.x = parseFloat(d.el.style.getPropertyValue("--cc-x")) || body.x;
    body.y = parseFloat(d.el.style.getPropertyValue("--cc-y")) || body.y;
    if (!d.moved) {
      body.vx = 0;
      body.vy = 0;
      body.tvx = 0;
      body.tvy = 0;
      return;
    }
    var samples = d.samples || [];
    var tvx = 0;
    var tvy = 0;
    var nowU = performance.now();
    var lastS = samples.length ? samples[samples.length - 1] : null;
    if (lastS && nowU - lastS.t < 120 && samples.length >= 2) {
      var a = samples[0];
      var b = samples[samples.length - 1];
      var dt = (b.t - a.t) / 1000;
      if (dt > 0.008) {
        tvx = (b.x - a.x) / dt;
        tvy = (b.y - a.y) / dt;
      }
    }
    var tmag = Math.sqrt(tvx * tvx + tvy * tvy);
    var THROW_MAX = 160;
    if (tmag > THROW_MAX) {
      tvx = (tvx / tmag) * THROW_MAX;
      tvy = (tvy / tmag) * THROW_MAX;
    }
    body.driftAt = 0;
    body.easeMs = 1;
    if (tmag < 1) {
      body.vx = 0;
      body.vy = 0;
      body.tvx = 0;
      body.tvy = 0;
    } else {
      body.vx = tvx;
      body.vy = tvy;
      body.tvx = tvx;
      body.tvy = tvy;
    }
  }

  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);

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

  var resizeTimer = 0;
  window.addEventListener("resize", function () {
    if (draggingSlider) return;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      var nowPhone = phoneSlider();
      if (nowPhone !== phone) {
        phone = nowPhone;
        applySize(nowPhone ? 4 : storedCols());
        if (agOn) syncButtons();
        return;
      }
      if (agOn) {
        syncButtons();
        clampBodies();
      }
      else if (mode !== "family") render();
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
