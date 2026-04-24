import EventBus from '../../core/EventBus.js';

export default class Settings {
  constructor({ audio, input, screens, overlayMode = false }) {
    this.audio = audio;
    this.input = input;
    this.screens = screens;
    this.overlayMode = overlayMode; // when true, render as overlay (from pause menu)
    this._keyHandler = null;
    this._rebinding = null;
  }

  build() {
    const aspectRatios = ['16:9', '16:10', '4:3', '21:9', 'Fill'];
    const savedAspect = localStorage.getItem('rhythm-os-aspect-ratio') || '16:9';
    const savedResScale = localStorage.getItem('rhythm-os-res-scale') || '100';

    if (this.overlayMode) {
      // Overlay mode: slide-in panel from left
      return `
        <div id="settings-overlay" style="position:absolute;inset:0;z-index:100;background:rgba(0,0,0,0.6);display:flex;">
          <div style="width:380px;height:100%;background:rgba(17,17,17,0.95);backdrop-filter:blur(20px);border-right:2px solid var(--zzz-graphite);overflow-y:auto;padding:28px 24px;animation:settings-slide-in 0.25s ease-out forwards;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;">
              <h2 class="zzz-title" style="font-size:28px;color:var(--zzz-lime);margin:0;">SETTINGS</h2>
              <button id="settings-close" class="zzz-btn zzz-btn--sm" style="pointer-events:all;">✕</button>
            </div>
            ${this._buildSettingsContent(aspectRatios, savedAspect, savedResScale)}
          </div>
          <div id="settings-overlay-bg" style="flex:1;"></div>
        </div>
      `;
    }

    // Full-screen mode
    return `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:28px;background:transparent;">
        <h2 class="zzz-title" style="font-size:40px;color:var(--zzz-lime);margin:0;">SETTINGS</h2>
        <div class="zzz-panel" style="padding:28px;width:480px;">
          ${this._buildSettingsContent(aspectRatios, savedAspect, savedResScale)}
        </div>
        <button class="zzz-btn" data-action="back">← BACK</button>
      </div>
    `;
  }

  _buildSettingsContent(aspectRatios, savedAspect, savedResScale) {
    return `
      <div style="margin-bottom:22px;">
        <div class="zzz-label" style="margin-bottom:8px;">AUDIO OFFSET (ms)</div>
        <div style="display:flex;gap:10px;align-items:center;">
          <input type="range" id="settings-offset" min="-100" max="100" value="${this._getSavedOffset()}" style="flex:1;" />
          <span id="settings-offset-val" class="zzz-value" style="min-width:50px;text-align:center;">${this._getSavedOffset()}</span>
        </div>
      </div>
      <div style="margin-bottom:22px;">
        <div class="zzz-label" style="margin-bottom:8px;">VOLUME</div>
        <div style="display:flex;gap:10px;align-items:center;">
          <input type="range" id="settings-volume" min="0" max="100" value="${this._getSavedVolume()}" style="flex:1;" />
          <span id="settings-volume-val" class="zzz-value" style="min-width:40px;text-align:center;">${this._getSavedVolume()}%</span>
        </div>
      </div>
      <div style="margin-bottom:22px;">
        <div class="zzz-label" style="margin-bottom:8px;">SCROLL SPEED</div>
        <div style="display:flex;gap:10px;align-items:center;">
          <input type="range" id="settings-scroll" min="200" max="800" value="${this._getSavedScrollSpeed()}" step="50" style="flex:1;" />
          <span id="settings-scroll-val" class="zzz-value" style="min-width:50px;text-align:center;">${this._getSavedScrollSpeed()}</span>
        </div>
      </div>
      <div style="margin-bottom:22px;">
        <div class="zzz-label" style="margin-bottom:8px;">ASPECT RATIO</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;" id="aspect-ratio-btns">
          ${aspectRatios.map(ar => `<button class="zzz-btn zzz-btn--sm ${ar === savedAspect ? 'zzz-btn--primary' : ''}" data-aspect="${ar}" style="flex:1;min-width:60px;">${ar}</button>`).join('')}
        </div>
      </div>
      <div style="margin-bottom:22px;">
        <div class="zzz-label" style="margin-bottom:8px;">RESOLUTION SCALE (%)</div>
        <div style="display:flex;gap:10px;align-items:center;">
          <input type="range" id="settings-res-scale" min="50" max="150" value="${savedResScale}" step="10" style="flex:1;" />
          <span id="settings-res-scale-val" class="zzz-value" style="min-width:50px;text-align:center;">${savedResScale}%</span>
        </div>
      </div>
      <div>
        <div class="zzz-label" style="margin-bottom:8px;">KEY BINDINGS (4-KEY)</div>
        <div id="keybinds" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"></div>
      </div>
    `;
  }

  init() {
    const oi = document.getElementById('settings-offset'), ov = document.getElementById('settings-offset-val');
    if (oi) oi.addEventListener('input', () => { const v = parseInt(oi.value); ov.textContent = v; localStorage.setItem('rhythm-os-audio-offset', v.toString()); if (this.audio) this.audio.setOffset(v / 1000); });
    const vi = document.getElementById('settings-volume'), vv = document.getElementById('settings-volume-val');
    if (vi) vi.addEventListener('input', () => { const v = parseInt(vi.value); vv.textContent = v + '%'; localStorage.setItem('rhythm-os-volume', v.toString()); if (this.audio) this.audio.setVolume(v / 100); });
    const si = document.getElementById('settings-scroll'), sv = document.getElementById('settings-scroll-val');
    if (si) si.addEventListener('input', () => { const v = parseInt(si.value); sv.textContent = v; localStorage.setItem('rhythm-os-scroll-speed', v.toString()); EventBus.emit('settings:changed', { key: 'scrollSpeed', value: v }); });
    const ri = document.getElementById('settings-res-scale'), rv = document.getElementById('settings-res-scale-val');
    if (ri) ri.addEventListener('input', () => { const v = parseInt(ri.value); rv.textContent = v + '%'; localStorage.setItem('rhythm-os-res-scale', v.toString()); EventBus.emit('settings:changed', { key: 'resScale', value: v }); });

    document.querySelectorAll('[data-aspect]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const ar = e.currentTarget.dataset.aspect;
        localStorage.setItem('rhythm-os-aspect-ratio', ar);
        document.querySelectorAll('[data-aspect]').forEach(b => b.classList.remove('zzz-btn--primary'));
        e.currentTarget.classList.add('zzz-btn--primary');
        EventBus.emit('settings:changed', { key: 'aspectRatio', value: ar });
      });
    });

    this._renderKeybinds();

    // Overlay mode close handlers
    const closeBtn = document.getElementById('settings-close');
    const overlayBg = document.getElementById('settings-overlay-bg');
    if (closeBtn) closeBtn.addEventListener('click', () => this._closeOverlay());
    if (overlayBg) overlayBg.addEventListener('click', () => this._closeOverlay());

    // Full-screen mode back button
    document.querySelectorAll('[data-action="back"]').forEach(b => b.addEventListener('click', () => this.screens.show('main-menu')));

    this._keyHandler = (e) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        if (this._rebinding) { this._rebinding = null; this._renderKeybinds(); }
        else if (this.overlayMode) this._closeOverlay();
        else this.screens.show('main-menu');
      }
      else if (this._rebinding) { e.preventDefault(); this._finishRebind(e.code); }
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  _closeOverlay() {
    if (this.screens) {
      // Return to the previous screen without transition
      const container = document.getElementById('screen');
      if (container) container.innerHTML = '';
      // Emit event so main.js can restore the pause menu
      EventBus.emit('settings:close-overlay');
    }
  }

  _renderKeybinds() {
    const c = document.getElementById('keybinds'); if (!c) return;
    const km = this.input ? this.input.getKeyMap() : { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3 };
    const labels = ['Lane 1 (D)', 'Lane 2 (F)', 'Lane 3 (J)', 'Lane 4 (K)'];
    c.innerHTML = '';
    for (const [code, lane] of Object.entries(km)) {
      const btn = document.createElement('button');
      btn.className = 'zzz-btn zzz-btn--sm'; btn.style.width = '100%';
      btn.textContent = `${labels[lane] || `Lane ${lane + 1}`}: ${code.replace('Key', '')}`;
      btn.addEventListener('click', () => this._startRebind(lane, btn));
      c.appendChild(btn);
    }
  }

  _startRebind(lane, btn) { this._rebinding = { lane, btn }; btn.textContent = 'PRESS A KEY...'; btn.style.borderColor = 'var(--zzz-lime)'; btn.style.color = 'var(--zzz-lime)'; }
  _finishRebind(code) {
    if (!this._rebinding) return;
    const km = this.input ? this.input.getKeyMap() : {};
    for (const [k, v] of Object.entries(km)) { if (v === this._rebinding.lane) delete km[k]; }
    km[code] = this._rebinding.lane;
    if (this.input) this.input.setKeyMap(4, km);
    this._rebinding = null; this._renderKeybinds();
  }

  _getSavedOffset() { return parseInt(localStorage.getItem('rhythm-os-audio-offset') || '0'); }
  _getSavedVolume() { return parseInt(localStorage.getItem('rhythm-os-volume') || '70'); }
  _getSavedScrollSpeed() { return parseInt(localStorage.getItem('rhythm-os-scroll-speed') || '400'); }

  destroy() { if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler); }
}
