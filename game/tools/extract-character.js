// Extract ONE rigged character from a glTF into the game's .json model format.
// Handles several skeleton naming conventions and keeps the emissive map, which is
// what team colour is painted through for glowing (Tron-style) characters.
//
//   node tools/extract-character.js <source.glb> <name> [outDir]
const fs = require('fs'), path = require('path');
const { load, mul, compose, xform, pngSize } = require('./glb.js');

const SRC = process.argv[2], NAME = process.argv[3];
const OUT = process.argv[4] || path.join(__dirname, '..', 'assets', 'models');
if (!SRC || !NAME) { console.error('usage: extract-character.js <source.glb> <name> [outDir]'); process.exit(1); }
const TARGET_HEIGHT = 1.80;

const RIG = [
  'bip_pelvis', 'bip_spine_0', 'bip_spine_1', 'bip_spine_2', 'bip_spine_3', 'bip_neck', 'bip_head',
  'bip_collar_L', 'bip_upperArm_L', 'bip_lowerArm_L', 'bip_hand_L',
  'bip_collar_R', 'bip_upperArm_R', 'bip_lowerArm_R', 'bip_hand_R',
  'bip_hip_L', 'bip_knee_L', 'bip_foot_L', 'bip_toe_L',
  'bip_hip_R', 'bip_knee_R', 'bip_foot_R', 'bip_toe_R',
];
const RIG_PARENT = {
  bip_pelvis: null, bip_spine_0: 'bip_pelvis', bip_spine_1: 'bip_spine_0', bip_spine_2: 'bip_spine_1', bip_spine_3: 'bip_spine_2',
  bip_neck: 'bip_spine_3', bip_head: 'bip_neck',
  bip_collar_L: 'bip_spine_3', bip_upperArm_L: 'bip_collar_L', bip_lowerArm_L: 'bip_upperArm_L', bip_hand_L: 'bip_lowerArm_L',
  bip_collar_R: 'bip_spine_3', bip_upperArm_R: 'bip_collar_R', bip_lowerArm_R: 'bip_upperArm_R', bip_hand_R: 'bip_lowerArm_R',
  bip_hip_L: 'bip_pelvis', bip_knee_L: 'bip_hip_L', bip_foot_L: 'bip_knee_L', bip_toe_L: 'bip_foot_L',
  bip_hip_R: 'bip_pelvis', bip_knee_R: 'bip_hip_R', bip_foot_R: 'bip_knee_R', bip_toe_R: 'bip_foot_R',
};
// Accepted source names per rig bone. Valve, the "jt_" convention and the
// Unreal-style skeleton all appear in the models we have been given.
const ALIAS = {
  bip_pelvis: ['bip_pelvis', 'jt_cog_c', 'pelvis', 'hips', 'cog'],
  bip_spine_0: ['bip_spine_0', 'jt_spinelower_c', 'spine_01', 'spine'],
  bip_spine_1: ['bip_spine_1', 'jt_spineupper_c', 'spine_02', 'spine1'],
  bip_spine_2: ['bip_spine_2', 'jt_spinechest_c', 'spine_03', 'spine2'],
  bip_spine_3: ['bip_spine_3', 'spine_04', 'jt_spinechest_c', 'spine3'],
  bip_neck: ['bip_neck', 'jt_neck_c', 'neck_01', 'neck'],
  bip_head: ['bip_head', 'jt_head_c', 'head'],
  bip_collar_L: ['bip_collar_l', 'jt_clavicle_l', 'clavicle_l'],
  bip_upperArm_L: ['bip_upperarm_l', 'jt_shoulder_l', 'upperarm_l'],
  bip_lowerArm_L: ['bip_lowerarm_l', 'jt_elbow_l', 'lowerarm_l'],
  bip_hand_L: ['bip_hand_l', 'jt_hand_l', 'hand_l'],
  bip_collar_R: ['bip_collar_r', 'jt_clavicle_r', 'clavicle_r'],
  bip_upperArm_R: ['bip_upperarm_r', 'jt_shoulder_r', 'upperarm_r'],
  bip_lowerArm_R: ['bip_lowerarm_r', 'jt_elbow_r', 'lowerarm_r'],
  bip_hand_R: ['bip_hand_r', 'jt_hand_r', 'hand_r'],
  bip_hip_L: ['bip_hip_l', 'jt_thigh_l', 'thigh_l'],
  bip_knee_L: ['bip_knee_l', 'jt_knee_l', 'calf_l'],
  bip_foot_L: ['bip_foot_l', 'jt_foot_l', 'foot_l'],
  bip_toe_L: ['bip_toe_l', 'jt_toes_l', 'ball_l'],
  bip_hip_R: ['bip_hip_r', 'jt_thigh_r', 'thigh_r'],
  bip_knee_R: ['bip_knee_r', 'jt_knee_r', 'calf_r'],
  bip_foot_R: ['bip_foot_r', 'jt_foot_r', 'foot_r'],
  bip_toe_R: ['bip_toe_r', 'jt_toes_r', 'ball_r'],
};
// Exporters append "_<n>" once or twice; try every stripping depth.
function candidates(raw) {
  let n = String(raw == null ? '' : raw).toLowerCase();
  const out = [n];
  for (let i = 0; i < 2; i++) { const m = n.replace(/_\d+$/, ''); if (m === n) break; n = m; out.push(n); }
  return out;
}
function rigOf(raw) {
  const cs = candidates(raw);
  for (const bone of RIG) { const al = ALIAS[bone]; if (cs.some((c) => al.includes(c))) return bone; }
  return null;
}

function inverse(m) {
  const inv = new Float64Array(16);
  inv[0]=m[5]*m[10]*m[15]-m[5]*m[11]*m[14]-m[9]*m[6]*m[15]+m[9]*m[7]*m[14]+m[13]*m[6]*m[11]-m[13]*m[7]*m[10];
  inv[4]=-m[4]*m[10]*m[15]+m[4]*m[11]*m[14]+m[8]*m[6]*m[15]-m[8]*m[7]*m[14]-m[12]*m[6]*m[11]+m[12]*m[7]*m[10];
  inv[8]=m[4]*m[9]*m[15]-m[4]*m[11]*m[13]-m[8]*m[5]*m[15]+m[8]*m[7]*m[13]+m[12]*m[5]*m[11]-m[12]*m[7]*m[9];
  inv[12]=-m[4]*m[9]*m[14]+m[4]*m[10]*m[13]+m[8]*m[5]*m[14]-m[8]*m[6]*m[13]-m[12]*m[5]*m[10]+m[12]*m[6]*m[9];
  inv[1]=-m[1]*m[10]*m[15]+m[1]*m[11]*m[14]+m[9]*m[2]*m[15]-m[9]*m[3]*m[14]-m[13]*m[2]*m[11]+m[13]*m[3]*m[10];
  inv[5]=m[0]*m[10]*m[15]-m[0]*m[11]*m[14]-m[8]*m[2]*m[15]+m[8]*m[3]*m[14]+m[12]*m[2]*m[11]-m[12]*m[3]*m[10];
  inv[9]=-m[0]*m[9]*m[15]+m[0]*m[11]*m[13]+m[8]*m[1]*m[15]-m[8]*m[3]*m[13]-m[12]*m[1]*m[11]+m[12]*m[3]*m[9];
  inv[13]=m[0]*m[9]*m[14]-m[0]*m[10]*m[13]-m[8]*m[1]*m[14]+m[8]*m[2]*m[13]+m[12]*m[1]*m[10]-m[12]*m[2]*m[9];
  inv[2]=m[1]*m[6]*m[15]-m[1]*m[7]*m[14]-m[5]*m[2]*m[15]+m[5]*m[3]*m[14]+m[13]*m[2]*m[7]-m[13]*m[3]*m[6];
  inv[6]=-m[0]*m[6]*m[15]+m[0]*m[7]*m[14]+m[4]*m[2]*m[15]-m[4]*m[3]*m[14]-m[12]*m[2]*m[7]+m[12]*m[3]*m[6];
  inv[10]=m[0]*m[5]*m[15]-m[0]*m[7]*m[13]-m[4]*m[1]*m[15]+m[4]*m[3]*m[13]+m[12]*m[1]*m[7]-m[12]*m[3]*m[5];
  inv[14]=-m[0]*m[5]*m[14]+m[0]*m[6]*m[13]+m[4]*m[1]*m[14]-m[4]*m[2]*m[13]-m[12]*m[1]*m[6]+m[12]*m[2]*m[5];
  inv[3]=-m[1]*m[6]*m[11]+m[1]*m[7]*m[10]+m[5]*m[2]*m[11]-m[5]*m[3]*m[10]-m[9]*m[2]*m[7]+m[9]*m[3]*m[6];
  inv[7]=m[0]*m[6]*m[11]-m[0]*m[7]*m[10]-m[4]*m[2]*m[11]+m[4]*m[3]*m[10]+m[8]*m[2]*m[7]-m[8]*m[3]*m[6];
  inv[11]=-m[0]*m[5]*m[11]+m[0]*m[7]*m[9]+m[4]*m[1]*m[11]-m[4]*m[3]*m[9]-m[8]*m[1]*m[7]+m[8]*m[3]*m[5];
  inv[15]=m[0]*m[5]*m[10]-m[0]*m[6]*m[9]-m[4]*m[1]*m[10]+m[4]*m[2]*m[9]+m[8]*m[1]*m[6]-m[8]*m[2]*m[5];
  let det = m[0]*inv[0]+m[1]*inv[4]+m[2]*inv[8]+m[3]*inv[12];
  if (!det) throw new Error('singular matrix');
  det = 1/det; for (let i=0;i<16;i++) inv[i]*=det;
  return inv;
}
const norm = (v) => { const l = Math.hypot(v[0],v[1],v[2]) || 1; return [v[0]/l, v[1]/l, v[2]/l]; };
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const sub = (a,b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const origin = (m) => [m[12], m[13], m[14]];

const g = load(SRC); const J = g.json;
const world = new Array(J.nodes.length);
const parentOf = new Array(J.nodes.length).fill(-1);
for (let i = 0; i < J.nodes.length; i++) for (const c of (J.nodes[i].children || [])) parentOf[c] = i;
for (const r of J.scenes[J.scene].nodes) (function rec(i, p) { const m = mul(p, g.nodeMatrix(J.nodes[i])); world[i] = m; (J.nodes[i].children || []).forEach((c) => rec(c, m)); })(r, compose([0,0,0],[0,0,0,1],[1,1,1]));

// Only skinned meshes: unskinned extras (separate head sculpts, props) would not follow the rig.
const prims = [];
J.nodes.forEach((n, i) => {
  if (n.mesh === undefined || n.skin === undefined) return;
  for (const p of J.meshes[n.mesh].primitives) prims.push({ node: i, prim: p, skin: n.skin, mat: J.materials[p.material] });
});
if (!prims.length) { console.error('no skinned meshes found'); process.exit(1); }
const skin = J.skins[prims[0].skin];
const joints = skin.joints;
const ibms = g.accessor(skin.inverseBindMatrices);

// rig bone -> source node. Matched against that bone's own alias list, so two rig
// bones may share one source joint (a 3-spine skeleton feeding our 4-spine rig).
const rigNode = RIG.map((bone) => {
  const al = ALIAS[bone];
  for (const jn of joints) if (candidates(J.nodes[jn].name).some((c) => al.includes(c))) return jn;
  return -1;
});
const missing = RIG.filter((b, i) => rigNode[i] === -1);
if (missing.length) { console.error('missing rig bones: ' + missing.join(', ')); process.exit(1); }
// every source joint -> nearest rig ancestor, for merging skin weights
const nodeToRig = new Map();
for (const jn of joints) {
  let n = jn, hops = 0, found = 0;
  while (n !== -1 && hops++ < 96) { const b = rigOf(J.nodes[n].name); if (b) { found = RIG.indexOf(b); break; } n = parentOf[n]; }
  nodeToRig.set(jn, found);
}

// --- canonical orientation
const wp = (name) => origin(world[rigNode[RIG.indexOf(name)]]);
const up = norm(sub(wp('bip_head'), wp('bip_pelvis')));
const perp = (v) => { const d = v[0]*up[0]+v[1]*up[1]+v[2]*up[2]; return [v[0]-up[0]*d, v[1]-up[1]*d, v[2]-up[2]*d]; };
const toeL = perp(sub(wp('bip_toe_L'), wp('bip_foot_L'))), toeR = perp(sub(wp('bip_toe_R'), wp('bip_foot_R')));
const toeLen = Math.hypot(toeL[0]+toeR[0], toeL[1]+toeR[1], toeL[2]+toeR[2]);
const legLen = Math.hypot(...sub(wp('bip_hip_L'), wp('bip_foot_L')));
let fwd;
if (toeLen > legLen * 0.06) fwd = norm([toeL[0]+toeR[0], toeL[1]+toeR[1], toeL[2]+toeR[2]]);
else fwd = norm(cross(norm(sub(wp('bip_hip_L'), wp('bip_hip_R'))), up));   // fall back to the hip axis
const right = norm(cross(fwd, up));
const hipAxis = norm(sub(wp('bip_hip_L'), wp('bip_hip_R')));
if (hipAxis[0]*right[0]+hipAxis[1]*right[1]+hipAxis[2]*right[2] > 0) console.log('  note: hips read as inverted, flipping');
const R = new Float64Array(16);
R[0]=right[0]; R[4]=right[1]; R[8]=right[2];
R[1]=up[0];    R[5]=up[1];    R[9]=up[2];
R[2]=-fwd[0];  R[6]=-fwd[1];  R[10]=-fwd[2];
R[15]=1;
console.log(`  heading from ${toeLen > legLen * 0.06 ? 'the feet' : 'the hip axis'}`);

// --- bake vertices into rotated bind space
let mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9];
const baked = [];
for (const c of prims) {
  const a = c.prim.attributes;
  const pos = g.accessorF32(a.POSITION), nrm = a.NORMAL !== undefined ? g.accessorF32(a.NORMAL) : null;
  const uv = g.accessorF32(a.TEXCOORD_0);
  const jt = a.JOINTS_0 !== undefined ? g.accessor(a.JOINTS_0) : null;
  const wt = a.WEIGHTS_0 !== undefined ? g.accessorF32(a.WEIGHTS_0) : null;
  const idx = g.accessor(c.prim.indices);
  const n = pos.length / 3;
  const wpos = new Float32Array(n*3), wnrm = new Float32Array(n*3);
  for (let v = 0; v < n; v++) {
    const local = [pos[v*3], pos[v*3+1], pos[v*3+2]];
    let acc=[0,0,0], accN=[0,0,0], tw=0;
    if (jt && wt) for (let k = 0; k < 4; k++) {
      const w = wt[v*4+k]; if (w <= 0) continue;
      const ji = jt[v*4+k];
      const sm = mul(world[joints[ji]], Array.from(ibms.slice(ji*16, ji*16+16)));
      const q = xform(sm, local);
      acc = [acc[0]+q[0]*w, acc[1]+q[1]*w, acc[2]+q[2]*w];
      if (nrm) { const nn=[nrm[v*3],nrm[v*3+1],nrm[v*3+2]];
        const qn=[sm[0]*nn[0]+sm[4]*nn[1]+sm[8]*nn[2], sm[1]*nn[0]+sm[5]*nn[1]+sm[9]*nn[2], sm[2]*nn[0]+sm[6]*nn[1]+sm[10]*nn[2]];
        accN=[accN[0]+qn[0]*w, accN[1]+qn[1]*w, accN[2]+qn[2]*w]; }
      tw += w;
    }
    if (tw < 1e-6) { acc = xform(world[c.node], local); if (nrm) accN = [nrm[v*3],nrm[v*3+1],nrm[v*3+2]]; }
    const rp = xform(R, acc), rn = norm(xform(R, accN.some(Boolean) ? accN : [0,1,0]));
    wpos[v*3]=rp[0]; wpos[v*3+1]=rp[1]; wpos[v*3+2]=rp[2];
    wnrm[v*3]=rn[0]; wnrm[v*3+1]=rn[1]; wnrm[v*3+2]=rn[2];
    for (let k = 0; k < 3; k++) { mn[k]=Math.min(mn[k],rp[k]); mx[k]=Math.max(mx[k],rp[k]); }
  }
  baked.push({ mat: c.mat.name, wpos, wnrm, uv, jt, wt, idx, n });
}
const rawH = mx[1] - mn[1];
const scale = TARGET_HEIGHT / rawH;
const N = new Float64Array([scale,0,0,0, 0,scale,0,0, 0,0,scale,0,
  -((mn[0]+mx[0])/2)*scale, -mn[1]*scale, -((mn[2]+mx[2])/2)*scale, 1]);
const NR = mul(N, R);

const bones = RIG.map((bone, i) => {
  const wGame = mul(NR, world[rigNode[i]]);
  const pn = RIG_PARENT[bone];
  const pi = pn === null ? -1 : RIG.indexOf(pn);
  const rest = pi === -1 ? wGame : mul(inverse(mul(NR, world[rigNode[pi]])), wGame);
  return { parent: pi, rest: Array.from(rest), ibm: Array.from(inverse(wGame)) };
});

// --- quantise
let uvMin=[1e9,1e9], uvMax=[-1e9,-1e9], pMin=[1e9,1e9,1e9], pMax=[-1e9,-1e9,-1e9];
for (const b of baked) for (let v = 0; v < b.n; v++) {
  uvMin[0]=Math.min(uvMin[0],b.uv[v*2]); uvMin[1]=Math.min(uvMin[1],b.uv[v*2+1]);
  uvMax[0]=Math.max(uvMax[0],b.uv[v*2]); uvMax[1]=Math.max(uvMax[1],b.uv[v*2+1]);
  const p = xform(N, [b.wpos[v*3],b.wpos[v*3+1],b.wpos[v*3+2]]);
  for (let k=0;k<3;k++){ pMin[k]=Math.min(pMin[k],p[k]); pMax[k]=Math.max(pMax[k],p[k]); }
}
const ext = [pMax[0]-pMin[0]||1, pMax[1]-pMin[1]||1, pMax[2]-pMin[2]||1];
const uvExt = [uvMax[0]-uvMin[0]||1, uvMax[1]-uvMin[1]||1];
const vAll = [], iAll = [], groups = [];
for (const b of baked) {
  const base = vAll.length;
  for (let v = 0; v < b.n; v++) {
    const p = xform(N, [b.wpos[v*3],b.wpos[v*3+1],b.wpos[v*3+2]]);
    const acc = new Map();
    if (b.jt && b.wt) for (let k = 0; k < 4; k++) { const w = b.wt[v*4+k]; if (w <= 0) continue; const r = nodeToRig.get(joints[b.jt[v*4+k]]) || 0; acc.set(r, (acc.get(r)||0)+w); }
    if (!acc.size) acc.set(0, 1);
    const top = [...acc.entries()].sort((x,y)=>y[1]-x[1]).slice(0,4);
    const sum = top.reduce((s,e)=>s+e[1],0) || 1;
    const ji=[0,0,0,0], wq=[0,0,0,0];
    top.forEach((e,k)=>{ ji[k]=e[0]; wq[k]=Math.round(e[1]/sum*255); });
    wq[0] += 255 - wq.reduce((s,x)=>s+x,0);
    vAll.push({
      p: [0,1,2].map(k=>Math.max(-32768,Math.min(32767,Math.round((p[k]-pMin[k])/ext[k]*65535-32768)))),
      n: [0,1,2].map(k=>Math.max(-127,Math.min(127,Math.round(b.wnrm[v*3+k]*127)))),
      t: [0,1].map(k=>Math.max(0,Math.min(65535,Math.round((b.uv[v*2+k]-uvMin[k])/uvExt[k]*65535)))),
      j: ji, w: wq });
  }
  const start = iAll.length;
  for (let k = 0; k < b.idx.length; k++) iAll.push(base + b.idx[k]);
  groups.push({ material: b.mat, offset: start, count: b.idx.length });
}
const merged = [];
for (const gr of groups) { const l = merged[merged.length-1]; if (l && l.material === gr.material && l.offset + l.count === gr.offset) l.count += gr.count; else merged.push({ ...gr }); }

const use32 = vAll.length > 65535, VS = 24;
const head = Buffer.alloc(64);
head.write('TFM2', 0, 'ascii');
head.writeUInt16LE(2, 4); head.writeUInt16LE(RIG.length, 6);
head.writeUInt32LE(vAll.length, 8); head.writeUInt32LE(iAll.length, 12);
head.writeUInt16LE(merged.length, 16); head.writeUInt16LE(use32 ? 32 : 16, 18);
for (let k=0;k<3;k++){ head.writeFloatLE(pMin[k], 20+k*4); head.writeFloatLE(ext[k], 32+k*4); }
for (let k=0;k<2;k++){ head.writeFloatLE(uvMin[k], 44+k*4); head.writeFloatLE(uvExt[k], 52+k*4); }
const boneBuf = Buffer.alloc(RIG.length*132);
bones.forEach((bo,i)=>{ const o=i*132; boneBuf.writeInt32LE(bo.parent,o);
  for(let k=0;k<16;k++) boneBuf.writeFloatLE(bo.rest[k], o+4+k*4);
  for(let k=0;k<16;k++) boneBuf.writeFloatLE(bo.ibm[k], o+68+k*4); });
const vBuf = Buffer.alloc(vAll.length*VS);
vAll.forEach((v,i)=>{ const o=i*VS;
  vBuf.writeInt16LE(v.p[0],o); vBuf.writeInt16LE(v.p[1],o+2); vBuf.writeInt16LE(v.p[2],o+4);
  vBuf.writeInt8(v.n[0],o+6); vBuf.writeInt8(v.n[1],o+7); vBuf.writeInt8(v.n[2],o+8); vBuf.writeInt8(0,o+9);
  vBuf.writeUInt16LE(v.t[0],o+10); vBuf.writeUInt16LE(v.t[1],o+12);
  for(let k=0;k<4;k++) vBuf.writeUInt8(v.j[k],o+14+k);
  for(let k=0;k<4;k++) vBuf.writeUInt8(v.w[k],o+18+k);
  vBuf.writeUInt16LE(0,o+22); });
const iBuf = Buffer.alloc(iAll.length*(use32?4:2));
iAll.forEach((x,i)=> use32 ? iBuf.writeUInt32LE(x,i*4) : iBuf.writeUInt16LE(x,i*2));
const out = Buffer.concat([head, boneBuf, vBuf, iBuf]);
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, NAME + '.json'), JSON.stringify({ format: 'TFM2', bytes: out.length, data: out.toString('base64') }));

// material -> which images to pull, for the texture pass
const texJobs = {};
for (const b of merged) {
  const m = J.materials.find((x) => x.name === b.material);
  const pbr = (m && m.pbrMetallicRoughness) || {};
  texJobs[b.material] = {
    base: pbr.baseColorTexture ? J.textures[pbr.baseColorTexture.index].source : null,
    emissive: m && m.emissiveTexture ? J.textures[m.emissiveTexture.index].source : null,
    baseColor: pbr.baseColorFactor || null,
  };
}
fs.writeFileSync(path.join(OUT, NAME + '.texjobs.json'), JSON.stringify(texJobs, null, 1));

// register in the shared manifest without disturbing anything already there
const mfPath = path.join(OUT, 'models.json');
const manifest = fs.existsSync(mfPath) ? JSON.parse(fs.readFileSync(mfPath, 'utf8')) : {};
manifest.rig = manifest.rig || RIG;
manifest.rigParent = manifest.rigParent || RIG.map((b) => (RIG_PARENT[b] === null ? -1 : RIG.indexOf(RIG_PARENT[b])));
manifest.characters = manifest.characters || {};
manifest.characters[NAME] = { file: NAME + '.json', verts: vAll.length, tris: iAll.length / 3, height: TARGET_HEIGHT,
  glow: true, groups: merged.map((m) => ({ material: m.material, offset: m.offset, count: m.count })) };
fs.writeFileSync(mfPath, JSON.stringify(manifest, null, 1));
console.log(`${NAME.padEnd(8)} ${String(vAll.length).padStart(6)}v ${String(iAll.length/3).padStart(6)}t ${(Math.ceil(out.length*4/3)/1024).toFixed(0).padStart(5)}KB groups=${merged.length} rawH=${rawH.toFixed(2)} -> ${TARGET_HEIGHT}m`);
console.log('  groups:', merged.map((m) => m.material.slice(0, 28) + ':' + (m.count/3) + 't').join(', '));
