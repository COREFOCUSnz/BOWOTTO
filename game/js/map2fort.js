// 2Fort-style map: two mirrored forts facing each other across a moat with a covered bridge.
// Blue fort sits at negative Z, Red at positive Z. Everything is authored in blue-local
// coordinates and mirrored (x,z) -> (-x,-z) for red.
(function (root) {
  'use strict';
  const { World, MAT } = typeof module !== 'undefined' ? require('./world.js') : root;

  const BLUE = 0, RED = 1;
  const TEAM_NAMES = ['Blue', 'Red'];
  const TEAM_MAT = [MAT.BLUE, MAT.RED];

  function mirrorBox(b) { return [[-b[1][0], b[0][1], -b[1][2]], [-b[0][0], b[1][1], -b[0][2]]]; }
  function mirrorPt(p) { return [-p[0], p[1], -p[2]]; }

  function buildMap() {
    const world = new World([-26, -8, -52], [26, 16, 52], 0.5);
    const W = world;
    // Ground everywhere below 0
    W.fill([[-26, -8, -52], [26, 0, 52]], MAT.DIRT);
    // Cliff walls around the arena
    W.fill([[-26, 0, -52], [-24, 14, 52]], MAT.STONE);
    W.fill([[24, 0, -52], [26, 14, 52]], MAT.STONE);
    W.fill([[-26, 0, -52], [26, 14, -44]], MAT.STONE);
    W.fill([[-26, 0, 44], [26, 14, 52]], MAT.STONE);
    // Side pockets beside the forts are cliff too
    for (const s of [-1, 1]) {
      W.fill([[20, 0, s < 0 ? -44 : 12], [26, 14, s < 0 ? -12 : 44]], MAT.STONE);
      W.fill([[-26, 0, s < 0 ? -44 : 12], [-20, 14, s < 0 ? -12 : 44]], MAT.STONE);
    }
    // Moat
    W.carve([[-24, -4, -8], [24, 0, 8]]);
    W.paint([[-24, -4, -8], [24, 0, 8]], MAT.STONE);
    W.addWater([-24, -4, -8], [24, -0.4, 8]);
    // Covered bridge
    W.fill([[-4, -0.5, -8], [4, 0, 8]], MAT.WOOD);
    W.fill([[-4, 3.5, -8.5], [4, 4, 8.5]], MAT.WOOD);
    W.fill([[-4, 0, -8], [-3.5, 1, 8]], MAT.WOOD);
    W.fill([[3.5, 0, -8], [4, 1, 8]], MAT.WOOD);
    for (const z of [-8, -4, 0, 4, 7.5]) {
      W.fill([[-4, 0, z], [-3.5, 3.5, z + 0.5]], MAT.WOOD);
      W.fill([[3.5, 0, z], [4, 3.5, z + 0.5]], MAT.WOOD);
    }

    const data = { spawns: [[], []], flags: [], caps: [], items: [], resupply: [], nodes: [], links: [], sniperSpots: [[], []], defense: [[], []], lights: [], screens: [] };

    function fort(team) {
      const T = team === BLUE ? (b) => b : mirrorBox;
      const P = team === BLUE ? (p) => p : mirrorPt;
      const F = (box, mat) => W.fill(T(box), mat);
      const C = (box) => W.carve(T(box));
      const PAINT = (box, mat) => W.paint(T(box), mat);
      const teamMat = TEAM_MAT[team];

      // Fort block: front part (6.5 tall = deck + 0.5 m parapet), back part (11 tall)
      F([[-20, 0, -20], [20, 6.5, -12]], MAT.BRICK);
      F([[-20, 0, -44], [20, 11, -20]], MAT.BRICK);

      // --- ground floor rooms
      C([[-13, 0, -24], [13, 5.5, -13]]);          // lobby
      C([[-3, 0, -13], [3, 4, -12]]);              // front door
      C([[-19, 0, -24], [-14, 9, -13]]);           // ramp room (sky above front half)
      C([[-14, 0, -24], [-13, 4, -20]]);           // lobby <-> ramp room door
      C([[-3, 0, -25], [3, 4, -24]]);              // lobby -> back hall door
      C([[-14, 0, -30], [12, 5, -25]]);            // back hall
      C([[-3, 0, -32], [3, 4, -30]]);              // spawn door
      C([[-8, 0, -42], [8, 5, -32]]);              // spawn room
      C([[9, 0, -42], [12, 4, -30]]);              // right corridor (ground)
      C([[9, 0, -42], [18, 4, -40]]);              // landing under upper ramp
      // --- upper level
      C([[-19, 6, -20], [19, 20, -13]]);           // battlements deck
      C([[8, 6, -21], [12, 9, -20]]);              // deck back door
      C([[6, 6, -30], [18, 10, -21]]);             // upper hall
      C([[14, 0, -40], [18, 9.5, -30]]);           // upper ramp corridor
      // --- spiral down
      C([[-14, -2.5, -38], [-10, 4, -30]]);        // spiral segment 1
      C([[-19, -2.5, -42], [-10, 1.5, -38]]);      // spiral landing
      C([[-19, -5, -38], [-15, 1.5, -30]]);        // spiral segment 2
      C([[-19, -5, -30], [-15, -1, -29]]);         // seg2 -> basement corridor
      C([[-19, -5, -29], [-6, -1, -26]]);          // basement corridor
      // --- basement
      C([[-6, -5, -42], [10, -1, -26]]);           // flag room
      C([[10, -5, -40], [12, -1, -36]]);           // flag room side door
      C([[12, -5, -40], [16, -1, -30]]);           // sump corridor
      C([[12, -5, -33], [16, 0, -30]]);           // drop vestibule below the spillway door
      C([[13, -2.5, -30], [17, 2, -29]]);          // spillway door (well -> sump)
      C([[13, -5, -29], [19, 2, -24]]);            // well room
      C([[14, -5, -24], [18, -1, -8]]);            // water tunnel

      // --- ramps (wedges)
      const ramps = [
        { min: [-19, 0, -24], max: [-14, 6, -13], axis: 2, dir: 1, mat: MAT.CONCRETE },    // ramp room
        { min: [-14, -2.5, -38], max: [-10, 0, -30], axis: 2, dir: 1, mat: MAT.STONE, indoor: 1 },  // spiral 1
        { min: [-19, -5, -38], max: [-15, -2.5, -30], axis: 2, dir: -1, mat: MAT.STONE, indoor: 1 }, // spiral 2
        { min: [14, 0, -40], max: [18, 6, -30], axis: 2, dir: 1, mat: MAT.CONCRETE, indoor: 1 },   // upper ramp
      ];
      for (const r of ramps) {
        if (team === BLUE) W.addRamp(r);
        else {
          const mb = mirrorBox([r.min, r.max]);
          W.addRamp({ min: mb[0], max: mb[1], axis: 2, dir: -r.dir, mat: r.mat, indoor: r.indoor });
        }
      }
      // --- water in the tunnel / well
      const wt = T([[14, -5, -24], [18, -0.4, -8]]); W.addWater(wt[0], wt[1]);
      const ww = T([[13, -5, -29], [19, -0.4, -24]]); W.addWater(ww[0], ww[1]);

      // --- materials
      PAINT([[-13, 0, -24], [13, 5.5, -13]], MAT.CONCRETE);
      PAINT([[-14, 0, -30], [12, 5, -25]], MAT.CONCRETE);
      PAINT([[6, 6, -30], [18, 10, -21]], MAT.CONCRETE);
      PAINT([[14, 0, -40], [18, 9.5, -30]], MAT.CONCRETE);
      PAINT([[9, 0, -42], [18, 4, -30]], MAT.CONCRETE);
      PAINT([[-19, 0, -24], [-14, 9, -13]], MAT.DARKBRICK);
      PAINT([[-14, -2.5, -38], [-10, 4, -30]], MAT.STONE);
      PAINT([[-19, -5, -42], [-10, 1.5, -30]], MAT.STONE);
      PAINT([[-19, -5, -29], [-6, -1, -26]], MAT.STONE);
      PAINT([[-6, -5, -42], [10, -1, -26]], MAT.STONE);
      PAINT([[10, -5, -40], [16, -1, -30]], MAT.STONE);
      PAINT([[13, -5, -29], [19, 2, -24]], MAT.METAL);
      PAINT([[14, -5, -24], [18, -1, -8]], MAT.METAL);
      // Spawn room: concrete with a team band at eye height, rather than a solid
      // wall of team colour on every surface.
      PAINT([[-8, 0, -42], [8, 5, -32]], MAT.CONCRETE);
      PAINT([[-8, 2.0, -42], [8, 2.9, -32]], teamMat);
      PAINT([[-3, 0, -32], [3, 4, -30]], MAT.CONCRETE);
      PAINT([[-3, 2.0, -32], [3, 2.9, -30]], teamMat);
      F([[-8, -0.45, -42], [8, -0.05, -41.5]], teamMat);   // recolour the floor slab, do not add one
      // deck floor metal, parapet band team colored
      F([[-13, 5.5, -20], [19, 6, -13]], MAT.METAL);
      PAINT([[-20, 4.5, -12.5], [20, 6.5, -12]], teamMat);
      PAINT([[-20, 4.5, -12], [20, 6.5, -11.5]], teamMat);
      PAINT([[-4, 0, -12.5], [4, 4.5, -12]], teamMat);
      PAINT([[-4, 0, -12], [4, 4.5, -11.5]], teamMat);
      PAINT([[7, 6, -21], [13, 9.5, -20]], teamMat);
      // flag room floor accent + cap zone ring
      F([[-1, -5.5, -39], [5, -5, -33]], teamMat);
      // ceiling lights
      const lights = [
        [0, 5.5, -18.5], [0, 5, -27.5], [0, 5, -37], [12, 10, -25.5],
        [2, -1, -34], [-2, -1, -28], [7, -1, -30],          // flag room
        [16, 2, -26.5], [10.5, 4, -36],
        [-12, 1.5, -40], [-17, 1.5, -34],                    // spiral
        [14, -1, -35], [14, 0, -31],                         // sump corridor; the second sits in the
                                                             // drop vestibule ceiling, which is carved to y=0
        [16, -1, -12], [16, -1, -20],                        // water tunnel
        [-12, -1, -27.5],                                    // basement corridor
      ];
      for (const l of lights) {
        const b = [[l[0] - 1, l[1], l[2] - 1], [l[0] + 1, l[1] + 0.5, l[2] + 1]];
        F(b, MAT.LIGHT);
        data.lights.push(P([l[0], l[1] - 0.1, l[2]]));
      }
      // team door blocker at spawn
      const bl = T([[-3.5, 0, -32.5], [3.5, 4, -29.5]]);
      W.blockers.push({ min: bl[0], max: bl[1], team });

      // --- gameplay data
      data.spawns[team] = [[0, 0, -36], [-4, 0, -39], [4, 0, -39], [-5, 0, -34], [5, 0, -34], [0, 0, -40]].map(P);
      data.flags[team] = { home: P([2, -5, -36]) };
      data.caps[team] = { pos: P([2, -5, -36]), r: 2.5 };
      // A screen on the wall you face when you spawn, beside the exit. The bezel
      // stands 10 cm proud of the wall so it reads as a mounted panel; the picture
      // itself is drawn by js/game.js from assets/screens/screens.json.
      // The bezel is voxels, and voxels are half-metre cells: a 10 cm frame snaps
      // to a half-metre slab and swallows anything mounted inside it. Both the
      // frame and the picture plane are on the grid on purpose.
      F([[-7.0, 1.5, -32.5], [-4.0, 3.5, -32.0]], MAT.METAL);
      data.screens.push({ id: 'spawn-board', pos: P([-5.5, 2.5, -32.53]), yaw: team === BLUE ? Math.PI : 0, team });
      data.resupply.push({ pos: P([0, 0, -41]), team });
      data.resupply.push({ pos: P([-6, 0, -33]), team });
      data.items.push({ pos: P([-10, 0, -18]), type: 'health' });
      data.items.push({ pos: P([10, 0, -18]), type: 'ammo' });
      data.items.push({ pos: P([-6, -5, -40]), type: 'health' });
      data.items.push({ pos: P([8, -5, -28]), type: 'ammo' });
      data.items.push({ pos: P([16, 6, -15]), type: 'ammo' });
      data.items.push({ pos: P([-8, 6, -15]), type: 'health' });
      data.items.push({ pos: P([14, 6, -25]), type: 'health' });

      // --- waypoints (blue-local)
      const pre = team === BLUE ? 'b_' : 'r_';
      const N = (name, p, opts) => data.nodes.push(Object.assign({ name: pre + name, pos: P(p), team }, opts || {}));
      N('bridge_end', [0, 0, -9]);
      N('bank_L', [-10, 0, -10]); N('bank_R', [10, 0, -10]); N('bank_C', [0, 0, -10.5]);
      N('water_L', [-12, -2.5, -4], { water: 1 }); N('water_R', [12, -2.5, -4], { water: 1 }); N('water_C', [0, -3, -4], { water: 1 });
      N('tun0', [16, -3.5, -9.5], { water: 1 }); N('tun1', [16, -3.5, -16], { water: 1 }); N('tun2', [16, -3.5, -23], { water: 1 });
      N('well', [16, -3, -26.5], { water: 1 }); N('well_out', [15, -1.3, -28.7], { water: 1 });
      N('drop_land', [14, -5, -31]); N('sump_corr', [14, -5, -35]); N('sump', [14, -5, -38.5]);
      N('flag_side_door', [11, -5, -38]); N('flagroom_b', [7, -5, -38]);
      N('flag', [2, -5, -36]); N('flagroom_a', [-2, -5, -30]); N('flagroom_c', [5, -5, -29]);
      N('flagroom_door', [-6.5, -5, -27.5]); N('sp_corr', [-12, -5, -27.5]); N('sp2_bot', [-17, -5, -29.5]);
      N('sp2_mid', [-17, -3.8, -34]); N('sp_land', [-15, -2.5, -40]); N('sp1_bot', [-12, -2.5, -37.5]);
      N('sp1_top', [-12, 0, -30.5]); N('backhall_L', [-11, 0, -27.5]); N('backhall', [0, 0, -27.5]); N('backhall_R', [9, 0, -27.5]);
      N('spawn_door', [0, 0, -31]); N('spawn', [0, 0, -36]); N('spawn_L', [-4, 0, -39]); N('spawn_R', [4, 0, -39]);
      N('lobby_back', [0, 0, -23.5]); N('lobby_c', [0, 0, -18.5]); N('lobby_L', [-9, 0, -18]); N('lobby_R', [9, 0, -18]);
      N('lobby_LB', [-11, 0, -22]);
      N('door_in', [0, 0, -14]); N('door_out', [0, 0, -11.2]);
      N('ramp_bot', [-16.5, 0, -23]); N('ramp_mid', [-16.5, 3, -18.5]); N('ramp_top', [-16.5, 5.65, -13.65]);
      N('deck_L', [-11, 6, -16]); N('deck_C', [0, 6, -16.5]); N('deck_R', [11, 6, -16]); N('deck_front', [0, 6, -13.8]);
      N('deck_front_L', [-8, 6, -13.8]); N('deck_front_R', [8, 6, -13.8]);
      N('deck_door', [10, 6, -20.5]); N('upper', [10, 6, -25.5]); N('upper_R', [16, 6, -25.5]);
      N('uramp_top', [16, 5.4, -31]); N('uramp_mid', [16, 3, -35]); N('uramp_bot', [16, 0, -39.5]);
      N('landing', [12, 0, -41]); N('corr_R', [10.5, 0, -35]); N('corr_R_end', [10.5, 0, -30.5]);
      const L = (a, b, opts) => data.links.push(Object.assign({ a: pre + a, b: pre + b }, opts || {}));
      L('bridge_end', 'door_out'); L('bridge_end', 'bank_L'); L('bridge_end', 'bank_R'); L('bridge_end', 'bank_C'); L('bank_C', 'door_out');
      L('bank_L', 'water_L'); L('bank_R', 'water_R'); L('water_R', 'tun0'); L('water_L', 'water_C'); L('water_R', 'water_C');
      L('tun0', 'tun1'); L('tun1', 'tun2'); L('tun2', 'well'); L('well', 'well_out');
      L('well_out', 'drop_land', { oneWay: 1 }); L('drop_land', 'sump_corr'); L('sump_corr', 'sump'); L('sump', 'flag_side_door');
      L('flag_side_door', 'flagroom_b'); L('flagroom_b', 'flag'); L('flag', 'flagroom_a'); L('flag', 'flagroom_c'); L('flagroom_c', 'flagroom_a');
      L('flagroom_a', 'flagroom_door'); L('flagroom_door', 'sp_corr'); L('sp_corr', 'sp2_bot'); L('sp2_bot', 'sp2_mid'); L('sp2_mid', 'sp_land');
      L('sp_land', 'sp1_bot'); L('sp1_bot', 'sp1_top'); L('sp1_top', 'backhall_L'); L('backhall_L', 'backhall'); L('backhall', 'backhall_R');
      L('backhall', 'lobby_back'); L('lobby_back', 'lobby_c'); L('lobby_c', 'door_in'); L('door_in', 'door_out');
      L('lobby_c', 'lobby_L'); L('lobby_c', 'lobby_R'); L('lobby_L', 'lobby_LB'); L('lobby_LB', 'ramp_bot'); L('lobby_back', 'lobby_LB');
      L('ramp_bot', 'ramp_mid'); L('ramp_mid', 'ramp_top'); L('ramp_top', 'deck_L'); L('deck_L', 'deck_C'); L('deck_C', 'deck_R');
      L('deck_C', 'deck_front'); L('deck_L', 'deck_front_L'); L('deck_R', 'deck_front_R'); L('deck_front', 'deck_front_L'); L('deck_front', 'deck_front_R');
      L('deck_R', 'deck_door'); L('deck_door', 'upper'); L('upper', 'upper_R'); L('upper_R', 'uramp_top'); L('uramp_top', 'uramp_mid');
      L('uramp_mid', 'uramp_bot'); L('uramp_bot', 'landing'); L('landing', 'corr_R'); L('corr_R', 'corr_R_end'); L('corr_R_end', 'backhall_R');
      L('backhall', 'spawn_door'); L('spawn_door', 'spawn'); L('spawn', 'spawn_L'); L('spawn', 'spawn_R');
      L('deck_L', 'ramp_bot', { oneWay: 1, cost: 6 });          // drop into ramp room
      L('deck_front', 'bank_C', { oneWay: 1, cost: 10 });       // vault the parapet
      L('deck_front_L', 'bank_L', { oneWay: 1, cost: 10 });
      L('deck_front_R', 'bank_R', { oneWay: 1, cost: 10 });
      data.sniperSpots[team] = [pre + 'deck_front', pre + 'deck_front_L', pre + 'deck_front_R'];
      data.defense[team] = ['flag', 'flagroom_a', 'flagroom_b', 'flagroom_c', 'deck_C', 'deck_front', 'lobby_c', 'sp_corr', 'backhall', 'sump_corr'].map((n) => pre + n);
    }
    fort(BLUE); fort(RED);
    // shared middle nodes
    data.nodes.push({ name: 'mid', pos: [0, 0, 0], team: -1 });
    data.nodes.push({ name: 'water_mid', pos: [0, -3, 0], team: -1, water: 1 });
    data.nodes.push({ name: 'water_mid_L', pos: [-12, -2.5, 0], team: -1, water: 1 });
    data.nodes.push({ name: 'water_mid_R', pos: [12, -2.5, 0], team: -1, water: 1 });
    data.links.push({ a: 'b_bridge_end', b: 'mid' }, { a: 'r_bridge_end', b: 'mid' });
    data.links.push({ a: 'b_water_C', b: 'water_mid' }, { a: 'r_water_C', b: 'water_mid' });
    // red's water_R is at (-12,-2,4): mirror of (12,-2,-4). So blue water_L links to water_mid_L and red water_R too.
    data.links.push({ a: 'b_water_L', b: 'water_mid_L' }, { a: 'r_water_R', b: 'water_mid_L' });
    data.links.push({ a: 'b_water_R', b: 'water_mid_R' }, { a: 'r_water_L', b: 'water_mid_R' });
    data.links.push({ a: 'water_mid', b: 'water_mid_L' }, { a: 'water_mid', b: 'water_mid_R' });
    // bridge mid to water (drop off the bridge)
    data.links.push({ a: 'mid', b: 'water_mid', oneWay: 1, cost: 4 });

    // the covered bridge is roofed, so it needs its own lamps to stay fightable
    for (const z of [-5.5, 0, 5.5]) {
      W.fill([[-1, 3.2, z - 0.6], [1, 3.6, z + 0.6]], MAT.LIGHT);
      data.lights.push([0, 3.1, z]);
    }

    // graph: build adjacency
    const byName = {}; data.nodes.forEach((n, i) => { n.id = i; n.adj = []; byName[n.name] = n; });
    for (const l of data.links) {
      const a = byName[l.a], b = byName[l.b];
      if (!a || !b) throw new Error('bad link ' + l.a + ' ' + l.b);
      const d = Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]) + (l.cost || 0);
      a.adj.push({ to: b.id, cost: d });
      if (!l.oneWay) b.adj.push({ to: a.id, cost: d });
    }
    data.byName = byName;
    return { world, data };
  }

  const out = { buildMap, BLUE, RED, TEAM_NAMES };
  if (typeof module !== 'undefined') module.exports = out; else Object.assign(root, out);
})(typeof window !== 'undefined' ? window : globalThis);
