/* Found Photographs: column size, row / table / floating layouts, hover, flip, lightbox. */
(function () {
  var COL_KEY = "fpZoomCols";
  var LAYOUT_KEY = "fpLayout";
  var POS_KEY = "fpTablePosV2";
  var TIGHT_KEY = "fpTableShuffleTight";
  var MIN = 6;
  var MAX = 20;
  var DEF = 6;
  var PRINT_MAX = 430;
  var HOVER_BOOST = 1.04;
  var HOVER_CAP = 6;
  var HYST = 0.72;
  var DELAY = 280;
  var DRAG_THRESH = 5;
  var SC_MIN = 0.94;
  var SC_MAX = 1.06;
  var zTop = 30;
  var pending = null;
  var itemDrag = null;
  var zLock = null;
  var draggingSlider = false;
  var zVal = null;
  var pendingCols = null;

  function grid() {
    return document.querySelector(".fp-grid");
  }

  function tiles() {
    var g = grid();
    if (!g) return [];
    return Array.prototype.slice.call(g.querySelectorAll(".fp-tile")).sort(function (a, b) {
      return (+a.getAttribute("data-order") || 0) - (+b.getAttribute("data-order") || 0);
    });
  }

  function clampCols(n) {
    n = Math.round(+n);
    return n >= MIN && n <= MAX ? n : DEF;
  }

  function phoneSlider() {
    return window.matchMedia("(max-width: 767px)").matches;
  }

  function tabletSlider() {
    return !phoneSlider() && window.matchMedia("(max-width: 1100px)").matches;
  }

  function sliderBand() {
    if (phoneSlider()) return "phone";
    if (tabletSlider()) return "tablet";
    return "desk";
  }

  function sliderEnds() {
    if (phoneSlider()) return { min: 3, max: 7 };
    if (tabletSlider()) return { min: 4, max: 18 };
    return { min: MIN, max: MAX };
  }

  /* Tablet column counts sit on a shorter track so each slider position is
     about a fifth wider, with 4 across at the large end. Store the desktop
     equivalent so a tablet visit does not overwrite a desktop size. */
  function desktopColsForStore(n) {
    n = Math.round(+n);
    if (!tabletSlider()) return n;
    var ends = sliderEnds();
    var t = (n - ends.min) / (ends.max - ends.min);
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    return Math.round(MIN + t * (MAX - MIN));
  }

  function colsForThisScreen(stored) {
    stored = clampCols(stored);
    if (!tabletSlider()) return stored;
    var ends = sliderEnds();
    var t = (stored - MIN) / (MAX - MIN);
    return Math.round(ends.min + t * (ends.max - ends.min));
  }

  function persistCols(n) {
    if (phoneSlider()) return;
    saveCols(desktopColsForStore(n));
  }

  function clampSlider(n) {
    var ends = sliderEnds();
    n = Math.round(+n);
    if (n < ends.min) return ends.min;
    if (n > ends.max) return ends.max;
    return n;
  }

  function cols() {
    var g = grid();
    var raw = g ? g.getAttribute("data-columns") || DEF : DEF;
    if (phoneSlider() || tabletSlider()) return clampSlider(raw);
    return clampCols(raw);
  }

  function storedCols() {
    var n = DEF;
    try {
      n = parseInt(localStorage.getItem(COL_KEY), 10);
    } catch (e) {}
    return clampCols(n || DEF);
  }

  function saveCols(n) {
    try {
      localStorage.setItem(COL_KEY, String(n));
    } catch (e) {}
  }

  function normalizeLayout(v) {
    if (v === "table") return "table";
    if (v === "antigravity" || v === "float") return "antigravity";
    return "row";
  }

  function layoutMode() {
    var v = "row";
    try {
      v = localStorage.getItem(LAYOUT_KEY) || "row";
    } catch (e) {}
    return normalizeLayout(v);
  }

  function saveLayout(v) {
    v = normalizeLayout(v);
    try {
      localStorage.setItem(LAYOUT_KEY, v);
    } catch (e) {}
    return v;
  }

  function isTable() {
    return layoutMode() === "table";
  }

  function isAg() {
    return layoutMode() === "antigravity";
  }

  function isScatter() {
    return isTable() || isAg();
  }

  function imgOf(tile) {
    return tile.querySelector("img");
  }

  function hiSrc(src, px) {
    if (!src) return src;
    var mm = src.match(/\/w\/(\d+)\//);
    if (mm) {
      var freight = Math.min(2000, Math.max(+mm[1], px || 1600));
      return src.replace(/\/w\/\d+\//, "/w/" + freight + "/");
    }
    var tm = src.match(/\/image\/upload\/([^/]+)\//);
    if (!tm) return src;
    var trans = tm[1];
    var wm = trans.match(/w_(\d+)/);
    if (!wm || trans.indexOf("f_auto") === -1 || trans.indexOf("q_auto") === -1) return src;
    var have = +wm[1];
    var ask = Math.round(+px || have);
    if (!(ask > 0)) ask = have;
    var need = Math.min(2000, Math.max(have, ask));
    if (need === have) return src;
    var next = trans.replace(/w_\d+/, "w_" + need).replace(/h_\d+/, "h_" + need);
    return src.replace("/image/upload/" + trans + "/", "/image/upload/" + next + "/");
  }

  function galleryBox(nw, nh, allowUpscale) {
    if (!(nw > 1) || !(nh > 1)) return null;
    var maxW = Math.min(window.innerWidth * 0.96, 1600);
    var maxH = window.innerHeight * 0.92;
    var fit = Math.min(maxW / nw, maxH / nh);
    if (!allowUpscale && fit > 1) fit = 1;
    fit *= 0.81;
    return { w: nw * fit, h: nh * fit };
  }

  function lockGalleryBox(img, nw, nh, allowUpscale) {
    var box = galleryBox(nw, nh, allowUpscale);
    if (!box || !img) return;
    img.style.width = box.w.toFixed(2) + "px";
    img.style.height = box.h.toFixed(2) + "px";
    img.style.maxWidth = "none";
    img.style.maxHeight = "none";
  }

  function hasBack(tile) {
    return !!(tile.getAttribute("data-back") || "").trim();
  }

  function posKey(tile) {
    var src = tile.getAttribute("data-front") || "";
    var base = (src.match(/FastFoto_[^/?#]+/i) || src.match(/[^/]+\.(?:jpe?g|png|webp)/i) || [src])[0];
    return (base || src).split("?")[0];
  }

  function loadPos() {
    try {
      var raw = localStorage.getItem(POS_KEY);
      var o = raw ? JSON.parse(raw) : {};
      return o && typeof o === "object" ? o : {};
    } catch (e) {
      return {};
    }
  }

  function savePos(map) {
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(map || {}));
    } catch (e) {}
  }

  function hasTableArrangement() {
    var map = loadPos();
    var k;
    for (k in map) {
      if (Object.prototype.hasOwnProperty.call(map, k)) return true;
    }
    return false;
  }

  function clampSc(s) {
    s = +s;
    if (!(s > 0)) return 1;
    if (s < SC_MIN) return SC_MIN;
    if (s > SC_MAX) return SC_MAX;
    return s;
  }

  function gapPx(g) {
    var raw = getComputedStyle(g).columnGap || getComputedStyle(g).gap || "16px";
    var n = parseFloat(raw);
    return n > 0 ? n : 16;
  }

  function tileWidth(g) {
    g = g || grid();
    var n = cols();
    var w = (g && g.clientWidth) || Math.min(document.documentElement.clientWidth || 900, 1200);
    var gap = g ? gapPx(g) : 16;
    var colW = n > 0 ? (w - gap * Math.max(0, n - 1)) / n : w;
    return Math.max(72, Math.min(PRINT_MAX, Math.floor(colW)));
  }

  function columnWidth(g) {
    g = g || grid();
    var n = cols();
    var w = (g && g.clientWidth) || Math.min(document.documentElement.clientWidth || 900, 1200);
    var gap = g ? gapPx(g) : 16;
    var colW = n > 0 ? (w - gap * Math.max(0, n - 1)) / n : w;
    if (!(colW > 1)) colW = w;
    return Math.min(PRINT_MAX, colW);
  }

  function tileHeight(tile, tw) {
    var ar = parseFloat(tile.style.getPropertyValue("--fp-ar"));
    if (!(ar > 0.2 && ar < 5)) ar = 0.85;
    return Math.max(80, tw / ar);
  }

  function aspectHeight(tile, tw) {
    var ar = parseFloat(tile.style.getPropertyValue("--fp-ar"));
    if (!(ar > 0.2 && ar < 5)) ar = 0.85;
    return tw / ar;
  }

  function syncAspect(tile) {
    var img = imgOf(tile);
    if (!img) return;
    if (tile.style.getPropertyValue("--fp-ar")) return;
    var go = function () {
      if (tile.style.getPropertyValue("--fp-ar")) return;
      if (!(img.naturalWidth > 1 && img.naturalHeight > 1)) return;
      var ar = (img.naturalWidth / img.naturalHeight).toFixed(5);
      tile.style.setProperty("--fp-ar", ar);
    };
    if (img.complete && img.naturalWidth > 1) go();
    else img.addEventListener("load", go, { once: true });
  }

  function releaseHold(g, fade) {
    if (!g || !g.classList.contains("fp-hold")) return;
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fade || reduce) {
      g.classList.remove("fp-hold");
      g.classList.remove("fp-reveal");
      return;
    }
    g.classList.add("fp-reveal");
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (!g.classList.contains("fp-hold")) return;
        g.classList.remove("fp-hold");
      });
    });
    var clear = function (ev) {
      if (ev && ev.target !== g) return;
      g.removeEventListener("transitionend", clear);
      g.classList.remove("fp-reveal");
    };
    g.addEventListener("transitionend", clear);
    setTimeout(function () { g.classList.remove("fp-reveal"); }, 700);
  }

  function settleArrival() {
    var g = grid();
    if (!g || !g.classList.contains("fp-hold")) return;
    var imgs = Array.prototype.slice.call(g.querySelectorAll(".fp-tile > img"));
    var left = imgs.length;
    var waited = false;
    var opened = false;
    function finish() {
      if (opened) return;
      opened = true;
      if (!g.classList.contains("fp-hold")) return;
      imgs.forEach(function (img) {
        if (!(img.naturalWidth > 0)) {
          if (!img.complete) {
            img.style.opacity = "0";
            var show = function () {
              img.removeEventListener("load", show);
              img.removeEventListener("error", show);
              img.style.opacity = "";
            };
            img.addEventListener("load", show);
            img.addEventListener("error", show);
          }
          return;
        }
        img.style.filter = "contrast(1)";
      });
      void g.offsetWidth;
      imgs.forEach(function (img) {
        img.style.filter = "";
      });
      /* Tags start loading in the document head. Hold the photos until they
         are mounted so the bar and the prints appear together. A failed or
         stalled file still opens the page. */
      var paint = function () {
        if (window.fpHoldReleased) return;
        window.fpHoldReleased = true;
        releaseHold(g, waited);
      };
      var ready = window.fpTagsReady;
      if (!ready || !ready.then) {
        paint();
        return;
      }
      var timer = setTimeout(paint, 4000);
      ready.then(function (data) {
        clearTimeout(timer);
        if (window.fpMountTags) window.fpMountTags(data);
        paint();
      }).catch(function () {
        clearTimeout(timer);
        paint();
      });
    }
    function note(late) {
      if (opened) return;
      if (late) waited = true;
      left -= 1;
      if (left <= 0) finish();
    }
    if (!imgs.length) {
      finish();
      return;
    }
    imgs.forEach(function (img) {
      var late = !(img.naturalWidth > 0);
      var onDone = function () {
        if (img._fpSettled) return;
        if (!(img.naturalWidth > 0) && !img.complete) return;
        img._fpSettled = true;
        img.removeEventListener("load", onDone);
        img.removeEventListener("error", onDone);
        note(late);
      };
      img.addEventListener("load", onDone);
      img.addEventListener("error", onDone);
      onDone();
    });
    setTimeout(finish, 20000);
  }

  function wakeImages() {
    var g = grid();
    if (!g) return;
    Array.prototype.forEach.call(g.querySelectorAll("img"), function (img) {
      var src = img.getAttribute("src");
      if (!src) return;
      img.decoding = "sync";
      img.loading = "eager";
      var redo = function () {
        if (img.naturalWidth > 0) return;
        img.src = src;
      };
      if (img.decode) img.decode().then(function () {}).catch(redo);
      else if (img.complete) redo();
    });
  }

  function setCount() {
    var c = document.querySelector(".fp-count");
    var n = tiles().length;
    if (c) c.textContent = n + " of " + n;
  }

  function fillSlider(v) {
    var s = document.querySelector(".fp-zslider");
    if (!s) return;
    var ends = sliderEnds();
    s.min = String(ends.min);
    s.max = String(ends.max);
    if (draggingSlider) return;
    s.style.setProperty("--fp-p", (((v - ends.min) / (ends.max - ends.min)) * 100).toFixed(2) + "%");
    if (+s.value !== v) s.value = v;
  }

  function syncLayoutButtons() {
    var mode = layoutMode();
    var g = grid();
    if (g) g.setAttribute("data-fp-layout", mode);
    document.querySelectorAll(".fp-laybtn").forEach(function (b) {
      var on = b.getAttribute("data-fp-lay") === mode;
      b.classList.toggle("fp-lay-on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    var ag = document.querySelector(".fp-ag");
    if (ag) {
      var agOn = mode === "antigravity";
      ag.classList.toggle("fp-ag-on", agOn);
      ag.setAttribute("aria-pressed", agOn ? "true" : "false");
    }
    var scatter = mode === "table" || mode === "antigravity";
    document.body.classList.toggle("fp-under-menu", scatter);
    if (scatter) {
      var nav = document.querySelector(".bk-nav");
      if (nav) document.documentElement.style.setProperty("--fp-nav-h", nav.offsetHeight + "px");
    }
  }

  function applyRowWidths(g) {
    g = g || grid();
    if (!g || isScatter()) return;
    var tw = tileWidth(g);
    g.style.setProperty("--fp-cols", String(cols()));
    g.style.setProperty("--fp-tile-w", tw + "px");
    tiles().forEach(function (tile) {
      tile.style.setProperty("--fp-tile-w", tw + "px");
    });
  }

  function clearScatter(g) {
    if (!g) return;
    g.style.removeProperty("--fp-table-h");
    tiles().forEach(function (tile) {
      tile.style.removeProperty("--fp-nx");
      tile.style.removeProperty("--fp-ny");
      tile.style.removeProperty("--fp-sc");
      tile.style.removeProperty("--fp-z");
      tile.style.removeProperty("--fp-rot");
      tile.classList.remove("fp-dragging");
    });
  }

  function surfaceHeight(g, tw, items) {
    var gw = g.clientWidth || 800;
    var area = items.length * tw * tw * 1.12 * 0.62;
    var h = Math.ceil(area / Math.max(gw, 1));
    return Math.max(Math.floor((window.innerHeight || 700) * 0.72), h, Math.ceil(tw * 1.12 * 2.2));
  }

  function tableSpreadHeight(g, tw, items) {
    var base = surfaceHeight(g, tw, items);
    var vh = window.innerHeight || 700;
    return Math.ceil(Math.max(base * 1.55, vh * 1.4));
  }

  /* Nudge apart pairs that nearly cover each other. A little overlap stays.
     Equal-and-opposite pushes keep the scatter centred. */
  function easeCovers(pts, widthOf, heightOf, bounds) {
    var n = pts.length;
    var limit = 0.36;
    var i;
    var j;
    var iter;
    for (iter = 0; iter < 22; iter++) {
      var worst = 0;
      for (i = 0; i < n; i++) {
        var aw = widthOf(i);
        var ah = heightOf(i);
        for (j = i + 1; j < n; j++) {
          var bw = widthOf(j);
          var bh = heightOf(j);
          var ax = pts[i].x;
          var ay = pts[i].y;
          var bx = pts[j].x;
          var by = pts[j].y;
          var ox = Math.min(ax + aw, bx + bw) - Math.max(ax, bx);
          var oy = Math.min(ay + ah, by + bh) - Math.max(ay, by);
          if (!(ox > 0) || !(oy > 0)) continue;
          var small = Math.min(aw * ah, bw * bh);
          if (!(small > 1)) continue;
          var cover = (ox * oy) / small;
          if (cover > worst) worst = cover;
          if (cover <= limit) continue;
          var dx = (bx + bw / 2) - (ax + aw / 2);
          var dy = (by + bh / 2) - (ay + ah / 2);
          var len = Math.hypot(dx, dy);
          if (len < 1) {
            dx = (j - i) || 1;
            dy = ((i * 5 + j) % 7) - 3;
            if (!dy) dy = 1;
            len = Math.hypot(dx, dy);
          }
          var push = Math.min(ox, oy) * (cover > 0.62 ? 0.55 : 0.34) * 0.5;
          var ux = dx / len;
          var uy = dy / len;
          pts[i].x -= ux * push;
          pts[i].y -= uy * push;
          pts[j].x += ux * push;
          pts[j].y += uy * push;
        }
      }
      if (bounds) {
        for (i = 0; i < n; i++) {
          if (pts[i].x < bounds.minX) pts[i].x = bounds.minX;
          else if (pts[i].x > bounds.maxX) pts[i].x = bounds.maxX;
        }
      }
      if (worst <= limit) break;
    }
  }

  function easeTileCovers(list, bounds) {
    var pts = [];
    list.forEach(function (tile) {
      if (!tile || tile.hidden) return;
      var w = parseFloat(tile.style.getPropertyValue("--fp-tile-w")) || tile.offsetWidth || 80;
      var h = tile.offsetHeight > 20 ? tile.offsetHeight : tileHeight(tile, w);
      pts.push({
        tile: tile,
        x: parseFloat(tile.style.getPropertyValue("--fp-nx")) || 0,
        y: parseFloat(tile.style.getPropertyValue("--fp-ny")) || 0,
        w: w,
        h: h
      });
    });
    easeCovers(pts, function (i) { return pts[i].w; }, function (i) { return pts[i].h; }, bounds);
    pts.forEach(function (p) {
      p.tile.style.setProperty("--fp-nx", p.x.toFixed(1) + "px");
      p.tile.style.setProperty("--fp-ny", p.y.toFixed(1) + "px");
    });
  }

  function fitTableHeight(g) {
    g = g || grid();
    if (!g || g.getAttribute("data-fp-layout") !== "table") return;
    var bottom = 0;
    var any = false;
    tiles().forEach(function (tile) {
      if (tile.hidden || tile.classList.contains("fp-tag-leave")) return;
      var ny = parseFloat(tile.style.getPropertyValue("--fp-ny"));
      if (!isFinite(ny)) return;
      var tw = parseFloat(tile.style.getPropertyValue("--fp-tile-w")) || columnWidth(g);
      var th = tile.offsetHeight > 20 ? tile.offsetHeight : tileHeight(tile, tw);
      var rot = Math.abs(parseFloat(tile.style.getPropertyValue("--fp-rot")) || 0) * Math.PI / 180;
      var overhang = Math.abs(Math.sin(rot)) * tw * 0.5;
      var end = ny + th + overhang;
      if (end > bottom) bottom = end;
      any = true;
    });
    if (!any) return;
    var buffer = (window.innerHeight || 700) * 0.18;
    g.style.setProperty("--fp-table-h", Math.ceil(Math.max(0, bottom) + buffer) + "px");
  }

  function freshTilt(used) {
    var deg = 0;
    var guard = 0;
    do {
      var sign = Math.random() < 0.5 ? -1 : 1;
      deg = Math.round(sign * (2.2 + Math.random() * 3.6) * 10) / 10;
      guard += 1;
    } while (used[String(deg)] && guard < 40);
    used[String(deg)] = true;
    return deg;
  }

  function tableTilt(tile, saved, used) {
    if (tile.getAttribute("data-fp-straight") === "1") return 0;
    var held = parseFloat(tile.getAttribute("data-fp-tilt"));
    if (isFinite(held)) {
      used[String(held)] = true;
      return held;
    }
    if (saved && typeof saved.r === "number") {
      if (saved.r === 0) {
        tile.setAttribute("data-fp-straight", "1");
        tile.setAttribute("data-fp-tilt", "0");
        return 0;
      }
      tile.setAttribute("data-fp-tilt", String(saved.r));
      used[String(saved.r)] = true;
      return saved.r;
    }
    var deg = freshTilt(used);
    tile.setAttribute("data-fp-tilt", String(deg));
    return deg;
  }

  function assignTableSkew() {
    var used = {};
    tiles().forEach(function (tile) {
      tile.removeAttribute("data-fp-straight");
      tile.removeAttribute("data-fp-tilt");
      var deg = freshTilt(used);
      tile.setAttribute("data-fp-tilt", String(deg));
      tile.style.setProperty("--fp-rot", deg.toFixed(1) + "deg");
    });
  }

  function straighten(tile) {
    tile.setAttribute("data-fp-straight", "1");
    tile.setAttribute("data-fp-tilt", "0");
    tile.style.setProperty("--fp-rot", "0deg");
  }

  function topInset(g) {
    var top = g.getBoundingClientRect().top;
    return isFinite(top) ? -top : 0;
  }

  function pageTop(g) {
    var top = g.getBoundingClientRect().top + (window.pageYOffset || 0);
    return isFinite(top) ? -top : 0;
  }

  /* Table prints are positioned on the grid, which already starts under the
     bar. Rotation and scale can still reach back up into the tags. */
  function tableTopFloor(tile, tw, th) {
    var rot = Math.abs(parseFloat(tile.style.getPropertyValue("--fp-rot")) || 0) * Math.PI / 180;
    var sc = parseFloat(tile.style.getPropertyValue("--fp-sc"));
    if (!(sc > 0)) sc = 1;
    if (!(tw > 0)) tw = tile.offsetWidth || 0;
    if (!(th > 0)) th = tile.offsetHeight > 20 ? tile.offsetHeight : tileHeight(tile, tw || 1);
    var boxH = (tw * Math.abs(Math.sin(rot)) + th * Math.abs(Math.cos(rot))) * sc;
    return Math.max(0, boxH / 2 - th / 2);
  }

  function seatTableBelowBar(g, only) {
    g = g || grid();
    if (!g || g.getAttribute("data-fp-layout") !== "table") return 0;
    var list = only || tiles();
    var need = 0;
    var rows = [];
    var i;
    for (i = 0; i < list.length; i++) {
      var tile = list[i];
      if (!tile) continue;
      var ny = parseFloat(tile.style.getPropertyValue("--fp-ny"));
      if (!isFinite(ny)) continue;
      var tw = parseFloat(tile.style.getPropertyValue("--fp-tile-w")) || tile.offsetWidth || columnWidth(g);
      var th = tile.offsetHeight > 20 ? tile.offsetHeight : tileHeight(tile, tw);
      var gap = tableTopFloor(tile, tw, th) - ny;
      if (gap > need) need = gap;
      rows.push(tile);
    }
    if (!(need > 0.5)) return 0;
    need += 1;
    for (i = 0; i < rows.length; i++) {
      var y = parseFloat(rows[i].style.getPropertyValue("--fp-ny"));
      rows[i].style.setProperty("--fp-ny", (y + need).toFixed(1) + "px");
    }
    return need;
  }

  function spreadRng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
      return a / 4294967296;
    };
  }

  function spreadClear(x, y, w, h, placed, gap) {
    var i;
    for (i = 0; i < placed.length; i++) {
      var p = placed[i];
      if (x < p.x + p.w + gap && x + w + gap > p.x && y < p.y + p.h + gap && y + h + gap > p.y) return false;
    }
    return true;
  }

  function spreadPoints(items, gw, gh, tw, pad, minY) {
    var n = items.length;
    var rng = spreadRng(0x51A7B);
    var heights = new Array(n);
    var points = new Array(n);
    var placed = [];
    var i;
    for (i = 0; i < n; i++) heights[i] = tileHeight(items[i], tw);
    for (i = 0; i < n; i++) {
      var h = heights[i];
      var maxX = Math.max(pad, gw - tw - pad);
      var maxY = Math.max(minY, gh - h - pad);
      var spanX = Math.max(1, maxX - pad);
      var spanY = Math.max(1, maxY - minY);
      var gap = 6 + Math.floor(rng() * 8);
      var found = null;
      var tries;
      for (tries = 0; tries < 160 && !found; tries++) {
        var x = pad + rng() * spanX;
        var y = minY + rng() * spanY;
        if (spreadClear(x, y, tw, h, placed, gap)) found = { x: x, y: y };
      }
      if (!found) {
        for (tries = 0; tries < 80 && !found; tries++) {
          var x2 = pad + rng() * spanX;
          var y2 = minY + rng() * spanY;
          if (spreadClear(x2, y2, tw, h, placed, 3)) found = { x: x2, y: y2 };
        }
      }
      if (!found) {
        var best = null;
        var bestD = -Infinity;
        var s;
        for (s = 0; s < 24; s++) {
          var x3 = pad + rng() * spanX;
          var y3 = minY + rng() * spanY;
          var nearest = Infinity;
          var j;
          for (j = 0; j < placed.length; j++) {
            var p = placed[j];
            var dx = Math.abs((x3 + tw / 2) - (p.x + p.w / 2)) - (tw + p.w) / 2;
            var dy = Math.abs((y3 + h / 2) - (p.y + p.h / 2)) - (h + p.h) / 2;
            var sep = Math.min(dx, dy);
            if (sep < nearest) nearest = sep;
          }
          if (nearest > bestD) {
            bestD = nearest;
            best = { x: x3, y: y3 };
          }
        }
        found = best;
      }
      placed.push({ x: found.x, y: found.y, w: tw, h: h });
      points[i] = found;
    }
    var iter;
    var j;
    for (iter = 0; iter < 10; iter++) {
      for (i = 0; i < n; i++) {
        for (j = i + 1; j < n; j++) {
          var a = points[i];
          var b = points[j];
          var ha = heights[i];
          var hb = heights[j];
          var dx = (b.x + tw / 2) - (a.x + tw / 2);
          var dy = (b.y + hb / 2) - (a.y + ha / 2);
          var penX = tw + 4 - Math.abs(dx);
          var penY = (ha + hb) / 2 + 4 - Math.abs(dy);
          if (penX <= 0 || penY <= 0) continue;
          var len = Math.hypot(dx, dy);
          var ux = len > 0.5 ? dx / len : 1;
          var uy = len > 0.5 ? dy / len : 0;
          var push = Math.min(penX, penY) * 0.45;
          a.x -= ux * push;
          a.y -= uy * push;
          b.x += ux * push;
          b.y += uy * push;
        }
      }
      for (i = 0; i < n; i++) {
        var limX = Math.max(pad, gw - tw - pad);
        var limY = Math.max(minY, gh - heights[i] - pad);
        if (points[i].x < pad) points[i].x = pad;
        else if (points[i].x > limX) points[i].x = limX;
        if (points[i].y < minY) points[i].y = minY;
        else if (points[i].y > limY) points[i].y = limY;
      }
    }
    var mx = 0;
    var my = 0;
    for (i = 0; i < n; i++) {
      mx += points[i].x + tw / 2;
      my += points[i].y + heights[i] / 2;
    }
    mx /= n;
    my /= n;
    var pullX = 1;
    var pullY = 0.9;
    for (i = 0; i < n; i++) {
      var cx = points[i].x + tw / 2;
      var cy = points[i].y + heights[i] / 2;
      points[i].x = mx + (cx - mx) * pullX - tw / 2;
      points[i].y = my + (cy - my) * pullY - heights[i] / 2;
    }
    for (iter = 0; iter < 8; iter++) {
      for (i = 0; i < n; i++) {
        for (j = i + 1; j < n; j++) {
          var a2 = points[i];
          var b2 = points[j];
          var ha2 = heights[i];
          var hb2 = heights[j];
          var dx2 = (b2.x + tw / 2) - (a2.x + tw / 2);
          var dy2 = (b2.y + hb2 / 2) - (a2.y + ha2 / 2);
          var penX2 = tw + 6 - Math.abs(dx2);
          var penY2 = (ha2 + hb2) / 2 + 6 - Math.abs(dy2);
          if (penX2 <= 0 || penY2 <= 0) continue;
          var len2 = Math.hypot(dx2, dy2);
          var ux2 = len2 > 0.5 ? dx2 / len2 : 1;
          var uy2 = len2 > 0.5 ? dy2 / len2 : 0;
          var push2 = Math.min(penX2, penY2) * 0.5;
          a2.x -= ux2 * push2;
          a2.y -= uy2 * push2;
          b2.x += ux2 * push2;
          b2.y += uy2 * push2;
        }
      }
    }
    var top = Infinity;
    for (i = 0; i < n; i++) if (points[i].y < top) top = points[i].y;
    var shiftY = top - minY;
    for (i = 0; i < n; i++) points[i].y -= shiftY;
    var bx = 0;
    var by = 0;
    for (i = 0; i < n; i++) {
      bx += points[i].x + tw / 2;
      by += points[i].y + heights[i] / 2;
    }
    bx /= n;
    by /= n;
    var widenX = 1.2;
    var widenY = 1.05;
    for (i = 0; i < n; i++) {
      var sx = points[i].x + tw / 2;
      var sy = points[i].y + heights[i] / 2;
      points[i].x = bx + (sx - bx) * widenX - tw / 2;
      points[i].y = by + (sy - by) * widenY - heights[i] / 2;
    }
    var top2 = Infinity;
    for (i = 0; i < n; i++) if (points[i].y < top2) top2 = points[i].y;
    var shift2 = top2 - minY;
    for (i = 0; i < n; i++) {
      points[i].y -= shift2;
      var limX2 = Math.max(pad, gw - tw - pad);
      if (points[i].x < pad) points[i].x = pad;
      else if (points[i].x > limX2) points[i].x = limX2;
    }
    easeCovers(points, function () { return tw; }, function (idx) { return heights[idx]; }, {
      minX: pad,
      maxX: Math.max(pad, gw - tw - pad)
    });
    return points;
  }

  function applyScatter(g, force, resetSpread) {
    if (!g) return;
    var filtering = document.documentElement.hasAttribute("data-fp-filter");
    if (filtering && !force && !resetSpread) {
      var placed = false;
      var probe = tiles();
      var pi;
      for (pi = 0; pi < probe.length; pi++) {
        var px = parseFloat(probe[pi].style.getPropertyValue("--fp-nx"));
        var py = parseFloat(probe[pi].style.getPropertyValue("--fp-ny"));
        if (isFinite(px) && isFinite(py)) {
          placed = true;
          break;
        }
      }
      /* Positions were just cleared on the way back from Row. Restore the
         saved spread instead of leaving every print at the corner. */
      if (placed) {
        if (window.fpTagLayout) window.fpTagLayout("scale");
        return;
      }
    }
    var map = force || resetSpread ? {} : loadPos();
    if ((force || resetSpread) && !filtering) {
      try {
        localStorage.removeItem(POS_KEY);
        localStorage.removeItem(TIGHT_KEY);
      } catch (e) {}
    }
    var items = tiles();
    var tw = columnWidth(g);
    var gw = g.clientWidth || 800;
    var gh = tableSpreadHeight(g, tw, items);
    g.style.setProperty("--fp-tile-w", tw + "px");
    var pad = 8;
    var minY = pageTop(g);
    var points = resetSpread ? spreadPoints(items, gw, gh, tw, pad, minY) : null;
    if (points) {
      var bottom = minY;
      items.forEach(function (tile, i) {
        var end = points[i].y + tileHeight(tile, tw);
        if (end > bottom) bottom = end;
      });
      gh = Math.ceil(bottom + pad);
    } else if (map) {
      var savedBottom = minY;
      items.forEach(function (tile) {
        var rec = map[posKey(tile)];
        if (!rec || typeof rec.y !== "number") return;
        var end = rec.y + tileHeight(tile, tw);
        if (end > savedBottom) savedBottom = end;
      });
      gh = Math.max(gh, Math.ceil(savedBottom + pad));
    }
    g.style.setProperty("--fp-table-h", gh + "px");
    var usedTilts = {};
    items.forEach(function (tile, i) {
      var key = posKey(tile);
      var saved = map[key];
      var th = tileHeight(tile, tw);
      var maxX = Math.max(pad, gw - tw - pad);
      var maxY = Math.max(minY, gh - th - pad);
      var nx;
      var ny;
      var sc;
      var z;
      var oldW = parseFloat(tile.style.getPropertyValue("--fp-tile-w"));
      var oldX = parseFloat(tile.style.getPropertyValue("--fp-nx"));
      var oldY = parseFloat(tile.style.getPropertyValue("--fp-ny"));
      var placed = isFinite(oldX) && isFinite(oldY) && isFinite(oldW) && oldW > 0;
      if (points) {
        nx = points[i].x;
        ny = points[i].y;
        sc = 1;
        z = 1 + (i % 20);
        map[key] = { x: nx, y: ny, s: sc, z: z };
      } else if (!force && placed && Math.abs(oldW - tw) > 0.5) {
        var oldH = aspectHeight(tile, oldW);
        nx = oldX + (oldW - tw) / 2;
        ny = oldY + (oldH - aspectHeight(tile, tw)) / 2;
        var prevSc = parseFloat(tile.style.getPropertyValue("--fp-sc"));
        sc = prevSc > 0 ? clampSc(prevSc) : saved ? clampSc(saved.s) : 1;
        z = parseInt(tile.style.getPropertyValue("--fp-z"), 10);
        if (!(z > 0)) z = saved && typeof saved.z === "number" ? saved.z : 1 + (i % 20);
        if (saved) {
          saved.x = nx;
          saved.y = ny;
          map[key] = saved;
        }
      } else if (!force && placed) {
        nx = oldX;
        ny = oldY;
        var keepSc = parseFloat(tile.style.getPropertyValue("--fp-sc"));
        sc = keepSc > 0 ? clampSc(keepSc) : saved ? clampSc(saved.s) : 1;
        z = parseInt(tile.style.getPropertyValue("--fp-z"), 10);
        if (!(z > 0)) z = saved && typeof saved.z === "number" ? saved.z : 1 + (i % 20);
      } else if (saved && typeof saved.x === "number" && typeof saved.y === "number") {
        nx = saved.x;
        ny = saved.y;
        sc = clampSc(saved.s);
        z = typeof saved.z === "number" ? saved.z : 1 + (i % 20);
        if (nx > gw - tw * 0.3) nx = maxX;
        if (ny > gh - th * 0.3) ny = maxY;
        if (nx < -tw * 0.2) nx = pad;
        if (ny < minY) ny = minY;
      } else {
        nx = pad + Math.random() * Math.max(1, maxX - pad);
        ny = minY + Math.random() * Math.max(1, maxY - minY);
        sc = clampSc(0.97 + Math.random() * 0.06);
        z = 1 + (i % 20);
      }
      if (z > zTop) zTop = z;
      var rot = tableTilt(tile, saved, usedTilts);
      tile.style.setProperty("--fp-nx", nx.toFixed(1) + "px");
      tile.style.setProperty("--fp-ny", ny.toFixed(1) + "px");
      tile.style.setProperty("--fp-sc", sc.toFixed(3));
      tile.style.setProperty("--fp-z", String(z));
      tile.style.setProperty("--fp-rot", rot.toFixed(1) + "deg");
      tile.style.setProperty("--fp-tile-w", tw + "px");
      tile.style.setProperty("--fp-tx", "0px");
      tile.style.setProperty("--fp-ty", "0px");
    });
    zTop += 1;
    if (seatTableBelowBar(g) && map) {
      items.forEach(function (tile) {
        var key = posKey(tile);
        if (!map[key]) return;
        var seatedY = parseFloat(tile.style.getPropertyValue("--fp-ny"));
        if (isFinite(seatedY)) map[key].y = seatedY;
      });
    }
    if (!force && map && !document.documentElement.hasAttribute("data-fp-filter")) savePos(map);
    if (document.documentElement.hasAttribute("data-fp-filter") && window.fpTagLayout) window.fpTagLayout("scale");
    fitTableHeight(g);
  }

  function persist(tile) {
    var map = loadPos();
    var straight = tile.getAttribute("data-fp-straight") === "1";
    var tilt = parseFloat(tile.getAttribute("data-fp-tilt"));
    var rec = {
      x: parseFloat(tile.style.getPropertyValue("--fp-nx")) || 0,
      y: parseFloat(tile.style.getPropertyValue("--fp-ny")) || 0,
      s: clampSc(parseFloat(tile.style.getPropertyValue("--fp-sc"))),
      z: parseInt(tile.style.getPropertyValue("--fp-z"), 10) || zTop
    };
    if (straight) rec.r = 0;
    else if (isFinite(tilt)) rec.r = tilt;
    map[posKey(tile)] = rec;
    savePos(map);
  }

  var agRaf = 0;
  var agBodies = [];
  var agRunning = false;
  var agLastTs = 0;
  var agRampT0 = 0;
  var agTick = null;
  var AG_SPEED_MIN = 12;
  var AG_SPEED_MAX = 58;
  var AG_RAMP_MS = 1600;

  function stopAntigravity() {
    agRunning = false;
    if (agRaf) {
      cancelAnimationFrame(agRaf);
      agRaf = 0;
    }
    agBodies = [];
    agLastTs = 0;
    agRampT0 = 0;
    agTick = null;
  }

  function clearAntigravity(g) {
    stopAntigravity();
    g = g || grid();
    if (!g) return;
    g.style.removeProperty("--fp-ag-h");
    g.classList.remove("fp-ag-in");
    clearTimeout(g._agShade);
    tiles().forEach(function (tile) {
      tile.style.removeProperty("--fp-nx");
      tile.style.removeProperty("--fp-ny");
      tile.style.removeProperty("--fp-sc");
      tile.style.removeProperty("--fp-z");
      tile.style.removeProperty("--fp-rot");
      tile.style.removeProperty("--fp-tile-w");
      tile.style.removeProperty("--fp-tx");
      tile.style.removeProperty("--fp-ty");
      tile.classList.remove("fp-dragging");
    });
  }

  function randSpeed() {
    var s = AG_SPEED_MIN + Math.random() * (AG_SPEED_MAX - AG_SPEED_MIN);
    var a = Math.random() * Math.PI * 2;
    return { vx: Math.cos(a) * s, vy: Math.sin(a) * s };
  }

  function captureAgSeeds(g) {
    g = g || grid();
    if (!g) return {};
    var gRect = g.getBoundingClientRect();
    var twFallback = tileWidth(g);
    var seeds = {};
    tiles().forEach(function (tile) {
      var r = tile.getBoundingClientRect();
      if (r.width > 0) {
        var x = r.left - gRect.left + (g.scrollLeft || 0);
        var y = r.top - gRect.top + (g.scrollTop || 0);
        seeds[posKey(tile)] = { x: x, y: y, cx: x + r.width / 2, cy: y + r.height / 2, fromRect: true };
        return;
      }
      var nx = parseFloat(tile.style.getPropertyValue("--fp-nx"));
      var ny = parseFloat(tile.style.getPropertyValue("--fp-ny"));
      var twM = parseFloat(tile.style.getPropertyValue("--fp-tile-w"));
      if (isFinite(nx) && isFinite(ny)) {
        var tw0 = isFinite(twM) && twM > 0 ? twM : twFallback;
        var th0 = tileHeight(tile, tw0);
        seeds[posKey(tile)] = { x: nx, y: ny, cx: nx + tw0 / 2, cy: ny + th0 / 2, fromRect: false };
      }
    });
    return seeds;
  }

  function agSurfaceHeight(g, tw, items) {
    var gw = (g && (g.clientWidth || g.offsetWidth)) || 800;
    var avgH = tw * 1.1;
    var area = items.length * tw * avgH * 0.7;
    var h = Math.ceil(area / Math.max(gw, 1));
    return Math.max(Math.floor((window.innerHeight || 700) * 0.78), h, Math.ceil(avgH * 2.4));
  }

  function agBodyFor(tile) {
    for (var i = 0; i < agBodies.length; i++) {
      if (agBodies[i].tile === tile) return agBodies[i];
    }
    return null;
  }

  function layoutSeed(tile, g) {
    var mode = g.getAttribute("data-fp-layout");
    if (mode === "table" || mode === "antigravity") {
      var nx = parseFloat(tile.style.getPropertyValue("--fp-nx"));
      var ny = parseFloat(tile.style.getPropertyValue("--fp-ny"));
      if (isFinite(nx) && isFinite(ny)) return { x: nx, y: ny, exact: true };
    }
    var gRect = g.getBoundingClientRect();
    var r = tile.getBoundingClientRect();
    if (!(r.width > 0)) return null;
    var x = r.left - gRect.left + (g.scrollLeft || 0);
    var y = r.top - gRect.top + (g.scrollTop || 0);
    return { x: x, y: y, exact: true, vw: r.width, vh: r.height };
  }

  var AG_FADE_MS = 3200;

  function zeroShadowAlpha(cs) {
    if (!cs || cs === "none") return "0 2px 6px rgba(0,0,0,0), 0 1px 1px rgba(0,0,0,0)";
    return cs.replace(/rgba?\(([^)]+)\)/g, function (_, inner) {
      var parts = inner.split(",").map(function (s) { return s.trim(); });
      if (parts.length >= 3) return "rgba(" + parts[0] + ", " + parts[1] + ", " + parts[2] + ", 0)";
      return "rgba(0, 0, 0, 0)";
    });
  }

  function beginShadowFade(g) {
    tiles().forEach(function (tile) {
      tile._fpShade = getComputedStyle(tile).boxShadow;
      tile.style.setProperty("transition", "none", "important");
    });
    g.classList.add("fp-ag-in");
    clearTimeout(g._agShade);
    g._agShade = setTimeout(function () {
      g.classList.remove("fp-ag-in");
      if (g.getAttribute("data-fp-layout") !== "antigravity") return;
      tiles().forEach(function (tile) {
        tile.style.removeProperty("transition");
      });
    }, AG_FADE_MS + 800);
  }

  function pinAgShadowFade() {
    tiles().forEach(function (tile) {
      var target = getComputedStyle(tile).boxShadow;
      var prev = tile._fpShade;
      delete tile._fpShade;
      var start = !prev || prev === "none" ? zeroShadowAlpha(target) : prev;
      tile.style.setProperty("box-shadow", start);
    });
  }

  function releaseAgMotion() {
    var list = tiles();
    list.forEach(function (tile) {
      tile.style.setProperty("transition", "box-shadow " + (AG_FADE_MS / 1000) + "s cubic-bezier(0.45, 0.05, 0.55, 0.95)");
    });
    var g = grid();
    if (g) void g.offsetWidth;
    list.forEach(function (tile) {
      tile.style.removeProperty("box-shadow");
    });
  }

  function snapshotTiles(g) {
    var gr = g.getBoundingClientRect();
    return {
      gridTop: gr.top,
      tiles: tiles().map(function (tile) {
        var r = tile.getBoundingClientRect();
        return { tile: tile, left: r.left, top: r.top };
      })
    };
  }

  function restoreSnapshot(g, snap, bodies) {
    if (!snap) return;
    var gr = g.getBoundingClientRect();
    var moved = gr.top - snap.gridTop;
    if (Math.abs(moved) > 0.5) window.scrollBy(0, moved);
    snap.tiles.forEach(function (item) {
      var r = item.tile.getBoundingClientRect();
      var dx = item.left - r.left;
      var dy = item.top - r.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      var nx = (parseFloat(item.tile.style.getPropertyValue("--fp-nx")) || 0) + dx;
      var ny = (parseFloat(item.tile.style.getPropertyValue("--fp-ny")) || 0) + dy;
      item.tile.style.setProperty("--fp-nx", nx.toFixed(1) + "px");
      item.tile.style.setProperty("--fp-ny", ny.toFixed(1) + "px");
      item.tile.style.left = nx.toFixed(1) + "px";
      item.tile.style.top = ny.toFixed(1) + "px";
      for (var i = 0; i < bodies.length; i++) {
        if (bodies[i].tile === item.tile) {
          bodies[i].x = nx;
          bodies[i].y = ny;
          break;
        }
      }
    });
  }

  function applyAntigravity(g, seeds, opts) {
    opts = opts || {};
    var resume = !!opts.resume;
    g = g || grid();
    if (!g) return;
    if (!seeds || !Object.keys(seeds).length) seeds = captureAgSeeds(g);
    var savedRampT0 = resume ? agRampT0 : 0;
    var prevByEl = {};
    agBodies.forEach(function (body) {
      if (body && body.tile) prevByEl[posKey(body.tile)] = body;
    });
    if (agRaf) {
      cancelAnimationFrame(agRaf);
      agRaf = 0;
    }
    agBodies = [];
    agRunning = false;
    agLastTs = 0;
    if (!resume) agRampT0 = 0;
    var items = tiles();
    /* Any enter — row, table, or a slide still in motion — starts from the on-screen spots. */
    var held = !resume ? snapshotTiles(g) : null;
    items.forEach(dropMotion);
    var tw = columnWidth(g);
    var gw = g.clientWidth || g.offsetWidth || 800;
    if (!(gw > 40)) gw = Math.min(document.documentElement.clientWidth || 900, 1200);
    var heldH = g.offsetHeight || 0;
    var pad = 0;
    var bodies = [];
    var maxZ = zTop;
    var planned = [];
    var fit = heldH;
    items.forEach(function (tile, i) {
      var th = tileHeight(tile, tw);
      var laid = layoutSeed(tile, g);
      var seed = laid || (seeds && seeds[posKey(tile)]);
      var prev = prevByEl[posKey(tile)];
      var exact = !!(laid && laid.exact);
      var nx;
      var ny;
      if (seed && typeof seed.x === "number" && typeof seed.y === "number") {
        nx = seed.x;
        ny = seed.y;
      } else if (seed && typeof seed.cx === "number" && typeof seed.cy === "number") {
        nx = seed.cx - tw / 2;
        ny = seed.cy - th / 2;
      } else if (prev && isFinite(prev.x) && isFinite(prev.y)) {
        nx = prev.x;
        ny = prev.y;
        exact = true;
      } else {
        nx = 6 + Math.random() * Math.max(1, gw - tw - 12);
        ny = 6 + Math.random() * Math.max(1, 200);
        exact = false;
      }
      if (!exact) {
        var maxX0 = Math.max(0, gw - tw);
        if (nx < 0) nx = 0;
        else if (nx > maxX0) nx = maxX0;
        if (ny < 0) ny = 0;
      }
      var oldW = parseFloat(tile.style.getPropertyValue("--fp-tile-w"));
      var basisW = laid && laid.vw > 0 ? laid.vw : oldW;
      var basisH = laid && laid.vh > 0 ? laid.vh : 0;
      if (exact && basisW > 0 && Math.abs(basisW - tw) > 0.5) {
        nx += (basisW - tw) / 2;
        var prevH = basisH > 0 ? basisH : aspectHeight(tile, basisW);
        ny += (prevH - aspectHeight(tile, tw)) / 2;
      }
      var bottom = ny + th;
      if (bottom > fit) fit = bottom;
      planned.push({ tile: tile, i: i, th: th, nx: nx, ny: ny, prev: prev });
    });
    var gh = Math.max(agSurfaceHeight(g, tw, items), Math.ceil(fit));
    g.style.setProperty("--fp-ag-h", gh + "px");
    g.style.setProperty("--fp-tile-w", tw + "px");
    if (!resume) beginShadowFade(g);
    planned.forEach(function (p) {
      var tile = p.tile;
      var prev = p.prev;
      var tvx;
      var tvy;
      var vx;
      var vy;
      var held0;
      var driftAt = 0;
      var easeMs = 1;
      var spin = 0;
      var rot = 0;
      var rot0 = 0;
      var spinLim = 0;
      var spinHi = 0;
      var spinLo = 0;
      if (resume && prev && isFinite(prev.vx) && isFinite(prev.vy)) {
        tvx = prev.tvx != null ? prev.tvx : prev.vx;
        tvy = prev.tvy != null ? prev.tvy : prev.vy;
        vx = prev.vx;
        vy = prev.vy;
        held0 = !!prev.held;
        driftAt = prev.driftAt != null ? prev.driftAt : 0;
        easeMs = prev.easeMs > 0 ? prev.easeMs : 1;
        spin = prev.spin || 0;
        rot = isFinite(prev.rot) ? prev.rot : 0;
        rot0 = isFinite(prev.rot0) ? prev.rot0 : rot;
        spinLim = prev.spinLim || 0;
        spinHi = prev.spinHi > 0 ? prev.spinHi : spinLim;
        spinLo = prev.spinLo > 0 ? prev.spinLo : spinLim;
      } else {
        var vel = randSpeed();
        tvx = vel.vx * 0.85;
        tvy = vel.vy * 0.85;
        vx = 0;
        vy = 0;
        held0 = false;
        driftAt = performance.now() + Math.random() * 1400;
        easeMs = 560 + Math.random() * 1640;
        if (!resume && window.fpAgPrev === "table") {
          var base = parseFloat(tile.style.getPropertyValue("--fp-rot"));
          if (!isFinite(base)) base = parseFloat(tile.getAttribute("data-fp-tilt"));
          if (!isFinite(base)) base = 0;
          rot = base;
          rot0 = base;
          /* A small, slow rock. Each photo keeps its own swing and timing. */
          var amp = 0.7 + Math.random() * 0.9;
          var skew = 0.75 + Math.random() * 0.25;
          if (Math.random() < 0.5) {
            spinHi = amp;
            spinLo = amp * skew;
          } else {
            spinLo = amp;
            spinHi = amp * skew;
          }
          spinLim = amp;
          var leg = 9 + Math.random() * 8;
          spin = (Math.random() < 0.5 ? -1 : 1) * (((spinHi + spinLo) / 2) / leg);
          tile.style.setProperty("--fp-rot", base.toFixed(2) + "deg");
        }
      }
      var prevSc = parseFloat(tile.style.getPropertyValue("--fp-sc"));
      if (!(prevSc > 0) && prev && prev.sc > 0) prevSc = prev.sc;
      var sc = prevSc > 0 ? clampSc(prevSc) : 1;
      var z = parseInt(tile.style.getPropertyValue("--fp-z"), 10);
      if (!(z > 0)) z = 1 + (p.i % 24);
      if (z > maxZ) maxZ = z;
      tile.style.setProperty("--fp-nx", p.nx.toFixed(1) + "px");
      tile.style.setProperty("--fp-ny", p.ny.toFixed(1) + "px");
      tile.style.setProperty("--fp-sc", sc.toFixed(3));
      tile.style.setProperty("--fp-z", String(z));
      tile.style.setProperty("--fp-tile-w", tw + "px");
      tile.style.setProperty("--fp-tx", "0px");
      tile.style.setProperty("--fp-ty", "0px");
      bodies.push({
        tile: tile,
        x: p.nx,
        y: p.ny,
        vx: vx,
        vy: vy,
        tvx: tvx,
        tvy: tvy,
        w: tw,
        h: p.th,
        sc: sc,
        held: held0,
        driftAt: driftAt,
        easeMs: easeMs,
        spin: spin,
        rot: rot,
        rot0: rot0,
        spinLim: spinLim,
        spinHi: spinHi,
        spinLo: spinLo
      });
    });
    g.setAttribute("data-fp-layout", "antigravity");
    if (!resume) {
      bodies.forEach(function (b) {
        b.tile.style.left = b.x.toFixed(1) + "px";
        b.tile.style.top = b.y.toFixed(1) + "px";
        b.tile.style.translate = "0px 0px";
      });
      void g.offsetWidth;
      restoreSnapshot(g, held, bodies);
      pinAgShadowFade();
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          bodies.forEach(function (b) {
            if (!b || !b.tile) return;
            b.tile.style.removeProperty("left");
            b.tile.style.removeProperty("top");
            b.tile.style.removeProperty("translate");
          });
          releaseAgMotion();
        });
      });
    }
    zTop = Math.max(zTop, maxZ + 1);
    agBodies = bodies;
    agRunning = true;
    agLastTs = 0;
    if (resume) {
      agRampT0 = savedRampT0 || performance.now() - AG_RAMP_MS;
    } else {
      agRampT0 = 0;
    }
    agTick = function (ts) {
      if (!agRunning) return;
      if (!agLastTs) agLastTs = ts;
      var dt = Math.min(0.05, (ts - agLastTs) / 1000);
      agLastTs = ts;
      var gg = grid();
      if (!gg || gg.getAttribute("data-fp-layout") !== "antigravity") {
        stopAntigravity();
        return;
      }
      var W = gg.clientWidth || gw;
      var H = parseFloat(gg.style.getPropertyValue("--fp-ag-h")) || gh;
      var minY = pageTop(gg);
      for (var i = 0; i < agBodies.length; i++) {
        var b = agBodies[i];
        if (!b || !b.tile) continue;
        if (b.shufT0 != null) {
          var u = (ts - b.shufT0) / (b.shufMs || 520);
          if (u < 0) continue;
          if (u >= 1) {
            b.x = b.shufX1;
            b.y = b.shufY1;
            b.shufT0 = null;
            b.tile.style.setProperty("--fp-nx", b.x.toFixed(1) + "px");
            b.tile.style.setProperty("--fp-ny", b.y.toFixed(1) + "px");
            if (!(itemDrag && itemDrag.tile === b.tile)) {
              b.held = false;
              b.vx = 0;
              b.vy = 0;
              b.driftAt = 0;
              b.easeMs = 1;
            }
            continue;
          }
          u = u * u * (3 - 2 * u);
          b.x = b.shufX0 + (b.shufX1 - b.shufX0) * u;
          b.y = b.shufY0 + (b.shufY1 - b.shufY0) * u;
          b.held = true;
          b.vx = 0;
          b.vy = 0;
          b.tile.style.setProperty("--fp-nx", b.x.toFixed(1) + "px");
          b.tile.style.setProperty("--fp-ny", b.y.toFixed(1) + "px");
          continue;
        }
        if (b.held) continue;
        if (b.driftAt != null && ts < b.driftAt) continue;
        var th2 = tileHeight(b.tile, b.w);
        if (Math.abs(th2 - b.h) > 2) b.h = th2;
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
        var maxXb = Math.max(pad, W - b.w - pad);
        var maxYb = Math.max(minY, H - b.h - pad);
        if (b.x < pad) {
          b.x = pad;
          b.vx = Math.abs(b.vx);
          if (b.tvx != null) b.tvx = Math.abs(b.tvx);
        } else if (b.x > maxXb) {
          b.x = maxXb;
          b.vx = -Math.abs(b.vx);
          if (b.tvx != null) b.tvx = -Math.abs(b.tvx);
        }
        if (b.y < minY) {
          b.y = minY;
          b.vy = Math.abs(b.vy);
          if (b.tvy != null) b.tvy = Math.abs(b.tvy);
        } else if (b.y > maxYb) {
          b.y = maxYb;
          b.vy = -Math.abs(b.vy);
          if (b.tvy != null) b.tvy = -Math.abs(b.tvy);
        }
        b.tile.style.setProperty("--fp-nx", b.x.toFixed(1) + "px");
        b.tile.style.setProperty("--fp-ny", b.y.toFixed(1) + "px");
        if (b.spin) {
          b.rot += b.spin * dt;
          var origin = isFinite(b.rot0) ? b.rot0 : 0;
          var hi = b.spinHi > 0 ? b.spinHi : (b.spinLim || 8);
          var lo = b.spinLo > 0 ? b.spinLo : hi;
          if (b.rot > origin + hi) {
            b.rot = origin + hi;
            b.spin = -Math.abs(b.spin);
          } else if (b.rot < origin - lo) {
            b.rot = origin - lo;
            b.spin = Math.abs(b.spin);
          }
          b.tile.style.setProperty("--fp-rot", b.rot.toFixed(2) + "deg");
        }
      }
      agRaf = requestAnimationFrame(agTick);
    };
    agRaf = requestAnimationFrame(agTick);
  }

  function reseedAgShuffle(g) {
    g = g || grid();
    if (!g || g.getAttribute("data-fp-layout") !== "antigravity") return;
    if (!agBodies.length || !agTick) applyAntigravity(g, captureAgSeeds(g), { resume: !!agBodies.length });
    if (!agBodies.length || !agTick) return;
    var tw = columnWidth(g);
    var gw = g.clientWidth || g.offsetWidth || 800;
    if (!(gw > 40)) gw = Math.min(document.documentElement.clientWidth || 900, 1200);
    var gh = parseFloat(g.style.getPropertyValue("--fp-ag-h"));
    if (!(gh > 40)) gh = agSurfaceHeight(g, tw, tiles());
    var pad = 6;
    var minY = topInset(g);
    var now = performance.now();
    var moving = [];
    agBodies.forEach(function (b) {
      if (!b || !b.tile) return;
      (b.tile.getAnimations ? b.tile.getAnimations() : []).forEach(function (a) {
        if (a.id === "fp-flow") a.cancel();
      });
      var curX = parseFloat(b.tile.style.getPropertyValue("--fp-nx"));
      var curY = parseFloat(b.tile.style.getPropertyValue("--fp-ny"));
      if (!isFinite(curX)) curX = b.x;
      if (!isFinite(curY)) curY = b.y;
      if (!isFinite(curX)) curX = pad;
      if (!isFinite(curY)) curY = pad;
      b.x = curX;
      b.y = curY;
      var th = tileHeight(b.tile, b.w || tw);
      if (th > 0) b.h = th;
      var bw = b.w || tw;
      var maxX = Math.max(pad, gw - bw - pad);
      var maxY = Math.max(minY, gh - b.h - pad);
      var tx = pad + Math.random() * Math.max(1, maxX - pad);
      var ty = minY + Math.random() * Math.max(1, maxY - minY);
      if (Math.abs(tx - b.x) < 12 && Math.abs(ty - b.y) < 12) {
        tx = pad + Math.random() * Math.max(1, maxX - pad);
        ty = minY + Math.random() * Math.max(1, maxY - minY);
      }
      b.shufX0 = b.x;
      b.shufY0 = b.y;
      b.shufX1 = tx;
      b.shufY1 = ty;
      b.held = true;
      moving.push(b);
      b.vx = 0;
      b.vy = 0;
      var vel = randSpeed();
      b.tvx = vel.vx;
      b.tvy = vel.vy;
    });
    inReadingOrder(moving, function (b) { return b.shufY1 + (b.h || 0) / 2; }, function (b) { return b.shufX1; });
    var timing = staggerDelays(moving, 520);
    moving.forEach(function (b, i) {
      b.shufT0 = now + (timing.delays[i] || 0);
      b.shufMs = timing.move;
    });
    if (!agRunning) {
      agRunning = true;
      agLastTs = 0;
      if (!agRampT0) agRampT0 = now - AG_RAMP_MS;
      if (agRaf) cancelAnimationFrame(agRaf);
      agRaf = requestAnimationFrame(agTick);
    }
  }

  /* One spread per visual row, reused down the page. Neighbours in a row
     start apart, and the latest start still finishes at `total`. */
  function staggerDelays(items, total) {
    total = total > 0 ? total : 480;
    var n = items.length;
    if (n <= 1) return { move: Math.round(total), delays: n === 1 ? [0] : [] };
    var rows = [];
    var longest = 1;
    items.forEach(function (item) {
      var row = item._fpRow || 0;
      if (!rows[row]) rows[row] = [];
      rows[row].push(item);
      if (rows[row].length > longest) longest = rows[row].length;
    });
    var spread = Math.min(total * 0.62, Math.max(0, (longest - 1) * 72));
    var delays = new Array(n);
    var maxDelay = 0;
    var index = new Map();
    items.forEach(function (item, i) {
      index.set(item, i);
      delays[i] = 0;
    });
    rows.forEach(function (row, rIndex) {
      if (!row || row.length <= 1) return;
      var m = row.length;
      var shift = rIndex % m;
      var i;
      for (i = 0; i < m; i++) {
        var slot = (i + shift) % m;
        var d = Math.round((slot * spread) / (m - 1));
        delays[index.get(row[i])] = d;
        if (d > maxDelay) maxDelay = d;
      }
    });
    return { move: Math.max(1, Math.round(total - maxDelay)), delays: delays };
  }

  function glideDelta(tile, from, screen) {
    if (!tile || !from || !(from.width > 0)) return null;
    var b = tile.getBoundingClientRect();
    if (!(b.width > 0)) return null;
    if (screen) {
      var vh = window.innerHeight;
      var fromBottom = from.bottom != null ? from.bottom : from.top + from.height;
      var onScreen = (b.bottom > -40 && b.top < vh + 40) || (fromBottom > -40 && from.top < vh + 40);
      if (!onScreen) return null;
    }
    var dx = from.left + from.width / 2 - (b.left + b.width / 2);
    var dy = from.top + from.height / 2 - (b.top + b.height / 2);
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return null;
    return { dx: dx, dy: dy };
  }

  function clearGlide(tile) {
    tile.style.translate = "";
    tile.style.transform = "";
    tile.style.removeProperty("transition");
    tile.style.removeProperty("transition-property");
    tile.style.removeProperty("transition-duration");
    tile.style.removeProperty("transition-timing-function");
    tile.style.removeProperty("transition-delay");
  }

  function dropMotion(tile) {
    var owned = tile._fpGlide;
    if (owned) tile._fpGlide = null;
    if (owned && owned.timer) clearTimeout(owned.timer);
    if (owned && owned.onEnd) tile.removeEventListener("transitionend", owned.onEnd);
    (tile.getAnimations ? tile.getAnimations() : []).forEach(function (a) {
      if (a.id === "fp-flow") a.cancel();
      else if (a.id === "fp-tag" && !tile.classList.contains("fp-tag-leave")) a.cancel();
    });
    if (owned) clearGlide(tile);
  }

  function holdGlide(tile, from, opts) {
    opts = opts || {};
    var delta = glideDelta(tile, from, !!opts.screen);
    if (!delta) return null;
    var dx = delta.dx;
    var dy = delta.dy;
    var start = dx.toFixed(1) + "px " + dy.toFixed(1) + "px";
    /* Paint the current on-screen spot before any motion. A same-turn
       animation can replace this hold for one frame and flash the destination. */
    tile.style.setProperty("transition", "none", "important");
    tile.style.translate = start;
    var token = {};
    tile._fpGlide = token;
    var dur = opts.dur || 520;
    var delay = opts.delay || 0;
    var easing = opts.easing || "cubic-bezier(.22,.8,.25,1)";
    var finish = function () {
      if (tile._fpGlide !== token) return;
      tile._fpGlide = null;
      if (token.timer) clearTimeout(token.timer);
      if (token.onEnd) tile.removeEventListener("transitionend", token.onEnd);
      clearGlide(tile);
    };
    var onEnd = function (ev) {
      if (ev.propertyName !== "translate") return;
      finish();
    };
    token.onEnd = onEnd;
    requestAnimationFrame(function () {
      if (tile._fpGlide !== token) return;
      requestAnimationFrame(function () {
        if (tile._fpGlide !== token) return;
        tile.addEventListener("transitionend", onEnd);
        tile.style.removeProperty("transition");
        tile.style.setProperty("transition-property", "translate", "important");
        tile.style.setProperty("transition-duration", dur + "ms", "important");
        tile.style.setProperty("transition-timing-function", easing, "important");
        tile.style.setProperty("transition-delay", delay + "ms", "important");
        tile.style.translate = "0px 0px";
        token.timer = setTimeout(finish, delay + dur + 90);
      });
    });
    return token;
  }

  function inReadingOrder(items, midY, leftOf) {
    items.sort(function (a, b) {
      return midY(a) - midY(b) || leftOf(a) - leftOf(b);
    });
    var rowMid = -1e9;
    var row = -1;
    items.forEach(function (item) {
      var y = midY(item);
      if (y - rowMid > 56) {
        row++;
        rowMid = y;
      }
      item._fpRow = row;
    });
    items.sort(function (a, b) {
      return a._fpRow - b._fpRow || leftOf(a) - leftOf(b);
    });
    return items;
  }

  function runGlides(list, opts) {
    opts = opts || {};
    var plans = [];
    list.forEach(function (item) {
      if (!item || !glideDelta(item.tile, item.from, !!opts.screen)) return;
      plans.push(item);
    });
    inReadingOrder(plans, function (item) {
      var b = item.tile.getBoundingClientRect();
      return b.top + b.height / 2;
    }, function (item) {
      return item.tile.getBoundingClientRect().left;
    });
    var timing = staggerDelays(plans, opts.dur || 520);
    plans.forEach(function (item, i) {
      holdGlide(item.tile, item.from, {
        dur: timing.move,
        delay: timing.delays[i] || 0,
        easing: opts.easing,
        id: opts.id || "fp-flow"
      });
    });
  }

  function flow(mutate, opts) {
    opts = opts || {};
    var g = grid();
    if (!g) {
      mutate();
      return;
    }
    var items = tiles();
    var before = new Map();
    items.forEach(function (tile) {
      var r = tile.getBoundingClientRect();
      if (r.width) before.set(tile, r);
    });
    items.forEach(dropMotion);
    mutate();
    void g.offsetWidth;
    var list = [];
    items.forEach(function (tile) {
      var from = before.get(tile);
      if (from) list.push({ tile: tile, from: from });
    });
    runGlides(list, { dur: opts.dur || 520, screen: true, id: "fp-flow", easing: opts.easing });
  }

  function hoverScale() {
    var g = grid();
    if (!g) return 1;
    if (isScatter()) {
      g.style.setProperty("--fp-hs", "1");
      return 1;
    }
    var n = cols();
    var w = g.clientWidth;
    var first = g.querySelector(".fp-tile");
    var cur = first ? first.offsetWidth : 0;
    if (!cur) return 1;
    var gap = n > 1 ? Math.max(0, (w - cur * n) / (n - 1)) : 0;
    var w3 = (w - gap * 2) / 3;
    var s = Math.max(1.06, Math.min(HOVER_CAP, (Math.min(w3, PRINT_MAX) * HOVER_BOOST) / cur));
    g.style.setProperty("--fp-hs", s.toFixed(3));
    return s;
  }

  function layoutSliderDefault(mode) {
    var ends = sliderEnds();
    if (mode === "table") {
      /* Phone Table is one step under the 3-across maximum, so 4 across. */
      if (phoneSlider()) return ends.min + 1;
      if (tabletSlider()) return ends.min;
      return ends.min + (ends.max - ends.min) * 0.5;
    }
    /* Phone Row is the large end (3 across). Tablet Row matches tablet Table at 4. */
    if (phoneSlider() || tabletSlider()) return ends.min;
    return ends.min + (ends.max - ends.min) / 3;
  }

  function setCols(n, animate) {
    n = clampSlider(n);
    fillSlider(n);
    var g = grid();
    if (!g) return;
    var apply = function () {
      g.setAttribute("data-columns", String(n));
      g.style.setProperty("--fp-cols", String(n));
      if (isTable()) applyScatter(g, false);
      else if (isAg()) applyAntigravity(g, captureAgSeeds(g), { resume: true });
      else applyRowWidths(g);
    };
    if (animate && g.getAttribute("data-columns") !== String(n)) flow(apply, { step: 26, total: 620, dur: 520 });
    else apply();
    if (draggingSlider) packDragRows(g);
    clearTimeout(window.fpHsA);
    window.fpHsA = setTimeout(hoverScale, 60);
  }

  function packDragRows(g) {
    if (!g) return;
    g.style.minHeight = "";
    g.style.alignContent = "start";
    g.style.gridAutoRows = "max-content";
  }

  function landAsTable(g) {
    var items = tiles();
    items.forEach(function (tile) {
      tile.style.setProperty("transition", "none", "important");
      var rot = parseFloat(tile.style.getPropertyValue("--fp-rot"));
      if (!isFinite(rot)) rot = 0;
      tile.setAttribute("data-fp-tilt", String(rot));
      if (rot === 0) tile.setAttribute("data-fp-straight", "1");
      else tile.removeAttribute("data-fp-straight");
    });
    g.setAttribute("data-fp-layout", "table");
    g.style.removeProperty("--fp-ag-h");
    g.classList.remove("fp-ag-in");
    clearTimeout(g._agShade);
    seatTableBelowBar(g);
    items.forEach(function (tile) {
      persist(tile);
    });
    requestAnimationFrame(function () {
      items.forEach(function (tile) {
        tile.style.removeProperty("transition");
      });
    });
    fitTableHeight(g);
  }

  function setLayout(mode, animate) {
    var from = layoutMode();
    mode = saveLayout(mode);
    var g = grid();
    if (!g) return;
    if (animate && g.classList.contains("fp-hold")) {
      g.classList.remove("fp-hold");
      g.classList.remove("fp-reveal");
    }
    /* Clicking Table while it is already showing keeps the spread on screen. */
    if (mode === "table" && from === "table" && g.getAttribute("data-fp-layout") === "table") {
      pendingCols = null;
      syncLayoutButtons();
      return;
    }
    stopAntigravity();
    var agSeeds = mode === "antigravity" ? captureAgSeeds(g) : null;
    var agToRow = animate && from === "antigravity" && mode === "row";
    var agFrom = null;
    if (agToRow) {
      agFrom = new Map();
      tiles().forEach(function (tile) {
        var r = tile.getBoundingClientRect();
        if (r.width) agFrom.set(tile, { left: r.left, top: r.top, width: r.width, height: r.height });
      });
    }
    var reuseTable = false;
    var apply = function () {
      if (pendingCols != null && mode !== "antigravity") {
        var preset = pendingCols;
        pendingCols = null;
        g.setAttribute("data-columns", String(preset));
        g.style.setProperty("--fp-cols", String(preset));
        fillSlider(preset);
        persistCols(preset);
      }
      if (mode === "table") {
        if (from === "antigravity") landAsTable(g);
        else {
          g.setAttribute("data-fp-layout", mode);
          clearAntigravity(g);
          reuseTable = hasTableArrangement();
          applyScatter(g, false, !reuseTable);
          if (reuseTable) {
            tiles().forEach(function (tile) {
              var raw = tile.getAttribute("data-fp-tilt");
              var rot = parseFloat(raw);
              if (!isFinite(rot)) return;
              var text = raw.indexOf(".") === -1 ? rot.toFixed(1) : String(rot);
              tile.style.setProperty("--fp-rot", text + "deg");
            });
          } else {
            assignTableSkew();
            tiles().forEach(persist);
          }
        }
      } else if (mode === "antigravity") {
        g.style.removeProperty("--fp-table-h");
        applyAntigravity(g, agSeeds);
      } else {
        if (from === "antigravity") {
          tiles().forEach(function (tile) {
            tile.style.setProperty("transition", "none", "important");
          });
          void g.offsetWidth;
        }
        g.setAttribute("data-fp-layout", mode);
        clearScatter(g);
        clearAntigravity(g);
        applyRowWidths(g);
        if (from === "antigravity") {
          requestAnimationFrame(function () {
            tiles().forEach(function (tile) {
              tile.style.removeProperty("transition");
            });
          });
        }
      }
      syncLayoutButtons();
      /* Antigravity keeps the pose it landed on. A tag on the way back from
         Row still gathers into the tagged cluster, after the saved spread
         is restored underneath. */
      var tagOn = document.documentElement.hasAttribute("data-fp-filter");
      if (window.fpTagLayout && from !== "antigravity" && (!reuseTable || tagOn)) window.fpTagLayout();
      if (mode === "table") fitTableHeight(g);
    };
    if (animate && mode !== "antigravity" && from !== "antigravity") flow(apply, { step: 20, total: 480, dur: 480 });
    else apply();
    if (agToRow && agFrom) slideIntoRow(agFrom);
    setTimeout(hoverScale, 80);
  }

  function slideIntoRow(before) {
    var g = grid();
    if (!g) return;
    var items = tiles();
    items.forEach(dropMotion);
    void g.offsetWidth;
    var list = [];
    items.forEach(function (tile) {
      var from = before.get(tile);
      if (from) list.push({ tile: tile, from: from });
    });
    runGlides(list, { dur: 480, id: "fp-flow" });
  }

  function derange(n) {
    var order = [];
    var i;
    for (i = 0; i < n; i++) order.push(i);
    for (i = n - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = order[i];
      order[i] = order[j];
      order[j] = tmp;
    }
    for (i = 0; i < n; i++) {
      if (order[i] !== i) continue;
      var swapWith = i === n - 1 ? 0 : i + 1;
      var held = order[i];
      order[i] = order[swapWith];
      order[swapWith] = held;
    }
    return order;
  }

  function shuffleTableSpread() {
    var list = tiles();
    if (list.length < 2) return;
    var before = new Map();
    list.forEach(function (tile) {
      var r = tile.getBoundingClientRect();
      if (r.width) before.set(tile, r);
    });
    list.forEach(dropMotion);
    var slots = list.map(function (tile) {
      var w = parseFloat(tile.style.getPropertyValue("--fp-tile-w")) || tile.offsetWidth || 0;
      var h = tile.offsetHeight || tileHeight(tile, w);
      return {
        x: parseFloat(tile.style.getPropertyValue("--fp-nx")) || 0,
        y: parseFloat(tile.style.getPropertyValue("--fp-ny")) || 0,
        w: w,
        h: h
      };
    });
    var alreadyTight = false;
    try { alreadyTight = localStorage.getItem(TIGHT_KEY) === "1"; } catch (e) {}
    if (!alreadyTight) {
      var mx = 0;
      var my = 0;
      var si;
      for (si = 0; si < slots.length; si++) {
        mx += slots[si].x + slots[si].w / 2;
        my += slots[si].y + slots[si].h / 2;
      }
      mx /= slots.length;
      my /= slots.length;
      for (si = 0; si < slots.length; si++) {
        var cx = slots[si].x + slots[si].w / 2;
        var cy = slots[si].y + slots[si].h / 2;
        /* One modest pull-in. Later shuffles only swap these slots. */
        slots[si].x = mx + (cx - mx) * 0.76 - slots[si].w / 2;
        slots[si].y = my + (cy - my) * 0.76 - slots[si].h / 2;
      }
      try { localStorage.setItem(TIGHT_KEY, "1"); } catch (e2) {}
    }
    var perm = derange(slots.length);
    var g = grid();
    list.forEach(function (tile, k) {
      var dest = slots[perm[k]];
      tile.style.setProperty("--fp-nx", dest.x.toFixed(1) + "px");
      tile.style.setProperty("--fp-ny", dest.y.toFixed(1) + "px");
    });
    var coverBound = null;
    if (g) {
      var coverW = parseFloat(list[0].style.getPropertyValue("--fp-tile-w")) || columnWidth(g);
      coverBound = { minX: 8, maxX: Math.max(8, (g.clientWidth || 800) - coverW - 8) };
    }
    easeTileCovers(list, coverBound);
    seatTableBelowBar(g);
    list.forEach(persist);
    fitTableHeight(g);
    if (g) void g.offsetWidth;
    var listGlide = [];
    list.forEach(function (tile) {
      var from = before.get(tile);
      if (from) listGlide.push({ tile: tile, from: from });
    });
    runGlides(listGlide, { dur: 520, id: "fp-flow" });
  }

  function shuffle() {
    if (draggingSlider || itemDrag) return;
    var g = grid();
    if (!g) return;
    var items = tiles();
    if (items.length < 2) return;
    if (isAg()) {
      reseedAgShuffle(g);
      return;
    }
    if (isTable()) {
      shuffleTableSpread();
      return;
    }
    for (var i = items.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = items[i];
      items[i] = items[j];
      items[j] = tmp;
    }
    flow(function () {
      items.forEach(function (tile) {
        g.appendChild(tile);
      });
    }, { step: 18, total: 420, dur: 420 });
  }

  function onEnter(e) {
    var tile = e.target && e.target.closest ? e.target.closest(".fp-tile") : null;
    if (!tile || draggingSlider || itemDrag || isScatter()) return;
    if (e.relatedTarget && tile.contains(e.relatedTarget)) return;
    var g = grid();
    if (!g) return;
    var s = parseFloat(g.style.getPropertyValue("--fp-hs")) || hoverScale() || 1.2;
    var r = tile.getBoundingClientRect();
    var cs = getComputedStyle(tile);
    var cur = parseFloat(cs.scale);
    if (!(cur > 0)) cur = 1;
    var tr = cs.translate && cs.translate !== "none" ? cs.translate.split(" ").map(parseFloat) : [0, 0];
    var cx = r.left + r.width / 2 - (tr[0] || 0);
    var cy = r.top + r.height / 2 - (tr[1] || 0);
    var bw = r.width / cur;
    var bh = r.height / cur;
    var hw = (bw * s) / 2;
    var hh = (bh * s) / 2;
    var pad = 8;
    var tx = 0;
    var ty = 0;
    var right = document.documentElement.clientWidth - pad;
    if (cx - hw < pad) tx = pad - (cx - hw);
    else if (cx + hw > right) tx = right - (cx + hw);
    if (2 * hh < window.innerHeight - 2 * pad) {
      if (cy - hh < pad) ty = pad - (cy - hh);
      else if (cy + hh > window.innerHeight - pad) ty = window.innerHeight - pad - (cy + hh);
    }
    tile.style.setProperty("--fp-tx", tx.toFixed(1) + "px");
    tile.style.setProperty("--fp-ty", ty.toFixed(1) + "px");
    sharpen(tile, bw * s);
  }

  function sharpen(tile, px) {
    var img = imgOf(tile);
    if (!img) return;
    var src = img.getAttribute("src") || "";
    var next = hiSrc(src, Math.max(800, px || 800));
    if (!next || next === src) return;
    var pre = new Image();
    pre.onload = function () {
      img.src = next;
    };
    pre.src = next;
  }

  function showFace(tile, url) {
    var img = imgOf(tile);
    if (!img || !url) return;
    var hi = hiSrc(url, Math.max(800, Math.ceil((tile.offsetWidth || 400) * (window.devicePixelRatio || 1)))) || url;
    if ((img.getAttribute("src") || "") === hi) {
      img.style.opacity = "";
      return;
    }
    tile._faceGen = (tile._faceGen || 0) + 1;
    var gen = tile._faceGen;
    img.style.opacity = "";
    var pre = new Image();
    var reveal = function () {
      if (tile._faceGen !== gen) return;
      var current = imgOf(tile);
      if (!current || !current.parentNode) return;
      var next = document.createElement("img");
      next.alt = current.alt || "";
      next.draggable = false;
      next.setAttribute("referrerpolicy", "no-referrer");
      next.setAttribute("decoding", "sync");
      next.style.position = "absolute";
      next.style.left = "0";
      next.style.top = "0";
      next.style.width = "100%";
      next.style.height = "100%";
      next.style.margin = "0";
      next.style.objectFit = "contain";
      next.style.opacity = "0";
      next.style.pointerEvents = "none";
      next.src = hi;
      current.parentNode.appendChild(next);
      void next.offsetWidth;
      next.style.opacity = "1";
      setTimeout(function () {
        if (!next.parentNode) return;
        if (tile._faceGen !== gen) {
          next.parentNode.removeChild(next);
          return;
        }
        next.style.position = "";
        next.style.left = "";
        next.style.top = "";
        next.style.width = "";
        next.style.height = "";
        next.style.margin = "";
        next.style.objectFit = "";
        next.style.opacity = "";
        next.style.pointerEvents = "";
        if (current.parentNode) current.parentNode.removeChild(current);
      }, 240);
    };
    pre.onload = function () {
      if (pre.decode) pre.decode().then(reveal).catch(reveal);
      else reveal();
    };
    pre.src = hi;
  }

  function flipTile(tile) {
    var back = tile.getAttribute("data-back") || "";
    var front = tile.getAttribute("data-front") || "";
    if (!back) return false;
    var side = tile.getAttribute("data-fp-side") || "a";
    var next = side === "a" ? "b" : "a";
    tile.setAttribute("data-fp-side", next);
    showFace(tile, next === "b" ? back : front);
    return true;
  }

  function flashNoBack() {
    var n = document.getElementById("fp-noback");
    if (!n) {
      n = document.createElement("div");
      n.id = "fp-noback";
      n.className = "fp-noback";
      n.textContent = "no back";
      document.body.appendChild(n);
    }
    n.classList.add("fp-noback-on");
    clearTimeout(window._fpNoBackT);
    window._fpNoBackT = setTimeout(function () {
      n.classList.remove("fp-noback-on");
    }, 900);
  }

  function showHint(lb, text) {
    var h = lb.querySelector(".fp-hint");
    if (!h) {
      h = document.createElement("div");
      h.className = "fp-hint";
      lb.appendChild(h);
    }
    h.textContent = text;
    h.classList.add("fp-hint-on");
    clearTimeout(lb._hintT);
    lb._hintT = setTimeout(function () {
      h.classList.remove("fp-hint-on");
    }, 1600);
  }

  function closeLb() {
    var lb = document.getElementById("fp-lb");
    if (!lb || lb._closing) return;
    lb._closing = true;
    var big = lb.querySelector("img");
    var from = lb._from;
    document.body.classList.remove("fp-lb-lock");
    lb.classList.add("fp-lb-closing");
    lb.classList.remove("fp-lb-on");
    if (big && from) {
      var r = big.getBoundingClientRect();
      if (r.width && r.height) {
        var s = Math.min(from.w / r.width, from.h / r.height);
        var dx = from.x + from.w / 2 - (r.left + r.width / 2);
        var dy = from.y + from.h / 2 - (r.top + r.height / 2);
        big.style.transform = "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px) scale(" + s.toFixed(4) + ")";
      }
    }
    setTimeout(function () {
      if (lb.parentNode) lb.parentNode.removeChild(lb);
    }, 340);
  }

  var FP_STREET_VIEW = "https://www.google.com/maps/@49.1640345,-123.1508345,3a,39.4y,49.79h,87.19t/data=!3m7!1e1!3m5!1sJJILwv4Qfcgqe0m6MTGuLg!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D2.8115008902333756%26panoid%3DJJILwv4Qfcgqe0m6MTGuLg%26yaw%3D49.788455987928074!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI2MDkyOC4wIKXMDSoASAFQAw%3D%3D";

  function svLatLon(src) {
    var m = String(src || "").match(/!1d(-?\d+(?:\.\d+)?)!2d(-?\d+(?:\.\d+)?)/);
    if (!m) return null;
    return { lat: +m[1], lon: +m[2] };
  }

  function fpTileXY(lat, lon, z) {
    var n = Math.pow(2, z);
    var x = ((lon + 180) / 360) * n;
    var rad = (lat * Math.PI) / 180;
    var y = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n;
    return { x: x, y: y };
  }

  function mountStreetMap(lb, lat, lon) {
    var box = document.createElement("div");
    box.className = "vsf-lb-map";
    box.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      window.open(FP_STREET_VIEW, "_blank", "noopener,noreferrer");
    });
    var z = 15;
    var p = fpTileXY(lat, lon, z);
    var tx = Math.floor(p.x);
    var ty = Math.floor(p.y);
    var tiles = document.createElement("div");
    tiles.className = "vsf-lb-tiles";
    var originX = (tx - 1) * 256;
    var originY = (ty - 1) * 256;
    var pointX = p.x * 256;
    var pointY = p.y * 256;
    tiles.style.transform = "translate(" + (74 - (pointX - originX)) + "px," + (74 - (pointY - originY)) + "px)";
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        var im = document.createElement("img");
        im.alt = "";
        im.draggable = false;
        im.src = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/" + z + "/" + (ty + dy) + "/" + (tx + dx);
        im.style.left = (dx + 1) * 256 + "px";
        im.style.top = (dy + 1) * 256 + "px";
        tiles.appendChild(im);
      }
    }
    var dot = document.createElement("button");
    dot.type = "button";
    dot.className = "vsf-lb-dot";
    dot.setAttribute("aria-label", "click for Street View");
    var label = document.createElement("div");
    label.className = "vsf-lb-map-label";
    label.textContent = "click to see present day";
    box.appendChild(tiles);
    box.appendChild(dot);
    box.appendChild(label);
    lb.appendChild(box);
  }

  function openLb(tile) {
    if (draggingSlider) return;
    var img = imgOf(tile);
    if (!img) return;
    var front = tile.getAttribute("data-front") || img.currentSrc || img.src;
    var back = tile.getAttribute("data-back") || "";
    var side = tile.getAttribute("data-fp-side") || "a";
    var lo = side === "b" && back ? back : front;
    var src = hiSrc(lo, 2000) || lo;
    var thumb = tile.getBoundingClientRect();
    var existing = document.getElementById("fp-lb");
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    var lb = document.createElement("div");
    lb.id = "fp-lb";
    lb.className = "fp-lb";
    lb.setAttribute("role", "dialog");
    lb.setAttribute("aria-modal", "true");
    lb._from = { x: thumb.left, y: thumb.top, w: thumb.width, h: thumb.height };
    lb._tile = tile;
    lb._front = front;
    lb._back = back;
    lb._side = side === "b" && back ? "b" : "a";
    var big = document.createElement("img");
    big.alt = img.alt || "";
    big.draggable = false;
    big.style.opacity = "0";
    var nw = img.naturalWidth;
    var nh = img.naturalHeight;
    var allowUpscale = !!(src && src !== lo);
    if (!(nw > 1) || !(nh > 1)) {
      nw = thumb.width;
      nh = thumb.height;
      allowUpscale = true;
    }
    lockGalleryBox(big, nw, nh, allowUpscale);
    function measureAndZoom() {
      var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      big.style.transition = "none";
      big.style.transform = reduce ? "none" : "translateY(100vh)";
      big.style.opacity = "0";
      void big.offsetWidth;
      big.style.transition = "";
      requestAnimationFrame(function () {
        if (lb._closing) return;
        lb.classList.add("fp-lb-on");
        big.style.transform = "none";
        big.style.opacity = "1";
      });
      return true;
    }
    function settleOpen() {
      if (lb._opened || lb._closing) return;
      lb._opened = true;
      big.removeEventListener("load", onOpenLoad);
      if (!measureAndZoom()) {
        lb.classList.add("fp-lb-on");
        big.style.opacity = "1";
      }
    }
    function onOpenLoad() {
      if (lb._opened || lb._closing) return;
      requestAnimationFrame(settleOpen);
    }
    big.addEventListener("load", onOpenLoad);
    big.src = lo;
    lb.appendChild(big);
    var sv = tile.getAttribute("data-sv");
    var svPos = svLatLon(sv);
    if (svPos) mountStreetMap(lb, svPos.lat, svPos.lon);
    document.body.appendChild(lb);
    document.body.classList.add("fp-lb-lock");
    if (big.complete && big.naturalWidth) onOpenLoad();
    if (src && src !== lo) {
      var hi = new Image();
      hi.onload = function () {
        if (!lb._closing) big.src = src;
      };
      hi.src = src;
    }
    showHint(lb, back ? "click to flip" : "esc to close");
    lb.addEventListener("click", function (e) {
      if (e.target === lb) closeLb();
    });
    big.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (!lb._back) {
        flashNoBack();
        return;
      }
      var next = lb._side === "a" ? "b" : "a";
      var url = next === "b" ? lb._back : lb._front;
      var pre = new Image();
      var revealLb = function () {
        if (lb._closing) return;
        var src = hiSrc(url, 2000) || url;
        var cover = document.createElement("img");
        cover.alt = big.alt || "";
        cover.draggable = false;
        cover.style.position = "absolute";
        cover.style.left = "50%";
        cover.style.top = "50%";
        cover.style.transform = "translate(-50%, -50%)";
        cover.style.transition = "opacity 0.22s ease";
        cover.style.opacity = "0";
        cover.style.pointerEvents = "none";
        cover.style.margin = "0";
        lockGalleryBox(cover, pre.naturalWidth, pre.naturalHeight, false);
        cover.src = src;
        lb.appendChild(cover);
        void cover.offsetWidth;
        cover.style.opacity = "1";
        lb._side = next;
        tile.setAttribute("data-fp-side", next);
        showFace(tile, url);
        showHint(lb, next === "b" ? "back" : "front");
        setTimeout(function () {
          if (lb._closing) return;
          lockGalleryBox(big, pre.naturalWidth, pre.naturalHeight, false);
          big.style.opacity = "";
          big.src = src;
          requestAnimationFrame(function () {
            if (cover.parentNode) cover.parentNode.removeChild(cover);
          });
        }, 240);
      };
      pre.onload = function () {
        if (pre.decode) pre.decode().then(revealLb).catch(revealLb);
        else revealLb();
      };
      pre.onerror = function () {
        big.style.opacity = "";
        flashNoBack();
      };
      pre.src = hiSrc(url, 2000) || url;
    });
  }

  function clearPending() {
    if (pending) {
      clearTimeout(pending.t);
      pending = null;
    }
  }

  function lockScroll() {
    if (zLock) return;
    var h = document.documentElement;
    var g = grid();
    zLock = { oy: h.style.overflowY, mh: g ? g.style.minHeight : "", y: window.scrollY };
    h.classList.add("fp-sizing");
    h.style.overflowY = window.innerWidth - h.clientWidth > 0 ? "scroll" : "hidden";
    if (g) packDragRows(g);
  }

  function unlockScroll() {
    if (!zLock) return;
    var h = document.documentElement;
    var g = grid();
    var l = zLock;
    zLock = null;
    h.classList.remove("fp-sizing");
    h.style.overflowY = l.oy;
    if (g) {
      g.style.minHeight = l.mh;
      g.style.alignContent = "";
      g.style.gridAutoRows = "";
    }
  }

  function pick(v, current) {
    var ends = sliderEnds();
    v = +v;
    if (!(v >= ends.min)) v = ends.min;
    if (v > ends.max) v = ends.max;
    return Math.abs(v - current) < HYST ? current : clampSlider(v);
  }

  wakeImages();
  window.addEventListener("load", wakeImages);
  window.addEventListener("pageshow", wakeImages);

  try {
    tiles().forEach(function (tile) {
      syncAspect(tile);
      if (!tile.getAttribute("data-fp-side")) tile.setAttribute("data-fp-side", "a");
    });
    setCount();
    setCols(phoneSlider() ? 3 : colsForThisScreen(storedCols()), false);
    setLayout(layoutMode(), false);
    settleArrival();
  } finally {
    document.documentElement.style.visibility = "";
  }

  document.addEventListener("click", function (e) {
    if (draggingSlider || (itemDrag && itemDrag.moved)) return;
    if (window.fpSkipClick) {
      window.fpSkipClick = false;
      return;
    }
    if (document.getElementById("fp-lb")) return;
    var tag = e.target.closest && e.target.closest(".fp-tag");
    if (tag) {
      e.preventDefault();
      var tagOn = !tag.classList.contains("active");
      tag.classList.toggle("active", tagOn);
      tag.setAttribute("aria-pressed", tagOn ? "true" : "false");
      return;
    }
    var lay = e.target.closest && e.target.closest(".fp-laybtn");
    if (lay) {
      e.preventDefault();
      var nextLay = lay.getAttribute("data-fp-lay") || "row";
      if ((nextLay === "table" || nextLay === "row") && layoutMode() !== "antigravity") {
        var want = clampSlider(layoutSliderDefault(nextLay));
        var gNow = grid();
        var already = layoutMode() === nextLay && gNow && gNow.getAttribute("data-fp-layout") === nextLay;
        if (already) setCols(want, true);
        else pendingCols = want;
      }
      setLayout(nextLay, true);
      return;
    }
    if (e.target.closest && e.target.closest(".fp-ag")) {
      e.preventDefault();
      if (layoutMode() === "antigravity") {
        var back = window.fpAgPrev;
        if (back !== "row" && back !== "table") back = "row";
        setLayout(back, true);
      } else {
        window.fpAgPrev = layoutMode() === "table" ? "table" : "row";
        setLayout("antigravity", true);
      }
      return;
    }
    if (e.target.closest && e.target.closest(".fp-shuffle")) {
      e.preventDefault();
      shuffle();
      return;
    }
    var tile = e.target.closest && e.target.closest(".fp-grid .fp-tile");
    if (!tile) return;
    e.preventDefault();
    if (isScatter()) {
      zTop += 1;
      tile.style.setProperty("--fp-z", String(zTop));
      if (isTable()) persist(tile);
    }
    clearPending();
    pending = {
      tile: tile,
      t: setTimeout(function () {
        pending = null;
        if (hasBack(tile)) flipTile(tile);
      }, DELAY)
    };
  });

  document.addEventListener("dblclick", function (e) {
    if (document.getElementById("fp-lb")) return;
    var tile = e.target.closest && e.target.closest(".fp-grid .fp-tile");
    if (!tile) return;
    e.preventDefault();
    clearPending();
    openLb(tile);
  });

  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && document.getElementById("fp-lb")) {
      e.preventDefault();
      closeLb();
    }
  });

  document.addEventListener("contextmenu", function (e) {
    if (e.target.closest && (e.target.closest(".fp-tile") || e.target.closest(".fp-lb"))) e.preventDefault();
  });
  document.addEventListener("dragstart", function (e) {
    if (e.target.closest && (e.target.closest(".fp-tile") || e.target.closest(".fp-lb"))) e.preventDefault();
  });

  document.addEventListener("pointerdown", function (e) {
    if ((!isTable() && !isAg()) || draggingSlider) return;
    if (e.button != null && e.button !== 0) return;
    if (e.target.closest && e.target.closest(".fp-bar")) return;
    var tile = e.target.closest && e.target.closest(".fp-grid .fp-tile");
    if (!tile) return;
    var nx0 = parseFloat(tile.style.getPropertyValue("--fp-nx")) || 0;
    var ny0 = parseFloat(tile.style.getPropertyValue("--fp-ny")) || 0;
    if (isScatter()) {
      zTop += 1;
      tile.style.setProperty("--fp-z", String(zTop));
    }
    itemDrag = {
      tile: tile,
      pid: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      nx0: nx0,
      ny0: ny0,
      moved: false,
      samples: [{ x: e.clientX, y: e.clientY, t: performance.now() }]
    };
    if (isAg()) {
      var bodyD = agBodyFor(tile);
      if (bodyD) {
        bodyD.held = true;
        bodyD.vx = 0;
        bodyD.vy = 0;
        bodyD.tvx = 0;
        bodyD.tvy = 0;
        bodyD.x = nx0;
        bodyD.y = ny0;
      }
    }
    try {
      tile.setPointerCapture(e.pointerId);
    } catch (err) {}
  });

  document.addEventListener("pointermove", function (e) {
    if (!itemDrag || itemDrag.pid !== e.pointerId) return;
    var dx = e.clientX - itemDrag.x0;
    var dy = e.clientY - itemDrag.y0;
    if (!itemDrag.moved) {
      if (Math.abs(dx) < DRAG_THRESH && Math.abs(dy) < DRAG_THRESH) return;
      itemDrag.moved = true;
      clearPending();
      if (isTable() || isAg()) {
        straighten(itemDrag.tile);
        var spun = agBodyFor(itemDrag.tile);
        if (spun) spun.spin = 0;
      }
      itemDrag.tile.classList.add("fp-dragging");
      document.documentElement.classList.add("fp-item-dragging");
      zTop += 1;
      itemDrag.tile.style.setProperty("--fp-z", String(zTop));
    }
    e.preventDefault();
    var nx = itemDrag.nx0 + dx;
    var ny = itemDrag.ny0 + dy;
    if (isTable()) {
      var dragTw = parseFloat(itemDrag.tile.style.getPropertyValue("--fp-tile-w")) || itemDrag.tile.offsetWidth || 0;
      var dragTh = itemDrag.tile.offsetHeight || 0;
      var dragFloor = tableTopFloor(itemDrag.tile, dragTw, dragTh);
      if (ny < dragFloor) ny = dragFloor;
    }
    itemDrag.tile.style.setProperty("--fp-nx", nx.toFixed(1) + "px");
    itemDrag.tile.style.setProperty("--fp-ny", ny.toFixed(1) + "px");
    if (isAg()) {
      var now = performance.now();
      itemDrag.samples.push({ x: e.clientX, y: e.clientY, t: now });
      while (itemDrag.samples.length > 12 || (itemDrag.samples.length > 2 && now - itemDrag.samples[0].t > 120)) {
        itemDrag.samples.shift();
      }
      var body = agBodyFor(itemDrag.tile);
      if (body) {
        body.x = nx;
        body.y = ny;
        body.held = true;
        body.vx = 0;
        body.vy = 0;
        body.tvx = 0;
        body.tvy = 0;
        body.driftAt = 0;
        body.easeMs = 1;
      }
    }
  });

  function endDrag(e) {
    if (!itemDrag || (e.pointerId != null && itemDrag.pid !== e.pointerId)) return;
    var d = itemDrag;
    itemDrag = null;
    d.tile.classList.remove("fp-dragging");
    document.documentElement.classList.remove("fp-item-dragging");
    if (d.moved) {
      if (isAg()) {
        var bodyU = agBodyFor(d.tile);
        if (bodyU) {
          bodyU.x = parseFloat(d.tile.style.getPropertyValue("--fp-nx")) || bodyU.x;
          bodyU.y = parseFloat(d.tile.style.getPropertyValue("--fp-ny")) || bodyU.y;
          bodyU.held = false;
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
          if (tmag < 1) {
            bodyU.vx = 0;
            bodyU.vy = 0;
            bodyU.tvx = 0;
            bodyU.tvy = 0;
          } else {
            bodyU.vx = tvx;
            bodyU.vy = tvy;
            bodyU.tvx = tvx;
            bodyU.tvy = tvy;
          }
        }
      } else {
        persist(d.tile);
      }
      window.fpSkipClick = true;
      setTimeout(function () {
        window.fpSkipClick = false;
      }, 40);
    } else if (isAg()) {
      var bodyC = agBodyFor(d.tile);
      if (bodyC) {
        bodyC.x = parseFloat(d.tile.style.getPropertyValue("--fp-nx")) || bodyC.x;
        bodyC.y = parseFloat(d.tile.style.getPropertyValue("--fp-ny")) || bodyC.y;
        bodyC.held = false;
        bodyC.vx = 0;
        bodyC.vy = 0;
        bodyC.tvx = 0;
        bodyC.tvy = 0;
      }
    }
  }
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);

  function isSlider(t) {
    return t && t.classList && t.classList.contains("fp-zslider");
  }

  function colsFromClientX(s, clientX) {
    var rect = s.getBoundingClientRect();
    var span = rect.width || 1;
    var thumb = 14;
    var usable = Math.max(1, span - thumb);
    var t = (clientX - rect.left - thumb / 2) / usable;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    var ends = sliderEnds();
    return pick(ends.min + t * (ends.max - ends.min), zVal != null ? zVal : cols());
  }

  function reflowSlider(s, clientX) {
    if (!s) return;
    var n = clientX == null ? pick(s.value, zVal != null ? zVal : cols()) : colsFromClientX(s, clientX);
    if (n !== cols()) {
      zVal = n;
      setCols(n, false);
    } else {
      packDragRows(grid());
    }
  }

  document.addEventListener("pointerdown", function (e) {
    if (!isSlider(e.target)) return;
    draggingSlider = true;
    lockScroll();
    reflowSlider(e.target, e.clientX);
  }, true);

  document.addEventListener("pointermove", function (e) {
    if (!draggingSlider) return;
    var s = isSlider(e.target) ? e.target : document.querySelector(".fp-zslider");
    reflowSlider(s, e.clientX);
  }, true);

  function endSlider() {
    if (!draggingSlider) return;
    var s = document.querySelector(".fp-zslider");
    var n = s ? pick(s.value, zVal != null ? zVal : cols()) : cols();
    zVal = null;
    draggingSlider = false;
    setCols(n, false);
    fillSlider(n);
    persistCols(n);
    requestAnimationFrame(unlockScroll);
  }

  document.addEventListener("pointerup", endSlider, true);
  document.addEventListener("pointercancel", endSlider, true);
  window.addEventListener("blur", endSlider);

  document.addEventListener("input", function (e) {
    if (!isSlider(e.target)) return;
    var s = e.target;
    if (draggingSlider) {
      var ends = sliderEnds();
      fillSlider(+s.value);
      s.style.setProperty("--fp-p", (((+s.value - ends.min) / (ends.max - ends.min)) * 100).toFixed(2) + "%");
      var n = pick(s.value, zVal != null ? zVal : cols());
      if (n !== cols()) {
        zVal = n;
        setCols(n, false);
      }
      return;
    }
    var k = clampSlider(s.value);
    persistCols(k);
    setCols(k, true);
  });

  document.addEventListener("mouseover", onEnter);
  document.addEventListener("mouseout", function (e) {
    var tile = e.target.closest && e.target.closest(".fp-tile");
    if (!tile || isScatter() || (e.relatedTarget && tile.contains(e.relatedTarget))) return;
    tile.setAttribute("data-fp-leaving", "");
    clearTimeout(tile._leave);
    tile._leave = setTimeout(function () {
      tile.removeAttribute("data-fp-leaving");
    }, 600);
  });

  var colsBand = sliderBand();
  window.addEventListener("resize", function () {
    if (draggingSlider) return;
    clearTimeout(window.fpResize);
    window.fpResize = setTimeout(function () {
      var nowBand = sliderBand();
      if (nowBand !== colsBand) {
        colsBand = nowBand;
        setCols(nowBand === "phone" ? 3 : colsForThisScreen(storedCols()), false);
      }
      hoverScale();
      if (isTable()) applyScatter(grid(), false);
      else if (isAg()) applyAntigravity(grid(), captureAgSeeds(grid()), { resume: true });
      else applyRowWidths(grid());
    }, 150);
  });

  window.fpHoldGlide = holdGlide;
  window.fpRunGlides = runGlides;
  window.fpDropMotion = dropMotion;
  window.fpColumnWidth = columnWidth;
  window.fpAspectHeight = aspectHeight;
  window.fpTableSpreadHeight = tableSpreadHeight;
  window.fpFitTableHeight = fitTableHeight;
  window.fpSeatTable = function (only) {
    var n = seatTableBelowBar(grid(), only);
    if (n) fitTableHeight(grid());
    return n;
  };
  window.fpEaseCovers = easeCovers;
})();

/* Photo tags from photo-tags.json: label the matching print and filter the grid. */
(function () {
  var TAGS_KEY = "fpTagsOpen";
  var foldHold = 0;

  function syncTagsFold() {
    var open = document.documentElement.classList.contains("fp-tags-open");
    var btn = document.getElementById("fp-tags-toggle");
    var drop = document.getElementById("fp-tagdrop");
    if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (drop) drop.setAttribute("aria-hidden", open ? "false" : "true");
  }

  function tagsSaved() {
    try { return localStorage.getItem(TAGS_KEY); } catch (e) { return null; }
  }

  function visibleTableTiles() {
    return Array.prototype.filter.call(document.querySelectorAll(".fp-grid .fp-tile"), function (tile) {
      return !tile.hidden && !tile.classList.contains("fp-tag-leave");
    });
  }

  function shiftTableNy(tiles, dy) {
    tiles.forEach(function (tile) {
      var ny = parseFloat(tile.style.getPropertyValue("--fp-ny"));
      if (!isFinite(ny)) return;
      tile.style.setProperty("--fp-ny", (ny + dy).toFixed(1) + "px");
    });
  }

  /* Tagged table prints are pinned to the viewport, so a collapsing tag row
     can carry them above the page. Ride the row with the untagged spread,
     and stop at the top of the page instead of following it past that edge. */
  function armFoldSlide() {
    var root = document.documentElement;
    root.classList.add("fp-fold-hold");
    void root.offsetWidth;
    clearTimeout(window.fpFoldHoldT);
    window.fpFoldHoldT = setTimeout(function () {
      root.classList.remove("fp-fold-hold");
    }, 280);
  }

  function holdTaggedFold(willOpen) {
    var g = document.querySelector(".fp-grid");
    if (!g || g.getAttribute("data-fp-layout") !== "table") return;
    if (!document.documentElement.hasAttribute("data-fp-filter")) return;
    var drop = document.getElementById("fp-tagdrop");
    if (!drop) return;
    var tiles = visibleTableTiles();
    if (!tiles.length) return;
    if (willOpen) {
      if (!(foldHold > 0)) return;
      armFoldSlide();
      shiftTableNy(tiles, -foldHold);
      foldHold = 0;
      if (window.fpFitTableHeight) window.fpFitTableHeight(g);
      return;
    }
    var dropH = drop.getBoundingClientRect().height;
    if (!(dropH > 1)) return;
    var minTop = Infinity;
    var i;
    for (i = 0; i < tiles.length; i++) {
      var top = tiles[i].getBoundingClientRect().top;
      if (top < minTop) minTop = top;
    }
    var ceiling = -(window.pageYOffset || 0);
    var finalMin = minTop - dropH;
    if (finalMin >= ceiling) return;
    var lift = ceiling - finalMin + 1;
    armFoldSlide();
    shiftTableNy(tiles, lift);
    foldHold += lift;
    if (window.fpFitTableHeight) window.fpFitTableHeight(g);
  }

  function setTagsFold(open) {
    holdTaggedFold(!!open);
    document.documentElement.classList.add("fp-tags-motion");
    document.documentElement.classList.toggle("fp-tags-open", !!open);
    try { localStorage.setItem(TAGS_KEY, open ? "1" : "0"); } catch (e) {}
    syncTagsFold();
  }

  window.addEventListener("resize", function () {
    var saved = tagsSaved();
    if (saved === "1" || saved === "0") return;
    var phone = window.matchMedia("(max-width: 767px)").matches;
    document.documentElement.classList.toggle("fp-tags-open", phone);
    syncTagsFold();
  });

  syncTagsFold();
  var tagsToggle = document.getElementById("fp-tags-toggle");
  if (tagsToggle) {
    tagsToggle.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      setTagsFold(!document.documentElement.classList.contains("fp-tags-open"));
    });
  }

  function addId(set, value) {
    var raw = String(value || "").trim();
    if (!raw) return;
    set[raw] = true;
    var path = raw;
    var mark = "/image/upload/";
    var at = raw.indexOf(mark);
    if (at >= 0) {
      var parts = raw.slice(at + mark.length).split("?")[0].split("/");
      if (parts[0] && parts[0].indexOf("found-") !== 0 && parts[0].indexOf("FastFoto") !== 0) parts.shift();
      parts[parts.length - 1] = parts[parts.length - 1].replace(/\.(jpe?g|png|webp|gif)$/i, "");
      path = parts.join("/");
      if (path) set[path] = true;
    }
    var base = path.split("/").pop().replace(/\.(jpe?g|png|webp|gif)$/i, "");
    if (base) set[base] = true;
    if (/_tagged$/i.test(base)) {
      set[base.replace(/_tagged$/i, "")] = true;
      var stripped = path.replace(/_tagged$/i, "");
      if (stripped) set[stripped] = true;
    }
  }

  function idSet(values) {
    var set = {};
    values.forEach(function (value) { addId(set, value); });
    return set;
  }

  function entryMatches(entry, tile) {
    var img = tile.querySelector("img");
    var tileSet = idSet([
      tile.getAttribute("data-front") || "",
      tile.getAttribute("data-back") || "",
      img ? (img.getAttribute("src") || "") : ""
    ]);
    var entrySet = idSet([entry.publicId || "", entry.file || ""]);
    for (var key in entrySet) {
      if (tileSet[key]) return true;
    }
    return false;
  }

  function tagButton(tag) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fp-tag";
    btn.setAttribute("data-fp-filter", tag);
    btn.setAttribute("aria-pressed", "false");
    btn.textContent = tag;
    return btn;
  }

  function allTiles() {
    return Array.prototype.slice.call(document.querySelectorAll(".fp-grid .fp-tile"));
  }

  function paintCount() {
    var c = document.querySelector(".fp-count");
    if (!c) return;
    var all = allTiles();
    var shown = 0;
    all.forEach(function (tile) {
      if (!tile.hidden && !tile.classList.contains("fp-tag-leave")) shown++;
    });
    c.textContent = shown + " of " + all.length;
  }

  var picked = [];
  var tableHome = null;
  var TAG_EASE = "cubic-bezier(.22,.8,.25,1)";
  var TAG_MS = 380;

  function layoutNow() {
    var g = document.querySelector(".fp-grid");
    return g ? (g.getAttribute("data-fp-layout") || "row") : "row";
  }

  function tileOk(tile) {
    var tags = tile._fpTags || [];
    var i;
    for (i = 0; i < picked.length; i++) {
      if (tags.indexOf(picked[i]) === -1) return false;
    }
    return true;
  }

  function stopTagAnim(tile) {
    (tile.getAnimations ? tile.getAnimations() : []).forEach(function (a) {
      if (a.id === "fp-tag") a.cancel();
    });
  }

  function clearLeave(tile) {
    tile.classList.remove("fp-tag-leave");
    tile.style.position = "";
    tile.style.left = "";
    tile.style.top = "";
    tile.style.width = "";
    tile.style.height = "";
    tile.style.margin = "";
    tile.style.maxWidth = "";
    tile.style.pointerEvents = "";
    tile.style.zIndex = "";
  }

  function pinLeave(tile, rect) {
    tile.hidden = false;
    tile.classList.add("fp-tag-leave");
    tile.style.position = "fixed";
    tile.style.left = rect.left + "px";
    tile.style.top = rect.top + "px";
    tile.style.width = rect.width + "px";
    tile.style.height = rect.height + "px";
    tile.style.margin = "0";
    tile.style.maxWidth = "none";
    tile.style.pointerEvents = "none";
    tile.style.zIndex = "0";
  }

  function saveTableHome() {
    if (tableHome) return;
    var g = document.querySelector(".fp-grid");
    if (!g || g.getAttribute("data-fp-layout") !== "table") return;
    var sample = allTiles()[0];
    if (!sample || !sample.style.getPropertyValue("--fp-nx")) return;
    var map = new Map();
    allTiles().forEach(function (tile) {
      map.set(tile, {
        x: tile.style.getPropertyValue("--fp-nx"),
        y: tile.style.getPropertyValue("--fp-ny"),
        w: tile.style.getPropertyValue("--fp-tile-w")
      });
    });
    tableHome = { h: g.style.getPropertyValue("--fp-table-h"), tiles: map };
  }

  function restoreTableHome() {
    foldHold = 0;
    if (!tableHome) return;
    var g = document.querySelector(".fp-grid");
    if (g && tableHome.h) g.style.setProperty("--fp-table-h", tableHome.h);
    tableHome.tiles.forEach(function (rec, tile) {
      if (rec.x) tile.style.setProperty("--fp-nx", rec.x);
      if (rec.y) tile.style.setProperty("--fp-ny", rec.y);
      if (rec.w) tile.style.setProperty("--fp-tile-w", rec.w);
    });
    tableHome = null;
  }

  function tileSpan(tile, tw) {
    var ar = parseFloat(tile.style.getPropertyValue("--fp-ar"));
    if (!(ar > 0.2 && ar < 5)) ar = 0.85;
    if (!tile.hidden && tile.offsetHeight > 20) return tile.offsetHeight;
    return tw / ar;
  }

  function clusterSpec(tile, tw) {
    var h = tileSpan(tile, tw);
    var rot = parseFloat(tile.style.getPropertyValue("--fp-rot")) || 0;
    var sc = parseFloat(tile.style.getPropertyValue("--fp-sc"));
    if (!(sc > 0)) sc = 1;
    var rad = Math.abs(rot) * Math.PI / 180;
    var c = Math.abs(Math.cos(rad));
    var s = Math.abs(Math.sin(rad));
    var boxW = (tw * c + h * s) * sc;
    var boxH = (tw * s + h * c) * sc;
    return {
      tile: tile,
      h: h,
      padX: Math.max(0, (boxW - tw) / 2),
      padY: Math.max(0, (boxH - h) / 2)
    };
  }

  function placeCluster() {
    foldHold = 0;
    var g = document.querySelector(".fp-grid");
    if (!g) return;
    var keep = allTiles().filter(tileOk);
    if (!keep.length) return;
    var tw = 0;
    var i;
    var j;
    for (i = 0; i < keep.length; i++) {
      if (!keep[i].hidden && keep[i].offsetWidth > 20) {
        tw = keep[i].offsetWidth;
        break;
      }
    }
    if (!(tw > 0)) tw = parseFloat(g.style.getPropertyValue("--fp-tile-w")) || 160;
    var gr = g.getBoundingClientRect();
    var margin = 8;
    var viewW = document.documentElement.clientWidth || window.innerWidth;
    var viewLeft = margin - gr.left;
    var viewRight = viewW - margin - gr.left;
    var viewTop = margin - gr.top;
    var viewBottom = window.innerHeight - margin - gr.top;
    var n = keep.length;
    var specs = [];
    var widest = 0;
    for (i = 0; i < n; i++) {
      specs.push(clusterSpec(keep[i], tw));
      var need = tw + specs[i].padX * 2;
      if (need > widest) widest = need;
    }
    var availW = viewRight - viewLeft - 4;
    if (widest > availW && widest > 0) {
      tw = Math.max(48, tw * (availW / widest));
      specs = [];
      for (i = 0; i < n; i++) specs.push(clusterSpec(keep[i], tw));
    }
    var avgW = tw;
    var avgH = 0;
    for (i = 0; i < n; i++) avgH += specs[i].h;
    avgH /= n;
    var cx = (viewLeft + viewRight) / 2;
    var cy = (viewTop + viewBottom) / 2;
    var spacing = avgW * (0.8 + Math.random() * 0.1);
    var radius = n === 1 ? 0 : spacing * Math.sqrt(n / Math.PI) * 1.05;
    var pts = [];
    var overlap = [];
    for (i = 0; i < n; i++) {
      var ang = Math.random() * Math.PI * 2;
      var dist = Math.sqrt(Math.random()) * radius;
      pts.push({
        x: Math.cos(ang) * dist,
        y: Math.sin(ang) * dist * (avgH / Math.max(avgW, 1))
      });
      overlap.push(0.8 + Math.random() * 0.1);
    }
    var pass;
    for (pass = 0; pass < 6; pass++) {
      for (i = 0; i < n; i++) {
        for (j = i + 1; j < n; j++) {
          var dx = pts[j].x - pts[i].x;
          var dy = pts[j].y - pts[i].y;
          var d = Math.hypot(dx, dy);
          if (d < 0.01) {
            dx = Math.random() - 0.5;
            dy = Math.random() - 0.5;
            d = Math.hypot(dx, dy) || 0.01;
          }
          var want = avgW * ((overlap[i] + overlap[j]) / 2);
          if (d >= want) continue;
          var push = (want - d) * 0.22;
          var ux = dx / d;
          var uy = dy / d;
          pts[i].x -= ux * push;
          pts[i].y -= uy * push;
          pts[j].x += ux * push;
          pts[j].y += uy * push;
        }
      }
    }
    for (i = 0; i < n; i++) {
      pts[i].x += (Math.random() - 0.5) * avgW * 0.16;
      pts[i].y += (Math.random() - 0.5) * avgH * 0.16;
    }
    var mx = 0;
    var my = 0;
    for (i = 0; i < n; i++) {
      mx += pts[i].x;
      my += pts[i].y;
    }
    mx /= n;
    my /= n;
    var fit = 1;
    for (i = 0; i < n; i++) {
      var spec = specs[i];
      var dxp = pts[i].x - mx;
      var dyp = pts[i].y - my;
      var lo = viewLeft + 2 + spec.padX;
      var hi = viewRight - 2 - spec.padX - tw;
      var top = viewTop + 2 + spec.padY;
      var bot = viewBottom - 2 - spec.padY - spec.h;
      if (hi < lo) hi = lo;
      if (bot < top) bot = top;
      var limL = lo - (cx - tw / 2);
      var limR = hi - (cx - tw / 2);
      var limT = top - (cy - spec.h / 2);
      var limB = bot - (cy - spec.h / 2);
      if (dxp > 0.5 && limR > 0) fit = Math.min(fit, limR / dxp);
      else if (dxp < -0.5 && limL < 0) fit = Math.min(fit, limL / dxp);
      if (dyp > 0.5 && limB > 0) fit = Math.min(fit, limB / dyp);
      else if (dyp < -0.5 && limT < 0) fit = Math.min(fit, limT / dyp);
    }
    if (!(fit > 0)) fit = 0;
    else if (fit > 1) fit = 1;
    for (i = 0; i < n; i++) {
      var spec2 = specs[i];
      /* Wider than tall, and a bit more open than the previous cluster. */
      var nx = cx + (pts[i].x - mx) * fit * 1.18 - tw / 2;
      var ny = cy + (pts[i].y - my) * fit * 1.1 - spec2.h / 2;
      var lo2 = viewLeft + 2 + spec2.padX;
      var hi2 = viewRight - 2 - spec2.padX - tw;
      var top2 = viewTop + 2 + spec2.padY;
      var bot2 = viewBottom - 2 - spec2.padY - spec2.h;
      if (!(hi2 > lo2)) nx = Math.max(0, (viewLeft + viewRight - tw) / 2);
      else {
        if (nx < lo2) nx = lo2;
        if (nx > hi2) nx = hi2;
      }
      if (!(bot2 > top2)) ny = Math.max(0, (viewTop + viewBottom - spec2.h) / 2);
      else {
        if (ny < top2) ny = top2;
        if (ny > bot2) ny = bot2;
      }
      spec2.tile.style.setProperty("--fp-nx", nx.toFixed(1) + "px");
      spec2.tile.style.setProperty("--fp-ny", ny.toFixed(1) + "px");
      spec2.tile.style.setProperty("--fp-tile-w", tw.toFixed(1) + "px");
    }
    if (window.fpEaseCovers) {
      var eased = [];
      for (i = 0; i < n; i++) {
        eased.push({
          x: parseFloat(specs[i].tile.style.getPropertyValue("--fp-nx")) || 0,
          y: parseFloat(specs[i].tile.style.getPropertyValue("--fp-ny")) || 0,
          w: tw,
          h: specs[i].h,
          tile: specs[i].tile
        });
      }
      window.fpEaseCovers(eased, function (k) { return eased[k].w; }, function (k) { return eased[k].h; });
      for (i = 0; i < eased.length; i++) {
        var spec3 = specs[i];
        var nx3 = eased[i].x;
        var ny3 = eased[i].y;
        var lo3 = viewLeft + 2 + spec3.padX;
        var hi3 = viewRight - 2 - spec3.padX - tw;
        var top3 = viewTop + 2 + spec3.padY;
        var bot3 = viewBottom - 2 - spec3.padY - spec3.h;
        if (hi3 > lo3) {
          if (nx3 < lo3) nx3 = lo3;
          if (nx3 > hi3) nx3 = hi3;
        }
        if (bot3 > top3) {
          if (ny3 < top3) ny3 = top3;
          if (ny3 > bot3) ny3 = bot3;
        }
        spec3.tile.style.setProperty("--fp-nx", nx3.toFixed(1) + "px");
        spec3.tile.style.setProperty("--fp-ny", ny3.toFixed(1) + "px");
      }
    }
    if (window.fpSeatTable) window.fpSeatTable(keep);
  }

  function rescalePlaced() {
    var g = document.querySelector(".fp-grid");
    if (!g || !window.fpColumnWidth || !window.fpAspectHeight) return;
    var tw = window.fpColumnWidth(g);
    function shift(tile, x, y, w) {
      if (!isFinite(x) || !isFinite(y) || !(w > 0)) return null;
      if (Math.abs(w - tw) < 0.5) return { x: x, y: y, w: w };
      var oldH = window.fpAspectHeight(tile, w);
      return {
        x: x + (w - tw) / 2,
        y: y + (oldH - window.fpAspectHeight(tile, tw)) / 2,
        w: tw
      };
    }
    allTiles().forEach(function (tile) {
      var next = shift(
        tile,
        parseFloat(tile.style.getPropertyValue("--fp-nx")),
        parseFloat(tile.style.getPropertyValue("--fp-ny")),
        parseFloat(tile.style.getPropertyValue("--fp-tile-w"))
      );
      if (!next) {
        tile.style.setProperty("--fp-tile-w", tw + "px");
        return;
      }
      tile.style.setProperty("--fp-nx", next.x.toFixed(1) + "px");
      tile.style.setProperty("--fp-ny", next.y.toFixed(1) + "px");
      tile.style.setProperty("--fp-tile-w", tw + "px");
    });
    if (tableHome && tableHome.tiles) {
      tableHome.tiles.forEach(function (rec, tile) {
        var next = shift(tile, parseFloat(rec.x), parseFloat(rec.y), parseFloat(rec.w));
        if (!next) return;
        rec.x = next.x.toFixed(1) + "px";
        rec.y = next.y.toFixed(1) + "px";
        rec.w = next.w + "px";
      });
    }
    g.style.setProperty("--fp-tile-w", tw + "px");
    if (window.fpSeatTable) window.fpSeatTable();
    else if (window.fpFitTableHeight) window.fpFitTableHeight(g);
  }

  window.fpTagLayout = function (reason) {
    if (!picked.length) return;
    if (layoutNow() !== "table") return;
    saveTableHome();
    if (reason === "scale") {
      rescalePlaced();
      return;
    }
    placeCluster();
  };

  function copyRect(box) {
    return { left: box.left, top: box.top, width: box.width, height: box.height };
  }

  function runFilter() {
    var mode = layoutNow();
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var root = document.documentElement;
    if (picked.length) root.setAttribute("data-fp-filter", picked.join("\u001f"));
    else root.removeAttribute("data-fp-filter");
    if (mode === "table" && picked.length) saveTableHome();
    var plan = allTiles().map(function (tile) {
      var show = tileOk(tile);
      var rect = null;
      var leaving = tile.classList.contains("fp-tag-leave");
      if ((!tile.hidden && !leaving) || leaving) {
        var box = tile.getBoundingClientRect();
        if (box.width > 0) rect = copyRect(box);
      }
      return { tile: tile, show: show, rect: rect };
    });
    plan.forEach(function (entry) {
      if (window.fpDropMotion) window.fpDropMotion(entry.tile);
    });
    if (mode === "table") {
      if (picked.length) placeCluster();
      else restoreTableHome();
    } else if (!picked.length) {
      tableHome = null;
    }
    plan.forEach(function (entry) {
      stopTagAnim(entry.tile);
      if (entry.show) {
        clearLeave(entry.tile);
        entry.tile.hidden = false;
      } else if (!reduce && entry.rect) {
        pinLeave(entry.tile, entry.rect);
      } else {
        clearLeave(entry.tile);
        entry.tile.hidden = true;
      }
    });
    paintTags();
    paintCount();
    if (mode === "table" && window.fpFitTableHeight) window.fpFitTableHeight();
    if (reduce) return;
    var g = document.querySelector(".fp-grid");
    if (g) void g.offsetWidth;
    var movers = [];
    plan.forEach(function (entry) {
      var tile = entry.tile;
      var reorder = mode === "row" || mode === "table";
      if (entry.show && entry.rect && reorder) {
        movers.push({ tile: tile, from: entry.rect });
      } else if (entry.show && !entry.rect) {
        var enter = tile.animate(
          [{ transform: "scale(0)" }, { transform: "scale(1)" }],
          { duration: TAG_MS, easing: TAG_EASE, fill: "backwards" }
        );
        enter.id = "fp-tag";
      } else if (!entry.show && entry.rect && tile.classList.contains("fp-tag-leave")) {
        var leaveOpts = { duration: TAG_MS, easing: TAG_EASE };
        if (mode === "table") {
          leaveOpts.delay = Math.round(Math.random() * 160);
          leaveOpts.duration = Math.round(280 + Math.random() * 220);
          leaveOpts.fill = "backwards";
        }
        var leave = tile.animate(
          [{ transform: "scale(1)" }, { transform: "scale(0)" }],
          leaveOpts
        );
        leave.id = "fp-tag";
        leave.onfinish = function () {
          if (!tile.classList.contains("fp-tag-leave")) return;
          clearLeave(tile);
          tile.hidden = true;
        };
      }
    });
    if (movers.length && window.fpRunGlides) {
      window.fpRunGlides(movers, { dur: TAG_MS, easing: TAG_EASE, id: "fp-tag" });
    }
  }

  function paintTags() {
    var on = {};
    picked.forEach(function (name) { on[name] = true; });
    document.querySelectorAll(".fp-tag[data-fp-filter]").forEach(function (btn) {
      var hit = !!on[btn.getAttribute("data-fp-filter")];
      btn.classList.toggle("active", hit);
      btn.setAttribute("aria-pressed", hit ? "true" : "false");
    });
    var clear = document.querySelector(".fp-tag[data-fp-clear]");
    if (!clear) return;
    clear.hidden = !picked.length;
    clear.classList.remove("active");
    clear.setAttribute("aria-pressed", "false");
  }

  function showAll() {
    picked = [];
    runFilter();
  }

  function applyFilter() {
    runFilter();
  }

  function clusterTagGroups(tags, counts, groups) {
    var out = tags.slice();
    (groups || []).forEach(function (group) {
      if (!group || !group.length) return;
      var present = [];
      group.forEach(function (tag) {
        if (out.indexOf(tag) >= 0 && present.indexOf(tag) < 0) present.push(tag);
      });
      if (present.length < 2) return;
      var best = present[0];
      var bestAt = out.indexOf(best);
      present.forEach(function (tag) {
        var at = out.indexOf(tag);
        var bestCount = counts[best] || 0;
        var count = counts[tag] || 0;
        if (count > bestCount || (count === bestCount && at < bestAt)) {
          best = tag;
          bestAt = at;
        }
      });
      var removedBefore = 0;
      present.forEach(function (tag) {
        if (out.indexOf(tag) < bestAt) removedBefore += 1;
      });
      out = out.filter(function (tag) { return present.indexOf(tag) < 0; });
      var insertAt = bestAt - removedBefore;
      present.forEach(function (tag, i) { out.splice(insertAt + i, 0, tag); });
    });
    return out;
  }

  function renderBar(featured, counts, minTagCount, groups) {
    var bar = document.querySelector(".fp-tags");
    if (!bar) return;
    while (bar.firstChild) bar.removeChild(bar.firstChild);
    var seen = {};
    var tags = [];
    (featured || []).forEach(function (tag) {
      if (!tag || seen[tag]) return;
      seen[tag] = true;
      tags.push(tag);
    });
    var rest = [];
    Object.keys(counts).forEach(function (tag) {
      if (seen[tag] || counts[tag] < minTagCount) return;
      rest.push(tag);
    });
    rest.sort(function (a, b) {
      if (counts[a] !== counts[b]) return counts[b] - counts[a];
      return a < b ? -1 : a > b ? 1 : 0;
    });
    rest.forEach(function (tag) { tags.push(tag); });
    clusterTagGroups(tags, counts, groups).forEach(function (tag) {
      bar.appendChild(tagButton(tag));
    });
  }

  function mount(data) {
    var photos = Array.isArray(data.photos) ? data.photos : [];
    var counts = {};
    photos.forEach(function (entry) {
      var tags = Array.isArray(entry.tags) ? entry.tags : [];
      var seen = {};
      tags.forEach(function (tag) {
        if (!tag || seen[tag]) return;
        seen[tag] = true;
        counts[tag] = (counts[tag] || 0) + 1;
      });
      allTiles().forEach(function (tile) {
        if (!entryMatches(entry, tile)) return;
        tile._fpTags = tags.slice();
      });
    });
    renderBar(data.featuredTags || [], counts, data.minTagCount, data.tagGroups);
  }

  document.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest && e.target.closest(".fp-tag[data-fp-filter], .fp-tag[data-fp-clear]");
    if (!btn || document.getElementById("fp-lb")) return;
    e.preventDefault();
    e.stopPropagation();
    if (btn.hasAttribute("data-fp-clear")) {
      showAll();
      return;
    }
    var name = btn.getAttribute("data-fp-filter");
    var at = picked.indexOf(name);
    if (at >= 0) picked.splice(at, 1);
    else picked.push(name);
    if (!picked.length) showAll();
    else applyFilter();
  }, true);

  window.fpMountTags = function (data) {
    if (!data || window.fpTagsMounted) return;
    window.fpTagsMounted = true;
    mount(data);
  };
  if (!window.fpTagsReady) {
    window.fpTagsReady = fetch("photo-tags.json?v=20261009a").then(function (res) {
      if (!res.ok) throw new Error("tags");
      return res.json();
    }).catch(function () { return null; });
  }
  window.fpTagsReady.then(function (data) {
    if (window.fpHoldReleased) window.fpMountTags(data);
  });
})();

/* Page title disclosure, same open and close as Car Colours. */
(function () {
  var bar = document.querySelector(".fp-bar");
  var toggle = document.getElementById("fp-about-toggle");
  var panel = document.getElementById("fp-about-panel");
  if (!bar || !toggle || !panel) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hideTimer = 0;

  function finishClose() {
    if (!bar.classList.contains("fp-about-open")) panel.hidden = true;
  }

  toggle.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();
    var open = !bar.classList.contains("fp-about-open");
    window.clearTimeout(hideTimer);
    if (open) {
      panel.hidden = false;
      panel.setAttribute("aria-hidden", "false");
      toggle.setAttribute("aria-expanded", "true");
      if (reduce) {
        bar.classList.add("fp-about-open");
        return;
      }
      panel.getBoundingClientRect();
      bar.classList.add("fp-about-open");
      return;
    }
    bar.classList.remove("fp-about-open");
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
