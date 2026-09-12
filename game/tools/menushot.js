// Screenshot a menu screen. node tools/menushot.js out.png <keys...>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const [out = '/tmp/m.png', ...keys] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 900, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto((process.env.GAME_URL || 'http://localhost:8099/index.html') + '?v=' + Date.now());
  await p.waitForFunction(() => window.__game && document.getElementById('loading').hidden, null, { timeout: 30000 });
  for (const k of keys) { await p.evaluate((k) => window.__menuSelect(k), k); await p.waitForTimeout(120); }
  await p.waitForTimeout(400);
  await p.screenshot({ path: out, fullPage: false });
  const scrollH = await p.evaluate(() => { const l = document.querySelector('#menu .list'); return l ? [l.scrollHeight, l.clientHeight] : null; });
  await b.close();
  console.log('wrote', out, 'panel scroll', JSON.stringify(scrollH), errs.length ? 'ERRORS ' + errs.join('|') : '');
})();
