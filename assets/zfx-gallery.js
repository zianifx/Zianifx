/* ==========================================================================
   ZIANI FX · Gallery component (prototype)
   Usage: <div class="zg" data-zg="KEY"><script type="application/json" class="zg-data">{…}</script></div>
   Data:  { "base": "Images/Travel/", "albums": [ { "id", "title", "short", "code", "cover", "pos",
            "images": [ { "f": "01.jpg", "w": 1667, "h": 2500 }, … ] } ] }
          Photos: <base><id>/<f>, thumbnails: <base><id>/thumbs/<f>.
   Builds an accordion of albums and a fullscreen album view (filmstrip, contact sheet, swipe, keys, URL hash
   #KEY-<id>-NN). Independent of zfx.js; reuses its CSS tokens and the .zfx-locked / .btn / .round-btn classes.
   ========================================================================== */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';      // = --ease-out in zfx.css
  var EASE_DRAWER = 'cubic-bezier(0.32, 0.72, 0, 1)';   // = --ease-drawer in zfx.css
  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var mqHover = window.matchMedia('(hover: hover) and (pointer: fine)');
  function reduced() { return mqReduce.matches; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function h(tag, cls, attrs, kids) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (attrs) Object.keys(attrs).forEach(function (k) { if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); });
    return e;
  }
  function svgEl(tag, attrs) {
    var e = doc.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  function isFocusVisible(el) { try { return el.matches(':focus-visible'); } catch (e) { return true; } }

  /* Scroll lock: same approach as zfx.js (html.zfx-locked from zfx.css + scrollbar compensation) */
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

  /* A hand-drawn double loop (grease pencil) in a 0–100 box */
  function pencilLoop() {
    var svg = svgEl('svg', { class: 'zg-a-mark', viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    [[0, 0, 1, 1, -1.9], [1.2, -0.8, 1.04, 0.97, -1.7]].forEach(function (o) {
      var d = '';
      for (var i = 0; i <= 70; i++) {
        var a = (i / 64) * Math.PI * 2 + o[4];
        var wob = 1 + Math.sin(i * 1.7) * 0.015 + Math.cos(i * 0.9) * 0.012;
        d += (i ? 'L' : 'M') + (50 + o[0] + Math.cos(a) * 46 * o[2] * wob).toFixed(2) + ' ' + (50 + o[1] + Math.sin(a) * 46 * o[3] * wob).toFixed(2);
      }
      svg.appendChild(svgEl('path', { d: d }));
    });
    return svg;
  }

  function Gallery(host) {
    var dataEl = host.querySelector('.zg-data');
    if (!dataEl) return;
    var data;
    try { data = JSON.parse(dataEl.textContent); } catch (err) { return; }
    var albums = (data.albums || []).filter(function (a) { return a && a.id && a.images && a.images.length; });
    if (!albums.length) return;
    var key = host.getAttribute('data-zg') || 'gallery';
    albums.forEach(function (a) {
      a.dir = (data.base || '') + a.id + '/';
      a.coverIndex = Math.max(0, a.images.map(function (x) { return x.f; }).indexOf(a.cover));
      if (!a.cover) a.cover = a.images[0].f;
    });

    /* ============ Accordion ============ */
    var acc = h('div', 'zg-acc');
    acc.style.setProperty('--zg-n', albums.length);
    var openIdx = -1;
    var down = { i: -1, wasOpen: false, t: 0 };

    var panels = albums.map(function (a, i) {
      var cover = h('img', 'zg-cover', { src: a.dir + a.cover, alt: '', decoding: 'async', fetchpriority: 'low' });
      cover.style.objectPosition = a.pos || '50% 50%';
      var corners = h('span', 'zg-corners', { 'aria-hidden': 'true' }, [h('i'), h('i'), h('i'), h('i')]);
      var vlabel = h('span', 'zg-vlabel', { 'aria-hidden': 'true' }, [(a.short || a.title) + ' · ', h('b', null, null, [a.code || ''])]);
      var info = h('span', 'zg-info', { 'aria-hidden': 'true' }, [
        h('span', 'zg-title', null, [a.title]),
        h('span', 'zg-hud', null, [h('span', 'zg-rec'), (a.code ? a.code + ' — ' : '') + a.images.length + ' Frames']),
        h('span', 'btn btn-solid btn-sm zg-cta', null, ['Album öffnen ', h('span', 'arr', null, ['→'])])
      ]);
      var hit = h('button', 'zg-hit', { type: 'button', 'aria-label': a.title + ', ' + a.images.length + ' Fotos – Album öffnen' },
        [cover, h('span', 'zg-desat'), h('span', 'zg-dim'), h('span', 'zg-grad'), corners, vlabel, info]);
      var el = h('div', 'zg-panel', null, [hit]);

      hit.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse' && mqHover.matches) setOpen(i); });
      hit.addEventListener('focus', function () { if (isFocusVisible(hit)) setOpen(i); });
      hit.addEventListener('pointerdown', function () { down = { i: i, wasOpen: openIdx === i, t: Date.now() }; });
      hit.addEventListener('click', function () {
        // touch: the first tap opens the panel, the second opens the album; mouse/keyboard: the panel is already open
        var wasOpen = (down.i === i && Date.now() - down.t < 1500) ? down.wasOpen : openIdx === i;
        down.i = -1;
        if (!wasOpen) { setOpen(i); return; }
        openAlbum(i, 0, true);
      });
      acc.appendChild(el);
      return { el: el, hit: hit };
    });

    function setOpen(i) {
      if (i === openIdx) return;
      openIdx = i;
      panels.forEach(function (p, k) { p.el.classList.toggle('is-open', k === i); });
    }
    setOpen(0);
    host.appendChild(acc);

    /* ============ Album ============ */
    var A = null;          // DOM references, built on first open
    var ai = 0;            // current album
    var idx = 0;           // current frame
    var atEnd = false;     // "next album" card is showing
    var isOpen = false;
    var sheetOpen = false;
    var front = 0;         // which of the two photo layers is visible
    var token = 0;
    var pushed = false;    // we pushed a history entry for the hash
    var ignorePop = false;
    var running = null;    // open/close animation
    var preloaded = {};

    function buildAlbum() {
      var photos = [h('img', 'zg-a-photo is-current', { alt: '', decoding: 'async', draggable: 'false' }),
                    h('img', 'zg-a-photo', { alt: '', decoding: 'async', draggable: 'false' })];
      var zonePrev = h('button', 'zg-a-zone is-prev', { type: 'button', 'aria-label': 'Vorheriges Foto' });
      var zoneNext = h('button', 'zg-a-zone is-next', { type: 'button', 'aria-label': 'Nächstes Foto' });
      var endKicker = h('span', 'zg-a-end-kicker');
      var endName = h('span');
      var endBtn = h('button', 'zg-a-next-album', { type: 'button' }, ['Weiter:', endName, h('span', 'arr', { 'aria-hidden': 'true' }, ['→'])]);
      var end = h('div', 'zg-a-end', null, [endKicker, endBtn]);
      var stage = h('div', 'zg-a-stage', null, [photos[0], photos[1], zonePrev, zoneNext, h('span', 'zg-a-loading', { 'aria-hidden': 'true' }, ['Lädt']), end]);

      var titleText = h('span');
      var title = h('span', 'zg-a-title', null, [h('span', 'zg-rec', { 'aria-hidden': 'true' }), titleText]);
      var count = h('span', 'zg-a-count', { 'aria-live': 'polite' });
      var gridIcon = svgEl('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true' });
      [[1.5, 1.5], [9.5, 1.5], [1.5, 9.5], [9.5, 9.5]].forEach(function (p) { gridIcon.appendChild(svgEl('rect', { x: p[0], y: p[1], width: 5, height: 5, rx: 0.6 })); });
      var sheetBtn = h('button', 'zg-a-sheet-btn', { type: 'button', 'aria-pressed': 'false', 'aria-label': 'Kontaktabzug' }, [gridIcon, h('span', 'zg-a-sheet-txt', null, ['Kontaktabzug'])]);
      var closeBtn = h('button', 'round-btn zg-a-close', { type: 'button', 'aria-label': 'Album schließen' }, ['✕']);
      var hud = h('div', 'zg-a-hud zg-a-ui', null, [title, count, sheetBtn, closeBtn]);
      var corners = h('div', 'zg-a-corners zg-a-ui', { 'aria-hidden': 'true' }, [h('i'), h('i'), h('i'), h('i')]);
      var strip = h('div', 'zg-a-strip zg-a-ui', { role: 'group', 'aria-label': 'Filmstreifen' });
      var sheetHead = h('div', 'zg-a-sheet-head');
      var grid = h('div', 'zg-a-grid');
      var sheet = h('div', 'zg-a-sheet', { role: 'group', 'aria-label': 'Kontaktabzug' }, [h('div', 'zg-a-sheet-inner', null, [sheetHead, grid])]);
      var album = h('div', 'zg-album', { role: 'dialog', 'aria-modal': 'true' }, [hud, stage, corners, strip, sheet]);
      doc.body.appendChild(album);

      A = { album: album, stage: stage, photos: photos, zonePrev: zonePrev, zoneNext: zoneNext, end: end, endKicker: endKicker,
            endName: endName, endBtn: endBtn, titleText: titleText, count: count, sheetBtn: sheetBtn, closeBtn: closeBtn,
            strip: strip, sheet: sheet, sheetHead: sheetHead, grid: grid, thumbs: [], cells: [] };

      closeBtn.addEventListener('click', function () { closeAlbum(false); });
      sheetBtn.addEventListener('click', function () { if (sheetOpen) closeSheet(); else openSheet(); });
      endBtn.addEventListener('click', function () { nextAlbum(); });
      zonePrev.addEventListener('click', function () { if (consumeDrag()) return; go(-1); });
      zoneNext.addEventListener('click', function () { if (consumeDrag()) return; go(1); });
      album.addEventListener('keydown', onKey);
      bindSwipe(stage);
    }

    function setAlbum(i) {
      ai = i;
      var a = albums[i];
      A.album.setAttribute('aria-label', 'Album: ' + a.title);
      A.titleText.textContent = a.title;
      var nxt = albums[(i + 1) % albums.length];
      A.endName.textContent = nxt.short || nxt.title;
      A.endKicker.textContent = 'Ende · ' + (a.short || a.title) + ' · ' + a.images.length + ' Frames';

      // filmstrip
      A.strip.textContent = '';
      A.thumbs = a.images.map(function (im, k) {
        var t = h('button', 'zg-a-thumb', { type: 'button', 'aria-label': 'Foto ' + (k + 1) + ' von ' + a.images.length },
          [h('img', null, { src: a.dir + 'thumbs/' + im.f, alt: '', loading: 'lazy', decoding: 'async', width: Math.round(72 * im.w / im.h), height: 72 }),
           h('span', null, { 'aria-hidden': 'true' }, [pad(k + 1)])]);
        t.addEventListener('click', function () { show(k, k > idx ? 1 : -1); });
        A.strip.appendChild(t);
        return t;
      });

      // contact sheet
      A.sheetHead.textContent = '';
      A.sheetHead.appendChild(h('span', null, null, ['Kontaktabzug · ', h('b', null, null, [a.code || '']), ' ' + a.title]));
      A.sheetHead.appendChild(h('span', null, null, [a.images.length + ' Frames']));
      A.grid.textContent = '';
      A.cells = a.images.map(function (im, k) {
        var frame = h('span', 'zg-a-frame', null, [h('img', null, { src: a.dir + 'thumbs/' + im.f, alt: '', loading: 'lazy', decoding: 'async', width: im.w, height: im.h })]);
        if (k === a.coverIndex) frame.appendChild(pencilLoop());
        var c = h('button', 'zg-a-cell', { type: 'button', 'aria-label': 'Foto ' + (k + 1) + (k === a.coverIndex ? ' (Aufmacher)' : '') },
          [frame, h('span', 'zg-a-no', { 'aria-hidden': 'true' }, [h('b', null, null, ['▸ ']), pad(k + 1)])]);
        c.addEventListener('click', function () { closeSheet(true); show(k, k > idx ? 1 : -1); });
        A.grid.appendChild(c);
        return c;
      });
    }

    /* ----- frames ----- */
    function url(k) { return albums[ai].dir + albums[ai].images[k].f; }
    function preload(k) {
      [k + 1, k - 1, k + 2].forEach(function (j) {
        if (j < 0 || j >= albums[ai].images.length) return;
        var u = url(j);
        if (preloaded[u]) return;
        var im = new Image();
        im.decoding = 'async';
        im.src = u;
        preloaded[u] = im;
      });
    }
    function updateUI() {
      var n = albums[ai].images.length;
      A.count.textContent = atEnd ? 'Ende' : 'Frame ' + pad(idx + 1) + ' / ' + pad(n);
      A.thumbs.forEach(function (t, k) {
        var on = k === idx && !atEnd;
        t.classList.toggle('is-current', on);
        if (on) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current');
      });
      A.cells.forEach(function (c, k) { c.classList.toggle('is-current', k === idx); });
      var t = A.thumbs[idx];
      if (t) {
        var left = t.offsetLeft - (A.strip.clientWidth - t.offsetWidth) / 2;
        A.strip.scrollTo({ left: Math.max(0, left), behavior: reduced() || !isOpen ? 'auto' : 'smooth' });
      }
    }
    function setHash() {
      var hash = '#' + key + '-' + albums[ai].id + '-' + pad(idx + 1);
      if (location.hash === hash) return;
      try { history.replaceState(history.state, '', hash); } catch (e) {}
    }
    function transitionFor(d) { return 'opacity ' + d + 'ms ease, transform ' + (d + 150) + 'ms ' + EASE_OUT; }

    // Show frame k. dir: +1 forward, -1 back, 0 instant. fast: keyboard (shorter crossfade).
    function show(k, dir, fast) {
      var a = albums[ai];
      k = Math.max(0, Math.min(a.images.length - 1, k));
      setEnd(false);
      idx = k;
      updateUI();
      setHash();
      preload(k);
      var t = ++token;
      var inc = A.photos[1 - front];
      var out = A.photos[front];
      var src = url(k);
      if (out.getAttribute('src') === src && out.complete && out.naturalWidth) {   // already on screen
        out.style.transition = transitionFor(200);
        out.style.opacity = '1';
        out.style.transform = '';
        return;
      }
      inc.alt = 'Reisefotografie ' + a.title + ' – Frame ' + pad(k + 1);
      A.stage.classList.add('is-loading');
      var done = function () {
        if (t !== token) return;
        A.stage.classList.remove('is-loading');
        var d = fast ? 140 : 250;   // keys: a quick fade only, no movement
        var shift = (!dir || fast || reduced() || !isOpen) ? 0 : 22 * dir;
        inc.style.transition = 'none';
        inc.style.opacity = '0';
        inc.style.transform = shift ? 'translateX(' + shift + 'px)' : '';
        void inc.offsetWidth;
        if (!dir || !isOpen) {
          inc.style.transition = 'none';
          out.style.transition = 'none';
        } else {
          inc.style.transition = transitionFor(d);
          out.style.transition = transitionFor(d);
        }
        inc.style.opacity = '1';
        inc.style.transform = '';
        out.style.opacity = '0';
        out.style.transform = shift ? 'translateX(' + (-shift) + 'px)' : out.style.transform;
        inc.classList.add('is-current');
        out.classList.remove('is-current');
        front = 1 - front;
      };
      inc.src = src;
      if (inc.decode) inc.decode().then(done, done); else if (inc.complete) done(); else inc.onload = inc.onerror = done;
    }
    function setEnd(on) {
      if (atEnd === on) return;
      atEnd = on;
      A.stage.classList.toggle('is-end', on);
      var p = A.photos[front];
      p.style.transition = transitionFor(250);
      p.style.opacity = on ? '0.12' : '1';
      p.style.transform = '';
    }
    function go(dir, fast) {
      var n = albums[ai].images.length;
      if (atEnd) {
        if (dir < 0) { setEnd(false); updateUI(); setHash(); } else nextAlbum();
        return;
      }
      var k = idx + dir;
      if (k >= n) { setEnd(true); updateUI(); A.endBtn.focus({ preventScroll: true }); return; }
      if (k < 0) return;
      show(k, dir, fast);
    }
    function nextAlbum() {
      var j = (ai + 1) % albums.length;
      setAlbum(j);
      setOpen(j);                       // the accordion behind follows, so closing lands on this album
      lastFocus = panels[j].hit;
      atEnd = false;                    // keep the dimmed last photo: the first frame of the next album crossfades from it
      A.stage.classList.remove('is-end');
      show(0, 1);
      A.closeBtn.focus({ preventScroll: true });
    }

    /* ----- contact sheet ----- */
    function openSheet() {
      if (sheetOpen) return;
      sheetOpen = true;
      A.sheet.classList.add('is-open');
      A.sheetBtn.setAttribute('aria-pressed', 'true');
      var c = A.cells[idx];
      if (c) {
        A.sheet.scrollTop = Math.max(0, c.offsetTop - A.sheet.clientHeight / 3);
        c.focus({ preventScroll: true });
      }
    }
    function closeSheet(silent) {
      if (!sheetOpen) return;
      sheetOpen = false;
      A.sheet.classList.remove('is-open');
      A.sheetBtn.setAttribute('aria-pressed', 'false');
      if (!silent) A.sheetBtn.focus({ preventScroll: true });
    }

    /* ----- open / close ----- */
    var lastFocus = null;
    function panelRect(i) {
      var r = panels[i].el.getBoundingClientRect();
      return (r.width && r.bottom > 0 && r.top < window.innerHeight) ? r : null;
    }
    function insetFor(r) {
      return 'inset(' + r.top.toFixed(1) + 'px ' + (window.innerWidth - r.right).toFixed(1) + 'px ' +
        (window.innerHeight - r.bottom).toFixed(1) + 'px ' + r.left.toFixed(1) + 'px round 14px)';
    }
    function openAlbum(i, k, viaPanel) {
      if (isOpen) return;
      if (!A) buildAlbum();
      if (running) { running.cancel(); running = null; }
      isOpen = true;
      lastFocus = panels[i].hit;
      setOpen(i);
      setAlbum(i);
      atEnd = false;
      A.stage.classList.remove('is-end');
      A.photos.forEach(function (p) { p.style.transition = 'none'; p.style.opacity = '0'; p.style.transform = ''; });
      // own history entry first, so the browser's Back button closes the album instead of leaving the page
      var hash = '#' + key + '-' + albums[i].id + '-' + pad(k + 1);
      try {
        if (location.hash !== hash) { history.pushState({ zg: key }, '', hash); pushed = true; }
      } catch (e) {}
      lockScroll();
      A.album.classList.add('is-visible');
      A.album.classList.remove('is-ready');
      show(k, 0);
      updateUI();
      var r = viaPanel ? panelRect(i) : null;
      if (A.album.animate) {
        running = (r && !reduced())
          ? A.album.animate([{ clipPath: insetFor(r) }, { clipPath: 'inset(0px 0px 0px 0px round 0px)' }], { duration: 480, easing: EASE_DRAWER })
          : A.album.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduced() ? 200 : 260, easing: EASE_OUT });
        running.onfinish = function () { running = null; };
      }
      // the HUD and filmstrip arrive while the frame is still growing (one gesture, not a queue)
      setTimeout(function () { if (isOpen) A.album.classList.add('is-ready'); }, reduced() ? 0 : 180);
      A.closeBtn.focus({ preventScroll: true });
    }
    function closeAlbum(fromHistory) {
      if (!isOpen) return;
      isOpen = false;
      closeSheet(true);
      A.album.classList.remove('is-ready');
      if (running) { running.cancel(); running = null; }
      var r = panelRect(ai);
      var finish = function () {
        A.album.classList.remove('is-visible');
        if (running) { running.cancel(); running = null; }
        unlockScroll();
      };
      if (A.album.animate) {
        running = (r && !reduced())
          ? A.album.animate([{ clipPath: 'inset(0px 0px 0px 0px round 0px)' }, { clipPath: insetFor(r) }], { duration: 320, easing: EASE_OUT, fill: 'forwards' })
          : A.album.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: EASE_OUT, fill: 'forwards' });
        running.onfinish = finish;
      } else {
        finish();
      }
      if (lastFocus) lastFocus.focus({ preventScroll: true });
      if (!fromHistory) {
        if (pushed) { pushed = false; ignorePop = true; history.back(); }
        else { try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) {} }
      } else {
        pushed = false;
      }
    }

    /* ----- keys and focus ----- */
    function focusables() {
      var list = [A.sheetBtn, A.closeBtn];
      if (sheetOpen) return list.concat(A.cells);
      list.push(A.zonePrev, A.zoneNext);
      if (atEnd) list.push(A.endBtn);
      return list.concat(A.thumbs);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); if (sheetOpen) closeSheet(); else closeAlbum(false); return; }
      if (e.key === 'Tab') {
        var f = focusables();
        var at = f.indexOf(doc.activeElement);
        e.preventDefault();
        var nxt = e.shiftKey ? (at <= 0 ? f.length - 1 : at - 1) : (at === -1 || at === f.length - 1 ? 0 : at + 1);
        f[nxt].focus();
        return;
      }
      if (sheetOpen) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1, true); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1, true); }
    }

    /* ----- swipe: the photo follows the finger, a flick or a long drag changes the frame ----- */
    var dragged = false;
    function consumeDrag() { var d = dragged; dragged = false; return d; }
    function bindSwipe(stage) {
      var pid = null, sx = 0, sy = 0, t0 = 0, axis = null, dx = 0;
      stage.addEventListener('pointerdown', function (e) {
        if (pid !== null || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
        if (window.visualViewport && window.visualViewport.scale > 1.01) return;   // pinch-zoomed: leave panning to the browser
        pid = e.pointerId; sx = e.clientX; sy = e.clientY; t0 = performance.now(); axis = null; dx = 0; dragged = false;
      });
      stage.addEventListener('pointermove', function (e) {
        if (e.pointerId !== pid) return;
        dx = e.clientX - sx;
        var dy = e.clientY - sy;
        if (!axis) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
          if (axis === 'x') { dragged = true; try { stage.setPointerCapture(pid); } catch (err) {} }
        }
        if (axis !== 'x' || atEnd) return;
        var edge = idx === 0 && dx > 0;
        var p = A.photos[front];
        p.style.transition = 'none';
        p.style.transform = 'translateX(' + (edge ? dx * 0.35 : dx) + 'px)';   // friction at the first frame
      });
      function end(e) {
        if (e.pointerId !== pid) return;
        pid = null;
        if (axis !== 'x') return;
        var v = dx / Math.max(1, performance.now() - t0);
        var dir = (Math.abs(dx) > 70 || Math.abs(v) > 0.45) ? (dx < 0 ? 1 : -1) : 0;
        if (e.type === 'pointercancel') dir = 0;
        if (dir === -1 && idx === 0 && !atEnd) dir = 0;
        if (dir) { go(dir); return; }
        var p = A.photos[front];
        p.style.transition = 'transform 320ms ' + EASE_OUT;
        p.style.transform = '';
      }
      stage.addEventListener('pointerup', end);
      stage.addEventListener('pointercancel', end);
    }

    /* ----- URL hash: #KEY-<album>-NN opens that frame; browser Back closes the album ----- */
    var re = new RegExp('^#' + key + '-(.+)-(\\d{1,3})$');
    function fromHash() {
      var m = re.exec(location.hash || '');
      if (!m) return null;
      for (var i = 0; i < albums.length; i++) {
        if (albums[i].id === m[1]) return { a: i, k: Math.min(albums[i].images.length, Math.max(1, parseInt(m[2], 10))) - 1 };
      }
      return null;
    }
    window.addEventListener('popstate', function () {
      if (ignorePop) { ignorePop = false; return; }
      var t = fromHash();
      if (t && isOpen) {
        if (t.a !== ai) { setAlbum(t.a); setOpen(t.a); }
        show(t.k, 0);
      } else if (t) {
        openAlbum(t.a, t.k, false);
        pushed = false;
      } else if (isOpen) {
        closeAlbum(true);
      }
    });
    var initial = fromHash();
    if (initial) {
      var y = host.getBoundingClientRect().top + window.pageYOffset - window.innerHeight * 0.15;
      window.scrollTo({ top: Math.max(0, y), behavior: 'instant' });
      openAlbum(initial.a, initial.k, false);
      pushed = false;
    }
  }

  function boot() {
    Array.prototype.forEach.call(doc.querySelectorAll('[data-zg]'), function (host) {
      try { Gallery(host); } catch (err) { if (window.console) console.warn('zfx-gallery:', err); }
    });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
