export default class HitSounds {
  constructor(audioCtx) { this._ctx = audioCtx; }

  _play(fn) {
    if (!this._ctx) return;
    const g = this._ctx.createGain();
    g.connect(this._ctx.destination);
    fn(g);
  }

  /** Normal hit — short open-hat style: filtered noise burst */
  hit() {
    this._play(g => {
      const dur = 0.06;
      const buf = this._ctx.createBuffer(1, this._ctx.sampleRate * dur, this._ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / data.length;
        // Noise shaped with a quick decay
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 4) * 0.5;
      }
      const src = this._ctx.createBufferSource();
      src.buffer = buf;

      // Bandpass for open-hat character (high-mid metallic)
      const filt = this._ctx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.value = 8000;
      filt.Q.value = 1.2;

      // Highpass to remove low rumble
      const hp = this._ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 5000;

      src.connect(filt);
      filt.connect(hp);
      hp.connect(g);

      g.gain.setValueAtTime(0.25, this._ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + dur);

      src.start();
      src.stop(this._ctx.currentTime + dur);
    });
  }

  /** Perfect hit — open-hat with a subtle tonal shimmer */
  perfect() {
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
      filt.type = 'bandpass';
      filt.frequency.value = 10000;
      filt.Q.value = 1.5;

      const hp = this._ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 6000;

      src.connect(filt);
      filt.connect(hp);
      hp.connect(g);

      g.gain.setValueAtTime(0.3, this._ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + dur);

      src.start();
      src.stop(this._ctx.currentTime + dur);
    });

    // Add subtle metallic ring
    this._play(g => {
      const o = this._ctx.createOscillator();
      const env = this._ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(6800, this._ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(5200, this._ctx.currentTime + 0.04);
      o.connect(env);
      env.connect(g);
      env.gain.setValueAtTime(0.06, this._ctx.currentTime);
      env.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.04);
      o.start();
      o.stop(this._ctx.currentTime + 0.04);
    });
  }

  /** Empty key press — very quiet open-hat tick */
  emptyHit() {
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
      filt.type = 'highpass';
      filt.frequency.value = 7000;
      src.connect(filt);
      filt.connect(g);
      g.gain.setValueAtTime(0.1, this._ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + dur);
      src.start();
      src.stop(this._ctx.currentTime + dur);
    });
  }

  miss() {
    this._play(g => {
      const buf = this._ctx.createBuffer(1, this._ctx.sampleRate * 0.1, this._ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
      const src = this._ctx.createBufferSource();
      const filt = this._ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 180;
      src.buffer = buf; src.connect(filt); filt.connect(g);
      g.gain.value = 0.3; src.start(); src.stop(this._ctx.currentTime + 0.1);
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
      g.gain.value = 0.4; src.start(); src.stop(this._ctx.currentTime + dur);
    });
  }

  crtClick() {
    this._play(g => {
      // Soft, muted click — very short noise burst
      const dur = 0.018;
      const buf = this._ctx.createBuffer(1, this._ctx.sampleRate * dur, this._ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / data.length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3) * 0.4;
      }
      const src = this._ctx.createBufferSource();
      src.buffer = buf;
      const filt = this._ctx.createBiquadFilter();
      filt.type = 'highpass'; filt.frequency.value = 3000;
      src.connect(filt); filt.connect(g);
      g.gain.setValueAtTime(0.12, this._ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + dur);
      src.start();
      src.stop(this._ctx.currentTime + dur);
    });
  }

  crtSwitch() {
    // Soft TV channel switch: brief electronic pop + subtle static whoosh
    // Layer 1: Short low-frequency pop (the CRT relay click)
    this._play(g => {
      const dur = 0.04;
      const buf = this._ctx.createBuffer(1, this._ctx.sampleRate * dur, this._ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / data.length;
        // Quick attack, smooth decay — mimics CRT relay snap
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 4);
      }
      const src = this._ctx.createBufferSource();
      src.buffer = buf;
      // Low-mid pass gives it a warm, muffled character
      const filt = this._ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 1200; filt.Q.value = 0.7;
      src.connect(filt); filt.connect(g);
      g.gain.setValueAtTime(0.18, this._ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + dur);
      src.start();
      src.stop(this._ctx.currentTime + dur);
    });

    // Layer 2: Very short high-frequency static sweep (the channel tuning hiss)
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
      // Sweep from high to mid — like tuning across frequencies
      const filt = this._ctx.createBiquadFilter();
      filt.type = 'bandpass'; filt.Q.value = 0.8;
      filt.frequency.setValueAtTime(5000, this._ctx.currentTime);
      filt.frequency.exponentialRampToValueAtTime(1500, this._ctx.currentTime + dur);
      src.connect(filt); filt.connect(g);
      g.gain.setValueAtTime(0.08, this._ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + dur);
      src.start();
      src.stop(this._ctx.currentTime + dur);
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
        env.gain.linearRampToValueAtTime(0.15, this._ctx.currentTime + delay + 0.02);
        env.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + delay + 0.1);
        o.start(this._ctx.currentTime + delay); o.stop(this._ctx.currentTime + delay + 0.1);
      });
    });
  }
}
