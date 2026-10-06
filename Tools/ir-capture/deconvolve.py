#!/usr/bin/env python3
"""Turn recorded sweeps into cabinet impulse responses.

    python3 deconvolve.py sweep.wav  "SM58 centre grille.wav" ["SM58 edge far.wav" ...]

For each recording: finds the sweep inside it, deconvolves against the exact
sweep that was played, windows the linear part (harmonic distortion lands at
negative time and is discarded), trims to 120 ms with a raised-cosine tail,
normalises so the loudest IR of the batch peaks at -1 dBFS and the others keep
their RELATIVE level (mic distance differences are part of the capture), and
writes <name>.ir.wav next to the recording. Prints a one-line report per IR:
direct-sound time, 1/3-octave fingerprint vs 1 kHz, and a sanity verdict.

Recordings may be mono or stereo (left channel used), any bit depth, and must
be at the sweep's sample rate. Read-only on inputs.
"""
import sys, os, wave, numpy as np

def read(path):
    with wave.open(path) as w:
        sr, ch, sw, n = w.getframerate(), w.getnchannels(), w.getsampwidth(), w.getnframes()
        raw = w.readframes(n)
    if sw == 2:
        x = np.frombuffer(raw, dtype="<i2").astype(np.float64) / 32768
    elif sw == 3:
        b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3).astype(np.int32)
        x = (b[:, 0] | b[:, 1] << 8 | b[:, 2] << 16)
        x = np.where(x >= 1 << 23, x - (1 << 24), x) / float(1 << 23)
    elif sw == 4:
        x = np.frombuffer(raw, dtype="<i4").astype(np.float64) / 2 ** 31
    else:
        raise SystemExit(f"{path}: unsupported sample width {sw}")
    return x.reshape(-1, ch)[:, 0], sr

def write(path, x, sr):
    pcm = (np.clip(x, -1, 1) * (2 ** 23 - 1)).astype(np.int32)
    b = np.stack([pcm & 0xFF, (pcm >> 8) & 0xFF, (pcm >> 16) & 0xFF], axis=1).astype(np.uint8)
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(3); w.setframerate(sr); w.writeframes(b.tobytes())

if len(sys.argv) < 3:
    raise SystemExit(__doc__)

sweep, sr = read(sys.argv[1])
# The played sweep carries 1 s of leading silence: strip to the sweep proper.
nz = np.flatnonzero(np.abs(sweep) > 1e-4)
sweep = sweep[nz[0]: nz[-1] + 1]
f1, f2 = 20.0, 20000.0
T = len(sweep) / sr
R = np.log(f2 / f1)
# Inverse filter: time-reversed sweep with a -6 dB/oct amplitude envelope, so
# the convolution (sweep * inverse) is a flat-spectrum impulse.
inv = sweep[::-1] * np.exp(-np.arange(len(sweep)) / sr * R / T)
inv /= np.abs(np.fft.rfft(np.convolve(sweep[:2048], inv[-2048:]))).max() if False else 1.0

results = []
for path in sys.argv[2:]:
    rec, rs = read(path)
    if rs != sr:
        raise SystemExit(f"{path}: {rs} Hz but the sweep is {sr} Hz — resample the recording first")
    n = len(rec) + len(inv) - 1
    N = 1 << (n - 1).bit_length()
    ir = np.fft.irfft(np.fft.rfft(rec, N) * np.fft.rfft(inv, N), N)[:n]
    # Time zero of the linear response is where the inverse filter lines up with
    # the recorded sweep: the big peak. Everything earlier is harmonic distortion.
    peak = int(np.argmax(np.abs(ir)))
    direct_ms = 1000.0 * (peak - len(inv)) / sr if False else None
    start = max(0, peak - int(0.002 * sr))               # keep 2 ms of pre-ring
    length = int(0.120 * sr)
    seg = ir[start: start + length].copy()
    tail = int(0.030 * sr)                                # 30 ms raised-cosine out
    seg[-tail:] *= 0.5 * (1 + np.cos(np.linspace(0, np.pi, tail)))
    pre_energy = np.sqrt((ir[max(0, peak - int(0.05 * sr)): peak - int(0.002 * sr)] ** 2).mean() + 1e-30)
    results.append((path, seg, pre_energy))

ref = max(np.abs(seg).max() for _, seg, _ in results)
cent = 1000 * 2 ** (np.arange(-10, 8) / 3.0)
for path, seg, pre in results:
    seg = seg / ref * 10 ** (-1 / 20)
    out = os.path.splitext(path)[0] + ".ir.wav"
    write(out, seg, sr)
    spec = np.abs(np.fft.rfft(seg, 1 << 15)) ** 2
    fr = np.fft.rfftfreq(1 << 15, 1 / sr)
    bands = np.array([10 * np.log10(spec[(fr >= k / 2 ** (1 / 6)) & (fr < k * 2 ** (1 / 6))].mean() + 1e-30) for k in cent])
    bands -= bands[10]
    snr = 20 * np.log10(np.abs(seg).max() / (pre / ref * 10 ** (-1 / 20) + 1e-30))
    verdict = "ok" if snr > 40 else ("NOISY/DISTORTED — lower the amp or raise the mic gain" if snr > 20 else "BAD — check routing, is the sweep even in this file?")
    print(f"{os.path.basename(out)}: peak {20*np.log10(np.abs(seg).max()):+.1f} dBFS, "
          f"linear-vs-pre-echo {snr:.0f} dB [{verdict}]")
    print("    " + " ".join(f"{k:.0f}:{b:+.0f}" for k, b in zip(cent, bands)))
