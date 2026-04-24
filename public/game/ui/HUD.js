import EventBus from '../core/EventBus.js';

export default class HUD {
  constructor(container) {
    this.container = container;
    this.els = {};
    this._hidden = true;
    // Animated number tracking
    this._displayScore = 0;
    this._displayCombo = 0;
    this._displayAccuracy = 100;
    this._animFrame = null;
    this._targetScore = 0;
    this._targetCombo = 0;
    this._targetAccuracy = 100;
    this._build();
  }

  _build() {
    this.container.innerHTML = `
      <div id="hud-inner" style="position:relative;width:100%;height:100%;pointer-events:none;display:none;">
        <!-- Score — LEFT side of playfield -->
        <div style="position:absolute;left:5%;top:50%;transform:translateY(-50%);text-align:right;min-width:120px;">
          <div class="zzz-label" style="margin-bottom:6px;text-align:right;">SCORE</div>
          <div id="hud-score" class="zzz-value" style="font-size:36px;color:var(--zzz-lime);font-variant-numeric:tabular-nums;transition:transform 0.1s;">0</div>
          <div style="margin-top:12px;">
            <div class="zzz-label" style="text-align:right;">ACCURACY</div>
            <div id="hud-accuracy" class="zzz-value" style="font-size:20px;font-variant-numeric:tabular-nums;text-align:right;">100.00%</div>
          </div>
        </div>

        <!-- Combo — RIGHT side of playfield -->
        <div style="position:absolute;right:5%;top:50%;transform:translateY(-50%);text-align:left;min-width:100px;">
          <div id="hud-combo" class="zzz-title" style="font-size:64px;color:#ffffff;transition:all 0.12s;font-variant-numeric:tabular-nums;line-height:1;text-shadow:0 0 20px rgba(255,255,255,0.3);"></div>
          <div id="hud-combo-label" class="zzz-label" style="display:none;text-align:left;margin-top:4px;">COMBO</div>
        </div>

        <!-- Health bar — bottom center -->
        <div style="position:absolute;bottom:24px;left:50%;transform:translateX(-50%);width:50%;">
          <div class="zzz-label" style="margin-bottom:6px;">HEALTH</div>
          <div class="health-bar"><div id="hud-health-fill" class="health-bar-fill" style="width:100%;"></div></div>
        </div>

        <!-- Progress — top edge -->
        <div style="position:absolute;top:0;left:0;right:0;height:3px;background:rgba(255,255,255,0.03);">
          <div id="hud-progress" style="height:100%;width:0%;background:var(--zzz-lime);transition:width 0.5s linear;border-radius:0 2px 2px 0;"></div>
        </div>

        <!-- Pause button -->
        <button id="hud-pause" class="zzz-btn zzz-btn--sm" style="position:absolute;top:16px;right:16px;pointer-events:all;">PAUSE</button>
      </div>
    `;
    this.els = {
      inner: document.getElementById('hud-inner'),
      score: document.getElementById('hud-score'),
      combo: document.getElementById('hud-combo'),
      comboLabel: document.getElementById('hud-combo-label'),
      accuracy: document.getElementById('hud-accuracy'),
      health: document.getElementById('hud-health-fill'),
      progress: document.getElementById('hud-progress'),
      pause: document.getElementById('hud-pause'),
    };
    this.els.pause.addEventListener('click', () => EventBus.emit('game:pause', {}));
    this._startAnimLoop();
  }

  _startAnimLoop() {
    const tick = () => {
      this._animateNumbers();
      this._animFrame = requestAnimationFrame(tick);
    };
    tick();
  }

  _animateNumbers() {
    // Smooth score counting
    const scoreDiff = this._targetScore - this._displayScore;
    if (Math.abs(scoreDiff) > 1) {
      this._displayScore += scoreDiff * 0.2;
      if (this.els.score) this.els.score.textContent = Math.round(this._displayScore).toLocaleString();
    } else if (scoreDiff !== 0) {
      this._displayScore = this._targetScore;
      if (this.els.score) this.els.score.textContent = this._targetScore.toLocaleString();
    }

    // Smooth combo counting
    const comboDiff = this._targetCombo - this._displayCombo;
    if (Math.abs(comboDiff) > 1) {
      this._displayCombo += comboDiff * 0.35;
      if (this.els.combo) {
        const showCombo = Math.round(this._displayCombo);
        if (showCombo > 1) {
          this.els.combo.textContent = `${showCombo}x`;
        }
      }
    } else if (comboDiff !== 0) {
      this._displayCombo = this._targetCombo;
      if (this.els.combo) {
        if (this._targetCombo > 1) {
          this.els.combo.textContent = `${this._targetCombo}x`;
        } else {
          this.els.combo.textContent = '';
        }
      }
    }

    // Smooth accuracy
    const accDiff = this._targetAccuracy - this._displayAccuracy;
    if (Math.abs(accDiff) > 0.01) {
      this._displayAccuracy += accDiff * 0.2;
      if (this.els.accuracy) this.els.accuracy.textContent = this._displayAccuracy.toFixed(2) + '%';
    }
  }

  show() { this._hidden = false; this.els.inner.style.display = 'block'; }
  hide() { this._hidden = true; this.els.inner.style.display = 'none'; }

  setScore(n) {
    this._targetScore = n;
    // Pop animation on score change
    if (this.els.score) {
      this.els.score.style.transform = 'scale(1.08)';
      setTimeout(() => { if (this.els.score) this.els.score.style.transform = ''; }, 100);
    }
  }

  setCombo(n) {
    this._targetCombo = n;
    if (n > 1) {
      if (this.els.combo) { this.els.combo.style.opacity = '1'; }
      this.els.comboLabel.style.display = 'block';
    } else {
      if (this.els.combo) { this.els.combo.style.opacity = '0.3'; }
      this.els.comboLabel.style.display = 'none';
    }
    // Milestone scale
    if ([50, 100, 200, 500].includes(n)) {
      this.els.combo.style.transform = 'scale(1.3)';
      this.els.combo.style.color = '#ffffff';
      this.els.combo.style.textShadow = '0 0 40px rgba(255,255,255,0.6)';
      setTimeout(() => { this.els.combo.style.transform = ''; this.els.combo.style.color = '#ffffff'; this.els.combo.style.textShadow = '0 0 20px rgba(255,255,255,0.3)'; }, 250);
    }
  }

  setAccuracy(n) {
    this._targetAccuracy = n;
  }

  setHealth(n) {
    this.els.health.style.width = Math.max(0, Math.min(100, n)) + '%';
    if (n < 25) {
      this.els.health.style.background = 'linear-gradient(90deg, var(--zzz-red), #ff6b6b)';
      this.els.health.style.boxShadow = '0 0 8px var(--zzz-red)';
    } else {
      this.els.health.style.background = 'linear-gradient(90deg, var(--zzz-lime), #CCFF66)';
      this.els.health.style.boxShadow = '0 0 12px rgba(170,255,0,0.5)';
    }
  }

  setProgress(ratio) { this.els.progress.style.width = (ratio * 100) + '%'; }

  update(stats) {
    if (this._hidden) return;
    this.setScore(stats.score);
    this.setCombo(stats.combo);
    this.setAccuracy(stats.accuracy);
    this.setHealth(stats.health || 100);
  }

  destroy() {
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
  }
}
