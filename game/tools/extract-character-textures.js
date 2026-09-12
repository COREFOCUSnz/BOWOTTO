// Pull the base-colour and emissive maps for characters produced by
// extract-character.js, downscale them through headless Chromium, and merge the
// mapping into models.json. Materials with no texture get a solid colour swatch.
//   node tools/extract-character-textures.js <source.glb> <name> [outDir]
const fs = require('fs'), path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { load, pngSize } = require('./glb.js');

const SRC = process.argv[2], NAME = process.argv[3];
const OUT = process.argv[4] || path.join(__dirname, '..', 'assets', 'models');
const MAX = 512;

(async () => {
  const g = load(SRC); const J = g.json;
  const jobs = JSON.parse(fs.readFileSync(path.join(OUT, NAME + '.texjobs.json'), 'utf8'));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  await page.setContent('<body></body>');

  const shrink = async (buf, mime) => page.evaluate(async ({ b64, mime, MAX }) => {
    const bin = atob(b64); const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([u8], { type: mime }));
    const s = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
    const cw = Math.max(1, Math.round(bmp.width * s)), ch = Math.max(1, Math.round(bmp.height * s));
    const c = new OffscreenCanvas(cw, ch); const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bmp, 0, 0, cw, ch);
    const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
    const out = new Uint8Array(await blob.arrayBuffer());
    let str = ''; for (let i = 0; i < out.length; i++) str += String.fromCharCode(out[i]);
    return { data: btoa(str), w: cw, h: ch, src: bmp.width + 'x' + bmp.height };
  }, { b64: buf.toString('base64'), mime, MAX });

  const solid = async (rgba) => page.evaluate(async ({ rgba }) => {
    const c = new OffscreenCanvas(8, 8); const ctx = c.getContext('2d');
    ctx.fillStyle = `rgb(${Math.round((rgba[0] || 0) * 255)},${Math.round((rgba[1] || 0) * 255)},${Math.round((rgba[2] || 0) * 255)})`;
    ctx.fillRect(0, 0, 8, 8);
    const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
    const out = new Uint8Array(await blob.arrayBuffer());
    let str = ''; for (let i = 0; i < out.length; i++) str += String.fromCharCode(out[i]);
    return { data: btoa(str), w: 8, h: 8, src: 'flat' };
  }, { rgba });

  const base = {}, emis = {};
  let total = 0;
  const write = (res, file) => { const b = Buffer.from(res.data, 'base64'); fs.writeFileSync(path.join(OUT, file), b); total += b.length; return b.length; };
  for (const [mat, job] of Object.entries(jobs)) {
    const safe = NAME + '_' + mat.replace(/[^A-Za-z0-9]+/g, '_').slice(0, 28);
    if (job.base !== null && job.base !== undefined) {
      const im = J.images[job.base];
      const res = await shrink(g.bufferView(im.bufferView), im.mimeType || 'image/png');
      const f = safe + '_c.jpg'; const n = write(res, f); base[mat] = f;
      console.log(`  ${mat.slice(0, 32).padEnd(34)} base ${res.src} -> ${res.w}x${res.h} ${(n / 1024) | 0}KB`);
    } else {
      const res = await solid(job.baseColor || [0.5, 0.5, 0.5, 1]);
      const f = safe + '_c.jpg'; write(res, f); base[mat] = f;
      console.log(`  ${mat.slice(0, 32).padEnd(34)} base flat ${JSON.stringify(job.baseColor)}`);
    }
    if (job.emissive !== null && job.emissive !== undefined) {
      const im = J.images[job.emissive];
      const res = await shrink(g.bufferView(im.bufferView), im.mimeType || 'image/png');
      const f = safe + '_e.jpg'; const n = write(res, f); emis[mat] = f;
      console.log(`  ${''.padEnd(34)} emis ${res.src} -> ${res.w}x${res.h} ${(n / 1024) | 0}KB`);
    }
  }
  await browser.close();

  const mf = path.join(OUT, 'models.json');
  const manifest = fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, 'utf8')) : {};
  // Scope keys per model: material names are not unique across sources, and an
  // unscoped key lets one import silently overwrite another's textures.
  const scope = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [NAME + '::' + k, v]));
  manifest.textures = Object.assign({}, manifest.textures, scope(base));
  manifest.emissive = Object.assign({}, manifest.emissive, scope(emis));
  fs.writeFileSync(mf, JSON.stringify(manifest, null, 1));
  fs.unlinkSync(path.join(OUT, NAME + '.texjobs.json'));
  console.log(`${NAME}: ${Object.keys(base).length} base + ${Object.keys(emis).length} emissive, ${(total / 1024).toFixed(0)}KB\n`);
})().catch((e) => { console.error(e); process.exit(1); });
