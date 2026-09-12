# Making things for the game in Blender

Everything here goes through **glTF 2.0 (.glb)** — it is the only format the
tools read, and Blender exports it natively. There are three kinds of thing you
can make, in rising order of effort.

---

## 1. Props — crates, terminals, barrels, signs, turrets, anything static

The easiest and the most useful. A prop is one static mesh placed on the map.

**In Blender**

1. Model the thing. Keep it under ~20k triangles — this is a WebGL1 game and a
   phone has to draw it.
2. UV unwrap it and give it a material with a **Base Color** image texture.
   Optionally add an **Emission** image texture; the game adds that on top,
   unlit, which is what makes the Tron suits glow.
3. Apply your modifiers and transforms (`Ctrl+A` → All Transforms). The exporter
   bakes world transforms, but applied is predictable.
4. **File → Export → glTF 2.0 (.glb)**, with:
   - Format: **glTF Binary (.glb)**
   - Include: **Selected Objects** if you only want part of the scene
   - Data → Mesh: **UVs**, **Normals**
   - Data → Material: **Export** (not "No export")
   - Compression: **off** (the loader does not do Draco)

**In the repo**

```sh
# bake the geometry (--height scales it to that many metres tall)
node tools/extract-prop.js ~/Desktop/crate.glb crate assets/models --height=0.9

# pull its textures down to 512px jpgs and register them
node tools/extract-character-textures.js ~/Desktop/crate.glb crate assets/models

# put it on the map (world metres; +z is toward red, y is up)
node tools/place-prop.js add crate -4 0 12 --yaw=30
node tools/place-prop.js list
node tools/place-prop.js rm 0          # undo one
node tools/place-prop.js clear crate   # undo all of that prop
```

`extract-prop.js` moves the origin to the centre of the base, so the `y` you
pass is the floor height the prop stands on. Map coordinates are the same ones
used in `js/map2fort.js`, so you can read a position straight out of the map
source.

Props have **no collision** — players walk through them. They are set dressing.
For something solid, build it out of voxels in `js/map2fort.js` instead, and use
a prop only for the detail that voxels cannot express.

---

## 2. Characters — a new class model or a new team skin

**In Blender**

Same as a prop, plus:

- The mesh must be **rigged and skinned** to an armature. The game does not read
  animation clips (it generates all animation procedurally), so you do **not**
  need to animate anything — a bind pose is enough.
- Bone names matter. `tools/extract-character.js` retargets whatever skeleton
  you supply onto the game's 23-bone rig using an alias table that already
  covers Valve (`bip_spine_2`), Mixamo/`jt_`-style, and Unreal-style naming. A
  Rigify or Mixamo rig will map with no work. An invented naming scheme will
  need a few lines added to `ALIAS` in that file.
- Model facing **-Y** (Blender's front view) with **+Z up**; the exporter
  converts to the game's Y-up. The extractor also sanity-checks facing from the
  eye meshes, so eyes as separate objects or materials help.
- Export with **Data → Skinning** ticked.

**In the repo**

```sh
node tools/extract-character.js ~/Desktop/robot.glb robot assets/models \
  --set=tron --slot=blue --label="Tron" --credit="Me, 2026"
node tools/extract-character-textures.js ~/Desktop/robot.glb robot assets/models
```

`--set` is the entry in the Skins menu. `--slot=blue|red` makes it a whole-team
suit; pass a class id instead (`--slot=scout`, `--slot=hwguy`) to make it one
class of a per-class set like the TF2 mercenaries — the tool infers `mode` from
the slot, and `--mode=team|class` overrides it. `--glow=false` turns off the
emissive team tint, which you want for anything that is not a light-up suit.

The class ids are `scout sniper soldier demoman medic hwguy pyro spy engineer`
(note `hwguy`, not `heavy` — `heavy` is the *model* name in the mercenary set).

Then check it:

```sh
# the screenshot tools drive the real game, so serve it first
python3 -m http.server 8099 &
export GAME_URL=http://localhost:8099/index.html

node tools/portrait.js out.png soldier 0 1 idle   # one class, lit, close up
node tools/lineup.js out.png                      # every class, side by side
node test/browser.test.js "$GAME_URL"             # every group must find its texture
```

`portrait.js` and `lineup.js` take **class ids**, not model names — they
photograph whichever set is active, so switch sets in the Skins menu (or via
`window.__setSkin('tron')`) to shoot a team suit.

The mercenary set contains no Demoman, so he is GENERATED rather than imported:

```
node tools/make-demoman.js            # builds the mesh onto the shared rig
node tools/make-demoman-texture.js    # paints his 16-band texture
```

It reads the Soldier's bones and reuses them verbatim, lays primitives out around
that skeleton, and skins each vertex to the nearest bones of a per-part
whitelist. Reusing the rig is the whole trick: the procedural animation was
written against those bone orientations, so he walks, aims and grips a weapon for
free. The whitelist is what stops a chest vertex binding to an elbow.

If you would rather model him properly in Blender, export a rigged GLB and run it
through `extract-character.js --slot=demoman` — that overrides the generated one,
and is the better answer if you want him to look like anything in particular.

---

## 3. Map geometry

This one does not have a clean path yet, and it is worth being honest about why.

The map is not a mesh. `js/map2fort.js` builds a 0.5 m **voxel volume**, and
everything downstream depends on that: collision is swept AABB against voxels,
the bots navigate a waypoint graph over it, the lighting bakes ambient
occlusion and sun shadows by raycasting through it, and the renderer greedy-
meshes it into a handful of draw calls. A mesh dropped in as one big prop would
have none of that — you would fall through it, in the dark, with bots standing
still.

So importing a Blender map means three separate things: the visual mesh, a
voxelisation of it for collision, and a generated waypoint graph. That is real
work, and it is the right work if you want the Arq Grid map. Say the word and
it is a project rather than a command.

What *does* work today, right now, with no new code: **detail the existing 2Fort
with props.** Lights, pipes, railings, signage, computer banks, crates in the
battlements. The map reads blocky because it is built of 0.5 m cubes; props are
how you break that silhouette up.

---

## Budgets

| | ceiling | why |
|---|---|---|
| triangles per prop | ~20k | a phone GPU, WebGL1, no instancing |
| texture size | 512×512 | the tools downscale to this automatically |
| bones per character | 23 | the vertex shader's uniform array is fixed |
| placed props | a few dozen | each one is a draw call |

Textures are re-encoded to JPEG at 512px by
`tools/extract-character-textures.js`, so export them at whatever resolution
you like — a 4096×4096 map comes out at ~14 KB.
