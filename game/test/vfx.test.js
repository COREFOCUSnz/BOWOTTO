// How much of your view does an explosion take away, and for how long?
//
// A 0.3 s effect cannot be sampled by wall clock at the 2-5 fps software GL
// manages here, so this freezes the sim and drives the particles' own life
// values by hand: every frame is a known point in the effect, and the numbers
// are the same on any machine.
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const URL = process.argv[2] || process.env.GAME_URL || 'http://localhost:8099/index.html';
// Small on purpose. Coverage is a FRACTION of the frame, so the numbers are the
// same at any size — but these are big alpha-blended spheres and the headless
// software rasterizer paints them pixel by pixel, where 640x400 blew past
// Playwright's 30 s screenshot timeout.
const W = 240, H = 150;
let failures = 0;
const pass = (m) => console.log('PASS ' + m);
const fail = (m) => { console.log('FAIL ' + m); failures++; };

// Budgets. An explosion has to read as an explosion without taking the fight
// away from you: you must still be able to see and shoot through the tail of it.
const BUDGET = {
  peakCover: 0.55,     // fraction of screen meaningfully changed, at 5 m
  peakBright: 0.22,    // fraction blown out to near-white — this is the blinding part
  tailCover: 0.18,     // what is left over once the fireball is 70% through
  seconds: 0.75,       // longest-lived piece of an explosion
  minPeakCover: 0.14,  // ...and it must still actually be an explosion. 8% passed
                       // an earlier tuning that looked anaemic on screen; raised
                       // after looking at the frame, not at the number.
};

const T0 = Date.now();
const stage = (m) => console.log(`.. ${m} (${((Date.now() - T0) / 1000).toFixed(0)}s)`);
const DEADLINE = setTimeout(() => { console.log('FAIL vfx bench timed out'); process.exit(1); }, 600000);

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.setDefaultTimeout(90000);   // software GL takes its time with a screen full of fire
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(URL);
  await page.waitForFunction(() => window.__modelsReady && window.__modelsReady(), null, { timeout: 60000 });
  await page.evaluate(() => { window.__menuSelect('1'); window.__menuSelect('1'); window.__menuSelect('4'); window.__closeMenu(); });
  await page.waitForTimeout(300);

  // Park on flat ground in the blue spawn, looking at a fixed point 5 m away,
  // with nothing else moving. 5 m is roughly "a rocket landed near you".
  const DIST = 5;
  await page.evaluate((dist) => {
    const g = window.__game, h = window.__human;
    g.roundLength = 1e9;
    window.__brains.forEach((br) => { br.update = () => {}; });
    g.players.filter((x) => x.isBot).forEach((x) => { x.alive = false; });
    h.alive = true; h.pos = [0, 0.05, -36 + dist]; h.vel = [0, 0, 0]; h.yaw = 0; h.pitch = 0;
    h.hp = 1e6; h.armor = 1e6;
    // Drop the renderer's own resolution scale. These are big alpha-blended
    // spheres and the headless software rasterizer pays per fragment: at the
    // default 1.25 the late, largest samples took over a minute each and blew
    // through the screenshot timeout. Coverage is a fraction of the frame, so
    // the numbers are unchanged.
    window.__settings.resolution = 0.4;
    window.__hideViewmodel = true;
    // Hide the HUD by its class, not by guessed ids. Every overlay carries .ov;
    // an earlier id list hit almost nothing, and at this viewport the orange ammo
    // and weapon-name text lands in the middle of the frame, where it counted as
    // hundreds of "team red" pixels.
    document.querySelectorAll('.ov').forEach((e) => { e.style.display = 'none'; });
    // Freeze: the sim no longer ages particles, so we can hold any point of the effect.
    g.update = () => {};
  }, DIST);
  await page.waitForTimeout(500);

  // Pixel work happens in a second page so the game's own canvas is untouched.
  // Frames are decoded INTO that page and compared there: handing a 640x400 frame
  // back to node as JSON is a million numbers over the CDP bridge, which turned a
  // three second bench into one that never finished.
  stage('ready');
  const lab = await browser.newPage();
  await lab.setContent('<body></body>');
  await lab.evaluate(() => { window.I = {}; });
  const grab = async (name) => {
    const buf = await page.screenshot();
    await lab.evaluate(async ({ b64, name }) => {
      const bin = atob(b64); const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([u8], { type: 'image/png' }));
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext('2d'); ctx.drawImage(bmp, 0, 0);
      window.I[name] = { d: ctx.getImageData(0, 0, bmp.width, bmp.height).data, w: bmp.width, h: bmp.height };
    }, { b64: buf.toString('base64'), name });
    return name;
  };
  // How much of the view one frame takes away from another. The HUD is DOM drawn
  // over the canvas and never changes, so the top and bottom bands are skipped.
  const compare = (an, bn) => lab.evaluate(({ an, bn }) => {
    const A = window.I[an], B = window.I[bn], a = A.d, b = B.d, w = A.w, h = A.h;
    let changed = 0, bright = 0, counted = 0;
    const y0 = Math.floor(h * 0.14), y1 = Math.floor(h * 0.80);
    for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      counted++;
      const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      if (d > 60) changed++;
      const luma = (b[i] * 0.299 + b[i + 1] * 0.587 + b[i + 2] * 0.114) / 255;
      const was = (a[i] * 0.299 + a[i + 1] * 0.587 + a[i + 2] * 0.114) / 255;
      if (luma > 0.72 && luma > was + 0.15) bright++;
    }
    return { cover: changed / counted, bright: bright / counted };
  }, { an, bn });
  // Whole-frame difference, for comparing two models rather than two moments.
  const diff = (an, bn) => lab.evaluate(({ an, bn }) => {
    const a = window.I[an].d, b = window.I[bn].d;
    let n = 0, on = 0;
    for (let i = 0; i < a.length; i += 4) {
      const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      if (d > 24) n++;
      on++;
    }
    return n / on;
  }, { an, bn });

  await grab('base');

  stage('explosion');
  const spec = await page.evaluate(() => {
    const g = window.__game;
    g.particles.length = 0;
    // Seed immediately before the blast, not at page load: every puff is
    // randomised, and the running game eats a varying number of draws before we
    // get here, so a load-time seed still moved the coverage by several points.
    let s = 20260912;
    Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    g.explode([0, 1.0, -36], 92, 4.2, null, 'rocket');
    // snapshot each particle's full life so we can rewind to any t
    window.__seed = g.particles.map((q) => ({ q, maxLife: q.maxLife }));
    return { count: g.particles.length, longest: Math.max(...g.particles.map((q) => q.maxLife)) };
  });

  const samples = [];
  for (const t of [0.0, 0.3, 0.45, 0.6, 0.7, 0.85]) {
    await page.evaluate((t) => { for (const s of window.__seed) s.q.life = s.maxLife * (1 - t); }, t);
    await page.waitForTimeout(260);
    await grab('t' + t);
    samples.push({ t, ...(await compare('base', 't' + t)) });
    stage(`  sample t=${t}`);
  }
  console.log(`explosion: ${spec.count} particles, longest ${spec.longest.toFixed(2)}s, at ${DIST} m\n`);
  console.log('   t    screen covered   blown out');
  for (const s of samples) console.log(`  ${s.t.toFixed(2)}     ${(s.cover * 100).toFixed(1).padStart(5)}%        ${(s.bright * 100).toFixed(1).padStart(5)}%`);
  console.log('');

  const peak = samples.reduce((a, b) => (b.cover > a.cover ? b : a));
  const peakBright = Math.max(...samples.map((s) => s.bright));
  const tail = samples.filter((s) => s.t >= 0.7).reduce((a, b) => Math.max(a, b.cover), 0);

  peak.cover <= BUDGET.peakCover
    ? pass(`peak cover ${(peak.cover * 100).toFixed(1)}% at t=${peak.t} (budget ${BUDGET.peakCover * 100}%)`)
    : fail(`explosion covers ${(peak.cover * 100).toFixed(1)}% of the screen at t=${peak.t} — you cannot see the fight (budget ${BUDGET.peakCover * 100}%)`);
  peakBright <= BUDGET.peakBright
    ? pass(`peak blowout ${(peakBright * 100).toFixed(1)}% (budget ${BUDGET.peakBright * 100}%)`)
    : fail(`explosion blows out ${(peakBright * 100).toFixed(1)}% of the screen to white (budget ${BUDGET.peakBright * 100}%)`);
  tail <= BUDGET.tailCover
    ? pass(`tail cover ${(tail * 100).toFixed(1)}% (budget ${BUDGET.tailCover * 100}%)`)
    : fail(`smoke still hides ${(tail * 100).toFixed(1)}% of the screen 70% of the way through (budget ${BUDGET.tailCover * 100}%)`);
  spec.longest <= BUDGET.seconds
    ? pass(`clears in ${spec.longest.toFixed(2)}s (budget ${BUDGET.seconds}s)`)
    : fail(`explosion lingers ${spec.longest.toFixed(2)}s (budget ${BUDGET.seconds}s)`);
  // The control: tuning it down to nothing would pass every budget above.
  peak.cover >= BUDGET.minPeakCover
    ? pass(`still reads as an explosion (${(peak.cover * 100).toFixed(1)}% >= ${BUDGET.minPeakCover * 100}%)`)
    : fail(`explosion is barely visible at ${(peak.cover * 100).toFixed(1)}% — tuned into nothing`);


  // ---- the demoman's kit ----------------------------------------------------
  // His two launchers behave completely differently (pipes bounce and time out,
  // pipebombs stick and wait for your detonator) and for a long time they were
  // the same model with one blinking pixel between them. Nothing but a pixel
  // comparison catches that, so: render each on its own and require them to
  // differ, with a same-model control so the comparison is known to be honest.
  await page.evaluate(() => {
    const g = window.__game;
    g.projectiles.length = 0; g.particles.length = 0;
    document.querySelectorAll('.ov').forEach((e) => { e.style.display = 'none'; });
    window.__hideViewmodel = false;   // the showcase draws in the viewmodel pass
    window.__showcase = true;
  });
  const showcase = async (ids, name) => {
    await page.evaluate((ids) => { window.__showcaseIds = ids; window.__showcaseYaw = 1.62; }, ids);
    await page.waitForTimeout(320);
    return grab(name);
  };
  stage('launchers');
  const glA = await showcase(['gl'], 'glA');
  const glB = await showcase(['gl'], 'glB');     // control: the same model twice
  const plA = await showcase(['pl'], 'plA');
  const control = await diff(glA, glB);
  const launchers = await diff(glA, plA);
  console.log(`\nlaunchers: gl vs pl differ on ${(launchers * 100).toFixed(2)}% of pixels (same-model control ${(control * 100).toFixed(2)}%)`);
  launchers > Math.max(0.01, control * 4)
    ? pass(`grenade launcher and pipebomb launcher are different models`)
    : fail(`the two demoman launchers render near-identically (${(launchers * 100).toFixed(2)}% vs control ${(control * 100).toFixed(2)}%) — you cannot tell which one you are holding`);

  // A pipebomb has to show whose it is before you walk over it. The viewmodel is
  // hidden again here and the camera drops right onto the bomb: left visible and
  // far away, the swaying gun moved more pixels than the team band did, and the
  // same-team control caught exactly that.
  const bomb = async (team, name) => {
    await page.evaluate((team) => {
      const g = window.__game, h = window.__human;
      // Particles too, not just projectiles: firing spawns muzzle smoke, and with
      // the sim frozen it never ages away, so each shot left one more puff in
      // frame than the last and the same-team control was measuring that.
      g.projectiles.length = 0; g.particles.length = 0;
      h.wi = h.weapons.indexOf('pl'); h.cooldown = 0; h.pitch = -0.3; h.yaw = 0;
      g.fire(h, h.weapon());
      const q = g.projectiles[g.projectiles.length - 1];
      q.pos = [0, 0.02, -35.6]; q.vel = [0, 0, 0]; q.stuck = true; q.spin = 1.15; q.team = team;
      // Close, looking down, bomb lying across the view. The camera sits at eye
      // height, so a naive pitch put the bomb below the sample box entirely.
      h.pos = [0, 0.05, -34.75]; h.vel = [0, 0, 0]; h.yaw = 0; h.pitch = -1.02;
      window.__showcase = false; window.__hideViewmodel = true;
      document.querySelectorAll('.ov').forEach((e) => { e.style.display = 'none'; });
      g.update = () => {};
    }, team);
    await page.waitForTimeout(320);
    return grab(name);
  };
  stage('pipebomb team band');
  await bomb(0, 'blue'); await bomb(1, 'red');
  // Measure the band's COLOUR in a box around the bomb rather than diffing whole
  // frames. A frame diff kept reporting a non-zero same-team control — the scene
  // is never quite pixel-identical twice under software GL — and a proxy you have
  // to subtract noise from is worse than measuring the thing itself.
  const tint = (name) => lab.evaluate(({ name }) => {
    const A = window.I[name], d = A.d, w = A.w, h = A.h;
    let warm = 0, cool = 0;
    const x0 = (w * 0.35) | 0, x1 = (w * 0.65) | 0, y0 = (h * 0.35) | 0, y1 = (h * 0.75) | 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      const r = d[i], g = d[i + 1], bl = d[i + 2];
      // Saturation gate. Without it the warm lamp-lit concrete counted as "red"
      // and swamped the bomb: the floor is a warm grey, not a team colour.
      if (Math.max(r, g, bl) - Math.min(r, g, bl) < 45) continue;
      if (r > bl + 40) warm++;
      else if (bl > r + 40) cool++;
    }
    return { warm, cool };
  }, { name });
  const bt = await tint('blue'), rt = await tint('red');
  console.log(`pipebomb band: blue bomb -> ${bt.cool} blue px / ${bt.warm} red px; red bomb -> ${rt.warm} red px / ${rt.cool} blue px`);
  bt.cool > bt.warm * 2 && rt.warm > rt.cool * 2
    ? pass('a pipebomb is painted in the colours of the team that laid it')
    : fail(`a pipebomb does not show its team: blue bomb ${bt.cool}/${bt.warm} blue/red, red bomb ${rt.warm}/${rt.cool} red/blue`);

  // The worst case for seeing anything: a demoman detonating a full stack of
  // pipebombs, which fires eight blasts in a single tick. This is the case that
  // started all of this, so it gets its own budget rather than being assumed
  // fixed because one rocket now behaves.
  stage('pipebomb chain');
  const chain = await page.evaluate(() => {
    const g = window.__game, h = window.__human;
    g.projectiles.length = 0; g.particles.length = 0;
    let s = 20260912;
    Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    h.pos = [0, 0.05, -31]; h.vel = [0, 0, 0]; h.yaw = 0; h.pitch = 0; h.hp = 1e6; h.armor = 1e6;
    for (let i = 0; i < 8; i++) g.explode([(i % 4) * 0.9 - 1.35, 0.6, -36 + Math.floor(i / 4) * 1.2], 100, 4, null, 'pipebomb');
    window.__seed = g.particles.map((q) => ({ q, maxLife: q.maxLife }));
    return { count: g.particles.length };
  });
  let chainPeak = 0;
  for (const t of [0.2, 0.4, 0.6, 0.75]) {
    await page.evaluate((t) => { for (const s of window.__seed) s.q.life = s.maxLife * (1 - t); }, t);
    await page.waitForTimeout(260);
    await grab('c' + t);
    chainPeak = Math.max(chainPeak, (await compare('base', 'c' + t)).cover);
  }
  console.log(`\neight-pipebomb chain: ${chain.count} particles, peak cover ${(chainPeak * 100).toFixed(1)}%`);
  chainPeak <= 0.62
    ? pass(`a full pipebomb chain still leaves the fight visible (${(chainPeak * 100).toFixed(1)}%, budget 62%)`)
    : fail(`a full pipebomb chain covers ${(chainPeak * 100).toFixed(1)}% of the screen (budget 62%) — the demoman blinds himself`);
  chain.count < 8 * 24
    ? pass(`chained blasts thin out (${chain.count} particles, not ${8 * 24})`)
    : fail(`chained blasts each spawn a full cluster (${chain.count} particles)`);

  await browser.close();
  if (errs.length) { console.log('CONSOLE ERRORS:\n  ' + errs.join('\n  ')); failures++; }
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nvfx test OK');
  clearTimeout(DEADLINE);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FAIL vfx bench threw: ' + e.message); process.exit(1); });
