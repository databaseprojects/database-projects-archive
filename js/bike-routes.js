/* Bike Routes. Click a city map to zoom it open, the same way Vacant does. */
(function () {
  var count = document.querySelector(".br-count");
  var print = document.getElementById("br-print");
  var row = document.getElementById("br-row");
  var tip = null;
  var cards = document.querySelectorAll(".br-city");
  var placeTags = document.querySelectorAll("[data-br-country]");

  function ensureTip() {
    if (tip) return tip;
    tip = document.createElement("p");
    tip.className = "br-tip";
    tip.hidden = true;
    document.body.appendChild(tip);
    return tip;
  }

  function showTip(name, x, y) {
    var el = ensureTip();
    if (!name) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.textContent = name;
    el.style.left = (x + 10) + "px";
    el.style.top = (y - 8) + "px";
  }

  function bindRouteTip(root) {
    if (!root) return;
    root.addEventListener("pointermove", function (e) {
      var node = e.target && e.target.closest ? e.target.closest(".br-route") : null;
      if (!node) {
        showTip("", 0, 0);
        return;
      }
      showTip(node.getAttribute("data-name") || "", e.clientX, e.clientY);
    });
    root.addEventListener("pointerleave", function () { showTip("", 0, 0); });
  }

  function mount(svg) {
    print.appendChild(svg);
    bindRouteTip(print);
  }

  function setPressed(buttons, attr, value) {
    buttons.forEach(function (btn) {
      var on = btn.getAttribute(attr) === value;
      btn.classList.toggle("br-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  var NS = "http://www.w3.org/2000/svg";
  var SQUARE = 1000;
  var ROW = 60;
  var DRAW = SQUARE - ROW;
  var CITY = {
    vancouver: { name: "Vancouver", routes: "130", km: "342.3 km" },
    victoria: { name: "Victoria", routes: "9", km: "34.3 km" },
    calgary: { name: "Calgary", routes: "41", km: "473.6 km" },
    edmonton: { name: "Edmonton", routes: "79", km: "506.2 km" },
    toronto: { name: "Toronto", routes: "44", km: "480.1 km" },
    ottawa: { name: "Ottawa", routes: "26", km: "271.6 km" },
    hamilton: { name: "Hamilton", routes: "10", km: "200.4 km" }
  };
  var opening = false;

  function gallerySide() {
    var maxW = Math.min(window.innerWidth * 0.96, 1600);
    var maxH = window.innerHeight * 0.92;
    return Math.min(maxW, maxH);
  }

  function textWidth(text, size) {
    var canvas = textWidth.canvas || (textWidth.canvas = document.createElement("canvas"));
    var ctx = canvas.getContext("2d");
    ctx.font = size + "px 'Courier New', Courier, monospace";
    return ctx.measureText(text).width;
  }

  function labelWidth(str) {
    var size = 9;
    return textWidth(str, size) + Math.max(str.length - 1, 0) * size * 0.16;
  }

  function fieldLabel(str, x, y) {
    var text = document.createElementNS(NS, "text");
    text.setAttribute("class", "br-field-label");
    text.setAttribute("x", x.toFixed(1));
    text.setAttribute("y", y.toFixed(1));
    text.setAttribute("font-family", "Courier New, Courier, monospace");
    text.setAttribute("font-size", "9");
    text.setAttribute("style", "fill:rgba(0,0,0,0.55);letter-spacing:0.16em");
    text.textContent = str;
    return text;
  }

  function hairline(parent, x1, y1, x2, y2) {
    var line = document.createElementNS(NS, "polyline");
    line.setAttribute("points", x1.toFixed(1) + "," + y1.toFixed(1) + " " + x2.toFixed(1) + "," + y2.toFixed(1));
    line.setAttribute("style", "stroke:rgba(0,0,0,0.4);stroke-width:0.65;stroke-linecap:butt;fill:none");
    parent.appendChild(line);
  }

  function placeRow(parent, fields, y, startSize) {
    var rowH = ROW;
    var inset = 18;
    var size = startSize;
    var widths = [];
    function measure(sz) {
      return fields.map(function (field) {
        return Math.max(labelWidth(field.label), textWidth(field.text, sz)) + inset * 2;
      });
    }
    while (size >= 12) {
      widths = measure(size);
      var used = widths.reduce(function (sum, w) { return sum + w; }, 0);
      if (used <= SQUARE || size === 12) break;
      size -= 1;
    }
    var extra = SQUARE - widths.reduce(function (sum, w) { return sum + w; }, 0);
    if (extra > 0 && widths.length) widths[0] += extra;
    var x = 0;
    var valueY = y + rowH - 16;
    fields.forEach(function (field, i) {
      if (i) hairline(parent, x, y + 8, x, y + rowH - 8);
      var inner = x + inset;
      parent.appendChild(fieldLabel(field.label, inner, y + 20));
      var text = document.createElementNS(NS, "text");
      text.setAttribute("x", inner.toFixed(1));
      text.setAttribute("y", valueY.toFixed(1));
      text.setAttribute("fill", "#111");
      text.setAttribute("font-family", "Courier New, Courier, monospace");
      text.setAttribute("font-size", String(size));
      text.textContent = field.text;
      parent.appendChild(text);
      x += widths[i];
    });
  }

  function paintPrint(svg, slug) {
    var city = CITY[slug] || { name: slug || "City", routes: "", km: "" };
    var art = document.createElementNS(NS, "g");
    while (svg.firstChild) art.appendChild(svg.firstChild);
    var s = DRAW / SQUARE;
    var dx = (SQUARE - SQUARE * s) / 2;
    art.setAttribute("transform", "translate(" + dx.toFixed(2) + " 0) scale(" + s.toFixed(6) + ")");
    var bg = document.createElementNS(NS, "rect");
    bg.setAttribute("width", "1000");
    bg.setAttribute("height", "1000");
    bg.setAttribute("fill", "#fff");
    svg.appendChild(bg);
    svg.appendChild(art);
    var cap = document.createElementNS(NS, "g");
    cap.setAttribute("class", "br-caption");
    cap.setAttribute("pointer-events", "none");
    var plate = document.createElementNS(NS, "rect");
    plate.setAttribute("x", "0");
    plate.setAttribute("y", String(DRAW));
    plate.setAttribute("width", "1000");
    plate.setAttribute("height", String(ROW));
    plate.setAttribute("fill", "#fff");
    cap.appendChild(plate);
    hairline(cap, 0, DRAW, SQUARE, DRAW);
    placeRow(cap, [
      { label: "NAME", text: city.name },
      { label: "ROUTES", text: city.routes },
      { label: "DISTANCE", text: city.km }
    ], DRAW, 20);
    svg.appendChild(cap);
    svg.setAttribute("viewBox", "0 0 " + SQUARE + " " + SQUARE);
  }

  function loadCitySvg(art, done) {
    var svg = art.querySelector ? art.querySelector("svg") : null;
    if (svg) {
      var copy = svg.cloneNode(true);
      copy.removeAttribute("id");
      done(copy);
      return;
    }
    var img = art.tagName === "IMG" ? art : null;
    if (!img) { done(null); return; }
    fetch(img.getAttribute("src") || "").then(function (res) {
      if (!res.ok) throw new Error("svg");
      return res.text();
    }).then(function (text) {
      var doc = new DOMParser().parseFromString(text, "image/svg+xml");
      var node = doc.documentElement;
      if (!node || node.tagName.toLowerCase() !== "svg") throw new Error("svg");
      done(document.importNode(node, true));
    }).catch(function () { done(null); });
  }

  function setStep(lb, step, animate) {
    var track = lb.querySelector(".br-track");
    if (!track) return;
    step = Math.max(0, Math.min(1, step));
    lb._step = step;
    lb.setAttribute("data-step", String(step));
    track.style.transition = animate === false ? "none" : "transform 400ms ease-out";
    track.style.transform = "translateX(" + (-step * 50).toFixed(4) + "%)";
  }

  function closeLb() {
    var lb = document.getElementById("br-lb");
    if (!lb || lb._closing) return;
    lb._closing = true;
    var big = lb.querySelector(".br-lb-art");
    var from = lb._from;
    if (lb._step) setStep(lb, 0, false);
    lb.classList.add("br-lb-closing");
    lb.classList.remove("br-lb-on");
    showTip("", 0, 0);
    if (big && from) {
      void big.offsetWidth;
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
      if (!document.getElementById("br-lb")) document.documentElement.classList.remove("br-lb-open");
    }, 340);
  }

  function mountEdges(lb, stage) {
    function arrow(cls, label, dir) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sh-edge " + cls;
      btn.setAttribute("aria-label", label);
      btn.innerHTML = dir < 0
        ? '<svg viewBox="0 0 12 20" aria-hidden="true"><path d="M9 2 L3 10 L9 18" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        : '<svg viewBox="0 0 12 20" aria-hidden="true"><path d="M3 2 L9 10 L3 18" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      btn.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        e.stopPropagation();
      });
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        setStep(lb, (lb._step || 0) + dir, true);
      });
      return btn;
    }
    stage.appendChild(arrow("sh-edge-prev", "Previous", -1));
    stage.appendChild(arrow("sh-edge-next", "Next", 1));
    var coarse = window.matchMedia && window.matchMedia("(hover: none), (pointer: coarse)").matches;
    if (coarse) {
      stage.classList.add("sh-touch-hint");
      window.setTimeout(function () { stage.classList.remove("sh-touch-hint"); }, 1000);
    }
  }

  function bindDeck(lb, deck) {
    var drag = null;
    deck.addEventListener("dragstart", function (e) { e.preventDefault(); });
    deck.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest(".sh-edge")) return;
      e.preventDefault();
      var w = deck.clientWidth || 1;
      drag = {
        id: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        lastX: e.clientX,
        lastT: performance.now(),
        vx: 0,
        w: w,
        step: lb._step || 0,
        active: false
      };
      try { deck.setPointerCapture(e.pointerId); } catch (err) {}
    });
    deck.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x0;
      var dy = e.clientY - drag.y0;
      var now = performance.now();
      var dt = now - drag.lastT;
      if (dt >= 16) {
        drag.vx = (e.clientX - drag.lastX) / dt;
        drag.lastX = e.clientX;
        drag.lastT = now;
      }
      if (!drag.active) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          drag = null;
          return;
        }
        drag.active = true;
        deck.classList.add("sh-dragging");
        var track = deck.querySelector(".br-track");
        if (track) track.style.transition = "none";
      }
      e.preventDefault();
      var trackOn = deck.querySelector(".br-track");
      if (!trackOn) return;
      var x = Math.max(-drag.w, Math.min(0, -drag.step * drag.w + dx));
      trackOn.style.transform = "translateX(" + x.toFixed(1) + "px)";
    });
    function endDrag(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var info = drag;
      drag = null;
      deck.classList.remove("sh-dragging");
      if (!info.active) return;
      var dx = e.clientX - info.x0;
      var progress = Math.abs(dx) / info.w;
      var flick = Math.abs(dx) > 18 && Math.abs(info.vx) > 0.45 && ((info.vx < 0) === (dx < 0));
      var step = info.step;
      if (progress > 0.25 || flick) step += dx < 0 ? 1 : -1;
      setStep(lb, step, true);
    }
    deck.addEventListener("pointerup", endDrag);
    deck.addEventListener("pointercancel", endDrag);
    lb.addEventListener("wheel", function (e) {
      e.preventDefault();
      var now = performance.now();
      if (now < (lb._wheelUntil || 0)) return;
      var dx = e.deltaX;
      var dy = e.deltaY;
      if (e.deltaMode === 1) { dx *= 16; dy *= 16; }
      else if (e.deltaMode === 2) {
        var unit = deck.clientWidth || 1;
        dx *= unit;
        dy *= unit;
      }
      var delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      if (Math.abs(delta) < 4) return;
      var next = (lb._step || 0) + (delta > 0 ? 1 : -1);
      if (next < 0 || next > 1) return;
      lb._wheelUntil = now + 460;
      setStep(lb, next, true);
    }, { passive: false });
  }

  function openLb(card) {
    if (opening || document.getElementById("br-lb") || !card || card.hidden) return;
    var art = card.querySelector(".br-city-art");
    if (!art) return;
    var slug = card.getAttribute("data-slug") || "";
    opening = true;
    loadCitySvg(art, function (svg) {
      opening = false;
      if (!svg || document.getElementById("br-lb") || card.hidden) return;
      paintPrint(svg, slug);
      bindRouteTip(svg);
      var thumb = art.getBoundingClientRect();
      var big = svg;
      var framed = svg.cloneNode(true);
      bindRouteTip(framed);
      var lb = document.createElement("div");
      lb.id = "br-lb";
      lb.className = "br-lb";
      lb.setAttribute("role", "dialog");
      lb.setAttribute("aria-modal", "true");
      lb.setAttribute("data-step", "0");
      lb._from = { x: thumb.left, y: thumb.top, w: thumb.width, h: thumb.height };
      lb._step = 0;
      big.classList.add("br-lb-art");
      big.style.opacity = "0";
      var deck = document.createElement("div");
      deck.className = "br-deck br-stage";
      var side = gallerySide().toFixed(2) + "px";
      deck.style.width = side;
      deck.style.height = side;
      var track = document.createElement("div");
      track.className = "br-track";
      var print = document.createElement("div");
      print.className = "br-slide br-slide-print";
      print.appendChild(big);
      var frame = document.createElement("div");
      frame.className = "br-slide br-slide-frame";
      var wall = document.createElement("div");
      wall.className = "sh-wall";
      wall.innerHTML = '<div class="sh-hang"><div class="sh-mould"><div class="sh-mat"><div class="sh-frame-art"></div></div></div></div>';
      wall.querySelector(".sh-frame-art").appendChild(framed);
      frame.appendChild(wall);
      track.appendChild(print);
      track.appendChild(frame);
      deck.appendChild(track);
      mountEdges(lb, deck);
      lb.appendChild(deck);
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
          lb.classList.add("br-lb-on");
          big.style.transform = "none";
        });
        return true;
      }
      document.body.appendChild(lb);
      document.documentElement.classList.add("br-lb-open");
      bindDeck(lb, deck);
      requestAnimationFrame(function () {
        if (lb._closing) return;
        if (!measureAndZoom()) {
          lb.classList.add("br-lb-on");
          big.style.opacity = "1";
        }
      });
      lb.addEventListener("click", function (e) {
        if (e.target === lb) closeLb();
      });
      big.addEventListener("click", function (e) { e.stopPropagation(); });
    });
  }

  placeTags.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var country = btn.getAttribute("data-br-country") || "all";
      setPressed(placeTags, "data-br-country", country);
      cards.forEach(function (card) {
        var place = card.getAttribute("data-country") || "";
        card.hidden = country !== "all" && place !== country;
      });
    });
  });

  if (row) {
    row.addEventListener("click", function (e) {
      if (document.getElementById("br-lb")) return;
      var card = e.target && e.target.closest ? e.target.closest(".br-city") : null;
      if (!card || card.hidden) return;
      openLb(card);
    });
  }

  window.addEventListener("keydown", function (e) {
    var lb = document.getElementById("br-lb");
    if (!lb) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeLb();
      return;
    }
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      setStep(lb, (lb._step || 0) + (e.key === "ArrowRight" ? 1 : -1), true);
    }
  });

  if (print) {
    fetch("city.svg?v=20261022f").then(function (res) {
      if (!res.ok) throw new Error("svg");
      return res.text();
    }).then(function (text) {
      var doc = new DOMParser().parseFromString(text, "image/svg+xml");
      var svg = doc.documentElement;
      if (!svg || svg.tagName.toLowerCase() !== "svg") throw new Error("svg");
      mount(document.importNode(svg, true));
    }).catch(function () {
      if (count && !count.textContent) count.textContent = "The drawing did not load.";
    });
  }

  fetch("routes.json?v=20261017d").then(function (res) {
    if (!res.ok) throw new Error("routes");
    return res.json();
  }).then(function (data) {
    var routes = data.routes || [];
    if (count) count.textContent = String(routes.length);
  }).catch(function () {
    if (count) count.textContent = "The routes did not load.";
  });
})();
