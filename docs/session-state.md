# Session state — 2026-08-26

**v0.2.1 deployed.** Full history in the README changelog.

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

## Status
- 22/22 bench, 30s soak clean, auval PASS, all 7 targets build.
- DEPLOYED 26 Aug (both arches). Manual/README/CLAUDE.md current.
- Demo WAVs from v0.2.0 (build/morphfix-*.wav) still valid — the v0.2.1 fixes
  don't change tone, they fix a first-load bug and two edge cases.

## Next
- **EAR PASS is still the real blocker** — now doubly worth doing since the
  plugin that gets played is finally the one that was actually designed
  (prior sessions may have been hearing the NaN-affected first-load version
  without knowing it, depending on exactly when Live rescanned).
- Real-DI `--render` comparison needs Corey to point at a DI file.
- Still unbuilt from SPEC: phaser / flanger / tremolo. Measured cab IR.
  Factory presets (from a real session, per The Toa's precedent).
- Worth considering: initialise a git repo. Two sessions now, several
  multi-step DSP fixes with no undo — the family CLAUDE.md flags this as
  the single biggest risk to the codebase, and this session (a mangled
  regex edit with no version control to fall back on) was a live example.
