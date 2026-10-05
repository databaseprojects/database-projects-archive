/* Sample cars only. Each dot is a photographed car; there are no image files.
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

  /* family, hex, hue (null = neutral), metallic.
     Vancouver street colours: mostly blue, grey, black, and white, with a little red and teal. */
  var PAINTS = [
    ["blue", "#1A3346", 208, true],
    ["grey", "#C5C9CE", null, false],
    ["blue", "#163044", 210, false],
    ["white", "#F4F5F6", null, true],
    ["blue", "#0F2A3C", 212, true],
    ["grey", "#8E949A", null, false],
    ["blue", "#1C3E58", 211, false],
    ["white", "#E7E9EB", null, true],
    ["blue", "#21445C", 209, true],
    ["grey", "#D4D7DA", null, false],
    ["blue", "#1B3144", 214, false],
    ["blue", "#9BB4C6", 205, true],
    ["blue", "#1F4560", 209, true],
    ["grey", "#6E747A", null, false],
    ["blue", "#184058", 212, false],
    ["white", "#F7F7F5", null, true],
    ["blue", "#123248", 215, true],
    ["blue", "#5E84A0", 204, false],
    ["blue", "#0E2940", 213, false],
    ["grey", "#B7BCC1", null, true],
    ["blue", "#2A4E6C", 206, true],
    ["white", "#EEF0F2", null, false],
    ["blue", "#2E5674", 208, false],
    ["grey", "#A3A8AE", null, true],
    ["teal", "#1E4A48", 176, true],
    ["white", "#F2F1EE", null, false],
    ["teal", "#173E3C", 174, false],
    ["blue", "#7A9AB0", 206, true],
    ["teal", "#1A403E", 175, true],
    ["grey", "#8A9094", null, false],
    ["teal", "#245854", 177, false],
    ["white", "#FAFBFC", null, true],
    ["red", "#7A3032", 4, true],
    ["grey", "#C8CCD0", null, false],
    ["red", "#642428", 358, false],
    ["blue", "#B4C6D4", 207, true],
    ["red", "#5C2226", 0, true],
    ["red", "#8C3A36", 6, false],
    ["red", "#542024", 356, false],
    ["white", "#E4E6E8", null, true],
    ["black", "#101214", null, true],
    ["grey", "#9AA0A6", null, false],
    ["black", "#1A1C1F", null, false],
    ["blue", "#4E7490", 203, true],
    ["black", "#0C0E10", null, true],
    ["white", "#FDFDFC", null, false],
    ["black", "#16181B", null, false],
    ["grey", "#D8DBDE", null, true],
    ["black", "#08090B", null, true],
    ["blue", "#6E90A8", 208, false],
    ["black", "#141618", null, false],
    ["white", "#F0F1F3", null, true],
    ["black", "#1E2124", null, true],
    ["grey", "#7E868C", null, false],
    ["black", "#050607", null, false],
    ["grey", "#747A80", null, true],
    ["black", "#121416", null, true],
    ["grey", "#90969C", null, false],
    ["black", "#0A0C0E", null, false],
    ["grey", "#B0B5BA", null, true],
    ["black", "#0E1013", null, true],
    ["grey", "#5C6368", null, false],
    ["grey", "#2A2E32", null, false],
    ["grey", "#686E74", null, true],
    ["grey", "#3E4348", null, true],
    ["grey", "#A8ADB2", null, false],
    ["grey", "#2C3136", null, false],
    ["grey", "#E0E2E4", null, true],
    ["grey", "#3A4046", null, true],
    ["blue", "#3A6280", 207, false],
    ["grey", "#1C1E22", null, false],
    ["blue", "#3E6C88", 206, true],
    ["grey", "#26282C", null, true],
    ["blue", "#4A7390", 204, false],
    ["blue", "#264A68", 210, false],
    ["blue", "#567E98", 205, true],
    ["teal", "#2A5E5C", 179, true],
    ["white", "#F6F6F4", null, false],
    ["red", "#722C2E", 2, false],
    ["white", "#E8EAEB", null, true],
    ["grey", "#4A5056", null, true],
    ["white", "#FBFBFA", null, false],
    ["grey", "#555B61", null, false],
    ["white", "#E2E4E6", null, true],
    ["black", "#17191C", null, true],
    ["white", "#F3F4F5", null, false],
    ["black", "#1C1E22", null, false],
    ["white", "#ECEEEF", null, true],
    ["blue", "#2C4A62", 207, true],
    ["white", "#F8F8F6", null, false],
    ["teal", "#1A4546", 173, false],
    ["white", "#E6E8EA", null, true],
    ["grey", "#32363A", null, true],
    ["teal", "#4E8882", 182, false],
    ["black", "#222428", null, false],
    ["teal", "#3E7A74", 180, true],
    ["red", "#6E3834", 8, true],
    ["red", "#8A3432", 6, false],
    ["blue", "#1A3C52", 208, false],
    ["blue", "#6A8CA4", 206, true]
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

  /* Sample colours for the other cities. They show up only when that city is selected. */
  var OTHER_CITIES = [
    ["Toronto", "Kensington", "red", "#6E1E2F", 348, false],
    ["Toronto", "Kensington", "orange", "#C45C26", 18, true],
    ["Toronto", "Kensington", "blue", "#1F3A5F", 214, false],
    ["Toronto", "Kensington", "yellow", "#E6D2A8", 40, true],
    ["Toronto", "Leslieville", "red", "#5C2A2A", 0, true],
    ["Toronto", "Leslieville", "orange", "#D4785A", 14, false],
    ["Toronto", "Leslieville", "blue", "#243E4A", 196, true],
    ["Toronto", "Leslieville", "white", "#F0E6D4", null, false],
    ["Toronto", "The Annex", "brown", "#7A3E2E", 16, false],
    ["Toronto", "The Annex", "blue", "#3D4C6A", 222, true],
    ["Toronto", "The Annex", "yellow", "#C4A46A", 42, false],
    ["Toronto", "The Annex", "white", "#EFE7DC", null, true],
    ["Toronto", "Parkdale", "red", "#A33B32", 4, true],
    ["Toronto", "Parkdale", "blue", "#2C3E50", 208, false],
    ["Toronto", "Parkdale", "orange", "#B87333", 28, true],
    ["Toronto", "Parkdale", "white", "#F4EDE3", null, false],
    ["Seattle", "Capitol Hill", "green", "#1F4D3A", 152, false],
    ["Seattle", "Capitol Hill", "green", "#4F6F5A", 140, true],
    ["Seattle", "Capitol Hill", "grey", "#7A8C7B", null, false],
    ["Seattle", "Capitol Hill", "white", "#D5DDD6", null, true],
    ["Seattle", "Ballard", "blue", "#1E3A4C", 202, true],
    ["Seattle", "Ballard", "blue", "#3E6B7A", 192, false],
    ["Seattle", "Ballard", "grey", "#8AA0A8", null, true],
    ["Seattle", "Ballard", "white", "#E4E8E6", null, false],
    ["Seattle", "Fremont", "green", "#2F5D50", 160, true],
    ["Seattle", "Fremont", "green", "#6E8B74", 120, false],
    ["Seattle", "Fremont", "grey", "#A8B5A0", null, true],
    ["Seattle", "Fremont", "white", "#F2F0E8", null, false],
    ["Seattle", "Queen Anne", "grey", "#243038", null, false],
    ["Seattle", "Queen Anne", "grey", "#5C6B73", null, true],
    ["Seattle", "Queen Anne", "green", "#9AA7A1", 150, false],
    ["Seattle", "Queen Anne", "white", "#E7E4DC", null, true],
    ["Los Angeles", "Silver Lake", "orange", "#E07A5F", 14, false],
    ["Los Angeles", "Silver Lake", "yellow", "#F2CC8F", 40, true],
    ["Los Angeles", "Silver Lake", "blue", "#3D5A80", 214, false],
    ["Los Angeles", "Silver Lake", "white", "#F4F1DE", null, true],
    ["Los Angeles", "Venice", "orange", "#E8A87C", 24, true],
    ["Los Angeles", "Venice", "green", "#41B3A3", 172, false],
    ["Los Angeles", "Venice", "red", "#E27D60", 12, true],
    ["Los Angeles", "Venice", "white", "#F7F3E9", null, false],
    ["Los Angeles", "Echo Park", "red", "#C44536", 6, false],
    ["Los Angeles", "Echo Park", "orange", "#F2A365", 28, true],
    ["Los Angeles", "Echo Park", "blue", "#2E5266", 200, false],
    ["Los Angeles", "Echo Park", "white", "#F6E7D8", null, true],
    ["Los Angeles", "Los Feliz", "brown", "#D4A373", 32, true],
    ["Los Angeles", "Los Feliz", "red", "#E5989B", 356, false],
    ["Los Angeles", "Los Feliz", "purple", "#6D597A", 270, true],
    ["Los Angeles", "Los Feliz", "yellow", "#FEFAE0", 54, false]
  ];
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
  var buttons = document.querySelectorAll(".cc-mode");
  var mode = "scatter";
  var agOn = false;
  var agPrev = "scatter";
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
      width: Math.max(160, doc.clientWidth || window.innerWidth || 800),
      height: Math.max(360, doc.clientHeight || window.innerHeight || 800)
    };
  }

  function renderScatter() {
    clear(stage);
    document.body.classList.add("cc-screen");
    var box = screenBox();
    var width = box.width;
    var height = box.height;
    var rng = mulberry32(0xC0105);
    var order = shuffle(carsIn("Vancouver"), rng);
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

  function renderCityOptions(parent) {
    var bar = document.createElement("div");
    bar.className = "cc-cities";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "City");
    CITIES.forEach(function (name) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "cc-city" + (name === city ? " cc-on" : "");
      button.setAttribute("data-cc-city", name);
      button.setAttribute("aria-pressed", name === city ? "true" : "false");
      button.textContent = name;
      button.addEventListener("click", function () {
        clearPageColour();
        if (name === city || agOn) return;
        city = name;
        if (mode === "region") renderRegion();
      });
      bar.appendChild(button);
    });
    parent.appendChild(bar);
  }

  function renderRegion() {
    clear(stage);
    var view = document.createElement("div");
    view.className = "cc-region-view";
    renderCityOptions(view);
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

  /* Schematic Vancouver, viewBox 0 0 120 100, north up. No names.
     Shore lines draw the waterfront only. Dots sit on the street paths. */
  var MAP_VB_W = 120;
  var MAP_VB_H = 100;
  var MAP_PATHS = [
    { shore: true, pts: [[8, 5], [28, 7], [52, 3], [78, 6], [104, 8], [118, 6]] },
    { shore: true, pts: [[30, 9], [20, 13], [15, 22], [17, 32], [26, 38], [36, 36], [41, 26], [39, 16], [30, 9]] },
    { shore: true, pts: [[41, 16], [54, 12], [72, 14], [92, 18], [112, 24]] },
    { shore: true, pts: [[17, 34], [10, 42], [8, 54], [10, 70], [14, 86], [22, 98]] },
    { shore: true, pts: [[18, 50], [28, 44], [40, 46], [52, 41], [64, 39], [73, 46], [74, 54], [66, 58], [52, 56], [36, 58], [24, 55], [18, 50]] },
    { shore: true, pts: [[22, 98], [46, 95], [74, 99], [100, 96], [118, 98]] },
    { pts: [[31, 18], [40, 32]] },
    { pts: [[42, 18], [66, 36]] },
    { pts: [[44, 26], [58, 38]] },
    { pts: [[42, 34], [50, 40]] },
    { pts: [[46, 15], [70, 32]] },
    { pts: [[60, 13], [46, 42], [40, 56]] },
    { pts: [[54, 16], [44, 36]] },
    { pts: [[66, 17], [54, 40], [50, 56], [46, 96]] },
    { pts: [[72, 22], [66, 38], [64, 56], [64, 96]] },
    { pts: [[68, 32], [110, 30]] },
    { pts: [[12, 60], [38, 60]] },
    { pts: [[12, 68], [112, 68]] },
    { pts: [[14, 78], [110, 78]] },
    { pts: [[16, 88], [112, 88]] },
    { pts: [[24, 96], [108, 96]] },
    { pts: [[20, 58], [20, 96]] },
    { pts: [[32, 60], [32, 96]] },
    { pts: [[56, 58], [56, 96]] },
    { pts: [[80, 34], [80, 98]] },
    { pts: [[94, 28], [94, 78]] },
    { pts: [[106, 26], [106, 96]] },
    { pts: [[76, 50], [112, 48]] }
  ];

  function mapPathD(pts) {
    return pts.map(function (p, i) {
      return (i ? "L " : "M ") + p[0] + " " + p[1];
    }).join(" ");
  }

  function vancouverMapLines() {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "cc-map-lines");
    svg.setAttribute("viewBox", "0 0 " + MAP_VB_W + " " + MAP_VB_H);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    MAP_PATHS.forEach(function (path) {
      var el = document.createElementNS("http://www.w3.org/2000/svg", "path");
      el.setAttribute("d", mapPathD(path.pts));
      svg.appendChild(el);
    });
    return svg;
  }

  function mapStreetSegments(width, height) {
    var segs = [];
    MAP_PATHS.forEach(function (path) {
      if (path.shore) return;
      var pts = path.pts;
      var i;
      for (i = 1; i < pts.length; i++) {
        var x1 = (pts[i - 1][0] / MAP_VB_W) * width;
        var y1 = (pts[i - 1][1] / MAP_VB_H) * height;
        var x2 = (pts[i][0] / MAP_VB_W) * width;
        var y2 = (pts[i][1] / MAP_VB_H) * height;
        var len = Math.hypot(x2 - x1, y2 - y1);
        if (len < 1) continue;
        segs.push({ x1: x1, y1: y1, x2: x2, y2: y2, len: len });
      }
    });
    return segs;
  }

  function renderMap() {
    clear(stage);
    var width = Math.max(280, stage.clientWidth);
    var height = Math.max(640, Math.round(width * MAP_VB_H / MAP_VB_W));
    var field = document.createElement("div");
    field.className = "cc-map";
    field.style.height = height + "px";
    field.appendChild(vancouverMapLines());
    var size = dotPx();
    var rng = mulberry32(0x5A11);
    var cars = shuffle(carsIn("Vancouver"), rng);
    var segs = mapStreetSegments(width, height);
    var total = 0;
    var si;
    for (si = 0; si < segs.length; si++) total += segs[si].len;

    function clampU(u) {
      if (u < 0.03) return 0.03;
      if (u > 0.97) return 0.97;
      return u;
    }

    function placeAt(item) {
      var seg = segs[item.seg];
      item.u = clampU(item.u);
      item.cx = seg.x1 + (seg.x2 - seg.x1) * item.u;
      item.cy = seg.y1 + (seg.y2 - seg.y1) * item.u;
    }

    function pickSeg(t) {
      var walk = t * total;
      var i;
      for (i = 0; i < segs.length; i++) {
        walk -= segs[i].len;
        if (walk <= 0) return i;
      }
      return segs.length - 1;
    }

    var items = [];
    cars.forEach(function (car) {
      var segIndex;
      var u;
      if (items.length && rng() < 0.46) {
        var host = items[Math.floor(rng() * items.length)];
        segIndex = host.seg;
        var along = (rng() - 0.5) * Math.min(0.62, 140 / (segs[segIndex].len || 1));
        u = host.u + along;
      } else {
        segIndex = pickSeg(rng());
        u = rng();
      }
      var item = { car: car, seg: segIndex, u: u };
      placeAt(item);
      items.push(item);
    });

    items.forEach(function (item) {
      var el = dot(item.car);
      el.style.left = (item.cx - size / 2).toFixed(1) + "px";
      el.style.top = (item.cy - size / 2).toFixed(1) + "px";
      field.appendChild(el);
    });
    stage.appendChild(field);
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
    var sorted = carsIn("Vancouver").slice().sort(hueOrder);
    var wrap = document.createElement("div");
    wrap.className = "cc-hue";
    wrap.style.gridTemplateColumns = "repeat(" + cols + ", " + size + "px)";
    wrap.style.gridAutoRows = size + "px";
    wrap.style.gap = gap + "px";
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

  function agTop(field) {
    var top = field.getBoundingClientRect().top + (window.pageYOffset || 0);
    return isFinite(top) ? -top : 0;
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
    var minY = agTop(field);
    agBodies.forEach(function (b) {
      var maxX = Math.max(pad, W - b.w - pad);
      var maxY = Math.max(minY, H - b.h - pad);
      if (b.x < pad) b.x = pad;
      else if (b.x > maxX) b.x = maxX;
      if (b.y < minY) b.y = minY;
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
    var minY = agTop(field);
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
      var maxY = Math.max(minY, H - b.h - pad);
      if (b.x < pad) {
        b.x = pad;
        b.vx = Math.abs(b.vx);
        if (b.tvx != null) b.tvx = Math.abs(b.tvx);
      } else if (b.x > maxX) {
        b.x = maxX;
        b.vx = -Math.abs(b.vx);
        if (b.tvx != null) b.tvx = -Math.abs(b.tvx);
      }
      if (b.y < minY) {
        b.y = minY;
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
    mode = next || agPrev || "scatter";
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
      if (agOn) {
        leaveAg(next);
        return;
      }
      if (next === mode) return;
      var before = snapshotDots();
      mode = next;
      syncButtons();
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
    if (e.target.closest && (e.target.closest(".cc-mode") || e.target.closest(".cc-city") || e.target.closest(".cc-ag") || e.target.closest(".cc-zslider"))) {
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
