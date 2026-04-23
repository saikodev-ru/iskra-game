import EventBus from '../../core/EventBus.js';

export default class MainMenu {
  constructor({ audio, screens }) {
    this.audio = audio;
    this.screens = screens;
  }

  build() {
    return `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:40px;">
        <!-- Title -->
        <div style="text-align:center;">
          <h1 class="zzz-title" style="font-size:64px;color:var(--zzz-cyan);letter-spacing:0.3em;margin:0;text-shadow:0 0 30px rgba(0,229,255,0.5);">
            RHYTHM::OS
          </h1>
          <div class="zzz-label" style="margin-top:8px;letter-spacing:0.3em;">PRESS START</div>
        </div>
        
        <!-- Menu buttons -->
        <div style="display:flex;flex-direction:column;gap:16px;align-items:center;">
          <button class="zzz-btn zzz-btn--primary" data-action="play" style="min-width:240px;">
            PLAY
          </button>
          <button class="zzz-btn" data-action="settings" style="min-width:240px;">
            SETTINGS
          </button>
        </div>
        
        <!-- Version -->
        <div class="zzz-label" style="position:absolute;bottom:24px;">
          v0.1.0 — ZENLESS ZONE ZERO EDITION
        </div>
      </div>
    `;
  }

  init() {
    this.container = document.getElementById('screen');
    
    // Button handlers
    this.container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.action;
        if (action === 'play') {
          this.screens.show('song-select');
        } else if (action === 'settings') {
          this.screens.show('settings');
        }
      });
    });
    
    // Keyboard: Enter/Space to play
    this._keyHandler = (e) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        this.screens.show('song-select');
      }
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  destroy() {
    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler);
    }
  }
}
