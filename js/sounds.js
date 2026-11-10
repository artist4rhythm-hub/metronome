/* 리듬 하우스 메트로놈 — 음색 만들기
   녹음 파일 없이 계산으로 짧은 소리를 만들어 메모리에 올려 둡니다.
   음색마다 소리 하나를 만들고, 음높이는 재생할 때 바꿉니다(반음 단위, 0.1까지).
   '주파수'는 파일 없이 정한 Hz를 그대로 냅니다(엔진에서 처리). */
(function (global) {
  'use strict';

  // [id, 이름, 묶음, 한 줄 설명]
  // 메트로놈으로 쓰기 좋은 것만: 시작이 또렷하고 짧게 끝나는 소리
  const LIST = [
    ['click', '클릭', '기계음', '또렷한 기본'],
    ['tick', '틱', '기계음', '태엽 메트로놈'],
    ['beep', '삐', '기계음', '부드러운 전자음'],
    ['square', '삑', '기계음', '날카로운 전자음'],
    ['freq', '주파수', '기계음', 'Hz 직접 정하기'],
    ['wood', '우드블록', '타악기', '나무 소리'],
    ['clave', '클라베', '타악기', '높고 단단함'],
    ['sticks', '스틱', '타악기', '스틱 맞부딪침'],
    ['rim', '림샷', '타악기', '드럼 테두리'],
    ['cowbell', '카우벨', '타악기', '밴드에서 잘 들림'],
    ['hihat', '하이햇', '타악기', '분할에 잘 어울림'],
    ['marimba', '마림바', '타악기', '맑은 음정']
  ];
  // 예전 버전에 있던 소리 → 가장 비슷한 소리
  const RENAMED = { snare: 'rim', kick: 'wood', shaker: 'hihat', triangle: 'beep', bell: 'marimba' };

  // 소리 아이콘 (24×24, 선 그림)
  const ICON = {
    click: '<path d="M2 14 H8 L10 4 L13 20 L15 12 H22"/>',
    tick: '<path d="M8.5 21 L11 3 H13 L15.5 21 Z"/><path d="M12 17 L16.5 6.5"/><circle cx="15.3" cy="9.2" r="1.3"/>',
    beep: '<path d="M2 12 C4.5 4.5 7 4.5 9 12 S13.5 19.5 16 12 S20 4.5 22 12"/>',
    square: '<path d="M2 16 V8 H7 V16 H12 V8 H17 V16 H22 V8"/>',
    freq: '<path d="M9 3 V10 A3 3 0 0 0 15 10 V3"/><path d="M12 13 V21"/><path d="M18.5 5.5 Q20.5 8 18.5 10.5"/>',
    wood: '<rect x="3" y="7" width="18" height="10" rx="3.5"/><path d="M7 12 H17"/>',
    clave: '<path d="M4 14.5 L15 7" stroke-width="3"/><path d="M9 19 L20 11.5" stroke-width="3"/>',
    sticks: '<path d="M5 4 L19 20"/><path d="M19 4 L5 20"/><circle cx="5" cy="4" r="1.2"/><circle cx="19" cy="4" r="1.2"/>',
    rim: '<ellipse cx="11" cy="11" rx="8" ry="3"/><path d="M3 11 V17 A8 3 0 0 0 19 17 V11"/><path d="M13 9 L22 4"/>',
    cowbell: '<path d="M8.5 6 H15.5 L18.5 19 H5.5 Z"/><path d="M10 6 V3.5 H14 V6"/>',
    hihat: '<path d="M3 9.5 Q12 4 21 9.5"/><path d="M3 12 Q12 17.5 21 12"/><path d="M12 15 V22"/>',
    marimba: '<path d="M4 5 V19"/><path d="M8 6 V18"/><path d="M12 7 V17"/><path d="M16 8 V16"/><path d="M20 9 V15"/>'
  };
  function icon(id) {
    return '<svg class="snd-ic" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (ICON[id] || ICON.click) + '</svg>';
  }

  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296 * 2 - 1;
    };
  }

  const TAU = Math.PI * 2;
  const DUR = {
    click: 0.07, tick: 0.06, beep: 0.09, square: 0.08, wood: 0.12, clave: 0.09, rim: 0.12, sticks: 0.07,
    hihat: 0.1, cowbell: 0.22, marimba: 0.3
  };

  function generate(id, sr) {
    const noise = rng(id.charCodeAt(0) * 131 + id.length * 17);
    const n = Math.floor(sr * (DUR[id] || 0.12));
    const data = new Float32Array(n);
    let prev = 0;

    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let y = 0;
      switch (id) {
        case 'click':
          y = Math.sin(TAU * 1600 * t) * Math.exp(-t / 0.012) + noise() * 0.15 * Math.exp(-t / 0.003);
          break;
        case 'beep': {
          const env = t < 0.04 ? 1 : Math.exp(-(t - 0.04) / 0.012);
          y = Math.sin(TAU * 1000 * t) * env;
          break;
        }
        case 'tick': {
          // 태엽 메트로놈: 아주 짧은 나무 '딱' + 쇠 울림 조금
          y = noise() * 0.5 * Math.exp(-t / 0.0015) +
              Math.sin(TAU * 2350 * t) * 0.7 * Math.exp(-t / 0.006) +
              Math.sin(TAU * 4150 * t) * 0.35 * Math.exp(-t / 0.004) +
              Math.sin(TAU * 820 * t) * 0.45 * Math.exp(-t / 0.012);
          break;
        }
        case 'square': {
          // 거친 잡음 없이 또렷한 사각파 (홀수 배음만 더함)
          const env = t < 0.03 ? 1 : Math.exp(-(t - 0.03) / 0.01);
          let q = 0;
          for (let k = 1; k <= 9; k += 2) q += Math.sin(TAU * 1250 * k * t) / k;
          y = q * env;
          break;
        }
        case 'wood':
          y = (Math.sin(TAU * 900 * t) * 0.8 + Math.sin(TAU * 2070 * t) * 0.3) * Math.exp(-t / 0.025);
          break;
        case 'clave':
          y = (Math.sin(TAU * 2500 * t) + Math.sin(TAU * 3750 * t) * 0.2) * Math.exp(-t / 0.018);
          break;
        case 'rim':
          y = noise() * 0.6 * Math.exp(-t / 0.006) +
              Math.sin(TAU * 420 * t) * 0.7 * Math.exp(-t / 0.02) +
              Math.sin(TAU * 1680 * t) * 0.3 * Math.exp(-t / 0.008);
          break;
        case 'sticks':
          y = noise() * Math.sin(TAU * 3000 * t) * Math.exp(-t / 0.006) +
              Math.sin(TAU * 1800 * t) * 0.6 * Math.exp(-t / 0.01) +
              Math.sin(TAU * 3200 * t) * 0.4 * Math.exp(-t / 0.006);
          break;
        case 'hihat': {
          const x = noise();
          y = (x - prev) * Math.exp(-t / 0.03);
          prev = x;
          break;
        }
        case 'cowbell': {
          const env = Math.exp(-t / 0.05) * 0.7 + Math.exp(-t / 0.008) * 0.3;
          y = Math.tanh(2 * (Math.sin(TAU * 560 * t) + Math.sin(TAU * 845 * t))) * env * 0.6;
          break;
        }
        case 'marimba':
          y = (Math.sin(TAU * 660 * t) + Math.sin(TAU * 2640 * t) * 0.3 * Math.exp(-t / 0.02)) * Math.exp(-t / 0.08);
          break;
      }
      // 시작 0.5ms, 끝 5ms 부드럽게
      const fadeIn = Math.min(1, i / (sr * 0.0005));
      const fadeOut = Math.min(1, (n - i) / (sr * 0.005));
      data[i] = y * fadeIn * fadeOut;
    }

    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(data[i]));
    if (peak > 0) {
      const g = 0.9 / peak;
      for (let i = 0; i < n; i++) data[i] *= g;
    }
    return data;
  }

  function build(ctx) {
    const sr = ctx.sampleRate;
    const out = {};
    for (const item of LIST) {
      if (item[0] === 'freq') continue;
      const data = generate(item[0], sr);
      const buf = ctx.createBuffer(1, data.length, sr);
      buf.getChannelData(0).set(data);
      out[item[0]] = buf;
    }
    return out;
  }

  global.RHSounds = { LIST: LIST, build: build, icon: icon, RENAMED: RENAMED };
})(window);
