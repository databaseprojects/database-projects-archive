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
  var fall = null;
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
    lag: false,
    pdx: 0,
    pdy: 0,
    turn: 0,
    ringN: 0,
    ringWait: 0,
    ringArmed: false,
    ringX: 0,
    ringY: 0,
    driven: 0
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

  /* Desktop splat: a round Gaussian with a blurred rim.
     The second centre is half as far off as before, so the wake
     stays a little directional and reads less like a hard V.
     mass is the old kernel's total kick, so the strength stays put. */
  function blobSoft(px, py, amp, sigma, mass) {
    var cx = px / CELL;
    var cy = py / CELL;
    var reach = sigma * 3.2;
    var inv = 1 / (2 * sigma * sigma);
    var x0 = Math.max(0, Math.floor(cx - reach));
    var x1 = Math.min(cols - 1, Math.ceil(cx + reach));
    var y0 = Math.max(0, Math.floor(cy - reach));
    var y1 = Math.min(rows - 1, Math.ceil(cy + reach));
    var y;
    var x;
    function weight(x, y) {
      var dx = x - cx;
      var dy = y - cy;
      var warp = (hash(x + 2, y + 5) - 0.5) * 0.4;
      var r = Math.sqrt(dx * dx + dy * dy) + warp;
      if (r < 0) r = 0;
      if (r > reach) return 0;
      return Math.exp(-(r * r) * inv);
    }
    var raw = 0;
    for (y = y0; y <= y1; y++) {
      for (x = x0; x <= x1; x++) raw += weight(x, y);
    }
    if (!(raw > 0)) return;
    var gain = amp * mass / raw;
    for (y = y0; y <= y1; y++) {
      for (x = x0; x <= x1; x++) {
        var k = weight(x, y) * gain;
        if (!k) continue;
        var i = y * cols + x;
        curr[i] += k;
        prev[i] += k;
      }
    }
  }

  function injectSoft(px, py, amp) {
    blobSoft(px, py, amp, 2.55, 11.4);
    var jx = (hash(Math.round(px), Math.round(py)) - 0.5) * CELL * 1.2;
    var jy = (hash(Math.round(py) + 9, Math.round(px) + 4) - 0.5) * CELL * 0.9;
    blobSoft(px + jx, py + jy, amp * 0.42, 3.4, 22.06);
  }

  /* Moving fine pointer: a round shock front, wider than the old splat,
     with a crisp crest and a softer wake inside. Speed scales the reach. */
  function injectShock(px, py, amp, t) {
    var cx = px / CELL;
    var cy = py / CELL;
    var span = 0.92 + t * 0.22;
    var rFront = 9.2 * span;
    var thin = 1.28;
    var wakeS = 6.8;
    var reach = rFront + thin * 3.2;
    var wave = Math.sqrt(0.10 + t * 0.12);
    var x0 = Math.max(0, Math.floor(cx - reach));
    var x1 = Math.min(cols - 1, Math.ceil(cx + reach));
    var y0 = Math.max(0, Math.floor(cy - reach));
    var y1 = Math.min(rows - 1, Math.ceil(cy + reach));
    var y;
    var x;
    function shape(x, y) {
      var dx = x - cx;
      var dy = y - cy;
      var warp = (hash(x + 2, y + 5) - 0.5) * 0.22;
      var r = Math.sqrt(dx * dx + dy * dy) + warp;
      if (r < 0) r = 0;
      var df = r - rFront;
      var front = Math.exp(-(df * df) / (2 * thin * thin));
      var wake = Math.exp(-(r * r) / (2 * wakeS * wakeS));
      return {
        r: r,
        s: front - wake * 0.2,
        slope: front * (-df / (thin * thin)) - wake * 0.2 * (-r / (wakeS * wakeS))
      };
    }
    var peak = 0;
    for (y = y0; y <= y1; y++) {
      for (x = x0; x <= x1; x++) {
        var sh = shape(x, y);
        if (sh.r > reach) continue;
        var a = sh.s < 0 ? -sh.s : sh.s;
        if (a > peak) peak = a;
      }
    }
    if (!(peak > 0)) return;
    var gain = amp * 0.145 / peak;
    for (y = y0; y <= y1; y++) {
      for (x = x0; x <= x1; x++) {
        var sh = shape(x, y);
        if (sh.r > reach || !sh.s) continue;
        var i = y * cols + x;
        var h = sh.s * gain;
        var v = -wave * sh.slope * gain * 1.1;
        curr[i] += h;
        prev[i] += h - v;
      }
    }
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

  /* Fine pointer: a short trail, speed and turns push harder, and a stop leaves rings. */
  function pokeFine() {
    var now = performance.now();
    if (!aim.has) {
      ambient();
      return;
    }
    if (now - aim.lastEvt < 50) {
      aim.ringN = 0;
      aim.ringArmed = false;
    }
    if (!aim.lag) {
      aim.sx = aim.x;
      aim.sy = aim.y;
      aim.lx = aim.x;
      aim.ly = aim.y;
      aim.lag = true;
    }
    aim.sx += (aim.x - aim.sx) * 0.55;
    aim.sy += (aim.y - aim.sy) * 0.55;
    if (aim.turn) {
      aim.sx += (aim.x - aim.sx) * 0.5;
      aim.sy += (aim.y - aim.sy) * 0.5;
    }
    var moved = Math.hypot(aim.sx - aim.lx, aim.sy - aim.ly) > 0.5;
    var live = (now - aim.lastEvt) < 360;
    if (aim.tap || (moved && live)) {
      var t = clamp(aim.smooth / 1.8, 0, 1);
      var amp = aim.tap ? Math.max(0.5, 0.24 + t * 1.05) : (0.18 + t * 1.0);
      if (aim.turn) {
        amp *= 1 + 0.5 * Math.min(aim.turn, 1.6);
        aim.turn = 0;
      }
      injectShock(aim.sx, aim.sy, amp, t);
      aim.driven = now + 1400;
      aim.lx = aim.sx;
      aim.ly = aim.sy;
      aim.tap = 0;
      return;
    }
    if (aim.turn) aim.turn = 0;
    if (!aim.ringArmed && (now - aim.lastEvt) > 80) {
      aim.ringArmed = true;
      aim.ringN = 3;
      aim.ringWait = 0;
      aim.ringX = aim.x;
      aim.ringY = aim.y;
    }
    if (aim.ringN) {
      if (aim.ringWait > 0) {
        aim.ringWait -= 1;
      } else {
        var k = 3 - aim.ringN;
        var pulse = [0.36, -0.23, 0.14];
        injectSoft(aim.ringX, aim.ringY, pulse[k]);
        aim.driven = now + 1400;
        aim.ringN -= 1;
        aim.ringWait = 9;
      }
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
    var driven = desktopPointer() && performance.now() < aim.driven;
    var pace = clamp(aim.smooth / 1.8, 0, 1);
    var c2 = driven ? (0.10 + pace * 0.12) : drive();
    var gamma = driven ? 0.02 : 0.03;
    var rest = driven ? 0.008 : 0.012;
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
          var push = desktopPointer() ? 26 : 16;
          px = x + gx * push;
          py = y + gy * push;
          rad = DOT_R * (1 + ht * 0.9);
          if (rad > 3.4) rad = 3.4;
          /* Faintest desktop dots keep about 38% of a resting dot. Touch stays at 0.55. */
          if (desktopPointer()) {
            if (rad < DOT_R * 0.62) rad = DOT_R * 0.62;
          } else if (rad < 0.55) {
            rad = 0.55;
          }
        }
        ctx.beginPath();
        ctx.arc(px, py, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /* Leaving the page: the dots drop off the bottom, then the link follows. */
  function gatherDots() {
    var dots = [];
    var y;
    var x;
    var still = reduce && reduce.matches;
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
          var push = desktopPointer() ? 26 : 16;
          px = x + gx * push;
          py = y + gy * push;
          rad = DOT_R * (1 + ht * 0.9);
          if (rad > 3.4) rad = 3.4;
          if (desktopPointer()) {
            if (rad < DOT_R * 0.62) rad = DOT_R * 0.62;
          } else if (rad < 0.55) {
            rad = 0.55;
          }
        }
        dots.push({
          x: px,
          y: py,
          rad: rad,
          delay: ((x / Math.max(w, 1)) * 140)
        });
      }
    }
    return dots;
  }

  function drawFall(now) {
    var t = now - fall.t0;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = INK;
    var i;
    for (i = 0; i < fall.dots.length; i++) {
      var d = fall.dots[i];
      var dt = (t - d.delay) / 1000;
      if (dt < 0) dt = 0;
      var py = d.y + 4200 * dt * dt;
      if (py > h + d.rad + 8) continue;
      ctx.beginPath();
      ctx.arc(d.x, py, d.rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function fallFrame() {
    if (!fall) return;
    var now = performance.now();
    drawFall(now);
    if (now - fall.t0 < 720) window.setTimeout(fallFrame, 32);
    else location.href = fall.href;
  }

  function leave(href) {
    if (fall) return;
    if (reduce && reduce.matches) {
      location.href = href;
      return;
    }
    stop();
    fall = { href: href, t0: performance.now(), dots: gatherDots() };
    fallFrame();
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
    var ndx = e.clientX - aim.x;
    var ndy = e.clientY - aim.y;
    var dist = Math.hypot(ndx, ndy);
    var dt = now - aim.lastEvt;
    var desk = e.pointerType !== "touch" && fine && fine.matches;
    if (aim.has && dt > 6) {
      var inst = dist / dt;
      aim.smooth += (inst - aim.smooth) * (desk ? 0.78 : 0.5);
    }
    if (desk && aim.has && dt > 6) {
      var prevL = Math.hypot(aim.pdx, aim.pdy);
      if (prevL > 5 && dist > 5) {
        var dot = (aim.pdx * ndx + aim.pdy * ndy) / (prevL * dist);
        if (dot < 0.25) aim.turn = Math.max(aim.turn, 1 - dot);
      }
      aim.pdx = ndx;
      aim.pdy = ndy;
    }
    if (desk && dist > 2) {
      aim.ringN = 0;
      aim.ringArmed = false;
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
  document.addEventListener("click", function (e) {
    if (fall) {
      e.preventDefault();
      return;
    }
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest ? e.target.closest("a") : null;
    if (!a || !a.href || a.target && a.target !== "_self" || a.hasAttribute("download")) return;
    var url;
    try { url = new URL(a.href, location.href); }
    catch (err) { return; }
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search) return;
    e.preventDefault();
    leave(url.href);
  }, true);
})();
