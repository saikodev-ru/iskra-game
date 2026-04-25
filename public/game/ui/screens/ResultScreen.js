import EventBus from '../../core/EventBus.js';
import RecordStore from '../../game/RecordStore.js';

const GRADE_GRADIENTS = {
  X:  { bg: 'linear-gradient(180deg, #FFD700 0%, #FFA500 100%)', glow: 'rgba(255,215,0,0.5)', stroke: 'rgba(0,0,0,0.8)', bgSolid: '#FFA500' },
  S:  { bg: 'linear-gradient(180deg, #FDE68A 0%, #F97316 100%)', glow: 'rgba(253,230,138,0.4)', stroke: 'rgba(0,0,0,0.75)', bgSolid: '#F97316' },
  A:  { bg: 'linear-gradient(180deg, #86EFAC 0%, #22D3EE 100%)', glow: 'rgba(134,239,172,0.35)', stroke: 'rgba(0,0,0,0.75)', bgSolid: '#22D3EE' },
  B:  { bg: 'linear-gradient(180deg, #60A5FA 0%, #A855F7 100%)', glow: 'rgba(96,165,250,0.35)', stroke: 'rgba(0,0,0,0.75)', bgSolid: '#A855F7' },
  C:  { bg: 'linear-gradient(180deg, #C4B5FD 0%, #991B1B 100%)', glow: 'rgba(196,181,253,0.3)', stroke: 'rgba(0,0,0,0.8)', bgSolid: '#991B1B' },
  D:  { bg: 'linear-gradient(180deg, #EF4444 0%, #7F1D1D 100%)', glow: 'rgba(239,68,68,0.35)', stroke: 'rgba(0,0,0,0.85)', bgSolid: '#EF4444' },
};

const JUDGE_ITEMS = [
  { key: 'perfect', label: 'PF', color: '#AAFF00' },
  { key: 'great',   label: 'GR', color: '#00E5FF' },
  { key: 'good',    label: 'GD', color: '#F5C518' },
  { key: 'bad',     label: 'BD', color: '#FF8C00' },
  { key: 'miss',    label: 'MS', color: '#FF3D3D' },
];

export default class ResultScreen {
  constructor({ screens }) {
    this.screens = screens;
    this._stats = null;
    this._lastMap = null;
    this._keyHandler = null;
    this._viewingHistory = false;
    this._historySetId = null;
    this._historyDiffVersion = null;
    this._historyRecords = [];
    this._activeRecordTs = null; // timestamp of currently selected/highlighted card
  }

  /**
   * Setup for viewing historical records (called from SongSelect)
   */
  setupHistory(setId, diffVersion, record, map) {
    this._viewingHistory = true;
    this._historySetId = setId;
    this._historyDiffVersion = diffVersion;
    this._lastMap = map || {};
    this._activeRecordTs = record.timestamp;
    this._historyRecords = RecordStore.getAll(setId, diffVersion);
  }

  /** Build a single result card HTML */
  _buildResultCard(rec, idx, isActive) {
    const grade = GRADE_GRADIENTS[rec.rank] || GRADE_GRADIENTS.D;
    const isDeath = !!rec.died;
    const total = rec.totalNotes || Math.max(1, Object.values(rec.hitCounts || {}).reduce((a, b) => a + b, 0));
    const ts = rec.timestamp || 0;

    // Judgment mini bars
    const judgeHtml = JUDGE_ITEMS.map(jc => {
      const count = (rec.hitCounts || {})[jc.key] || 0;
      const pct = total > 0 ? (count / total * 100) : 0;
      const barH = count > 0 ? Math.max(3, pct * 0.36) : 0;
      return `
        <div class="rs-card-judge" title="${jc.label}: ${count}">
          <div class="rs-card-judge-bar" style="height:0;background:${jc.color};--rs-bar-h:${barH}px;" data-h="${barH}"></div>
          <div class="rs-card-judge-label">${jc.label}</div>
          <div class="rs-card-judge-count" style="color:${jc.color};">${count}</div>
        </div>
      `;
    }).join('');

    const timeStr = RecordStore.formatTimestamp(ts);

    return `
      <div class="rs-card ${isActive ? 'rs-card--active' : ''}" data-record-ts="${ts}"
           style="--rs-grade-bg: ${grade.bg}; --rs-grade-glow: ${grade.glow}; --rs-grade-solid: ${grade.bgSolid}; --rs-delay: ${idx * 0.06}s; ${isDeath ? '--rs-death: 1;' : ''}">
        <div class="rs-card-glow"></div>
        <div class="rs-card-header">
          <div class="rs-card-rank grade-gradient" style="--gg-grad: ${grade.bg}; --gg-stroke: 2px rgba(0,0,0,0.7);">
            ${rec.rank}<span class="gg-fill">${rec.rank}</span>
          </div>
          ${isDeath ? '<div class="rs-card-death-badge">FAILED</div>' : ''}
          <div class="rs-card-time">${timeStr}</div>
        </div>
        <div class="rs-card-score">${rec.score.toLocaleString()}</div>
        <div class="rs-card-acc" style="color:${isDeath ? '#FF3D3D' : 'var(--zzz-lime)'};">${rec.accuracy.toFixed(2)}%</div>
        <div class="rs-card-stats-row">
          <div class="rs-card-stat">
            <div class="rs-card-stat-val" style="color:var(--zzz-yellow);">${rec.maxCombo}<span class="rs-card-stat-x">x</span></div>
            <div class="rs-card-stat-label">COMBO</div>
          </div>
          <div class="rs-card-stat">
            <div class="rs-card-stat-val">${total}</div>
            <div class="rs-card-stat-label">NOTES</div>
          </div>
          ${rec.sliderBreaks > 0 ? `
            <div class="rs-card-stat">
              <div class="rs-card-stat-val" style="color:#FF8C00;">${rec.sliderBreaks}</div>
              <div class="rs-card-stat-label">BREAKS</div>
            </div>
          ` : ''}
        </div>
        <div class="rs-card-judges">
          ${judgeHtml}
        </div>
      </div>
    `;
  }

  build() {
    const map = this._lastMap || {};
    const meta = map.metadata || {};
    const isHistory = this._viewingHistory;

    const songTitle = meta.title || 'Unknown';
    const songArtist = meta.artist || '';
    const songDiff = meta.version || meta.difficulty || '';

    // Determine which records to show
    let records = [];
    if (isHistory) {
      records = this._historyRecords;
    } else if (this._stats) {
      // Fresh result: show current play + any history
      const setId = meta.setId;
      const diffVer = meta.version || '';
      const historyRecs = (setId && diffVer) ? RecordStore.getAll(setId, diffVer) : [];
      // Build a pseudo-record from current stats
      const currentRec = {
        score: this._stats.score,
        accuracy: this._stats.accuracy,
        maxCombo: this._stats.maxCombo,
        rank: this._stats.rank,
        sliderBreaks: this._stats.sliderBreaks || 0,
        died: !!this._stats.died,
        hitCounts: this._stats.hitCounts || {},
        totalNotes: this._stats.totalNotes || 0,
        timestamp: Date.now(),
        _isCurrent: true,
      };
      records = [currentRec, ...historyRecs];
      this._historyRecords = records;
      this._historySetId = setId;
      this._historyDiffVersion = diffVer;
      this._activeRecordTs = currentRec.timestamp;
    }

    const activeTs = this._activeRecordTs;

    // Build all cards
    const cardsHtml = records.map((rec, idx) => {
      const isActive = rec.timestamp === activeTs;
      return this._buildResultCard(rec, idx, isActive);
    }).join('');

    const deathLabel = records.length > 0 && records.find(r => r.timestamp === activeTs)?.died
      ? '<div class="rc-death-label">FAILED</div>' : '';

    return `
      <div class="result-screen result-screen--carousel ${records.length > 0 && records.find(r => r.timestamp === activeTs)?.died ? 'result-screen--death' : ''}">

        <!-- Song info header -->
        <div class="result-song-info">
          ${deathLabel}
          <div class="result-song-title">${songTitle}</div>
          ${songArtist ? `<div class="result-song-artist">${songArtist}</div>` : ''}
          ${songDiff ? `<div class="result-song-diff">${songDiff}</div>` : ''}
          <div class="rs-plays-count">${records.length} PLAY${records.length !== 1 ? 'S' : ''}</div>
        </div>

        <!-- Scroll indicator -->
        ${records.length > 1 ? '<div class="rs-scroll-hint">← SCROLL →</div>' : ''}

        <!-- Horizontal carousel of result cards -->
        <div class="rs-carousel" id="rs-carousel">
          ${cardsHtml}
        </div>

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

    // Animate judgment bars in cards
    requestAnimationFrame(() => {
      setTimeout(() => {
        document.querySelectorAll('.rs-card-judge-bar[data-h]').forEach(bar => {
          const h = bar.dataset.h;
          if (h) bar.style.height = h + 'px';
        });
      }, 400);
    });

    // Auto-scroll to active card
    requestAnimationFrame(() => {
      setTimeout(() => {
        const activeCard = document.querySelector('.rs-card--active');
        const carousel = document.getElementById('rs-carousel');
        if (activeCard && carousel) {
          const cardRect = activeCard.getBoundingClientRect();
          const carouselRect = carousel.getBoundingClientRect();
          const scrollLeft = activeCard.offsetLeft - (carouselRect.width / 2) + (cardRect.width / 2);
          carousel.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'smooth' });
        }
      }, 300);
    });

    // Card click → select it (highlight, scroll to)
    const carousel = document.getElementById('rs-carousel');
    if (carousel) {
      carousel.addEventListener('click', (e) => {
        const card = e.target.closest('.rs-card');
        if (!card) return;
        const ts = parseInt(card.dataset.recordTs);
        if (!ts) return;
        this._selectCard(ts, carousel);
      });
    }

    // Buttons
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
        else if (e.code === 'ArrowLeft') this._navigateCard(-1);
        else if (e.code === 'ArrowRight') this._navigateCard(1);
      } else {
        if (e.code === 'Enter') this.screens.show('song-select');
        else if (e.code === 'Escape') this.screens.show('main-menu');
        else if (e.code === 'ArrowLeft') this._navigateCard(-1);
        else if (e.code === 'ArrowRight') this._navigateCard(1);
      }
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  /** Highlight a card by timestamp and scroll it into view */
  _selectCard(ts, carousel) {
    this._activeRecordTs = ts;
    // Update visual state
    document.querySelectorAll('.rs-card').forEach(c => {
      const cardTs = parseInt(c.dataset.recordTs);
      if (cardTs === ts) {
        c.classList.add('rs-card--active');
        // Scroll into view
        if (carousel) {
          const cardRect = c.getBoundingClientRect();
          const carouselRect = carousel.getBoundingClientRect();
          const scrollLeft = c.offsetLeft - (carouselRect.width / 2) + (cardRect.width / 2);
          carousel.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'smooth' });
        }
        // Update death class on screen
        const screen = c.closest('.result-screen');
        const rec = this._historyRecords.find(r => r.timestamp === ts);
        if (screen && rec) {
          screen.classList.toggle('result-screen--death', !!rec.died);
        }
      } else {
        c.classList.remove('rs-card--active');
      }
    });
  }

  /** Navigate left/right through cards */
  _navigateCard(dir) {
    const cards = document.querySelectorAll('.rs-card');
    if (cards.length === 0) return;
    let activeIdx = -1;
    cards.forEach((c, i) => { if (c.classList.contains('rs-card--active')) activeIdx = i; });
    const newIdx = Math.max(0, Math.min(cards.length - 1, activeIdx + dir));
    if (newIdx !== activeIdx) {
      const ts = parseInt(cards[newIdx].dataset.recordTs);
      const carousel = document.getElementById('rs-carousel');
      this._selectCard(ts, carousel);
    }
  }

  _deleteCurrentRecord() {
    if (!this._historySetId || !this._historyDiffVersion || !this._activeRecordTs) return;
    RecordStore.delete(this._historySetId, this._historyDiffVersion, this._activeRecordTs);
    EventBus.emit('records:changed', {
      setId: this._historySetId,
      diffVersion: this._historyDiffVersion,
    });
    // Rebuild records and re-render
    this._historyRecords = RecordStore.getAll(this._historySetId, this._historyDiffVersion);
    if (this._historyRecords.length === 0) {
      // No more records, go back
      this.screens.show('song-select');
    } else {
      // Select the first remaining record
      this._activeRecordTs = this._historyRecords[0].timestamp;
      // Re-render by destroying and re-building
      this.screens.container.innerHTML = this.build();
      this.init({});
    }
  }

  setStats(stats, map) { this._stats = stats; this._lastMap = map; }
  destroy() { if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler); }
}
