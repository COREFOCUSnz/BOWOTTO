// Online play: a thin layer over Firebase Realtime Database, kept separate from
// the simulation on purpose. sim.js and game.js do not know Firebase exists —
// they only see plain callbacks and plain data — so this file is the only place
// that would need to change for a different backend, and the only place that
// needs a real Firebase project to exercise for real. Its pure logic (room
// codes, host election, pose smoothing, damage-relay bookkeeping) is unit
// tested in test/net.test.js against a fake in-memory backend, since this
// sandbox cannot reach Firebase to test the real thing end to end.
//
// Model: each room is a flat tree at /rooms/{CODE}. There is no server code and
// no Cloud Functions — everything here is client-authoritative in the way that
// is honest for a private match between friends, not hardened against a
// malicious participant:
//   players/{uid}   - one player's current pose+state, written only by that
//                      uid (least an anonymous-auth uid), ~10x/second, removed
//                      automatically on disconnect via onDisconnect().
//   hits/{uid}/*     - damage events addressed TO uid, written by whoever hit
//                      them; uid applies each one to its own health once and
//                      deletes it. A player is always authoritative over their
//                      own health — nobody else's client can just set your hp.
//   shots/*          - fire-and-forget cosmetic events (a tracer, a rocket's
//                      flight) so other players can see an attack happen, not
//                      just feel its result a moment later.
//   state            - shared match state (score, flag carriers, round end
//                      time). Written by whichever client currently considers
//                      itself HOST. Host is not a stored role: every client
//                      computes it the same way from the same presence list
//                      (whoever has been present longest), so there is nothing
//                      to migrate when the host leaves — the next client just
//                      starts computing a different answer.
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined';

  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — read aloud without ambiguity
  function makeRoomCode(rand) {
    rand = rand || Math.random;
    let s = '';
    for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
    return s;
  }

  // Smallest present uid wins. Every client sees the same `players` map (modulo
  // a few hundred ms of lag) and computes the same answer without anyone having
  // to agree on or hand off a role.
  function electHost(uids) {
    if (!uids.length) return null;
    return uids.slice().sort()[0];
  }

  // Exponential smoothing toward the latest known value, framerate independent.
  // Not full snapshot interpolation with a delay buffer — that would look
  // marginally better on a lossy connection, but this is a fraction of the code
  // and the difference is not going to be visible between friends on ordinary
  // home connections.
  function smooth(cur, target, dt, rate) {
    const t = 1 - Math.exp(-rate * dt);
    return cur + (target - cur) * t;
  }
  function smoothAngle(cur, target, dt, rate) {
    let d = target - cur;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const t = 1 - Math.exp(-rate * dt);
    return cur + d * t;
  }

  // Fields that make up one player's networked pose+state. Kept as a flat list
  // so publish/apply cannot silently drift apart from each other.
  const POSE_FIELDS = ['name', 'team', 'cls', 'wi', 'hp', 'armor', 'alive', 'disguise', 'disguiseCls', 'hasFlag', 'onGround', 'inWater', 'spinup', 'charge'];

  class NetRoom {
    // io: {auth, db, now} — the small slice of the Firebase compat API this
    // class actually calls, or a fake standing in for it under test. `now` is
    // a clock (defaults to Date.now) so tests can drive time explicitly.
    constructor(io) {
      this.io = io;
      this.code = null;
      this.myUid = null;
      this.connected = false;
      this.remotes = new Map();      // uid -> plain state object
      this.hits = [];                // queued incoming damage, drained by the caller
      this.onRemoteJoin = null;      // (uid, state) => void
      this.onRemoteLeave = null;     // (uid) => void
      this.onRemoteUpdate = null;    // (uid, state) => void
      this.onShot = null;            // (shot) => void
      this.onState = null;           // (state) => void
      this._unsub = [];
      this._lastPublish = 0;
      this._myShotSeq = 0;
    }

    get isHost() {
      if (!this.myUid) return false;
      const uids = Array.from(this.remotes.keys()).concat([this.myUid]);
      return electHost(uids) === this.myUid;
    }

    async _ensureAuth() {
      if (this.myUid) return this.myUid;
      const uid = await this.io.auth.signIn();
      this.myUid = uid;
      return uid;
    }

    async create() {
      await this._ensureAuth();
      const code = makeRoomCode();
      await this.io.db.set(`rooms/${code}/meta`, { createdAt: this.io.now(), createdBy: this.myUid });
      await this._join(code);
      return code;
    }

    async join(code) {
      code = String(code || '').toUpperCase().trim();
      await this._ensureAuth();
      const meta = await this.io.db.get(`rooms/${code}/meta`);
      if (!meta) throw new Error(`no room "${code}" — check the code with whoever is hosting`);
      await this._join(code);
      return code;
    }

    async _join(code) {
      this.code = code;
      this.connected = true;
      const myRef = `rooms/${code}/players/${this.myUid}`;
      // The moment this uid's own connection to Firebase drops — tab closed,
      // network gone, laptop shut — Firebase itself (not this client) removes
      // the player. Nobody has to notice a friend vanished to clean them up.
      this.io.db.onDisconnect(myRef).remove();
      this._unsub.push(this.io.db.onChildAdded(`rooms/${code}/players`, (uid, val) => this._applyRemote(uid, val)));
      this._unsub.push(this.io.db.onChildChanged(`rooms/${code}/players`, (uid, val) => this._applyRemote(uid, val)));
      this._unsub.push(this.io.db.onChildRemoved(`rooms/${code}/players`, (uid) => this._removeRemote(uid)));
      this._unsub.push(this.io.db.onChildAdded(`rooms/${code}/hits/${this.myUid}`, (hitId, hit) => {
        this.hits.push(hit);
        this.io.db.remove(`rooms/${code}/hits/${this.myUid}/${hitId}`);
      }));
      this._unsub.push(this.io.db.onChildAdded(`rooms/${code}/shots`, (id, shot) => {
        if (shot.owner === this.myUid) return;   // it is my own shot echoed back
        if (this.onShot) this.onShot(shot);
      }));
      this._unsub.push(this.io.db.onValue(`rooms/${code}/state`, (state) => {
        if (state && this.onState) this.onState(state);
      }));
    }

    leave() {
      if (!this.connected) return;
      if (this.code && this.myUid) this.io.db.remove(`rooms/${this.code}/players/${this.myUid}`);
      for (const u of this._unsub) u();
      this._unsub = [];
      this.remotes.clear();
      this.connected = false;
      this.code = null;
    }

    _applyRemote(uid, val) {
      if (!val || uid === this.myUid) return;
      const prev = this.remotes.get(uid);
      this.remotes.set(uid, val);
      if (!prev) { if (this.onRemoteJoin) this.onRemoteJoin(uid, val); }
      else if (this.onRemoteUpdate) this.onRemoteUpdate(uid, val, prev);
    }
    _removeRemote(uid) {
      if (!this.remotes.has(uid)) return;
      this.remotes.delete(uid);
      if (this.onRemoteLeave) this.onRemoteLeave(uid);
    }

    // Called ~10-15x/second with the local human player. Only sends what
    // changed enough to matter, plus the always-changing pose, to keep the
    // write volume trivial for a handful of friends.
    publishSelf(p, opts) {
      if (!this.connected) return;
      opts = opts || {};
      const rec = { pos: [round3(p.pos[0]), round3(p.pos[1]), round3(p.pos[2])], yaw: round3(p.yaw), pitch: round3(p.pitch),
        vel: [round3(p.vel[0]), round3(p.vel[1]), round3(p.vel[2])], t: this.io.now() };
      for (const f of POSE_FIELDS) rec[f] = p[f];
      rec.hp = Math.max(0, Math.round(p.hp)); rec.armor = Math.max(0, Math.round(p.armor));
      rec.fireAnim = round3(p.fireAnim); rec.walkPhase = round3(p.walkPhase % (Math.PI * 4));
      if (opts.extra) Object.assign(rec, opts.extra);
      this.io.db.set(`rooms/${this.code}/players/${this.myUid}`, rec);
    }

    // A hit I just dealt to a remote player. I am never authoritative over
    // their health — I tell them what I think landed and they decide.
    relayDamage(targetUid, amount, kind, dir, knock) {
      if (!this.connected) return;
      this.io.db.push(`rooms/${this.code}/hits/${targetUid}`, {
        amount, kind, dir, knock, attackerId: this.myUid, t: this.io.now(),
      });
    }

    // A cosmetic replica of something I fired, for everyone else to look at.
    // Not the thing that deals damage — that already happened locally on my
    // machine and was relayed above; this is purely so an incoming rocket is
    // not invisible until it hits you.
    relayShot(shot) {
      if (!this.connected) return;
      const id = `${this.myUid}_${this._myShotSeq++}`;
      const rec = Object.assign({ owner: this.myUid, t: this.io.now() }, shot);
      this.io.db.set(`rooms/${this.code}/shots/${id}`, rec);
      // Clean up after myself once it has clearly finished flying. Only the
      // shot's own author deletes it, so two clients racing to delete the same
      // node is not a thing that can happen.
      setTimeout(() => this.io.db.remove(`rooms/${this.code}/shots/${id}`), 4000);
    }

    // Written only when this client currently considers itself host. Never
    // enforced server-side — see the file header — which is an accepted
    // trade-off for a private match with no backend.
    publishState(state) {
      if (!this.connected || !this.isHost) return;
      this.io.db.set(`rooms/${this.code}/state`, Object.assign({ t: this.io.now(), hostId: this.myUid }, state));
    }
  }

  function round3(x) { return Math.round(x * 1000) / 1000; }

  // ---- the real Firebase adapter, browser only --------------------------
  // Everything above this point is backend-agnostic and is what
  // test/net.test.js exercises. This is the one place that actually calls the
  // Firebase compat SDK, translating its ref/on/once shape into the plain
  // {auth, db, now} interface NetRoom expects. Untestable from this sandbox —
  // there is no network path to Firebase here — so treat this adapter as the
  // one part of net.js that a real online match is the first real test of.
  function makeFirebaseIO(config) {
    if (!root.firebase) return null;                 // SDK scripts did not load
    if (!config || !config.databaseURL) return null;  // not configured yet
    const app = root.firebase.apps && root.firebase.apps.length
      ? root.firebase.app() : root.firebase.initializeApp(config);
    const db = root.firebase.database(app);
    const auth = root.firebase.auth(app);
    const ref = (path) => db.ref(path);
    return {
      now: () => Date.now(),
      auth: {
        signIn: () => auth.signInAnonymously().then((cred) => cred.user.uid),
      },
      db: {
        get: (path) => ref(path).once('value').then((snap) => snap.val()),
        set: (path, val) => ref(path).set(val),
        remove: (path) => ref(path).remove(),
        push: (path, val) => ref(path).push(val).then((r) => r.key),
        onChildAdded: (path, cb) => { const h = (snap) => cb(snap.key, snap.val()); ref(path).on('child_added', h); return () => ref(path).off('child_added', h); },
        onChildChanged: (path, cb) => { const h = (snap) => cb(snap.key, snap.val()); ref(path).on('child_changed', h); return () => ref(path).off('child_changed', h); },
        onChildRemoved: (path, cb) => { const h = (snap) => cb(snap.key); ref(path).on('child_removed', h); return () => ref(path).off('child_removed', h); },
        onValue: (path, cb) => { const h = (snap) => cb(snap.val()); ref(path).on('value', h); return () => ref(path).off('value', h); },
        onDisconnect: (path) => ref(path).onDisconnect(),
      },
    };
  }

  // What game.js actually calls. Returns null when online play cannot work
  // right now (SDK missing, or the project has not been configured for it —
  // see DEPLOY.md), so the menu can show "not set up" instead of a broken
  // button that fails when clicked.
  function createNetRoom() {
    const io = makeFirebaseIO(root.__FIREBASE_CONFIG);
    return io ? new NetRoom(io) : null;
  }

  const out = { NetRoom, makeRoomCode, electHost, smooth, smoothAngle, POSE_FIELDS, makeFirebaseIO, createNetRoom };
  if (isNode) module.exports = out; else Object.assign(root, out);
})(typeof window !== 'undefined' ? window : this);
