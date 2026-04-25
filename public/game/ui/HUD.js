import EventBus from '../core/EventBus.js';

/** Format a number with commas (always en-US style: 1,234,567) */
function fmtScore(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export default class HUD {
  constructor(container) {
    this.container = container;
    this.els = {};
    this._hidden = true;
    this._frozen = false;       // true when game is paused — stops all animation
    this._displayScore = 0;
    this._displayCombo = 0;
    this._displayAccuracy = 100;
    this._animFrame = null;
    this._targetScore = 0;
    this._targetCombo = 0;
    this._targetAccuracy = 100;
    this._currentRank = 'X';
    this._rankScale = 1;
    this._comboPopScale = 1;

    // ── Per-digit spin system ──
    this._scoreDigitH = 44;
    this._comboDigitH = 64;
    this._scoreLastStr = '0';
    this._comboLastStr = '0';
    this._scoreAnimating = new Set();   // set of slot indices currently mid-spin
    this._comboAnimating = new Set();

    this._build();
  }

  _build() {
    this.container.innerHTML = `
      <div id="hud-inner" style="position:relative;width:100%;height:100%;pointer-events:none;display:none;">

        <!-- ── LEFT: Score + Accuracy ── -->
        <div style="position:absolute;left:5%;top:55%;transform:translateY(-50%);text-align:right;">
          <!-- Score label -->
          <div style="font-family:var(--zzz-font);font-weight:500;font-size:10px;color:rgba(170,255,0,0.45);letter-spacing:0.25em;text-transform:uppercase;margin-bottom:2px;text-shadow:0 0 8px rgba(0,0,0,0.9);">SCORE</div>
          <!-- Score digit row (filled dynamically) -->
          <div id="hud-score" style="display:flex;justify-content:flex-end;align-items:center;gap:0;font-family:var(--zzz-font);font-weight:900;font-size:44px;color:var(--zzz-lime);line-height:1;text-shadow:0 0 30px rgba(170,255,0,0.25),0 2px 12px rgba(0,0,0,0.95),-1px -1px 0 rgba(0,0,0,0.8),1px -1px 0 rgba(0,0,0,0.8),-1px 1px 0 rgba(0,0,0,0.8),1px 1px 0 rgba(0,0,0,0.8);"></div>
          <!-- Separator line -->
          <div style="width:60px;height:1px;background:linear-gradient(to right,transparent,rgba(170,255,0,0.3));margin:8px auto 8px 0;"></div>
          <!-- Accuracy label -->
          <div style="font-family:var(--zzz-font);font-weight:500;font-size:9px;color:rgba(255,255,255,0.35);letter-spacing:0.2em;text-transform:uppercase;margin-bottom:1px;text-shadow:0 0 8px rgba(0,0,0,0.9);">ACCURACY</div>
          <!-- Accuracy value -->
          <div id="hud-accuracy" style="font-family:var(--zzz-mono);font-weight:600;font-size:18px;color:rgba(255,255,255,0.7);font-variant-numeric:tabular-nums;letter-spacing:0.04em;text-shadow:0 0 8px rgba(0,0,0,0.9),-1px -1px 0 rgba(0,0,0,0.7),1px -1px 0 rgba(0,0,0,0.7),-1px 1px 0 rgba(0,0,0,0.7),1px 1px 0 rgba(0,0,0,0.7);">100.00%</div>
        </div>

        <!-- ── RIGHT: Combo + Rank ── -->
        <div style="position:absolute;right:5%;top:55%;transform:translateY(-50%);text-align:left;">
          <!-- Combo value -->
          <div style="display:flex;align-items:baseline;gap:8px;">
            <div id="hud-combo" style="display:flex;align-items:center;gap:0;font-family:var(--zzz-font);font-weight:900;font-size:64px;color:#ffffff;line-height:1;letter-spacing:-0.02em;text-shadow:0 0 40px rgba(255,255,255,0.12),0 4px 16px rgba(0,0,0,0.95),-2px -2px 0 rgba(0,0,0,0.7),2px -2px 0 rgba(0,0,0,0.7),-2px 2px 0 rgba(0,0,0,0.7),2px 2px 0 rgba(0,0,0,0.7);transition:transform 0.1s cubic-bezier(0.2,0,0,1);"></div>
            <div style="font-family:var(--zzz-font);font-weight:700;font-size:16px;color:rgba(255,255,255,0.5);letter-spacing:0.05em;text-shadow:0 2px 8px rgba(0,0,0,0.9);">x</div>
            <div id="hud-rank" class="grade-gradient grade-gradient--sm" data-rank="X" style="font-family:var(--zzz-font);font-weight:900;font-size:36px;opacity:1;transform:scale(1) rotate(-25deg);transition:all 0.25s cubic-bezier(0.2,0,0,1);line-height:1;margin-left:4px;"></div>
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

    // Initialize digit rows with "0"
    this._rebuildDigitRow(this.els.score, '0', this._scoreDigitH, this._scoreAnimating);
    this._rebuildDigitRow(this.els.combo, '0', this._comboDigitH, this._comboAnimating);

    this._startAnimLoop();
  }

  /* ═══════════════════════════════════════════════════════════════════
     PER-DIGIT SLOT MACHINE SPIN SYSTEM
     Each digit has its own overflow:hidden container.
     When a digit changes, a two-frame slide-up animation plays:
       Frame 1: old digit visible (translateY: 0)
       Frame 2: wrapper slides up → old exits top, new enters from below
     Commas are thin non-animated separators.
     ═══════════════════════════════════════════════════════════════════ */

  /**
   * Rebuild an entire digit row from scratch (used when string length
   * or comma positions change, e.g. 999 → 1,000).
   */
  _rebuildDigitRow(container, str, digitH, animatingSet) {
    container.innerHTML = '';
    for (const ch of str) {
      const slot = document.createElement('div');
      slot.style.cssText = `height:${digitH}px;display:flex;align-items:center;justify-content:center;overflow:hidden;`;
      if (ch === ',') {
        slot.style.width = (digitH * 0.32) + 'px';
        slot.style.opacity = '0.45';
        slot.textContent = ',';
      } else {
        slot.style.width = (digitH * 0.62) + 'px';
        slot.textContent = ch;
        slot.dataset.digit = ch;
      }
      container.appendChild(slot);
    }
    animatingSet.clear();
  }

  /**
   * Render a formatted number string into per-digit slots.
   * Compares with the previous string and spins only changed digits.
   * If the string length changes (structural change), rebuilds entirely.
   */
  _renderDigitRow(container, newStr, digitH, lastStrRef, animatingSet) {
    if (!container) return;
    if (lastStrRef.str === newStr) return;
    const oldStr = lastStrRef.str || '';

    // Structural change: different character count → full rebuild with fade
    if (oldStr.length !== newStr.length) {
      container.style.transition = 'opacity 0.08s ease-out';
      container.style.opacity = '0.4';
      this._rebuildDigitRow(container, newStr, digitH, animatingSet);
      lastStrRef.str = newStr;
      requestAnimationFrame(() => {
        container.style.opacity = '1';
        setTimeout(() => { container.style.transition = ''; }, 120);
      });
      return;
    }

    lastStrRef.str = newStr;

    // Same length: compare character by character, spin changed digits
    for (let i = 0; i < newStr.length; i++) {
      const oldCh = oldStr[i];
      const newCh = newStr[i];
      if (oldCh === newCh) continue;

      const slot = container.children[i];
      if (!slot) continue;

      // Comma → just update text (no animation)
      if (newCh === ',' || oldCh === ',') {
        slot.textContent = newCh;
        if (newCh === ',') {
          slot.dataset.digit = '';
          slot.style.width = (digitH * 0.32) + 'px';
          slot.style.opacity = '0.45';
        } else {
          slot.dataset.digit = newCh;
          slot.style.width = (digitH * 0.62) + 'px';
          slot.style.opacity = '1';
        }
        continue;
      }

      // Digit changed → slot-machine spin
      this._spinDigitSlot(slot, oldCh, newCh, digitH, animatingSet, i);
    }
  }

  /**
   * Animate a single digit slot: old digit slides up and out,
   * new digit slides up from below into view.
   */
  _spinDigitSlot(slot, oldDigit, newDigit, digitH, animatingSet, index) {
    // If this slot is already mid-spin, snap to new value
    if (animatingSet.has(index)) {
      animatingSet.delete(index);
      slot.textContent = newDigit;
      slot.dataset.digit = newDigit;
      return;
    }

    animatingSet.add(index);
    slot.dataset.digit = newDigit;

    // Build two-frame wrapper
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;width:100%;';

    const topFace = document.createElement('div');
    topFace.style.cssText = `height:${digitH}px;display:flex;align-items:center;justify-content:center;`;
    topFace.textContent = oldDigit;

    const botFace = document.createElement('div');
    botFace.style.cssText = `height:${digitH}px;display:flex;align-items:center;justify-content:center;`;
    botFace.textContent = newDigit;

    wrapper.appendChild(topFace);
    wrapper.appendChild(botFace);

    // Replace slot content
    slot.innerHTML = '';
    slot.appendChild(wrapper);

    // Trigger slide-up animation on next frame
    requestAnimationFrame(() => {
      wrapper.style.transition = 'transform 0.22s cubic-bezier(0.22,1,0.36,1)';
      wrapper.style.transform = `translateY(-${digitH}px)`;
    });

    // Cleanup after animation completes
    setTimeout(() => {
      if (slot.contains(wrapper)) {
        slot.innerHTML = '';
        slot.textContent = newDigit;
      }
      animatingSet.delete(index);
    }, 260);
  }

  /* ═══════════════════════════════════════════════════════════════════ */

  /** Freeze all number animations (called on pause) */
  freeze() {
    this._frozen = true;
  }

  /** Unfreeze number animations (called on resume) */
  unfreeze() {
    this._frozen = false;
  }

  _startAnimLoop() {
    const tick = () => {
      this._animateNumbers();
      this._animFrame = requestAnimationFrame(tick);
    };
    tick();
  }

  _animateNumbers() {
    // When frozen (paused), don't animate anything
    if (this._frozen) return;

    // Score — interpolate towards target, format with commas
    const scoreDiff = this._targetScore - this._displayScore;
    if (Math.abs(scoreDiff) > 1) {
      this._displayScore += scoreDiff * 0.2;
    } else if (scoreDiff !== 0) {
      this._displayScore = this._targetScore;
    }
    const scoreStr = fmtScore(this._displayScore);
    this._renderDigitRow(this.els.score, scoreStr, this._scoreDigitH,
      { str: this._scoreLastStr, set: v => this._scoreLastStr = v },
      this._scoreAnimating);
    this._scoreLastStr = scoreStr;

    // Combo — interpolate towards target, no commas
    const comboDiff = this._targetCombo - this._displayCombo;
    if (Math.abs(comboDiff) > 1) {
      this._displayCombo += comboDiff * 0.35;
    } else if (comboDiff !== 0) {
      this._displayCombo = this._targetCombo;
    }
    const comboStr = `${Math.round(this._displayCombo)}`;
    this._renderDigitRow(this.els.combo, comboStr, this._comboDigitH,
      { str: this._comboLastStr, set: v => this._comboLastStr = v },
      this._comboAnimating);
    this._comboLastStr = comboStr;

    // Decay combo pop scale
    if (this._comboPopScale > 1.001) {
      this._comboPopScale += (1 - this._comboPopScale) * 0.15;
      if (this.els.combo) this.els.combo.style.transform = `scale(${this._comboPopScale})`;
    } else if (this._comboPopScale !== 1) {
      this._comboPopScale = 1;
      if (this.els.combo) this.els.combo.style.transform = '';
    }

    // Rank scale decay
    if (this._rankScale > 1.01) {
      this._rankScale += (1 - this._rankScale) * 0.12;
      if (this.els.rank) this.els.rank.style.transform = `scale(${this._rankScale}) rotate(-25deg)`;
    } else if (this._rankScale !== 1) {
      this._rankScale = 1;
      if (this.els.rank) this.els.rank.style.transform = 'rotate(-25deg)';
    }

    // Accuracy — smooth interpolation
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
    if (this._frozen) return; // Don't accept score changes while frozen
    this._targetScore = n;
  }

  setCombo(n) {
    if (this._frozen) return; // Don't accept combo changes while frozen
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

  setHealth(n) {
    // HP bar rendered on canvas
  }

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
  }
}
