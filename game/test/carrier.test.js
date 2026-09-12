// One blue bot, no enemies: it must grab the red flag and capture it within a few minutes.
const { Game, BLUE, RED } = require('../js/sim.js');
const { BotBrain } = require('../js/bots.js');
const { V } = require('../js/math.js');
const game = new Game({ effects: { particle() {}, tracer() {}, sound() {}, say() {}, message() {}, flash() {}, shake() {} } });
const p = game.addPlayer('runner', BLUE, true); p.cls = process.argv[2] || 'scout'; p.wantsRespawn = true;
const b = new BotBrain(game, p, 0.6); b.role = 'offense'; b.roleSet = true;
const dt = 1 / 60; let t = 0, took = -1, capped = -1, lastLog = 0;
while (t < 300 && capped < 0) {
  b.update(dt); game.update(dt); t += dt;
  if (p.flag && took < 0) took = t;
  if (game.score[BLUE] > 0) capped = t;
  if (t - lastLog > 10) { lastLog = t; console.log(`t=${t.toFixed(0)} pos=${p.pos.map((v) => v.toFixed(1))} goal=${b.goalKey} node=${b.path && b.path[b.pathI] && b.path[b.pathI].name} flag=${!!p.flag} stuck=${b.stuckT.toFixed(1)}`); }
}
console.log(`took flag at ${took.toFixed(1)}s, capped at ${capped.toFixed(1)}s`);
if (capped < 0) { console.log('FAIL no capture'); process.exit(1); } else console.log('PASS capture');
