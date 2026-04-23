import EventBus from '../core/EventBus.js';

export default class HUD {
  constructor(container) {
    this.container = container;
    this.els = {};
    this._hidden = true;
    
    this._build();
    this._setupListeners();
  }

  _build() {
    this.container.innerHTML = `
      <div id="hud-inner" style="position:relative;width:100%;height:100%;pointer-events:none;display:none;">
        <!-- Top bar: Score + Accuracy -->
        <div style="position:absolute;top:16px;left:50%;transform:translateX(-50%);display:flex;gap:32px;align-items:center;">
          <div style="text-align:center;">
            <div class="zzz-label" style="margin-bottom:4px;">SCORE</div>
            <div id="hud-score" class="zzz-value" style="font-size:28px;color:var(--zzz-cyan);">0</div>
          </div>
          <div style="text-align:center;">
            <div class="zzz-label" style="margin-bottom:4px;">ACCURACY</div>
            <div id="hud-accuracy" class="zzz-value" style="font-size:20px;">100.00%</div>
          </div>
        </div>
        
        <!-- Combo -->
        <div style="position:absolute;left:12%;top:40%;transform:translateY(-50%);text-align:center;">
          <div id="hud-combo" class="zzz-title" style="font-size:48px;color:var(--zzz-text);transition:all 0.1s;"></div>
          <div class="zzz-label" id="hud-combo-label" style="display:none;">COMBO</div>
        </div>
        
        <!-- Health bar (bottom) -->
        <div style="position:absolute;bottom:24px;left:50%;transform:translateX(-50%);width:50%;">
          <div class="zzz-label" style="margin-bottom:4px;">HEALTH</div>
          <div class="health-bar">
            <div id="hud-health-fill" class="health-bar-fill" style="width:100%;"></div>
          </div>
        </div>
        
        <!-- Progress bar -->
        <div style="position:absolute;top:0;left:0;right:0;height:3px;background:rgba(255,255,255,0.05);">
          <div id="hud-progress" style="height:100%;width:0%;background:var(--zzz-cyan);transition:width 0.5s linear;"></div>
        </div>
        
        <!-- Pause button -->
        <button id="hud-pause" class="zzz-btn" style="position:absolute;top:16px;right:16px;padding:6px 16px;font-size:12px;pointer-events:all;">
          PAUSE
        </button>
      </div>
    `;
    
    this.els = {
      inner:    document.getElementById('hud-inner'),
      score:    document.getElementById('hud-score'),
      combo:    document.getElementById('hud-combo'),
      comboLabel: document.getElementById('hud-combo-label'),
      accuracy: document.getElementById('hud-accuracy'),
      health:   document.getElementById('hud-health-fill'),
      progress: document.getElementById('hud-progress'),
      pause:    document.getElementById('hud-pause'),
    };
    
    this.els.pause.addEventListener('click', () => {
      EventBus.emit('game:pause', {});
    });
  }

  _setupListeners() {
    EventBus.on('note:hit', ({ judgement }) => {
      // Update will happen via game loop calling update()
    });
  }

  show() {
    this._hidden = false;
    this.els.inner.style.display = 'block';
  }

  hide() {
    this._hidden = true;
    this.els.inner.style.display = 'none';
  }

  setScore(n) {
    this.els.score.textContent = n.toLocaleString();
  }

  setCombo(n) {
    if (n > 1) {
      this.els.combo.textContent = `${n}x`;
      this.els.combo.style.opacity = '1';
      this.els.comboLabel.style.display = 'block';
    } else {
      this.els.combo.textContent = '';
      this.els.combo.style.opacity = '0.5';
      this.els.comboLabel.style.display = 'none';
    }
    
    // Milestone flash
    if ([50, 100, 200, 500].includes(n)) {
      this.els.combo.classList.add('combo--milestone');
      setTimeout(() => this.els.combo.classList.remove('combo--milestone'), 400);
    }
  }

  setAccuracy(n) {
    this.els.accuracy.textContent = n.toFixed(2) + '%';
  }

  setHealth(n) {
    this.els.health.style.width = Math.max(0, Math.min(100, n)) + '%';
    // Change color based on health
    if (n < 25) {
      this.els.health.style.background = 'linear-gradient(90deg, var(--zzz-red), #ff6b6b)';
      this.els.health.style.boxShadow = '0 0 8px var(--zzz-red)';
    } else {
      this.els.health.style.background = 'linear-gradient(90deg, var(--zzz-cyan), #80f0ff)';
      this.els.health.style.boxShadow = '0 0 8px var(--zzz-cyan)';
    }
  }

  setProgress(ratio) {
    this.els.progress.style.width = (ratio * 100) + '%';
  }

  update(stats) {
    if (this._hidden) return;
    this.setScore(stats.score);
    this.setCombo(stats.combo);
    this.setAccuracy(stats.accuracy);
    this.setHealth(stats.health || 100);
  }
}
