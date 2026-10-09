// sweep.js -- the main regression sweep (20 checks; was scratchpad sweepA.js). node sweep.js  [HOST=dist/hosting dir]
const { serve, launch, openGame, checker } = require('./common');
(async () => {
  const { srv, url } = await serve(); const b = await launch();
  const { page: p, errs } = await openGame(b, url);
  const { run, report } = checker(p);
  // in-page helpers: put the car on a sample with a speed, and cross the start line once with the half-lap already seen
  await p.evaluate(() => {
    const s = window.__sim;
    window.__at = (idx, u = 0) => { const st = s.st; st.lastP = 0.5; s.placeOnTrack(idx); st.u = u; s.syncPose(); };
    window.__cross = () => { const s = window.__sim, st = s.st; window.__at(s.N - 4, 40); st.halfSeen = true; for (let i = 0; i < 240 && st.trackIdx > s.N / 2; i++) s.step(1 / 120); };
    window.__go = () => { const s = window.__sim; s.GAME.cd = 0.01; s.raceTick(0.02); };
  });

  await run('boot: model, wheels, no NaN in the pose', () => { const s = window.__sim; let n = 0; s.car.traverse(o => { if (o.isMesh) n++; });
    const fin = v => Number.isFinite(v); const w = s.customWheels();
    return { ok: n > 20 && fin(s.st.x) && fin(s.st.y) && fin(s.st.z) && fin(s.st.u) && fin(s.camera.position.x) && (!w || w.length === 4 || w.length === 6), info: { meshes: n, wheels: w ? w.length : 0, pos: [s.st.x, s.st.y, s.st.z].map(v => +v.toFixed(2)), car: s.carId, version: s.VERSION } }; });

  await run('spline: length, curvature and height all finite', () => { const s = window.__sim; let bad = 0, maxK = 0;
    for (let i = 0; i < s.N; i++) { const q = s.S[i]; if (!Number.isFinite(q.x) || !Number.isFinite(q.y) || !Number.isFinite(q.z)) bad++; maxK = Math.max(maxK, Math.abs(s.KAPPA[i])); }
    const gaps = []; for (let i = 0; i < s.N; i++) { const a = s.S[i], c = s.S[(i + 1) % s.N]; gaps.push(Math.hypot(a.x - c.x, a.z - c.z)); }
    return { ok: bad === 0 && Number.isFinite(s.trackLen) && s.trackLen > 100 && maxK < 1, info: { N: s.N, len: +s.trackLen.toFixed(1), badPts: bad, maxKappa: +maxK.toFixed(4), maxGap: +Math.max(...gaps).toFixed(2) } }; });

  await run('physics bench: 0-100, 0-200, v-max, 100-0 braking', () => { const s = window.__sim, st = s.st;
    s.setMode(3); s.placeOnTrack(0); st.u = 0; st.w = 0; st.d = 0; st.gear = 1; st.rpm = s.CAR.idle; Object.assign(s.inp, { steer: 0, brake: 0, hand: false, nos: false, throttle: 1 });
    const dt = 1 / 200; let t = 0, t100 = null, t200 = null, vmax = 0;
    for (let i = 0; i < 200 * 60; i++) { s.step(dt); t += dt; const kmh = st.u * 3.6; vmax = Math.max(vmax, kmh); if (t100 === null && kmh >= 100) t100 = t; if (t200 === null && kmh >= 200) t200 = t; if (t > 55) break; }
    s.placeOnTrack(0); st.u = 100 / 3.6; st.w = 0; st.d = 0; s.inp.throttle = 0; s.inp.brake = 1; let d = 0, tb = 0;
    for (let i = 0; i < 200 * 20 && st.u > 0.1; i++) { const u0 = st.u; s.step(dt); d += (u0 + st.u) / 2 * dt; tb += dt; }
    s.inp.brake = 0; s.placeOnTrack(0);
    const info = { '0-100s': t100 && +t100.toFixed(2), '0-200s': t200 && +t200.toFixed(2), vmaxKmh: Math.round(vmax), 'brake100-0m': +d.toFixed(1), brakeS: +tb.toFixed(2) };
    return { ok: t100 && t100 < 4 && t200 && t200 < 9 && vmax > 300 && d < 45, info }; });

  await run('drive modes: power ladder and EV flag', () => { const s = window.__sim, st = s.st; const out = [];
    for (let m = 0; m < 4; m++) { s.setMode(m); s.placeOnTrack(0); st.u = 0; st.gear = 1; st.rpm = s.CAR.idle; st.auto = true; Object.assign(s.inp, { steer: 0, brake: 0, hand: false, nos: false, throttle: 1 });
      for (let i = 0; i < 200 * 6; i++) s.step(1 / 200); out.push(+(st.u * 3.6).toFixed(1)); }
    s.inp.throttle = 0; s.setMode(1); s.placeOnTrack(0);
    return { ok: s.MODES[0].ev === true && out[0] < out[1] && out[1] < out[2] + 1 && out[2] < out[3] + 1 && out[3] > 150, info: { kmhAfter6s: out } }; });

  await run('reset, spin recovery and off-track do not NaN', () => { const s = window.__sim, st = s.st; window.__at(500, 40); st.d = 40; for (let i = 0; i < 120; i++) s.step(1 / 120);
    const wall = s.wallLimitAt(st.s); const dAfter = st.d; st.spinT = 1.5; st.spinW = 4; st.u = 40; for (let i = 0; i < 360; i++) s.step(1 / 120);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyR' }));
    const fin = [st.x, st.y, st.z, st.u, st.w, st.d, st.s, st.psi].every(Number.isFinite);
    return { ok: fin && Math.abs(dAfter) <= wall + 0.01, info: { finite: fin, d: +dAfter.toFixed(2), wall: +wall.toFixed(2), u: +st.u.toFixed(1) } }; });

  await run('paint: setPaint recolours, locked paints gated', () => { const s = window.__sim; const col = () => { let h = null; s.car.traverse(o => { if (h == null && o.isMesh && o.userData.paint && o.material.color) h = o.material.color.getHex(); }); return h; };
    s.setPaint(1); const hex1 = col(); const other = s.PAINTS.findIndex((P, i) => i > 1 && s.ownsPaint(i)); const target = other > 0 ? other : 0; s.setPaint(target); const hex2 = col(); s.setPaint(1);
    const locked = s.PAINTS.findIndex((P, i) => !s.ownsPaint(i));
    return { ok: s.PAINTS.length >= 10 && hex1 != null && hex1 !== hex2 && s.ownsPaint(1) && locked > 0, info: { paints: s.PAINTS.length, hex1, hex2, ownsFree: s.ownsPaint(1), lockedGated: locked > 0 } }; });

  await run('shop: buy part, buy paint, buy car, cash and persistence', () => { const s = window.__sim, c = s.career; const cash = [c.cash];
    const r1 = s.buyPart('engine'); cash.push(c.cash); const pi = s.PAINTS.findIndex((P, i) => !s.ownsPaint(i)); const r2 = s.buyPaint(pi); cash.push(c.cash); const r3 = s.buyCar('aventador'); cash.push(c.cash);
    const keep = c.cash; c.cash = 0; const poor = s.buyPart('tyres'); c.cash = keep; s.careerSave();
    const saved = JSON.parse(localStorage.getItem('revuelto.career'));
    return { ok: r1 === 'OK' && r2 === 'OK' && r3 === 'OK' && poor === 'NOT ENOUGH CASH' && cash[1] < cash[0] && cash[2] < cash[1] && cash[3] < cash[2] && saved.cars.includes('aventador') && saved.tiers.engine === 1,
      info: { r1, r2, r3, poorGuard: poor, cash, savedCars: saved.cars, savedTier: saved.tiers.engine } }; });

  await run('career save/load round trip is defensive', () => { const s = window.__sim, c = s.career; s.careerSave(); const good = localStorage.getItem('revuelto.career'); const cash = c.cash;
    localStorage.setItem('revuelto.career', JSON.stringify({ cash: 'lots', tiers: { engine: 99 }, paints: 'x', cars: [5, 'nope', 'revuelto'] })); let threw = false; try { s.careerLoad(); } catch (e) { threw = true; }
    const after = { cash: c.cash, tiersEngine: c.tiers.engine, paintsIsArray: Array.isArray(c.paints), cars: c.cars.slice() };
    localStorage.setItem('revuelto.career', 'not json{'); try { s.careerLoad(); } catch (e) { threw = true; }
    localStorage.setItem('revuelto.career', good); s.careerLoad(); s.retune();
    return { ok: !threw && after.cash === cash && after.tiersEngine === 3 && after.paintsIsArray && !after.cars.includes('nope') && c.cash === cash, info: { cash: after.cash, cars: after.cars, tiersEngine: after.tiersEngine, restored: c.cash } }; });

  await run('tuning: parts actually change the car', () => { const s = window.__sim; const keep = Object.assign({}, s.career.tiers);
    const base = { power: s.TUNE.power, grip: s.TUNE.grip, mass: s.TUNE.mass };   // retune() writes TUNE (multipliers applied in step), not CAR
    for (const k of Object.keys(s.career.tiers)) s.career.tiers[k] = 3; s.retune(); const tuned = { power: s.TUNE.power, grip: s.TUNE.grip, mass: s.TUNE.mass };
    Object.assign(s.career.tiers, keep); s.retune();
    return { ok: tuned.power > base.power && tuned.grip > base.grip && tuned.mass < base.mass, info: { base, tuned } }; });

  await run('TIME TRIAL: countdown, laps, finish, results, prize', () => { const s = window.__sim, G = s.GAME; const cash0 = s.career.cash;
    s.startRace('time', 3); const start = G.state; window.__go(); for (let k = 0; k < 6 && G.state !== 'finished'; k++) window.__cross();
    return { ok: start === 'countdown' && G.state === 'finished' && s.st.lapsDone === 3 && G.lapTimes.length === 3 && G.prize >= 4500 && s.career.cash === cash0 + G.prize,
      info: { start, end: G.state, laps: s.st.lapsDone, lapTimes: G.lapTimes.length, prize: G.prize, cash: s.career.cash } }; });

  await run('VERSUS: grid still before GO, rivals race, standings, finish', () => { const s = window.__sim, G = s.GAME, st = s.st;
    s.startRace('versus', 1); const s0 = s.ai.map(a => a.s); for (let i = 0; i < 60; i++) s.raceTick(1 / 60); const drift = Math.max(...s.ai.map((a, k) => Math.abs(a.s - s0[k])));
    window.__go(); for (let i = 0; i < 60 * 8; i++) { s.step(1 / 60); s.raceTick(1 / 60); } const speeds = s.ai.map(a => Math.round(a.u * 3.6));
    for (let k = 0; k < 4 && G.state !== 'finished'; k++) window.__cross(); const rows = s.standings().length;
    return { ok: s.ai.length === 3 && drift < 0.01 && Math.min(...speeds) > 150 && G.state === 'finished' && rows === 4, info: { rivals: s.ai.length, maxGridDrift: +drift.toFixed(3), rivalSpeeds: speeds, rows, state: G.state } }; });

  await run('DERBY: damage zones, wrecks, last car standing, payout', () => { const s = window.__sim, G = s.GAME, st = s.st; const cash0 = s.career.cash;
    s.startRace('derby', 1); window.__go(); const n = s.ai.length; let tries = 0;
    for (const a of s.ai) { let g = 0; while (!a.wrecked && g++ < 40) { st.d = 0; st.psi = 0; a.s = (st.s + 4.2) % s.trackLen; a.d = 0; a.u = 0; a.dv = 0; st.u = 22; for (let i = 0; i < 30; i++) s.step(1 / 120); for (let i = 0; i < 48; i++) { st.u = 0; s.step(1 / 120); } tries++; } }
    s.raceTick(0.02);
    return { ok: n >= 3 && s.ai.every(a => a.wrecked) && G.state === 'finished' && st.wrecks === n && G.prize > 0 && s.career.cash === cash0 + G.prize && st.hp > 0,
      info: { rivals: n, wrecked: s.ai.filter(a => a.wrecked).length, rams: tries, state: G.state, prize: G.prize, myHp: +st.hp.toFixed(1), zones: Object.assign({}, st.zone) } }; });

  await run('DERBY: the per-pair cooldown leaves one clean hit unchanged', () => { const s = window.__sim, st = s.st;
    const hit = (noCooldown) => { s.startRace('derby', 1); window.__go(); const a = s.ai[0]; st.d = 0; st.psi = 0; a.s = (st.s + 4.2) % s.trackLen; a.d = 0; a.u = 0; a.dv = 0; st.u = 22; let frames = 0;
      for (let i = 0; i < 60; i++) { if (noCooldown) { for (const r of s.ai) { r.dmgT = 0; if (r.pairT) for (const k in r.pairT) r.pairT[k] = 0; } } const h0 = a.hp; s.step(1 / 120); if (a.hp < h0) frames++; }
      return { rival: +(100 - a.hp).toFixed(2), me: +(100 - st.hp).toFixed(2), damageFrames: frames }; };
    const withCd = hit(false), without = hit(true);
    return { ok: withCd.rival > 5 && Math.abs(withCd.rival - without.rival) < 0.01 && Math.abs(withCd.me - without.me) < 0.01, info: { withCooldown: withCd, withoutCooldown: without } }; });

  await run('DERBY: player wreck ends the race and freezes control', () => { const s = window.__sim, G = s.GAME, st = s.st;
    s.startRace('derby', 1); window.__go(); for (const z in st.zone) st.zone[z] = 1; st.hp = 1;
    const a = s.ai[0]; a.s = (st.s - 3.0 + s.trackLen) % s.trackLen; a.d = st.d; a.u = 25; st.u = 0; for (let i = 0; i < 40; i++) { s.step(1 / 60); s.raceTick(1 / 60); }
    s.readInput();
    return { ok: st.wrecked && G.state === 'finished' && s.inp.throttle === 0 && s.inp.brake === 1 && st.hp === 0, info: { wrecked: st.wrecked, state: G.state, throttle: s.inp.throttle, brake: s.inp.brake, hp: st.hp, zones: Object.assign({}, st.zone) } }; });

  await run('HUD in derby: LEFT / HP, damage panel visible, standings moved', () => { const s = window.__sim; s.startRace('derby', 1); window.__go(); s.updateRaceHUD();
    const $ = id => document.getElementById(id); const pos = $('race-pos').textContent, lap = $('race-lap').textContent, pct = $('dmg-pct') ? $('dmg-pct').textContent : '';
    return { ok: /^LEFT/.test(pos) && /^HP/.test(lap) && !$('damage').classList.contains('hidden') && $('race').classList.contains('derby') && /%$/.test(pct), info: { pos, lap, dmgHidden: $('damage').classList.contains('hidden'), pct } }; });

  await run('back to menu clears rivals and hides race HUD', () => { const s = window.__sim; const before = s.ai.length; document.getElementById('start').classList.add('hidden'); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Escape' }));
    const $ = id => document.getElementById(id);
    return { ok: before > 0 && s.ai.length === 0 && $('race').classList.contains('hidden') && !$('start').classList.contains('hidden') && s.GAME.state === 'free', info: { rivalsBefore: before, rivalsAfter: s.ai.length, raceHidden: $('race').classList.contains('hidden'), menu: !$('start').classList.contains('hidden') } }; });

  await run('garage: rooms, quick paints, shop pane', () => { const s = window.__sim; s.garageEnter(); const rooms = Object.keys(s.ROOMS); const out = {};
    for (const r of ['studio', 'showroom', 'shop']) { document.querySelector('#g-room button[data-r=' + r + ']').click(); out[r] = { shopHidden: document.getElementById('g-shop').classList.contains('hidden'), quickHidden: document.getElementById('g-quickpaint').classList.contains('hidden') }; }   // SHOP is a view (garageSetView), not a ROOMS entry
    document.querySelector('#g-room button[data-r=studio]').click(); s.garageLeave();
    return { ok: rooms.length >= 2 && out.shop.shopHidden === false && out.studio.shopHidden === true && out.studio.quickHidden === false, info: { rooms, out } }; });

  // settings must freeze the physics, not just overlay it: drive under the frame loop, open settings, and the car must stop moving
  const raf = n => p.evaluate(n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  await p.evaluate(() => { const s = window.__sim; document.getElementById('start').classList.add('hidden'); s.st.started = true; window.__at(800, 30); s.keys.KeyW = true; });
  await raf(3); const sA = await p.evaluate(() => window.__sim.st.s); await raf(3); const sB = await p.evaluate(() => window.__sim.st.s);
  await p.evaluate(() => document.getElementById('settings').classList.remove('hidden')); await raf(3); const sC = await p.evaluate(() => window.__sim.st.s); await raf(4); const sD = await p.evaluate(() => window.__sim.st.s);
  await p.evaluate(() => { document.getElementById('settings').classList.add('hidden'); window.__sim.keys.KeyW = false; window.__sim.st.started = false; document.getElementById('start').classList.remove('hidden'); });
  await run('settings pauses the game', (v) => ({ ok: v.moving > 0.05 && Math.abs(v.paused) < 1e-6, info: v }), { moving: +(sB - sA).toFixed(3), paused: +(sD - sC).toFixed(6) });

  await run('wing fits without shrinking (fitWing on the spec, not a raycast)', async () => { const s = window.__sim; const keep = s.career.tiers.aero; s.career.tiers.aero = 2; s.retune();
    const t0 = performance.now(); while (!s.wingNode && performance.now() - t0 < 60000) await new Promise(r => setTimeout(r, 250));
    const w = s.wingNode; let size = null;
    if (w) {   // in the car's own frame (x forward, z across): a world-axis box mixes span and depth whenever the car is not square to the world
      s.car.updateMatrixWorld(true); const inv = s.car.matrixWorld.clone().invert(), box = new THREE.Box3(), m = new THREE.Matrix4();
      w.traverse(o => { if (o.isMesh) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld))); } });
      const v = box.getSize(new THREE.Vector3()); size = [v.x, v.y, v.z].map(x => +x.toFixed(2)); }
    s.career.tiers.aero = keep; s.retune();
    return { ok: !!w && Math.abs(size[2] - s.CAR.width * 0.94) < 0.06 && size[0] < 1.5, info: { hasWing: !!w, sizeCarFrame: size, spanTarget: +(s.CAR.width * 0.94).toFixed(2) } }; });

  await run('no NaN anywhere after the whole sweep', () => { const s = window.__sim, st = s.st; const bad = [];
    for (const k in st) { const v = st[k]; if (typeof v === 'number' && !Number.isFinite(v) && v !== Infinity) bad.push(k); }
    for (const v of [s.camera.position.x, s.camera.position.y, s.camera.position.z]) if (!Number.isFinite(v)) bad.push('camera');
    return { ok: bad.length === 0 && Number.isFinite(s.career.cash), info: { bad, cash: s.career.cash } }; });

  const ok = report(errs); await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})();
