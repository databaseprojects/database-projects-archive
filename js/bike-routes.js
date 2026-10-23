/* Bike Routes. One row of city maps. Vancouver keeps its route hover. */
(function () {
  var count = document.querySelector(".br-count");
  var print = document.getElementById("br-print");
  var tip = null;
  var tags = document.querySelectorAll(".br-tag");
  var cards = document.querySelectorAll(".br-city");

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

  function mount(svg) {
    print.appendChild(svg);
    print.addEventListener("pointermove", function (e) {
      var node = e.target && e.target.closest ? e.target.closest(".br-route") : null;
      if (!node) {
        showTip("", 0, 0);
        return;
      }
      showTip(node.getAttribute("data-name") || "", e.clientX, e.clientY);
    });
    print.addEventListener("pointerleave", function () { showTip("", 0, 0); });
  }

  tags.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var country = btn.getAttribute("data-br-country") || "all";
      tags.forEach(function (other) {
        var on = other === btn;
        other.classList.toggle("br-on", on);
        other.setAttribute("aria-pressed", on ? "true" : "false");
      });
      cards.forEach(function (card) {
        var place = card.getAttribute("data-country") || "";
        card.hidden = country !== "all" && place !== country;
      });
    });
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
})();
