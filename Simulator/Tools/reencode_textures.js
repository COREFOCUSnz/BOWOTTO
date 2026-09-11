// reencode_textures.js -- re-encode the images quantize_glb.py extracted (img<N>.png/jpg + images.json) in a browser
// canvas: capped to MAX px on the long side, JPEG q0.82 unless the image actually has alpha or a BLEND/MASK material
// uses it (then PNG). Writes out<N>.<jpg|png> next to them for `quantize_glb.py --images DIR`.
//   node Tools/reencode_textures.js DIR [MAX=1024] [QUALITY=0.82]
const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs = require('fs'), path = require('path');
const dir = process.argv[2], MAX = +process.argv[3] || 1024, Q = +process.argv[4] || 0.82;
(async () => {
  const list = JSON.parse(fs.readFileSync(path.join(dir, 'images.json'), 'utf8'));
  const b = await chromium.launch(); const p = await b.newPage(); let before = 0, after = 0;
  for (const im of list) {
    const ext = im.mime.includes('png') ? 'png' : 'jpg', src = path.join(dir, 'img' + im.index + '.' + ext), buf = fs.readFileSync(src); before += buf.length;
    const data = 'data:' + im.mime + ';base64,' + buf.toString('base64');
    const out = await p.evaluate(async ([data, MAX, Q, forcePng]) => {
      const img = new Image(); img.src = data; await img.decode();
      const k = Math.min(1, MAX / Math.max(img.width, img.height)), w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, w, h);
      let alpha = forcePng; if (!alpha) { const d = g.getImageData(0, 0, w, h).data; for (let i = 3; i < d.length; i += 4 * 7) if (d[i] < 250) { alpha = true; break; } }
      return [img.width, img.height, w, h, alpha, alpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', Q)];
    }, [data, MAX, Q, !!im.alpha]);
    const enc = Buffer.from(out[5].split(',')[1], 'base64');
    // the canvas PNG encoder is fast, not small: an already-optimised PNG comes back bigger, so keep the original then
    const keep = enc.length >= buf.length; after += keep ? buf.length : enc.length;
    for (const e of ['.png', '.jpg']) { try { fs.unlinkSync(path.join(dir, 'out' + im.index + e)); } catch (_) {} }
    if (!keep) fs.writeFileSync(path.join(dir, 'out' + im.index + (out[4] ? '.png' : '.jpg')), enc);
    console.log('img' + im.index, out[0] + 'x' + out[1], '->', out[2] + 'x' + out[3], out[4] ? 'png' : 'jpg', buf.length, '->', enc.length, keep ? '(kept original)' : '', im.name || '');
  }
  console.log('total', before, '->', after); await b.close();
})();
