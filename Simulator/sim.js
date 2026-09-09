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
  { name: 'CITTÀ',  sub: 'EV · 180 CV',        power: 0.18, grip: 1.55, stab: 1.0, ev: true,  color: '#4cc9f0' },
  { name: 'STRADA', sub: 'HYBRID · 886 CV',    power: 0.85, grip: 1.60, stab: 1.0, ev: false, color: '#f4f1ea' },
  { name: 'SPORT',  sub: 'HYBRID · 907 CV',    power: 0.92, grip: 1.50, stab: 0.55, ev: false, color: '#ff8c1a' },
  { name: 'CORSA',  sub: 'HYBRID · 1015 CV',   power: 1.00, grip: 1.75, stab: 0.8, ev: false, color: '#ff2a2a' },
];
const PAINTS = [   // official Lamborghini names; the bar shows all but the first
  { name: 'AS DOWNLOADED', hex: 0xff2a03, original: true },
  { name: 'ARANCIO APODIS', hex: 0xc22e08 }, { name: 'VERDE SCANDAL', hex: 0x22b400 }, { name: 'GIALLO INTI', hex: 0xffd200 },
  { name: 'NERO HELENE', hex: 0x0a0a0c },    { name: 'BIANCO SIDERALE', hex: 0xf2f2ec }, { name: 'ROSSO MARS', hex: 0xd40015 },
  { name: 'BLU URANUS', hex: 0x0a3cff },     { name: 'VIOLA PASIFAE', hex: 0x5a2d91 },   { name: 'GRIGIO TELESTO', hex: 0x8b8f94 },
  { name: 'VERDE MANTIS', hex: 0x30d21c },   { name: 'BLU LE MANS', hex: 0x1d3bb0 },     { name: 'ARANCIO BOREALIS', hex: 0xff7a00 },
  { name: 'CORE FOCUS LIVERY', hex: 0x15181f, livery: true },
  { name: 'TRON LEGACY', hex: 0x2ee6ff, shader: true },
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
renderer.toneMappingExposure = 0.72;
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

const sun = new THREE.DirectionalLight(0xa9d4ff, 1.3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 10; sun.shadow.camera.far = 900;
sun.shadow.camera.left = -40; sun.shadow.camera.right = 40; sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
scene.add(sun); scene.add(sun.target);
scene.add(new THREE.HemisphereLight(0x1e447e, 0x02050c, 0.45));
const underglow = new THREE.PointLight(0x2ee6ff, 2.6, 10, 2); scene.add(underglow);
const glowTex = canvasTex(256, (ctx, sz) => { const g = ctx.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz / 2); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.35, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, sz, sz); });
const glowDisc = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 5), new THREE.MeshBasicMaterial({ map: glowTex, color: 0x2ee6ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
glowDisc.rotation.x = -Math.PI / 2; glowDisc.position.y = 0.06; glowDisc.renderOrder = 2;
const GLOW_BLUE = new THREE.Color(0x2ee6ff), GLOW_PURPLE = new THREE.Color(0xa64dff), glowCol = new THREE.Color();
// showroom rig that follows the car: cool-white key from front-left-high, cyan rim from behind, warm fill from the right
const rig = new THREE.Group(); scene.add(rig);
const keyLight = new THREE.SpotLight(0xf4f8ff, 0.7, 40, 0.7, 0.6, 1.2); keyLight.position.set(9, 9, -7); rig.add(keyLight); rig.add(keyLight.target);
const rimLight = new THREE.SpotLight(0x5fe8ff, 1.2, 40, 0.8, 0.7, 1.2); rimLight.position.set(-9, 6, 4); rig.add(rimLight); rig.add(rimLight.target);
const fillLight = new THREE.SpotLight(0xffd9b0, 0.4, 40, 0.9, 0.8, 1.2); fillLight.position.set(3, 4, 9); rig.add(fillLight); rig.add(fillLight.target);
[keyLight, rimLight, fillLight].forEach(l => { l.target.position.set(0, 0.6, 0); });
// live reflections: a cube camera at the car feeds the paint, glass and rims
const cubeRT = new THREE.WebGLCubeRenderTarget(512, { format: THREE.RGBAFormat, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
const cubeCam = new THREE.CubeCamera(0.6, 2500, cubeRT);
// studio softbox that only the reflection camera can see (layer 1): a soft warm surround and bright top panels,
// so the paint gets the smooth studio gradient of a viewer render while the Grid itself stays dark
const studio = new THREE.Group(); scene.add(studio);
{
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(28, 28, 18, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x2e2c2a, side: THREE.BackSide, fog: false })); wall.position.y = 6; studio.add(wall);
  const ceil = new THREE.Mesh(new THREE.CircleGeometry(28, 32), new THREE.MeshBasicMaterial({ color: 0x5c5a57, side: THREE.DoubleSide, fog: false })); ceil.rotation.x = Math.PI / 2; ceil.position.y = 15; studio.add(ceil);
  for (const [x, z, w, l] of [[0, 0, 5, 16], [-10, 6, 3, 12], [10, -6, 3, 12]]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, fog: false })); p.rotation.x = Math.PI / 2; p.position.set(x, 13, z); studio.add(p); }
  studio.traverse(o => o.layers.set(1));
  cubeCam.children.forEach(c => c.layers.enable(1));
}

// post-processing (bloom)
let composer = null, bloomPass = null, bloomOn = true, hiQ = true;
function buildComposer() {
  const w = renderer.domElement.width, h = renderer.domElement.height;
  const rt = isWebGL2 ? new THREE.WebGLMultisampleRenderTarget(w, h, { format: THREE.RGBAFormat }) : undefined;
  composer = new THREE.EffectComposer(renderer, rt);
  composer.addPass(new THREE.RenderPass(scene, camera));
  bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(w, h), 0.6, 0.5, 0.88);
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

// track centreline: [x, z, height]. ~13 km: 1.2 km main straight, jump at the crest of turn one, steep dive to an
// underground hairpin, 1.7 km back straight carrying a loop and a double loop, climb to a 360° corkscrew, a second
// jump, two overpasses across the main straight, a chicane run, a big loop, and the canyon home.
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const LOOPS = [
  { E: new THREE.Vector3(200, 0, -2000), dir: new THREE.Vector3(-1, 0, 0), R: 28, shift: 16 },
  { E: new THREE.Vector3(-350, 0, -2016), dir: new THREE.Vector3(-1, 0, 0), R: 24, shift: 14 },
  { E: new THREE.Vector3(-350, 0, -2030), dir: new THREE.Vector3(-1, 0, 0), R: 24, shift: 14 },
  { E: new THREE.Vector3(100, 0, -350), dir: new THREE.Vector3(-1, 0, 0), R: 36, shift: 18 },
];
for (const L of LOOPS) { L.rt = new THREE.Vector3().crossVectors(L.dir, WORLD_UP).normalize(); L.C = L.E.clone().add(new THREE.Vector3(0, L.R, 0)); }
const loopPts = L => { const out = []; for (let k = 1; k <= 8; k++) { const th = k / 8 * Math.PI * 2; out.push([L.E.x + L.dir.x * L.R * Math.sin(th) + L.rt.x * L.shift * (k / 8), L.E.z + L.dir.z * L.R * Math.sin(th) + L.rt.z * L.shift * (k / 8), L.R * (1 - Math.cos(th))]); } return out; };
const JUMPS = [   // [kicker top, landing]: no road between, the car flies
  { from: new THREE.Vector3(1330, 34, -860), to: new THREE.Vector3(1200, 10, -1000) },
  { from: new THREE.Vector3(-1100, 32, -450), to: new THREE.Vector3(-930, 8, -300) },
];
const ROLLS = [ { from: new THREE.Vector3(-1500, 24, -1350), to: new THREE.Vector3(-1500, 24, -1050) } ];   // corkscrew: road rolls 360° between these
const CTRL = [
  [-300, 0, 0], [900, 0, 0], [1250, -110, 5], [1480, -380, 16], [1450, -680, 26], [1330, -860, 34],   // main straight, turn one climbing to the kicker
  [1200, -1000, 10], [1050, -1150, 4], [830, -1240, -10], [640, -1190, -20], [480, -1060, -21], [380, -1200, -21], [480, -1380, -17], [700, -1500, -8], [950, -1570, 2],   // landing, dive, underground hairpin, climb
  [1150, -1700, 4], [1050, -1900, 6], [800, -2000, 0], [200, -2000, 0], ...loopPts(LOOPS[0]),           // back straight, loop
  [-350, -2016, 0], ...loopPts(LOOPS[1]), ...loopPts(LOOPS[2]), [-900, -2044, 0],                          // double loop
  [-1200, -2000, 8], [-1450, -1750, 20], [-1500, -1450, 24], [-1500, -1350, 24], [-1500, -1200, 24], [-1500, -1050, 24], [-1480, -900, 22],   // climb, corkscrew
  [-1300, -650, 26], [-1100, -450, 32], [-930, -300, 8], [-700, -150, 2],                                  // second jump
  [-780, 60, 30], [-860, 400, 95], [-920, 800, 175], [-950, 1150, 245], [-930, 1350, 262],                 // THE SUMMIT: 1.5 km straight up the wall to 262 m
  [-820, 1500, 262], [-640, 1520, 250], [-520, 1400, 225],                                                 // the turn on top
  [-560, 1200, 150], [-700, 1060, 100], [-540, 900, 62], [-700, 740, 38], [-560, 590, 26], [-620, 400, 22], [-540, 200, 22],   // THE PLUNGE: 20° down through the esses
  [-500, 0, 22], [-350, 150, 24], [-100, 250, 20], [200, 250, 12], [500, 150, 20], [650, 0, 24], [800, -150, 18],   // overpasses across the main straight
  [900, -300, 12], [750, -420, 8], [600, -300, 6], [450, -450, 4], [300, -350, 2], [100, -350, 0], ...loopPts(LOOPS[3]),   // chicanes, big loop
  [-400, -380, 0], [-700, -300, 4], [-1000, -150, 2], [-1300, -80, 0], [-1400, -10, 0], [-1250, 0, 0],   // home
];
const curve = new THREE.CatmullRomCurve3(CTRL.map(p => new THREE.Vector3(p[0], p[2], p[1])), true, 'centripetal', 0.5);
const N = 3400;
const S = curve.getSpacedPoints(N).slice(0, N);       // closed loop samples (3D)
{ // the spline overshoots a few metres below the plain next to level sections; only the designed dive (near x 380..830, z -1500..-1000) may go under
  for (const q of S) if (q.y < 0 && !(q.x > 300 && q.x < 900 && q.z > -1600 && q.z < -950)) q.y = 0.02;
}
const T = [], RT = [], UP = [], KERB = new Array(N).fill(false), CUM = new Array(N).fill(0), KAPPA = new Float32Array(N);
const LOOP = new Array(N).fill(-1), UNDER = new Array(N).fill(false), JUMP = new Array(N).fill(false), ROLL = new Float32Array(N).fill(-1);
let trackLen = 0;
const nearest = v => { let bi = 0, bd = 1e18; for (let i = 0; i < N; i++) { const d = S[i].distanceToSquared(v); if (d < bd) { bd = d; bi = i; } } return bi; };
for (let i = 0; i < N; i++) {
  const a = S[(i + N - 1) % N], b = S[(i + 1) % N];
  T.push(new THREE.Vector3().subVectors(b, a).normalize());
  LOOPS.forEach((L, k) => { if (S[i].distanceTo(L.C) < L.R + 7) LOOP[i] = k; });
  UNDER[i] = S[i].y < -1.5;
}
for (const J of JUMPS) { const a = nearest(J.from) - 6, b = nearest(J.to); J.i0 = a; J.i1 = b; for (let i = a; i <= b; i++) JUMP[i] = true; }
for (const Rl of ROLLS) { const a = nearest(Rl.from), b = nearest(Rl.to); Rl.i0 = a; Rl.i1 = b; for (let i = a; i <= b; i++) ROLL[i] = (i - a) / (b - a); }
for (let i = 0; i < N; i++) {
  // road frame: right = T x up; through a loop right stays the loop plane normal so the road can invert; a corkscrew rolls it round T
  let r;
  if (LOOP[i] >= 0) r = LOOPS[LOOP[i]].rt.clone();
  else { r = new THREE.Vector3().crossVectors(T[i], WORLD_UP).normalize(); if (ROLL[i] >= 0) { const ang = ROLL[i] * Math.PI * 2, e = 0.5 - 0.5 * Math.cos(ang); const dn = new THREE.Vector3().crossVectors(T[i], r); r = r.multiplyScalar(Math.cos(ang)).addScaledVector(dn, Math.sin(ang)).normalize(); } }
  const u = new THREE.Vector3().crossVectors(r, T[i]).normalize();
  RT.push(r); UP.push(u);
}
for (let i = 0; i < N; i++) { CUM[i] = trackLen; trackLen += S[i].distanceTo(S[(i + 1) % N]); }
for (let i = 0; i < N; i++) {   // signed in-plane curvature (positive = turning left), from two samples ahead
  const j = (i + 2) % N, cr = new THREE.Vector3().crossVectors(T[i], T[j]);
  const ang = Math.atan2(cr.dot(UP[i]), T[i].dot(T[j])), ds = S[i].distanceTo(S[(i + 1) % N]) + S[(i + 1) % N].distanceTo(S[j]);
  KAPPA[i] = ang / Math.max(ds, 0.1);
}
{ let sm = new Float32Array(N); for (let i = 0; i < N; i++) { let acc = 0; for (let k = -2; k <= 2; k++) acc += KAPPA[(i + k + N) % N]; sm[i] = acc / 5; } KAPPA.set(sm); }
for (let i = 0; i < N; i++) if (Math.abs(KAPPA[i]) > 1 / 190 && LOOP[i] < 0 && ROLL[i] < 0) for (let k = -14; k <= 14; k++) KERB[(i + k + N) % N] = true;
const SPECIAL = i => LOOP[i] >= 0 || ROLL[i] >= 0 || JUMP[i];
// booster pads: arrows on the road; run-up to each jump, the start of the main straight, the back straight before the loops
const BOOST = new Array(N).fill(false), PADS = [];
{
  const addPads = (from, count, step) => { for (let k = 0; k < count; k++) { const i = (from + k * step + N) % N; PADS.push(i); for (let q = -1; q <= 1; q++) BOOST[(i + q + N) % N] = true; } };
  for (const J of JUMPS) addPads(J.i0 - 40, 6, 6);
  addPads(30, 4, 8);
  addPads(nearest(new THREE.Vector3(560, 0, -2000)) - 30, 5, 7);
}
const trackDistSq = (x, z) => { let best = 1e18, bi = 0; for (let i = 0; i < N; i++) { const dx = S[i].x - x, dz = S[i].z - z, d = dx * dx + dz * dz; if (d < best) { best = d; bi = i; } } return { d2: best, i: bi }; };
const basisQuat = (t, n) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(t, n, new THREE.Vector3().crossVectors(t, n)));
const frameAt = i => ({ p: S[i], t: T[i], b: RT[i], n: UP[i], yaw: Math.atan2(-T[i].z, T[i].x), quat: basisQuat(T[i], UP[i]) });
// interpolated frame at distance s along the track
const _sa = { p: new THREE.Vector3(), t: new THREE.Vector3(), b: new THREE.Vector3(), n: new THREE.Vector3(), i: 0, f: 0 };
function sampleAt(s) {
  s = ((s % trackLen) + trackLen) % trackLen;
  const fi = s / trackLen * N, i = Math.floor(fi) % N, j = (i + 1) % N, f = fi - Math.floor(fi);
  _sa.p.lerpVectors(S[i], S[j], f); _sa.t.lerpVectors(T[i], T[j], f).normalize(); _sa.b.lerpVectors(RT[i], RT[j], f);
  _sa.b.addScaledVector(_sa.t, -_sa.t.dot(_sa.b)).normalize(); _sa.n.crossVectors(_sa.b, _sa.t).normalize(); _sa.i = i; _sa.f = f; return _sa;
}
const D_WALL = ROAD_HALF + 2.4;   // boundary walls both sides, all the way round
const D_HIT = D_WALL - 1.2;       // the car's centre stops here: half a car width short of the wall face
const MASK_X0 = -3400, MASK_Z0 = -3700, MASK_W = 6800;   // world window covered by the underground mask and distance field
// mask of underground corridors (the grid floor and mirror are cut away there)
const maskTex = canvasTex(512, (ctx, sz) => {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, sz, sz); ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const px = v => (v.x - MASK_X0) / MASK_W * sz, pz = v => (v.z - MASK_Z0) / MASK_W * sz;
  ctx.beginPath(); let pen = false;
  for (let i = 0; i < N; i++) { const j = (i + 1) % N; if (UNDER[i] && UNDER[j]) { if (!pen) { ctx.moveTo(px(S[i]), pz(S[i])); pen = true; } ctx.lineTo(px(S[j]), pz(S[j])); } else pen = false; }
  ctx.stroke();
});
maskTex.wrapS = maskTex.wrapT = THREE.ClampToEdgeWrapping; maskTex.encoding = THREE.LinearEncoding;

// distance-to-track field on a 50 m grid (terrain flattening, prop placement)
const DF = { x0: -3400, z0: -3700, cell: 60, n: 114, v: null };
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
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uCar: { value: new THREE.Vector3() }, uTime: { value: 0 }, uMask: { value: null }, uGlow: { value: 0 } }]),
  vertexShader: `varying vec3 vW;
#include <fog_pars_vertex>
    void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
    }`,
  fragmentShader: `uniform vec3 uCar; uniform float uTime; uniform float uGlow; uniform sampler2D uMask; varying vec3 vW;
#include <fog_pars_fragment>
    float gridLine(vec2 p, float cell, float w){ vec2 q = p / cell; vec2 g = abs(fract(q - 0.5) - 0.5) / (fwidth(q) * w); return 1.0 - min(min(g.x, g.y), 1.0); }
    void main(){
      if (texture2D(uMask, (vW.xz + vec2(3400.0, 3700.0)) / 6800.0).r > 0.5) discard;
      float major = gridLine(vW.xz, 20.0, 1.6), minor = gridLine(vW.xz, 4.0, 1.2);
      vec3 base = vec3(0.012, 0.02, 0.045);
      vec3 cyan = vec3(0.18, 0.9, 1.0);
      float d = distance(vW.xz, uCar.xz);
      float glow = 2.2 / (1.0 + d * d * 0.09);
      float pulse = 0.85 + 0.15 * sin(uTime * 1.5 - vW.x * 0.01);
      vec3 gcol = mix(cyan, vec3(0.65, 0.3, 1.0), uGlow);
      vec3 col = base + cyan * (major * 1.35 * pulse + minor * 0.22) + gcol * glow * (0.45 + 1.2 * uGlow);
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
const mirror = new THREE.Reflector(new THREE.PlaneGeometry(7000, 7000, 96, 96), { textureWidth: 1024, textureHeight: 1024, color: 0x141c28, clipBias: 0.003 });   // subdivided: one giant quad z-fights the road at grazing angles
mirror.rotation.x = -Math.PI / 2; mirror.position.set(0, -0.08, -450); scene.add(mirror);
gridMat.uniforms.uMask.value = maskTex;
{ const mm = mirror.material; mm.uniforms.uMask = { value: maskTex };
  mm.vertexShader = mm.vertexShader.replace('void main() {', 'varying vec3 vWp;\nvoid main() {\n vWp = (modelMatrix * vec4(position, 1.0)).xyz;');
  mm.fragmentShader = mm.fragmentShader.replace('void main() {', 'uniform sampler2D uMask; varying vec3 vWp;\nvoid main() {\n if (texture2D(uMask, (vWp.xz + vec2(3400.0, 3700.0)) / 6800.0).r > 0.5) discard;');
  mm.needsUpdate = true; }

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
    if (JUMP[i] || (filter && !filter(i))) continue;
    const j = (i + 1) % N;
    const v0 = CUM[i] / texScaleV, v1 = (CUM[i] + S[i].distanceTo(S[j])) / texScaleV;
    for (const side of (inner === -outer ? [1] : [1, -1])) {
      const P = (k, off) => S[k].clone().addScaledVector(RT[k], side * off).addScaledVector(UP[k], yOff);
      const a = P(i, inner), b = P(i, outer), c = P(j, outer), d = P(j, inner);
      const ua = side > 0 ? 0 : 1, ub = side > 0 ? 1 : 0;
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
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
ribbon(ROAD_HALF + 1.1, D_WALL, 12, 0.03, null, null, 0x0b1220); // dark verge out to the wall

// scenery -------------------------------------------------------------
const scenery = new THREE.Group(); scene.add(scenery);
function instanced(geo, mat, items, shadow) {
  const im = new THREE.InstancedMesh(geo, mat, items.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
  items.forEach((it, k) => { if (it.quat) q.copy(it.quat); else { e.set(0, it.rot || 0, 0); q.setFromEuler(e); } s3.set(it.s || 1, it.sy || it.s || 1, it.s || 1); p3.set(it.x, it.y || 0, it.z); m4.compose(p3, q, s3); im.setMatrixAt(k, m4); });
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
{ // light beacons along the circuit (not underground)
  const beacons = [];
  for (let i = 0; i < N; i += 28) { if (UNDER[i] || SPECIAL(i)) continue; const side = (i / 28) % 2 ? 1 : -1, p = S[i].clone().addScaledVector(RT[i], side * 22); beacons.push({ x: p.x, y: p.y, z: p.z, s: 1, sy: 1 + rnd() * 0.6 }); }
  instanced(new THREE.BoxGeometry(0.35, 9, 0.35).translate(0, 4.5, 0), new THREE.MeshBasicMaterial({ color: 0x2ee6ff, toneMapped: false }), beacons, false);
}
// ---------------------------------------------------------------- track architecture: tunnels, gates, canyon, bridges, floating grid solids
const inRanges = (i, ranges) => ranges.some(([a, b]) => i >= a && i <= b);
// tunnels go where the track bends most: three non-overlapping 150-sample windows of highest turning, off the main straight
const TUNNELS = (() => {
  const turn = new Float32Array(N); for (let i = 0; i < N; i++) turn[i] = Math.abs(KAPPA[i]);
  const LEN = 150, cand = [], out = [];
  { let best = [0, -1], cur = -1; for (let i = 0; i <= N; i++) { if (i < N && UNDER[i]) { if (cur < 0) cur = i; } else if (cur >= 0) { if (i - cur > best[1] - best[0]) best = [cur, i - 1]; cur = -1; } } if (best[1] > 0) out.push([Math.max(0, best[0] - 8), Math.min(N - 1, best[1] + 8)]); }   // longest underground run only
  for (let i = 230; i < N - 230 - LEN; i += 5) { if (out.some(([a, b]) => i < b + 60 && i + LEN > a - 60)) continue; let bad = false, sum = 0; for (let k = 0; k < LEN; k++) { if (SPECIAL(i + k) || UNDER[i + k]) bad = true; sum += turn[i + k]; } if (!bad) cand.push([sum, i]); }
  cand.sort((x, y) => y[0] - x[0]);
  for (const [, i] of cand) { if (out.every(([a, b]) => i > b + 60 || i + LEN < a - 60)) out.push([i, i + LEN]); if (out.length === 3) break; }
  return out.sort((x, y) => x[0] - y[0]);
})();
const CANYON = [[N - 240, N - 40]];   // home straight
const neonMat = new THREE.MeshBasicMaterial({ color: 0x2ee6ff, toneMapped: false });
const neonWhite = new THREE.MeshBasicMaterial({ color: 0xdff8ff, toneMapped: false });
const shellMat = new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 0.55, metalness: 0.4, side: THREE.DoubleSide });
{ // tunnels: rounded-rectangle shell (superellipse) with two continuous shoulder light bands and a white ceiling strip,
  // slim raked fins every ~9 m, thick white portal at each mouth, one soft light in the middle of each
  const seamTex = canvasTex(512, (ctx, s) => {
    ctx.fillStyle = '#04070e'; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#0c1a2c'; ctx.lineWidth = 2; for (let x = 0; x < s; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, s); ctx.stroke(); } for (let y = 0; y < s; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke(); }
    ctx.fillStyle = '#2ee6ff'; for (const u of [0.2, 0.8]) ctx.fillRect(u * s - 4, 0, 8, s);
    ctx.fillStyle = '#eafcff'; ctx.fillRect(0.5 * s - 2, 0, 4, s);
  });
  const SEG = 22, W = 9.6, H = 6.4, E = 2 / 3.6;
  const arc = [];
  for (let k = 0; k <= SEG; k++) { const a = Math.PI * (1 - k / SEG), c = Math.cos(a), si = Math.sin(a); arc.push([W * Math.sign(c) * Math.pow(Math.abs(c), E), H * Math.pow(Math.max(0, si), E)]); }
  const pos = [], uv = [];
  for (const [i0, i1] of TUNNELS) for (let i = i0; i < i1; i++) {
    const A = frameAt(i), B = frameAt(i + 1), v0 = CUM[i] / 12, v1 = (CUM[i] + S[i].distanceTo(S[i + 1])) / 12;
    for (let k = 0; k < SEG; k++) {
      const p = (f, q) => f.p.clone().addScaledVector(f.b, q[0]).addScaledVector(f.n, q[1]);
      const a = p(A, arc[k]), b = p(A, arc[k + 1]), c = p(B, arc[k + 1]), d = p(B, arc[k]);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
      const u0 = k / SEG, u1 = (k + 1) / SEG; uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
  const tunnel = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: seamTex, emissiveMap: seamTex, emissive: 0xffffff, emissiveIntensity: 1.6, color: 0x7f8fa6, roughness: 0.35, metalness: 0.5, side: THREE.DoubleSide })); tunnel.receiveShadow = true; scene.add(tunnel);
  const path = new THREE.CatmullRomCurve3(arc.map(q => new THREE.Vector3(0, q[1] + 0.12, q[0])));   // fins live in the (right, up) plane; instances carry the full road frame
  const finGeo = new THREE.TubeGeometry(path, 48, 0.09, 6, false), portalGeo = new THREE.TubeGeometry(path, 48, 0.35, 8, false);
  finGeo.applyMatrix4(new THREE.Matrix4().set(1, 0.32, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1));   // rake: lean the fin forward with height
  const fins = [], portals = [];
  for (const [i0, i1] of TUNNELS) {
    for (let i = i0 + 3; i < i1 - 3; i += 3) { const f = frameAt(i); fins.push({ x: f.p.x, y: f.p.y, z: f.p.z, quat: f.quat }); }
    for (const i of [i0, i1]) { const f = frameAt(i); portals.push({ x: f.p.x, y: f.p.y, z: f.p.z, quat: f.quat }); }
    const m = frameAt(Math.floor((i0 + i1) / 2)), l = new THREE.PointLight(0x9fe8ff, 1.2, 160, 1.6); l.position.copy(m.p).addScaledVector(m.n, 4.5); scene.add(l);
  }
  instanced(finGeo, neonMat, fins, false); instanced(portalGeo, neonWhite, portals, false);
}
{ // jump lips: white bars across the road at take-off and landing
  const bars = [];
  for (const J of JUMPS) for (const i of [J.i0 - 1, J.i1 + 1]) { const f = frameAt(i); bars.push({ x: f.p.x, y: f.p.y, z: f.p.z, quat: f.quat }); }
  instanced(new THREE.BoxGeometry(0.5, 0.3, ROAD_HALF * 2 + 1).translate(0, 0.15, 0), neonWhite, bars, false);
}
const boostMat = new THREE.MeshBasicMaterial({ color: 0x2ee6ff, toneMapped: false, transparent: true, opacity: 0.95 });
{ // booster arrows lying on the road, pointing along it
  const sh = new THREE.Shape(); [[0, -1.2], [2.6, -1.2], [2.6, -2.4], [5.2, 0], [2.6, 2.4], [2.6, 1.2], [0, 1.2]].forEach(([x, y], k) => k ? sh.lineTo(x, y) : sh.moveTo(x, y)); sh.closePath();
  const geo = new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2).translate(-2.6, 0.08, 0);
  const items = PADS.map(i => { const f = frameAt(i); return { x: f.p.x, y: f.p.y, z: f.p.z, quat: f.quat }; });
  instanced(geo, boostMat, items, false);
}
{ // canyon on the approach to the main straight: tall dark walls with vertical light seams and a lit top edge
  const wallTex = canvasTex(256, (ctx, s) => { ctx.fillStyle = '#060a12'; ctx.fillRect(0, 0, s, s); ctx.fillStyle = '#2ee6ff'; ctx.fillRect(0, 0, s, 5); for (let x = 0; x < s; x += 64) { ctx.globalAlpha = 0.9; ctx.fillRect(x + 30, 0, 3, s); } });
  const pos = [], uv = [];
  for (const [i0, i1] of CANYON) for (let i = i0; i < i1; i++) for (const side of [1, -1]) {
    const A = frameAt(i), B = frameAt(i + 1), off = ROAD_HALF + 12, h = 14;
    const a = A.p.clone().addScaledVector(A.b, side * off), b = B.p.clone().addScaledVector(B.b, side * off), a2 = a.clone().addScaledVector(A.n, h), b2 = b.clone().addScaledVector(B.n, h);
    const v0 = CUM[i] / 8, v1 = (CUM[i] + 3.6) / 8;
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, b2.x, b2.y, b2.z, a.x, a.y, a.z, b2.x, b2.y, b2.z, a2.x, a2.y, a2.z);
    uv.push(v0, 1, v1, 1, v1, 0, v0, 1, v1, 0, v0, 0);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
  const wall = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: wallTex, emissiveMap: wallTex, emissive: 0xffffff, emissiveIntensity: 1.4, color: 0x8899aa, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide })); scene.add(wall);
  // bridges across the canyon
  const bridges = []; for (let i = CANYON[0][0] + 20; i < CANYON[0][1] - 10; i += 40) { const f = frameAt(i); bridges.push({ x: f.p.x, y: f.p.y, z: f.p.z, quat: f.quat }); }
  instanced(new THREE.BoxGeometry(3, 1.2, 40).translate(0, 9, 0), shellMat, bridges, true);
  instanced(new THREE.BoxGeometry(0.3, 0.1, 40).translate(0, 8.35, 0), neonMat, bridges, false);
}
{ // boundary light-walls both sides all the way round (the physics wall sits at D_WALL), posts every ~4 m
  const wallTex = canvasTex(64, (ctx, sz) => { ctx.fillStyle = '#06101c'; ctx.fillRect(0, 0, sz, sz); ctx.fillStyle = '#2ee6ff'; ctx.fillRect(0, 0, sz, 7); ctx.fillStyle = '#0a6a90'; ctx.fillRect(0, sz - 4, sz, 4); });
  const pos = [], uv = [], posts = [];
  let acc = 0;
  for (let i = 0; i < N; i++) {
    if (JUMP[i]) continue;
    const j = (i + 1) % N, A = frameAt(i), B = frameAt(j);
    for (const side of [1, -1]) {
      const a = A.p.clone().addScaledVector(A.b, side * D_WALL), b = B.p.clone().addScaledVector(B.b, side * D_WALL);
      const a0 = a.clone().addScaledVector(A.n, 0.25), a1 = a.clone().addScaledVector(A.n, 0.95), b0 = b.clone().addScaledVector(B.n, 0.25), b1 = b.clone().addScaledVector(B.n, 0.95);
      pos.push(a0.x, a0.y, a0.z, b0.x, b0.y, b0.z, b1.x, b1.y, b1.z, a0.x, a0.y, a0.z, b1.x, b1.y, b1.z, a1.x, a1.y, a1.z);
      uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
      if (side > 0) { acc += S[i].distanceTo(S[j]); }
      if (acc > 4 && side < 0) { acc = 0; for (const sd of [1, -1]) { const q = A.p.clone().addScaledVector(A.b, sd * D_WALL); posts.push({ x: q.x, y: q.y, z: q.z, quat: A.quat }); } }
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
  const wall = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: wallTex, emissiveMap: wallTex, emissive: 0xffffff, emissiveIntensity: 1.3, metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })); wall.receiveShadow = true; scene.add(wall);
  instanced(new THREE.BoxGeometry(0.12, 1.0, 0.12).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x0a1626, metalness: 0.6, roughness: 0.5 }), posts, false);
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
  gantry.position.copy(S[0]); gantry.quaternion.copy(frameAt(0).quat); scene.add(gantry);
}
// ---------------------------------------------------------------- signage: large animated screens on slim pylons, facing oncoming traffic
const signs = [];
{
  const SIGNS = [
    { idx: Math.floor(N * 0.028), side: -1, w: 32, h: 9.5, lines: ['CORE FOCUS PRODUCTIONS', 'THE FORGE · VICE · VULTURE · BOWOTTO'], accent: '#2ee6ff' },
    { idx: Math.floor(N * 0.06), side: 1, w: 26, h: 9.5, lines: ['CTX2-X', 'COMING SOON'], accent: '#ff8a2a', blink: 1 },
    { idx: Math.floor(N * 0.41), side: -1, w: 32, h: 9.5, lines: ['ORION VST PLUG-IN SUITE', 'NOVEMBER'], accent: '#9fe8ff', blink: 1 },
    { idx: Math.floor(N * 0.985), side: 1, w: 32, h: 9.5, lines: ['CORE FOCUS PRODUCTIONS', 'REVUELTO · THE GRID'], accent: '#2ee6ff' },
    { idx: Math.floor(N * 0.044), side: 1, w: 30, h: 15.2, poster: true, lines: ['COREZ'], accent: '#dff8ff' },
  ];
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x0a1220, metalness: 0.7, roughness: 0.35 });
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0x2ee6ff, toneMapped: false });
  const posterImg = document.getElementById('revuelto-poster'), posterVid = document.getElementById('revuelto-poster-video');
  for (const d of SIGNS) {
    const f = frameAt(d.idx), g = new THREE.Group();
    g.position.copy(S[d.idx]).addScaledVector(RT[d.idx], d.side * 17).addScaledVector(UP[d.idx], 5 + d.h / 2);
    g.quaternion.copy(f.quat); g.rotateY(Math.PI + d.side * 0.35);       // face back down the track, angled toward the road
    const cw = 2048, ch = Math.round(2048 * d.h / d.w);
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const ctx = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = maxAniso;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    screen.position.z = 0; screen.rotation.y = Math.PI / 2; g.add(screen);   // plane faces +x of the group; group's +x is the road direction
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.4, d.h + 0.6, d.w + 0.6), frameMat); bezel.position.x = -0.25; g.add(bezel);
    for (const sy of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, d.w + 0.6), edgeMat); e.position.set(0.02, sy * (d.h / 2 + 0.26), 0); g.add(e); }
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.8, 5 + d.h / 2, 1.2), frameMat); pylon.position.set(-0.3, -(d.h / 2) - (5 + d.h / 2) / 2 + 0.2, 0); g.add(pylon);
    scene.add(g);
    let img = null;
    if (d.poster && posterImg && posterImg.getAttribute('src')) { img = new Image(); img.src = posterImg.getAttribute('src'); }
    signs.push({ d, cv, ctx, tex, img, vid: d.poster ? posterVid : null, group: g });
  }
  const fit = (ctx, text, maxW, px, weight, family) => { let size = px; do { ctx.font = `${weight} ${size}px ${family}`; if (ctx.measureText(text).width <= maxW) break; size -= 4; } while (size > 20); return size; };
  function drawSign(sg, t) {
    const { d, cv, ctx } = sg, W = cv.width, H = cv.height;
    ctx.fillStyle = '#030710'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(46,230,255,0.25)'; ctx.lineWidth = 2; for (let x = 0; x < W; x += 128) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    if (d.poster) {
      const v = sg.vid;
      if (v && v.readyState >= 2 && v.videoWidth) { const r = Math.min(W / v.videoWidth, H / v.videoHeight), iw = v.videoWidth * r, ih = v.videoHeight * r; ctx.drawImage(v, (W - iw) / 2, (H - ih) / 2, iw, ih); if (v.paused) v.play().catch(() => {}); }
      else if (sg.img && sg.img.complete && sg.img.naturalWidth) { const r = Math.min(W / sg.img.naturalWidth, H / sg.img.naturalHeight), iw = sg.img.naturalWidth * r, ih = sg.img.naturalHeight * r; ctx.drawImage(sg.img, (W - iw) / 2, (H - ih) / 2, iw, ih); }
      else { ctx.fillStyle = d.accent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; fit(ctx, d.lines[0], W * 0.8, 260, '700', 'Orbitron, Bahnschrift, Arial'); ctx.fillText(d.lines[0], W / 2, H * 0.45); ctx.font = '600 70px "Barlow Condensed", Arial Narrow, Arial'; ctx.fillStyle = 'rgba(223,248,255,0.7)'; ctx.fillText('COMING SOON', W / 2, H * 0.62); }
    } else {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const pulse = 0.75 + 0.25 * Math.sin(t * 2.2);
      ctx.shadowColor = d.accent; ctx.shadowBlur = 40 * pulse;
      ctx.fillStyle = '#eafcff'; fit(ctx, d.lines[0], W * 0.9, 300, '700', 'Orbitron, Bahnschrift, Arial'); ctx.fillText(d.lines[0], W / 2, H * 0.4);
      const show = !d.blink || Math.floor(t * 1.6) % 2 === 0;
      if (show && d.lines[1]) { ctx.fillStyle = d.accent; fit(ctx, d.lines[1], W * 0.85, 150, '600', '"Barlow Condensed", Orbitron, Arial Narrow, Arial'); ctx.fillText(d.lines[1], W / 2, H * 0.76); }
      ctx.shadowBlur = 0;
      const sx = ((t * 0.35) % 1.4 - 0.2) * W;   // light sweep
      const gr = ctx.createLinearGradient(sx - 200, 0, sx + 200, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr; ctx.fillRect(sx - 200, 0, 400, H);
    }
    ctx.fillStyle = d.accent; ctx.fillRect(0, 0, W, 6); ctx.fillRect(0, H - 6, W, 6);
    sg.tex.needsUpdate = true;
  }
  signs.forEach(sg => drawSign(sg, 0));
  if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('700 100px Orbitron'), document.fonts.load('600 100px "Barlow Condensed"')]).then(() => signs.forEach(sg => drawSign(sg, 0))).catch(() => {});
  let signTick = 0;
  window.__setPoster = f => {
    const sg = signs.find(x => x.d.poster); if (!sg) return; const url = URL.createObjectURL(f);
    if (/^video\//.test(f.type)) { const v = document.createElement('video'); v.muted = true; v.loop = true; v.playsInline = true; v.src = url; v.play().catch(() => {}); sg.vid = v; flash('POSTER CLIP LOADED', 1500); }
    else { const im = new Image(); im.onload = () => { sg.img = im; sg.vid = null; flash('POSTER LOADED', 1500); }; im.src = url; }
  };
  window.__signAnimate = now => { const t = now / 1000; const live = now - signTick >= 90; if (live) signTick = now; signs.forEach(sg => { if (live || (sg.vid && !sg.vid.paused)) drawSign(sg, t); }); };   // a playing clip redraws every frame, text boards at ~11 fps
}

// ------------------------------------------------------------------ car// ------------------------------------------------------------------ car
let paintIdx = 1;
// TRON LEGACY paint: a living hologram. Patterns are computed in car space so they flow over the bodywork.
const tronMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uCarInv: { value: new THREE.Matrix4() } },
  vertexShader: `uniform mat4 uCarInv; varying vec3 vL; varying vec3 vN; varying vec3 vV; varying float vWy;
    void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vL = (uCarInv * wp).xyz; vWy = wp.y; vN = normalize(normalMatrix * normal); vec4 mv = viewMatrix * wp; vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform float uTime; varying vec3 vL; varying vec3 vN; varying vec3 vV; varying float vWy;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
    float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int k = 0; k < 5; k++) { s += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
    void main(){
      float t = uTime; vec3 L = vL;
      float n1 = fbm(L.xz * 1.6 + vec2(t * 0.30, 0.0) + L.y * 0.8);
      float n2 = fbm(L.xy * 2.4 - vec2(0.0, t * 0.22) + L.z * 0.5);
      float field = smoothstep(0.30, 0.78, n1 * 0.6 + n2 * 0.6);
      float ridge = 1.0 - abs(2.0 * fbm(L.xz * 3.0 + t * 0.15) - 1.0); ridge = pow(ridge, 6.0);   // fractal filaments
      vec2 g1 = abs(fract(L.xz * 4.0 + vec2(t * 0.5, 0.0)) - 0.5); float grid = 1.0 - smoothstep(0.0, 0.07, min(g1.x, g1.y));
      vec2 g2 = abs(fract(L.xy * 6.0 - vec2(0.0, t * 0.35)) - 0.5); float grid2 = 1.0 - smoothstep(0.0, 0.05, min(g2.x, g2.y));
      vec2 h = L.xz * 3.0; vec2 hx = vec2(h.x + h.y * 0.5, h.y * 0.866); float hexs = 1.0 - smoothstep(0.0, 0.08, min(abs(fract(hx.x) - 0.5), abs(fract(hx.y) - 0.5)));
      float pulse = smoothstep(0.03, 0.0, abs(fract(L.x * 0.30 - t * 0.8) - 0.5));
      float pulse2 = smoothstep(0.02, 0.0, abs(fract(L.z * 0.9 + t * 0.5) - 0.5)) * 0.4;
      float fres = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 2.4);
      vec3 base = mix(vec3(0.012, 0.05, 0.20), vec3(0.06, 0.30, 0.70), field);
      vec3 cyan = vec3(0.25, 0.90, 1.0), white = vec3(0.9, 1.0, 1.0);
      vec3 col = base + cyan * (grid * 0.30 * field + grid2 * 0.22 + hexs * 0.18 * (1.0 - field)) + cyan * ridge * 0.9 + white * pulse * 0.8 + cyan * pulse2 + cyan * fres * 1.5 + white * pow(field, 7.0) * 0.6;
      col *= 0.92 + 0.08 * sin(vWy * 160.0 + t * 28.0);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
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
car.add(glowDisc);
const procBody = new THREE.Group(); procBody.rotation.y = Math.PI; bodyGroup.add(procBody);   // procedural Revuelto (loft is built nose = -x, flipped so nose = +x)
const wheels = [];                                                 // {steer: Group, spin: Group, r, front}
{
  const last = RINGS.length - 1;
  for (let j = 0; j < 8; j++) {
    const cuts = [0, ...(SPLITS[j] || []), last];
    for (let c = 0; c < cuts.length - 1; c++) {
      const m = new THREE.Mesh(buildStrip(j, cuts[c], cuts[c + 1]), glassStrip(j, cuts[c]) ? glassMat : paintMat);
      if (!glassStrip(j, cuts[c])) { m.userData.paint = true; m.userData.origMat = paintMat; }
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
// CORE FOCUS PRODUCTIONS livery: stickers all over a graphite base, drawn once the display font is in
function drawLivery(ctx, sz) {
  ctx.fillStyle = '#20242d'; ctx.fillRect(0, 0, sz, sz);
  // carbon weave
  ctx.fillStyle = 'rgba(255,255,255,0.035)'; for (let y = 0; y < sz; y += 8) for (let x = ((y / 8) % 2) * 4; x < sz; x += 8) ctx.fillRect(x, y, 4, 4);
  // two racing slashes, cyan and orange
  ctx.save(); ctx.translate(sz / 2, sz / 2); ctx.rotate(-0.55); ctx.fillStyle = '#2ee6ff'; ctx.fillRect(-sz, -sz * 0.06, sz * 2, sz * 0.035); ctx.fillStyle = '#ff7a00'; ctx.fillRect(-sz, -sz * 0.015, sz * 2, sz * 0.012); ctx.restore();
  const badge = (x, y, sc, rot, col) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc);
    // angular plate, cut corners, glowing edge
    ctx.beginPath(); ctx.moveTo(-210, -62); ctx.lineTo(180, -62); ctx.lineTo(210, -30); ctx.lineTo(210, 62); ctx.lineTo(-180, 62); ctx.lineTo(-210, 30); ctx.closePath();
    ctx.fillStyle = 'rgba(4,8,14,0.92)'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 22; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-200, -52); ctx.lineTo(-150, -52); ctx.lineTo(-170, -30); ctx.lineTo(-200, -30); ctx.closePath(); ctx.fill();   // corner wedge
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.save(); ctx.transform(1.08, 0, -0.16, 1, 0, 0);
    ctx.font = '900 62px Orbitron, Bahnschrift, Arial Black, sans-serif'; ctx.fillStyle = '#f4f1ea'; ctx.shadowColor = col; ctx.shadowBlur = 12; ctx.fillText('CORE FOCUS', 0, -16);
    ctx.font = '700 24px Orbitron, Bahnschrift, Arial, sans-serif'; ctx.fillStyle = col; ctx.shadowBlur = 8; ctx.fillText('P R O D U C T I O N S', 6, 34); ctx.restore();
    ctx.fillStyle = col; ctx.fillRect(-120, 12, 240, 2.5);
    ctx.restore();
  };
  const mono = (x, y, sc, rot, col) => { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 70px Orbitron, Bahnschrift, Arial Black, sans-serif'; ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 16; ctx.fillText('CFP', 0, 0); ctx.restore(); };
  let sd = 7; const r = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
  // the body's UVs put about 2.5 m across one tile, so a sticker has to be big to read at speed: two large badges,
  // two monograms and four small badges per tile
  const q = sz / 4;
  badge(q + (r() - 0.5) * 120, q + (r() - 0.5) * 120, 2.3, (r() - 0.5) * 0.5, '#2ee6ff');
  badge(3 * q + (r() - 0.5) * 120, 3 * q + (r() - 0.5) * 120, 2.3, (r() - 0.5) * 0.5, '#ff7a00');
  mono(3 * q, q, 2.2, (r() - 0.5) * 0.6, '#2ee6ff'); mono(q, 3 * q, 2.2, (r() - 0.5) * 0.6, '#f4f1ea');
  badge(2 * q, q * 0.45, 1.1, (r() - 0.5) * 0.6, '#f4f1ea'); badge(2 * q, q * 3.55, 1.1, (r() - 0.5) * 0.6, '#2ee6ff');
  badge(q * 0.45, 2 * q, 1.1, 1.3 + (r() - 0.5) * 0.4, '#ff7a00'); badge(q * 3.55, 2 * q, 1.1, -1.3 + (r() - 0.5) * 0.4, '#2ee6ff');
}
const liveryTex = canvasTex(2048, drawLivery); liveryTex.anisotropy = maxAniso;
if (document.fonts && document.fonts.load) document.fonts.load('900 62px Orbitron').then(() => { drawLivery(liveryTex.image.getContext('2d'), 2048); liveryTex.needsUpdate = true; }).catch(() => {});
// the body panels carry no UVs, so the livery is projected in car space: sides, ends and roof each get a planar map
function liveryMaterial(src) {
  const m = src.clone(); m.map = liveryTex; m.color.setHex(0xffffff); m.envMap = cubeRT.texture; m.metalness = 0.25; m.roughness = 0.42; m.envMapIntensity = 0.7;
  m.onBeforeCompile = sh => {
    sh.uniforms.uCarInv = tronMat.uniforms.uCarInv;
    sh.vertexShader = 'uniform mat4 uCarInv;\n' + sh.vertexShader.replace('#include <uv_vertex>', `
      vec4 cl = uCarInv * modelMatrix * vec4(position, 1.0);
      vec3 cn = normalize(mat3(uCarInv * modelMatrix) * normal);
      float k = 0.4;
      if (abs(cn.y) > 0.6) vUv = cl.xz * k;
      else if (abs(cn.z) >= abs(cn.x)) vUv = vec2(cn.z > 0.0 ? cl.x : -cl.x, cl.y) * k;
      else vUv = vec2(cn.x > 0.0 ? -cl.z : cl.z, cl.y) * k;
    `);
  };
  m.customProgramCacheKey = () => 'livery';
  return m;
}
function setPaint(i) {
  paintIdx = (i + PAINTS.length) % PAINTS.length;
  const P = PAINTS[paintIdx];
  if (!P.shader) paintMat.color.setHex(P.hex);
  $('paint-name').textContent = P.name; if (typeof roofClip !== 'undefined') setTimeout(applyRoofClip, 0);
  document.querySelectorAll('#paints button').forEach(b => b.classList.toggle('on', +b.dataset.p === paintIdx));
  (customModel || procBody).traverse(o => {
    if (!(o.isMesh && o.userData.paint)) return;
    if (P.shader) { o.material = tronMat; return; }                          // living hologram paint
    if (P.original) { o.material = o.userData.origMat; return; }             // the author's own paint, untouched
    if (P.livery) { if (!o.userData.livMat) o.userData.livMat = liveryMaterial(o.userData.origMat); o.material = o.userData.livMat; return; }
    if (!o.userData.tintMat) { o.userData.tintMat = o.userData.origMat.clone(); o.userData.tintMat.map = null; o.userData.tintMat.envMap = cubeRT.texture; o.userData.tintMat.metalness = 0.25; o.userData.tintMat.roughness = 0.34; o.userData.tintMat.envMapIntensity = 0.8; }
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
  fitPlates(); setPaint(paintIdx); applyRoofClip();
  rivalTemplate = null; for (const a of ai) buildRivalVisual(a);
  if (name !== 'embedded') flash('MODEL LOADED', 1800);
}
function loadGLBBuffer(buf, name) {
  // sandboxed pages refuse blob: URLs; without createImageBitmap the loader uses <img src="data:..."> instead
  try { window.createImageBitmap = undefined; } catch (e) {}
  try { new THREE.GLTFLoader().parse(buf, '', g => installModel(g.scene, name), e => { console.error(e); flash('MODEL FAILED', 2000); }); }
  catch (e) { console.error(e); flash('MODEL FAILED', 2000); }
}
window.addEventListener('dragover', e => { e.preventDefault(); $('drop').classList.add('on'); });
window.addEventListener('dragleave', () => $('drop').classList.remove('on'));
window.addEventListener('drop', e => {
  e.preventDefault(); $('drop').classList.remove('on');
  const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (!f) return;
  if (/^image\//.test(f.type) || /^video\//.test(f.type)) { window.__setPoster && window.__setPoster(f); return; }   // a picture or a clip lands on the COREZ board
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
let trailOn = false; trailMesh.visible = false;
const trailColor = new THREE.Color(0x2ee6ff);
function trailReset() { trail.count = 0; trail.head = 0; trailGeo.setDrawRange(0, 0); }
function trailUpdate() {
  if (!trailOn) return;
  const q = st.pos.clone().addScaledVector(st.fwd, -2.3), x = q.x, z = q.z;
  const gap = Math.hypot(x - trail.lastX, z - trail.lastZ);
  if (gap > 25) { trailReset(); trail.lastX = x; trail.lastZ = z; }              // teleport / reset: start a fresh ribbon
  else if (Math.abs(st.u) > 1.5 && gap > 0.7) {
    trail.pts[trail.head] = { x, z, y: q.y, ux: st.up.x, uy: st.up.y, uz: st.up.z }; trail.head = (trail.head + 1) % TRAIL_N; trail.count = Math.min(trail.count + 1, TRAIL_N); trail.lastX = x; trail.lastZ = z;
  }
  const P = trailGeo.attributes.position.array, C = trailGeo.attributes.color.array;
  for (let k = 0; k < trail.count; k++) {
    const p = trail.pts[(trail.head - trail.count + k + TRAIL_N) % TRAIL_N], f = Math.pow(k / Math.max(1, trail.count - 1), 1.6);
    const o = k * 6; P[o] = p.x + p.ux * 0.3; P[o + 1] = p.y + p.uy * 0.3; P[o + 2] = p.z + p.uz * 0.3; P[o + 3] = p.x + p.ux * 1.05; P[o + 4] = p.y + p.uy * 1.05; P[o + 5] = p.z + p.uz * 1.05;
    const b = 0.04 + 0.96 * f; C[o] = C[o + 3] = trailColor.r * b; C[o + 1] = C[o + 4] = trailColor.g * b; C[o + 2] = C[o + 5] = trailColor.b * b;
  }
  trailGeo.attributes.position.needsUpdate = true; trailGeo.attributes.color.needsUpdate = true;
  trailGeo.setDrawRange(0, Math.max(0, (trail.count - 1) * 6));
}

// ------------------------------------------------------------------ state
const st = {
  s: 0, d: 0, psi: 0, u: 0, w: 0, yaw: 0,             // track coordinates: distance along, offset right, heading vs tangent; body-frame velocity
  x: 0, y: 0, z: 0, theta: 0, pos: new THREE.Vector3(), fwd: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), right: new THREE.Vector3(0, 0, 1),
  hits: 0, hitT: 0, crossings: 0, lapsDone: 0, spinT: 0, spinW: 0, boostT: 0, boostCd: 0, glow: 0, nos: 1, nosOn: false, air: false, vel: new THREE.Vector3(), airT: 0, resets: 0,
  steer: 0, throttle: 0, brake: 0, hand: false,
  gear: 0, rpm: CAR.idle, shiftT: 0, auto: true, reverse: false,
  mode: 1, cam: 0, offroad: false, slip: 0, aLat: 0, aLong: 0, delta: 0,
  sound: true, started: false, vmax: 0, record: 0, recordPend: false,
  lapStart: null, lapLast: null, lapBest: null, lastP: 0, halfSeen: false, trackIdx: 0,
};
try { const b = localStorage.getItem('revuelto.best'); if (b) st.lapBest = +b; const r = localStorage.getItem('revuelto.vmax'); if (r) st.record = +r; } catch (e) {}
function placeOnTrack(idx) {
  const racing = GAME.state === 'racing';
  if (racing && st.lastP < 0.08 && idx / N > 0.92) { st.crossings = Math.max(0, st.crossings - 1); st.lapsDone = Math.max(0, st.lapsDone - 1); }   // put back behind the line: that crossing is owed again
  st.s = CUM[idx]; st.d = 0; st.psi = 0; syncPose(); st.lastP = idx / N;   // no phantom lap when resetting near the line
  st.u = st.w = st.yaw = 0; st.air = false; st.airT = 0; st.gear = 0; st.rpm = CAR.idle; st.reverse = false; st.spinT = 0;
  if (!racing) { st.lapStart = null; st.halfSeen = false; }               // mid-race the lap keeps running: a reset costs time, not the lap
  if (typeof trailReset === 'function') trailReset();
  st.snapCam = true;
}
// world pose from track coordinates
function syncPose() {
  const fr = sampleAt(st.s), cp = Math.cos(st.psi), sp = Math.sin(st.psi);
  st.pos.copy(fr.p).addScaledVector(fr.b, st.d);
  st.fwd.copy(fr.t).multiplyScalar(cp).addScaledVector(fr.b, sp).normalize();
  st.up.copy(fr.n); st.right.crossVectors(st.fwd, st.up);
  st.x = st.pos.x; st.y = st.pos.y; st.z = st.pos.z; st.theta = Math.atan2(-st.fwd.z, st.fwd.x); st.trackIdx = fr.i;
}

// ------------------------------------------------------------------ game modes · rivals · race control
// SOLO is the open track. TIME TRIAL is a standing start and a lap count. VERSUS adds three AI Lamborghinis on a grid
// with full contact: shoves, tailgating and a badly judged hit that spins whoever got it wrong.
const GAME = { mode: 'solo', laps: 3, diff: 1, state: 'free', cd: 0, cdShown: -1, startT: 0, finishT: null, lapTimes: [], resultsAt: 0, order: [] };
const DIFFS = [   // rival pace: cornering and straight-line multipliers, the rubber band's reach, and how hard they lean on you
  { name: 'EASY', skill: 0.86, vmax: 86, band: [0.84, 1.03] },
  { name: 'MEDIUM', skill: 0.95, vmax: 92, band: [0.90, 1.07] },
  { name: 'HARD', skill: 1.02, vmax: 96, band: [0.95, 1.10] },
  { name: 'IMPOSSIBLE', skill: 1.12, vmax: 101, band: [1.0, 1.16] },
];
const RIVALS = [
  { name: 'MANTIS', hex: 0x30d21c, skill: 0.985, lane: -1 },   // Verde Mantis
  { name: 'INTI', hex: 0xffc400, skill: 0.965, lane: 1 },      // Giallo Inti
  { name: 'LE MANS', hex: 0x2452ff, skill: 0.945, lane: 0 },   // Blu Le Mans
];
// the rivals' speed limit per sample: cornering grip, then a backward pass so every braking zone is baked in
const VLIM = new Float32Array(N);
{
  const AI_MU = 1.30, AI_VMAX = 96, AI_BRAKE = 12.5;
  for (let i = 0; i < N; i++) VLIM[i] = Math.min(AI_VMAX, Math.sqrt(AI_MU * G / Math.max(Math.abs(KAPPA[i]), 1e-5)));
  for (let pass = 0; pass < 2; pass++) for (let i = N - 1; i >= 0; i--) { const j = (i + 1) % N, ds = S[i].distanceTo(S[j]); VLIM[i] = Math.min(VLIM[i], Math.sqrt(VLIM[j] * VLIM[j] + 2 * AI_BRAKE * ds)); }
}
const ai = [];
const fwdGap = (sA, sB) => { let ds = sA - sB; ds -= trackLen * Math.round(ds / trackLen); return ds; };   // how far A is ahead of B along the track
const progressOf = o => o.crossings * trackLen + o.s;
function cloneTree(o) {
  let c;
  if (o.isMesh) { c = new THREE.Mesh(o.geometry, o.material); c.castShadow = false; c.receiveShadow = o.receiveShadow; }
  else c = new THREE.Group();
  c.name = o.name; c.rotation.order = o.rotation.order; c.position.copy(o.position); c.quaternion.copy(o.quaternion); c.scale.copy(o.scale); c.visible = o.visible;
  for (const ch of o.children) c.add(cloneTree(ch));
  return c;
}
// the rivals share one merged copy of the car: every mesh outside the wheels, baked into car space as float geometry
// and merged per material, so a rival is ~60 draw calls instead of ~850. The wheels stay separate so they can turn.
let rivalTemplate = null;
const WHEEL_RE = /wheel[_ -]?(fl|fr|rl|rr)/i;
function floatGeo(g, matrix) {
  const out = new THREE.BufferGeometry();
  const conv = (attr, item) => {
    const n = attr.count, a = new Float32Array(n * item), T = attr.array ? attr.array.constructor : Float32Array;
    const div = attr.normalized ? (T === Int8Array ? 127 : T === Uint8Array ? 255 : T === Int16Array ? 32767 : T === Uint16Array ? 65535 : 1) : 1;
    for (let i = 0; i < n; i++) { a[i * item] = attr.getX(i) / div; if (item > 1) a[i * item + 1] = attr.getY(i) / div; if (item > 2) a[i * item + 2] = attr.getZ(i) / div; }
    return new THREE.BufferAttribute(a, item);
  };
  out.setAttribute('position', conv(g.attributes.position, 3));
  if (g.attributes.normal) out.setAttribute('normal', conv(g.attributes.normal, 3));
  out.setAttribute('uv', g.attributes.uv ? conv(g.attributes.uv, 2) : new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (g.index) out.setIndex(new THREE.BufferAttribute(g.index.count > 65535 || g.attributes.position.count > 65535 ? new Uint32Array(g.index.array) : new Uint16Array(g.index.array), 1));
  else { const n = g.attributes.position.count, idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n); for (let i = 0; i < n; i++) idx[i] = i; out.setIndex(new THREE.BufferAttribute(idx, 1)); }
  out.applyMatrix4(matrix);
  if (!g.attributes.normal) out.computeVertexNormals();
  return out;
}
function mergeFloatGeos(list) {
  let nv = 0, ni = 0; for (const g of list) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, ov * 3); nrm.set(g.attributes.normal.array, ov * 3); uv.set(g.attributes.uv.array, ov * 2);
    const ia = g.index.array; for (let i = 0; i < ia.length; i++) idx[oi + i] = ia[i] + ov;
    ov += n; oi += ia.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere(); return out;
}
function buildRivalTemplate() {
  car.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(car.matrixWorld).invert();
  const src = customModel || procBody, groups = new Map(), wheelsT = [];
  src.traverse(o => {
    if (WHEEL_RE.test(o.name)) { let n = 0; o.traverse(x => { if (x.isMesh) n++; }); if (n) wheelsT.push({ node: o, front: /f/i.test(o.name.match(WHEEL_RE)[1][0]), parentMatrix: new THREE.Matrix4().multiplyMatrices(inv, o.parent.matrixWorld) }); return; }
    if (!o.isMesh || Array.isArray(o.material)) return;
    let q = o.parent, under = false; while (q && q !== src) { if (WHEEL_RE.test(q.name)) under = true; q = q.parent; } if (under) return;
    const key = o.material.uuid; if (!groups.has(key)) groups.set(key, { mat: o.material, paint: !!o.userData.paint, geos: [] });
    groups.get(key).geos.push(floatGeo(o.geometry, new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)));
  });
  const parts = []; for (const g of groups.values()) { parts.push({ geo: mergeFloatGeos(g.geos), mat: g.mat, paint: g.paint }); g.geos.forEach(x => x.dispose()); }
  if (!customModel) for (const w of wheels) wheelsT.push({ node: w.steer, front: w.front, parentMatrix: new THREE.Matrix4(), proc: true, r: w.r });
  return { parts, wheels: wheelsT };
}
function buildRivalVisual(a) {
  if (a.grp) scene.remove(a.grp);
  if (!rivalTemplate) rivalTemplate = buildRivalTemplate();
  const grp = new THREE.Group(), body = new THREE.Group(); grp.add(body);
  for (const part of rivalTemplate.parts) {
    if (!part.rivalMat) part.rivalMat = part.mat.clone();   // own copy: the player's roof clip must not cut the rivals
    let mat = part.rivalMat;
    if (part.paint) { mat = part.mat.clone(); mat.map = null; mat.color.setHex(a.hex); mat.envMap = cubeRT.texture; mat.envMapIntensity = 0.9; mat.metalness = 0.3; mat.roughness = 0.3; }
    const m = new THREE.Mesh(part.geo, mat); m.castShadow = false; m.receiveShadow = true; body.add(m);
  }
  a.wheels = [];
  for (const w of rivalTemplate.wheels) {
    const holder = new THREE.Group(); holder.matrix.copy(w.parentMatrix); holder.matrix.decompose(holder.position, holder.quaternion, holder.scale);
    const c = cloneTree(w.node); c.visible = true; holder.add(c); grp.add(holder);
    a.wheels.push(w.proc ? { node: c, spin: c.children[0], r: w.r, front: w.front } : { node: c, front: w.front, custom: true });
  }
  const gd = new THREE.Mesh(glowDisc.geometry, new THREE.MeshBasicMaterial({ map: glowTex, color: a.hex, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  gd.rotation.copy(glowDisc.rotation); gd.position.copy(glowDisc.position); gd.renderOrder = 2; grp.add(gd);
  a.grp = grp; a.body = body; a.glowDisc = gd; scene.add(grp);
}
function makeRival(R) {
  const a = { name: R.name, hex: R.hex, skill: R.skill, lane: R.lane, s: 0, d: 0, u: 0, dv: 0, psi: 0, spinT: 0, spinDir: 1, crossings: 0, lastP: 0, finishT: null, lapStart: null, best: null,
    boostT: 0, boostCd: 0, glow: 0, hitT: 0, pos: new THREE.Vector3(), fwd: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), right: new THREE.Vector3(), idx: 0, grp: null, body: null, wheels: [], snd: null };
  buildRivalVisual(a); return a;
}
function rivalPose(a) {
  const fr = sampleAt(a.s), cp = Math.cos(a.psi), sp = Math.sin(a.psi);
  a.pos.copy(fr.p).addScaledVector(fr.b, a.d);
  a.fwd.copy(fr.t).multiplyScalar(cp).addScaledVector(fr.b, sp).normalize(); a.up.copy(fr.n); a.right.crossVectors(a.fwd, a.up); a.idx = fr.i;
  a.grp.position.copy(a.pos); a.grp.quaternion.copy(basisQuat(a.fwd, a.up));
}
function rivalKick(a, kick) {
  // kick is a yaw impulse, positive = nose to the left. A big one breaks the rear loose and the car goes round
  if (Math.abs(kick) > 1.8) { a.spinT = Math.max(a.spinT, clamp(Math.abs(kick) * 0.3, 0.5, 1.6)); a.spinDir = -Math.sign(kick); }
  else a.psi -= kick * 0.12;
}
function rivalStep(a, dt, now) {
  const i = a.idx, kap = KAPPA[i], go = GAME.state === 'racing' || GAME.state === 'finished';
  // rubber band on the player's progress: chase harder when behind, ease off when well ahead. Keeps it a fight
  const gap = progressOf(st) - progressOf(a);
  const D = DIFFS[GAME.diff], rubber = clamp(1 + gap / 3500, D.band[0], D.band[1]);
  const target = go ? Math.min(D.vmax, VLIM[i] * a.skill * D.skill * rubber) : 0;
  if (a.spinT > 0) { a.spinT -= dt; a.psi += a.spinDir * 5.5 * dt; a.u = Math.max(0, a.u - 9 * dt); a.dv *= Math.max(0, 1 - 2 * dt); }
  else {
    a.psi = damp(a.psi, Math.atan2(a.dv, Math.max(a.u, 4)), 6, dt);
    if (a.u < target) { const acc = Math.min(10.5, CAR.powerW * CAR.drivelineEff * 0.9 / (CAR.mass * Math.max(a.u, 4))) * (a.boostT > 0 ? 1.7 : 1); a.u = Math.min(target, a.u + acc * dt); }
    else a.u = Math.max(target, a.u - 13 * dt);
    // the line: inside of the next corner, own lane on the straights, and round whatever is in the way
    const look = (i + Math.round(clamp(a.u * 1.8, 40, 200) / (trackLen / N))) % N;
    let dT = -Math.sign(KAPPA[look]) * clamp(Math.abs(KAPPA[look]) * 900, 0, 2.8) + a.lane * 1.6;
    const cars = [{ s: st.s, d: st.d, u: st.u }]; for (const o of ai) if (o !== a) cars.push(o);
    for (const o of cars) { const ds = fwdGap(o.s, a.s); if (ds > -6 && ds < 26 + a.u * 0.35 && Math.abs(o.d - a.d) < 2.9 && o.u <= a.u + 8) { dT = (o.d > a.d || (o.d === a.d && a.lane >= 0)) ? o.d - 3.4 : o.d + 3.4; break; } }
    dT = clamp(dT, -(ROAD_HALF - 1.1), ROAD_HALF - 1.1);
    const dvT = clamp((dT - a.d) * 1.4, -1, 1) * Math.min(6.5, 0.16 * a.u + 1);
    a.dv = damp(a.dv, dvT, 3.5, dt);
  }
  a.psi = Math.atan2(Math.sin(a.psi), Math.cos(a.psi));
  const sDot = a.u / Math.max(0.3, 1 + kap * a.d);
  a.s = ((a.s + sDot * dt) % trackLen + trackLen) % trackLen;
  a.d += (a.spinT > 0 ? a.dv + a.u * Math.sin(a.psi) * 0.3 : a.dv) * dt;
  if (Math.abs(a.d) > D_HIT) { a.d = Math.sign(a.d) * D_HIT; a.dv = -a.dv * 0.3; a.u *= 0.9; }
  if (a.boostT > 0) a.boostT -= dt; if (a.boostCd > 0) a.boostCd -= dt;
  if (BOOST[i] && a.boostCd <= 0 && a.u > 2) { a.boostT = 1.3; a.boostCd = 0.9; a.glow = 1; }
  a.glow = Math.max(0, a.glow - dt * 0.9); if (a.hitT > 0) a.hitT -= dt;
  const p = a.s / trackLen;
  if (a.lastP > 0.92 && p < 0.08) {
    a.crossings++;
    if (a.lapStart != null) { const lt = now - a.lapStart; if (a.best == null || lt < a.best) a.best = lt; }
    a.lapStart = now;
    if (a.crossings === GAME.laps + 1 && a.finishT == null) a.finishT = now - GAME.startT;
  }
  a.lastP = p;
  rivalPose(a);
  const steer = a.spinT > 0 ? 0 : clamp(a.dv * 0.08, -0.35, 0.35);
  for (const w of a.wheels) { if (w.custom) { w.node.rotation.x += a.u * dt / 0.35; w.node.rotation.y = w.front ? steer : 0; } else { w.spin.rotation.z -= a.u * dt / w.r; w.node.rotation.y = w.front ? steer : 0; } }
  a.body.rotation.z = damp(a.body.rotation.z, 0, 8, dt); a.body.rotation.x = damp(a.body.rotation.x, a.dv * 0.02, 8, dt);
  a.glowDisc.material.opacity = 0.45 + 0.5 * a.glow;
}
// car-to-car contact, on momentum. Both cars are 4.95 × 2.03 m boxes in track coordinates and the shallower overlap
// picks the contact normal. Along it the closing speed is exchanged as an impulse (equal masses, restitution 0.35) with a
// friction impulse across it. Each car's yaw impulse is the moment of those impulses about its centre over the car's
// radius of gyration (I/m = 2.4 m²). Whether a car SPINS is decided by that impulse against a stability threshold that
// depends on its role: the aggressor (the car moving into the contact) hitting with its nose is very hard to spin,
// a car struck ahead of its centre gets pushed wide rather than round, and a car struck behind its centre goes round
// easily. Below the threshold the impulse is just a nudge. Both cars scrub a little speed on every contact.
const CONTACT_L = 4.7, CONTACT_W = 2.05, CONTACT_E = 0.35, CONTACT_I = 2.4, SPIN_W = 1.6;
function stability(aggressor, x) { return aggressor && x > 0.5 ? 2.8 : x > 0.5 ? 1.8 : x < -0.5 ? 0.55 : 1.0; }
function resolveContact(A, B) {
  // A and B: { s, d, u (along), v (across), x (contact point along own axis), y (across), kick(dw), slow(k) }; returns closing speed
  const ds = fwdGap(B.s, A.s), dd = B.d - A.d;
  if (Math.abs(ds) >= CONTACT_L || Math.abs(dd) >= CONTACT_W) return 0;
  const penS = CONTACT_L - Math.abs(ds), penD = CONTACT_W - Math.abs(dd);
  let nS, nD;   // normal from A into B
  if (penD < penS) { nS = 0; nD = dd >= 0 ? 1 : -1; A.sep(0, -nD * penD * 0.5); B.sep(0, nD * penD * 0.5); A.x = clamp(ds, -2.3, 2.3); A.y = nD; B.x = clamp(-ds, -2.3, 2.3); B.y = -nD; }
  else { nS = ds >= 0 ? 1 : -1; nD = 0; A.sep(-nS * penS * 0.5, 0); B.sep(nS * penS * 0.5, 0); A.x = nS * 2.4; A.y = clamp(dd, -1, 1); B.x = -nS * 2.4; B.y = -clamp(dd, -1, 1); }
  const tS = -nD, tD = nS;                                                   // tangent
  const relN = (A.u - B.u) * nS + (A.v - B.v) * nD;                         // closing speed along the normal
  if (relN <= 0) return 0;
  const relT = (A.u - B.u) * tS + (A.v - B.v) * tD;
  const Jn = (1 + CONTACT_E) / 2 * relN, Jt = clamp(relT * 0.5, -0.4 * Jn, 0.4 * Jn);
  // who is moving into whom
  const intoA = A.u * nS + A.v * nD, intoB = -(B.u * nS + B.v * nD);
  const aggA = intoA >= intoB;
  // velocity change: A loses along n and t, B gains
  A.u -= Jn * nS + Jt * tS; A.v -= Jn * nD + Jt * tD; B.u += Jn * nS + Jt * tS; B.v += Jn * nD + Jt * tD;
  // yaw impulse from the moment about each centre (left-positive)
  const FxA = -(Jn * nS + Jt * tS), FyA = -(Jn * nD + Jt * tD);
  const dwA = -(A.x * FyA - A.y * FxA) / CONTACT_I, dwB = -(B.x * -FyA - B.y * -FxA) / CONTACT_I;
  const spinA = Math.abs(dwA) > SPIN_W * stability(aggA, A.x), spinB = Math.abs(dwB) > SPIN_W * stability(!aggA, B.x);
  A.kick(dwA, spinA); B.kick(dwB, spinB);
  A.slow(Jn); B.slow(Jn);
  return relN;
}
function contactHit(k) {
  if (st.hitT <= 0) { st.hits++; st.hitT = 0.25; audio.clang(clamp(k / 8, 0.15, 1)); st.shake = Math.max(st.shake || 0, clamp(k / 10, 0.1, 0.8)); if (k > 5) flash('CONTACT', 500); }
}
const _cp = { s: 0, d: 0, u: 0, v: 0, x: 0, y: 0, sep(ds, dd) { st.s = ((st.s + ds) % trackLen + trackLen) % trackLen; st.d += dd; this.s = st.s; this.d = st.d; },
  kick(dw, spin) { if (spin) { st.spinT = Math.max(st.spinT || 0, clamp(Math.abs(dw) * 0.28, 0.45, 1.5)); st.spinW = clamp(dw * 1.1, -5, 5); } else st.yaw += dw * 0.5; },
  slow(Jn) { st.u -= Math.sign(st.u || 1) * Jn * 0.12; } };
const rivalProxy = a => ({ s: a.s, d: a.d, u: a.u, v: a.dv, x: 0, y: 0, a,
  sep(ds, dd) { a.s = ((a.s + ds) % trackLen + trackLen) % trackLen; a.d += dd; this.s = a.s; this.d = a.d; },
  kick(dw, spin) { if (spin) { a.spinT = Math.max(a.spinT, clamp(Math.abs(dw) * 0.3, 0.5, 1.6)); a.spinDir = -Math.sign(dw); } else a.psi -= dw * 0.08; },
  slow(Jn) { a.u = Math.max(0, a.u - Jn * 0.12); } });
function contacts(dt) {
  if (!ai.length) return;
  if (!st.air) {
    const cp = Math.cos(st.psi), sp = Math.sin(st.psi);
    for (const a of ai) {
      // player velocity in the track frame; after the impulse, back into the body frame
      _cp.s = st.s; _cp.d = st.d; _cp.u = st.u * cp - st.w * sp; _cp.v = st.u * sp + st.w * cp;
      const B = rivalProxy(a);
      const rel = resolveContact(_cp, B);
      if (rel > 0) { st.u = _cp.u * cp + _cp.v * sp; st.w = -_cp.u * sp + _cp.v * cp; a.u = B.u; a.dv = B.v; contactHit(rel); a.hitT = 0.25; }
    }
  }
  for (let p = 0; p < ai.length; p++) for (let q = p + 1; q < ai.length; q++) {
    const A = rivalProxy(ai[p]), B = rivalProxy(ai[q]);
    if (resolveContact(A, B) > 0) { ai[p].u = A.u; ai[p].dv = A.v; ai[q].u = B.u; ai[q].dv = B.v; }
  }
}
function placeAtS(s, d) { placeOnTrack(Math.floor(s / trackLen * N) % N); st.s = s; st.d = d; st.lastP = s / trackLen; syncPose(); }
function clearRivals() { for (const a of ai) { scene.remove(a.grp); audio.rivalStop(a); } ai.length = 0; }
function startRace(mode, laps) {
  GAME.mode = mode; GAME.laps = laps; GAME.finishT = null; GAME.lapTimes = []; GAME.order = []; GAME.cdShown = -1;
  clearRivals(); $('results').classList.add('hidden');
  st.crossings = 0; st.lapsDone = 0; st.hits = 0; st.resets = 0; st.vmax = 0; st.lapLast = null; st.nos = 1; st.spinT = 0;
  if (mode === 'versus') {
    RIVALS.forEach((R, k) => { const a = makeRival(R); a.s = trackLen - 16 - 8.5 * k; a.d = k % 2 ? 2.7 : -2.7; a.lastP = a.s / trackLen; rivalPose(a); audio.rivalStart(a); ai.push(a); });
    placeAtS(trackLen - 16 - 8.5 * 3, 2.7);
  } else if (mode === 'time') placeAtS(trackLen - 20, 0);
  else placeOnTrack(20);
  GAME.state = mode === 'solo' ? 'free' : 'countdown'; GAME.cd = START_CUES[0].at + 0.01; GAME.cue = 0; announcer.stop();
  $('race').classList.toggle('hidden', mode === 'solo');
  $('lap-cur').parentElement.style.display = ''; 
  if (mode === 'versus') flash('VERSUS · ' + DIFFS[GAME.diff].name + ' · ' + laps + ' LAPS', 1600); else if (mode === 'time') flash('TIME TRIAL · ' + laps + ' LAPS', 1600);
}
// the announcer: Web Speech where the browser has it, text on screen everywhere
const announcer = {
  voice: null,
  pick() { try { const vs = speechSynthesis.getVoices(); this.voice = vs.find(v => /^en/i.test(v.lang) && /male|daniel|david|mark|george|ryan|guy|james/i.test(v.name)) || vs.find(v => /^en[-_](GB|AU|NZ)/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null; } catch (e) {} },
  on: true,
  say(text, rate = 1, pitch = 0.8) {
    if (!this.on || !st.sound || !window.speechSynthesis) return;
    try { if (!this.voice) this.pick(); const u = new SpeechSynthesisUtterance(text); u.rate = rate; u.pitch = pitch; u.volume = 1; if (this.voice) u.voice = this.voice; speechSynthesis.speak(u); } catch (e) {}
  },
  stop() { try { speechSynthesis.cancel(); } catch (e) {} },
};
if (window.speechSynthesis) { announcer.pick(); speechSynthesis.onvoiceschanged = () => announcer.pick(); }
const START_CUES = [   // seconds remaining on the countdown clock
  { at: 8.6, text: 'ARE YOU READY?', say: 'Are you ready?', rate: 0.95 },
  { at: 6.9, text: 'START YOUR ENGINES', say: 'Start your engines.', rate: 0.95 },
  { at: 4.9, text: 'HERE WE GO', say: 'Here we go.', rate: 1 },
  { at: 3.0, text: '3', say: 'Three', beep: 660 }, { at: 2.0, text: '2', say: 'Two', beep: 660 }, { at: 1.0, text: '1', say: 'One', beep: 660 },
];
function raceTick(dt) {
  const now = performance.now();
  if (GAME.state === 'countdown') {
    for (let k = GAME.cue; k < START_CUES.length; k++) { const c = START_CUES[k]; if (GAME.cd <= c.at) { GAME.cue = k + 1; flash(c.text, c.beep ? 900 : 1500, c.beep ? '#2ee6ff' : ''); if (c.beep) audio.beep(c.beep, 0.12); announcer.say(c.say, c.rate || 1); } }
    GAME.cd -= dt;
    if (GAME.cd <= 0) { GAME.state = 'racing'; GAME.startT = now; st.lapStart = null; flash('GO!', 900, '#30d21c'); audio.beep(1320, 0.45); announcer.say('Go!', 1.1, 0.9); }
  }
  for (const a of ai) rivalStep(a, dt, now);
  if (GAME.state === 'finished' && GAME.resultsAt && now > GAME.resultsAt) { GAME.resultsAt = 0; showResults(); }
}
function standings() {
  const rows = [{ me: true, name: 'YOU', hex: PAINTS[paintIdx].hex, prog: progressOf(st), u: Math.abs(st.u), finishT: GAME.finishT, best: st.lapBest }];
  for (const a of ai) rows.push({ me: false, name: a.name, hex: a.hex, prog: progressOf(a), u: a.u, finishT: a.finishT, best: a.best });
  rows.sort((p, q) => (p.finishT != null || q.finishT != null) ? ((p.finishT == null ? 1e12 : p.finishT) - (q.finishT == null ? 1e12 : q.finishT)) : q.prog - p.prog);
  return rows;
}
function finishRace(now) {
  GAME.state = 'finished'; GAME.finishT = now - GAME.startT; GAME.resultsAt = now + 1800;
  const pos = standings().findIndex(r => r.me) + 1;
  flash(GAME.mode === 'versus' ? (pos === 1 ? 'VICTORY' : 'FINISHED · P' + pos) : 'FINISHED · ' + fmtTime(GAME.finishT), 2200);
  audio.beep(pos === 1 ? 1568 : 988, 0.5); announcer.say(GAME.mode === 'versus' ? (pos === 1 ? 'Victory. You win.' : 'Finished. P' + pos + '.') : 'Time trial complete.', 1, 0.85);
}
function showResults() {
  const rows = standings(), box = $('res-rows'); box.innerHTML = '';
  const leader = rows[0];
  const pos = rows.findIndex(r => r.me) + 1;
  $('res-title').textContent = GAME.mode === 'versus' ? (pos === 1 ? 'VICTORY' : 'P' + pos + ' OF ' + rows.length) : 'TIME TRIAL · ' + fmtTime(GAME.finishT);
  const lapsTxt = GAME.laps + (GAME.laps === 1 ? ' LAP' : ' LAPS');
  $('res-sub').textContent = GAME.mode === 'versus' ? DIFFS[GAME.diff].name + ' · ' + lapsTxt + ' · ' + fmtTime(GAME.finishT) : lapsTxt + ' · BEST ' + fmtTime(st.lapBest);
  const head = document.createElement('div'); head.className = 'row head'; head.innerHTML = '<b></b><i style="visibility:hidden"></i><span>DRIVER</span><em>BEST LAP</em><b>GAP</b>'; box.appendChild(head);
  rows.forEach((r, k) => {
    const el = document.createElement('div'); el.className = 'row' + (r.me ? ' me' : '');
    let gapTxt;
    if (r.finishT != null) gapTxt = k === 0 ? fmtTime(r.finishT) : '+' + (Math.max(0, (r.finishT - leader.finishT)) / 1000).toFixed(3);
    else gapTxt = '+' + Math.round(Math.max(0, leader.prog - r.prog)) + ' m';
    el.innerHTML = `<b>P${k + 1}</b><i style="background:#${r.hex.toString(16).padStart(6, '0')}"></i><span>${r.name}</span><em>${r.best != null ? fmtTime(r.best) : '--:--.---'}</em><b>${gapTxt}</b>`;
    box.appendChild(el);
  });
  if (GAME.mode === 'time') { box.innerHTML = ''; const h2 = document.createElement('div'); h2.className = 'row head'; h2.innerHTML = '<b></b><span>LAP</span><em></em><b>TIME</b>'; box.appendChild(h2); GAME.lapTimes.forEach((t, k) => { const el = document.createElement('div'); el.className = 'row' + (t === st.lapBest ? ' me' : ''); el.innerHTML = `<b>LAP ${k + 1}</b><span></span><em></em><b>${fmtTime(t)}</b>`; box.appendChild(el); }); }
  $('results').classList.remove('hidden');
}
function updateRaceHUD() {
  if (GAME.mode === 'solo') return;
  const rows = standings(), pos = rows.findIndex(r => r.me) + 1, leader = rows[0];
  $('race-pos').textContent = GAME.mode === 'versus' ? 'P' + pos : 'LAP';
  $('race-lap').textContent = (GAME.mode === 'versus' ? '' : '') + Math.min(st.lapsDone + 1, GAME.laps) + ' / ' + GAME.laps;
  $('race-time').textContent = GAME.state === 'racing' ? fmtTime(performance.now() - GAME.startT) : GAME.state === 'finished' ? fmtTime(GAME.finishT) : '0:00.000';
  if (GAME.mode !== 'versus') return;
  const box = $('standings');
  if (box.children.length !== rows.length) { box.innerHTML = ''; rows.forEach(() => { const el = document.createElement('div'); el.className = 'row'; el.innerHTML = '<b></b><i></i><span></span><em></em>'; box.appendChild(el); }); }
  rows.forEach((r, k) => {
    const el = box.children[k]; el.classList.toggle('me', r.me);
    el.children[0].textContent = 'P' + (k + 1); el.children[1].style.background = '#' + r.hex.toString(16).padStart(6, '0'); el.children[2].textContent = r.name;
    let gap;
    if (r.finishT != null) gap = k === 0 ? 'FIN' : '+' + ((r.finishT - leader.finishT) / 1000).toFixed(1);
    else if (k === 0) gap = 'LEADER'; else gap = '+' + ((leader.prog - r.prog) / Math.max(20, leader.u)).toFixed(1) + 's';
    el.children[3].textContent = gap;
  });
}

placeOnTrack(20);

// ------------------------------------------------------------------ input
const keys = {}, touch = { left: 0, right: 0, gas: 0, brake: 0, hand: 0 };
const inp = { steer: 0, throttle: 0, brake: 0, hand: false, nos: false, shiftUp: false, shiftDown: false };
function readInput() {
  const k = c => keys[c] ? 1 : 0;
  inp.steer = k('ArrowLeft') + k('KeyA') - k('ArrowRight') - k('KeyD') + touch.left - touch.right;
  inp.throttle = Math.max(k('ArrowUp'), k('KeyW'), touch.gas);
  inp.brake = Math.max(k('ArrowDown'), k('KeyS'), touch.brake);
  inp.hand = !!(keys.Space || touch.hand);
  inp.nos = !!keys.KeyN;
  const gps = navigator.getGamepads ? navigator.getGamepads() : null;
  const gp = gps && (gps[0] || gps[1] || gps[2] || gps[3]);
  if (gp) {
    const ax = gp.axes[0] || 0; if (Math.abs(ax) > 0.08) inp.steer = -ax;
    const bt = i => gp.buttons[i] ? (gp.buttons[i].value || (gp.buttons[i].pressed ? 1 : 0)) : 0;
    inp.throttle = Math.max(inp.throttle, bt(7), bt(0));
    inp.brake = Math.max(inp.brake, bt(6), bt(2));
    if (bt(1) > 0.5) inp.hand = true;
    if (bt(3) > 0.5) inp.nos = true;
    if (bt(5) > 0.5 && !gp._u) { gp._u = true; shiftManual(1); } else if (bt(5) < 0.5) gp._u = false;
    if (bt(4) > 0.5 && !gp._d) { gp._d = true; shiftManual(-1); } else if (bt(4) < 0.5) gp._d = false;
  }
  inp.steer = clamp(inp.steer, -1, 1);
}
window.addEventListener('keydown', e => {
  if (e.repeat) { if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); return; }
  keys[e.code] = true;
  if (!$('start').classList.contains('hidden')) { if (e.code !== 'Escape') startGame(); }
  if (e.code === 'Escape') { if (!$('settings').classList.contains('hidden')) { $('settings').classList.add('hidden'); return; } toMenu(); return; }
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
    case 'KeyV': st.sound = !st.sound; flash(st.sound ? 'SOUND ON' : 'SOUND OFF', 700); audioBtns(); break;
    case 'KeyH': $('help').classList.toggle('hidden'); break;
    case 'KeyB': flash(music.cycle(), 1000); audioBtns(); break;
    case 'KeyL': trailOn = !trailOn; trailMesh.visible = trailOn; if (trailOn) trailReset(); flash(trailOn ? 'LIGHT TRAIL ON' : 'LIGHT TRAIL OFF', 800); break;
    case 'KeyY': customYaw += Math.PI / 2; if (customModel) customModel.rotation.y += Math.PI / 2; break;
  }
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
document.querySelectorAll('.tbtn').forEach(b => {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); touch[k] = 1; b.classList.add('down'); if (!$('start').classList.contains('hidden')) startGame(); };
  const off = e => { e.preventDefault(); touch[k] = 0; b.classList.remove('down'); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
});
if (('ontouchstart' in window) || navigator.maxTouchPoints > 0) $('touch').classList.add('on');
$('start-btn').addEventListener('click', startGame);
{ // colour bar: five quick picks (the fifth is the animated TRON paint); P still cycles the full list
  const bar = $('paints'), picks = PAINTS.map((_, i) => i).filter(i => i > 0);
  for (const i of picks) { const b = document.createElement('button'); b.dataset.p = String(i); b.title = PAINTS[i].name; b.className = PAINTS[i].shader ? 'tron' : PAINTS[i].livery ? 'livery' : ''; if (!PAINTS[i].shader && !PAINTS[i].livery) b.style.background = '#' + PAINTS[i].hex.toString(16).padStart(6, '0'); b.addEventListener('click', e => { e.stopPropagation(); setPaint(i); }); bar.appendChild(b); }
}
$('start').addEventListener('click', startGame);

function audioBtns() {
  const mb = $('btn-music'), sb = $('btn-sound');
  mb.textContent = '♪ ' + (music.on ? music.tracks[music.track].name : 'MUSIC OFF'); mb.classList.toggle('off', !music.on);
  sb.textContent = st.sound ? 'SOUND ON' : 'SOUND OFF'; sb.classList.toggle('off', !st.sound);
}
$('btn-music').addEventListener('click', e => { e.stopPropagation(); flash(music.cycle(), 1000); audioBtns(); });
$('btn-sound').addEventListener('click', e => { e.stopPropagation(); st.sound = !st.sound; flash(st.sound ? 'SOUND ON' : 'SOUND OFF', 700); audioBtns(); });
// settings & credits panel (start screen link, or ESC in the menu)
function settingsRefresh() {
  const v = { quality: hiQ ? 'HIGH' : 'LOW', bloom: bloomOn ? 'ON' : 'OFF', sound: st.sound ? 'ON' : 'OFF', music: music.on ? music.tracks[music.track].name : 'OFF', trail: trailOn ? 'ON' : 'OFF', voice: announcer.on ? 'ON' : 'OFF' };
  document.querySelectorAll('#settings [data-set]').forEach(b => { b.textContent = v[b.dataset.set]; });
}
document.querySelectorAll('#settings [data-set]').forEach(b => b.addEventListener('click', e => {
  e.stopPropagation();
  switch (b.dataset.set) {
    case 'quality': hiQ = !hiQ; resize(); break;
    case 'bloom': bloomOn = !bloomOn; break;
    case 'sound': st.sound = !st.sound; break;
    case 'music': music.cycle(); break;
    case 'trail': trailOn = !trailOn; trailMesh.visible = trailOn; if (trailOn) trailReset(); break;
    case 'voice': announcer.on = !announcer.on; break;
  }
  settingsRefresh(); audioBtns();
}));
$('settings-btn').addEventListener('click', e => { e.stopPropagation(); settingsRefresh(); $('settings').classList.remove('hidden'); });
$('settings-close').addEventListener('click', e => { e.stopPropagation(); $('settings').classList.add('hidden'); });
$('settings').addEventListener('click', e => e.stopPropagation());
let flashTimer = null;
function flash(text, ms, color) { const m = $('msg'); m.textContent = text; m.style.color = color || ''; m.style.textShadow = color ? '0 0 28px ' + color : ''; m.classList.add('show'); clearTimeout(flashTimer); flashTimer = setTimeout(() => m.classList.remove('show'), ms); }
function setMode(i) {
  st.mode = (i + MODES.length) % MODES.length; const m = MODES[st.mode];
  $('mode-name').textContent = m.name; $('mode-name').style.color = m.color; $('mode-sub').textContent = m.sub;
  flash(m.name, 900);
}
function shiftTo(g) { if (g < 0 || g > 7 || g === st.gear) return; st.gear = g; st.shiftT = 0.09; audio.shift(); }
function shiftManual(d) { if (st.auto) { st.auto = false; $('gearlbl').textContent = 'MANUAL'; } if (!st.reverse) shiftTo(st.gear + d); }
function startGame() {
  if (!$('start').classList.contains('hidden')) $('start').classList.add('hidden'); else return;
  if (!st.started) { st.started = true; audio.start(); setMode(st.mode); setPaint(paintIdx); }
  startRace(GAME.mode, GAME.laps);
  if (GAME.mode === 'solo') flash('AUTODROMO DI CORE FOCUS', 1500);
}
function toMenu() {
  $('results').classList.add('hidden'); $('start').classList.remove('hidden'); GAME.state = 'free'; clearRivals(); $('race').classList.add('hidden');
}
{ // mode picker on the start screen
  const setModeBtn = m => { GAME.mode = m; document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.m === m)); $('lapsel').classList.toggle('hidden', m === 'solo'); $('diffsel').classList.toggle('hidden', m !== 'versus'); $('start-btn').textContent = m === 'versus' ? 'START RACE' : m === 'time' ? 'START TIME TRIAL' : 'START ENGINE'; };
  document.querySelectorAll('#modes button').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); setModeBtn(b.dataset.m); }));
  document.querySelectorAll('#lapsel button').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); GAME.laps = +b.dataset.l; document.querySelectorAll('#lapsel button').forEach(x => x.classList.toggle('on', x === b)); }));
  try { const d = localStorage.getItem('revuelto.diff'); if (d != null && DIFFS[+d]) GAME.diff = +d; } catch (e) {}
  const diffBtns = document.querySelectorAll('#diffsel button');
  diffBtns.forEach(b => { b.classList.toggle('on', +b.dataset.d === GAME.diff); b.addEventListener('click', e => { e.stopPropagation(); GAME.diff = +b.dataset.d; diffBtns.forEach(x => x.classList.toggle('on', x === b)); try { localStorage.setItem('revuelto.diff', String(GAME.diff)); } catch (e) {} }); });
  $('res-again').addEventListener('click', e => { e.stopPropagation(); startRace(GAME.mode, GAME.laps); });
  $('res-menu').addEventListener('click', e => { e.stopPropagation(); toMenu(); });
  $('results').addEventListener('click', e => e.stopPropagation());
  setModeBtn('solo');
}

// ------------------------------------------------------------------ audio (synthesized V12)
const audio = {
  ctx: null,
  start() {
    try {
      const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const master = C.createGain(); master.gain.value = 0.7; master.connect(C.destination); this.master = master;
      const comp = C.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.18; comp.connect(master); this.comp = comp;
      const noiseBuf = C.createBuffer(1, C.sampleRate * 2, C.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const noise = () => { const n = C.createBufferSource(); n.buffer = noiseBuf; n.loop = true; n.start(); return n; }; this._noiseBuf = noiseBuf;
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
      const ho = C.createOscillator(); ho.type = 'sawtooth'; ho.frequency.value = 240; const hf = C.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 1100; hf.Q.value = 6; const hg = C.createGain(); hg.gain.value = 0; ho.connect(hf); hf.connect(hg); hg.connect(comp); ho.start(); this.ho = ho; this.hg = hg; this.hf = hf;
      // gravel
      const gb = C.createBiquadFilter(); gb.type = 'bandpass'; gb.frequency.value = 2600; gb.Q.value = 0.6; const gg = C.createGain(); gg.gain.value = 0; noise().connect(gb); gb.connect(gg); gg.connect(comp); this.gg = gg;
      // EV whine
      const ev = C.createOscillator(); ev.type = 'sine'; const ev2 = C.createOscillator(); ev2.type = 'triangle'; const evg = C.createGain(); evg.gain.value = 0; ev.connect(evg); ev2.connect(evg); evg.connect(comp); ev.start(); ev2.start(); this.ev = ev; this.ev2 = ev2; this.evg = evg;
      this.load = 0;
      music.start(C, comp);
    } catch (e) { console.warn('audio unavailable', e); this.ctx = null; }
  },
  nosStart() {
    if (!this.ctx || !st.sound) return; const C = this.ctx, t = C.currentTime; this.nosStop();
    const n = C.createBufferSource(); n.buffer = this.oscs ? this._noiseBuf : null; if (!n.buffer) return; n.loop = true;
    const hp = C.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2800; const g = C.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.05); g.gain.exponentialRampToValueAtTime(0.16, t + 0.5);
    const o = C.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55; const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140; const og = C.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.35, t + 0.08);
    n.connect(hp); hp.connect(g); g.connect(this.comp); o.connect(lp); lp.connect(og); og.connect(this.comp); n.start(t); o.start(t);
    this.nosNodes = { n, o, g, og };
  },
  nosStop() {
    if (!this.ctx || !this.nosNodes) return; const C = this.ctx, t = C.currentTime, x = this.nosNodes; this.nosNodes = null;
    x.g.gain.cancelScheduledValues(t); x.g.gain.setValueAtTime(x.g.gain.value, t); x.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25); x.og.gain.cancelScheduledValues(t); x.og.gain.setValueAtTime(x.og.gain.value, t); x.og.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    x.n.stop(t + 0.3); x.o.stop(t + 0.3);
  },
  beep(freq, dur) {
    if (!this.ctx || !st.sound) return; const C = this.ctx, t = C.currentTime;
    const o = C.createOscillator(), g = C.createGain(); o.type = 'square'; o.frequency.value = freq; const f = C.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.28, t + 0.006); g.gain.setValueAtTime(0.28, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    o.connect(f); f.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.12);
  },
  record() {
    // new top speed: a rising major arpeggio with a shimmer
    if (!this.ctx || !st.sound) return; const C = this.ctx, t = C.currentTime;
    [1046.5, 1318.5, 1568, 2093].forEach((freq, k) => { const t0 = t + k * 0.09; for (const [mult, vol] of [[1, 0.35], [2, 0.08], [3.01, 0.03]]) { const o = C.createOscillator(), g = C.createGain(); o.type = 'sine'; o.frequency.value = freq * mult; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t0 + (k === 3 ? 1.1 : 0.45)); o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + 1.2); } });
  },
  clang(k) {
    // car on car: a metallic crack on top of the crunch
    if (!this.ctx || !st.sound) return; const C = this.ctx, t = C.currentTime; this.crunch(k * 0.7);
    const n = C.createBufferSource(); n.buffer = this._noiseBuf; const f = C.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1700 + 600 * Math.random(); f.Q.value = 4;
    const g = C.createGain(); g.gain.setValueAtTime(0.5 * k, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12 + 0.2 * k); n.connect(f); f.connect(g); g.connect(this.comp); n.start(t); n.stop(t + 0.4);
    const o = C.createOscillator(), og = C.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.12); og.gain.setValueAtTime(0.6 * k, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); o.connect(og); og.connect(this.comp); o.start(t); o.stop(t + 0.3);
  },
  rivalStart(a) {
    // each rival carries a small V12 of its own, mixed by distance
    if (!this.ctx) return; const C = this.ctx;
    const o1 = C.createOscillator(); o1.type = 'sawtooth'; const o2 = C.createOscillator(); o2.type = 'square'; const g2 = C.createGain(); g2.gain.value = 0.25;
    const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2; const g = C.createGain(); g.gain.value = 0;
    o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(this.comp); o1.start(); o2.start();
    a.snd = { o1, o2, lp, g };
  },
  rivalStop(a) { if (!a.snd) return; try { a.snd.o1.stop(); a.snd.o2.stop(); a.snd.g.disconnect(); } catch (e) {} a.snd = null; },
  boost() {
    if (!this.ctx || !st.sound) return; const C = this.ctx, t = C.currentTime;
    // two bright bings, a fifth apart
    [[1318.5, 0], [1975.5, 0.13]].forEach(([freq, dt0]) => { const t0 = t + dt0; for (const [mult, vol] of [[1, 0.45], [2.76, 0.12], [5.4, 0.05]]) { const o = C.createOscillator(), g = C.createGain(); o.type = 'sine'; o.frequency.value = freq * mult; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32 / Math.sqrt(mult)); o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + 0.4); } });
  },
  crunch(k) {
    if (!this.ctx || !st.sound) return; const t = this.ctx.currentTime;
    this.cg.gain.cancelScheduledValues(t); this.cg.gain.setValueAtTime(0.3 + 0.9 * k, t); this.cg.gain.exponentialRampToValueAtTime(0.001, t + 0.18 + 0.25 * k);
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
    const sq = st.offroad ? 0 : clamp((st.slip - 0.1) * 1.6, 0, 1) * clamp(spd / 8, 0, 1);
    this.tg.gain.setTargetAtTime(sq * 0.55 * on, t, 0.04);
    this.tb.frequency.setTargetAtTime(1200 + 800 * st.slip, t, 0.05);
    this.hg.gain.setTargetAtTime(sq * (st.drift || 0) * 0.28 * on, t, 0.05);
    this.ho.frequency.setTargetAtTime(200 + 160 * st.slip + spd * 1.5, t, 0.08); this.hf.frequency.setTargetAtTime(900 + 900 * st.slip, t, 0.08);
    this.gg.gain.setTargetAtTime((st.offroad ? clamp(spd / 20, 0, 1) * 0.3 : 0) * on, t, 0.05);
    const evOn = m.ev || (spd > 0.5 && x < 0.15);
    this.evg.gain.setTargetAtTime((evOn ? 0.03 + 0.05 * thr : 0) * on * clamp(spd / 3, 0, 1), t, 0.05);
    this.ev.frequency.setTargetAtTime(120 + spd * 26, t, 0.05); this.ev2.frequency.setTargetAtTime(240 + spd * 52, t, 0.05);
    if (!m.ev && thr < 0.05 && st.rpm > 4200 && Math.random() < dt * (st.mode === 3 ? 9 : 4) * on) this.pop();
    for (const a of ai) {
      if (!a.snd) continue;
      const dist = a.pos.distanceTo(st.pos), att = 1 / (1 + (dist / 9) * (dist / 9));
      let gear = 0; while (gear < 7 && CAR.gearTopKmh[gear] < a.u * 3.6 * 1.05) gear++;
      const rpm = clamp(a.u < 1 ? CAR.idle : rpmForGear(a.u, gear), CAR.idle, CAR.redline), xr = rpm / CAR.redline, fa = rpm / 60 * 6;
      a.snd.o1.frequency.setTargetAtTime(fa, t, 0.02); a.snd.o2.frequency.setTargetAtTime(fa * 0.5, t, 0.02);
      a.snd.lp.frequency.setTargetAtTime(350 + 2600 * xr, t, 0.05);
      a.snd.g.gain.setTargetAtTime(att * (0.10 + 0.22 * xr) * on, t, 0.05);
    }
  },
};

// ------------------------------------------------------------------ music, generated (placeholders until Corey's own tracks land)
// B cycles: DOWNTEMPO 100 (Dm · Bb · F · C, swung, soft) → DARK DRIVE 120 (E Phrygian, four-on-the-floor, distorted sub) → off
const music = {
  on: true, track: 0, ctx: null, next: 0, step: 0, timer: null,
  tracks: [
    { name: 'DOWNTEMPO · 100', bpm: 100, len: 64, chords: [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]] },   // Dm · Bb · F · C (MIDI)
    { name: 'DARK DRIVE · 120', bpm: 120, len: 128, chords: [[40, 43, 47], [36, 40, 43], [38, 42, 45], [41, 45, 48]] },  // Em · C · D · F
  ],
  get bpm() { return this.tracks[this.track].bpm; },
  f(n) { return 440 * Math.pow(2, (n - 69) / 12); },
  start(C, out) {
    if (this.ctx) return; this.ctx = C;
    const g = C.createGain(); g.gain.value = 0.32; g.connect(out); this.out = g;
    // the dark track runs through a drive stage on its own bus
    const drv = C.createWaveShaper(); const curve = new Float32Array(512); for (let i = 0; i < 512; i++) { const x = i / 256 - 1; curve[i] = Math.tanh(x * 1.8) * 0.9; } drv.curve = curve; drv.oversample = '2x';
    const dg = C.createGain(); dg.gain.value = 1.15; drv.connect(dg); dg.connect(g); this.drive = drv;
    const dly = C.createDelay(1.0); dly.delayTime.value = 60 / this.bpm * 0.75; const fb = C.createGain(); fb.gain.value = 0.38; const df = C.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 2200;
    dly.connect(df); df.connect(fb); fb.connect(dly); const dw = C.createGain(); dw.gain.value = 0.35; dly.connect(dw); dw.connect(g); this.delay = dly;
    this.padGain = C.createGain(); this.padGain.gain.value = 0.22; const pf = C.createBiquadFilter(); pf.type = 'lowpass'; pf.frequency.value = 900; pf.Q.value = 0.8; this.padGain.connect(pf); pf.connect(g); this.padFilter = pf;
    this.bassGain = C.createGain(); this.bassGain.gain.value = 0.5; const bf = C.createBiquadFilter(); bf.type = 'lowpass'; bf.frequency.value = 500; bf.Q.value = 6; this.bassGain.connect(bf); bf.connect(drv); this.bassFilter = bf;
    const nb = C.createBuffer(1, C.sampleRate, C.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this.noise = nb;
    this.next = C.currentTime + 0.1; this.step = 0;
    this.timer = setInterval(() => this.schedule(), 80);
  },
  cycle() {
    // off → track 0 → track 1 → off
    if (!this.on) { this.on = true; this.track = 0; } else if (this.track < this.tracks.length - 1) { this.track++; } else { this.on = false; }
    if (this.delay) this.delay.delayTime.setTargetAtTime(60 / this.bpm * 0.75, this.ctx.currentTime, 0.05);
    this.step = 0; return this.on ? this.tracks[this.track].name : 'MUSIC OFF';
  },
  osc(type, freq, t0, dur, vol, dest, a = 0.005, r = 0.1, detune = 0) {
    const C = this.ctx, o = C.createOscillator(), v = C.createGain(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
    v.gain.setValueAtTime(0.0001, t0); v.gain.exponentialRampToValueAtTime(vol, t0 + a); v.gain.setValueAtTime(vol, t0 + dur); v.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + r);
    o.connect(v); v.connect(dest || this.out); o.start(t0); o.stop(t0 + dur + r + 0.05);
  },
  hit(t0, cutoff, vol, dur, q = 0.7, dest) {
    const C = this.ctx, n = C.createBufferSource(); n.buffer = this.noise; const f = C.createBiquadFilter(); f.type = cutoff > 3000 ? 'highpass' : 'bandpass'; f.frequency.value = cutoff; f.Q.value = q;
    const v = C.createGain(); v.gain.setValueAtTime(vol, t0); v.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); n.connect(f); f.connect(v); v.connect(dest || this.out); n.start(t0); n.stop(t0 + dur + 0.02);
  },
  kick(t0, hard) {
    const C = this.ctx, o = C.createOscillator(), v = C.createGain(); o.frequency.setValueAtTime(hard ? 190 : 150, t0); o.frequency.exponentialRampToValueAtTime(hard ? 44 : 42, t0 + (hard ? 0.07 : 0.09)); v.gain.setValueAtTime(hard ? 1.1 : 0.9, t0); v.gain.exponentialRampToValueAtTime(0.001, t0 + (hard ? 0.42 : 0.34)); o.connect(v); v.connect(hard ? this.drive : this.out); o.start(t0); o.stop(t0 + 0.5);
    if (hard) this.hit(t0, 3500, 0.5, 0.02, 1);                                                    // click on the front
    // sidechain: pads and bass duck under every kick
    for (const gn of [this.padGain, this.bassGain]) { const base = gn === this.padGain ? 0.22 : 0.5; gn.gain.cancelScheduledValues(t0); gn.gain.setValueAtTime(base * 0.35, t0); gn.gain.linearRampToValueAtTime(base, t0 + (hard ? 0.22 : 0.28)); }
  },
  bass(freq, t0, dur, vol) {
    // distorted sub: two saws an octave apart into the resonant low-pass, then the drive
    const C = this.ctx;
    this.osc('sawtooth', freq, t0, dur, vol, this.bassGain, 0.004, 0.05);
    this.osc('sawtooth', freq * 2.005, t0, dur, vol * 0.35, this.bassGain, 0.004, 0.05, 8);
    this.osc('sine', freq * 0.5, t0, dur, vol * 0.9, this.drive, 0.004, 0.06);
    this.bassFilter.frequency.cancelScheduledValues(t0); this.bassFilter.frequency.setValueAtTime(1400, t0); this.bassFilter.frequency.exponentialRampToValueAtTime(380, t0 + dur + 0.05);
  },
  schedule() {
    const C = this.ctx, spb = 60 / this.bpm, s16 = spb / 4, T = this.tracks[this.track];
    while (this.next < C.currentTime + 0.6) {
      const st16 = this.step % T.len, bar = Math.floor(st16 / 16), beat = st16 % 16;
      if (this.on && st.sound) {
        if (this.track === 0) {
          const t = this.next + (beat % 2 ? s16 * 0.11 : 0), ch = T.chords[bar];   // light swing
          if (beat === 0 || beat === 8 || beat === 11 || (bar === 3 && beat === 14)) this.kick(t);
          if (beat === 4 || beat === 12) { this.hit(t, 1800, 0.5, 0.18, 0.6); this.osc('triangle', 190, t, 0.02, 0.35, null, 0.002, 0.08); }
          if (beat % 2 === 0) this.hit(t, 8000, beat % 4 === 2 ? 0.16 : 0.09, 0.05);
          if ((beat === 7 || beat === 15) && Math.random() < 0.5) this.hit(t + s16 / 2, 9000, 0.1, 0.04);
          if (beat === 0) { for (const n of ch) { this.osc('sawtooth', this.f(n), t, spb * 3.6, 0.09, this.padGain, 0.6, 0.6, -6); this.osc('sawtooth', this.f(n), t, spb * 3.6, 0.09, this.padGain, 0.6, 0.6, 6); } this.padFilter.frequency.setValueAtTime(700, t); this.padFilter.frequency.linearRampToValueAtTime(1500, t + spb * 2); this.padFilter.frequency.linearRampToValueAtTime(800, t + spb * 4); }
          if (beat === 0 || beat === 6 || beat === 10) this.osc('sine', this.f(ch[0] - 24), t, beat === 0 ? spb * 1.4 : spb * 0.6, 0.55, null, 0.01, 0.12);
          if (beat === 13 && bar % 2) this.osc('sine', this.f(ch[0] - 12), t, spb * 0.5, 0.35, null, 0.01, 0.1);
          if (beat % 4 === 2 || (beat === 15 && bar === 1)) { const n = ch[(Math.floor(st16 / 3) + bar) % 3] + 12; this.osc('triangle', this.f(n), t, 0.08, 0.16, this.delay, 0.004, 0.12); }
        } else {
          // DARK DRIVE: straight 16ths, four on the floor, rolling Phrygian bass, clap on 2 and 4, an 8-bar riser
          const t = this.next, ch = T.chords[bar % 4], root = ch[0], phr = bar % 8 >= 4;
          if (beat % 4 === 0) this.kick(t, true);
          if (beat === 4 || beat === 12) { this.hit(t, 1500, 0.55, 0.16, 0.5); this.hit(t + 0.012, 2600, 0.35, 0.12, 0.8); this.hit(t + 0.024, 1900, 0.3, 0.2, 0.6); }   // layered clap
          if (beat % 2 === 1) this.hit(t, 7500, 0.2, 0.09);                                       // open hats on the offbeat
          else if (beat % 4 === 2) this.hit(t, 9000, 0.08, 0.03);
          if (bar % 2 === 1 && beat === 15) this.hit(t, 1200, 0.3, 0.08, 1.5);                    // rim on the turn
          // bass: 16th pulse on the root with the Phrygian b2 and the 5th on the pickups; rests leave the kick room
          const pat = [0, 0, 12, 0, 0, 7, 0, 0, 0, 0, 12, 0, 1, 0, 7, 3], hold = [1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1];
          if (hold[beat]) this.bass(this.f(root - 12 + pat[beat]), t, s16 * 0.55, 0.32);
          // stabs: minor chord on the one and the "and" of three, darker every second phrase
          if (beat === 0 || beat === 10) { for (const n of ch) { this.osc('sawtooth', this.f(n), t, beat === 0 ? spb * 0.9 : spb * 0.45, 0.10, this.padGain, 0.01, 0.25, -9); this.osc('square', this.f(n - 12), t, beat === 0 ? spb * 0.9 : spb * 0.45, 0.05, this.padGain, 0.01, 0.25, 6); } this.padFilter.frequency.setValueAtTime(phr ? 2600 : 1600, t); this.padFilter.frequency.exponentialRampToValueAtTime(420, t + spb * 0.8); }
          // lead: sparse minor-pentatonic 16ths into the delay in the second half of the phrase
          if (phr && (beat === 3 || beat === 6 || beat === 9 || beat === 14)) { const scale = [0, 3, 5, 7, 10, 12]; const n = root + 24 + scale[(bar * 3 + beat) % 6]; this.osc('square', this.f(n), t, 0.07, 0.07, this.delay, 0.003, 0.1); }
          // riser: a noise sweep and a rising tone over the last bar of every 8
          if (bar === 7 && beat === 0) { const n = C.createBufferSource(); n.buffer = this.noise; const f = C.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(6000, t + spb * 4); const v = C.createGain(); v.gain.setValueAtTime(0.001, t); v.gain.exponentialRampToValueAtTime(0.35, t + spb * 3.9); v.gain.setValueAtTime(0.0001, t + spb * 4); n.connect(f); f.connect(v); v.connect(this.out); n.start(t); n.stop(t + spb * 4.05);
            const o = C.createOscillator(), og = C.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(this.f(root), t); o.frequency.exponentialRampToValueAtTime(this.f(root + 12), t + spb * 4); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.12, t + spb * 3.9); og.gain.setValueAtTime(0.0001, t + spb * 4); o.connect(og); og.connect(this.padGain); o.start(t); o.stop(t + spb * 4.05); }
        }
      }
      this.next += s16; this.step++;
    }
  },
};

// ------------------------------------------------------------------ physics
const torqueFactor = rpm => { const x = rpm / CAR.redline; let t = 0.82 + 0.18 * smoothstep(0.12, 0.72, x); if (x > 0.96) t *= 1 - (x - 0.96) * 5; return t; };   // e-motors fill the low end
const rpmForGear = (u, g) => Math.abs(u) * 3.6 / CAR.gearTopKmh[g] * CAR.redline;
function step(dt) {
  const m = MODES[st.mode];
  // input shaping
  const rate = Math.abs(inp.steer) > Math.abs(st.steer) ? 5.5 : 9.0;   // quicker steering response
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
  // nitrous: hold N. ~1500 CV while the tank lasts (5 s), refills slowly when released
  if (st.nos <= 0.02) st.nosEmpty = true; else if (st.nos > 0.25) st.nosEmpty = false;   // hysteresis: an empty tank must refill to a quarter before it fires again
  const wantNos = inp.nos && !m.ev && st.throttle > 0.2 && !st.nosEmpty && !st.air;
  if (wantNos && !st.nosOn) audio.nosStart();
  if (!wantNos && st.nosOn) audio.nosStop();
  st.nosOn = wantNos;
  // drift boost: NOS while sliding is the big one. The tank is charged by drifting (a trickle otherwise)
  if (st.nosOn && (st.drift || 0) > 0.5) st.driftBoostT = 2.0; else st.driftBoostT = Math.max(0, (st.driftBoostT || 0) - dt);   // latched: two seconds of rocket once it fires
  const driftBoost = st.nosOn && st.driftBoostT > 0;
  if (driftBoost && !st.driftBoostOn) { flash('DRIFT BOOST', 900, '#b48cff'); audio.beep(1760, 0.18); }
  st.driftBoostOn = driftBoost;
  if (st.nosOn) { st.nos = Math.max(0, st.nos - dt / 5); st.glow = Math.max(st.glow || 0, driftBoost ? 1 : 0.9); st.shake = Math.max(st.shake || 0, driftBoost ? 0.2 : 0.12); }
  else { const charge = 0.012 + (st.drift || 0) * clamp(Math.abs(st.slipAng || 0) / 0.45, 0, 1) * clamp(v / 15, 0, 1) * 0.30; st.nos = Math.min(1, st.nos + dt * charge); }
  const nosMul = driftBoost ? 2.0 : st.nosOn ? 1.5 : 1;
  const Pe = CAR.powerW * CAR.drivelineEff * m.power * nosMul;
  const Ftrac = CAR.mass * G * CAR.tractionG * (st.offroad ? 0.45 : 1) * (m.ev ? 0.5 : 1) * (st.nosOn ? 1.35 : 1);
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
  const fr0 = sampleAt(st.s), slope = fr0.t.y * Math.cos(st.psi) + fr0.b.y * Math.sin(st.psi);   // component of 'up' along the car's forward
  if (st.boostCd > 0) st.boostCd -= dt;
  if (st.boostT > 0) { st.boostT -= dt; F += CAR.mass * 7.5; }                     // booster: +7.5 m/s² for 1.3 s
  if (st.nosOn) F += CAR.mass * (driftBoost ? 7.0 : 3.0);                            // the shove you feel in the seat; a drift boost is a kick
  if (BOOST[fr0.i] && !st.air && st.boostCd <= 0 && st.u > 2) { st.boostT = 1.3; st.boostCd = 0.9; st.glow = 1; audio.boost(); }
  let du = st.air ? 0 : (F - Fd - Fr - Feb) / CAR.mass * dt - G * slope * dt;
  st.u += du;
  const bDecel = st.air ? 0 : Fb / CAR.mass * dt;
  if (v > 0) { if (Math.abs(st.u) <= bDecel) st.u = 0; else st.u -= Math.sign(st.u) * bDecel; }
  if (v < 0.05 && Math.abs(F) < 1) st.u = 0;
  if (GAME.state === 'countdown') { st.u = 0; st.w = 0; }                           // on the grid: rev it, but the lights are red
  // lateral / yaw
  let mu = m.grip * (st.offroad ? 0.42 : 1); if (st.hand) mu *= 0.45;
  const dmax = Math.min(0.70, Math.atan(CAR.wheelbase * 2.3 * mu * G / Math.max(st.u * st.u, 1)));   // more lock at speed: sharper turn-in, the tyres decide when it slides
  st.delta = st.steer * dmax;
  let wTarget = st.u / CAR.wheelbase * Math.tan(st.delta);
  const slipAng = Math.atan2(st.w, Math.abs(st.u) + 0.5);
  // drifting: the handbrake, or power-oversteer in Sport / Corsa (hard throttle + steering at 30–150 km/h), or an
  // already-sliding car — the rear loses grip, the car rotates more, and the slide is held rather than snapped back
  const powerOver = !m.ev && m.stab < 0.9 && st.throttle > 0.7 && Math.abs(st.steer) > 0.45 && v > 8 && v < 42;
  st.slipAng = slipAng;
  const inDrift = (st.drift || 0) > 0.5;
  const drifting = (st.hand && v > 3) || powerOver || (Math.abs(slipAng) > (inDrift ? 0.09 : 0.22) && v > 8) || (inDrift && st.throttle > 0.5 && Math.abs(st.steer) > 0.2 && v > 6);
  st.drift = damp(st.drift || 0, drifting ? 1 : 0, drifting ? 10 : 1.6, dt);
  wTarget *= 1 / (1 + Math.abs(slipAng) * (1.2 + 1.6 * m.stab) * (1 - 0.6 * st.drift));
  if (st.hand && v > 3) wTarget *= 2.2; else if (powerOver) wTarget *= 1.45;
  if (drifting) { mu *= 1 - 0.36 * st.drift; if (st.throttle > 0.5 && !st.hand) wTarget *= 1 + 0.25 * st.drift; }   // the slide holds while you stay on the power
  if (driftBoost) mu *= 1.4;                                                                                            // the boost hooks up and fires you out of the slide
  if (st.spinT > 0) { st.spinT -= dt; wTarget = st.spinW; mu *= 0.32; st.spinW *= Math.max(0, 1 - dt * 0.5); st.drift = Math.max(st.drift, 0.85); }   // spun by contact: the rear is gone, the car goes round
  if (v < 2.5 && st.throttle > 0.2 && !st.reverse) wTarget += st.steer * 1.0 * (1 - v / 2.5);   // pivot: the car can turn on the spot under power, so a spin never leaves you stranded
  st.yaw = damp(st.yaw, wTarget, 1 / 0.06, dt);
  // facing backwards and stopped with the throttle down: swing the nose round rather than driving off the wrong way
  if (!st.air && Math.abs(st.psi) > 1.75 && v < 3 && st.throttle > 0.3 && st.spinT <= 0) { st.turnT = (st.turnT || 0) + dt; if (st.turnT > 0.6) { if (st.turnT - dt <= 0.6) flash('TURNING AROUND', 900); st.psi = damp(st.psi, 0, 5, dt); st.yaw = 0; st.u = Math.abs(st.u); st.w = 0; } }
  else st.turnT = 0;
  const uPrev = st.u, wPrev = st.w;
  st.w += st.yaw * uPrev * dt; st.u -= st.yaw * wPrev * dt;
  const k = (11 + 8 * m.stab) * (1 - 0.62 * st.drift * (driftBoost ? 0.25 : 1));
  st.aLat = clamp(st.w * k, -mu * G, mu * G);
  st.w -= st.aLat * dt;
  if (v < 0.8) st.w *= Math.max(0, 1 - dt * 6);
  st.slip = damp(st.slip, Math.min(1, Math.abs(st.w) / 5 + Math.abs(slipAng) * 1.2), 12, dt);
  st.aLong = damp(st.aLong, (st.u - u0) / dt, 6, dt);
  // integrate in track coordinates: s along, d right, psi heading relative to the tangent
  const kap = KAPPA[fr0.i], cp = Math.cos(st.psi), sp = Math.sin(st.psi);
  if (st.air) {
    // ballistic flight: world velocity, gravity, light air control; land when back over road at road height
    st.airT += dt; st.vel.y -= G * dt;
    // the gap's road bends: the flight follows most of that bend (a clean, straight take-off lands on line at any speed
    // that clears the gap) and the stick has a little real authority. Angled take-offs and short flights still miss
    const frA = sampleAt(st.s), hv = st.vel.clone(); hv.y = 0;
    const sDotA = hv.dot(frA.t), turn = KAPPA[frA.i] * sDotA * dt * 0.9 + st.steer * 0.35 * dt;
    if (turn) { const c = Math.cos(turn), sn = Math.sin(turn), vx = st.vel.x, vz = st.vel.z; st.vel.x = vx * c + vz * sn; st.vel.z = -vx * sn + vz * c; hv.set(st.vel.x, 0, st.vel.z); }
    { const bh = frA.b.clone().setY(0).normalize(), latV = hv.dot(bh); st.vel.addScaledVector(bh, -latV * (1 - Math.exp(-dt * 1.2))); hv.set(st.vel.x, 0, st.vel.z); }   // sideways drift bleeds off: within ~4° of straight lands, sloppier still misses
    st.pos.addScaledVector(st.vel, dt);
    st.s = ((st.s + hv.dot(frA.t) * dt) % trackLen + trackLen) % trackLen; st.d += hv.dot(frA.b) * dt;
    st.yaw = damp(st.yaw, st.steer * 0.6, 4, dt); st.psi += -st.yaw * dt;
    const frB = sampleAt(st.s), roadY = frB.p.y + frB.b.y * st.d, over = !JUMP[frB.i];
    st.fwd.lerp(st.vel.clone().normalize(), 1 - Math.exp(-dt * 3)).normalize(); st.up.copy(WORLD_UP); st.right.crossVectors(st.fwd, st.up); st.up.crossVectors(st.right, st.fwd).normalize();
    st.x = st.pos.x; st.y = st.pos.y; st.z = st.pos.z; st.theta = Math.atan2(-st.fwd.z, st.fwd.x); st.trackIdx = frB.i;
    const gone = st.pos.y < roadY - 30 || st.airT > 9 || Math.abs(st.d) > D_WALL + 40;
    if (st.airT > 90) flash('MISSED · RESET', 1400);
    const missed = over && st.pos.y <= roadY + 0.1 && st.vel.y <= 0 && Math.abs(st.d) > ROAD_HALF + 0.3;   // came down on the verge or beyond: that is a miss
    if (!missed && over && st.pos.y <= roadY + 0.1 && st.vel.y <= 0) {
      // touchdown: keep the along-road speed, drop the rest
      const cpB = Math.cos(st.psi), spB = Math.sin(st.psi), fwdB = frB.t.clone().multiplyScalar(cpB).addScaledVector(frB.b, spB);
      st.u = st.vel.dot(fwdB); st.w = st.vel.dot(new THREE.Vector3().crossVectors(fwdB, frB.n)) * 0.5; st.air = false;
      st.d = clamp(st.d, -D_HIT + 0.1, D_HIT - 0.1); st.shake = Math.max(st.shake || 0, clamp(-st.vel.y / 25, 0.15, 1)); audio.crunch(clamp(-st.vel.y / 40, 0.05, 0.5)); flash('LANDED', 700); syncPose();
    } else if (missed || gone || (!over && st.pos.y < roadY - 3 && st.airT > 0.6)) {
      // missed the landing (or fell through the gap): straight back to the run-up. Never let it keep falling
      // back to a standing start 350 m before the kicker so the attempt can be repeated with a full run-up
      let back = frB.i, bestD = 1e9; for (const J of JUMPS) { const dI = ((frB.i - J.i0) % N + N) % N; if (dI < 260 && dI < bestD) { bestD = dI; back = J.i0; } }   // the kicker this flight left from
      back = (back - Math.round(350 / (trackLen / N)) + N) % N;
      placeOnTrack(back); st.resets++; st.hits++; flash('RESET · RUN IT AGAIN', 1400); audio.crunch(0.8); st.shake = 1;
    }
    st.offroad = false; st.slip = 0;
  } else {
  const sDot = (st.u * cp - st.w * sp) / Math.max(0.3, 1 + kap * st.d), dDot = st.u * sp + st.w * cp;
  st.psi += (-st.yaw + kap * sDot) * dt;   // psi > 0 = heading right of the tangent; yaw > 0 = turning left; a left-turning track (kap > 0) leaves the car heading right of it
  st.psi = Math.atan2(Math.sin(st.psi), Math.cos(st.psi));
  st.s = ((st.s + sDot * dt) % trackLen + trackLen) % trackLen;
  st.d += dDot * dt;
  // take-off: leaving the road at a gap. The kicker lip gives at least a 12° launch so the arc is real
  if (JUMP[sampleAt(st.s).i] && st.u > 3) {
    const fr1 = sampleAt(st.s), f1 = fr1.t.clone().multiplyScalar(cp).addScaledVector(fr1.b, sp);
    const pitch = Math.max(Math.asin(clamp(f1.y, -1, 1)), 0.21), hor = f1.clone().setY(0).normalize();
    st.vel.copy(hor).multiplyScalar(st.u * Math.cos(pitch)); st.vel.y = st.u * Math.sin(pitch);
    st.vel.addScaledVector(new THREE.Vector3().crossVectors(f1, fr1.n), st.w);
    syncPose(); st.air = true; st.airT = 0; flash('AIR', 600);
  }
  // boundary walls: speed retained = 1 - 0.85·sin(impact angle); lateral bounce with 0.35 restitution; the wall straightens the car
  if (st.hitT > 0) st.hitT -= dt;
  if (Math.abs(st.d) > D_HIT) {
    const sideW = Math.sign(st.d), vn = Math.abs(dDot), phi = Math.atan2(vn, Math.abs(st.u) + 0.1);
    const retain = clamp(1 - 0.85 * Math.sin(phi) - 0.02, 0.12, 1);
    if (st.hitT <= 0) { st.hits++; st.hitT = 0.25; const k = clamp(vn / 12, 0.1, 1); audio.crunch(k); if (k > 0.25) flash('WALL', 500); st.shake = Math.max(st.shake || 0, k); }
    st.u *= retain; st.w = -st.w * 0.35; st.psi = -sideW * Math.abs(st.psi) * 0.4; st.yaw *= 0.3;
    st.d = sideW * (D_HIT - 0.02);
  }
  contacts(dt);
  }
  if (!st.air) syncPose();
  // track relation
  if (!st.air) st.offroad = Math.abs(st.d) > ROAD_HALF + 0.8;
  const p = st.trackIdx / N;
  if (p > 0.45 && p < 0.55) st.halfSeen = true;
  if (st.lastP > 0.92 && p < 0.08 && st.u > 2) {
    const now = performance.now(); st.crossings++;
    if (st.lapStart != null && st.halfSeen) {
      st.lapLast = now - st.lapStart; st.lapsDone++; GAME.lapTimes.push(st.lapLast);
      if (st.lapBest == null || st.lapLast < st.lapBest) { st.lapBest = st.lapLast; try { localStorage.setItem('revuelto.best', String(st.lapBest)); } catch (e) {} flash('NEW BEST ' + fmtTime(st.lapBest), 2500); }
      else flash('LAP ' + fmtTime(st.lapLast), 2000);
      if (GAME.state === 'racing' && st.lapsDone >= GAME.laps) finishRace(now);
    } else if (GAME.mode === 'solo') flash('LAP STARTED', 1200);
    st.lapStart = now; st.halfSeen = false;
  }
  st.lastP = p;
  st.vmax = Math.max(st.vmax, v * 3.6);
  // top speed record: beat it, and the moment the speed comes off the peak it is announced
  if (v * 3.6 > st.record + 0.5 && !st.air) { st.record = v * 3.6; st.recordPend = true; }
  else if (st.recordPend && v * 3.6 < st.record - 4) { st.recordPend = false; try { localStorage.setItem('revuelto.vmax', String(Math.round(st.record))); } catch (e) {} flash('NEW TOP SPEED · ' + Math.round(st.record) + ' KM/H', 2600, '#ff2a2a'); audio.record(); }
  // wheels
  const dist = st.u * dt;
  for (const w of wheels) { w.spin.rotation.z -= dist / w.r; w.steer.rotation.y = w.front ? st.delta : 0; }
  if (customWheels) for (const w of customWheels) { w.node.rotation.x += dist / 0.35; w.node.rotation.y = w.front ? st.delta : 0; }
}

// ------------------------------------------------------------------ camera
// bonnet view: everything on the player's car above eye level is clipped away so the road stays visible through the cabin
const EYE = { h: 0.98, fwd: 0.10, side: -0.36, lookH: 0.70 };
const roofClip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e9);
renderer.localClippingEnabled = true;
function applyRoofClip() { (customModel || procBody).traverse(o => { if (o.isMesh && o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { m.clippingPlanes = [roofClip]; m.clipShadows = true; } } }); }
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmpV = new THREE.Vector3(), fwd = new THREE.Vector3(), velDir = new THREE.Vector3();
let camInit = false;
function updateCamera(dt) {
  const v = Math.abs(st.u), f = st.fwd, n = st.up, r = st.right, pos = st.pos;
  let target, look;
  if (st.cam === 2) {   // driver's eye: over the wheel on the left seat, roof clipped above it
    const E = window.__eye || EYE;
    target = pos.clone().addScaledVector(n, E.h).addScaledVector(f, E.fwd).addScaledVector(r, E.side); look = pos.clone().addScaledVector(n, E.lookH).addScaledVector(f, 40).addScaledVector(r, E.side);
  }
  else if (st.cam === 3) { target = pos.clone().addScaledVector(n, 0.55).addScaledVector(f, 2.7); look = pos.clone().addScaledVector(n, 0.55).addScaledVector(f, 40); }
  else if (st.cam === 4) { const a = 0.6 + performance.now() * 0.00012; target = pos.clone().addScaledVector(f, Math.cos(a) * 7.5).addScaledVector(r, -Math.sin(a) * 7.5).addScaledVector(n, 1.7); look = pos.clone().addScaledVector(n, 0.6); }
  else {
    const d = st.cam === 0 ? 6.6 : 4.8, h = st.cam === 0 ? 1.9 : 1.3;
    target = pos.clone().addScaledVector(n, h).addScaledVector(f, -d);
    look = pos.clone().addScaledVector(n, 0.95).addScaledVector(f, 3.5);
  }
  if (!camInit || st.snapCam || (st.cam >= 2 && st.cam !== 4)) { camPos.copy(target); camLook.copy(look); camInit = true; st.snapCam = false; }
  else { camPos.lerp(target, 1 - Math.exp(-dt * 6.5)); camLook.lerp(look, 1 - Math.exp(-dt * 9)); }
  camera.up.lerp(n, 1 - Math.exp(-dt * 8)).normalize();
  camera.position.copy(camPos);
  if (st.cam < 2 && v > 60) camera.position.addScaledVector(n, (Math.random() - 0.5) * 0.02 * (v - 60) / 40);
  if (st.shake > 0.01) { camera.position.addScaledVector(r, (Math.random() - 0.5) * 0.25 * st.shake).addScaledVector(n, (Math.random() - 0.5) * 0.15 * st.shake); st.shake *= Math.exp(-dt * 6); }
  camera.lookAt(camLook);
  if (st.cam === 2) { roofClip.normal.copy(n).negate(); roofClip.constant = n.dot(camera.position) + 0.03; } else roofClip.constant = 1e9;
  const fov = 60 + 24 * clamp(v / 95, 0, 1) + (st.nosOn ? 9 : 0) + (st.cam === 2 ? 6 : 0);
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
  for (const a of ai) { c.fillStyle = '#' + a.hex.toString(16).padStart(6, '0'); c.beginPath(); c.arc(a.pos.x * miniPath.sc + miniPath.ox, a.pos.z * miniPath.sc + miniPath.oz, 5, 0, Math.PI * 2); c.fill(); }
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
    $('hits').textContent = String(st.hits);
    updateRaceHUD();
    $('nos-fill').style.width = Math.round(st.nos * 100) + '%'; $('nos').classList.toggle('on', st.nosOn);
    $('status').textContent = st.offroad ? 'OFF TRACK' : ((st.drift || 0) > 0.5 ? 'DRIFT' : (st.slip > 0.35 ? 'SLIDING' : ''));
    $('vignette').style.opacity = String(0.25 + 0.5 * clamp(Math.abs(st.u) / 95, 0, 1));
  }
}

// ------------------------------------------------------------------ main loop
const FIXED = 1 / 120; let acc = 0, last = performance.now(), frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  readInput();
  if (st.started) { acc += dt; while (acc >= FIXED) { step(FIXED); acc -= FIXED; } raceTick(dt); audio.update(dt); }
  car.position.copy(st.pos); car.quaternion.copy(basisQuat(st.fwd, st.up));
  underglow.position.copy(st.pos).addScaledVector(st.up, 0.25);
  st.glow = Math.max(0, (st.glow || 0) - dt * 0.9);
  glowCol.copy(GLOW_BLUE).lerp(GLOW_PURPLE, st.glow);
  underglow.color.copy(glowCol); underglow.intensity = 2.6 + 7 * st.glow;
  glowDisc.material.color.copy(glowCol); glowDisc.material.opacity = 0.5 + 0.5 * st.glow; glowDisc.scale.setScalar(1 + 0.35 * st.glow);
  gridMat.uniforms.uGlow.value = st.glow;
  tronMat.uniforms.uTime.value = now / 1000; car.updateMatrixWorld(); tronMat.uniforms.uCarInv.value.copy(car.matrixWorld).invert();
  boostMat.color.setHSL(0.53, 1, 0.5 + 0.22 * Math.sin(now * 0.008));
  rig.position.copy(car.position); rig.quaternion.copy(car.quaternion); studio.position.copy(car.position);
  trailUpdate();
  gridMat.uniforms.uCar.value.copy(car.position); gridMat.uniforms.uTime.value = now / 1000;
  if (window.__signAnimate) window.__signAnimate(now);
  if ((frames & 1) === 0) { car.visible = false; mirror.visible = false; for (const a of ai) a.grp.visible = a.pos.distanceToSquared(st.pos) < 45 * 45; cubeCam.position.copy(st.pos).addScaledVector(st.up, 0.7); cubeCam.update(renderer, scene); car.visible = true; mirror.visible = true; for (const a of ai) a.grp.visible = true; }
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
window.__sim = { music, audio, announcer, liveryTex, DIFFS, resolveContact, GAME, ai, startRace, raceTick, updateRaceHUD, RIVALS, VLIM, contacts, st, inp, trailUpdate, PAINTS, TUNNELS, KAPPA, CUM, trackLen, LOOP, UNDER, JUMP, ROLL, JUMPS, sampleAt, D_WALL, loadGLBBuffer, installModel, camera, renderer, scene, roadMesh, ground, S, T, N, placeOnTrack, step, MODES, CAR, setMode, setPaint, keys, startGame };
})();
