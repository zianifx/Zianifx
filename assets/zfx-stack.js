/* ==========================================================================
   ZIANI FX – Portfolio-Kartenstapel (nur index.html, #portfolio)
   Scroll-gesteuert: Jede Karte hat einen eigenen Abschnitt (0,6 Bildschirmhöhen
   Bewegung + 0,4 Ruhe). Sie gleitet von rechts, leicht gedreht, auf den Stapel
   und richtet sich dabei auf; die Karten darunter treten zurück (kleiner, nach
   links oben versetzt, abgedunkelt, max. 3 Ebenen). Die Beschreibung wechselt,
   wenn die neue Karte halb angekommen ist. Rückwärts läuft alles exakt zurück.
   Die erste Karte gleitet einmal herein, sobald die Bühne ins Bild kommt.
   Nur transform/opacity, ein rAF-Loop, passiver Scroll-Listener.
   ========================================================================== */
(function () {
  'use strict';

  var host = document.querySelector('[data-zst]');
  if (!host || !window.requestAnimationFrame) return;
  var stage = host.querySelector('.zst-stage');
  var items = [].slice.call(host.querySelectorAll('.zst-item'));
  var N = items.length;
  if (!stage || N < 2) return;

  var LEAD = 0.25;   // Ruhe für Karte 1, bevor Karte 2 startet (in Bildschirmhöhen)
  var MOVE = 0.6;    // Bewegung pro Karte
  var SEG = 1;       // Abschnitt pro Karte (Bewegung + 0,4 Ruhe)
  var TILT = 5;      // Startdrehung in Grad
  var SCALE = 0.04;  // pro Ebene kleiner
  var REVEAL = 950;  // ms, Hereingleiten der ersten Karte
  var PIN = LEAD + (N - 1) * SEG;

  var cards = [], texts = [], shades = [], imgs = [];
  items.forEach(function (it) {
    var c = it.querySelector('.zst-card');
    var sh = document.createElement('span');
    sh.className = 'zst-shade';
    sh.setAttribute('aria-hidden', 'true');
    c.appendChild(sh);
    cards.push(c);
    texts.push(it.querySelector('.zst-text'));
    shades.push(sh);
    imgs.push(c.querySelector('img'));
  });
  var strokes = [].slice.call(host.querySelectorAll('.zst-progress i'));
  var fills = strokes.map(function (i) { return i.querySelector('b'); });

  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reduced = !!(mq && mq.matches);

  var H = 1, VH = 1, cw = 0, ch = 0, cardTop = 0, dx0 = 0, stepX = 0, stepY = 0;
  var rev = 0, revT = 0, armed = true, preloaded = false, active = -2, ticking = false;
  var cache, fillCache;
  function resetCache() {
    cache = cards.map(function () { return { tf: null, op: null, sh: null, top: null, live: null }; });
    fillCache = [];
  }
  resetCache();

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function out3(t) { t = 1 - t; return 1 - t * t * t; }   // Gleiten: weiches Ease-out
  function out2(t) { t = 1 - t; return 1 - t * t; }       // Aufrichten: etwas später fertig

  function textBottom() {
    var b = 0;
    texts.forEach(function (t) { b = Math.max(b, t.offsetTop + t.offsetHeight); });
    return b;
  }
  // Passt die Beschreibung nicht unter/neben den Stapel, erst kürzen, dann den Satz weglassen
  function fit() {
    host.classList.remove('is-tight', 'is-tighter');
    if (textBottom() > H - 6) {
      host.classList.add('is-tight');
      if (textBottom() > H - 6) host.classList.add('is-tighter');
    }
  }

  function measure() {
    H = stage.offsetHeight || window.innerHeight;
    VH = window.innerHeight || H;
    var W = stage.offsetWidth || document.documentElement.clientWidth;
    var c = cards[0];
    cw = c.offsetWidth;
    ch = c.offsetHeight;
    cardTop = c.offsetTop;
    dx0 = W - c.offsetLeft + cw * 0.22;          // ganz außerhalb rechts starten
    var phone = cw > W * 0.7;                     // Handy: Karte fast bildschirmbreit
    stepX = cw * 0.05;
    stepY = ch * (phone ? 0.032 : 0.045);
    fit();
  }

  function preload() {
    preloaded = true;
    imgs.forEach(function (im) { if (im && im.getAttribute('loading') === 'lazy') im.setAttribute('loading', 'eager'); });
  }

  function frame(now) {
    ticking = false;
    var t0 = typeof now === 'number' ? now : performance.now();
    var top = host.getBoundingClientRect().top;
    var s = -top / H;
    if (!preloaded && top < VH * 2.5) preload();

    // Erste Karte: gleitet einmal herein, wenn die Bühne ins Bild kommt
    var animating = false;
    if (reduced) { rev = 1; revT = 0; armed = false; }
    else {
      if (top > VH) { rev = 0; revT = 0; armed = true; }
      else if (armed && top + cardTop < VH * 0.72) {
        armed = false;
        if (s > 0.05) rev = 1; else revT = t0;
      }
      if (revT) {
        var t = (t0 - revT) / REVEAL;
        if (t >= 1) { rev = 1; revT = 0; } else { rev = clamp01(t); animating = true; }
      }
    }

    var p = [], e = [], r = [], k, A = -1;
    for (k = 0; k < N; k++) {
      p[k] = k === 0 ? rev : clamp01((s - LEAD - (k - 1) * SEG) / MOVE);
      e[k] = reduced ? p[k] : out3(p[k]);
      r[k] = out2(p[k]);
      if (e[k] >= 0.5) A = k;
    }

    var acc = 0;
    for (var i = N - 1; i >= 0; i--) {
      var d = acc;            // wie viele Karten (anteilig) schon darüber liegen
      acc += e[i];
      var tf, op, sh;
      if (reduced) {
        tf = 'none';
        op = p[i] >= 1 ? '1' : p[i].toFixed(3);
        sh = '0';
      } else {
        var inv = 1 - e[i];
        var x = dx0 * inv - stepX * d;
        var y = ch * 0.03 * inv - stepY * d;
        var rot = TILT * (1 - r[i]);
        var sc = 1 - SCALE * d;
        tf = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) rotate(' + rot.toFixed(2) + 'deg) scale(' + sc.toFixed(4) + ')';
        op = d <= 2 ? '1' : clamp01(3 - d).toFixed(3);
        sh = (Math.min(d, 2.4) * 0.26).toFixed(3);
      }
      var cc = cache[i], el = cards[i];
      if (cc.tf !== tf) { el.style.transform = tf; cc.tf = tf; }
      if (cc.op !== op) { el.style.opacity = op; cc.op = op; }
      if (cc.sh !== sh) { shades[i].style.opacity = sh; cc.sh = sh; }
      var isTop = i === A;
      if (cc.top !== isTop) { el.classList.toggle('is-top', isTop); cc.top = isTop; }
      var live = !reduced && ((p[i] > 0 && d < 3) || i === A + 1);
      if (cc.live !== live) { el.classList.toggle('is-live', live); cc.live = live; }
    }

    // Beschreibung: richtungsbewusst (vorher links raus / neu von rechts, rückwärts umgekehrt)
    if (A !== active) {
      active = A;
      for (k = 0; k < N; k++) {
        var cl = texts[k].classList;
        cl.toggle('is-active', k === A);
        cl.toggle('is-before', k < A);
        cl.toggle('is-after', k > A);
        if (strokes[k]) strokes[k].classList.toggle('is-current', k === A);
      }
    }
    for (k = 0; k < fills.length && k < N; k++) {
      var f = e[k].toFixed(3);
      if (fillCache[k] !== f) { fills[k].style.transform = 'scaleX(' + f + ')'; fillCache[k] = f; }
    }

    if (animating) schedule();
  }

  function schedule() {
    if (!ticking) { ticking = true; window.requestAnimationFrame(frame); }
  }

  // Tastatur: Fokus auf Karte/Button eines Kapitels → direkt zu diesem Kapitel springen (ohne Animation)
  function onFocus(ev) {
    var tgt = ev.target, k = -1;
    try { if (!tgt.matches(':focus-visible')) return; } catch (err) { /* ältere Browser: wie Tastatur behandeln */ }
    for (var i = 0; i < N; i++) if (items[i].contains(tgt)) { k = i; break; }
    if (k < 0) return;
    var top = host.getBoundingClientRect().top, s = -top / H;
    var lo = k === 0 ? 0 : LEAD + (k - 1) * SEG + MOVE;
    var hi = k === N - 1 ? PIN : LEAD + k * SEG;
    var goal = k === 0 ? 0.1 : lo + 0.2;
    if (k === 0) { rev = 1; revT = 0; armed = false; }
    if (s < lo - 0.001 || s > hi) {
      var y = (window.pageYOffset || document.documentElement.scrollTop) + top + goal * H;
      try { window.scrollTo({ top: y, left: 0, behavior: 'instant' }); } catch (err) { window.scrollTo(0, y); }
    }
    frame();
  }

  function onMotionPref() {
    reduced = !!(mq && mq.matches);
    cards.forEach(function (c) { c.style.transform = ''; c.style.opacity = ''; });
    resetCache();
    active = -2;
    measure();
    frame();
  }

  host.style.setProperty('--zst-len', String(PIN));
  host.classList.add('is-ready');
  measure();
  frame();

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', function () { measure(); schedule(); }, { passive: true });
  window.addEventListener('load', function () { measure(); schedule(); });
  host.addEventListener('focusin', onFocus);
  if (mq) {
    if (mq.addEventListener) mq.addEventListener('change', onMotionPref);
    else if (mq.addListener) mq.addListener(onMotionPref);
  }
})();
