// Does the gun in your hands react to you?
//
// "Feel" sounds unmeasurable, but most of it is not. A gun that kicks when you
// fire, settles at its own weapon's pace, bobs when you run, lags when you turn,
// and tells you when a shot lands — every one of those is an off-vs-on question
// with a number attached.
//
// This drives the real sim and the real viewmodel code through window.__stepFeel
// at a FIXED timestep, with no rendering at all. Two reasons. Frame-sampling was
// tried first and does not work here: this environment draws the game at roughly
// 1.3 frames a second (draw-call overhead under the software rasterizer, not
// fill rate — dropping the render resolution to a postage stamp changed nothing),
// so an animation that lasts 60 ms is invisible to it. And a fixed timestep makes
// the numbers exact and identical on every machine.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const URL = process.argv[2] || process.env.GAME_URL || 'http://localhost:8099/index.html';
let failures = 0;
const pass = (m) => console.log('PASS ' + m);
const fail = (m) => { console.log('FAIL ' + m); failures++; };
const DEADLINE = setTimeout(() => { console.log('FAIL feel bench timed out'); process.exit(1); }, 180000);

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(URL);
  await page.waitForFunction(() => window.__game && document.getElementById('loading').hidden, null, { timeout: 60000 });
  await page.evaluate(() => { window.__menuSelect('1'); window.__menuSelect('1'); window.__menuSelect('3'); window.__closeMenu(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const g = window.__game, h = window.__human;
    g.roundLength = 1e9;
    window.__brains.forEach((br) => { br.update = () => {}; });
    g.players.filter((x) => x.isBot).forEach((x) => { x.alive = false; x.pos = [0, -60, 0]; });
    h.alive = true; h.hp = 1e6; h.armor = 1e6;
    h.pos = [0, 0.05, -34]; h.vel = [0, 0, 0]; h.yaw = 0; h.pitch = 0; h.onGround = true;
    // A bench loadout: no single class carries both a rocket launcher and a
    // minigun, and the heavy-vs-fast comparison needs a real spread.
    h.weapons = ['rpg', 'ac', 'shotgun'];
    h.ammo = { shells: 999, nails: 999, rockets: 999, cells: 999 };
    h.wi = 0;
    // Step sim + viewmodel by hand. Ordnance is binned each step: this bench
    // measures the gun in your hands, not what it fired.
    window.__step = (dt, before) => {
      if (before) before();
      const v = window.__stepFeel(dt);
      g.projectiles.length = 0; g.particles.length = 0;
      return { pos: v.pos.slice(), pitch: v.pitch, roll: v.roll, yaw: v.yaw, fire: h.fireAnim, t: g.time };
    };
  });

  const DT = 1 / 60;

  // ---- recoil ---------------------------------------------------------------
  const recoil = async (weapon) => page.evaluate(({ weapon, DT }) => {
    const h = window.__human, g = window.__game;
    h.wi = h.weapons.indexOf(weapon); h.cooldown = 0; h.fireAnim = 0;
    h.spinup = weapon === 'ac' ? 99 : 0;   // a spun-up minigun rumbles; do not leave that on
    h.vel = [0, 0, 0]; h.onGround = true;
    for (let i = 0; i < 30; i++) window.__step(DT);          // settle, incl. the draw animation
    const rest = window.__step(DT).pos;
    g.fire(h, h.weapon());
    let peak = 0, steps = 0, settle = null;
    for (let i = 0; i < 240; i++) {
      const s = window.__step(DT, () => { h.vel = [0, 0, 0]; });
      peak = Math.max(peak, Math.hypot(s.pos[0] - rest[0], s.pos[1] - rest[1], s.pos[2] - rest[2]));
      steps++;
      if (settle === null && s.fire <= 0) settle = steps * DT;
    }
    const back = window.__step(DT).pos;
    const w = h.weapon();
    return { name: w.name, rate: w.rate, settle, peak,
      home: Math.hypot(back[0] - rest[0], back[1] - rest[1], back[2] - rest[2]) };
  }, { weapon, DT });

  const rpg = await recoil('rpg');
  const ac = await recoil('ac');
  console.log(`recoil: ${rpg.name} (rate ${rpg.rate}s) settles in ${rpg.settle === null ? 'never' : rpg.settle.toFixed(3) + 's'}, kicks ${(rpg.peak * 100).toFixed(1)} cm`);
  console.log(`        ${ac.name} (rate ${ac.rate}s) settles in ${ac.settle === null ? 'never' : ac.settle.toFixed(3) + 's'}, kicks ${(ac.peak * 100).toFixed(1)} cm`);

  rpg.settle !== null && ac.settle !== null
    ? pass('both weapons recover from recoil')
    : fail('a weapon never finished its recoil animation');
  if (rpg.settle !== null && ac.settle !== null) {
    rpg.settle > ac.settle * 2.5
      ? pass(`a heavy weapon sits back longer than a fast one (${rpg.settle.toFixed(3)}s vs ${ac.settle.toFixed(3)}s)`)
      : fail(`every weapon recovers at the same pace (${rpg.settle.toFixed(3)}s vs ${ac.settle.toFixed(3)}s) — they all weigh the same in the hand`);
  }
  rpg.peak > 0.02
    ? pass(`the gun kicks when it fires (${(rpg.peak * 100).toFixed(1)} cm)`)
    : fail(`the gun barely moves when it fires (${(rpg.peak * 100).toFixed(1)} cm) — no recoil to feel`);
  rpg.home < 0.002
    ? pass(`and returns to rest (${(rpg.home * 1000).toFixed(2)} mm off)`)
    : fail(`the gun does not return to rest after firing (${(rpg.home * 1000).toFixed(2)} mm off)`);

  // The recoil curve should overshoot PAST rest on the way back, not slide home
  // in a straight line — that overshoot is what reads as a snap rather than a
  // drift. Measured as the gun going forward of where it started.
  const curve = await page.evaluate(({ DT }) => {
    const h = window.__human, g = window.__game;
    h.wi = h.weapons.indexOf('rpg'); h.cooldown = 0; h.fireAnim = 0; h.spinup = 0; h.vel = [0, 0, 0]; h.onGround = true;
    for (let i = 0; i < 30; i++) window.__step(DT);
    const rest = window.__step(DT).pos;
    g.fire(h, h.weapon());
    let maxBack = 0, maxFwd = 0;
    for (let i = 0; i < 120; i++) {
      const s = window.__step(DT, () => { h.vel = [0, 0, 0]; });
      const dz = s.pos[2] - rest[2];
      maxBack = Math.max(maxBack, dz);      // +z is toward you
      maxFwd = Math.min(maxFwd, dz);
    }
    return { maxBack, maxFwd };
  }, { DT });
  console.log(`recoil curve: ${(curve.maxBack * 1000).toFixed(1)} mm back, ${(-curve.maxFwd * 1000).toFixed(1)} mm of forward overshoot`);
  -curve.maxFwd > curve.maxBack * 0.05
    ? pass('recoil overshoots past rest and settles, rather than sliding home')
    : fail(`recoil slides straight back to rest (${(-curve.maxFwd * 1000).toFixed(1)} mm overshoot) — it reads as a drift, not a snap`);

  // ---- bob ------------------------------------------------------------------
  const bob = await page.evaluate(({ DT }) => {
    const h = window.__human;
    const span = (n, moving) => {
      const mn = [9, 9, 9], mx = [-9, -9, -9];
      let rollMin = 9, rollMax = -9;
      for (let i = 0; i < n; i++) {
        const s = window.__step(DT, () => {
          if (moving) { h.vel = [0, 0, -h.def.speed]; h.onGround = true; }
          else { h.vel = [0, 0, 0]; h.onGround = true; }
        });
        for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], s.pos[k]); mx[k] = Math.max(mx[k], s.pos[k]); }
        rollMin = Math.min(rollMin, s.roll); rollMax = Math.max(rollMax, s.roll);
      }
      return { travel: Math.max(mx[0] - mn[0], mx[1] - mn[1]), roll: rollMax - rollMin };
    };
    h.wi = h.weapons.indexOf('shotgun'); h.fireAnim = 0; h.spinup = 0; h.vel = [0, 0, 0];
    for (let i = 0; i < 40; i++) window.__step(DT);
    const still = span(90, false);
    const walking = span(180, true);
    h.vel = [0, 0, 0];
    return { still: still.travel, walking: walking.travel, roll: walking.roll };
  }, { DT });
  console.log(`bob: standing ${(bob.still * 1000).toFixed(2)} mm, running ${(bob.walking * 1000).toFixed(1)} mm and ${(bob.roll * 1000).toFixed(1)} mrad of roll`);
  bob.walking > 0.012
    ? pass(`the gun bobs while you run (${(bob.walking * 1000).toFixed(1)} mm)`)
    : fail(`the gun hardly bobs while you run (${(bob.walking * 1000).toFixed(1)} mm) — it reads as a static prop`);
  bob.walking > Math.max(bob.still * 5, 0.008)
    ? pass('and is still when you are')
    : fail(`standing still moves the gun almost as much as running (${(bob.still * 1000).toFixed(2)} mm vs ${(bob.walking * 1000).toFixed(1)} mm)`);
  bob.roll > 0.01
    ? pass('and rolls with the stride rather than sliding flat')
    : fail(`the bob has no roll to it (${(bob.roll * 1000).toFixed(1)} mrad) — it slides on one axis`);

  // ---- turn lag -------------------------------------------------------------
  const sway = await page.evaluate(({ DT }) => {
    const h = window.__human;
    h.vel = [0, 0, 0]; h.yaw = 0; h.fireAnim = 0; h.spinup = 0;
    for (let i = 0; i < 40; i++) window.__step(DT);
    const rest = window.__step(DT).pos;
    let peak = 0;
    for (let i = 0; i < 60; i++) {                    // a one-second swing
      const s = window.__step(DT, () => { h.yaw += 3.5 * DT; h.vel = [0, 0, 0]; });
      peak = Math.max(peak, Math.abs(s.pos[0] - rest[0]));
    }
    // and it must come back once you stop turning
    for (let i = 0; i < 60; i++) window.__step(DT, () => { h.vel = [0, 0, 0]; });
    const back = window.__step(DT).pos;
    return { peak, home: Math.abs(back[0] - rest[0]) };
  }, { DT });
  console.log(`turn lag: the gun trails the camera by ${(sway.peak * 1000).toFixed(1)} mm, recentres to ${(sway.home * 1000).toFixed(2)} mm`);
  sway.peak > 0.004
    ? pass('the gun lags behind when you swing the view')
    : fail(`the gun is welded to the camera (${(sway.peak * 1000).toFixed(1)} mm of lag) — turning feels weightless`);
  sway.home < 0.001
    ? pass('and recentres when you stop')
    : fail(`the gun stays off-centre after turning (${(sway.home * 1000).toFixed(2)} mm)`);

  // ---- hit confirmation -----------------------------------------------------
  // This one does need the HUD, so it waits on real frames — but only a handful.
  const hit = await page.evaluate(async () => {
    const g = window.__game, h = window.__human;
    const frames = (n) => new Promise((done) => { let l = n; (function s() { if (--l <= 0) return done(); requestAnimationFrame(s); })(); });
    const victim = g.players.find((x) => x !== h);
    victim.alive = true; victim.hp = 900; victim.armor = 0;   // armour would eat most of the damage
    victim.team = 1 - h.team; victim.pos = [0, 0.05, -38];
    g.damage(victim, 42, h, 'hitscan', [0, 0, -1], 0);
    await frames(4);
    const nums = Array.from(document.querySelectorAll('.dmg')).map((e) => e.textContent);
    const tick = parseFloat(getComputedStyle(document.getElementById('xhair')).getPropertyValue('--hit')) || 0;
    // Several hits landing in one tick — a shotgun puts nine pellets into you at
    // once — must read as one number, not nine stacked on top of each other.
    // Deliberately NOT separated by frames: at the 1.3 fps this environment
    // manages, four frames is three seconds and the merge window has long gone.
    for (const q of g.players) q.__x = 0;
    const v2 = g.players.find((x) => x !== h);
    v2.hp = 900;
    g.damage(v2, 20, h, 'hitscan', [0, 0, -1], 0);
    g.damage(v2, 20, h, 'hitscan', [0, 0, -1], 0);
    g.damage(v2, 19, h, 'hitscan', [0, 0, -1], 0);
    await frames(4);
    const merged = Array.from(document.querySelectorAll('.dmg')).map((e) => e.textContent);
    return { nums, tick, merged };
  });
  console.log(`hit confirm: ${JSON.stringify(hit.nums)} on screen, crosshair tick ${hit.tick}, after a second hit ${JSON.stringify(hit.merged)}`);
  hit.nums.length > 0
    ? pass(`a damage number appears when you land a shot (${hit.nums[0]})`)
    : fail('landing a shot shows nothing on screen — no way to tell a hit from a miss');
  hit.tick > 0
    ? pass(`the crosshair confirms the hit (${hit.tick})`)
    : fail('the crosshair does not react to a hit');
  hit.merged.includes('101') && !hit.merged.includes('20')
    ? pass('hits landing together add into one number (42 + 20 + 20 + 19 = 101), not a stack')
    : fail(`hits landing in the same tick did not merge: got ${JSON.stringify(hit.merged)}, expected one reading 101`);

  await browser.close();
  if (errs.length) { console.log('CONSOLE ERRORS:\n  ' + errs.join('\n  ')); failures++; }
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nfeel test OK');
  clearTimeout(DEADLINE);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FAIL feel bench threw: ' + e.message); process.exit(1); });
