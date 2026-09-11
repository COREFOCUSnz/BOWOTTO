/* REVUELTO SIM — browser driving simulator (Three.js r128, Web Audio)
   Core Focus Productions. Arcade-realistic vehicle model tuned to the
   Lamborghini Revuelto (LB744): 1900 kg, 2.779 m wheelbase, 1015 CV,
   AWD, 8-speed DCT, 9500 rpm redline, ~350 km/h. */
(() => {
'use strict';

const VERSION = '1.0.0';   // bumped by hand, only when Corey says so. Painted in the HUD, the start screen and Settings

// ------------------------------------------------------------------ config
const CAR = {
  mass: 1900, wheelbase: 2.779, length: 4.947, width: 2.033, height: 1.16,
  powerW: 746000, drivelineEff: 0.85, tractionG: 1.22, brakeG: 1.3,
  dragK: 0.70, rolling: 280, redline: 9500, idle: 1000,
  gearTopKmh: [78, 118, 158, 200, 245, 290, 335, 380],
  wheelR: [0.34, 0.36], track: 0.84, axle: 1.39,
};
// The cars. CAR above is the live spec (the physics reads it every step); picking a car copies its spec in. The Revuelto is
// baked into the page; other cars are files next to the hosted page, fetched the first time they are chosen, so they exist
// on lambo-sim.web.app only. Each entry says how its download is tidied up: the stage junk to drop, which materials are
// the paint, the wheel groups when the wheels are not named, and which way the nose points.
const CARS = {
  revuelto: { name: 'REVUELTO', sub: 'HYBRID V12 · 1015 CV · 1900 KG', price: 0, embedded: true, spec: { ...CAR } },
  aventador: { name: 'AVENTADOR SVJ', sub: 'V12 · 770 CV · 1525 KG', price: 650000, ev: false, file: 'aventador.glb', yaw: Math.PI, hide: /^(Text|Plane)/i, wheelGroups: /^pneu/i, paintMats: ['Material.001', 'Material.005'], nomap: true, spin: -1,
    note: 'HOSTED SITE ONLY · MODEL BY SDC PERFORMANCE · CC BY-NC 4.0',
    spec: { mass: 1525, wheelbase: 2.7, length: 4.943, width: 2.098, height: 1.136, powerW: 566000, drivelineEff: 0.85, tractionG: 1.25, brakeG: 1.32, dragK: 0.66, rolling: 260, redline: 8700, idle: 1000, gearTopKmh: [82, 120, 160, 200, 245, 290, 340, 352], wheelR: [0.34, 0.36], track: 0.84, axle: 1.35 } },
  countach: { name: 'COUNTACH 25TH', sub: 'V12 · 455 CV · 1490 KG · 1988', price: 500000, file: 'countach.glb', ev: false, paintMats: ['Material.001'],
    bones: { spin: /bone_wheel_(fl|fr|bl|br)_rotation/i, steer: /bone_wheel_(fl|fr|bl|br)_steer/i },
    note: 'HOSTED SITE ONLY · MODEL BY AMOGUSSTRIKESBACK2 · CC BY 4.0',
    spec: { mass: 1490, wheelbase: 2.5, length: 4.14, width: 2.0, height: 1.07, powerW: 335000, drivelineEff: 0.82, tractionG: 1.02, brakeG: 1.05, dragK: 0.86, rolling: 300, redline: 7000, idle: 900, gearTopKmh: [60, 95, 135, 180, 235, 295, 295, 295], wheelR: [0.32, 0.34], track: 0.86, axle: 1.25 } },
  lpi: { name: 'COUNTACH LPI 800-4', sub: 'HYBRID V12 · 814 CV · 1595 KG · 2022 · 112 BUILT', price: 850000, file: 'lpi.glb',
    paintMats: ['lLamborghini_CountachLPI8004_2022Paint_Material1'],
    note: 'HOSTED SITE ONLY · MODEL BY 007 · CC BY 4.0',
    spec: { mass: 1595, wheelbase: 2.7, length: 4.87, width: 2.099, height: 1.139, powerW: 599000, drivelineEff: 0.86, tractionG: 1.2, brakeG: 1.28, dragK: 0.68, rolling: 270, redline: 8500, idle: 950, gearTopKmh: [80, 120, 160, 202, 248, 292, 336, 355], wheelR: [0.34, 0.36], track: 0.84, axle: 1.35 } },
  sc18: { name: 'SC18 ALSTON', sub: 'V12 · 770 CV · 1490 KG · 2019 · ONE-OFF', price: 950000, file: 'sc18.glb', ev: false,
    bones: { spin: /3DWheel_((?:Front|Rear)_[LR])/i, steer: /3DWheel_((?:Front|Rear)_[LR])/i },
    paintMats: ['Paint', 'LamboLamborghini_SC18Alston_2019PaintA_Material1'], nomap: true,
    note: 'HOSTED SITE ONLY · MODEL BY DDIAZ DESIGN · CC BY-NC-SA 4.0',
    spec: { mass: 1490, wheelbase: 2.7, length: 4.97, width: 2.15, height: 1.15, powerW: 566000, drivelineEff: 0.85, tractionG: 1.30, brakeG: 1.35, dragK: 0.70, rolling: 260, redline: 8700, idle: 1000, gearTopKmh: [79, 115, 154, 192, 235, 278, 326, 338], wheelR: [0.34, 0.36], track: 0.87, axle: 1.35 } },
};
let carId = 'revuelto'; const carRoots = {};
const MODES = [
  { name: 'CITTÀ',  sub: 'EV · 180 CV',        power: 0.18, grip: 1.55, stab: 1.0, ev: true,  color: '#4cc9f0' },
  { name: 'STRADA', sub: 'HYBRID · 886 CV',    power: 0.85, grip: 1.60, stab: 1.0, ev: false, color: '#f4f1ea' },
  { name: 'SPORT',  sub: 'HYBRID · 907 CV',    power: 0.92, grip: 1.50, stab: 0.55, ev: false, color: '#ff8c1a' },
  { name: 'CORSA',  sub: 'HYBRID · 1015 CV',   power: 1.00, grip: 1.75, stab: 0.8, ev: false, color: '#ff2a2a' },
];
const PAINTS = [   // official Lamborghini names; the bar shows all but the first
  { name: 'AS DOWNLOADED', hex: 0xff2a03, original: true, price: 0 },
  { name: 'ARANCIO APODIS', hex: 0xc22e08, price: 0 }, { name: 'VERDE SCANDAL', hex: 0x22b400, price: 6000 }, { name: 'GIALLO INTI', hex: 0xffd200, price: 8000 },
  { name: 'NERO HELENE', hex: 0x0a0a0c, price: 4000 },  { name: 'BIANCO SIDERALE', hex: 0xf2f2ec, price: 4000 }, { name: 'ROSSO MARS', hex: 0xd40015, price: 8000 },
  { name: 'BLU URANUS', hex: 0x0a3cff, price: 8000 },   { name: 'VIOLA PASIFAE', hex: 0x5a2d91, price: 12000 }, { name: 'GRIGIO TELESTO', hex: 0x8b8f94, price: 5000 },
  { name: 'VERDE MANTIS', hex: 0x30d21c, price: 10000 }, { name: 'BLU LE MANS', hex: 0x1d3bb0, price: 12000 }, { name: 'ARANCIO BOREALIS', hex: 0xff7a00, price: 10000 },
  { name: 'CORE FOCUS LIVERY', hex: 0x15181f, livery: true, price: 15000 },
  { name: 'TRON LEGACY', hex: 0x2ee6ff, shader: true, price: 20000 },
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
// ------------------------------------------------------------------ tracks
// Six circuits, each a Catmull-Rom loop of [x, z, y] control points plus loops, jumps and corkscrews, and a theme that
// decides sky, ground, walls and scenery. The choice is remembered and the page rebuilds itself for it on load.
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const TRACKS = {
  grid: { name: 'THE GRID', sub: 'TRON · NEON CIRCUIT', theme: 'tron', km: 19.4,
    loops: [
      { E: V3(200, 0, -2000), dir: V3(-1, 0, 0), R: 28, shift: 16 }, { E: V3(-350, 0, -2016), dir: V3(-1, 0, 0), R: 24, shift: 14 },
      { E: V3(-350, 0, -2030), dir: V3(-1, 0, 0), R: 24, shift: 14 }, { E: V3(100, 0, -350), dir: V3(-1, 0, 0), R: 36, shift: 18 },
    ],
    jumps: [{ from: V3(1330, 34, -860), to: V3(1200, 10, -1000) }, { from: V3(-1100, 32, -450), to: V3(-930, 8, -300) }],
    rolls: [{ from: V3(-1500, 24, -1350), to: V3(-1500, 24, -1050) }],
    pads: [V3(560, 0, -2000)],
    ctrl: lp => [
      [-300, 0, 0], [900, 0, 0], [1250, -110, 5], [1480, -380, 16], [1450, -680, 26], [1330, -860, 34],
      [1200, -1000, 10], [1050, -1150, 4], [830, -1240, -10], [640, -1190, -20], [480, -1060, -21], [380, -1200, -21], [480, -1380, -17], [700, -1500, -8], [950, -1570, 2],
      [1150, -1700, 4], [1050, -1900, 6], [800, -2000, 0], [200, -2000, 0], ...lp(0),
      [-350, -2016, 0], ...lp(1), ...lp(2), [-900, -2044, 0],
      [-1200, -2000, 8], [-1450, -1750, 20], [-1500, -1450, 24], [-1500, -1350, 24], [-1500, -1200, 24], [-1500, -1050, 24], [-1480, -900, 22],
      [-1300, -650, 26], [-1100, -450, 32], [-930, -300, 8], [-700, -150, 2],
      [-780, 60, 30], [-860, 400, 95], [-920, 800, 175], [-950, 1150, 245], [-930, 1350, 262],
      [-820, 1500, 262], [-640, 1520, 250], [-520, 1400, 225],
      [-560, 1200, 150], [-700, 1060, 100], [-540, 900, 62], [-700, 740, 38], [-560, 590, 26], [-620, 400, 22], [-540, 200, 22],
      [-500, 0, 22], [-350, 150, 24], [-100, 250, 20], [200, 250, 12], [500, 150, 20], [650, 0, 24], [800, -150, 18],
      [900, -300, 12], [750, -420, 8], [600, -300, 6], [450, -450, 4], [300, -350, 2], [100, -350, 0], ...lp(3),
      [-400, -380, 0], [-700, -300, 4], [-1000, -150, 2], [-1300, -80, 0], [-1400, -10, 0], [-1250, 0, 0],
    ] },
  matrix: { name: 'THE SOURCE', sub: 'MATRIX · CODE RAIN', theme: 'matrix', km: 13.0,
    loops: [{ E: V3(150, 0, -2500), dir: V3(-1, 0, 0), R: 30, shift: 16 }, { E: V3(-350, 0, -900), dir: V3(1, 0, 0), R: 26, shift: 14 }],
    jumps: [{ from: V3(-780, 24, -1500), to: V3(-700, 4, -1330) }],
    rolls: [{ from: V3(1500, 16, -2050), to: V3(1500, 16, -2300) }],
    pads: [],
    ctrl: lp => [
      [-300, 0, 0], [900, 0, 0], [1350, -180, 4], [1520, -560, 10], [1350, -880, 6],
      [950, -1000, 0], [640, -1180, -14], [420, -1480, -14], [600, -1780, 0],
      [1000, -1880, 0], [1380, -1860, 10], [1500, -2050, 16], [1500, -2150, 16], [1500, -2300, 16], [1350, -2500, 6], [700, -2500, 0], ...lp(0),
      [-300, -2500, 0], [-700, -2320, 6], [-900, -1950, 12], [-820, -1650, 20], [-780, -1500, 24],
      [-700, -1330, 4], [-560, -1160, 0], ...lp(1), [-100, -900, 0], [150, -760, 0], [50, -500, 8], [-250, -360, 6], [-700, -300, 0], [-1100, -200, 0], [-1350, -60, 0], [-1150, 0, 0],
    ] },
  canyon: { name: 'RED MESA', sub: 'DESERT CANYON · CAVES', theme: 'desert', km: 11.9,
    loops: [], rolls: [],
    jumps: [{ from: V3(-1500, 136, -1000), to: V3(-1440, 112, -800) }],
    caves: [{ from: V3(500, 200, -1750), to: V3(900, 180, -1900) }, { from: V3(-100, 60, -2550), to: V3(-500, 80, -2400) }, { from: V3(-1400, 60, -200), to: V3(-1200, 40, 50) }],
    pads: [],
    ctrl: lp => [
      [-300, 0, 20], [900, 0, 20], [1300, -150, 40], [1500, -500, 80], [1400, -850, 120], [1100, -1050, 150],
      [700, -1150, 170], [400, -1400, 190], [500, -1750, 200], [700, -1830, 190], [900, -1900, 180],
      [1300, -2100, 150], [1200, -2500, 110], [800, -2600, 90], [300, -2400, 70], [-100, -2550, 60], [-300, -2480, 70], [-500, -2400, 80],
      [-900, -2200, 110], [-1200, -1800, 140], [-1300, -1400, 150], [-1500, -1000, 136],
      [-1440, -800, 112], [-1300, -500, 80], [-1400, -200, 60], [-1300, -80, 50], [-1200, 50, 40], [-900, 150, 30], [-600, 100, 25], [-1000, 0, 20],
    ] },
  supersonic: { name: 'SUPERSONIC', sub: 'GREEN HILL · COLLECT THE RINGS', theme: 'sonic', km: 14.3, rings: true,
    loops: [{ E: V3(300, 6, -900), dir: V3(-1, 0, 0), R: 30, shift: 16 }, { E: V3(-900, 10, -1900), dir: V3(0, 0, 1), R: 26, shift: 14 }, { E: V3(-200, 8, -300), dir: V3(1, 0, 0), R: 34, shift: 18 }],
    jumps: [{ from: V3(1300, 44, -1500), to: V3(1480, 22, -1600) }],
    rolls: [{ from: V3(-1500, 30, -1300), to: V3(-1500, 30, -1050) }],
    pads: [],
    ctrl: lp => [
      [-300, 0, 8], [700, 0, 8], [1100, -150, 20], [1300, -500, 36], [1250, -800, 30], [900, -900, 12], ...lp(0),
      [0, -900, 6], [-200, -1100, 14], [-100, -1400, 30], [300, -1500, 40], [800, -1450, 40], [1100, -1400, 44], [1300, -1500, 44],
      [1480, -1600, 22], [1400, -1850, 12], [1000, -1950, 12], [600, -2000, 10], [100, -2000, 16], [-400, -2050, 14], ...lp(1),
      [-1200, -1800, 20], [-1500, -1500, 30], [-1500, -1300, 30], [-1500, -1175, 30], [-1500, -1050, 30], [-1450, -850, 22], [-1200, -650, 14], [-900, -500, 10], [-600, -300, 8], ...lp(2),
      [100, -300, 8], [50, -80, 8], [-300, 0, 8],
    ].slice(0, -1).concat([[-500, 40, 8], [-900, 60, 8], [-1200, 0, 8], [-900, -40, 8]]) },
  woods: { name: 'TIMBERLINE', sub: 'FOREST · DOWNHILL DRIFT', theme: 'woods', km: 12.1,
    loops: [], rolls: [], jumps: [], pads: [],
    ctrl: lp => [
      [-300, 0, 270], [900, 0, 270], [1150, -120, 262], [1050, -320, 240], [1300, -450, 224], [1150, -650, 206], [1400, -800, 190],
      [1250, -1050, 170], [1450, -1250, 150], [1250, -1500, 130], [900, -1450, 118], [1050, -1750, 104], [800, -1950, 90],
      [450, -1850, 80], [250, -2100, 66], [-100, -1950, 56], [-350, -2200, 44], [-700, -2050, 36], [-900, -2300, 28], [-1250, -2150, 22],
      [-1450, -1850, 26], [-1250, -1600, 30], [-1500, -1350, 36], [-1250, -1100, 40], [-1450, -850, 44], [-1300, -600, 50],
      [-1450, -350, 60], [-1300, -100, 90], [-1200, 100, 140], [-1000, 200, 200], [-700, 220, 250], [-450, 150, 268], [-700, 20, 270], [-1000, 0, 270],
    ] },
  snow: { name: 'WHITEOUT', sub: 'ALPINE · JUMPS IN THE SNOW', theme: 'snow', km: 11.3,
    loops: [], rolls: [],
    jumps: [{ from: V3(1400, 132, -700), to: V3(1350, 110, -880) }, { from: V3(600, 128, -1900), to: V3(420, 106, -2000) }, { from: V3(-900, 150, -2100), to: V3(-1000, 126, -1930) },
            { from: V3(-1400, 160, -600), to: V3(-1400, 138, -400) }, { from: V3(-600, 140, 200), to: V3(-420, 122, 240) }],
    pads: [],
    ctrl: lp => [
      [-300, 0, 100], [900, 0, 100], [1250, -150, 112], [1400, -450, 128], [1400, -700, 132],
      [1350, -880, 110], [1250, -1150, 106], [1400, -1450, 116], [1200, -1750, 120], [900, -1850, 124], [600, -1900, 128],
      [420, -2000, 106], [100, -2100, 100], [-300, -2000, 110], [-600, -2200, 130], [-900, -2100, 150],
      [-1000, -1930, 126], [-1200, -1650, 120], [-1450, -1350, 130], [-1350, -1000, 145], [-1450, -800, 152], [-1400, -600, 160],
      [-1400, -400, 138], [-1200, -150, 120], [-900, 50, 128], [-600, 200, 140],
      [-420, 240, 122], [-200, 180, 110], [-100, 40, 102], [-300, 0, 100],
    ].slice(0, -1).concat([[-500, -30, 100], [-800, -20, 100], [-1100, 0, 100], [-1250, 0, 100]]) },
  ocean: { name: 'DEEP BLUE', sub: 'UNDER THE SEA · GLASS TUBES', theme: 'ocean', km: 12.4,
    loops: [{ E: V3(300, 30, -1000), dir: V3(-1, 0, 0), R: 26, shift: 14 }],
    jumps: [{ from: V3(300, 46, -2350), to: V3(115, 30, -2304) }],
    rolls: [{ from: V3(-1400, 40, -1700), to: V3(-1400, 40, -1450) }],
    pads: [],
    ctrl: lp => [
      [-300, 0, 20], [900, 0, 20], [1250, -150, 28], [1450, -450, 40], [1350, -800, 52], [1000, -950, 60], [650, -1000, 44], ...lp(0),
      [-100, -1000, 30], [-400, -1150, 22], [-500, -1450, 14], [-300, -1750, 10], [100, -1900, 12], [500, -1950, 24], [900, -1850, 40], [1200, -2050, 52], [1100, -2350, 60], [700, -2450, 58], [300, -2350, 46],
      [115, -2304, 30], [-150, -2250, 22], [-500, -2300, 16], [-900, -2200, 20], [-1200, -1950, 30],
      [-1400, -1800, 40], [-1400, -1700, 40], [-1400, -1575, 40], [-1400, -1450, 40], [-1400, -1350, 40],
      [-1300, -1100, 34], [-1450, -850, 26], [-1300, -600, 18], [-1400, -350, 14], [-1200, -100, 16], [-1000, 0, 20],
    ] },
  sky: { name: 'STRATOS', sub: 'MONORAIL ABOVE THE CLOUDS · LED TUNNELS · THE STAIRCASE', theme: 'sky', km: 14.9, softWalls: true, roofs: true,
    loops: [], rolls: [],
    jumps: [{ from: V3(800, 760, -1000), to: V3(600, 738, -1035) }, { from: V3(600, 740, -2600), to: V3(400, 718, -2625) }, { from: V3(-1300, 768, -1500), to: V3(-1410, 746, -1335) },
            { from: V3(-900, 762, 200), to: V3(-707, 740, 252) }, { from: V3(-500, 706, 60), to: V3(-700, 690, 48) }],
    tunnels: [{ from: V3(500, 735, -1060), to: V3(-150, 715, -1450), hex: 0x2ee6ff }, { from: V3(280, 715, -2640), to: V3(-650, 730, -2450), hex: 0xff3af0 },
              { from: V3(-1465, 743, -1240), to: V3(-1450, 740, -700), hex: 0x3aff5a }, { from: V3(-650, 740, 255), to: V3(-250, 725, 170), hex: 0xff8a2a }],
    superPads: [V3(600, 700, 0), V3(-100, 718, -1700), V3(1100, 755, -2400), V3(-1450, 738, -950), V3(-300, 725, 150),
                V3(-1330, 695, -80), V3(-1170, 685, -80), V3(-1330, 675, -80), V3(-850, 680, -135)],   // four down the staircase and out
    pads: [],
    ctrl: lp => [
      [-300, 0, 700], [900, 0, 700], [1300, -150, 712], [1500, -500, 730], [1400, -800, 740], [1100, -950, 748], [800, -1000, 760],
      [600, -1035, 738], [300, -1100, 730], [0, -1250, 720], [-200, -1550, 715], [0, -1800, 720], [350, -1900, 730], [700, -1850, 745], [1000, -2000, 752], [1200, -2300, 760],
      [1000, -2550, 750], [600, -2600, 740],
      [400, -2625, 718], [0, -2650, 712], [-400, -2600, 720], [-700, -2400, 732], [-900, -2100, 745], [-1100, -1800, 760], [-1300, -1500, 768],
      [-1410, -1335, 746], [-1500, -1100, 740], [-1400, -850, 735], [-1500, -600, 742], [-1350, -350, 748], [-1400, -100, 752], [-1200, 120, 758], [-900, 200, 762],
      [-707, 252, 740], [-450, 250, 732], [-230, 170, 724], [-100, 95, 716], [-110, 45, 712], [-300, 50, 708], [-500, 60, 706],
      [-700, 48, 690], [-950, 25, 694], [-1120, 6, 698],
      // the staircase: one and a half turns down round a tower, 80 m radius, 20 m a turn
      [-1250.0, 0.0, 700.0], [-1290.0, -10.7, 698.3], [-1319.3, -40.0, 696.7], [-1330.0, -80.0, 695.0], [-1319.3, -120.0, 693.3], [-1290.0, -149.3, 691.7], [-1250.0, -160.0, 690.0],
      [-1210.0, -149.3, 688.3], [-1180.7, -120.0, 686.7], [-1170.0, -80.0, 685.0], [-1180.7, -40.0, 683.3], [-1210.0, -10.7, 681.7], [-1250.0, 0.0, 680.0],
      [-1290.0, -10.7, 678.3], [-1319.3, -40.0, 676.7], [-1330.0, -80.0, 675.0], [-1319.3, -120.0, 673.3], [-1290.0, -149.3, 671.7], [-1250.0, -160.0, 670.0],
      [-1080, -160, 672], [-850, -135, 680], [-600, -80, 690],
    ] },
  city: { name: 'NEON CITY', sub: 'NIGHT STREETS · UNDERPASSES · THE FLYOVER', theme: 'city', km: 10.9, loops: [], rolls: [],
    jumps: [{ from: V3(-40, 12, -170), to: V3(100, 7, -170) }], tunnels: [{ from: V3(300, -7, -1300), to: V3(-100, -7, -1300), hex: 0xff2ad8 }, { from: V3(800, -4, -140), to: V3(830, -4, 180), hex: 0x2ee6ff }], pads: [V3(1060, 0, -700), V3(-980, 0, -900)],
    ctrl: lp => [
      [-300, 0, 0], [900, 0, 0], [1030, -60, 0], [1060, -200, 0], [1060, -1100, 0], [1030, -1240, 0], [900, -1300, 0],
      [450, -1300, 0], [300, -1300, -7], [100, -1300, -8], [-100, -1300, -7], [-250, -1300, 0], [-800, -1300, 0], [-940, -1250, 0],
      [-980, -1100, 0], [-980, -750, 0], [-940, -620, 0], [-800, -580, 0], [-450, -580, 0], [-320, -540, 0], [-280, -420, 6],
      [-280, -300, 12], [-240, -200, 12], [-100, -170, 12], [200, -170, 10], [330, -170, 5], [450, -170, 0], [700, -170, 0],
      [800, -140, -4], [850, -60, -13], [850, 60, -13], [830, 180, -4], [760, 260, 0], [700, 300, 0], [600, 380, 0],
      [450, 440, 0], [300, 460, 0], [150, 500, 0], [100, 620, 0], [100, 900, 0], [60, 1020, 0], [-60, 1060, 0],
      [-500, 1060, 0], [-640, 1020, 0], [-680, 900, 0], [-680, 300, 0], [-640, 160, 0], [-520, 100, 0], [-400, 60, 0],
    ] },
  volcano: { name: 'VOLCANO', sub: 'BLACK ROCK · LAVA · UP THE CONE', theme: 'volcano', km: 9.8, loops: [], rolls: [],
    jumps: [{ from: V3(1060, 187, -2245), to: V3(1180, 184, -2220) }], caves: [{ from: V3(1200, 56, -850), to: V3(1050, 78, -1100) }, { from: V3(-1100, 28, -1000), to: V3(-1300, 18, -800) }], pads: [V3(1250, 36, -550), V3(-300, 66, -1350)],
    ctrl: lp => [
      [-300, 0, 0], [700, 0, 0], [950, -60, 6], [1150, -250, 18], [1250, -550, 36], [1200, -850, 56], [1050, -1100, 78],
      [850, -1300, 100], [650, -1550, 122], [600, -1850, 145], [750, -2100, 168], [1000, -2250, 188], [1300, -2200, 183], [1500, -1950, 190],
      [1350, -1700, 180], [1100, -1500, 168], [850, -1620, 155], [450, -1650, 140], [200, -1800, 122], [-50, -1880, 104], [-250, -1700, 88],
      [-320, -1400, 70], [-500, -1100, 50], [-800, -950, 38], [-1100, -1000, 28], [-1300, -800, 18], [-1250, -500, 10], [-1050, -300, 4],
      [-800, -200, 0], [-550, -150, 0], [-450, -60, 0],
    ] },
  ice: { name: 'ICE LAKE', sub: 'FROZEN LAKE · LOW GRIP · AURORA', theme: 'ice', km: 10.3, loops: [], rolls: [],
    jumps: [], pads: [V3(1700, 0, -400), V3(-1350, 0, -1050)], grip: 0.62,
    ctrl: lp => [
      [-300, 0, 0], [900, 0, 0], [1350, -100, 0], [1700, -400, 0], [1800, -850, 0], [1600, -1300, 0], [1200, -1500, 0],
      [800, -1400, 0], [500, -1150, 0], [250, -1250, 0], [0, -1550, 0], [-350, -1750, 0], [-800, -1700, 0], [-1150, -1450, 0],
      [-1350, -1050, 0], [-1300, -600, 0], [-1450, -250, 0], [-1700, 100, 0], [-1650, 500, 0], [-1350, 750, 0], [-950, 700, 0],
      [-650, 450, 0], [-500, 150, 0], [-420, 20, 0],
    ] },
  docks: { name: 'THE DOCKS', sub: 'CONTAINERS · CRANES · SHIP TO SHIP', theme: 'docks', km: 8.9, loops: [], rolls: [],
    jumps: [{ from: V3(960, 8, -1455), to: V3(960, 5, -1590) }], pads: [V3(960, 0, -896), V3(20, 0, -2253)],
    ctrl: lp => [
      [-300, 0, 0], [700, 0, 0], [880, -40, 0], [960, -180, 0], [960, -768, 0], [960, -1024, 3], [960, -1216, 8],
      [960, -1446, 8], [960, -1619, 6], [960, -1920, 8], [960, -2099, 4], [940, -2278, 0], [860, -2406, 0], [700, -2458, 0],
      [200, -2458, 0], [60, -2406, 0], [20, -2253, 0], [20, -1818, 0], [-20, -1664, 0], [-140, -1613, 0], [-560, -1613, 0],
      [-700, -1562, 0], [-740, -1408, 0], [-740, -973, 0], [-780, -819, 0], [-900, -768, 0], [-1100, -768, 0], [-1200, -666, 0],
      [-1220, -350, 0], [-1180, -100, 0], [-1120, 150, 0], [-980, 280, 0], [-780, 300, 0], [-580, 220, 0], [-440, 80, 0],
    ] },
  station: { name: 'SPACE STATION', sub: 'RING CORRIDOR · AIRLOCK JUMPS · EARTH BELOW', theme: 'station', km: 13.1, loops: [], rolls: [],
    jumps: [{ from: V3(470, 3, -1290), to: V3(360, 0, -1215) }, { from: V3(-380, 3, -1880), to: V3(-255, 0, -1895) }], pads: [V3(1350, 14, -650)], superPads: [V3(1250, 0, -2050), V3(700, 0, 550)], softWalls: true,
    ctrl: lp => [
      [-300, 0, 0], [700, 0, 0], [1000, -60, 4], [1250, -300, 10], [1350, -650, 14], [1300, -1000, 10], [1100, -1250, 4],
      [800, -1350, 0], [500, -1300, 3], [250, -1150, 0], [100, -900, 0], [-100, -800, 0], [-450, -850, 0], [-700, -1050, 0],
      [-800, -1350, 0], [-700, -1650, 0], [-450, -1850, 3], [-100, -1900, 0], [250, -1800, 0], [550, -1900, 0], [850, -2050, 0],
      [1250, -2050, 0], [1550, -1850, 0], [1650, -1500, 0], [1750, -1200, 10], [1950, -950, 20], [2100, -650, 20], [2050, -300, 10],
      [1850, -100, 0], [1650, 150, 0], [1350, 250, 0], [1050, 350, 0], [700, 550, 0], [300, 650, 0], [-100, 600, 0],
      [-400, 450, 0], [-550, 250, 0], [-480, 60, 0],
    ] },
  riviera: { name: 'RIVIERA', sub: 'HARBOUR STREETS · THE HAIRPIN · THE TUNNEL', theme: 'riviera', km: 8.7, loops: [], rolls: [],
    jumps: [], tunnels: [{ from: V3(1300, 14, -1050), to: V3(800, 8, -1150), hex: 0xffd27a }], pads: [V3(-450, 10, -1550)],
    ctrl: lp => [
      [-300, 0, 4], [700, 0, 4], [860, -30, 6], [930, -140, 10], [940, -380, 18], [900, -520, 26], [780, -600, 34],
      [640, -560, 40], [600, -450, 44], [660, -360, 46], [780, -330, 44], [1000, -350, 40], [1200, -420, 32], [1350, -600, 26],
      [1380, -850, 20], [1300, -1050, 14], [1100, -1150, 10], [800, -1150, 8], [500, -1100, 8], [250, -1200, 10], [50, -1400, 12],
      [-150, -1550, 12], [-450, -1550, 10], [-700, -1400, 8], [-850, -1150, 8], [-900, -850, 6], [-800, -600, 4], [-600, -500, 2],
      [-350, -500, 0], [-150, -420, 0], [-80, -300, 0], [-150, -180, 0], [-300, -150, 0], [-550, -180, 0], [-700, -100, 0],
      [-650, 50, 2], [-500, 60, 4],
    ] },
  touge: { name: 'TOUGE', sub: 'MOUNTAIN PASS · HAIRPINS · NIGHT', theme: 'touge', km: 11.3, loops: [], rolls: [],
    jumps: [], caves: [{ from: V3(1400, 116, -900), to: V3(1500, 104, -1150) }], pads: [V3(200, 52, -1950), V3(-850, 106, -1000)],
    ctrl: lp => [
      [-300, 0, 300], [700, 0, 296], [900, -40, 290], [1000, -160, 282], [960, -300, 272], [820, -360, 266], [700, -300, 262],
      [700, -160, 258], [840, -100, 252], [1050, -120, 244], [1200, -250, 234], [1250, -450, 222], [1150, -600, 212], [950, -620, 206],
      [820, -520, 202], [850, -380, 196], [1000, -330, 190], [1250, -400, 180], [1450, -600, 168], [1500, -850, 156], [1400, -1050, 146],
      [1200, -1100, 140], [1050, -1000, 136], [1050, -860, 130], [1200, -800, 124], [1400, -900, 116], [1500, -1150, 104], [1400, -1400, 92],
      [1150, -1500, 84], [850, -1450, 78], [600, -1550, 70], [400, -1800, 60], [200, -1950, 52], [-100, -1950, 48], [-400, -1850, 52],
      [-650, -1650, 66], [-800, -1350, 84], [-850, -1000, 106], [-950, -700, 130], [-1100, -450, 156], [-1150, -150, 184], [-1050, 100, 212],
      [-850, 250, 238], [-600, 250, 262], [-450, 150, 282], [-400, 40, 294],
    ] },
  salt: { name: 'SALT FLATS', sub: 'FLAT OUT · 3 KM STRAIGHTS · WHITE GLARE', theme: 'salt', km: 16.2, loops: [], rolls: [],
    jumps: [], pads: [V3(2900, 0, -1850)], superPads: [V3(1000, 0, 0), V3(0, 0, -2150), V3(-1500, 0, 80)],
    ctrl: lp => [
      [-300, 0, 0], [2600, 0, 0], [2900, -80, 0], [3050, -350, 0], [3000, -650, 0], [2750, -800, 0], [2400, -750, 0],
      [2200, -950, 0], [2250, -1250, 0], [2500, -1400, 0], [2800, -1550, 0], [2900, -1850, 0], [2700, -2100, 0], [2300, -2150, 0],
      [-1500, -2150, 0], [-1900, -2050, 0], [-2100, -1750, 0], [-2000, -1450, 0], [-1700, -1300, 0], [-1300, -1350, 0], [-1100, -1150, 0],
      [-1150, -850, 0], [-1400, -700, 0], [-1700, -650, 0], [-2000, -450, 0], [-2050, -150, 0], [-1850, 50, 0], [-1500, 80, 0],
      [-1000, 40, 0], [-500, 10, 0],
    ] },
  mars: { name: 'MARS', sub: 'RED DUST · CRATERS · LOW GRAVITY JUMPS', theme: 'mars', km: 10.9, loops: [], rolls: [],
    jumps: [{ from: V3(705, 35, -1200), to: V3(740, 39, -1360) }, { from: V3(1900, 25, -920), to: V3(1990, 22, -1080) }, { from: V3(-370, 29, -1700), to: V3(-490, 26, -1560) }, { from: V3(-1080, 7, -340), to: V3(-1010, 4, -190) }], pads: [V3(1200, 18, -550), V3(700, 34, -1850)], gravity: 0.55,
    ctrl: lp => [
      [-300, 0, 0], [700, 0, 0], [950, -60, 4], [1150, -250, 10], [1200, -550, 18], [1100, -800, 24], [900, -950, 30],
      [700, -1150, 34], [750, -1400, 40], [1000, -1550, 44], [1300, -1500, 48], [1500, -1250, 44], [1450, -1000, 38], [1600, -800, 32],
      [1850, -850, 26], [2000, -1100, 22], [1950, -1400, 20], [1750, -1650, 22], [1450, -1800, 26], [1100, -1900, 30], [700, -1850, 34],
      [350, -1950, 36], [0, -1900, 34], [-300, -1750, 30], [-500, -1500, 26], [-450, -1250, 24], [-250, -1100, 22], [-200, -900, 18],
      [-400, -750, 14], [-700, -800, 12], [-950, -650, 10], [-1100, -400, 8], [-1000, -150, 4], [-800, -50, 2], [-550, -40, 0],
    ] },
  jungle: { name: 'JUNGLE', sub: 'RAINFOREST · WATERFALLS · THE TEMPLE', theme: 'jungle', km: 9.5, loops: [], rolls: [],
    jumps: [{ from: V3(520, 30, -2340), to: V3(400, 24, -2440) }], caves: [{ from: V3(1250, 50, -1370), to: V3(1230, 46, -1600) }], pads: [V3(-250, 16, -2257)],
    ctrl: lp => [
      [-300, 0, 20], [700, 0, 20], [900, -60, 24], [1050, -250, 32], [1000, -450, 40], [850, -550, 46], [650, -520, 50],
      [550, -650, 54], [600, -850, 58], [800, -1159, 60], [1050, -1159, 58], [1250, -1342, 52], [1250, -1647, 46], [1100, -1830, 42],
      [850, -1830, 40], [650, -2013, 36], [550, -2318, 30], [300, -2501, 24], [0, -2440, 20], [-250, -2257, 16], [-350, -1952, 14],
      [-250, -1647, 16], [-350, -1403, 20], [-600, -1342, 26], [-850, -1525, 34], [-1100, -1403, 42], [-1200, -900, 50], [-1100, -650, 54],
      [-850, -550, 52], [-700, -400, 44], [-750, -200, 34], [-650, -50, 26], [-500, 20, 22],
    ] },
};
let TRACK_ID = (() => { try { const t = localStorage.getItem('revuelto.track'); if (t && TRACKS[t]) return t; } catch (e) {} return 'grid'; })();
// look of each world: background, fog, the accent that lights walls and lines, sun and sky light, exposure, plus the flags
// that used to be scattered checks: day, indoor (grid floor and mirror), stars, sun elevation, sky dome, terrain, rock, walls
const THEMES = {
  tron:   { bg: 0x02040a, fog: [0x03060f, 350, 3600], neon: 0x2ee6ff, line: '#5ff0ff', line2: '#3ad8ff', sun: [0xa9d4ff, 1.3], hemi: [0x1e447e, 0x02050c, 0.45], exposure: 0.72, verge: 0x0b1220,
            indoor: true, stars: true, sunEl: 55, dome: [0x01020a, 0x0a2a55], pw: 9.0 },
  matrix: { bg: 0x000000, fog: [0x000804, 300, 3200], neon: 0x3aff5a, line: '#5aff7a', line2: '#2ee65a', sun: [0xa0ffb0, 1.0], hemi: [0x0a3a14, 0x000000, 0.4], exposure: 0.7, verge: 0x03110a,
            indoor: true, stars: true, starCol: 0x7aff9a, sunEl: 55, dome: [0x000000, 0x03200a], pw: 9.0, mirror: 0x0a1a10, envGlow: 0x3aff5a, envStrip: 0x2ad05a, wallLow: '#0a6a2a' },
  desert: { bg: 0x8fb8e8, fog: [0xdcc6a6, 900, 7000], neon: 0xffb347, line: '#f4f1ea', line2: '#ffd34d', sun: [0xfff0d0, 1.35], hemi: [0x9fc8ff, 0x8a5a3a, 0.5], exposure: 0.8, verge: 0x9a7a52,
            day: true, sunEl: 48, dome: [0x2a66c0, 0xe2caa8], pw: 4.0, terrain: { amp: 260, base: 20, cliff: 26, freq: 0.00075 } },
  sonic:  { bg: 0x62b8ff, fog: [0xbfe4ff, 1100, 7500], neon: 0xffd54d, line: '#f4f1ea', line2: '#ffd54d', sun: [0xffffff, 1.3], hemi: [0x8fd0ff, 0x3f8a2a, 0.5], exposure: 0.82, verge: 0x8a6a3a,
            day: true, sunEl: 48, dome: [0x1f78e6, 0xbfe6ff], pw: 4.0, terrain: { amp: 60, base: 8, cliff: 0, freq: 0.0011 } },
  woods:  { bg: 0x2b1a3a, fog: [0x3a2440, 220, 2800], neon: 0xff8a3a, line: '#f4f1ea', line2: '#ffd34d', sun: [0xffa060, 1.1], hemi: [0x5a3a6a, 0x101a0c, 0.55], exposure: 0.85, verge: 0x3a2a1a,
            stars: true, starN: 900, sunEl: 12, dome: [0x140a26, 0xff6a2a], pw: 5.0, terrain: { amp: 300, base: 90, cliff: 14, freq: 0.0007 }, rock: [80, 70, 60] },
  ocean:  { bg: 0x03203a, fog: [0x03213a, 110, 1250], neon: 0x4fe3ff, line: '#8ff4ff', line2: '#4fe3ff', sun: [0x8fc8ff, 0.6], hemi: [0x1e5a90, 0x04131f, 0.75], exposure: 0.8, verge: 0x0e2733,
            sunEl: 55, dome: [0x0a4a86, 0x03182c], pw: 2.2, terrain: { amp: 70, base: -22, cliff: 0, freq: 0.0012 }, tube: true, glowK: 0.4 },
  sky:    { bg: 0x5fb2ff, fog: [0xcfe6ff, 1600, 8500], neon: 0x2ee6ff, line: '#f4f1ea', line2: '#2ee6ff', sun: [0xffffff, 1.5], hemi: [0x9fd0ff, 0xdfeeff, 0.7], exposure: 0.85, verge: 0x1a2230,
            day: true, sunEl: 48, dome: [0x1a62d6, 0xe8f3ff], pw: 4.0, terrain: { amp: 0, base: -3000, cliff: 0, freq: 0.001 }, flat: -3000 },
  snow:   { bg: 0xdfe6ee, fog: [0xe4eaf0, 160, 2200], neon: 0xff3b3b, line: '#f4f1ea', line2: '#3b7bff', sun: [0xe8eeff, 0.9], hemi: [0xdde8f5, 0xbfc8d0, 0.7], exposure: 0.78, verge: 0xdfe6ee,
            sunEl: 30, dome: [0xb8c4d0, 0xf0f4f8], pw: 3.0, terrain: { amp: 240, base: 100, cliff: 10, freq: 0.0008 }, rock: [150, 155, 165], wallHex: '#e8ecf0' },
  // ---- the ten new worlds
  city:    { bg: 0x05060f, fog: [0x070a18, 260, 2600], neon: 0xff2ad8, line: '#f4f1ea', line2: '#ff2ad8', sun: [0x8fa8ff, 0.5], hemi: [0x2a2a55, 0x05050c, 0.5], exposure: 0.85, verge: 0x10121a,
             indoor: true, sunEl: 40, dome: [0x03040c, 0x2a1848], pw: 6.0, floor: 'asphalt', beacons: false, mirror: 0x0c0f18, envGlow: 0xff2ad8, envStrip: 0x8020a0, wallLow: '#6a0a5a', glowK: 0.55 },
  volcano: { bg: 0x1a0806, fog: [0x2a0c08, 220, 2600], neon: 0xff6a1a, line: '#f4f1ea', line2: '#ff6a1a', sun: [0xff8040, 0.9], hemi: [0x5a2010, 0x1a0806, 0.6], exposure: 0.85, verge: 0x1a1412,
             sunEl: 18, dome: [0x0a0304, 0xff4a10], pw: 5.0, stars: true, starN: 700, terrain: { amp: 220, base: 20, cliff: 22, freq: 0.0008 }, craters: [[1050, -1850, 330, 70]], rock: [40, 32, 30], wallHex: '#3a3436', glowK: 0.45 },
  ice:     { bg: 0x0b1a33, fog: [0x14284a, 500, 5200], neon: 0x7ff0ff, line: '#f4f1ea', line2: '#7ff0ff', sun: [0xcfe4ff, 0.7], hemi: [0x3a5a8a, 0x1a2a3a, 0.7], exposure: 0.85, verge: 0xdfeeff,
             sunEl: 14, dome: [0x05102a, 0x6a9ad0], pw: 3.5, stars: true, terrain: { amp: 3, base: -0.6, cliff: 0, freq: 0.002 }, rim: [1500, 2800, 420], rock: [150, 155, 165], wallHex: '#dfeeff', glowK: 0.6 },
  docks:   { bg: 0x9aa6b4, fog: [0xb8c2cc, 400, 4200], neon: 0xffb020, line: '#f4f1ea', line2: '#ffb020', sun: [0xe8ecf2, 0.9], hemi: [0xb8c4d2, 0x50565c, 0.6], exposure: 0.8, verge: 0x6a6c70,
             day: true, sunEl: 42, dome: [0x6f8299, 0xc8d0d8], pw: 3.0, terrain: { amp: 2, base: 1.2, cliff: 0, freq: 0.002 }, shore: [420, 760, 14], water: -3, waterCol: 0x2e4a5a, wallHex: '#8a8c90' },
  station: { bg: 0x000000, fog: [0x03050a, 400, 3000], neon: 0x9fd8ff, line: '#eaf6ff', line2: '#9fd8ff', sun: [0xffffff, 0.9], hemi: [0x203040, 0x000000, 0.5], exposure: 0.8, verge: 0x1a2028,
             indoor: true, stars: true, sunEl: 55, dome: [0x000000, 0x000000], pw: 9.0, floor: 'none', beacons: false, allTunnel: true, tunnelBig: true, envGlow: 0x9fd8ff, envStrip: 0x6aa0d0, wallLow: '#3a6a90', glowK: 0.6 },
  riviera: { bg: 0x7fb8ea, fog: [0xd8e6f2, 900, 6500], neon: 0xffd27a, line: '#f4f1ea', line2: '#ffd27a', sun: [0xfff0d8, 1.4], hemi: [0x9fc8ff, 0x6a5a48, 0.55], exposure: 0.85, verge: 0x8a8478,
             day: true, sunEl: 35, dome: [0x2a6ac8, 0xf0d8b8], pw: 4.0, terrain: { amp: 160, base: 6, cliff: 8, freq: 0.0009 }, sea: [220, 520, 40], water: -1.5, waterCol: 0x1f7fb8, rock: [150, 120, 90] },
  touge:   { bg: 0x050a18, fog: [0x070d1e, 180, 2000], neon: 0xffa040, line: '#f4f1ea', line2: '#ffa040', sun: [0x9fb8ff, 0.5], hemi: [0x1a2a4a, 0x05080e, 0.5], exposure: 0.85, verge: 0x1a1a14,
             sunEl: 50, dome: [0x02040c, 0x142446], pw: 6.0, stars: true, terrain: { amp: 330, base: 60, cliff: 16, freq: 0.0007 }, rock: [70, 66, 60], glowK: 0.4 },
  salt:    { bg: 0xa8d0ff, fog: [0xe6eef8, 1500, 9000], neon: 0xff3b3b, line: '#e8e8e8', line2: '#ff3b3b', sun: [0xffffff, 1.6], hemi: [0xbfe0ff, 0xe8e8e8, 0.8], exposure: 0.78, verge: 0xf2f2f0,
             day: true, sunEl: 60, dome: [0x2f7fe0, 0xf4f6ff], pw: 4.0, terrain: { amp: 0.6, base: -0.3, cliff: 0, freq: 0.003 }, rim: [2900, 4300, 520], wallHex: '#e8e8e4' },
  mars:    { bg: 0xc97a4a, fog: [0xd9925f, 700, 6000], neon: 0x2ee6ff, line: '#f4f1ea', line2: '#2ee6ff', sun: [0xffe0c0, 1.1], hemi: [0xd9a070, 0x6a3018, 0.55], exposure: 0.85, verge: 0x7a3a22,
             day: true, sunEl: 40, dome: [0x8a4a2a, 0xe8b080], pw: 4.5, terrain: { amp: 180, base: 10, cliff: 14, freq: 0.0008 }, craters: [[1700, -1250, 260, 40], [-700, -1500, 220, 30], [300, -600, 180, 22], [-1300, -1000, 300, 45]], rock: [120, 60, 40], wallHex: '#a05030' },
  jungle:  { bg: 0x6fa86a, fog: [0xa9d4a0, 260, 3000], neon: 0x8aff3a, line: '#f4f1ea', line2: '#8aff3a', sun: [0xfff4d8, 1.2], hemi: [0xa8d8a0, 0x2a4a20, 0.6], exposure: 0.85, verge: 0x4a5a2a,
             day: true, sunEl: 55, dome: [0x3a80c8, 0xd8e8c0], pw: 4.0, terrain: { amp: 140, base: 24, cliff: 10, freq: 0.001 }, water: 8, waterCol: 0x3a6a50, rock: [90, 80, 60] },
};
let TRACK, THEME, TH, DAY, OUTDOOR;
function chooseTrack(id) { TRACK_ID = id; TRACK = TRACKS[id]; THEME = TRACK.theme; TH = THEMES[THEME]; DAY = !!TH.day; OUTDOOR = !TH.indoor; }
chooseTrack(TRACK_ID);
// a course change from inside the game reloads with #go=<id>: the hash survives the reload even when a storage write
// made a moment earlier has not been committed yet (seen in headless Chromium), so it is the authority
let GO_ID = ''; try { const m = location.hash.match(/go=([a-z]+)/); if (m && TRACKS[m[1]]) { GO_ID = m[1]; chooseTrack(GO_ID); localStorage.setItem('revuelto.track', GO_ID); localStorage.setItem('revuelto.step', '2'); history.replaceState(null, '', location.pathname + location.search); } } catch (e) {}

// ------------------------------------------------------------------ LOADING ALL MAPS → the lobby → NEXT builds one world
// The page opens on LOADING ALL MAPS while the bird's-eye previews decode, then the map list comes up with the chosen
// world's bird's-eye behind it. Nothing heavy happens until NEXT: that shows LOADING <WORLD> (the little Revuelto in the
// CORE FOCUS livery turning, a tip underneath) and builds the world. A course change from inside the game reloads the
// page with revuelto.step = 2, which skips the lobby and loads that world straight away.
const TIPS = [
  // controls
  '<b>W / ↑</b> THROTTLE · <b>S / ↓</b> BRAKE AND REVERSE · <b>A D / ← →</b> STEER',
  '<b>SPACE</b> IS THE HANDBRAKE · FLICK IT INTO A CORNER TO START A DRIFT',
  '<b>SHIFT</b> OR <b>N</b> FIRES THE NOS · THE BAR UNDER THE DRIVE MODE IS YOUR TANK',
  'NOS CHARGES WHILE YOU DRIFT · NOS IN THE MIDDLE OF A DRIFT IS A BOOST',
  '<b>C</b> CHANGES CAMERA · FIVE VIEWS, INCLUDING THE BONNET AND THE PHOTO CAM',
  '<b>M</b> OR <b>1 2 3 4</b> CHANGES DRIVE MODE · CORSA IS THE FULL 1015 CV',
  '<b>T</b> SWITCHES TO MANUAL · <b>Q</b> AND <b>E</b> SHIFT · HOLD A GEAR THROUGH A CORNER',
  '<b>R</b> PUTS YOU BACK ON THE TRACK · <b>ESC</b> OPENS THE MENU',
  '<b>P</b> CYCLES YOUR PAINTS · <b>L</b> TURNS ON THE LIGHT TRAIL',
  '<b>B</b> CHANGES THE MUSIC · <b>V</b> MUTES · <b>H</b> HIDES THE HELP CARD',
  'GAMEPAD · LEFT STICK STEERS · TRIGGERS ARE THROTTLE AND BRAKE · BUMPERS SHIFT · A IS THE HANDBRAKE',
  'ON A PHONE, REST A THUMB ON THE WHEEL AND TURN IT · LEFT THUMB ON THE PEDALS, INDEX FINGER ON NOS',
  'SETTINGS · PHONE STEERING SWITCHES THE WHEEL FOR LEFT / RIGHT BUTTONS',
  // money and mods
  'FIRST PLACE ON IMPOSSIBLE OVER 10 LAPS PAYS $25,000 · THE FASTEST WAY TO FUND THE GARAGE',
  'SAVE UP · A TIER 3 PART BEATS THREE TIER 1 PARTS, AND THE TIERS STACK ON EACH OTHER',
  'SPEED COMES FROM THE <b>VOLTA</b> ENGINE AND <b>LEGGERA</b> AERO · HANDLING FROM <b>OSSA</b> TYRES AND <b>ALTA</b> SUSPENSION',
  '<b>FERRO</b> BRAKES SHORTEN THE STOPPING DISTANCE BY SIX METRES AT TIER 3 · LATE BRAKING WINS RACES',
  '<b>AZOTO</b> NOS DOUBLES THE TANK AND RECHARGES FASTER · TIER 3 IS TEN SECONDS OF BOOST',
  'TYRES FIRST · GRIP HELPS THE LAUNCH, THE CORNERS AND THE BRAKING, ALL AT ONCE',
  'PAINT IS FOR SHOW · PARTS ARE FOR SPEED · BUY THE PARTS FIRST',
  'EVERY TIME TRIAL LAP PAYS $1,500 · A NEW BEST LAP PAYS $5,000 ON TOP',
  'A PODIUM ON MEDIUM PAYS MORE THAN A WIN ON EASY · MOVE UP WHEN YOU CAN',
  'YOUR CAREER SAVES AFTER EVERY RACE AND PURCHASE · SAVE GAME IN THE MENU ANY TIME',
  'SIGN IN ON THE HOSTED SITE AND YOUR CAREER FOLLOWS YOU TO ANY DEVICE',
  'CHANGE YOUR DRIVER NAME IN THE GARAGE · CAREER TAB',
  // driving
  'THE BLUE PADS GIVE A BOOST · THE PURPLE ARROWS GIVE A SUPER BOOST',
  'OVERSHOOTING A JUMP? LIFT OFF BEFORE THE KICKER · THE LANDING IS WHERE THE GAP ENDS',
  'IN THE AIR THE CAR FOLLOWS THE ROAD · A LITTLE STEER KEEPS IT ON THE LINE',
  'LAND ON TOP OF A TUNNEL IN STRATOS AND KEEP DRIVING · YOU CAN DROP IN LATER',
  'ICE LAKE HAS 62% GRIP · SMOOTH HANDS AND EARLY BRAKING',
  'MARS HAS HALF THE GRAVITY · JUMPS FLY TWICE AS FAR',
  'VERSUS IS FULL CONTACT · THE AI WILL LEAN ON YOU IN THE CORNERS',
  'YOUR BEST LAP IS SAVED PER WORLD · BEAT IT FOR THE $5,000 BONUS',
  'DRIFT THROUGH THE HAIRPINS · THE NOS BAR FILLS WHILE YOU ARE SIDEWAYS',
  'A LONG STRAIGHT IS WHERE THE NOS PAYS · SAVE IT FOR THE RUN TO THE LINE',
  'THE PHOTO CAM (CAMERA 5) IS THE GARAGE CAMERA · FIND YOUR ANGLE',
  'THE MINIMAP TOP-RIGHT SHOWS THE WHOLE WORLD · THE DOT IS YOU',
  'HITS COUNT ON THE HUD · CLEAN LAPS ARE FAST LAPS',
  'THE CORE FOCUS LIVERY IS $15,000 IN THE GARAGE · STICKERS ALL OVER A GRAPHITE BASE',
];
// every load shows the next tip in a fixed cycle that survives reloads, so the same tip is not repeated
function tipNext() { let i = 0; try { i = +localStorage.getItem('revuelto.tip') || 0; } catch (e) {} const t = TIPS[i % TIPS.length]; try { localStorage.setItem('revuelto.tip', String((i + 1) % TIPS.length)); } catch (e) {} return t; }
let tipTimer = 0;
function loadShow(text) {
  $('load-text').textContent = text; $('loading').classList.remove('hidden');
  const car = $('load-car'), strip = $('carspin'); if (strip && !car.style.backgroundImage) car.style.backgroundImage = 'url("' + strip.getAttribute('src') + '")';
  const tip = $('load-tip'); tip.innerHTML = tipNext(); clearInterval(tipTimer); tipTimer = setInterval(() => { tip.innerHTML = tipNext(); }, 5000);
}
function loadHide() { $('loading').classList.add('hidden'); clearInterval(tipTimer); }
const LOBBY = { sel: TRACK_ID, booted: false };
function previewOf(id) { const im = $('prev-' + id); return im ? im.getAttribute('src') : ''; }
function lobbyPick(id) {
  LOBBY.sel = id; const T = TRACKS[id];
  document.querySelectorAll('#tracksel button').forEach(b => b.classList.toggle('on', b.dataset.id === id));
  $('start-sub').textContent = T.name + ' · ' + T.sub + ' · ' + T.km + ' KM';
  const src = previewOf(id), show = !!src && (!LOBBY.booted || id !== TRACK_ID);   // once a world is built it is its own backdrop
  $('lobby-bg').style.backgroundImage = src ? 'url("' + src + '")' : ''; $('lobby-bg').classList.toggle('hidden', !show); $('start').classList.toggle('peek', show);
}
function lobbyHideBg() { $('lobby-bg').classList.add('hidden'); $('start').classList.remove('peek'); }
function lobbyNext() {
  const id = LOBBY.sel, T = TRACKS[id]; try { localStorage.setItem('revuelto.track', id); } catch (e) {}
  if (!LOBBY.booted) { chooseTrack(id); try { localStorage.setItem('revuelto.step', '2'); } catch (e) {} lobbyHideBg(); loadShow('LOADING ' + T.name + ' …'); setTimeout(boot, 60); }   // boot lands on the mode step
  else if (id === TRACK_ID) window.startShow(2);
  else { try { localStorage.setItem('revuelto.step', '2'); } catch (e) {} loadShow('LOADING ' + T.name + ' …'); location.hash = 'go=' + id; setTimeout(() => location.reload(), 80); }
}
{
  const tp = $('tracksel');
  for (const id in TRACKS) { const T = TRACKS[id], b = document.createElement('button'); b.className = 'trk ' + T.theme; b.dataset.id = id; b.innerHTML = `<b>${T.name}</b><span>${T.sub} · ${T.km} KM</span>`; b.addEventListener('click', e => { e.stopPropagation(); lobbyPick(id); }); tp.appendChild(b); }
  $('next-btn').addEventListener('click', e => { e.stopPropagation(); if (!LOBBY.booted) lobbyNext(); else window.startNav(1); });
  let straight = !!GO_ID; try { straight = straight || localStorage.getItem('revuelto.step') === '2'; } catch (e) {}
  if (!document.getElementById('revuelto-glb') && location.protocol !== 'file:') window.__glbFetch = fetch('revuelto.glb').then(r => r.ok ? r.arrayBuffer() : null).catch(() => null);   // hosted: the car starts downloading now
  // the welcome/title screen: only for a true fresh visit, never on an internal reload (a course change, a track
  // that skips the lobby); everything behind it keeps preparing while it's up, so PLAY reveals it instantly
  const wEl = $('welcome');
  if (straight) { wEl.classList.add('hidden'); } else {
    const strip = $('carspin-hero'); if (strip) $('welcome-car').style.backgroundImage = 'url("' + strip.getAttribute('src') + '")';
    const playGo = () => { wEl.classList.add('hidden'); };
    $('welcome-play').addEventListener('click', e => { e.stopPropagation(); playGo(); });
    wEl.addEventListener('click', e => e.stopPropagation());
    window.__welcomePlay = playGo;
    // the game's main keydown listener lives inside boot(), which only exists once the world has finished loading --
    // several seconds away. The welcome screen shows immediately, so Enter/Space need their own listener now.
    window.addEventListener('keydown', e => { if (!wEl.classList.contains('hidden') && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); playGo(); } });
  }
  if (straight) { loadShow('LOADING ' + TRACK.name + ' …'); setTimeout(boot, 60); }
  else {
    loadShow('LOADING ALL MAPS');
    const imgs = [...document.querySelectorAll('img[id^="prev-"], #carspin')];
    Promise.all(imgs.map(i => (i.decode ? i.decode() : Promise.resolve()).catch(() => {}))).then(() => { loadHide(); lobbyPick(TRACK_ID); $('next-btn').classList.remove('hidden'); });
  }
}
window.__lobby = { LOBBY, lobbyPick, lobbyNext, TIPS, tipNext, loadShow, loadHide };

function boot() {
LOBBY.booted = true;
// ------------------------------------------------------------------ career: money, parts, paints
// Prize money for finishing, spent in the garage on parts that change the real physics numbers (power, grip, brakes,
// steering rate, drag, mass, the NOS tank and its recharge) and on paints. Brands are invented; the part language is
// real. Saved in the browser always, and to the player's cloud record when signed in (newest copy wins).
const SHOP = {
  tyres:  { name: 'TYRES', brand: 'OSSA', tiers: [
    { name: 'CORSA', sub: 'SEMI-SLICK · SOFT COMPOUND', price: 6000, grip: 1.06 },
    { name: 'PISTA', sub: 'R-COMPOUND · TREADED SLICK', price: 14000, grip: 1.12 },
    { name: 'GARA', sub: 'FULL SLICK · QUALIFYING COMPOUND', price: 26000, grip: 1.20 } ] },
  brakes: { name: 'BRAKES', brand: 'FERRO', tiers: [
    { name: 'SPORT', sub: 'STEEL 6-POT · BRAIDED LINES', price: 5000, brake: 1.08 },
    { name: 'CARBON-CERAMIC', sub: '410 MM DISCS · MONOBLOC 8-POT', price: 12000, brake: 1.18 },
    { name: 'ENDURANCE', sub: 'CARBON-CARBON · RACE PADS', price: 22000, brake: 1.30 } ] },
  susp:   { name: 'SUSPENSION', brand: 'ALTA', tiers: [
    { name: 'SPORT COILOVERS', sub: '2-WAY ADJUSTABLE · 20 MM DROP', price: 7000, steer: 1.08, grip: 1.02 },
    { name: 'ADAPTIVE', sub: 'MAGNETIC DAMPERS · ACTIVE ROLL BARS', price: 15000, steer: 1.16, grip: 1.04 },
    { name: 'RACE', sub: '3-WAY REMOTE RESERVOIR · SOLID MOUNTS', price: 25000, steer: 1.25, grip: 1.06 } ] },
  engine: { name: 'ENGINE', brand: 'VOLTA', tiers: [
    { name: 'STAGE 1', sub: 'ECU MAP · CARBON INTAKE · +80 CV', price: 9000, power: 1.08 },
    { name: 'STAGE 2', sub: 'TITANIUM EXHAUST · RACE CAMS · +180 CV', price: 18000, power: 1.17 },
    { name: 'STAGE 3', sub: 'FORGED INTERNALS · E-MOTOR OVERBOOST · +300 CV', price: 30000, power: 1.28 } ] },
  nos:    { name: 'NOS', brand: 'AZOTO', tiers: [
    { name: 'STREET', sub: '5 LB BOTTLE · WET KIT', price: 5000, nosTank: 1.25, nosCharge: 1.15 },
    { name: 'PRO', sub: '10 LB BOTTLE · DIRECT PORT', price: 10000, nosTank: 1.6, nosCharge: 1.35 },
    { name: 'MAX', sub: 'TWIN 10 LB · PROGRESSIVE CONTROLLER', price: 20000, nosTank: 2.0, nosCharge: 1.6 } ] },
  aero:   { name: 'AERO & WEIGHT', brand: 'LEGGERA', tiers: [
    { name: 'CARBON SPLITTER', sub: 'FRONT SPLITTER · DIFFUSER FINS', price: 6000, drag: 0.96, mass: 0.98 },
    { name: 'GT WING', sub: 'SWAN-NECK WING · CARBON DOORS', price: 15000, drag: 0.92, mass: 0.955, grip: 1.03 },
    { name: 'FULL CARBON', sub: 'CARBON PANELS · TITANIUM BOLTS · POLYCARBONATE GLASS', price: 28000, drag: 0.88, mass: 0.92, grip: 1.05 } ] },
};
const SHOP_KEYS = Object.keys(SHOP);
// prize money by finishing position, per difficulty, for a three-lap Versus race (scaled by laps / 3)
const PRIZE = [[8000, 5000, 3000, 1000], [15000, 9000, 5000, 2000], [20000, 12000, 7000, 2500], [25000, 15000, 9000, 3000]];
const PRIZE_TT_LAP = 1500, PRIZE_TT_BEST = 5000;   // Time Trial: per lap, plus a bonus for a new personal best
const CAREER_START = 5000;
// one-time driver gifts: a name gets a bonus exactly once, recorded in career.gifts so it never repeats, on this
// device or, once cloud sync brings the record back, on any device signed into that account
const GIFTS = { INDIE: 900000 };
const career = { name: '', cash: CAREER_START, tiers: { tyres: 0, brakes: 0, susp: 0, engine: 0, nos: 0, aero: 0 }, paints: [0, 1], cars: ['revuelto'], car: 'revuelto', stats: { races: 0, wins: 0, podiums: 0, earned: 0 }, updated: 0 };
const TUNE = { power: 1, grip: 1, brake: 1, steer: 1, drag: 1, mass: 1, nosTank: 1, nosCharge: 1 };   // what the bought parts do to the car, applied in step()
var sceneReady = false;   // retune() runs once at module load, before the scene (bodyGroup etc.) exists: gate the wing fit on this, var so it's hoisted (no TDZ)
let hudLineOK = false;   // the HUD car line needs the track, which is built later; retune() paints it only once that exists
// the drive-mode line names the live car's drivetrain and its power at that setting
function modeSub(m) { const cv = Math.round(CAR.powerW / 735.5 * m.power * TUNE.power), C = CARS[carId] || {}; return (m.ev ? (C.ev === false ? 'LOW · ' : 'EV · ') : (C.ev === false ? 'V12 · ' : 'HYBRID · ')) + cv + ' CV'; }
function retune() {
  for (const k in TUNE) TUNE[k] = 1;
  for (const key of SHOP_KEYS) { const t = career.tiers[key]; if (!t) continue; const T = SHOP[key].tiers[t - 1]; for (const k in TUNE) if (T[k] != null) TUNE[k] *= T[k]; }
  if (hudLineOK) hudCarLine();
  if (sceneReady) fitWing();
}
const fmtCash = n => '$' + Math.round(n).toLocaleString('en-US');
function careerLoad() {
  try { const j = JSON.parse(localStorage.getItem('revuelto.career') || 'null'); if (j) careerAdopt(j); } catch (e) {}
  retune();
}
function careerAdopt(j) {   // take a saved record (local or cloud), defensively
  if (typeof j.name === 'string') career.name = j.name.trim().toUpperCase().slice(0, 16);
  if (typeof j.cash === 'number') career.cash = Math.max(0, j.cash);
  if (j.tiers) for (const k of SHOP_KEYS) career.tiers[k] = Math.min(3, Math.max(0, j.tiers[k] | 0));
  if (Array.isArray(j.paints)) career.paints = [...new Set([0, 1, ...j.paints.filter(i => Number.isInteger(i) && PAINTS[i])])];
  if (Array.isArray(j.cars)) career.cars = [...new Set(['revuelto', ...j.cars.filter(c => typeof c === 'string' && CARS[c])])];
  if (Array.isArray(j.gifts)) career.gifts = [...new Set(j.gifts.filter(g => typeof g === 'string'))];
  if (typeof j.car === 'string' && CARS[j.car] && career.cars.includes(j.car)) career.car = j.car;
  if (j.stats) for (const k in career.stats) if (typeof j.stats[k] === 'number') career.stats[k] = j.stats[k];
  career.updated = typeof j.updated === 'number' ? j.updated : 0;
}
function careerSave() {
  career.updated = Date.now();
  try { localStorage.setItem('revuelto.career', JSON.stringify(career)); } catch (e) {}
  cloud.push(); paintBarLocks();
}
const ownsPaint = i => career.paints.includes(i);
function buyPart(key) {
  const t = career.tiers[key]; if (t >= 3) return 'MAXED';
  const T = SHOP[key].tiers[t]; if (career.cash < T.price) return 'NOT ENOUGH CASH';
  career.cash -= T.price; career.tiers[key] = t + 1; retune(); careerSave(); return 'OK';
}
function buyPaint(i) {
  const P = PAINTS[i]; if (!P) return 'NO'; if (ownsPaint(i)) return 'OWNED';
  if (career.cash < P.price) return 'NOT ENOUGH CASH';
  career.cash -= P.price; career.paints.push(i); careerSave(); return 'OK';
}
function prizeFor(mode, pos, laps, diff, newBest) {
  if (mode === 'versus') return Math.round(PRIZE[diff][Math.min(pos, 4) - 1] * laps / 3 / 100) * 100;
  if (mode === 'time') return PRIZE_TT_LAP * laps + (newBest ? PRIZE_TT_BEST : 0);
  return 0;
}
function payout(prize, pos) {
  career.cash += prize; career.stats.races++; career.stats.earned += prize;
  if (GAME.mode === 'versus') { if (pos === 1) career.stats.wins++; if (pos <= 3) career.stats.podiums++; }
  careerSave();
}
careerLoad();
const cloud = {
  // The hosted site (lambo-sim.web.app) loads Firebase from its reserved URLs before this script; the single-file page and
  // the artifact do not, and stay local-only. Newest record wins between the browser and the cloud.
  ok: false, user: null, pending: null, status: 'LOCAL SAVE ONLY',
  init() {
    try {
      if (!(window.firebase && firebase.apps && firebase.apps.length && firebase.auth && firebase.firestore)) return;
      this.ok = true; this.status = 'NOT SIGNED IN';
      firebase.auth().onAuthStateChanged(u => { this.user = u; this.status = u ? 'SIGNED IN · ' + (u.displayName || u.email || 'PLAYER').toUpperCase() : 'NOT SIGNED IN'; if (u) this.pull(); else if (typeof garageRefresh === 'function') garageRefresh(); });
    } catch (e) { this.ok = false; }
  },
  signIn() {
    if (!this.ok) { flash('SIGN-IN WORKS ON LAMBO-SIM.WEB.APP', 1600); return; }
    if (this.user) { firebase.auth().signOut(); flash('SIGNED OUT · SAVING IN THIS BROWSER', 1400); return; }
    firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(() => flash('SIGN-IN FAILED', 1400));
  },
  doc() { return firebase.firestore().collection('players').doc(this.user.uid); },
  async pull() {
    try {
      const snap = await this.doc().get(), remote = snap.exists ? snap.data() : null;
      if (remote && (remote.updated || 0) > (career.updated || 0)) {
        careerAdopt(remote); retune(); try { localStorage.setItem('revuelto.career', JSON.stringify(career)); } catch (e) {}
        if (!ownsPaint(paintIdx)) setPaint(1); paintBarLocks(); flash('CAREER LOADED FROM THE CLOUD', 1400);
      } else this.push();
      if (career.name && await this.claimName(career.name) === 'TAKEN') { flash('THAT NAME IS TAKEN', 1600); nameOpen(false, 'THAT NAME IS TAKEN · PICK ANOTHER'); }
    } catch (e) { this.status = 'CLOUD ERROR'; }
    nameRefresh(); if (typeof garageRefresh === 'function') garageRefresh();
  },
  async claimName(name) {
    if (!this.ok || !this.user || !name) return 'OK';
    const key = name.trim().toLowerCase().replace(/\s+/g, ' ');
    try { const ref = firebase.firestore().collection('names').doc(key), snap = await ref.get(); if (snap.exists && snap.data().uid !== this.user.uid) return 'TAKEN'; if (!snap.exists) await ref.set({ uid: this.user.uid, name, at: Date.now() }); return 'OK'; } catch (e) { return 'OK'; }
  },
  push() {
    if (!this.ok || !this.user) return;
    clearTimeout(this.pending);
    this.pending = setTimeout(() => this.doc().set({ name: career.name || null, cash: career.cash, tiers: career.tiers, paints: career.paints, cars: career.cars, car: career.car, gifts: career.gifts || [], stats: career.stats, updated: career.updated, account: this.user.displayName || null }).catch(() => { this.status = 'CLOUD ERROR'; }), 800);
  },
};
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const LOOPS = TRACK.loops;
for (const L of LOOPS) { L.rt = new THREE.Vector3().crossVectors(L.dir, WORLD_UP).normalize(); L.C = L.E.clone().add(new THREE.Vector3(0, L.R, 0)); }
const loopPts = L => { const out = []; for (let k = 1; k <= 8; k++) { const th = k / 8 * Math.PI * 2; out.push([L.E.x + L.dir.x * L.R * Math.sin(th) + L.rt.x * L.shift * (k / 8), L.E.z + L.dir.z * L.R * Math.sin(th) + L.rt.z * L.shift * (k / 8), L.E.y + L.R * (1 - Math.cos(th))]); } return out; };
const JUMPS = TRACK.jumps;   // [kicker top, landing]: no road between, the car flies
const ROLLS = TRACK.rolls;   // corkscrew: road rolls 360° between these
const CTRL = TRACK.ctrl(k => loopPts(LOOPS[k]));

document.body.classList.add('theme-' + THEME); if (OUTDOOR) document.body.classList.add('outdoor');

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
renderer.toneMappingExposure = TH.exposure;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const isWebGL2 = renderer.capabilities.isWebGL2;
const maxAniso = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(TH.fog[0], TH.fog[1], TH.fog[2]);
const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 9000);

// sky: a dome for the night and dusk worlds, stars for the neon ones, an atmosphere model for the day ones, overcast for snow
scene.background = new THREE.Color(TH.bg);
const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - TH.sunEl), THREE.MathUtils.degToRad(35));
{
  const domeCols = TH.dome;
  if (DAY) { const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(140, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false, toneMapped: false })); sunDisc.position.copy(sunDir).multiplyScalar(7800); sunDisc.position.y -= 200; scene.add(sunDisc); }
  if (false) {
    const sky = new THREE.Sky(); sky.scale.setScalar(400000); scene.add(sky);
    const u = sky.material.uniforms; u.turbidity.value = THEME === 'desert' ? 6 : 3; u.rayleigh.value = THEME === 'desert' ? 2.2 : 1.4; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.8; u.sunPosition.value.copy(sunDir);
    scene.background = null;
  } else {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(8500, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(domeCols[0]) }, horizon: { value: new THREE.Color(domeCols[1]) }, pw: { value: TH.pw } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 horizon; uniform float pw; varying vec3 vP; void main(){ float h = normalize(vP).y; float g = pow(1.0 - clamp(h, 0.0, 1.0), pw); gl_FragColor = vec4(mix(top, horizon, g * 0.9), 1.0); }',
    }));
    dome.position.y = -200; scene.add(dome);
    if (TH.stars) {
      const sp = [], n = TH.starN || 2600;
      for (let i = 0; i < n; i++) { const a = rnd() * Math.PI * 2, e = Math.asin(rnd()) * 0.95 + 0.04, r = 8000; sp.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r - 200, Math.sin(a) * Math.cos(e) * r); }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
      const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: TH.starCol || 0x9fd8ff, size: 14, sizeAttenuation: true, fog: false, toneMapped: false, transparent: true, opacity: 0.75 })); scene.add(stars);
    }
  }
}
const pmrem = new THREE.PMREMGenerator(renderer);
{
  const env = new THREE.Scene();
  if (OUTDOOR) {
    // a simple lit world for the reflections: sky above, ground below, a bright sun patch
    const skyC = new THREE.Color(TH.bg), gndC = new THREE.Color(TH.hemi[1]);
    env.background = skyC;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: gndC })); floor.position.y = -6; floor.rotation.x = -Math.PI / 2; env.add(floor);
    const sunP = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })); sunP.position.copy(sunDir).multiplyScalar(120); env.add(sunP);
  } else {
    env.background = new THREE.Color(0x01030a);
    const glow = new THREE.MeshBasicMaterial({ color: TH.envGlow || 0x3ee0ff });
    const strip = new THREE.Mesh(new THREE.CylinderGeometry(60, 60, 1.2, 48, 1, true), new THREE.MeshBasicMaterial({ color: TH.envStrip || 0x2ad0ff, side: THREE.BackSide })); strip.position.y = -2; env.add(strip);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, m = new THREE.Mesh(new THREE.PlaneGeometry(6, 40), glow); m.position.set(Math.cos(a) * 50, 22, Math.sin(a) * 50); m.lookAt(0, 22, 0); env.add(m); }
    const top = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ color: 0x1a4a7a })); top.position.y = 60; top.rotation.x = Math.PI / 2; env.add(top);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: 0x03101c })); floor.position.y = -8; floor.rotation.x = -Math.PI / 2; env.add(floor);
  }
  scene.environment = pmrem.fromScene(env, 0.04).texture;
}

const sun = new THREE.DirectionalLight(TH.sun[0], TH.sun[1]);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 10; sun.shadow.camera.far = 900;
sun.shadow.camera.left = -40; sun.shadow.camera.right = 40; sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
scene.add(sun); scene.add(sun.target);
scene.add(new THREE.HemisphereLight(TH.hemi[0], TH.hemi[1], TH.hemi[2]));
const underglow = new THREE.PointLight(0x2ee6ff, 2.6, 10, 2); scene.add(underglow);
const glowTex = canvasTex(256, (ctx, sz) => { const g = ctx.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz / 2); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.35, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, sz, sz); });
const glowDisc = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 5), new THREE.MeshBasicMaterial({ map: glowTex, color: 0x2ee6ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
glowDisc.rotation.x = -Math.PI / 2; glowDisc.position.y = 0.06; glowDisc.renderOrder = 2;
const GLOW_BLUE = new THREE.Color(0x2ee6ff), GLOW_PURPLE = new THREE.Color(0xa64dff), glowCol = new THREE.Color();
const GLOW_K = TH.glowK != null ? TH.glowK : DAY ? 0.28 : OUTDOOR ? 0.5 : 1;   // the LED underglow reads in the dark, less so in daylight
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

const curve = new THREE.CatmullRomCurve3(CTRL.map(p => new THREE.Vector3(p[0], p[2], p[1])), true, 'centripetal', 0.5);
const N = 3400;
const S = curve.getSpacedPoints(N).slice(0, N);       // closed loop samples (3D)
{ // the spline overshoots a few metres below ground next to level sections; only a designed dive (a control point below -1) may go under
  const dips = CTRL.filter(p => p[2] < -1);
  for (const q of S) if (q.y < 0 && !dips.some(p => Math.hypot(p[0] - q.x, p[1] - q.z) < 260)) q.y = 0.02;
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
const BOOST = new Array(N).fill(false), PADS = [], BOOST2 = new Array(N).fill(false), PADS2 = [];
{
  const addPads = (from, count, step) => { for (let k = 0; k < count; k++) { const i = (from + k * step + N) % N; PADS.push(i); for (let q = -1; q <= 1; q++) BOOST[(i + q + N) % N] = true; } };
  for (const J of JUMPS) addPads(J.i0 - 40, 6, 6);
  addPads(30, 4, 8);
  for (const P of TRACK.pads) addPads(nearest(P) - 30, 5, 7);
  if (TRACK.superPads) for (const P of TRACK.superPads) { const i = nearest(P); PADS2.push(i); for (let q = -2; q <= 2; q++) BOOST2[(i + q + N) % N] = true; }
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
const ROOF_H = 7.6, ROOF_W = 5.5;  // tunnel roofs (STRATOS): a deck on top you can land on and drive along
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
// ---------------------------------------------------------------- ground
// Outdoor worlds get a heightfield: fractal mountains that are carved to the road (cuttings and embankments within 60 m,
// cliff walls on the uphill side where the noise says so) and left standing over the cave sections. A fine field of the
// nearest road sample (20 m cells, bucketed search) drives the carving. Neon worlds keep the flat grid and the mirror.
const NEAR = { x0: -3600, z0: -3800, cell: 20, n: 370, y: null, d: null, cave: null };
const CAVE = new Array(N).fill(false);
const CAVE_HEX = new Array(N).fill(0);
if (TRACK.caves) for (const C of TRACK.caves) { const a = nearest(C.from), b = nearest(C.to); for (let i = Math.min(a, b); i <= Math.max(a, b); i++) CAVE[i] = true; }
if (TRACK.tunnels) for (const C of TRACK.tunnels) { const a = nearest(C.from), b = nearest(C.to); for (let i = Math.min(a, b); i <= Math.max(a, b); i++) { CAVE[i] = true; CAVE_HEX[i] = C.hex; } }
if (OUTDOOR) {
  const B = 100, bx = {}, key = (i, j) => i + ',' + j;
  for (let k = 0; k < N; k += 2) { const kk = key(Math.floor(S[k].x / B), Math.floor(S[k].z / B)); (bx[kk] = bx[kk] || []).push(k); }
  NEAR.y = new Float32Array(NEAR.n * NEAR.n); NEAR.d = new Float32Array(NEAR.n * NEAR.n); NEAR.cave = new Uint8Array(NEAR.n * NEAR.n);
  for (let j = 0; j < NEAR.n; j++) for (let i = 0; i < NEAR.n; i++) {
    const x = NEAR.x0 + i * NEAR.cell, z = NEAR.z0 + j * NEAR.cell, ci = Math.floor(x / B), cj = Math.floor(z / B);
    let best = 1e18, bk = -1;
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const list = bx[key(ci + di, cj + dj)]; if (!list) continue; for (const k of list) { const dx = S[k].x - x, dz = S[k].z - z, d = dx * dx + dz * dz; if (d < best) { best = d; bk = k; } } }
    const q = j * NEAR.n + i; NEAR.d[q] = bk < 0 ? 250 : Math.min(250, Math.sqrt(best)); NEAR.y[q] = bk < 0 ? 0 : S[bk].y; NEAR.cave[q] = bk >= 0 && CAVE[bk] ? 1 : 0;
  }
}
function nearField(x, z) {
  const fx = clamp((x - NEAR.x0) / NEAR.cell, 0, NEAR.n - 1.001), fz = clamp((z - NEAR.z0) / NEAR.cell, 0, NEAR.n - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * NEAR.n + i;
  const bl = (A) => lerp(lerp(A[k], A[k + 1], u), lerp(A[k + NEAR.n], A[k + NEAR.n + 1], u), v);
  return { d: bl(NEAR.d), y: bl(NEAR.y), cave: bl(NEAR.cave) };
}
const TERRAIN = TH.terrain || { amp: 0, base: 0, cliff: 0, freq: 0.001 };
function rawH(x, z) {
  const T = TERRAIN, n = fbm(x * T.freq + 3.1, z * T.freq + 7.7, 5), r = 1 - Math.abs(fbm(x * T.freq * 2.1 + 11, z * T.freq * 2.1 + 5, 3) * 2 - 1);   // rolling + ridges
  let h = T.base + T.amp * ((n - 0.42) * 1.5 + r * 0.55);
  if (TH.rim) h += TH.rim[2] * smoothstep(TH.rim[0], TH.rim[1], Math.hypot(x, z + 600)) * (0.7 + 0.6 * fbm(x * 0.0015, z * 0.0015, 3));   // a ring of mountains round a flat world
  if (TH.craters) for (const [cx, cz, cr, cd] of TH.craters) { const q = Math.hypot(x - cx, z - cz) / cr; if (q < 1.2) h += -cd * (1 - smoothstep(0.5, 1.0, q)) + cd * 0.4 * smoothstep(0.75, 1.0, q) * (1 - smoothstep(1.0, 1.2, q)); }   // bowl and raised rim
  if (TH.sea) h -= TH.sea[2] * smoothstep(TH.sea[0], TH.sea[1], z);   // the land drops into the sea beyond a line
  return h;
}
function terrainH(x, z) {
  if (!OUTDOOR) return 0;
  if (TH.flat != null) return TH.flat;
  const f = nearField(x, z), T = TERRAIN, raw = rawH(x, z) - (TH.shore ? TH.shore[2] * smoothstep(TH.shore[0], TH.shore[1], nearField(x, z).d) : 0);   // shore: the quay drops into the water away from the road
  if (THEME === 'ocean') return f.d < 50 ? Math.min(raw, f.y - 5 - (50 - f.d) * 0.16) : raw;   // the sea floor dips under the tube, never through it
  if (f.d > 220) return raw;
  const open = smoothstep(14, 70, f.d);                                                            // 0 on the road, 1 out in the hills
  let h = lerp(f.y - 0.6, raw, open);
  // cliff walls beside the road where the noise says so (the road carves through), never on the loop/jump sections
  const cliffy = T.cliff * smoothstep(0.35, 0.75, fbm(x * 0.0025 + 21, z * 0.0025 + 3, 3));
  h += cliffy * smoothstep(10, 22, f.d) * (1 - smoothstep(45, 110, f.d)) * smoothstep(0.1, 0.9, 1 - f.cave);
  // over a cave the hill stays put and rises
  if (f.cave > 0.05) h = lerp(h, Math.max(raw, f.y + 16 + 10 * fbm(x * 0.004, z * 0.004, 2)), smoothstep(0.05, 0.6, f.cave) * (1 - smoothstep(60, 140, f.d)));
  return h;
}
const gridMat = new THREE.ShaderMaterial({
  transparent: true, fog: true, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2,
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uCar: { value: new THREE.Vector3() }, uTime: { value: 0 }, uMask: { value: null }, uGlow: { value: 0 }, uMatrix: { value: THEME === 'matrix' ? 1 : 0 } }]),
  vertexShader: `varying vec3 vW;
#include <fog_pars_vertex>
    void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
    }`,
  fragmentShader: `uniform vec3 uCar; uniform float uTime; uniform float uGlow; uniform float uMatrix; uniform sampler2D uMask; varying vec3 vW;
#include <fog_pars_fragment>
    float gridLine(vec2 p, float cell, float w){ vec2 q = p / cell; vec2 g = abs(fract(q - 0.5) - 0.5) / (fwidth(q) * w); return 1.0 - min(min(g.x, g.y), 1.0); }
    float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main(){
      if (texture2D(uMask, (vW.xz + vec2(3400.0, 3700.0)) / 6800.0).r > 0.5) discard;
      float major = gridLine(vW.xz, 20.0, 1.6), minor = gridLine(vW.xz, 4.0, 1.2);
      float d = distance(vW.xz, uCar.xz);
      float glow = 2.2 / (1.0 + d * d * 0.09);
      vec3 col; float alpha;
      if (uMatrix > 0.5) {
        // code rain on the floor: 3 m columns, each with its own speed and phase, glyph cells flickering, a bright head and a long fading tail
        vec2 cell = floor(vW.xz / 3.0);
        float sp = 4.0 + 12.0 * hsh(vec2(cell.x, 1.0)), ph = 97.0 * hsh(vec2(cell.x, 2.0));
        float trail = fract((cell.y + uTime * sp + ph) / 46.0);
        float bright = pow(1.0 - trail, 2.4);
        float glyph = step(0.42, hsh(cell + floor(uTime * (2.0 + 3.0 * hsh(vec2(cell.x, 3.0)))) * 0.013));
        vec2 inCell = fract(vW.xz / 3.0); float box = step(0.12, inCell.x) * step(inCell.x, 0.88) * step(0.1, inCell.y) * step(inCell.y, 0.9);
        vec3 green = vec3(0.25, 1.0, 0.4), white = vec3(0.85, 1.0, 0.9);
        vec3 gcol = mix(green, vec3(0.65, 0.3, 1.0), uGlow);
        col = vec3(0.0, 0.01, 0.0) + green * (major * 0.18 + minor * 0.05) + mix(green, white, step(0.965, 1.0 - trail)) * bright * glyph * box * 1.3 + gcol * glow * (0.35 + 1.2 * uGlow);
        alpha = 0.94;
      } else {
        vec3 base = vec3(0.012, 0.02, 0.045);
        vec3 cyan = vec3(0.18, 0.9, 1.0);
        float pulse = 0.85 + 0.15 * sin(uTime * 1.5 - vW.x * 0.01);
        vec3 gcol = mix(cyan, vec3(0.65, 0.3, 1.0), uGlow);
        col = base + cyan * (major * 1.35 * pulse + minor * 0.22) + gcol * glow * (0.45 + 1.2 * uGlow);
        alpha = mix(0.86, 1.0, max(major, minor * 0.4));
      }
      gl_FragColor = vec4(col, alpha);
#include <fog_fragment>
    }`,
});
// terrain colours per world: height bands, slope-exposed rock, dirt beside the road, checkered Green Hill dirt
function terrainColor(h, slope, d, x, z, out) {
  const n = fbm(x * 0.01, z * 0.01, 2);
  if (THEME === 'desert') {
    const band = 0.5 + 0.5 * Math.sin(h * 0.09 + n * 3);
    out.setRGB(0.66 + 0.12 * band, 0.4 + 0.12 * band, 0.22 + 0.08 * band);                      // sandstone strata
    if (slope > 0.55) out.lerp(new THREE.Color(0.7, 0.36, 0.22), 0.6);                             // darker cliff faces
    if (d < 20) out.lerp(new THREE.Color(0.62, 0.5, 0.36), 0.5);                                  // packed dirt by the road
  } else if (THEME === 'sonic') {
    out.setRGB(0.3 + 0.15 * n, 0.85 + 0.1 * n, 0.25);                                            // bright grass
    if (d < 34) { const chk = ((Math.floor(x / 9) + Math.floor(z / 9)) & 1) ? 0.78 : 0.6; out.setRGB(chk, chk * 0.62, chk * 0.32); }   // checkered dirt
    if (slope > 0.6) out.setRGB(0.55, 0.4, 0.28);
  } else if (THEME === 'woods') {
    out.setRGB(0.12 + 0.1 * n, 0.3 + 0.12 * n, 0.09);                                           // forest floor
    if (h > 330) out.lerp(new THREE.Color(0.5, 0.48, 0.46), smoothstep(330, 380, h));            // bare rock up top
    if (slope > 0.62) out.lerp(new THREE.Color(0.32, 0.28, 0.24), 0.6);
    if (d < 16) out.setRGB(0.28, 0.2, 0.12);
  } else if (THEME === 'ocean') {
    out.setRGB(0.2 + 0.1 * n, 0.32 + 0.12 * n, 0.4 + 0.1 * n);                                   // sand under blue water
    if (slope > 0.5) out.lerp(new THREE.Color(0.08, 0.14, 0.2), 0.7);                            // dark rock
  } else if (THEME === 'volcano') {
    out.setRGB(0.09 + 0.05 * n, 0.07 + 0.03 * n, 0.07);                                         // black basalt
    if (slope > 0.5) out.lerp(new THREE.Color(0.22, 0.16, 0.14), 0.5);
    if (h < -6) out.lerp(new THREE.Color(1.0, 0.35, 0.05), smoothstep(-6, -14, h));            // lava glow low down
    if (d < 14) out.setRGB(0.16, 0.13, 0.12);
  } else if (THEME === 'ice') {
    const crack = smoothstep(0.985, 1.0, Math.abs(Math.sin(fbm(x * 0.02, z * 0.02, 3) * 40)));
    out.setRGB(0.78 + 0.08 * n, 0.88 + 0.06 * n, 0.98); if (crack > 0.5) out.lerp(new THREE.Color(0.4, 0.6, 0.85), 0.5);   // pale ice with cracks
    if (h > 6) out.setRGB(0.9 + 0.06 * n, 0.93, 0.98); if (slope > 0.6) out.lerp(new THREE.Color(0.35, 0.36, 0.42), 0.7);
  } else if (THEME === 'docks') {
    const slab = ((Math.floor(x / 12) + Math.floor(z / 12)) & 1) ? 0.42 : 0.38; out.setRGB(slab + 0.04 * n, slab + 0.04 * n, slab + 0.05 * n);   // concrete slabs
    if (d < 9) out.setRGB(0.5, 0.48, 0.44);
  } else if (THEME === 'riviera') {
    out.setRGB(0.42 + 0.12 * n, 0.5 + 0.1 * n, 0.25);                                          // scrub hillside
    if (slope > 0.5) out.lerp(new THREE.Color(0.62, 0.52, 0.4), 0.6); if (h < 0.5) out.setRGB(0.86, 0.8, 0.66);   // beach
    if (d < 12) out.setRGB(0.6, 0.58, 0.54);
  } else if (THEME === 'touge') {
    out.setRGB(0.08 + 0.06 * n, 0.14 + 0.08 * n, 0.07);                                         // night forest floor
    if (slope > 0.62) out.lerp(new THREE.Color(0.22, 0.2, 0.18), 0.6); if (d < 14) out.setRGB(0.16, 0.13, 0.09);
  } else if (THEME === 'salt') {
    const hexc = smoothstep(0.96, 1.0, Math.abs(Math.sin(fbm(x * 0.03, z * 0.03, 2) * 60)));
    out.setRGB(0.95 + 0.04 * n, 0.95 + 0.04 * n, 0.93); if (hexc > 0.5) out.lerp(new THREE.Color(0.7, 0.7, 0.66), 0.5);   // white crust with polygon cracks
    if (h > 30) out.setRGB(0.55 + 0.1 * n, 0.5 + 0.1 * n, 0.45); if (slope > 0.55) out.lerp(new THREE.Color(0.4, 0.36, 0.33), 0.6);
  } else if (THEME === 'mars') {
    out.setRGB(0.62 + 0.12 * n, 0.3 + 0.08 * n, 0.16);                                          // rust
    if (slope > 0.55) out.lerp(new THREE.Color(0.35, 0.18, 0.1), 0.6); if (d < 16) out.setRGB(0.5, 0.26, 0.15);
  } else if (THEME === 'jungle') {
    out.setRGB(0.1 + 0.1 * n, 0.32 + 0.14 * n, 0.08);                                           // undergrowth
    if (h < 9) out.setRGB(0.35, 0.3, 0.2); if (slope > 0.6) out.lerp(new THREE.Color(0.3, 0.26, 0.2), 0.6); if (d < 12) out.setRGB(0.3, 0.24, 0.14);
  } else {
    out.setRGB(0.93 + 0.05 * n, 0.95 + 0.04 * n, 0.98);                                          // snow
    if (slope > 0.7) out.lerp(new THREE.Color(0.35, 0.36, 0.4), 0.7);                            // rock through the snow
    else if (slope > 0.4) out.lerp(new THREE.Color(0.78, 0.84, 0.92), 0.5);                      // blue shadow on the slopes
    if (d < 12) out.setRGB(0.82, 0.86, 0.9);
  }
  return out;
}
const ground = (() => {
  if (!OUTDOOR) {
    if (TH.floor === 'none') return null;
    const g = new THREE.PlaneGeometry(8000, 8000, 64, 64); g.rotateX(-Math.PI / 2); g.translate(0, 0, -450);
    const m = new THREE.Mesh(g, TH.floor === 'asphalt' ? new THREE.MeshStandardMaterial({ color: 0x0c0e14, roughness: 0.5, metalness: 0.25 }) : gridMat); m.receiveShadow = TH.floor === 'asphalt'; scene.add(m); return m;
  }
  if (THEME === 'sky') {
    // cloud decks: a soft cumulus layer below the rail and a thin high veil, drawn from noise
    const cloudTex = canvasTex(1024, (ctx, sz) => { const img = ctx.createImageData(sz, sz), d = img.data; for (let y = 0; y < sz; y++) for (let x = 0; x < sz; x++) { const k = (y * sz + x) * 4, n = fbm(x / 90, y / 90, 5); const a = smoothstep(0.42, 0.72, n); d[k] = 255; d[k + 1] = 255; d[k + 2] = 255; d[k + 3] = 255 * a; } ctx.putImageData(img, 0, 0); }, 6);
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000, 1, 1), new THREE.MeshStandardMaterial({ map: cloudTex, transparent: true, roughness: 1, color: 0xffffff, emissive: 0xdde8ff, emissiveIntensity: 0.25, depthWrite: false, side: THREE.DoubleSide })); deck.rotation.x = -Math.PI / 2; deck.position.set(0, 430, -800); scene.add(deck);
    const deck2 = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000, 1, 1), new THREE.MeshBasicMaterial({ color: 0xeaf2ff, transparent: true, opacity: 0.96, fog: true })); deck2.rotation.x = -Math.PI / 2; deck2.position.set(0, 330, -800); scene.add(deck2);
    return deck;
  }
  const RES = 400, SZ = 8000, g = new THREE.PlaneGeometry(SZ, SZ, RES, RES); g.rotateX(-Math.PI / 2); g.translate(0, 0, -600);
  const P = g.attributes.position, col = new Float32Array(P.count * 3), c = new THREE.Color();
  for (let k = 0; k < P.count; k++) P.setY(k, terrainH(P.getX(k), P.getZ(k)));
  g.computeVertexNormals();
  const Nn = g.attributes.normal;
  for (let k = 0; k < P.count; k++) { const x = P.getX(k), z = P.getZ(k), f = nearField(x, z); terrainColor(P.getY(k), 1 - Nn.getY(k), f.d, x, z, c); col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const detail = canvasTex(256, (ctx, sz) => { ctx.fillStyle = '#e6e6e6'; ctx.fillRect(0, 0, sz, sz); noiseFill(ctx, sz, 215, 40, 6000); }, 400); detail.encoding = THREE.LinearEncoding;
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.95, metalness: 0, envMapIntensity: 0.15 })); m.receiveShadow = true; scene.add(m); return m;
})();
// glossy black floor: a planar mirror just under the grid so the car and its light trail reflect in the plain (neon worlds)
const mirror = OUTDOOR || TH.floor === 'none' ? null : new THREE.Reflector(new THREE.PlaneGeometry(7000, 7000, 96, 96), { textureWidth: 1024, textureHeight: 1024, color: TH.mirror || 0x141c28, clipBias: 0.003 });   // subdivided: one giant quad z-fights the road at grazing angles
if (mirror) { mirror.rotation.x = -Math.PI / 2; mirror.position.set(0, -0.08, -450); scene.add(mirror); }
gridMat.uniforms.uMask.value = maskTex;
if (mirror) { const mm = mirror.material; mm.uniforms.uMask = { value: maskTex };
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
  ctx.fillStyle = TH.line; ctx.fillRect(18, 0, 14, s); ctx.fillRect(s - 32, 0, 14, s);
  ctx.fillStyle = TH.line2; ctx.fillRect(s / 2 - 5, 0, 10, s * 0.5);
});
const roadGlow = OUTDOOR ? null : canvasTex(1024, (ctx, s) => {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = TH.line; ctx.fillRect(18, 0, 14, s); ctx.fillRect(s - 32, 0, 14, s);
  ctx.fillStyle = TH.line2; ctx.fillRect(s / 2 - 5, 0, 10, s * 0.5);
});
if (roadGlow) roadGlow.anisotropy = maxAniso;
roadTex.anisotropy = maxAniso;
const neonHex = '#' + TH.neon.toString(16).padStart(6, '0');
const kerbTex = canvasTex(64, (ctx, s) => { ctx.fillStyle = OUTDOOR ? '#f4f1ea' : '#06101c'; ctx.fillRect(0, 0, s, s); ctx.fillStyle = OUTDOOR ? '#d42a2a' : neonHex; ctx.fillRect(0, 0, s, s / 2); });
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
ribbon(ROAD_HALF, ROAD_HALF + 1.1, 2, 0.07, i => KERB[i], kerbTex, 0xffffff, OUTDOOR ? null : kerbTex);
ribbon(ROAD_HALF + 1.1, D_WALL, 12, 0.03, null, null, TH.verge); // verge out to the wall
if (THEME === 'sky') { ribbon(-1.6, 1.6, 12, -0.9, null, null, 0x1a2230); ribbon(-D_WALL, D_WALL, 12, -0.35, null, null, 0x11161f); }   // the monorail beam and the underside of the deck

// scenery -------------------------------------------------------------
const scenery = new THREE.Group(); scene.add(scenery);
function instanced(geo, mat, items, shadow) {
  if (OUTDOOR && mat.isMeshStandardMaterial && mat.envMapIntensity === 1) mat.envMapIntensity = 0.2;
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
if (!OUTDOOR && TH.beacons !== false) { // light beacons along the circuit (not underground)
  const beacons = [];
  for (let i = 0; i < N; i += 28) { if (UNDER[i] || SPECIAL(i)) continue; const side = (i / 28) % 2 ? 1 : -1, p = S[i].clone().addScaledVector(RT[i], side * 22); beacons.push({ x: p.x, y: p.y, z: p.z, s: 1, sy: 1 + rnd() * 0.6 }); }
  instanced(new THREE.BoxGeometry(0.35, 9, 0.35).translate(0, 4.5, 0), new THREE.MeshBasicMaterial({ color: TH.neon, toneMapped: false }), beacons, false);
}
// ---------------------------------------------------------------- track architecture: tunnels, gates, canyon, bridges, floating grid solids
const inRanges = (i, ranges) => ranges.some(([a, b]) => i >= a && i <= b);
// tunnels go where the track bends most: three non-overlapping 150-sample windows of highest turning, off the main straight
const TUBE = !!TH.tube;
const TUNNELS = (TUBE || TH.allTunnel) ? (() => { const out = []; let cur = -1; for (let i = 0; i <= N; i++) { if (i < N && !JUMP[i]) { if (cur < 0) cur = i; } else if (cur >= 0) { out.push([cur, i - 1]); cur = -1; } } return out; })() : OUTDOOR ? (() => { const out = []; let cur = -1; for (let i = 0; i <= N; i++) { if (i < N && CAVE[i]) { if (cur < 0) cur = i; } else if (cur >= 0) { out.push([cur, i - 1]); cur = -1; } } return out; })() : (() => {
  const turn = new Float32Array(N); for (let i = 0; i < N; i++) turn[i] = Math.abs(KAPPA[i]);
  const LEN = 150, cand = [], out = [];
  { let best = [0, -1], cur = -1; for (let i = 0; i <= N; i++) { if (i < N && UNDER[i]) { if (cur < 0) cur = i; } else if (cur >= 0) { if (i - cur > best[1] - best[0]) best = [cur, i - 1]; cur = -1; } } if (best[1] > 0) out.push([Math.max(0, best[0] - 8), Math.min(N - 1, best[1] + 8)]); }   // longest underground run only
  for (let i = 230; i < N - 230 - LEN; i += 5) { if (out.some(([a, b]) => i < b + 60 && i + LEN > a - 60)) continue; let bad = false, sum = 0; for (let k = 0; k < LEN; k++) { if (SPECIAL(i + k) || UNDER[i + k]) bad = true; sum += turn[i + k]; } if (!bad) cand.push([sum, i]); }
  cand.sort((x, y) => y[0] - x[0]);
  for (const [, i] of cand) { if (out.every(([a, b]) => i > b + 60 || i + LEN < a - 60)) out.push([i, i + LEN]); if (out.length === 3) break; }
  return out.sort((x, y) => x[0] - y[0]);
})();
const CANYON = THEME === 'tron' ? [[N - 240, N - 40]] : [];   // home straight canyon, The Grid only
const neonMat = new THREE.MeshBasicMaterial({ color: TH.neon, toneMapped: false });
const neonWhite = new THREE.MeshBasicMaterial({ color: 0xdff8ff, toneMapped: false });
const shellMat = new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 0.55, metalness: 0.4, side: THREE.DoubleSide });
{ // tunnels: rounded-rectangle shell (superellipse) with two continuous shoulder light bands and a white ceiling strip,
  // slim raked fins every ~9 m, thick white portal at each mouth, one soft light in the middle of each
  const seamTex = canvasTex(512, (ctx, s) => {
    ctx.fillStyle = '#04070e'; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#0c1a2c'; ctx.lineWidth = 2; for (let x = 0; x < s; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, s); ctx.stroke(); } for (let y = 0; y < s; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke(); }
    ctx.fillStyle = neonHex; for (const u of [0.2, 0.8]) ctx.fillRect(u * s - 4, 0, 8, s);
    ctx.fillStyle = '#eafcff'; ctx.fillRect(0.5 * s - 2, 0, 4, s);
  });
  // caves: rock, lit by warm lamps
  const rockTex = canvasTex(512, (ctx, sz) => { const base = TH.rock || [150, 90, 55]; ctx.fillStyle = `rgb(${base.join(',')})`; ctx.fillRect(0, 0, sz, sz); noiseFill(ctx, sz, 120, 90, 14000); ctx.globalAlpha = 0.35; for (let y = 0; y < sz; y += 24 + Math.random() * 30) { ctx.fillStyle = Math.random() < 0.5 ? '#3a2418' : '#a06a40'; ctx.fillRect(0, y, sz, 3 + Math.random() * 6); } ctx.globalAlpha = 1; });
  // SPACE STATION: light panels with a window band you can see the stars and Earth through
  const stationTex = THEME === 'station' ? canvasTex(512, (ctx, sz) => { ctx.clearRect(0, 0, sz, sz); ctx.fillStyle = '#c9d3dc'; ctx.fillRect(0, 0, sz, sz); ctx.strokeStyle = '#8a96a2'; ctx.lineWidth = 3; for (let x = 0; x < sz; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, sz); ctx.stroke(); } for (let y = 0; y < sz; y += 128) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(sz, y); ctx.stroke(); }
    for (const u of [0.11, 0.77]) ctx.clearRect(u * sz, 0, 0.12 * sz, sz); ctx.fillStyle = '#9fd8ff'; for (const u of [0.31, 0.67]) ctx.fillRect(u * sz - 3, 0, 6, sz); ctx.fillStyle = '#ffffff'; ctx.fillRect(0.5 * sz - 2, 0, 4, sz); }) : null;
  const shellMatT = THEME === 'station' ? new THREE.MeshStandardMaterial({ map: stationTex, emissiveMap: stationTex, emissive: 0x334455, emissiveIntensity: 0.9, color: 0xe6edf3, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide, transparent: true, alphaTest: 0.5 })
    : TUBE ? new THREE.MeshPhysicalMaterial({ color: 0x9fe6ff, transparent: true, opacity: 0.11, roughness: 0.04, metalness: 0.05, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 0.6 })
    : OUTDOOR ? new THREE.MeshStandardMaterial({ map: rockTex, color: 0xffffff, roughness: 0.95, metalness: 0, side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({ map: seamTex, emissiveMap: seamTex, emissive: 0xffffff, emissiveIntensity: 1.6, color: 0x7f8fa6, roughness: 0.35, metalness: 0.5, side: THREE.DoubleSide });
  const BIG = OUTDOOR || TH.tunnelBig, SEG = 22, W = TUBE ? 10.4 : BIG ? 11 : 9.6, H = TUBE ? 7.2 : BIG ? 7.5 : 6.4, E = TUBE ? 1 : BIG ? 2 / 2.2 : 2 / 3.6;
  const arc = [];
  for (let k = 0; k <= SEG; k++) { const a = Math.PI * (1 - k / SEG), c = Math.cos(a), si = Math.sin(a); arc.push([W * Math.sign(c) * Math.pow(Math.abs(c), E), H * Math.pow(Math.max(0, si), E)]); }
  const pos = [], uv = [];
  for (const [i0, i1] of TUNNELS) for (let i = i0; i < Math.min(i1, N - 2); i++) {
    const A = frameAt(i), B = frameAt(i + 1), v0 = CUM[i] / 12, v1 = (CUM[i] + S[i].distanceTo(S[i + 1])) / 12;
    for (let k = 0; k < SEG; k++) {
      const p = (f, q) => f.p.clone().addScaledVector(f.b, q[0]).addScaledVector(f.n, q[1]);
      const a = p(A, arc[k]), b = p(A, arc[k + 1]), c = p(B, arc[k + 1]), d = p(B, arc[k]);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
      const u0 = k / SEG, u1 = (k + 1) / SEG; uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
  if (THEME !== 'sky') { const tunnel = new THREE.Mesh(g, shellMatT); tunnel.receiveShadow = !TUBE; if (TUBE) tunnel.renderOrder = 5; scene.add(tunnel); }
  const path = new THREE.CatmullRomCurve3(arc.map(q => new THREE.Vector3(0, q[1] + 0.12, q[0])));   // fins live in the (right, up) plane; instances carry the full road frame
  const finGeo = new THREE.TubeGeometry(path, 48, 0.09, 6, false), portalGeo = new THREE.TubeGeometry(path, 48, 0.35, 8, false);
  finGeo.applyMatrix4(new THREE.Matrix4().set(1, 0.32, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1));   // rake: lean the fin forward with height
  if (THEME === 'sky') {
    // LED tunnels: each range gets its own colour, panels dark with lit seams, and fins in that colour
    for (const [i0, i1] of TUNNELS) {
      const hex = CAVE_HEX[Math.floor((i0 + i1) / 2)] || TH.neon, hx = '#' + hex.toString(16).padStart(6, '0');
      const tex = canvasTex(512, (ctx, sz) => { ctx.fillStyle = '#0a0d14'; ctx.fillRect(0, 0, sz, sz); ctx.strokeStyle = '#1a2030'; ctx.lineWidth = 2; for (let x = 0; x < sz; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, sz); ctx.stroke(); } ctx.fillStyle = hx; for (const u of [0.15, 0.35, 0.65, 0.85]) ctx.fillRect(u * sz - 3, 0, 6, sz); ctx.fillStyle = '#ffffff'; ctx.fillRect(0.5 * sz - 2, 0, 4, sz); });
      const pos2 = [], uv2 = [];
      for (let i = i0; i < Math.min(i1, N - 2); i++) { const A = frameAt(i), B = frameAt(i + 1), v0 = CUM[i] / 12, v1 = (CUM[i] + S[i].distanceTo(S[i + 1])) / 12;
        for (let k = 0; k < SEG; k++) { const p = (f, q) => f.p.clone().addScaledVector(f.b, q[0]).addScaledVector(f.n, q[1]); const a = p(A, arc[k]), b = p(A, arc[k + 1]), c = p(B, arc[k + 1]), d = p(B, arc[k]); pos2.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z); const u0 = k / SEG, u1 = (k + 1) / SEG; uv2.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1); } }
      const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(pos2, 3)); g2.setAttribute('uv', new THREE.Float32BufferAttribute(uv2, 2)); g2.computeVertexNormals();
      scene.add(new THREE.Mesh(g2, new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.9, color: 0x6b7a8c, roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide })));
      const fins2 = []; for (let i = i0 + 3; i < i1 - 3; i += 3) { const f = frameAt(i); fins2.push({ x: f.p.x, y: f.p.y, z: f.p.z, quat: f.quat }); }
      instanced(finGeo, new THREE.MeshBasicMaterial({ color: hex, toneMapped: false }), fins2, false);
      for (let i = i0 + 30; i < i1 - 10; i += 90) { const m = frameAt(i), l = new THREE.PointLight(hex, 1.3, 110, 1.5); l.position.copy(m.p).addScaledVector(m.n, 4.5); scene.add(l); }
      const edge = ribbon(ROOF_W + 0.35, ROOF_W + 0.9, 12, ROOF_H + 0.03, i => i >= i0 && i < i1, null, hex); edge.material = new THREE.MeshBasicMaterial({ color: hex, toneMapped: false });   // lit edge of the roof deck
    }
    ribbon(-(ROOF_W + 0.9), ROOF_W + 0.9, 12, ROOF_H, i => CAVE[i], null, 0x1a2230);   // the roof deck: overshoot a jump and you land up here
    { const dash = []; for (const [i0, i1] of TUNNELS) for (let i = i0 + 4; i < i1 - 4; i += 6) { const f = frameAt(i); dash.push({ x: f.p.x + f.n.x * (ROOF_H + 0.04), y: f.p.y + f.n.y * (ROOF_H + 0.04), z: f.p.z + f.n.z * (ROOF_H + 0.04), quat: f.quat }); } instanced(new THREE.BoxGeometry(2.4, 0.02, 0.18), new THREE.MeshBasicMaterial({ color: 0xf4f1ea }), dash, false); }
  }
  const fins = [], portals = [];
  for (const [i0, i1] of TUNNELS) {
    for (let i = i0 + 3; i < i1 - 3; i += 3) { const f = frameAt(i); fins.push({ x: f.p.x, y: f.p.y, z: f.p.z, quat: f.quat }); }
    for (const i of [i0, i1]) { const f = frameAt(i); portals.push({ x: f.p.x, y: f.p.y, z: f.p.z, quat: f.quat }); }
    if (THEME === 'sky') {}
    else if (THEME === 'station') { for (let i = i0 + 20; i < i1 - 10; i += 70) { const m = frameAt(i), l = new THREE.PointLight(0xcfe8ff, 1.0, 90, 1.5); l.position.copy(m.p).addScaledVector(m.n, 5.5); scene.add(l); } }
    else if (TUBE) { for (let i = i0 + 100; i < i1 - 50; i += 230) { const m = frameAt(i), l = new THREE.PointLight(0x7fe8ff, 1.1, 120, 1.4); l.position.copy(m.p).addScaledVector(m.n, 4.5); scene.add(l); } }
    else if (OUTDOOR) { for (let i = i0 + 25; i < i1 - 10; i += 50) { const m = frameAt(i), l = new THREE.PointLight(0xffb070, 1.4, 90, 1.5); l.position.copy(m.p).addScaledVector(m.n, 5); scene.add(l); } }
    else { const m = frameAt(Math.floor((i0 + i1) / 2)), l = new THREE.PointLight(0x9fe8ff, 1.2, 160, 1.6); l.position.copy(m.p).addScaledVector(m.n, 4.5); scene.add(l); }
  }
  if (!OUTDOOR) { instanced(finGeo, neonMat, fins, false); instanced(portalGeo, neonWhite, portals, false); }
  if (TUBE) { const ribs = []; for (const [i0, i1] of TUNNELS) for (let i = i0; i < i1; i += 3) { const f = frameAt(i); ribs.push({ x: f.p.x, y: f.p.y, z: f.p.z, quat: f.quat }); } instanced(new THREE.TubeGeometry(path, 48, 0.16, 6, false), new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x2ea8ff, emissiveIntensity: 0.9, metalness: 0.8, roughness: 0.3 }), ribs, false); instanced(portalGeo, neonWhite, portals, false); }
}
{ // jump lips: white bars across the road at take-off and landing
  const bars = [];
  for (const J of JUMPS) for (const i of [J.i0 - 1, J.i1 + 1]) { const f = frameAt(i); bars.push({ x: f.p.x, y: f.p.y, z: f.p.z, quat: f.quat }); }
  instanced(new THREE.BoxGeometry(0.5, 0.3, ROAD_HALF * 2 + 1).translate(0, 0.15, 0), neonWhite, bars, false);
}
const boostMat = new THREE.MeshBasicMaterial({ color: TH.neon, toneMapped: false, transparent: true, opacity: 0.95 });
const BOOST_HUE = (() => { const c = new THREE.Color(TH.neon), h = {}; c.getHSL(h); return h.h; })();
{ // booster arrows lying on the road, pointing along it
  const sh = new THREE.Shape(); [[0, -1.2], [2.6, -1.2], [2.6, -2.4], [5.2, 0], [2.6, 2.4], [2.6, 1.2], [0, 1.2]].forEach(([x, y], k) => k ? sh.lineTo(x, y) : sh.moveTo(x, y)); sh.closePath();
  const geo = new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2).translate(-2.6, 0.08, 0);
  const items = PADS.map(i => { const f = frameAt(i); return { x: f.p.x, y: f.p.y, z: f.p.z, quat: f.quat }; });
  instanced(geo, boostMat, items, false);
  if (PADS2.length) { const big = new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2).translate(-2.6, 0.09, 0).scale(1.9, 1, 1.9); const it2 = []; for (const i of PADS2) for (const k of [-4, 0, 4]) { const f = frameAt((i + k + N) % N); it2.push({ x: f.p.x, y: f.p.y, z: f.p.z, quat: f.quat }); } instanced(big, new THREE.MeshBasicMaterial({ color: 0xff3af0, toneMapped: false, transparent: true, opacity: 0.95 }), it2, false); }
}
if (CANYON.length) { // canyon on the approach to the main straight: tall dark walls with vertical light seams and a lit top edge
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
  const wallTex = OUTDOOR
    ? canvasTex(64, (ctx, sz) => { ctx.fillStyle = TH.wallHex || '#9a9a96'; ctx.fillRect(0, 0, sz, sz); noiseFill(ctx, sz, 150, 40, 700); ctx.fillStyle = neonHex; ctx.fillRect(0, 10, sz, 10); ctx.fillStyle = '#2a2a2a'; ctx.fillRect(0, sz - 6, sz, 6); })
    : canvasTex(64, (ctx, sz) => { ctx.fillStyle = '#06101c'; ctx.fillRect(0, 0, sz, sz); ctx.fillStyle = neonHex; ctx.fillRect(0, 0, sz, 7); ctx.fillStyle = TH.wallLow || '#0a6a90'; ctx.fillRect(0, sz - 4, sz, 4); });
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
  const wall = new THREE.Mesh(g, OUTDOOR ? new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide }) : new THREE.MeshStandardMaterial({ map: wallTex, emissiveMap: wallTex, emissive: 0xffffff, emissiveIntensity: 1.3, metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })); wall.receiveShadow = true; scene.add(wall);
  instanced(new THREE.BoxGeometry(0.12, 1.0, 0.12).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x0a1626, metalness: 0.6, roughness: 0.5 }), posts, false);
}
// ---------------------------------------------------------------- rings (SUPERSONIC): gold rings along the road, 10 points each; ten of them arm the NOS, twenty go SUPERSONIC
const COINS = [], RING_AT = TRACK.rings ? new Array(N).fill(null) : null;
let ringMesh = null;
if (TRACK.rings) {
  const lanes = [-3, 0, 3, 0];
  for (let i = 30, k = 0; i < N - 10; i += 7, k++) { if (JUMP[i] || LOOP[i] >= 0 || ROLL[i] >= 0) continue; const d = lanes[Math.floor(k / 4) % 4]; COINS.push({ i, s: CUM[i], d, alive: true, id: COINS.length }); (RING_AT[i] = RING_AT[i] || []).push(COINS.length - 1); }
  const geo = new THREE.TorusGeometry(0.95, 0.13, 8, 26);
  ringMesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffc400, emissive: 0xff9a00, emissiveIntensity: 0.75, metalness: 0.85, roughness: 0.25 }), COINS.length);
  ringMesh.castShadow = false; scene.add(ringMesh);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qy = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(1, 1, 1), z3 = new THREE.Vector3(0, 0, 0);
  window.__ringsAnimate = (now) => {
    const ang = now / 1000 * 2.4;
    for (const r of COINS) {
      if (!r.alive) { m4.compose(p3.set(0, -1000, 0), q, z3); ringMesh.setMatrixAt(r.id, m4); continue; }
      const fr = frameAt(r.i); p3.copy(fr.p).addScaledVector(fr.b, r.d).addScaledVector(fr.n, 1.3);
      q.copy(fr.quat).multiply(qy.setFromAxisAngle(WORLD_UP, ang + r.id * 0.7));
      m4.compose(p3, q, s3); ringMesh.setMatrixAt(r.id, m4);
    }
    ringMesh.instanceMatrix.needsUpdate = true;
  };
  window.__ringsAnimate(0);
}
function ringsRespawn() { for (const r of COINS) r.alive = true; }
// ---------------------------------------------------------------- world dressing per theme
const snowfall = { pts: null };
const rainMat = THEME === 'matrix' ? new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true, blending: THREE.AdditiveBlending,
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
  vertexShader: `varying vec3 vW;
#include <fog_pars_vertex>
    void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
    }`,
  fragmentShader: `uniform float uTime; varying vec3 vW;
#include <fog_pars_fragment>
    float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main(){
      // vertical code rain: 1.2 m columns keyed on x+z, glyph cells falling down y with a bright head
      float colx = floor((vW.x + vW.z) / 1.2); vec2 cell = vec2(colx, floor(vW.y / 1.2));
      float sp = 3.0 + 9.0 * hsh(vec2(colx, 1.0)), ph = 61.0 * hsh(vec2(colx, 2.0));
      float trail = fract((-cell.y + uTime * sp + ph) / 22.0);
      float bright = pow(1.0 - trail, 2.2);
      float glyph = step(0.38, hsh(cell + floor(uTime * (2.0 + 4.0 * hsh(vec2(colx, 3.0)))) * 0.017));
      vec2 inCell = fract(vec2((vW.x + vW.z), vW.y) / 1.2); float box = step(0.15, inCell.x) * step(inCell.x, 0.85) * step(0.1, inCell.y) * step(inCell.y, 0.9);
      vec3 col = mix(vec3(0.2, 1.0, 0.35), vec3(0.85, 1.0, 0.9), step(0.955, 1.0 - trail)) * bright * glyph * box;
      gl_FragColor = vec4(col * 1.4, max(max(col.r, col.g), col.b) * 0.9);
#include <fog_fragment>
    }`,
}) : null;
// ---------------------------------------------------------------- dressing for the ten later worlds: one function each, sharing a few props
const waterPlane = (y, hex, op) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000, 1, 1), new THREE.MeshStandardMaterial({ color: hex, roughness: 0.12, metalness: 0.55, transparent: true, opacity: op == null ? 0.88 : op, envMapIntensity: 0.6 })); m.rotation.x = -Math.PI / 2; m.position.set(0, y, -600); scene.add(m); return m; };
const pinesAt = (items, snowy) => { items.forEach(it => { it.s = 0.7 + rnd() * 0.8; it.rot = rnd() * 6.28; });
  instanced(new THREE.ConeGeometry(3.2, 11, 7).translate(0, 9.5, 0), new THREE.MeshStandardMaterial({ color: snowy ? 0x4a6a58 : 0x1d4a22, roughness: 0.95, flatShading: true, envMapIntensity: 0.2 }), items, true);
  if (snowy) instanced(new THREE.ConeGeometry(2.4, 6, 7).translate(0, 12.6, 0), new THREE.MeshStandardMaterial({ color: 0xf2f6fa, roughness: 1, flatShading: true }), items, false);
  instanced(new THREE.CylinderGeometry(0.35, 0.5, 5, 6).translate(0, 2.5, 0), new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.95 }), items, false); };
const palmsAt = items => { items.forEach(it => { it.s = 0.8 + rnd() * 0.7; it.rot = rnd() * 6.28; });
  instanced(new THREE.CylinderGeometry(0.28, 0.5, 9, 6).translate(0, 4.5, 0).rotateZ(0.12), new THREE.MeshStandardMaterial({ color: 0x7a5a30, roughness: 0.9 }), items, true);
  instanced(new THREE.ConeGeometry(4.2, 2.2, 6, 1, true).translate(0, 9.2, 0), new THREE.MeshStandardMaterial({ color: 0x2fa83a, roughness: 0.9, side: THREE.DoubleSide, flatShading: true }), items, false);
  instanced(new THREE.SphereGeometry(0.5, 6, 5).translate(0, 8.4, 0), new THREE.MeshStandardMaterial({ color: 0x5a3a18, roughness: 0.9 }), items, false); };
const driftPoints = (count, hex, size, op, up) => { const arr = new Float32Array(count * 3); for (let k = 0; k < count; k++) { arr[k * 3] = (rnd() - 0.5) * 150; arr[k * 3 + 1] = (rnd() - 0.5) * 80; arr[k * 3 + 2] = (rnd() - 0.5) * 150; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3)); snowfall.pts = new THREE.Points(g, new THREE.PointsMaterial({ color: hex, size, sizeAttenuation: true, transparent: true, opacity: op, depthWrite: false, fog: true })); snowfall.up = !!up; scene.add(snowfall.pts); };
const DRESS = {
  city() {
    // towers with lit windows on both sides, taller further from the road; neon signs by the kerb; the mirror floor is the wet street
    const winTex = canvasTex(512, (ctx, sz) => { ctx.fillStyle = '#0a0c14'; ctx.fillRect(0, 0, sz, sz); for (let y = 4; y < sz; y += 12) for (let x = 4; x < sz; x += 10) { const r = rnd(); if (r < 0.5) { ctx.fillStyle = r < 0.1 ? '#ffe9b0' : r < 0.25 ? '#9fd8ff' : '#e8f0ff'; ctx.globalAlpha = 0.4 + rnd() * 0.6; ctx.fillRect(x, y, 6, 7); } } ctx.globalAlpha = 1; }, 1);
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const q of S) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
    const towers = []; let tries = 0;
    while (towers.length < 1300 && tries++ < 20000) { const x = x0 - 500 + rnd() * (x1 - x0 + 1000), z = z0 - 500 + rnd() * (z1 - z0 + 1000), d = trackDist(x, z), sz = 10 + rnd() * 16; if (d < 26 + sz * 0.75 || d > 1100) continue; const far = clamp((d - 24) / 500, 0, 1); towers.push({ x, y: 0, z, s: sz, sy: 16 + rnd() * rnd() * (50 + 130 * far), rot: Math.round(rnd() * 4) * Math.PI / 2, c: rnd() < 0.5 ? 0x9aa4b8 : 0xb8c0d0 }); }
    instancedColored(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ map: winTex, emissiveMap: winTex, emissive: 0xffffff, emissiveIntensity: 1.0, roughness: 0.6, metalness: 0.3 }), towers, true);
    const signs = [], sc = [0xff2ad8, 0x2ee6ff, 0xffd23a, 0x8aff3a, 0xff4a4a];
    for (let i = 6; i < N; i += 11) { if (UNDER[i] || SPECIAL(i) || CAVE[i]) continue; const f = frameAt(i), side = (i / 11) % 2 ? 1 : -1, p = f.p.clone().addScaledVector(f.b, side * (D_WALL + 3 + rnd() * 6)); signs.push({ x: p.x, y: p.y + 4 + rnd() * 9, z: p.z, quat: f.quat, s: 1, sy: 2 + rnd() * 6, c: sc[Math.floor(rnd() * sc.length)] }); }
    instancedColored(new THREE.BoxGeometry(0.3, 1, 5), new THREE.MeshBasicMaterial({ toneMapped: false }), signs, false);
    const lamps = []; for (let i = 0; i < N; i += 16) { if (JUMP[i] || CAVE[i]) continue; const f = frameAt(i), side = (i / 16) % 2 ? 1 : -1, p = f.p.clone().addScaledVector(f.b, side * (D_WALL + 1.2)); lamps.push({ x: p.x, y: p.y, z: p.z, quat: f.quat }); }
    instanced(new THREE.CylinderGeometry(0.08, 0.12, 7, 5).translate(0, 3.5, 0), new THREE.MeshStandardMaterial({ color: 0x3a3a44, metalness: 0.6, roughness: 0.5 }), lamps, false);
    instanced(new THREE.SphereGeometry(0.35, 8, 6).translate(0, 7, 0), new THREE.MeshBasicMaterial({ color: 0xfff0c0, toneMapped: false }), lamps, false);
  },
  volcano(scatter) {
    const rocks = scatter(1400, 14, 1300, 600, () => true); rocks.forEach(it => { it.s = 1.5 + rnd() * rnd() * 18; it.sy = it.s * (0.5 + rnd() * 0.5); it.rot = rnd() * 6.28; it.c = rnd() < 0.7 ? 0x14100f : 0x2a201c; });
    instancedColored(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), rocks, true);
    // lava: a glowing lake in every low place, the crater floor, embers rising past the car
    const lavaTex = canvasTex(512, (ctx, sz) => { const img = ctx.createImageData(sz, sz), d = img.data; for (let y = 0; y < sz; y++) for (let x = 0; x < sz; x++) { const k = (y * sz + x) * 4, n = fbm(x / 36, y / 36, 4), c = smoothstep(0.35, 0.7, n); d[k] = 255 * (0.35 + 0.65 * c); d[k + 1] = 255 * (0.05 + 0.4 * c * c); d[k + 2] = 8; d[k + 3] = 255; } ctx.putImageData(img, 0, 0); }, 12);
    const lavaMat = new THREE.MeshBasicMaterial({ map: lavaTex, toneMapped: false, fog: true });
    const lake = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000, 1, 1), lavaMat); lake.rotation.x = -Math.PI / 2; lake.position.set(0, -9, -600); scene.add(lake);
    const crater = new THREE.Mesh(new THREE.CircleGeometry(240, 40), lavaMat); crater.rotation.x = -Math.PI / 2; crater.position.set(1050, terrainH(1050, -1850) + 1.5, -1850); scene.add(crater);
    const crLight = new THREE.PointLight(0xff5a10, 2.5, 800, 1.3); crLight.position.set(1050, crater.position.y + 60, -1850); scene.add(crLight);
    window.__worldAnimate = now => { lavaTex.offset.set(now * 0.00002, now * 0.000013); };
    driftPoints(900, 0xff8a30, 0.35, 0.85, true);
  },
  ice(scatter) {
    // aurora: four tall curtains, additive, drifting and swaying; pines on the far shore; a light snowfall
    const auroraTex = canvasTex(256, (ctx, sz) => { const g = ctx.createLinearGradient(0, 0, 0, sz); g.addColorStop(0, 'rgba(120,255,180,0)'); g.addColorStop(0.35, 'rgba(90,255,160,0.6)'); g.addColorStop(0.7, 'rgba(150,80,255,0.4)'); g.addColorStop(1, 'rgba(150,80,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, sz, sz); ctx.globalCompositeOperation = 'destination-in'; for (let x = 0; x < sz; x += 2) { ctx.fillStyle = 'rgba(0,0,0,' + (0.3 + 0.7 * fbm(x / 22, 3, 3)) + ')'; ctx.fillRect(x, 0, 2, sz); } }, 1);
    const curtains = [];
    for (let k = 0; k < 4; k++) { const t2 = auroraTex.clone(); t2.needsUpdate = true; const m = new THREE.Mesh(new THREE.PlaneGeometry(3600, 700, 24, 1), new THREE.MeshBasicMaterial({ map: t2, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false })); m.position.set(-800 + k * 700, 900 + k * 60, -2600 - k * 400); m.rotation.y = 0.3 * k - 0.4; scene.add(m); curtains.push(m); }
    window.__worldAnimate = now => { const t = now / 1000; curtains.forEach((m, k) => { m.material.map.offset.x = t * 0.01 * (k + 1); const P = m.geometry.attributes.position; for (let i = 0; i < P.count; i++) P.setZ(i, Math.sin(P.getX(i) * 0.004 + t * 0.6 + k) * 60); P.needsUpdate = true; }); };
    pinesAt(scatter(2600, 600, 3200, 1500, h => h > 8 && h < 320), true);
    driftPoints(1200, 0xffffff, 0.3, 0.7, false);
  },
  docks(scatter) {
    waterPlane(TH.water, TH.waterCol, 0.92);
    // container stacks in colours, cranes on the quay, two ships under the two road decks, lamps along the front
    const cont = [], cols = [0xc23b22, 0x1f5fa8, 0x2e8b57, 0xd9a520, 0x6b7280, 0xb8442a, 0x3a7ca5, 0xe0e0e0];
    scatter(420, 34, 520, 300, h => h > 0.5).forEach(it => { const n = 1 + Math.floor(rnd() * 3), rot = Math.round(rnd() * 2) * Math.PI / 2; for (let k = 0; k < n; k++) cont.push({ x: it.x, y: it.y + k * 2.6, z: it.z, rot, s: 1, c: cols[Math.floor(rnd() * cols.length)] }); });
    instancedColored(new THREE.BoxGeometry(12.2, 2.6, 2.44).translate(0, 1.3, 0), new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.3 }), cont, true);
    const cranes = [[300, -2450], [-100, -2450], [-600, -1900], [-740, -1150], [500, -650], [1150, -400]].filter(([x, z]) => trackDist(x, z) > 30).map(([x, z]) => ({ x, y: 1.2, z, rot: rnd() * 6.28, s: 1 }));
    const leg = new THREE.BoxGeometry(2, 34, 2);
    instanced(mergeGeos([leg.clone().translate(-9, 17, 0), leg.clone().translate(9, 17, 0), new THREE.BoxGeometry(22, 2.4, 2.4).translate(0, 35, 0), new THREE.BoxGeometry(2.4, 2.4, 44).translate(0, 37, 8), new THREE.BoxGeometry(1.2, 6, 1.2).translate(0, 41, 0)]), new THREE.MeshStandardMaterial({ color: 0xd9a520, roughness: 0.6, metalness: 0.4 }), cranes, true);
    for (const [z0, z1] of [[-1180, -1470], [-1600, -1960]]) { const L = z0 - z1, cz = (z0 + z1) / 2;
      const hull = new THREE.Mesh(new THREE.BoxGeometry(46, 12, L), new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.6, metalness: 0.4 })); hull.position.set(960, 1.5, cz); scene.add(hull);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(46, 1, L), new THREE.MeshStandardMaterial({ color: 0x7a1a1a, roughness: 0.8 })); deck.position.set(960, 7.5, cz); scene.add(deck);
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(12, 14, 12), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.6 })); bridge.position.set(960 + 16, 15, z0 - 20); bridge.castShadow = true; scene.add(bridge); }
    const lamps = []; for (let i = 0; i < N; i += 14) { if (JUMP[i]) continue; const f = frameAt(i), side = (i / 14) % 2 ? 1 : -1, p = f.p.clone().addScaledVector(f.b, side * (D_WALL + 1.5)); lamps.push({ x: p.x, y: p.y, z: p.z, quat: f.quat }); }
    instanced(new THREE.CylinderGeometry(0.1, 0.14, 9, 5).translate(0, 4.5, 0), new THREE.MeshStandardMaterial({ color: 0x555a60, metalness: 0.6, roughness: 0.5 }), lamps, false);
    instanced(new THREE.BoxGeometry(1.2, 0.3, 0.5).translate(0, 9, 0), new THREE.MeshBasicMaterial({ color: 0xffd080, toneMapped: false }), lamps, false);
  },
  station() {
    // Earth off to the side and below, turning slowly; a sun; solar wings and masts along the corridor
    const earthTex = canvasTex(1024, (ctx, sz) => { const img = ctx.createImageData(sz, sz), d = img.data; for (let y = 0; y < sz; y++) for (let x = 0; x < sz; x++) { const k = (y * sz + x) * 4, n = fbm(x / 110, y / 110, 5), land = smoothstep(0.5, 0.56, n), cloud = smoothstep(0.58, 0.75, fbm(x / 60 + 9, y / 60 + 4, 4)); let r = 0.1 + 0.3 * land, g = 0.3 + 0.35 * land, b = 0.65 - 0.4 * land; r += (1 - r) * cloud; g += (1 - g) * cloud; b += (1 - b) * cloud; d[k] = 255 * r; d[k + 1] = 255 * g; d[k + 2] = 255 * b; d[k + 3] = 255; } ctx.putImageData(img, 0, 0); }, 1);
    const earth = new THREE.Mesh(new THREE.SphereGeometry(2600, 48, 32), new THREE.MeshStandardMaterial({ map: earthTex, roughness: 0.9, emissive: 0x0a1a3a, emissiveIntensity: 0.5, fog: false })); earth.position.set(-1400, -3300, -700); scene.add(earth);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(2690, 32, 24), new THREE.MeshBasicMaterial({ color: 0x7fc8ff, transparent: true, opacity: 0.12, side: THREE.BackSide, fog: false })); halo.position.copy(earth.position); scene.add(halo);
    const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(120, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, toneMapped: false })); sunDisc.position.copy(sunDir).multiplyScalar(7000); scene.add(sunDisc);
    window.__worldAnimate = now => { earth.rotation.y = now * 0.00001; };
    const wings = []; for (let i = 40; i < N; i += 140) { if (JUMP[i]) continue; const f = frameAt(i), side = (i / 140) % 2 ? 1 : -1, p = f.p.clone().addScaledVector(f.b, side * 40); wings.push({ x: p.x, y: p.y, z: p.z, quat: f.quat, s: 1 }); }
    instanced(new THREE.BoxGeometry(3, 0.3, 46).translate(0, 8, 0), new THREE.MeshStandardMaterial({ color: 0x1a3a6a, roughness: 0.3, metalness: 0.8, emissive: 0x0a2040, emissiveIntensity: 0.4 }), wings, false);
    instanced(new THREE.BoxGeometry(1.2, 1.2, 46).translate(0, 4, 0), new THREE.MeshStandardMaterial({ color: 0xb0b8c0, roughness: 0.5, metalness: 0.7 }), wings, false);
  },
  riviera(scatter) {
    waterPlane(TH.water, TH.waterCol, 0.9);
    // pastel houses up the hill with tiled roofs, palms along the front, yachts in the harbour
    const pastel = [0xf2d8b0, 0xf6c9a8, 0xe8b8a0, 0xf4e2c6, 0xd8c8b8, 0xf0d0c0, 0xe0c8a8];
    const houses = scatter(900, 24, 700, 300, (h, slope) => h > 1 && slope < 0.7); houses.forEach(it => { it.s = 8 + rnd() * 10; it.sy = 7 + rnd() * 12; it.rot = rnd() * 6.28; it.c = pastel[Math.floor(rnd() * pastel.length)]; });
    instancedColored(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ roughness: 0.8 }), houses, true);
    instancedColored(new THREE.ConeGeometry(0.75, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), houses.map(it => ({ x: it.x, z: it.z, rot: it.rot, s: it.s, sy: 2.2, y: it.y + it.sy, c: 0xb8563a })), false);
    palmsAt(scatter(500, 10, 260, 200, (h, slope) => h > 0.5 && h < 40 && slope < 0.5));
    const yachts = []; for (let k = 0; k < 70; k++) yachts.push({ x: -900 + rnd() * 2200, y: TH.water + 0.3, z: 330 + rnd() * 700, rot: rnd() * 6.28, s: 1 + rnd() * 1.6 });
    instanced(new THREE.BoxGeometry(3, 1.4, 10).translate(0, 0.7, 0), new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.5 }), yachts, false);
    instanced(new THREE.CylinderGeometry(0.06, 0.06, 12, 4).translate(0, 7, 0), new THREE.MeshStandardMaterial({ color: 0xdddddd }), yachts, false);
  },
  touge(scatter) {
    // dense pines, warm lamps on the rail every hundred metres, a moon
    pinesAt(scatter(6000, 14, 260, 300, (h, slope) => slope < 0.75).concat(scatter(4000, 260, 1100, 700, (h, slope) => slope < 0.75)), false);
    const lamps = []; for (let i = 0; i < N; i += 24) { if (JUMP[i] || CAVE[i]) continue; const f = frameAt(i), side = (i / 24) % 2 ? 1 : -1, p = f.p.clone().addScaledVector(f.b, side * (D_WALL + 0.6)); lamps.push({ x: p.x, y: p.y, z: p.z, quat: f.quat }); }
    instanced(new THREE.CylinderGeometry(0.06, 0.08, 4.2, 5).translate(0, 2.1, 0), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.5 }), lamps, false);
    instanced(new THREE.SphereGeometry(0.28, 8, 6).translate(0, 4.2, 0), new THREE.MeshBasicMaterial({ color: 0xffb060, toneMapped: false }), lamps, false);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(90, 16, 12), new THREE.MeshBasicMaterial({ color: 0xdfe8ff, fog: false, toneMapped: false })); moon.position.copy(sunDir).multiplyScalar(7200); scene.add(moon);
  },
  salt(scatter) {
    // course markers every 400 m, timing towers, the mountains round the edge are the terrain's rim
    const posts = []; for (let i = 0; i < N; i += 95) { if (JUMP[i]) continue; const f = frameAt(i); for (const sd of [1, -1]) { const p = f.p.clone().addScaledVector(f.b, sd * (D_WALL + 3)); posts.push({ x: p.x, y: p.y, z: p.z, rot: 0, s: 1 }); } }
    instanced(new THREE.CylinderGeometry(0.12, 0.12, 5, 6).translate(0, 2.5, 0), new THREE.MeshStandardMaterial({ color: 0xff3b3b, roughness: 0.6 }), posts, false);
    instanced(new THREE.BoxGeometry(1.4, 0.9, 0.1).translate(0, 5.4, 0), new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.6 }), posts, false);
    const towers = [[1200, 60], [2800, -1200], [-1800, -2250], [-2100, -300]].filter(([x, z]) => trackDist(x, z) > 30).map(([x, z]) => ({ x, y: 0, z, rot: 0, s: 1 }));
    instanced(mergeGeos([new THREE.BoxGeometry(6, 22, 6).translate(0, 11, 0), new THREE.BoxGeometry(14, 5, 10).translate(0, 25, 0)]), new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.6 }), towers, true);
    const rocks = scatter(900, 900, 4200, 2600, h => h > 40); rocks.forEach(it => { it.s = 6 + rnd() * rnd() * 40; it.sy = it.s * 0.6; it.rot = rnd() * 6.28; it.c = 0x8a7a66; });
    instancedColored(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), rocks, false);
  },
  mars(scatter) {
    const rocks = scatter(1800, 12, 1400, 700, () => true); rocks.forEach(it => { it.s = 0.8 + rnd() * rnd() * 14; it.sy = it.s * (0.5 + rnd() * 0.5); it.rot = rnd() * 6.28; const t = rnd(); it.c = t < 0.5 ? 0x7a3a22 : t < 0.8 ? 0x9a5030 : 0x4a2a1a; });
    instancedColored(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), rocks, true);
    // habitat domes with airlock rings, a few rovers, red dust drifting past
    for (const [x, z] of [[1500, -600], [-800, -300], [400, -1700]]) { if (trackDist(x, z) < 70) continue; const y = terrainH(x, z);
      const m = new THREE.Mesh(new THREE.SphereGeometry(38, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false })); m.position.set(x, y, z); scene.add(m);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(38, 1.6, 8, 40), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.7, roughness: 0.4 })); ring.rotation.x = Math.PI / 2; ring.position.set(x, y + 0.8, z); scene.add(ring);
      const hab = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 6, 16), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.6 })); hab.position.set(x, y + 3, z); scene.add(hab); }
    const rovers = scatter(8, 20, 120, 100, (h, slope) => slope < 0.4); rovers.forEach(it => { it.rot = rnd() * 6.28; it.s = 1; });
    instanced(mergeGeos([new THREE.BoxGeometry(3, 1, 2.2).translate(0, 1.2, 0), new THREE.BoxGeometry(2.2, 0.15, 2.6).translate(0, 2.0, 0)]), new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.6, metalness: 0.4 }), rovers, true);
    driftPoints(1800, 0xe0a070, 0.5, 0.5, false);
  },
  jungle(scatter) {
    waterPlane(TH.water, TH.waterCol, 0.85);
    // canopy trees, ferns, three waterfalls off the cliffs, the temple beside the road
    const trees = scatter(5200, 14, 300, 300, (h, slope) => h > 9 && slope < 0.8).concat(scatter(3800, 300, 1100, 700, (h, slope) => h > 9 && slope < 0.8));
    trees.forEach(it => { it.s = 0.9 + rnd() * 1.1; it.rot = rnd() * 6.28; it.c = rnd() < 0.5 ? 0x1f6a2a : 0x2f8a3a; });
    instanced(new THREE.CylinderGeometry(0.4, 0.7, 9, 6).translate(0, 4.5, 0), new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 0.95 }), trees, true);
    instancedColored(new THREE.IcosahedronGeometry(4.2, 1).translate(0, 11, 0), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), trees, true);
    const ferns = scatter(2600, 8, 120, 100, (h, slope) => h > 9 && slope < 0.5); ferns.forEach(it => { it.s = 0.8 + rnd() * 1.2; it.rot = rnd() * 6.28; });
    instanced(new THREE.ConeGeometry(1.6, 1.4, 6, 1, true).rotateX(Math.PI).translate(0, 1.2, 0), new THREE.MeshStandardMaterial({ color: 0x3aa04a, roughness: 0.9, side: THREE.DoubleSide, flatShading: true }), ferns, false);
    const fallTex = canvasTex(128, (ctx, sz) => { ctx.clearRect(0, 0, sz, sz); for (let x = 0; x < sz; x += 3) { ctx.fillStyle = 'rgba(255,255,255,' + (0.25 + 0.6 * rnd()) + ')'; ctx.fillRect(x, 0, 2, sz); } }, 1);
    for (const [x, z] of [[-1050, -900], [1150, -1200], [200, -2150]]) { const top = Math.max(terrainH(x, z), TH.water + 20), h = top - TH.water, m = new THREE.Mesh(new THREE.PlaneGeometry(14, h), new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, fog: true })); m.position.set(x, TH.water + h / 2, z); m.rotation.y = Math.atan2(S[0].x - x, S[0].z - z); scene.add(m); }
    window.__worldAnimate = now => { fallTex.offset.y = -now * 0.0006; };
    const tx = -300, tz = -1000, ty = terrainH(tx, tz), stone = new THREE.MeshStandardMaterial({ color: 0x8a8a76, roughness: 0.95 });
    for (let k = 0; k < 6; k++) { const w = 60 - k * 9, m = new THREE.Mesh(new THREE.BoxGeometry(w, 5, w), stone); m.position.set(tx, ty + 2.5 + k * 5, tz); m.castShadow = true; scene.add(m); }
  },
};
{
  const bb = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 }; for (const q of S) { bb.x0 = Math.min(bb.x0, q.x); bb.x1 = Math.max(bb.x1, q.x); bb.z0 = Math.min(bb.z0, q.z); bb.z1 = Math.max(bb.z1, q.z); }
  const scatter = (count, dMin, dMax, pad, accept) => {
    const out = []; let tries = 0;
    while (out.length < count && tries++ < count * 12) {
      const x = bb.x0 - pad + rnd() * (bb.x1 - bb.x0 + 2 * pad), z = bb.z0 - pad + rnd() * (bb.z1 - bb.z0 + 2 * pad), f = nearField(x, z);
      if (f.d < dMin || f.d > dMax) continue;
      const h = terrainH(x, z), slope = Math.abs(terrainH(x + 6, z) - terrainH(x - 6, z)) / 12;
      if (accept && !accept(h, slope, f)) continue;
      out.push({ x, y: h, z, f, h, slope });
    }
    return out;
  };
  if (THEME === 'matrix') {
    // rain panels standing along both sides
    const pos = [];
    for (let i = 8; i < N; i += 9) { if (UNDER[i] || SPECIAL(i)) continue; const side = (i / 9) % 2 ? 1 : -1, f = frameAt(i), off = D_WALL + 5 + rnd() * 6, w = 14 + rnd() * 10, h = 8 + rnd() * 9;
      const c = f.p.clone().addScaledVector(f.b, side * off), a = c.clone().addScaledVector(f.t, -w / 2), b = c.clone().addScaledVector(f.t, w / 2), a2 = a.clone().addScaledVector(WORLD_UP, h), b2 = b.clone().addScaledVector(WORLD_UP, h);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, b2.x, b2.y, b2.z, a.x, a.y, a.z, b2.x, b2.y, b2.z, a2.x, a2.y, a2.z); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); scene.add(new THREE.Mesh(g, rainMat));
  }
  if (THEME === 'woods' || THEME === 'snow') {
    // pines: a cone on a trunk, thousands of them, none on the road, thinning out above the tree line
    const snowy = THEME === 'snow', treeLine = TERRAIN.base + (snowy ? 210 : 260);
    const items = scatter(snowy ? 3200 : 6500, 15, 230, 300, (h, slope) => slope < 0.75 && h < treeLine + rnd() * 40).concat(scatter(snowy ? 2600 : 4500, 230, 900, 700, (h, slope) => slope < 0.75 && h < treeLine + rnd() * 40));
    items.forEach(it => { it.s = 0.7 + rnd() * 0.8; it.rot = rnd() * 6.28; });
    const canopy = new THREE.ConeGeometry(3.2, 11, 7).translate(0, 9.5, 0), trunk = new THREE.CylinderGeometry(0.35, 0.5, 5, 6).translate(0, 2.5, 0);
    instanced(canopy, new THREE.MeshStandardMaterial({ color: snowy ? 0x4a6a58 : 0x1d4a22, roughness: 0.95, flatShading: true, envMapIntensity: 0.2 }), items, true);
    if (snowy) instanced(new THREE.ConeGeometry(2.4, 6, 7).translate(0, 12.6, 0), new THREE.MeshStandardMaterial({ color: 0xf2f6fa, roughness: 1, flatShading: true }), items, false);   // snow caps
    instanced(trunk, new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.95 }), items, false);
    if (!snowy) { const dark = items.filter((_, k) => k % 3 === 0).map(it => ({ ...it, s: it.s * 1.25 })); instanced(new THREE.ConeGeometry(2.6, 7, 6).translate(0, 14.5, 0), new THREE.MeshStandardMaterial({ color: 0x143618, roughness: 0.95, flatShading: true }), dark, false); }
    if (snowy) {
      // ski lift: pylons on a straight line over the mountain, a cable between them
      const pyl = [], from = new THREE.Vector3(-1700, 0, -2500), to = new THREE.Vector3(1500, 0, 900), n = 28, cable = [];
      for (let k = 0; k <= n; k++) { const p = from.clone().lerp(to, k / n); p.y = terrainH(p.x, p.z); pyl.push({ x: p.x, y: p.y, z: p.z, rot: Math.atan2(to.x - from.x, to.z - from.z) }); cable.push(p.x, p.y + 17.5, p.z); }
      instanced(new THREE.BoxGeometry(1.4, 18, 1.4).translate(0, 9, 0), new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.7, metalness: 0.5 }), pyl, true);
      instanced(new THREE.BoxGeometry(6, 0.5, 0.8).translate(0, 17.6, 0), new THREE.MeshStandardMaterial({ color: 0x2a2e34, roughness: 0.7, metalness: 0.5 }), pyl, false);
      const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cable, 3)); scene.add(new THREE.Line(cg, new THREE.LineBasicMaterial({ color: 0x222 })));
      const chairs = []; for (let k = 0; k < 60; k++) { const p = from.clone().lerp(to, (k + 0.5) / 60); p.y = terrainH(p.x, p.z) + 15.6; chairs.push({ x: p.x, y: p.y, z: p.z, rot: pyl[0].rot }); }
      instanced(new THREE.BoxGeometry(1.4, 1.2, 0.8), new THREE.MeshStandardMaterial({ color: 0xd42a2a, roughness: 0.6 }), chairs, false);
      // snowfall around the camera
      const n2 = 2600, arr = new Float32Array(n2 * 3); for (let k = 0; k < n2; k++) { arr[k * 3] = (rnd() - 0.5) * 160; arr[k * 3 + 1] = (rnd() - 0.5) * 120; arr[k * 3 + 2] = (rnd() - 0.5) * 160; }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      snowfall.pts = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.42, sizeAttenuation: true, transparent: true, opacity: 0.85, depthWrite: false, fog: true })); scene.add(snowfall.pts);
      // red and white poles by the jumps
      const poles = []; for (const J of JUMPS) for (const i of [J.i0 - 30, J.i0 - 15, J.i1 + 8, J.i1 + 20]) for (const sd of [1, -1]) { const f = frameAt((i + N) % N), q = f.p.clone().addScaledVector(f.b, sd * (ROAD_HALF + 1.6)); poles.push({ x: q.x, y: q.y, z: q.z }); }
      instanced(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6).translate(0, 1.2, 0), new THREE.MeshStandardMaterial({ color: 0xff3b3b, roughness: 0.5 }), poles, false);
    }
  }
  if (THEME === 'sky') {
    // cumulus puffs around the rail (flattened spheres, soft white), and the monorail beam with holders under the road
    const puffs = []; for (let k = 0; k < 2600; k++) { const i = Math.floor(rnd() * N), f = frameAt(i), side = rnd() < 0.5 ? -1 : 1; const s0 = 14 + rnd() * rnd() * 70, off = 26 + s0 * 1.15 + rnd() * rnd() * 700, p = f.p.clone().addScaledVector(f.b, side * off).addScaledVector(f.t, (rnd() - 0.5) * 80); p.y += (rnd() - 0.55) * 160; let clear = true; for (let q = 0; q < N; q += 3) { if (S[q].distanceToSquared(p) < (s0 * 1.2 + 12) * (s0 * 1.2 + 12)) { clear = false; break; } } if (clear) puffs.push({ x: p.x, y: p.y, z: p.z, s: s0, rot: rnd() * 6.28 }); }   // clear of every road layer (the staircase stacks them)
    puffs.forEach(it => { it.sy = it.s * (0.45 + rnd() * 0.3); });
    instanced(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf0f6ff, emissiveIntensity: 0.25, roughness: 1, transparent: true, opacity: 0.9, depthWrite: false }), puffs, false);
    const holders = []; for (let i = 0; i < N; i += 9) { if (JUMP[i]) continue; const f = frameAt(i); holders.push({ x: f.p.x, y: f.p.y, z: f.p.z, quat: f.quat }); }
    instanced(new THREE.BoxGeometry(0.8, 1.6, 2 * ROAD_HALF + 4).translate(0, -1.2, 0), new THREE.MeshStandardMaterial({ color: 0x1a2230, metalness: 0.7, roughness: 0.4 }), holders, false);
    instanced(new THREE.BoxGeometry(0.8, 0.12, 2 * ROAD_HALF + 4.2).translate(0, -2.0, 0), neonMat, holders, false);
  }
  if (THEME === 'ocean') {
    // legs under the tube, rocks, coral, seaweed, a shoal of fish on lazy circles, bubbles round the car, the surface far above
    const legs = []; for (let i = 6; i < N; i += 9) { if (JUMP[i]) continue; const f = frameAt(i), floor = terrainH(f.p.x, f.p.z), h = f.p.y - 7.0 - floor; if (h < 1) continue; legs.push({ x: f.p.x, y: floor, z: f.p.z, s: 1, sy: h }); }
    instanced(new THREE.CylinderGeometry(0.5, 0.7, 1, 8).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x24404e, roughness: 0.6, metalness: 0.5 }), legs, false);
    const rocks = scatter(900, 12, 900, 500, (h, slope) => true); rocks.forEach(it => { it.s = 2 + rnd() * rnd() * 16; it.sy = it.s * (0.5 + rnd() * 0.5); it.rot = rnd() * 6.28; it.c = rnd() < 0.5 ? 0x14303c : 0x1e4250; });
    instancedColored(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), rocks, false);
    const coral = scatter(1400, 10, 260, 200, (h, slope) => slope < 0.6); coral.forEach(it => { it.s = 0.8 + rnd() * 2.2; it.rot = rnd() * 6.28; const t = rnd(); it.c = t < 0.3 ? 0xff5a8a : t < 0.55 ? 0xff9a3a : t < 0.8 ? 0xb45aff : 0x3affc8; });
    instancedColored(new THREE.IcosahedronGeometry(1, 1).translate(0, 0.8, 0), new THREE.MeshStandardMaterial({ roughness: 0.8, emissive: 0x111111, flatShading: true }), coral, false);
    const weed = scatter(2600, 9, 220, 200, (h, slope) => slope < 0.5); weed.forEach(it => { it.s = 0.6 + rnd() * 0.8; it.sy = 4 + rnd() * 9; it.rot = rnd() * 6.28; });
    instanced(new THREE.ConeGeometry(0.35, 1, 5).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x1f7a4a, roughness: 0.9, side: THREE.DoubleSide }), weed, false);
    // fish: instanced, each on its own circle near the tube
    const nFish = 260, fishGeo = new THREE.ConeGeometry(0.28, 1.1, 5).rotateX(Math.PI / 2), fishMat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.4, flatShading: true });
    const fish = new THREE.InstancedMesh(fishGeo, fishMat, nFish); const fc = new THREE.Color(); const school = [];
    for (let k = 0; k < nFish; k++) { const i = Math.floor(rnd() * N), f = frameAt(i), side = rnd() < 0.5 ? -1 : 1, c = f.p.clone().addScaledVector(f.b, side * (14 + rnd() * 30)).addScaledVector(WORLD_UP, (rnd() - 0.3) * 20); school.push({ c, r: 4 + rnd() * 18, w: (0.25 + rnd() * 0.5) * (rnd() < 0.5 ? -1 : 1), ph: rnd() * 6.28, sc: 0.7 + rnd() * 1.6 }); fc.setHSL(rnd() < 0.6 ? 0.55 + rnd() * 0.12 : rnd() * 0.15, 0.8, 0.55); fish.setColorAt(k, fc); }
    fish.instanceColor.needsUpdate = true; scene.add(fish);
    const fm = new THREE.Matrix4(), fq = new THREE.Quaternion(), fp = new THREE.Vector3(), fs = new THREE.Vector3(), fl = new THREE.Vector3();
    window.__fishAnimate = now => { const t = now / 1000; for (let k = 0; k < nFish; k++) { const F = school[k], a = F.ph + t * F.w; fp.set(F.c.x + Math.cos(a) * F.r, F.c.y + Math.sin(t * 0.7 + F.ph) * 1.5, F.c.z + Math.sin(a) * F.r); fl.set(-Math.sin(a) * F.w, 0, Math.cos(a) * F.w).normalize(); fq.setFromUnitVectors(new THREE.Vector3(0, 0, 1), fl); fs.setScalar(F.sc); fm.compose(fp, fq, fs); fish.setMatrixAt(k, fm); } fish.instanceMatrix.needsUpdate = true; };
    // bubbles rising round the car
    const n2 = 1400, arr = new Float32Array(n2 * 3); for (let k = 0; k < n2; k++) { arr[k * 3] = (rnd() - 0.5) * 120; arr[k * 3 + 1] = (rnd() - 0.5) * 80; arr[k * 3 + 2] = (rnd() - 0.5) * 120; }
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    snowfall.pts = new THREE.Points(bg, new THREE.PointsMaterial({ color: 0xbfefff, size: 0.28, sizeAttenuation: true, transparent: true, opacity: 0.7, depthWrite: false, fog: true })); snowfall.up = true; scene.add(snowfall.pts);
    // the surface, seen from below
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000, 1, 1), new THREE.MeshBasicMaterial({ color: 0x6fd0ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, fog: true })); surf.rotation.x = Math.PI / 2; surf.position.set(0, 230, -600); scene.add(surf);
  }
  if (THEME === 'desert') {
    // boulders and mesas of sandstone, more of them near the cliffs
    const items = scatter(1500, 22, 1400, 700, (h, slope) => slope < 0.9);
    items.forEach(it => { it.s = 2 + rnd() * rnd() * 26; it.sy = it.s * (0.45 + rnd() * 0.5); it.rot = rnd() * 6.28; const t = rnd(); it.c = t < 0.4 ? 0x9a5630 : t < 0.8 ? 0xb87848 : 0x6e3a24; });
    instancedColored(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), items, true);
    const shrubs = scatter(1600, 12, 500, 300, (h, slope) => slope < 0.5); shrubs.forEach(it => { it.s = 0.8 + rnd() * 1.4; it.c = rnd() < 0.5 ? 0x5a6a2a : 0x7a7a3a; });
    instancedColored(new THREE.IcosahedronGeometry(1, 0).translate(0, 0.8, 0), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), shrubs, false);
  }
  if (THEME === 'sonic') {
    // palms: a leaning trunk and a spray of leaves; a few sunflowers by the road
    const items = scatter(1100, 14, 420, 300, (h, slope) => slope < 0.6); items.forEach(it => { it.s = 0.8 + rnd() * 0.7; it.rot = rnd() * 6.28; });
    instanced(new THREE.CylinderGeometry(0.28, 0.5, 9, 6).translate(0, 4.5, 0).rotateZ(0.12), new THREE.MeshStandardMaterial({ color: 0x7a5a30, roughness: 0.9 }), items, true);
    const leaf = new THREE.ConeGeometry(4.2, 2.2, 6, 1, true).translate(0, 9.2, 0);
    instanced(leaf, new THREE.MeshStandardMaterial({ color: 0x2fa83a, roughness: 0.9, side: THREE.DoubleSide, flatShading: true }), items, false);
    instanced(new THREE.SphereGeometry(0.5, 6, 5).translate(0, 8.4, 0), new THREE.MeshStandardMaterial({ color: 0x5a3a18, roughness: 0.9 }), items, false);
    const flowers = scatter(500, 9, 60, 100, (h, slope) => slope < 0.4); flowers.forEach(it => { it.s = 1; it.rot = rnd() * 6.28; });
    instanced(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 4).translate(0, 1.1, 0), new THREE.MeshStandardMaterial({ color: 0x2a8a2a }), flowers, false);
    instanced(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 10).rotateX(Math.PI / 2).translate(0, 2.2, 0), new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0x3a2a00 }), flowers, false);
  }
  if (DRESS[THEME]) DRESS[THEME](OUTDOOR ? scatter : null);
}
{ // start gantry: two wide towers and a big LED banner. CORE FOCUS PRODUCTIONS, the sim's name and GOOD LUCK, then the COREZ clip
  const dark = new THREE.MeshStandardMaterial({ color: 0x0a1220, roughness: 0.5, metalness: 0.6 });
  const gantry = new THREE.Group();
  const post = new THREE.BoxGeometry(1.6, 11, 1.6).translate(0, 5.5, 0);
  for (const sg of [-1, 1]) { const p = new THREE.Mesh(post, dark); p.position.set(0, 0, sg * 12.4); p.castShadow = true; gantry.add(p); const strip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 10.6, 0.25), neonMat); strip.position.set(-0.85, 5.5, sg * 12.4); gantry.add(strip); }
  const BW = 24, BH = 6.2, BY = 9.4;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.8, BH + 0.8, BW + 1.0), dark); back.position.set(0.3, BY, 0); back.castShadow = true; gantry.add(back);
  for (const sy of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, BW + 1.0), neonMat); e.position.set(-0.16, BY + sy * (BH / 2 + 0.36), 0); gantry.add(e); }
  const bcv = document.createElement('canvas'); bcv.width = 2048; bcv.height = 528; const bctx = bcv.getContext('2d');
  const btex = new THREE.CanvasTexture(bcv); btex.encoding = THREE.sRGBEncoding; btex.anisotropy = maxAniso;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), new THREE.MeshBasicMaterial({ map: btex, toneMapped: false }));
  screen.position.set(-0.12, BY, 0); screen.rotation.y = -Math.PI / 2; gantry.add(screen);   // faces the cars coming up to the line
  // LED dot mask, drawn once
  const mask = document.createElement('canvas'); mask.width = 2048; mask.height = 528; { const mc = mask.getContext('2d'); mc.fillStyle = '#000'; mc.fillRect(0, 0, 2048, 528); mc.globalCompositeOperation = 'destination-out'; for (let y = 4; y < 528; y += 8) for (let x = 4; x < 2048; x += 8) { mc.beginPath(); mc.arc(x, y, 3.1, 0, Math.PI * 2); mc.fill(); } }
  const lineTex = canvasTex(64, (ctx, sz) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { ctx.fillStyle = (x + y) % 2 ? '#06101c' : '#8ff4ff'; ctx.fillRect(x * 16, y * 16, 16, 16); } });
  lineTex.repeat.set(1, 12);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 12), new THREE.MeshStandardMaterial({ map: lineTex, emissiveMap: lineTex, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.9 }));
  line.rotation.x = -Math.PI / 2; line.rotation.z = Math.PI / 2; line.position.y = 0.03; gantry.add(line);
  gantry.position.copy(S[0]); gantry.quaternion.copy(frameAt(0).quat); scene.add(gantry);
  // 0–8 s the words, then the intro clip (played from its start), then the main COREZ clip
  const vA = document.getElementById('revuelto-poster-video'), vB = document.getElementById('revuelto-poster-video2') || vA;
  const ready = v => v && v.readyState >= 2 && v.videoWidth;
  const durA = () => ready(vA) && vA !== vB ? Math.min(14, vA.duration || 12) : 0, durB = () => ready(vB) ? Math.min(12, vB.duration || 10) : 0;
  let bannerTick = 0, phasePrev = -1;
  window.__bannerAnimate = now => {
    const dA = durA(), dB = durB(), PERIOD = 8 + dA + dB, t = now / 1000, ph = t % PERIOD;
    const phase = ph < 8 ? 0 : ph < 8 + dA ? 1 : 2, vid = phase === 1 ? vA : phase === 2 ? vB : null;
    if (phase !== phasePrev) { phasePrev = phase; if (phase === 1 && vA) { try { vA.currentTime = 0; vA.play().catch(() => {}); } catch (e) {} } }
    const clip = vid && ready(vid);
    if (!clip && now - bannerTick < 66) return; bannerTick = now;
    const W = bcv.width, H = bcv.height, c = bctx;
    c.globalCompositeOperation = 'source-over'; c.fillStyle = '#02050c'; c.fillRect(0, 0, W, H);
    if (clip) {
      const p0 = phase === 1 ? 8 : 8 + dA, p1 = phase === 1 ? 8 + dA : PERIOD;
      const fade = Math.min(1, (ph - p0) / 0.6, (p1 - ph) / 0.6);
      const r = Math.min(W / vid.videoWidth, H / vid.videoHeight), iw = vid.videoWidth * r, ih = vid.videoHeight * r;
      c.globalAlpha = fade; c.drawImage(vid, (W - iw) / 2, (H - ih) / 2, iw, ih); c.globalAlpha = 1;
    } else {
      const fadeIn = smoothstep(0, 1.2, ph), fade2 = smoothstep(2.2, 3.4, ph), out = 1 - smoothstep(7.2, 8, ph);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      // sweeping shimmer across the top line
      const sx = ((ph * 0.28) % 1.3 - 0.15) * W;
      c.globalAlpha = fadeIn * out; c.shadowColor = '#2ee6ff'; c.shadowBlur = 36;
      c.fillStyle = '#eafcff'; c.font = '900 168px Orbitron, Bahnschrift, "Arial Black", sans-serif';
      c.fillText('CORE FOCUS PRODUCTIONS', W / 2, H * 0.34);
      const gr = c.createLinearGradient(sx - 260, 0, sx + 260, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      c.globalCompositeOperation = 'source-atop'; c.fillStyle = gr; c.fillRect(sx - 260, 0, 520, H * 0.6); c.globalCompositeOperation = 'source-over';
      c.globalAlpha = fade2 * out; c.shadowColor = '#ff7a00'; c.shadowBlur = 24; c.fillStyle = '#ffb060';
      c.font = '700 118px "Barlow Condensed", Orbitron, "Arial Narrow", sans-serif';
      const blink = Math.floor(ph * 2) % 2 === 0 || ph < 5.5;
      c.fillText('LAMBORGHINI REVUELTO SIM' + (blink ? '  ·  GOOD LUCK' : ''), W / 2, H * 0.76);
      c.shadowBlur = 0; c.globalAlpha = 1;
    }
    c.drawImage(mask, 0, 0);   // the LED matrix
    btex.needsUpdate = true;
  };
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
  const posterImg = document.getElementById('revuelto-poster2') || document.getElementById('revuelto-poster'), posterVid = document.getElementById('revuelto-poster-video2') || document.getElementById('revuelto-poster-video');
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
  uniforms: { uTime: { value: 0 }, uCarInv: { value: new THREE.Matrix4() }, uClip: { value: new THREE.Vector4(0, -1, 0, 1e9) } },
  vertexShader: `uniform mat4 uCarInv; varying vec3 vL; varying vec3 vN; varying vec3 vV; varying float vWy; varying vec3 vWp;
    void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vL = (uCarInv * wp).xyz; vWy = wp.y; vWp = wp.xyz; vN = normalize(normalMatrix * normal); vec4 mv = viewMatrix * wp; vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform float uTime; uniform vec4 uClip; varying vec3 vL; varying vec3 vN; varying vec3 vV; varying float vWy; varying vec3 vWp;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
    float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int k = 0; k < 5; k++) { s += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
    void main(){ if (dot(uClip.xyz, vWp) + uClip.w < 0.0) discard;
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
let wingRoot = null, wingNode = null; sceneReady = true;
car.add(glowDisc);
// the SUPERSONIC fin: a swept blade on the rear deck that rises when twenty rings are held
const superFin = (() => { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(1.0, 0); sh.lineTo(0.62, 0.62); sh.lineTo(0.12, 0.7); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: false }); g.translate(-1.0, 0, -0.03);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x1a2a4a, emissive: 0x2ee6ff, emissiveIntensity: 1.4, metalness: 0.6, roughness: 0.3 })); m.position.set(-1.05, 1.02, 0); m.scale.y = 0.001; m.visible = false; car.add(m); return m; })();
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
  $('paint-name').textContent = P.name; if (typeof roofClip !== 'undefined') setTimeout(applyRoofClip, 0); try { localStorage.setItem('revuelto.paint', String(paintIdx)); } catch (e) {}
  document.querySelectorAll('#paints button, #g-quickpaint button').forEach(b => b.classList.toggle('on', +b.dataset.p === paintIdx));
  (customModel || procBody).traverse(o => {
    if (!(o.isMesh && o.userData.paint)) return;
    if (P.shader) { o.material = tronMat; return; }                          // living hologram paint
    if (P.original) { o.material = o.userData.origMat; return; }             // the author's own paint, untouched
    if (P.livery) { if (!o.userData.livMat) o.userData.livMat = liveryMaterial(o.userData.origMat); o.material = o.userData.livMat; return; }
    if (!o.userData.tintMat) { o.userData.tintMat = o.userData.origMat.clone(); o.userData.tintMat.map = null; o.userData.tintMat.envMap = cubeRT.texture; o.userData.tintMat.metalness = 0.25; o.userData.tintMat.roughness = 0.34; o.userData.tintMat.envMapIntensity = 0.8; }
    o.material = o.userData.tintMat; o.material.color.setHex(P.hex);
  });
}
// ------------------------------------------------------------------ the 3D garage: two rooms
// STUDIO: Velocity Motion's "Studio V1 For Car" (Sketchfab, CC BY 4.0), a long lit corridor, slate floor, light bars; the
// camera orbits the car. SHOWROOM: ChristyHsu's "Scifi Tron Studio | Baked" (Sketchfab, CC BY 4.0), a blue stage with a
// raised platform: the car turns on it like a turntable in front of a slow camera. Both are baked into the page (textures
// cut to 1K JPEG: 278 KB and 387 KB), fetched on the hosted site the first time a room opens. The car is moved into the
// room's scene, the world pauses, and the reflection cube is re-shot in the room so the paint mirrors it.
// Drag to turn, wheel or pinch to zoom, in either room.
const ROOMS = {
  // minDist/maxDist keep the orbit inside each room's own walls (STUDIO's corridor is narrow, a wide zoom-out used to
  // punch through it); minYaw/maxYaw (SHOWROOM only) keep the camera off the side where the tall screen wall blocks
  // the view; carScale shows the car at the size it reads best in that room, without touching its real driving scale
  studio:   { id: 'studio-glb', file: 'studio.glb', scale: 2, at: [-0.98, 0, 5.2], baked: false, spin: 0.10, turn: 0, yaw: 2.4, pitch: 0.16, dist: 4.6, minDist: 3.0, maxDist: 5.6, lights: true, carScale: 0.5 },
  showroom: { id: 'showroom-glb', file: 'showroom.glb', scale: 1, at: [0, 1.33, -1.0], baked: true, spin: 0.025, turn: 0.30, yaw: 0.55, pitch: 0.14, dist: 11, minDist: 6, maxDist: 16, minYaw: -1.2, maxYaw: 2.3, lights: true, carYaw: Math.PI / 2, carScale: 0.8 },
};
const garage = { room: 'studio', scenes: {}, cam: new THREE.PerspectiveCamera(36, 1, 0.1, 400), on: false, yaw: 2.4, pitch: 0.16, dist: 6.4, drag: null, at: new THREE.Vector3(), carY: 0, carYaw: 0, turn: 0 };
try { const r = localStorage.getItem('revuelto.room'); if (r && ROOMS[r]) garage.room = r; } catch (e) {}
function roomScene(name) {
  if (garage.scenes[name]) return garage.scenes[name];
  const R = ROOMS[name], s = new THREE.Scene(); s.background = new THREE.Color(0x000000); s.userData = { loaded: false, loading: false, group: null };
  s.add(new THREE.HemisphereLight(0xffffff, 0x141418, R.baked ? 0.7 : 0.55)); const d = new THREE.DirectionalLight(0xffffff, R.baked ? 0.9 : 0.8); d.position.set(3, 9, 6); s.add(d);
  if (!R.baked) for (const [x, z] of [[-2.5, -4], [2.5, -4], [-2.5, 6], [2.5, 6], [0, 11]]) { const pl = new THREE.PointLight(0xffffff, 0.55, 40, 1.6); pl.position.set(R.at[0] + x, 5.4, R.at[2] + z); s.add(pl); }
  garage.scenes[name] = s; return s;
}
function roomLoad(name, cb) {
  const R = ROOMS[name], s = roomScene(name), u = s.userData;
  if (u.loaded) { if (cb) cb(); return; } if (u.loading) return; u.loading = true;
  const done = buf => { try { new THREE.GLTFLoader().parse(buf, '', g => { const grp = g.scene; grp.scale.setScalar(R.scale);
    grp.traverse(o => { if (!o.isMesh) return; o.material.side = THREE.DoubleSide;
      if (R.baked) { o.material.color.setHex(0x000000); if (o.material.emissiveMap) { o.material.emissive.setHex(0xffffff); o.material.emissiveIntensity = 1.25; } }   // the light is in the textures: lights only hit the car
      else if (o.material.name === 'lights') { o.material.emissive.setHex(0xffffff); o.material.emissiveIntensity = 3; o.material.color.setHex(0xffffff); }
      if (o.name === 'Object_12') o.visible = false; });
    u.group = grp; s.add(grp); u.loaded = true; u.loading = false; if (cb) cb(); }, e => { console.error(e); u.loading = false; }); } catch (e) { console.error(e); u.loading = false; } };
  const emb = document.getElementById(R.id);
  if (emb) { const bin = atob(emb.textContent.trim()), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); done(u8.buffer); }
  else if (location.protocol !== 'file:') fetch(R.file).then(r => r.ok ? r.arrayBuffer() : null).then(b => { if (b) done(b); else u.loading = false; }).catch(() => { u.loading = false; });
  else u.loading = false;
}
function garageRoom(name) {
  if (!ROOMS[name]) return; garage.room = name; try { localStorage.setItem('revuelto.room', name); } catch (e) {}
  document.querySelectorAll('#g-room button').forEach(b => b.classList.toggle('on', b.dataset.r === name));
  const wasPreview = previewCar; garagePreviewClear();
  if (garage.on) { garage.on = false; garageEnter(); if (wasPreview) garagePreview(wasPreview); }
}
function garageEnter() {
  if (garage.on) return; garage.on = true; const R = ROOMS[garage.room], s = roomScene(garage.room); s.add(car);   // add() moves it out of the world
  garage.at.fromArray(R.at); garage.yaw = R.yaw; garage.pitch = R.pitch; garage.dist = R.dist; garage.carYaw = R.carYaw || 0; garage.turn = 0;
  car.scale.setScalar(R.carScale || 1);
  garagePlaceCar();
  roomLoad(garage.room, () => garageReflect()); if (s.userData.loaded) garageReflect();
}
function garagePlaceCar() {
  car.position.set(0, 0, 0); car.quaternion.identity(); bodyGroup.rotation.set(0, 0, 0); car.updateMatrixWorld(true);
  const box = new THREE.Box3(); car.traverse(o => { if (!o.isMesh || o.isSprite || o.isLine) return; const b = new THREE.Box3().setFromObject(o), z = b.getSize(new THREE.Vector3()); if (z.length() < 8 && z.length() > 0.05) box.union(b); });
  garage.carY = garage.at.y + (box.isEmpty() ? 0 : -box.min.y + 0.01);
  car.position.set(garage.at.x, garage.carY, garage.at.z); car.updateMatrixWorld(true);
}
function garageReflect() { if (!garage.on) return; car.visible = false; cubeCam.position.set(garage.at.x, garage.carY + 0.7, garage.at.z); cubeCam.update(renderer, roomScene(garage.room)); car.visible = true; }
function garageLeave() { if (!garage.on) return; garagePreviewClear(); garage.on = false; scene.add(car); car.visible = true; car.scale.setScalar(1); }
// ------------------------------------------------------------------ THE SHOP: look without buying
// clicking a shop car's card drops a plain, unscaled-physics copy of it into the same spot the real car sits in the
// garage, and hides the real car underneath; it never touches carId, career.car or career.cars, so nothing is bought
// or driven by looking. Downloaded once per session (previewRoots), same fetch path as carSelect.
let previewGroup = null, previewCar = null; const previewRoots = {};
function garagePreviewClear() {
  if (previewGroup) { const scn = roomScene(garage.room); scn.remove(previewGroup); previewGroup = null; }
  previewCar = null; if (garage.on) car.visible = true;
}
function garagePreviewShow(id, root) {
  const scn = roomScene(garage.room); if (previewGroup) scn.remove(previewGroup);
  const g = root.clone(true); const C = CARS[id];
  const box = new THREE.Box3().setFromObject(g), size = box.getSize(new THREE.Vector3()), long = Math.max(size.x, size.z);
  const sc = (C.spec.length || CAR.length) / long; g.scale.setScalar(sc);
  box.setFromObject(g); const c2 = box.getCenter(new THREE.Vector3());
  const yaw = (size.z >= size.x ? Math.PI / 2 : 0) + (C.yaw || 0);
  const wrap = new THREE.Group(); wrap.add(g); g.position.set(-c2.x, -box.min.y, -c2.z); wrap.rotation.y = yaw;
  wrap.position.set(garage.at.x, garage.carY, garage.at.z); wrap.scale.setScalar(ROOMS[garage.room].carScale || 1);
  scn.add(wrap); previewGroup = wrap; previewCar = id; car.visible = false;
  if (typeof garageRefresh === 'function') garageRefresh();   // the model just arrived asynchronously: the VIEWING tag and card state were stale until now
}
function garagePreview(id) {
  if (id === carId) { garagePreviewClear(); return; }
  if (previewCar === id) return;
  const C = CARS[id]; if (!C) return;
  if (carRoots[id]) { garagePreviewShow(id, carRoots[id]); return; }
  if (previewRoots[id]) { garagePreviewShow(id, previewRoots[id]); return; }
  if (!C.file || location.protocol === 'file:' || document.getElementById('revuelto-glb')) { flash('HOSTED SITE ONLY · LAMBO-SIM.WEB.APP', 2400); return; }
  flash('LOADING ' + C.name + ' …', 3000);
  fetch(C.file).then(r => r.ok ? r.arrayBuffer() : null).then(b => { if (!b) { flash('MODEL NOT FOUND', 2000); return; }
    try { window.createImageBitmap = undefined; } catch (e) {}
    new THREE.GLTFLoader().parse(b, '', g => { previewRoots[id] = g.scene; if (garage.on) garagePreviewShow(id, g.scene); }, e => { console.error(e); flash('MODEL FAILED', 2000); });
  }).catch(() => flash('MODEL FAILED', 2000));
}
function garageFrame(dt, now) {
  const R = ROOMS[garage.room], s = roomScene(garage.room);
  if (!garage.drag) { garage.yaw += dt * R.spin; if (R.minYaw != null) garage.yaw = Math.max(R.minYaw, Math.min(R.maxYaw, garage.yaw)); }
  garage.turn += dt * R.turn; car.position.set(garage.at.x, garage.carY, garage.at.z); car.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), garage.carYaw + garage.turn);   // the turntable
  const W = window.innerWidth, H = window.innerHeight, c = garage.cam; c.aspect = W / H;
  if (W > 820) c.setViewOffset(W, H, Math.round(W * 0.17), 0, W, H); else c.clearViewOffset(); c.updateProjectionMatrix();
  const cp = Math.cos(garage.pitch), r = garage.dist; c.position.set(garage.at.x + Math.sin(garage.yaw) * r * cp, garage.carY + 0.55 + Math.sin(garage.pitch) * r, garage.at.z + Math.cos(garage.yaw) * r * cp); c.lookAt(garage.at.x, garage.carY + 0.5, garage.at.z);
  const rp = bloomOn && composer && composer.passes && composer.passes.find(q => q.scene && q.camera);
  if (rp) { const s0 = rp.scene, c0 = rp.camera; rp.scene = s; rp.camera = c; composer.render(); rp.scene = s0; rp.camera = c0; } else renderer.render(s, c);
}
function garageSetView(name) {
  document.querySelectorAll('#g-room button').forEach(b => b.classList.toggle('on', b.dataset.r === name));
  $('g-shop').classList.toggle('hidden', name !== 'shop'); $('g-quickpaint').classList.toggle('hidden', name === 'shop');
  if (name !== 'shop') garageRoom(name); else garageRefresh();
}
document.querySelectorAll('#g-room button').forEach(b => { b.classList.toggle('on', b.dataset.r === garage.room); b.addEventListener('click', e => { e.stopPropagation(); garageSetView(b.dataset.r); }); });
{ // orbit with a finger or the mouse, zoom with the wheel or a pinch
  const cv = renderer.domElement, ptr = {};
  cv.addEventListener('pointerdown', e => { if (!garage.on) return; ptr[e.pointerId] = { x: e.clientX, y: e.clientY }; garage.drag = { x: e.clientX, y: e.clientY }; });
  window.addEventListener('pointermove', e => { if (!garage.on || !garage.drag) return; const R = ROOMS[garage.room]; const ids = Object.keys(ptr); if (ids.length >= 2 && ptr[e.pointerId]) { const o = ptr[ids[0]], q = ptr[ids[1]], d0 = Math.hypot(o.x - q.x, o.y - q.y); ptr[e.pointerId] = { x: e.clientX, y: e.clientY }; const d1 = Math.hypot(ptr[ids[0]].x - ptr[ids[1]].x, ptr[ids[0]].y - ptr[ids[1]].y); garage.dist = Math.max(R.minDist ?? 3.6, Math.min(R.maxDist ?? 9, garage.dist * (d0 / Math.max(1, d1)))); return; }
    garage.yaw -= (e.clientX - garage.drag.x) * 0.007; if (R.minYaw != null) garage.yaw = Math.max(R.minYaw, Math.min(R.maxYaw, garage.yaw)); garage.pitch = Math.max(0.03, Math.min(0.75, garage.pitch + (e.clientY - garage.drag.y) * 0.004)); garage.drag = { x: e.clientX, y: e.clientY }; if (ptr[e.pointerId]) ptr[e.pointerId] = garage.drag; });
  const up = e => { delete ptr[e.pointerId]; if (!Object.keys(ptr).length) garage.drag = null; };
  window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { if (!garage.on) return; e.preventDefault(); const R = ROOMS[garage.room]; garage.dist = Math.max(R.minDist ?? 3.6, Math.min(R.maxDist ?? 9, garage.dist * (1 + Math.sign(e.deltaY) * 0.08))); }, { passive: false });
}

function installModel(root, name) {
  const from = (name === 'embedded' || name === 'revuelto.glb') ? 'revuelto' : (CARS[name] ? name : null);
  if (from) carRoots[from] = root;
  if (from && from !== carId) return;   // a slow download landing after another car was chosen: keep it, do not fit it
  const cfg = CARS[from || carId] || {};
  if (customModel) bodyGroup.remove(customModel);
  if (cfg.hide) { const gone = []; root.traverse(o => { if (o !== root && cfg.hide.test(o.name || '')) gone.push(o); }); for (const o of gone) if (o.parent) o.parent.remove(o); }   // stage text, ground planes
  const wrap = new THREE.Group();
  root.traverse(o => {
    if (o.isMesh) {
      o.castShadow = o.receiveShadow = true;
      const n = ((o.material && o.material.name) || o.name || '').toLowerCase();
      if (o.material && /light|lamp|led|xenon|drl|brake_light|tail_light|headlight_light|turning_light_(right|left)$/.test(n) && !/glass|carbon|inside|holder/.test(n) && o.material.emissive) {
        o.material = o.material.clone(); if (o.material.emissive.getHex() === 0) o.material.emissive.setHex(/tail|brake/.test(n) ? 0xff2010 : 0xdff2ff); o.material.emissiveIntensity = Math.max(o.material.emissiveIntensity || 1, 5.0);
      }
      if (o.material && (cfg.paintMats ? cfg.paintMats.includes(o.material.name) : /paint|body|carrosserie|carroceria|exterior/.test(n) && !/glass|window|interior|light|black|nero|trim|carbon/.test(n))) {
        // the author's colour and finish, rebuilt as clearcoat paint with live reflections
        const src = o.material, pm = new THREE.MeshPhysicalMaterial({ color: src.color ? src.color.clone() : new THREE.Color(0xff2a03), map: cfg.nomap ? null : (src.map || null), metalness: Math.max(0.5, src.metalness || 0), roughness: Math.min(0.18, src.roughness == null ? 0.1 : src.roughness), clearcoat: 1, clearcoatRoughness: 0.04, envMap: cubeRT.texture, envMapIntensity: 1.3, name: src.name });
        o.material = pm; o.userData.paint = true; o.userData.origMat = pm;
      } else if (o.material && o.material.isMeshStandardMaterial) {
        o.material.envMap = cubeRT.texture; o.material.envMapIntensity = /window|glass/.test(n) ? 1.6 : 0.9;
        if (/rim|caliper|exhaust|metal|chrome|miroir|mirror/.test(n)) { o.material.metalness = 1.0; o.material.roughness = Math.min(0.3, o.material.roughness); }
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
  if (cfg.bones) {   // the download names its own pivots: a steer bone holding a rotation bone, per corner
    const spin = {}, steer = {};
    root.traverse(o => { let m = cfg.bones.spin.exec(o.name); if (m) spin[m[1].toLowerCase()] = o; m = cfg.bones.steer.exec(o.name); if (m) steer[m[1].toLowerCase()] = o; });
    for (const k in spin) { const s = steer[k] || spin[k]; s.rotation.order = 'YXZ'; customWheels.push({ node: spin[k], steer: s, front: k[0] === 'f', spin: cfg.spin || 1 }); }
  } else root.traverse(o => { const n = o.name.toLowerCase(); const m = n.match(/wheel[_\-\s]?(fl|fr|rl|rr)/); if (m) { o.rotation.order = 'YXZ'; customWheels.push({ node: o, front: m[1][0] === 'f' }); } });
  if (!customWheels.length && cfg.wheelGroups) customWheels = axleWheels(wrap, root, cfg);
  if (!customWheels.length) customWheels = null;
  customModel = wrap; bodyGroup.add(wrap);
  if (sceneReady && garage.on) garagePlaceCar();
  procBody.visible = false;
  wheels.forEach(w => w.steer.visible = false);   // the model brings its own wheels
  fitPlates(); setPaint(paintIdx); applyRoofClip(); fitWing();
  rivalTemplate = null; for (const a of ai) buildRivalVisual(a);
  if (name !== 'embedded') flash('MODEL LOADED', 1800);
}
// Wheels that come as axle groups (both wheels of an axle in one mesh, pivots at the car's origin): split every mesh that
// spans both sides down the middle, find the four wheel centres from the round parts, and hang each wheel on a pivot at
// its centre: a steer pivot (front wheels turn) holding a spin pivot (the round parts roll) and the caliper.
function subGeometry(g, idx) {   // a non-indexed copy of just these vertex indices (a box on it is then honest)
  const gg = new THREE.BufferGeometry();
  for (const name in g.attributes) { const a = g.attributes[name], sz = a.itemSize, out = new Float32Array(idx.length * sz); for (let i = 0; i < idx.length; i++) for (let k = 0; k < sz; k++) out[i * sz + k] = a.array[idx[i] * sz + k]; gg.setAttribute(name, new THREE.BufferAttribute(out, sz)); }
  gg.computeBoundingBox(); gg.computeBoundingSphere(); return gg;
}
function axleWheels(wrap, root, cfg) {
  wrap.updateMatrixWorld(true);
  const meshes = []; root.traverse(o => { if (o.isMesh && cfg.wheelGroups.test((o.parent && o.parent.name) || '')) meshes.push(o); });
  const parts = [], tmp = new THREE.Vector3();
  for (const m of meshes) {
    const box = new THREE.Box3().setFromObject(m);
    if (box.min.z < -0.25 && box.max.z > 0.25) {   // spans both sides: split by triangle centroid
      const g = m.geometry, pos = g.attributes.position, idx = g.index ? g.index.array : null, n = idx ? idx.length : pos.count, L = [], R = [];
      for (let i = 0; i < n; i += 3) { let z = 0; for (let k = 0; k < 3; k++) { const vi = idx ? idx[i + k] : i + k; tmp.fromBufferAttribute(pos, vi).applyMatrix4(m.matrixWorld); z += tmp.z; } (z < 0 ? L : R).push(idx ? idx[i] : i, idx ? idx[i + 1] : i + 1, idx ? idx[i + 2] : i + 2); }
      for (const half of [L, R]) { if (!half.length) continue; const gg = subGeometry(g, half); const mm = m.clone(); mm.geometry = gg; m.parent.add(mm); parts.push(mm); }
      m.parent.remove(m);
    } else parts.push(m);
  }
  wrap.updateMatrixWorld(true);
  const info = parts.map(m => { const b = new THREE.Box3().setFromObject(m), s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3()); return { m, s, c, round: Math.abs(s.x - s.y) < 0.14 * Math.max(s.x, s.y) && s.z < 0.95 * Math.max(s.x, s.y), big: Math.max(s.x, s.y) > 0.5 }; });
  const tyres = info.filter(q => q.round && q.big); if (tyres.length < 4) return [];
  const mx = tyres.reduce((a, q) => a + q.c.x, 0) / tyres.length, mz = tyres.reduce((a, q) => a + q.c.z, 0) / tyres.length;
  const corners = {}; for (const q of tyres) { const k = (q.c.x > mx ? 'f' : 'r') + (q.c.z < mz ? 'l' : 'r'); (corners[k] = corners[k] || []).push(q); }
  const out = [];
  for (const k in corners) {
    const c = new THREE.Vector3(); for (const q of corners[k]) c.add(q.c); c.divideScalar(corners[k].length);
    // the download may have the wheel turned (toe, or a posed steer): find the yaw that makes the tyre thinnest and undo it
    const tyre = corners[k].reduce((a, q) => (q.s.x * q.s.y > a.s.x * a.s.y ? q : a), corners[k][0]), pos = tyre.m.geometry.attributes.position, wp = [];
    for (let i = 0; i < pos.count; i += Math.max(1, Math.floor(pos.count / 1500))) wp.push(tmp.fromBufferAttribute(pos, i).applyMatrix4(tyre.m.matrixWorld).sub(c).clone());
    let best = 0, bestW = 1e9; for (let a = -40; a <= 40; a += 1) { const r = a * Math.PI / 180, ca = Math.cos(r), sa = Math.sin(r); let z0 = 1e9, z1 = -1e9; for (const v of wp) { const z = -sa * v.x + ca * v.z; if (z < z0) z0 = z; if (z > z1) z1 = z; } if (z1 - z0 < bestW) { bestW = z1 - z0; best = r; } }
    const steer = new THREE.Group(), fix = new THREE.Group(), spin = new THREE.Group(); wrap.add(steer); steer.position.copy(wrap.worldToLocal(c.clone())); steer.add(fix); fix.rotation.y = -best; fix.add(spin); steer.updateMatrixWorld(true);
    for (const q of info) { if (q.c.distanceTo(c) > 0.55 || q.s.length() > 1.2) continue; (q.round ? spin : fix).attach(q.m); }
    out.push({ node: spin, steer, front: k[0] === 'f', spin: cfg.spin || 1, toe: +(best * 180 / Math.PI).toFixed(1) });
  }
  return out.length === 4 ? out : [];
}
// ------------------------------------------------------------------ the GT wing
// LEGGERA's tier 2 part is a swan-neck GT wing, so it is a real part on the car: VR DESIGNER's "SPOILER || WING"
// (Sketchfab, CC BY 4.0), cut from 167,716 triangles to 8,000 by Tools/decimate_glb.py and baked into the page at 134 KB.
// It is fitted to whatever car is on: the mounts are placed by raycasting down onto the rear deck, and it is scaled to
// the car's own width, so a Countach carries it as happily as a Revuelto.
function wingLoad(cb) {
  if (wingRoot) { if (cb) cb(); return; }
  const done = buf => { try { new THREE.GLTFLoader().parse(buf, '', g => { wingRoot = g.scene; if (cb) cb(); }, e => console.error(e)); } catch (e) { console.error(e); } };
  const emb = document.getElementById('wing-glb');
  if (emb) { const bin = atob(emb.textContent.trim()), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); done(u8.buffer); }
  else if (location.protocol !== 'file:') fetch('wing.glb').then(r => r.ok ? r.arrayBuffer() : null).then(b => { if (b) done(b); }).catch(() => {});
}
function fitWing() {
  const want = (career.tiers.aero || 0) >= 2;
  if (wingNode) { bodyGroup.remove(wingNode); wingNode = null; }
  if (!want) return;
  if (!wingRoot) { wingLoad(fitWing); return; }
  const body = customModel || procBody; if (!body) return;
  car.updateMatrixWorld(true);
  // the car's own physics spec, not a mesh raycast: a raycast against the visual body is fragile (a merged mesh's
  // triangle winding, a single-sided material facing the wrong way, an interior panel sitting closer than the
  // outer skin can all make a ray hit the wrong surface) and CAR.width/length/height is exactly this car's real
  // size already, valid for every model the game loads
  const rear = -CAR.length / 2, width = CAR.width, top = CAR.height * 0.62;
  const w = wingRoot.clone(true);
  const wb = new THREE.Box3().setFromObject(w), ws = wb.getSize(new THREE.Vector3()), wc = wb.getCenter(new THREE.Vector3());
  const k = (width * 0.94) / ws.x;   // the model's span is its X; the car's width is its Z
  const g = new THREE.Group();
  w.position.set(-wc.x, -wb.min.y, -wc.z); w.scale.setScalar(1); g.add(w); g.scale.setScalar(k); g.rotation.y = Math.PI / 2;
  const mountX = rear + ws.z * k * 0.55;
  g.position.set(mountX, Math.max(0.25, top - 0.02), 0);
  const mat = new THREE.MeshPhysicalMaterial({ color: 0x14161c, metalness: 0.6, roughness: 0.34, clearcoat: 0.8, clearcoatRoughness: 0.12, envMap: cubeRT.texture, envMapIntensity: 1.1 });
  g.traverse(o => { if (o.isMesh) { o.material = mat; o.castShadow = true; o.receiveShadow = true; } });
  wingNode = g; bodyGroup.add(g);
}
function loadGLBBuffer(buf, name) {
  // sandboxed pages refuse blob: URLs; without createImageBitmap the loader uses <img src="data:..."> instead
  try { window.createImageBitmap = undefined; } catch (e) {}
  try { new THREE.GLTFLoader().parse(buf, '', g => installModel(g.scene, name), e => { console.error(e); flash('MODEL FAILED', 2000); }); }
  catch (e) { console.error(e); flash('MODEL FAILED', 2000); }
}
function carApply(C) {
  Object.assign(CAR, C.spec); customYaw = C.yaw || 0; if (typeof retune === 'function') retune(); if (typeof setMode === 'function') setMode(st.mode);
  const bm = $('badge-model'), sm = $('start-model'); if (bm) bm.textContent = C.name; if (sm) sm.textContent = C.name;
}
function carSelect(id, save) {
  const C = CARS[id]; if (!C) return;
  const done = () => { if (save) { career.car = id; careerSave(); } if (typeof garageRefresh === 'function') garageRefresh(); };
  if (carRoots[id]) { carId = id; carApply(C); installModel(carRoots[id], id); done(); return; }
  if (!C.file || location.protocol === 'file:' || document.getElementById('revuelto-glb')) { flash('HOSTED SITE ONLY · LAMBO-SIM.WEB.APP', 2400); return; }   // the single-file page has only the Revuelto
  flash('LOADING ' + C.name + ' …', 4000);
  fetch(C.file).then(r => r.ok ? r.arrayBuffer() : null).then(b => { if (!b) { flash('MODEL NOT FOUND', 2000); return; }
    try { window.createImageBitmap = undefined; } catch (e) {}
    new THREE.GLTFLoader().parse(b, '', g => { carRoots[id] = g.scene; carId = id; carApply(C); installModel(g.scene, id); flash('LAMBORGHINI ' + C.name, 1600, '#ffd21f'); done(); }, e => { console.error(e); flash('MODEL FAILED', 2000); });
  }).catch(() => flash('MODEL FAILED', 2000));
}
function buyCar(id) { const C = CARS[id]; if (!C) return 'NO'; if (career.cars.includes(id)) return 'OWNED'; if (career.cash < C.price) return 'POOR'; career.cash -= C.price; career.cars.push(id); careerSave(); return 'OK'; }
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
  else if (location.protocol !== 'file:') (window.__glbFetch || fetch('revuelto.glb').then(r => r.ok ? r.arrayBuffer() : null)).then(b => { if (b) loadGLBBuffer(b, 'revuelto.glb'); }).catch(() => {});
  if (career.car && career.car !== 'revuelto' && career.cars.includes(career.car)) setTimeout(() => carSelect(career.car, false), 800);   // the car they parked in
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
  hits: 0, hitT: 0, boost2Cd: 0, roof: false, roofIn: false, crossings: 0, lapsDone: 0, spinT: 0, spinW: 0, boostT: 0, boostCd: 0, glow: 0, nos: 1, nosOn: false, air: false, vel: new THREE.Vector3(), airT: 0, resets: 0,
  steer: 0, throttle: 0, brake: 0, hand: false,
  gear: 0, rpm: CAR.idle, shiftT: 0, auto: true, reverse: false,
  mode: 1, cam: 0, offroad: false, slip: 0, aLat: 0, aLong: 0, delta: 0,
  sound: true, started: false, vmax: 0, record: 0, recordPend: false, coins: 0, score: 0, super: false,
  lapStart: null, lapLast: null, lapBest: null, lastP: 0, halfSeen: false, trackIdx: 0,
};
try { const b = localStorage.getItem('revuelto.best.' + TRACK_ID); if (b) st.lapBest = +b; const r = localStorage.getItem('revuelto.vmax'); if (r) st.record = +r; const pm = localStorage.getItem('revuelto.paint'); if (pm != null && PAINTS[+pm] && ownsPaint(+pm)) paintIdx = +pm; const dm = localStorage.getItem('revuelto.drive'); if (dm != null && MODES[+dm]) st.mode = +dm; const cm = localStorage.getItem('revuelto.cam'); if (cm != null && +cm >= 0 && +cm < 5) st.cam = +cm; } catch (e) {}   // best lap is per world; paint, drive mode and camera come back too
function placeOnTrack(idx) {
  const racing = GAME.state === 'racing';
  if (racing && st.lastP < 0.08 && idx / N > 0.92) { st.crossings = Math.max(0, st.crossings - 1); st.lapsDone = Math.max(0, st.lapsDone - 1); }   // put back behind the line: that crossing is owed again
  st.s = CUM[idx]; st.d = 0; st.psi = 0; syncPose(); st.lastP = idx / N;   // no phantom lap when resetting near the line
  st.u = st.w = st.yaw = 0; st.air = false; st.airT = 0; st.roof = st.roofIn = false; st.gear = 0; st.rpm = CAR.idle; st.reverse = false; st.spinT = 0;
  if (!racing) { st.lapStart = null; st.halfSeen = false; }               // mid-race the lap keeps running: a reset costs time, not the lap
  if (typeof trailReset === 'function') trailReset();
  st.snapCam = true;
}
// world pose from track coordinates
function syncPose() {
  const fr = sampleAt(st.s), cp = Math.cos(st.psi), sp = Math.sin(st.psi);
  st.pos.copy(fr.p).addScaledVector(fr.b, st.d); if (st.roof) st.pos.addScaledVector(fr.n, ROOF_H);
  st.fwd.copy(fr.t).multiplyScalar(cp).addScaledVector(fr.b, sp).normalize();
  st.up.copy(fr.n); st.right.crossVectors(st.fwd, st.up);
  st.x = st.pos.x; st.y = st.pos.y; st.z = st.pos.z; st.theta = Math.atan2(-st.fwd.z, st.fwd.x); st.trackIdx = fr.i;
}

// ------------------------------------------------------------------ game modes · rivals · race control
// SOLO is the open track. TIME TRIAL is a standing start and a lap count. VERSUS adds three AI Lamborghinis on a grid
// with full contact: shoves, tailgating and a badly judged hit that spins whoever got it wrong.
const GAME = { mode: 'solo', laps: 3, diff: 1, state: 'free', cd: 0, cdShown: -1, startT: 0, finishT: null, lapTimes: [], resultsAt: 0, order: [] };
// difficulty: rival pace (cornering and top-speed multipliers, the rubber band's reach), aggression (how often they come for
// you), rival NOS, how often they make a mistake, and the player's own car: more power and sharper steering up the levels so
// it is harder to handle, and a NOS tank that drains faster and charges slower
const DIFFS = [
  { name: 'EASY', skill: 0.88, vmax: 88, band: [0.84, 1.03], aggr: 0, nosAI: false, mistake: [16, 36], player: { power: 1.0, grip: 1.0, steer: 1.0 }, nos: { drain: 0.65, charge: 1.8 } },
  { name: 'MEDIUM', skill: 1.12, vmax: 97, band: [0.97, 1.14], aggr: 0.45, nosAI: true, mistake: [40, 80], player: { power: 1.08, grip: 1.02, steer: 1.12 }, nos: { drain: 1.0, charge: 1.0 } },
  { name: 'HARD', skill: 1.20, vmax: 100, band: [1.0, 1.18], aggr: 0.75, nosAI: true, mistake: [70, 140], player: { power: 1.16, grip: 1.05, steer: 1.22 }, nos: { drain: 1.2, charge: 0.75 } },
  { name: 'IMPOSSIBLE', skill: 1.30, vmax: 104, band: [1.04, 1.25], aggr: 1.0, nosAI: true, mistake: [140, 300], player: { power: 1.25, grip: 1.08, steer: 1.32 }, nos: { drain: 1.35, charge: 0.6 } },
];
const DIFF_FREE = Object.assign({}, DIFFS[1], { player: { power: 1.0, grip: 1.0, steer: 1.0 } });   // Solo and Time Trial: the stock car, Medium NOS economy
const diffNow = () => GAME.mode === 'versus' ? DIFFS[GAME.diff] : DIFF_FREE;
const RIVALS = [
  { name: 'MANTIS', hex: 0x30d21c, skill: 0.985, lane: -1 },   // Verde Mantis
  { name: 'INTI', hex: 0xffc400, skill: 0.965, lane: 1 },      // Giallo Inti
  { name: 'LE MANS', hex: 0x2452ff, skill: 0.945, lane: 0 },   // Blu Le Mans
];
// the rivals' speed limit per sample: cornering grip, then a backward pass so every braking zone is baked in
const VLIM = new Float32Array(N);
{
  const AI_MU = 1.30, AI_VMAX = 96, AI_BRAKE = 12.5;
  for (let i = 0; i < N; i++) VLIM[i] = Math.min(AI_VMAX, Math.sqrt(AI_MU * (TRACK.grip || 1) * G / Math.max(Math.abs(KAPPA[i]), 1e-5)));
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
    boostT: 0, boostCd: 0, glow: 0, hitT: 0, nos: 1, nosOn: false, attackT: 0, attack: 0, errT: 20 + Math.random() * 30, mistake: null, pos: new THREE.Vector3(), fwd: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), right: new THREE.Vector3(), idx: 0, grp: null, body: null, wheels: [], snd: null };
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
  let target = go ? Math.min(D.vmax, VLIM[i] * a.skill * D.skill * rubber) : 0;
  const dsP = fwdGap(st.s, a.s);                                                     // player ahead of this rival by
  // rival NOS (not on Easy): a straight ahead, a full tank, the player within reach, and it goes
  if (D.nosAI && go && a.spinT <= 0) {
    const look2 = (i + Math.round(clamp(a.u * 2.5, 60, 250) / (trackLen / N))) % N;
    if (!a.nosOn && a.nos > 0.99 && Math.abs(KAPPA[look2]) < 1 / 500 && VLIM[i] > 55 && Math.abs(dsP) < 260 && Math.random() < dt * 0.6) a.nosOn = true;
    if (a.nosOn) { a.nos -= dt / 4; if (a.nos <= 0 || VLIM[i] < a.u * 0.85) a.nosOn = false; target = Math.min(D.vmax * 1.06, target * 1.15); a.glow = 1; }
    else a.nos = Math.min(1, a.nos + dt / 28);
  } else a.nosOn = false;
  // mistakes: every so often (rarer up the levels) a rival runs wide into the wall, brakes far too early, or loses it
  a.errT -= dt;
  if (a.errT <= 0 && go && a.spinT <= 0 && !a.mistake) {
    const r = Math.random(); a.errT = D.mistake[0] + Math.random() * (D.mistake[1] - D.mistake[0]);
    if (r < 0.55) a.mistake = { type: 'wide', t: 1.5, side: a.d >= 0 ? 1 : -1 }; else if (r < 0.85) a.mistake = { type: 'brake', t: 1.3 }; else { a.spinT = 0.9; a.spinDir = Math.random() < 0.5 ? 1 : -1; }
  }
  if (a.mistake) { a.mistake.t -= dt; if (a.mistake.type === 'brake') target *= 0.55; if (a.mistake.t <= 0) a.mistake = null; }
  // aggression (Medium and up): now and then, with the player in reach, a rival lines up to shunt or squeeze
  a.attackT -= dt;
  if (a.attackT <= 0) { a.attackT = 4 + Math.random() * 5; if (D.aggr > 0 && go && dsP > -30 && dsP < 25 && Math.random() < D.aggr) a.attack = 2.5 + D.aggr; }
  if (a.attack > 0) { a.attack -= dt; if (dsP > 1 && dsP < 25) target = Math.max(target, Math.abs(st.u) + 6 + 4 * D.aggr); }
  if (a.spinT > 0) { a.spinT -= dt; a.psi += a.spinDir * 5.5 * dt; a.u = Math.max(0, a.u - 9 * dt); a.dv *= Math.max(0, 1 - 2 * dt); }
  else if (!go) { a.dv = 0; a.u = Math.max(0, a.u - 13 * dt); }   // on the grid, lights still red: sit dead still, no creeping or twitching
  else {
    a.psi = damp(a.psi, Math.atan2(a.dv, Math.max(a.u, 4)), 6, dt);
    if (a.u < target) { const acc = Math.min(10.5, CAR.powerW * CAR.drivelineEff * 0.9 / (CAR.mass * Math.max(a.u, 4))) * (a.boostT > 0 ? 1.7 : 1) * (a.nosOn ? 1.8 : 1); a.u = Math.min(target, a.u + acc * dt); }
    else a.u = Math.max(target, a.u - 13 * dt);
    // the line: inside of the next corner, own lane on the straights, and round whatever is in the way
    const look = (i + Math.round(clamp(a.u * 1.8, 40, 200) / (trackLen / N))) % N;
    let dT = -Math.sign(KAPPA[look]) * clamp(Math.abs(KAPPA[look]) * 900, 0, 2.8) + a.lane * 1.6;
    const attacking = a.attack > 0 && dsP > -8 && dsP < 25;
    const cars = attacking ? [] : [{ s: st.s, d: st.d, u: st.u }]; for (const o of ai) if (o !== a) cars.push(o);
    for (const o of cars) { const ds = fwdGap(o.s, a.s); if (ds > -6 && ds < 26 + a.u * 0.35 && Math.abs(o.d - a.d) < 2.9 && o.u <= a.u + 8) { dT = (o.d > a.d || (o.d === a.d && a.lane >= 0)) ? o.d - 3.4 : o.d + 3.4; break; } }
    if (attacking) dT = dsP > 5 ? st.d : st.d + (a.d > st.d ? -1.4 : 1.4);                         // line up behind, or lean on the door
    if (a.mistake && a.mistake.type === 'wide') dT = a.mistake.side * (ROAD_HALF + 1.6);            // ...and sometimes it all goes wrong
    dT = clamp(dT, -(ROAD_HALF + 2), ROAD_HALF + 2);
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
  a.glowDisc.material.opacity = (0.45 + 0.5 * a.glow) * GLOW_K; a.glowDisc.material.color.setHex(a.nosOn ? 0xa64dff : a.hex);
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
  st.crossings = 0; st.lapsDone = 0; st.hits = 0; st.resets = 0; st.vmax = 0; st.lapLast = null; st.nos = 1; st.spinT = 0; st.coins = 0; st.score = 0; st.driftBoostT = 0; if (RING_AT) ringsRespawn();
  if (mode === 'versus') {
    RIVALS.forEach((R, k) => { const a = makeRival(R); a.s = trackLen - 16 - 8.5 * k; a.d = k % 2 ? 2.7 : -2.7; a.lastP = a.s / trackLen; rivalPose(a); audio.rivalStart(a); ai.push(a); });
    placeAtS(trackLen - 16 - 8.5 * 3, 2.7);
  } else if (mode === 'time') placeAtS(trackLen - 20, 0);
  else placeOnTrack(20);
  GAME.state = mode === 'solo' ? 'free' : 'countdown'; GAME.cd = START_CUES[0].at + 0.01; GAME.cue = 0; announcer.stop();
  GAME.bestAtStart = st.lapBest; GAME.prize = 0;   // for the payout: a new personal best in a Time Trial pays a bonus
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
  const rows = [{ me: true, name: career.name || 'YOU', hex: PAINTS[paintIdx].hex, prog: progressOf(st), u: Math.abs(st.u), finishT: GAME.finishT, best: st.lapBest }];
  for (const a of ai) rows.push({ me: false, name: a.name, hex: a.hex, prog: progressOf(a), u: a.u, finishT: a.finishT, best: a.best });
  rows.sort((p, q) => (p.finishT != null || q.finishT != null) ? ((p.finishT == null ? 1e12 : p.finishT) - (q.finishT == null ? 1e12 : q.finishT)) : q.prog - p.prog);
  return rows;
}
function finishRace(now) {
  GAME.state = 'finished'; GAME.finishT = now - GAME.startT; GAME.resultsAt = now + 1800;
  const pos = standings().findIndex(r => r.me) + 1;
  const newBest = GAME.mode === 'time' && st.lapBest != null && (GAME.bestAtStart == null || st.lapBest < GAME.bestAtStart);
  GAME.prize = prizeFor(GAME.mode, pos, GAME.laps, GAME.diff, newBest); GAME.prizeBest = newBest; if (GAME.prize > 0) payout(GAME.prize, pos);
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
  $('res-cash').textContent = GAME.prize > 0 ? '+ ' + fmtCash(GAME.prize) + (GAME.prizeBest ? ' · NEW BEST BONUS' : '') + ' · BALANCE ' + fmtCash(career.cash) : '';
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
const keys = {}, touch = { left: 0, right: 0, gas: 0, brake: 0, hand: 0, nos: 0, wheel: 0 };   // wheel is analogue, -1 .. 1
const inp = { steer: 0, throttle: 0, brake: 0, hand: false, nos: false, shiftUp: false, shiftDown: false };
function readInput() {
  const k = c => keys[c] ? 1 : 0;
  inp.steer = k('ArrowLeft') + k('KeyA') - k('ArrowRight') - k('KeyD') + touch.left - touch.right + touch.wheel;
  inp.throttle = Math.max(k('ArrowUp'), k('KeyW'), touch.gas);
  inp.brake = Math.max(k('ArrowDown'), k('KeyS'), touch.brake);
  inp.hand = !!(keys.Space || touch.hand);
  inp.nos = !!keys.KeyN || !!keys.ShiftLeft || !!keys.ShiftRight || !!touch.nos;   // N or Shift: a second key for keyboards that ghost Up + arrow + N
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
  wheelTick();                                                       // the wheel springs back on the game's own clock
  inp.steer = clamp(inp.steer, -1, 1);
}
window.addEventListener('keydown', e => {
  if (!$('welcome').classList.contains('hidden')) { if ((e.code === 'Enter' || e.code === 'Space') && window.__welcomePlay) { e.preventDefault(); window.__welcomePlay(); } return; }
  if (!$('namebox').classList.contains('hidden')) return;
  if (document.body.classList.contains('garage')) { if (e.code === 'Escape') garageClose(); return; }
  if (e.repeat) { if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); return; }
  keys[e.code] = true;
  if (!$('start').classList.contains('hidden')) { if (e.code === 'Enter' && !$('start-btn').classList.contains('hidden')) startGame(); else if (e.code === 'Escape') { if (!$('settings').classList.contains('hidden')) $('settings').classList.add('hidden'); else startNav(-1); } return; }
  if (e.code === 'Escape') { if (!$('settings').classList.contains('hidden')) { $('settings').classList.add('hidden'); return; } toMenu(); return; }
  switch (e.code) {
    case 'KeyM': setMode(st.mode + 1); break;
    case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': setMode(+e.code.slice(-1) - 1); break;
    case 'KeyC': st.cam = (st.cam + 1) % 5; flash(['CHASE', 'CLOSE', 'COCKPIT', 'BUMPER', 'PHOTO'][st.cam], 700); try { localStorage.setItem('revuelto.cam', String(st.cam)); } catch (e) {} break;
    case 'KeyP': { let i = paintIdx; do { i = (i + 1) % PAINTS.length; } while (!ownsPaint(i) && i !== paintIdx); setPaint(i); flash(PAINTS[paintIdx].name, 900); } break;
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
  const on = e => { e.preventDefault(); touch[k] = 1; b.classList.add('down'); };
  const off = e => { e.preventDefault(); touch[k] = 0; b.classList.remove('down'); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
});
const TOUCH_DEV = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
if (TOUCH_DEV) { $('touch').classList.add('on'); document.body.classList.add('touch'); }
// phone steering: WHEEL (a real wheel you rotate with one finger) or LEFT / RIGHT (the two arrows). Wheel is the default
let steerMode = 'wheel';
try { const sm = localStorage.getItem('revuelto.steer'); if (sm === 'wheel' || sm === 'arrows') steerMode = sm; } catch (e) {}
function applySteerMode() {
  $('touch').classList.toggle('wheel', steerMode === 'wheel');
  document.body.classList.toggle('wheelsteer', steerMode === 'wheel');   // the tach shares the wheel's corner: it stands down on a phone
  touch.wheel = 0; wheelReset();                                     // never leave a stale lock behind when switching
  try { localStorage.setItem('revuelto.steer', steerMode); } catch (e) {}
}
let wheelReset = () => {}, wheelTick = () => {}, wheelState = () => ({});
{ // the wheel: grab it anywhere, the angle of your finger about its centre turns it. Full lock at 120 degrees
  // The spring back to centre runs off readInput (the game loop), not its own frame callback: a throttled
  // browser must never leave the wheel latched at full lock with no finger on it
  const el = $('t-wheel'), svg = el.firstElementChild, MAX = Math.PI * 2 / 3, DEAD = 26;
  let ang = 0, pid = null, last = 0, tPrev = 0;
  const paint = () => { svg.style.transform = 'rotate(' + (ang * 180 / Math.PI).toFixed(1) + 'deg)'; touch.wheel = clamp(-ang / MAX, -1, 1); };
  const at = e => { const r = el.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); return { a: Math.atan2(dy, dx), r: Math.hypot(dx, dy) }; };
  wheelReset = () => { pid = null; ang = 0; tPrev = 0; el.classList.remove('grab'); paint(); };
  wheelTick = () => {
    if (pid !== null || ang === 0) { tPrev = 0; return; }
    const now = performance.now(), dt = tPrev ? Math.min(0.1, (now - tPrev) / 1000) : 0; tPrev = now;
    ang += -ang * (1 - Math.exp(-dt * 14));                            // eases to centre in about a quarter second
    if (Math.abs(ang) < 0.005) ang = 0;
    paint();
  };
  el.addEventListener('pointerdown', e => {
    if (pid !== null) return; e.preventDefault();
    pid = e.pointerId; last = at(e).a; tPrev = 0; el.classList.add('grab'); try { el.setPointerCapture(pid); } catch (err) {}
  });
  el.addEventListener('pointermove', e => {
    if (e.pointerId !== pid) return; e.preventDefault();
    const p = at(e); if (p.r < DEAD) { last = p.a; return; }            // near the hub atan2 is all noise: follow, do not turn
    let d = p.a - last; if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
    last = p.a; ang = clamp(ang + d, -MAX, MAX); paint();
  });
  const release = e => { if (e.pointerId !== pid) return; pid = null; tPrev = 0; el.classList.remove('grab'); };
  el.addEventListener('pointerup', release); el.addEventListener('pointercancel', release);
  wheelState = () => ({ ang: +ang.toFixed(3), pid, steer: +touch.wheel.toFixed(3) });
}
applySteerMode();
$('start-btn').addEventListener('click', startGame);
{ // colour bar: five quick picks (the fifth is the animated TRON paint); P still cycles the full list
  const bar = $('paints'), picks = PAINTS.map((_, i) => i).filter(i => i > 0);
  for (const i of picks) { const b = document.createElement('button'); b.dataset.p = String(i); b.title = PAINTS[i].name; b.className = PAINTS[i].shader ? 'tron' : PAINTS[i].livery ? 'livery' : ''; if (!PAINTS[i].shader && !PAINTS[i].livery) b.style.background = '#' + PAINTS[i].hex.toString(16).padStart(6, '0'); b.addEventListener('click', e => { e.stopPropagation(); if (!ownsPaint(i)) { flash('BUY IT IN THE GARAGE · ' + fmtCash(PAINTS[i].price), 1200); return; } setPaint(i); }); bar.appendChild(b); }
}

function audioBtns() {
  const mb = $('btn-music'), sb = $('btn-sound');
  mb.textContent = '♪ ' + (music.on ? music.tracks[music.track].name : 'MUSIC OFF'); mb.classList.toggle('off', !music.on);
  sb.textContent = st.sound ? 'SOUND ON' : 'SOUND OFF'; sb.classList.toggle('off', !st.sound);
}
$('btn-music').addEventListener('click', e => { e.stopPropagation(); flash(music.cycle(), 1000); audioBtns(); });
$('btn-sound').addEventListener('click', e => { e.stopPropagation(); st.sound = !st.sound; flash(st.sound ? 'SOUND ON' : 'SOUND OFF', 700); audioBtns(); });
$('btn-settings').addEventListener('click', e => { e.stopPropagation(); settingsRefresh(); $('settings').classList.toggle('hidden'); });
// settings & credits panel (start screen link, or ESC in the menu)
function settingsRefresh() {
  const v = { quality: hiQ ? 'HIGH' : 'LOW', bloom: bloomOn ? 'ON' : 'OFF', sound: st.sound ? 'ON' : 'OFF', music: music.on ? music.tracks[music.track].name : 'OFF', trail: trailOn ? 'ON' : 'OFF', voice: announcer.on ? 'ON' : 'OFF', steer: steerMode === 'wheel' ? 'WHEEL' : 'LEFT / RIGHT' };
  document.querySelectorAll('#settings [data-set]').forEach(b => { b.textContent = v[b.dataset.set]; });
  $('set-menu').classList.toggle('hidden', !$('start').classList.contains('hidden')); $('set-saved').textContent = '';
  document.querySelectorAll('#settings input[data-vol]').forEach(r => { r.value = Math.round(audio.vol[r.dataset.vol] * 100); r.nextElementSibling.textContent = r.value + '%'; });
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
    case 'steer': steerMode = steerMode === 'wheel' ? 'arrows' : 'wheel'; applySteerMode(); break;
  }
  settingsRefresh(); audioBtns();
}));
document.querySelectorAll('#settings input[data-vol]').forEach(r => { const upd = () => { audio.setVolume(r.dataset.vol, r.value / 100); r.nextElementSibling.textContent = r.value + '%'; }; r.addEventListener('input', upd); r.addEventListener('change', upd); r.addEventListener('click', e => e.stopPropagation()); });
$('cred-more-btn').addEventListener('click', e => { e.stopPropagation(); const on = $('cred-more').classList.toggle('hidden'); e.target.textContent = on ? 'SHOW ADDITIONAL CREDITS' : 'HIDE ADDITIONAL CREDITS'; });
$('settings-btn').addEventListener('click', e => { e.stopPropagation(); settingsRefresh(); $('settings').classList.remove('hidden'); });
$('settings-close').addEventListener('click', e => { e.stopPropagation(); $('settings').classList.add('hidden'); });
$('t-menu').addEventListener('click', e => { e.stopPropagation(); settingsRefresh(); $('settings').classList.toggle('hidden'); });
$('set-menu').addEventListener('click', e => { e.stopPropagation(); $('settings').classList.add('hidden'); toMenu(); });
$('set-save').addEventListener('click', e => { e.stopPropagation(); careerSave(); const where = (cloud.ok && cloud.user) ? 'SAVED · LOCAL + CLOUD' : 'SAVED ON THIS DEVICE'; $('set-saved').textContent = where + ' · ' + new Date().toLocaleTimeString(); flash('GAME SAVED', 1200, '#ffd21f'); });
$('settings').addEventListener('click', e => e.stopPropagation());
let flashTimer = null;
function flash(text, ms, color) { const m = $('msg'); m.textContent = text; m.style.color = color || ''; m.style.textShadow = color ? '0 0 28px ' + color : ''; m.classList.add('show'); clearTimeout(flashTimer); flashTimer = setTimeout(() => m.classList.remove('show'), ms); }
function setMode(i) {
  st.mode = (i + MODES.length) % MODES.length; const m = MODES[st.mode];
  $('mode-name').textContent = m.name; $('mode-name').style.color = m.color; $('mode-sub').textContent = modeSub(m); try { localStorage.setItem('revuelto.drive', String(st.mode)); } catch (e) {}
  flash(m.name, 900);
}
function shiftTo(g) { if (g < 0 || g > 7 || g === st.gear) return; st.gear = g; st.shiftT = 0.09; audio.shift(); }
function shiftManual(d) { if (st.auto) { st.auto = false; $('gearlbl').textContent = 'MANUAL'; } if (!st.reverse) shiftTo(st.gear + d); }
function startGame() {
  if (!$('start').classList.contains('hidden')) $('start').classList.add('hidden'); else return;
  $('paints').classList.add('hidden');   // the paint picker is a menu control, not part of the driving HUD -- especially in the way on a phone
  if (!st.started) { st.started = true; audio.start(); setMode(st.mode); setPaint(paintIdx); }
  startRace(GAME.mode, GAME.laps);
  if (GAME.mode === 'solo') flash('AUTODROMO DI CORE FOCUS', 1500);
}
function toMenu() {
  $('results').classList.add('hidden'); $('start').classList.remove('hidden'); $('paints').classList.remove('hidden'); GAME.state = 'free'; clearRivals(); $('race').classList.add('hidden'); announcer.stop(); audio.nosStop(); audio.rumbleStop(); placeOnTrack(sampleAt(st.s).i); if (window.startShow) startShow(2);
}
{ // the start screens: course → mode (and laps) → rivals (Versus). Choices are remembered, so a course change (which
  // rebuilds the page) comes back to the mode screen with everything as it was
  const ls = k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  if (ls('revuelto.mode') && ['solo', 'time', 'versus'].includes(ls('revuelto.mode'))) GAME.mode = ls('revuelto.mode');
  if (ls('revuelto.laps') && [1, 3, 5, 10].includes(+ls('revuelto.laps'))) GAME.laps = +ls('revuelto.laps');
  if (ls('revuelto.diff') != null && DIFFS[+ls('revuelto.diff')]) GAME.diff = +ls('revuelto.diff');
  let step = ls('revuelto.step') === '2' ? 2 : 1; lsSet('revuelto.step', '');
  const showStep = n => {
    step = n; ['track', 'mode', 'diff'].forEach((k, i) => $('step-' + k).classList.toggle('hidden', i + 1 !== n));
    const last = n === 3 || (n === 2 && GAME.mode !== 'versus');
    $('back-btn').classList.toggle('hidden', n === 1); $('next-btn').classList.toggle('hidden', last); $('start-btn').classList.toggle('hidden', !last);
    if (n === 1) lobbyPick(LOBBY.sel); else lobbyHideBg();
    $('start-btn').textContent = GAME.mode === 'versus' ? 'START RACE' : GAME.mode === 'time' ? 'START TIME TRIAL' : 'START ENGINE';
  };
  window.startNav = d => { if (d < 0 && step > 1) showStep(step - 1); else if (d > 0 && step === 1) lobbyNext(); else if (d > 0) showStep(step + 1); };
  window.startShow = showStep;
  const setModeBtn = m => { GAME.mode = m; lsSet('revuelto.mode', m); document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.m === m)); $('lapsel').classList.toggle('hidden', m === 'solo'); showStep(2); };
  document.querySelectorAll('#modes button').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); setModeBtn(b.dataset.m); }));
  document.querySelectorAll('#lapsel button').forEach(b => { b.classList.toggle('on', +b.dataset.l === GAME.laps); b.addEventListener('click', e => { e.stopPropagation(); GAME.laps = +b.dataset.l; lsSet('revuelto.laps', String(GAME.laps)); document.querySelectorAll('#lapsel button').forEach(x => x.classList.toggle('on', x === b)); }); });
  const diffBtns = document.querySelectorAll('#diffsel button');
  diffBtns.forEach(b => { b.classList.toggle('on', +b.dataset.d === GAME.diff); b.addEventListener('click', e => { e.stopPropagation(); GAME.diff = +b.dataset.d; diffBtns.forEach(x => x.classList.toggle('on', x === b)); lsSet('revuelto.diff', String(GAME.diff)); }); });
  $('back-btn').addEventListener('click', e => { e.stopPropagation(); startNav(-1); });
  $('res-again').addEventListener('click', e => { e.stopPropagation(); startRace(GAME.mode, GAME.laps); });
  $('res-menu').addEventListener('click', e => { e.stopPropagation(); toMenu(); });
  $('results').addEventListener('click', e => e.stopPropagation());
  lobbyPick(TRACK_ID);   // the tiles were built before the world; the built world is now the backdrop
  hudLineOK = true; hudCarLine();
  for (const id of ['start-ver', 'cred-ver']) { const e = $(id); if (e) e.textContent = 'V' + VERSION; }   // one source of truth for the version
  $('start-sub').textContent = TRACK.name + ' · ' + TRACK.sub + ' · ' + TRACK.km + ' KM';
  if (RING_AT) $('ringrow').classList.remove('hidden');
  document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.m === GAME.mode)); $('lapsel').classList.toggle('hidden', GAME.mode === 'solo');
  showStep(step);
  $('name-ok').addEventListener('click', e => { e.stopPropagation(); nameSubmit(); }); $('name-cancel').addEventListener('click', e => { e.stopPropagation(); nameClose(); }); $('namebox').addEventListener('click', e => e.stopPropagation());
  $('name-in').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') nameSubmit(); else if (e.key === 'Escape' && career.name) nameClose(); });
  nameRefresh(); giftCheck(); if (!career.name) nameOpen(true);   // the first visit: create your unique account name
}

function paintBarLocks() { document.querySelectorAll('#paints button[data-p]').forEach(b => b.classList.toggle('locked', !ownsPaint(+b.dataset.p))); }
function nameValid(n) { n = n.trim().toUpperCase(); if (n.length < 2) return 'AT LEAST 2 CHARACTERS'; if (n.length > 16) return '16 CHARACTERS AT MOST'; if (!/^[A-Z0-9 ._-]+$/.test(n)) return 'LETTERS, NUMBERS, SPACES, . _ -'; return ''; }
function nameOpen(first, err) { const box = $('namebox'); box.classList.remove('hidden'); $('name-cancel').classList.toggle('hidden', !!first); $('name-in').value = career.name || ''; $('name-err').textContent = err || ''; setTimeout(() => { try { $('name-in').focus(); $('name-in').select(); } catch (e) {} }, 30); }
function nameClose() { $('namebox').classList.add('hidden'); }
async function nameSubmit() {
  const raw = $('name-in').value, err = nameValid(raw); if (err) { $('name-err').textContent = err; return; }
  const name = raw.trim().toUpperCase().replace(/\s+/g, ' ');
  if (cloud.ok && cloud.user && await cloud.claimName(name) === 'TAKEN') { $('name-err').textContent = 'THAT NAME IS TAKEN · PICK ANOTHER'; return; }
  career.name = name; giftCheck(); careerSave(); nameClose(); nameRefresh(); if (typeof garageRefresh === 'function') garageRefresh(); flash('WELCOME, ' + name, 1400, '#ffd21f');
}
function giftCheck() {
  const n = career.name, amt = n && GIFTS[n];
  if (!amt) return;
  career.gifts = career.gifts || [];
  if (career.gifts.includes(n)) return;
  career.gifts.push(n); career.cash += amt; flash('GIFT · +' + fmtCash(amt), 2200, '#ffd21f');
}
function nameRefresh() { const d = $('start-driver'); if (!d) return; d.textContent = career.name ? 'DRIVER · ' + career.name : ''; d.classList.toggle('hidden', !career.name); }
function hudCarLine() { const e = document.querySelector('#top-left .sub span'); if (e) e.textContent = TRACK.name + ' · ' + TRACK.km + ' KM · ' + Math.round(CAR.powerW / 745.3 * TUNE.power) + ' HP · V' + VERSION; }

function confirmAsk(title, sub, onYes) {
  $('confirm-title').textContent = title; $('confirm-sub').textContent = sub; $('confirm').classList.remove('hidden');
  const yes = $('confirm-yes'), no = $('confirm-no');
  const done = () => { $('confirm').classList.add('hidden'); yes.removeEventListener('click', go); no.removeEventListener('click', cancel); };
  const go = e => { e.stopPropagation(); done(); onYes(); };
  const cancel = e => { e.stopPropagation(); done(); };
  yes.addEventListener('click', go); no.addEventListener('click', cancel);
}
$('confirm').addEventListener('click', e => e.stopPropagation());
let paintOpen = false;
{ // the garage: prize money spent on parts and paints, with the car turning on the photo camera behind the panel
  const gEl = $('garage'); let prevCam = 0;
  const rating = () => { const n = SHOP_KEYS.reduce((a, k) => a + career.tiers[k], 0); return n === 0 ? 'STOCK CAR' : n >= 18 ? 'FULLY BUILT' : 'BUILD ' + Math.round(n / 18 * 100) + '%'; };
  const pct = x => Math.round(Math.abs(x - 1) * 100) + '%';
  const effect = T => { const o = []; if (T.power) o.push('+' + pct(T.power) + ' POWER'); if (T.grip) o.push('+' + pct(T.grip) + ' GRIP'); if (T.brake) o.push('+' + pct(T.brake) + ' BRAKING'); if (T.steer) o.push('+' + pct(T.steer) + ' STEERING'); if (T.drag) o.push('-' + pct(T.drag) + ' DRAG'); if (T.mass) o.push('-' + Math.round((1 - T.mass) * CAR.mass) + ' KG'); if (T.nosTank) o.push('NOS LASTS ' + T.nosTank + '×'); if (T.nosCharge) o.push('RECHARGE +' + pct(T.nosCharge)); return o.join(' · '); };
  const hex = P => '#' + P.hex.toString(16).padStart(6, '0');
  window.garageRefresh = function () {
    $('g-cash').textContent = fmtCash(career.cash); $('g-rating').textContent = (career.name ? career.name + ' · ' : '') + rating(); $('garage-btn').textContent = 'GARAGE · ' + fmtCash(career.cash);
    const parts = $('g-parts'); parts.innerHTML = '';
    for (const key of SHOP_KEYS) {
      const S = SHOP[key], t = career.tiers[key], cur = t ? S.tiers[t - 1] : null, nxt = t < 3 ? S.tiers[t] : null;
      const card = document.createElement('div'); card.className = 'g-card' + (nxt ? '' : ' maxed');
      card.innerHTML = `<div class="g-top"><b>${S.brand} · ${S.name}</b><i>${'●'.repeat(t)}${'○'.repeat(3 - t)}</i></div>` +
        `<div class="g-fit">FITTED · ${cur ? cur.name + ' <span>· ' + cur.sub + '</span>' : 'STOCK'}</div>` +
        (nxt ? `<div class="g-next"><b>${nxt.name}</b><span>${nxt.sub}</span><em>${effect(nxt)}</em></div><button data-buy="${key}"${career.cash < nxt.price ? ' disabled' : ''}>BUY · ${fmtCash(nxt.price)}</button>` : '<div class="g-next"><em>FULLY UPGRADED</em></div>');
      parts.appendChild(card);
    }
    const qp = $('g-quickpaint'); qp.innerHTML = '<p>YOUR PAINTS · TAP TO SWITCH</p>';
    for (const i of career.paints) { const P = PAINTS[i], b = document.createElement('button'); b.dataset.p = String(i); b.title = P.name; b.className = (i === paintIdx ? 'on ' : '') + (P.shader ? 'tron' : P.livery ? 'livery' : ''); if (!P.shader && !P.livery) b.style.background = hex(P); qp.appendChild(b); }
    const pp = $('g-paint'); pp.innerHTML = '';
    if (!paintOpen) { pp.innerHTML = '<button id="g-paint-toggle">PAINTS<span>' + PAINTS.length + ' COLOURS · CLICK TO SEE THEM ALL</span></button>'; }
    else PAINTS.forEach((P, i) => { const owned = ownsPaint(i), on = i === paintIdx, b = document.createElement('button'); b.className = 'g-swatch' + (on ? ' on' : '') + (owned ? ' owned' : '') + (!owned && career.cash < P.price ? ' dear' : ''); b.dataset.p = String(i);
      b.innerHTML = `<i style="background:${P.shader ? 'linear-gradient(135deg,#2ee6ff,#0a3cff)' : P.livery ? 'linear-gradient(135deg,#15181f 50%,#2ee6ff 50%)' : hex(P)}"></i><b>${P.name}</b><span>${on ? 'ON CAR' : owned ? 'OWNED' : fmtCash(P.price)}</span>`; pp.appendChild(b); });
    const cc = $('g-cars'); cc.innerHTML = '<div class="g-shop-head"><b>THE SHOP</b><span>LAMBORGHINIS FOR SALE · PRIZE MONEY BUYS THEM · CLICK A CARD TO LOOK AT IT</span></div>' +
      (previewCar && previewCar !== carId ? `<div id="g-preview-tag">VIEWING · ${CARS[previewCar].name}<button id="g-preview-back">BACK TO MY CAR</button></div>` : '');
    for (const id in CARS) { const C = CARS[id], owned = career.cars.includes(id), on = id === carId, card = document.createElement('div'); card.className = 'g-card' + (on ? ' on' : '') + (previewCar === id ? ' previewing' : ''); card.dataset.view = id;
      card.innerHTML = `<div class="g-top"><b>LAMBORGHINI · ${C.name}</b><i>${on ? 'DRIVING' : owned ? 'OWNED' : fmtCash(C.price)}</i></div><div class="g-fit">${C.sub}</div>` + (C.note ? `<div class="g-fit"><span>${C.note}</span></div>` : '') +
        (on ? '' : owned ? `<button data-drive="${id}">SELECT THIS CAR</button>` : `<button data-buycar="${id}">BUY · ${fmtCash(C.price)}</button>`);
      cc.appendChild(card); }
    const st_ = career.stats;
    $('g-career').innerHTML = [['DRIVER', career.name || '—'], ['BALANCE', fmtCash(career.cash)], ['RACES', st_.races], ['WINS', st_.wins], ['PODIUMS', st_.podiums], ['TOTAL EARNED', fmtCash(st_.earned)], ['CAR', rating()], ['CARS OWNED', career.cars.length + ' / ' + Object.keys(CARS).length], ['PAINTS OWNED', career.paints.length + ' / ' + PAINTS.length], ['SAVE', cloud.status]]
      .map(([k, v]) => `<div class="g-stat"><span>${k}</span><b>${v}</b></div>`).join('') +
      '<p class="g-note">PRIZE MONEY · VERSUS PAYS BY FINISHING POSITION, MORE ON HARDER RIVALS AND LONGER RACES · TIME TRIAL PAYS PER LAP WITH A BONUS FOR A NEW BEST · SOLO IS FREE PRACTICE</p>';
    $('g-signin').textContent = !cloud.ok ? 'CLOUD SAVE · ON THE HOSTED SITE' : cloud.user ? 'SIGN OUT' : 'SIGN IN · SAVE TO CLOUD';
  };
  $('g-parts').addEventListener('click', e => { const b = e.target.closest('[data-buy]'); if (!b) return; e.stopPropagation(); const key = b.dataset.buy, t = career.tiers[key], nxt = SHOP[key].tiers[t];
    confirmAsk('BUY THIS?', SHOP[key].brand + ' · ' + nxt.name + ' · ' + fmtCash(nxt.price), () => { const r = buyPart(key); if (r === 'OK') { flash('FITTED · ' + SHOP[key].brand + ' ' + nxt.name, 1300, '#ffd21f'); audio.beep(1320, 0.2); } else flash(r, 1000); garageRefresh(); }); });
  $('g-quickpaint').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (!b) return; e.stopPropagation(); const i = +b.dataset.p; if (ownsPaint(i)) { setPaint(i); flash(PAINTS[i].name, 900); } });
  $('g-paint').addEventListener('click', e => {
    if (e.target.closest('#g-paint-toggle')) { e.stopPropagation(); paintOpen = true; garageRefresh(); return; }
    const b = e.target.closest('[data-p]'); if (!b) return; e.stopPropagation(); const i = +b.dataset.p;
    if (ownsPaint(i)) { setPaint(i); flash(PAINTS[i].name, 900); return; }
    confirmAsk('BUY THIS?', PAINTS[i].name + ' · ' + fmtCash(PAINTS[i].price), () => { const r = buyPaint(i); if (r === 'OK') { setPaint(i); flash('BOUGHT · ' + PAINTS[i].name, 1300, '#ffd21f'); audio.beep(1320, 0.2); } else flash(r, 1000); garageRefresh(); });
  });
  document.querySelectorAll('#g-tabs button').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); document.querySelectorAll('#g-tabs button').forEach(x => x.classList.toggle('on', x === b)); for (const t of ['parts', 'paint', 'cars', 'career']) $('g-' + t).classList.toggle('hidden', t !== b.dataset.t); }));
  window.garageOpen = () => { garageRefresh(); document.body.classList.add('garage'); gEl.classList.remove('hidden'); prevCam = st.cam; st.cam = 4; st.snapCam = true; garageEnter(); };
  window.garageClose = () => { document.body.classList.remove('garage'); gEl.classList.add('hidden'); st.cam = prevCam; st.snapCam = true; garageLeave(); };
  $('garage-btn').addEventListener('click', e => { e.stopPropagation(); garageOpen(); });
  $('g-close').addEventListener('click', e => { e.stopPropagation(); garageClose(); });
  $('g-signin').addEventListener('click', e => { e.stopPropagation(); cloud.signIn(); });
  $('g-name').addEventListener('click', e => { e.stopPropagation(); nameOpen(false); });
  $('g-cars').addEventListener('click', e => {
    if (e.target.closest('#g-preview-back')) { e.stopPropagation(); garagePreviewClear(); garageRefresh(); return; }
    const b = e.target.closest('[data-drive],[data-buycar]');
    if (b) { e.stopPropagation();
      if (b.dataset.drive) { garagePreviewClear(); carSelect(b.dataset.drive, true); garageRefresh(); return; }
      const id = b.dataset.buycar, C = CARS[id];
      if (career.cash < C.price) { flash('NOT ENOUGH MONEY', 1200); return; }
      confirmAsk('BUY THIS?', 'LAMBORGHINI ' + C.name + ' · ' + fmtCash(C.price), () => { const r = buyCar(id); if (r === 'OK') { flash('BOUGHT · LAMBORGHINI ' + C.name, 1400, '#ffd21f'); garagePreviewClear(); carSelect(id, true); garageRefresh(); } else if (r === 'POOR') flash('NOT ENOUGH MONEY', 1200); });
      return; }
    const card = e.target.closest('[data-view]'); if (!card) return; e.stopPropagation();
    const id = card.dataset.view;
    if (id !== carId && career.cars.includes(id)) { garagePreviewClear(); carSelect(id, true); garageRefresh(); return; }   // already yours: one tap selects it, no preview step needed
    garagePreview(id); garageRefresh();
  });
  gEl.addEventListener('click', e => e.stopPropagation());
  cloud.init(); paintBarLocks(); garageRefresh();
}

// ------------------------------------------------------------------ audio (synthesized V12)
const audio = {
  ctx: null,
  vol: (() => { const v = { cars: 0.45, fx: 0.8, music: 0.8 }; try { const j = JSON.parse(localStorage.getItem('revuelto.vol') || 'null'); if (j) for (const k in v) if (typeof j[k] === 'number') v[k] = clamp(j[k], 0, 1); } catch (e) {} return v; })(),
  setVolume(k, x) { this.vol[k] = clamp(x, 0, 1); try { localStorage.setItem('revuelto.vol', JSON.stringify(this.vol)); } catch (e) {} this.applyVolumes(); },
  applyVolumes() { if (!this.busCars) return; const t = this.ctx.currentTime; this.busCars.gain.setTargetAtTime(this.vol.cars * this.vol.cars * 1.6, t, 0.05); this.busFx.gain.setTargetAtTime(this.vol.fx * this.vol.fx * 1.3, t, 0.05); this.busMusic.gain.setTargetAtTime(this.vol.music * this.vol.music * 2.2, t, 0.05); },
  start() {
    try {
      const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const master = C.createGain(); master.gain.value = 0.7; master.connect(C.destination); this.master = master;
      const comp = C.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.18; comp.connect(master); this.comp = comp;
      // three buses into the limiter: the cars (engines, wind, tyres), the effects (hits, chimes, NOS), the music
      const bus = () => { const g = C.createGain(); g.connect(comp); return g; };
      this.busCars = bus(); this.busFx = bus(); this.busMusic = bus(); this.applyVolumes();
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
      mix.connect(shaper); shaper.connect(lp); lp.connect(howl); howl.connect(body); body.connect(eg); eg.connect(this.busCars);
      // intake
      const ib = C.createBiquadFilter(); ib.type = 'bandpass'; ib.frequency.value = 900; ib.Q.value = 0.7; const ig = C.createGain(); ig.gain.value = 0; noise().connect(ib); ib.connect(ig); ig.connect(this.busCars); this.ig = ig; this.ib = ib;
      // exhaust crackle
      const cb = C.createBiquadFilter(); cb.type = 'bandpass'; cb.frequency.value = 420; cb.Q.value = 1.2; const cg = C.createGain(); cg.gain.value = 0; noise().connect(cb); cb.connect(cg); cg.connect(this.busCars); this.cg = cg;
      // wind
      const wb = C.createBiquadFilter(); wb.type = 'lowpass'; wb.frequency.value = 300; const wg = C.createGain(); wg.gain.value = 0; noise().connect(wb); wb.connect(wg); wg.connect(this.busCars); this.wg = wg; this.wb = wb;
      // tyres
      const tb = C.createBiquadFilter(); tb.type = 'bandpass'; tb.frequency.value = 1500; tb.Q.value = 5; const tg = C.createGain(); tg.gain.value = 0; noise().connect(tb); tb.connect(tg); tg.connect(this.busCars); this.tg = tg; this.tb = tb;
      const ho = C.createOscillator(); ho.type = 'sawtooth'; ho.frequency.value = 240; const hf = C.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 1100; hf.Q.value = 6; const hg = C.createGain(); hg.gain.value = 0; ho.connect(hf); hf.connect(hg); hg.connect(this.busCars); ho.start(); this.ho = ho; this.hg = hg; this.hf = hf;
      // gravel
      const gb = C.createBiquadFilter(); gb.type = 'bandpass'; gb.frequency.value = 2600; gb.Q.value = 0.6; const gg = C.createGain(); gg.gain.value = 0; noise().connect(gb); gb.connect(gg); gg.connect(this.busCars); this.gg = gg;
      // EV whine
      const ev = C.createOscillator(); ev.type = 'sine'; const ev2 = C.createOscillator(); ev2.type = 'triangle'; const evg = C.createGain(); evg.gain.value = 0; ev.connect(evg); ev2.connect(evg); evg.connect(this.busCars); ev.start(); ev2.start(); this.ev = ev; this.ev2 = ev2; this.evg = evg;
      this.load = 0;
      music.start(C, this.busMusic);
    } catch (e) { console.warn('audio unavailable', e); this.ctx = null; }
  },
  nosStart() {
    if (!this.ctx || !st.sound) return; const C = this.ctx, t = C.currentTime; this.nosStop();
    const n = C.createBufferSource(); n.buffer = this.oscs ? this._noiseBuf : null; if (!n.buffer) return; n.loop = true;
    const hp = C.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2800; const g = C.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.05); g.gain.exponentialRampToValueAtTime(0.16, t + 0.5);
    const o = C.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55; const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140; const og = C.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.35, t + 0.08);
    n.connect(hp); hp.connect(g); g.connect(this.busFx); o.connect(lp); lp.connect(og); og.connect(this.busFx); n.start(t); o.start(t);
    this.nosNodes = { n, o, g, og };
  },
  rumbleStart() {
    // drift boost: a low, slow-throbbing rumble that rides under everything until the boost ends
    if (!this.ctx || !st.sound) return; const C = this.ctx, t = C.currentTime; this.rumbleStop();
    const o1 = C.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 41; const o2 = C.createOscillator(); o2.type = 'sine'; o2.frequency.value = 55; const o3 = C.createOscillator(); o3.type = 'square'; o3.frequency.value = 27.5;
    const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 150; lp.Q.value = 1.2;
    const n = C.createBufferSource(); n.buffer = this._noiseBuf; n.loop = true; const nl = C.createBiquadFilter(); nl.type = 'lowpass'; nl.frequency.value = 110; const ng = C.createGain(); ng.gain.value = 0.7;
    const trem = C.createGain(); trem.gain.value = 0.7; const lfo = C.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 5.5; const lg = C.createGain(); lg.gain.value = 0.3; lfo.connect(lg); lg.connect(trem.gain);
    const g = C.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.12);
    o1.connect(lp); o2.connect(lp); o3.connect(lp); n.connect(nl); nl.connect(ng); ng.connect(lp); lp.connect(trem); trem.connect(g); g.connect(this.busFx);
    o1.start(t); o2.start(t); o3.start(t); n.start(t); lfo.start(t);
    this.rumble = { nodes: [o1, o2, o3, n, lfo], g };
  },
  rumbleStop() {
    if (!this.ctx || !this.rumble) return; const C = this.ctx, t = C.currentTime, r = this.rumble; this.rumble = null;
    r.g.gain.cancelScheduledValues(t); r.g.gain.setValueAtTime(r.g.gain.value, t); r.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    for (const x of r.nodes) x.stop(t + 0.4);
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
    o.connect(f); f.connect(g); g.connect(this.busFx); o.start(t); o.stop(t + dur + 0.12);
  },
  ring(n) {
    // a ring: bright and quick, climbing a little with the count
    if (!this.ctx || !st.sound) return; const C = this.ctx, t = C.currentTime, f = 1568 * Math.pow(2, ((n - 1) % 8) / 12);
    for (const [mult, vol] of [[1, 0.28], [2, 0.08]]) { const o = C.createOscillator(), g = C.createGain(); o.type = 'sine'; o.frequency.value = f * mult; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); o.connect(g); g.connect(this.busFx); o.start(t); o.stop(t + 0.3); }
  },
  record() {
    // new top speed: a rising major arpeggio with a shimmer
    if (!this.ctx || !st.sound) return; const C = this.ctx, t = C.currentTime;
    [1046.5, 1318.5, 1568, 2093].forEach((freq, k) => { const t0 = t + k * 0.09; for (const [mult, vol] of [[1, 0.35], [2, 0.08], [3.01, 0.03]]) { const o = C.createOscillator(), g = C.createGain(); o.type = 'sine'; o.frequency.value = freq * mult; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t0 + (k === 3 ? 1.1 : 0.45)); o.connect(g); g.connect(this.busFx); o.start(t0); o.stop(t0 + 1.2); } });
  },
  clang(k) {
    // car on car: a metallic crack on top of the crunch
    if (!this.ctx || !st.sound) return; const C = this.ctx, t = C.currentTime; this.crunch(k * 0.7);
    const n = C.createBufferSource(); n.buffer = this._noiseBuf; const f = C.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1700 + 600 * Math.random(); f.Q.value = 4;
    const g = C.createGain(); g.gain.setValueAtTime(0.5 * k, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12 + 0.2 * k); n.connect(f); f.connect(g); g.connect(this.busFx); n.start(t); n.stop(t + 0.4);
    const o = C.createOscillator(), og = C.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.12); og.gain.setValueAtTime(0.6 * k, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); o.connect(og); og.connect(this.busFx); o.start(t); o.stop(t + 0.3);
  },
  rivalStart(a) {
    // each rival carries a small V12 of its own, mixed by distance
    if (!this.ctx) return; const C = this.ctx;
    const o1 = C.createOscillator(); o1.type = 'sawtooth'; const o2 = C.createOscillator(); o2.type = 'square'; const g2 = C.createGain(); g2.gain.value = 0.25;
    const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2; const g = C.createGain(); g.gain.value = 0;
    o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(this.busCars); o1.start(); o2.start();
    a.snd = { o1, o2, lp, g };
  },
  rivalStop(a) { if (!a.snd) return; try { a.snd.o1.stop(); a.snd.o2.stop(); a.snd.g.disconnect(); } catch (e) {} a.snd = null; },
  boost() {
    if (!this.ctx || !st.sound) return; const C = this.ctx, t = C.currentTime;
    // two bright bings, a fifth apart
    [[1318.5, 0], [1975.5, 0.13]].forEach(([freq, dt0]) => { const t0 = t + dt0; for (const [mult, vol] of [[1, 0.45], [2.76, 0.12], [5.4, 0.05]]) { const o = C.createOscillator(), g = C.createGain(); o.type = 'sine'; o.frequency.value = freq * mult; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32 / Math.sqrt(mult)); o.connect(g); g.connect(this.busFx); o.start(t0); o.stop(t0 + 0.4); } });
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
    { name: 'BLACK ICE · 130', bpm: 130, len: 128, chords: [[45, 48, 52], [41, 45, 48], [38, 41, 45], [40, 44, 47]] },   // Am · F · Dm · E (harmonic minor)
    { name: 'CYBER GOTH · 110', bpm: 110, len: 128, chords: [[40, 43, 47], [36, 40, 43], [43, 47, 50], [38, 42, 45], [40, 43, 47], [45, 48, 52], [36, 40, 43], [47, 50, 54]] },   // Em · C · G · D · Em · Am · C · Bm
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
  lead(freq, t0, dur, vol) {
    // the CYBER GOTH voice: a triangle with two soft detuned saws and a sub octave, through a plucked low-pass, wet into the delay
    const C = this.ctx, f = C.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 2.5; f.frequency.setValueAtTime(3200, t0); f.frequency.exponentialRampToValueAtTime(650, t0 + dur + 0.2);
    const v = C.createGain(); v.gain.setValueAtTime(0.0001, t0); v.gain.exponentialRampToValueAtTime(vol, t0 + 0.015); v.gain.setValueAtTime(vol, t0 + dur); v.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.3);
    f.connect(v); v.connect(this.out); const wet = C.createGain(); wet.gain.value = 0.8; v.connect(wet); wet.connect(this.delay);
    for (const [type, mult, det, g] of [['triangle', 1, 0, 1], ['sawtooth', 1, 7, 0.28], ['sawtooth', 1, -7, 0.28], ['sine', 0.5, 0, 0.45]]) { const o = C.createOscillator(), og = C.createGain(); o.type = type; o.frequency.value = freq * mult; o.detune.value = det; og.gain.value = g; o.connect(og); og.connect(f); o.start(t0); o.stop(t0 + dur + 0.35); }
  },
  riser(t, spb, root) {
    // a noise sweep and a rising tone over the last bar of every 8
    const C = this.ctx;
    const n = C.createBufferSource(); n.buffer = this.noise; const f = C.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(6000, t + spb * 4); const v = C.createGain(); v.gain.setValueAtTime(0.001, t); v.gain.exponentialRampToValueAtTime(0.35, t + spb * 3.9); v.gain.setValueAtTime(0.0001, t + spb * 4); n.connect(f); f.connect(v); v.connect(this.out); n.start(t); n.stop(t + spb * 4.05);
    const o = C.createOscillator(), og = C.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(this.f(root), t); o.frequency.exponentialRampToValueAtTime(this.f(root + 12), t + spb * 4); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.12, t + spb * 3.9); og.gain.setValueAtTime(0.0001, t + spb * 4); o.connect(og); og.connect(this.padGain); o.start(t); o.stop(t + spb * 4.05);
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
        } else if (this.track === 1) {
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
          if (bar === 7 && beat === 0) this.riser(t, spb, root);
        } else if (this.track === 2) {
          // BLACK ICE: 130, harmonic minor. A relentless kick, an octave-jumping sub through the drive, a cold pluck arpeggio,
          // claps with a tail, a drone two octaves down, and an impact at the top of every 4 bars
          const t = this.next, ch = T.chords[bar % 4], root = ch[0], second = bar % 8 >= 4;
          if (beat % 4 === 0 || (bar % 2 === 1 && beat === 14)) this.kick(t, true);
          if (beat === 4 || beat === 12) { this.hit(t, 1400, 0.5, 0.14, 0.6); this.hit(t + 0.02, 2200, 0.28, 0.42, 0.7); }
          if (beat % 2 === 1) this.hit(t, 8500, beat % 4 === 3 ? 0.2 : 0.11, beat % 4 === 3 ? 0.11 : 0.04);
          const pat = [0, 12, 0, 0, 12, 0, 0, 12, 0, 12, 0, 0, 12, 0, 3, 0];
          if (beat !== 6 && beat !== 13) this.bass(this.f(root - 12 + pat[beat]), t, s16 * 0.5, 0.3);
          if (beat === 0 && bar % 4 === 0) this.osc('sine', this.f(root - 24), t, spb * 15, 0.5, this.drive, 0.4, 1.5);
          if (second || beat % 2 === 0) { const arp = [0, 3, 7, 12, 7, 3, 8, 7]; const n = root + 24 + arp[(beat + bar * 2) % 8]; this.osc('triangle', this.f(n), t, 0.06, second ? 0.14 : 0.09, this.delay, 0.002, 0.1); }
          if (beat === 0 || beat === 8) { for (const n of ch) this.osc('sawtooth', this.f(n), t, spb * 1.8, 0.07, this.padGain, 0.02, 0.5, beat === 0 ? -7 : 7); this.padFilter.frequency.setValueAtTime(second ? 2200 : 1100, t); this.padFilter.frequency.exponentialRampToValueAtTime(380, t + spb * 1.8); }
          if (bar % 4 === 0 && beat === 0) { this.hit(t, 200, 0.9, 0.9, 0.5, this.drive); this.hit(t, 6000, 0.35, 0.5, 0.3); }
          if (bar === 7 && beat === 0) this.riser(t, spb, root);
        } else {
          // CYBER GOTH: 110, progressive. Offbeat rolling bass, a kick with ghosted snares late in the phrase, a choir pad
          // with a slow attack that gets gated in the back half, and a written lead in E minor over the eight bars
          // (Em C G D Em Am C Bm): a warm filtered voice, answered an octave down in the second half, bells on the turn
          const t = this.next, ch = T.chords[bar % 8], root = ch[0], open = bar / 8;
          if (beat % 4 === 0) this.kick(t, false);
          if (beat === 4 || beat === 12) { this.hit(t, 1700, 0.42, 0.16, 0.6); this.osc('triangle', 160, t, 0.03, 0.3, null, 0.002, 0.09); }
          if (bar >= 6 && (beat === 7 || beat === 11 || beat === 15)) this.hit(t, 1700, 0.16, 0.08, 0.6);
          if (beat % 2 === 1) this.hit(t, 7800, 0.13, beat % 4 === 3 ? 0.12 : 0.05);
          if (beat % 2 === 1) this.bass(this.f(root - 12 + (beat === 15 ? 7 : 0)), t, s16 * 0.7, 0.26);                      // the offbeat roll
          if (beat === 0) { for (const n of ch) { this.osc('square', this.f(n), t, spb * 3.7, 0.045, this.padGain, 0.9, 0.8, -5); this.osc('sawtooth', this.f(n + 12), t, spb * 3.7, 0.04, this.padGain, 0.9, 0.8, 6); } this.padFilter.frequency.setValueAtTime(600 + 1400 * open, t); this.padFilter.frequency.linearRampToValueAtTime(900 + 1600 * open, t + spb * 4); }
          if (bar >= 4 && beat % 2 === 0) { const g = this.padGain.gain; g.setValueAtTime(0.05, t); g.linearRampToValueAtTime(0.22, t + s16 * 0.6); }   // gate
          const MEL = [[76, 0, 0, 71, 0, 0, 67, 0, 0, 0, 69, 0, 71, 0, 0, 0], [72, 0, 0, 71, 0, 0, 67, 0, 0, 0, 64, 0, 0, 0, 67, 0], [74, 0, 0, 71, 0, 0, 74, 0, 0, 0, 79, 0, 0, 0, 78, 0], [81, 0, 0, 78, 0, 0, 74, 0, 0, 0, 76, 0, 0, 0, 78, 0],
                       [76, 0, 0, 71, 0, 0, 67, 0, 0, 0, 69, 0, 71, 0, 72, 0], [72, 0, 0, 69, 0, 0, 64, 0, 0, 0, 67, 0, 69, 0, 0, 0], [72, 0, 0, 76, 0, 0, 79, 0, 0, 0, 76, 0, 0, 0, 74, 0], [78, 0, 0, 74, 0, 0, 71, 0, 0, 0, 71, 0, 74, 0, 78, 0]];
          const mn = MEL[bar % 8][beat];
          if (mn) { let hold = 1; while (hold < 6 && !MEL[bar % 8][beat + hold] && beat + hold < 16) hold++; const dur = s16 * (hold - 0.35); this.lead(this.f(mn), t, dur, 0.09 + 0.05 * open); if (bar >= 4) this.lead(this.f(mn - 12), t, dur, 0.035); }
          if (beat === 0 && bar % 2 === 0) for (const [mult, vol] of [[1, 0.1], [2, 0.03]]) this.osc('sine', this.f(root + 24) * mult, t, 1.2, vol, null, 0.004, 1.6);   // bell
          if (bar === 7 && beat === 8) this.riser(t, spb / 2, root);
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
  const m = MODES[st.mode], MASS = CAR.mass * TUNE.mass;   // the car as built in the garage
  // input shaping
  const DS = diffNow().player.steer, rate = (Math.abs(inp.steer) > Math.abs(st.steer) ? 5.5 : 9.0) * DS * TUNE.steer;   // quicker steering response; sharper up the levels
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
  if (st.nos <= 0.02) st.nosEmpty = true; else if (st.nos > 0.10) st.nosEmpty = false;   // hysteresis: an empty tank needs a tenth back before it fires again (no flapping at empty)
  if (TRACK.rings && !st.nosOn) st.nos = st.coins >= 10 ? 1 : 0;   // SUPERSONIC: ten rings arm the tank
  const wantNos = inp.nos && !m.ev && st.throttle > 0.2 && !st.nosEmpty && !st.air && (!TRACK.rings || st.coins >= 10 || st.nosOn);   // rings arm it; once lit it runs on the tank
  if (wantNos && !st.nosOn) { audio.nosStart(); if (TRACK.rings) { st.coins = 0; if (st.super) flash('SUPERSONIC OVER', 900); } }
  if (!wantNos && st.nosOn) audio.nosStop();
  st.nosOn = wantNos;
  // drift boost: NOS while sliding is the big one. The tank is charged by drifting (a trickle otherwise)
  // drift boost: NOS while sliding. It fires with a jolt, and it keeps going as long as you hold the drift (the slide
  // charges the tank almost as fast as the boost drains it); straighten up and it falls back to plain NOS
  if (st.nosOn && (st.drift || 0) > 0.5) st.driftBoostT = 0.6; else st.driftBoostT = Math.max(0, (st.driftBoostT || 0) - dt);   // a short bridge over dips in the slide
  const driftBoost = st.nosOn && st.driftBoostT > 0;
  if (driftBoost && !st.driftBoostOn) { flash('DRIFT BOOST', 900, '#b48cff'); audio.beep(1760, 0.18); audio.rumbleStart(); st.u += Math.sign(st.u || 1) * 5.5; st.shake = Math.max(st.shake || 0, 0.55); }   // the jolt
  if (!driftBoost && st.driftBoostOn) audio.rumbleStop();
  st.driftBoostOn = driftBoost;
  const DN = diffNow().nos;
  const charge = 0.012 + (st.drift || 0) * clamp(Math.abs(st.slipAng || 0) / 0.45, 0, 1) * clamp(v / 15, 0, 1) * 0.30;
  if (st.nosOn) { st.nos = Math.max(0, st.nos - dt / 5 * DN.drain / TUNE.nosTank * (driftBoost ? 0.3 : 1) + (driftBoost ? dt * charge * DN.charge * TUNE.nosCharge * 0.8 : 0)); st.glow = Math.max(st.glow || 0, driftBoost ? 1 : 0.9); st.shake = Math.max(st.shake || 0, driftBoost ? 0.2 : 0.12); }
  else st.nos = Math.min(1, st.nos + dt * charge * DN.charge * TUNE.nosCharge);
  // SUPERSONIC mode: twenty rings held raise the fin, light the trail and add 20 %
  const wantSuper = !!TRACK.rings && st.coins >= 20;
  if (wantSuper && !st.super) { flash('SUPERSONIC', 1200, '#2ee6ff'); audio.record(); st.superTrail = trailOn; trailOn = true; trailMesh.visible = true; trailReset(); }
  if (!wantSuper && st.super) { trailOn = st.superTrail; trailMesh.visible = trailOn; }
  st.super = wantSuper;
  const superMul = st.super ? 1.2 : 1;
  const nosMul = (driftBoost ? 2.0 : st.nosOn ? 1.5 : 1) * superMul, DP = diffNow().player;
  const Pe = CAR.powerW * CAR.drivelineEff * m.power * nosMul * DP.power * TUNE.power;
  const Ftrac = MASS * G * CAR.tractionG * (st.offroad ? 0.45 : 1) * (m.ev ? 0.5 : 1) * (st.nosOn ? 1.35 : 1) * DP.grip * TUNE.grip * (TRACK.grip || 1);
  let F = 0;
  if (!st.reverse) {
    F = st.throttle * Math.min(Ftrac, Pe / Math.max(v, 2.5)) * (m.ev ? 1 : torqueFactor(st.rpm));
    if (st.shiftT > 0) F *= 0.08;
    if (st.rpm >= CAR.redline - 20 && !m.ev) F *= 0.12;                   // limiter
    if (m.ev && v > 180 / 3.6) F = 0;
  } else {
    F = -st.brake * Math.min(7000, Pe * 0.25 / Math.max(v, 1)); if (st.u < -8) F = Math.max(F, 0);
  }
  const Fb = (st.reverse ? 0 : st.brake) * MASS * G * CAR.brakeG * TUNE.brake * (TRACK.grip || 1) * (st.offroad ? 0.55 : 1) + (st.hand ? 0.35 * MASS * G : 0);
  const Fd = CAR.dragK * TUNE.drag * st.u * v * (st.super ? 0.8 : 1);
  const Fr = Math.sign(st.u) * (CAR.rolling + (st.offroad ? 1100 + 18 * v : 0));
  const Feb = (!st.reverse && !m.ev && st.throttle < 0.05) ? Math.sign(st.u) * 1800 * (st.rpm / CAR.redline) : 0;
  const fr0 = sampleAt(st.s), slope = fr0.t.y * Math.cos(st.psi) + fr0.b.y * Math.sin(st.psi);   // component of 'up' along the car's forward
  if (st.boostCd > 0) st.boostCd -= dt;
  if (st.boostT > 0) { st.boostT -= dt; F += MASS * 7.5; }                     // booster: +7.5 m/s² for 1.3 s
  if (st.nosOn) F += MASS * (driftBoost ? 7.0 : 3.0);                            // the shove you feel in the seat; a drift boost is a kick
  if (BOOST[fr0.i] && !st.air && !st.roof && st.boostCd <= 0 && st.u > 2) { st.boostT = 1.3; st.boostCd = 0.9; st.glow = 1; audio.boost(); }
  if (BOOST2[fr0.i] && !st.air && !st.roof && st.boost2Cd <= 0 && st.u > 2) { st.u = Math.min(st.u * 1.4, 118); st.boost2Cd = 2.0; st.glow = 1; st.shake = Math.max(st.shake || 0, 0.5); audio.boost(); audio.record(); flash('SUPER BOOST +40%', 900, '#ff3af0'); }
  if (st.boost2Cd > 0) st.boost2Cd -= dt;
  let du = st.air ? 0 : (F - Fd - Fr - Feb) / MASS * dt - G * slope * dt;
  st.u += du;
  const bDecel = st.air ? 0 : Fb / MASS * dt;
  if (v > 0) { if (Math.abs(st.u) <= bDecel) st.u = 0; else st.u -= Math.sign(st.u) * bDecel; }
  if (v < 0.05 && Math.abs(F) < 1) st.u = 0;
  if (GAME.state === 'countdown') { st.u = 0; st.w = 0; }                           // on the grid: rev it, but the lights are red
  // lateral / yaw
  let mu = m.grip * DP.grip * (st.offroad ? 0.42 : 1); if (st.hand) mu *= 0.45;
  const dmax = Math.min(0.70, Math.atan(CAR.wheelbase * 2.3 * mu * G / Math.max(st.u * st.u, 1)));   // more lock at speed: sharper turn-in, the tyres decide when it slides
  st.delta = st.steer * Math.min(0.78, dmax * DS);
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
  if (driftBoost) { mu *= 1.4; wTarget *= 1.35; }                                                                        // the boost hooks up, and the wheel has more say in the slide
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
    st.airT += dt; st.vel.y -= G * (TRACK.gravity || 1) * dt;
    // the gap's road bends: the flight follows most of that bend (a clean, straight take-off lands on line at any speed
    // that clears the gap) and the stick has a little real authority. Angled take-offs and short flights still miss
    const frA = sampleAt(st.s), hv = st.vel.clone(); hv.y = 0;
    const lowG = (TRACK.gravity || 1) < 1, sDotA = hv.dot(frA.t), turn = KAPPA[frA.i] * sDotA * dt + st.steer * 0.35 * dt;   // the flight tracks the road's bend fully: a straight take-off lands on line however long the gap
    if (turn) { const c = Math.cos(turn), sn = Math.sin(turn), vx = st.vel.x, vz = st.vel.z; st.vel.x = vx * c + vz * sn; st.vel.z = -vx * sn + vz * c; hv.set(st.vel.x, 0, st.vel.z); }
    { const bh = frA.b.clone().setY(0).normalize(), latV = hv.dot(bh); st.vel.addScaledVector(bh, -latV * (1 - Math.exp(-dt * (lowG ? 2.4 : 1.6)))); hv.set(st.vel.x, 0, st.vel.z); }   // sideways drift bleeds off: within ~4° of straight lands, sloppier still misses
    st.pos.addScaledVector(st.vel, dt);
    st.s = ((st.s + hv.dot(frA.t) * dt) % trackLen + trackLen) % trackLen; st.d += hv.dot(frA.b) * dt;
    st.d *= Math.exp(-dt * 0.45);   // and the flight pulls you back toward the centreline: a straight take-off lands on line, a wild one still misses
    st.yaw = damp(st.yaw, st.steer * 0.6, 4, dt); st.psi += -st.yaw * dt;
    const frB = sampleAt(st.s), roadY = frB.p.y + frB.b.y * st.d, over = !JUMP[frB.i];
    // tunnel roofs (STRATOS): come down over a tunnel from above and you land on top of it, not inside
    const roofOK = TRACK.roofs && CAVE[frB.i] && Math.abs(st.d) < ROOF_W + 1; st.roofIn = roofOK && (st.roofIn || st.pos.y > roadY + ROOF_H - 0.5);
    const surfY = roadY + (st.roofIn ? ROOF_H : 0), landW = st.roofIn ? ROOF_W : ROAD_HALF;
    st.fwd.lerp(st.vel.clone().normalize(), 1 - Math.exp(-dt * 3)).normalize(); st.up.copy(WORLD_UP); st.right.crossVectors(st.fwd, st.up); st.up.crossVectors(st.right, st.fwd).normalize();
    st.x = st.pos.x; st.y = st.pos.y; st.z = st.pos.z; st.theta = Math.atan2(-st.fwd.z, st.fwd.x); st.trackIdx = frB.i;
    const gone = st.pos.y < roadY - 30 || st.airT > 9 || Math.abs(st.d) > D_WALL + 40;
    if (st.airT > 90) flash('MISSED · RESET', 1400);
    const missed = over && st.pos.y <= surfY + 0.1 && st.vel.y <= 0 && Math.abs(st.d) > landW + 2.2;   // came down beyond the verge: that is a miss (the verge itself is a landing, with a nudge back)
    // just short: in the last 40 m of the gap, no more than 6 m under the lip and on line, you clip the edge and scramble on
    let clipped = false;
    if (!over && st.vel.y <= 0 && st.airT > 0.5 && Math.abs(st.d) < landW + 2.2) {
      const J = JUMPS.find(J => frB.i >= J.i0 && frB.i <= J.i1);
      if (J && frB.i >= J.i1 - 12 && st.pos.y >= roadY - 6) {
        st.s = CUM[(J.i1 + 2) % N]; const fr2 = sampleAt(st.s), cpC = Math.cos(st.psi), spC = Math.sin(st.psi), fwdC = fr2.t.clone().multiplyScalar(cpC).addScaledVector(fr2.b, spC);
        st.u = Math.max(8, st.vel.dot(fwdC) * 0.6); st.w = 0; st.air = false; st.roof = false; st.roofIn = false; st.psi *= 0.5;
        st.d = clamp(st.d, -(landW - 0.5), landW - 0.5); st.shake = 1; audio.crunch(0.7); flash('CLIPPED THE EDGE', 900); syncPose(); clipped = true;
      }
    }
    if (clipped) {}
    else if (!missed && over && st.pos.y <= surfY + 0.1 && st.vel.y <= 0) {
      // touchdown: keep the along-road speed, drop the rest
      const cpB = Math.cos(st.psi), spB = Math.sin(st.psi), fwdB = frB.t.clone().multiplyScalar(cpB).addScaledVector(frB.b, spB);
      st.u = st.vel.dot(fwdB); st.w = st.vel.dot(new THREE.Vector3().crossVectors(fwdB, frB.n)) * 0.5; st.air = false;
      if (Math.abs(st.d) > landW - 0.5) { st.d = Math.sign(st.d) * (landW - 0.5); st.w = 0; st.psi *= 0.5; }   // edge landing: pulled back onto the tarmac
      st.roof = st.roofIn; st.roofIn = false;
      st.d = clamp(st.d, -D_HIT + 0.1, D_HIT - 0.1); st.shake = Math.max(st.shake || 0, clamp(-st.vel.y / 25, 0.15, 1)); audio.crunch(clamp(-st.vel.y / 40, 0.05, 0.5)); flash(st.roof ? 'ON THE ROOF' : 'LANDED', 700); syncPose();
    } else if (missed || gone || (!over && st.pos.y < roadY - 3 && st.airT > 0.6)) {
      // missed the landing (or fell through the gap): straight back to the run-up. Never let it keep falling
      // back to a standing start 480 m before the kicker so the attempt can be repeated with a full run-up
      let back = frB.i, bestD = 1e9; for (const J of JUMPS) { const dI = ((frB.i - J.i0) % N + N) % N; if (dI < 260 && dI < bestD) { bestD = dI; back = J.i0; } }   // the kicker this flight left from
      // 480 m of run-up from a standstill clears any gap in the game, but never reach back onto the previous jump:
      // on a chained course the restart stops just past the earlier landing instead
      { const kick = back, span = Math.round(480 / (trackLen / N)); let k = 1; for (; k <= span; k++) { const i = (kick - k + N) % N; if (JUMP[i]) { k = Math.max(1, k - 10); break; } } back = (kick - Math.min(k, span) + N) % N; }
      placeOnTrack(back); st.resets++; st.hits++; flash('RESET · RUN IT AGAIN', 1400); audio.crunch(0.8); st.shake = 1;
    }
    st.offroad = false; st.slip = 0;
  } else {
  const sDot = (st.u * cp - st.w * sp) / Math.max(0.3, 1 + kap * st.d), dDot = st.u * sp + st.w * cp;
  st.psi += (-st.yaw + kap * sDot) * dt;   // psi > 0 = heading right of the tangent; yaw > 0 = turning left; a left-turning track (kap > 0) leaves the car heading right of it
  st.psi = Math.atan2(Math.sin(st.psi), Math.cos(st.psi));
  st.s = ((st.s + sDot * dt) % trackLen + trackLen) % trackLen;
  st.d += dDot * dt;
  // off the end of a tunnel roof: drop back down onto the road
  if (st.roof && !CAVE[sampleAt(st.s).i]) {
    const fr1 = sampleAt(st.s), f1 = fr1.t.clone().multiplyScalar(cp).addScaledVector(fr1.b, sp), hor = f1.clone().setY(0).normalize();
    st.vel.copy(hor).multiplyScalar(st.u); st.vel.y = Math.max(0, st.u * f1.y);   // signed: backing off the roof drops you too
    syncPose(); st.roof = false; st.roofIn = false; st.air = true; st.airT = 0; flash('DROP IN', 600);
  }
  // take-off: leaving the road at a gap. The kicker lip gives at least a 12° launch so the arc is real
  if (!st.air && JUMP[sampleAt(st.s).i] && st.u > 3) {
    const fr1 = sampleAt(st.s), f1 = fr1.t.clone().multiplyScalar(cp).addScaledVector(fr1.b, sp);
    const pitch = Math.max(Math.asin(clamp(f1.y, -1, 1)), 0.21), hor = f1.clone().setY(0).normalize();
    st.vel.copy(hor).multiplyScalar(st.u * Math.cos(pitch)); st.vel.y = st.u * Math.sin(pitch);
    st.vel.addScaledVector(new THREE.Vector3().crossVectors(f1, fr1.n), st.w);
    syncPose(); st.air = true; st.airT = 0; flash('AIR', 600);
  }
  // boundary walls: speed retained = 1 - 0.85·sin(impact angle); lateral bounce with 0.35 restitution; the wall straightens the car
  if (st.hitT > 0) st.hitT -= dt;
  const dLim = st.roof ? ROOF_W : D_HIT;   // on a roof the deck edge is the wall
  if (!st.air && Math.abs(st.d) > dLim) {
    const sideW = Math.sign(st.d), vn = Math.abs(dDot), phi = Math.atan2(vn, Math.abs(st.u) + 0.1);
    const retain = TRACK.softWalls || st.roof ? 1 : clamp(1 - 0.85 * Math.sin(phi) - 0.02, 0.12, 1);   // soft walls (STRATOS) keep you on the rail without taking speed
    if (st.hitT <= 0) { st.hits++; st.hitT = 0.25; const k = clamp(vn / 12, 0.1, 1); if (TRACK.softWalls) audio.beep(440, 0.05); else { audio.crunch(k); if (k > 0.25) flash('WALL', 500); } st.shake = Math.max(st.shake || 0, TRACK.softWalls ? k * 0.3 : k); }
    st.u *= retain; st.w = -st.w * 0.35; st.psi = -sideW * Math.abs(st.psi) * 0.4; st.yaw *= 0.3;
    st.d = sideW * (dLim - 0.02);
  }
  if (RING_AT) { const i0 = sampleAt(st.s).i; for (let k = -1; k <= 1; k++) { const list = RING_AT[(i0 + k + N) % N]; if (!list) continue; for (const id of list) { const r = COINS[id]; if (!r.alive) continue; if (Math.abs(fwdGap(r.s, st.s)) < 2.8 && Math.abs(st.d - r.d) < 1.9) { r.alive = false; st.coins++; st.score += 10; audio.ring(st.coins); if (st.coins === 10) flash('NOS ARMED', 900, '#b48cff'); } } } }
  if (!st.roof) contacts(dt);
  }
  if (!st.air) syncPose();
  // track relation
  if (!st.air) st.offroad = Math.abs(st.d) > ROAD_HALF + 0.8;
  const p = st.trackIdx / N;
  if (p > 0.45 && p < 0.55) st.halfSeen = true;
  if (st.lastP > 0.92 && p < 0.08 && st.u > 2) {
    const now = performance.now(); st.crossings++; if (RING_AT) ringsRespawn();
    if (st.lapStart != null && st.halfSeen) {
      st.lapLast = now - st.lapStart; st.lapsDone++; GAME.lapTimes.push(st.lapLast);
      if (st.lapBest == null || st.lapLast < st.lapBest) { st.lapBest = st.lapLast; try { localStorage.setItem('revuelto.best.' + TRACK_ID, String(st.lapBest)); } catch (e) {} flash('NEW BEST ' + fmtTime(st.lapBest), 2500); }
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
  if (customWheels) for (const w of customWheels) { w.node.rotation.x += dist / 0.35 * (w.spin || 1); (w.steer || w.node).rotation.y = w.front ? st.delta : 0; }
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
  tronMat.uniforms.uClip.value.set(roofClip.normal.x, roofClip.normal.y, roofClip.normal.z, roofClip.constant);
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
    const sc = (W - 46) / Math.max(maxX - minX, maxZ - minZ);
    const ox = (W - (maxX - minX) * sc) / 2 - minX * sc, oz = (W - 24 - (maxZ - minZ) * sc) / 2 - minZ * sc;
    miniPath = { sc, ox, oz, pts: S.map(p => [p.x * sc + ox, p.z * sc + oz]) };
  }
  c.clearRect(0, 0, W, W);
  c.strokeStyle = 'rgba(244,241,234,0.85)'; c.lineWidth = 5; c.lineJoin = 'round'; c.beginPath();
  miniPath.pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.stroke();
  const s0 = miniPath.pts[0]; c.fillStyle = '#fff'; c.fillRect(s0[0] - 4, s0[1] - 4, 8, 8);
  c.fillStyle = 'rgba(244,241,234,0.9)'; c.font = '700 26px Orbitron, Bahnschrift, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.shadowColor = 'rgba(0,0,0,0.9)'; c.shadowBlur = 8; c.fillText(TRACK.name.split('').join(' '), W / 2, W - 14); c.shadowBlur = 0;   // the world's name along the bottom
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
    { // what you are playing: mode, laps, difficulty, camera
      const parts = [GAME.mode === 'versus' ? 'VERSUS' : GAME.mode === 'time' ? 'TIME TRIAL' : 'SOLO'];
      if (GAME.mode !== 'solo') parts.push(GAME.laps + (GAME.laps === 1 ? ' LAP' : ' LAPS'));
      if (GAME.mode === 'versus') parts.push(DIFFS[GAME.diff].name);
      parts.push(['CHASE', 'CLOSE', 'COCKPIT', 'BUMPER', 'PHOTO'][st.cam] + ' CAM');
      const line = parts.join(' · '); if (line !== st.modeLine) { st.modeLine = line; $('modeline').textContent = line; }
    }
    if (RING_AT) $('ringsv').textContent = st.coins + ' · ' + st.score + ' PTS' + (st.super ? ' · SUPERSONIC' : st.coins >= 10 ? ' · NOS' : '');
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
  if (garage.on) { garageFrame(dt, now); frames++; return; }   // the world waits while the car is in the studio
  const paused = !$('settings').classList.contains('hidden');   // settings open mid-drive: freeze the race, don't just overlay it
  if (st.started && !paused) { acc += dt; while (acc >= FIXED) { step(FIXED); acc -= FIXED; } raceTick(dt); audio.update(dt); }
  car.position.copy(st.pos); car.quaternion.copy(basisQuat(st.fwd, st.up));
  underglow.position.copy(st.pos).addScaledVector(st.up, 0.25);
  st.glow = Math.max(0, (st.glow || 0) - dt * 0.9);
  glowCol.copy(GLOW_BLUE).lerp(GLOW_PURPLE, st.glow);
  underglow.color.copy(glowCol); underglow.intensity = (2.6 + 7 * st.glow) * GLOW_K;
  glowDisc.material.color.copy(glowCol); glowDisc.material.opacity = (0.5 + 0.5 * st.glow) * GLOW_K; glowDisc.scale.setScalar(1 + 0.35 * st.glow);
  gridMat.uniforms.uGlow.value = st.glow;
  tronMat.uniforms.uTime.value = now / 1000; car.updateMatrixWorld(); tronMat.uniforms.uCarInv.value.copy(car.matrixWorld).invert();
  boostMat.color.setHSL(BOOST_HUE, 1, 0.5 + 0.22 * Math.sin(now * 0.008));
  rig.position.copy(car.position); rig.quaternion.copy(car.quaternion); studio.position.copy(car.position);
  trailUpdate();
  gridMat.uniforms.uCar.value.copy(car.position); gridMat.uniforms.uTime.value = now / 1000;
  if (rainMat) rainMat.uniforms.uTime.value = now / 1000;
  if (window.__ringsAnimate) window.__ringsAnimate(now);
  if (superFin) { superFin.scale.y = damp(superFin.scale.y, st.super ? 1 : 0.001, 4, dt); superFin.visible = superFin.scale.y > 0.01; }
  if (window.__fishAnimate) window.__fishAnimate(now);
  if (window.__worldAnimate) window.__worldAnimate(now);
  if (snowfall.pts) { const P = snowfall.pts.geometry.attributes.position, A = P.array, cx = camera.position.x, cy = camera.position.y, cz = camera.position.z, vy = snowfall.up ? 2.2 : -5.5; for (let k = 0; k < A.length; k += 3) { A[k + 1] += vy * dt; A[k] += 1.2 * dt; let dx = A[k] - cx, dy = A[k + 1] - cy, dz = A[k + 2] - cz; if (dy < -60) A[k + 1] += 120; else if (dy > 60) A[k + 1] -= 120; if (dx > 80) A[k] -= 160; else if (dx < -80) A[k] += 160; if (dz > 80) A[k + 2] -= 160; else if (dz < -80) A[k + 2] += 160; } P.needsUpdate = true; }
  if (window.__signAnimate) window.__signAnimate(now);
  if (window.__bannerAnimate) window.__bannerAnimate(now);
  if ((frames & 1) === 0) { car.visible = false; if (mirror) mirror.visible = false; for (const a of ai) a.grp.visible = a.pos.distanceToSquared(st.pos) < 45 * 45; cubeCam.position.copy(st.pos).addScaledVector(st.up, 0.7); cubeCam.update(renderer, scene); car.visible = true; if (mirror) mirror.visible = true; for (const a of ai) a.grp.visible = true; }
  bodyGroup.rotation.z = damp(bodyGroup.rotation.z, st.aLong * 0.004, 8, dt);
  bodyGroup.rotation.x = damp(bodyGroup.rotation.x, st.aLat * 0.006, 8, dt);
  updateCamera(dt);
  sun.position.copy(car.position).addScaledVector(sunDir, 300); sun.target.position.copy(car.position); sun.target.updateMatrixWorld();
  updateHUD();
  if (bloomOn && composer) composer.render(); else renderer.render(scene, camera);
  frames++;
}
resize();
if (snowfall.pts) { const A = snowfall.pts.geometry.attributes.position.array; for (let k = 0; k < A.length; k += 3) { A[k] += st.pos.x; A[k + 1] += st.pos.y + 20; A[k + 2] += st.pos.z; } }
requestAnimationFrame(frame);
loadHide();   // the start screen is ready
window.__sim = { VERSION, career, SHOP, showResults, cloud, nameOpen, nameSubmit, nameValid, standings, TUNE, PRIZE, retune, buyPart, buyPaint, prizeFor, careerSave, careerLoad, ownsPaint, TRACKS, TRACK_ID, TRACK, THEME, CAVE, syncPose, applySteerMode, wheelState, get steerMode() { return steerMode; }, set steerMode(v) { steerMode = v; }, terrainH, nearField, COINS, superFin, touch, readInput, music, audio, announcer, liveryTex, DIFFS, resolveContact, GAME, ai, startRace, raceTick, updateRaceHUD, RIVALS, VLIM, contacts, st, inp, trailUpdate, PAINTS, TUNNELS, PADS, PADS2, KAPPA, CUM, trackLen, LOOP, UNDER, JUMP, ROLL, JUMPS, sampleAt, D_WALL, loadGLBBuffer, installModel, camera, renderer, scene, car, garage, garageEnter, garageLeave, garageRoom, ROOMS, CARS, fitWing, get wingNode() { return wingNode; }, carSelect, buyCar, get carId() { return carId; }, customWheels: () => customWheels, roadMesh, ground, S, T, N, placeOnTrack, step, MODES, CAR, setMode, setPaint, keys, startGame };
}
})();
