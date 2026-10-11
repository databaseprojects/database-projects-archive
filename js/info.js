/* Info page. The archival marks drift in CSS. Stop pauses them. */
(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var stopBtn = document.querySelector(".info-stop");
  if (reduce) document.body.classList.add("info-paused");
  if (!stopBtn) return;
  if (reduce) stopBtn.setAttribute("aria-pressed", "true");
  stopBtn.addEventListener("click", function () {
    var paused = document.body.classList.toggle("info-paused");
    stopBtn.setAttribute("aria-pressed", paused ? "true" : "false");
  });
})();
