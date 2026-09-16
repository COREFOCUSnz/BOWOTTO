// Thunderdome: an original "wild" map, not based on a real TFC level. Same
// proven three-corridor-into-a-hub skeleton as Casbah — real dividing walls
// between lanes, a cover block at two points down each one, no open room
// over ~8 m undivided — themed as a floodlit gladiatorial arena: concrete
// and steel, lightning-white lights, a fighting pit for a hub.
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined';
  const { World, MAT } = isNode ? require('./world.js') : root;
  const { mirrorBox, mirrorPt, finalizeGraph, newMapData } = isNode ? require('./mapkit.js') : root;
  const { BLUE, RED } = isNode ? require('./map2fort.js') : root;

  const TEAM_MAT = [MAT.BLUE, MAT.RED];
  const GAPS = [[-11, -7], [-2, 2], [7, 11]];

  function buildMap() {
    const world = new World([-20, -6, -44], [20, 12, 44], 0.5);
    const W = world;
    W.fill([[-20, -6, -44], [20, 0, 44]], MAT.DIRT);
    W.fill([[-20, 0, -44], [-18, 10, 44]], MAT.STONE);
    W.fill([[18, 0, -44], [20, 10, 44]], MAT.STONE);
    W.fill([[-20, 0, -44], [20, 10, -40]], MAT.STONE);
    W.fill([[-20, 0, 40], [20, 10, 44]], MAT.STONE);

    const data = newMapData();

    function fort(team) {
      const T = team === BLUE ? (b) => b : mirrorBox;
      const P = team === BLUE ? (p) => p : mirrorPt;
      const F = (box, mat) => W.fill(T(box), mat);
      const C = (box) => W.carve(T(box));
      const PAINT = (box, mat) => W.paint(T(box), mat);
      const teamMat = TEAM_MAT[team];

      F([[-13, 0, -40], [13, 6, -22]], MAT.CONCRETE);
      C([[-6, 0, -38], [6, 4, -31]]);          // spawn
      C([[-2, 0, -31], [2, 4, -28]]);          // hallway
      C([[-12, 0, -28], [12, 5, -22]]);        // flag room, one wide room with three exits
      F([[-5, 0, -27], [-4, 4, -25]], MAT.METAL);   // dividing pillars: no open room
      F([[4, 0, -25], [5, 4, -23]], MAT.METAL);     // over ~8 m stays undivided
      F([[-13, 0, -22], [13, 5, -21.5]], MAT.CONCRETE);    // flag room's own south wall
      for (const [gx0, gx1] of GAPS) C([[gx0, 0, -22], [gx1, 4, -21.5]]);   // the three doors
      for (const [gx0, gx1] of GAPS) C([[gx0, 0, -21.5], [gx1, 4, -4]]);    // the three tunnels
      for (const [wx0, wx1] of [[-13, -11], [-7, -2], [2, 7], [11, 13]]) {
        F([[wx0, 0, -21.5], [wx1, 5, -4]], MAT.CONCRETE);  // walls BETWEEN the lanes
      }
      // a barricade at two points down each lane
      F([[-10.5, 0, -14.5], [-9.5, 2.2, -13.5]], MAT.METAL);
      F([[-1.5, 0, -14.5], [-0.5, 2.2, -13.5]], MAT.METAL);
      F([[8, 0, -14.5], [9, 2.2, -13.5]], MAT.METAL);
      F([[-8.5, 0, -7.5], [-7.5, 2.2, -6.5]], MAT.METAL);
      F([[0.5, 0, -7.5], [1.5, 2.2, -6.5]], MAT.METAL);
      F([[9.5, 0, -7.5], [10.5, 2.2, -6.5]], MAT.METAL);

      // Materials — floodlit arena, not a bunker
      PAINT([[-6, 0, -38], [6, 4, -31]], MAT.CONCRETE);
      PAINT([[-6, 2.0, -38], [6, 2.9, -31]], teamMat);
      PAINT([[-2, 0, -31], [2, 4, -28]], MAT.CONCRETE);
      PAINT([[-12, 0, -28], [12, 5, -22]], MAT.METAL);
      F([[-12, -0.45, -28], [12, -0.05, -27.5]], teamMat);   // flag room floor accent
      for (const [gx0, gx1] of GAPS) PAINT([[gx0, 0, -21.5], [gx1, 4, -4]], MAT.GRATE);
      F([[-13, 5.5, -40], [13, 6, -22]], MAT.METAL);

      // Lights — floodlights, more of them, brighter arena feel
      const lights = [[0, 3.5, -35], [0, 3.5, -30], [-8, 4, -25], [0, 4, -25], [8, 4, -25],
        [-9, 3, -13], [0, 3, -13], [9, 3, -13], [-9, 3, -18], [0, 3, -18], [9, 3, -18]];
      for (const l of lights) {
        const b = [[l[0] - 1, l[1], l[2] - 1], [l[0] + 1, l[1] + 0.5, l[2] + 1]];
        F(b, MAT.LIGHT);
        data.lights.push(P([l[0], l[1] - 0.1, l[2]]));
      }
      const bl = T([[-2, 0, -31.5], [2, 4, -30.5]]);
      W.blockers.push({ min: bl[0], max: bl[1], team });

      // --- gameplay data
      data.spawns[team] = [[0, 0, -34], [-2, 0, -35], [2, 0, -35], [-2, 0, -33], [2, 0, -33], [0, 0, -36]].map(P);
      data.flags[team] = { home: P([0, 0, -25]) };
      data.caps[team] = { pos: P([0, 0, -25]), r: 2.5 };
      data.resupply.push({ pos: P([0, 0, -36]), team });
      data.items.push({ pos: P([-3, 0, -34]), type: 'health' });
      data.items.push({ pos: P([3, 0, -34]), type: 'ammo' });
      data.items.push({ pos: P([-9, 0, -25]), type: 'ammo' });
      data.items.push({ pos: P([9, 0, -25]), type: 'health' });
      data.items.push({ pos: P([-9, 0, -10]), type: 'health' });
      data.items.push({ pos: P([9, 0, -10]), type: 'ammo' });

      // --- waypoints (blue-local)
      const pre = team === BLUE ? 'b_' : 'r_';
      const N = (name, p, opts) => data.nodes.push(Object.assign({ name: pre + name, pos: P(p), team }, opts || {}));
      N('spawn', [0, 0, -34]);
      N('hall', [0, 0, -29.5]);
      N('flagroom_a', [-8, 0, -25]); N('flag', [0, 0, -25]); N('flagroom_c', [8, 0, -25]);
      N('corr_L1', [-9, 0, -18]); N('corr_L2', [-9, 0, -10]); N('hub_L', [-9, 0, -4]);
      N('corr_C1', [0, 0, -18]); N('corr_C2', [0, 0, -10]); N('hub_C', [0, 0, -4]);
      N('corr_R1', [9, 0, -18]); N('corr_R2', [9, 0, -10]); N('hub_R', [9, 0, -4]);

      const L = (a, b, opts) => data.links.push(Object.assign({ a: pre + a, b: pre + b }, opts || {}));
      L('spawn', 'hall'); L('hall', 'flagroom_a'); L('hall', 'flag'); L('hall', 'flagroom_c');
      L('flagroom_a', 'flag'); L('flag', 'flagroom_c');
      L('flagroom_a', 'corr_L1'); L('corr_L1', 'corr_L2'); L('corr_L2', 'hub_L');
      L('flag', 'corr_C1'); L('corr_C1', 'corr_C2'); L('corr_C2', 'hub_C');
      L('flagroom_c', 'corr_R1'); L('corr_R1', 'corr_R2'); L('corr_R2', 'hub_R');

      data.sniperSpots[team] = [pre + 'corr_C1'];
      data.defense[team] = ['flag', 'flagroom_a', 'flagroom_c', 'hub_L', 'hub_C', 'hub_R'].map((n) => pre + n);
    }
    fort(BLUE); fort(RED);

    // The fighting pit: shared, built once.
    for (const z of [-4.5, 4]) W.fill([[-13, 0, z], [13, 7, z + 0.5]], MAT.CONCRETE);
    for (const [gx0, gx1] of GAPS) {
      W.carve([[gx0, 0, -4.5], [gx1, 4, -4]]);
      W.carve([[gx0, 0, 4], [gx1, 4, 4.5]]);
    }
    W.fill([[-13.5, 0, -4], [-13, 7, 4]], MAT.CONCRETE);
    W.fill([[13, 0, -4], [13.5, 7, 4]], MAT.CONCRETE);
    W.fill([[-13.5, 6, -4.5], [13.5, 6.5, 4.5]], MAT.METAL);
    W.carve([[-13, 0, -4], [13, 6, 4]]);
    W.paint([[-13, 0, -4], [13, 6, 4]], MAT.GRATE);
    W.fill([[-5, 0, -2], [-3.5, 5, -0.5]], MAT.METAL);
    W.fill([[3.5, 0, 0.5], [5, 5, 2]], MAT.METAL);
    W.fill([[-10, 0, -2], [-8.5, 5, -0.5]], MAT.METAL);
    W.fill([[-10, 0, 0.5], [-8.5, 5, 2]], MAT.METAL);
    W.fill([[8.5, 0, -2], [10, 5, -0.5]], MAT.METAL);
    W.fill([[8.5, 0, 0.5], [10, 5, 2]], MAT.METAL);
    for (const p of [[0, 3.5, -3.5], [0, 3.5, 3.5], [-9, 3.5, 0], [9, 3.5, 0]]) {
      W.fill([[p[0] - 1, p[1], p[2] - 1], [p[0] + 1, p[1] + 0.5, p[2] + 1]], MAT.LIGHT);
      data.lights.push([p[0], p[1] - 0.1, p[2]]);
    }

    data.nodes.push({ name: 'hub_mid', pos: [0, 0, 0], team: -1 });
    for (const g of ['hub_L', 'hub_C', 'hub_R']) {
      data.links.push({ a: 'b_' + g, b: 'hub_mid' }, { a: 'r_' + g, b: 'hub_mid' });
    }

    finalizeGraph(data);
    return { world, data };
  }

  const out = { buildMap };
  if (isNode) module.exports = out; else root.MAP_THUNDERDOME = out;
})(typeof window !== 'undefined' ? window : globalThis);
