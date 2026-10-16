/* Ski Hills. Static drawings. The file is local; nothing is fetched from OpenSkiMap. */
(function () {
  var grid = document.getElementById("sh-grid");
  var count = document.querySelector(".sh-count");
  var tags = document.querySelector(".sh-tags");
  var hills = [];
  var region = "bc";

  function slugFromHash() {
    return decodeURIComponent((location.hash || "").replace(/^#/, "")).trim();
  }

  function setPressed(id) {
    if (!tags) return;
    Array.prototype.forEach.call(tags.querySelectorAll(".sh-tag"), function (btn) {
      var on = btn.getAttribute("data-sh-region") === id;
      btn.classList.toggle("sh-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function apply(scroll) {
    var slug = slugFromHash();
    var shown = 0;
    hills.forEach(function (hill) {
      var card = hill.el;
      var on = region === "bc" || hill.region === region;
      card.hidden = !on;
      var marked = on && hill.slug === slug;
      card.classList.toggle("sh-on", marked);
      if (on) shown += 1;
      if (marked && scroll) card.scrollIntoView({ block: "center" });
    });
    if (count) count.textContent = shown + " of " + hills.length;
  }

  function draw(hill) {
    var runs = (hill.runs || []).map(function (pts) {
      return '<polyline class="sh-run" points="' + pts + '"></polyline>';
    }).join("");
    var lifts = (hill.lifts || []).map(function (pts) {
      return '<polyline class="sh-lift" points="' + pts + '"></polyline>';
    }).join("");
    var card = document.createElement("a");
    card.className = "sh-hill";
    card.id = hill.slug;
    card.href = "#" + hill.slug;
    card.setAttribute("data-sh-id", hill.id);
    card.setAttribute("data-sh-region", hill.region || "");
    card.innerHTML = '<svg viewBox="0 0 1000 1000" aria-hidden="true">' + runs + lifts + "</svg>" +
      '<span class="sh-hill-name"></span>';
    card.querySelector(".sh-hill-name").textContent = hill.name || "Unnamed hill";
    hill.el = card;
    grid.appendChild(card);
  }

  if (tags) {
    tags.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".sh-tag") : null;
      if (!btn) return;
      var id = btn.getAttribute("data-sh-region") || "bc";
      region = (id === region && id !== "bc") ? "bc" : id;
      setPressed(region);
      apply(false);
    });
  }

  window.addEventListener("hashchange", function () { apply(true); });

  fetch("hills.json?v=20261016b").then(function (res) {
    if (!res.ok) throw new Error("hills");
    return res.json();
  }).then(function (data) {
    hills = data.hills || [];
    hills.forEach(draw);
    setPressed(region);
    apply(true);
  }).catch(function () {
    if (count) count.textContent = "The hill drawings did not load.";
  });
})();
