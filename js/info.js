/* Info page only. Slow grey dots, faint links, and a rare pulse between them.
   Stop lets the dots fall to the bottom of the page. */
(function () {
  var canvas = document.querySelector(".info-net");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var dots = [];
  var pulses = [];
  var nextPulse = 0;
  var mode = "float";
  var last = 0;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function count() {
    var w = window.innerWidth || 800;
    var h = window.innerHeight || 600;
    return Math.round(Math.min(26, Math.max(14, (w * h) / 62000)));
  }

  function seed() {
    var w = window.innerWidth || 800;
    var h = window.innerHeight || 600;
    var n = count();
    var insetX = Math.max(24, w * 0.06);
    var insetY = Math.max(24, h * 0.08);
    dots = [];
    var i;
    for (i = 0; i < n; i++) {
      dots.push({
        x: insetX + Math.random() * Math.max(1, w - insetX * 2),
        y: insetY + Math.random() * Math.max(1, h - insetY * 2),
        p: Math.random() * Math.PI * 2,
        q: Math.random() * Math.PI * 2,
        ax: 14 + Math.random() * 22,
        ay: 10 + Math.random() * 18,
        sp: 0.11 + Math.random() * 0.16,
        r: 1.15 + Math.random() * 1.35,
        tone: 28 + Math.random() * 70
      });
    }
    pulses = [];
    nextPulse = 0;
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
    return {
      x: d.x + Math.sin(t * d.sp + d.p) * d.ax + Math.sin(t * d.sp * 0.37 + d.q) * (d.ax * 0.35),
      y: d.y + Math.cos(t * d.sp * 0.82 + d.q) * d.ay
    };
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
    });
    pulses = [];
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

  function frame(now) {
    var w = window.innerWidth || 800;
    var h = window.innerHeight || 600;
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    ctx.clearRect(0, 0, w, h);
    var pts = places(now, dt);
    var reach = Math.min(w, h) * 0.34;
    var links = [];
    var i;
    var j;
    for (i = 0; i < pts.length; i++) {
      for (j = i + 1; j < pts.length; j++) {
        var dx = pts[j].x - pts[i].x;
        var dy = pts[j].y - pts[i].y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > reach || dist < 1) continue;
        var fade = 1 - dist / reach;
        ctx.strokeStyle = grey(70, fade * 0.11);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pts[i].x, pts[i].y);
        ctx.lineTo(pts[j].x, pts[j].y);
        ctx.stroke();
        if (mode === "float" && fade > 0.35) links.push({ i: i, j: j });
      }
    }
    if (mode === "float" && !reduce && links.length && now >= nextPulse && pulses.length < 2) {
      var link = links[Math.floor(Math.random() * links.length)];
      pulses.push({ i: link.i, j: link.j, t0: now, life: 1500 });
      nextPulse = now + 1400 + Math.random() * 2200;
    }
    if (mode === "float") {
      var kept = [];
      for (i = 0; i < pulses.length; i++) {
        var pulse = pulses[i];
        var u = (now - pulse.t0) / pulse.life;
        if (u >= 1) continue;
        kept.push(pulse);
        var a = pts[pulse.i];
        var b = pts[pulse.j];
        if (!a || !b) continue;
        var x = a.x + (b.x - a.x) * u;
        var y = a.y + (b.y - a.y) * u;
        var alpha = Math.sin(u * Math.PI) * 0.28;
        var glow = ctx.createRadialGradient(x, y, 0, x, y, 10);
        glow.addColorStop(0, grey(30, alpha));
        glow.addColorStop(1, grey(30, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fill();
      }
      pulses = kept;
    }
    for (i = 0; i < dots.length; i++) {
      var d = dots[i];
      var p = pts[i];
      var spot = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, d.r * 4);
      spot.addColorStop(0, grey(d.tone, 0.42));
      spot.addColorStop(0.4, grey(Math.min(150, d.tone + 50), 0.16));
      spot.addColorStop(1, grey(170, 0));
      ctx.fillStyle = spot;
      ctx.beginPath();
      ctx.arc(p.x, p.y, d.r * 4, 0, Math.PI * 2);
      ctx.fill();
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
