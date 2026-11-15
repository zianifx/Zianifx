/* ZIANI FX — shared motion layer. Vanilla JS, no dependencies. */
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

  /* ---------- Reveals ---------- */
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

  function initReveal() {
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
    var interval = setInterval(function () {
      check();
      if (!pending.size) clearInterval(interval);
    }, 1500);
    if (!io) check();
  }

  /* ---------- Navbar: material on scroll, progress line, current link, hero parallax ---------- */
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
    var hero = doc.querySelector('.hero');
    var heroInner = doc.querySelector('.hero-inner');
    var isIndex = !!hero;
    var spy = isIndex ? [
      { el: doc.getElementById('kontakt'), link: linkFor('#kontakt') },
      { el: doc.getElementById('portfolio'), link: linkFor('#portfolio') }
    ].filter(function (s) { return s.el && s.link; }) : [];
    var homeLink = links.filter(function (a) { return a.getAttribute('href') === 'index.html'; })[0] || null;

    if (!isIndex && doc.getElementById('subnav')) {
      var portfolioLink = linkFor('#portfolio');
      if (portfolioLink) portfolioLink.classList.add('is-current');
    }

    var current = null;
    var lastCurrent;
    var lastScrolled;
    var heroDone = false;
    var heroOff;

    readers.push(function (st) {
      if (!isIndex) return;
      current = homeLink;
      if (st.y >= st.max - 4 && spy[0]) { current = spy[0].link; return; }
      for (var i = 0; i < spy.length; i++) {
        if (spy[i].el.getBoundingClientRect().top < st.vh * 0.45) { current = spy[i].link; break; }
      }
    });

    writers.push(function (st) {
      var scrolled = st.y > 16;
      if (scrolled !== lastScrolled) { nav.classList.toggle('scrolled', scrolled); lastScrolled = scrolled; }
      if (!cssProgress) {
        bar.style.transform = 'scaleX(' + (st.max > 0 ? clamp(st.y / st.max, 0, 1) : 0).toFixed(4) + ')';
      }
      if (isIndex && current !== lastCurrent) {
        links.forEach(function (a) { a.classList.toggle('is-current', a === current); });
        lastCurrent = current;
      }
      if (hero) {
        var off = st.y > st.vh;
        if (off !== heroOff) { hero.classList.toggle('is-off', off); heroOff = off; }
      }
      if (heroInner && !reduced()) {
        if (st.y < st.vh * 1.1) {
          var p = st.y / st.vh;
          heroInner.style.transform = 'translate3d(0,' + (st.y * 0.3).toFixed(1) + 'px,0)';
          heroInner.style.opacity = clamp(1 - p * 1.15, 0, 1).toFixed(3);
          heroDone = false;
        } else if (!heroDone) {
          heroInner.style.opacity = '0';
          heroDone = true;
        }
      }
    });
    requestFrame();
  }

  /* ---------- Subnav tabs: scroll-spy with one sliding indicator ---------- */
  function initSubnav() {
    var subnav = doc.getElementById('subnav');
    if (!subnav) return;
    var inner = subnav.querySelector('.subnav-inner');
    var nav = doc.getElementById('navbar');
    var links = toArray(subnav.querySelectorAll('.subnav-link')).filter(function (a) {
      return doc.getElementById(a.dataset.target);
    });
    if (!inner || !links.length) return;
    var sections = links.map(function (a) { return doc.getElementById(a.dataset.target); });

    var ind = doc.createElement('span');
    ind.className = 'subnav-indicator';
    ind.setAttribute('aria-hidden', 'true');
    inner.appendChild(ind);

    var active = null;
    var wanted = null;
    var lockUntil = 0;

    function placeIndicator(instant) {
      if (!active) return;
      if (instant) ind.style.transition = 'none';
      ind.style.transform = 'translateX(' + active.offsetLeft + 'px) scaleX(' + active.offsetWidth + ')';
      if (instant) {
        void ind.offsetWidth;
        ind.style.transition = '';
      }
    }
    function keepInView(link) {
      if (subnav.scrollWidth <= subnav.clientWidth + 2) return;
      var left = link.offsetLeft;
      var right = left + link.offsetWidth;
      var viewL = subnav.scrollLeft;
      var viewR = viewL + subnav.clientWidth;
      if (left < viewL + 12 || right > viewR - 12) {
        subnav.scrollTo({ left: Math.max(0, left - 20), behavior: reduced() ? 'auto' : 'smooth' });
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
      var navBottom = nav ? nav.getBoundingClientRect().bottom : 0;
      var line = navBottom + (st.vh - navBottom) * 0.3;
      var idx = 0;
      for (var i = 0; i < sections.length; i++) {
        if (sections[i].getBoundingClientRect().top <= line) idx = i;
      }
      if (st.max > 0 && st.y >= st.max - 4) idx = sections.length - 1;
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

  /* ---------- Cursor follower on [data-cursor] (fine pointers only) ---------- */
  function initCursor() {
    var targets = toArray(doc.querySelectorAll('[data-cursor]'));
    if (!targets.length || !fineMQ.matches || reduced()) return;

    var el = doc.createElement('div');
    el.className = 'zfx-cursor';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>';
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

    function lock() {
      var sbw = window.innerWidth - root.clientWidth;
      root.classList.add('zfx-locked');
      if (sbw > 0) {
        doc.body.style.paddingRight = sbw + 'px';
        var nav = doc.getElementById('navbar');
        if (nav) nav.style.paddingRight = sbw + 'px';
      }
    }
    function unlock() {
      root.classList.remove('zfx-locked');
      doc.body.style.paddingRight = '';
      var nav = doc.getElementById('navbar');
      if (nav) nav.style.paddingRight = '';
    }

    function open(i) {
      if (isOpen) return;
      clearTimeout(closeTimer);
      closing = false;
      isOpen = true;
      idx = i;
      lastFocus = doc.activeElement;
      fill();
      lock();
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
      unlock();
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

  /* ---------- YouTube facades: keep the poster until the player has loaded ---------- */
  function initFacades() {
    toArray(doc.querySelectorAll('.yt-facade')).forEach(function (facade) {
      facade.setAttribute('role', 'button');
      facade.setAttribute('tabindex', '0');
      if (!facade.getAttribute('aria-label')) facade.setAttribute('aria-label', 'Video abspielen');

      function play() {
        if (facade.dataset.playing) return;
        facade.dataset.playing = '1';
        var iframe = doc.createElement('iframe');
        iframe.src = 'https://www.youtube.com/embed/' + facade.dataset.videoId + '?autoplay=1&rel=0';
        iframe.frameBorder = '0';
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
        iframe.allowFullscreen = true;
        iframe.setAttribute('title', 'YouTube-Video');
        iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;opacity:0;transition:opacity 450ms ease;';
        facade.style.position = 'relative';
        facade.classList.add('is-loading');
        facade.removeAttribute('role');
        facade.removeAttribute('tabindex');
        var revealed = false;
        var showPlayer = function () {
          if (revealed) return;
          revealed = true;
          iframe.style.opacity = '1';
          setTimeout(function () {
            toArray(facade.children).forEach(function (c) { if (c !== iframe) facade.removeChild(c); });
            facade.classList.remove('is-loading');
          }, 480);
        };
        iframe.addEventListener('load', showPlayer);
        setTimeout(showPlayer, 4000);
        facade.appendChild(iframe);
      }
      facade.addEventListener('click', play);
      facade.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(); }
      });
    });
  }

  /* ---------- Boot ---------- */
  var revealOk = safe(initReveal);
  if (revealOk) window.zfxReady = true;
  else root.classList.remove('js');
  root.classList.add('zfx-ready');
  safe(initNav);
  safe(initSubnav);
  safe(initCursor);
  safe(initLightbox);
  safe(initFacades);
})();
