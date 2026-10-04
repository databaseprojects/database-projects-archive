/* Sample cars only. Each dot is a photographed car; there are no image files.
   metallic is kept on the record even though the dot shows color alone.
   The size slider and antigravity follow Found Photographs. */
(function () {
  var COL_KEY = "ccZoomCols";
  var MIN = 6;
  var MAX = 20;
  var DEF = 6;
  var BIG = 36;
  var SMALL = 14;
  var PHONE_SMALL = 22;
  var HYST = 0.72;
  var DRAG_THRESH = 5;
  var AG_SPEED_MIN = 12;
  var AG_SPEED_MAX = 58;
  var FAMILIES = ["red", "orange", "yellow", "green", "blue", "purple", "brown", "gray", "white", "black"];
  var REGIONS = ["Kitsilano", "Mount Pleasant", "Commercial Drive", "Gastown", "Dunbar", "Strathcona"];

  /* family, hex, hue (null = neutral), metallic */
  var PAINTS = [
    ["red", "#4B1B21", 352, true],
    ["red", "#792026", 356, false],
    ["red", "#9D2529", 358, true],
    ["red", "#C32828", 0, false],
    ["red", "#C56663", 2, true],
    ["red", "#D2AAA7", 4, false],
    ["red", "#5E2630", 350, false],
    ["red", "#DEC7C4", 6, true],
    ["red", "#863427", 8, false],
    ["red", "#B3614D", 12, true],
    ["orange", "#69301C", 16, false],
    ["orange", "#8C4121", 18, true],
    ["orange", "#B05427", 20, false],
    ["orange", "#C96C36", 22, true],
    ["orange", "#CD9570", 24, false],
    ["orange", "#D3BAA6", 26, true],
    ["orange", "#7C4F27", 28, false],
    ["orange", "#D8C7B6", 30, false],
    ["orange", "#AF7631", 33, true],
    ["orange", "#BE9860", 36, false],
    ["yellow", "#745C25", 42, true],
    ["yellow", "#997F29", 46, false],
    ["yellow", "#BEA12D", 48, true],
    ["yellow", "#CAB549", 50, false],
    ["yellow", "#CDC384", 52, true],
    ["yellow", "#DAD7BE", 54, false],
    ["yellow", "#9F9838", 56, true],
    ["yellow", "#E4E3D3", 58, false],
    ["yellow", "#BABA45", 60, false],
    ["yellow", "#B7BD6B", 64, true],
    ["green", "#4B582D", 78, false],
    ["green", "#527133", 90, true],
    ["green", "#51883A", 102, false],
    ["green", "#4B9F41", 114, true],
    ["green", "#59B161", 126, false],
    ["green", "#90C19F", 138, true],
    ["green", "#347954", 148, false],
    ["green", "#AECBC0", 156, true],
    ["green", "#2E6153", 164, false],
    ["green", "#52988F", 172, true],
    ["blue", "#2E5C61", 186, true],
    ["blue", "#326A7B", 194, false],
    ["blue", "#377395", 202, true],
    ["blue", "#407AB5", 210, false],
    ["blue", "#7291C0", 216, true],
    ["blue", "#B3BCD0", 222, false],
    ["blue", "#264F73", 208, true],
    ["blue", "#C8CCDA", 228, false],
    ["blue", "#404996", 234, false],
    ["blue", "#2C2A5A", 242, true],
    ["purple", "#3A315E", 252, false],
    ["purple", "#50397F", 260, true],
    ["purple", "#6D439D", 268, false],
    ["purple", "#8F51B8", 276, true],
    ["purple", "#AF86C1", 282, false],
    ["purple", "#CEBBD3", 288, true],
    ["purple", "#572C77", 274, false],
    ["purple", "#C29FC6", 294, true],
    ["purple", "#8B418B", 300, false],
    ["purple", "#4E2C4A", 308, true],
    ["brown", "#37241A", 20, true],
    ["brown", "#51392A", 24, false],
    ["brown", "#674932", 26, true],
    ["brown", "#7E5F44", 28, false],
    ["brown", "#9A7A5B", 30, true],
    ["brown", "#B19F8B", 32, false],
    ["brown", "#462E20", 22, true],
    ["brown", "#C3B9AC", 34, false],
    ["brown", "#6F5C3E", 36, true],
    ["brown", "#8F7C5B", 38, false],
    ["gray", "#1C1C1C", null, true],
    ["gray", "#4A4A4A", null, false],
    ["gray", "#6E6E6E", null, true],
    ["gray", "#9A9A9A", null, false],
    ["gray", "#C8C8C8", null, true],
    ["gray", "#E4E4E4", null, false],
    ["gray", "#2E2E2E", null, false],
    ["gray", "#808080", null, true],
    ["gray", "#B0B0B0", null, false],
    ["gray", "#555555", null, true],
    ["white", "#FFFFFF", null, false],
    ["white", "#F7F7F5", null, false],
    ["white", "#F4F1EA", null, true],
    ["white", "#EFEFEF", null, false],
    ["white", "#FAF8F4", null, true],
    ["white", "#E8E6E1", null, false],
    ["white", "#FDFDFD", null, false],
    ["white", "#F2F0EB", null, true],
    ["white", "#EAEAEA", null, false],
    ["white", "#F8F6F2", null, true],
    ["black", "#000000", null, false],
    ["black", "#0A0A0A", null, true],
    ["black", "#111111", null, false],
    ["black", "#161616", null, true],
    ["black", "#050505", null, false],
    ["black", "#1A1A1A", null, true],
    ["black", "#080808", null, false],
    ["black", "#121212", null, true],
    ["black", "#0E0E0E", null, false],
    ["black", "#181818", null, true]
  ];

  var CARS = PAINTS.map(function (row, i) {
    return {
      i: i,
      family: row[0],
      hex: row[1],
      hue: row[2],
      metallic: row[3],
      region: REGIONS[i % REGIONS.length]
    };
  });

  var stage = document.getElementById("cc-stage");
  var buttons = document.querySelectorAll(".cc-mode");
  var mode = "family";
  var agOn = false;
  var agPrev = "family";
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

  var SPILL_SOLID = 0.62;

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
    disk.style.background = "radial-gradient(circle closest-side, " + ink + " 0%, " + ink + " 62%, " + fade + " 100%)";
    disk.style.boxShadow = "none";
    spill.appendChild(disk);
    document.body.appendChild(spill);
    var t0 = performance.now();
    var life = 1280;
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

  function byLight(a, b) {
    return lightness(a.hex) - lightness(b.hex);
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
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function renderFamily() {
    clear(stage);
    FAMILIES.forEach(function (name) {
      var group = CARS.filter(function (car) { return car.family === name; }).sort(byLight);
      var block = document.createElement("section");
      block.className = "cc-family";
      var heading = document.createElement("h2");
      heading.className = "cc-label";
      heading.textContent = name;
      var row = document.createElement("div");
      row.className = "cc-row";
      group.forEach(function (car) { row.appendChild(dot(car)); });
      block.appendChild(heading);
      block.appendChild(row);
      stage.appendChild(block);
    });
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

  function renderScatter() {
    clear(stage);
    var width = Math.max(160, stage.clientWidth);
    var rng = mulberry32(0xC0105);
    var order = shuffle(CARS, rng);
    var size = dotPx();
    var minD = size + Math.max(8, Math.round(size * 0.28));
    var placed = [];
    var height = Math.max(360, Math.ceil((order.length * minD * minD * 1.35) / width));

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
    field.style.height = Math.ceil(height) + "px";
    placed.forEach(function (item) {
      var el = dot(item.car);
      el.style.left = item.x + "px";
      el.style.top = item.y + "px";
      field.appendChild(el);
    });
    stage.appendChild(field);
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
    var width = Math.max(160, stage.clientWidth);
    var cols = regionColumns(width);
    var gap = 38;
    var colW = (width - gap * (cols - 1)) / cols;
    var wrap = document.createElement("div");
    wrap.className = "cc-regions";
    REGIONS.forEach(function (name) {
      var group = CARS.filter(function (car) { return car.region === name; });
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
    stage.appendChild(wrap);
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
    var sorted = CARS.slice().sort(hueOrder);
    var wrap = document.createElement("div");
    wrap.className = "cc-hue";
    wrap.style.gridTemplateColumns = "repeat(" + cols + ", " + size + "px)";
    sorted.forEach(function (car, i) {
      var row = Math.floor(i / cols);
      var col = i % cols;
      if (row % 2 === 1) col = cols - 1 - col;
      var el = dot(car);
      el.style.gridRow = String(row + 1);
      el.style.gridColumn = String(col + 1);
      wrap.appendChild(el);
    });
    stage.appendChild(wrap);
  }

  function render() {
    applyMetrics();
    if (mode === "scatter") renderScatter();
    else if (mode === "region") renderRegion();
    else if (mode === "hue") renderHue();
    else renderFamily();
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
      button.classList.toggle("cc-on", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
    var ag = document.querySelector(".cc-ag");
    if (ag) {
      ag.classList.toggle("cc-ag-on", agOn);
      ag.setAttribute("aria-pressed", agOn ? "true" : "false");
    }
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
    var W = field.clientWidth || stage.clientWidth || 800;
    var H = field.clientHeight || parseFloat(field.style.height) || 0;
    var pad = 4;
    agBodies.forEach(function (b) {
      var maxX = Math.max(pad, W - b.w - pad);
      var maxY = Math.max(pad, H - b.h - pad);
      if (b.x < pad) b.x = pad;
      else if (b.x > maxX) b.x = maxX;
      if (b.y < pad) b.y = pad;
      else if (b.y > maxY) b.y = maxY;
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
    var W = field.clientWidth || stage.clientWidth || 800;
    var H = field.clientHeight || parseFloat(field.style.height) || 0;
    var pad = 4;
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
      var maxX = Math.max(pad, W - b.w - pad);
      var maxY = Math.max(pad, H - b.h - pad);
      if (b.x < pad) {
        b.x = pad;
        b.vx = Math.abs(b.vx);
        if (b.tvx != null) b.tvx = Math.abs(b.tvx);
      } else if (b.x > maxX) {
        b.x = maxX;
        b.vx = -Math.abs(b.vx);
        if (b.tvx != null) b.tvx = -Math.abs(b.tvx);
      }
      if (b.y < pad) {
        b.y = pad;
        b.vy = Math.abs(b.vy);
        if (b.tvy != null) b.tvy = Math.abs(b.tvy);
      } else if (b.y > maxY) {
        b.y = maxY;
        b.vy = -Math.abs(b.vy);
        if (b.tvy != null) b.tvy = -Math.abs(b.tvy);
      }
      paintBody(b);
    }
    agRaf = requestAnimationFrame(tickAg);
  }

  function enterAg() {
    if (agOn) return;
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
    mode = next || agPrev || "family";
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
    if (Math.abs(prevPx - px) > 0.5 || !stage.querySelector(".cc-dot")) render();
  }

  buttons.forEach(function (button) {
    button.addEventListener("click", function () {
      clearPageColour();
      if (draggingSlider) return;
      var next = button.getAttribute("data-cc-mode");
      if (agOn) {
        leaveAg(next);
        return;
      }
      if (next === mode) return;
      mode = next;
      syncButtons();
      render();
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
    if (e.target.closest && (e.target.closest(".cc-mode") || e.target.closest(".cc-ag") || e.target.closest(".cc-zslider"))) {
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
  applySize(phone ? 4 : storedCols());
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
        return;
      }
      if (agOn) clampBodies();
      else if (mode !== "family") render();
    }, 80);
  });
})();
