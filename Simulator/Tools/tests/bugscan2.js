// bugscan2.js -- probes for the round-two fixes (the review of the static scan)
const { serve, launch, openGame, checker } = require('./common');
(async () => {
  const { srv, url } = await serve(); const b = await launch();
  const { page: p, errs } = await openGame(b, url, { career: { name: 'OTTO', cash: 4000000, cars: ['revuelto', 'aventador', 'countach', 'lpi', 'sc18'], paints: [0, 1], updated: 1 } });
  const { run, results, report } = checker(p);
  const selectCar = async id => { await p.evaluate(id => window.__sim.carSelect(id), id); await p.waitForFunction(id => { const s = window.__sim; if (s.carId !== id) return false; let n = 0; s.car.traverse(o => { if (o.isMesh && o.visible) n++; }); return n > 20; }, id, { timeout: 240000 }); await p.waitForTimeout(300); };
  const rafs = n => p.evaluate(n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

  // 1. wrecked while reversing: the latch clears and the wreck does not drive backwards
  await run('derby: wreck while in reverse does not reverse away', () => { const s = window.__sim, st = s.st, G = s.GAME; const keep = { mode: G.mode, state: G.state };
    G.mode = 'derby'; G.state = 'racing'; st.wrecked = false; for (const z in st.zone) st.zone[z] = 1; st.hp = 1; s.placeOnTrack(200); st.reverse = true; st.u = -2;
    s.playerDamage(50, { mid: 1 }); const rev = st.reverse; let minU = 0; for (let i = 0; i < 240; i++) { s.readInput(); s.step(1 / 120); minU = Math.min(minU, st.u); }
    const out = { wrecked: st.wrecked, reverseAfterWreck: rev, uAfter2s: +st.u.toFixed(2), minU: +minU.toFixed(2) };
    st.wrecked = false; for (const z in st.zone) st.zone[z] = 100; st.hp = 100; G.mode = keep.mode; G.state = 'free'; s.placeOnTrack(0);
    return { ok: out.wrecked && !out.reverseAfterWreck && out.uAfter2s > -0.5 && out.minU >= -2.01, info: out }; });

  // 2. tach + gearbox: the Countach never shifts into its flat 7th/8th on AUTO, even at 320 km/h off a pad
  await selectCar('countach');
  await run('Countach AUTO stops at 6th (no 6>7>8 flicker)', () => { const s = window.__sim, st = s.st; s.setMode(3); s.placeOnTrack(0); st.auto = true; st.gear = 5; st.u = 320 / 3.6; st.rpm = s.CAR.redline; s.inp.throttle = 1; let gmax = 0;
    for (let i = 0; i < 400; i++) { st.u = Math.max(st.u, 300 / 3.6); s.step(1 / 200); gmax = Math.max(gmax, st.gear); } s.inp.throttle = 0; s.placeOnTrack(0);
    return { ok: gmax === 5, info: { maxGearShown: gmax + 1, tops: s.CAR.gearTopKmh } }; });
  await selectCar('revuelto');

  // 3. roof clip: cockpit cam's plane is cleared on entering the garage
  await run('garage clears the cockpit roof clip', async () => { const s = window.__sim; s.st.cam = 2; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const before = s.roofClip.constant; s.garageEnter(); const after = s.roofClip.constant; s.garageLeave(); s.st.cam = 0;
    return { ok: before < 1e8 && after >= 1e9, info: { before: +before.toFixed(2), after } }; });

  // 4. preview tokens: a slow download never replaces a later choice; reflect pass keeps the real car hidden under a preview
  await selectCar('aventador'); await selectCar('revuelto');   // aventador is now cached in carRoots, lpi is not
  await run('shop preview: later cached click beats a slow download', async () => { const s = window.__sim; s.garageEnter();
    s.garagePreview('lpi'); s.garagePreview('aventador'); const first = s.previewCar;
    await new Promise(r => setTimeout(r, 15000)); const after = s.previewCar;
    s.garagePreview('lpi'); const landed = s.previewCar === 'lpi';   // synchronous only if the download finished during the wait: proves the test tested something
    s.garagePreviewClear(); const cleared = s.previewCar; s.garageLeave();
    return { ok: landed && first === 'aventador' && after === 'aventador' && cleared === null, info: { first, after15s: after, downloadLanded: landed, cleared } }; });
  await run('shop preview: BACK TO MY CAR beats a slow download', async () => { const s = window.__sim; s.garageEnter();
    s.garagePreview('sc18'); s.garagePreviewClear(); await new Promise(r => setTimeout(r, 15000)); const after = s.previewCar, carVisible = s.car.visible;
    s.garagePreview('sc18'); const landed = s.previewCar === 'sc18'; s.garagePreviewClear(); s.garageLeave();
    return { ok: landed && after === null && carVisible === true, info: { after15s: after, carVisible, downloadLanded: landed } }; });
  await run('garageReflect keeps the real car hidden under a preview', () => { const s = window.__sim; s.garageEnter(); s.garagePreview('aventador'); const p0 = s.previewCar;
    s.garageReflect(); const vis = s.car.visible; s.garagePreviewClear(); const vis2 = s.car.visible; s.garageLeave();
    return { ok: p0 === 'aventador' && vis === false && vis2 === true, info: { preview: p0, carVisibleUnderPreview: vis, afterClear: vis2 } }; });

  // 5. a dropped revuelto.glb is fitted fresh, not swapped for the cached wrap
  await run('dropping revuelto.glb installs the new file', async () => { const s = window.__sim; const old = s.customModel;
    const buf = await (await fetch('revuelto.glb')).arrayBuffer(); s.loadGLBBuffer(buf, 'revuelto.glb');
    const t0 = performance.now(); while (s.customModel === old && performance.now() - t0 < 180000) await new Promise(r => setTimeout(r, 500));
    let n = 0; s.car.traverse(o => { if (o.isMesh && o.visible) n++; }); const sz = new THREE.Box3().setFromObject(s.customModel).getSize(new THREE.Vector3());
    return { ok: s.customModel !== old && n > 20 && Math.abs(Math.max(sz.x, sz.z) - s.CAR.length) < 0.6, info: { replaced: s.customModel !== old, meshes: n, long: +Math.max(sz.x, sz.z).toFixed(2), spec: s.CAR.length } }; });

  // 6. cloud: nothing is written while the sign-in read is out; another account's record never inherits the old name; gifts reset
  await run('cloud: a save during the sign-in read writes nothing; account wins', async () => { const s = window.__sim, c = s.cloud; let sets = [], resolveGet; const remote = { name: 'REAL', cash: 250000, stats: { earned: 300000, races: 40, wins: 10, podiums: 20 }, updated: 5, tiers: {}, paints: [0, 1], cars: ['revuelto'], car: 'revuelto' };
    c.ok = true; c.doc = () => ({ get: () => new Promise(r => { resolveGet = r; }), set: async d => { sets.push(d); } }); c.claimName = async () => 'OK';
    s.careerReset(); s.career.name = 'LOCAL'; s.career.cash = 7000; s.career.stats.earned = 500; c.user = { uid: 'U1' };
    const pr = c.pull(); s.careerSave(); await new Promise(r => setTimeout(r, 1300)); const setsDuringRead = sets.length;
    resolveGet({ exists: true, data: () => remote }); await pr; await new Promise(r => setTimeout(r, 1300));
    const out = { setsDuringRead, setsAfter: sets.length, cash: s.career.cash, name: s.career.name, uid: s.career.uid };
    return { ok: setsDuringRead === 0 && sets.length === 0 && out.cash === 250000 && out.uid === 'U1', info: out }; });
  await run('cloud: another account adopts clean (no inherited name/gifts); push needs ownership', async () => { const s = window.__sim, c = s.cloud; let sets = [];
    c.doc = () => ({ get: async () => ({ exists: true, data: () => ({ name: null, cash: 9000, stats: { earned: 2000 }, updated: 3, tiers: {}, paints: [0, 1], cars: ['revuelto'], car: 'revuelto' }) }), set: async d => { sets.push(d); } });
    s.career.uid = 'C'; s.career.name = 'CAROL'; s.career.gifts = ['INDIE']; c.user = { uid: 'B' }; await c.pull();
    const nb = !document.getElementById('namebox').classList.contains('hidden'); document.getElementById('namebox').classList.add('hidden');
    const a = { name: s.career.name, gifts: s.career.gifts.slice(), cash: s.career.cash, uid: s.career.uid, nameBoxOpened: nb };
    // a record that does not belong to the signed-in account is never pushed: push() settles ownership first
    s.career.uid = 'Z'; sets = []; let pulled = 0; const origPull = c.pull; c.pull = function () { pulled++; return Promise.resolve(); }; c.push(); await new Promise(r => setTimeout(r, 1200)); c.pull = origPull;
    const out = { ...a, pushWhileNotOwned: sets.length, pullInstead: pulled };
    c.user = null; c.ok = false; s.career.uid = null; s.career.name = 'OTTO'; s.career.cash = 4000000;
    return { ok: a.name === '' && a.gifts.length === 0 && a.cash === 9000 && a.uid === 'B' && a.nameBoxOpened && out.pushWhileNotOwned === 0 && out.pullInstead === 1, info: out }; });

  // 7. input: gamepad and keys do not drive behind the menu, and a key held through START counts at GO
  await run('menu gates every input device; held key carries into the race', () => { const s = window.__sim; const startEl = document.getElementById('start'); const was = startEl.classList.contains('hidden');
    const realGP = navigator.getGamepads; const btn = v => ({ value: v, pressed: v > 0.5 }); const pad = { index: 0, axes: [0, 0], buttons: Array.from({ length: 16 }, (_, i) => btn(i === 7 || i === 5 ? 1 : 0)) };
    navigator.getGamepads = () => [pad]; s.st.auto = true; startEl.classList.remove('hidden'); s.readInput(); const menuPad = { thr: s.inp.throttle, auto: s.st.auto };
    navigator.getGamepads = () => []; for (const k in s.keys) s.keys[k] = false;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); s.readInput(); const menuKey = { latched: !!s.keys.KeyW, thr: s.inp.throttle };
    startEl.classList.add('hidden'); s.readInput(); const raceKey = s.inp.throttle;
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); navigator.getGamepads = realGP; if (!was) startEl.classList.remove('hidden');
    return { ok: menuPad.thr === 0 && menuPad.auto === true && menuKey.latched && menuKey.thr === 0 && raceKey === 1, info: { menuPad, menuKey, raceKey } }; });

  // 8. settings pause hushes the car only (level 1); closing restores (level 0)
  await run('settings pause: car-only hush, music untouched', async () => { const s = window.__sim; const calls = []; const orig = s.audio.hush; s.audio.hush = function (l) { calls.push(l); return orig.call(this, l); };
    document.getElementById('settings').classList.remove('hidden'); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); await new Promise(r => setTimeout(r, 300)); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const lvlOpen = s.hushLevel; document.getElementById('settings').classList.add('hidden'); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); await new Promise(r => setTimeout(r, 300)); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const lvlClosed = s.hushLevel; s.audio.hush = orig;
    return { ok: lvlOpen === 1 && lvlClosed === 0 && calls.includes(1) && calls[calls.length - 1] === 0 && !calls.includes(2), info: { lvlOpen, lvlClosed, calls } }; });

  const ok = report(errs); await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})();
