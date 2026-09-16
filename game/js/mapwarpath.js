// Warpath: a TFC-inspired open battlefield. Two bunkers face off across a
// flat no-man's-land with scattered cover, instead of 2Fort's multi-level
// fort-and-moat. Same mirror-authoring pattern as map2fort.js: author blue's
// half in blue-local coordinates, mirror (x,z) -> (-x,-z) for red.
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined';
  const { World, MAT } = isNode ? require('./world.js') : root;
  const { mirrorBox, mirrorPt, finalizeGraph, newMapData } = isNode ? require('./mapkit.js') : root;
  const { BLUE, RED } = isNode ? require('./map2fort.js') : root;

  const TEAM_MAT = [MAT.BLUE, MAT.RED];

  function buildMap() {
    const world = new World([-18, -6, -46], [18, 12, 46], 0.5);
    const W = world;
    W.fill([[-18, -6, -46], [18, 0, 46]], MAT.DIRT);
    // Perimeter cliffs
    W.fill([[-18, 0, -46], [-16, 10, 46]], MAT.STONE);
    W.fill([[16, 0, -46], [18, 10, 46]], MAT.STONE);
    W.fill([[-18, 0, -46], [18, 10, -42]], MAT.STONE);
    W.fill([[-18, 0, 42], [18, 10, 46]], MAT.STONE);

    // Central rampart: a sightline-blocking earthwork crossing the whole
    // field at z=0. Both team's front doors, halls and flag rooms sit on the
    // x=0 centreline, so a gap AT x=0 would open a dead-straight, unbroken
    // sniping lane from one team's doorway straight through to the other's —
    // the two gaps sit off-centre on purpose, so crossing the rampart always
    // costs a few metres of lateral exposure instead of lining up the whole
    // battlefield down one barrel.
    W.fill([[-16, 0, -1], [16, 3, 1]], MAT.STONE);
    W.paint([[-16, 0, -1], [16, 3, 1]], MAT.DARKBRICK);
    for (const gx of [-7, 7]) W.carve([[gx - 1.5, 0, -1], [gx + 1.5, 3, 1]]);

    const data = newMapData();

    function fort(team) {
      const T = team === BLUE ? (b) => b : mirrorBox;
      const P = team === BLUE ? (p) => p : mirrorPt;
      const F = (box, mat) => W.fill(T(box), mat);
      const C = (box) => W.carve(T(box));
      const PAINT = (box, mat) => W.paint(T(box), mat);
      const teamMat = TEAM_MAT[team];

      // Bunker block: spawn + hall + flag room, one story.
      F([[-10, 0, -42], [10, 7, -24]], MAT.BRICK);
      C([[-5, 0, -40], [5, 4, -33]]);          // spawn
      C([[-1.5, 0, -33], [1.5, 4, -30]]);      // hallway
      C([[-6, 0, -30], [6, 5, -24.5]]);        // flag room
      C([[-2, 0, -25], [2, 4, -23.5]]);        // front door, through to the field
      C([[-10, 0, -28], [-6, 4, -26]]);        // west side door — a flag room with only one
      C([[6, 0, -28], [10, 4, -26]]);          // east side door — way in is unattackable

      // Materials
      PAINT([[-5, 0, -40], [5, 4, -33]], MAT.CONCRETE);
      PAINT([[-5, 2.0, -40], [5, 2.9, -33]], teamMat);
      PAINT([[-1.5, 0, -33], [1.5, 4, -30]], MAT.CONCRETE);
      PAINT([[-6, 0, -30], [6, 5, -24.5]], MAT.DARKBRICK);
      PAINT([[-10, 0, -28], [-6, 4, -26]], MAT.CONCRETE);
      PAINT([[6, 0, -28], [10, 4, -26]], MAT.CONCRETE);
      F([[-6, -0.45, -30], [6, -0.05, -29.5]], teamMat);   // flag room floor accent
      F([[-10, 6.5, -42], [10, 7, -24]], MAT.METAL);       // bunker roof band

      // Cover in the field: a staggered zigzag, not two isolated blocks, so
      // there is no clean 20 m sniping lane anywhere between the door and
      // the rampart — every straight line is broken by something within a
      // few metres (mirrors automatically via T/P).
      F([[-9, 0, -14], [-6, 1.5, -12]], MAT.STONE);
      F([[6, 0, -14], [9, 1.5, -12]], MAT.STONE);
      F([[-4.5, 0, -19], [-1.5, 1.4, -18]], MAT.STONE);
      F([[1.5, 0, -17], [4.5, 1.4, -16]], MAT.STONE);
      F([[-4, 0, -9.5], [-1, 1.4, -8.5]], MAT.STONE);
      F([[1, 0, -4.5], [4, 1.4, -3.5]], MAT.STONE);

      // Lights
      const lights = [[0, 3.5, -36], [0, 3.5, -31.5], [0, 4, -27]];
      for (const l of lights) {
        const b = [[l[0] - 1, l[1], l[2] - 1], [l[0] + 1, l[1] + 0.5, l[2] + 1]];
        F(b, MAT.LIGHT);
        data.lights.push(P([l[0], l[1] - 0.1, l[2]]));
      }
      // team door blocker at spawn entrance (keeps the enemy from spawn-camping)
      const bl = T([[-1.5, 0, -33.5], [1.5, 4, -32.5]]);
      W.blockers.push({ min: bl[0], max: bl[1], team });

      // --- gameplay data
      data.spawns[team] = [[0, 0, -36], [-2, 0, -37], [2, 0, -37], [-2, 0, -35], [2, 0, -35], [0, 0, -38]].map(P);
      data.flags[team] = { home: P([0, 0, -27]) };
      data.caps[team] = { pos: P([0, 0, -27]), r: 2.5 };
      data.resupply.push({ pos: P([0, 0, -38]), team });
      data.items.push({ pos: P([-3, 0, -35]), type: 'health' });
      data.items.push({ pos: P([3, 0, -35]), type: 'ammo' });
      data.items.push({ pos: P([-4, 0, -26.5]), type: 'ammo' });
      data.items.push({ pos: P([4, 0, -26.5]), type: 'health' });
      data.items.push({ pos: P([-7.5, 0, -15]), type: 'health' });
      data.items.push({ pos: P([7.5, 0, -15]), type: 'ammo' });

      // --- waypoints (blue-local)
      const pre = team === BLUE ? 'b_' : 'r_';
      const N = (name, p, opts) => data.nodes.push(Object.assign({ name: pre + name, pos: P(p), team }, opts || {}));
      N('spawn', [0, 0, -36]); N('spawn_L', [-2, 0, -37]); N('spawn_R', [2, 0, -37]);
      N('hall', [0, 0, -31.5]);
      N('flagroom_a', [-3, 0, -27]); N('flag', [0, 0, -27]); N('flagroom_c', [3, 0, -27]);
      N('side_L', [-8, 0, -27]); N('side_R', [8, 0, -27]);
      N('front', [0, 0, -22]);
      N('cover_L', [-7.5, 0, -15]); N('cover_R', [7.5, 0, -15]);
      N('mid_approach', [0, 0, -8]);

      const L = (a, b, opts) => data.links.push(Object.assign({ a: pre + a, b: pre + b }, opts || {}));
      L('spawn', 'spawn_L'); L('spawn', 'spawn_R'); L('spawn', 'hall');
      L('hall', 'flagroom_a'); L('hall', 'flagroom_c'); L('flagroom_a', 'flag'); L('flag', 'flagroom_c');
      L('flag', 'front'); L('front', 'cover_L'); L('front', 'cover_R'); L('front', 'mid_approach');
      L('cover_L', 'mid_approach'); L('cover_R', 'mid_approach');
      L('flagroom_a', 'side_L'); L('side_L', 'cover_L');
      L('flagroom_c', 'side_R'); L('side_R', 'cover_R');

      data.sniperSpots[team] = [pre + 'front'];
      data.defense[team] = ['flag', 'flagroom_a', 'flagroom_c', 'side_L', 'side_R', 'front', 'hall'].map((n) => pre + n);
    }
    fort(BLUE); fort(RED);

    // shared gap nodes: the two off-centre crossings through the rampart
    data.nodes.push({ name: 'gap_L', pos: [-7, 0, 0], team: -1 });
    data.nodes.push({ name: 'gap_R', pos: [7, 0, 0], team: -1 });
    // no direct gap_L <-> gap_R link: solid rampart runs between them, so
    // rotating from one crossing to the other means stepping back through
    // mid_approach on one side, not walking through the wall
    for (const g of ['gap_L', 'gap_R']) {
      data.links.push({ a: 'b_mid_approach', b: g }, { a: 'r_mid_approach', b: g });
    }

    // no-man's-land lighting isn't needed outdoors (sun handles it)

    finalizeGraph(data);
    return { world, data };
  }

  const out = { buildMap };
  // Not Object.assign(root, out): a plain <script> has no per-file module
  // scope, so every map file exporting a same-named `buildMap` onto window
  // clobbers whichever map loaded before it — map2fort.js's own buildMap
  // included. Each map gets its own MAP_<ID> global instead; maps.js reads
  // from that in the browser.
  if (isNode) module.exports = out; else root.MAP_WARPATH = out;
})(typeof window !== 'undefined' ? window : globalThis);
