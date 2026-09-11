// Extract the 8 TF2-style mercenary characters from the source GLB into compact
// per-class binaries the game can stream: canonical 25-bone rig, one LOD, quantized
// vertices, plus a manifest. Textures are handled by extract-textures.js.
//
//   node tools/extract-models.js <source.glb> [outDir] [lod]
const fs = require('fs'), path = require('path');
const { load, mul, compose, xform } = require('./glb.js');

const SRC = process.argv[2];
const OUT = process.argv[3] || path.join(__dirname, '..', 'assets', 'models');
const LOD = parseInt(process.argv[4] || '1', 10);
const TARGET_HEIGHT = 1.80;          // metres for a reference-height class
const REFERENCE_RAW = 83.0;          // source units; one shared scale keeps Heavy bigger than Scout
const CHARS = { spy: 9, heavy: 170, medic: 344, engineer: 513, pyro: 680, scout: 832, sniper: 1041, soldier: 1252 };
const DROP_MATERIALS = new Set(['c_arrow', 'w_rocket01', 'material_0']);
// Canonical rig. Order matters: parents must precede children.
const RIG = [
  'bip_pelvis', 'bip_spine_0', 'bip_spine_1', 'bip_spine_2', 'bip_spine_3', 'bip_neck', 'bip_head',
  'bip_collar_L', 'bip_upperArm_L', 'bip_lowerArm_L', 'bip_hand_L',
  'bip_collar_R', 'bip_upperArm_R', 'bip_lowerArm_R', 'bip_hand_R',
  'bip_hip_L', 'bip_knee_L', 'bip_foot_L', 'bip_toe_L',
  'bip_hip_R', 'bip_knee_R', 'bip_foot_R', 'bip_toe_R',
];
const RIG_INDEX = new Map(RIG.map((n, i) => [n, i]));
// Rig parents by name (bip_pelvis is the root).
const RIG_PARENT = {
  bip_pelvis: null, bip_spine_0: 'bip_pelvis', bip_spine_1: 'bip_spine_0', bip_spine_2: 'bip_spine_1', bip_spine_3: 'bip_spine_2',
  bip_neck: 'bip_spine_3', bip_head: 'bip_neck',
  bip_collar_L: 'bip_spine_3', bip_upperArm_L: 'bip_collar_L', bip_lowerArm_L: 'bip_upperArm_L', bip_hand_L: 'bip_lowerArm_L',
  bip_collar_R: 'bip_spine_3', bip_upperArm_R: 'bip_collar_R', bip_lowerArm_R: 'bip_upperArm_R', bip_hand_R: 'bip_lowerArm_R',
  bip_hip_L: 'bip_pelvis', bip_knee_L: 'bip_hip_L', bip_foot_L: 'bip_knee_L', bip_toe_L: 'bip_foot_L',
  bip_hip_R: 'bip_pelvis', bip_knee_R: 'bip_hip_R', bip_foot_R: 'bip_knee_R', bip_toe_R: 'bip_foot_R',
};

// The exporter appends "_<boneIndex>_<nodeIndex>" to every bone name.
const boneName = (raw) => String(raw == null ? '' : raw).replace(/_\d+_\d+$/, '');

function inverse(m) {
  const inv = new Float64Array(16);
  inv[0] = m[5]*m[10]*m[15] - m[5]*m[11]*m[14] - m[9]*m[6]*m[15] + m[9]*m[7]*m[14] + m[13]*m[6]*m[11] - m[13]*m[7]*m[10];
  inv[4] = -m[4]*m[10]*m[15] + m[4]*m[11]*m[14] + m[8]*m[6]*m[15] - m[8]*m[7]*m[14] - m[12]*m[6]*m[11] + m[12]*m[7]*m[10];
  inv[8] = m[4]*m[9]*m[15] - m[4]*m[11]*m[13] - m[8]*m[5]*m[15] + m[8]*m[7]*m[13] + m[12]*m[5]*m[11] - m[12]*m[7]*m[9];
  inv[12] = -m[4]*m[9]*m[14] + m[4]*m[10]*m[13] + m[8]*m[5]*m[14] - m[8]*m[6]*m[13] - m[12]*m[5]*m[10] + m[12]*m[6]*m[9];
  inv[1] = -m[1]*m[10]*m[15] + m[1]*m[11]*m[14] + m[9]*m[2]*m[15] - m[9]*m[3]*m[14] - m[13]*m[2]*m[11] + m[13]*m[3]*m[10];
  inv[5] = m[0]*m[10]*m[15] - m[0]*m[11]*m[14] - m[8]*m[2]*m[15] + m[8]*m[3]*m[14] + m[12]*m[2]*m[11] - m[12]*m[3]*m[10];
  inv[9] = -m[0]*m[9]*m[15] + m[0]*m[11]*m[13] + m[8]*m[1]*m[15] - m[8]*m[3]*m[13] - m[12]*m[1]*m[11] + m[12]*m[3]*m[9];
  inv[13] = m[0]*m[9]*m[14] - m[0]*m[10]*m[13] - m[8]*m[1]*m[14] + m[8]*m[2]*m[13] + m[12]*m[1]*m[10] - m[12]*m[2]*m[9];
  inv[2] = m[1]*m[6]*m[15] - m[1]*m[7]*m[14] - m[5]*m[2]*m[15] + m[5]*m[3]*m[14] + m[13]*m[2]*m[7] - m[13]*m[3]*m[6];
  inv[6] = -m[0]*m[6]*m[15] + m[0]*m[7]*m[14] + m[4]*m[2]*m[15] - m[4]*m[3]*m[14] - m[12]*m[2]*m[7] + m[12]*m[3]*m[6];
  inv[10] = m[0]*m[5]*m[15] - m[0]*m[7]*m[13] - m[4]*m[1]*m[15] + m[4]*m[3]*m[13] + m[12]*m[1]*m[7] - m[12]*m[3]*m[5];
  inv[14] = -m[0]*m[5]*m[14] + m[0]*m[6]*m[13] + m[4]*m[1]*m[14] - m[4]*m[2]*m[13] - m[12]*m[1]*m[6] + m[12]*m[2]*m[5];
  inv[3] = -m[1]*m[6]*m[11] + m[1]*m[7]*m[10] + m[5]*m[2]*m[11] - m[5]*m[3]*m[10] - m[9]*m[2]*m[7] + m[9]*m[3]*m[6];
  inv[7] = m[0]*m[6]*m[11] - m[0]*m[7]*m[10] - m[4]*m[2]*m[11] + m[4]*m[3]*m[10] + m[8]*m[2]*m[7] - m[8]*m[3]*m[6];
  inv[11] = -m[0]*m[5]*m[11] + m[0]*m[7]*m[9] + m[4]*m[1]*m[11] - m[4]*m[3]*m[9] - m[8]*m[1]*m[7] + m[8]*m[3]*m[5];
  inv[15] = m[0]*m[5]*m[10] - m[0]*m[6]*m[9] - m[4]*m[1]*m[10] + m[4]*m[2]*m[9] + m[8]*m[1]*m[6] - m[8]*m[2]*m[5];
  let det = m[0]*inv[0] + m[1]*inv[4] + m[2]*inv[8] + m[3]*inv[12];
  if (!det) throw new Error('singular matrix');
  det = 1 / det; for (let i = 0; i < 16; i++) inv[i] *= det;
  return inv;
}
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0]/l, v[1]/l, v[2]/l]; };
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const origin = (m) => [m[12], m[13], m[14]];

const g = load(SRC); const J = g.json;

// World matrix of every node.
const world = new Array(J.nodes.length);
(function rec(i, parent) { const m = mul(parent, g.nodeMatrix(J.nodes[i])); world[i] = m; (J.nodes[i].children || []).forEach((c) => rec(c, m)); })(0, compose([0,0,0],[0,0,0,1],[1,1,1]));

function collectPrims(root, acc = []) {
  const n = J.nodes[root];
  if (n.mesh !== undefined) for (const p of J.meshes[n.mesh].primitives) acc.push({ node: root, prim: p, mat: J.materials[p.material].name });
  (n.children || []).forEach((c) => collectPrims(c, acc));
  return acc;
}
// Split a material's primitives into parts; within a part the LOD chain descends.
function splitLods(list) {
  const parts = []; let cur = null, prevTris = -1;
  for (const p of list) {
    const tris = J.accessors[p.prim.indices].count / 3;
    if (!cur || tris > prevTris) { cur = []; parts.push(cur); }
    cur.push(p); prevTris = tris;
  }
  return parts;
}

// Average position of the eyeball meshes (bind pose, world space) - the face marker.
function eyeCentroid(root) {
  const acc = [0, 0, 0]; let n = 0;
  for (const p of collectPrims(root)) {
    if (!/^eyeball/.test(p.mat)) continue;
    const pos = g.accessorF32(p.prim.attributes.POSITION);
    const jt = p.prim.attributes.JOINTS_0 !== undefined ? g.accessor(p.prim.attributes.JOINTS_0) : null;
    const wt = p.prim.attributes.WEIGHTS_0 !== undefined ? g.accessorF32(p.prim.attributes.WEIGHTS_0) : null;
    const skinIdx = J.nodes[p.node].skin;
    const sk = skinIdx !== undefined ? J.skins[skinIdx] : null;
    const ib = sk ? g.accessor(sk.inverseBindMatrices) : null;
    for (let v = 0; v < pos.length / 3; v++) {
      const local = [pos[v*3], pos[v*3+1], pos[v*3+2]];
      let q = null;
      if (sk && jt && wt && wt[v*4] > 0) {
        const ji = jt[v*4]; const sm = mul(world[sk.joints[ji]], Array.from(ib.slice(ji*16, ji*16+16)));
        q = xform(sm, local);
      } else q = xform(world[p.node], local);
      acc[0] += q[0]; acc[1] += q[1]; acc[2] += q[2]; n++;
    }
  }
  return n ? [acc[0]/n, acc[1]/n, acc[2]/n] : null;
}
let flipped = 0; const facingVotes = []; let consensus = 0;

fs.mkdirSync(OUT, { recursive: true });
const manifest = { generated: new Date().toISOString().slice(0, 10), targetHeight: TARGET_HEIGHT, lod: LOD, rig: RIG, rigParent: RIG.map((n) => (RIG_PARENT[n] === null ? -1 : RIG_INDEX.get(RIG_PARENT[n]))), classes: {} };
let grandTris = 0, grandBytes = 0;

const ORDER = Object.entries(CHARS).sort((a, b) => (eyeCentroid(b[1]) ? 1 : 0) - (eyeCentroid(a[1]) ? 1 : 0));
for (const [name, rootNode] of ORDER) {
  if (!consensus && facingVotes.length) consensus = facingVotes.reduce((x, y) => x + y, 0) >= 0 ? 1 : -1;
  const prims = collectPrims(rootNode);
  const skinIdx = prims.find((p) => J.nodes[p.node].skin !== undefined);
  if (!skinIdx) { console.log(`${name}: no skin, skipped`); continue; }
  const skin = J.skins[J.nodes[skinIdx.node].skin];
  const joints = skin.joints;
  const ibms = g.accessor(skin.inverseBindMatrices);

  // --- map every source joint to a canonical rig bone (nearest kept ancestor)
  const parentOf = new Array(J.nodes.length).fill(-1);
  for (let i = 0; i < J.nodes.length; i++) for (const c of (J.nodes[i].children || [])) parentOf[c] = i;
  const nodeToRig = new Map();
  for (const jn of joints) {
    let n = jn, hops = 0;
    while (n !== -1 && hops++ < 64) { const nm = boneName(J.nodes[n].name); if (RIG_INDEX.has(nm)) { nodeToRig.set(jn, RIG_INDEX.get(nm)); break; } n = parentOf[n]; }
    if (!nodeToRig.has(jn)) nodeToRig.set(jn, 0); // fall back to the pelvis
  }
  // rig bone -> source node (first match)
  const rigNode = new Array(RIG.length).fill(-1);
  for (const jn of joints) { const nm = boneName(J.nodes[jn].name); const ri = RIG_INDEX.get(nm); if (ri !== undefined && rigNode[ri] === -1) rigNode[ri] = jn; }
  const missing = RIG.filter((n, i) => rigNode[i] === -1);
  if (missing.length) console.log(`  ${name}: WARNING missing bones ${missing.join(',')}`);

  // --- canonical orientation: up = pelvis->head, left = hipR->hipL, feet on the floor
  const wp = (n) => origin(world[rigNode[RIG_INDEX.get(n)]]);
  const up = norm(sub(wp('bip_head'), wp('bip_pelvis')));
  const left = norm(sub(wp('bip_hip_L'), wp('bip_hip_R')));
  // Heading is +-cross(left, up); the eye meshes settle the sign (eyes are on the face).
  let fwd = norm(cross(left, up));
  const eyeC = eyeCentroid(rootNode);
  if (eyeC) {
    const headP = wp('bip_head');
    const d = sub(eyeC, headP);
    const along = d[0]*fwd[0] + d[1]*fwd[1] + d[2]*fwd[2];
    if (along < 0) { fwd = [-fwd[0], -fwd[1], -fwd[2]]; flipped++; }
    facingVotes.push(along >= 0 ? 1 : -1);
  } else if (consensus) {
    if (consensus < 0) fwd = [-fwd[0], -fwd[1], -fwd[2]];
  }
  const right = norm(cross(fwd, up));                      // right-handed: fwd x up = right
  const R = new Float64Array(16);
  R[0] = right[0]; R[4] = right[1]; R[8] = right[2];
  R[1] = up[0]; R[5] = up[1]; R[9] = up[2];
  R[2] = -fwd[0]; R[6] = -fwd[1]; R[10] = -fwd[2];
  R[15] = 1;

  if (eyeC) {   // in game space the eyes must sit in front of the head (-Z)
    const e = xform(R, eyeC), hd = xform(R, wp('bip_head'));
    if (e[2] - hd[2] > 0) console.log(`  ${name}: WARNING eyes behind the head (${(e[2]-hd[2]).toFixed(2)})`);
  }
  // --- choose LOD primitives, measure the rotated bounds
  const byMat = new Map();
  for (const p of prims) { if (DROP_MATERIALS.has(p.mat)) continue; if (!byMat.has(p.mat)) byMat.set(p.mat, []); byMat.get(p.mat).push(p); }
  const chosen = [];
  for (const [mat, list] of byMat) for (const part of splitLods(list)) chosen.push({ mat, p: part[Math.min(LOD, part.length - 1)] });

  // pass 1: bind-pose positions in rotated space, to find height and centre
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  const baked = [];
  for (const c of chosen) {
    const a = c.p.prim.attributes;
    const pos = g.accessorF32(a.POSITION), nrm = a.NORMAL !== undefined ? g.accessorF32(a.NORMAL) : null;
    const uv = g.accessorF32(a.TEXCOORD_0), jt = a.JOINTS_0 !== undefined ? g.accessor(a.JOINTS_0) : null;
    const wt = a.WEIGHTS_0 !== undefined ? g.accessorF32(a.WEIGHTS_0) : null;
    const idx = g.accessor(c.p.prim.indices);
    const n = pos.length / 3;
    // world (bind) position of each vertex, then rotate
    const wpos = new Float32Array(n * 3), wnrm = new Float32Array(n * 3);
    for (let v = 0; v < n; v++) {
      const local = [pos[v*3], pos[v*3+1], pos[v*3+2]];
      let acc = [0, 0, 0], accN = [0, 0, 0], tw = 0;
      if (jt && wt) {
        for (let k = 0; k < 4; k++) {
          const w = wt[v*4+k]; if (w <= 0) continue;
          const jn = joints[jt[v*4+k]]; const sm = mul(world[jn], Array.from(ibms.slice(jt[v*4+k]*16, jt[v*4+k]*16+16)));
          const q = xform(sm, local);
          acc = [acc[0]+q[0]*w, acc[1]+q[1]*w, acc[2]+q[2]*w];
          if (nrm) { const nn = [nrm[v*3], nrm[v*3+1], nrm[v*3+2]]; const qn = [sm[0]*nn[0]+sm[4]*nn[1]+sm[8]*nn[2], sm[1]*nn[0]+sm[5]*nn[1]+sm[9]*nn[2], sm[2]*nn[0]+sm[6]*nn[1]+sm[10]*nn[2]]; accN = [accN[0]+qn[0]*w, accN[1]+qn[1]*w, accN[2]+qn[2]*w]; }
          tw += w;
        }
      }
      if (tw < 1e-6) { acc = xform(world[c.p.node], local); if (nrm) accN = [nrm[v*3], nrm[v*3+1], nrm[v*3+2]]; }
      const rp = xform(R, acc); const rn = norm(xform(R, accN.some(Boolean) ? accN : [0, 1, 0]));
      wpos[v*3] = rp[0]; wpos[v*3+1] = rp[1]; wpos[v*3+2] = rp[2];
      wnrm[v*3] = rn[0]; wnrm[v*3+1] = rn[1]; wnrm[v*3+2] = rn[2];
      for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], rp[k]); mx[k] = Math.max(mx[k], rp[k]); }
    }
    baked.push({ mat: c.mat, wpos, wnrm, uv, jt, wt, idx, n });
  }
  const rawH = mx[1] - mn[1];
  const scale = TARGET_HEIGHT / REFERENCE_RAW;
  const cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2, floor = mn[1];
  // N maps rotated bind space -> game space (feet at origin, metres)
  const N = new Float64Array([scale,0,0,0, 0,scale,0,0, 0,0,scale,0, -cx*scale, -floor*scale, -cz*scale, 1]);
  const NR = mul(N, R);

  // --- bones in canonical space
  const bones = [];
  for (let i = 0; i < RIG.length; i++) {
    const jn = rigNode[i]; if (jn === -1) { bones.push({ parent: manifest.rigParent[i], rest: Array.from(compose([0,0,0],[0,0,0,1],[1,1,1])), ibm: Array.from(compose([0,0,0],[0,0,0,1],[1,1,1])) }); continue; }
    const wGame = mul(NR, world[jn]);                  // bone world matrix in game space
    const pi = manifest.rigParent[i];
    const rest = pi === -1 ? wGame : mul(inverse(mul(NR, world[rigNode[pi]])), wGame);
    const ibm = inverse(wGame);                        // rebuilt so skinMatrix = worldNow * ibm
    bones.push({ parent: pi, rest: Array.from(rest), ibm: Array.from(ibm) });
  }

  // --- merge groups, remap joints, quantize
  const groups = []; const vAll = []; const iAll = [];
  let uvMin = [1e9, 1e9], uvMax = [-1e9, -1e9];
  for (const b of baked) { for (let v = 0; v < b.n; v++) { uvMin[0] = Math.min(uvMin[0], b.uv[v*2]); uvMin[1] = Math.min(uvMin[1], b.uv[v*2+1]); uvMax[0] = Math.max(uvMax[0], b.uv[v*2]); uvMax[1] = Math.max(uvMax[1], b.uv[v*2+1]); } }
  let pMin = [1e9, 1e9, 1e9], pMax = [-1e9, -1e9, -1e9];
  for (const b of baked) for (let v = 0; v < b.n; v++) {
    const p = xform(N, [b.wpos[v*3], b.wpos[v*3+1], b.wpos[v*3+2]]);
    for (let k = 0; k < 3; k++) { pMin[k] = Math.min(pMin[k], p[k]); pMax[k] = Math.max(pMax[k], p[k]); }
  }
  const ext = [pMax[0]-pMin[0] || 1, pMax[1]-pMin[1] || 1, pMax[2]-pMin[2] || 1];
  const uvExt = [uvMax[0]-uvMin[0] || 1, uvMax[1]-uvMin[1] || 1];
  for (const b of baked) {
    const base = vAll.length;
    for (let v = 0; v < b.n; v++) {
      const p = xform(N, [b.wpos[v*3], b.wpos[v*3+1], b.wpos[v*3+2]]);
      // merge skin weights onto the canonical rig
      const acc = new Map();
      if (b.jt && b.wt) for (let k = 0; k < 4; k++) { const w = b.wt[v*4+k]; if (w <= 0) continue; const r = nodeToRig.get(joints[b.jt[v*4+k]]) || 0; acc.set(r, (acc.get(r) || 0) + w); }
      if (!acc.size) acc.set(0, 1);
      const top = [...acc.entries()].sort((a, c) => c[1] - a[1]).slice(0, 4);
      const sum = top.reduce((s, e) => s + e[1], 0) || 1;
      const ji = [0, 0, 0, 0], wq = [0, 0, 0, 0];
      top.forEach((e, k) => { ji[k] = e[0]; wq[k] = Math.round(e[1] / sum * 255); });
      let wsum = wq.reduce((s, x) => s + x, 0); wq[0] += 255 - wsum;
      vAll.push({
        p: [0, 1, 2].map((k) => Math.max(-32768, Math.min(32767, Math.round((p[k] - pMin[k]) / ext[k] * 65535 - 32768)))),
        n: [0, 1, 2].map((k) => Math.max(-127, Math.min(127, Math.round(b.wnrm[v*3+k] * 127)))),
        t: [0, 1].map((k) => Math.max(0, Math.min(65535, Math.round((b.uv[v*2+k] - uvMin[k]) / uvExt[k] * 65535)))),
        j: ji, w: wq,
      });
    }
    const start = iAll.length;
    for (let k = 0; k < b.idx.length; k++) iAll.push(base + b.idx[k]);
    groups.push({ material: b.mat, offset: start, count: b.idx.length });
  }
  // merge adjacent groups that share a material
  const merged = [];
  for (const gr of groups) { const last = merged[merged.length - 1]; if (last && last.material === gr.material && last.offset + last.count === gr.offset) last.count += gr.count; else merged.push({ ...gr }); }

  const use32 = vAll.length > 65535;
  const VSTRIDE = 24;
  const head = Buffer.alloc(64);
  head.write('TFM2', 0, 'ascii');
  head.writeUInt16LE(2, 4); head.writeUInt16LE(RIG.length, 6);
  head.writeUInt32LE(vAll.length, 8); head.writeUInt32LE(iAll.length, 12);
  head.writeUInt16LE(merged.length, 16); head.writeUInt16LE(use32 ? 32 : 16, 18);
  for (let k = 0; k < 3; k++) { head.writeFloatLE(pMin[k], 20 + k * 4); head.writeFloatLE(ext[k], 32 + k * 4); }
  for (let k = 0; k < 2; k++) { head.writeFloatLE(uvMin[k], 44 + k * 4); head.writeFloatLE(uvExt[k], 52 + k * 4); }
  const boneBuf = Buffer.alloc(RIG.length * (4 + 64 + 64));
  bones.forEach((bo, i) => { const o = i * 132; boneBuf.writeInt32LE(bo.parent, o); for (let k = 0; k < 16; k++) boneBuf.writeFloatLE(bo.rest[k], o + 4 + k * 4); for (let k = 0; k < 16; k++) boneBuf.writeFloatLE(bo.ibm[k], o + 68 + k * 4); });
  const vBuf = Buffer.alloc(vAll.length * VSTRIDE);
  vAll.forEach((v, i) => { const o = i * VSTRIDE;
    vBuf.writeInt16LE(v.p[0], o); vBuf.writeInt16LE(v.p[1], o+2); vBuf.writeInt16LE(v.p[2], o+4);
    vBuf.writeInt8(v.n[0], o+6); vBuf.writeInt8(v.n[1], o+7); vBuf.writeInt8(v.n[2], o+8); vBuf.writeInt8(0, o+9);
    vBuf.writeUInt16LE(v.t[0], o+10); vBuf.writeUInt16LE(v.t[1], o+12);
    for (let k = 0; k < 4; k++) vBuf.writeUInt8(v.j[k], o+14+k);
    for (let k = 0; k < 4; k++) vBuf.writeUInt8(v.w[k], o+18+k);
    vBuf.writeUInt16LE(0, o+22);
  });
  const iBuf = Buffer.alloc(iAll.length * (use32 ? 4 : 2));
  iAll.forEach((x, i) => (use32 ? iBuf.writeUInt32LE(x, i * 4) : iBuf.writeUInt16LE(x, i * 2)));
  const out = Buffer.concat([head, boneBuf, vBuf, iBuf]);
  // Wrapped in JSON because static hosts (and the artifact sandbox) only serve
  // standard web media types; the payload is the exact binary above.
  fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify({ format: 'TFM2', bytes: out.length, data: out.toString('base64') }));

  const tris = iAll.length / 3; grandTris += tris; grandBytes += Math.ceil(out.length * 4 / 3);
  manifest.classes[name] = { file: name + '.json', verts: vAll.length, tris, height: rawH * scale, rawHeight: rawH, scale, groups: merged.map((m) => ({ material: m.material, offset: m.offset, count: m.count })) };
  console.log(`${name.padEnd(9)} ${String(vAll.length).padStart(6)}v ${String(tris).padStart(6)}t ${(out.length/1024).toFixed(0).padStart(5)}KB groups=${merged.length} height=${(rawH*scale).toFixed(2)}m`);
}
fs.writeFileSync(path.join(OUT, 'models.json'), JSON.stringify(manifest, null, 1));
console.log(`\ntotal ${grandTris} tris, ${(grandBytes/1048576).toFixed(2)} MB geometry (LOD ${LOD})`);
