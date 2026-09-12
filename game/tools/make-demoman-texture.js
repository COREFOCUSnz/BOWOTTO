// Paint the Demoman's texture: sixteen horizontal bands, one per swatch row in
// tools/make-demoman.js. Each primitive samples the middle of its band, so the
// bands carry the colour and a little noise rather than any real layout — this
// is a generated character, not an unwrapped one.
//
//   node tools/make-demoman-texture.js [outDir]
const fs = require('fs'), path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const OUT = process.argv[2] || path.join(__dirname, '..', 'assets', 'models');
const W = 64, ROWS = 16, RH = 16, H = ROWS * RH;

// Row order must match SWATCH in make-demoman.js.
const BANDS = [
  ['skin', '#b07a55', '#8c5c3c'],
  ['jacket', '#3d4a35', '#2c3627'],          // olive flak jacket
  ['jacketDark', '#28311f', '#1b2216'],
  ['trousers', '#2f3540', '#22262e'],
  ['boot', '#241d18', '#17120f'],
  ['belt', '#4a3524', '#33241a'],
  ['strap', '#5a4028', '#3e2c1c'],
  ['metal', '#6b7076', '#4a4e53'],
  ['cap', '#1d1f22', '#121315'],             // black knit cap
  ['patch', '#141414', '#0a0a0a'],           // eyepatch and its strap
  ['grenade', '#4b5230', '#343a22'],
  ['shirt', '#7a6a52', '#5c5040'],
  ['glove', '#3a2b1d', '#281e14'],
  ['beard', '#2a1d14', '#1a120c'],
  ['eye', '#e8e2d6', '#b9b2a4'],
  ['gold', '#b8912f', '#8a6c22'],
];

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  await page.setContent('<body></body>');
  const data = await page.evaluate(({ W, H, RH, BANDS }) => {
    const c = new OffscreenCanvas(W, H);
    const g = c.getContext('2d');
    let seed = 7;
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    BANDS.forEach((b, i) => {
      const y = i * RH;
      const grad = g.createLinearGradient(0, y, 0, y + RH);
      grad.addColorStop(0, b[1]); grad.addColorStop(1, b[2]);
      g.fillStyle = grad; g.fillRect(0, y, W, RH);
      // a little grain so flat surfaces are not perfectly flat
      for (let k = 0; k < W * RH * 0.35; k++) {
        const x = (rnd() * W) | 0, yy = y + ((rnd() * RH) | 0);
        g.fillStyle = `rgba(${rnd() > 0.5 ? 255 : 0},${rnd() > 0.5 ? 255 : 0},${rnd() > 0.5 ? 255 : 0},0.045)`;
        g.fillRect(x, yy, 1, 1);
      }
    });
    return c.convertToBlob({ type: 'image/jpeg', quality: 0.92 }).then(async (blob) => {
      const u8 = new Uint8Array(await blob.arrayBuffer());
      let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
      return btoa(s);
    });
  }, { W, H, RH, BANDS });
  await browser.close();

  const file = 'demoman_body.jpg';
  const bytes = Buffer.from(data, 'base64');
  fs.writeFileSync(path.join(OUT, file), bytes);

  const mf = path.join(OUT, 'models.json');
  const manifest = JSON.parse(fs.readFileSync(mf, 'utf8'));
  manifest.textures = manifest.textures || {};
  manifest.textures['demoman::demoman_body'] = file;
  fs.writeFileSync(mf, JSON.stringify(manifest, null, 1));
  console.log(`${file}: ${W}x${H}, ${(bytes.length / 1024).toFixed(1)}KB, ${BANDS.length} bands`);
})().catch((e) => { console.error(e); process.exit(1); });
