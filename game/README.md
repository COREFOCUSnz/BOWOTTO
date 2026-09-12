# 2Fort — a browser tribute to Team Fortress Classic

A first-person capture-the-flag game in the spirit of *Half-Life: Team Fortress
Classic* on its most famous map, **2Fort**. Two mirrored forts face each other
across a moat with a covered bridge; each fort has a front lobby, a ramp room up
to the battlements (sniper deck), an upper hall with a ramp down the back, a
spiral down to the flag room in the basement, a respawn room with resupply bags,
and the underwater tunnel into a well that spills into the basement.

Nine classes, TFC-style weapons, hand grenades with a 4-second fuse, rocket
jumps, concussion jumps, sentry guns, spies, and bots for both teams. Players
are skinned 3D character models, animated procedurally and recoloured per team.

Everything is plain JavaScript + WebGL. **No build step, no dependencies, no
network needed.** It runs from a plain file and from any static host such as
Firebase Hosting.

## Play it locally

**Serve the folder** — browsers refuse `fetch()` on `file://`, so the character
models only load over http. Opening `index.html` directly still plays, with the
original blocky players instead.

```
cd game
python3 -m http.server 8080        # or: npx http-server -p 8080
# then open http://localhost:8080
```

Click the game to capture the mouse. `Esc` opens the menu.

## On a phone

Open the same URL on a phone or tablet, turn it sideways, and the game switches
itself to touch: drag the left of the screen to move (the stick appears under
your thumb), drag the right to look, and use the on-screen buttons to fire,
jump, throw grenades, pick weapons and trigger the class action (build, detonate,
disguise or zoom). A portrait phone is asked to rotate, and the first tap goes
fullscreen and locks to landscape where the browser allows it.

Phones get smaller defaults on first run: four players per team, a lower render
scale and light aim assist. All three are in Settings, along with touch look
speed and an effects budget. Characters, weapons, projectiles and particles are
culled by distance and by the camera's cone, because each of those is its own
draw call and that is what actually costs on a phone.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look |
| Left click | Fire (hold to charge the sniper rifle) |
| Right click | Sniper zoom / Demoman detonate pipebombs |
| Space | Jump / swim up |
| Ctrl or Shift | Swim down |
| 1–4, mouse wheel | Weapons |
| Q | Last weapon (Spy: disguise) |
| G / F | Hold to prime grenade 1 / 2, release to throw — it explodes after 4 s whether or not you threw it |
| E | Engineer: build a sentry gun (130 cells) |
| R | Demoman: detonate pipebombs |
| M / N | Change class / team |
| Tab | Scoreboard |
| Esc | Menu, settings, bot count |
| F1 / F2 | Controls / How to play |

The in-game menu carries the full briefing: **Controls** lists every key, and
**How to play** covers the objective, the three routes into the enemy fort,
a step-by-step guide to building and upgrading a sentry gun, and notes on all
nine classes.

## Rules

Grab the enemy flag from their basement and carry it to your own flag room.
Ten points per capture, first to ten captures or the 20-minute timer wins.
Dropped flags return after 60 seconds. Touch a resupply bag in your spawn room
for full health, armor, ammo and grenades. Health and ammo packs are scattered
around each fort.

## Classes

Scout (fast, concs), Sniper (charge shots, headshots, leg shots slow), Soldier
(rockets and heavy armor), Demoman (bouncing pipes, remote pipebombs, MIRV),
Medic (medikit heals teammates and infects enemies, super nailgun), HWGuy
(assault cannon with spin-up), Pyro (flamethrower, incendiary cannon, napalm),
Spy (disguise, tranquilizer, backstab), Engineer (railgun, sentry gun — hit it
with the spanner to repair, or upgrade it for 130 cells).

The sentry is modelled per level: a tripod with a single barrel at level 1,
twin barrels and an ammo hopper at level 2, and an armoured head with a
four-tube rocket pod at level 3. Barrels recoil when it fires, the status light
turns red on a target, a damaged gun smokes, and while it is being built it
rises out of the engineer's toolbox.

## Hosting on Firebase

The folder already contains `firebase.json` (serves this directory as a static
site) and `.firebaserc` pointing at the project **team-fort-4925a**. To publish:

```
npm install -g firebase-tools
firebase login
cd game
firebase deploy --only hosting
```

The game is then live at **https://team-fort-4925a.web.app** (also
`https://team-fort-4925a.firebaseapp.com`). Send your friends that link. Each of them gets their own game against
bots — this version is **single-player with bots**. Online multiplayer is the
natural next step: the simulation (`js/sim.js`) is deterministic and
DOM-free, so a host-authoritative netcode over Firebase Realtime Database or
WebRTC can drive the same code with remote inputs.

## Lighting and materials

The world is a voxel grid, and flat-lit voxels are what read as blocky. Two
things fix that, both baked into the mesh when the map loads:

- **Ambient occlusion.** Every face corner samples its three neighbouring voxels,
  so creases, doorways and the undersides of ledges darken. Greedy meshing only
  merges faces whose occlusion matches, which is why the mesh grew from about
  4,400 to 18,000 vertices — still trivial, and worth it.
- **Baked fixture light.** The 35 ceiling lamps cast real light with a visibility
  check, so interiors are lit by lamps in pools rather than by a flat ambient
  term. Indoors the sun contributes little, which is what gives the basement its
  gloom and the flag room its warm patch of floor.
- **Baked sun shadows.** Every outward face that points at the sun traces one ray
  to see whether anything blocks it. Faces merge only when their shadow state
  matches, so shadow edges stay crisp at voxel resolution rather than smearing
  across a wall. The bridge and the fort walls now throw shadows onto the ground.
- **Contact shadows.** A soft ellipse under each character and sentry, sized and
  faded by how far above the floor they are, so nothing looks like it is
  hovering.

Materials carry per-brick variation, grime, panel seams, bolts and plank grain
rather than a single flat tint. Team-coloured rooms are concrete with a band at
eye height instead of six faces of solid colour.

## Skins

Character sets are chosen in game under **Skins** on the main menu. Two ship:

| Set | How it works |
| --- | --- |
| **Tron** (default) | One suit per team. Team colour is painted through the model's emissive map, so the circuitry glows cyan for Blue and orange for Red, readable even in a dark basement. Class silhouettes are kept apart by scale, so a HWGuy still stands taller than a Scout. |
| **Team Fortress 2** | A different model for each of the nine classes (the Demoman shares the Soldier's). Team colour is a shader repaint of strongly red-dominant cloth, leaving skin, the Medic's white coat and the Sniper's khaki alone. |

**None of the source models contain animation clips.** Every pose is generated at
runtime: eulers drive the spine, head and run cycle, and two-bone inverse
kinematics puts both hands on whichever weapon the player is holding. A new model
inherits all of that for free, and no model will ever bring animation with it.

### Adding a skin set

The menu is built from `assets/models/models.json`, so a new set needs no code
change. For a set with one suit per team:

```
node tools/extract-character.js suit_blue.glb myset_blue assets/models \
  --set=myset --label="My Set" --slot=blue --credit="Model by X (CC BY)"
node tools/extract-character-textures.js suit_blue.glb myset_blue assets/models

node tools/extract-character.js suit_red.glb myset_red assets/models --set=myset --slot=red
node tools/extract-character-textures.js suit_red.glb myset_red assets/models
```

It appears under Skins the next time the game loads, and its credit line appears
on the Credits screen.

The extractor retargets whatever skeleton the source uses onto a shared 23-bone
rig. Three naming conventions are handled so far (Valve `bip_*`, the `jt_*`
convention and the Unreal-style skeleton); a new one means adding its names to
the alias table at the top of `tools/extract-character.js`. Source files must be
**glTF or GLB** — FBX and USDZ cannot be read here.

### Props

Static set dressing — crates, terminals, signage, anything modelled in Blender —
goes in without touching the map source:

```
node tools/extract-prop.js crate.glb crate assets/models --height=0.9
node tools/extract-character-textures.js crate.glb crate assets/models
node tools/place-prop.js add crate -4 0 12 --yaw=30
node tools/place-prop.js list
```

Props are drawn through the skinned path with a single bone carrying the
placement matrix, so they cost no extra renderer code — and they have **no
collision**. Anything solid belongs in the voxel map in `js/map2fort.js`.

`BLENDER.md` walks through the whole asset pipeline from the Blender side:
export settings, budgets, what the rig needs, and why map geometry is harder
than it looks.

## Screens

There is a screen on the wall of each spawn room, facing you as you come out.
It plays whatever you put in `assets/screens/`:

```
cp my-advert.mp4 assets/screens/
# then set "media": "my-advert.mp4" in assets/screens/screens.json
```

`.mp4` / `.webm` play as looping muted video, `.png` / `.jpg` show as a still,
and with `media` left null you get a built-in placeholder. A 16:9 clip around
1280x720 is plenty — the panel is 2.6 m wide and you see it from a few metres.
Keep it under about 8 MB so the level does not stall on a phone; it loads lazily
and the placeholder shows until it is ready.

To preview something without editing the config, append `?screen=<url>` to the
game URL. That is also how the browser test checks the panel: it feeds in a
magenta image and reads the frame back to confirm the wall went magenta.

Browsers block autoplay until the page has been interacted with, so the video
starts when the player clicks through the menu.

## Credits

Tron: **"Tron Willow"** and **"Ares (Tron) Helmet"** by **SpringSociety**.
Team Fortress 2: **"All of the team Fortress 2 red team Mercenaries"** by
**inonshalev42**. All published on Sketchfab under **Creative Commons
Attribution (CC BY)**. See `assets/models/CREDITS.txt` for what was changed; the
in-game Credits screen carries the same attribution.

Team Fortress is a trademark of Valve Corporation and Tron is a trademark of
Disney. Neither is affiliated with this project, and no game files from either
are used: the map, weapons, sounds and code are original.

## Layout

```
index.html        HUD, menus, styling
js/math.js        vec3 / mat4 helpers
js/world.js       voxel world: fill/carve, ramps, water, collision, raycast, greedy mesher
js/map2fort.js    the map — rooms, ramps, water, spawns, items, bot waypoint graph
js/defs.js        classes, weapons, grenades (TFC numbers scaled to metres)
js/render.js      WebGL renderer: procedural brick/concrete/metal/wood/water shaders, sky, fog, skinned characters
js/weaponmodels.js cube-built models for all 18 weapons and the three sentry levels
js/model.js       .tfm loader, bone hierarchy, GPU skinning, procedural animation + IK
js/audio.js       synthesized sound effects + speech announcer
js/sim.js         movement, weapons, projectiles, grenades, damage, flags, items, sentries
js/bots.js        A* over waypoints, roles (offense / defense / sniper), aiming, weapon choice
js/game.js        input, HUD, menus, entity drawing, main loop
tools/            asset pipeline (glTF reader, model/texture extractors) and screenshot tools
assets/models/    extracted character meshes and textures
test/             benches (see below)
```

## Tests

```
npm test                 # map bench + bot match + difficulty bench (node, no browser)
node test/sim.test.js 8  # longer bot match
npm run test:mobile      # emulated landscape phone: drives the touch controls end to end
npm run test:browser     # headless Chromium over file:// (checks the blocky fallback)
GAME_URL=http://localhost:8080/index.html npm run test:browser   # ...and the model path
node test/vfx.test.js    # explosion visibility + the demoman's kit (needs a server; slow)
node test/feel.test.js   # weapon feel: recoil, bob, turn lag, hit confirmation
```

`test/map.test.js` walks a simulated player through every route (spawn → enemy
flag → home, the water route, vaulting the battlements) and fails if it gets
stuck. `test/sim.test.js` runs bots against bots and fails on NaNs, on bots
that never move, on a match with no kills or no flag activity.

`test/vfx.test.js` is a *visual* bench: it screenshots the game and measures
pixels. It answers two questions a stability test cannot.

**Can you still see the fight?** It fires a rocket blast 5 m from the camera and
measures what fraction of the view the explosion takes away, and for how long.
The effect is stepped by hand — particle lifetimes are driven directly with the
sim frozen — because a 0.3 s effect cannot be sampled by wall clock at the 2-5
fps the headless software rasterizer manages. `Math.random` is seeded
immediately before the blast, since every puff is randomised. There is a floor
as well as a ceiling: tuning an explosion down to nothing would otherwise pass
every budget.

**Are things that behave differently drawn differently?** The grenade launcher
and the pipebomb launcher were the same model with one blinking pixel between
them for a long time, which nothing but a pixel comparison catches. Each is
rendered alone and compared, with the same model rendered twice as a control.
The pipebomb team band is checked by measuring team-coloured pixels around the
bomb rather than diffing frames — a proxy you have to subtract noise from is
worse than measuring the thing itself.

Explosion coverage is computed **analytically** — every live particle is
projected as a sphere and stamped on a coarse grid — rather than by screenshotting
the game. It has to be: rendering one frame costs ten to twenty seconds here, and
sampling a blast needs dozens, so the screenshot version could not finish inside
ten minutes. The analytic measure was validated against the pixel one on the same
blasts (8.4 vs 8.1, 11.5 vs 11.9, 14.7 vs 14.2) and reads slightly high on the
faded tail, which is the safe direction for a ceiling. Being free, it averages
eight effect seeds instead of trusting one: the same explosion measures 21% peak
on one seed and 13% on another, so a budget within a few points of the mean would
be measuring the dice.

The parts that genuinely need rendering — are the two launchers different models,
is a pipebomb painted in its team's colours — read the GL back buffer in the page
and compare there, which is why `js/render.js` enables `preserveDrawingBuffer`
for the `?readback` query this bench loads with. Reading the buffer also skips
the DOM HUD entirely; an earlier screenshot version had to hide it, guessed the
element ids wrong, and spent a while blaming the game for orange HUD text it was
counting as "team red" pixels.

Every budget was checked against the behaviour it exists to catch: with the
original explosion restored, the bench reports 63.5% peak, 38% glare, 63.5% still
in the way as it dies and 0.90s, and rejects all four.

`test/feel.test.js` asks whether the gun in your hands reacts to you: does it
kick when you fire, settle at its own weapon's pace, overshoot past rest rather
than sliding home, bob and roll when you run, lag when you swing the view, and
tell you when a shot lands. "Feel" sounds unmeasurable and mostly is not — each
of those is an off-vs-on question with a number on it.

It drives the real sim and the real viewmodel code through `window.__stepFeel`
at a **fixed timestep with no rendering at all**, which is why `viewModelPose()`
lives outside the draw call. Frame-sampling was tried first and cannot work
here: this environment draws the game at roughly 1.3 fps — draw-call overhead
under the software rasterizer, not fill rate, since dropping the render
resolution to a postage stamp changed nothing — so a 60 ms animation is
invisible to it. A fixed timestep also makes every number exact and identical on
any machine. Only the hit-confirmation section needs real frames, and only a
handful.
