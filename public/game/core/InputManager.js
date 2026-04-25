import EventBus from './EventBus.js';

const DEFAULT_KEY_MAPS = {
  4: { 'KeyD': 0, 'KeyF': 1, 'KeyJ': 2, 'KeyK': 3 },
  6: { 'KeyS': 0, 'KeyD': 1, 'KeyF': 2, 'KeyJ': 3, 'KeyK': 4, 'KeyL': 5 },
  7: { 'KeyS': 0, 'KeyD': 1, 'KeyF': 2, 'Space': 3, 'KeyJ': 4, 'KeyK': 5, 'KeyL': 6 },
  8: { 'KeyA': 0, 'KeyS': 1, 'KeyD': 2, 'KeyF': 3, 'KeyJ': 4, 'KeyK': 5, 'KeyL': 6, 'Semicolon': 7 }
};

export default class InputManager {
  constructor(audioEngine) {
    this.audio = audioEngine;
    this.laneCount = 4;
    this.keyMap = { ...DEFAULT_KEY_MAPS[4] };
    this._active = new Set();
    this._enabled = false;
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
  }
  setLaneCount(count) {
    this.laneCount = count;
    const saved = localStorage.getItem('rhythm-os-keybinds');
    if (saved) {
      try { const parsed = JSON.parse(saved); if (parsed[count]) { this.keyMap = parsed[count]; return; } } catch(e) {}
    }
    this.keyMap = { ...DEFAULT_KEY_MAPS[count] };
  }
  setKeyMap(laneCount, map) {
    this.laneCount = laneCount; this.keyMap = map;
    const saved = localStorage.getItem('rhythm-os-keybinds');
    let all = {}; try { all = JSON.parse(saved) || {}; } catch(e) {}
    all[laneCount] = map;
    localStorage.setItem('rhythm-os-keybinds', JSON.stringify(all));
    EventBus.emit('settings:changed', { key: 'keybinds', value: all });
  }
  enable() {
    if (this._enabled) return;
    this._enabled = true;
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }
  disable() {
    this._enabled = false;
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this._active.clear();
  }
  _onKeyDown(e) {
    if (e.repeat) return;
    const lane = this.keyMap[e.code];
    if (lane === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    this._active.add(e.code);
    EventBus.emit('input:hit', { lane, hitTime: this.audio.currentTime });
  }
  _onKeyUp(e) {
    const lane = this.keyMap[e.code];
    if (lane !== undefined) {
      e.preventDefault();
      e.stopPropagation();
      EventBus.emit('input:release', { lane, releaseTime: this.audio.currentTime });
    }
    this._active.delete(e.code);
  }
  isKeyDown(code) { return this._active.has(code); }
  getKeyMap() { return { ...this.keyMap }; }
  getDefaultKeyMaps() { return JSON.parse(JSON.stringify(DEFAULT_KEY_MAPS)); }
}
