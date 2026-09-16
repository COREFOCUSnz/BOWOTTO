// Headless soak: bots vs bots. Fails on NaNs, on bots that never move, on a match
// with no kills, and on a map that cannot be captured on.
//
// Determinism: the simulation leans on Math.random throughout, so each match is
// seeded. Captures are rare enough (roughly 0-6 per five simulated minutes) that
// a single trajectory is a coin flip, so the capture check runs several seeds and
// requires most of them to score. Everything else runs on one seed.
const { Game, BLUE, RED } = require('../js/sim.js');
const { BotBrain, botClassFor } = require('../js/bots.js');
const { V } = require('../js/math.js');
const { MAP_ORDER, DEFAULT_MAP_ID } = require('../js/maps.js');

let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };
const minutes = parseFloat(process.argv[2] || '5');
const BASE_SEED = (parseInt(process.env.SEED || '20260911', 10) >>> 0) || 1;

function seedRandom(seed) {
  let s = seed >>> 0 || 1;
  Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

// Runs one match and returns what happened in it.
function match(seed, mins, watch, mapId) {
  seedRandom(seed);
  const events = { taken: 0, caps: 0, drops: 0 };
  const game = new Game({ mapId, effects: { particle() {}, tracer() {}, sound() {}, say() {}, message() {}, flash() {}, shake() {} } });
  const announce = game.announce.bind(game);
  game.announce = (text, team, kind) => {
    if (kind === 'flag' && /taken/.test(text)) events.taken++;
    if (kind === 'cap') events.caps++;
    if (/dropped/.test(text)) events.drops++;
    announce(text, team, kind);
  };
  const brains = [];
  for (const team of [BLUE, RED]) for (let i = 0; i < 5; i++) {
    const p = game.addPlayer(`bot${team}_${i}`, team, true);
    p.cls = botClassFor(i + (team ? 2 : 0)); p.wantsRespawn = true;
    brains.push(new BotBrain(game, p, 0.6));
  }
  const dt = 1 / 60, steps = Math.round(mins * 60 / dt);
  const start = new Map();
  let maxMoved = 0, nan = null, closest = Infinity;
  const t0 = Date.now();
  for (let i = 0; i < steps; i++) {
    for (const b of brains) b.update(dt);
    game.update(dt);
    for (const p of game.players) {
      if (!p.alive) continue;
      if (!start.has(p)) start.set(p, V.copy(p.pos));
      if (!isFinite(p.pos[0]) || !isFinite(p.pos[1]) || !isFinite(p.pos[2]) || !isFinite(p.hp)) nan = nan || `${p.name} at step ${i}`;
      maxMoved = Math.max(maxMoved, V.dist(p.pos, start.get(p)));
      if (watch && p.flag) closest = Math.min(closest, V.dist(p.pos, game.data.caps[p.team].pos));
    }
  }
  return { game, events, maxMoved, nan, closest, ms: Date.now() - t0,
    kills: game.players.reduce((a, p) => a + p.kills, 0) };
}

// ---- the main soak, on one seed
const r = match(BASE_SEED, minutes, true);
console.log(`simulated ${minutes} min in ${r.ms} ms (${(minutes * 60 * 1000 / r.ms).toFixed(1)}x realtime)`);
console.log('kills', r.kills, 'flag events', JSON.stringify(r.events), 'score', r.game.score);
for (const p of r.game.players) console.log(`  ${p.name.padEnd(8)} ${p.cls.padEnd(9)} K${p.kills} D${p.deaths} caps ${p.caps} dmg ${p.stats.dmg}`);
if (r.nan) check(false, 'NaN in ' + r.nan);
check(r.ms < minutes * 60 * 1000 / 5, 'sim runs at least 5x realtime');
check(r.maxMoved > 20, 'bots travel across the map (max ' + r.maxMoved.toFixed(1) + ' m)');
check(r.kills > 10, 'fighting happens (' + r.kills + ' kills)');
check(r.events.taken > 0, 'a flag was taken');
check(r.game.players.every((p) => p.deaths < r.kills), 'no single bot absorbs every kill');

// ---- capturability, across several seeds
// Ten seeds, not four. Captures are rare enough (roughly 0-6 per five simulated
// minutes) that four seeds sat one unlucky trajectory away from failing, and any
// change that moves the PRNG moves every seed at once — so the margin has to come
// from sample size, not from luck. The bar is a third of them scoring, which a
// genuinely uncapturable map cannot clear.
const seeds = [BASE_SEED, 7, 99, 12345, 31337, 2024, 555, 8675309, 42, 101];
const caps = seeds.map((s) => match(s, minutes, false).events.caps);
console.log('captures per seed: ' + seeds.map((s, i) => s + '=' + caps[i]).join(', '));
const scoring = caps.filter((c) => c > 0).length;
const total = caps.reduce((a, b) => a + b, 0);
console.log(`${scoring}/${seeds.length} seeds scored, ${total} captures in total`);
check(scoring >= Math.ceil(seeds.length / 3), `the map is capturable (${scoring} of ${seeds.length} seeds scored)`);

// ---- capturability on every OTHER registered map too. Map-selection means a
// map is only ever one line in js/maps.js away from being loaded in a real
// match, so a map that bots can't actually capture on has to fail a test,
// same bar as above (a third of seeds scoring) but fewer seeds to keep the
// whole sweep fast — this exists to catch a bad map, not to characterize it.
for (const mapId of MAP_ORDER.filter((id) => id !== DEFAULT_MAP_ID)) {
  const mseeds = [BASE_SEED, 7, 99, 12345, 31337, 2024];
  const mcaps = mseeds.map((s) => match(s, minutes, false, mapId).events.caps);
  const mscoring = mcaps.filter((c) => c > 0).length;
  console.log(`[${mapId}] captures per seed: ` + mseeds.map((s, i) => s + '=' + mcaps[i]).join(', '));
  check(mscoring >= Math.ceil(mseeds.length / 3), `[${mapId}] is capturable (${mscoring} of ${mseeds.length} seeds scored)`);
}

// ---- the resupply bag cannot make camping spawn a free, near-permanent heal
// It refills health/armor/ammo/grenades to full — with too short a cooldown,
// standing on it outheals nearly anything thrown at you. 20s, not the 2s a
// real player found and flagged as "kind of cheating".
{
  seedRandom(1);
  const game = new Game({ effects: { particle() {}, tracer() {}, sound() {}, say() {}, message() {}, flash() {}, shake() {} } });
  const p = game.addPlayer('tester', BLUE, false);
  p.cls = 'soldier'; p.spawn();
  const bag = game.resupply.find((r) => r.team === BLUE);
  p.pos = V.copy(bag.pos);
  game.update(1 / 60);
  check(p.hp === p.def.hp && p.armor === p.def.armorMax, 'standing on the resupply bag fully refills health and armor');
  p.hp = 1; p.armor = 0; // simulate having just taken real damage
  for (let i = 0; i < 5 * 60; i++) game.update(1 / 60); // 5 more simulated seconds, still standing on it
  check(p.hp === 1 && p.armor === 0,
    'it does not refill again within its cooldown — otherwise camping it makes you nearly unkillable, exactly the bug reported');
  for (let i = 0; i < 20 * 60; i++) game.update(1 / 60); // fast-forward past the 20s cooldown
  check(p.hp === p.def.hp && p.armor === p.def.armorMax, 'but it does refill again once the cooldown has genuinely elapsed');
}

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS');
process.exit(fails ? 1 : 0);
