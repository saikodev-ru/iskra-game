import EventBus from '../core/EventBus.js';

export default class ScreenManager {
  constructor(container) {
    this.container = container;
    this._screens = {};
    this._current = null;
    this._currentName = '';
    this._transitioning = false;
  }
  register(name, factory) { this._screens[name] = factory; }
  show(name, data = {}) {
    if (this._transitioning || name === this._currentName) return;
    const from = this._currentName;
    this._transitioning = true;
    const factory = this._screens[name];
    if (!factory) { console.error(`Screen "${name}" not registered`); this._transitioning = false; return; }
    const destroyCurrent = () => { if (this._current) { if (this._current.destroy) this._current.destroy(); this.container.innerHTML = ''; this._current = null; } };
    if (this._current) { this.container.classList.add('screen-exit'); setTimeout(() => { destroyCurrent(); this._showNew(name, factory, data, from); }, 200); }
    else { destroyCurrent(); this._showNew(name, factory, data, from); }
  }
  _showNew(name, factory, data, from) {
    const screen = factory(data);
    this._current = screen;
    this._currentName = name;
    if (screen.build) { const el = screen.build(); if (typeof el === 'string') this.container.innerHTML = el; else { this.container.innerHTML = ''; this.container.appendChild(el); } }
    if (screen.init) screen.init(data);
    this.container.classList.remove('screen-exit');
    this.container.classList.add('screen-enter');
    setTimeout(() => { this.container.classList.remove('screen-enter'); this._transitioning = false; }, 250);
    EventBus.emit('screen:change', { from, to: name });
  }
  get currentName() { return this._currentName; }
  get current() { return this._current; }
}
