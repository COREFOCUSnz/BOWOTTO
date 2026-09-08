# REVUELTO SIM

A browser driving simulator of the Lamborghini Revuelto (LB744), built next to
THE BOWOTTO as a side project. Open `dist/revuelto.html` in any modern browser
(Chrome / Edge / Safari / Firefox), press START ENGINE, turn the volume up.

## What is in it

- **Vehicle model** tuned to the real car: 1900 kg, 2.779 m wheelbase, 1015 CV
  combined, AWD launch, 8-speed DCT with auto or paddle shifting, 9500 rpm
  redline, drag-limited top speed. Bench numbers from the headless test:
  0–100 km/h 2.7 s, 0–200 km/h 6.9 s, 100–0 km/h in 30 m, v-max 343 km/h.
- **Drive modes** Città (EV only, 180 CV), Strada, Sport (looser rear),
  Corsa (full power, most grip). `M` or `1`–`4`.
- **Circuit** 5.1 km "Autodromo di Core Focus": a 1 km straight, kerbed
  corners, gravel verges (off-track costs grip and speed), start gantry,
  lap timer with best lap persisted in the browser, minimap.
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
