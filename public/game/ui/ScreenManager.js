import EventBus from '../core/EventBus.js';

export default class ScreenManager {
  constructor(container) {
    this.container = container;
    this._screens = {};
    this._current = null;
    this._currentName = '';
    this._transitioning = false;
    this._transitionOverlay = null; // reusable overlay element
  }
  register(name, factory) { this._screens[name] = factory; }

  show(name, data = {}) {
    if (this._transitioning || name === this._currentName) return;
    const from = this._currentName;
    this._transitioning = true;
    const factory = this._screens[name];
    if (!factory) { console.error(`Screen "${name}" not registered`); this._transitioning = false; return; }

    const destroyCurrent = () => {
      if (this._current) {
        if (this._current.destroy) this._current.destroy();
        this.container.innerHTML = '';
        this._current = null;
        // Disable pointer events when no interactive screen is shown
        this.container.style.pointerEvents = 'none';
      }
    };

    if (this._current) {
      // Exit transition: 3D perspective fly-out
      this._3DExit(() => {
        destroyCurrent();
        this._3DEnter(name, factory, data, from);
      });
    } else {
      destroyCurrent();
      this._3DEnter(name, factory, data, from);
    }
  }

  /** 3D exit: current screen flies back and fades with perspective */
  _3DExit(callback) {
    this.container.style.perspective = '1200px';
    this.container.style.transformStyle = 'preserve-3d';
    this.container.classList.add('screen-3d-exit');

    setTimeout(() => {
      this.container.classList.remove('screen-3d-exit');
      this.container.style.perspective = '';
      this.container.style.transformStyle = '';
      callback();
    }, 280);
  }

  /** 3D enter: new screen flies in from front with perspective */
  _3DEnter(name, factory, data, from) {
    const screen = factory(data);
    this._current = screen;
    this._currentName = name;

    if (screen.build) {
      const el = screen.build();
      if (typeof el === 'string') this.container.innerHTML = el;
      else { this.container.innerHTML = ''; this.container.appendChild(el); }
    }
    if (screen.init) screen.init(data);

    // 3D entrance animation
    this.container.style.perspective = '1200px';
    this.container.style.transformStyle = 'preserve-3d';
    this.container.classList.add('screen-3d-enter');

    setTimeout(() => {
      this.container.classList.remove('screen-3d-enter');
      this.container.style.perspective = '';
      this.container.style.transformStyle = '';
      this._transitioning = false;
    }, 380);

    // Enable pointer events for interactive screens (menus, settings)
    // The 'game' screen factory clears innerHTML and doesn't need clicks
    this.container.style.pointerEvents = name === 'game' ? 'none' : 'auto';

    EventBus.emit('screen:change', { from, to: name });
  }

  get currentName() { return this._currentName; }
  get current() { return this._current; }

  /** Show a screen as an overlay on top of the current screen */
  _showOverlay(screen) {
    if (screen.build) {
      const el = screen.build();
      if (typeof el === 'string') {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = el;
        const overlayEl = wrapper.firstElementChild;
        if (overlayEl) this.container.appendChild(overlayEl);
      } else {
        this.container.appendChild(el);
      }
    }
    if (screen.init) screen.init();
    this._overlay = screen;
  }

  /** Close the current overlay and clean it up */
  _closeOverlay() {
    if (this._overlay) {
      if (this._overlay.destroy) this._overlay.destroy();
      this._overlay = null;
    }
    const overlay = document.getElementById('settings-overlay');
    if (overlay) overlay.remove();
  }
}
