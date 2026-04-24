const LANE_COLORS = [
  '#CCFF33', '#FFD700', '#FF3355', '#BF5FFF',
  '#CCFF33', '#FFD700', '#FF3355', '#BF5FFF'
];

export default class NoteRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scrollSpeed = 400;
    this.noteHeight = 20;
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

    // Hold spark effects — flat arrays for fast iteration
    this._holdSparkPool = [];
    this._holdSparkCount = 0;

    // Optimization: cached static background
    this._bgCacheCanvas = null;
    this._bgCacheLaneCount = -1;
    this._bgCacheWidth = 0;
    this._bgCacheHeight = 0;
    this._bgCacheBgImage = null;

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
    img.onload = () => { this._bgImage = img; this.invalidateBackgroundCache(); };
    img.src = url;
  }

  clearBackground() {
    this._bgImage = null;
    this._bgLoadAttempted = false;
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
    for (const color of LANE_COLORS) {
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

  getLaneHitPosition(lane, laneCount) {
    const sa = this.safeArea;
    const judgeLineY = sa.y + sa.h * 0.92;
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

  render({ notes, currentTime, laneCount, delta = 0.016 }) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    this._frameDelta = delta;

    // Smooth HP animation
    const healthDiff = this._health - this._displayHealth;
    if (Math.abs(healthDiff) > 0.1) {
      this._displayHealth += healthDiff * Math.min(1, delta * 7);
    } else {
      this._displayHealth = this._health;
    }

    this._drawBackgroundCached(laneCount);
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
      || this._bgCacheBgImage !== this._bgImage;

    if (needsRebuild) {
      this._rebuildBackgroundCache(laneCount);
    }

    if (this._bgCacheCanvas) {
      this.ctx.drawImage(this._bgCacheCanvas, 0, 0, this.w, this.h);
    }
  }

  /** Rebuild the offscreen background cache — PERSPECTIVE (converging lanes) */
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

    // Draw background image
    if (this._bgImage) {
      cctx.save();
      cctx.globalAlpha = 0.15;
      const ia = this._bgImage.width / this._bgImage.height;
      const ca = this.w / this.h;
      let dw, dh, dx, dy;
      if (ca > ia) { dw = this.w; dh = this.w / ia; dx = 0; dy = (this.h - dh) / 2; }
      else { dh = this.h; dw = this.h * ia; dx = (this.w - dw) / 2; dy = 0; }
      cctx.drawImage(this._bgImage, dx, dy, dw, dh);
      cctx.restore();
    }

    // ── Perspective: converging trapezoidal lanes ──
    const topY = this._getTopY();
    const judgeLineY = this._getJudgeLineY();
    const bottomY = this._getBottomY();
    const sa = this.safeArea;
    const cx = sa.x + sa.w / 2;
    const fullPw = sa.w * 0.65; // Wider playfield (was 0.55)

    for (let i = 0; i < laneCount; i++) {
      const topGeom = this._getLaneGeometry(i, topY, laneCount);
      const judgeGeom = this._getLaneGeometry(i, judgeLineY, laneCount);

      cctx.fillStyle = i % 2 === 0
        ? 'rgba(10,7,5,0.88)'
        : 'rgba(18,13,9,0.88)';
      cctx.beginPath();
      cctx.moveTo(topGeom.x, topY);
      cctx.lineTo(topGeom.x + topGeom.width, topY);
      cctx.lineTo(judgeGeom.x + judgeGeom.width, judgeLineY);
      cctx.lineTo(judgeGeom.x, judgeLineY);
      cctx.closePath();
      cctx.fill();

      // Below judge line
      cctx.fillRect(judgeGeom.x, judgeLineY, judgeGeom.width, bottomY - judgeLineY);
    }

    // Depth gradient overlay
    const depthGrad = cctx.createLinearGradient(0, topY, 0, judgeLineY);
    depthGrad.addColorStop(0, 'rgba(0,0,0,0.35)');
    depthGrad.addColorStop(0.3, 'rgba(0,0,0,0.15)');
    depthGrad.addColorStop(0.7, 'rgba(0,0,0,0)');
    depthGrad.addColorStop(1, 'rgba(0,0,0,0)');
    cctx.fillStyle = depthGrad;
    cctx.fillRect(cx - fullPw / 2, topY, fullPw, judgeLineY - topY);

    // Fade overlay below judge line
    for (let i = 0; i < laneCount; i++) {
      const laneGeom = this._getLaneGeometry(i, judgeLineY, laneCount);
      const laneColor = LANE_COLORS[i % LANE_COLORS.length];
      const rgb = this._hexToRgb(laneColor);
      const fadeGrad = cctx.createLinearGradient(0, judgeLineY, 0, bottomY);
      fadeGrad.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},0.25)`);
      fadeGrad.addColorStop(0.08, `rgba(${rgb.r},${rgb.g},${rgb.b},0.12)`);
      fadeGrad.addColorStop(0.25, `rgba(${rgb.r},${rgb.g},${rgb.b},0.04)`);
      fadeGrad.addColorStop(0.5, 'rgba(0,0,0,0.15)');
      fadeGrad.addColorStop(1, 'rgba(0,0,0,0.95)');
      cctx.fillStyle = fadeGrad;
      cctx.fillRect(laneGeom.x, judgeLineY, laneGeom.width, bottomY - judgeLineY);
    }

    // Bright glow strip right below judge line
    const glowH = 30;
    for (let i = 0; i < laneCount; i++) {
      const laneGeom = this._getLaneGeometry(i, judgeLineY, laneCount);
      const glowGrad = cctx.createLinearGradient(0, judgeLineY, 0, judgeLineY + glowH);
      glowGrad.addColorStop(0, 'rgba(255,255,255,0.18)');
      glowGrad.addColorStop(0.3, 'rgba(255,255,255,0.05)');
      glowGrad.addColorStop(1, 'rgba(255,255,255,0)');
      cctx.fillStyle = glowGrad;
      cctx.fillRect(laneGeom.x, judgeLineY, laneGeom.width, glowH);
    }

    // Lane dividers — within the perspective trapezoid only
    for (let i = 0; i <= laneCount; i++) {
      cctx.save();
      const divGrad = cctx.createLinearGradient(0, topY, 0, judgeLineY);
      divGrad.addColorStop(0, 'rgba(170,255,0,0.02)');
      divGrad.addColorStop(0.6, 'rgba(170,255,0,0.04)');
      divGrad.addColorStop(0.85, 'rgba(255,255,255,0.06)');
      divGrad.addColorStop(1, 'rgba(255,255,255,0)');
      cctx.strokeStyle = divGrad;
      cctx.lineWidth = 1;
      cctx.beginPath();

      const topG = this._getLaneGeometry(i, topY, laneCount);
      const judgeG = this._getLaneGeometry(i, judgeLineY, laneCount);
      cctx.moveTo(topG.x, topY);
      cctx.lineTo(judgeG.x, judgeLineY);
      cctx.stroke();
      cctx.restore();
    }

    // Side edges
    cctx.save();
    const leftTop = this._getLaneGeometry(0, topY, laneCount);
    const leftJudge = this._getLaneGeometry(0, judgeLineY, laneCount);
    const rightTop = this._getLaneGeometry(laneCount, topY, laneCount);
    const rightJudge = this._getLaneGeometry(laneCount, judgeLineY, laneCount);

    cctx.strokeStyle = 'rgba(170,255,0,0.06)';
    cctx.lineWidth = 2;
    cctx.shadowBlur = 8;
    cctx.shadowColor = 'rgba(170,255,0,0.15)';

    cctx.beginPath();
    cctx.moveTo(leftTop.x, topY);
    cctx.lineTo(leftJudge.x, judgeLineY);
    cctx.stroke();

    cctx.beginPath();
    cctx.moveTo(rightTop.x, topY);
    cctx.lineTo(rightJudge.x, judgeLineY);
    cctx.stroke();
    cctx.restore();

    // Update cache metadata
    this._bgCacheLaneCount = laneCount;
    this._bgCacheWidth = this.w;
    this._bgCacheHeight = this.h;
    this._bgCacheBgImage = this._bgImage;
  }

  invalidateBackgroundCache() {
    this._bgCacheLaneCount = -1;
    this._bgCacheBgImage = null;
  }

  /* ── Layout (Perspective) ── */

  _getJudgeLineY() {
    return this.safeArea.y + this.safeArea.h * 0.92;
  }

  _getTopY() {
    return this.safeArea.y;
  }

  _getBottomY() {
    return this.safeArea.y + this.safeArea.h * 1.12;
  }

  _getPerspectiveScale(y) {
    const judgeLineY = this._getJudgeLineY();
    const topY = this._getTopY();
    const t = Math.max(0, Math.min(1, (y - topY) / (judgeLineY - topY)));
    return 0.3 + 0.7 * t;
  }

  _getLaneGeometry(laneIndex, y, laneCount) {
    const sa = this.safeArea;
    const pw = sa.w * 0.65; // Wider playfield (was 0.55)
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

  _drawNotes(notes, currentTime, laneCount) {
    const judgeLineY = this._getJudgeLineY();
    const topY = this._getTopY();
    const clipTop = topY - 80;
    const clipBottom = judgeLineY + 30;

    // Draw hold note bodies first
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      if (note.type === 'hold' && note.duration >= NoteRenderer.MIN_HOLD_DURATION) {
        this._drawHoldNote(note, currentTime, laneCount, judgeLineY, topY);
      }
    }

    // Draw tap notes
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      if (note.type === 'hold' && note.duration >= NoteRenderer.MIN_HOLD_DURATION) continue;

      if (note.hit && note.judgement !== 'miss') continue;
      if (note.judgement === 'miss' && currentTime - note.time > 0.5) continue;

      const noteY = this._noteY(note.time, currentTime, judgeLineY);
      if (noteY < clipTop || noteY > clipBottom) continue;

      const fadeIn = this._fadeIn(noteY, judgeLineY);
      const alpha = note.judgement === 'miss' ? 0.3 : 1;
      const color = LANE_COLORS[note.lane % LANE_COLORS.length];
      this._drawTapNote(note.lane, noteY, laneCount, color, fadeIn * alpha);
    }
  }

  _noteY(time, currentTime, judgeLineY) {
    const distFromJudge = (time - currentTime) * this.scrollSpeed;
    return judgeLineY - distFromJudge;
  }

  _getNoteScale(noteY) {
    const judgeLineY = this._getJudgeLineY();
    const topY = this._getTopY();
    const t = Math.max(0, Math.min(1, (noteY - topY) / (judgeLineY - topY)));
    return 0.3 + 0.7 * t;
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

    // Glow via pre-rendered sprite (no shadowBlur)
    const glowSprite = this._getGlowSprite(color);
    if (glowSprite) {
      const gs = Math.max(w, h) * 2.5 * scale;
      ctx.globalAlpha = alpha * 0.35;
      ctx.drawImage(glowSprite, x + w / 2 - gs / 2, noteY - gs / 2, gs, gs);
      ctx.globalAlpha = alpha;
    }
    const grad = ctx.createLinearGradient(x, noteY - h / 2, x, noteY + h / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.4)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.05)');
    grad.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = grad;
    this._roundRect(ctx, x, noteY - h / 2, w, h, r);
    ctx.fill();
    ctx.restore();
  }

  /* ── Hold note ── */

  _drawHoldNote(note, currentTime, laneCount, judgeLineY, topY) {
    const headTime = note.time;
    const tailTime = note.time + note.duration;
    const color = LANE_COLORS[note.lane % LANE_COLORS.length];

    const isHolding = note.hit && note.judgement !== 'miss' && !note.released;
    const isMissed = note.judgement === 'miss';

    if (isMissed && currentTime - headTime > 0.5) return;
    if (note.released && !isMissed) return;

    const missAlpha = isMissed ? 0.3 : 1;

    const rawHeadY = this._noteY(headTime, currentTime, judgeLineY);
    const headY = isHolding ? judgeLineY : rawHeadY;
    const tailY = this._noteY(tailTime, currentTime, judgeLineY);

    const clipTop = topY - 40;
    const clipBottom = judgeLineY;

    const bodyTop = Math.max(tailY, clipTop);
    const bodyBottom = Math.min(headY, clipBottom);

    // Draw body with per-pixel gradient fade
    if (bodyTop < bodyBottom && bodyBottom > clipTop && bodyTop < clipBottom) {
      this._drawHoldBody(note, laneCount, color, bodyTop, bodyBottom, judgeLineY, missAlpha, isHolding);
    }

    // Draw tail cap with fade-in
    if (tailY >= clipTop && tailY <= clipBottom) {
      const fadeIn = this._fadeIn(tailY, judgeLineY);
      this._drawHoldCap(note.lane, tailY, laneCount, color, fadeIn * missAlpha);
    }

    // Draw head cap with fade-in (only if NOT holding)
    if (!isHolding && headY >= clipTop && headY <= clipBottom) {
      const fadeIn = this._fadeIn(headY, judgeLineY);
      this._drawHoldCap(note.lane, headY, laneCount, color, fadeIn * missAlpha);
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
  _drawHoldBody(note, laneCount, color, topY, bottomY, judgeLineY, missAlpha, isHolding) {
    const ctx = this.ctx;
    const gfx = this._gfx();

    // Draw in N segments, each with its own alpha based on _fadeIn at that Y position
    const segments = Math.max(1, Math.ceil((bottomY - topY) / 12)); // one segment per ~12px (perf)
    const segH = (bottomY - topY) / segments;

    for (let s = 0; s < segments; s++) {
      const segTop = topY + s * segH;
      const segBot = segTop + segH + 0.5; // +0.5 to avoid gaps

      // Fade alpha: gradient from tail fade to head full opacity
      const fadeAtTop = this._fadeIn(segTop, judgeLineY) * missAlpha;
      const fadeAtBot = this._fadeIn(segBot, judgeLineY) * missAlpha;
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

    // Glow via pre-rendered sprite (no shadowBlur)
    const glowSprite = this._getGlowSprite(color);
    if (glowSprite) {
      const gs = Math.max(w, h) * 2.5 * scale;
      ctx.globalAlpha = alpha * 0.3;
      ctx.drawImage(glowSprite, x + w / 2 - gs / 2, y - gs / 2, gs, gs);
      ctx.globalAlpha = alpha;
    }
    const grad = ctx.createLinearGradient(x, y - h / 2, x, y + h / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.4)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.2)');
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
    const maxR = Math.max(sa.w, sa.h) * 0.8;
    const minR = Math.min(sa.w, sa.h) * 0.25;

    const intensity = (1 - health / 40) * 0.5;
    const pulse = health < 20 ? (0.7 + 0.3 * Math.sin(performance.now() * 0.005)) : 1;

    const grad = ctx.createRadialGradient(cx, cy, minR, cx, cy, maxR);
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
      const r = e.maxRadius * ep;
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
      ctx.arc(e.x, e.y, r * 0.55, 0, Math.PI * 2);
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
          ctx.arc(dx, dy, sz, 0, Math.PI * 2);
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
