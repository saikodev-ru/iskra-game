import ColorExtractor, { DEFAULT_COLORS } from './ColorExtractor.js';

// Default lane colors — will be overridden by background-extracted colors

export default class NoteRenderer {
  static LANE_COLORS = [...DEFAULT_COLORS];

  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scrollSpeed = 400;
    this.noteHeight = 32;
    this._resScale = 1.0;
    this._effectsPool = new Array(64);
    for (let i = 0; i < 64; i++) {
      this._effectsPool[i] = {
        active: false, x: 0, y: 0, radius: 0, maxRadius: 0,
        opacity: 0, color: '', age: 0, type: 'ring', particles: [],
        sparks: [], rays: []
      };
    }
    this._effectIndex = 0;

    // Pre-rendered glow sprites for performant particle rendering
    this._glowSprites = new Map(); // color -> canvas
    this._whiteGlow = null;
    this._buildGlowSprites();

    this._bgImage = null;
    this._bgLoadAttempted = false;
    this.safeArea = { x: 0, y: 0, w: 0, h: 0 };
    this._safeAreaExplicit = false;
    this._health = 100;
    this._displayHealth = 100;
    this._laneGlows = new Map();
    this._holdNoteDebugLogged = false;
    this._graphicsPreset = 'disco';
    this._bgDim = parseInt(localStorage.getItem('rhythm-os-bg-dim') || '0');

    // Hold spark effects — flat arrays for fast iteration
    this._holdSparkPool = [];
    this._holdSparkCount = 0;

    // Optimization: cached static background
    this._bgCacheCanvas = null;
    this._bgCacheLaneCount = -1;
    this._bgCacheWidth = 0;
    this._bgCacheHeight = 0;
    this._bgCacheBgImage = null;
    this._bgCacheBgDim = -1;

    // Miss flash effects — pool for red flashes at judge line on miss
    this._missFlashPool = [];
    this._missFlashCount = 0;

    // Kiai time state — burning judge line + beat-synced effects
    this._kiaiIntensity = 0;       // 0–1, set each frame from BeatMap.getKiaiIntensity()
    this._kiaiBeatPulse = 0;       // 0–1, spikes to 1.0 on each beat during kiai, decays
    this._kiaiSmoothPulse = 0;     // smoothed version for smooth pulsing
    this._kiaiFlashAlpha = 0;      // white flash overlay alpha, spikes on beat, decays fast
    this._kiaiBorderGlow = 0;      // border glow intensity, smoothed pulse
    this._kiaiFlamePhase = 0;      // noise phase for flame flickering

    this.resize();
  }

  /* ── Public API ─────────────────────────────────────────────────── */

  setSafeArea(x, y, w, h) {
    this.safeArea = { x, y, w, h };
    this._safeAreaExplicit = true;
  }

  setResScale(scale) {
    this._resScale = Math.max(0.25, Math.min(2.0, scale));
  }

  setGraphicsPreset(preset) {
    this._graphicsPreset = preset;
  }

  _gfx() {
    if (this._graphicsPreset === 'low') return 0;
    if (this._graphicsPreset === 'standard') return 0.5;
    return 1;
  }

  setHealth(pct) {
    this._health = Math.max(0, Math.min(100, pct));
  }

  setBackgroundImage(url) {
    if (!url || this._bgLoadAttempted) return;
    this._bgLoadAttempted = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this._bgImage = img;
      this.invalidateBackgroundCache();
      // Extract accent colors from background and update lane colors
      const newColors = ColorExtractor.extract(img);
      // Extend to 8 lanes (repeat pattern)
      const extended = [];
      while (extended.length < 8) extended.push(...newColors);
      NoteRenderer.setLaneColors(extended);
      // Rebuild glow sprites for new colors
      this._rebuildLaneGlowSprites();
    };
    img.src = url;
  }

  clearBackground() {
    this._bgImage = null;
    this._bgLoadAttempted = false;
    // Reset to default colors
    const defaults = [...DEFAULT_COLORS, ...DEFAULT_COLORS];
    NoteRenderer.setLaneColors(defaults);
    this._rebuildLaneGlowSprites();
    this.invalidateBackgroundCache();
  }

  /** Pre-render glow sprites — avoids per-frame shadowBlur */
  _buildGlowSprites() {
    // White glow — used for center flash and spark dots
    const sz = 64;
    const c = document.createElement('canvas');
    c.width = sz; c.height = sz;
    const cx = c.getContext('2d');
    const g = cx.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.15, 'rgba(255,255,255,0.7)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.15)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = g;
    cx.fillRect(0, 0, sz, sz);
    this._whiteGlow = c;

    // Per-lane-color glow sprites
    const laneColors = NoteRenderer.LANE_COLORS;
    for (const color of laneColors) {
      const gc = document.createElement('canvas');
      gc.width = sz; gc.height = sz;
      const gx = gc.getContext('2d');
      const rgb = this._hexToRgb(color);
      const gg = gx.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz / 2);
      gg.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},1)`);
      gg.addColorStop(0.2, `rgba(${rgb.r},${rgb.g},${rgb.b},0.6)`);
      gg.addColorStop(0.5, `rgba(${rgb.r},${rgb.g},${rgb.b},0.12)`);
      gg.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
      gx.fillStyle = gg;
      gx.fillRect(0, 0, sz, sz);
      this._glowSprites.set(color, gc);
    }
  }

  /** Rebuild glow sprites when lane colors change */
  static _rebuildGlowSpritesForColors(colors) {
    // This rebuilds for the next instance that calls _buildGlowSprites
    // Existing instances need their sprites rebuilt too
  }

  /** Rebuild glow sprites for the current lane colors */
  _rebuildLaneGlowSprites() {
    const sz = 64;
    for (const color of NoteRenderer.LANE_COLORS) {
      if (this._glowSprites.has(color)) continue; // already cached
      const gc = document.createElement('canvas');
      gc.width = sz; gc.height = sz;
      const gx = gc.getContext('2d');
      const rgb = this._hexToRgb(color);
      const gg = gx.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz / 2);
      gg.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},1)`);
      gg.addColorStop(0.2, `rgba(${rgb.r},${rgb.g},${rgb.b},0.6)`);
      gg.addColorStop(0.5, `rgba(${rgb.r},${rgb.g},${rgb.b},0.12)`);
      gg.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
      gx.fillStyle = gg;
      gx.fillRect(0, 0, sz, sz);
      this._glowSprites.set(color, gc);
    }
  }

  addEffect(x, y, color, type = 'ring') {
    if (this._graphicsPreset === 'low') return;
    const effect = this._effectsPool[this._effectIndex % 64];
    effect.active = true;
    effect.x = x; effect.y = y;
    effect.radius = 5;
    effect.maxRadius = type === 'perfect' ? 80 : type === 'great' ? 60 : 35;
    effect.opacity = 1; effect.color = color; effect.age = 0; effect.type = type;
    effect.dots = []; // flat: [angle, speed, size, life, ...]

    if (type === 'perfect' || type === 'great') {
      // Pre-compute dot params as flat array for zero-alloc rendering
      const n = type === 'perfect' ? 10 : 6;
      for (let i = 0; i < n; i++) {
        effect.dots.push(
          (Math.PI * 2 / n) * i + (Math.random() - 0.5) * 0.6,
          80 + Math.random() * 70,
          2.5 + Math.random() * 2,
          0.35 + Math.random() * 0.2
        );
      }
    }
    this._effectIndex++;
  }

  /** Add a miss flash at the judge line */
  addMissFlash(lane, laneCount) {
    if (this._missFlashCount >= 8) return;
    const geom = this._getLaneGeometry(lane, this._getJudgeLineY(), laneCount);
    // Each flash: [x, y, width, life, maxLife] — 5 elements
    this._missFlashPool.push(
      geom.centerX, geom.x, geom.width,
      0.4, 0.4
    );
    this._missFlashCount++;
  }

  /** Get pre-rendered glow sprite for a color */
  _getGlowSprite(color) {
    return this._glowSprites.get(color) || this._whiteGlow;
  }

  /** Add hold-note spark — uses flat pool for performance */
  addHoldSpark(x, y, color) {
    if (this._graphicsPreset === 'low') return;
    if (this._holdSparkCount >= 12) return; // hard cap (perf)
    const rgb = this._hexToRgb(color);
    // 1-2 sparks per call
    const n = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const life = 0.25 + Math.random() * 0.35;
      this._holdSparkPool.push(
        x + (Math.random() - 0.5) * 18,
        y + Math.random() * 4,
        (Math.random() - 0.5) * 25,
        -(50 + Math.random() * 70),
        life, life, // life, maxLife
        1.5 + Math.random() * 2, // size
        rgb.r, rgb.g, rgb.b
      );
      this._holdSparkCount++;
    }
  }

  addLaneGlow(lane, laneCount, color) {
    if (this._graphicsPreset === 'low') return;
    this._laneGlows.set(lane, {
      color,
      intensity: 1.0,
      decay: 0.05
    });
  }

  clearLaneGlows() {
    this._laneGlows.clear();
    this._holdSparkPool.length = 0;
    this._holdSparkCount = 0;
  }

  flashLane() { /* no-op */ }

  /** Set kiai intensity (0–1), called each frame from the game loop */
  setKiaiIntensity(intensity) {
    this._kiaiIntensity = Math.max(0, Math.min(1, intensity));
  }

  /** Trigger a beat pulse during kiai time (called from beat:pulse handler) */
  triggerKiaiBeatPulse(intensity) {
    this._kiaiBeatPulse = Math.max(this._kiaiBeatPulse, intensity);
  }

  getLaneHitPosition(lane, laneCount) {
    const sa = this.safeArea;
    const judgeLineY = this._getJudgeLineY();
    const geom = this._getLaneGeometry(lane, judgeLineY, laneCount);
    return { x: geom.centerX, y: judgeLineY };
  }

  resize() {
    const styleW = window.innerWidth;
    const styleH = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    const pixelW = Math.round(styleW * dpr * this._resScale);
    const pixelH = Math.round(styleH * dpr * this._resScale);
    this.canvas.width = pixelW;
    this.canvas.height = pixelH;
    this.canvas.style.width = styleW + 'px';
    this.canvas.style.height = styleH + 'px';
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr * this._resScale, dpr * this._resScale);
    this.w = styleW;
    this.h = styleH;
    if (!this._safeAreaExplicit) {
      this.safeArea = { x: 0, y: 0, w: this.w, h: this.h };
    }
    this.invalidateBackgroundCache();
  }

  clear() {
    this.ctx.clearRect(0, 0, this.w, this.h);
    this._drawBlackBars();
  }

  render({ notes, currentTime, laneCount, delta = 0.016, bpm = 120, bpmChanges = null }) {
    if (!laneCount || laneCount < 1) return; // guard against invalid lane count
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    this._frameDelta = delta;
    this._currentBpm = bpm;
    this._bpmChanges = bpmChanges;

    // Smooth HP animation
    const healthDiff = this._health - this._displayHealth;
    if (Math.abs(healthDiff) > 0.1) {
      this._displayHealth += healthDiff * Math.min(1, delta * 7);
    } else {
      this._displayHealth = this._health;
    }

    this._drawBackgroundCached(laneCount);
    this._drawKiaiEffect(delta, laneCount);
    this._drawBeatLines(currentTime, laneCount);
    this._drawMissFlashes(delta);
    this._drawEffects();
    this._drawHoldSparks();
    this._drawLaneGlows(laneCount);
    this._drawNotes(notes, currentTime, laneCount);
    this._drawJudgeLine(laneCount);
    this._drawHPBar(laneCount);
    this._drawRedVignette();
    this._drawBlackBars();
  }

  /** Draw background using cached offscreen canvas when possible */
  _drawBackgroundCached(laneCount) {
    const needsRebuild = !this._bgCacheCanvas
      || this._bgCacheLaneCount !== laneCount
      || this._bgCacheWidth !== this.w
      || this._bgCacheHeight !== this.h
      || this._bgCacheBgImage !== this._bgImage
      || this._bgCacheBgDim !== this._bgDim;

    if (needsRebuild) {
      this._rebuildBackgroundCache(laneCount);
    }

    if (this._bgCacheCanvas) {
      this.ctx.drawImage(this._bgCacheCanvas, 0, 0, this.w, this.h);
    }
  }

  /** Rebuild the offscreen background cache — GLASS PLAYFIELD with glowing walls */
  _rebuildBackgroundCache(laneCount) {
    const dpr = window.devicePixelRatio || 1;
    const pixelW = Math.round(this.w * dpr * this._resScale);
    const pixelH = Math.round(this.h * dpr * this._resScale);

    if (!this._bgCacheCanvas) {
      this._bgCacheCanvas = document.createElement('canvas');
    }
    this._bgCacheCanvas.width = pixelW;
    this._bgCacheCanvas.height = pixelH;
    const cctx = this._bgCacheCanvas.getContext('2d');
    cctx.setTransform(1, 0, 0, 1, 0, 0);
    cctx.scale(dpr * this._resScale, dpr * this._resScale);

    // Draw background image (very faint through glass)
    if (this._bgImage) {
      cctx.save();
      cctx.globalAlpha = 0.04;
      const ia = this._bgImage.width / this._bgImage.height;
      const ca = this.w / this.h;
      let dw, dh, dx, dy;
      if (ca > ia) { dw = this.w; dh = this.w / ia; dx = 0; dy = (this.h - dh) / 2; }
      else { dh = this.h; dw = this.h * ia; dx = (this.w - dw) / 2; dy = 0; }
      cctx.drawImage(this._bgImage, dx, dy, dw, dh);
      cctx.restore();
    }

    // Background dimming overlay
    if (this._bgDim > 0) {
      cctx.save();
      cctx.globalAlpha = Math.min(1, this._bgDim / 100);
      cctx.fillStyle = '#000000';
      cctx.fillRect(0, 0, this.w, this.h);
      cctx.restore();
    }

    // ── Glass playfield with translucent lanes ──
    const topY = this._getTopY();
    const judgeLineY = this._getJudgeLineY();
    const bottomY = this._getBottomY();
    const sa = this.safeArea;
    const cx = sa.x + sa.w / 2;
    const fullPw = sa.w * 0.48;

    // Lane geometry at key heights
    const leftTop = this._getLaneGeometry(0, topY, laneCount);
    const rightTop = this._getLaneGeometry(laneCount, topY, laneCount);
    const leftJudge = this._getLaneGeometry(0, judgeLineY, laneCount);
    const rightJudge = this._getLaneGeometry(laneCount, judgeLineY, laneCount);
    const leftBottom = this._getLaneGeometry(0, bottomY, laneCount);
    const rightBottom = this._getLaneGeometry(laneCount, bottomY, laneCount);

    // ── Lane fills — solid dark ──
    for (let i = 0; i < laneCount; i++) {
      const topGeom = this._getLaneGeometry(i, topY, laneCount);
      const judgeGeom = this._getLaneGeometry(i, judgeLineY, laneCount);
      const bottomGeom = this._getLaneGeometry(i, bottomY, laneCount);

      // Above judge line: dark trapezoid
      cctx.beginPath();
      cctx.moveTo(topGeom.x, topY);
      cctx.lineTo(topGeom.x + topGeom.width, topY);
      cctx.lineTo(judgeGeom.x + judgeGeom.width, judgeLineY);
      cctx.lineTo(judgeGeom.x, judgeLineY);
      cctx.closePath();
      cctx.fillStyle = i % 2 === 0 ? 'rgba(12,12,14,1)' : 'rgba(16,16,18,1)';
      cctx.fill();

      // Subtle glass highlight at 30% height
      cctx.save();
      cctx.beginPath();
      cctx.moveTo(topGeom.x, topY);
      cctx.lineTo(topGeom.x + topGeom.width, topY);
      cctx.lineTo(judgeGeom.x + judgeGeom.width, judgeLineY);
      cctx.lineTo(judgeGeom.x, judgeLineY);
      cctx.closePath();
      cctx.clip();
      const highlightY = topY + (judgeLineY - topY) * 0.3;
      const hlGrad = cctx.createLinearGradient(0, highlightY - 6, 0, highlightY + 6);
      hlGrad.addColorStop(0, 'rgba(255,255,255,0)');
      hlGrad.addColorStop(0.5, 'rgba(255,255,255,0.025)');
      hlGrad.addColorStop(1, 'rgba(255,255,255,0)');
      cctx.fillStyle = hlGrad;
      cctx.fillRect(topGeom.x - 2, highlightY - 6, topGeom.width + 4, 12);
      cctx.restore();

      // Below judge line: same solid dark as above (unified style)
      cctx.beginPath();
      cctx.moveTo(judgeGeom.x, judgeLineY);
      cctx.lineTo(judgeGeom.x + judgeGeom.width, judgeLineY);
      cctx.lineTo(bottomGeom.x + bottomGeom.width, bottomY);
      cctx.lineTo(bottomGeom.x, bottomY);
      cctx.closePath();
      cctx.fillStyle = i % 2 === 0 ? 'rgba(10,10,12,1)' : 'rgba(14,14,16,1)';
      cctx.fill();

      // Subtle fade-to-black at the very bottom edge for smooth edge blending
      cctx.save();
      cctx.beginPath();
      cctx.moveTo(judgeGeom.x, judgeLineY);
      cctx.lineTo(judgeGeom.x + judgeGeom.width, judgeLineY);
      cctx.lineTo(bottomGeom.x + bottomGeom.width, bottomY);
      cctx.lineTo(bottomGeom.x, bottomY);
      cctx.closePath();
      cctx.clip();
      const fadeH = (bottomY - judgeLineY) * 0.35;
      const bottomFadeGrad = cctx.createLinearGradient(0, bottomY - fadeH, 0, bottomY);
      bottomFadeGrad.addColorStop(0, 'rgba(0,0,0,0)');
      bottomFadeGrad.addColorStop(1, 'rgba(0,0,0,0.6)');
      cctx.fillStyle = bottomFadeGrad;
      cctx.fillRect(bottomGeom.x - 2, bottomY - fadeH, bottomGeom.width + 4, fadeH);
      cctx.restore();
    }

    // ── Light gray walls (left + right edges) ──
    // Left wall
    cctx.save();
    const lwGrad = cctx.createLinearGradient(0, topY, 0, judgeLineY);
    lwGrad.addColorStop(0, 'rgba(180,180,185,0.04)');
    lwGrad.addColorStop(0.4, 'rgba(180,180,185,0.18)');
    lwGrad.addColorStop(0.8, 'rgba(200,200,205,0.32)');
    lwGrad.addColorStop(1, 'rgba(180,180,185,0.12)');
    cctx.strokeStyle = lwGrad;
    cctx.lineWidth = 1.5;
    cctx.beginPath();
    cctx.moveTo(leftTop.x, topY);
    cctx.lineTo(leftJudge.x, judgeLineY);
    cctx.stroke();
    cctx.restore();

    // Right wall
    cctx.save();
    const rwGrad = cctx.createLinearGradient(0, topY, 0, judgeLineY);
    rwGrad.addColorStop(0, 'rgba(180,180,185,0.04)');
    rwGrad.addColorStop(0.4, 'rgba(180,180,185,0.18)');
    rwGrad.addColorStop(0.8, 'rgba(200,200,205,0.32)');
    rwGrad.addColorStop(1, 'rgba(180,180,185,0.12)');
    cctx.strokeStyle = rwGrad;
    cctx.lineWidth = 1.5;
    cctx.beginPath();
    cctx.moveTo(rightTop.x, topY);
    cctx.lineTo(rightJudge.x, judgeLineY);
    cctx.stroke();
    cctx.restore();

    // Below-judge walls (same gradient style as above)
    cctx.save();
    const bwGrad = cctx.createLinearGradient(0, judgeLineY, 0, bottomY);
    bwGrad.addColorStop(0, 'rgba(180,180,185,0.12)');
    bwGrad.addColorStop(0.5, 'rgba(180,180,185,0.06)');
    bwGrad.addColorStop(1, 'rgba(180,180,185,0.01)');
    cctx.strokeStyle = bwGrad;
    cctx.lineWidth = 1.5;
    cctx.beginPath();
    cctx.moveTo(leftJudge.x, judgeLineY);
    cctx.lineTo(leftBottom.x, bottomY);
    cctx.stroke();
    cctx.beginPath();
    cctx.moveTo(rightJudge.x, judgeLineY);
    cctx.lineTo(rightBottom.x, bottomY);
    cctx.stroke();
    cctx.restore();

    // ── Lane dividers — subtle gray lines ──
    for (let i = 1; i < laneCount; i++) {
      const topG = this._getLaneGeometry(i, topY, laneCount);
      const judgeG = this._getLaneGeometry(i, judgeLineY, laneCount);
      const bottomG = this._getLaneGeometry(i, bottomY, laneCount);

      // Above judge line
      cctx.save();
      const divGrad = cctx.createLinearGradient(0, topY, 0, judgeLineY);
      divGrad.addColorStop(0, 'rgba(255,255,255,0.01)');
      divGrad.addColorStop(0.6, 'rgba(255,255,255,0.04)');
      divGrad.addColorStop(0.9, 'rgba(255,255,255,0.06)');
      divGrad.addColorStop(1, 'rgba(255,255,255,0.02)');
      cctx.strokeStyle = divGrad;
      cctx.lineWidth = 0.5;
      cctx.beginPath();
      cctx.moveTo(topG.x, topY);
      cctx.lineTo(judgeG.x, judgeLineY);
      cctx.stroke();
      cctx.restore();

      // Below judge line (same subtle style as above)
      cctx.save();
      const belowDivGrad = cctx.createLinearGradient(0, judgeLineY, 0, bottomY);
      belowDivGrad.addColorStop(0, 'rgba(255,255,255,0.06)');
      belowDivGrad.addColorStop(0.5, 'rgba(255,255,255,0.04)');
      belowDivGrad.addColorStop(1, 'rgba(255,255,255,0.01)');
      cctx.strokeStyle = belowDivGrad;
      cctx.lineWidth = 0.5;
      cctx.beginPath();
      cctx.moveTo(judgeG.x, judgeLineY);
      cctx.lineTo(bottomG.x, bottomY);
      cctx.stroke();
      cctx.restore();
    }

    // ── Depth fog at top ──
    const fogGrad = cctx.createLinearGradient(0, topY, 0, topY + (judgeLineY - topY) * 0.25);
    fogGrad.addColorStop(0, 'rgba(0,0,0,0.45)');
    fogGrad.addColorStop(1, 'rgba(0,0,0,0)');
    cctx.fillStyle = fogGrad;
    cctx.fillRect(leftTop.x - 8, topY, rightTop.x - leftTop.x + 16, (judgeLineY - topY) * 0.25);

    // ── White glow strip at judge line ──
    const glowH = 40;
    cctx.save();
    const jlGlow = cctx.createLinearGradient(0, judgeLineY - glowH / 2, 0, judgeLineY + glowH / 2);
    jlGlow.addColorStop(0, 'rgba(255,255,255,0)');
    jlGlow.addColorStop(0.35, 'rgba(255,255,255,0.05)');
    jlGlow.addColorStop(0.5, 'rgba(255,255,255,0.10)');
    jlGlow.addColorStop(0.65, 'rgba(255,255,255,0.05)');
    jlGlow.addColorStop(1, 'rgba(255,255,255,0)');
    cctx.fillStyle = jlGlow;
    cctx.fillRect(leftJudge.x - 4, judgeLineY - glowH / 2, rightJudge.x - leftJudge.x + 8, glowH);
    cctx.restore();

    // ── Glass reflection: vertical shine sweep ──
    cctx.save();
    // Clip to playfield shape
    cctx.beginPath();
    cctx.moveTo(leftTop.x, topY);
    cctx.lineTo(rightTop.x, topY);
    cctx.lineTo(rightJudge.x, judgeLineY);
    cctx.lineTo(leftJudge.x, judgeLineY);
    cctx.closePath();
    cctx.clip();
    // Diagonal shine
    const shineX = cx - fullPw * 0.15;
    const shineW = fullPw * 0.08;
    const shineGrad = cctx.createLinearGradient(shineX, 0, shineX + shineW, 0);
    shineGrad.addColorStop(0, 'rgba(255,255,255,0)');
    shineGrad.addColorStop(0.5, 'rgba(255,255,255,0.025)');
    shineGrad.addColorStop(1, 'rgba(255,255,255,0)');
    cctx.fillStyle = shineGrad;
    cctx.fillRect(shineX, topY, shineW, judgeLineY - topY);
    cctx.restore();

    // Update cache metadata
    this._bgCacheLaneCount = laneCount;
    this._bgCacheWidth = this.w;
    this._bgCacheHeight = this.h;
    this._bgCacheBgImage = this._bgImage;
    this._bgCacheBgDim = this._bgDim;
  }

  invalidateBackgroundCache() {
    this._bgCacheLaneCount = -1;
    this._bgCacheBgImage = null;
  }

  setBackgroundDim(value) {
    this._bgDim = value;
    this.invalidateBackgroundCache();
  }

  /* ── Kiai Time Effect ─────────────────────────────────────────────── */
  _drawKiaiEffect(delta, laneCount) {
    if (this._kiaiIntensity < 0.01) {
      this._kiaiBeatPulse = 0;
      this._kiaiSmoothPulse = 0;
      this._kiaiFlashAlpha = 0;
      this._kiaiBorderGlow = 0;
      return;
    }

    const ctx = this.ctx;
    const sa = this.safeArea;
    const topY = this._getTopY();
    const judgeLineY = this._getJudgeLineY();
    const bottomY = this._getBottomY();

    // Decay beat pulse
    this._kiaiBeatPulse *= Math.max(0, 1 - delta * 12);
    this._kiaiSmoothPulse += (this._kiaiBeatPulse - this._kiaiSmoothPulse) * Math.min(1, delta * 20);

    const intensity = this._kiaiIntensity;
    const pulse = this._kiaiSmoothPulse;

    // Geometry
    const leftTop = this._getLaneGeometry(0, topY, laneCount);
    const rightTop = this._getLaneGeometry(laneCount, topY, laneCount);
    const leftJudge = this._getLaneGeometry(0, judgeLineY, laneCount);
    const rightJudge = this._getLaneGeometry(laneCount, judgeLineY, laneCount);
    const leftBottom = this._getLaneGeometry(0, bottomY, laneCount);
    const rightBottom = this._getLaneGeometry(laneCount, bottomY, laneCount);

    // Flame flicker noise
    this._kiaiFlamePhase += delta * 15;
    const noise = (Math.sin(this._kiaiFlamePhase * 3.7) * 0.3 + Math.sin(this._kiaiFlamePhase * 7.1) * 0.2 + Math.sin(this._kiaiFlamePhase * 13.3) * 0.15) * 0.65 + 0.5;

    // ── Layer 1: Brighter playfield (subtle white tint overlay) ──
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(leftTop.x, topY);
    ctx.lineTo(rightTop.x, topY);
    ctx.lineTo(rightJudge.x, judgeLineY);
    ctx.lineTo(rightBottom.x, bottomY);
    ctx.lineTo(leftBottom.x, bottomY);
    ctx.lineTo(leftJudge.x, judgeLineY);
    ctx.closePath();
    ctx.clip();

    const brightnessBase = intensity * 0.06;
    const brightnessPulse = pulse * 0.08;
    ctx.fillStyle = `rgba(255,255,255,${brightnessBase + brightnessPulse})`;
    ctx.fillRect(leftTop.x - 20, topY - 20, rightTop.x - leftTop.x + 40, bottomY - topY + 40);

    // ── Layer 2: White beat flash on playfield background ──
    // Flash spikes on beat, decays fast
    if (this._kiaiBeatPulse > 0.5) {
      this._kiaiFlashAlpha = Math.min(1, this._kiaiFlashAlpha + this._kiaiBeatPulse * 0.5);
    }
    this._kiaiFlashAlpha *= Math.max(0, 1 - delta * 6);

    if (this._kiaiFlashAlpha > 0.02) {
      const flashA = this._kiaiFlashAlpha * intensity * 0.15;
      const flashGrad = ctx.createRadialGradient(
        (leftJudge.x + rightJudge.x) / 2, judgeLineY, 0,
        (leftJudge.x + rightJudge.x) / 2, judgeLineY, (bottomY - topY) * 0.8
      );
      flashGrad.addColorStop(0, `rgba(255,255,255,${flashA})`);
      flashGrad.addColorStop(0.4, `rgba(255,240,220,${flashA * 0.5})`);
      flashGrad.addColorStop(1, 'rgba(255,220,180,0)');
      ctx.fillStyle = flashGrad;
      ctx.fillRect(leftTop.x - 20, topY - 20, rightTop.x - leftTop.x + 40, bottomY - topY + 40);
    }

    ctx.restore();

    // ── Layer 3: Pulsing border glow on playfield edges ──
    this._kiaiBorderGlow += (pulse - this._kiaiBorderGlow) * Math.min(1, delta * 16);
    const borderAlpha = intensity * 0.3 + this._kiaiBorderGlow * 0.5;
    if (borderAlpha > 0.02) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Main border lines
      const borderGrad = ctx.createLinearGradient(0, topY, 0, bottomY);
      borderGrad.addColorStop(0, `rgba(255,220,140,${borderAlpha * 0.4})`);
      borderGrad.addColorStop(0.4, `rgba(255,200,100,${borderAlpha})`);
      borderGrad.addColorStop(0.7, `rgba(255,200,100,${borderAlpha * 0.8})`);
      borderGrad.addColorStop(1, `rgba(255,160,60,${borderAlpha * 0.3})`);
      ctx.strokeStyle = borderGrad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(leftTop.x, topY);
      ctx.lineTo(leftJudge.x, judgeLineY);
      ctx.lineTo(leftBottom.x, bottomY);
      ctx.lineTo(rightBottom.x, bottomY);
      ctx.lineTo(rightJudge.x, judgeLineY);
      ctx.lineTo(rightTop.x, topY);
      ctx.closePath();
      ctx.stroke();

      // Outer glow (thicker, softer)
      ctx.lineWidth = 10;
      ctx.globalAlpha = 0.25 + this._kiaiBorderGlow * 0.15;
      ctx.strokeStyle = `rgba(255,200,100,${borderAlpha})`;
      ctx.stroke();

      // Extra bloom on beat
      if (this._kiaiBorderGlow > 0.2) {
        ctx.lineWidth = 20;
        ctx.globalAlpha = this._kiaiBorderGlow * 0.12;
        ctx.strokeStyle = `rgba(255,180,80,${borderAlpha})`;
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // ── Layer 4: Burning judge line ──
    const judgeWidth = rightJudge.x - leftJudge.x;
    const judgeCX = (leftJudge.x + rightJudge.x) / 2;

    // Flame base height — flickers constantly, grows on beats
    const flameBase = 18 + noise * 14;
    const flamePulse = pulse * 20;
    const flameH = (flameBase + flamePulse) * intensity;

    // Multiple flame layers for depth
    for (let layer = 0; layer < 3; layer++) {
      const layerPhase = this._kiaiFlamePhase * (4 + layer * 2.3) + layer * 2.1;
      const layerNoise = (Math.sin(layerPhase) * 0.35 + Math.sin(layerPhase * 2.7) * 0.2 + 0.5);
      const h = flameH * (1 - layer * 0.25) * (0.6 + layerNoise * 0.5);
      const w = judgeWidth * (0.85 + layer * 0.1);
      const alpha = intensity * (0.4 - layer * 0.1);

      // Flames go upward from judge line
      const flameGrad = ctx.createLinearGradient(judgeCX, judgeLineY - h, judgeCX, judgeLineY + 4);
      const coreAlpha = alpha * (0.7 + noise * 0.3);
      const midAlpha = alpha * (0.5 + layerNoise * 0.3);
      flameGrad.addColorStop(0, `rgba(255,${80 + layer * 40},${20 + layer * 20},0)`);
      flameGrad.addColorStop(0.15, `rgba(255,${120 + layer * 30},${30 + layer * 15},${midAlpha * 0.5})`);
      flameGrad.addColorStop(0.4, `rgba(255,${180 + layer * 20},${60 + layer * 20},${coreAlpha})`);
      flameGrad.addColorStop(0.7, `rgba(255,${220 + layer * 15},${120 + layer * 30},${coreAlpha * 1.2})`);
      flameGrad.addColorStop(0.9, `rgba(255,240,180,${coreAlpha * 0.8})`);
      flameGrad.addColorStop(1, 'rgba(255,255,220,0)');

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = flameGrad;
      // Wavy flame top using quadratic curves
      const segments = 8;
      const segW = w / segments;
      ctx.beginPath();
      // Bottom edge (straight at judge line)
      ctx.moveTo(judgeCX - w / 2, judgeLineY + 2);
      ctx.lineTo(judgeCX + w / 2, judgeLineY + 2);
      // Top edge (wavy)
      for (let i = segments; i >= 0; i--) {
        const segX = judgeCX - w / 2 + i * segW;
        const waveOffset = Math.sin(layerPhase + i * 0.8) * h * 0.2;
        const py = judgeLineY - h + waveOffset;
        if (i === segments) {
          ctx.lineTo(segX, py);
        } else {
          const nextX = judgeCX - w / 2 + (i + 1) * segW;
          const nextWave = Math.sin(layerPhase + (i + 1) * 0.8) * h * 0.2;
          const nextPy = judgeLineY - h + nextWave;
          ctx.quadraticCurveTo(segX, py, (segX + nextX) / 2, (py + nextPy) / 2);
        }
      }
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }

    // Judge line hot glow (bright core at judge line position)
    const hotGlowH = 6 + pulse * 10;
    const hotGlowA = intensity * (0.6 + noise * 0.2) + pulse * 0.3;
    const hotGrad = ctx.createLinearGradient(judgeCX, judgeLineY - hotGlowH, judgeCX, judgeLineY + hotGlowH);
    hotGrad.addColorStop(0, 'rgba(255,180,60,0)');
    hotGrad.addColorStop(0.25, `rgba(255,200,80,${hotGlowA * 0.4})`);
    hotGrad.addColorStop(0.45, `rgba(255,240,160,${hotGlowA})`);
    hotGrad.addColorStop(0.5, `rgba(255,255,230,${hotGlowA * 1.1})`);
    hotGrad.addColorStop(0.55, `rgba(255,240,160,${hotGlowA})`);
    hotGrad.addColorStop(0.75, `rgba(255,200,80,${hotGlowA * 0.4})`);
    hotGrad.addColorStop(1, 'rgba(255,180,60,0)');
    ctx.save();
    ctx.fillStyle = hotGrad;
    ctx.fillRect(leftJudge.x - 8, judgeLineY - hotGlowH, judgeWidth + 16, hotGlowH * 2);

    // Broad bloom around judge line
    const bloomH = 50 + pulse * 50 + noise * 15;
    const bloomA = intensity * 0.08 + pulse * 0.06;
    const bloomGrad = ctx.createLinearGradient(judgeCX, judgeLineY - bloomH, judgeCX, judgeLineY + bloomH);
    bloomGrad.addColorStop(0, 'rgba(255,180,80,0)');
    bloomGrad.addColorStop(0.35, `rgba(255,180,80,${bloomA * 0.3})`);
    bloomGrad.addColorStop(0.5, `rgba(255,220,140,${bloomA})`);
    bloomGrad.addColorStop(0.65, `rgba(255,180,80,${bloomA * 0.3})`);
    bloomGrad.addColorStop(1, 'rgba(255,180,80,0)');
    ctx.fillStyle = bloomGrad;
    ctx.fillRect(leftJudge.x - 10, judgeLineY - bloomH, judgeWidth + 20, bloomH * 2);
    ctx.restore();
  }

  /* ── Beat Lines — horizontal timing markers per beat ── */

  _drawBeatLines(currentTime, laneCount) {
    if (!this._currentBpm) return;
    const ctx = this.ctx;
    const judgeLineY = this._getJudgeLineY();
    const topY = this._getTopY();

    const pixelsPerSecond = this.scrollSpeed;

    // How many beats fit on screen (above judge line)
    const visibleTime = (judgeLineY - topY) / pixelsPerSecond;

    // Build visible beat times using actual timing points (bpmChanges)
    const visibleBeats = this._getVisibleBeats(currentTime, visibleTime);

    for (const { time, isWholeBeat } of visibleBeats) {
      const y = this._noteY(time, currentTime, judgeLineY);

      if (y < topY - 5 || y > judgeLineY + 5) continue;
      if (y <= topY) continue;

      // Lane geometry at this Y
      const leftG = this._getLaneGeometry(0, y, laneCount);
      const rightG = this._getLaneGeometry(laneCount, y, laneCount);

      ctx.save();

      if (isWholeBeat) {
        // Whole beat — subtle white line
        const fadeIn = this._fadeIn(y, judgeLineY);
        const alpha = fadeIn * 0.10;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(leftG.x + 2, y);
        ctx.lineTo(rightG.x - 2, y);
        ctx.stroke();
      } else {
        // Half beat — very faint
        const fadeIn = this._fadeIn(y, judgeLineY);
        const alpha = fadeIn * 0.035;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(leftG.x + 4, y);
        ctx.lineTo(rightG.x - 4, y);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  /**
   * Compute visible beat times using actual BPM changes and timing offsets.
   * Returns array of { time, isWholeBeat } for beats visible on screen.
   */
  _getVisibleBeats(currentTime, visibleTime) {
    const beats = [];

    // Use bpmChanges if available, otherwise fall back to simple BPM
    const bpmChanges = this._bpmChanges;
    if (!bpmChanges || bpmChanges.length === 0) {
      // Simple mode: constant BPM, first beat at the first note's aligned time
      const bpm = this._currentBpm;
      const beatInterval = 60 / bpm;
      const firstBeatTime = Math.ceil((currentTime - visibleTime) / beatInterval) * beatInterval;
      const beatCount = Math.ceil(visibleTime / beatInterval) * 2 + 2;

      for (let i = 0; i < beatCount; i++) {
        const t = firstBeatTime + i * beatInterval / 2;
        if (t > currentTime + 0.1) break;
        beats.push({ time: t, isWholeBeat: Math.abs((t / beatInterval) - Math.round(t / beatInterval)) < 0.01 });
      }
      return beats;
    }

    // Advanced mode: use actual timing points from the map
    // Each bpmChange has: { time (seconds), bpm }
    // Build timing segments: [{ startTime, endTime, bpm, beatInterval }]
    const segments = [];
    for (let i = 0; i < bpmChanges.length; i++) {
      const tp = bpmChanges[i];
      const beatInterval = 60 / tp.bpm;
      const endTime = (i + 1 < bpmChanges.length) ? bpmChanges[i + 1].time : Infinity;
      segments.push({ startTime: tp.time, endTime, bpm: tp.bpm, beatInterval });
    }

    // The first timing point defines when beats start
    // Find the first beat time: align to the first timing point
    const firstSegment = segments[0];
    if (!firstSegment) return beats;

    // Window of visible times (slightly extended for half-beats)
    const windowStart = currentTime - visibleTime - 1.0;
    const windowEnd = currentTime + 0.2;

    // For each segment, compute beats that fall in the visible window
    for (const seg of segments) {
      if (seg.endTime < windowStart) continue; // Segment is entirely before visible window
      if (seg.startTime > windowEnd) break; // Segment is entirely after visible window

      // First beat in this segment = startTime
      // Subsequent beats at startTime + n * beatInterval
      const effStart = Math.max(seg.startTime, windowStart - seg.beatInterval);
      const effEnd = Math.min(seg.endTime, windowEnd);

      // Find the first beat at or after effStart
      // beatN = (effStart - seg.startTime) / beatInterval
      let firstN;
      if (effStart <= seg.startTime) {
        firstN = 0;
      } else {
        firstN = Math.ceil((effStart - seg.startTime) / seg.beatInterval);
      }

      const lastN = Math.floor((effEnd - seg.startTime) / seg.beatInterval);

      for (let n = firstN; n <= lastN; n++) {
        const beatTime = seg.startTime + n * seg.beatInterval;
        beats.push({ time: beatTime, isWholeBeat: true });
        // Half beat
        if (beatTime + seg.beatInterval / 2 <= seg.endTime && beatTime + seg.beatInterval / 2 <= windowEnd) {
          beats.push({ time: beatTime + seg.beatInterval / 2, isWholeBeat: false });
        }
      }
    }

    // Sort by time for consistent rendering order
    beats.sort((a, b) => a.time - b.time);
    return beats;
  }

  /* ── Layout (Perspective) ── */

  _getJudgeLineY() {
    return this.safeArea.y + this.safeArea.h * 0.78;
  }

  _getTopY() {
    return this.safeArea.y;
  }

  _getBottomY() {
    return this.safeArea.y + this.safeArea.h * 1.0;
  }

  _getPerspectiveScale(y) {
    const judgeLineY = this._getJudgeLineY();
    const topY = this._getTopY();
    const bottomY = this._getBottomY();

    if (y <= judgeLineY) {
      const t = Math.max(0, Math.min(1, (y - topY) / (judgeLineY - topY)));
      return 0.32 + 0.68 * t;
    } else {
      // Below judge line: widening perspective (floor expanding away from viewer)
      const t = Math.min(1, (y - judgeLineY) / (bottomY - judgeLineY));
      return 1.0 + 0.3 * t;
    }
  }

  _getLaneGeometry(laneIndex, y, laneCount) {
    const sa = this.safeArea;
    const pw = sa.w * 0.48; // Playfield width at judge line
    const cx = sa.x + sa.w / 2;
    const scale = this._getPerspectiveScale(y);
    const scaledPw = pw * scale;
    const lw = scaledPw / laneCount;
    const le = cx - scaledPw / 2;
    return { x: le + laneIndex * lw, width: lw, centerX: le + (laneIndex + 0.5) * lw };
  }

  /* ── Lane Glows ── */

  _drawLaneGlows(laneCount) {
    const ctx = this.ctx;
    const judgeLineY = this._getJudgeLineY();
    const gfx = this._gfx();

    for (const [lane, glow] of this._laneGlows) {
      if (glow.intensity <= 0.01) {
        this._laneGlows.delete(lane);
        continue;
      }

      const geom = this._getLaneGeometry(lane, judgeLineY, laneCount);
      const cx = geom.centerX;
      const hw = geom.width / 2;

      const expandProgress = 1 - glow.intensity;
      const halfW = hw * 0.7 * (1 + expandProgress * 0.3);
      const barH = 20 + expandProgress * 28;

      ctx.save();

      // Outer glow via pre-rendered sprite (no shadowBlur)
      if (this._graphicsPreset === 'disco') {
        const glowSprite = this._getGlowSprite(glow.color);
        if (glowSprite) {
          const gs = halfW * 3.6;
          ctx.globalAlpha = glow.intensity * 0.6;
          ctx.drawImage(glowSprite, cx - gs / 2, judgeLineY - gs / 2, gs, gs);
        }
      }

      const coreGrad = ctx.createLinearGradient(cx - halfW, 0, cx + halfW, 0);
      coreGrad.addColorStop(0, 'transparent');
      coreGrad.addColorStop(0.15, glow.color);
      coreGrad.addColorStop(0.5, '#ffffff');
      coreGrad.addColorStop(0.85, glow.color);
      coreGrad.addColorStop(1, 'transparent');
      ctx.globalAlpha = glow.intensity * 0.8;
      ctx.fillStyle = coreGrad;
      ctx.fillRect(cx - halfW, judgeLineY - barH / 2, halfW * 2, barH);

      ctx.globalAlpha = glow.intensity * 0.9;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 * glow.intensity;
      ctx.beginPath();
      ctx.moveTo(geom.x + 4, judgeLineY);
      ctx.lineTo(geom.x + geom.width - 4, judgeLineY);
      ctx.stroke();

      ctx.restore();
      const delta = this._frameDelta || 0.016;
      glow.intensity -= glow.decay * (delta / 0.016);
    }
  }

  /* ── Black bars ── */

  _drawBlackBars() {
    const ctx = this.ctx;
    const sa = this.safeArea;
    if (sa.x > 0 || sa.y > 0 || sa.x + sa.w < this.w || sa.y + sa.h < this.h) {
      ctx.fillStyle = '#000000';
      if (sa.x > 0) ctx.fillRect(0, 0, sa.x, this.h);
      if (sa.x + sa.w < this.w) ctx.fillRect(sa.x + sa.w, 0, this.w - sa.x - sa.w, this.h);
      if (sa.y > 0) ctx.fillRect(sa.x, 0, sa.w, sa.y);
      if (sa.y + sa.h < this.h) ctx.fillRect(sa.x, sa.y + sa.h, sa.w, this.h - sa.y - sa.h);
    }
  }

  /* ── Notes ── */

  static MIN_HOLD_DURATION = 0.05;

  /** Get current lane colors (static, shared across instances) */
  static getLaneColors() { return NoteRenderer.LANE_COLORS; }

  /** Set lane colors (called when background image is loaded and colors extracted) */
  static setLaneColors(colors) {
    NoteRenderer.LANE_COLORS = colors;
    // Rebuild glow sprites for new colors
    NoteRenderer._rebuildGlowSpritesForColors(colors);
  }

  _drawNotes(notes, currentTime, laneCount) {
    const judgeLineY = this._getJudgeLineY();
    const topY = this._getTopY();
    const bottomY = this._getBottomY();
    const clipTop = topY - 80;
    const clipBottom = bottomY + 20;

    // Draw hold note bodies first
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      if (note.type === 'hold' && note.duration >= NoteRenderer.MIN_HOLD_DURATION) {
        this._drawHoldNote(note, currentTime, laneCount, judgeLineY, topY, bottomY);
      }
    }

    // Draw tap notes
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      if (note.type === 'hold' && note.duration >= NoteRenderer.MIN_HOLD_DURATION) continue;

      if (note.hit && note.judgement !== 'miss') continue;
      // No 0.5s timeout — missed notes scroll down and fade out naturally
      if (note.judgement === 'miss') {
        const noteY = this._noteY(note.time, currentTime, judgeLineY);
        const fadeOut = this._fadeOut(noteY, judgeLineY);
        if (fadeOut <= 0) continue; // Fully faded out, don't draw
      }

      const noteY = this._noteY(note.time, currentTime, judgeLineY);
      if (noteY < clipTop || noteY > clipBottom) continue;

      const fadeIn = this._fadeIn(noteY, judgeLineY);
      const fadeOut = this._fadeOut(noteY, judgeLineY);
      const missAlpha = note.judgement === 'miss' ? 0.7 : 1;
      const alpha = fadeIn * fadeOut * missAlpha;
      let color = NoteRenderer.LANE_COLORS[note.lane % NoteRenderer.LANE_COLORS.length];
      // Desaturate notes below judge line
      if (noteY > judgeLineY) color = this._desaturateColor(color, noteY);

      // Motion blur / trail effect on missed notes
      if (note.judgement === 'miss' && noteY > judgeLineY) {
        this._drawTapNoteTrail(note.lane, noteY, laneCount, color, alpha * 0.3);
      }

      this._drawTapNote(note.lane, noteY, laneCount, color, alpha);
    }
  }

  _noteY(time, currentTime, judgeLineY) {
    const distFromJudge = (time - currentTime) * this.scrollSpeed;
    return judgeLineY - distFromJudge;
  }

  _getNoteScale(noteY) {
    const judgeLineY = this._getJudgeLineY();
    const topY = this._getTopY();
    const bottomY = this._getBottomY();

    if (noteY <= judgeLineY) {
      const t = Math.max(0, Math.min(1, (noteY - topY) / (judgeLineY - topY)));
      return 0.32 + 0.68 * t;
    } else {
      // Below judge line: notes widen with expanding perspective
      const t = Math.min(1, (noteY - judgeLineY) / (bottomY - judgeLineY));
      return 1.0 + 0.3 * t;
    }
  }

  /** Desaturate a hex color based on Y position below judge line */
  _desaturateColor(hexColor, y) {
    const judgeLineY = this._getJudgeLineY();
    if (y <= judgeLineY) return hexColor;
    const bottomY = this._getBottomY();
    const t = Math.min(1, (y - judgeLineY) / (bottomY - judgeLineY));
    if (t <= 0) return hexColor;
    const rgb = this._hexToRgb(hexColor);
    const gray = Math.round(0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b);
    const mix = t * 0.85;
    const r = Math.round(rgb.r * (1 - mix) + gray * mix);
    const g = Math.round(rgb.g * (1 - mix) + gray * mix);
    const b = Math.round(rgb.b * (1 - mix) + gray * mix);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /**
   * Fade-in: notes transparent at top, fully opaque at judge line.
   * Smooth ease-out over the first 25% of the field.
   */
  _fadeIn(noteY, judgeLineY) {
    const topY = this._getTopY();
    const distFromTop = noteY - topY;
    const totalDist = judgeLineY - topY;
    const fadeZone = totalDist * 0.25;
    if (fadeZone <= 0) return 1;
    const t = Math.min(1, Math.max(0, distFromTop / fadeZone));
    // Smooth ease-out for more natural appearance
    return t * t * (3 - 2 * t); // smoothstep
  }

  /**
   * Fade-out: notes below judge line fade to transparent at bottom.
   * Uses inverse smoothstep for a smooth, natural fade.
   */
  _fadeOut(noteY, judgeLineY) {
    if (noteY <= judgeLineY) return 1;
    const bottomY = this._getBottomY();
    const distFromJudge = noteY - judgeLineY;
    const totalDist = bottomY - judgeLineY;
    if (totalDist <= 0) return 0;
    const t = Math.min(1, distFromJudge / totalDist);
    return 1 - t * t * (3 - 2 * t); // inverse smoothstep
  }

  /** Draw motion blur trail for missed notes falling below judge line */
  _drawTapNoteTrail(lane, noteY, laneCount, color, alpha) {
    const ctx = this.ctx;
    const trailOffset = 18; // pixels above the note
    const trailY = noteY - trailOffset;
    if (trailY <= this._getJudgeLineY()) return;

    const geom = this._getLaneGeometry(lane, noteY, laneCount);
    const scale = this._getNoteScale(noteY);
    const pad = 5 * scale;
    const x = geom.x + pad;
    const w = geom.width - pad * 2;
    const h = this.noteHeight * scale;
    const r = Math.max(2, 8 * scale);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    this._roundRect(ctx, x, trailY - h / 2, w, h, r);
    ctx.fill();
    ctx.restore();
  }

  /* ── Tap note ── */

  _drawTapNote(lane, noteY, laneCount, color, alpha) {
    const ctx = this.ctx;
    const geom = this._getLaneGeometry(lane, noteY, laneCount);
    const scale = this._getNoteScale(noteY);
    const pad = 5 * scale;
    const x = geom.x + pad;
    const w = geom.width - pad * 2;
    const h = this.noteHeight * scale;
    const r = Math.max(2, 8 * scale);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    this._roundRect(ctx, x, noteY - h / 2, w, h, r);
    ctx.fill();

    // Glow via pre-rendered sprite (reduced intensity)
    const glowSprite = this._getGlowSprite(color);
    if (glowSprite) {
      const gs = Math.max(w, h) * 1.2 * scale;
      ctx.globalAlpha = alpha * 0.08;
      ctx.drawImage(glowSprite, x + w / 2 - gs / 2, noteY - gs / 2, gs, gs);
      ctx.globalAlpha = alpha;
    }
    const grad = ctx.createLinearGradient(x, noteY - h / 2, x, noteY + h / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.35)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.05)');
    grad.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = grad;
    this._roundRect(ctx, x, noteY - h / 2, w, h, r);
    ctx.fill();
    ctx.restore();
  }

  /* ── Hold note ── */

  _drawHoldNote(note, currentTime, laneCount, judgeLineY, topY, bottomY) {
    const headTime = note.time;
    const tailTime = note.time + note.duration;
    let color = NoteRenderer.LANE_COLORS[note.lane % NoteRenderer.LANE_COLORS.length];

    const isHolding = note.hit && note.judgement !== 'miss' && !note.released;
    const isMissed = note.judgement === 'miss';

    // No 0.5s timeout — missed hold notes scroll down and fade out naturally
    if (isMissed) {
      const rawHeadY = this._noteY(headTime, currentTime, judgeLineY);
      const fadeOut = this._fadeOut(rawHeadY, judgeLineY);
      if (fadeOut <= 0) return;
    }
    if (note.released && !isMissed) return;

    const rawHeadY = this._noteY(headTime, currentTime, judgeLineY);
    const headY = isHolding ? judgeLineY : rawHeadY;
    const tailY = this._noteY(tailTime, currentTime, judgeLineY);

    // Desaturate missed hold notes falling below judge line
    if (isMissed && rawHeadY > judgeLineY) {
      color = this._desaturateColor(color, rawHeadY);
    }

    const clipTop = topY - 40;
    const clipBottom = bottomY;

    const bodyTop = Math.max(tailY, clipTop);
    const bodyBottom = Math.min(headY, clipBottom);

    // Draw body with per-pixel gradient fade
    if (bodyTop < bodyBottom && bodyBottom > clipTop && bodyTop < clipBottom) {
      this._drawHoldBody(note, laneCount, color, bodyTop, bodyBottom, judgeLineY, isMissed, isHolding);
    }

    // Draw tail cap with fade-in / fade-out
    if (tailY >= clipTop && tailY <= clipBottom) {
      const tailColor = tailY > judgeLineY ? this._desaturateColor(color, tailY) : color;
      const fadeIn = this._fadeIn(tailY, judgeLineY);
      const fadeOut = this._fadeOut(tailY, judgeLineY);
      const missAlpha = isMissed ? 0.7 : 1;
      this._drawHoldCap(note.lane, tailY, laneCount, tailColor, fadeIn * fadeOut * missAlpha);
    }

    // Draw head cap with fade-in (only if NOT holding)
    if (!isHolding && headY >= clipTop && headY <= clipBottom) {
      const headColor = headY > judgeLineY ? this._desaturateColor(color, headY) : color;
      const fadeIn = this._fadeIn(headY, judgeLineY);
      const fadeOut = this._fadeOut(headY, judgeLineY);
      const missAlpha = isMissed ? 0.7 : 1;
      this._drawHoldCap(note.lane, headY, laneCount, headColor, fadeIn * fadeOut * missAlpha);
    }

    // Holding glow + sparks at judge line
    if (isHolding && this._graphicsPreset !== 'low') {
      this._drawHoldGlow(note.lane, judgeLineY, laneCount, color);
      // Emit hold sparks
      const pos = this.getLaneHitPosition(note.lane, laneCount);
      this.addHoldSpark(pos.x, pos.y, color);
    }
  }

  /**
   * Draw hold note body with gradient fade — the tail fades in smoothly
   * while the head (near judge line) is fully opaque.
   * Uses a vertical gradient to blend alpha along the body length.
   */
  _drawHoldBody(note, laneCount, color, topY, bottomY, judgeLineY, isMissed, isHolding) {
    const ctx = this.ctx;
    const gfx = this._gfx();
    const missAlpha = isMissed ? 0.7 : 1;

    // Draw in N segments, each with its own alpha based on _fadeIn/_fadeOut at that Y position
    const segments = Math.max(1, Math.ceil((bottomY - topY) / 12)); // one segment per ~12px (perf)
    const segH = (bottomY - topY) / segments;

    for (let s = 0; s < segments; s++) {
      const segTop = topY + s * segH;
      const segBot = segTop + segH + 0.5; // +0.5 to avoid gaps

      // Fade alpha: gradient from tail fade to head full opacity, including fadeOut below judge line
      const fadeAtTop = this._fadeIn(segTop, judgeLineY) * this._fadeOut(segTop, judgeLineY) * missAlpha;
      const fadeAtBot = this._fadeIn(segBot, judgeLineY) * this._fadeOut(segBot, judgeLineY) * missAlpha;
      const avgAlpha = (fadeAtTop + fadeAtBot) / 2;
      if (avgAlpha < 0.005) continue; // skip nearly invisible segments

      const segMid = (segTop + segBot) / 2;
      const geom = this._getLaneGeometry(note.lane, segMid, laneCount);
      const scale = this._getNoteScale(segMid);
      const pad = 3 * scale;

      const botGeom = this._getLaneGeometry(note.lane, segBot, laneCount);
      const topGeom = this._getLaneGeometry(note.lane, segTop, laneCount);

      const botX = geom.x + pad;
      const botW = geom.width - pad * 2;
      const topX = topGeom.x + pad * this._getNoteScale(segTop) / scale;
      const topW = topGeom.width - pad * 2 * this._getNoteScale(segTop) / scale;

      ctx.save();
      ctx.globalAlpha = avgAlpha;

      // Body fill (no shadowBlur — major perf gain)
      ctx.fillStyle = isHolding ? this._withAlpha(color, 0.30) : this._withAlpha(color, 0.18);
      ctx.beginPath();
      ctx.moveTo(topX, segTop);
      ctx.lineTo(topX + topW, segTop);
      ctx.lineTo(botX + botW, segBot);
      ctx.lineTo(botX, segBot);
      ctx.closePath();
      ctx.fill();

      // Stroke
      ctx.strokeStyle = isHolding ? this._withAlpha(color, 0.7) : this._withAlpha(color, 0.45);
      ctx.lineWidth = (isHolding ? 2 : 1.5) * scale;
      ctx.stroke();
      ctx.restore();

      // Center glow line for this segment (no shadowBlur)
      ctx.save();
      ctx.globalAlpha = avgAlpha * (isHolding ? 0.4 : 0.2);
      ctx.strokeStyle = isHolding ? '#ffffff' : this._withAlpha(color, 0.8);
      ctx.lineWidth = (isHolding ? 4 : 2) * scale;
      ctx.beginPath();
      const topCx = topGeom.x + topGeom.width / 2;
      const botCx = geom.x + geom.width / 2;
      ctx.moveTo(topCx, segTop);
      ctx.lineTo(botCx, segBot);
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawHoldCap(laneIndex, y, laneCount, color, alpha) {
    const ctx = this.ctx;
    const geom = this._getLaneGeometry(laneIndex, y, laneCount);
    const scale = this._getNoteScale(y);
    const pad = 5 * scale;
    const x = geom.x + pad;
    const w = geom.width - pad * 2;
    const h = this.noteHeight * scale;
    const r = Math.max(2, 8 * scale);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    this._roundRect(ctx, x, y - h / 2, w, h, r);
    ctx.fill();

    // Glow via pre-rendered sprite (reduced intensity)
    const glowSprite = this._getGlowSprite(color);
    if (glowSprite) {
      const gs = Math.max(w, h) * 1.2 * scale;
      ctx.globalAlpha = alpha * 0.06;
      ctx.drawImage(glowSprite, x + w / 2 - gs / 2, y - gs / 2, gs, gs);
      ctx.globalAlpha = alpha;
    }
    const grad = ctx.createLinearGradient(x, y - h / 2, x, y + h / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.35)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.15)');
    ctx.fillStyle = grad;
    this._roundRect(ctx, x, y - h / 2, w, h, r);
    ctx.fill();
    ctx.restore();
  }

  _drawHoldGlow(laneIndex, judgeLineY, laneCount, color) {
    const ctx = this.ctx;
    const geom = this._getLaneGeometry(laneIndex, judgeLineY, laneCount);
    const pad = 4;
    const x = geom.x + pad;
    const w = geom.width - pad * 2;
    const gfx = this._gfx();

    const columnH = 140;
    ctx.save();
    const grad = ctx.createLinearGradient(0, judgeLineY - columnH, 0, judgeLineY);
    grad.addColorStop(0, 'transparent');
    grad.addColorStop(0.4, this._withAlpha(color, 0.12));
    grad.addColorStop(1, this._withAlpha(color, 0.45));
    ctx.fillStyle = grad;
    ctx.fillRect(x - 3, judgeLineY - columnH, w + 6, columnH);

    // Glow via pre-rendered sprite instead of shadowBlur
    const holdGlowSprite = this._getGlowSprite(color);
    if (holdGlowSprite) {
      const gs = Math.max(w, columnH) * 1.5;
      ctx.globalAlpha = 0.25;
      ctx.drawImage(holdGlowSprite, x + w / 2 - gs / 2, judgeLineY - gs / 3, gs, gs);
    }

    const barH = 10;
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = color;
    ctx.fillRect(x, judgeLineY - barH / 2, w, barH);

    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 2, judgeLineY - 1.5, w - 4, 3);
    ctx.restore();
  }

  /* ── Miss Flashes — red flash at judge line on miss ── */

  _drawMissFlashes(delta) {
    if (this._missFlashCount === 0) return;
    const ctx = this.ctx;
    const judgeLineY = this._getJudgeLineY();
    const STRIDE = 5; // [x, y, width, life, maxLife]

    let write = 0;
    for (let i = 0; i < this._missFlashCount; i++) {
      const base = i * STRIDE;
      this._missFlashPool[base + 3] -= delta; // life
      if (this._missFlashPool[base + 3] <= 0) continue;
      if (write !== i) {
        for (let j = 0; j < STRIDE; j++) this._missFlashPool[write * STRIDE + j] = this._missFlashPool[base + j];
      }
      write++;
    }
    this._missFlashCount = write;
    if (write === 0) return;

    for (let i = 0; i < write; i++) {
      const base = i * STRIDE;
      const cx = this._missFlashPool[base];     // center x
      const leftX = this._missFlashPool[base + 1]; // left x
      const w = this._missFlashPool[base + 2];    // width
      const life = this._missFlashPool[base + 3];
      const maxLife = this._missFlashPool[base + 4];
      const ratio = life / maxLife;

      ctx.save();
      ctx.globalAlpha = ratio * 0.6;
      const flashH = 14;
      const flashW = w * (1 + (1 - ratio) * 0.4);
      const grad = ctx.createLinearGradient(0, judgeLineY - flashH, 0, judgeLineY + flashH);
      grad.addColorStop(0, 'rgba(255,0,0,0)');
      grad.addColorStop(0.35, `rgba(255,60,60,${ratio * 0.5})`);
      grad.addColorStop(0.5, `rgba(255,80,80,${ratio * 0.8})`);
      grad.addColorStop(0.65, `rgba(255,60,60,${ratio * 0.5})`);
      grad.addColorStop(1, 'rgba(255,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(cx - flashW / 2, judgeLineY - flashH, flashW, flashH * 2);

      // White core flash at the center
      ctx.globalAlpha = ratio * 0.4;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - flashW / 4, judgeLineY - 2, flashW / 2, 4);
      ctx.restore();
    }
  }

  /* ── HP Bar — perspective trapezoid ─ */

  _drawHPBar(laneCount) {
    const ctx = this.ctx;
    const sa = this.safeArea;
    const judgeLineY = this._getJudgeLineY();
    const health = this._displayHealth;
    const gfx = this._gfx();

    const barGap = 6;
    const baseBarWidth = 16;

    const barTopY = sa.y + sa.h * 0.46;
    const barBotY = judgeLineY;

    const rightGeomBot = this._getLaneGeometry(laneCount, judgeLineY, laneCount);
    const rightGeomTop = this._getLaneGeometry(laneCount, barTopY, laneCount);

    const topScale = this._getPerspectiveScale(barTopY);
    const botScale = this._getPerspectiveScale(barBotY);
    const topBarWidth = baseBarWidth * topScale;
    const botBarWidth = baseBarWidth * botScale;

    const topBarX = rightGeomTop.x + barGap * topScale;
    const botBarX = rightGeomBot.x + barGap;

    ctx.save();

    // Background bar
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.beginPath();
    ctx.moveTo(topBarX, barTopY);
    ctx.lineTo(topBarX + topBarWidth, barTopY);
    ctx.lineTo(botBarX + botBarWidth, barBotY);
    ctx.lineTo(botBarX, barBotY);
    ctx.closePath();
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(170,255,0,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(topBarX, barTopY);
    ctx.lineTo(topBarX + topBarWidth, barTopY);
    ctx.lineTo(botBarX + botBarWidth, barBotY);
    ctx.lineTo(botBarX, barBotY);
    ctx.closePath();
    ctx.stroke();

    // Health fill
    const fillRatio = health / 100;
    if (fillRatio > 0) {
      const fillTopY = barBotY - (barBotY - barTopY) * fillRatio;
      const fillTopScale = this._getPerspectiveScale(fillTopY);
      const fillTopBarWidth = baseBarWidth * fillTopScale;
      const rightGeomFillTop = this._getLaneGeometry(laneCount, fillTopY, laneCount);
      const fillTopBarX = rightGeomFillTop.x + barGap * fillTopScale;

      let fillColor, glowColor;
      if (health < 25) {
        fillColor = 'rgba(255,61,61,0.8)';
        glowColor = '#FF3D3D';
      } else if (health < 50) {
        fillColor = 'rgba(245,197,24,0.7)';
        glowColor = '#F5C518';
      } else {
        fillColor = 'rgba(170,255,0,0.6)';
        glowColor = '#AAFF00';
      }

      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.moveTo(fillTopBarX, fillTopY);
      ctx.lineTo(fillTopBarX + fillTopBarWidth, fillTopY);
      ctx.lineTo(botBarX + botBarWidth, barBotY);
      ctx.lineTo(botBarX, barBotY);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  /* ── Red vignette ── */

  _drawRedVignette() {
    const health = this._displayHealth;
    if (health > 40) return;

    const ctx = this.ctx;
    const sa = this.safeArea;
    const cx = sa.x + sa.w / 2;
    const cy = sa.y + sa.h / 2;
    const maxR = Math.max(1, Math.max(sa.w, sa.h) * 0.8);
    const minR = Math.max(0, Math.min(sa.w, sa.h) * 0.25);

    const intensity = (1 - health / 40) * 0.5;
    const pulse = health < 20 ? (0.7 + 0.3 * Math.sin(performance.now() * 0.005)) : 1;

    const grad = ctx.createRadialGradient(cx, cy, Math.min(minR, maxR), cx, cy, maxR);
    grad.addColorStop(0, 'transparent');
    grad.addColorStop(0.5, `rgba(255,30,30,${intensity * 0.15 * pulse})`);
    grad.addColorStop(1, `rgba(255,0,0,${intensity * 0.55 * pulse})`);

    ctx.save();
    ctx.fillStyle = grad;
    ctx.fillRect(sa.x, sa.y, sa.w, sa.h);
    ctx.restore();
  }

  /* ── Judge line ── */

  _drawJudgeLine(laneCount) {
    const ctx = this.ctx;
    const judgeLineY = this._getJudgeLineY();
    const fullGeom = this._getLaneGeometry(0, judgeLineY, laneCount);
    const startX = fullGeom.x;
    const totalWidth = laneCount * fullGeom.width;
    const gfx = this._gfx();

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(startX - 4, judgeLineY - 6, totalWidth + 8, 12);
    ctx.restore();

    ctx.save();
    const grad = ctx.createLinearGradient(startX, judgeLineY, startX + totalWidth, judgeLineY);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.04, 'rgba(255,255,255,0.7)');
    grad.addColorStop(0.5, '#ffffff');
    grad.addColorStop(0.96, 'rgba(255,255,255,0.7)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(startX, judgeLineY - 3, totalWidth, 6);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(startX + 2, judgeLineY - 1.5, totalWidth - 4, 3);
    ctx.restore();
  }

  /* ── Hit Effects — performant: pre-rendered sprites, batched paths ── */

  _drawEffects() {
    if (this._graphicsPreset === 'low') return;
    const ctx = this.ctx;
    const gfx = this._gfx();
    const delta = this._frameDelta || 0.016;

    for (const e of this._effectsPool) {
      if (!e.active) continue;
      e.age += delta;
      const dur = 0.35;
      const p = e.age / dur;
      if (p >= 1) { e.active = false; continue; }

      const ep = 1 - (1 - p) * (1 - p); // ease-out quad
      const r = Math.max(0, e.maxRadius * ep);
      const fade = 1 - p * p;

      // ── Layer 1: Expanding radial gradient flash (single fillRect) ──
      const sprite = this._getGlowSprite(e.color);
      const flashSize = r * 2.2;
      ctx.save();
      ctx.globalAlpha = fade * 0.6 * gfx;
      ctx.drawImage(sprite, e.x - flashSize / 2, e.y - flashSize / 2, flashSize, flashSize);
      ctx.restore();

      // ── Layer 2: White center flash (first 20% only, single drawImage) ──
      if (p < 0.22 && this._whiteGlow) {
        const fP = p / 0.22;
        const fSize = (24 + 30 * (1 - fP)) * 2;
        ctx.save();
        ctx.globalAlpha = (1 - fP) * 0.7;
        ctx.drawImage(this._whiteGlow, e.x - fSize / 2, e.y - fSize / 2, fSize, fSize);
        ctx.restore();
      }

      // ── Layer 3: Expanding ring (single stroke, no shadowBlur) ──
      ctx.save();
      ctx.globalAlpha = fade * 0.45;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(0.5, 2.5 * (1 - p));
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // ── Layer 4: Colored ring (single stroke, no shadowBlur) ──
      ctx.save();
      ctx.globalAlpha = fade * 0.3;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = Math.max(0.5, 1.8 * (1 - p));
      ctx.beginPath();
      ctx.arc(e.x, e.y, Math.max(0, r * 0.55), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // ── Layer 5: Dots — BATCHED: one beginPath, all arcs, single fill ──
      if (e.dots.length > 0) {
        ctx.save();
        ctx.globalAlpha = fade * 0.75;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        for (let i = 0; i < e.dots.length; i += 4) {
          const angle = e.dots[i];
          const speed = e.dots[i + 1];
          const size = e.dots[i + 2];
          const life = e.dots[i + 3];
          const dP = Math.min(1, e.age / life);
          if (dP >= 1) continue;
          const d = speed * ep;
          const dx = e.x + Math.cos(angle) * d;
          const dy = e.y + Math.sin(angle) * d - 8 * dP;
          const sz = size * (1 - dP * 0.7);
          ctx.moveTo(dx + sz, dy);
          ctx.arc(dx, dy, Math.max(0, sz), 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.restore();

        // Colored glow halos around each dot (drawImage — no shadowBlur)
        if (gfx > 0) {
          ctx.save();
          ctx.globalAlpha = fade * 0.35;
          for (let i = 0; i < e.dots.length; i += 4) {
            const angle = e.dots[i];
            const speed = e.dots[i + 1];
            const size = e.dots[i + 2];
            const life = e.dots[i + 3];
            const dP = Math.min(1, e.age / life);
            if (dP >= 1) continue;
            const d = speed * ep;
            const dx = e.x + Math.cos(angle) * d;
            const dy = e.y + Math.sin(angle) * d - 8 * dP;
            const sz = size * (1 - dP * 0.7);
            const haloSz = sz * 5;
            ctx.drawImage(sprite, dx - haloSz / 2, dy - haloSz / 2, haloSz, haloSz);
          }
          ctx.restore();
        }
      }
    }
  }

  /* ── Hold Sparks — performant: drawImage with pre-rendered sprites ── */

  _drawHoldSparks() {
    if (this._graphicsPreset === 'low') return;
    const ctx = this.ctx;
    const gfx = this._gfx();
    const delta = this._frameDelta || 0.016;
    const pool = this._holdSparkPool;
    // Each spark: [x, y, vx, vy, life, maxLife, size, r, g, b] — 10 elements
    const STRIDE = 10;

    // Update + compact in-place
    let write = 0;
    for (let i = 0; i < this._holdSparkCount; i++) {
      const base = i * STRIDE;
      pool[base + 4] -= delta; // life
      if (pool[base + 4] <= 0) continue;

      // Update position
      pool[base] += pool[base + 2] * delta; // x
      pool[base + 1] += pool[base + 3] * delta; // y
      pool[base + 3] += 25 * delta; // vy += gravity

      // Compact
      if (write !== i) {
        for (let j = 0; j < STRIDE; j++) pool[write * STRIDE + j] = pool[base + j];
      }
      write++;
    }
    this._holdSparkCount = write;

    if (write === 0) return;

    // Draw — batch white dots first, then colored halos
    ctx.save();
    // White dots — single batch path
    if (this._whiteGlow && gfx > 0) {
      for (let i = 0; i < write; i++) {
        const base = i * STRIDE;
        const x = pool[base], y = pool[base + 1];
        const life = pool[base + 4], maxLife = pool[base + 5];
        const size = pool[base + 6];
        const ratio = life / maxLife;
        const alpha = ratio * ratio;
        const sz = size * ratio;
        const imgSz = sz * 6;
        ctx.globalAlpha = alpha * 0.8;
        ctx.drawImage(this._whiteGlow, x - imgSz / 2, y - imgSz / 2, imgSz, imgSz);
      }
    }
    ctx.restore();
  }

  _hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  }

  /* ── Utility ── */

  _roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  _withAlpha(color, a) {
    if (color.startsWith('#')) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${a})`;
    }
    const m = color.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) return `rgba(${m[1]},${m[2]},${m[3]},${a})`;
    return color;
  }
}
