// Browser glue: input, HUD, menus, entity drawing, main loop.
(function () {
  'use strict';
  const { V, M, clamp, rand, angleDiff, drawWeapon, drawMuzzleFlash, ModelSet, Pose, animate, GRIP, BONE, Renderer, GameAudio, Game, BotBrain, botClassFor, DIFFICULTIES, WEAPONS, GRENADES, CLASSES, CLASS_ORDER, BOT_NAMES, BLUE, RED, TEAM_NAMES, TEAM_COLORS, PLAYER_H, EYE_H } = window;
  const $ = (id) => document.getElementById(id);

  const settings = Object.assign({ teamSize: 5, fill: true, difficulty: 'medium', sens: 0.0022, fov: 80, volume: 0.5, announcer: true, name: 'Player' }, JSON.parse(localStorage.getItem('tfc2fort.settings') || '{}'));
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
  const effects = {
    particle(o) { const n = o.count || 1; for (let i = 0; i < n; i++) { const q = Object.assign({ maxLife: o.life, gravity: 0 }, o); q.pos = V.copy(o.pos); q.vel = n > 1 ? [rand(-2, 2), rand(0, 3), rand(-2, 2)] : V.copy(o.vel); game.particles.push(q); } if (game.particles.length > 1500) game.particles.splice(0, game.particles.length - 1500); },
    tracer(a, b, color, life) { game.tracers.push({ a, b, color, life, maxLife: life }); },
    sound(name, pos) { audio.play(name, pos); },
    say(text) { audio.say(text); },
    message(text, team, kind, who) { if (!text) return; if (who && who !== human && kind !== 'flag' && kind !== 'cap' && kind !== 'round') return; messages.push({ text, time: game.time, kind, team }); if (messages.length > 5) messages.shift(); },
    flash(a) { flashAmt = Math.min(1, flashAmt + a); },
    shake(a) { shakeAmt = Math.min(1, shakeAmt + a); },
  };
  const game = new Game({ effects });
  renderer.setWorld(game.world);
  const human = game.addPlayer(settings.name || 'Player', BLUE, false);
  human.cls = 'soldier'; game.human = human; human.wantsRespawn = false;
  const brains = new Map();

  // ---- character models (async; the blocky players stay as the fallback)
  const models = new ModelSet(renderer.gl);
  const poses = new Map();
  let modelsReady = false;
  const CLASS_MODEL = { scout: 'scout', sniper: 'sniper', soldier: 'soldier', demoman: 'soldier', medic: 'medic', hwguy: 'heavy', pyro: 'pyro', spy: 'spy', engineer: 'engineer' };
  const GRIP_FOR = { ac: 'heavy', flamer: 'heavy', rpg: 'launcher', ic: 'launcher', gl: 'launcher', pl: 'launcher', tranq: 'pistol', railgun: 'pistol' };
  if (renderer.skinProg) models.load('assets/models/').then((ok) => { modelsReady = ok; if (ok && menu) renderMenu(); });
  function poseFor(p, model) {
    let e = poses.get(p);
    if (!e || e.model !== model) { e = { model, pose: new Pose(model) }; poses.set(p, e); }
    return e.pose;
  }
  function modelFor(p) {
    if (!modelsReady) return null;
    const cls = p.disguise >= 0 && p.disguiseCls ? p.disguiseCls : p.cls;
    return models.get(CLASS_MODEL[cls] || 'soldier');
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
    setTimeout(() => { if (!locked && !menu && !fallbackLook) enableFallback(); }, 700);
  }
  function enableFallback() {
    if (fallbackLook) return; fallbackLook = true; canvas.style.cursor = 'none';
    effects.message('Mouse capture unavailable here: move the mouse to the screen edges to keep turning', human.team, 'info', human);
  }
  document.addEventListener('pointerlockerror', () => enableFallback());
  let menu = 'main'; // 'main' | 'class' | 'team' | 'settings' | 'help' | null | 'end'
  let showScores = false;
  const lastWeapon = { i: 0 };
  canvas.addEventListener('click', () => { if (!menu && !locked) requestLock(); });
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
    const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    const fwd = V.forward(human.yaw, 0), right = V.right(human.yaw);
    let d = V.madd(V.scale(fwd, f), right, s);
    const l = Math.hypot(d[0], d[2]); if (l > 1) d = V.scale(d, 1 / l);
    if (human.inWater && f !== 0) d[1] = Math.sin(human.pitch) * f;
    inp.dir = d;
    inp.jump = !!keys.Space; inp.up = keys.ControlLeft || keys.ShiftLeft ? -1 : 0;
    inp.fire = mouseDown[0] && (locked || fallbackLook); inp.alt = mouseDown[2] && (locked || fallbackLook);
    if (fallbackLook && !menu) { human.yaw -= edgeTurn[0] * 2.2 * DT; human.pitch = clamp(human.pitch - edgeTurn[1] * 1.2 * DT, -1.5, 1.5); }
    inp.gren = [!!keys.KeyG, !!keys.KeyF];
    if (!human.alive && game.time >= human.respawnAt && !menu) human.wantsRespawn = true;
  }

  // --------------------------------------------------------------- menus
  const menuEl = $('menu');
  function openMenu(which) {
    if (window.__traceMenu) console.log('openMenu ' + which + ' ' + new Error().stack.split('\n').slice(1, 4).join(' / '));
    menu = which; menuEl.hidden = false; canvas.style.cursor = 'crosshair'; edgeTurn[0] = edgeTurn[1] = 0; if (document.pointerLockElement) document.exitPointerLock();
    for (const k in keys) keys[k] = false; mouseDown = [false, false, false]; showScores = false;
    renderMenu();
  }
  function closeMenu() { menu = null; menuEl.hidden = true; if (fallbackLook) canvas.style.cursor = 'none'; requestLock(); }
  function renderMenu() {
    let html = '';
    const title = '<div class="title">TEAM FORTRESS <span>2FORT</span></div><div class="sub">A browser tribute to Team Fortress Classic</div>';
    if (menu === 'main') {
      html = title + `<div class="list">
        <button data-k="1"><b>1</b> ${human.alive || human.spawnT !== undefined ? 'Resume' : 'Join game'}</button>
        <button data-k="2"><b>2</b> Change class</button>
        <button data-k="3"><b>3</b> Change team</button>
        <button data-k="4"><b>4</b> Settings &amp; bots</button>
        <button data-k="5"><b>5</b> Controls</button>
        <button data-k="6"><b>6</b> Restart round</button>
        <button data-k="7"><b>7</b> Fill teams with bots: <span class="${settings.fill ? 'on' : 'off'}">${settings.fill ? 'ON' : 'OFF'}</span> (${settings.teamSize} v ${settings.teamSize})</button>
        <button data-k="8"><b>8</b> Bot difficulty: <span class="diff ${settings.difficulty}">${cap(settings.difficulty)}</span></button>
        <button data-k="9"><b>9</b> Credits</button>
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
        <label>Field of view <input id="s_fov" type="range" min="60" max="110" value="${settings.fov}"> <span id="s_fov_v">${settings.fov}</span></label>
        <label>Volume <input id="s_vol" type="range" min="0" max="1" step="0.05" value="${settings.volume}"></label>
        <label>Announcer voice <input id="s_ann" type="checkbox"${settings.announcer ? ' checked' : ''}></label>
        <button data-k="0"><b>0</b> Back</button></div>`;
    } else if (menu === 'help') {
      html = title + `<div class="list help"><div class="h">Controls</div>
        <table>
        <tr><td>W A S D</td><td>Move</td></tr><tr><td>Mouse</td><td>Look</td></tr><tr><td>Left click</td><td>Fire (hold to charge the sniper rifle)</td></tr>
        <tr><td>Right click</td><td>Sniper zoom / detonate pipebombs</td></tr><tr><td>Space</td><td>Jump / swim up</td></tr><tr><td>Ctrl</td><td>Swim down</td></tr>
        <tr><td>1-4, wheel</td><td>Weapons</td></tr><tr><td>Q</td><td>Last weapon (Spy: disguise)</td></tr>
        <tr><td>G / F</td><td>Hold to prime grenade 1 / 2, release to throw (4 s fuse!)</td></tr>
        <tr><td>E</td><td>Engineer: build a sentry gun</td></tr><tr><td>R</td><td>Demoman: detonate pipebombs</td></tr>
        <tr><td>M / N</td><td>Change class / team</td></tr><tr><td>Tab</td><td>Scoreboard</td></tr><tr><td>Esc</td><td>Menu</td></tr>
        </table>
        <p>Capture the flag: grab the enemy flag from their basement and bring it back to your own flag room. 10 points per capture. Enemy flags return 60 s after being dropped. Your spawn room has resupply bags.</p>
        <button data-k="0"><b>0</b> Back</button></div>`;
    } else if (menu === 'credits') {
      html = title + `<div class="list help"><div class="h">Credits</div>
        <p><b>Characters</b><br>
        "All of the team Fortress 2 red team Mercenaries" by <b>inonshalev42</b>, published on Sketchfab and
        licensed under <b>Creative Commons Attribution</b> (CC BY). The models were rescaled, split per class,
        reduced to a 23-bone rig and re-textured for the web; they are animated procedurally here.</p>
        <p><b>Game</b><br>Built by Core Focus Productions as a tribute to <i>Half-Life: Team Fortress Classic</i> and its
        map 2Fort. Team Fortress is a trademark of Valve Corporation, which is not affiliated with this project.
        No Valve game files are used: the map, weapons, sounds and code are original.</p>
        <p><b>Note</b><br>The character set has no Demoman, so the Demoman uses the Soldier model.</p>
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
      if (k === '2') openMenu('class'); if (k === '3') openMenu('team'); if (k === '4') openMenu('settings'); if (k === '5') openMenu('help');
      if (k === '6') { restart(); closeMenu(); }
      if (k === '7') { settings.fill = !settings.fill; saveSettings(); syncBots(); renderMenu(); }
      if (k === '9') { openMenu('credits'); return; }
      if (k === '8') { settings.difficulty = DIFF_ORDER[(DIFF_ORDER.indexOf(settings.difficulty) + 1) % DIFF_ORDER.length]; saveSettings(); syncBots(); renderMenu(); }
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
    } else if (menu === 'settings' || menu === 'help' || menu === 'credits') { if (k === '0') openMenu('main'); }
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
    hud.tags.innerHTML = tags;
  }

  // --------------------------------------------------------------- drawing
  const SKIN = [0.85, 0.68, 0.55];
  const CLASS_HAT = { scout: [0.2, 0.2, 0.2], sniper: [0.35, 0.3, 0.2], soldier: [0.25, 0.3, 0.2], demoman: [0.15, 0.15, 0.15], medic: [0.95, 0.95, 0.95], hwguy: [0.3, 0.3, 0.3], pyro: [0.1, 0.1, 0.1], spy: [0.2, 0.2, 0.25], engineer: [0.95, 0.8, 0.2] };
  function teamColor(t) { return TEAM_COLORS[t]; }
  // Root matrix placing a character in the world (handles the death topple).
  function playerRoot(p) {
    let m = M.mul(M.translate(p.pos[0], p.pos[1], p.pos[2]), M.rotY(p.yaw));
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
      const model = modelFor(p); if (!model) continue;
      const pose = poseFor(p, model);
      const st = poseState(p); st.root = playerRoot(p);
      animate(pose, st);
      const team = p.disguise >= 0 ? p.disguise : p.team;
      renderer.drawSkinned(model, pose, { textures: models.textures, teamSwap: team === BLUE ? 1 : 0, flash: p.hitFlash > 0 ? 0.45 : 0 });
    }
    renderer.endSkinned();
    return true;
  }
  // The gun a character carries, placed at the right hand and aimed with the player.
  function drawCharacterWeapons() {
    const r = renderer;
    for (const p of game.players) {
      if (!p.alive || (p === human && human.alive)) continue;
      const e = poses.get(p); if (!e || !e.pose.weapon) continue;
      const wp = e.pose.weapon;
      const w = p.weapon();
      const base = M.mul(M.translate(wp.pos[0], wp.pos[1], wp.pos[2]), M.mul(M.rotY(wp.yaw), M.rotX(wp.pitch)));
      drawWeapon(r, base, weaponModelId(w), botWeaponState(p, w));
      if (p.fireAnim > 0.72 && w.type !== 'melee' && w.type !== 'flame') drawMuzzleFlash(r, base, w.model, p.id + game.time * 40);
      if (p.flag) drawFlagCloth(M.mul(M.translate(p.pos[0], p.pos[1], p.pos[2]), M.mul(M.rotY(p.yaw), M.translate(0, 0.9, 0.28))), p.flag.team, true);
    }
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
      if (it.respawnAt > game.time) continue;
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
      const col = teamColor(s.team);
      r.drawMesh(r.cube, M.mul(M.translate(s.pos[0], s.pos[1] + 0.2, s.pos[2]), M.scale(0.9, 0.4, 0.9)), [0.3, 0.3, 0.32]);
      r.drawMesh(r.cube, M.mul(M.translate(s.pos[0], s.pos[1] + 0.6, s.pos[2]), M.scale(0.25, 0.5, 0.25)), [0.25, 0.25, 0.28]);
      const head = M.mul(M.translate(s.pos[0], s.pos[1] + 1.0, s.pos[2]), M.mul(M.rotY(s.yaw), M.rotX(s.pitch || 0)));
      r.drawMesh(r.cube, M.mul(head, M.scale(0.55, 0.35, 0.6)), col);
      for (const x of s.level >= 2 ? [-0.15, 0.15] : [0]) r.drawMesh(r.cube, M.mul(head, M.mul(M.translate(x, 0, -0.55), M.scale(0.1, 0.1, 0.7))), [0.15, 0.15, 0.15]);
      if (s.level >= 3) r.drawMesh(r.cube, M.mul(head, M.mul(M.translate(0, 0.3, -0.1), M.scale(0.5, 0.2, 0.4))), [0.2, 0.2, 0.22]);
    }
    for (const p of game.players) if (p.alive && p.building > 0 && p.buildSpot) { const h = (1 - p.building / 4); r.drawMesh(r.cube, M.mul(M.translate(p.buildSpot[0], p.buildSpot[1] + h * 0.5, p.buildSpot[2]), M.scale(0.9, h, 0.9)), [0.4, 0.4, 0.42]); }
  }
  function drawProjectiles() {
    const r = renderer;
    for (const q of game.projectiles) {
      const v = q.vel, l = V.len(v);
      const yaw = l > 0.01 ? Math.atan2(-v[0], -v[2]) : q.spin, pitch = l > 0.01 ? Math.asin(clamp(v[1] / l, -1, 1)) : 0;
      switch (q.type) {
        case 'rocket': r.cubeAt(q.pos, [0.14, 0.14, 0.6], [0.35, 0.35, 0.35], yaw, pitch); r.cubeAt(V.madd(q.pos, V.norm(v), -0.35), [0.16, 0.16, 0.12], [1, 0.7, 0.2], yaw, pitch, { emissive: 1 }); break;
        case 'ic': r.cubeAt(q.pos, [0.14, 0.14, 0.5], [0.8, 0.3, 0.1], yaw, pitch, { emissive: 0.6 }); break;
        case 'nail': r.cubeAt(q.pos, [0.04, 0.04, 0.35], [0.9, 0.9, 0.7], yaw, pitch, { emissive: 0.6 }); break;
        case 'dart': r.cubeAt(q.pos, [0.05, 0.05, 0.3], [0.4, 0.9, 0.4], yaw, pitch, { emissive: 0.4 }); break;
        case 'pipe': r.cubeAt(q.pos, [0.22, 0.22, 0.22], [0.3, 0.32, 0.3], q.spin + game.time * 8, 0); break;
        case 'pipebomb': r.cubeAt(q.pos, [0.24, 0.16, 0.24], teamColor(q.team), q.spin, 0); r.cubeAt(V.add(q.pos, [0, 0.12, 0]), [0.08, 0.08, 0.08], Math.sin(game.time * 12) > 0 ? [1, 0.2, 0.2] : [0.3, 0.1, 0.1], 0, 0, { emissive: 1 }); break;
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
      const t = 1 - q.life / q.maxLife; const size = q.size + (q.grow || 0) * t;
      const opts = { emissive: q.emissive || 0 };
      if (q.alpha !== undefined) opts.alpha = q.alpha * (1 - t);
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
      swing: w.type === 'melee' ? Math.sin(Math.min(1, 1 - p.fireAnim) * Math.PI) * 0.9 : 0,
    };
  }
  function botWeaponState(p, w) { const st = weaponState(p, w); st.spin = p.acSpin || 0; return st; }
  // viewmodel motion state
  const vm = { swayX: 0, swayY: 0, prevYaw: 0, prevPitch: 0, raise: 0, lastWi: -1, lastCls: '', camKick: 0, lastFireSeen: -1 };
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
  function drawViewModel() {
    const p = human; if (!p.alive || window.__hideViewmodel) return;
    const r = renderer; const w = p.weapon();
    if (zoomed && w.zoom) return;
    r.beginViewModel();
    const moving = Math.hypot(p.vel[0], p.vel[2]) > 0.5 && p.onGround;
    const bobX = moving ? Math.sin(p.walkPhase * 2.2) * 0.012 : 0, bobY = moving ? Math.abs(Math.cos(p.walkPhase * 2.2)) * 0.012 : 0;
    const kickZ = p.fireAnim * (w.model === 'supershotgun' || w.model === 'rpg' || w.model === 'sniper' ? 0.12 : 0.06);
    const kickPitch = p.fireAnim * (w.model === 'supershotgun' || w.model === 'sniper' ? 0.12 : 0.05);
    const rumble = p.spinup > 0 ? Math.sin(game.time * 60) * 0.004 : 0;
    const chargeShake = p.charge >= 0 ? Math.sin(game.time * 40) * 0.003 * p.charge : 0;
    const raise = vm.raise * vm.raise;
    const pos = [0.3 + bobX - vm.swayX + chargeShake, -0.29 + bobY - p.landT * 0.08 - raise * 0.35 + vm.swayY * 0.5 + rumble, -0.4 + kickZ];
    if (w.model === 'ac' || w.model === 'flamer') pos[0] -= 0.06;
    let base = M.mul(M.translate(pos[0], pos[1], pos[2]), M.mul(M.rotY(-0.08 + vm.swayX * 0.4), M.mul(M.rotX(kickPitch - raise * 0.6 - vm.swayY * 0.4), M.scale(0.85, 0.85, 0.85))));
    if (window.__showcase) { drawShowcase(); r.endViewModel(); return; }
    const st = weaponState(p, w);
    drawWeapon(r, base, weaponModelId(w), st);
    if (p.fireAnim > 0.72 && w.type !== 'melee' && w.type !== 'flame') drawMuzzleFlash(r, base, w.model, game.time * 40);
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
    const ids = ['crowbar', 'knife', 'spanner', 'medkit', 'shotgun', 'supershotgun', 'nailgun', 'supernailgun', 'rpg', 'gl', 'pl', 'sniper', 'autorifle', 'ac', 'flamer', 'ic', 'tranq', 'railgun'];
    ids.forEach((id, i) => {
      const col = i % 6, row = Math.floor(i / 6);
      const m = M.mul(M.translate(-1.25 + col * 0.5, 0.45 - row * 0.45, -1.3), M.mul(M.rotY(0.9), M.scale(0.45, 0.45, 0.45)));
      drawWeapon(renderer, m, id, { drum: 0.3, spin: 0.5, charge: 1, time: game.time, pump: 0.5 });
    });
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
      for (const [, br] of brains) br.update(DT);
      game.update(DT);
      if (game.roundOver && menu !== 'end') openMenu('end');
      acc -= DT; steps++;
    }
    flashAmt = Math.max(0, flashAmt - dt * 2); shakeAmt = Math.max(0, shakeAmt - dt * 2.5);
    updateViewModel(dt);
    renderer.time = game.time;
    renderer.fov = settings.fov * Math.PI / 180;
    // camera
    let camPos, yaw = human.yaw, pitch = human.pitch;
    if (human.alive) { camPos = human.eye(); pitch += vm.camKick; }
    else if (human.spawnT === undefined) { camPos = [0, 9, -30]; yaw = Math.PI + Math.sin(now / 9000) * 0.6; pitch = -0.25; }
    else { camPos = V.add(human.pos, [0, 0.6, 0]); pitch = Math.max(pitch, -0.3); }
    if (shakeAmt > 0) camPos = V.add(camPos, [rand(-1, 1) * shakeAmt * 0.08, rand(-1, 1) * shakeAmt * 0.08, rand(-1, 1) * shakeAmt * 0.08]);
    const underwater = !!game.world.inWater(camPos);
    renderer.fogColor = underwater ? [0.12, 0.3, 0.38] : [0.62, 0.68, 0.76];
    renderer.fogDensity = underwater ? 0.09 : 0.011;
    audio.listener = camPos;
    renderer.begin({ pos: camPos, yaw, pitch, zoom: zoomed && human.alive && human.weapon().zoom ? 0.3 : 1 });
    renderer.drawWorld();
    const skinned = drawCharacters();
    if (skinned) drawCharacterWeapons();
    else for (const p of game.players) if (p !== human || !human.alive) drawPlayer(p);
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
  window.__game = game; window.__human = human; window.__brains = brains; window.__menuSelect = menuSelect; window.__modelsReady = () => modelsReady; window.__models = models; window.__closeMenu = () => { menu = null; menuEl.hidden = true; }; window.__menu = () => menu;
})();
