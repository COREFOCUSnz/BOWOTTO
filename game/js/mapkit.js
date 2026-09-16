// Shared helpers for map authoring: every CTF map mirrors a blue-local layout
// across (x,z) -> (-x,-z) to build red's half (see map2fort.js for the
// original pattern), then needs the same node/link graph finalized into an
// adjacency list. Pulled out here once real duplication showed up across
// multiple map files, rather than guessed at in advance.
(function (root) {
  'use strict';

  function mirrorBox(b) { return [[-b[1][0], b[0][1], -b[1][2]], [-b[0][0], b[1][1], -b[0][2]]]; }
  function mirrorPt(p) { return [-p[0], p[1], -p[2]]; }

  // Turns {nodes, links} into a usable graph: assigns ids, builds each node's
  // adjacency list (cost = distance + any per-link surcharge), and an
  // id-by-name index. Mutates and returns `data`.
  function finalizeGraph(data) {
    const byName = {};
    data.nodes.forEach((n, i) => { n.id = i; n.adj = []; byName[n.name] = n; });
    for (const l of data.links) {
      const a = byName[l.a], b = byName[l.b];
      if (!a || !b) throw new Error('bad link ' + l.a + ' ' + l.b);
      const d = Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]) + (l.cost || 0);
      a.adj.push({ to: b.id, cost: d });
      if (!l.oneWay) b.adj.push({ to: a.id, cost: d });
    }
    data.byName = byName;
    return data;
  }

  // A fresh gameplay-data skeleton every map's buildMap() starts from.
  function newMapData() {
    return { spawns: [[], []], flags: [], caps: [], items: [], resupply: [], nodes: [], links: [], sniperSpots: [[], []], defense: [[], []], lights: [], screens: [] };
  }

  const out = { mirrorBox, mirrorPt, finalizeGraph, newMapData };
  if (typeof module !== 'undefined') module.exports = out; else Object.assign(root, out);
})(typeof window !== 'undefined' ? window : globalThis);
