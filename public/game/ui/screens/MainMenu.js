import ZZZTheme from '../../theme/ZZZTheme.js';
import EventBus from '../../core/EventBus.js';

export default class MainMenu {
  constructor({ audio, screens }) {
    this.audio = audio;
    this.screens = screens;
  }

  build() {
    return `
      <div style="display:flex;flex-direction:column;height:100%;background:rgba(0,0,0,0.6);overflow:hidden;">
        <!-- Top spacer -->
        <div style="flex:1;min-height:24px;"></div>

        <!-- Main content area -->
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:40px;padding:0 32px;">

          <!-- Title block with parallax -->
          <div id="mm-parallax-title" class="parallax-layer" data-parallax="6" style="text-align:center;">
            <h1 class="zzz-title" style="font-size:clamp(40px,8vw,72px);color:var(--zzz-lime);letter-spacing:0.25em;margin:0;line-height:1;text-shadow:0 0 40px rgba(170,255,0,0.4),0 0 80px rgba(170,255,0,0.2);">RHYTHM::OS</h1>
            <div style="margin-top:12px;font-family:var(--zzz-font);font-weight:500;font-size:13px;color:var(--zzz-muted);letter-spacing:0.5em;text-transform:uppercase;">Neural Rhythm Interface</div>
          </div>

          <!-- Navigation buttons with parallax -->
          <div id="mm-parallax-btns" class="parallax-layer" data-parallax="3" style="display:flex;flex-direction:column;gap:14px;align-items:center;">
            <button class="zzz-btn zzz-btn--primary" data-action="play" style="min-width:280px;font-size:16px;padding:14px 36px;">
              <span style="position:relative;z-index:1;">▶&ensp;PLAY</span>
            </button>
            <button class="zzz-btn" data-action="settings" style="min-width:280px;border-color:var(--zzz-graphite-2);">
              <span style="position:relative;z-index:1;">⚙&ensp;SETTINGS</span>
            </button>
          </div>

          <!-- Stats panel -->
          <div class="parallax-layer" data-parallax="2" style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;max-width:480px;width:100%;">
            <div class="zzz-panel" style="padding:16px 20px;flex:1;min-width:120px;text-align:center;">
              <div class="zzz-label" style="margin-bottom:6px;font-size:9px;">BEATMAPS</div>
              <div id="mm-stat-maps" class="zzz-value" style="font-size:28px;color:var(--zzz-lime);line-height:1;">—</div>
            </div>
            <div class="zzz-panel" style="padding:16px 20px;flex:1;min-width:120px;text-align:center;">
              <div class="zzz-label" style="margin-bottom:6px;font-size:9px;">BEST SCORE</div>
              <div class="zzz-value" style="font-size:28px;color:var(--zzz-yellow);line-height:1;">—</div>
            </div>
            <div class="zzz-panel" style="padding:16px 20px;flex:1;min-width:120px;text-align:center;">
              <div class="zzz-label" style="margin-bottom:6px;font-size:9px;">PLAY TIME</div>
              <div class="zzz-value" style="font-size:28px;color:var(--zzz-text);line-height:1;">0h</div>
            </div>
          </div>
        </div>

        <!-- Featured section -->
        <div style="padding:0 32px 12px;">
          <div class="zzz-panel" style="padding:0;overflow:hidden;position:relative;">
            <div style="position:absolute;inset:0;background:linear-gradient(135deg, rgba(170,255,0,0.06) 0%, rgba(168,85,247,0.08) 50%, rgba(170,255,0,0.04) 100%);pointer-events:none;"></div>
            <div style="position:relative;padding:24px 28px;display:flex;align-items:center;justify-content:space-between;gap:16px;">
              <div>
                <div class="zzz-label" style="margin-bottom:8px;font-size:10px;color:var(--zzz-purple);">FEATURED</div>
                <div style="font-family:var(--zzz-font);font-weight:900;font-size:18px;color:var(--zzz-text);text-transform:uppercase;letter-spacing:0.08em;">NEW SEASON — COMING SOON</div>
                <div style="font-family:var(--zzz-font);font-weight:500;font-size:12px;color:var(--zzz-muted);margin-top:4px;">Stay tuned for ranked play and online leaderboards</div>
              </div>
              <div style="flex-shrink:0;width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg, var(--zzz-lime), var(--zzz-purple));display:flex;align-items:center;justify-content:center;font-size:20px;opacity:0.8;">
                ★
              </div>
            </div>
          </div>
        </div>

        <!-- Bottom bar -->
        <div style="padding:16px 32px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
          <div class="zzz-label" style="font-size:10px;opacity:0.5;">v0.5.0 — NEON EDITION</div>
          <div class="zzz-label" style="font-size:10px;opacity:0.3;">PRESS ENTER TO PLAY</div>
        </div>
      </div>
    `;
  }

  init() {
    this.container = document.getElementById('screen');
    this.container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.action;
        if (action === 'play') this.screens.show('song-select');
        else if (action === 'settings') EventBus.emit('settings:open-overlay');
      });
    });
    this._keyHandler = (e) => {
      if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); this.screens.show('song-select'); }
    };
    window.addEventListener('keydown', this._keyHandler);

    // Load beatmap count from IndexedDB
    this._loadBeatmapCount();

    // Add parallax layers
    const p1 = document.getElementById('mm-parallax-title');
    const p2 = document.getElementById('mm-parallax-btns');
    if (p1) ZZZTheme.addParallax(p1, 6);
    if (p2) ZZZTheme.addParallax(p2, 3);
  }

  async _loadBeatmapCount() {
    try {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('rhythm-os', 2);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction('beatmaps', 'readonly');
      const store = tx.objectStore('beatmaps');
      const count = await new Promise((resolve, reject) => {
        const req = store.count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const el = document.getElementById('mm-stat-maps');
      if (el) el.textContent = count;
    } catch (_) {
      const el = document.getElementById('mm-stat-maps');
      if (el) el.textContent = '0';
    }
  }

  destroy() {
    if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler);
    // Clean up parallax
    const p1 = document.getElementById('mm-parallax-title');
    const p2 = document.getElementById('mm-parallax-btns');
    if (p1) ZZZTheme.removeParallax(p1);
    if (p2) ZZZTheme.removeParallax(p2);
  }
}
