// Loads the game in headless Chromium (SwiftShader WebGL), joins a team, plays a
// few seconds with bots, and screenshots. Fails on any console error.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') { const t = m.type() + ': ' + m.text(); if (!errors.includes(t)) errors.push(t); } });
  page.on('pageerror', (e) => { const m = 'pageerror: ' + e.message + ' @ ' + String(e.stack).split('\n').slice(1, 3).join(' / '); if (!errors.includes(m)) errors.push(m); });
  const url = process.argv[2] || process.env.GAME_URL || 'file://' + path.resolve(__dirname, '../index.html');
  await page.goto(url);
  await page.evaluate(() => { window.__traceMenu = 1; });
  page.on('console', (m) => { if (/openMenu/.test(m.text())) console.log('  ' + m.text()); });
  await page.waitForFunction(() => window.__game && document.getElementById('loading').hidden, null, { timeout: 30000 });
  const httpServed = /^https?:/.test(url);
  if (httpServed) {
    await page.waitForFunction(() => window.__modelsReady && window.__modelsReady(), null, { timeout: 40000 });
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
    const wantClasses = ['scout', 'sniper', 'soldier', 'medic', 'heavy', 'pyro', 'spy', 'engineer'];
    const missing = [...wantClasses, 'tron_blue', 'tron_red'].filter((n) => !m.names.includes(n));
    if (missing.length) { console.log('FAIL: missing models ' + missing.join(', ')); process.exit(1); }
    if (m.unresolved.length) { console.log('FAIL: groups with no texture: ' + m.unresolved.join(', ')); process.exit(1); }
    if (m.glow.length !== 2) { console.log('FAIL: expected two glowing team suits, got ' + m.glow.length); process.exit(1); }
    console.log('props:', m.props.length ? m.props.join(', ') : '(none)', '| placed:', m.placements);
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
