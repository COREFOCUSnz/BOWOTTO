# 2Fort — a browser tribute to Team Fortress Classic

A first-person capture-the-flag game in the spirit of *Half-Life: Team Fortress
Classic* on its most famous map, **2Fort**. Two mirrored forts face each other
across a moat with a covered bridge; each fort has a front lobby, a ramp room up
to the battlements (sniper deck), an upper hall with a ramp down the back, a
spiral down to the flag room in the basement, a respawn room with resupply bags,
and the underwater tunnel into a well that spills into the basement.

Nine classes, TFC-style weapons, hand grenades with a 4-second fuse, rocket
jumps, concussion jumps, sentry guns, spies, and bots for both teams.

Everything is plain JavaScript + WebGL. **No build step, no dependencies, no
network needed.** It runs from a plain file and from any static host such as
Firebase Hosting.

## Play it locally

Option 1 — just open `index.html` in Chrome, Edge or Firefox.

Option 2 — serve the folder (recommended; pointer lock is happiest on http):

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

## Layout

```
index.html        HUD, menus, styling
js/math.js        vec3 / mat4 helpers
js/world.js       voxel world: fill/carve, ramps, water, collision, raycast, greedy mesher
js/map2fort.js    the map — rooms, ramps, water, spawns, items, bot waypoint graph
js/defs.js        classes, weapons, grenades (TFC numbers scaled to metres)
js/render.js      WebGL renderer: procedural brick/concrete/metal/wood/water shaders, sky, fog
js/audio.js       synthesized sound effects + speech announcer
js/sim.js         movement, weapons, projectiles, grenades, damage, flags, items, sentries
js/bots.js        A* over waypoints, roles (offense / defense / sniper), aiming, weapon choice
js/game.js        input, HUD, menus, entity drawing, main loop
test/             benches (see below)
```

## Tests

```
npm test                 # map bench + 3-minute headless bot match (node, no browser)
node test/sim.test.js 8  # longer bot match
npm run test:browser     # headless Chromium: loads the game, joins, fires every weapon, screenshots
```

`test/map.test.js` walks a simulated player through every route (spawn → enemy
flag → home, the water route, vaulting the battlements) and fails if it gets
stuck. `test/sim.test.js` runs bots against bots and fails on NaNs, on bots
that never move, on a match with no kills or no flag activity.
