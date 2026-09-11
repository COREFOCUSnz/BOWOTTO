// Photograph every class model side by side, both teams, for eyeballing the rig.
//   node tools/lineup.js [outfile] [team]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CLASSES = ['scout', 'sniper', 'soldier', 'demoman', 'medic', 'hwguy', 'pyro', 'spy', 'engineer'];
(async () => {
  const out = process.argv[2] || '/tmp/lineup.png';
  const team = parseInt(process.argv[3] || '1', 10);
  const walking = process.argv[4] === 'walk';
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 560 } });
  p.on('pageerror', (e) => console.log('pageerror:', e.message));
  await p.goto(process.env.GAME_URL || 'http://localhost:8099/index.html');
  await p.waitForFunction(() => window.__modelsReady && window.__modelsReady(), null, { timeout: 30000 });
  await p.evaluate(() => { window.__menuSelect('1'); window.__menuSelect('1'); window.__menuSelect('3'); window.__closeMenu(); });
  await p.waitForTimeout(200);
  await p.evaluate(({ CLASSES, team, walking }) => {
    const g = window.__game, h = window.__human;
    g.roundLength = 1e9;
    h.alive = true; h.pos = [0, 6.05, -2]; h.yaw = Math.PI; h.pitch = -0.02; h.vel = [0, 0, 0];
    window.__brains.forEach((br) => { br.update = () => {}; });
    const bots = g.players.filter((x) => x.isBot);
    bots.forEach((x) => { x.alive = false; });
    CLASSES.forEach((cls, i) => {
      const t = bots[i]; if (!t) return;
      t.alive = true; t.hp = 100; t.team = team; t.cls = cls; t.name = cls;
      t.weapons = window.CLASSES[cls].weapons.slice(); t.wi = t.weapons.length - 1;
      t.ammo = { shells: 99, nails: 99, rockets: 99, cells: 99 };
      t.pos = [(i - 4) * 1.25, 6.05, 2]; t.yaw = 0; t.pitch = 0; t.vel = walking ? [0, 0, -4] : [0, 0, 0];
      t.onGround = true; t.walkPhase = walking ? i * 0.7 : 0; t.input.dir = [0, 0, 0];
    });
    g.update = () => {};   // freeze the sim so the pose holds
  }, { CLASSES, team, walking });
  await p.waitForTimeout(600);
  await p.screenshot({ path: out });
  await b.close();
  console.log('wrote', out);
})();
