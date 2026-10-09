// derby.js -- DESTRUCTION DERBY end to end on THE ARENA through the real start screens: pick the mode, START DERBY,
// rivals hunt, ram every one to a wreck, last car standing pays out, results sheet; then the player-wrecked path.
const { serve, launch, openGame, checker } = require('./common');
const OUT = process.env.SHOTS || '';
(async () => {
  const { srv, url } = await serve(); const b = await launch();
  const { page: p, errs } = await openGame(b, url, { track: 'arena', career: { name: 'OTTO', cash: 5000, cars: ['revuelto'], paints: [0, 1], updated: 1 } });
  const { run, report } = checker(p);
  await run('world: the arena, its derby button, lap line without the gantry', () => { const s = window.__sim; let line = null;
    s.scene.traverse(o => { const g = o.geometry; if (o.isMesh && g && g.parameters && g.parameters.width === 1.2 && Math.abs(g.parameters.height - 32) < 0.01) line = o; });
    return { ok: s.TRACK_ID === 'arena' && s.ARENA === true && !!document.querySelector('#modes button[data-m=derby]') && !!line && line.parent === s.scene, info: { track: s.TRACK_ID, trackLen: +s.trackLen.toFixed(1), derbyBtn: !!document.querySelector('#modes button[data-m=derby]'), lapLine: !!line } }; });
  await p.evaluate(() => window.startShow(2)); await p.click('#modes button[data-m=derby]');
  await run('mode screen: derby hides the lap picker and moves on with NEXT', () => { const $ = id => document.getElementById(id);
    const v = { lapselHidden: $('lapsel').classList.contains('hidden'), nextVisible: !$('next-btn').classList.contains('hidden'), startVisible: !$('start-btn').classList.contains('hidden') };
    return { ok: v.lapselHidden && v.nextVisible && !v.startVisible, info: v }; });
  await p.click('#next-btn'); await p.waitForTimeout(300);
  await run('rivals screen: START DERBY', () => { const btn = document.getElementById('start-btn'); return { ok: !btn.classList.contains('hidden') && /DERBY/.test(btn.textContent), info: { start: btn.textContent.trim() } }; });
  await p.click('#start-btn'); await p.waitForTimeout(500);
  await run('start: countdown, rivals spread ahead, HUD up', () => { const s = window.__sim, G = s.GAME;
    return { ok: G.mode === 'derby' && G.state === 'countdown' && s.ai.length >= 3 && s.ai.every(a => a.hp === 100) && !document.getElementById('race').classList.contains('hidden'), info: { mode: G.mode, state: G.state, rivals: s.ai.map(a => ({ n: a.name, s: +a.s.toFixed(0), d: +a.d.toFixed(1) })), me: { s: +s.st.s.toFixed(0) } } }; });
  await run('racing: the rivals come for you', () => { const s = window.__sim, G = s.GAME; G.cd = 0.01; s.raceTick(0.02); const d0 = s.ai.map(a => a.s);
    for (let i = 0; i < 60 * 4; i++) { s.step(1 / 60); s.raceTick(1 / 60); }
    const speeds = s.ai.map(a => +(a.u * 3.6).toFixed(0)); const moved = s.ai.map((a, k) => +Math.abs(a.s - d0[k]).toFixed(1));
    return { ok: G.state === 'racing' && Math.max(...speeds) > 20 && Math.max(...moved) > 5, info: { state: G.state, speedsKmh: speeds, moved, meHp: +s.st.hp.toFixed(1) } }; });
  await run('ram every rival to a wreck: last car standing pays out', () => { const s = window.__sim, G = s.GAME, st = s.st; const cash0 = s.career.cash, n = s.ai.length; let rams = 0;
    for (const a of s.ai) { let g = 0; while (!a.wrecked && g++ < 40) { st.d = 0; st.psi = 0; a.s = (st.s + 4.2) % s.trackLen; a.d = 0; a.u = 0; a.dv = 0; st.u = 22; for (let i = 0; i < 30; i++) s.step(1 / 120); for (let i = 0; i < 48; i++) { st.u = 0; s.step(1 / 120); } rams++; } }
    s.raceTick(0.02); const rows = s.standings();
    return { ok: G.state === 'finished' && st.wrecks === n && G.prize > 0 && s.career.cash === cash0 + G.prize && rows[0].me && !rows[0].wrecked, info: { state: G.state, wrecks: st.wrecks, rams, prize: G.prize, cash: s.career.cash, wins: s.career.stats.wins, myHp: +st.hp.toFixed(1) } }; });
  await run('results sheet: LAST CAR STANDING, prize line, every car listed', () => { const s = window.__sim; s.showResults(); const $ = id => document.getElementById(id);
    const rows = [...document.querySelectorAll('#res-rows .row')].map(r => r.textContent.replace(/\s+/g, ' ').trim());
    return { ok: /LAST CAR STANDING/.test($('res-title').textContent) && /\$/.test($('res-cash').textContent) && rows.length >= s.ai.length + 1, info: { title: $('res-title').textContent, sub: $('res-sub').textContent, cash: $('res-cash').textContent, rows } }; });
  if (OUT) await p.screenshot({ path: OUT + 'derby-results.png', timeout: 240000 });
  await run('player wrecked: race ends, control frozen, no reversing away', () => { const s = window.__sim, G = s.GAME, st = s.st;
    s.startRace('derby', 1); G.cd = 0.01; s.raceTick(0.02); for (const z in st.zone) st.zone[z] = 1; st.hp = 1;   // hp is the zone mean: set the zones
    const a = s.ai[0]; a.s = (st.s - 3.0 + s.trackLen) % s.trackLen; a.d = st.d; a.u = 25; st.u = 0; for (let i = 0; i < 40; i++) { s.step(1 / 60); s.raceTick(1 / 60); }
    let minU = 0; for (let i = 0; i < 120; i++) { s.readInput(); s.step(1 / 60); minU = Math.min(minU, st.u); }
    return { ok: st.wrecked && G.state === 'finished' && st.hp === 0 && s.inp.throttle === 0 && minU > -1, info: { meHp: st.hp, wrecked: st.wrecked, state: G.state, throttleIgnored: s.inp.throttle === 0, minUafter: +minU.toFixed(2), pos: s.standings().findIndex(r => r.me) + 1 } }; });
  const ok = report(errs); await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})();
