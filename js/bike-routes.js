/* Bike Routes. Row of city maps, and a gallery that steps through the filter. */
(function () {
  var count = document.querySelector(".br-count");
  var print = document.getElementById("br-print");
  var row = document.getElementById("br-row");
  var tip = null;
  var cards = document.querySelectorAll(".br-city");
  var placeTags = document.querySelectorAll("[data-br-country]");
  var viewTags = document.querySelectorAll("[data-br-view]");
  var gallery = null;

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
    if (gallery && gallery.slug === "vancouver") renderGallery();
  }

  function visibleCards() {
    var list = [];
    cards.forEach(function (card) {
      if (!card.hidden) list.push(card);
    });
    return list;
  }

  function cardBySlug(slug) {
    var found = null;
    cards.forEach(function (card) {
      if (card.getAttribute("data-slug") === slug) found = card;
    });
    return found;
  }

  function cityName(card) {
    var cap = card && card.querySelector(".br-city-caption");
    return cap ? cap.textContent : "";
  }

  function cityArt(card) {
    var svg = card.querySelector("svg");
    if (svg) return svg.cloneNode(true);
    var img = card.querySelector("img");
    if (!img) return null;
    var copy = document.createElement("img");
    copy.src = img.getAttribute("src") || "";
    copy.alt = img.alt || "";
    return copy;
  }

  function setPressed(buttons, attr, value) {
    buttons.forEach(function (btn) {
      var on = btn.getAttribute(attr) === value;
      btn.classList.toggle("br-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function setView(mode) {
    setPressed(viewTags, "data-br-view", mode);
  }

  function slugFromHash() {
    return decodeURIComponent((location.hash || "").replace(/^#/, "")).trim();
  }

  function renderGallery() {
    if (!gallery) return;
    var list = visibleCards();
    var index = -1;
    list.forEach(function (card, i) {
      if (card.getAttribute("data-slug") === gallery.slug) index = i;
    });
    if (!list.length || index < 0) {
      closeGallery(false);
      return;
    }
    gallery.index = index;
    var card = list[index];
    var art = gallery.el.querySelector(".br-lb-art");
    var node = cityArt(card);
    art.replaceChildren();
    if (node) art.appendChild(node);
    showTip("", 0, 0);
    var name = cityName(card);
    gallery.el.querySelector(".br-lb-caption").textContent = name;
    gallery.el.querySelector(".br-lb-count").textContent = (index + 1) + " of " + list.length;
    gallery.el.setAttribute("aria-label", name);
    gallery.el.querySelector(".br-edge-prev").disabled = index <= 0;
    gallery.el.querySelector(".br-edge-next").disabled = index >= list.length - 1;
  }

  function closeGallery(fromPop) {
    var lb = gallery && gallery.el;
    gallery = null;
    showTip("", 0, 0);
    setView("row");
    if (!fromPop && slugFromHash()) {
      history.pushState(null, "", location.pathname + location.search);
    }
    if (!lb) {
      document.documentElement.classList.remove("br-lb-open");
      return;
    }
    lb._closing = true;
    lb.classList.add("br-lb-closing");
    lb.classList.remove("br-lb-on");
    setTimeout(function () {
      if (lb.parentNode) lb.parentNode.removeChild(lb);
      if (!document.getElementById("br-lb")) document.documentElement.classList.remove("br-lb-open");
    }, 340);
  }

  function openGallery(card) {
    if (!card || card.hidden) return;
    var slug = card.getAttribute("data-slug") || "";
    if (gallery && gallery.slug === slug && gallery.el && !gallery.el._closing) return;
    if (gallery) {
      if (gallery.el && gallery.el.parentNode) gallery.el.parentNode.removeChild(gallery.el);
      gallery = null;
    }
    var lb = document.createElement("div");
    lb.id = "br-lb";
    lb.className = "br-lb";
    lb.setAttribute("role", "dialog");
    lb.setAttribute("aria-modal", "true");
    lb.innerHTML = ''
      + '<div class="br-lb-panel">'
      + '<div class="br-lb-stage">'
      + '<button type="button" class="br-edge br-edge-prev" aria-label="Previous city"><svg viewBox="0 0 12 20" aria-hidden="true"><path d="M9 2 L3 10 L9 18" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'
      + '<div class="br-lb-art"></div>'
      + '<button type="button" class="br-edge br-edge-next" aria-label="Next city"><svg viewBox="0 0 12 20" aria-hidden="true"><path d="M3 2 L9 10 L3 18" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'
      + '</div>'
      + '<p class="br-lb-caption"></p>'
      + '<p class="br-lb-count"></p>'
      + '</div>';
    lb.querySelector(".br-edge-prev").addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      step(-1);
    });
    lb.querySelector(".br-edge-next").addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      step(1);
    });
    lb.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest(".br-lb-panel")) return;
      closeGallery(false);
    });
    bindRouteTip(lb.querySelector(".br-lb-art"));
    document.body.appendChild(lb);
    gallery = { el: lb, slug: slug, index: 0 };
    renderGallery();
    if (!gallery || gallery.el !== lb) return;
    setView("gallery");
    document.documentElement.classList.add("br-lb-open");
    var art = lb.querySelector(".br-lb-art");
    var fromEl = card.querySelector(".br-city-art") || card;
    var from = fromEl.getBoundingClientRect();
    requestAnimationFrame(function () {
      if (!gallery || gallery.el !== lb || lb._closing) return;
      var r = art.getBoundingClientRect();
      if (r.width && from.width) {
        var s = Math.min(from.width / r.width, from.height / r.height);
        var dx = from.left + from.width / 2 - (r.left + r.width / 2);
        var dy = from.top + from.height / 2 - (r.top + r.height / 2);
        art.style.transition = "none";
        art.style.transform = "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px) scale(" + s.toFixed(4) + ")";
      }
      void art.offsetWidth;
      requestAnimationFrame(function () {
        if (!gallery || gallery.el !== lb || lb._closing) return;
        lb.classList.add("br-lb-on");
        art.style.transition = "";
        art.style.transform = "none";
      });
    });
    var want = "#" + slug;
    if (location.hash !== want) history.pushState({ br: slug }, "", location.pathname + location.search + want);
  }

  function step(dir) {
    if (!gallery) return;
    var list = visibleCards();
    var index = -1;
    list.forEach(function (card, i) {
      if (card.getAttribute("data-slug") === gallery.slug) index = i;
    });
    var next = index + dir;
    if (next < 0 || next >= list.length) return;
    var card = list[next];
    gallery.slug = card.getAttribute("data-slug") || "";
    renderGallery();
    var want = "#" + gallery.slug;
    if (location.hash !== want) history.pushState({ br: gallery.slug }, "", location.pathname + location.search + want);
  }

  function openFromHash() {
    var slug = slugFromHash();
    if (!slug) {
      if (gallery) closeGallery(true);
      return;
    }
    var card = cardBySlug(slug);
    if (card && !card.hidden) openGallery(card);
  }

  placeTags.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var country = btn.getAttribute("data-br-country") || "all";
      setPressed(placeTags, "data-br-country", country);
      cards.forEach(function (card) {
        var place = card.getAttribute("data-country") || "";
        card.hidden = country !== "all" && place !== country;
      });
      if (gallery) renderGallery();
    });
  });

  viewTags.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var mode = btn.getAttribute("data-br-view") || "row";
      if (mode === "row") {
        closeGallery(false);
        return;
      }
      if (gallery) return;
      var list = visibleCards();
      var slug = slugFromHash();
      var card = slug ? cardBySlug(slug) : null;
      if (!card || card.hidden) card = list[0];
      if (card) openGallery(card);
    });
  });

  if (row) {
    row.addEventListener("click", function (e) {
      var card = e.target && e.target.closest ? e.target.closest(".br-city") : null;
      if (!card || card.hidden) return;
      openGallery(card);
    });
  }

  window.addEventListener("keydown", function (e) {
    if (!gallery) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeGallery(false);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      step(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      step(1);
    }
  });

  window.addEventListener("popstate", function () {
    openFromHash();
  });

  if (print) {
    fetch("city.svg?v=20261017h").then(function (res) {
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
  }).catch(function () {
    if (count) count.textContent = "The routes did not load.";
  });

  if (slugFromHash()) openFromHash();
})();
