#!/usr/bin/env node
/* convert-model.js — turn a car model (OBJ / FBX / GLB / GLTF) into revuelto.glb for the sim, no Blender needed.
   Runs Three.js loaders + GLTFExporter inside headless Chromium (Playwright).

     node Simulator/tools/convert-model.js model.fbx Simulator/revuelto.glb [--front=+Z|-Z|+X|-X] [--preview shot.png]

   Loads the model, scales it to 4.947 m long, rests it on the ground, centres it, rotates it so the nose faces +Z
   (the glTF convention the sim expects; --front says which axis the source model's nose faces), tags wheel objects
   (name contains wheel / tyre / tire / rim / brake) as wheel_fl / fr / rl / rr pivots by position, renames paint
   materials (name contains paint / body / exterior) so the sim's P key recolours them, and writes a binary GLB with
   embedded textures. --preview renders the converted car inside the sim's own lighting to a PNG. */
const fs = require('fs'), path = require('path'), os = require('os');
let pw; try { pw = require('playwright'); } catch (e) { try { pw = require('/opt/node22/lib/node_modules/playwright'); } catch (e2) { console.error('playwright not found: npm i -g playwright'); process.exit(1); } }
const args = process.argv.slice(2), opts = { front: '+Z', preview: null }, files = [];
for (let i = 0; i < args.length; i++) { const a = args[i]; if (a.startsWith('--front=')) opts.front = a.slice(8).toUpperCase(); else if (a === '--preview') opts.preview = args[++i]; else files.push(a); }
if (!files.length) { console.error('usage: convert-model.js input.(obj|fbx|glb|gltf) [output.glb] [--front=+Z] [--preview out.png]'); process.exit(1); }
const input = path.resolve(files[0]), output = path.resolve(files[1] || 'revuelto.glb');
const VENDOR = path.resolve(__dirname, '..', 'vendor'), ext = path.extname(input).toLowerCase().slice(1);
const pageHtml = `<!doctype html><meta charset="utf-8"><body>
${['three.min.js', 'fflate.min.js', 'OBJLoader.js', 'FBXLoader.js', 'GLTFLoader.js', 'GLTFExporter.js'].map(f => `<script src="file://${VENDOR}/${f}"></script>`).join('\n')}
<script>
window.convert = async (b64, ext, front) => {
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
  let root;
  if (ext === 'obj') root = new THREE.OBJLoader().parse(new TextDecoder().decode(bin));
  else if (ext === 'fbx') root = new THREE.FBXLoader().parse(bin, '');
  else root = await new Promise((res, rej) => new THREE.GLTFLoader().parse(bin, '', g => res(g.scene), rej));
  const yaw = { '+Z': 0, '-Z': Math.PI, '+X': Math.PI / 2, '-X': -Math.PI / 2 }[front] || 0;
  const wrap = new THREE.Group(); wrap.name = 'REVUELTO'; wrap.add(root); root.rotation.y = yaw; root.updateMatrixWorld(true);
  const meshes = []; root.traverse(o => { if (o.isMesh) meshes.push(o); });
  const box = new THREE.Box3().setFromObject(wrap); let size = box.getSize(new THREE.Vector3());
  const sc = 4.947 / Math.max(size.x, size.z); root.scale.multiplyScalar(sc); root.updateMatrixWorld(true);
  box.setFromObject(wrap); const c = box.getCenter(new THREE.Vector3()); root.position.set(-c.x, -box.min.y, -c.z); root.updateMatrixWorld(true);
  box.setFromObject(wrap); size = box.getSize(new THREE.Vector3());
  let paint = 0;
  for (const m of meshes) for (const mat of (Array.isArray(m.material) ? m.material : [m.material])) {
    if (!mat) continue; const n = (mat.name + ' ' + m.name).toLowerCase();
    if (/paint|body|exterior|carrosserie|carroceria|shell/.test(n) && !/glass|window|interior/.test(n)) { if (!/paint/.test(mat.name.toLowerCase())) mat.name = 'paint_' + (mat.name || 'body'); paint++; if (mat.isMeshStandardMaterial) { mat.metalness = 0.55; mat.roughness = 0.32; } }
  }
  // wheels: prefer explicit group nodes (Wheel_FL, wheel_rr, Wheel_BR ...), else classify wheel-ish meshes by position
  // (nose = +Z, driver's left = -X in a right-handed Y-up frame)
  const groups = { fl: [], fr: [], rl: [], rr: [] };
  const named = [];
  root.traverse(o => { const m = o.name.match(/^wheel[_ -]?(f|b|r)[_ -]?(l|r)$/i); if (m && !o.isMesh) named.push({ node: o, key: (m[1].toLowerCase() === 'f' ? 'f' : 'r') + m[2].toLowerCase() }); });
  if (named.length === 4) for (const n of named) groups[n.key].push(n.node);
  else for (const m of meshes) { const n = m.name.toLowerCase(); if (!/wheel|tyre|tire|rim|brake|caliper|rotor/.test(n) || /steer|light|lamp/.test(n)) continue; const cc = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()); groups[(cc.z > 0 ? 'f' : 'r') + (cc.x < 0 ? 'l' : 'r')].push(m); }
  let wheelParts = 0;
  for (const key in groups) { const objs = groups[key]; if (!objs.length) continue; const bb = new THREE.Box3(); objs.forEach(o => bb.expandByObject(o));
    const pivot = new THREE.Group(); pivot.name = 'wheel_' + key; pivot.position.copy(bb.getCenter(new THREE.Vector3())); wrap.add(pivot); pivot.updateMatrixWorld(true);
    for (const o of objs) pivot.attach(o); wheelParts += objs.length; }
  const glb = await new Promise((res, rej) => new THREE.GLTFExporter().parse(wrap, res, { binary: true, embedImages: true, onlyVisible: true }));
  const bytes = new Uint8Array(glb); let out = ''; for (let i = 0; i < bytes.length; i += 32768) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
  return { glb: btoa(out), meshes: meshes.length, paint, wheelParts, namedWheels: named.length, size: [size.x, size.y, size.z].map(v => +v.toFixed(3)) };
};
</script></body>`;
(async () => {
  const tmp = path.join(os.tmpdir(), 'revuelto-convert.html'); fs.writeFileSync(tmp, pageHtml);
  const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files'] });
  const page = await browser.newPage(); page.on('pageerror', e => console.error('page error:', e.message));
  await page.goto('file://' + tmp);
  const r = await page.evaluate(([b, e, f]) => window.convert(b, e, f), [fs.readFileSync(input).toString('base64'), ext, opts.front]);
  fs.writeFileSync(output, Buffer.from(r.glb, 'base64'));
  console.log(`wrote ${output}: ${r.meshes} meshes, ${r.paint} paint materials, ${r.wheelParts} wheel parts (${r.namedWheels} named wheel groups), ${r.size.join(' x ')} m`);
  if (opts.preview) {
    const sim = path.resolve(__dirname, '..', 'dist', 'revuelto.html');
    const p2 = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await p2.goto('file://' + sim); await p2.waitForTimeout(800); await p2.click('#start-btn'); await p2.waitForTimeout(300);
    await p2.evaluate(([g]) => { const s = window.__sim; s.loadGLBBuffer(Uint8Array.from(atob(g), c => c.charCodeAt(0)).buffer, 'revuelto.glb'); s.st.cam = 4; document.getElementById('help').classList.add('hidden'); }, [r.glb]);
    await p2.waitForTimeout(2500); await p2.screenshot({ path: path.resolve(opts.preview) }); console.log('preview', path.resolve(opts.preview));
  }
  await browser.close();
})();
