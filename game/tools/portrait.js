// Close-up of one class from a given angle. node tools/portrait.js out.png [class] [angleDeg] [team] [anim]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const [out = '/tmp/p.png', cls = 'soldier', angle = '0', team = '1', anim = 'idle', dist = '3', eye = '0'] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 620, height: 700 } });
  p.on('pageerror', (e) => console.log('pageerror:', e.message));
  await p.goto((process.env.GAME_URL || 'http://localhost:8099/index.html') + '?v=' + Date.now());
  await p.waitForFunction(() => window.__modelsReady && window.__modelsReady(), null, { timeout: 30000 });
  await p.evaluate(() => { window.__menuSelect('1'); window.__menuSelect('1'); window.__menuSelect('3'); window.__closeMenu(); });
  await p.waitForTimeout(150);
  await p.evaluate(({ cls, angle, team, anim, dist, eye }) => {
    const g = window.__game, h = window.__human;
    g.roundLength = 1e9;
    window.__brains.forEach((br) => { br.update = () => {}; });
    const bots = g.players.filter((x) => x.isBot);
    bots.forEach((x) => { x.alive = false; });
    const t = bots[0];
    t.alive = true; t.hp = 100; t.team = team; t.cls = cls; t.name = cls;
    t.weapons = window.CLASSES[cls].weapons.slice(); t.wi = t.weapons.length - 1;
    t.ammo = { shells: 99, nails: 99, rockets: 99, cells: 99 };
    t.pos = [0, 6.05, -14]; t.yaw = angle * Math.PI / 180; t.pitch = anim === 'aimdown' ? -0.5 : anim === 'aimup' ? 0.5 : 0;
    t.vel = anim === 'run' ? [0, 0, -5] : [0, 0, 0]; t.onGround = anim !== 'air'; t.walkPhase = 1.1;
    t.fireAnim = anim === 'fire' ? 0.9 : 0;
    if (anim === 'air') { t.vel = [0, 3, -4]; }
    if (anim === 'dead') { t.alive = false; t.deadAt = g.time - 0.5; }
    // camera 3 m in front, chest height
    h.alive = true; h.pos = [0, 6.05 + eye, -14 - dist]; h.yaw = Math.PI; h.pitch = 0.04; h.vel = [0, 0, 0];
    window.__hideViewmodel = true;
    g.update = () => {};
  }, { cls, angle: parseFloat(angle), team: parseInt(team, 10), anim, dist: parseFloat(dist), eye: parseFloat(eye) });
  await p.waitForTimeout(500);
  await p.screenshot({ path: out });
  await b.close();
  console.log('wrote', out, cls, angle + 'deg');
})();
