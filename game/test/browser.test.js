// Loads the game in headless Chromium (SwiftShader WebGL), joins a team, plays a
// few seconds with bots, and screenshots. Fails on any console error.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  // Firebase's CDN scripts are optional (js/net.js checks for their absence and
  // disables online play cleanly) and this sandbox cannot reach google.com or
  // gstatic.com at all, so a failed *resource load* for them is expected here
  // and would be expected too for a real player behind a restrictive firewall
  // or an ad-blocker. That is a network-level event Chrome reports through the
  // same console channel as a real bug, not a script that ran and threw — so
  // it is filtered here rather than papered over by weakening net.js itself.
  const EXPECTED_NETWORK_FAILURE = /net::ERR_|Failed to load resource/;
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') { if (EXPECTED_NETWORK_FAILURE.test(m.text())) return; const t = m.type() + ': ' + m.text(); if (!errors.includes(t)) errors.push(t); } });
  page.on('pageerror', (e) => { const m = 'pageerror: ' + e.message + ' @ ' + String(e.stack).split('\n').slice(1, 3).join(' / '); if (!errors.includes(m)) errors.push(m); });
  const url = process.argv[2] || process.env.GAME_URL || 'file://' + path.resolve(__dirname, '../index.html');
  await page.goto(url);
  await page.evaluate(() => { window.__traceMenu = 1; });
  page.on('console', (m) => { if (/openMenu/.test(m.text())) console.log('  ' + m.text()); });
  await page.waitForFunction(() => window.__game && document.getElementById('loading').hidden, null, { timeout: 30000 });
  const httpServed = /^https?:/.test(url);
  if (httpServed) {
    await page.waitForFunction(() => window.__modelsReady && window.__modelsReady(), null, { timeout: 40000 });
    let screenFails = 0;
    const pass2 = (t) => console.log('PASS ' + t);
    const fail2 = (t) => { console.log('FAIL ' + t); screenFails++; };
    const m = await page.evaluate(() => {
      const M = window.__models;
      const names = Object.keys(M.models);
      // every group of every model must resolve to a texture that actually loaded
      const unresolved = [];
      for (const [name, mod] of Object.entries(M.models)) for (const g of mod.groups) {
        if (!M.textures[g.texFile]) unresolved.push(name + '/' + g.material + ' base');
        if (g.emisFile && !M.textures[g.emisFile]) unresolved.push(name + '/' + g.material + ' emissive');
      }
      // static props share the skinned path with a single bone, and every
      // placement has to name a prop that actually loaded
      const props = Object.keys(M.manifest.props || {});
      const badProps = props.filter((n) => !M.models[n] || M.models[n].boneCount !== 1);
      const badPlacements = (M.manifest.placements || []).filter((pl) => !M.prop(pl.prop)).map((pl) => pl.prop);
      return { names, textures: Object.keys(M.textures).length, unresolved,
        props, badProps, badPlacements,
        placements: (M.manifest.placements || []).length,
        glow: names.filter((n) => M.models[n].glow) };
    });
    console.log('character models:', m.names.length, '| textures:', m.textures, '| team suits:', m.glow.join(','));
    const wantClasses = ['scout', 'sniper', 'soldier', 'demoman', 'medic', 'heavy', 'pyro', 'spy', 'engineer'];
    const missing = [...wantClasses, 'tron_blue', 'tron_red'].filter((n) => !m.names.includes(n));
    if (missing.length) { console.log('FAIL: missing models ' + missing.join(', ')); process.exit(1); }
    if (m.unresolved.length) { console.log('FAIL: groups with no texture: ' + m.unresolved.join(', ')); process.exit(1); }
    if (m.glow.length !== 2) { console.log('FAIL: expected two glowing team suits, got ' + m.glow.length); process.exit(1); }
    console.log('props:', m.props.length ? m.props.join(', ') : '(none)', '| placed:', m.placements);

    // ---- the generated demoman -------------------------------------------
    // He is built by tools/make-demoman.js rather than imported, so the things
    // worth checking are that he is his OWN model and that he is actually
    // skinned across the rig — a generation bug would most likely weld every
    // vertex to one bone, which renders fine standing still and not at all once
    // he moves.
    const demo = await page.evaluate(async () => {
      const mf = window.__models.manifest;
      const set = mf.sets.mercs.models;
      const env = await fetch('assets/models/demoman.json').then((r) => r.json());
      const bin = atob(env.data);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const dv = new DataView(u8.buffer);
      const bones = dv.getUint16(6, true);
      const verts = dv.getUint32(8, true);
      const used = new Set();
      const vbase = 64 + bones * 132;
      for (let i = 0; i < verts; i++) {
        const o = vbase + i * 24;
        for (let k = 0; k < 4; k++) if (dv.getUint8(o + 18 + k) > 0) used.add(dv.getUint8(o + 14 + k));
      }
      return { mapped: set.demoman, soldier: set.soldier, bones, verts, boundTo: used.size,
        loaded: !!window.__models.get('demoman') };
    });
    console.log(`demoman: ${demo.verts} verts over ${demo.boundTo} of ${demo.bones} bones, set maps to "${demo.mapped}"`);
    demo.loaded && demo.mapped === 'demoman'
      ? pass2('the demoman has his own model')
      : fail2(`the demoman is still mapped to "${demo.mapped}" (soldier is "${demo.soldier}")`);
    demo.mapped !== demo.soldier
      ? pass2('and is no longer wearing the soldier\'s body')
      : fail2('the demoman and soldier still share one model');
    demo.boundTo >= 15
      ? pass2(`and is skinned across the rig (${demo.boundTo} of ${demo.bones} bones carry weight)`)
      : fail2(`the demoman is bound to only ${demo.boundTo} of ${demo.bones} bones — he will not deform when he moves`);

    // ---- the spawn-room screen -------------------------------------------
    // It exists to carry artwork someone drops in, so the thing worth checking
    // is that supplied media actually reaches the panel — not that a placeholder
    // renders. A solid magenta image is fed in through ?screen= and the frame is
    // read back to see whether the wall went magenta.
    const MAGENTA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGP4z/AfK2IYWhIA0ad/gXfwoGMAAAAASUVORK5CYII=';
    const screenInfo = await page.evaluate(() => ({
      onMap: (window.__game.data.screens || []).length,
      pos: (window.__game.data.screens || []).map((s) => s.pos),
    }));
    console.log('screens on the map:', screenInfo.onMap);
    screenInfo.onMap >= 2
      ? pass2('a screen is mounted in each spawn room')
      : fail2(`expected a screen in both spawn rooms, found ${screenInfo.onMap}`);

    const shot = await (async () => {
      const p2 = await browser.newPage({ viewport: { width: 320, height: 200 } });
      await p2.goto(url.replace(/\?.*$/, '') + '?readback&screen=' + encodeURIComponent(MAGENTA));
      await p2.waitForFunction(() => window.__game && document.getElementById('loading').hidden, null, { timeout: 60000 });
      await p2.evaluate(() => { window.__menuSelect('1'); window.__menuSelect('1'); window.__menuSelect('3'); window.__closeMenu(); });
      await p2.waitForTimeout(600);
      await p2.evaluate(() => {
        const g = window.__game, h = window.__human;
        g.roundLength = 1e9; window.__brains.forEach((br) => { br.update = () => {}; });
        g.players.filter((x) => x.isBot).forEach((x) => { x.alive = false; x.pos = [0, -60, 0]; });
        h.alive = true; h.hp = 1e6; h.pos = [-5.5, 0.05, -35.0]; h.vel = [0, 0, 0];
        h.yaw = Math.PI; h.pitch = 0.12;
        window.__hideViewmodel = true;
        document.querySelectorAll('.ov').forEach((e) => { e.style.display = 'none'; });
      });
      await p2.waitForTimeout(1500);
      const out = await p2.evaluate(() => {
        const c = document.querySelector('canvas');
        const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
        const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
        const buf = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        let magenta = 0;
        for (let i = 0; i < buf.length; i += 4) {
          if (buf[i] > 120 && buf[i + 2] > 120 && buf[i + 1] < buf[i] * 0.6) magenta++;
        }
        return { kind: window.__screens.kind, magenta, of: w * h };
      });
      await p2.close();
      return out;
    })();
    console.log(`screen media: kind=${shot.kind}, ${shot.magenta} magenta px of ${shot.of}`);
    shot.kind === 'image'
      ? pass2('supplied media is picked up (not the placeholder)')
      : fail2(`the screen fell back to "${shot.kind}" instead of showing the supplied image`);
    shot.magenta > shot.of * 0.01
      ? pass2(`and it is actually on the wall (${(shot.magenta / shot.of * 100).toFixed(1)}% of the frame)`)
      : fail2(`the supplied image never reached the panel (${shot.magenta} magenta pixels) — the screen shows nothing`);
    if (screenFails) { console.log(`${screenFails} screen failure(s)`); process.exit(1); }
    if (m.badProps.length) { console.log('FAIL: props that are not single-bone statics: ' + m.badProps.join(', ')); process.exit(1); }
    if (m.badPlacements.length) { console.log('FAIL: placements naming a prop that did not load: ' + m.badPlacements.join(', ')); process.exit(1); }
  } else {
    const fell = await page.evaluate(() => window.__models.failed === true);
    console.log('file:// fallback to blocky players:', fell ? 'ok' : 'UNEXPECTED');
    if (!fell) { console.log('FAIL: expected the file:// fallback'); process.exit(1); }
  }
  const out = path.resolve(__dirname, '../../../out');
  await page.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/menu.png' : '/tmp/menu.png' });
  // join blue, pick soldier
  await page.evaluate(() => { window.__menuSelect('1'); window.__menuSelect('1'); window.__menuSelect('3'); window.__closeMenu(); });
  await page.waitForTimeout(500);
  const info = await page.evaluate(() => ({ alive: window.__human.alive, cls: window.__human.cls, players: window.__game.players.length, pos: window.__human.pos }));
  console.log('joined:', JSON.stringify(info));
  await page.evaluate(() => { window.__showcase = true; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: (process.env.SHOT_DIR || '/tmp') + '/showcase.png' });
  await page.evaluate(() => { window.__showcase = false; });
  // walk forward + fire for a while
  await page.evaluate(() => { window.__closeMenu(); });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyW');
  await page.evaluate(() => { const h = window.__human; h.yaw = Math.PI; h.pitch = 0; });
  await page.waitForTimeout(2500);
  const shotDir = process.env.SHOT_DIR || '/tmp';
  await page.screenshot({ path: shotDir + '/spawn.png' });
  // teleport to the battlements for a scenic shot and fire a rocket
  await page.evaluate(() => { const h = window.__human; h.pos = [0, 6.05, -16]; h.yaw = Math.PI; h.pitch = -0.08; h.vel = [0, 0, 0]; });
  await page.waitForTimeout(300);
  await page.evaluate(() => { const g = window.__game, h = window.__human; g.fire(h, h.weapon()); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: shotDir + '/battlements.png' });
  await page.evaluate(() => { const h = window.__human; h.pos = [2, -4.95, -30]; h.yaw = Math.PI; h.pitch = -0.1; h.vel = [0, 0, 0]; });
  await page.waitForTimeout(600);
  await page.screenshot({ path: shotDir + '/flagroom.png' });
  await page.evaluate(() => { const h = window.__human; h.pos = [0, 0.05, 4]; h.yaw = Math.PI; h.pitch = 0.05; h.vel = [0, 0, 0]; });
  await page.waitForTimeout(600);
  await page.screenshot({ path: shotDir + '/bridge.png' });
  // ---- skin sets: switching must actually change which model a player draws with
  if (httpServed) {
    const skins = await page.evaluate(() => {
      const sets = window.__sets();
      const ids = Object.keys(sets);
      const p = window.__game.players.find((x) => x.isBot && x.team === 0) || window.__human;
      const seen = {};
      for (const id of ids) { window.__setSkin(id); const m = window.__modelFor(p); seen[id] = m ? m.name : null; }
      // a team-mode set must give the two teams different models
      const teamSets = {};
      for (const id of ids) {
        if (sets[id].mode !== 'team') continue;
        window.__setSkin(id);
        const blue = window.__game.players.find((x) => x.team === 0), red = window.__game.players.find((x) => x.team === 1);
        teamSets[id] = [blue && window.__modelFor(blue), red && window.__modelFor(red)].map((m) => (m ? m.name : null));
      }
      window.__setSkin(ids[0]);
      return { ids, seen, teamSets, labels: ids.map((i) => sets[i].label) };
    });
    console.log('skin sets:', skins.labels.join(' | '), '->', JSON.stringify(skins.seen));
    if (skins.ids.length < 2) { console.log('FAIL: expected at least two skin sets'); process.exit(1); }
    const names = Object.values(skins.seen);
    if (names.some((n) => !n)) { console.log('FAIL: a skin set resolved to no model'); process.exit(1); }
    if (new Set(names).size < 2) { console.log('FAIL: switching skin set did not change the model'); process.exit(1); }
    for (const [id, pair] of Object.entries(skins.teamSets)) {
      if (!pair[0] || !pair[1] || pair[0] === pair[1]) { console.log('FAIL: team set ' + id + ' gives both teams ' + pair[0]); process.exit(1); }
    }
    console.log('PASS skin sets switch models, team sets differ per side');
  }

  // exercise every class / weapon / grenade / ability
  const exercised = await page.evaluate(async () => {
    const g = window.__game, h = window.__human; const out = [];
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (const cls of window.CLASS_ORDER) {
      h.cls = cls; h.spawn(); h.pos = [0, 6.05, -16]; h.yaw = Math.PI; h.pitch = -0.05; h.vel = [0, 0, 0];
      for (let i = 0; i < h.weapons.length; i++) {
        h.wi = i; h.cooldown = 0; const w = h.weapon();
        if (w.type === 'charge') { h.charge = 1.5; g.fireSniper(h, w); } else g.fire(h, w);
        await sleep(60);
      }
      for (const slot of [0, 1]) if (h.def.gren[slot]) { g.primeGrenade(h, slot); h.grenPrime.t = 0.6; g.throwGrenade(h); await sleep(30); }
      if (cls === 'engineer') { h.pos = [0, 0.05, -18]; h.yaw = 0; h.onGround = true; if (!g.startBuild(h)) throw new Error('engineer could not build'); h.building = 0.01; await sleep(100); }
      if (cls === 'spy') { g.startDisguise(h); h.disguiseT = 0.01; await sleep(100); }
      if (cls === 'demoman') { h.wi = 3; h.cooldown = 0; g.fire(h, h.weapon()); await sleep(200); g.detonatePipes(h); }
      out.push(cls + ':' + h.weapons.join(','));
    }
    await sleep(2500);
    return { classes: out.length, sentries: g.sentries.length, projectiles: g.projectiles.length, particles: g.particles.length };
  });
  console.log('exercised:', JSON.stringify(exercised));
  await page.screenshot({ path: shotDir + '/chaos.png' });
  const stats = await page.evaluate(() => { const g = window.__game; return { time: g.time.toFixed(1), kills: g.players.reduce((a, p) => a + p.kills, 0), particles: g.particles.length, tris: window.__game && 0, alive: g.players.filter((p) => p.alive).length, fps: window.__fps }; });
  console.log('stats:', JSON.stringify(stats));
  // measure frame rate
  const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / 2); }; requestAnimationFrame(f); }));
  console.log('headless fps (software GL):', fps.toFixed(1));
  await browser.close();
  if (errors.length) { console.log('CONSOLE ERRORS:'); errors.forEach((e) => console.log('  ' + e)); process.exit(1); }
  console.log('browser test OK');
})().catch((e) => { console.error(e); process.exit(1); });
