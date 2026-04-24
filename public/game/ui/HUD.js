import EventBus from '../core/EventBus.js';

export default class HUD {
  constructor(container) {
    this.container = container;
    this.els = {};
    this._hidden = true;
    this._displayScore = 0;
    this._displayCombo = 0;
    this._displayAccuracy = 100;
    this._animFrame = null;
    this._targetScore = 0;
    this._targetCombo = 0;
    this._targetAccuracy = 100;
    this._currentRank = '';
    this._rankScale = 1;
    this._comboPopScale = 1;
    this._build();
  }

  _build() {
    this.container.innerHTML = `
      <div id="hud-inner" style="position:relative;width:100%;height:100%;pointer-events:none;display:none;">
        <!-- Score + Accuracy — left side of playfield, vertically centered -->
        <div style="position:absolute;left:4%;top:50%;transform:translateY(-50%);text-align:right;min-width:130px;">
          <div id="hud-score" style="font-family:var(--zzz-font);font-weight:700;font-size:30px;color:var(--zzz-lime);font-variant-numeric:tabular-nums;transition:transform 0.08s;line-height:1;text-shadow:-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,2px 2px 0 #000,0 0 12px rgba(0,0,0,0.9),0 0 24px rgba(0,0,0,0.7),0 4px 8px rgba(0,0,0,0.8);-webkit-text-stroke:1px rgba(0,0,0,0.6);">0</div>
          <div id="hud-accuracy" style="font-family:var(--zzz-mono);font-size:13px;color:var(--zzz-muted);font-variant-numeric:tabular-nums;margin-top:4px;text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000,0 0 8px rgba(0,0,0,0.9);">100.00%</div>
        </div>

        <!-- Combo + Grade — right side, above the HP bar -->
        <div style="position:absolute;right:5%;top:38%;transform:translateY(-50%);text-align:left;">
          <div style="display:flex;align-items:baseline;gap:10px;">
            <div id="hud-combo" style="font-family:var(--zzz-font);font-weight:900;font-size:52px;color:#ffffff;font-variant-numeric:tabular-nums;line-height:1;text-shadow:-3px -3px 0 #000,3px -3px 0 #000,-3px 3px 0 #000,3px 3px 0 #000,0 0 16px rgba(0,0,0,0.9),0 0 32px rgba(0,0,0,0.7),0 6px 12px rgba(0,0,0,0.8);-webkit-text-stroke:1.5px rgba(0,0,0,0.5);transition:transform 0.1s cubic-bezier(0.2,0,0,1);">0x</div>
            <div id="hud-rank" style="font-family:var(--zzz-font);font-weight:900;font-size:28px;color:var(--zzz-lime);text-shadow:-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,2px 2px 0 #000,0 0 16px rgba(170,255,0,0.4),0 0 8px rgba(0,0,0,0.9);-webkit-text-stroke:1px rgba(0,0,0,0.5);opacity:0;transform:scale(0.5);transition:all 0.25s cubic-bezier(0.2,0,0,1);line-height:1;"></div>
          </div>
        </div>

        <!-- Progress — top edge -->
        <div style="position:absolute;top:0;left:0;right:0;height:2px;background:rgba(255,255,255,0.03);">
          <div id="hud-progress" style="height:100%;width:0%;background:var(--zzz-lime);transition:width 0.5s linear;border-radius:0 2px 2px 0;"></div>
        </div>

        <!-- Pause button -->
        <button id="hud-pause" class="zzz-btn zzz-btn--sm" style="position:absolute;top:16px;right:16px;pointer-events:all;font-size:11px;padding:6px 14px;">⏸</button>
      </div>
    `;
    this.els = {
      inner: document.getElementById('hud-inner'),
      score: document.getElementById('hud-score'),
      combo: document.getElementById('hud-combo'),
      rank: document.getElementById('hud-rank'),
      accuracy: document.getElementById('hud-accuracy'),
      health: null, // HP bar now rendered on canvas by NoteRenderer
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
    // Score
    const scoreDiff = this._targetScore - this._displayScore;
    if (Math.abs(scoreDiff) > 1) {
      this._displayScore += scoreDiff * 0.2;
      if (this.els.score) this.els.score.textContent = Math.round(this._displayScore).toLocaleString();
    } else if (scoreDiff !== 0) {
      this._displayScore = this._targetScore;
      if (this.els.score) this.els.score.textContent = this._targetScore.toLocaleString();
    }

    // Combo
    const comboDiff = this._targetCombo - this._displayCombo;
    if (Math.abs(comboDiff) > 1) {
      this._displayCombo += comboDiff * 0.35;
      if (this.els.combo) {
        this.els.combo.textContent = `${Math.round(this._displayCombo)}x`;
      }
    } else if (comboDiff !== 0) {
      this._displayCombo = this._targetCombo;
      if (this.els.combo) {
        this.els.combo.textContent = `${this._targetCombo}x`;
      }
    }

    // Decay combo pop
    if (this._comboPopScale > 1.001) {
      this._comboPopScale += (1 - this._comboPopScale) * 0.15;
      if (this.els.combo) this.els.combo.style.transform = `scale(${this._comboPopScale})`;
    } else if (this._comboPopScale !== 1) {
      this._comboPopScale = 1;
      if (this.els.combo) this.els.combo.style.transform = '';
    }

    // Rank scale
    if (this._rankScale > 1.01) {
      this._rankScale += (1 - this._rankScale) * 0.12;
      if (this.els.rank) this.els.rank.style.transform = `scale(${this._rankScale})`;
    } else if (this._rankScale !== 1) {
      this._rankScale = 1;
      if (this.els.rank) this.els.rank.style.transform = '';
    }

    // Accuracy
    const accDiff = this._targetAccuracy - this._displayAccuracy;
    if (Math.abs(accDiff) > 0.01) {
      this._displayAccuracy += accDiff * 0.15;
      if (this.els.accuracy) this.els.accuracy.textContent = this._displayAccuracy.toFixed(2) + '%';
    }
  }

  show() { this._hidden = false; this.els.inner.style.display = 'block'; }
  hide() { this._hidden = true; this.els.inner.style.display = 'none'; }

  setScore(n) {
    this._targetScore = n;
    if (this.els.score) {
      this.els.score.style.transform = 'scale(1.06)';
      setTimeout(() => { if (this.els.score) this.els.score.style.transform = ''; }, 80);
    }
  }

  setCombo(n) {
    this._targetCombo = n;
    if (n > 0) {
      this._comboPopScale = 1.2;
    }
    if ([50, 100, 200, 500].includes(n)) {
      this._comboPopScale = 1.4;
    }
  }

  setRank(rank) {
    if (!rank || rank === this._currentRank) return;
    this._currentRank = rank;
    const rankColors = {
      SS: '#FFD700', S: '#FFD700', A: '#00E5FF',
      B: '#AAFF00', C: '#F5C518', D: '#FF3D3D'
    };
    if (this.els.rank) {
      this.els.rank.textContent = rank;
      this.els.rank.style.color = rankColors[rank] || 'var(--zzz-lime)';
      this.els.rank.style.opacity = '1';
      this._rankScale = 1.5;
    }
  }

  setAccuracy(n) {
    this._targetAccuracy = n;
  }

  setHealth(n) {
    // HP bar is now rendered on canvas by NoteRenderer
    // This method is kept for API compatibility
  }

  setProgress(ratio) { this.els.progress.style.width = (ratio * 100) + '%'; }

  update(stats) {
    if (this._hidden) return;
    this.setScore(stats.score);
    this.setCombo(stats.combo);
    this.setAccuracy(stats.accuracy);
    this.setRank(stats.rank);
    this.setHealth(stats.health || 100);
  }

  destroy() {
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
  }
}
