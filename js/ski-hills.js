/* Ski Hills. Drawings are local. The map loads only after Map is opened. */
(function () {
  var grid = document.getElementById("sh-grid");
  var count = document.querySelector(".sh-count");
  var tags = document.querySelector(".sh-tags");
  var hills = [];
  var province = "bc";
  var region = "all";
  var kind = "all";
  var query = "";
  var watch = null;
  var albertaReady = false;
  var albertaPromise = null;
  var SQUARE = 1000;
  var BAND = 120;
  var DRAW = SQUARE - BAND;
  var view = "grid";
  var pendingFrom = null;
  var mapField = null;
  var shBasemap = null;
  var boundaries = null;
  var boundariesPromise = null;
  var mapLibrePromise = null;
  var positronStyle = null;
  var mapFlight = null;
  var placeKey = "";
  var didFit = false;
  var lastPan = "";
  var mapToken = 0;
  var mapZoomLock = 0;
  var mapZoomTarget = null;
  var mapFadeTimer = 0;
  var maskWait = false;
  var mapResizeBound = false;
  var mapTip = null;

  function slugFromHash() {
    return decodeURIComponent((location.hash || "").replace(/^#/, "")).trim();
  }

  function setPressed() {
    if (!tags) return;
    Array.prototype.forEach.call(tags.querySelectorAll("[data-sh-province]"), function (btn) {
      var on = btn.getAttribute("data-sh-province") === province;
      btn.classList.toggle("sh-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    Array.prototype.forEach.call(tags.querySelectorAll("[data-sh-for]"), function (group) {
      var mine = group.getAttribute("data-sh-for") === province;
      group.hidden = !mine;
      Array.prototype.forEach.call(group.querySelectorAll("[data-sh-region]"), function (btn) {
        var on = mine && btn.getAttribute("data-sh-region") === region;
        btn.classList.toggle("sh-on", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
    });
    Array.prototype.forEach.call(tags.querySelectorAll("[data-sh-type]"), function (btn) {
      var on = btn.getAttribute("data-sh-type") === kind;
      btn.classList.toggle("sh-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function fold(text) {
    return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function matches(hill) {
    if ((hill.province || "bc") !== province) return false;
    if (region !== "all" && hill.region !== region) return false;
    if (kind !== "all" && hill.type !== kind) return false;
    if (query && fold(hill.name).indexOf(query) === -1) return false;
    return true;
  }

  function apply(scroll) {
    var slug = slugFromHash();
    var shown = 0;
    var total = 0;
    hills.forEach(function (hill) {
      var card = hill.el;
      if (!card) return;
      var inProv = (hill.province || "bc") === province;
      var on = matches(hill);
      card.hidden = !on;
      var marked = on && hill.slug === slug;
      card.classList.toggle("sh-on", marked);
      if (inProv) total += 1;
      if (on) shown += 1;
      if (marked && scroll && !card.hidden && view !== "map") card.scrollIntoView({ block: "center" });
    });
    if (count) count.textContent = (query && !shown) ? "No hills match" : (shown + " of " + total);
    if (view === "map") syncMap();
  }

  function runClass(d) {
    if (d === "novice" || d === "easy") return "sh-run sh-easy";
    if (d === "intermediate") return "sh-run sh-intermediate";
    if (d === "advanced" || d === "expert" || d === "freeride" || d === "extreme") return "sh-run sh-advanced";
    return "sh-run sh-unrated";
  }

  function runRank(d) {
    if (d === "novice" || d === "easy") return 1;
    if (d === "intermediate") return 2;
    if (d === "advanced" || d === "expert" || d === "freeride" || d === "extreme") return 3;
    return 0;
  }

  function drawingSvg(hill) {
    var runs = (hill.runs || []).slice().sort(function (a, b) {
      return runRank(a && a.d) - runRank(b && b.d);
    }).map(function (run) {
      var pts = run && run.p ? run.p : run;
      if (!pts) return "";
      return '<polyline class="' + runClass(run && run.d) + '" points="' + pts + '"></polyline>';
    }).join("");
    var lifts = (hill.lifts || []).map(function (pts) {
      return '<polyline class="sh-lift" points="' + pts + '"></polyline>';
    }).join("");
    var holder = document.createElement("div");
    holder.innerHTML = '<svg viewBox="0 0 1000 1000" aria-hidden="true">' + runs + lifts + "</svg>";
    return holder.querySelector("svg");
  }

  function draw(hill) {
    var card = document.createElement("a");
    card.className = "sh-hill";
    card.id = hill.slug;
    card.href = "#" + hill.slug;
    card.setAttribute("data-sh-id", hill.id);
    card.setAttribute("data-sh-region", hill.region || "");
    card.setAttribute("aria-label", hill.name || "Unnamed hill");
    var svg = drawingSvg(hill);
    card.appendChild(svg);
    var name = document.createElement("span");
    name.className = "sh-hill-name";
    name.textContent = hill.name || "Unnamed hill";
    card.appendChild(name);
    card._shift = fitArt(svg, SQUARE);
    card._hill = hill;
    hill.el = card;
    card.hidden = !matches(hill);
    grid.appendChild(card);
  }

  function boundsOf(svg) {
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    Array.prototype.forEach.call(svg.querySelectorAll("polyline.sh-run, polyline.sh-lift"), function (node) {
      (node.getAttribute("points") || "").trim().split(/\s+/).forEach(function (pair) {
        if (!pair) return;
        var xy = pair.split(",");
        var x = parseFloat(xy[0]);
        var y = parseFloat(xy[1]);
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      });
    });
    if (minX === Infinity) return null;
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  function mapPoints(points, shift) {
    var s = shift.s == null ? 1 : shift.s;
    var dx = shift.dx || 0;
    var dy = shift.dy || 0;
    return (points || "").trim().split(/\s+/).map(function (pair) {
      var xy = pair.split(",");
      return (parseFloat(xy[0]) * s + dx).toFixed(1) + "," + (parseFloat(xy[1]) * s + dy).toFixed(1);
    }).join(" ");
  }

  function fitArt(svg, limitY) {
    var box = boundsOf(svg);
    var pad = 40;
    var limit = limitY == null ? DRAW : limitY;
    if (!box) return { s: 1, dx: 0, dy: 0, clip: limit };
    var bw = Math.max(box.maxX - box.minX, 1);
    var bh = Math.max(box.maxY - box.minY, 1);
    var s = Math.min((SQUARE - pad * 2) / bw, (limit - pad * 2) / bh);
    var dx = SQUARE / 2 - ((box.minX + box.maxX) / 2) * s;
    var dy = pad + (limit - pad * 2) / 2 - ((box.minY + box.maxY) / 2) * s;
    var shift = { s: s, dx: dx, dy: dy, clip: limit };
    Array.prototype.forEach.call(svg.querySelectorAll("polyline.sh-run, polyline.sh-lift"), function (node) {
      node.setAttribute("points", mapPoints(node.getAttribute("points"), shift));
    });
    return shift;
  }

  function contourPieces(points, shift) {
    var s = shift.s == null ? 1 : shift.s;
    var dx = shift.dx || 0;
    var dy = shift.dy || 0;
    var pieces = [];
    var cmd = [];
    function flush() {
      if (cmd.length >= 2) pieces.push(cmd.join(" "));
      cmd = [];
    }
    (points || "").trim().split(/\s+/).forEach(function (pair) {
      if (!pair) return;
      var xy = pair.split(",");
      var x = parseFloat(xy[0]) * s + dx;
      var y = parseFloat(xy[1]) * s + dy;
      var clip = shift.clip == null ? DRAW : shift.clip;
      if (y > clip || x < -30 || x > SQUARE + 30 || y < -30) {
        flush();
        return;
      }
      cmd.push(x.toFixed(1) + "," + y.toFixed(1));
    });
    flush();
    return pieces;
  }

  function paintContours(svg, lines, shift) {
    if (!svg) return;
    var old = svg.querySelector(".sh-contours");
    if (old) old.parentNode.removeChild(old);
    var g = document.createElementNS(NS, "g");
    g.setAttribute("class", "sh-contours");
    (lines || []).forEach(function (pts) {
      contourPieces(pts, shift).forEach(function (points) {
        var line = document.createElementNS(NS, "polyline");
        line.setAttribute("class", "sh-contour");
        line.setAttribute("points", points);
        g.appendChild(line);
      });
    });
    svg.insertBefore(g, svg.firstChild);
  }

  var contourIndex = null;

  function loadContour(card) {
    if (!card || card._contourState || !contourIndex) return;
    var meta = contourIndex[card.id];
    if (!meta) {
      card._contourState = "none";
      return;
    }
    card._contourState = "loading";
    fetch("contours/" + card.id + ".json?v=20261016i").then(function (res) {
      if (!res.ok) throw new Error("contour");
      return res.json();
    }).then(function (data) {
      card._contourState = "in";
      card._contourLines = data.lines || [];
      paintContours(card.querySelector("svg"), card._contourLines, card._shift || { dx: 0, dy: 0, clip: SQUARE });
      var lb = document.getElementById("sh-lb");
      if (lb && lb._card === card && lb._shift) paintContours(lb.querySelector("svg"), card._contourLines, lb._shift);
    }).catch(function () {
      card._contourState = "err";
    });
  }

  function syncStroke() {
    var g = document.getElementById("sh-grid");
    var svg = g && (g.querySelector(".sh-hill:not([hidden]) svg") || g.querySelector(".sh-hill svg"));
    if (!g || !svg) return;
    var w = svg.getBoundingClientRect().width;
    if (w < 2) return;
    var maxW = Math.min(window.innerWidth * 0.92, 1100);
    var maxH = window.innerHeight * 0.88;
    var gw = Math.min(maxW, maxH);
    if (gw < 1) return;
    var scale = w / gw;
    g.style.setProperty("--sh-stroke", (1.15 * scale).toFixed(3) + "px");
    g.style.setProperty("--sh-contour", (0.65 * scale).toFixed(3) + "px");
    g.style.setProperty("--sh-key", (3.2 * scale).toFixed(3) + "px");
  }

  window.shSyncStroke = syncStroke;

  var REGIONS = {
    "vancouver-island": "Vancouver Island",
    "vancouver-coast-and-mountains": "Vancouver, Coast and Mountains",
    "thompson-okanagan": "Thompson Okanagan",
    "kootenay-rockies": "Kootenay Rockies",
    "cariboo-chilcotin-coast": "Cariboo Chilcotin Coast",
    "northern-british-columbia": "Northern British Columbia",
    "canadian-rockies": "Canadian Rockies",
    "alberta-south": "Alberta South",
    "calgary-area": "Calgary & Area",
    "alberta-central": "Alberta Central",
    "edmonton-area": "Edmonton & Area",
    "alberta-north": "Alberta North"
  };

  var TYPES = {
    "downhill": "Downhill",
    "backcountry": "Backcountry",
    "cross-country": "Cross-country"
  };

  function locationText(hill) {
    return (hill.region && REGIONS[hill.region]) || "";
  }

  function gpsText(hill) {
    if (typeof hill.lat !== "number" || typeof hill.lon !== "number") return "";
    var ns = hill.lat >= 0 ? "N" : "S";
    var ew = hill.lon >= 0 ? "E" : "W";
    return Math.abs(hill.lat).toFixed(4) + "\u00b0 " + ns + ", " + Math.abs(hill.lon).toFixed(4) + "\u00b0 " + ew;
  }

  var NS = "http://www.w3.org/2000/svg";

  function diffCounts(hill) {
    var green = 0;
    var blue = 0;
    var black = 0;
    var rated = 0;
    (hill.runs || []).forEach(function (run) {
      var d = run && run.d;
      if (d === "novice" || d === "easy") {
        green += 1;
        rated += 1;
      } else if (d === "intermediate") {
        blue += 1;
        rated += 1;
      } else if (d === "advanced" || d === "expert" || d === "freeride" || d === "extreme" ||
        (typeof d === "string" && /black|expert|freeride|extreme/.test(d))) {
        black += 1;
        rated += 1;
      }
    });
    if (!rated) return null;
    return { green: green, blue: blue, black: black };
  }

  function textWidth(text, size, bold) {
    var canvas = textWidth.canvas || (textWidth.canvas = document.createElement("canvas"));
    var ctx = canvas.getContext("2d");
    ctx.font = (bold ? "700 " : "") + size + "px 'Courier New', Courier, monospace";
    return ctx.measureText(text).width;
  }

  function textPart(str, size, bold) {
    var text = document.createElementNS(NS, "text");
    text.setAttribute("fill", "#111");
    text.setAttribute("font-family", "Courier New, Courier, monospace");
    text.setAttribute("font-size", String(size));
    if (bold) text.setAttribute("font-weight", "700");
    text.textContent = str;
    return { node: text, w: textWidth(str, size, bold) };
  }

  function keyPart(cls, count, size) {
    var g = document.createElementNS(NS, "g");
    var len = size * 1.25;
    var mid = (-size * 0.32).toFixed(1);
    var line = document.createElementNS(NS, "line");
    line.setAttribute("class", "sh-run " + cls);
    line.setAttribute("x1", "0");
    line.setAttribute("x2", len.toFixed(1));
    line.setAttribute("y1", mid);
    line.setAttribute("y2", mid);
    var gap = size * 0.55;
    var text = document.createElementNS(NS, "text");
    text.setAttribute("x", (len + gap).toFixed(1));
    text.setAttribute("y", "0");
    text.setAttribute("fill", "#111");
    text.setAttribute("font-family", "Courier New, Courier, monospace");
    text.setAttribute("font-size", String(size));
    text.textContent = String(count);
    g.appendChild(line);
    g.appendChild(text);
    return { node: g, w: len + gap + textWidth(String(count), size) };
  }

  function layoutRow(svg, y, parts, startSize) {
    var pad = 36;
    var inner = 1000 - pad * 2;
    var size = startSize;
    var built = [];
    while (size >= 12) {
      built = parts.map(function (part) {
        return part.key ? keyPart(part.key, part.n, size) : textPart(part.text, size, part.bold);
      });
      var total = built.reduce(function (sum, part) { return sum + part.w; }, 0);
      var minGaps = Math.max(parts.length - 1, 0) * 14;
      if (total + minGaps <= inner || size === 12) break;
      size -= 1;
    }
    var totalW = built.reduce(function (sum, part) { return sum + part.w; }, 0);
    var gap = built.length > 1 ? (inner - totalW) / (built.length - 1) : 0;
    var x = pad;
    built.forEach(function (part) {
      part.node.setAttribute("transform", "translate(" + x.toFixed(1) + " " + y.toFixed(1) + ")");
      svg.appendChild(part.node);
      x += part.w + gap;
    });
  }

  function groupWidth(parts, gap) {
    return parts.reduce(function (sum, part) { return sum + part.w; }, 0) + Math.max(parts.length - 1, 0) * gap;
  }

  function layoutEnds(svg, y, leftDesc, rightDesc, startSize) {
    var pad = 36;
    var inner = 1000 - pad * 2;
    var size = startSize;
    var left = [];
    var right = [];
    var gap = 22;
    function build(desc, sz) {
      return desc.map(function (part) {
        return part.key ? keyPart(part.key, part.n, sz) : textPart(part.text, sz);
      });
    }
    while (size >= 12) {
      left = build(leftDesc, size);
      right = build(rightDesc, size);
      gap = Math.max(16, size * 0.9);
      var used = groupWidth(left, gap) + groupWidth(right, gap);
      var between = left.length && right.length ? gap * 2 : 0;
      if (used + between <= inner || size === 12) break;
      size -= 1;
    }
    var x = pad;
    left.forEach(function (part) {
      part.node.setAttribute("transform", "translate(" + x.toFixed(1) + " " + y.toFixed(1) + ")");
      svg.appendChild(part.node);
      x += part.w + gap;
    });
    var rx = 1000 - pad - groupWidth(right, gap);
    right.forEach(function (part) {
      part.node.setAttribute("transform", "translate(" + rx.toFixed(1) + " " + y.toFixed(1) + ")");
      svg.appendChild(part.node);
      rx += part.w + gap;
    });
  }

  function hairline(parent, x1, y1, x2, y2) {
    var line = document.createElementNS(NS, "polyline");
    line.setAttribute("class", "sh-rule");
    line.setAttribute("points", x1.toFixed(1) + "," + y1.toFixed(1) + " " + x2.toFixed(1) + "," + y2.toFixed(1));
    line.setAttribute("style", "stroke:rgba(0,0,0,0.4);stroke-width:0.65;stroke-linecap:butt;fill:none");
    parent.appendChild(line);
  }

  function fieldLabel(str, x, y) {
    var text = document.createElementNS(NS, "text");
    text.setAttribute("class", "sh-field-label");
    text.setAttribute("x", x.toFixed(1));
    text.setAttribute("y", y.toFixed(1));
    text.setAttribute("font-family", "Courier New, Courier, monospace");
    text.setAttribute("font-size", "9");
    text.setAttribute("style", "fill:rgba(0,0,0,0.55);letter-spacing:0.16em");
    text.textContent = str;
    return text;
  }

  function labelWidth(str) {
    var size = 9;
    return textWidth(str, size) + Math.max(str.length - 1, 0) * size * 0.16;
  }

  function keysWidth(keys, size) {
    var between = Math.max(14, size * 0.8);
    return keys.reduce(function (sum, key, i) {
      var len = size * 1.25;
      var gap = size * 0.55;
      return sum + (i ? between : 0) + len + gap + textWidth(String(key.n), size);
    }, 0);
  }

  function placeRow(parent, fields, y, startSize) {
    var rowH = BAND / 2;
    var inset = 18;
    var size = startSize;
    var widths = [];
    function measure(sz) {
      return fields.map(function (field) {
        var valueW = field.keys ? keysWidth(field.keys, sz) : textWidth(field.text, sz);
        return Math.max(labelWidth(field.label), valueW) + inset * 2;
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
      if (field.keys) {
        var cursor = inner;
        var between = Math.max(14, size * 0.8);
        field.keys.forEach(function (key, ki) {
          if (ki) cursor += between;
          var part = keyPart(key.key, key.n, size);
          part.node.setAttribute("transform", "translate(" + cursor.toFixed(1) + " " + valueY.toFixed(1) + ")");
          parent.appendChild(part.node);
          cursor += part.w;
        });
      } else {
        var text = textPart(field.text, size);
        text.node.setAttribute("x", inner.toFixed(1));
        text.node.setAttribute("y", valueY.toFixed(1));
        parent.appendChild(text.node);
      }
      x += widths[i];
    });
  }

  function writeCaption(svg, hill) {
    var cap = document.createElementNS(NS, "g");
    cap.setAttribute("class", "sh-caption");
    var top = [];
    var counts = diffCounts(hill);
    if (counts) {
      var keys = [];
      if (counts.green) keys.push({ key: "sh-easy", n: counts.green });
      if (counts.blue) keys.push({ key: "sh-intermediate", n: counts.blue });
      if (counts.black) keys.push({ key: "sh-advanced", n: counts.black });
      if (keys.length) top.push({ label: "RUNS", keys: keys });
    }
    if (hill.type && TYPES[hill.type]) top.push({ label: "TYPE", text: TYPES[hill.type] });
    if (typeof hill.drop === "number") top.push({ label: "DROP", text: hill.drop + " m" });
    if (typeof hill.base === "number") top.push({ label: "BASE", text: hill.base + " m" });
    var bottom = [{ label: "NAME", text: hill.name || "Unnamed hill" }];
    var loc = locationText(hill);
    var gps = gpsText(hill);
    if (loc) bottom.push({ label: "REGION", text: loc });
    if (gps) bottom.push({ label: "GPS", text: gps });
    hairline(cap, 0, DRAW, SQUARE, DRAW);
    hairline(cap, 0, DRAW + BAND / 2, SQUARE, DRAW + BAND / 2);
    if (top.length) placeRow(cap, top, DRAW, 16);
    placeRow(cap, bottom, DRAW + BAND / 2, 20);
    svg.appendChild(cap);
    svg.setAttribute("viewBox", "0 0 " + SQUARE + " " + SQUARE);
    return SQUARE;
  }

  function hideLb() {
    var lb = document.getElementById("sh-lb");
    if (!lb || lb._closing) return;
    lb._closing = true;
    var big = lb.querySelector("svg");
    var from = lb._from;
    lb.classList.add("sh-lb-closing");
    lb.classList.remove("sh-lb-on");
    if (big && from) {
      var r = big.getBoundingClientRect();
      if (r.width && r.height && from.w) {
        var s = Math.min(from.w / r.width, from.h / r.height);
        var dx = from.x + from.w / 2 - (r.left + r.width / 2);
        var dy = from.y + from.h / 2 - (r.top + r.height / 2);
        big.style.transform = "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px) scale(" + s.toFixed(4) + ")";
      }
    }
    setTimeout(function () {
      if (lb.parentNode) lb.parentNode.removeChild(lb);
      if (!document.getElementById("sh-lb")) document.documentElement.classList.remove("sh-lb-open");
    }, 340);
  }

  function closeLb() {
    hideLb();
    if (slugFromHash()) {
      history.pushState(null, "", location.pathname + location.search);
      apply(false);
    }
  }

  function rectBox(box) {
    if (!box) return null;
    var x = box.x != null ? box.x : box.left;
    var y = box.y != null ? box.y : box.top;
    var w = box.w != null ? box.w : box.width;
    var h = box.h != null ? box.h : box.height;
    if (!(w > 0) || !(h > 0)) return null;
    return { x: x, y: y, w: w, h: h };
  }

  function openLb(card, origin) {
    if (!card) return;
    var existing = document.getElementById("sh-lb");
    if (existing && existing._card === card && !existing._closing) return;
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    var src = card.querySelector("svg");
    if (!src) return;
    var from = rectBox(origin) || rectBox(src.getBoundingClientRect()) || { x: 0, y: 0, w: 0, h: 0 };
    var thumb = { left: from.x, top: from.y, width: from.w, height: from.h };
    var name = card.querySelector(".sh-hill-name");
    var lb = document.createElement("div");
    lb.id = "sh-lb";
    lb.className = "sh-lb";
    lb.setAttribute("role", "dialog");
    lb.setAttribute("aria-modal", "true");
    lb.setAttribute("aria-label", name ? name.textContent : "Ski hill");
    lb._card = card;
    lb._from = from;
    loadContour(card);
    var big = drawingSvg(card._hill);
    big.removeAttribute("aria-hidden");
    var shift = fitArt(big, DRAW);
    writeCaption(big, card._hill);
    lb._shift = shift;
    if (card._contourLines) paintContours(big, card._contourLines, shift);
    var maxW = Math.min(window.innerWidth * 0.92, 1100);
    var maxH = window.innerHeight * 0.88;
    var scale = Math.min(maxW / SQUARE, maxH / SQUARE);
    big.style.width = (SQUARE * scale).toFixed(1) + "px";
    big.style.height = (SQUARE * scale).toFixed(1) + "px";
    lb.appendChild(big);
    document.body.appendChild(lb);
    document.documentElement.classList.add("sh-lb-open");
    requestAnimationFrame(function () {
      if (lb._closing) return;
      var r = big.getBoundingClientRect();
      if (!r.width || !thumb.width) {
        lb.classList.add("sh-lb-on");
        return;
      }
      var s = Math.min(thumb.width / r.width, thumb.height / r.height);
      var dx = thumb.left + thumb.width / 2 - (r.left + r.width / 2);
      var dy = thumb.top + thumb.height / 2 - (r.top + r.height / 2);
      big.style.transition = "none";
      big.style.transform = "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px) scale(" + s.toFixed(4) + ")";
      void big.offsetWidth;
      big.style.transition = "";
      requestAnimationFrame(function () {
        if (lb._closing) return;
        lb.classList.add("sh-lb-on");
        big.style.transform = "none";
      });
    });
    lb.addEventListener("click", function (e) {
      if (e.target === lb) closeLb();
    });
    big.addEventListener("click", function (e) {
      e.stopPropagation();
    });
  }

  function syncFromHash(scroll) {
    var slug = slugFromHash();
    var known = !slug || hills.some(function (hill) { return hill.slug === slug && hill.el; });
    if (!known && !albertaReady) {
      ensureAlberta().then(function () { syncFromHash(scroll); });
      return;
    }
    if (slug) {
      var match = hills.filter(function (hill) { return hill.slug === slug; })[0];
      if (match && match.province && match.province !== province) {
        province = match.province;
        region = "all";
        setPressed();
      }
    }
    apply(scroll);
    var from = pendingFrom;
    pendingFrom = null;
    var card = slug ? document.getElementById(slug) : null;
    if (card && card.classList.contains("sh-hill")) openLb(card, from);
    else hideLb();
  }

  function adopt(data, overrides, index) {
    (data.hills || []).forEach(function (hill) {
      if (!hill.runs || !hill.runs.length) return;
      if (!hill.province) hill.province = "bc";
      var row = overrides[hill.id];
      if (row && row.name) hill.name = row.name;
      if (hills.some(function (have) { return have.id === hill.id; })) return;
      hills.push(hill);
      draw(hill);
      if (watch && hill.el) watch.observe(hill.el);
    });
    Object.keys(index || {}).forEach(function (slug) {
      contourIndex[slug] = index[slug];
    });
  }

  function ensureAlberta() {
    if (albertaPromise) return albertaPromise;
    albertaPromise = Promise.all([
      fetch("alberta.json?v=20261016l").then(function (res) {
        if (!res.ok) throw new Error("alberta");
        return res.json();
      }),
      fetch("alberta-names.json?v=20261016i").then(function (res) {
        return res.ok ? res.json() : {};
      }).catch(function () { return {}; }),
      fetch("contours/alberta-index.json?v=20261016i").then(function (res) {
        return res.ok ? res.json() : { hills: {} };
      }).catch(function () { return { hills: {} }; })
    ]).then(function (pair) {
      adopt(pair[0], pair[1] || {}, (pair[2] && pair[2].hills) || {});
      albertaReady = true;
    }).catch(function () {
      albertaPromise = null;
      if (count) count.textContent = "The Alberta drawings did not load.";
    });
    return albertaPromise;
  }

  var DOT = 8;

  function syncMapButton() {
    var btn = document.getElementById("sh-map-btn");
    if (!btn) return;
    var on = view === "map";
    btn.classList.toggle("sh-icon-on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function ensureTip() {
    if (mapTip) return mapTip;
    mapTip = document.createElement("p");
    mapTip.className = "sh-map-tip";
    mapTip.hidden = true;
    document.body.appendChild(mapTip);
    return mapTip;
  }

  function showTip(dot) {
    var tip = ensureTip();
    if (!dot || document.getElementById("sh-lb")) {
      tip.hidden = true;
      if (mapField) mapField.style.cursor = "";
      return;
    }
    tip.hidden = false;
    tip.textContent = dot.dataset.name || "";
    var r = dot.getBoundingClientRect();
    var tw = tip.offsetWidth || 80;
    var left = r.right + 8;
    var top = r.top + r.height / 2 - 10;
    if (left + tw > window.innerWidth - 8) left = Math.max(8, r.left - tw - 8);
    if (top < 8) top = 8;
    tip.style.left = left + "px";
    tip.style.top = top + "px";
    if (mapField) mapField.style.cursor = "pointer";
  }

  function dotUnder(x, y) {
    if (!mapField || mapFlight) return null;
    var hits = [];
    Array.prototype.forEach.call(mapField.querySelectorAll(".sh-dot"), function (el) {
      if (el.hidden) return;
      var r = el.getBoundingClientRect();
      if (!r.width) return;
      var cx = r.left + r.width / 2;
      var cy = r.top + r.height / 2;
      if (Math.hypot(x - cx, y - cy) <= r.width / 2 + 4) hits.push(el);
    });
    return hits.length ? hits[hits.length - 1] : null;
  }

  function snapshotHills() {
    var map = new Map();
    if (!grid) return map;
    Array.prototype.forEach.call(grid.querySelectorAll(".sh-hill"), function (el) {
      if (el.hidden) return;
      var r = el.getBoundingClientRect();
      if (r.width) map.set(el.id, { left: r.left, top: r.top, width: r.width, height: r.height });
    });
    return map;
  }

  function snapshotDots() {
    var map = new Map();
    if (!mapField) return map;
    Array.prototype.forEach.call(mapField.querySelectorAll(".sh-dot"), function (el) {
      if (el.hidden) return;
      var r = el.getBoundingClientRect();
      if (r.width) map.set(el.dataset.slug, { left: r.left, top: r.top, width: r.width, height: r.height });
    });
    return map;
  }

  function slideInto(list, before, keyOf) {
    if (!before) return;
    var items = Array.prototype.slice.call(list);
    var step = Math.min(20, 480 / Math.max(items.length, 1));
    var k = 0;
    items.forEach(function (el) {
      var a = before.get(keyOf(el));
      if (!a) return;
      (el.getAnimations ? el.getAnimations() : []).forEach(function (an) {
        if (an.id === "sh-flow") an.cancel();
      });
      el.style.transform = "";
      var b = el.getBoundingClientRect();
      var layout = el.offsetWidth || b.width;
      if (!layout) return;
      var dx = a.left + a.width / 2 - (b.left + b.width / 2);
      var dy = a.top + a.height / 2 - (b.top + b.height / 2);
      var scale = a.width / layout;
      if (!isFinite(scale) || scale <= 0) scale = 1;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(scale - 1) < 0.04) return;
      var mid = scale + (1 - scale) * 0.82;
      var anim = el.animate(
        [
          { transform: "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px) scale(" + scale.toFixed(4) + ")" },
          { transform: "translate(" + (dx * 0.04).toFixed(1) + "px," + (dy * 0.04 - 2).toFixed(1) + "px) scale(" + mid.toFixed(4) + ")", offset: 0.82 },
          { transform: "none" }
        ],
        { duration: 480, delay: k++ * step, easing: "cubic-bezier(.22,.8,.25,1)", fill: "both" }
      );
      anim.id = "sh-flow";
    });
  }

  function ensureMapLibre() {
    if (window.maplibregl) return Promise.resolve();
    if (mapLibrePromise) return mapLibrePromise;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.css";
    document.head.appendChild(link);
    mapLibrePromise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = "https://unpkg.com/maplibre-gl@5.6.1/dist/maplibre-gl.js";
      script.async = true;
      script.onload = function () { resolve(); };
      script.onerror = function () {
        mapLibrePromise = null;
        reject(new Error("map"));
      };
      document.head.appendChild(script);
    });
    return mapLibrePromise;
  }

  function ensureBoundaries() {
    if (boundaries) return Promise.resolve(boundaries);
    if (boundariesPromise) return boundariesPromise;
    boundariesPromise = fetch("boundaries.json?v=20261016n").then(function (res) {
      if (!res.ok) throw new Error("boundaries");
      return res.json();
    }).then(function (data) {
      boundaries = data;
      return data;
    }).catch(function (err) {
      boundariesPromise = null;
      throw err;
    });
    return boundariesPromise;
  }

  function tintStyle(style) {
    delete style.sprite;
    delete style.glyphs;
    style.layers = style.layers.filter(function (layer) {
      return layer.type !== "symbol";
    });
    style.layers.forEach(function (layer) {
      var paint = layer.paint || (layer.paint = {});
      if (layer.id === "water") paint["fill-color"] = "#c3d3de";
      if (layer.id === "waterway") paint["line-color"] = "#a9c0ce";
      if (layer.id === "park") paint["fill-color"] = "#d3e0d2";
      if (layer.id === "landcover_wood") paint["fill-color"] = "#c5d4c4";
    });
    return style;
  }

  function loadPositron() {
    if (!positronStyle) {
      positronStyle = fetch("https://tiles.openfreemap.org/styles/positron")
        .then(function (res) { return res.json(); })
        .then(tintStyle)
        .catch(function (err) {
          positronStyle = null;
          throw err;
        });
    }
    return positronStyle;
  }

  function selectedRings() {
    var bag = boundaries && boundaries[province];
    if (!bag) return [];
    var ids = region === "all" ? Object.keys(bag) : [region];
    var rings = [];
    ids.forEach(function (id) {
      (bag[id] || []).forEach(function (ring) {
        if (ring && ring.length) rings.push(ring);
      });
    });
    return rings;
  }

  function ringArea(ring) {
    var a = 0;
    var i;
    for (i = 0; i < ring.length - 1; i++) {
      a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    return a / 2;
  }

  function holeRing(ring) {
    if (ringArea(ring) > 0) return ring.slice().reverse();
    return ring.slice();
  }

  function boundsOfRings(rings) {
    var west = Infinity;
    var south = Infinity;
    var east = -Infinity;
    var north = -Infinity;
    rings.forEach(function (ring) {
      ring.forEach(function (p) {
        if (p[0] < west) west = p[0];
        if (p[0] > east) east = p[0];
        if (p[1] < south) south = p[1];
        if (p[1] > north) north = p[1];
      });
    });
    if (!isFinite(west)) return null;
    return [[west, south], [east, north]];
  }

  function maskOpacityFor(z) {
    var o = 0.26 + (13 - z) * 0.18;
    if (o < 0.1) o = 0.1;
    if (o > 0.86) o = 0.86;
    return Math.round(o * 100) / 100;
  }

  function maskData(rings) {
    var world = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
    return {
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [world].concat(rings.map(holeRing)) }
    };
  }

  function openingBounds() {
    var box = boundsOfRings(selectedRings());
    if (box) return box;
    if (province === "ab") return [[-120.1, 48.95], [-109.95, 60]];
    return [[-139.1, 48.2], [-114, 60.05]];
  }

  function waitMask() {
    if (maskWait || !shBasemap || !shBasemap.once) return;
    maskWait = true;
    shBasemap.once("idle", function () {
      maskWait = false;
      if (view === "map") syncMap();
    });
  }

  function paintMask() {
    if (!shBasemap || !boundaries) return false;
    var rings = selectedRings();
    if (!rings.length) return false;
    var ready = !!(shBasemap.isStyleLoaded && shBasemap.isStyleLoaded());
    var source = null;
    try { source = shBasemap.getSource("sh-mask"); } catch (err) { source = null; }
    if (!ready && !source) {
      waitMask();
      return false;
    }
    var data = maskData(rings);
    if (!source) {
      shBasemap.addSource("sh-mask", { type: "geojson", data: data });
      shBasemap.addLayer({
        id: "sh-mask",
        type: "fill",
        source: "sh-mask",
        paint: { "fill-color": "#ffffff", "fill-opacity": maskOpacityFor(shBasemap.getZoom()) }
      });
    } else {
      source.setData(data);
      if (ready) shBasemap.setPaintProperty("sh-mask", "fill-opacity", maskOpacityFor(shBasemap.getZoom()));
    }
    return ready;
  }

  function fitPlace() {
    if (!shBasemap || !boundaries) return;
    var key = province + "|" + region;
    if (key === placeKey) return;
    var box = boundsOfRings(selectedRings());
    if (!box || !paintMask()) return;
    placeKey = key;
    var animate = didFit;
    didFit = true;
    mapZoomLock += 1;
    shBasemap.fitBounds(box, { padding: 36, animate: animate, duration: animate ? 700 : 0 });
    mapZoomLock -= 1;
    mapZoomTarget = null;
  }

  function panTo(hill) {
    if (!shBasemap || typeof hill.lon !== "number" || typeof hill.lat !== "number") return;
    var z = shBasemap.getZoom();
    if (z < 8.5) z = 8.5;
    mapZoomLock += 1;
    if (shBasemap.easeTo) shBasemap.easeTo({ center: [hill.lon, hill.lat], zoom: z, duration: 700 });
    mapZoomLock -= 1;
    mapZoomTarget = null;
  }

  function stepMapZoom(dir) {
    if (!shBasemap) return;
    var current = mapZoomTarget == null ? shBasemap.getZoom() : mapZoomTarget;
    var next = current + dir;
    var minZ = shBasemap.getMinZoom();
    var maxZ = shBasemap.getMaxZoom();
    if (next < minZ) next = minZ;
    if (next > maxZ) next = maxZ;
    mapZoomTarget = next;
    mapZoomLock += 1;
    if (shBasemap.easeTo) shBasemap.easeTo({ zoom: next, duration: 200 });
    else shBasemap.setZoom(next);
    mapZoomLock -= 1;
  }

  function cancelMapFade() {
    if (!mapFadeTimer) return;
    window.clearTimeout(mapFadeTimer);
    mapFadeTimer = 0;
  }

  function revealMap() {
    cancelMapFade();
    if (!mapField || !mapField.isConnected || mapField.classList.contains("sh-map-in")) return;
    projectDots();
    releaseMapFlight();
    mapField.classList.add("sh-map-in");
  }

  function armMapFade() {
    cancelMapFade();
    mapFadeTimer = window.setTimeout(revealMap, 1500);
  }

  function ensureDots() {
    if (!mapField) return;
    hills.forEach(function (hill) {
      if (hill.dot || typeof hill.lat !== "number" || typeof hill.lon !== "number") return;
      var el = document.createElement("span");
      el.className = "sh-dot" + (hill.type ? " sh-dot-" + hill.type : "");
      el.dataset.slug = hill.slug;
      el.dataset.name = hill.name || "Unnamed hill";
      el.setAttribute("aria-hidden", "true");
      mapField.appendChild(el);
      hill.dot = el;
    });
  }

  function clearDots() {
    hills.forEach(function (hill) {
      if (hill.dot && hill.dot.parentNode) hill.dot.parentNode.removeChild(hill.dot);
      hill.dot = null;
    });
  }

  function projectDots() {
    if (!shBasemap || !mapField) return;
    hills.forEach(function (hill) {
      var el = hill.dot;
      if (!el || typeof hill.lon !== "number" || typeof hill.lat !== "number") return;
      if (!matches(hill)) {
        el.hidden = true;
        return;
      }
      var p = shBasemap.project([hill.lon, hill.lat]);
      var left = (p.x - DOT / 2).toFixed(1) + "px";
      var top = (p.y - DOT / 2).toFixed(1) + "px";
      if (mapFlight) {
        el.dataset.mx = left;
        el.dataset.my = top;
        if (!mapFlight.get(hill.slug)) el.hidden = true;
        return;
      }
      if (el.getAnimations && el.getAnimations().some(function (an) { return an.id === "sh-flow" && an.playState !== "finished"; })) return;
      el.hidden = false;
      el.style.transform = "";
      el.style.left = left;
      el.style.top = top;
    });
    if (mapFlight && mapField.classList.contains("sh-map-in")) releaseMapFlight();
  }

  function parkMapDots() {
    if (!mapFlight || !mapField) return;
    var box = mapField.getBoundingClientRect();
    Array.prototype.forEach.call(mapField.querySelectorAll(".sh-dot"), function (el) {
      var a = mapFlight.get(el.dataset.slug);
      if (!a) {
        el.hidden = true;
        return;
      }
      el.hidden = false;
      el.style.left = (a.left + a.width / 2 - box.left - DOT / 2).toFixed(1) + "px";
      el.style.top = (a.top + a.height / 2 - box.top - DOT / 2).toFixed(1) + "px";
      if (a.width > 0 && Math.abs(a.width - DOT) > 0.5) {
        el.style.transform = "scale(" + (a.width / DOT).toFixed(4) + ")";
      }
    });
  }

  function releaseMapFlight() {
    if (!mapFlight || !mapField) return;
    var from = mapFlight;
    var ready = false;
    var pending = false;
    Array.prototype.forEach.call(mapField.querySelectorAll(".sh-dot"), function (el) {
      if (!from.get(el.dataset.slug)) return;
      if (!el.dataset.mx) {
        if (!el.hidden) pending = true;
        return;
      }
      ready = true;
      el.hidden = false;
      el.style.left = el.dataset.mx;
      el.style.top = el.dataset.my;
    });
    if (!ready && pending) return;
    mapFlight = null;
    hills.forEach(function (hill) {
      var el = hill.dot;
      if (!el || !el.dataset.mx || from.get(hill.slug)) return;
      if (!matches(hill)) {
        el.hidden = true;
        return;
      }
      el.hidden = false;
      el.style.transform = "";
      el.style.left = el.dataset.mx;
      el.style.top = el.dataset.my;
    });
    slideInto(mapField.querySelectorAll(".sh-dot"), from, function (el) { return el.dataset.slug; });
  }

  function sizeMap() {
    if (!mapField) return;
    var width = mapField.clientWidth;
    if (width < 40) {
      var main = document.querySelector("main");
      width = (main && main.clientWidth) || 640;
    }
    var height = Math.max(640, Math.round(Math.max(280, width) * 100 / 120));
    mapField.style.height = height + "px";
  }

  function onMapResize() {
    if (view !== "map" || !mapField) return;
    sizeMap();
    if (shBasemap) {
      shBasemap.resize();
      projectDots();
    }
  }

  function syncMap() {
    if (view !== "map" || !mapField) return;
    ensureDots();
    if (mapFlight) parkMapDots();
    projectDots();
    var matched = [];
    hills.forEach(function (hill) {
      if (typeof hill.lat !== "number" || typeof hill.lon !== "number") return;
      if (matches(hill)) matched.push(hill);
    });
    var one = query && matched.length === 1 ? matched[0] : null;
    if (!one) lastPan = "";
    if (!boundaries) {
      ensureBoundaries().then(function () {
        if (view === "map") syncMap();
      }).catch(function () {});
      return;
    }
    paintMask();
    if (one) {
      if (!shBasemap) return;
      placeKey = province + "|" + region;
      didFit = true;
      if (lastPan !== one.slug) {
        lastPan = one.slug;
        panTo(one);
      }
      return;
    }
    fitPlace();
  }

  function tearDownMap() {
    cancelMapFade();
    showTip(null);
    maskWait = false;
    if (shBasemap) {
      shBasemap.remove();
      shBasemap = null;
    }
    clearDots();
    if (mapField && mapField.parentNode) mapField.parentNode.removeChild(mapField);
    mapField = null;
    placeKey = "";
    didFit = false;
    lastPan = "";
    mapZoomTarget = null;
    mapFlight = null;
  }

  function buildMapField() {
    if (mapField || !grid || !grid.parentNode) return;
    var field = document.createElement("div");
    field.className = "sh-map";
    var zoom = document.createElement("div");
    zoom.className = "sh-map-zoom";
    zoom.setAttribute("role", "group");
    zoom.setAttribute("aria-label", "Map zoom");
    var zin = document.createElement("button");
    zin.type = "button";
    zin.className = "sh-map-zoom-btn";
    zin.setAttribute("aria-label", "Zoom in");
    zin.textContent = "+";
    var zout = document.createElement("button");
    zout.type = "button";
    zout.className = "sh-map-zoom-btn";
    zout.setAttribute("aria-label", "Zoom out");
    zout.textContent = "\u2212";
    zoom.appendChild(zin);
    zoom.appendChild(zout);
    zin.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      stepMapZoom(1);
    });
    zout.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      stepMapZoom(-1);
    });
    var credit = document.createElement("p");
    credit.className = "sh-map-credit";
    credit.textContent = "\u00a9 OpenStreetMap";
    field.appendChild(zoom);
    field.appendChild(credit);
    grid.parentNode.insertBefore(field, grid.nextSibling);
    mapField = field;
    sizeMap();
    var pressX = 0;
    var pressY = 0;
    var pressMoved = false;
    field.addEventListener("pointerdown", function (e) {
      if (e.target.closest && e.target.closest(".sh-map-zoom")) return;
      pressX = e.clientX;
      pressY = e.clientY;
      pressMoved = false;
    });
    field.addEventListener("pointermove", function (e) {
      if (Math.hypot(e.clientX - pressX, e.clientY - pressY) > 8) pressMoved = true;
      if (e.pointerType === "touch") return;
      showTip(dotUnder(e.clientX, e.clientY));
    });
    field.addEventListener("pointerleave", function () { showTip(null); });
    field.addEventListener("click", function (e) {
      if (pressMoved) return;
      if (e.target.closest && e.target.closest(".sh-map-zoom")) return;
      var dot = dotUnder(e.clientX, e.clientY);
      if (!dot) return;
      e.preventDefault();
      pendingFrom = rectBox(dot.getBoundingClientRect());
      showTip(null);
      if (slugFromHash() === dot.dataset.slug) syncFromHash(false);
      else location.hash = dot.dataset.slug;
    });
    if (!mapResizeBound) {
      mapResizeBound = true;
      window.addEventListener("resize", onMapResize);
    }
  }

  function mountBasemap() {
    if (!mapField || shBasemap || !window.maplibregl) return;
    var field = mapField;
    var el = document.createElement("div");
    el.className = "sh-map-tiles";
    el.setAttribute("aria-hidden", "true");
    field.insertBefore(el, field.firstChild);
    armMapFade();
    var token = {};
    field._shToken = token;
    loadPositron().then(function (style) {
      if (field._shToken !== token || !field.isConnected) return;
      var map = new maplibregl.Map({
        container: el,
        style: JSON.parse(JSON.stringify(style)),
        bounds: openingBounds(),
        fitBoundsOptions: { padding: 36, animate: false },
        interactive: true,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        fadeDuration: 0,
        preserveDrawingBuffer: true,
        failIfMajorPerformanceCaveat: false
      });
      if (map.touchZoomRotate) map.touchZoomRotate.disableRotation();
      if (map.dragRotate) map.dragRotate.disable();
      if (map.keyboard) map.keyboard.disable();
      shBasemap = map;
      map.on("load", function () {
        if (field._shToken !== token) return;
        map.resize();
        syncMap();
        function whenTiles() {
          if (field._shToken !== token) return;
          if (map.areTilesLoaded && !map.areTilesLoaded()) return;
          revealMap();
        }
        whenTiles();
        map.on("idle", whenTiles);
      });
      map.on("move", function () {
        projectDots();
        showTip(null);
      });
      map.on("zoom", function () {
        if (map.getLayer && map.getLayer("sh-mask")) {
          map.setPaintProperty("sh-mask", "fill-opacity", maskOpacityFor(map.getZoom()));
        }
      });
      map.on("resize", projectDots);
    }).catch(function () {
      if (field._shToken === token) revealMap();
    });
  }

  function enterMap() {
    if (view === "map") return;
    var before = snapshotHills();
    view = "map";
    mapFlight = before.size ? before : null;
    placeKey = "";
    didFit = false;
    lastPan = "";
    if (grid) grid.classList.add("sh-held");
    syncMapButton();
    var token = ++mapToken;
    buildMapField();
    ensureDots();
    parkMapDots();
    Promise.all([
      ensureMapLibre(),
      ensureBoundaries().catch(function () { return null; })
    ]).then(function () {
      if (token !== mapToken || view !== "map" || !mapField) return;
      mountBasemap();
    }).catch(function () {
      if (token !== mapToken || view !== "map") return;
      leaveMap(false);
    });
  }

  function leaveMap(animate) {
    if (view !== "map" && !mapField) return;
    var before = animate === false ? null : snapshotDots();
    view = "grid";
    mapToken += 1;
    tearDownMap();
    if (grid) grid.classList.remove("sh-held");
    syncMapButton();
    if (before && grid) {
      void grid.offsetWidth;
      syncStroke();
      slideInto(grid.querySelectorAll(".sh-hill"), before, function (el) { return el.id; });
    }
  }

  var mapBtn = document.getElementById("sh-map-btn");
  if (mapBtn) {
    mapBtn.addEventListener("click", function () {
      if (view === "map") leaveMap(true);
      else enterMap();
    });
  }

  var find = document.querySelector(".sh-find");
  if (find) {
    find.addEventListener("input", function () {
      query = fold(find.value).trim();
      apply(false);
    });
  }

  if (tags) {
    tags.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".sh-tag") : null;
      if (!btn) return;
      var nextProvince = btn.getAttribute("data-sh-province");
      if (nextProvince) {
        province = nextProvince;
        region = "all";
        setPressed();
        if (province === "ab" && !albertaReady) {
          if (count) count.textContent = "Loading Alberta…";
          ensureAlberta().then(function () {
            apply(false);
            requestAnimationFrame(syncStroke);
          });
          return;
        }
        apply(false);
        requestAnimationFrame(syncStroke);
        return;
      }
      var nextType = btn.getAttribute("data-sh-type");
      if (nextType) {
        kind = nextType === kind ? "all" : nextType;
        setPressed();
        apply(false);
        return;
      }
      var id = btn.getAttribute("data-sh-region") || "all";
      region = (id === region && id !== "all") ? "all" : id;
      setPressed();
      apply(false);
    });
  }

  if (grid) {
    grid.addEventListener("click", function (e) {
      var card = e.target.closest ? e.target.closest(".sh-hill") : null;
      if (!card) return;
      e.preventDefault();
      if (slugFromHash() === card.id) syncFromHash(true);
      else location.hash = card.id;
    });
  }

  window.addEventListener("hashchange", function () { syncFromHash(view !== "map"); });
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && document.getElementById("sh-lb")) {
      e.preventDefault();
      closeLb();
    }
  });

  Promise.all([
    fetch("hills.json?v=20261016l").then(function (res) {
      if (!res.ok) throw new Error("hills");
      return res.json();
    }),
    fetch("names.json?v=20261016f").then(function (res) {
      return res.ok ? res.json() : {};
    }).catch(function () { return {}; }),
    fetch("contours/index.json?v=20261016g").then(function (res) {
      return res.ok ? res.json() : { hills: {} };
    }).catch(function () { return { hills: {} }; })
  ]).then(function (pair) {
    contourIndex = (pair[2] && pair[2].hills) || {};
    watch = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) loadContour(entry.target);
      });
    }, { rootMargin: "280px" });
    adopt(pair[0], pair[1] || {}, {});
    setPressed();
    syncFromHash(true);
    requestAnimationFrame(syncStroke);
  }).catch(function () {
    if (count) count.textContent = "The hill drawings did not load.";
  });
})();

/* Column sizer. Same ends, hysteresis, and scroll lock as Vacant. */
(function () {
  var COL_KEY = "shZoomCols";
  var MIN = 5;
  var MAX = 20;
  var DEF = 6;
  var HYST = 0.72;
  var dragging = false;
  var zLock = null;
  var zRaf = 0;
  var zVal = null;

  function grid() {
    return document.getElementById("sh-grid");
  }

  function phoneSlider() {
    return window.Shared && Shared.isPhone();
  }

  function sliderEnds() {
    return phoneSlider() ? { min: 4, max: 7 } : { min: MIN, max: MAX };
  }

  function clampCols(n) {
    n = Math.round(+n);
    return n >= MIN && n <= MAX ? n : DEF;
  }

  function clampSlider(n) {
    var ends = sliderEnds();
    n = Math.round(+n);
    if (n < ends.min) return ends.min;
    if (n > ends.max) return ends.max;
    return n;
  }

  function cols() {
    var g = grid();
    var raw = g ? g.getAttribute("data-columns") || DEF : DEF;
    return phoneSlider() ? clampSlider(raw) : clampCols(raw);
  }

  function storedCols() {
    var n = DEF;
    try {
      var raw = localStorage.getItem(COL_KEY);
      if (raw) n = parseInt(raw, 10);
    } catch (e) {}
    return clampCols(n || DEF);
  }

  function saveCols(n) {
    try {
      localStorage.setItem(COL_KEY, String(n));
    } catch (e) {}
  }

  function fillSlider(v) {
    var s = document.querySelector(".sh-zslider");
    if (!s) return;
    var ends = sliderEnds();
    var shown = dragging ? +s.value : v;
    s.min = String(ends.min);
    s.max = String(ends.max);
    s.style.setProperty("--sh-p", (((shown - ends.min) / (ends.max - ends.min)) * 100).toFixed(2) + "%");
    if (!dragging && +s.value !== v) s.value = v;
  }

  function setCols(n) {
    n = clampSlider(n);
    fillSlider(n);
    var g = grid();
    if (!g) return;
    g.setAttribute("data-columns", String(n));
    g.style.setProperty("--sh-cols", String(n));
    requestAnimationFrame(function () {
      if (window.shSyncStroke) window.shSyncStroke();
    });
  }

  function lockScroll() {
    if (zLock || !window.Shared) return;
    zLock = Shared.lockScroll({ className: "sh-sizing", grid: grid() });
  }

  function unlockScroll() {
    if (!zLock || !window.Shared) return;
    Shared.unlockScroll(zLock, { className: "sh-sizing", grid: grid() });
    zLock = null;
  }

  function pick(v, current) {
    var ends = sliderEnds();
    v = +v;
    if (!(v >= ends.min)) v = ends.min;
    if (v > ends.max) v = ends.max;
    return Math.abs(v - current) < HYST ? current : clampSlider(v);
  }

  function isSlider(t) {
    return t && t.classList && t.classList.contains("sh-zslider");
  }

  setCols(phoneSlider() ? 4 : storedCols());

  document.addEventListener("pointerdown", function (e) {
    if (!isSlider(e.target)) return;
    dragging = true;
    lockScroll();
  }, true);

  function endSlider() {
    if (!dragging) return;
    var s = document.querySelector(".sh-zslider");
    var n = s ? pick(s.value, zVal != null ? zVal : cols()) : cols();
    zVal = null;
    dragging = false;
    setCols(n);
    if (!phoneSlider()) saveCols(n);
    requestAnimationFrame(unlockScroll);
  }

  document.addEventListener("pointerup", endSlider, true);
  document.addEventListener("pointercancel", endSlider, true);
  window.addEventListener("blur", endSlider);

  document.addEventListener("input", function (e) {
    if (!isSlider(e.target)) return;
    var s = e.target;
    if (dragging) {
      var ends = sliderEnds();
      s.style.setProperty("--sh-p", (((+s.value - ends.min) / (ends.max - ends.min)) * 100).toFixed(2) + "%");
      var n = pick(s.value, zVal != null ? zVal : cols());
      if (n !== (zVal != null ? zVal : cols())) {
        zVal = n;
        if (!zRaf) {
          zRaf = requestAnimationFrame(function () {
            zRaf = 0;
            if (zVal == null) return;
            var v = zVal;
            setCols(v);
            zVal = v;
          });
        }
      }
      return;
    }
    var k = clampSlider(s.value);
    if (!phoneSlider()) saveCols(k);
    setCols(k);
  });

  var phoneCols = phoneSlider();
  window.addEventListener("resize", function () {
    if (dragging) return;
    clearTimeout(window.shResize);
    window.shResize = setTimeout(function () {
      var nowPhone = phoneSlider();
      if (nowPhone !== phoneCols) {
        phoneCols = nowPhone;
        setCols(nowPhone ? 4 : storedCols());
      } else if (window.shSyncStroke) window.shSyncStroke();
    }, 150);
  });
})();
