/* Store and category filters. */
(function () {
  var store = "circle-k";
  var storePicked = false;
  var picked = { candy: false, chips: false, drinks: false };
  var cats = document.querySelector(".csc-cats");
  var board = document.querySelector(".csc-board");
  var motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var ease = "cubic-bezier(.22,.8,.25,1)";
  var moveMs = 380;
  var agOn = false;
  var agRunning = false;
  var agRaf = 0;
  var agBodies = [];
  var agLastTs = 0;
  var AG_SPEED_MIN = 12;
  var AG_SPEED_MAX = 58;
  if (!board) return;

  var storeNames = { "circle-k": "Circle K" };
  var svgNs = "http://www.w3.org/2000/svg";
  var ringN = 0;
  Array.prototype.forEach.call(board.querySelectorAll(".csc-swatch"), function (item) {
    var storeName = storeNames[item.getAttribute("data-store")] || "";
    var catName = item.getAttribute("data-cat") || "";
    var text = storeName && catName ? storeName + " / " + catName : (storeName || catName);
    var dot = item.querySelector(".csc-dot");
    if (dot) {
      var hex = dot.getAttribute("title") || dot.getAttribute("aria-label") || "";
      dot.removeAttribute("title");
      dot.setAttribute("aria-label", hex ? text + ", " + hex : text);
    }
    var id = "csc-ring-" + (ringN++);
    var svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("class", "csc-arc");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("aria-hidden", "true");
    var defs = document.createElementNS(svgNs, "defs");
    var path = document.createElementNS(svgNs, "path");
    path.setAttribute("id", id);
    path.setAttribute("d", "M 20,50 A 30,30 0 0,0 80,50");
    path.setAttribute("fill", "none");
    defs.appendChild(path);
    var textEl = document.createElementNS(svgNs, "text");
    textEl.setAttribute("text-anchor", "middle");
    var textPath = document.createElementNS(svgNs, "textPath");
    textPath.setAttribute("href", "#" + id);
    textPath.setAttribute("startOffset", "50%");
    textPath.textContent = text;
    textEl.appendChild(textPath);
    svg.appendChild(defs);
    svg.appendChild(textEl);
    item.appendChild(svg);
  });

  function anyCat() {
    return picked.candy || picked.chips || picked.drinks;
  }

  function wants(item) {
    var storeOk = item.getAttribute("data-store") === store;
    var name = item.getAttribute("data-cat");
    return storeOk && (!anyCat() || !!picked[name]);
  }

  function clearMove(item) {
    if (!item.getAnimations) return;
    item.getAnimations().forEach(function (anim) {
      if (anim.id === "csc-move") anim.cancel();
    });
  }

  function clearLeave(item) {
    item.classList.remove("csc-leave");
    item.style.left = "";
    item.style.top = "";
    item.style.width = "";
    item.style.height = "";
  }

  function finishBlocks() {
    Array.prototype.forEach.call(board.querySelectorAll(".csc-block"), function (block) {
      var staying = 0;
      var leaving = 0;
      Array.prototype.forEach.call(block.querySelectorAll(".csc-swatch"), function (item) {
        if (item.classList.contains("csc-leave")) leaving += 1;
        else if (!item.hidden) staying += 1;
      });
      var heading = block.querySelector("h2");
      if (staying > 0) {
        block.hidden = false;
        if (heading) heading.hidden = false;
      } else if (leaving > 0) {
        block.hidden = false;
        if (heading) heading.hidden = true;
      } else {
        block.hidden = true;
        if (heading) heading.hidden = false;
      }
    });
  }

  function syncCats() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-csc-cat]"), function (button) {
      var on = !!picked[button.getAttribute("data-csc-cat")];
      button.classList.toggle("csc-on", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function apply(animate) {
    if (agOn) {
      syncAgFilter(animate);
      return;
    }
    var reduce = !animate || motion.matches;
    var items = board.querySelectorAll(".csc-swatch");
    var plan = [];
    Array.prototype.forEach.call(items, function (item) {
      var rect = null;
      if (!item.hidden && !item.classList.contains("csc-leave")) {
        var box = item.getBoundingClientRect();
        if (box.width > 0) rect = { left: box.left, top: box.top, width: box.width, height: box.height };
      } else if (item.classList.contains("csc-leave")) {
        var held = item.getBoundingClientRect();
        if (held.width > 0) rect = { left: held.left, top: held.top, width: held.width, height: held.height };
      }
      plan.push({ item: item, rect: rect, show: wants(item) });
    });

    plan.forEach(function (entry) {
      clearMove(entry.item);
      if (entry.show) {
        clearLeave(entry.item);
        entry.item.hidden = false;
      } else if (!reduce && entry.rect) {
        entry.item.hidden = false;
        entry.item.classList.add("csc-leave");
        entry.item.style.left = entry.rect.left + "px";
        entry.item.style.top = entry.rect.top + "px";
        entry.item.style.width = entry.rect.width + "px";
        entry.item.style.height = entry.rect.height + "px";
      } else {
        clearLeave(entry.item);
        entry.item.hidden = true;
      }
    });
    finishBlocks();
    if (cats) cats.hidden = !storePicked;
    if (reduce) return;

    plan.forEach(function (entry) {
      var item = entry.item;
      if (entry.show && entry.rect) {
        var now = item.getBoundingClientRect();
        var dx = entry.rect.left - now.left;
        var dy = entry.rect.top - now.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
        var move = item.animate(
          [
            { transform: "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px)" },
            { transform: "translate(0px,0px)" }
          ],
          { duration: moveMs, easing: ease }
        );
        move.id = "csc-move";
      } else if (entry.show && !entry.rect) {
        var enter = item.animate(
          [
            { transform: "scale(0)" },
            { transform: "scale(1)" }
          ],
          { duration: moveMs, easing: ease }
        );
        enter.id = "csc-move";
      } else if (!entry.show && entry.rect && item.classList.contains("csc-leave")) {
        var leave = item.animate(
          [
            { transform: "scale(1)" },
            { transform: "scale(0)" }
          ],
          { duration: moveMs, easing: ease }
        );
        leave.id = "csc-move";
        leave.onfinish = function () {
          if (!item.classList.contains("csc-leave")) return;
          clearLeave(item);
          item.hidden = true;
          finishBlocks();
        };
      }
    });
  }

  function setPressed(selector, attr, value) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), function (button) {
      var on = button.getAttribute(attr) === value;
      button.classList.toggle("csc-on", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function randSpeed() {
    var s = AG_SPEED_MIN + Math.random() * (AG_SPEED_MAX - AG_SPEED_MIN);
    var a = Math.random() * Math.PI * 2;
    return { vx: Math.cos(a) * s, vy: Math.sin(a) * s };
  }

  function paintBody(b) {
    b.el.style.setProperty("--csc-x", b.x.toFixed(1) + "px");
    b.el.style.setProperty("--csc-y", b.y.toFixed(1) + "px");
  }

  function fieldEl() {
    return board.querySelector(".csc-ag-field");
  }

  function listEl() {
    return board.querySelector(".csc-swatches");
  }

  function blockEl() {
    return board.querySelector(".csc-block");
  }

  function stopAg() {
    agRunning = false;
    if (agRaf) cancelAnimationFrame(agRaf);
    agRaf = 0;
    agLastTs = 0;
  }

  function randomSpot(field, size) {
    var W = field.clientWidth || board.clientWidth || 800;
    var H = field.clientHeight || 400;
    var pad = 4;
    var maxX = Math.max(pad, W - size - pad);
    var maxY = Math.max(pad, H - size - pad);
    return {
      x: pad + Math.random() * Math.max(1, maxX - pad),
      y: pad + Math.random() * Math.max(1, maxY - pad)
    };
  }

  function smooth(u) {
    return u * u * (3 - 2 * u);
  }

  function tickAg(ts) {
    if (!agRunning) return;
    if (!agLastTs) agLastTs = ts;
    var dt = Math.min(0.05, (ts - agLastTs) / 1000);
    agLastTs = ts;
    var field = fieldEl();
    if (!agOn || !field) {
      stopAg();
      return;
    }
    var W = field.clientWidth || board.clientWidth || 800;
    var H = field.clientHeight || 400;
    var pad = 4;
    for (var i = 0; i < agBodies.length; i++) {
      var b = agBodies[i];
      if (!b || !b.el) continue;
      if (b.shufT0 != null) {
        var u = (ts - b.shufT0) / (b.shufMs || 520);
        if (u < 1) {
          if (u > 0) {
            var s = smooth(u);
            b.x = b.shufX0 + (b.shufX1 - b.shufX0) * s;
            b.y = b.shufY0 + (b.shufY1 - b.shufY0) * s;
            paintBody(b);
          }
          continue;
        }
        b.x = b.shufX1;
        b.y = b.shufY1;
        b.shufT0 = null;
        b.vx = 0;
        b.vy = 0;
        b.driftAt = ts;
        b.easeMs = 560;
        paintBody(b);
        continue;
      }
      if (b.driftAt != null && ts < b.driftAt) continue;
      var ramp = 1;
      if (b.easeMs > 1 && b.driftAt != null) {
        var eu = (ts - b.driftAt) / b.easeMs;
        if (eu < 1) {
          if (eu < 0) eu = 0;
          ramp = smooth(eu);
        }
      }
      if (b.tvx != null && b.tvy != null) {
        b.vx = b.tvx * ramp;
        b.vy = b.tvy * ramp;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      var maxX = Math.max(pad, W - b.w - pad);
      var maxY = Math.max(pad, H - b.h - pad);
      if (b.x < pad) {
        b.x = pad;
        b.vx = Math.abs(b.vx);
        if (b.tvx != null) b.tvx = Math.abs(b.tvx);
      } else if (b.x > maxX) {
        b.x = maxX;
        b.vx = -Math.abs(b.vx);
        if (b.tvx != null) b.tvx = -Math.abs(b.tvx);
      }
      if (b.y < pad) {
        b.y = pad;
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

  function syncAgButton() {
    var ag = document.querySelector(".csc-ag");
    if (!ag) return;
    ag.classList.toggle("csc-ag-on", agOn);
    ag.setAttribute("aria-pressed", agOn ? "true" : "false");
  }

  function slideFrom(before) {
    if (!before || motion.matches) return;
    void board.offsetWidth;
    before.forEach(function (prev, item) {
      clearMove(item);
      var now = item.getBoundingClientRect();
      if (!now.width || !prev.width) return;
      var dx = prev.left + prev.width / 2 - (now.left + now.width / 2);
      var dy = prev.top + prev.height / 2 - (now.top + now.height / 2);
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      var move = item.animate(
        [
          { transform: "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px)" },
          { transform: "translate(0px,0px)" }
        ],
        { duration: 520, easing: ease }
      );
      move.id = "csc-move";
    });
  }

  function enterAg() {
    if (agOn) return;
    var list = listEl();
    if (!list) return;
    var items = [];
    Array.prototype.forEach.call(list.querySelectorAll(".csc-swatch"), function (item) {
      if (!item.hidden && !item.classList.contains("csc-leave")) items.push(item);
    });
    if (!items.length) return;
    var origin = board.getBoundingClientRect();
    var seeds = items.map(function (el) {
      var r = el.getBoundingClientRect();
      return { el: el, x: r.left - origin.left, y: r.top - origin.top, w: r.width || 40, h: r.height || 40 };
    });
    var field = document.createElement("div");
    field.className = "csc-ag-field";
    var h = Math.max(Math.floor((window.innerHeight || 700) * 0.78), board.offsetHeight, 160);
    field.style.setProperty("--csc-ag-h", h + "px");
    field.style.height = h + "px";
    var now = performance.now();
    var bodies = [];
    seeds.forEach(function (seed, i) {
      var el = seed.el;
      var x = seed.x;
      var y = seed.y;
      clearMove(el);
      el.style.setProperty("--csc-x", x.toFixed(1) + "px");
      el.style.setProperty("--csc-y", y.toFixed(1) + "px");
      el.style.setProperty("--csc-z", String(1 + (i % 24)));
      field.appendChild(el);
      var vel = randSpeed();
      bodies.push({
        el: el,
        x: x,
        y: y,
        w: seed.w,
        h: seed.h,
        vx: 0,
        vy: 0,
        tvx: vel.vx * 0.85,
        tvy: vel.vy * 0.85,
        driftAt: now + Math.random() * 1400,
        easeMs: 560 + Math.random() * 1640,
        shufT0: null
      });
    });
    var block = blockEl();
    if (block) block.hidden = true;
    board.appendChild(field);
    agBodies = bodies;
    agOn = true;
    agRunning = true;
    agLastTs = 0;
    syncAgButton();
    agRaf = requestAnimationFrame(tickAg);
  }

  function leaveAg() {
    if (!agOn) return;
    var list = listEl();
    var field = fieldEl();
    var before = new Map();
    agBodies.forEach(function (b) {
      var r = b.el.getBoundingClientRect();
      if (r.width) before.set(b.el, r);
    });
    stopAg();
    agOn = false;
    agBodies.forEach(function (b) {
      clearMove(b.el);
      b.el.style.removeProperty("--csc-x");
      b.el.style.removeProperty("--csc-y");
      b.el.style.removeProperty("--csc-z");
      if (list) list.appendChild(b.el);
    });
    agBodies = [];
    if (field) field.remove();
    var block = blockEl();
    if (block) block.hidden = false;
    finishBlocks();
    syncAgButton();
    slideFrom(before);
  }

  function syncAgFilter(animate) {
    var field = fieldEl();
    if (!field) {
      agOn = false;
      apply(animate);
      return;
    }
    var reduce = !animate || motion.matches;
    var list = listEl();
    Array.prototype.forEach.call(board.querySelectorAll(".csc-swatch"), function (item) {
      var show = wants(item);
      var inField = item.parentNode === field;
      if (show && inField) return;
      if (show && !inField) {
        clearLeave(item);
        clearMove(item);
        item.hidden = false;
        var spot = randomSpot(field, 40);
        item.style.setProperty("--csc-x", spot.x.toFixed(1) + "px");
        item.style.setProperty("--csc-y", spot.y.toFixed(1) + "px");
        field.appendChild(item);
        var vel = randSpeed();
        agBodies.push({
          el: item,
          x: spot.x,
          y: spot.y,
          w: 40,
          h: 40,
          vx: 0,
          vy: 0,
          tvx: vel.vx * 0.85,
          tvy: vel.vy * 0.85,
          driftAt: performance.now() + 280,
          easeMs: 560,
          shufT0: null
        });
        if (!reduce) {
          var enter = item.animate(
            [{ transform: "scale(0)" }, { transform: "scale(1)" }],
            { duration: moveMs, easing: ease }
          );
          enter.id = "csc-move";
        }
        return;
      }
      if (!show && inField) {
        agBodies = agBodies.filter(function (b) { return b.el !== item; });
        if (!reduce) {
          var leave = item.animate(
            [{ transform: "scale(1)" }, { transform: "scale(0)" }],
            { duration: moveMs, easing: ease }
          );
          leave.id = "csc-move";
          leave.onfinish = function () {
            item.hidden = true;
            item.style.removeProperty("--csc-x");
            item.style.removeProperty("--csc-y");
            item.style.removeProperty("--csc-z");
            if (list) list.appendChild(item);
          };
        } else {
          item.hidden = true;
          item.style.removeProperty("--csc-x");
          item.style.removeProperty("--csc-y");
          item.style.removeProperty("--csc-z");
          if (list) list.appendChild(item);
        }
        return;
      }
      if (!show) item.hidden = true;
    });
    if (cats) cats.hidden = !storePicked;
  }

  function shuffleOrder() {
    if (agOn) {
      shuffleFloat();
      return;
    }
    var list = listEl();
    if (!list) return;
    var items = [];
    Array.prototype.forEach.call(list.querySelectorAll(".csc-swatch"), function (item) {
      if (!item.hidden && !item.classList.contains("csc-leave")) items.push(item);
    });
    if (items.length < 2) return;
    var before = new Map();
    items.forEach(function (item) {
      var r = item.getBoundingClientRect();
      if (r.width) before.set(item, r);
    });
    for (var i = items.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var held = items[i];
      items[i] = items[j];
      items[j] = held;
    }
    items.forEach(function (item) { list.appendChild(item); });
    slideFrom(before);
  }

  function shuffleFloat() {
    var field = fieldEl();
    if (!field || agBodies.length < 2) return;
    var order = agBodies.slice();
    for (var i = order.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var held = order[i];
      order[i] = order[j];
      order[j] = held;
    }
    agBodies = order;
    var now = performance.now();
    var step = Math.min(14, 360 / agBodies.length);
    agBodies.forEach(function (b, i) {
      if (!b || !b.el) return;
      var spot = randomSpot(field, b.w || 40);
      if (Math.abs(spot.x - b.x) < 12 && Math.abs(spot.y - b.y) < 12) spot = randomSpot(field, b.w || 40);
      b.shufX0 = b.x;
      b.shufY0 = b.y;
      b.shufX1 = spot.x;
      b.shufY1 = spot.y;
      b.shufT0 = now + i * step;
      b.shufMs = 520;
      b.vx = 0;
      b.vy = 0;
      var vel = randSpeed();
      b.tvx = vel.vx;
      b.tvy = vel.vy;
    });
  }

  function clampAg() {
    var field = fieldEl();
    if (!agOn || !field) return;
    var W = field.clientWidth || board.clientWidth || 800;
    var H = field.clientHeight || 400;
    var pad = 4;
    agBodies.forEach(function (b) {
      var maxX = Math.max(pad, W - b.w - pad);
      var maxY = Math.max(pad, H - b.h - pad);
      if (b.x < pad) b.x = pad;
      else if (b.x > maxX) b.x = maxX;
      if (b.y < pad) b.y = pad;
      else if (b.y > maxY) b.y = maxY;
      paintBody(b);
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll("[data-csc-store]"), function (button) {
    button.addEventListener("click", function () {
      store = button.getAttribute("data-csc-store");
      storePicked = true;
      setPressed("[data-csc-store]", "data-csc-store", store);
      apply(true);
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll("[data-csc-cat]"), function (button) {
    button.addEventListener("click", function () {
      var name = button.getAttribute("data-csc-cat");
      picked[name] = !picked[name];
      syncCats();
      apply(true);
    });
  });

  var agButton = document.querySelector(".csc-ag");
  if (agButton) {
    agButton.addEventListener("click", function () {
      if (agOn) leaveAg();
      else enterAg();
    });
  }

  var shuffleButton = document.querySelector(".csc-shuffle");
  if (shuffleButton) {
    shuffleButton.addEventListener("click", function () {
      shuffleOrder();
    });
  }

  window.addEventListener("resize", clampAg);

  apply();
})();
