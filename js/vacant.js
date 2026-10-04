/* Vacant storefronts: multi-select tag filter, column slider, hover, shuffle, lightbox map. */
(function () {
  var COL_KEY = "vsfZoomCols";
  var GPS_KEY = "vsfGpsOn";
  var MIN = 5;
  var MAX = 20;
  var DEF = 6;
  var HOVER_BOOST = 1.15;
  var HOVER_CAP = 8;
  var HYST = 0.72;
  var dragging = false;
  var zLock = null;
  var zRaf = 0;
  var zVal = null;
  var gpsOn = true;

  try {
    gpsOn = localStorage.getItem(GPS_KEY) !== "0";
  } catch (e) {}

  function grid() {
    return document.querySelector(".vsf-grid");
  }

  function hold() {
    return document.querySelector(".vsf-hold");
  }

  function allTiles() {
    return Array.prototype.slice
      .call(document.querySelectorAll(".vsf-grid .vsf-tile, .vsf-hold .vsf-tile"))
      .sort(function (a, b) {
        return (+a.getAttribute("data-order") || 0) - (+b.getAttribute("data-order") || 0);
      });
  }

  function visible() {
    var g = grid();
    if (!g) return [];
    return Array.prototype.slice.call(g.querySelectorAll(".vsf-tile")).sort(function (a, b) {
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

  function cols() {
    var g = grid();
    var raw = g ? g.getAttribute("data-columns") || DEF : DEF;
    if (phoneSlider()) return clampSlider(raw);
    return clampCols(raw);
  }

  function storedCols() {
    var n = DEF;
    try {
      var raw = localStorage.getItem(COL_KEY);
      if (raw) n = parseInt(raw, 10);
    } catch (e) {}
    return clampCols(n || DEF);
  }

  function saveCols(n) {
    try {
      localStorage.setItem(COL_KEY, String(n));
    } catch (e) {}
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

  function setCount(shown, total) {
    var c = document.querySelector(".vsf-count");
    if (c) c.textContent = shown + " of " + total + (shown ? "" : " (none tagged yet)");
  }

  function fillSlider(v) {
    var s = document.querySelector(".vsf-zslider");
    if (!s) return;
    var ends = sliderEnds();
    var shown = dragging ? +s.value : v;
    s.min = String(ends.min);
    s.max = String(ends.max);
    s.style.setProperty("--vsf-p", (((shown - ends.min) / (ends.max - ends.min)) * 100).toFixed(2) + "%");
    if (!dragging && +s.value !== v) s.value = v;
  }

  function hoverScale() {
    var g = grid();
    if (!g) return;
    var n = cols();
    var w = g.clientWidth;
    var first = g.querySelector(".vsf-tile");
    var cur = first ? first.offsetWidth : 0;
    if (!cur) return;
    var gap = n > 1 ? Math.max(0, (w - cur * n) / (n - 1)) : 0;
    var w5 = (w - gap * 4) / 5;
    var s = Math.max(1.08, Math.min(HOVER_CAP, (w5 * HOVER_BOOST) / cur));
    g.style.setProperty("--vsf-hs", s.toFixed(3));
  }

  function flow(mutate, opts) {
    opts = opts || {};
    var g = grid();
    if (!g) {
      mutate();
      return;
    }
    var before = new Map();
    visible().forEach(function (tile) {
      var r = tile.getBoundingClientRect();
      if (r.width) before.set(tile, r);
      (tile.getAnimations ? tile.getAnimations() : []).forEach(function (a) {
        if (a.id === "vsf-flow") a.cancel();
      });
    });
    mutate();
    var tries = 0;
    function play() {
      g = grid();
      if (!g || g.classList.contains("vsf-empty")) return;
      var items = visible();
      var after = items.map(function (tile) {
        return tile.getBoundingClientRect();
      });
      var changed = items.some(function (tile, i) {
        var a = before.get(tile);
        var b = after[i];
        return !a || Math.abs(a.left - b.left) > 0.5 || Math.abs(a.top - b.top) > 0.5 || Math.abs(a.width - b.width) > 0.5;
      });
      var laid = after.length && after.every(function (b) {
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
        if (!a || !b.width) return;
        if (b.bottom < -40 || b.top > vh + 40) return;
        var dx = a.left + a.width / 2 - (b.left + b.width / 2);
        var dy = a.top + a.height / 2 - (b.top + b.height / 2);
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
        var an = tile.animate(
          [
            { transform: "translate(" + Math.round(dx) + "px," + Math.round(dy) + "px)", opacity: 1 },
            { transform: "none", opacity: 1 }
          ],
          { duration: dur, delay: k++ * step, easing: "cubic-bezier(.22,.8,.25,1)", fill: "backwards" }
        );
        an.id = "vsf-flow";
      });
    }
    requestAnimationFrame(play);
  }

  function land(tile) {
    tile.style.transition = "none";
    tile.removeAttribute("data-vsf-wait");
    if (!tile.animate) {
      tile.style.transition = "";
      return;
    }
    var an = tile.animate(
      [
        { transform: "translate(0,-22px)", opacity: 0 },
        { transform: "translate(0,-6px)", opacity: 0.35, offset: 0.45 },
        { transform: "none", opacity: 1 }
      ],
      { duration: 560, easing: "cubic-bezier(.25,.8,.3,1)", fill: "backwards" }
    );
    an.id = "vsf-flow";
    an.onfinish = function () {
      tile.style.transition = "";
    };
  }

  function cascade(g) {
    var run = (window.vsfCasc = (window.vsfCasc || 0) + 1);
    var items = visible();
    items.forEach(function (tile) {
      tile.setAttribute("data-vsf-wait", "");
    });
    var tries = 0;
    function go() {
      if (run !== window.vsfCasc) return;
      var rects = items.map(function (tile) {
        return tile.getBoundingClientRect();
      });
      if (!rects.every(function (r) { return r.width > 0; }) && ++tries < 20) {
        requestAnimationFrame(go);
        return;
      }
      var vh = window.innerHeight;
      var on = [];
      items.forEach(function (tile, i) {
        var r = rects[i];
        if (!r || r.top > vh + 80 || r.bottom < -40) tile.removeAttribute("data-vsf-wait");
        else on.push(tile);
      });
      var step = Math.max(70, Math.min(120, 1600 / Math.max(on.length, 1)));
      on.forEach(function (tile, i) {
        setTimeout(function () {
          if (run !== window.vsfCasc) return;
          land(tile);
        }, i * step);
      });
    }
    requestAnimationFrame(go);
  }

  function selected() {
    var out = [];
    document.querySelectorAll(".vsf-tag.active").forEach(function (b) {
      var f = b.getAttribute("data-filter");
      if (f && f !== "all") out.push(f);
    });
    return out;
  }

  function matches(tile, tags) {
    if (!tags.length) return true;
    var have = " " + (tile.getAttribute("data-tags") || "") + " ";
    for (var i = 0; i < tags.length; i++) {
      if (have.indexOf(" " + tags[i] + " ") < 0) return false;
    }
    return true;
  }

  function applyFilter(btn) {
    var g = grid();
    var h = hold();
    if (!g || !h) return;
    var filter = btn.getAttribute("data-filter") || "all";
    if (filter === "all") {
      document.querySelectorAll(".vsf-tag").forEach(function (b) {
        var on = b.getAttribute("data-filter") === "all";
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    } else {
      var allBtn = document.querySelector('.vsf-tag[data-filter="all"]');
      if (allBtn) {
        allBtn.classList.remove("active");
        allBtn.setAttribute("aria-pressed", "false");
      }
      btn.classList.toggle("active");
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
      if (!selected().length && allBtn) {
        allBtn.classList.add("active");
        allBtn.setAttribute("aria-pressed", "true");
      }
    }
    var tags = selected();
    var items = allTiles();
    var shown = items.filter(function (tile) {
      return matches(tile, tags);
    }).length;
    setCount(shown, items.length);
    if (!shown) {
      window.vsfCasc = (window.vsfCasc || 0) + 1;
      items.forEach(function (tile) {
        g.appendChild(tile);
        tile.removeAttribute("data-vsf-wait");
      });
      g.classList.add("vsf-empty");
      return;
    }
    items.forEach(function (tile) {
      (matches(tile, tags) ? g : h).appendChild(tile);
    });
    g.classList.remove("vsf-empty");
    cascade(g);
    setTimeout(hoverScale, 80);
  }

  function shuffle() {
    if (dragging) return;
    var g = grid();
    if (!g || g.classList.contains("vsf-empty")) return;
    var items = Array.prototype.slice.call(g.querySelectorAll(".vsf-tile"));
    if (items.length < 2) return;
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

  function setCols(n, animate) {
    n = clampSlider(n);
    fillSlider(n);
    var g = grid();
    if (!g) return;
    var apply = function () {
      g.setAttribute("data-columns", String(n));
      g.style.setProperty("--vsf-cols", String(n));
    };
    if (animate && g.getAttribute("data-columns") !== String(n)) flow(apply, { step: 22, total: 520, dur: 480 });
    else apply();
    if (!dragging) setTimeout(hoverScale, 50);
  }

  function sharpen(tile, px) {
    var img = imgOf(tile);
    if (!img) return;
    var src = img.getAttribute("src") || "";
    var next = hiSrc(src, px || 800);
    if (!next || next === src) return;
    var pre = new Image();
    pre.onload = function () {
      img.src = next;
    };
    pre.src = next;
  }

  function onEnter(e) {
    var tile = e.target.closest && e.target.closest(".vsf-grid .vsf-tile");
    if (!tile || dragging) return;
    if (e.relatedTarget && tile.contains(e.relatedTarget)) return;
    var g = grid();
    if (!g) return;
    var s = parseFloat(g.style.getPropertyValue("--vsf-hs")) || 1.3;
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
    tile.style.setProperty("--vsf-tx", tx.toFixed(1) + "px");
    tile.style.setProperty("--vsf-ty", ty.toFixed(1) + "px");
    sharpen(tile, bw * s);
  }

  function closeLb() {
    var lb = document.getElementById("vsf-lb");
    if (!lb || lb._closing) return;
    lb._closing = true;
    var big = lb.querySelector(":scope > img");
    var from = lb._from;
    document.body.classList.remove("vsf-lb-lock");
    lb.classList.add("vsf-lb-closing");
    lb.classList.remove("vsf-lb-on");
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

  function tileXY(lat, lon, z) {
    var n = Math.pow(2, z);
    var x = ((lon + 180) / 360) * n;
    var rad = (lat * Math.PI) / 180;
    var y = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n;
    return { x: x, y: y };
  }

  function mountMap(lb, lat, lon) {
    var box = document.createElement("div");
    box.className = "vsf-lb-map";
    box.addEventListener("click", function (e) {
      e.stopPropagation();
    });
    var z = 15;
    var p = tileXY(lat, lon, z);
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
    dot.setAttribute("aria-label", "Open in Google Maps");
    dot.addEventListener("click", function (e) {
      e.stopPropagation();
      window.open("https://www.google.com/maps?q=" + lat + "," + lon, "_blank", "noopener,noreferrer");
    });
    var label = document.createElement("div");
    label.className = "vsf-lb-map-label";
    label.textContent = lat.toFixed(4) + " N  " + Math.abs(lon).toFixed(4) + " W";
    box.appendChild(tiles);
    box.appendChild(dot);
    box.appendChild(label);
    lb.appendChild(box);
  }

  function galleryBox(nw, nh, allowUpscale) {
    if (!(nw > 1) || !(nh > 1)) return null;
    var maxW = Math.min(window.innerWidth * 0.96, 1600);
    var maxH = window.innerHeight * 0.92;
    var fit = Math.min(maxW / nw, maxH / nh);
    if (!allowUpscale && fit > 1) fit = 1;
    return { w: nw * fit, h: nh * fit };
  }

  function openLb(tile) {
    if (dragging) return;
    var img = imgOf(tile);
    if (!img) return;
    var lo = img.currentSrc || img.getAttribute("src") || "";
    var src = hiSrc(lo, 1600) || lo;
    var thumb = tile.getBoundingClientRect();
    var existing = document.getElementById("vsf-lb");
    if (existing) existing.parentNode.removeChild(existing);
    var lb = document.createElement("div");
    lb.id = "vsf-lb";
    lb.className = "vsf-lb";
    lb.setAttribute("role", "dialog");
    lb.setAttribute("aria-modal", "true");
    lb._from = { x: thumb.left, y: thumb.top, w: thumb.width, h: thumb.height };
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
    var box = galleryBox(nw, nh, allowUpscale);
    if (box) {
      big.style.width = box.w.toFixed(2) + "px";
      big.style.height = box.h.toFixed(2) + "px";
      big.style.maxWidth = "none";
      big.style.maxHeight = "none";
    }
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
        lb.classList.add("vsf-lb-on");
        big.style.transform = "none";
      });
      return true;
    }
    function settleOpen() {
      if (lb._opened || lb._closing) return;
      lb._opened = true;
      big.removeEventListener("load", onOpenLoad);
      if (!measureAndZoom()) {
        lb.classList.add("vsf-lb-on");
        big.style.opacity = "1";
      }
    }
    function onOpenLoad() {
      if (lb._opened || lb._closing) return;
      requestAnimationFrame(settleOpen);
    }
    big.addEventListener("load", onOpenLoad);
    big.decoding = "sync";
    big.addEventListener("error", function () {
      if (lb._closing || !lo || big.getAttribute("src") === lo) return;
      big.src = lo;
    });
    big.src = src || lo;
    lb.appendChild(big);
    document.body.appendChild(lb);
    document.body.classList.add("vsf-lb-lock");
    if (big.complete && big.naturalWidth) onOpenLoad();
    if (gpsOn) {
      var lat = parseFloat(tile.getAttribute("data-lat"));
      var lon = parseFloat(tile.getAttribute("data-lon"));
      if (isFinite(lat) && isFinite(lon)) mountMap(lb, lat, lon);
    }
    lb.addEventListener("click", function (e) {
      if (e.target === lb) closeLb();
    });
    big.addEventListener("click", function (e) {
      e.stopPropagation();
    });
  }

  function syncGpsButton() {
    var b = document.querySelector(".vsf-gps-btn");
    if (!b) return;
    b.classList.toggle("active", gpsOn);
    b.setAttribute("aria-pressed", gpsOn ? "true" : "false");
  }

  function lockScroll() {
    if (zLock) return;
    var h = document.documentElement;
    var g = grid();
    zLock = {
      oy: h.style.overflowY,
      mh: g ? g.style.minHeight : "",
      ac: g ? g.style.alignContent : "",
      rows: g ? g.style.gridAutoRows : ""
    };
    h.classList.add("vsf-sizing");
    h.style.overflowY = window.innerWidth - h.clientWidth > 0 ? "scroll" : "hidden";
    if (g) {
      g.style.minHeight = g.offsetHeight + "px";
      /* The locked height would otherwise stretch the row tracks, so the photos
         shrink while each row stays where it was. Pack the rows to the new size. */
      g.style.alignContent = "start";
      g.style.gridAutoRows = "max-content";
    }
  }

  function unlockScroll() {
    if (!zLock) return;
    document.documentElement.classList.remove("vsf-sizing");
    document.documentElement.style.overflowY = zLock.oy;
    var g = grid();
    if (g) {
      g.style.minHeight = zLock.mh;
      g.style.alignContent = zLock.ac;
      g.style.gridAutoRows = zLock.rows;
    }
    zLock = null;
  }

  function pick(v, current) {
    var ends = sliderEnds();
    v = +v;
    if (!(v >= ends.min)) v = ends.min;
    if (v > ends.max) v = ends.max;
    return Math.abs(v - current) < HYST ? current : clampSlider(v);
  }

  var arrivalDone = false;

  function revealFrame(img) {
    if (!(img.naturalWidth > 0)) return;
    // A decoded photo can stay blank on its layer until the next mouse move.
    // contrast(1) is the same picture; the style change makes the browser paint it.
    requestAnimationFrame(function () {
      if (!img.parentNode) return;
      img.style.filter = "contrast(1)";
      void img.offsetWidth;
      img.style.filter = "";
    });
  }

  function finishArrival() {
    if (arrivalDone) return;
    arrivalDone = true;
    var g = grid();
    if (!g) return;
    Array.prototype.forEach.call(g.querySelectorAll("img"), revealFrame);
    g.classList.remove("vsf-pending");
    hoverScale();
  }

  function watchArrival() {
    var g = grid();
    if (!g) return;
    var imgs = Array.prototype.slice.call(g.querySelectorAll("img"));
    var left = imgs.length;
    if (!left) {
      finishArrival();
      return;
    }
    function note(img) {
      if (img._vsfNoted) return;
      img._vsfNoted = true;
      left--;
      if (left <= 0) finishArrival();
    }
    imgs.forEach(function (img) {
      if (img.complete) note(img);
      else {
        img.addEventListener("load", function () { note(img); });
        img.addEventListener("error", function () { note(img); });
      }
    });
    setTimeout(finishArrival, 5000);
  }

  function wakeImages() {
    var g = grid();
    if (!g) return;
    Array.prototype.forEach.call(g.querySelectorAll("img"), function (img) {
      var src = img.getAttribute("src");
      if (!src) return;
      img.decoding = "sync";
      img.loading = "eager";
      try { img.fetchPriority = "high"; } catch (err) {}
      var retried = false;
      var kick = function () {
        if (img.naturalWidth > 0) {
          if (arrivalDone) revealFrame(img);
          return;
        }
        if (retried) return;
        retried = true;
        img.src = src;
      };
      if (!img._vsfWake) {
        img._vsfWake = true;
        img.addEventListener("load", kick);
      }
      if (img.decode) img.decode().then(kick).catch(kick);
      else if (img.complete) kick();
    });
  }

  wakeImages();
  watchArrival();
  setCount(allTiles().length, allTiles().length);
  setCols(phoneSlider() ? 4 : storedCols(), false);
  syncGpsButton();
  setTimeout(hoverScale, 80);
  window.addEventListener("load", wakeImages);
  window.addEventListener("pageshow", wakeImages);

  document.addEventListener("click", function (e) {
    var tag = e.target.closest && e.target.closest(".vsf-tag");
    if (tag) {
      e.preventDefault();
      applyFilter(tag);
      return;
    }
    if (e.target.closest && e.target.closest(".vsf-shuffle")) {
      e.preventDefault();
      shuffle();
      return;
    }
    if (e.target.closest && e.target.closest(".vsf-gps-btn")) {
      e.preventDefault();
      gpsOn = !gpsOn;
      try {
        localStorage.setItem(GPS_KEY, gpsOn ? "1" : "0");
      } catch (err) {}
      syncGpsButton();
      return;
    }
    if (document.getElementById("vsf-lb") || dragging) return;
    var tile = e.target.closest && e.target.closest(".vsf-grid .vsf-tile");
    if (!tile) return;
    e.preventDefault();
    openLb(tile);
  });

  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && document.getElementById("vsf-lb")) {
      e.preventDefault();
      closeLb();
    }
  });

  document.addEventListener("contextmenu", function (e) {
    if (e.target.closest && (e.target.closest(".vsf-tile") || e.target.closest(".vsf-lb"))) e.preventDefault();
  });
  document.addEventListener("dragstart", function (e) {
    if (e.target.closest && (e.target.closest(".vsf-tile") || e.target.closest(".vsf-lb"))) e.preventDefault();
  });

  document.addEventListener("mouseover", onEnter);
  document.addEventListener("mouseout", function (e) {
    var tile = e.target.closest && e.target.closest(".vsf-tile");
    if (!tile || (e.relatedTarget && tile.contains(e.relatedTarget))) return;
    tile.setAttribute("data-vsf-leaving", "");
    clearTimeout(tile._leave);
    tile._leave = setTimeout(function () {
      tile.removeAttribute("data-vsf-leaving");
    }, 600);
  });

  function isSlider(t) {
    return t && t.classList && t.classList.contains("vsf-zslider");
  }

  document.addEventListener("pointerdown", function (e) {
    if (!isSlider(e.target)) return;
    dragging = true;
    lockScroll();
  }, true);

  function endSlider() {
    if (!dragging) return;
    var s = document.querySelector(".vsf-zslider");
    var n = s ? pick(s.value, zVal != null ? zVal : cols()) : cols();
    zVal = null;
    dragging = false;
    setCols(n, false);
    if (!phoneSlider()) saveCols(n);
    requestAnimationFrame(function () {
      unlockScroll();
      hoverScale();
    });
  }

  document.addEventListener("pointerup", endSlider, true);
  document.addEventListener("pointercancel", endSlider, true);
  window.addEventListener("blur", endSlider);

  document.addEventListener("input", function (e) {
    if (!isSlider(e.target)) return;
    var s = e.target;
    if (dragging) {
      var ends = sliderEnds();
      s.style.setProperty("--vsf-p", (((+s.value - ends.min) / (ends.max - ends.min)) * 100).toFixed(2) + "%");
      var n = pick(s.value, zVal != null ? zVal : cols());
      if (n !== (zVal != null ? zVal : cols())) {
        zVal = n;
        if (!zRaf) {
          zRaf = requestAnimationFrame(function () {
            zRaf = 0;
            if (zVal == null) return;
            var v = zVal;
            setCols(v, false);
            zVal = v;
          });
        }
      }
      return;
    }
    var k = clampSlider(s.value);
    if (!phoneSlider()) saveCols(k);
    setCols(k, true);
  });

  var phoneCols = phoneSlider();
  window.addEventListener("resize", function () {
    if (dragging) return;
    clearTimeout(window.vsfResize);
    window.vsfResize = setTimeout(function () {
      var nowPhone = phoneSlider();
      if (nowPhone !== phoneCols) {
        phoneCols = nowPhone;
        setCols(nowPhone ? 4 : storedCols(), false);
      }
      hoverScale();
    }, 150);
  });
})();
