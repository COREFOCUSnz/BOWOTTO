# THE BOWOTTO — read this first

You are working on **THE BOWOTTO**, a guitar plugin by **Core Focus
Productions** (Corey Friedlander), built for **Otto** — grunge guitarist,
Big Muff devotee, Smashing Pumpkins school. Twelfth plugin in the family
(Forge / Vice / Vulture / Core Kit / Core Counter / Toa / Rupture(design) /
Bow / Crank / Scourge / Dark Prometheus(design) / **Bowotto**).

**The concept:** Big Muff + vintage stack that MORPHS into a violin. The
violin path processes the guitar's own audio (swell / sustain / vibrato /
rosin / THE BOW's 72-mode modal body / section desks) — it does NOT pitch
track, so it works on chords. MORPH replaces the cab with the violin body.
Locked spec: `SPEC.md`. State of play: `docs/session-state.md`.

## Session protocol

The project holds the state, not the chat. Start of session: read this file
and `docs/session-state.md`. End of session (or at the context warning):
update `docs/session-state.md` FIRST.

## Stack

C++17, JUCE **8.0.4** pinned, CMake ≥ 3.22. VST3 + AU + Standalone.
**Universal binary (x86_64;arm64) is mandatory** — Live 11 runs under Rosetta.
Company `Cfpr`, code `Bwot`, bundle `com.corefocusproductions.thebowotto`.

## Commands

See README.md — configure with The Forge's JUCE clone, bench via
`build/BowottoTests` (22 tests + `--soak` + `--render` + `--diagnose`,
`--stages`, `--bands`, `--cpu`, `--demo`), UI via
`build/BowottoSnapshot out.png`.

## Layout

```
Source/PluginProcessor.{h,cpp}   params, processBlock, the chain
Source/PluginEditor.{h,cpp}      dark brushed-steel family chassis; amber Muff / violet Bow
Source/DSP/BowottoDSP.h          namespace bowotto:: — SVF, Muff, amp, cab IR,
                                 gate, tape echo, softLimit
Source/DSP/ViolinEngine.h        Swell, BowDrive, Vibrato, Rosin,
                                 BodyModel (from THE BOW), Section, ViolinEngine
Tools/TestHarness.cpp            bench + soak + render (+ --debugswell probe)
Tools/Snapshot.cpp               editor -> PNG
```

## Parameters (APVTS ids)

```
gate  muffon sustain tone scoop  gain
morph swell vibrato rosin section body force
echoon echotime echofb echomix
reverbon reverbsize reverbmix
output bypass
```

kWetTrim -10.5 dB; peak guard knee/ceiling 0.70/0.97 in `bowotto::softLimit`.

## House rules (inherited from The Toa, all learned the hard way)

1. **Deploy only with `../tools/deploy-plugin.sh`** — never `cp -R` onto a
   live bundle (corrupted signature → Live blacklist, 2026-08-15).
2. **Version bumped by hand, only when Corey says so** — CMakeLists
   `project(... VERSION)` and README must agree. Editor paints the version
   string too (`PluginEditor.cpp` header block).
3. **Every bump gets a README changelog entry AND a Manual update.**
   Back up the old build first (family release ritual).
4. **Loudness is measured, never guessed** — `--render` on a real DI.
5. **The peak guard's ceiling is a contract** (T12). Fix trims, not the guard.
6. **New DSP ships with a bench test that CAN FAIL** — and stability is not
   audibility: every effect has an off-vs-on test (T3/T8/T10). Verify the
   measurement can detect the thing (T5's estimator variance lesson: 12
   Goertzel probes moved 4.3 dB on a 5 ms shift; 48 probes now).
7. **SvfTPT::bandpass() returns UNITY peak gain, not Q** — blends need
   makeup, regeneration needs gain > 1.
8. **A violin is not a filtered guitar.** The bowed bridge force is a
   SAWTOOTH (~1/n, -6 dB/oct, sustained); a pluck decays and loses its
   harmonics. `BowDrive` (sustain + asymmetric saturation) is what makes the
   morph a violin rather than an EQ'd guitar — do not "simplify" it away.
9. **Measure absolute level, not just ratios.** Every v0.1.0 violin test
   passed while the morph was 28 dB down, because they all measured ratios.
   T5b exists for this. And measure with output headroom — with the peak
   guard limiting, every setting reads -0.3 dB.
10. **Seed every SmoothedValue's starting position in `prepareToPlay`.**
   Never let one default to 0 and ramp in from there. v0.2.1's real bug: an
   unseeded `drive` smoother genuinely passed through exactly 0 on every
   fresh instance, and `VintageAmp::shape()` divides by `tanh(drive)` — a
   real 0/0 = NaN on first load, in EVERY host, invisible to a bench that
   only ever reuses one warmed-up processor across tests. Found by the first
   test to construct a fresh processor and check it before any warm-up.
11. **A parameter that aliases another buffer (mono outR==outL) needs its
   OWN write guarded, not just its sibling's.** v0.2.1's mono bug was fixed
   twice — the first attempt computed the right value and then let the very
   next line clobber it with the same aliasing mistake one line later.
12. **A "no clicks" test needs a control.** T22 flagged OUTPUT's wide gain
   range; pinning it with zero automation produced the identical delta —
   loud saturated audio legitimately hits the peak-guard ceiling on
   adjacent samples at high gain. Verify a suspicious finding against a
   no-automation baseline before trusting it as a bug.
13. **Ears outrank the bench.** v0.1.0 is proven stable and audible, not
   tasteful. Nothing is frozen yet — no released session uses it (unlike
   The Toa, whose tone is a shipped record and must never move).
