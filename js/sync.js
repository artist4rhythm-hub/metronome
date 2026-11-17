/* 리듬 하우스 메트로놈 — 합주 모드 (여러 기기 박 맞추기)

   원리
   1) 시계 맞추기: 따라가는 기기가 리더에게 "지금 몇 시?"를 여러 번 묻고(4개 시각 교환, NTP 방식),
      왕복이 가장 빨랐던 답들만 골라 리더 시계와의 차이(offset)를 구합니다.
   2) 미래 시각 약속: 리더는 "공통 시계로 몇 시 몇 초에 몇 번째 박, 몇 BPM"이라는 시간표(seg)를 보냅니다.
      메시지가 조금 늦게 와도 약속한 시각 전에만 오면 모든 기기가 같은 순간에 칩니다.
      템포 · 박자를 바꾸면 "다음 마디 첫 박부터" 새 시간표가 시작됩니다.

   연결 방식
   - Firebase 실시간 데이터베이스 (js/firebase-config.js에 설정을 넣으면): 서로 다른 기기끼리
   - 같은 기기 시험 모드 (설정 전): 같은 브라우저의 다른 창끼리 (BroadcastChannel) */
(function (global) {
  'use strict';

  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const params = new URLSearchParams(global.location.search);
  const SKEW = Number(params.get('syncskew') || 0); // 시험용: 이 기기 시계를 일부러 어긋나게
  const localNow = function () { return performance.timeOrigin + performance.now() + SKEW; };
  const uid0 = function () { let s = ''; for (let i = 0; i < 20; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)]; return s; };
  const makeCode = function () { let s = ''; for (let i = 0; i < 6; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)]; return s; };

  /* ---------- 연결 1: Firebase 실시간 데이터베이스 ----------
     모듈 방식 SDK(js/vendor/fb)를 씀. 로그인은 팝업 · 리다이렉트용 숨은 창을 띄우지 않는 방식으로 초기화해서
     아이폰 · 안드로이드 앱(Capacitor) 안에서도 멈추지 않음 */
  let FB = null;
  async function loadFB() {
    if (FB) return FB;
    const base = new URL('js/vendor/fb/', document.baseURI).href;
    const mods = await Promise.all([
      import(base + 'firebase-app.js'),
      import(base + 'firebase-auth.js'),
      import(base + 'firebase-database.js')
    ]);
    FB = { app: mods[0], auth: mods[1], db: mods[2] };
    return FB;
  }
  function FirebaseBus(cfg, emu) {
    this.cfg = cfg; this.emu = emu; this.room = null; this.subs = [];
  }
  FirebaseBus.prototype.kind = 'firebase';
  FirebaseBus.prototype.init = async function () {
    if (this.db) return this.uid;
    const F = await loadFB();
    const A = F.auth, D = F.db;
    let app = F.app.getApps().find(function (x) { return x.name === 'rhm-sync'; });
    let auth;
    if (!app) {
      app = F.app.initializeApp(this.cfg, 'rhm-sync');
      auth = A.initializeAuth(app, { persistence: [A.indexedDBLocalPersistence, A.browserLocalPersistence, A.inMemoryPersistence] });
      if (this.emu) A.connectAuthEmulator(auth, 'http://' + this.emu.auth, { disableWarnings: true });
    } else auth = A.getAuth(app);
    const db = D.getDatabase(app, this.cfg.databaseURL);
    if (this.emu && !db._rhEmu) { D.connectDatabaseEmulator(db, this.emu.dbHost, this.emu.dbPort); db._rhEmu = true; }
    const cred = await A.signInAnonymously(auth);
    this.uid = cred.user.uid;
    this.db = db;
    this.D = D;
    return this.uid;
  };
  FirebaseBus.prototype.ref = function (p) { return this.D.ref(this.db, 'rooms/' + this.code + (p ? '/' + p : '')); };
  FirebaseBus.prototype.create = async function (code, meta) {
    this.code = code;
    const r = await this.D.runTransaction(this.ref('meta'), function (cur) { return cur ? undefined : meta; });
    if (!r.committed) throw new Error('code-taken');
  };
  FirebaseBus.prototype.exists = async function (code) {
    this.code = code;
    const s = await this.D.get(this.ref('meta'));
    return s.exists();
  };
  FirebaseBus.prototype.open = function (code, h) {
    this.code = code;
    const self = this, D = this.D;
    this.subs = [];
    const on = function (path, fn, ev) {
      const r = self.ref(path);
      const un = ev === 'added' ? D.onChildAdded(r, fn) : ev === 'changed' ? D.onChildChanged(r, fn) : D.onValue(r, fn);
      self.subs.push(un);
    };
    on('meta', function (s) { h.meta(s.val()); });
    on('state', function (s) { h.state(s.val()); });
    on('members', function (s) { h.members(s.val() || {}); });
    on('pong/' + this.uid, function (s) { const v = s.val(); if (v) h.pong(v); });
    // 리더일 때만 의미 있음: 따라가는 기기들의 질문
    on('ping', function (s) { h.ping(s.key, s.val()); }, 'added');
    on('ping', function (s) { h.ping(s.key, s.val()); }, 'changed');
  };
  FirebaseBus.prototype.setMember = function (info) {
    const D = this.D;
    const r = this.ref('members/' + this.uid);
    D.onDisconnect(r).remove();
    D.onDisconnect(this.ref('ping/' + this.uid)).remove();
    D.onDisconnect(this.ref('pong/' + this.uid)).remove();
    return D.set(r, info);
  };
  FirebaseBus.prototype.updateMember = function (patch) { return this.D.update(this.ref('members/' + this.uid), patch); };
  FirebaseBus.prototype.leaderPresence = function () {
    // 리더 연결이 끊기면 서버가 알아서 leaderOnline=false로 바꿔 둠 → 다른 기기가 이어받음
    this.D.onDisconnect(this.ref('meta/leaderOnline')).set(false);
    return this.D.update(this.ref('meta'), { leader: this.uid, leaderOnline: true });
  };
  FirebaseBus.prototype.setMeta = function (patch) { return this.D.update(this.ref('meta'), patch); };
  FirebaseBus.prototype.claim = async function () {
    const uid = this.uid;
    const r = await this.D.runTransaction(this.ref('meta'), function (cur) {
      if (!cur) return undefined;
      if (cur.leaderOnline && cur.leader !== uid) return undefined;
      cur.leader = uid; cur.leaderOnline = true;
      return cur;
    });
    return r.committed;
  };
  FirebaseBus.prototype.setState = function (st) { return this.D.set(this.ref('state'), st); };
  FirebaseBus.prototype.ping = function (msg) { return this.D.set(this.ref('ping/' + this.uid), msg); };
  FirebaseBus.prototype.pong = function (to, msg) { return this.D.set(this.ref('pong/' + to), msg); };
  FirebaseBus.prototype.close = async function (removeRoom) {
    (this.subs || []).forEach(function (un) { try { un(); } catch (e) { /* 무시 */ } });
    this.subs = [];
    if (!this.code) return;
    const D = this.D;
    try {
      D.onDisconnect(this.ref('members/' + this.uid)).cancel();
      D.onDisconnect(this.ref('meta/leaderOnline')).cancel();
      if (removeRoom) await D.remove(this.ref());
      else {
        await D.remove(this.ref('members/' + this.uid));
        await D.remove(this.ref('ping/' + this.uid));
        await D.remove(this.ref('pong/' + this.uid));
      }
    } catch (e) { /* 이미 닫힘 */ }
    this.code = null;
  };

  /* ---------- 연결 2: 같은 기기 시험 모드 (다른 창끼리) ---------- */
  function LocalBus() { this.uid = uid0(); }
  LocalBus.prototype.kind = 'local';
  LocalBus.prototype.init = async function () { return this.uid; };
  LocalBus.prototype._store = function () { try { return JSON.parse(localStorage.getItem('rhm.sync.local.' + this.code) || 'null'); } catch (e) { return null; } };
  LocalBus.prototype._save = function (room) { try { localStorage.setItem('rhm.sync.local.' + this.code, JSON.stringify(room)); } catch (e) { /* 무시 */ } };
  LocalBus.prototype._send = function (msg) {
    // 실제 네트워크처럼 20~70ms 늦게 도착하게 흉내
    const ch = this.ch;
    setTimeout(function () { try { ch.postMessage(msg); } catch (e) { /* 닫힘 */ } }, 20 + Math.random() * 50);
  };
  LocalBus.prototype._room = function (fn) {
    const room = this._store() || { meta: null, state: null, members: {} };
    fn(room);
    this._save(room);
    this._send({ type: 'room', room: room });
    this._apply(room);
  };
  LocalBus.prototype._apply = function (room) {
    if (!this.h) return;
    this.h.meta(room.meta); this.h.state(room.state); this.h.members(room.members || {});
  };
  LocalBus.prototype.create = async function (code, meta) {
    this.code = code;
    if (this._store()) throw new Error('code-taken');
    this._save({ meta: meta, state: null, members: {} });
  };
  LocalBus.prototype.exists = async function (code) { this.code = code; return !!this._store(); };
  LocalBus.prototype.open = function (code, h) {
    this.code = code; this.h = h;
    const self = this;
    this.ch = new BroadcastChannel('rhm-sync-' + code);
    this.ch.onmessage = function (e) {
      const m = e.data;
      if (m.type === 'room') self._apply(m.room);
      else if (m.type === 'ping') h.ping(m.from, m.msg);
      else if (m.type === 'pong' && m.to === self.uid) h.pong(m.msg);
    };
    this._apply(this._store() || { meta: null, state: null, members: {} });
    this._beat = setInterval(function () { self._room(function (r) { if (r.members[self.uid]) r.members[self.uid].seen = Date.now(); }); }, 2000);
    global.addEventListener('pagehide', this._bye = function () { self.close(false); });
  };
  LocalBus.prototype.setMember = function (info) { const u = this.uid; this._room(function (r) { r.members[u] = Object.assign({ seen: Date.now() }, info); }); };
  LocalBus.prototype.updateMember = function (patch) { const u = this.uid; this._room(function (r) { if (r.members[u]) Object.assign(r.members[u], patch); }); };
  LocalBus.prototype.leaderPresence = function () { const u = this.uid; this._room(function (r) { r.meta.leader = u; r.meta.leaderOnline = true; }); };
  LocalBus.prototype.setMeta = function (patch) { this._room(function (r) { Object.assign(r.meta, patch); }); };
  LocalBus.prototype.claim = async function () {
    const u = this.uid; let ok = false;
    this._room(function (r) { if (r.meta && !r.meta.leaderOnline) { r.meta.leader = u; r.meta.leaderOnline = true; ok = true; } });
    return ok;
  };
  LocalBus.prototype.setState = function (st) { this._room(function (r) { r.state = st; }); };
  LocalBus.prototype.ping = function (msg) { this._send({ type: 'ping', from: this.uid, msg: msg }); };
  LocalBus.prototype.pong = function (to, msg) { this._send({ type: 'pong', to: to, msg: msg }); };
  LocalBus.prototype.close = async function (removeRoom) {
    const u = this.uid;
    clearInterval(this._beat);
    if (this.code && this.ch) {
      if (removeRoom) { try { localStorage.removeItem('rhm.sync.local.' + this.code); } catch (e) { /* 무시 */ } this._send({ type: 'room', room: { meta: null, state: null, members: {} } }); }
      else this._room(function (r) { delete r.members[u]; if (r.meta && r.meta.leader === u) r.meta.leaderOnline = false; });
    }
    const ch = this.ch;
    setTimeout(function () { try { ch && ch.close(); } catch (e) { /* 무시 */ } }, 200);
    if (this._bye) global.removeEventListener('pagehide', this._bye);
    this.h = null; this.code = null; this.ch = null;
  };

  /* ---------- 합주 관리 ---------- */
  function Sync() {
    this.role = null;      // 'leader' | 'member' | null
    this.code = null;
    this.offset = 0;       // 공통 시계 = 이 기기 시계 + offset (ms)
    this.target = 0;
    this.samples = [];
    this.err = null;       // 맞춤 정확도 추정 (ms)
    this.rtt = null;
    this.meta = null; this.state = null; this.members = {};
    this.handlers = {};
    this.seq = 0;
    this.joinedAt = 0;
    const cfg = global.RH_FIREBASE;
    const host = global.location.hostname;
    if (params.get('emu') === '1' && (host === 'localhost' || host === '127.0.0.1')) {
      this.bus = new FirebaseBus({ apiKey: 'demo-key', projectId: 'demo-rhm', databaseURL: 'http://127.0.0.1:9000?ns=demo-rhm-default-rtdb', appId: 'demo' },
        { auth: '127.0.0.1:9099', dbHost: '127.0.0.1', dbPort: 9000 });
    } else if (cfg && cfg.databaseURL) {
      this.bus = new FirebaseBus(cfg, null);
    } else {
      this.bus = new LocalBus();
    }
    this.kind = this.bus.kind;
  }
  Sync.prototype.on = function (ev, fn) { this.handlers[ev] = fn; };
  Sync.prototype.emit = function (ev, a) { const f = this.handlers[ev]; if (f) try { f(a); } catch (e) { console.error(e); } };
  Sync.prototype.now = function () { return localNow() + this.offset; };
  Sync.prototype.localNow = localNow;
  // 공통 시계(ms) → 이 기기의 performance.now() 기준(ms)
  Sync.prototype.toPerf = function (shared) { return shared - this.offset - performance.timeOrigin - SKEW; };
  Sync.prototype.active = function () { return !!this.role; };

  Sync.prototype._handlers = function () {
    const self = this;
    return {
      meta: function (m) {
        const prev = self.meta;
        self.meta = m;
        if (!self.role) return;
        if (!m) { self.emit('closed', '리더가 합주를 끝냈어요'); self.leave(true); return; }
        if (m.leader === self.bus.uid && self.role !== 'leader') self._becomeLeader();
        else if (m.leader !== self.bus.uid && self.role === 'leader') { self.role = 'member'; self.emit('role', 'member'); self._startPinging(); }
        if (!m.leaderOnline && self.role === 'member') self._maybeClaim();
        if (!prev || prev.leader !== m.leader || prev.leaderOnline !== m.leaderOnline) self.emit('meta', m);
      },
      state: function (st) {
        if (!self.role || !st) return;
        if (self.state && st.seq != null && self.state.seq != null && st.seq < self.state.seq && self.role === 'leader') return;
        self.state = st;
        self.emit('state', st);
      },
      members: function (mm) { self.members = mm; self.emit('members', mm); },
      ping: function (from, msg) {
        if (self.role !== 'leader' || !msg || from === self.bus.uid) return;
        const t1 = self.now();
        self.bus.pong(from, { t0: msg.t0, n: msg.n, t1: t1, t2: self.now() });
      },
      pong: function (msg) { self._onPong(msg); }
    };
  };

  Sync.prototype.create = async function (name) {
    await this.bus.init();
    let code = makeCode(), tries = 0;
    for (;;) {
      try { await this.bus.create(code, { leader: this.bus.uid, leaderOnline: true, created: Date.now(), v: 1 }); break; }
      catch (e) { if (++tries > 5) throw e; code = makeCode(); }
    }
    this.code = code; this.role = 'leader'; this.offset = 0; this.target = 0; this.err = 0; this.rtt = 0;
    this.joinedAt = Date.now();
    this.bus.open(code, this._handlers());
    await this.bus.setMember({ name: name, joined: this.joinedAt, role: 'leader', err: 0 });
    await this.bus.leaderPresence();
    this.emit('role', 'leader');
    return code;
  };

  Sync.prototype.join = async function (code, name) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    await this.bus.init();
    if (!(await this.bus.exists(code))) throw new Error('no-room');
    this.code = code; this.role = 'member'; this.samples = []; this.err = null;
    this.joinedAt = Date.now();
    this.bus.open(code, this._handlers());
    await this.bus.setMember({ name: name, joined: this.joinedAt, role: 'member', err: -1 });
    this.emit('role', 'member');
    this._startPinging();
    return code;
  };

  Sync.prototype.leave = async function (silent) {
    const wasLeader = this.role === 'leader';
    clearInterval(this._pingTimer); clearInterval(this._slew); clearTimeout(this._claimT);
    this._pingTimer = this._slew = null;
    // 리더가 나가면: 남은 기기 중 가장 먼저 들어온 기기에게 넘기고, 아무도 없으면 방 정리
    let removeRoom = false;
    if (wasLeader) {
      const others = Object.keys(this.members || {}).filter((u) => u !== this.bus.uid)
        .sort((a, b) => (this.members[a].joined || 0) - (this.members[b].joined || 0));
      if (others.length) { try { await this.bus.setMeta({ leader: others[0], leaderOnline: false }); } catch (e) { /* 무시 */ } }
      else removeRoom = true;
    }
    this.role = null;
    await this.bus.close(removeRoom);
    this.code = null; this.state = null; this.meta = null; this.members = {};
    this.offset = 0; this.target = 0; this.samples = [];
    if (!silent) this.emit('left');
    this.emit('role', null);
  };

  /* 리더 이어받기: 리더 연결이 끊기면 가장 먼저 들어온 기기가 맡음 */
  Sync.prototype._maybeClaim = function () {
    const self = this;
    clearTimeout(this._claimT);
    this._claimT = setTimeout(async function () {
      if (!self.role || !self.meta || self.meta.leaderOnline) return;
      const mine = self.bus.uid;
      const ids = Object.keys(self.members || {}).filter((u) => u !== self.meta.leader)
        .sort((a, b) => (self.members[a].joined || 0) - (self.members[b].joined || 0));
      // 지정받았거나(손으로 넘김) 가장 먼저 들어온 기기면 맡기
      if (self.meta.leader === mine || ids[0] === mine) {
        try { if (await self.bus.claim()) self._becomeLeader(); } catch (e) { /* 다른 기기가 먼저 맡음 */ }
      }
    }, 1500 + Math.random() * 500);
  };
  Sync.prototype._becomeLeader = function () {
    if (this.role === 'leader') return;
    clearInterval(this._pingTimer); this._pingTimer = null;
    this.role = 'leader';
    // 지금까지 맞춘 offset을 그대로 고정 → 시간표의 기준 시계가 바뀌지 않음
    this.target = this.offset; this.err = 0;
    this.bus.leaderPresence();
    this.bus.updateMember({ role: 'leader', err: 0 });
    this.emit('role', 'leader');
  };

  /* 시계 맞추기 */
  Sync.prototype._startPinging = function () {
    const self = this;
    let n = 0, burst = 0;
    clearInterval(this._pingTimer);
    const fire = function () {
      if (self.role !== 'member') return;
      self._pending = self._pending || {};
      n++;
      self._pending[n] = localNow();
      self.bus.ping({ t0: self._pending[n], n: n });
    };
    // 처음에는 0.15초마다 20번, 그 뒤로는 5초마다 3번씩
    this._pingTimer = setInterval(function () {
      burst++;
      if (burst <= 20 || burst % 33 < 3) fire();
    }, 150);
    fire();
    clearInterval(this._slew);
    // 갑자기 크게 바꾸지 않고 조금씩 따라감 (최대 1초에 4ms)
    this._slew = setInterval(function () {
      const d = self.target - self.offset;
      if (Math.abs(d) > 200) self.offset = self.target;
      else self.offset += Math.max(-1, Math.min(1, d));
    }, 250);
  };
  Sync.prototype._onPong = function (m) {
    const t3 = localNow();
    if (!this._pending || this._pending[m.n] == null || this._pending[m.n] !== m.t0) return;
    delete this._pending[m.n];
    const delay = (t3 - m.t0) - (m.t2 - m.t1);
    const off = ((m.t1 - m.t0) + (m.t2 - t3)) / 2;
    this.samples.push({ off: off, delay: delay, at: t3 });
    if (this.samples.length > 40) this.samples.shift();
    const best = this.samples.slice().sort((a, b) => a.delay - b.delay).slice(0, Math.max(3, Math.ceil(this.samples.length / 4)));
    const offs = best.map((s) => s.off).sort((a, b) => a - b);
    const med = offs[Math.floor(offs.length / 2)];
    const first = this.err == null;
    this.target = med;
    if (first || this.samples.length <= 6) this.offset = med;
    // 정확도: 고른 답들 사이의 흩어짐 (왕복이 빠를수록, 고를수록 작음)
    const spread = (offs[offs.length - 1] - offs[0]) / 2;
    this.rtt = best[0].delay;
    this.err = Math.max(1, Math.round(Math.min(spread, best[0].delay / 2)));
    if (this.samples.length % 5 === 0 || first) {
      this.bus.updateMember({ err: this.err, rtt: Math.round(this.rtt) });
      this.emit('clock', { err: this.err, rtt: this.rtt, offset: this.offset });
    }
  };

  /* 리더: 상태 보내기 */
  Sync.prototype.publish = function (st) {
    if (this.role !== 'leader') return;
    st.seq = ++this.seq + Math.floor(Date.now() / 1000) * 1000;
    st.by = this.bus.uid;
    this.state = st;
    this.bus.setState(JSON.parse(JSON.stringify(st)));
  };
  Sync.prototype.isReady = function () {
    if (this.role === 'leader') return true;
    return this.role === 'member' && this.samples.length >= 6;
  };

  global.RHSync = { create: function () { return new Sync(); }, makeCode: makeCode };
})(window);
