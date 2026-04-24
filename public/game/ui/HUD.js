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

        <!-- ── LEFT: Score + Accuracy ── -->
        <div style="position:absolute;left:3%;top:44%;transform:translateY(-50%);text-align:right;">
          <!-- Score label -->
          <div style="font-family:var(--zzz-font);font-weight:500;font-size:10px;color:rgba(170,255,0,0.45);letter-spacing:0.25em;text-transform:uppercase;margin-bottom:2px;text-shadow:0 0 8px rgba(0,0,0,0.9);">SCORE</div>
          <!-- Score value -->
          <div id="hud-score" style="font-family:var(--zzz-font);font-weight:900;font-size:38px;color:var(--zzz-lime);font-variant-numeric:tabular-nums;line-height:1;letter-spacing:0.02em;text-shadow:0 0 30px rgba(170,255,0,0.25),0 2px 12px rgba(0,0,0,0.95),-1px -1px 0 rgba(0,0,0,0.8),1px -1px 0 rgba(0,0,0,0.8),-1px 1px 0 rgba(0,0,0,0.8),1px 1px 0 rgba(0,0,0,0.8);transition:transform 0.08s;">0</div>
          <!-- Separator line -->
          <div style="width:60px;height:1px;background:linear-gradient(to right,transparent,rgba(170,255,0,0.3));margin:8px auto 8px 0;"></div>
          <!-- Accuracy label -->
          <div style="font-family:var(--zzz-font);font-weight:500;font-size:9px;color:rgba(255,255,255,0.35);letter-spacing:0.2em;text-transform:uppercase;margin-bottom:1px;text-shadow:0 0 8px rgba(0,0,0,0.9);">ACCURACY</div>
          <!-- Accuracy value -->
          <div id="hud-accuracy" style="font-family:var(--zzz-mono);font-weight:600;font-size:16px;color:rgba(255,255,255,0.7);font-variant-numeric:tabular-nums;letter-spacing:0.04em;text-shadow:0 0 8px rgba(0,0,0,0.9),-1px -1px 0 rgba(0,0,0,0.7),1px -1px 0 rgba(0,0,0,0.7),-1px 1px 0 rgba(0,0,0,0.7),1px 1px 0 rgba(0,0,0,0.7);">100.00%</div>
        </div>

        <!-- ── RIGHT: Combo + Rank ── -->
        <div style="position:absolute;right:5%;top:44%;transform:translateY(-50%);text-align:left;">
          <!-- Combo value -->
          <div style="display:flex;align-items:baseline;gap:8px;">
            <div id="hud-combo" style="font-family:var(--zzz-font);font-weight:900;font-size:56px;color:#ffffff;font-variant-numeric:tabular-nums;line-height:1;letter-spacing:-0.02em;text-shadow:0 0 40px rgba(255,255,255,0.12),0 4px 16px rgba(0,0,0,0.95),-2px -2px 0 rgba(0,0,0,0.7),2px -2px 0 rgba(0,0,0,0.7),-2px 2px 0 rgba(0,0,0,0.7),2px 2px 0 rgba(0,0,0,0.7);transition:transform 0.1s cubic-bezier(0.2,0,0,1);">0</div>
            <div style="font-family:var(--zzz-font);font-weight:700;font-size:16px;color:rgba(255,255,255,0.5);letter-spacing:0.05em;text-shadow:0 2px 8px rgba(0,0,0,0.9);">x</div>
            <div id="hud-rank" class="grade-gradient grade-gradient--sm" data-rank="" style="font-family:var(--zzz-font);font-weight:900;font-size:30px;opacity:0;transform:scale(0.5);transition:all 0.25s cubic-bezier(0.2,0,0,1);line-height:1;margin-left:4px;"></div>
          </div>
          <!-- Combo label -->
          <div style="font-family:var(--zzz-font);font-weight:500;font-size:9px;color:rgba(255,255,255,0.3);letter-spacing:0.2em;text-transform:uppercase;margin-top:4px;text-shadow:0 0 8px rgba(0,0,0,0.9);">COMBO</div>
        </div>

        <!-- ── Progress bar — top edge ── -->
        <div style="position:absolute;top:0;left:0;right:0;height:3px;background:rgba(255,255,255,0.04);">
          <div id="hud-progress" style="height:100%;width:0%;background:linear-gradient(90deg,rgba(170,255,0,0.6),rgba(170,255,0,0.9));box-shadow:0 0 10px rgba(170,255,0,0.35),0 0 20px rgba(170,255,0,0.15);transition:width 0.3s linear;border-radius:0 2px 2px 0;"></div>
        </div>

        <!-- ── Pause button ── -->
        <button id="hud-pause" class="zzz-btn zzz-btn--sm" style="position:absolute;top:16px;right:16px;pointer-events:all;font-size:11px;padding:6px 14px;opacity:0.5;transition:opacity 0.2s;">⏸</button>
      </div>
    `;
    this.els = {
      inner: document.getElementById('hud-inner'),
      score: document.getElementById('hud-score'),
      combo: document.getElementById('hud-combo'),
      rank: document.getElementById('hud-rank'),
      accuracy: document.getElementById('hud-accuracy'),
      health: null,
      progress: document.getElementById('hud-progress'),
      pause: document.getElementById('hud-pause'),
    };
    this.els.pause.addEventListener('click', () => EventBus.emit('game:pause', {}));
    this.els.pause.addEventListener('mouseenter', () => { this.els.pause.style.opacity = '1'; });
    this.els.pause.addEventListener('mouseleave', () => { this.els.pause.style.opacity = '0.5'; });
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
        this.els.combo.textContent = `${Math.round(this._displayCombo)}`;
      }
    } else if (comboDiff !== 0) {
      this._displayCombo = this._targetCombo;
      if (this.els.combo) {
        this.els.combo.textContent = `${this._targetCombo}`;
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
      this._comboPopScale = 1.15;
    }
    if ([50, 100, 200, 500].includes(n)) {
      this._comboPopScale = 1.35;
    }
  }

  setRank(rank) {
    if (!rank || rank === this._currentRank) return;
    this._currentRank = rank;
    const rankStyles = {
      SS: { bg: 'linear-gradient(180deg, #67E8F9, #FDA4AF)' },
      S:  { bg: 'linear-gradient(180deg, #FDE68A, #F97316)' },
      A:  { bg: 'linear-gradient(180deg, #86EFAC, #22D3EE)' },
      B:  { bg: 'linear-gradient(180deg, #60A5FA, #A855F7)' },
      C:  { bg: 'linear-gradient(180deg, #C4B5FD, #991B1B)' },
      D:  { bg: 'linear-gradient(180deg, #EF4444, #7F1D1D)' },
    };
    if (this.els.rank) {
      const style = rankStyles[rank] || rankStyles.D;
      this.els.rank.textContent = rank;
      this.els.rank.dataset.rank = rank;
      this.els.rank.style.setProperty('--gg-grad', style.bg);
      this.els.rank.style.setProperty('--gg-stroke', '1px rgba(0,0,0,0.5)');
      let fill = this.els.rank.querySelector('.gg-fill');
      if (!fill) {
        fill = document.createElement('span');
        fill.className = 'gg-fill';
        this.els.rank.appendChild(fill);
      }
      fill.textContent = rank;
      this.els.rank.style.opacity = '1';
      this._rankScale = 1.5;
    }
  }

  setAccuracy(n) {
    this._targetAccuracy = n;
  }

  setHealth(n) {
    // HP bar rendered on canvas
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
