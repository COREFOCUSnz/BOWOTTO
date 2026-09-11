// Let an engineer bot actually build a sentry in a running match, then photograph it.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const out = process.argv[2] || '/tmp/live.png';
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1000, height: 560 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto((process.env.GAME_URL || 'http://localhost:8099/index.html') + '?v=' + Date.now());
  await p.waitForFunction(() => window.__game && document.getElementById('loading').hidden, null, { timeout: 30000 });
  await p.evaluate(() => { window.__menuSelect('1'); window.__menuSelect('1'); window.__menuSelect('3'); window.__closeMenu(); });
  // force an engineer onto each team and let the match run
  await p.evaluate(() => {
    const g = window.__game;
    g.players.filter((x) => x.isBot).slice(0, 2).forEach((t) => { t.cls = 'engineer'; t.alive = false; t.respawnAt = 0; t.wantsRespawn = true; });
  });
  for (let i = 0; i < 60 && !(await p.evaluate(() => window.__game.sentries.length)); i++) await p.waitForTimeout(1000);
  const info = await p.evaluate(() => {
    const g = window.__game, h = window.__human, s = g.sentries[0];
    if (!s) return null;
    // stand off and look at it
    h.alive = true; h.pos = [s.pos[0] + 2.2, s.pos[1], s.pos[2] + 2.6]; h.vel = [0, 0, 0];
    h.yaw = Math.atan2(-(s.pos[0] - h.pos[0]), -(s.pos[2] - h.pos[2])); h.pitch = -0.12;
    window.__hideViewmodel = true;
    return { level: s.level, hp: s.hp, owner: s.owner && s.owner.name, team: s.team, pos: s.pos.map((v) => +v.toFixed(1)) };
  });
  await p.waitForTimeout(700);
  await p.screenshot({ path: out });
  await b.close();
  console.log(info ? 'sentry built: ' + JSON.stringify(info) : 'NO SENTRY WAS BUILT');
  if (errs.length) console.log('ERRORS: ' + [...new Set(errs)].join(' | '));
  process.exit(info && !errs.length ? 0 : 1);
})();
