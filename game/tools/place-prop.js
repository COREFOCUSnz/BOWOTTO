// Put an extracted prop on the map, or list/remove what is placed. Placements live
// in models.json so the game picks them up with no code change.
//
//   node tools/place-prop.js list
//   node tools/place-prop.js add <prop> <x> <y> <z> [--yaw=deg] [--scale=1] [--glow] [--team=red|blue]
//   node tools/place-prop.js rm <index>
//   node tools/place-prop.js clear [prop]
//
// Coordinates are world metres, matching the map source in js/map2fort.js: +z is
// toward red, y is up, and a prop's origin is the centre of its base (extract-prop.js
// normalises it there), so y is the floor height you want it standing on.
const fs = require('fs'), path = require('path');
const argv = process.argv.slice(2);
const flags = {}, pos = [];
for (const a of argv) { const m = /^--([a-zA-Z]+)(?:=(.*))?$/.exec(a); if (m) flags[m[1]] = m[2] === undefined ? true : m[2]; else pos.push(a); }

const MF = path.join(__dirname, '..', 'assets', 'models', 'models.json');
const manifest = JSON.parse(fs.readFileSync(MF, 'utf8'));
manifest.placements = manifest.placements || [];
const props = manifest.props || {};
const save = () => fs.writeFileSync(MF, JSON.stringify(manifest, null, 1));

const show = () => {
  if (!manifest.placements.length) return console.log('(nothing placed)');
  manifest.placements.forEach((p, i) => console.log(
    `${String(i).padStart(3)}  ${p.prop.padEnd(14)} at ${p.pos.map((v) => v.toFixed(1)).join(', ')}` +
    `  yaw ${((p.yaw || 0) * 180 / Math.PI).toFixed(0)}  scale ${p.scale || 1}${p.glow ? '  glow ' + (p.team === 1 ? 'red' : 'blue') : ''}`));
};

const cmd = pos[0];
if (cmd === 'list' || !cmd) {
  console.log('props available: ' + (Object.keys(props).join(', ') || '(none — run extract-prop.js first)'));
  show();
} else if (cmd === 'add') {
  const [, name, x, y, z] = pos;
  if (!name || z === undefined) { console.error('usage: place-prop.js add <prop> <x> <y> <z> [--yaw=deg] [--scale=1] [--glow] [--team=red|blue]'); process.exit(1); }
  if (!props[name]) { console.error(`no prop "${name}" in the manifest (have: ${Object.keys(props).join(', ') || 'none'})`); process.exit(1); }
  const pl = { prop: name, pos: [+x, +y, +z] };
  if (flags.yaw) pl.yaw = +flags.yaw * Math.PI / 180;
  if (flags.scale) pl.scale = +flags.scale;
  if (flags.glow) { pl.glow = true; pl.team = flags.team === 'red' ? 1 : 0; }
  manifest.placements.push(pl); save();
  console.log(`placed ${name} (${props[name].size.join(' x ')} m) — now ${manifest.placements.length} on the map`);
  show();
} else if (cmd === 'rm') {
  const i = +pos[1];
  if (!(i >= 0 && i < manifest.placements.length)) { console.error('no placement ' + pos[1]); process.exit(1); }
  console.log('removed ' + manifest.placements[i].prop);
  manifest.placements.splice(i, 1); save(); show();
} else if (cmd === 'clear') {
  const name = pos[1];
  const before = manifest.placements.length;
  manifest.placements = name ? manifest.placements.filter((p) => p.prop !== name) : [];
  save();
  console.log(`cleared ${before - manifest.placements.length} placement(s)`);
} else { console.error('unknown command ' + cmd); process.exit(1); }
