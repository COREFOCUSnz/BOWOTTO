// Voxel world: solid grid + wedge ramps + water volumes + team blockers.
// Collision (AABB movers), raycasts (DDA) and greedy meshing for the renderer.
(function (root) {
  'use strict';
  const { V } = typeof module !== 'undefined' ? require('./math.js') : root;

  const MAT = {
    AIR: 0, BRICK: 1, CONCRETE: 2, METAL: 3, WOOD: 4, WATER: 5, DIRT: 6,
    BLUE: 7, RED: 8, STONE: 9, LIGHT: 12, DARKBRICK: 13, GRATE: 14,
  };

  class World {
    constructor(min, max, res) {
      this.min = min; this.max = max; this.res = res;
      this.nx = Math.round((max[0] - min[0]) / res);
      this.ny = Math.round((max[1] - min[1]) / res);
      this.nz = Math.round((max[2] - min[2]) / res);
      this.cells = new Uint8Array(this.nx * this.ny * this.nz);
      this.ramps = [];
      this.water = [];
      this.blockers = []; // {min,max,team}
      this.meshes = []; // extra static meshes (wedges)
    }
    idx(ix, iy, iz) { return (ix * this.ny + iy) * this.nz + iz; }
    toCell(x, y, z) {
      return [Math.floor((x - this.min[0]) / this.res), Math.floor((y - this.min[1]) / this.res), Math.floor((z - this.min[2]) / this.res)];
    }
    inGrid(ix, iy, iz) { return ix >= 0 && iy >= 0 && iz >= 0 && ix < this.nx && iy < this.ny && iz < this.nz; }
    get(ix, iy, iz) { return this.inGrid(ix, iy, iz) ? this.cells[this.idx(ix, iy, iz)] : MAT.STONE; }
    solidAt(x, y, z) { const c = this.toCell(x, y, z); return this.get(c[0], c[1], c[2]) !== 0; }
    _range(box) {
      const a = this.toCell(box[0][0] + 1e-6, box[0][1] + 1e-6, box[0][2] + 1e-6);
      const b = this.toCell(box[1][0] - 1e-6, box[1][1] - 1e-6, box[1][2] - 1e-6);
      return [Math.max(0, a[0]), Math.max(0, a[1]), Math.max(0, a[2]), Math.min(this.nx - 1, b[0]), Math.min(this.ny - 1, b[1]), Math.min(this.nz - 1, b[2])];
    }
    fill(box, mat) {
      const r = this._range(box);
      for (let x = r[0]; x <= r[3]; x++) for (let y = r[1]; y <= r[4]; y++) for (let z = r[2]; z <= r[5]; z++) this.cells[this.idx(x, y, z)] = mat;
    }
    carve(box) { this.fill(box, 0); }
    // Set the material of all SOLID cells inside box (used for room interiors: pass box expanded by one cell).
    paint(box, mat) {
      const r = this._range([[box[0][0] - this.res, box[0][1] - this.res, box[0][2] - this.res], [box[1][0] + this.res, box[1][1] + this.res, box[1][2] + this.res]]);
      for (let x = r[0]; x <= r[3]; x++) for (let y = r[1]; y <= r[4]; y++) for (let z = r[2]; z <= r[5]; z++) {
        const i = this.idx(x, y, z); if (this.cells[i]) this.cells[i] = mat;
      }
    }
    // Any solid voxel overlapping the AABB [min,max]?
    boxSolid(min, max) {
      const r = this._range([min, max]);
      if (min[0] < this.min[0] || min[1] < this.min[1] || min[2] < this.min[2] || max[0] > this.max[0] || max[1] > this.max[1] || max[2] > this.max[2]) return true;
      for (let x = r[0]; x <= r[3]; x++) for (let y = r[1]; y <= r[4]; y++) for (let z = r[2]; z <= r[5]; z++) if (this.cells[this.idx(x, y, z)]) return true;
      return false;
    }
    boxBlocked(min, max, team) {
      for (const b of this.blockers) {
        if (b.team === team) continue;
        if (min[0] < b.max[0] && max[0] > b.min[0] && min[1] < b.max[1] && max[1] > b.min[1] && min[2] < b.max[2] && max[2] > b.min[2]) return true;
      }
      return false;
    }
    // ---- ramps: {min:[x,y,z], max:[x,y,z], axis:0|2, dir:+1|-1}. Surface height rises along axis*dir.
    addRamp(r) { this.ramps.push(r); }
    rampHeightAt(x, z, r) {
      const a = r.axis, c = a === 0 ? x : z;
      let t = (c - r.min[a]) / (r.max[a] - r.min[a]);
      if (r.dir < 0) t = 1 - t;
      return r.min[1] + t * (r.max[1] - r.min[1]);
    }
    rampNormal(r) {
      const dy = r.max[1] - r.min[1], dl = r.max[r.axis] - r.min[r.axis];
      const n = [0, dl, 0]; n[r.axis] = -dy * r.dir; return V.norm(n);
    }
    // Highest ramp surface under point (x,z) — returns {h, ramp} or null.
    rampUnder(x, z, y) {
      let best = null;
      for (const r of this.ramps) {
        if (x < r.min[0] || x > r.max[0] || z < r.min[2] || z > r.max[2]) continue;
        const h = this.rampHeightAt(x, z, r);
        if (h > y + 2.5) continue; // far above us: we're under it
        if (!best || h > best.h) best = { h, ramp: r };
      }
      return best;
    }
    pointInRamp(p) {
      for (const r of this.ramps) {
        if (p[0] < r.min[0] || p[0] > r.max[0] || p[2] < r.min[2] || p[2] > r.max[2] || p[1] < r.min[1] - 0.01) continue;
        if (p[1] <= this.rampHeightAt(p[0], p[2], r)) return r;
      }
      return null;
    }
    // ---- water volumes
    addWater(min, max) { this.water.push({ min, max }); }
    inWater(p) {
      for (const w of this.water) if (p[0] >= w.min[0] && p[0] <= w.max[0] && p[1] >= w.min[1] && p[1] <= w.max[1] && p[2] >= w.min[2] && p[2] <= w.max[2]) return w;
      return null;
    }
    waterSurfaceAt(p) { const w = this.inWater(p); return w ? w.max[1] : null; }

    // ---- point solidity for projectiles (voxel + ramp)
    pointSolid(p) { return this.solidAt(p[0], p[1], p[2]) || !!this.pointInRamp(p); }

    // ---- raycast: returns {dist, point, normal} or null (voxels + ramps).
    raycast(o, d, maxDist) {
      const res = this.res;
      let best = null;
      // DDA through voxels
      let cell = this.toCell(o[0], o[1], o[2]);
      const step = [Math.sign(d[0]), Math.sign(d[1]), Math.sign(d[2])];
      const tDelta = [Math.abs(res / d[0]), Math.abs(res / d[1]), Math.abs(res / d[2])];
      const tMax = [0, 0, 0];
      for (let i = 0; i < 3; i++) {
        const cellMin = this.min[i] + cell[i] * res;
        if (d[i] > 0) tMax[i] = (cellMin + res - o[i]) / d[i];
        else if (d[i] < 0) tMax[i] = (cellMin - o[i]) / d[i];
        else tMax[i] = Infinity;
      }
      if (this.get(cell[0], cell[1], cell[2])) { return { dist: 0, point: V.copy(o), normal: V.scale(d, -1), mat: this.get(cell[0], cell[1], cell[2]) }; }
      let t = 0, lastAxis = 0;
      for (let iter = 0; iter < 4000; iter++) {
        let axis = 0;
        if (tMax[1] < tMax[0]) axis = 1;
        if (tMax[2] < tMax[axis]) axis = 2;
        t = tMax[axis]; if (t > maxDist) break;
        cell[axis] += step[axis]; tMax[axis] += tDelta[axis]; lastAxis = axis;
        const m = this.get(cell[0], cell[1], cell[2]);
        if (m) { const n = [0, 0, 0]; n[axis] = -step[axis]; best = { dist: t, point: V.madd(o, d, t), normal: n, mat: m }; break; }
      }
      // ramps: march within slab-intersection interval
      const limit = best ? best.dist : maxDist;
      for (const r of this.ramps) {
        let t0 = 0, t1 = limit, ok = true;
        for (let i = 0; i < 3 && ok; i++) {
          if (Math.abs(d[i]) < 1e-9) { if (o[i] < r.min[i] || o[i] > r.max[i]) ok = false; continue; }
          let a = (r.min[i] - o[i]) / d[i], b = (r.max[i] - o[i]) / d[i];
          if (a > b) { const tmp = a; a = b; b = tmp; }
          t0 = Math.max(t0, a); t1 = Math.min(t1, b);
          if (t0 > t1) ok = false;
        }
        if (!ok) continue;
        const stepLen = 0.15; let prevBelow = false;
        for (let tt = t0; tt <= t1 + 1e-6; tt += stepLen) {
          const p = V.madd(o, d, Math.min(tt, t1));
          const below = p[1] <= this.rampHeightAt(p[0], p[2], r);
          if (below) {
            const hitT = Math.min(tt, t1);
            if (!best || hitT < best.dist) best = { dist: hitT, point: p, normal: prevBelow || tt === t0 ? V.scale(d, -1) : this.rampNormal(r), mat: MAT.CONCRETE };
            break;
          }
          prevBelow = below;
          if (tt >= t1) break;
        }
      }
      return best;
    }
    lineClear(a, b) {
      const d = V.sub(b, a), l = V.len(d); if (l < 1e-6) return true;
      const h = this.raycast(a, V.scale(d, 1 / l), l);
      return !h;
    }

    // ---- AABB mover collision. pos = feet center. Returns new pos + flags.
    // size: [halfWidth, height]. delta: displacement. team for blockers.
    moveBox(pos, half, height, delta, team, stepH) {
      const p = V.copy(pos);
      const flags = { hitX: false, hitZ: false, hitY: false, ground: false, stepped: false };
      const free = (q) => !this.boxSolid([q[0] - half, q[1], q[2] - half], [q[0] + half, q[1] + height, q[2] + half]) &&
        !this.boxBlocked([q[0] - half, q[1], q[2] - half], [q[0] + half, q[1] + height, q[2] + half], team);
      const res = this.res;
      const tryAxis = (axis, amt) => {
        if (amt === 0) return true;
        const q = V.copy(p); q[axis] += amt;
        if (free(q)) { p[axis] = q[axis]; return true; }
        // slide up to the obstacle: binary search on amount
        let lo = 0, hi = amt;
        for (let i = 0; i < 8; i++) { const mid = (lo + hi) / 2; q[axis] = p[axis] + mid; if (free(q)) lo = mid; else hi = mid; }
        p[axis] += lo;
        return false;
      };
      // Horizontal
      for (const axis of [0, 2]) {
        const amt = delta[axis]; if (amt === 0) continue;
        if (!tryAxis(axis, amt)) {
          // try step-up
          let stepped = false;
          if (stepH > 0) {
            for (const s of [stepH * 0.5, stepH]) {
              const q = [p[0], p[1] + s, p[2]]; q[axis] += amt;
              if (free(q) && free([p[0], p[1] + s, p[2]])) {
                // drop back down to the surface
                let y = q[1]; for (let k = 0; k < 8; k++) { const y2 = y - s / 8; if (free([q[0], y2, q[2]])) y = y2; else break; }
                p[0] = q[0]; p[1] = y; p[2] = q[2]; stepped = true; flags.stepped = true; break;
              }
            }
          }
          if (!stepped) { if (axis === 0) flags.hitX = true; else flags.hitZ = true; }
        }
      }
      // Vertical
      if (delta[1] !== 0) {
        if (!tryAxis(1, delta[1])) { flags.hitY = true; if (delta[1] < 0) flags.ground = true; }
      }
      // Ramps: snap onto surface when within/at it
      const ru = this.rampUnder(p[0], p[2], p[1]);
      if (ru && p[1] <= ru.h + 0.02) {
        if (p[1] < ru.h - 0.001 || delta[1] <= 0) { p[1] = ru.h; flags.ground = true; flags.onRamp = ru.ramp; }
      }
      // ground probe when falling onto voxels wasn't triggered (standing still)
      if (!flags.ground && delta[1] <= 0) {
        if (!free([p[0], p[1] - 0.02, p[2]]) && free(p)) flags.ground = true;
      }
      // safety: if embedded, push up
      let guard = 0; while (!free(p) && guard++ < 40) p[1] += res * 0.5;
      return { pos: p, flags };
    }

    // ---- Greedy meshing. Emits quads: {positions[], normals[], mats[], lights[]}.
    buildMesh() {
      const { nx, ny, nz, res } = this;
      const dims = [nx, ny, nz];
      const pos = [], nrm = [], mat = [], lit = [];
      const skyLight = new Uint8Array(nx * nz); // column has open sky above height? we compute per cell lazily
      const isIndoor = (x, y, z) => { for (let yy = y + 1; yy < ny; yy++) if (this.cells[this.idx(x, yy, z)]) return true; return false; };
      const mask = new Int32Array(Math.max(nx * ny, ny * nz, nx * nz));
      for (let d = 0; d < 3; d++) {
        const u = (d + 1) % 3, v = (d + 2) % 3;
        const x = [0, 0, 0], q = [0, 0, 0]; q[d] = 1;
        for (x[d] = -1; x[d] < dims[d];) {
          // build mask
          let n = 0;
          for (x[v] = 0; x[v] < dims[v]; x[v]++) for (x[u] = 0; x[u] < dims[u]; x[u]++) {
            const a = x[d] >= 0 ? this.cells[this.idx(x[0], x[1], x[2])] : MAT.STONE;
            const b = x[d] < dims[d] - 1 ? this.cells[this.idx(x[0] + q[0], x[1] + q[1], x[2] + q[2])] : (d === 1 ? 0 : MAT.STONE);
            let val = 0;
            if ((a !== 0) !== (b !== 0)) {
              if (a) { // face of a pointing +d ; light sampled from the air cell b
                const l = isIndoor(x[0] + q[0], x[1] + q[1], x[2] + q[2]) ? 1 : 0;
                val = a | (l << 8) | (1 << 9);
              } else {
                const l = isIndoor(x[0], x[1], x[2]) ? 1 : 0;
                val = b | (l << 8) | (2 << 9);
              }
            }
            mask[n++] = val;
          }
          x[d]++;
          n = 0;
          for (let j = 0; j < dims[v]; j++) for (let i = 0; i < dims[u];) {
            const c = mask[n];
            if (c) {
              let w = 1; while (i + w < dims[u] && mask[n + w] === c) w++;
              let h = 1, done = false;
              for (; j + h < dims[v]; h++) {
                for (let k = 0; k < w; k++) if (mask[n + k + h * dims[u]] !== c) { done = true; break; }
                if (done) break;
              }
              x[u] = i; x[v] = j;
              const du = [0, 0, 0], dv = [0, 0, 0]; du[u] = w; dv[v] = h;
              const m = c & 0xff, l = (c >> 8) & 1, side = (c >> 9) & 3;
              const base = [this.min[0] + x[0] * res, this.min[1] + x[1] * res, this.min[2] + x[2] * res];
              const p0 = base, p1 = V.madd(base, du, res), p2 = V.madd(V.madd(base, du, res), dv, res), p3 = V.madd(base, dv, res);
              const nn = [0, 0, 0]; nn[d] = side === 1 ? 1 : -1;
              const quad = side === 1 ? [p0, p1, p2, p0, p2, p3] : [p0, p3, p2, p0, p2, p1];
              for (const p of quad) { pos.push(p[0], p[1], p[2]); nrm.push(nn[0], nn[1], nn[2]); mat.push(m); lit.push(l); }
              for (let hh = 0; hh < h; hh++) for (let k = 0; k < w; k++) mask[n + k + hh * dims[u]] = 0;
              i += w; n += w;
            } else { i++; n++; }
          }
        }
      }
      // wedges
      for (const r of this.ramps) {
        const wedge = World.wedgeGeometry(r, this);
        for (let i = 0; i < wedge.pos.length; i++) pos.push(wedge.pos[i]);
        for (let i = 0; i < wedge.nrm.length; i++) nrm.push(wedge.nrm[i]);
        for (let i = 0; i < wedge.pos.length / 3; i++) { mat.push(r.mat || MAT.CONCRETE); lit.push(r.indoor ? 1 : 0); }
      }
      return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), mat: new Float32Array(mat), lit: new Float32Array(lit) };
    }
    static wedgeGeometry(r, world) {
      // Right-triangle prism with flat bottom at r.min[1]; top surface rises along axis*dir.
      const a = r.axis, o = a === 0 ? 2 : 0; // o = other horizontal axis
      const lo = r.dir > 0 ? r.min[a] : r.max[a], hi = r.dir > 0 ? r.max[a] : r.min[a];
      const y0 = r.min[1], y1 = r.max[1];
      const P = (al, ol, y) => { const p = [0, y, 0]; p[a] = al; p[o] = ol; return p; };
      const o0 = r.min[o], o1 = r.max[o];
      const pos = [], nrm = [];
      const tri = (p, q, s) => {
        const n = V.norm(V.cross(V.sub(q, p), V.sub(s, p)));
        for (const v of [p, q, s]) { pos.push(v[0], v[1], v[2]); nrm.push(n[0], n[1], n[2]); }
      };
      const quad = (p, q, s, t) => { tri(p, q, s); tri(p, s, t); };
      // top surface: from (lo, y0) to (hi, y1)
      const A = P(lo, o0, y0), B = P(lo, o1, y0), C = P(hi, o1, y1), D = P(hi, o0, y1);
      const Ab = P(hi, o0, y0), Bb = P(hi, o1, y0);
      // orient so normals point outward (up for top)
      const nTop = V.cross(V.sub(B, A), V.sub(C, A));
      if (nTop[1] > 0) quad(A, B, C, D); else quad(A, D, C, B);
      // high end vertical face
      const nEnd = V.cross(V.sub(Bb, Ab), V.sub(C, Ab));
      const outward = [0, 0, 0]; outward[a] = r.dir;
      if (V.dot(nEnd, outward) > 0) quad(Ab, Bb, C, D); else quad(Ab, D, C, Bb);
      // sides (triangles)
      const s1 = [A, Ab, D], s2 = [B, Bb, C];
      const sideN = (t, dirSign) => { const n = V.cross(V.sub(t[1], t[0]), V.sub(t[2], t[0])); return n[o] * dirSign > 0 ? t : [t[0], t[2], t[1]]; };
      const t1 = sideN(s1, -1), t2 = sideN(s2, 1);
      tri(t1[0], t1[1], t1[2]); tri(t2[0], t2[1], t2[2]);
      // bottom
      const nb = V.cross(V.sub(Ab, A), V.sub(Bb, A));
      if (nb[1] < 0) quad(A, Ab, Bb, B); else quad(A, B, Bb, Ab);
      return { pos, nrm };
    }
  }

  const out = { World, MAT };
  if (typeof module !== 'undefined') module.exports = out; else Object.assign(root, out);
})(typeof window !== 'undefined' ? window : globalThis);
