/* Flat city cycle map. The drawing is an image, so it has no hover. */
(function () {
  var slug = (location.hash || "").replace(/^#/, "");
  var nameEl = document.getElementById("br-city-name");
  var countEl = document.getElementById("br-city-count");
  var noteEl = document.getElementById("br-city-note");
  var mapEl = document.getElementById("br-city-map");

  if (!slug) {
    if (countEl) countEl.textContent = "Choose a city from the index.";
    return;
  }

  fetch("city-index.json?v=20261022a").then(function (res) {
    if (!res.ok) throw new Error("index");
    return res.json();
  }).then(function (data) {
    var city = null;
    (data.cities || []).forEach(function (row) {
      if (row.slug === slug) city = row;
    });
    if (!city) throw new Error("city");
    document.title = city.name + " — Bike Routes";
    if (nameEl) nameEl.textContent = city.name;
    if (noteEl) noteEl.textContent = city.province_name || "";
    if (countEl) {
      var n = city.routes;
      countEl.textContent = n + (n === 1 ? " route · " : " routes · ") + city.km + " km";
    }
    if (mapEl) {
      mapEl.alt = city.name + " cycle routes";
      mapEl.src = "prints/" + city.slug + ".svg?v=20261022a";
    }
  }).catch(function () {
    if (countEl) countEl.textContent = "This city map did not load.";
  });
})();
