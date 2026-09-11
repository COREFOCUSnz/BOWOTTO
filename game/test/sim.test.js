// Headless soak: bots vs bots for a few minutes of simulated time. Fails on NaNs,
// on bots that never move, on a match with no kills, and on no flag activity.
const { Game, BLUE, RED } = require('../js/sim.js');
const { BotBrain, botClassFor } = require('../js/bots.js');
const { V } = require('../js/math.js');
let fails = 0; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };
const minutes = parseFloat(process.argv[2] || '5');
const msgs = [];
const game = new Game({ effects: { particle() {}, tracer() {}, sound() {}, say() {}, message(t) { if (t) msgs.push(t); }, flash() {}, shake() {} } });
const brains = [];
for (const team of [BLUE, RED]) for (let i = 0; i < 5; i++) {
  const p = game.addPlayer(`bot${team}_${i}`, team, true); p.cls = botClassFor(i + (team ? 2 : 0)); p.wantsRespawn = true;
  brains.push(new BotBrain(game, p, 0.6));
}
const dt = 1 / 60; const steps = Math.round(minutes * 60 / dt);
const t0 = Date.now(); let maxMoved = 0; const start = new Map();
let events = { taken: 0, caps: 0, drops: 0 };
const origAnnounce = game.announce.bind(game);
game.announce = (text, team, kind) => { if (kind === 'flag' && /taken/.test(text)) events.taken++; if (kind === 'cap') events.caps++; if (/dropped/.test(text)) events.drops++; origAnnounce(text, team, kind); };
for (let i = 0; i < steps; i++) {
  for (const b of brains) b.update(dt);
  game.update(dt);
  for (const p of game.players) {
    if (!p.alive) continue;
    if (!start.has(p)) start.set(p, V.copy(p.pos));
    if (!isFinite(p.pos[0]) || !isFinite(p.pos[1]) || !isFinite(p.pos[2]) || !isFinite(p.hp)) { check(false, `NaN in ${p.name} at step ${i}`); process.exit(1); }
    maxMoved = Math.max(maxMoved, V.dist(p.pos, start.get(p)));
  }
}
const ms = Date.now() - t0;
console.log(`simulated ${minutes} min in ${ms} ms (${(minutes * 60 * 1000 / ms).toFixed(1)}x realtime)`);
const kills = game.players.reduce((a, p) => a + p.kills, 0);
console.log('kills', kills, 'flag events', JSON.stringify(events), 'score', game.score, 'sentries', game.sentries.length, 'projectiles alive', game.projectiles.length);
for (const p of game.players) console.log(`  ${p.name.padEnd(8)} ${p.cls.padEnd(9)} K${p.kills} D${p.deaths} caps ${p.caps} dmg ${p.stats.dmg} alive=${p.alive} at ${p.pos.map((v) => v.toFixed(1))}`);
check(ms < minutes * 60 * 1000 / 5, 'sim runs at least 5x realtime');
check(maxMoved > 20, 'bots travel across the map (max ' + maxMoved.toFixed(1) + ' m)');
check(kills > 10, 'fighting happens (' + kills + ' kills)');
check(events.taken > 0, 'a flag was taken');
check(events.caps > 0 || minutes < 5, 'a flag was captured (needs a run of 5+ minutes)');
check(game.players.every((p) => p.deaths < kills), 'no single bot absorbs every kill');
console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS');
process.exit(fails ? 1 : 0);
