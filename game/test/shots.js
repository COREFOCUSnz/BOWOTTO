// Takes screenshots from a list of camera spots for eyeballing the map.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const SPOTS = {
  bridge_to_blue: { pos: [0, 0.05, 6], yaw: 0, pitch: 0.05 },
  blue_deck_out: { pos: [-6, 6.05, -17], yaw: Math.PI, pitch: -0.12 },
  lobby: { pos: [0, 0.05, -14], yaw: Math.PI, pitch: 0.0 },
  ramp_room: { pos: [-16.5, 0.05, -23], yaw: Math.PI, pitch: 0.15 },
  spiral: { pos: [-12, 0.05, -30.5], yaw: 0, pitch: -0.3 },
  flag_room: { pos: [-4, -4.95, -28], yaw: Math.PI + 0.7, pitch: -0.1 },
  water_tunnel: { pos: [16, -3.5, -9], yaw: Math.PI, pitch: 0.0 },
  spawn: { pos: [0, 0.05, -40], yaw: 0, pitch: 0 },
  overview: { pos: [0, 13, -46], yaw: Math.PI, pitch: -0.55 },
  closeup: { pos: [0, 0.05, -18], yaw: Math.PI, pitch: 0, bot: [0, 0, -14.5] },
  upper_hall: { pos: [10, 6.05, -22], yaw: Math.PI, pitch: -0.1 },
};
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.waitForFunction(() => window.__game && document.getElementById('loading').hidden);
  await page.evaluate(() => { window.__menuSelect('1'); window.__menuSelect('1'); window.__menuSelect('3'); window.__closeMenu(); });
  const dir = process.env.SHOT_DIR || '/tmp';
  const want = process.argv.slice(2);
  for (const [name, s] of Object.entries(SPOTS)) {
    if (want.length && !want.includes(name)) continue;
    await page.evaluate((s) => { const h = window.__human; h.alive = true; h.hp = 100; h.pos = s.pos; h.yaw = s.yaw; h.pitch = s.pitch; h.vel = [0, 0, 0];
      if (s.bot) { const bots = window.__game.players.filter((p) => p.isBot); bots.slice(0, 3).forEach((b, i) => { b.alive = true; b.hp = 100; b.pos = [s.bot[0] + i * 1.5 - 1.5, s.bot[1], s.bot[2]]; b.yaw = 0.3 * i; b.vel = [0, 0, 0]; b.cls = ['hwguy', 'sniper', 'medic'][i]; b.weapons = ['ac']; b.wi = 0; }); } }, s);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${dir}/${name}.png` });
  }
  await browser.close();
})();
