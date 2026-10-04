/* Sample cars only. Each dot is a photographed car; there are no image files.
   metallic is kept on the record even though the dot shows color alone. */
(function () {
  var DOT = 16;
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
    var minD = DOT + 6;
    var placed = [];
    var height = Math.max(360, Math.ceil((order.length * minD * minD * 1.35) / width));

    function fits(x, y, limit) {
      if (x < 0 || y < 0 || x > width - DOT || y > limit - DOT) return false;
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
        var x = rng() * (width - DOT);
        var y = rng() * (height - DOT);
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
          for (yScan = 0; yScan <= height - DOT; yScan += step) {
            var xScan;
            for (xScan = 0; xScan <= width - DOT; xScan += step) {
              var jx = Math.min(width - DOT, Math.max(0, xScan + (rng() - 0.5) * 6));
              var jy = Math.min(height - DOT, Math.max(0, yScan + (rng() - 0.5) * 6));
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
    var spacing = 22;
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
        w: maxX - minX + DOT + 4,
        h: maxY - minY + DOT + 4
      };
    }
    var pack = measure(spacing);
    while (spacing > 16 && pack.w > maxW) {
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
      var pack = clump(group.length, Math.max(DOT + 4, colW - 4));
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
    var gap = 8;
    var cols = Math.max(1, Math.floor((width + gap) / (DOT + gap)));
    var sorted = CARS.slice().sort(hueOrder);
    var wrap = document.createElement("div");
    wrap.className = "cc-hue";
    wrap.style.gridTemplateColumns = "repeat(" + cols + ", " + DOT + "px)";
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
    if (mode === "scatter") renderScatter();
    else if (mode === "region") renderRegion();
    else if (mode === "hue") renderHue();
    else renderFamily();
  }

  buttons.forEach(function (button) {
    button.addEventListener("click", function () {
      mode = button.getAttribute("data-cc-mode");
      buttons.forEach(function (other) {
        var on = other === button;
        other.classList.toggle("cc-on", on);
        other.setAttribute("aria-pressed", on ? "true" : "false");
      });
      render();
    });
  });

  var resizeTimer = 0;
  window.addEventListener("resize", function () {
    if (mode === "family") return;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(render, 80);
  });

  render();
})();
