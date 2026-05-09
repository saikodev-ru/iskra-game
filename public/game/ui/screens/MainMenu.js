import ZZZTheme from '../../theme/ZZZTheme.js';
import EventBus from '../../core/EventBus.js';

export default class MainMenu {
  constructor({ audio, screens }) {
    this.audio = audio;
    this.screens = screens;
    this._keyHandler = null;
    this._animFrame = null;
    this._menuMusicSource = null;
    this._menuMusicGain = null;
    this._triangles = [];
    this._triangleCanvas = null;
    this._triangleCtx = null;
    this._destroyed = false;
    this._logoScale = 1;
    this._logoTargetScale = 1;
    this._logoRotation = 0;
    this._beatPulse = 0;
  }

  build() {
    return `
      <div id="mm-root" style="display:flex;flex-direction:column;height:100%;position:relative;overflow:hidden;background:#000;">
        <!-- Triangles background canvas -->
        <canvas id="mm-triangles" style="position:absolute;inset:0;width:100%;height:100%;z-index:0;"></canvas>

        <!-- Dark vignette overlay -->
        <div style="position:absolute;inset:0;z-index:1;pointer-events:none;background:radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,0.6) 100%);"></div>

        <!-- Main content -->
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;z-index:2;">

          <!-- Logo -->
          <div id="mm-logo-wrap" style="position:relative;margin-bottom:40px;">
            <div id="mm-logo-ring" class="mm-logo-ring">
              <div id="mm-logo-inner" class="mm-logo-inner">
                <span class="mm-logo-text">iskra</span>
              </div>
            </div>
          </div>

          <!-- Menu buttons bar -->
          <div class="mm-menu-bar">
            <button class="mm-menu-btn mm-menu-btn--play" data-action="play">
              <span class="mm-menu-btn-icon">▶</span>
              <span class="mm-menu-btn-label">Play</span>
            </button>
            <button class="mm-menu-btn mm-menu-btn--settings" data-action="settings">
              <span class="mm-menu-btn-icon">⚙</span>
              <span class="mm-menu-btn-label">Settings</span>
            </button>
            <button class="mm-menu-btn mm-menu-btn--exit" data-action="exit">
              <span class="mm-menu-btn-icon">✕</span>
              <span class="mm-menu-btn-label">Exit</span>
            </button>
          </div>
        </div>

        <!-- Bottom bar -->
        <div style="position:relative;z-index:2;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="mm-version">iskra</span>
            <span style="color:rgba(255,255,255,0.12);">·</span>
            <span class="mm-version-sub">v0.5.0</span>
          </div>
          <div id="mm-audio-indicator" class="mm-audio-indicator">
            <div class="mm-audio-bar"></div>
            <div class="mm-audio-bar"></div>
            <div class="mm-audio-bar"></div>
            <div class="mm-audio-bar"></div>
          </div>
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
        if (action === 'play') this.screens.show('song-select');
        else if (action === 'settings') EventBus.emit('settings:open-overlay');
        else if (action === 'exit') {
          // Go blank — browser games can't really "exit"
          document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#000;color:rgba(255,255,255,0.3);font-family:sans-serif;font-size:14px;">Thanks for playing iskra!</div>';
        }
      });
    });

    // Keyboard shortcut
    this._keyHandler = (e) => {
      if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); this.screens.show('song-select'); }
    };
    window.addEventListener('keydown', this._keyHandler);

    // Start triangles animation
    this._initTriangles();

    // Start menu music
    this._startMenuMusic();

    // Logo beat pulse animation
    this._startLogoAnimation();
  }

  /** Initialize the osu! Triangles-style animated background */
  _initTriangles() {
    this._triangleCanvas = document.getElementById('mm-triangles');
    if (!this._triangleCanvas) return;

    const dpr = window.devicePixelRatio || 1;
    const w = this._triangleCanvas.clientWidth;
    const h = this._triangleCanvas.clientHeight;
    this._triangleCanvas.width = w * dpr;
    this._triangleCanvas.height = h * dpr;
    this._triangleCtx = this._triangleCanvas.getContext('2d');
    this._triangleCtx.scale(dpr, dpr);
    this._canvasW = w;
    this._canvasH = h;

    // Create triangles
    this._triangles = [];
    const count = Math.min(50, Math.floor(w * h / 15000));
    for (let i = 0; i < count; i++) {
      this._triangles.push(this._createTriangle());
    }

    // Start animation loop
    const animate = () => {
      if (this._destroyed) return;
      this._drawTriangles();
      this._animFrame = requestAnimationFrame(animate);
    };
    animate();

    // Handle resize
    this._resizeHandler = () => {
      if (!this._triangleCanvas) return;
      const dpr = window.devicePixelRatio || 1;
      const w = this._triangleCanvas.clientWidth;
      const h = this._triangleCanvas.clientHeight;
      this._triangleCanvas.width = w * dpr;
      this._triangleCanvas.height = h * dpr;
      this._triangleCtx = this._triangleCanvas.getContext('2d');
      this._triangleCtx.scale(dpr, dpr);
      this._canvasW = w;
      this._canvasH = h;
    };
    window.addEventListener('resize', this._resizeHandler);
  }

  _createTriangle() {
    const size = 20 + Math.random() * 60;
    const depth = Math.random(); // 0 = far (slow, dim), 1 = near (fast, bright)
    return {
      x: Math.random() * (this._canvasW || window.innerWidth),
      y: Math.random() * (this._canvasH || window.innerHeight),
      size,
      depth,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.01,
      vy: -(0.15 + depth * 0.4), // float upward
      vx: (Math.random() - 0.5) * 0.3,
      opacity: 0.03 + depth * 0.08,
      hue: 70 + Math.random() * 30, // lime-green hue range
    };
  }

  _drawTriangles() {
    const ctx = this._triangleCtx;
    if (!ctx) return;
    const w = this._canvasW;
    const h = this._canvasH;

    ctx.clearRect(0, 0, w, h);

    // Beat pulse from audio
    const beatScale = 1 + this._beatPulse * 0.02;

    for (const tri of this._triangles) {
      // Update position
      tri.x += tri.vx;
      tri.y += tri.vy;
      tri.rotation += tri.rotationSpeed;

      // Wrap around
      if (tri.y < -tri.size * 2) {
        tri.y = h + tri.size;
        tri.x = Math.random() * w;
      }
      if (tri.x < -tri.size * 2) tri.x = w + tri.size;
      if (tri.x > w + tri.size * 2) tri.x = -tri.size;

      // Draw triangle
      ctx.save();
      ctx.translate(tri.x, tri.y);
      ctx.rotate(tri.rotation);
      ctx.scale(beatScale, beatScale);

      const s = tri.size;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.6);
      ctx.lineTo(-s * 0.5, s * 0.4);
      ctx.lineTo(s * 0.5, s * 0.4);
      ctx.closePath();

      const alpha = tri.opacity * beatScale;
      ctx.strokeStyle = `hsla(${tri.hue}, 100%, 60%, ${alpha})`;
      ctx.lineWidth = 1 + tri.depth * 1.5;
      ctx.stroke();

      // Very subtle fill for close triangles
      if (tri.depth > 0.6) {
        ctx.fillStyle = `hsla(${tri.hue}, 100%, 60%, ${alpha * 0.15})`;
        ctx.fill();
      }

      ctx.restore();
    }
  }

  /** Start the logo pulsing animation */
  _startLogoAnimation() {
    const logoRing = document.getElementById('mm-logo-ring');
    const logoInner = document.getElementById('mm-logo-inner');
    if (!logoRing) return;

    let lastTime = performance.now();
    const tick = (now) => {
      if (this._destroyed) return;
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      // Smooth logo scale
      this._logoScale += (this._logoTargetScale - this._logoScale) * Math.min(1, dt * 8);

      // Slow continuous rotation
      this._logoRotation += dt * 8; // degrees per second

      // Decay beat pulse
      this._beatPulse *= Math.pow(0.9, dt * 60);

      if (logoRing) {
        logoRing.style.transform = `rotate(${this._logoRotation}deg) scale(${this._logoScale + this._beatPulse * 0.05})`;
      }

      this._animFrame = requestAnimationFrame(tick);
    };
    this._animFrame = requestAnimationFrame(tick);
  }

  /** Play menu theme music */
  async _startMenuMusic() {
    try {
      this.audio._ensureCtx();
      const ctx = this.audio.ctx;
      if (!ctx) return;

      // Fetch and decode the menu theme
      const response = await fetch('/audio/menu-theme.mp3');
      if (!response.ok) return;
      const arrayBuffer = await response.arrayBuffer();
      const buffer = await ctx.decodeAudioData(arrayBuffer);

      if (this._destroyed) return;

      // Create gain node for menu music volume
      this._menuMusicGain = ctx.createGain();
      this._menuMusicGain.gain.value = 0;
      this._menuMusicGain.connect(this.audio._gain);

      // Create source
      this._menuMusicSource = ctx.createBufferSource();
      this._menuMusicSource.buffer = buffer;
      this._menuMusicSource.loop = true;
      this._menuMusicSource.connect(this._menuMusicGain);

      // Fade in
      this._menuMusicSource.start(0);
      this._menuMusicGain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.5);

      // Beat detection for logo pulse — simple bass frequency analysis
      this._startBeatDetection();
    } catch (err) {
      console.warn('[MainMenu] Could not play menu music:', err);
    }
  }

  /** Simple beat detection from audio analyser for logo pulsing */
  _startBeatDetection() {
    if (!this.audio._analyser) return;

    const analyser = this.audio._analyser;
    const freqData = new Uint8Array(analyser.frequencyBinCount);

    let prevBass = 0;
    const detect = () => {
      if (this._destroyed) return;
      analyser.getByteFrequencyData(freqData);

      // Average bass frequencies (0-10 bins, roughly 0-860Hz)
      let bass = 0;
      for (let i = 0; i < 10; i++) bass += freqData[i];
      bass /= 10;

      // Detect beat onset
      const delta = bass - prevBass;
      if (delta > 15) {
        this._beatPulse = Math.min(1, this._beatPulse + 0.5);
      }
      prevBass = bass * 0.7 + prevBass * 0.3; // smooth

      this._beatDetectFrame = requestAnimationFrame(detect);
    };
    this._beatDetectFrame = requestAnimationFrame(detect);
  }

  /** Stop menu music */
  _stopMenuMusic() {
    try {
      if (this._menuMusicGain && this.audio.ctx) {
        this._menuMusicGain.gain.linearRampToValueAtTime(0, this.audio.ctx.currentTime + 0.5);
        const source = this._menuMusicSource;
        const gain = this._menuMusicGain;
        setTimeout(() => {
          try { source?.stop(); } catch (_) {}
          try { gain?.disconnect(); } catch (_) {}
        }, 600);
      }
    } catch (_) {}
    this._menuMusicSource = null;
    this._menuMusicGain = null;
  }

  destroy() {
    this._destroyed = true;

    if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler);
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
    if (this._beatDetectFrame) cancelAnimationFrame(this._beatDetectFrame);
    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);

    this._stopMenuMusic();
  }
}
