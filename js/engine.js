/* 리듬 하우스 메트로놈 — 소리 엔진
   화면 타이머가 아니라 오디오 시계로 박을 미리 예약합니다.
   25ms마다 깨어나서, 앞으로 0.12초 안에 울릴 박을 모두 예약해 둡니다.
   그래서 휴대폰이 바빠도 박이 밀리지 않습니다. */
(function (global) {
  'use strict';

  // 박 하나 안에서 분할 소리가 나는 위치 (0~1)
  const SUBDIV = {
    none: [],
    eighth: [1 / 2],
    triplet: [1 / 3, 2 / 3],
    sixteenth: [1 / 4, 2 / 4, 3 / 4],
    quintuplet: [1 / 5, 2 / 5, 3 / 5, 4 / 5],
    sextuplet: [1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6],
    shuffle: [2 / 3]
  };

  // 세기: 3 강 · 2 보통 · 1 약 · 0 끔
  const LEVEL_GAIN = { 3: 1.0, 2: 0.8, 1: 0.38 };

  // 백그라운드 탭에서도 느려지지 않는 타이머 (Worker)
  function makeTimer(ms, cb) {
    try {
      const src = 'let id=null;onmessage=function(e){if(e.data==="start"){if(!id)id=setInterval(function(){postMessage(0)},' + ms + ');}else{clearInterval(id);id=null;}};';
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const w = new Worker(url);
      w.onmessage = cb;
      return {
        start: function () { w.postMessage('start'); },
        stop: function () { w.postMessage('stop'); }
      };
    } catch (e) {
      let id = null;
      return {
        start: function () { if (!id) id = setInterval(cb, ms); },
        stop: function () { clearInterval(id); id = null; }
      };
    }
  }

  function Engine() {
    this.ctx = null;
    this.master = null;
    this.buffers = null;
    this.timer = null;
    this.state = {
      bpm: 96, beats: 4, accents: [3, 2, 2, 2], subdiv: 'none',
      // 분할 패턴: 박 안의 자리마다 1 소리 · 0 쉼표 (첫 자리는 박 자체)
      pattern: null,
      // 연습 모드: every(간격) · unit('min' 분 | 'bar' 마디) · step(올릴 BPM) · target(목표 BPM)
      practice: null,
      poly: { on: false, n: 3 },
      beatVol: 1, subVol: 0.6, polyVol: 0.7,
      // 타이밍별 소리: sound(음색) · pitch(반음) · hz(주파수일 때) · wave(파형)
      voices: {
        accent: { sound: 'click', pitch: 4, hz: 1500, wave: 'sine' },
        beat: { sound: 'click', pitch: 0, hz: 1000, wave: 'sine' },
        sub: { sound: 'hihat', pitch: 0, hz: 1800, wave: 'sine' },
        poly: { sound: 'click', pitch: -6, hz: 700, wave: 'sine' }
      }
    };
    this.playing = false;
    this.lookahead = 0.12;
    this.interval = 25;
    this.nextTime = 0;
    this.pulse = 0;
    this.bar = 0;
    this.scheduled = []; // 예약된 소리 (멈출 때 끄기 위해)
    this.events = [];    // 화면 표시용 박 목록
    this.onSchedule = null; // 시험용
    // 곡 지도 재생: 마디 목록을 차례로 연주
    this.program = null;
    this.barIndex = 0;
    this.finishAt = 0;
    this.onEnd = null;
    this.count = 0; // 시작부터 몇 번째 박인지 (진자 방향)
    // 연습 모드 기준점: 이 시각(마디)부터 base BPM에서 올라감
    this.pr = null;
    this.stopAtBarEnd = false; // 다음 마디 끝에서 멈춤 (연습 타이머)
    this.startedAt = 0;
    // 합주 모드: 박 k의 시각 · 박자를 바깥(공통 시계 시간표)에서 받아서 침
    this.follow = null;
    this.k = 0;
  }

  Engine.prototype.init = async function () {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) throw new Error('no-audio');
    // 아이폰 무음 스위치가 켜져 있어도 소리가 나게 (사파리 웹 · 홈 화면 앱)
    // 앱(Capacitor) 안에서는 네이티브 쪽에서 "재생 + 다른 앱 소리와 섞기"로 설정하므로 건드리지 않음
    const native = global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform();
    if (!native) { try { if (global.navigator.audioSession) global.navigator.audioSession.type = 'playback'; } catch (e) { /* 무시 */ } }
    this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.buffers = global.RHSounds.build(this.ctx);
    // 아이폰 소리 잠금 풀기: 아주 짧은 무음을 한 번 재생
    const b = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    s.connect(this.master);
    s.start(0);
    const self = this;
    this.timer = makeTimer(this.interval, function () { self.tick(); });
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  };

  Engine.prototype.set = function (patch) {
    Object.assign(this.state, patch);
    // 재생 중에 손으로 빠르기를 바꾸면, 연습 모드는 그 빠르기부터 다시 셈
    if (this.playing && !this.program && (patch.bpm != null || patch.practice !== undefined)) this.resetPractice(this.nextTime);
    if (!this.program && this.pulse >= this.state.beats) this.pulse = 0;
  };

  Engine.prototype.start = function () {
    if (!this.ctx || this.playing) return;
    this.program = null;
    this.finishAt = 0;
    this.stopAtBarEnd = false;
    this.playing = true;
    this.pulse = 0;
    this.bar = 0;
    this.events = [];
    this.count = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.startedAt = this.nextTime;
    this.resetPractice(this.nextTime);
    this.timer.start();
    this.tick();
  };

  // 곡 지도 재생 시작. bars = [{beats, accents, bpm0, bpm1, countIn}, ...]
  Engine.prototype.startProgram = function (bars, onEnd) {
    if (!this.ctx || !bars || !bars.length) return;
    if (this.playing) this.stop();
    this.program = bars;
    this.barIndex = 0;
    this.finishAt = 0;
    this.onEnd = onEnd || null;
    this.playing = true;
    this.pulse = 0;
    this.bar = 0;
    this.events = [];
    this.count = 0;
    this.pr = null;
    this.stopAtBarEnd = false;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.startedAt = this.nextTime;
    this.timer.start();
    this.tick();
  };

  Engine.prototype.resetPractice = function (t) {
    const pr = this.state.practice;
    this.pr = pr && pr.on && pr.step > 0 ? { base: this.state.bpm, t0: t, bar0: this.bar, steps: 0 } : null;
  };

  // 연습 모드: 지금 마디의 빠르기 (마디 첫 박에서만 바뀜)
  Engine.prototype.practiceBpm = function (t) {
    const pr = this.state.practice, x = this.pr;
    if (!x || !pr) return this.state.bpm;
    const done = pr.unit === 'bar' ? (this.bar - x.bar0) : (t - x.t0 + 1e-6) / 60;
    let steps = Math.floor(done / Math.max(1, pr.every));
    let bpm = x.base + steps * pr.step;
    if (pr.target && bpm > pr.target) bpm = Math.max(x.base, pr.target);
    x.steps = steps;
    return Math.min(400, bpm);
  };

  // 다음에 템포가 올라가는 때 (화면 표시용): {sec | bars, next}
  Engine.prototype.practiceInfo = function (now) {
    const pr = this.state.practice, x = this.pr;
    if (!this.playing || !x || !pr) return null;
    const cur = this.state.bpm;
    const reached = pr.target && cur >= pr.target;
    const next = Math.min(pr.target || 400, cur + pr.step);
    if (pr.unit === 'bar') {
      const left = (x.bar0 + (Math.floor((this.bar - x.bar0) / pr.every) + 1) * pr.every) - this.bar;
      return { bars: left, next: next, reached: reached };
    }
    const k = Math.floor((now - x.t0) / 60 / pr.every) + 1;
    return { sec: Math.max(0, x.t0 + k * pr.every * 60 - now), next: next, reached: reached };
  };

  // 이번 마디가 끝나면 멈추기 (연습 시간 타이머)
  Engine.prototype.finishBar = function (onEnd) {
    if (!this.playing || this.program) return;
    this.stopAtBarEnd = true;
    this.onEnd = onEnd || null;
  };

  // 합주 모드 시작: follow(k) → { t(오디오 시각), pulse, beats, levels, d, bpm, subdiv, pattern, countIn, barIndex } 또는 null(끝)
  Engine.prototype.startFollow = function (follow, k, onEnd) {
    if (!this.ctx) return;
    if (this.playing) this.stop();
    this.follow = follow;
    this.k = k;
    this.program = null;
    this.finishAt = 0;
    this.stopAtBarEnd = false;
    this.pr = null;
    this.onEnd = onEnd || null;
    this.playing = true;
    this.events = [];
    this.count = k;
    this.lastEnd = 0;
    this.startedAt = this.ctx.currentTime;
    this.timer.start();
    this.tick();
  };
  Engine.prototype.tickFollow = function (now) {
    const ahead = now + this.lookahead;
    for (let guard = 0; guard < 64; guard++) {
      const b = this.follow(this.k);
      if (!b) { this.finishAt = Math.max(now, this.lastEnd || now); return; }
      if (b.t > ahead) return;
      if (b.t >= now - 0.015) this.scheduleFollow(b, this.k);
      this.lastEnd = b.t + b.d;
      this.k++;
    }
  };
  Engine.prototype.scheduleFollow = function (b, k) {
    const st = this.state, t = b.t, d = b.d;
    const level = b.countIn ? 2 : (b.level == null ? 2 : b.level);
    const pat = b.pattern;
    if (b.countIn) {
      this.play('sub', t, (b.pulse === 0 ? 1.0 : 0.75) * st.beatVol);
    } else {
      if (level > 0 && !(pat && pat[0] === 0)) this.play(level === 3 ? 'accent' : 'beat', t, LEVEL_GAIN[level] * st.beatVol);
      const offsets = SUBDIV[b.subdiv] || [];
      for (let j = 0; j < offsets.length; j++) {
        if (pat && pat[j + 1] === 0) continue;
        this.play('sub', t + offsets[j] * d, 0.55 * st.subVol);
      }
      if (b.pulse === 0 && st.poly && st.poly.on && st.poly.n > 0) {
        for (let i = 0; i < st.poly.n; i++) this.play('poly', t + i * b.beats * d / st.poly.n, 0.7 * st.polyVol);
      }
    }
    this.events.push({
      time: t, pulse: b.pulse, bar: b.bar || 0, level: level, barIndex: b.barIndex == null ? null : b.barIndex,
      countIn: !!b.countIn, dur: d, n: k, bpm: b.bpm, beats: b.beats, levels: b.levels, follow: true, prog: !!b.prog
    });
    if (this.onSchedule) this.onSchedule({ time: t, pulse: b.pulse, bar: b.bar || 0, barIndex: b.barIndex, level: level, bpm: b.bpm, countIn: !!b.countIn, k: k, shared: b.shared, subs: [], poly: [] });
  };

  Engine.prototype.stop = function () {
    if (!this.playing) return;
    this.playing = false;
    this.follow = null;
    this.program = null;
    this.finishAt = 0;
    this.stopAtBarEnd = false;
    this.pr = null;
    this.onEnd = null;
    if (this.timer) this.timer.stop();
    const now = this.ctx.currentTime;
    for (const item of this.scheduled) {
      if (item.time > now) {
        try { item.src.stop(0); } catch (e) { /* 이미 끝남 */ }
      }
    }
    this.scheduled = [];
    this.events = [];
  };

  Engine.prototype.tick = function () {
    if (!this.playing) return;
    const now = this.ctx.currentTime;
    // 곡이 끝났으면 마지막 박이 울린 뒤 멈춤
    if (this.finishAt) {
      if (now >= this.finishAt) {
        const cb = this.onEnd;
        this.stop();
        if (cb) cb();
      }
      return;
    }
    if (this.follow) {
      this.tickFollow(now);
      if (this.scheduled.length > 200) this.scheduled = this.scheduled.filter(function (x) { return x.time > now - 1; });
      return;
    }
    // 탭이 오래 멈췄다가 돌아오면 지난 박은 건너뜀
    if (this.nextTime < now - 0.2) this.nextTime = now + 0.05;
    const ahead = now + this.lookahead;
    while (this.playing && !this.finishAt && this.nextTime < ahead) {
      this.schedulePulse(this.nextTime);
    }
    // 끝난 소리 목록 정리
    if (this.scheduled.length > 200) {
      this.scheduled = this.scheduled.filter(function (x) { return x.time > now - 1; });
    }
  };

  Engine.prototype.schedulePulse = function (t) {
    const st = this.state;
    let beats = st.beats, accents = st.accents, bpm = st.bpm, countIn = false;
    let p = this.pulse;
    const prog = this.program ? this.program[this.barIndex] : null;
    if (prog) {
      beats = prog.beats;
      accents = prog.accents;
      countIn = !!prog.countIn;
      if (p >= beats) p = 0;
      // 점점 빠르게 · 느리게: 마디 안에서 박마다 조금씩
      bpm = prog.bpm0 + (prog.bpm1 - prog.bpm0) * (p / beats);
    } else {
      if (p >= beats) p = 0;
      if (p === 0 && this.pr) {
        const nb = this.practiceBpm(t);
        if (nb !== st.bpm) { st.bpm = nb; bpm = nb; }
      }
    }
    const d = 60 / bpm;
    const level = accents[p] == null ? 2 : accents[p];
    const log = this.onSchedule ? {
      time: t, pulse: p, bar: this.bar, barIndex: prog ? this.barIndex : null,
      level: level, bpm: bpm, countIn: countIn, subs: [], poly: []
    } : null;

    const pat = st.pattern;
    if (countIn) {
      // 카운트인: 높고 짧은 클릭, 첫 박은 조금 더 크게
      this.play('sub', t, (p === 0 ? 1.0 : 0.75) * st.beatVol);
    } else {
      if (level > 0 && !(pat && pat[0] === 0)) {
        this.play(level === 3 ? 'accent' : 'beat', t, LEVEL_GAIN[level] * st.beatVol);
      }
      const offsets = SUBDIV[st.subdiv] || [];
      for (let k = 0; k < offsets.length; k++) {
        if (pat && pat[k + 1] === 0) continue;
        const ts = t + offsets[k] * d;
        this.play('sub', ts, 0.55 * st.subVol);
        if (log) log.subs.push(ts);
      }
      if (p === 0 && st.poly && st.poly.on && st.poly.n > 0) {
        const barDur = beats * d;
        for (let i = 0; i < st.poly.n; i++) {
          const tp = t + i * barDur / st.poly.n;
          this.play('poly', tp, 0.7 * st.polyVol);
          if (log) log.poly.push(tp);
        }
      }
    }

    this.events.push({
      time: t, pulse: p, bar: this.bar, level: countIn ? 2 : level,
      barIndex: prog ? this.barIndex : null, countIn: countIn,
      dur: d, n: this.count++, bpm: bpm
    });
    if (log) this.onSchedule(log);

    this.pulse = p + 1;
    this.nextTime = t + d;
    if (this.pulse >= beats) {
      this.pulse = 0;
      this.bar++;
      if (this.program) {
        this.barIndex++;
        if (this.barIndex >= this.program.length) this.finishAt = this.nextTime;
      } else if (this.stopAtBarEnd) {
        this.finishAt = this.nextTime;
      }
    }
  };

  // role: accent(강) · beat(보통 · 약) · sub(분할 · 카운트인) · poly(폴리리듬)
  Engine.prototype.play = function (role, time, gain) {
    if (gain <= 0) return;
    const v = (this.state.voices && this.state.voices[role]) || { sound: 'click', pitch: 0 };
    const at = Math.max(time, this.ctx.currentTime);
    const g = this.ctx.createGain();
    g.connect(this.master);
    let src;
    if (v.sound === 'freq') {
      // 정한 주파수 그대로: 2ms 올라가고 70ms 동안 사라짐
      src = this.ctx.createOscillator();
      src.type = v.wave || 'sine';
      src.frequency.value = Math.min(8000, Math.max(40, v.hz || 1000));
      const peak = gain * (v.wave === 'square' || v.wave === 'sawtooth' ? 0.35 : 0.8);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak, at + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
      src.connect(g);
      src.start(at);
      src.stop(at + 0.08);
    } else {
      src = this.ctx.createBufferSource();
      src.buffer = this.buffers[v.sound] || this.buffers.click;
      src.playbackRate.value = Math.pow(2, (v.pitch || 0) / 12);
      g.gain.value = gain;
      src.connect(g);
      src.start(at);
    }
    this.scheduled.push({ src: src, time: time });
  };

  // 한 타이밍 소리 미리 듣기
  Engine.prototype.previewRole = function (role) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.03;
    const vol = role === 'sub' ? this.state.subVol : role === 'poly' ? this.state.polyVol : this.state.beatVol;
    this.play(role, t, (role === 'accent' ? 1 : 0.8) * vol);
  };

  // 화면에 보여 줄 박: 시각이 지난 것 중 가장 최근 것
  Engine.prototype.takeDue = function (now) {
    let last = null;
    while (this.events.length && this.events[0].time <= now) {
      last = this.events.shift();
    }
    return last;
  };

  // 음색 미리 듣기
  Engine.prototype.preview = function () {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.03;
    this.play('accent', t, LEVEL_GAIN[3] * this.state.beatVol);
    this.play('beat', t + 0.3, LEVEL_GAIN[2] * this.state.beatVol);
    this.play('beat', t + 0.6, LEVEL_GAIN[2] * this.state.beatVol);
  };

  global.RHEngine = Engine;
  global.RH_SUBDIV = SUBDIV;
})(window);
