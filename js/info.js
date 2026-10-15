/* Info page. Dots sit on a shape that turns and morphs between an ovoid, a cone, and a sheet. */
(function () {
  var canvas = document.getElementById("info-field");
  if (!canvas) return;
  var ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  var N = 360;
  var GOLD = 2.399963229728653;
  var sphere = new Float32Array(N * 3);
  var cone = new Float32Array(N * 3);
  var sheet = new Float32Array(N * 3);
  var bias = new Float32Array(N);
  var i;
  for (i = 0; i < N; i++) {
    var y = 1 - (i + 0.5) / N * 2;
    var rad = Math.sqrt(Math.max(0, 1 - y * y));
    var th = i * GOLD;
    sphere[i * 3] = Math.cos(th) * rad * 0.9;
    sphere[i * 3 + 1] = y * 1.08;
    sphere[i * 3 + 2] = Math.sin(th) * rad * 0.76;
    var row = i % 24;
    var ring = Math.floor(i / 24);
    var rings = Math.ceil(N / 24);
    var t = rings <= 1 ? 0 : ring / (rings - 1);
    var flare = 0.04 + t * t * 1.12;
    var ang = (row / 24) * Math.PI * 2 + t * 6.4;
    cone[i * 3] = Math.cos(ang) * flare;
    cone[i * 3 + 1] = 1.02 - t * 2.12;
    cone[i * 3 + 2] = Math.sin(ang) * flare;
    var cols = 20;
    var rows = Math.ceil(N / cols);
    var c = i % cols;
    var r = Math.floor(i / cols);
    var u = c / (cols - 1);
    var v = rows <= 1 ? 0.5 : r / (rows - 1);
    sheet[i * 3] = (u - 0.06) * 2.6;
    sheet[i * 3 + 1] = (0.42 - v) * 1.15 - u * 0.32;
    sheet[i * 3 + 2] = (v - 0.5) * 0.7 + (u - 0.5) * 0.42;
    bias[i] = ((i * 17) % 100) / 100;
  }
  var shapes = [sphere, cone, sheet];
  var view = [];
  for (i = 0; i < N; i++) view.push({ i: i, x: 0, y: 0, z: 0, p: 1 });
  var raf = 0;
  var running = false;
  var last = 0;
  var w = 1;
  var h = 1;

  function smooth(t) {
    return t * t * (3 - 2 * t);
  }

  function point(src, index, out) {
    var ia = index * 3;
    out[0] = src[ia];
    out[1] = src[ia + 1];
    out[2] = src[ia + 2];
  }

  var pa = [0, 0, 0];
  var pb = [0, 0, 0];

  function project(x, y, z, spin) {
    var cs = Math.cos(spin);
    var sn = Math.sin(spin);
    var x1 = x * cs - z * sn;
    var z1 = x * sn + z * cs;
    var tilt = 0.58;
    var ct = Math.cos(tilt);
    var st = Math.sin(tilt);
    var y2 = y * ct - z1 * st;
    var z2 = y * st + z1 * ct;
    var p = 2.05 / (4.4 - z2);
    return { x: x1 * p, y: y2 * p, z: z2, p: p };
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
  }

  function draw(now) {
    var held = reduce && reduce.matches;
    var time = held ? 0 : now;
    var seg = held ? 0 : ((time % 48000) / 48000) * 3;
    var i0 = Math.floor(seg) % 3;
    var frac = seg - Math.floor(seg);
    var blend = frac < 0.5 ? 0 : smooth((frac - 0.5) / 0.5);
    var i1 = (i0 + 1) % 3;
    var spin = held ? 0.65 : time * 0.00018;
    var srcA = shapes[i0];
    var srcB = shapes[i1];
    var k;
    var pMin = 1e9;
    var pMax = -1e9;
    for (k = 0; k < N; k++) {
      point(srcA, k, pa);
      point(srcB, k, pb);
      var pr = project(
        pa[0] + (pb[0] - pa[0]) * blend,
        pa[1] + (pb[1] - pa[1]) * blend,
        pa[2] + (pb[2] - pa[2]) * blend,
        spin
      );
      view[k].x = pr.x;
      view[k].y = pr.y;
      view[k].z = pr.z;
      view[k].p = pr.p;
      if (pr.p < pMin) pMin = pr.p;
      if (pr.p > pMax) pMax = pr.p;
    }
    view.sort(function (p, q) { return p.z - q.z; });
    ctx.clearRect(0, 0, w, h);
    var scale = Math.min(w, h) * 0.42;
    var cx = w * 0.58;
    var cy = h * 0.6;
    var span = (pMax - pMin) || 1;
    for (k = 0; k < N; k++) {
      var d = view[k];
      var near = (d.p - pMin) / span;
      var size = (1 + bias[d.i] * 7) * (0.4 + near * 0.9);
      if (size < 1) size = 1;
      if (size > 8) size = 8;
      var grey = Math.round(86 - near * 52);
      var alpha = 0.12 + near * 0.46;
      ctx.fillStyle = "rgba(" + grey + "," + grey + "," + grey + "," + alpha.toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(cx + d.x * scale, cy - d.y * scale, size * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function frame() {
    if (!running) return;
    var now = window.performance.now();
    if (now - last >= 34) {
      last = now;
      draw(now);
    }
    raf = window.setTimeout(frame, 34);
  }

  function start() {
    if (reduce && reduce.matches) {
      running = false;
      window.clearTimeout(raf);
      raf = 0;
      draw(0);
      return;
    }
    if (document.hidden) return;
    if (running) return;
    running = true;
    last = 0;
    raf = window.setTimeout(frame, 34);
  }

  function stop() {
    running = false;
    window.clearTimeout(raf);
    raf = 0;
  }

  resize();
  start();
  window.addEventListener("resize", function () {
    resize();
    if (!running) draw(0);
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
