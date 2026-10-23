/* Ski Hills. Drawings are local. The map loads only after Map is opened. */
(function () {
  var grid = document.getElementById("sh-grid");
  var count = document.querySelector(".sh-count");
  var tags = document.querySelector(".sh-tags");
  var hills = [];
  var byId = Object.create(null);
  var bySlug = Object.create(null);
  var province = "all";
  var region = "all";
  var kind = "all";
  var popular = false;
  var query = "";
  var shownIds = null;
  var watch = null;
  var catalogs = {
    bc: {
      file: "hills.json?v=20261023e",
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
    ca: "20261023t",
    co: "20261023t",
    id: "20261023t",
    ma: "20261023t",
    md: "20261023t",
    me: "20261023t",
    mi: "20261023t",
    mt: "20261023t",
    nh: "20261023t",
    nj: "20261023t",
    nm: "20261023t",
    ny: "20261023t",
    or: "20261023t",
    pa: "20261023t",
    vt: "20261023t",
    wa: "20261023t",
    wi: "20261023t",
    wv: "20261023t",
    wy: "20261023t",
    mn: "20261023t",
    az: "20261023t",
    nv: "20261023t",
    sd: "20261023t",
    ut: "20261023t",
    ct: "20261023t",
    ri: "20261023t",
    va: "20261023t",
    oh: "20261023t",
    il: "20261023t",
    in: "20261023t",
    ia: "20261023t",
    nd: "20261023t",
    mo: "20261023t",
    nc: "20261023t",
    al: "20261023t",
    tn: "20261023t"
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
    fr: "20261023s",
    ch: "20261023s",
    at: "20261023s",
    it: "20261023s",
    no: "20261023s",
    se: "20261023s",
    fi: "20261023s",
    es: "20261023s",
    ad: "20261023s",
    rs: "20261023s",
    ua: "20261023s",
    sk: "20261023s",
    bg: "20261023s",
    de: "20261023s",
    cz: "20261023s"
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

  // France, Austria, Switzerland, and Italy are one file per hill.
  // A selected country still filters the list; each visible card fetches its own file.
  var SPLIT_EU = { fr: true, at: true, ch: true, it: true };

  // One province or one state. All, Canada, USA-wide, and Europe-wide stay
  // on the index until a card actually needs its drawing.
  function selectedCatalogs() {
    if (province === "all" || province === "ca") return [];
    if (province === "us") {
      if (region === "all") return [];
      return catalogs["us-" + region] ? ["us-" + region] : [];
    }
    if (province === "eu") {
      if (region === "all" || SPLIT_EU[region]) return [];
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

  function searchHay(hill) {
    var parts = [hill.name || ""];
    if (hill.province === "eu") {
      if (hill.admin) parts.push(hill.admin);
      if (hill.region && EU_COUNTRY_NAMES[hill.region]) parts.push(EU_COUNTRY_NAMES[hill.region]);
    } else if (hill.province === "us") {
      if (hill.range) parts.push(hill.range);
      parts.push("USA");
      parts.push("United States");
    }
    return fold(parts.join("\n"));
  }

  function matches(hill) {
    if (!query) {
      if (province === "ca") {
        if (!canadaHill(hill)) return false;
      } else if (province !== "all" && (hill.province || "bc") !== province) return false;
      if (province !== "all" && province !== "ca" && region !== "all" && hill.region !== region) return false;
    }
    if (kind !== "all" && hill.type !== kind) return false;
    if (query && searchHay(hill).indexOf(query) === -1) return false;
    return true;
  }

  function runTotal(hill) {
    if (hill.runs && hill.runs.length) return hill.runs.length;
    return hill._runCount || 0;
  }

  function liftTotal(hill) {
    if (hill.lifts && hill.lifts.length) return hill.lifts.length;
    var n = Number(hill.lift_count);
    if (!isFinite(n)) n = Number(hill._liftCount);
    return isFinite(n) ? n : 0;
  }

  function kmTotal(hill) {
    var km = Number(hill.total_km);
    if (!isFinite(km)) km = Number(hill.km);
    return isFinite(km) ? km : 0;
  }

  // Run count plus three times the lift count. Kilometres, then name,
  // break the ties. Captions still count runs on their own.
  function popularMetric(hill) {
    return runTotal(hill) + liftTotal(hill) * 3;
  }

  // Most popular will be driven by actual sales per item once sales
  // tracking is wired up. Until then this priority list leads the catalog.
  var TARGET_20_POPULAR_ORDER = [
    "whistler-blackcomb",
    "lake-louise-ski-area",
    "big-white-ski-resort",
    "banff-sunshine-village",
    "sun-peaks-resort",
    "revelstoke-mountain-resort",
    "fernie-alpine-resort",
    "silver-star-mountain-resort",
    "kicking-horse-resort",
    "red-mountain-resort",
    "panorama-mountain-resort",
    "cypress-mountain",
    "grouse-mountain",
    "whitewater-ski-resort",
    "marmot-basin",
    "kimberley-alpine-resort",
    "mt-norquay",
    "nakiska",
    "apex-mountain-resort",
    "mount-washington-alpine-resort",
    "castle-mountain-resort"
  ];
  var TARGET_20_RANK = {};
  TARGET_20_POPULAR_ORDER.forEach(function (slug, i) { TARGET_20_RANK[slug] = i; });

  function visibleHills() {
    var list = hills.filter(matches);
    if (!popular) return list;
    return list.slice().sort(function (a, b) {
      var ar = TARGET_20_RANK[a.slug];
      var br = TARGET_20_RANK[b.slug];
      var aSet = ar != null;
      var bSet = br != null;
      if (aSet || bSet) {
        if (!aSet) return 1;
        if (!bSet) return -1;
        return ar - br;
      }
      var score = popularMetric(b) - popularMetric(a);
      if (score) return score;
      var km = kmTotal(b) - kmTotal(a);
      if (km) return km;
      var name = (a.name || "").localeCompare(b.name || "");
      if (name) return name;
      return a._ord - b._ord;
    });
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
    if (query && searchHay(hill).indexOf(query) === -1) return false;
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
      // Row of cards. The name is the caption under the card.
      if (view === "grid") return;
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

  function splitEurope(hill) {
    return !!(hill && hill.province === "eu" && SPLIT_EU[hill.region]);
  }

  function ensureHillFile(hill) {
    if (hill._geom) return Promise.resolve();
    if (hill._filePromise) return hill._filePromise;
    var spec = catalogs[catalogCode(hill)];
    hill._filePromise = Promise.all([
      fetch("europe/" + hill.region + "/" + hill.slug + ".json?v=20261023s").then(function (res) {
        if (!res.ok) throw new Error(hill.slug);
        return res.json();
      }),
      ensureIndex(spec && spec.index)
    ]).then(function (pair) {
      var data = pair[0];
      if (!data || !data.runs) throw new Error(hill.slug);
      adopt({ hills: [data] }, {}, (pair[1] && pair[1].hills) || {});
      if (!hill._geom) throw new Error(hill.slug);
    }).catch(function (err) {
      hill._filePromise = null;
      throw err;
    });
    return hill._filePromise;
  }

  function ensureDrawn(hill) {
    if (!hill || hill._drawn) return Promise.resolve(hill);
    if (hill._drawPromise) return hill._drawPromise;
    var ready = splitEurope(hill) ? ensureHillFile(hill) : ensureCatalog(catalogCode(hill));
    hill._drawPromise = ready.then(function () {
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
    return "frontal/" + file + ".svg?v=20261023v";
  }

  function frontalArt(hill) {
    var url = frontalUrl(hill);
    return (hill._frontalCache && hill._frontalCache[url]) || "";
  }

  function paintContours(svg, lines, shift, stack, treeWash) {
    if (!svg) return;
    var old = svg.querySelector(".sh-contours");
    if (old) old.parentNode.removeChild(old);
    var oldClip = svg.querySelector("clipPath.sh-frame");
    if (oldClip && oldClip.parentNode) oldClip.parentNode.removeChild(oldClip);
    Array.prototype.forEach.call(svg.querySelectorAll(".sh-plan-tree-fade"), function (node) {
      if (node.parentNode) node.parentNode.removeChild(node);
    });
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
    if (treeWash) {
      var wash = document.createElementNS(NS, "g");
      wash.setAttribute("class", "sh-plan-tree-wash");
      var path = document.createElementNS(NS, "path");
      path.setAttribute("d", treeWash);
      var scaleTo = shift.s == null ? 1 : shift.s;
      var dx = shift.dx || 0;
      var dy = shift.dy || 0;
      path.setAttribute("transform", "translate(" + dx + " " + dy + ") scale(" + scaleTo + ")");
      path.setAttribute("fill", "#3a6b42");
      path.setAttribute("fill-opacity", "0.10");
      path.setAttribute("fill-rule", "evenodd");
      path.setAttribute("stroke", "none");
      wash.appendChild(path);
      g.appendChild(wash);
    }
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
    fetch("contours/" + card.id + ".json?v=20261023u").then(function (res) {
      if (!res.ok) throw new Error("contour");
      return res.json();
    }).then(function (data) {
      card._contourState = "in";
      card._contourLines = data.lines || [];
      card._treeWash = data.treeWash || "";
      paintContours(card.querySelector("svg"), card._contourLines, card._shift || { dx: 0, dy: 0, clip: SQUARE }, false, card._treeWash);
      var lb = document.getElementById("sh-lb");
      if (lb && lb._card === card && lb._shift && lb._svg) {
        if (stackWanted(card._hill)) applyStack(card._hill);
        else paintContours(lb._svg, card._contourLines, lb._shift, false, card._treeWash);
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
    if (hill.province === "eu") return hill.admin || "";
    if (hill.province === "us") return hill.range || "";
    var named = hill.region && REGIONS[hill.region];
    if (named) return named;
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
    var sizes = fields.map(function (field) { return field.size || startSize; });
    var widths = [];
    function measure() {
      return fields.map(function (field, i) {
        var sz = sizes[i];
        var valueW = field.keys ? keysWidth(field.keys, sz) : textWidth(field.text, sz);
        return Math.max(labelWidth(field.label), valueW) + inset * 2;
      });
    }
    widths = measure();
    function usedWidth() {
      return widths.reduce(function (sum, w) { return sum + w; }, 0);
    }
    while (usedWidth() > SQUARE) {
      var max = 0;
      sizes.forEach(function (sz) { if (sz > max) max = sz; });
      if (max <= 12) break;
      sizes = sizes.map(function (sz) { return sz === max ? sz - 1 : sz; });
      widths = measure();
    }
    var extra = SQUARE - usedWidth();
    var lead = 0;
    if (extra > 0) {
      if (alignRight) lead = extra;
      else if (widths.length) widths[0] += extra;
    }
    var x = lead;
    var valueY = y + rowH - 16;
    fields.forEach(function (field, i) {
      var size = sizes[i];
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
    var loc = locationText(hill);
    var gps = gpsText(hill);
    hairline(cap, 0, DRAW, SQUARE, DRAW);
    hairline(cap, 0, DRAW + BAND / 2, SQUARE, DRAW + BAND / 2);
    placeRow(cap, [{ label: "NAME", text: hill.name || "Unnamed hill", size: 20 }].concat(top), DRAW, 16);
    var second = [];
    if (loc) second.push({ label: "REGION", text: loc, size: 20 });
    var country = hill.province === "us" ? "USA" : hill.province === "eu" ? ((hill.region && EU_COUNTRY_NAMES[hill.region]) || "") : "Canada";
    if (country) second.push({ label: "COUNTRY", text: country, size: 20 });
    if (gps) second.push({ label: "GPS", text: gps, size: 20 });
    if (second.length) placeRow(cap, second, DRAW + BAND / 2, 20);
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
    var big = lb._svg;
    if (big) big.style.transform = "none";
    lb.classList.add("sh-lb-closing");
    lb.classList.remove("sh-lb-on");
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
    var name = card.querySelector(".sh-hill-name");
    var lb = document.createElement("div");
    lb.id = "sh-lb";
    lb.className = "sh-lb";
    lb.setAttribute("role", "dialog");
    lb.setAttribute("aria-modal", "true");
    lb.setAttribute("aria-label", name ? name.textContent : "Ski hill");
    lb._card = card;
    if (card._hill && card._hill.slug) lb.setAttribute("data-sh-hill", card._hill.slug);
    loadContour(card);
    var big = drawingSvg(card._hill);
    big.removeAttribute("aria-hidden");
    var shift = fitArt(big, DRAW, card._hill && card._hill._bounds);
    writeCaption(big, card._hill);
    lb._shift = shift;
    if (card._contourLines) paintContours(big, card._contourLines, shift, false, card._treeWash);
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
    if (lb._svg && card._hill && card._hill._treesOn) lb._svg.classList.add("sh-trees-on");
    if (card._hill && card._hill.stacked && card._hill._stackOn) applyStack(card._hill);
    refreshMockArt(card);
    fitFrameArt(lb);
    big.style.transform = "none";
    requestAnimationFrame(function () {
      if (lb._closing) return;
      window.scrollTo(window.scrollX, scrollHold);
      lb.classList.add("sh-lb-on");
      big.style.transform = "none";
    });
    lb.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest(".sh-stage, .sh-edge, .sh-stack, .sh-stack-btn, .sh-labels-toggle, .sh-trees-toggle, .sh-cart-add, .sh-cart-btn, .sh-cart-panel")) return;
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
        admin: row.admin || "",
        range: row.range || "",
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

  var indexReady = {};

  function ensureIndex(url) {
    if (!url) return Promise.resolve({ hills: {} });
    if (indexReady[url]) return indexReady[url];
    indexReady[url] = fetch(url).then(function (res) {
      return res.ok ? res.json() : { hills: {} };
    }).catch(function () { return { hills: {} }; });
    return indexReady[url];
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
      ensureIndex(spec.index)
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
    // Country-wide Canada, a Canadian province or region, and every
    // United States view match Europe: hill dots on the basemap, no hard
    // boundary line. The fit still uses the rings; they are not drawn.
    var rings = (
      key === "all|all" || key === "ca|all" || province === "us" ||
      CANADA_PROVINCES.indexOf(province) !== -1
    ) ? [] : (ringsByKey[key] || selectedRings());
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

  function useAllRegions() {
    if (province === "all" && region === "all") return;
    rememberPlace();
    province = "all";
    region = "all";
    setPressed();
  }

  var find = document.querySelector(".sh-find");
  if (find) {
    find.addEventListener("focus", function () {
      useAllRegions();
      apply(false);
    });
    find.addEventListener("click", function () {
      useAllRegions();
      apply(false);
    });
    find.addEventListener("input", function () {
      useAllRegions();
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
    if (card && card._contourLines) paintContours(svg, card._contourLines, shift, raised && !art, card._treeWash);
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
    if (lines && shift) paintContours(svg, lines, shift, false, hill && hill.el && hill.el._treeWash);
    if (svg && hill) svg.classList.toggle("sh-trees-on", !!hill._treesOn);
  }

  function paintRaised(svg, hill, lines, shift) {
    if (lines && shift) paintContours(svg, lines, shift, false, hill && hill.el && hill.el._treeWash);
    mountFrontal(svg, frontalArt(hill), hill);
    setPlanHidden(svg, true);
    if (svg && hill) svg.classList.toggle("sh-trees-on", !!hill._treesOn);
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
          paintContours(lb._svg, card._contourLines, lb._shift, true, card._treeWash);
        } else if (!on) paintPlan(lb._svg, hill, card._contourLines, lb._shift);
      }
      if (card) refreshMockArt(card);
      if (lb && card && lb._card === card && lb._syncSide) lb._syncSide();
    }
    if (stackWanted(hill) && !frontalArt(hill) && !(hill._frontalFail && hill._frontalFail[frontalUrl(hill)])) {
      ensureFrontal(hill, paint);
    } else paint();
  }

  var TREE_SLUGS = {
    "whistler-blackcomb": 1,
    "lake-louise-ski-area": 1,
    "big-white-ski-resort": 1,
    "banff-sunshine-village": 1,
    "sun-peaks-resort": 1,
    "revelstoke-mountain-resort": 1,
    "fernie-alpine-resort": 1,
    "silver-star-mountain-resort": 1,
    "kicking-horse-resort": 1,
    "red-mountain-resort": 1,
    "panorama-mountain-resort": 1,
    "cypress-mountain": 1,
    "grouse-mountain": 1,
    "whitewater-ski-resort": 1,
    "marmot-basin": 1,
    "mount-washington-alpine-resort": 1,
    "nakiska": 1,
    "kimberley-alpine-resort": 1,
    "castle-mountain-resort": 1,
    "apex-mountain-resort": 1,
    "mt-bachelor": 1
  };

  var TREE_OVERLAY_SLUGS = {
    "3-zinnen-dolomites-dobbiaco-san-candido-braies-sesto-alta-pusteria": 1,
    "4-vallees-verbier-la-tzoumaz-nendaz-veysonnaz-thyon": 1,
    "49-north-mountain-resort": 1,
    "99-mile-recreation-trails": 1,
    "adelboden-lenk": 1,
    "afton-alps": 1,
    "aletsch-arena": 1,
    "allison-chinook-cross-country-ski-trails-crowsnest-pass": 1,
    "alpe-d-huez-grand-domaine": 1,
    "alpine-ski-club": 1,
    "alpine-valley": 1,
    "alpine-valley-resort": 1,
    "alpine-valley-ski-area": 1,
    "alta-badia": 1,
    "alta-sierra-ski-resort": 1,
    "andermatt-disentis-sedrun": 1,
    "angel-fire-resort": 1,
    "antelope-butte": 1,
    "anthony-lakes-mountain-resort": 1,
    "antoine-mountain": 1,
    "anzere": 1,
    "apex-mountain-resort": 1,
    "appalachian-mountain-ski-area": 1,
    "aprica": 1,
    "arabba": 1,
    "aramon-cerler": 1,
    "arapahoe-basin": 1,
    "are": 1,
    "areches-beaufort": 1,
    "argyll-park": 1,
    "arizona-snowbowl": 1,
    "arosa-lenzerheide": 1,
    "artesina": 1,
    "ascutney-outdoors": 1,
    "asessippi-ski-area-and-resort": 1,
    "aspen-heights": 1,
    "aspen-highlands": 1,
    "aspen-mountain": 1,
    "aspen-snowmass": 1,
    "attitash-mountain-resort": 1,
    "auron": 1,
    "ausblick-ski-hill": 1,
    "avoriaz": 1,
    "ax-3-domaines": 1,
    "axamer-lizum-muttereralm": 1,
    "bad-kleinkirchheim": 1,
    "badger-mountain-ski-area": 1,
    "badger-pass-ski-area": 1,
    "baker-mountain-ski-area": 1,
    "bald-mountain-ski-area": 1,
    "banff-sunshine-village": 1,
    "bansko": 1,
    "bear-canyon": 1,
    "bear-creek-mountain-resort-ski-slopes": 1,
    "bear-mountain": 1,
    "bear-mountain-nordic-ski-trails": 1,
    "bear-mountain-ski-hill": 1,
    "bear-paw-ski-bowl": 1,
    "bear-valley": 1,
    "beartown-ski-area": 1,
    "beaver-creek": 1,
    "beaver-mountain": 1,
    "beaver-valley": 1,
    "beech-mountain-resort": 1,
    "belalp": 1,
    "belle-neige": 1,
    "belleayre-mountain-ski-center": 1,
    "bellows-falls-ski-tow": 1,
    "belvedere-col-rodella-passo-pordoi": 1,
    "ben-eoin": 1,
    "berkshire-east-ski-resort": 1,
    "big-bam": 1,
    "big-bar-cross-country-ski-trails-2": 1,
    "big-bear-ski-resort": 1,
    "big-boulder-ski-resort-area": 1,
    "big-creek-ski-area": 1,
    "big-moose-mountain-ski-area": 1,
    "big-powderhorn-mountain-resort": 1,
    "big-rock-mountain": 1,
    "big-sky-resort": 1,
    "big-white-ski-resort": 1,
    "birchwood-trail-system": 1,
    "bittersweet": 1,
    "black-jack-ski-club": 1,
    "black-mountain": 1,
    "black-mountain-of-maine": 1,
    "black-river-basin": 1,
    "blacktail-mountain-ski-area": 1,
    "blizzard-mountain": 1,
    "blue-hills-ski-area": 1,
    "blue-knob": 1,
    "blue-mountain-resort": 1,
    "blue-mountain-ski-resort": 1,
    "bluewood": 1,
    "bogus-basin-mountain-recreation-area": 1,
    "bolton-valley-resort": 1,
    "boreal-mountain-resort": 1,
    "bormio-ski": 1,
    "borovets": 1,
    "boston-mills-ski-resort": 1,
    "bottineau-winter-park": 1,
    "bousquet-mountain": 1,
    "boyce-park-ski-area": 1,
    "boyne-highlands-resort": 1,
    "boyne-mountain": 1,
    "brandnertal-brand-burserberg": 1,
    "brandywine-ski-resort": 1,
    "brantling-ski-slopes": 1,
    "brattleboro-ski-hill": 1,
    "breckenridge": 1,
    "bretton-woods-ski-area": 1,
    "brevent-flegere-chamonix": 1,
    "brian-head-resort": 1,
    "bridger-bowl": 1,
    "brighton-resort": 1,
    "brimacombe": 1,
    "bristol-mountain-ski-resort": 1,
    "bromley-mountain-ski-resort": 1,
    "bromont-montagne-d-experience": 1,
    "bruce-mound-winter-sports-area": 1,
    "brundage-mountain": 1,
    "bryce-resort": 1,
    "buck-hill": 1,
    "buena-vista-ski-area": 1,
    "buffalo-ski-club": 1,
    "bukowina": 1,
    "bulkley-valley-nordic-centre": 1,
    "bull-mountain-ski-trail-recreation-site": 1,
    "burke-mountain-resort": 1,
    "buttermilk": 1,
    "bydalsfjallen": 1,
    "caberfae-peaks": 1,
    "calabogie-peaks": 1,
    "caledon-ski-club": 1,
    "caledonia-nordic-ski-center": 1,
    "camden-snow-bowl": 1,
    "camelback-mountain-resort": 1,
    "camp-10": 1,
    "camp-ethan-allen": 1,
    "camp-fortune": 1,
    "camp-mercier": 1,
    "campgaw-mountain-ski-area": 1,
    "campiglio-dolomiti-di-brenta": 1,
    "campton-mountain": 1,
    "camrose-nordic-centre": 1,
    "canaan-valley-ski-resort": 1,
    "candy-mountain-ski-area": 1,
    "canmore-nordic-centre": 1,
    "cannon-mountain": 1,
    "cannonsburg-ski-area": 1,
    "canyon-ski-resort-ski-red-deer": 1,
    "cascade-mountain": 1,
    "castle-mountain-resort": 1,
    "cataloochee-ski-area": 1,
    "catamount-mountain-resort": 1,
    "cazenovia-ski-club": 1,
    "cedar-pass": 1,
    "centre-de-ski-le-relais": 1,
    "centre-de-ski-mont-bechervaise": 1,
    "centre-dexcellence-acrobatique-de-val-saint-come": 1,
    "champery-les-crosets-champoussin-morgins": 1,
    "chamrousse": 1,
    "chapman-hill-recreation-area": 1,
    "chaserrugg-alt-st-johann": 1,
    "cherry-peak-ski-area": 1,
    "chestnut-mountain-resort": 1,
    "china-peak-mountain-resort": 1,
    "china-ridge-trails": 1,
    "chipmunk-ski-hill": 1,
    "christie-mountain-ski-area": 1,
    "christmas-mountain": 1,
    "claviere": 1,
    "clearwater-demonstration-forest-recreation-site": 1,
    "clearwater-ski-hill": 1,
    "cloudmont-ski-hill": 1,
    "cochran-s-ski-area": 1,
    "cockaigne-ski-resort": 1,
    "coffee-mill": 1,
    "cooper-spur-ski-area": 1,
    "copper-mountain": 1,
    "coppervale": 1,
    "cortina-d-ampezzo": 1,
    "cortina-tofane": 1,
    "corviglia": 1,
    "cottonwood-butte-ski-hill": 1,
    "courchevel": 1,
    "courmayeur": 1,
    "crabbe-mountain": 1,
    "craigleith-ski-club": 1,
    "cranmore-mountain-resort": 1,
    "cranor-hill-municipal-ski-hill": 1,
    "crans-montana": 1,
    "crescent-hill": 1,
    "crested-butte-mountain-resort": 1,
    "crotched-mountain-ski-ride": 1,
    "crystal-mountain-michigan": 1,
    "crystal-mountain-washington": 1,
    "crystal-ridge-rock-snowpark": 1,
    "crystella-ski-hill": 1,
    "cuchara-mountain-resort": 1,
    "cypress-mountain": 1,
    "dakota-ridge-recreation-site": 1,
    "damuls": 1,
    "dartmouth-skiway": 1,
    "dawn-mountain-nordic": 1,
    "deer-mountain-village": 1,
    "deer-valley-resort": 1,
    "detroit-mountain": 1,
    "devil-s-elbow": 1,
    "devil-s-glen-country-club": 1,
    "devil-s-head-ski-area": 1,
    "devoluy": 1,
    "devon": 1,
    "diamond-peak": 1,
    "discovery-ski-area": 1,
    "disentis-muster": 1,
    "dodge-ridge-ski-area": 1,
    "domaine-skiable-chamrousse": 1,
    "domaine-skiable-valberg": 1,
    "donner-ski-ranch": 1,
    "double-h-ranch-hidden-valley": 1,
    "drayton-valley": 1,
    "drei-zinnen-tre-cime-drei-zinnen-tre-cime": 1,
    "dry-hill-ski-area": 1,
    "duck-mountain-provincial-park-cross-country-ski-trails": 1,
    "dutch-henry-ski-hill": 1,
    "eagle-point": 1,
    "eagle-rock-ski-resort": 1,
    "eastlink-park": 1,
    "echo-mountain": 1,
    "echo-valley-ski-area": 1,
    "edmonton-ski-club": 1,
    "eldora": 1,
    "elk-mountain-ski-resort": 1,
    "emery-park": 1,
    "espace-diamant": 1,
    "espace-haute-maurienne-vanoise": 1,
    "espace-liberte": 1,
    "espace-lumiere": 1,
    "estacio-d-esqui-baqueira-beret": 1,
    "estacion-de-esqui-y-montana-de-sierra-nevada": 1,
    "evasion-mont-blanc": 1,
    "fairmont-hot-springs": 1,
    "fairview-ski-hill": 1,
    "ferguson-ridge-ski-area": 1,
    "fernie-alpine-resort": 1,
    "fernie-golf-course": 1,
    "flachau": 1,
    "flumserberg": 1,
    "folgaria-area-sciistica-folgaria": 1,
    "folgarida-marilleva": 1,
    "foothills-cross-country-ski-trails": 1,
    "foret-blanche-vars-risoul": 1,
    "formigal": 1,
    "fort-nelson-demonstration-forest-recreation-site": 1,
    "fortress-mountain-resort": 1,
    "four-lakes-village": 1,
    "fox-hill-ski-area": 1,
    "freesports-arena-dachstein-krippenstein": 1,
    "frost-fire-park": 1,
    "galibier-thabor": 1,
    "georgian-peaks-club": 1,
    "giants-ridge-resort": 1,
    "goldbar-park-including-goldstick-park-riverside-golf-course-and-capilano-park": 1,
    "gore-mountain": 1,
    "granby-ranch": 1,
    "grand-targhee-resort": 1,
    "grand-tourmalet": 1,
    "grandvalira": 1,
    "granite-gorge-ski-area": 1,
    "granite-peak-ski-area": 1,
    "great-bear-recreation-park": 1,
    "great-divide-ski-area": 1,
    "greek-peak-mountain-resort": 1,
    "green-mountain": 1,
    "grindelwald-first": 1,
    "grindelwald-wengen-kleine-scheidegg-mannlichen": 1,
    "groarltal-dorfgastein": 1,
    "grouse-mountain": 1,
    "gstaad-saanen-rougemont": 1,
    "gunstock-recreation-area": 1,
    "gwynne-valley": 1,
    "hallis-lake-ski-trails": 1,
    "harper-mountain": 1,
    "hart-highlands": 1,
    "hatley-pointe": 1,
    "heavenly-mountain-resort": 1,
    "heiliger-huegel-ski-club": 1,
    "hemsedal-skisenter": 1,
    "hermon-mountain": 1,
    "hesperus-ski-area": 1,
    "hickory-hills": 1,
    "hickory-ski-center": 1,
    "hidden-valley": 1,
    "hidden-valley-resort": 1,
    "hidden-valley-ski-resort": 1,
    "hinterstoder": 1,
    "hintertuxer-gletscher": 1,
    "hinton-nordic-centre": 1,
    "hochkonig": 1,
    "hochoetz-kuhtai": 1,
    "hochzillertal-hochfugen": 1,
    "hogadon-basin-ski-area": 1,
    "holiday-mountain": 1,
    "holiday-mountain-ny": 1,
    "holiday-valley": 1,
    "holimont": 1,
    "homewood-ski-area": 1,
    "hoodoo-ski-area": 1,
    "horseshoe-valley-resort": 1,
    "hudson-bay-mountain": 1,
    "hudson-s-hope-portage-mountain": 1,
    "huff-hills-ski-resort": 1,
    "hunt-hollow-ski-club": 1,
    "hunter-mountain": 1,
    "hurricane-ridge": 1,
    "hyland-hills-ski-area": 1,
    "isola-2000": 1,
    "jack-frost-mountain-resort": 1,
    "jackson-hole-mountain-resort": 1,
    "jasna-low-tatras": 1,
    "jay-peak-resort": 1,
    "jiminy-peak-resort": 1,
    "june-mountain": 1,
    "kals-matrei": 1,
    "kamiskotia": 1,
    "kananaskis-lakes-cross-country-ski-trails": 1,
    "kanc-recreation-area": 1,
    "kane-valley-cross-country-ski-trails": 1,
    "kaprun-kitzsteinhorn-maiskogel": 1,
    "katschberg-aineck": 1,
    "kelly-canyon-ski-resort": 1,
    "kettlebowl": 1,
    "kewaunee-county-winter-park": 1,
    "keyes-peak-ski-area": 1,
    "keystone": 1,
    "kicking-horse-resort": 1,
    "killington-resort": 1,
    "kimberley-alpine-resort": 1,
    "kinosoo-ridge": 1,
    "kinsmen-park": 1,
    "kirkwood-mountain-resort": 1,
    "kissing-bridge": 1,
    "kitzski": 1,
    "klausberg-skiarena": 1,
    "kleinwalsertal-oberstdorf": 1,
    "kopaonik": 1,
    "kreischberg": 1,
    "kronplatz-plan-de-corones-kronplatz-plan-de-corones": 1,
    "la-clusaz": 1,
    "la-molina": 1,
    "la-plagne": 1,
    "la-rosiere": 1,
    "la-thuile-ski": 1,
    "laax": 1,
    "labrador-mountain": 1,
    "lake-city-ski-hill": 1,
    "lake-louise-ski-area": 1,
    "larch-hills-nordic-ski-trails": 1,
    "latemar-dolomites": 1,
    "laurel-mountain-ski-resort": 1,
    "le-grand-bornand": 1,
    "le-grand-domaine": 1,
    "le-grand-massif": 1,
    "le-lioran": 1,
    "le-massif": 1,
    "le-sauze-1400-le-super-sauze-1700": 1,
    "le-valinouet": 1,
    "leavenworth-ski-hill": 1,
    "lech-zurs": 1,
    "lee-canyon": 1,
    "les-7-laux": 1,
    "les-arcs": 1,
    "les-contamines": 1,
    "les-deux-alpes": 1,
    "les-gets-morzine": 1,
    "les-grands-montets": 1,
    "les-karellis": 1,
    "les-menuires": 1,
    "les-orres": 1,
    "les-portes-du-mont-blanc": 1,
    "les-portes-du-soleil": 1,
    "les-sybelles": 1,
    "les-trois-vallees": 1,
    "levin-hiihtokeskus-levi-ski-resort": 1,
    "liberty-mountain-resort": 1,
    "little-mac": 1,
    "little-prairie-community-forest-ski-trails": 1,
    "little-ski-hill": 1,
    "little-smoky-ski-area": 1,
    "little-switzerland": 1,
    "livigno": 1,
    "loch-lomond": 1,
    "locust-lake-village-ski-hill": 1,
    "log-cabin-cross-country-ski-trails": 1,
    "logan-lake-trails": 1,
    "lonesome-pine-trails": 1,
    "long-lake": 1,
    "lookout-pass": 1,
    "loon-mountain-resort": 1,
    "lost-trail": 1,
    "loup-loup-ski-bowl": 1,
    "loveland-basin-ski-area": 1,
    "loveland-valley-ski-area": 1,
    "lutsen-mountains": 1,
    "lyndon-outing-club": 1,
    "mad-river-glen": 1,
    "mad-river-mountain": 1,
    "madawaska-mountain": 1,
    "magic-mountain-resort": 1,
    "magic-mountain-ski-area": 1,
    "mammoth-mountain": 1,
    "manning-park-resort": 1,
    "manning-ski-hill": 1,
    "mansfield-ski-club": 1,
    "maple-ski-ridge": 1,
    "marble-mountain": 1,
    "mark-arendz-provincial-ski-park-at-brookvale": 1,
    "marmot-basin": 1,
    "marquette-mountain": 1,
    "masella": 1,
    "massanutten-resort": 1,
    "maverick-mountain-ski-area": 1,
    "mayrhofen-hippach": 1,
    "mccauley-mountain-ski-area": 1,
    "mcculloch-cross-country-ski-trails-recreation-site": 1,
    "mcintyre-ski-area": 1,
    "mckinney-nordic-ski-club": 1,
    "meadowlark-ski-area": 1,
    "meany-lodge": 1,
    "medicine-lodge-ski-area": 1,
    "megeve": 1,
    "meiringen-hasliberg": 1,
    "meribel": 1,
    "middlebury-college-snow-bowl": 1,
    "minnedosa-ski-valley": 1,
    "misery-mountain-ski-hill": 1,
    "missaukee-mountain": 1,
    "mission-ridge": 1,
    "mission-ridge-2": 1,
    "mistahiya": 1,
    "misty-ridge": 1,
    "mohawk-mountain-ski-area": 1,
    "monarch-mountain": 1,
    "mont-adstock": 1,
    "mont-belu": 1,
    "mont-cascades-ski": 1,
    "mont-castor": 1,
    "mont-du-lac": 1,
    "mont-edouard": 1,
    "mont-farlagne": 1,
    "mont-gleason": 1,
    "mont-grand-fonds": 1,
    "mont-habitant": 1,
    "mont-kanasuta": 1,
    "mont-lac-vert": 1,
    "mont-orford": 1,
    "mont-orignal": 1,
    "mont-ripley-ski-area": 1,
    "mont-sainte-anne": 1,
    "mont-ste-marie": 1,
    "mont-sutton": 1,
    "mont-tremblant-resort-station-mont-tremblant": 1,
    "montage-mountain-ski-area": 1,
    "montana-snowbowl": 1,
    "monterosa-ski": 1,
    "montgenevre": 1,
    "moose-mountain": 1,
    "morrice-mountain-nordic-ski-area": 1,
    "mount-abram": 1,
    "mount-ashland": 1,
    "mount-bohemia": 1,
    "mount-cain-alpine-park": 1,
    "mount-greylock-ski-club": 1,
    "mount-jefferson-ski-area": 1,
    "mount-joy": 1,
    "mount-kato-ski-area": 1,
    "mount-lemmon-ski-valley": 1,
    "mount-maichen-watson-lake": 1,
    "mount-peter": 1,
    "mount-pisgah-ski-center": 1,
    "mount-pleasant-of-edinboro": 1,
    "mount-prospect-ski-tow": 1,
    "mount-rose-ski-tahoe": 1,
    "mount-sima": 1,
    "mount-ski-gull": 1,
    "mount-snow": 1,
    "mount-southington-ski-area": 1,
    "mount-st-louis-moonstone": 1,
    "mount-sunapee": 1,
    "mount-timothy": 1,
    "mount-washington-alpine-resort": 1,
    "mount-waterman": 1,
    "mount-zion-ski-area": 1,
    "mountain-creek": 1,
    "mountain-green": 1,
    "mountain-high": 1,
    "mt-ashwabay": 1,
    "mt-bachelor": 1,
    "mt-baker": 1,
    "mt-baldy": 1,
    "mt-baldy-family-ski-area": 1,
    "mt-brighton": 1,
    "mt-eustis": 1,
    "mt-holiday": 1,
    "mt-holly-ski-snowboard-resort": 1,
    "mt-hood-meadows-ski-resort": 1,
    "mt-hood-skibowl": 1,
    "mt-la-crosse": 1,
    "mt-mcsauba": 1,
    "mt-norquay": 1,
    "mt-seymour": 1,
    "mt-shark": 1,
    "mt-shasta-ski-park": 1,
    "mt-spokane": 1,
    "mulligan-s-hollow": 1,
    "murray-ridge": 1,
    "murren-schilthorn": 1,
    "mystery-mountain": 1,
    "mystic-mountain-ski-area": 1,
    "nakiska": 1,
    "nashoba-valley-ski-area": 1,
    "nassfeld-mokrine": 1,
    "nauders-bergkastel": 1,
    "nechako-valley-sporting-association-trail-system": 1,
    "nelson-nordic": 1,
    "newcomb-ski-slope": 1,
    "nickel-plate-cross-country-ski-trails-recreation-site": 1,
    "nipika": 1,
    "nitehawk": 1,
    "nordic-mountain": 1,
    "nordic-valley-resort-wolf-mountain": 1,
    "north-south-ski-bowl": 1,
    "northeast-slopes": 1,
    "northern-lights-ski-club": 1,
    "northstar-at-tahoe-resort": 1,
    "norway-mountain-ski-resort": 1,
    "nub-s-nob": 1,
    "nutt-hill": 1,
    "oak-mountain-ski-center": 1,
    "ober-mountain": 1,
    "obergurgl-hochgurgl": 1,
    "obersaxen": 1,
    "obertauern": 1,
    "oglebay-ski-and-snowboard-area": 1,
    "okemo-mountain": 1,
    "omnecia-ski-club": 1,
    "onion-lake-snow-valley-nordic": 1,
    "orcieres-merlette": 1,
    "osler-bluff-ski-club": 1,
    "otis-ridge": 1,
    "otsego-club": 1,
    "owl-s-head": 1,
    "pajarito-mountain": 1,
    "pal-arinsal": 1,
    "palisades-tahoe-alpine-meadows": 1,
    "palisades-tahoe-olympic-valley": 1,
    "panorama-mountain-resort": 1,
    "paoli-peaks": 1,
    "paradiski": 1,
    "parc-du-mont-comi": 1,
    "park-city-mountain-resort": 1,
    "parsenn": 1,
    "pass-powderkeg-ski": 1,
    "pats-peak": 1,
    "paul-bunyan": 1,
    "paulson-x-c-castlegar-nordic": 1,
    "pebble-creek": 1,
    "peek-n-peak-ski-area": 1,
    "perfect-north-slopes": 1,
    "peyragudes": 1,
    "phoenix-mountain": 1,
    "phoenix-nordic-marshall-lake": 1,
    "pico-mountain-resort": 1,
    "pila-ski": 1,
    "pin-rouge": 1,
    "pine-creek-ski-area": 1,
    "pine-knob-ski-snowboard-resort": 1,
    "pine-mountain-ski-hill": 1,
    "pinnacle-ski-club": 1,
    "pitztaler-gletscher": 1,
    "pizol": 1,
    "planai-hochwurzen": 1,
    "plattekill-mountain-ski-area": 1,
    "pleasant-mountain": 1,
    "pocono-ranch-lands-ski-mountain": 1,
    "poley-mountain-ski-area": 1,
    "pomerelle-mountain-resort": 1,
    "ponte-di-legno-passo-tonale": 1,
    "porcupine-mountains-winter-sports-complex": 1,
    "powder-king-mountain-resort": 1,
    "powder-mills-park": 1,
    "powder-mountain-ski-resort": 1,
    "powder-ridge": 1,
    "powder-ridge-ski-area": 1,
    "powderhorn": 1,
    "powderhouse-hill-ski-area": 1,
    "powers-bluff": 1,
    "pra-loup-1600": 1,
    "praz-de-lys-sommand": 1,
    "purden-ski-village": 1,
    "purgatory-resort": 1,
    "puy-saint-vincent": 1,
    "rabbit-hill-snow-resort": 1,
    "ragged-mountain-resort": 1,
    "red-hill-outing-club": 1,
    "red-lodge-mountain": 1,
    "red-mountain-resort": 1,
    "red-river-ski-area": 1,
    "revelstoke-mountain-resort": 1,
    "revelstoke-nordic-mount-macpherson": 1,
    "ribbon-creek": 1,
    "ridin-hy": 1,
    "riserva-bianca": 1,
    "roccaraso-rivisondoli": 1,
    "rotarun-ski-area": 1,
    "rotary-pembina-nordic-community-trails-north-trail-system": 1,
    "roundtop-mountain-resort": 1,
    "royal-mountain": 1,
    "saas-fee": 1,
    "saddleback-mountain": 1,
    "saint-lary": 1,
    "saint-luc-chandolin": 1,
    "salen": 1,
    "salmo-ski-area": 1,
    "san-martino-di-castrozza-passo-rolle": 1,
    "sandia-peak-ski-area": 1,
    "sapphire-valley-ski-resort": 1,
    "saskadena-six": 1,
    "sasquatch-mountain-resort": 1,
    "sauze-d-oulx": 1,
    "savognin": 1,
    "saw-creek-estates-ski-area": 1,
    "schladming-dachstein": 1,
    "schmittenhohe-zell-am-see": 1,
    "schonried-saanenmoser-zweisimmen-st-stephan": 1,
    "schuss-mountain": 1,
    "schweitzer-mountain-resort": 1,
    "scuol-motta-naluns": 1,
    "sea-to-sky-gondola": 1,
    "see": 1,
    "seiser-alm-mont-de-seuc-alpe-di-siusi-seiser-alm-alpe-di-siusi-mont-de-seuc": 1,
    "serfaus-fiss-ladis": 1,
    "serre-chevalier": 1,
    "sestriere": 1,
    "seven-oaks": 1,
    "seven-springs-mountain-resort": 1,
    "shames-mountain": 1,
    "shawnee-mountain": 1,
    "showdown": 1,
    "sierra-at-tahoe-ski-resort": 1,
    "silver-mountain-resort": 1,
    "silver-star-mountain-resort": 1,
    "silver-summit": 1,
    "silverton-mountain": 1,
    "silvretta-arena-ischgl-samnaun": 1,
    "silvretta-montafon": 1,
    "sipapu-ski-and-summer-resort": 1,
    "sir-sam-s": 1,
    "sitzmark-ski-hill": 1,
    "skaneateles-ski-club": 1,
    "ski-apache": 1,
    "ski-area-san-pellegrino-falcade": 1,
    "ski-arlberg": 1,
    "ski-bradford": 1,
    "ski-brule": 1,
    "ski-butternut": 1,
    "ski-callaghan": 1,
    "ski-chantecler": 1,
    "ski-civetta": 1,
    "ski-cloudcroft": 1,
    "ski-cooper": 1,
    "ski-de-fond-mont-tremblant": 1,
    "ski-garceau": 1,
    "ski-gastein-schlossalm-angertal-stubnerkogel": 1,
    "ski-juwel-alpbachtal-wildschonau": 1,
    "ski-la-reserve": 1,
    "ski-lakeridge": 1,
    "ski-martock": 1,
    "ski-mont-blanc": 1,
    "ski-montcalm": 1,
    "ski-morin-heights": 1,
    "ski-quechee": 1,
    "ski-santa-fe": 1,
    "ski-sawmill-family-resort": 1,
    "ski-sundown": 1,
    "ski-ward": 1,
    "ski-wentworth": 1,
    "skiarea-valchiavenna-madesimo-campodolcino": 1,
    "skicircus-saalbach-hinterglemm-leogang-fieberbrunn": 1,
    "skigebiet-damuls-mellau": 1,
    "skigebiet-damuls-mellau-faschina": 1,
    "skigebiet-diedamskopf": 1,
    "skigebiet-garmisch-classic": 1,
    "skipisten-titlis-bergbahnen": 1,
    "skiresort-cerna-hora-pec": 1,
    "skiwelt-wilder-kaiser-brixental": 1,
    "sky-tavern": 1,
    "skytops-ski-hill": 1,
    "sleeping-giant-winter-sports-area": 1,
    "sleepy-hollow-sports-park": 1,
    "smokey-mountain-ski-club": 1,
    "smugglers-notch-resort": 1,
    "snow-creek": 1,
    "snow-king-mountain": 1,
    "snow-ridge": 1,
    "snow-snake-ski-resort": 1,
    "snow-space-salzburg": 1,
    "snow-summit": 1,
    "snow-trails": 1,
    "snow-valley-mountain-resort": 1,
    "snow-valley-ski-club": 1,
    "snow-valley-ski-resort": 1,
    "snowbasin-resort": 1,
    "snowhaven": 1,
    "snowshoe-mountain": 1,
    "snowy-range": 1,
    "soda-springs": 1,
    "solden": 1,
    "soldier-mountain-ski-area": 1,
    "solitude-mountain-resort": 1,
    "sommet-edelweiss": 1,
    "sommet-olympia": 1,
    "sommet-saint-sauveur": 1,
    "song-mountain-resort": 1,
    "sorenberg": 1,
    "souris-strider-ski-club": 1,
    "sovereign-lake-nordic-club": 1,
    "spirit-mountain": 1,
    "spring-lake": 1,
    "spring-mountain-ski-area": 1,
    "spruce-mountain-ski-slope": 1,
    "st-anton-st-christoph-stuben": 1,
    "stake-lake-trails": 1,
    "station-de-ski-mont-miller": 1,
    "station-touristique-du-massif-du-sud": 1,
    "station-touristique-stoneham": 1,
    "station-touristique-val-saint-come": 1,
    "steamboat-ski-resort": 1,
    "steeplechase-ski-snowboard": 1,
    "stevens-pass": 1,
    "stokely-creek-lodge": 1,
    "storrs-hill-ski-area": 1,
    "stowe-mountain-resort": 1,
    "strathcona-wilderness-centre": 1,
    "stratton-mountain-resort": 1,
    "stubai": 1,
    "stubaier-gletscher": 1,
    "sugar-bowl-resort": 1,
    "sugar-mountain-resort": 1,
    "sugarbush-resort": 1,
    "sugarloaf": 1,
    "sugarloaf-provincial-park": 1,
    "sulden": 1,
    "summit-lake-ski-snowboard-area": 1,
    "summit-mountain": 1,
    "summit-west": 1,
    "sun-peaks-resort": 1,
    "sun-valley-bald-mountain": 1,
    "sun-valley-dollar-mountain": 1,
    "sunburst-ski-area": 1,
    "sundance-resort": 1,
    "sunday-river": 1,
    "sundown-mountain-resort": 1,
    "sunlight-mountain-resort": 1,
    "sunridge-ski-area": 1,
    "sunrise-park-resort": 1,
    "super-besse": 1,
    "swain-ski-snowboard-resort": 1,
    "swiss-valley-ski-lodge": 1,
    "table-mountain-regional-park": 1,
    "tabor-mountain": 1,
    "tahoe-donner-downhill-ski-area": 1,
    "tamarack-resort": 1,
    "taos-ski-valley": 1,
    "tawaitnaw-cross-country-ski-trails": 1,
    "telemark-cross-country-ski-trails-recreation-site": 1,
    "telluride-ski-area": 1,
    "tenney-mountain-resort": 1,
    "terry-peak-ski-area": 1,
    "teton-pass-ski-resort": 1,
    "the-duck": 1,
    "the-heights-ski-country-club": 1,
    "the-hideout": 1,
    "the-homestead": 1,
    "the-homestead-ski-area": 1,
    "the-mountain-top-at-grand-geneva-resort-spa": 1,
    "three-summits": 1,
    "thrill-hills": 1,
    "thunder-ridge": 1,
    "thunderhill-ski-area": 1,
    "tignes-val-d-isere": 1,
    "timber-ridge": 1,
    "timber-ridge-ski-area": 1,
    "timberline-lodge-ski-area": 1,
    "timberline-mountain": 1,
    "titcomb-mountain": 1,
    "titus-mountain": 1,
    "treetops-sylvan-resort": 1,
    "tri-town-ski-and-snowboard-village": 1,
    "troll-resort": 1,
    "trollhaugen-ski-area": 1,
    "trysil": 1,
    "turner-mountain": 1,
    "tussey-mountain": 1,
    "twin-farms-ski-hill": 1,
    "tyrol-basin-ski-and-snowboard-area": 1,
    "unterbach-eischoll": 1,
    "utah-olympic-park": 1,
    "vail": 1,
    "val-bialas-ski-center": 1,
    "val-cenis": 1,
    "val-d-allos-la-foux": 1,
    "val-d-irene": 1,
    "val-di-fassa": 1,
    "val-neigette": 1,
    "val-thorens": 1,
    "val-thorens-orelle": 1,
    "valfrejus": 1,
    "vallee-bleue": 1,
    "valley-ski-hill": 1,
    "valmorel": 1,
    "veterans-memorial-ski-area": 1,
    "victor-constant-ski-area": 1,
    "victoria-park": 1,
    "villa-olivia": 1,
    "villa-roma-ski-area": 1,
    "villard-de-lans-correncon": 1,
    "villars-gryon-les-diablerets": 1,
    "vista-ridge": 1,
    "wachusett-mountain-ski-area": 1,
    "wagrain": 1,
    "wapiti": 1,
    "wapiti-nordic-ski-trails": 1,
    "wapiti-valley": 1,
    "warner-canyon-ski-area": 1,
    "warth-schrocken": 1,
    "waterlily-lake-trails": 1,
    "waterville-valley-resort": 1,
    "welch-village": 1,
    "west-bragg-creek-cross-country-ski-and-snowshoe-trails": 1,
    "west-mountain-ski-resort": 1,
    "whaleback-mountain": 1,
    "whispering-pines": 1,
    "whistler-blackcomb": 1,
    "whistler-cross-country-connection": 1,
    "white-butte-cross-country-ski-trails": 1,
    "white-hills": 1,
    "white-pass-ski-area": 1,
    "white-pine-resort": 1,
    "whitecap-mountain": 1,
    "whiteface-mountain-ski-center": 1,
    "whitefish-mountain-resort": 1,
    "whitetail-resort": 1,
    "whitewater-ski-resort": 1,
    "wild-mountain": 1,
    "wildcat-mountain": 1,
    "wildhaus": 1,
    "wildkogel": 1,
    "willamette-pass": 1,
    "willard-mountain": 1,
    "wilmot-mountain": 1,
    "winsport-canada-olympic-park": 1,
    "winter-park-resort": 1,
    "wintergreen": 1,
    "wintergreen-ski-resort": 1,
    "winterplace-ski-resort": 1,
    "wisp-resort": 1,
    "wolf-creek-ski-area": 1,
    "wolverine-ski-trails": 1,
    "woods-valley": 1,
    "woodward": 1,
    "woodwind-park": 1,
    "wostawea-killarney-lake-park-nordic-pulse": 1,
    "yawgoo-valley-ski-area": 1,
    "yellowknife-ski-club": 1,
    "zauchensee-flachauwinkl": 1,
    "zermatt-breuil-cervinia-breuil-cervinia-ski-paradise": 1,
    "zillertal-arena": 1,
    "zinal-grimentz": 1
  };

  function hasTreeOverlay(hill) {
    if (!hill || !hill.slug) return false;
    if (TREE_OVERLAY_SLUGS[hill.slug]) return true;
    return !!(hill.el && hill.el._treeWash);
  }

  function mountStackButton(hill) {
    var wrap = document.createElement("div");
    wrap.className = "sh-stack-btn";
    var group = document.createElement("div");
    group.className = "sh-stack";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "View");
    function viewToggle(label) {
      var wrap = document.createElement("label");
      wrap.className = "sh-view-toggle";
      var box = document.createElement("input");
      box.type = "checkbox";
      box.className = "sh-view-check";
      var text = document.createElement("span");
      text.textContent = label;
      wrap.appendChild(box);
      wrap.appendChild(text);
      wrap.addEventListener("click", function (e) {
        e.stopPropagation();
      });
      return { wrap: wrap, box: box };
    }
    var plan = viewToggle("Plan view");
    var bird = viewToggle("Bird's eye view");
    plan.box.addEventListener("change", function () {
      if (!plan.box.checked) {
        plan.box.checked = true;
        return;
      }
      if (!hill._stackOn) return;
      hill._stackOn = false;
      sync();
      applyStack(hill);
    });
    bird.box.addEventListener("change", function () {
      if (!bird.box.checked) {
        bird.box.checked = true;
        return;
      }
      if (hill._stackOn) return;
      hill._stackOn = true;
      sync();
      applyStack(hill);
    });
    var trees = null;
    var treesBox = null;
    if (hasTreeOverlay(hill)) {
      if (hill._treesOn == null) hill._treesOn = true;
      trees = document.createElement("label");
      trees.className = "sh-trees-toggle";
      treesBox = document.createElement("input");
      treesBox.type = "checkbox";
      treesBox.className = "sh-trees-check";
      treesBox.checked = !!hill._treesOn;
      var treesText = document.createElement("span");
      treesText.textContent = "Trees";
      trees.appendChild(treesBox);
      trees.appendChild(treesText);
      trees.addEventListener("click", function (e) {
        e.stopPropagation();
      });
      treesBox.addEventListener("change", function () {
        hill._treesOn = !!treesBox.checked;
        var lb = document.getElementById("sh-lb");
        if (lb && lb._svg) lb._svg.classList.toggle("sh-trees-on", !!hill._treesOn);
        refreshMockArt(hill.el);
      });
    }
    var views = sideViews(hill);
    var sideRow = null;
    var sideBtns = [];
    if (views) {
      sideRow = document.createElement("div");
      sideRow.className = "sh-stack sh-side-btn";
      sideRow.setAttribute("role", "group");
      sideRow.setAttribute("aria-label", "Side");
      views.forEach(function (name) {
        var sideToggle = viewToggle(name.charAt(0).toUpperCase() + name.slice(1));
        sideToggle.box.addEventListener("change", function () {
          if (!sideToggle.box.checked) {
            sideToggle.box.checked = true;
            return;
          }
          if (sideName(hill) === name && hill._stackOn) return;
          hill._side = name;
          if (!hill._stackOn) hill._stackOn = true;
          sync();
          applyStack(hill);
        });
        sideBtns.push(sideToggle.box);
        sideRow.appendChild(sideToggle.wrap);
      });
    }
    function sync() {
      var on = !!hill._stackOn;
      plan.box.checked = !on;
      bird.box.checked = on;
      if (treesBox) treesBox.checked = !!hill._treesOn;
      if (sideRow) {
        var show = on;
        sideRow.hidden = !show;
        sideRow.classList.toggle("sh-side-on", show);
        var current = sideName(hill);
        sideBtns.forEach(function (box, i) {
          box.checked = views[i] === current;
        });
      }
    }
    sync();
    group.appendChild(plan.wrap);
    group.appendChild(bird.wrap);
    wrap.appendChild(group);
    if (sideRow) wrap.appendChild(sideRow);
    if (trees) wrap.appendChild(trees);
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
    if (card._hill && card._hill._treesOn) svg.classList.add("sh-trees-on");
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

  fetch("hill-index.json?v=20261023t").then(function (res) {
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
