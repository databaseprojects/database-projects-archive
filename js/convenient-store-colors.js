/* Store and category filters, and the small aisle-photo pop-up. */
(function () {
  var store = "all";
  var storePicked = false;
  var picked = { candy: false, chips: false, drinks: false };
  var cats = document.querySelector(".csc-cats");
  var board = document.querySelector(".csc-board");
  var thumb = document.querySelector(".csc-thumb");
  var pop = document.querySelector(".csc-pop");
  var frame = document.querySelector(".csc-pop-frame");
  var backdrop = document.querySelector(".csc-pop-backdrop");
  var motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var ease = "cubic-bezier(.22,.8,.25,1)";
  var moveMs = 380;
  if (!board || !thumb || !pop || !frame) return;

  var storeNames = { "circle-k": "Circle K" };
  Array.prototype.forEach.call(board.querySelectorAll(".csc-swatch"), function (item) {
    var storeName = storeNames[item.getAttribute("data-store")] || "";
    var catName = item.getAttribute("data-cat") || "";
    var text = storeName && catName ? storeName + " / " + catName : (storeName || catName);
    item.setAttribute("data-label", text);
    var dot = item.querySelector(".csc-dot");
    if (!dot) return;
    var hex = dot.getAttribute("title") || dot.getAttribute("aria-label") || "";
    dot.removeAttribute("title");
    dot.setAttribute("aria-label", hex ? text + ", " + hex : text);
  });

  function anyCat() {
    return picked.candy || picked.chips || picked.drinks;
  }

  function wants(item) {
    var storeOk = store === "all" || item.getAttribute("data-store") === store;
    var name = item.getAttribute("data-cat");
    return storeOk && (!anyCat() || !!picked[name]);
  }

  function clearMove(item) {
    if (!item.getAnimations) return;
    item.getAnimations().forEach(function (anim) {
      if (anim.id === "csc-move") anim.cancel();
    });
  }

  function clearLeave(item) {
    item.classList.remove("csc-leave");
    item.style.left = "";
    item.style.top = "";
    item.style.width = "";
    item.style.height = "";
  }

  function finishBlocks() {
    Array.prototype.forEach.call(board.querySelectorAll(".csc-block"), function (block) {
      var staying = 0;
      var leaving = 0;
      Array.prototype.forEach.call(block.querySelectorAll(".csc-swatch"), function (item) {
        if (item.classList.contains("csc-leave")) leaving += 1;
        else if (!item.hidden) staying += 1;
      });
      var heading = block.querySelector("h2");
      if (staying > 0) {
        block.hidden = false;
        if (heading) heading.hidden = false;
      } else if (leaving > 0) {
        block.hidden = false;
        if (heading) heading.hidden = true;
      } else {
        block.hidden = true;
        if (heading) heading.hidden = false;
      }
    });
  }

  function syncCats() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-csc-cat]"), function (button) {
      var on = !!picked[button.getAttribute("data-csc-cat")];
      button.classList.toggle("csc-on", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function apply(animate) {
    var reduce = !animate || motion.matches;
    var items = board.querySelectorAll(".csc-swatch");
    var plan = [];
    Array.prototype.forEach.call(items, function (item) {
      var rect = null;
      if (!item.hidden && !item.classList.contains("csc-leave")) {
        var box = item.getBoundingClientRect();
        if (box.width > 0) rect = { left: box.left, top: box.top, width: box.width, height: box.height };
      } else if (item.classList.contains("csc-leave")) {
        var held = item.getBoundingClientRect();
        if (held.width > 0) rect = { left: held.left, top: held.top, width: held.width, height: held.height };
      }
      plan.push({ item: item, rect: rect, show: wants(item) });
    });

    plan.forEach(function (entry) {
      clearMove(entry.item);
      if (entry.show) {
        clearLeave(entry.item);
        entry.item.hidden = false;
      } else if (!reduce && entry.rect) {
        entry.item.hidden = false;
        entry.item.classList.add("csc-leave");
        entry.item.style.left = entry.rect.left + "px";
        entry.item.style.top = entry.rect.top + "px";
        entry.item.style.width = entry.rect.width + "px";
        entry.item.style.height = entry.rect.height + "px";
      } else {
        clearLeave(entry.item);
        entry.item.hidden = true;
      }
    });
    finishBlocks();
    if (cats) cats.hidden = !storePicked;
    if (reduce) return;

    plan.forEach(function (entry) {
      var item = entry.item;
      if (entry.show && entry.rect) {
        var now = item.getBoundingClientRect();
        var dx = entry.rect.left - now.left;
        var dy = entry.rect.top - now.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
        var move = item.animate(
          [
            { transform: "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px)" },
            { transform: "translate(0px,0px)" }
          ],
          { duration: moveMs, easing: ease }
        );
        move.id = "csc-move";
      } else if (entry.show && !entry.rect) {
        var enter = item.animate(
          [
            { transform: "scale(0)" },
            { transform: "scale(1)" }
          ],
          { duration: moveMs, easing: ease }
        );
        enter.id = "csc-move";
      } else if (!entry.show && entry.rect && item.classList.contains("csc-leave")) {
        var leave = item.animate(
          [
            { transform: "scale(1)" },
            { transform: "scale(0)" }
          ],
          { duration: moveMs, easing: ease }
        );
        leave.id = "csc-move";
        leave.onfinish = function () {
          if (!item.classList.contains("csc-leave")) return;
          clearLeave(item);
          item.hidden = true;
          finishBlocks();
        };
      }
    });
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
      if (store === "all") {
        picked.candy = false;
        picked.chips = false;
        picked.drinks = false;
        syncCats();
      }
      setPressed("[data-csc-store]", "data-csc-store", store);
      apply(true);
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll("[data-csc-cat]"), function (button) {
    button.addEventListener("click", function () {
      var name = button.getAttribute("data-csc-cat");
      picked[name] = !picked[name];
      syncCats();
      apply(true);
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
