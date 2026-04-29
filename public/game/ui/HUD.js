import EventBus from '../core/EventBus.js';

/** Format a number with commas (en-US: 1,234,567) */
function fmtScore(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export default class HUD {
  constructor(container) {
    this.container = container;
    this.els = {};
    this._hidden = true;
    this._frozen = false;
    this._displayScore = 0;
    this._displayCombo = 0;
    this._displayAccuracy = 100;
    this._animFrame = null;
    this._targetScore = 0;
    this._targetCombo = 0;
    this._targetAccuracy = 100;
    this._currentRank = 'X';
    this._rankScale = 1;

    // ── Text-based animation state ──
    this._scoreLastStr = '0';
    this._comboLastStr = '0';
    this._scoreAnimT = 0;   // timestamp of last score animation trigger
    this._comboAnimT = 0;

    this._injectCSS();
    this._build();
  }

  /* ═══════════════════════════════════════════════════════════════════
     CSS KEYFRAME ANIMATIONS
     Score: vertical slide-up with perspective rotation (like a flip counter)
     Combo: quick scale pop on change
     ═══════════════════════════════════════════════════════════════════ */
  _injectCSS() {
    if (document.getElementById('hud-anim-css')) return;
    const style = document.createElement('style');
    style.id = 'hud-anim-css';
    style.textContent = `
      /* Score: 3D flip-down slide into view */
      @keyframes hud-score-flip {
        0%   { transform: translateY(-60%) rotateX(-70deg); opacity: 0.15; filter: blur(2px); }
        60%  { opacity: 0.85; filter: blur(0.5px); }
        100% { transform: translateY(0) rotateX(0deg); opacity: 1; filter: blur(0); }
      }
      /* Combo: sharp pop with slight overshoot */
      @keyframes hud-combo-pop {
        0%   { transform: scale(1.18) translateY(-3px); opacity: 0.7; }
        50%  { transform: scale(1.04) translateY(0); }
        100% { transform: scale(1) translateY(0); opacity: 1; }
      }
      /* Combo milestone: bigger pop */
      @keyframes hud-combo-milestone {
        0%   { transform: scale(1.4) translateY(-6px); opacity: 0.6; }
        40%  { transform: scale(0.96) translateY(1px); }
        100% { transform: scale(1) translateY(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  _build() {
    this.container.innerHTML = `
      <div id="hud-inner" style="position:relative;width:100%;height:100%;pointer-events:none;display:none;">

        <!-- ── 3D Perspective Plane — wraps score & combo with shared tilt ── -->
        <div id="hud-perspective-plane" style="position:absolute;inset:0;perspective:800px;perspective-origin:50% 35%;">

          <!-- ── LEFT: Score + Accuracy ── -->
          <div style="position:absolute;left:5%;top:55%;transform:translateY(-50%) rotateX(28deg);transform-origin:50% 100%;transform-style:preserve-3d;text-align:right;">
            <div style="font-family:var(--zzz-font);font-weight:500;font-size:10px;color:rgba(170,255,0,0.45);letter-spacing:0.25em;text-transform:uppercase;margin-bottom:2px;text-shadow:0 0 8px rgba(0,0,0,0.9);">SCORE</div>
            <div id="hud-score" style="font-family:var(--zzz-font);font-weight:900;font-size:44px;color:var(--zzz-lime);font-variant-numeric:tabular-nums;line-height:1;letter-spacing:0.02em;text-shadow:0 0 30px rgba(170,255,0,0.25),0 2px 12px rgba(0,0,0,0.95),-1px -1px 0 rgba(0,0,0,0.8),1px -1px 0 rgba(0,0,0,0.8),-1px 1px 0 rgba(0,0,0,0.8),1px 1px 0 rgba(0,0,0,0.8);transform-style:preserve-3d;">0</div>
            <div style="width:60px;height:1px;background:linear-gradient(to right,transparent,rgba(170,255,0,0.3));margin:8px auto 8px 0;"></div>
            <div style="font-family:var(--zzz-font);font-weight:500;font-size:9px;color:rgba(255,255,255,0.35);letter-spacing:0.2em;text-transform:uppercase;margin-bottom:1px;text-shadow:0 0 8px rgba(0,0,0,0.9);">ACCURACY</div>
            <div id="hud-accuracy" style="font-family:var(--zzz-mono);font-weight:600;font-size:18px;color:rgba(255,255,255,0.7);font-variant-numeric:tabular-nums;letter-spacing:0.04em;text-shadow:0 0 8px rgba(0,0,0,0.9),-1px -1px 0 rgba(0,0,0,0.7),1px -1px 0 rgba(0,0,0,0.7),-1px 1px 0 rgba(0,0,0,0.7),1px 1px 0 rgba(0,0,0,0.7);">100.00%</div>
          </div>

          <!-- ── RIGHT: Combo + Rank ── -->
          <div style="position:absolute;right:5%;top:55%;transform:translateY(-50%) rotateX(28deg);transform-origin:50% 100%;transform-style:preserve-3d;text-align:left;">
            <div style="display:flex;align-items:baseline;gap:8px;">
              <div id="hud-combo" style="font-family:var(--zzz-font);font-weight:900;font-size:64px;color:#ffffff;font-variant-numeric:tabular-nums;line-height:1;letter-spacing:-0.02em;text-shadow:0 0 40px rgba(255,255,255,0.12),0 4px 16px rgba(0,0,0,0.95),-2px -2px 0 rgba(0,0,0,0.7),2px -2px 0 rgba(0,0,0,0.7),-2px 2px 0 rgba(0,0,0,0.7),2px 2px 0 rgba(0,0,0,0.7);transform-style:preserve-3d;">0</div>
              <div style="font-family:var(--zzz-font);font-weight:700;font-size:16px;color:rgba(255,255,255,0.5);letter-spacing:0.05em;text-shadow:0 2px 8px rgba(0,0,0,0.9);">x</div>
              <div id="hud-rank" class="grade-gradient grade-gradient--sm" data-rank="X" style="font-family:var(--zzz-font);font-weight:900;font-size:36px;opacity:1;transform:scale(1) rotate(-25deg);transition:all 0.25s cubic-bezier(0.2,0,0,1);line-height:1;margin-left:4px;"></div>
            </div>
            <div style="font-family:var(--zzz-font);font-weight:500;font-size:9px;color:rgba(255,255,255,0.3);letter-spacing:0.2em;text-transform:uppercase;margin-top:4px;text-shadow:0 0 8px rgba(0,0,0,0.9);">COMBO</div>
          </div>

        </div><!-- /hud-perspective-plane -->

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

    // Initialize X rank display
    if (this.els.rank) {
      this.els.rank.textContent = 'X';
      this.els.rank.dataset.rank = 'X';
      this.els.rank.style.setProperty('--gg-grad', 'linear-gradient(180deg, #FFD700, #FFA500)');
      this.els.rank.style.setProperty('--gg-stroke', '1px rgba(0,0,0,0.5)');
      const fill = document.createElement('span');
      fill.className = 'gg-fill';
      fill.textContent = 'X';
      this.els.rank.appendChild(fill);
    }

    this._startAnimLoop();
  }

  /* ═══════════════════════════════════════════════════════════════════
     ANIMATION HELPERS
     Trigger CSS keyframe animations by re-assigning the class.
     A short cooldown prevents re-triggering while animation is running.
     ═══════════════════════════════════════════════════════════════════ */

  /** Trigger a score flip animation on the score element */
  _triggerScoreFlip() {
    const el = this.els.score;
    if (!el) return;
    const now = performance.now();
    if (now - this._scoreAnimT < 160) return; // cooldown: don't re-trigger mid-animation
    this._scoreAnimT = now;
    // Re-trigger by removing + re-adding the animation (avoid forced reflow)
    el.style.animation = 'none';
    // Use double-rAF instead of offsetHeight to avoid layout thrashing
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.animation = 'hud-score-flip 0.2s cubic-bezier(0.22,1,0.36,1) forwards';
      });
    });
  }

  /** Trigger a combo pop animation. `milestone` = bigger pop for 50/100/200/500 */
  _triggerComboPop(milestone = false) {
    const el = this.els.combo;
    if (!el) return;
    const now = performance.now();
    if (now - this._comboAnimT < 120) return;
    this._comboAnimT = now;
    el.style.animation = 'none';
    // Use double-rAF instead of offsetHeight to avoid layout thrashing
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.animation = milestone
          ? 'hud-combo-milestone 0.3s cubic-bezier(0.22,1,0.36,1) forwards'
          : 'hud-combo-pop 0.18s cubic-bezier(0.22,1,0.36,1) forwards';
      });
    });
  }

  /** Clean up all running CSS animations */
  _clearAnimations() {
    if (this.els.score) this.els.score.style.animation = '';
    if (this.els.combo) this.els.combo.style.animation = '';
  }

  /* ═══════════════════════════════════════════════════════════════════ */

  freeze() { this._frozen = true; }
  unfreeze() { this._frozen = false; }

  _startAnimLoop() {
    const tick = () => {
      if (!this._hidden) this._animateNumbers();
      this._animFrame = requestAnimationFrame(tick);
    };
    tick();
  }

  _animateNumbers() {
    if (this._frozen) return;

    const now = performance.now();

    /* ── Score ──
     * Fast interpolation (lerp 0.35) so the displayed number catches up
     * in ~10 frames (~170ms).  Snap when the diff is small. */
    const scoreDiff = this._targetScore - this._displayScore;
    if (Math.abs(scoreDiff) > 5) {
      this._displayScore += scoreDiff * 0.35;
    } else if (Math.abs(scoreDiff) > 0.5) {
      this._displayScore += scoreDiff * 0.5;
    } else if (scoreDiff !== 0) {
      this._displayScore = this._targetScore;
    }
    const scoreStr = fmtScore(this._displayScore);
    if (scoreStr !== this._scoreLastStr) {
      this._scoreLastStr = scoreStr;
      this.els.score.textContent = scoreStr;
      this._triggerScoreFlip();
    }

    /* ── Combo ──
     * Instant snap — no interpolation. Pop animation on change. */
    const comboStr = `${this._targetCombo}`;
    if (comboStr !== this._comboLastStr) {
      this._comboLastStr = comboStr;
      this._displayCombo = this._targetCombo;
      this.els.combo.textContent = comboStr;
      const milestone = [50, 100, 200, 500].includes(this._targetCombo);
      this._triggerComboPop(milestone);
    }

    /* ── Rank scale decay ── */
    if (this._rankScale > 1.01) {
      this._rankScale += (1 - this._rankScale) * 0.12;
      if (this.els.rank) this.els.rank.style.transform = `scale(${this._rankScale}) rotate(-25deg)`;
    } else if (this._rankScale !== 1) {
      this._rankScale = 1;
      if (this.els.rank) this.els.rank.style.transform = 'rotate(-25deg)';
    }

    /* ── Accuracy ── */
    const accDiff = this._targetAccuracy - this._displayAccuracy;
    if (Math.abs(accDiff) > 0.01) {
      this._displayAccuracy += accDiff * 0.15;
      if (this.els.accuracy) this.els.accuracy.textContent = this._displayAccuracy.toFixed(2) + '%';
    }
  }

  show() {
    this._hidden = false;
    this._frozen = false;
    this.els.inner.style.display = 'block';
  }
  hide() {
    this._hidden = true;
    this._frozen = true;
    this.els.inner.style.display = 'none';
  }

  setScore(n) {
    if (this._frozen) return;
    this._targetScore = n;
  }

  setCombo(n) {
    if (this._frozen) return;
    this._targetCombo = n;
  }

  setRank(rank) {
    if (!rank || rank === this._currentRank) return;
    this._currentRank = rank;
    const rankStyles = {
      X:  { bg: 'linear-gradient(180deg, #FFD700, #FFA500)' },
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
      this.els.rank.style.transform = 'scale(1.5) rotate(-25deg)';
      this._rankScale = 1.5;
    }
  }

  setAccuracy(n) {
    if (this._frozen) return;
    this._targetAccuracy = n;
  }

  setHealth(n) { /* HP bar rendered on canvas */ }
  setProgress(ratio) { this.els.progress.style.width = (ratio * 100) + '%'; }

  update(stats) {
    if (this._hidden || this._frozen) return;
    this.setScore(stats.score);
    this.setCombo(stats.combo);
    this.setAccuracy(stats.accuracy);
    this.setRank(stats.rank);
    this.setHealth(stats.health || 100);
  }

  destroy() {
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
    this._clearAnimations();
  }
}
