/* Info page. Folder clicks toss a few papers that arc, tumble, and fade. */
(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) document.body.classList.add("info-paused");
  var host = document.querySelector(".info-archive");
  if (!host) return;
  var papers = [
    '<svg viewBox="0 0 18 24" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><rect x="2" y="2" width="13" height="19" fill="currentColor" fill-opacity="0.12"/><path d="M5 8h8M5 12h6M5 16h7"/></svg>',
    '<svg viewBox="0 0 22 16" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><rect x="2" y="2" width="17" height="11" fill="currentColor" fill-opacity="0.1"/><path d="M5 6h11M5 9h8"/></svg>',
    '<svg viewBox="0 0 16 22" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><path d="M3 2h7l4 4v13H3z" fill="currentColor" fill-opacity="0.1"/><path d="M10 2v4h4M5 11h6M5 15h4"/></svg>'
  ];
  host.addEventListener("click", function (e) {
    var folder = e.target.closest && e.target.closest(".info-folder");
    if (!folder) return;
    var n = 6 + Math.floor(Math.random() * 5);
    var rect = folder.getBoundingClientRect();
    var box = host.getBoundingClientRect();
    var i;
    for (i = 0; i < n; i++) {
      var el = document.createElement("span");
      el.className = "info-shoot";
      el.innerHTML = papers[i % papers.length];
      el.style.left = (rect.left - box.left + rect.width / 2 - 8) + "px";
      el.style.top = (rect.top - box.top - 2) + "px";
      el.style.setProperty("--dx", ((Math.random() * 120) - 60).toFixed(1) + "px");
      el.style.setProperty("--dy", (-(40 + Math.random() * 86)).toFixed(1) + "px");
      el.style.setProperty("--rot", ((Math.random() * 80) - 40).toFixed(1) + "deg");
      host.appendChild(el);
      el.addEventListener("animationend", function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
    }
  });
})();
