const EventBus = {
  _l: {},
  on(e, fn)   { (this._l[e] ??= []).push(fn); },
  off(e, fn)  { this._l[e] = (this._l[e]||[]).filter(f => f !== fn); },
  emit(e, d)  { (this._l[e]||[]).forEach(fn => fn(d)); },
  once(e, fn) { const w = (d) => { fn(d); this.off(e, w); }; this.on(e, w); }
};
export default EventBus;
