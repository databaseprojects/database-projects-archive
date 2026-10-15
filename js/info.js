/* Info page. Flat dots on an even grid. A damped wave field ripples them. */
(function () {
  var canvas = document.getElementById("info-field");
  if (!canvas) return;
  var ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  var fine = window.matchMedia && window.matchMedia("(pointer: fine)");
  var CELL = 34;
  var DOT = 18;
  var DOT_R = 1.65;
  var INK = "rgba(0,0,0,0.12)";
  var cols = 2;
  var rows = 2;
  var curr = new Float32Array(4);
  var prev = new Float32Array(4);
  var next = new Float32Array(4);
  var vary = new Float32Array(4);
  var w = 1;
  var h = 1;
  var raf = 0;
  var running = false;
  var last = 0;
  var ambientAt = 0;
  var aim = {
    x: 0,
    y: 0,
    lx: 0,
    ly: 0,
    smooth: 0,
    has: false,
    tap: 0,
    lastEvt: 0,
    kind: "",
    sx: 0,
    sy: 0,
    lag: false
  };

  function hash(x, y) {
    var n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  function clamp(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }

  function alloc(c, r) {
    var n = c * r;
    curr = new Float32Array(n);
    prev = new Float32Array(n);
    next = new Float32Array(n);
    vary = new Float32Array(n);
    var y;
    var x;
    for (y = 0; y < r; y++) {
      for (x = 0; x < c; x++) {
        vary[y * c + x] = 0.78 + hash(x + 3, y + 11) * 0.44;
      }
    }
  }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth || 1;
    h = window.innerHeight || 1;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var c = Math.max(2, Math.ceil(w / CELL));
    var r = Math.max(2, Math.ceil(h / CELL));
    if (c !== cols || r !== rows) {
      cols = c;
      rows = r;
      alloc(c, r);
    }
  }

  function at(buf, x, y) {
    if (x < 0) x = 0;
    else if (x >= cols) x = cols - 1;
    if (y < 0) y = 0;
    else if (y >= rows) y = rows - 1;
    return buf[y * cols + x];
  }

  function sample(fx, fy) {
    fx = clamp(fx, 0, cols - 1);
    fy = clamp(fy, 0, rows - 1);
    var x0 = fx | 0;
    var y0 = fy | 0;
    var x1 = x0 + 1;
    if (x1 >= cols) x1 = cols - 1;
    var y1 = y0 + 1;
    if (y1 >= rows) y1 = rows - 1;
    var tx = fx - x0;
    var ty = fy - y0;
    var i00 = curr[y0 * cols + x0];
    var i10 = curr[y0 * cols + x1];
    var i01 = curr[y1 * cols + x0];
    var i11 = curr[y1 * cols + x1];
    var a = i00 + (i10 - i00) * tx;
    var b = i01 + (i11 - i01) * tx;
    return a + (b - a) * ty;
  }

  function blob(px, py, amp, rad) {
    var cx = px / CELL;
    var cy = py / CELL;
    var x0 = Math.max(0, Math.floor(cx - rad - 1));
    var x1 = Math.min(cols - 1, Math.ceil(cx + rad + 1));
    var y0 = Math.max(0, Math.floor(cy - rad - 1));
    var y1 = Math.min(rows - 1, Math.ceil(cy + rad + 1));
    var y;
    var x;
    for (y = y0; y <= y1; y++) {
      for (x = x0; x <= x1; x++) {
        var dx = x - cx;
        var dy = y - cy;
        var warp = (hash(x + 2, y + 5) - 0.5) * 0.85;
        var r = Math.sqrt(dx * dx + dy * dy) + warp;
        if (r >= rad) continue;
        var k = Math.cos((r / rad) * Math.PI * 0.5) * amp;
        var i = y * cols + x;
        curr[i] += k;
        prev[i] += k;
      }
    }
  }

  function inject(px, py, amp) {
    blob(px, py, amp, 2.15);
    var jx = (hash(Math.round(px), Math.round(py)) - 0.5) * CELL * 2.4;
    var jy = (hash(Math.round(py) + 9, Math.round(px) + 4) - 0.5) * CELL * 1.8;
    blob(px + jx, py + jy, amp * 0.42, 3.05);
  }

  /* Desktop source: wider, and the rim of the blob falls off to nothing. */
  function blobSoft(px, py, amp, rad) {
    var cx = px / CELL;
    var cy = py / CELL;
    var x0 = Math.max(0, Math.floor(cx - rad - 1));
    var x1 = Math.min(cols - 1, Math.ceil(cx + rad + 1));
    var y0 = Math.max(0, Math.floor(cy - rad - 1));
    var y1 = Math.min(rows - 1, Math.ceil(cy + rad + 1));
    var y;
    var x;
    for (y = y0; y <= y1; y++) {
      for (x = x0; x <= x1; x++) {
        var dx = x - cx;
        var dy = y - cy;
        var warp = (hash(x + 2, y + 5) - 0.5) * 0.85;
        var r = Math.sqrt(dx * dx + dy * dy) + warp;
        var u = r / rad;
        if (u >= 1) continue;
        var s = 1 - u;
        var k = s * s * (3 - 2 * s);
        k = k * k * amp;
        var i = y * cols + x;
        curr[i] += k;
        prev[i] += k;
      }
    }
  }

  function injectSoft(px, py, amp) {
    blobSoft(px, py, amp, 4.6);
    var jx = (hash(Math.round(px), Math.round(py)) - 0.5) * CELL * 2.4;
    var jy = (hash(Math.round(py) + 9, Math.round(px) + 4) - 0.5) * CELL * 1.8;
    blobSoft(px + jx, py + jy, amp * 0.42, 6.4);
  }

  function desktopPointer() {
    return aim.kind !== "touch" && fine && fine.matches;
  }

  function drive() {
    var t = clamp(aim.smooth / 1.8, 0, 1);
    return 0.08 + t * 0.12;
  }

  function ambient() {
    aim.smooth *= 0.94;
    var now = performance.now();
    var idle = !aim.has || (now - aim.lastEvt) > 640;
    if (idle && now > ambientAt) {
      ambientAt = now + 680 + Math.random() * 820;
      inject(Math.random() * w, Math.random() * h, 0.26 + Math.random() * 0.28);
      inject(Math.random() * w, Math.random() * h, 0.14 + Math.random() * 0.16);
    }
  }

  /* Fine pointer: the source lags the cursor and puts in less energy. */
  function pokeFine() {
    if (!aim.has) {
      ambient();
      return;
    }
    if (!aim.lag) {
      aim.sx = aim.x;
      aim.sy = aim.y;
      aim.lx = aim.x;
      aim.ly = aim.y;
      aim.lag = true;
    }
    aim.sx += (aim.x - aim.sx) * 0.16;
    aim.sy += (aim.y - aim.sy) * 0.16;
    var moved = Math.hypot(aim.sx - aim.lx, aim.sy - aim.ly) > 0.5;
    var live = aim.has && (performance.now() - aim.lastEvt) < 700;
    if (aim.tap || (moved && live)) {
      var t = clamp(aim.smooth / 1.8, 0, 1);
      var amp = aim.tap ? Math.max(0.34, 0.16 + t * 0.55) : (0.055 + t * 0.58);
      injectSoft(aim.sx, aim.sy, amp);
      aim.lx = aim.sx;
      aim.ly = aim.sy;
      aim.tap = 0;
      return;
    }
    ambient();
  }

  function poke() {
    if (desktopPointer()) {
      pokeFine();
      return;
    }
    var moved = Math.hypot(aim.x - aim.lx, aim.y - aim.ly) > 0.6;
    var live = aim.has && (performance.now() - aim.lastEvt) < 90;
    if (aim.tap || (moved && live)) {
      var t = clamp(aim.smooth / 1.8, 0, 1);
      var amp = aim.tap ? Math.max(0.75, 0.35 + t * 1.5) : (0.16 + t * 1.85);
      var dist = Math.hypot(aim.x - aim.lx, aim.y - aim.ly);
      var n = Math.min(5, Math.max(1, Math.round(dist / CELL)));
      var s;
      for (s = 1; s <= n; s++) {
        var u = s / n;
        inject(
          aim.lx + (aim.x - aim.lx) * u,
          aim.ly + (aim.y - aim.ly) * u,
          amp
        );
      }
      aim.lx = aim.x;
      aim.ly = aim.y;
      aim.tap = 0;
      return;
    }
    ambient();
  }

  function step() {
    poke();
    var c2 = drive();
    var gamma = 0.03;
    var rest = 0.012;
    var y;
    var x;
    for (y = 0; y < rows; y++) {
      var row = y * cols;
      for (x = 0; x < cols; x++) {
        var i = row + x;
        var u = curr[i];
        var lap = (at(curr, x - 1, y) + at(curr, x + 1, y) + at(curr, x, y - 1) + at(curr, x, y + 1) - 4 * u) * vary[i];
        var g = gamma;
        if (fine && fine.matches) {
          var rim = x;
          if (y < rim) rim = y;
          var xr = cols - 1 - x;
          var yr = rows - 1 - y;
          if (xr < rim) rim = xr;
          if (yr < rim) rim = yr;
          if (rim < 5) g = gamma + (5 - rim) * 0.03;
        }
        next[i] = (2 - g) * u - (1 - g) * prev[i] + c2 * lap - rest * u;
      }
    }
    var swap = prev;
    prev = curr;
    curr = next;
    next = swap;
    var n = cols * rows;
    var k;
    for (k = 0; k < n; k++) {
      if (curr[k] > 1.7) curr[k] = 1.7;
      else if (curr[k] < -1.7) curr[k] = -1.7;
    }
  }

  function drawDots(still) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = INK;
    var y;
    var x;
    for (y = DOT * 0.5; y < h; y += DOT) {
      for (x = DOT * 0.5; x < w; x += DOT) {
        var px = x;
        var py = y;
        var rad = DOT_R;
        if (!still) {
          var fx = x / CELL;
          var fy = y / CELL;
          var ht = sample(fx, fy);
          var gx = sample(fx + 0.85, fy) - sample(fx - 0.85, fy);
          var gy = sample(fx, fy + 0.85) - sample(fx, fy - 0.85);
          px = x + gx * 16;
          py = y + gy * 16;
          rad = DOT_R * (1 + ht * 0.9);
          if (rad < 0.55) rad = 0.55;
          if (rad > 3.4) rad = 3.4;
        }
        ctx.beginPath();
        ctx.arc(px, py, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function draw() {
    if (!(reduce && reduce.matches)) step();
    drawDots(reduce && reduce.matches);
  }

  function frame() {
    if (!running) return;
    var now = performance.now();
    if (now - last >= 34) {
      last = now;
      draw();
    }
    raf = window.setTimeout(frame, 34);
  }

  function start() {
    if (reduce && reduce.matches) {
      running = false;
      window.clearTimeout(raf);
      raf = 0;
      drawDots(true);
      return;
    }
    if (document.hidden) return;
    if (running) return;
    running = true;
    last = 0;
    ambientAt = performance.now() + 400;
    raf = window.setTimeout(frame, 34);
  }

  function stop() {
    running = false;
    window.clearTimeout(raf);
    raf = 0;
  }

  function point(e) {
    var now = performance.now();
    var dist = Math.hypot(e.clientX - aim.x, e.clientY - aim.y);
    var dt = now - aim.lastEvt;
    if (aim.has && dt > 6) {
      var inst = dist / dt;
      aim.smooth += (inst - aim.smooth) * 0.5;
    }
    if (!aim.has) {
      aim.lx = e.clientX;
      aim.ly = e.clientY;
    }
    aim.x = e.clientX;
    aim.y = e.clientY;
    aim.kind = e.pointerType || "";
    aim.has = true;
    aim.lastEvt = now;
  }

  window.addEventListener("pointermove", point, { passive: true });
  window.addEventListener("pointerdown", function (e) {
    point(e);
    aim.lx = e.clientX;
    aim.ly = e.clientY;
    aim.tap = 1;
    if (e.pointerType === "touch") aim.smooth = Math.max(aim.smooth, 0.45);
  }, { passive: true });

  resize();
  start();
  window.addEventListener("resize", function () {
    resize();
    if (!running) drawDots(true);
  });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop();
    else start();
  });
  if (reduce && reduce.addEventListener) {
    reduce.addEventListener("change", function () {
      stop();
      start();
    });
  }
})();
