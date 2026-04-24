import ZZZTheme from '../../theme/ZZZTheme.js';
import EventBus from '../../core/EventBus.js';

export default class MainMenu {
  constructor({ audio, screens }) {
    this.audio = audio;
    this.screens = screens;
    this._keyHandler = null;
    this._tickerInterval = null;
    this._initTime = Date.now();
  }

  build() {
    return `
      <div id="mm-root" style="display:flex;flex-direction:column;height:100%;position:relative;overflow:hidden;">
        <!-- Animated background grain -->
        <div style="position:absolute;inset:0;opacity:0.03;pointer-events:none;background-image:url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/%3E%3C/svg%3E');animation:mm-grain 0.5s steps(4) infinite;"></div>

        <!-- Full-screen darkening for background -->
        <div style="position:absolute;inset:0;pointer-events:none;z-index:0;background:rgba(0,0,0,0.25);"></div>

        <!-- Top gradient fade -->
        <div style="position:absolute;top:0;left:0;right:0;height:120px;background:linear-gradient(to bottom,rgba(0,0,0,0.7),transparent);pointer-events:none;z-index:1;"></div>

        <!-- Main content -->
        <div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:0 40px;position:relative;z-index:2;">

          <!-- Title block -->
          <div id="mm-parallax-title" class="parallax-layer" data-parallax="5" style="text-align:center;margin-bottom:8px;">
            <!-- Glitch title -->
            <div style="position:relative;display:inline-block;">
              <h1 id="mm-title" class="mm-title" style="font-family:var(--zzz-font);font-weight:900;font-size:clamp(42px,9vw,80px);letter-spacing:0.2em;line-height:1;margin:0;position:relative;">
                <span style="color:var(--zzz-lime);text-shadow:0 0 60px rgba(170,255,0,0.35),0 0 120px rgba(170,255,0,0.15);">RHYMIX</span>
              </h1>
              <!-- Glitch overlay layer -->
              <div id="mm-glitch-layer" style="position:absolute;inset:0;pointer-events:none;overflow:hidden;" aria-hidden="true"></div>
            </div>
            <!-- Subtitle -->
            <div id="mm-subtitle" style="margin-top:12px;font-family:var(--zzz-font);font-weight:500;font-size:12px;color:var(--zzz-muted);letter-spacing:0.6em;text-transform:uppercase;opacity:0;animation:mm-fade-up 0.6s 0.3s ease-out forwards;">БЕСПЛАТНАЯ WEB РИТМ-ИГРА</div>
            <!-- Animated underline -->
            <div style="margin:16px auto 0;width:0;height:2px;background:linear-gradient(90deg,transparent,var(--zzz-lime),transparent);animation:mm-line-expand 0.8s 0.5s ease-out forwards;border-radius:1px;box-shadow:0 0 12px rgba(170,255,0,0.3);"></div>
          </div>

          <!-- Navigation buttons -->
          <div id="mm-parallax-btns" class="parallax-layer" data-parallax="3" style="display:flex;flex-direction:column;align-items:center;gap:12px;margin-top:36px;">
            <button class="mm-nav-btn mm-nav-btn--primary" data-action="play" style="opacity:0;animation:mm-fade-up 0.5s 0.4s ease-out forwards;">
              <span class="mm-nav-icon" style="font-size:18px;">▶</span>
              <span class="mm-nav-text">PLAY</span>
              <span class="mm-nav-arrow" style="opacity:0.4;">→</span>
            </button>
            <button class="mm-nav-btn" data-action="settings" style="opacity:0;animation:mm-fade-up 0.5s 0.5s ease-out forwards;">
              <span class="mm-nav-icon" style="font-size:16px;">⚙</span>
              <span class="mm-nav-text">SETTINGS</span>
              <span class="mm-nav-arrow" style="opacity:0.4;">→</span>
            </button>
          </div>

          <!-- Stats row -->
          <div class="parallax-layer" data-parallax="2" style="display:flex;gap:10px;justify-content:center;margin-top:40px;opacity:0;animation:mm-fade-up 0.5s 0.6s ease-out forwards;">
            <div class="mm-stat-card">
              <div class="mm-stat-label">BEATMAPS</div>
              <div id="mm-stat-maps" class="mm-stat-value" style="color:var(--zzz-lime);">—</div>
            </div>
            <div class="mm-stat-card">
              <div class="mm-stat-label">BEST SCORE</div>
              <div id="mm-stat-best" class="mm-stat-value" style="color:var(--zzz-yellow);">—</div>
            </div>
            <div class="mm-stat-card">
              <div class="mm-stat-label">PLAY TIME</div>
              <div id="mm-stat-time" class="mm-stat-value">0h</div>
            </div>
            <div class="mm-stat-card">
              <div class="mm-stat-label">TOTAL PLAYS</div>
              <div id="mm-stat-plays" class="mm-stat-value" style="color:var(--zzz-purple);">—</div>
            </div>
          </div>
        </div>

        <!-- Bottom section -->
        <div style="position:relative;z-index:2;flex-shrink:0;">
          <!-- News ticker -->
          <div style="position:relative;height:32px;overflow:hidden;margin:0 40px 12px;border-top:1px solid rgba(170,255,0,0.08);border-bottom:1px solid rgba(170,255,0,0.08);opacity:0;animation:mm-fade-up 0.5s 0.7s ease-out forwards;">
            <div style="position:absolute;left:0;top:0;bottom:0;width:80px;background:linear-gradient(90deg,rgba(0,0,0,0.95),transparent);z-index:2;display:flex;align-items:center;padding-left:12px;">
              <span style="font-family:var(--zzz-font);font-weight:900;font-size:9px;color:var(--zzz-lime);letter-spacing:0.15em;">NEWS</span>
            </div>
            <div id="mm-ticker" style="position:absolute;inset:0;display:flex;align-items:center;">
              <div id="mm-ticker-content" style="white-space:nowrap;font-family:var(--zzz-font);font-weight:500;font-size:11px;color:var(--zzz-muted);letter-spacing:0.04em;padding-left:90px;animation:mm-ticker-scroll 30s linear infinite;">
                <span style="color:var(--zzz-lime);margin-right:8px;">●</span> Season 1 ranked play coming soon
                <span style="color:var(--zzz-graphite-2);margin:0 24px;">│</span>
                <span style="color:var(--zzz-yellow);margin-right:8px;">●</span> New difficulty analyzer with star ratings
                <span style="color:var(--zzz-graphite-2);margin:0 24px;">│</span>
                <span style="color:var(--zzz-purple);margin-right:8px;">●</span> Video backgrounds now supported
                <span style="color:var(--zzz-graphite-2);margin:0 24px;">│</span>
                <span style="color:var(--zzz-red);margin-right:8px;">●</span> Custom keybindings available in settings
                <span style="color:var(--zzz-graphite-2);margin:0 24px;">│</span>
                <span style="color:var(--zzz-lime);margin-right:8px;">●</span> Import your .osz beatmaps and start playing
              </div>
            </div>
            <div style="position:absolute;right:0;top:0;bottom:0;width:40px;background:linear-gradient(270deg,rgba(0,0,0,0.95),transparent);z-index:2;"></div>
          </div>

          <!-- Featured card -->
          <div style="padding:0 40px 8px;opacity:0;animation:mm-fade-up 0.5s 0.75s ease-out forwards;">
            <div class="mm-featured-card">
              <div class="mm-featured-glow"></div>
              <div style="position:relative;padding:20px 24px;display:flex;align-items:center;gap:16px;">
                <div style="flex-shrink:0;width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg, var(--zzz-lime), var(--zzz-purple));display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 0 24px rgba(170,255,0,0.15);">
                  ★
                </div>
                <div style="flex:1;min-width:0;">
                  <div class="mm-featured-label">FEATURED</div>
                  <div class="mm-featured-title">RANKED SEASON 1 — COMING SOON</div>
                  <div class="mm-featured-desc">Compete on global leaderboards and climb the ranks</div>
                </div>
                <div style="flex-shrink:0;">
                  <div style="font-family:var(--zzz-font);font-weight:700;font-size:10px;color:var(--zzz-lime);letter-spacing:0.1em;padding:6px 14px;border:1px solid rgba(170,255,0,0.2);border-radius:9999px;white-space:nowrap;">VIEW DETAILS →</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Bottom bar -->
          <div style="padding:12px 40px 16px;display:flex;align-items:center;justify-content:space-between;opacity:0;animation:mm-fade-up 0.5s 0.8s ease-out forwards;">
            <div style="display:flex;align-items:center;gap:12px;">
              <span class="mm-version">v0.5.0</span>
              <span style="color:rgba(255,255,255,0.1);">·</span>
              <span class="mm-version-sub">NEON EDITION</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="mm-hint-key">ENTER</span>
              <span class="mm-version-sub">TO PLAY</span>
            </div>
          </div>
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

    // Add parallax layers
    const p1 = document.getElementById('mm-parallax-title');
    const p2 = document.getElementById('mm-parallax-btns');
    if (p1) ZZZTheme.addParallax(p1, 5);
    if (p2) ZZZTheme.addParallax(p2, 3);

    // Load stats
    this._loadStats();

    // Start periodic title glitch effect
    this._startGlitchLoop();
  }

  async _loadStats() {
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

      // Count total plays from all records
      let bestScore = 0;
      let totalPlays = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('rhythm-record-')) {
          try {
            const rec = JSON.parse(localStorage.getItem(key));
            if (rec) {
              totalPlays++;
              if (rec.score > bestScore) bestScore = rec.score;
            }
          } catch (_) {}
        }
      }
      const bestEl = document.getElementById('mm-stat-best');
      if (bestEl) bestEl.textContent = bestScore > 0 ? bestScore.toLocaleString() : '—';
      const playsEl = document.getElementById('mm-stat-plays');
      if (playsEl) playsEl.textContent = totalPlays;
    } catch (_) {
      const el = document.getElementById('mm-stat-maps');
      if (el) el.textContent = '0';
    }
  }

  /** Periodic subtle glitch on the title */
  _startGlitchLoop() {
    const glitch = () => {
      if (this.container !== document.getElementById('screen')) return; // destroyed
      const layer = document.getElementById('mm-glitch-layer');
      if (!layer) return;

      // Random glitch burst (short, subtle)
      const intensity = Math.random() < 0.3 ? 0.6 : 0.15;
      const duration = 80 + Math.random() * 120;
      const offset = () => (Math.random() - 0.5) * 4 * intensity;

      layer.innerHTML = `
        <div style="position:absolute;inset:0;transform:translate(${offset()}px, ${offset()}px);clip-path:inset(${Math.random()*30}% 0 ${Math.random()*30}% 0);color:var(--zzz-lime);opacity:${intensity};font-family:var(--zzz-font);font-weight:900;font-size:clamp(42px,9vw,80px);letter-spacing:0.2em;line-height:1;pointer-events:none;">
          <span>RHYMIX</span>
        </div>
        <div style="position:absolute;inset:0;transform:translate(${offset()}px, ${offset()}px);clip-path:inset(${Math.random()*40}% 0 ${Math.random()*40}% 0);color:var(--zzz-red);opacity:${intensity * 0.7};font-family:var(--zzz-font);font-weight:900;font-size:clamp(42px,9vw,80px);letter-spacing:0.2em;line-height:1;pointer-events:none;">
          <span>RHYMIX</span>
        </div>
      `;
      setTimeout(() => { if (layer) layer.innerHTML = ''; }, duration);

      // Schedule next glitch (3-8 seconds)
      this._glitchTimeout = setTimeout(glitch, 3000 + Math.random() * 5000);
    };
    // First glitch after 2-4 seconds
    this._glitchTimeout = setTimeout(glitch, 2000 + Math.random() * 2000);
  }

  destroy() {
    if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler);
    if (this._glitchTimeout) clearTimeout(this._glitchTimeout);
    // Clean up parallax
    const p1 = document.getElementById('mm-parallax-title');
    const p2 = document.getElementById('mm-parallax-btns');
    if (p1) ZZZTheme.removeParallax(p1);
    if (p2) ZZZTheme.removeParallax(p2);
  }
}
