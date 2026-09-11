// Difficulty must matter: godly bots should out-kill easy bots by a wide margin in a mirrored match.
const { Game, BLUE, RED } = require('../js/sim.js');
const { BotBrain, botClassFor, DIFFICULTIES } = require('../js/bots.js');
function match(minutes, skillBlue, skillRed) {
  const game = new Game({ effects: { particle() {}, tracer() {}, sound() {}, say() {}, message() {}, flash() {}, shake() {} } });
  const brains = [];
  for (const team of [BLUE, RED]) for (let i = 0; i < 5; i++) { const p = game.addPlayer(`b${team}_${i}`, team, true); p.cls = botClassFor(i); p.wantsRespawn = true; brains.push(new BotBrain(game, p, team === BLUE ? skillBlue : skillRed)); }
  const dt = 1 / 60; for (let i = 0; i < minutes * 60 / dt; i++) { for (const b of brains) b.update(dt); game.update(dt); }
  const k = (t) => game.players.filter((p) => p.team === t).reduce((a, p) => a + p.kills, 0);
  return [k(BLUE), k(RED)];
}
const [g, e] = match(4, DIFFICULTIES.godly, DIFFICULTIES.easy);
console.log(`godly ${g} kills vs easy ${e} kills`);
const ok = g > e * 1.6 && g > 20;
console.log(ok ? 'PASS godly bots dominate easy bots' : 'FAIL difficulty has too little effect');
process.exit(ok ? 0 : 1);
