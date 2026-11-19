/* ZIANI FX — site behaviour. Vanilla JS, no dependencies. */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var fineMQ = window.matchMedia('(hover: hover) and (pointer: fine)');
  var EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
  var EASE_DRAWER = 'cubic-bezier(0.32, 0.72, 0, 1)';
  // Shrinking gaps so a group reads as one wave, not a metronome
  var STEPS = [0, 80, 150, 210, 260, 300, 330, 355, 375];

  function reduced() { return reduceMQ.matches; }
  function toArray(list) { return Array.prototype.slice.call(list); }
  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function safe(fn) {
    try { fn(); return true; } catch (e) {
      if (window.console) console.error('[zfx]', e);
      return false;
    }
  }

  /* ---------- One rAF loop for everything scroll-linked: reads first, then writes ---------- */
  var readers = [];
  var writers = [];
  var ticking = false;
  function frame() {
    ticking = false;
    var st = {
      y: Math.max(0, window.scrollY || window.pageYOffset || 0),
      vh: window.innerHeight,
      max: root.scrollHeight - window.innerHeight
    };
    readers.forEach(function (fn) { fn(st); });
    writers.forEach(function (fn) { fn(st); });
  }
  function requestFrame() {
    if (!ticking) { ticking = true; window.requestAnimationFrame(frame); }
  }
  window.addEventListener('scroll', requestFrame, { passive: true });
  window.addEventListener('resize', requestFrame);
  window.addEventListener('load', requestFrame);

  /* ---------- Scroll lock shared by lightbox and theater ---------- */
  var locks = 0;
  function lockScroll() {
    if (locks++ > 0) return;
    var sbw = window.innerWidth - root.clientWidth;
    root.classList.add('zfx-locked');
    if (sbw > 0) {
      doc.body.style.paddingRight = sbw + 'px';
      var nav = doc.getElementById('navbar');
      if (nav) nav.style.right = sbw + 'px';
    }
  }
  function unlockScroll() {
    if (locks === 0 || --locks > 0) return;
    root.classList.remove('zfx-locked');
    doc.body.style.paddingRight = '';
    var nav = doc.getElementById('navbar');
    if (nav) nav.style.right = '';
  }

  /* ---------- Text splitting ---------- */
  function splitLines(el) {
    if (el.classList.contains('is-split')) return;
    var groups = [[]];
    toArray(el.childNodes).forEach(function (node) {
      if (node.nodeName === 'BR') groups.push([]);
      else groups[groups.length - 1].push(node);
    });
    groups = groups.filter(function (nodes) {
      return nodes.some(function (n) { return n.nodeType !== 3 || n.textContent.trim(); });
    });
    while (el.firstChild) el.removeChild(el.firstChild);
    groups.forEach(function (nodes, i) {
      var mask = doc.createElement('span');
      var line = doc.createElement('span');
      mask.className = 'tr-mask';
      line.className = 'tr-line';
      line.style.setProperty('--li', i);
      nodes.forEach(function (n) { line.appendChild(n); });
      mask.appendChild(line);
      el.appendChild(mask);
    });
    el.classList.add('is-split');
  }

  // Wraps every word in .w so CSS can light them up one after another while scrolling
  function splitWords(el) {
    var index = 0;
    (function walk(node) {
      toArray(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = doc.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(doc.createTextNode(' ')); return; }
            var w = doc.createElement('span');
            w.className = 'w';
            w.style.setProperty('--wi', index++);
            w.textContent = part;
            frag.appendChild(w);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1) {
          if (n.classList.contains('ziani') || n.classList.contains('fx')) {
            n.classList.add('w');
            n.style.setProperty('--wi', index++);
          } else {
            walk(n);
          }
        }
      });
    })(el);
    el.classList.add('is-scrub');
  }

  /* ---------- Reveals ---------- */
  function initReveal() {
    toArray(doc.querySelectorAll('.scrub')).forEach(function (el) { safe(function () { splitWords(el); }); });

    var els = toArray(doc.querySelectorAll('.zr, .zr-lines'));
    if (!els.length) return;
    // .js was removed by the <head> safety timer: content is already visible, nothing to do
    if (!root.classList.contains('js')) return;

    els.forEach(function (el) { if (el.classList.contains('zr-lines')) splitLines(el); });

    var pending = new Set(els);
    var io = null;

    function show(el, delay) {
      if (el.__zfxIn) return;
      el.__zfxIn = true;
      el.style.setProperty('--zd', (reduced() ? 0 : delay) + 'ms');
      el.classList.add('is-split', 'is-in');
    }

    function reveal(el, delay) {
      if (!pending.has(el)) return;
      pending.delete(el);
      if (io) io.unobserve(el);
      if (el.tagName === 'IMG') {
        if (el.dataset.src) { el.src = el.dataset.src; el.removeAttribute('data-src'); }
        if (!(el.complete && el.naturalWidth)) {
          var done = function () { show(el, 0); };
          el.addEventListener('load', done, { once: true });
          el.addEventListener('error', done, { once: true });
          setTimeout(done, 1500);
          return;
        }
      }
      show(el, delay);
    }

    function byPosition(a, b) {
      return (Math.round(a.r.top / 8) - Math.round(b.r.top / 8)) || (a.r.left - b.r.left);
    }

    function revealBatch(items) {
      items.sort(byPosition);
      items.forEach(function (item, i) {
        reveal(item.el, item.r.bottom < 0 ? 0 : STEPS[Math.min(i, STEPS.length - 1)]);
      });
    }

    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (entries) {
        var batch = [];
        entries.forEach(function (e) {
          var r = e.boundingClientRect;
          if (e.isIntersecting || r.bottom < 0) batch.push({ el: e.target, r: r });
        });
        revealBatch(batch);
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0 });
      els.forEach(function (el) { io.observe(el); });
    }

    // Fallback: anything in or above the viewport gets revealed, whether or not the observer fired
    function check() {
      if (!pending.size) return;
      var vh = window.innerHeight;
      var batch = [];
      pending.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < vh * 0.98) batch.push({ el: el, r: r });
      });
      revealBatch(batch);
    }
    var debounce = 0;
    function scheduleCheck() {
      clearTimeout(debounce);
      debounce = setTimeout(check, 140);
    }
    window.addEventListener('scroll', scheduleCheck, { passive: true });
    window.addEventListener('resize', scheduleCheck);
    window.addEventListener('load', scheduleCheck);
    doc.addEventListener('visibilitychange', scheduleCheck);
    var runs = 0;
    var interval = setInterval(function () {
      check();
      if (!pending.size || ++runs > 20) clearInterval(interval);
    }, 1500);
    if (!io) check();
  }

  /* ---------- Intro curtain (index, once per session) ---------- */
  function initIntro() {
    if (!root.classList.contains('intro-on') || root.classList.contains('intro-done')) return;
    var t0 = performance.now();
    var finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      setTimeout(function () { root.classList.add('intro-done'); }, Math.max(0, 1150 - (performance.now() - t0)));
    }
    var first = doc.querySelector('.hero-slide');
    if (first && !first.complete) {
      first.addEventListener('load', finish, { once: true });
      first.addEventListener('error', finish, { once: true });
      setTimeout(finish, 1900);
    } else {
      finish();
    }
  }

  /* ---------- Header: material on scroll, progress line, current link, hero parallax ---------- */
  function initNav() {
    var nav = doc.getElementById('navbar');
    if (!nav) return;

    var bar = doc.createElement('div');
    bar.className = 'zfx-progress';
    bar.setAttribute('aria-hidden', 'true');
    nav.appendChild(bar);
    var cssProgress = !!(window.CSS && CSS.supports && CSS.supports('animation-timeline: scroll()'));

    var links = toArray(nav.querySelectorAll('.nav-link'));
    function linkFor(hash) {
      return links.filter(function (a) { return (a.getAttribute('href') || '').indexOf(hash) !== -1; })[0] || null;
    }
    var hero = doc.querySelector('section.hero');
    var heroInner = doc.querySelector('.hero-inner');
    var isIndex = !!hero;
    var isSub = !!doc.getElementById('subnav') || doc.body.classList.contains('page-sub');
    var kontakt = doc.getElementById('kontakt');
    var portfolio = doc.getElementById('portfolio');
    var kontaktLink = linkFor('#kontakt');
    var portfolioLink = linkFor('#portfolio');
    var homeLink = links.filter(function (a) { return a.getAttribute('href') === 'index.html'; })[0] || null;

    var current = null;
    var lastCurrent;
    var lastScrolled;
    var heroDone = false;
    var heroOff;

    readers.push(function (st) {
      current = isIndex ? homeLink : (isSub ? portfolioLink : null);
      if (kontakt && kontaktLink && (kontakt.getBoundingClientRect().top < st.vh * 0.5 || (st.max > 0 && st.y >= st.max - 4))) {
        current = kontaktLink;
      } else if (isIndex && portfolio && portfolioLink && portfolio.getBoundingClientRect().top < st.vh * 0.45) {
        current = portfolioLink;
      }
    });

    writers.push(function (st) {
      var scrolled = st.y > 16;
      if (scrolled !== lastScrolled) { nav.classList.toggle('scrolled', scrolled); lastScrolled = scrolled; }
      if (!cssProgress) {
        bar.style.transform = 'scaleX(' + (st.max > 0 ? clamp(st.y / st.max, 0, 1) : 0).toFixed(4) + ')';
      }
      if (current !== lastCurrent) {
        links.forEach(function (a) { a.classList.toggle('is-current', a === current); });
        lastCurrent = current;
      }
      if (hero) {
        var off = st.y > st.vh;
        if (off !== heroOff) { hero.classList.toggle('is-off', off); heroOff = off; }
      }
      if (heroInner && !reduced()) {
        if (st.y < st.vh * 1.1) {
          heroInner.style.transform = 'translate3d(0,' + (st.y * 0.28).toFixed(1) + 'px,0)';
          heroInner.style.opacity = clamp(1 - (st.y / st.vh) * 1.25, 0, 1).toFixed(3);
          heroDone = false;
        } else if (!heroDone) {
          heroInner.style.opacity = '0';
          heroDone = true;
        }
      }
    });
    requestFrame();
  }

  /* ---------- Mobile menu ---------- */
  function initMenu() {
    var btn = doc.querySelector('.menu-toggle');
    var menu = doc.getElementById('menu');
    if (!btn || !menu) return;
    var open = false;
    function set(next) {
      open = next;
      menu.classList.toggle('open', open);
      root.classList.toggle('menu-open', open);
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
      menu.setAttribute('aria-hidden', String(!open));
    }
    btn.addEventListener('click', function () { set(!open); });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) set(false); });
    doc.addEventListener('keydown', function (e) {
      if (open && e.key === 'Escape') { set(false); btn.focus(); }
    });
    var wide = window.matchMedia('(min-width: 861px)');
    var onWide = function (e) { if (e.matches && open) set(false); };
    if (wide.addEventListener) wide.addEventListener('change', onWide);
    else if (wide.addListener) wide.addListener(onWide);
  }

  /* ---------- Subpage tabs: scroll-spy with one sliding pill ---------- */
  function initSubnav() {
    var subnav = doc.getElementById('subnav');
    if (!subnav) return;
    var inner = subnav.querySelector('.subnav-inner');
    var links = toArray(subnav.querySelectorAll('.subnav-link')).filter(function (a) {
      return doc.getElementById(a.dataset.target);
    });
    if (!inner || !links.length) return;
    var sections = links.map(function (a) { return doc.getElementById(a.dataset.target); });

    var ind = doc.createElement('span');
    ind.className = 'subnav-indicator';
    ind.setAttribute('aria-hidden', 'true');
    inner.insertBefore(ind, inner.firstChild);

    var active = null;
    var wanted = null;
    var lockUntil = 0;

    function placeIndicator(instant) {
      if (!active) return;
      if (instant) ind.style.transition = 'none';
      ind.style.transform = 'translateX(' + active.offsetLeft + 'px)';
      ind.style.width = active.offsetWidth + 'px';
      if (instant) {
        void ind.offsetWidth;
        ind.style.transition = '';
      }
    }
    function keepInView(link) {
      if (inner.scrollWidth <= inner.clientWidth + 2) return;
      var left = link.offsetLeft;
      var right = left + link.offsetWidth;
      var viewL = inner.scrollLeft;
      var viewR = viewL + inner.clientWidth;
      if (left < viewL + 12 || right > viewR - 12) {
        inner.scrollTo({ left: Math.max(0, left - 20), behavior: reduced() ? 'auto' : 'smooth' });
      }
    }
    function setActive(link, instant) {
      if (!link || link === active) return;
      var first = !active;
      active = link;
      links.forEach(function (a) {
        a.classList.toggle('active', a === link);
        if (a === link) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
      placeIndicator(instant || first);
      keepInView(link);
    }

    readers.push(function (st) {
      if (Date.now() < lockUntil) { wanted = null; return; }
      var top = subnav.getBoundingClientRect().bottom;
      var line = top + (st.vh - top) * 0.3;
      var idx = 0;
      for (var i = 0; i < sections.length; i++) {
        if (sections[i].getBoundingClientRect().top <= line) idx = i;
      }
      wanted = links[idx];
    });
    writers.push(function () { if (wanted) setActive(wanted); });

    links.forEach(function (a) {
      a.addEventListener('click', function () {
        lockUntil = Date.now() + 1200;
        setActive(a);
      });
    });
    if ('onscrollend' in window) {
      window.addEventListener('scrollend', function () { lockUntil = 0; requestFrame(); });
    }
    window.addEventListener('resize', function () { placeIndicator(true); });
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { placeIndicator(true); });
    requestFrame();
  }

  /* ---------- Index hero: slideshow, progress ticks, HUD label + timecode ---------- */
  function initHero() {
    var hero = doc.querySelector('section.hero');
    if (!hero) return;
    var slides = toArray(hero.querySelectorAll('.hero-slide'));
    var ticks = toArray(hero.querySelectorAll('.hero-ticks b'));
    var label = hero.querySelector('[data-slide-label]');
    var timecode = hero.querySelector('[data-timecode]');
    var DUR = 5200;
    var index = 0;

    function load(img) {
      if (img && img.dataset.src) { img.src = img.dataset.src; img.removeAttribute('data-src'); }
    }
    function paint() {
      if (label) label.textContent = pad(index + 1) + ' / ' + pad(slides.length) + ' — ' + (slides[index].dataset.label || '');
      ticks.forEach(function (t, i) {
        t.style.setProperty('--slide-dur', DUR + 'ms');
        t.classList.remove('is-on');
        t.classList.toggle('is-past', i < index);
      });
      if (ticks[index]) {
        void ticks[index].offsetWidth;
        ticks[index].classList.add('is-on');
      }
    }
    function go(n) {
      var next = slides[n % slides.length];
      if (!(next.complete && next.naturalWidth)) { load(next); return; }
      var prev = slides[index];
      index = n % slides.length;
      prev.classList.add('is-leaving');
      prev.classList.remove('is-active');
      next.classList.remove('is-leaving');
      next.classList.add('is-active');
      setTimeout(function () {
        if (prev.classList.contains('is-active')) return;
        prev.style.transition = 'none';
        prev.classList.remove('is-leaving');
        void prev.offsetWidth;
        prev.style.transition = '';
      }, 2000);
      paint();
      load(slides[(index + 1) % slides.length]);
    }

    if (slides.length > 1 && !reduced()) {
      paint();
      var start = function () { load(slides[1]); };
      if (doc.readyState === 'complete') start();
      else window.addEventListener('load', start, { once: true });
      setInterval(function () {
        if (doc.hidden || hero.classList.contains('is-off') || !root.classList.contains('intro-done') && root.classList.contains('intro-on')) return;
        go(index + 1);
      }, DUR);
    } else if (label && slides[0]) {
      label.textContent = slides[0].dataset.label || '';
    }

    if (timecode && !reduced()) {
      var t0 = performance.now();
      setInterval(function () {
        if (doc.hidden || hero.classList.contains('is-off')) return;
        var ms = performance.now() - t0;
        timecode.textContent = pad(Math.floor(ms / 3600000)) + ':' + pad(Math.floor(ms / 60000) % 60) + ':' +
          pad(Math.floor(ms / 1000) % 60) + ':' + pad(Math.floor(ms / 40) % 25);
      }, 80);
    }
  }

  /* ---------- Pause the marquee while it is off screen ---------- */
  function initMarquee() {
    var items = toArray(doc.querySelectorAll('.marquee'));
    if (!items.length || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { e.target.classList.toggle('is-off', !e.isIntersecting); });
    }, { rootMargin: '100px 0px' });
    items.forEach(function (m) { io.observe(m); });
  }

  /* ---------- Cursor label on [data-cursor] (fine pointers only) ---------- */
  function initCursor() {
    var targets = toArray(doc.querySelectorAll('[data-cursor]'));
    if (!targets.length || !fineMQ.matches || reduced()) return;

    var ARROW = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
    var el = doc.createElement('div');
    var inner = doc.createElement('span');
    el.className = 'zfx-cursor';
    el.setAttribute('aria-hidden', 'true');
    el.appendChild(inner);
    doc.body.appendChild(el);
    root.classList.add('zfx-cursor-ready');

    var x = 0, y = 0, tx = 0, ty = 0, on = false, running = false;
    function loop() {
      x += (tx - x) * 0.24;
      y += (ty - y) * 0.24;
      el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
      if (on || Math.abs(tx - x) + Math.abs(ty - y) > 0.5) window.requestAnimationFrame(loop);
      else running = false;
    }
    function start() { if (!running) { running = true; window.requestAnimationFrame(loop); } }

    window.addEventListener('pointermove', function (e) {
      tx = e.clientX; ty = e.clientY;
      if (on) start();
    }, { passive: true });
    targets.forEach(function (t) {
      t.addEventListener('pointerenter', function (e) {
        if (e.pointerType !== 'mouse') return;
        var text = t.getAttribute('data-cursor');
        if (text) inner.textContent = text;
        else inner.innerHTML = ARROW;
        tx = e.clientX; ty = e.clientY;
        if (!on) { x = tx; y = ty; el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)'; }
        on = true;
        el.classList.add('is-on');
        start();
      });
      t.addEventListener('pointerleave', function () {
        on = false;
        el.classList.remove('is-on');
      });
    });
    // The label must not linger over the theater or after a click-through
    doc.addEventListener('click', function () { on = false; el.classList.remove('is-on'); }, true);
  }

  /* ---------- Magnetic pull on [data-magnetic] ---------- */
  function initMagnetic() {
    if (!fineMQ.matches || reduced()) return;
    toArray(doc.querySelectorAll('[data-magnetic]')).forEach(function (el) {
      var cx = 0, cy = 0;
      el.addEventListener('pointerenter', function () {
        el.style.transform = '';
        var r = el.getBoundingClientRect();
        cx = r.left + r.width / 2;
        cy = r.top + r.height / 2;
      });
      el.addEventListener('pointermove', function (e) {
        el.style.transform = 'translate3d(' + ((e.clientX - cx) * 0.3).toFixed(1) + 'px,' + ((e.clientY - cy) * 0.3).toFixed(1) + 'px,0)';
      });
      el.addEventListener('pointerleave', function () { el.style.transform = ''; });
    });
  }

  /* ---------- Lightbox: shared-element open/close, swipe, keys, focus ---------- */
  function initLightbox() {
    var lb = doc.getElementById('lightbox');
    var thumbs = toArray(doc.querySelectorAll('.image-grid img'));
    if (!lb || !thumbs.length) return;

    var baseImg = lb.querySelector('.lightbox-img');
    var btnPrev = lb.querySelector('.lightbox-prev');
    var btnNext = lb.querySelector('.lightbox-next');
    var btnClose = lb.querySelector('.lightbox-close');
    if (!baseImg || !btnPrev || !btnNext || !btnClose) return;

    var backdrop = doc.createElement('div');
    backdrop.className = 'lb-backdrop';
    var stage = doc.createElement('div');
    stage.className = 'lb-stage';
    var counter = doc.createElement('div');
    counter.className = 'lb-counter';
    counter.setAttribute('aria-live', 'polite');

    baseImg.removeAttribute('loading');
    var slots = [baseImg.cloneNode(false), baseImg, baseImg.cloneNode(false)];
    slots.forEach(function (img) { img.loading = 'eager'; img.alt = ''; stage.appendChild(img); });
    lb.insertBefore(backdrop, lb.firstChild);
    lb.insertBefore(stage, backdrop.nextSibling);
    lb.appendChild(counter);
    lb.setAttribute('aria-modal', 'true');

    var n = thumbs.length;
    var GAP = 32;
    var roles = { prev: slots[0], cur: slots[1], next: slots[2] };
    var idx = 0;
    var isOpen = false;
    var closing = false;
    var closeTimer = 0;
    var lastFocus = null;

    function wrap(i) { return (i + n) % n; }
    function setSrc(img, i) {
      var t = thumbs[i];
      var src = t.currentSrc || t.src;
      if (img.getAttribute('src') !== src) img.src = src;
      img.alt = t.alt || '';
      img.style.opacity = '';
    }
    function apply(img, transform, dur, ease) {
      img.style.transition = dur ? 'transform ' + dur + 'ms ' + (ease || EASE) + ', opacity ' + dur + 'ms ease' : 'none';
      img.style.transform = transform;
    }
    function layout(o) {
      o = o || {};
      var w = window.innerWidth + GAP;
      var dx = o.dx || 0, dy = o.dy || 0, s = o.scale || 1, dur = o.dur || 0;
      apply(roles.prev, 'translate3d(' + (-w + dx) + 'px,0,0)', o.instant === roles.prev ? 0 : dur, o.ease);
      apply(roles.cur, 'translate3d(' + dx + 'px,' + dy + 'px,0) scale(' + s + ')', dur, o.ease);
      apply(roles.next, 'translate3d(' + (w + dx) + 'px,0,0)', o.instant === roles.next ? 0 : dur, o.ease);
    }
    function updateCounter() { counter.textContent = (idx + 1) + ' / ' + n; }
    function fill() {
      setSrc(roles.cur, idx);
      setSrc(roles.prev, wrap(idx - 1));
      setSrc(roles.next, wrap(idx + 1));
      updateCounter();
    }
    // Untransformed layout box of a slot (it is absolutely centred inside the fixed stage)
    function baseRect(img) {
      return { x: img.offsetLeft, y: img.offsetTop, w: img.offsetWidth, h: img.offsetHeight };
    }
    function flipTransform(img, thumbRect) {
      var r = baseRect(img);
      if (!r.w || !r.h || !thumbRect.width) return null;
      var s = Math.max(thumbRect.width / r.w, thumbRect.height / r.h);
      var tx = thumbRect.left + thumbRect.width / 2 - (r.x + r.w / 2);
      var ty = thumbRect.top + thumbRect.height / 2 - (r.y + r.h / 2);
      return 'translate3d(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px,0) scale(' + s.toFixed(4) + ')';
    }
    function inViewport(r) { return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight; }

    function open(i) {
      if (isOpen) return;
      clearTimeout(closeTimer);
      if (closing) unlockScroll();
      closing = false;
      isOpen = true;
      idx = i;
      lastFocus = doc.activeElement;
      fill();
      lockScroll();
      lb.classList.add('is-visible');
      lb.setAttribute('aria-hidden', 'false');
      layout();

      var img = roles.cur;
      var thumb = thumbs[idx];
      img.style.opacity = '0';
      var start = function () {
        if (!isOpen) return;
        var from = reduced() ? null : flipTransform(img, thumb.getBoundingClientRect());
        if (from) {
          apply(img, from, 0);
          img.style.opacity = '1';
          void img.offsetWidth;
          lb.classList.add('open');
          apply(img, 'translate3d(0,0,0) scale(1)', 480, EASE_DRAWER);
        } else {
          img.style.transition = 'none';
          img.style.opacity = '0';
          void img.offsetWidth;
          lb.classList.add('open');
          img.style.transition = 'opacity 250ms ease';
          img.style.opacity = '1';
        }
      };
      if (img.complete && img.naturalWidth) {
        var decoded = img.decode ? img.decode().catch(function () {}) : Promise.resolve();
        Promise.race([decoded, new Promise(function (r) { setTimeout(r, 180); })]).then(start);
      } else {
        start();
      }
      btnClose.focus({ preventScroll: true });
    }

    function finishClose() {
      lb.classList.remove('is-visible', 'is-dragging', 'is-dragging-y');
      lb.setAttribute('aria-hidden', 'true');
      backdrop.style.opacity = '';
      slots.forEach(function (s) { s.style.transition = 'none'; s.style.transform = ''; s.style.opacity = ''; });
      unlockScroll();
      closing = false;
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }

    function close() {
      if (!isOpen || closing) return;
      isOpen = false;
      closing = true;
      backdrop.style.opacity = '';
      lb.classList.remove('open', 'is-dragging', 'is-dragging-y');
      var img = roles.cur;
      var thumbRect = thumbs[idx].getBoundingClientRect();
      var to = (!reduced() && inViewport(thumbRect)) ? flipTransform(img, thumbRect) : null;
      var dur = 380;
      if (to) {
        apply(img, to, dur, EASE_DRAWER);
      } else {
        dur = 220;
        img.style.transition = 'opacity 220ms ease, transform 220ms ' + EASE;
        img.style.opacity = '0';
        if (!reduced()) img.style.transform = 'translate3d(0,0,0) scale(0.96)';
      }
      closeTimer = setTimeout(finishClose, dur + 30);
    }

    function go(dir, dur) {
      if (!isOpen) return;
      idx = wrap(idx + dir);
      var recycled;
      if (dir > 0) {
        recycled = roles.prev;
        roles.prev = roles.cur; roles.cur = roles.next; roles.next = recycled;
        setSrc(recycled, wrap(idx + 1));
      } else {
        recycled = roles.next;
        roles.next = roles.cur; roles.cur = roles.prev; roles.prev = recycled;
        setSrc(recycled, wrap(idx - 1));
      }
      updateCounter();
      layout({ dur: reduced() ? 0 : (dur || 320), instant: recycled });
    }

    thumbs.forEach(function (t, i) {
      t.setAttribute('tabindex', '0');
      t.setAttribute('role', 'button');
      t.addEventListener('click', function () { open(i); });
      t.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i); }
      });
    });
    btnClose.addEventListener('click', function (e) { e.stopPropagation(); close(); });
    btnPrev.addEventListener('click', function (e) { e.stopPropagation(); go(-1); });
    btnNext.addEventListener('click', function (e) { e.stopPropagation(); go(1); });

    doc.addEventListener('keydown', function (e) {
      if (!isOpen) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1, 260); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(1, 260); }
      else if (e.key === 'Tab') {
        var f = [btnPrev, btnNext, btnClose].filter(function (b) { return b.offsetParent !== null; });
        var at = f.indexOf(doc.activeElement);
        e.preventDefault();
        var next = e.shiftKey ? (at <= 0 ? f.length - 1 : at - 1) : (at === f.length - 1 ? 0 : at + 1);
        f[next].focus();
      }
    });
    window.addEventListener('resize', function () { if (isOpen) layout(); });

    // Pointer gestures: horizontal = browse (neighbours follow 1:1), downward = dismiss
    var pid = null, sx = 0, sy = 0, st0 = 0, axis = null, dx = 0, dy = 0, samples = [];
    function velocity() {
      if (samples.length < 2) return { x: 0, y: 0 };
      var a = samples[0], b = samples[samples.length - 1];
      var dt = Math.max(1, b.t - a.t);
      return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
    }
    stage.addEventListener('pointerdown', function (e) {
      if (!isOpen || pid !== null) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (window.visualViewport && window.visualViewport.scale > 1.01) return;
      pid = e.pointerId;
      sx = e.clientX; sy = e.clientY; st0 = performance.now();
      axis = null; dx = 0; dy = 0;
      samples = [{ x: sx, y: sy, t: st0 }];
      try { stage.setPointerCapture(pid); } catch (err) {}
    });
    stage.addEventListener('pointermove', function (e) {
      if (e.pointerId !== pid) return;
      dx = e.clientX - sx;
      dy = e.clientY - sy;
      var now = performance.now();
      samples.push({ x: e.clientX, y: e.clientY, t: now });
      while (samples.length > 2 && now - samples[0].t > 90) samples.shift();
      if (!axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        lb.classList.add('is-dragging');
        if (axis === 'y') lb.classList.add('is-dragging-y');
      }
      if (axis === 'x') {
        layout({ dx: dx });
      } else {
        var down = dy > 0 ? dy : dy * 0.25;
        var p = clamp(down / window.innerHeight, 0, 1);
        layout({ dx: dx * 0.6, dy: down, scale: 1 - p * 0.25 });
        backdrop.style.opacity = (1 - p * 1.4).toFixed(3);
      }
    });
    function endGesture(e) {
      if (e.pointerId !== pid) return;
      pid = null;
      var v = velocity();
      var elapsed = performance.now() - st0;
      lb.classList.remove('is-dragging');
      if (!axis) {
        if (e.type === 'pointerup' && elapsed < 500) close();
        return;
      }
      if (e.type === 'pointercancel') {
        lb.classList.remove('is-dragging-y');
        backdrop.style.opacity = '';
        layout({ dur: 320, ease: EASE_DRAWER });
        return;
      }
      if (axis === 'x') {
        var w = window.innerWidth;
        var commit = Math.abs(dx) > w * 0.18 || Math.abs(v.x) > 0.35;
        var dir = (Math.abs(v.x) > 0.35 ? -Math.sign(v.x) : -Math.sign(dx)) || 0;
        if (commit && dir) {
          var remaining = w + GAP - Math.abs(dx);
          var dur = clamp(remaining / Math.max(Math.abs(v.x), 1.4), 200, 420);
          go(dir, Math.round(dur));
        } else {
          layout({ dur: 320, ease: EASE_DRAWER });
        }
      } else {
        lb.classList.remove('is-dragging-y');
        if (dy > 110 || v.y > 0.5) {
          close();
        } else {
          backdrop.style.opacity = '';
          layout({ dur: 360, ease: EASE_DRAWER });
        }
      }
    }
    stage.addEventListener('pointerup', endGesture);
    stage.addEventListener('pointercancel', endGesture);
  }

  /* ---------- Video slots: data-video-id="" stays a "Coming soon" placeholder;
     once an ID is filled in, the poster comes from YouTube and the slot plays like every other video ---------- */
  function initVideoSlots() {
    toArray(doc.querySelectorAll('.yt-facade')).forEach(function (f) {
      var raw = f.getAttribute('data-video-id') || '';
      var id = raw.trim();
      if (id !== raw) f.setAttribute('data-video-id', id);
      if (!id) {
        f.removeAttribute('data-cursor');
        f.setAttribute('role', 'img');
        f.setAttribute('aria-label', 'Video folgt in Kürze');
        return;
      }
      if (f.querySelector('img')) return; // poster already written in the markup
      var portrait = f.getAttribute('data-ratio') === '9/16';
      var img = doc.createElement('img');
      img.alt = 'Video Vorschau';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.width = portrait ? 1080 : 1280;
      img.height = portrait ? 1920 : 720;
      img.onerror = function () { img.onerror = null; img.src = 'https://img.youtube.com/vi/' + id + '/hqdefault.jpg'; };
      img.src = portrait ? 'https://i.ytimg.com/vi/' + id + '/sardefault.jpg' : 'https://img.youtube.com/vi/' + id + '/maxresdefault.jpg';
      if (portrait) {
        // Shorts: YouTube's stored thumbnail in portrait (sardefault, else oardefault), never the auto frames oar1-3.
        // Last resort hqdefault, cropped to the middle by the tile. A missing size may answer with a grey 120px image.
        var tries = ['oardefault', 'hqdefault'];
        var fallback = function () { var n = tries.shift(); if (n) img.src = 'https://i.ytimg.com/vi/' + id + '/' + n + '.jpg'; else img.onerror = img.onload = null; };
        img.onerror = fallback;
        img.onload = function () { if (img.naturalWidth <= 120 && tries.length) fallback(); };
      }
      f.insertBefore(img, f.firstChild);
    });
  }

  /* ---------- Theater: video posters grow into a centred player; YouTube loads only then ---------- */
  function initTheater() {
    var facades = toArray(doc.querySelectorAll('.yt-facade:not([data-video-id=""])'));
    if (!facades.length) return;

    var el, backdrop, frame, btn;
    var current = null;
    var iframe = null;
    var lastFocus = null;
    var closeTimer = 0;
    var isOpen = false;
    var closing = false;

    function build() {
      el = doc.createElement('div');
      el.className = 'theater';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-label', 'Video');
      el.setAttribute('aria-hidden', 'true');
      backdrop = doc.createElement('div');
      backdrop.className = 'theater-backdrop';
      frame = doc.createElement('div');
      frame.className = 'theater-frame';
      btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'round-btn theater-close';
      btn.setAttribute('aria-label', 'Video schließen');
      btn.innerHTML = '&#10005;';
      el.appendChild(backdrop);
      el.appendChild(frame);
      el.appendChild(btn);
      doc.body.appendChild(el);
      backdrop.addEventListener('click', close);
      btn.addEventListener('click', close);
    }
    function fromRect(r) {
      var w = frame.offsetWidth, h = frame.offsetHeight;
      if (!w || !h || !r.width) return null;
      var s = Math.max(r.width / w, r.height / h);
      var tx = r.left + r.width / 2 - (frame.offsetLeft + w / 2);
      var ty = r.top + r.height / 2 - (frame.offsetTop + h / 2);
      return 'translate3d(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px,0) scale(' + s.toFixed(4) + ')';
    }
    function open(facade) {
      if (isOpen) return;
      if (!el) build();
      clearTimeout(closeTimer);
      if (closing) { unlockScroll(); closing = false; }
      isOpen = true;
      current = facade;
      lastFocus = doc.activeElement;
      var poster = facade.querySelector('img');
      frame.classList.toggle('is-portrait', facade.dataset.ratio === '9/16');
      frame.style.backgroundImage = poster ? 'url("' + (poster.currentSrc || poster.src) + '")' : '';
      lockScroll();
      el.classList.add('is-visible');
      el.setAttribute('aria-hidden', 'false');

      // Created inside the click so autoplay keeps the user gesture where the browser allows it
      iframe = doc.createElement('iframe');
      iframe.src = 'https://www.youtube.com/embed/' + facade.dataset.videoId + '?autoplay=1&rel=0&playsinline=1';
      iframe.setAttribute('frameborder', '0');
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.allowFullscreen = true;
      iframe.title = facade.getAttribute('aria-label') || 'Video';
      var frameEl = iframe;
      iframe.addEventListener('load', function () { frameEl.classList.add('is-loaded'); });
      frame.appendChild(iframe);

      var from = reduced() ? null : fromRect(facade.getBoundingClientRect());
      frame.style.transition = 'none';
      frame.style.opacity = from ? '1' : '0';
      frame.style.transform = from || 'none';
      void frame.offsetWidth;
      el.classList.add('open');
      frame.style.transition = 'transform 520ms ' + EASE_DRAWER + ', opacity 300ms ease';
      frame.style.transform = 'none';
      frame.style.opacity = '1';
      btn.focus({ preventScroll: true });
    }
    function close() {
      if (!isOpen) return;
      isOpen = false;
      closing = true;
      if (iframe) { iframe.remove(); iframe = null; }
      el.classList.remove('open');
      var r = current.getBoundingClientRect();
      var to = (!reduced() && r.bottom > 0 && r.top < window.innerHeight) ? fromRect(r) : null;
      var dur = 420;
      if (to) {
        frame.style.transition = 'transform 420ms ' + EASE_DRAWER;
        frame.style.transform = to;
      } else {
        dur = 220;
        frame.style.transition = 'opacity 220ms ease';
        frame.style.opacity = '0';
      }
      closeTimer = setTimeout(function () {
        el.classList.remove('is-visible');
        el.setAttribute('aria-hidden', 'true');
        frame.style.transition = 'none';
        frame.style.transform = '';
        frame.style.opacity = '';
        frame.style.backgroundImage = '';
        unlockScroll();
        closing = false;
        if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
      }, dur + 30);
    }

    facades.forEach(function (facade) {
      facade.setAttribute('role', 'button');
      facade.setAttribute('tabindex', '0');
      if (!facade.getAttribute('aria-label')) facade.setAttribute('aria-label', 'Video abspielen');
      facade.addEventListener('click', function () { open(facade); });
      facade.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(facade); }
      });
    });
    doc.addEventListener('keydown', function (e) {
      if (isOpen && e.key === 'Escape') { e.preventDefault(); close(); }
    });
  }

  /* ---------- Instagram: two-click embeds — nothing is requested from Meta until a tile is clicked ---------- */
  function initInstagram() {
    var tiles = toArray(doc.querySelectorAll('.ig-tile[data-ig-url]'));
    if (!tiles.length) return;
    var script = null; // the single embed.js tag, created on the first click only
    var ready = false;

    function process() {
      if (window.instgrm && window.instgrm.Embeds) window.instgrm.Embeds.process();
    }
    function fail(tile) {
      if (!tile.classList.contains('is-loading')) return;
      tile.classList.remove('is-loading');
      tile.classList.add('is-failed');
      var status = tile.querySelector('.ig-status');
      var a = doc.createElement('a');
      a.href = tile.getAttribute('data-ig-url');
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'Auf Instagram ansehen ↗';
      status.textContent = '';
      status.appendChild(a);
    }
    function load(tile) {
      if (tile.classList.contains('is-loading') || tile.classList.contains('is-loaded')) return;
      tile.classList.remove('is-failed');
      tile.classList.add('is-loading');
      var old = tile.querySelector('.ig-embed');
      if (old) old.remove();
      var holder = doc.createElement('div');
      holder.className = 'ig-embed';
      var bq = doc.createElement('blockquote');
      bq.className = 'instagram-media';
      bq.setAttribute('data-instgrm-permalink', tile.getAttribute('data-ig-url'));
      bq.setAttribute('data-instgrm-version', '14');
      holder.appendChild(bq);
      tile.appendChild(holder);

      // embed.js swaps the blockquote for an iframe: show it in place of the tile once that iframe has loaded
      var mo = new MutationObserver(function () {
        var frame = holder.querySelector('iframe');
        if (!frame) return;
        mo.disconnect();
        frame.addEventListener('load', function () {
          tile.classList.remove('is-loading', 'is-failed');
          tile.classList.add('is-loaded');
        }, { once: true });
      });
      mo.observe(holder, { childList: true, subtree: true });
      setTimeout(function () { fail(tile); }, 15000);

      if (ready) { process(); return; }
      if (script) return; // still loading: embed.js renders every blockquote on the page when it arrives
      script = doc.createElement('script');
      script.async = true;
      script.src = 'https://www.instagram.com/embed.js';
      script.addEventListener('load', function () { ready = true; process(); });
      script.addEventListener('error', function () {
        script.remove();
        script = null; // a later click may try again
        tiles.forEach(fail);
      });
      doc.body.appendChild(script);
    }

    tiles.forEach(function (tile, i) {
      var btn = tile.querySelector('.ig-load');
      if (!btn) return;
      // Local cover image (served from this site, not from Meta); if it's missing the branded tile stays
      var poster = tile.querySelector('.ig-poster');
      if (poster) {
        var dropPoster = function () { poster.remove(); tile.classList.remove('has-poster'); };
        if (poster.complete && poster.getAttribute('src') && !poster.naturalWidth) dropPoster();
        else {
          tile.classList.add('has-poster');
          poster.addEventListener('error', dropPoster, { once: true });
        }
      }
      // One shared privacy note above the videos (#video-note) describes what a click loads
      var note = tile.querySelector('.ig-note') || doc.getElementById('video-note');
      var cap = tile.parentNode.querySelector('.caption');
      if (note) {
        if (!note.id) note.id = 'ig-note-' + (i + 1);
        btn.setAttribute('aria-describedby', note.id);
      }
      if (cap) btn.setAttribute('aria-label', 'Video abspielen: ' + cap.textContent.trim());
      btn.addEventListener('click', function () { load(tile); });
    });
  }

  /* ---------- Moving Stills: two self-hosted loop players (Videos/MovingStills/<name>.mp4 + <name>.jpg poster,
     set via data-still="<name>"). They buffer shortly before they come on screen, play muted in a loop only while
     visible and pause when scrolled away. With reduced motion, or when the browser blocks autoplay (e.g. iPhone in
     Low Power Mode), the poster stays with a play button and a tap starts the clip. A click on a playing clip opens
     it large in the theater look: close with ×, ESC, a click on the backdrop or a downward swipe. ---------- */
  function initStills() {
    var tiles = toArray(doc.querySelectorAll('.still[data-still]'));
    if (!tiles.length) return;
    var BASE = 'Videos/MovingStills/';
    var active = [];
    var io = null;

    function playQuietly(v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); return p; }
    function needsTap(tile, on) { tile.classList.toggle('needs-tap', !!on); }
    function autoplay(tile) {
      var v = tile.querySelector('video');
      var p = v.play();
      if (p && p.catch) p.catch(function (err) { if (err && err.name === 'NotAllowedError') needsTap(tile, true); });
    }

    tiles.forEach(function (tile) {
      var name = (tile.getAttribute('data-still') || '').trim();
      var video = tile.querySelector('video');
      if (!name || !video) return;
      tile.classList.add('is-ready');
      tile.setAttribute('role', 'button');
      tile.setAttribute('tabindex', '0');
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'none';
      if (!video.getAttribute('poster')) video.poster = BASE + name + '.jpg';
      video.src = BASE + name + '.mp4'; // preload="none": nothing is downloaded before the player comes close
      if (reduced()) needsTap(tile, true);
      active.push(tile);
    });
    if (!active.length) return;

    if ('IntersectionObserver' in window) {
      // Start buffering a little before the player scrolls into view
      var near = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          var v = e.target.querySelector('video');
          if (!reduced() && v.preload !== 'auto') { v.preload = 'auto'; v.load(); }
          near.unobserve(e.target);
        });
      }, { rootMargin: '400px 0px' });
      // Play while visible, pause when scrolled away
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          var v = e.target.querySelector('video');
          if (e.isIntersecting && e.intersectionRatio >= 0.35) {
            if (!isOpen && !reduced() && !e.target.classList.contains('needs-tap')) autoplay(e.target);
          } else if (!v.paused) v.pause();
        });
      }, { threshold: [0, 0.35, 0.6] });
      active.forEach(function (t) { near.observe(t); io.observe(t); });
    }

    // Large view, built from the same classes as the video theater
    var el, backdrop, frame, btn, big;
    var current = null;
    var isOpen = false;
    var closing = false;
    var closeTimer = 0;
    var lastFocus = null;

    function build() {
      el = doc.createElement('div');
      el.className = 'theater theater-stills';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-label', 'Moving Stills');
      el.setAttribute('aria-hidden', 'true');
      backdrop = doc.createElement('div');
      backdrop.className = 'theater-backdrop';
      frame = doc.createElement('div');
      frame.className = 'theater-frame';
      big = doc.createElement('video');
      big.muted = true;
      big.loop = true;
      big.playsInline = true;
      big.setAttribute('muted', '');
      big.setAttribute('loop', '');
      big.setAttribute('playsinline', '');
      frame.appendChild(big);
      btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'round-btn theater-close';
      btn.setAttribute('aria-label', 'Schließen');
      btn.innerHTML = '&#10005;';
      el.appendChild(backdrop);
      el.appendChild(frame);
      el.appendChild(btn);
      doc.body.appendChild(el);
      backdrop.addEventListener('click', close);
      btn.addEventListener('click', close);
      initSwipe();
    }
    function fromRect(r) {
      var w = frame.offsetWidth, h = frame.offsetHeight;
      if (!w || !h || !r.width) return null;
      var s = Math.max(r.width / w, r.height / h);
      var tx = r.left + r.width / 2 - (frame.offsetLeft + w / 2);
      var ty = r.top + r.height / 2 - (frame.offsetTop + h / 2);
      return 'translate3d(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px,0) scale(' + s.toFixed(4) + ')';
    }
    function open(tile) {
      if (isOpen || !tile.classList.contains('is-ready')) return;
      if (!el) build();
      clearTimeout(closeTimer);
      if (closing) { unlockScroll(); closing = false; }
      isOpen = true;
      current = tile;
      lastFocus = doc.activeElement;
      var v = tile.querySelector('video');
      v.pause();
      big.poster = v.poster;
      big.src = v.currentSrc || v.src;
      big.controls = reduced(); // reduced motion: no autoplay, the visitor starts it
      if (!reduced()) {
        try { if (v.currentTime) big.currentTime = v.currentTime; } catch (err) {}
        playQuietly(big);
      }
      lockScroll();
      el.classList.add('is-visible');
      el.setAttribute('aria-hidden', 'false');
      var from = reduced() ? null : fromRect(tile.getBoundingClientRect());
      frame.style.transition = 'none';
      frame.style.opacity = from ? '1' : '0';
      frame.style.transform = from || 'none';
      void frame.offsetWidth;
      el.classList.add('open');
      frame.style.transition = 'transform 520ms ' + EASE_DRAWER + ', opacity 300ms ease';
      frame.style.transform = 'none';
      frame.style.opacity = '1';
      btn.focus({ preventScroll: true });
    }
    function close() {
      if (!isOpen) return;
      isOpen = false;
      closing = true;
      el.classList.remove('open');
      backdrop.style.opacity = '';
      var r = current.getBoundingClientRect();
      var to = (!reduced() && r.bottom > 0 && r.top < window.innerHeight) ? fromRect(r) : null;
      var dur = 420;
      if (to) {
        frame.style.transition = 'transform 420ms ' + EASE_DRAWER;
        frame.style.transform = to;
      } else {
        dur = 220;
        frame.style.transition = 'opacity 220ms ease';
        frame.style.opacity = '0';
      }
      var tile = current;
      closeTimer = setTimeout(function () {
        big.pause();
        big.removeAttribute('src');
        big.load();
        el.classList.remove('is-visible');
        el.setAttribute('aria-hidden', 'true');
        frame.style.transition = 'none';
        frame.style.transform = '';
        frame.style.opacity = '';
        unlockScroll();
        closing = false;
        if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
        // the tile carries on if it is still on screen
        var rr = tile.getBoundingClientRect();
        if (!tile.classList.contains('needs-tap') && rr.bottom > 0 && rr.top < window.innerHeight) playQuietly(tile.querySelector('video'));
      }, dur + 30);
    }
    // Downward swipe dismisses, like the photo lightbox
    function initSwipe() {
      var pid = null, sy = 0, dy = 0, dragging = false, samples = [];
      frame.addEventListener('pointerdown', function (e) {
        if (!isOpen || pid !== null) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        pid = e.pointerId;
        sy = e.clientY;
        dy = 0;
        dragging = false;
        samples = [{ y: sy, t: performance.now() }];
        try { frame.setPointerCapture(pid); } catch (err) {}
      });
      frame.addEventListener('pointermove', function (e) {
        if (e.pointerId !== pid) return;
        dy = e.clientY - sy;
        var now = performance.now();
        samples.push({ y: e.clientY, t: now });
        while (samples.length > 2 && now - samples[0].t > 90) samples.shift();
        if (!dragging && Math.abs(dy) < 8) return;
        dragging = true;
        var down = dy > 0 ? dy : dy * 0.25;
        var p = clamp(down / window.innerHeight, 0, 1);
        frame.style.transition = 'none';
        frame.style.transform = 'translate3d(0,' + down.toFixed(1) + 'px,0) scale(' + (1 - p * 0.25).toFixed(4) + ')';
        backdrop.style.opacity = (1 - p * 1.4).toFixed(3);
      });
      function end(e) {
        if (e.pointerId !== pid) return;
        pid = null;
        if (!dragging) return;
        dragging = false;
        var a = samples[0], b = samples[samples.length - 1];
        var vy = (b.y - a.y) / Math.max(1, b.t - a.t);
        if (e.type === 'pointerup' && (dy > 110 || vy > 0.5)) {
          close();
        } else {
          backdrop.style.opacity = '';
          frame.style.transition = 'transform 360ms ' + EASE_DRAWER;
          frame.style.transform = 'none';
        }
      }
      frame.addEventListener('pointerup', end);
      frame.addEventListener('pointercancel', end);
    }

    function activate(tile) {
      var v = tile.querySelector('video');
      if (tile.classList.contains('needs-tap') && v.paused) {
        needsTap(tile, false);
        var p = playQuietly(v);
        if (p && p.catch) p.catch(function () { needsTap(tile, true); });
        return;
      }
      open(tile);
    }
    active.forEach(function (tile) {
      tile.addEventListener('click', function () { activate(tile); });
      tile.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(tile); }
      });
    });
    doc.addEventListener('keydown', function (e) {
      if (isOpen && e.key === 'Escape') { e.preventDefault(); close(); }
    });
  }

  /* ---------- Small things: year, local time ---------- */
  function initMeta() {
    toArray(doc.querySelectorAll('[data-year]')).forEach(function (el) { el.textContent = new Date().getFullYear(); });
    var clocks = toArray(doc.querySelectorAll('[data-clock]'));
    if (clocks.length && window.Intl) {
      var fmt = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
      var tick = function () { var t = fmt.format(new Date()); clocks.forEach(function (el) { el.textContent = t; }); };
      tick();
      setInterval(tick, 20000);
    }
  }

  /* ---------- Boot ---------- */
  // iOS Safari only applies :active (press feedback) when a touch listener exists
  doc.addEventListener('touchstart', function () {}, { passive: true });

  var revealOk = safe(initReveal);
  if (revealOk) window.zfxReady = true;
  else root.classList.remove('js');
  root.classList.add('zfx-ready');
  safe(initIntro);
  safe(initNav);
  safe(initMenu);
  safe(initSubnav);
  safe(initHero);
  safe(initMarquee);
  safe(initVideoSlots);
  safe(initStills);
  safe(initCursor);
  safe(initMagnetic);
  safe(initLightbox);
  safe(initTheater);
  safe(initInstagram);
  safe(initMeta);
})();
