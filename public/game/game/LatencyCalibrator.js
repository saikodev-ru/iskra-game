import EventBus from '../core/EventBus.js';

export default class LatencyCalibrator {
  constructor(audioEngine) {
    this.audio = audioEngine;
    this._offsets = [];
    this._calibrating = false;
    const saved = localStorage.getItem('rhythm-os-audio-offset');
    if (saved) this.audio.setOffset(parseFloat(saved) / 1000);
  }
  startCalibration() { this._calibrating = true; this._offsets = []; }
  recordHit() { if (!this._calibrating) return; this._offsets.push(this.audio.currentTime); }
  stopCalibration() {
    this._calibrating = false;
    if (this._offsets.length === 0) return 0;
    const avgOffset = this._offsets.reduce((a, b) => a + b, 0) / this._offsets.length;
    const offsetMs = Math.round(avgOffset * 1000);
    localStorage.setItem('rhythm-os-audio-offset', offsetMs.toString());
    this.audio.setOffset(offsetMs / 1000);
    EventBus.emit('settings:changed', { key: 'audioOffset', value: offsetMs });
    return offsetMs;
  }
  setOffset(ms) { localStorage.setItem('rhythm-os-audio-offset', ms.toString()); this.audio.setOffset(ms / 1000); EventBus.emit('settings:changed', { key: 'audioOffset', value: ms }); }
  getOffset() { const saved = localStorage.getItem('rhythm-os-audio-offset'); return saved ? parseFloat(saved) : 0; }
  get isCalibrating() { return this._calibrating; }
}
