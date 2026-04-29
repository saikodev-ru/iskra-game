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
    this._useSekaiEffects = true; // Project Sekai style hit effects (set false for old ring effects)

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

    // LN Tick hit effects — pool for small ring flashes at judge line on tick hit
    this._tickEffectPool = [];
    this._tickEffectCount = 0;

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
    // ── Memory: release bg cache canvas (~32MB at 4K) ──
    this._bgCacheCanvas = null;
    this._bgCacheLaneCount = -1;
    // Reset to default colors
    const defaults = [...DEFAULT_COLORS, ...DEFAULT_COLORS];
    NoteRenderer.setLaneColors(defaults);
    // ── Memory: clear glow sprites to prevent unbounded Map growth ──
    this._glowSprites.clear();
    this._buildGlowSprites();
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
    effect.maxRadius = type === 'perfect' ? 140 : type === 'great' ? 105 : 55;
    effect.opacity = 1; effect.color = color; effect.age = 0; effect.type = type;
    effect.dots = []; // flat: [angle, speed, size, life, ...]

    if (type === 'perfect' || type === 'great') {
      // Pre-compute dot params as flat array for zero-alloc rendering
      const n = type === 'perfect' ? 14 : 8;
      for (let i = 0; i < n; i++) {
        effect.dots.push(
          (Math.PI * 2 / n) * i + (Math.random() - 0.5) * 0.6,
          110 + Math.random() * 90,
          3.0 + Math.random() * 2.5,
          0.4 + Math.random() * 0.2
        );
      }
    }

    // Project Sekai style: star-burst particles
    if (this._useSekaiEffects) {
      effect.sekaiParticles = [];
      const starN = type === 'perfect' ? 8 : type === 'great' ? 6 : 4;
      for (let i = 0; i < starN; i++) {
        const angle = (Math.PI * 2 / starN) * i + (Math.random() - 0.5) * 0.4;
        effect.sekaiParticles.push({
          angle,
          speed: 80 + Math.random() * 120,
          size: type === 'perfect' ? 6 + Math.random() * 4 : 4 + Math.random() * 3,
          life: 0.3 + Math.random() * 0.2,
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 8
        });
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

  /** Add a tick hit effect at the judge line — like pressing a note but subtler */
  addTickEffect(lane, laneCount) {
    if (this._graphicsPreset === 'low') return;
    if (this._tickEffectCount >= 8) return; // cap for perf
    const judgeLineY = this._getJudgeLineY();
    const geom = this._getLaneGeometry(lane, judgeLineY, laneCount);
    const color = NoteRenderer.LANE_COLORS[lane % NoteRenderer.LANE_COLORS.length] || '#AAFF00';
    // Each tick effect: [centerX, y, width, life, maxLife, r, g, b] — 8 elements
    const rgb = this._hexToRgb(color);
    this._tickEffectPool.push(
      geom.centerX, judgeLineY, geom.width,
      0.3, 0.3, // life, maxLife
      rgb.r, rgb.g, rgb.b
    );
    this._tickEffectCount++;
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
    this._tickEffectPool.length = 0;
    this._tickEffectCount = 0;
    // ── Memory: also clear miss flash pool ──
    this._missFlashPool.length = 0;
    this._missFlashCount = 0;
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
    this._drawPlayfieldDimOverlay(laneCount);
    this._drawKiaiEffect(delta, laneCount);
    this._drawBeatLines(currentTime, laneCount);
    this._drawKiaiNoteGlow(notes, currentTime, laneCount);
    this._drawMissFlashes(delta);
    this._drawTickEffects(delta);
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

    // ── Layout constants ──
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

    // ── Frosted glass: blurred background image clipped to playfield ──
    const pfFullPath = () => {
      cctx.beginPath();
      cctx.moveTo(leftTop.x, topY);
      cctx.lineTo(rightTop.x, topY);
      cctx.lineTo(rightJudge.x, judgeLineY);
      cctx.lineTo(rightBottom.x, bottomY);
      cctx.lineTo(leftBottom.x, bottomY);
      cctx.lineTo(leftJudge.x, judgeLineY);
      cctx.closePath();
    };

    if (this._bgImage) {
      // Opaque dark base — blocks raw Three.js background completely
      cctx.save();
      pfFullPath();
      cctx.fillStyle = 'rgba(6,6,8,1)';
      cctx.fill();
      cctx.restore();

      // Draw blurred background through the playfield shape (frosted glass effect)
      cctx.save();
      pfFullPath();
      cctx.clip();
      cctx.globalAlpha = 0.45;
      cctx.filter = 'blur(20px) brightness(0.65) saturate(1.3)';
      const ia = this._bgImage.width / this._bgImage.height;
      const ca = this.w / this.h;
      let dw, dh, dx, dy;
      if (ca > ia) { dw = this.w; dh = this.w / ia; dx = 0; dy = (this.h - dh) / 2; }
      else { dh = this.h; dw = this.h * ia; dx = (this.w - dw) / 2; dy = 0; }
      // Draw slightly larger to avoid blur edge artifacts inside clip
      cctx.drawImage(this._bgImage, dx - 30, dy - 30, dw + 60, dh + 60);
      cctx.filter = 'none';
      cctx.restore();
    } else {
      // No background image — opaque dark base
      cctx.save();
      pfFullPath();
      cctx.fillStyle = 'rgba(6,6,8,1)';
      cctx.fill();
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

    // ── Lane fills — frosted matte glass, semi-opaque ──
    for (let i = 0; i < laneCount; i++) {
      const topGeom = this._getLaneGeometry(i, topY, laneCount);
      const judgeGeom = this._getLaneGeometry(i, judgeLineY, laneCount);
      const bottomGeom = this._getLaneGeometry(i, bottomY, laneCount);

      // Above judge line: semi-opaque matte trapezoid over blurred bg
      cctx.beginPath();
      cctx.moveTo(topGeom.x, topY);
      cctx.lineTo(topGeom.x + topGeom.width, topY);
      cctx.lineTo(judgeGeom.x + judgeGeom.width, judgeLineY);
      cctx.lineTo(judgeGeom.x, judgeLineY);
      cctx.closePath();
      cctx.fillStyle = i % 2 === 0 ? 'rgba(6,6,8,0.55)' : 'rgba(10,10,12,0.55)';
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
      const hlGrad = cctx.createLinearGradient(0, highlightY - 8, 0, highlightY + 8);
      hlGrad.addColorStop(0, 'rgba(255,255,255,0)');
      hlGrad.addColorStop(0.5, 'rgba(255,255,255,0.025)');
      hlGrad.addColorStop(1, 'rgba(255,255,255,0)');
      cctx.fillStyle = hlGrad;
      cctx.fillRect(topGeom.x - 2, highlightY - 8, topGeom.width + 4, 16);
      cctx.restore();

      // Below judge line: same semi-opaque matte as above
      cctx.beginPath();
      cctx.moveTo(judgeGeom.x, judgeLineY);
      cctx.lineTo(judgeGeom.x + judgeGeom.width, judgeLineY);
      cctx.lineTo(bottomGeom.x + bottomGeom.width, bottomY);
      cctx.lineTo(bottomGeom.x, bottomY);
      cctx.closePath();
      cctx.fillStyle = i % 2 === 0 ? 'rgba(4,4,6,0.55)' : 'rgba(8,8,10,0.55)';
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
      bottomFadeGrad.addColorStop(1, 'rgba(0,0,0,0.4)');
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
      divGrad.addColorStop(0, 'rgba(255,255,255,0.02)');
      divGrad.addColorStop(0.5, 'rgba(255,255,255,0.08)');
      divGrad.addColorStop(0.85, 'rgba(255,255,255,0.12)');
      divGrad.addColorStop(1, 'rgba(255,255,255,0.04)');
      cctx.strokeStyle = divGrad;
      cctx.lineWidth = 1;
      cctx.beginPath();
      cctx.moveTo(topG.x, topY);
      cctx.lineTo(judgeG.x, judgeLineY);
      cctx.stroke();
      cctx.restore();

      // Below judge line (same style as above)
      cctx.save();
      const belowDivGrad = cctx.createLinearGradient(0, judgeLineY, 0, bottomY);
      belowDivGrad.addColorStop(0, 'rgba(255,255,255,0.12)');
      belowDivGrad.addColorStop(0.5, 'rgba(255,255,255,0.06)');
      belowDivGrad.addColorStop(1, 'rgba(255,255,255,0.02)');
      cctx.strokeStyle = belowDivGrad;
      cctx.lineWidth = 1;
      cctx.beginPath();
      cctx.moveTo(judgeG.x, judgeLineY);
      cctx.lineTo(bottomG.x, bottomY);
      cctx.stroke();
      cctx.restore();
    }

    // ── Depth fog at top (subtle perspective depth) ──
    const fogGrad = cctx.createLinearGradient(0, topY, 0, topY + (judgeLineY - topY) * 0.12);
    fogGrad.addColorStop(0, 'rgba(0,0,0,0.18)');
    fogGrad.addColorStop(1, 'rgba(0,0,0,0)');
    cctx.fillStyle = fogGrad;
    cctx.fillRect(leftTop.x - 8, topY, rightTop.x - leftTop.x + 16, (judgeLineY - topY) * 0.18);

    // ── White glow strip at judge line ──
    const glowH = 40;
    cctx.save();
    const jlGlow = cctx.createLinearGradient(0, judgeLineY - glowH / 2, 0, judgeLineY + glowH / 2);
    jlGlow.addColorStop(0, 'rgba(255,255,255,0)');
    jlGlow.addColorStop(0.35, 'rgba(255,255,255,0.08)');
    jlGlow.addColorStop(0.5, 'rgba(255,255,255,0.16)');
    jlGlow.addColorStop(0.65, 'rgba(255,255,255,0.08)');
    jlGlow.addColorStop(1, 'rgba(255,255,255,0)');
    cctx.fillStyle = jlGlow;
    cctx.fillRect(leftJudge.x - 4, judgeLineY - glowH / 2, rightJudge.x - leftJudge.x + 8, glowH);
    cctx.restore();

    // (Glass reflection stripe removed — was causing a visible smeared vertical band)

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

  /** Dynamic playfield dim overlay — darker base, lifted during kiai chorus.
   *  This creates the "dark playfield → bright kiai" contrast that makes
   *  choruses feel impactful and driving. */
  _drawPlayfieldDimOverlay(laneCount) {
    const ctx = this.ctx;
    const topY = this._getTopY();
    const judgeLineY = this._getJudgeLineY();
    const bottomY = this._getBottomY();

    // Base dim: 0.12 (subtle, lanes are already dark). During kiai: lifts toward 0.
    // The smooth pulse adds extra brightness on each beat.
    const kiaiLift = this._kiaiIntensity * 0.9;       // up to 90% lift during kiai
    const beatLift = this._kiaiSmoothPulse * 0.2;     // extra flash on beat
    const dimAlpha = Math.max(0, 0.12 - kiaiLift - beatLift);

    if (dimAlpha < 0.005) return;

    const leftTop = this._getLaneGeometry(0, topY, laneCount);
    const rightTop = this._getLaneGeometry(laneCount, topY, laneCount);
    const leftJudge = this._getLaneGeometry(0, judgeLineY, laneCount);
    const rightJudge = this._getLaneGeometry(laneCount, judgeLineY, laneCount);
    const leftBottom = this._getLaneGeometry(0, bottomY, laneCount);
    const rightBottom = this._getLaneGeometry(laneCount, bottomY, laneCount);

    ctx.save();
    ctx.globalAlpha = dimAlpha;
    ctx.fillStyle = '#000000';

    // Above judge line
    // rightTop.x = right edge of playfield (laneCount lane starts there)
    ctx.beginPath();
    ctx.moveTo(leftTop.x, topY);
    ctx.lineTo(rightTop.x, topY);
    ctx.lineTo(rightJudge.x, judgeLineY);
    ctx.lineTo(leftJudge.x, judgeLineY);
    ctx.closePath();
    ctx.fill();

    // Below judge line
    ctx.beginPath();
    ctx.moveTo(leftJudge.x, judgeLineY);
    ctx.lineTo(rightJudge.x, judgeLineY);
    ctx.lineTo(rightBottom.x, bottomY);
    ctx.lineTo(leftBottom.x, bottomY);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  /* ── Chorus Effect — "Kiai Drive" ─────────────────────────────────── */
  /*  High-energy, driving chorus visualization.
   *  Design principles:
   *    - Dark base playfield → bright explosive kiai contrast
   *    - Effects concentrated on EDGES + judge line for readability
   *    - Minimal draw calls, maximum visual impact
   *    - Feels rhythmic and powerful — every beat should HIT
   *
   *  Layers:
   *    1. Pulsing wall glow — bright gradient pillars along walls
   *    2. Judge line flare — intense beat-synced flash
   *    3. Beat burst — expanding ring on each beat
   *    4. Edge sparkles — accent diamonds on beat
   */
  _drawKiaiEffect(delta, laneCount) {
    if (this._kiaiIntensity < 0.01) {
      this._kiaiBeatPulse = 0;
      this._kiaiSmoothPulse = 0;
      this._kiaiFlashAlpha = 0;
      this._kiaiBorderGlow = 0;
      return;
    }

    const ctx = this.ctx;
    const topY = this._getTopY();
    const judgeLineY = this._getJudgeLineY();
    const bottomY = this._getBottomY();

    // Decay beat pulse
    this._kiaiBeatPulse *= Math.max(0, 1 - delta * 10);
    this._kiaiSmoothPulse += (this._kiaiBeatPulse - this._kiaiSmoothPulse) * Math.min(1, delta * 18);

    const intensity = this._kiaiIntensity;
    const pulse = this._kiaiSmoothPulse;

    // Flame phase reused for noise (cheap pseudo-random)
    this._kiaiFlamePhase += delta * 12;

    // Geometry — key edge points
    // _getLaneGeometry(laneIndex, y, laneCount).x = left edge of that lane
    // Left wall = lane 0's left edge (x)
    // Right wall = lane laneCount's left edge (x) = right edge of playfield
    const lxT = this._getLaneGeometry(0, topY, laneCount).x;
    const rxT = this._getLaneGeometry(laneCount, topY, laneCount).x;
    const lxJ = this._getLaneGeometry(0, judgeLineY, laneCount).x;
    const rxJ = this._getLaneGeometry(laneCount, judgeLineY, laneCount).x;
    const lxB = this._getLaneGeometry(0, bottomY, laneCount).x;
    const rxB = this._getLaneGeometry(laneCount, bottomY, laneCount).x;

    // Get accent color (use first lane color as accent)
    const lcHex = NoteRenderer.LANE_COLORS[0] || '#AAFF00';
    const lc = this._hexToRgb(lcHex);

    // ════════════════════════════════════════════════════════════════
    //  LAYER 1: Pulsing wall glow — bright gradient pillars
    //  The main signature: glowing light pillars along the playfield edges
    //  that breathe with intensity and pulse hard on each beat.
    // ════════════════════════════════════════════════════════════════
    this._kiaiBorderGlow += (pulse - this._kiaiBorderGlow) * Math.min(1, delta * 14);
    const borderA = intensity * 0.7 + this._kiaiBorderGlow * 0.6;

    if (borderA > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      const flowPhase = this._kiaiFlamePhase * 0.3;
      const auroraShift = Math.sin(flowPhase) * 0.15 + 0.5;

      // ── Left wall glow — wide soft fill ──
      const lwW = 28 + this._kiaiBorderGlow * 24;
      const lGrad = ctx.createLinearGradient(lxJ - lwW, topY, lxJ + 4, topY);
      lGrad.addColorStop(0, `rgba(${lc.r},${lc.g},${lc.b},0)`);
      lGrad.addColorStop(0.4, `rgba(${lc.r},${lc.g},${lc.b},${borderA * 0.08})`);
      lGrad.addColorStop(0.75, `rgba(${lc.r},${lc.g},${lc.b},${borderA * 0.18})`);
      lGrad.addColorStop(1, `rgba(255,255,255,${borderA * 0.12})`);
      ctx.fillStyle = lGrad;
      ctx.beginPath();
      ctx.moveTo(lxT - lwW * 0.5, topY);
      ctx.lineTo(lxT + 4, topY);
      ctx.lineTo(lxJ + 4, judgeLineY);
      ctx.lineTo(lxJ - lwW, judgeLineY);
      ctx.closePath();
      ctx.fill();

      // ── Left wall bright edge line ──
      const edgeGrad = ctx.createLinearGradient(0, topY, 0, judgeLineY);
      edgeGrad.addColorStop(0, `rgba(255,255,255,${borderA * 0.06})`);
      edgeGrad.addColorStop(auroraShift - 0.15, `rgba(${lc.r},${lc.g},${lc.b},${borderA * 0.2})`);
      edgeGrad.addColorStop(auroraShift, `rgba(255,255,255,${borderA * 0.7})`);
      edgeGrad.addColorStop(auroraShift + 0.15, `rgba(${lc.r},${lc.g},${lc.b},${borderA * 0.2})`);
      edgeGrad.addColorStop(1, `rgba(255,255,255,${borderA * 0.06})`);
      ctx.strokeStyle = edgeGrad;
      ctx.lineWidth = 2 + this._kiaiBorderGlow * 3;
      ctx.beginPath();
      ctx.moveTo(lxT, topY);
      ctx.lineTo(lxJ, judgeLineY);
      ctx.stroke();

      // ── Right wall glow — wide soft fill ──
      const rwW = 28 + this._kiaiBorderGlow * 24;
      const rGrad = ctx.createLinearGradient(rxJ - 4, topY, rxJ + rwW, topY);
      rGrad.addColorStop(0, `rgba(255,255,255,${borderA * 0.12})`);
      rGrad.addColorStop(0.25, `rgba(${lc.r},${lc.g},${lc.b},${borderA * 0.18})`);
      rGrad.addColorStop(0.6, `rgba(${lc.r},${lc.g},${lc.b},${borderA * 0.08})`);
      rGrad.addColorStop(1, `rgba(${lc.r},${lc.g},${lc.b},0)`);
      ctx.fillStyle = rGrad;
      ctx.beginPath();
      ctx.moveTo(rxT - 4, topY);
      ctx.lineTo(rxT + rwW * 0.5, topY);
      ctx.lineTo(rxJ + rwW, judgeLineY);
      ctx.lineTo(rxJ - 4, judgeLineY);
      ctx.closePath();
      ctx.fill();

      // ── Right wall bright edge line ──
      const rAuroraShift = Math.sin(flowPhase + 1.5) * 0.15 + 0.5;
      const redgeGrad = ctx.createLinearGradient(0, topY, 0, judgeLineY);
      redgeGrad.addColorStop(0, `rgba(255,255,255,${borderA * 0.06})`);
      redgeGrad.addColorStop(rAuroraShift - 0.15, `rgba(${lc.r},${lc.g},${lc.b},${borderA * 0.2})`);
      redgeGrad.addColorStop(rAuroraShift, `rgba(255,255,255,${borderA * 0.7})`);
      redgeGrad.addColorStop(rAuroraShift + 0.15, `rgba(${lc.r},${lc.g},${lc.b},${borderA * 0.2})`);
      redgeGrad.addColorStop(1, `rgba(255,255,255,${borderA * 0.06})`);
      ctx.strokeStyle = redgeGrad;
      ctx.lineWidth = 2 + this._kiaiBorderGlow * 3;
      ctx.beginPath();
      ctx.moveTo(rxT, topY);
      ctx.lineTo(rxJ, judgeLineY);
      ctx.stroke();

      // ── Below-judge faint echo ──
      const bwW = 18 + this._kiaiBorderGlow * 14;
      ctx.fillStyle = `rgba(${lc.r},${lc.g},${lc.b},${borderA * 0.05})`;
      ctx.beginPath();
      ctx.moveTo(lxJ - bwW, judgeLineY);
      ctx.lineTo(lxJ, judgeLineY);
      ctx.lineTo(lxB, bottomY);
      ctx.lineTo(lxB - bwW * 0.5, bottomY);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(rxJ, judgeLineY);
      ctx.lineTo(rxJ + bwW, judgeLineY);
      ctx.lineTo(rxB + bwW * 0.5, bottomY);
      ctx.lineTo(rxB, bottomY);
      ctx.closePath();
      ctx.fill();

      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }

    // ════════════════════════════════════════════════════════════════
    //  LAYER 2: Judge line flare — intense beat-synced flash
    //  A bright, punchy glow that fires on every beat during kiai.
    //  This is the "heartbeat" of the effect.
    // ════════════════════════════════════════════════════════════════
    {
      const judgeWidth = rxJ - lxJ;
      const judgeCX = (lxJ + rxJ) / 2;
      const glowH = 14 + pulse * 24;  // taller on beat
      const glowA = intensity * 0.5 + pulse * 0.5;

      const shimmerGrad = ctx.createLinearGradient(judgeCX, judgeLineY - glowH, judgeCX, judgeLineY + glowH);
      shimmerGrad.addColorStop(0, `rgba(255,255,255,0)`);
      shimmerGrad.addColorStop(0.25, `rgba(${lc.r},${lc.g},${lc.b},${glowA * 0.2})`);
      shimmerGrad.addColorStop(0.4, `rgba(255,255,255,${glowA * 0.5})`);
      shimmerGrad.addColorStop(0.5, `rgba(255,255,255,${glowA * 0.8})`);
      shimmerGrad.addColorStop(0.6, `rgba(255,255,255,${glowA * 0.5})`);
      shimmerGrad.addColorStop(0.75, `rgba(${lc.r},${lc.g},${lc.b},${glowA * 0.2})`);
      shimmerGrad.addColorStop(1, `rgba(255,255,255,0)`);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = shimmerGrad;
      ctx.fillRect(lxJ - 6, judgeLineY - glowH, judgeWidth + 12, glowH * 2);
      ctx.restore();
    }

    // ════════════════════════════════════════════════════════════════
    //  LAYER 3: Beat burst — expanding ring on each beat
    //  A fast-expanding, fading ring that fires from the judge line
    //  outward on each beat. Feels like a shockwave.
    // ════════════════════════════════════════════════════════════════
    if (this._kiaiBeatPulse > 0.2) {
      const burstA = (this._kiaiBeatPulse - 0.2) * intensity * 0.4;
      const burstExpand = (1 - this._kiaiBeatPulse) * 60; // expands as pulse decays
      const judgeWidth = rxJ - lxJ;
      const judgeCX = (lxJ + rxJ) / 2;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // Horizontal burst line that shoots outward from judge line
      const burstH = 3 + this._kiaiBeatPulse * 6;
      const burstW = judgeWidth * (0.6 + this._kiaiBeatPulse * 0.4);
      const burstGrad = ctx.createLinearGradient(judgeCX, judgeLineY - burstH - burstExpand, judgeCX, judgeLineY + burstH + burstExpand);
      burstGrad.addColorStop(0, `rgba(255,255,255,0)`);
      burstGrad.addColorStop(0.3, `rgba(255,255,255,${burstA * 0.15})`);
      burstGrad.addColorStop(0.5, `rgba(255,255,255,${burstA * 0.6})`);
      burstGrad.addColorStop(0.7, `rgba(255,255,255,${burstA * 0.15})`);
      burstGrad.addColorStop(1, `rgba(255,255,255,0)`);
      ctx.fillStyle = burstGrad;
      ctx.fillRect(judgeCX - burstW / 2, judgeLineY - burstH - burstExpand, burstW, (burstH + burstExpand) * 2);

      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }

    // ════════════════════════════════════════════════════════════════
    //  LAYER 4: Edge sparkles on beat
    //  Diamond sparkles along the walls. More of them, brighter.
    // ════════════════════════════════════════════════════════════════
    if (this._kiaiBeatPulse > 0.2) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const sparkA = (this._kiaiBeatPulse - 0.2) * intensity * 0.8;
      const sparkCount = 6;

      for (let i = 0; i < sparkCount; i++) {
        const seed1 = Math.sin(this._kiaiFlamePhase * 1.1 + i * 31.7) * 0.5 + 0.5;
        const seed2 = Math.cos(this._kiaiFlamePhase * 0.8 + i * 19.3) * 0.5 + 0.5;
        const sparkSize = 3 + seed1 * 4;

        // Left wall sparkles
        const lY = topY + seed2 * (judgeLineY - topY);
        const lXPersp = lxT + (lxJ - lxT) * seed2;
        const lsx = lXPersp - 10 - seed1 * 14;
        ctx.fillStyle = `rgba(255,255,255,${sparkA * (0.5 + seed2 * 0.5)})`;
        ctx.beginPath();
        ctx.moveTo(lsx, lY - sparkSize);
        ctx.lineTo(lsx + sparkSize * 0.4, lY);
        ctx.lineTo(lsx, lY + sparkSize);
        ctx.lineTo(lsx - sparkSize * 0.4, lY);
        ctx.closePath();
        ctx.fill();

        // Right wall sparkles
        const rXPersp = rxT + (rxJ - rxT) * seed2;
        const rsx = rXPersp + 10 + seed1 * 14;
        ctx.fillStyle = `rgba(255,255,255,${sparkA * (0.4 + seed1 * 0.6)})`;
        ctx.beginPath();
        ctx.moveTo(rsx, lY - sparkSize);
        ctx.lineTo(rsx + sparkSize * 0.4, lY);
        ctx.lineTo(rsx, lY + sparkSize);
        ctx.lineTo(rsx - sparkSize * 0.4, lY);
        ctx.closePath();
        ctx.fill();
      }

      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }
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
        // Whole beat — white line, no fade-in (visible from top)
        const alpha = 0.14;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(leftG.x + 2, y);
        ctx.lineTo(rightG.x - 2, y);
        ctx.stroke();
      } else {
        // Half beat — very faint, no fade-in
        const alpha = 0.05;
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
      // Beats visible above judge line are currentTime to currentTime + visibleTime
      // Start a bit before judge line for smooth entry, extend past top for margin
      const windowStart = currentTime - 0.5;
      const windowEnd = currentTime + visibleTime + 1.0;
      const firstBeatTime = Math.floor(windowStart / beatInterval) * beatInterval;
      const beatCount = Math.ceil((windowEnd - windowStart) / beatInterval) * 2 + 4;

      for (let i = 0; i < beatCount; i++) {
        const t = firstBeatTime + i * beatInterval / 2;
        if (t > windowEnd) break;
        if (t < windowStart) continue;
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

    // Window of visible times — beats above judge line are in the future
    // Extend past top of screen for smooth entry
    const windowStart = currentTime - 0.5;
    const windowEnd = currentTime + visibleTime + 1.0;

    // For each segment, compute beats that fall in the visible window
    for (const seg of segments) {
      if (seg.endTime < windowStart) continue; // Segment is entirely before visible window
      if (seg.startTime > windowEnd) break; // Segment is entirely after visible window

      // Extrapolate beats before seg.startTime to cover full visible range
      const effEnd = Math.min(seg.endTime, windowEnd);

      // Allow negative N to generate beats before seg.startTime
      const firstN = Math.ceil((windowStart - seg.startTime) / seg.beatInterval);

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

  /* ── Kiai Note Glow — drawn BEHIND notes, using lane colors ── */
  /*  During kiai, each visible note gets a colored glow halo behind it.
   *  The glow uses the note's lane color, is drawn BEFORE notes so it
   *  appears behind them, and is focused/tight (not a wide bloom that
   *  washes out the playfield). */

  _drawKiaiNoteGlow(notes, currentTime, laneCount) {
    if (this._kiaiIntensity < 0.01) return;
    if (this._graphicsPreset === 'low') return;

    const ctx = this.ctx;
    const judgeLineY = this._getJudgeLineY();
    const topY = this._getTopY();
    const bottomY = this._getBottomY();
    const clipTop = topY - 80;
    const clipBottom = bottomY + 20;
    const kiai = this._kiaiIntensity;
    const pulse = this._kiaiSmoothPulse;
    const kiaiPulse = 0.85 + pulse * 0.15;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      // Skip fully resolved notes (hit and not missed, and hold notes fully released)
      if (note.hit && note.judgement !== 'miss' && note.type !== 'hold') continue;
      // Skip missed notes that faded out
      if (note.judgement === 'miss') {
        const noteY = this._noteY(note.time, currentTime, judgeLineY);
        if (this._fadeOut(noteY, judgeLineY) <= 0) continue;
      }

      // Glow at head position
      const headY = this._noteY(note.time, currentTime, judgeLineY);
      if (headY >= clipTop && headY <= clipBottom) {
        const fadeIn = this._fadeIn(headY, judgeLineY);
        const fadeOut = this._fadeOut(headY, judgeLineY);
        const missAlpha = note.judgement === 'miss' ? 0.7 : 1;
        const alpha = fadeIn * fadeOut * missAlpha;
        if (alpha > 0.01) {
          let color = NoteRenderer.LANE_COLORS[note.lane % NoteRenderer.LANE_COLORS.length];
          if (headY > judgeLineY) color = this._desaturateColor(color, headY);
          this._drawKiaiGlowAt(note.lane, headY, laneCount, color, alpha, kiai, kiaiPulse);
        }
      }

      // For hold notes: glow at tail position too
      if (note.type === 'hold' && note.duration >= NoteRenderer.MIN_HOLD_DURATION) {
        const tailY = this._noteY(note.time + note.duration, currentTime, judgeLineY);
        if (tailY >= clipTop && tailY <= clipBottom) {
          const fadeIn = this._fadeIn(tailY, judgeLineY);
          const fadeOut = this._fadeOut(tailY, judgeLineY);
          const missAlpha = note.judgement === 'miss' ? 0.7 : 1;
          const alpha = fadeIn * fadeOut * missAlpha;
          if (alpha > 0.01) {
            let color = NoteRenderer.LANE_COLORS[note.lane % NoteRenderer.LANE_COLORS.length];
            if (tailY > judgeLineY) color = this._desaturateColor(color, tailY);
            this._drawKiaiGlowAt(note.lane, tailY, laneCount, color, alpha, kiai, kiaiPulse);
          }
        }
      }
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  /** Draw a single kiai glow sprite at a given lane/Y position */
  _drawKiaiGlowAt(lane, noteY, laneCount, color, alpha, kiai, kiaiPulse) {
    const ctx = this.ctx;
    const corners = this._getNoteCorners(lane, noteY, laneCount);
    const glowSprite = this._getGlowSprite(color);
    if (!glowSprite) return;

    // Layer 1: wide soft glow halo behind the note (lane color)
    const gs = Math.max(corners.width, corners.height) * 1.6 * corners.scale;
    const glowSize = gs * (1.3 + kiai * 0.4) * kiaiPulse;
    ctx.globalAlpha = alpha * 0.35 * kiai * kiaiPulse;
    ctx.drawImage(glowSprite, corners.centerX - glowSize / 2, noteY - glowSize / 2, glowSize, glowSize);

    // Layer 2: tight bright core glow (lane color, more intense)
    const coreSize = gs * 0.9 * kiaiPulse;
    ctx.globalAlpha = alpha * 0.2 * kiai * kiaiPulse;
    ctx.drawImage(glowSprite, corners.centerX - coreSize / 2, noteY - coreSize / 2, coreSize, coreSize);
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

    const corners = this._getNoteCorners(lane, trailY, laneCount);
    const r = Math.max(2, 8 * corners.scale);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    this._drawPerspectiveRoundRect(ctx, corners.tl.x, corners.tl.y, corners.tr.x, corners.tr.y, corners.br.x, corners.br.y, corners.bl.x, corners.bl.y, r);
    ctx.fill();
    ctx.restore();
  }

  /* ── Perspective-correct rounded trapezoid path ── */

  /**
   * Draw a perspective-correct rounded-corner shape.
   * Points: TL, TR (top edge), BR, BL (bottom edge).
   * Uses arcTo for smooth corners on non-rectangular quads.
   */
  _drawPerspectiveRoundRect(ctx, tl_x, tl_y, tr_x, tr_y, br_x, br_y, bl_x, bl_y, r) {
    const topW = tr_x - tl_x;
    const botW = br_x - bl_x;
    const height = bl_y - tl_y;
    if (height <= 0) return;
    const maxR = Math.min(topW / 2, botW / 2, height / 2);
    r = Math.max(0, Math.min(r, maxR));
    if (r < 0.5) {
      // No rounding — simple quad
      ctx.beginPath();
      ctx.moveTo(tl_x, tl_y);
      ctx.lineTo(tr_x, tr_y);
      ctx.lineTo(br_x, br_y);
      ctx.lineTo(bl_x, bl_y);
      ctx.closePath();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(tl_x + r, tl_y);
    ctx.lineTo(tr_x - r, tr_y);
    ctx.arcTo(tr_x, tr_y, br_x, br_y, r);
    ctx.arcTo(br_x, br_y, bl_x, bl_y, r);
    ctx.lineTo(bl_x + r, bl_y);
    ctx.arcTo(bl_x, bl_y, tl_x, tl_y, r);
    ctx.arcTo(tl_x, tl_y, tr_x, tr_y, r);
    ctx.closePath();
  }

  /**
   * Get the 4 corner coordinates of a perspective-correct note.
   * Returns { tl, tr, br, bl } with {x, y} each.
   */
  _getNoteCorners(lane, noteY, laneCount, padOverride) {
    const h = this.noteHeight * this._getNoteScale(noteY);
    const topY = noteY - h / 2;
    const botY = noteY + h / 2;
    const topScale = this._getNoteScale(topY);
    const botScale = this._getNoteScale(botY);
    const topGeom = this._getLaneGeometry(lane, topY, laneCount);
    const botGeom = this._getLaneGeometry(lane, botY, laneCount);
    const topPad = padOverride !== undefined ? padOverride * topScale : 5 * topScale;
    const botPad = padOverride !== undefined ? padOverride * botScale : 5 * botScale;
    return {
      tl: { x: topGeom.x + topPad, y: topY },
      tr: { x: topGeom.x + topGeom.width - topPad, y: topY },
      br: { x: botGeom.x + botGeom.width - botPad, y: botY },
      bl: { x: botGeom.x + botPad, y: botY },
      centerX: (topGeom.centerX + botGeom.centerX) / 2,
      width: ((topGeom.width - topPad * 2) + (botGeom.width - botPad * 2)) / 2,
      height: h,
      scale: this._getNoteScale(noteY)
    };
  }

  /* ── Tap note ── */

  _drawTapNote(lane, noteY, laneCount, color, alpha) {
    const ctx = this.ctx;
    const corners = this._getNoteCorners(lane, noteY, laneCount);
    const r = Math.max(2, 8 * corners.scale);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    this._drawPerspectiveRoundRect(ctx, corners.tl.x, corners.tl.y, corners.tr.x, corners.tr.y, corners.br.x, corners.br.y, corners.bl.x, corners.bl.y, r);
    ctx.fill();

    // Subtle base glow (always visible) — drawn ON the note, very subtle
    // Kiai glow is now drawn separately BEFORE notes via _drawKiaiNoteGlow
    const glowSprite = this._getGlowSprite(color);
    if (glowSprite) {
      const gs = Math.max(corners.width, corners.height) * 1.0 * corners.scale;
      ctx.globalAlpha = alpha * 0.06;
      ctx.drawImage(glowSprite, corners.centerX - gs / 2, noteY - gs / 2, gs, gs);
      ctx.globalAlpha = alpha;
    }

    const grad = ctx.createLinearGradient(corners.centerX, corners.tl.y, corners.centerX, corners.bl.y);
    grad.addColorStop(0, 'rgba(255,255,255,0.35)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.05)');
    grad.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = grad;
    this._drawPerspectiveRoundRect(ctx, corners.tl.x, corners.tl.y, corners.tr.x, corners.tr.y, corners.br.x, corners.br.y, corners.bl.x, corners.bl.y, r);
    ctx.fill();
    ctx.restore();
  }

  /* ── Hold note (Project Sekai style) ── */

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

    // Draw body with per-pixel gradient fade (Project Sekai style)
    if (bodyTop < bodyBottom && bodyBottom > clipTop && bodyTop < clipBottom) {
      this._drawHoldBody(note, laneCount, color, bodyTop, bodyBottom, judgeLineY, isMissed, isHolding, currentTime);
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
   * Draw hold note body — Project Sekai style:
   * - Smooth translucent body fill (NO horizontal segment lines)
   * - Continuous side edge borders (left + right only)
   * - Bright center "ribbon" spine running down the middle
   * - Rhythmic tick markers (prominent diamond + bright line) at beat positions
   * - Glowing edges when holding
   */
  _drawHoldBody(note, laneCount, color, topY, bottomY, judgeLineY, isMissed, isHolding, currentTime) {
    const ctx = this.ctx;
    const missAlpha = isMissed ? 0.7 : 1;

    // ── Helper: get left/right edge X at a given Y ──
    const getEdgeX = (y) => {
      const geom = this._getLaneGeometry(note.lane, y, laneCount);
      const scale = this._getNoteScale(y);
      const pad = 3 * scale;
      return { left: geom.x + pad, right: geom.x + geom.width - pad, cx: geom.centerX, scale };
    };

    // ── 1. Draw smooth body fill (segmented for perspective, NO stroke borders) ──
    const segments = Math.max(1, Math.ceil((bottomY - topY) / 12));
    const segH = (bottomY - topY) / segments;

    for (let s = 0; s < segments; s++) {
      const segTop = topY + s * segH;
      const segBot = Math.min(segTop + segH + 0.5, bottomY);

      const fadeAtTop = this._fadeIn(segTop, judgeLineY) * this._fadeOut(segTop, judgeLineY) * missAlpha;
      const fadeAtBot = this._fadeIn(segBot, judgeLineY) * this._fadeOut(segBot, judgeLineY) * missAlpha;
      const avgAlpha = (fadeAtTop + fadeAtBot) / 2;
      if (avgAlpha < 0.005) continue;

      const topEdge = getEdgeX(segTop);
      const botEdge = getEdgeX(segBot);

      ctx.save();
      ctx.globalAlpha = avgAlpha;

      // Body fill only — no stroke! Borders are drawn separately as continuous side lines
      ctx.fillStyle = isHolding ? this._withAlpha(color, 0.38) : this._withAlpha(color, 0.24);
      ctx.beginPath();
      ctx.moveTo(topEdge.left, segTop);
      ctx.lineTo(topEdge.right, segTop);
      ctx.lineTo(botEdge.right, segBot);
      ctx.lineTo(botEdge.left, segBot);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }

    // ── 2. Draw continuous side edge borders (left + right lines only) ──
    // This replaces per-segment strokes — eliminates horizontal stripes
    const borderAlpha = isHolding ? 0.85 : 0.55;
    const borderWidth = isHolding ? 2.5 : 1.5;

    ctx.save();
    // Left edge
    ctx.beginPath();
    const step = 4; // sub-pixel steps for smooth perspective curve
    for (let y = topY; y <= bottomY; y += step) {
      const edge = getEdgeX(y);
      const fade = this._fadeIn(y, judgeLineY) * this._fadeOut(y, judgeLineY) * missAlpha;
      if (fade < 0.005) continue;
      if (y === topY) {
        ctx.moveTo(edge.left, y);
      } else {
        ctx.lineTo(edge.left, y);
      }
    }
    // ensure we hit bottomY exactly
    {
      const edge = getEdgeX(bottomY);
      ctx.lineTo(edge.left, bottomY);
    }
    ctx.strokeStyle = this._withAlpha(color, borderAlpha);
    ctx.lineWidth = borderWidth;
    ctx.globalAlpha = 1;
    ctx.stroke();

    // Right edge
    ctx.beginPath();
    for (let y = topY; y <= bottomY; y += step) {
      const edge = getEdgeX(y);
      const fade = this._fadeIn(y, judgeLineY) * this._fadeOut(y, judgeLineY) * missAlpha;
      if (fade < 0.005) continue;
      if (y === topY) {
        ctx.moveTo(edge.right, y);
      } else {
        ctx.lineTo(edge.right, y);
      }
    }
    {
      const edge = getEdgeX(bottomY);
      ctx.lineTo(edge.right, bottomY);
    }
    ctx.strokeStyle = this._withAlpha(color, borderAlpha);
    ctx.lineWidth = borderWidth;
    ctx.stroke();
    ctx.restore();

    // ── 3. Draw center ribbon (continuous bright spine) ──
    ctx.save();
    // Outer glow ribbon
    ctx.beginPath();
    for (let y = topY; y <= bottomY; y += step) {
      const edge = getEdgeX(y);
      const fade = this._fadeIn(y, judgeLineY) * this._fadeOut(y, judgeLineY) * missAlpha;
      if (fade < 0.005) continue;
      if (y === topY) {
        ctx.moveTo(edge.cx, y);
      } else {
        ctx.lineTo(edge.cx, y);
      }
    }
    {
      const edge = getEdgeX(bottomY);
      ctx.lineTo(edge.cx, bottomY);
    }
    ctx.strokeStyle = isHolding ? this._withAlpha(color, 0.5) : this._withAlpha(color, 0.25);
    ctx.lineWidth = isHolding ? 8 : 4;
    ctx.stroke();

    // Inner bright spine
    ctx.beginPath();
    for (let y = topY; y <= bottomY; y += step) {
      const edge = getEdgeX(y);
      const fade = this._fadeIn(y, judgeLineY) * this._fadeOut(y, judgeLineY) * missAlpha;
      if (fade < 0.005) continue;
      if (y === topY) {
        ctx.moveTo(edge.cx, y);
      } else {
        ctx.lineTo(edge.cx, y);
      }
    }
    {
      const edge = getEdgeX(bottomY);
      ctx.lineTo(edge.cx, bottomY);
    }
    ctx.strokeStyle = isHolding ? '#ffffff' : this._withAlpha(color, 0.9);
    ctx.lineWidth = isHolding ? 3 : 1.5;
    ctx.stroke();
    ctx.restore();

    // ── 4. Draw LN tick markers — prominent Project Sekai style ──
    if (note.ticks && note.ticks.length > 0 && currentTime !== undefined) {
      const judgeLineYLocal = this._getJudgeLineY();
      for (let t = 0; t < note.ticks.length; t++) {
        const tickTime = note.ticks[t];
        const tickY = this._noteY(tickTime, currentTime, judgeLineYLocal);

        if (tickY < topY - 2 || tickY > bottomY + 2) continue;

        const tickFadeIn = this._fadeIn(tickY, judgeLineYLocal);
        const tickFadeOut = this._fadeOut(tickY, judgeLineYLocal);
        const tickAlpha = tickFadeIn * tickFadeOut * missAlpha;

        if (tickAlpha < 0.01) continue;

        const tickGeom = this._getLaneGeometry(note.lane, tickY, laneCount);
        const tickScale = this._getNoteScale(tickY);
        const tickPad = 5 * tickScale;
        const cx = tickGeom.centerX;
        const lineLeft = tickGeom.x + tickPad;
        const lineRight = tickGeom.x + tickGeom.width - tickPad;

        ctx.save();
        ctx.globalAlpha = tickAlpha;

        if (note._tickHit && note._tickHit[t]) {
          // ── Hit tick: bright white flash ──
          const ds = Math.max(6, 9 * tickScale);

          // Bright horizontal line across body
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3 * tickScale;
          ctx.globalAlpha = tickAlpha * 0.85;
          ctx.beginPath();
          ctx.moveTo(lineLeft, tickY);
          ctx.lineTo(lineRight, tickY);
          ctx.stroke();

          // Diamond shape
          ctx.fillStyle = '#ffffff';
          ctx.globalAlpha = tickAlpha * 0.95;
          ctx.beginPath();
          ctx.moveTo(cx, tickY - ds);
          ctx.lineTo(cx + ds, tickY);
          ctx.lineTo(cx, tickY + ds);
          ctx.lineTo(cx - ds, tickY);
          ctx.closePath();
          ctx.fill();
        } else if (note._tickMissed && note._tickMissed[t]) {
          // ── Missed tick: dim red ──
          const ds = Math.max(5, 7 * tickScale);

          // Red line
          ctx.strokeStyle = 'rgba(255,60,60,0.6)';
          ctx.lineWidth = 2 * tickScale;
          ctx.globalAlpha = tickAlpha * 0.5;
          ctx.beginPath();
          ctx.moveTo(lineLeft, tickY);
          ctx.lineTo(lineRight, tickY);
          ctx.stroke();

          // Red diamond
          ctx.fillStyle = 'rgba(255,60,60,0.7)';
          ctx.globalAlpha = tickAlpha * 0.6;
          ctx.beginPath();
          ctx.moveTo(cx, tickY - ds);
          ctx.lineTo(cx + ds, tickY);
          ctx.lineTo(cx, tickY + ds);
          ctx.lineTo(cx - ds, tickY);
          ctx.closePath();
          ctx.fill();
        } else {
          // ── Upcoming tick: prominent colored marker ──
          const ds = Math.max(5, 8 * tickScale);

          // Bright horizontal line across body — the main tick visual
          ctx.strokeStyle = isHolding ? '#ffffff' : this._withAlpha(color, 0.8);
          ctx.lineWidth = 2 * tickScale;
          ctx.globalAlpha = tickAlpha * (isHolding ? 0.75 : 0.6);
          ctx.beginPath();
          ctx.moveTo(lineLeft, tickY);
          ctx.lineTo(lineRight, tickY);
          ctx.stroke();

          // Diamond marker at center
          ctx.fillStyle = isHolding ? '#ffffff' : color;
          ctx.globalAlpha = tickAlpha * (isHolding ? 0.85 : 0.7);
          ctx.beginPath();
          ctx.moveTo(cx, tickY - ds);
          ctx.lineTo(cx + ds, tickY);
          ctx.lineTo(cx, tickY + ds);
          ctx.lineTo(cx - ds, tickY);
          ctx.closePath();
          ctx.fill();

          // Small glow around diamond
          if (tickScale > 0.5) {
            ctx.shadowColor = isHolding ? '#ffffff' : color;
            ctx.shadowBlur = 6 * tickScale;
            ctx.fillStyle = isHolding ? '#ffffff' : color;
            ctx.globalAlpha = tickAlpha * 0.3;
            ctx.beginPath();
            ctx.moveTo(cx, tickY - ds);
            ctx.lineTo(cx + ds, tickY);
            ctx.lineTo(cx, tickY + ds);
            ctx.lineTo(cx - ds, tickY);
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }

        ctx.restore();
      }
    }
  }

  _drawHoldCap(laneIndex, y, laneCount, color, alpha) {
    const ctx = this.ctx;
    const corners = this._getNoteCorners(laneIndex, y, laneCount);
    const r = Math.max(2, 8 * corners.scale);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    this._drawPerspectiveRoundRect(ctx, corners.tl.x, corners.tl.y, corners.tr.x, corners.tr.y, corners.br.x, corners.br.y, corners.bl.x, corners.bl.y, r);
    ctx.fill();

    // Subtle base glow — kiai glow is now drawn separately BEFORE notes via _drawKiaiNoteGlow
    const glowSprite = this._getGlowSprite(color);
    if (glowSprite) {
      const gs = Math.max(corners.width, corners.height) * 1.0 * corners.scale;
      ctx.globalAlpha = alpha * 0.06;
      ctx.drawImage(glowSprite, corners.centerX - gs / 2, y - gs / 2, gs, gs);
      ctx.globalAlpha = alpha;
    }

    const grad = ctx.createLinearGradient(corners.centerX, corners.tl.y, corners.centerX, corners.bl.y);
    grad.addColorStop(0, 'rgba(255,255,255,0.35)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.15)');
    ctx.fillStyle = grad;
    this._drawPerspectiveRoundRect(ctx, corners.tl.x, corners.tl.y, corners.tr.x, corners.tr.y, corners.br.x, corners.br.y, corners.bl.x, corners.bl.y, r);
    ctx.fill();
    ctx.restore();
  }

  _drawHoldGlow(laneIndex, judgeLineY, laneCount, color) {
    const ctx = this.ctx;
    const geom = this._getLaneGeometry(laneIndex, judgeLineY, laneCount);
    const pad = 4;
    const x = geom.x + pad;
    const w = geom.width - pad * 2;

    // Cycling pulse: gentle breathing animation
    const now = performance.now() * 0.001;
    const pulse = 0.7 + 0.3 * Math.sin(now * 4.0); // cycles at ~0.64Hz
    const columnH = 110 * pulse;

    ctx.save();
    const grad = ctx.createLinearGradient(0, judgeLineY - columnH, 0, judgeLineY);
    grad.addColorStop(0, 'transparent');
    grad.addColorStop(0.4, this._withAlpha(color, 0.08 * pulse));
    grad.addColorStop(1, this._withAlpha(color, 0.30 * pulse));
    ctx.fillStyle = grad;
    ctx.fillRect(x - 3, judgeLineY - columnH, w + 6, columnH);

    // Glow via pre-rendered sprite
    const holdGlowSprite = this._getGlowSprite(color);
    if (holdGlowSprite) {
      const gs = Math.max(w, columnH) * 1.2 * pulse;
      ctx.globalAlpha = 0.15 * pulse;
      ctx.drawImage(holdGlowSprite, x + w / 2 - gs / 2, judgeLineY - gs / 3, gs, gs);
    }

    const barH = 8;
    ctx.globalAlpha = 0.85 * pulse;
    ctx.fillStyle = color;
    ctx.fillRect(x, judgeLineY - barH / 2, w, barH);

    ctx.globalAlpha = 0.55 * pulse;
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

  /* ── LN Tick Hit Effects — small colored ring flash at judge line on tick ── */

  _drawTickEffects(delta) {
    if (this._tickEffectCount === 0) return;
    const ctx = this.ctx;
    const STRIDE = 8; // [centerX, y, width, life, maxLife, r, g, b]

    let write = 0;
    for (let i = 0; i < this._tickEffectCount; i++) {
      const base = i * STRIDE;
      this._tickEffectPool[base + 3] -= delta; // life
      if (this._tickEffectPool[base + 3] <= 0) continue;
      if (write !== i) {
        for (let j = 0; j < STRIDE; j++) this._tickEffectPool[write * STRIDE + j] = this._tickEffectPool[base + j];
      }
      write++;
    }
    this._tickEffectCount = write;
    if (write === 0) return;

    for (let i = 0; i < write; i++) {
      const base = i * STRIDE;
      const cx = this._tickEffectPool[base];       // center x
      const y = this._tickEffectPool[base + 1];     // y
      const w = this._tickEffectPool[base + 2];     // width
      const life = this._tickEffectPool[base + 3];
      const maxLife = this._tickEffectPool[base + 4];
      const r = Math.round(this._tickEffectPool[base + 5]);
      const g = Math.round(this._tickEffectPool[base + 6]);
      const b = Math.round(this._tickEffectPool[base + 7]);
      const ratio = life / maxLife;

      // Expanding ring effect — like hitting a note but smaller
      const expandProgress = 1 - ratio;
      const ringW = w * (0.5 + expandProgress * 0.6);
      const ringH = 6 + expandProgress * 10;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // Colored glow ring
      ctx.globalAlpha = ratio * 0.5;
      const grad = ctx.createLinearGradient(0, y - ringH, 0, y + ringH);
      grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
      grad.addColorStop(0.3, `rgba(${r},${g},${b},${ratio * 0.4})`);
      grad.addColorStop(0.5, `rgba(${r},${g},${b},${ratio * 0.7})`);
      grad.addColorStop(0.7, `rgba(${r},${g},${b},${ratio * 0.4})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(cx - ringW / 2, y - ringH, ringW, ringH * 2);

      // White center flash
      ctx.globalAlpha = ratio * 0.6;
      const coreW = w * 0.5;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - coreW / 2, y - 2, coreW, 4);

      ctx.globalCompositeOperation = 'source-over';
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
    const baseBarWidth = 20;
    const backPad = 4; // padding for backing around the bar

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

    // ── Backing: black semi-transparent panel with rounded perspective shape ──
    // Slightly wider than the bar to create a visible underlay
    const bkPadTop = backPad * topScale;
    const bkPadBot = backPad;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.moveTo(topBarX - bkPadTop, barTopY - bkPadTop);
    ctx.lineTo(topBarX + topBarWidth + bkPadTop, barTopY - bkPadTop);
    ctx.lineTo(botBarX + botBarWidth + bkPadBot, barBotY + bkPadBot);
    ctx.lineTo(botBarX - bkPadBot, barBotY + bkPadBot);
    ctx.closePath();
    ctx.fill();

    // Subtle inner border on the backing
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(topBarX - bkPadTop, barTopY - bkPadTop);
    ctx.lineTo(topBarX + topBarWidth + bkPadTop, barTopY - bkPadTop);
    ctx.lineTo(botBarX + botBarWidth + bkPadBot, barBotY + bkPadBot);
    ctx.lineTo(botBarX - bkPadBot, barBotY + bkPadBot);
    ctx.closePath();
    ctx.stroke();

    // ── Background bar (inside backing) ──
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.beginPath();
    ctx.moveTo(topBarX, barTopY);
    ctx.lineTo(topBarX + topBarWidth, barTopY);
    ctx.lineTo(botBarX + botBarWidth, barBotY);
    ctx.lineTo(botBarX, barBotY);
    ctx.closePath();
    ctx.fill();

    // ── Health fill with glow ──
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

      // Glow behind the fill
      ctx.save();
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 12;
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.moveTo(fillTopBarX, fillTopY);
      ctx.lineTo(fillTopBarX + fillTopBarWidth, fillTopY);
      ctx.lineTo(botBarX + botBarWidth, barBotY);
      ctx.lineTo(botBarX, barBotY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Solid fill on top
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.moveTo(fillTopBarX, fillTopY);
      ctx.lineTo(fillTopBarX + fillTopBarWidth, fillTopY);
      ctx.lineTo(botBarX + botBarWidth, barBotY);
      ctx.lineTo(botBarX, barBotY);
      ctx.closePath();
      ctx.fill();

      // Bright top edge highlight
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(fillTopBarX, fillTopY);
      ctx.lineTo(fillTopBarX + fillTopBarWidth, fillTopY);
      ctx.stroke();
      ctx.globalAlpha = 1;
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
    if (this._useSekaiEffects) {
      this._drawEffectsSekai();
    } else {
      this._drawEffectsLegacy();
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     LEGACY EFFECTS — kept as fallback (set _useSekaiEffects = false)
     ══════════════════════════════════════════════════════════════════ */
  _drawEffectsLegacy() {
    const ctx = this.ctx;
    const gfx = this._gfx();
    const delta = this._frameDelta || 0.016;

    for (const e of this._effectsPool) {
      if (!e.active) continue;
      e.age += delta;
      const dur = 0.45;
      const p = e.age / dur;
      if (p >= 1) { e.active = false; continue; }

      const ep = 1 - (1 - p) * (1 - p); // ease-out quad
      const r = Math.max(0, e.maxRadius * ep);
      const fade = 1 - p * p;
      const isPerfect = e.type === 'perfect';
      const isGreat = e.type === 'great';

      // ── Layer 0: Additive outer bloom (large, soft) ──
      const sprite = this._getGlowSprite(e.color);
      if (isPerfect || isGreat) {
        const bloomSize = r * 3.2;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = fade * 0.25 * gfx;
        ctx.drawImage(sprite, e.x - bloomSize / 2, e.y - bloomSize / 2, bloomSize, bloomSize);
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
      }

      // ── Layer 1: Expanding radial gradient flash ──
      const flashSize = r * 2.4;
      ctx.save();
      ctx.globalAlpha = fade * 0.7 * gfx;
      ctx.drawImage(sprite, e.x - flashSize / 2, e.y - flashSize / 2, flashSize, flashSize);
      ctx.restore();

      // ── Layer 2: White center flash (bigger, longer) ──
      if (p < 0.28 && this._whiteGlow) {
        const fP = p / 0.28;
        const fSize = isPerfect ? (36 + 50 * (1 - fP)) * 2 : (28 + 36 * (1 - fP)) * 2;
        ctx.save();
        ctx.globalAlpha = (1 - fP) * 0.85;
        ctx.drawImage(this._whiteGlow, e.x - fSize / 2, e.y - fSize / 2, fSize, fSize);
        ctx.restore();
      }

      // ── Layer 3: Expanding ring (thicker, brighter) ──
      ctx.save();
      ctx.globalAlpha = fade * 0.55;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(0.5, (isPerfect ? 4.0 : 3.0) * (1 - p));
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // ── Layer 3b: Outer colored ring ──
      ctx.save();
      ctx.globalAlpha = fade * 0.35;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = Math.max(0.5, (isPerfect ? 2.5 : 2.0) * (1 - p));
      ctx.beginPath();
      ctx.arc(e.x, e.y, Math.max(0, r * 0.65), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // ── Layer 4: Second inner ring for perfect/great ──
      if (isPerfect || isGreat) {
        ctx.save();
        ctx.globalAlpha = fade * 0.25;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(0.5, 1.5 * (1 - p));
        ctx.beginPath();
        ctx.arc(e.x, e.y, Math.max(0, r * 0.35), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

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

  /* ══════════════════════════════════════════════════════════════════
     PROJECT SEKAI STYLE HIT EFFECTS
     - Sharp diamond-star burst particles
     - Focused bright flash (not blurry bloom)
     - Color-coded by judgement quality
     - Lane-shaped perspective flash
     ══════════════════════════════════════════════════════════════════ */
  _drawEffectsSekai() {
    const ctx = this.ctx;
    const delta = this._frameDelta || 0.016;

    for (const e of this._effectsPool) {
      if (!e.active) continue;
      e.age += delta;
      const dur = 0.35;
      const p = e.age / dur;
      if (p >= 1) { e.active = false; continue; }

      const easeOut = 1 - (1 - p) * (1 - p);
      const fade = 1 - p * p;
      const isPerfect = e.type === 'perfect';
      const isGreat = e.type === 'great';
      const sprite = this._getGlowSprite(e.color);

      // ── Layer 1: Sharp white flash at center (fast, bright, focused) ──
      if (p < 0.2) {
        const flashP = p / 0.2;
        const flashSize = isPerfect ? 60 : isGreat ? 45 : 30;
        const fSize = flashSize * (1 - flashP * 0.5);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (1 - flashP) * (isPerfect ? 0.9 : 0.7);
        if (this._whiteGlow) {
          ctx.drawImage(this._whiteGlow, e.x - fSize, e.y - fSize, fSize * 2, fSize * 2);
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
      }

      // ── Layer 2: Focused color glow (tight, not blurry) ──
      {
        const glowSize = (isPerfect ? 50 : isGreat ? 40 : 25) * easeOut;
        ctx.save();
        ctx.globalAlpha = fade * 0.4;
        ctx.drawImage(sprite, e.x - glowSize, e.y - glowSize, glowSize * 2, glowSize * 2);
        ctx.restore();
      }

      // ── Layer 3: Diamond-star burst particles ──
      if (e.sekaiParticles && e.sekaiParticles.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        for (const pt of e.sekaiParticles) {
          const dP = Math.min(1, e.age / pt.life);
          if (dP >= 1) continue;

          const dist = pt.speed * easeOut;
          const px = e.x + Math.cos(pt.angle) * dist;
          const py = e.y + Math.sin(pt.angle) * dist;
          const sz = pt.size * (1 - dP * 0.6);
          const alpha = fade * (1 - dP) * 0.85;

          // Rotating diamond shape
          const rot = pt.rotation + pt.rotSpeed * e.age;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(rot);
          ctx.globalAlpha = alpha;

          // White diamond
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(0, -sz);
          ctx.lineTo(sz * 0.4, 0);
          ctx.lineTo(0, sz);
          ctx.lineTo(-sz * 0.4, 0);
          ctx.closePath();
          ctx.fill();

          // Color glow halo
          const haloSz = sz * 3;
          ctx.globalAlpha = alpha * 0.4;
          ctx.drawImage(sprite, -haloSz, -haloSz, haloSz * 2, haloSz * 2);

          ctx.restore();
        }

        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
      }

      // ── Layer 4: Thin expanding ring (sharp, not thick) ──
      {
        const ringR = (isPerfect ? 80 : isGreat ? 60 : 35) * easeOut;
        ctx.save();
        ctx.globalAlpha = fade * 0.3;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = Math.max(0.5, 1.5 * (1 - p));
        ctx.beginPath();
        ctx.arc(e.x, e.y, ringR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
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
    if (!hex || hex.length < 7) return { r: 200, g: 200, b: 200 };
    // Use cache to avoid repeated parseInt on the same hex values every frame
    if (this._rgbCache && this._rgbCacheKey === hex) return this._rgbCache;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return { r: 200, g: 200, b: 200 };
    const result = { r, g, b };
    this._rgbCacheKey = hex;
    this._rgbCache = result;
    return result;
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
