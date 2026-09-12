// Turn any glTF/GLB model into a static prop the game can place: crates, terminals,
// barrels, signage, anything modelled in Blender and exported as GLB.
//
// Props reuse the skinned draw path with a single bone, so they cost no extra code
// in the renderer: every vertex is weighted to bone 0 and that bone is the prop's
// placement matrix.
//
//   node tools/extract-prop.js <source.glb> <name> [outDir] [--height=1.2] [--credit="..."]
const fs = require('fs'), path = require('path');
const { load, mul, compose, xform } = require('./glb.js');

const argv = process.argv.slice(2);
const flags = {}, positional = [];
for (const a of argv) { const m = /^--([a-zA-Z]+)=(.*)$/.exec(a); if (m) flags[m[1]] = m[2]; else positional.push(a); }
const SRC = positional[0], NAME = positional[1];
const OUT = positional[2] || path.join(__dirname, '..', 'assets', 'models');
if (!SRC || !NAME) { console.error('usage: extract-prop.js <source.glb> <name> [outDir] [--height=1.2] [--credit="..."]'); process.exit(1); }
const TARGET_H = flags.height ? parseFloat(flags.height) : null;

const g = load(SRC); const J = g.json;
const world = new Array(J.nodes.length);
for (const r of J.scenes[J.scene].nodes)
  (function rec(i, p) { const m = mul(p, g.nodeMatrix(J.nodes[i])); world[i] = m; (J.nodes[i].children || []).forEach((c) => rec(c, m)); })(r, compose([0,0,0],[0,0,0,1],[1,1,1]));

// Bake every mesh into one static buffer, in its bind pose if it happens to be rigged.
const baked = [];
let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
J.nodes.forEach((n, ni) => {
  if (n.mesh === undefined) return;
  const skin = n.skin !== undefined ? J.skins[n.skin] : null;
  const ibms = skin ? g.accessor(skin.inverseBindMatrices) : null;
  for (const prim of J.meshes[n.mesh].primitives) {
    const a = prim.attributes;
    if (a.POSITION === undefined || prim.indices === undefined) continue;
    const pos = g.accessorF32(a.POSITION);
    const nrm = a.NORMAL !== undefined ? g.accessorF32(a.NORMAL) : null;
    const uv = a.TEXCOORD_0 !== undefined ? g.accessorF32(a.TEXCOORD_0) : new Float32Array(pos.length / 3 * 2);
    const jt = skin && a.JOINTS_0 !== undefined ? g.accessor(a.JOINTS_0) : null;
    const wt = skin && a.WEIGHTS_0 !== undefined ? g.accessorF32(a.WEIGHTS_0) : null;
    const idx = g.accessor(prim.indices);
    const count = pos.length / 3;
    const wpos = new Float32Array(count * 3), wnrm = new Float32Array(count * 3);
    for (let v = 0; v < count; v++) {
      const local = [pos[v*3], pos[v*3+1], pos[v*3+2]];
      let p = null, nv = nrm ? [nrm[v*3], nrm[v*3+1], nrm[v*3+2]] : [0, 1, 0];
      if (jt && wt && wt[v*4] > 0) {
        const ji = jt[v*4];
        const sm = mul(world[skin.joints[ji]], Array.from(ibms.slice(ji*16, ji*16+16)));
        p = xform(sm, local);
        nv = [sm[0]*nv[0]+sm[4]*nv[1]+sm[8]*nv[2], sm[1]*nv[0]+sm[5]*nv[1]+sm[9]*nv[2], sm[2]*nv[0]+sm[6]*nv[1]+sm[10]*nv[2]];
      } else {
        p = xform(world[ni], local);
        const m = world[ni];
        nv = [m[0]*nv[0]+m[4]*nv[1]+m[8]*nv[2], m[1]*nv[0]+m[5]*nv[1]+m[9]*nv[2], m[2]*nv[0]+m[6]*nv[1]+m[10]*nv[2]];
      }
      const l = Math.hypot(nv[0], nv[1], nv[2]) || 1;
      wpos[v*3] = p[0]; wpos[v*3+1] = p[1]; wpos[v*3+2] = p[2];
      wnrm[v*3] = nv[0]/l; wnrm[v*3+1] = nv[1]/l; wnrm[v*3+2] = nv[2]/l;
      for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); }
    }
    baked.push({ mat: J.materials[prim.material] ? J.materials[prim.material].name : 'default', wpos, wnrm, uv, idx, n: count });
  }
});
if (!baked.length) { console.error('no meshes found'); process.exit(1); }

// Normalise: origin at the base centre, optional scale to a target height.
const rawH = mx[1] - mn[1];
const scale = TARGET_H ? TARGET_H / (rawH || 1) : 1;
const cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2;
const place = (p) => [(p[0] - cx) * scale, (p[1] - mn[1]) * scale, (p[2] - cz) * scale];

let uvMin = [1e9, 1e9], uvMax = [-1e9, -1e9], pMin = [1e9, 1e9, 1e9], pMax = [-1e9, -1e9, -1e9];
for (const b of baked) for (let v = 0; v < b.n; v++) {
  uvMin[0] = Math.min(uvMin[0], b.uv[v*2]); uvMin[1] = Math.min(uvMin[1], b.uv[v*2+1]);
  uvMax[0] = Math.max(uvMax[0], b.uv[v*2]); uvMax[1] = Math.max(uvMax[1], b.uv[v*2+1]);
  const p = place([b.wpos[v*3], b.wpos[v*3+1], b.wpos[v*3+2]]);
  for (let k = 0; k < 3; k++) { pMin[k] = Math.min(pMin[k], p[k]); pMax[k] = Math.max(pMax[k], p[k]); }
}
const ext = [pMax[0]-pMin[0]||1, pMax[1]-pMin[1]||1, pMax[2]-pMin[2]||1];
const uvExt = [uvMax[0]-uvMin[0]||1, uvMax[1]-uvMin[1]||1];

const vAll = [], iAll = [], groups = [];
for (const b of baked) {
  const base = vAll.length;
  for (let v = 0; v < b.n; v++) {
    const p = place([b.wpos[v*3], b.wpos[v*3+1], b.wpos[v*3+2]]);
    vAll.push({
      p: [0,1,2].map(k => Math.max(-32768, Math.min(32767, Math.round((p[k]-pMin[k])/ext[k]*65535-32768)))),
      n: [0,1,2].map(k => Math.max(-127, Math.min(127, Math.round(b.wnrm[v*3+k]*127)))),
      t: [0,1].map(k => Math.max(0, Math.min(65535, Math.round((b.uv[v*2+k]-uvMin[k])/uvExt[k]*65535)))),
    });
  }
  const start = iAll.length;
  for (let k = 0; k < b.idx.length; k++) iAll.push(base + b.idx[k]);
  groups.push({ material: b.mat, offset: start, count: b.idx.length });
}
const merged = [];
for (const gr of groups) { const l = merged[merged.length-1]; if (l && l.material === gr.material && l.offset + l.count === gr.offset) l.count += gr.count; else merged.push({ ...gr }); }

// One bone, identity: at draw time that bone carries the prop's placement matrix.
const IDENT = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
const use32 = vAll.length > 65535, VS = 24;
const head = Buffer.alloc(64);
head.write('TFM2', 0, 'ascii');
head.writeUInt16LE(2, 4); head.writeUInt16LE(1, 6);
head.writeUInt32LE(vAll.length, 8); head.writeUInt32LE(iAll.length, 12);
head.writeUInt16LE(merged.length, 16); head.writeUInt16LE(use32 ? 32 : 16, 18);
for (let k = 0; k < 3; k++) { head.writeFloatLE(pMin[k], 20+k*4); head.writeFloatLE(ext[k], 32+k*4); }
for (let k = 0; k < 2; k++) { head.writeFloatLE(uvMin[k], 44+k*4); head.writeFloatLE(uvExt[k], 52+k*4); }
const boneBuf = Buffer.alloc(132);
boneBuf.writeInt32LE(-1, 0);
for (let k = 0; k < 16; k++) boneBuf.writeFloatLE(IDENT[k], 4+k*4);
for (let k = 0; k < 16; k++) boneBuf.writeFloatLE(IDENT[k], 68+k*4);
const vBuf = Buffer.alloc(vAll.length * VS);
vAll.forEach((v, i) => { const o = i*VS;
  vBuf.writeInt16LE(v.p[0], o); vBuf.writeInt16LE(v.p[1], o+2); vBuf.writeInt16LE(v.p[2], o+4);
  vBuf.writeInt8(v.n[0], o+6); vBuf.writeInt8(v.n[1], o+7); vBuf.writeInt8(v.n[2], o+8); vBuf.writeInt8(0, o+9);
  vBuf.writeUInt16LE(v.t[0], o+10); vBuf.writeUInt16LE(v.t[1], o+12);
  vBuf.writeUInt8(0, o+14); vBuf.writeUInt8(0, o+15); vBuf.writeUInt8(0, o+16); vBuf.writeUInt8(0, o+17);
  vBuf.writeUInt8(255, o+18); vBuf.writeUInt8(0, o+19); vBuf.writeUInt8(0, o+20); vBuf.writeUInt8(0, o+21);
  vBuf.writeUInt16LE(0, o+22); });
const iBuf = Buffer.alloc(iAll.length * (use32 ? 4 : 2));
iAll.forEach((x, i) => (use32 ? iBuf.writeUInt32LE(x, i*4) : iBuf.writeUInt16LE(x, i*2)));
const out = Buffer.concat([head, boneBuf, vBuf, iBuf]);
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, NAME + '.json'), JSON.stringify({ format: 'TFM2', bytes: out.length, data: out.toString('base64') }));

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

const mfPath = path.join(OUT, 'models.json');
const manifest = fs.existsSync(mfPath) ? JSON.parse(fs.readFileSync(mfPath, 'utf8')) : {};
manifest.props = manifest.props || {};
manifest.props[NAME] = { file: NAME + '.json', verts: vAll.length, tris: iAll.length / 3,
  size: [ext[0], ext[1], ext[2]].map((v) => +v.toFixed(2)), credit: flags.credit || undefined,
  groups: merged.map((m) => ({ material: m.material, offset: m.offset, count: m.count })) };
fs.writeFileSync(mfPath, JSON.stringify(manifest, null, 1));

console.log(`${NAME.padEnd(10)} ${String(vAll.length).padStart(6)}v ${String(iAll.length/3).padStart(6)}t  size ${ext.map((v)=>v.toFixed(2)).join(' x ')} m  groups=${merged.length}`);
console.log('  next: node tools/extract-character-textures.js ' + SRC + ' ' + NAME + ' ' + OUT);
