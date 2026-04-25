/**
 * HitSounds — Audio feedback for note hits, misses, and UI interactions.
 * Supports preloaded .ogg sound files with Web Audio API synthesis fallbacks.
 */

// Static preloaded audio buffers (shared across all instances)
const _buffers = {
  perfect: null,
  great: null,
  good: null,
  tap: null,
};

/** Preload hit sound .ogg files. Call once during boot. Returns a promise. */
export async function preloadHitSounds(audioCtx) {
  const sounds = [
    { key: 'perfect', path: '/game/sounds/perfect.ogg' },
    { key: 'great', path: '/game/sounds/great.ogg' },
    { key: 'good', path: '/game/sounds/good.ogg' },
    { key: 'tap', path: '/game/sounds/tap.ogg' },
  ];

  const results = await Promise.allSettled(
    sounds.map(async ({ key, path }) => {
      try {
        const resp = await fetch(path);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const arrayBuf = await resp.arrayBuffer();
        _buffers[key] = await audioCtx.decodeAudioData(arrayBuf);
      } catch (e) {
        console.warn(`[HitSounds] Failed to load ${key}:`, e.message);
      }
    })
  );

  const loaded = results.filter(r => r.status === 'fulfilled' && _buffers[sounds[results.indexOf(r)]?.key]).length;
  console.log(`[HitSounds] Loaded ${loaded}/${sounds.length} sound files`);
  return loaded;
}

export default class HitSounds {
  constructor(audioCtx) {
    this._ctx = audioCtx;
    this._volume = 0.7;
    this._masterGain = null;
  }

  _ensureMasterGain() {
    if (!this._masterGain) {
      this._masterGain = this._ctx.createGain();
      this._masterGain.gain.value = this._volume;
      this._masterGain.connect(this._ctx.destination);
    }
  }

  setVolume(vol) {
    this._volume = vol;
    if (this._masterGain) {
      this._masterGain.gain.value = vol;
    }
  }

  _play(fn) {
    if (!this._ctx) return;
    this._ensureMasterGain();
    const g = this._ctx.createGain();
    g.connect(this._masterGain);
    fn(g);
  }

  /** Play a preloaded buffer if available */
  _playBuffer(bufferKey, gainValue = 1.0) {
    const buf = _buffers[bufferKey];
    if (!buf || !this._ctx) return false;

    this._ensureMasterGain();
    const g = this._ctx.createGain();
    g.connect(this._masterGain);
    g.gain.setValueAtTime(gainValue, this._ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + buf.duration);

    const src = this._ctx.createBufferSource();
    src.buffer = buf;
    src.connect(g);
    src.start();
    return true;
  }

  // ── Game hit sounds ──────────────────────────────────────────

  /** Perfect / MAX hit */
  perfect() {
    if (this._playBuffer('perfect', 0.9)) return;
    // Synthesized fallback
    this._play(g => {
      const dur = 0.08;
      const buf = this._ctx.createBuffer(1, this._ctx.sampleRate * dur, this._ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / data.length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3) * 0.5;
      }
      const src = this._ctx.createBufferSource();
      src.buffer = buf;
      const filt = this._ctx.createBiquadFilter();
      filt.type = 'bandpass'; filt.frequency.value = 10000; filt.Q.value = 1.5;
      const hp = this._ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 6000;
      src.connect(filt); filt.connect(hp); hp.connect(g);
      g.gain.setValueAtTime(0.9, this._ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + dur);
      src.start(); src.stop(this._ctx.currentTime + dur);
    });
    // Metallic ring
    this._play(g => {
      const o = this._ctx.createOscillator();
      const env = this._ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(6800, this._ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(5200, this._ctx.currentTime + 0.04);
      o.connect(env); env.connect(g);
      env.gain.setValueAtTime(0.18, this._ctx.currentTime);
      env.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.04);
      o.start(); o.stop(this._ctx.currentTime + 0.04);
    });
  }

  /** Great hit */
  great() {
    if (this._playBuffer('great', 0.85)) return;
    // Synthesized fallback — crisp open-hat
    this._play(g => {
      const dur = 0.06;
      const buf = this._ctx.createBuffer(1, this._ctx.sampleRate * dur, this._ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / data.length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 4) * 0.5;
      }
      const src = this._ctx.createBufferSource();
      src.buffer = buf;
      const filt = this._ctx.createBiquadFilter();
      filt.type = 'bandpass'; filt.frequency.value = 8000; filt.Q.value = 1.2;
      const hp = this._ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 5000;
      src.connect(filt); filt.connect(hp); hp.connect(g);
      g.gain.setValueAtTime(0.75, this._ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + dur);
      src.start(); src.stop(this._ctx.currentTime + dur);
    });
  }

  /** Good hit */
  good() {
    if (this._playBuffer('good', 0.75)) return;
    // Synthesized fallback — softer tick
    this._play(g => {
      const dur = 0.05;
      const buf = this._ctx.createBuffer(1, this._ctx.sampleRate * dur, this._ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / data.length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 5) * 0.35;
      }
      const src = this._ctx.createBufferSource();
      src.buffer = buf;
      const filt = this._ctx.createBiquadFilter();
      filt.type = 'bandpass'; filt.frequency.value = 6000; filt.Q.value = 1.0;
      src.connect(filt); filt.connect(g);
      g.gain.setValueAtTime(0.6, this._ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + dur);
      src.start(); src.stop(this._ctx.currentTime + dur);
    });
  }

  /** Generic hit — used for great/good/bad as a fallback (deprecated, use granular methods) */
  hit() {
    this.great();
  }

  /** Empty key press / tap — quiet tick */
  emptyHit() {
    if (this._playBuffer('tap', 0.6)) return;
    this._play(g => {
      const dur = 0.03;
      const buf = this._ctx.createBuffer(1, this._ctx.sampleRate * dur, this._ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 6) * 0.3;
      }
      const src = this._ctx.createBufferSource();
      src.buffer = buf;
      const filt = this._ctx.createBiquadFilter();
      filt.type = 'highpass'; filt.frequency.value = 7000;
      src.connect(filt); filt.connect(g);
      g.gain.setValueAtTime(0.3, this._ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + dur);
      src.start(); src.stop(this._ctx.currentTime + dur);
    });
  }

  // ── Negative feedback ───────────────────────────────────────

  miss() {
    this._play(g => {
      const buf = this._ctx.createBuffer(1, this._ctx.sampleRate * 0.1, this._ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
      const src = this._ctx.createBufferSource();
      const filt = this._ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 180;
      src.buffer = buf; src.connect(filt); filt.connect(g);
      g.gain.value = 1.8; src.start(); src.stop(this._ctx.currentTime + 0.1);
    });
  }

  fail() {
    this._play(g => {
      const dur = 1.5;
      const buf = this._ctx.createBuffer(1, this._ctx.sampleRate * dur, this._ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / this._ctx.sampleRate;
        const p = t / dur;
        const freq = 220 * Math.pow(1 - p * 0.6, 2);
        const amp = 0.15 * Math.pow(1 - p, 1.5);
        data[i] = Math.sin(2 * Math.PI * freq * t) * amp;
        data[i] += Math.sin(2 * Math.PI * freq * 0.5 * t) * amp * 0.3;
        data[i] += (Math.random() * 2 - 1) * amp * 0.1;
      }
      const src = this._ctx.createBufferSource();
      const filt = this._ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 400;
      src.buffer = buf; src.connect(filt); filt.connect(g);
      g.gain.value = 1.0; src.start(); src.stop(this._ctx.currentTime + dur);
    });
  }

  // ── UI sounds (always synthesized) ─────────────────────────

  crtClick() {
    this._play(g => {
      const dur = 0.018;
      const buf = this._ctx.createBuffer(1, this._ctx.sampleRate * dur, this._ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / data.length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3) * 1.2;
      }
      const src = this._ctx.createBufferSource();
      src.buffer = buf;
      const filt = this._ctx.createBiquadFilter();
      filt.type = 'highpass'; filt.frequency.value = 3000;
      src.connect(filt); filt.connect(g);
      g.gain.setValueAtTime(1.0, this._ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + dur);
      src.start(); src.stop(this._ctx.currentTime + dur);
    });
  }

  crtSwitch() {
    // Layer 1: Low-frequency pop
    this._play(g => {
      const dur = 0.04;
      const buf = this._ctx.createBuffer(1, this._ctx.sampleRate * dur, this._ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / data.length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3);
      }
      const src = this._ctx.createBufferSource();
      src.buffer = buf;
      const filt = this._ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 1200; filt.Q.value = 0.7;
      src.connect(filt); filt.connect(g);
      g.gain.setValueAtTime(1.0, this._ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + dur);
      src.start(); src.stop(this._ctx.currentTime + dur);
    });
    // Layer 2: High-frequency static sweep
    this._play(g => {
      const dur = 0.06;
      const buf = this._ctx.createBuffer(1, this._ctx.sampleRate * dur, this._ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / data.length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2) * 0.3;
      }
      const src = this._ctx.createBufferSource();
      src.buffer = buf;
      const filt = this._ctx.createBiquadFilter();
      filt.type = 'bandpass'; filt.Q.value = 0.8;
      filt.frequency.setValueAtTime(5000, this._ctx.currentTime);
      filt.frequency.exponentialRampToValueAtTime(1500, this._ctx.currentTime + dur);
      src.connect(filt); filt.connect(g);
      g.gain.setValueAtTime(1.0, this._ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + dur);
      src.start(); src.stop(this._ctx.currentTime + dur);
    });
    // Layer 3: Interference burst
    this._play(g => {
      const dur = 0.08;
      const buf = this._ctx.createBuffer(1, this._ctx.sampleRate * dur, this._ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / data.length;
        data[i] = (Math.random() * 2 - 1) * (t < 0.1 ? 0.8 : Math.pow(1 - (t - 0.1) / 0.9, 3) * 0.4);
      }
      const src = this._ctx.createBufferSource();
      src.buffer = buf;
      const hp = this._ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 2000;
      const lp = this._ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 8000;
      src.connect(hp); hp.connect(lp); lp.connect(g);
      g.gain.setValueAtTime(0.7, this._ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + dur);
      src.start(); src.stop(this._ctx.currentTime + dur);
    });
  }

  milestone(combo) {
    const pitch = combo >= 500 ? 1600 : combo >= 200 ? 1200 : combo >= 100 ? 1000 : 800;
    this._play(g => {
      [0, 0.06, 0.12].forEach((delay, i) => {
        const o = this._ctx.createOscillator();
        const env = this._ctx.createGain();
        o.type = 'sine'; o.connect(env); env.connect(g);
        o.frequency.value = pitch + i * 200;
        env.gain.setValueAtTime(0, this._ctx.currentTime + delay);
        env.gain.linearRampToValueAtTime(1.0, this._ctx.currentTime + delay + 0.02);
        env.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + delay + 0.1);
        o.start(this._ctx.currentTime + delay); o.stop(this._ctx.currentTime + delay + 0.1);
      });
    });
  }

  /** Game start — rising sweep + impact + ding */
  gameStart() {
    // Layer 1: Rising sweep
    this._play(g => {
      const dur = 0.25;
      const buf = this._ctx.createBuffer(1, this._ctx.sampleRate * dur, this._ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / data.length;
        const freq = 300 + t * 1200;
        data[i] = Math.sin(2 * Math.PI * freq * t * dur) * 0.3 * Math.pow(1 - t, 1.5);
        data[i] += Math.sin(2 * Math.PI * freq * 2 * t * dur) * 0.1 * Math.pow(1 - t, 2);
      }
      const src = this._ctx.createBufferSource();
      src.buffer = buf;
      const filt = this._ctx.createBiquadFilter();
      filt.type = 'bandpass'; filt.frequency.value = 800; filt.Q.value = 1.2;
      src.connect(filt); filt.connect(g);
      g.gain.setValueAtTime(0.8, this._ctx.currentTime);
      g.gain.linearRampToValueAtTime(1.0, this._ctx.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + dur);
      src.start(); src.stop(this._ctx.currentTime + dur);
    });
    // Layer 2: Impact click
    this._play(g => {
      const dur = 0.06;
      const buf = this._ctx.createBuffer(1, this._ctx.sampleRate * dur, this._ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / data.length;
        data[i] = (Math.random() * 2 - 1) * (t < 0.05 ? 1.0 : Math.pow(1 - (t - 0.05) / 0.95, 4) * 0.6);
      }
      const src = this._ctx.createBufferSource();
      src.buffer = buf;
      const bp = this._ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 3000; bp.Q.value = 1.5;
      const hp = this._ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 1500;
      src.connect(bp); bp.connect(hp); hp.connect(g);
      g.gain.setValueAtTime(1.0, this._ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + dur);
      src.start(); src.stop(this._ctx.currentTime + dur);
    });
    // Layer 3: Resonant ding
    this._play(g => {
      const o = this._ctx.createOscillator();
      const env = this._ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(880, this._ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(1320, this._ctx.currentTime + 0.08);
      o.connect(env); env.connect(g);
      env.gain.setValueAtTime(0.4, this._ctx.currentTime);
      env.gain.linearRampToValueAtTime(0.5, this._ctx.currentTime + 0.02);
      env.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.35);
      o.start(); o.stop(this._ctx.currentTime + 0.35);
    });
  }
}
