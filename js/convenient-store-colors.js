/* Store and category filters, and the small aisle-photo pop-up. */
(function () {
  var store = "all";
  var cat = "";
  var storePicked = false;
  var cats = document.querySelector(".csc-cats");
  var board = document.querySelector(".csc-board");
  var thumb = document.querySelector(".csc-thumb");
  var pop = document.querySelector(".csc-pop");
  var frame = document.querySelector(".csc-pop-frame");
  var backdrop = document.querySelector(".csc-pop-backdrop");
  if (!board || !thumb || !pop || !frame) return;

  function apply() {
    var blocks = board.querySelectorAll(".csc-block");
    Array.prototype.forEach.call(blocks, function (block) {
      var shown = 0;
      Array.prototype.forEach.call(block.querySelectorAll(".csc-swatch"), function (item) {
        var storeOk = store === "all" || item.getAttribute("data-store") === store;
        var catOk = !cat || item.getAttribute("data-cat") === cat;
        var on = storeOk && catOk;
        item.hidden = !on;
        if (on) shown += 1;
      });
      block.hidden = shown === 0;
    });
    if (cats) cats.hidden = !storePicked;
  }

  function setPressed(selector, attr, value) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), function (button) {
      var on = button.getAttribute(attr) === value;
      button.classList.toggle("csc-on", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll("[data-csc-store]"), function (button) {
    button.addEventListener("click", function () {
      store = button.getAttribute("data-csc-store");
      storePicked = true;
      setPressed("[data-csc-store]", "data-csc-store", store);
      apply();
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll("[data-csc-cat]"), function (button) {
    button.addEventListener("click", function () {
      var next = button.getAttribute("data-csc-cat");
      cat = cat === next ? "" : next;
      setPressed("[data-csc-cat]", "data-csc-cat", cat);
      apply();
    });
  });

  function openPop() {
    frame.getAnimations().forEach(function (anim) { anim.cancel(); });
    pop.classList.add("csc-on");
    pop.setAttribute("aria-hidden", "false");
    frame.animate(
      [{ transform: "scale(0.86)" }, { transform: "scale(1)" }],
      { duration: 220, easing: "cubic-bezier(.22,.8,.25,1)" }
    );
  }

  function closePop() {
    if (!pop.classList.contains("csc-on")) return;
    frame.getAnimations().forEach(function (anim) { anim.cancel(); });
    var anim = frame.animate(
      [{ transform: "scale(1)" }, { transform: "scale(0.86)" }],
      { duration: 160, easing: "cubic-bezier(.22,.8,.25,1)" }
    );
    anim.onfinish = function () {
      pop.classList.remove("csc-on");
      pop.setAttribute("aria-hidden", "true");
      thumb.focus();
    };
  }

  thumb.addEventListener("click", openPop);
  if (backdrop) backdrop.addEventListener("click", closePop);
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closePop();
  });

  apply();
})();
