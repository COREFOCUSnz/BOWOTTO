// Headless soak for the two non-CTF game modes: Team Deathmatch and
// Elimination. Mirrors test/sim.test.js's approach (seeded bots-vs-bots,
// fails on NaN / no combat / a mode's own win condition never firing) but
// for game.mode instead of the default CTF.
const { Game, BLUE, RED } = require('../js/sim.js');
const { BotBrain, botClassFor } = require('../js/bots.js');
const { MAP_ORDER } = require('../js/maps.js');
const { CLASS_ORDER } = require('../js/defs.js');

let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };

function seedRandom(seed) {
  let s = seed >>> 0 || 1;
  Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

function match(seed, mode, mins, mapId, roundLength) {
  seedRandom(seed);
  const game = new Game({ mode, mapId, roundLength, effects: { particle() {}, tracer() {}, sound() {}, say() {}, message() {}, flash() {}, shake() {} } });
  const brains = [];
  for (const team of [BLUE, RED]) for (let i = 0; i < 5; i++) {
    const p = game.addPlayer(`bot${team}_${i}`, team, true);
    p.cls = botClassFor(i + (team ? 2 : 0)); p.wantsRespawn = true;
    brains.push(new BotBrain(game, p, 0.6));
  }
  const dt = 1 / 60, steps = Math.round(mins * 60 / dt);
  const start = new Map();
  let nan = null, maxMoved = 0;
  for (let i = 0; i < steps; i++) {
    for (const b of brains) b.update(dt);
    game.update(dt);
    for (const p of game.players) {
      if (!p.alive) continue;
      if (!start.has(p)) start.set(p, [p.pos[0], p.pos[2]]);
      if (!isFinite(p.pos[0]) || !isFinite(p.hp)) nan = nan || `${p.name} at step ${i}`;
      const s = start.get(p);
      maxMoved = Math.max(maxMoved, Math.hypot(p.pos[0] - s[0], p.pos[2] - s[1]));
    }
  }
  return { game, nan, maxMoved, kills: game.players.reduce((a, p) => a + p.kills, 0) };
}

// ---- Team Deathmatch: default map, one seed, just past the round length
{
  const r = match(20260911, 'tdm', 10.5);
  if (r.nan) check(false, 'NaN in ' + r.nan);
  check(r.game.mode === 'tdm', 'mode is tdm');
  check(r.game.roundLength === 600, 'TDM defaults to a 10-minute round (' + r.game.roundLength + 's)');
  check(r.maxMoved > 20, 'bots travel across the map (max ' + r.maxMoved.toFixed(1) + ' m)');
  check(r.kills > 10, 'fighting happens (' + r.kills + ' kills)');
  const totalScore = r.game.score[0] + r.game.score[1];
  check(totalScore === r.kills, `team score is a running kill tally (score ${JSON.stringify(r.game.score)} sums to ${totalScore}, ${r.kills} kills — team-kills subtract from the killer's own score but never touch this team total)`);
  check(r.game.players.every((p) => p.caps === 0), 'no captures happen — the flag is off in this mode');
  check(r.game.roundOver, 'the round ends on the clock, same mechanism as CTF');
}

// ---- Elimination: default map, confirm class rotation and the eventual win
{
  seedRandom(1);
  const game = new Game({ mode: 'elimination', effects: { particle() {}, tracer() {}, sound() {}, say() {}, message() {}, flash() {}, shake() {} } });
  const p = game.addPlayer('tester', BLUE, false);
  p.cls = 'scout'; p.wantsRespawn = true; p.spawn();
  check(p.cls === 'scout', 'first life keeps whatever class was assigned, not auto-picked');
  const seen = [p.cls];
  for (let i = 0; i < CLASS_ORDER.length - 1; i++) {
    game.kill(p, null, 'fall'); // suicide, simplest way to force a death in this test
    if (!p.eliminated) { p.spawn(); seen.push(p.cls); }
  }
  check(seen.length === CLASS_ORDER.length, `cycled through all ${CLASS_ORDER.length} classes before running out (saw ${seen.length}: ${seen.join(', ')})`);
  check(new Set(seen).size === CLASS_ORDER.length, 'every class in that run was distinct — none repeated before all nine were spent');
  game.kill(p, null, 'fall'); // the 9th death: no classes left
  check(p.eliminated, 'eliminated once every class has been spent');
  check(!p.wantsRespawn, 'an eliminated player does not queue up to respawn');
}

// ---- Elimination: a team is eliminated once every one of its players is
{
  seedRandom(2);
  const game = new Game({ mode: 'elimination', effects: { particle() {}, tracer() {}, sound() {}, say() {}, message() {}, flash() {}, shake() {} } });
  const blue = [game.addPlayer('b0', BLUE, true), game.addPlayer('b1', BLUE, true)];
  const red = game.addPlayer('r0', RED, true);
  for (const p of [...blue, red]) { p.wantsRespawn = true; p.spawn(); }
  for (const p of blue) for (let i = 0; i < CLASS_ORDER.length; i++) { game.kill(p, null, 'fall'); if (!p.eliminated) p.spawn(); }
  check(blue.every((p) => p.eliminated), 'both blue players are eliminated');
  check(!red.eliminated, 'red, untouched, is not');
  check(game.roundOver, 'the round ends once a whole team is eliminated, not just one player');
  check(game.score[0] === 0 && game.score[1] === 1, 'red is recorded as the winner (score ' + JSON.stringify(game.score) + ')');
}

// ---- roamers actually cross into enemy territory on every map, not just
// patrol their own base forever (caught for real on Warpath: 0 kills in a
// 3-minute soak because its defense/sniper nodes never left its own base)
for (const mapId of MAP_ORDER) {
  for (const mode of ['tdm', 'elimination']) {
    const r = match(1, mode, 3, mapId);
    check(!r.nan, `[${mapId}] ${mode}: no NaN`);
    check(r.kills > 0, `[${mapId}] ${mode}: bots actually fight (${r.kills} kills in 3 min)`);
  }
}

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS');
process.exit(fails ? 1 : 0);
