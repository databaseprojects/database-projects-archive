/* Ski Hills. Drawings are local. The map loads only after Map is opened. */
(function () {
  var grid = document.getElementById("sh-grid");
  var count = document.querySelector(".sh-count");
  var tags = document.querySelector(".sh-tags");
  var hills = [];
  var byId = Object.create(null);
  var bySlug = Object.create(null);
  var province = "ca";
  var region = "all";
  var kind = "all";
  var popular = false;
  var query = "";
  var shownIds = null;
  var watch = null;
  var catalogs = {
    bc: {
      file: "hills.json?v=20261018y",
      names: "names.json?v=20261016f",
      index: "contours/index.json?v=20261016w",
      label: "British Columbia"
    },
    ab: {
      file: "alberta.json?v=20261018y",
      names: "alberta-names.json?v=20261016i",
      index: "contours/alberta-index.json?v=20261017c",
      label: "Alberta"
    },
    qc: {
      file: "quebec.json?v=20261018y",
      names: "quebec-names.json?v=20261018h",
      index: "contours/quebec-index.json?v=20261018h",
      label: "Quebec"
    },
    on: {
      file: "ontario.json?v=20261018y",
      names: "ontario-names.json?v=20261018h",
      index: "contours/ontario-index.json?v=20261018h",
      label: "Ontario"
    },
    sk: {
      file: "saskatchewan.json?v=20261018y",
      names: "saskatchewan-names.json?v=20261018h",
      index: "contours/saskatchewan-index.json?v=20261018h",
      label: "Saskatchewan"
    },
    mb: {
      file: "manitoba.json?v=20261018h",
      names: "manitoba-names.json?v=20261018h",
      index: "contours/manitoba-index.json?v=20261018h",
      label: "Manitoba"
    },
    nb: {
      file: "new-brunswick.json?v=20261018h",
      names: "new-brunswick-names.json?v=20261018h",
      index: "contours/new-brunswick-index.json?v=20261018h",
      label: "New Brunswick"
    },
    nl: {
      file: "newfoundland.json?v=20261018y",
      names: "newfoundland-names.json?v=20261018h",
      index: "contours/newfoundland-index.json?v=20261018h",
      label: "Newfoundland"
    },
    ns: {
      file: "nova-scotia.json?v=20261018y",
      names: "nova-scotia-names.json?v=20261018h",
      index: "contours/nova-scotia-index.json?v=20261018h",
      label: "Nova Scotia"
    },
    pe: {
      file: "prince-edward-island.json?v=20261018h",
      names: "prince-edward-island-names.json?v=20261018h",
      index: "contours/prince-edward-island-index.json?v=20261018h",
      label: "Prince Edward Island"
    },
    yt: {
      file: "yukon.json?v=20261018y",
      names: "yukon-names.json?v=20261018h",
      index: "contours/yukon-index.json?v=20261018h",
      label: "Yukon"
    },
    nt: {
      file: "northwest-territories.json?v=20261018h",
      names: "northwest-territories-names.json?v=20261018h",
      index: "contours/northwest-territories-index.json?v=20261018h",
      label: "Northwest Territories"
    }
  };
  var US_STATES = ["wa", "or", "ca", "nv", "id", "mt", "wy", "ut", "co", "az", "nm", "sd", "me", "nh", "vt", "ma", "ny", "pa", "nj", "md", "wv", "mn", "wi", "mi", "ct", "ri", "va", "oh", "il", "in", "ia", "nd", "mo", "nc", "al", "tn"];
  var US_STATE_NAMES = {
    wa: "Washington",
    or: "Oregon",
    ca: "California",
    nv: "Nevada",
    id: "Idaho",
    mt: "Montana",
    wy: "Wyoming",
    ut: "Utah",
    co: "Colorado",
    az: "Arizona",
    nm: "New Mexico",
    sd: "South Dakota",
    me: "Maine",
    nh: "New Hampshire",
    vt: "Vermont",
    ma: "Massachusetts",
    ny: "New York",
    pa: "Pennsylvania",
    nj: "New Jersey",
    md: "Maryland",
    wv: "West Virginia",
    mn: "Minnesota",
    wi: "Wisconsin",
    mi: "Michigan",
    ct: "Connecticut",
    ri: "Rhode Island",
    va: "Virginia",
    oh: "Ohio",
    il: "Illinois",
    in: "Indiana",
    ia: "Iowa",
    nd: "North Dakota",
    mo: "Missouri",
    nc: "North Carolina",
    al: "Alabama",
    tn: "Tennessee"
  };
  var US_FILE_VERSION = {
    ca: "20261022e",
    co: "20261022e",
    id: "20261022e",
    ma: "20261022f",
    md: "20261018y",
    me: "20261022f",
    mi: "20261022h",
    mt: "20261022e",
    nh: "20261022f",
    nj: "20261022g",
    nm: "20261022e",
    ny: "20261022g",
    or: "20261022e",
    pa: "20261022g",
    vt: "20261022f",
    wa: "20261022e",
    wi: "20261022h",
    wv: "20261022g",
    wy: "20261022e",
    mn: "20261022h",
    az: "20261022e",
    nv: "20261022e",
    sd: "20261022e",
    ut: "20261022e",
    ct: "20261022f",
    ri: "20261022f",
    va: "20261022g",
    oh: "20261022i",
    il: "20261022i",
    in: "20261022i",
    ia: "20261022i",
    nd: "20261022i",
    mo: "20261022i",
    nc: "20261022i",
    al: "20261022i",
    tn: "20261022i"
  };
  US_STATES.forEach(function (id) {
    catalogs["us-" + id] = {
      file: "usa/" + id + ".json?v=" + (US_FILE_VERSION[id] || "20261018l"),
      index: "contours/usa-index.json?v=20261022i",
      label: US_STATE_NAMES[id]
    };
  });
  var EU_COUNTRIES = ["fr", "ch", "at", "it", "no", "se", "fi", "es", "ad", "rs", "ua", "sk", "bg", "de", "cz"];
  var EU_COUNTRY_NAMES = {
    fr: "France",
    ch: "Switzerland",
    at: "Austria",
    it: "Italy",
    no: "Norway",
    se: "Sweden",
    fi: "Finland",
    is: "Iceland",
    dk: "Denmark",
    es: "Spain",
    ad: "Andorra",
    de: "Germany",
    si: "Slovenia",
    sk: "Slovakia",
    cz: "Czechia",
    pl: "Poland",
    bg: "Bulgaria",
    ro: "Romania",
    gb: "United Kingdom",
    rs: "Serbia",
    ua: "Ukraine"
  };
  var EU_FILE_VERSION = {
    fr: "20261022a",
    ch: "20261022a",
    at: "20261022a",
    it: "20261022a",
    no: "20261022b",
    se: "20261022b",
    fi: "20261022b",
    es: "20261022c",
    ad: "20261022c",
    rs: "20261022d",
    ua: "20261022d",
    sk: "20261022d",
    bg: "20261022d",
    de: "20261022d",
    cz: "20261022d"
  };
  EU_COUNTRIES.forEach(function (id) {
    catalogs["eu-" + id] = {
      file: "europe/" + id + ".json?v=" + (EU_FILE_VERSION[id] || "20261022d"),
      index: "contours/europe-index.json?v=20261022d",
      label: EU_COUNTRY_NAMES[id]
    };
  });
  var PLACE_PROVINCES = ["bc", "ab", "qc", "on", "sk", "mb", "nb", "nl", "ns", "pe", "yt", "nt", "us"];
  var CANADA_PROVINCES = ["bc", "ab", "qc", "on", "sk", "mb", "nb", "nl", "ns", "pe", "yt", "nt"];
  var canadaProvince = "ca";
  var canadaRegion = "all";
  var usaRegion = "all";
  var euRegion = "all";
  var catalogReady = {};
  var catalogPromise = {};
  var SQUARE = 1000;
  var BAND = 120;
  var DRAW = SQUARE - BAND;
  var view = "grid";
  var pendingFrom = null;
  var scrollHold = null;
  var mapField = null;
  var shBasemap = null;
  var boundaries = null;
  var boundariesPromise = null;
  var mapLibrePromise = null;
  var positronStyle = null;
  var pinsHeld = false;
  var pinToken = 0;
  var boundsByKey = {};
  var ringsByKey = {};
  var placeKey = "";
  var didFit = false;
  var lastPan = "";
  var mapAimed = "";
  var mapToken = 0;
  var mapZoomLock = 0;
  var mapZoomTarget = null;
  var mapFadeTimer = 0;
  var outlineWait = false;
  var mapResizeBound = false;
  var mapTip = null;

  function slugFromHash() {
    return decodeURIComponent((location.hash || "").replace(/^#/, "")).trim();
  }

  function countryNow() {
    if (province === "all") return "all";
    if (province === "us") return "us";
    if (province === "eu") return "eu";
    return "ca";
  }

  function rememberPlace() {
    if (province === "us") usaRegion = region;
    else if (province === "eu") euRegion = region;
    else if (province === "ca") canadaProvince = "ca";
    else if (province !== "all") {
      canadaProvince = province;
      canadaRegion = region;
    }
  }

  function canadaHill(hill) {
    var code = hill.province || "bc";
    return code !== "us" && code !== "eu";
  }

  function placeCatalogs() {
    if (province === "all") return Object.keys(catalogs);
    if (province === "ca") {
      return CANADA_PROVINCES.filter(function (id) { return catalogs[id]; });
    }
    if (province === "us") {
      if (region === "all") return US_STATES.map(function (id) { return "us-" + id; });
      return catalogs["us-" + region] ? ["us-" + region] : [];
    }
    if (province === "eu") {
      if (region === "all") return EU_COUNTRIES.map(function (id) { return "eu-" + id; });
      return catalogs["eu-" + region] ? ["eu-" + region] : [];
    }
    return catalogs[province] ? [province] : [];
  }

  function tagOverflow(row) {
    return Math.max(0, row.scrollWidth - row.clientWidth);
  }

  function paintTagFade(row) {
    if (!row) return;
    if (row.hidden) {
      row.classList.remove("sh-fade-left");
      row.classList.remove("sh-fade-right");
      return;
    }
    var max = tagOverflow(row);
    var left = row.scrollLeft;
    row.classList.toggle("sh-fade-left", left > 2);
    row.classList.toggle("sh-fade-right", max > 2 && left < max - 2);
  }

  function scrollPressedTag(row) {
    if (!row || row.hidden) return;
    var on = row.querySelector(".sh-on");
    if (!on) return;
    var rowRect = row.getBoundingClientRect();
    var btnRect = on.getBoundingClientRect();
    if (!(rowRect.width > 0) || !(btnRect.width > 0)) return;
    if (btnRect.left >= rowRect.left - 1 && btnRect.right <= rowRect.right + 1) return;
    var delta = (btnRect.left + btnRect.width / 2) - (rowRect.left + rowRect.width / 2);
    var left = row.scrollLeft + delta;
    if (left < 0) left = 0;
    var max = tagOverflow(row);
    if (left > max) left = max;
    if (Math.abs(left - row.scrollLeft) < 2) return;
    row.scrollLeft = left;
  }

  var tagScrollTimer = 0;

  function syncTagScrollers() {
    if (!tags) return;
    Array.prototype.forEach.call(tags.querySelectorAll(".sh-scroll"), function (row) {
      scrollPressedTag(row);
      paintTagFade(row);
    });
  }

  function scheduleTagScroll() {
    syncTagScrollers();
    if (tagScrollTimer) window.clearTimeout(tagScrollTimer);
    tagScrollTimer = window.setTimeout(syncTagScrollers, 340);
  }

  function bindTagScrollers() {
    if (!tags || tags._shScroll) return;
    tags._shScroll = true;
    Array.prototype.forEach.call(tags.querySelectorAll(".sh-scroll"), function (row) {
      row.addEventListener("scroll", function () { paintTagFade(row); }, { passive: true });
    });
    window.addEventListener("resize", function () {
      Array.prototype.forEach.call(tags.querySelectorAll(".sh-scroll"), paintTagFade);
    });
  }

  // One province or one state. All, Canada, and USA-wide stay on the index
  // until a card actually needs its drawing.
  function selectedCatalogs() {
    if (province === "all" || province === "ca") return [];
    if (province === "us") {
      if (region === "all") return [];
      return catalogs["us-" + region] ? ["us-" + region] : [];
    }
    if (province === "eu") {
      if (region === "all") return [];
      return catalogs["eu-" + region] ? ["eu-" + region] : [];
    }
    return catalogs[province] ? [province] : [];
  }

  function loadPlace(done) {
    var need = selectedCatalogs().filter(function (code) { return !catalogReady[code]; });
    if (!need.length) {
      if (done) done();
      return;
    }
    if (count && !/\d/.test(count.textContent || "")) {
      count.textContent = need.length === 1 ? ("Loading " + catalogs[need[0]].label + "…") : "Loading…";
    }
    ensureCatalogs(need).then(function () {
      if (done) done();
    });
  }

  function setPressed() {
    if (!tags) return;
    var country = countryNow();
    tags.setAttribute("data-country", country);
    Array.prototype.forEach.call(tags.querySelectorAll("[data-sh-country]"), function (btn) {
      var on = btn.getAttribute("data-sh-country") === country;
      btn.classList.toggle("sh-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    Array.prototype.forEach.call(tags.querySelectorAll("[data-sh-province]"), function (btn) {
      if (btn.hasAttribute("data-sh-country")) return;
      var on = btn.getAttribute("data-sh-province") === province;
      btn.classList.toggle("sh-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    var displaced = {};
    var switching = province !== "all";
    if (switching && window.Shared && Shared.syncSubtags) {
      Array.prototype.forEach.call(tags.querySelectorAll("[data-sh-for]"), function (group) {
        var id = group.getAttribute("data-sh-for");
        if (id === province || group.hidden) return;
        var parent = tags.querySelector('[data-sh-province="' + id + '"]');
        Shared.syncSubtags(group, parent, false, "push");
        displaced[id] = true;
      });
    }
    Array.prototype.forEach.call(tags.querySelectorAll("[data-sh-for]"), function (group) {
      var id = group.getAttribute("data-sh-for");
      var mine = id === province;
      var parent = tags.querySelector('[data-sh-province="' + id + '"]');
      if (!displaced[id]) {
        if (window.Shared && Shared.syncSubtags) Shared.syncSubtags(group, parent, mine);
        else group.hidden = !mine;
      }
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
    var pop = document.getElementById("sh-popular-btn");
    if (pop) {
      pop.classList.toggle("sh-on", popular);
      pop.setAttribute("aria-pressed", popular ? "true" : "false");
    }
    bindTagScrollers();
    scheduleTagScroll();
  }

  function fold(text) {
    return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function matches(hill) {
    if (province === "ca") {
      if (!canadaHill(hill)) return false;
    } else if (province !== "all" && (hill.province || "bc") !== province) return false;
    if (province !== "all" && province !== "ca" && region !== "all" && hill.region !== region) return false;
    if (kind !== "all" && hill.type !== kind) return false;
    if (query && fold(hill.name).indexOf(query) === -1) return false;
    return true;
  }

  function runTotal(hill) {
    if (hill.runs && hill.runs.length) return hill.runs.length;
    return hill._runCount || 0;
  }

  // popularBoost changes Most popular order only. Captions still count runs.
  function rankTotal(hill) {
    var boost = Number(hill.popularBoost);
    if (!isFinite(boost)) boost = 0;
    return runTotal(hill) + boost;
  }

  function visibleHills() {
    var list = hills.filter(matches);
    if (!popular) return list;
    return list.slice().sort(function (a, b) {
      return rankTotal(b) - rankTotal(a) || a._ord - b._ord;
    }).slice(0, 15);
  }

  function isShown(hill) {
    if (!shownIds) return matches(hill);
    return !!shownIds[hill.id];
  }

  function inPlace(hill) {
    if (province === "all") return true;
    if (province === "ca") return canadaHill(hill);
    if ((hill.province || "bc") !== province) return false;
    if (region !== "all" && hill.region !== region) return false;
    return true;
  }

  // Kind, search, and Most popular still choose which dots are on the map.
  // Province and region only dim the ones outside the selected place.
  function onMap(hill) {
    if (typeof hill.lat !== "number" || typeof hill.lon !== "number") return false;
    if (kind !== "all" && hill.type !== kind) return false;
    if (query && fold(hill.name).indexOf(query) === -1) return false;
    if (popular) return isShown(hill);
    return true;
  }

  function dotFade(hill) {
    return inPlace(hill) ? "1" : "0.2";
  }

  function apply(scroll) {
    var slug = slugFromHash();
    var list = visibleHills();
    var on = {};
    shownIds = on;
    list.forEach(function (hill) { on[hill.id] = true; });
    var shown = 0;
    var total = 0;
    hills.forEach(function (hill) {
      var card = hill.el;
      if (!card) return;
      var inProv = province === "all" || (province === "ca" ? canadaHill(hill) : (hill.province || "bc") === province);
      var show = !!on[hill.id];
      card.hidden = !show;
      var marked = show && hill.slug === slug;
      card.classList.toggle("sh-on", marked);
      if (inProv) total += 1;
      if (show) shown += 1;
      if (marked && scroll && !card.hidden && view !== "map") card.scrollIntoView({ block: "center" });
    });
    if (popular) {
      list.forEach(function (hill) { if (hill.el) grid.appendChild(hill.el); });
    } else {
      hills.slice().sort(function (a, b) { return a._ord - b._ord; }).forEach(function (hill) {
        if (hill.el) grid.appendChild(hill.el);
      });
    }
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
    holder.innerHTML = '<svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' + runs + lifts + "</svg>";
    return holder.querySelector("svg");
  }

  function shell(hill) {
    var card = document.createElement("a");
    card.className = "sh-hill";
    card.id = hill.slug;
    card.href = "#" + hill.slug;
    card.setAttribute("data-sh-id", hill.id);
    card.setAttribute("data-sh-region", hill.region || "");
    card.setAttribute("aria-label", hill.name || "Unnamed hill");
    var art = document.createElement("span");
    art.className = "sh-hill-art";
    var holder = document.createElementNS(NS, "svg");
    holder.setAttribute("viewBox", "0 0 1000 1000");
    holder.setAttribute("preserveAspectRatio", "xMidYMid slice");
    holder.setAttribute("aria-hidden", "true");
    art.appendChild(holder);
    var name = document.createElement("span");
    name.className = "sh-hill-name";
    name.textContent = hill.name || "Unnamed hill";
    art.appendChild(name);
    card.appendChild(art);
    var caption = document.createElement("span");
    caption.className = "sh-hill-caption";
    caption.textContent = hill.name || "Unnamed hill";
    card.appendChild(caption);
    card._hill = hill;
    card.addEventListener("pointerenter", function (e) {
      if (e.pointerType === "touch") return;
      card.classList.add("sh-name-on");
    });
    card.addEventListener("pointerleave", function (e) {
      if (e.pointerType === "touch") return;
      card.classList.remove("sh-name-on");
    });
    hill.el = card;
    card.hidden = !matches(hill);
    grid.appendChild(card);
    if (watch) watch.observe(card);
  }

  function catalogCode(hill) {
    if (hill.catalog) return hill.catalog;
    if ((hill.province || "bc") === "us") return "us-" + (hill.region || "");
    if ((hill.province || "bc") === "eu") return "eu-" + (hill.region || "");
    return hill.province || "bc";
  }

  function ensureDrawn(hill) {
    if (!hill || hill._drawn) return Promise.resolve(hill);
    if (hill._drawPromise) return hill._drawPromise;
    hill._drawPromise = ensureCatalog(catalogCode(hill)).then(function () {
      if (!hill._geom || !hill.el || hill._drawn) return hill;
      var svg = drawingSvg(hill);
      var holder = hill.el.querySelector("svg");
      if (holder && holder.parentNode) holder.parentNode.replaceChild(svg, holder);
      else {
        var art = hill.el.querySelector(".sh-hill-art");
        if (art) art.insertBefore(svg, art.firstChild);
        else hill.el.insertBefore(svg, hill.el.firstChild);
      }
      hill.el._shift = fitArt(svg, SQUARE, hill._bounds);
      hill._drawn = true;
      loadContour(hill.el);
      requestAnimationFrame(syncStroke);
      return hill;
    }).catch(function () {
      hill._drawPromise = null;
    });
    return hill._drawPromise;
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

  function fitArt(svg, limitY, box) {
    if (!box) box = boundsOf(svg);
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

  var clipSerial = 0;

  function stackWanted(hill) {
    return !!(hill && hill.stacked && hill._stackOn);
  }

  // A second bird's-eye facing. Front is first and is the default.
  // Another hill gets the same toggle once its slug is listed here and
  // frontal/{slug}-front.svg and frontal/{slug}-back.svg exist.
  var SIDE_VIEWS = {
    "mount-washington-alpine-resort": ["front", "back"],
    "lake-louise-ski-area": ["front", "back"],
    "mt-spokane": ["front", "back"]
  };

  function sideViews(hill) {
    var list = hill && SIDE_VIEWS[hill.slug];
    return list && list.length > 1 ? list : null;
  }

  function sideName(hill) {
    var list = sideViews(hill);
    if (!list) return "";
    var side = hill._side || list[0];
    return list.indexOf(side) < 0 ? list[0] : side;
  }

  function frontalUrl(hill) {
    var side = stackWanted(hill) ? sideName(hill) : "";
    var file = side ? hill.slug + "-" + side : hill.slug;
    return "frontal/" + file + ".svg?v=20261022j";
  }

  function frontalArt(hill) {
    var url = frontalUrl(hill);
    return (hill._frontalCache && hill._frontalCache[url]) || "";
  }

  function paintContours(svg, lines, shift, stack) {
    if (!svg) return;
    var old = svg.querySelector(".sh-contours");
    if (old) old.parentNode.removeChild(old);
    var oldClip = svg.querySelector("clipPath.sh-frame");
    if (oldClip && oldClip.parentNode) oldClip.parentNode.removeChild(oldClip);
    var defs = svg.querySelector("defs");
    if (!defs) {
      defs = document.createElementNS(NS, "defs");
      svg.insertBefore(defs, svg.firstChild);
    }
    var id = "sh-frame-" + (++clipSerial);
    var clip = document.createElementNS(NS, "clipPath");
    clip.setAttribute("id", id);
    clip.setAttribute("class", "sh-frame");
    var rect = document.createElementNS(NS, "rect");
    var frame = shift.clip == null ? SQUARE : shift.clip;
    rect.setAttribute("x", "0");
    rect.setAttribute("y", "0");
    rect.setAttribute("width", String(SQUARE));
    rect.setAttribute("height", String(frame));
    clip.appendChild(rect);
    defs.appendChild(clip);
    var g = document.createElementNS(NS, "g");
    g.setAttribute("class", "sh-contours");
    g.setAttribute("clip-path", "url(#" + id + ")");
    var scale = 1;
    if (stack) {
      var laid = svg.getBoundingClientRect && svg.getBoundingClientRect().width;
      if (!(laid > 8) && svg.parentNode && svg.parentNode.getBoundingClientRect) laid = svg.parentNode.getBoundingClientRect().width;
      scale = (laid > 8 ? laid : SQUARE * 0.8) / SQUARE;
    }
    var stepX = 0.6 / scale;
    var stepY = 1.5 / scale;
    (lines || []).forEach(function (pts) {
      var mapped = mapPoints(pts, shift);
      if (mapped.split(/\s+/).length < 2) return;
      if (stack) {
        var depth;
        for (depth = 4; depth >= 1; depth--) {
          var shade = document.createElementNS(NS, "polyline");
          shade.setAttribute("class", "sh-contour sh-contour-shade");
          shade.setAttribute("data-depth", String(depth));
          shade.setAttribute("points", mapped);
          shade.setAttribute("transform", "translate(" + (depth * stepX).toFixed(2) + " " + (depth * stepY).toFixed(2) + ")");
          g.appendChild(shade);
        }
      }
      var line = document.createElementNS(NS, "polyline");
      line.setAttribute("class", "sh-contour");
      line.setAttribute("points", mapped);
      g.appendChild(line);
    });
    svg.insertBefore(g, svg.firstChild);
  }

  var contourIndex = {};

  function loadContour(card) {
    if (!card || card._contourState) return;
    if (card._hill && !card._hill._geom) return;
    var meta = contourIndex[card.id];
    if (!meta) {
      card._contourState = "none";
      return;
    }
    card._contourState = "loading";
    fetch("contours/" + card.id + ".json?v=20261018o").then(function (res) {
      if (!res.ok) throw new Error("contour");
      return res.json();
    }).then(function (data) {
      card._contourState = "in";
      card._contourLines = data.lines || [];
      paintContours(card.querySelector("svg"), card._contourLines, card._shift || { dx: 0, dy: 0, clip: SQUARE }, false);
      var lb = document.getElementById("sh-lb");
      if (lb && lb._card === card && lb._shift && lb._svg) {
        if (stackWanted(card._hill)) applyStack(card._hill);
        else paintContours(lb._svg, card._contourLines, lb._shift, false);
      }
      refreshMockArt(card);
    }).catch(function () {
      card._contourState = "err";
    });
  }

  function frameLimit() {
    var viewW = document.documentElement.clientWidth || window.innerWidth;
    return Math.min(viewW * 0.92, Math.max(viewW - 48, 0), 1100);
  }

  function syncStroke() {
    var g = document.getElementById("sh-grid");
    var svg = g && (g.querySelector(".sh-hill:not([hidden]) svg") || g.querySelector(".sh-hill svg"));
    if (!g || !svg) return;
    var w = svg.getBoundingClientRect().width;
    if (w < 2) return;
    var maxW = frameLimit();
    var maxH = window.innerHeight * 0.88;
    var gw = Math.min(maxW, maxH);
    if (gw < 1) return;
    var scale = w / gw;
    g.style.setProperty("--sh-stroke", (1.15 * scale).toFixed(3) + "px");
    var cols = parseInt(g.getAttribute("data-columns") || "6", 10);
    var contour = 0.65 * scale;
    // Largest four sizes are 5–8 columns. From 9 columns down, thicken
    // gently to 1.5x the scaled width at 20 columns.
    if (cols >= 9) {
      var t = (cols - 8) / 12;
      if (t < 0) t = 0;
      if (t > 1) t = 1;
      contour *= 1 + 0.5 * Math.sqrt(t);
    }
    g.style.setProperty("--sh-contour", contour.toFixed(3) + "px");
    g.style.setProperty("--sh-key", (1.6 * scale).toFixed(3) + "px");
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
    "alberta-north": "Alberta North",
    "outaouais": "Outaouais",
    "laurentides": "Laurentides",
    "mauricie": "Mauricie",
    "cantons-de-lest": "Cantons-de-l'Est",
    "quebec": "Québec",
    "saguenay": "Saguenay–Lac-Saint-Jean",
    "bas-saint-laurent-gaspesie": "Bas-Saint-Laurent & Gaspésie",
    "georgian-bay": "Georgian Bay",
    "golden-horseshoe": "Golden Horseshoe",
    "ontario-highlands": "Ontario Highlands",
    "northern-ontario": "Northern Ontario",
    "regina": "Regina",
    "eastern-saskatchewan": "Eastern Saskatchewan",
    "northern-saskatchewan": "Northern Saskatchewan",
    "western-saskatchewan": "Western Saskatchewan",
    "pembina-valley": "Pembina Valley",
    "westman": "Westman",
    "parkland": "Parkland",
    "northern-manitoba": "Northern Manitoba",
    "fredericton": "Fredericton",
    "southeast": "Southeast",
    "north": "North",
    "west-coast": "West Coast",
    "east-coast": "East Coast",
    "labrador": "Labrador",
    "mainland": "Mainland",
    "cape-breton": "Cape Breton",
    "central": "Central",
    "eastern": "Eastern",
    "whitehorse": "Whitehorse",
    "dawson": "Dawson",
    "watson-lake": "Watson Lake",
    "yellowknife": "Yellowknife"
  };

  // These two BC hills have no stored region. Canadian Rockies is the caption only.
  var REGION_GAP = {
    "unnamed-hill": "Canadian Rockies",
    "unnamed-hill-12": "Canadian Rockies"
  };

  var TYPES = {
    "downhill": "Downhill",
    "cross-country": "Cross-country"
  };

  function locationText(hill) {
    var named = hill.region && REGIONS[hill.region];
    if (named) return named;
    if (hill.province === "us" && hill.region && US_STATE_NAMES[hill.region]) return US_STATE_NAMES[hill.region];
    if (hill.province === "eu" && hill.region && EU_COUNTRY_NAMES[hill.region]) return EU_COUNTRY_NAMES[hill.region];
    return REGION_GAP[hill.slug] || "";
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

  function placeRow(parent, fields, y, startSize, alignRight) {
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
    var lead = 0;
    if (extra > 0) {
      if (alignRight) lead = extra;
      else if (widths.length) widths[0] += extra;
    }
    var x = lead;
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
    if (top.length) placeRow(cap, top, DRAW, 16, true);
    placeRow(cap, bottom, DRAW + BAND / 2, 20);
    svg.appendChild(cap);
    svg.setAttribute("viewBox", "0 0 " + SQUARE + " " + SQUARE);
    return SQUARE;
  }

  window.addEventListener("scroll", function () {
    if (scrollHold == null) return;
    if (window.scrollY !== scrollHold) window.scrollTo(window.scrollX, scrollHold);
  }, { passive: true });

  function hideLb() {
    var lb = document.getElementById("sh-lb");
    if (!lb || lb._closing) return;
    lb._closing = true;
    var track = lb.querySelector(".sh-track");
    if (track) {
      track.style.transition = "none";
      track.style.transform = "translateX(0)";
    }
    lb.classList.remove("sh-framed");
    var big = lb._svg;
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
      if (!document.getElementById("sh-lb")) {
        document.documentElement.classList.remove("sh-lb-open");
        scrollHold = null;
      }
      syncMock();
    }, 340);
    syncMock();
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
    if (card._hill && card._hill.slug) lb.setAttribute("data-sh-hill", card._hill.slug);
    loadContour(card);
    var big = drawingSvg(card._hill);
    big.removeAttribute("aria-hidden");
    var shift = fitArt(big, DRAW, card._hill && card._hill._bounds);
    writeCaption(big, card._hill);
    lb._shift = shift;
    if (card._contourLines) paintContours(big, card._contourLines, shift, false);
    var maxW = frameLimit();
    var maxH = window.innerHeight * 0.86 - (sideViews(card._hill) ? 112 : 72);
    var scale = Math.min(maxW / SQUARE, maxH / SQUARE);
    var px = (SQUARE * scale).toFixed(1) + "px";
    big.style.width = "100%";
    big.style.height = "100%";
    big.setAttribute("draggable", "false");
    if (scrollHold == null) scrollHold = window.scrollY;
    mountGallery(lb, big, card, px);
    document.body.appendChild(lb);
    document.documentElement.classList.add("sh-lb-open");
    if (card._hill && card._hill.stacked && card._hill._stackOn) applyStack(card._hill);
    refreshMockArt(card);
    fitFrameArt(lb);
    var r = big.getBoundingClientRect();
    if (r.width && thumb.width) {
      var s = Math.min(thumb.width / r.width, thumb.height / r.height);
      var dx = thumb.left + thumb.width / 2 - (r.left + r.width / 2);
      var dy = thumb.top + thumb.height / 2 - (r.top + r.height / 2);
      big.style.transition = "none";
      big.style.transform = "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px) scale(" + s.toFixed(4) + ")";
    }
    void big.offsetWidth;
    requestAnimationFrame(function () {
      if (lb._closing) return;
      window.scrollTo(window.scrollX, scrollHold);
      lb.classList.add("sh-lb-on");
      big.style.transition = "";
      big.style.transform = "none";
    });
    lb.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest(".sh-stage, .sh-edge, .sh-stack, .sh-cart-add, .sh-cart-btn, .sh-cart-panel")) return;
      closeLb();
    });
  }

  function finishHash(scroll) {
    var slug = slugFromHash();
    apply(scroll);
    var from = pendingFrom;
    pendingFrom = null;
    var card = slug ? document.getElementById(slug) : null;
    if (card && card.classList.contains("sh-hill") && card.querySelector("svg")) openLb(card, from);
    else hideLb();
  }

  function syncFromHash(scroll) {
    var slug = slugFromHash();
    var match = slug ? bySlug[slug] : null;
    if (match && match.province && match.province !== province) {
      rememberPlace();
      province = match.province;
      region = "all";
      if (province === "us") usaRegion = "all";
      else if (province === "eu") euRegion = "all";
      else if (province !== "all") {
        canadaProvince = province;
        canadaRegion = "all";
      }
      setPressed();
    }
    if (match && (!match._geom || !match._drawn)) {
      ensureDrawn(match).then(function () {
        if (slugFromHash() !== slug) return;
        finishHash(scroll);
      });
      apply(false);
      return;
    }
    finishHash(scroll);
  }

  function remember(hill) {
    if (byId[hill.id]) return byId[hill.id];
    hill._ord = hills.length;
    hills.push(hill);
    byId[hill.id] = hill;
    if (hill.slug) bySlug[hill.slug] = hill;
    return hill;
  }

  function adoptIndex(rows) {
    (rows || []).forEach(function (row) {
      if (!row || !row.id || byId[row.id]) return;
      var box = row.bounds;
      var hill = {
        id: row.id,
        slug: row.slug,
        name: row.name,
        region: row.region || null,
        province: row.province || "bc",
        lat: row.lat,
        lon: row.lon,
        type: row.type,
        catalog: row.catalog,
        _runCount: row.runs || 0,
        _bounds: box && box.length === 4 ? { minX: box[0], minY: box[1], maxX: box[2], maxY: box[3] } : null
      };
      if (row.popularBoost) hill.popularBoost = row.popularBoost;
      remember(hill);
      shell(hill);
    });
  }

  function adopt(data, overrides, index) {
    (data.hills || []).forEach(function (full) {
      if (!full.runs || !full.runs.length) return;
      if (!full.province) full.province = "bc";
      var hill = byId[full.id];
      if (hill && hill._geom) return;
      if (!hill) {
        hill = {
          id: full.id,
          slug: full.slug,
          name: full.name,
          region: full.region,
          province: full.province,
          lat: full.lat,
          lon: full.lon,
          type: full.type,
          _runCount: full.runs.length
        };
        remember(hill);
        shell(hill);
      }
      var bounds = hill._bounds;
      var ord = hill._ord;
      var el = hill.el;
      var catalog = hill.catalog;
      Object.keys(full).forEach(function (key) {
        hill[key] = full[key];
      });
      hill._bounds = bounds;
      hill._ord = ord;
      hill.el = el;
      if (catalog) hill.catalog = catalog;
      hill._runCount = full.runs.length;
      hill._geom = true;
      var row = overrides[full.id];
      if (row && row.name) hill.name = row.name;
      if (!hill.el) return;
      hill.el.setAttribute("aria-label", hill.name || "Unnamed hill");
      var label = hill.name || "Unnamed hill";
      var nameEl = hill.el.querySelector(".sh-hill-name");
      if (nameEl) nameEl.textContent = label;
      var captionEl = hill.el.querySelector(".sh-hill-caption");
      if (captionEl) captionEl.textContent = label;
    });
    Object.keys(index || {}).forEach(function (slug) {
      contourIndex[slug] = index[slug];
    });
  }

  function ensureCatalog(code) {
    if (catalogReady[code]) return Promise.resolve();
    if (catalogPromise[code]) return catalogPromise[code];
    var spec = catalogs[code];
    if (!spec) return Promise.resolve();
    var namesFetch = spec.names
      ? fetch(spec.names).then(function (res) {
          return res.ok ? res.json() : {};
        }).catch(function () { return {}; })
      : Promise.resolve({});
    catalogPromise[code] = Promise.all([
      fetch(spec.file).then(function (res) {
        if (!res.ok) throw new Error(code);
        return res.json();
      }),
      namesFetch,
      fetch(spec.index).then(function (res) {
        return res.ok ? res.json() : { hills: {} };
      }).catch(function () { return { hills: {} }; })
    ]).then(function (pair) {
      adopt(pair[0], pair[1] || {}, (pair[2] && pair[2].hills) || {});
      catalogReady[code] = true;
    }).catch(function () {
      catalogPromise[code] = null;
      if (count) count.textContent = "The " + spec.label + " drawings did not load.";
    });
    return catalogPromise[code];
  }

  function ensureCatalogs(codes) {
    return Promise.all(codes.map(function (code) { return ensureCatalog(code); }));
  }

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
    tip.textContent = dot.name || (dot.dataset && dot.dataset.name) || "";
    var r = dot.getBoundingClientRect ? dot.getBoundingClientRect() : {
      left: dot.x,
      top: dot.y,
      right: dot.x + (dot.w || 8),
      width: dot.w || 8,
      height: dot.h || 8
    };
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
    if (!shBasemap || !mapField || !(shBasemap.getLayer && shBasemap.getLayer("sh-dots"))) return null;
    var canvas = shBasemap.getCanvas && shBasemap.getCanvas();
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    var px = x - rect.left;
    var py = y - rect.top;
    var hits = [];
    try {
      hits = shBasemap.queryRenderedFeatures([[px - 8, py - 8], [px + 8, py + 8]], { layers: ["sh-dots"] });
    } catch (err) {
      return null;
    }
    if (!hits.length) return null;
    var feature = hits[0];
    var coords = feature.geometry && feature.geometry.coordinates;
    var point = coords ? shBasemap.project(coords) : { x: px, y: py };
    return {
      slug: feature.properties.slug,
      name: feature.properties.name,
      x: rect.left + point.x - 4,
      y: rect.top + point.y - 4,
      w: 8,
      h: 8
    };
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
    boundariesPromise = fetch("boundaries.json?v=20261018l").then(function (res) {
      if (!res.ok) throw new Error("boundaries");
      return res.json();
    }).then(function (data) {
      boundaries = data;
      warmBoundaryCache();
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

  function ringsFrom(prov, reg) {
    var bag = boundaries && boundaries[prov];
    if (!bag) return [];
    var ids = !reg || reg === "all" ? Object.keys(bag) : [reg];
    var rings = [];
    ids.forEach(function (id) {
      (bag[id] || []).forEach(function (ring) {
        if (ring && ring.length) rings.push(ring);
      });
    });
    return rings;
  }

  function canadaRings() {
    return CANADA_PROVINCES.reduce(function (rings, prov) {
      return rings.concat(ringsFrom(prov, "all"));
    }, []);
  }

  function selectedRings() {
    if (!boundaries) return [];
    if (province === "ca") return canadaRings();
    if (province === "all") {
      return PLACE_PROVINCES.reduce(function (rings, prov) {
        return rings.concat(ringsFrom(prov, "all"));
      }, []);
    }
    return ringsFrom(province, region);
  }

  function placeId() {
    if (province === "all") return "all|all";
    if (province === "ca") return "ca|all";
    return province + "|" + region;
  }

  function warmBoundaryCache() {
    if (!boundaries) return;
    function put(key, rings) {
      if (!rings.length || ringsByKey[key]) return;
      ringsByKey[key] = rings;
      boundsByKey[key] = boundsOfRings(rings);
    }
    PLACE_PROVINCES.forEach(function (prov) {
      var bag = boundaries[prov] || {};
      var all = [];
      Object.keys(bag).forEach(function (id) {
        var rings = bag[id] || [];
        all = all.concat(rings);
        put(prov + "|" + id, rings);
      });
      put(prov + "|all", all);
    });
    put("all|all", PLACE_PROVINCES.reduce(function (rings, prov) {
      return rings.concat(ringsFrom(prov, "all"));
    }, []));
    put("ca|all", canadaRings());
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

  function paintOutline() {
    if (!shBasemap || !boundaries) return false;
    if (!(shBasemap.isStyleLoaded && shBasemap.isStyleLoaded())) {
      waitOutline();
      return false;
    }
    var key = placeId();
    // Country-wide Canada, and every United States view, match Europe:
    // hill dots on the basemap, no hard boundary line. The fit still uses
    // the rings; they are not drawn. Canadian provinces keep their line.
    var rings = (key === "all|all" || key === "ca|all" || province === "us")
      ? []
      : (ringsByKey[key] || selectedRings());
    var data = {
      type: "FeatureCollection",
      features: rings.length ? [{
        type: "Feature",
        properties: {},
        geometry: { type: "MultiLineString", coordinates: rings }
      }] : []
    };
    var src = shBasemap.getSource("sh-outline");
    if (!src) {
      shBasemap.addSource("sh-outline", { type: "geojson", data: data });
      shBasemap.addLayer({
        id: "sh-outline",
        type: "line",
        source: "sh-outline",
        paint: {
          "line-color": "#1a1a1a",
          "line-width": 1.15,
          "line-opacity": 0.8
        }
      });
    } else {
      src.setData(data);
    }
    ensureDotLayer();
    return true;
  }

  function waitOutline() {
    if (outlineWait || !shBasemap || !shBasemap.once) return;
    outlineWait = true;
    shBasemap.once("idle", function () {
      outlineWait = false;
      if (view === "map") paintOutline();
    });
  }

  function europeBounds() {
    var west = Infinity;
    var south = Infinity;
    var east = -Infinity;
    var north = -Infinity;
    var n = 0;
    hills.forEach(function (hill) {
      if ((hill.province || "") !== "eu") return;
      if (region !== "all" && hill.region !== region) return;
      if (typeof hill.lat !== "number" || typeof hill.lon !== "number") return;
      n += 1;
      if (hill.lon < west) west = hill.lon;
      if (hill.lat < south) south = hill.lat;
      if (hill.lon > east) east = hill.lon;
      if (hill.lat > north) north = hill.lat;
    });
    if (!n) return [[-5.5, 43.2], [17.2, 47.6]];
    var padLon = Math.max((east - west) * 0.12, 0.45);
    var padLat = Math.max((north - south) * 0.12, 0.35);
    return [[west - padLon, south - padLat], [east + padLon, north + padLat]];
  }

  function openingBounds() {
    var box = boundsByKey[placeId()] || boundsOfRings(selectedRings());
    if (box) return box;
    if (province === "ca") return [[-141.0, 41.7], [-52.6, 83.2]];
    if (province === "all") return [[-141.2, 24.4], [-52.6, 65.6]];
    if (province === "us") return [[-125.0, 24.4], [-66.9, 49.5]];
    if (province === "eu") return europeBounds();
    if (province === "ab") return [[-120.1, 48.95], [-109.95, 60]];
    return [[-139.1, 48.2], [-114, 60.05]];
  }

  function fitPlace() {
    if (!shBasemap || !boundaries) return;
    var key = placeId();
    paintOutline();
    if (key === placeKey) return;
    var box = boundsByKey[key] || boundsOfRings(selectedRings());
    if (!box && province === "eu") box = openingBounds();
    if (!box) return;
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
    if (!mapField || !mapField.isConnected) return;
    mapField.classList.add("sh-map-in");
    ensureDotLayer();
  }

  function dotColor(type) {
    if (type === "downhill") return "#1a4f9c";
    if (type === "cross-country") return "#1b7a32";
    return "#111111";
  }

  function dotCollection() {
    var features = [];
    hills.forEach(function (hill) {
      if (typeof hill.lat !== "number" || typeof hill.lon !== "number") return;
      if (!onMap(hill)) return;
      features.push({
        type: "Feature",
        properties: {
          slug: hill.slug,
          name: hill.name || "Unnamed hill",
          fade: Number(dotFade(hill)),
          color: dotColor(hill.type)
        },
        geometry: { type: "Point", coordinates: [hill.lon, hill.lat] }
      });
    });
    return { type: "FeatureCollection", features: features };
  }

  function ensureDotLayer() {
    if (!shBasemap || !(shBasemap.isStyleLoaded && shBasemap.isStyleLoaded())) return;
    var data = dotCollection();
    var src = shBasemap.getSource("sh-dots");
    if (!src) {
      shBasemap.addSource("sh-dots", { type: "geojson", data: data });
      shBasemap.addLayer({
        id: "sh-dot-shadow",
        type: "circle",
        source: "sh-dots",
        paint: {
          "circle-radius": 5,
          "circle-color": "rgba(0, 0, 0, 0.35)",
          "circle-blur": 0.7,
          "circle-opacity": ["get", "fade"],
          "circle-translate": [0, 0.5]
        }
      });
      shBasemap.addLayer({
        id: "sh-dots",
        type: "circle",
        source: "sh-dots",
        paint: {
          "circle-radius": 4,
          "circle-color": ["get", "color"],
          "circle-opacity": ["get", "fade"],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-opacity": ["get", "fade"]
        }
      });
    } else {
      src.setData(data);
    }
    if (shBasemap.getLayer("sh-dot-shadow")) shBasemap.moveLayer("sh-dot-shadow");
    if (shBasemap.getLayer("sh-dots")) shBasemap.moveLayer("sh-dots");
  }

  function fadeCards(outward) {
    if (!grid) return;
    Array.prototype.forEach.call(grid.querySelectorAll(".sh-hill"), function (card) {
      if (card.hidden) return;
      (card.getAnimations ? card.getAnimations() : []).forEach(function (an) {
        if (an.id === "sh-card") an.cancel();
      });
      var anim = card.animate(
        outward
          ? [{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(0.84)" }]
          : [{ opacity: 0, transform: "scale(0.84)" }, { opacity: 1, transform: "none" }],
        { duration: outward ? 220 : 280, easing: outward ? "ease-in" : "ease-out", fill: "both" }
      );
      anim.id = "sh-card";
    });
  }

  function sizeMap() {
    if (!mapField) return;
    var width = mapField.clientWidth;
    if (width < 40) {
      var main = document.querySelector("main");
      width = (main && main.clientWidth) || 640;
    }
    var full = Math.max(640, Math.round(Math.max(280, width) * 100 / 120));
    var height = Math.round(full / 2);
    var phone = window.Shared && Shared.isPhone();
    var tablet = window.Shared && Shared.isTablet();
    if (phone) height = Math.round(height * 1.35);
    else if (!tablet) height = Math.round(height * 1.1);
    mapField.style.height = height + "px";
  }

  function onMapResize() {
    if (view !== "map" || !mapField) return;
    sizeMap();
    if (shBasemap) shBasemap.resize();
  }

  function syncMap() {
    if (view !== "map" || !mapField) return;
    ensureDotLayer();
    var matched = [];
    hills.forEach(function (hill) {
      if (typeof hill.lat !== "number" || typeof hill.lon !== "number") return;
      if (onMap(hill) && isShown(hill)) matched.push(hill);
    });
    var one = query && matched.length === 1 ? matched[0] : null;
    if (!one) {
      lastPan = "";
      mapAimed = "";
    } else {
      lastPan = one.slug;
      if (shBasemap && mapAimed !== one.slug) {
        mapAimed = one.slug;
        panTo(one);
      }
    }
    if (!boundaries) {
      ensureBoundaries().then(function () {
        if (view === "map") syncMap();
      }).catch(function () {});
      syncMock();
      return;
    }
    if (one) {
      paintOutline();
      if (!shBasemap) {
        syncMock();
        return;
      }
      placeKey = placeId();
      didFit = true;
      syncMock();
      return;
    }
    fitPlace();
    syncMock();
  }

  function tearDownMap() {
    cancelMapFade();
    showTip(null);
    outlineWait = false;
    if (shBasemap) {
      shBasemap.remove();
      shBasemap = null;
    }
    if (mapField && mapField.parentNode) mapField.parentNode.removeChild(mapField);
    mapField = null;
    placeKey = "";
    didFit = false;
    lastPan = "";
    mapAimed = "";
    mapZoomTarget = null;
    pinsHeld = false;
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
      showTip(null);
      var box = dot.getBoundingClientRect ? dot.getBoundingClientRect() : { left: dot.x, top: dot.y, width: dot.w || 8, height: dot.h || 8 };
      showHill(dot.slug || (dot.dataset && dot.dataset.slug), rectBox(box));
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
        revealMap();
      });
      map.on("move", function () {
        showTip(null);
      });
      map.on("moveend", syncMock);
    }).catch(function () {
      if (field._shToken === token) revealMap();
    });
  }

  function enterMap() {
    if (view === "map") return;
    view = "map";
    placeKey = "";
    didFit = false;
    lastPan = "";
    mapAimed = "";
    fadeCards(true);
    syncMapButton();
    syncMock();
    var token = ++mapToken;
    window.setTimeout(function () {
      if (token !== mapToken || view !== "map" || !grid) return;
      grid.classList.add("sh-held");
    }, 220);
    buildMapField();
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
    pinToken += 1;
    pinsHeld = false;
    view = "grid";
    mapToken += 1;
    var finish = function () {
      tearDownMap();
      if (grid) grid.classList.remove("sh-held");
      syncMapButton();
      if (animate !== false) fadeCards(false);
      syncMock();
    };
    if (animate !== false && mapField) window.setTimeout(finish, 180);
    else finish();
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
      if (btn.id === "sh-popular-btn") {
        popular = !popular;
        setPressed();
        apply(false);
        return;
      }
      var nextCountry = btn.getAttribute("data-sh-country");
      if (nextCountry) {
        if (nextCountry !== countryNow()) {
          rememberPlace();
          if (nextCountry === "all") {
            province = "all";
            region = "all";
          } else if (nextCountry === "us") {
            province = "us";
            region = usaRegion || "all";
          } else if (nextCountry === "eu") {
            province = "eu";
            region = euRegion || "all";
          } else {
            province = canadaProvince || "ca";
            region = province === "ca" ? "all" : (canadaRegion || "all");
          }
        }
        setPressed();
        loadPlace(function () {
          apply(false);
          requestAnimationFrame(syncStroke);
        });
        return;
      }
      var nextProvince = btn.getAttribute("data-sh-province");
      if (nextProvince) {
        province = nextProvince;
        region = "all";
        if (province !== "all" && province !== "us" && province !== "eu") {
          canadaProvince = province;
          canadaRegion = "all";
        }
        setPressed();
        loadPlace(function () {
          apply(false);
          requestAnimationFrame(syncStroke);
        });
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
      if (province === "us") usaRegion = region;
      else if (province === "eu") euRegion = region;
      else if (province !== "all") canadaRegion = region;
      setPressed();
      loadPlace(function () {
        apply(false);
        requestAnimationFrame(syncStroke);
      });
    });
  }

  if (grid) {
    grid.addEventListener("click", function (e) {
      var card = e.target.closest ? e.target.closest(".sh-hill") : null;
      if (!card) return;
      e.preventDefault();
      var svg = card.querySelector("svg");
      showHill(card.id, rectBox(svg ? svg.getBoundingClientRect() : card.getBoundingClientRect()));
    });
  }

  function showHill(slug, origin) {
    var y = window.scrollY;
    scrollHold = y;
    pendingFrom = origin || null;
    var want = "#" + slug;
    if (location.hash !== want) history.pushState(null, "", location.pathname + location.search + want);
    window.scrollTo(window.scrollX, y);
    syncFromHash(false);
  }

  window.addEventListener("hashchange", function () { syncFromHash(view !== "map"); });
  window.addEventListener("popstate", function () {
    scrollHold = window.scrollY;
    syncFromHash(false);
  });
  var CART_KEY = "shDemoCart";
  var SIZES = [
    { kind: "5x5", label: "5 x 5 in" },
    { kind: "10x10", label: "10 x 10 in" },
    { kind: "12x12", label: "12 x 12 in" },
    { kind: "20x20", label: "20 x 20 in" }
  ];

  function priceFor(kind) {
    var prices = window.SH_PRINTS && window.SH_PRINTS.prices;
    if (!prices || !Object.prototype.hasOwnProperty.call(prices, kind)) return null;
    return typeof prices[kind] === "number" ? prices[kind] : null;
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

  function bumpCart() {
    Array.prototype.forEach.call(document.querySelectorAll(".sh-cart-n"), function (node) {
      node.classList.remove("sh-bump");
      void node.offsetWidth;
      node.classList.add("sh-bump");
    });
  }

  function addHill(hill) {
    if (!hill) return;
    var items = readCart();
    var found = null;
    items.forEach(function (item) { if (item.slug === hill.slug) found = item; });
    if (found) found.qty = (found.qty || 1) + 1;
    else items.push({ key: hill.slug, slug: hill.slug, name: hill.name || "Unnamed hill", kind: "5x5", label: "5 x 5 in", qty: 1 });
    writeCart(items);
    bumpCart();
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
          if (next === "digital") row.label = "Digital download";
          else {
            var size = SIZES.filter(function (s) { return s.kind === next; })[0];
            row.label = size ? size.label : next;
          }
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

  function printsOn() {
    return !!(window.SH_PRINTS && window.SH_PRINTS.enabled === true);
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

  function mockCardSvg(hill) {
    var card = hill && hill.el;
    var svg = drawingSvg(hill);
    svg.setAttribute("class", "sh-card");
    var shift = fitArt(svg, DRAW, hill && hill._bounds);
    writeCaption(svg, hill);
    var raised = stackWanted(hill);
    var art = raised ? frontalArt(hill) : "";
    if (card && card._contourLines) paintContours(svg, card._contourLines, shift, raised && !art);
    if (raised && art) {
      mountFrontal(svg, art, hill);
      setPlanHidden(svg, true);
    }
    return svg;
  }

  function setFramed(lb, on) {
    if (!lb) return;
    var track = lb.querySelector(".sh-track");
    lb.classList.toggle("sh-framed", !!on);
    var mock = lb.querySelector(".sh-mock");
    if (mock) {
      mock.classList.toggle("sh-on", !!on);
      mock.setAttribute("aria-pressed", on ? "true" : "false");
    }
    if (!track) return;
    track.style.transition = "transform 400ms ease-out";
    track.style.transform = on ? "translateX(-50%)" : "translateX(0)";
  }

  function mountCartAdd(hill) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sh-cart-add";
    btn.setAttribute("aria-label", "Add to cart");
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7h12l-1.2 8H8.2L6 7z"/><path d="M6 7 4.6 4H2"/><circle cx="9" cy="18.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="16" cy="18.5" r="1.1" fill="currentColor" stroke="none"/><path d="M17.2 5.2h3.6M19 3.4v3.6"/></svg>';
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      addHill(hill);
    });
    return btn;
  }

  function mountEdges(lb, stage) {
    function arrow(cls, label, framed) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sh-edge " + cls;
      btn.setAttribute("aria-label", label);
      btn.innerHTML = framed
        ? '<svg viewBox="0 0 12 20" aria-hidden="true"><path d="M9 2 L3 10 L9 18" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        : '<svg viewBox="0 0 12 20" aria-hidden="true"><path d="M3 2 L9 10 L3 18" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      btn.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        e.stopPropagation();
      });
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        setFramed(lb, framed);
      });
      return btn;
    }
    stage.appendChild(arrow("sh-edge-next", "Show framed print", true));
    stage.appendChild(arrow("sh-edge-prev", "Show print", false));
    var coarse = window.matchMedia && window.matchMedia("(hover: none), (pointer: coarse)").matches;
    if (coarse) {
      stage.classList.add("sh-touch-hint");
      window.setTimeout(function () { stage.classList.remove("sh-touch-hint"); }, 1000);
    }
  }

  function fitFrameArt(lb) {
    if (!lb) return;
    var art = lb.querySelector(".sh-frame-art");
    if (!art) return;
    var w = art.clientWidth;
    if (!(w > 8)) return;
    art.style.height = w.toFixed(1) + "px";
    var svg = art.querySelector("svg");
    if (!svg) return;
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.setAttribute("width", String(Math.round(w)));
    svg.setAttribute("height", String(Math.round(w)));
    var plain = lb.querySelector(".sh-slide-plain svg");
    var fw = svg.clientWidth;
    var pw = plain ? plain.clientWidth : 0;
    if (fw > 8 && pw > 8) svg.style.setProperty("--sh-frame-scale", (fw / pw).toFixed(4));
  }

  function bindDrag(lb, stage) {
    var drag = null;
    stage.addEventListener("dragstart", function (e) { e.preventDefault(); });
    stage.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      var w = stage.clientWidth || 1;
      drag = {
        id: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        lastX: e.clientX,
        lastT: performance.now(),
        vx: 0,
        w: w,
        base: lb.classList.contains("sh-framed") ? -w : 0,
        active: false
      };
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    });
    stage.addEventListener("pointermove", function (e) {
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
        stage.classList.add("sh-dragging");
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
      stage.classList.remove("sh-dragging");
      if (!info.active) return;
      var dx = e.clientX - info.x0;
      var towardFrame = info.base === 0;
      var progress = towardFrame ? -dx / info.w : dx / info.w;
      var flick = Math.abs(dx) > 18 && (towardFrame ? info.vx < -0.45 : info.vx > 0.45);
      var snap = progress > 0.25 || flick;
      setFramed(lb, towardFrame ? snap : !snap);
    }
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);
  }

  function setPlanHidden(svg, hidden) {
    if (!svg) return;
    Array.prototype.forEach.call(svg.querySelectorAll(".sh-contours, .sh-run, .sh-lift"), function (node) {
      // The caption key uses the same run and lift classes as the plan drawing.
      // Hiding those would blank the coloured swatches in bird's eye view.
      if (node.closest && node.closest(".sh-caption")) return;
      if (hidden) node.setAttribute("display", "none");
      else node.removeAttribute("display");
    });
  }

  function clearFrontal(svg) {
    if (!svg) return;
    var old = svg.querySelector(".sh-frontal");
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var plate = svg.querySelector(".sh-frontal-plate");
    if (plate && plate.parentNode) plate.parentNode.removeChild(plate);
  }

  function mountFrontal(svg, markup, hill) {
    clearFrontal(svg);
    if (!svg || !markup) return;
    var doc = new DOMParser().parseFromString(markup, "image/svg+xml");
    var art = doc.querySelector(".sh-frontal-art");
    if (!art) return;
    var g = document.createElementNS(NS, "g");
    g.setAttribute("class", "sh-frontal");
    // The frontal file is already fitted to the caption band. Mounting it
    // 1:1 lets the topo meet the card edge; the old 0.88 scale left a white
    // gutter between the drawing and the dark lightbox.
    svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
    Array.prototype.forEach.call(art.childNodes, function (node) {
      if (node.nodeType === 1) g.appendChild(document.importNode(node, true));
    });
    var cap = svg.querySelector(".sh-caption");
    if (cap) {
      svg.insertBefore(g, cap);
      var plate = document.createElementNS(NS, "rect");
      plate.setAttribute("class", "sh-frontal-plate");
      plate.setAttribute("x", "0");
      plate.setAttribute("y", String(DRAW));
      plate.setAttribute("width", String(SQUARE));
      plate.setAttribute("height", String(BAND));
      plate.setAttribute("fill", "#fff");
      cap.insertBefore(plate, cap.firstChild);
    } else svg.appendChild(g);
  }

  function paintPlan(svg, hill, lines, shift) {
    clearFrontal(svg);
    setPlanHidden(svg, false);
    if (lines && shift) paintContours(svg, lines, shift, false);
  }

  function paintRaised(svg, hill, lines, shift) {
    if (lines && shift) paintContours(svg, lines, shift, false);
    mountFrontal(svg, frontalArt(hill), hill);
    setPlanHidden(svg, true);
  }

  function ensureFrontal(hill, done) {
    if (!hill) {
      done();
      return;
    }
    var url = frontalUrl(hill);
    hill._frontalCache = hill._frontalCache || {};
    hill._frontalFail = hill._frontalFail || {};
    if (hill._frontalCache[url] || hill._frontalFail[url]) {
      done();
      return;
    }
    if (hill._frontalLoadingUrl === url) {
      (hill._frontalWait = hill._frontalWait || []).push(done);
      return;
    }
    hill._frontalLoadingUrl = url;
    fetch(url).then(function (res) {
      if (!res.ok) throw new Error("frontal");
      return res.text();
    }).then(function (text) {
      if (text.indexOf("sh-frontal-art") < 0) throw new Error("frontal");
      hill._frontalCache[url] = text;
    }).catch(function () {
      hill._frontalFail[url] = true;
    }).then(function () {
      if (hill._frontalLoadingUrl === url) hill._frontalLoadingUrl = "";
      done();
      (hill._frontalWait || []).splice(0).forEach(function (fn) { fn(); });
    });
  }

  function applyStack(hill) {
    var card = hill && hill.el;
    var lb = document.getElementById("sh-lb");
    function paint() {
      var on = stackWanted(hill);
      var url = frontalUrl(hill);
      var art = on ? frontalArt(hill) : "";
      var failed = on && hill._frontalFail && hill._frontalFail[url];
      if (lb && card && lb._card === card && lb._svg && lb._shift) {
        if (on && art) paintRaised(lb._svg, hill, card._contourLines, lb._shift);
        else if (failed && card._contourLines) {
          clearFrontal(lb._svg);
          setPlanHidden(lb._svg, false);
          paintContours(lb._svg, card._contourLines, lb._shift, true);
        } else if (!on) paintPlan(lb._svg, hill, card._contourLines, lb._shift);
      }
      if (card) refreshMockArt(card);
      if (lb && card && lb._card === card && lb._syncSide) lb._syncSide();
    }
    if (stackWanted(hill) && !frontalArt(hill) && !(hill._frontalFail && hill._frontalFail[frontalUrl(hill)])) {
      ensureFrontal(hill, paint);
    } else paint();
  }

  function mountStackButton(hill) {
    var wrap = document.createElement("div");
    wrap.className = "sh-stack-btn";
    var group = document.createElement("div");
    group.className = "sh-stack";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "View");
    function side(label, bird) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sh-tag";
      btn.textContent = label;
      btn.setAttribute("aria-pressed", "false");
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!!hill._stackOn === bird) return;
        hill._stackOn = bird;
        sync();
        applyStack(hill);
      });
      return btn;
    }
    var plan = side("Plan view", false);
    var bird = side("Bird's eye view", true);
    var views = sideViews(hill);
    var sideRow = null;
    var sideBtns = [];
    if (views) {
      sideRow = document.createElement("div");
      sideRow.className = "sh-stack sh-side-btn";
      sideRow.setAttribute("role", "group");
      sideRow.setAttribute("aria-label", "Side");
      views.forEach(function (name) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "sh-tag";
        btn.textContent = name.charAt(0).toUpperCase() + name.slice(1);
        btn.setAttribute("aria-pressed", "false");
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (sideName(hill) === name && hill._stackOn) return;
          hill._side = name;
          if (!hill._stackOn) hill._stackOn = true;
          sync();
          applyStack(hill);
        });
        sideBtns.push(btn);
        sideRow.appendChild(btn);
      });
    }
    function sync() {
      var on = !!hill._stackOn;
      plan.classList.toggle("sh-on", !on);
      bird.classList.toggle("sh-on", on);
      plan.setAttribute("aria-pressed", on ? "false" : "true");
      bird.setAttribute("aria-pressed", on ? "true" : "false");
      if (sideRow) {
        var show = on;
        sideRow.hidden = !show;
        sideRow.classList.toggle("sh-side-on", show);
        var current = sideName(hill);
        sideBtns.forEach(function (btn, i) {
          var picked = views[i] === current;
          btn.classList.toggle("sh-on", picked);
          btn.setAttribute("aria-pressed", picked ? "true" : "false");
        });
      }
    }
    sync();
    group.appendChild(plan);
    group.appendChild(bird);
    wrap.appendChild(group);
    if (sideRow) wrap.appendChild(sideRow);
    wrap._sync = sync;
    return wrap;
  }

  function mountGallery(lb, big, card, px) {
    var hill = card._hill;
    lb._svg = big;
    var stage = document.createElement("div");
    stage.className = "sh-stage";
    stage.style.width = px;
    var track = document.createElement("div");
    track.className = "sh-track";
    var plain = document.createElement("div");
    plain.className = "sh-slide sh-slide-plain";
    var plainArt = document.createElement("div");
    plainArt.className = "sh-slide-art";
    plainArt.style.height = px;
    plainArt.appendChild(big);
    plain.appendChild(plainArt);
    var framed = document.createElement("div");
    framed.className = "sh-slide sh-slide-frame";
    var wall = document.createElement("div");
    wall.className = "sh-wall";
    wall.style.height = px;
    wall.innerHTML = '<div class="sh-hang"><div class="sh-mould"><div class="sh-mat"><div class="sh-frame-art"></div></div></div></div>';
    framed.appendChild(wall);
    track.appendChild(plain);
    track.appendChild(framed);
    stage.appendChild(track);
    mountEdges(lb, stage);
    var row = document.createElement("div");
    row.className = "sh-print-row";
    row.appendChild(stage);
    if (printsOn()) row.appendChild(mountCartAdd(hill));
    var view = document.createElement("div");
    view.className = "sh-view";
    view.appendChild(row);
    if (hill && hill.stacked) {
      var controls = mountStackButton(hill);
      lb._syncSide = controls._sync;
      view.appendChild(controls);
    }
    lb.appendChild(view);
    bindDrag(lb, stage);
    if (printsOn()) renderCart();
  }

  function refreshMockArt(card) {
    var lb = document.getElementById("sh-lb");
    if (!lb || lb._closing || !card || lb._card !== card || !card._hill) return;
    var slot = lb.querySelector(".sh-frame-art");
    if (!slot) return;
    var svg = mockCardSvg(card._hill);
    if (!svg) return;
    svg.setAttribute("draggable", "false");
    svg.style.width = "100%";
    svg.style.height = "100%";
    slot.replaceChildren(svg);
    fitFrameArt(lb);
  }

  function syncMock() {
    renderCart();
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

  function onIdle(fn) {
    if (window.requestIdleCallback) window.requestIdleCallback(fn, { timeout: 1500 });
    else window.setTimeout(fn, 400);
  }

  ensureCart();
  onIdle(function () { ensureBoundaries().catch(function () {}); });

  fetch("hill-index.json?v=20261022i").then(function (res) {
    if (!res.ok) throw new Error("index");
    return res.json();
  }).then(function (index) {
    watch = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var hill = entry.target._hill;
        if (!hill) return;
        if (hill._drawn) loadContour(entry.target);
        else ensureDrawn(hill);
      });
    }, { rootMargin: "120px" });
    adoptIndex(index.hills || []);
    setPressed();
    apply(false);
    loadPlace(function () {
      syncFromHash(true);
      requestAnimationFrame(syncStroke);
    });
  }).catch(function () {
    if (count) count.textContent = "The hill drawings did not load.";
  });
})();

/* Column sizer. Same ends, hysteresis, and scroll lock as Vacant. */
(function () {
  var COL_KEY = "shZoomCols";
  var MIN = 5;
  // Column count. 5 is the largest card; 7 is the smallest allowed.
  var MAX = 7;
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
    if (n > MAX) return MAX;
    return n >= MIN ? n : DEF;
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
