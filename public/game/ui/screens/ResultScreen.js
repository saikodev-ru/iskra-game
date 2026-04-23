export default class ResultScreen {
  constructor({ screens }) { this.screens = screens; this._stats = null; this._lastMap = null; this._keyHandler = null; }
  
  build() {
    const s = this._stats || { score: 0, accuracy: 100, maxCombo: 0, rank: 'D', hitCounts: { perfect: 0, great: 0, good: 0, bad: 0, miss: 0 } };
    const rc = { SS: '#AAFF00', S: '#AAFF00', A: '#00E5FF', B: '#F5C518', C: '#FF8C00', D: '#FF3D3D' };
    const c = rc[s.rank] || '#FF3D3D';
    return `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:28px;">
        <div style="font-family:var(--zzz-font);font-weight:900;font-size:120px;color:${c};text-shadow:0 0 50px ${c};letter-spacing:0.1em;line-height:1;">${s.rank}</div>
        <div class="zzz-panel" style="padding:24px;width:480px;text-align:center;">
          <div class="zzz-label" style="margin-bottom:6px;">SCORE</div>
          <div class="zzz-value" style="font-size:38px;color:var(--zzz-lime);">${s.score.toLocaleString()}</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;width:480px;">
          <div class="zzz-panel" style="padding:18px;text-align:center;"><div class="zzz-label">ACCURACY</div><div class="zzz-value" style="font-size:24px;color:var(--zzz-lime);">${s.accuracy.toFixed(2)}%</div></div>
          <div class="zzz-panel" style="padding:18px;text-align:center;"><div class="zzz-label">MAX COMBO</div><div class="zzz-value" style="font-size:24px;color:var(--zzz-yellow);">${s.maxCombo}x</div></div>
          <div class="zzz-panel" style="padding:18px;text-align:center;"><div class="zzz-label">NOTES</div><div class="zzz-value" style="font-size:24px;">${Object.values(s.hitCounts).reduce((a,b)=>a+b,0)}</div></div>
        </div>
        <div class="zzz-panel" style="padding:18px;width:480px;">
          <div style="display:flex;justify-content:space-around;">
            <div style="text-align:center;"><div class="zzz-label">PERFECT</div><div style="font-size:20px;color:#AAFF00;font-weight:700;">${s.hitCounts.perfect}</div></div>
            <div style="text-align:center;"><div class="zzz-label">GREAT</div><div style="font-size:20px;color:#00E5FF;font-weight:700;">${s.hitCounts.great}</div></div>
            <div style="text-align:center;"><div class="zzz-label">GOOD</div><div style="font-size:20px;color:#F5C518;font-weight:700;">${s.hitCounts.good}</div></div>
            <div style="text-align:center;"><div class="zzz-label">BAD</div><div style="font-size:20px;color:#FF8C00;font-weight:700;">${s.hitCounts.bad}</div></div>
            <div style="text-align:center;"><div class="zzz-label">MISS</div><div style="font-size:20px;color:#FF3D3D;font-weight:700;">${s.hitCounts.miss}</div></div>
          </div>
        </div>
        <div style="display:flex;gap:16px;">
          <button class="zzz-btn" data-action="retry">RETRY</button>
          <button class="zzz-btn zzz-btn--primary" data-action="menu">MENU</button>
        </div>
      </div>
    `;
  }

  init(data) {
    if (data && data.stats) this._stats = data.stats;
    if (data && data.map) this._lastMap = data.map;
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
