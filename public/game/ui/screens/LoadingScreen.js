export default class LoadingScreen {
  constructor({ onReady }) {
    this.onReady = onReady;
    this._destroyed = false;
  }

  build() {
    return `
      <div id="loading-screen" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;position:relative;overflow:hidden;background:rgba(0,0,0,0.92);">
        <!-- Animated background grain -->
        <div style="position:absolute;inset:0;opacity:0.03;pointer-events:none;background-image:url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/%3E%3C/svg%3E');animation:mm-grain 0.5s steps(4) infinite;"></div>

        <!-- Top gradient -->
        <div style="position:absolute;top:0;left:0;right:0;height:200px;background:linear-gradient(to bottom,rgba(0,0,0,0.8),transparent);pointer-events:none;z-index:1;"></div>

        <!-- Content -->
        <div style="position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;gap:28px;">

          <!-- RHYMIX title -->
          <div style="position:relative;display:inline-block;">
            <h1 style="font-family:var(--zzz-font);font-weight:900;font-size:clamp(36px,8vw,72px);letter-spacing:0.2em;line-height:1;margin:0;color:var(--zzz-lime);text-shadow:0 0 60px rgba(170,255,0,0.35),0 0 120px rgba(170,255,0,0.15);animation:loading-title-pulse 2s ease-in-out infinite;">
              RHYMIX
            </h1>
          </div>

          <!-- Subtitle -->
          <div id="loading-status" style="font-family:var(--zzz-font);font-weight:500;font-size:11px;color:var(--zzz-muted);letter-spacing:0.5em;text-transform:uppercase;transition:all 0.3s ease;">
            LOADING RESOURCES
          </div>

          <!-- Progress bar -->
          <div style="width:clamp(200px,40vw,320px);height:3px;background:rgba(255,255,255,0.06);border-radius:9999px;overflow:hidden;position:relative;">
            <div id="loading-bar" style="height:100%;width:0%;background:var(--zzz-lime);border-radius:9999px;transition:width 0.4s cubic-bezier(0.22,1,0.36,1);box-shadow:0 0 12px rgba(170,255,0,0.4);"></div>
          </div>

          <!-- Loading details -->
          <div id="loading-details" style="font-family:var(--zzz-mono);font-size:10px;color:rgba(255,255,255,0.2);letter-spacing:0.08em;min-height:16px;transition:all 0.2s ease;">
          </div>

          <!-- Click to start (hidden until ready) -->
          <div id="loading-click" style="display:none;flex-direction:column;align-items:center;gap:16px;animation:loading-ready-in 0.5s cubic-bezier(0.22,1,0.36,1) forwards;">
            <div style="font-family:var(--zzz-font);font-weight:900;font-size:18px;color:var(--zzz-lime);letter-spacing:0.15em;text-shadow:0 0 20px rgba(170,255,0,0.3);">READY</div>
            <button id="loading-start-btn" style="font-family:var(--zzz-font);font-weight:700;font-size:12px;letter-spacing:0.12em;color:var(--zzz-text);background:transparent;border:2px solid var(--zzz-graphite);border-radius:9999px;padding:12px 36px;cursor:pointer;transition:all 0.2s ease;text-transform:uppercase;">
              CLICK TO START
            </button>
          </div>
        </div>

        <!-- Bottom version -->
        <div style="position:absolute;bottom:20px;font-family:var(--zzz-font);font-size:9px;color:rgba(255,255,255,0.15);letter-spacing:0.2em;">
          v0.5.0 — NEON EDITION
        </div>
      </div>
    `;
  }

  init() {
    const barEl = document.getElementById('loading-bar');
    const detailsEl = document.getElementById('loading-details');
    const statusEl = document.getElementById('loading-status');
    const clickEl = document.getElementById('loading-click');
    const startBtn = document.getElementById('loading-start-btn');

    if (!barEl) return;

    this._setProgress = (pct) => {
      if (this._destroyed) return;
      barEl.style.width = pct + '%';
    };

    this._setDetails = (text) => {
      if (this._destroyed || !detailsEl) return;
      detailsEl.textContent = text;
    };

    this._showReady = () => {
      if (this._destroyed) return;
      // Hide progress, show click to start
      if (statusEl) {
        statusEl.textContent = 'READY TO PLAY';
        statusEl.style.color = 'var(--zzz-lime)';
      }
      if (barEl) {
        barEl.style.width = '100%';
        barEl.style.background = 'linear-gradient(90deg, var(--zzz-lime), #CCFF66)';
      }
      if (detailsEl) detailsEl.style.opacity = '0';
      if (clickEl) clickEl.style.display = 'flex';
      if (startBtn) {
        startBtn.addEventListener('click', () => {
          if (this.onReady && !this._destroyed) this.onReady();
        });
      }
    };

    this._complete = () => {
      if (this._destroyed) return;
      this._showReady();
    };
  }

  get setProgress() { return this._setProgress || (() => {}); }
  get setDetails() { return this._setDetails || (() => {}); }
  get complete() { return this._complete || (() => {}); }

  destroy() {
    this._destroyed = true;
  }
}
