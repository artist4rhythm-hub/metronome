/* 리듬 하우스 메트로놈 — 곡 지도 (F10)
   곡 = 구간 블록 목록. 구간마다 마디 수 · 박자 · 빠르기 · 반복 · 점점 빠르게/느리게.
   재생하면 카운트인(클릭) 뒤 구간을 차례로 연주하고, 지금 구간을 크게 보여 줍니다. */
(function () {
  'use strict';

  const RH = window.RH;
  const $ = function (id) { return document.getElementById(id); };
  const KEY = 'rhm.songs.v1';

  const NAMES = ['인트로', '벌스', '프리코러스', '코러스', '브리지', '간주', '엔딩'];
  const COLOR = { '인트로': 'c1', '벌스': 'c2', '프리코러스': 'c3', '코러스': 'c4', '브리지': 'c5', '간주': 'c6', '엔딩': 'c7', '아웃트로': 'c7' };

  let songs = load();
  let currentId = null;
  let openSec = null;        // 펼친 구간
  let pendingDelete = false;
  let playingBars = null;    // 재생 중인 마디 목록

  function uid() { return Math.random().toString(36).slice(2, 9); }

  function sampleSong() {
    return {
      id: uid(), name: '예시 곡 · 연습용', countIn: 1, sample: true, updated: Date.now(),
      sections: [
        { id: uid(), name: '인트로', bars: 4, beats: 4, unit: 4, bpm: 92, repeat: 1, bpmTo: null },
        { id: uid(), name: '벌스', bars: 8, beats: 4, unit: 4, bpm: 92, repeat: 1, bpmTo: null },
        { id: uid(), name: '코러스', bars: 8, beats: 4, unit: 4, bpm: 92, repeat: 2, bpmTo: null },
        { id: uid(), name: '브리지', bars: 4, beats: 6, unit: 8, bpm: 132, repeat: 1, bpmTo: null },
        { id: uid(), name: '엔딩', bars: 4, beats: 4, unit: 4, bpm: 92, repeat: 1, bpmTo: 72 }
      ]
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const v = JSON.parse(raw);
        if (Array.isArray(v)) return v;
      }
    } catch (e) { /* 저장소를 못 쓰면 예시 곡만 */ }
    return [sampleSong()];
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(songs)); } catch (e) { /* 무시 */ }
  }

  function current() { return songs.find(function (s) { return s.id === currentId; }) || null; }
  function colorOf(name) { return COLOR[name] || 'c0'; }
  function noteOf(unit) { return unit === 8 ? '♪' : '♩'; }

  /* ---------- 곡을 마디 목록으로 ---------- */
  function buildBars(song) {
    const bars = [];
    const secs = song.sections;
    if (!secs.length) return bars;
    const first = secs[0];
    for (let c = 0; c < song.countIn; c++) {
      bars.push({
        beats: first.beats, accents: new Array(first.beats).fill(2),
        bpm0: first.bpm, bpm1: first.bpm, countIn: true,
        sec: -1, barNo: c + 1, barTotal: song.countIn, rep: 1, reps: 1
      });
    }
    secs.forEach(function (s, si) {
      const grouping = RH.defaultGrouping(s.beats, s.unit);
      const acc = RH.accentsFor(s.beats, grouping);
      const total = s.bars * s.repeat;
      const end = s.bpmTo || s.bpm;
      let k = 0;
      for (let r = 0; r < s.repeat; r++) {
        for (let b = 0; b < s.bars; b++) {
          bars.push({
            beats: s.beats, accents: acc,
            bpm0: s.bpm + (end - s.bpm) * (k / total),
            bpm1: s.bpm + (end - s.bpm) * ((k + 1) / total),
            countIn: false, sec: si, barNo: b + 1, barTotal: s.bars, rep: r + 1, reps: s.repeat
          });
          k++;
        }
      }
    });
    return bars;
  }

  function summary(song) {
    const bars = buildBars(Object.assign({}, song, { countIn: 0 }));
    let sec = 0;
    bars.forEach(function (b) { sec += b.beats * 60 / ((b.bpm0 + b.bpm1) / 2); });
    const m = Math.floor(sec / 60), s = Math.round(sec % 60);
    return { bars: bars.length, time: (m ? m + '분 ' : '') + s + '초' };
  }

  function secInfo(s) {
    let t = s.bars + '마디';
    if (s.repeat > 1) t += ' × ' + s.repeat;
    t += ' · ' + s.beats + '/' + s.unit + ' · ' + noteOf(s.unit) + '=' + s.bpm;
    if (s.bpmTo && s.bpmTo !== s.bpm) t += (s.bpmTo > s.bpm ? ' → 점점 빠르게 ' : ' → 점점 느리게 ') + s.bpmTo;
    return t;
  }

  /* ---------- 곡 목록 ---------- */
  function openSongs() {
    stopIfSong();
    currentId = null;
    renderList();
    RH.setView('songs');
  }

  function renderList() {
    const ul = $('songList');
    ul.innerHTML = '';
    if (!songs.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = '아직 곡이 없어요. "+ 새 곡"으로 첫 곡을 만들어 보세요.';
      ul.appendChild(li);
      return;
    }
    songs.slice().sort(function (a, b) { return b.updated - a.updated; }).forEach(function (song) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'song-card';
      const sm = summary(song);
      const strip = document.createElement('span');
      strip.className = 'strip';
      strip.setAttribute('aria-hidden', 'true');
      song.sections.forEach(function (s) {
        const seg = document.createElement('span');
        seg.className = 'seg-' + colorOf(s.name);
        seg.style.flexGrow = String(s.bars * s.repeat);
        strip.appendChild(seg);
      });
      const name = document.createElement('span');
      name.className = 'song-card-name';
      name.textContent = song.name || '이름 없는 곡';
      const meta = document.createElement('span');
      meta.className = 'song-card-meta';
      meta.textContent = song.sections.length + '구간 · ' + sm.bars + '마디 · 약 ' + sm.time;
      b.appendChild(name);
      b.appendChild(meta);
      b.appendChild(strip);
      b.addEventListener('click', function () { openEditor(song.id); });
      li.appendChild(b);
      ul.appendChild(li);
    });
  }

  $('newSong').addEventListener('click', function () {
    const song = {
      id: uid(), name: '새 곡', countIn: 1, updated: Date.now(),
      sections: [{ id: uid(), name: '인트로', bars: 4, beats: 4, unit: 4, bpm: 96, repeat: 1, bpmTo: null }]
    };
    songs.push(song);
    save();
    openEditor(song.id, true);
  });

  /* ---------- 곡 편집 ---------- */
  function openEditor(id, focusName) {
    currentId = id;
    openSec = null;
    pendingDelete = false;
    renderEditor();
    RH.setView('editor');
    if (focusName) { $('songName').focus(); $('songName').select(); }
  }

  function touch(song) { song.updated = Date.now(); delete song.sample; save(); }

  function renderEditor() {
    const song = current();
    if (!song) return;
    $('songName').value = song.name;
    const sm = summary(song);
    $('songMeta').textContent = '총 ' + sm.bars + '마디 · 약 ' + sm.time + (song.sample ? ' · 예시로 넣어 둔 곡이에요' : '');
    $('confirmDelete').hidden = !pendingDelete;
    document.querySelectorAll('[data-countin]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(Number(b.dataset.countin) === song.countIn));
    });
    renderSections(song);
  }

  function renderSections(song) {
    const ol = $('sectionList');
    ol.innerHTML = '';
    song.sections.forEach(function (s, i) {
      const li = document.createElement('li');
      li.className = 'sec';
      li.dataset.index = String(i);

      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'sec-head';
      head.setAttribute('aria-expanded', String(openSec === s.id));
      head.innerHTML =
        '<span class="sec-color ' + colorOf(s.name) + '" aria-hidden="true"></span>' +
        '<span class="sec-main"><span class="sec-name"></span><span class="sec-info"></span></span>' +
        '<span class="sec-chev" aria-hidden="true">' +
        '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M4 7 L9 12 L14 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg></span>';
      head.querySelector('.sec-name').textContent = s.name || '구간';
      head.querySelector('.sec-info').textContent = secInfo(s);
      head.addEventListener('click', function () {
        openSec = openSec === s.id ? null : s.id;
        renderSections(song);
        const again = $('sectionList').children[i];
        if (again) again.querySelector('.sec-head').focus();
      });
      li.appendChild(head);

      if (openSec === s.id) li.appendChild(editPanel(song, s, i));
      ol.appendChild(li);
    });
  }

  function stepper(label, value, min, max, onChange, idBase) {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const lab = document.createElement('span');
    lab.className = 'field-label';
    lab.id = idBase + '-label';
    lab.textContent = label;
    const st = document.createElement('div');
    st.className = 'stepper';
    st.setAttribute('role', 'group');
    st.setAttribute('aria-labelledby', lab.id);
    const minus = document.createElement('button');
    minus.type = 'button'; minus.textContent = '−'; minus.setAttribute('aria-label', label + ' 줄이기');
    const val = document.createElement('span');
    val.textContent = value;
    const plus = document.createElement('button');
    plus.type = 'button'; plus.textContent = '+'; plus.setAttribute('aria-label', label + ' 늘리기');
    minus.disabled = value <= min;
    plus.disabled = value >= max;
    minus.addEventListener('click', function () { onChange(Math.max(min, value - 1)); });
    plus.addEventListener('click', function () { onChange(Math.min(max, value + 1)); });
    st.appendChild(minus); st.appendChild(val); st.appendChild(plus);
    wrap.appendChild(lab); wrap.appendChild(st);
    return wrap;
  }

  function editPanel(song, s, i) {
    const p = document.createElement('div');
    p.className = 'sec-edit';
    const base = 'sec-' + s.id;
    const refresh = function () { touch(song); renderEditor(); };

    // 이름
    const nameWrap = document.createElement('div');
    nameWrap.className = 'field wide';
    const nl = document.createElement('label');
    nl.className = 'field-label';
    nl.setAttribute('for', base + '-name');
    nl.textContent = '구간 이름';
    const ni = document.createElement('input');
    ni.type = 'text'; ni.id = base + '-name'; ni.maxLength = 20; ni.value = s.name; ni.autocomplete = 'off';
    ni.addEventListener('change', function () { s.name = ni.value.trim() || '구간'; refresh(); });
    const chips = document.createElement('div');
    chips.className = 'name-chips';
    NAMES.forEach(function (n) {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'name-chip';
      c.textContent = n;
      c.setAttribute('aria-pressed', String(s.name === n));
      c.addEventListener('click', function () { s.name = n; refresh(); });
      chips.appendChild(c);
    });
    nameWrap.appendChild(nl); nameWrap.appendChild(ni); nameWrap.appendChild(chips);
    p.appendChild(nameWrap);

    const grid = document.createElement('div');
    grid.className = 'field-grid';
    grid.appendChild(stepper('마디 수', s.bars, 1, 64, function (v) { s.bars = v; refresh(); }, base + '-bars'));
    grid.appendChild(stepper('반복', s.repeat, 1, 8, function (v) { s.repeat = v; refresh(); }, base + '-rep'));

    // 박자
    const mw = document.createElement('div');
    mw.className = 'field';
    const ml = document.createElement('label');
    ml.className = 'field-label';
    ml.setAttribute('for', base + '-meter');
    ml.textContent = '박자';
    const ms = document.createElement('select');
    ms.id = base + '-meter';
    const meters = RH.METERS.map(function (m) { return m[0] + '/' + m[1]; });
    const curMeter = s.beats + '/' + s.unit;
    if (meters.indexOf(curMeter) < 0) meters.push(curMeter);
    ['10/8', '11/8', '15/8', '6/4', '7/4'].forEach(function (x) { if (meters.indexOf(x) < 0) meters.push(x); });
    meters.forEach(function (m) {
      const o = document.createElement('option');
      o.value = m; o.textContent = m; if (m === curMeter) o.selected = true;
      ms.appendChild(o);
    });
    ms.addEventListener('change', function () {
      const parts = ms.value.split('/');
      s.beats = Number(parts[0]); s.unit = Number(parts[1]);
      refresh();
    });
    mw.appendChild(ml); mw.appendChild(ms);
    grid.appendChild(mw);

    // 빠르기
    const bw = document.createElement('div');
    bw.className = 'field';
    const bl = document.createElement('label');
    bl.className = 'field-label';
    bl.setAttribute('for', base + '-bpm');
    bl.textContent = '빠르기 ' + noteOf(s.unit);
    const bi = document.createElement('input');
    bi.type = 'number'; bi.id = base + '-bpm'; bi.min = '20'; bi.max = '400'; bi.inputMode = 'numeric'; bi.value = s.bpm;
    bi.addEventListener('change', function () {
      const v = RH.clampBpm(bi.value);
      if (s.bpmTo === s.bpm) s.bpmTo = null;
      s.bpm = v;
      refresh();
    });
    bw.appendChild(bl); bw.appendChild(bi);
    grid.appendChild(bw);
    p.appendChild(grid);

    // 점점 빠르게 · 느리게
    const rw = document.createElement('div');
    rw.className = 'ramp';
    const rl = document.createElement('label');
    rl.className = 'switch';
    rl.setAttribute('for', base + '-ramp');
    const rc = document.createElement('input');
    rc.type = 'checkbox'; rc.id = base + '-ramp'; rc.checked = !!s.bpmTo;
    const rt = document.createElement('span');
    rt.textContent = '점점 빠르게 · 느리게';
    rl.appendChild(rc); rl.appendChild(rt);
    rc.addEventListener('change', function () {
      s.bpmTo = rc.checked ? Math.max(20, s.bpm - 20) : null;
      refresh();
    });
    rw.appendChild(rl);
    if (s.bpmTo) {
      const tl = document.createElement('label');
      tl.className = 'ramp-to';
      tl.setAttribute('for', base + '-to');
      tl.textContent = '끝 빠르기';
      const ti = document.createElement('input');
      ti.type = 'number'; ti.id = base + '-to'; ti.min = '20'; ti.max = '400'; ti.inputMode = 'numeric'; ti.value = s.bpmTo;
      ti.addEventListener('change', function () { s.bpmTo = RH.clampBpm(ti.value); refresh(); });
      tl.appendChild(ti);
      rw.appendChild(tl);
    }
    p.appendChild(rw);

    // 순서 · 복제 · 삭제
    const acts = document.createElement('div');
    acts.className = 'sec-acts';
    const act = function (label, fn, disabled, cls) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sec-act' + (cls ? ' ' + cls : '');
      b.textContent = label;
      b.disabled = !!disabled;
      b.addEventListener('click', fn);
      acts.appendChild(b);
    };
    act('위로', function () { move(song, i, -1); }, i === 0);
    act('아래로', function () { move(song, i, 1); }, i === song.sections.length - 1);
    act('복제', function () {
      const copy = Object.assign({}, s, { id: uid() });
      song.sections.splice(i + 1, 0, copy);
      openSec = copy.id;
      refresh();
    });
    act('삭제', function () {
      if (song.sections.length === 1) { RH.toast('구간이 하나는 있어야 해요'); return; }
      song.sections.splice(i, 1);
      openSec = null;
      refresh();
    }, false, 'danger');
    p.appendChild(acts);
    return p;
  }

  function move(song, i, dir) {
    const j = i + dir;
    if (j < 0 || j >= song.sections.length) return;
    const tmp = song.sections[i];
    song.sections[i] = song.sections[j];
    song.sections[j] = tmp;
    touch(song);
    renderEditor();
    const li = $('sectionList').children[j];
    if (li) { const btn = li.querySelector('.sec-act:not(:disabled)'); if (btn) btn.focus(); }
  }

  $('addSection').addEventListener('click', function () {
    const song = current();
    if (!song) return;
    const last = song.sections[song.sections.length - 1];
    const used = song.sections.map(function (s) { return s.name; });
    const nextName = NAMES.find(function (n) { return used.indexOf(n) < 0; }) || '구간';
    const s = {
      id: uid(), name: nextName, bars: last ? last.bars : 8,
      beats: last ? last.beats : 4, unit: last ? last.unit : 4,
      bpm: last ? (last.bpmTo || last.bpm) : 96, repeat: 1, bpmTo: null
    };
    song.sections.push(s);
    openSec = s.id;
    touch(song);
    renderEditor();
    const li = $('sectionList').lastElementChild;
    if (li && li.scrollIntoView) li.scrollIntoView({ block: 'nearest' });
  });

  $('songName').addEventListener('change', function () {
    const song = current();
    if (!song) return;
    song.name = $('songName').value.trim() || '이름 없는 곡';
    touch(song);
    renderEditor();
  });

  document.querySelectorAll('[data-countin]').forEach(function (b) {
    b.addEventListener('click', function () {
      const song = current();
      if (!song) return;
      song.countIn = Number(b.dataset.countin);
      touch(song);
      renderEditor();
    });
  });

  $('editorBack').addEventListener('click', openSongs);

  $('songDelete').addEventListener('click', function () {
    pendingDelete = true;
    renderEditor();
    $('cancelDelete').focus();
  });
  $('cancelDelete').addEventListener('click', function () {
    pendingDelete = false;
    renderEditor();
    $('songDelete').focus();
  });
  $('doDelete').addEventListener('click', function () {
    stopIfSong();
    songs = songs.filter(function (s) { return s.id !== currentId; });
    save();
    RH.toast('곡을 지웠어요');
    openSongs();
  });

  /* ---------- 재생 ---------- */
  function stopIfSong() {
    if (RH.engine.playing && RH.engine.program) RH.stopAll();
  }

  async function toggleSong() {
    const song = current();
    if (!song) return;
    if (RH.engine.playing && RH.engine.program) { RH.stopAll(); return; }
    playingBars = buildBars(song);
    const ok = await RH.playProgram(playingBars, function () {
      RH.toast('곡이 끝났어요');
    });
    if (ok) showNow(null);
  }
  $('playSong').addEventListener('click', toggleSong);

  function showNow(ev) {
    const song = current();
    const panel = $('nowPanel');
    panel.hidden = false;
    if (!ev || !playingBars || !song) {
      $('nowLabel').textContent = '준비';
      $('nowName').textContent = song && song.countIn ? '카운트인' : (song ? song.sections[0].name : '');
      $('nowBar').textContent = '';
      $('nowNext').textContent = '';
      $('nowBpm').textContent = '';
      $('nowDots').innerHTML = '';
      return;
    }
    const bar = playingBars[ev.barIndex];
    if (!bar) return;
    if (bar.countIn) {
      $('nowLabel').textContent = '카운트인';
      $('nowName').textContent = String(ev.pulse + 1);
      $('nowBar').textContent = bar.barNo + ' / ' + bar.barTotal + '마디 · 다음은 ' + song.sections[0].name;
      $('nowNext').textContent = '';
    } else {
      const s = song.sections[bar.sec];
      $('nowLabel').textContent = '지금';
      $('nowName').textContent = s ? s.name : '';
      $('nowBar').textContent = '마디 ' + bar.barNo + ' / ' + bar.barTotal + (bar.reps > 1 ? ' · 반복 ' + bar.rep + ' / ' + bar.reps : '');
      // 다음 구간 미리 알림 (남은 마디 수)
      let left = 0, nextIdx = -1;
      for (let k = ev.barIndex + 1; k < playingBars.length; k++) {
        left++;
        if (playingBars[k].sec !== bar.sec) { nextIdx = playingBars[k].sec; break; }
      }
      if (nextIdx >= 0) {
        const n = song.sections[nextIdx];
        $('nowNext').textContent = '다음 · ' + n.name + (left <= 1 ? ' (다음 마디)' : ' (' + left + '마디 뒤)');
        $('nowNext').classList.toggle('soon', left <= 1);
      } else {
        $('nowNext').textContent = '마지막 구간';
        $('nowNext').classList.remove('soon');
      }
      // 편집 목록에서 지금 구간 표시
      Array.prototype.forEach.call($('sectionList').children, function (li, idx) {
        li.classList.toggle('playing', idx === bar.sec);
      });
    }
    $('nowBpm').textContent = noteOf(bar.countIn ? song.sections[0].unit : song.sections[bar.sec].unit) + '=' + Math.round((bar.bpm0 + bar.bpm1) / 2);
    // 박 점
    const dots = $('nowDots');
    if (dots.children.length !== bar.beats) {
      dots.innerHTML = '';
      for (let k = 0; k < bar.beats; k++) dots.appendChild(document.createElement('span'));
    }
    Array.prototype.forEach.call(dots.children, function (d, k) {
      d.className = (k === ev.pulse ? 'on' : '') + (bar.accents[k] === 3 ? ' strong' : '');
    });
  }

  function onPlayState(playing, isProgram) {
    const btn = $('playSong');
    const on = playing && isProgram;
    btn.classList.toggle('playing', on);
    btn.setAttribute('aria-label', on ? '곡 멈춤' : '곡 재생');
    if (!on) {
      $('nowPanel').hidden = true;
      Array.prototype.forEach.call($('sectionList').children, function (li) { li.classList.remove('playing'); });
    }
  }

  RH.openSongs = openSongs;
  RH.toggleSong = toggleSong;
  RH.onProgramBeat = showNow;
  RH.onPlayState = onPlayState;
  RH.buildBars = buildBars; // 시험용
  RH.songs = function () { return songs; };
  RH.openEditor = openEditor;
})();
