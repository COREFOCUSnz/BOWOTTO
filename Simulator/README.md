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
- **Controls** keyboard, touch (on-screen buttons on phones/tablets) and
  gamepad (stick steer, triggers throttle/brake, bumpers shift, A handbrake).

## Making it look like the real car

The built-in body is a low-poly loft that has the Revuelto's proportions,
not its surfacing. The intended path to a photoreal car is:

1. Get a Revuelto model (Sketchfab, CGTrader, TurboSquid, or your own) as
   FBX / OBJ / glTF.
2. Run the Blender prep script, which orients, scales, wheel-tags and
   exports a GLB:

   ```
   blender --background --python Simulator/blender/revuelto_export.py -- model.fbx revuelto.glb
   ```

   Add `--render hero.png` to also get a Cycles beauty still. See the
   docstring in `blender/revuelto_export.py` for the naming conventions.
3. Drop `revuelto.glb` onto the sim window (or put it next to `index.html`).
   Wheels named `wheel_fl/fr/rl/rr` spin and steer; paint materials follow
   the `P` paint key. `Y` rotates a model whose front axis is wrong.

Blender is a modelling and offline renderer, not a real-time engine. For a
true photoreal *playable* sim the next step up is Unreal Engine 5 or Unity
with the same GLB; this repo's physics constants transfer directly.

## Layout

```
Simulator/index.html        dev page (loads vendor/*.js, sim.css, sim.js)
Simulator/sim.js            world, car, physics, audio, HUD
Simulator/sim.css           HUD styling
Simulator/vendor/           Three.js r128 + example passes (MIT)
Simulator/blender/          Blender export + hero-render script
Simulator/build.py          bundles into dist/revuelto.html (single file)
Simulator/dist/             built output (committed for convenience)
```

Rebuild the single file after editing: `python3 Simulator/build.py`.
