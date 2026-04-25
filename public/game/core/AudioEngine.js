import EventBus from './EventBus.js';

export default class AudioEngine {
  constructor() {
    this._ctx = null;
    this._gain = null;
    this._musicGain = null;
    this._source = null;
    this._startedAt = 0;
    this._playOffset = 0;
    this._offset = 0;
    this._pausedAt = 0;
    this._playing = false;
    this._currentBuffer = null;
    this._leadInBuffer = null;  // buffer with silence prepended
    this._beatTimer = null;
    this._beatIndex = 0;
    this._bpm = 0;
    // Audio analysis for reactive effects
    this._analyser = null;
    this._freqData = null;
    this._audioIntensity = 0;
    this._bassIntensity = 0;
  }

  _ensureCtx() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._gain = this._ctx.createGain();
      this._gain.connect(this._ctx.destination);

      // Music volume gain node (separate from master)
      this._musicGain = this._ctx.createGain();
      this._musicGain.gain.value = 1.0;
      this._musicGain.connect(this._gain);

      // Create analyser for reactive effects
      this._analyser = this._ctx.createAnalyser();
      this._analyser.fftSize = 256;
      this._analyser.smoothingTimeConstant = 0.8;
      this._freqData = new Uint8Array(this._analyser.frequencyBinCount);
      // Connect: source → gain → analyser → destination
      this._gain.disconnect();
      this._gain.connect(this._analyser);
      this._analyser.connect(this._ctx.destination);
    }
    if (this._ctx.state === 'suspended') this._ctx.resume();
  }

  async decodeBuffer(arrayBuffer) {
    this._ensureCtx();
    return this._ctx.decodeAudioData(arrayBuffer);
  }

  /**
   * Create a new AudioBuffer with `leadInSeconds` of silence prepended.
   * This allows the game clock to start at 0 and advance during the
   * lead-in period while the player hears silence. Notes stay at their
   * ORIGINAL times — no shift needed, no desync.
   */
  createLeadInBuffer(originalBuffer, leadInSeconds) {
    this._ensureCtx();
    const sampleRate = originalBuffer.sampleRate;
    const channels = originalBuffer.numberOfChannels;
    const leadInSamples = Math.round(leadInSeconds * sampleRate);
    const totalSamples = leadInSamples + originalBuffer.length;

    const newBuffer = this._ctx.createBuffer(channels, totalSamples, sampleRate);

    for (let ch = 0; ch < channels; ch++) {
      const srcData = originalBuffer.getChannelData(ch);
      const dstData = newBuffer.getChannelData(ch);
      // First `leadInSamples` samples are already 0 (silence)
      dstData.set(srcData, leadInSamples);
    }

    return newBuffer;
  }

  play(buffer, startOffset = 0) {
    this._ensureCtx();
    this.stop();
    this._currentBuffer = buffer;
    this._source = this._ctx.createBufferSource();
    this._source.buffer = buffer;
    this._source.connect(this._musicGain);
    this._startedAt = this._ctx.currentTime;
    this._playOffset = startOffset;
    this._playing = true;
    this._source.start(0, startOffset);
    this._source.onended = () => { this._playing = false; };
  }

  stop() {
    if (this._source) {
      try { this._source.stop(); } catch(e) {}
      this._source = null;
    }
    this._playing = false;
  }

  pause() {
    if (!this._playing) return;
    // Save raw audio position WITHOUT offset, so resume doesn't double-count it.
    // currentTime includes offset, but the audio buffer position should not.
    this._pausedAt = (this._ctx.currentTime - this._startedAt) + this._playOffset;
    this.stop();
  }

  resume() {
    if (this._currentBuffer && this._pausedAt > 0) {
      // _pausedAt is raw audio position (no offset), so play() sets _playOffset correctly
      this.play(this._currentBuffer, this._pausedAt);
    }
  }

  fadeTo(volume, durationSec) {
    if (!this._gain || !this._ctx) return;
    this._gain.gain.linearRampToValueAtTime(volume, this._ctx.currentTime + durationSec);
  }

  /** Gradually slow playback from 1.0 → ~0 over durationSec */
  slowDown(durationSec) {
    if (!this._source || !this._ctx || !this._playing) return;
    this._source.playbackRate.linearRampToValueAtTime(0.01, this._ctx.currentTime + durationSec);
  }

  setVolume(volume) {
    if (!this._gain) return;
    this._gain.gain.value = volume;
  }

  setMusicVolume(vol) {
    if (this._musicGain) this._musicGain.gain.value = Math.max(0, Math.min(1, vol));
  }

  get currentTime() {
    if (!this._ctx) return 0;
    if (!this._playing) return this._pausedAt + this._offset;
    return (this._ctx.currentTime - this._startedAt) + this._playOffset + this._offset;
  }

  get isPlaying() { return this._playing; }
  get ctx() { return this._ctx; }
  setOffset(seconds) { this._offset = seconds; }

  /**
   * Analyze current audio and return intensity values.
   * Call this once per frame for reactive effects.
   * Returns { intensity: 0-1, bass: 0-1, mid: 0-1, high: 0-1 }
   */
  getAudioLevels() {
    if (!this._analyser || !this._playing) {
      this._audioIntensity *= 0.9;
      this._bassIntensity *= 0.9;
      return {
        intensity: this._audioIntensity,
        bass: this._bassIntensity,
        mid: 0,
        high: 0
      };
    }

    this._analyser.getByteFrequencyData(this._freqData);

    const len = this._freqData.length;
    const bassEnd = Math.floor(len * 0.1);   // ~0-200Hz
    const midEnd = Math.floor(len * 0.4);     // ~200-2kHz
    // high: midEnd to len

    let bassSum = 0, midSum = 0, highSum = 0;
    for (let i = 0; i < len; i++) {
      const v = this._freqData[i] / 255;
      if (i < bassEnd) bassSum += v;
      else if (i < midEnd) midSum += v;
      else highSum += v;
    }

    const bass = bassEnd > 0 ? bassSum / bassEnd : 0;
    const mid = (midEnd - bassEnd) > 0 ? midSum / (midEnd - bassEnd) : 0;
    const high = (len - midEnd) > 0 ? highSum / (len - midEnd) : 0;
    const intensity = len > 0 ? (bassSum + midSum + highSum) / len : 0;

    // Smooth with decay
    this._audioIntensity = this._audioIntensity * 0.7 + intensity * 0.3;
    this._bassIntensity = this._bassIntensity * 0.7 + bass * 0.3;

    return {
      intensity: this._audioIntensity,
      bass: this._bassIntensity,
      mid,
      high
    };
  }

  startBeatScheduler(bpm) {
    this.stopBeatScheduler();
    this._bpm = bpm;
    this._beatIndex = 0;
    const interval = 60 / bpm;

    const schedule = () => {
      if (!this._playing) return;
      const currentBeat = Math.floor(this.currentTime / interval);
      // Limit burst emission: only emit up to 4 beats per frame to prevent
      // visual glitch stacks after tab switch
      let emitted = 0;
      while (this._beatIndex <= currentBeat && emitted < 4) {
        EventBus.emit('beat:pulse', { bpm, index: this._beatIndex });
        this._beatIndex++;
        emitted++;
      }
      // If we fell behind, skip to current beat instead of queuing all
      if (this._beatIndex < currentBeat) {
        this._beatIndex = currentBeat;
      }
      this._beatTimer = requestAnimationFrame(schedule);
    };
    this._beatTimer = requestAnimationFrame(schedule);
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
