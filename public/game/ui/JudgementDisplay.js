import EventBus from '../core/EventBus.js';

export default class JudgementDisplay {
  constructor(container) {
    this.container = container;
    this._currentEl = null;
    this._deltaEl = null;
    this._comboBreakEl = null;
    this._milestoneEl = null;
    this._outTimer = null;
    this._setupListeners();
  }

  _setupListeners() {
    EventBus.on('note:hit', ({ judgement, delta }) => this.show(judgement, delta));
    EventBus.on('note:miss', () => this.showMiss());
    EventBus.on('combo:break', ({ combo }) => this.showComboBreak(combo));
  }

  show(judgement, delta) {
    if (this._currentEl) this._currentEl.remove();
    if (this._deltaEl) this._deltaEl.remove();
    const el = document.createElement('div');
    el.className = `judgement-text judgement--${judgement} judgement--in`;
    el.textContent = judgement.toUpperCase();
    this.container.appendChild(el);
    this._currentEl = el;
    if ((judgement === 'good' || judgement === 'bad') && delta !== undefined) {
      const deltaEl = document.createElement('div');
      deltaEl.className = 'delta-display judgement--in';
      deltaEl.textContent = `${delta >= 0 ? '+' : ''}${delta}ms`;
      this.container.appendChild(deltaEl);
      this._deltaEl = deltaEl;
    }
    clearTimeout(this._outTimer);
    const duration = judgement === 'perfect' ? 600 : judgement === 'great' ? 500 : 350;
    this._outTimer = setTimeout(() => {
      if (this._currentEl) { this._currentEl.classList.remove('judgement--in'); this._currentEl.classList.add('judgement--out'); const r = this._currentEl; setTimeout(() => r.remove(), 250); this._currentEl = null; }
      if (this._deltaEl) { this._deltaEl.classList.remove('judgement--in'); this._deltaEl.classList.add('judgement--out'); const r = this._deltaEl; setTimeout(() => r.remove(), 250); this._deltaEl = null; }
    }, duration);
  }

  showMiss() {
    if (this._currentEl) this._currentEl.remove();
    if (this._deltaEl) this._deltaEl.remove();
    const el = document.createElement('div');
    el.className = 'combo-break-x';
    el.textContent = '✕';
    this.container.appendChild(el);
    this._currentEl = el;
    document.body.classList.add('combo-break');
    setTimeout(() => document.body.classList.remove('combo-break'), 300);
    clearTimeout(this._outTimer);
    this._outTimer = setTimeout(() => { if (el.parentNode) el.remove(); }, 500);
  }

  showComboBreak(combo) {
    if (this._comboBreakEl) this._comboBreakEl.remove();
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;right:8%;top:48%;transform:translateY(-50%);font-family:var(--zzz-font);font-weight:900;font-size:28px;color:var(--zzz-red);pointer-events:none;animation:combo-fly 0.5s ease-out forwards;';
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
