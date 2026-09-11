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

## Characters

The nine classes use eight skinned character models (the Demoman shares the
Soldier's, see Credits). The source model has no animation clips, so every pose
is generated at runtime: eulers drive the spine, head and run cycle, and
two-bone IK puts both hands on whichever weapon the player is holding. Team
colour is applied in the fragment shader — it repaints only strongly
red-dominant cloth, so skin, the Medic's white coat and the Sniper's khaki stay
as the artist painted them.

Assets live in `assets/models/` (1.9 MB total: eight quantised meshes on a
shared 23-bone rig, plus 21 JPEG textures). Rebuild them from the source glTF
with:

```
tools/build-assets.sh /path/to/mercenaries.glb
```

## Credits

Character models: **"All of the team Fortress 2 red team Mercenaries" by
inonshalev42**, published on Sketchfab under **Creative Commons Attribution
(CC BY)**. See `assets/models/CREDITS.txt` for what was changed. The in-game
Credits screen carries the same attribution.

Team Fortress is a trademark of Valve Corporation, which is not affiliated with
this project. No Valve game files are used: the map, weapons, sounds and code
are original.

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
npm run test:browser     # headless Chromium over file:// (checks the blocky fallback)
GAME_URL=http://localhost:8080/index.html npm run test:browser   # ...and the model path
```

`test/map.test.js` walks a simulated player through every route (spawn → enemy
flag → home, the water route, vaulting the battlements) and fails if it gets
stuck. `test/sim.test.js` runs bots against bots and fails on NaNs, on bots
that never move, on a match with no kills or no flag activity.
