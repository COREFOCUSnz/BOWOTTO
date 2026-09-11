# Session state — 2026-08-31 (GitHub CI cracked; v0.3.1 released for Otto)

**v0.3.1 tagged and RELEASED on GitHub with working Windows + macOS CI.**
Repo: https://github.com/COREFOCUSnz/BOWOTTO (SSH auth from this Mac).
Release v0.3.1 assets: The-Bowotto-Windows-VST3.zip (Otto's download) and
The-Bowotto-macOS.zip. **All 23 bench tests pass ON THE WINDOWS RUNNER** —
the bench now runs as a required CI gate on both platforms.

## 2026-08-31 session — the CI war, won by probing instead of guessing
Every previous GitHub Actions attempt (Corey's manual ones and two of mine)
failed. Three wrong guesses: `-G Ninja` + `cl` (no MSVC env; historic runs
also grabbed stray MinGW gcc → the old `memset/strlen not declared` errors —
JUCE 8 dropped MinGW), `-G "Visual Studio 17 2022"` (not on the image!),
`Ninja Multi-Config` (same missing env). Locked out of run logs (API needs
repo admin, no gh CLI on this Mac), so wrote `win-diag.yml`: a probe workflow
on branch `ci-diag-setup` that runs on the real runner and force-pushes its
findings to branch `ci-diag-results` — readable via plain git fetch.
**Probe facts:** windows-latest = `win25-vs2026` image, ONLY Visual Studio 18
2026 installed (why VS17 pinning died); default generator (no `-G`) works;
no choco needed; artefacts at `build/TheBowotto_artefacts/Release/VST3/`;
Windows `.vst3` is a folder-bundle (zip it or the download is a bare
`Contents`); bench 23/23 green on Windows. Final workflow: no `-G`, bench as
gate on both platforms, `if-no-files-found: error`, `permissions: contents:
write` (new repos default read-only — release job silently can't publish
without it). Also: `BOWOTTO_COPY_AFTER_BUILD` CMake option (ON locally, OFF
in CI). v0.3.1 tag deleted + re-pushed at the fixed commit to publish the
release. **This workflow is the template for the rest of the ORION suite.**

Also this session: v0.3.1 = knob value popups hidden + default GAIN 35→20;
GitHub repo created, SSH key set up, history merged with remote's initial
commit. Still open: Corey's ear pass (nothing tuned by ear yet), morph
crossfade loudness bump (README known item), Otto's real-world PC test.

# Previous session state — 2026-08-26 (pedalboard redesign)

**v0.2.1 + pedalboard UI, tuner, phaser, chorus.** Full history in README. Building: 22/22 tests pass.

## The story so far
1. v0.1.0: built from empty folder, one session. Deployed.
2. UI v1 rejected ("looks horrible, make it more like TOA/VULTURE"). Rebuilt
   in family chassis. Verdict: "way better."
3. v0.2.0: Corey — "morph gets quiet, sounds like nothing good." Root cause:
   violin path never gained ~30dB the guitar path picks up through the amp,
   AND a body filter over a decaying pluck is only ever an EQ, since a real
   bowed string sustains and its bridge force is a sawtooth (~1/n, -6dB/oct).
   Added BowDrive (sustainer + asymmetric saturation) — fixes both at once.
4. v0.2.1 (this session): Corey said "do tests." Wrote 7 NEW tests instead of
   just re-running the old 17 — mono, chords, BOW range, BODY selector,
   bypass, latency, parameter slams. **3 failed immediately:**
   - **The real one:** every FRESH plugin instance was silently broken.
     Smoothers default to 0 and ramp in; `VintageAmp::shape()` divides by
     `tanh(drive)`, so drive passing through exactly 0 on first load = literal
     0/0 NaN, permanent in the DC blockers' IIR memory. Every host, every
     first load, silence or garbage — invisible to a bench that always reused
     one warmed-up processor. Fixed at the root (seed smoothers to real
     starting values in prepareToPlay) + a defensive floor on the division.
   - Mono hosts got the right channel only (outR aliases outL; fixed it
     TWICE — first attempt still let the next line clobber the fix).
   - Muff/amp params stairstepped once per oversampled block; could click on
     a big knob move. Now interpolated across the block.
   - T22 itself had a flaw (flagged OUTPUT's wide gain range as "clicking"
     when it was just loud saturated audio at the peak-guard ceiling —
     verified against a no-automation control before trusting it, then
     excluded OUTPUT from that specific test with the reasoning in the code).

## This session (2026-08-26, pedalboard redesign) — continued

UI iterated three times based on Corey's feedback:
1. First pass: static pedal boxes bottom strip (rejected — "not like TOA/Vulture").
2. Second pass: TabDisplay with MAIN/PEDALS/TUNER tabs at bottom, 4-across
   pedal grid (rejected — tabs needed to be at top, pedals needed to take
   over the whole panel not pile on top of Muff/Bow knobs).
3. Final: two top tabs (MAIN/PEDALS) directly under the header rule.
   PEDALS fully replaces the Muff/Morph/Bow knob region (same takeover
   principle as THE TOA's PedalPanel) with a 2x2 grid — PHASER/CHORUS on
   top, ECHO/REVERB below — giving each pedal a full half-width/half-height
   cell so 3 knobs never overlap. TUNER is no longer a separate tab; it's a
   wide, thin ribbon permanently docked at the bottom of the MAIN page.
   GATE and OUTPUT are utility knobs, always visible in both views (right
   edge), matching how THE TOA keeps its utility controls outside the
   pedal takeover's footprint.

## Original session notes
1. **Replaced FLANGER with CHORUS** — simpler voices-in-unison shimmer, matches
   the user's request ("phaser and a chorus"). Updated all parameter names,
   attachments, test harness. T9c now tests chorus audibility and depth effect.
2. **Added TUNER** — non-destructive frequency detection via autocorrelation.
   Displays fundamental Hz and cents offset from equal temperament. Runs on
   gated mono signal, stores result in uiTunerHz / uiTunerCents for editor display.
3. **Reorganized editor UI as a pedalboard:**
   - PHASER (amber) and CHORUS (violet) pedals on a middle strip
   - ECHO and REVERB grouped below them
   - Section headings for each: PHASER, CHORUS, ECHO, REVERB
   - Window size: 980×520 (was 980×560; slightly compressed for layout)
   - All new controls initialize, attach, and position correctly
4. **Updated SPEC.md** to reflect new signal chain: MORPH → PHASER → CHORUS →
   ECHO → REVERB (removed FLANGER, TREMOLO still present but not in user request).
5. **All 22 tests pass**, including new T9c chorus test (audible 3.1 dB, depth
   effective 3.0 dB). Build clean, no regressions.

## Status
- 22/22 bench, soak clean, all targets build. Phaser, chorus, tuner ready.
- Editor pedalboard layout complete, all controls wired and positioned.
- **NOT YET DEPLOYED** — waiting for Corey to ear-pass the new pedals and tuner
  before shipping a new version bump.

## Next
- **EAR PASS with pedalboard + tuner** — Corey needs to load the plugin,
  test phaser/chorus/tuner in a real session with Otto's material, and give
  the go/no-go before v0.3.0 bumps.
- Factory presets (designed from Otto's beta jams; needs a real session pick).
- Measured cabinet IR (method known, no capture session yet).
- Still in scope but deferred: ORION PACK completion (AAX for Pro Tools,
  Windows builds on real hardware).

## Side project in this repo: `Simulator/` (LAMBO SIM, Lamborghini Revuelto)

Not part of THE BOWOTTO plugin. A browser driving game built for Corey on the
branch `claude/lamborghini-revuelto-simulator-l7n9gt`, published as a claude.ai
Artifact (https://claude.ai/code/artifact/c6dfe008-2876-449b-8c7c-da3e23312c06)
and packaged for Firebase Hosting (`Simulator/firebase.json`, build output in
`Simulator/dist/hosting/`). Everything is documented in `Simulator/README.md`:
eighteen worlds (Grid, Matrix, Red Mesa, Supersonic, Timberline, Deep Blue,
Whiteout, Stratos with landable tunnel roofs and a spiral staircase, then
Neon City, Volcano, Ice Lake at 62 % grip, The Docks, Space Station, Riviera,
Touge, Salt Flats, Mars at 55 % gravity, Jungle; themes are flag records and
new worlds are data plus one dressing function; every world laps clean under
the autopilot, including all eight originals after the refactor), phone
steering as a rotatable Revuelto wheel (Settings, default) or the old arrows,
Solo / Time Trial / Versus with three AI rivals and four
difficulty levels, momentum-based contact, drift-charged NOS and drift boost,
Supersonic rings, the COREZ clips, volume buses. `python3 Simulator/build.py`
rebuilds the single-file page, the artifact fragment and the hosting folder;
tests are Playwright scripts (headless Chromium on SwiftShader) kept in the
session scratchpad. **v1.0.0, live at https://lambo-sim.web.app** (Firebase project
`lambo-sim`, pinned in `Simulator/.firebaserc`); the whole `dist/hosting/`
folder including the .glb and the two .webm clips is committed, so deploying
is `git pull` then `firebase deploy --only hosting` in a clone of the branch,
run on Corey's machine (it needs his Google login). A deploy that reports
"found 1 files" means the binaries did not come down with the clone. Open
items: engine sound samples and Corey's own music tracks (to be supplied).

**CAREER MODE, first three steps shipped 2026-09-10** (economy, six upgrade
lines wired to the physics with invented brands OSSA / FERRO / ALTA / VOLTA /
AZOTO / LEGGERA, paint prices, a garage panel over the photo camera, Firebase
Google sign-in with a Firestore record per player, newest copy wins). Corey's
decisions: Firebase sign-in, invented brands. First run asks CREATE YOUR
UNIQUE ACCOUNT NAME (2 to 16 chars, modal over the start screen, keys blocked
while open; uniqueness enforced via Firestore `names/{key}` only when signed
in on the hosted site; CHANGE NAME in the garage). Menu has SAVE GAME and
BACK TO MENU; phones get a ☰ MENU button top-right, buttons pinned to the
top of the panel, NOS at index-finger height on the left. Lobby: LOADING ALL
MAPS → map list with bird's-eye previews (`Simulator/previews/*.webp`,
rendered headless by scratch prev.js) → NEXT builds the world behind a
spinning CORE FOCUS Revuelto strip (carspin.webp) and 39 cycling tips. Course
changes reload with `#go=<id>` (a storage write 60 ms before reload was lost
in headless Chromium). Page is 16.1 MB of the 16 MiB artifact cap: the next
big asset must come out of the posters or the model. 3D garage SHIPPED 2026-09-10 from Corey's two Sketchfab rooms: STUDIO (Velocity
Motion corridor, orbit cam) and SHOWROOM (ChristyHsu tron stage, car on the
turntable); sources in `models/*_src.glb` (gitignored), shipped GLBs
re-encoded to 1K JPEG by scratch `studio/reenc*.js` + a Python GLB rebuild.
Artifact now drops the intro poster clip to stay under 16 MiB (16.17 MB).
Cars are now data: `CARS` holds a physics spec plus a
cleanup recipe per car (hide patterns, paint materials, wheel groups, nose
yaw), `carSelect` swaps the model live, the garage has a CARS tab and the
career saves `cars`/`car`. Aventador SVJ (SDC PERFORMANCE, CC BY-NC 4.0,
10.7 MB) is HOSTED ONLY: too big for the 16 MiB artifact. `axleWheels()`
rebuilds wheels for downloads whose wheels come as one mesh per axle (split
by triangle centroid, corner clustering, yaw undone by a thinnest-tyre
search). THE SHOP (garage tab) sells cars at Corey's
prices: Countach 25th 500k, Aventador SVJ 650k, Countach LPI 800-4 850k, with
harder wins paying 15k to 25k (PRIZE row 2/3 raised). At ~20k a win that is
roughly 25 wins for the first car: Corey set both numbers, watch for feedback.
GT wing (aero tier 2) ships as a real part: VR Designer's wing decimated
167,716 -> 8,000 tris by the new Tools/decimate_glb.py (grid-cluster,
smooth-normal rebuild), fitted via raycasting the real bumper/roof surface
(an AABB was thrown off by an outlying mesh far past the visible body).
Two TDZ bugs fixed (GIFTS declared after first use; garage.on read in
installModel before garage existed) -- both from code inserted ahead of
where bodyGroup/garage are declared; sceneReady (a hoisted var) now guards
early calls. One-time driver gifts (career.gifts[]) added, GIFTS.INDIE=900000.
Model pipeline now covers three shapes of download: named bones, axle groups
(axleWheels), and loose-piece models merged offline by material with wheel
corners kept as pivoted groups (scratchpad/studio/merge.html + mergerun.js;
LPI went 1748 meshes / 20 MB -> 33 meshes / 12.5 MB). All extra cars are
hosted-only. THE SHOP UX pass: confirm-before-buy on every purchase (parts, paint,
cars), PAINT tab collapsed behind a reveal button, bigger shop card text,
click-to-preview a not-owned shop car in the garage scene without buying or
switching what you drive (garagePreview/garagePreviewShow, a throwaway
scaled clone, real car hidden underneath). Garage camera now clamps
per-room (STUDIO 3.0-5.6, SHOWROOM 6-16 + yaw locked to -1.2..2.3 to avoid
its screen-wall side) and shows the car at a smaller, better-reading scale
per room (STUDIO 0.5x, SHOWROOM 0.8x) without touching the real driving
scale. Found and fixed by relocating the whole ROOMS/garage block earlier
in sim.js: boot() calls garageRefresh() and installModel() runs before
that block's old position, hitting the same TDZ class as GIFTS/sceneReady
before it -- moving the block, not patching call sites one at a time,
should prevent the next one. THE SHOP UX pass: confirm-before-buy on every purchase (parts, paint,
cars), PAINT tab collapsed behind a reveal button, bigger shop card text,
click-to-preview a not-owned shop car in the garage scene without buying or
switching what you drive (garagePreview/garagePreviewShow, a throwaway
scaled clone, real car hidden underneath). Garage camera now clamps
per-room (STUDIO 3.0-5.6, SHOWROOM 6-16 + yaw locked to -1.2..2.3 to avoid
its screen-wall side) and shows the car at a smaller, better-reading scale
per room (STUDIO 0.5x, SHOWROOM 0.8x) without touching the real driving
scale. Found and fixed by relocating the whole ROOMS/garage block earlier
in sim.js: boot() calls garageRefresh() and installModel() runs before
that block's old position, hitting the same TDZ class as GIFTS/sceneReady
before it -- moving the block, not patching call sites one at a time,
should prevent the next one. THE SHOP UX pass: confirm-before-buy on every purchase (parts, paint,
cars), PAINT tab collapsed behind a reveal button, bigger shop card text,
click-to-preview a not-owned shop car in the garage scene without buying or
switching what you drive (garagePreview/garagePreviewShow, a throwaway
scaled clone, real car hidden underneath). Garage camera now clamps
per-room (STUDIO 3.0-5.6, SHOWROOM 6-16 + yaw locked to -1.2..2.3 to avoid
its screen-wall side) and shows the car at a smaller, better-reading scale
per room (STUDIO 0.5x, SHOWROOM 0.8x) without touching the real driving
scale. Found and fixed by relocating the whole ROOMS/garage block earlier
in sim.js: boot() calls garageRefresh() and installModel() runs before
that block's old position, hitting the same TDZ class as GIFTS/sceneReady
before it -- moving the block, not patching call sites one at a time,
should prevent the next one. Still to come: part anchors on the car, more cars.

**Phone performance pass 2026-09-11:** the shipped Revuelto model had 853
separate meshes (one draw call each); merged to 64 by material, wheels kept
as their own named group (wheel_fl/fr/rl/rr) since the game spins them by
name every frame. Tool: Tools/merge_car_draws.html + _run.js. Found two
real bugs in this vendored three.js while building it: BufferGeometryUtils
can't merge InterleavedBufferAttributes, and InterleavedBufferAttribute's
getX/Y/Z/W ignore `normalized` and return the raw quantized int, which
silently inflated the whole car ~32767x until fixed to read the underlying
array and normalize by hand. The exporter also can't write the source's
compact quantized types, so the merged file is bigger: 19.7 MB vs 15.4 MB,
after re-encoding textures PNG->JPEG to claw back ~10 MB of a 30 MB naive
first pass. That trade only ships on the hosted site
(models/revuelto_hosted.glb, picked up by build.py automatically); the
artifact and single-file page keep the original small model, unchanged,
853 draw calls, so they still fit the 16 MiB artifact cap. fitWing() used
to raycast the car's own body mesh for the rear bumper / roof height --
fragile against exactly this kind of merge (flipped winding, single-sided
material, an interior panel closer than the outer skin) and broke
silently, shrinking the wing to a few centimetres; it now reads
CAR.width/length/height (the physics spec) instead, which is more robust
for every car, not just this one. Verified: lap regression on two tracks,
wing fit + garage rooms + reload persistence, wheel spin and paint
targeting, all on both the embedded and hosted-fetch loading paths. Balance is
untuned: everything at tier 3 is 2.01 s to 100 and 359 km/h against stock
rivals; retune in SHOP by feel.

**Welcome screen, same day:** a title screen ahead of the lobby -- the
Revuelto slowly rotating (14s per turn) in CORE FOCUS LIVERY above CORE FOCUS
PRODUCTIONS PRESENTS / LAMBORGHINI REVUELTO / PLAY, on a new hero sprite
(`previews/carspin_hero.webp`, 36 frames at 320x200, same chroma-key render
technique as the loading spinner; started as the animated TRON LEGACY paint,
Corey asked for CORE FOCUS LIVERY instead and a much slower spin). Uses the
existing `straight` flag so any
internal reload (course change, resuming a chosen track) skips straight past
it, same as the lobby. Two three.js/CSS gotchas from building it: the
percentage-based sprite-sheet animation needs `steps(frameCount-1)`, not
`steps(frameCount)` -- the off-by-one bled in a sliver of the next frame at
the loop point; and the game's only keydown listener lives inside `boot()`,
which doesn't exist for several seconds after the welcome screen shows, so
Enter/Space needed their own listener registered immediately. Verified at
phone and landscape sizes (car/text sizing collapses under `max-width:600px`
and `max-height:480px`), PLAY/Enter/Space all dismiss it, and it correctly
does not reappear on a course-change reload. Original plan for reference: Prize money on finishing position scaled by difficulty and laps
(1st: Easy 8k / Medium 12k / Hard 18k / Impossible 25k, x laps/3). Money buys
upgrades wired to the real physics numbers (tyres, brakes, suspension, engine,
NOS with better tanks lasting longer and recharging faster, aero and weight;
three tiers each, 5k to 30k) and paints (4k to 20k). A 3D garage with Corey's
own environment render, the car turning, hand-placed anchors for parts (the
model's meshes are CAD surfaces, not car parts; only paint, rims, tyres, glass,
lights and carbon are identifiable by material). Later: five more Lamborghinis.
Build order: save + money first, then upgrades, then a simple garage to prove
the loop, then the 3D garage, then more cars. **Waiting on Corey:** the garage render, and two console
clicks for the cloud save (enable Google sign-in; create the Firestore
database).

**Fourth shop car, SC18 ALSTON, 2026-09-11:** Corey supplied the GLB
(Ddiaz Design's "2019 Lamborghini SC18 Alston", CC BY-NC-SA 4.0 -- the
ShareAlike term means any redistributed copy/derivative keeps the same
license, noted in both READMEs). $950,000, hosted-site only like the other
three. Its wheels are a fourth shape the loader hadn't seen before: already
split one-per-corner, but named by parent group (`3DWheel_Front_L` /
`_Front_R` / `_Rear_L` / `_Rear_R`), not `wheel_fl`-style. The generic
name-matching branch (`/wheel[_-\s]?(fl|fr|rl|rr)/i`, tested against every
node in the scene) actually DID match here, which was the bug: "Front" and
"Rear" both start with "r"/"f"-adjacent letters, and "front" contains "fr"
as a substring, so both `3DWheel_Front_L` and `3DWheel_Front_R` matched on
"fr" (front) while neither `Rear_*` group matched at all ("rear" contains
"re", not "rl"/"rr") -- two wheels detected, both wrongly tagged front, rear
axle silently missing. Fixed with a car-specific `bones` regex
(`/3DWheel_((?:Front|Rear)_[LR])/i`) instead of relying on the generic path,
same spin and steer node since the download has one pivot per corner, not a
separate steer joint. Physics spec built off the Aventador SVJ (same 6.5L
V12, 770 CV, AWD, ISR-style box) since the SC18 shares that platform: a
touch lighter (1490 vs 1525 kg, matching Lamborghini's own "less weight than
the standard model" line), more drag and grip from the fixed wing, and the
gearing scaled so top speed lands on the SC18's official 338 km/h instead of
the SVJ's 352. No official weight/dimensions were ever published by
Lamborghini, so those are estimates; the model's own auto-scale (matched to
the spec's `length`) means the visual size follows whatever `length` says
regardless. Verified on the hosted build: correct nose orientation (rear
chase-cam shot confirms driving forward, not backward), wheel spin,
ROSSO MARS repaint, and the HUD showing 770 CV (not the Revuelto's 1015).

**Settings/credits collapse + garage STUDIO/SHOWROOM/SHOP split, 2026-09-11:**
two quick UX asks after the SC18. (1) Settings' CREDITS block used to always
show the full attribution list; now it defaults to one line (LAMBO SIM ·
CORE FOCUS PRODUCTIONS · AUCKLAND, NEW ZEALAND -- dropping the personal
name that was there before) behind a SHOW/HIDE ADDITIONAL CREDITS toggle,
and the Lamborghini link moved from between VOLUME and CREDITS to the very
bottom of the panel under a new "VISIT THE OFFICIAL WEBSITE" line. (2) The
garage's room picker (STUDIO/SHOWROOM) and its shopping tabs (PARTS/PAINT/
THE SHOP/CAREER) used to be two independent rows -- you could be looking at
the buy-parts list while the 3D room span underneath, cluttering the "look
at your car" experience. Merged into one three-way tab (STUDIO/SHOWROOM/
SHOP): the first two just switch the 3D room and show a small "your paints,
tap to switch" strip (owned paints only, no prices, no buying -- reuses the
same swatch technique as the start screen's `#paints` bar); SHOP hides that
strip and reveals the existing PARTS/PAINT/CARS/CAREER sub-tabs where all
buying and upgrading actually happens. New `garageSetView()` drives the
switch (`garageRoom()` already no-ops for a room name it doesn't recognize,
so calling it with 'shop' is harmless). One real bug caught by screenshot,
not by the automated checks: `#g-quickpaint{display:flex}` (an ID selector)
was beating `.g-pane.hidden{display:none}` (a class selector) on
specificity, so the paint strip stayed visible even when JS had added the
hidden class and the state checks reported it correctly hidden -- fixed
with a same-element `#g-quickpaint.hidden{display:none}` rule, which wins
by having one more class in its selector.

**Sprite quality pass, 2026-09-11:** Corey: "the rotating car at the start
looks horrible", then "this is for the start and loading" -- both the
welcome-screen hero and the LOADING <WORLD> spinner needed work, for two
different reasons. The hero's camera framing had a real bug (inherited from
copying the loading-spinner render script): `rad` was computed as the car's
FULL length, not a half-length/radius, and the orbit-distance multiplier was
bumped 2.1->2.3 on top of that, so the car filled only ~50% of the frame at
its widest (side-on) angle and as little as ~24% face-on -- confirmed by
computing the actual horizontal FOV (a `PerspectiveCamera`'s fov argument is
VERTICAL, so the earlier back-of-envelope check that assumed it was
horizontal was itself wrong by the aspect ratio factor of 1.6). Fixed by
sizing the camera distance directly off the worst-case diagonal footprint
(`hypot(length, width)`, the widest silhouette across any yaw) so a target
fill fraction is honest at every angle, not just one. The loading spinner's
framing was already fine (that script correctly halved the length into a
radius); its problem was pure resolution -- 144x88 source blown up through
`transform:scale(1.6)` plus device pixel ratio. Both got bigger frames
(400x250 hero / 216x132 loading, up from 320x200 / 144x88). Hit WebP's own
16383px dimension cap doing it naively: a horizontal frame-strip is
`frameWidth * frameCount` wide, and 480x36 frames (17280px) silently failed
`toDataURL` with an empty result and no thrown error -- the failure mode to
watch for if resolution goes up again. The artifact's 16 MiB cap was the
real ceiling: the two sprites together only had about 230 KB of headroom to
grow into (checked by rebuilding and reading `dist/revuelto.artifact.html`'s
actual size, not by trusting the base64-inflation math alone), so the hero
settled at 30 frames (down from 36 -- imperceptible at a 14s rotation) and
both got a WebP quality trim (0.82 / 0.80) to land around 100 KB of
headroom. Scripts live only in the session scratchpad (not committed):
`spritehero2.js` (hero, configurable frame count/size/fill/quality) and
`spriteload2.js` (loading spinner, same idea) -- rerun either if the
paint, framing or size budget needs to move again.

**CORE HUB LINK: PAUSED, comes later.** The game will eventually be a reward
in Corey's Core Hub app (tasks there earn play in here). Decided already and
not to be forgotten: **never cut a player off mid-lap or mid-race when their
credit runs out. Let the race finish, then stop.** So credit should be spent
per race, not per minute.

**Firebase auto-deploy: parked.** The workflow is in place and green; it only
needs the FIREBASE_SERVICE_ACCOUNT_LAMBO_SIM secret added in GitHub to start
deploying by itself. Corey said to come back to it.
