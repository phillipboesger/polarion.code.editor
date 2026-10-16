/* Visual explainer for this project site: shape and flow only, drawn on canvas.
   Each canvas runs only while visible and shows one calm frame for reduced motion. */
(function () {
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var C = { cyan: "#62d6ff", blue: "#6aa9ff", warm: "#ffc266", mint: "#7be0b0", coral: "#ff8fa3", ice: "#bdeeff" };
  var TAU = Math.PI * 2;
  function rgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a.toFixed(3) + ")";
  }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  var MONO = "600 11px 'Geist Mono', ui-monospace, Menlo, monospace";
  function stage(canvas, init, draw) {
    var ctx = canvas.getContext("2d");
    var w = 0, h = 0, visible = false, raf = 0, last = 0, t0 = 0, state = null;
    function size() {
      var r = canvas.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      state = init(w, h, state);
      if (reduce || !visible) frame(performance.now(), true);
    }
    function frame(now, still) {
      if (!t0) t0 = now;
      var t = reduce ? 40 : (now - t0) / 1000;
      var dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
      last = now;
      ctx.clearRect(0, 0, w, h);
      draw(ctx, w, h, t, dt, state, reduce || still);
      if (!reduce && visible && !still) raf = requestAnimationFrame(function (n) { frame(n, false); });
    }
    if ("ResizeObserver" in window) new ResizeObserver(size).observe(canvas);
    else window.addEventListener("resize", size);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        cancelAnimationFrame(raf);
        last = 0;
        if (visible && !reduce) raf = requestAnimationFrame(function (n) { frame(n, false); });
      }).observe(canvas);
    } else {
      visible = true;
      if (!reduce) raf = requestAnimationFrame(function (n) { frame(n, false); });
    }
    size();
  }
  function bez(p0, p1, p2, p3, u) {
    var m = 1 - u;
    return m * m * m * p0 + 3 * m * m * u * p1 + 3 * m * u * u * p2 + u * u * u * p3;
  }
  var q = function (id) { return document.getElementById(id); };
  /* Hero: faint code lines scroll on both sides like an editor minimap. */
  function heroEditor(canvas) {
    var R = rng(21);
    var cols = [C.cyan, C.blue, C.warm, C.mint, C.coral, "#ffffff"];
    var lines = [];
    for (var i = 0; i < 90; i++) {
      var segs = [], x = 0, indent = Math.floor(R() * 4) * 18, n = 2 + Math.floor(R() * 4);
      for (var k = 0; k < n; k++) { var wd = 20 + R() * 90; segs.push([x, wd, cols[Math.floor(R() * cols.length)]]); x += wd + 8; }
      lines.push({ indent: indent, segs: segs });
    }
    return stage(canvas, function () { return {}; }, function (ctx, w, h, t, dt, s, still) {
      var lh = 22, off = still ? 0 : (t * 14) % (lh * lines.length);
      var colW = Math.max(0, Math.min(240, w * 0.16));
      [0, 1].forEach(function (side) {
        var x0 = side ? w - colW - 24 : 24;
        for (var y = -lh; y < h + lh; y += lh) {
          var idx = Math.floor((y + off + (side ? 400 : 0)) / lh) % lines.length;
          var ln = lines[(idx + lines.length) % lines.length];
          var fade = Math.min(1, Math.min(y, h - y) / (h * 0.25));
          if (fade <= 0) continue;
          ln.segs.forEach(function (sg) {
            ctx.fillStyle = rgba(sg[2], 0.2 * fade);
            roundRect(ctx, x0 + ln.indent + sg[0], y, Math.min(sg[1], colW - ln.indent - sg[0]), 8, 4);
            if (sg[0] + ln.indent < colW) ctx.fill();
          });
        }
      });
    });
  }

  /* Block: a typed Velocity macro in a Monaco-style window, saved with Ctrl+S. */
  function typeEditor(root) {
    var code = root.querySelector("[data-code]");
    var status = root.querySelector("[data-status]");
    var script = [
      ['#', 'cm'], [' macro', 'kw'], ['(', 'pn'], ['workItemRow', 'fn'], [' ', ''], ['$wi', 'vr'], [')', 'pn'], ['\n', ''],
      ['  <tr>', 'tg'], ['\n', ''],
      ['    <td>', 'tg'], ['$wi', 'vr'], ['.', 'pn'], ['getId', 'fn'], ['()', 'pn'], ['</td>', 'tg'], ['\n', ''],
      ['    <td>', 'tg'], ['$wi', 'vr'], ['.', 'pn'], ['getStatus', 'fn'], ['()', 'pn'], ['</td>', 'tg'], ['\n', ''],
      ['  </tr>', 'tg'], ['\n', ''],
      ['#', 'cm'], ['end', 'kw']
    ];
    script[0] = ['#', 'kw'];
    var html = "", total = 0;
    script.forEach(function (s) { total += s[0].length; });
    function render(n) {
      var out = "", left = n;
      for (var i = 0; i < script.length && left > 0; i++) {
        var txt = script[i][0].slice(0, left); left -= txt.length;
        txt = txt.replace(/&/g, "&amp;").replace(/</g, "&lt;");
        out += script[i][1] ? '<span class="' + script[i][1] + '">' + txt + "</span>" : txt;
      }
      code.innerHTML = out + '<span class="caret"></span>';
    }
    if (reduce) { render(total); status.textContent = "Saved"; return; }
    var n = 0, phase = 0, timer = null, visible = false;
    function tick() {
      if (!visible) { timer = null; return; }
      if (phase === 0) {
        n += 1; render(n); status.textContent = "Editing";
        if (n >= total) { phase = 1; timer = setTimeout(tick, 700); return; }
        timer = setTimeout(tick, 38 + Math.random() * 40);
      } else if (phase === 1) {
        status.textContent = "Saved"; root.classList.add("is-saved"); phase = 2; timer = setTimeout(tick, 2600);
      } else { root.classList.remove("is-saved"); n = 0; phase = 0; render(0); timer = setTimeout(tick, 600); }
    }
    render(0);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        if (visible && !timer) timer = setTimeout(tick, 300);
      }).observe(root);
    }
  }
  if (q("viz-hero")) heroEditor(q("viz-hero"));
  var ed = document.querySelector("[data-editor-demo]");
  if (ed) typeEditor(ed);
})();
