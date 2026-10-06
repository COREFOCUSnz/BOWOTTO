# IR capture runsheet — Otto's rig (Spider + SM58)

Goal: real cabinet+mic impulse responses to replace THE BOWOTTO's synthetic
cab, captured in the four-corner layout THE TOA's mic matrix uses, so MIC
POSITION / MIC DISTANCE can be dialled continuously between them.

An IR captures the **linear** part only: speaker + cab + mic + room. It cannot
capture the amp's distortion, the Muff, or the Line 6 / Boss GT models — those
are nonlinear and the plugin models them itself. So the amp goes on its
**cleanest** setting, at a moderate volume.

## Before Otto arrives (10 min)

1. `cd the-bowotto/tools/ir-capture && python3 make_sweep.py` -> `sweep.wav`.
2. In Live (48 kHz session), one audio track playing `sweep.wav`, routed to
   the interface output that feeds the amp. A **reamp box or DI-in-reverse**
   between the interface and the Spider's input keeps impedance sane; failing
   that, the Spider's AUX/CD input is the next best, it bypasses the guitar
   preamp entirely.
3. SM58 on its own armed track, input monitoring OFF (no feedback loop).
4. Play the sweep once with nobody in the room: check the recorded take has
   no clipping (peak below -6 dBFS) and the sweep is clearly audible above
   the room's noise floor at the quiet low-frequency start.

## The four corners (plus extras if time allows)

Name every recording exactly like this — the deconvolver keeps the names:

| File name                 | Mic position                                   |
|---------------------------|------------------------------------------------|
| `SM58 centre grille.wav`  | dust-cap centre, capsule touching the grille   |
| `SM58 edge grille.wav`    | cone edge (where dust cap meets cone), grille  |
| `SM58 centre far.wav`     | dust-cap centre, 30 cm back                    |
| `SM58 edge far.wav`       | cone edge, 30 cm back                          |

Extras worth 2 minutes each: `SM58 centre 10cm.wav`, `SM58 centre 60cm.wav`,
and any second mic you have (`SM57 ...`, `condenser ...`).

Per position: **two takes**, don't move the mic between them. If the two
deconvolve to different fingerprints something moved or the amp farted.

Amp: Spider on its cleanest model, gain low, tone controls at noon, built-in
effects OFF, master so the room is at conversation-plus volume. Write the
preset name and knob positions on the runsheet — they ARE part of the capture.

## After (5 min)

```
python3 deconvolve.py sweep.wav "SM58 centre grille.wav" "SM58 edge grille.wav" \
                                "SM58 centre far.wav"    "SM58 edge far.wav"
```

Each prints a verdict. `ok` = linear response is 40 dB above the distortion/
noise pre-echo. `NOISY` = redo that position quieter. Then the `.ir.wav`
files go to Clint and get built into THE BOWOTTO's cab matrix.

## What a good one looks like

Direct sound as one sharp peak, the fingerprint showing the hump at
150-400 Hz and the roll-off above 4 kHz that today's mic'd recordings
already show (Clint measured +10..15 dB at 150-400 Hz rel 1 kHz, -11 dB at
4 kHz, -18 dB at 5 kHz on 1-Audio 0001/0002). If the IR doesn't look like the
recordings, the IR is wrong, not the recordings.
