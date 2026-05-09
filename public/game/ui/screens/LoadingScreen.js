export default class LoadingScreen {
  constructor({ onReady }) {
    this.onReady = onReady;
    this._destroyed = false;
  }

  build() {
    return `
      <div id="loading-screen" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;position:relative;overflow:hidden;background:#000;">
        <!-- Simple ring spinner -->
        <div style="width:48px;height:48px;border:3px solid rgba(255,255,255,0.08);border-top-color:var(--zzz-lime);border-radius:50%;animation:ls-spin 0.8s linear infinite;"></div>
      </div>
    `;
  }

  init() {
    // No UI elements to bind — auto-advance when complete() is called
  }

  get setProgress() { return () => {}; }
  get setDetails() { return () => {}; }

  get complete() {
    return () => {
      if (this._destroyed) return;
      // Auto-advance to main menu after a brief delay
      setTimeout(() => {
        if (!this._destroyed && this.onReady) this.onReady();
      }, 300);
    };
  }

  destroy() {
    this._destroyed = true;
  }
}
