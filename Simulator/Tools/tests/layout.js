// layout.js -- the same HUD rects as phone.js in milliseconds: a script-free copy of index.html + sim.css (same DOM and CSS,
// no WebGL), filled with representative text. Rects match the real game (the readout's width follows the speed digits; the
// harness uses three, the wide case). Use it to iterate on CSS, then confirm with phone.js. SIZES / SHOTS as phone.js.
const fs = require('fs'), os = require('os'), path = require('path'); const { pw } = require('./common'); const hudRects = require('./hud_rects');
const SRC = path.resolve(__dirname, '../..'); const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lambo-layout-'));
fs.writeFileSync(path.join(DIR, 'index.html'), fs.readFileSync(path.join(SRC, 'index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''));
fs.copyFileSync(path.join(SRC, 'sim.css'), path.join(DIR, 'sim.css'));
const SIZES = process.env.SIZES ? JSON.parse(process.env.SIZES) : [[360, 740], [390, 844], [430, 932], [667, 375], [800, 360], [844, 390], [932, 430]];
(async () => {
  const b = await pw.chromium.launch();
  for (const [w, h] of SIZES) for (const steer of ['arrows', 'wheel']) {
    const p = await b.newPage({ viewport: { width: w, height: h } }); await p.goto('file://' + DIR + '/index.html');
    await p.evaluate(steer => { const $ = id => document.getElementById(id);
      document.body.classList.add('touch', 'racing'); if (steer === 'wheel') document.body.classList.add('wheelsteer');
      $('touch').classList.add('on'); if (steer === 'wheel') $('touch').classList.add('wheel');
      for (const id of ['start', 'welcome', 'namebox', 'settings', 'garage', 'results', 'help', 'paints']) if ($(id)) $(id).classList.add('hidden');
      $('race').classList.remove('hidden'); $('race').classList.add('derby'); $('damage').classList.remove('hidden');
      for (const [id, t] of [['race-pos', 'P4'], ['race-lap', '1 / 3'], ['race-time', '0:00.000'], ['spd', '143'], ['gear', '3'], ['gearlbl', 'AUTO'], ['mode-name', 'STRADA']]) if ($(id)) $(id).textContent = t;
    }, steer);
    const info = await p.evaluate(`(${hudRects.toString()})()`);
    console.log(w + 'x' + h, steer, JSON.stringify(info));
    if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + w + 'x' + h + '_' + steer + '.png' });
    await p.close();
  }
  await b.close(); fs.rmSync(DIR, { recursive: true, force: true });
})();
