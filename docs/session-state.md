# Session state — 2026-08-26 (pedalboard redesign)

**v0.2.1 + pedalboard UI, tuner, phaser, chorus.** Full history in README. Building: 22/22 tests pass.

## The story so far
1. v0.1.0: built from empty folder, one session. Deployed.
2. UI v1 rejected ("looks horrible, make it more like TOA/VULTURE"). Rebuilt
   in family chassis. Verdict: "way better."
3. v0.2.0: Corey — "morph gets quiet, sounds like nothing good." Root cause:
   violin path never gained ~30dB the guitar path picks up through the amp,
   AND a body filter over a decaying pluck is only ever an EQ, since a real
   bowed string sustains and its bridge force is a sawtooth (~1/n, -6dB/oct).
   Added BowDrive (sustainer + asymmetric saturation) — fixes both at once.
4. v0.2.1 (this session): Corey said "do tests." Wrote 7 NEW tests instead of
   just re-running the old 17 — mono, chords, BOW range, BODY selector,
   bypass, latency, parameter slams. **3 failed immediately:**
   - **The real one:** every FRESH plugin instance was silently broken.
     Smoothers default to 0 and ramp in; `VintageAmp::shape()` divides by
     `tanh(drive)`, so drive passing through exactly 0 on first load = literal
     0/0 NaN, permanent in the DC blockers' IIR memory. Every host, every
     first load, silence or garbage — invisible to a bench that always reused
     one warmed-up processor. Fixed at the root (seed smoothers to real
     starting values in prepareToPlay) + a defensive floor on the division.
   - Mono hosts got the right channel only (outR aliases outL; fixed it
     TWICE — first attempt still let the next line clobber the fix).
   - Muff/amp params stairstepped once per oversampled block; could click on
     a big knob move. Now interpolated across the block.
   - T22 itself had a flaw (flagged OUTPUT's wide gain range as "clicking"
     when it was just loud saturated audio at the peak-guard ceiling —
     verified against a no-automation control before trusting it, then
     excluded OUTPUT from that specific test with the reasoning in the code).

## This session (2026-08-26, pedalboard redesign) — continued

UI iterated three times based on Corey's feedback:
1. First pass: static pedal boxes bottom strip (rejected — "not like TOA/Vulture").
2. Second pass: TabDisplay with MAIN/PEDALS/TUNER tabs at bottom, 4-across
   pedal grid (rejected — tabs needed to be at top, pedals needed to take
   over the whole panel not pile on top of Muff/Bow knobs).
3. Final: two top tabs (MAIN/PEDALS) directly under the header rule.
   PEDALS fully replaces the Muff/Morph/Bow knob region (same takeover
   principle as THE TOA's PedalPanel) with a 2x2 grid — PHASER/CHORUS on
   top, ECHO/REVERB below — giving each pedal a full half-width/half-height
   cell so 3 knobs never overlap. TUNER is no longer a separate tab; it's a
   wide, thin ribbon permanently docked at the bottom of the MAIN page.
   GATE and OUTPUT are utility knobs, always visible in both views (right
   edge), matching how THE TOA keeps its utility controls outside the
   pedal takeover's footprint.

## Original session notes
1. **Replaced FLANGER with CHORUS** — simpler voices-in-unison shimmer, matches
   the user's request ("phaser and a chorus"). Updated all parameter names,
   attachments, test harness. T9c now tests chorus audibility and depth effect.
2. **Added TUNER** — non-destructive frequency detection via autocorrelation.
   Displays fundamental Hz and cents offset from equal temperament. Runs on
   gated mono signal, stores result in uiTunerHz / uiTunerCents for editor display.
3. **Reorganized editor UI as a pedalboard:**
   - PHASER (amber) and CHORUS (violet) pedals on a middle strip
   - ECHO and REVERB grouped below them
   - Section headings for each: PHASER, CHORUS, ECHO, REVERB
   - Window size: 980×520 (was 980×560; slightly compressed for layout)
   - All new controls initialize, attach, and position correctly
4. **Updated SPEC.md** to reflect new signal chain: MORPH → PHASER → CHORUS →
   ECHO → REVERB (removed FLANGER, TREMOLO still present but not in user request).
5. **All 22 tests pass**, including new T9c chorus test (audible 3.1 dB, depth
   effective 3.0 dB). Build clean, no regressions.

## Status
- 22/22 bench, soak clean, all targets build. Phaser, chorus, tuner ready.
- Editor pedalboard layout complete, all controls wired and positioned.
- **NOT YET DEPLOYED** — waiting for Corey to ear-pass the new pedals and tuner
  before shipping a new version bump.

## Next
- **EAR PASS with pedalboard + tuner** — Corey needs to load the plugin,
  test phaser/chorus/tuner in a real session with Otto's material, and give
  the go/no-go before v0.3.0 bumps.
- Factory presets (designed from Otto's beta jams; needs a real session pick).
- Measured cabinet IR (method known, no capture session yet).
- Still in scope but deferred: ORION PACK completion (AAX for Pro Tools,
  Windows builds on real hardware).
