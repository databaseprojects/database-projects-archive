/* Store and category filters.
   Secondary colours switch: SECONDARY_COLOURS.
   Set it to true to show the "2" button and the orbiting moons again.
   The orbit sizes in this file and in convenient-store-colors.css stay as they are. */
(function () {
  var SECONDARY_COLOURS = false;
  /* Packaging tag (Bag). Set to true to show the tag and its filter again. */
  var SHOW_PACKAGING = false;
  var store = "";
  var city = "";
  var catOn = {};
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
  var mode = "row";
  var showSec = false;
  var packFilter = "";
  var shelfCols = 1;
  /* Each city owns its store buttons and its category buttons.
     A store with no samples stays a grey placeholder. */
  var CITIES = {
    vancouver: {
      stores: [
        ["circle-k", "Circle K"],
        ["7-eleven", "7-Eleven"],
        ["hasty-market", "Hasty Market"],
        ["on-the-run", "On the Run"],
        ["shell-select", "Shell Select"],
        ["petro-canada", "Petro-Canada"],
        ["esso", "Esso"],
        ["chevron", "Chevron"],
        ["the-tuck-shop", "The Tuck Shop"],
        ["sunshine-coast-convenience", "Sunshine Coast Convenience"],
        ["quick-stop", "Quick Stop"],
        ["smoke-da-snack", "Smoke Da Snack"],
        ["sunoco", "Sunoco"]
      ],
      categories: ["Chocolate", "Candy"]
    },
    seattle: {
      stores: [
        ["circle-k", "Circle K"],
        ["7-eleven", "7-Eleven"],
        ["ampm", "ampm"],
        ["chevron-extramile", "Chevron ExtraMile"],
        ["shell", "Shell"],
        ["plaid-pantry", "Plaid Pantry"],
        ["76", "76"]
      ],
      categories: ["Chocolate", "Candy"]
    },
    toronto: {
      stores: [
        ["circle-k", "Circle K"],
        ["7-eleven", "7-Eleven"],
        ["hasty-market", "Hasty Market"],
        ["quickie", "Quickie"],
        ["petro-canada", "Petro-Canada"],
        ["esso", "Esso"],
        ["shell-select", "Shell Select"]
      ],
      categories: ["Chocolate", "Candy"]
    }
  };
  if (!board) return;

  var storeNames = { "circle-k": "Circle K" };
  var svgNs = "http://www.w3.org/2000/svg";
  var ringN = 0;

  function addOrbits(dot) {
    if (!dot.getAttribute("data-sec")) return;
    var orbit = document.createElement("span");
    orbit.className = "csc-orbit csc-orbit-2";
    orbit.setAttribute("aria-hidden", "true");
    orbit.style.setProperty("--csc-sec", dot.style.getPropertyValue("--csc-sec"));
    var span = 18 * (0.85 + Math.random() * 0.3);
    orbit.style.animationDuration = span.toFixed(2) + "s";
    orbit.style.animationDelay = (-Math.random() * span).toFixed(2) + "s";
    var moon = document.createElement("span");
    moon.className = "csc-moon csc-moon-2";
    if (dot.classList.contains("csc-pale")) moon.classList.add("csc-moon-pale");
    orbit.appendChild(moon);
    dot.parentNode.insertBefore(orbit, dot);
  }

  Array.prototype.forEach.call(board.querySelectorAll(".csc-swatch"), function (item) {
    item._cscHome = item.parentNode;
    var shelf = parseInt(item.getAttribute("data-shelf"), 10);
    var slot = parseInt(item.getAttribute("data-slot"), 10);
    if (shelf > 0) item.style.setProperty("--csc-shelf", String(shelf));
    if (slot > 0) {
      item.style.setProperty("--csc-slot", String(slot));
      if (slot > shelfCols) shelfCols = slot;
    }
    var storeName = storeNames[item.getAttribute("data-store")] || "";
    var catName = item.getAttribute("data-cat") || "";
    var text = storeName && catName ? storeName + " / " + catName : (storeName || catName);
    var dot = item.querySelector(".csc-dot");
    if (dot) {
      var hex = dot.getAttribute("title") || dot.getAttribute("aria-label") || "";
      dot.removeAttribute("title");
      dot.setAttribute("aria-label", hex ? text + ", " + hex : text);
      addOrbits(dot);
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
  Array.prototype.forEach.call(board.querySelectorAll(".csc-gaps span"), function (item) {
    var shelf = parseInt(item.getAttribute("data-shelf"), 10);
    var slot = parseInt(item.getAttribute("data-slot"), 10);
    if (shelf > 0) item.style.setProperty("--csc-shelf", String(shelf));
    if (slot > 0) {
      item.style.setProperty("--csc-slot", String(slot));
      if (slot > shelfCols) shelfCols = slot;
    }
  });
  board.style.setProperty("--csc-shelf-cols", String(shelfCols || 1));
  buildFacets();
  buildCategories();

  function cityRecord() {
    return CITIES[city] || null;
  }

  function cityCategories() {
    var record = cityRecord();
    return record ? record.categories : [];
  }

  function anyCategory() {
    var list = cityCategories();
    var i;
    for (i = 0; i < list.length; i++) if (catOn[list[i]]) return true;
    return false;
  }

  function putHome(item) {
    var home = item._cscHome || listEl();
    if (home) home.appendChild(item);
  }

  function wants(item) {
    if (!store || city !== "vancouver") return false;
    if (!anyCategory()) return false;
    var storeOk = item.getAttribute("data-store") === store;
    if (!storeOk) return false;
    if (!catOn[item.getAttribute("data-cat")]) return false;
    if (!SHOW_PACKAGING) return true;
    if (item.getAttribute("data-store") !== "circle-k") return true;
    if (packFilter && item.getAttribute("data-packaging") !== packFilter) return false;
    return true;
  }

  function syncFacets() {
    Array.prototype.forEach.call(document.querySelectorAll(".csc-facets [data-csc-facet]"), function (button) {
      var kind = button.getAttribute("data-csc-facet");
      var value = button.getAttribute("data-csc-value");
      var on = kind === "packaging" && packFilter === value;
      button.classList.toggle("csc-on", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function buildFacets() {
    var host = document.querySelector(".csc-facets");
    if (!host) return;
    if (!SHOW_PACKAGING) {
      host.hidden = true;
      return;
    }
    host.hidden = false;
    ["packaging"].forEach(function (kind) {
      var group = host.querySelector('[data-csc-facet-group="' + kind + '"]');
      if (!group) return;
      var seen = [];
      Array.prototype.forEach.call(board.querySelectorAll('.csc-swatch[data-store="circle-k"]'), function (item) {
        var value = item.getAttribute("data-packaging");
        if (!value || seen.indexOf(value) !== -1) return;
        seen.push(value);
      });
      seen.forEach(function (value) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "csc-opt";
        button.setAttribute("data-csc-facet", kind);
        button.setAttribute("data-csc-value", value);
        button.setAttribute("aria-pressed", "false");
        button.textContent = value;
        group.appendChild(button);
      });
    });
    syncFacets();
  }

  function syncCategories() {
    if (cats) cats.hidden = !store;
    Array.prototype.forEach.call(document.querySelectorAll("[data-csc-category]"), function (button) {
      var on = !!catOn[button.getAttribute("data-csc-category")];
      button.classList.toggle("csc-on", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  var listsFor = null;

  function tagButton(attr, value, label) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "csc-opt";
    button.setAttribute(attr, value);
    button.setAttribute("aria-pressed", "false");
    button.textContent = label;
    return button;
  }

  function ensureLists() {
    if (listsFor === city) return;
    listsFor = city;
    var record = cityRecord();
    var stores = record ? record.stores : [];
    var ids = [];
    var i;
    for (i = 0; i < stores.length; i++) ids.push(stores[i][0]);
    if (store && ids.indexOf(store) === -1) store = "";
    var group = document.querySelector(".csc-stores");
    if (group) {
      group.innerHTML = "";
      stores.forEach(function (pair) {
        group.appendChild(tagButton("data-csc-store", pair[0], pair[1]));
      });
    }
    if (cats) {
      cats.innerHTML = "";
      cityCategories().forEach(function (name) {
        cats.appendChild(tagButton("data-csc-category", name, name));
      });
    }
  }

  function buildCategories() {
    ensureLists();
    syncCategories();
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

  function syncGaps() {
    var storeOk = city === "vancouver" && store === "circle-k" && anyCategory();
    Array.prototype.forEach.call(board.querySelectorAll(".csc-gaps span"), function (item) {
      var catOk = !!catOn[item.getAttribute("data-cat")];
      item.hidden = !(storeOk && catOk);
    });
  }

  function sampleCity(item) {
    return item.getAttribute("data-city") || "vancouver";
  }

  function storeHasSamples(storeId) {
    if (!city) return false;
    var items = board.querySelectorAll(".csc-swatch");
    var i;
    for (i = 0; i < items.length; i++) {
      if (sampleCity(items[i]) !== city) continue;
      if (items[i].getAttribute("data-store") === storeId) return true;
    }
    return false;
  }

  function syncPlaceholders() {
    var top = document.querySelector(".csc-top");
    if (top) top.hidden = !city;
    if (board) board.classList.toggle("csc-live", !!city);
    Array.prototype.forEach.call(document.querySelectorAll("[data-csc-store]"), function (button) {
      button.classList.toggle("csc-placeholder", !storeHasSamples(button.getAttribute("data-csc-store")));
    });
  }

  function selectAllCategories() {
    cityCategories().forEach(function (name) {
      catOn[name] = true;
    });
  }

  function apply(animate) {
    ensureLists();
    setPressed("[data-csc-store]", "data-csc-store", store);
    syncPlaceholders();
    syncCategories();
    syncGaps();
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

  function agLimits(field, w, h) {
    var rect = field.getBoundingClientRect();
    var root = document.documentElement.getBoundingClientRect();
    var viewW = root.width || document.documentElement.clientWidth || window.innerWidth || 0;
    var viewH = window.innerHeight || 0;
    var minX = -rect.left;
    var minY = -rect.top;
    var maxX = viewW - rect.left - w;
    var maxY = viewH - rect.top - h;
    if (!(maxX > minX)) maxX = minX;
    if (!(maxY > minY)) maxY = minY;
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
  }

  function randomSpot(field, size) {
    var lim = agLimits(field, size, size);
    return {
      x: lim.minX + Math.random() * Math.max(1, lim.maxX - lim.minX),
      y: lim.minY + Math.random() * Math.max(1, lim.maxY - lim.minY)
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
      var lim = agLimits(field, b.w, b.h);
      if (b.x < lim.minX) {
        b.x = lim.minX;
        b.vx = Math.abs(b.vx);
        if (b.tvx != null) b.tvx = Math.abs(b.tvx);
      } else if (b.x > lim.maxX) {
        b.x = lim.maxX;
        b.vx = -Math.abs(b.vx);
        if (b.tvx != null) b.tvx = -Math.abs(b.tvx);
      }
      if (b.y < lim.minY) {
        b.y = lim.minY;
        b.vy = Math.abs(b.vy);
        if (b.tvy != null) b.tvy = Math.abs(b.tvy);
      } else if (b.y > lim.maxY) {
        b.y = lim.maxY;
        b.vy = -Math.abs(b.vy);
        if (b.tvy != null) b.tvy = -Math.abs(b.tvy);
      }
      paintBody(b);
    }
    agRaf = requestAnimationFrame(tickAg);
  }

  function syncAgButton() {
    var ag = document.querySelector(".csc-ag");
    if (ag) {
      ag.classList.toggle("csc-ag-on", agOn);
      ag.setAttribute("aria-pressed", agOn ? "true" : "false");
    }
    document.body.classList.toggle("csc-ag-over", agOn);
    var rowOn = !agOn && mode === "row";
    var shelfOn = !agOn && mode === "shelf";
    var row = document.querySelector(".csc-irow");
    if (row) {
      row.classList.toggle("csc-irow-on", rowOn);
      row.setAttribute("aria-pressed", rowOn ? "true" : "false");
    }
    var shelf = document.querySelector(".csc-ishelf");
    if (shelf) {
      shelf.classList.toggle("csc-ishelf-on", shelfOn);
      shelf.setAttribute("aria-pressed", shelfOn ? "true" : "false");
    }
    board.classList.toggle("csc-mode-shelf", shelfOn);
  }

  function syncMoons() {
    if (!SECONDARY_COLOURS) showSec = false;
    board.classList.toggle("csc-show-2", SECONDARY_COLOURS && showSec);
    var sec = document.querySelector("[data-csc-moon='2']");
    if (sec) {
      sec.hidden = !SECONDARY_COLOURS;
      sec.classList.toggle("csc-on", SECONDARY_COLOURS && showSec);
      sec.setAttribute("aria-pressed", showSec ? "true" : "false");
    }
  }

  function snapshotVisible() {
    var before = new Map();
    Array.prototype.forEach.call(board.querySelectorAll(".csc-swatch"), function (item) {
      if (item.hidden || item.classList.contains("csc-leave")) return;
      var r = item.getBoundingClientRect();
      if (r.width) before.set(item, r);
    });
    return before;
  }

  function goMode(next) {
    if (next !== "row" && next !== "shelf") return;
    if (agOn) {
      mode = next;
      leaveAg();
      return;
    }
    if (mode === next) return;
    var before = snapshotVisible();
    mode = next;
    syncAgButton();
    slideFrom(before);
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

  var AG_FADE_MS = 3200;

  function quietDrop(cs) {
    if (!cs || cs === "none") return "0 1.5px 7px rgba(0,0,0,0), 0 1px 1.5px rgba(0,0,0,0)";
    return cs.split(/,(?![^(]*\))/).map(function (part) {
      if (/inset/.test(part)) return part.trim();
      return part.replace(/rgba?\(([^)]+)\)/, function (_, inner) {
        var bits = inner.split(",").map(function (s) { return s.trim(); });
        if (bits.length >= 3) return "rgba(" + bits[0] + ", " + bits[1] + ", " + bits[2] + ", 0)";
        return "rgba(0, 0, 0, 0)";
      }).trim();
    }).join(", ");
  }

  function fadeAgShadow(field) {
    var dots = field.querySelectorAll(".csc-dot");
    Array.prototype.forEach.call(dots, function (dot) {
      dot.style.setProperty("transition", "none", "important");
    });
    void field.offsetWidth;
    Array.prototype.forEach.call(dots, function (dot) {
      dot.style.setProperty("box-shadow", quietDrop(getComputedStyle(dot).boxShadow));
    });
    if (motion.matches) {
      Array.prototype.forEach.call(dots, function (dot) {
        dot.style.removeProperty("box-shadow");
        dot.style.removeProperty("transition");
      });
      return;
    }
    field.classList.add("csc-ag-in");
    requestAnimationFrame(function () {
      Array.prototype.forEach.call(dots, function (dot) {
        dot.style.setProperty("transition", "box-shadow " + (AG_FADE_MS / 1000) + "s cubic-bezier(0.45, 0.05, 0.55, 0.95)");
      });
      void field.offsetWidth;
      Array.prototype.forEach.call(dots, function (dot) {
        dot.style.removeProperty("box-shadow");
      });
    });
    clearTimeout(field._shade);
    field._shade = setTimeout(function () {
      field.classList.remove("csc-ag-in");
      Array.prototype.forEach.call(field.querySelectorAll(".csc-dot"), function (dot) {
        dot.style.removeProperty("transition");
      });
    }, AG_FADE_MS + 800);
  }

  function enterAg() {
    if (agOn) return;
    var items = [];
    Array.prototype.forEach.call(board.querySelectorAll(".csc-swatch"), function (item) {
      if (!item.hidden && !item.classList.contains("csc-leave")) items.push(item);
    });
    if (!items.length) return;
    var origin = board.getBoundingClientRect();
    var px = dotPx();
    var seeds = items.map(function (el) {
      var r = el.getBoundingClientRect();
      var cx = r.left + r.width / 2 - origin.left;
      var cy = r.top + r.height / 2 - origin.top;
      return { el: el, x: cx - px / 2, y: cy - px / 2, w: px, h: px };
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
    Array.prototype.forEach.call(board.querySelectorAll(".csc-block"), function (block) {
      block.hidden = true;
    });
    board.appendChild(field);
    fadeAgShadow(field);
    agBodies = bodies;
    agOn = true;
    applyMetrics();
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
    applyMetrics();
    syncAgButton();
    agBodies.forEach(function (b) {
      clearMove(b.el);
      var dot = b.el.querySelector(".csc-dot");
      if (dot) {
        dot.style.removeProperty("box-shadow");
        dot.style.removeProperty("transition");
      }
      b.el.style.removeProperty("--csc-x");
      b.el.style.removeProperty("--csc-y");
      b.el.style.removeProperty("--csc-z");
      putHome(b.el);
    });
    agBodies = [];
    if (field) field.remove();
    var block = blockEl();
    if (block) block.hidden = false;
    finishBlocks();
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
        var spot = randomSpot(field, dotPx());
        item.style.setProperty("--csc-x", spot.x.toFixed(1) + "px");
        item.style.setProperty("--csc-y", spot.y.toFixed(1) + "px");
        field.appendChild(item);
        var vel = randSpeed();
        agBodies.push({
          el: item,
          x: spot.x,
          y: spot.y,
          w: dotPx(),
          h: dotPx(),
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
            putHome(item);
          };
        } else {
          item.hidden = true;
          item.style.removeProperty("--csc-x");
          item.style.removeProperty("--csc-y");
          item.style.removeProperty("--csc-z");
          putHome(item);
        }
        return;
      }
      if (!show) item.hidden = true;
    });
  }

  function shuffleOrder() {
    if (agOn) {
      shuffleFloat();
      return;
    }
    var before = new Map();
    var moved = false;
    Array.prototype.forEach.call(board.querySelectorAll(".csc-swatches"), function (list) {
      var items = [];
      Array.prototype.forEach.call(list.querySelectorAll(".csc-swatch"), function (item) {
        if (!item.hidden && !item.classList.contains("csc-leave")) items.push(item);
      });
      if (items.length < 2) return;
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
      moved = true;
    });
    if (moved) slideFrom(before);
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
    agBodies.forEach(function (b) {
      var lim = agLimits(field, b.w, b.h);
      if (b.x < lim.minX) b.x = lim.minX;
      else if (b.x > lim.maxX) b.x = lim.maxX;
      if (b.y < lim.minY) b.y = lim.minY;
      else if (b.y > lim.maxY) b.y = lim.maxY;
      paintBody(b);
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll("[data-csc-city]"), function (button) {
    button.addEventListener("click", function () {
      clearPageColour();
      city = button.getAttribute("data-csc-city");
      setPressed("[data-csc-city]", "data-csc-city", city);
      apply(true);
    });
  });

  var storeGroup = document.querySelector(".csc-stores");
  if (storeGroup) {
    storeGroup.addEventListener("click", function (e) {
      var button = e.target;
      while (button && button !== storeGroup) {
        if (button.getAttribute && button.getAttribute("data-csc-store")) break;
        button = button.parentNode;
      }
      if (!button || button === storeGroup) return;
      clearPageColour();
      store = button.getAttribute("data-csc-store");
      if (store === "circle-k") selectAllCategories();
      setPressed("[data-csc-store]", "data-csc-store", store);
      apply(true);
    });
  }

  var facetHost = document.querySelector(".csc-facets");
  if (facetHost) {
    facetHost.addEventListener("click", function (e) {
      var button = e.target;
      while (button && button !== facetHost) {
        if (button.getAttribute && button.getAttribute("data-csc-facet")) break;
        button = button.parentNode;
      }
      if (!button || button === facetHost) return;
      var kind = button.getAttribute("data-csc-facet");
      var value = button.getAttribute("data-csc-value");
      clearPageColour();
      if (kind === "packaging") packFilter = packFilter === value ? "" : value;
      syncFacets();
      apply(true);
    });
  }

  if (cats) {
    cats.addEventListener("click", function (e) {
      var button = e.target;
      while (button && button !== cats) {
        if (button.getAttribute && button.getAttribute("data-csc-category")) break;
        button = button.parentNode;
      }
      if (!button || button === cats) return;
      clearPageColour();
      var name = button.getAttribute("data-csc-category");
      catOn[name] = !catOn[name];
      syncCategories();
      apply(true);
    });
  }

  var rowButton = document.querySelector(".csc-irow");
  if (rowButton) {
    rowButton.addEventListener("click", function () {
      clearPageColour();
      goMode("row");
    });
  }

  var shelfButton = document.querySelector(".csc-ishelf");
  if (shelfButton) {
    shelfButton.addEventListener("click", function () {
      clearPageColour();
      goMode("shelf");
    });
  }

  var agButton = document.querySelector(".csc-ag");
  if (agButton) {
    agButton.addEventListener("click", function () {
      clearPageColour();
      if (agOn) leaveAg();
      else enterAg();
    });
  }

  var shuffleButton = document.querySelector(".csc-shuffle");
  if (shuffleButton) {
    shuffleButton.addEventListener("click", function () {
      clearPageColour();
      shuffleOrder();
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll("[data-csc-moon]"), function (button) {
    button.addEventListener("click", function () {
      clearPageColour();
      if (button.getAttribute("data-csc-moon") === "2") showSec = !showSec;
      syncMoons();
    });
  });

  var spillGen = 0;
  var SPILL_SOLID = 0.15;

  function pageBackground(hex) {
    var bg = hex || "";
    document.documentElement.style.background = bg;
    document.body.style.background = bg;
  }

  function removeSpills() {
    var nodes = document.querySelectorAll(".csc-spill");
    var i;
    for (i = 0; i < nodes.length; i++) {
      if (nodes[i].parentNode) nodes[i].parentNode.removeChild(nodes[i]);
    }
  }

  function clearPageColour() {
    spillGen += 1;
    removeSpills();
    pageBackground("");
  }

  function spillEase(p) {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    return p * p * (3 - 2 * p);
  }

  function spillRgb(hex) {
    var h = String(hex || "").replace("#", "");
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16)
    };
  }

  function spillFar(cx, cy, vw, vh) {
    var dx = Math.max(cx, vw - cx);
    var dy = Math.max(cy, vh - cy);
    return Math.sqrt(dx * dx + dy * dy);
  }

  function spillFrom(dotEl) {
    var hex = dotEl.getAttribute("data-main");
    if (!hex) return;
    var rect = dotEl.getBoundingClientRect();
    if (!(rect.width > 0)) return;
    spillGen += 1;
    var gen = spillGen;
    removeSpills();
    if (motion.matches) {
      pageBackground(hex);
      return;
    }
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var dotR = rect.width / 2;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var endR = spillFar(cx, cy, vw, vh) / SPILL_SOLID;
    if (!(endR > dotR)) endR = dotR;
    var rgb = spillRgb(hex);
    var ink = "rgb(" + rgb.r + "," + rgb.g + "," + rgb.b + ")";
    var fade = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",0)";
    var spill = document.createElement("div");
    spill.className = "csc-spill";
    var disk = document.createElement("div");
    disk.className = "csc-spill-disk";
    disk.style.left = cx.toFixed(1) + "px";
    disk.style.top = cy.toFixed(1) + "px";
    disk.style.width = (endR * 2).toFixed(1) + "px";
    disk.style.height = (endR * 2).toFixed(1) + "px";
    disk.style.marginLeft = (-endR).toFixed(1) + "px";
    disk.style.marginTop = (-endR).toFixed(1) + "px";
    var solidStop = Math.round(SPILL_SOLID * 100) + "%";
    disk.style.background = "radial-gradient(circle closest-side, " + ink + " 0%, " + ink + " " + solidStop + ", " + fade + " 100%)";
    spill.appendChild(disk);
    document.body.appendChild(spill);
    var t0 = performance.now();
    var life = 640;
    var start = dotR / endR;
    function draw(t) {
      var p = t <= 0 ? 0 : t >= life ? 1 : spillEase(t / life);
      var s = start + (1 - start) * p;
      disk.style.transform = "scale(" + s.toFixed(4) + ")";
    }
    function frame(now) {
      if (gen !== spillGen) return;
      var t = now - t0;
      if (t > life) t = life;
      draw(t);
      if (t < life) {
        window.requestAnimationFrame(frame);
        return;
      }
      if (gen !== spillGen) return;
      pageBackground(hex);
      if (spill.parentNode) spill.parentNode.removeChild(spill);
    }
    draw(0);
    window.requestAnimationFrame(frame);
  }

  document.addEventListener("click", function (e) {
    var dot = e.target.closest && e.target.closest(".csc-dot");
    if (!dot || !dot.getAttribute("data-main")) return;
    if (dot.closest(".csc-gaps")) return;
    spillFrom(dot);
  });

  /* Fixed size: 40% along the old slider track (left was smallest, right was largest). */
  var LAYOUT_PX = 40;
  var SIZE_LARGE = 76;
  var SIZE_SMALL = 14;
  var SIZE_PHONE_SMALL = 22;
  var TRACK = 0.4;

  function phoneLayout() {
    return window.matchMedia("(max-width: 767px)").matches;
  }

  function dotPx() {
    var small = phoneLayout() ? SIZE_PHONE_SMALL : SIZE_SMALL;
    return small + (SIZE_LARGE - small) * TRACK;
  }

  function applyMetrics() {
    var px = dotPx();
    if (agOn) {
      board.style.setProperty("--csc-size", px + "px");
      board.style.setProperty("--csc-scale", "1");
    } else {
      board.style.setProperty("--csc-size", LAYOUT_PX + "px");
      board.style.setProperty("--csc-scale", (px / LAYOUT_PX).toFixed(4));
    }
  }

  function resizeAg(px) {
    agBodies.forEach(function (b) {
      if (Math.abs(b.w - px) < 0.5) return;
      b.x += (b.w - px) / 2;
      b.y += (b.h - px) / 2;
      b.w = px;
      b.h = px;
      paintBody(b);
    });
  }

  var phone = phoneLayout();
  window.addEventListener("resize", function () {
    clampAg();
    var now = phoneLayout();
    if (now === phone) return;
    phone = now;
    var px = dotPx();
    applyMetrics();
    if (agOn) {
      resizeAg(px);
      clampAg();
    }
  });

  applyMetrics();
  syncMoons();
  setPressed("[data-csc-city]", "data-csc-city", city);
  setPressed("[data-csc-store]", "data-csc-store", store);
  apply();
})();
