// Photograph the three sentry levels plus one under construction.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const out = process.argv[2] || '/tmp/sentries.png';
  const team = parseInt(process.argv[3] || '1', 10);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1150, height: 620 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto((process.env.GAME_URL || 'http://localhost:8099/index.html') + '?v=' + Date.now());
  await p.waitForFunction(() => window.__game && document.getElementById('loading').hidden, null, { timeout: 30000 });
  await p.evaluate(() => { window.__menuSelect('1'); window.__menuSelect('1'); window.__menuSelect('3'); window.__closeMenu(); });
  await p.waitForTimeout(150);
  await p.evaluate((team) => {
    const g = window.__game, h = window.__human;
    g.roundLength = 1e9;
    window.__brains.forEach((br) => { br.update = () => {}; });
    g.players.filter((x) => x.isBot).forEach((x) => { x.alive = false; });
    g.sentries.length = 0;
    for (let i = 0; i < 3; i++) {
      g.sentries.push({ pos: [(i - 1.5) * 1.6, 0.0, 2.5], yaw: 0.42, baseYaw: 0.0, pitch: -0.05,
        team, owner: null, hp: 150 + i * 50, maxHp: 150 + i * 50, level: i + 1,
        cooldown: 0, target: i === 0 ? {} : null, scanT: 9, recoil: i === 1 ? 1 : 0, flash: i === 1 ? 1 : 0 });
    }
    // one mid-build, driven by a frozen engineer
    const eng = g.players.filter((x) => x.isBot)[0];
    eng.alive = true; eng.cls = 'engineer'; eng.team = team; eng.pos = [1.5 * 1.6, 0.0, 3.9];
    eng.yaw = Math.PI; eng.building = 4 * 0.45; eng.buildSpot = [1.5 * 1.6, 0.0, 2.5];
    eng.weapons = ['spanner']; eng.wi = 0; eng.vel = [0, 0, 0]; eng.onGround = true;
    h.alive = true; h.pos = [0.2, 0.0, -0.9]; h.yaw = Math.PI + 0.04; h.pitch = -0.16; h.vel = [0, 0, 0];
    window.__hideViewmodel = true;
    g.update = () => {};
  }, team);
  await p.waitForTimeout(500);
  await p.screenshot({ path: out });
  await b.close();
  console.log('wrote', out, errs.length ? 'ERRORS: ' + [...new Set(errs)].join(' | ') : '');
  process.exit(errs.length ? 1 : 0);
})();
