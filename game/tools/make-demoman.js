// Build a Demoman from scratch, onto the rig the mercenaries already use.
//
// Every other character in the game came from a supplied glTF. There is no
// Demoman in that set — he wears the Soldier's body — and no source model to
// import. So this generates one: primitives laid out around the existing
// skeleton, skinned to it, and written straight out as a .tfm.
//
// It reuses the Soldier's bones verbatim rather than inventing a skeleton. The
// procedural animation (walk cycle, aim, two-bone IK onto the weapon grip) was
// written against those bone orientations, and a rig with its own conventions
// would fight every one of them. Copying the rig means he animates for free and
// stands the same height as everyone else; his silhouette comes from the mesh.
//
//   node tools/make-demoman.js [outDir]
const fs = require('fs'), path = require('path');

const OUT = process.argv[2] || path.join(__dirname, '..', 'assets', 'models');
const NAME = 'demoman';
const SRC = 'soldier';

// ---- mat4 helpers (column-major, same convention as js/math.js) -------------
const mul = (a, b) => {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
};

// ---- read the rig out of the source character ------------------------------
const env = JSON.parse(fs.readFileSync(path.join(OUT, SRC + '.json'), 'utf8'));
const src = Buffer.from(env.data, 'base64');
const dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'TFM2')
  throw new Error('source is not a TFM2 model');
const BONES = dv.getUint16(6, true);
const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'models.json'), 'utf8'));
const RIG = manifest.rig;

let off = 64;
const parent = [], rest = [], ibm = [];
for (let b = 0; b < BONES; b++) {
  parent.push(dv.getInt32(off, true)); off += 4;
  const r = []; for (let k = 0; k < 16; k++) { r.push(dv.getFloat32(off, true)); off += 4; }
  const m = []; for (let k = 0; k < 16; k++) { m.push(dv.getFloat32(off, true)); off += 4; }
  rest.push(r); ibm.push(m);
}
const world = [];
for (let b = 0; b < BONES; b++) world[b] = parent[b] < 0 ? rest[b] : mul(world[parent[b]], rest[b]);
const B = {}; RIG.forEach((n, i) => { B[n] = i; });
const at = (name) => { const w = world[B[name]]; return [w[12], w[13], w[14]]; };

// ---- palette ---------------------------------------------------------------
// UV rows in a 16-row atlas; the texture generator paints matching bands.
const ROWS = 16;
const SWATCH = {
  skin: 0, jacket: 1, jacketDark: 2, trousers: 3, boot: 4, belt: 5, strap: 6,
  metal: 7, cap: 8, patch: 9, grenade: 10, shirt: 11, glove: 12, beard: 13, eye: 14, gold: 15,
};
// V is flipped when the texture is uploaded, so row 0 is at the BOTTOM of the
// atlas. Sampling without this puts the jacket on the eye-white band.
const uvFor = (sw) => [0.5, 1 - (sw + 0.5) / ROWS];

// ---- geometry --------------------------------------------------------------
const verts = [];   // {p, n, uv, w:[{bone,weight}]}
const tris = [];

const add = (p, n, uv, bones) => { verts.push({ p, n, uv, bones }); return verts.length - 1; };
const quad = (a, b, c, d) => { tris.push(a, b, c, a, c, d); };

// A box given its centre, half-extents, and an optional per-axis shear so limbs
// can taper. `bones` is the whitelist this box may bind to.
function box(centre, half, swatch, bones, opts) {
  opts = opts || {};
  const [cx, cy, cz] = centre, [hx, hy, hz] = half;
  const topScale = opts.taper === undefined ? 1 : opts.taper;   // scales the +Y face
  const lean = opts.lean || [0, 0];                             // +Y face offset in x,z
  const uv = uvFor(swatch);
  const corner = (sx, sy, sz) => {
    const s = sy > 0 ? topScale : 1;
    const ox = sy > 0 ? lean[0] : 0, oz = sy > 0 ? lean[1] : 0;
    return [cx + sx * hx * s + ox, cy + sy * hy, cz + sz * hz * s + oz];
  };
  const faces = [
    { n: [0, 0, -1], c: [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]] },
    { n: [0, 0, 1], c: [[1, -1, 1], [-1, -1, 1], [-1, 1, 1], [1, 1, 1]] },
    { n: [-1, 0, 0], c: [[-1, -1, 1], [-1, -1, -1], [-1, 1, -1], [-1, 1, 1]] },
    { n: [1, 0, 0], c: [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1]] },
    { n: [0, 1, 0], c: [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]] },
    { n: [0, -1, 0], c: [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1]] },
  ];
  for (const f of faces) {
    const idx = f.c.map((s) => add(corner(s[0], s[1], s[2]), f.n, uv, bones));
    quad(idx[0], idx[1], idx[2], idx[3]);
  }
}

// A limb segment running between two bone positions, tapering along its length.
function limb(fromBone, toBone, r0, r1, swatch, bones, opts) {
  opts = opts || {};
  const a = at(fromBone), b = at(toBone);
  const uv = uvFor(swatch);
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  const ax = [d[0] / len, d[1] / len, d[2] / len];
  // a frame perpendicular to the bone
  let up = Math.abs(ax[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
  const rt = norm(cross(up, ax)); up = norm(cross(ax, rt));
  const ext = opts.extend || [0, 0];
  const p0 = [a[0] - ax[0] * ext[0], a[1] - ax[1] * ext[0], a[2] - ax[2] * ext[0]];
  const p1 = [b[0] + ax[0] * ext[1], b[1] + ax[1] * ext[1], b[2] + ax[2] * ext[1]];
  const SEG = 4;                    // square cross-section, in keeping with the style
  const ring = (c, r) => {
    const out = [];
    for (let i = 0; i < SEG; i++) {
      const t = (i + 0.5) / SEG * Math.PI * 2;
      const cx = Math.cos(t) * r, cy = Math.sin(t) * r;
      out.push({
        p: [c[0] + rt[0] * cx + up[0] * cy, c[1] + rt[1] * cx + up[1] * cy, c[2] + rt[2] * cx + up[2] * cy],
        n: norm([rt[0] * cx + up[0] * cy, rt[1] * cx + up[1] * cy, rt[2] * cx + up[2] * cy]),
      });
    }
    return out;
  };
  const A = ring(p0, r0), C = ring(p1, r1);
  const ia = A.map((v) => add(v.p, v.n, uv, bones));
  const ic = C.map((v) => add(v.p, v.n, uv, bones));
  for (let i = 0; i < SEG; i++) {
    const j = (i + 1) % SEG;
    quad(ia[i], ia[j], ic[j], ic[i]);
  }
  // caps
  const nA = [-ax[0], -ax[1], -ax[2]];
  const capA = A.map((v) => add(v.p, nA, uv, bones));
  tris.push(capA[0], capA[2], capA[1], capA[0], capA[3], capA[2]);
  const capC = C.map((v) => add(v.p, ax, uv, bones));
  tris.push(capC[0], capC[1], capC[2], capC[0], capC[2], capC[3]);
}

function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

// ---------------------------------------------------------------------------
// The man himself. Shorter and stockier than the soldier, heavy boots, flak
// jacket, grenade bandolier across the chest, knit cap and an eyepatch.
// ---------------------------------------------------------------------------
const pelvis = at('bip_pelvis'), sp3 = at('bip_spine_3'), neck = at('bip_neck'), head = at('bip_head');

const SPINE = ['bip_pelvis', 'bip_spine_0', 'bip_spine_1', 'bip_spine_2', 'bip_spine_3'];
const TORSO = SPINE.concat(['bip_neck']);

// hips
box([0, pelvis[1] - 0.02, pelvis[2]], [0.17, 0.11, 0.13], SWATCH.trousers, ['bip_pelvis', 'bip_spine_0']);
// belt
box([0, pelvis[1] + 0.09, pelvis[2]], [0.18, 0.035, 0.14], SWATCH.belt, ['bip_pelvis', 'bip_spine_0']);
// chest: wider at the shoulders than the waist
box([0, (pelvis[1] + sp3[1]) / 2 + 0.06, (pelvis[2] + sp3[2]) / 2],
  [0.17, (sp3[1] - pelvis[1]) / 2 + 0.02, 0.13], SWATCH.jacket, TORSO, { taper: 1.16 });
// jacket skirt over the belt
box([0, pelvis[1] + 0.16, pelvis[2]], [0.185, 0.07, 0.15], SWATCH.jacketDark, TORSO);
// collar
box([0, neck[1] - 0.02, neck[2]], [0.10, 0.05, 0.095], SWATCH.jacketDark, ['bip_spine_3', 'bip_neck']);

// grenade bandolier: a strap across the chest with charges on it
const strapY = (sp3[1] + pelvis[1]) / 2 + 0.12;
for (let i = 0; i < 5; i++) {
  const t = i / 4;
  const x = -0.15 + t * 0.30, y = strapY + 0.13 - t * 0.26;
  box([x, y, sp3[2] - 0.135], [0.055, 0.035, 0.02], SWATCH.strap, TORSO);
  box([x, y, sp3[2] - 0.175], [0.032, 0.045, 0.032], SWATCH.grenade, TORSO);
  box([x, y + 0.05, sp3[2] - 0.175], [0.018, 0.012, 0.018], SWATCH.metal, TORSO);
}

// neck, head, cap, beard, eyepatch
box([0, neck[1] + 0.03, neck[2] - 0.01], [0.052, 0.05, 0.052], SWATCH.skin, ['bip_neck', 'bip_head']);
box([0, head[1] + 0.04, head[2]], [0.088, 0.10, 0.092], SWATCH.skin, ['bip_head', 'bip_neck']);
box([0, head[1] + 0.145, head[2]], [0.094, 0.055, 0.098], SWATCH.cap, ['bip_head']);
box([0, head[1] + 0.192, head[2]], [0.072, 0.03, 0.076], SWATCH.cap, ['bip_head']);
box([0, head[1] - 0.045, head[2] - 0.02], [0.072, 0.045, 0.082], SWATCH.beard, ['bip_head']);
// eyepatch over the left eye (his left, so +x in model space) and its strap
box([0.038, head[1] + 0.058, head[2] - 0.098], [0.040, 0.032, 0.010], SWATCH.patch, ['bip_head']);
// the strap is thin, and only crosses the face on the patched side
box([0.02, head[1] + 0.065, head[2] - 0.004], [0.075, 0.007, 0.094], SWATCH.patch, ['bip_head']);
// the good eye, with a pupil
box([-0.040, head[1] + 0.058, head[2] - 0.092], [0.020, 0.015, 0.006], SWATCH.eye, ['bip_head']);
box([-0.040, head[1] + 0.058, head[2] - 0.099], [0.008, 0.009, 0.004], SWATCH.beard, ['bip_head']);

// arms
for (const s of ['L', 'R']) {
  const sh = ['bip_collar_' + s, 'bip_upperArm_' + s, 'bip_lowerArm_' + s];
  const fo = ['bip_upperArm_' + s, 'bip_lowerArm_' + s, 'bip_hand_' + s];
  limb('bip_upperArm_' + s, 'bip_lowerArm_' + s, 0.082, 0.064, SWATCH.jacket, sh, { extend: [0.06, 0] });
  limb('bip_lowerArm_' + s, 'bip_hand_' + s, 0.062, 0.048, SWATCH.shirt, fo);
  const h = at('bip_hand_' + s);
  box([h[0], h[1] - 0.03, h[2]], [0.045, 0.055, 0.038], SWATCH.glove, ['bip_hand_' + s, 'bip_lowerArm_' + s]);
  // shoulder pad
  const u = at('bip_upperArm_' + s);
  box([u[0] + (s === 'L' ? -0.012 : 0.012), u[1] + 0.035, u[2]], [0.098, 0.062, 0.095], SWATCH.jacketDark, sh);
}

// legs
for (const s of ['L', 'R']) {
  const th = ['bip_hip_' + s, 'bip_knee_' + s];
  const sh = ['bip_knee_' + s, 'bip_foot_' + s];
  limb('bip_hip_' + s, 'bip_knee_' + s, 0.098, 0.078, SWATCH.trousers, th, { extend: [0.05, 0] });
  limb('bip_knee_' + s, 'bip_foot_' + s, 0.078, 0.062, SWATCH.trousers, sh);
  const f = at('bip_foot_' + s), t = at('bip_toe_' + s);
  // boot: up the ankle, then forward over the toe
  box([f[0], f[1] + 0.035, f[2]], [0.070, 0.075, 0.075], SWATCH.boot, ['bip_foot_' + s, 'bip_knee_' + s]);
  box([(f[0] + t[0]) / 2, f[1] - 0.055, (f[2] + t[2]) / 2 - 0.03],
    [0.072, 0.055, 0.115], SWATCH.boot, ['bip_foot_' + s, 'bip_toe_' + s]);
  box([(f[0] + t[0]) / 2, f[1] - 0.095, (f[2] + t[2]) / 2 - 0.03],
    [0.078, 0.022, 0.125], SWATCH.metal, ['bip_foot_' + s, 'bip_toe_' + s]);
}

// ---- skinning --------------------------------------------------------------
// Each vertex is weighted among the bones its primitive declared, by distance to
// the bone's own segment. Restricting the candidates per primitive is what keeps
// a chest vertex from binding to an elbow.
function childOf(bi) {
  for (let b = 0; b < BONES; b++) if (parent[b] === bi) return b;
  return -1;
}
function segDist(p, bi) {
  const a = [world[bi][12], world[bi][13], world[bi][14]];
  const c = childOf(bi);
  if (c < 0) return Math.hypot(p[0] - a[0], p[1] - a[1], p[2] - a[2]);
  const b = [world[c][12], world[c][13], world[c][14]];
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2] || 1;
  let t = ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1] + (p[2] - a[2]) * d[2]) / l2;
  t = Math.max(0, Math.min(1, t));
  const q = [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}
for (const v of verts) {
  const cand = v.bones.map((n) => ({ b: B[n], d: segDist(v.p, B[n]) }));
  cand.sort((a, b) => a.d - b.d);
  const top = cand.slice(0, 2);
  const w = top.map((c) => 1 / Math.pow(c.d + 0.02, 2.2));
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  v.skin = top.map((c, i) => ({ bone: c.b, weight: w[i] / sum }));
  // one bone is plenty when it dominates; a 2% second influence is just noise
  if (v.skin.length > 1 && v.skin[1].weight < 0.06) v.skin = [{ bone: v.skin[0].bone, weight: 1 }];
}

// ---- pack ------------------------------------------------------------------
let pMin = [1e9, 1e9, 1e9], pMax = [-1e9, -1e9, -1e9];
for (const v of verts) for (let k = 0; k < 3; k++) { pMin[k] = Math.min(pMin[k], v.p[k]); pMax[k] = Math.max(pMax[k], v.p[k]); }
const pExt = [0, 1, 2].map((k) => (pMax[k] - pMin[k]) || 1);
const uvMin = [0, 0], uvExt = [1, 1];

const VS = 24, use32 = verts.length > 65535;
const head64 = Buffer.alloc(64);
head64.write('TFM2', 0, 'ascii');
head64.writeUInt16LE(2, 4); head64.writeUInt16LE(BONES, 6);
head64.writeUInt32LE(verts.length, 8); head64.writeUInt32LE(tris.length, 12);
head64.writeUInt16LE(1, 16); head64.writeUInt16LE(use32 ? 32 : 16, 18);
for (let k = 0; k < 3; k++) { head64.writeFloatLE(pMin[k], 20 + k * 4); head64.writeFloatLE(pExt[k], 32 + k * 4); }
for (let k = 0; k < 2; k++) { head64.writeFloatLE(uvMin[k], 44 + k * 4); head64.writeFloatLE(uvExt[k], 52 + k * 4); }

const boneBuf = Buffer.alloc(BONES * 132);
for (let b = 0; b < BONES; b++) {
  const o = b * 132;
  boneBuf.writeInt32LE(parent[b], o);
  for (let k = 0; k < 16; k++) boneBuf.writeFloatLE(rest[b][k], o + 4 + k * 4);
  for (let k = 0; k < 16; k++) boneBuf.writeFloatLE(ibm[b][k], o + 68 + k * 4);
}

const vBuf = Buffer.alloc(verts.length * VS);
verts.forEach((v, i) => {
  const o = i * VS;
  for (let k = 0; k < 3; k++) {
    const q = Math.round(((v.p[k] - pMin[k]) / pExt[k]) * 65535 - 32768);
    vBuf.writeInt16LE(Math.max(-32768, Math.min(32767, q)), o + k * 2);
  }
  for (let k = 0; k < 3; k++) vBuf.writeInt8(Math.max(-127, Math.min(127, Math.round(v.n[k] * 127))), o + 6 + k);
  vBuf.writeInt8(0, o + 9);
  for (let k = 0; k < 2; k++) vBuf.writeUInt16LE(Math.max(0, Math.min(65535, Math.round(v.uv[k] * 65535))), o + 10 + k * 2);
  const sk = v.skin;
  for (let k = 0; k < 4; k++) vBuf.writeUInt8(k < sk.length ? sk[k].bone : 0, o + 14 + k);
  // quantise weights so they still sum to 255
  let acc = 0;
  for (let k = 0; k < 4; k++) {
    let wq = k < sk.length ? Math.round(sk[k].weight * 255) : 0;
    if (k === sk.length - 1) wq = 255 - acc;
    acc += wq;
    vBuf.writeUInt8(Math.max(0, Math.min(255, wq)), o + 18 + k);
  }
  vBuf.writeUInt16LE(0, o + 22);
});

const iBuf = Buffer.alloc(tris.length * (use32 ? 4 : 2));
tris.forEach((x, i) => (use32 ? iBuf.writeUInt32LE(x, i * 4) : iBuf.writeUInt16LE(x, i * 2)));

const out = Buffer.concat([head64, boneBuf, vBuf, iBuf]);
fs.writeFileSync(path.join(OUT, NAME + '.json'),
  JSON.stringify({ format: 'TFM2', bytes: out.length, data: out.toString('base64') }));

// ---- manifest --------------------------------------------------------------
const height = pMax[1] - pMin[1];
manifest.characters = manifest.characters || {};
manifest.characters[NAME] = {
  file: NAME + '.json', verts: verts.length, tris: tris.length / 3, height,
  generated: 'tools/make-demoman.js',
  glow: false,
  groups: [{ material: 'demoman_body', offset: 0, count: tris.length }],
};
manifest.sets = manifest.sets || {};
if (manifest.sets.mercs) manifest.sets.mercs.models.demoman = NAME;
fs.writeFileSync(path.join(OUT, 'models.json'), JSON.stringify(manifest, null, 1));

console.log(`${NAME}: ${verts.length} verts, ${tris.length / 3} tris, ${height.toFixed(2)} m tall, ${(out.length / 1024) | 0}KB`);
console.log(`  swatch rows: ${ROWS} — run tools/make-demoman-texture.js to paint them`);
