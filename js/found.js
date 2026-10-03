/* Found Photographs: column size, row / table / floating layouts, hover, flip, lightbox. */
(function () {
  var COL_KEY = "fpZoomCols";
  var LAYOUT_KEY = "fpLayout";
  var POS_KEY = "fpTablePosV2";
  var MIN = 6;
  var MAX = 20;
  var DEF = 6;
  var PRINT_MAX = 430;
  var HOVER_BOOST = 1.12;
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

  function cols() {
    var g = grid();
    return clampCols(g ? g.getAttribute("data-columns") || DEF : DEF);
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
    if (!mm) return src;
    var need = Math.min(2000, Math.max(+mm[1], px || 1600));
    return src.replace(/\/w\/\d+\//, "/w/" + need + "/");
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

  function tileHeight(tile, tw) {
    var ar = parseFloat(tile.style.getPropertyValue("--fp-ar"));
    if (!(ar > 0.2 && ar < 5)) ar = 0.85;
    return Math.max(80, tw / ar);
  }

  function syncAspect(tile) {
    var img = imgOf(tile);
    if (!img) return;
    var go = function () {
      if (!(img.naturalWidth > 1 && img.naturalHeight > 1)) return;
      var ar = (img.naturalWidth / img.naturalHeight).toFixed(5);
      tile.style.setProperty("--fp-ar", ar);
    };
    if (img.complete && img.naturalWidth > 1) go();
    else img.addEventListener("load", go, { once: true });
  }

  function ensureHint(tile) {
    if (!hasBack(tile)) return;
    if (tile.querySelector(".fp-flip-hint")) return;
    var tip = document.createElement("span");
    tip.className = "fp-flip-hint";
    tip.setAttribute("aria-hidden", "true");
    tile.appendChild(tip);
  }

  function setCount() {
    var c = document.querySelector(".fp-count");
    var n = tiles().length;
    if (c) c.textContent = n + " of " + n;
  }

  function fillSlider(v) {
    var s = document.querySelector(".fp-zslider");
    if (!s) return;
    if (draggingSlider) return;
    s.style.setProperty("--fp-p", (((v - MIN) / (MAX - MIN)) * 100).toFixed(2) + "%");
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

  function applyScatter(g, force) {
    if (!g) return;
    var map = force ? {} : loadPos();
    if (force) {
      try {
        localStorage.removeItem(POS_KEY);
      } catch (e) {}
    }
    var items = tiles();
    var tw = tileWidth(g);
    var gw = g.clientWidth || 800;
    var gh = surfaceHeight(g, tw, items);
    g.style.setProperty("--fp-table-h", gh + "px");
    g.style.setProperty("--fp-tile-w", tw + "px");
    var pad = 8;
    var minY = topInset(g);
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
      if (saved && typeof saved.x === "number" && typeof saved.y === "number") {
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
    var cx = r.left + r.width / 2 - gRect.left + (g.scrollLeft || 0);
    var cy = r.top + r.height / 2 - gRect.top + (g.scrollTop || 0);
    var w = tile.offsetWidth || r.width;
    var h = tile.offsetHeight || r.height;
    return { x: cx - w / 2, y: cy - h / 2, exact: true };
  }

  var AG_SHADOW_CLEAR = "0 2px 10px rgba(0,0,0,0), 0 1px 2px rgba(0,0,0,0)";

  function stillShadow(cs) {
    if (!cs || cs === "none") return AG_SHADOW_CLEAR;
    var colors = cs.split(/,(?![^(]*\))/).map(function (part) {
      var m = part.match(/rgba?\([^)]+\)/);
      return m ? m[0] : "rgba(0,0,0,0)";
    });
    var a = colors[0] || "rgba(0,0,0,0)";
    var b = colors[1] || "rgba(0,0,0,0)";
    return "0 2px 10px " + a + ", 0 1px 2px " + b;
  }

  function beginShadowFade(g) {
    /* Box-shadow interpolation moves the blur and offset for about half a second.
       Pin the final shape first so only the shadow strength fades in. */
    var primed = tiles().map(function (tile) {
      return { tile: tile, shadow: stillShadow(getComputedStyle(tile).boxShadow) };
    });
    primed.forEach(function (item) {
      item.tile.style.setProperty("transition", "none", "important");
      item.tile.style.setProperty("box-shadow", item.shadow);
    });
    void g.offsetWidth;
    primed.forEach(function (item) {
      item.tile.style.removeProperty("transition");
      item.tile.style.removeProperty("box-shadow");
    });
    g.classList.add("fp-ag-in");
    clearTimeout(g._agShade);
    g._agShade = setTimeout(function () {
      g.classList.remove("fp-ag-in");
    }, 1500);
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
    items.forEach(function (tile) {
      (tile.getAnimations ? tile.getAnimations() : []).forEach(function (a) {
        if (a.id === "fp-flow") a.cancel();
      });
    });
    var tw = tileWidth(g);
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
      var bottom = ny + th;
      if (bottom > fit) fit = bottom;
      planned.push({ tile: tile, i: i, th: th, nx: nx, ny: ny, prev: prev });
    });
    var gh = Math.max(agSurfaceHeight(g, tw, items), Math.ceil(fit));
    g.style.setProperty("--fp-ag-h", gh + "px");
    g.style.setProperty("--fp-tile-w", tw + "px");
    if (!resume) beginShadowFade(g);
    g.setAttribute("data-fp-layout", "antigravity");
    planned.forEach(function (p) {
      var tile = p.tile;
      var prev = p.prev;
      var tvx;
      var tvy;
      var vx;
      var vy;
      var held0;
      var driftAt = 0;
      var spin = 0;
      var rot = 0;
      var rot0 = 0;
      var spinLim = 0;
      if (resume && prev && isFinite(prev.vx) && isFinite(prev.vy)) {
        tvx = prev.tvx != null ? prev.tvx : prev.vx;
        tvy = prev.tvy != null ? prev.tvy : prev.vy;
        vx = prev.vx;
        vy = prev.vy;
        held0 = !!prev.held;
        driftAt = prev.driftAt != null ? prev.driftAt : 0;
        spin = prev.spin || 0;
        rot = isFinite(prev.rot) ? prev.rot : 0;
        rot0 = isFinite(prev.rot0) ? prev.rot0 : rot;
        spinLim = prev.spinLim || 0;
      } else {
        var vel = randSpeed();
        tvx = vel.vx;
        tvy = vel.vy;
        vx = 0;
        vy = 0;
        held0 = false;
        driftAt = performance.now() + Math.random() * 1300;
        if (!resume && window.fpAgPrev === "table") {
          var base = parseFloat(tile.style.getPropertyValue("--fp-rot"));
          if (!isFinite(base)) base = 0;
          rot = base;
          rot0 = base;
          spin = (Math.random() < 0.5 ? -1 : 1) * (1.6 + Math.random() * 2.6);
          spinLim = 6 + Math.random() * 8;
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
        spin: spin,
        rot: rot,
        rot0: rot0,
        spinLim: spinLim
      });
    });
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
        if (b.tvx != null && b.tvy != null) {
          b.vx = b.tvx;
          b.vy = b.tvy;
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
          var lim = b.spinLim || 12;
          var origin = isFinite(b.rot0) ? b.rot0 : 0;
          if (b.rot > origin + lim) {
            b.rot = origin + lim;
            b.spin = -Math.abs(b.spin);
          } else if (b.rot < origin - lim) {
            b.rot = origin - lim;
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
    var tw = tileWidth(g);
    var gw = g.clientWidth || g.offsetWidth || 800;
    if (!(gw > 40)) gw = Math.min(document.documentElement.clientWidth || 900, 1200);
    var gh = parseFloat(g.style.getPropertyValue("--fp-ag-h"));
    if (!(gh > 40)) gh = agSurfaceHeight(g, tw, tiles());
    var pad = 6;
    var minY = topInset(g);
    var now = performance.now();
    var step = Math.min(14, 360 / Math.max(agBodies.length, 1));
    agBodies.forEach(function (b, i) {
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
      b.shufT0 = now + i * step;
      b.shufMs = 520;
      b.held = true;
      b.vx = 0;
      b.vy = 0;
      var vel = randSpeed();
      b.tvx = vel.vx;
      b.tvy = vel.vy;
    });
    if (!agRunning) {
      agRunning = true;
      agLastTs = 0;
      if (!agRampT0) agRampT0 = now - AG_RAMP_MS;
      if (agRaf) cancelAnimationFrame(agRaf);
      agRaf = requestAnimationFrame(agTick);
    }
  }

  function flow(mutate, opts) {
    opts = opts || {};
    var g = grid();
    if (!g) {
      mutate();
      return;
    }
    var before = new Map();
    tiles().forEach(function (tile) {
      var r = tile.getBoundingClientRect();
      if (r.width) before.set(tile, r);
      (tile.getAnimations ? tile.getAnimations() : []).forEach(function (a) {
        if (a.id === "fp-flow") a.cancel();
      });
    });
    mutate();
    var tries = 0;
    function play() {
      var items = tiles();
      var after = items.map(function (tile) {
        return tile.getBoundingClientRect();
      });
      var changed = items.some(function (tile, i) {
        var a = before.get(tile);
        var b = after[i];
        return !a || Math.abs(a.left - b.left) > 0.5 || Math.abs(a.top - b.top) > 0.5 || Math.abs(a.width - b.width) > 0.5;
      });
      var laid = after.every(function (b) {
        return b.width > 0;
      });
      if ((!changed || !laid) && ++tries < 24) {
        requestAnimationFrame(play);
        return;
      }
      var step = Math.min(opts.step || 26, (opts.total || 620) / Math.max(items.length, 1));
      var dur = opts.dur || 520;
      var vh = window.innerHeight;
      var k = 0;
      items.forEach(function (tile, i) {
        var a = before.get(tile);
        var b = after[i];
        if (!b.width) return;
        var onScreen = (b.bottom > -40 && b.top < vh + 40) || (a && a.bottom > -40 && a.top < vh + 40);
        if (!onScreen || !a) return;
        var dx = a.left + a.width / 2 - (b.left + b.width / 2);
        var dy = a.top + a.height / 2 - (b.top + b.height / 2);
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
        var an = tile.animate(
          [
            { transform: "translate(" + Math.round(dx) + "px," + Math.round(dy) + "px)" },
            { transform: "translate(" + Math.round(dx * 0.04) + "px," + Math.round(dy * 0.04 - 2) + "px)", offset: 0.82 },
            { transform: "none" }
          ],
          { duration: dur, delay: k++ * step, easing: "cubic-bezier(.22,.8,.25,1)", fill: "backwards" }
        );
        an.id = "fp-flow";
      });
    }
    requestAnimationFrame(play);
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

  function setCols(n, animate) {
    n = clampCols(n);
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
    g.setAttribute("data-fp-layout", "table");
    g.style.removeProperty("--fp-ag-h");
    g.classList.remove("fp-ag-in");
    clearTimeout(g._agShade);
    var items = tiles();
    var tw = tileWidth(g);
    var bottom = 0;
    items.forEach(function (tile) {
      var ny = parseFloat(tile.style.getPropertyValue("--fp-ny"));
      if (!isFinite(ny)) ny = 0;
      var th = tile.offsetHeight || tileHeight(tile, tw);
      if (ny + th > bottom) bottom = ny + th;
      persist(tile);
    });
    var gh = Math.max(surfaceHeight(g, tw, items), Math.ceil(bottom + 8));
    g.style.setProperty("--fp-table-h", gh + "px");
  }

  function setLayout(mode, animate) {
    var from = layoutMode();
    mode = saveLayout(mode);
    var g = grid();
    if (!g) return;
    stopAntigravity();
    var agSeeds = mode === "antigravity" ? captureAgSeeds(g) : null;
    var apply = function () {
      if (mode === "table") {
        if (from === "antigravity") landAsTable(g);
        else {
          g.setAttribute("data-fp-layout", mode);
          clearAntigravity(g);
          applyScatter(g, false);
        }
      } else if (mode === "antigravity") {
        g.style.removeProperty("--fp-table-h");
        applyAntigravity(g, agSeeds);
      } else {
        g.setAttribute("data-fp-layout", mode);
        clearScatter(g);
        clearAntigravity(g);
        applyRowWidths(g);
      }
      syncLayoutButtons();
    };
    if (animate && mode !== "antigravity" && !(from === "antigravity" && mode === "table")) flow(apply, { step: 20, total: 480, dur: 480 });
    else apply();
    setTimeout(hoverScale, 80);
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
    for (var i = items.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = items[i];
      items[i] = items[j];
      items[j] = tmp;
    }
    if (isTable()) {
      var before = tiles().map(function (tile) {
        return {
          tile: tile,
          x: parseFloat(tile.style.getPropertyValue("--fp-nx")) || 0,
          y: parseFloat(tile.style.getPropertyValue("--fp-ny")) || 0
        };
      });
      applyScatter(g, true);
      before.forEach(function (item, i) {
        var nx = parseFloat(item.tile.style.getPropertyValue("--fp-nx")) || 0;
        var ny = parseFloat(item.tile.style.getPropertyValue("--fp-ny")) || 0;
        var dx = item.x - nx;
        var dy = item.y - ny;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        var an = item.tile.animate(
          [
            { transform: "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px)" },
            { transform: "none" }
          ],
          { duration: 520, delay: Math.min(14, 360 / items.length) * i, easing: "cubic-bezier(.22,.8,.25,1)", fill: "backwards" }
        );
        an.id = "fp-flow";
      });
      return;
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
      var r = big.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      var s = Math.min(thumb.width / r.width, thumb.height / r.height);
      var dx = thumb.left + thumb.width / 2 - (r.left + r.width / 2);
      var dy = thumb.top + thumb.height / 2 - (r.top + r.height / 2);
      big.style.transition = "none";
      big.style.transform = "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px) scale(" + s.toFixed(4) + ")";
      big.style.opacity = "1";
      void big.offsetWidth;
      big.style.transition = "";
      requestAnimationFrame(function () {
        if (lb._closing) return;
        lb.classList.add("fp-lb-on");
        big.style.transform = "none";
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
    if (sv) {
      var frame = document.createElement("iframe");
      frame.className = "fp-lb-sv";
      frame.title = "Street View";
      frame.setAttribute("loading", "lazy");
      frame.setAttribute("referrerpolicy", "no-referrer-when-downgrade");
      frame.src = sv;
      lb.appendChild(frame);
    }
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
    v = +v;
    if (!(v >= MIN)) v = MIN;
    if (v > MAX) v = MAX;
    return Math.abs(v - current) < HYST ? current : clampCols(v);
  }

  try {
    tiles().forEach(function (tile) {
      ensureHint(tile);
      syncAspect(tile);
      if (!tile.getAttribute("data-fp-side")) tile.setAttribute("data-fp-side", "a");
    });
    setCount();
    setCols(storedCols(), false);
    setLayout(layoutMode(), false);
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
    var lay = e.target.closest && e.target.closest(".fp-laybtn");
    if (lay) {
      e.preventDefault();
      setLayout(lay.getAttribute("data-fp-lay") || "row", true);
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
    return pick(MIN + t * (MAX - MIN), zVal != null ? zVal : cols());
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
    saveCols(n);
    requestAnimationFrame(unlockScroll);
  }

  document.addEventListener("pointerup", endSlider, true);
  document.addEventListener("pointercancel", endSlider, true);
  window.addEventListener("blur", endSlider);

  document.addEventListener("input", function (e) {
    if (!isSlider(e.target)) return;
    var s = e.target;
    if (draggingSlider) {
      fillSlider(+s.value);
      s.style.setProperty("--fp-p", (((+s.value - MIN) / (MAX - MIN)) * 100).toFixed(2) + "%");
      var n = pick(s.value, zVal != null ? zVal : cols());
      if (n !== cols()) {
        zVal = n;
        setCols(n, false);
      }
      return;
    }
    var k = clampCols(s.value);
    saveCols(k);
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

  window.addEventListener("resize", function () {
    if (draggingSlider) return;
    clearTimeout(window.fpResize);
    window.fpResize = setTimeout(function () {
      hoverScale();
      if (isTable()) applyScatter(grid(), false);
      else if (isAg()) applyAntigravity(grid(), captureAgSeeds(grid()), { resume: true });
      else applyRowWidths(grid());
    }, 150);
  });
})();
