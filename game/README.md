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
```

`test/map.test.js` walks a simulated player through every route (spawn → enemy
flag → home, the water route, vaulting the battlements) and fails if it gets
stuck. `test/sim.test.js` runs bots against bots and fails on NaNs, on bots
that never move, on a match with no kills or no flag activity.
