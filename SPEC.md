# THE BOWOTTO — locked spec

**Core Focus Productions** · Built for **Otto** — grunge guitarist, Big Muff
devotee, vintage pedals, Smashing Pumpkins-school rock.
Twelfth plugin in the family / THE ORION PACK.

Sibling to **THE TOA**. Where the Toa is a 5150 built for Samoan metal, the
Bowotto is a **Big Muff into a vintage British stack** — and it has the one
feature no amp sim has: the guitar turns into a **violin**.

---

## Why the violin belongs on a grunge plugin

This is not a novelty bolted onto an amp. Otto's reference band built two of
its biggest records on exactly this move: *Siamese Dream* and *Mellon Collie*
put a wall of Big Muff guitars next to a real string section — "Disarm",
"Tonight, Tonight" (Chicago Symphony). The guitarist's own instinct on those
records was *guitar and strings are the same gesture at different speeds.*

THE BOWOTTO puts both ends of that gesture on one knob.

## The name

BOW (the string engine, lifted from its sibling THE BOW) + OTTO. The plugin is
the two halves of its own name.

---

## Signal chain

```
[ TUNER ] (parallel, non-destructive display)
    |
IN -> GATE -> BIG MUFF (fuzz) -> VINTAGE STACK preamp (4x OS)
   -> TONE STACK -> [ MORPH ] -> CAB  ......................  guitar path
                             \-> VIOLIN ENGINE ............  violin path
   -> PHASER -> CHORUS -> TAPE ECHO -> REVERB -> OUT
```

`MORPH` crossfades the guitar path into the violin path. It **replaces the
cab** rather than stacking on it — a guitar cabinet and a violin body are both
the instrument's radiating box, and running both gives you neither.

**Tuner** is a parallel frequency detector (doesn't affect audio flow). Shows
note + cents offset, always available.

**Pedal chain** (post-morph): Phaser → Chorus → Echo (tape) → Reverb, each
with independent on/off.

## The two engines

### 1. BIG MUFF — the fuzz

A four-stage model of the Pi circuit, because the Muff is Otto's sound and a
generic distortion will not pass:

| Stage | What it is |
|---|---|
| Input | coupling highpass — the Muff's thin, tight front end |
| Clip 1 | transistor gain + diode pair in the feedback loop, soft symmetric clip, feedback lowpass for the rounded top |
| Clip 2 | the same again — cascaded clipping is why the Muff sustains like it does |
| **Tone stack** | **the signature.** A lowpass branch (~340 Hz) and a highpass branch (~1.7 kHz) summed at a junction. Between them the two branches fight and leave the famous **mid scoop at ~750 Hz** |
| Volume | output |

`SUSTAIN` drives the clipping stages. `TONE` blends the two branches.
`SCOOP` exposes the notch depth as a control — stock Muff at 12 o'clock, or
dialled back for the mid-forward version players mod theirs to get.

### 2. VIOLIN ENGINE — the morph

This does **not** re-synthesize the note from a pitch tracker. Pitch tracking
is monophonic, latent and glitches on chords, and Otto plays chords. Instead
the engine does to the guitar what a bow does to a string — physically, on the
audio, so it works on chords and stays expressive:

| Block | What it does |
|---|---|
| **SWELL** | an asymmetric envelope divider (the Slow Gear move) removes the *pick attack*. A bowed note has no transient — this is the single biggest cue |
| **SUSTAIN** | high-ratio compression with slow release, so the note holds the way a bow sustains instead of decaying like a plucked string |
| **ROSIN** | bandpassed noise scaled by the envelope — the friction/scrape layer, lifted from THE BOW's bow-force model |
| **VIBRATO** | 5–7 Hz modulated delay line, depth in cents, with the amplitude component a real player adds |
| **BODY** | **THE BOW's 72-resonator modal violin body** — A0/CBR/B1−/B1+ signature modes and the 2.3 kHz *bridge hill*. Not an EQ curve: the bridge hill is the only measured parameter that correlates with perceived violin quality |
| **SECTION** | detuned/delayed desks so MORPH can land on a solo violin or on an ensemble. The Pumpkins move needs the section |

`BODY` selects violin / viola / cello, so the morph can track a lead line or a
low string pad.

---

## The pedals (post-morph effects)

### PHASER
A four-stage allpass phaser that adds movement to the morph. Sweeps the
notches across the spectrum. Minimal at depth 0, full sweep at 100.
- **Rate** (0.5–4 Hz)
- **Depth** (0–100, notch sweep range)
- **On** (toggle)

### CHORUS
A classic voices-in-unison effect: three detuned delay lines modulated by
LFOs, summed back to the dry signal. Adds shimmer and thickness to strings.
- **Rate** (0.5–2 Hz)
- **Depth** (0–100, detune range in cents)
- **On** (toggle)

### TUNER
Non-destructive frequency detection. Displays the detected fundamental, note
name, and cents offset from equal temperament. Always running.
- **Display** (note + cents)
- No parameters (display-only)

---

## Look

Not the Toa's cobalt-and-tatau, not the Vulture's crimson.

**The family chassis, two-souled.** Dark charcoal brushed steel with layered
glow-arc knobs and corner screws (The Toa / The Vulture language). EMBER
AMBER lights the Muff half, MELLON VIOLET lights the Bow half; ambient light
pools each colour in its own corner. The MORPH knob is the visual centre —
its glow crossfades amber into violet as it turns, under a glass display
where a guitar silhouette hands the light to a violin across a morph ladder.
Title split THE BOW / OTTO across the two colours. Thin gold stars etched
into the metal (*Mellon Collie* by way of tatau engraving).

*(v0.1.0 shipped briefly with a cream pedal-face look; Corey rejected it —
"more like THE VULTURE and TOA" — and this replaced it the same day.)*

---

## Stack

C++17, JUCE 8.0.4 pinned, CMake >= 3.22. VST3 + AU + Standalone.
Universal binary `x86_64;arm64` — **mandatory**, Live 11 runs under Rosetta.
Company code `Cfpr`, plugin code `Bwot`, bundle `com.corefocusproductions.thebowotto`.
Deploy only via `../tools/deploy-plugin.sh`.
