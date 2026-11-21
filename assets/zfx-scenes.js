/* ==========================================================================
   ZIANI FX · Scenes
   [data-zs="vitrine"]  → "Die Nachtvitrine" (commercial.html): macro zoom entrance + wall of lit cases + viewer with loupe
   [data-zs="enter"]    → "Eintreten" (interior.html): door index + one door scene with camera ride per location + viewer
   Each module reads the JSON block .zs-data inside its container and only starts if the container exists.
   All scroll effects run in one requestAnimationFrame loop fed by passive listeners; only transform and opacity animate.
   Independent of zfx.js; reuses its CSS tokens and the .zfx-locked / .round-btn classes.
   ========================================================================== */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var mqMouse = window.matchMedia('(hover: hover) and (pointer: fine)');
  function reduced() { return mqReduce.matches; }
  function mouse() { return mqMouse.matches; }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function h(tag, cls, attrs, kids) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (attrs) Object.keys(attrs).forEach(function (k) { if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); });
    return e;
  }
  function corners() { return h('div', 'zs-vf', { 'aria-hidden': 'true' }, [h('i'), h('i'), h('i'), h('i')]); }
  // Statische Fassung (für Besucher ohne JS und für Crawler) weg, sobald die Szene gebaut wird
  function dropStatic(host) {
    var st = host.querySelector('.zs-static');
    if (st) st.parentNode.removeChild(st);
  }
  function readData(host) {
    var el = host.querySelector('.zs-data');
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  }

  /* ---------- one frame loop for every scroll effect ---------- */
  var updaters = [];
  var resizers = [];
  var ticking = false;
  function frame() {
    ticking = false;
    for (var i = 0; i < updaters.length; i++) { try { updaters[i](); } catch (e) { if (window.console) console.warn('zfx-scenes:', e); } }
  }
  function schedule() { if (ticking) return; ticking = true; requestAnimationFrame(frame); }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', function () { resizers.forEach(function (fn) { fn(); }); schedule(); });

  /* ---------- scroll lock: same approach as zfx.js (html.zfx-locked from zfx.css) ---------- */
  var locked = false;
  function lockScroll() {
    if (locked) return;
    locked = true;
    var sbw = window.innerWidth - root.clientWidth;
    root.classList.add('zfx-locked');
    if (sbw > 0) {
      doc.body.style.paddingRight = sbw + 'px';
      var nav = doc.getElementById('navbar');
      if (nav) nav.style.right = sbw + 'px';
    }
  }
  function unlockScroll() {
    if (!locked) return;
    locked = false;
    root.classList.remove('zfx-locked');
    doc.body.style.paddingRight = '';
    var nav = doc.getElementById('navbar');
    if (nav) nav.style.right = '';
  }

  /* ======================================================================
     Viewer: full-screen photo view (same look as the travel album viewer),
     optional loupe (mouse follows, finger drags with the loupe above the finger)
     ====================================================================== */
  var Viewer = (function () {
    var V = null;
    var items = [], idx = 0, title = '', zoom = false, isOpen = false, lastFocus = null, front = 0, token = 0;
    var Z = 2.6;
    var loaded = {};

    function build() {
      var imgs = [h('img', 'zs-lb-img', { alt: '', decoding: 'async', draggable: 'false' }),
                  h('img', 'zs-lb-img', { alt: '', decoding: 'async', draggable: 'false' })];
      var loupe = h('div', 'zs-loupe', { 'aria-hidden': 'true' });
      var fig = h('figure', 'zs-lb-fig', null, [imgs[0], imgs[1], loupe]);
      var cap = h('span', 'zs-lb-cap zs-mono', { 'aria-live': 'polite' });
      var close = h('button', 'round-btn zs-lb-close', { type: 'button', 'aria-label': 'Schließen' }, ['✕']);
      var hud = h('div', 'zs-lb-hud', null, [h('span', 'zs-rec', { 'aria-hidden': 'true' }), cap, close]);
      var prev = h('button', 'round-btn zs-lb-prev', { type: 'button', 'aria-label': 'Vorheriges Foto' }, ['←']);
      var next = h('button', 'round-btn zs-lb-next', { type: 'button', 'aria-label': 'Nächstes Foto' }, ['→']);
      var hint = h('p', 'zs-lb-hint zs-mono');
      var lb = h('div', 'zs-lb', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Detailansicht' }, [fig, corners(), hud, prev, next, hint]);
      doc.body.appendChild(lb);
      V = { lb: lb, imgs: imgs, loupe: loupe, fig: fig, cap: cap, close: close, prev: prev, next: next, hint: hint };

      close.addEventListener('click', closeView);
      prev.addEventListener('click', function () { step(-1); });
      next.addEventListener('click', function () { step(1); });
      lb.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); closeView(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); step(1, true); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1, true); }
        else if (e.key === 'Tab') {
          var f = [close, prev, next];
          var at = f.indexOf(doc.activeElement);
          e.preventDefault();
          f[e.shiftKey ? (at <= 0 ? f.length - 1 : at - 1) : (at === f.length - 1 ? 0 : at + 1)].focus();
        }
      });

      // loupe: the mouse moves it; a finger drags it (it sits above the finger so the finger does not cover it)
      var dragging = false, sx = null;
      fig.addEventListener('pointermove', function (e) {
        if (!zoom) return;
        if (e.pointerType === 'mouse') moveLoupe(e.clientX, e.clientY, 0);
        else if (dragging) moveLoupe(e.clientX, e.clientY, 110);
      });
      fig.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') loupe.classList.remove('is-on'); });
      fig.addEventListener('pointerdown', function (e) {
        if (zoom) {
          if (e.pointerType !== 'mouse') {
            dragging = true;
            try { fig.setPointerCapture(e.pointerId); } catch (err) {}
            moveLoupe(e.clientX, e.clientY, 110);
          }
        } else {
          sx = e.clientX;
        }
      });
      function release(e) {
        if (zoom) {
          if (e.pointerType !== 'mouse') { dragging = false; loupe.classList.remove('is-on'); }
          return;
        }
        if (sx === null) return;
        var dx = e.clientX - sx;
        sx = null;
        if (e.type === 'pointerup' && Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
      }
      fig.addEventListener('pointerup', release);
      fig.addEventListener('pointercancel', release);
    }

    function current() { return V.imgs[front]; }
    function moveLoupe(cx, cy, lift) {
      var img = current();
      var r = img.getBoundingClientRect(), fr = V.fig.getBoundingClientRect();
      var x = cx - r.left, y = cy - r.top;
      if (!r.width || x < 0 || y < 0 || x > r.width || y > r.height) { V.loupe.classList.remove('is-on'); return; }
      var L = V.loupe.offsetWidth;
      V.loupe.style.backgroundImage = 'url("' + img.currentSrc + '")';
      V.loupe.style.backgroundSize = (r.width * Z).toFixed(1) + 'px ' + (r.height * Z).toFixed(1) + 'px';
      V.loupe.style.backgroundPosition = (-(x * Z - L / 2)).toFixed(1) + 'px ' + (-(y * Z - L / 2)).toFixed(1) + 'px';
      V.loupe.style.transform = 'translate3d(' + (cx - fr.left - L / 2).toFixed(1) + 'px,' + (cy - fr.top - L / 2 - lift).toFixed(1) + 'px,0)';
      V.loupe.classList.add('is-on');
    }

    function preload(k) {
      [k + 1, k - 1].forEach(function (j) {
        j = (j + items.length) % items.length;
        var u = items[j].src;
        if (loaded[u]) return;
        var im = new Image();
        im.decoding = 'async';
        im.src = u;
        loaded[u] = im;
      });
    }
    function show(k, fast) {
      idx = k;
      var it = items[k];
      V.cap.textContent = title + ' · ' + pad(k + 1) + ' / ' + pad(items.length);
      V.loupe.classList.remove('is-on');
      var t = ++token;
      var inc = V.imgs[1 - front], out = V.imgs[front];
      if (out.getAttribute('src') === it.src) { out.classList.add('is-current'); return; }
      var done = function () {
        if (t !== token) return;
        if (fast || reduced()) { inc.style.transition = 'none'; out.style.transition = 'none'; }
        else { inc.style.transition = ''; out.style.transition = ''; }
        inc.classList.add('is-current');
        out.classList.remove('is-current');
        front = 1 - front;
      };
      inc.alt = it.alt || '';
      inc.src = it.src;
      if (inc.decode) inc.decode().then(done, done); else done();
      preload(k);
    }
    function step(d, fast) { if (isOpen && items.length > 1) show((idx + d + items.length) % items.length, fast); }

    function open(list, k, opts) {
      if (!V) build();
      items = list; title = opts.title || ''; zoom = !!opts.zoom; lastFocus = opts.from || doc.activeElement;
      V.lb.classList.toggle('is-zoom', zoom);
      V.hint.textContent = zoom
        ? (mouse() ? 'Lupe: Maus über das Foto bewegen' : 'Lupe: Finger auf das Foto legen und ziehen')
        : (mouse() ? 'Pfeiltasten oder Pfeile zum Blättern' : 'Wischen für das nächste Foto');
      V.imgs.forEach(function (im) { im.classList.remove('is-current'); im.removeAttribute('src'); im.style.transition = 'none'; });
      isOpen = true;
      lockScroll();
      V.lb.classList.add('is-visible');
      void V.lb.offsetWidth;
      V.lb.classList.add('is-open');
      show(k, true);
      V.close.focus({ preventScroll: true });
    }
    function closeView() {
      if (!isOpen) return;
      isOpen = false;
      V.lb.classList.remove('is-open');
      V.loupe.classList.remove('is-on');
      setTimeout(function () { if (!isOpen) { V.lb.classList.remove('is-visible'); unlockScroll(); } }, reduced() ? 0 : 230);
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }
    return { open: open };
  })();

  /* ======================================================================
     1. Die Nachtvitrine
     ====================================================================== */
  function Vitrine(host) {
    var d = readData(host);
    if (!d || !d.rows) return;
    dropStatic(host);
    var base = d.base || '';
    var M = d.macro || {};
    var focus = M.focus || '50% 50%';

    // --- macro entrance
    var mImg = h('img', 'zs-macro-img', { src: base + M.f, alt: M.alt || '', decoding: 'async' });
    mImg.style.objectPosition = focus;
    mImg.style.transformOrigin = focus;     // object-position = the detail, so the detail sits at the same % of the box
    var shade = h('div', 'zs-macro-shade');
    var sheen = h('div', 'zs-sheen');
    var stage = h('div', 'zs-macro-stage', null, [
      mImg, shade, h('div', 'zs-vign'), sheen, corners(),
      h('div', 'zs-hud zs-tl zs-mono', null, [h('span', 'zs-rec', { 'aria-hidden': 'true' }), M.kicker || '']),
      h('div', 'zs-hud zs-tr zs-mono', null, [M.place || '']),
      h('div', 'zs-macro-title', null, [h('span', 'zs-mono', null, [M.label || '']), h('h3', null, null, [M.title || d.name || '']), h('p', null, null, [M.line || ''])])
    ]);
    var macro = h('div', 'zs-macro', null, [stage]);

    // --- wall
    var items = [];
    var cases = [];
    var glow = h('div', 'zs-glow', { 'aria-hidden': 'true' });
    var hint = mouse() ? h('span', 'zs-mono zs-hint', null, [d.hint || 'Bewege die Maus, um das Licht zu führen']) : null;
    var count = 0;
    d.rows.forEach(function (row) { count += row.length; });
    var head = h('div', 'zs-wall-head', null, [h('span', 'zs-mono', null, [h('span', 'zs-rec', { 'aria-hidden': 'true' }), (d.name || '') + ' · ' + count + ' Frames']), hint]);
    var grid = h('div', 'zs-cases');
    d.rows.forEach(function (row, ri) {
      var portrait = row.every(function (p) { return p.h > p.w; });
      var r = h('div', 'zs-row' + (portrait ? ' is-portrait' : ''));
      r.style.setProperty('--cols', row.length);
      row.forEach(function (p) {
        var k = items.length;
        items.push({ src: base + p.f, alt: p.alt || (d.name || '') + ' – Foto ' + pad(k + 1) });
        var img = h('img', null, { src: base + p.f, alt: p.alt || '', loading: 'lazy', decoding: 'async', width: p.w, height: p.h });
        var dark = h('span', 'zs-dark');
        dark.style.setProperty('--row', ri);
        var glare = h('span', 'zs-glare');
        var glass = h('span', 'zs-glass', null, [img, dark, glare]);
        glass.style.aspectRatio = p.w + ' / ' + p.h;
        var btn = h('button', 'zs-case', { type: 'button', 'aria-label': 'N° ' + pad(k + 1) + ' – ' + (d.name || '') + ', Detailansicht öffnen' },
          [glass, h('span', 'zs-cap zs-mono', { 'aria-hidden': 'true' }, [h('b', null, null, ['N° ' + pad(k + 1)]), h('span', null, null, [d.name || ''])])]);
        btn.addEventListener('click', function () { Viewer.open(items, k, { title: d.name || '', zoom: true, from: btn }); });
        r.appendChild(btn);
        cases.push({ el: btn, glass: glass, dark: dark, glare: glare, near: false, tilt: false });
      });
      grid.appendChild(r);
    });
    var wall = h('div', 'zs-wall', null, [glow, head, grid]);
    host.appendChild(macro);
    host.appendChild(wall);

    // --- state
    var stageH = 0;
    function measure() { stageH = stage.offsetHeight || window.innerHeight; }
    measure();
    resizers.push(measure);
    var lightsDone = false;
    var mx = null, my = null, hoverEl = null;
    var focusEl = null;
    var R = 290;   // radius of the light cone

    wall.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse' || !mouse()) return;
      mx = e.clientX; my = e.clientY;
      hoverEl = e.target.closest ? e.target.closest('.zs-case') : null;
      schedule();
    });
    wall.addEventListener('pointerleave', function (e) {
      if (e.pointerType !== 'mouse') return;
      mx = null; hoverEl = null;
      schedule();
    });

    function updMacro(H) {
      var r = macro.getBoundingClientRect();
      if (r.bottom < -40 || r.top > H + 40) return;
      if (reduced()) { mImg.style.transform = 'none'; shade.style.opacity = '0'; return; }
      var p = clamp(-r.top / Math.max(1, r.height - stageH), 0, 1);
      var e = easeOut(p);
      mImg.style.transform = 'scale(' + (2.6 - 1.6 * e).toFixed(4) + ')';
      shade.style.opacity = (0.62 * (1 - e)).toFixed(3);
      sheen.style.transform = 'translateX(' + (-120 + 240 * clamp((p - 0.55) / 0.4, 0, 1)).toFixed(1) + '%)';
    }

    function updWall(H) {
      var wr = wall.getBoundingClientRect();
      if (wr.bottom < -40 || wr.top > H + 40) return;

      // "Licht an", once, when the wall comes into view. Nothing waits for it: the cases are visible without it.
      if (!lightsDone && wr.top < H * 0.85) {
        lightsDone = true;
        if (!reduced()) {
          wall.classList.add('is-lighting');
          setTimeout(function () { wall.classList.remove('is-lighting'); }, 150 + (d.rows.length - 1) * 170 + 1150);
        }
      }

      // read every rect first, then write
      var rects = cases.map(function (c) { return c.glass.getBoundingClientRect(); });

      if (!mouse()) {
        // touch: the case closest to the middle of the screen is lit
        var mid = H / 2, best = null, bd = Infinity;
        rects.forEach(function (r, i) {
          if (r.bottom < 0 || r.top > H) return;
          var dd = Math.abs(r.top + r.height / 2 - mid);
          if (dd < bd) { bd = dd; best = cases[i].el; }
        });
        if (best !== focusEl) {
          if (focusEl) focusEl.classList.remove('is-focus');
          if (best) best.classList.add('is-focus');
          focusEl = best;
        }
        return;
      }

      wall.classList.toggle('is-lit-by-mouse', mx !== null);
      if (mx !== null) glow.style.transform = 'translate3d(' + (mx - wr.left).toFixed(1) + 'px,' + (my - wr.top).toFixed(1) + 'px,0)';
      cases.forEach(function (c, i) {
        var r = rects[i];
        var dx = mx === null ? Infinity : Math.max(r.left - mx, 0, mx - r.right);
        var dy = mx === null ? Infinity : Math.max(r.top - my, 0, my - r.bottom);
        var near = dx * dx + dy * dy < R * R;
        if (near) {
          c.dark.style.setProperty('--zx', (mx - r.left).toFixed(1) + 'px');
          c.dark.style.setProperty('--zy', (my - r.top).toFixed(1) + 'px');
          if (!c.near) c.dark.style.setProperty('--zr', R + 'px');
        } else if (c.near) {
          c.dark.style.setProperty('--zr', '0px');
        }
        c.near = near;
        var tilt = c.el === hoverEl && !reduced();
        if (tilt) {
          var nx = (mx - r.left) / r.width - 0.5, ny = (my - r.top) / r.height - 0.5;
          c.glass.style.transform = 'perspective(1200px) rotateY(' + (nx * 7).toFixed(2) + 'deg) rotateX(' + (-ny * 7).toFixed(2) + 'deg)';
          c.glare.style.transform = 'translateX(' + (nx * 60).toFixed(1) + '%)';
        } else if (c.tilt) {
          c.glass.style.transform = '';
        }
        c.tilt = tilt;
      });
    }

    updaters.push(function () { var H = window.innerHeight; updMacro(H); updWall(H); });
  }

  /* ======================================================================
     2. Eintreten
     ====================================================================== */
  function Enter(host) {
    var d = readData(host);
    if (!d || !d.locations) return;
    dropStatic(host);
    var base = d.base || '';
    var DOOR = 1.15, STEP = 0.75, HOLD = 0.6;     // scroll lengths in screen heights (door phase, per photo, hold at the end)
    var L = d.locations.length;

    var index = h('nav', 'zs-doors-index', { 'aria-label': 'Locations' });
    var scenesWrap = h('div', 'zs-scenes zs-bleed');
    var V = d.locations.map(function (loc, li) {
      var sizes = {};
      (loc.photos || []).forEach(function (p) { sizes[p.f] = p; });
      var id = 'location-' + loc.id;
      index.appendChild(h('a', 'zs-door-link', { href: '#' + id }, [h('span', 'zs-mono', null, [pad(li + 1)]), h('b', null, null, [loc.name])]));

      var shotsEl = h('div', 'zs-shots');
      var els = loc.tour.map(function (group, i) {
        var shot = h('div', 'zs-shot ' + (group.length === 1 ? 'is-full' : 'is-multi ' + (group.length === 2 ? 'is-pair' : 'is-trio')));
        var pan = h('div', 'zs-pan');
        var alt = loc.name + ' – Innenaufnahme';
        if (group.length === 1) {
          var p = sizes[group[0]] || { w: 3, h: 2 };
          shot.appendChild(h('img', 'zs-bg', { src: base + group[0], alt: '', loading: 'lazy', decoding: 'async', 'aria-hidden': 'true' }));
          pan.appendChild(h('img', null, { src: base + group[0], alt: (sizes[group[0]] && sizes[group[0]].alt) || alt, loading: 'lazy', decoding: 'async' }));
          shot.dataset.portrait = p.h > p.w ? '1' : '0';
        } else {
          group.forEach(function (f) {
            pan.appendChild(h('div', 'zs-cell', null, [h('img', null, { src: base + f, alt: (sizes[f] && sizes[f].alt) || alt, loading: 'lazy', decoding: 'async' })]));
          });
        }
        shot.appendChild(pan);
        shotsEl.appendChild(shot);
        return shot;
      });

      function sign() {
        var strong = h('strong', null, null, [loc.name]);
        strong.style.setProperty('--chars', Math.max(4, loc.name.length));
        return h('div', 'zs-sign', null, [h('span', 'zs-mono', null, ['Location ' + pad(li + 1) + ' / ' + pad(L)]), strong, h('span', 'zs-mono', null, ['Scrollen zum Eintreten'])]);
      }
      var shade = h('div', 'zs-inner-shade');
      var dl = h('div', 'zs-door zs-l', null, [h('span', 'zs-handle'), sign()]);
      var dr = h('div', 'zs-door zs-r', { 'aria-hidden': 'true' }, [h('span', 'zs-handle'), sign()]);
      var leak = h('div', 'zs-leak', { 'aria-hidden': 'true' });
      var frameText = h('span', 'zs-frame');
      var bar = h('b');
      var all = h('button', 'zs-all zs-mono', { type: 'button' }, ['Alle Fotos ansehen']);
      var stage = h('div', 'zs-stage', null, [
        shotsEl, shade, dl, dr, leak, corners(),
        h('div', 'zs-hud zs-tl zs-mono', null, [d.kicker || 'Hospitality & Interior']),
        h('div', 'zs-hud zs-tr zs-mono', null, ['Eintreten']),
        h('div', 'zs-hud zs-bl zs-mono', null, [h('span', 'zs-rec', { 'aria-hidden': 'true' }), frameText]),
        all,
        h('div', 'zs-progress', { 'aria-hidden': 'true' }, [bar])
      ]);
      var scene = h('div', 'zs-scene', { id: id, 'aria-label': loc.name }, [stage]);
      var U = DOOR + (els.length - 1) * STEP + HOLD;
      scene.style.height = ((U + 1) * 100) + 'vh';
      scene.style.height = 'calc(' + (U + 1) + ' * 100svh)';   // ignored where svh is unknown, the vh value stays
      scenesWrap.appendChild(scene);

      var photos = (loc.photos || []).map(function (p, k) { return { src: base + p.f, alt: p.alt || loc.name + ' – Foto ' + pad(k + 1) }; });
      all.addEventListener('click', function () { if (photos.length) Viewer.open(photos, 0, { title: loc.name, zoom: false, from: all }); });

      return { name: loc.name, scene: scene, stage: stage, els: els, pans: els.map(function (e) { return e.querySelector('.zs-pan'); }),
               shade: shade, dl: dl, dr: dr, leak: leak, frameText: frameText, bar: bar, U: U, cur: -1, open: -1 };
    });
    host.appendChild(index);
    host.appendChild(scenesWrap);

    // portrait photo on a landscape screen (or the other way round): show it whole over a blurred copy of itself
    function fit() {
      var land = window.innerWidth >= window.innerHeight;
      V.forEach(function (v) {
        v.els.forEach(function (el) {
          if (el.classList.contains('is-full')) el.classList.toggle('is-contain', (el.dataset.portrait === '1') === land);
        });
      });
    }
    var H = 0;
    function measure() { H = V[0] ? V[0].stage.offsetHeight || window.innerHeight : window.innerHeight; fit(); }
    measure();
    resizers.push(measure);

    var pinned = false;
    updaters.push(function () {
      var any = false;
      var red = reduced();
      V.forEach(function (v) {
        var r = v.scene.getBoundingClientRect();
        if (r.top <= 1 && r.bottom >= H - 1) any = true;
        if (r.bottom < -H || r.top > H * 1.5) return;
        var u = clamp(-r.top / H, 0, v.U);
        var dp = clamp((u - 0.12) / (DOOR - 0.27), 0, 1);
        var de = easeOut(dp);
        if (red) {
          v.dl.style.opacity = v.dr.style.opacity = (1 - dp).toFixed(3);
          v.dl.style.transform = v.dr.style.transform = '';
        } else {
          v.dl.style.transform = 'translate3d(' + (-de * 101).toFixed(2) + '%,0,0)';
          v.dr.style.transform = 'translate3d(' + (de * 101).toFixed(2) + '%,0,0)';
          v.dl.style.opacity = v.dr.style.opacity = '';
        }
        var gone = dp >= 0.995;
        if (gone !== v.open) { v.dl.style.visibility = v.dr.style.visibility = gone ? 'hidden' : ''; v.open = gone; }
        v.leak.style.opacity = (0.75 * (1 - dp)).toFixed(3);
        v.shade.style.opacity = (0.55 * (1 - de)).toFixed(3);
        var cur = 0;
        v.els.forEach(function (el, i) {
          var start = i === 0 ? 0 : DOOR + (i - 1) * STEP;
          var o = i === 0 ? 1 : clamp((u - start) / 0.3, 0, 1);
          el.style.opacity = o.toFixed(3);
          if (o > 0.5) cur = i;
          if (red) { v.pans[i].style.transform = ''; return; }
          var t = clamp((u - start) / (i === 0 ? DOOR + STEP : STEP + 0.3), 0, 1);
          var dir = i % 2 ? -1 : 1;
          var s = i === 0 ? 1 + 0.12 * easeOut(t) : 1.08 - 0.06 * t;
          v.pans[i].style.transform = 'translate3d(' + (dir * (-1.5 + 3 * t)).toFixed(2) + '%,0,0) scale(' + s.toFixed(4) + ')';
        });
        if (cur !== v.cur) { v.frameText.textContent = v.name + ' · Frame ' + pad(cur + 1) + ' / ' + pad(v.els.length); v.cur = cur; }
        v.bar.style.transform = 'scaleX(' + (u / v.U).toFixed(4) + ')';
      });
      if (any !== pinned) { pinned = any; root.classList.toggle('zs-pinned', any); }
    });
  }

  function boot() {
    var started = false;
    Array.prototype.forEach.call(doc.querySelectorAll('[data-zs]'), function (host) {
      try {
        var kind = host.getAttribute('data-zs');
        if (kind === 'vitrine') { Vitrine(host); started = true; }
        else if (kind === 'enter') { Enter(host); started = true; }
      } catch (err) { if (window.console) console.warn('zfx-scenes:', err); }
    });
    if (started) schedule();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
