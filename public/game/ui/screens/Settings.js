import EventBus from '../../core/EventBus.js';

export default class Settings {
  constructor({ audio, input, screens, overlayMode = false }) {
    this.audio = audio;
    this.input = input;
    this.screens = screens;
    this.overlayMode = overlayMode;
    this._keyHandler = null;
    this._rebinding = null;
    this._rebindingQR = false; // true when rebinding quick restart key
    this._resizeObserver = null;
    this._onClose = null; // Set by caller for pause-specific cleanup
  }

  build() {
    const aspectRatios = ['16:9', '16:10', '4:3', '21:9', 'Fill'];
    const savedAspect = localStorage.getItem('rhythm-os-aspect-ratio') || '16:9';
    const savedResScale = localStorage.getItem('rhythm-os-res-scale') || '100';

    return `
      <div id="settings-overlay" style="position:absolute;inset:0;z-index:100;background:rgba(0,0,0,0.6);display:flex;overflow:hidden;">
        <div id="settings-panel" style="width:min(380px,70%);min-width:240px;height:100%;background:rgba(17,17,17,0.95);backdrop-filter:blur(20px);border-right:2px solid var(--zzz-graphite);overflow-y:auto;padding:28px 20px;animation:settings-slide-in 0.25s ease-out forwards;" class="zzz-scroll">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;">
            <h2 class="zzz-title" style="font-size:24px;color:var(--zzz-lime);margin:0;">SETTINGS</h2>
            <button id="settings-close" class="zzz-btn zzz-btn--sm" style="pointer-events:all;">✕</button>
          </div>
          ${this._buildSettingsContent(aspectRatios, savedAspect, savedResScale)}
        </div>
        <div id="settings-overlay-bg" style="flex:1;min-width:0;"></div>
      </div>
    `;
  }

  _buildSettingsContent(aspectRatios, savedAspect, savedResScale) {
    const savedGraphics = localStorage.getItem('rhythm-os-graphics') || 'disco';
    const graphicsPresets = [
      { id: 'low', label: 'LOW', desc: 'No effects, no glow' },
      { id: 'standard', label: 'STANDARD', desc: 'Moderate effects' },
      { id: 'disco', label: 'DISCO', desc: 'Full effects' },
    ];
    const scrollSpeed = parseInt(localStorage.getItem('rhythm-os-scroll-speed') || '400');
    return `
      <div style="margin-bottom:20px;">
        <div class="zzz-label" style="margin-bottom:8px;">GRAPHICS</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;" id="graphics-btns">
          ${graphicsPresets.map(p => `<button class="zzz-btn zzz-btn--sm ${p.id === savedGraphics ? 'zzz-btn--primary' : ''}" data-graphics="${p.id}" style="flex:1;min-width:70px;font-size:11px;padding:6px 8px;flex-direction:column;line-height:1.3;"><span style="font-weight:700;">${p.label}</span><br><span style="font-size:9px;opacity:0.6;">${p.desc}</span></button>`).join('')}
        </div>
      </div>
      <div style="margin-bottom:20px;">
        <div class="zzz-label" style="margin-bottom:8px;">AUDIO OFFSET (ms)</div>
        <div style="display:flex;gap:10px;align-items:center;">
          <input type="range" id="settings-offset" min="-100" max="100" value="${this._getSavedOffset()}" style="flex:1;" />
          <span id="settings-offset-val" class="zzz-value" style="min-width:50px;text-align:center;">${this._getSavedOffset()}</span>
        </div>
      </div>
      <div style="margin-bottom:20px;">
        <div class="zzz-label" style="margin-bottom:8px;">MUSIC VOLUME</div>
        <div style="display:flex;gap:10px;align-items:center;">
          <input type="range" id="settings-volume" min="0" max="100" value="${this._getSavedVolume()}" style="flex:1;" />
          <span id="settings-volume-val" class="zzz-value" style="min-width:40px;text-align:center;">${this._getSavedVolume()}%</span>
        </div>
      </div>
      <div style="margin-bottom:20px;">
        <div class="zzz-label" style="margin-bottom:8px;">GAME VOLUME</div>
        <div style="display:flex;gap:10px;align-items:center;">
          <input type="range" id="settings-game-volume" min="0" max="100" value="${this._getSavedGameVolume()}" style="flex:1;" />
          <span id="settings-game-volume-val" class="zzz-value" style="min-width:40px;text-align:center;">${this._getSavedGameVolume()}%</span>
        </div>
      </div>
      <div style="margin-bottom:20px;">
        <div class="zzz-label" style="margin-bottom:8px;">BACKGROUND DIM</div>
        <div style="display:flex;gap:10px;align-items:center;">
          <input type="range" id="settings-bg-dim" min="0" max="100" value="${this._getSavedBgDim()}" style="flex:1;" />
          <span id="settings-bg-dim-val" class="zzz-value" style="min-width:40px;text-align:center;">${this._getSavedBgDim()}%</span>
        </div>
      </div>
      <div style="margin-bottom:20px;">
        <div class="zzz-label" style="margin-bottom:8px;">SCROLL SPEED</div>
        <div class="scroll-speed-control">
          <div style="display:flex;align-items:center;gap:8px;">
            <input type="number" id="settings-scroll-input" class="zzz-num-input" min="50" max="2000" step="25" value="${scrollSpeed}" />
            <input type="range" id="settings-scroll" min="50" max="2000" value="${scrollSpeed}" step="25" style="flex:1;" />
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:4px;">
            <span style="font-size:9px;color:var(--zzz-muted);font-family:var(--zzz-mono);">50</span>
            <span style="font-size:9px;color:var(--zzz-muted);font-family:var(--zzz-mono);">2000</span>
          </div>
        </div>
      </div>
      <div style="margin-bottom:20px;">
        <div class="zzz-label" style="margin-bottom:8px;">ASPECT RATIO</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;" id="aspect-ratio-btns">
          ${aspectRatios.map(ar => `<button class="zzz-btn zzz-btn--sm ${ar === savedAspect ? 'zzz-btn--primary' : ''}" data-aspect="${ar}" style="flex:1;min-width:48px;font-size:11px;padding:6px 8px;">${ar}</button>`).join('')}
        </div>
      </div>
      <div style="margin-bottom:20px;">
        <div class="zzz-label" style="margin-bottom:8px;">RESOLUTION SCALE (%)</div>
        <div style="display:flex;gap:10px;align-items:center;">
          <input type="range" id="settings-res-scale" min="50" max="150" value="${savedResScale}" step="10" style="flex:1;" />
          <span id="settings-res-scale-val" class="zzz-value" style="min-width:50px;text-align:center;">${savedResScale}%</span>
        </div>
      </div>
      <div style="margin-bottom:20px;">
        <div class="zzz-label" style="margin-bottom:8px;">QUICK RESTART KEY</div>
        <div id="qr-keybind" style="display:flex;gap:8px;align-items:center;">
          <button class="zzz-btn zzz-btn--sm" id="qr-key-btn" style="flex:1;font-size:12px;padding:8px 12px;">${this._getQRKeyName()}</button>
          <span style="font-size:9px;color:var(--zzz-muted);font-family:var(--zzz-mono);">HOLD TO RESTART</span>
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
    const gvi = document.getElementById('settings-game-volume'), gvv = document.getElementById('settings-game-volume-val');
    if (gvi) gvi.addEventListener('input', () => { const v = parseInt(gvi.value); gvv.textContent = v + '%'; localStorage.setItem('rhythm-os-game-volume', v.toString()); EventBus.emit('settings:changed', { key: 'gameVolume', value: v }); });

    const bdi = document.getElementById('settings-bg-dim'), bdv = document.getElementById('settings-bg-dim-val');
    if (bdi) bdi.addEventListener('input', () => { const v = parseInt(bdi.value); bdv.textContent = v + '%'; localStorage.setItem('rhythm-os-bg-dim', v.toString()); EventBus.emit('settings:changed', { key: 'bgDim', value: v }); });

    // Scroll speed — synced number input + slider
    const si = document.getElementById('settings-scroll'), sv = document.getElementById('settings-scroll-val');
    const si2 = document.getElementById('settings-scroll-input');
    const applyScrollSpeed = (v) => {
      v = Math.max(50, Math.min(2000, v || 400));
      localStorage.setItem('rhythm-os-scroll-speed', v.toString());
      EventBus.emit('settings:changed', { key: 'scrollSpeed', value: v });
      if (si) si.value = v;
      if (si2) si2.value = v;
    };
    if (si) si.addEventListener('input', () => applyScrollSpeed(parseInt(si.value)));
    if (si2) {
      si2.addEventListener('input', () => applyScrollSpeed(parseInt(si2.value)));
      si2.addEventListener('blur', () => { const v = Math.max(50, Math.min(2000, parseInt(si2.value) || 400)); si2.value = v; applyScrollSpeed(v); });
      si2.addEventListener('keydown', (e) => { if (e.code === 'Enter') { e.preventDefault(); si2.blur(); } });
    }

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

    document.querySelectorAll('[data-graphics]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const preset = e.currentTarget.dataset.graphics;
        localStorage.setItem('rhythm-os-graphics', preset);
        document.querySelectorAll('[data-graphics]').forEach(b => b.classList.remove('zzz-btn--primary'));
        e.currentTarget.classList.add('zzz-btn--primary');
        EventBus.emit('settings:changed', { key: 'graphics', value: preset });
      });
    });

    // Quick restart key binding
    const qrBtn = document.getElementById('qr-key-btn');
    if (qrBtn) qrBtn.addEventListener('click', () => {
      this._rebindingQR = true;
      qrBtn.textContent = 'PRESS A KEY...';
      qrBtn.style.borderColor = 'var(--zzz-lime)';
      qrBtn.style.color = 'var(--zzz-lime)';
    });

    this._renderKeybinds();

    // Overlay close handlers — ONLY attach when NOT in pause context
    // (pause context sets _onClose before init(), main menu context does not)
    if (!this._onClose) {
      const closeBtn = document.getElementById('settings-close');
      const overlayBg = document.getElementById('settings-overlay-bg');
      if (closeBtn) closeBtn.addEventListener('click', () => this._closeOverlay());
      if (overlayBg) overlayBg.addEventListener('click', () => this._closeOverlay());
    }

    // Watch for safe area changes and adjust panel width
    this._settingsChangedHandler = ({ key }) => {
      if (key === 'aspectRatio') {
        this._adjustPanelWidth();
      }
    };
    EventBus.on('settings:changed', this._settingsChangedHandler);

    // Initial adjustment
    this._adjustPanelWidth();

    this._keyHandler = (e) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        if (this._rebinding) { this._rebinding = null; this._renderKeybinds(); }
        else if (this._rebindingQR) { this._rebindingQR = false; this._updateQRKeyBtn(); }
        else this._closeOverlay();
      }
      else if (this._rebinding) { e.preventDefault(); this._finishRebind(e.code); }
      else if (this._rebindingQR) { e.preventDefault(); this._finishQRRebind(e.code); }
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  /** Adjust panel width when safe area changes (aspect ratio) */
  _adjustPanelWidth() {
    const panel = document.getElementById('settings-panel') || document.getElementById('pause-settings-inner');
    if (!panel) return;

    const sa = this._calcSafeArea();
    const maxWidth = Math.min(380, sa.w * 0.7);
    const minWidth = Math.min(240, sa.w * 0.5);

    panel.style.width = Math.max(minWidth, maxWidth) + 'px';
    panel.style.minWidth = minWidth + 'px';
  }

  _calcSafeArea() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ar = localStorage.getItem('rhythm-os-aspect-ratio') || '16:9';

    let targetW, targetH;
    if (ar === 'Fill') {
      targetW = w; targetH = h;
    } else {
      const parts = ar.split(':');
      const arW = parseInt(parts[0]) || 16;
      const arH = parseInt(parts[1]) || 9;
      const targetAR = arW / arH;
      const screenAR = w / h;
      if (screenAR > targetAR) { targetH = h; targetW = h * targetAR; }
      else { targetW = w; targetH = w / targetAR; }
    }
    targetW = Math.round(targetW);
    targetH = Math.round(targetH);
    return { x: Math.round((w - targetW) / 2), y: Math.round((h - targetH) / 2), w: targetW, h: targetH };
  }

  _closeOverlay() {
    // If caller provided a close callback (pause context), call it once only
    if (this._onClose) {
      const cb = this._onClose;
      this._onClose = null;
      cb();
      return; // Callback handles everything including DOM cleanup
    }
    // Default: close via screen manager (main menu context)
    // Guard: don't call if we're not in a valid state (e.g., double-fire from ESC)
    if (this.screens && this.screens._overlay === this && this.screens._closeOverlay) {
      this.screens._closeOverlay();
    }
  }

  _renderKeybinds() {
    const c = document.getElementById('keybinds'); if (!c) return;
    const km = this.input ? this.input.getKeyMap() : { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3 };
    const labels = ['Lane 1', 'Lane 2', 'Lane 3', 'Lane 4'];
    const laneCount = 4;
    c.innerHTML = '';
    const laneToKey = {};
    for (const [code, lane] of Object.entries(km)) {
      if (lane >= 0 && lane < laneCount) {
        laneToKey[lane] = code;
      }
    }
    for (let lane = 0; lane < laneCount; lane++) {
      const boundKey = laneToKey[lane] || null;
      const btn = document.createElement('button');
      btn.className = 'zzz-btn zzz-btn--sm'; btn.style.width = '100%';
      const keyName = boundKey ? boundKey.replace('Key', '').replace('Digit', '') : '—';
      btn.textContent = `${labels[lane]}: ${keyName}`;
      if (!boundKey) {
        btn.style.borderColor = 'var(--zzz-red)';
        btn.style.color = 'var(--zzz-red)';
      }
      btn.addEventListener('click', () => this._startRebind(lane, btn));
      c.appendChild(btn);
    }
  }

  _startRebind(lane, btn) { this._rebinding = { lane, btn }; btn.textContent = 'PRESS A KEY...'; btn.style.borderColor = 'var(--zzz-lime)'; btn.style.color = 'var(--zzz-lime)'; }
  _finishRebind(code) {
    if (!this._rebinding) return;
    const targetLane = this._rebinding.lane;
    const km = this.input ? this.input.getKeyMap() : {};

    delete km[code];

    const keysToRemove = [];
    for (const [k, v] of Object.entries(km)) {
      if (v === targetLane) keysToRemove.push(k);
    }
    for (const k of keysToRemove) delete km[k];

    km[code] = targetLane;

    if (this.input) this.input.setKeyMap(4, km);

    this._rebinding = null;
    this._renderKeybinds();
  }

  _getSavedOffset() { return parseInt(localStorage.getItem('rhythm-os-audio-offset') || '0'); }
  _getSavedVolume() { return parseInt(localStorage.getItem('rhythm-os-volume') || '70'); }
  _getSavedGameVolume() { return parseInt(localStorage.getItem('rhythm-os-game-volume') || '70'); }
  _getSavedBgDim() { return parseInt(localStorage.getItem('rhythm-os-bg-dim') || '0'); }
  _getSavedScrollSpeed() { return parseInt(localStorage.getItem('rhythm-os-scroll-speed') || '400'); }

  // ── Quick Restart Key ──
  _getQRKeyCode() { return localStorage.getItem('rhythm-os-quick-restart-key') || 'ShiftLeft'; }
  _getQRKeyName() {
    const code = this._getQRKeyCode();
    const labels = {
      'ShiftLeft': 'L-SHIFT', 'ShiftRight': 'R-SHIFT',
      'ControlLeft': 'L-CTRL', 'ControlRight': 'R-CTRL',
      'AltLeft': 'L-ALT', 'AltRight': 'R-ALT',
      'Tab': 'TAB', 'Backspace': 'BACKSPACE',
      'Space': 'SPACE',
    };
    return labels[code] || code.replace('Key', '').replace('Digit', '');
  }
  _updateQRKeyBtn() {
    const btn = document.getElementById('qr-key-btn');
    if (btn) {
      btn.textContent = this._getQRKeyName();
      btn.style.borderColor = '';
      btn.style.color = '';
    }
  }
  _finishQRRebind(code) {
    if (!this._rebindingQR) return;
    // Don't allow game lane keys
    const blockedCodes = ['Escape', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'];
    if (blockedCodes.includes(code)) return;
    localStorage.setItem('rhythm-os-quick-restart-key', code);
    this._rebindingQR = false;
    this._updateQRKeyBtn();
  }

  destroy() {
    if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler);
    if (this._settingsChangedHandler) EventBus.off('settings:changed', this._settingsChangedHandler);
  }
}
