/* 리듬 하우스 메트로놈 — 옛 기종 도우미 (v1.6.2)
   아이폰 6 · 6 Plus(iOS 12)처럼 오래된 사파리에서 빠진 기능 두 가지를 채워 줌.
   새 기종에서는 아무 일도 하지 않아요.

   1) 포인터 이벤트(iOS 13부터 있음): 다이얼 돌리기 · 탭 · 길게 누르기가 쓰는 기능.
      없으면 손가락(터치) · 마우스 이벤트를 포인터 이벤트로 바꿔 전달.
   2) flex 간격(gap, iOS 14.1부터): 없으면 버튼 · 줄 사이가 붙어 화면이 엉망이 됨.
      없으면 각 줄의 간격만큼 바깥 여백(margin)을 대신 넣어 줌. 화면이 바뀌면 다시 맞춤. */
(function () {
  'use strict';
  var w = window, d = document;

  /* ---------- 1) 포인터 이벤트 ---------- */
  if (!('PointerEvent' in w)) {
    var captured = {};   // pointerId → 붙잡은 요소
    var downTarget = {}; // pointerId → 처음 누른 요소
    var EP = w.Element && w.Element.prototype;
    if (EP && !EP.setPointerCapture) {
      EP.setPointerCapture = function (id) { captured[id] = this; };
      EP.releasePointerCapture = function (id) { if (captured[id] === this) delete captured[id]; };
      EP.hasPointerCapture = function (id) { return captured[id] === this; };
    }
    var fire = function (type, target, src, pt, id, kind) {
      if (!target) return null;
      var ev;
      try { ev = d.createEvent('Event'); ev.initEvent(type, type !== 'pointerenter' && type !== 'pointerleave', true); } catch (e) { return null; }
      ev.pointerId = id; ev.pointerType = kind; ev.isPrimary = id === 1 || kind === 'mouse';
      ev.clientX = pt.clientX; ev.clientY = pt.clientY; ev.pageX = pt.pageX; ev.pageY = pt.pageY;
      ev.screenX = pt.screenX; ev.screenY = pt.screenY;
      ev.button = kind === 'mouse' ? (src.button || 0) : 0;
      ev.buttons = type === 'pointerup' || type === 'pointercancel' ? 0 : 1;
      ev.width = ev.height = 1; ev.pressure = ev.buttons ? 0.5 : 0;
      ev.shiftKey = !!src.shiftKey; ev.ctrlKey = !!src.ctrlKey; ev.altKey = !!src.altKey; ev.metaKey = !!src.metaKey;
      target.dispatchEvent(ev);
      return ev;
    };
    var targetFor = function (id, fallback) { return captured[id] || downTarget[id] || fallback; };
    var release = function (id) {
      var t = captured[id];
      delete captured[id]; delete downTarget[id];
      if (t) fire('lostpointercapture', t, {}, { clientX: 0, clientY: 0, pageX: 0, pageY: 0, screenX: 0, screenY: 0 }, id, 'touch');
    };
    // 손가락: 터치 번호마다 다른 포인터 번호 (1부터)
    var touchId = function (t) { return t.identifier + 2; };
    d.addEventListener('touchstart', function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i], id = touchId(t);
        downTarget[id] = t.target;
        fire('pointerdown', t.target, e, t, id, 'touch');
      }
    }, { capture: true, passive: true });
    d.addEventListener('touchmove', function (e) {
      var stop = false;
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i], id = touchId(t);
        var ev = fire('pointermove', targetFor(id, t.target), e, t, id, 'touch');
        if (ev && ev.defaultPrevented) stop = true;
      }
      // 다이얼 돌리기 같은 동작 중에는 화면이 같이 밀리지 않게
      if (stop || (e.target && e.target.closest && e.target.closest('.dial, .tap, .round'))) { try { e.preventDefault(); } catch (err) { /* 무시 */ } }
    }, { capture: true, passive: false });
    var touchEnd = function (type) {
      return function (e) {
        for (var i = 0; i < e.changedTouches.length; i++) {
          var t = e.changedTouches[i], id = touchId(t);
          fire(type, targetFor(id, t.target), e, t, id, 'touch');
          release(id);
        }
      };
    };
    d.addEventListener('touchend', touchEnd('pointerup'), { capture: true, passive: true });
    d.addEventListener('touchcancel', touchEnd('pointercancel'), { capture: true, passive: true });
    // 마우스 (옛 맥 사파리). 터치 직후 따라오는 가짜 마우스 이벤트는 무시
    var lastTouch = 0;
    d.addEventListener('touchend', function () { lastTouch = Date.now(); }, true);
    var mouseDown = false;
    d.addEventListener('mousedown', function (e) {
      if (Date.now() - lastTouch < 800) return;
      mouseDown = true; downTarget[1] = e.target;
      fire('pointerdown', e.target, e, e, 1, 'mouse');
    }, true);
    d.addEventListener('mousemove', function (e) {
      if (Date.now() - lastTouch < 800) return;
      fire('pointermove', mouseDown ? targetFor(1, e.target) : e.target, e, e, 1, 'mouse');
    }, true);
    d.addEventListener('mouseup', function (e) {
      if (Date.now() - lastTouch < 800 || !mouseDown) return;
      mouseDown = false;
      fire('pointerup', targetFor(1, e.target), e, e, 1, 'mouse');
      release(1);
    }, true);
  }

  /* ---------- 2) flex 간격 ---------- */
  function flexGapWorks() {
    var box = d.createElement('div');
    box.style.cssText = 'display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden';
    box.appendChild(d.createElement('div'));
    box.appendChild(d.createElement('div'));
    d.body.appendChild(box);
    var ok = box.scrollHeight === 1;
    d.body.removeChild(box);
    return ok;
  }
  function px(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  var SIDES = { row: 'marginLeft', 'row-reverse': 'marginRight', column: 'marginTop', 'column-reverse': 'marginBottom' };
  function undo(el) {
    var prev = el.getAttribute('data-fg');
    if (!prev) return;
    var parts = prev.split(',');
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i].split(':');
      el.style[kv[0]] = kv[1] === '-' ? '' : kv[1];
    }
    el.removeAttribute('data-fg');
  }
  function setM(el, prop, add, memo) {
    var base = px(w.getComputedStyle(el)[prop]);
    memo.push(prop + ':' + (el.style[prop] || '-'));
    el.style[prop] = (base + add) + 'px';
  }
  function applyGaps() {
    var all = d.querySelectorAll('[data-fg]');
    for (var i = 0; i < all.length; i++) undo(all[i]);
    var els = d.body.getElementsByTagName('*');
    for (var j = 0; j < els.length; j++) {
      var el = els[j];
      var cs = w.getComputedStyle(el);
      if (cs.display !== 'flex' && cs.display !== 'inline-flex') continue;
      // 지금 안 보이는 곳(닫힌 시트 등)은 건너뜀 — 열릴 때 다시 맞춤 (auto 여백을 0으로 굳히지 않게)
      if (!el.getClientRects().length) continue;
      var rg = px(cs.rowGap), cg = px(cs.columnGap);
      if (FORCE) {
        // 시험용: 새 브라우저에서 "간격이 안 되는 사파리"를 흉내 — 원래 간격을 기억해 두고 간격은 0으로
        var kept = el.getAttribute('data-fgap');
        if (kept) { rg = px(kept.split(',')[0]); cg = px(kept.split(',')[1]); }
        else if (rg || cg) { el.setAttribute('data-fgap', rg + ',' + cg); el.style.rowGap = '0px'; el.style.columnGap = '0px'; }
      }
      if (!rg && !cg) continue;
      var dir = cs.flexDirection || 'row';
      var wrap = cs.flexWrap && cs.flexWrap !== 'nowrap';
      var kids = [];
      for (var k = 0; k < el.children.length; k++) {
        var c = el.children[k];
        if (c.hidden) continue;
        var ccs = w.getComputedStyle(c);
        if (ccs.display === 'none' || ccs.position === 'absolute' || ccs.position === 'fixed') continue;
        kids.push(c);
      }
      if (kids.length < 2) continue;
      var memo;
      if (!wrap) {
        var prop = SIDES[dir] || 'marginLeft';
        var g = dir.indexOf('column') === 0 ? rg : cg;
        if (!g) continue;
        for (var m = 1; m < kids.length; m++) {
          memo = [];
          setM(kids[m], prop, g, memo);
          kids[m].setAttribute('data-fg', memo.join(','));
        }
      } else {
        // 여러 줄: 아이템마다 오른쪽 · 아래 여백, 바깥 상자는 그만큼 당김
        for (var n = 0; n < kids.length; n++) {
          memo = [];
          if (cg) setM(kids[n], 'marginRight', cg, memo);
          if (rg) setM(kids[n], 'marginBottom', rg, memo);
          kids[n].setAttribute('data-fg', memo.join(','));
        }
        memo = [];
        if (rg) setM(el, 'marginBottom', -rg, memo);
        if (memo.length) el.setAttribute('data-fg', memo.join(','));
      }
    }
  }
  var FORCE = /[?&]legacy=1\b/.test(location.search); // 시험용: 새 기종에서도 강제로
  function startGapShim() {
    var force = FORCE;
    if (!force && flexGapWorks()) return;
    if (force) d.documentElement.classList.add('legacy-test');
    d.documentElement.classList.add('no-flex-gap');
    var t = 0, busy = false;
    var run = function () {
      t = 0; busy = true;
      try { applyGaps(); } catch (e) { /* 무시 */ }
      try { var ev = d.createEvent('Event'); ev.initEvent('rh-layout', false, false); w.dispatchEvent(ev); } catch (e) { /* 무시 */ }
      setTimeout(function () { busy = false; }, 0);
    };
    var later = function () { if (busy || t) return; t = setTimeout(run, 60); };
    run();
    try {
      // 박마다 바뀌는 class(지금 박 표시 등)까지 보면 너무 자주 돌아서, class는 큰 틀(화면 · 홈)만 지켜봄
      var mo = new MutationObserver(later);
      mo.observe(d.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
      var roots = [d.documentElement, d.body, d.getElementById('viewHome'), d.querySelector('.app')];
      for (var r = 0; r < roots.length; r++) if (roots[r]) mo.observe(roots[r], { attributes: true, attributeFilter: ['class'] });
    } catch (e) { /* 무시 */ }
    w.addEventListener('resize', later);
    w.__rhGapShim = run;
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', startGapShim); else startGapShim();
})();
