// Skinned character models: .tfm loader, bone hierarchy, GPU skinning buffers and
// a procedural animation rig (these models ship with no animation clips).
(function (root) {
  'use strict';
  const { clamp } = root;

  // ---- in-place column-major mat4 helpers (no per-frame allocation) ----
  function identity(o, i) { i = i || 0; for (let k = 0; k < 16; k++) o[i + k] = 0; o[i] = o[i + 5] = o[i + 10] = o[i + 15] = 1; }
  function mulInto(o, oi, a, ai, b, bi) {
    for (let c = 0; c < 4; c++) {
      const b0 = b[bi + c * 4], b1 = b[bi + c * 4 + 1], b2 = b[bi + c * 4 + 2], b3 = b[bi + c * 4 + 3];
      for (let r = 0; r < 4; r++) o[oi + c * 4 + r] = a[ai + r] * b0 + a[ai + 4 + r] * b1 + a[ai + 8 + r] * b2 + a[ai + 12 + r] * b3;
    }
  }
  // local rotation matrix from ZYX euler, written into scratch
  function euler(o, i, x, y, z) {
    const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
    o[i] = cy * cz; o[i + 1] = cx * sz + sx * sy * cz; o[i + 2] = sx * sz - cx * sy * cz; o[i + 3] = 0;
    o[i + 4] = -cy * sz; o[i + 5] = cx * cz - sx * sy * sz; o[i + 6] = sx * cz + cx * sy * sz; o[i + 7] = 0;
    o[i + 8] = sy; o[i + 9] = -sx * cy; o[i + 10] = cx * cy; o[i + 11] = 0;
    o[i + 12] = 0; o[i + 13] = 0; o[i + 14] = 0; o[i + 15] = 1;
  }

  // Rotation taking unit vector u onto unit vector v (Rodrigues), written column-major.
  function rotBetween(o, oi, u, v) {
    const c = u[0]*v[0] + u[1]*v[1] + u[2]*v[2];
    let ax = u[1]*v[2] - u[2]*v[1], ay = u[2]*v[0] - u[0]*v[2], az = u[0]*v[1] - u[1]*v[0];
    let s = Math.hypot(ax, ay, az);
    if (s < 1e-7) {
      if (c > 0) { identity(o, oi); return; }
      // 180 degrees: pick any axis perpendicular to u
      let px = Math.abs(u[0]) < 0.9 ? 1 : 0, py = Math.abs(u[0]) < 0.9 ? 0 : 1;
      ax = u[1]*0 - u[2]*py; ay = u[2]*px - u[0]*0; az = u[0]*py - u[1]*px;
      s = Math.hypot(ax, ay, az) || 1;
    }
    const kx = ax/s, ky = ay/s, kz = az/s, t = 1 - c;
    o[oi]    = t*kx*kx + c;    o[oi+1]  = t*kx*ky + s*kz; o[oi+2]  = t*kx*kz - s*ky; o[oi+3] = 0;
    o[oi+4]  = t*kx*ky - s*kz; o[oi+5]  = t*ky*ky + c;    o[oi+6]  = t*ky*kz + s*kx; o[oi+7] = 0;
    o[oi+8]  = t*kx*kz + s*ky; o[oi+9]  = t*ky*kz - s*kx; o[oi+10] = t*kz*kz + c;    o[oi+11] = 0;
    o[oi+12] = 0; o[oi+13] = 0; o[oi+14] = 0; o[oi+15] = 1;
  }
  // direction * transpose(rotation part of m), i.e. world direction -> that matrix's local space
  function unrotate(m, mi, d, out) {
    out[0] = m[mi]*d[0] + m[mi+1]*d[1] + m[mi+2]*d[2];
    out[1] = m[mi+4]*d[0] + m[mi+5]*d[1] + m[mi+6]*d[2];
    out[2] = m[mi+8]*d[0] + m[mi+9]*d[1] + m[mi+10]*d[2];
    const l = Math.hypot(out[0], out[1], out[2]) || 1;
    out[0] /= l; out[1] /= l; out[2] /= l;
    return out;
  }
  const nrm3 = (o) => { const l = Math.hypot(o[0], o[1], o[2]) || 1; o[0]/=l; o[1]/=l; o[2]/=l; return o; };

  const BONE = {}; // filled from the manifest: name -> index

  class Model {
    constructor(gl, name, buf, meta, manifest) {
      this.name = name; this.gl = gl;
      const dv = new DataView(buf);
      if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'TFM2') throw new Error('bad model ' + name);
      this.boneCount = dv.getUint16(6, true);
      const vertCount = dv.getUint32(8, true), indexCount = dv.getUint32(12, true);
      const groupCount = dv.getUint16(16, true), indexBits = dv.getUint16(18, true);
      this.posMin = [dv.getFloat32(20, true), dv.getFloat32(24, true), dv.getFloat32(28, true)];
      this.posExt = [dv.getFloat32(32, true), dv.getFloat32(36, true), dv.getFloat32(40, true)];
      this.uvMin = [dv.getFloat32(44, true), dv.getFloat32(48, true)];
      this.uvExt = [dv.getFloat32(52, true), dv.getFloat32(56, true)];
      let off = 64;
      this.parent = new Int32Array(this.boneCount);
      this.rest = new Float32Array(this.boneCount * 16);
      this.ibm = new Float32Array(this.boneCount * 16);
      for (let b = 0; b < this.boneCount; b++) {
        this.parent[b] = dv.getInt32(off, true); off += 4;
        for (let k = 0; k < 16; k++) { this.rest[b * 16 + k] = dv.getFloat32(off, true); off += 4; }
        for (let k = 0; k < 16; k++) { this.ibm[b * 16 + k] = dv.getFloat32(off, true); off += 4; }
      }
      const vBytes = vertCount * 24;
      this.vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(buf, off, vBytes), gl.STATIC_DRAW); off += vBytes;
      const iBytes = indexCount * (indexBits === 32 ? 4 : 2);
      this.ibo = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint8Array(buf, off, iBytes), gl.STATIC_DRAW);
      this.indexType = indexBits === 32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
      this.indexBytes = indexBits === 32 ? 4 : 2;
      this.groups = meta.groups.map((gr) => ({ offset: gr.offset, count: gr.count, material: gr.material,
        texFile: manifest.textures[gr.material], emisFile: (manifest.emissive || {})[gr.material] }));
      this.glow = !!meta.glow;
      this.tris = meta.tris;
      // rest-pose world matrices, used for bone lengths and anchor heights
      this.restWorld = new Float32Array(this.boneCount * 16);
      for (let b = 0; b < this.boneCount; b++) {
        const p = this.parent[b];
        if (p < 0) this.restWorld.set(this.rest.subarray(b * 16, b * 16 + 16), b * 16);
        else mulInto(this.restWorld, b * 16, this.restWorld, p * 16, this.rest, b * 16);
      }
      const rp = (i) => [this.restWorld[i*16+12], this.restWorld[i*16+13], this.restWorld[i*16+14]];
      const dist = (a, c) => Math.hypot(a[0]-c[0], a[1]-c[1], a[2]-c[2]);
      const B = manifest.rig.reduce((m, n, i) => (m[n] = i, m), {});
      this.armUpper = dist(rp(B.bip_upperArm_R), rp(B.bip_lowerArm_R));
      this.armFore = dist(rp(B.bip_lowerArm_R), rp(B.bip_hand_R));
      this.chest = rp(B.bip_spine_3);
      this.headY = rp(B.bip_head)[1];
      this.height = meta.height;
    }
  }

  // One skeleton instance: local rotation matrices, world matrices, skin palette.
  class Pose {
    constructor(model) {
      this.model = model;
      const n = model.boneCount;
      this.local = new Float32Array(n * 16);
      this.world = new Float32Array(n * 16);
      this.skin = new Float32Array(n * 12);
      this.rotM = new Float32Array(n * 16);
      this.s = new Float32Array(80);
      this.v0 = [0, 0, 0]; this.v1 = [0, 0, 0]; this.v2 = [0, 0, 0]; this.v3 = [0, 0, 0];
      this.reset();
    }
    reset() { for (let b = 0; b < this.model.boneCount; b++) identity(this.rotM, b * 16); }
    // Compose an extra euler rotation onto a bone's local rotation.
    add(bone, x, y, z) {
      if (bone === undefined || bone < 0) return;
      if (!x && !y && !z) return;
      const s = this.s;
      euler(s, 0, x, y, z);
      mulInto(s, 16, this.rotM, bone * 16, s, 0);
      this.rotM.set(s.subarray(16, 32), bone * 16);
    }
    setRot(bone, src, si) { this.rotM.set(src.subarray(si, si + 16), bone * 16); }
    boneWorld(b) {
      const m = this.model, s = this.s;
      mulInto(this.local, b * 16, m.rest, b * 16, this.rotM, b * 16);
      const p = m.parent[b];
      if (p < 0) mulInto(this.world, b * 16, this.root, 0, this.local, b * 16);
      else mulInto(this.world, b * 16, this.world, p * 16, this.local, b * 16);
    }
    // Pass 1: every bone from the current rotations.
    update(rootMatrix) {
      this.root = rootMatrix;
      for (let b = 0; b < this.model.boneCount; b++) this.boneWorld(b);
    }
    // Refresh a bone and everything below it (used after solving an arm).
    refreshFrom(bone) { for (let b = bone; b < this.model.boneCount; b++) this.boneWorld(b); }
    finish() {
      const m = this.model, s = this.s;
      for (let b = 0; b < m.boneCount; b++) {
        mulInto(s, 16, this.world, b * 16, m.ibm, b * 16);
        const o = b * 12;
        this.skin[o] = s[16]; this.skin[o+1] = s[20]; this.skin[o+2] = s[24]; this.skin[o+3] = s[28];
        this.skin[o+4] = s[17]; this.skin[o+5] = s[21]; this.skin[o+6] = s[25]; this.skin[o+7] = s[29];
        this.skin[o+8] = s[18]; this.skin[o+9] = s[22]; this.skin[o+10] = s[26]; this.skin[o+11] = s[30];
      }
    }
    bonePos(bone, out) { const o = bone * 16; out[0] = this.world[o+12]; out[1] = this.world[o+13]; out[2] = this.world[o+14]; return out; }
    // Point a bone along a world direction by rotating it minimally from its rest aim.
    aimBone(bone, childBone, dirWorld) {
      const m = this.model, s = this.s;
      // rest aim of this bone, in its own local space
      const t = m.rest, ci = childBone * 16;
      const u = nrm3([t[ci+12], t[ci+13], t[ci+14]]);
      // parent world * rest(bone) gives the frame the local rotation acts in
      const p = m.parent[bone];
      if (p < 0) mulInto(s, 32, this.root, 0, m.rest, bone * 16);
      else mulInto(s, 32, this.world, p * 16, m.rest, bone * 16);
      const v = unrotate(s, 32, dirWorld, this.v3);
      rotBetween(s, 48, u, v);
      this.setRot(bone, s, 48);
      this.boneWorld(bone);
    }
    // Two-bone IK: place `hand` at target, elbow bent toward pole.
    solveArm(shoulder, elbow, hand, target, pole) {
      const m = this.model;
      const S = this.bonePos(shoulder, this.v0);
      const sc = this.scale || 1;
      const L1 = m.armUpper * sc, L2 = m.armFore * sc;
      let dx = target[0]-S[0], dy = target[1]-S[1], dz = target[2]-S[2];
      let d = Math.hypot(dx, dy, dz);
      const dmin = Math.abs(L1 - L2) + 1e-3, dmax = L1 + L2 - 1e-3;
      if (d < 1e-5) { dx = 0; dy = -1; dz = 0; d = 1; }
      const dc = Math.min(Math.max(d, dmin), dmax);
      const n = [dx/d, dy/d, dz/d];
      // component of the pole direction perpendicular to the shoulder-target axis
      let px = pole[0]-S[0], py = pole[1]-S[1], pz = pole[2]-S[2];
      const dot = px*n[0] + py*n[1] + pz*n[2];
      px -= n[0]*dot; py -= n[1]*dot; pz -= n[2]*dot;
      let pl = Math.hypot(px, py, pz);
      if (pl < 1e-5) { px = -n[1]; py = n[0]; pz = 0; pl = Math.hypot(px, py, pz) || 1; }
      const q = [px/pl, py/pl, pz/pl];
      const cosA = Math.min(1, Math.max(-1, (L1*L1 + dc*dc - L2*L2) / (2*L1*dc)));
      const a = Math.acos(cosA), ca = Math.cos(a), sa = Math.sin(a);
      const upper = [n[0]*ca + q[0]*sa, n[1]*ca + q[1]*sa, n[2]*ca + q[2]*sa];
      this.aimBone(shoulder, elbow, upper);
      const E = [S[0] + upper[0]*L1, S[1] + upper[1]*L1, S[2] + upper[2]*L1];
      const fore = nrm3([target[0]-E[0], target[1]-E[1], target[2]-E[2]]);
      this.aimBone(elbow, hand, fore);
      this.boneWorld(hand);
    }
  }

  class ModelSet {
    constructor(gl) { this.gl = gl; this.models = {}; this.textures = {}; this.ready = false; this.failed = false; this.manifest = null; }
    async load(base) {
      // Browsers block fetch() on file:// URLs, so opening index.html directly
      // keeps the blocky players. Serving the folder over http enables the models.
      if (typeof location !== 'undefined' && location.protocol === 'file:') {
        this.failed = true; this.error = new Error('file:// cannot load model data');
        console.info('Character models need the game served over http (python3 -m http.server). Using the blocky players.');
        return false;
      }
      try {
        const mf = await fetch(base + 'models.json');
        if (!mf.ok) throw new Error('models.json ' + mf.status);
        const manifest = await mf.json();
        this.manifest = manifest;
        manifest.rig.forEach((n, i) => { BONE[n] = i; });
        this.bone = BONE;
        const texFiles = [...new Set([...Object.values(manifest.textures), ...Object.values(manifest.emissive || {})])];
        await Promise.all(texFiles.map((f) => this.loadTexture(base + f, f)));
        const all = Object.assign({}, manifest.classes, manifest.characters || {});
        await Promise.all(Object.entries(all).map(async ([name, meta]) => {
          const r = await fetch(base + meta.file);
          if (!r.ok) throw new Error(meta.file + ' ' + r.status);
          const wrapped = await r.json();
          const bin = atob(wrapped.data);
          const buf = new ArrayBuffer(bin.length);
          const u8 = new Uint8Array(buf);
          for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          this.models[name] = new Model(this.gl, name, buf, meta, manifest);
        }));
        this.ready = true;
        return true;
      } catch (e) { this.failed = true; this.error = e; console.warn('character models unavailable, using blocky players:', e.message); return false; }
    }
    loadTexture(url, key) {
      const gl = this.gl;
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const t = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, t);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
          const pow2 = (x) => (x & (x - 1)) === 0;
          if (pow2(img.width) && pow2(img.height)) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
          else { gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); }
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          this.textures[key] = t; resolve(t);
        };
        img.onerror = () => resolve(null);
        img.src = url;
      });
    }
    get(cls) { return this.models[cls] || null; }
  }

  // ---------------------------------------------------------------- animation
  // These models ship with no clips, so the whole pose is generated: eulers drive
  // the spine and legs, two-bone IK puts both hands on the weapon.
  // Grips are expressed in the aim frame (right, up, forward) from the chest.
  const GRIP = {
    rifle:    { off: [0.18, -0.26, 0.24], fore: 0.40, drop: 0.01 },
    pistol:   { off: [0.15, -0.24, 0.28], fore: 0,    drop: 0.0 },
    heavy:    { off: [0.21, -0.30, 0.22], fore: 0.52, drop: 0.03 },
    launcher: { off: [0.17, -0.22, 0.24], fore: 0.44, drop: -0.02 },
    melee:    { off: [0.26, -0.26, 0.18], fore: 0,    drop: 0.0 },
  };
  const _a = [0, 0, 0], _b = [0, 0, 0], _c = [0, 0, 0], _t = [0, 0, 0], _p = [0, 0, 0];

  function animate(pose, st) {
    const B = BONE, m = pose.model;
    pose.reset();
    const speed = clamp(st.speed / 7, 0, 1.4);
    const air = st.onGround ? 0 : 1;
    const phase = st.walkPhase * 2.2;
    const pitch = clamp(st.pitch, -1.2, 1.2);

    // --- torso follows the aim, the head a bit more
    pose.add(B.bip_spine_2, pitch * 0.14, 0, 0);
    pose.add(B.bip_spine_3, pitch * 0.18, 0, 0);
    pose.add(B.bip_neck, pitch * 0.26, 0, 0);
    pose.add(B.bip_head, pitch * 0.3, 0, 0);
    pose.add(B.bip_spine_1, Math.sin(st.time * 1.6) * 0.02, Math.sin(st.time * 0.7) * 0.02 * (1 - speed), 0);

    if (air) {
      const t = clamp(-st.velY / 8, -1, 1);
      pose.add(B.bip_hip_L, -0.65 + t * 0.25, 0, 0.06);
      pose.add(B.bip_knee_L, 0.95, 0, 0);
      pose.add(B.bip_hip_R, -0.3 - t * 0.2, 0, -0.06);
      pose.add(B.bip_knee_R, 0.55, 0, 0);
      pose.add(B.bip_foot_L, -0.3, 0, 0); pose.add(B.bip_foot_R, -0.2, 0, 0);
    } else if (speed > 0.06) {
      const sw = Math.sin(phase), sw2 = Math.sin(phase + Math.PI);
      const amp = 0.6 * speed, kamp = 0.85 * speed;
      pose.add(B.bip_hip_L, sw * amp - 0.1, 0, 0.04);
      pose.add(B.bip_hip_R, sw2 * amp - 0.1, 0, -0.04);
      pose.add(B.bip_knee_L, Math.max(0, -sw + 0.2) * kamp, 0, 0);
      pose.add(B.bip_knee_R, Math.max(0, -sw2 + 0.2) * kamp, 0, 0);
      pose.add(B.bip_foot_L, -sw * 0.25 * speed, 0, 0);
      pose.add(B.bip_foot_R, -sw2 * 0.25 * speed, 0, 0);
      pose.add(B.bip_pelvis, 0.05 * speed, sw * 0.13 * speed, Math.sin(phase * 2) * 0.03 * speed);
      pose.add(B.bip_spine_1, 0, -sw * 0.11 * speed, 0);
    } else {
      pose.add(B.bip_hip_L, -0.04, 0, 0.05); pose.add(B.bip_hip_R, -0.04, 0, -0.05);
      pose.add(B.bip_knee_L, 0.08, 0, 0); pose.add(B.bip_knee_R, 0.08, 0, 0);
    }
    pose.update(st.root);

    // --- aim frame for the weapon
    const g = st.grip || GRIP.rifle;
    const swing = st.swing || 0, fire = st.fireAnim || 0;
    const wyaw = st.yaw - swing * 0.45;
    const wpitch = clamp(st.pitch + swing * 1.25 + fire * 0.16, -1.4, 1.4);
    const cy = Math.cos(wpitch);
    const fwd = [-Math.sin(wyaw) * cy, Math.sin(wpitch), -Math.cos(wyaw) * cy];
    const right = [Math.cos(wyaw), 0, -Math.sin(wyaw)];
    const up = [right[1]*fwd[2] - right[2]*fwd[1], right[2]*fwd[0] - right[0]*fwd[2], right[0]*fwd[1] - right[1]*fwd[0]];
    const chest = pose.bonePos(B.bip_spine_3, _c);
    const back = fire * 0.05;
    for (let k = 0; k < 3; k++) _t[k] = chest[k] + right[k] * g.off[0] + up[k] * g.off[1] + fwd[k] * (g.off[2] - back);
    pose.weapon = { pos: [_t[0], _t[1], _t[2]], yaw: wyaw, pitch: wpitch };

    // --- right hand on the grip, elbow down and out
    const sr = pose.bonePos(B.bip_upperArm_R, _a);
    for (let k = 0; k < 3; k++) _p[k] = sr[k] + right[k] * 0.45 - up[k] * 0.85 - fwd[k] * 0.15;
    pose.solveArm(B.bip_upperArm_R, B.bip_lowerArm_R, B.bip_hand_R, _t, _p);
    // --- left hand on the forend, when the weapon needs two hands
    if (g.fore > 0) {
      const sl = pose.bonePos(B.bip_upperArm_L, _b);
      const lt = [_t[0] + fwd[0] * g.fore - up[0] * g.drop, _t[1] + fwd[1] * g.fore - up[1] * g.drop, _t[2] + fwd[2] * g.fore - up[2] * g.drop];
      for (let k = 0; k < 3; k++) _p[k] = sl[k] - right[k] * 0.45 - up[k] * 0.8 - fwd[k] * 0.05;
      pose.solveArm(B.bip_upperArm_L, B.bip_lowerArm_L, B.bip_hand_L, lt, _p);
    } else if (speed > 0.06) {
      pose.add(B.bip_upperArm_L, Math.sin(phase + Math.PI) * 0.3 * speed, 0, 0);
      pose.refreshFrom(B.bip_upperArm_L);
    }
    pose.finish();
  }

  Object.assign(root, { ModelSet, Model, Pose, animate, GRIP, BONE });
})(window);
