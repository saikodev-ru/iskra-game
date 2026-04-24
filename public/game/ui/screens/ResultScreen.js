const GRADE_GRADIENTS = {
  SS: { bg: 'linear-gradient(180deg, #67E8F9 0%, #FDA4AF 100%)', glow: 'rgba(103,232,249,0.4)', stroke: 'rgba(0,0,0,0.8)' },
  S:  { bg: 'linear-gradient(180deg, #FDE68A 0%, #F97316 100%)', glow: 'rgba(253,230,138,0.4)', stroke: 'rgba(0,0,0,0.75)' },
  A:  { bg: 'linear-gradient(180deg, #86EFAC 0%, #22D3EE 100%)', glow: 'rgba(134,239,172,0.35)', stroke: 'rgba(0,0,0,0.75)' },
  B:  { bg: 'linear-gradient(180deg, #60A5FA 0%, #A855F7 100%)', glow: 'rgba(96,165,250,0.35)', stroke: 'rgba(0,0,0,0.75)' },
  C:  { bg: 'linear-gradient(180deg, #C4B5FD 0%, #991B1B 100%)', glow: 'rgba(196,181,253,0.3)', stroke: 'rgba(0,0,0,0.8)' },
  D:  { bg: 'linear-gradient(180deg, #EF4444 0%, #7F1D1D 100%)', glow: 'rgba(239,68,68,0.35)', stroke: 'rgba(0,0,0,0.85)' },
};

const JUDGE_COLORS = {
  perfect: '#AAFF00',
  great: '#00E5FF',
  good: '#F5C518',
  bad: '#FF8C00',
  miss: '#FF3D3D',
};

export default class ResultScreen {
  constructor({ screens }) { this.screens = screens; this._stats = null; this._lastMap = null; this._keyHandler = null; }

  build() {
    const s = this._stats || { score: 0, accuracy: 100, maxCombo: 0, rank: 'D', hitCounts: { perfect: 0, great: 0, good: 0, bad: 0, miss: 0 } };
    const map = this._lastMap || {};
    const meta = map.metadata || {};
    const grade = GRADE_GRADIENTS[s.rank] || GRADE_GRADIENTS.D;

    // Song info
    const songTitle = meta.title || 'Unknown';
    const songArtist = meta.artist || '';
    const songDiff = meta.version || meta.difficulty || '';

    // Judgment bar percentages
    const total = Math.max(1, Object.values(s.hitCounts).reduce((a, b) => a + b, 0));
    const pPct = (s.hitCounts.perfect / total * 100).toFixed(1);
    const gPct = (s.hitCounts.great / total * 100).toFixed(1);
    const goPct = (s.hitCounts.good / total * 100).toFixed(1);
    const bPct = (s.hitCounts.bad / total * 100).toFixed(1);
    const mPct = (s.hitCounts.miss / total * 100).toFixed(1);

    return `
      <div class="result-screen">

        <!-- Song info -->
        <div class="result-song-info">
          <div class="result-song-title">${songTitle}</div>
          ${songArtist ? `<div style="font-family:var(--zzz-font);font-weight:500;font-size:11px;color:rgba(255,255,255,0.35);letter-spacing:0.04em;margin-top:1px;text-shadow:0 2px 8px rgba(0,0,0,0.8);">${songArtist}</div>` : ''}
          ${songDiff ? `<div class="result-song-diff">${songDiff}</div>` : ''}
        </div>

        <!-- Grade letter -->
        <div class="result-grade"
             data-grade="${s.rank}"
             style="background:${grade.bg};-webkit-text-stroke:4px ${grade.stroke};filter:drop-shadow(0 0 40px ${grade.glow}) drop-shadow(0 0 80px ${grade.glow});">
          ${s.rank}
        </div>

        <!-- Score -->
        <div class="result-score-panel">
          <div class="result-score-label">SCORE</div>
          <div class="result-score-value">${s.score.toLocaleString()}</div>
        </div>

        <!-- Stats grid -->
        <div class="result-stats-grid">
          <div class="result-stat-card">
            <div class="result-stat-label">ACCURACY</div>
            <div class="result-stat-value" style="color:var(--zzz-lime);">${s.accuracy.toFixed(2)}%</div>
          </div>
          <div class="result-stat-card">
            <div class="result-stat-label">MAX COMBO</div>
            <div class="result-stat-value" style="color:var(--zzz-yellow);">${s.maxCombo}<span style="font-size:14px;opacity:0.6;">x</span></div>
          </div>
          <div class="result-stat-card">
            <div class="result-stat-label">NOTES</div>
            <div class="result-stat-value" style="color:var(--zzz-text);">${total}</div>
          </div>
        </div>

        <!-- Judgment breakdown -->
        <div class="result-judge-panel">
          <!-- Stacked bar -->
          <div class="result-judge-bar-track">
            ${s.hitCounts.perfect > 0 ? `<div class="result-judge-bar-seg" data-width="${pPct}" style="width:0%;background:${JUDGE_COLORS.perfect};box-shadow:0 0 6px ${JUDGE_COLORS.perfect};"></div>` : ''}
            ${s.hitCounts.great > 0 ? `<div class="result-judge-bar-seg" data-width="${gPct}" style="width:0%;background:${JUDGE_COLORS.great};box-shadow:0 0 6px ${JUDGE_COLORS.great};"></div>` : ''}
            ${s.hitCounts.good > 0 ? `<div class="result-judge-bar-seg" data-width="${goPct}" style="width:0%;background:${JUDGE_COLORS.good};box-shadow:0 0 6px ${JUDGE_COLORS.good};"></div>` : ''}
            ${s.hitCounts.bad > 0 ? `<div class="result-judge-bar-seg" data-width="${bPct}" style="width:0%;background:${JUDGE_COLORS.bad};box-shadow:0 0 6px ${JUDGE_COLORS.bad};"></div>` : ''}
            ${s.hitCounts.miss > 0 ? `<div class="result-judge-bar-seg" data-width="${mPct}" style="width:0%;background:${JUDGE_COLORS.miss};box-shadow:0 0 6px ${JUDGE_COLORS.miss};"></div>` : ''}
          </div>
          <!-- Count row -->
          <div class="result-judge-row">
            <div class="result-judge-item">
              <div class="result-judge-item-label">PERFECT</div>
              <div class="result-judge-item-value" style="color:${JUDGE_COLORS.perfect};">${s.hitCounts.perfect}</div>
            </div>
            <div class="result-judge-item">
              <div class="result-judge-item-label">GREAT</div>
              <div class="result-judge-item-value" style="color:${JUDGE_COLORS.great};">${s.hitCounts.great}</div>
            </div>
            <div class="result-judge-item">
              <div class="result-judge-item-label">GOOD</div>
              <div class="result-judge-item-value" style="color:${JUDGE_COLORS.good};">${s.hitCounts.good}</div>
            </div>
            <div class="result-judge-item">
              <div class="result-judge-item-label">BAD</div>
              <div class="result-judge-item-value" style="color:${JUDGE_COLORS.bad};">${s.hitCounts.bad}</div>
            </div>
            <div class="result-judge-item">
              <div class="result-judge-item-label">MISS</div>
              <div class="result-judge-item-value" style="color:${JUDGE_COLORS.miss};">${s.hitCounts.miss}</div>
            </div>
          </div>
        </div>

        <!-- Buttons -->
        <div class="result-buttons">
          <button class="result-btn result-btn--retry" data-action="retry">↻ RETRY</button>
          <button class="result-btn result-btn--menu" data-action="menu">MENU</button>
        </div>
      </div>
    `;
  }

  init(data) {
    if (data && data.stats) this._stats = data.stats;
    if (data && data.map) this._lastMap = data.map;

    // Animate judgment bar segments
    requestAnimationFrame(() => {
      setTimeout(() => {
        document.querySelectorAll('.result-judge-bar-seg').forEach(seg => {
          const w = seg.dataset.width;
          if (w) seg.style.width = w + '%';
        });
      }, 400);
    });

    document.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.action;
        if (action === 'retry' && this._lastMap) this.screens.show('game', { map: this._lastMap });
        else if (action === 'menu') this.screens.show('song-select');
      });
    });
    this._keyHandler = (e) => { if (e.code === 'Enter') this.screens.show('song-select'); else if (e.code === 'Escape') this.screens.show('main-menu'); };
    window.addEventListener('keydown', this._keyHandler);
  }

  setStats(stats, map) { this._stats = stats; this._lastMap = map; }
  destroy() { if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler); }
}
