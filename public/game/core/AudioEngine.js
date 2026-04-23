import EventBus from './EventBus.js';

export default class AudioEngine {
  constructor() {
    this._ctx = null; // Lazy init on user gesture
    this._gain = null;
    this._source = null;
    this._startedAt = 0;
    this._offset = 0;       // latency compensation in seconds
    this._pausedAt = 0;
    this._playing = false;
    this._currentBuffer = null;
    this._beatInterval = null;
    this._beatIndex = 0;
    this._bpm = 0;
  }

  _ensureCtx() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._gain = this._ctx.createGain();
      this._gain.connect(this._ctx.destination);
    }
    if (this._ctx.state === 'suspended') {
      this._ctx.resume();
    }
  }

  async decodeBuffer(arrayBuffer) {
    this._ensureCtx();
    return this._ctx.decodeAudioData(arrayBuffer);
  }

  play(buffer, startOffset = 0) {
    this._ensureCtx();
    this.stop();
    this._currentBuffer = buffer;
    this._source = this._ctx.createBufferSource();
    this._source.buffer = buffer;
    this._source.connect(this._gain);
    this._startedAt = this._ctx.currentTime - startOffset;
    this._offset = 0;
    this._playing = true;
    this._source.start(0, startOffset);
    this._source.onended = () => {
      if (this._playing) {
        this._playing = false;
      }
    };
  }

  stop() {
    if (this._source) {
      try { this._source.stop(); } catch(e) {}
      this._source = null;
    }
    this._playing = false;
    this._startedAt = 0;
    this._pausedAt = 0;
  }

  pause() {
    if (!this._playing) return;
    this._pausedAt = this.currentTime;
    this.stop();
  }

  resume() {
    if (this._currentBuffer && this._pausedAt > 0) {
      this.play(this._currentBuffer, this._pausedAt);
    }
  }

  fadeTo(volume, durationSec) {
    if (!this._gain) return;
    this._gain.gain.linearRampToValueAtTime(volume, this._ctx.currentTime + durationSec);
  }

  setVolume(volume) {
    if (!this._gain) return;
    this._gain.gain.value = volume;
  }

  get currentTime() {
    if (!this._ctx) return 0;
    return this._ctx.currentTime - this._startedAt + this._offset;
  }

  get isPlaying() { return this._playing; }
  get ctx() { return this._ctx; }

  setOffset(seconds) { this._offset = seconds; }

  // Beat scheduler - uses AudioContext scheduler, NOT setInterval
  startBeatScheduler(bpm) {
    this.stopBeatScheduler();
    this._bpm = bpm;
    this._beatIndex = 0;
    const interval = 60 / bpm;

    const scheduleBeats = () => {
      if (!this._playing) return;
      const now = this._ctx.currentTime;
      const currentBeat = Math.floor(this.currentTime / interval);

      while (this._beatIndex <= currentBeat) {
        EventBus.emit('beat:pulse', { bpm, index: this._beatIndex });
        this._beatIndex++;
      }

      this._beatTimer = requestAnimationFrame(scheduleBeats);
    };

    this._beatTimer = requestAnimationFrame(scheduleBeats);
  }

  stopBeatScheduler() {
    if (this._beatTimer) {
      cancelAnimationFrame(this._beatTimer);
      this._beatTimer = null;
    }
    this._beatIndex = 0;
    this._bpm = 0;
  }
}
