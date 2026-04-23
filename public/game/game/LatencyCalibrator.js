import EventBus from '../core/EventBus.js';

export default class LatencyCalibrator {
  constructor(audioEngine) {
    this.audio = audioEngine;
    this._offsets = [];
    this._calibrating = false;
    this._calibrationStart = 0;

    // Load saved offset
    const saved = localStorage.getItem('rhythm-os-audio-offset');
    if (saved) {
      this.audio.setOffset(parseFloat(saved) / 1000); // stored as ms, convert to seconds
    }
  }

  startCalibration() {
    this._calibrating = true;
    this._offsets = [];
    this._calibrationStart = this.audio.currentTime;
  }

  recordHit() {
    if (!this._calibrating) return;
    const hitTime = this.audio.currentTime;
    // We're calibrating against a metronome beat
    // The offset is how early/late the hit was compared to the expected beat
    this._offsets.push(hitTime);
  }

  stopCalibration() {
    this._calibrating = false;
    if (this._offsets.length === 0) return 0;

    // Average offset in ms
    const avgOffset = this._offsets.reduce((a, b) => a + b, 0) / this._offsets.length;
    const offsetMs = Math.round(avgOffset * 1000);

    // Save to localStorage
    localStorage.setItem('rhythm-os-audio-offset', offsetMs.toString());
    this.audio.setOffset(offsetMs / 1000);

    EventBus.emit('settings:changed', { key: 'audioOffset', value: offsetMs });
    return offsetMs;
  }

  setOffset(ms) {
    localStorage.setItem('rhythm-os-audio-offset', ms.toString());
    this.audio.setOffset(ms / 1000);
    EventBus.emit('settings:changed', { key: 'audioOffset', value: ms });
  }

  getOffset() {
    const saved = localStorage.getItem('rhythm-os-audio-offset');
    return saved ? parseFloat(saved) : 0;
  }

  get isCalibrating() { return this._calibrating; }
}
