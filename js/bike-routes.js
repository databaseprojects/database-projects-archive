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

  function gallerySide() {
    var maxW = Math.min(window.innerWidth * 0.96, 1600);
    var maxH = window.innerHeight * 0.92;
    return Math.min(maxW, maxH);
  }

  function cloneArt(art) {
    var svg = art.querySelector ? art.querySelector("svg") : null;
    var img = art.tagName === "IMG" ? art : null;
    if (svg) {
      var copy = svg.cloneNode(true);
      copy.removeAttribute("id");
      bindRouteTip(copy);
      return copy;
    }
    if (!img) return null;
    var el = document.createElement("img");
    el.alt = img.alt || "";
    el.draggable = false;
    el.src = img.getAttribute("src") || "";
    return el;
  }

  function setStep(lb, step, animate) {
    var track = lb.querySelector(".br-track");
    if (!track) return;
    step = Math.max(0, Math.min(2, step));
    lb._step = step;
    track.style.transition = animate === false ? "none" : "transform 400ms ease-out";
    track.style.transform = "translateY(" + (-step * 100 / 3).toFixed(4) + "%)";
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

  function shirtMarkup() {
    return '<svg class="br-shirt-shape" viewBox="0 0 200 228" aria-hidden="true"><path fill="#f7f7f7" stroke="#dedede" stroke-width="1.2" stroke-linejoin="round" d="M78 42C86 40 92 50 100 50C108 50 114 40 122 42L146 52L176 86L160 100L142 88L142 200C142 208 136 214 128 214L72 214C64 214 58 208 58 200L58 88L40 100L24 86L54 52Z"/></svg>';
  }

  function bindDeck(lb, deck) {
    var drag = null;
    deck.addEventListener("dragstart", function (e) { e.preventDefault(); });
    deck.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      var h = deck.clientHeight || 1;
      drag = {
        id: e.pointerId,
        y0: e.clientY,
        x0: e.clientX,
        lastY: e.clientY,
        lastT: performance.now(),
        vy: 0,
        h: h,
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
        drag.vy = (e.clientY - drag.lastY) / dt;
        drag.lastY = e.clientY;
        drag.lastT = now;
      }
      if (!drag.active) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dx) > Math.abs(dy)) {
          drag = null;
          return;
        }
        drag.active = true;
        var track = deck.querySelector(".br-track");
        if (track) track.style.transition = "none";
      }
      e.preventDefault();
      var trackOn = deck.querySelector(".br-track");
      if (!trackOn) return;
      var y = Math.max(-2 * drag.h, Math.min(0, -drag.step * drag.h + dy));
      trackOn.style.transform = "translateY(" + y.toFixed(1) + "px)";
    });
    function endDrag(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var info = drag;
      drag = null;
      if (!info.active) return;
      var dy = e.clientY - info.y0;
      var progress = Math.abs(dy) / info.h;
      var flick = Math.abs(dy) > 18 && Math.abs(info.vy) > 0.45 && ((info.vy < 0) === (dy < 0));
      var step = info.step;
      if (progress > 0.25 || flick) step += dy < 0 ? 1 : -1;
      setStep(lb, step, true);
    }
    deck.addEventListener("pointerup", endDrag);
    deck.addEventListener("pointercancel", endDrag);
    lb.addEventListener("wheel", function (e) {
      e.preventDefault();
      var now = performance.now();
      if (now < (lb._wheelUntil || 0)) return;
      var dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      else if (e.deltaMode === 2) dy *= deck.clientHeight || 1;
      if (Math.abs(dy) < 4) return;
      var next = (lb._step || 0) + (dy > 0 ? 1 : -1);
      if (next < 0 || next > 2) return;
      lb._wheelUntil = now + 460;
      setStep(lb, next, true);
    }, { passive: false });
  }

  function openLb(card) {
    if (document.getElementById("br-lb") || !card || card.hidden) return;
    var art = card.querySelector(".br-city-art");
    if (!art) return;
    var big = cloneArt(art);
    var framed = cloneArt(art);
    var worn = cloneArt(art);
    if (!big || !framed || !worn) return;
    var thumb = art.getBoundingClientRect();
    var lb = document.createElement("div");
    lb.id = "br-lb";
    lb.className = "br-lb";
    lb.setAttribute("role", "dialog");
    lb.setAttribute("aria-modal", "true");
    lb._from = { x: thumb.left, y: thumb.top, w: thumb.width, h: thumb.height };
    lb._step = 0;
    big.classList.add("br-lb-art");
    big.style.opacity = "0";
    var deck = document.createElement("div");
    deck.className = "br-deck";
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
    var shirtSlide = document.createElement("div");
    shirtSlide.className = "br-slide br-slide-shirt";
    var shirt = document.createElement("div");
    shirt.className = "br-shirt";
    shirt.innerHTML = shirtMarkup() + '<div class="br-shirt-print"></div>';
    shirt.querySelector(".br-shirt-print").appendChild(worn);
    shirtSlide.appendChild(shirt);
    track.appendChild(print);
    track.appendChild(frame);
    track.appendChild(shirtSlide);
    deck.appendChild(track);
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
    if (big.tagName === "IMG") {
      var kick = function () {
        if (lb._closing || lb._opened) return;
        lb._opened = true;
        if (!measureAndZoom()) {
          lb.classList.add("br-lb-on");
          big.style.opacity = "1";
        }
      };
      big.addEventListener("load", function () { requestAnimationFrame(kick); });
      if (big.complete && big.naturalWidth) requestAnimationFrame(kick);
    } else {
      requestAnimationFrame(function () {
        if (lb._closing) return;
        if (!measureAndZoom()) {
          lb.classList.add("br-lb-on");
          big.style.opacity = "1";
        }
      });
    }
    lb.addEventListener("click", function (e) {
      if (e.target === lb) closeLb();
    });
    big.addEventListener("click", function (e) { e.stopPropagation(); });
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
    if (e.key === "Escape" && document.getElementById("br-lb")) {
      e.preventDefault();
      closeLb();
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
    var stats = document.getElementById("br-van-stats");
    if (stats) {
      var n = routes.length;
      var km = routes.reduce(function (sum, route) { return sum + Number(route.km || 0); }, 0);
      stats.textContent = n + (n === 1 ? " route · " : " routes · ") + km.toFixed(1) + " km";
    }
  }).catch(function () {
    if (count) count.textContent = "The routes did not load.";
  });
})();
