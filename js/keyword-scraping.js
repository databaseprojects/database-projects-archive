/* Keyword scrapings. Add a later keyword as another group with its own tag. */
(function () {
  var BASE = "https://res.cloudinary.com/vtyvhdpv/image/upload/";
  var SCRAPINGS = [
    {
      tag: "ghost",
      caption: "Vancouver, captured 2026-10-10",
      href: "https://vancouver.craigslist.org/search/sss?query=ghost",
      strips: [
        { file: "v1791697440/craigslist-ghost/01a-results-ghost-writer.png", w: 472, h: 26, posted: "2026-10-09", city: "Delta/Surrey/Langley", price: "$15", category: "vinyl record" },
        { file: "v1791697443/craigslist-ghost/01b-results-ghost-bath.png", w: 335, h: 26, posted: "2026-10-09", city: "Delta/Surrey/Langley", price: "$10", category: "vinyl record" },
        { file: "v1791697444/craigslist-ghost/01c-results-ghost-stories.png", w: 583, h: 26, posted: "2026-10-09", city: "Delta/Surrey/Langley", price: "$25", category: "vinyl record" },
        { file: "v1791697445/craigslist-ghost/01d-results-ghost-project.png", w: 542, h: 26, posted: "2026-10-09", city: "Vancouver", price: "$35", category: "book" },
        { file: "v1791697445/craigslist-ghost/01e-results-halloween-ghosts.png", w: 368, h: 26, posted: "2026-10-08", city: "West Vancouver", price: "$75", category: "Halloween decor" }
      ]
    },
    {
      tag: "ghost",
      caption: "Vancouver, 2026-10-02",
      href: "https://www.craigslist.org/view/d/vancouver-your-movers-arrive-on-time-or/nr2NMhjCV7owDVswNfKmut",
      strips: [
        { file: "v1791697446/craigslist-ghost/02a-movers-title.png", w: 401, h: 26, posted: "2026-10-02", city: "Vancouver", category: "moving services" },
        { file: "v1791697446/craigslist-ghost/02b-movers-snippet.png", w: 217, h: 25, posted: "2026-10-02", city: "Vancouver", category: "moving services" }
      ]
    },
    {
      tag: "ghost",
      caption: "Tacoma WA, about 2026-10-02",
      href: "https://www.craigslist.org/view/d/tacoma-dont-ghost-your-dream-home-move/9ENDEnxyJUD8NQh5y8w4c4",
      strips: [
        { file: "v1791697447/craigslist-ghost/03-dream-home-title.png", w: 577, h: 26, posted: "about 2026-10-02", city: "Tacoma WA", price: "$2,895/mo", category: "3br apartment rental" }
      ]
    },
    {
      tag: "ghost",
      caption: "Tacoma WA",
      href: "https://www.craigslist.org/view/d/tacoma-this-bed-bath-is-too-good-to/1XiqRDzgBpQtzW6LVYMmnb",
      strips: [
        { file: "v1791697448/craigslist-ghost/04-too-good-to-ghost-title.png", w: 605, h: 43, posted: "date unknown", city: "Tacoma WA", price: "$2,125/mo", category: "1br apartment rental" }
      ]
    },
    {
      tag: "ghost",
      caption: "North Vancouver, 2026-10-02",
      href: "https://www.craigslist.org/view/d/north-vancouver-commercial-ghost/nfwnoMksNizcaCCpTqbCYs",
      strips: [
        { file: "v1791697448/craigslist-ghost/05a-ghost-kitchen-title.png", w: 601, h: 26, posted: "2026-10-02", city: "North Vancouver", price: "$599/mo", category: "commercial kitchen rental" },
        { file: "v1791697449/craigslist-ghost/05b-ghost-kitchen-snippet.png", w: 300, h: 24, posted: "2026-10-02", city: "North Vancouver", price: "$599/mo", category: "commercial kitchen rental" }
      ]
    },
    {
      tag: "ghost",
      caption: "Tacoma WA, about 2026-10-06",
      href: "https://www.craigslist.org/view/d/tacoma-multiple-snakes-available/33bRt5Vhh9VZqyt3mmTHZH",
      strips: [
        { file: "v1791697450/craigslist-ghost/06a-snakes-title.png", w: 240, h: 24, posted: "about 2026-10-06", city: "Tacoma WA", category: "pets (snakes)" },
        { file: "v1791697450/craigslist-ghost/06b-lemon-ghost-snippet.png", w: 135, h: 23, posted: "about 2026-10-06", city: "Tacoma WA", category: "pets (snakes)" }
      ]
    }
  ];

  var TURNS = [-0.9, 1.1, -0.4, 1.3, -1.2, 0.6, -1.0, 0.8, -0.5, 1.4, -1.1, 0.3, 0.7];
  var SHIFTS = [0, 6, 3, 9, 2, 7, 1, 8, 4, 5, 10, 2, 6];

  function formatDates(text) {
    return String(text).replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, function (_, y, m, d) {
      return m + "-" + d + "-" + y;
    });
  }

  function linesFor(strip) {
    var lines = [formatDates(strip.posted), strip.city];
    if (strip.price) lines.push(strip.price);
    lines.push(strip.category);
    return lines;
  }

  function tagsInOrder() {
    var seen = {};
    var tags = [];
    SCRAPINGS.forEach(function (group) {
      if (!group.tag || seen[group.tag]) return;
      seen[group.tag] = true;
      tags.push(group.tag);
    });
    return tags;
  }

  var active = tagsInOrder()[0] || "";
  var stage = document.getElementById("ks-groups");
  var tagBox = document.getElementById("ks-tags");
  var pose = 0;

  function renderTags() {
    tagBox.textContent = "";
    tagsInOrder().forEach(function (tag) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "ks-tag" + (tag === active ? " ks-on" : "");
      button.textContent = tag;
      button.setAttribute("aria-pressed", tag === active ? "true" : "false");
      button.addEventListener("click", function () {
        active = tag;
        renderTags();
        renderGroups();
      });
      tagBox.appendChild(button);
    });
  }

  function renderGroups() {
    pose = 0;
    stage.textContent = "";
    SCRAPINGS.forEach(function (group) {
      if (group.tag !== active) return;
      var block = document.createElement("section");
      block.className = "ks-group";
      var stack = document.createElement("div");
      stack.className = "ks-stack";
      group.strips.forEach(function (strip) {
        var i = pose++;
        var button = document.createElement("button");
        button.type = "button";
        button.className = "ks-cut";
        button.style.setProperty("--r", TURNS[i % TURNS.length] + "deg");
        button.style.setProperty("--x", SHIFTS[i % SHIFTS.length] + "px");
        var lines = linesFor(strip);
        button.dataset.card = lines.join("\n");
        var img = document.createElement("img");
        img.src = BASE + strip.file;
        img.alt = lines.join(", ");
        img.decoding = "async";
        img.style.setProperty("--ks-w", (strip.w / 2) + "px");
        img.width = Math.round(strip.w / 2);
        img.height = Math.round(strip.h / 2);
        button.appendChild(img);
        stack.appendChild(button);
      });
      var cap = document.createElement("p");
      cap.className = "ks-cap";
      var link = document.createElement("a");
      link.href = group.href;
      link.rel = "noopener noreferrer";
      link.textContent = formatDates(group.caption);
      cap.appendChild(link);
      block.appendChild(stack);
      block.appendChild(cap);
      stage.appendChild(block);
    });
  }

  renderTags();
  renderGroups();

  var pop = document.createElement("div");
  pop.className = "ks-pop";
  pop.hidden = true;
  pop.innerHTML = '<span class="ks-pop-copy"></span>';
  document.body.appendChild(pop);
  var openEl = null;

  function canHover() {
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  }

  function place(el) {
    var rect = el.getBoundingClientRect();
    var box = pop.getBoundingClientRect();
    var left;
    var top;
    if (window.innerWidth < 720) {
      left = Math.max(8, Math.min(rect.left, window.innerWidth - box.width - 8));
      top = rect.bottom + 6;
      if (top + box.height > window.innerHeight - 8) top = Math.max(8, rect.top - box.height - 6);
    } else {
      left = rect.right + 8;
      top = rect.top + rect.height / 2 - box.height / 2;
      if (left + box.width > window.innerWidth - 8) left = Math.max(8, rect.left - box.width - 8);
      if (top < 8) top = 8;
      if (top + box.height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - box.height - 8);
    }
    pop.style.left = left + "px";
    pop.style.top = top + "px";
  }

  function show(el) {
    if (!el || !el.dataset.card) return;
    openEl = el;
    pop.querySelector(".ks-pop-copy").textContent = el.dataset.card;
    pop.hidden = false;
    place(el);
  }

  function hide() {
    openEl = null;
    pop.hidden = true;
  }

  document.addEventListener("pointerover", function (e) {
    if (!canHover()) return;
    var el = e.target.closest && e.target.closest(".ks-cut");
    if (el) show(el);
  });
  document.addEventListener("pointerout", function (e) {
    if (!canHover()) return;
    var el = e.target.closest && e.target.closest(".ks-cut");
    if (!el) return;
    var next = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(".ks-cut");
    if (next !== el) hide();
  });
  document.addEventListener("focusin", function (e) {
    if (!canHover()) return;
    var el = e.target.closest && e.target.closest(".ks-cut");
    if (el) show(el);
  });
  document.addEventListener("focusout", function (e) {
    if (!canHover()) return;
    var el = e.target.closest && e.target.closest(".ks-cut");
    if (el && openEl === el) hide();
  });
  document.addEventListener("click", function (e) {
    if (canHover()) return;
    var el = e.target.closest && e.target.closest(".ks-cut");
    if (el) {
      if (openEl === el) hide();
      else show(el);
      return;
    }
    hide();
  });
  window.addEventListener("scroll", function () {
    if (openEl) place(openEl);
  }, true);
  window.addEventListener("resize", function () {
    if (openEl) place(openEl);
  });
})();

(function () {
  var KEY = "ksTagsOpen";
  var root = document.documentElement;
  function sync() {
    var open = root.classList.contains("ks-tags-open");
    var btn = document.getElementById("ks-tags-toggle");
    var drop = document.getElementById("ks-tagdrop");
    if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (drop) drop.setAttribute("aria-hidden", open ? "false" : "true");
  }
  sync();
  var btn = document.getElementById("ks-tags-toggle");
  if (!btn) return;
  btn.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();
    var open = !root.classList.contains("ks-tags-open");
    root.classList.add("ks-tags-motion");
    root.classList.toggle("ks-tags-open", open);
    try { localStorage.setItem(KEY, open ? "1" : "0"); } catch (err) {}
    sync();
  });
})();
