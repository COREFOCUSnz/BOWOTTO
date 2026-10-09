// phone.js -- the race HUD on a phone in the real game (touch device, derby HUD up), at the sizes below in both steering
// modes; prints one line of HUD rects per layout for overlaps.py. SIZES='[[w,h],...]' to override, SHOTS=prefix to save PNGs.
const { serve, launch, openGame } = require('./common'); const hudRects = require('./hud_rects');
const SIZES = process.env.SIZES ? JSON.parse(process.env.SIZES) : [[360, 740], [390, 844], [430, 932], [667, 375], [800, 360], [844, 390], [932, 430]];
(async () => {
  const { srv, url } = await serve(); const b = await launch();
  for (const [w, h] of SIZES) for (const steer of ['arrows', 'wheel']) {
    const { ctx, page } = await openGame(b, url, { steer, viewport: { width: w, height: h }, context: { hasTouch: true, isMobile: true, deviceScaleFactor: 1 } });
    await page.evaluate(() => { const s = window.__sim, $ = id => document.getElementById(id);
      $('start').classList.add('hidden'); $('paints').classList.add('hidden'); if ($('help')) $('help').classList.add('hidden');
      $('race').classList.remove('hidden'); $('race').classList.add('derby'); document.body.classList.add('racing'); $('damage').classList.remove('hidden');
      s.st.started = true; s.placeOnTrack(200); s.st.u = 40; s.st.rpm = 7000; });
    await page.waitForTimeout(2500);
    const info = await page.evaluate(`(${hudRects.toString()})()`);
    console.log(w + 'x' + h, steer, JSON.stringify(Object.assign({ touch: await page.evaluate(() => document.body.classList.contains('touch')) }, info)));
    if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + w + 'x' + h + '_' + steer + '.png', timeout: 240000 });
    await ctx.close();
  }
  await b.close(); srv.close();
})();
