// lobby.js -- the first-visit path the other scripts skip (they pre-set revuelto.step=2 and the track): welcome screen ->
// PLAY -> lobby -> pick a world other than the stored one -> NEXT, which builds it in place (no reload). Checks the world
// that comes up is built with ITS road width and walls, not the stored world's. Pairs: stored -> picked.
const { serve, launch } = require('./common');
const PAIRS = process.env.PAIRS ? JSON.parse(process.env.PAIRS) : [['grid', 'arena'], ['arena', 'grid']];
(async () => {
  const { srv, url } = await serve(); let pass = 0;
  for (const [stored, pick] of PAIRS) {
    const b = await launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } }); const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 200)));
    await p.addInitScript(t => { try { if (!sessionStorage.getItem('lobbyInit')) { localStorage.clear(); localStorage.setItem('revuelto.track', t); sessionStorage.setItem('lobbyInit', '1'); } } catch (e) {} }, stored);
    await p.goto(url, { timeout: 300000 });
    await p.waitForFunction(() => window.__lobby && !document.getElementById('next-btn').classList.contains('hidden'), null, { timeout: 300000 });
    await p.evaluate(pick => { if (window.__welcomePlay) window.__welcomePlay(); window.__lobby.lobbyPick(pick); }, pick);
    const linksBefore = await p.evaluate(() => getComputedStyle(document.querySelector('#start p.credit')).visibility);
    await p.click('#next-btn');
    await p.waitForFunction(() => !!window.__sim && (() => { let n = 0; window.__sim.car.traverse(o => { if (o.isMesh) n++; }); return n > 20; })(), null, { timeout: 300000 });
    const linksAfter = await p.evaluate(() => getComputedStyle(document.querySelector('#start p.credit')).visibility);
    const r = await p.evaluate(() => { const s = window.__sim; let maxLim = 0; for (let i = 0; i < 40; i++) maxLim = Math.max(maxLim, s.wallLimitAt(s.trackLen * i / 40));
      const roadHalf = (s.TRACKS[s.TRACK_ID].roadHalf || 6); return { track: s.TRACK_ID, roadHalf, expectedHit: roadHalf + 2.4 - 1.2, maxWallLimit: +maxLim.toFixed(2) }; });
    r.linksBeforeBoot = linksBefore; r.linksAfterBoot = linksAfter;   // GARAGE / SETTINGS are wired in boot(): hidden until then
    const ok = r.track === pick && Math.abs(r.maxWallLimit - r.expectedHit) < 0.05 && linksBefore === 'hidden' && linksAfter === 'visible' && !errs.length; if (ok) pass++;
    console.log((ok ? 'PASS  ' : 'FAIL  ') + stored + ' -> ' + pick + ' :: ' + JSON.stringify(r) + (errs.length ? ' errors: ' + errs.join(' | ') : ''));
    await b.close();
  }
  console.log('SUMMARY ' + pass + '/' + PAIRS.length); srv.close(); process.exit(pass === PAIRS.length ? 0 : 1);
})();
