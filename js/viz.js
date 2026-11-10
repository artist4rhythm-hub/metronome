/* 리듬 하우스 메트로놈 — 박 흐름 보조 화면 (프로)
   다가오는 박 · 마디 시계 · 통통 공 · 모이는 원 · 지휘 패턴 · 타이밍 코치
   모두 캔버스 하나에 그리고, 앱이 매 화면마다 "지금 박의 위치"를 넘겨 줍니다.

   st = {
     playing, n(시작부터 몇 번째 박), pulse(마디 안 박 번호), ph(박 안 진행 0~1),
     beats, levels[박마다 세기 3·2·1·0], sub[박 안 분할 위치], mask[분할 자리 소리 1·0],
     groups(8분 박자 묶음 또는 null), unit, coach{ taps, mic, calib, msg }
   } */
(function (global) {
  'use strict';

  const TAU = Math.PI * 2;
  const frac = function (x) { return x - Math.floor(x); };
  const mod = function (a, n) { return ((a % n) + n) % n; };

  const MODES = [
    // [id, 이름, 설명, 프로]
    ['highway', '다가오는 박', '다음 박을 미리 보며 맞춰요', true],
    ['orbit', '마디 시계', '마디 안 지금 위치', true],
    ['bounce', '통통 공', '공이 닿는 순간이 박', true],
    ['ring', '모이는 원', '원이 겹치는 순간이 박', true],
    ['conduct', '지휘 패턴', '지휘자가 젓는 모양 그대로', true],
    ['coach', '타이밍 코치', '빠른지 늦은지 ms로', true]
  ];

  // 지휘 모양: 박마다 내려찍는 점(ictus)과, 다음 점까지 튀어 오르는 곡선의 조절점
  const PAT = {
    1: { pts: [[0, 0.8]], ctl: [[0.02, -1.05]] },
    2: { pts: [[0, 0.75], [0.18, 0.5]], ctl: [[0.55, -0.05], [-0.05, -1.05]] },
    3: { pts: [[0, 0.78], [0.72, 0.58], [0.28, 0.22]], ctl: [[0.32, 0.18], [0.78, -0.05], [0.02, -1.05]] },
    4: { pts: [[0, 0.8], [-0.72, 0.58], [0.74, 0.6], [0.26, 0.2]], ctl: [[-0.35, 0.15], [0.02, 0.2], [0.82, -0.02], [0.03, -1.05]] },
    6: { pts: [[0, 0.8], [-0.34, 0.66], [-0.72, 0.6], [0.72, 0.62], [0.42, 0.56], [0.22, 0.18]],
         ctl: [[-0.15, 0.48], [-0.52, 0.42], [0, 0.22], [0.6, 0.38], [0.5, 0.08], [0.03, -1.05]] }
  };
  function genericPat(n) {
    // 5 · 7 · 9박 등: 첫 박은 아래, 가운데 박들은 왼쪽 → 오른쪽, 마지막은 위로
    const pts = [[0, 0.8]], ctl = [];
    for (let i = 1; i < n - 1; i++) pts.push([-0.78 + 1.56 * (i - 1) / Math.max(1, n - 3), 0.6]);
    pts.push([0.26, 0.2]);
    for (let i = 0; i < n; i++) {
      const a = pts[i], z = pts[(i + 1) % n];
      ctl.push(i === n - 1 ? [0.03, -1.05] : [(a[0] + z[0]) / 2, Math.min(a[1], z[1]) - 0.32]);
    }
    return { pts: pts, ctl: ctl };
  }

  function create(canvas) {
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, C = {};
    function colors() {
      const cs = getComputedStyle(document.documentElement);
      ['bg', 'surface', 'ink', 'quiet', 'line', 'chip', 'brand', 'accent', 'dot', 'track'].forEach(function (k) {
        C[k] = cs.getPropertyValue('--' + k).trim() || '#888';
      });
      C.good = C.brand;
    }
    function resize() {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2.5, global.devicePixelRatio || 1);
      w = r.width; h = r.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    colors();

    function circle(x, y, r, fill, stroke, lw) {
      ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, r), 0, TAU);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.lineWidth = lw || 2; ctx.strokeStyle = stroke; ctx.stroke(); }
    }
    function text(s, x, y, size, color, weight, align) {
      ctx.font = (weight || 700) + ' ' + size + 'px "Space Grotesk", "IBM Plex Sans KR", system-ui, sans-serif';
      ctx.fillStyle = color; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(s, x, y);
    }
    function line(x1, y1, x2, y2, color, lw) {
      ctx.strokeStyle = color; ctx.lineWidth = lw || 2;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }

    // 박 k(시작부터 센 번호)의 세기
    function lv(st, k) {
      const p = mod(st.pulse + (k - st.n), st.beats);
      const v = st.levels[p];
      return v == null ? 2 : v;
    }
    function pulseOf(st, k) { return mod(st.pulse + (k - st.n), st.beats); }
    function flash(st) { return st.playing && !st.pre ? Math.max(0, 1 - st.ph * 4) : 0; }
    function beatColor(v) { return v === 3 ? C.accent : C.brand; }

    /* 1) 다가오는 박 */
    function highway(st) {
      const b = st.n + st.ph, hitX = Math.max(46, w * 0.17), y = h * 0.5, ppb = Math.max(60, Math.min(w * 0.24, 130));
      line(8, y, w - 8, y, C.line, 2);
      const k0 = Math.floor(b) - 1, k1 = Math.ceil(b + (w - hitX) / ppb) + 1;
      for (let k = k0; k <= k1; k++) {
        st.sub.forEach(function (o, j) {
          const p = k + o, x = hitX + (p - b) * ppb;
          if (x < -20 || x > w + 20) return;
          const past = p < b - 0.02;
          ctx.globalAlpha = past ? 0.22 : 1;
          if (j === 0) {
            const v = lv(st, k);
            if (pulseOf(st, k) === 0) line(x, y - h * 0.34, x, y + h * 0.34, C.dot, 1.5);
            if (st.mask[0] === 0 || v === 0) circle(x, y, 9, null, C.quiet, 2);
            else circle(x, y, v === 3 ? 13 : v === 2 ? 10.5 : 8, beatColor(v));
            text(String(pulseOf(st, k) + 1), x, y + 24, 11, C.quiet, 500);
          } else if (st.mask[j] === 0) {
            circle(x, y, 4, null, C.dot, 1.5);
          } else {
            circle(x, y, 4.5, C.quiet);
          }
        });
      }
      ctx.globalAlpha = 1;
      const f = flash(st);
      line(hitX, y - h * 0.32, hitX, y + h * 0.32, C.ink, 3);
      if (f > 0) circle(hitX, y, 16 + (1 - f) * 16, null, beatColor(lv(st, st.n)), 3 * f);
    }

    /* 2) 마디 시계 */
    function orbit(st) {
      const cx = w / 2, cy = h / 2, R = Math.min(w * 0.3, h * 0.3), n = st.beats;
      const p = st.playing ? st.pulse + st.ph : 0;
      const ang = function (q) { return -Math.PI / 2 + TAU * q / n; };
      circle(cx, cy, R, null, C.track, 6);
      if (st.playing) {
        ctx.beginPath(); ctx.arc(cx, cy, R, ang(0), ang(p) + 0.0001);
        ctx.strokeStyle = C.brand; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineCap = 'butt';
      }
      for (let k = 0; k < n; k++) {
        st.sub.forEach(function (o, j) {
          const q = k + o, a = ang(q), passed = st.playing && q <= p;
          const r1 = j === 0 ? R - 12 : R - 7, r2 = j === 0 ? R + 12 : R + 6;
          const col = st.mask[j] === 0 ? C.track : passed ? (j === 0 ? C.ink : C.quiet) : C.dot;
          line(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, cx + Math.cos(a) * r2, cy + Math.sin(a) * r2, col, j === 0 ? 3 : 1.5);
        });
        if (n <= 12) {
          const a = ang(k);
          text(String(k + 1), cx + Math.cos(a) * (R + 19), cy + Math.sin(a) * (R + 19), 11, st.levels[k] === 3 ? C.accent : C.quiet, 500);
        }
      }
      const a = ang(p);
      circle(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 8, C.accent, C.surface, 3);
      const f = flash(st), cur = st.playing ? st.pulse + 1 : 1;
      text(String(cur), cx, cy, Math.min(40, R * 0.75) + f * 6, st.playing && st.levels[st.pulse] === 3 ? C.accent : C.ink, 700);
    }

    /* 3) 통통 공 */
    function bounce(st) {
      const n = st.beats, ground = h * 0.8, padX = Math.max(24, w * 0.09);
      const X = function (q) { return n === 1 ? w / 2 : padX + (w - padX * 2) * q / (n - 1); };
      line(padX - 14, ground, w - padX + 14, ground, C.line, 2);
      const k = st.playing ? st.pulse : 0, ph = st.playing ? st.ph : 0;
      for (let i = 0; i < n; i++) {
        const v = st.levels[i], hit = i === k ? flash(st) : 0;
        ctx.fillStyle = v === 0 ? C.track : beatColor(v); ctx.globalAlpha = 0.35 + hit * 0.65;
        ctx.beginPath(); ctx.ellipse(X(i), ground + 1, (v === 3 ? 14 : 11) + hit * 5, 3.5, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        if (n <= 12) text(String(i + 1), X(i), ground + 15, 11, C.quiet, 500);
        if (i < n - 1) st.sub.forEach(function (o, j) {
          if (j === 0) return;
          const q = i + o;
          circle(X(q), ground, 2.5, st.mask[j] === 0 ? null : (st.playing && q <= k + ph ? C.quiet : C.dot), st.mask[j] === 0 ? C.dot : null, 1);
        });
      }
      const from = X(k), to = k === n - 1 ? X(0) : X(k + 1);
      const x = from + (to - from) * ph;
      const H = (ground - 22) * (k === n - 1 && n > 1 ? 1 : 0.85);
      const y = ground - 11 - H * 4 * ph * (1 - ph);
      const sq = ph < 0.07 ? 1 - (0.07 - ph) * 3 : ph > 0.95 ? 1 - (ph - 0.95) * 3 : 1;
      ctx.fillStyle = C.dot; ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.ellipse(x, ground, Math.max(3, 11 * (1 - (ground - y) / h)), 2.5, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = C.ink;
      ctx.beginPath(); ctx.ellipse(x, y, 11 / sq, 11 * sq, 0, 0, TAU); ctx.fill();
    }

    /* 4) 모이는 원 */
    function ring(st) {
      const cx = w / 2, cy = h / 2, r0 = Math.min(w, h) * 0.17;
      const ph = st.playing ? st.ph : 0;
      const vC = lv(st, st.n), vN = lv(st, st.n + 1);
      const f = flash(st);
      circle(cx, cy, r0, null, C.ink, 3);
      if (f > 0) { ctx.globalAlpha = f; circle(cx, cy, r0, beatColor(vC)); ctx.globalAlpha = 1; }
      // 분할: 가운데 작은 점이 깜빡
      for (let j = 1; j < st.sub.length; j++) {
        if (st.mask[j] === 0) continue;
        const dt = ph - st.sub[j];
        if (dt >= 0 && dt < 0.25) circle(cx, cy, 5 + (1 - dt * 4) * 4, C.quiet);
      }
      const rr = r0 * (1 + 1.8 * (1 - ph));
      ctx.globalAlpha = st.playing ? 0.25 + 0.75 * ph : 0.5;
      circle(cx, cy, rr, null, beatColor(vN), vN === 3 ? 5 : 3.5);
      ctx.globalAlpha = 1;
      const shown = st.playing ? pulseOf(st, st.n) + 1 : 1;
      text(String(shown), cx, cy, Math.min(26, r0 * 0.9), f > 0.3 ? C.surface : C.ink, 700);
    }

    /* 5) 지휘 패턴 */
    function patternFor(st) {
      // 6/8은 6으로 젓고, 7/8(2+2+3) 같은 묶음은 묶음 단위로 젓기
      if (st.groups && st.groups.length > 1 && !(st.beats === 6 && st.unit === 8)) {
        const g = st.groups.length;
        const P = PAT[g] || genericPat(g);
        const starts = []; let acc = 0;
        st.groups.forEach(function (len) { starts.push(acc); acc += len; });
        return { P: P, seg: function (pos) {
          // 마디 안 위치 pos → (몇 번째 묶음, 그 안 진행)
          let i = 0;
          while (i < g - 1 && pos >= starts[i + 1]) i++;
          return [i, (pos - starts[i]) / st.groups[i]];
        }, ictus: starts };
      }
      const P = PAT[st.beats] || genericPat(st.beats);
      return { P: P, seg: function (pos) { const i = Math.floor(pos); return [i, pos - i]; }, ictus: null };
    }
    function bez(P, i, t, map) {
      const n = P.pts.length, a = P.pts[i], c2 = P.ctl[i], z = P.pts[(i + 1) % n], u = 1 - t;
      return map(u * u * a[0] + 2 * u * t * c2[0] + t * t * z[0], u * u * a[1] + 2 * u * t * c2[1] + t * t * z[1]);
    }
    function conduct(st) {
      const pf = patternFor(st), P = pf.P, n = P.pts.length;
      // 지휘 모양은 옆으로 넓게: 가로 · 세로 배율을 따로
      const sy = h * 0.45, sx = Math.min(w * 0.4, sy * 1.7), cx = w / 2, cy = h * 0.49;
      const map = function (x, y) { return [cx + x * sx, cy + y * sy]; };
      ctx.strokeStyle = C.dot; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i < n; i++) for (let k = 0; k <= 24; k++) {
        const q = bez(P, i, k / 24, map);
        if (i === 0 && k === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]);
      }
      ctx.stroke();
      const pos = st.playing ? st.pulse + st.ph : 0;
      const at = function (p) { const sg = pf.seg(mod(p, st.beats)); return bez(P, sg[0], sg[1], map); };
      ctx.lineCap = 'round';
      if (st.playing) for (let k = 0; k < 16; k++) {
        const A = at(pos - 0.45 * (k / 16)), B = at(pos - 0.45 * ((k + 1) / 16));
        ctx.strokeStyle = C.brand; ctx.globalAlpha = 1 - k / 16; ctx.lineWidth = 6 * (1 - k / 16) + 1;
        ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.lineCap = 'butt';
      const curSeg = pf.seg(mod(pos, st.beats))[0];
      for (let k = 0; k < n; k++) {
        const q = map(P.pts[k][0], P.pts[k][1]);
        const beatIdx = pf.ictus ? pf.ictus[k] : k;
        const isHit = st.playing && k === curSeg && (pf.ictus ? st.pulse === beatIdx : true);
        const hit = isHit ? flash(st) : 0, v = st.levels[beatIdx];
        circle(q[0], q[1], 4.5 + hit * 6, v === 3 ? C.accent : C.quiet);
        text(String(k + 1), q[0] + (P.pts[k][0] < -0.1 ? -14 : 14), q[1] + 12, 11, C.quiet, 500);
      }
      const d = at(pos);
      circle(d[0], d[1], 9, C.ink, C.surface, 3);
    }

    /* 6) 타이밍 코치 */
    function coach(st) {
      const co = st.coach || { taps: [] };
      const RANGE = 120, x0 = 22, x1 = w - 22, cxm = (x0 + x1) / 2, y = h * 0.56;
      const X = function (ms) { return cxm + Math.max(-1, Math.min(1, ms / RANGE)) * (x1 - x0) / 2; };
      ctx.fillStyle = C.good; ctx.globalAlpha = 0.14;
      ctx.fillRect(X(-15), y - h * 0.24, X(15) - X(-15), h * 0.48); ctx.globalAlpha = 1;
      line(x0, y, x1, y, C.line, 2);
      [-100, -50, 0, 50, 100].forEach(function (v) {
        line(X(v), y - (v === 0 ? h * 0.24 : 6), X(v), y + (v === 0 ? h * 0.24 : 6), v === 0 ? C.ink : C.dot, v === 0 ? 2.5 : 1.5);
        text(v === 0 ? '정확' : (v > 0 ? '+' : '−') + Math.abs(v), X(v), y + h * 0.33, 10, C.quiet, 500);
      });
      text('빠름', x0, y - h * 0.32, 11, C.quiet, 700, 'left');
      text('늦음', x1, y - h * 0.32, 11, C.quiet, 700, 'right');
      const taps = co.taps;
      taps.forEach(function (tp, i) {
        const last = i === taps.length - 1;
        ctx.globalAlpha = last ? 1 : 0.35 + 0.5 * (i / taps.length);
        circle(X(tp.ms), y, last ? 9 : 5.5, Math.abs(tp.ms) <= 15 ? C.good : C.accent, last ? C.surface : null, 3);
      });
      ctx.globalAlpha = 1;
      // 위쪽 한 줄: 방금 · 평균 · 흔들림 · 정확 비율
      if (taps.length) {
        const say = function (v) { return (Math.abs(v) < 0.5 ? '0' : (v > 0 ? '+' : '−') + Math.abs(v).toFixed(0)) + 'ms'; };
        const last = taps[taps.length - 1].ms;
        const avg = taps.reduce(function (a, x) { return a + x.ms; }, 0) / taps.length;
        const jit = Math.sqrt(taps.reduce(function (a, x) { return a + (x.ms - avg) * (x.ms - avg); }, 0) / taps.length);
        const good = Math.round(100 * taps.filter(function (x) { return Math.abs(x.ms) <= 20; }).length / taps.length);
        const parts = ['방금 ' + say(last), '평균 ' + say(avg), taps.length > 2 ? '흔들림 ±' + jit.toFixed(0) : '', '정확 ' + good + '%'].filter(Boolean);
        text(parts.join('   '), cxm, 14, 12, C.ink, 700);
      } else {
        text(co.msg || '화면을 박에 맞춰 누르거나, 마이크를 켜고 연주해 보세요', cxm, 14, 12, C.quiet, 500);
      }
      // 박 표시등
      const f = flash(st);
      circle(w - 12, h - 12, 5, f > 0 ? beatColor(lv(st, st.n)) : C.dot);
    }

    const DRAW = { highway: highway, orbit: orbit, bounce: bounce, ring: ring, conduct: conduct, coach: coach };
    return {
      resize: resize,
      colors: colors,
      draw: function (mode, st) {
        if (!w || !h) resize();
        ctx.clearRect(0, 0, w, h);
        (DRAW[mode] || highway)(st);
      }
    };
  }

  global.RHViz = { MODES: MODES, create: create };
})(window);
