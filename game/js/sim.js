// Game simulation: players, movement, weapons, projectiles, grenades, flags, items,
// sentries, damage. DOM-free so it can run under node for the bench.
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined';
  const { V, clamp, angleDiff, rand } = isNode ? require('./math.js') : root;
  const { WEAPONS, GRENADES, CLASSES, AMMO_MAX, BOT_NAMES } = isNode ? require('./defs.js') : root;
  const { buildMap, BLUE, RED, TEAM_NAMES } = isNode ? require('./map2fort.js') : root;

  const GRAVITY = 20, JUMP_V = 6.7, STEP_H = 0.45, PLAYER_HALF = 0.4, PLAYER_H = 1.8, EYE_H = 1.6;
  const TEAM_COLORS = [[0.2, 0.4, 0.95], [0.95, 0.25, 0.2]];

  let nextId = 1;
  class Player {
    constructor(game, name, team, isBot) {
      this.game = game; this.id = nextId++; this.name = name; this.team = team; this.isBot = isBot;
      this.pos = [0, 0, 0]; this.vel = [0, 0, 0]; this.yaw = 0; this.pitch = 0;
      this.cls = 'soldier'; this.alive = false; this.respawnAt = 0; this.deadAt = -99;
      this.kills = 0; this.deaths = 0; this.caps = 0; this.score = 0;
      this.input = { dir: [0, 0, 0], jump: false, fire: false, alt: false, up: 0, gren: [false, false] };
      this.hp = 0; this.armor = 0; this.ammo = { shells: 0, nails: 0, rockets: 0, cells: 0 }; this.gren = [0, 0];
      this.weapons = []; this.wi = 0; this.cooldown = 0; this.onGround = false; this.inWater = false;
      this.flag = null; this.burn = 0; this.burnBy = null; this.infected = null; this.tranq = 0; this.spinup = 0; this.charge = -1;
      this.grenPrime = null; this.disguise = -1; this.disguiseT = 0; this.sentry = null; this.building = 0; this.lastAttacker = null; this.lastHurt = -99;
      this.walkPhase = 0; this.fireAnim = 0; this.pendingClass = null; this.lastFire = -99; this.landT = 0;
      this.stats = { dmg: 0 };
    }
    get def() { return CLASSES[this.cls]; }
    eye() { return [this.pos[0], this.pos[1] + EYE_H, this.pos[2]]; }
    center() { return [this.pos[0], this.pos[1] + PLAYER_H / 2, this.pos[2]]; }
    weapon() { return WEAPONS[this.weapons[this.wi]]; }
    speed() {
      let s = this.def.speed;
      if (this.spinup > 0 && this.weapons[this.wi] === 'ac') s *= WEAPONS.ac.slow;
      if (this.tranq > 0) s *= 0.5;
      if (this.charge >= 0) s *= 0.5;
      if (this.building > 0) s = 0;
      return s;
    }
    spawn() {
      const g = this.game, d = this.def;
      if (this.pendingClass) { this.cls = this.pendingClass; this.pendingClass = null; }
      const def = this.def;
      const spawns = g.data.spawns[this.team];
      const sp = spawns[Math.floor(Math.random() * spawns.length)];
      this.pos = [sp[0] + rand(-0.5, 0.5), sp[1] + 0.05, sp[2] + rand(-0.5, 0.5)];
      this.vel = [0, 0, 0];
      this.yaw = this.team === BLUE ? Math.PI : 0; this.pitch = 0;
      this.hp = def.hp; this.armor = def.armor; this.ammo = Object.assign({}, def.ammo); this.gren = def.grenN.slice();
      this.weapons = def.weapons.slice(); this.wi = this.weapons.length - 1;
      if (this.cls === 'soldier') this.wi = 3; if (this.cls === 'sniper') this.wi = 1; if (this.cls === 'medic') this.wi = 3;
      this.alive = true; this.cooldown = 0.3; this.flag = null; this.burn = 0; this.infected = null; this.tranq = 0; this.spinup = 0; this.charge = -1;
      this.grenPrime = null; this.disguise = -1; this.building = 0; this.lastAttacker = null; this.spawnT = g.time; this.onGround = true;
      this.hitFlash = 0;
    }
    ammoFor(w) { return w.ammo ? this.ammo[w.ammo] : 999; }
    canFire(w) { return !w.ammo || this.ammo[w.ammo] >= (w.perShot || 1); }
  }

  class Projectile {
    constructor(o) { Object.assign(this, { type: 'rocket', pos: [0, 0, 0], vel: [0, 0, 0], owner: null, dmg: 0, radius: 0, life: 10, fuse: 0, gravity: 0, bounce: 0, dead: false, age: 0, stuck: false, spin: Math.random() * 6 }, o); }
  }

  class Game {
    constructor(opts) {
      opts = opts || {};
      const { world, data } = buildMap();
      this.world = world; this.data = data;
      this.players = []; this.projectiles = []; this.particles = []; this.tracers = []; this.firePatches = []; this.caltrops = []; this.sentries = [];
      this.time = 0; this.score = [0, 0]; this.roundLength = opts.roundLength || 20 * 60; this.roundOver = false; this.capLimit = opts.capLimit || 10;
      this.flags = [0, 1].map((t) => ({ team: t, state: 'home', pos: V.copy(data.flags[t].home), home: data.flags[t].home, carrier: null, returnAt: 0 }));
      this.items = data.items.map((it) => ({ pos: it.pos, type: it.type, respawnAt: 0 }));
      this.resupply = data.resupply;
      this.events = []; // {text, team, time, kind}
      this.killFeed = [];
      this.effects = opts.effects || { particle() {}, tracer() {}, sound() {}, say() {}, message() {}, flash() {}, shake() {} };
      this.bots = null; // set by bots.js
      this.human = null;
      this.rng = Math.random;
      this.botsPerTeam = opts.botsPerTeam || 4;
    }
    addPlayer(name, team, isBot) { const p = new Player(this, name, team, isBot); this.players.push(p); return p; }
    removePlayer(p) { const i = this.players.indexOf(p); if (i >= 0) this.players.splice(i, 1); if (p.flag) this.dropFlag(p); if (p.sentry) this.destroySentry(p.sentry, null); }
    teamCount(t) { return this.players.filter((p) => p.team === t).length; }
    announce(text, team, kind) { this.effects.message(text, team, kind); }

    // ------------------------------------------------------------------ update
    update(dt) {
      this.time += dt;
      if (!this.roundOver) {
        for (const p of this.players) {
          if (!p.alive) { if (this.time >= p.respawnAt && (p.isBot || p.wantsRespawn)) { p.wantsRespawn = false; p.spawn(); this.effects.sound('resupply', p.pos); } continue; }
          this.updatePlayer(p, dt);
        }
        this.updateProjectiles(dt);
        this.updateSentries(dt);
        this.updateFlags(dt);
        this.updateItems(dt);
        this.updateFire(dt);
        if (this.time >= this.roundLength) this.endRound();
      }
      // particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const q = this.particles[i]; q.life -= dt;
        if (q.life <= 0) { this.particles[i] = this.particles[this.particles.length - 1]; this.particles.pop(); continue; }
        q.vel[1] -= (q.gravity || 0) * dt; q.pos = V.madd(q.pos, q.vel, dt);
        if (q.drag) { const f = Math.max(0, 1 - q.drag * dt); q.vel = V.scale(q.vel, f); }
        if (q.collide && this.world.solidAt(q.pos[0], q.pos[1], q.pos[2])) { q.vel = [0, 0, 0]; q.gravity = 0; }
      }
      for (let i = this.tracers.length - 1; i >= 0; i--) { this.tracers[i].life -= dt; if (this.tracers[i].life <= 0) this.tracers.splice(i, 1); }
    }
    endRound() {
      this.roundOver = true;
      const w = this.score[0] > this.score[1] ? 0 : this.score[1] > this.score[0] ? 1 : -1;
      this.announce(w < 0 ? 'Round over — it\'s a draw!' : TEAM_NAMES[w] + ' team wins the round!', w, 'round');
      this.effects.say(w < 0 ? 'Round over. Draw.' : TEAM_NAMES[w] + ' team wins');
    }
    restartRound() {
      this.roundOver = false; this.time = 0; this.score = [0, 0]; this.projectiles = []; this.firePatches = []; this.caltrops = [];
      for (const s of this.sentries.slice()) this.destroySentry(s, null);
      for (const f of this.flags) { f.state = 'home'; f.pos = V.copy(f.home); f.carrier = null; }
      for (const p of this.players) { p.kills = 0; p.deaths = 0; p.caps = 0; p.score = 0; p.flag = null; p.alive = false; p.respawnAt = 0; p.wantsRespawn = true; }
    }

    // ------------------------------------------------------------------ movement
    updatePlayer(p, dt) {
      const W = this.world, inp = p.input;
      p.cooldown = Math.max(0, p.cooldown - dt);
      p.fireAnim = Math.max(0, p.fireAnim - dt * 4);
      if (p.tranq > 0) p.tranq -= dt;
      if (p.hitFlash > 0) p.hitFlash -= dt;
      const center = p.center();
      const water = W.inWater(center);
      const wasInWater = p.inWater; p.inWater = !!water;
      if (p.inWater && !wasInWater && p.vel[1] < -3) this.effects.sound('splash', p.pos);
      if (p.inWater && p.burn > 0) { p.burn = 0; }
      const speed = p.speed();
      const dir = inp.dir; // world-space unit vector (xz), y used in water
      if (water) {
        // swimming
        const wish = [dir[0], inp.jump ? 1 : dir[1] || 0, dir[2]];
        if (inp.up) wish[1] = inp.up;
        const wl = V.len(wish); const wd = wl > 0 ? V.scale(wish, 1 / wl) : [0, 0, 0];
        const ws = speed * 0.55;
        // friction
        const f = Math.max(0, 1 - 4 * dt); p.vel = V.scale(p.vel, f);
        const cur = V.dot(p.vel, wd); const add = ws - cur;
        if (add > 0) p.vel = V.madd(p.vel, wd, Math.min(add, 12 * ws * dt));
        if (wl === 0) p.vel[1] += (-0.8 - p.vel[1]) * Math.min(1, 2 * dt);
        if (inp.jump) {
          const surf = water.max[1];
          if (center[1] > surf - 0.7) {
            // water jump: shove up hard when there is a ledge in front
            const fwd = V.norm([dir[0], 0, dir[2]]);
            const ahead = V.madd(p.pos, fwd, 0.9);
            const ledge = W.solidAt(ahead[0], p.pos[1] + 0.3, ahead[2]) || W.solidAt(ahead[0], p.pos[1] + 0.9, ahead[2]);
            p.vel[1] = ledge ? 6.8 : 3.5;
          } else p.vel[1] = Math.max(p.vel[1], 3.0);
        }
      } else {
        const wd = [dir[0], 0, dir[2]]; const wl = Math.hypot(wd[0], wd[2]);
        if (wl > 0) { wd[0] /= wl; wd[2] /= wl; }
        if (p.onGround) {
          const sp = Math.hypot(p.vel[0], p.vel[2]);
          if (sp > 0) { const control = sp < 2.5 ? 2.5 : sp; const drop = control * 6 * dt; const ns = Math.max(0, sp - drop) / sp; p.vel[0] *= ns; p.vel[2] *= ns; }
          if (wl > 0) { const cur = p.vel[0] * wd[0] + p.vel[2] * wd[2]; const add = speed - cur; if (add > 0) { const a = Math.min(add, 10 * speed * dt); p.vel[0] += wd[0] * a; p.vel[2] += wd[2] * a; } }
          if (inp.jump && !p.jumpHeld) { p.vel[1] = JUMP_V; p.onGround = false; this.effects.sound('jump', p.pos); }
        } else {
          if (wl > 0) { const cur = p.vel[0] * wd[0] + p.vel[2] * wd[2]; const wsp = Math.min(speed, 1.0); const add = wsp - cur; if (add > 0) { const a = Math.min(add, 10 * speed * dt); p.vel[0] += wd[0] * a; p.vel[2] += wd[2] * a; } }
        }
        p.vel[1] -= GRAVITY * dt;
      }
      p.jumpHeld = inp.jump;
      const r = W.moveBox(p.pos, PLAYER_HALF, PLAYER_H, V.scale(p.vel, dt), p.team, STEP_H);
      const wasGround = p.onGround;
      p.onGround = r.flags.ground;
      if (r.flags.hitX) p.vel[0] = 0; if (r.flags.hitZ) p.vel[2] = 0;
      if (r.flags.hitY) { if (p.vel[1] < 0 && !wasGround && !water) { if (p.vel[1] < -12) { const d = Math.round((-p.vel[1] - 12) * 4); this.damage(p, d, null, 'fall'); } this.effects.sound('land', p.pos); p.landT = 0.25; } p.vel[1] = 0; }
      if (p.onGround && p.vel[1] < 0) p.vel[1] = 0;
      p.pos = r.pos;
      if (p.landT > 0) p.landT -= dt;
      // safety net: fell out of the world
      if (p.pos[1] < -20) { this.damage(p, 9999, null, 'fall'); }
      // walk animation
      const hs = Math.hypot(p.vel[0], p.vel[2]);
      if (p.onGround || water) p.walkPhase += hs * dt * 1.6;
      // status effects
      if (p.burn > 0) {
        p.burn -= dt; p.burnTick = (p.burnTick || 0) - dt;
        if (p.burnTick <= 0) { p.burnTick = 0.5; this.damage(p, 3, p.burnBy, 'burn'); }
        if (Math.random() < dt * 20) this.effects.particle({ pos: V.add(p.center(), [rand(-0.3, 0.3), rand(-0.6, 0.6), rand(-0.3, 0.3)]), vel: [rand(-0.5, 0.5), rand(1, 2.5), rand(-0.5, 0.5)], life: 0.5, size: 0.25, color: [1, rand(0.3, 0.7), 0.1], emissive: 1 });
      }
      if (p.infected) {
        p.infTick = (p.infTick || 0) - dt;
        if (p.infTick <= 0) { p.infTick = 2; this.damage(p, 4, p.infected, 'infection'); for (const q of this.players) if (q !== p && q.alive && q.team === p.team && !q.infected && V.dist(q.pos, p.pos) < 1.3) q.infected = p.infected; }
      }
      if (p.disguiseT > 0) { p.disguiseT -= dt; if (p.disguiseT <= 0) { p.disguise = p.pendingDisguise; this.effects.message(p === this.human ? 'Disguised as ' + TEAM_NAMES[1 - p.team] + ' ' + CLASSES[p.disguiseCls].name : '', p.team, 'info', p); } }
      if (p.building > 0) { p.building -= dt; if (p.building <= 0) this.finishSentry(p); }
      // weapons
      this.updateWeapon(p, dt);
      // primed grenade
      if (p.grenPrime) {
        p.grenPrime.t -= dt;
        if (p.grenPrime.t <= 0) { const g = p.grenPrime; p.grenPrime = null; this.grenadeExplode(this.makeGrenade(p, g.type, [0, 0, 0]), true); }
        else if (!p.input.gren[p.grenPrime.slot]) this.throwGrenade(p);
      }
      // caltrops
      for (const c of this.caltrops) if (c.team !== p.team && V.distXZ(c.pos, p.pos) < 0.5 && Math.abs(c.pos[1] - p.pos[1]) < 1) { c.dead = true; this.damage(p, 10, c.owner, 'caltrop'); p.tranq = Math.max(p.tranq, 3); }
      this.caltrops = this.caltrops.filter((c) => !c.dead && c.until > this.time);
    }

    // ------------------------------------------------------------------ weapons
    ejectShell(p, n) {
      const right = V.right(p.yaw), fwd = V.forward(p.yaw, p.pitch);
      for (let i = 0; i < n; i++) this.effects.particle({ pos: V.madd(V.madd(p.eye(), right, 0.22), fwd, 0.35), vel: V.madd(V.madd(V.scale(right, rand(1.5, 2.5)), [0, rand(1.5, 2.5), 0], 1), p.vel, 1), life: 1.2, size: 0.035, color: [0.8, 0.65, 0.25], gravity: 14, collide: true });
    }
    updateWeapon(p, dt) {
      const w = p.weapon(); const inp = p.input;
      if (p.pumpAt && this.time >= p.pumpAt) { p.pumpAt = 0; this.effects.sound(w.model === 'sniper' ? 'bolt' : 'pump', p.pos); }
      if (p.spinup > 0 && !(inp.fire && p.weapons[p.wi] === 'ac')) p.spinup = Math.max(0, p.spinup - dt * 2);
      if (w.type === 'charge') {
        if (inp.fire && p.charge < 0 && p.cooldown <= 0 && p.canFire(w)) { p.charge = 0; }
        if (p.charge >= 0) { p.charge += dt; if (!inp.fire) { this.fireSniper(p, w); p.charge = -1; } }
        return;
      }
      if (w.spinup) {
        if (inp.fire) { if (p.spinup === 0) this.effects.sound('spinup', p.pos); p.spinup = Math.min(w.spinup, p.spinup + dt); if (p.spinup < w.spinup) return; }
      }
      if (inp.alt && p.weapons[p.wi] === 'pl' && p.cooldown <= 0) { this.detonatePipes(p); p.cooldown = 0.3; return; }
      if (inp.fire && p.cooldown <= 0) this.fire(p, w);
    }
    fire(p, w) {
      if (!p.canFire(w)) { if (p === this.human && p.cooldown <= 0) { this.effects.sound('click', null); p.cooldown = 0.4; } return; }
      p.cooldown = w.rate; p.fireAnim = 1; p.lastFire = this.time; p.shots = (p.shots || 0) + 1;
      if (w.ammo) p.ammo[w.ammo] -= w.perShot || 1;
      if (w.model === 'shotgun' || w.model === 'supershotgun') p.pumpAt = this.time + w.rate * 0.35;
      if (w.ammo === 'shells' && w.type === 'hitscan') this.ejectShell(p, w.model === 'ac' ? 1 : w.perShot || 1);
      if (p.disguise >= 0) { p.disguise = -1; }
      const eye = p.eye(); const fwd = V.forward(p.yaw, p.pitch);
      switch (w.type) {
        case 'hitscan': {
          this.effects.sound(w.model === 'ac' ? 'ac' : w.model === 'autorifle' ? 'autorifle' : w.model === 'supershotgun' ? 'supershotgun' : 'shotgun', p.pos);
          for (let i = 0; i < w.pellets; i++) {
            const d = this.spreadDir(fwd, w.spread);
            this.hitscan(p, eye, d, w.dmg, 200, w.pellets <= 3 || i === 0, w);
          }
          break;
        }
        case 'proj': this.effects.sound(w.proj === 'nail' || w.proj === 'dart' ? 'nail' : w.proj === 'rocket' || w.proj === 'ic' ? 'rocket' : 'gl', p.pos); this.launch(p, w, eye, fwd); break;
        case 'flame': this.flame(p, w, eye, fwd); break;
        case 'melee': this.melee(p, w, eye, fwd); break;
      }
    }
    spreadDir(fwd, spread) {
      if (!spread) return fwd;
      const r = V.right(Math.atan2(-fwd[0], -fwd[2])); const u = V.norm(V.cross(r, fwd));
      const a = Math.random() * Math.PI * 2, m = Math.sqrt(Math.random()) * spread;
      return V.norm(V.madd(V.madd(fwd, r, Math.cos(a) * m), u, Math.sin(a) * m));
    }
    // Ray vs players + sentries + world. Returns nearest hit.
    trace(o, d, maxDist, ignore) {
      const wh = this.world.raycast(o, d, maxDist);
      let best = wh ? { dist: wh.dist, point: wh.point, normal: wh.normal, world: true } : null;
      const testBox = (min, max) => {
        let t0 = 0, t1 = best ? best.dist : maxDist;
        for (let i = 0; i < 3; i++) {
          if (Math.abs(d[i]) < 1e-9) { if (o[i] < min[i] || o[i] > max[i]) return -1; continue; }
          let a = (min[i] - o[i]) / d[i], b = (max[i] - o[i]) / d[i]; if (a > b) { const t = a; a = b; b = t; }
          t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return -1;
        }
        return t0;
      };
      for (const q of this.players) {
        if (!q.alive || q === ignore) continue;
        const t = testBox([q.pos[0] - PLAYER_HALF, q.pos[1], q.pos[2] - PLAYER_HALF], [q.pos[0] + PLAYER_HALF, q.pos[1] + PLAYER_H, q.pos[2] + PLAYER_HALF]);
        if (t >= 0 && (!best || t < best.dist)) best = { dist: t, point: V.madd(o, d, t), player: q };
      }
      for (const s of this.sentries) {
        if (s === ignore) continue;
        const t = testBox([s.pos[0] - 0.5, s.pos[1], s.pos[2] - 0.5], [s.pos[0] + 0.5, s.pos[1] + 1.3, s.pos[2] + 0.5]);
        if (t >= 0 && (!best || t < best.dist)) best = { dist: t, point: V.madd(o, d, t), sentry: s };
      }
      return best;
    }
    hitscan(p, o, d, dmg, maxDist, showTracer, w) {
      const h = this.trace(o, d, maxDist, p);
      const end = h ? h.point : V.madd(o, d, maxDist);
      if (showTracer) this.effects.tracer(V.madd(V.madd(o, d, 0.6), V.right(p.yaw), 0.25), end, w && w.tracer ? [0.4, 0.9, 1] : [1, 0.9, 0.6], w && w.tracer ? 0.25 : 0.06);
      if (!h) return;
      if (h.player) this.damage(h.player, dmg, p, 'hitscan', d, dmg * 0.02);
      else if (h.sentry) this.damageSentry(h.sentry, dmg, p);
      else this.impact(h.point, h.normal);
    }
    impact(point, normal) {
      for (let i = 0; i < 3; i++) this.effects.particle({ pos: point, vel: V.madd(V.scale(normal, rand(1, 4)), [rand(-2, 2), rand(-1, 2), rand(-2, 2)], 1), life: rand(0.25, 0.5), size: 0.04, color: [1, 0.85, 0.4], emissive: 1, gravity: 12 });
      this.effects.particle({ pos: V.madd(point, normal, 0.05), vel: V.scale(normal, 0.6), life: 0.5, size: 0.15, grow: 0.35, color: [0.6, 0.58, 0.55], alpha: 0.45, sphere: true });
    }
    fireSniper(p, w) {
      if (!p.canFire(w) || p.cooldown > 0) return;
      p.cooldown = w.rate; p.fireAnim = 1; p.ammo.shells -= 1; p.lastFire = this.time; p.shots = (p.shots || 0) + 1; p.pumpAt = this.time + w.rate * 0.3; this.ejectShell(p, 1);
      const t = clamp(p.charge / w.chargeTime, 0, 1);
      const dmg = w.dmg + (w.maxDmg - w.dmg) * t;
      const eye = p.eye(), fwd = V.forward(p.yaw, p.pitch);
      this.effects.sound('sniper', p.pos);
      const h = this.trace(eye, fwd, 300, p);
      this.effects.tracer(V.madd(V.madd(eye, fwd, 0.6), V.right(p.yaw), 0.2), h ? h.point : V.madd(eye, fwd, 300), [1, 0.6, 0.5], 0.12);
      if (h && h.player) {
        const head = h.point[1] > h.player.pos[1] + 1.45;
        const leg = h.point[1] < h.player.pos[1] + 0.7;
        let d = dmg; if (head) d *= 2; if (leg) { d *= 0.5; h.player.tranq = Math.max(h.player.tranq, 4); }
        this.damage(h.player, Math.round(d), p, head ? 'headshot' : 'sniper', fwd, 3);
      } else if (h && h.sentry) this.damageSentry(h.sentry, dmg, p);
    }
    launch(p, w, eye, fwd) {
      const proj = w.proj;
      const start = V.madd(V.madd(eye, fwd, 0.4), [0, -0.15, 0], 1);
      const base = { type: proj, owner: p, dmg: w.dmg, radius: w.radius || 0, pos: start, vel: V.scale(fwd, w.speed), team: p.team };
      if (proj === 'nail') { this.projectiles.push(new Projectile(Object.assign(base, { life: 2.5, pos: V.madd(start, V.right(p.yaw), (w.perShot === 2 ? 0.12 : 0.12) * (Math.random() < 0.5 ? 1 : -1)) }))); }
      else if (proj === 'dart') this.projectiles.push(new Projectile(Object.assign(base, { life: 3, slow: w.slow })));
      else if (proj === 'rocket' || proj === 'ic') { this.projectiles.push(new Projectile(Object.assign(base, { life: 8, burn: w.burn || 0 }))); }
      else if (proj === 'pipe') this.projectiles.push(new Projectile(Object.assign(base, { life: 30, fuse: w.fuse, gravity: GRAVITY * 0.9, bounce: 0.35, vel: V.madd(V.scale(fwd, w.speed), [0, 2.5, 0], 1), contact: true })));
      else if (proj === 'pipebomb') {
        const mine = this.projectiles.filter((q) => q.type === 'pipebomb' && q.owner === p);
        if (mine.length >= 8) mine[0].dead = true, this.explodeProjectile(mine[0]);
        this.projectiles.push(new Projectile(Object.assign(base, { life: 60, fuse: 0, gravity: GRAVITY * 0.9, bounce: 0.3, vel: V.madd(V.scale(fwd, w.speed), [0, 2.5, 0], 1) })));
      }
    }
    detonatePipes(p) {
      let any = false;
      for (const q of this.projectiles) if (q.type === 'pipebomb' && q.owner === p && !q.dead) { q.dead = true; this.explodeProjectile(q); any = true; }
      if (any) this.effects.sound('beep', p.pos);
    }
    flame(p, w, eye, fwd) {
      this.effects.sound('flame', p.pos);
      for (let i = 0; i < 4; i++) {
        const d = this.spreadDir(fwd, 0.12);
        this.effects.particle({ pos: V.madd(V.madd(eye, fwd, 0.6), [0, -0.25, 0], 1), vel: V.madd(V.scale(d, 9 + Math.random() * 3), p.vel, 1), life: 0.55, size: 0.3, grow: 1.2, color: [1, rand(0.35, 0.75), 0.1], emissive: 1, drag: 2 });
      }
      for (const q of this.players) {
        if (!q.alive || q === p || q.team === p.team) continue;
        const to = V.sub(q.center(), eye), dist = V.len(to);
        if (dist > w.range) continue;
        if (V.dot(V.scale(to, 1 / dist), fwd) < Math.cos(0.4)) continue;
        if (!this.world.lineClear(eye, q.center())) continue;
        if (!q.inWater) { q.burn = Math.max(q.burn, w.burn); q.burnBy = p; }
        this.damage(q, w.dmg, p, 'flame', fwd, 0.5);
      }
      for (const s of this.sentries) if (s.team !== p.team && V.dist(s.pos, eye) < w.range) this.damageSentry(s, w.dmg, p);
    }
    melee(p, w, eye, fwd) {
      p.cooldown = w.rate;
      const h = this.trace(eye, fwd, w.range, p);
      this.effects.sound('melee', p.pos);
      if (!h) return;
      if (h.player) {
        const q = h.player;
        if (w.heal !== undefined) {
          if (q.team === p.team) {
            const max = q.def.hp; const before = q.hp;
            q.hp = Math.min(max, q.hp + w.heal); q.infected = null; q.burn = 0; q.tranq = 0;
            if (q.hp > before) { this.effects.sound('heal', q.pos); if (p === this.human) this.effects.message('Healed ' + q.name, p.team, 'info', p); }
            if (p.isBot === false || true) p.score += 1;
            return;
          }
          q.infected = p; this.damage(q, w.dmg, p, 'medkit', fwd, 1); return;
        }
        if (q.team === p.team) return;
        if (w.backstab) {
          const facing = V.forward(q.yaw, 0); const toQ = V.norm(V.sub(q.pos, p.pos));
          if (V.dot(facing, toQ) > 0.35) { this.damage(q, 999, p, 'backstab', fwd, 0); return; }
        }
        this.damage(q, w.dmg, p, 'melee', fwd, 2);
      } else if (h.sentry) {
        const s = h.sentry;
        if (s.team === p.team && w === WEAPONS.spanner) { if (p.ammo.cells >= 10 && s.hp < s.maxHp) { p.ammo.cells -= 10; s.hp = Math.min(s.maxHp, s.hp + 40); this.effects.sound('build', s.pos); } else if (s.owner === p && p.ammo.cells >= 130 && s.level < 3) { p.ammo.cells -= 130; s.level++; s.maxHp += 50; s.hp = s.maxHp; this.effects.sound('resupply', s.pos); this.effects.message('Sentry upgraded to level ' + s.level, p.team, 'info', p); } }
        else if (s.team !== p.team) this.damageSentry(s, w.dmg, p);
      } else {
        this.effects.particle({ pos: h.point, vel: [rand(-1, 1), rand(1, 2), rand(-1, 1)], life: 0.3, size: 0.05, color: [0.8, 0.8, 0.7], gravity: 10 });
      }
    }
    // ------------------------------------------------------------------ grenades
    primeGrenade(p, slot) {
      if (p.grenPrime || !p.alive) return;
      const type = p.def.gren[slot]; if (!type || p.gren[slot] <= 0) return;
      p.gren[slot]--; p.grenPrime = { slot, type, t: GRENADES[type].fuse };
      this.effects.sound('pin', p.pos);
    }
    makeGrenade(p, type, vel) {
      const g = GRENADES[type];
      return new Projectile({ type: 'grenade', gtype: type, owner: p, team: p.team, dmg: g.dmg, radius: g.radius, pos: V.madd(p.eye(), [0, -0.2, 0], 1), vel, life: 30, fuse: 0, gravity: GRAVITY, bounce: 0.45 });
    }
    throwGrenade(p) {
      const g = p.grenPrime; p.grenPrime = null;
      const fwd = V.forward(p.yaw, p.pitch);
      const gren = this.makeGrenade(p, g.type, V.madd(V.madd(V.scale(fwd, 15), [0, 3, 0], 1), p.vel, 0.6));
      gren.fuse = Math.max(0.05, g.t); gren.pos = V.madd(gren.pos, fwd, 0.5);
      if (g.type === 'caltrop') { gren.fuse = 0.4; }
      this.projectiles.push(gren);
      if (p.disguise >= 0) p.disguise = -1;
    }
    grenadeExplode(g, inHand) {
      const def = GRENADES[g.gtype]; const p = g.owner;
      switch (g.gtype) {
        case 'conc':
          this.effects.sound('conc', g.pos); this.effects.particle({ pos: g.pos, vel: [0, 0, 0], life: 0.35, size: 1, grow: 14, color: [0.6, 0.8, 1], emissive: 1, alpha: 0.5, sphere: true });
          for (const q of this.players) { if (!q.alive) continue; const d = V.dist(q.center(), g.pos); if (d > def.radius) continue; const dir = V.norm(V.sub(q.center(), g.pos)); dir[1] += 0.55; const k = def.push * (1 - d / def.radius * 0.5); q.vel = V.madd(q.vel, V.norm(dir), k); q.onGround = false; if (q === this.human) this.effects.shake(0.6); if (q.team !== p.team) q.concT = 4; }
          return;
        case 'mirv':
          this.explode(g.pos, def.dmg, def.radius, p, 'mirv');
          for (let i = 0; i < def.bomblets; i++) { const b = this.makeGrenade(p, 'frag', [rand(-4, 4), rand(4, 8), rand(-4, 4)]); b.pos = V.add(g.pos, [0, 0.3, 0]); b.fuse = rand(1, 2.2); b.small = true; b.dmg = 60; b.radius = 3.5; this.projectiles.push(b); }
          return;
        case 'napalm':
          this.explode(g.pos, def.dmg, def.radius, p, 'napalm');
          this.firePatches.push({ pos: V.copy(g.pos), r: 2.8, until: this.time + def.fire, owner: p });
          return;
        case 'nail':
          if (!g.nailing) { g.nailing = true; g.fuse = 3; g.gravity = 0; g.vel = [0, 0, 0]; g.pos[1] += 1.2; g.dead = false; g.life = 10; this.projectiles.push(g); return; }
          this.explode(g.pos, def.dmg, def.radius, p, 'nail grenade'); return;
        case 'caltrop':
          for (let i = 0; i < 6; i++) this.caltrops.push({ pos: V.add(g.pos, [rand(-1.2, 1.2), 0, rand(-1.2, 1.2)]), team: p.team, owner: p, until: this.time + 25 });
          return;
        case 'emp':
          this.explode(g.pos, def.dmg, def.radius, p, 'EMP', { emp: true }); return;
        default:
          this.explode(g.pos, def.dmg, def.radius, p, inHand ? 'own grenade' : 'grenade');
      }
    }
    // ------------------------------------------------------------------ projectiles
    updateProjectiles(dt) {
      const W = this.world;
      for (const q of this.projectiles) {
        if (q.dead) continue;
        q.age += dt; q.life -= dt;
        if (q.life <= 0) { q.dead = true; if (q.type === 'pipebomb' || q.type === 'grenade' || q.type === 'pipe') this.explodeProjectile(q); continue; }
        if (q.fuse > 0) { q.fuse -= dt; if (q.fuse <= 0) { q.dead = true; this.explodeProjectile(q); continue; } }
        if (q.type === 'grenade' && q.nailing) {
          q.nailT = (q.nailT || 0) - dt; q.spin += dt * 12;
          if (q.nailT <= 0) { q.nailT = 0.15; for (let i = 0; i < 4; i++) { const a = q.spin + i * Math.PI / 2; const d = [Math.cos(a), rand(-0.1, 0.1), Math.sin(a)]; this.projectiles.push(new Projectile({ type: 'nail', owner: q.owner, team: q.team, dmg: 8, pos: V.copy(q.pos), vel: V.scale(V.norm(d), 40), life: 1.5 })); } }
          continue;
        }
        if (q.stuck) continue;
        if (q.gravity) q.vel[1] -= q.gravity * dt;
        const speed = V.len(q.vel); const steps = Math.max(1, Math.ceil(speed * dt / 0.2));
        const sdt = dt / steps;
        for (let s = 0; s < steps && !q.dead; s++) {
          const next = V.madd(q.pos, q.vel, sdt);
          // players
          for (const pl of this.players) {
            if (!pl.alive || pl.team === q.team) continue; // projectiles pass through teammates and the shooter
            const m = 0.15;
            if (next[0] > pl.pos[0] - PLAYER_HALF - m && next[0] < pl.pos[0] + PLAYER_HALF + m && next[1] > pl.pos[1] - m && next[1] < pl.pos[1] + PLAYER_H + m && next[2] > pl.pos[2] - PLAYER_HALF - m && next[2] < pl.pos[2] + PLAYER_HALF + m) {
              q.dead = true; q.pos = next;
              if (q.type === 'nail') this.damage(pl, q.dmg, q.owner, 'nail', V.norm(q.vel), 0.3);
              else if (q.type === 'dart') { this.damage(pl, q.dmg, q.owner, 'tranq', V.norm(q.vel), 0.3); pl.tranq = Math.max(pl.tranq, q.slow); }
              else if (q.type === 'pipebomb') { q.dead = false; }
              else if (q.type === 'grenade' && !q.contact) { q.dead = false; }
              else this.explodeProjectile(q);
              break;
            }
          }
          if (q.dead) break;
          for (const se of this.sentries) {
            if (se.team === q.team) continue;
            if (Math.abs(next[0] - se.pos[0]) < 0.6 && next[1] > se.pos[1] - 0.1 && next[1] < se.pos[1] + 1.4 && Math.abs(next[2] - se.pos[2]) < 0.6) {
              q.dead = true; q.pos = next;
              if (q.type === 'nail' || q.type === 'dart') this.damageSentry(se, q.dmg, q.owner); else this.explodeProjectile(q);
              break;
            }
          }
          if (q.dead) break;
          if (W.pointSolid(next)) {
            if (q.bounce) {
              // find blocked axis
              const nx = [next[0], q.pos[1], q.pos[2]], ny = [q.pos[0], next[1], q.pos[2]], nz = [q.pos[0], q.pos[1], next[2]];
              let bounced = false;
              if (W.pointSolid(nx)) { q.vel[0] *= -q.bounce; bounced = true; }
              if (W.pointSolid(nz)) { q.vel[2] *= -q.bounce; bounced = true; }
              if (W.pointSolid(ny) || !bounced) {
                const ramp = W.pointInRamp(ny);
                if (ramp) { const n = W.rampNormal(ramp); const vn = V.dot(q.vel, n); q.vel = V.sub(q.vel, V.scale(n, vn * (1 + q.bounce))); }
                else q.vel[1] *= -q.bounce;
                q.vel[0] *= 0.7; q.vel[2] *= 0.7; bounced = true;
              }
              if (V.len(q.vel) > 1.5) this.effects.sound('bounce', q.pos);
              if (V.len(q.vel) < 0.8 && (q.type === 'pipebomb' || q.type === 'grenade')) { q.vel = [0, 0, 0]; q.stuck = true; }
              if (q.type === 'pipe' && q.contact && q.age > 0.1 && speed > 1) { /* pipes keep bouncing until fuse */ }
              break;
            }
            q.dead = true; this.explodeProjectile(q); break;
          }
          q.pos = next;
        }
        if ((q.type === 'rocket' || q.type === 'ic') && q.age > 0.08) this.effects.particle({ pos: V.copy(q.pos), vel: [rand(-0.3, 0.3), rand(0.2, 0.8), rand(-0.3, 0.3)], life: 0.5, size: 0.12, grow: 0.4, color: q.type === 'ic' ? [1, 0.5, 0.2] : [0.75, 0.75, 0.75], alpha: 0.5 });
      }
      this.projectiles = this.projectiles.filter((q) => !q.dead);
    }
    explodeProjectile(q) {
      if (q.type === 'nail' || q.type === 'dart') { this.effects.particle({ pos: q.pos, vel: [0, 1, 0], life: 0.2, size: 0.05, color: [0.9, 0.9, 0.8], gravity: 8 }); return; }
      if (q.type === 'grenade') { this.grenadeExplode(q, false); return; }
      if (q.type === 'ic') { this.explode(q.pos, q.dmg, q.radius, q.owner, 'incendiary', { burn: q.burn }); this.firePatches.push({ pos: V.copy(q.pos), r: 1.8, until: this.time + 3, owner: q.owner }); return; }
      this.explode(q.pos, q.dmg, q.radius, q.owner, q.type === 'rocket' ? 'rocket' : q.type === 'pipe' ? 'pipe' : 'pipebomb');
    }
    // The visible blast: a hot core, a ring of fire puffs and some rising smoke.
    // One big sphere used to do this job, and it showed — a perfect faceted ball
    // that at radius*2.2 covered the whole screen. Offset puffs of differing size
    // and lifetime break the silhouette AND clear the view sooner, because none of
    // them is ever as large as the single sphere was.
    blastPuffs(pos, radius) {
      const fx = this.effects;
      let detail = fx.detail ? fx.detail() : 1;
      // A demoman detonating eight pipebombs fires eight blasts in one tick, and
      // eight full clusters on top of each other is a wall you cannot see through
      // — far worse than any single rocket. Blasts that land near one another
      // within the same moment thin out, so a chain reads as one big detonation
      // instead of eight stacked ones. Damage is untouched; this is visuals only.
      const recent = this._recentBlasts || (this._recentBlasts = []);
      while (recent.length && recent[0].t < this.time - 0.12) recent.shift();
      let near = 0;
      for (const b of recent) if (V.dist(b.pos, pos) < radius * 1.5) near++;
      recent.push({ pos: V.copy(pos), t: this.time });
      if (near >= 4) return 0;                     // the view is already full of fire
      if (near > 0) detail *= near >= 2 ? 0.34 : 0.6;
      const at = (spread, y) => [pos[0] + rand(-spread, spread), pos[1] + rand(-spread * 0.6, spread * 0.6) + (y || 0), pos[2] + rand(-spread, spread)];
      // white-hot core, gone almost immediately — this is the "hit" you read
      fx.particle({ pos: V.copy(pos), vel: [0, 0, 0], life: 0.12, size: 0.4, grow: radius * 0.55, color: [1, 0.95, 0.75], emissive: 1, alpha: 0.9, fade: 2.2, sphere: true });
      const fire = Math.max(1, Math.round(5 * detail));
      for (let i = 0; i < fire; i++)
        fx.particle({ pos: at(radius * 0.24), vel: [rand(-1.4, 1.4), rand(0.4, 1.8), rand(-1.4, 1.4)], life: rand(0.18, 0.30),
          size: 0.45, grow: radius * rand(0.55, 0.80), color: [1, rand(0.45, 0.75), rand(0.1, 0.25)], emissive: 1, alpha: 0.72, fade: 1.7, sphere: true });
      const smoke = Math.max(detail < 0.5 ? 0 : 1, Math.round(3 * detail));
      for (let i = 0; i < smoke; i++)
        fx.particle({ pos: at(radius * 0.26, 0.25), vel: [rand(-0.8, 0.8), rand(0.9, 2.0), rand(-0.8, 0.8)], life: rand(0.4, 0.6),
          size: 0.55, grow: radius * rand(0.36, 0.52), color: [0.3, 0.28, 0.26], alpha: 0.28, fade: 1.9, sphere: true });
      return detail;
    }
    explode(pos, dmg, radius, attacker, kind, opts) {
      opts = opts || {};
      this.effects.sound('explosion', pos);
      // the sparks carry the punch, and they are small enough to never block a
      // shot — but they still cost a draw call each, so they thin with the puffs
      const detail = this.blastPuffs(pos, radius);
      const sparks = Math.round(16 * detail);
      for (let i = 0; i < sparks; i++) this.effects.particle({ pos: V.copy(pos), vel: [rand(-7, 7), rand(1, 10), rand(-7, 7)], life: rand(0.3, 0.7), size: 0.14, color: [1, rand(0.3, 0.7), 0.1], emissive: 1, gravity: 14, collide: true });
      if (this.human && this.human.alive) { const d = V.dist(this.human.center(), pos); if (d < 14) this.effects.shake(Math.max(0, 1 - d / 14) * 0.5); }
      for (const q of this.players) {
        if (!q.alive) continue;
        const c = q.center(); const d = V.dist(c, pos);
        if (d > radius) continue;
        // line of sight from blast to target (try center then feet)
        const src = V.add(pos, [0, 0.1, 0]);
        if (!this.world.lineClear(src, c) && !this.world.lineClear(src, V.add(q.pos, [0, 0.3, 0]))) continue;
        let amount = dmg * (1 - 0.6 * d / radius);
        if (q === attacker) amount *= 0.5;
        if (opts.emp) amount = 30 + (q.ammo.shells + q.ammo.rockets * 3 + q.ammo.cells * 0.5) * 0.25;
        const dir = d > 0.01 ? V.norm(V.sub(c, pos)) : [0, 1, 0]; dir[1] += 0.35;
        const knock = (dmg * (1 - 0.6 * d / radius)) * 0.14;
        if (attacker && q.team === attacker.team && q !== attacker) { q.vel = V.madd(q.vel, V.norm(dir), knock * 0.6); q.onGround = false; continue; }
        if (opts.burn && !q.inWater) { q.burn = Math.max(q.burn, opts.burn); q.burnBy = attacker; }
        this.damage(q, Math.round(amount), attacker, kind, V.norm(dir), knock);
      }
      for (const s of this.sentries) { const d = V.dist(V.add(s.pos, [0, 0.6, 0]), pos); if (d < radius) this.damageSentry(s, dmg * (1 - 0.6 * d / radius), attacker); }
      for (const q of this.projectiles) if (q.type === 'pipebomb' && !q.dead && V.dist(q.pos, pos) < radius * 0.6 && q.pos !== pos) { q.dead = true; q.chain = true; }
    }
    updateFire(dt) {
      this.firePatches = this.firePatches.filter((f) => f.until > this.time);
      for (const f of this.firePatches) {
        if (Math.random() < dt * 30) this.effects.particle({ pos: V.add(f.pos, [rand(-f.r, f.r), 0.1, rand(-f.r, f.r)]), vel: [rand(-0.3, 0.3), rand(1.5, 3), rand(-0.3, 0.3)], life: 0.6, size: 0.3, grow: 0.3, color: [1, rand(0.3, 0.7), 0.1], emissive: 1 });
        for (const q of this.players) if (q.alive && !q.inWater && V.distXZ(q.pos, f.pos) < f.r && Math.abs(q.pos[1] - f.pos[1]) < 1.5 && (!f.owner || q.team !== f.owner.team)) { q.burn = Math.max(q.burn, 3); q.burnBy = f.owner; }
      }
    }
    // ------------------------------------------------------------------ damage
    damage(q, dmg, attacker, kind, dir, knock) {
      if (!q.alive || dmg <= 0) return;
      if (attacker && attacker !== q && attacker.team === q.team) return;
      if (q.game.roundOver) return;
      const absorb = Math.min(q.armor, dmg * q.def.armorType);
      q.armor = Math.max(0, Math.round(q.armor - absorb));
      const hpLoss = Math.max(1, Math.round(dmg - absorb));
      q.hp -= hpLoss;
      if (attacker && attacker !== q) attacker.stats.dmg += hpLoss;
      if (dir && knock) { q.vel = V.madd(q.vel, dir, knock); if (knock > 2) q.onGround = false; }
      if (attacker && attacker !== q) { q.lastAttacker = attacker; q.lastHurt = this.time; }
      q.hitFlash = 0.15;
      if (kind !== 'burn' && kind !== 'infection') this.effects.particle({ pos: q.center(), vel: [rand(-2, 2), rand(0, 3), rand(-2, 2)], life: 0.35, size: 0.045, color: [0.6, 0.04, 0.04], gravity: 14, count: 4 });
      if (q === this.human) this.effects.flash(Math.min(1, hpLoss / 40));
      if (attacker === this.human && attacker !== q) this.effects.sound('hit', null);
      else if (q === this.human) this.effects.sound('hurt', null);
      if (q.hp <= 0) this.kill(q, attacker, kind);
    }
    kill(q, attacker, kind) {
      q.alive = false; q.deaths++; q.deadAt = this.time; q.respawnAt = this.time + 5; q.wantsRespawn = q.isBot; q.charge = -1; q.grenPrime && (q.grenPrime = null);
      q.building = 0;
      if (attacker && attacker !== q) { attacker.kills++; attacker.score += kind === 'backstab' ? 2 : 1; if (attacker.team === q.team) attacker.score -= 1; }
      else { q.score -= 1; }
      if (q.flag) this.dropFlag(q);
      this.effects.sound('die', q.pos);
      for (let i = 0; i < 10; i++) this.effects.particle({ pos: q.center(), vel: [rand(-4, 4), rand(1, 6), rand(-4, 4)], life: rand(0.5, 1.1), size: 0.07, color: [0.55, 0.04, 0.04], gravity: 14, collide: true });
      const verb = { rocket: 'rocketed', pipe: 'piped', pipebomb: 'pipebombed', grenade: 'fragged', 'own grenade': 'held the grenade too long', headshot: 'headshot', sniper: 'sniped', nail: 'nailed', hitscan: 'shot', flame: 'roasted', burn: 'burned', melee: 'beat down', backstab: 'backstabbed', medkit: 'infected', infection: 'died of infection', fall: 'fell to their death', tranq: 'darted', sentry: 'was sentried by', mirv: 'MIRVed', napalm: 'napalmed', incendiary: 'torched', caltrop: 'stepped on caltrops', EMP: 'EMPed', 'nail grenade': 'nail-grenaded' }[kind] || 'killed';
      this.killFeed.push({ attacker: attacker && attacker !== q ? attacker : null, victim: q, verb, time: this.time, kind });
      if (this.killFeed.length > 6) this.killFeed.shift();
      // detonate the pipebombs of the dead demoman after a moment
      for (const p of this.projectiles) if (p.type === 'pipebomb' && p.owner === q) p.fuse = 1.5;
      if (q.sentry && kind !== 'x') { /* sentries survive owner death */ }
    }
    // ------------------------------------------------------------------ flags & items
    dropFlag(p) {
      const f = p.flag; if (!f) return; p.flag = null;
      f.state = 'dropped'; f.carrier = null; f.pos = [p.pos[0], p.pos[1], p.pos[2]]; f.returnAt = this.time + 60;
      // don't leave it inside water below the surface: fine, it floats at drop position
      this.announce(TEAM_NAMES[f.team] + ' flag dropped!', f.team, 'flag');
      this.effects.say(TEAM_NAMES[f.team] + ' flag dropped');
    }
    updateFlags(dt) {
      for (const f of this.flags) {
        if (f.state === 'carried') { f.pos = V.copy(f.carrier.pos); continue; }
        if (f.state === 'dropped') {
          if (this.time >= f.returnAt) { f.state = 'home'; f.pos = V.copy(f.home); this.announce(TEAM_NAMES[f.team] + ' flag returned.', f.team, 'flag'); this.effects.sound('flagreturn', null); this.effects.say(TEAM_NAMES[f.team] + ' flag returned'); continue; }
          // settle the flag onto the ground
          if (!this.world.solidAt(f.pos[0], f.pos[1] - 0.1, f.pos[2]) && !this.world.rampUnder(f.pos[0], f.pos[2], f.pos[1]) && !this.world.inWater(f.pos)) f.pos[1] -= 8 * dt;
          if (f.pos[1] < -8) { f.state = 'home'; f.pos = V.copy(f.home); }
        }
        for (const p of this.players) {
          if (!p.alive || p.team === f.team || p.flag) continue;
          if (V.distXZ(p.pos, f.pos) < 1.1 && Math.abs(p.pos[1] - f.pos[1]) < 2.2) {
            f.state = 'carried'; f.carrier = p; p.flag = f; p.disguise = -1;
            this.announce(TEAM_NAMES[p.team] + ' has taken the ' + TEAM_NAMES[f.team] + ' flag!', p.team, 'flag');
            this.effects.sound('flagtake', p.pos);
            if (this.human) this.effects.say(p.team === this.human.team ? (p === this.human ? 'You have the enemy flag' : 'Your team has the enemy flag') : 'The enemy has taken your flag');
            break;
          }
        }
      }
      // captures
      for (const p of this.players) {
        if (!p.alive || !p.flag) continue;
        const cap = this.data.caps[p.team];
        if (V.distXZ(p.pos, cap.pos) < cap.r && Math.abs(p.pos[1] - cap.pos[1]) < 2.5) {
          const f = p.flag; p.flag = null; f.state = 'home'; f.pos = V.copy(f.home); f.carrier = null;
          this.score[p.team] += 10; p.caps++; p.score += 10;
          this.announce(TEAM_NAMES[p.team] + ' captured the ' + TEAM_NAMES[f.team] + ' flag!', p.team, 'cap');
          this.effects.sound('flagcap', null);
          if (this.human) this.effects.say(p.team === this.human.team ? 'Your team captured the enemy flag' : 'The enemy captured your flag');
          if (this.score[p.team] >= this.capLimit * 10) this.endRound();
        }
      }
    }
    updateItems(dt) {
      for (const it of this.items) {
        if (it.respawnAt > this.time) continue;
        for (const p of this.players) {
          if (!p.alive || V.distXZ(p.pos, it.pos) > 0.9 || Math.abs(p.pos[1] - it.pos[1]) > 1.5) continue;
          let took = false;
          if (it.type === 'health') { if (p.hp < p.def.hp) { p.hp = Math.min(p.def.hp, p.hp + 30); p.infected = null; took = true; } }
          else { const d = p.def; for (const k of ['shells', 'nails', 'rockets', 'cells']) { const add = { shells: 20, nails: 40, rockets: 6, cells: 30 }[k]; if (d.ammoMax[k] > 0 && p.ammo[k] < d.ammoMax[k]) { p.ammo[k] = Math.min(d.ammoMax[k], p.ammo[k] + add); took = true; } } if (p.armor < d.armorMax) { p.armor = Math.min(d.armorMax, p.armor + 25); took = true; } }
          if (took) { it.respawnAt = this.time + 12; this.effects.sound('pickup', it.pos); if (p === this.human) this.effects.message(it.type === 'health' ? '+30 health' : 'Ammo and armor', p.team, 'pickup', p); break; }
        }
      }
      for (const r of this.resupply) {
        for (const p of this.players) {
          if (!p.alive || p.team !== r.team || V.distXZ(p.pos, r.pos) > 1.2 || Math.abs(p.pos[1] - r.pos[1]) > 1.5) continue;
          if ((p.resupT || 0) > this.time) continue;
          const d = p.def; let took = false;
          if (p.hp < d.hp) { p.hp = d.hp; took = true; } if (p.armor < d.armorMax) { p.armor = d.armorMax; took = true; }
          for (const k in d.ammoMax) if (p.ammo[k] < d.ammoMax[k]) { p.ammo[k] = d.ammoMax[k]; took = true; }
          for (let i = 0; i < 2; i++) if (p.gren[i] < d.grenN[i]) { p.gren[i] = d.grenN[i]; took = true; }
          p.infected = null; p.burn = 0;
          if (took) { p.resupT = this.time + 2; this.effects.sound('resupply', p.pos); if (p === this.human) this.effects.message('Resupplied', p.team, 'pickup', p); }
        }
      }
    }
    startDisguise(p) {
      if (!p.alive || p.cls !== 'spy' || p.disguiseT > 0) return;
      const order = ['scout', 'sniper', 'soldier', 'demoman', 'medic', 'hwguy', 'pyro', 'engineer', 'spy'];
      p.disguiseCls = order[Math.floor(Math.random() * order.length)]; p.pendingDisguise = 1 - p.team; p.disguiseT = 2.5;
      if (p === this.human) this.effects.message('Disguising...', p.team, 'info', p);
    }
    // ------------------------------------------------------------------ sentries
    startBuild(p) {
      if (!p.alive || p.cls !== 'engineer' || p.building > 0) return false;
      if (p.sentry) { this.effects.message('You already have a sentry (hit it with the spanner to repair / upgrade)', p.team, 'info', p); return false; }
      if (p.ammo.cells < 130) { this.effects.message('Need 130 cells to build', p.team, 'info', p); return false; }
      if (!p.onGround) return false;
      const fwd = V.forward(p.yaw, 0); const spot = V.madd(p.pos, fwd, 1.3);
      if (this.world.boxSolid([spot[0] - 0.5, spot[1] + 0.05, spot[2] - 0.5], [spot[0] + 0.5, spot[1] + 1.4, spot[2] + 0.5]) || !this.world.solidAt(spot[0], spot[1] - 0.1, spot[2])) { this.effects.message('Can\'t build there', p.team, 'info', p); return false; }
      p.ammo.cells -= 130; p.building = 4; p.buildSpot = spot; this.effects.sound('build', p.pos);
      return true;
    }
    finishSentry(p) {
      if (!p.alive || !p.buildSpot) return;
      const s = { pos: p.buildSpot, yaw: p.yaw, baseYaw: p.yaw, pitch: 0, team: p.team, owner: p, hp: 150, maxHp: 150, level: 1, cooldown: 0, target: null, scanT: 0, recoil: 0, flash: 0, builtAt: this.time };
      this.sentries.push(s); p.sentry = s; this.effects.sound('resupply', s.pos);
      this.effects.message('Sentry gun built', p.team, 'info', p);
    }
    damageSentry(s, dmg, attacker) {
      if (attacker && attacker.team === s.team) return;
      s.hp -= dmg; if (attacker) s.lastAttacker = attacker;
      this.effects.particle({ pos: V.add(s.pos, [0, 0.8, 0]), vel: [rand(-2, 2), rand(1, 3), rand(-2, 2)], life: 0.4, size: 0.08, color: [1, 0.8, 0.3], emissive: 1, gravity: 10 });
      if (s.hp <= 0) { this.destroySentry(s, attacker); if (attacker) attacker.score += 1; }
    }
    destroySentry(s, attacker) {
      const i = this.sentries.indexOf(s); if (i >= 0) this.sentries.splice(i, 1);
      if (s.owner) s.owner.sentry = null;
      this.explode(V.add(s.pos, [0, 0.5, 0]), 30, 2.5, null, 'sentry blast');
      if (s.owner) this.killFeed.push({ attacker, victim: { name: s.owner.name + "'s sentry", team: s.team }, verb: 'destroyed', time: this.time });
    }
    updateSentries(dt) {
      for (const s of this.sentries) {
        s.cooldown = Math.max(0, s.cooldown - dt); s.scanT -= dt;
        s.recoil = Math.max(0, s.recoil - dt * 7); s.flash = Math.max(0, s.flash - dt * 18);
        const head = V.add(s.pos, [0, 1.0, 0]);
        if (s.scanT <= 0) {
          s.scanT = 0.15; let best = null, bd = 28;
          for (const q of this.players) {
            if (!q.alive || q.team === s.team || q.disguise === s.team) continue;
            const d = V.dist(q.center(), head); if (d > bd) continue;
            if (!this.world.lineClear(head, q.center())) continue;
            best = q; bd = d;
          }
          s.target = best;
        }
        if (s.target && (!s.target.alive || s.target.disguise === s.team)) s.target = null;
        if (!s.target) { s.yaw += dt * 0.8; continue; }
        const want = V.yawTo(head, s.target.center());
        const diff = angleDiff(s.yaw, want); const rate = 5 * dt;
        s.yaw += clamp(diff, -rate, rate);
        s.pitch = V.pitchTo(head, s.target.center());
        if (Math.abs(angleDiff(s.yaw, want)) < 0.12 && s.cooldown <= 0) {
          s.cooldown = s.level >= 3 ? 0.07 : s.level === 2 ? 0.1 : 0.14;
          this.effects.sound('sentry', s.pos);
          s.recoil = 1; s.flash = 1;
          const d = this.spreadDir(V.forward(s.yaw, s.pitch), 0.03);
          const h = this.trace(head, d, 60, null);
          this.effects.tracer(V.madd(head, d, 0.6), h ? h.point : V.madd(head, d, 60), [1, 0.9, 0.6], 0.05);
          if (h && h.player && h.player.team !== s.team) this.damage(h.player, s.level >= 2 ? 12 : 9, s.owner, 'sentry', d, 0.4);
          if (s.level >= 3 && Math.random() < 0.08) { this.projectiles.push(new Projectile({ type: 'rocket', owner: s.owner, team: s.team, dmg: 60, radius: 3, pos: V.madd(head, d, 0.7), vel: V.scale(d, 27), life: 6 })); this.effects.sound('rocket', s.pos); }
        }
      }
    }
  }

  const out = { Game, Player, Projectile, GRAVITY, JUMP_V, PLAYER_HALF, PLAYER_H, EYE_H, TEAM_COLORS, BLUE, RED, TEAM_NAMES };
  if (isNode) module.exports = out; else Object.assign(root, out);
})(typeof window !== 'undefined' ? window : globalThis);
