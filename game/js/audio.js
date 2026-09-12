// Synthesized sound effects (Web Audio) + speech announcer. No sound files needed.
(function (root) {
  'use strict';
  // Several sounds stacked oscillators and noise into one gain and summed well
  // past full scale on their own: the shotgun peaked at 2.3 and the super
  // shotgun at 3.0, so every shot was clipped square before the mixer saw it.
  // Levels below are set from rendered peaks, not by ear.
  class Audio {
    constructor() {
      this.ctx = null; this.enabled = true; this.announcer = true; this.volume = 0.5;
      this.listener = [0, 0, 0];
      this.listenRight = [1, 0, 0];   // which way is the player's right ear pointing
      this.lastSpeak = 0;
    }
    // Position AND facing. Without the facing every sound sits dead centre, which
    // costs you the one thing audio is for in a game like this: knowing where
    // someone is before you can see them.
    setListener(pos, yaw) {
      this.listener = pos;
      this.listenRight = [Math.cos(yaw), 0, -Math.sin(yaw)];
    }
    init() {
      if (this.ctx) return;
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
      if (this.ctx) {
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        // Per-sound levels stop any ONE sound clipping; this catches a firefight
        // where a dozen land in the same tick. Deliberately downstream of master,
        // so test/audio.test.js measures the raw sum and a source that clips on
        // its own cannot hide behind it.
        const lim = this.ctx.createDynamicsCompressor();
        lim.threshold.value = -6; lim.knee.value = 6; lim.ratio.value = 12;
        lim.attack.value = 0.003; lim.release.value = 0.18;
        this.limiter = lim;
        this.master.connect(lim);
        lim.connect(this.ctx.destination);
      }
    }
    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
    setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
    noise(len) {
      const ctx = this.ctx, buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
      const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const s = ctx.createBufferSource(); s.buffer = buf; return s;
    }
    gainFor(pos, base) {
      if (!pos) return base;
      const d = Math.hypot(pos[0] - this.listener[0], pos[1] - this.listener[1], pos[2] - this.listener[2]);
      return base * Math.max(0, 1 - d / 60) * (1 / (1 + d * 0.06));
    }
    // How far away, and how far to the side. Air absorbs treble with distance, so
    // a far-off shot is a thump and a near one is a crack — that difference is
    // most of how you judge range by ear.
    placement(pos) {
      if (!pos) return { pan: 0, cutoff: 22050, dist: 0 };
      const dx = pos[0] - this.listener[0], dy = pos[1] - this.listener[1], dz = pos[2] - this.listener[2];
      const dist = Math.hypot(dx, dy, dz);
      const r = this.listenRight;
      const pan = dist > 0.4 ? Math.max(-1, Math.min(1, ((dx * r[0] + dz * r[2]) / dist) * 0.92)) : 0;
      const cutoff = Math.max(450, 20000 * Math.pow(0.5, dist / 11));
      return { pan, cutoff, dist };
    }
    play(name, pos, opts) {
      if (!this.enabled || !this.ctx) return;
      opts = opts || {};
      const ctx = this.ctx, t = ctx.currentTime;
      const g = ctx.createGain();
      const place = this.placement(pos);
      // g -> distance lowpass -> panner -> master. Both extra nodes are skipped
      // for a sound with no position (your own hit confirmation, a UI click).
      let tail = g;
      if (pos) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = place.cutoff; lp.Q.value = 0.7;
        tail.connect(lp); tail = lp;
        if (ctx.createStereoPanner) {
          const pn = ctx.createStereoPanner();
          pn.pan.value = place.pan;
          tail.connect(pn); tail = pn;
        }
      }
      tail.connect(this.master);
      const vol = this.gainFor(pos, 1) * (opts.gain === undefined ? 1 : opts.gain);
      if (vol <= 0.005) return;
      const pitch = opts.pitch === undefined ? 1 : opts.pitch;
      const env = (peak, a, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak * vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
      const osc = (type, f0, f1, dur) => { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0 * pitch, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1 * pitch, t + dur); o.connect(g); o.start(t); o.stop(t + dur + 0.05); return o; };
      const filtNoise = (len, type, f0, f1) => { const n = this.noise(len); const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0 * pitch, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1 * pitch, t + len); n.connect(f); f.connect(g); n.start(t); return n; };
      switch (name) {
        case 'shotgun': env(0.32, 0.004, 0.32); filtNoise(0.35, 'lowpass', 3500, 250); osc('square', 110, 35, 0.18); osc('sine', 70, 40, 0.25); break;
        case 'supershotgun': env(0.30, 0.004, 0.45); filtNoise(0.5, 'lowpass', 3000, 180); osc('square', 85, 28, 0.25); osc('sine', 55, 30, 0.35); break;
        case 'pump': env(0.5, 0.003, 0.07); filtNoise(0.08, 'bandpass', 1800); setTimeout(() => { if (this.ctx) { const g2 = this.ctx.createGain(); g2.connect(this.master); const t2 = this.ctx.currentTime; g2.gain.setValueAtTime(0.5 * vol, t2); g2.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.08); const n2 = this.noise(0.08); const f2 = this.ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1200; n2.connect(f2); f2.connect(g2); n2.start(t2); } }, 90); break;
        case 'bolt': env(0.4, 0.003, 0.1); filtNoise(0.1, 'bandpass', 2500); osc('square', 1800, 900, 0.05); break;
        case 'click': env(0.35, 0.002, 0.05); filtNoise(0.05, 'bandpass', 3000); break;
        case 'nail': env(0.35, 0.002, 0.08); filtNoise(0.1, 'bandpass', 2500); osc('square', 700, 300, 0.06); break;
        case 'rocket': env(0.62, 0.01, 0.5); filtNoise(0.6, 'lowpass', 1500, 200); osc('sawtooth', 200, 60, 0.4); break;
        case 'gl': env(0.58, 0.005, 0.2); filtNoise(0.25, 'lowpass', 1200, 300); osc('sine', 150, 60, 0.15); break;
        case 'explosion': env(0.61, 0.01, 0.9); filtNoise(1.0, 'lowpass', 900, 80); osc('sine', 80, 25, 0.7); break;
        case 'sniper': env(0.36, 0.003, 0.5); filtNoise(0.5, 'highpass', 800); osc('square', 400, 60, 0.3); break;
        case 'autorifle': env(0.5, 0.003, 0.1); filtNoise(0.12, 'bandpass', 1800); osc('square', 300, 100, 0.08); break;
        case 'ac': env(0.5, 0.003, 0.09); filtNoise(0.1, 'lowpass', 2500, 500); osc('square', 200, 80, 0.07); break;
        case 'spinup': env(0.3, 0.05, 0.6); osc('sawtooth', 60, 220, 0.6); break;
        case 'flame': env(0.25, 0.02, 0.15); filtNoise(0.2, 'lowpass', 1200, 600); break;
        case 'melee': env(0.5, 0.005, 0.12); filtNoise(0.12, 'bandpass', 900); break;
        // Hit confirmation. Pitched by how hard you hit — a graze and a rocket to
        // the chest should not sound the same, and the pitch tells you which
        // before the damage number has even finished rising.
        case 'hit': env(0.47, 0.002, 0.085); osc('square', 880, 1180, 0.05); osc('sine', 1760, 2100, 0.04); break;
        case 'killconfirm': env(0.6, 0.003, 0.22); osc('square', 740, 740, 0.06);
          setTimeout(() => this.play('killconfirm2'), 55); break;
        case 'killconfirm2': env(0.42, 0.003, 0.3); osc('square', 1110, 1480, 0.22); osc('sine', 2220, 2960, 0.12); break;
        // Boots. Short, broadband, with a little body under it. The pitch and
        // gain the caller passes are what keep a crowd from sounding like one
        // very fast machine.
        case 'step': env(0.32, 0.002, 0.075); filtNoise(0.08, 'bandpass', 1250, 620); osc('sine', 95, 58, 0.055); break;
        case 'stepwater': env(0.34, 0.004, 0.16); filtNoise(0.18, 'bandpass', 2600, 900); osc('sine', 150, 90, 0.06); break;
        case 'hurt': env(0.6, 0.01, 0.25); osc('sawtooth', 220, 110, 0.25); break;
        case 'die': env(0.7, 0.01, 0.6); osc('sawtooth', 180, 40, 0.6); break;
        case 'jump': env(0.2, 0.01, 0.1); osc('sine', 300, 500, 0.1); break;
        case 'land': env(0.3, 0.005, 0.12); filtNoise(0.12, 'lowpass', 500); break;
        case 'pickup': env(0.4, 0.01, 0.2); osc('sine', 600, 900, 0.15); break;
        case 'resupply': env(0.4, 0.01, 0.3); osc('sine', 400, 800, 0.25); osc('sine', 600, 1200, 0.25); break;
        case 'flagtake': env(0.6, 0.01, 0.4); osc('square', 440, 660, 0.3); break;
        case 'flagcap': env(0.7, 0.01, 0.8); osc('square', 523, 523, 0.2); setTimeout(() => this.play('flagcap2'), 180); break;
        case 'flagcap2': env(0.7, 0.01, 0.8); osc('square', 659, 784, 0.5); break;
        case 'flagreturn': env(0.5, 0.01, 0.4); osc('triangle', 500, 350, 0.35); break;
        case 'pin': env(0.4, 0.005, 0.08); osc('square', 1200, 900, 0.06); break;
        case 'bounce': env(0.4, 0.003, 0.1); osc('sine', 800, 300, 0.08); break;
        case 'splash': env(0.5, 0.02, 0.4); filtNoise(0.4, 'lowpass', 2000, 300); break;
        case 'build': env(0.4, 0.01, 0.2); osc('square', 250, 250, 0.15); break;
        case 'sentry': env(0.45, 0.003, 0.08); filtNoise(0.1, 'bandpass', 2200); osc('square', 900, 400, 0.06); break;
        case 'beep': env(0.3, 0.01, 0.1); osc('sine', 1500, 1500, 0.08); break;
        case 'zoom': env(0.3, 0.005, 0.1); osc('sine', 900, 1400, 0.08); break;
        case 'burn': env(0.3, 0.02, 0.3); filtNoise(0.3, 'lowpass', 800, 300); break;
        case 'heal': env(0.4, 0.01, 0.3); osc('sine', 500, 1000, 0.3); break;
        case 'conc': env(0.60, 0.01, 0.8); osc('sine', 300, 30, 0.8); filtNoise(0.5, 'lowpass', 600, 100); break;
        default: env(0.3, 0.01, 0.1); osc('sine', 440, 440, 0.1);
      }
    }
    say(text) {
      if (!this.announcer || typeof speechSynthesis === 'undefined') return;
      try {
        const u = new SpeechSynthesisUtterance(text); u.rate = 1.05; u.pitch = 0.8; u.volume = Math.min(1, this.volume * 2);
        speechSynthesis.speak(u);
      } catch (e) { /* ignore */ }
    }
  }
  Object.assign(root, { GameAudio: Audio });
})(window);
