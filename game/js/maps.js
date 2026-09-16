// Map registry: every map the game can load, keyed by a short id. Adding a
// map means writing js/map<id>.js (same buildMap() -> {world, data} shape as
// map2fort.js) and adding one line here — nothing else needs to know a new
// map exists. Picking a map (see game.js) persists the id and reloads the
// page, since a map change means a brand new World/waypoint graph, not
// something worth hot-swapping into a running match.
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined';
  // map2fort.js is the one exception that still exports onto the bare window
  // (BLUE/RED/TEAM_NAMES are consumed that way from several other files) —
  // every OTHER map exports under its own MAP_<ID> global instead, so two
  // map files' same-named buildMap() don't clobber each other the way a
  // plain <script> otherwise would. See js/mapwarpath.js.
  const map2fort = isNode ? require('./map2fort.js') : root;
  const mapwarpath = isNode ? require('./mapwarpath.js') : root.MAP_WARPATH;
  const mapwell = isNode ? require('./mapwell.js') : root.MAP_WELL;
  const maprock2 = isNode ? require('./maprock2.js') : root.MAP_ROCK2;
  const mapcasbah = isNode ? require('./mapcasbah.js') : root.MAP_CASBAH;
  const mapthunderdome = isNode ? require('./mapthunderdome.js') : root.MAP_THUNDERDOME;
  const mapghosttown = isNode ? require('./mapghosttown.js') : root.MAP_GHOSTTOWN;
  const mapfrostbite = isNode ? require('./mapfrostbite.js') : root.MAP_FROSTBITE;
  const mapneonsprawl = isNode ? require('./mapneonsprawl.js') : root.MAP_NEONSPRAWL;
  const mapscrapyard = isNode ? require('./mapscrapyard.js') : root.MAP_SCRAPYARD;

  const MAPS = {
    '2fort': {
      id: '2fort', name: '2Fort', build: map2fort.buildMap,
      desc: 'Two mirrored forts face off across a moat and a covered bridge. The original — water route, spiral basement, battlements sniper deck.',
    },
    warpath: {
      id: 'warpath', name: 'Warpath', build: mapwarpath.buildMap,
      desc: 'Two bunkers dug in on either side of an open no-man\'s-land. No water, no basement — just cover, sightlines, and a straight run at the flag.',
    },
    well: {
      id: 'well', name: 'Well', build: mapwell.buildMap,
      desc: 'Three parallel corridors run from each flag room into a shared central hub. Desert stone, no water despite the name, three ways in.',
    },
    rock2: {
      id: 'rock2', name: 'Rock2', build: maprock2.buildMap,
      desc: 'A rock canyon cut with three parallel passages into a shared centre. Well\'s layout, a harsher palette, tighter cover.',
    },
    casbah: {
      id: 'casbah', name: 'Casbah', build: mapcasbah.buildMap,
      desc: 'A walled bazaar: brick and timber, three market lanes into a crate-stalled central square.',
    },
    thunderdome: {
      id: 'thunderdome', name: 'Thunderdome', build: mapthunderdome.buildMap,
      desc: 'A floodlit gladiatorial arena. Concrete, steel and glare — three tunnels open onto a caged fighting pit.',
    },
    ghosttown: {
      id: 'ghosttown', name: 'Ghost Town', build: mapghosttown.buildMap,
      desc: 'An abandoned frontier town. Weathered wood and dust, three back streets into an empty town square.',
    },
    frostbite: {
      id: 'frostbite', name: 'Frostbite Keep', build: mapfrostbite.buildMap,
      desc: 'A frozen keep, pale stone under ice. Three frost-locked passages into a courtyard that never thaws.',
    },
    neonsprawl: {
      id: 'neonsprawl', name: 'Neon Sprawl', build: mapneonsprawl.buildMap,
      desc: 'A cyberpunk back-alley sprawl. Metal and grating under glaring light, three alleys into a neon-lit plaza.',
    },
    scrapyard: {
      id: 'scrapyard', name: 'Scrapyard Siege', build: mapscrapyard.buildMap,
      desc: 'A rusted junkyard under siege. Dark brick and scrap metal, three lanes into a car-crusher compactor yard.',
    },
  };
  const MAP_ORDER = ['2fort', 'warpath', 'well', 'rock2', 'casbah', 'thunderdome', 'ghosttown', 'frostbite', 'neonsprawl', 'scrapyard'];
  const DEFAULT_MAP_ID = '2fort';

  const out = { MAPS, MAP_ORDER, DEFAULT_MAP_ID };
  if (isNode) module.exports = out; else Object.assign(root, out);
})(typeof window !== 'undefined' ? window : globalThis);
