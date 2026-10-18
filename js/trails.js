/* Trails. Same gallery, framed print, and cart as Ski Hills. */
(function () {
  var NS = "http://www.w3.org/2000/svg";
  var SQUARE = 1000;
  var BAND = 120;
  var DRAW = SQUARE - BAND;
  var grid = document.getElementById("sh-grid");
  var count = document.querySelector(".sh-count");
  var tags = document.querySelector(".sh-tags");
  var trails = [];
  var place = "whistler";
  var kind = "bike";
  var query = "";
  var CART_KEY = "shDemoCart";
  var SIZES = [
    { kind: "5x5", label: "5 x 5 in" },
    { kind: "10x10", label: "10 x 10 in" },
    { kind: "12x12", label: "12 x 12 in" },
    { kind: "20x20", label: "20 x 20 in" }
  ];

  function fold(text) {
    return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function matches(trail) {
    if (place !== "all" && trail.place !== place) return false;
    if (kind !== "all" && trail.kind !== kind) return false;
    if (query && fold(trail.name + " " + trail.area).indexOf(query) === -1) return false;
    return true;
  }

  function frameLimit() {
    var viewW = document.documentElement.clientWidth || window.innerWidth;
    return Math.min(viewW * 0.92, Math.max(viewW - 48, 0), 1100);
  }

  function syncStroke() {
    var svg = grid && (grid.querySelector(".sh-hill:not([hidden]) svg") || grid.querySelector(".sh-hill svg"));
    if (!grid || !svg) return;
    var w = svg.getBoundingClientRect().width;
    if (w < 2) return;
    var gw = Math.min(frameLimit(), window.innerHeight * 0.88);
    if (gw < 1) return;
    grid.style.setProperty("--sh-stroke", (1.15 * (w / gw)).toFixed(3) + "px");
  }

  function apply() {
    var shown = 0;
    trails.forEach(function (trail) {
      var on = matches(trail);
      if (trail.el) trail.el.hidden = !on;
      if (on) shown += 1;
    });
    if (count) count.textContent = (query && !shown) ? "No trails match" : (shown + " of " + trails.length);
    requestAnimationFrame(syncStroke);
  }

  function setPressed() {
    if (!tags) return;
    Array.prototype.forEach.call(tags.querySelectorAll("[data-tr-place]"), function (btn) {
      var on = place !== "all" && btn.getAttribute("data-tr-place") === place;
      btn.classList.toggle("sh-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    Array.prototype.forEach.call(tags.querySelectorAll("[data-tr-kind]"), function (btn) {
      var on = kind !== "all" && btn.getAttribute("data-tr-kind") === kind;
      btn.classList.toggle("sh-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function drawingSvg(trail) {
    var lines = (trail.lines || []).map(function (pts) {
      return '<polyline class="sh-run" points="' + pts + '"></polyline>';
    }).join("");
    var holder = document.createElement("div");
    holder.innerHTML = '<svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' + lines + "</svg>";
    var svg = holder.querySelector("svg");
    writeCaption(svg, trail);
    return svg;
  }

  function writeCaption(svg, trail) {
    var cap = document.createElementNS(NS, "g");
    cap.setAttribute("class", "sh-caption");
    function hair(x1, y1, x2, y2) {
      var node = document.createElementNS(NS, "line");
      node.setAttribute("x1", x1);
      node.setAttribute("y1", y1);
      node.setAttribute("x2", x2);
      node.setAttribute("y2", y2);
      node.setAttribute("stroke", "rgba(0,0,0,0.35)");
      node.setAttribute("stroke-width", "1");
      node.setAttribute("vector-effect", "non-scaling-stroke");
      cap.appendChild(node);
    }
    function label(text, x, y) {
      var node = document.createElementNS(NS, "text");
      node.setAttribute("x", x);
      node.setAttribute("y", y);
      node.setAttribute("fill", "rgba(0,0,0,0.55)");
      node.setAttribute("font-family", "Courier New, Courier, monospace");
      node.setAttribute("font-size", "11");
      node.setAttribute("letter-spacing", "0.14em");
      node.textContent = text;
      cap.appendChild(node);
    }
    function value(text, x, y) {
      var node = document.createElementNS(NS, "text");
      node.setAttribute("x", x);
      node.setAttribute("y", y);
      node.setAttribute("fill", "#111");
      node.setAttribute("font-family", "Courier New, Courier, monospace");
      node.setAttribute("font-size", "22");
      node.textContent = text;
      cap.appendChild(node);
    }
    hair(0, DRAW, SQUARE, DRAW);
    hair(0, DRAW + BAND / 2, SQUARE, DRAW + BAND / 2);
    label("TYPE", 760, DRAW + 28);
    value("Bike", 760, DRAW + 52);
    label("TRAIL", 24, DRAW + BAND / 2 + 28);
    value(trail.name, 24, DRAW + BAND / 2 + 52);
    label("PLACE", 560, DRAW + BAND / 2 + 28);
    value(trail.area, 560, DRAW + BAND / 2 + 52);
    svg.appendChild(cap);
  }

  function draw(trail) {
    var card = document.createElement("a");
    card.className = "sh-hill";
    card.id = trail.slug;
    card.href = "#" + trail.slug;
    card.setAttribute("aria-label", trail.name + ", " + trail.area);
    card.appendChild(drawingSvg(trail));
    var name = document.createElement("span");
    name.className = "sh-hill-name";
    name.textContent = trail.name;
    card.appendChild(name);
    card.addEventListener("pointerenter", function (e) {
      if (e.pointerType === "touch") return;
      card.classList.add("sh-name-on");
    });
    card.addEventListener("pointerleave", function (e) {
      if (e.pointerType === "touch") return;
      card.classList.remove("sh-name-on");
    });
    trail.el = card;
    grid.appendChild(card);
  }

  function printsOn() {
    return !!(window.SH_PRINTS && window.SH_PRINTS.enabled === true);
  }

  function priceFor(sizeKind) {
    var prices = window.SH_PRINTS && window.SH_PRINTS.prices;
    if (!prices || !Object.prototype.hasOwnProperty.call(prices, sizeKind)) return null;
    return typeof prices[sizeKind] === "number" ? prices[sizeKind] : null;
  }

  function money(amount) {
    if (typeof amount !== "number") return "Price TBD";
    var cur = (window.SH_PRINTS && window.SH_PRINTS.currency) || "CAD";
    var num = amount % 1 === 0 ? String(amount) : amount.toFixed(2);
    return "$" + num + " " + cur;
  }

  function readCart() {
    try {
      var raw = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      if (!Array.isArray(raw)) return [];
      return raw.filter(function (item) { return item && item.kind && item.slug; });
    } catch (e) {
      return [];
    }
  }

  function writeCart(items) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch (e) {}
    renderCart();
  }

  function addTrail(trail) {
    var slug = "trail-" + trail.slug;
    var items = readCart();
    var found = null;
    items.forEach(function (item) { if (item.slug === slug) found = item; });
    if (found) found.qty = (found.qty || 1) + 1;
    else items.push({ key: slug, slug: slug, name: trail.name + " — " + trail.area, kind: "5x5", label: "5 x 5 in", qty: 1 });
    writeCart(items);
    Array.prototype.forEach.call(document.querySelectorAll(".sh-cart-n"), function (node) {
      node.classList.remove("sh-bump");
      void node.offsetWidth;
      node.classList.add("sh-bump");
    });
  }

  function renderCart() {
    var items = readCart();
    var n = items.reduce(function (sum, item) { return sum + (item.qty || 1); }, 0);
    Array.prototype.forEach.call(document.querySelectorAll(".sh-cart-n"), function (node) {
      node.textContent = String(n);
    });
    var panel = document.getElementById("sh-cart-panel");
    if (!panel) return;
    panel.textContent = "";
    var title = document.createElement("h2");
    title.textContent = "Cart";
    panel.appendChild(title);
    if (!items.length) {
      var empty = document.createElement("p");
      empty.className = "sh-cart-empty";
      empty.textContent = "Cart is empty";
      panel.appendChild(empty);
      return;
    }
    var list = document.createElement("ul");
    list.className = "sh-cart-list";
    var sum = 0;
    items.forEach(function (item) {
      var li = document.createElement("li");
      var info = document.createElement("div");
      var name = document.createElement("div");
      name.textContent = item.name + (item.qty > 1 ? " × " + item.qty : "");
      var select = document.createElement("select");
      select.className = "sh-cart-size";
      select.setAttribute("aria-label", "Size for " + item.name);
      SIZES.forEach(function (size) {
        var opt = document.createElement("option");
        opt.value = size.kind;
        opt.textContent = size.label + " — Price TBD";
        select.appendChild(opt);
      });
      var digital = document.createElement("option");
      digital.value = "digital";
      digital.textContent = "Digital download — " + money(priceFor("digital"));
      select.appendChild(digital);
      if (select.querySelector("option[value='" + item.kind + "']")) select.value = item.kind;
      select.addEventListener("change", function (e) {
        e.stopPropagation();
        var next = select.value;
        var rows = readCart();
        rows.forEach(function (row) {
          if (row.key !== item.key) return;
          row.kind = next;
          row.label = next === "digital" ? "Digital download" : ((SIZES.filter(function (s) { return s.kind === next; })[0] || {}).label || next);
        });
        writeCart(rows);
      });
      var amount = priceFor(item.kind);
      var price = document.createElement("div");
      price.textContent = money(amount);
      if (typeof amount === "number") sum += amount * (item.qty || 1);
      info.appendChild(name);
      info.appendChild(select);
      info.appendChild(price);
      var remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.addEventListener("click", function (e) {
        e.stopPropagation();
        writeCart(readCart().filter(function (row) { return row.key !== item.key; }));
      });
      li.appendChild(info);
      li.appendChild(remove);
      list.appendChild(li);
    });
    panel.appendChild(list);
    var sub = document.createElement("p");
    sub.className = "sh-cart-sub";
    sub.textContent = "Subtotal " + money(sum);
    panel.appendChild(sub);
  }

  function toggleCart(force) {
    var panel = document.getElementById("sh-cart-panel");
    if (!panel) return;
    var open = force == null ? panel.hidden : !!force;
    panel.hidden = !open;
    Array.prototype.forEach.call(document.querySelectorAll(".sh-cart-btn"), function (btn) {
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  function ensureCart() {
    if (!printsOn()) return;
    if (!document.getElementById("sh-cart-panel")) {
      var panel = document.createElement("div");
      panel.id = "sh-cart-panel";
      panel.className = "sh-cart-panel";
      panel.hidden = true;
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", "Cart");
      document.body.appendChild(panel);
      document.addEventListener("click", function (e) {
        var btn = e.target.closest && e.target.closest(".sh-cart-btn");
        if (btn) {
          e.preventDefault();
          e.stopPropagation();
          toggleCart();
          return;
        }
        if (e.target.closest && e.target.closest("#sh-cart-panel")) return;
        toggleCart(false);
      });
    }
    renderCart();
  }

  function setFramed(lb, on) {
    var track = lb.querySelector(".sh-track");
    lb.classList.toggle("sh-framed", !!on);
    if (!track) return;
    track.style.transition = "transform 400ms ease-out";
    track.style.transform = on ? "translateX(-50%)" : "translateX(0)";
  }

  function mountCartAdd(trail) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sh-cart-add";
    btn.setAttribute("aria-label", "Add to cart");
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7h12l-1.2 8H8.2L6 7z"/><path d="M6 7 4.6 4H2"/><circle cx="9" cy="18.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="16" cy="18.5" r="1.1" fill="currentColor" stroke="none"/><path d="M17.2 5.2h3.6M19 3.4v3.6"/></svg>';
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      addTrail(trail);
    });
    return btn;
  }

  function bindDrag(lb, stage) {
    var drag = null;
    stage.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button !== 0) return;
      var w = stage.clientWidth || 1;
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, w: w, base: lb.classList.contains("sh-framed") ? -w : 0, active: false, vx: 0, lastX: e.clientX, lastT: performance.now() };
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    });
    stage.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x0;
      var dy = e.clientY - drag.y0;
      var now = performance.now();
      if (now - drag.lastT >= 16) {
        drag.vx = (e.clientX - drag.lastX) / (now - drag.lastT);
        drag.lastX = e.clientX;
        drag.lastT = now;
      }
      if (!drag.active) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
        drag.active = true;
      }
      e.preventDefault();
      var x = Math.max(-drag.w, Math.min(0, drag.base + dx));
      var track = stage.querySelector(".sh-track");
      if (!track) return;
      track.style.transition = "none";
      track.style.transform = "translateX(" + x.toFixed(1) + "px)";
    });
    function endDrag(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var info = drag;
      drag = null;
      if (!info.active) return;
      var dx = e.clientX - info.x0;
      var toward = info.base === 0;
      var progress = toward ? -dx / info.w : dx / info.w;
      var flick = Math.abs(dx) > 18 && (toward ? info.vx < -0.45 : info.vx > 0.45);
      var snap = progress > 0.25 || flick;
      setFramed(lb, toward ? snap : !snap);
    }
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);
  }

  function closeLb() {
    var lb = document.getElementById("sh-lb");
    if (!lb) return;
    lb.classList.add("sh-lb-closing");
    lb.classList.remove("sh-lb-on");
    window.setTimeout(function () {
      if (lb.parentNode) lb.parentNode.removeChild(lb);
      if (!document.getElementById("sh-lb")) document.documentElement.classList.remove("sh-lb-open");
    }, 340);
    if (location.hash) history.pushState(null, "", location.pathname + location.search);
  }

  function openLb(trail) {
    var existing = document.getElementById("sh-lb");
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    var lb = document.createElement("div");
    lb.id = "sh-lb";
    lb.className = "sh-lb";
    lb.setAttribute("role", "dialog");
    lb.setAttribute("aria-modal", "true");
    lb.setAttribute("aria-label", trail.name + ", " + trail.area);
    var big = drawingSvg(trail);
    big.removeAttribute("aria-hidden");
    var maxW = frameLimit();
    var maxH = window.innerHeight * 0.86 - 72;
    var px = Math.min(maxW, maxH);
    var size = px.toFixed(1) + "px";
    big.style.width = "100%";
    big.style.height = "100%";
    var stage = document.createElement("div");
    stage.className = "sh-stage";
    stage.style.width = size;
    var track = document.createElement("div");
    track.className = "sh-track";
    var plain = document.createElement("div");
    plain.className = "sh-slide sh-slide-plain";
    var plainArt = document.createElement("div");
    plainArt.className = "sh-slide-art";
    plainArt.style.height = size;
    plainArt.appendChild(big);
    plain.appendChild(plainArt);
    var framed = document.createElement("div");
    framed.className = "sh-slide sh-slide-frame";
    var wall = document.createElement("div");
    wall.className = "sh-wall";
    wall.style.height = size;
    wall.innerHTML = '<div class="sh-hang"><div class="sh-mould"><div class="sh-mat"><div class="sh-frame-art"></div></div></div></div>';
    var mock = drawingSvg(trail);
    mock.setAttribute("class", "sh-card");
    mock.style.width = "100%";
    mock.style.height = "100%";
    wall.querySelector(".sh-frame-art").appendChild(mock);
    framed.appendChild(wall);
    track.appendChild(plain);
    track.appendChild(framed);
    stage.appendChild(track);
    function arrow(cls, label, framedOn) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sh-edge " + cls;
      btn.setAttribute("aria-label", label);
      btn.innerHTML = framedOn
        ? '<svg viewBox="0 0 12 20" aria-hidden="true"><path d="M9 2 L3 10 L9 18" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        : '<svg viewBox="0 0 12 20" aria-hidden="true"><path d="M3 2 L9 10 L3 18" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        setFramed(lb, framedOn);
      });
      return btn;
    }
    stage.appendChild(arrow("sh-edge-next", "Show framed print", true));
    stage.appendChild(arrow("sh-edge-prev", "Show print", false));
    var row = document.createElement("div");
    row.className = "sh-print-row";
    row.appendChild(stage);
    if (printsOn()) row.appendChild(mountCartAdd(trail));
    var view = document.createElement("div");
    view.className = "sh-view";
    view.appendChild(row);
    lb.appendChild(view);
    bindDrag(lb, stage);
    document.body.appendChild(lb);
    document.documentElement.classList.add("sh-lb-open");
    requestAnimationFrame(function () { lb.classList.add("sh-lb-on"); });
    lb.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest(".sh-stage, .sh-edge, .sh-cart-add")) return;
      closeLb();
    });
  }

  function openFromHash() {
    var slug = decodeURIComponent((location.hash || "").replace(/^#/, "")).trim();
    if (!slug) return;
    var trail = trails.filter(function (item) { return item.slug === slug; })[0];
    if (trail) openLb(trail);
  }

  if (tags) {
    tags.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".sh-tag") : null;
      if (!btn) return;
      var nextPlace = btn.getAttribute("data-tr-place");
      if (nextPlace) {
        place = place === nextPlace ? "all" : nextPlace;
        setPressed();
        apply();
        return;
      }
      var nextKind = btn.getAttribute("data-tr-kind");
      if (nextKind) {
        kind = kind === nextKind ? "all" : nextKind;
        setPressed();
        apply();
      }
    });
  }

  var find = document.querySelector(".sh-find");
  if (find) {
    find.addEventListener("input", function () {
      query = fold(find.value).trim();
      apply();
    });
  }

  if (grid) {
    grid.addEventListener("click", function (e) {
      var card = e.target.closest ? e.target.closest(".sh-hill") : null;
      if (!card) return;
      e.preventDefault();
      var trail = trails.filter(function (item) { return item.slug === card.id; })[0];
      if (!trail) return;
      if (location.hash !== "#" + trail.slug) history.pushState(null, "", location.pathname + location.search + "#" + trail.slug);
      openLb(trail);
    });
  }

  window.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var panel = document.getElementById("sh-cart-panel");
    if (panel && !panel.hidden) {
      e.preventDefault();
      toggleCart(false);
      return;
    }
    var lb = document.getElementById("sh-lb");
    if (!lb) return;
    e.preventDefault();
    if (lb.classList.contains("sh-framed")) setFramed(lb, false);
    else closeLb();
  });

  var COL_KEY = "trZoomCols";
  var dragging = false;
  var zLock = null;

  function phoneSlider() {
    return window.Shared && Shared.isPhone();
  }

  function sliderEnds() {
    return phoneSlider() ? { min: 4, max: 7 } : { min: 5, max: 7 };
  }

  function clampSlider(n) {
    var ends = sliderEnds();
    n = Math.round(+n);
    if (n < ends.min) return ends.min;
    if (n > ends.max) return ends.max;
    return n;
  }

  function setCols(n) {
    n = clampSlider(n);
    var s = document.querySelector(".sh-zslider");
    var ends = sliderEnds();
    if (s) {
      s.min = String(ends.min);
      s.max = String(ends.max);
      if (!dragging) s.value = String(n);
      s.style.setProperty("--sh-p", (((+s.value - ends.min) / (ends.max - ends.min)) * 100).toFixed(2) + "%");
    }
    if (grid) {
      grid.setAttribute("data-columns", String(n));
      grid.style.setProperty("--sh-cols", String(n));
    }
    requestAnimationFrame(syncStroke);
  }

  var slider = document.querySelector(".sh-zslider");
  if (slider) {
    slider.addEventListener("pointerdown", function () {
      dragging = true;
      if (window.Shared && !zLock) zLock = Shared.lockScroll({ className: "sh-sizing", grid: grid });
    });
    function endSlider() {
      if (!dragging) return;
      dragging = false;
      var n = clampSlider(slider.value);
      if (!phoneSlider()) {
        try { localStorage.setItem(COL_KEY, String(n)); } catch (e) {}
      }
      setCols(n);
      if (zLock && window.Shared) {
        Shared.unlockScroll(zLock);
        zLock = null;
      }
    }
    document.addEventListener("pointerup", endSlider, true);
    document.addEventListener("pointercancel", endSlider, true);
    slider.addEventListener("input", function () {
      var ends = sliderEnds();
      slider.style.setProperty("--sh-p", (((+slider.value - ends.min) / (ends.max - ends.min)) * 100).toFixed(2) + "%");
      setCols(slider.value);
    });
  }

  window.addEventListener("resize", function () {
    setCols(phoneSlider() ? 4 : (function () {
      var n = 6;
      try { n = parseInt(localStorage.getItem(COL_KEY) || "6", 10); } catch (e) {}
      return n;
    })());
  });

  ensureCart();
  fetch("trails.json?v=20261018a").then(function (res) {
    if (!res.ok) throw new Error("trails");
    return res.json();
  }).then(function (data) {
    trails = (data.trails || []).map(function (trail) {
      trail.place = "whistler";
      trail.area = trail.area || "Whistler, BC";
      trail.kind = trail.kind || "bike";
      return trail;
    });
    trails.forEach(draw);
    setPressed();
    var stored = 6;
    try { stored = parseInt(localStorage.getItem(COL_KEY) || "6", 10); } catch (e) {}
    setCols(phoneSlider() ? 4 : stored);
    apply();
    openFromHash();
  }).catch(function () {
    if (count) count.textContent = "The trail drawings did not load.";
  });
})();
