// bugscan.js -- probes for the first static-scan fixes (gearbox per car, garage re-select, derby spill, cloud merge rule, owed lap, menu input, pause clock)
const { serve, launch, openGame, checker } = require('./common');
(async () => {
  const { srv, url } = await serve(); const b = await launch();
  const { page: p, errs } = await openGame(b, url, { career: { name: 'OTTO', cash: 4000000, cars: ['revuelto', 'aventador', 'countach', 'lpi', 'sc18'], paints: [0, 1], updated: 1 } });
  const { run, results, report } = checker(p);
  const selectCar = async id => { await p.evaluate(id => window.__sim.carSelect(id), id); await p.waitForFunction(id => { const s = window.__sim; if (s.carId !== id) return false; let n = 0; s.car.traverse(o => { if (o.isMesh && o.visible) n++; }); return n > 20; }, id, { timeout: 240000 }); await p.waitForTimeout(300); };
  const measure = () => p.evaluate(() => { const s = window.__sim; s.car.updateMatrixWorld(true); const box = new THREE.Box3(); s.car.traverse(o => { if (o.isMesh && o.castShadow) { let v = true; for (let q = o; q; q = q.parent) if (!q.visible) { v = false; break; } if (v) box.expandByObject(o); } }); const sz = box.getSize(new THREE.Vector3()); const w = s.customWheels(); return { long: +Math.max(sz.x, sz.z).toFixed(2), h: +sz.y.toFixed(2), wheels: w ? w.length : 0, spec: s.CAR.length }; });

  // 1. AUTO gearbox reaches the top gears in every car
  const gearbox = {};
  for (const id of ['revuelto', 'aventador', 'countach', 'lpi', 'sc18']) {
    await selectCar(id);
    gearbox[id] = await p.evaluate(() => { const s = window.__sim; s.setMode(3); s.placeOnTrack(0); s.st.auto = true; s.st.u = 0; s.st.w = 0; s.st.d = 0; s.st.gear = 1; s.st.rpm = s.CAR.idle; s.inp.steer = 0; s.inp.brake = 0; s.inp.hand = false; s.inp.nos = false; s.inp.throttle = 1;
      let gmax = 1, kmh = 0; for (let i = 0; i < 200 * 10; i++) { s.step(1 / 200); gmax = Math.max(gmax, s.st.gear); kmh = Math.max(kmh, s.st.u * 3.6); } s.inp.throttle = 0; return { gear: gmax, kmh: Math.round(kmh), redline: s.CAR.redline }; });
  }
  results.push([Object.values(gearbox).every(g => g.gear >= 4 && g.kmh > 180) ? 'PASS' : 'FAIL', 'AUTO gearbox: every car reaches 4th+ and 180 km/h in 10 s (was: stuck in 1st for every shop car)', JSON.stringify(gearbox)]);

  // 2. garage re-select: the car comes back the same size with the same wheels
  const sizes = {};
  for (const id of ['aventador', 'sc18', 'countach']) { await selectCar(id); const a = await measure(); await selectCar('revuelto'); await selectCar(id); const b = await measure(); sizes[id] = { first: a, again: b }; }
  results.push([Object.values(sizes).every(x => Math.abs(x.first.long - x.again.long) < 0.05 && x.first.wheels === x.again.wheels && x.again.wheels >= 4 && Math.abs(x.again.long - x.again.spec) < 0.3) ? 'PASS' : 'FAIL', 'garage re-select keeps size and wheels', JSON.stringify(sizes)]);
  await selectCar('revuelto');

  // 3. derby: a hit on dead zones spills into the live ones
  await run('derby: nose hit with front+mid dead still hurts', () => { const s = window.__sim; const Z = s.st.zone; const keep = { ...Z }; Object.assign(Z, { front: 0, mid: 0, rear: 100, wheels: 100 }); s.damageZones(40, { front: 0.75, mid: 0.25 }); const hp = s.st.hp, zz = { ...Z }; Object.assign(Z, keep); s.damageZones(0, {}); return { ok: hp < 49 && hp > 0, info: { hp: +hp.toFixed(1), zones: zz } }; });

  // 4. cloud merge rule, with the Firestore doc mocked
  await run('cloud: sign-in never lets a fresh browser or another account overwrite', async () => { const s = window.__sim, c = s.cloud; const START = 5000;
    let setCalls = 0, remote = null; c.ok = true; c.doc = () => ({ get: async () => ({ exists: !!remote, data: () => remote }), set: async () => { setCalls++; } }); c.claimName = async () => 'OK'; const out = {};
    // a) fresh browser (one lap of earnings), established account: cloud wins
    s.careerReset(); s.career.cash = 7000; s.career.stats.earned = 500; s.career.updated = Date.now(); remote = { cash: 250000, stats: { earned: 300000, races: 40, wins: 10, podiums: 20 }, updated: Date.now() - 86400000, tiers: {}, paints: [0, 1], cars: ['revuelto'], car: 'revuelto' };
    c.user = { uid: 'B' }; await c.pull(); out.a = { cash: s.career.cash, uid: s.career.uid };
    // b) another account's career in this browser, this account has a record: cloud wins even though local is newer
    s.career.uid = 'A'; s.career.cash = 999999; s.career.updated = Date.now() + 5000; await c.pull(); out.b = { cash: s.career.cash, uid: s.career.uid };
    // c) another account's career in this browser, this account has nothing: start fresh, do not inherit
    remote = null; s.career.uid = 'A'; s.career.cash = 999999; setCalls = 0; await c.pull(); await new Promise(r => setTimeout(r, 1000)); out.c = { cash: s.career.cash, uid: s.career.uid, pushed: setCalls };
    // d) same account, local newer: local wins and is pushed
    remote = { cash: 1, stats: { earned: 0 }, updated: 10, tiers: {}, paints: [0, 1], cars: ['revuelto'], car: 'revuelto' }; s.career.cash = 4000000; s.career.updated = Date.now(); s.career.uid = 'B'; setCalls = 0; await c.pull(); await new Promise(r => setTimeout(r, 1000)); out.d = { cash: s.career.cash, pushed: setCalls };
    // e) long local career, never signed in, account with less progress: local wins
    s.career.uid = null; s.career.cash = 80000; s.career.stats.earned = 120000; remote = { cash: 9000, stats: { earned: 2000 }, updated: Date.now() + 1, tiers: {}, paints: [0, 1], cars: ['revuelto'], car: 'revuelto' }; await c.pull(); out.e = { cash: s.career.cash, uid: s.career.uid };
    c.user = null; c.ok = false; s.career.cash = 4000000; s.career.uid = null; s.career.name = 'OTTO'; document.getElementById('namebox').classList.add('hidden');   // a nameless synced career opens the name box (intended); close it so later key tests reach the game
    return { ok: out.a.cash === 250000 && out.a.uid === 'B' && out.b.cash === 250000 && out.b.uid === 'B' && out.c.cash === START && out.c.uid === 'B' && out.c.pushed === 1 && out.d.cash === 4000000 && out.d.pushed === 1 && out.e.cash === 80000 && out.e.uid === 'B', info: out }; });

  // 5. reset behind the line owes the lap back and keeps the half-lap evidence; a first-lap reset does not invent a lap
  await run('laps: R behind the line keeps the owed lap honest', () => { const s = window.__sim; const G = s.GAME, st = s.st; const keep = G.state; G.state = 'racing'; G.mode = 'time';
    st.lastP = 0.02; st.lapsDone = 2; st.crossings = 3; st.halfSeen = false; s.placeOnTrack(s.N - 10); const a = { laps: st.lapsDone, cross: st.crossings, half: st.halfSeen };
    st.lastP = 0.02; st.lapsDone = 0; st.crossings = 1; st.halfSeen = false; s.placeOnTrack(s.N - 10); const b = { laps: st.lapsDone, cross: st.crossings, half: st.halfSeen };
    G.state = keep; G.mode = 'solo'; s.placeOnTrack(0); return { ok: a.laps === 1 && a.cross === 2 && a.half === true && b.laps === 0 && b.cross === 0 && b.half === false, info: { a, b } }; });

  // 6. menu: held keys do not drive the car behind it (since round two: keys latch everywhere, readInput gives the car nothing while the menu is up)
  await run('menu: keys do not drive the car behind it', () => { const s = window.__sim; s.keys.KeyW = true; s.keys.ArrowUp = true; document.getElementById('start').classList.add('hidden'); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    const menu = !document.getElementById('start').classList.contains('hidden'); s.readInput(); const thrHeld = s.inp.throttle;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); s.readInput(); const thrPressed = s.inp.throttle;
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp' }));
    return { ok: menu && thrHeld === 0 && thrPressed === 0, info: { menu, thrHeld, thrPressed } }; });

  // 7. pause moves the lap clock forward by the pause
  await p.evaluate(() => { const s = window.__sim; document.getElementById('start').classList.add('hidden'); s.st.started = true; s.st.lapStart = performance.now(); window.__t0 = s.st.lapStart; });
  const twoFrames = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(performance.now())))));   // SwiftShader frames take seconds: frame() must actually see the toggle
  await twoFrames(); const tOpen = await p.evaluate(() => { document.getElementById('settings').classList.remove('hidden'); return performance.now(); });
  await twoFrames(); await p.waitForTimeout(1500); await twoFrames(); const tClose = await p.evaluate(() => { document.getElementById('settings').classList.add('hidden'); return performance.now(); }); await twoFrames();
  const moved = await p.waitForFunction(() => window.__sim.st.lapStart - window.__t0 > 1500, null, { timeout: 30000 }).then(() => true).catch(() => false);
  const shift = await p.evaluate(() => Math.round(window.__sim.st.lapStart - window.__t0));
  results.push([moved ? 'PASS' : 'FAIL', 'pause: lap clock shifts by the pause', JSON.stringify({ shiftMs: shift, heldMs: Math.round(tClose - tOpen) })]);

  // 8. arena furniture gone
  const arenaFlag = await p.evaluate(() => window.__sim.ARENA);
  results.push([arenaFlag === false ? 'PASS' : 'FAIL', 'ARENA flag false on a circuit', JSON.stringify({ arenaFlag })]);

  const ok = report(errs); await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})();
