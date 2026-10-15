/* Home page examples. Photos and colours come from each project's own files.
   The Info ripple is info.js, unchanged. */
(function () {
  var host = document.getElementById("home-float");
  if (!host) return;
  var phone = window.matchMedia && window.matchMedia("(max-width: 767px)").matches;
  var count = phone ? 4 : 10;
  var SHEET = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR1RdPX8eQULP_-BojCy1Sxchnj9CNrxUyp1X_674m5Bo6Fa2pecJ2kE4R1pMMAk3B184GqpJ6LhSUF/pub?gid=415065047&single=true&output=csv";

  function pick(list) {
    var copy = list.slice();
    var i;
    for (i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = copy[i];
      copy[i] = copy[j];
      copy[j] = t;
    }
    return copy.slice(0, Math.min(count, copy.length));
  }

  function thumb(src) {
    return String(src || "").replace(/w_\d+,h_\d+/, "w_160,h_160");
  }

  function textOf(url) {
    return fetch(url, { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("load");
      return res.text();
    });
  }

  function foundItems(html) {
    var out = [];
    var re = /data-front="(https:[^"]+)"/g;
    var m;
    while ((m = re.exec(html))) {
      out.push({ kind: "photo", title: "Found Photographs", href: "found-photographs/", src: m[1] });
    }
    return pick(out);
  }

  function vacantItems(html) {
    var out = [];
    var re = /src="(https:\/\/res\.cloudinary\.com\/[^"]*vacant-storefronts\/[^"]+)"/g;
    var m;
    while ((m = re.exec(html))) {
      out.push({ kind: "photo", title: "Vacant Storefronts", href: "vacant-storefronts/", src: m[1] });
    }
    return pick(out);
  }

  function storeItems(html) {
    var out = [];
    var re = /<li class="csc-swatch"[^>]*data-store="([^"]*)"[^>]*data-cat="([^"]*)"[\s\S]*?data-main="(#[0-9A-Fa-f]{3,8})"/g;
    var m;
    while ((m = re.exec(html))) {
      var href = "convenient-store-colors/#vancouver/" + encodeURIComponent(m[1]) + "/" + encodeURIComponent(m[2]);
      out.push({ kind: "swatch", title: "Convenience Store Colours", href: href, hex: m[3] });
    }
    return pick(out);
  }

  function parseCsv(text) {
    var rows = [];
    var row = [];
    var cell = "";
    var q = false;
    var i;
    for (i = 0; i < text.length; i++) {
      var c = text.charAt(i);
      if (q) {
        if (c === '"') {
          if (text.charAt(i + 1) === '"') { cell += '"'; i += 1; }
          else q = false;
        } else cell += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (c !== "\r") cell += c;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function normHex(raw) {
    var s = String(raw || "").trim();
    if (!s) return "";
    if (s.charAt(0) !== "#") s = "#" + s;
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
      s = "#" + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2) + s.charAt(3) + s.charAt(3);
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(s)) return "";
    return s.toUpperCase();
  }

  function carItems(csv) {
    var rows = parseCsv(csv);
    if (!rows.length) return [];
    var head = rows[0];
    var col = 3;
    var i;
    for (i = 0; i < head.length; i++) {
      if (String(head[i] || "").trim().toLowerCase() === "accurate hex") col = i;
    }
    var out = [];
    for (i = 1; i < rows.length; i++) {
      var hex = normHex(rows[i][col]);
      if (!hex) continue;
      out.push({ kind: "swatch", title: "Car Colours", href: "car-colours/", hex: hex });
    }
    return pick(out);
  }

  function pale(hex) {
    var n = parseInt(String(hex).replace("#", ""), 16);
    var r = (n >> 16) & 255;
    var g = (n >> 8) & 255;
    var b = n & 255;
    return (r * 299 + g * 587 + b * 114) / 1000 > 210;
  }

  function scatter(n) {
    var spots = [];
    var i;
    var tries;
    for (i = 0; i < n; i++) {
      var x = 10;
      var y = 12;
      var t;
      for (tries = 0; tries < 28; tries++) {
        x = 5 + Math.random() * 84;
        y = 8 + Math.random() * 78;
        var clear = true;
        for (t = 0; t < spots.length; t++) {
          if (Math.hypot(spots[t].x - x, spots[t].y - y) < 9) clear = false;
        }
        if (clear) break;
      }
      spots.push({ x: x, y: y });
    }
    return spots;
  }

  function mount(items) {
    if (!items.length) return;
    var spots = scatter(items.length);
    var i;
    for (i = 0; i < items.length; i++) {
      var item = items[i];
      var spot = spots[i];
      var a = document.createElement("a");
      a.href = item.href;
      a.setAttribute("aria-label", item.title);
      a.style.setProperty("--x", spot.x + "%");
      a.style.setProperty("--y", spot.y + "%");
      var dx = Math.round((Math.random() * 56 - 28) || 12);
      var dy = Math.round((Math.random() * 48 - 24) || -10);
      a.style.setProperty("--dx", dx + "px");
      a.style.setProperty("--dy", dy + "px");
      a.style.setProperty("--dur", (34 + Math.random() * 22).toFixed(1) + "s");
      a.style.setProperty("--delay", (-Math.random() * 30).toFixed(1) + "s");
      if (spot.y > 74) a.className = "label-up";
      if (item.kind === "photo") {
        var img = document.createElement("img");
        img.src = thumb(item.src);
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        img.draggable = false;
        img.referrerPolicy = "no-referrer";
        a.appendChild(img);
      } else {
        var dot = document.createElement("span");
        dot.className = "home-swatch" + (pale(item.hex) ? " is-pale" : "");
        dot.style.background = item.hex;
        a.appendChild(dot);
      }
      var label = document.createElement("span");
      label.className = "home-float-label";
      label.textContent = item.title;
      a.appendChild(label);
      host.appendChild(a);
    }
  }

  function settle(p) {
    return p.then(function (v) { return v; }, function () { return []; });
  }

  Promise.all([
    settle(textOf("found-photographs/").then(foundItems)),
    settle(textOf("vacant-storefronts/").then(vacantItems)),
    settle(textOf("convenient-store-colors/").then(storeItems)),
    settle(textOf(SHEET).then(carItems))
  ]).then(function (groups) {
    var all = [];
    groups.forEach(function (list) {
      all = all.concat(list);
    });
    var i;
    for (i = all.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = all[i];
      all[i] = all[j];
      all[j] = t;
    }
    mount(all);
  });
})();
