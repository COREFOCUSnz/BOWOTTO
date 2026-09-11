// Bot AI: waypoint navigation (A*), roles (offense/defense/sniper), combat, class-aware weapon use.
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined';
  const { V, clamp, angleDiff, rand } = isNode ? require('./math.js') : root;
  const { WEAPONS, CLASSES } = isNode ? require('./defs.js') : root;
  const { BLUE, RED } = isNode ? require('./map2fort.js') : root;

  class BotBrain {
    constructor(game, p, skill) {
      this.game = game; this.p = p; this.skill = skill;
      this.path = null; this.pathI = 0; this.goal = null; this.goalKey = ''; this.repathAt = 0;
      this.thinkAt = Math.random() * 0.2; this.target = null; this.aimYaw = p.yaw; this.aimPitch = 0;
      this.stuckT = 0; this.lastPos = V.copy(p.pos); this.strafe = 1; this.strafeT = 0; this.waitUntil = 0; this.patrolNode = null;
      this.role = 'offense'; this.grenT = 0; this.aimErr = [0, 0]; this.aimErrT = 0; this.lastTargetSeen = -99;
    }
    nearestNode(pos) {
      // nearest waypoint that we can actually see (walls between us and a node make it useless)
      const nodes = this.game.data.nodes; const W = this.game.world;
      const cand = [];
      for (const n of nodes) {
        const dy = Math.abs(n.pos[1] - pos[1]); if (dy > 3) continue;
        cand.push([V.distXZ(n.pos, pos) + dy * 2, n]);
      }
      cand.sort((a, b) => a[0] - b[0]);
      const from = [pos[0], pos[1] + 1.0, pos[2]];
      for (let i = 0; i < Math.min(cand.length, 12); i++) {
        const n = cand[i][1];
        if (W.lineClear(from, [n.pos[0], n.pos[1] + 1.0, n.pos[2]])) return n;
      }
      return cand.length ? cand[0][1] : null;
    }
    astar(from, to) {
      const nodes = this.game.data.nodes; const N = nodes.length;
      const g = new Float64Array(N).fill(Infinity), f = new Float64Array(N).fill(Infinity); const prev = new Int32Array(N).fill(-1);
      const closed = new Uint8Array(N); const open = [from.id]; g[from.id] = 0; f[from.id] = V.dist(from.pos, to.pos);
      while (open.length) {
        let bi = 0; for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
        const u = open[bi]; open[bi] = open[open.length - 1]; open.pop();
        if (u === to.id) break;
        closed[u] = 1;
        for (const e of nodes[u].adj) {
          if (closed[e.to]) continue;
          const ng = g[u] + e.cost;
          if (ng < g[e.to]) { g[e.to] = ng; f[e.to] = ng + V.dist(nodes[e.to].pos, to.pos); prev[e.to] = u; if (!open.includes(e.to)) open.push(e.to); }
        }
      }
      if (g[to.id] === Infinity) return null;
      const path = []; let c = to.id; while (c !== -1) { path.unshift(nodes[c]); c = prev[c]; }
      return path;
    }
    setGoal(node, key) {
      if (!node) return;
      if (key === this.goalKey && this.path && this.game.time < this.repathAt) return;
      this.goalKey = key; this.goal = node; this.repathAt = this.game.time + 3;
      const start = this.nearestNode(this.p.pos);
      this.path = start ? this.astar(start, node) : null; this.pathI = 0;
      if (this.path && this.path.length > 1 && V.distXZ(this.path[0].pos, this.p.pos) < 1.0) this.pathI = 1;
    }
    decideRole() {
      const g = this.game, p = this.p;
      const mates = g.players.filter((q) => q.team === p.team && q.isBot);
      const idx = mates.indexOf(p);
      if (p.cls === 'sniper') { this.role = 'sniper'; return; }
      if (p.cls === 'engineer') { this.role = 'defense'; return; }
      this.role = idx % 3 === 1 ? 'defense' : 'offense';
    }
    think() {
      const g = this.game, p = this.p, data = g.data;
      const enemyTeam = 1 - p.team;
      const myFlag = g.flags[p.team], enemyFlag = g.flags[enemyTeam];
      const pre = p.team === BLUE ? 'b_' : 'r_';
      // ---- choose a goal
      if (p.flag) {
        this.setGoal(data.byName[pre + 'flag'], 'cap');
      } else if (this.role === 'offense') {
        if (enemyFlag.state === 'carried' && enemyFlag.carrier.team === p.team) {
          // escort: follow the carrier loosely, or go bother their flag room
          const n = this.nearestNode(enemyFlag.carrier.pos); this.setGoal(n || data.byName[pre + 'flag'], 'escort' + (n && n.name));
        } else {
          const n = enemyFlag.state === 'home' ? data.byName[(enemyTeam === BLUE ? 'b_' : 'r_') + 'flag'] : this.nearestNode(enemyFlag.pos);
          this.setGoal(n, 'getflag' + (n && n.name));
        }
      } else if (this.role === 'sniper') {
        const spots = data.sniperSpots[p.team];
        if (!this.patrolNode) this.patrolNode = data.byName[spots[Math.floor(Math.random() * spots.length)]];
        this.setGoal(this.patrolNode, 'snipe');
      } else { // defense
        if (myFlag.state === 'carried') {
          const n = this.nearestNode(myFlag.carrier.pos); this.setGoal(n, 'chase' + (n && n.name));
        } else if (myFlag.state === 'dropped') {
          const n = this.nearestNode(myFlag.pos); this.setGoal(n, 'guarddrop' + (n && n.name));
        } else {
          if (p.cls === 'engineer' && !p.sentry && p.building <= 0 && p.ammo.cells >= 130) {
            const n = data.byName[pre + (Math.random() < 0.5 ? 'flagroom_a' : 'flagroom_c')];
            this.setGoal(n, 'build');
            if (V.distXZ(p.pos, n.pos) < 1.5) { p.yaw = V.yawTo(p.pos, data.byName[pre + 'flag'].pos); g.startBuild(p); }
          } else {
            if (!this.patrolNode || (g.time > this.waitUntil && V.distXZ(p.pos, this.patrolNode.pos) < 1.5)) {
              const d = data.defense[p.team]; this.patrolNode = data.byName[d[Math.floor(Math.random() * d.length)]]; this.waitUntil = g.time + rand(3, 8);
            }
            this.setGoal(this.patrolNode, 'patrol' + this.patrolNode.name);
          }
        }
      }
      // ---- pick a target
      const eye = p.eye(); let best = null, bd = Infinity;
      for (const q of g.players) {
        if (!q.alive || q.team === p.team || q === p) continue;
        if (q.disguise === p.team && q.lastFire < g.time - 1 && (q.lastAttacker !== p)) continue; // fooled by the spy
        const d = V.dist(eye, q.center()); if (d > 60 || d > bd) continue;
        // field of view unless recently hurt by them
        const to = V.norm(V.sub(q.center(), eye)); const fwd = V.forward(p.yaw, p.pitch);
        if (V.dot(to, fwd) < -0.2 && p.lastAttacker !== q && d > 4) continue;
        if (!g.world.lineClear(eye, q.center()) && !g.world.lineClear(eye, q.eye())) continue;
        best = q; bd = d;
      }
      let sentryTarget = null;
      if (!best) for (const s of g.sentries) if (s.team !== p.team && V.dist(eye, s.pos) < 30 && g.world.lineClear(eye, V.add(s.pos, [0, 0.8, 0]))) sentryTarget = s;
      this.target = best; this.sentryTarget = sentryTarget;
      if (best) this.lastTargetSeen = g.time;
      // ---- weapon choice
      this.chooseWeapon(bd);
      // ---- medic: heal nearby hurt teammates
      if (p.cls === 'medic' && !best) {
        for (const q of g.players) if (q !== p && q.alive && q.team === p.team && (q.hp < q.def.hp * 0.7 || q.infected) && V.dist(q.pos, p.pos) < 6 && g.world.lineClear(eye, q.center())) { this.healTarget = q; break; }
      }
      if (this.healTarget && (!this.healTarget.alive || this.healTarget.hp >= this.healTarget.def.hp && !this.healTarget.infected || V.dist(this.healTarget.pos, p.pos) > 8)) this.healTarget = null;
    }
    chooseWeapon(dist) {
      const p = this.p; const has = (id) => p.weapons.indexOf(id);
      const pick = (ids) => { for (const id of ids) { const i = has(id); if (i >= 0 && p.canFire(WEAPONS[id])) { p.wi = i; return; } } };
      switch (p.cls) {
        case 'scout': pick(dist < 8 ? ['shotgun', 'nailgun', 'crowbar'] : ['nailgun', 'shotgun', 'crowbar']); break;
        case 'sniper': pick(dist > 12 || this.role === 'sniper' ? ['sniper', 'autorifle', 'nailgun'] : ['autorifle', 'nailgun', 'sniper', 'crowbar']); break;
        case 'soldier': pick(dist < 3.5 ? ['supershotgun', 'shotgun', 'rpg', 'crowbar'] : ['rpg', 'supershotgun', 'shotgun', 'crowbar']); break;
        case 'demoman': pick(dist < 4 ? ['shotgun', 'gl', 'crowbar'] : ['gl', 'shotgun', 'crowbar']); break;
        case 'medic': pick(this.healTarget ? ['medkit'] : dist < 6 ? ['supershotgun', 'supernailgun', 'shotgun', 'medkit'] : ['supernailgun', 'supershotgun', 'shotgun', 'medkit']); break;
        case 'hwguy': pick(['ac', 'supershotgun', 'shotgun', 'crowbar']); break;
        case 'pyro': pick(dist < 6 ? ['flamer', 'shotgun', 'ic', 'crowbar'] : ['ic', 'shotgun', 'flamer', 'crowbar']); break;
        case 'spy': pick(dist < 2.5 ? ['knife', 'supershotgun'] : ['supershotgun', 'tranq', 'nailgun', 'knife']); break;
        case 'engineer': pick(dist < 6 ? ['supershotgun', 'railgun', 'spanner'] : ['railgun', 'supershotgun', 'spanner']); break;
      }
    }
    update(dt) {
      const g = this.game, p = this.p;
      if (!p.alive) { this.path = null; this.goalKey = ''; this.target = null; return; }
      this.thinkAt -= dt;
      if (this.thinkAt <= 0) { this.thinkAt = 0.12 + Math.random() * 0.06; if (!this.roleSet) { this.decideRole(); this.roleSet = true; } this.think(); }
      const inp = p.input; inp.dir = [0, 0, 0]; inp.jump = false; inp.fire = false; inp.alt = false; inp.gren = [false, false];
      // ---- movement along the path
      let moveTarget = null;
      if (this.healTarget) moveTarget = this.healTarget.pos;
      else if (this.path && this.pathI < this.path.length) {
        const node = this.path[this.pathI];
        const dxz = V.distXZ(node.pos, p.pos), dy = node.pos[1] - p.pos[1];
        const reach = this.pathI === this.path.length - 1 ? 0.9 : 1.1;
        if (dxz < reach && Math.abs(dy) < 1.6) { this.pathI++; this.stuckT = 0; }
        else moveTarget = node.pos;
      }
      const water = p.inWater;
      if (moveTarget) {
        const d = V.sub(moveTarget, p.pos); const dxz = Math.hypot(d[0], d[2]);
        const dir = dxz > 1e-3 ? [d[0] / dxz, 0, d[2] / dxz] : [0, 0, 0];
        // combat strafing
        if (this.target && !water && dxz > 2) {
          this.strafeT -= dt; if (this.strafeT <= 0) { this.strafeT = rand(0.4, 1.2); this.strafe = Math.random() < 0.5 ? -1 : 1; }
          const r = [-dir[2], 0, dir[0]]; dir[0] += r[0] * this.strafe * 0.5; dir[2] += r[2] * this.strafe * 0.5;
        }
        inp.dir = dir;
        if (water) {
          const surf = g.world.inWater(p.center()); const s = surf ? surf.max[1] : 0;
          if (d[1] > 0.3) { inp.jump = true; }
          else inp.dir[1] = clamp(d[1] * 0.8, -1, 0.5);
          if (moveTarget[1] > p.pos[1] + 0.3 && p.center()[1] > s - 0.8) inp.jump = true;
        }
        // stuck detection -> jump / repath
        const moved = V.distXZ(p.pos, this.lastPos);
        if (moved < 0.4 * dt * 6 && !this.healTarget) this.stuckT += dt; else this.stuckT = 0;
        this.lastPos = V.copy(p.pos);
        if (this.stuckT > 0.35 && p.onGround) inp.jump = true;
        if (this.stuckT > 3) { this.stuckT = 0; this.repathAt = 0; this.goalKey = ''; this.path = null; }
        if (!water && p.onGround && moveTarget[1] > p.pos[1] + 0.5 && dxz < 1.6) inp.jump = true;
      } else if (this.role === 'sniper' && this.goal) {
        // at the sniper spot: hold position, look across the bridge
        const look = p.team === BLUE ? [0, 0, 30] : [0, 0, -30];
        if (!this.target) { const want = V.yawTo(p.pos, V.add(p.pos, look)); p.yaw += clamp(angleDiff(p.yaw, want), -3 * dt, 3 * dt); p.pitch += clamp(-0.05 - p.pitch, -2 * dt, 2 * dt); }
      }
      // ---- combat
      const w = p.weapon();
      let aimAt = null, aimEnt = null;
      if (this.target) { aimEnt = this.target; aimAt = this.target.center(); }
      else if (this.sentryTarget) { aimAt = V.add(this.sentryTarget.pos, [0, 0.7, 0]); }
      else if (this.healTarget) { aimAt = this.healTarget.center(); aimEnt = this.healTarget; }
      if (aimAt) {
        const eye = p.eye();
        // lead projectiles
        if (aimEnt && w.type === 'proj' && w.speed) { const t = V.dist(eye, aimAt) / w.speed; aimAt = V.madd(aimAt, aimEnt.vel, t * 0.9); }
        if (w.type === 'proj' && (w.proj === 'pipe')) { aimAt = V.add(aimAt, [0, V.dist(eye, aimAt) * 0.12, 0]); }
        if (aimEnt && w.type === 'proj' && w.proj === 'rocket' && aimEnt.onGround) aimAt = [aimAt[0], aimEnt.pos[1] + 0.3, aimAt[2]]; // aim at feet
        // skill-based aim error that wanders
        this.aimErrT -= dt; if (this.aimErrT <= 0) { this.aimErrT = rand(0.3, 0.8); const e = (1 - this.skill) * 0.14 + 0.01; this.aimErr = [rand(-e, e), rand(-e, e)]; }
        const wantYaw = V.yawTo(eye, aimAt) + this.aimErr[0], wantPitch = V.pitchTo(eye, aimAt) + this.aimErr[1];
        const rate = (4 + this.skill * 6) * dt;
        p.yaw += clamp(angleDiff(p.yaw, wantYaw), -rate, rate);
        p.pitch = clamp(p.pitch + clamp(wantPitch - p.pitch, -rate, rate), -1.4, 1.4);
        const err = Math.abs(angleDiff(p.yaw, wantYaw)) + Math.abs(wantPitch - p.pitch);
        const dist = V.dist(eye, aimAt);
        if (this.healTarget && !this.target) { if (dist < 1.9 && err < 0.4) inp.fire = true; }
        else if (err < 0.18) {
          if (w.type === 'melee') { if (dist < w.range + 0.2) inp.fire = true; }
          else if (w.type === 'flame') { if (dist < w.range) inp.fire = true; }
          else if (w.type === 'charge') { if (p.charge < 0) { if (p.cooldown <= 0) inp.fire = true; } else if (p.charge < 0.6 + this.skill * 1.6) inp.fire = true; }
          else if (w.type === 'proj' && w.radius) { if (dist > 3.2 || !p.onGround) inp.fire = true; }
          else inp.fire = true;
        }
        // grenades
        if (this.target && !p.grenPrime) {
          this.grenT -= dt;
          if (this.grenT <= 0) { this.grenT = rand(3, 7); if (dist > 5 && dist < 22 && Math.random() < 0.6) { const slot = p.gren[0] > 0 && p.def.gren[0] && p.def.gren[0] !== 'caltrop' ? 0 : p.gren[1] > 0 && p.def.gren[1] ? 1 : -1; if (slot >= 0) { g.primeGrenade(p, slot); p.grenPrime.hold = rand(1.5, 2.6); } } }
        }
        if (p.cls === 'demoman' && w === WEAPONS.pl && Math.random() < dt * 2) inp.alt = true;
      } else {
        // look where we're going
        if (moveTarget) { const want = V.yawTo(p.pos, moveTarget); p.yaw += clamp(angleDiff(p.yaw, want), -6 * dt, 6 * dt); p.pitch += clamp(0 - p.pitch, -2 * dt, 2 * dt); }
        if (p.charge >= 0) inp.fire = true; // keep holding until a target appears (then release)
      }
      if (p.grenPrime) { p.grenPrime.hold = (p.grenPrime.hold || 1.5) - dt; inp.gren[p.grenPrime.slot] = p.grenPrime.hold > 0; }
      // spy: disguise when not seen
      if (p.cls === 'spy' && p.disguise < 0 && p.disguiseT <= 0 && !this.target && g.time - p.spawnT > 1) g.startDisguise(p);
      // AC: keep it spinning while enemies around
      if (w === WEAPONS.ac && this.target && !inp.fire) inp.fire = false;
      // pipebombs: detonate when an enemy is near a pipe
      if (p.cls === 'demoman') for (const q of g.projectiles) if (q.type === 'pipebomb' && q.owner === p && q.stuck) { for (const e of g.players) if (e.alive && e.team !== p.team && V.dist(e.pos, q.pos) < 3) { inp.alt = true; if (has(p, 'pl')) p.wi = p.weapons.indexOf('pl'); } }
    }
  }
  function has(p, id) { return p.weapons.indexOf(id) >= 0; }

  // Team composition for bots (rotates through a TFC-ish lineup)
  const LINEUP = ['soldier', 'scout', 'demoman', 'medic', 'sniper', 'hwguy', 'pyro', 'engineer', 'spy', 'soldier', 'scout', 'medic'];
  function botClassFor(index) { return LINEUP[index % LINEUP.length]; }

  const out = { BotBrain, botClassFor };
  if (isNode) module.exports = out; else Object.assign(root, out);
})(typeof window !== 'undefined' ? window : globalThis);
