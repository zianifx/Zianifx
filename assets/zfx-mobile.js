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
