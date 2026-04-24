import ZZZTheme from '../theme/ZZZTheme.js';

export default class MainMenu {
  constructor({ audio, screens }) {
    this.audio = audio;
    this.screens = screens;
  }

  build() {
    return `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:48px;background:transparent;">
        <div id="mm-parallax" class="parallax-layer" data-parallax="6" style="text-align:center;">
          <h1 class="zzz-title" style="font-size:72px;color:var(--zzz-lime);letter-spacing:0.25em;margin:0;text-shadow:0 0 40px rgba(170,255,0,0.4),0 0 80px rgba(170,255,0,0.2);">RHYTHM::OS</h1>
          <div class="zzz-label" style="margin-top:12px;letter-spacing:0.4em;font-size:13px;">PRESS START</div>
        </div>
        <div id="mm-parallax-btns" class="parallax-layer" data-parallax="3" style="display:flex;flex-direction:column;gap:16px;align-items:center;">
          <button class="zzz-btn zzz-btn--primary" data-action="play" style="min-width:260px;font-size:16px;">▶ PLAY</button>
          <button class="zzz-btn" data-action="settings" style="min-width:260px;">SETTINGS</button>
        </div>
        <div class="zzz-label" style="position:absolute;bottom:28px;">v0.5.0 — NEON EDITION</div>
      </div>
    `;
  }

  init() {
    this.container = document.getElementById('screen');
    this.container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.action;
        if (action === 'play') this.screens.show('song-select');
        else if (action === 'settings') this.screens.show('settings');
      });
    });
    this._keyHandler = (e) => {
      if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); this.screens.show('song-select'); }
    };
    window.addEventListener('keydown', this._keyHandler);

    // Add parallax layers
    const p1 = document.getElementById('mm-parallax');
    const p2 = document.getElementById('mm-parallax-btns');
    if (p1) ZZZTheme.addParallax(p1, 6);
    if (p2) ZZZTheme.addParallax(p2, 3);
  }

  destroy() {
    if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler);
    // Clean up parallax
    const p1 = document.getElementById('mm-parallax');
    const p2 = document.getElementById('mm-parallax-btns');
    if (p1) ZZZTheme.removeParallax(p1);
    if (p2) ZZZTheme.removeParallax(p2);
  }
}
