/* ==========================================================================
   ZIANI FX – Handy-Feinschliff (nur ≤ 768 px), gehört zu assets/zfx-mobile.css
   Tut am Desktop nichts: Alles startet nur, solange (max-width: 768px) passt,
   und räumt sich beim Wechsel auf eine breitere Ansicht komplett wieder auf.
   zfx.js bleibt unverändert – hier wird nur ergänzt.
   ========================================================================== */
(function () {
  'use strict';
  if (!window.matchMedia) return;
  var mq = window.matchMedia('(max-width: 768px)');
  var root = document.documentElement;
  var doc = document;
  var active = false;
  var cleanups = [];
  var features = [];          // von den Abschnitten unten registriert

  function on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    cleanups.push(function () { target.removeEventListener(type, fn, opts); });
  }
  function made(el) { el.setAttribute('data-zm', ''); return el; }   // von uns erzeugt → beim Aufräumen weg
  function reduced() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  var api = { on: on, made: made, root: root, doc: doc, reduced: reduced, cleanups: cleanups };

  function start() {
    if (active) return;
    active = true;
    root.classList.add('zm');
    features.forEach(function (f) { try { f(api); } catch (err) { /* ein Fehler darf die Seite nie blockieren */ } });
  }
  function stop() {
    if (!active) return;
    active = false;
    cleanups.splice(0).forEach(function (fn) { try { fn(); } catch (err) {} });
    root.classList.remove('zm', 'zm-hide');
    Array.prototype.forEach.call(doc.querySelectorAll('[data-zm]'), function (el) { el.parentNode.removeChild(el); });
  }

  /* ---------- Abschnitte registrieren sich hier ---------- */
  window.__zfxMobile = { add: function (f) { features.push(f); if (active) { try { f(api); } catch (err) {} } } };

  function boot() {
    if (mq.matches) start();
    var onChange = function (e) { if (e.matches) start(); else stop(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})();

/* ---------- Navigation: Header ein/aus beim Scrollen, Menü-Button, schwebende Pille ---------- */
(function () {
  'use strict';
  if (!window.__zfxMobile) return;
  window.__zfxMobile.add(function (z) {
    var root = z.root, doc = z.doc;
    var lastY = window.pageYOffset, ticking = false, cta = null;

    function update() {
      ticking = false;
      var y = Math.max(0, window.pageYOffset), d = y - lastY;
      if (root.classList.contains('menu-open') || y < 120) { root.classList.remove('zm-hide'); lastY = y; }
      else if (d > 8) { root.classList.add('zm-hide'); lastY = y; }
      else if (d < -8) { root.classList.remove('zm-hide'); lastY = y; }
      if (cta) cta();
    }
    z.on(window, 'scroll', function () { if (!ticking) { ticking = true; window.requestAnimationFrame(update); } }, { passive: true });
    z.on(window, 'resize', function () { if (cta) cta(); }, { passive: true });
    z.on(doc, 'focusin', function (e) {
      if (e.target && e.target.closest && e.target.closest('.site-header, .tabs, .menu')) root.classList.remove('zm-hide');
    });

    // „Projekt anfragen“ auch im Menü, über Instagram
    var foot = doc.querySelector('.menu-foot');
    if (foot && !foot.querySelector('.zm-menu-cta')) {
      var mb = z.made(doc.createElement('a'));
      mb.className = 'btn btn-solid zm-menu-cta';
      mb.href = 'mailto:zianifx@outlook.com';
      mb.innerHTML = 'Projekt anfragen <span class="arr" aria-hidden="true">→</span>';
      foot.insertBefore(mb, foot.firstChild);
    }

    // Schwebende Pille (abschaltbar mit <html class="zm-no-cta">)
    if (root.classList.contains('zm-no-cta') || !window.IntersectionObserver) return;
    var el = z.made(doc.createElement('a'));
    el.className = 'zm-cta';
    el.href = 'mailto:zianifx@outlook.com';
    el.innerHTML = '<span class="zm-rec" aria-hidden="true"></span>Projekt anfragen';
    doc.body.appendChild(el);
    var hero = doc.querySelector('.hero, .page-hero');
    var inView = [];
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var i = inView.indexOf(en.target);
        if (en.isIntersecting && i < 0) inView.push(en.target);
        if (!en.isIntersecting && i >= 0) inView.splice(i, 1);
      });
      if (cta) cta();
    });
    Array.prototype.forEach.call(doc.querySelectorAll('#kontakt, .finale, .site-footer, .stack, .zs-vitrine, .zs-enter, .nf'), function (b) { io.observe(b); });
    z.cleanups.push(function () { io.disconnect(); });
    cta = function () {
      var past = hero ? hero.getBoundingClientRect().bottom < window.innerHeight * 0.4 : window.pageYOffset > window.innerHeight * 0.6;
      var locked = root.classList.contains('menu-open') || root.classList.contains('zfx-locked') ||
        !!doc.querySelector('.lightbox.open, .theater.open');
      el.classList.toggle('is-on', past && inView.length === 0 && !locked);
    };
    if (window.MutationObserver) {
      var mo = new MutationObserver(function () { cta(); });
      mo.observe(root, { attributes: true, attributeFilter: ['class'] });
      z.cleanups.push(function () { mo.disconnect(); });
    }
    cta();
  });
})();
