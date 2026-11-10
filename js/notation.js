/* 리듬 하우스 메트로놈 — 음표 그림
   1) 분할 버튼 · 칩에 들어가는 작은 음표 아이콘
   2) 홈의 "악보" 보기: 종이 위 한 마디 악보 + 연필 커서가 소리에 맞춰 지나감 */
(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';

  // 분할 → 박 하나 안의 음 위치
  const POS = {
    none: [0],
    eighth: [0, 1 / 2],
    triplet: [0, 1 / 3, 2 / 3],
    sixteenth: [0, 1 / 4, 2 / 4, 3 / 4],
    quintuplet: [0, 1 / 5, 2 / 5, 3 / 5, 4 / 5],
    sextuplet: [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6],
    shuffle: [0, 2 / 3]
  };
  const TUPLET = { triplet: '3', quintuplet: '5', sextuplet: '6', shuffle: '3' };

  // 꼬리(빔) 개수: 박 단위와 분할 수로 정함
  function beamCount(unit, subdiv) {
    const n = subdiv === 'shuffle' ? 2 : POS[subdiv].length;
    let base = unit === 8 ? 1 : 0;
    if (n >= 2) base += 1;
    if (n >= 4) base += 1;
    return base;
  }

  function el(name, attrs) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function head(svg, x, y, cls) {
    svg.appendChild(el('ellipse', { cx: x, cy: y, rx: 5.6, ry: 4.1, transform: 'rotate(-22 ' + x + ' ' + y + ')', class: cls || 'nh' }));
  }

  // 쉼표: 꼬리 수 0 → 4분쉼표, 1 → 8분쉼표, 2 → 16분쉼표
  function rest(svg, x, y, flags, cls, big) {
    const k = big ? 1.25 : 1;
    if (flags === 0) {
      svg.appendChild(el('path', {
        d: 'M ' + (x - 1) + ' ' + (y - 11 * k) + ' l ' + (4 * k) + ' ' + (5 * k) + ' l ' + (-4 * k) + ' ' + (4 * k) + ' l ' + (4 * k) + ' ' + (5 * k) + ' q ' + (-5 * k) + ' ' + (-1 * k) + ' ' + (-2 * k) + ' ' + (5 * k),
        class: 'rq ' + (cls || '')
      }));
      return;
    }
    const top = y - 8 * k;
    svg.appendChild(el('line', { x1: x + 3 * k, y1: top, x2: x - 1 * k, y2: y + 6 * k, class: 'rs ' + (cls || '') }));
    for (let i = 0; i < flags; i++) {
      const fy = top + i * 5 * k;
      svg.appendChild(el('circle', { cx: x - 1.5 * k - i * 1.2 * k, cy: fy + 1.5 * k, r: 1.9 * k, class: 'rd ' + (cls || '') }));
      svg.appendChild(el('path', { d: 'M ' + (x - 1.5 * k - i * 1.2 * k) + ' ' + (fy + 2.8 * k) + ' Q ' + (x + 1 * k) + ' ' + (fy + 3.2 * k) + ' ' + (x + 3 * k - i * 1.2 * k) + ' ' + (fy), class: 'rf ' + (cls || '') }));
    }
  }

  // 한 묶음 그리기: 음 자리 xs, 소리 mask(1/0), 꼬리 수 beams
  // m: 크기 { stemX, beamH, beamGap, headCls }
  function drawGroup(svg, xs, mask, y, top, beams, m, mainIdx) {
    const notes = [];
    xs.forEach(function (x, i) {
      if (mask[i] === 0) {
        rest(svg, x + 2, y, beams, '', m.big);
        return;
      }
      head(svg, x, y, (mainIdx && mainIdx(i)) ? 'nh main' : 'nh');
      svg.appendChild(el('line', { x1: x + m.stemX, y1: y - 1.5, x2: x + m.stemX, y2: top, class: 'ns' }));
      notes.push(x);
    });
    if (beams > 0 && notes.length > 1) {
      for (let b = 0; b < beams; b++) {
        svg.appendChild(el('rect', { x: notes[0] + m.stemX - 0.7, y: top + b * m.beamGap, width: notes[notes.length - 1] - notes[0] + 1.4, height: m.beamH, class: m.beamCls }));
      }
    } else if (beams > 0 && notes.length === 1) {
      for (let b = 0; b < beams; b++) {
        svg.appendChild(el('path', { d: 'M ' + (notes[0] + m.stemX) + ' ' + (top + b * m.beamGap) + ' q ' + (m.big ? 9 : 6) + ' ' + (m.big ? 5 : 3) + ' ' + (m.big ? 4 : 3) + ' ' + (m.big ? 14 : 9), class: m.flagCls }));
      }
    }
  }

  function fullMask(n) { return new Array(n).fill(1); }

  /* ---------- 1) 작은 아이콘 (세로 40: 위쪽은 잇단음 숫자 자리) ---------- */
  function icon(subdiv, pattern) {
    const pos = POS[subdiv] || POS.none;
    const n = pos.length;
    const mask = subdiv === 'shuffle' ? [1, 0, 1] : (pattern && pattern.length === n ? pattern : fullMask(n));
    const slots = subdiv === 'shuffle' ? 3 : n;
    // 음이 많으면 아이콘을 넓혀서 머리끼리 겹치지 않게
    const W = slots <= 3 ? 44 : 10 * slots + 12;
    const svg = el('svg', { viewBox: '0 0 ' + W + ' 40', width: String(W), height: '40', 'aria-hidden': 'true', class: 'note-icon' });
    const y = 33, top = 14;
    const w = slots === 1 ? 0 : (slots === 2 ? 18 : slots === 3 ? 30 : 10 * (slots - 1));
    const x0 = W / 2 - w / 2 - 2.5;
    const xs = [];
    for (let i = 0; i < slots; i++) xs.push(slots === 1 ? W / 2 - 2.5 : x0 + w * i / (slots - 1));
    drawGroup(svg, xs, mask, y, top, beamCount(4, subdiv === 'shuffle' ? 'triplet' : subdiv), { stemX: 4.9, beamH: 2.8, beamGap: 4.6, beamCls: 'nb', flagCls: 'nf' });
    if (TUPLET[subdiv]) {
      // 악보처럼: 묶음 한가운데, 꼬리(빔) 바로 위
      const cx = (xs[0] + xs[xs.length - 1]) / 2 + 4.9;
      const t = el('text', { x: cx, y: top - 3, 'text-anchor': 'middle', class: 'nt' });
      t.textContent = TUPLET[subdiv];
      svg.appendChild(t);
    }
    return svg;
  }

  // 패턴 편집 칸: 음표 하나 또는 쉼표 하나 (크게)
  function slot(on, flags) {
    const svg = el('svg', { viewBox: '0 0 30 38', width: '30', height: '38', 'aria-hidden': 'true', class: 'note-icon slot-icon' });
    if (on) {
      head(svg, 12, 30);
      svg.appendChild(el('line', { x1: 16.9, y1: 28.5, x2: 16.9, y2: 5, class: 'ns' }));
      for (let i = 0; i < flags; i++) {
        svg.appendChild(el('path', { d: 'M 16.9 ' + (5 + i * 6) + ' q 7 4 4 12', class: 'nf' }));
      }
    } else {
      rest(svg, 14, 21, flags, '', true);
    }
    return svg;
  }

  // 박자표 (위아래로 쌓은 숫자)
  function timeSig(beats, unit) {
    const span = document.createElement('span');
    span.className = 'ts';
    span.setAttribute('aria-hidden', 'true');
    const a = document.createElement('b'); a.textContent = beats;
    const b = document.createElement('b'); b.textContent = unit;
    span.appendChild(a); span.appendChild(b);
    return span;
  }

  /* ---------- 2) 종이 악보 한 마디 ---------- */
  // 결과: { svg, notes: [{pulse, el}], x(pulse, phase) }
  function score(opts) {
    const beats = opts.beats, unit = opts.unit, subdiv = opts.subdiv, accents = opts.accents;
    const grouping = opts.grouping;
    const W = 360, H = 120, mid = 70;
    const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'score-svg', role: 'img' });
    svg.setAttribute('aria-label', beats + '/' + unit + ' 박자 한 마디 악보');

    svg.appendChild(el('rect', { x: 1, y: 1, width: W - 2, height: H - 2, rx: 12, class: 'paper' }));
    // 오선 (가운데 줄에 음표)
    for (let i = -2; i <= 2; i++) {
      svg.appendChild(el('line', { x1: 14, y1: mid + i * 10, x2: W - 14, y2: mid + i * 10, class: i === 0 ? 'staff mid' : 'staff' }));
    }
    svg.appendChild(el('line', { x1: W - 14, y1: mid - 20, x2: W - 14, y2: mid + 20, class: 'bar' }));
    svg.appendChild(el('line', { x1: 14, y1: mid - 20, x2: 14, y2: mid + 20, class: 'bar thin' }));

    // 박자표
    const t1 = el('text', { x: 32, y: mid - 2, 'text-anchor': 'middle', class: 'tsig' }); t1.textContent = beats;
    const t2 = el('text', { x: 32, y: mid + 19, 'text-anchor': 'middle', class: 'tsig' }); t2.textContent = unit;
    svg.appendChild(t1); svg.appendChild(t2);

    const x0 = 56, x1 = W - 22;
    const beatW = (x1 - x0) / beats;
    const pad = Math.min(10, beatW * 0.18);
    const X = function (pulse, phase) { return x0 + pad + (pulse + phase) * beatW; };
    const pos = POS[subdiv] || POS.none;
    const beams = beamCount(unit, subdiv);
    const top = mid - 38;

    // 꼬리를 이을 묶음: 4분 단위는 박마다, 8분 단위는 묶음(2+2+3 등)마다
    const groups = [];
    if (unit === 8) {
      const g = grouping || [beats];
      let start = 0;
      g.forEach(function (len) { groups.push([start, Math.min(beats, start + len) - 1]); start += len; });
    } else {
      for (let i = 0; i < beats; i++) groups.push([i, i]);
    }

    const mask = opts.pattern && opts.pattern.length === pos.length ? opts.pattern : fullMask(pos.length);
    const notes = [];
    const layer = el('g', { class: 'notes' });
    svg.appendChild(layer);
    const M = { stemX: 4.9, beamH: 3.6, beamGap: 6, beamCls: 'beam', flagCls: 'flag', big: true };
    groups.forEach(function (gr) {
      // 묶음 안의 모든 자리를 한 줄로: 꼬리는 소리 나는 음끼리 이음
      const g = el('g', { class: 'grp' });
      const xs = [], mk = [];
      for (let p = gr[0]; p <= gr[1]; p++) {
        pos.forEach(function (o, k) { xs.push(X(p, o)); mk.push(mask[k]); });
      }
      layer.appendChild(g);
      for (let p = gr[0]; p <= gr[1]; p++) {
        const ng = el('g', { class: 'note-g' + (accents[p] === 0 ? ' muted' : '') });
        const sx = [], sm = [];
        pos.forEach(function (o, k) { sx.push(X(p, o)); sm.push(mask[k]); });
        if (unit === 8) {
          // 8분 박자: 박마다 머리 · 쉼표만 그리고 꼬리는 묶음 전체에서
          sx.forEach(function (x, k) {
            if (sm[k] === 0) { rest(ng, x + 2, mid, beams, '', true); return; }
            head(ng, x, mid, k === 0 ? 'nh main' : 'nh');
            ng.appendChild(el('line', { x1: x + 4.9, y1: mid - 1.5, x2: x + 4.9, y2: top, class: 'ns' }));
          });
        } else {
          drawGroup(ng, sx, sm, mid, top, beams, M, function (i) { return i === 0; });
        }
        if (accents[p] === 3) {
          ng.appendChild(el('path', { d: 'M ' + (X(p, 0) - 6) + ' ' + (mid + 22) + ' l 12 4 l -12 4', class: 'acc' }));
        }
        if (TUPLET[subdiv]) {
          const tx = el('text', { x: (X(p, 0) + X(p, pos[pos.length - 1])) / 2 + 4.9, y: top - 5, 'text-anchor': 'middle', class: 'tup' });
          tx.textContent = TUPLET[subdiv];
          ng.appendChild(tx);
        }
        g.appendChild(ng);
        notes.push({ pulse: p, el: ng });
      }
      if (unit === 8) {
        const on = xs.filter(function (_, i) { return mk[i] !== 0; });
        if (beams > 0 && on.length > 1) {
          for (let b = 0; b < beams; b++) {
            g.appendChild(el('rect', { x: on[0] + 4.2, y: top + b * 6, width: on[on.length - 1] - on[0] + 1.4, height: 3.6, class: 'beam' }));
          }
        } else if (beams > 0 && on.length === 1) {
          g.appendChild(el('path', { d: 'M ' + (on[0] + 4.9) + ' ' + top + ' q 9 5 4 16', class: 'flag' }));
        }
      }
    });

    // 연필 커서
    const cursor = el('line', { x1: X(0, 0), y1: 16, x2: X(0, 0), y2: H - 14, class: 'pencil' });
    svg.appendChild(cursor);
    return { svg: svg, notes: notes, X: X, cursor: cursor };
  }

  global.RHNotation = { icon: icon, timeSig: timeSig, score: score, slot: slot };
})(window);
