# REVUELTO SIM

A browser driving simulator of the Lamborghini Revuelto (LB744), built next to
THE BOWOTTO as a side project. Open `dist/revuelto.html` in any modern browser
(Chrome / Edge / Safari / Firefox), press START ENGINE, turn the volume up.

## What is in it

- **Vehicle model** tuned to the real car: 1900 kg, 2.779 m wheelbase, 1015 CV
  combined, AWD launch, 8-speed DCT with auto or paddle shifting, 9500 rpm
  redline, drag-limited top speed. Bench numbers from the headless test:
  0–100 km/h 2.7 s, 0–200 km/h 6.9 s, 100–0 km/h in 30 m, v-max 343 km/h.
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
- **After a spin** you are never stranded: under power the car can pivot on
  the spot, and if it is stopped facing backwards with the throttle down for
  more than half a second the nose swings round on its own (TURNING AROUND).
  `R` still resets to the track. The HUD's top-left has click buttons for
  the music track and sound alongside the B and V keys.
- **Difficulty** for Versus, remembered between sessions: Easy, Medium, Hard,
  Impossible scale the rivals' cornering speed (0.86 / 0.95 / 1.02 / 1.12),
  top speed (310 / 331 / 346 / 364 km/h) and how far the rubber band lets
  them fall back or pull ahead; on Impossible they never slow for you.
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
  fall short or land on the verge and you're reset to a standing start
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
  land. `B` cycles two tracks and off: **Downtempo 100** (Dm · Bb · F · C,
  swung, soft pads, sidechained) and **Dark Drive 120** (E Phrygian, four on
  the floor, a distorted two-saw sub through a resonant low-pass and a tanh
  drive bus, layered claps, offbeat hats, minor stabs, a sparse pentatonic
  lead into delay and an 8-bar noise riser).
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
