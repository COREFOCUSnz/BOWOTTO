// Browser glue: input, HUD, menus, entity drawing, main loop.
(function () {
  'use strict';
  const { V, M, clamp, rand, Renderer, GameAudio, Game, BotBrain, botClassFor, WEAPONS, GRENADES, CLASSES, CLASS_ORDER, BOT_NAMES, BLUE, RED, TEAM_NAMES, TEAM_COLORS, PLAYER_H, EYE_H } = window;
  const $ = (id) => document.getElementById(id);

  const settings = Object.assign({ bots: 4, skill: 0.55, sens: 0.0022, fov: 80, volume: 0.5, announcer: true, name: 'Player' }, JSON.parse(localStorage.getItem('tfc2fort.settings') || '{}'));
  const saveSettings = () => localStorage.setItem('tfc2fort.settings', JSON.stringify(settings));

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
  const game = new Game({ effects, botsPerTeam: settings.bots });
  renderer.setWorld(game.world);
  const human = game.addPlayer(settings.name || 'Player', BLUE, false);
  human.cls = 'soldier'; game.human = human; human.wantsRespawn = false;
  const brains = new Map();

  // --------------------------------------------------------------- bots
  function syncBots() {
    const n = settings.bots;
    for (const team of [BLUE, RED]) {
      const want = team === human.team ? n : n + 1;
      let bots = game.players.filter((p) => p.isBot && p.team === team);
      while (bots.length > want) { const b = bots.pop(); game.removePlayer(b); brains.delete(b); }
      let idx = bots.length;
      while (bots.length < want) {
        const used = new Set(game.players.map((p) => p.name));
        let name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]; let k = 0; while (used.has(name)) name = BOT_NAMES[(k++) % BOT_NAMES.length] + (k > BOT_NAMES.length ? k : '');
        const b = game.addPlayer(name, team, true); b.cls = botClassFor(idx + (team === RED ? 3 : 0)); b.wantsRespawn = true; b.respawnAt = game.time + Math.random() * 2;
        brains.set(b, new BotBrain(game, b, settings.skill)); bots.push(b); idx++;
      }
    }
    for (const [, br] of brains) br.skill = settings.skill;
  }

  // --------------------------------------------------------------- input
  const keys = {}; let mouseDown = [false, false, false]; let locked = false; let zoomed = false;
  let menu = 'main'; // 'main' | 'class' | 'team' | 'settings' | 'help' | null | 'end'
  let showScores = false;
  const lastWeapon = { i: 0 };
  canvas.addEventListener('click', () => { if (!menu) canvas.requestPointerLock(); });
  document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; if (!locked && !menu) openMenu('main'); });
  document.addEventListener('mousemove', (e) => {
    if (!locked || menu) return;
    const s = settings.sens * (zoomed ? 0.35 : 1);
    human.yaw -= e.movementX * s; human.pitch = clamp(human.pitch - e.movementY * s, -1.5, 1.5);
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
    inp.fire = mouseDown[0] && locked; inp.alt = mouseDown[2] && locked;
    inp.gren = [!!keys.KeyG, !!keys.KeyF];
    if (!human.alive && game.time >= human.respawnAt && !menu) human.wantsRespawn = true;
  }

  // --------------------------------------------------------------- menus
  const menuEl = $('menu');
  function openMenu(which) {
    if (window.__traceMenu) console.log('openMenu ' + which + ' ' + new Error().stack.split('\n').slice(1, 4).join(' / '));
    menu = which; menuEl.hidden = false; if (document.pointerLockElement) document.exitPointerLock();
    for (const k in keys) keys[k] = false; mouseDown = [false, false, false]; showScores = false;
    renderMenu();
  }
  function closeMenu() { menu = null; menuEl.hidden = true; canvas.requestPointerLock(); }
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
      </div><div class="hint">Click the game and move the mouse to look. Score: <span class="blue">Blue ${game.score[0]}</span> — <span class="red">Red ${game.score[1]}</span></div>`;
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
        <label>Bots per team <input id="s_bots" type="range" min="0" max="8" value="${settings.bots}"> <span id="s_bots_v">${settings.bots}</span></label>
        <label>Bot skill <select id="s_skill"><option value="0.3"${settings.skill === 0.3 ? ' selected' : ''}>Easy</option><option value="0.55"${settings.skill === 0.55 ? ' selected' : ''}>Normal</option><option value="0.8"${settings.skill === 0.8 ? ' selected' : ''}>Hard</option></select></label>
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
    $('s_bots').addEventListener('input', (e) => { settings.bots = parseInt(e.target.value, 10); $('s_bots_v').textContent = settings.bots; saveSettings(); syncBots(); });
    $('s_skill').addEventListener('change', (e) => { settings.skill = parseFloat(e.target.value); saveSettings(); syncBots(); });
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
    } else if (menu === 'settings' || menu === 'help') { if (k === '0') openMenu('main'); }
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
    const wl = w.model === 'rpg' || w.model === 'sniper' || w.model === 'ac' ? 1.0 : 0.6;
    r.drawMesh(r.cube, M.mul(aim, M.mul(M.translate(0.12 * wide, -0.02, -0.45 - wl / 2), M.scale(w.model === 'ac' ? 0.22 : 0.1, w.model === 'rpg' ? 0.18 : 0.12, wl))), [0.2, 0.2, 0.22]);
    // muzzle flash
    if (p.fireAnim > 0.7 && w.type !== 'melee' && w.type !== 'flame') r.drawMesh(r.cube, M.mul(aim, M.mul(M.translate(0.12 * wide, -0.02, -0.5 - wl), M.scale(0.25, 0.25, 0.25))), [1, 0.9, 0.5], { emissive: 1 });
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
  function drawViewModel() {
    const p = human; if (!p.alive) return;
    const r = renderer; const w = p.weapon();
    if (zoomed && w.zoom) return;
    r.beginViewModel();
    const bob = Math.hypot(p.vel[0], p.vel[2]) > 0.5 && p.onGround ? Math.sin(p.walkPhase * 2.2) * 0.02 : 0;
    const kick = p.fireAnim * 0.12 + (p.spinup > 0 ? Math.sin(game.time * 60) * 0.01 : 0);
    const chargeShake = p.charge >= 0 ? Math.sin(game.time * 40) * 0.004 * p.charge : 0;
    const base = M.mul(M.mul(M.translate(0.3 + chargeShake, -0.27 + bob - p.landT * 0.1, -0.42 + kick), M.rotY(-0.06)), M.scale(0.7, 0.7, 0.7));
    const metal = [0.22, 0.23, 0.25], dark = [0.12, 0.12, 0.13], wood = [0.45, 0.3, 0.15];
    const D = (m, c, o) => r.drawMesh(r.cube, M.mul(base, m), c, o);
    switch (w.model) {
      case 'melee': {
        const swing = p.fireAnim * 0.9;
        const bm = M.mul(M.translate(0.05, -0.05, 0.1), M.rotX(-swing));
        if (w === WEAPONS.medkit) { D(M.mul(bm, M.mul(M.translate(0, 0, -0.35), M.scale(0.25, 0.18, 0.3))), [0.9, 0.9, 0.9]); D(M.mul(bm, M.mul(M.translate(0, 0.095, -0.35), M.scale(0.18, 0.01, 0.06))), [0.9, 0.1, 0.1]); D(M.mul(bm, M.mul(M.translate(0, 0.095, -0.35), M.scale(0.06, 0.01, 0.18))), [0.9, 0.1, 0.1]); }
        else if (w === WEAPONS.knife) { D(M.mul(bm, M.mul(M.translate(0, 0, -0.25), M.scale(0.03, 0.06, 0.16))), dark); D(M.mul(bm, M.mul(M.translate(0, 0, -0.5), M.scale(0.015, 0.05, 0.35))), [0.8, 0.8, 0.85]); }
        else if (w === WEAPONS.spanner) { D(M.mul(bm, M.mul(M.translate(0, 0, -0.35), M.scale(0.05, 0.05, 0.5))), [0.7, 0.7, 0.72]); D(M.mul(bm, M.mul(M.translate(0, 0, -0.62), M.scale(0.14, 0.05, 0.1))), [0.7, 0.7, 0.72]); }
        else { D(M.mul(bm, M.mul(M.translate(0, 0, -0.4), M.scale(0.05, 0.05, 0.75))), [0.7, 0.2, 0.15]); D(M.mul(bm, M.mul(M.translate(0, 0.02, -0.78), M.scale(0.05, 0.1, 0.06))), [0.6, 0.15, 0.1]); }
        break;
      }
      case 'shotgun': D(M.mul(M.translate(0, 0, -0.45), M.scale(0.07, 0.07, 0.9)), metal); D(M.mul(M.translate(0, -0.08, -0.45), M.scale(0.05, 0.05, 0.45)), wood); D(M.mul(M.translate(0, -0.05, 0.05), M.scale(0.08, 0.14, 0.25)), wood); break;
      case 'supershotgun': D(M.mul(M.translate(-0.045, 0, -0.45), M.scale(0.07, 0.07, 0.85)), metal); D(M.mul(M.translate(0.045, 0, -0.45), M.scale(0.07, 0.07, 0.85)), metal); D(M.mul(M.translate(0, -0.05, 0.05), M.scale(0.12, 0.14, 0.25)), wood); break;
      case 'nailgun': D(M.mul(M.translate(0, 0, -0.35), M.scale(0.14, 0.16, 0.6)), metal); D(M.mul(M.translate(0, 0.02, -0.75), M.scale(0.05, 0.05, 0.3)), dark); D(M.mul(M.translate(0, -0.12, -0.3), M.scale(0.1, 0.12, 0.3)), [0.5, 0.45, 0.1]); D(M.mul(M.translate(0, -0.05, 0.05), M.scale(0.08, 0.14, 0.15)), dark); break;
      case 'rpg': D(M.mul(M.translate(-0.05, 0.05, -0.4), M.scale(0.16, 0.16, 1.1)), [0.3, 0.32, 0.28]); D(M.mul(M.translate(-0.05, 0.05, -0.97), M.scale(0.2, 0.2, 0.06)), dark); D(M.mul(M.translate(0, -0.08, 0.05), M.scale(0.08, 0.14, 0.2)), dark); break;
      case 'gl': D(M.mul(M.translate(0, 0, -0.4), M.scale(0.1, 0.1, 0.8)), metal); D(M.mul(M.translate(0, -0.02, -0.15), M.scale(0.2, 0.2, 0.2)), [0.35, 0.3, 0.2]); D(M.mul(M.translate(0, -0.06, 0.08), M.scale(0.08, 0.14, 0.22)), wood); break;
      case 'sniper': D(M.mul(M.translate(0, 0, -0.55), M.scale(0.05, 0.05, 1.2)), metal); D(M.mul(M.translate(0, 0.07, -0.25), M.scale(0.06, 0.06, 0.3)), dark); D(M.mul(M.translate(0, -0.06, 0.02), M.scale(0.07, 0.12, 0.4)), wood); if (p.charge >= 0) D(M.mul(M.translate(0, 0.07, -0.42), M.scale(0.03, 0.03, 0.03)), [1, 0.1, 0.1], { emissive: 1 }); break;
      case 'autorifle': D(M.mul(M.translate(0, 0, -0.45), M.scale(0.07, 0.09, 0.9)), metal); D(M.mul(M.translate(0, -0.12, -0.25), M.scale(0.05, 0.14, 0.08)), dark); D(M.mul(M.translate(0, -0.05, 0.05), M.scale(0.08, 0.13, 0.25)), [0.3, 0.3, 0.3]); break;
      case 'ac': { const spin = p.spinup * 30 * game.time; for (let i = 0; i < 4; i++) { const a = spin + i * Math.PI / 2; D(M.mul(M.translate(-0.05 + Math.cos(a) * 0.07, 0.02 + Math.sin(a) * 0.07, -0.55), M.scale(0.05, 0.05, 0.9)), metal); } D(M.mul(M.translate(-0.05, 0.02, -0.1), M.scale(0.28, 0.24, 0.3)), [0.3, 0.3, 0.32]); D(M.mul(M.translate(-0.05, -0.2, 0.05), M.scale(0.3, 0.14, 0.25)), dark); break; }
      case 'flamer': D(M.mul(M.translate(0, 0, -0.45), M.scale(0.08, 0.08, 0.9)), [0.5, 0.3, 0.1]); D(M.mul(M.translate(0, 0.05, -0.9), M.scale(0.12, 0.12, 0.08)), dark); D(M.mul(M.translate(0.02, -0.1, 0.0), M.scale(0.18, 0.18, 0.35)), [0.6, 0.15, 0.1]); if (p.fireAnim > 0.3) D(M.mul(M.translate(0, 0.05, -1.05), M.scale(0.1, 0.1, 0.25)), [0.3, 0.6, 1], { emissive: 1 }); break;
    }
    // hand
    D(M.mul(M.translate(0.02, -0.14, -0.05), M.scale(0.12, 0.12, 0.16)), SKIN);
    if (p.grenPrime) { const g = M.mul(M.translate(-0.55, -0.28, -0.45), M.rotY(0.4)); D(M.mul(g, M.scale(0.13, 0.13, 0.13)), SKIN); D(M.mul(g, M.mul(M.translate(0, 0.12, -0.02), M.scale(0.12, 0.14, 0.12))), [0.25, 0.35, 0.25]); }
    r.endViewModel();
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
    renderer.time = game.time;
    renderer.fov = settings.fov * Math.PI / 180;
    // camera
    let camPos, yaw = human.yaw, pitch = human.pitch;
    if (human.alive) camPos = human.eye();
    else if (human.spawnT === undefined) { camPos = [0, 9, -30]; yaw = Math.PI + Math.sin(now / 9000) * 0.6; pitch = -0.25; }
    else { camPos = V.add(human.pos, [0, 0.6, 0]); pitch = Math.max(pitch, -0.3); }
    if (shakeAmt > 0) camPos = V.add(camPos, [rand(-1, 1) * shakeAmt * 0.08, rand(-1, 1) * shakeAmt * 0.08, rand(-1, 1) * shakeAmt * 0.08]);
    const underwater = !!game.world.inWater(camPos);
    renderer.fogColor = underwater ? [0.12, 0.3, 0.38] : [0.62, 0.68, 0.76];
    renderer.fogDensity = underwater ? 0.09 : 0.011;
    audio.listener = camPos;
    renderer.begin({ pos: camPos, yaw, pitch, zoom: zoomed && human.alive && human.weapon().zoom ? 0.3 : 1 });
    renderer.drawWorld();
    for (const p of game.players) if (p !== human || !human.alive) drawPlayer(p);
    drawFlags(); drawItems(); drawSentries(); drawProjectiles();
    // sniper laser dot
    if (human.alive && human.charge >= 0) { const h = game.trace(human.eye(), V.forward(human.yaw, human.pitch), 300, human); if (h) renderer.sphereAt(h.point, 0.06 + h.dist * 0.002, [1, 0.1, 0.1], { emissive: 1 }); }
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
  window.__game = game; window.__human = human; window.__brains = brains; window.__menuSelect = menuSelect; window.__closeMenu = () => { menu = null; menuEl.hidden = true; }; window.__menu = () => menu;
})();
