# REVUELTO SIM

A browser driving simulator of the Lamborghini Revuelto (LB744), built next to
THE BOWOTTO as a side project. Open `dist/revuelto.html` in any modern browser
(Chrome / Edge / Safari / Firefox), press START ENGINE, turn the volume up.

## What is in it

- **Vehicle model** tuned to the real car: 1900 kg, 2.779 m wheelbase, 1015 CV
  combined, AWD launch, 8-speed DCT with auto or paddle shifting, 9500 rpm
  redline, drag-limited top speed. Bench numbers from the headless test:
  0–100 km/h 2.7 s, 0–200 km/h 6.9 s, 100–0 km/h in 30 m, v-max 343 km/h.
- **Start screens**: choose your course, then your mode (and laps), then
  your rivals for Versus. Choices are remembered, and a course change (which
  rebuilds the page for the new world) comes back to the mode screen with
  everything as it was. Only START (or Enter) starts the game.
- **Game modes** picked on the start screen. **Solo** is the open track,
  freestyle, no clock pressure. **Time Trial** is a standing start behind
  the line, a countdown, and 3, 5 or 10 timed laps with a results sheet.
  **Versus** puts three AI Lamborghinis on the grid ahead of you — MANTIS
  (Verde Mantis), INTI (Giallo Inti) and LE MANS (Blu Le Mans) — for 3, 5 or
  10 laps, with live positions and gaps, a rubber band that keeps the pack
  in a fight, and full contact. The rivals share one merged copy of the car
  model (about 60 draw calls each instead of 850), each with its own V12
  mixed by distance, and drive a curvature-limited racing line with baked
  braking zones, taking the inside of corners and going round slower cars.
- **Contact** runs on momentum. Cars are boxes in track coordinates and the
  shallower overlap picks the contact normal. Along it the closing speed is
  exchanged as an impulse (equal masses, restitution 0.35) with a friction
  impulse across it, and each car's yaw impulse is the moment of those about
  its centre over the car's radius of gyration (I/m = 2.4 m²). Whether a car
  spins is that impulse against a stability threshold set by its role: the
  aggressor (the car moving into the contact) hitting with its nose is very
  hard to spin (2.8×), a car struck ahead of its centre is pushed wide rather
  than round (1.8×), and a car struck behind its centre goes round easily
  (0.55×). Below the threshold the impulse is a nudge. So a tailgate is a
  push, T-boning a rear quarter spins the other car and not you, and an
  offset rear-end shunt spins the car in front. Both cars scrub 12 % of the
  impulse as speed. A metallic crack, a crunch, camera shake and the hit
  counter fire on every contact. `ESC` returns to the menu.
- **NOS charges from drifting.** The tank fills at up to 0.30/s while
  sliding (slip angle and speed weighted) with only a 0.012/s trickle
  otherwise, so a lap of clean driving is not a full tank. Once a drift is
  under way it holds: the slip threshold drops from 0.22 to 0.09 rad, the
  state decays at 1.6/s instead of 3/s, and staying on the power keeps the
  rotation going. NOS in a drift is a **DRIFT BOOST**: 2× power and a 7 m/s²
  shove instead of 1.5× and 3 m/s², with a bigger purple flare.
- **After a spin** you are never stranded: under power the car can pivot on
  the spot, and if it is stopped facing backwards with the throttle down for
  more than half a second the nose swings round on its own (TURNING AROUND).
  `R` still resets to the track. The HUD's top-left carries the yellow
  LAMBORGHINI · REVUELTO badge, the course line, a line saying what you are
  playing (mode, laps, difficulty, camera) and click buttons for the music
  track and sound alongside the B and V keys.
- **Difficulty** for Versus, remembered between sessions. Easy, Medium, Hard
  and Impossible scale the rivals' cornering speed (0.88 / 1.12 / 1.20 /
  1.30) and top speed (317 / 349 / 360 / 374 km/h), how far the rubber band
  lets them fall back or pull ahead (from Medium up they never slow for
  you), how aggressive they are (never / 45 % / 75 % / always: with you in
  reach a rival lines up behind to shunt or leans on your door), whether
  they use NOS (not on Easy: a full tank on a straight with you within
  260 m, 1.15× target speed for four seconds, purple underglow), and how
  often one of them messes up (a wall-scraping run wide, a far-too-early
  brake, or a spin, every 16–36 s on Easy down to every 140–300 s on
  Impossible). Your own car scales too: power 1.0 / 1.08 / 1.16 / 1.25,
  grip up to 1.08, steering response and lock up to 1.32×, so it is faster
  and twitchier up the levels. NOS economy per level: Easy drains at 0.65×
  and charges at 1.8×; Impossible drains at 1.35× and charges at 0.6×.
- **Start gantry.** Two 11 m towers and a 24 × 6 m LED banner over the line:
  CORE FOCUS PRODUCTIONS sweeps in, LAMBORGHINI REVUELTO SIM · GOOD LUCK
  blinks under it, and every 15 s it cross-fades to the COREZ clip, all
  through an LED dot matrix.
- **Drive modes** Città (EV only, 180 CV), Strada, Sport (looser rear),
  Corsa (full power, most grip). `M` or `1`–`4`.
- **Circuit** 19.4 km on The Grid, in three dimensions: a 1.2 km main
  straight, a climb through turn one to a kicker jump with a real gap (about
  170 km/h to clear it), a steep dive to an underground hairpin, a 1.7 km
  back straight carrying a 28 m loop and a back-to-back double loop, a climb
  to a 300 m corkscrew that rolls the road through 360°, a second and longer
  jump, then THE SUMMIT: a 1.5 km straight climbing the wall to 262 m, a
  turn on top and THE PLUNGE, a 20° drop through the esses that has you at
  the limiter by the bottom, two overpasses crossing above the main straight, a chicane run under
  a tunnel, a 36 m loop and the canyon home. Rail physics: gravity acts along
  the slope, so loops need speed. Jumps are ballistic: land it and drive on,
  fall short or land beyond the verge and you're reset (the verge itself
  counts as a landing and nudges you back onto the tarmac) to a standing start
  350 m before the kicker for another run-up. In the air the flight follows
  most of the road's bend (both gaps curve left), so a clean straight
  take-off at any speed that clears the gap lands on the tarmac, while an
  angled take-off or a short flight still misses. Tunnels are placed automatically on the twistiest stretches.
  Lap timer with best lap persisted in the browser, minimap, hit counter.
- **Boundaries.** Light-walls run both sides all the way round, 2.4 m past
  the road edge. Hitting one applies a formula: speed retained
  `= 1 − 0.85·sin(impact angle)` (a glancing touch costs a few km/h, a
  head-on hit leaves 12 %), lateral velocity bounces with 0.35 restitution,
  the heading is straightened, and the hit counter, a crunch and a camera
  shake fire. Physics runs in track coordinates (distance along, offset
  across, heading against the tangent), which is what makes loops and
  inversions possible.
- **Music**, generated in Web Audio as placeholders until Corey's own tracks
  land. `B` cycles four tracks and off: **Downtempo 100** (Dm · Bb · F · C,
  swung, soft pads, sidechained) and **Dark Drive 120** (E Phrygian, four on
  the floor, a distorted two-saw sub through a resonant low-pass and a tanh
  drive bus, layered claps, offbeat hats, minor stabs, a sparse pentatonic
  lead into delay and an 8-bar noise riser), **Black Ice 130** (harmonic
  minor, a relentless kick, an octave-jumping sub through the drive, a cold
  pluck arpeggio, claps with a tail, a drone and an impact every 4 bars) and
  **Cyber Goth 110** (progressive: an offbeat rolling bass, ghosted snares
  late in the phrase, a slow-attack choir pad that gets gated in the back
  half, and a written eight-bar lead in E minor over Em C G D Em Am C Bm on
  a warm voice, a triangle with two soft detuned saws and a sub octave
  through a plucked low-pass into the delay, answered an octave down in the
  second half, with bells on the turn).
- **Volume** sliders in Settings (the ⚙ button top-left in game, or the
  start screen): CARS (engines, wind, tyres, the rivals), EFFECTS (hits,
  chimes, boosts, NOS, rings) and MUSIC on separate buses into the limiter,
  remembered between sessions. Cars default to 45 %.
- **Sound** is fully synthesised in Web Audio: a V12 firing-frequency
  oscillator bank (6 fires per rev) through a tanh drive, tracking low-pass,
  an intake band, lift-off exhaust crackle in Sport/Corsa, wind, tyre
  screech, gravel, and an EV whine in Città. No samples.
- **Rendering** Three.js r128 (vendored, no CDN): physically based car
  paint with clearcoat lit by a PMREM of the procedural sky, ACES tone
  mapping, soft shadows, bloom on the Y-signature lights. `G` toggles bloom.
  `C` cycles chase / close / bonnet / bumper / photo (orbiting) cameras.
- **Controls** keyboard, touch (on-screen buttons on phones/tablets) and
  gamepad (stick steer, triggers throttle/brake, bumpers shift, A handbrake).

## Eight worlds

Picked on the start screen (the page rebuilds itself for the choice, which
is remembered). Each is a Catmull-Rom loop of control points with its own
loops, jumps, corkscrews, caves and a theme that sets sky, fog, ground,
walls and dressing.

- **THE GRID** (Tron, 19.4 km): the original neon circuit.
- **THE SOURCE** (Matrix, 13.0 km): black world, code rain falling down
  the floor grid and on tall panels along both sides (a shader: columns
  with their own speed and phase, glyph cells flickering, bright heads and
  fading tails), green light-walls and lines, two loops, a corkscrew, a jump
  and an underground dive.
- **RED MESA** (desert, 11.9 km): a heightfield of sandstone mountains
  carved to the road (cuttings and embankments within 60 m, cliff walls
  where the noise says so), three caves through the ridges with rock shells
  and warm lamps, boulders and scrub, a gorge jump, blue sky and warm haze.
- **SUPERSONIC** (Green Hill, 14.3 km): bright grass with checkered dirt by
  the road, palms and sunflowers, three loops, a corkscrew and a jump, and
  441 gold rings along the road. A ring is 10 points. **Ten rings arm the
  NOS**; without them there is none, and firing it spends every ring you
  hold. **Twenty rings held** go SUPERSONIC: a swept fin rises out of the
  rear deck, the Tron light trail comes on and the car runs 20 % faster
  until the NOS is used. Rings respawn each lap.
- **TIMBERLINE** (forest, 12.1 km): a dusk sky, 11 000 pines, a summit
  start at 270 m, a long winding descent through hairpins and esses down to
  the valley, then a 1.6 km climb straight back up. Made for the handbrake.
- **DEEP BLUE** (under the sea, 12.4 km): the whole circuit runs inside a
  glass tube on the sea floor, ribs every 14 m and cyan lamps inside, legs
  down to the sand, a loop and a corkscrew inside the tube and a jump through
  open water between two tube ends. Dark rock, coral, seaweed, a shoal of 260
  fish on lazy circles round the tube, bubbles rising past the car, and the
  surface shimmering 200 m above. Deep blue fog.
- **WHITEOUT** (alpine, 11.3 km): overcast, snowing around the car, snowy
  pines, a ski lift crossing the mountain, red poles at the five jumps.
- **STRATOS** (monorail, 14.9 km): a rail 700 m up between two cloud decks,
  cumulus drifting past on both sides, holders and a neon strip under the
  road. Five jumps, four LED tunnels each in its own colour (cyan, magenta,
  green, orange: lit seams, fins and lamps in that colour) starting right
  after the landings, and **nine super pads** (the big magenta arrows) worth
  **+40 % speed** on the spot, capped at 425 km/h, one every two seconds.
  **The walls are soft**: they keep you on the rail with a tick and a nudge
  but never take your speed. **Overshoot a jump and you land on the tunnel
  roof** (ON THE ROOF): a dark deck with the tunnel's colour along its edges
  and a dashed line, its own soft edges, and you drive it to the end and
  drop back in (DROP IN). The lap ends on **THE STAIRCASE**: a turn and a
  half down round a tower, 80 m radius, 20 m a turn, with four super pads
  down it and out, in place of what used to be a hairpin.

Terrain colours are per vertex (height bands, slope-exposed rock, dirt
beside the road) over a fractal of rolling hills and ridges; a bucketed
nearest-road field at 20 m drives the carving, the cave hills and prop
placement.

## Hosting it (Firebase)

The game is live at **https://lambo-sim.web.app** on the Firebase project
`lambo-sim` (pinned in `Simulator/.firebaserc`).

`python3 Simulator/build.py` also writes `Simulator/dist/hosting/`: the page as
`index.html` with `revuelto.glb`, `poster.webm` and `poster2.webm` as separate
files the browser caches (the build copies them from `models/`).
`Simulator/firebase.json` points Firebase Hosting at that folder with sensible
cache headers. **All four files are committed** so a clone is a complete deploy
folder; a deploy that reports "found 1 files" means the binaries are missing.

First time on a new machine:

```
npm install -g firebase-tools
firebase login
git clone -b claude/lamborghini-revuelto-simulator-l7n9gt \
  https://github.com/corefocusnz/bowotto.git ~/lambo-sim
cd ~/lambo-sim/Simulator
firebase deploy --only hosting          # expect: found 4 files in dist/hosting
```

Every update after that, in the same folder:

```
git pull
firebase deploy --only hosting
```

Any other static host (GitHub Pages, Netlify) can serve the same folder.

## The COREZ board

The poster board near the start shows whatever sits in `models/` as
`poster.webm` or `poster.mp4` (a muted, looping video texture) or, failing
that, `poster.png` / `.jpg` / `.webp`; `build.py` embeds it. For the
published page keep a clip under about 2 MB (the page has a 16 MB cap and
the car model uses 12.5 MB of it): 720 px wide, 6 to 10 s, VP9 WebM or H.264
MP4. While the game is running you can also drag a picture or a clip onto
the page to preview it on the board without rebuilding.

## Making it look like the real car

The sim ships with a 505k-triangle Revuelto model baked in (see Credits). A
procedural fallback body with the Revuelto's proportions is used when no
model is present (`build.py --no-model`). To swap in a different mesh:

1. Get a Revuelto model (Sketchfab, CGTrader, TurboSquid, or your own) as
   OBJ / FBX / glTF and put it anywhere on disk (or commit it to the repo
   under `Simulator/models/`).
2. Convert it. No Blender needed; the converter runs Three.js loaders and the
   glTF exporter inside headless Chromium:

   ```
   node Simulator/tools/convert-model.js model.fbx out.glb --front=+Z --weld --jpeg --max-texture=2048 --preview shot.png
   python3 Simulator/tools/quantize-glb.py out.glb Simulator/models/revuelto.glb
   ```

   The quantizer halves the file (16-bit positions, 8-bit normals) so a
   large model still fits the single-file build, which deflates it again.

   It scales the car to 4.947 m, rests it on the ground, points the nose the
   right way (`--front` names the axis the source model's nose faces), tags
   wheel parts as `wheel_fl/fr/rl/rr` pivots so they spin and steer, marks
   paint materials so `P` recolours them, and writes a GLB with embedded
   textures. `--preview` renders it inside the sim's lighting.
   `blender/revuelto_export.py` does the same job inside Blender if you
   prefer, and can add a Cycles hero still with `--render`.
3. Drop `revuelto.glb` onto the sim window, or leave it next to
   `index.html` and it loads on start. `Y` rotates a model whose nose axis
   was guessed wrong.

Blender is a modelling and offline renderer, not a real-time engine. For a
true photoreal *playable* sim the next step up is Unreal Engine 5 or Unity
with the same GLB; this repo's physics constants transfer directly.

## Credits

Car model: **"Lamborghini Revuelto" by DRIVER-FIRE** (https://skfb.ly/pM6pA),
licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
See `models/LICENSE.md`. The credit must stay with any copy of the sim that
includes the model. Three.js is MIT
(`vendor/LICENSE.three.js`).

## Layout

```
Simulator/index.html        dev page (loads vendor/*.js, sim.css, sim.js)
Simulator/sim.js            world, car, physics, audio, HUD
Simulator/sim.css           HUD styling
Simulator/vendor/           Three.js r128 + example passes (MIT)
Simulator/tools/            convert-model.js (headless model converter)
Simulator/models/           Revuelto model (source + converted) and its licence
Simulator/blender/          Blender export + hero-render script
Simulator/build.py          bundles into dist/revuelto.html (single file)
Simulator/dist/             built output (committed for convenience)
```

Rebuild the single file after editing: `python3 Simulator/build.py`
(embeds `models/revuelto.glb`; add `--no-model` for the small procedural build).
