/* Bike Routes. Click a city map to zoom it open, the same way Vacant does. */
(function () {
  var count = document.querySelector(".br-count");
  var print = document.getElementById("br-print");
  var row = document.getElementById("br-row");
  var tip = null;
  var cards = document.querySelectorAll(".br-city");
  var placeTags = document.querySelectorAll("[data-br-country]");

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
  }

  function setPressed(buttons, attr, value) {
    buttons.forEach(function (btn) {
      var on = btn.getAttribute(attr) === value;
      btn.classList.toggle("br-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function gallerySide() {
    var maxW = Math.min(window.innerWidth * 0.96, 1600);
    var maxH = window.innerHeight * 0.92;
    return Math.min(maxW, maxH);
  }

  function closeLb() {
    var lb = document.getElementById("br-lb");
    if (!lb || lb._closing) return;
    lb._closing = true;
    var big = lb.querySelector(":scope > .br-lb-art");
    var from = lb._from;
    lb.classList.add("br-lb-closing");
    lb.classList.remove("br-lb-on");
    showTip("", 0, 0);
    if (big && from) {
      var r = big.getBoundingClientRect();
      if (r.width && r.height) {
        var s = Math.min(from.w / r.width, from.h / r.height);
        var dx = from.x + from.w / 2 - (r.left + r.width / 2);
        var dy = from.y + from.h / 2 - (r.top + r.height / 2);
        big.style.transform = "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px) scale(" + s.toFixed(4) + ")";
      }
    }
    setTimeout(function () {
      if (lb.parentNode) lb.parentNode.removeChild(lb);
      if (!document.getElementById("br-lb")) document.documentElement.classList.remove("br-lb-open");
    }, 340);
  }

  function openLb(card) {
    if (document.getElementById("br-lb") || !card || card.hidden) return;
    var art = card.querySelector(".br-city-art");
    if (!art) return;
    var svg = art.querySelector ? art.querySelector("svg") : null;
    var img = art.tagName === "IMG" ? art : null;
    if (!svg && !img) return;
    var thumb = art.getBoundingClientRect();
    var lb = document.createElement("div");
    lb.id = "br-lb";
    lb.className = "br-lb";
    lb.setAttribute("role", "dialog");
    lb.setAttribute("aria-modal", "true");
    lb._from = { x: thumb.left, y: thumb.top, w: thumb.width, h: thumb.height };
    var big;
    if (svg) {
      big = svg.cloneNode(true);
      bindRouteTip(big);
    } else {
      big = document.createElement("img");
      big.alt = img.alt || "";
      big.draggable = false;
      big.src = img.getAttribute("src") || "";
    }
    big.classList.add("br-lb-art");
    big.style.opacity = "0";
    var side = gallerySide().toFixed(2) + "px";
    big.style.width = side;
    big.style.height = side;
    big.style.maxWidth = "none";
    big.style.maxHeight = "none";
    function measureAndZoom() {
      var r = big.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      var s = Math.min(thumb.width / r.width, thumb.height / r.height);
      var dx = thumb.left + thumb.width / 2 - (r.left + r.width / 2);
      var dy = thumb.top + thumb.height / 2 - (r.top + r.height / 2);
      big.style.transition = "none";
      big.style.transform = "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px) scale(" + s.toFixed(4) + ")";
      big.style.opacity = "1";
      void big.offsetWidth;
      big.style.transition = "";
      requestAnimationFrame(function () {
        if (lb._closing) return;
        lb.classList.add("br-lb-on");
        big.style.transform = "none";
      });
      return true;
    }
    lb.appendChild(big);
    document.body.appendChild(lb);
    document.documentElement.classList.add("br-lb-open");
    if (big.tagName === "IMG") {
      var kick = function () {
        if (lb._closing || lb._opened) return;
        lb._opened = true;
        if (!measureAndZoom()) {
          lb.classList.add("br-lb-on");
          big.style.opacity = "1";
        }
      };
      big.addEventListener("load", function () { requestAnimationFrame(kick); });
      if (big.complete && big.naturalWidth) requestAnimationFrame(kick);
    } else {
      requestAnimationFrame(function () {
        if (lb._closing) return;
        if (!measureAndZoom()) {
          lb.classList.add("br-lb-on");
          big.style.opacity = "1";
        }
      });
    }
    lb.addEventListener("click", function (e) {
      if (e.target === lb) closeLb();
    });
    big.addEventListener("click", function (e) { e.stopPropagation(); });
  }

  placeTags.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var country = btn.getAttribute("data-br-country") || "all";
      setPressed(placeTags, "data-br-country", country);
      cards.forEach(function (card) {
        var place = card.getAttribute("data-country") || "";
        card.hidden = country !== "all" && place !== country;
      });
    });
  });

  if (row) {
    row.addEventListener("click", function (e) {
      if (document.getElementById("br-lb")) return;
      var card = e.target && e.target.closest ? e.target.closest(".br-city") : null;
      if (!card || card.hidden) return;
      openLb(card);
    });
  }

  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && document.getElementById("br-lb")) {
      e.preventDefault();
      closeLb();
    }
  });

  if (print) {
    fetch("city.svg?v=20261022f").then(function (res) {
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
})();
