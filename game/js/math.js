// Minimal vector / matrix helpers (column-major mat4, WebGL style).
(function (root) {
  'use strict';
  const V = {
    v: (x = 0, y = 0, z = 0) => [x, y, z],
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    madd: (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: (a) => Math.hypot(a[0], a[1], a[2]),
    len2: (a) => a[0] * a[0] + a[1] * a[1] + a[2] * a[2],
    dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
    distXZ: (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]),
    norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
    copy: (a) => [a[0], a[1], a[2]],
    // forward vector from yaw (around Y) and pitch. yaw 0 looks toward -Z.
    forward: (yaw, pitch) => [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)],
    right: (yaw) => [Math.cos(yaw), 0, -Math.sin(yaw)],
    yawTo: (from, to) => Math.atan2(-(to[0] - from[0]), -(to[2] - from[2])),
    pitchTo: (from, to) => { const d = Math.hypot(to[0] - from[0], to[2] - from[2]); return Math.atan2(to[1] - from[1], d); },
  };
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const angleDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
  const rand = (a, b) => a + Math.random() * (b - a);
  const randSign = () => (Math.random() < 0.5 ? -1 : 1);

  const M = {
    identity: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
    perspective: (fovy, aspect, near, far) => {
      const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
      const m = new Float32Array(16);
      m[0] = f / aspect; m[5] = f; m[10] = (far + near) * nf; m[11] = -1; m[14] = 2 * far * near * nf;
      return m;
    },
    ortho: (l, r, b, t, n, f) => {
      const m = new Float32Array(16);
      m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = -2 / (f - n);
      m[12] = -(r + l) / (r - l); m[13] = -(t + b) / (t - b); m[14] = -(f + n) / (f - n); m[15] = 1;
      return m;
    },
    mul: (a, b) => {
      const o = new Float32Array(16);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        o[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
      }
      return o;
    },
    translate: (x, y, z) => { const m = M.identity(); m[12] = x; m[13] = y; m[14] = z; return m; },
    scale: (x, y, z) => { const m = M.identity(); m[0] = x; m[5] = y; m[10] = z; return m; },
    rotX: (a) => { const c = Math.cos(a), s = Math.sin(a); const m = M.identity(); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; },
    rotY: (a) => { const c = Math.cos(a), s = Math.sin(a); const m = M.identity(); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; },
    rotZ: (a) => { const c = Math.cos(a), s = Math.sin(a); const m = M.identity(); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; },
    // View matrix for a camera at pos looking with yaw/pitch (yaw 0 => -Z).
    view: (pos, yaw, pitch) => M.mul(M.rotX(-pitch), M.mul(M.rotY(-yaw), M.translate(-pos[0], -pos[1], -pos[2]))),
    // Model matrix: translate * rotY * rotX * scale
    trs: (p, yaw, pitch, sx, sy, sz) => {
      let m = M.translate(p[0], p[1], p[2]);
      if (yaw) m = M.mul(m, M.rotY(yaw));
      if (pitch) m = M.mul(m, M.rotX(pitch));
      return M.mul(m, M.scale(sx, sy, sz));
    },
    transformPoint: (m, p) => {
      const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
      const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
      const z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
      const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
      return [x / w, y / w, z / w, w];
    },
  };
  const out = { V, M, clamp, angleDiff, rand, randSign };
  if (typeof module !== 'undefined') module.exports = out; else Object.assign(root, out);
})(typeof window !== 'undefined' ? window : globalThis);
