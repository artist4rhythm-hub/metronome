/* 리듬 하우스 메트로놈 — 화면과 조작 (1-1 단계)
   F1 빠르기 · F2 탭 템포 · F3 박자 · 분할 · 세기 · 폴리리듬 · F4 소리 · 깜빡임 · 진동 · 화면 지연 보정 */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };
  /* 앱(안드로이드 · 아이폰) 안에서 돌 때만 쓰는 기능 */
  const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const PLUG = (NATIVE && window.Capacitor.Plugins) || {};
  const WEB_URL = 'https://artist4rhythm-hub.github.io/metronome/'; // 합주 QR이 가리킬 공개 주소
  if (NATIVE) document.documentElement.classList.add('native');
  const engine = new window.RHEngine();
  const KEY = 'rhm.settings.v1';
  const MIN = 20, MAX = 400;

  const COUNT_WORDS = ['하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열', '열하나', '열둘', '열셋', '열넷', '열다섯', '열여섯'];
  const LEVEL_NAME = { 3: '강', 2: '보통', 1: '약', 0: '끔' };
  // [이 값보다 느리면, 이름, 뜻]
  const TEMPO_NAMES = [
    [25, 'Larghissimo', '가장 느리게'], [40, 'Grave', '아주 느리고 무겁게'], [60, 'Largo', '느리고 넓게'],
    [66, 'Larghetto', '조금 느리게'], [76, 'Adagio', '느리게'], [108, 'Andante', '걷는 빠르기'],
    [120, 'Moderato', '보통 빠르기'], [156, 'Allegro', '빠르게'], [176, 'Vivace', '생기 있게'],
    [200, 'Presto', '매우 빠르게'], [Infinity, 'Prestissimo', '가장 빠르게']
  ];
  const SUBDIVS = [
    ['none', '없음', '분할 없음'], ['eighth', '8분', '8분 분할'], ['triplet', '셋잇단', '셋잇단 분할'],
    ['sixteenth', '16분', '16분 분할'], ['quintuplet', '5연음', '5연음 분할'], ['sextuplet', '6연음', '6연음 분할']
  ];
  const SLOTS = { none: 1, eighth: 2, triplet: 3, sixteenth: 4, quintuplet: 5, sextuplet: 6 };
  // 자주 쓰는 리듬 패턴 [모양, 이름]
  const PRESETS = {
    eighth: [[[1, 1], '모두'], [[0, 1], '엇박']],
    triplet: [[[1, 1, 1], '모두'], [[1, 0, 1], '셔플'], [[1, 1, 0], '끝 쉼'], [[0, 1, 1], '첫 쉼']],
    sixteenth: [[[1, 1, 1, 1], '모두'], [[1, 1, 1, 0], '갤럽'], [[1, 0, 1, 1], '역갤럽'], [[1, 1, 0, 1], '셋째 쉼'], [[1, 0, 0, 1], '양끝'], [[0, 1, 0, 1], '엇박']],
    quintuplet: [[[1, 1, 1, 1, 1], '모두']],
    sextuplet: [[[1, 1, 1, 1, 1, 1], '모두'], [[1, 0, 1, 1, 0, 1], '셔플 16']]
  };
  const SLOT_SAY = {
    1: ['박'], 2: ['박', '&'], 3: ['박', '트', '렛'], 4: ['박', 'e', '&', 'a'],
    5: ['박', '2', '3', '4', '5'], 6: ['박', '2', '3', '4', '5', '6']
  };
  const METERS = [[2, 4], [3, 4], [4, 4], [5, 4], [6, 8], [7, 8], [9, 8], [12, 8]];

  const DEFAULTS = {
    bpm: 96, beats: 4, unit: 4, grouping: null, accents: [3, 2, 2, 2], subdiv: 'none',
    poly: { on: false, n: 3 }, beatVol: 1, subVol: 0.6, polyVol: 0.7,
    voices: {
      accent: { sound: 'click', pitch: 4, hz: 1500, wave: 'sine' },
      beat: { sound: 'click', pitch: 0, hz: 1000, wave: 'sine' },
      sub: { sound: 'hihat', pitch: 0, hz: 1800, wave: 'sine' },
      poly: { sound: 'click', pitch: -6, hz: 700, wave: 'sine' }
    },
    flash: 'first', vibrate: false, offset: 0, wake: true, viewMode: 'pendulum',
    patterns: {}, accentLink: true,
    skin: 'forest', appearance: 'auto',
    practice: { on: false, every: 5, unit: 'min', step: 5, target: 140 },
    timer: 0, pracBig: false, ui: 'basic'
  };
  const ROLES = ['accent', 'beat', 'sub', 'poly'];

  /* ---------- 저장 ---------- */
  let HAD_SETTINGS = false; // 이 기기에서 전에 쓴 적이 있는지 (업데이트 소식용)
  function load() {
    let s = JSON.parse(JSON.stringify(DEFAULTS));
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        HAD_SETTINGS = true;
        const v = JSON.parse(raw);
        s = Object.assign(s, v);
        s.poly = Object.assign({ on: false, n: 3 }, v.poly || {});
        // 예전 버전 설정 옮기기
        const base = JSON.parse(JSON.stringify(DEFAULTS.voices));
        if (!v.voices && v.sound) ROLES.forEach(function (r) { base[r].sound = v.sound; });
        if (v.voices) ROLES.forEach(function (r) { base[r] = Object.assign(base[r], v.voices[r] || {}); });
        // 없어진 소리는 비슷한 소리로
        ROLES.forEach(function (r) {
          const nw = window.RHSounds.RENAMED[base[r].sound];
          if (nw) base[r].sound = nw;
        });
        s.voices = base;
        if (v.accentLink == null && v.voices) {
          const A = base.accent, B = base.beat;
          s.accentLink = A.sound === B.sound && (A.wave || 'sine') === (B.wave || 'sine') && Math.abs(A.pitch - (B.pitch + 4)) < 0.05;
        }
        if (!v.viewMode && v.pendulum === false) s.viewMode = 'dots';
        s.practice = Object.assign({}, DEFAULTS.practice, v.practice || {});
        s.patterns = Object.assign({}, v.patterns || {});
        if (v.subdiv === 'shuffle') { s.subdiv = 'triplet'; s.patterns.triplet = [1, 0, 1]; }
      }
    } catch (e) { /* 저장소를 못 쓰면 기본값 */ }
    s.bpm = clampBpm(s.bpm);
    s.beats = Math.min(16, Math.max(1, s.beats | 0));
    if (s.unit !== 4 && s.unit !== 8) s.unit = 4;
    if (!Array.isArray(s.accents) || s.accents.length !== s.beats) s.accents = accentsFor(s.beats, s.grouping);
    if (!SLOTS[s.subdiv]) s.subdiv = 'none';
    return s;
  }
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 무시 */ }
      if (typeof bandChanged === 'function') bandChanged();
    }, 250);
  }

  function clampBpm(v) {
    v = Math.round(Number(v));
    if (!isFinite(v)) v = 96;
    return Math.min(MAX, Math.max(MIN, v));
  }

  /* ---------- 박자 계산 ---------- */
  function groupOptions(n) {
    const all = [];
    (function walk(rest, parts) {
      if (all.length > 400) return;
      if (rest === 0) { all.push(parts.slice()); return; }
      if (rest >= 2) { parts.push(2); walk(rest - 2, parts); parts.pop(); }
      if (rest >= 3) { parts.push(3); walk(rest - 3, parts); parts.pop(); }
    })(n, []);
    const uniform = function (g) { return g.every(function (x) { return x === g[0]; }); };
    // 같은 묶음끼리(3+3+3, 2+2+2)가 먼저, 그다음 묶음 수가 적은 순서
    const rank = function (g) { return uniform(g) ? (g[0] === 3 ? 0 : 1) : 2; };
    all.sort(function (a, b) {
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      if (a.length !== b.length) return a.length - b.length;
      return a.join('').localeCompare(b.join(''));
    });
    return all.slice(0, 6);
  }

  function defaultGrouping(n, unit) {
    if (unit !== 8 || n < 4) return null;
    if (n % 3 === 0) return new Array(n / 3).fill(3);
    if (n === 5) return [2, 3];
    if (n === 7) return [2, 2, 3];
    if (n % 2 === 0) return new Array(n / 2).fill(2);
    return groupOptions(n)[0] || null;
  }

  function accentsFor(beats, grouping) {
    const a = new Array(beats).fill(2);
    if (grouping) {
      a.fill(1);
      let i = 0;
      for (const g of grouping) { if (i < beats) a[i] = 2; i += g; }
    }
    a[0] = 3;
    return a;
  }

  function countLabels() {
    const out = [];
    if (S.grouping) {
      for (const g of S.grouping) for (let i = 0; i < g; i++) out.push(COUNT_WORDS[i]);
    } else {
      for (let i = 0; i < S.beats; i++) out.push(COUNT_WORDS[i]);
    }
    return out;
  }

  let S = load();

  /* ---------- 색상 테마: skin(8가지) × mode(밝게 · 어둡게) ---------- */
  // [id, 이름, 설명, 프로, 밝게 견본[bg, surface, brand, accent, ink, dot, brandInk], 어둡게 견본]
  const SKINS = [["forest", "숲", "짙은 녹색 · 기본", false, ["#F6F7F4", "#FFFFFF", "#123B2A", "#E8590C", "#14231B", "#C3CCC6", "#FFFFFF"], ["#101418", "#182024", "#7FC4A0", "#F08C4A", "#EEF2F0", "#3A4542", "#0E1A14"]], ["contrast", "고대비", "가장 또렷하게 · 시력 배려", false, ["#FFFFFF", "#FFFFFF", "#000000", "#0040C1", "#000000", "#8F8F8F", "#FFFFFF"], ["#000000", "#0B0B0B", "#FFE500", "#00E1FF", "#FFFFFF", "#6E6E6E", "#000000"]], ["ocean", "바다", "네이비 · 산호", true, ["#EAF2F9", "#FFFFFF", "#0B3D66", "#E0482F", "#0F1E2E", "#BFCAD5", "#FFFFFF"], ["#0B1420", "#13202E", "#6FB7E8", "#FF7A62", "#EAF1F8", "#33465C", "#06182A"]], ["sunset", "노을", "자주 · 주황", true, ["#FCEEE6", "#FFFAF7", "#6A1F45", "#E4572E", "#2A1712", "#DCC7BB", "#FFFFFF"], ["#1A1012", "#24171A", "#F2A07B", "#FF8A5C", "#F8ECE8", "#4A3436", "#2A0F08"]], ["classic", "클래식", "호두나무 · 황동", true, ["#F7F1E8", "#FFFDF8", "#4A2C17", "#A86A12", "#241A12", "#D3C3AE", "#F7E7C6"], ["#15100B", "#1F1811", "#D9A84E", "#E07B39", "#F5ECDD", "#45382A", "#1E1407"]], ["stage", "무대", "검정 · 네온 · 공연용", true, ["#EEEEF6", "#FFFFFF", "#1E1E2C", "#D6006A", "#12121A", "#C6C6D3", "#D4FF5A"], ["#07070B", "#121219", "#C8FF3D", "#FF3D8B", "#F4F4FA", "#34344A", "#0A0F00"]], ["ink", "먹", "흑백 · 붉은 점", true, ["#F5F5F3", "#FFFFFF", "#1A1A1A", "#D32F2F", "#111111", "#C4C4BF", "#FFFFFF"], ["#0E0E0E", "#181818", "#EDEDEA", "#FF5A4F", "#F0F0EE", "#3C3C3A", "#111111"]], ["blossom", "벚꽃", "분홍 · 청록 · 어린 학생용", true, ["#FFF6F8", "#FFFFFF", "#9D2B5B", "#0B7C7C", "#2B1420", "#E7C6D2", "#FFFFFF"], ["#1A0F15", "#24161E", "#F59BBE", "#4FD1C5", "#FBEFF4", "#4C3441", "#2B0A18"]]];
  const PRO_OPEN = true; // 시범 기간: 프로 테마도 모두 열어 둠
  const darkMQ = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function resolvedMode() {
    if (S.appearance === 'light' || S.appearance === 'dark') return S.appearance;
    // 미리보기 화면처럼 바깥에서 밝게/어둡게를 정해 주면 그걸 따름
    const host = document.documentElement.getAttribute('data-theme');
    if (host === 'light' || host === 'dark') return host;
    return darkMQ && darkMQ.matches ? 'dark' : 'light';
  }
  function applyTheme() {
    if (!SKINS.some(function (k) { return k[0] === S.skin; })) S.skin = 'forest';
    const r = document.documentElement;
    r.setAttribute('data-skin', S.skin);
    r.setAttribute('data-mode', resolvedMode());
    if (window.__rhVizRefresh) window.__rhVizRefresh();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', getComputedStyle(r).getPropertyValue('--bg').trim() || '#F6F7F4');
    // 앱(안드로이드 · 아이폰): 맨 위 시계 · 배터리 글자색을 테마 밝기에 맞춤 (어두운 테마 → 흰 글자)
    try { if (PLUG.SystemBars) PLUG.SystemBars.setStyle({ style: resolvedMode() === 'dark' ? 'DARK' : 'LIGHT' }); } catch (e) { /* 무시 */ }
  }
  applyTheme();
  if (darkMQ) {
    const onMQ = function () { if (S.appearance === 'auto') { applyTheme(); if (typeof renderSkins === 'function') renderSkins(); } };
    if (darkMQ.addEventListener) darkMQ.addEventListener('change', onMQ); else if (darkMQ.addListener) darkMQ.addListener(onMQ);
  }
  try {
    new MutationObserver(function () { if (S.appearance === 'auto') applyTheme(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  } catch (e) { /* 무시 */ }

  // 지금 분할의 패턴 (자리마다 1 소리 · 0 쉼표)
  function pattern() {
    const n = SLOTS[S.subdiv] || 1;
    const p = S.patterns[S.subdiv];
    return Array.isArray(p) && p.length === n ? p.slice() : new Array(n).fill(1);
  }
  function patternName() {
    const p = pattern().join('');
    const list = PRESETS[S.subdiv] || [];
    const f = list.find(function (x) { return x[0].join('') === p; });
    if (f) return f[1] === '모두' ? '' : f[1];
    return '내 패턴';
  }
  function practiceForEngine() {
    return S.practice.on ? { on: true, every: S.practice.every, unit: S.practice.unit, step: S.practice.step, target: S.practice.target } : null;
  }

  function pushEngine() {
    engine.set({
      bpm: S.bpm, beats: S.beats, accents: S.accents.slice(), subdiv: S.subdiv,
      pattern: S.subdiv === 'none' ? null : pattern(), practice: practiceForEngine(),
      poly: { on: S.poly.on, n: S.poly.n },
      voices: JSON.parse(JSON.stringify(S.voices)),
      beatVol: S.beatVol, subVol: S.subVol, polyVol: S.polyVol
    });
  }

  /* ---------- 빠르기 (F1) ---------- */
  const R = 128;
  function renderTempo() {
    $('bpmNum').textContent = S.bpm;
    $('bpmNum').classList.toggle('wide', S.bpm >= 100);
    $('sNum').textContent = S.bpm;
    $('sNum').classList.toggle('wide', S.bpm >= 100);
    $('sUnit').textContent = (S.unit === 8 ? '♪' : '♩') + ' = BPM';
    const name = TEMPO_NAMES.find(function (t) { return S.bpm < t[0]; });
    const pl = pracShown() ? '' : practiceLine();
    $('tempoName').textContent = pl || (name[1] + ' · ' + name[2]);
    $('tempoName').classList.toggle('practice', !!pl);
    $('unitNote').textContent = S.unit === 8 ? '♪' : '♩';
    const dial = $('dial');
    dial.setAttribute('aria-valuenow', S.bpm);
    dial.setAttribute('aria-valuetext', S.bpm + ' BPM, ' + name[2]);
    // v1.6.1: 아래가 트인 300° 다이얼 — 왼쪽 아래 끝 20, 오른쪽 아래 끝 400 (느린 쪽을 넓게 보이게 로그 눈금)
    const frac = Math.min(1, Math.max(0, Math.log(S.bpm / MIN) / Math.log(MAX / MIN)));
    const ARC = 128 * 300 * Math.PI / 180; // 300° 고리의 실제 길이
    $('dialArc').setAttribute('stroke-dasharray', Math.max(0.5, frac * ARC).toFixed(1) + ' ' + (ARC + 10).toFixed(1));
    const ang = (120 + 300 * frac) * Math.PI / 180;
    $('dialKnob').setAttribute('cx', (140 + R * Math.cos(ang)).toFixed(1));
    $('dialKnob').setAttribute('cy', (140 + R * Math.sin(ang)).toFixed(1));
    renderPrac();
  }

  function setBpm(v) {
    const nv = clampBpm(v);
    if (nv === S.bpm) return;
    S.bpm = nv;
    pracStart = nv; // 손으로 바꾸면 연습 계단도 여기서 다시 시작
    engine.set({ bpm: nv });
    renderTempo();
    save();
  }

  // 끝(20 · 400)에 닿으면: 더 가지 않고 살짝 튕기며 알려 줌
  let limitT = 0;
  function hitLimit() {
    const d = $('dial');
    if (d.classList.contains('limit')) return;
    d.classList.add('limit');
    clearTimeout(limitT);
    limitT = setTimeout(function () { d.classList.remove('limit'); }, 350);
    try { if (PLUG.Haptics) PLUG.Haptics.impact({ style: 'MEDIUM' }); else if (navigator.vibrate) navigator.vibrate(15); } catch (e) { /* 무시 */ }
  }
  // 끝을 넘겨 계속 돌려도 거기서 멈춤. 반대로 돌리면 바로 다시 움직임 (넘긴 만큼 되감을 필요 없음)
  function dragTo(st, raw) {
    if (raw < MIN || raw > MAX) {
      const edge = raw < MIN ? MIN : MAX;
      st.base = edge; st.acc = 0;
      setBpm(edge);
      hitLimit();
      return;
    }
    setBpm(raw);
  }

  // 다이얼 돌리기: 5도마다 1 BPM
  (function dialDrag() {
    const dial = $('dial');
    let drag = null;
    dial.addEventListener('pointerdown', function (e) {
      if (e.target.closest('#bpmBtn')) return;
      const r = dial.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      drag = { cx: cx, cy: cy, rmin: r.width * 0.16, last: Math.atan2(e.clientY - cy, e.clientX - cx), acc: 0, base: S.bpm };
      dial.setPointerCapture(e.pointerId);
      dial.classList.add('dragging');
      e.preventDefault();
    });
    dial.addEventListener('pointermove', function (e) {
      if (!drag) return;
      const dx = e.clientX - drag.cx, dy = e.clientY - drag.cy;
      // 손가락이 한가운데를 지나가면 방향이 뒤집혀 숫자가 튀므로 무시
      if (dx * dx + dy * dy < drag.rmin * drag.rmin) return;
      const a = Math.atan2(dy, dx);
      let d = a - drag.last;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      drag.last = a;
      drag.acc += d * 180 / Math.PI;
      dragTo(drag, drag.base + Math.round(drag.acc / 5));
    });
    const end = function () { drag = null; dial.classList.remove('dragging'); };
    dial.addEventListener('pointerup', end);
    dial.addEventListener('pointercancel', end);
    dial.addEventListener('keydown', function (e) {
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { if (S.bpm >= MAX) hitLimit(); setBpm(S.bpm + step); e.preventDefault(); e.stopPropagation(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { if (S.bpm <= MIN) hitLimit(); setBpm(S.bpm - step); e.preventDefault(); e.stopPropagation(); }
    });
  })();

  // − / + 길게 누르면 계속, 2초 넘게 누르면 5씩
  function hold(btn, dir) {
    let t1 = null, t2 = null, start = 0;
    const fire = function () {
      if ((dir < 0 && S.bpm <= MIN) || (dir > 0 && S.bpm >= MAX)) { hitLimit(); return; }
      if (performance.now() - start > 2000) {
        setBpm(dir > 0 ? Math.floor(S.bpm / 5) * 5 + 5 : Math.ceil(S.bpm / 5) * 5 - 5);
      } else {
        setBpm(S.bpm + dir);
      }
    };
    const end = function () { clearTimeout(t1); clearInterval(t2); t1 = t2 = null; };
    btn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      start = performance.now();
      fire();
      t1 = setTimeout(function () { t2 = setInterval(fire, 90); }, 400);
      try { btn.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { btn.addEventListener(ev, end); });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setBpm(S.bpm + dir); }
    });
  }
  hold($('minus'), -1);
  hold($('plus'), 1);

  /* ---------- 탭 템포 (F2) ---------- */
  let taps = [];
  function tap() {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now);
    if (taps.length > 9) taps.shift();
    const btn = $('tap');
    btn.classList.remove('hit');
    void btn.offsetWidth;
    btn.classList.add('hit');
    if (taps.length < 2) { $('tapLabel').textContent = '한 번 더'; return; }
    const iv = [];
    for (let i = 1; i < taps.length; i++) iv.push(taps[i] - taps[i - 1]);
    const sorted = iv.slice().sort(function (a, b) { return a - b; });
    const med = sorted[Math.floor(sorted.length / 2)];
    const good = iv.filter(function (x) { return Math.abs(x - med) < med * 0.25; });
    const avg = good.reduce(function (a, b) { return a + b; }, 0) / good.length;
    setBpm(60000 / avg);
    $('tapLabel').textContent = '탭 ' + taps.length;
    clearTimeout(tap.reset);
    tap.reset = setTimeout(function () { $('tapLabel').textContent = '탭'; }, 2100);
  }
  // 두드리면 탭 템포, 좌우로 밀면 빠르기 조절 (5px마다 1 BPM)
  (function tapSwipe() {
    const btn = $('tap');
    let sw = null;
    btn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      const before = S.bpm;
      tap();
      sw = { x: e.clientX, base: before, moved: false };
      try { btn.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    });
    btn.addEventListener('pointermove', function (e) {
      if (!sw) return;
      const dx = e.clientX - sw.x;
      if (!sw.moved && Math.abs(dx) > 10) {
        // 밀기 시작: 방금 누른 탭은 취소
        sw.moved = true;
        sw.x0 = e.clientX; // 여기서부터 5px마다 1 BPM
        taps = [];
        clearTimeout(tap.reset);
        setBpm(sw.base);
        btn.classList.add('swiping');
      }
      if (sw.moved) {
        const raw = sw.base + Math.round((e.clientX - sw.x0) / 5);
        if (raw < MIN || raw > MAX) {
          // 끝에서 멈추고, 지금 손가락 위치를 새 기준으로 → 반대로 밀면 바로 움직임
          const edge = raw < MIN ? MIN : MAX;
          sw.base = edge; sw.x0 = e.clientX;
          setBpm(edge); hitLimit();
        } else setBpm(raw);
        $('tapLabel').textContent = S.bpm;
      }
    });
    const end = function () {
      if (sw && sw.moved) {
        btn.classList.remove('swiping');
        $('tapLabel').textContent = '탭';
      }
      sw = null;
    };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { btn.addEventListener(ev, end); });
  })();
  $('tap').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); tap(); }
  });

  /* ---------- 박 점 (세기) ---------- */
  function renderBeats() {
    const box = $('beats');
    box.innerHTML = '';
    scheduleFit();
    sringKey = '';
    if (S.ui === 'simple') setTimeout(buildSring, 0); // 박자가 바뀌면 원의 칸 수도
    box.classList.toggle('many', S.beats > 8);
    const labels = countLabels();
    for (let i = 0; i < S.beats; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'beat lvl-' + S.accents[i];
      if (S.grouping && i > 0 && labels[i] === COUNT_WORDS[0]) b.classList.add('group-start');
      b.setAttribute('aria-label', (i + 1) + '번째 박 ' + labels[i] + ', ' + LEVEL_NAME[S.accents[i]]);
      const dot = document.createElement('span');
      dot.className = 'dot';
      const lbl = document.createElement('span');
      lbl.className = 'lbl';
      lbl.textContent = S.beats > 8 && !S.grouping ? String(i + 1) : labels[i];
      b.appendChild(dot);
      if (S.subdiv !== 'none') {
        const subs = document.createElement('span');
        subs.className = 'subs';
        subs.setAttribute('aria-hidden', 'true');
        pattern().forEach(function (on, k) {
          const m = document.createElement('i');
          if (!on) m.className = 'r';
          if (k === 0) m.classList.add('first');
          subs.appendChild(m);
        });
        b.appendChild(subs);
      }
      b.appendChild(lbl);
      b.addEventListener('click', function () {
        const cur = S.accents[i];
        S.accents[i] = cur === 0 ? 3 : cur - 1;
        engine.set({ accents: S.accents.slice() });
        renderBeats();
        save();
        const again = $('beats').children[i];
        if (again) again.focus();
      });
      box.appendChild(b);
    }
    if (S.viewMode === 'score') renderScore();
  }

  /* ---------- 칩 ---------- */
  function soundName(id) {
    const f = window.RHSounds.LIST.find(function (x) { return x[0] === id; });
    return f ? f[1] : '클릭';
  }
  function renderChips() {
    const oddGroup = S.grouping && S.grouping.some(function (g) { return g !== S.grouping[0]; });
    $('chipMeter').textContent = S.beats + '/' + S.unit + (oddGroup ? ' · ' + S.grouping.join('+') : ' 박자');
    $('chipMeter').setAttribute('aria-label', '박자 ' + S.beats + '/' + S.unit + (S.grouping ? ', 묶음 ' + S.grouping.join('+') : ''));
    const sd = SUBDIVS.find(function (x) { return x[0] === S.subdiv; }) || SUBDIVS[0];
    const cs = $('chipSub');
    cs.innerHTML = '';
    cs.appendChild(window.RHNotation.icon(S.subdiv, pattern()));
    const ct = document.createElement('span');
    const pn = S.subdiv === 'none' ? '' : patternName();
    ct.textContent = (S.subdiv === 'none' ? '분할 없음' : sd[1] + (pn ? ' · ' + pn : '')) + (S.poly.on ? ' · 폴리 ' + S.poly.n + ':' + S.beats : '');
    cs.setAttribute('aria-label', '분할 ' + ct.textContent);
    cs.appendChild(ct);
    const bv = S.voices.beat;
    const sc = $('chipSound');
    sc.innerHTML = '<svg class="chip-ic" width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 8 H6 L10 4.5 V15.5 L6 12 H3 Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path><path d="M13 7.5 C14.5 9 14.5 11 13 12.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg>';
    const sn = document.createElement('span');
    sn.textContent = bv.sound === 'freq' ? bv.hz + 'Hz' : soundName(bv.sound);
    sc.appendChild(sn);
    sc.setAttribute('aria-label', '소리 ' + sn.textContent);
  }

  /* ---------- 박자 시트 ---------- */
  function setMeter(beats, unit) {
    S.beats = Math.min(16, Math.max(1, beats));
    S.unit = unit;
    S.grouping = defaultGrouping(S.beats, S.unit);
    S.accents = accentsFor(S.beats, S.grouping);
    pushEngine();
    renderAll();
    save();
  }

  function buildMeterSheet() {
    const grid = $('meterGrid');
    METERS.forEach(function (m) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt opt-ts';
      b.appendChild(window.RHNotation.timeSig(m[0], m[1]));
      b.setAttribute('aria-label', m[0] + '/' + m[1] + ' 박자');
      b.dataset.meter = m[0] + '/' + m[1];
      b.addEventListener('click', function () { setMeter(m[0], m[1]); });
      grid.appendChild(b);
    });
    $('beatsMinus').addEventListener('click', function () { setMeter(S.beats - 1, S.unit); });
    $('beatsPlus').addEventListener('click', function () { setMeter(S.beats + 1, S.unit); });
    $('unit4').addEventListener('click', function () { setMeter(S.beats, 4); });
    $('unit8').addEventListener('click', function () { setMeter(S.beats, 8); });

    const sg = $('subGrid');
    SUBDIVS.forEach(function (s) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt opt-note';
      b.appendChild(window.RHNotation.icon(s[0], S.patterns[s[0]]));
      const lb = document.createElement('span');
      lb.textContent = s[1];
      b.appendChild(lb);
      b.dataset.sub = s[0];
      b.addEventListener('click', function () {
        S.subdiv = s[0];
        engine.set({ subdiv: S.subdiv, pattern: S.subdiv === 'none' ? null : pattern() });
        renderAll();
        save();
      });
      sg.appendChild(b);
    });

    $('polyOn').addEventListener('change', function (e) {
      S.poly.on = e.target.checked;
      pushEngine(); renderAll(); save();
    });
    $('polyMinus').addEventListener('click', function () {
      S.poly.n = Math.max(2, S.poly.n - 1); pushEngine(); renderAll(); save();
    });
    $('polyPlus').addEventListener('click', function () {
      S.poly.n = Math.min(12, S.poly.n + 1); pushEngine(); renderAll(); save();
    });
  }

  function setPattern(p) {
    S.patterns[S.subdiv] = p.slice();
    engine.set({ pattern: p.slice() });
    renderAll();
    save();
  }
  function renderPattern() {
    const wrap = $('patternWrap');
    wrap.hidden = S.subdiv === 'none';
    if (wrap.hidden) return;
    const cur = pattern();
    const pr = $('patPresets');
    pr.innerHTML = '';
    (PRESETS[S.subdiv] || []).forEach(function (x) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt opt-note pat';
      b.appendChild(window.RHNotation.icon(S.subdiv, x[0]));
      const lb = document.createElement('span');
      lb.textContent = x[1];
      b.appendChild(lb);
      b.setAttribute('aria-pressed', String(x[0].join('') === cur.join('')));
      b.addEventListener('click', function () { setPattern(x[0]); });
      pr.appendChild(b);
    });
    const ed = $('patEdit');
    ed.innerHTML = '';
    const flags = S.subdiv === 'eighth' || S.subdiv === 'triplet' ? 1 : 2;
    const say = SLOT_SAY[cur.length] || [];
    cur.forEach(function (on, k) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'slot' + (on ? '' : ' rest') + (k === 0 ? ' first' : '');
      b.setAttribute('aria-pressed', String(!!on));
      b.setAttribute('aria-label', (k === 0 ? '박 자리' : (k + 1) + '번째 자리') + ', ' + (on ? '소리' : '쉼표'));
      b.appendChild(window.RHNotation.slot(on, flags));
      const lb = document.createElement('span');
      lb.textContent = say[k] || String(k + 1);
      b.appendChild(lb);
      b.addEventListener('click', function () {
        const p = pattern();
        p[k] = p[k] ? 0 : 1;
        setPattern(p);
        const again = $('patEdit').children[k];
        if (again) again.focus();
      });
      ed.appendChild(b);
    });
  }

  function renderMeterSheet() {
    const key = S.beats + '/' + S.unit;
    $('meterGrid').querySelectorAll('.opt').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.meter === key));
    });
    $('beatsVal').textContent = S.beats;
    $('unit4').setAttribute('aria-pressed', String(S.unit === 4));
    $('unit8').setAttribute('aria-pressed', String(S.unit === 8));

    const opts = S.unit === 8 ? groupOptions(S.beats) : [];
    const wrap = $('groupWrap');
    wrap.hidden = opts.length < 2;
    const go = $('groupOpts');
    go.innerHTML = '';
    opts.forEach(function (g) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt';
      b.textContent = g.join('+');
      b.setAttribute('aria-pressed', String(!!S.grouping && S.grouping.join('+') === g.join('+')));
      b.addEventListener('click', function () {
        S.grouping = g.slice();
        S.accents = accentsFor(S.beats, S.grouping);
        pushEngine(); renderAll(); save();
      });
      go.appendChild(b);
    });

    $('subGrid').querySelectorAll('.opt').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.sub === S.subdiv));
      const s0 = b.dataset.sub;
      const ic = b.querySelector('.note-icon');
      if (ic) b.replaceChild(window.RHNotation.icon(s0, S.patterns[s0]), ic);
    });
    renderPattern();
    const sd = SUBDIVS.find(function (x) { return x[0] === S.subdiv; }) || SUBDIVS[0];
    $('sumMeter').textContent = S.beats + '/' + S.unit + (S.grouping ? ' · ' + S.grouping.join('+') : '');
    $('sumSub').textContent = sd[2];
    $('polySum').textContent = S.poly.on ? S.poly.n + ' : ' + S.beats : '꺼짐';
    $('customMeter').open = $('customMeter').open || !METERS.some(function (m) { return m[0] === S.beats && m[1] === S.unit; });
    $('polyOn').checked = S.poly.on;
    $('polyVal').textContent = S.poly.n;
    $('polyHint').textContent = '한 마디에 ' + S.poly.n + '번 · ' + S.poly.n + ' : ' + S.beats + (S.poly.on ? '' : ' (꺼짐)');
  }

  /* ---------- 소리 시트 (F4) ---------- */
  /* ---------- 소리: 박 소리 · 분할 소리 (· 폴리 소리) ----------
     카드를 고르고 → 음색 타일을 누르면 바로 들림.
     첫 박은 기본으로 "같은 소리 + 4반음 높게"를 자동으로 따라감. */
  let card = 'beat';      // 지금 고치는 카드
  let editAccent = false; // 박 카드에서 '첫 박'을 따로 고치는 중인지
  const ACCENT_UP = 4;
  const HZ_MIN = 40, HZ_MAX = 8000;
  const hzToRange = function (hz) { return Math.round(1000 * Math.log(hz / HZ_MIN) / Math.log(HZ_MAX / HZ_MIN)); };
  const rangeToHz = function (v) { return Math.round(HZ_MIN * Math.pow(HZ_MAX / HZ_MIN, v / 1000)); };
  const NOTE_NAMES = ['도', '도#', '레', '레#', '미', '파', '파#', '솔', '솔#', '라', '라#', '시'];
  function hzNote(hz) {
    const m = 69 + 12 * Math.log2(hz / 440);
    const r = Math.round(m);
    const cents = Math.round((m - r) * 100);
    return NOTE_NAMES[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1) + (cents ? (cents > 0 ? ' +' : ' ') + cents + '센트' : '');
  }
  function roleNow() {
    if (card === 'beat') return S.accentLink || !editAccent ? 'beat' : 'accent';
    return card;
  }
  function voice() { return S.voices[roleNow()]; }
  function syncAccent() {
    if (!S.accentLink) return;
    const b = S.voices.beat, a = S.voices.accent;
    a.sound = b.sound;
    a.wave = b.wave;
    a.pitch = Math.min(12, Math.round((b.pitch + ACCENT_UP) * 10) / 10);
    a.hz = Math.min(HZ_MAX, Math.round(b.hz * Math.pow(2, ACCENT_UP / 12)));
  }
  function voiceChanged(preview) {
    syncAccent();
    engine.set({ voices: JSON.parse(JSON.stringify(S.voices)) });
    renderSoundSheet();
    renderChips();
    save();
    if (preview) previewSoon();
  }
  let previewTimer = null;
  function previewSoon() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(async function () {
      try {
        await engine.init();
        if (engine.playing) return;
        if (card === 'beat' && (S.accentLink || !editAccent)) engine.preview(); // 첫 박 + 박 두 번
        else engine.previewRole(roleNow());
      } catch (e) { /* 무시 */ }
    }, 100);
  }
  const VOL_KEY = { beat: 'beatVol', sub: 'subVol', poly: 'polyVol' };

  function buildSoundSheet() {
    const box = $('soundOpts');
    let group = '';
    window.RHSounds.LIST.forEach(function (s) {
      if (s[2] !== group) {
        group = s[2];
        const h = document.createElement('span');
        h.className = 'sound-group';
        h.textContent = group;
        box.appendChild(h);
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'snd';
      b.setAttribute('role', 'radio');
      b.dataset.sound = s[0];
      b.innerHTML = window.RHSounds.icon(s[0]);
      const nm = document.createElement('span'); nm.className = 'snd-name'; nm.textContent = s[1];
      const ds = document.createElement('span'); ds.className = 'snd-desc'; ds.textContent = s[3];
      b.appendChild(nm); b.appendChild(ds);
      b.addEventListener('click', function () {
        voice().sound = s[0];
        voiceChanged(true);
      });
      box.appendChild(b);
    });

    document.querySelectorAll('[data-card]').forEach(function (t) {
      t.addEventListener('click', function () { card = t.dataset.card; editAccent = false; renderSoundSheet(); previewSoon(); });
    });
    $('accentLink').addEventListener('change', function (e) {
      S.accentLink = e.target.checked;
      editAccent = false;
      voiceChanged(true);
    });
    document.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { editAccent = b.dataset.edit === 'accent'; renderSoundSheet(); previewSoon(); });
    });

    const setPitch = function (v) {
      voice().pitch = Math.round(Math.min(12, Math.max(-12, v)) * 10) / 10;
      voiceChanged(true);
    };
    $('pitch').addEventListener('input', function (e) { setPitch(Number(e.target.value)); });
    $('pitchDown').addEventListener('click', function () { setPitch(voice().pitch - 0.1); });
    $('pitchUp').addEventListener('click', function () { setPitch(voice().pitch + 0.1); });

    const setHz = function (v) {
      v = Math.round(Number(v));
      if (!isFinite(v)) return;
      voice().hz = Math.min(HZ_MAX, Math.max(HZ_MIN, v));
      voiceChanged(true);
    };
    $('hzRange').addEventListener('input', function (e) { setHz(rangeToHz(Number(e.target.value))); });
    $('hz').addEventListener('change', function (e) { setHz(e.target.value); });
    $('hzDown').addEventListener('click', function () { setHz(voice().hz - 1); });
    $('hzUp').addEventListener('click', function () { setHz(voice().hz + 1); });
    [[440, '라 440'], [880, '880'], [1000, '1000'], [1760, '1760']].forEach(function (p) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt small';
      b.textContent = p[1];
      b.addEventListener('click', function () { setHz(p[0]); });
      $('hzPresets').appendChild(b);
    });
    document.querySelectorAll('[data-wave]').forEach(function (b) {
      b.addEventListener('click', function () { voice().wave = b.dataset.wave; voiceChanged(true); });
    });

    $('vol').addEventListener('input', function (e) {
      S[VOL_KEY[card]] = Number(e.target.value) / 100;
      $('volVal').textContent = e.target.value + '%';
      engine.set({ beatVol: S.beatVol, subVol: S.subVol, polyVol: S.polyVol });
      save();
    });
    $('vol').addEventListener('change', previewSoon);
  }

  function renderSkins() {
    const box = $('skinGrid');
    if (!box) return;
    const dark = resolvedMode() === 'dark';
    box.innerHTML = '';
    SKINS.forEach(function (k) {
      const c = dark ? k[5] : k[4];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'skin';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(S.skin === k[0]));
      b.tabIndex = S.skin === k[0] ? 0 : -1;
      // 작은 미리보기: 배경 · 다이얼 링(주색) · 지금 박(강조색) · 버튼
      b.innerHTML = '<svg class="skin-mini" viewBox="0 0 120 72" aria-hidden="true">' +
        '<rect x="0.5" y="0.5" width="119" height="71" rx="10" fill="' + c[0] + '" stroke="' + c[5] + '"/>' +
        '<circle cx="38" cy="32" r="17" fill="none" stroke="' + c[5] + '" stroke-width="4"/>' +
        '<path d="M 38 15 A 17 17 0 1 1 22.5 39" fill="none" stroke="' + c[2] + '" stroke-width="4" stroke-linecap="round"/>' +
        '<text x="38" y="37" text-anchor="middle" font-size="13" font-weight="700" fill="' + c[4] + '" font-family="Space Grotesk, sans-serif">96</text>' +
        '<circle cx="70" cy="22" r="4" fill="' + c[2] + '"/><circle cx="82" cy="22" r="4" fill="' + c[3] + '"/><circle cx="94" cy="22" r="4" fill="' + c[5] + '"/><circle cx="106" cy="22" r="4" fill="' + c[5] + '"/>' +
        '<rect x="66" y="36" width="44" height="12" rx="6" fill="' + c[1] + '" stroke="' + c[5] + '"/>' +
        '<circle cx="88" cy="60" r="7" fill="' + c[3] + '"/><rect x="85.5" y="57.5" width="5" height="5" rx="1" fill="' + (dark ? c[0] : '#FFFFFF') + '"/>' +
        '</svg>';
      const nm = document.createElement('span');
      nm.className = 'skin-name';
      nm.textContent = k[1];
      if (k[3]) {
        const pro = document.createElement('span');
        pro.className = 'pro-tag';
        pro.textContent = 'PRO';
        nm.appendChild(pro);
      }
      const ds = document.createElement('span');
      ds.className = 'skin-desc';
      ds.textContent = k[2];
      b.appendChild(nm);
      b.appendChild(ds);
      b.setAttribute('aria-label', k[1] + ' 테마, ' + k[2] + (k[3] ? ', 프로' : ''));
      b.addEventListener('click', function () {
        if (k[3] && !PRO_OPEN) { toast('프로 테마예요'); return; }
        S.skin = k[0];
        applyTheme();
        renderSkins();
        save();
        const again = box.querySelector('[aria-checked="true"]');
        if (again) again.focus();
      });
      box.appendChild(b);
    });
    document.querySelectorAll('[data-appearance]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.appearance === S.appearance));
    });
    $('proNote').hidden = !PRO_OPEN;
  }

  function buildScreenSheet() {
    document.querySelectorAll('[data-appearance]').forEach(function (b) {
      b.addEventListener('click', function () { S.appearance = b.dataset.appearance; applyTheme(); renderSkins(); save(); });
    });
    document.querySelectorAll('[data-flash]').forEach(function (b) {
      b.addEventListener('click', function () { S.flash = b.dataset.flash; renderScreenSheet(); save(); });
    });
    buildViewGrid();
    const canVibrate = !!PLUG.Haptics || typeof navigator.vibrate === 'function';
    $('vibrate').disabled = !canVibrate;
    if (!canVibrate) $('vibrateNote').textContent = '이 기기의 브라우저는 지원하지 않아요 · 앱 버전에서 지원';
    $('vibrate').addEventListener('change', function (e) { S.vibrate = e.target.checked; save(); });
    $('wake').addEventListener('change', function (e) {
      S.wake = e.target.checked;
      if (!S.wake) releaseWake(); else if (engine.playing) requestWake();
      save();
    });
    $('offset').addEventListener('input', function (e) {
      S.offset = Number(e.target.value);
      $('offsetVal').textContent = (S.offset > 0 ? '+' : '') + S.offset + 'ms';
      save();
    });
  }
  function renderScreenSheet() {
    renderSkins();
    document.querySelectorAll('[data-flash]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.flash === S.flash));
    });
    renderViewGrid();
    $('vibrate').checked = S.vibrate && !$('vibrate').disabled;
    $('wake').checked = S.wake;
    $('offset').value = S.offset;
    $('offsetVal').textContent = (S.offset > 0 ? '+' : '') + S.offset + 'ms';
  }

  function voiceLabel(v) { return v.sound === 'freq' ? v.hz + 'Hz' : soundName(v.sound); }
  function renderSoundSheet() {
    if (card === 'poly' && !S.poly.on) card = 'beat';
    // 카드: 아이콘 + 지금 소리 이름
    document.querySelectorAll('[data-card]').forEach(function (t) {
      const c = t.dataset.card;
      if (c === 'poly') t.hidden = !S.poly.on;
      const on = c === card;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const v = S.voices[c];
      t.querySelector('.vc-ic').innerHTML = window.RHSounds.icon(v.sound);
      t.querySelector('.vc-v').textContent = voiceLabel(v);
      let more = t.querySelector('.vc-more');
      if (!more) { more = document.createElement('span'); more.className = 'vc-more'; t.querySelector('.vc-text').appendChild(more); }
      more.textContent = c === 'beat' && !S.accentLink ? '첫 박 · ' + voiceLabel(S.voices.accent)
        : c === 'sub' && S.subdiv === 'none' ? '분할 꺼짐' : '';
      more.hidden = !more.textContent;
    });
    $('voicePanel').setAttribute('aria-label', card === 'beat' ? '박 소리' : card === 'sub' ? '분할 소리' : '폴리 소리');
    $('accentRow').hidden = card !== 'beat';
    $('accentLink').checked = !!S.accentLink;
    $('accentEdit').hidden = !!S.accentLink;
    document.querySelectorAll('[data-edit]').forEach(function (b) {
      b.setAttribute('aria-pressed', String((b.dataset.edit === 'accent') === editAccent));
    });
    $('subOff').hidden = !(card === 'sub' && S.subdiv === 'none');

    const v = voice();
    $('soundOpts').querySelectorAll('.snd').forEach(function (b) {
      const on = b.dataset.sound === v.sound;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    const isFreq = v.sound === 'freq';
    $('pitchBox').hidden = isFreq;
    $('freqBox').hidden = !isFreq;
    $('pitch').value = v.pitch;
    $('pitchVal').textContent = (v.pitch > 0 ? '+' : '') + v.pitch.toFixed(1) + ' 반음';
    if (document.activeElement !== $('hz')) $('hz').value = v.hz;
    $('hzRange').value = hzToRange(v.hz);
    $('hzRange').setAttribute('aria-valuetext', v.hz + 'Hz, ' + hzNote(v.hz));
    $('hz').setAttribute('aria-describedby', 'hzNote');
    let note = $('hzNote');
    if (!note) {
      note = document.createElement('span');
      note.id = 'hzNote';
      note.className = 'hz-note';
      $('freqBox').querySelector('.tune-head').appendChild(note);
    }
    note.textContent = hzNote(v.hz);
    document.querySelectorAll('[data-wave]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.wave === (v.wave || 'sine')));
    });
    const vv = Math.round(S[VOL_KEY[card]] * 100);
    $('vol').value = vv;
    $('volVal').textContent = vv + '%';
  }

  /* ---------- 빠르기 입력 시트 ---------- */
  function buildBpmSheet() {
    const q = $('bpmQuick');
    [60, 80, 100, 120].forEach(function (v) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt';
      b.textContent = v;
      b.addEventListener('click', function () { setBpm(v); closeSheet(); });
      q.appendChild(b);
    });
    $('bpmForm').addEventListener('submit', function (e) {
      e.preventDefault();
      const v = Number($('bpmInput').value);
      if (!isFinite(v) || v < MIN || v > MAX) {
        toast('20–400 사이 숫자를 넣어 주세요');
        $('bpmInput').focus();
        return;
      }
      setBpm(v);
      closeSheet();
    });
  }

  /* ---------- 연습 모드 · 타이머 ---------- */
  function mmss(sec) {
    sec = Math.max(0, Math.ceil(sec));
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }
  function practiceLine() {
    const pr = S.practice;
    const parts = [];
    if (engine.playing && !engine.program && engine.ctx) {
      const now = engine.ctx.currentTime;
      const info = pr.on ? engine.practiceInfo(now) : null;
      if (info) {
        if (info.reached) parts.push('목표 ' + pr.target + ' 도달');
        else parts.push('▲ ' + info.next + ' · ' + (info.bars != null ? info.bars + '마디 뒤' : mmss(info.sec)));
      }
      if (S.timer) parts.push('⏱ ' + mmss(S.timer * 60 - (now - engine.startedAt)));
    } else if (pr.on) {
      parts.push('연습 · ' + pr.every + (pr.unit === 'bar' ? '마디' : '분') + '마다 +' + pr.step);
    }
    return parts.join(' · ');
  }
  function practiceChanged() {
    pracStart = S.bpm;
    engine.set({ practice: practiceForEngine() });
    renderPracticeSheet();
    renderTempo();
    save();
  }
  function buildPracticeSheet() {
    const P = S.practice;
    $('prOn').addEventListener('change', function (e) {
      P.on = e.target.checked;
      if (P.on && P.target <= S.bpm) P.target = Math.min(MAX, Math.ceil((S.bpm + 20) / 5) * 5);
      practiceChanged();
    });
    const lim = function () { return P.unit === 'bar' ? [1, 64] : [1, 30]; };
    $('prEveryMinus').addEventListener('click', function () { P.every = Math.max(lim()[0], P.every - 1); practiceChanged(); });
    $('prEveryPlus').addEventListener('click', function () { P.every = Math.min(lim()[1], P.every + 1); practiceChanged(); });
    document.querySelectorAll('[data-prunit]').forEach(function (b) {
      b.addEventListener('click', function () {
        P.unit = b.dataset.prunit;
        P.every = P.unit === 'bar' ? (P.every < 4 ? 8 : Math.min(64, P.every)) : Math.min(30, P.every);
        practiceChanged();
      });
    });
    $('prStepMinus').addEventListener('click', function () { P.step = Math.max(1, P.step - 1); practiceChanged(); });
    $('prStepPlus').addEventListener('click', function () { P.step = Math.min(30, P.step + 1); practiceChanged(); });
    $('prTargetMinus').addEventListener('click', function () { P.target = Math.max(MIN, P.target - 5); practiceChanged(); });
    $('prTargetPlus').addEventListener('click', function () { P.target = Math.min(MAX, P.target + 5); practiceChanged(); });
    document.querySelectorAll('[data-timer]').forEach(function (b) {
      b.addEventListener('click', function () { S.timer = Number(b.dataset.timer); renderPracticeSheet(); renderTempo(); save(); });
    });
  }
  function renderPracticeSheet() {
    const P = S.practice;
    $('prOn').checked = P.on;
    $('prOnState').textContent = P.on ? '켜짐' : '꺼짐';
    $('prOnState').classList.toggle('on', P.on);
    $('prCards').classList.toggle('off', !P.on);
    $('prEvery').textContent = P.every;
    $('prStep').textContent = '+' + P.step;
    $('prTarget').textContent = P.target;
    document.querySelectorAll('[data-prunit]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.prunit === P.unit)); });
    document.querySelectorAll('[data-timer]').forEach(function (b) { b.setAttribute('aria-pressed', String(Number(b.dataset.timer) === S.timer)); });
    $('btnPractice').setAttribute('aria-pressed', String(P.on || S.timer > 0));
    $('prBadge').hidden = !(P.on || S.timer > 0);
    $('prBadge').textContent = P.on ? '연습' : mmss(S.timer * 60).replace(':00', '분');
    // 계단 그림: 시작 → 목표까지
    const plan = $('prPlan');
    plan.innerHTML = '';
    const start = S.bpm;
    const steps = P.target > start ? Math.ceil((P.target - start) / P.step) : 0;
    const txt = document.createElement('p');
    txt.className = 'pr-plan-text';
    if (!steps) {
      txt.textContent = '지금 빠르기(' + start + ')가 목표보다 같거나 빨라요. 목표를 올려 주세요.';
    } else {
      const total = steps * P.every;
      txt.textContent = start + ' → ' + P.target + ' BPM · ' + steps + '번 올림 · 목표까지 ' +
        (P.unit === 'bar' ? total + '마디' : (total >= 60 ? Math.floor(total / 60) + '시간 ' + (total % 60 ? total % 60 + '분' : '') : total + '분'));
    }
    plan.appendChild(txt);
    if (steps) {
      const NS = 'http://www.w3.org/2000/svg';
      const W = 320, H = 72, n = Math.min(steps, 40);
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.setAttribute('class', 'pr-stairs');
      svg.setAttribute('aria-hidden', 'true');
      let d = '';
      const sw = (W - 8) / (n + 1);
      for (let i = 0; i <= n; i++) {
        const v = Math.min(P.target, start + i * P.step);
        const y = H - 6 - (v - start) / Math.max(1, P.target - start) * (H - 18);
        d += (i === 0 ? 'M 4 ' : ' L ' + (4 + i * sw).toFixed(1) + ' ') + y.toFixed(1) + ' H ' + (4 + (i + 1) * sw).toFixed(1);
      }
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', 'stairs');
      svg.appendChild(path);
      plan.appendChild(svg);
    }
    $('prPlan').hidden = !P.on;
  }

  /* ---------- 연습 기록: 재생한 시간을 날짜별로 ---------- */
  const LOG_KEY = 'rhm.log.v1';
  let LOG = { days: {} };
  try { const raw = localStorage.getItem(LOG_KEY); if (raw) LOG = JSON.parse(raw) || LOG; } catch (e) { /* 무시 */ }
  if (!LOG.days) LOG.days = {};
  function dayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  let logLast = null, logTimer = null;
  function logAdd() {
    if (!engine.ctx || logLast == null) return;
    const t = engine.ctx.currentTime;
    const dt = t - logLast;
    logLast = t;
    if (!(dt > 0) || dt > 3600) return;
    const k = dayKey();
    const day = LOG.days[k] || (LOG.days[k] = { s: 0, max: 0 });
    day.s = Math.round((day.s + dt) * 10) / 10;
    const bpm = engine.program ? 0 : S.bpm;
    if (bpm > day.max) day.max = bpm;
    try { localStorage.setItem(LOG_KEY, JSON.stringify(LOG)); } catch (e) { /* 무시 */ }
    if (view === 'log') renderLog();
  }
  function logStart() {
    logLast = engine.ctx ? engine.ctx.currentTime : null;
    clearInterval(logTimer);
    logTimer = setInterval(function () { if (engine.playing) logAdd(); }, 2000);
  }
  function logStop() {
    logAdd();
    logLast = null;
    clearInterval(logTimer);
    logTimer = null;
  }

  /* ---------- 기록 화면: 숫자 타일 + 하루별 막대 / 누적 선 그래프 ---------- */
  let logMode = 'day', logRange = 14;
  function fmtDur(sec, short) {
    if (sec > 0 && sec < 60) return '1분 미만';
    const m = Math.round(sec / 60);
    if (m < 60) return m + '분';
    const h = Math.floor(m / 60), r = m % 60;
    return h + '시간' + (r && !short ? ' ' + r + '분' : '');
  }
  function buildLog() {
    document.querySelectorAll('[data-logmode]').forEach(function (b) {
      b.addEventListener('click', function () { logMode = b.dataset.logmode; renderLog(); });
    });
    document.querySelectorAll('[data-logrange]').forEach(function (b) {
      b.addEventListener('click', function () { logRange = Number(b.dataset.logrange); renderLog(); });
    });
    $('logClear').addEventListener('click', function () { $('logConfirm').hidden = false; $('logClear').hidden = true; $('logCancel').focus(); });
    $('logCancel').addEventListener('click', function () { $('logConfirm').hidden = true; $('logClear').hidden = false; $('logClear').focus(); });
    $('logDoClear').addEventListener('click', function () {
      LOG = { days: {} };
      try { localStorage.setItem(LOG_KEY, JSON.stringify(LOG)); } catch (e) { /* 무시 */ }
      $('logConfirm').hidden = true; $('logClear').hidden = false;
      renderLog();
      toast('연습 기록을 지웠어요');
    });
  }
  function renderLog() {
    const days = LOG.days;
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const back = function (i) { const d = new Date(today); d.setDate(d.getDate() - i); return d; };
    const sec = function (d) { const x = days[dayKey(d)]; return x ? x.s : 0; };
    let week = 0;
    for (let i = 0; i < 7; i++) week += sec(back(i));
    let total = 0;
    Object.keys(days).forEach(function (k) { total += days[k].s || 0; });
    let streak = 0;
    for (let i = sec(back(0)) >= 60 ? 0 : 1; i < 3650; i++) { if (sec(back(i)) >= 60) streak++; else break; }
    const tiles = [['오늘', fmtDur(sec(back(0)))], ['최근 7일', fmtDur(week)], ['전체 누적', fmtDur(total)], ['연속 연습', streak + '일']];
    const st = $('logStats');
    st.innerHTML = '';
    tiles.forEach(function (t, i) {
      const d = document.createElement('div');
      d.className = 'stat' + (i === 2 ? ' hero' : '');
      const a = document.createElement('span'); a.className = 'stat-label'; a.textContent = t[0];
      const b = document.createElement('span'); b.className = 'stat-val'; b.textContent = t[1];
      d.appendChild(a); d.appendChild(b); st.appendChild(d);
    });
    document.querySelectorAll('[data-logmode]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.logmode === logMode)); });
    document.querySelectorAll('[data-logrange]').forEach(function (b) { b.setAttribute('aria-pressed', String(Number(b.dataset.logrange) === logRange)); });

    // 그래프 자료: 기간 안의 날짜마다 분
    const N = logRange;
    const pts = [];
    let before = 0;
    Object.keys(days).forEach(function (k) { if (k < dayKey(back(N - 1))) before += days[k].s || 0; });
    let run = before;
    for (let i = N - 1; i >= 0; i--) {
      const d = back(i);
      const v = sec(d);
      run += v;
      pts.push({ d: d, min: v / 60, cum: run / 60 });
    }
    const val = function (p) { return logMode === 'day' ? p.min : p.cum; };
    const maxV = Math.max.apply(null, pts.map(val));
    const hourScale = maxV >= 120;
    const unitDiv = hourScale ? 60 : 1;
    const niceMax = (function () {
      const m = Math.max(maxV / unitDiv, hourScale ? 1 : 10);
      const step = Math.pow(10, Math.floor(Math.log10(m)));
      const n = [1, 2, 2.5, 5, 10].find(function (x) { return x * step >= m; }) * step;
      return n * unitDiv;
    })();
    $('logChartTitle').textContent = (logMode === 'day' ? '하루 연습 시간' : '누적 연습 시간') + ' (' + (hourScale ? '시간' : '분') + ')';

    const NS = 'http://www.w3.org/2000/svg';
    const W = 340, H = 190, L = 34, R = 8, T = 10, B = 26;
    const pw = W - L - R, ph = H - T - B;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('class', 'log-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', $('logChartTitle').textContent + ', 최근 ' + N + '일');
    const mk = function (name, attrs, text) {
      const e = document.createElementNS(NS, name);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      if (text != null) e.textContent = text;
      svg.appendChild(e);
      return e;
    };
    const Y = function (v) { return T + ph - (v / niceMax) * ph; };
    for (let i = 0; i <= 4; i++) {
      const v = niceMax * i / 4;
      mk('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: i === 0 ? 'axis' : 'grid' });
      const lab = v / unitDiv;
      mk('text', { x: L - 6, y: Y(v) + 4, 'text-anchor': 'end', class: 'tick' }, Number.isInteger(lab) ? lab : lab.toFixed(1));
    }
    const slot = pw / N;
    const X = function (i) { return L + slot * i + slot / 2; };
    const labelEvery = N <= 14 ? 2 : N <= 30 ? 7 : 15;
    pts.forEach(function (p, i) {
      if ((N - 1 - i) % labelEvery === 0) {
        mk('text', { x: X(i), y: H - 8, 'text-anchor': 'middle', class: 'tick' }, (p.d.getMonth() + 1) + '/' + p.d.getDate());
      }
    });
    const note = $('logNote');
    const tell = function (p) {
      note.textContent = (p.d.getMonth() + 1) + '월 ' + p.d.getDate() + '일 · ' +
        (logMode === 'day' ? fmtDur(p.min * 60) : '그날까지 누적 ' + fmtDur(p.cum * 60) + ' (그날 ' + fmtDur(p.min * 60) + ')');
    };
    let hl = null;
    if (logMode === 'day') {
      const bw = Math.max(2, Math.min(18, slot - 2));
      pts.forEach(function (p, i) {
        const h = Math.max(0, Y(0) - Y(p.min));
        if (h > 0) {
          const x = X(i) - bw / 2, y = Y(p.min), r = Math.min(4, bw / 2, h);
          // 위쪽만 둥근 막대
          mk('path', { d: 'M ' + x + ' ' + Y(0) + ' V ' + (y + r) + ' Q ' + x + ' ' + y + ' ' + (x + r) + ' ' + y + ' H ' + (x + bw - r) + ' Q ' + (x + bw) + ' ' + y + ' ' + (x + bw) + ' ' + (y + r) + ' V ' + Y(0) + ' Z', class: 'bar' + (i === N - 1 ? ' today' : ''), 'data-i': i });
        }
      });
    } else {
      let d = '', area = '';
      pts.forEach(function (p, i) {
        d += (i ? ' L ' : 'M ') + X(i).toFixed(1) + ' ' + Y(p.cum).toFixed(1);
      });
      area = d + ' L ' + X(N - 1).toFixed(1) + ' ' + Y(0) + ' L ' + X(0).toFixed(1) + ' ' + Y(0) + ' Z';
      mk('path', { d: area, class: 'area' });
      mk('path', { d: d, class: 'line' });
      const last = pts[N - 1];
      mk('circle', { cx: X(N - 1), cy: Y(last.cum), r: 4.5, class: 'dot-end' });
    }
    // 눌러서 값 보기 (막대보다 넓은 칸)
    hl = mk('line', { x1: 0, x2: 0, y1: T, y2: T + ph, class: 'cross', visibility: 'hidden' });
    pts.forEach(function (p, i) {
      const hit = mk('rect', { x: L + slot * i, y: T, width: slot, height: ph, class: 'hit', tabindex: i === N - 1 ? '0' : '-1' });
      const on = function () {
        tell(p);
        hl.setAttribute('x1', X(i)); hl.setAttribute('x2', X(i)); hl.setAttribute('visibility', 'visible');
      };
      hit.addEventListener('pointerenter', on);
      hit.addEventListener('click', on);
      hit.addEventListener('focus', on);
      hit.addEventListener('keydown', function (e) {
        const j = e.key === 'ArrowLeft' ? i - 1 : e.key === 'ArrowRight' ? i + 1 : -1;
        if (j >= 0 && j < N) { e.preventDefault(); svg.querySelectorAll('.hit')[j].focus(); }
      });
    });
    const box = $('logChart');
    box.innerHTML = '';
    box.appendChild(svg);
    tell(pts[N - 1]);
    if (!total) note.textContent = '아직 기록이 없어요. 메트로놈을 켜면 여기부터 쌓여요.';

    const rows = $('logRows');
    rows.innerHTML = '';
    Object.keys(days).sort().reverse().slice(0, 60).forEach(function (k) {
      const tr = document.createElement('tr');
      [k.slice(5).replace('-', '/'), fmtDur(days[k].s), days[k].max ? days[k].max + ' BPM' : '—'].forEach(function (c) {
        const td = document.createElement('td'); td.textContent = c; tr.appendChild(td);
      });
      rows.appendChild(tr);
    });
  }

  /* ---------- 합주 모드: 여러 기기 박 맞추기 ----------
     리더는 "공통 시계로 언제, 몇 번째 박부터, 몇 BPM"이라는 시간표(seg)를 보내고,
     모든 기기(리더 포함)는 그 시간표를 자기 오디오 시계로 바꿔서 칩니다. */
  const band = { sync: null, diff: null, diffAt: 0, pubKey: '', progCache: null, onProgEnd: null, follow: true };
  const BAND_BACKUP = 'rhm.band.backup';
  const bmod = function (a, n) { return ((a % n) + n) % n; };
  function bandRole() { return band.sync ? band.sync.role : null; }
  function newRun() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function inBand() { return !!bandRole(); }
  if (S.bandLat == null) S.bandLat = 0;
  if (!S.bandName) S.bandName = '기기-' + Math.random().toString(36).slice(2, 6).toUpperCase();

  function bandSync() {
    if (band.sync) return band.sync;
    const sy = window.RHSync.create();
    sy.ver = APP_VERSION;
    band.sync = sy;
    sy.on('role', function (role) {
      if (role === 'leader') { band.pubKey = JSON.stringify(bandSettings()); announceRoom(); }
      document.body.classList.toggle('band-member', role === 'member');
      renderBand();
    });
    sy.on('state', function (st) { if (bandRole() === 'member') applyBandState(st); renderBand(); });
    sy.on('members', renderBand);
    sy.on('meta', renderBand);
    sy.on('clock', function () {
      renderBandStatus();
      if (bandRole() === 'member' && sy.state) applyBandState(sy.state);
    });
    sy.on('closed', function (msg) { toast(msg); });
    sy.on('left', function () {
      document.body.classList.remove('band-member');
      if (engine.playing && engine.follow) { engine.stop(); releaseWake(); }
      restoreBackup();
      renderPlay();
      renderBand();
    });
    return sy;
  }

  /* 공통 시계(ms) → 이 기기 오디오 시각(초)
     v1.7.1: 아이폰(웹킷) 대응
     - 아이폰은 getOutputTimestamp가 엉터리 값(contextTime ≈ 0.001)을 줘서, 그대로 쓰면 박 시각이 몇 초씩 틀어짐
       → 리더는 소리가 안 나고, 참가자는 박이 뒤죽박죽이었던 원인. 이제 값이 말이 될 때만 씀
     - 아이폰은 currentTime이 덩어리(약 20~40ms)로 갱신돼서, 읽을 때마다 값이 들쭉날쭉
       → 최근 2초 동안 읽은 값의 "위쪽 끝"을 기준으로 삼고, 한 번 정하면 아주 천천히만 따라감 (박 간격이 흔들리지 않게) */
  function validLatency(x) { return typeof x === 'number' && isFinite(x) && x > 0 && x < 0.5 ? x : 0; }
  function audioClockSample() {
    const ctx = engine.ctx, nowMs = performance.now(), ct = ctx.currentTime;
    try {
      const ts = ctx.getOutputTimestamp && ctx.getOutputTimestamp();
      // 소리가 실제로 나가는 시각까지 알려 주는 브라우저(크롬 · 안드로이드)만 — 값이 상식적인지 확인
      if (ts && isFinite(ts.contextTime) && isFinite(ts.performanceTime) &&
          ts.contextTime > ct - 0.5 && ts.contextTime <= ct + 0.05 &&
          ts.performanceTime > nowMs - 1000 && ts.performanceTime <= nowMs + 50 && ts.contextTime > 0.05) {
        return { d: ts.contextTime - ts.performanceTime / 1000, exact: true };
      }
    } catch (e) { /* 무시 */ }
    return { d: ct - nowMs / 1000 - validLatency(ctx.outputLatency || ctx.baseLatency), exact: false };
  }
  function ctxDiff() {
    const nowMs = performance.now();
    const c = band.clk || (band.clk = { est: null, win: [], at: 0, born: nowMs });
    if (c.est != null && nowMs - c.at < 20) return c.est;
    const smp = audioClockSample();
    c.win.push({ at: nowMs, d: smp.d });
    while (c.win.length && c.win[0].at < nowMs - 2000) c.win.shift();
    // 정확한 값(크롬)은 가운데 값, 들쭉날쭉한 값(아이폰)은 위쪽 끝
    let ref;
    if (smp.exact) { const ds = c.win.map(function (x) { return x.d; }).sort(function (a, b) { return a - b; }); ref = ds[Math.floor(ds.length / 2)]; }
    else { ref = -Infinity; c.win.forEach(function (x) { if (x.d > ref) ref = x.d; }); }
    // 처음 1초(첫 박 전 준비 시간)는 바로 맞추고, 소리가 끊겼다 다시 켜진 경우(크게 틀어짐)도 바로 맞춤
    if (c.est == null || nowMs - c.born < 1000 || Math.abs(ref - c.est) > 0.08) c.est = ref;
    else {
      // 아주 천천히 따라감: 1초에 최대 2ms
      const dt = Math.max(0, Math.min(0.25, (nowMs - c.at) / 1000));
      const step = 0.002 * dt;
      c.est += Math.max(-step, Math.min(step, ref - c.est));
    }
    c.at = nowMs;
    band.diff = c.est;
    return c.est;
  }
  function toCtx(sharedMs) {
    return band.sync.toPerf(sharedMs) / 1000 + ctxDiff() - (S.bandLat || 0) / 1000;
  }

  // 곡 지도: 박마다 공통 시계 기준 시각표를 한 번만 계산
  function progTable(p) {
    if (band.progCache && band.progCache.id === p.id) return band.progCache;
    const rows = [];
    let off = 0;
    p.bars.forEach(function (bar, bi) {
      for (let q = 0; q < bar.beats; q++) {
        const bpm = bar.bpm0 + (bar.bpm1 - bar.bpm0) * (q / bar.beats);
        rows.push({ off: off, d: 60 / bpm, bpm: bpm, pulse: q, bar: bi, beats: bar.beats, levels: bar.accents, countIn: !!bar.countIn });
        off += 60000 / bpm;
      }
    });
    band.progCache = { id: p.id, rows: rows };
    return band.progCache;
  }
  function segAt(segs, k) {
    let seg = null;
    (segs || []).forEach(function (s) { if (s.k0 <= k && (!seg || s.k0 >= seg.k0)) seg = s; });
    return seg;
  }
  // 박 k를 언제 어떻게 칠지 (엔진이 계속 물어봄)
  function bandBeat(k) {
    const sy = band.sync;
    const st = sy && sy.state;
    if (!st || !st.running) return null;
    let r;
    if (st.program) {
      const tb = progTable(st.program), i = k - (st.program.k0 || 0);
      if (i < 0 || i >= tb.rows.length) return null;
      const row = tb.rows[i];
      r = { shared: st.program.t0 + row.off, pulse: row.pulse, beats: row.beats, levels: row.levels, d: row.d, bpm: row.bpm,
        subdiv: st.program.subdiv || 'none', pattern: st.program.pattern || null, countIn: row.countIn, bar: row.bar,
        barIndex: bandRole() === 'leader' ? row.bar : null, prog: true };
    } else {
      const seg = segAt(st.segs, k);
      if (!seg) return null;
      const beatMs = 60000 / seg.bpm, pulse = bmod(k - seg.k0, seg.beats);
      r = { shared: seg.t0 + (k - seg.k0) * beatMs, pulse: pulse, beats: seg.beats, levels: seg.accents, d: beatMs / 1000, bpm: seg.bpm,
        subdiv: seg.subdiv, pattern: seg.pattern || null, countIn: false, bar: Math.floor((k - seg.k0) / seg.beats), barIndex: null };
    }
    r.level = r.levels && r.levels[r.pulse] != null ? r.levels[r.pulse] : 2;
    r.t = toCtx(r.shared);
    return r;
  }
  // 이 시각(공통 시계) 뒤에 오는 첫 박 번호
  function firstBeatAfter(st, T) {
    if (st.program) {
      const tb = progTable(st.program);
      for (let i = 0; i < tb.rows.length; i++) if (st.program.t0 + tb.rows[i].off >= T) return (st.program.k0 || 0) + i;
      return (st.program.k0 || 0) + tb.rows.length;
    }
    const segs = (st.segs || []).slice().sort(function (a, b) { return a.k0 - b.k0; });
    if (!segs.length) return 0;
    let seg = segs[0];
    segs.forEach(function (s) { if (s.t0 <= T) seg = s; });
    const beatMs = 60000 / seg.bpm;
    let k = seg.k0 + Math.max(0, Math.ceil((T - seg.t0) / beatMs));
    const later = segs.find(function (s) { return s.k0 > seg.k0 && s.k0 <= k; });
    if (later) k = later.k0 + Math.max(0, Math.ceil((T - later.t0) / (60000 / later.bpm)));
    return k;
  }

  // v1.7.1: 소리가 잠겨 있으면(아이폰: 한동안 안 눌렀거나 전화가 왔다 간 뒤) 화면을 한 번 누르면 바로 따라 울림
  let bandUnlockWait = false;
  function waitTapToUnlock() {
    if (bandUnlockWait) return;
    bandUnlockWait = true;
    toast('화면을 한 번 눌러 주세요 — 소리를 켜고 합주를 따라가요');
    const go = function () {
      document.removeEventListener('pointerdown', go, true);
      document.removeEventListener('touchend', go, true);
      bandUnlockWait = false;
      engine.init().then(function () { if (engine.ctx && engine.ctx.state === 'running') startBandEngine(); });
    };
    document.addEventListener('pointerdown', go, true);
    document.addEventListener('touchend', go, true);
  }
  async function startBandEngine() {
    const sy = band.sync, st = sy && sy.state;
    if (!st || !st.running || !sy.isReady()) return;
    if (!(await ensureAudio())) return;
    if (engine.ctx && engine.ctx.state !== 'running') { waitTapToUnlock(); return; }
    band.diff = null;
    band.clk = null;
    band.curRun = st.run;
    const k = firstBeatAfter(st, sy.now() + 150);
    engine.startFollow(bandBeat, k, onBandEnd);
    if (st.program && bandRole() === 'leader') engine.program = st.program.bars;
    pend = null;
    requestWake();
    loop();
    renderPlay();
  }
  function onBandEnd() {
    releaseWake();
    renderPlay();
    const st = band.sync && band.sync.state;
    const wasProg = st && st.program;
    if (bandRole() === 'leader') {
      band.sync.publish({ running: false, settings: bandSettings(), segs: [], program: null });
      if (wasProg && band.onProgEnd) { const f = band.onProgEnd; band.onProgEnd = null; f(); }
    } else if (wasProg) toast('곡이 끝났어요');
  }

  /* 리더 */
  function bandSettings() {
    return { bpm: S.bpm, beats: S.beats, unit: S.unit, grouping: S.grouping || null, accents: S.accents.slice(),
      subdiv: S.subdiv, pattern: S.subdiv === 'none' ? null : pattern() };
  }
  async function bandStart() {
    if (!(await ensureAudio())) return;
    const set = bandSettings();
    band.pubKey = JSON.stringify(set);
    const t0 = band.sync.now() + 900; // 다른 기기가 받을 시간을 주고 시작
    band.sync.publish({ running: true, run: newRun(), settings: set, segs: [Object.assign({ k0: 0, t0: t0 }, set)], program: null });
    startBandEngine();
  }
  function bandStop() {
    band.sync.publish({ running: false, settings: bandSettings(), segs: [], program: null });
    if (engine.playing) engine.stop();
    releaseWake();
    renderPlay();
  }
  async function bandStartProgram(bars, onEnd) {
    if (!(await ensureAudio())) return false;
    band.onProgEnd = onEnd || null;
    const t0 = band.sync.now() + 900;
    const prog = { id: Date.now() + '-' + Math.random().toString(36).slice(2, 6), k0: 0, t0: t0, bars: bars,
      subdiv: S.subdiv, pattern: S.subdiv === 'none' ? null : pattern() };
    band.sync.publish({ running: true, run: newRun(), settings: bandSettings(), segs: [], program: prog });
    await startBandEngine();
    return true;
  }
  // 리더가 템포 · 박자 등을 바꾸면: 재생 중이면 다음 마디 첫 박부터 새 시간표
  let bandPubTimer = null;
  function bandChanged() {
    if (bandRole() !== 'leader') return;
    clearTimeout(bandPubTimer);
    bandPubTimer = setTimeout(function () {
      const sy = band.sync, st = sy.state || { running: false };
      const set = bandSettings(), key = JSON.stringify(set);
      if (key === band.pubKey) return;
      band.pubKey = key;
      if (!st.running || st.program) { sy.publish(Object.assign({}, st, { settings: set, running: !!st.running })); return; }
      // 같은 연주(run) 안에서 다음 마디부터 바꿈
      const segs = (st.segs || []).slice().sort(function (a, b) { return a.k0 - b.k0; });
      const T = sy.now() + 400; // 다른 기기에 닿을 여유
      let cur = segs[0];
      segs.forEach(function (s) { if (s.t0 <= T) cur = s; });
      const beatMs = 60000 / cur.bpm;
      const kAfter = cur.k0 + Math.max(0, Math.ceil((T - cur.t0) / beatMs));
      const kNext = cur.k0 + Math.ceil((kAfter - cur.k0) / cur.beats) * cur.beats;
      const tNext = cur.t0 + (kNext - cur.k0) * beatMs;
      const keep = segs.filter(function (s) { return s.k0 < kNext; }).slice(-2);
      sy.publish({ running: true, run: st.run, settings: set, segs: keep.concat([Object.assign({ k0: kNext, t0: tNext }, set)]), program: null });
    }, 60);
  }

  /* 따라가는 기기 */
  function saveBackup() {
    try {
      if (localStorage.getItem(BAND_BACKUP)) return;
      localStorage.setItem(BAND_BACKUP, JSON.stringify({ bpm: S.bpm, beats: S.beats, unit: S.unit, grouping: S.grouping, accents: S.accents, subdiv: S.subdiv, patterns: S.patterns }));
    } catch (e) { /* 무시 */ }
  }
  function restoreBackup() {
    try {
      const raw = localStorage.getItem(BAND_BACKUP);
      if (!raw) return;
      localStorage.removeItem(BAND_BACKUP);
      Object.assign(S, JSON.parse(raw));
      pushEngine();
      renderAll();
      save();
    } catch (e) { /* 무시 */ }
  }
  function applyBandState(st) {
    if (!st) return;
    const set = st.settings;
    if (set) {
      S.bpm = set.bpm; S.beats = set.beats; S.unit = set.unit; S.grouping = set.grouping || null;
      S.accents = (set.accents || []).slice(); S.subdiv = set.subdiv || 'none';
      if (set.pattern) { S.patterns = Object.assign({}, S.patterns); S.patterns[S.subdiv] = set.pattern.slice(); }
      engine.set({ beats: S.beats, accents: S.accents.slice(), subdiv: S.subdiv, pattern: set.pattern || null });
      renderAll();
    }
    if (st.running && band.follow) {
      if (!engine.playing || !engine.follow || band.curRun !== st.run) startBandEngine();
    } else if (engine.playing && engine.follow) {
      engine.stop();
      releaseWake();
      renderPlay();
    }
  }

  /* 화면 */
  function bandModeText() {
    const sy = bandSync();
    return sy.kind === 'local'
      ? '지금은 Firebase 설정 전이라 같은 기기의 다른 창끼리만 연결돼요 (시험용). 설정을 넣으면 서로 다른 휴대폰 · 태블릿끼리 연결돼요.'
      : '인터넷으로 연결돼요. 같은 Wi-Fi가 아니어도 되지만, 같은 Wi-Fi면 더 정확해요.';
  }
  function joinUrl(code) {
    // 앱 안에서는 주소가 기기 내부 주소(localhost)라서, QR은 공개 웹 주소로 만듦 → 앱이 없는 학생도 웹으로 바로 참가
    const web = !NATIVE && /^https?:$/.test(location.protocol) && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    return (web ? location.origin + location.pathname : WEB_URL) + '#join=' + code;
  }
  function renderQr(code) {
    const box = $('bandQr');
    box.innerHTML = '';
    const draw = function () {
      try {
        const qr = window.qrcode(0, 'M');
        qr.addData(joinUrl(code));
        qr.make();
        box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
      } catch (e) { box.textContent = code; }
    };
    if (window.qrcode) draw();
    else {
      const s = document.createElement('script');
      s.src = 'js/vendor/qrcode.js';
      s.onload = draw;
      s.onerror = function () { box.textContent = code; };
      document.head.appendChild(s);
    }
  }
  function renderBandStatus() {
    const sy = band.sync;
    if (!sy || bandRole() !== 'member') return;
    const m = sy.meta, mm = sy.members || {};
    const leader = m && mm[m.leader];
    $('bandStatusTitle').textContent = m && !m.leaderOnline ? '리더 연결이 끊겼어요 · 이어받는 중…' : (leader ? leader.name + ' 님이 리더예요' : '리더와 연결됨');
    $('bandStatusSub').textContent = sy.err == null ? '시계 맞추는 중…' : '박 맞춤 ±' + sy.err + 'ms · 왕복 ' + Math.round(sy.rtt) + 'ms';
    $('bandLive').classList.toggle('ok', sy.err != null && sy.err <= 10);
  }
  function renderBand() {
    const sy = band.sync, role = bandRole();
    const badge = $('bandBadge');
    const count = sy ? Object.keys(sy.members || {}).length : 0;
    badge.hidden = !role;
    badge.textContent = role === 'leader' ? '리더 ' + count : '합주';
    $('btnBand').setAttribute('aria-pressed', String(!!role));
    if ($('sheetBand').hidden) return;
    $('bandIdle').hidden = !!role;
    $('bandLeader').hidden = role !== 'leader';
    $('bandMember').hidden = role !== 'member';
    $('bandRoom').hidden = !role;
    $('bandMode').textContent = bandModeText();
    $('bandLat').value = S.bandLat || 0;
    $('bandLatVal').textContent = (S.bandLat > 0 ? '+' : '') + (S.bandLat || 0) + 'ms';
    $('bandFollow').checked = band.follow;
    if (!role) { startBandWatch(); renderBandHome(); return; }
    stopBandWatch();
    if (role === 'member' && sy.meta && sy.meta.title) rememberRoom(sy.code, sy.meta.title, true);
    if (role === 'leader') {
      if ($('bandCodeBig').textContent !== sy.code) { $('bandCodeBig').textContent = sy.code; renderQr(sy.code); }
      $('bandFixed').checked = !!S.bandFixed && S.bandFixedCode === sy.code;
      $('bandFixed').closest('label').hidden = !/^[0-9]{4}$/.test(sy.code); // 예전 규칙일 때(6자리 코드)는 숨김
      $('bandLobbyState').textContent = bj.lobbyState === 'on' ? '같은 Wi-Fi의 기기에는 이 방이 목록에 바로 떠요'
        : bj.lobbyState === 'off' ? '지금은 같은 Wi-Fi 목록에 올리지 못했어요 · 번호나 QR로 참가해 주세요' : '';
    }
    renderBandStatus();
    const ul = $('bandMembers');
    ul.innerHTML = '';
    const mm = sy.members || {}, meta = sy.meta || {};
    const ids = Object.keys(mm).sort(function (a, b) { return (mm[a].joined || 0) - (mm[b].joined || 0); });
    const oldOnes = [];
    $('bandCount').textContent = ids.length;
    ids.forEach(function (id) {
      const m = mm[id];
      const li = document.createElement('li');
      const nm = document.createElement('span'); nm.className = 'm-name'; nm.textContent = m.name || '기기';
      if (id === meta.leader) { const t = document.createElement('span'); t.className = 'm-tag lead'; t.textContent = '리더'; nm.appendChild(t); }
      if (id === sy.bus.uid) { const t = document.createElement('span'); t.className = 'm-tag me'; t.textContent = '나'; nm.appendChild(t); }
      const ver = memberVer(m);
      const vt = document.createElement('span');
      vt.className = 'm-tag ' + (ver ? 'ver' : 'old');
      vt.textContent = ver ? ver : '옛 버전';
      if (!ver) oldOnes.push(m.name || '기기');
      nm.appendChild(vt);
      const st = document.createElement('span'); st.className = 'm-state';
      st.textContent = id === meta.leader ? '기준 시계' : (m.err == null || m.err < 0 ? '맞추는 중…' : '±' + m.err + 'ms');
      li.appendChild(nm); li.appendChild(st);
      ul.appendChild(li);
    });
    const warn = $('bandOldWarn');
    warn.hidden = !oldOnes.length;
    if (oldOnes.length) warn.textContent = '"옛 버전" 기기(' + oldOnes.join(', ') + ')는 박이 맞지 않거나 소리가 안 날 수 있어요. 그 기기에서 웹은 앱을 닫았다 다시 열고, Xcode로 설치한 앱은 다시 설치해 주세요 (버전은 설정 맨 위).';
  }
  // 참가 기기의 앱 버전 (1.8.1부터 역할 칸에 적힘). 없으면 1.8.0 이하
  function memberVer(m) {
    const r = /^[ml]([0-9]+\.[0-9]+\.[0-9]+)$/.exec((m && m.role) || '');
    return r ? r[1] : '';
  }

  /* ---------- v1.8.0: 원탭 참가 ----------
     - 최근에 들어갔던 방이 지금 열려 있으면 큰 카드 → "바로 들어가기" 한 번
     - 같은 Wi-Fi(같은 인터넷 주소)에서 열린 방도 목록에 바로 뜸
     - 처음이면 숫자 4자리 키패드(4번째 숫자에서 바로 들어감) 또는 QR 찍기 */
  const bj = { view: 'home', lobby: null, metas: {}, invite: '', unLobby: null, unRooms: [], watching: false, digits: '', busy: false, lobbyState: '', stream: null, scanT: 0 };
  if (!Array.isArray(S.bandRecent)) S.bandRecent = [];
  const DEFAULT_NAME = /^기기-[A-Z0-9]{4}$/;
  function bjHaptic(style) { try { if (PLUG.Haptics) PLUG.Haptics.impact({ style: style }); } catch (e) { /* 무시 */ } }
  function rememberRoom(code, title, onlyTitle) {
    if (!/^[0-9]{4}$/.test(code || '')) return;
    const list = S.bandRecent.slice();
    const i = list.findIndex(function (r) { return r.code === code; });
    if (onlyTitle) { if (i < 0 || list[i].title === title) return; list[i].title = String(title).slice(0, 24); }
    else { const old = i >= 0 ? list.splice(i, 1)[0] : {}; list.unshift({ code: code, title: String(title || old.title || '').slice(0, 24), at: Date.now() }); }
    S.bandRecent = list.slice(0, 3);
    save();
  }
  function startBandWatch() {
    if (bj.watching || inBand() || $('sheetBand').hidden) return;
    bj.watching = true; bj.lobby = null; bj.metas = {};
    const sy = bandSync();
    sy.watchLobby(function (list) { bj.lobby = list === null ? false : list; renderBandHome(); })
      .then(function (un) { if (bj.watching) bj.unLobby = un; else un(); }, function () { bj.lobby = false; renderBandHome(); });
    const codes = S.bandRecent.map(function (r) { return r.code; });
    if (bj.invite && codes.indexOf(bj.invite) < 0) codes.unshift(bj.invite);
    codes.forEach(function (c) {
      sy.watchRoom(c, function (m) { bj.metas[c] = m || null; renderBandHome(); })
        .then(function (un) { if (bj.watching) bj.unRooms.push(un); else un(); }, function () { /* 무시 */ });
    });
  }
  function stopBandWatch() {
    if (!bj.watching) return;
    bj.watching = false;
    try { if (bj.unLobby) bj.unLobby(); } catch (e) { /* 무시 */ }
    bj.unRooms.forEach(function (u) { try { u(); } catch (e) { /* 무시 */ } });
    bj.unLobby = null; bj.unRooms = [];
  }
  function bandCandidates() {
    const out = [], seen = {};
    const add = function (code, title, src) { if (seen[code]) return; seen[code] = 1; out.push({ code: code, title: title || '', src: src }); };
    if (bj.invite) { const m = bj.metas[bj.invite]; add(bj.invite, (m && m.title) || '', 'invite'); }
    S.bandRecent.forEach(function (r) { const m = bj.metas[r.code]; if (m && m.leaderOnline) add(r.code, m.title || r.title, 'recent'); });
    (bj.lobby || []).forEach(function (r) { add(r.code, r.title, 'net'); });
    return out;
  }
  const SRC_TEXT = { invite: '초대받은 방이에요', recent: '지난번에 들어간 방 · 지금 열려 있어요', net: '같은 Wi-Fi에서 열려 있어요' };
  function roomName(c) { return (c.title ? c.title + ' · ' : '방 ') + c.code; }
  function renderBandHome() {
    if ($('sheetBand').hidden || inBand()) return;
    $('bandHome').hidden = bj.view !== 'home';
    $('bandPad').hidden = bj.view !== 'pad';
    $('bandScan').hidden = bj.view !== 'scan';
    // 이름
    const named = !DEFAULT_NAME.test(S.bandName);
    $('bandMeText').innerHTML = '';
    if (named) { $('bandMeText').appendChild(document.createTextNode('내 이름 ')); const b = document.createElement('b'); b.id = 'bandMeName'; b.textContent = S.bandName; $('bandMeText').appendChild(b); }
    else $('bandMeText').textContent = '내 이름을 정해 두면 리더 화면에 보여요';
    $('bandMeEdit').textContent = named ? '바꾸기' : '정하기';
    $('bandMe').classList.toggle('unnamed', !named);
    // 방 목록
    const box = $('bandRooms');
    const cands = bandCandidates();
    const key = JSON.stringify(cands) + bj.busy;
    if (box.getAttribute('data-k') !== key) {
      box.setAttribute('data-k', key);
      box.innerHTML = '';
      cands.slice(0, 5).forEach(function (c, i) {
        if (i === 0) {
          const card = document.createElement('div'); card.className = 'bj-card'; card.setAttribute('data-src', c.src);
          const top = document.createElement('div'); top.className = 'bj-card-t';
          top.innerHTML = '<span class="bj-av" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="8" r="3.2"/><circle cx="16.5" cy="9" r="2.6"/><path d="M2.5 19c.6-3.2 2.9-5 5.5-5s4.9 1.8 5.5 5M14 14.3c2.9-.6 6.4.6 7.4 4.7"/></svg></span>';
          const tx = document.createElement('div'); tx.className = 'bj-card-x';
          const nm = document.createElement('div'); nm.className = 'bj-card-n'; nm.textContent = roomName(c);
          const sb = document.createElement('div'); sb.className = 'bj-card-s';
          if (c.src !== 'invite') { const d = document.createElement('span'); d.className = 'bj-live'; sb.appendChild(d); }
          sb.appendChild(document.createTextNode(SRC_TEXT[c.src]));
          tx.appendChild(nm); tx.appendChild(sb); top.appendChild(tx); card.appendChild(top);
          const go = document.createElement('button'); go.type = 'button'; go.className = 'bj-go'; go.setAttribute('data-join', c.code);
          go.textContent = bj.busy ? '들어가는 중…' : '바로 들어가기'; go.disabled = bj.busy;
          card.appendChild(go);
          box.appendChild(card);
        } else {
          const row = document.createElement('button'); row.type = 'button'; row.className = 'bj-row'; row.setAttribute('data-join', c.code); row.disabled = bj.busy;
          const t = document.createElement('span'); t.className = 'bj-row-x';
          const n = document.createElement('b'); n.textContent = roomName(c);
          const s2 = document.createElement('small'); s2.textContent = SRC_TEXT[c.src];
          t.appendChild(n); t.appendChild(s2);
          const g = document.createElement('span'); g.className = 'bj-row-go'; g.textContent = '들어가기';
          row.appendChild(t); row.appendChild(g);
          box.appendChild(row);
        }
      });
    }
    let net = '';
    if (!cands.length) {
      if (bj.lobby === null) net = '같은 Wi-Fi에서 열린 방을 찾는 중…';
      else if (bj.lobby === false) net = '';
      else net = '같은 Wi-Fi에서 열린 방이 아직 없어요 · 리더가 방을 열면 여기에 바로 떠요';
    }
    $('bandNet').textContent = net;
    $('bandNet').hidden = !net;
    // 키패드
    const ds = $('bandDigits').children;
    for (let i = 0; i < 4; i++) { ds[i].textContent = bj.digits[i] || ''; ds[i].classList.toggle('cur', i === bj.digits.length && !bj.busy); }
    $('bandDigits').setAttribute('aria-label', '넣은 번호 ' + (bj.digits || '없음'));
  }
  function setBandView(v) {
    if (bj.view === 'scan' && v !== 'scan') stopScan();
    bj.view = v;
    if (v === 'pad') { bj.digits = ''; $('bandPadHint').textContent = '4자리를 다 누르면 바로 들어가요'; $('bandDigits').classList.remove('bad'); }
    renderBandHome();
  }
  async function joinCode(code, from) {
    if (bj.busy || inBand()) return false;
    bj.busy = true; renderBandHome();
    let ok = false;
    try {
      if (engine.playing) { engine.stop(); renderPlay(); }
      await ensureAudio(); // 누른 순간 소리를 깨워 둠 (아이폰)
      saveBackup();
      const c = await bandSync().join(code, S.bandName);
      const cand = bandCandidates().find(function (x) { return x.code === c; });
      rememberRoom(c, (band.sync.meta && band.sync.meta.title) || (cand && cand.title) || '');
      bj.invite = ''; bj.view = 'home';
      toast('합주에 참가했어요 · 리더가 시작하면 같이 울려요');
      ok = true;
    } catch (e) {
      restoreBackup();
      const none = e && e.message === 'no-room';
      if (from !== 'pad') toast(none ? '그 번호의 합주 방이 없어요' : '참가할 수 없어요 · 인터넷 연결을 확인해 주세요');
      if (from === 'pad') {
        $('bandPadHint').textContent = none ? '그 번호의 방이 없어요 · 다시 눌러 주세요' : '연결이 안 돼요 · 인터넷을 확인해 주세요';
        const d = $('bandDigits'); d.classList.remove('bad'); void d.offsetWidth; d.classList.add('bad');
        bj.digits = '';
      }
    }
    bj.busy = false;
    renderBand();
    return ok;
  }
  function padKey(k) {
    if (bj.busy || bj.view !== 'pad') return;
    if (k === 'del') bj.digits = bj.digits.slice(0, -1);
    else if (/^[0-9]$/.test(k) && bj.digits.length < 4) bj.digits += k;
    if (k !== 'del') $('bandDigits').classList.remove('bad');
    renderBandHome();
    if (bj.digits.length === 4) { $('bandPadHint').textContent = '들어가는 중…'; joinCode(bj.digits, 'pad'); }
  }

  /* QR 찍기: 카메라 → (BarcodeDetector가 있으면 그것, 없으면 jsQR) → #join=번호 */
  function codeFromText(t) {
    t = String(t || '').trim();
    const m = /#join=([A-Za-z0-9]{4}|[A-Za-z0-9]{6})\b/.exec(t) || /^([0-9]{4})$/.exec(t);
    return m ? window.RHSync.normCode(m[1]) : '';
  }
  function loadJsQR() {
    if (window.jsQR) return Promise.resolve(window.jsQR);
    return new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = 'js/vendor/jsQR.js';
      s.onload = function () { window.jsQR ? resolve(window.jsQR) : reject(new Error('jsqr')); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  function stopScan() {
    clearTimeout(bj.scanT); bj.scanT = 0;
    if (bj.stream) { bj.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) { /* 무시 */ } }); bj.stream = null; }
    const v = $('bandVideo'); try { v.pause(); } catch (e) { /* 무시 */ } v.srcObject = null;
  }
  async function startScan() {
    setBandView('scan');
    $('bandScanLab').textContent = '카메라를 켜는 중…';
    const fail = function (why) {
      stopScan();
      toast(why || '카메라를 쓸 수 없어요 · 휴대폰 카메라 앱으로 QR을 찍어도 바로 들어가요');
      if (bj.view === 'scan') setBandView('home');
    };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { fail(); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }); }
    catch (e) { fail(e && e.name === 'NotAllowedError' ? '카메라 권한이 꺼져 있어요 · 휴대폰 설정에서 켜거나, 번호로 참가해 주세요' : null); return; }
    if (bj.view !== 'scan') { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
    bj.stream = stream;
    const v = $('bandVideo');
    v.srcObject = stream;
    try { await v.play(); } catch (e) { /* autoplay 속성으로 재생됨 */ }
    $('bandScanLab').textContent = '리더 화면의 QR을 네모 안에 비추세요';
    let det = null, jsqr = null;
    try { if ('BarcodeDetector' in window) det = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { det = null; }
    if (!det) { try { jsqr = await loadJsQR(); } catch (e) { fail('QR 읽기 도구를 불러오지 못했어요 · 번호로 참가해 주세요'); return; } }
    const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
    let warned = false;
    const tick = async function () {
      if (!bj.stream || bj.view !== 'scan') return;
      let text = '';
      try {
        if (v.readyState >= 2 && v.videoWidth) {
          if (det) { const r = await det.detect(v); if (r && r[0]) text = r[0].rawValue; }
          else {
            const k = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
            cv.width = Math.round(v.videoWidth * k); cv.height = Math.round(v.videoHeight * k);
            cx.drawImage(v, 0, 0, cv.width, cv.height);
            const img = cx.getImageData(0, 0, cv.width, cv.height);
            const r = jsqr(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
            if (r) text = r.data;
          }
        }
      } catch (e) { /* 다음 장면에서 다시 */ }
      if (text) {
        const code = codeFromText(text);
        if (code) { stopScan(); bjHaptic('MEDIUM'); joinCode(code, 'scan'); return; }
        if (!warned) { warned = true; toast('리듬 하우스 합주 QR이 아니에요'); }
      }
      bj.scanT = setTimeout(tick, 160);
    };
    tick();
  }

  /* 리더: 같은 Wi-Fi 목록에 올리기 · 초대 보내기 */
  function announceRoom() {
    const sy = band.sync;
    if (!sy || bandRole() !== 'leader') return;
    bj.lobbyState = '';
    sy.announce(S.bandName).then(function (ok) { bj.lobbyState = ok ? 'on' : 'off'; renderBand(); }, function () { bj.lobbyState = 'off'; renderBand(); });
  }
  function copyText(text, okMsg) {
    const fallback = function () { toast(text); };
    try { navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback); } catch (e) { fallback(); }
  }
  async function shareInvite() {
    const code = band.sync && band.sync.code; if (!code) return;
    const url = joinUrl(code);
    const text = '리듬 하우스 메트로놈 합주에 초대해요 · 방 번호 ' + code;
    const cancelled = function (e) { return e && (e.name === 'AbortError' || /cancel/i.test(String(e.message || e))); };
    if (NATIVE && PLUG.Share) {
      try { await PLUG.Share.share({ title: '합주 초대', text: text, url: url, dialogTitle: '합주 초대 보내기' }); return; } catch (e) { if (cancelled(e)) return; }
    } else if (navigator.share) {
      try { await navigator.share({ title: '합주 초대', text: text, url: url }); return; } catch (e) { if (cancelled(e)) return; }
    }
    copyText(text + '\n' + url, '초대 글을 복사했어요 · 카톡에 붙여 넣으세요');
  }

  function buildBand() {
    $('btnBand').addEventListener('click', function () { bandSync(); bj.view = 'home'; showSheet('sheetBand'); renderBand(); });
    // 이름
    const openName = function () { $('bandMe').hidden = true; $('bandMeForm').hidden = false; $('bandName').value = DEFAULT_NAME.test(S.bandName) ? '' : S.bandName; $('bandName').focus(); };
    const saveName = function () {
      const v = ($('bandName').value || '').trim().slice(0, 12);
      if (v) { S.bandName = v; save(); }
      $('bandMe').hidden = false; $('bandMeForm').hidden = true;
      renderBandHome();
    };
    $('bandMeEdit').addEventListener('click', openName);
    $('bandMeOk').addEventListener('click', saveName);
    $('bandName').addEventListener('keydown', function (e) { if (e.key === 'Enter') saveName(); });
    // 방 목록 · 원탭
    $('bandRooms').addEventListener('click', function (e) {
      const b = e.target.closest && e.target.closest('[data-join]');
      if (b) joinCode(b.getAttribute('data-join'), 'card');
    });
    // 키패드
    $('bandPadOpen').addEventListener('click', function () { setBandView('pad'); });
    $('bandPadBack').addEventListener('click', function () { setBandView('home'); });
    $('bandKeys').addEventListener('click', function (e) {
      const b = e.target.closest && e.target.closest('button'); if (!b) return;
      if (b.id === 'bandPadQr') { startScan(); return; }
      if (b.id === 'bandPadDel') { padKey('del'); return; }
      const k = b.getAttribute('data-k'); if (k) { bjHaptic('LIGHT'); padKey(k); }
    });
    document.addEventListener('keydown', function (e) {
      if (bj.view !== 'pad' || $('sheetBand').hidden || inBand()) return;
      if (/^[0-9]$/.test(e.key)) { padKey(e.key); e.preventDefault(); }
      else if (e.key === 'Backspace') { padKey('del'); e.preventDefault(); }
    });
    // QR
    $('bandScanOpen').addEventListener('click', startScan);
    $('bandScanBack').addEventListener('click', function () { setBandView('home'); });
    // 리더
    $('bandCreate').addEventListener('click', async function () {
      if (!PRO_OPEN) { toast('합주 방 만들기는 프로 기능이에요'); return; }
      const btn = this;
      btn.disabled = true;
      try {
        if (engine.playing) { engine.stop(); renderPlay(); }
        await ensureAudio();
        const want = S.bandFixed && /^[0-9]{4}$/.test(S.bandFixedCode || '') ? S.bandFixedCode : '';
        const code = await bandSync().create(S.bandName, { want: want, title: S.bandName });
        band.sync.publish({ running: false, settings: bandSettings(), segs: [], program: null });
        if (S.bandFixed && /^[0-9]{4}$/.test(code)) {
          if (want && code !== want) toast(want + '번은 다른 방이 쓰고 있어서 ' + code + '번으로 열었어요');
          else toast(code + '번 방을 열었어요 · 지난번과 같은 번호예요');
          S.bandFixedCode = code; save();
        } else toast(code + '번 방을 열었어요 · 번호나 QR로 참가해요');
      } catch (e) {
        console.error(e);
        toast('방을 만들 수 없어요 · 인터넷 연결과 Firebase 설정을 확인해 주세요');
      }
      btn.disabled = false;
      renderBand();
    });
    $('bandShare').addEventListener('click', shareInvite);
    $('bandCopy').addEventListener('click', function () { copyText(joinUrl(band.sync.code), '참가 링크를 복사했어요'); });
    $('bandFixed').addEventListener('change', function (e) {
      S.bandFixed = e.target.checked;
      if (S.bandFixed && band.sync && band.sync.code) { S.bandFixedCode = band.sync.code; toast('다음에도 ' + band.sync.code + '번으로 열어요'); }
      save();
    });
    $('bandFollow').addEventListener('change', function (e) {
      band.follow = e.target.checked;
      if (band.follow) { if (band.sync.state && band.sync.state.running) startBandEngine(); }
      else if (engine.playing) { engine.stop(); releaseWake(); renderPlay(); }
    });
    $('bandLat').addEventListener('input', function (e) {
      S.bandLat = Number(e.target.value);
      $('bandLatVal').textContent = (S.bandLat > 0 ? '+' : '') + S.bandLat + 'ms';
      save();
    });
    $('bandLeave').addEventListener('click', async function () {
      const wasLeader = bandRole() === 'leader';
      if (engine.playing && engine.follow) { engine.stop(); releaseWake(); }
      bj.lobbyState = '';
      await band.sync.leave();
      toast(wasLeader ? '합주를 나왔어요' : '합주에서 나왔어요');
      bj.view = 'home';
      renderPlay();
      renderBand();
    });
    // 따라가는 기기: 템포 · 박자 조작은 리더가 해요
    const lockIds = ['dial', 'bpmBtn', 'sNumBtn', 'minus', 'plus', 'tap', 'chipMeter', 'chipSub', 'beats'];
    ['pointerdown', 'click', 'keydown', 'wheel'].forEach(function (evName) {
      document.addEventListener(evName, function (e) {
        if (bandRole() !== 'member') return;
        if (evName === 'keydown' && !(e.target && e.target.closest && e.target.closest('#dial'))) return;
        const t = e.target && e.target.closest && e.target.closest(lockIds.map(function (x) { return '#' + x; }).join(','));
        if (!t) return;
        e.preventDefault();
        e.stopPropagation();
        if (evName === 'click' || evName === 'keydown') toast('합주 중에는 리더가 템포 · 박자를 정해요');
      }, true);
    });
    // 초대 링크 · QR로 들어온 경우: #join=번호 → 그 방이 큰 카드로 떠서 "바로 들어가기" 한 번
    // (누르는 순간 소리를 깨워야 아이폰에서 바로 울려서, 저절로 들어가지는 않음)
    const checkJoin = function () {
      const m = /^#join=([A-Za-z0-9]{4}|[A-Za-z0-9]{6})$/.exec(location.hash || '');
      if (!m) return;
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* 무시 */ }
      setTimeout(function () {
        bandSync();
        if (bandRole()) { toast('이미 합주 중이에요'); return; }
        stopBandWatch();
        bj.invite = window.RHSync.normCode(m[1]);
        bj.view = 'home';
        showSheet('sheetBand');
        renderBand();
        toast('"바로 들어가기"를 누르면 합주에 들어가요');
      }, 300);
    };
    checkJoin();
    window.addEventListener('hashchange', checkJoin);
  }

  /* ---------- 시트 열고 닫기 ---------- */
  let openSheet = null, lastFocus = null;
  function showSheet(id) {
    closeSheet(true);
    lastFocus = document.activeElement;
    if (id === 'sheetMeter') renderMeterSheet();
    if (id === 'sheetSound') renderSoundSheet();
    if (id === 'sheetScreen') renderScreenSheet();
    if (id === 'sheetPractice') renderPracticeSheet();
    if (id === 'sheetBpm') $('bpmInput').value = S.bpm;
    const el = $(id);
    el.hidden = false;
    $('backdrop').hidden = false;
    openSheet = el;
    requestAnimationFrame(function () { el.classList.add('open'); });
    const f = id === 'sheetBpm' ? $('bpmInput') : el.querySelector('[data-close]');
    if (f) f.focus({ preventScroll: true });
    if (id === 'sheetBpm') $('bpmInput').select();
  }
  function closeSheet(silent) {
    if (!openSheet) return;
    if (openSheet.id === 'sheetBand') { stopScan(); stopBandWatch(); bj.view = 'home'; }
    openSheet.classList.remove('open');
    openSheet.hidden = true;
    $('backdrop').hidden = true;
    openSheet = null;
    if (!silent && lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  document.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { closeSheet(); }); });
  $('backdrop').addEventListener('click', function () { closeSheet(); });

  $('chipMeter').addEventListener('click', function () { showSheet('sheetMeter'); });
  $('chipSub').addEventListener('click', function () {
    showSheet('sheetMeter');
    const sub = $('subGrid');
    if (sub && sub.scrollIntoView) sub.scrollIntoView({ block: 'center' });
  });
  $('chipSound').addEventListener('click', function () { showSheet('sheetSound'); });
  $('btnSound').addEventListener('click', function () { showSheet('sheetSound'); });
  $('btnPractice').addEventListener('click', function () { showSheet('sheetPractice'); });
  $('tabSettings').addEventListener('click', function () { showSheet('sheetScreen'); });
  // v1.6.2: 숫자를 위아래 · 좌우로 밀면 1씩 섬세하게 (위 · 오른쪽 = 빠르게). 그냥 누르면 직접 입력
  const SCRUB_PX = 7;
  let scrubClick = false;
  function makeScrub(btn, host) {
    let scrub = null;
    const tick = function () { try { if (PLUG.Haptics && PLUG.Haptics.selectionChanged) PLUG.Haptics.selectionChanged(); } catch (e) { /* 무시 */ } };
    btn.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      scrub = { x: e.clientX, y: e.clientY, on: false };
    });
    btn.addEventListener('pointermove', function (e) {
      if (!scrub) return;
      if (!scrub.on) {
        const dx = e.clientX - scrub.x, dy = e.clientY - scrub.y;
        if (dx * dx + dy * dy < 64) return; // 8px 넘게 움직여야 "밀기"
        scrub.on = true; scrub.x0 = e.clientX; scrub.y0 = e.clientY; scrub.base = S.bpm;
        try { btn.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
        host.classList.add('scrub');
        try { if (PLUG.Haptics && PLUG.Haptics.selectionStart) PLUG.Haptics.selectionStart(); } catch (err) { /* 무시 */ }
      }
      e.preventDefault();
      const raw = scrub.base + Math.round(((e.clientX - scrub.x0) - (e.clientY - scrub.y0)) / SCRUB_PX);
      if (raw < MIN || raw > MAX) {
        // 끝에서 멈추고, 지금 손가락 자리를 새 기준으로 → 반대로 밀면 바로 움직임
        const edge = raw < MIN ? MIN : MAX;
        scrub.base = edge; scrub.x0 = e.clientX; scrub.y0 = e.clientY;
        if (S.bpm !== edge) setBpm(edge);
        hitLimit();
        return;
      }
      if (raw !== S.bpm) { setBpm(raw); tick(); }
    });
    const end = function () {
      if (scrub && scrub.on) {
        scrubClick = true; // 밀기가 끝난 직후 따라오는 click은 무시
        setTimeout(function () { scrubClick = false; }, 400);
        host.classList.remove('scrub');
        try { if (PLUG.Haptics && PLUG.Haptics.selectionEnd) PLUG.Haptics.selectionEnd(); } catch (err) { /* 무시 */ }
      }
      scrub = null;
    };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { btn.addEventListener(ev, end); });
  }
  makeScrub($('bpmBtn'), $('dial'));
  makeScrub($('sNumBtn'), $('sring'));
  ['bpmBtn', 'sNumBtn'].forEach(function (id) {
    $(id).addEventListener('click', function (e) {
      if (scrubClick) { scrubClick = false; e.preventDefault(); return; }
      showSheet('sheetBpm');
    });
  });
  document.querySelectorAll('.tab.soon').forEach(function (b) {
    b.addEventListener('click', function () { toast(b.dataset.soon); });
  });

  /* ---------- 화면 바꾸기: 메트로놈 · 곡 목록 · 곡 편집 ---------- */
  let view = 'home';
  const VIEWS = { home: 'viewHome', songs: 'viewSongs', editor: 'viewEditor', log: 'viewLog' };
  function setView(name) {
    view = name;
    Object.keys(VIEWS).forEach(function (k) {
      const el = $(VIEWS[k]);
      if (el) el.hidden = k !== name;
    });
    document.querySelectorAll('.tab[data-view]').forEach(function (t) {
      const on = t.dataset.view === name || (name === 'editor' && t.dataset.view === 'songs');
      if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    if (name === 'home') { renderAll(); scheduleFit(); }
    if (name === 'log') renderLog();
  }
  document.querySelectorAll('.tab[data-view]').forEach(function (t) {
    t.addEventListener('click', function () {
      if (t.dataset.view === 'songs' && window.RH.openSongs) window.RH.openSongs();
      else setView(t.dataset.view);
    });
  });

  /* ---------- 알림 ---------- */
  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  /* ---------- 재생 ---------- */
  let wakeLock = null;
  async function requestWake() {
    if (!S.wake) return;
    if (PLUG.KeepAwake) { try { await PLUG.KeepAwake.keepAwake(); wakeLock = 'native'; } catch (e) { /* 무시 */ } return; }
    if (!('wakeLock' in navigator)) return;
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { wakeLock = null; }
  }
  function releaseWake() {
    if (PLUG.KeepAwake) { try { PLUG.KeepAwake.allowSleep(); } catch (e) { /* 무시 */ } wakeLock = null; return; }
    try { if (wakeLock) wakeLock.release(); } catch (e) { /* 무시 */ }
    wakeLock = null;
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && engine.playing) requestWake();
    // 다시 화면으로 돌아오면 멈춰 있던 소리를 깨움 (합주 시계 기준은 ctxDiff가 다시 맞춤)
    if (document.visibilityState === 'visible' && engine.ctx && engine.ctx.state !== 'running') engine.init().catch(function () {});
  });

  async function ensureAudio() {
    try {
      await engine.init();
      return true;
    } catch (e) {
      toast('이 브라우저에서는 소리를 낼 수 없어요');
      return false;
    }
  }

  async function togglePlay() {
    if (!(await ensureAudio())) return;
    if (inBand()) {
      if (bandRole() === 'leader') { if (engine.playing) bandStop(); else bandStart(); return; }
      // 따라가는 기기: 내 소리만 켜고 끄기
      band.follow = !(engine.playing && engine.follow);
      if (!band.follow) { engine.stop(); releaseWake(); renderPlay(); toast('내 기기 소리를 껐어요 · 합주는 계속돼요'); }
      else if (band.sync.state && band.sync.state.running) startBandEngine();
      else toast('리더가 시작하면 같이 울려요');
      return;
    }
    if (engine.playing) {
      engine.stop();
      releaseWake();
    } else {
      pushEngine();
      engine.start();
      timerDone = false;
      coach.taps = []; coach.calib = null;
      requestWake();
      loop();
    }
    renderPlay();
  }
  let timerDone = false;
  function checkTimer() {
    if (!S.timer || timerDone || engine.program || engine.follow || !engine.playing) return;
    if (engine.ctx.currentTime - engine.startedAt >= S.timer * 60) {
      timerDone = true;
      engine.finishBar(function () {
        releaseWake();
        renderPlay();
        toast('연습 ' + S.timer + '분이 끝났어요. 수고했어요!');
      });
    }
  }
  $('play').addEventListener('click', togglePlay);

  // 곡 지도 재생 (songs.js에서 부름)
  async function playProgram(bars, onEnd) {
    if (!(await ensureAudio())) return false;
    if (bandRole() === 'leader') return bandStartProgram(bars, onEnd);
    if (bandRole() === 'member') { toast('합주 중에는 리더의 곡 지도를 따라가요'); return false; }
    pushEngine();
    engine.startProgram(bars, function () {
      releaseWake();
      renderPlay();
      if (onEnd) onEnd();
    });
    requestWake();
    loop();
    renderPlay();
    return true;
  }
  function stopAll() {
    if (bandRole() === 'leader') { bandStop(); return; }
    if (engine.playing) engine.stop();
    releaseWake();
    renderPlay();
  }

  function renderPlay() {
    const p = engine.playing;
    if (p && !pracWasPlaying) pracStart = S.bpm;
    pracWasPlaying = p;
    if (p && logLast == null) logStart();
    if (!p && logLast != null) logStop();
    renderTempo();
    $('play').classList.toggle('playing', p);
    $('play').setAttribute('aria-label', p ? '멈춤' : '재생');
    if (!p) clearBeat();
    if (window.RH && window.RH.onPlayState) window.RH.onPlayState(p, !!engine.program);
  }

  /* ---------- 박 표시 (소리를 따라감) ---------- */
  let raf = 0, nowEl = null, lastInfo = 0, subEl = null;
  // 홈 박 점 아래 작은 표식: 지금 울리는 분할 자리
  const SUBPOS = { none: [0], eighth: [0, 1 / 2], triplet: [0, 1 / 3, 2 / 3], sixteenth: [0, 1 / 4, 2 / 4, 3 / 4], quintuplet: [0, 0.2, 0.4, 0.6, 0.8], sextuplet: [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6] };
  function drawSubMark(now) {
    if (S.subdiv === 'none' || !pend || pend.p < 0 || engine.program) { if (subEl) { subEl.classList.remove('on'); subEl = null; } return; }
    const ph = (now - pend.t) / pend.d;
    const pos = SUBPOS[S.subdiv];
    let k = 0;
    for (let i = 0; i < pos.length; i++) if (ph >= pos[i] - 0.001) k = i;
    const b = $('beats').children[pend.p];
    const m = b ? b.querySelectorAll('.subs i')[k] : null;
    if (m !== subEl) {
      if (subEl) subEl.classList.remove('on');
      if (m) m.classList.add('on');
      subEl = m;
    }
  }
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function loop() {
    cancelAnimationFrame(raf);
    pend = null;
    const rod = $('pendRod');
    rod.classList.remove('resting');
    const step = function () {
      if (!engine.playing) { clearBeat(); return; }
      const ctx = engine.ctx;
      const lat = (ctx.outputLatency || ctx.baseLatency || 0) + S.offset / 1000;
      const ev = engine.takeDue(ctx.currentTime - lat);
      if (ev) showBeat(ev);
      if (S.viewMode === 'pendulum') drawPendulum(ctx.currentTime - lat);
      else if (S.viewMode === 'score') { prepPend(); drawScore(ctx.currentTime - lat); }
      else if (isViz()) { prepPend(); drawViz(ctx.currentTime - lat); }
      drawSubMark(ctx.currentTime - lat);
      if (ctx.currentTime - lastInfo > 0.25) {
        lastInfo = ctx.currentTime;
        checkTimer();
        if (S.practice.on || S.timer) renderTempo();
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
  function showBeat(ev) {
    pendBeat(ev);
    // 연습 모드로 빠르기가 올라가면 화면 숫자도 따라감 (엔진에는 다시 보내지 않음)
    if (ev.barIndex == null && !ev.prog && !(ev.follow && bandRole() === 'leader') && ev.bpm && Math.round(ev.bpm) !== S.bpm) {
      const up = ev.bpm > S.bpm;
      S.bpm = Math.round(ev.bpm);
      renderTempo();
      save();
      if (up) {
        toast(S.practice.on && S.bpm >= S.practice.target ? '목표 ' + S.bpm + ' BPM에 닿았어요!' : '빠르기 ▲ ' + S.bpm + ' BPM');
        const d = $('dial');
        d.classList.remove('bump'); void d.offsetWidth; d.classList.add('bump');
        const fb = $('pfBpm');
        fb.classList.remove('bump'); void fb.offsetWidth; fb.classList.add('bump');
        const sr = $('sring');
        sr.classList.remove('bump'); void sr.offsetWidth; sr.classList.add('bump');
      }
    }
    if (ev.barIndex != null) {
      if (window.RH.onProgramBeat) window.RH.onProgramBeat(ev);
      flashAndVibrate(ev);
      return;
    }
    const el = $('beats').children[ev.pulse];
    if (nowEl && nowEl !== el) nowEl.classList.remove('now');
    if (el) { el.classList.add('now'); nowEl = el; }
    if (S.ui === 'simple') sringBeat(ev);
    flashAndVibrate(ev);
  }
  function flashAndVibrate(ev) {
    const doFlash = ev.level > 0 && (S.flash === 'all' || (S.flash === 'first' && ev.pulse === 0));
    if (doFlash) {
      const f = $('flash');
      const peak = ev.pulse === 0 ? (reduceMotion ? 0.18 : 0.32) : 0.14;
      if (f.animate) f.animate([{ opacity: peak }, { opacity: 0 }], { duration: 140, easing: 'ease-out' });
    }
    if (S.vibrate && ev.level > 0) {
      if (PLUG.Haptics) { try { PLUG.Haptics.impact({ style: ev.pulse === 0 ? 'HEAVY' : 'LIGHT' }); } catch (e) { /* 무시 */ } }
      else if (navigator.vibrate) { try { navigator.vibrate(ev.pulse === 0 ? 35 : 15); } catch (e) { /* 무시 */ } }
    }
  }
  /* ---------- 진자: 박마다 왼쪽 끝 · 오른쪽 끝에 닿음 ---------- */
  const SWING = 42; // 도
  let pend = null;
  function prepPend() {
    if (!pend && engine.events.length) {
      // 첫 박 전: 반대쪽 끝에서 출발
      const e0 = engine.events[0];
      pend = { t: e0.time - e0.dur, d: e0.dur, n: e0.n - 1, p: -1 };
    }
  }
  function drawPendulum(now) {
    prepPend();
    if (!pend) return;
    let ph = (now - pend.t) / pend.d;
    if (ph < 0) ph = 0;
    if (ph > 1) ph = 1;
    const sign = pend.n % 2 === 0 ? 1 : -1;
    const a = SWING * sign * Math.cos(Math.PI * ph);
    $('pendRod').style.transform = 'rotate(' + a.toFixed(2) + 'deg)';
  }
  function pendBeat(ev) {
    const pbar = !ev.follow && ev.barIndex != null && engine.program ? engine.program[ev.barIndex] : null;
    pend = { t: ev.time, d: ev.dur, n: ev.n, p: ev.pulse,
      beats: ev.beats || (pbar ? pbar.beats : S.beats), levels: ev.levels || (pbar ? pbar.accents : S.accents) };
    if (scoreObj && ev.barIndex == null) {
      if (scoreCur) scoreCur.classList.remove('cur');
      const nn = scoreObj.notes[ev.pulse];
      scoreCur = nn ? nn.el : null;
      if (scoreCur) scoreCur.classList.add('cur');
    }
    const bob = $('pendBob');
    bob.classList.remove('hit', 'strong');
    bob.classList.add('hit');
    if (ev.pulse === 0) bob.classList.add('strong');
    clearTimeout(pendBeat.t);
    pendBeat.t = setTimeout(function () { bob.classList.remove('hit', 'strong'); }, 110);
  }
  function restPendulum() {
    pend = null;
    if (isViz()) setTimeout(function () { drawViz(); }, 0);
    const rod = $('pendRod');
    rod.classList.add('resting');
    rod.style.transform = 'rotate(0deg)';
    if (scoreObj) {
      if (scoreCur) scoreCur.classList.remove('cur');
      scoreCur = null;
      const x = scoreObj.X(0, 0);
      scoreObj.cursor.setAttribute('x1', x);
      scoreObj.cursor.setAttribute('x2', x);
      scoreObj.cursor.classList.add('idle');
    }
  }

  /* ---------- 박 보기 목록: 기본 3 + 프로 6 ---------- */
  const VIEW_LIST = [
    ['pendulum', '진자', '박마다 좌우로', false],
    ['score', '악보', '종이 위 한 마디', false],
    ['dots', '점만', '가장 단순하게', false]
  ].concat(window.RHViz.MODES);
  const VIZ_MODES = window.RHViz.MODES.map(function (m) { return m[0]; });
  const VIEW_ICON = {
    pendulum: '<path d="M12 21 L12 5"/><path d="M12 21 L17 7" opacity=".35"/><circle cx="12" cy="8" r="2.6"/><path d="M5 9 A9 9 0 0 1 19 9"/>',
    score: '<path d="M3 8 H21 M3 12 H21 M3 16 H21"/><circle cx="8" cy="16" r="1.8" fill="currentColor"/><path d="M9.6 16 V6"/><circle cx="15" cy="12" r="1.8" fill="currentColor"/><path d="M16.6 12 V4"/>',
    dots: '<circle cx="5" cy="12" r="2.4" fill="currentColor"/><circle cx="10" cy="12" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="20" cy="12" r="2"/>',
    highway: '<path d="M3 12 H21"/><path d="M6 6 V18" stroke-width="2.4"/><circle cx="11" cy="12" r="2.2" fill="currentColor"/><circle cx="15.5" cy="12" r="1.2"/><circle cx="20" cy="12" r="2.2"/>',
    orbit: '<circle cx="12" cy="12" r="8"/><path d="M12 4 A8 8 0 0 1 19.4 15" stroke-width="2.6"/><circle cx="19.4" cy="15" r="1.8" fill="currentColor"/>',
    bounce: '<path d="M3 20 H21"/><path d="M5 20 Q9 4 13 20" stroke-dasharray="2 2"/><circle cx="17" cy="9" r="2.6" fill="currentColor"/>',
    ring: '<circle cx="12" cy="12" r="3.5"/><circle cx="12" cy="12" r="8.5" stroke-dasharray="3 2"/>',
    conduct: '<path d="M12 19 Q6 10 4 15 Q12 14 20 15 Q19 9 15 9 Q12 0 12 19"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/>',
    coach: '<path d="M3 15 H21"/><path d="M12 8 V20" stroke-width="2.2"/><circle cx="9" cy="15" r="1.6" fill="currentColor"/><circle cx="16" cy="15" r="2.2" fill="currentColor"/><path d="M4 9 L7 9 M17 9 L20 9"/>'
  };
  let vizObj = null;
  window.__rhVizRefresh = function () { if (vizObj) { vizObj.colors(); if (!engine.playing) drawViz(); } };
  const coach = { taps: [], mic: false, msg: '', calib: null };
  if (!S.coachOff) S.coachOff = { tap: 0, mic: 0 };

  /* ---------- 악보 보기: 종이 위 한 마디, 연필 커서가 소리에 맞춰 지나감 ---------- */
  let scoreObj = null, scoreCur = null;
  function renderScore() {
    const box = $('score');
    box.innerHTML = '';
    scoreObj = window.RHNotation.score({ beats: S.beats, unit: S.unit, subdiv: S.subdiv, accents: S.accents, grouping: S.grouping });
    box.appendChild(scoreObj.svg);
    scoreCur = null;
  }
  function drawScore(now) {
    if (!scoreObj || !pend) return;
    let ph = (now - pend.t) / pend.d;
    if (ph < 0) ph = 0;
    if (ph > 1) ph = 1;
    const p = pend.p < 0 ? 0 : pend.p;
    if (pend.p < 0) ph = 0;
    if (p >= S.beats) return;
    const x = scoreObj.X(p, ph).toFixed(1);
    scoreObj.cursor.classList.remove('idle');
    scoreObj.cursor.setAttribute('x1', x);
    scoreObj.cursor.setAttribute('x2', x);
  }
  function isViz() { return VIZ_MODES.indexOf(S.viewMode) >= 0; }
  // v1.6.2: 박 보기(진자 · 악보 · 박 흐름 화면)를 탭하면 다음 모양으로. 점만 · 타이밍 코치는 설정에서만
  const TAP_CYCLE = VIEW_LIST.map(function (v) { return v[0]; }).filter(function (id) { return id !== 'dots' && id !== 'coach'; });
  function cycleView() {
    if (S.viewMode === 'coach') return;
    const i = TAP_CYCLE.indexOf(S.viewMode);
    const nx = TAP_CYCLE[(i + 1) % TAP_CYCLE.length];
    S.viewMode = nx;
    renderScreenSheet();
    renderViewMode();
    save();
    const m = VIEW_LIST.find(function (v) { return v[0] === nx; });
    const el = nx === 'pendulum' ? $('pendulum') : nx === 'score' ? $('score') : $('viz');
    el.classList.remove('vw-in'); void el.offsetWidth; el.classList.add('vw-in');
    toast('박 보기: ' + m[1] + ' · ' + m[2]);
  }
  ['pendulum', 'score', 'viz'].forEach(function (id) {
    $(id).addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('#vizHit, #vizTools, button, a')) return;
      cycleView();
    });
  });
  function renderViewMode() {
    if (!VIEW_LIST.some(function (v) { return v[0] === S.viewMode; })) S.viewMode = 'pendulum';
    $('pendulum').hidden = S.viewMode !== 'pendulum';
    $('score').hidden = S.viewMode !== 'score';
    if (S.viewMode === 'score') renderScore(); else scoreObj = null;
    const vz = isViz();
    $('viz').hidden = !vz;
    $('viz').classList.toggle('coach', S.viewMode === 'coach');
    $('vizHit').hidden = S.viewMode !== 'coach';
    $('vizTools').hidden = S.viewMode !== 'coach';
    if (S.viewMode !== 'coach' && coach.mic) micOff();
    renderPrac();
    scheduleFit();
    if (vz) {
      if (!vizObj) vizObj = window.RHViz.create($('vizCanvas'));
      const m = VIEW_LIST.find(function (v) { return v[0] === S.viewMode; });
      $('vizCanvas').setAttribute('aria-label', m[1] + ': ' + m[2]);
      vizObj.resize();
      drawViz();
    }
  }
  /* ---------- v1.6.2: 화면 맞춤 — 어떤 기종이든 재생 버튼까지 한 화면에 ----------
     다이얼 · 박 보기(진자 · 악보 · 박 흐름)만 늘이고 줄여서, 홈 화면 내용이 쓸 수 있는 높이에 꼭 맞게 함.
     키 큰 화면(패드)에서는 조금 크게(최대 1.3배), 낮은 화면(아이폰 SE · 6)에서는 작게(최소 0.5배). */
  const FIT_MIN = 0.4, FIT_MAX = 1.3, FIT_GAP = 8;
  let fitRaf = 0;
  function homeNeed(home) {
    let sum = 0, n = 0;
    const kids = home.children;
    for (let i = 0; i < kids.length; i++) {
      const el = kids[i];
      if (el.hidden) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.position === 'absolute' || cs.position === 'fixed') continue;
      sum += el.getBoundingClientRect().height + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
      n++;
    }
    const hs = getComputedStyle(home);
    // 옛 기종(간격 대신 여백을 넣는 도우미 사용 중)이면 여백에 이미 들어 있으니 최소 간격만
    const gap = document.documentElement.classList.contains('no-flex-gap') ? 0 : Math.max(FIT_GAP, parseFloat(hs.rowGap) || 0);
    return sum + Math.max(0, n - 1) * gap + (parseFloat(hs.paddingTop) || 0) + (parseFloat(hs.paddingBottom) || 0) + 4;
  }
  function fitHome() {
    fitRaf = 0;
    const home = $('viewHome');
    if (!home || home.hidden || !home.clientHeight) return;
    if (home.classList.contains('focus')) { home.style.setProperty('--fit', '1'); return; }
    const root = document.documentElement;
    root.classList.remove('fit-tight');
    home.classList.remove('no-view');
    home.style.removeProperty('--vfit');
    // 1) 다이얼 · 박 보기를 같이 늘이고 줄여 봄
    let f = fitVar(home, '--fit', FIT_MIN, FIT_MAX);
    // 2) 많이 줄여야 하면(작은 폰): 다이얼은 0.72배로 지키고, 박 보기만 더 줄여 봄
    const DIAL_KEEP = 0.62;
    if (f < DIAL_KEEP && hasView(home)) {
      home.style.setProperty('--fit', String(DIAL_KEEP));
      const v = fitVar(home, '--vfit', 0.45, DIAL_KEEP); // 박 보기는 0.45배보다 작아지면 어색해서 접음
      if (homeNeed(home) > home.clientHeight) {
        // 3) 그래도 모자라면 박 보기를 잠시 접고(박 점은 그대로) 다이얼만 맞춤
        home.style.removeProperty('--vfit');
        home.classList.add('no-view');
        f = fitVar(home, '--fit', FIT_MIN, FIT_MAX);
      } else f = v < DIAL_KEEP ? DIAL_KEEP : f;
    }
    // 4) 그래도 많이 작으면 간격 · 버튼을 한 단계 작게 (누르는 곳은 38px 이상 유지)
    if (parseFloat(home.style.getPropertyValue('--fit')) < 0.66) {
      root.classList.add('fit-tight');
      if (home.style.getPropertyValue('--vfit')) fitVar(home, '--vfit', 0.45, DIAL_KEEP);
      else fitVar(home, '--fit', FIT_MIN, FIT_MAX);
    }
    home.classList.toggle('scroll', homeNeed(home) > home.clientHeight + 1);
    svgMins();
  }
  function hasView(home) {
    return ['pendulum', 'score', 'viz'].some(function (id) { const e = $(id); return e && !e.hidden && getComputedStyle(e).display !== 'none'; });
  }
  // 이진 탐색: CSS 변수 name을 lo~hi 사이에서 가장 크게 (다 들어가는 한도 안에서)
  function fitVar(home, name, lo, hi) {
    const avail = home.clientHeight;
    const setF = function (f) { home.style.setProperty(name, f.toFixed(3)); };
    home.classList.remove('scroll');
    setF(hi);
    if (homeNeed(home) <= avail) return hi;
    for (let i = 0; i < 9; i++) {
      const mid = (lo + hi) / 2;
      setF(mid);
      if (homeNeed(home) <= avail) lo = mid; else hi = mid;
    }
    setF(lo);
    return lo;
  }
  // 그림(SVG) 안의 글자 · 손잡이는 그림이 작아지면 같이 작아져서, 화면에서 최소 크기를 지키게 보정
  function svgMins() {
    const dw = $('dial').getBoundingClientRect().width;
    if (dw > 0) {
      const k = 300 / dw; // 그림 1단위 → 화면 px의 역수
      const ends = document.querySelectorAll('.dial-end');
      const showEnds = dw >= 170;
      ends.forEach(function (t) { t.style.display = showEnds ? '' : 'none'; t.style.fontSize = Math.max(15, 12 * k).toFixed(1) + 'px'; });
      $('dialKnob').setAttribute('r', Math.min(22, Math.max(15, 11 * k)).toFixed(1));
    }
    const sw = $('sring').getBoundingClientRect().width;
    if (sw > 0) {
      const k2 = 300 / sw;
      document.querySelectorAll('.sr-lab').forEach(function (t) { t.style.fontSize = Math.max(17, 13 * k2).toFixed(1) + 'px'; });
    }
  }
  function scheduleFit() {
    if (fitRaf) return;
    fitRaf = (window.requestAnimationFrame || setTimeout)(fitHome);
  }
  window.addEventListener('resize', scheduleFit);
  window.addEventListener('rh-layout', scheduleFit); // 옛 기종 도우미가 간격을 다시 넣었을 때
  window.addEventListener('orientationchange', function () { setTimeout(fitHome, 250); });
  try { new ResizeObserver(scheduleFit).observe($('viewHome')); } catch (e) { /* 옛 기종: resize로 대신 */ }
  try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleFit); } catch (e) { /* 무시 */ }

  /* ---------- v1.7.0: 심플 화면 (박 원) ---------- */
  let sringKey = '', sringNow = -1;
  function sringCount() { return Math.max(1, $('beats').children.length || S.beats || 4); }
  function buildSring() {
    const n = sringCount();
    const key = n + '';
    if (key === sringKey) return;
    sringKey = key;
    const svg = $('sringSvg');
    const NS = 'http://www.w3.org/2000/svg';
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const R = 145, C = 150, gap = n > 1 ? Math.min(14, 120 / n) : 0; // 칸 사이 틈(도)
    const pt = function (deg) { const a = (deg - 90) * Math.PI / 180; return [C + R * Math.cos(a), C + R * Math.sin(a)]; };
    for (let i = 0; i < n; i++) {
      // 1박 칸이 12시 방향 가운데 (시계처럼 1 · 2 · 3 · 4가 위 · 오른쪽 · 아래 · 왼쪽)
      const a0 = (i - 0.5) * 360 / n + gap / 2, a1 = (i + 0.5) * 360 / n - gap / 2;
      const p0 = pt(a0), p1 = pt(n === 1 ? a1 - 0.01 : a1);
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', 'M ' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) + ' A ' + R + ' ' + R + ' 0 ' + ((a1 - a0) > 180 ? 1 : 0) + ' 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2));
      path.setAttribute('class', 'sr-seg' + (i === 0 ? ' first-seg' : ''));
      svg.appendChild(path);
      if (n <= 16) {
        // 칸 가운데 안쪽에 박 번호
        const mid = (a0 + a1) / 2, a = (mid - 90) * Math.PI / 180, rr = R - 26;
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('x', (C + rr * Math.cos(a)).toFixed(1));
        t.setAttribute('y', (C + rr * Math.sin(a) + 6).toFixed(1));
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('class', 'sr-lab');
        t.textContent = String(i + 1);
        svg.appendChild(t);
      }
    }
    sringNow = -1;
    svgMins();
  }
  function sringBeat(ev) {
    const svg = $('sringSvg');
    if (!svg.firstChild) return;
    const segs = svg.querySelectorAll('.sr-seg'), labs = svg.querySelectorAll('.sr-lab');
    const k = ev ? ev.pulse : -1;
    for (let i = 0; i < segs.length; i++) {
      const c = 'sr-seg' + (k >= 0 && i < k ? ' done' : '') + (i === k ? ' now' : '') + (i === k && k === 0 ? ' first' : '');
      segs[i].setAttribute('class', c);
      if (labs[i]) labs[i].setAttribute('class', 'sr-lab' + (i === k ? ' now' : '') + (i === k && k === 0 ? ' first' : ''));
    }
    sringNow = k;
    if (ev && ev.level > 0) {
      const g = $('sringGlow');
      if (g.animate && !reduceMotion) g.animate([{ opacity: k === 0 ? 0.42 : 0.24 }, { opacity: 0.1 }], { duration: k === 0 ? 260 : 180, easing: 'ease-out' });
    }
  }
  function renderUi() {
    const simple = S.ui === 'simple';
    const home = $('viewHome');
    home.classList.toggle('simple', simple);
    $('sring').hidden = !simple;
    document.querySelectorAll('[data-ui]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.ui === S.ui)); });
    // 심플에서는 합주 버튼을 숨김 (합주 중이면 그대로 보임)
    let inBand = false;
    try { inBand = !!bandRole(); } catch (e) { /* 아직 준비 전 */ }
    $('btnBand').hidden = simple && !inBand;
    if (simple) buildSring();
    renderPrac();
    scheduleFit();
  }
  document.querySelectorAll('[data-ui]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (S.ui === b.dataset.ui) return;
      S.ui = b.dataset.ui;
      renderUi();
      save();
      toast(S.ui === 'simple' ? '심플 화면' : '기본 화면');
    });
  });

  /* ---------- v1.7.0: 버전 · 업데이트 소식 ---------- */
  const APP_VERSION = '1.8.1';
  const CHANGELOG = [
    ['1.8.1', '2026-11-19', ['합주 리더 화면의 "참가한 기기"에 기기마다 앱 버전이 보여요. 옛 버전 기기는 빨간 표시와 함께 업데이트 방법을 알려 줘요.',
      '앱(아이폰 · 안드로이드)에서 새 버전이 나오면 알려 드려요 (설정 맨 위).']],
    ['1.8.0', '2026-11-19', ['합주 참가가 쉬워졌어요. 같은 Wi-Fi에서 열린 방과 지난번에 들어간 방이 바로 떠서 "바로 들어가기" 한 번이면 돼요.',
      '방 번호가 숫자 4자리가 됐어요. 4번째 숫자를 누르면 바로 들어가요. 앱 안에서 QR도 찍을 수 있어요.',
      '리더는 "카톡으로 초대"로 링크를 보내고, "다음에도 이 번호로 열기"로 매번 같은 번호를 쓸 수 있어요.']],
    ['1.7.2', '2026-11-19', ['작은 폰(아이폰 SE · 6s · 작은 갤럭시)에서 아이콘 · 버튼 · 글자가 너무 작아지지 않게 했어요.',
      '화면이 좁으면 움직이는 그림을 먼저 줄이거나 접고, 다이얼과 버튼은 손가락으로 누르기 좋은 크기를 지켜요.']],
    ['1.7.1', '2026-11-19', ['합주 모드를 아이폰에서 고쳤어요. 리더 소리가 안 나거나, 참가한 기기의 박이 뒤죽박죽이던 문제예요.',
      '참가한 기기의 소리가 잠겨 있으면 "화면을 한 번 눌러 주세요"라고 알려 주고, 누르면 바로 따라 울려요.']],
    ['1.7.0', '2026-11-19', ['심플 화면이 생겼어요. 머리줄 왼쪽 "기본 | 심플"로 바꿔요. 박마다 큰 원이 차오르고, 숫자를 밀어서 빠르기를 바꿔요.',
      '설정 맨 위에서 지금 버전과 업데이트 내역을 볼 수 있어요. 새 버전이 되면 이렇게 소식으로 알려 드려요.']],
    ['1.6.4', '2026-11-19', ['연습 모드를 켜고 끄기 쉬워졌어요. 연습 설정 맨 위 스위치, 홈 화면 연습 계기판의 "끄기" 버튼.']],
    ['1.6.3', '2026-11-19', ['새 버전이 나오면 한 번만 열어도 바로 바뀌어요.', '아이폰 SE · 6s 같은 작은 화면을 다시 정리했어요.']],
    ['1.6.2', '2026-11-18', ['어떤 휴대폰 · 패드에서도 재생 버튼까지 한 화면에 꼭 맞아요.', '박 보기를 탭하면 모양이 바뀌어요.', '가운데 숫자를 위아래로 밀어서 1씩 조절해요.', '아이폰 6 같은 옛 기종에서도 쓸 수 있어요.']],
    ['1.6.1', '2026-11-17', ['다이얼이 20과 400에서 멈춰요.', '연습 계기판과 크게 보기가 생겼어요.']],
    ['1.6.0', '2026-11-11', ['아이폰 무음 스위치를 켜도 소리가 나요.', '개인정보처리방침을 넣었어요.']]
  ];
  const SEEN_KEY = 'rhm.seenVersion';
  function newsHtml(list, currentFirst) {
    return list.map(function (c, i) {
      return '<div class="news-ver"><b>' + c[0] + '</b><span>' + c[1].replace(/-/g, '.') + '</span>' + (i === 0 && currentFirst ? '<span class="now">지금 버전</span>' : '') + '</div>' +
        '<ul class="news-list">' + c[2].map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>';
    }).join('');
  }
  /* v1.8.1: 앱(아이폰 · 안드로이드)은 설치한 버전 그대로 남아서, 웹에 새 버전이 올라오면 알려 줌
     (웹은 열 때 저절로 바뀌니 필요 없음). 기기마다 버전이 다르면 합주 박이 안 맞을 수 있음 */
  function cmpVer(a, b) {
    const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; }
    return 0;
  }
  let updToasted = false, updAt = 0;
  function checkAppUpdate() {
    if (!NATIVE || Date.now() - updAt < 30 * 60000) return;
    updAt = Date.now();
    try {
      fetch(WEB_URL + 'version.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        const v = j && j.version;
        if (!v || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(v) || cmpVer(v, APP_VERSION) <= 0) return;
        $('aboutUpd').hidden = false;
        $('aboutUpd').textContent = '새 버전 ' + v + '이 나왔어요 · 앱을 업데이트해 주세요';
        if (!updToasted) { updToasted = true; setTimeout(function () { toast('새 버전 ' + v + '이 나왔어요 · 앱을 업데이트해 주세요'); }, 2500); }
      }, function () { /* 무시 */ });
    } catch (e) { /* 무시 */ }
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) checkAppUpdate(); });
  function showNews(all) {
    $('newsTitle').textContent = all ? '업데이트 내역' : APP_VERSION + ' 업데이트 소식';
    $('newsBody').innerHTML = newsHtml(all ? CHANGELOG : CHANGELOG.slice(0, 1), true) +
      (all ? '' : '<button type="button" class="news-more" id="newsAll">지난 업데이트도 보기</button>');
    const more = $('newsAll');
    if (more) more.addEventListener('click', function () { showNews(true); });
    showSheet('sheetNews');
  }
  $('appVer').textContent = APP_VERSION;
  $('aboutVer').textContent = APP_VERSION;
  $('aboutCard').addEventListener('click', function () { closeSheet(); setTimeout(function () { showNews(true); }, 220); });
  function checkNews() {
    let seen = null;
    const hadSettings = HAD_SETTINGS;
    try { seen = localStorage.getItem(SEEN_KEY); } catch (e) { return; }
    try { localStorage.setItem(SEEN_KEY, APP_VERSION); } catch (e) { /* 무시 */ }
    // 처음 설치면 조용히, 쓰던 사람이 새 버전을 처음 열면 소식 한 번
    if ((seen && seen !== APP_VERSION) || (!seen && hadSettings)) setTimeout(function () { if (!openSheet) showNews(false); }, 900);
  }

  /* ---------- v1.6.1: 연습 계기판 · 크게 보기 ---------- */
  let pracStart = null, pracWasPlaying = false, pracLadderKey = '', pracLayoutKey = '';
  function mmssUp(sec) { // 흐른 시간은 내림 (0:59 다음에 1:00)
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, x = String(sec % 60).padStart(2, '0');
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + x : m + ':' + x;
  }
  function pracShown() {
    if (!(S.practice.on || S.timer > 0)) return false;
    try { if (band.sync && band.sync.role) return false; } catch (e) { /* 아직 준비 전 */ }
    return true;
  }
  function todaySec() {
    try { const d = LOG.days[dayKey()]; return d ? d.s : 0; } catch (e) { return 0; }
  }
  function pracData() {
    const P = S.practice;
    const run = !!(engine.playing && !engine.program && !engine.follow && engine.ctx);
    const now = run ? engine.ctx.currentTime : 0;
    const elapsed = run ? now - engine.startedAt : 0;
    const start = run && pracStart != null ? Math.min(pracStart, S.bpm) : S.bpm;
    const d = { run: run, elapsed: elapsed, P: P, start: start, n: 0, cur: 0 };
    if (P.on && P.target > start) {
      d.n = Math.ceil((P.target - start) / P.step);
      d.cur = Math.max(0, Math.min(d.n, Math.ceil((S.bpm - start) / P.step - 1e-6)));
      if (S.bpm >= P.target) d.cur = d.n;
    }
    d.reached = P.on && S.bpm >= P.target;
    d.info = run && P.on ? engine.practiceInfo(now) : null;
    return d;
  }
  function renderPrac() {
    const home = $('viewHome');
    if (!home) return;
    const show = pracShown();
    const big = show && !!S.pracBig && S.ui !== 'simple';
    const pkey = show + '|' + big + '|' + isViz();
    if (pkey !== pracLayoutKey) { pracLayoutKey = pkey; scheduleFit(); }
    home.classList.toggle('practicing', show);
    home.classList.toggle('focus', big);
    $('prac').hidden = !show;
    $('prac').classList.toggle('slim', show && isViz());
    home.classList.toggle('pr-slim', show && isViz());
    $('pfocus').hidden = !big;
    $('sPr').hidden = !show;
    if (!show) return;
    const d = pracData(), P = d.P;
    const timerLeft = S.timer ? S.timer * 60 - d.elapsed : 0;

    // 왼쪽: 연습한 시간
    $('pcElapsed').textContent = mmssUp(d.elapsed);
    $('pfElapsed').textContent = mmssUp(d.elapsed);
    $('pcElapsedSub').textContent = (P.on && S.timer) ? '⏱ 남은 ' + mmss(timerLeft) : '오늘 ' + fmtToday();

    // 오른쪽: 다음 빠르기까지 (연습 모드) 또는 남은 시간 (타이머만)
    let lbl, val, frac = 0, done = false, sub = '';
    if (!P.on) {
      lbl = '남은 연습 시간';
      val = mmss(timerLeft);
      frac = S.timer ? Math.min(1, d.elapsed / (S.timer * 60)) : 0;
      sub = '끝나면 마디 끝에서 멈춰요';
    } else if (d.reached) {
      done = true;
      lbl = '목표 도달!';
      val = P.target + '<small>BPM</small>';
      sub = '이 빠르기로 계속해요';
    } else {
      const nxt = Math.min(P.target, S.bpm + P.step);
      lbl = '다음 <b>▲ ' + nxt + '</b> 까지';
      if (d.info) {
        if (d.info.bars != null) { val = d.info.bars + '<small>마디</small>'; frac = (P.every - d.info.bars) / P.every; }
        else { val = mmss(d.info.sec); frac = 1 - d.info.sec / (P.every * 60); }
      } else {
        val = P.unit === 'bar' ? P.every + '<small>마디</small>' : mmss(P.every * 60);
      }
    }
    frac = Math.max(0, Math.min(1, frac));
    $('pcNextTile').classList.toggle('done', done);
    $('pcNextTile').classList.toggle('next', !done);
    $('pcNextLbl').innerHTML = lbl;
    $('pcNext').innerHTML = val;
    $('pcBarWrap').hidden = done;
    $('pcBar').style.width = (frac * 100).toFixed(1) + '%';
    $('pcNextSub').hidden = !done;
    $('pcNextSub').textContent = sub;
    // 크게 보기
    $('pfBpm').textContent = S.bpm;
    $('pfBpm').classList.toggle('wide', S.bpm >= 100);
    $('pfLab').innerHTML = (S.unit === 8 ? '♪' : '♩') + ' = BPM' + (P.on ? ' · 목표 <b>' + P.target + '</b>' : '');
    $('pfNextLbl').innerHTML = lbl;
    $('pfCd').innerHTML = val;
    $('pfBarWrap').hidden = done;
    $('pfBar').style.width = (frac * 100).toFixed(1) + '%';
    $('pfocus').querySelector('.pf-next').classList.toggle('done', done);
    // 심플 화면: 원 안에 한 줄로
    const plain = String(val).replace(/<small>/g, ' ').replace(/<[^>]+>/g, '');
    $('sPr').textContent = !P.on ? '⏱ 남은 ' + plain : done ? '목표 ' + P.target + ' 도달!' : '▲ ' + Math.min(P.target, S.bpm + P.step) + '까지 ' + plain;
    $('sPr').classList.toggle('done', done);

    // 계단: 시작 → 목표
    $('pcLadder').hidden = !(P.on && d.n);
    let cap = '';
    if (P.on && d.n) {
      const key = d.start + '|' + P.target + '|' + d.n + '|' + d.cur;
      if (key !== pracLadderKey) {
        pracLadderKey = key;
        $('pcFrom').textContent = d.start;
        $('pcTo').textContent = P.target;
        const box = $('pcSteps');
        box.innerHTML = '';
        const m = Math.min(d.n, 30); // 너무 많으면 묶어서 보여 줌
        const curM = Math.floor(d.cur * m / d.n);
        for (let i = 0; i < m; i++) {
          const el = document.createElement('i');
          el.style.height = (30 + 70 * (m > 1 ? i / (m - 1) : 1)).toFixed(0) + '%';
          if (d.cur >= d.n || i < curM) el.className = 'st-ok';
          else if (i === curM) el.className = 'st-cur';
          box.appendChild(el);
        }
      }
      const stepNo = Math.min(d.n, d.cur + (d.reached ? 0 : 1));
      if (d.reached) cap = '<b>' + d.n + ' / ' + d.n + '</b> 단계 · 목표 완료';
      else {
        const leftSteps = d.n - d.cur;
        let left;
        if (P.unit === 'bar') left = '약 ' + leftSteps * P.every + '마디';
        else {
          const sec = (leftSteps - 1) * P.every * 60 + (d.info && d.info.sec != null ? d.info.sec : P.every * 60);
          left = '약 ' + Math.max(1, Math.ceil(sec / 60)) + '분';
        }
        cap = '<b>' + stepNo + ' / ' + d.n + '</b> 단계 · 목표까지 ' + left;
      }
    } else if (P.on) {
      cap = '목표(' + P.target + ')를 지금 빠르기보다 높여 주세요';
    } else {
      cap = '⏱ ' + S.timer + '분 타이머';
    }
    $('pcCap').innerHTML = cap;
    $('pfStage').innerHTML = cap;
  }
  function fmtToday() {
    const m = Math.floor(todaySec() / 60);
    if (m < 1) return '1분 미만';
    return m >= 60 ? Math.floor(m / 60) + '시간 ' + (m % 60) + '분' : m + '분';
  }
  $('pcBig').addEventListener('click', function () { S.pracBig = true; renderPrac(); save(); });
  // v1.6.4: 홈 화면에서 바로 연습 모드(+ 타이머) 끄기
  function practiceOff() {
    const hadTimer = S.timer > 0;
    S.practice.on = false;
    S.timer = 0;
    S.pracBig = false;
    practiceChanged();
    renderPrac();
    toast(hadTimer ? '연습 모드와 타이머를 껐어요' : '연습 모드를 껐어요');
  }
  $('pcOff').addEventListener('click', practiceOff);
  $('pfOff').addEventListener('click', practiceOff);
  $('pfBack').addEventListener('click', function () { S.pracBig = false; renderPrac(); save(); });

  /* ---------- 박 흐름 보조 화면 (프로) ---------- */
  function vizState(now) {
    const beats = (pend && pend.beats) || S.beats;
    const st = {
      beats: beats, levels: (pend && pend.levels) || S.accents,
      sub: SUBPOS[S.subdiv] || [0], mask: pattern(),
      groups: S.unit === 8 && S.grouping ? S.grouping : null, unit: S.unit,
      coach: coach, playing: false, pre: false, n: 0, pulse: 0, ph: 0
    };
    if (engine.playing && pend && now != null) {
      let ph = (now - pend.t) / pend.d;
      if (ph < 0) ph = 0;
      if (ph > 1) ph = 1;
      st.playing = true;
      st.n = pend.n;
      st.ph = ph;
      if (pend.p < 0) { st.pre = true; st.pulse = beats - 1; } else st.pulse = pend.p;
    }
    return st;
  }
  function drawViz(now) {
    if (!vizObj || !isViz()) return;
    vizObj.draw(S.viewMode, vizState(now));
  }
  try {
    new ResizeObserver(function () { if (vizObj && isViz()) { vizObj.resize(); if (!engine.playing) drawViz(); } }).observe($('viz'));
  } catch (e) { /* 무시 */ }

  /* 타이밍 코치: 친 순간(소리가 귀에 닿는 시각 기준) → 가장 가까운 박 · 분할과의 차이 */
  function coachRecord(T, kind) {
    if (!engine.playing || !pend || pend.p < 0) {
      coach.msg = '메트로놈을 켜고 박에 맞춰 쳐 보세요';
      if (!engine.playing) drawViz();
      return;
    }
    const x = (T - pend.t) / pend.d;
    const sub = SUBPOS[S.subdiv] || [0], mask = pattern();
    let best = null;
    for (let kk = -1; kk <= 2; kk++) {
      sub.forEach(function (o, j) {
        if (mask[j] === 0) return;
        const c = kk + o;
        if (best == null || Math.abs(x - c) < Math.abs(x - best)) best = c;
      });
    }
    if (best == null) return;
    const raw = (x - best) * pend.d * 1000;
    if (coach.calib) {
      coach.calib.vals.push(raw);
      const left = coach.calib.need - coach.calib.vals.length;
      if (left > 0) { coach.msg = '보정 중 · 박에 맞춰 ' + left + '번 더'; return; }
      const v = coach.calib.vals.slice().sort(function (a, b) { return a - b; });
      const med = v[Math.floor(v.length / 2)];
      S.coachOff[coach.calib.kind] = Math.round(med);
      coach.calib = null;
      coach.taps = [];
      coach.msg = '보정했어요. 이제 박에 맞춰 쳐 보세요';
      save();
      toast((kind === 'mic' ? '마이크' : '화면 터치') + ' 지연 ' + (med > 0 ? '+' : '') + Math.round(med) + 'ms 보정했어요');
      return;
    }
    const ms = raw - (S.coachOff[kind] || 0);
    coach.taps.push({ ms: ms, t: T });
    if (coach.taps.length > 24) coach.taps.shift();
  }
  // 화면 터치 시각 → 오디오 시계 (지금 스피커에서 나오는 소리 기준)
  function touchTime(e) {
    const ctx = engine.ctx;
    if (!ctx) return 0;
    try {
      if (ctx.getOutputTimestamp && e && e.timeStamp) {
        const ts = ctx.getOutputTimestamp();
        if (ts && ts.performanceTime) return ts.contextTime + (e.timeStamp - ts.performanceTime) / 1000;
      }
    } catch (er) { /* 무시 */ }
    return ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
  }
  $('vizHit').addEventListener('pointerdown', function (e) { e.preventDefault(); coachRecord(touchTime(e), 'tap'); });
  $('vizHit').addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); e.stopPropagation(); coachRecord(touchTime(null), 'tap'); }
  });
  $('coachReset').addEventListener('click', function () { coach.taps = []; coach.msg = ''; coach.calib = null; drawViz(); });
  $('calBtn').addEventListener('click', function () {
    if (!engine.playing) { toast('먼저 메트로놈을 켜 주세요'); return; }
    coach.calib = { kind: coach.mic ? 'mic' : 'tap', need: 8, vals: [] };
    coach.taps = [];
    coach.msg = '보정 중 · 박에 맞춰 8번 ' + (coach.mic ? '연주하세요' : '누르세요');
  });

  /* 마이크: 소리가 갑자기 커지는 순간(타격)을 찾아 그 시각을 보냄 */
  let mic = null;
  const ONSET_SRC = 'class RHOnset extends AudioWorkletProcessor{constructor(){super();this.avg=0.002;this.hold=0;}' +
    'process(inp){const ch=inp[0]&&inp[0][0];if(!ch)return true;let e=0;for(let i=0;i<ch.length;i++)e+=ch[i]*ch[i];' +
    'const rms=Math.sqrt(e/ch.length);if(this.hold>0){this.hold--;}else if(rms>0.03&&rms>this.avg*4){' +
    'const th=Math.max(0.03,this.avg*4)*0.6;let k=0;for(let i=0;i<ch.length;i++){if(Math.abs(ch[i])>th){k=i;break;}}' +
    'this.port.postMessage((currentFrame+k)/sampleRate);this.hold=Math.round(0.08*sampleRate/128);}' +
    'this.avg=this.avg*0.99+rms*0.01;return true;}}registerProcessor("rh-onset",RHOnset);';
  async function micOn() {
    try {
      await engine.init();
      const ctx = engine.ctx;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } });
      if (!mic || !mic.loaded) {
        const url = URL.createObjectURL(new Blob([ONSET_SRC], { type: 'text/javascript' }));
        await ctx.audioWorklet.addModule(url);
        mic = { loaded: true };
      }
      const src = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, 'rh-onset');
      const sink = ctx.createGain();
      sink.gain.value = 0;
      src.connect(node); node.connect(sink); sink.connect(ctx.destination);
      // 마이크로 들어온 시각에서 입력 지연(대략)과 출력 지연을 빼서 "친 순간"으로 되돌림. 남는 차이는 보정으로 맞춤
      node.port.onmessage = function (ev) {
        const comp = (ctx.outputLatency || ctx.baseLatency || 0.01) + 0.012;
        coachRecord(ev.data - comp, 'mic');
      };
      mic.stream = stream; mic.src = src; mic.node = node; mic.sink = sink;
      coach.mic = true;
      coach.msg = '마이크 켜짐 · 이어폰을 끼면 클릭을 연주로 잘못 듣지 않아요';
    } catch (e) {
      coach.mic = false;
      toast('마이크를 쓸 수 없어요 · 브라우저에서 마이크 허용을 확인해 주세요');
    }
    renderMic();
  }
  function micOff() {
    if (mic && mic.stream) {
      mic.stream.getTracks().forEach(function (t) { t.stop(); });
      try { mic.src.disconnect(); mic.node.disconnect(); mic.sink.disconnect(); } catch (e) { /* 무시 */ }
      mic.stream = null;
    }
    coach.mic = false;
    coach.msg = '';
    renderMic();
  }
  function renderMic() {
    $('micBtn').setAttribute('aria-pressed', String(coach.mic));
    $('micTxt').textContent = coach.mic ? '마이크 켜짐' : '마이크';
    drawViz();
  }
  $('micBtn').addEventListener('click', function () { if (coach.mic) micOff(); else micOn(); });

  /* 설정의 박 보기 카드 */
  function buildViewGrid() {
    const box = $('viewGrid');
    VIEW_LIST.forEach(function (v) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'vw';
      b.setAttribute('role', 'radio');
      b.dataset.viewMode = v[0];
      b.innerHTML = '<svg class="vw-ic" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (VIEW_ICON[v[0]] || '') + '</svg>';
      const nm = document.createElement('span');
      nm.className = 'vw-name';
      nm.textContent = v[1];
      if (v[3]) { const t = document.createElement('span'); t.className = 'pro-tag'; t.textContent = 'PRO'; nm.appendChild(t); }
      const ds = document.createElement('span');
      ds.className = 'vw-desc';
      ds.textContent = v[2];
      b.appendChild(nm);
      b.appendChild(ds);
      b.setAttribute('aria-label', v[1] + ' 보기, ' + v[2] + (v[3] ? ', 프로' : ''));
      b.addEventListener('click', function () {
        if (v[3] && !PRO_OPEN) { toast('프로 보기예요'); return; }
        S.viewMode = v[0];
        renderScreenSheet();
        renderViewMode();
        save();
      });
      box.appendChild(b);
    });
  }
  function renderViewGrid() {
    $('viewGrid').querySelectorAll('.vw').forEach(function (b) {
      const on = b.dataset.viewMode === S.viewMode;
      b.setAttribute('aria-checked', String(on));
      b.setAttribute('aria-pressed', String(on));
      b.tabIndex = on ? 0 : -1;
    });
  }


  function clearBeat() {
    sringBeat(null);
    if (nowEl) nowEl.classList.remove('now');
    nowEl = null;
    if (subEl) subEl.classList.remove('on');
    subEl = null;
    restPendulum();
  }

  /* ---------- 키보드 ---------- */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && openSheet) { closeSheet(); return; }
    if (openSheet) return;
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
    if (typing) return;
    if (view === 'editor') {
      if (e.key === ' ' && !(t && t.tagName === 'BUTTON') && window.RH.toggleSong) { e.preventDefault(); window.RH.toggleSong(); }
      return;
    }
    if (view !== 'home') return;
    if (e.key === ' ' && !(t && t.tagName === 'BUTTON')) { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setBpm(S.bpm + (e.shiftKey ? 10 : 1)); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setBpm(S.bpm - (e.shiftKey ? 10 : 1)); }
    else if (e.key === 't' || e.key === 'T') { tap(); }
    else if (S.viewMode === 'coach' && /^[jfJF]$/.test(e.key) && !e.repeat) { coachRecord(touchTime(e), 'tap'); }
  });

  /* ---------- 처음 그리기 ---------- */
  function renderAll() {
    renderTempo();
    renderViewMode();
    renderBeats();
    renderChips();
    if (openSheet && openSheet.id === 'sheetMeter') renderMeterSheet();
    if (openSheet && openSheet.id === 'sheetSound') renderSoundSheet();
  }

  buildMeterSheet();
  buildSoundSheet();
  buildScreenSheet();
  buildBpmSheet();
  buildPracticeSheet();
  buildLog();
  buildBand();
  renderPracticeSheet();
  pushEngine();
  renderAll();
  renderUi();
  renderPlay();
  checkNews();
  checkAppUpdate();

  // 다른 파일(songs.js)과 같이 쓰는 것들
  window.RH = Object.assign(window.RH || {}, {
    engine: engine,
    METERS: METERS,
    accentsFor: accentsFor,
    defaultGrouping: defaultGrouping,
    countWords: COUNT_WORDS,
    toast: toast,
    setView: setView,
    playProgram: playProgram,
    stopAll: stopAll,
    clampBpm: clampBpm,
    getView: function () { return view; }
  });

  // 시험용
  window.__rh = { band: band, bandRole: bandRole, skins: SKINS, applyTheme: applyTheme, engine: engine, state: function () { return S; }, setMeter: setMeter, setBpm: setBpm, renderViewMode: function () { renderViewMode(); }, renderUi: function () { renderUi(); }, log: function () { return LOG; }, renderLog: function () { renderLog(); } };
})();
