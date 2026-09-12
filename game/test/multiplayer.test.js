// Does game.js actually do the right thing with what net.js tells it?
//
// test/net.test.js proves net.js's own logic is correct against a fake
// backend. This proves the OTHER half: that game.js reacts correctly to a
// NetRoom — remote players appear and move smoothly, damage relays the right
// way in both directions, ghost projectiles never deal real damage, bots and
// sentries turn off online, and leaving cleans up. It does this by injecting a
// small stand-in object through window.__injectNet (see js/game.js), so it
// needs no real Firebase and works precisely because this sandbox cannot
// reach Firebase at all.
//
// What this does NOT prove, and nothing run from here can: that two real
// browsers over a real network, through a real Firebase project, actually see
// each other. That is the one part of this feature nobody but a live deploy
// can verify — see DEPLOY.md.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const URL = process.argv[2] || process.env.GAME_URL || 'http://localhost:8099/index.html';
let failures = 0;
const pass = (m) => console.log('PASS ' + m);
const fail = (m) => { console.log('FAIL ' + m); failures++; };
const DEADLINE = setTimeout(() => { console.log('FAIL multiplayer bench timed out'); process.exit(1); }, 120000);

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
  const errs = [];
  const EXPECTED_NETWORK_FAILURE = /net::ERR_|Failed to load resource/;
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !EXPECTED_NETWORK_FAILURE.test(m.text())) errs.push(m.text()); });
  await page.goto(URL);
  await page.waitForFunction(() => window.__game && document.getElementById('loading').hidden, null, { timeout: 60000 });

  // ---- with no Firebase project configured, online play says so honestly ----
  // This is the actual, real path — not a fake — since this repo's checked-in
  // firebase-config.js is the unconfigured placeholder and this sandbox cannot
  // reach the CDN scripts either way. Both routes to "not available" land here.
  const menuState = await page.evaluate(() => {
    window.__menuSelect('o');
    const html = document.getElementById('menu').innerHTML;
    window.__menuSelect('0');
    return { mentionsSetup: /not been set up|DEPLOY/i.test(html), hasRoomCodeInput: /net_code/.test(html) };
  });
  menuState.mentionsSetup && !menuState.hasRoomCodeInput
    ? pass('an unconfigured deployment says online play needs setup, rather than offering a broken room code field')
    : fail('the online menu does not honestly report that this deployment has no Firebase project configured');

  // ---- join the game, then inject a fake room -------------------------------
  await page.evaluate(() => { window.__menuSelect('1'); window.__menuSelect('1'); window.__menuSelect('3'); window.__closeMenu(); });
  await page.waitForTimeout(300);

  // frame() already runs off requestAnimationFrame; just wait real frames.
  const frames = (n) => page.evaluate((n) => new Promise((done) => { let left = n; (function s() { if (--left <= 0) return done(); requestAnimationFrame(s); })(); }), n);

  await page.evaluate(() => {
    const g = window.__game, h = window.__human;
    g.roundLength = 1e9;
    window.__brains.forEach((br) => { br.update = () => {}; });
    g.players.filter((x) => x.isBot).forEach((x) => { x.alive = false; x.pos = [0, -60, 0]; });
    h.alive = true; h.hp = 100; h.armor = 0; h.pos = [0, 0.05, -34]; h.vel = [0, 0, 0]; h.yaw = 0; h.pitch = 0;

    // The stand-in the test drives directly — exactly the surface game.js
    // actually calls on a real NetRoom (see wireNetCallbacks/netUpdate in
    // js/game.js), nothing more.
    window.__fakeRoom = {
      isHost: true, connected: true, hits: [], code: 'TEST',
      calls: { publishSelf: 0, relayShot: [], relayDamage: [], publishState: [], leave: 0 },
      publishSelf() { this.calls.publishSelf++; },
      relayShot(shot) { this.calls.relayShot.push(shot); },
      relayDamage(uid, amount, kind, dir, knock) { this.calls.relayDamage.push({ uid, amount, kind, dir, knock }); },
      publishState(st) { this.calls.publishState.push(st); },
      leave() { this.calls.leave++; },
    };
    window.__injectNet(window.__fakeRoom);
  });

  const afterInject = await page.evaluate(() => ({
    net: !!window.__net(), botCount: window.__game.players.filter((p) => p.isBot).length,
  }));
  check(!!afterInject.net, 'injecting a room makes it the active net connection');

  // ---- bots turn off the instant you connect --------------------------------
  await page.evaluate(() => { window.__settings.fill = true; window.__settings.teamSize = 4; });
  await frames(2);
  const botsWhileOnline = await page.evaluate(() => window.__game.players.filter((p) => p.isBot).length);
  check(botsWhileOnline === 0, `bot fill stays off while connected, even with it enabled in settings (found ${botsWhileOnline} bots)`);

  // ---- a remote player joins -------------------------------------------------
  const remoteState = (over) => Object.assign({
    name: 'Riley', team: 1, cls: 'soldier', wi: 3, hp: 100, armor: 0, alive: true,
    pos: [10, 0.05, -34], yaw: 0, pitch: 0, vel: [0, 0, 0], fireAnim: 0, walkPhase: 0,
    onGround: true, inWater: false, disguise: -1, disguiseCls: null, hasFlag: false,
  }, over);

  await page.evaluate((st) => { window.__fakeRoom.onRemoteJoin('riley', st); }, remoteState());
  const joined = await page.evaluate(() => {
    const p = window.__onlineRemotes.get('riley');
    return p ? { isRemote: p.isRemote, name: p.name, team: p.team, cls: p.cls, pos: p.pos.slice(), inPlayers: window.__game.players.includes(p) } : null;
  });
  check(!!joined && joined.isRemote && joined.name === 'Riley' && joined.team === 1 && joined.inPlayers,
    'a remote join creates a real Player object, marked remote, in the same list everyone else renders from');

  // ---- position updates are smoothed, not snapped ----------------------------
  // Pausing the game's own netUpdate() and driving smoothing with an exact dt
  // (window.__stepNetSmoothing) matters here, not just style: the running
  // page keeps calling netUpdate() off real requestAnimationFrame timing the
  // whole time, and under this project's headless benches a single real frame
  // swings from ~1ms to 50ms+ depending on load. Without pausing it, this
  // assertion was racing that background smoothing and read a different,
  // never-reproducible number on every run — real nondeterminism, not a flaky
  // test masking a real bug.
  await page.evaluate((st) => {
    window.__pauseNet(true);
    window.__fakeRoom.onRemoteUpdate('riley', st);
  }, remoteState({ pos: [20, 0.05, -34] }));
  const { rightAfter, later } = await page.evaluate(() => {
    window.__stepNetSmoothing(1 / 60, 1);
    const rightAfter = window.__onlineRemotes.get('riley').pos[0];
    window.__stepNetSmoothing(1 / 60, 59);
    const later = window.__onlineRemotes.get('riley').pos[0];
    window.__pauseNet(false);
    return { rightAfter, later };
  });
  // smooth(10, 20, 1/60, 14) works out to ~12.08 exactly — computed from the
  // same formula js/net.js uses, not eyeballed, with a little margin either side.
  check(rightAfter > 11.5 && rightAfter < 12.7, `one exact 1/60s step eases partway toward the target rather than snapping (got ${rightAfter.toFixed(3)}, want ~12.08)`);
  check(later > rightAfter && later > 19.9 && later <= 20.001, `...and a full second of stepping has essentially caught up (got ${later.toFixed(3)})`);

  // ---- a hit relayed to me actually costs health, from the right attacker ----
  const before = await page.evaluate(() => window.__human.hp);
  await page.evaluate(() => { window.__fakeRoom.hits.push({ amount: 27, kind: 'hitscan', dir: [0, 0, -1], knock: 0, attackerId: 'riley' }); });
  await frames(2);
  const after = await page.evaluate(() => window.__human.hp);
  check(before - after === 27, `a relayed hit reduces MY OWN health by exactly what was reported (${before} -> ${after})`);

  // ---- I never apply damage locally to someone else's health -----------------
  const rileyHpBefore = await page.evaluate(() => window.__onlineRemotes.get('riley').hp);
  await page.evaluate(() => {
    const g = window.__game, riley = window.__onlineRemotes.get('riley');
    g.damage(riley, 500, window.__human, 'hitscan', [0, 0, 1], 0);
  });
  const rileyHpAfter = await page.evaluate(() => window.__onlineRemotes.get('riley').hp);
  const relayed = await page.evaluate(() => window.__fakeRoom.calls.relayDamage.slice());
  check(rileyHpBefore === rileyHpAfter, "hitting a remote player does not change their health on MY screen — that is never mine to decide");
  check(relayed.length === 1 && relayed[0].uid === 'riley' && relayed[0].amount === 500,
    `...instead it is relayed to them, addressed to the right person, for the right amount (got ${JSON.stringify(relayed)})`);

  // ---- firing broadcasts a cosmetic shot, once, not every frame -------------
  await page.evaluate(() => {
    const h = window.__human; h.wi = h.weapons.indexOf('rpg'); h.cooldown = 0;
    window.__game.fire(h, h.weapon());
  });
  await frames(4);
  const shots = await page.evaluate(() => window.__fakeRoom.calls.relayShot.length);
  check(shots === 1, `firing a rocket relays exactly one cosmetic shot, not one per frame it is in flight (got ${shots})`);

  // ---- a ghost projectile never deals real damage ----------------------------
  const hpBeforeGhost = await page.evaluate(() => window.__human.hp);
  await page.evaluate(() => {
    const g = window.__game;
    const ghost = new (window.Projectile)({ type: 'rocket', pos: window.__human.eye(), vel: [0, 0, 0], owner: window.__onlineRemotes.get('riley'), dmg: 500, radius: 20, isGhost: true });
    g.explodeProjectile(ghost);
  });
  const hpAfterGhost = await page.evaluate(() => window.__human.hp);
  check(hpBeforeGhost === hpAfterGhost, "a ghost projectile exploding right on top of me does not touch my health — the real hit already came, or will come, through the relay channel");

  // ---- host state publishes; a non-host's publishState is a no-op elsewhere -
  // (that half is net.js's own contract, proven in test/net.test.js; here we
  // only confirm game.js actually calls publishState while host, on a timer.)
  await frames(20);
  const stateCalls = await page.evaluate(() => window.__fakeRoom.calls.publishState.length);
  check(stateCalls > 0, 'the host periodically publishes shared match state (score, round)');

  // ---- sentries are blocked online, with a working control -------------------
  // p.building (not game.sentries) is the signal: finishSentry only fires
  // several simulated seconds after a successful startBuild(), so checking
  // sentries.length on the timescale of a couple of frames would read as
  // "blocked" whether or not the key press actually did anything — building
  // flips the instant startBuild() succeeds, which is the thing worth proving.
  await page.evaluate(() => {
    const h = window.__human;
    h.cls = 'engineer'; h.weapons = window.CLASSES.engineer.weapons.slice(); h.wi = 0;
    h.ammo.cells = 200; h.onGround = true; h.vel = [0, 0, 0]; h.pos = [0, 0.05, -34]; h.yaw = 0; h.building = 0;
  });
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })));
  await frames(2);
  const buildingWhileOnline = await page.evaluate(() => window.__human.building);
  check(buildingWhileOnline === 0, 'pressing the sentry build key while online does nothing (not synced yet — see DEPLOY.md)');
  // control: the SAME key, offline, must still work — otherwise this could be
  // "the key binding broke" rather than "online correctly blocked it".
  await page.evaluate(() => { window.__leaveOnline(); });
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })));
  await frames(2);
  const buildingOffline = await page.evaluate(() => window.__human.building);
  check(buildingOffline > 0, `...and the same key still works normally offline (control): p.building is ${buildingOffline}, want > 0`);

  // ---- leaving cleans up remote players --------------------------------------
  await page.evaluate((st) => { window.__injectNet(window.__fakeRoom); window.__fakeRoom.onRemoteJoin('riley2', st); }, remoteState({ name: 'Riley2' }));
  await page.evaluate(() => window.__leaveOnline());
  const afterLeave = await page.evaluate(() => ({
    net: !!window.__net(), remotes: window.__onlineRemotes.size,
    stillInPlayers: window.__game.players.some((p) => p.isRemote),
  }));
  check(!afterLeave.net && afterLeave.remotes === 0 && !afterLeave.stillInPlayers,
    'leaving disconnects and removes every remote player — none of them linger as ghosts in the match');

  await browser.close();
  if (errs.length) { console.log('CONSOLE ERRORS:\n  ' + errs.join('\n  ')); failures++; }
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nmultiplayer test OK');
  clearTimeout(DEADLINE);
  process.exit(failures ? 1 : 0);

  function check(cond, msg) { cond ? pass(msg) : fail(msg); }
})().catch((e) => { console.log('FAIL multiplayer bench threw: ' + (e && e.stack || e)); process.exit(1); });
