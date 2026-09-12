// Does the game sound like anything, and does it tell you where things are?
//
// Every sound here is synthesised, so it can be RENDERED rather than guessed at:
// each one is played into an OfflineAudioContext and the resulting waveform is
// measured. That means peak level, length and stereo balance are numbers, not
// opinions — the same discipline the rest of this project uses for loudness.
//
// Two caveats the bench works around. A couple of sounds schedule a second half
// through setTimeout, which never fires inside an offline render, so those are
// measured as their first half only. And the synth needs a real AudioContext
// class, so this runs in the browser rather than node.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const URL = process.argv[2] || process.env.GAME_URL || 'http://localhost:8099/index.html';
let failures = 0;
const pass = (m) => console.log('PASS ' + m);
const fail = (m) => { console.log('FAIL ' + m); failures++; };
const DEADLINE = setTimeout(() => { console.log('FAIL audio bench timed out'); process.exit(1); }, 180000);

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  // Firebase's CDN scripts are optional and this sandbox cannot reach
  // google.com/gstatic.com at all, so a failed resource load for them is
  // expected here (and for a real player behind a firewall or ad-blocker) —
  // filtered rather than treated as a page bug.
  const EXPECTED_NETWORK_FAILURE = /net::ERR_|Failed to load resource/;
  page.on('console', (m) => { if (m.type() === 'error' && !EXPECTED_NETWORK_FAILURE.test(m.text())) errs.push(m.text()); });
  await page.goto(URL);
  await page.waitForFunction(() => window.__game && document.getElementById('loading').hidden, null, { timeout: 60000 });

  // A fresh Audio wired to an offline context, so nothing depends on the live
  // game's mixer state or on anything having been clicked.
  await page.evaluate(() => {
    window.__render = async (name, pos, opts, listener) => {
      const SR = 44100, LEN = 1.2;
      const off = new OfflineAudioContext(2, Math.floor(SR * LEN), SR);
      const a = new window.GameAudio();
      a.ctx = off;
      a.master = off.createGain();
      a.master.gain.value = 1;
      a.master.connect(off.destination);
      if (listener) a.setListener(listener.pos, listener.yaw);
      a.play(name, pos, opts);
      const buf = await off.startRendering();
      const L = buf.getChannelData(0), R = buf.getChannelData(1);
      let peak = 0, sum = 0, peakL = 0, peakR = 0, last = 0;
      for (let i = 0; i < L.length; i++) {
        const l = Math.abs(L[i]), r = Math.abs(R[i]);
        peakL = Math.max(peakL, l); peakR = Math.max(peakR, r);
        const m = Math.max(l, r);
        if (m > peak) peak = m;
        if (m > 0.004) last = i;
        sum += (L[i] * L[i] + R[i] * R[i]) / 2;
      }
      // Brightness as the share of energy in the high band, via a first-difference
      // high-pass. Zero crossings were tried first and are useless here: they
      // track the loudest partial, which on a shotgun is a 110 Hz thump, so a
      // muffled distant shot and a crisp near one read the same.
      let hi = 0, lo = 0;
      for (let i = 1; i <= last; i++) { const d = L[i] - L[i - 1]; hi += d * d; lo += L[i] * L[i]; }
      return {
        peak, rms: Math.sqrt(sum / L.length), seconds: last / SR,
        peakL, peakR, bright: lo > 0 ? hi / lo : 0,
      };
    };
  });
  const render = (name, pos, opts, listener) => page.evaluate(
    ({ name, pos, opts, listener }) => window.__render(name, pos, opts, listener), { name, pos, opts, listener });

  // ---- every sound the game can ask for must actually make one ---------------
  const NAMES = await page.evaluate(() => {
    // pull the case labels straight out of the synth, so a sound added to the
    // game without a case here still gets checked
    const src = window.GameAudio.prototype.play.toString();
    return [...src.matchAll(/case '([a-z0-9]+)'/g)].map((m) => m[1]);
  });
  const silent = [], quiet = [];
  const measured = {};
  for (const n of NAMES) {
    const r = await render(n, null, null, null);
    measured[n] = r;
    if (r.peak < 0.001) silent.push(n);
    else if (r.peak < 0.02) quiet.push(`${n} (${r.peak.toFixed(3)})`);
  }
  console.log(`rendered ${NAMES.length} sounds; loudest ${Object.entries(measured).sort((a, b) => b[1].peak - a[1].peak)[0][0]}`);
  silent.length === 0
    ? pass(`every sound the game can play makes a noise (${NAMES.length} of them)`)
    : fail(`these render silent: ${silent.join(', ')}`);
  quiet.length === 0
    ? pass('and none of them is inaudibly quiet')
    : fail(`these are barely audible: ${quiet.join(', ')}`);

  // Nothing should clip the mix on its own. The ceiling is 0.95 rather than 1.0
  // because these are noise-based: the peak moves a few percent between renders,
  // and a level sitting exactly on full scale would clip on half of them.
  const loud = Object.entries(measured).filter(([, r]) => r.peak > 0.95).map(([n, r]) => `${n} ${r.peak.toFixed(2)}`);
  loud.length === 0
    ? pass('nothing clips on its own')
    : fail(`these clip before the mixer even sees them: ${loud.join(', ')}`);

  // Weapons should be short: a fire sound longer than its refire time smears.
  const longFire = ['shotgun', 'supershotgun', 'ac', 'autorifle', 'nail']
    .filter((n) => measured[n] && measured[n].seconds > 0.55)
    .map((n) => `${n} ${measured[n].seconds.toFixed(2)}s`);
  longFire.length === 0
    ? pass('fire sounds are short enough not to smear into the next shot')
    : fail(`these ring on too long: ${longFire.join(', ')}`);

  // ---- hit confirmation rides the damage ------------------------------------
  const soft = await render('hit', null, { pitch: 1.35 - (8 / 90) * 0.55 }, null);
  const hard = await render('hit', null, { pitch: 1.35 - 0.55 }, null);
  console.log(`hit confirm brightness: light hit ${soft.bright.toFixed(3)}, heavy hit ${hard.bright.toFixed(3)}`);
  soft.bright > hard.bright * 1.15
    ? pass('a light hit rings brighter than a heavy one')
    : fail(`hit confirmation sounds the same however hard you hit (${soft.bright.toFixed(3)} vs ${hard.bright.toFixed(3)})`);

  // ...and that the GAME actually asks for that pitch. The render above only
  // proves the synth obeys a pitch it is handed; breaking the call site left it
  // passing, which is the kind of gap a bench is supposed to close.
  const asked = await page.evaluate(() => {
    const g = window.__game, h = window.__human;
    const got = [];
    const real = g.effects.sound;
    g.effects.sound = (n, p, o) => { if (n === 'hit') got.push(o && o.pitch); };
    const victim = g.players.find((x) => x !== h);
    victim.alive = true; victim.hp = 9000; victim.armor = 0; victim.team = 1 - h.team;
    // A revived player needs a working loadout: without one, updateWeapon throws
    // on every later frame and takes the rest of the bench down with it.
    victim.weapons = window.CLASSES[victim.cls].weapons.slice(); victim.wi = 0; victim.cooldown = 0;
    victim.ammo = { shells: 99, nails: 99, rockets: 99, cells: 99 };
    g.damage(victim, 6, h, 'hitscan', [0, 0, -1], 0);
    g.damage(victim, 95, h, 'hitscan', [0, 0, -1], 0);
    g.effects.sound = real;
    return got;
  });
  console.log(`pitch the game asks for: light ${asked[0]}, heavy ${asked[1]}`);
  asked.length === 2 && asked[0] > asked[1] * 1.15
    ? pass('and the game asks for a different pitch depending on the damage')
    : fail(`the game does not vary hit pitch with damage (asked for ${JSON.stringify(asked)})`);

  // ---- placement ------------------------------------------------------------
  // Standing at the origin facing -z, which is the game's forward.
  const ear = { pos: [0, 0, 0], yaw: 0 };
  const left = await render('shotgun', [-8, 0, -2], null, ear);
  const right = await render('shotgun', [8, 0, -2], null, ear);
  const ahead = await render('shotgun', [0, 0, -8], null, ear);
  const balance = (r) => (r.peakR - r.peakL) / (r.peakR + r.peakL || 1);
  console.log(`stereo: shot on the left ${balance(left).toFixed(2)}, ahead ${balance(ahead).toFixed(2)}, right ${balance(right).toFixed(2)}`);
  balance(left) < -0.2 && balance(right) > 0.2
    ? pass('a shot to your left comes out of the left ear, and vice versa')
    : fail(`sounds are not placed in the stereo field (left ${balance(left).toFixed(2)}, right ${balance(right).toFixed(2)})`);
  Math.abs(balance(ahead)) < 0.15
    ? pass('and one straight ahead sits centred')
    : fail(`a sound straight ahead is off-centre (${balance(ahead).toFixed(2)})`);

  // The sniper rifle, not the shotgun: the shotgun's own synth already low-passes
  // its noise to 3.5 kHz, so there is barely any treble left for distance to take
  // away and the measurement read as "no change" however hard the filter bit.
  const near = await render('sniper', [0, 0, -4], null, ear);
  const far = await render('sniper', [0, 0, -40], null, ear);
  console.log(`distance: 4 m peak ${near.peak.toFixed(3)}, 40 m peak ${far.peak.toFixed(3)}`);
  far.peak < near.peak * 0.5
    ? pass(`distance makes things quieter (${(far.peak / near.peak * 100).toFixed(0)}% at ten times the range)`)
    : fail(`distance barely changes the level (${near.peak.toFixed(3)} vs ${far.peak.toFixed(3)})`);
  console.log(`brightness: ${near.bright.toFixed(3)} up close, ${far.bright.toFixed(3)} far off`);
  far.bright < near.bright * 0.75
    ? pass('and duller, so range is audible')
    : fail(`a distant shot is as bright as a near one (${near.bright.toFixed(3)} vs ${far.bright.toFixed(3)}) — you cannot judge range by ear`);

  // ---- footsteps ------------------------------------------------------------
  // The sim has to EMIT them, which is a different question from whether the
  // synth can make the noise.
  await page.evaluate(() => { window.__menuSelect('1'); window.__menuSelect('1'); window.__menuSelect('3'); window.__closeMenu(); });
  await page.waitForTimeout(400);
  const steps = await page.evaluate(() => {
    const g = window.__game, h = window.__human;
    const seen = [];
    const real = g.effects.sound;
    window.__brains.forEach((br) => { br.update = () => {}; });
    // Keep the bots down. Left to respawn they come back alive, and an earlier
    // version of this counted THEIR footsteps — which is why it reported 11 in
    // one run and 1 in the next with no code change in between.
    g.players.filter((x) => x.isBot).forEach((x) => { x.alive = false; x.pos = [0, -60, 0]; x.respawnAt = 1e9; x.wantsRespawn = false; });
    h.alive = true; h.hp = 1e6; h.armor = 1e6;
    h.pos = [0, 0.5, -36]; h.vel = [0, 0, 0];
    // Let him fall and settle first: onGround comes from the collision pass, so
    // a player whose vertical velocity is overwritten every frame never lands
    // and never takes a step.
    for (let i = 0; i < 40; i++) g.update(1 / 60);
    const count = (moving, frames) => {
      seen.length = 0;
      g.effects.sound = (n) => { seen.push(n); };
      for (let i = 0; i < frames; i++) {
        // Run on the spot: only the horizontal parts are driven, so gravity and
        // the ground contact are left to the sim.
        h.pos[0] = 0; h.pos[2] = -36;
        h.vel[0] = 0; h.vel[2] = moving ? -h.def.speed : 0;
        g.update(1 / 60);
      }
      g.effects.sound = real;
      return { steps: seen.filter((n) => n === 'step' || n === 'stepwater').length, onGround: h.onGround };
    };
    const walking = count(true, 120);
    const standing = count(false, 120);
    return { walking: walking.steps, standing: standing.steps, onGround: walking.onGround };
  });
  console.log(`footsteps in two seconds: running ${steps.walking}, standing still ${steps.standing} (grounded: ${steps.onGround})`);
  steps.walking >= 3
    ? pass(`you can hear someone running (${steps.walking} steps in two seconds)`)
    : fail(`running makes ${steps.walking} footsteps in two seconds — an enemy can walk up behind you in silence`);
  steps.standing === 0
    ? pass('and standing still is silent')
    : fail(`standing still still makes ${steps.standing} footsteps`);

  await browser.close();
  if (errs.length) { console.log('CONSOLE ERRORS:\n  ' + errs.join('\n  ')); failures++; }
  console.log(failures ? `\n${failures} FAILURE(S)` : '\naudio test OK');
  clearTimeout(DEADLINE);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FAIL audio bench threw: ' + e.message); process.exit(1); });
