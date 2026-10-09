// bugscan3.js -- probes for the third review round (lens finders + refuters, 2026-10-09): BUY dialog, lobby picture,
// results gate, garage pinch/zoom, touch pad hand-over, R-reset, records (mode + account), derby double knockout,
// rival materials (TRON paint, roof clip), wrecks staying burnt, car requests, tail-first laps, render pose, HEALTH labels.
const { serve, launch, openGame, checker } = require('./common');
(async () => {
  const { srv, url } = await serve(); const b = await launch();
  const { page: p, errs } = await openGame(b, url, { career: { name: 'OTTO', cash: 4000000, cars: ['revuelto', 'aventador', 'countach', 'lpi', 'sc18'], paints: [0, 1], updated: 1 },
    context: {} });
  // the legacy per-browser record is planted before load in a second page below; this page checks everything else
  const { run, report } = checker(p);
  await p.evaluate(() => { const s = window.__sim;
    window.__at = (idx, u = 0) => { const st = s.st; st.lastP = 0.5; s.placeOnTrack(idx); st.u = u; s.syncPose(); };
    window.__cross = () => { const st = s.st; window.__at(s.N - 4, 40); st.halfSeen = true; for (let i = 0; i < 240 && st.trackIdx > s.N / 2; i++) s.step(1 / 120); };
    window.__go = () => { s.GAME.cd = 0.01; s.raceTick(0.02); }; });

  await run('labels: the derby number is HEALTH (card and results)', () => { const s = window.__sim; const card = document.querySelector('#damage .dmg-head span').textContent;
    s.startRace('derby', 1); window.__go(); s.GAME.finishT = 1; s.showResults(); const head = document.querySelector('#res-rows .row.head em') ? document.querySelector('#res-rows .row.head em').textContent : '';
    document.getElementById('results').classList.add('hidden'); s.startRace('solo', 1);
    return { ok: card === 'HEALTH' && head === 'HEALTH', info: { card, head } }; });

  await run('TRON LEGACY paint: Versus still starts (rival paint from the real paint material)', () => { const s = window.__sim; const t = s.PAINTS.findIndex(P => P.shader);
    if (!s.career.paints.includes(t)) s.career.paints.push(t); s.setPaint(t); let err = null; try { s.startRace('versus', 1); } catch (e) { err = e.message; }
    const n = s.ai.length; s.setPaint(1); s.startRace('solo', 1);
    return { ok: t > 0 && !err && n === 3, info: { tron: t, rivals: n, err } }; });

  await run('rivals carry no roof clip, even started from the cockpit cam', async () => { const s = window.__sim; s.st.cam = 2; s.st.started = true; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const plane = s.roofClip.constant; s.startRace('versus', 1); let clipped = 0, meshes = 0;
    for (const a of s.ai) a.grp.traverse(m => { if (!m.isMesh) return; meshes++; for (const mt of (Array.isArray(m.material) ? m.material : [m.material])) if (mt.clippingPlanes && mt.clippingPlanes.length) clipped++; });
    s.st.cam = 0; s.st.started = false; s.startRace('solo', 1);
    return { ok: plane < 1e8 && meshes > 0 && clipped === 0, info: { roofPlaneAtStart: +plane.toFixed(2), rivalMeshes: meshes, clippedMaterials: clipped } }; });

  // BUY THIS? with real input: click BUY (Chromium focuses the button), press Enter -> exactly one purchase; Escape -> NO, garage stays
  await p.evaluate(() => { window.garageOpen(); document.querySelector('#g-room button[data-r=shop]').click(); document.querySelector('#g-tabs button[data-t=parts]').click(); });
  const before = await p.evaluate(() => ({ cash: window.__sim.career.cash, tiers: Object.assign({}, window.__sim.career.tiers) }));
  const key = await p.evaluate(() => { const bt = document.querySelector('#g-parts [data-buy]:not([disabled])'); return bt ? bt.dataset.buy : null; });
  await p.click('#g-parts [data-buy="' + key + '"]'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  const afterEnter = await p.evaluate(k => ({ cash: window.__sim.career.cash, tier: window.__sim.career.tiers[k], open: !document.getElementById('confirm').classList.contains('hidden') }), key);
  await p.click('#g-parts [data-buy="' + key + '"]'); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  const afterEsc = await p.evaluate(k => ({ tier: window.__sim.career.tiers[k], open: !document.getElementById('confirm').classList.contains('hidden'), garage: document.body.classList.contains('garage') }), key);
  await run('BUY THIS?: Enter buys exactly one tier; Escape is NO and leaves the garage open', (v) => ({ ok: v.key && v.afterEnter.tier === v.before.tiers[v.key] + 1 && !v.afterEnter.open && v.afterEsc.tier === v.afterEnter.tier && !v.afterEsc.open && v.afterEsc.garage, info: v }), { key, before: { tiers: before.tiers, cash: before.cash }, afterEnter, afterEsc });

  await run('garage hides the lobby picture; pinch then lift does not snap; wheel zoom follows distance', () => { const s = window.__sim, g = s.garage, $ = id => document.getElementById(id);
    $('lobby-bg').classList.remove('hidden'); const bg = getComputedStyle($('lobby-bg')).display; $('lobby-bg').classList.add('hidden');
    const cv = s.renderer.domElement, P = (type, id, x, y, t = cv) => t.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: 'touch' }));
    P('pointerdown', 1, 100, 200); P('pointerdown', 2, 300, 300); P('pointermove', 2, 330, 330, window); P('pointerup', 2, 330, 330, window); const yaw0 = g.yaw; P('pointermove', 1, 101, 200, window); const dYaw = Math.abs(g.yaw - yaw0); P('pointerup', 1, 101, 200, window);
    const d0 = g.dist; cv.dispatchEvent(new WheelEvent('wheel', { deltaY: 3, deltaMode: 0, bubbles: true, cancelable: true })); const small = g.dist / d0;
    const d1 = g.dist; cv.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, deltaMode: 0, bubbles: true, cancelable: true })); const notch = g.dist / d1;
    window.garageClose();
    return { ok: bg === 'none' && dYaw < 0.05 && Math.abs(small - 1) < 0.01 && notch > 1.05 && notch < 1.12, info: { lobbyBg: bg, yawJumpAfterLift: +dYaw.toFixed(4), trackpadStep: +small.toFixed(4), mouseNotch: +notch.toFixed(3) } }; });

  await run('results card: no driving behind it, and it can never outgrow the screen', () => { const s = window.__sim, $ = id => document.getElementById(id); $('start').classList.add('hidden'); $('results').classList.remove('hidden');
    s.keys.KeyW = true; s.readInput(); const thr = s.inp.throttle; s.keys.KeyW = false; $('results').classList.add('hidden'); $('start').classList.remove('hidden');
    const cs = getComputedStyle($('results'));
    return { ok: thr === 0 && cs.maxHeight !== 'none' && /auto|scroll/.test(cs.overflowY), info: { throttleBehindResults: thr, maxHeight: cs.maxHeight, overflowY: cs.overflowY } }; });

  await run('touch pads hand over when a thumb rolls from gas onto brake', () => { const s = window.__sim, $ = id => document.getElementById(id); $('touch').classList.add('on'); document.body.classList.add('touch'); $('start').classList.add('hidden');
    const c = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }; const g = c($('t-gas')), br = c($('t-brake'));
    const E = (type, x, y, t) => t.dispatchEvent(new PointerEvent(type, { pointerId: 7, clientX: x, clientY: y, bubbles: true, pointerType: 'touch' }));
    E('pointerdown', g[0], g[1], $('t-gas')); const a = { gas: s.touch.gas, brake: s.touch.brake };
    E('pointermove', br[0], br[1], $('t-gas')); const bb = { gas: s.touch.gas, brake: s.touch.brake };
    E('pointerup', br[0], br[1], $('t-gas')); const cc = { gas: s.touch.gas, brake: s.touch.brake }; $('start').classList.remove('hidden');
    return { ok: a.gas === 1 && bb.gas === 0 && bb.brake === 1 && cc.gas === 0 && cc.brake === 0, info: { onGas: a, slidOntoBrake: bb, lifted: cc } }; });

  await run('R resets onto the car\'s own track position', () => { const s = window.__sim, st = s.st; window.__at(900, 30); st.s += 3.3; s.syncPose(); const want = s.CUM[s.sampleAt(st.s).i];
    const startEl = document.getElementById('start'); startEl.classList.add('hidden');   // R is an in-race key: on the menu the start-screen branch takes it
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyR' })); startEl.classList.remove('hidden');
    return { ok: Math.abs(st.s - want) < 0.01, info: { s: +st.s.toFixed(2), expected: +want.toFixed(2) } }; });

  await run('records: Versus laps do not set the Time Trial record; records live in the career', () => { const s = window.__sim, id = s.TRACK_ID; s.career.best[id] = 99999; s.st.lapBest = 99999;
    s.startRace('versus', 1); window.__go(); window.__cross(); window.__cross(); const afterVersus = s.career.best[id];
    s.startRace('time', 1); window.__go(); window.__cross(); window.__cross(); const afterTT = s.career.best[id];
    const keep = Object.assign({}, s.career.best); s.careerReset(); const reset = Object.keys(s.career.best).length; s.careerLoad(); s.startRace('solo', 1);
    return { ok: afterVersus === 99999 && afterTT < 99999 && reset === 0, info: { afterVersus, afterTT, bestsAfterReset: reset } }; });

  await run('derby: a hit that wrecks both cars counts for both', () => { const s = window.__sim, st = s.st; s.startRace('derby', 1); window.__go();
    for (const z in st.zone) st.zone[z] = 0.5; st.hp = 0.5; const a = s.ai[0]; a.hp = 1; st.d = 0; st.psi = 0; a.s = (st.s + 4.2) % s.trackLen; a.d = 0; a.u = 0; a.dv = 0; st.u = 22;
    for (let i = 0; i < 30; i++) s.step(1 / 120);
    const out = { meWrecked: st.wrecked, rivalWrecked: a.wrecked, wrecks: st.wrecks, prize: s.GAME.prize }; s.startRace('solo', 1);
    return { ok: out.meWrecked && out.rivalWrecked && out.wrecks === 1, info: out }; });

  await run('a wreck stays burnt when the rivals are rebuilt (a model landing mid-derby)', () => { const s = window.__sim, st = s.st; s.startRace('derby', 1); window.__go(); const a = s.ai[0]; let g = 0;
    while (!a.wrecked && g++ < 40) { st.d = 0; st.psi = 0; a.s = (st.s + 4.2) % s.trackLen; a.d = 0; a.u = 0; a.dv = 0; st.u = 22; for (let i = 0; i < 30; i++) s.step(1 / 120); for (let i = 0; i < 48; i++) { st.u = 0; s.step(1 / 120); } }
    s.buildRivalVisual(a); let paint = null; a.body.traverse(m => { if (paint == null && m.isMesh && m.userData.paint) paint = m.material.color.getHex(); }); s.startRace('solo', 1);
    return { ok: a.wrecked && paint === 0x26262b, info: { wrecked: a.wrecked, paintAfterRebuild: paint && paint.toString(16) } }; });

  await run('a lap counts when the car slides over the line tail-first', () => { const s = window.__sim, st = s.st; s.startRace('time', 3); window.__go(); window.__cross(); const l0 = st.lapsDone;
    window.__at(s.N - 4, 0); st.psi = Math.PI; st.u = -30; st.w = 0; st.halfSeen = true; for (let i = 0; i < 240 && st.trackIdx > s.N / 2; i++) s.step(1 / 120);
    const out = { before: l0, after: st.lapsDone }; s.startRace('solo', 1);
    return { ok: out.after === out.before + 1, info: out }; });

  await run('render pose: drawn between the last two physics states', () => { const s = window.__sim, st = s.st; window.__at(1200, 60); s.rpSave(); const p0 = st.pos.clone(); s.step(1 / 120); const p1 = st.pos.clone();
    s.rpPose(0.5); const mid = p0.clone().lerp(p1, 0.5); const err = s.rp.pos.distanceTo(mid); s.rpPose(1); const snap = s.rp.pos.distanceTo(p1);
    return { ok: p0.distanceTo(p1) > 0.3 && err < 1e-6 && snap < 1e-6, info: { stepMetres: +p0.distanceTo(p1).toFixed(3), midError: err, fullError: snap } }; });

  await run('car requests: the last car asked for is the one that lands', async () => { const s = window.__sim; s.carSelect('countach'); const want1 = s.carWant; s.carSelect('revuelto'); const want2 = s.carWant;
    await new Promise(r => setTimeout(r, 15000)); const landed = !!s.carRoots ? null : null;
    return { ok: want1 === 'countach' && want2 === 'revuelto' && s.carId === 'revuelto', info: { want1, want2, carIdAfter15s: s.carId } }; });

  // rival wheels come from the fitted pivots: four per rival on every car, and they turn
  const wheelsOut = {};
  for (const id of ['aventador', 'countach', 'sc18', 'revuelto']) {
    await p.evaluate(id => window.__sim.carSelect(id), id);
    await p.waitForFunction(id => { const s = window.__sim; if (s.carId !== id) return false; let n = 0; s.car.traverse(o => { if (o.isMesh && o.visible) n++; }); return n > 20; }, id, { timeout: 240000 });
    wheelsOut[id] = await p.evaluate(() => { const s = window.__sim; s.startRace('versus', 1); s.GAME.cd = 0.01; s.raceTick(0.02); const a = s.ai[0];
      const rot0 = a.wheels.map(w => (w.spin || w.node).rotation.x); for (let i = 0; i < 30; i++) s.raceTick(1 / 60); const turned = a.wheels.filter((w, k) => Math.abs((w.spin || w.node).rotation.x - rot0[k]) > 0.1).length;
      const out = { wheels: a.wheels.length, turned }; s.startRace('solo', 1); return out; });
  }
  await run('rival wheels: four per rival, and turning, whatever car you drive', (v) => ({ ok: Object.values(v).every(x => x.wheels === 4 && x.turned === 4), info: v }), wheelsOut);

  await run('touch layout only for touch-first pointers (desktop: off until a real touch)', () => { const before = document.body.classList.contains('touch');
    return { ok: true, info: { note: 'checked in phone.js (coarse pointer -> on) and here after the pad test forced it on', touchClassNow: before, coarse: matchMedia('(pointer: coarse)').matches } }; });

  const ok = report(errs);
  // legacy per-browser record migrates into the career once, then the key is gone
  await b.close(); const b2 = await launch();   // a fresh browser: a second heavy page in a long-lived SwiftShader browser times out loading
  const ctx2 = await b2.newContext({ viewport: { width: 900, height: 560 } }); const p2 = await ctx2.newPage();
  await p2.addInitScript(() => { try { if (!sessionStorage.getItem('m')) { localStorage.clear(); localStorage.setItem('revuelto.track', 'salt'); localStorage.setItem('revuelto.step', '2'); localStorage.setItem('revuelto.career', JSON.stringify({ name: 'OTTO', cash: 9000, updated: 1 })); localStorage.setItem('revuelto.best.salt', '77777'); sessionStorage.setItem('m', '1'); } } catch (e) {} });
  await p2.goto(url, { timeout: 300000 }); await p2.waitForFunction(() => !!window.__sim, null, { timeout: 300000 });
  const mig = await p2.evaluate(() => ({ best: window.__sim.career.best.salt, legacyKey: localStorage.getItem('revuelto.best.salt'), hudBest: window.__sim.st.lapBest, desktopTouch: document.body.classList.contains('touch') }));
  const ok2 = mig.best === 77777 && mig.legacyKey === null && mig.hudBest === 77777 && mig.desktopTouch === false;
  console.log((ok2 ? 'PASS ' : 'FAIL ') + ' legacy record folds into the career; desktop gets no touch layout :: ' + JSON.stringify(mig));
  await b2.close(); srv.close(); process.exit(ok && ok2 ? 0 : 1);
})();
