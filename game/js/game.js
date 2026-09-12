// Browser glue: input, HUD, menus, entity drawing, main loop.
(function () {
  'use strict';
  const { V, M, clamp, rand, angleDiff, drawWeapon, drawMuzzleFlash, drawSentry, drawToolbox, drawPipe, drawPipebomb, SENTRY_HEIGHT, ModelSet, Pose, animate, GRIP, BONE, Renderer, GameAudio, Game, BotBrain, botClassFor, DIFFICULTIES, WEAPONS, GRENADES, CLASSES, CLASS_ORDER, BOT_NAMES, BLUE, RED, TEAM_NAMES, TEAM_COLORS, PLAYER_H, EYE_H } = window;
  const $ = (id) => document.getElementById(id);

  const stored = JSON.parse(localStorage.getItem('tfc2fort.settings') || 'null');
  const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches && window.matchMedia('(hover: none)').matches);
  // A phone gets a smaller match, a lower render scale and some aim help on first run.
  const firstRunDefaults = coarse ? { teamSize: 4, resolution: 0.75, aimAssist: 0.6, particleBudget: 220 } : {};
  const settings = Object.assign({ teamSize: 5, fill: true, difficulty: 'medium', sens: 0.0022, touchSens: 0.0042, aimAssist: 0, resolution: 1.25, particleBudget: 900, skinSet: 'tron', fov: 80, volume: 0.5, announcer: true, name: 'Player' }, firstRunDefaults, stored || {});
  const saveSettings = () => localStorage.setItem('tfc2fort.settings', JSON.stringify(settings));
  const DIFF_ORDER = ['easy', 'medium', 'hard', 'difficult', 'godly'];
  if (!DIFFICULTIES[settings.difficulty]) settings.difficulty = 'medium';
  const botSkill = () => DIFFICULTIES[settings.difficulty];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  const canvas = $('c');
  let renderer;
  try { renderer = new Renderer(canvas); } catch (e) { $('nogl').hidden = false; $('nogl').textContent = 'WebGL failed: ' + e.message; throw e; }
  const audio = new GameAudio();
  const messages = []; // {text, time, kind}
  let flashAmt = 0, shakeAmt = 0;
  let hitTick = 0;              // crosshair confirm, 1 -> 0 after a hit
  const dmgNums = [];           // floating damage numbers {target, amount, born, last, pop, big, pos}
  const effects = {
    particle(o) { const n = o.count || 1; for (let i = 0; i < n; i++) { const q = Object.assign({ maxLife: o.life, gravity: 0 }, o); q.pos = V.copy(o.pos); q.vel = n > 1 ? [rand(-2, 2), rand(0, 3), rand(-2, 2)] : V.copy(o.vel); game.particles.push(q); } const cap = settings.particleBudget; if (game.particles.length > cap) game.particles.splice(0, game.particles.length - cap); },
    tracer(a, b, color, life) { game.tracers.push({ a, b, color, life, maxLife: life }); },
    sound(name, pos, opts) { audio.play(name, pos, opts); },
    say(text) { audio.say(text); },
    message(text, team, kind, who) { if (!text) return; if (who && who !== human && kind !== 'flag' && kind !== 'cap' && kind !== 'round') return; messages.push({ text, time: game.time, kind, team }); if (messages.length > 5) messages.shift(); },
    flash(a) { flashAmt = Math.min(1, flashAmt + a); },
    shake(a) { shakeAmt = Math.min(1, shakeAmt + a); },
    // Hit confirmation. Consecutive hits on the same target inside a short window
    // add up into one growing number rather than stacking separate ones — a
    // shotgun blast is one hit to the player, not nine.
    damageNumber(target, amount, kind) {
      hitTick = 1;
      const now = performance.now() / 1000;
      const live = dmgNums.find((d) => d.target === target && now - d.last < 0.45);
      if (live) { live.amount += amount; live.last = now; live.pop = 1; if (kind === 'headshot' || kind === 'backstab') live.big = true; return; }
      dmgNums.push({ target, amount, born: now, last: now, pop: 1, big: kind === 'headshot' || kind === 'backstab',
        pos: V.add(target.center(), [rand(-0.25, 0.25), rand(-0.1, 0.2), rand(-0.25, 0.25)]) });
      if (dmgNums.length > 12) dmgNums.shift();
    },
    // How many optional puffs an effect may spend. Each particle is its own draw
    // call, so on the Low setting (phones) effects use half the cluster.
    detail() { return settings.particleBudget <= 300 ? 0.5 : 1; },
  };
  const game = new Game({ effects });
  renderer.setWorld(game.world, { lights: game.data.lights.map((p) => ({ pos: p, radius: 13 })), sun: renderer.lightDir });
  const human = game.addPlayer(settings.name || 'Player', BLUE, false);
  human.cls = 'soldier'; game.human = human; human.wantsRespawn = false;
  const brains = new Map();
  const touch = new TouchControls(canvas);

  // ---- character models (async; the blocky players stay as the fallback)
  const models = new ModelSet(renderer.gl);
  const poses = new Map();
  let modelsReady = false;
  const CLASS_MODEL = { scout: 'scout', sniper: 'sniper', soldier: 'soldier', demoman: 'soldier', medic: 'medic', hwguy: 'heavy', pyro: 'pyro', spy: 'spy', engineer: 'engineer' };
  // One suit per team means every class shares a mesh, so keep the height differences
  // the mercenaries had; a Heavy still reads as bigger than a Scout.
  const CLASS_SCALE = { scout: 0.98, sniper: 1.04, soldier: 1.02, demoman: 1.02, medic: 1.01, hwguy: 1.06, pyro: 0.96, spy: 1.0, engineer: 0.92 };
  const TEAM_GLOW = [[0.40, 1.30, 2.40], [2.40, 0.55, 0.18]];   // blue: cyan, red: orange
  // In the class set the Demoman borrows the Soldier's model, so give him a
  // shorter, stockier stance rather than an identical twin.
  // Applied only to a class borrowing another class's model (see sharesModel).
  const SHARED_SCALE = { demoman: 0.95 };
  const GRIP_FOR = { ac: 'heavy', flamer: 'heavy', rpg: 'launcher', ic: 'launcher', gl: 'launcher', pl: 'launcher', tranq: 'pistol', railgun: 'pistol' };
  if (renderer.skinProg) models.load('assets/models/').then((ok) => { modelsReady = ok; if (ok && menu) renderMenu(); });
  function poseFor(p, model) {
    let e = poses.get(p);
    if (!e || e.model !== model) { e = { model, pose: new Pose(model) }; poses.set(p, e); }
    return e.pose;
  }
  function teamOf(p) { return p.disguise >= 0 ? p.disguise : p.team; }
  // Skin sets come from the asset manifest, so a new one only needs extracting and
  // registering - no code change here.
  function allSets() { return (models.manifest && models.manifest.sets) || {}; }
  function setIds() { return Object.keys(allSets()); }
  function activeSet() { const s = allSets(); return s[settings.skinSet] || s[setIds()[0]] || null; }
  function setBlurb(set) { return set.mode === 'team' ? 'One suit per team. Every class on a side looks the same.' : 'A different model for each of the nine classes.'; }
  function modelFor(p) {
    if (!modelsReady) return null;
    const set = activeSet(); if (!set) return null;
    const cls = p.disguise >= 0 && p.disguiseCls ? p.disguiseCls : p.cls;
    const key = set.mode === 'team' ? (teamOf(p) === BLUE ? 'blue' : 'red') : cls;
    return models.get(set.models[key] || set.models[cls] || set.models.blue) || null;
  }
  function pickSkinSet(id) {
    if (!allSets()[id]) return;
    settings.skinSet = id; saveSettings(); poses.clear();
  }

  // --------------------------------------------------------------- bots
  function syncBots() {
    for (const team of [BLUE, RED]) {
      const humans = game.players.filter((p) => !p.isBot && p.team === team).length;
      const want = settings.fill ? Math.max(0, settings.teamSize - humans) : 0;
      let bots = game.players.filter((p) => p.isBot && p.team === team);
      while (bots.length > want) { const b = bots.pop(); game.removePlayer(b); brains.delete(b); }
      let idx = bots.length;
      while (bots.length < want) {
        const used = new Set(game.players.map((p) => p.name));
        let name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]; let k = 0; while (used.has(name)) name = BOT_NAMES[(k++) % BOT_NAMES.length] + (k > BOT_NAMES.length ? k : '');
        const b = game.addPlayer(name, team, true); b.cls = botClassFor(idx + (team === RED ? 3 : 0)); b.wantsRespawn = true; b.respawnAt = game.time + Math.random() * 2;
        brains.set(b, new BotBrain(game, b, botSkill())); bots.push(b); idx++;
      }
    }
    for (const [, br] of brains) br.skill = botSkill();
  }

  // --------------------------------------------------------------- input
  const keys = {}; let mouseDown = [false, false, false]; let locked = false; let zoomed = false;
  // Pointer lock can be refused (iframes, some embeds). Fall back to relative mouse motion plus edge-turning.
  let fallbackLook = false; const edgeTurn = [0, 0];
  function requestLock() {
    try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => enableFallback()); } catch (e) { enableFallback(); }
    setTimeout(() => { if (!locked && !menu && !fallbackLook && !touch.enabled) enableFallback(); }, 700);
  }
  function enableFallback() {
    if (fallbackLook) return; fallbackLook = true; canvas.style.cursor = 'none';
    effects.message('Mouse capture unavailable here: move the mouse to the screen edges to keep turning', human.team, 'info', human);
  }
  document.addEventListener('pointerlockerror', () => enableFallback());
  let menu = 'main'; // 'main' | 'class' | 'team' | 'settings' | 'help' | null | 'end'
  let showScores = false;
  const lastWeapon = { i: 0 };
  canvas.addEventListener('click', () => { if (!menu && !locked && !touch.enabled) requestLock(); });
  document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; if (locked) { fallbackLook = false; canvas.style.cursor = 'crosshair'; } if (!locked && !menu && !fallbackLook) openMenu('main'); });
  document.addEventListener('mousemove', (e) => {
    if (menu || (!locked && !fallbackLook)) return;
    const s = settings.sens * (zoomed ? 0.35 : 1);
    human.yaw -= e.movementX * s; human.pitch = clamp(human.pitch - e.movementY * s, -1.5, 1.5);
    if (fallbackLook) {
      const rx = e.clientX / window.innerWidth, ry = e.clientY / window.innerHeight, m = 0.12;
      edgeTurn[0] = rx < m ? -(m - rx) / m : rx > 1 - m ? (rx - (1 - m)) / m : 0;
      edgeTurn[1] = ry < m ? -(m - ry) / m : ry > 1 - m ? (ry - (1 - m)) / m : 0;
    }
  });
  document.addEventListener('mousedown', (e) => {
    if (menu) return;
    mouseDown[e.button] = true;
    if (e.button === 2 && human.alive) {
      const w = human.weapon();
      if (w.zoom) { zoomed = !zoomed; audio.play('zoom'); }
    }
    audio.init(); audio.resume();
  });
  document.addEventListener('mouseup', (e) => { mouseDown[e.button] = false; });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('wheel', (e) => { if (menu || !human.alive) return; switchWeapon(human.wi + (e.deltaY > 0 ? 1 : -1)); }, { passive: true });
  function switchWeapon(i) { const n = human.weapons.length; i = ((i % n) + n) % n; if (i !== human.wi) { lastWeapon.i = human.wi; human.wi = i; human.charge = -1; zoomed = false; human.spinup = 0; } }
  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const k = e.code;
    audio.init(); audio.resume();
    if (menu) { menuKey(e); return; }
    keys[k] = true;
    if (k === 'Escape') { openMenu('main'); return; }
    if (k === 'Tab') { showScores = true; e.preventDefault(); return; }
    if (k === 'KeyM') { openMenu('class'); return; }
    if (k === 'KeyN') { openMenu('team'); return; }
    if (k === 'F1') { openMenu('help'); e.preventDefault(); return; }
    if (k === 'F2') { openMenu('howto'); e.preventDefault(); return; }
    if (!human.alive) { if (k === 'Space' || k === 'Enter') { if (game.roundOver) restart(); } return; }
    if (k.startsWith('Digit')) { const d = parseInt(k.slice(5), 10); if (d >= 1 && d <= human.weapons.length) switchWeapon(d - 1); }
    if (k === 'KeyQ') { if (human.cls === 'spy') game.startDisguise(human); else switchWeapon(lastWeapon.i); }
    if (k === 'KeyG') game.primeGrenade(human, 0);
    if (k === 'KeyF') game.primeGrenade(human, 1);
    if (k === 'KeyE') { if (human.cls === 'engineer') game.startBuild(human); }
    if (k === 'KeyR' && human.cls === 'demoman') { game.detonatePipes(human); }
    if (k === 'Enter' && game.roundOver) restart();
  });
  document.addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'Tab') showScores = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseDown = [false, false, false]; });

  function humanInput() {
    const inp = human.input;
    let f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    if (touch.enabled && !menu) {
      const l = touch.read();
      const ts = settings.touchSens * (zoomed ? 0.4 : 1);
      human.yaw -= l[0] * ts;
      human.pitch = clamp(human.pitch - l[1] * ts, -1.5, 1.5);
      f += touch.move[1]; s += touch.move[0];
      const m = Math.hypot(f, s); if (m > 1) { f /= m; s /= m; }
    }
    const fwd = V.forward(human.yaw, 0), right = V.right(human.yaw);
    let d = V.madd(V.scale(fwd, f), right, s);
    const l = Math.hypot(d[0], d[2]); if (l > 1) d = V.scale(d, 1 / l);
    if (human.inWater && f !== 0) d[1] = Math.sin(human.pitch) * f;
    inp.dir = d;
    const t = touch.enabled && !menu ? touch.btn : null;
    inp.jump = !!keys.Space || !!(t && t.jump);
    inp.up = (keys.ControlLeft || keys.ShiftLeft || (t && t.down)) ? -1 : 0;
    inp.fire = (mouseDown[0] && (locked || fallbackLook)) || !!(t && t.fire);
    inp.alt = (mouseDown[2] && (locked || fallbackLook)) || !!(t && t.alt);
    if (fallbackLook && !menu) { human.yaw -= edgeTurn[0] * 2.2 * DT; human.pitch = clamp(human.pitch - edgeTurn[1] * 1.2 * DT, -1.5, 1.5); }
    inp.gren = [!!keys.KeyG || !!(t && t.gren), !!keys.KeyF || !!(t && t.gren2)];
    if (!human.alive && game.time >= human.respawnAt && !menu) human.wantsRespawn = true;
  }

  // --------------------------------------------------------------- touch
  function actionFor(p) {
    if (!p.alive) return 'RESPAWN';
    if (p.cls === 'engineer') return 'BUILD';
    if (p.cls === 'demoman') return 'BOOM';
    if (p.cls === 'spy') return 'DISGUISE';
    if (p.weapon().zoom) return zoomed ? 'UNZOOM' : 'ZOOM';
    return 'SWAP';
  }
  function doAction() {
    const p = human;
    const a = actionFor(p);
    if (a === 'RESPAWN') { p.wantsRespawn = true; return; }
    if (a === 'BUILD') game.startBuild(p);
    else if (a === 'BOOM') game.detonatePipes(p);
    else if (a === 'DISGUISE') game.startDisguise(p);
    else if (a === 'ZOOM' || a === 'UNZOOM') { zoomed = !zoomed; audio.play('zoom'); }
    else switchWeapon(lastWeapon.i);
  }
  function goFullscreen() {
    const el = document.documentElement;
    try { if (!document.fullscreenElement && el.requestFullscreen) { const r = el.requestFullscreen(); if (r && r.catch) r.catch(() => {}); } } catch (e) { /* not allowed here */ }
    try { if (screen.orientation && screen.orientation.lock) { const r = screen.orientation.lock('landscape'); if (r && r.catch) r.catch(() => {}); } } catch (e) { /* unsupported */ }
  }
  function checkOrientation() {
    const el = $('rotate');
    if (el) el.hidden = !(touch.enabled && window.innerHeight > window.innerWidth);
  }
  function enableTouch() {
    if (touch.enabled) return;
    touch.enable();
    touch.on('weapon', (i) => { if (human.alive && i < human.weapons.length) switchWeapon(i); });
    touch.on('menu', () => { if (menu) closeMenu(); else openMenu('main'); });
    touch.on('scores', (v) => { showScores = v; });
    touch.on('action', () => { if (!menu) doAction(); });
    touch.on('firsttouch', () => { audio.init(); audio.resume(); goFullscreen(); });
    checkOrientation();
  }
  if (coarse) enableTouch();
  window.addEventListener('touchstart', enableTouch, { passive: true });
  window.addEventListener('resize', checkOrientation);
  window.addEventListener('orientationchange', () => setTimeout(checkOrientation, 350));

  // --------------------------------------------------------------- menus
  const menuEl = $('menu');
  function openMenu(which) {
    if (window.__traceMenu) console.log('openMenu ' + which + ' ' + new Error().stack.split('\n').slice(1, 4).join(' / '));
    menu = which; menuEl.hidden = false; document.body.classList.add('inmenu'); canvas.style.cursor = 'crosshair'; edgeTurn[0] = edgeTurn[1] = 0; if (document.pointerLockElement) document.exitPointerLock();
    for (const k in keys) keys[k] = false; mouseDown = [false, false, false]; showScores = false;
    renderMenu();
  }
  function closeMenu() { menu = null; menuEl.hidden = true; document.body.classList.remove('inmenu'); if (touch.enabled) { goFullscreen(); return; } if (fallbackLook) canvas.style.cursor = 'none'; requestLock(); }
  function renderMenu() {
    let html = '';
    const title = '<div class="title">TEAM FORTRESS <span>2FORT</span></div><div class="sub">A browser tribute to Team Fortress Classic</div>';
    if (menu === 'main') {
      html = title + `<div class="list">
        <button data-k="1"><b>1</b> ${human.alive || human.spawnT !== undefined ? 'Resume' : 'Join game'}</button>
        <button data-k="2"><b>2</b> Change class</button>
        <button data-k="3"><b>3</b> Change team</button>
        <button data-k="4"><b>4</b> Skins: <span class="skin">${activeSet() ? activeSet().label : 'loading…'}</span></button>
        <button data-k="5"><b>5</b> Settings &amp; bots</button>
        <button data-k="6"><b>6</b> Controls</button>
        <button data-k="7"><b>7</b> How to play</button>
        <button data-k="8"><b>8</b> Restart round</button>
        <button data-k="9"><b>9</b> Bot difficulty: <span class="diff ${settings.difficulty}">${cap(settings.difficulty)}</span></button>
        <button data-k="0"><b>0</b> Credits</button>
      </div><div class="hint">${renderer.skinProg && !modelsReady ? 'Loading characters…<br>' : ''}Click the game and move the mouse to look. Score: <span class="blue">Blue ${game.score[0]}</span> — <span class="red">Red ${game.score[1]}</span></div>`;
    } else if (menu === 'team') {
      html = title + `<div class="list"><div class="h">Choose a team</div>
        <button data-k="1" class="blue"><b>1</b> Blue</button>
        <button data-k="2" class="red"><b>2</b> Red</button>
        <button data-k="3"><b>3</b> Auto-assign</button>
        <button data-k="0"><b>0</b> Back</button></div>`;
    } else if (menu === 'class') {
      html = title + '<div class="list classes"><div class="h">Choose a class</div>';
      CLASS_ORDER.forEach((c, i) => { const d = CLASSES[c]; html += `<button data-k="${i + 1}"><b>${i + 1}</b> <span class="cn">${d.name}</span><span class="cd">${d.desc}</span></button>`; });
      html += '<button data-k="0"><b>0</b> Back</button></div>';
    } else if (menu === 'settings') {
      html = title + `<div class="list settings"><div class="h">Settings</div>
        <label>Your name <input id="s_name" value="${escapeHtml(settings.name)}" maxlength="16"></label>
        <label>Fill teams with bots <input id="s_fill" type="checkbox"${settings.fill ? ' checked' : ''}></label>
        <label>Players per team <input id="s_size" type="range" min="1" max="12" value="${settings.teamSize}"> <span id="s_size_v">${settings.teamSize}</span></label>
        <label>Bot difficulty <select id="s_skill">${DIFF_ORDER.map((d) => `<option value="${d}"${settings.difficulty === d ? ' selected' : ''}>${cap(d)}</option>`).join('')}</select></label>
        <label>Mouse sensitivity <input id="s_sens" type="range" min="0.0005" max="0.006" step="0.0001" value="${settings.sens}"></label>
        ${touch.enabled ? `<label>Touch look speed <input id="s_tsens" type="range" min="0.0015" max="0.009" step="0.0001" value="${settings.touchSens}"></label>
        <label>Aim assist <select id="s_assist"><option value="0"${settings.aimAssist === 0 ? ' selected' : ''}>Off</option><option value="0.6"${settings.aimAssist === 0.6 ? ' selected' : ''}>Light</option><option value="1.2"${settings.aimAssist === 1.2 ? ' selected' : ''}>Strong</option></select></label>` : ''}
        <label>Effects <select id="s_fx"><option value="220"${settings.particleBudget === 220 ? ' selected' : ''}>Low</option><option value="900"${settings.particleBudget === 900 ? ' selected' : ''}>Normal</option><option value="1600"${settings.particleBudget === 1600 ? ' selected' : ''}>Heavy</option></select></label>
        <label>Resolution <select id="s_res"><option value="0.6"${settings.resolution === 0.6 ? ' selected' : ''}>Low (fastest)</option><option value="0.75"${settings.resolution === 0.75 ? ' selected' : ''}>Medium</option><option value="1.25"${settings.resolution === 1.25 ? ' selected' : ''}>High</option><option value="2"${settings.resolution === 2 ? ' selected' : ''}>Sharpest</option></select></label>
        <label>Field of view <input id="s_fov" type="range" min="60" max="110" value="${settings.fov}"> <span id="s_fov_v">${settings.fov}</span></label>
        <label>Volume <input id="s_vol" type="range" min="0" max="1" step="0.05" value="${settings.volume}"></label>
        <label>Announcer voice <input id="s_ann" type="checkbox"${settings.announcer ? ' checked' : ''}></label>
        <button data-k="0"><b>0</b> Back</button></div>`;
    } else if (menu === 'help') {
      html = title + `<div class="list help"><div class="h">Controls</div>
        <table>
        <tr><td>W A S D</td><td>Move</td></tr>
        <tr><td>Mouse</td><td>Look</td></tr>
        <tr><td>Left click</td><td>Fire. Hold to charge the sniper rifle. Hold on your own sentry with the spanner to repair or upgrade it</td></tr>
        <tr><td>Right click</td><td>Sniper zoom / Demoman detonate pipebombs</td></tr>
        <tr><td>Space</td><td>Jump, or swim up</td></tr>
        <tr><td>Ctrl / Shift</td><td>Swim down</td></tr>
        <tr><td>1 - 4, wheel</td><td>Change weapon</td></tr>
        <tr><td>Q</td><td>Last weapon used. Spy: put on a disguise</td></tr>
        <tr><td>G / F</td><td>Hold to prime grenade 1 / 2, release to throw. The fuse starts when you press</td></tr>
        <tr><td>E</td><td>Engineer: build a sentry gun</td></tr>
        <tr><td>R</td><td>Demoman: detonate all your pipebombs</td></tr>
        <tr><td>M / N</td><td>Change class / change team</td></tr>
        <tr><td>Tab</td><td>Hold for the scoreboard</td></tr>
        <tr><td>Esc</td><td>This menu</td></tr>
        <tr><td>F1 / F2</td><td>Controls / How to play</td></tr>
        </table>
        <p><b>On a phone or tablet</b> the game switches to touch controls: drag the left half of the screen to
        move, drag the right half to look, and use the on-screen buttons to fire, jump, throw grenades and pick
        weapons. Hold the screen sideways. Aim assist is on by default and can be changed under Settings.</p>
        <p>New here? <b>How to play</b> on the main menu covers the objective, the routes into the enemy fort,
        every class, and how to run a sentry gun.</p>
        <button data-k="0"><b>0</b> Back</button></div>`;
    } else if (menu === 'howto') {
      html = title + `<div class="list help howto"><div class="h">How to play</div>

        <h4>Winning the round</h4>
        <p>Get into the enemy fort, take the flag from their basement, and carry it back to your own flag room.
        Each capture is worth 10 points. First team to ten captures takes the round, or whoever leads when the
        twenty minute clock runs out. A dropped flag goes home by itself after 60 seconds, so cutting down a
        carrier is as good as recovering it yourself.</p>

        <h4>Three ways in</h4>
        <p><b>The bridge.</b> Straight across and through the front door. Fast, obvious, and covered by every
        sniper on their battlements.<br>
        <b>The battlements.</b> Rocket-jump or conc-jump onto their wall and drop in behind the front line.<br>
        <b>The water.</b> Dive into the moat and follow the tunnel at one end. It surfaces in a well inside their
        basement and spills you out beside the flag. Slow, and almost nobody watches it.</p>

        <h4>Running a sentry gun</h4>
        <ol>
        <li>Press <b>M</b> then <b>9</b> to become the Engineer.</li>
        <li>Stand on solid ground facing open space. The gun lands about a metre in front of you.</li>
        <li>Press <b>E</b>. It costs 130 cells, which is exactly what you spawn with. It takes four seconds to
        assemble and you cannot move while it does.</li>
        <li>It finds and shoots anything hostile within 28 m that it can see. You never aim it yourself.</li>
        </ol>
        <p>To <b>repair or upgrade</b>, take the spanner (weapon 1) and hold left click on your own gun.
        While it is damaged, each hit costs 10 cells and restores 40 health. Once it is back to full health,
        each hit costs 130 cells and adds a level, up to three. Level 2 adds a second barrel and a faster rate
        of fire. Level 3 adds the rocket pod on top.</p>
        <p>You spawn with only enough cells for the gun itself, so upgrading means a trip back for ammo. A
        resupply bag in your spawn room fills you to 200 cells; an ammo pack around the fort gives 30.
        One gun per Engineer. Any teammate can repair yours, but only you can upgrade it. And a disguised
        enemy Spy strolls straight past it, because the gun believes the disguise.</p>

        <h4>The classes</h4>
        <p><b>Scout</b> — Fastest on the map and the thinnest. Your flag runner. A concussion grenade at your own
        feet throws you clean over the moat, and caltrops slow whoever is chasing you.</p>
        <p><b>Sniper</b> — Hold left click to charge and release to fire; a full charge kills nearly anything.
        Headshots do double damage, leg shots do half and slow the target. Right click zooms. You move at half
        speed while charging, so pick your spot before you start.</p>
        <p><b>Soldier</b> — Rockets and the heaviest armour in the game. Aim at feet rather than chests so the
        splash still lands on someone who dodges. Look down, then jump and fire together, to rocket-jump.</p>
        <p><b>Demoman</b> — Pipes bounce and go off on a short fuse. Pipebombs stick where they land and wait
        indefinitely: carpet the flag room, back off, then press <b>R</b> to set them all off at once.</p>
        <p><b>Medic</b> — The medikit heals teammates and clears fire, infection and tranquiliser darts.
        Swing it at an enemy instead and they catch an infection that spreads through their team.</p>
        <p><b>HWGuy</b> — The most armour available. The assault cannon needs most of a second to spin up and
        slows you to a crawl while it spins, so start it before you round the corner, not after.</p>
        <p><b>Pyro</b> — Set them alight and walk away; the burn finishes the job. Water puts fires out,
        including the one on you.</p>
        <p><b>Spy</b> — Press <b>Q</b> to disguise as the enemy. It takes a couple of seconds and breaks the
        instant you fire. Knife someone from behind for an instant kill. The tranquiliser slows without killing.</p>
        <p><b>Engineer</b> — The sentry, as above. The railgun is accurate at range while you wait on cells.</p>

        <h4>Worth knowing</h4>
        <ul>
        <li>A grenade's fuse starts when you press the key, not when you throw it. Hold on too long and it kills you.</li>
        <li>Resupply bags in your spawn room instantly refill health, armour, ammo and grenades.</li>
        <li>Health and ammo packs are scattered through both forts and return twelve seconds after being taken.</li>
        <li>Falls of more than about four metres hurt. Landing in water does not.</li>
        <li>The enemy is told the moment you touch their flag, so expect company on the way home.</li>
        <li>Both forts are the same layout mirrored, so their basement is laid out exactly like yours.</li>
        </ul>
        <button data-k="0"><b>0</b> Back</button></div>`;
    } else if (menu === 'skins') {
      const ids = setIds();
      html = title + `<div class="list skins"><div class="h">Skins</div>` +
        (ids.length ? ids.map((id, i) => {
          const st = allSets()[id];
          return `<button data-k="${i + 1}" class="${id === settings.skinSet ? 'cur' : ''}"><b>${i + 1}</b> <span class="cn">${st.label}</span>${id === settings.skinSet ? '<span class="tick">IN USE</span>' : ''}<span class="cd">${setBlurb(st)}</span></button>`;
        }).join('') : '<p>Character models are still loading…</p>') +
        `<p class="note">Skins are read from the asset manifest, so a new set appears here as soon as it is
        added to <b>assets/models</b> — nothing in the game has to change.</p>
        <button data-k="0"><b>0</b> Back</button></div>`;
    } else if (menu === 'credits') {
      const sets = allSets();
      const lines = Object.values(sets).map((st) => `<p><b>${st.label}</b><br>${st.credit || 'No credit recorded for this set.'}</p>`).join('');
      html = title + `<div class="list help"><div class="h">Credits</div>
        <h4>Character skins</h4>
        ${lines || '<p>Character models are still loading…</p>'}
        <p>Every set was rescaled, retargeted onto a shared 23-bone rig and re-textured for the web.
        None of the source files contain animation, so every pose in this game is generated at runtime.</p>
        <h4>Game</h4>
        <p>Built by Core Focus Productions as a tribute to <i>Half-Life: Team Fortress Classic</i> and its map
        2Fort. Team Fortress is a trademark of Valve Corporation and Tron is a trademark of Disney; neither is
        affiliated with this project. No game files from either are used: the map, weapons, sounds and code are
        original.</p>
        <button data-k="0"><b>0</b> Back</button></div>`;
    } else if (menu === 'end') {
      const w = game.score[0] > game.score[1] ? 'Blue wins!' : game.score[1] > game.score[0] ? 'Red wins!' : 'Draw!';
      html = title + `<div class="list"><div class="h">${w}</div><div class="hint big"><span class="blue">Blue ${game.score[0]}</span> — <span class="red">Red ${game.score[1]}</span></div>
        <button data-k="1"><b>1</b> Play again</button></div>`;
    }
    menuEl.innerHTML = html;
    menuEl.querySelectorAll('button[data-k]').forEach((b) => b.addEventListener('click', () => menuSelect(b.dataset.k)));
    if (menu === 'settings') bindSettings();
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function bindSettings() {
    $('s_name').addEventListener('input', (e) => { settings.name = e.target.value.slice(0, 16) || 'Player'; human.name = settings.name; saveSettings(); });
    $('s_fill').addEventListener('change', (e) => { settings.fill = e.target.checked; saveSettings(); syncBots(); });
    $('s_size').addEventListener('input', (e) => { settings.teamSize = parseInt(e.target.value, 10); $('s_size_v').textContent = settings.teamSize; saveSettings(); syncBots(); });
    $('s_skill').addEventListener('change', (e) => { settings.difficulty = e.target.value; saveSettings(); syncBots(); });
    $('s_sens').addEventListener('input', (e) => { settings.sens = parseFloat(e.target.value); saveSettings(); });
    if ($('s_tsens')) $('s_tsens').addEventListener('input', (e) => { settings.touchSens = parseFloat(e.target.value); saveSettings(); });
    if ($('s_assist')) $('s_assist').addEventListener('change', (e) => { settings.aimAssist = parseFloat(e.target.value); saveSettings(); });
    $('s_res').addEventListener('change', (e) => { settings.resolution = parseFloat(e.target.value); saveSettings(); });
    $('s_fx').addEventListener('change', (e) => { settings.particleBudget = parseInt(e.target.value, 10); saveSettings(); });
    $('s_fov').addEventListener('input', (e) => { settings.fov = parseInt(e.target.value, 10); $('s_fov_v').textContent = settings.fov; saveSettings(); });
    $('s_vol').addEventListener('input', (e) => { settings.volume = parseFloat(e.target.value); audio.setVolume(settings.volume); saveSettings(); });
    $('s_ann').addEventListener('change', (e) => { settings.announcer = e.target.checked; audio.announcer = settings.announcer; saveSettings(); });
  }
  function menuKey(e) {
    if (e.code === 'Escape') { if (menu === 'main' && human.spawnT !== undefined) closeMenu(); else if (menu !== 'main' && menu !== 'end') openMenu('main'); return; }
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.code.startsWith('Digit')) menuSelect(e.code.slice(5));
    if (e.code === 'Enter' && menu === 'end') menuSelect('1');
  }
  function menuSelect(k) {
    audio.init(); audio.resume();
    if (menu === 'main') {
      if (k === '1') { if (human.spawnT === undefined) openMenu('team'); else closeMenu(); }
      if (k === '2') { openMenu('class'); return; }
      if (k === '3') { openMenu('team'); return; }
      if (k === '4') { openMenu('skins'); return; }
      if (k === '5') { openMenu('settings'); return; }
      if (k === '6') { openMenu('help'); return; }
      if (k === '7') { openMenu('howto'); return; }
      if (k === '0') { openMenu('credits'); return; }
      if (k === '8') { restart(); closeMenu(); }
      if (k === '9') { settings.difficulty = DIFF_ORDER[(DIFF_ORDER.indexOf(settings.difficulty) + 1) % DIFF_ORDER.length]; saveSettings(); syncBots(); renderMenu(); }
    } else if (menu === 'team') {
      if (k === '0') { openMenu('main'); return; }
      let team = k === '1' ? BLUE : k === '2' ? RED : (game.teamCount(BLUE) <= game.teamCount(RED) ? BLUE : RED);
      if (team !== human.team) { human.team = team; if (human.alive) game.kill(human, null, 'teamswitch'); human.respawnAt = game.time; }
      syncBots(); openMenu('class');
    } else if (menu === 'class') {
      if (k === '0') { openMenu('main'); return; }
      const i = parseInt(k, 10) - 1; if (i < 0 || i >= CLASS_ORDER.length) return;
      const cls = CLASS_ORDER[i];
      if (human.alive) { human.pendingClass = cls; effects.message('You will spawn as ' + CLASSES[cls].name, human.team, 'info', human); }
      else { human.cls = cls; human.wantsRespawn = true; human.respawnAt = Math.min(human.respawnAt, game.time); }
      if (human.spawnT === undefined) { human.cls = cls; human.spawn(); }
      closeMenu();
    } else if (menu === 'skins') {
      if (k === '0') { openMenu('main'); return; }
      const id = setIds()[parseInt(k, 10) - 1];
      if (id) { pickSkinSet(id); renderMenu(); }
    } else if (menu === 'settings' || menu === 'help' || menu === 'credits' || menu === 'howto') { if (k === '0') openMenu('main'); }
    else if (menu === 'end') { if (k === '1') { restart(); closeMenu(); } }
  }
  function restart() { game.restartRound(); messages.length = 0; game.killFeed.length = 0; human.wantsRespawn = true; human.respawnAt = 0; }

  // --------------------------------------------------------------- HUD
  const hud = { hp: $('hp'), armor: $('armor'), ammo: $('ammo'), ammoLabel: $('ammolabel'), gren: $('gren'), weapon: $('weapon'), msgs: $('msgs'), feed: $('feed'), score: $('score'), timer: $('timer'), flags: $('flags'), dead: $('dead'), scores: $('scores'), charge: $('charge'), flash: $('flash'), xhair: $('xhair'), status: $('status'), build: $('build'), zoom: $('zoomov'), tags: $('tags') };
  function fmtTime(t) { t = Math.max(0, Math.floor(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
  function updateHud() {
    const p = human; const w = p.alive ? p.weapon() : null;
    hud.hp.textContent = p.alive ? Math.max(0, p.hp) : 0; hud.hp.className = p.alive && p.hp < 30 ? 'low' : '';
    hud.armor.textContent = p.alive ? p.armor : 0;
    if (w) { hud.weapon.textContent = w.name; hud.ammo.textContent = w.ammo ? p.ammo[w.ammo] : '—'; hud.ammoLabel.textContent = w.ammo || ''; }
    const gd = p.def.gren; hud.gren.innerHTML = gd.map((g, i) => g ? `<span class="${p.grenPrime && p.grenPrime.slot === i ? 'primed' : ''}">${GRENADES[g].name} <b>${p.gren[i]}</b></span>` : '').join(' ');
    hud.score.innerHTML = `<span class="blue">BLUE ${game.score[0]}</span><span class="red">RED ${game.score[1]}</span>`;
    hud.timer.textContent = fmtTime(game.roundLength - game.time);
    hud.flags.innerHTML = game.flags.map((f) => { const own = f.team === p.team; const st = f.state === 'home' ? 'at base' : f.state === 'carried' ? 'taken by ' + f.carrier.name : 'dropped (' + Math.ceil(f.returnAt - game.time) + 's)'; return `<div class="${f.team ? 'red' : 'blue'}">${TEAM_NAMES[f.team]} flag: ${st}${own && f.state !== 'home' ? ' !' : ''}</div>`; }).join('') + (p.flag ? '<div class="carry">YOU HAVE THE FLAG — get to your flag room!</div>' : '');
    // messages
    hud.msgs.innerHTML = messages.filter((m) => game.time - m.time < 4).map((m) => `<div class="${m.kind} ${m.team === 0 ? 'blue' : m.team === 1 ? 'red' : ''}">${escapeHtml(m.text)}</div>`).join('');
    hud.feed.innerHTML = game.killFeed.filter((k) => game.time - k.time < 8).map((k) => `<div>${k.attacker ? `<span class="${k.attacker.team ? 'red' : 'blue'}">${escapeHtml(k.attacker.name)}</span> ${k.verb} ` : ''}<span class="${k.victim.team ? 'red' : 'blue'}">${escapeHtml(k.victim.name)}</span>${k.attacker ? '' : ' ' + k.verb}</div>`).join('');
    // dead overlay
    if (!p.alive && p.spawnT !== undefined && !game.roundOver) {
      const kb = game.killFeed.filter((k) => k.victim === p).pop();
      const left = Math.max(0, p.respawnAt - game.time);
      hud.dead.hidden = false; hud.dead.innerHTML = `<div>${kb && kb.attacker ? 'Killed by ' + escapeHtml(kb.attacker.name) + ' (' + CLASSES[kb.attacker.cls].name + ')' : 'You died'}</div><div class="small">${left > 0 ? 'Respawning in ' + Math.ceil(left) + 's' : 'Respawning...'} — press M to change class</div>`;
    } else hud.dead.hidden = true;
    // charge bar
    if (p.alive && p.charge >= 0) { hud.charge.hidden = false; hud.charge.firstElementChild.style.width = Math.min(100, p.charge / WEAPONS.sniper.chargeTime * 100) + '%'; } else hud.charge.hidden = true;
    if (p.alive && p.building > 0) { hud.build.hidden = false; hud.build.firstElementChild.style.width = (100 - p.building / 4 * 100) + '%'; } else hud.build.hidden = true;
    // status effects
    const st = []; if (p.burn > 0) st.push('ON FIRE'); if (p.infected) st.push('INFECTED — find a medic'); if (p.tranq > 0) st.push('TRANQUILIZED'); if (p.disguise >= 0) st.push('Disguised as ' + TEAM_NAMES[p.disguise] + ' ' + CLASSES[p.disguiseCls].name); if (p.disguiseT > 0) st.push('Disguising...'); if (p.grenPrime) st.push('GRENADE PRIMED ' + p.grenPrime.t.toFixed(1));
    if (p.cls === 'demoman') { const n = game.projectiles.filter((q) => q.type === 'pipebomb' && q.owner === p).length; if (n) st.push('Pipebombs: ' + n + ' (R / right-click to detonate)'); }
    if (p.sentry) st.push('Sentry L' + p.sentry.level + ' ' + Math.ceil(p.sentry.hp) + 'hp');
    hud.status.innerHTML = st.map((s) => `<div>${s}</div>`).join('');
    hud.zoom.hidden = !(zoomed && p.alive && p.weapon().zoom);
    hud.xhair.hidden = !p.alive || menu;
    // scoreboard
    if (showScores || game.roundOver) {
      hud.scores.hidden = false;
      let html = '';
      for (const t of [BLUE, RED]) {
        const ps = game.players.filter((q) => q.team === t).sort((a, b) => b.score - a.score);
        html += `<table class="${t ? 'red' : 'blue'}"><tr><th colspan="6">${TEAM_NAMES[t]} — ${game.score[t]}</th></tr><tr><th>Name</th><th>Class</th><th>Score</th><th>Kills</th><th>Deaths</th><th>Caps</th></tr>`;
        for (const q of ps) html += `<tr class="${q === p ? 'me' : ''}"><td>${escapeHtml(q.name)}</td><td>${CLASSES[q.cls].name}</td><td>${q.score}</td><td>${q.kills}</td><td>${q.deaths}</td><td>${q.caps}</td></tr>`;
        html += '</table>';
      }
      hud.scores.innerHTML = html;
    } else hud.scores.hidden = true;
    hud.flash.style.opacity = Math.min(0.55, flashAmt * 0.7);
    // teammate name tags
    let tags = '';
    if (p.alive) for (const q of game.players) {
      if (q === p || !q.alive) continue;
      const friendly = q.team === p.team; if (!friendly) continue;
      const d = V.dist(q.pos, p.pos); if (d > 40) continue;
      const s = renderer.project(V.add(q.pos, [0, PLAYER_H + 0.25, 0])); if (!s) continue;
      if (!game.world.lineClear(p.eye(), q.eye())) continue;
      tags += `<div class="tag ${q.team ? 'red' : 'blue'}" style="left:${s[0]}px;top:${s[1]}px">${escapeHtml(q.name)}<br><small>${CLASSES[q.cls].name} ${Math.max(0, q.hp)}</small></div>`;
    }
    // floating damage numbers: rise off the target, grow on the first frame, fade out
    const now = performance.now() / 1000;
    for (let i = dmgNums.length - 1; i >= 0; i--) if (now - dmgNums[i].last > 1.05) dmgNums.splice(i, 1);
    for (const d of dmgNums) {
      const age = now - d.last, t = Math.min(1, age / 1.05);
      const s = renderer.project([d.pos[0], d.pos[1] + 0.35 + t * 0.9, d.pos[2]]);
      if (!s) continue;
      d.pop = Math.max(0, d.pop - 0.12);
      const scale = (d.big ? 1.5 : 1) * (1 + d.pop * 0.45);
      tags += `<div class="dmg${d.big ? ' crit' : ''}" style="left:${s[0]}px;top:${s[1]}px;opacity:${(1 - t * t).toFixed(2)};transform:translate(-50%,-50%) scale(${scale.toFixed(2)})">${d.amount}</div>`;
    }
    hud.tags.innerHTML = tags;
    // crosshair tick: a short outward flick when a shot lands
    hitTick = Math.max(0, hitTick - 0.09);
    hud.xhair.style.setProperty('--hit', hitTick.toFixed(2));
    if (touch.enabled) touch.sync(p, {
      actionLabel: actionFor(p),
      inWater: p.alive && p.inWater,
      grenades: p.def.gren.map((g, i) => (g ? (p.alive ? p.gren[i] : '') : null)),
      weapons: p.alive ? p.weapons.map((id) => { const w = WEAPONS[id]; return { short: w.short || w.name, ammo: w.ammo ? p.ammo[w.ammo] : null }; }) : [],
      wi: p.wi,
    });
  }

  // --------------------------------------------------------------- drawing
  // Characters, guns, particles and projectiles are each their own draw call, which
  // is what actually costs on a phone. Cull by distance and by the camera's cone.
  const cull = { pos: [0, 0, 0], fwd: [0, 0, -1], char: 90, weapon: 26, fx: 48 };
  function visible(p, maxDist) {
    const dx = p[0] - cull.pos[0], dy = p[1] - cull.pos[1], dz = p[2] - cull.pos[2];
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > maxDist * maxDist) return false;
    if (d2 < 9) return true;
    const d = Math.sqrt(d2);
    return (dx * cull.fwd[0] + dy * cull.fwd[1] + dz * cull.fwd[2]) / d > -0.35;
  }
  const SKIN = [0.85, 0.68, 0.55];
  const CLASS_HAT = { scout: [0.2, 0.2, 0.2], sniper: [0.35, 0.3, 0.2], soldier: [0.25, 0.3, 0.2], demoman: [0.15, 0.15, 0.15], medic: [0.95, 0.95, 0.95], hwguy: [0.3, 0.3, 0.3], pyro: [0.1, 0.1, 0.1], spy: [0.2, 0.2, 0.25], engineer: [0.95, 0.8, 0.2] };
  function teamColor(t) { return TEAM_COLORS[t]; }
  // Root matrix placing a character in the world (handles the death topple).
  function playerRoot(p, scale) {
    let m = M.mul(M.translate(p.pos[0], p.pos[1], p.pos[2]), M.rotY(p.yaw));
    if (scale && scale !== 1) m = M.mul(m, M.scale(scale, scale, scale));
    if (!p.alive) {
      const t = clamp((game.time - p.deadAt) / 0.45, 0, 1);
      const fall = t * t * (3 - 2 * t);
      m = M.mul(m, M.mul(M.translate(0, 0.05 * fall, -0.45 * fall), M.rotX(-Math.PI / 2 * fall)));
    }
    return m;
  }
  function poseState(p) {
    const w = p.alive ? p.weapon() : null;
    const gid = w ? (GRIP_FOR[w.model] || (w.type === 'melee' ? 'melee' : 'rifle')) : 'rifle';
    return {
      time: game.time, walkPhase: p.walkPhase, speed: Math.hypot(p.vel[0], p.vel[2]),
      onGround: p.onGround || p.inWater, velY: p.vel[1], pitch: p.alive ? p.pitch : 0, yaw: p.yaw, root: null,
      fireAnim: w && w.type !== 'melee' ? p.fireAnim : 0,
      swing: w && w.type === 'melee' ? Math.sin(Math.min(1, 1 - p.fireAnim) * Math.PI) * p.fireAnim : 0,
      grip: GRIP[gid],
    };
  }
  // Skinned pass: every visible character in one program.
  function drawCharacters() {
    if (!modelsReady || !renderer.beginSkinned()) return false;
    for (const p of game.players) {
      if (p === human && human.alive) continue;
      if (!p.alive && game.time - p.deadAt > 8) continue;
      if (!visible(p.pos, cull.char)) continue;
      const model = modelFor(p); if (!model) continue;
      const pose = poseFor(p, model);
      // SHARED_SCALE only applies while a class is WEARING ANOTHER CLASS'S BODY —
      // it exists to make a borrowed model read as the right build. Now that the
      // demoman has his own, shrinking him would just make him short.
      const scale = model.glow ? (CLASS_SCALE[p.cls] || 1)
        : (sharesModel(p) ? (SHARED_SCALE[p.cls] || 1) : 1);
      pose.scale = scale;
      const st = poseState(p); st.root = playerRoot(p, scale);
      animate(pose, st);
      const team = teamOf(p);
      renderer.drawSkinned(model, pose, {
        textures: models.textures,
        teamSwap: model.glow ? 0 : (team === BLUE ? 1 : 0),
        glow: model.glow ? TEAM_GLOW[team] : null,
        flash: Math.min(0.32, Math.max(0, p.hitFlash) * 2.1),   // fades out; a flat 0.45 whited-out dark suits
      });
    }
    return true;   // the caller closes the pass once props have drawn too
  }
  // ---- screens on the map ------------------------------------------------
  // A wall panel that can play a video, show a still, or fall back to a built-in
  // placeholder. Everything is driven by assets/screens/screens.json, so a new
  // advert is a file drop and one line of config, not a code change.
  const screens = { config: null, tex: null, kind: 'none', note: '' };
  function loadScreens() {
    fetch('assets/screens/screens.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (!cfg || !cfg.screens || !cfg.screens.length) return;
        screens.config = cfg.screens[0];
        // ?screen=<url> overrides the configured media, so an advert can be
        // previewed without editing anything. Also how the browser test checks
        // that a supplied file actually reaches the panel.
        const override = new URLSearchParams(location.search).get('screen');
        const media = override || screens.config.media;
        if (override) screens.config = Object.assign({}, screens.config, { media: override });
        if (!media) { screens.kind = 'placeholder'; screens.note = 'no media configured'; return; }
        const url = /^(https?:|data:|blob:|\/)/.test(media) ? media : 'assets/screens/' + media;
        if (/\.(mp4|webm|m4v|ogv)$/i.test(media)) {
          const v = document.createElement('video');
          v.src = url; v.loop = true; v.muted = true; v.playsInline = true;
          v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
          v.crossOrigin = 'anonymous';
          v.addEventListener('error', () => { screens.kind = 'placeholder'; screens.note = 'could not load ' + media; });
          v.addEventListener('loadeddata', () => {
            screens.tex = renderer.videoTexture(v);
            screens.kind = 'video';
            // Autoplay is blocked until the page has been interacted with; the
            // player clicking through the menu counts, so retry on first input.
            const tryPlay = () => v.play().catch(() => {});
            tryPlay();
            window.addEventListener('pointerdown', tryPlay, { once: true });
            window.addEventListener('keydown', tryPlay, { once: true });
          });
          v.load();
        } else {
          const img = new Image();
          img.onload = () => { screens.tex = renderer.imageTexture(img); screens.kind = 'image'; };
          img.onerror = () => { screens.kind = 'placeholder'; screens.note = 'could not load ' + media; };
          img.src = url;
        }
      })
      .catch(() => { screens.kind = 'placeholder'; screens.note = 'no screens.json'; });
  }
  // Drawn when there is nothing to show: a slow sweep so the panel is obviously
  // alive and obviously waiting for content, rather than looking like a bug.
  let placeholderTex = null, placeholderAt = -1;
  function placeholderScreen() {
    const c = placeholderScreen.canvas || (placeholderScreen.canvas = Object.assign(document.createElement('canvas'), { width: 256, height: 144 }));
    const g = c.getContext('2d');
    const t = game.time;
    g.fillStyle = '#0b0f14'; g.fillRect(0, 0, 256, 144);
    const sweep = ((t * 0.18) % 1) * 320 - 32;
    const grad = g.createLinearGradient(sweep - 60, 0, sweep + 60, 0);
    grad.addColorStop(0, 'rgba(60,150,220,0)'); grad.addColorStop(0.5, 'rgba(60,150,220,0.22)'); grad.addColorStop(1, 'rgba(60,150,220,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 256, 144);
    g.strokeStyle = 'rgba(90,170,230,0.5)'; g.lineWidth = 2; g.strokeRect(8, 8, 240, 128);
    g.fillStyle = '#cfe6ff'; g.font = 'bold 22px system-ui, sans-serif'; g.textAlign = 'center';
    g.fillText('SCREEN', 128, 64);
    g.font = '12px system-ui, sans-serif'; g.fillStyle = 'rgba(190,215,240,0.75)';
    g.fillText('drop a video in assets/screens/', 128, 88);
    g.fillText('and name it in screens.json', 128, 104);
    if (!placeholderTex) { placeholderTex = renderer.imageTexture(c); placeholderAt = t; }
    else if (t - placeholderAt > 0.06) { placeholderTex.update(c); placeholderAt = t; }
    return placeholderTex;
  }
  function drawScreens() {
    const list = game.data.screens || [];
    if (!list.length) return;
    if (screens.kind === 'video' && screens.tex) screens.tex.refresh();
    const cfg = screens.config || {};
    const size = cfg.size || [2.8, 1.575];
    const tex = screens.tex && screens.kind !== 'placeholder' ? screens.tex : placeholderScreen();
    for (const sc of list) {
      if (!visible(sc.pos, cull.char)) continue;
      const m = M.mul(M.translate(sc.pos[0], sc.pos[1], sc.pos[2]),
        M.mul(M.rotY(sc.yaw), M.scale(size[0] / 2, size[1] / 2, 1)));
      renderer.drawPanel(m, tex, { bright: cfg.bright || 1.15, scan: cfg.scanlines === false ? 0 : 1 });
    }
  }

  // Static props placed on the map, read from the asset manifest.
  let placements = null;
  function propPlacements() {
    if (placements) return placements;
    const mf = models.manifest;
    placements = (mf && mf.placements) || [];
    for (const pl of placements) pl._m = M.mul(M.mul(M.translate(pl.pos[0], pl.pos[1], pl.pos[2]), M.rotY(pl.yaw || 0)),
      M.scale(pl.scale || 1, pl.scale || 1, pl.scale || 1));
    return placements;
  }
  function drawProps() {
    if (!modelsReady) return;
    for (const pl of propPlacements()) {
      const m = models.prop(pl.prop); if (!m) continue;
      if (!visible(pl.pos, cull.char)) continue;
      renderer.drawStatic(m, pl._m, { textures: models.textures, teamSwap: 0, glow: pl.glow ? TEAM_GLOW[pl.team === 1 ? 1 : 0] : null, flash: 0 });
    }
  }
  // A soft contact shadow under anything standing on the map. Without one,
  // characters read as floating regardless of how well they are lit.
  function drawGroundShadows() {
    const r = renderer;
    const cast = (pos, radius, maxDrop) => {
      const from = [pos[0], pos[1] + 0.15, pos[2]];
      const hit = game.world.raycast(from, [0, -1, 0], maxDrop);
      if (!hit) return;
      const drop = hit.dist;
      const fade = 1 - Math.min(1, drop / maxDrop);
      const a = 0.42 * fade * fade;
      if (a < 0.02) return;
      const w = radius * (1 + drop * 0.35);
      r.drawMesh(r.sphere, M.trs([hit.point[0], hit.point[1] + 0.04, hit.point[2]], 0, 0, w * 2, 0.05, w * 2), [0, 0, 0], { alpha: a });
    };
    for (const p of game.players) {
      if (!p.alive || (p === human && human.alive)) continue;
      if (!visible(p.pos, 42)) continue;
      cast(p.pos, 0.42, 3.5);
    }
    for (const s of game.sentries) { if (visible(s.pos, 42)) cast(s.pos, 0.5, 1.2); }
  }
  // The gun a character carries, placed at the right hand and aimed with the player.
  function drawCharacterWeapons() {
    const r = renderer;
    for (const p of game.players) {
      if (!p.alive || (p === human && human.alive)) continue;
      if (!visible(p.pos, cull.weapon)) continue;
      const e = poses.get(p); if (!e || !e.pose.weapon) continue;
      const wp = e.pose.weapon;
      const w = p.weapon();
      const base = M.mul(M.translate(wp.pos[0], wp.pos[1], wp.pos[2]), M.mul(M.rotY(wp.yaw), M.rotX(wp.pitch)));
      drawWeapon(r, base, weaponModelId(w), botWeaponState(p, w));
      if (game.time - p.lastFire < MUZZLE_T && w.type !== 'melee' && w.type !== 'flame') drawMuzzleFlash(r, base, w.model, p.id + game.time * 40);
      if (p.flag) drawFlagCloth(M.mul(M.translate(p.pos[0], p.pos[1], p.pos[2]), M.mul(M.rotY(p.yaw), M.translate(0, 0.9, 0.28))), p.flag.team, true);
      drawClassMark(p, e.pose);
    }
  }
  // Some skin sets map two classes onto one body — the mercenaries have no
  // demoman, so he wears the soldier's. Without a marker you cannot tell which
  // of the two is about to put eight pipebombs under you. Only drawn when the
  // model really is shared, so a set with its own demoman gets nothing.
  function sharesModel(p) {
    const set = activeSet();
    if (!set || set.mode !== 'class') return false;
    const mine = set.models[p.cls];
    if (!mine) return false;
    for (const [cls, m] of Object.entries(set.models)) if (cls !== p.cls && m === mine) return true;
    return false;
  }
  function drawClassMark(p, pose) {
    if (p.cls !== 'demoman' || !pose.head || !sharesModel(p)) return;
    const r = renderer, h = pose.head.pos;
    const base = M.mul(M.translate(h[0], h[1] + 0.14, h[2]), M.rotY(p.yaw));
    r.drawMesh(r.cube, M.mul(base, M.scale(0.23, 0.1, 0.23)), [0.12, 0.12, 0.13]);        // knit cap
    r.drawMesh(r.cube, M.mul(base, M.mul(M.translate(0, 0.06, 0), M.scale(0.2, 0.05, 0.2))), [0.12, 0.12, 0.13]);
    r.drawMesh(r.cube, M.mul(base, M.mul(M.translate(-0.05, -0.09, -0.11), M.scale(0.07, 0.05, 0.02))), [0.05, 0.05, 0.05]); // eyepatch
    r.drawMesh(r.cube, M.mul(base, M.mul(M.translate(0, -0.05, -0.105), M.scale(0.2, 0.015, 0.02))), [0.05, 0.05, 0.05]);   // strap
  }
  // ---- blocky fallback, used until the models load or if they can't ----
  function drawPlayer(p) {
    const r = renderer; const gl = r.gl;
    const team = p.disguise >= 0 ? p.disguise : p.team;
    const col = teamColor(team); const dark = V.scale(col, 0.6);
    const flash = p.hitFlash > 0 ? 0.6 : 0;
    if (flash) gl.uniform1f(r.u.uFlash, flash);
    const yaw = p.yaw;
    if (!p.alive) {
      // corpse: lie down for 6 s
      if (game.time - p.deadAt > 6) return;
      const m = M.mul(M.translate(p.pos[0], p.pos[1] + 0.2, p.pos[2]), M.mul(M.rotY(yaw), M.rotX(Math.PI / 2)));
      r.drawMesh(r.cube, M.mul(m, M.mul(M.translate(0, 1.0, 0), M.scale(0.55, 0.7, 0.32))), dark);
      r.drawMesh(r.cube, M.mul(m, M.mul(M.translate(0, 1.55, 0), M.scale(0.28, 0.28, 0.28))), SKIN);
      r.drawMesh(r.cube, M.mul(m, M.mul(M.translate(-0.13, 0.42, 0), M.scale(0.18, 0.85, 0.22))), dark);
      r.drawMesh(r.cube, M.mul(m, M.mul(M.translate(0.13, 0.42, 0), M.scale(0.18, 0.85, 0.22))), dark);
      if (flash) gl.uniform1f(r.u.uFlash, 0);
      return;
    }
    const wide = p.cls === 'hwguy' ? 1.35 : p.cls === 'scout' ? 0.85 : 1;
    const base = M.mul(M.translate(p.pos[0], p.pos[1], p.pos[2]), M.rotY(yaw));
    const moving = Math.hypot(p.vel[0], p.vel[2]) > 0.5;
    const swing = moving ? Math.sin(p.walkPhase * 2.2) * 0.6 : 0;
    // legs
    for (const s of [-1, 1]) {
      const m = M.mul(base, M.mul(M.translate(0.14 * s * wide, 0.85, 0), M.mul(M.rotX(swing * s), M.mul(M.translate(0, -0.42, 0), M.scale(0.2 * wide, 0.85, 0.24)))));
      r.drawMesh(r.cube, m, dark);
    }
    // torso
    r.drawMesh(r.cube, M.mul(base, M.mul(M.translate(0, 1.2, 0), M.scale(0.56 * wide, 0.72, 0.34 * wide))), col);
    // belt / class stripe
    r.drawMesh(r.cube, M.mul(base, M.mul(M.translate(0, 0.86, 0), M.scale(0.58 * wide, 0.08, 0.36 * wide))), [0.2, 0.15, 0.1]);
    // head
    const headCol = p.cls === 'pyro' || p.cls === 'spy' ? [0.25, 0.25, 0.28] : SKIN;
    r.drawMesh(r.cube, M.mul(base, M.mul(M.translate(0, 1.7, 0), M.scale(0.28, 0.28, 0.28))), headCol);
    // hat
    const hat = CLASS_HAT[p.cls];
    if (p.cls === 'sniper') r.drawMesh(r.cube, M.mul(base, M.mul(M.translate(0, 1.86, 0), M.scale(0.46, 0.04, 0.46))), hat);
    else if (p.cls === 'soldier' || p.cls === 'engineer' || p.cls === 'hwguy') r.drawMesh(r.cube, M.mul(base, M.mul(M.translate(0, 1.87, 0), M.scale(0.34, 0.12, 0.34))), hat);
    else if (p.cls === 'scout') r.drawMesh(r.cube, M.mul(base, M.mul(M.translate(0, 1.86, -0.06), M.scale(0.3, 0.06, 0.4))), hat);
    else if (p.cls === 'medic') { r.drawMesh(r.cube, M.mul(base, M.mul(M.translate(0, 1.86, 0), M.scale(0.3, 0.06, 0.3))), hat); r.drawMesh(r.cube, M.mul(base, M.mul(M.translate(0, 1.2, 0.19), M.scale(0.3, 0.08, 0.02))), [0.9, 0.1, 0.1]); r.drawMesh(r.cube, M.mul(base, M.mul(M.translate(0, 1.2, 0.19), M.scale(0.08, 0.3, 0.02))), [0.9, 0.1, 0.1]); }
    else if (p.cls === 'demoman') r.drawMesh(r.cube, M.mul(base, M.mul(M.translate(0, 1.86, 0), M.scale(0.3, 0.07, 0.3))), hat);
    // arms + weapon (pitch with aim)
    const aim = M.mul(base, M.mul(M.translate(0, 1.35, 0), M.rotX(p.pitch)));
    r.drawMesh(r.cube, M.mul(aim, M.mul(M.translate(0.3 * wide, -0.05, -0.25), M.scale(0.14, 0.14, 0.55))), col);
    r.drawMesh(r.cube, M.mul(aim, M.mul(M.translate(-0.3 * wide, -0.05, -0.2), M.scale(0.14, 0.14, 0.45))), col);
    const w = p.weapon();
    const hand = M.mul(aim, M.translate(0.16 * wide, -0.04, -0.28));
    drawWeapon(r, hand, weaponModelId(w), botWeaponState(p, w));
    if (p.fireAnim > 0.72 && w.type !== 'melee' && w.type !== 'flame') drawMuzzleFlash(r, hand, w.model, p.id + game.time * 40);
    // flag on the back
    if (p.flag) drawFlagCloth(M.mul(base, M.translate(0, 1.0, 0.3)), p.flag.team, true);
    if (flash) gl.uniform1f(r.u.uFlash, 0);
  }
  function drawFlagCloth(m, team, onBack) {
    const r = renderer; const col = teamColor(team);
    r.drawMesh(r.cube, M.mul(m, M.mul(M.translate(0, 0.9, 0), M.scale(0.05, 1.8, 0.05))), [0.3, 0.25, 0.2]);
    const wave = Math.sin(game.time * 6) * 0.15;
    r.drawMesh(r.cube, M.mul(m, M.mul(M.translate(0.02, 1.45, 0.35), M.mul(M.rotY(wave), M.scale(0.04, 0.55, 0.7)))), col, { emissive: 0.15 });
  }
  function drawFlags() {
    const r = renderer;
    for (const f of game.flags) {
      if (f.state === 'carried') continue;
      const bob = f.state === 'dropped' ? 0 : 0;
      const m = M.mul(M.translate(f.pos[0], f.pos[1] + bob, f.pos[2]), M.rotY(game.time * 0.8));
      drawFlagCloth(m, f.team, false);
      // base pedestal at home
      if (f.state === 'home') r.drawMesh(r.cube, M.mul(M.translate(f.pos[0], f.pos[1] + 0.05, f.pos[2]), M.scale(1.2, 0.1, 1.2)), V.scale(teamColor(f.team), 0.8));
    }
    // capture zones
    for (const t of [BLUE, RED]) {
      const c = game.data.caps[t];
      r.drawMesh(r.cube, M.mul(M.translate(c.pos[0], c.pos[1] + 0.02, c.pos[2]), M.scale(c.r * 2, 0.02, c.r * 2)), teamColor(t), { alpha: 0.18 + 0.08 * Math.sin(game.time * 3), emissive: 1 });
    }
  }
  function drawItems() {
    const r = renderer;
    for (const it of game.items) {
      if (it.respawnAt > game.time || !visible(it.pos, cull.fx)) continue;
      const y = it.pos[1] + 0.35 + Math.sin(game.time * 2 + it.pos[0]) * 0.08;
      const m = M.mul(M.translate(it.pos[0], y, it.pos[2]), M.rotY(game.time));
      if (it.type === 'health') { r.drawMesh(r.cube, M.mul(m, M.scale(0.5, 0.35, 0.5)), [0.95, 0.95, 0.95]); r.drawMesh(r.cube, M.mul(m, M.mul(M.translate(0, 0.18, 0), M.scale(0.32, 0.02, 0.1))), [0.9, 0.1, 0.1]); r.drawMesh(r.cube, M.mul(m, M.mul(M.translate(0, 0.18, 0), M.scale(0.1, 0.02, 0.32))), [0.9, 0.1, 0.1]); }
      else { r.drawMesh(r.cube, M.mul(m, M.scale(0.55, 0.4, 0.4)), [0.45, 0.35, 0.2]); r.drawMesh(r.cube, M.mul(m, M.mul(M.translate(0, 0, 0), M.scale(0.57, 0.1, 0.42))), [0.3, 0.3, 0.3]); }
    }
    for (const rs of game.resupply) {
      const m = M.translate(rs.pos[0], rs.pos[1] + 0.3, rs.pos[2]);
      r.drawMesh(r.cube, M.mul(m, M.scale(0.9, 0.6, 0.6)), [0.5, 0.42, 0.25]); r.drawMesh(r.cube, M.mul(m, M.mul(M.translate(0, 0.31, 0), M.scale(0.6, 0.02, 0.3))), teamColor(rs.team), { emissive: 0.5 });
    }
    for (const c of game.caltrops) r.drawMesh(r.cube, M.mul(M.translate(c.pos[0], c.pos[1] + 0.08, c.pos[2]), M.mul(M.rotY(c.pos[0]), M.scale(0.16, 0.16, 0.16))), [0.25, 0.25, 0.25]);
  }
  function drawSentries() {
    const r = renderer;
    for (const s of game.sentries) {
      if (!visible(s.pos, cull.char)) continue;
      const col = teamColor(s.team);
      const root = M.mul(M.translate(s.pos[0], s.pos[1], s.pos[2]), M.rotY(s.baseYaw || 0));
      drawSentry(r, root, s.level, col, { yaw: (s.yaw || 0) - (s.baseYaw || 0), pitch: s.pitch || 0, recoil: s.recoil || 0, flash: s.flash || 0, target: !!s.target });
      // damaged sentries smoke
      const frac = s.hp / s.maxHp;
      if (frac < 0.5 && Math.random() < (0.5 - frac) * 2.2 * 0.35) {
        effects.particle({ pos: [s.pos[0] + rand(-0.15, 0.15), s.pos[1] + 0.85, s.pos[2] + rand(-0.15, 0.15)], vel: [rand(-0.2, 0.2), rand(0.6, 1.2), rand(-0.2, 0.2)], life: 1.1, size: 0.12, grow: 0.4, color: frac < 0.25 ? [0.15, 0.15, 0.15] : [0.5, 0.5, 0.5], alpha: 0.45 });
      }
    }
    // under construction: the toolbox is down, the gun rises out of the floor
    for (const p of game.players) {
      if (!p.alive || p.building <= 0 || !p.buildSpot) continue;
      const prog = 1 - p.building / 4;
      const root = M.mul(M.translate(p.buildSpot[0], p.buildSpot[1], p.buildSpot[2]), M.rotY(p.yaw));
      drawToolbox(r, root, teamColor(p.team), Math.min(1, prog * 4));
      if (prog > 0.22) {
        const rise = (1 - (prog - 0.22) / 0.78) * SENTRY_HEIGHT[0];
        const shake = Math.sin(game.time * 40) * 0.012 * (1 - prog);
        const sunk = M.mul(M.translate(p.buildSpot[0] + shake, p.buildSpot[1] - rise, p.buildSpot[2]), M.rotY(p.yaw));
        drawSentry(r, sunk, 1, teamColor(p.team), { yaw: 0, pitch: 0 });
      }
    }
  }
  function drawProjectiles() {
    const r = renderer;
    for (const q of game.projectiles) {
      if (!visible(q.pos, cull.char)) continue;
      const v = q.vel, l = V.len(v);
      const yaw = l > 0.01 ? Math.atan2(-v[0], -v[2]) : q.spin, pitch = l > 0.01 ? Math.asin(clamp(v[1] / l, -1, 1)) : 0;
      switch (q.type) {
        case 'rocket': r.cubeAt(q.pos, [0.14, 0.14, 0.6], [0.35, 0.35, 0.35], yaw, pitch); r.cubeAt(V.madd(q.pos, V.norm(v), -0.35), [0.16, 0.16, 0.12], [1, 0.7, 0.2], yaw, pitch, { emissive: 1 }); break;
        case 'ic': r.cubeAt(q.pos, [0.14, 0.14, 0.5], [0.8, 0.3, 0.1], yaw, pitch, { emissive: 0.6 }); break;
        case 'nail': r.cubeAt(q.pos, [0.04, 0.04, 0.35], [0.9, 0.9, 0.7], yaw, pitch, { emissive: 0.6 }); break;
        case 'dart': r.cubeAt(q.pos, [0.05, 0.05, 0.3], [0.4, 0.9, 0.4], yaw, pitch, { emissive: 0.4 }); break;
        case 'pipe': {
          // tumbling end over end; the fuse tip heats up as it runs down
          const tumble = q.spin + game.time * 9;
          const m = M.mul(M.translate(q.pos[0], q.pos[1], q.pos[2]), M.mul(M.rotY(q.spin * 1.7), M.rotX(tumble)));
          drawPipe(r, m, q.fuse > 0 ? 1 - Math.min(1, q.fuse / 2.5) : 0.5);
          break;
        }
        case 'pipebomb': {
          // lies flat where it landed, until it is thrown by a blast
          const settled = q.stuck || V.len(q.vel) < 0.5;
          // the pipe body already runs along Z, so lying flat needs yaw only
          const m = M.mul(M.translate(q.pos[0], q.pos[1] + (settled ? 0.07 : 0), q.pos[2]),
            settled ? M.rotY(q.spin) : M.mul(M.rotY(q.spin), M.rotX(q.spin + game.time * 7)));
          drawPipebomb(r, m, teamColor(q.team), Math.sin(game.time * 9 + q.spin) > 0);
          break;
        }
        case 'grenade': {
          const g = q.gtype; const col = g === 'conc' ? [0.2, 0.6, 1] : g === 'mirv' ? [0.5, 0.5, 0.1] : g === 'napalm' ? [0.9, 0.4, 0.1] : g === 'nail' ? [0.7, 0.7, 0.4] : g === 'emp' ? [0.9, 0.9, 0.2] : [0.25, 0.35, 0.25];
          r.cubeAt(q.pos, q.small ? [0.14, 0.14, 0.14] : [0.22, 0.26, 0.22], col, q.spin + game.time * 6, 0);
          if (q.nailing) r.sphereAt(q.pos, 0.35, [0.9, 0.9, 0.4], { emissive: 0.8 });
          break;
        }
      }
    }
  }
  function drawParticles() {
    const r = renderer;
    for (const q of game.particles) {
      if (!visible(q.pos, cull.fx)) continue;
      const t = 1 - q.life / q.maxLife;
      // Ease the growth out instead of running it linearly to death. A blast that
      // expands fast and then stops reads as quicker AND is far smaller during the
      // fade, which is the half that was blinding you: the old curve was largest
      // at its most transparent, so the tail covered more screen than the flash.
      const size = q.size + (q.grow || 0) * (1 - (1 - t) * (1 - t));
      const opts = { emissive: q.emissive || 0 };
      // fade: >1 clears sooner (big soft puffs), 1 is the old linear fade
      if (q.alpha !== undefined) opts.alpha = q.alpha * Math.pow(1 - t, q.fade || 1);
      if (q.sphere) r.sphereAt(q.pos, size / 2, q.color, opts); else r.cubeAt(q.pos, [size, size, size], q.color, q.pos[0] * 3 + q.pos[2], 0, opts);
    }
    for (const t of game.tracers) r.beam(t.a, t.b, 0.03, t.color, { emissive: 1, alpha: 0.9 * t.life / t.maxLife });
    for (const f of game.firePatches) r.drawMesh(r.cube, M.mul(M.translate(f.pos[0], f.pos[1] + 0.05, f.pos[2]), M.scale(f.r * 2, 0.06, f.r * 2)), [1, 0.4, 0.1], { alpha: 0.35, emissive: 1 });
  }
  function weaponModelId(w) { return w.model === 'melee' ? (w === WEAPONS.medkit ? 'medkit' : w === WEAPONS.knife ? 'knife' : w === WEAPONS.spanner ? 'spanner' : 'crowbar') : w.model; }
  function weaponState(p, w) {
    const prog = w.rate ? 1 - p.cooldown / w.rate : 1;
    const cycle = prog > 0.3 && prog < 0.85 ? Math.sin((prog - 0.3) / 0.55 * Math.PI) : 0;
    return {
      kick: p.fireAnim, time: game.time, charge: p.charge >= 0 ? p.charge : 0, hasAmmo: !w.ammo || p.ammo[w.ammo] > 0,
      pump: w.model === 'shotgun' || w.model === 'supershotgun' ? cycle : 0,
      bolt: w.model === 'sniper' ? cycle : 0,
      drum: (p.shots || 0) * Math.PI / 3 - (p.fireAnim > 0 ? (1 - Math.min(1, (1 - p.fireAnim) * 2)) : 0) * Math.PI / 3,
      spin: p.acSpin || 0, barrel: p.shots || 0,
      // live pipebombs: the launcher's detonator light pulses red while any are out
      armed: w.model === 'pl' ? game.projectiles.reduce((n, q) => n + (q.type === 'pipebomb' && q.owner === p && !q.dead ? 1 : 0), 0) : 0,
      swing: w.type === 'melee' ? Math.sin(Math.min(1, 1 - p.fireAnim) * Math.PI) * 0.9 : 0,
    };
  }
  function botWeaponState(p, w) { const st = weaponState(p, w); st.spin = p.acSpin || 0; return st; }
  // viewmodel motion state
  const vm = { swayX: 0, swayY: 0, prevYaw: 0, prevPitch: 0, raise: 0, lastWi: -1, lastCls: '', camKick: 0, lastFireSeen: -1 };
  const MUZZLE_T = 0.05;   // how long a muzzle flash is on screen, in seconds
  const CAM_KICK = { shotgun: 0.012, supershotgun: 0.03, rpg: 0.02, gl: 0.015, pl: 0.012, sniper: 0.04, autorifle: 0.004, ac: 0.003, nailgun: 0.002, ic: 0.02, tranq: 0.008, railgun: 0.01 };
  function updateViewModel(dt) {
    const p = human;
    // sway lags the mouse
    const dy = angleDiff(vm.prevYaw, p.yaw), dp = p.pitch - vm.prevPitch; vm.prevYaw = p.yaw; vm.prevPitch = p.pitch;
    vm.swayX = clamp(vm.swayX + dy * 0.6, -0.08, 0.08) * Math.exp(-dt * 8);
    vm.swayY = clamp(vm.swayY + dp * 0.6, -0.08, 0.08) * Math.exp(-dt * 8);
    if (p.wi !== vm.lastWi || p.cls !== vm.lastCls) { vm.lastWi = p.wi; vm.lastCls = p.cls; vm.raise = 1; }
    vm.raise = Math.max(0, vm.raise - dt * 4.5);
    if (p.lastFire !== vm.lastFireSeen) { vm.lastFireSeen = p.lastFire; if (p.alive && p.lastFire > game.time - 0.1) vm.camKick += CAM_KICK[p.weapon().model] || 0; }
    vm.camKick *= Math.exp(-dt * 10);
    // minigun barrel spin
    if (p.alive) { const w = p.weapon(); p.acSpin = (p.acSpin || 0) + (w.model === 'ac' ? (p.spinup / WEAPONS.ac.spinup) * 40 * dt : 0); }
    for (const q of game.players) if (q.isBot && q.alive && q.weapon().model === 'ac') q.acSpin = (q.acSpin || 0) + (q.spinup / WEAPONS.ac.spinup) * 40 * dt;
  }
  // Where the gun sits in your hands this frame: bob, sway, recoil, draw, rumble.
  // Kept out of the draw call so it can be stepped and measured without a
  // renderer — this environment draws the game at about 1.3 fps, far too slow to
  // sample an animation from screenshots. test/feel.test.js drives it directly.
  function viewModelPose(p, w) {
    const moving = Math.hypot(p.vel[0], p.vel[2]) > 0.5 && p.onGround;
    // A proper figure eight: the gun tracks sideways once per stride and bounces
    // twice. One flat axis at a barely-visible amplitude read as a dead prop.
    const speed = Math.min(1, Math.hypot(p.vel[0], p.vel[2]) / p.def.speed);
    const amp = moving ? 0.022 * speed : 0;
    const bobX = Math.sin(p.walkPhase * 2.2) * amp;
    const bobY = Math.abs(Math.cos(p.walkPhase * 2.2)) * amp * 0.9;
    const bobRoll = Math.sin(p.walkPhase * 2.2) * amp * 1.6;
    // Recoil as a damped spring, not a straight slide home: the gun snaps back,
    // overshoots slightly past rest, and settles. p.fireAnim runs 1 -> 0 over the
    // weapon's own recoil time, so the curve's shape is the same on every gun
    // while its duration is not.
    const rt = 1 - p.fireAnim;
    const punch = p.fireAnim > 0 ? Math.exp(-5 * rt) * Math.cos(rt * 9) : 0;
    const heavy = w.model === 'supershotgun' || w.model === 'rpg' || w.model === 'sniper' || w.model === 'ic';
    const kickZ = punch * (heavy ? 0.135 : 0.062);
    const kickPitch = punch * (heavy ? 0.13 : 0.052);
    const kickRoll = punch * (heavy ? 0.05 : 0.02);
    const rumble = p.spinup > 0 ? Math.sin(game.time * 60) * 0.004 : 0;
    const chargeShake = p.charge >= 0 ? Math.sin(game.time * 40) * 0.003 * p.charge : 0;
    const raise = vm.raise * vm.raise;
    const pos = [0.3 + bobX - vm.swayX + chargeShake, -0.29 + bobY - p.landT * 0.08 - raise * 0.35 + vm.swayY * 0.5 + rumble, -0.4 + kickZ];
    if (w.model === 'ac' || w.model === 'flamer') pos[0] -= 0.06;
    vm.pos = pos;
    return { pos, yaw: -0.08 + vm.swayX * 0.4, pitch: kickPitch - raise * 0.6 - vm.swayY * 0.4, roll: bobRoll + kickRoll + raise * 0.35 };
  }
  function drawViewModel() {
    const p = human; if (!p.alive || window.__hideViewmodel) return;
    const r = renderer; const w = p.weapon();
    if (zoomed && w.zoom) return;
    r.beginViewModel();
    const vp = viewModelPose(p, w);
    let base = M.mul(M.translate(vp.pos[0], vp.pos[1], vp.pos[2]),
      M.mul(M.rotY(vp.yaw), M.mul(M.rotX(vp.pitch), M.mul(M.rotZ(vp.roll), M.scale(0.85, 0.85, 0.85)))));
    if (window.__showcase) { drawShowcase(); r.endViewModel(); return; }
    const st = weaponState(p, w);
    drawWeapon(r, base, weaponModelId(w), st);
    // Flash on absolute time since the shot, not on a fraction of the recoil:
    // now that recoil runs at the weapon's own pace, a fireAnim threshold would
    // leave a rocket launcher flashing for a quarter of a second.
    if (game.time - p.lastFire < MUZZLE_T && w.type !== 'melee' && w.type !== 'flame') drawMuzzleFlash(r, base, w.model, game.time * 40);
    // hands
    const SK = SKIN;
    r.drawMesh(r.cube, M.mul(base, M.mul(M.translate(0.0, -0.06, 0.02), M.scale(0.09, 0.09, 0.13))), SK);
    const front = w.model === 'ac' ? [-0.08, 0.15, -0.1] : w.model === 'rpg' || w.model === 'ic' ? [0, -0.02, -0.3] : w.type === 'melee' ? null : [0, -0.05, -0.38];
    if (front) r.drawMesh(r.cube, M.mul(base, M.mul(M.translate(front[0], front[1], front[2]), M.scale(0.09, 0.08, 0.12))), SK);
    if (p.grenPrime) { const g = M.mul(M.translate(-0.5, -0.28, -0.42), M.rotY(0.4)); r.drawMesh(r.cube, M.mul(g, M.scale(0.13, 0.13, 0.13)), SK); r.drawMesh(r.cube, M.mul(g, M.mul(M.translate(0, 0.12, -0.02), M.scale(0.12, 0.14, 0.12))), [0.25, 0.35, 0.25]); }
    r.endViewModel();
  }
  // Debug: draw every weapon model in a grid (window.__showcase = true)
  function drawShowcase() {
    const all = ['crowbar', 'knife', 'spanner', 'medkit', 'shotgun', 'supershotgun', 'nailgun', 'supernailgun', 'rpg', 'gl', 'pl', 'sniper', 'autorifle', 'ac', 'flamer', 'ic', 'tranq', 'railgun'];
    // window.__showcaseIds narrows the grid to a few models, drawn large, for
    // comparing two guns that are supposed to look different from each other.
    const ids = window.__showcaseIds || all;
    const cols = Math.min(ids.length, ids.length <= 3 ? ids.length : 6);
    const scale = ids.length <= 3 ? 2.4 : 0.45, gap = ids.length <= 3 ? 2.3 : 0.5;
    ids.forEach((id, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const m = M.mul(M.translate(-gap * (cols - 1) / 2 + col * gap, 0.45 - row * gap, ids.length <= 3 ? -2.6 : -1.3),
        M.mul(M.rotY(window.__showcaseYaw !== undefined ? window.__showcaseYaw : 0.9), M.scale(scale, scale, scale)));
      drawWeapon(renderer, m, id, { drum: 0.3, spin: 0.5, charge: 1, time: game.time, pump: 0.5, armed: window.__showcaseArmed ? 1 : 0 });
    });
  }

  // Gentle pull toward an enemy near the crosshair. Touch only, and off by default
  // on a desktop where the mouse does not need the help.
  function aimAssist(dt) {
    const p = human;
    if (!p.alive || !settings.aimAssist || !touch.enabled || menu) return;
    const eye = p.eye(), fwd = V.forward(p.yaw, p.pitch);
    let best = null, bestErr = 0.13;
    for (const q of game.players) {
      if (!q.alive || q === p || q.team === p.team || q.disguise === p.team) continue;
      const to = V.sub(q.center(), eye), d = V.len(to);
      if (d > 60) continue;
      const dot = V.dot(V.scale(to, 1 / d), fwd);
      if (dot < 0.9) continue;
      const err = Math.acos(Math.min(1, dot));
      if (err > bestErr) continue;
      if (!game.world.lineClear(eye, q.center())) continue;
      best = q; bestErr = err;
    }
    if (!best) return;
    const c = best.center();
    const rate = settings.aimAssist * 2.0 * dt;
    p.yaw += clamp(angleDiff(p.yaw, V.yawTo(eye, c)), -rate, rate);
    p.pitch = clamp(p.pitch + clamp(V.pitchTo(eye, c) - p.pitch, -rate, rate), -1.5, 1.5);
  }

  // --------------------------------------------------------------- loop
  let last = performance.now(), acc = 0; const DT = 1 / 60;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
    if (menu && human.spawnT === undefined) { acc = 0; } // paused before first join
    let steps = 0;
    while (acc >= DT && steps < 4) {
      humanInput();
      aimAssist(DT);
      for (const [, br] of brains) br.update(DT);
      game.update(DT);
      if (game.roundOver && menu !== 'end') openMenu('end');
      acc -= DT; steps++;
    }
    flashAmt = Math.max(0, flashAmt - dt * 2); shakeAmt = Math.max(0, shakeAmt - dt * 2.5);
    updateViewModel(dt);
    renderer.time = game.time;
    renderer.fov = settings.fov * Math.PI / 180;
    renderer.dprCap = settings.resolution;
    // camera
    let camPos, yaw = human.yaw, pitch = human.pitch;
    if (human.alive) { camPos = human.eye(); pitch += vm.camKick; }
    else if (human.spawnT === undefined) { camPos = [0, 9, -30]; yaw = Math.PI + Math.sin(now / 9000) * 0.6; pitch = -0.25; }
    else { camPos = V.add(human.pos, [0, 0.6, 0]); pitch = Math.max(pitch, -0.3); }
    if (shakeAmt > 0) camPos = V.add(camPos, [rand(-1, 1) * shakeAmt * 0.08, rand(-1, 1) * shakeAmt * 0.08, rand(-1, 1) * shakeAmt * 0.08]);
    const underwater = !!game.world.inWater(camPos);
    renderer.fogColor = underwater ? [0.12, 0.3, 0.38] : [0.62, 0.68, 0.76];
    renderer.fogDensity = underwater ? 0.09 : 0.011;
    audio.setListener(camPos, yaw);
    cull.pos = camPos; cull.fwd = V.forward(yaw, pitch);
    renderer.begin({ pos: camPos, yaw, pitch, zoom: zoomed && human.alive && human.weapon().zoom ? 0.3 : 1 });
    renderer.drawWorld();
    const skinned = drawCharacters();
    if (skinned) { drawProps(); renderer.endSkinned(); drawCharacterWeapons(); drawGroundShadows(); }
    else for (const p of game.players) if (p !== human || !human.alive) drawPlayer(p);
    drawScreens();
    drawFlags(); drawItems(); drawSentries(); drawProjectiles();
    // sniper laser dot
    if (human.alive && human.charge >= 0) { const h = game.trace(human.eye(), V.forward(human.yaw, human.pitch), 300, human); if (h) renderer.sphereAt(h.point, 0.025 + h.dist * 0.0012, [1, 0.1, 0.1], { emissive: 1 }); }
    // ceiling light fixtures glow
    drawParticles();
    renderer.end();
    drawViewModel();
    updateHud();
  }

  // --------------------------------------------------------------- boot
  audio.setVolume(settings.volume); audio.announcer = settings.announcer;
  syncBots();
  openMenu('main');
  $('loading').hidden = true;
  requestAnimationFrame(frame);
  loadScreens();
  window.__game = game; window.__human = human; window.__brains = brains; window.__menuSelect = menuSelect; window.__modelsReady = () => modelsReady; window.__touch = touch; window.__renderer = renderer; window.__vm = vm; window.__screens = screens;
  // One step of sim + viewmodel with no drawing, for test/feel.test.js
  window.__stepFeel = (dt) => { game.update(dt); updateViewModel(dt); return viewModelPose(human, human.weapon()); }; window.__models = models; window.__poses = poses; window.__settings = settings; window.__modelFor = modelFor; window.__setSkin = pickSkinSet; window.__sets = allSets; window.__closeMenu = () => { menu = null; menuEl.hidden = true; }; window.__menu = () => menu;
})();
