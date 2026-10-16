/* Ski Hills. Static drawings. The file is local; nothing is fetched from OpenSkiMap. */
(function () {
  var grid = document.getElementById("sh-grid");
  var count = document.querySelector(".sh-count");
  var tags = document.querySelector(".sh-tags");
  var hills = [];
  var province = "bc";
  var region = "all";
  var query = "";
  var watch = null;
  var albertaReady = false;
  var albertaPromise = null;
  var SQUARE = 1000;
  var BAND = 120;
  var DRAW = SQUARE - BAND;

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
  }

  function fold(text) {
    return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function matches(hill) {
    if ((hill.province || "bc") !== province) return false;
    if (region !== "all" && hill.region !== region) return false;
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
      if (marked && scroll) card.scrollIntoView({ block: "center" });
    });
    if (count) count.textContent = (query && !shown) ? "No hills match" : (shown + " of " + total);
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

  function openLb(card) {
    if (!card) return;
    var existing = document.getElementById("sh-lb");
    if (existing && existing._card === card && !existing._closing) return;
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    var src = card.querySelector("svg");
    if (!src) return;
    var thumb = src.getBoundingClientRect();
    var name = card.querySelector(".sh-hill-name");
    var lb = document.createElement("div");
    lb.id = "sh-lb";
    lb.className = "sh-lb";
    lb.setAttribute("role", "dialog");
    lb.setAttribute("aria-modal", "true");
    lb.setAttribute("aria-label", name ? name.textContent : "Ski hill");
    lb._card = card;
    lb._from = { x: thumb.left, y: thumb.top, w: thumb.width, h: thumb.height };
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
    var card = slug ? document.getElementById(slug) : null;
    if (card && card.classList.contains("sh-hill")) openLb(card);
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
      fetch("alberta.json?v=20261016k").then(function (res) {
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

  window.addEventListener("hashchange", function () { syncFromHash(true); });
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && document.getElementById("sh-lb")) {
      e.preventDefault();
      closeLb();
    }
  });

  Promise.all([
    fetch("hills.json?v=20261016i").then(function (res) {
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
