/* Rivers. Reads rivers/rivers.json and draws the row, captions, and zoom. */
(function (root) {
  "use strict";

  function groupNum(n) {
    if (n == null || n === "") return "";
    var s = String(n);
    var bits = s.split(".");
    bits[0] = bits[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return bits.join(".");
  }

  function coordText(lat, lon) {
    var ns = lat >= 0 ? "N" : "S";
    var ew = lon >= 0 ? "E" : "W";
    return Math.abs(lat).toFixed(3) + "° " + ns + ", " + Math.abs(lon).toFixed(3) + "° " + ew;
  }

  function flowField(flow, label) {
    if (!flow) return null;
    var lines = [];
    if (flow.meanM3s != null && flow.meanM3s !== "") lines.push(groupNum(flow.meanM3s) + " m\u00b3/s");
    if (flow.km3PerYear != null && flow.km3PerYear !== "") lines.push(groupNum(flow.km3PerYear) + " km\u00b3/yr");
    var station = flow.station || "";
    var stationId = flow.stationId || "";
    var years = flow.years || "";
    if (!lines.length && !station && !stationId && !years) return null;
    return {
      label: label || "Flow",
      lines: lines,
      station: station,
      stationId: stationId,
      years: years,
      url: flow.url || ""
    };
  }

  function fieldsFor(manifest, river) {
    var facts = river.facts || {};
    var fields = [];
    if (river.name) fields.push({ label: "Name", text: river.name });
    if (facts.stream_segments != null && facts.stream_segments !== "") {
      fields.push({ label: "Segments", text: groupNum(facts.stream_segments) });
    }
    if (facts.highest_stream_order != null && facts.highest_stream_order !== "") {
      fields.push({ label: "Order", text: groupNum(facts.highest_stream_order) });
    }
    if (facts.total_stream_length_km != null && facts.total_stream_length_km !== "") {
      fields.push({ label: "Length", text: groupNum(facts.total_stream_length_km) + " km" });
    }
    if (facts.main_stem_length_km != null && facts.main_stem_length_km !== "") {
      fields.push({ label: "Main stem", text: groupNum(facts.main_stem_length_km) + " km" });
    }
    if (facts.river_surface_area_km2 != null && facts.river_surface_area_km2 !== "") {
      fields.push({ label: "Area", text: groupNum(facts.river_surface_area_km2) + " km\u00b2" });
    }
    if (typeof facts.mouth_lat === "number" && typeof facts.mouth_lon === "number") {
      fields.push({
        label: facts.mouth_label || "Mouth",
        text: coordText(facts.mouth_lat, facts.mouth_lon)
      });
    }
    if (river.flow) {
      var one = flowField(river.flow, "Flow");
      if (one) fields.push(one);
    } else if (river.flow_gauges && river.flow_gauges.length) {
      river.flow_gauges.forEach(function (gauge) {
        var field = flowField(gauge, gauge.river || "Flow");
        if (field) fields.push(field);
      });
    }
    return fields;
  }

  function regionMatch(river, region) {
    if (!region || region === "all") return true;
    return (river.regions || []).indexOf(region) !== -1;
  }

  function zoomAt(view, px, py, next, minS, maxS) {
    var s = next;
    if (s < minS) s = minS;
    if (s > maxS) s = maxS;
    var ix = (px - view.x) / view.s;
    var iy = (py - view.y) / view.s;
    return { s: s, x: px - ix * s, y: py - iy * s };
  }

  var MAX_NATIVE = 2;
  var api = {
    groupNum: groupNum,
    coordText: coordText,
    fieldsFor: fieldsFor,
    regionMatch: regionMatch,
    zoomAt: zoomAt,
    maxNative: MAX_NATIVE
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document === "undefined") return;

  var ASSET_V = "20261024e";
  var row = document.getElementById("rv-row");
  var notesEl = document.getElementById("rv-notes");
  var creditEl = document.getElementById("rv-credit");
  var setEl = document.getElementById("rv-set");
  var titleEl = document.getElementById("rv-title");
  var regionsEl = document.getElementById("rv-regions");
  var manifestNow = null;
  var regionFilter = "all";
  var lb = null;
  var lbTimer = null;

  function el(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function captionEl(manifest, river) {
    var cap = el("div", "rv-caption");
    fieldsFor(manifest, river).forEach(function (field) {
      var cell = el("div", "rv-field");
      var label = el("div", "rv-label");
      label.textContent = field.label;
      var value = el("div", "rv-value");
      if (field.lines) {
        field.lines.forEach(function (line) {
          var rowLine = el("div");
          rowLine.textContent = line;
          value.appendChild(rowLine);
        });
        if (field.station) {
          var station = el("div", "rv-gauge");
          station.textContent = field.station;
          value.appendChild(station);
        }
        if (field.stationId || field.years) {
          var meta = el("div", "rv-gauge");
          if (field.stationId && field.url) {
            var link = document.createElement("a");
            link.href = field.url;
            link.target = "_blank";
            link.rel = "noopener";
            link.textContent = field.stationId;
            meta.appendChild(link);
          } else if (field.stationId) {
            meta.appendChild(document.createTextNode(field.stationId));
          }
          if (field.years) {
            meta.appendChild(document.createTextNode((field.stationId ? " \u00b7 " : "") + field.years));
          }
          value.appendChild(meta);
        }
      } else {
        value.textContent = field.text;
      }
      cell.appendChild(label);
      cell.appendChild(value);
      cap.appendChild(cell);
    });
    return cap;
  }

  function closeLb() {
    if (!lb || lb._closing) return;
    lb._closing = true;
    lb.classList.remove("rv-on");
    lb.classList.add("rv-closing");
    var node = lb;
    lb = null;
    clearTimeout(lbTimer);
    lbTimer = setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
      if (!document.querySelector(".rv-lb")) document.documentElement.classList.remove("rv-open");
    }, 340);
  }

  function openLb(manifest, river) {
    if (lb && lb._slug === river.slug && !lb._closing) return;
    if (lb && lb.parentNode) {
      lb.parentNode.removeChild(lb);
      lb = null;
    }
    clearTimeout(lbTimer);
    var W = river.largeWidth || river.width;
    var H = river.largeHeight || river.height;
    var view = { s: 1, x: 0, y: 0 };
    var minS = 1;
    var maxS = MAX_NATIVE;
    var midW = river.midWidth || 0;
    var showing = "mid";
    var drag = null;
    var pointers = new Map();

    var box = el("div", "rv-lb");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", river.name || "River");
    box._slug = river.slug;
    var stage = el("div", "rv-stage");
    var img = document.createElement("img");
    img.alt = river.name || "";
    img.draggable = false;
    img.width = W;
    img.height = H;
    img.style.width = W + "px";
    img.style.height = H + "px";
    img.src = river.mid + "?v=" + ASSET_V;
    stage.appendChild(img);
    var capWrap = el("div", "rv-lb-cap");
    capWrap.appendChild(captionEl(manifest, river));
    box.appendChild(stage);
    box.appendChild(capWrap);
    document.body.appendChild(box);
    document.documentElement.classList.add("rv-open");
    lb = box;

    var large = new Image();
    large.src = river.large + "?v=" + ASSET_V;

    function fit() {
      var sw = stage.clientWidth;
      var sh = stage.clientHeight;
      if (!(sw > 0) || !(sh > 0) || !(W > 0) || !(H > 0)) return false;
      minS = Math.min(sw / W, sh / H);
      maxS = Math.max(minS, MAX_NATIVE);
      view.s = minS;
      view.x = (sw - W * view.s) / 2;
      view.y = (sh - H * view.s) / 2;
      apply();
      return true;
    }

    function apply() {
      img.style.transform = "translate(" + view.x.toFixed(2) + "px, " + view.y.toFixed(2) + "px) scale(" + view.s + ")";
    }

    function needsLarge() {
      if (!(midW > 0)) return false;
      return W * view.s > midW * 1.02;
    }

    function swap() {
      var want = needsLarge() ? "large" : "mid";
      if (want === showing) return;
      showing = want;
      img.src = (want === "large" ? river.large : river.mid) + "?v=" + ASSET_V;
    }

    function clampPan() {
      var sw = stage.clientWidth;
      var sh = stage.clientHeight;
      var iw = W * view.s;
      var ih = H * view.s;
      var margin = 48;
      if (iw <= sw) view.x = (sw - iw) / 2;
      else view.x = Math.min(margin, Math.max(sw - iw - margin, view.x));
      if (ih <= sh) view.y = (sh - ih) / 2;
      else view.y = Math.min(margin, Math.max(sh - ih - margin, view.y));
    }

    img.addEventListener("load", function () {
      if (showing === "mid") {
        var natural = img.naturalWidth || 0;
        if (natural) midW = natural;
      }
      if (!box._fitted && fit()) box._fitted = true;
      swap();
    });

    function pointOf(e) {
      var rect = stage.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function overImage(px, py) {
      var ix = (px - view.x) / view.s;
      var iy = (py - view.y) / view.s;
      return ix >= 0 && iy >= 0 && ix <= W && iy <= H;
    }

    stage.addEventListener("wheel", function (e) {
      e.preventDefault();
      var dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      else if (e.deltaMode === 2) dy *= stage.clientHeight;
      var p = pointOf(e);
      view = zoomAt(view, p.x, p.y, view.s * Math.exp(-dy * 0.0018), minS, maxS);
      clampPan();
      apply();
      swap();
    }, { passive: false });

    function pinchInfo() {
      var pts = Array.from(pointers.values());
      if (pts.length < 2) return null;
      var dx = pts[1].x - pts[0].x;
      var dy = pts[1].y - pts[0].y;
      return {
        dist: Math.hypot(dx, dy) || 1,
        x: (pts[0].x + pts[1].x) / 2,
        y: (pts[0].y + pts[1].y) / 2
      };
    }

    function beginPinch() {
      var info = pinchInfo();
      if (!info) {
        box._pinch = null;
        return;
      }
      box._pinch = {
        dist: info.dist,
        s: view.s,
        ix: (info.x - view.x) / view.s,
        iy: (info.y - view.y) / view.s
      };
    }

    stage.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button !== 0) return;
      stage.setPointerCapture(e.pointerId);
      var p = pointOf(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) {
        drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, over: overImage(p.x, p.y) };
      } else if (pointers.size >= 2) {
        drag = null;
        beginPinch();
      }
    });

    stage.addEventListener("pointermove", function (e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, pointOf(e));
      if (pointers.size >= 2 && box._pinch) {
        var info = pinchInfo();
        if (!info || !box._pinch.dist) return;
        var next = box._pinch.s * (info.dist / box._pinch.dist);
        if (next < minS) next = minS;
        if (next > maxS) next = maxS;
        view.s = next;
        view.x = info.x - box._pinch.ix * view.s;
        view.y = info.y - box._pinch.iy * view.s;
        clampPan();
        apply();
        swap();
        box.classList.add("rv-drag");
        return;
      }
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) drag.moved = true;
      if (!drag.moved) return;
      view.x += e.clientX - drag.x;
      view.y += e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      clampPan();
      apply();
      box.classList.add("rv-drag");
    });

    function endPointer(e) {
      var was = drag;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) box._pinch = null;
      if (pointers.size === 0) {
        drag = null;
        box.classList.remove("rv-drag");
        if (was && !was.moved && !was.over) closeLb();
      }
    }
    stage.addEventListener("pointerup", endPointer);
    stage.addEventListener("pointercancel", endPointer);

    box.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest(".rv-lb-cap, .rv-stage")) return;
      closeLb();
    });

    requestAnimationFrame(function () {
      if (lb !== box || box._closing) return;
      if (!box._fitted && fit()) box._fitted = true;
      box.classList.add("rv-on");
    });
  }

  function cardEl(manifest, river) {
    var card = el("article", "rv-card");
    card.id = river.slug;
    var btn = el("button", "rv-open");
    btn.type = "button";
    btn.setAttribute("aria-label", "Open " + (river.name || "river"));
    var img = document.createElement("img");
    img.alt = river.name || "";
    img.src = river.thumb + "?v=" + ASSET_V;
    img.decoding = "async";
    btn.appendChild(img);
    btn.addEventListener("click", function () {
      openLb(manifest, river);
    });
    card._river = river;
    card.appendChild(btn);
    return card;
  }

  function visibleRivers() {
    if (!manifestNow) return [];
    return (manifestNow.rivers || []).filter(function (river) {
      return regionMatch(river, regionFilter);
    });
  }

  function applyRegion() {
    if (regionsEl) {
      Array.prototype.forEach.call(regionsEl.querySelectorAll(".rv-tag"), function (btn) {
        var on = btn.getAttribute("data-rv-region") === regionFilter;
        btn.classList.toggle("rv-on", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
    if (row) {
      Array.prototype.forEach.call(row.querySelectorAll(".rv-card"), function (card) {
        card.hidden = !(card._river && regionMatch(card._river, regionFilter));
      });
    }
    if (lb && !lb._closing) {
      var still = visibleRivers().some(function (river) { return river.slug === lb._slug; });
      if (!still) closeLb();
    }
  }

  function buildRegions(manifest) {
    if (!regionsEl) return;
    regionsEl.textContent = "";
    ["all"].concat(manifest.regions || []).forEach(function (name) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "rv-tag";
      btn.setAttribute("data-rv-region", name);
      btn.textContent = name === "all" ? "All" : name;
      btn.addEventListener("click", function () {
        if (regionFilter === name) return;
        regionFilter = name;
        applyRegion();
      });
      regionsEl.appendChild(btn);
    });
    applyRegion();
  }

  function fillCredit(manifest) {
    creditEl.textContent = "";
    var licence = document.createElement("p");
    licence.textContent = manifest.attribution || "";
    creditEl.appendChild(licence);
    (manifest.attribution_additions || []).forEach(function (line) {
      if (!line) return;
      var extra = document.createElement("p");
      extra.textContent = line;
      creditEl.appendChild(extra);
    });
  }

  function render(manifest) {
    manifestNow = manifest;
    if (titleEl) titleEl.textContent = manifest.title || "Rivers";
    document.title = (manifest.title || "Rivers") + " \u2014 databaseprojects";
    if (setEl) setEl.textContent = manifest.set || "";
    row.textContent = "";
    (manifest.rivers || []).forEach(function (river) {
      row.appendChild(cardEl(manifest, river));
    });
    if (notesEl) {
      notesEl.textContent = "";
      notesEl.hidden = true;
    }
    fillCredit(manifest);
    buildRegions(manifest);
  }

  function stepLb(dir) {
    if (!lb || lb._closing || !manifestNow) return;
    var list = visibleRivers();
    var index = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].slug === lb._slug) {
        index = i;
        break;
      }
    }
    if (index < 0) return;
    var next = index + dir;
    if (next < 0 || next >= list.length) return;
    openLb(manifestNow, list[next]);
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && lb) {
      e.preventDefault();
      closeLb();
      return;
    }
    if (!lb || lb._closing) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      stepLb(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      stepLb(-1);
    }
  });

  fetch("rivers.json?v=" + ASSET_V).then(function (res) {
    if (!res.ok) throw new Error("rivers");
    return res.json();
  }).then(render).catch(function () {
    if (notesEl) {
      notesEl.hidden = false;
      notesEl.textContent = "The river list did not load.";
    }
  });

  root.RiversPage = api;
})(typeof window !== "undefined" ? window : globalThis);
