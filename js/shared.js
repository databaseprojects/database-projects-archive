/* Shared helpers. Each page keeps its own column limits, slider ends, and
   scroll-lock class. Parent and sub-tags share syncSubtags: Ski Hills now,
   Bike Routes when it has parent and sub-tags. */

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

  /* Sub-tags cascade by wrapped row. Row 1 slides down, and each later row
     starts 70ms after the one above it, 250ms ease-out. Closing with nothing
     in its place runs the cascade back up, last row first. Switching from
     one parent to another drops the old group downward and fades it while
     the new rows cascade down. prefers-reduced-motion shows and hides the
     group immediately. A matching call does not replay the motion. */
  var SUB_STAGGER = 70;
  var SUB_DURATION = 250;

  function subReduced() {
    return root.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function subItems(group) {
    return Array.prototype.filter.call(group.children, function (el) {
      return el && el.nodeType === 1 && el.className !== "bk-subrow";
    });
  }

  function releaseRows(group) {
    var shells = [];
    Array.prototype.forEach.call(group.children, function (el) {
      if (el && el.className === "bk-subrow") shells.push(el);
    });
    shells.forEach(function (shell) {
      while (shell.firstChild) group.insertBefore(shell.firstChild, shell);
      shell.remove();
    });
  }

  function clearSubStyles(group) {
    group.style.position = "";
    group.style.left = "";
    group.style.top = "";
    group.style.width = "";
    group.style.margin = "";
    group.style.transform = "";
    group.style.opacity = "";
    group.style.transition = "";
    group.style.zIndex = "";
    group.style.pointerEvents = "";
    Array.prototype.forEach.call(group.querySelectorAll(".sh-tag, .br-tag, button"), function (el) {
      el.style.transition = "";
      el.style.transform = "";
    });
  }

  function subInstant(group, open) {
    releaseRows(group);
    clearSubStyles(group);
    group.hidden = !open;
    group._bkSubBusy = false;
    if (open) group.removeAttribute("aria-hidden");
    else group.setAttribute("aria-hidden", "true");
  }

  function rowBuckets(group) {
    var rows = [];
    var lastTop = null;
    subItems(group).forEach(function (el) {
      var top = el.offsetTop;
      if (!rows.length || Math.abs(top - lastTop) > 2) {
        rows.push([el]);
        lastTop = top;
      } else rows[rows.length - 1].push(el);
    });
    return rows;
  }

  function rowDelay(i, count, open) {
    return (open ? i : (count - 1 - i)) * SUB_STAGGER;
  }

  function slideSubtags(group, open, token) {
    group._bkSubBusy = true;
    releaseRows(group);
    clearSubStyles(group);
    if (open) {
      group.hidden = false;
      group.removeAttribute("aria-hidden");
    } else group.setAttribute("aria-hidden", "true");
    var width = group.getBoundingClientRect().width;
    var rows = rowBuckets(group);
    if (!rows.length) {
      subInstant(group, open);
      return;
    }
    if (width) group.style.width = width.toFixed(2) + "px";
    var shells = rows.map(function (els) {
      var shell = document.createElement("span");
      shell.className = "bk-subrow";
      shell.style.display = "block";
      shell.style.overflow = "hidden";
      group.insertBefore(shell, els[0]);
      els.forEach(function (el) { shell.appendChild(el); });
      var h = Math.ceil(shell.getBoundingClientRect().height);
      if (h < 1) h = Math.ceil(els[0].getBoundingClientRect().height);
      shell._bkH = h;
      return shell;
    });
    shells.forEach(function (shell, i) {
      var h = shell._bkH;
      var tags = subItems(shell);
      shell.style.transition = "none";
      shell.style.pointerEvents = open ? "" : "none";
      shell.style.height = open ? "0px" : (h + "px");
      tags.forEach(function (el) {
        el.style.transition = "none";
        el.style.transform = open ? ("translateY(-" + h + "px)") : "translateY(0px)";
      });
    });
    void group.offsetWidth;
    root.requestAnimationFrame(function () {
      if (group._bkSubToken !== token) return;
      shells.forEach(function (shell, i) {
        var h = shell._bkH;
        var delay = rowDelay(i, shells.length, open);
        var ease = SUB_DURATION + "ms ease-out " + delay + "ms";
        shell.style.transition = "height " + ease;
        shell.style.height = open ? (h + "px") : "0px";
        subItems(shell).forEach(function (el) {
          el.style.transition = "transform " + ease;
          el.style.transform = open ? "translateY(0px)" : ("translateY(-" + h + "px)");
        });
      });
    });
    var wait = SUB_DURATION + Math.max(shells.length - 1, 0) * SUB_STAGGER + 50;
    root.setTimeout(function () {
      if (group._bkSubToken !== token || group._bkSubOpen !== open) return;
      releaseRows(group);
      clearSubStyles(group);
      group.hidden = !open;
      group._bkSubBusy = false;
      if (open) group.removeAttribute("aria-hidden");
      else group.setAttribute("aria-hidden", "true");
    }, wait);
  }

  function pushSubtags(group, token) {
    group._bkSubBusy = true;
    releaseRows(group);
    clearSubStyles(group);
    group.setAttribute("aria-hidden", "true");
    var host = group.parentNode;
    var hostPos = host.style.position;
    if (window.getComputedStyle(host).position === "static") host.style.position = "relative";
    var top = group.offsetTop;
    var left = group.offsetLeft;
    var width = group.offsetWidth;
    var height = group.offsetHeight || 36;
    group.style.position = "absolute";
    group.style.left = left + "px";
    group.style.top = top + "px";
    group.style.width = width + "px";
    group.style.margin = "0";
    group.style.zIndex = "2";
    group.style.pointerEvents = "none";
    group.style.transform = "translateY(0px)";
    group.style.opacity = "1";
    group.style.transition = "none";
    void group.offsetWidth;
    root.requestAnimationFrame(function () {
      if (group._bkSubToken !== token) return;
      var ease = SUB_DURATION + "ms ease-out";
      group.style.transition = "transform " + ease + ", opacity " + ease;
      group.style.transform = "translateY(" + Math.round(height) + "px)";
      group.style.opacity = "0";
    });
    root.setTimeout(function () {
      if (group._bkSubToken !== token || group._bkSubOpen) return;
      clearSubStyles(group);
      group.hidden = true;
      group._bkSubBusy = false;
      var still = false;
      Array.prototype.forEach.call(host.children, function (el) {
        if (el.style && el.style.position === "absolute") still = true;
      });
      if (!still) host.style.position = hostPos;
    }, SUB_DURATION + 40);
  }

  function syncSubtags(group, parent, open, how) {
    if (!group) return;
    open = !!open;
    if (group._bkSubOpen == null && !group._bkSubBusy && (!group.hidden) === open) {
      group._bkSubOpen = open;
      return;
    }
    if (group._bkSubOpen === open) return;
    group._bkSubOpen = open;
    group._bkSubToken = (group._bkSubToken || 0) + 1;
    var token = group._bkSubToken;
    if (subReduced() || !parent) {
      subInstant(group, open);
      return;
    }
    if (!open && how === "push") {
      pushSubtags(group, token);
      return;
    }
    slideSubtags(group, open, token);
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
