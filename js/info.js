/* Info page only. More black and grey dots, each pulsing on its own,
   drifting in a soft wave. No lines between them.
   Stop lets the dots fall to the bottom of the page. */
(function () {
  var canvas = document.querySelector(".info-net");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var dots = [];
  var mode = "float";
  var last = 0;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function count() {
    var w = window.innerWidth || 800;
    var h = window.innerHeight || 600;
    return Math.round(Math.min(96, Math.max(42, (w * h) / 16000)));
  }

  function seed() {
    var w = window.innerWidth || 800;
    var h = window.innerHeight || 600;
    var n = count();
    dots = [];
    var i;
    for (i = 0; i < n; i++) {
      var dark = Math.random() < 0.5;
      dots.push({
        x: Math.random() * w,
        y: Math.random() * h,
        p: Math.random() * Math.PI * 2,
        q: Math.random() * Math.PI * 2,
        ax: 7 + Math.random() * 9,
        ay: 18 + Math.random() * 20,
        r: 1.15 + Math.random() * 1.85,
        tone: dark ? 12 + Math.random() * 52 : 78 + Math.random() * 112,
        pp: Math.random() * Math.PI * 2,
        ps: 0.65 + Math.random() * 1.7,
        pa: 0.34 + Math.random() * 0.4
      });
    }
    mode = "float";
  }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = window.innerWidth || 800;
    var h = window.innerHeight || 600;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function floorY() {
    return (window.innerHeight || 600) - 18;
  }

  function at(d, t) {
    var wave = Math.sin(d.x * 0.011 + t * 0.42);
    return {
      x: d.x + Math.sin(t * 0.17 + d.p) * d.ax + Math.cos(t * 0.23 + d.q) * 5,
      y: d.y + wave * d.ay + Math.sin(t * 0.19 + d.q) * 7
    };
  }

  function radius(d, t) {
    return d.r * (1 + Math.sin(t * d.ps + d.pp) * d.pa);
  }

  function grey(tone, alpha) {
    var v = Math.round(tone);
    return "rgba(" + v + "," + v + "," + v + "," + alpha.toFixed(3) + ")";
  }

  function beginFall() {
    if (mode !== "float") return;
    var t = performance.now() / 1000;
    var w = window.innerWidth || 800;
    dots.forEach(function (d) {
      var p = at(d, t);
      d.tx = Math.max(12, Math.min(w - 12, p.x));
      d.fy = p.y;
      d.vy = 30 + Math.random() * 50;
      d.fr = radius(d, t);
    });
    mode = "fall";
    if (reduce) {
      var floor = floorY();
      dots.forEach(function (d) { d.fy = floor; });
      mode = "rest";
      frame(performance.now());
    }
  }

  function places(now, dt) {
    var floor = floorY();
    if (mode === "float") {
      var t = now / 1000;
      return dots.map(function (d) { return at(d, t); });
    }
    var settled = true;
    var pts = dots.map(function (d) {
      if (d.fy < floor) {
        settled = false;
        d.vy += 1100 * dt;
        if (d.vy > 1600) d.vy = 1600;
        d.fy += d.vy * dt;
        if (d.fy > floor) d.fy = floor;
      } else {
        d.fy = floor;
      }
      return { x: d.tx, y: d.fy };
    });
    if (settled) mode = "rest";
    return pts;
  }

  function paintDot(p, tone, rad) {
    var halo = Math.max(7, rad * 5.2);
    var edge = Math.min(200, tone + 64);
    var spot = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, halo);
    spot.addColorStop(0, grey(tone, 0.5));
    spot.addColorStop(0.42, grey(edge, 0.16));
    spot.addColorStop(1, grey(edge, 0));
    ctx.fillStyle = spot;
    ctx.beginPath();
    ctx.arc(p.x, p.y, halo, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = grey(tone, 0.78);
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.6, rad), 0, Math.PI * 2);
    ctx.fill();
  }

  function frame(now) {
    var w = window.innerWidth || 800;
    var h = window.innerHeight || 600;
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    ctx.clearRect(0, 0, w, h);
    var pts = places(now, dt);
    var t = now / 1000;
    var i;
    for (i = 0; i < dots.length; i++) {
      var d = dots[i];
      var rad = mode === "float" ? radius(d, t) : (d.fr || d.r);
      paintDot(pts[i], d.tone, rad);
    }
    if (reduce && mode !== "fall") return;
    if (mode === "rest") return;
    window.requestAnimationFrame(frame);
  }

  var stopBtn = document.querySelector(".info-stop");
  if (stopBtn) {
    stopBtn.addEventListener("click", function () {
      beginFall();
      stopBtn.setAttribute("aria-pressed", "true");
    });
  }

  resize();
  seed();
  window.addEventListener("resize", function () {
    resize();
    if (mode === "float") {
      seed();
      return;
    }
    var w = window.innerWidth || 800;
    var floor = floorY();
    dots.forEach(function (d) {
      d.tx = Math.max(12, Math.min(w - 12, d.tx || d.x));
      if (mode === "rest") d.fy = floor;
    });
    frame(performance.now());
  });
  window.requestAnimationFrame(frame);
})();
