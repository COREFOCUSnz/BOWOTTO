# THE BOWOTTO — session handoff

**Written:** 2026-08-26, Auckland  
**Why this file exists:** the build session hit its context limit. This is the
full state of the project so a fresh session can pick it up cold. Read this
first, before touching any code.

---

## 1. What THE BOWOTTO is

A **Big Muff grunge amp that morphs into a violin** — VST3 / AU / Standalone,
JUCE 8.0.4, C++17. Built for **Otto**, a grunge guitarist and Big Muff devotee
(Smashing Pumpkins school). The twelfth plugin in the Core Focus Productions
family.

- Company: Core Focus Productions
- Bundle ID: `com.corefocusproductions.thebowotto`
- Plugin codes: manufacturer `Cfpr`, plugin `Bwot`
- Product name: "The Bowotto"
- Part of **THE ORION PACK** — the 10-plugin suite that ships together.

### The concept

**Guitar path:** Big Muff + vintage stack (gate → Muff tone stack → saturation amp → cabinet IR) with tone controls.

**Violin path:** The guitar's audio processed as a bowed string (NOT pitch-tracked, so it works on chords). The morph replaces the cabinet with a violin body model, and a **BowDrive** (sustainer + asymmetric saturation) makes the morphed audio behave like a real bowed string (sawtooth bridge force, sustained rather than plucked).

**Controls:** gate, muffon, sustain, tone, scoop, gain | morph, swell, vibrato, rosin, section, body, force | echoon, echotime, echofb, echomix | reverbon, reverbsize, reverbmix | output, bypass.

---

## 2. Where the project stands RIGHT NOW

### Committed: v0.2.1 (2026-08-26)

Full history in README.md. **Status: fully deployed**, both architectures (x86_64 + arm64).

- 22/22 bench tests passing
- 30s soak clean
- AU validation PASS
- All 7 targets build (AU, VST3, Standalone, + test harness)
- Demo WAVs from v0.2.0 (in `build/`) still valid — v0.2.1 fixes didn't change tone, just edge cases

### Session context

**Git repo is now initialized.** The previous session started the repo; this
session built v0.2.1 from it.

v0.2.1 fixed three real bugs found by a new 7-test suite:
1. **Smoothers defaulting to 0** — `VintageAmp::shape()` divides by `tanh(drive)`,
   so a drive that passes through exactly 0 on first load = 0/0 NaN, permanent.
   Every fresh instance broke silently (invisible to a bench that always reuses
   one warmed-up processor). Fixed by seeding smoothers to real starting values
   in `prepareToPlay()`.
2. **Mono hosts getting only the right channel** — `outR` aliases `outL`;
   fixed once, then again when the fix got clobbered by the very next line.
3. **Muff/amp params stairstepping** — once per oversampled block, clicking
   on big knob moves. Now interpolated across the block.

---

## 3. Do these first, in this order

1. **Verify it builds and tests pass:**
   ```bash
   cd the-bowotto
   cmake -B build -DCMAKE_BUILD_TYPE=Release
   cmake --build build --config Release 2>&1 | grep -i warn   # must be empty
   cmake --build build --target BowottoTests
   ./build/BowottoTests                                        # expect ALL TESTS PASSED
   ```
   If anything fails, it's new. Report it to Corey immediately.

2. **Run the soak + render tests:**
   ```bash
   ./build/BowottoTests --soak      # 30s, should be silent
   ./build/BowottoTests --render    # reference loudness check
   ./build/BowottoTests --diagnose  # full suite
   ```

3. **AU validation (macOS):**
   ```bash
   auval -v aufx Bwot Cfpr
   ```

4. **Load in a host** (Live / Logic / Reaper). Verify it loads, plays audio,
   morphs work (MORPH knob + vault vault).

5. **Read CLAUDE.md in the project root.** It lives in the repo and has the
   house rules — 13 of them, all learned the hard way. You will hit every single
   one if you don't know them exist.

---

## 4. Architecture rules — do not break these

(From CLAUDE.md, condensed.)

**`processBlock` is allocation-free and lock-free.** No `new`, no resizing, no
mutex, no I/O.

**Smoothers must be seeded in `prepareToPlay`.** Never let one default to 0 and
ramp in. `VintageAmp::shape()` divides by `tanh(drive)` — a 0 passing through =
0/0 NaN.

**SvfTPT bandpass returns UNITY peak gain, not Q.** Wet/dry blends built on it
need makeup. Regeneration loops need gain > 1.

**A violin is not a filtered guitar.** BowDrive (sustain + asymmetric saturation)
is what makes the morph a violin rather than an EQ'd guitar. Do not simplify it
away.

**Measure absolute level, not just ratios.** Early tests passed because the morph
was 28 dB down, invisible to ratio-only checks.

**A mono-host buffer alias needs its OWN write guarded.** v0.2.1's mono bug: the
fix got clobbered by the very next line because it was only guarding the sibling.

**Every parameter that aliases another buffer needs its own write guarded.**

**Peak guard ceiling is a contract.** Fix trims, not the guard. The ceiling is
0.97, knee 0.70.

**Deploy only via `../tools/deploy-plugin.sh`.** Never `cp -R`. A corrupted
signature blacklists the plugin in Live.

**Version bumped by hand, only when Corey says so.** CMakeLists.txt `project(...
VERSION)` and README must agree. Editor paints it too (PluginEditor.cpp header).

**Every bump gets a README changelog entry AND a Manual update.**

**Test suite catches tone changes.** When you add a test, corrupt the thing on
purpose and confirm the suite goes red.

---

## 5. Build, test, look

```bash
# configure + build (first configure downloads JUCE, takes ~2 min)
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release

# faster if you have JUCE cached from The Forge
cmake -B build -DJUCE_PATH=/path/to/JUCE -DCMAKE_BUILD_TYPE=Release

# headless test suite — the real gate
cmake --build build --target BowottoTests
./build/BowottoTests                                 # 22 tests

# optional: soak + render + diagnose
./build/BowottoTests --soak         # 30s sustained processing
./build/BowottoTests --render       # loudness reference
./build/BowottoTests --diagnose     # full dump

# render the editor to PNG without opening a host
cmake --build build --target BowottoSnapshot
./build/BowottoSnapshot out.png
```

**Iterate on the Standalone build.** It takes audio from your interface, needs
no plugin rescan, and is ten times faster than round-tripping through a DAW.

---

## 6. Layout

```
the-bowotto/
  CMakeLists.txt                universal binary, JUCE pin, test + snapshot targets
  CLAUDE.md                     13 house rules — READ THIS FIRST
  SPEC.md                       locked spec (what the plugin does, by design)
  README.md                     developer guide + changelog
  docs/session-state.md         session notes (updated at the end of each session)
  Source/
    PluginProcessor.{h,cpp}     DSP host, params, processBlock, the chain
    PluginEditor.{h,cpp}        dark brushed-steel chassis; amber Muff / violet Bow
    DSP/
      BowottoDSP.h              SVF, Muff, amp, cabinet IR, gate, tape echo, softLimit
      ViolinEngine.h            Swell, BowDrive, Vibrato, Rosin, BodyModel, Section
  Tools/
    TestHarness.cpp             bench + soak + render (+ --debugswell, --diagnose, etc.)
    Snapshot.cpp                editor → PNG
  Manual/index.html             field manual
  build/
    BowottoTests                test harness
    BowottoSnapshot             editor snapshot tool
    morphfix-*.wav              demo renders (v0.2.0, still valid)
    TheBowotto_artefacts/       built plugins (AU / VST3 / Standalone)
```

---

## 7. Next — not built yet (SPEC locked, backlog only)

The SPEC.md names what's designed but still unbuilt:
- **Phaser / Flanger / Tremolo** — DSP designed, never coded
- **Measured cabinet IR** — method known, no capture session yet
- **Factory presets** — the design exists (from beta jam sessions); shipping
  them requires a real session with Otto to pick the best takes

### Still to do by ear

The constants at the top of `Source/PluginProcessor.h` are educated guesses:

1. `kWetTrim` (−10.5 dB) — measured by first deployment, may drift after Corey
   gets feedback from Otto
2. Peak guard `kCeiling` (0.97) + `kKnee` (0.70) — tuned by the test suite, but
   the *audible* behaviour depends on real material

Beta testers are working producers. Ear pass (Otto with a real session) is still
the blocker.

---

## 8. The first-load NaN bug (v0.2.1 fix, read to understand the codebase)

**Background:** v0.1.0 shipped and Corey said "morph gets quiet." The root was
BowDrive (sustain path) never being tuned — also, a body filter over a decaying
pluck is only ever an EQ (real strings sustain, their bridge force is a sawtooth,
-6 dB/oct). Added BowDrive and it fixed both.

**Session v0.2.1:** Corey said "do tests." New test suite found every FRESH
instance broke silently. Smoothers default to 0 (ramping in) and `VintageAmp::shape()`
divides by `tanh(drive)`, so a drive passing through exactly 0 = 0/0 = NaN. The
NaN went permanent in the DC blocker IIR memory.

Bench didn't catch it because it always reused one processor (warmed up after the
ramp). **First test to construct a fresh processor caught it immediately.**

**The fix:** Seed every SmoothedValue to its real starting value in `prepareToPlay()`.
Add a defensive floor on the divide: `std::max(drive, 0.001f)`.

**Why this matters:** A test that can only pass on a bench designed for the bug is
not a test. The whole suite now constructs fresh instances.

---

## 9. Ship context

THE BOWOTTO does not ship alone. It goes out inside **THE ORION PACK** — all ten
plugins together at one price, nothing rushed, everything fixed and perfected
first. That means:

- AAX for Pro Tools (release blocker)
- Windows builds fully tested on real hardware (release blocker)
- Factory presets that ship the intended tone (design blocker)

Ear pass with Otto and real session material is the current gate.

---

## 10. If the context hits again

Before ending this session, update `docs/session-state.md` with:
- What you did (sentence or two per task)
- Current build/test status
- Any uncommitted changes and why
- What the next session should do first

Write it in FIRST. That file is the only thing that must not get lost.
