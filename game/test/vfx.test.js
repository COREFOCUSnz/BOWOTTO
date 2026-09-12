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
const W = 320, H = 200;
let failures = 0;
const pass = (m) => console.log('PASS ' + m);
const fail = (m) => { console.log('FAIL ' + m); failures++; };

// Budgets. An explosion has to read as an explosion without taking the fight
// away from you: you must still be able to see and shoot through the tail of it.
// Set against the measured seed-to-seed spread, not against one blast: the same
// explosion measures 21.4% peak on one effects seed and 12.7% on another, so a
// budget within a few points of the mean is measuring the dice. For reference the
// version that started all this measured 81% peak and 81% tail, which every
// budget here still catches by a mile.
const BUDGET = {
  peakCover: 0.55,     // fraction of screen meaningfully changed, at 5 m
  peakBright: 0.22,    // fraction of the screen turned into a bright flash
  lateCover: 0.06,     // what is still in the way as the blast dies
  seconds: 0.75,       // longest-lived piece of an explosion
  minPeakCover: 0.09,  // ...and it must still actually be an explosion. An earlier
                       // tuning that looked anaemic on screen measured 8%; this
                       // catches that and leaves the current blast real margin.
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
  await page.goto(URL + (URL.includes('?') ? '&' : '?') + 'readback');
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
    window.__settings.resolution = 0.5;
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

  // Frames are read straight out of the GL back buffer and compared INSIDE the
  // page. Nothing crosses the CDP bridge but two floats.
  //
  // This started as page.screenshot() plus a second page to decode into, and it
  // does not work here: a screenshot of a page rendering at about a frame a
  // second costs tens of seconds, and the bench could not finish inside ten
  // minutes. Reading the back buffer needs preserveDrawingBuffer, which the
  // renderer turns on only for the ?readback query this bench loads with.
  //
  // A happy side effect: the HUD is DOM drawn over the canvas, so it is not in
  // the buffer at all. An earlier version had to hide it, guessed the element
  // ids wrong, and spent a while blaming the game for orange HUD text that it
  // was counting as "team red" pixels.
  stage('ready');
  const ok = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const gl = c && (c.getContext('webgl') || c.getContext('experimental-webgl'));
    if (!gl) return false;
    window.__F = {};
    window.__grab = (name) => {
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      window.__F[name] = { d: buf, w, h };
      return [w, h];
    };
    // How much of the view one frame takes away from another.
    window.__cover = (an, bn) => {
      const A = window.__F[an], B = window.__F[bn], a = A.d, b = B.d;
      let changed = 0, bright = 0, n = A.w * A.h;
      for (let i = 0; i < a.length; i += 4) {
        const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
        if (d > 60) changed++;
        const luma = (b[i] * 0.299 + b[i + 1] * 0.587 + b[i + 2] * 0.114) / 255;
        const was = (a[i] * 0.299 + a[i + 1] * 0.587 + a[i + 2] * 0.114) / 255;
        if (luma > 0.72 && luma > was + 0.15) bright++;
      }
      return { cover: changed / n, bright: bright / n };
    };
    // Whole-frame difference, for comparing two models rather than two moments.
    window.__diff = (an, bn) => {
      const a = window.__F[an].d, b = window.__F[bn].d;
      let n = 0;
      for (let i = 0; i < a.length; i += 4) {
        const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
        if (d > 24) n++;
      }
      return n / (a.length / 4);
    };
    // Saturated team colour in a box around the middle of the frame. readPixels
    // returns rows bottom-up, which only matters for a box that is not centred.
    window.__tint = (name) => {
      const A = window.__F[name], d = A.d, w = A.w, h = A.h;
      let warm = 0, cool = 0;
      const x0 = (w * 0.35) | 0, x1 = (w * 0.65) | 0, y0 = (h * 0.25) | 0, y1 = (h * 0.65) | 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 4;
        const r = d[i], g = d[i + 1], bl = d[i + 2];
        // Saturation gate: the warm lamp-lit concrete is a grey, not a team colour.
        if (Math.max(r, g, bl) - Math.min(r, g, bl) < 45) continue;
        if (r > bl + 40) warm++;
        else if (bl > r + 40) cool++;
      }
      return { warm, cool };
    };
    // Screen coverage without rendering: project every live particle as a sphere
    // and stamp it on a coarse grid. Validated against the pixel measurement on
    // the same blasts — 8.4 vs 8.1, 11.5 vs 11.9, 14.7 vs 14.2 — so it is the
    // same number, only free. It reads slightly HIGH on the faded tail, because
    // it counts a puff's whole circle while the pixel test only counts pixels
    // that moved by a threshold; high is the safe direction for a ceiling.
    //
    // Rendering a frame costs ten to twenty seconds under the headless software
    // rasterizer, and sampling an explosion needs dozens. This costs microseconds,
    // so the bench can afford many seeds instead of one lucky blast.
    window.__blastCover = (opts) => {
      opts = opts || {};
      const GW = 160, GH = 100;
      const minA = opts.minAlpha === undefined ? 0.04 : opts.minAlpha;
      const V = window.V, r = window.__renderer, h = window.__human;
      const eye = h.eye(), fwd = V.forward(h.yaw, h.pitch);
      const right = V.norm([fwd[2], 0, -fwd[0]]);
      const up = [right[1]*fwd[2]-right[2]*fwd[1], right[2]*fwd[0]-right[0]*fwd[2], right[0]*fwd[1]-right[1]*fwd[0]];
      const tanY = Math.tan(r.fov / 2), tanX = tanY * (GW / GH);
      const grid = new Uint8Array(GW * GH);
      for (const q of window.__game.particles) {
        const t = 1 - q.life / q.maxLife;
        const alpha = q.alpha === undefined ? 1 : q.alpha * Math.pow(1 - t, q.fade || 1);
        if (alpha < minA) continue;                 // below 0.04 the eye loses it too
        if (opts.glare && !(q.emissive > 0.5)) continue;
        const size = q.size + (q.grow || 0) * (1 - (1 - t) * (1 - t));
        const rad = size / 2;
        const d = [q.pos[0]-eye[0], q.pos[1]-eye[1], q.pos[2]-eye[2]];
        const z = d[0]*fwd[0] + d[1]*fwd[1] + d[2]*fwd[2];
        if (z <= 0.05) continue;
        const nx = (d[0]*right[0] + d[1]*right[1] + d[2]*right[2]) / z / tanX;
        const ny = (d[0]*up[0] + d[1]*up[1] + d[2]*up[2]) / z / tanY;
        const cx = (nx * 0.5 + 0.5) * GW, cy = (0.5 - ny * 0.5) * GH;
        const pr = ((rad / z) / tanY) * 0.5 * GH;
        const x0 = Math.max(0, Math.floor(cx - pr)), x1 = Math.min(GW - 1, Math.ceil(cx + pr));
        const y0 = Math.max(0, Math.floor(cy - pr)), y1 = Math.min(GH - 1, Math.ceil(cy + pr));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
          if (dx*dx + dy*dy <= pr*pr) grid[y*GW + x] = 1;
        }
      }
      let n = 0; for (let i = 0; i < grid.length; i++) n += grid[i];
      return n / (GW * GH);
    };
    // How much of the screen the blast turns into a bright flash — the blinding
    // part, as opposed to merely being in the way. Same rasterizer, restricted to
    // emissive puffs that are still opaque. An earlier version of this returned a
    // peak alpha instead of a screen fraction and read 100% off a single spark.
    window.__blastGlare = () => window.__blastCover({ glare: true, minAlpha: 0.45 });
    return true;
  });
  if (!ok) { console.log('FAIL could not reach the GL context for readback'); process.exit(1); }
  // one drawn frame, then capture
  const frame = () => page.evaluate(() => new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(d))));
  const grab = async (name) => { await frame(); await page.evaluate((n) => window.__grab(n), name); return name; };
  const compare = (a, b) => page.evaluate(({ a, b }) => window.__cover(a, b), { a, b });
  const diff = (a, b) => page.evaluate(({ a, b }) => window.__diff(a, b), { a, b });
  const tint = (name) => page.evaluate((n) => window.__tint(n), name);

  await grab('base');

  stage('explosion');
  // Eight effect seeds, averaged. Every puff is randomised, so one blast is one
  // draw from a distribution: the same explosion measures 21% peak on one seed
  // and 13% on another, and a budget set against a single sample is measuring
  // the dice. Eight of them is only affordable because the measure needs no
  // frames.
  const SEEDS = [20260912, 7, 99, 12345, 31337, 2024, 555, 42];
  const runs = [];
  for (const seed of SEEDS) {
    const r = await page.evaluate(({ seed }) => {
      const g = window.__game;
      g.particles.length = 0;
      g.seedEffects(seed);
      g.explode([0, 1.0, -36], 92, 4.2, null, 'rocket');
      const seeded = g.particles.map((q) => ({ q, maxLife: q.maxLife }));
      const longest = Math.max(...g.particles.map((q) => q.maxLife));
      const count = g.particles.length;
      const at = (t) => {
        for (const s of seeded) s.q.life = s.maxLife * (1 - t);
        return { t, cover: window.__blastCover(), glare: window.__blastGlare() };
      };
      const samples = [0.1, 0.2, 0.3, 0.45, 0.6, 0.7, 0.85].map(at);
      return { count, longest, samples };
    }, { seed });
    const peak = r.samples.reduce((a, b) => (b.cover > a.cover ? b : a));
    runs.push({
      seed, count: r.count, longest: r.longest,
      peak: peak.cover, peakAt: peak.t,
      glare: Math.max(...r.samples.map((x) => x.glare)),
      // What is left once the blast is nearly over. With the eased growth the
      // peak now lands at t=0.7, so "max over the late samples" just restated the
      // peak; the question worth asking is whether it CLEARS.
      late: r.samples[r.samples.length - 1].cover,
    });
  }
  const mean = (f) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
  const spread = (f) => Math.max(...runs.map(f)) - Math.min(...runs.map(f));
  const peakCover = mean((r) => r.peak), peakBright = mean((r) => r.glare);
  const late = mean((r) => r.late), longest = Math.max(...runs.map((r) => r.longest));
  console.log(`explosion at 5 m, ${runs[0].count} particles, mean of ${SEEDS.length} seeds:`);
  console.log(`  peak cover ${(peakCover * 100).toFixed(1)}%  (worst seed ${(Math.max(...runs.map((r) => r.peak)) * 100).toFixed(1)}%, spread ${(spread((r) => r.peak) * 100).toFixed(1)})`);
  console.log(`  left at the end ${(late * 100).toFixed(1)}%  (worst seed ${(Math.max(...runs.map((r) => r.late)) * 100).toFixed(1)}%)`);
  console.log(`  clears in  ${longest.toFixed(2)}s\n`);

  peakCover <= BUDGET.peakCover
    ? pass(`peak cover ${(peakCover * 100).toFixed(1)}% (budget ${BUDGET.peakCover * 100}%)`)
    : fail(`the explosion covers ${(peakCover * 100).toFixed(1)}% of the screen — you cannot see the fight (budget ${BUDGET.peakCover * 100}%)`);
  peakBright <= BUDGET.peakBright
    ? pass(`peak glare ${(peakBright * 100).toFixed(0)}% (budget ${BUDGET.peakBright * 100}%)`)
    : fail(`the explosion stays blown out at ${(peakBright * 100).toFixed(0)}% (budget ${BUDGET.peakBright * 100}%)`);
  late <= BUDGET.lateCover
    ? pass(`and clears out of the way: ${(late * 100).toFixed(1)}% left at the end (budget ${BUDGET.lateCover * 100}%)`)
    : fail(`the blast is still covering ${(late * 100).toFixed(1)}% of the screen as it dies (budget ${BUDGET.lateCover * 100}%) — it hangs around`);
  longest <= BUDGET.seconds
    ? pass(`clears in ${longest.toFixed(2)}s (budget ${BUDGET.seconds}s)`)
    : fail(`the explosion lingers ${longest.toFixed(2)}s (budget ${BUDGET.seconds}s)`);
  // The control: tuning it down to nothing would pass every budget above.
  peakCover >= BUDGET.minPeakCover
    ? pass(`still reads as an explosion (${(peakCover * 100).toFixed(1)}% >= ${BUDGET.minPeakCover * 100}%)`)
    : fail(`the explosion is barely visible at ${(peakCover * 100).toFixed(1)}% — tuned into nothing`);

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
    return grab(name);
  };
  stage('pipebomb team band');
  await bomb(0, 'blue'); await bomb(1, 'red');
  // Measure the band's COLOUR in a box around the bomb rather than diffing whole
  // frames. A frame diff kept reporting a non-zero same-team control — the scene
  // is never quite pixel-identical twice under software GL — and a proxy you have
  // to subtract noise from is worse than measuring the thing itself.
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
    g.seedEffects(20260912);
    h.pos = [0, 0.05, -31]; h.vel = [0, 0, 0]; h.yaw = 0; h.pitch = 0; h.hp = 1e6; h.armor = 1e6;
    for (let i = 0; i < 8; i++) g.explode([(i % 4) * 0.9 - 1.35, 0.6, -36 + Math.floor(i / 4) * 1.2], 100, 4, null, 'pipebomb');
    window.__seed = g.particles.map((q) => ({ q, maxLife: q.maxLife }));
    return { count: g.particles.length };
  });
  let chainPeak = 0;
  for (const t of [0.2, 0.4, 0.6, 0.75]) {
    chainPeak = Math.max(chainPeak, await page.evaluate((t) => {
      for (const s of window.__seed) s.q.life = s.maxLife * (1 - t);
      return window.__blastCover();
    }, t));
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
