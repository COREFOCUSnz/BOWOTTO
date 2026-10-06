#!/usr/bin/env python3
"""Generate the test signal for an impulse-response capture.

Writes sweep.wav: 1 s of silence, a 12 s exponential sine sweep 20 Hz -> 20 kHz
at -12 dBFS, then 3 s of silence for the tail. The exponential (Farina) sweep
is what lets deconvolve.py separate the speaker/amp's harmonic distortion from
the linear response: harmonics land BEFORE time zero in the result and get
windowed out, so a slightly dirty amp still yields a clean cab+mic IR.

    python3 make_sweep.py            -> sweep.wav (48 kHz, mono, 24-bit)
    python3 make_sweep.py 44100      -> at another rate
"""
import sys, wave, numpy as np

sr = int(sys.argv[1]) if len(sys.argv) > 1 else 48000
f1, f2, T, level_db = 20.0, 20000.0, 12.0, -12.0
pre, post = 1.0, 3.0

t = np.arange(int(T * sr)) / sr
R = np.log(f2 / f1)
sweep = np.sin(2 * np.pi * f1 * T / R * (np.exp(t * R / T) - 1))
fade = int(0.02 * sr)                      # 20 ms edges so the start/stop don't click
sweep[:fade] *= np.linspace(0, 1, fade)
sweep[-fade:] *= np.linspace(1, 0, fade)
sig = np.concatenate([np.zeros(int(pre * sr)), sweep * 10 ** (level_db / 20), np.zeros(int(post * sr))])

pcm = np.clip(sig, -1, 1) * (2 ** 23 - 1)
pcm = pcm.astype(np.int32)
b = np.stack([pcm & 0xFF, (pcm >> 8) & 0xFF, (pcm >> 16) & 0xFF], axis=1).astype(np.uint8)   # WAV is little-endian
with wave.open("sweep.wav", "wb") as w:
    w.setnchannels(1); w.setsampwidth(3); w.setframerate(sr)
    w.writeframes(b.tobytes())
print(f"sweep.wav: {len(sig)/sr:.1f} s at {sr} Hz, {f1:.0f}-{f2:.0f} Hz exponential, {level_db} dBFS")
