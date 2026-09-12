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

**Hero sprite round two, same day:** Corey asked to speed the welcome-screen
rotation up a touch, smooth it out, and improve the graphics further. Went
back from 30 frames to 36 (the frame-count cut made for the artifact's byte
budget last round), sped the spin 14s->11s, bumped 400x250->440x275, and
raised the offscreen supersample from 3x to 4x (matching the loading
spinner's own 4x -- a free quality win, since supersampling only costs
render time, not output file size). All of it had to fit back inside the
16 MiB artifact cap: rebuilding and reading the actual
`dist/revuelto.artifact.html` size (not estimating) after installing the
36-frame/440x275/Q0.8 version left only ~38 KB of headroom, so quality was
trimmed to 0.78 to land at a steadier ~57 KB spare instead.

**Grid stillness fix, same day:** Corey noticed the AI rivals visibly
twitching/turning on the grid before the lights go green in Versus --
"doesn't look real... we should have them very much stationary until the
go, and then they launch." Root cause in `rivalStep()`: the pre-race branch
already zeroed the rival's TARGET SPEED (`target = go ? ... : 0`), but the
steering/lane-positioning block ran regardless of `go` -- it kept computing
a target lane offset from the upcoming corner curvature and damping the
rival's lateral velocity (`a.dv`) and heading (`a.psi`) toward it every
frame, even at a dead stop on the grid. That's what looked like the cars
creeping sideways and yawing before the start. Fixed with a new branch,
`else if (!go) { a.dv = 0; a.u = Math.max(0, a.u - 13*dt); }`, so a parked
rival's lateral velocity is held at zero and its heading is never touched
until `go` flips true at the green light, at which point the untouched
original steering/throttle logic takes back over exactly as before.
Verified: sampling all three rivals' s/d/psi/u/dv every 1.5s through a
full 3s countdown window showed byte-for-byte identical values (fully
frozen), confirming no residual creep or twitch.

**Paint bar hidden while driving, same day:** Corey: get rid of the quick
paint-swatch bar while actually driving, especially on a phone where it eats
real HUD space. `#paints` was a top-level element with no state-based hide
of its own -- always on screen, menu or not. Hidden in `startGame()`
(alongside where `#start` itself gets hidden) and shown again in `toMenu()`
(alongside where `#start` reappears), so it now only shows on the
menu/mode-select screen where it's actually useful, and disappears the
instant a race starts. Verified the round trip (menu -> driving -> ESC back
to menu) and a phone-size driving screenshot with it gone.

**Settings now pauses the race, same day:** Corey noticed opening Settings
mid-drive didn't stop anything underneath -- the car kept coasting, the
race clock kept running, AI kept driving. One-line fix in the main
`frame()` loop: `const paused = !$('settings').classList.contains('hidden')`
gates the same block that already skips physics for `!st.started`, so
`step()`/`raceTick()`/`audio.update()` don't run while the panel is open --
mirrors the existing `garage.on` freeze pattern one line above it. Rendering,
camera and HUD keep running so the screen doesn't go blank, it just shows a
frozen moment behind the dialog. Verified with a temporary lightweight test
hook (bypassing the expensive full render path, which turned out to take
multiple real seconds per frame in this sandbox's software renderer and
made wall-clock-timed Playwright tests useless for this): identical
speed/position across 90 simulated ticks with settings open, then normal
continued acceleration once closed. Hook removed before committing --
shipped diff is the one-line gate only.

**Garage car-select fixes, same day:** Corey: clicking an owned car in THE
SHOP to drive it "doesn't work," and asked to rename the button from DRIVE
to something clearer. Two real things going on, both fixed:
1. **The actual root cause -- every `flash()` message was invisible while
   the garage was open.** `#msg` (the on-screen toast used for "NOT ENOUGH
   MONEY", "BOUGHT · X", the hosted-only notice, etc.) lived inside `#hud`,
   and `body.garage #hud{display:none}` hides the whole HUD while the
   garage panel is open -- collapsing `#msg` to a zero-size, invisible
   node regardless of its own opacity/class state. So every blocked action
   in the garage (not enough money, a hosted-only car on the embedded
   build) silently did nothing from the player's point of view: the code
   ran, the message fired, nobody ever saw it. Fixed by moving `#msg` out
   from under `#hud` to a top-level sibling (confirmed via getBoundingClientRect:
   0x0x0x0 before, real on-screen dimensions after) plus a z-index (11, above
   every other overlay) and `pointer-events:none` so it can't block clicks.
   Also gave it a phone-width rule (wraps instead of running off both
   edges of the screen) since the clearer new copy is longer than the old
   one-word messages.
2. **Renamed the DRIVE button to SELECT THIS CAR**, and simplified the
   flow for cars you already own: clicking anywhere on an owned car's
   card in THE SHOP now selects/drives it in one tap, no separate
   preview-then-click-the-button step (that two-step still exists for a
   NOT-owned car, where you should look before you buy). Also reworded the
   hosted-only block message (fires when a hosted-only car is tapped on
   the claude.ai artifact/single-file build, which only ever carries the
   Revuelto) from the cryptic "AVAILABLE ON LAMBO-SIM.WEB.APP" to "HOSTED
   SITE ONLY · LAMBO-SIM.WEB.APP" -- same fix that made it visible at all
   also makes it worth being clearer.
   Verified end to end on the hosted build (owned car selects in one tap,
   not-owned car still only previews, no accidental purchase) and the
   embedded build (hosted-only car now visibly blocked with the message
   on screen, confirmed via layout rect, instead of a silent no-op).

**DESTRUCTION DERBY + THE ARENA, 2026-09-11:** Corey: "add a new mode called
destruction derby mode and lets use this map i got" -- SpringSociety's Tron
Light cycle Arena (Sketchfab, CC BY 4.0, 3 MB, 96 x 148 m, 48 meshes,
5.9k tris). The engine is spline-bound (every car is "distance along the
line, offset off it"; the AI drives a racing line), so a true open arena is
impossible without a second movement model. The trick that made it a data
change instead: THE ARENA is a stadium-shaped loop (30 m bends, 48 m
straights) with `roadHalf: 16` -- a new per-track field; `ROAD_HALF` was a
global const at the top of sim.js and now reads `TRACK.roadHalf || 6` right
after `chooseTrack()` -- so the drivable floor is the whole annulus between
the outer wall and a 12 m infield island. The polar singularity is why the
island exists: `sDot = u / (1 + kappa*d)` needs `1 + kappa*d` well above the
0.3 clamp, and with R=30, d=-17.2 gives 0.43. Theme `arena` is
`Object.assign({}, THEMES.tron, ...)`, `DRESS.arena()` hides the road strip
and fetches `arena.glb` (hosted-only, procedural Tron grid + neon walls on
the artifact), centred on the origin with its floor at y=0.06. build.py
already copies any non-car GLB in models/ to hosting (renamed the log line
from "hosted car" to "hosted-only"). Preview via a hosted-capable copy of
prev.js with a tighter frame for a 60x108 m bbox (the standard 120 m margin
swallowed it).
The mode (`GAME.mode === 'derby'`): 100 hp per car (`st.hp`, `a.hp`),
damage in `contacts()` from the closing speed `resolveContact` already
returns, x2 to the car struck and 30 % of that to the hitter -- `contactAgg`
is a new module var resolveContact sets to its internal `aggA` (A moving
into B) so the caller knows who hit whom without changing the return value.
Rival-vs-rival x1.6 too, walls scratch (rival lateral speed x0.6, player
wall-normal speed x0.6). Player damage scaled per difficulty
(DERBY_DMG 0.6/0.85/1.05/1.25), field DERBY_N 3/4/5/6 from DERBY_RIVALS
(the Versus three plus VIOLA/ROSSO/NERO). rivalStep gets a `derby` branch:
no racing line, target speed and lane from the gap to the player (ahead and
in reach: player speed + 10 on the player's lane; far ahead: vmax; beside:
match and lean; behind: circle on at 0.8 vmax if the loop is under 1500 m
(an arena), creep in the player's lane on a circuit where driving on would
mean never meeting again); mistakes and car-avoidance off in derby (they are
supposed to hit). Wrecked rivals: a new `else if (a.wrecked)` branch beside
the grid-freeze one -- rolls to a stop, no steering, body sits 0.08 rad on a
flat, glow disc off, paint meshes (tagged `userData.paint` in
buildRivalVisual, each rival's OWN clone so it can be recoloured) turned
burnt grey. Player wrecked: readInput() forces throttle 0 / brake 1 / steer
0, finishRace() immediately. Finish: all rivals wrecked -> LAST CAR
STANDING; standings() has a derby branch (running cars by hp, then wrecks
latest-first) so the generic `findIndex(me)+1` position still works.
prizeFor('derby') = PRIZE_DERBY_WRECK[diff] x st.wrecks + PRIZE[diff][0] if
P1; payout counts wins/podiums like Versus. Lap logic skipped in derby (the
arena is 284 m round -- every 12 s would be "a lap"). Menu: 4th mode
button, laps hidden, difficulty step shown, START DERBY; HUD LEFT n / HP n;
results sheet DRIVER / DAMAGE / WRECKS. Also this pass: "SIM" tag on the
welcome title (Corey), tagline now NINETEEN WORLDS · DESTRUCTION DERBY.
Verified on the hosted build with a scripted derby (spawn, countdown skip,
4 s of chase, forced rams, wreck all four -> $35,000 on Medium, results
sheet, then the player-wrecked path), zero page errors; arena model
confirmed at ±48 x ±74 m world, walls 0.06-15 m. Artifact at 37.5 KB under
the 16 MiB cap after this -- the compression pass Corey asked for (the
embedded Revuelto is 15 of the 16 MB) is next and also has to pay for the
"smoother" hero rotation he wants (more frames = more bytes).

**Compression pass 2026-09-11 (Corey: "lets fix that by doing some work in
compressing").** npm and the CDNs are 403 from the sandbox, so no Draco /
meshopt / gltfpack: wrote Simulator/Tools/quantize_glb.py (pure Python,
KHR_mesh_quantization: int16 positions with the per-mesh scale folded into
node scale so pivots stay put, int8 normals stride 4, uint16 UVs when in
[0,1], tangents dropped, unreferenced TEXCOORD sets dropped, uint16
indices, --extract-images / --images round trip, --data-uri-images for the
sandboxed artifact which refuses blob: URLs) and Tools/reencode_textures.js
(headless-Chromium canvas, long side <= 1024, JPEG q0.82 unless alpha /
BLEND-MASK, keeps the original when the canvas's fast PNG comes out
bigger -- it does, by up to 7x, first run made the Countach's textures
grow). Results: Revuelto (the merged 64-draw one) 19.7 -> 13.8 MB,
Aventador 11.0 -> 5.5, LPI 12.9 -> 6.1, SC18 11.7 -> 5.5, Countach 1.75 ->
1.06, arena 3.15 -> 0.65. The big decision: ONE Revuelto for both builds
now -- models/revuelto.glb IS the quantized merged model (data-URI images),
models/revuelto_hosted.glb and the old tools/quantize-glb.py are gone,
build.py just copies the one file. The artifact went from 16,742,294 B
(34 KB under the cap) to 14,565,119 B -- 2.2 MB of headroom, which paid
for the smoother hero rotation Corey asked for: 144 frames (was 36) in a
36 x 4 GRID sheet, since WebP caps each side at 16383 px and 36 x 440 px
is the widest one row can be. CSS walks the grid row by row --
steps(36,jump-none) along each row, a steps(1,jump-start) hop between rows
at the 0.001% gap -- so no frame is skipped or held; verified by pausing
the animation at 12 times and reading back computed background-position
(frame 0/34/35/36/37/70/73/106/108/142/143 exactly as expected). One real
lesson: WebP stores the ALPHA plane losslessly, so the chroma-key's
256-level soft edge cost more bytes than the whole colour image -- baking
the edge to 4 alpha levels took the sheet from 2.09 MB to 1.31 MB at the
same quality, and the edge still reads soft at 620 px wide. Artifact with
the smoother hero in: 16,006,146 B, 771 KB under the cap. sim.js: subGeometry now
divides raw normalized ints by the type range like floatGeo already did
(without it a quantized download's split wheels come through 32767x too
big). Verified: hosted build per car (mesh count, paint meshes, wheel
spin over 2 s of throttle, screenshots), the arena in derby, the artifact
under a CSP that blocks blob: URLs.

**Derby damage pass 2026-09-11 (Corey, after driving it: "the damage doesn't
happen so quick... slowly go down", plus "a little car that shows the amount
of damage... front, the middle, the back and the wheels").** Damage is a bit
under half what it was: struck car takes closing speed x1.2 (was x2.0), the
hitter still 30 % of that, DERBY_DMG (the player's multiplier) 0.45/0.6/
0.75/0.9 (was 0.6-1.25), wall scrapes halved, rival-on-rival x0.9. The car
now has FOUR zones (st.zone front/mid/rear/wheels, 100 each) and st.hp is
their mean, so nothing else -- standings, the wreck check, the results sheet
-- had to change. Where a hit lands comes free from the physics:
resolveContact already writes the contact point into each proxy (x along the
car, +-2.4 when the normal is longitudinal), so hitZones() reads it -- nose
or tail hit puts 75 % into that end, a flank hit splits mid/wheels by how far
out it landed. damageZones() spills damage past a dead zone into whatever is
still standing, so a destroyed front doesn't make you invincible. HUD: a
top-down car on the right (#damage, SVG, under the minimap; standings drop
to top 396px in derby), each zone hsl-lerped green -> orange -> red, with
the overall % in the header. Two testing traps worth remembering: reading
`getComputedStyle(el).fill` right after setting `style.fill` returns the OLD
value while the 0.25 s CSS transition runs, and a screenshot taken 700 ms
after a change can still show the previous raster under swiftshader (frames
take seconds) -- wait 1.5-3 s before believing either. Also: a probe that
waits for `window.__sim` must set `revuelto.step=2` first, or the page sits
on the welcome screen and `boot()` (which defines `__sim`) never runs -- that
is what made the artifact look like it hung under CSP for ten minutes.

**Bug sweep 2026-09-12 (Corey: "can we test for bugs and check everything's
working good").** Wrote four Playwright suites in the scratchpad
(sweepA/B/W/P + sweepArt) that drive the exported API rather than the wall
clock, since a rendered frame here takes seconds. Coverage: boot and NaN
guards, spline sanity, the physics bench, the four drive modes, spin/wall
recovery, paint, the shop (buy part/paint/car, cash, persistence), a
deliberately corrupt save, tuning measured by lap speed, all four modes end
to end (time trial to the flag, versus grid-stillness, derby to last car
standing and to the player's own wreck), the HUD, the garage's three views
and its tabs, ESC/menu round trips, NOS, coins, cameras, the lobby, all 19
worlds driven at 40 points each, phone portrait and landscape, and the
artifact build (embedded model, hosted-only block, procedural arena, derby,
hero sprite) including under a blob-blocking CSP.

ONE REAL BUG, now fixed: `createImageBitmap is not a function` on THE ARENA.
GLTFLoader picks ImageBitmapLoader when that function exists, and the
sandboxed artifact refuses the blob: URLs it needs -- so three call sites
(loadGLBBuffer, carSelect, garagePreview) each switched the function off
just before parsing. That RACED: the arena's own fetch starts during the
world build, and the car's load switched the function off from under it a
moment later, so any arena texture still decoding threw and was silently
lost (a black surface in game, worse on a slow connection). Now switched
off ONCE at the top of sim.js, before anything can hold a reference, and
the three per-call wipes are gone. Verified: 151/151 arena textures and
27/27 car textures decode, zero console errors, arena world PASS.

Everything else that failed first time was the TEST being wrong, worth
knowing for the next sweep: retune() writes TUNE, not CAR (measure the car,
don't read a field); ROOMS has only studio/showroom, SHOP is a view
(garageSetView), and the paint swatches live behind a tab and a SHOW ALL
button; ESC during a race only leaves to the menu once #start is actually
hidden, so a test must call startGame(), not just startRace(); startGame is
on __sim, not window; a NOS run after a drift must reset psi or the car is
just scrubbing sideways; "the car sank" must compare against the ROAD
surface (sampleAt(s).p.y), never terrainH -- these worlds have tunnels, an
underground hairpin and overpasses; and a world-axis bounding box swaps
length and width depending on which way the start line points.

**Garage/shop fixes 2026-09-12 (Corey, after driving the live site: plates
"not really looking like they're on the car", cars "not the same size", the
Countach "tiny" with front lights like "celery sticks", cars "loading way up
too high" then settling, and the view going "jolty" when switching cars).**
Root cause of three of those was one line: installModel scaled the car so the
model's WHOLE bounding box matched the spec length. These downloads carry
scenery -- the Aventador a 2-tri stage floor 16 m across, the Countach fake
headlight beams 5.42 m long on 76 tris -- so the Countach was scaled to fit
its own light beams and came out 3.81 m instead of 4.14, with the beams
visible as blades off the nose. New bodyBounds(): the meshes holding 90 % of
the triangles are the body, anything more than 15 % bigger than that box on
any axis is scenery, which gets hidden and excluded from the scale, the ride
height and the preview. Measured, so no per-model name lists. Countach now
4.15 m against a 4.14 spec, beams gone, every other car unchanged.
GOTCHA worth remembering: visibility must be checked UP THE PARENT CHAIN --
procBody and the spare wheels are switched off at their group, so their
meshes still report visible === true and were being measured as part of the
car (they are also why a naive scan finds five 4.94 m "outliers" on every
car: that is the hidden procedural Revuelto, not the model).
Plates: heights were fixed at 0.50/0.30 m and the miss-fallback was x = +-2.45,
a Revuelto bumper, so on the Countach the plate hung half a metre behind the
car. Now sized off CAR.height/CAR.length, three rays voting by median, and a
sanity clamp to the spec bumper line. Garage: carY is a target eased at 6/s
(the jolt), and the shop preview computes its own ride height instead of
inheriting the outgoing car's (the float).
NOT a regression from the compression pass -- checked by rendering the
pre-quantization Countach and Aventador side by side with the new ones: byte
-identical geometry and pixel-identical renders. The Aventador's wheels were
also reported as "missing tyres"; measured, all four wheels have tyre, rim,
caliper and brake disc present, visible, opaque and textured (Material.077 is
the tyre, 0.69 x 0.72 x 0.37), and they render identically before and after
compression -- asked Corey which view he means rather than guessing.

**Blackout hunt 2026-09-12 (Corey: "some of the level the car disappears and
you cant see anything... a background or fog type glitch").** Ran a Workflow
(5 code-review agents over fog/camera, tunnels/roof-clip, postprocessing,
world dressing, lighting + a render sweep), then out-detected the render
sweep with a purely geometric scan: scratchpad/test/occlude.js walks a whole
lap (170-340 samples) and tests every piece of furniture against the car
point and the chase-camera point, skipping meshes over 500 m (terrain,
water, dome) and see-through ones. A uniform 14-point render sweep found
NOTHING; the geometric scan found the real thing immediately. Worth
remembering: for local defects, sample the whole lap and test geometry, do
not sample sparsely and look at pixels.

FIXED: (1) THE DOCKS -- hull/deck boxes at a fixed y = 8 while the road ramps
3 -> 8 -> 6 -> 8 over them: 107 m of lap with the car inside a solid hull,
53 m inside the deck, 54 m with the CAMERA inside the deck. Each ship now
measures min spline y over its own z-span and sits 0.35 m under it. Verified
with a 2x finer scan: zero hits. (2) The sky dome (r 8500), stars (r 8000)
and sun (7800 m) were pinned to the world origin while the camera goes 3.4 km
out, so their far side crossed the 9000 m far plane and was clipped -- holes
of flat background colour, stars gone over half the sky. skyFollow[] +
skyRide() ride them with the camera. (3) The cube-map reflection pass hides
the car every other frame with no try/finally -- one throw and the car is
invisible forever. (4) installModel now falls back to the procedural body if
fitting throws. (5) MY OWN REGRESSION from earlier today: bodyBounds junk
hiding was a one-way ratchet -- car roots are cached, bodyBounds ignores
hidden meshes, so re-installing the same car measured a smaller body each
time and hid more of it. Tagged with userData.simJunk and undone before each
measure.

RULED OUT BY MEASUREMENT (left alone): WHITEOUT and DEEP BLUE render at
detail 0.49-0.64 / std 32-58, the same band as the clean SALT baseline, so
the dense fog is not blinding anyone; NEON CITY's two underpasses (612 m and
438 m below ground) are fine because the ground plane is single-sided and
invisible from beneath; TOUGE, JUNGLE and ARENA "car inside a box" hits are
bounding boxes of a mountain, a tunnel and the stadium; the 56x18x56 box that
flags on EVERY world at s~70 m is the hollow start gantry. Also checked and
wrong: my own first two hypotheses (camera leaving the 8500 m dome -- every
world stays within 3.4 km of origin; STRATOS driving under its cloud decks --
decks at y 330/430, road at y >= 674).

**Arena wall bug, found by checking my own dismissal (Corey: "What about the
arena?").** I had waved off THE ARENA's occlusion hits as "the bounding box of
the stadium you're meant to be inside" -- correct for most of them, wrong for
one. Re-swept every lane (not just centre) and found a real solid slab
(polySurface1, 3.8x15x18.9 m) standing in the driving corridor: car inside it
32 samples, camera inside 32, blocked view 8, around s 184-215 of the 284 m
lap. First fix (hide anything tall whose footprint sits well inside the road)
had a real bug of its own: it hid the WRONG mesh -- the outer wall itself --
because a box's vertices sit only at its top/bottom corners, so sampling
vertex HEIGHT to test "is this at car level" misses a solid box that spans
straight through that band with no vertex actually inside it. Fixed to test
the bounding box's y-RANGE overlap instead of individual vertex heights, and
required the horizontal approach to be well inside the road (roadHalf-5)
rather than merely within the wall's own margin, so the boundary wall (which
legitimately sits at the edge) is left alone. Verified: only polySurface1 is
hidden now, confirmed by name.

Chasing that further (rendering a top-down view needed cancelAnimationFrame
on every pending id 1..300000 first -- the game's own rAF loop overwrites a
manual renderer.render() call before a screenshot can capture it, no matter
how tight an interval tries to race it) turned up a SECOND, more interesting
bug: at two points in the lap (s~199, s~279) the model's real wall geometry
-- support struts inside the SAME mesh as the boundary wall, so it can't be
selectively hidden -- comes within 0.35-2 m of the CENTRELINE itself, while
the physics assumes a flat roadHalf=16 (D_HIT=17.2) everywhere. A car legally
positioned by the game's own rules could be driven straight into solid
geometry the model was never built to expect.

Fix: DRESS.arena now raycasts from every spline sample, both directions,
against the model's own solid meshes, once at load, and stores a smoothed
per-sample safe half-width (ARENA_LIMIT, minus 1.7 m for car half-width +
margin, floor 2.4 m). wallLimitAt(s) = min(D_HIT, ARENA_LIMIT[i]) replaces
the flat D_HIT in both wall clamps (player at the dLim check, rivals at their
equivalent) -- every other track leaves ARENA_LIMIT null and is untouched.
Verified against the live physics, not just the measurement: parking the car
at d=-16 (which old D_HIT=17.2 would allow) at the s=199 pinch clamps it to
d=-2.38 in one step, matching the measured 2.40 m limit exactly; a normal
derby race still lets the car out to d=-14.95 well away from the pinch. Full
regression (17/19, same two known-bad tests), all 19 worlds clean, and a
complete derby (spawn, ram, wreck all 4, $35k payout, results sheet, player-
wrecked path) all still pass.

**CORE HUB LINK: PAUSED, comes later.** The game will eventually be a reward
in Corey's Core Hub app (tasks there earn play in here). Decided already and
not to be forgotten: **never cut a player off mid-lap or mid-race when their
credit runs out. Let the race finish, then stop.** So credit should be spent
per race, not per minute.

**Firebase auto-deploy: LIVE as of 2026-09-12.** Corey added the
FIREBASE_SERVICE_ACCOUNT_LAMBO_SIM secret, and run #34 (workflow_dispatch)
deployed hosting + Firestore rules green. Every push touching Simulator/**
on main or the feature branch now publishes to lambo-sim.web.app by itself;
no terminal step, and the run can also be started by hand from the Actions
tab. index.html is cached 5 min, the models a week, so a hard refresh is
needed to see a change immediately.

**Security note from that same session:** the service-account JSON was
pasted into the chat before it reached GitHub. A key in a transcript is
burned -- the only fix is deleting it in the Google Cloud console (IAM ->
Service accounts -> firebase-adminsdk -> KEYS -> delete, then ADD KEY for a
fresh one, then update the GitHub secret, since a deleted key stops
authenticating). Exposed key id started f14d1dbf. For next time: `pbcopy <
file.json` puts it on the clipboard without it ever appearing on screen, and
the GitHub secret box is the only place it should ever be pasted.
