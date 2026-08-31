# THE BOWOTTO — Fuzz Into Strings

**Core Focus Productions** · Built for **Otto** — grunge guitar, Big Muff
devotion, Smashing Pumpkins school.
Twelfth plugin in the family / THE ORION PACK.
Current version: **v0.3.0**. User manual: [Manual/index.html](Manual/index.html).
Locked design: [SPEC.md](SPEC.md).

A four-stage Big Muff Pi model into a vintage British stack — with the one
feature no amp sim has: turn the **MORPH** knob and the guitar becomes a
**violin**. The move is stolen from Otto's reference records: *Siamese Dream*
and *Mellon Collie* put walls of Muff next to real string sections, and
BOWOTTO puts both ends of that gesture on one knob. The violin engine is not
an EQ curve — it carries THE BOW's 72-resonator modal body (measured
signature modes, the 2.3 kHz bridge hill) driven by the guitar itself:
swell removes the pick, sustain holds the note like a stroke, rosin adds the
friction layer, and SECTION fans the soloist out into desks.

## v0.3.1 — UI polish & conservative defaults

Minor fixes for a better first-load experience:

- **Hidden parameter value labels** — knob/dial numbers no longer pop up when
  dragging, eliminating UI clutter during interaction.
- **Lowered default gain** — amp now loads at 20% instead of 35%, providing a
  more usable, conservative starting point that won't overwhelm on first use.

All 23 tests passing; cross-platform release ready (Windows VST3 / macOS AU+VST3).

## v0.3.0 — pedalboard redesign, tempo sync, tuner

Full UI rework requested by Corey after seeing the v0.2.1 pedal layout pile
knobs on top of the MUFF/BOW controls:

- **CHORUS** replaces FLANGER (three detuned voices, cleaner shimmer).
- **PHASER** and **CHORUS** now sit alongside **ECHO**/**REVERB** in a
  dedicated **PEDALS** view that fully takes over the panel — same
  principle as THE TOA's PedalPanel — instead of overlapping the amp
  knobs. Laid out 2x2 (Phaser/Chorus top, Echo/Reverb bottom) so each
  pedal's three knobs have real room.
- Each pedal has its own identity colour: PHASER yellow, CHORUS blue, ECHO
  green, REVERB red.
- **TEMPO SYNC**: PHASER RATE, CHORUS RATE, and ECHO TIME can each lock to
  a host-tempo note division (1/1 .. 1/32, including dotted/triplet) via a
  SYNC toggle, instead of running free in Hz/ms. Reads the host's BPM from
  the JUCE PlayHead each block; falls back to 120 BPM standalone or when a
  host doesn't report tempo.
- **TUNER**: a non-destructive autocorrelation pitch detector, now docked
  as a slim ribbon at the bottom of the MAIN page (not a separate tab) —
  note name, cents needle, Hz.
- Two top-level views: **MAIN** (amp + violin knobs) and **PEDALS**
  (takeover panel), selected by tabs directly under the header — GATE and
  OUTPUT stay visible in both as utility controls.
- 22/22 bench passing throughout; this was a pure UI/architecture change,
  no DSP touched apart from adding CHORUS/tempo-sync/tuner detection.

**Known open item:** MORPH's equal-power crossfade sums two *correlated*
signals (guitar and violin paths share the same mono source) rather than
independent stereo content — mid-morph measures louder than either
endpoint (-4.1 dB vs -7.8/-6.2 dB), and the bridge-hill separation inverts
just above its peak (2.6-3.6 kHz: violin reads *below* guitar). Under
investigation with Corey by ear before a fix is chosen.

## v0.2.1 — test expansion finds a silent-until-now NaN bug

Corey said "do tests." Rather than just re-running the existing 17, wrote
7 new ones covering areas nothing had touched: mono hosts, chords, the BOW
knob's full range, the BODY selector, bypass, latency, and parameter
automation. **3 of the 7 failed immediately, and one was serious.**

**The real bug — every fresh instance of the plugin was silently broken.**
`VintageAmp::shape()` divides by `tanh(drive)`. Every parameter smoother
starts at a hardcoded 0 and only reaches its real value after a 20 ms ramp —
so on every genuinely fresh `prepareToPlay` (first load in a DAW, a
sample-rate change, a session reopen), `drive` spent its first ~20 ms
sweeping up through exactly 0, hitting a literal **0/0 = NaN**. That NaN then
lived forever in the DC blockers' filter memory (linear IIR state never
clears NaN on its own) — a real host loading the plugin fresh would get
**silence or garbage on first use**, no crash, no error, nothing in the
existing 17-test bench to catch it (every bench test reused one processor
across many renders, so the very first, genuinely-fresh block was never
individually inspected). Found by T16's mono test, which happened to be the
first one to construct a processor and check it before any warm-up render.

Fixed at the root: `prepareToPlay` now seeds every smoother with
`setCurrentAndTargetValue()` to its real starting value instead of letting it
default to 0 and ramp in. Also floored the division defensively (`d` is
contractually >= 1.0; a hard `jmax(0.05f, d)` costs nothing and makes this
class of bug impossible even if a future edge case reintroduces a
near-zero smoother).

**Two real, smaller bugs also fixed:**
- **Mono hosts got the RIGHT channel only, silently.** `outR` aliases `outL`
  in a mono buffer; writing `outL[i]=l` then unconditionally `outR[i]=r`
  overwrote the left write with the right channel on the very next line —
  twice, actually: my first attempted fix computed the correct mono sum and
  then immediately clobbered it with the same bug one line later. Fixed by
  guarding the second write. SECTION's per-side desks made this audible —
  half the ensemble was silently dropped in mono.
- **Muff/amp drive parameters stairstepped once per block** inside the
  oversampled run (a deliberate simplification for CPU cost). Because that
  feeds a nonlinear recursive clipper, a big knob move between blocks could
  produce a real sample-domain click, not just a coarser ramp. Now linearly
  interpolated across the oversampled block instead of held constant.

**One test-authoring lesson, kept honest in the code:** the new "no clicks"
test (T22) initially flagged OUTPUT's +-24 dB range as clicking. Investigated
before trusting it: pinning OUTPUT at +24 dB with **zero automation**
produced the identical ~1.94 sample delta — loud saturated broadband content
legitimately swings the full peak-guard ceiling on adjacent samples at high
gain. That's normal audio, not a smoothing bug, and a blanket max-delta
test can't tell the two apart for a wide-range gain knob. Excluded OUTPUT
from that specific test with the reasoning left in the source, rather than
either shipping a false positive or quietly loosening the threshold until it
stopped complaining.

**Bench: 17 -> 22 tests**, all passing, 30 s soak clean, auval PASS.

## v0.2.0 — the morph actually morphs

Corey's report: *"the morph into a violin isn't working, it just gets quiet
and sounds like nothing good."* He was right, and the bench had said the
opposite — every v0.1.0 violin test passed because each one measured a
RATIO (hill-vs-valley, on-vs-off) and none measured absolute level.

**What was actually wrong** — measured, not guessed:
- **28 dB quieter at MORPH 100.** The violin engine is roughly unity; the
  problem was it never GAINED anything, while the guitar path picks up ~30 dB
  through the Muff and amp. The violin tapped the raw DI and stayed there.
- **Everything above 800 Hz collapsed** to -95 dB and below, falling at
  -8.3 dB/oct with a -16.8 dB cliff at 800 Hz. Dull as well as quiet.

**The physics (research, in the source comments)**
A bowed string is not a filtered plucked string. The bow's stick-slip cycle
drives HELMHOLTZ MOTION and the bridge force is a **sawtooth** — every
harmonic present, ~1/n, about **-6 dB/octave**, sustained as long as the bow
moves. A picked guitar is the opposite: sharp transient, then harmonics that
die far faster than the fundamental. So a violin body filter over a decaying
pluck can only ever be an EQ'd guitar, which is what v0.1.0 was.

**Added — BOW DRIVE**, and one block fixes both problems:
- hard 20:1 sustainer so the note stops decaying and the tail returns to
  playing level (that is also the missing ~30 dB)
- heavy saturation, which regenerates the harmonics the decay threw away —
  clipping naturally produces a ~1/n series, landing on the Helmholtz target
- asymmetric bias so the series is a SAW (all harmonics) rather than a hollow
  square (odd only)
- **BOW knob** — bow force is the primary brightness control on a real violin
  (the Schelleng playability wedge), so it is a knob, not a constant.

**Changed**
- Vibrato **5.6 Hz -> 6.5 Hz**, excursion ~35 -> ~55 cents. Measured violin
  vibrato runs 5.1-8.2 Hz (mean 6.65) and ~40 cents in first position; v0.1.0
  was under both.
- Body makeup is now MEASURED (`--diagnose`, with 18 dB of output headroom so
  the peak guard is not limiting during the measurement — measuring with it
  engaged makes every setting read -0.3 dB and cost a round trip here).

**Measured after**
- MORPH sweep holds level: guitar -26.1, morph50 -25.8, violin -26.3 dB
  (was a 28 dB drop). Matched on RMS not peak — bowed is low-crest, picked is
  high-crest, and equal RMS is what reads as equal loudness.
- Harmonic slope **-6.4 dB/oct** vs the -6.0 sawtooth target; no dead octave.
- Violin signature modes vs the guitar path: A0 +8.1, B1- +14.0, **B1+ +25.6 dB**.

**Bench: 15 -> 17 tests**, and three of them are new because the old ones
could not have caught this:
- **T5 rewritten** to test the violin's SIGNATURE BODY MODES (462/551 Hz)
  instead of the bridge hill. The hill sits at 2.3 kHz and the guitar cab has
  its own greenback lift at 1.9 kHz, so hill-vs-valley separated the two paths
  by only 3.9 dB — too close to be evidence of anything. The signature modes
  separate by 14-25 dB, so the test can actually fail.
- **T5b** asserts MORPH holds level across the sweep — the exact bug Corey heard.
- **T5c** asserts no dead octave in the violin spectrum (Helmholtz slope).

## v0.1.0 — first build

**Added**
- **THE MUFF**: four-block Big Muff Pi — coupling highpass, two cascaded
  feedback-clipping stages with pre-clip thinning, and the signature two-branch
  tone stack whose fighting branches carve the ~750 Hz mid scoop. SUSTAIN /
  TONE plus **SCOOP**, which fades the notch's own band back in (stock Pi at
  full, mids-mod at zero). Runs 4x oversampled.
- **Vintage stack preamp** — two triode stages, cooler than The Toa's 5150 on
  purpose: an amp on the edge of breakup that thickens what the Muff sends it.
- **Greenback-school 4x12 cab** — synthesised starter IR (1.9 kHz lift, not
  the V30 spike; the scooped Muff must not have its absence of mids doubled).
- **VIOLIN ENGINE / MORPH** — equal-power crossfade that *replaces the cab*
  with THE BOW's modal violin/viola/cello body. SWELL (slow-gear onset duck
  with 5 ms lookahead), bow-stroke SUSTAIN compression, VIBRATO (5.6 Hz pitch
  + AM), ROSIN friction noise, SECTION ensemble (4 detuned desks, stereo).
- **Front/back end**: hysteresis gate (square-law close — 74 dB of Muff gain
  sits behind it), tape echo with oxide-loss feedback and wow, reverb,
  peak guard at -0.26 dBFS.
- **Bench**: 15 tests + soak + `--render` for real DIs. Every audible feature
  has a test that fails if it stops doing something (the Toa wah lesson).

**Bench-caught bugs fixed before first ship** (the honest list)
- Sustain compressor placed after the swell **cancelled the swell** (8:1 +
  makeup flattens the duck). Reordered: string rings, stroke shapes it.
- Onset detector retriggered on **chord partial beating**; then its peak-hold
  memory tracked attacks so fast it **outran its own trigger** (lost by 0.3 %).
  Now: 15 ms-attack / 450 ms-decay hold a pick outruns but beating never does.
- Pick transient **leaked through at full gain** during the detector's few-ms
  latency → 5 ms lookahead on the violin path's audio.
- Gate tail leaked through the Muff's small-signal gain at **-54 dB** with the
  gate "closed" → square-law gain + snap-to-zero; floor now -105 dB.
- The bench itself: T5's 12-probe band estimator moved **4.3 dB when the
  signal was delayed 5 ms** — pure estimator variance. 48 probes now; the
  statistic is stable to under 1 dB.

**Measured (synthetic riff + noise probes, 48 kHz)**
- Muff on/off difference: -0.1 dB vs off (plainly audible)
- Tone-stack scoop: 6.5 dB notch stock, filled to -6.9 dB at SCOOP 0
- Violin bridge hill over valley: **12.2 dB** (guitar path: 7.7 dB)
- Swell attack: 285 ms bow stroke vs 5 ms pick on the same input
- Vibrato sidebands at ±5.6 Hz: -7.5 dB vs carrier (off: -37.4 dB)
- Section L/R correlation: 1.000 solo → 0.834 full
- Peak with everything dimed: -0.26 dBFS (the guard's contract)
- Soak: 240,598 hostile blocks / 30 s, no NaN, no runaway

**UI restyle (same day, after Corey's review)**
- First panel (worn-cream pedal face) looked nothing like the family — gone.
- Now the family chassis language from The Toa / The Vulture: dark charcoal
  brushed steel, layered glow-arc knobs, glass morph display, corner screws.
  Bowotto's identity inside it: **ember amber** for the Muff half, **Mellon
  violet** for the Bow half; the MORPH knob's glow crossfades amber->violet
  as it turns, and the title splits THE BOW / OTTO across the two colours.
  Gold star engraving stays, etched dim into the metal like tatau.

**Known gaps**
- Untuned by ear — bench-proven stable and audible, not yet tasteful. Otto's
  and Corey's ears are the real test (family protocol).
- Phaser / flanger / tremolo from the spec's pedal list: not yet built.
- Cab IR is procedural; a measured capture drops straight in.
- No factory presets yet — they should come from a real session, like
  DRIVING FORCE RHYTHM did on The Toa.
- No git repository (family-wide gap).

## Commands

```bash
# configure (reuses The Forge's JUCE clone)
cmake -B build -D JUCE_PATH="../the-forge/build/_deps/juce-src" -D CMAKE_BUILD_TYPE=Release

# build
cmake --build build --target TheBowotto_VST3 -j 8

# deploy into Live's folder — the ONLY correct way
../tools/deploy-plugin.sh "build/TheBowotto_artefacts/Release/VST3/The Bowotto.vst3"

# bench / soak / real-DI render
cmake --build build --target BowottoTests && build/BowottoTests
build/BowottoTests --soak 30
build/BowottoTests --render in.wav out.wav [gainDb]

# editor to PNG
cmake --build build --target BowottoSnapshot && build/BowottoSnapshot out.png
```
