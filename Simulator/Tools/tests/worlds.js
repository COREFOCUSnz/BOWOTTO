// worlds.js [ids...] -- every world: boots clean, spline sane, and an autopilot drives eight chunks of it without NaN,
// leaving the road, or falling through it (was scratchpad sweepW.js). One page load per world: the page rebuilds per track.
const { serve, launch, openGame } = require('./common');
const ALL = ['grid', 'matrix', 'canyon', 'supersonic', 'woods', 'snow', 'ocean', 'sky', 'city', 'volcano', 'ice', 'docks', 'station', 'riviera', 'touge', 'salt', 'mars', 'jungle', 'arena'];
const IDS = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
(async () => {
  const { srv, url } = await serve(); let clean = 0;
  for (const id of IDS) {
    let line; const b = await launch();   // a fresh browser per world: twelve worlds in one SwiftShader browser exhausted it (2026-10-09) and every later world failed to open
    try {
      const { ctx, page, errs } = await openGame(b, url, { track: id, viewport: { width: 900, height: 560 } });
      const r = await page.evaluate(() => {
        const s = window.__sim, st = s.st; const out = { track: s.TRACK_ID, N: s.N, len: +s.trackLen.toFixed(0) };
        let bad = 0; for (let i = 0; i < s.N; i++) { const q = s.S[i]; if (![q.x, q.y, q.z].every(Number.isFinite)) bad++; } out.badPts = bad;
        const at = (idx, u) => { st.lastP = 0.5; s.placeOnTrack(idx); st.u = u; s.syncPose(); };
        // learn which way +steer moves d on this build, then drive with a PD controller on (d, psi)
        at(Math.floor(s.N * 0.3), 25); Object.assign(s.inp, { throttle: 0.5, brake: 0, hand: false, nos: false, steer: 1 }); const d0 = st.d; for (let i = 0; i < 60; i++) s.step(1 / 120); const sign = st.d > d0 ? 1 : -1;
        let maxD = 0, nanAt = null, fellAt = null, worst = 0, steps = 0;
        for (let k = 0; k < 8; k++) {
          const start = Math.floor(s.N * (k + 0.1) / 8); at(start, 30); let below = 0;
          for (let i = 0; i < 120 * 3; i++) {
            s.inp.throttle = st.u < 45 ? 0.7 : 0; s.inp.brake = 0; s.inp.steer = Math.max(-1, Math.min(1, -sign * (0.35 * st.d + 1.6 * st.psi)));
            s.step(1 / 120); steps++;
            if (![st.x, st.y, st.z, st.u, st.d, st.s].every(Number.isFinite)) { nanAt = { k, i }; break; }
            const lim = st.roof ? 99 : s.wallLimitAt(st.s); maxD = Math.max(maxD, Math.abs(st.d) - lim); worst = Math.max(worst, Math.abs(st.d));
            const road = s.S[st.trackIdx] ? s.S[st.trackIdx].y : st.y; if (!st.air && st.y < road - 3) { if (++below > 60) { fellAt = { k, i, y: +st.y.toFixed(1), road: +road.toFixed(1) }; break; } } else below = 0;
          }
          if (nanAt || fellAt) break;
        }
        Object.assign(s.inp, { throttle: 0, steer: 0 });
        Object.assign(out, { steerSign: sign, steps, overWall: +maxD.toFixed(2), maxAbsD: +worst.toFixed(1), nanAt, fellAt });
        out.ok = bad === 0 && !nanAt && !fellAt && maxD <= 0.5;
        return out;
      });
      const ok = r.ok && !errs.length; if (ok) clean++;
      line = (ok ? 'PASS  ' : 'FAIL  ') + id + ' :: ' + JSON.stringify(r) + (errs.length ? ' errors: ' + errs.join(' | ') : '');
      await ctx.close();
    } catch (e) { line = 'ERROR ' + id + ' :: ' + e.message.slice(0, 200); }
    await b.close().catch(() => {}); console.log(line);
  }
  console.log('SUMMARY ' + clean + '/' + IDS.length + ' worlds clean');
  srv.close(); process.exit(clean === IDS.length ? 0 : 1);
})();
