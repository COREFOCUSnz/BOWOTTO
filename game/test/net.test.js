// Unit tests for js/net.js against a FAKE Firebase backend.
//
// This sandbox cannot reach Firebase at all (confirmed: every request to
// google.com and firebaseio.com is rejected by the network policy here), so
// the real end-to-end path — two actual browsers, a real project, a real
// network — has never been exercised and cannot be from here. That is a real
// gap and it is called out in DEPLOY.md.
//
// What CAN be verified without a network is everything net.js decides on its
// own: room codes, host election, damage-relay bookkeeping, pose smoothing
// math, disconnect cleanup. So this fakes the tiny slice of the Firebase
// compat API net.js actually calls — an in-memory tree with the same
// ref/set/onChildAdded/onDisconnect shape — and drives two NetRoom instances
// against it as if they were two separate browsers sharing one database. Every
// assertion here would still hold against a real Firebase backend, because
// net.js does not know or care that the backend underneath is fake.
const assert = require('assert');
const { NetRoom, makeRoomCode, electHost, smooth, smoothAngle } = require('../js/net.js');

let failures = 0;
const pass = (m) => console.log('PASS ' + m);
const fail = (m) => { console.log('FAIL ' + m); failures++; };
const check = (cond, m) => (cond ? pass(m) : fail(m));

// ---- a fake Firebase Realtime Database, shared by every client in a test ---
function makeFakeBackend() {
  const tree = {};
  const listeners = { added: [], changed: [], removed: [], value: [] };
  const onDisconnects = new Map(); // path -> 'remove'|value, applied by disconnectClient()

  const getAt = (path) => path.split('/').filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), tree);
  const setAt = (path, val) => {
    const parts = path.split('/').filter(Boolean);
    const key = parts.pop();
    let o = tree;
    for (const k of parts) o = (o[k] = o[k] || {});
    const existed = Object.prototype.hasOwnProperty.call(o, key);
    if (val === undefined || val === null) delete o[key]; else o[key] = val;
    return existed;
  };
  const parentAndKey = (path) => { const parts = path.split('/').filter(Boolean); return [parts.slice(0, -1).join('/'), parts[parts.length - 1]]; };

  // child_* listeners take (key, val); value listeners take (val) alone. Firing
  // both the same way silently handed onValue's callback `key` (usually null)
  // instead of the actual data — a bug in this fake, not in net.js, caught by
  // the state-sync assertion below coming back empty when it should not.
  const fire = (kind, path, key, val) => {
    for (const l of listeners[kind]) if (path.startsWith(l.path)) (kind === 'value' ? l.cb(val) : l.cb(key, val));
  };

  return {
    get(path) { return structuredCloneLoose(getAt(path)); },
    set(path, val) {
      const bad = findUndefinedPath(val);
      if (bad !== null) throw new Error(`Firebase.Database.set failed: value argument contains undefined in property '${path.split('/').filter(Boolean).join('.')}${bad ? '.' + bad : ''}'`);
      const [parent, key] = parentAndKey(path);
      const existed = setAt(path, val);
      fire(existed ? 'changed' : 'added', parent, key, structuredCloneLoose(val));
      fire('value', path, null, structuredCloneLoose(val));
      return Promise.resolve();
    },
    remove(path) {
      const [parent, key] = parentAndKey(path);
      setAt(path, undefined);
      fire('removed', parent, key, undefined);
      return Promise.resolve();
    },
    push(path, val) {
      const key = 'k' + (Math.random() * 1e9 | 0);
      return this.set(`${path}/${key}`, val).then(() => key);
    },
    onChildAdded(path, cb) { listeners.added.push({ path, cb }); const cur = getAt(path); if (cur) for (const k of Object.keys(cur)) cb(k, structuredCloneLoose(cur[k])); return () => {}; },
    onChildChanged(path, cb) { listeners.changed.push({ path, cb }); return () => {}; },
    onChildRemoved(path, cb) { listeners.removed.push({ path, cb }); return () => {}; },
    onValue(path, cb) { listeners.value.push({ path, cb }); const cur = getAt(path); if (cur !== undefined) cb(structuredCloneLoose(cur)); return () => {}; },
    onDisconnect(path) { return { remove: () => onDisconnects.set(path, undefined) }; },
    // Test-only: simulate a client's tab closing / network dying.
    disconnectClient(path) { if (onDisconnects.has(path)) { this.remove(path); onDisconnects.delete(path); } },
  };
}
function structuredCloneLoose(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }

// Real Firebase rejects any object containing `undefined` anywhere in it —
// this is exactly the class of bug that shipped in the first real deploy
// (p.disguiseCls, the fictional p.hasFlag, and dir/knock on damage() calls
// that never pass them). Returns the offending dotted-path suffix, or null.
function findUndefinedPath(v, path) {
  if (v === undefined) return path || '';
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) { const r = findUndefinedPath(v[i], `${path || ''}.${i}`); if (r !== null) return r; } return null; }
  if (v && typeof v === 'object') { for (const k of Object.keys(v)) { const r = findUndefinedPath(v[k], path ? `${path}.${k}` : k); if (r !== null) return r; } return null; }
  return null;
}

function makeClient(backend, uid, clock) {
  return new NetRoom({ db: backend, auth: { signIn: () => Promise.resolve(uid) }, now: () => clock.t });
}

(async () => {
  // ---- room codes ----------------------------------------------------------
  const codes = new Set();
  for (let i = 0; i < 500; i++) codes.add(makeRoomCode());
  check([...codes].every((c) => /^[A-Z0-9]{4}$/.test(c)), 'room codes are 4 characters, letters and digits');
  check([...codes].every((c) => !/[01OI]/.test(c)), 'room codes never use 0/O/1/I — nothing to misread aloud');
  check(codes.size > 490, `500 draws produced ${codes.size} distinct codes — collisions would put two rooms of friends in one game`);

  // ---- host election ---------------------------------------------------------
  check(electHost(['b', 'a', 'c']) === 'a', 'the lowest uid present is host, whatever order they joined in');
  check(electHost(['a']) === 'a', 'the only player present is their own host');
  check(electHost([]) === null, 'no players present means no host');
  {
    const before = electHost(['bob', 'alice', 'carol']);
    const after = electHost(['bob', 'carol']); // alice (the host) leaves
    check(before === 'alice' && after === 'bob', 'when the host leaves, every remaining client computes the same new host with no message exchanged for it');
  }

  // ---- smoothing -------------------------------------------------------------
  {
    let v = 0;
    for (let i = 0; i < 60; i++) v = smooth(v, 10, 1 / 60, 15);
    check(Math.abs(v - 10) < 0.05, `after a full second, smoothing has essentially caught up to the target (got ${v.toFixed(3)}, want ~10)`);
    let v2 = 0; v2 = smooth(v2, 10, 1 / 60, 15);
    check(v2 > 0 && v2 < 3, `one frame moves partway, not all the way there (got ${v2.toFixed(3)}) — a snap would defeat the point of smoothing`);
  }
  {
    // yaw wraps at +-PI; smoothing the short way round a corner must not spin
    // the long way through the back of the player's head.
    let a = Math.PI - 0.1;
    a = smoothAngle(a, -Math.PI + 0.1, 1 / 60, 15);
    check(a > Math.PI - 0.1 || a < -Math.PI + 0.1 + 0.01, `yaw took the short way across the wrap (got ${a.toFixed(3)})`);
  }

  // ---- two clients, one fake backend -----------------------------------------
  const backend = makeFakeBackend();
  const clock = { t: 1000 };
  const A = makeClient(backend, 'alice', clock);
  const B = makeClient(backend, 'bob', clock);

  // Joining a room only sets up the connection — nothing is announced to
  // anyone else until the caller actually publishes a pose, exactly like the
  // real game: you are not meaningfully "present" with no name, team or class
  // yet, and the frame loop will publish a real snapshot within one tick of
  // connecting anyway. So every check below that cares whether a player is
  // visible calls publishSelf right after join, matching real usage.
  const fakePlayer = (over) => Object.assign({
    pos: [1, 2, 3], vel: [0, 0, 0], yaw: 0.5, pitch: -0.1, name: 'Alice', team: 0, cls: 'soldier',
    wi: 0, hp: 80, armor: 20, alive: true, disguise: -1, disguiseCls: null, hasFlag: false,
    fireAnim: 0, walkPhase: 0,
  }, over);

  const code = await A.create();
  check(/^[A-Z0-9]{4}$/.test(code), `create() hands back a room code (got "${code}")`);
  A.publishSelf(fakePlayer({ name: 'Alice' }));
  check(A.isHost, 'the room creator is host while alone in it');

  let joinFailed = false;
  try { await makeClient(backend, 'zed', clock).join('ZZZZ'); } catch (e) { joinFailed = true; }
  check(joinFailed, 'joining a code nobody created fails, rather than silently connecting to nothing');

  await B.join(code);
  B.publishSelf(fakePlayer({ name: 'Bob' }));
  check(A.remotes.has('bob') && B.remotes.has('alice'), 'each client sees the other join');
  check(A.isHost && !B.isHost, 'alice (lower uid, created first) stays host once bob joins');

  const seenJoins = [];
  const C = makeClient(backend, 'carol', clock);
  A.onRemoteJoin = (uid) => seenJoins.push(uid);
  await C.join(code);
  C.publishSelf(fakePlayer({ name: 'Carol' }));
  check(seenJoins[0] === 'carol', 'an already-connected client is told about a new arrival');
  check(electHost(['alice', 'bob', 'carol']) === 'alice', 'host is unchanged by a third player joining below them alphabetically');

  // ---- pose publish/apply -----------------------------------------------------
  let bSawUpdate = null;
  B.onRemoteUpdate = (uid, val) => { if (uid === 'alice') bSawUpdate = val; };
  A.publishSelf(fakePlayer({ hp: 80 }));
  check(bSawUpdate && bSawUpdate.hp === 80 && bSawUpdate.cls === 'soldier', 'a published pose reaches the other client with its fields intact');
  check(Array.isArray(bSawUpdate.pos) && bSawUpdate.pos.length === 3, 'position comes through as three numbers');

  // ---- damage relay: never authoritative over someone else's health ----------
  A.publishSelf(fakePlayer()); // ensure alice is present as far as bob's queue check goes
  B.relayDamage('alice', 42, 'hitscan', [0, 0, -1], 3);
  // alice's queue is drained by _join's onChildAdded handler synchronously in
  // this fake backend, landing in A.hits.
  check(A.hits.length === 1 && A.hits[0].amount === 42 && A.hits[0].attackerId === 'bob',
    'a hit relayed to alice shows up in HER queue, addressed from bob, for HER client to decide what to do with');
  check(B.hits.length === 0, "relaying a hit to someone else does not also queue it against the sender's own health");

  // ---- shots: cosmetic, and not echoed back to their own author --------------
  let cSawShot = null;
  C.onShot = (shot) => { cSawShot = shot; };
  let aSawOwnShot = null;
  A.onShot = (shot) => { aSawOwnShot = shot; };
  A.relayShot({ type: 'rocket', pos: [0, 0, 0], vel: [0, 0, -10] });
  check(cSawShot && cSawShot.type === 'rocket' && cSawShot.owner === 'alice', "another client sees alice's shot, tagged with who fired it");
  check(aSawOwnShot === null, "a client does not receive its own shot back as if someone else fired it");

  // ---- shared match state: host-only write, mirrored everywhere -------------
  let bSawState = null;
  B.onState = (st) => { bSawState = st; };
  B.publishState({ score: [3, 1] }); // bob is not host; this must be a no-op
  check(bSawState === null, 'a non-host publishing state does nothing — otherwise two clients could disagree about the score');
  A.publishState({ score: [3, 1] });
  check(bSawState && bSawState.score[0] === 3 && bSawState.hostId === 'alice', "the host's state reaches everyone, tagged with who is authoritative for it");

  // ---- disconnect cleanup ------------------------------------------------------
  const bobLeft = { seen: false };
  A.onRemoteLeave = (uid) => { if (uid === 'bob') bobLeft.seen = true; };
  backend.disconnectClient(`rooms/${code}/players/bob`);
  check(bobLeft.seen, "when bob's connection dies without him saying goodbye, everyone else is still told he is gone");
  check(!A.remotes.has('bob'), 'and he is removed from the room, not left as a ghost standing where he disconnected');

  // ---- shapes that shipped broken in the first real deploy -------------------
  // fakePlayer() above sets disguiseCls/hasFlag explicitly, which papered over
  // the real bug: a real sim.js Player never sets p.hasFlag at all (the real
  // state is p.flag, a Flag object or null) and only ever sets p.disguiceCls
  // once a Spy has actually disguised. Firebase's real set() rejects any
  // object containing `undefined` anywhere in it, so publishing a totally
  // ordinary non-Spy, flagless player broke online play's very first publish.
  const realShapePlayer = {
    pos: [1, 2, 3], vel: [0, 0, 0], yaw: 0.5, pitch: -0.1, name: 'Dave', team: 0, cls: 'soldier',
    wi: 0, hp: 80, armor: 20, alive: true, disguise: -1, onGround: true, inWater: false, spinup: 0, charge: -1,
    fireAnim: 0, walkPhase: 0, flag: null, // disguiseCls and hasFlag deliberately absent, like the real Player
  };
  let threwOnRealShape = null;
  try { A.publishSelf(realShapePlayer); } catch (e) { threwOnRealShape = e; }
  check(!threwOnRealShape, `publishing an ordinary player (no disguise, no flag) does not throw (${threwOnRealShape && threwOnRealShape.message})`);

  let threwOnBareDamage = null;
  try { B.relayDamage('alice', 3, 'burn', undefined, undefined); } catch (e) { threwOnBareDamage = e; }
  check(!threwOnBareDamage, `relaying fall/burn/infection/caltrop damage (no dir or knock passed) does not throw (${threwOnBareDamage && threwOnBareDamage.message})`);

  A.leave(); B.leave(); C.leave();
  check(!A.connected && !B.connected, 'leaving actually disconnects, rather than only clearing local state');

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nnet test OK');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FAIL net test threw: ' + (e && e.stack || e)); process.exit(1); });
