import EventBus from '../../core/EventBus.js';

export default class Settings {
  constructor({ audio, input, screens }) {
    this.audio = audio;
    this.input = input;
    this.screens = screens;
    this._keyHandler = null;
    this._rebinding = null;
  }

  build() {
    const offset = this._getSavedOffset();
    const volume = this._getSavedVolume();
    
    return `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:24px;">
        <h2 class="zzz-title" style="font-size:36px;color:var(--zzz-cyan);margin:0;">SETTINGS</h2>
        
        <div class="zzz-panel" style="padding:24px;width:400px;">
          <!-- Audio Offset -->
          <div style="margin-bottom:20px;">
            <div class="zzz-label" style="margin-bottom:8px;">AUDIO OFFSET (ms)</div>
            <div style="display:flex;gap:8px;align-items:center;">
              <input type="range" id="settings-offset" min="-100" max="100" value="${offset}" style="flex:1;accent-color:var(--zzz-cyan);" />
              <span id="settings-offset-val" class="zzz-value" style="min-width:50px;text-align:center;">${offset}</span>
            </div>
          </div>
          
          <!-- Volume -->
          <div style="margin-bottom:20px;">
            <div class="zzz-label" style="margin-bottom:8px;">VOLUME</div>
            <div style="display:flex;gap:8px;align-items:center;">
              <input type="range" id="settings-volume" min="0" max="100" value="${volume}" style="flex:1;accent-color:var(--zzz-cyan);" />
              <span id="settings-volume-val" class="zzz-value" style="min-width:40px;text-align:center;">${volume}%</span>
            </div>
          </div>
          
          <!-- Key Bindings -->
          <div style="margin-bottom:20px;">
            <div class="zzz-label" style="margin-bottom:8px;">KEY BINDINGS (4-KEY)</div>
            <div id="keybinds" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            </div>
          </div>
          
          <!-- Scroll Speed -->
          <div style="margin-bottom:20px;">
            <div class="zzz-label" style="margin-bottom:8px;">SCROLL SPEED</div>
            <div style="display:flex;gap:8px;align-items:center;">
              <input type="range" id="settings-scroll" min="200" max="800" value="${this._getSavedScrollSpeed()}" step="50" style="flex:1;accent-color:var(--zzz-cyan);" />
              <span id="settings-scroll-val" class="zzz-value" style="min-width:50px;text-align:center;">${this._getSavedScrollSpeed()}</span>
            </div>
          </div>
        </div>
        
        <div style="display:flex;gap:16px;">
          <button class="zzz-btn" data-action="back">BACK</button>
        </div>
      </div>
    `;
  }

  init() {
    this.container = document.getElementById('screen');
    
    // Audio offset
    const offsetInput = document.getElementById('settings-offset');
    const offsetVal = document.getElementById('settings-offset-val');
    offsetInput.addEventListener('input', () => {
      const v = parseInt(offsetInput.value);
      offsetVal.textContent = v;
      localStorage.setItem('rhythm-os-audio-offset', v.toString());
      if (this.audio) this.audio.setOffset(v / 1000);
      EventBus.emit('settings:changed', { key: 'audioOffset', value: v });
    });
    
    // Volume
    const volumeInput = document.getElementById('settings-volume');
    const volumeVal = document.getElementById('settings-volume-val');
    volumeInput.addEventListener('input', () => {
      const v = parseInt(volumeInput.value);
      volumeVal.textContent = v + '%';
      localStorage.setItem('rhythm-os-volume', v.toString());
      if (this.audio) this.audio.setVolume(v / 100);
      EventBus.emit('settings:changed', { key: 'volume', value: v });
    });
    
    // Scroll speed
    const scrollInput = document.getElementById('settings-scroll');
    const scrollVal = document.getElementById('settings-scroll-val');
    scrollInput.addEventListener('input', () => {
      const v = parseInt(scrollInput.value);
      scrollVal.textContent = v;
      localStorage.setItem('rhythm-os-scroll-speed', v.toString());
      EventBus.emit('settings:changed', { key: 'scrollSpeed', value: v });
    });
    
    // Key bindings
    this._renderKeybinds();
    
    // Back button
    this.container.querySelectorAll('[data-action="back"]').forEach(btn => {
      btn.addEventListener('click', () => this.screens.show('main-menu'));
    });
    
    // Escape key
    this._keyHandler = (e) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        if (this._rebinding) {
          this._rebinding = null;
          this._renderKeybinds();
        } else {
          this.screens.show('main-menu');
        }
      } else if (this._rebinding) {
        e.preventDefault();
        this._finishRebind(e.code);
      }
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  _renderKeybinds() {
    const container = document.getElementById('keybinds');
    if (!container) return;
    
    const keyMap = this.input ? this.input.getKeyMap() : { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3 };
    const laneLabels = ['Lane 1 (D)', 'Lane 2 (F)', 'Lane 3 (J)', 'Lane 4 (K)'];
    
    container.innerHTML = '';
    
    for (const [code, lane] of Object.entries(keyMap)) {
      const btn = document.createElement('button');
      btn.className = 'zzz-btn';
      btn.style.cssText = 'padding:6px 12px;font-size:12px;width:100%;';
      const displayCode = code.replace('Key', '');
      btn.textContent = `${laneLabels[lane] || `Lane ${lane + 1}`}: ${displayCode}`;
      btn.addEventListener('click', () => this._startRebind(lane, btn));
      container.appendChild(btn);
    }
  }

  _startRebind(lane, btn) {
    this._rebinding = { lane, btn };
    btn.textContent = 'PRESS A KEY...';
    btn.style.borderColor = 'var(--zzz-yellow)';
    btn.style.color = 'var(--zzz-yellow)';
  }

  _finishRebind(code) {
    if (!this._rebinding) return;
    const { lane } = this._rebinding;
    
    // Build new key map
    const keyMap = this.input ? this.input.getKeyMap() : {};
    // Remove old binding for this code
    for (const [k, v] of Object.entries(keyMap)) {
      if (v === lane) delete keyMap[k];
    }
    keyMap[code] = lane;
    
    if (this.input) {
      this.input.setKeyMap(4, keyMap);
    }
    
    this._rebinding = null;
    this._renderKeybinds();
  }

  _getSavedOffset() {
    const saved = localStorage.getItem('rhythm-os-audio-offset');
    return saved ? parseInt(saved) : 0;
  }

  _getSavedVolume() {
    const saved = localStorage.getItem('rhythm-os-volume');
    return saved ? parseInt(saved) : 70;
  }

  _getSavedScrollSpeed() {
    const saved = localStorage.getItem('rhythm-os-scroll-speed');
    return saved ? parseInt(saved) : 400;
  }

  destroy() {
    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler);
    }
  }
}
