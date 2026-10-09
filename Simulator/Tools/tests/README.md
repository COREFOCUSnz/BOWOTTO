# LAMBO SIM bench

Playwright scripts that drive the game through `window.__sim` (the exported API), against a built folder
(`dist/hosting` by default; `HOST=path` for another build). Under SwiftShader a frame takes seconds, so nothing here
waits on the wall clock: the scripts call `step()` / `raceTick()` themselves and assert on state.

They used to live in the session scratchpad and were lost when a cloud container was recycled
(2026-10-09). They live here now, committed.

| script | what it checks | time |
|---|---|---|
| `sweep.js` | the main regression: boot, spline, physics bench, drive modes, reset/spin/off-track, paint, shop, career save/load, tuning, Time Trial, Versus, Derby (wrecks, payout, player wreck, cooldown leaves a clean hit unchanged), derby HUD, back to menu, garage, settings pause, wing fit, no NaN | ~6 min |
| `worlds.js [ids]` | every world: boots clean, spline sane, an autopilot drives eight chunks without NaN, leaving the road or falling through it | ~25 min |
| `derby.js` | Destruction Derby on THE ARENA through the real start screens, to the results sheet, plus the player-wrecked path and the arena lap line | ~5 min |
| `bugscan.js` | probes for the first static-scan fixes (gearbox per car, garage re-select, derby spill, cloud merge rule, owed lap, menu input, pause clock) | ~8 min |
| `bugscan2.js` | probes for the round-two fixes (wreck in reverse, Countach top gears, garage roof clip, preview tokens, dropped model, cloud sync, input gate, audio hush) | ~8 min |
| `bugscan3.js` | probes for the third round (BUY dialog, lobby picture, results gate, garage pinch/zoom, touch hand-over, R-reset, records by mode and account, derby double knockout, rival materials and wheels, burnt wrecks, car requests, tail-first laps, render pose, HEALTH labels, legacy record migration) | ~10 min |
| `lobby.js` | the first-visit path every other script skips: welcome -> lobby -> pick a world other than the stored one -> NEXT; checks it is built with its own road width and that GARAGE/SETTINGS appear only once booted | ~4 min |
| `phone.js` | race HUD rects on a touch device in the real game at seven sizes, both steering modes (`SHOTS=prefix` saves PNGs) | ~20 min |
| `layout.js` | the same rects from a script-free copy of `index.html` + `sim.css`, in seconds: iterate CSS here, confirm with `phone.js` | ~5 s |
| `overlaps.py` | reads `phone.js` / `layout.js` output and reports every pair of HUD boxes that overlap | instant |

```
cd Simulator && python3 build.py            # the bench tests the build, not the source
cd Tools/tests
node sweep.js && node bugscan.js && node bugscan2.js && node bugscan3.js && node lobby.js && node derby.js && node worlds.js
node layout.js | python3 overlaps.py         # phone layout, quick
node phone.js  | python3 overlaps.py         # phone layout, real game
```

Each script prints `PASS` / `FAIL` lines, `errors:` (page errors and console errors), and `SUMMARY n/m`, and exits
non-zero on any failure. 4 CPUs: run the browser scripts one at a time.

Traps learned the hard way: probes must set `revuelto.step=2` (common.js does) or the welcome screen blocks boot -- and because every probe pre-sets the stored world, none of them could see a bug in the first-visit lobby path until lobby.js walked it; a
nameless synced career legitimately opens the name box, which then swallows key events; measure car parts in the car's
frame, not world axes; a test that waits for a download must prove the download landed or it proves nothing.
