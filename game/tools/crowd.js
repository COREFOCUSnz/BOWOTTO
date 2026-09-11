// Live-fire crowd shot plus a frame-rate measurement with many characters on screen.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const out = process.argv[2] || '/tmp/crowd.png';
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1100, height: 620 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto((process.env.GAME_URL || 'http://localhost:8099/index.html') + '?v=' + Date.now());
  await p.waitForFunction(() => window.__modelsReady && window.__modelsReady(), null, { timeout: 30000 });
  await p.evaluate(() => { window.__menuSelect('1'); window.__menuSelect('1'); window.__menuSelect('3'); window.__closeMenu(); });
  await p.evaluate(() => {
    const g = window.__game, h = window.__human;
    h.alive = true; h.pos = [0, 0.05, -11]; h.yaw = Math.PI; h.pitch = 0.02;
    const cls = ['scout', 'sniper', 'soldier', 'demoman', 'medic', 'hwguy', 'pyro', 'spy', 'engineer'];
    g.players.filter((x) => x.isBot).forEach((t, i) => {
      t.alive = true; t.hp = 100; t.cls = cls[i % cls.length]; t.team = i % 2;
      t.weapons = window.CLASSES[t.cls].weapons.slice(); t.wi = t.weapons.length - 1;
      t.ammo = { shells: 99, nails: 99, rockets: 99, cells: 99 };
      t.pos = [(i % 5) * 1.6 - 3.2, 0.05, -6 + Math.floor(i / 5) * 2.2];
      t.yaw = Math.PI + (i % 3 - 1) * 0.4; t.pitch = 0; t.vel = [0, 0, 0]; t.onGround = true;
      t.walkPhase = i * 0.9; t.fireAnim = i % 3 === 0 ? 0.85 : 0;
    });
  });
  await p.waitForTimeout(800);
  await p.screenshot({ path: out });
  const n = await p.evaluate(() => window.__game.players.filter((x) => x.alive).length);
  const fps = await p.evaluate(() => new Promise((res) => { let k = 0; const t0 = performance.now(); const f = () => { k++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(k / 3); }; requestAnimationFrame(f); }));
  console.log(`${n} characters on screen, ${fps.toFixed(1)} fps (software GL)`);
  if (errs.length) { console.log('ERRORS:'); [...new Set(errs)].forEach((e) => console.log('  ' + e)); }
  await b.close();
  process.exit(errs.length ? 1 : 0);
})();
