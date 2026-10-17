/* Shared helpers. Each page keeps its own column limits, slider ends, and
   scroll-lock class. Parent and sub-tags share syncSubtags: Ski Hills now,
   Bike Routes when it is built. */

(function (root) {
  var PHONE_MAX = 767;
  var TABLET_MAX = 1100;

  function isPhone() {
    return root.matchMedia("(max-width: " + PHONE_MAX + "px)").matches;
  }

  function isTablet() {
    return !isPhone() && root.matchMedia("(max-width: " + TABLET_MAX + "px)").matches;
  }

  function clampCount(n, min, max, fallback) {
    n = Math.round(+n);
    return n >= min && n <= max ? n : fallback;
  }

  function clampRange(n, min, max) {
    n = Math.round(+n);
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  function imageSrc(src, px) {
    if (!src) return src;
    var mm = src.match(/\/w\/(\d+)\//);
    if (mm) {
      var freight = Math.min(2000, Math.max(+mm[1], px || 1600));
      return src.replace(/\/w\/\d+\//, "/w/" + freight + "/");
    }
    var tm = src.match(/\/image\/upload\/([^/]+)\//);
    if (!tm) return src;
    var trans = tm[1];
    var wm = trans.match(/w_(\d+)/);
    if (!wm || trans.indexOf("f_auto") === -1 || trans.indexOf("q_auto") === -1) return src;
    var have = +wm[1];
    var ask = Math.round(+px || have);
    if (!(ask > 0)) ask = have;
    var need = Math.min(2000, Math.max(have, ask));
    if (need === have) return src;
    var next = trans.replace(/w_\d+/, "w_" + need).replace(/h_\d+/, "h_" + need);
    return src.replace("/image/upload/" + trans + "/", "/image/upload/" + next + "/");
  }

  /* opts.className is the page sizing class (fp-sizing, vsf-sizing, cc-sizing).
     opts.overflow false only toggles that class. opts.pack is the page's own
     grid packing and runs while the lock is on. */
  function lockScroll(opts) {
    opts = opts || {};
    var h = root.document.documentElement;
    var g = opts.grid || null;
    var lock = {
      oy: h.style.overflowY,
      mh: g ? g.style.minHeight : "",
      ac: g ? g.style.alignContent : "",
      rows: g ? g.style.gridAutoRows : "",
      y: root.scrollY
    };
    if (opts.className) h.classList.add(opts.className);
    if (opts.overflow !== false) {
      h.style.overflowY = root.innerWidth - h.clientWidth > 0 ? "scroll" : "hidden";
    }
    if (g && typeof opts.pack === "function") opts.pack(g);
    return lock;
  }

  function unlockScroll(lock, opts) {
    if (!lock) return;
    opts = opts || {};
    var h = root.document.documentElement;
    var g = opts.grid || null;
    if (opts.className) h.classList.remove(opts.className);
    if (opts.overflow !== false) h.style.overflowY = lock.oy;
    if (typeof opts.unpack === "function") opts.unpack(g, lock);
  }

  /* Sub-tags slide out from the selected parent and back in when it is
     cleared. group holds the sub-tag elements; parent is that tag.
     30ms stagger, 250ms ease-out. prefers-reduced-motion shows and hides
     them immediately. A matching call does not replay the motion. */
  var SUB_STAGGER = 30;
  var SUB_DURATION = 250;

  function subReduced() {
    return root.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function subItems(group) {
    return Array.prototype.filter.call(group.children, function (el) {
      return el && el.nodeType === 1;
    });
  }

  function clearSubMotion(el) {
    el.style.transition = "";
    el.style.transform = "";
    el.style.opacity = "";
    el.style.position = "";
    el.style.left = "";
    el.style.top = "";
    el.style.width = "";
    el.style.margin = "";
    el.style.zIndex = "";
    el.style.pointerEvents = "";
  }

  function subShift(el, parent) {
    var tag = el.getBoundingClientRect();
    var from = parent.getBoundingClientRect();
    return {
      x: (from.left + from.width / 2) - (tag.left + tag.width / 2),
      y: (from.top + from.height / 2) - (tag.top + tag.height / 2)
    };
  }

  function subTiming(i) {
    var delay = i * SUB_STAGGER;
    var slide = "transform " + SUB_DURATION + "ms ease-out " + delay + "ms";
    var fade = "opacity " + SUB_DURATION + "ms ease-out " + delay + "ms";
    return slide + ", " + fade;
  }

  function subLater(group, token, items, done) {
    var wait = SUB_DURATION + Math.max(items.length - 1, 0) * SUB_STAGGER + 40;
    root.setTimeout(function () {
      if (group._bkSubToken !== token) return;
      done();
    }, wait);
  }

  function subInstant(group, items, open) {
    items.forEach(clearSubMotion);
    group.hidden = !open;
    group._bkSubBusy = false;
    if (open) group.removeAttribute("aria-hidden");
    else group.setAttribute("aria-hidden", "true");
  }

  function slideSubtagsOut(group, parent, items, token) {
    group._bkSubBusy = true;
    group.hidden = false;
    group.removeAttribute("aria-hidden");
    items.forEach(clearSubMotion);
    var shifts = items.map(function (el) { return subShift(el, parent); });
    items.forEach(function (el, i) {
      el.style.transition = "none";
      el.style.transform = "translate(" + shifts[i].x.toFixed(1) + "px," + shifts[i].y.toFixed(1) + "px)";
      el.style.opacity = "0";
    });
    void group.offsetWidth;
    root.requestAnimationFrame(function () {
      if (group._bkSubToken !== token) return;
      items.forEach(function (el, i) {
        el.style.transition = subTiming(i);
        el.style.transform = "translate(0px,0px)";
        el.style.opacity = "1";
      });
    });
    subLater(group, token, items, function () {
      if (!group._bkSubOpen) return;
      items.forEach(function (el) {
        el.style.transition = "";
        el.style.transform = "";
        el.style.opacity = "";
      });
      group._bkSubBusy = false;
    });
  }

  function slideSubtagsIn(group, parent, items, token) {
    group._bkSubBusy = true;
    group.setAttribute("aria-hidden", "true");
    var boxes = items.map(function (el) { return el.getBoundingClientRect(); });
    var from = parent.getBoundingClientRect();
    items.forEach(function (el, i) {
      var box = boxes[i];
      el.style.transition = "none";
      el.style.position = "fixed";
      el.style.left = box.left.toFixed(1) + "px";
      el.style.top = box.top.toFixed(1) + "px";
      el.style.width = box.width.toFixed(1) + "px";
      el.style.margin = "0";
      el.style.transform = "none";
      el.style.zIndex = "40";
      el.style.pointerEvents = "none";
      el._bkSubX = (from.left + from.width / 2) - (box.left + box.width / 2);
      el._bkSubY = (from.top + from.height / 2) - (box.top + box.height / 2);
    });
    void group.offsetWidth;
    root.requestAnimationFrame(function () {
      if (group._bkSubToken !== token) return;
      items.forEach(function (el, i) {
        el.style.transition = subTiming(i);
        el.style.transform = "translate(" + el._bkSubX.toFixed(1) + "px," + el._bkSubY.toFixed(1) + "px)";
        el.style.opacity = "0";
      });
    });
    subLater(group, token, items, function () {
      if (group._bkSubOpen) return;
      items.forEach(clearSubMotion);
      group.hidden = true;
      group._bkSubBusy = false;
    });
  }

  function syncSubtags(group, parent, open) {
    if (!group) return;
    open = !!open;
    var items = subItems(group);
    if (group._bkSubOpen == null && !group._bkSubBusy && (!group.hidden) === open) {
      group._bkSubOpen = open;
      return;
    }
    if (group._bkSubOpen === open) return;
    group._bkSubOpen = open;
    group._bkSubToken = (group._bkSubToken || 0) + 1;
    var token = group._bkSubToken;
    if (subReduced() || !parent || !items.length) {
      subInstant(group, items, open);
      return;
    }
    if (open) slideSubtagsOut(group, parent, items, token);
    else slideSubtagsIn(group, parent, items, token);
  }

  root.Shared = {
    PHONE_MAX: PHONE_MAX,
    TABLET_MAX: TABLET_MAX,
    isPhone: isPhone,
    isTablet: isTablet,
    clampCount: clampCount,
    clampRange: clampRange,
    imageSrc: imageSrc,
    lockScroll: lockScroll,
    unlockScroll: unlockScroll,
    syncSubtags: syncSubtags
  };
})(window);
