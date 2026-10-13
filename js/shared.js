/* Shared helpers for Found Photographs, Vacant Storefronts, and Car Colours.
   Each page keeps its own column limits, slider ends, and scroll-lock class.
   Layout and motion stay in the page files. */
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

  root.Shared = {
    PHONE_MAX: PHONE_MAX,
    TABLET_MAX: TABLET_MAX,
    isPhone: isPhone,
    isTablet: isTablet,
    clampCount: clampCount,
    clampRange: clampRange,
    imageSrc: imageSrc,
    lockScroll: lockScroll,
    unlockScroll: unlockScroll
  };
})(window);
