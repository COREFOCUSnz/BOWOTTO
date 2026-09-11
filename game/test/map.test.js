// Node bench for the map + physics: builds the world, meshes it, checks node
// placement, graph connectivity, and walks a simulated player through key routes.
const { buildMap, BLUE, RED } = require('../js/map2fort.js');
const { V } = require('../js/math.js');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };

const t0 = Date.now();
const { world, data } = buildMap();
const mesh = world.buildMesh();
console.log(`world ${world.nx}x${world.ny}x${world.nz} cells, mesh ${mesh.pos.length / 3} verts, built in ${Date.now() - t0} ms`);
check(mesh.pos.length / 3 < 400000, 'mesh vertex count sane');

// Every node must be in free space with its feet on something (or in water)
const half = 0.4, h = 1.8;
for (const n of data.nodes) {
  const p = n.pos;
  const inWater = !!world.inWater([p[0], p[1] + 0.9, p[2]]);
  const free = !world.boxSolid([p[0] - half, p[1] + 0.05, p[2] - half], [p[0] + half, p[1] + (inWater ? 1.0 : h), p[2] + half]);
  const ru = world.rampUnder(p[0], p[2], p[1]);
  const ground = inWater || world.boxSolid([p[0] - 0.2, p[1] - 0.1, p[2] - 0.2], [p[0] + 0.2, p[1] - 0.01, p[2] + 0.2]) || (ru && Math.abs(ru.h - p[1]) < 0.5);
  if (!free || !ground) check(false, `node ${n.name} at ${p} free=${free} ground=${ground}`);
}
check(true, `${data.nodes.length} nodes placed`);

// Graph connectivity: blue spawn must reach red flag and back
function path(fromName, toName) {
  const byName = data.byName; const s = byName[fromName], g = byName[toName];
  const dist = new Map([[s.id, 0]]), prev = new Map(); const open = [s.id];
  while (open.length) {
    open.sort((a, b) => dist.get(a) - dist.get(b)); const u = open.shift();
    if (u === g.id) break;
    for (const e of data.nodes[u].adj) { const nd = dist.get(u) + e.cost; if (!dist.has(e.to) || nd < dist.get(e.to)) { dist.set(e.to, nd); prev.set(e.to, u); open.push(e.to); } }
  }
  if (!dist.has(g.id)) return null;
  const out = []; let c = g.id; while (c !== undefined) { out.unshift(data.nodes[c].name); c = prev.get(c); }
  return out;
}
const p1 = path('b_spawn', 'r_flag'); check(!!p1, 'blue spawn -> red flag: ' + (p1 && p1.join(' > ')));
const p2 = path('r_flag', 'b_flag'); check(!!p2, 'red flag -> blue flag (capture route): ' + (p2 && p2.join(' > ')));
const p3 = path('b_bank_R', 'b_flag'); check(!!p3 && p3.includes('b_well_out'), 'water route reaches blue flag: ' + (p3 && p3.join(' > ')));
for (const n of data.nodes) { const p = path('b_spawn', n.name); if (!p) check(false, 'unreachable node ' + n.name); }

// Simulated walker: follow a node path with simple physics, report if it gets stuck.
function walk(names, label) {
  let pos = V.copy(data.byName[names[0]].pos), vel = [0, 0, 0];
  const team = data.byName[names[0]].team < 0 ? BLUE : data.byName[names[0]].team;
  const dt = 1 / 60; let i = 1, t = 0, stuckT = 0, lastD = Infinity;
  while (i < names.length && t < 240) {
    const target = data.byName[names[i]].pos;
    const center = [pos[0], pos[1] + 0.9, pos[2]];
    const water = world.inWater(center);
    const d = V.sub(target, pos); const dxz = Math.hypot(d[0], d[2]);
    const dir = dxz > 1e-3 ? [d[0] / dxz, 0, d[2] / dxz] : [0, 0, 0];
    const speed = 6;
    if (water) {
      vel[0] = dir[0] * speed * 0.6; vel[2] = dir[2] * speed * 0.6;
      const surf = water.max[1];
      if (target[1] > pos[1] + 0.3) { vel[1] = center[1] > surf - 0.6 ? 6.5 : 3; } else vel[1] = Math.max(-3, Math.min(1, (target[1] - pos[1]) * 2));
    } else {
      vel[0] = dir[0] * speed; vel[2] = dir[2] * speed;
      vel[1] -= 20 * dt;
    }
    const r = world.moveBox(pos, half, h, V.scale(vel, dt), team, 0.45);
    if (r.flags.ground && vel[1] < 0) vel[1] = 0;
    if (r.flags.hitY && vel[1] > 0) vel[1] = 0;
    if (!water && r.flags.ground && (r.flags.hitX || r.flags.hitZ)) vel[1] = 6.7; // jump when blocked
    pos = r.pos; t += dt;
    const dist = Math.hypot(target[0] - pos[0], target[2] - pos[2]);
    if (dist < 0.8 && Math.abs(target[1] - pos[1]) < 1.6) { i++; stuckT = 0; lastD = Infinity; continue; }
    if (dist < lastD - 0.01) { lastD = dist; stuckT = 0; } else { stuckT += dt; }
    if (stuckT > 4) { check(false, `${label}: stuck heading to ${names[i]} at ${pos.map((v) => v.toFixed(2))} (t=${t.toFixed(1)})`); return false; }
  }
  check(i >= names.length, `${label}: walked ${names.length} nodes in ${t.toFixed(1)} s`);
  return i >= names.length;
}
walk(p1, 'walk blue spawn -> red flag');
walk(p2, 'walk red flag -> blue flag');
walk(['b_bridge_end', 'b_bank_R', 'b_water_R', 'water_mid_R', 'r_water_L', 'r_bank_R'], 'swim across the moat and climb out');
walk(path('b_bank_R', 'b_flag'), 'water route into blue flag room');
walk(['b_deck_front', 'b_bank_C', 'b_door_out'], 'vault battlements');
walk(['b_deck_L', 'b_ramp_bot', 'b_ramp_mid', 'b_ramp_top'], 'drop into ramp room and climb back');
walk(path('r_spawn', 'r_deck_front'), 'red spawn to red battlements');
walk(path('r_spawn', 'b_flag').concat(path('b_flag', 'r_flag').slice(1)), 'red full CTF loop');

// Raycast sanity: from blue deck toward red deck should be clear over the moat
const a = [0, 7.6, -14], b = [0, 7.6, 14];
check(world.lineClear(a, b), 'line of sight deck to deck');
check(!world.lineClear([8, 1.6, -18], [8, 1.6, 18]), 'no line of sight through the fort front wall');
check(world.lineClear([0, 1.6, -18], [0, 1.6, 18]), 'line of sight straight through both front doors');
const rc = world.raycast([8, 1.6, -18], [0, 0, 1], 100);
check(rc && Math.abs(rc.dist - 5) < 0.6, 'ray from lobby hits front wall (dist ' + (rc && rc.dist.toFixed(2)) + ')');
const rr = world.raycast([-16.5, 8, -18.5], [0, -1, 0], 20);
check(rr && Math.abs(rr.point[1] - 3) < 0.2, 'ray straight down hits ramp surface at y=3 (got ' + (rr && rr.point[1].toFixed(2)) + ')');

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS');
process.exit(fails ? 1 : 0);
