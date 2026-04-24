import EventBus from '../core/EventBus.js';

export default class JudgementDisplay {
  constructor(container) {
    this.container = container;
    this._currentEl = null;
    this._deltaEl = null;
    this._timingEl = null;
    this._comboBreakEl = null;
    this._milestoneEl = null;
    this._outTimer = null;
    this._setupListeners();
  }

  _setupListeners() {
    EventBus.on('note:hit', ({ judgement, delta, timing }) => this.show(judgement, delta, timing));
    EventBus.on('note:miss', () => this.showMiss());
    EventBus.on('combo:break', ({ combo }) => this.showComboBreak(combo));
  }

  show(judgement, delta, timing) {
    if (this._currentEl) this._currentEl.remove();
    if (this._deltaEl) this._deltaEl.remove();
    if (this._timingEl) this._timingEl.remove();
    const el = document.createElement('div');
    el.className = `judgement-text judgement--${judgement} judgement--in`;
    el.textContent = judgement.toUpperCase();
    this.container.appendChild(el);
    this._currentEl = el;

    // Show delta ms value
    if (delta !== undefined && Math.abs(delta) > 5) {
      const deltaEl = document.createElement('div');
      deltaEl.className = 'delta-display judgement--in';
      const sign = delta >= 0 ? '+' : '';
      deltaEl.textContent = `${sign}${delta}ms`;
      this.container.appendChild(deltaEl);
      this._deltaEl = deltaEl;
    }

    // Show early/late indicator (only for non-perfect hits with significant offset)
    if (timing && judgement !== 'perfect') {
      const timingEl = document.createElement('div');
      timingEl.className = 'delta-display judgement--in';
      const timingColor = timing === 'early' ? 'var(--zzz-yellow)' : 'var(--zzz-red)';
      timingEl.style.cssText = `font-family:var(--zzz-font);font-weight:700;font-size:13px;color:${timingColor};margin-top:2px;text-transform:uppercase;letter-spacing:0.1em;`;
      timingEl.textContent = timing === 'early' ? 'EARLY' : 'LATE';
      this.container.appendChild(timingEl);
      this._timingEl = timingEl;
    } else {
      this._timingEl = null;
    }

    clearTimeout(this._outTimer);
    const duration = judgement === 'perfect' ? 600 : judgement === 'great' ? 500 : 350;
    this._outTimer = setTimeout(() => {
      if (this._currentEl) { this._currentEl.classList.remove('judgement--in'); this._currentEl.classList.add('judgement--out'); const r = this._currentEl; setTimeout(() => r.remove(), 250); this._currentEl = null; }
      if (this._deltaEl) { this._deltaEl.classList.remove('judgement--in'); this._deltaEl.classList.add('judgement--out'); const r = this._deltaEl; setTimeout(() => r.remove(), 250); this._deltaEl = null; }
      if (this._timingEl) { this._timingEl.classList.remove('judgement--in'); this._timingEl.classList.add('judgement--out'); const r = this._timingEl; setTimeout(() => r.remove(), 250); this._timingEl = null; }
    }, duration);
  }

  showMiss() {
    if (this._currentEl) this._currentEl.remove();
    if (this._deltaEl) this._deltaEl.remove();
    const el = document.createElement('div');
    el.className = 'judgement-text judgement--miss judgement--in';
    el.textContent = 'MISS';
    this.container.appendChild(el);
    this._currentEl = el;
    document.body.classList.add('combo-break');
    setTimeout(() => document.body.classList.remove('combo-break'), 300);
    clearTimeout(this._outTimer);
    this._outTimer = setTimeout(() => {
      if (this._currentEl) { this._currentEl.classList.remove('judgement--in'); this._currentEl.classList.add('judgement--out'); const r = this._currentEl; setTimeout(() => r.remove(), 250); this._currentEl = null; }
    }, 400);
  }

  showComboBreak(combo) {
    if (this._comboBreakEl) this._comboBreakEl.remove();
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;left:50%;top:56%;transform:translate(-50%,-50%);font-family:var(--zzz-font);font-weight:900;font-size:28px;color:var(--zzz-red);pointer-events:none;animation:combo-fly 0.5s ease-out forwards;';
    el.textContent = `${combo}x`;
    this.container.appendChild(el);
    this._comboBreakEl = el;
    setTimeout(() => { if (el.parentNode) el.remove(); }, 500);
  }

  showMilestone(combo) {
    if (this._milestoneEl) this._milestoneEl.remove();
    let color = 'var(--zzz-lime)';
    let extra = '';
    if (combo >= 500) { color = 'transparent'; extra = 'background:linear-gradient(90deg,#FF3D3D,#F5C518,#AAFF00,#A855F7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;'; }
    else if (combo >= 200) color = 'var(--zzz-yellow)';
    const el = document.createElement('div');
    el.className = 'milestone-banner';
    el.style.color = color;
    if (extra) el.style.cssText += extra;
    el.textContent = `COMBO x${combo}`;
    document.body.appendChild(el);
    this._milestoneEl = el;
    setTimeout(() => { el.classList.add('out'); setTimeout(() => { if (el.parentNode) el.remove(); this._milestoneEl = null; }, 300); }, 800);
  }

  checkMilestone(combo) { if ([50, 100, 200, 500].includes(combo)) this.showMilestone(combo); }
}
