import EventBus from '../../core/EventBus.js';
import RecordStore from '../../game/RecordStore.js';
import TransitionFX from '../../game/TransitionFX.js';

const GRADE_GRADIENTS = {
  X:  { bg: 'linear-gradient(180deg, #FFD700 0%, #FFA500 100%)', glow: 'rgba(255,215,0,0.5)', stroke: 'rgba(0,0,0,0.8)', bgSolid: '#FFA500' },
  S:  { bg: 'linear-gradient(180deg, #FDE68A 0%, #F97316 100%)', glow: 'rgba(253,230,138,0.4)', stroke: 'rgba(0,0,0,0.75)', bgSolid: '#F97316' },
  A:  { bg: 'linear-gradient(180deg, #86EFAC 0%, #22D3EE 100%)', glow: 'rgba(134,239,172,0.35)', stroke: 'rgba(0,0,0,0.75)', bgSolid: '#22D3EE' },
  B:  { bg: 'linear-gradient(180deg, #60A5FA 0%, #A855F7 100%)', glow: 'rgba(96,165,250,0.35)', stroke: 'rgba(0,0,0,0.75)', bgSolid: '#A855F7' },
  C:  { bg: 'linear-gradient(180deg, #C4B5FD 0%, #991B1B 100%)', glow: 'rgba(196,181,253,0.3)', stroke: 'rgba(0,0,0,0.8)', bgSolid: '#991B1B' },
  D:  { bg: 'linear-gradient(180deg, #EF4444 0%, #7F1D1D 100%)', glow: 'rgba(239,68,68,0.35)', stroke: 'rgba(0,0,0,0.85)', bgSolid: '#EF4444' },
};

const JUDGE_ITEMS = [
  { key: 'perfect', label: 'MAX', color: '#FDA4AF' },
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
    this._viewingHistory = false;
    this._historySetId = null;
    this._historyDiffVersion = null;
    this._historyRecords = [];
    this._activeRecordTs = null;
  }

  setupHistory(setId, diffVersion, record, map) {
    this._viewingHistory = true;
    this._historySetId = setId;
    this._historyDiffVersion = diffVersion;
    this._lastMap = map || {};
    this._activeRecordTs = record.timestamp;
    this._historyRecords = RecordStore.getAll(setId, diffVersion);
  }

  _buildResultCard(rec, idx, isActive) {
    const grade = GRADE_GRADIENTS[rec.rank] || GRADE_GRADIENTS.D;
    const isDeath = !!rec.died;
    const total = rec.totalNotes || Math.max(1, Object.values(rec.hitCounts || {}).reduce((a, b) => a + b, 0));
    const hc = rec.hitCounts || {};
    const ts = rec.timestamp || 0;
    const timeStr = RecordStore.formatTimestamp(ts);

    // Judgment rows with animated percentage bars
    const judgeRows = JUDGE_ITEMS.map(jc => {
      const count = hc[jc.key] || 0;
      const pct = total > 0 ? (count / total * 100) : 0;
      return `
        <div class="rs-judge-row">
          <div class="rs-judge-label" style="color:${jc.color};">${jc.label}</div>
          <div class="rs-judge-bar-track">
            <div class="rs-judge-bar-fill" style="background:${jc.color};" data-width="${pct.toFixed(1)}"></div>
          </div>
          <div class="rs-judge-count" style="color:${jc.color};">${count}</div>
          <div class="rs-judge-pct">${pct.toFixed(1)}%</div>
        </div>
      `;
    }).join('');

    return `
      <div class="rs-card ${isActive ? 'rs-card--active' : ''}" data-record-ts="${ts}"
           style="--rs-grade-bg:${grade.bg}; --rs-grade-glow:${grade.glow}; --rs-grade-solid:${grade.bgSolid}; --rs-delay:${idx * 0.08}s;">
        <div class="rs-card-glow"></div>

        <!-- Rank + Death + Time -->
        <div class="rs-card-top">
          <div class="rs-card-rank grade-gradient" style="--gg-grad:${grade.bg}; --gg-stroke:2.5px rgba(0,0,0,0.7);">
            ${rec.rank}<span class="gg-fill">${rec.rank}</span>
          </div>
          ${isDeath ? '<div class="rs-card-death-badge">FAILED</div>' : ''}
          <div class="rs-card-time">${timeStr}</div>
        </div>

        <!-- Score + Accuracy -->
        <div class="rs-card-score">${rec.score.toLocaleString()}</div>
        <div class="rs-card-acc" style="color:${isDeath ? '#FF3D3D' : 'var(--zzz-lime)'};">${rec.accuracy.toFixed(2)}%</div>

        <!-- Stat pills -->
        <div class="rs-card-stats">
          <div class="rs-card-pill">
            <div class="rs-card-pill-val" style="color:var(--zzz-yellow);">${rec.maxCombo}<span class="rs-card-pill-x">x</span></div>
            <div class="rs-card-pill-label">MAX COMBO</div>
          </div>
          <div class="rs-card-pill">
            <div class="rs-card-pill-val">${total}</div>
            <div class="rs-card-pill-label">NOTES</div>
          </div>
          ${rec.sliderBreaks > 0 ? `
            <div class="rs-card-pill">
              <div class="rs-card-pill-val" style="color:#FF8C00;">${rec.sliderBreaks}</div>
              <div class="rs-card-pill-label">BREAKS</div>
            </div>
          ` : ''}
        </div>

        <!-- Judgment breakdown -->
        <div class="rs-card-judges">
          ${judgeRows}
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

    let records = [];
    if (isHistory) {
      records = this._historyRecords;
    } else if (this._stats) {
      const setId = meta.setId;
      const diffVer = meta.version || '';
      // RecordStore.add() was already called in main.js before showing this screen,
      // so historyRecs already includes the just-saved play. No need to prepend a duplicate.
      records = (setId && diffVer) ? RecordStore.getAll(setId, diffVer) : [];
      this._historyRecords = records;
      this._historySetId = setId;
      this._historyDiffVersion = diffVer;
      // Highlight the latest record (the one we just played)
      this._activeRecordTs = records.length > 0 ? records[0].timestamp : 0;
    }

    const activeTs = this._activeRecordTs;
    const activeRec = records.find(r => r.timestamp === activeTs);
    const isDeath = activeRec && activeRec.died;

    const cardsHtml = records.map((rec, idx) => {
      const isActive = rec.timestamp === activeTs;
      return this._buildResultCard(rec, idx, isActive);
    }).join('');

    return `
      <div class="result-screen result-screen--carousel ${isDeath ? 'result-screen--death' : ''}">

        <!-- Song info -->
        <div class="result-song-info">
          ${isDeath ? '<div class="rc-death-label">FAILED</div>' : ''}
          <div class="result-song-title">${songTitle}</div>
          ${songArtist ? `<div class="result-song-artist">${songArtist}</div>` : ''}
          ${songDiff ? `<div class="result-song-diff">${songDiff}</div>` : ''}
          <div class="rs-plays-count">${records.length} PLAY${records.length !== 1 ? 'S' : ''}</div>
        </div>

        ${records.length > 1 ? '<div class="rs-scroll-hint">⟵ SCROLL ⟶</div>' : ''}

        <!-- Carousel -->
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

    // Animate judgment bars
    requestAnimationFrame(() => {
      setTimeout(() => {
        document.querySelectorAll('.rs-judge-bar-fill[data-width]').forEach(bar => {
          bar.style.width = bar.dataset.width + '%';
        });
      }, 500);
    });

    // Auto-scroll to active card and center it
    requestAnimationFrame(() => {
      setTimeout(() => {
        const activeCard = document.querySelector('.rs-card--active');
        const carousel = document.getElementById('rs-carousel');
        if (activeCard && carousel) {
          const scrollLeft = activeCard.offsetLeft - (carousel.clientWidth / 2) + (activeCard.offsetWidth / 2);
          carousel.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'smooth' });
        }
      }, 350);
    });

    // Card click
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
      btn.addEventListener('click', async (e) => {
        const action = e.currentTarget.dataset.action;
        if (action === 'retry' && this._lastMap) {
          await TransitionFX.play({ duration: 600 });
          this.screens.show('game', { map: this._lastMap });
        }
        else if (action === 'menu') { await TransitionFX.play({ duration: 600 }); this.screens.show('song-select'); }
        else if (action === 'back') { await TransitionFX.play({ duration: 600 }); this.screens.show('song-select'); }
        else if (action === 'delete-record') this._deleteCurrentRecord();
      });
    });

    this._keyHandler = (e) => {
      if (this._viewingHistory) {
        if (e.code === 'Escape' || e.code === 'Enter') { TransitionFX.play({ duration: 600 }); this.screens.show('song-select'); }
        else if (e.code === 'ArrowLeft') this._navigateCard(-1);
        else if (e.code === 'ArrowRight') this._navigateCard(1);
      } else {
        if (e.code === 'Enter') { TransitionFX.play({ duration: 600 }); this.screens.show('song-select'); }
        else if (e.code === 'Escape') { TransitionFX.play({ duration: 600 }); this.screens.show('main-menu'); }
        else if (e.code === 'ArrowLeft') this._navigateCard(-1);
        else if (e.code === 'ArrowRight') this._navigateCard(1);
      }
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  _selectCard(ts, carousel) {
    this._activeRecordTs = ts;
    document.querySelectorAll('.rs-card').forEach(c => {
      const cardTs = parseInt(c.dataset.recordTs);
      if (cardTs === ts) {
        c.classList.add('rs-card--active');
        if (carousel) {
          const scrollLeft = c.offsetLeft - (carousel.clientWidth / 2) + (c.offsetWidth / 2);
          carousel.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'smooth' });
        }
        const screen = c.closest('.result-screen');
        const rec = this._historyRecords.find(r => r.timestamp === ts);
        if (screen && rec) screen.classList.toggle('result-screen--death', !!rec.died);
      } else {
        c.classList.remove('rs-card--active');
      }
    });
  }

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
    this._historyRecords = RecordStore.getAll(this._historySetId, this._historyDiffVersion);
    if (this._historyRecords.length === 0) {
      this.screens.show('song-select');
    } else {
      this._activeRecordTs = this._historyRecords[0].timestamp;
      this.screens.container.innerHTML = this.build();
      this.init({});
    }
  }

  setStats(stats, map) { this._stats = stats; this._lastMap = map; }
  destroy() { if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler); }
}
