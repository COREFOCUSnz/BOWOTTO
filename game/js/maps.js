// Map registry: every map the game can load, keyed by a short id. Adding a
// map means writing js/map<id>.js (same buildMap() -> {world, data} shape as
// map2fort.js) and adding one line here — nothing else needs to know a new
// map exists. Picking a map (see game.js) persists the id and reloads the
// page, since a map change means a brand new World/waypoint graph, not
// something worth hot-swapping into a running match.
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined';
  const map2fort = isNode ? require('./map2fort.js') : root;

  const MAPS = {
    '2fort': {
      id: '2fort', name: '2Fort', build: map2fort.buildMap,
      desc: 'Two mirrored forts face off across a moat and a covered bridge. The original — water route, spiral basement, battlements sniper deck.',
    },
  };
  const MAP_ORDER = ['2fort'];
  const DEFAULT_MAP_ID = '2fort';

  const out = { MAPS, MAP_ORDER, DEFAULT_MAP_ID };
  if (isNode) module.exports = out; else Object.assign(root, out);
})(typeof window !== 'undefined' ? window : globalThis);
