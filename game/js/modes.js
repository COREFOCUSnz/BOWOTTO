// Game mode registry, alongside js/maps.js's map registry. A mode is pure
// metadata plus the id Game()/BotBrain branch on — there's no build step
// like a map has, since a mode doesn't change the world, only the rules
// running on top of it.
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined';

  const MODES = {
    ctf: {
      id: 'ctf', name: 'Capture the Flag',
      desc: 'The original. Take the enemy flag to your own capture zone. First to the cap limit, or the highest score when the clock runs out, wins.',
    },
    tdm: {
      id: 'tdm', name: 'Team Deathmatch',
      desc: 'No flag, no capture zone — just frags. Ten minutes on the clock, then the game moves on to a different map. Teams stay as picked for the whole match.',
    },
    elimination: {
      id: 'elimination', name: 'Elimination',
      desc: 'One life per class. Die and you respawn as a different one — burn through all nine and you\'re out for the round, spectating. Last team with a player left standing wins.',
    },
  };
  const MODE_ORDER = ['ctf', 'tdm', 'elimination'];
  const DEFAULT_MODE_ID = 'ctf';

  const out = { MODES, MODE_ORDER, DEFAULT_MODE_ID };
  if (isNode) module.exports = out; else Object.assign(root, out);
})(typeof window !== 'undefined' ? window : globalThis);
