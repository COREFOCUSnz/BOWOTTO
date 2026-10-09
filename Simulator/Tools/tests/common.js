// common.js -- shared plumbing for the LAMBO SIM bench: a static server for a build folder, a SwiftShader Chromium,
// and a page booted straight into the game with a known career. Every script here drives the game through
// window.__sim rather than by wall clock: frames take seconds under SwiftShader, so anything timed in real time lies.
const http = require('http'), fs = require('fs'), path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }

const HOST = process.env.HOST ? path.resolve(process.env.HOST) : path.resolve(__dirname, '../../dist/hosting');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webm': 'video/webm', '.mp4': 'video/mp4', '.ico': 'image/x-icon' };

function serve(dir = HOST) {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      const f = path.join(dir, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
      fs.stat(f, (err, stt) => {
        if (err || !stt.isFile()) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Content-Length': stt.size });
        fs.createReadStream(f).pipe(res);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, url: 'http://127.0.0.1:' + srv.address().port + '/' }));
  });
}

const launch = () => pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });

// open the game on a track with a career, skipping the welcome screen (revuelto.step=2), and wait for the car model
async function openGame(browser, url, { track = 'salt', career = { name: 'OTTO', cash: 4000000, cars: ['revuelto'], paints: [0, 1], updated: 1 }, steer = null, viewport = { width: 1280, height: 760 }, context = {} } = {}) {
  const ctx = await browser.newContext(Object.assign({ viewport }, context)); const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 200)));
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/ERR_TUNNEL|fonts\.googleapis|Failed to load resource|404/.test(t)) errs.push('CONSOLE ' + t.slice(0, 180)); });
  await page.addInitScript(({ track, career, steer }) => { try {
    localStorage.setItem('revuelto.track', track); localStorage.setItem('revuelto.step', '2');
    if (career) localStorage.setItem('revuelto.career', JSON.stringify(career)); if (steer) localStorage.setItem('revuelto.steer', steer);
  } catch (e) {} }, { track, career, steer });
  await page.goto(url, { timeout: 300000 });
  await page.waitForFunction(() => !!window.__sim, null, { timeout: 300000 });
  await page.waitForFunction(() => { let n = 0; window.__sim.car.traverse(o => { if (o.isMesh) n++; }); return n > 20; }, null, { timeout: 300000 });
  return { ctx, page, errs };
}

// run named checks; each fn runs in the page and returns { ok, info }
function checker(page) {
  const results = [];
  const run = async (name, fn, arg) => {
    try { const r = await page.evaluate(fn, arg); results.push([r && r.ok ? 'PASS' : 'FAIL', name, JSON.stringify(r && r.info !== undefined ? r.info : r)]); }
    catch (e) { results.push(['ERROR', name, e.message.slice(0, 240)]); }
  };
  const report = (errs) => {
    for (const r of results) console.log(r[0].padEnd(5), r[1], '::', r[2]);
    const pass = results.filter(r => r[0] === 'PASS').length;
    console.log('errors:', errs && errs.length ? errs.join(' | ') : 'none'); console.log('SUMMARY ' + pass + '/' + results.length);
    return pass === results.length && !(errs && errs.length);
  };
  return { run, results, report };
}

module.exports = { pw, HOST, serve, launch, openGame, checker };
