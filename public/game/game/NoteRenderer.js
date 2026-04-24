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
    this._bgImage = null;
    this._bgLoadAttempted = false;
    this.safeArea = { x: 0, y: 0, w: 0, h: 0 };
    this._safeAreaExplicit = false;
    this._health = 100;
    this._displayHealth = 100;
    this._laneGlows = new Map();
    this._holdNoteDebugLogged = false;
    this._graphicsPreset = 'disco';

    // Hold spark effects — continuous particles while holding
    this._holdSparks = new Map();

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

  addEffect(x, y, color, type = 'ring') {
    if (this._graphicsPreset === 'low') return;
    const effect = this._effectsPool[this._effectIndex % 64];
    effect.active = true;
    effect.x = x; effect.y = y;
    effect.radius = 5;
    effect.maxRadius = type === 'perfect' ? 70 : type === 'great' ? 55 : 40;
    effect.opacity = 1; effect.color = color; effect.age = 0; effect.type = type;
    effect.particles = [];
    effect.sparks = [];
    effect.rays = [];

    if (type === 'perfect' || type === 'great') {
      // Splash particles — colored dots that fly outward
      const pCount = type === 'perfect' ? 14 : 8;
      for (let i = 0; i < pCount; i++) {
        const angle = (Math.PI * 2 / pCount) * i + (Math.random() - 0.5) * 0.5;
        const speed = 60 + Math.random() * 80;
        const size = 1.5 + Math.random() * 2.5;
        effect.particles.push({ angle, speed, size, life: 0.5 + Math.random() * 0.3 });
      }
      // Bright sparks — small fast white dots
      const sCount = type === 'perfect' ? 8 : 4;
      for (let i = 0; i < sCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 120 + Math.random() * 100;
        effect.sparks.push({ angle, speed, size: 0.8 + Math.random() * 1.2 });
      }
      // Rays — thin bright lines radiating outward (perfect only)
      if (type === 'perfect') {
        const rCount = 6;
        for (let i = 0; i < rCount; i++) {
          const angle = (Math.PI * 2 / rCount) * i + 0.26;
          const length = 30 + Math.random() * 20;
          effect.rays.push({ angle, length });
        }
      }
    } else {
      // Simple ring effect for good/bad
      const pCount = 4;
      for (let i = 0; i < pCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 40 + Math.random() * 40;
        effect.particles.push({ angle, speed, size: 1.5, life: 0.3 });
      }
    }
    this._effectIndex++;
  }

  /** Add a hold-note spark — called continuously while holding */
  addHoldSpark(x, y, color) {
    if (this._graphicsPreset === 'low') return;
    if (!this._holdSparks.has(color)) {
      this._holdSparks.set(color, []);
    }
    const pool = this._holdSparks.get(color);
    if (pool.length > 24) return; // limit sparks per color
    // Create 2-3 sparks per call
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      pool.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y + Math.random() * 6,
        vx: (Math.random() - 0.5) * 30,
        vy: -(40 + Math.random() * 80), // rise upward
        life: 0.3 + Math.random() * 0.4,
        maxLife: 0.3 + Math.random() * 0.4,
        size: 1 + Math.random() * 2,
        color
      });
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
    this._holdSparks.clear();
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

      if (this._graphicsPreset === 'disco') {
        const outerGrad = ctx.createRadialGradient(cx, judgeLineY, 0, cx, judgeLineY, halfW * 1.8);
        outerGrad.addColorStop(0, this._withAlpha(glow.color, 0.5 * glow.intensity));
        outerGrad.addColorStop(0.4, this._withAlpha(glow.color, 0.2 * glow.intensity));
        outerGrad.addColorStop(1, 'transparent');
        ctx.globalAlpha = 1;
        ctx.fillStyle = outerGrad;
        ctx.shadowBlur = 40 * glow.intensity * gfx;
        ctx.shadowColor = glow.color;
        ctx.fillRect(cx - halfW * 1.8, judgeLineY - barH * 2, halfW * 3.6, barH * 4);
      }

      const coreGrad = ctx.createLinearGradient(cx - halfW, 0, cx + halfW, 0);
      coreGrad.addColorStop(0, 'transparent');
      coreGrad.addColorStop(0.15, glow.color);
      coreGrad.addColorStop(0.5, '#ffffff');
      coreGrad.addColorStop(0.85, glow.color);
      coreGrad.addColorStop(1, 'transparent');
      ctx.globalAlpha = glow.intensity * 0.8;
      ctx.shadowBlur = 20 * glow.intensity * gfx;
      ctx.shadowColor = glow.color;
      ctx.fillStyle = coreGrad;
      ctx.fillRect(cx - halfW, judgeLineY - barH / 2, halfW * 2, barH);

      ctx.globalAlpha = glow.intensity * 0.9;
      ctx.shadowBlur = 12 * glow.intensity * gfx;
      ctx.shadowColor = '#ffffff';
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
    ctx.shadowBlur = 14 * this._gfx() * scale;
    ctx.shadowColor = color;
    ctx.fillStyle = color;
    this._roundRect(ctx, x, noteY - h / 2, w, h, r);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
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
    const segments = Math.max(1, Math.ceil((bottomY - topY) / 4)); // one segment per ~4px
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

      // Body fill
      ctx.fillStyle = isHolding ? this._withAlpha(color, 0.30) : this._withAlpha(color, 0.18);
      ctx.shadowBlur = (isHolding ? 20 : 8) * gfx * scale;
      ctx.shadowColor = color;
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

      // Center glow line for this segment (draw separately with its own alpha)
      ctx.save();
      ctx.globalAlpha = avgAlpha * (isHolding ? 0.4 : 0.2);
      ctx.shadowBlur = (isHolding ? 20 : 12) * gfx * scale;
      ctx.shadowColor = color;
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
    ctx.shadowBlur = 12 * this._gfx() * scale;
    ctx.shadowColor = color;
    ctx.fillStyle = color;
    this._roundRect(ctx, x, y - h / 2, w, h, r);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
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
    ctx.shadowBlur = 30 * gfx;
    ctx.shadowColor = color;
    ctx.fillRect(x - 3, judgeLineY - columnH, w + 6, columnH);

    const barH = 10;
    ctx.globalAlpha = 0.95;
    ctx.shadowBlur = 30 * gfx;
    ctx.fillStyle = color;
    ctx.fillRect(x, judgeLineY - barH / 2, w, barH);

    ctx.shadowBlur = 0;
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
      ctx.shadowBlur = 16 * gfx;
      ctx.shadowColor = glowColor;
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
    ctx.shadowBlur = 45 * gfx;
    ctx.shadowColor = 'rgba(255,255,255,0.7)';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(startX - 4, judgeLineY - 6, totalWidth + 8, 12);
    ctx.restore();

    ctx.save();
    ctx.shadowBlur = 25 * gfx;
    ctx.shadowColor = 'rgba(255,255,255,0.8)';
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
    ctx.shadowBlur = 40 * gfx;
    ctx.shadowColor = 'rgba(255,255,255,0.6)';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(startX + 2, judgeLineY - 1.5, totalWidth - 4, 3);
    ctx.restore();
  }

  /* ── Hit Effects — modern splash, sparks, and rays ── */

  _drawEffects() {
    if (this._graphicsPreset === 'low') return;
    const ctx = this.ctx;
    const gfx = this._gfx();
    const delta = this._frameDelta || 0.016;

    for (const e of this._effectsPool) {
      if (!e.active) continue;
      e.age += delta;
      const dur = 0.4; // slightly longer for more dramatic effect
      const p = e.age / dur;
      if (p >= 1) { e.active = false; continue; }

      // Eased progress
      const ep = 1 - Math.pow(1 - p, 3); // ease-out cubic
      e.radius = e.maxRadius * ep;
      e.opacity = 1 - p * p; // quadratic fade

      // ── Outer ring ──
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = e.opacity * 0.3;
      ctx.lineWidth = Math.max(0.5, 2.5 * (1 - p));
      ctx.shadowBlur = 15 * gfx;
      ctx.shadowColor = e.color;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // ── Inner colored ring ──
      ctx.save();
      ctx.strokeStyle = e.color;
      ctx.globalAlpha = e.opacity * 0.25;
      ctx.lineWidth = Math.max(0.5, 1.5 * (1 - p));
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius * 0.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // ── Bright center flash ──
      if (p < 0.2) {
        ctx.save();
        const flashAlpha = (0.2 - p) / 0.2;
        ctx.globalAlpha = flashAlpha * 0.35;
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 20 * gfx;
        ctx.shadowColor = e.color;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 22 * (1 - p * 2), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // ── Rays (perfect only) ──
      if (e.rays.length > 0 && this._graphicsPreset === 'disco') {
        ctx.save();
        ctx.globalAlpha = e.opacity * 0.5;
        ctx.strokeStyle = '#ffffff';
        ctx.shadowBlur = 8 * gfx;
        ctx.shadowColor = e.color;
        for (const ray of e.rays) {
          const rayLen = ray.length * ep;
          const innerR = 10 * (1 - p);
          const outerR = innerR + rayLen;
          ctx.lineWidth = Math.max(0.3, 1.5 * (1 - p));
          ctx.beginPath();
          ctx.moveTo(e.x + Math.cos(ray.angle) * innerR, e.y + Math.sin(ray.angle) * innerR);
          ctx.lineTo(e.x + Math.cos(ray.angle) * outerR, e.y + Math.sin(ray.angle) * outerR);
          ctx.stroke();
        }
        ctx.restore();
      }

      // ── Splash particles — colored dots ──
      if (e.particles.length > 0) {
        ctx.save();
        for (const pt of e.particles) {
          const ptLife = pt.life || 0.5;
          const ptP = Math.min(1, e.age / ptLife);
          if (ptP >= 1) continue;
          const ptOp = 1 - ptP * ptP;
          const d = pt.speed * ep;
          const px = e.x + Math.cos(pt.angle) * d;
          const py = e.y + Math.sin(pt.angle) * d - 10 * ptP; // slight upward drift
          const sz = pt.size * (1 - ptP * 0.6);

          ctx.globalAlpha = ptOp * 0.7;
          ctx.fillStyle = e.color;
          ctx.shadowBlur = 6 * gfx;
          ctx.shadowColor = e.color;
          ctx.beginPath();
          ctx.arc(px, py, sz, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // ── Sparks — fast white dots ──
      if (e.sparks.length > 0 && this._graphicsPreset === 'disco') {
        ctx.save();
        for (const sp of e.sparks) {
          const spP = Math.min(1, p * 1.5); // sparks die faster
          if (spP >= 1) continue;
          const spOp = 1 - spP;
          const d = sp.speed * ep;
          const px = e.x + Math.cos(sp.angle) * d;
          const py = e.y + Math.sin(sp.angle) * d - 15 * spP;
          const sz = sp.size * (1 - spP);

          ctx.globalAlpha = spOp * 0.9;
          ctx.fillStyle = '#ffffff';
          ctx.shadowBlur = 4 * gfx;
          ctx.shadowColor = e.color;
          ctx.beginPath();
          ctx.arc(px, py, sz, 0, Math.PI * 2);
          ctx.fill();

          // Spark trail
          if (spOp > 0.3) {
            const trailD = sp.speed * ep * 0.7;
            const tx = e.x + Math.cos(sp.angle) * trailD;
            const ty = e.y + Math.sin(sp.angle) * trailD - 10 * spP;
            ctx.globalAlpha = spOp * 0.3;
            ctx.lineWidth = sz * 0.8;
            ctx.strokeStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(tx, ty);
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    }
  }

  /* ── Hold Sparks — continuous rising particles while holding ── */

  _drawHoldSparks() {
    if (this._graphicsPreset === 'low') return;
    const ctx = this.ctx;
    const gfx = this._gfx();
    const delta = this._frameDelta || 0.016;

    for (const [color, pool] of this._holdSparks) {
      if (pool.length === 0) {
        this._holdSparks.delete(color);
        continue;
      }

      for (let i = pool.length - 1; i >= 0; i--) {
        const sp = pool[i];
        sp.life -= delta;
        if (sp.life <= 0) {
          pool.splice(i, 1);
          continue;
        }

        // Update position
        sp.x += sp.vx * delta;
        sp.y += sp.vy * delta;
        sp.vy += 30 * delta; // slight gravity

        // Draw spark
        const lifeRatio = sp.life / sp.maxLife;
        const alpha = lifeRatio * lifeRatio; // fade out quadratically

        ctx.save();
        ctx.globalAlpha = alpha * 0.85;

        // Spark dot
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 6 * gfx * lifeRatio;
        ctx.shadowColor = color;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.size * lifeRatio, 0, Math.PI * 2);
        ctx.fill();

        // Tiny colored glow around the spark
        if (lifeRatio > 0.4) {
          ctx.globalAlpha = alpha * 0.3;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, sp.size * lifeRatio * 2.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Short upward trail
        if (lifeRatio > 0.3) {
          ctx.globalAlpha = alpha * 0.25;
          ctx.strokeStyle = color;
          ctx.lineWidth = sp.size * lifeRatio * 0.6;
          ctx.beginPath();
          ctx.moveTo(sp.x, sp.y);
          ctx.lineTo(sp.x - sp.vx * delta * 3, sp.y - sp.vy * delta * 2);
          ctx.stroke();
        }

        ctx.restore();
      }
    }
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
