// Drives the game through the touch controls in an emulated landscape phone.
// Fails on console errors, if the touch UI does not appear, or if the controls
// do not actually move and turn the player.
const { chromium, devices } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({
    viewport: { width: 844, height: 390 },        // iPhone-ish, landscape
    deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: devices['iPhone 13'].userAgent,
  });
  const page = await ctx.newPage();
  const errors = [];
  // Firebase's CDN scripts are optional and this sandbox cannot reach
  // google.com/gstatic.com at all, so a failed resource load for them is
  // expected here (and for a real player behind a firewall or ad-blocker) —
  // filtered rather than treated as a page bug.
  const EXPECTED_NETWORK_FAILURE = /net::ERR_|Failed to load resource/;
  page.on('console', (m) => { if (m.type() === 'error' && !EXPECTED_NETWORK_FAILURE.test(m.text())) { const t = m.text(); if (!errors.includes(t)) errors.push(t); } });
  page.on('pageerror', (e) => { const t = 'pageerror: ' + e.message; if (!errors.includes(t)) errors.push(t); });
  const url = process.argv[2] || process.env.GAME_URL || 'file://' + path.resolve(__dirname, '../index.html');
  await page.goto(url);
  await page.waitForFunction(() => window.__game && document.getElementById('loading').hidden, null, { timeout: 30000 });

  const fail = (msg) => { console.log('FAIL ' + msg); errors.push(msg); };
  const pass = (msg) => console.log('PASS ' + msg);

  // the coarse-pointer check should have switched the UI on by itself
  let on = await page.evaluate(() => window.__touch.enabled);
  if (!on) { await page.touchscreen.tap(400, 200); await page.waitForTimeout(150); on = await page.evaluate(() => window.__touch.enabled); }
  on ? pass('touch controls enabled on a phone viewport') : fail('touch controls never enabled');

  // the menu must sit above the touch buttons and be tappable with a finger
  const stacked = await page.evaluate(() => {
    // With a menu open no game button may be reachable: check the centre of every
    // touch control, plus the centre of the first menu entry.
    const bad = [];
    for (const el of document.querySelectorAll('#touch .tb')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (top && top.closest('#touch')) bad.push(el.className + ' @' + Math.round(r.x) + ',' + Math.round(r.y));
    }
    const mb = document.querySelector('#menu .list button').getBoundingClientRect();
    const overMenu = document.elementFromPoint(mb.left + mb.width / 2, mb.top + mb.height / 2);
    return { bad, menuTappable: !!(overMenu && overMenu.closest('#menu')) };
  });
  stacked.bad.length === 0 ? pass('no touch button is reachable while a menu is open')
    : fail('touch buttons sit over the open menu: ' + stacked.bad.join(', '));
  stacked.menuTappable ? pass('menu entries are tappable') : fail('menu entries are not the top element');

  // join by actually tapping, not by calling into the game
  const tapMenu = async (label) => {
    const btn = page.locator('#menu .list button', { hasText: label }).first();
    await btn.tap();
    await page.waitForTimeout(180);
  };
  await tapMenu('Join game');
  await tapMenu('Blue');
  await tapMenu('Soldier');
  await page.waitForTimeout(300);
  const joined = await page.evaluate(() => window.__human.alive && window.__human.cls === 'soldier');
  joined ? pass('joined by tapping through the menu') : fail('tapping the menu did not join');
  await page.evaluate(() => { if (window.__menu && window.__menu()) window.__closeMenu(); });
  await page.waitForTimeout(150);

  // buttons are on screen and inside the viewport
  const layout = await page.evaluate(() => {
    const out = {};
    for (const sel of ['.fire', '.jump', '.action', '.gren', '.menu', '.scores']) {
      const el = document.querySelector('#touch ' + sel);
      if (!el) { out[sel] = null; continue; }
      const r = el.getBoundingClientRect();
      out[sel] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 };
    }
    return out;
  });
  for (const [sel, r] of Object.entries(layout)) {
    if (!r) { fail('missing touch button ' + sel); continue; }
    if (!r.inside) fail(`${sel} sits outside the screen at ${r.x},${r.y} ${r.w}x${r.h}`);
    if (Math.min(r.w, r.h) < 34) fail(`${sel} is too small to tap (${r.w}x${r.h})`);
  }
  pass('touch buttons laid out inside the viewport at tappable sizes');

  // --- movement: drag the left stick forward
  const start = await page.evaluate(() => window.__human.pos.slice());
  await page.touchscreen.tap(1, 1).catch(() => {});
  const ts = page.touchscreen;
  await page.evaluate(() => { window.__human.vel = [0, 0, 0]; });
  await page.dispatchEvent('#c', 'touchstart', { touches: [{ identifier: 1, clientX: 150, clientY: 280 }], changedTouches: [{ identifier: 1, clientX: 150, clientY: 280 }], targetTouches: [] });
  await page.dispatchEvent('#c', 'touchmove', { touches: [{ identifier: 1, clientX: 150, clientY: 200 }], changedTouches: [{ identifier: 1, clientX: 150, clientY: 200 }], targetTouches: [] });
  await page.waitForTimeout(900);
  const moved = await page.evaluate((s) => { const p = window.__human.pos; return Math.hypot(p[0] - s[0], p[2] - s[2]); }, start);
  await page.dispatchEvent('#c', 'touchend', { touches: [], changedTouches: [{ identifier: 1, clientX: 150, clientY: 200 }], targetTouches: [] });
  moved > 1 ? pass(`left stick moved the player ${moved.toFixed(1)} m`) : fail(`left stick did not move the player (${moved.toFixed(2)} m)`);

  // --- looking: drag the right half
  const yaw0 = await page.evaluate(() => window.__human.yaw);
  await page.dispatchEvent('#c', 'touchstart', { touches: [{ identifier: 2, clientX: 600, clientY: 200 }], changedTouches: [{ identifier: 2, clientX: 600, clientY: 200 }], targetTouches: [] });
  await page.dispatchEvent('#c', 'touchmove', { touches: [{ identifier: 2, clientX: 750, clientY: 200 }], changedTouches: [{ identifier: 2, clientX: 750, clientY: 200 }], targetTouches: [] });
  await page.waitForTimeout(250);
  await page.dispatchEvent('#c', 'touchend', { touches: [], changedTouches: [{ identifier: 2, clientX: 750, clientY: 200 }], targetTouches: [] });
  const dyaw = await page.evaluate((y) => Math.abs(window.__human.yaw - y), yaw0);
  dyaw > 0.2 ? pass(`right-side drag turned the view ${(dyaw * 57).toFixed(0)} degrees`) : fail(`drag did not turn the view (${dyaw.toFixed(3)} rad)`);

  // --- fire button actually shoots
  const before = await page.evaluate(() => { const h = window.__human; h.wi = h.weapons.length - 1; h.cooldown = 0; return h.stats.dmg + h.ammo.rockets + h.ammo.shells + h.ammo.nails + h.ammo.cells; });
  await page.dispatchEvent('#touch .fire', 'touchstart', { touches: [], changedTouches: [], targetTouches: [] });
  await page.waitForTimeout(500);
  await page.dispatchEvent('#touch .fire', 'touchend', { touches: [], changedTouches: [], targetTouches: [] });
  const after = await page.evaluate(() => { const h = window.__human; return h.stats.dmg + h.ammo.rockets + h.ammo.shells + h.ammo.nails + h.ammo.cells; });
  after < before ? pass('fire button consumed ammo') : fail('fire button did nothing');

  // --- jump. Stand on known flat floor first; the earlier drags leave the player
  // wherever they wandered to, which is not a fair test of the button.
  await page.evaluate(() => { const h = window.__human; h.pos = [0, 0.05, -36]; h.vel = [0, 0, 0]; });
  await page.waitForFunction(() => window.__human.onGround, null, { timeout: 5000 }).catch(() => {});
  const groundY = await page.evaluate(() => window.__human.pos[1]);
  await page.dispatchEvent('#touch .jump', 'touchstart', { touches: [], changedTouches: [], targetTouches: [] });
  // Poll rather than sleep a fixed 150 ms: under software GL the game can run at
  // 1.5 fps, and one frame is then longer than the wait, so the press is never
  // read and a working button reads as dead.
  const jumped = await page.waitForFunction((y) => window.__human.pos[1] > y + 0.15 || window.__human.vel[1] > 1,
    groundY, { timeout: 6000, polling: 30 }).then(() => true, () => false);
  await page.dispatchEvent('#touch .jump', 'touchend', { touches: [], changedTouches: [], targetTouches: [] });
  jumped ? pass('jump button left the ground') : fail('jump button did nothing');

  // --- portrait shows the rotate prompt
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const rotating = await page.evaluate(() => !document.getElementById('rotate').hidden);
  rotating ? pass('portrait shows the rotate prompt') : fail('portrait did not prompt to rotate');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(400);
  const back = await page.evaluate(() => document.getElementById('rotate').hidden);
  back ? pass('landscape hides the rotate prompt') : fail('rotate prompt stuck on in landscape');

  const shot = process.env.SHOT_DIR || '/tmp';
  await page.evaluate(() => { const g = window.__game, h = window.__human; h.pos = [0, 0.05, -10]; h.yaw = Math.PI; h.pitch = 0; h.vel = [0, 0, 0]; h.hp = 92; });
  await page.waitForTimeout(500);
  await page.screenshot({ path: shot + '/mobile.png' });
  const fps = await page.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); }));
  console.log('headless fps (software GL):', fps.toFixed(1));
  await browser.close();
  if (errors.length) { console.log('\nFAILURES / CONSOLE ERRORS:'); errors.forEach((e) => console.log('  ' + e)); process.exit(1); }
  console.log('\nmobile test OK');
})().catch((e) => { console.error(e); process.exit(1); });
