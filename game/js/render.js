// Tiny WebGL1 renderer: static greedy-meshed world with procedural materials,
// dynamic cubes/spheres/wedges, translucent water, sky gradient, fog.
(function (root) {
  'use strict';
  const { M, V } = root;

  const VS = `
attribute vec3 aPos; attribute vec3 aNrm; attribute float aMat; attribute float aLit;
uniform mat4 uProj, uView, uModel;
varying vec3 vWorld; varying vec3 vNrm; varying float vMat; varying float vLit; varying float vDepth;
void main(){
  vec4 w = uModel * vec4(aPos,1.0);
  vWorld = w.xyz; vNrm = normalize(mat3(uModel) * aNrm); vMat = aMat; vLit = aLit;
  vec4 v = uView * w; vDepth = -v.z;
  gl_Position = uProj * v;
}`;
  const FS = `
precision mediump float;
varying vec3 vWorld; varying vec3 vNrm; varying float vMat; varying float vLit; varying float vDepth;
uniform vec3 uColor; uniform float uUseMat; uniform float uAlpha; uniform float uEmissive; uniform float uTime;
uniform vec3 uFogColor; uniform float uFogDensity; uniform vec3 uLightDir; uniform float uFlash;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
void main(){
  vec3 n = normalize(vNrm);
  vec3 an = abs(n);
  // planar uv: pick the two axes orthogonal to the dominant normal
  vec2 uv = an.y > 0.5 ? vWorld.xz : (an.x > 0.5 ? vWorld.zy : vWorld.xy);
  vec3 col = uColor; float emis = uEmissive;
  if (uUseMat > 0.5) {
    int m = int(vMat + 0.5);
    float nz = noise(uv * 3.0);
    if (m == 1 || m == 13) { // brick
      float row = floor(uv.y * 4.0); vec2 b = vec2(uv.x * 2.0 + mod(row, 2.0) * 0.5, uv.y * 4.0);
      vec2 f = fract(b); float mortar = step(f.x, 0.08) + step(f.y, 0.12);
      vec3 base = m == 1 ? vec3(0.62, 0.45, 0.33) : vec3(0.42, 0.30, 0.24);
      base *= 0.85 + 0.3 * hash(floor(b));
      col = mix(base, vec3(0.55, 0.52, 0.48), clamp(mortar, 0.0, 1.0)) * (0.9 + 0.2 * nz);
    } else if (m == 2) { // concrete panels
      vec2 f = fract(uv * 0.5); float seam = step(f.x, 0.03) + step(f.y, 0.03);
      col = vec3(0.58, 0.57, 0.54) * (0.85 + 0.25 * nz) * (1.0 - 0.35 * clamp(seam, 0.0, 1.0));
    } else if (m == 3) { // metal plates with rivets
      vec2 f = fract(uv); float seam = step(f.x, 0.04) + step(f.y, 0.04);
      float riv = step(length(fract(uv * 2.0) - 0.5), 0.07);
      col = vec3(0.36, 0.38, 0.42) * (0.9 + 0.2 * nz) * (1.0 - 0.4 * clamp(seam, 0.0, 1.0)) + riv * 0.12;
    } else if (m == 4) { // wood planks
      float plank = floor(uv.x * 4.0); float gap = step(fract(uv.x * 4.0), 0.08);
      col = vec3(0.55, 0.38, 0.22) * (0.8 + 0.3 * hash(vec2(plank, 1.0))) * (0.9 + 0.2 * noise(vec2(uv.x * 8.0, uv.y * 1.5))) * (1.0 - 0.5 * gap);
    } else if (m == 6) { // dirt / grass
      vec3 grass = vec3(0.32, 0.45, 0.2), dirt = vec3(0.45, 0.36, 0.26);
      col = (an.y > 0.5 ? grass : dirt) * (0.8 + 0.4 * noise(uv * 6.0));
    } else if (m == 7) { col = vec3(0.16, 0.32, 0.75) * (0.9 + 0.2 * nz); vec2 f = fract(uv * 0.5); col *= 1.0 - 0.3 * step(f.y, 0.04); }
    else if (m == 8) { col = vec3(0.75, 0.18, 0.15) * (0.9 + 0.2 * nz); vec2 f = fract(uv * 0.5); col *= 1.0 - 0.3 * step(f.y, 0.04); }
    else if (m == 9) { // stone
      vec2 f = fract(uv * 1.0); float seam = step(f.x, 0.06) + step(f.y, 0.06);
      col = vec3(0.5, 0.49, 0.47) * (0.75 + 0.4 * noise(uv * 2.0)) * (1.0 - 0.35 * clamp(seam, 0.0, 1.0));
    } else if (m == 12) { col = vec3(1.0, 0.95, 0.8); emis = 1.0; }
    else if (m == 5) { // water
      float w = noise(uv * 1.5 + uTime * 0.15) * 0.5 + noise(uv * 3.0 - uTime * 0.1) * 0.5;
      col = mix(vec3(0.1, 0.28, 0.4), vec3(0.25, 0.5, 0.6), w);
    } else col = vec3(0.5);
  }
  float diff = max(dot(n, uLightDir), 0.0);
  float fill = max(dot(n, vec3(-0.5, 0.3, -0.6)), 0.0);
  float light = 0.5 + 0.42 * diff + 0.12 * fill;
  if (vLit > 0.5) light *= 0.8;
  vec3 c = mix(col * light, col, emis);
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
  c = mix(c, uFogColor, clamp(fog, 0.0, 1.0));
  c = mix(c, vec3(1.0, 0.95, 0.8), uFlash);
  gl_FragColor = vec4(c, uAlpha);
}`;
  const SKY_VS = `attribute vec2 aXY; varying vec2 vXY; void main(){ vXY = aXY; gl_Position = vec4(aXY, 0.999, 1.0); }`;
  const SKY_FS = `
precision mediump float; varying vec2 vXY;
uniform vec3 uFwd, uRight, uUp; uniform float uTanX, uTanY; uniform vec3 uFogColor;
void main(){
  vec3 d = normalize(uFwd + uRight * vXY.x * uTanX + uUp * vXY.y * uTanY);
  float t = clamp(d.y, 0.0, 1.0);
  vec3 zen = vec3(0.16, 0.32, 0.62); vec3 hor = uFogColor;
  vec3 c = mix(hor, zen, pow(t, 0.6));
  // a soft sun
  float s = max(dot(d, normalize(vec3(0.4, 0.8, 0.3))), 0.0);
  c += vec3(1.0, 0.9, 0.7) * pow(s, 200.0) * 0.8 + vec3(0.5, 0.4, 0.3) * pow(s, 8.0) * 0.15;
  if (d.y < 0.0) c = mix(hor, vec3(0.35, 0.33, 0.3), clamp(-d.y * 3.0, 0.0, 1.0));
  gl_FragColor = vec4(c, 1.0);
}`;

  function compile(gl, type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
    return s;
  }
  function program(gl, vs, fs) {
    const p = gl.createProgram(); gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    return p;
  }

  function cubeGeometry() {
    // unit cube centered at origin, size 1
    const faces = [
      [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
      [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
      [[1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]]],
      [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
      [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]],
      [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
    ];
    const pos = [], nrm = [];
    for (const [n, q] of faces) for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(q[i][0] * 0.5, q[i][1] * 0.5, q[i][2] * 0.5); nrm.push(n[0], n[1], n[2]); }
    return { pos: new Float32Array(pos), nrm: new Float32Array(nrm) };
  }
  function sphereGeometry(seg = 10, rings = 7) {
    const pos = [], nrm = [];
    const P = (i, j) => { const th = (i / seg) * Math.PI * 2, ph = (j / rings) * Math.PI; return [Math.sin(ph) * Math.cos(th) * 0.5, Math.cos(ph) * 0.5, Math.sin(ph) * Math.sin(th) * 0.5]; };
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
      const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
      for (const p of [a, c, b, a, d, c]) { pos.push(p[0], p[1], p[2]); const n = V.norm(p); nrm.push(n[0], n[1], n[2]); }
    }
    return { pos: new Float32Array(pos), nrm: new Float32Array(nrm) };
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      const gl = canvas.getContext('webgl', { antialias: true, alpha: false }) || canvas.getContext('experimental-webgl');
      if (!gl) throw new Error('WebGL not available');
      this.gl = gl;
      this.prog = program(gl, VS, FS);
      this.sky = program(gl, SKY_VS, SKY_FS);
      this.u = {};
      for (const n of ['uProj', 'uView', 'uModel', 'uColor', 'uUseMat', 'uAlpha', 'uEmissive', 'uTime', 'uFogColor', 'uFogDensity', 'uLightDir', 'uFlash']) this.u[n] = gl.getUniformLocation(this.prog, n);
      this.a = { aPos: gl.getAttribLocation(this.prog, 'aPos'), aNrm: gl.getAttribLocation(this.prog, 'aNrm'), aMat: gl.getAttribLocation(this.prog, 'aMat'), aLit: gl.getAttribLocation(this.prog, 'aLit') };
      this.su = {}; for (const n of ['uFwd', 'uRight', 'uUp', 'uTanX', 'uTanY', 'uFogColor']) this.su[n] = gl.getUniformLocation(this.sky, n);
      this.sa = gl.getAttribLocation(this.sky, 'aXY');
      this.skyBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
      this.cube = this.upload(cubeGeometry());
      this.sphere = this.upload(sphereGeometry());
      this.world = null;
      this.fogColor = [0.62, 0.68, 0.76];
      this.fogDensity = 0.011;
      this.lightDir = V.norm([0.4, 0.8, 0.3]);
      this.time = 0;
      this.flash = 0;
      this.fov = 75 * Math.PI / 180;
      gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    }
    upload(geo) {
      const gl = this.gl, o = { n: geo.pos.length / 3 };
      o.pos = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, o.pos); gl.bufferData(gl.ARRAY_BUFFER, geo.pos, gl.STATIC_DRAW);
      o.nrm = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, o.nrm); gl.bufferData(gl.ARRAY_BUFFER, geo.nrm, gl.STATIC_DRAW);
      if (geo.mat) { o.mat = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, o.mat); gl.bufferData(gl.ARRAY_BUFFER, geo.mat, gl.STATIC_DRAW); }
      if (geo.lit) { o.lit = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, o.lit); gl.bufferData(gl.ARRAY_BUFFER, geo.lit, gl.STATIC_DRAW); }
      return o;
    }
    setWorld(world) {
      this.worldMesh = this.upload(world.buildMesh());
      // water surface quads
      const pos = [], nrm = [];
      for (const w of world.water) {
        const y = w.max[1];
        const q = [[w.min[0], y, w.min[2]], [w.max[0], y, w.min[2]], [w.max[0], y, w.max[2]], [w.min[0], y, w.max[2]]];
        for (const i of [0, 3, 2, 0, 2, 1]) { pos.push(q[i][0], q[i][1], q[i][2]); nrm.push(0, 1, 0); }
        for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(q[i][0], q[i][1], q[i][2]); nrm.push(0, -1, 0); }
      }
      const n = pos.length / 3;
      this.waterMesh = this.upload({ pos: new Float32Array(pos), nrm: new Float32Array(nrm), mat: new Float32Array(n).fill(5), lit: new Float32Array(n) });
    }
    resize() {
      const c = this.canvas, dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.floor(c.clientWidth * dpr), h = Math.floor(c.clientHeight * dpr);
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      this.gl.viewport(0, 0, c.width, c.height);
      this.aspect = c.width / c.height;
    }
    bind(mesh, staticMats) {
      const gl = this.gl, a = this.a;
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pos); gl.enableVertexAttribArray(a.aPos); gl.vertexAttribPointer(a.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.nrm); gl.enableVertexAttribArray(a.aNrm); gl.vertexAttribPointer(a.aNrm, 3, gl.FLOAT, false, 0, 0);
      if (staticMats && mesh.mat) {
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.mat); gl.enableVertexAttribArray(a.aMat); gl.vertexAttribPointer(a.aMat, 1, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.lit); gl.enableVertexAttribArray(a.aLit); gl.vertexAttribPointer(a.aLit, 1, gl.FLOAT, false, 0, 0);
      } else {
        gl.disableVertexAttribArray(a.aMat); gl.vertexAttrib1f(a.aMat, 0);
        gl.disableVertexAttribArray(a.aLit); gl.vertexAttrib1f(a.aLit, 0);
      }
    }
    begin(cam) {
      const gl = this.gl; this.resize();
      this.cam = cam;
      this.proj = M.perspective(this.fov * (cam.zoom || 1), this.aspect, 0.05, 300);
      this.view = M.view(cam.pos, cam.yaw, cam.pitch);
      gl.clearColor(this.fogColor[0], this.fogColor[1], this.fogColor[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      // sky
      gl.useProgram(this.sky); gl.disable(gl.DEPTH_TEST);
      const fwd = V.forward(cam.yaw, cam.pitch), right = V.right(cam.yaw), up = V.cross(right, fwd);
      gl.uniform3fv(this.su.uFwd, fwd); gl.uniform3fv(this.su.uRight, right); gl.uniform3fv(this.su.uUp, up);
      const tanY = Math.tan(this.fov * (cam.zoom || 1) / 2); gl.uniform1f(this.su.uTanY, tanY); gl.uniform1f(this.su.uTanX, tanY * this.aspect);
      gl.uniform3fv(this.su.uFogColor, this.fogColor);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf); gl.enableVertexAttribArray(this.sa); gl.vertexAttribPointer(this.sa, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disableVertexAttribArray(this.sa);
      gl.enable(gl.DEPTH_TEST);
      // main program
      gl.useProgram(this.prog);
      gl.uniformMatrix4fv(this.u.uProj, false, this.proj);
      gl.uniformMatrix4fv(this.u.uView, false, this.view);
      gl.uniform1f(this.u.uTime, this.time);
      gl.uniform3fv(this.u.uFogColor, this.fogColor);
      gl.uniform1f(this.u.uFogDensity, this.fogDensity);
      gl.uniform3fv(this.u.uLightDir, this.lightDir);
      gl.uniform1f(this.u.uFlash, this.flash);
      gl.uniform1f(this.u.uAlpha, 1); gl.uniform1f(this.u.uEmissive, 0);
      this.transparent = [];
    }
    drawWorld() {
      const gl = this.gl;
      gl.uniformMatrix4fv(this.u.uModel, false, M.identity());
      gl.uniform1f(this.u.uUseMat, 1);
      this.bind(this.worldMesh, true);
      gl.drawArrays(gl.TRIANGLES, 0, this.worldMesh.n);
      gl.uniform1f(this.u.uUseMat, 0);
    }
    // Draw a unit cube transformed by model matrix with flat color.
    drawMesh(mesh, model, color, opts) {
      const gl = this.gl; opts = opts || {};
      if (opts.alpha !== undefined && opts.alpha < 1) { this.transparent.push({ mesh, model, color, opts }); return; }
      gl.uniformMatrix4fv(this.u.uModel, false, model);
      gl.uniform3fv(this.u.uColor, color);
      gl.uniform1f(this.u.uEmissive, opts.emissive || 0);
      this.bind(mesh, false);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.n);
      if (opts.emissive) gl.uniform1f(this.u.uEmissive, 0);
    }
    cubeAt(center, size, color, yaw, pitch, opts) {
      this.drawMesh(this.cube, M.trs(center, yaw || 0, pitch || 0, size[0], size[1], size[2]), color, opts);
    }
    sphereAt(center, r, color, opts) { this.drawMesh(this.sphere, M.trs(center, 0, 0, r * 2, r * 2, r * 2), color, opts); }
    // thin box from a to b
    beam(a, b, thick, color, opts) {
      const d = V.sub(b, a), l = V.len(d); if (l < 1e-4) return;
      const yaw = Math.atan2(-d[0], -d[2]), pitch = Math.asin(Math.max(-1, Math.min(1, d[1] / l)));
      this.drawMesh(this.cube, M.trs(V.lerp(a, b, 0.5), yaw, pitch, thick, thick, l), color, opts);
    }
    // Viewmodel drawing: model space is camera space. Clears depth so it never clips.
    beginViewModel() {
      const gl = this.gl;
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(this.u.uView, false, M.identity());
      // light dir in view space (approximate: use a fixed view-space light)
      gl.uniform3fv(this.u.uLightDir, V.norm([0.3, 0.8, 0.5]));
      gl.uniform1f(this.u.uFogDensity, 0);
    }
    endViewModel() {
      const gl = this.gl;
      gl.uniformMatrix4fv(this.u.uView, false, this.view);
      gl.uniform3fv(this.u.uLightDir, this.lightDir);
      gl.uniform1f(this.u.uFogDensity, this.fogDensity);
    }
    end() {
      const gl = this.gl;
      // water then transparent list (sorted far-to-near)
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      if (this.waterMesh && this.waterMesh.n) {
        gl.uniformMatrix4fv(this.u.uModel, false, M.identity());
        gl.uniform1f(this.u.uUseMat, 1); gl.uniform1f(this.u.uAlpha, 0.62);
        this.bind(this.waterMesh, true);
        gl.drawArrays(gl.TRIANGLES, 0, this.waterMesh.n);
        gl.uniform1f(this.u.uUseMat, 0);
      }
      const cp = this.cam.pos;
      this.transparent.sort((a, b) => {
        const da = (a.model[12] - cp[0]) ** 2 + (a.model[13] - cp[1]) ** 2 + (a.model[14] - cp[2]) ** 2;
        const db = (b.model[12] - cp[0]) ** 2 + (b.model[13] - cp[1]) ** 2 + (b.model[14] - cp[2]) ** 2;
        return db - da;
      });
      for (const t of this.transparent) {
        gl.uniformMatrix4fv(this.u.uModel, false, t.model);
        gl.uniform3fv(this.u.uColor, t.color);
        gl.uniform1f(this.u.uAlpha, t.opts.alpha); gl.uniform1f(this.u.uEmissive, t.opts.emissive || 0);
        this.bind(t.mesh, false);
        gl.drawArrays(gl.TRIANGLES, 0, t.mesh.n);
      }
      gl.uniform1f(this.u.uAlpha, 1); gl.uniform1f(this.u.uEmissive, 0);
      gl.enable(gl.CULL_FACE);
      gl.depthMask(true); gl.disable(gl.BLEND);
    }
    // Project world point to screen [x,y] in CSS px or null if behind
    project(p) {
      const v = M.transformPoint(M.mul(this.proj, this.view), p);
      if (v[3] <= 0) return null;
      const c = this.canvas;
      return [(v[0] * 0.5 + 0.5) * c.clientWidth, (1 - (v[1] * 0.5 + 0.5)) * c.clientHeight, v[3]];
    }
  }
  Object.assign(root, { Renderer });
})(window);
