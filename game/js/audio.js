// Synthesized sound effects (Web Audio) + speech announcer. No sound files needed.
(function (root) {
  'use strict';
  class Audio {
    constructor() { this.ctx = null; this.enabled = true; this.announcer = true; this.volume = 0.5; this.listener = [0, 0, 0]; this.lastSpeak = 0; }
    init() {
      if (this.ctx) return;
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
      if (this.ctx) { this.master = this.ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(this.ctx.destination); }
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
    play(name, pos) {
      if (!this.enabled || !this.ctx) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const g = ctx.createGain(); g.connect(this.master);
      const vol = this.gainFor(pos, 1); if (vol <= 0.005) return;
      const env = (peak, a, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak * vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
      const osc = (type, f0, f1, dur) => { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur); o.connect(g); o.start(t); o.stop(t + dur + 0.05); return o; };
      const filtNoise = (len, type, f0, f1) => { const n = this.noise(len); const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + len); n.connect(f); f.connect(g); n.start(t); return n; };
      switch (name) {
        case 'shotgun': env(0.9, 0.005, 0.25); filtNoise(0.3, 'lowpass', 3000, 300); osc('square', 120, 40, 0.15); break;
        case 'supershotgun': env(1.0, 0.005, 0.35); filtNoise(0.4, 'lowpass', 2500, 200); osc('square', 90, 30, 0.2); break;
        case 'nail': env(0.35, 0.002, 0.08); filtNoise(0.1, 'bandpass', 2500); osc('square', 700, 300, 0.06); break;
        case 'rocket': env(0.8, 0.01, 0.5); filtNoise(0.6, 'lowpass', 1500, 200); osc('sawtooth', 200, 60, 0.4); break;
        case 'gl': env(0.6, 0.005, 0.2); filtNoise(0.25, 'lowpass', 1200, 300); osc('sine', 150, 60, 0.15); break;
        case 'explosion': env(1.2, 0.01, 0.9); filtNoise(1.0, 'lowpass', 900, 80); osc('sine', 80, 25, 0.7); break;
        case 'sniper': env(1.0, 0.003, 0.5); filtNoise(0.5, 'highpass', 800); osc('square', 400, 60, 0.3); break;
        case 'autorifle': env(0.5, 0.003, 0.1); filtNoise(0.12, 'bandpass', 1800); osc('square', 300, 100, 0.08); break;
        case 'ac': env(0.5, 0.003, 0.09); filtNoise(0.1, 'lowpass', 2500, 500); osc('square', 200, 80, 0.07); break;
        case 'spinup': env(0.3, 0.05, 0.6); osc('sawtooth', 60, 220, 0.6); break;
        case 'flame': env(0.25, 0.02, 0.15); filtNoise(0.2, 'lowpass', 1200, 600); break;
        case 'melee': env(0.5, 0.005, 0.12); filtNoise(0.12, 'bandpass', 900); break;
        case 'hit': env(0.5, 0.005, 0.15); osc('triangle', 500, 200, 0.12); break;
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
        case 'conc': env(0.9, 0.01, 0.8); osc('sine', 300, 30, 0.8); filtNoise(0.5, 'lowpass', 600, 100); break;
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
