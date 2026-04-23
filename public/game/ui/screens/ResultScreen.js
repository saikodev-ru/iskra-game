import EventBus from '../../core/EventBus.js';

export default class ResultScreen {
  constructor({ screens }) {
    this.screens = screens;
    this._stats = null;
    this._keyHandler = null;
  }

  build() {
    if (!this._stats) {
      this._stats = {
        score: 0,
        accuracy: 100,
        maxCombo: 0,
        rank: 'D',
        hitCounts: { perfect: 0, great: 0, good: 0, bad: 0, miss: 0 }
      };
    }
    
    const s = this._stats;
    const rankColors = { SS: '#FFD700', S: '#FFD700', A: '#00E5FF', B: '#A0FF80', C: '#FF8C00', D: '#FF3D3D' };
    const rankColor = rankColors[s.rank] || '#FF3D3D';
    
    return `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:24px;">
        <!-- Rank -->
        <div style="font-family:var(--zzz-font);font-weight:900;font-size:120px;color:${rankColor};text-shadow:0 0 40px ${rankColor};letter-spacing:0.1em;line-height:1;">
          ${s.rank}
        </div>
        
        <!-- Score -->
        <div class="zzz-panel" style="padding:24px;width:500px;text-align:center;">
          <div class="zzz-label" style="margin-bottom:4px;">SCORE</div>
          <div style="font-family:var(--zzz-mono);font-size:36px;color:var(--zzz-cyan);">${s.score.toLocaleString()}</div>
        </div>
        
        <!-- Stats grid -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;width:500px;">
          <div class="zzz-panel" style="padding:16px;text-align:center;">
            <div class="zzz-label">ACCURACY</div>
            <div class="zzz-value" style="font-size:24px;color:var(--zzz-cyan);">${s.accuracy.toFixed(2)}%</div>
          </div>
          <div class="zzz-panel" style="padding:16px;text-align:center;">
            <div class="zzz-label">MAX COMBO</div>
            <div class="zzz-value" style="font-size:24px;color:var(--zzz-yellow);">${s.maxCombo}x</div>
          </div>
          <div class="zzz-panel" style="padding:16px;text-align:center;">
            <div class="zzz-label">TOTAL NOTES</div>
            <div class="zzz-value" style="font-size:24px;">${Object.values(s.hitCounts).reduce((a,b)=>a+b,0)}</div>
          </div>
        </div>
        
        <!-- Hit breakdown -->
        <div class="zzz-panel" style="padding:16px;width:500px;">
          <div style="display:flex;justify-content:space-around;">
            <div style="text-align:center;">
              <div class="zzz-label">PERFECT</div>
              <div style="font-size:20px;color:#FFD700;font-weight:700;">${s.hitCounts.perfect}</div>
            </div>
            <div style="text-align:center;">
              <div class="zzz-label">GREAT</div>
              <div style="font-size:20px;color:#00E5FF;font-weight:700;">${s.hitCounts.great}</div>
            </div>
            <div style="text-align:center;">
              <div class="zzz-label">GOOD</div>
              <div style="font-size:20px;color:#A0FF80;font-weight:700;">${s.hitCounts.good}</div>
            </div>
            <div style="text-align:center;">
              <div class="zzz-label">BAD</div>
              <div style="font-size:20px;color:#FF8C00;font-weight:700;">${s.hitCounts.bad}</div>
            </div>
            <div style="text-align:center;">
              <div class="zzz-label">MISS</div>
              <div style="font-size:20px;color:#FF3D3D;font-weight:700;">${s.hitCounts.miss}</div>
            </div>
          </div>
        </div>
        
        <!-- Buttons -->
        <div style="display:flex;gap:16px;">
          <button class="zzz-btn" data-action="retry">RETRY</button>
          <button class="zzz-btn zzz-btn--primary" data-action="menu">MENU</button>
        </div>
      </div>
    `;
  }

  init(data) {
    this.container = document.getElementById('screen');
    
    if (data && data.stats) {
      this._stats = data.stats;
    }
    
    // Button handlers
    this.container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.action;
        if (action === 'retry') {
          if (this._lastMap) {
            this.screens.show('game', { map: this._lastMap });
          }
        } else if (action === 'menu') {
          this.screens.show('song-select');
        }
      });
    });
    
    // Keyboard
    this._keyHandler = (e) => {
      if (e.code === 'Enter') {
        this.screens.show('song-select');
      } else if (e.code === 'Escape') {
        this.screens.show('main-menu');
      }
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  setStats(stats, map) {
    this._stats = stats;
    this._lastMap = map;
  }

  destroy() {
    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler);
    }
  }
}
