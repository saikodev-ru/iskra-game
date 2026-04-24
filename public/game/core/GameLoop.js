export default class GameLoop {
  constructor({ update, render }) {
    this.update = update;
    this.render = render;
    this._rAF = null;
    this._last = 0;
    this._running = false;
    this._tick = this._tick.bind(this);
  }
  start() {
    if (this._running) return;
    this._running = true;
    this._last = performance.now();
    this._rAF = requestAnimationFrame(this._tick);
  }
  stop() {
    this._running = false;
    if (this._rAF) { cancelAnimationFrame(this._rAF); this._rAF = null; }
  }
  _tick(timestamp) {
    if (!this._running) return;
    const delta = Math.min((timestamp - this._last) / 1000, 0.05);
    this._last = timestamp;
    this.update(delta);
    this.render(delta);
    this._rAF = requestAnimationFrame(this._tick);
  }
}
