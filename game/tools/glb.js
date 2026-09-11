// Minimal glTF 2.0 / GLB reader used by the asset tools (node only).
const fs = require('fs');
const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
function load(path) {
  const b = fs.readFileSync(path);
  if (b.toString('ascii', 0, 4) !== 'glTF') throw new Error('not a GLB');
  let o = 12, json = null, bin = null;
  while (o < b.length) {
    const len = b.readUInt32LE(o), type = b.toString('ascii', o + 4, o + 8);
    if (type === 'JSON') json = JSON.parse(b.toString('utf8', o + 8, o + 8 + len));
    else if (type.startsWith('BIN')) bin = b.subarray(o + 8, o + 8 + len);
    o += 8 + len;
  }
  return new Gltf(json, bin);
}
class Gltf {
  constructor(json, bin) { this.json = json; this.bin = bin; }
  bufferView(i) { const v = this.json.bufferViews[i]; return this.bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength); }
  // Returns a typed array of the accessor's data, de-interleaved.
  accessor(i) {
    const a = this.json.accessors[i], comps = NC[a.type], Ctor = CT[a.componentType];
    const out = new Ctor(a.count * comps);
    if (a.bufferView === undefined) return out;
    const v = this.json.bufferViews[a.bufferView];
    const base = (v.byteOffset || 0) + (a.byteOffset || 0);
    const elemSize = comps * Ctor.BYTES_PER_ELEMENT;
    const stride = v.byteStride || elemSize;
    for (let e = 0; e < a.count; e++) {
      const src = base + e * stride;
      for (let c = 0; c < comps; c++) {
        const off = src + c * Ctor.BYTES_PER_ELEMENT;
        out[e * comps + c] = Ctor === Float32Array ? this.bin.readFloatLE(off)
          : Ctor === Uint32Array ? this.bin.readUInt32LE(off)
          : Ctor === Uint16Array ? this.bin.readUInt16LE(off)
          : Ctor === Int16Array ? this.bin.readInt16LE(off)
          : Ctor === Int8Array ? this.bin.readInt8(off) : this.bin.readUInt8(off);
      }
    }
    return out;
  }
  // Normalized float read for possibly-quantized attributes.
  accessorF32(i) {
    const a = this.json.accessors[i], raw = this.accessor(i);
    if (!a.normalized || raw instanceof Float32Array) return raw instanceof Float32Array ? raw : Float32Array.from(raw);
    const max = a.componentType === 5121 ? 255 : a.componentType === 5123 ? 65535 : a.componentType === 5120 ? 127 : 32767;
    const out = new Float32Array(raw.length);
    for (let k = 0; k < raw.length; k++) out[k] = Math.max(raw[k] / max, -1);
    return out;
  }
  nodeMatrix(n) {
    if (n.matrix) return Float64Array.from(n.matrix);
    const t = n.translation || [0, 0, 0], r = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
    return compose(t, r, s);
  }
}
function compose(t, r, s) {
  const [x, y, z, w] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  const m = new Float64Array(16);
  m[0] = (1 - (yy + zz)) * s[0]; m[1] = (xy + wz) * s[0]; m[2] = (xz - wy) * s[0];
  m[4] = (xy - wz) * s[1]; m[5] = (1 - (xx + zz)) * s[1]; m[6] = (yz + wx) * s[1];
  m[8] = (xz + wy) * s[2]; m[9] = (yz - wx) * s[2]; m[10] = (1 - (xx + yy)) * s[2];
  m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; m[15] = 1;
  return m;
}
function mul(a, b) {
  const o = new Float64Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) o[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
  return o;
}
function xform(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; }
function pngSize(buf) { return buf.length > 24 && buf.readUInt32BE(12) === 0x49484452 ? [buf.readUInt32BE(16), buf.readUInt32BE(20)] : (buf.readUInt32BE(0) === 0x89504e47 ? [buf.readUInt32BE(16), buf.readUInt32BE(20)] : null); }
module.exports = { load, Gltf, mul, compose, xform, pngSize };
