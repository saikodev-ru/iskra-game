import EventBus from '../core/EventBus.js';

export default class JudgementDisplay {
  constructor(container) {
    this.container = container;
    this._currentEl = null;
    this._deltaEl = null;
    this._comboBreakEl = null;
    this._milestoneEl = null;
    this._comboMilestones = [50, 100, 200, 500];
    
    this._setupListeners();
  }

  _setupListeners() {
    EventBus.on('note:hit', ({ judgement, delta }) => this.show(judgement, delta));
    EventBus.on('note:miss', () => this.showMiss());
    EventBus.on('combo:break', ({ combo }) => this.showComboBreak(combo));
  }

  show(judgement, delta) {
    // Remove existing judgement
    if (this._currentEl) {
      this._currentEl.remove();
    }
    if (this._deltaEl) {
      this._deltaEl.remove();
    }
    
    // Create judgement text
    const el = document.createElement('div');
    el.className = `judgement-text judgement--${judgement} judgement--in`;
    el.textContent = judgement.toUpperCase();
    this.container.appendChild(el);
    this._currentEl = el;
    
    // Show delta for bad/good
    if ((judgement === 'good' || judgement === 'bad') && delta !== undefined) {
      const deltaEl = document.createElement('div');
      deltaEl.className = 'delta-display judgement--in';
      const sign = delta >= 0 ? '+' : '';
      deltaEl.textContent = `${sign}${delta}ms`;
      this.container.appendChild(deltaEl);
      this._deltaEl = deltaEl;
    }
    
    // Animate out after a delay
    clearTimeout(this._outTimer);
    this._outTimer = setTimeout(() => {
      if (this._currentEl) {
        this._currentEl.classList.remove('judgement--in');
        this._currentEl.classList.add('judgement--out');
        const toRemove = this._currentEl;
        setTimeout(() => toRemove.remove(), 200);
        this._currentEl = null;
      }
      if (this._deltaEl) {
        this._deltaEl.classList.remove('judgement--in');
        this._deltaEl.classList.add('judgement--out');
        const toRemove = this._deltaEl;
        setTimeout(() => toRemove.remove(), 200);
        this._deltaEl = null;
      }
    }, judgement === 'perfect' ? 500 : judgement === 'great' ? 400 : 300);
  }

  showMiss() {
    // Show red ✕
    if (this._currentEl) {
      this._currentEl.remove();
    }
    if (this._deltaEl) {
      this._deltaEl.remove();
    }
    
    const el = document.createElement('div');
    el.className = 'combo-break-x';
    el.textContent = '✕';
    this.container.appendChild(el);
    this._currentEl = el;
    
    // Red vignette on body
    document.body.classList.add('combo-break');
    setTimeout(() => document.body.classList.remove('combo-break'), 300);
    
    clearTimeout(this._outTimer);
    this._outTimer = setTimeout(() => {
      if (el.parentNode) el.remove();
    }, 400);
  }

  showComboBreak(combo) {
    // Show combo number flying up and fading
    if (this._comboBreakEl) {
      this._comboBreakEl.remove();
    }
    
    const el = document.createElement('div');
    el.style.cssText = `
      position: absolute;
      left: 50%; top: 60%;
      transform: translate(-50%, -50%);
      font-family: var(--zzz-font);
      font-weight: 900;
      font-size: 24px;
      color: var(--zzz-red);
      pointer-events: none;
      animation: combo-fly 0.5s ease-out forwards;
    `;
    el.textContent = `${combo}x`;
    this.container.appendChild(el);
    this._comboBreakEl = el;
    
    setTimeout(() => {
      if (el.parentNode) el.remove();
    }, 500);
  }

  showMilestone(combo) {
    // Remove existing milestone
    if (this._milestoneEl) {
      this._milestoneEl.remove();
    }
    
    let color = 'var(--zzz-cyan)';
    let bgGradient = '';
    if (combo >= 500) {
      color = 'transparent';
      bgGradient = 'background: linear-gradient(90deg, #FF3D3D, #F5C518, #00E5FF, #A855F7); -webkit-background-clip: text; -webkit-text-fill-color: transparent;';
    } else if (combo >= 200) {
      color = 'var(--zzz-yellow)';
    } else if (combo >= 100) {
      color = 'var(--zzz-cyan)';
    }
    
    const el = document.createElement('div');
    el.className = 'milestone-banner';
    el.style.color = color;
    if (bgGradient) el.style.cssText += bgGradient;
    el.textContent = `COMBO x${combo}`;
    document.body.appendChild(el);
    this._milestoneEl = el;
    
    // Hold for 800ms then exit
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => {
        if (el.parentNode) el.remove();
        this._milestoneEl = null;
      }, 300);
    }, 800);
  }

  checkMilestone(combo) {
    if (this._comboMilestones.includes(combo)) {
      this.showMilestone(combo);
    }
  }
}
