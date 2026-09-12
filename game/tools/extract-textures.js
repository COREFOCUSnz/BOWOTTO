// Pull the PNG textures out of the source GLB, downscale them and re-encode as
// JPEG using headless Chromium (no image libraries are reachable offline).
//   node tools/extract-textures.js <source.glb> [outDir]
const fs = require('fs'), path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { load, pngSize } = require('./glb.js');

const SRC = process.argv[2];
const OUT = process.argv[3] || path.join(__dirname, '..', 'assets', 'models');
// material name -> { max edge, jpeg quality }
const SMALL = new Set(['eyeball_l', 'eyeball_r', 'sniper_lens', 'medals', 'mask_spy']);
const DROP = new Set(['c_arrow', 'material_0', 'w_rocket01']);

(async () => {
  const g = load(SRC); const J = g.json;
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  await page.setContent('<body></body>');

  const matTex = {}; const done = new Map(); let total = 0;
  for (const m of J.materials) {
    if (DROP.has(m.name)) continue;
    const bct = m.pbrMetallicRoughness && m.pbrMetallicRoughness.baseColorTexture;
    if (!bct) continue;
    const imgIdx = J.textures[bct.index].source;
    const maxEdge = SMALL.has(m.name) ? 256 : 512;
    const key = imgIdx + '@' + maxEdge;
    if (done.has(key)) { matTex[m.name] = done.get(key); continue; }
    const png = g.bufferView(J.images[imgIdx].bufferView);
    const [w, h] = pngSize(png) || [0, 0];
    const res = await page.evaluate(async ({ b64, maxEdge }) => {
      const bin = atob(b64); const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([u8], { type: 'image/png' }));
      const s = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
      const cw = Math.max(1, Math.round(bmp.width * s)), ch = Math.max(1, Math.round(bmp.height * s));
      const c = new OffscreenCanvas(cw, ch); const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bmp, 0, 0, cw, ch);
      const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let out = ''; for (let i = 0; i < buf.length; i++) out += String.fromCharCode(buf[i]);
      return { data: btoa(out), w: cw, h: ch };
    }, { b64: png.toString('base64'), maxEdge });
    const file = `tex_${imgIdx}_${res.w}x${res.h}.jpg`;
    const bytes = Buffer.from(res.data, 'base64');
    fs.writeFileSync(path.join(OUT, file), bytes); total += bytes.length;
    done.set(key, file); matTex[m.name] = file;
    console.log(`${m.name.padEnd(22)} img${imgIdx} ${w}x${h} -> ${res.w}x${res.h}  ${(bytes.length/1024).toFixed(0)}KB`);
  }
  await browser.close();
  const mf = path.join(OUT, 'models.json');
  const manifest = JSON.parse(fs.readFileSync(mf, 'utf8'));
  manifest.textures = matTex;
  fs.writeFileSync(mf, JSON.stringify(manifest, null, 1));
  console.log(`\n${done.size} textures, ${(total/1048576).toFixed(2)} MB total`);
})().catch((e) => { console.error(e); process.exit(1); });
