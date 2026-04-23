export default class HitSounds {
  constructor(audioCtx) {
    this._ctx = audioCtx;
  }

  _play(fn) {
    if (!this._ctx) return;
    const g = this._ctx.createGain();
    g.connect(this._ctx.destination);
    fn(g);
  }

  // Main hit — clean percussive click with slight pitch
  hit() {
    this._play(g => {
      const o = this._ctx.createOscillator();
      const env = this._ctx.createGain();
      o.connect(env); env.connect(g);
      o.frequency.setValueAtTime(800, this._ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(200, this._ctx.currentTime + 0.08);
      env.gain.setValueAtTime(0.4, this._ctx.currentTime);
      env.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.08);
      o.start(); o.stop(this._ctx.currentTime + 0.08);
    });
  }

  // Perfect — brighter, higher pitch
  perfect() {
    this._play(g => {
      const o = this._ctx.createOscillator();
      const env = this._ctx.createGain();
      o.type = 'triangle';
      o.connect(env); env.connect(g);
      o.frequency.setValueAtTime(1200, this._ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(600, this._ctx.currentTime + 0.1);
      env.gain.setValueAtTime(0.35, this._ctx.currentTime);
      env.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.1);
      o.start(); o.stop(this._ctx.currentTime + 0.1);
    });
  }

  // Miss — low thud
  miss() {
    this._play(g => {
      const buf = this._ctx.createBuffer(1, this._ctx.sampleRate * 0.15, this._ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
      }
      const src = this._ctx.createBufferSource();
      const filt = this._ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 200;
      src.buffer = buf;
      src.connect(filt); filt.connect(g);
      g.gain.value = 0.5;
      src.start(); src.stop(this._ctx.currentTime + 0.15);
    });
  }

  // CRT click — UI interactions
  crtClick() {
    this._play(g => {
      const buf = this._ctx.createBuffer(1, this._ctx.sampleRate * 0.03, this._ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
      }
      const src = this._ctx.createBufferSource();
      src.buffer = buf;
      src.connect(g);
      g.gain.value = 0.3;
      src.start();
    });
  }

  // CRT channel switch — screen transitions
  crtSwitch() {
    this._play(g => {
      const buf = this._ctx.createBuffer(1, this._ctx.sampleRate * 0.06, this._ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * (i < data.length * 0.3 ? 1 : Math.pow(1 - i / data.length, 1.5));
      }
      const src = this._ctx.createBufferSource();
      const filt = this._ctx.createBiquadFilter();
      filt.type = 'bandpass'; filt.frequency.value = 2000; filt.Q.value = 0.5;
      src.buffer = buf;
      src.connect(filt); filt.connect(g);
      g.gain.value = 0.4;
      src.start();
    });
  }

  // Combo milestone
  milestone(combo) {
    const pitch = combo >= 500 ? 1600 : combo >= 200 ? 1200 : combo >= 100 ? 1000 : 800;
    this._play(g => {
      [0, 0.06, 0.12].forEach((delay, i) => {
        const o = this._ctx.createOscillator();
        const env = this._ctx.createGain();
        o.type = 'sine';
        o.connect(env); env.connect(g);
        o.frequency.value = pitch + i * 200;
        env.gain.setValueAtTime(0, this._ctx.currentTime + delay);
        env.gain.linearRampToValueAtTime(0.2, this._ctx.currentTime + delay + 0.02);
        env.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + delay + 0.1);
        o.start(this._ctx.currentTime + delay);
        o.stop(this._ctx.currentTime + delay + 0.1);
      });
    });
  }
}
