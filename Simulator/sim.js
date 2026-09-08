/* REVUELTO SIM — browser driving simulator (Three.js r128, Web Audio)
   Core Focus Productions. Arcade-realistic vehicle model tuned to the
   Lamborghini Revuelto (LB744): 1900 kg, 2.779 m wheelbase, 1015 CV,
   AWD, 8-speed DCT, 9500 rpm redline, ~350 km/h. */
(() => {
'use strict';

// ------------------------------------------------------------------ config
const CAR = {
  mass: 1900, wheelbase: 2.779, length: 4.947, width: 2.033, height: 1.16,
  powerW: 746000, drivelineEff: 0.85, tractionG: 1.22, brakeG: 1.3,
  dragK: 0.70, rolling: 280, redline: 9500, idle: 1000,
  gearTopKmh: [78, 118, 158, 200, 245, 290, 335, 380],
  wheelR: [0.34, 0.36], track: 0.84, axle: 1.39,
};
const MODES = [
  { name: 'CITTÀ',  sub: 'EV · 180 CV',        power: 0.18, grip: 1.30, stab: 1.0, ev: true,  color: '#4cc9f0' },
  { name: 'STRADA', sub: 'HYBRID · 886 CV',    power: 0.85, grip: 1.30, stab: 1.0, ev: false, color: '#f4f1ea' },
  { name: 'SPORT',  sub: 'HYBRID · 907 CV',    power: 0.92, grip: 1.20, stab: 0.55, ev: false, color: '#ff8c1a' },
  { name: 'CORSA',  sub: 'HYBRID · 1015 CV',   power: 1.00, grip: 1.40, stab: 0.8, ev: false, color: '#ff2a2a' },
];
const PAINTS = [
  { name: 'AS DOWNLOADED', hex: 0xff2a03, original: true },
  { name: 'VERDE SCANDAL', hex: 0x22b400 }, { name: 'ARANCIO APODIS', hex: 0xff6200 },
  { name: 'GIALLO INTI', hex: 0xffd200 },   { name: 'BIANCO SIDERALE', hex: 0xf2f2ec },
  { name: 'NERO HELENE', hex: 0x0a0a0c },   { name: 'BLU URANUS', hex: 0x0a3cff },
  { name: 'ROSSO MARS', hex: 0xd40015 },    { name: 'GRIGIO TELESTO', hex: 0x8b8f94 },
];
const ROAD_HALF = 6.0;      // 12 m wide track
const G = 9.81;

// ------------------------------------------------------------------ utils
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (cur, target, rate, dt) => lerp(cur, target, 1 - Math.exp(-rate * dt));
let seed = 1337;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const fmtTime = ms => { if (ms == null) return '--:--.---'; const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, r = Math.floor(ms % 1000); return `${m}:${String(s).padStart(2, '0')}.${String(r).padStart(3, '0')}`; };
const $ = id => document.getElementById(id);

function canvasTex(size, draw, repeat) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat, repeat);
  t.encoding = THREE.sRGBEncoding;
  return t;
}
function noiseFill(ctx, size, base, spread, count) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) {
    const v = Math.floor(rnd() * spread - spread / 2);
    ctx.fillStyle = `rgba(${128 + v},${128 + v},${128 + v},${0.08 + rnd() * 0.12})`;
    const s = 1 + rnd() * 3;
    ctx.fillRect(rnd() * size, rnd() * size, s, s);
  }
}

// ------------------------------------------------------------------ renderer
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const isWebGL2 = renderer.capabilities.isWebGL2;
const maxAniso = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x03060f, 350, 3600);
const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 9000);

// THE GRID: black dome with a faint blue horizon glow, stars, and a neon environment map so the paint reflects light lines
scene.background = new THREE.Color(0x02040a);
const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 55), THREE.MathUtils.degToRad(35));
{
  const dome = new THREE.Mesh(new THREE.SphereGeometry(8500, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x01020a) }, horizon: { value: new THREE.Color(0x0a2a55) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vP; void main(){ float h = normalize(vP).y; float g = pow(1.0 - clamp(h, 0.0, 1.0), 9.0); gl_FragColor = vec4(mix(top, horizon, g * 0.9), 1.0); }',
  }));
  dome.position.y = -200; scene.add(dome);
  const sp = [], n = 2600;
  for (let i = 0; i < n; i++) { const a = rnd() * Math.PI * 2, e = Math.asin(rnd()) * 0.95 + 0.04, r = 8000; sp.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r - 200, Math.sin(a) * Math.cos(e) * r); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x9fd8ff, size: 14, sizeAttenuation: true, fog: false, toneMapped: false, transparent: true, opacity: 0.75 })); scene.add(stars);
}
const pmrem = new THREE.PMREMGenerator(renderer);
{
  const env = new THREE.Scene(); env.background = new THREE.Color(0x01030a);
  const glow = new THREE.MeshBasicMaterial({ color: 0x3ee0ff });
  const strip = new THREE.Mesh(new THREE.CylinderGeometry(60, 60, 1.2, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0x2ad0ff, side: THREE.BackSide })); strip.position.y = -2; env.add(strip);
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, m = new THREE.Mesh(new THREE.PlaneGeometry(6, 40), glow); m.position.set(Math.cos(a) * 50, 22, Math.sin(a) * 50); m.lookAt(0, 22, 0); env.add(m); }
  const top = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ color: 0x1a4a7a })); top.position.y = 60; top.rotation.x = Math.PI / 2; env.add(top);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: 0x03101c })); floor.position.y = -8; floor.rotation.x = -Math.PI / 2; env.add(floor);
  scene.environment = pmrem.fromScene(env, 0.04).texture;
}

const sun = new THREE.DirectionalLight(0xa9d4ff, 2.0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 10; sun.shadow.camera.far = 900;
sun.shadow.camera.left = -40; sun.shadow.camera.right = 40; sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
scene.add(sun); scene.add(sun.target);
scene.add(new THREE.HemisphereLight(0x1e447e, 0x02050c, 0.45));
const underglow = new THREE.PointLight(0x2ee6ff, 2.2, 9, 2); scene.add(underglow);
// live reflections: a cube camera at the car feeds the paint, glass and rims
const cubeRT = new THREE.WebGLCubeRenderTarget(256, { format: THREE.RGBAFormat, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
const cubeCam = new THREE.CubeCamera(0.6, 2500, cubeRT);

// post-processing (bloom)
let composer = null, bloomPass = null, bloomOn = true, hiQ = true;
function buildComposer() {
  const w = renderer.domElement.width, h = renderer.domElement.height;
  const rt = isWebGL2 ? new THREE.WebGLMultisampleRenderTarget(w, h, { format: THREE.RGBAFormat }) : undefined;
  composer = new THREE.EffectComposer(renderer, rt);
  composer.addPass(new THREE.RenderPass(scene, camera));
  bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(w, h), 0.7, 0.5, 0.7);
  composer.addPass(bloomPass);
  composer.addPass(new THREE.ShaderPass(THREE.GammaCorrectionShader));
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, hiQ ? 2 : 1));
  const sm = hiQ ? 4096 : 2048; if (sun.shadow.mapSize.x !== sm) { sun.shadow.mapSize.set(sm, sm); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (composer) { composer.dispose && composer.dispose(); }
  buildComposer();
}
window.addEventListener('resize', resize);

// ------------------------------------------------------------------ world
// value noise + fbm (terrain, textures, colour variation)
const hash2 = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177; h = h ^ (h >> 16); return (h >>> 0) / 4294967296; };
function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), u), lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u), v);
}
function fbm(x, y, oct = 5) { let a = 0.5, f = 1, sum = 0, norm = 0; for (let i = 0; i < oct; i++) { sum += a * noise2(x * f, y * f); norm += a; a *= 0.5; f *= 2.03; } return sum / norm; }

// track centreline
const CTRL = [
  [-200, 0], [450, 0], [700, -30], [830, -180], [770, -340], [590, -400], [430, -560], [520, -760],
  [300, -900], [60, -820], [-110, -640], [-350, -700], [-560, -880], [-820, -770], [-890, -500],
  [-730, -300], [-880, -120], [-800, 10], [-560, 0],
];
const curve = new THREE.CatmullRomCurve3(CTRL.map(p => new THREE.Vector3(p[0], 0, p[1])), true, 'centripetal', 0.5);
const N = 1400;
const S = curve.getSpacedPoints(N).slice(0, N);       // closed loop samples
const T = [], KERB = new Array(N).fill(false), CUM = new Array(N).fill(0);
let trackLen = 0;
for (let i = 0; i < N; i++) {
  const a = S[(i + N - 1) % N], b = S[(i + 1) % N];
  T.push(new THREE.Vector3().subVectors(b, a).normalize());
}
for (let i = 0; i < N; i++) { CUM[i] = trackLen; trackLen += S[i].distanceTo(S[(i + 1) % N]); }
{ // kerbs where the curvature is tight
  const curv = [];
  for (let i = 0; i < N; i++) {
    const a = T[i], b = T[(i + 3) % N];
    const ang = Math.atan2(a.x * b.z - a.z * b.x, a.dot(b));
    const len = CUM[(i + 3) % N] - CUM[i]; curv.push(Math.abs(ang) / (len > 0 ? len : trackLen - CUM[i] + CUM[(i + 3) % N]));
  }
  for (let i = 0; i < N; i++) if (curv[i] > 1 / 190) for (let k = -14; k <= 14; k++) KERB[(i + k + N) % N] = true;
}
const trackDistSq = (x, z) => { let best = 1e18, bi = 0; for (let i = 0; i < N; i++) { const dx = S[i].x - x, dz = S[i].z - z, d = dx * dx + dz * dz; if (d < best) { best = d; bi = i; } } return { d2: best, i: bi }; };

// distance-to-track field on a 50 m grid (terrain flattening, prop placement)
const DF = { x0: -2300, z0: -2750, cell: 50, n: 92, v: null };
{
  DF.v = new Float32Array(DF.n * DF.n);
  for (let j = 0; j < DF.n; j++) for (let i = 0; i < DF.n; i++) {
    const x = DF.x0 + i * DF.cell, z = DF.z0 + j * DF.cell; let best = 1e18;
    for (let k = 0; k < N; k += 3) { const dx = S[k].x - x, dz = S[k].z - z, d = dx * dx + dz * dz; if (d < best) best = d; }
    DF.v[j * DF.n + i] = Math.sqrt(best);
  }
}
function trackDist(x, z) {
  const fx = clamp((x - DF.x0) / DF.cell, 0, DF.n - 1.001), fz = clamp((z - DF.z0) / DF.cell, 0, DF.n - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * DF.n + i;
  return lerp(lerp(DF.v[k], DF.v[k + 1], u), lerp(DF.v[k + DF.n], DF.v[k + DF.n + 1], u), v);
}
// terrain: rolling hills that flatten to 0 within 70 m of the track, foothills toward the mountain ring
function terrainH(x, z) {
  return 0;   // The Grid is a flat plain
}
const gridMat = new THREE.ShaderMaterial({
  transparent: true, fog: true, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2,
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uCar: { value: new THREE.Vector3() }, uTime: { value: 0 } }]),
  vertexShader: `varying vec3 vW;
#include <fog_pars_vertex>
    void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
    }`,
  fragmentShader: `uniform vec3 uCar; uniform float uTime; varying vec3 vW;
#include <fog_pars_fragment>
    float gridLine(vec2 p, float cell, float w){ vec2 q = p / cell; vec2 g = abs(fract(q - 0.5) - 0.5) / (fwidth(q) * w); return 1.0 - min(min(g.x, g.y), 1.0); }
    void main(){
      float major = gridLine(vW.xz, 20.0, 1.6), minor = gridLine(vW.xz, 4.0, 1.2);
      vec3 base = vec3(0.012, 0.02, 0.045);
      vec3 cyan = vec3(0.18, 0.9, 1.0);
      float d = distance(vW.xz, uCar.xz);
      float glow = 2.2 / (1.0 + d * d * 0.09);
      float pulse = 0.85 + 0.15 * sin(uTime * 1.5 - vW.x * 0.01);
      vec3 col = base + cyan * (major * 1.35 * pulse + minor * 0.22) + cyan * glow * 0.35;
      float alpha = mix(0.86, 1.0, max(major, minor * 0.4));
      gl_FragColor = vec4(col, alpha);
#include <fog_fragment>
    }`,
});
const ground = (() => {
  const g = new THREE.PlaneGeometry(8000, 8000, 64, 64); g.rotateX(-Math.PI / 2); g.translate(0, 0, -450);
  const m = new THREE.Mesh(g, gridMat); m.receiveShadow = false; scene.add(m); return m;
})();
// glossy black floor: a planar mirror just under the grid so the car and its light trail reflect in the plain
const mirror = new THREE.Reflector(new THREE.PlaneGeometry(7000, 7000), { textureWidth: 1024, textureHeight: 1024, color: 0x141c28, clipBias: 0.003 });
mirror.rotation.x = -Math.PI / 2; mirror.position.set(0, -0.03, -450); scene.add(mirror);

// road ribbon
const roadTex = canvasTex(1024, (ctx, s) => {
  const img = ctx.createImageData(s, s), d = img.data;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const k = (y * s + x) * 4, grain = hash2(x, y), n = fbm(x / 40, y / 40, 4), lane = Math.abs(x / s - 0.5);
    const wear = 0.9 + 0.22 * smoothstep(0.08, 0.2, lane) * (1 - smoothstep(0.3, 0.42, lane));   // tyres polish the lanes
    const v = (0.20 + 0.10 * n + 0.07 * grain) * wear;
    d[k] = 255 * v * 1.02; d[k + 1] = 255 * v; d[k + 2] = 255 * v * 1.06; d[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = '#5ff0ff'; ctx.fillRect(18, 0, 14, s); ctx.fillRect(s - 32, 0, 14, s);
  ctx.fillStyle = '#3ad8ff'; ctx.fillRect(s / 2 - 5, 0, 10, s * 0.5);
});
const roadGlow = canvasTex(1024, (ctx, s) => {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = '#5ff0ff'; ctx.fillRect(18, 0, 14, s); ctx.fillRect(s - 32, 0, 14, s);
  ctx.fillStyle = '#3ad8ff'; ctx.fillRect(s / 2 - 5, 0, 10, s * 0.5);
});
roadGlow.anisotropy = maxAniso;
roadTex.anisotropy = maxAniso;
const kerbTex = canvasTex(64, (ctx, s) => { ctx.fillStyle = '#06101c'; ctx.fillRect(0, 0, s, s); ctx.fillStyle = '#2ee6ff'; ctx.fillRect(0, 0, s, s / 2); });
function ribbon(inner, outer, texScaleV, yOff, filter, tex, color, glow) {
  const pos = [], uv = [];
  for (let i = 0; i < N; i++) {
    if (filter && !filter(i)) continue;
    const j = (i + 1) % N;
    const ni = new THREE.Vector3(-T[i].z, 0, T[i].x), nj = new THREE.Vector3(-T[j].z, 0, T[j].x);
    const v0 = CUM[i] / texScaleV, v1 = (CUM[i] + S[i].distanceTo(S[j])) / texScaleV;
    for (const side of (inner === -outer ? [1] : [1, -1])) {
      const a = S[i].clone().addScaledVector(ni, side * inner), b = S[i].clone().addScaledVector(ni, side * outer);
      const c = S[j].clone().addScaledVector(nj, side * outer), d = S[j].clone().addScaledVector(nj, side * inner);
      const ua = side > 0 ? 0 : 1, ub = side > 0 ? 1 : 0;
      pos.push(a.x, yOff, a.z, b.x, yOff, b.z, c.x, yOff, c.z, a.x, yOff, a.z, c.x, yOff, c.z, d.x, yOff, d.z);
      uv.push(ua, v0, ub, v0, ub, v1, ua, v0, ub, v1, ua, v1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map: tex, color, roughness: 0.92, metalness: 0 });
  if (glow) { mat.emissiveMap = glow; mat.emissive = new THREE.Color(0xffffff); mat.emissiveIntensity = 1.3; }
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; scene.add(m); return m;
}
const roadMesh = ribbon(-ROAD_HALF, ROAD_HALF, 12, 0.04, null, roadTex, 0xffffff, roadGlow);
ribbon(ROAD_HALF, ROAD_HALF + 1.1, 2, 0.07, i => KERB[i], kerbTex, 0xffffff, kerbTex);
ribbon(ROAD_HALF + 1.1, ROAD_HALF + 3.5, 12, 0.03, null, null, 0x0b1220); // dark verge

// scenery -------------------------------------------------------------
const scenery = new THREE.Group(); scene.add(scenery);
function instanced(geo, mat, items, shadow) {
  const im = new THREE.InstancedMesh(geo, mat, items.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
  items.forEach((it, k) => { e.set(0, it.rot || 0, 0); q.setFromEuler(e); s3.set(it.s || 1, it.sy || it.s || 1, it.s || 1); p3.set(it.x, it.y || 0, it.z); m4.compose(p3, q, s3); im.setMatrixAt(k, m4); });
  im.castShadow = !!shadow; im.receiveShadow = false; scenery.add(im); return im;
}
const farFromTrack = (x, z, min) => trackDist(x, z) > min;
function mergeGeos(list) {
  const pos = [], norm = [];
  for (const g of list) { const p = g.attributes.position, n = g.attributes.normal, idx = g.index; const push = i => { pos.push(p.getX(i), p.getY(i), p.getZ(i)); norm.push(n.getX(i), n.getY(i), n.getZ(i)); }; if (idx) for (let i = 0; i < idx.count; i++) push(idx.getX(i)); else for (let i = 0; i < p.count; i++) push(i); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3)); return g;
}
function instancedColored(geo, mat, items, shadow) {
  const im = instanced(geo, mat, items, shadow), c = new THREE.Color();
  items.forEach((it, k) => { if (it.c != null) { c.setHex(it.c); im.setColorAt(k, c); } });
  if (im.instanceColor) im.instanceColor.needsUpdate = true; return im;
}
{ // light beacons along the circuit and a ring of dark data towers with lit strips on the horizon
  const beacons = [];
  for (let i = 0; i < N; i += 28) { const side = (i / 28) % 2 ? 1 : -1, n = new THREE.Vector3(-T[i].z, 0, T[i].x), p = S[i].clone().addScaledVector(n, side * 22); beacons.push({ x: p.x, z: p.z, y: 0, s: 1, sy: 1 + rnd() * 0.6 }); }
  instanced(new THREE.BoxGeometry(0.35, 9, 0.35).translate(0, 4.5, 0), new THREE.MeshBasicMaterial({ color: 0x2ee6ff, toneMapped: false }), beacons, false);
}
{ // armco on the outside of every kerbed corner, posts every ~4 m
  const wallTex = canvasTex(64, (ctx, s) => { ctx.fillStyle = '#06101c'; ctx.fillRect(0, 0, s, s); ctx.fillStyle = '#2ee6ff'; ctx.fillRect(0, 0, s, 7); ctx.fillStyle = '#0a6a90'; ctx.fillRect(0, s - 4, s, 4); });
  const pos = [], uv = [], posts = [];
  const outside = i => { const a = T[i], b = T[(i + 6) % N]; return (a.x * b.z - a.z * b.x) < 0 ? 1 : -1; };
  let acc = 0;
  for (let i = 0; i < N; i++) {
    if (!KERB[i]) continue;
    const side = outside(i), j = (i + 1) % N, off = ROAD_HALF + 5.5;
    const ni = new THREE.Vector3(-T[i].z, 0, T[i].x), nj = new THREE.Vector3(-T[j].z, 0, T[j].x);
    const a = S[i].clone().addScaledVector(ni, side * off), b = S[j].clone().addScaledVector(nj, side * off);
    const y0 = 0.35, y1 = 0.95, f = side > 0 ? [a, b] : [b, a];
    pos.push(f[0].x, y0, f[0].z, f[1].x, y0, f[1].z, f[1].x, y1, f[1].z, f[0].x, y0, f[0].z, f[1].x, y1, f[1].z, f[0].x, y1, f[0].z);
    uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
    acc += S[i].distanceTo(S[j]); if (acc > 4) { acc = 0; posts.push({ x: a.x, z: a.z, rot: Math.atan2(-T[i].z, T[i].x) }); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
  const wall = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: wallTex, emissiveMap: wallTex, emissive: 0xffffff, emissiveIntensity: 1.4, metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide })); wall.castShadow = true; wall.receiveShadow = true; scene.add(wall);
  instanced(new THREE.BoxGeometry(0.12, 1.0, 0.12).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x0a1626, metalness: 0.6, roughness: 0.5 }), posts, true);
}
{ // start gantry, billboards, pit building
  const dark = new THREE.MeshStandardMaterial({ color: 0x0a1220, roughness: 0.5, metalness: 0.6 });
  const gantry = new THREE.Group();
  const post = new THREE.BoxGeometry(0.5, 7, 0.5).translate(0, 3.5, 0);
  for (const s of [-1, 1]) { const p = new THREE.Mesh(post, dark); p.position.set(0, 0, s * 9.5); p.castShadow = true; gantry.add(p); }
  const chk = canvasTex(128, (ctx, s) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { ctx.fillStyle = (x + y) % 2 ? '#06101c' : '#2ee6ff'; ctx.fillRect(x * 16, y * 16, 16, 16); } });
  chk.repeat.set(12, 1);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 19.5), new THREE.MeshStandardMaterial({ map: chk, emissiveMap: chk, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.7 }));
  beam.position.y = 7.2; beam.castShadow = true; gantry.add(beam);
  const lineTex = canvasTex(64, (ctx, s) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { ctx.fillStyle = (x + y) % 2 ? '#06101c' : '#8ff4ff'; ctx.fillRect(x * 16, y * 16, 16, 16); } });
  lineTex.repeat.set(1, 12);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 12), new THREE.MeshStandardMaterial({ map: lineTex, emissiveMap: lineTex, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.9 }));
  line.rotation.x = -Math.PI / 2; line.rotation.z = Math.PI / 2; line.position.y = 0.03; gantry.add(line);
  gantry.position.copy(S[0]); gantry.rotation.y = Math.atan2(-T[0].z, T[0].x); scene.add(gantry);
  const words = ['CORE FOCUS PRODUCTIONS', 'REVUELTO', 'THE BOWOTTO', 'THE GRID', 'FORGE · VICE · VULTURE', 'END OF LINE'];
  words.forEach((w, k) => {
    const idx = Math.floor((k + 0.5) / words.length * N);
    const tex = canvasTex(512, (ctx, s) => { ctx.fillStyle = '#05090f'; ctx.fillRect(0, 0, s, s); ctx.strokeStyle = '#2ee6ff'; ctx.lineWidth = 6; ctx.strokeRect(6, s * 0.36, s - 12, s * 0.28); ctx.fillStyle = k % 2 ? '#ff8a2a' : '#5ff0ff'; ctx.font = 'bold 52px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(w, s / 2, s / 2); });
    tex.repeat.set(1, 0.3); tex.offset.set(0, 0.35);
    const bb = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 0.3), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.6 }));
    const n = new THREE.Vector3(-T[idx].z, 0, T[idx].x);
    const side = k % 2 ? 1 : -1;
    bb.position.copy(S[idx]).addScaledVector(n, side * 16); bb.position.y = 4;
    bb.rotation.y = Math.atan2(-T[idx].z, T[idx].x) + (side > 0 ? Math.PI : 0); bb.castShadow = true; scene.add(bb);
    const p = new THREE.Mesh(post, dark); p.position.copy(bb.position); p.position.y = 0; p.scale.set(1, 0.4, 1); scene.add(p);
  });
}

// ------------------------------------------------------------------ car
let paintIdx = 0;
const paintMat = new THREE.MeshPhysicalMaterial({ color: PAINTS[0].hex, metalness: 0.5, roughness: 0.2, clearcoat: 1.0, clearcoatRoughness: 0.04, envMap: cubeRT.texture, envMapIntensity: 1.2 });
const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x05080b, metalness: 0.35, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, envMap: cubeRT.texture, envMapIntensity: 1.2 });
const blackMat = new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.65, metalness: 0.2 });
const carbonMat = new THREE.MeshStandardMaterial({ color: 0x18191c, roughness: 0.35, metalness: 0.5 });
const chromeMat = new THREE.MeshStandardMaterial({ color: 0xcfd2d6, roughness: 0.25, metalness: 1.0 });
const headMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xdff2ff, emissiveIntensity: 2.6 });
const tailMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1a12, emissiveIntensity: 2.2 });

// Body: smooth-shaded lofted strips with hard creases at the sill, shoulder, windshield base and roof end.
// Sections run nose (-x) to tail (+x); the group is flipped so the nose ends up at +x.
//            x     wBot yBot  wSill ySill  wSh  ySh   wTop yTop
const SECTIONS = [
  [-2.47, 0.60, 0.30, 0.74, 0.36, 0.78, 0.44, 0.50, 0.47],
  [-2.35, 0.78, 0.24, 0.90, 0.34, 0.93, 0.52, 0.66, 0.56],
  [-2.15, 0.90, 0.18, 0.98, 0.34, 1.00, 0.62, 0.78, 0.66],
  [-1.85, 0.95, 0.15, 1.00, 0.35, 1.03, 0.72, 0.84, 0.76],
  [-1.45, 0.96, 0.14, 1.00, 0.36, 1.02, 0.76, 0.86, 0.80],
  [-1.05, 0.96, 0.14, 0.99, 0.37, 1.00, 0.79, 0.86, 0.83],
  [-0.62, 0.96, 0.14, 0.98, 0.38, 0.99, 0.82, 0.80, 0.87],   // 6 windshield base
  [-0.30, 0.96, 0.14, 0.98, 0.39, 0.99, 0.85, 0.66, 1.02],
  [ 0.05, 0.96, 0.14, 0.98, 0.40, 0.99, 0.88, 0.58, 1.14],   // 8 roof front
  [ 0.40, 0.96, 0.14, 0.98, 0.41, 0.99, 0.90, 0.56, 1.165],
  [ 0.78, 0.96, 0.14, 0.99, 0.42, 1.00, 0.93, 0.56, 1.15],   // 10 roof end
  [ 1.15, 0.97, 0.15, 1.01, 0.42, 1.03, 0.96, 0.62, 1.06],
  [ 1.55, 0.98, 0.17, 1.03, 0.41, 1.05, 0.98, 0.72, 1.00],   // 12 rear haunch
  [ 1.95, 0.97, 0.20, 1.02, 0.42, 1.04, 0.98, 0.80, 0.98],
  [ 2.25, 0.92, 0.26, 0.98, 0.44, 1.00, 0.97, 0.84, 0.985],
  [ 2.47, 0.82, 0.34, 0.90, 0.48, 0.93, 0.94, 0.84, 0.99],
];
const RINGS = SECTIONS.map(([x, wb, yb, ws, ys, wh, yh, wt, yt]) =>
  [[wb, yb], [ws, ys], [wh, yh], [wt, yt], [-wt, yt], [-wh, yh], [-ws, ys], [-wb, yb]].map(p => new THREE.Vector3(x, p[1], p[0])));
const SPLITS = { 2: [6, 10], 3: [6, 8, 10, 12], 4: [6, 10] };   // crease lines along x, per strip
const glassStrip = (j, i0) => ((j === 2 || j === 4) && i0 >= 6 && i0 < 10) || (j === 3 && ((i0 >= 6 && i0 < 8) || (i0 >= 10 && i0 < 12)));
function buildStrip(j, i0, i1) {
  const j2 = (j + 1) % 8, pos = [], idx = [];
  for (let i = i0; i <= i1; i++) { const a = RINGS[i][j], b = RINGS[i][j2]; pos.push(a.x, a.y, a.z, b.x, b.y, b.z); }
  for (let i = 0; i < i1 - i0; i++) { const k = i * 2; idx.push(k, k + 1, k + 3, k, k + 3, k + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  // orient outward: compare the first face normal with the direction from the section centre
  const A = RINGS[i0], mid = new THREE.Vector3(A[0].x, (A[0].y + A[3].y) / 2, 0);
  const n = new THREE.Vector3().fromBufferAttribute(g.attributes.normal, 0);
  const out = new THREE.Vector3().addVectors(RINGS[i0][j], RINGS[i0][j2]).multiplyScalar(0.5).sub(mid);
  if (n.dot(out) < 0) { for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
  return g;
}
function buildCap(R, out) {
  const pos = [];
  for (let k = 1; k < 7; k++) {
    let a = R[0], b = R[k], c = R[k + 1];
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (n.dot(out) < 0) { const t = b; b = c; c = t; }
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
}
function makeY(mat, len, thick) {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.BoxGeometry(len * 0.55, thick, thick), mat); stem.position.x = len * 0.27; g.add(stem);
  for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(len * 0.5, thick, thick), mat); arm.position.set(-len * 0.2, 0, s * len * 0.16); arm.rotation.y = -s * 0.65; g.add(arm); }
  return g;
}
const rimMat = new THREE.MeshStandardMaterial({ color: 0x2b2d31, metalness: 0.9, roughness: 0.28 });
const rimLipMat = new THREE.MeshStandardMaterial({ color: 0x9da2a8, metalness: 1.0, roughness: 0.22 });
const tyreMat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.95, metalness: 0 });
const discMat = new THREE.MeshStandardMaterial({ color: 0x55585c, metalness: 0.8, roughness: 0.45 });
const caliperMat = new THREE.MeshStandardMaterial({ color: 0xf2b400, metalness: 0.3, roughness: 0.4 });

const car = new THREE.Group(); scene.add(car);
const bodyGroup = new THREE.Group(); car.add(bodyGroup);          // tilts for roll / pitch
const procBody = new THREE.Group(); procBody.rotation.y = Math.PI; bodyGroup.add(procBody);   // procedural Revuelto (loft is built nose = -x, flipped so nose = +x)
const wheels = [];                                                 // {steer: Group, spin: Group, r, front}
{
  const last = RINGS.length - 1;
  for (let j = 0; j < 8; j++) {
    const cuts = [0, ...(SPLITS[j] || []), last];
    for (let c = 0; c < cuts.length - 1; c++) {
      const m = new THREE.Mesh(buildStrip(j, cuts[c], cuts[c + 1]), glassStrip(j, cuts[c]) ? glassMat : paintMat);
      m.castShadow = true; m.receiveShadow = true; procBody.add(m);
    }
  }
  procBody.add(new THREE.Mesh(buildCap(RINGS[0], new THREE.Vector3(-1, 0, 0)), blackMat));
  procBody.add(new THREE.Mesh(buildCap(RINGS[last], new THREE.Vector3(1, 0, 0)), blackMat));
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; procBody.add(m); return m; };
  add(new THREE.BoxGeometry(0.62, 0.05, 1.98), carbonMat, -2.28, 0.17, 0);                 // splitter
  add(new THREE.BoxGeometry(0.30, 0.09, 1.30), carbonMat, -2.44, 0.28, 0);                 // lower lip
  add(new THREE.BoxGeometry(0.06, 0.05, 1.20), paintMat, -2.49, 0.36, 0);                  // nose blade
  for (const s of [-1, 1]) {
    // headlights: dark housing on the hood corner with the Y-signature inside
    const hs = add(new THREE.BoxGeometry(0.62, 0.05, 0.22), blackMat, -2.10, 0.635, s * 0.66, 0, s * 0.12, 0.42);
    const hl = makeY(headMat, 0.56, 0.035); hl.position.set(-2.10, 0.665, s * 0.66); hl.rotation.z = 0.42; hl.rotation.y = s * 0.12; procBody.add(hl);
    // wheel wells
    for (const fx of [-CAR.axle, CAR.axle]) { const r = CAR.wheelR[fx < 0 ? 0 : 1]; const arch = new THREE.Mesh(new THREE.CircleGeometry(r + 0.11, 28), blackMat); arch.position.set(fx, r + 0.02, s * (fx < 0 ? 1.028 : 1.052)); arch.rotation.y = s > 0 ? 0 : Math.PI; procBody.add(arch); }
    add(new THREE.BoxGeometry(0.70, 0.28, 0.14), blackMat, 0.95, 0.62, s * 0.955);            // side scoops (recessed)
    add(new THREE.BoxGeometry(1.60, 0.06, 0.08), carbonMat, 0.05, 0.16, s * 0.99);           // sills
    add(new THREE.BoxGeometry(0.12, 0.07, 0.24), paintMat, -0.44, 0.99, s * 1.14);            // mirrors
    add(new THREE.BoxGeometry(0.05, 0.04, 0.18), blackMat, -0.44, 0.94, s * 1.03);
    const tl = makeY(tailMat, 0.50, 0.045); tl.position.set(2.49, 0.80, s * 0.62); tl.rotation.z = Math.PI / 2; tl.rotation.x = s * 0.25; procBody.add(tl);
    add(new THREE.CylinderGeometry(0.075, 0.075, 0.26, 6), chromeMat, 2.50, 0.70, s * 0.14, 0, 0, Math.PI / 2);     // hex exhausts
    add(new THREE.CylinderGeometry(0.10, 0.10, 0.10, 6), blackMat, 2.46, 0.70, s * 0.14, 0, 0, Math.PI / 2);
    add(new THREE.BoxGeometry(0.30, 0.10, 0.04), carbonMat, 2.08, 1.05, s * 0.70);          // wing end plates
  }
  add(new THREE.BoxGeometry(0.70, 0.28, 1.86), carbonMat, 2.28, 0.25, 0);                  // diffuser
  for (const z of [-0.5, -0.25, 0, 0.25, 0.5]) add(new THREE.BoxGeometry(0.60, 0.16, 0.03), blackMat, 2.30, 0.20, z);   // diffuser fins
  add(new THREE.BoxGeometry(0.34, 0.03, 1.44), carbonMat, 2.08, 1.08, 0, 0, 0, -0.14);     // active wing
  add(new THREE.BoxGeometry(0.28, 0.24, 1.10), blackMat, 2.44, 0.66, 0);                   // rear mesh
  add(new THREE.BoxGeometry(0.90, 0.02, 0.02), blackMat, 0.9, 1.12, 0);                    // roof spine
  // wheels
  for (const front of [true, false]) for (const s of [-1, 1]) {
    const r = CAR.wheelR[front ? 0 : 1];
    const steer = new THREE.Group(); steer.position.set(front ? CAR.axle : -CAR.axle, r, s * (CAR.track + (front ? 0.05 : 0.07))); car.add(steer);
    const spin = new THREE.Group(); steer.add(spin);
    const prof = [[0.26, -0.165], [0.30, -0.165], [r - 0.03, -0.15], [r, -0.12], [r, 0.12], [r - 0.03, 0.15], [0.30, 0.165], [0.26, 0.165]].map(p => new THREE.Vector2(p[0], p[1]));
    const tyre = new THREE.Mesh(new THREE.LatheGeometry(prof, 36), tyreMat); tyre.rotation.x = Math.PI / 2; tyre.castShadow = true; spin.add(tyre);
    const rim = new THREE.Group(); rim.position.z = s * 0.10; spin.add(rim);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(r * 0.72, 0.025, 8, 36), rimLipMat); rim.add(lip);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.72, r * 0.72, 0.22, 36, 1, true), rimMat); barrel.rotation.x = Math.PI / 2; barrel.position.z = -s * 0.08; rim.add(barrel);
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * Math.PI * 2, sp = new THREE.Group(); sp.rotation.z = a; rim.add(sp);
      const stem = new THREE.Mesh(new THREE.BoxGeometry(0.045, r * 0.42, 0.035), rimLipMat); stem.position.y = r * 0.24; sp.add(stem);
      for (const d of [-1, 1]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, r * 0.34, 0.03), rimLipMat); arm.position.set(d * r * 0.13, r * 0.57, 0); arm.rotation.z = -d * 0.42; sp.add(arm); }
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12), rimMat); hub.rotation.x = Math.PI / 2; rim.add(hub);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.03, 32), discMat); disc.rotation.x = Math.PI / 2; disc.position.z = s * 0.02; spin.add(disc);
    const cal = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.20, 0.08), caliperMat); cal.position.set(front ? -0.1 : 0.1, r * 0.52, s * 0.03); cal.rotation.z = front ? 0.3 : -0.3; steer.add(cal);
    wheels.push({ steer, spin, r, front });
  }
}
let customModel = null, customWheels = null, customYaw = 0;
// number plates — GTA V1 — fitted flush to the bodywork by raycasting against the current car model
const PLATE_TEXT = 'GTA V1';
const plateTex = canvasTex(512, (ctx, s) => {
  ctx.fillStyle = '#f4f4f0'; ctx.fillRect(0, 0, s, s); ctx.fillStyle = '#111'; ctx.lineWidth = 14; ctx.strokeStyle = '#111'; ctx.strokeRect(10, s * 0.32, s - 20, s * 0.36);
  ctx.font = 'bold 118px "Barlow Condensed", "Arial Narrow", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(PLATE_TEXT, s / 2, s * 0.5 + 4);
  ctx.font = '600 22px Arial'; ctx.fillStyle = '#1f3b8f'; ctx.fillText('NEW ZEALAND', s / 2, s * 0.36 + 6);
});
plateTex.wrapS = plateTex.wrapT = THREE.ClampToEdgeWrapping; plateTex.repeat.set(1, 0.36); plateTex.offset.set(0, 0.32);
const plateMat = new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.55, metalness: 0.1 });
const plates = new THREE.Group(); bodyGroup.add(plates);
function fitPlates() {
  while (plates.children.length) plates.remove(plates.children[0]);
  const targets = []; (customModel || procBody).traverse(o => { if (o.isMesh) targets.push(o); });
  car.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const fit = (fromX, dirX, y, w, h) => {
    const origin = new THREE.Vector3(fromX, y, 0).applyMatrix4(car.matrixWorld);
    const dir = new THREE.Vector3(dirX, 0, 0).applyQuaternion(car.quaternion);
    ray.set(origin, dir); const hit = ray.intersectObjects(targets, false)[0];
    const x = hit ? fromX + dirX * (hit.distance - 0.012) : (dirX > 0 ? -2.45 : 2.46);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), plateMat); m.position.set(x, y, 0); m.rotation.y = dirX > 0 ? -Math.PI / 2 : Math.PI / 2; m.castShadow = false; plates.add(m);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.01, h + 0.02, w + 0.02), blackMat); back.position.set(x + dirX * 0.006, y, 0); plates.add(back);
  };
  fit(-8, 1, 0.50, 0.372, 0.134);    // rear plate, NZ size
  fit(8, -1, 0.30, 0.372, 0.134);    // front plate
}
fitPlates();
function setPaint(i) {
  paintIdx = (i + PAINTS.length) % PAINTS.length;
  const P = PAINTS[paintIdx];
  paintMat.color.setHex(P.hex);
  $('paint-name').textContent = P.name;
  if (customModel) customModel.traverse(o => {
    if (!(o.isMesh && o.userData.paint)) return;
    if (P.original) { o.material = o.userData.origMat; return; }             // the author's own paint, untouched
    if (!o.userData.tintMat) { o.userData.tintMat = o.userData.origMat.clone(); o.userData.tintMat.map = null; o.userData.tintMat.envMap = cubeRT.texture; }
    o.material = o.userData.tintMat; o.material.color.setHex(P.hex);
  });
}
function installModel(root, name) {
  if (customModel) bodyGroup.remove(customModel);
  const wrap = new THREE.Group();
  root.traverse(o => {
    if (o.isMesh) {
      o.castShadow = o.receiveShadow = true;
      const n = ((o.material && o.material.name) || o.name || '').toLowerCase();
      if (o.material && /light|lamp|led|brake_light|tail_light|headlight_light|turning_light_(right|left)$/.test(n) && !/glass|carbon|inside|holder/.test(n) && o.material.emissive) {
        o.material = o.material.clone(); if (o.material.emissive.getHex() === 0) o.material.emissive.setHex(/tail|brake/.test(n) ? 0xff2010 : 0xdff2ff); o.material.emissiveIntensity = Math.max(o.material.emissiveIntensity || 1, 5.0);
      }
      if (/paint|body|carrosserie|carroceria|exterior/.test(n) && o.material && !/glass|window|interior|light|black|nero|trim|carbon/.test(n)) {
        // the author's colour and finish, rebuilt as clearcoat paint with live reflections
        const src = o.material, pm = new THREE.MeshPhysicalMaterial({ color: src.color ? src.color.clone() : new THREE.Color(0xff2a03), map: src.map || null, metalness: Math.max(0.5, src.metalness || 0), roughness: Math.min(0.18, src.roughness == null ? 0.1 : src.roughness), clearcoat: 1, clearcoatRoughness: 0.04, envMap: cubeRT.texture, envMapIntensity: 1.3, name: src.name });
        o.material = pm; o.userData.paint = true; o.userData.origMat = pm;
      } else if (o.material && o.material.isMeshStandardMaterial) {
        o.material.envMap = cubeRT.texture; o.material.envMapIntensity = /window|glass/.test(n) ? 1.6 : 0.9;
        if (/rim|caliper|exhaust|metal|chrome/.test(n)) { o.material.metalness = 1.0; o.material.roughness = Math.min(0.3, o.material.roughness); }
        if (/window|glass/.test(n) && !/head|tail|turning/.test(n)) { o.material.roughness = 0.03; o.material.metalness = 0.3; }
      }
    }
  });
  wrap.add(root);
  let prescaled = !!root.userData.prescaled; root.traverse(o => { if (o.userData && o.userData.prescaled) prescaled = true; });
  if (prescaled) { wrap.rotation.y = Math.PI / 2 + customYaw; }        // converter output: nose on +Z, real size, on the ground
  else {
    const box = new THREE.Box3().setFromObject(wrap);
    const size = box.getSize(new THREE.Vector3());
    const long = Math.max(size.x, size.z);
    const sc = CAR.length / long; root.scale.setScalar(sc);
    box.setFromObject(wrap);
    const c = box.getCenter(new THREE.Vector3());
    root.position.set(-c.x, -box.min.y, -c.z);
    wrap.rotation.y = (size.z >= size.x ? Math.PI / 2 : 0) + customYaw;
  }
  customWheels = [];
  root.traverse(o => { const n = o.name.toLowerCase(); const m = n.match(/wheel[_\-\s]?(fl|fr|rl|rr)/); if (m) { o.rotation.order = 'YXZ'; customWheels.push({ node: o, front: m[1][0] === 'f' }); } });
  if (!customWheels.length) customWheels = null;
  customModel = wrap; bodyGroup.add(wrap);
  procBody.visible = false;
  wheels.forEach(w => w.steer.visible = false);   // the model brings its own wheels
  fitPlates(); setPaint(paintIdx);
  if (name !== 'embedded') flash('MODEL LOADED', 1800);
}
function loadGLBBuffer(buf, name) {
  try { new THREE.GLTFLoader().parse(buf, '', g => installModel(g.scene, name), e => { console.error(e); flash('MODEL FAILED', 2000); }); }
  catch (e) { console.error(e); flash('MODEL FAILED', 2000); }
}
window.addEventListener('dragover', e => { e.preventDefault(); $('drop').classList.add('on'); });
window.addEventListener('dragleave', () => $('drop').classList.remove('on'));
window.addEventListener('drop', e => {
  e.preventDefault(); $('drop').classList.remove('on');
  const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (!f) return;
  const rd = new FileReader(); rd.onload = () => loadGLBBuffer(rd.result, f.name); rd.readAsArrayBuffer(f);
});
// model baked into the page (build.py --embed), else a revuelto.glb sitting next to the page
{
  const emb = document.getElementById('revuelto-glb');
  if (emb) { try { const b64 = emb.textContent.trim(); const bin = atob(b64); let u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    if (!(u8[0] === 0x67 && u8[1] === 0x6c && u8[2] === 0x54 && u8[3] === 0x46) && window.fflate) u8 = fflate.unzlibSync(u8);   // deflated by build.py
    loadGLBBuffer(u8.buffer, 'embedded'); } catch (e) { console.error(e); } }
  else if (location.protocol !== 'file:') fetch('revuelto.glb').then(r => r.ok ? r.arrayBuffer() : null).then(b => { if (b) loadGLBBuffer(b, 'revuelto.glb'); }).catch(() => {});
}

// ------------------------------------------------------------------ light trail (light-cycle ribbon behind the car)
const TRAIL_N = 700;
const trail = { pts: [], head: 0, count: 0, lastX: 0, lastZ: 0 };
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
trailGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
{ const idx = []; for (let i = 0; i < TRAIL_N - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 3, k, k + 3, k + 2); } trailGeo.setIndex(idx); }
const trailMesh = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false }));
trailMesh.frustumCulled = false; scene.add(trailMesh);
const trailColor = new THREE.Color(0x2ee6ff);
function trailReset() { trail.count = 0; trail.head = 0; trailGeo.setDrawRange(0, 0); }
function trailUpdate() {
  const fx = Math.cos(st.theta), fz = -Math.sin(st.theta);
  const x = st.x - fx * 2.3, z = st.z - fz * 2.3;
  const gap = Math.hypot(x - trail.lastX, z - trail.lastZ);
  if (gap > 25) { trailReset(); trail.lastX = x; trail.lastZ = z; }              // teleport / reset: start a fresh ribbon
  else if (Math.abs(st.u) > 1.5 && gap > 0.7) {
    trail.pts[trail.head] = { x, z, y: terrainH(x, z) }; trail.head = (trail.head + 1) % TRAIL_N; trail.count = Math.min(trail.count + 1, TRAIL_N); trail.lastX = x; trail.lastZ = z;
  }
  const P = trailGeo.attributes.position.array, C = trailGeo.attributes.color.array;
  for (let k = 0; k < trail.count; k++) {
    const p = trail.pts[(trail.head - trail.count + k + TRAIL_N) % TRAIL_N], f = Math.pow(k / Math.max(1, trail.count - 1), 1.6);
    const o = k * 6; P[o] = p.x; P[o + 1] = p.y + 0.30; P[o + 2] = p.z; P[o + 3] = p.x; P[o + 4] = p.y + 1.05; P[o + 5] = p.z;
    const b = 0.04 + 0.96 * f; C[o] = C[o + 3] = trailColor.r * b; C[o + 1] = C[o + 4] = trailColor.g * b; C[o + 2] = C[o + 5] = trailColor.b * b;
  }
  trailGeo.attributes.position.needsUpdate = true; trailGeo.attributes.color.needsUpdate = true;
  trailGeo.setDrawRange(0, Math.max(0, (trail.count - 1) * 6));
}

// ------------------------------------------------------------------ state
const st = {
  x: 0, z: 0, theta: 0, u: 0, w: 0, yaw: 0,           // pose + body-frame velocity
  steer: 0, throttle: 0, brake: 0, hand: false,
  gear: 0, rpm: CAR.idle, shiftT: 0, auto: true, reverse: false,
  mode: 1, cam: 0, offroad: false, slip: 0, aLat: 0, aLong: 0, delta: 0,
  sound: true, started: false, vmax: 0,
  lapStart: null, lapLast: null, lapBest: null, lastP: 0, halfSeen: false, trackIdx: 0,
};
try { const b = localStorage.getItem('revuelto.best'); if (b) st.lapBest = +b; } catch (e) {}
function placeOnTrack(idx) {
  st.x = S[idx].x; st.z = S[idx].z; st.theta = Math.atan2(-T[idx].z, T[idx].x);
  st.u = st.w = st.yaw = 0; st.gear = 0; st.rpm = CAR.idle; st.reverse = false; st.lapStart = null; st.halfSeen = false;
  if (typeof trailReset === 'function') trailReset();
}
placeOnTrack(20);

// ------------------------------------------------------------------ input
const keys = {}, touch = { left: 0, right: 0, gas: 0, brake: 0, hand: 0 };
const inp = { steer: 0, throttle: 0, brake: 0, hand: false, shiftUp: false, shiftDown: false };
function readInput() {
  const k = c => keys[c] ? 1 : 0;
  inp.steer = k('ArrowLeft') + k('KeyA') - k('ArrowRight') - k('KeyD') + touch.left - touch.right;
  inp.throttle = Math.max(k('ArrowUp'), k('KeyW'), touch.gas);
  inp.brake = Math.max(k('ArrowDown'), k('KeyS'), touch.brake);
  inp.hand = !!(keys.Space || touch.hand);
  const gps = navigator.getGamepads ? navigator.getGamepads() : null;
  const gp = gps && (gps[0] || gps[1] || gps[2] || gps[3]);
  if (gp) {
    const ax = gp.axes[0] || 0; if (Math.abs(ax) > 0.08) inp.steer = -ax;
    const bt = i => gp.buttons[i] ? (gp.buttons[i].value || (gp.buttons[i].pressed ? 1 : 0)) : 0;
    inp.throttle = Math.max(inp.throttle, bt(7), bt(0));
    inp.brake = Math.max(inp.brake, bt(6), bt(2));
    if (bt(1) > 0.5) inp.hand = true;
    if (bt(5) > 0.5 && !gp._u) { gp._u = true; shiftManual(1); } else if (bt(5) < 0.5) gp._u = false;
    if (bt(4) > 0.5 && !gp._d) { gp._d = true; shiftManual(-1); } else if (bt(4) < 0.5) gp._d = false;
  }
  inp.steer = clamp(inp.steer, -1, 1);
}
window.addEventListener('keydown', e => {
  if (e.repeat) { if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); return; }
  keys[e.code] = true;
  if (!st.started) { startGame(); }
  switch (e.code) {
    case 'KeyM': setMode(st.mode + 1); break;
    case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': setMode(+e.code.slice(-1) - 1); break;
    case 'KeyC': st.cam = (st.cam + 1) % 5; flash(['CHASE', 'CLOSE', 'BONNET', 'BUMPER', 'PHOTO'][st.cam], 700); break;
    case 'KeyP': setPaint(paintIdx + 1); flash(PAINTS[paintIdx].name, 900); break;
    case 'KeyR': placeOnTrack(trackDistSq(st.x, st.z).i); flash('RESET', 700); break;
    case 'KeyT': st.auto = !st.auto; $('gearlbl').textContent = st.auto ? 'AUTO' : 'MANUAL'; flash(st.auto ? 'AUTOMATIC' : 'MANUAL · Q / E', 900); break;
    case 'KeyE': shiftManual(1); break;
    case 'KeyQ': shiftManual(-1); break;
    case 'KeyG': bloomOn = !bloomOn; flash(bloomOn ? 'BLOOM ON' : 'BLOOM OFF', 700); break;
    case 'KeyF': hiQ = !hiQ; resize(); flash(hiQ ? 'QUALITY HIGH' : 'QUALITY LOW', 800); break;
    case 'KeyV': st.sound = !st.sound; flash(st.sound ? 'SOUND ON' : 'SOUND OFF', 700); break;
    case 'KeyH': $('help').classList.toggle('hidden'); break;
    case 'KeyY': customYaw += Math.PI / 2; if (customModel) customModel.rotation.y += Math.PI / 2; break;
  }
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
document.querySelectorAll('.tbtn').forEach(b => {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); touch[k] = 1; b.classList.add('down'); if (!st.started) startGame(); };
  const off = e => { e.preventDefault(); touch[k] = 0; b.classList.remove('down'); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
});
if (('ontouchstart' in window) || navigator.maxTouchPoints > 0) $('touch').classList.add('on');
$('start-btn').addEventListener('click', startGame);
$('start').addEventListener('click', startGame);

let flashTimer = null;
function flash(text, ms) { const m = $('msg'); m.textContent = text; m.classList.add('show'); clearTimeout(flashTimer); flashTimer = setTimeout(() => m.classList.remove('show'), ms); }
function setMode(i) {
  st.mode = (i + MODES.length) % MODES.length; const m = MODES[st.mode];
  $('mode-name').textContent = m.name; $('mode-name').style.color = m.color; $('mode-sub').textContent = m.sub;
  flash(m.name, 900);
}
function shiftTo(g) { if (g < 0 || g > 7 || g === st.gear) return; st.gear = g; st.shiftT = 0.09; audio.shift(); }
function shiftManual(d) { if (st.auto) { st.auto = false; $('gearlbl').textContent = 'MANUAL'; } if (!st.reverse) shiftTo(st.gear + d); }
function startGame() {
  if (st.started) return; st.started = true;
  $('start').classList.add('hidden');
  audio.start(); setMode(st.mode); setPaint(0);
  flash('AUTODROMO DI CORE FOCUS', 1500);
}

// ------------------------------------------------------------------ audio (synthesized V12)
const audio = {
  ctx: null,
  start() {
    try {
      const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const master = C.createGain(); master.gain.value = 0.7; master.connect(C.destination); this.master = master;
      const comp = C.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.18; comp.connect(master);
      const noiseBuf = C.createBuffer(1, C.sampleRate * 2, C.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const noise = () => { const n = C.createBufferSource(); n.buffer = noiseBuf; n.loop = true; n.start(); return n; };
      // engine: oscillator bank -> drive -> lowpass -> howl -> gain
      this.oscs = [];
      const mix = C.createGain(); mix.gain.value = 0.5;
      for (const o of [['sawtooth', 1, 0.55, 0], ['sawtooth', 0.5, 0.45, 6], ['sine', 0.25, 0.7, 0], ['square', 2, 0.10, 0], ['sawtooth', 1.5, 0.12, -4], ['sawtooth', 3, 0.05, 0]]) {
        const osc = C.createOscillator(); osc.type = o[0]; osc.detune.value = o[3]; const g = C.createGain(); g.gain.value = o[2]; osc.connect(g); g.connect(mix); osc.start(); this.oscs.push({ osc, mult: o[1], g, base: o[2] });
      }
      const shaper = C.createWaveShaper(); const curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 2.6); } shaper.curve = curve; shaper.oversample = '2x';
      const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.4; this.lp = lp;
      const howl = C.createBiquadFilter(); howl.type = 'peaking'; howl.frequency.value = 2400; howl.Q.value = 1.6; howl.gain.value = 6; this.howl = howl;
      const body = C.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 180; body.Q.value = 1.2; body.gain.value = 4;
      const eg = C.createGain(); eg.gain.value = 0; this.eg = eg;
      mix.connect(shaper); shaper.connect(lp); lp.connect(howl); howl.connect(body); body.connect(eg); eg.connect(comp);
      // intake
      const ib = C.createBiquadFilter(); ib.type = 'bandpass'; ib.frequency.value = 900; ib.Q.value = 0.7; const ig = C.createGain(); ig.gain.value = 0; noise().connect(ib); ib.connect(ig); ig.connect(comp); this.ig = ig; this.ib = ib;
      // exhaust crackle
      const cb = C.createBiquadFilter(); cb.type = 'bandpass'; cb.frequency.value = 420; cb.Q.value = 1.2; const cg = C.createGain(); cg.gain.value = 0; noise().connect(cb); cb.connect(cg); cg.connect(comp); this.cg = cg;
      // wind
      const wb = C.createBiquadFilter(); wb.type = 'lowpass'; wb.frequency.value = 300; const wg = C.createGain(); wg.gain.value = 0; noise().connect(wb); wb.connect(wg); wg.connect(comp); this.wg = wg; this.wb = wb;
      // tyres
      const tb = C.createBiquadFilter(); tb.type = 'bandpass'; tb.frequency.value = 1500; tb.Q.value = 5; const tg = C.createGain(); tg.gain.value = 0; noise().connect(tb); tb.connect(tg); tg.connect(comp); this.tg = tg; this.tb = tb;
      // gravel
      const gb = C.createBiquadFilter(); gb.type = 'bandpass'; gb.frequency.value = 2600; gb.Q.value = 0.6; const gg = C.createGain(); gg.gain.value = 0; noise().connect(gb); gb.connect(gg); gg.connect(comp); this.gg = gg;
      // EV whine
      const ev = C.createOscillator(); ev.type = 'sine'; const ev2 = C.createOscillator(); ev2.type = 'triangle'; const evg = C.createGain(); evg.gain.value = 0; ev.connect(evg); ev2.connect(evg); evg.connect(comp); ev.start(); ev2.start(); this.ev = ev; this.ev2 = ev2; this.evg = evg;
      this.load = 0;
    } catch (e) { console.warn('audio unavailable', e); this.ctx = null; }
  },
  shift() {
    if (!this.ctx || !st.sound) return; const t = this.ctx.currentTime;
    this.cg.gain.cancelScheduledValues(t); this.cg.gain.setValueAtTime(0.35, t); this.cg.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  },
  pop() {
    if (!this.ctx) return; const t = this.ctx.currentTime + Math.random() * 0.03;
    this.cg.gain.cancelScheduledValues(t); this.cg.gain.setValueAtTime(0.5 + Math.random() * 0.4, t); this.cg.gain.exponentialRampToValueAtTime(0.001, t + 0.05 + Math.random() * 0.08);
  },
  update(dt) {
    if (!this.ctx) return; const C = this.ctx; if (C.state === 'suspended') C.resume();
    const t = C.currentTime, on = st.sound ? 1 : 0, m = MODES[st.mode];
    const thr = st.shiftT > 0 ? 0 : st.throttle;
    this.load = damp(this.load, thr, thr > this.load ? 18 : 5, dt);
    const f = st.rpm / 60 * 6, x = st.rpm / CAR.redline;                    // 12 cyl / 2 = 6 fires per rev
    for (const o of this.oscs) { o.osc.frequency.setTargetAtTime(f * o.mult, t, 0.015); }
    this.oscs[3].g.gain.setTargetAtTime(0.02 + 0.22 * x * x, t, 0.05);       // scream comes in up top
    this.lp.frequency.setTargetAtTime(260 + this.load * 2600 + x * 4200, t, 0.03);
    this.howl.gain.setTargetAtTime(2 + 8 * x * this.load, t, 0.05);
    const eng = m.ev ? 0 : (0.22 + 0.78 * this.load) * (0.55 + 0.45 * x) * 0.55;
    this.eg.gain.setTargetAtTime(eng * on, t, 0.02);
    this.ig.gain.setTargetAtTime((m.ev ? 0 : thr * 0.16 * x) * on, t, 0.03);
    this.ib.frequency.setTargetAtTime(500 + x * 1400, t, 0.05);
    const spd = Math.abs(st.u);
    this.wg.gain.setTargetAtTime(Math.pow(clamp(spd / 100, 0, 1), 1.6) * 0.55 * on, t, 0.05);
    this.wb.frequency.setTargetAtTime(200 + spd * 14, t, 0.05);
    this.tg.gain.setTargetAtTime((st.offroad ? 0 : clamp((st.slip - 0.12) * 1.4, 0, 1) * 0.35 * clamp(spd / 8, 0, 1)) * on, t, 0.04);
    this.tb.frequency.setTargetAtTime(1200 + 800 * st.slip, t, 0.05);
    this.gg.gain.setTargetAtTime((st.offroad ? clamp(spd / 20, 0, 1) * 0.3 : 0) * on, t, 0.05);
    const evOn = m.ev || (spd > 0.5 && x < 0.15);
    this.evg.gain.setTargetAtTime((evOn ? 0.03 + 0.05 * thr : 0) * on * clamp(spd / 3, 0, 1), t, 0.05);
    this.ev.frequency.setTargetAtTime(120 + spd * 26, t, 0.05); this.ev2.frequency.setTargetAtTime(240 + spd * 52, t, 0.05);
    if (!m.ev && thr < 0.05 && st.rpm > 4200 && Math.random() < dt * (st.mode === 3 ? 9 : 4) * on) this.pop();
  },
};

// ------------------------------------------------------------------ physics
const torqueFactor = rpm => { const x = rpm / CAR.redline; let t = 0.82 + 0.18 * smoothstep(0.12, 0.72, x); if (x > 0.96) t *= 1 - (x - 0.96) * 5; return t; };   // e-motors fill the low end
const rpmForGear = (u, g) => Math.abs(u) * 3.6 / CAR.gearTopKmh[g] * CAR.redline;
function step(dt) {
  const m = MODES[st.mode];
  // input shaping
  const rate = Math.abs(inp.steer) > Math.abs(st.steer) ? 3.4 : 7.0;
  st.steer += clamp(inp.steer - st.steer, -rate * dt, rate * dt);
  st.throttle += clamp(inp.throttle - st.throttle, -10 * dt, 7 * dt);
  st.brake = inp.brake; st.hand = inp.hand;
  const u0 = st.u, v = Math.abs(st.u);
  // reverse logic
  if (!st.reverse && v < 0.6 && st.brake > 0 && st.throttle < 0.05) st.reverse = true;
  if (st.reverse && st.throttle > 0.05 && st.u > -0.6) st.reverse = false;
  // gearbox + rpm
  if (st.shiftT > 0) st.shiftT -= dt;
  const wheelRpm = st.reverse ? Math.abs(st.u) * 3.6 / 40 * CAR.redline : rpmForGear(st.u, st.gear);
  let target = wheelRpm < CAR.idle * 1.05 ? Math.max(wheelRpm, CAR.idle + st.throttle * 3800 * (1 - Math.min(1, wheelRpm / CAR.idle) * 0.6)) : wheelRpm;
  if (m.ev) target = Math.min(target, CAR.idle);
  st.rpm = damp(st.rpm, target, st.throttle > 0.5 ? 16 : 9, dt);
  st.rpm = clamp(st.rpm, CAR.idle * 0.92, CAR.redline);
  if (st.auto && st.shiftT <= 0 && !st.reverse && !m.ev) {
    if (st.rpm > 9250 && st.gear < 7) shiftTo(st.gear + 1);
    else if (st.gear > 0 && st.rpm < 3500) shiftTo(st.gear - 1);
    else if (st.gear > 0 && st.throttle > 0.85 && st.rpm < 6300 && rpmForGear(st.u, st.gear - 1) < 8900) shiftTo(st.gear - 1);
  }
  if (m.ev && st.gear !== 0) st.gear = 0;
  // longitudinal forces
  const Pe = CAR.powerW * CAR.drivelineEff * m.power;
  const Ftrac = CAR.mass * G * CAR.tractionG * (st.offroad ? 0.45 : 1) * (m.ev ? 0.5 : 1);
  let F = 0;
  if (!st.reverse) {
    F = st.throttle * Math.min(Ftrac, Pe / Math.max(v, 2.5)) * (m.ev ? 1 : torqueFactor(st.rpm));
    if (st.shiftT > 0) F *= 0.08;
    if (st.rpm >= CAR.redline - 20 && !m.ev) F *= 0.12;                   // limiter
    if (m.ev && v > 180 / 3.6) F = 0;
  } else {
    F = -st.brake * Math.min(7000, Pe * 0.25 / Math.max(v, 1)); if (st.u < -8) F = Math.max(F, 0);
  }
  const Fb = (st.reverse ? 0 : st.brake) * CAR.mass * G * CAR.brakeG * (st.offroad ? 0.55 : 1) + (st.hand ? 0.35 * CAR.mass * G : 0);
  const Fd = CAR.dragK * st.u * v;
  const Fr = Math.sign(st.u) * (CAR.rolling + (st.offroad ? 1100 + 18 * v : 0));
  const Feb = (!st.reverse && !m.ev && st.throttle < 0.05) ? Math.sign(st.u) * 1800 * (st.rpm / CAR.redline) : 0;
  let du = (F - Fd - Fr - Feb) / CAR.mass * dt;
  st.u += du;
  const bDecel = Fb / CAR.mass * dt;
  if (v > 0) { if (Math.abs(st.u) <= bDecel) st.u = 0; else st.u -= Math.sign(st.u) * bDecel; }
  if (v < 0.05 && Math.abs(F) < 1) st.u = 0;
  // lateral / yaw
  let mu = m.grip * (st.offroad ? 0.42 : 1); if (st.hand) mu *= 0.45;
  const dmax = Math.min(0.62, Math.atan(CAR.wheelbase * 1.35 * mu * G / Math.max(st.u * st.u, 1)));
  st.delta = st.steer * dmax;
  let wTarget = st.u / CAR.wheelbase * Math.tan(st.delta);
  const slipAng = Math.atan2(st.w, Math.abs(st.u) + 0.5);
  wTarget *= 1 / (1 + Math.abs(slipAng) * (1.2 + 1.6 * m.stab));
  if (st.hand && v > 3) wTarget *= 1.8;
  st.yaw = damp(st.yaw, wTarget, 1 / 0.09, dt);
  const uPrev = st.u, wPrev = st.w;
  st.w += st.yaw * uPrev * dt; st.u -= st.yaw * wPrev * dt;
  const k = 9 + 7 * m.stab;
  st.aLat = clamp(st.w * k, -mu * G, mu * G);
  st.w -= st.aLat * dt;
  if (v < 0.8) st.w *= Math.max(0, 1 - dt * 6);
  st.slip = damp(st.slip, Math.min(1, Math.abs(st.w) / 5 + Math.abs(slipAng) * 1.2), 12, dt);
  st.aLong = damp(st.aLong, (st.u - u0) / dt, 6, dt);
  // integrate pose
  st.theta += st.yaw * dt;
  const c = Math.cos(st.theta), s = Math.sin(st.theta);
  st.x += (st.u * c + st.w * s) * dt;
  st.z += (-st.u * s + st.w * c) * dt;
  // track relation
  const tr = trackDistSq(st.x, st.z); st.trackIdx = tr.i;
  st.offroad = Math.sqrt(tr.d2) > ROAD_HALF + 0.8;
  const p = tr.i / N;
  if (p > 0.45 && p < 0.55) st.halfSeen = true;
  if (st.lastP > 0.92 && p < 0.08 && st.u > 2) {
    const now = performance.now();
    if (st.lapStart != null && st.halfSeen) {
      st.lapLast = now - st.lapStart;
      if (st.lapBest == null || st.lapLast < st.lapBest) { st.lapBest = st.lapLast; try { localStorage.setItem('revuelto.best', String(st.lapBest)); } catch (e) {} flash('NEW BEST ' + fmtTime(st.lapBest), 2500); }
      else flash('LAP ' + fmtTime(st.lapLast), 2000);
    } else flash('LAP STARTED', 1200);
    st.lapStart = now; st.halfSeen = false;
  }
  st.lastP = p;
  st.vmax = Math.max(st.vmax, v * 3.6);
  // wheels
  const dist = st.u * dt;
  for (const w of wheels) { w.spin.rotation.z -= dist / w.r; w.steer.rotation.y = w.front ? st.delta : 0; }
  if (customWheels) for (const w of customWheels) { w.node.rotation.x += dist / 0.35; w.node.rotation.y = w.front ? st.delta : 0; }
}

// ------------------------------------------------------------------ camera
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmpV = new THREE.Vector3(), fwd = new THREE.Vector3(), velDir = new THREE.Vector3();
let camInit = false;
function updateCamera(dt) {
  fwd.set(Math.cos(st.theta), 0, -Math.sin(st.theta));
  const v = Math.abs(st.u), cx = st.x, cz = st.z, gy = terrainH(cx, cz);
  const c = Math.cos(st.theta), s = Math.sin(st.theta);
  velDir.set(st.u * c + st.w * s, 0, -st.u * s + st.w * c);
  const dir = (v > 4 ? tmpV.copy(fwd).multiplyScalar(0.65).addScaledVector(velDir.normalize(), 0.35 * Math.sign(st.u)) : tmpV.copy(fwd)).normalize();
  let target, look;
  if (st.cam === 2) { target = new THREE.Vector3(cx, gy + 1.08, cz).addScaledVector(fwd, -0.9); look = new THREE.Vector3(cx, gy + 0.9, cz).addScaledVector(fwd, 40); }
  else if (st.cam === 3) { target = new THREE.Vector3(cx, gy + 0.55, cz).addScaledVector(fwd, 2.7); look = new THREE.Vector3(cx, gy + 0.55, cz).addScaledVector(fwd, 40); }
  else if (st.cam === 4) { const a = st.theta + 0.6 + performance.now() * 0.00012; target = new THREE.Vector3(cx + Math.cos(a) * 7.5, gy + 1.7, cz - Math.sin(a) * 7.5); look = new THREE.Vector3(cx, gy + 0.6, cz); }
  else {
    const d = st.cam === 0 ? 7.8 : 5.6, h = st.cam === 0 ? 2.4 : 1.7;
    target = new THREE.Vector3(cx, gy + h, cz).addScaledVector(dir, -d);
    look = new THREE.Vector3(cx, gy + 0.95, cz).addScaledVector(fwd, 3.5);
  }
  if (!camInit || (st.cam >= 2 && st.cam !== 4)) { camPos.copy(target); camLook.copy(look); camInit = true; }
  else { camPos.lerp(target, 1 - Math.exp(-dt * 6.5)); camLook.lerp(look, 1 - Math.exp(-dt * 9)); }
  camera.position.copy(camPos);
  if (st.cam < 2 && v > 60) { camera.position.y += (Math.random() - 0.5) * 0.02 * (v - 60) / 40; }
  camera.lookAt(camLook);
  const fov = 60 + 24 * clamp(v / 95, 0, 1);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
}

// ------------------------------------------------------------------ HUD
const tach = $('tach').getContext('2d'), mini = $('minimap').getContext('2d');
let miniPath = null;
function drawTach() {
  const c = tach, W = 460, cx = W / 2, cy = W / 2, r = 178; c.clearRect(0, 0, W, W);
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, sweep = a1 - a0, m = MODES[st.mode];
  c.lineCap = 'butt'; c.lineWidth = 26;
  c.strokeStyle = 'rgba(255,255,255,0.09)'; c.beginPath(); c.arc(cx, cy, r, a0, a1); c.stroke();
  c.strokeStyle = 'rgba(255,40,40,0.35)'; c.beginPath(); c.arc(cx, cy, r, a0 + sweep * 0.9, a1); c.stroke();
  const frac = clamp(st.rpm / 10000, 0, 1);
  const grad = c.createLinearGradient(0, W, W, 0); grad.addColorStop(0, m.color); grad.addColorStop(1, frac > 0.88 ? '#ff2a2a' : '#ffffff');
  c.strokeStyle = grad; c.beginPath(); c.arc(cx, cy, r, a0, a0 + sweep * frac); c.stroke();
  c.fillStyle = 'rgba(244,241,234,0.75)'; c.font = '600 22px Barlow Condensed, Arial Narrow, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let k = 0; k <= 10; k++) {
    const a = a0 + sweep * k / 10, ir = r - 26, or = r - 16;
    c.strokeStyle = k >= 9 ? 'rgba(255,60,60,0.9)' : 'rgba(244,241,234,0.7)'; c.lineWidth = 3; c.beginPath(); c.moveTo(cx + Math.cos(a) * ir, cy + Math.sin(a) * ir); c.lineTo(cx + Math.cos(a) * or, cy + Math.sin(a) * or); c.stroke();
    c.fillText(String(k), cx + Math.cos(a) * (r - 48), cy + Math.sin(a) * (r - 48));
  }
  const na = a0 + sweep * frac;
  c.strokeStyle = '#fff'; c.lineWidth = 4; c.beginPath(); c.moveTo(cx + Math.cos(na) * (r - 60), cy + Math.sin(na) * (r - 60)); c.lineTo(cx + Math.cos(na) * (r + 16), cy + Math.sin(na) * (r + 16)); c.stroke();
  c.fillStyle = '#f4f1ea'; c.font = '700 54px Orbitron, Bahnschrift, Arial, sans-serif'; c.fillText(String(Math.round(st.rpm / 10) * 10), cx, cy - 6);
  c.fillStyle = 'rgba(244,241,234,0.5)'; c.font = '600 18px Barlow Condensed, Arial Narrow, sans-serif'; c.fillText('RPM  ×1000', cx, cy + 36);
  if (frac > 0.9 && !MODES[st.mode].ev && Math.floor(performance.now() / 120) % 2) { c.fillStyle = '#ff2a2a'; c.font = '700 26px Barlow Condensed, Arial Narrow, sans-serif'; c.fillText('SHIFT', cx, cy + 90); }
}
function drawMini() {
  const c = mini, W = 300;
  if (!miniPath) {
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const p of S) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
    const sc = (W - 36) / Math.max(maxX - minX, maxZ - minZ);
    const ox = (W - (maxX - minX) * sc) / 2 - minX * sc, oz = (W - (maxZ - minZ) * sc) / 2 - minZ * sc;
    miniPath = { sc, ox, oz, pts: S.map(p => [p.x * sc + ox, p.z * sc + oz]) };
  }
  c.clearRect(0, 0, W, W);
  c.strokeStyle = 'rgba(244,241,234,0.85)'; c.lineWidth = 5; c.lineJoin = 'round'; c.beginPath();
  miniPath.pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.stroke();
  const s0 = miniPath.pts[0]; c.fillStyle = '#fff'; c.fillRect(s0[0] - 4, s0[1] - 4, 8, 8);
  const px = st.x * miniPath.sc + miniPath.ox, pz = st.z * miniPath.sc + miniPath.oz;
  c.save(); c.translate(px, pz); c.rotate(-st.theta);
  c.fillStyle = MODES[st.mode].color; c.beginPath(); c.moveTo(11, 0); c.lineTo(-7, 6); c.lineTo(-7, -6); c.closePath(); c.fill(); c.restore();
}
let hudTick = 0;
function updateHUD() {
  $('spd').textContent = String(Math.round(Math.abs(st.u) * 3.6));
  const g = $('gear'); g.textContent = st.reverse ? 'R' : (Math.abs(st.u) < 0.3 && st.throttle < 0.05 ? 'N' : String(st.gear + 1));
  g.style.color = st.rpm > 9000 ? '#ff2a2a' : MODES[st.mode].color;
  drawTach();
  if ((hudTick++ & 3) === 0) {
    drawMini();
    $('lap-cur').textContent = st.lapStart != null ? fmtTime(performance.now() - st.lapStart) : '--:--.---';
    $('lap-last').textContent = fmtTime(st.lapLast);
    $('lap-best').textContent = fmtTime(st.lapBest);
    $('vmax').textContent = Math.round(st.vmax) + ' km/h';
    $('status').textContent = st.offroad ? 'OFF TRACK' : (st.slip > 0.35 ? 'SLIDING' : '');
    $('vignette').style.opacity = String(0.25 + 0.5 * clamp(Math.abs(st.u) / 95, 0, 1));
  }
}

// ------------------------------------------------------------------ main loop
const FIXED = 1 / 120; let acc = 0, last = performance.now(), frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  readInput();
  if (st.started) { acc += dt; while (acc >= FIXED) { step(FIXED); acc -= FIXED; } audio.update(dt); }
  car.position.set(st.x, terrainH(st.x, st.z), st.z); car.rotation.y = st.theta;
  underglow.position.set(st.x, car.position.y + 0.25, st.z);
  trailUpdate();
  gridMat.uniforms.uCar.value.copy(car.position); gridMat.uniforms.uTime.value = now / 1000;
  if ((frames & 1) === 0) { car.visible = false; mirror.visible = false; cubeCam.position.set(st.x, car.position.y + 0.7, st.z); cubeCam.update(renderer, scene); car.visible = true; mirror.visible = true; }
  bodyGroup.rotation.z = damp(bodyGroup.rotation.z, st.aLong * 0.004, 8, dt);
  bodyGroup.rotation.x = damp(bodyGroup.rotation.x, st.aLat * 0.006, 8, dt);
  updateCamera(dt);
  sun.position.copy(car.position).addScaledVector(sunDir, 300); sun.target.position.copy(car.position); sun.target.updateMatrixWorld();
  updateHUD();
  if (bloomOn && composer) composer.render(); else renderer.render(scene, camera);
  frames++;
}
resize();
requestAnimationFrame(frame);
window.__sim = { st, inp, trailUpdate, loadGLBBuffer, installModel, camera, renderer, scene, roadMesh, ground, S, T, N, placeOnTrack, step, MODES, CAR, setMode, setPaint, keys, startGame };
})();
