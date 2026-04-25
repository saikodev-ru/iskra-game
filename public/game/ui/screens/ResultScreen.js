import RecordStore from '../../game/RecordStore.js';

const GRADE_GRADIENTS = {
  X:  { bg: 'linear-gradient(180deg, #FFD700 0%, #FFA500 100%)', glow: 'rgba(255,215,0,0.5)', stroke: 'rgba(0,0,0,0.8)', bgSolid: '#FFA500' },
  S:  { bg: 'linear-gradient(180deg, #FDE68A 0%, #F97316 100%)', glow: 'rgba(253,230,138,0.4)', stroke: 'rgba(0,0,0,0.75)', bgSolid: '#F97316' },
  A:  { bg: 'linear-gradient(180deg, #86EFAC 0%, #22D3EE 100%)', glow: 'rgba(134,239,172,0.35)', stroke: 'rgba(0,0,0,0.75)', bgSolid: '#22D3EE' },
  B:  { bg: 'linear-gradient(180deg, #60A5FA 0%, #A855F7 100%)', glow: 'rgba(96,165,250,0.35)', stroke: 'rgba(0,0,0,0.75)', bgSolid: '#A855F7' },
  C:  { bg: 'linear-gradient(180deg, #C4B5FD 0%, #991B1B 100%)', glow: 'rgba(196,181,253,0.3)', stroke: 'rgba(0,0,0,0.8)', bgSolid: '#991B1B' },
  D:  { bg: 'linear-gradient(180deg, #EF4444 0%, #7F1D1D 100%)', glow: 'rgba(239,68,68,0.35)', stroke: 'rgba(0,0,0,0.85)', bgSolid: '#EF4444' },
};

const RANK_ORDER = ['X', 'S', 'A', 'B', 'C', 'D'];

const JUDGE_CARDS = [
  { key: 'perfect', label: 'PERFECT', color: '#AAFF00' },
  { key: 'great',   label: 'GREAT',   color: '#00E5FF' },
  { key: 'good',    label: 'GOOD',    color: '#F5C518' },
  { key: 'bad',     label: 'BAD',     color: '#FF8C00' },
  { key: 'miss',    label: 'MISS',    color: '#FF3D3D' },
];

export default class ResultScreen {
  constructor({ screens }) {
    this.screens = screens;
    this._stats = null;
    this._lastMap = null;
    this._keyHandler = null;
    // History viewer state
    this._viewingHistory = false;
    this._historySetId = null;
    this._historyDiffVersion = null;
    this._historyRecords = [];
    this._historyScrollContainer = null;
  }

  /**
   * Setup for viewing a historical record (called from SongSelect)
   */
  setupHistory(setId, diffVersion, record, map) {
    this._viewingHistory = true;
    this._historySetId = setId;
    this._historyDiffVersion = diffVersion;
    this._lastMap = map || {};
    this._stats = {
      score: record.score,
      accuracy: record.accuracy,
      maxCombo: record.maxCombo,
      rank: record.rank,
      sliderBreaks: record.sliderBreaks || 0,
      died: !!record.died,
      hitCounts: record.hitCounts || {},
      totalNotes: record.totalNotes || 0,
      _timestamp: record.timestamp,
    };
    // Load all records for this difficulty
    this._historyRecords = RecordStore.getAll(setId, diffVersion);
  }

  build() {
    const s = this._stats || { score: 0, accuracy: 100, maxCombo: 0, rank: 'D', sliderBreaks: 0, died: false, hitCounts: { perfect: 0, great: 0, good: 0, bad: 0, miss: 0 }, totalNotes: 0 };
    const map = this._lastMap || {};
    const meta = map.metadata || {};
    const grade = GRADE_GRADIENTS[s.rank] || GRADE_GRADIENTS.D;
    const isDeath = !!s.died;
    const isHistory = this._viewingHistory;

    const songTitle = meta.title || 'Unknown';
    const songArtist = meta.artist || '';
    const songDiff = meta.version || meta.difficulty || '';
    const total = s.totalNotes || Math.max(1, Object.values(s.hitCounts).reduce((a, b) => a + b, 0));

    // Rank cards
    const rankCardsHTML = RANK_ORDER.map((rank, idx) => {
      const rg = GRADE_GRADIENTS[rank];
      const isActive = rank === s.rank;
      return `
        <div class="rc-rank-card ${isActive ? 'rc-rank-card--active' : ''}"
             style="--rc-rank-bg: ${rg.bg}; --rc-rank-glow: ${rg.glow}; --rc-rank-solid: ${rg.bgSolid}; --rc-rank-delay: ${idx * 0.07}s;">
          <div class="rc-rank-card-letter grade-gradient" style="--gg-grad: ${rg.bg}; --gg-stroke: ${isActive ? '3px rgba(0,0,0,0.6)' : '2px rgba(0,0,0,0.4)'};">
            ${rank}<span class="gg-fill">${rank}</span>
          </div>
        </div>
      `;
    }).join('');

    // Judgment cards
    const judgeCardsHTML = JUDGE_CARDS.map((jc, idx) => {
      const count = s.hitCounts[jc.key] || 0;
      const pct = (count / total * 100).toFixed(1);
      const barWidth = count > 0 ? Math.max(4, (count / total) * 100) : 0;
      return `
        <div class="rc-judge-card" style="--rc-jc-color: ${jc.color}; --rc-jc-delay: ${idx * 0.08}s;">
          <div class="rc-judge-card-label">${jc.label}</div>
          <div class="rc-judge-card-value">${count}</div>
          <div class="rc-judge-card-pct">${pct}%</div>
          <div class="rc-judge-card-bar-track">
            <div class="rc-judge-card-bar-fill" data-width="${barWidth}"></div>
          </div>
        </div>
      `;
    }).join('');

    const deathHeader = isDeath ? `<div class="rc-death-label">FAILED</div>` : '';

    // Timestamp display
    const timestampStr = s._timestamp ? RecordStore.formatTimestamp(s._timestamp) : '';
    const timestampHtml = timestampStr ? `<div class="rc-timestamp">${timestampStr}</div>` : '';

    return `
      <div class="result-screen ${isDeath ? 'result-screen--death' : ''} ${isHistory ? 'result-screen--history' : ''}">

        <!-- Song info -->
        <div class="result-song-info">
          ${deathHeader}
          <div class="result-song-title">${songTitle}</div>
          ${songArtist ? `<div class="result-song-artist">${songArtist}</div>` : ''}
          ${songDiff ? `<div class="result-song-diff">${songDiff}</div>` : ''}
        </div>

        <!-- Horizontal rank cards (X → D) -->
        <div class="rc-rank-cards">
          ${rankCardsHTML}
        </div>

        <!-- Score + Accuracy row -->
        <div class="result-main-stats">
          <div class="result-score-panel ${isDeath ? 'result-score-panel--death' : ''}">
            <div class="result-score-label">SCORE</div>
            <div class="result-score-value">${s.score.toLocaleString()}</div>
          </div>
          <div class="result-score-panel ${isDeath ? 'result-score-panel--death' : ''}">
            <div class="result-score-label">ACCURACY</div>
            <div class="result-score-value" style="color:${isDeath ? '#FF3D3D' : 'var(--zzz-lime)'}; font-size:32px;">${s.accuracy.toFixed(2)}%</div>
          </div>
        </div>

        <!-- Combo + Notes row -->
        <div class="result-secondary-stats">
          <div class="result-stat-pill">
            <div class="result-stat-pill-label">MAX COMBO</div>
            <div class="result-stat-pill-value" style="color:var(--zzz-yellow);">${s.maxCombo}<span style="font-size:12px;opacity:0.6;">x</span></div>
          </div>
          <div class="result-stat-pill">
            <div class="result-stat-pill-label">NOTES</div>
            <div class="result-stat-pill-value">${total}</div>
          </div>
          ${s.sliderBreaks > 0 ? `
            <div class="result-stat-pill">
              <div class="result-stat-pill-label">SLIDER BREAKS</div>
              <div class="result-stat-pill-value" style="color:#FF8C00;">${s.sliderBreaks}</div>
            </div>
          ` : ''}
        </div>

        <!-- Judgment cards -->
        <div class="rc-judge-cards">
          ${judgeCardsHTML}
        </div>

        ${timestampHtml}

        <!-- Buttons -->
        <div class="result-buttons">
          ${isHistory ? `
            <button class="result-btn result-btn--danger" data-action="delete-record">🗑 DELETE</button>
            <button class="result-btn result-btn--menu" data-action="back">← BACK</button>
          ` : `
            <button class="result-btn result-btn--retry" data-action="retry">↻ RETRY</button>
            <button class="result-btn result-btn--menu" data-action="menu">MENU</button>
          `}
        </div>
      </div>
    `;
  }

  init(data) {
    if (data && data.stats && !this._viewingHistory) this._stats = data.stats;
    if (data && data.map && !this._viewingHistory) this._lastMap = data.map;

    // Animate judgment card bars
    requestAnimationFrame(() => {
      setTimeout(() => {
        document.querySelectorAll('.rc-judge-card-bar-fill[data-width]').forEach(bar => {
          const w = bar.dataset.width;
          if (w) bar.style.width = w + '%';
        });
      }, 500);
    });

    document.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.action;
        if (action === 'retry' && this._lastMap) this.screens.show('game', { map: this._lastMap });
        else if (action === 'menu') this.screens.show('song-select');
        else if (action === 'back') this.screens.show('song-select');
        else if (action === 'delete-record') this._deleteCurrentRecord();
      });
    });

    this._keyHandler = (e) => {
      if (this._viewingHistory) {
        if (e.code === 'Escape' || e.code === 'Enter') this.screens.show('song-select');
      } else {
        if (e.code === 'Enter') this.screens.show('song-select');
        else if (e.code === 'Escape') this.screens.show('main-menu');
      }
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  _deleteCurrentRecord() {
    if (!this._historySetId || !this._historyDiffVersion || !this._stats?._timestamp) return;
    const ts = this._stats._timestamp;
    RecordStore.delete(this._historySetId, this._historyDiffVersion, ts);
    // Emit event so SongSelect can refresh
    EventBus.emit('records:changed', {
      setId: this._historySetId,
      diffVersion: this._historyDiffVersion,
    });
    this.screens.show('song-select');
  }

  setStats(stats, map) { this._stats = stats; this._lastMap = map; }
  destroy() { if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler); }
}
