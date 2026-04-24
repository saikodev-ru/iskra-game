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
    this._effectsPool = new Array(48);
    for (let i = 0; i < 48; i++) {
      this._effectsPool[i] = {
        active: false, x: 0, y: 0, radius: 0, maxRadius: 0,
        opacity: 0, color: '', age: 0, type: 'ring', particles: []
      };
    }
    this._effectIndex = 0;
    this._bgImage = null;
    this._bgLoadAttempted = false;
    this.safeArea = { x: 0, y: 0, w: 0, h: 0 };
    this._safeAreaExplicit = false;
    this._health = 100;
    this._displayHealth = 100; // animated HP value for smooth bar
    this._laneGlows = new Map();
    this._holdNoteDebugLogged = false;
    this._graphicsPreset = 'disco'; // 'low' | 'standard' | 'disco'

    // Optimization: cached static background (lanes + grid lines)
    this._bgCacheCanvas = null;
    this._bgCacheLaneCount = -1;
    this._bgCacheWidth = 0;
    this._bgCacheHeight = 0;
    this._bgCacheBgImage = null;  // track which bgImage was cached

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

  /** Returns a multiplier for shadow/glow effects based on preset */
  _gfx() {
    if (this._graphicsPreset === 'low') return 0;
    if (this._graphicsPreset === 'standard') return 0.5;
    return 1; // disco
  }

  setHealth(pct) {
    this._health = Math.max(0, Math.min(100, pct));
    // _displayHealth is animated toward _health in render()
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
    if (this._graphicsPreset === 'low') return; // no effects on low
    const effect = this._effectsPool[this._effectIndex % 48];
    effect.active = true;
    effect.x = x; effect.y = y;
    effect.radius = 5;
    effect.maxRadius = type === 'perfect' ? 70 : type === 'great' ? 55 : 40;
    effect.opacity = 1; effect.color = color; effect.age = 0; effect.type = type;
    effect.particles = [];
    if (type === 'perfect' || type === 'great') {
      const count = type === 'perfect' ? 10 : 6;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 / count) * i + Math.random() * 0.3;
        const speed = 80 + Math.random() * 60;
        effect.particles.push({ angle, speed });
      }
    }
    this._effectIndex++;
  }

  addLaneGlow(lane, laneCount, color) {
    if (this._graphicsPreset === 'low') return; // no lane glow on low
    this._laneGlows.set(lane, {
      color,
      intensity: 1.0,
      decay: 0.05
    });
  }

  clearLaneGlows() {
    this._laneGlows.clear();
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

    // Store delta for frame-rate independent effects
    this._frameDelta = delta;

    // Smooth HP animation (frame-rate independent)
    const healthDiff = this._health - this._displayHealth;
    if (Math.abs(healthDiff) > 0.1) {
      this._displayHealth += healthDiff * Math.min(1, delta * 7); // ~0.12 at 60fps
    } else {
      this._displayHealth = this._health;
    }

    this._drawBackgroundCached(laneCount);
    this._drawEffects();         // Effects BEHIND notes (white, transparent)
    this._drawLaneGlows(laneCount);
    this._drawNotes(notes, currentTime, laneCount);
    this._drawJudgeLine(laneCount);
    this._drawHPBar(laneCount);
    this._drawRedVignette();     // Low-HP danger overlay
    this._drawBlackBars();
  }

  /** Draw background using cached offscreen canvas when possible */
  _drawBackgroundCached(laneCount) {
    // Check if cache is valid
    const needsRebuild = !this._bgCacheCanvas
      || this._bgCacheLaneCount !== laneCount
      || this._bgCacheWidth !== this.w
      || this._bgCacheHeight !== this.h
      || this._bgCacheBgImage !== this._bgImage;

    if (needsRebuild) {
      this._rebuildBackgroundCache(laneCount);
    }

    // Blit cached background — must specify CSS dimensions because the main canvas
    // context already has a scale(dpr*resScale) transform. Without this, the
    // pixel-sized cache canvas would be double-scaled.
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
    const fullPw = sa.w * 0.55;

    const topScale = this._getPerspectiveScale(topY);
    const judgeScale = 1.0;
    const topPw = fullPw * topScale;
    const judgePw = fullPw * judgeScale;

    // Sample rows for smooth gradient fill of trapezoidal lanes
    const steps = 60;
    const stepH = (bottomY - topY) / steps;

    for (let s = 0; s < steps; s++) {
      const y1 = topY + s * stepH;
      const y2 = topY + (s + 1) * stepH;
      const yMid = (y1 + y2) / 2;
      const scale = this._getPerspectiveScale(yMid);
      const pw = fullPw * scale;
      const le = cx - pw / 2;

      for (let i = 0; i < laneCount; i++) {
        const lx = le + i * (pw / laneCount);
        const lw = pw / laneCount;
        cctx.fillStyle = i % 2 === 0
          ? 'rgba(10,7,5,0.88)'
          : 'rgba(18,13,9,0.88)';
        cctx.fillRect(lx, y1, lw, stepH + 1); // +1 to avoid gaps
      }
    }

    // Depth gradient overlay — subtle darkening toward the top to hint at distance
    const depthGrad = cctx.createLinearGradient(0, topY, 0, judgeLineY);
    depthGrad.addColorStop(0, 'rgba(0,0,0,0.35)');
    depthGrad.addColorStop(0.3, 'rgba(0,0,0,0.15)');
    depthGrad.addColorStop(0.7, 'rgba(0,0,0,0)');
    depthGrad.addColorStop(1, 'rgba(0,0,0,0)');
    cctx.fillStyle = depthGrad;
    cctx.fillRect(cx - fullPw / 2, topY, fullPw, judgeLineY - topY);

    // Fade overlay below judge line — lane-colored glow fading to dark
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

    // Bright glow strip right below judge line — white fade
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

    // Draw lane dividers — converging lines from vanishing point to judge line
    for (let i = 0; i <= laneCount; i++) {
      cctx.save();
      const divGrad = cctx.createLinearGradient(0, topY, 0, bottomY);
      divGrad.addColorStop(0, 'rgba(170,255,0,0.02)');
      divGrad.addColorStop(0.6, 'rgba(170,255,0,0.04)');
      divGrad.addColorStop(0.85, 'rgba(255,255,255,0.06)');
      divGrad.addColorStop(1, 'rgba(255,255,255,0)');
      cctx.strokeStyle = divGrad;
      cctx.lineWidth = 1;
      cctx.beginPath();

      // Draw converging line using multiple segments for smooth curve
      const segSteps = 40;
      for (let s = 0; s <= segSteps; s++) {
        const t = s / segSteps;
        const y = topY + t * (bottomY - topY);
        const geom = this._getLaneGeometry(i, y, laneCount);
        if (s === 0) cctx.moveTo(geom.x, y);
        else cctx.lineTo(geom.x, y);
      }
      cctx.stroke();
      cctx.restore();
    }

    // Side edges — converging lines with subtle outer glow
    cctx.save();
    // Left edge
    cctx.beginPath();
    for (let s = 0; s <= 40; s++) {
      const t = s / 40;
      const y = topY + t * (bottomY - topY);
      const geom = this._getLaneGeometry(0, y, laneCount);
      if (s === 0) cctx.moveTo(geom.x, y);
      else cctx.lineTo(geom.x, y);
    }
    cctx.strokeStyle = 'rgba(170,255,0,0.06)';
    cctx.lineWidth = 2;
    cctx.shadowBlur = 8;
    cctx.shadowColor = 'rgba(170,255,0,0.15)';
    cctx.stroke();

    // Right edge
    cctx.beginPath();
    for (let s = 0; s <= 40; s++) {
      const t = s / 40;
      const y = topY + t * (bottomY - topY);
      const geom = this._getLaneGeometry(laneCount, y, laneCount);
      if (s === 0) cctx.moveTo(geom.x, y);
      else cctx.lineTo(geom.x, y);
    }
    cctx.stroke();
    cctx.restore();

    // Update cache metadata
    this._bgCacheLaneCount = laneCount;
    this._bgCacheWidth = this.w;
    this._bgCacheHeight = this.h;
    this._bgCacheBgImage = this._bgImage;
  }

  /** Invalidate background cache (call on resize, laneCount change, etc.) */
  invalidateBackgroundCache() {
    this._bgCacheLaneCount = -1;
    this._bgCacheBgImage = null;
  }

  /* ── Layout (Perspective — converging lanes like Project SEKAI) ── */

  _getJudgeLineY() {
    return this.safeArea.y + this.safeArea.h * 0.92;
  }

  _getTopY() {
    return this.safeArea.y;
  }

  _getBottomY() {
    // Extend the field below the judge line for aesthetics
    return this.safeArea.y + this.safeArea.h * 1.12;
  }

  /**
   * Perspective scale — lanes converge toward a vanishing point at the top.
   * Returns a value from ~0.3 at the top edge to 1.0 at the judge line.
   * Uses smooth quadratic easing for a natural Project SEKAI-style perspective.
   * Notes at the judge line are full size; notes at the top are compressed.
   */
  _getPerspectiveScale(y) {
    const judgeLineY = this._getJudgeLineY();
    const topY = this._getTopY();
    const t = Math.max(0, Math.min(1, (y - topY) / (judgeLineY - topY)));
    // Linear: 0.3 at top → 1.0 at judge line — straight trapezoid edges
    return 0.3 + 0.7 * t;
  }

  /**
   * Lane geometry with perspective — lanes converge toward vanishing point.
   * At the judge line (bottom), lanes are at full width.
   * At the top, lanes are compressed to 30% width, centered.
   */
  _getLaneGeometry(laneIndex, y, laneCount) {
    const sa = this.safeArea;
    const pw = sa.w * 0.55; // full play field width at judge line
    const cx = sa.x + sa.w / 2;
    const scale = this._getPerspectiveScale(y);
    const scaledPw = pw * scale;
    const lw = scaledPw / laneCount;
    const le = cx - scaledPw / 2;
    return { x: le + laneIndex * lw, width: lw, centerX: le + (laneIndex + 0.5) * lw };
  }

  /* ── Lane Glows — horizontal flash at judge line (Project Sekai style) */

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

      // Flash expands outward from center over time
      const expandProgress = 1 - glow.intensity;
      const halfW = hw * 0.7 * (1 + expandProgress * 0.3);
      const barH = 20 + expandProgress * 28;

      ctx.save();

      // ── Outer glow: wide, soft (disco only) ──
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

      // ── Core bar: bright horizontal flash ──
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

      // ── White hot center line ──
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
      // Frame-rate independent decay: normalize to 60fps baseline
      const delta = this._frameDelta || 0.016;
      glow.intensity -= glow.decay * (delta / 0.016);
    }
  }

  /* ── Black bars ─────────────────────────────────────────────────── */

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

  /* ── Notes ──────────────────────────────────────────────────────── */

  // Minimum duration (seconds) to render as hold note; shorter holds render as tap notes
  static MIN_HOLD_DURATION = 0.05; // 50ms

  _drawNotes(notes, currentTime, laneCount) {
    const judgeLineY = this._getJudgeLineY();
    const topY = this._getTopY();
    const clipTop = topY - 80;
    const clipBottom = judgeLineY + 30;

    // Draw hold note bodies first (without intermediate arrays)
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      if (note.type === 'hold' && note.duration >= NoteRenderer.MIN_HOLD_DURATION) {
        this._drawHoldNote(note, currentTime, laneCount, judgeLineY, topY);
      }
    }

    // Draw tap notes (including short holds rendered as taps)
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      // Skip holds (already drawn above)
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
    // Linear scroll: note position is directly proportional to time difference.
    // Notes travel at constant visual speed across the entire field.
    // With perspective, lanes converge at the top but note Y-position remains linear,
    // ensuring even, predictable scroll like Project SEKAI.
    const distFromJudge = (time - currentTime) * this.scrollSpeed;
    return judgeLineY - distFromJudge;
  }

  /**
   * Get perspective scale for a note's Y position.
   * Used to scale note size based on distance from judge line.
   * At judge line: scale = 1.0 (full size). At top: scale ≈ 0.3 (small).
   */
  _getNoteScale(noteY) {
    const judgeLineY = this._getJudgeLineY();
    const topY = this._getTopY();
    const t = Math.max(0, Math.min(1, (noteY - topY) / (judgeLineY - topY)));
    // Linear matching perspective scale
    return 0.3 + 0.7 * t;
  }

  _fadeIn(noteY, judgeLineY) {
    return Math.min(1, (judgeLineY - noteY) / (this.scrollSpeed * 0.3));
  }

  /* ── Tap note ───────────────────────────────────────────────────── */

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

  /* ── Hold note — osu!mania style ────────────────────────────────── */

  _drawHoldNote(note, currentTime, laneCount, judgeLineY, topY) {
    const headTime = note.time;
    const tailTime = note.time + note.duration;
    const color = LANE_COLORS[note.lane % LANE_COLORS.length];

    const isHolding = note.hit && note.judgement !== 'miss' && !note.released;
    const isMissed = note.judgement === 'miss';

    if (isMissed && currentTime - headTime > 0.5) return;
    if (note.released && !isMissed) return;

    const alpha = isMissed ? 0.3 : 1;

    // ── Calculate Y positions ──
    const rawHeadY = this._noteY(headTime, currentTime, judgeLineY);
    const headY = isHolding ? judgeLineY : rawHeadY;
    const tailY = this._noteY(tailTime, currentTime, judgeLineY);

    // ── Clip to visible bounds ──
    const clipTop = topY - 40;
    const clipBottom = judgeLineY;

    const bodyTop = Math.max(tailY, clipTop);
    const bodyBottom = Math.min(headY, clipBottom);

    // ── Draw body ──
    if (bodyTop < bodyBottom && bodyBottom > clipTop && bodyTop < clipBottom) {
      this._drawHoldBody(note, laneCount, color, bodyTop, bodyBottom, alpha, isHolding);
    }

    // ── Draw tail cap ──
    if (tailY >= clipTop && tailY <= clipBottom) {
      this._drawHoldCap(note.lane, tailY, laneCount, color, alpha);
    }

    // ── Draw head cap (only if NOT holding) ──
    if (!isHolding && headY >= clipTop && headY <= clipBottom) {
      this._drawHoldCap(note.lane, headY, laneCount, color, alpha);
    }

    // ── Holding glow at judge line ──
    if (isHolding && this._graphicsPreset !== 'low') {
      this._drawHoldGlow(note.lane, judgeLineY, laneCount, color);
    }
  }

  _drawHoldBody(note, laneCount, color, topY, bottomY, alpha, isHolding) {
    const ctx = this.ctx;
    const geom = this._getLaneGeometry(note.lane, bottomY, laneCount);
    const topGeom = this._getLaneGeometry(note.lane, topY, laneCount);
    const topScale = this._getNoteScale(topY);
    const botScale = this._getNoteScale(bottomY);
    const avgScale = (topScale + botScale) / 2;
    const pad = 3 * avgScale;
    // Use trapezoid body: wider at bottom, narrower at top
    const botX = geom.x + pad;
    const botW = geom.width - pad * 2;
    const topX = topGeom.x + pad;
    const topW = topGeom.width - pad * 2;
    const cx = (geom.x + geom.width / 2 + topGeom.x + topGeom.width / 2) / 2;

    const gfx = this._gfx();

    ctx.save();
    ctx.globalAlpha = alpha;

    // Body fill — trapezoid (perspective: wider at judge line, narrower at top)
    ctx.fillStyle = isHolding ? this._withAlpha(color, 0.30) : this._withAlpha(color, 0.18);
    ctx.shadowBlur = (isHolding ? 20 : 8) * gfx * avgScale;
    ctx.shadowColor = color;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.lineTo(topX + topW, topY);
    ctx.lineTo(botX + botW, bottomY);
    ctx.lineTo(botX, bottomY);
    ctx.closePath();
    ctx.fill();

    // Stroke the trapezoid outline
    ctx.strokeStyle = isHolding ? this._withAlpha(color, 0.7) : this._withAlpha(color, 0.45);
    ctx.lineWidth = (isHolding ? 2 : 1.5) * avgScale;
    ctx.stroke();
    ctx.restore();

    // Center glow line (straight vertical from top to bottom center)
    ctx.save();
    ctx.globalAlpha = alpha * (isHolding ? 0.4 : 0.2);
    ctx.shadowBlur = (isHolding ? 20 : 12) * gfx * avgScale;
    ctx.shadowColor = color;
    ctx.strokeStyle = isHolding ? '#ffffff' : this._withAlpha(color, 0.8);
    ctx.lineWidth = (isHolding ? 4 : 2) * avgScale;
    ctx.beginPath();
    const topCx = topGeom.x + topGeom.width / 2;
    const botCx = geom.x + geom.width / 2;
    ctx.moveTo(topCx, topY);
    ctx.lineTo(botCx, bottomY);
    ctx.stroke();
    ctx.restore();
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

    // Tall vertical glow column while holding
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

    // Bright bar at judge line
    const barH = 10;
    ctx.globalAlpha = 0.95;
    ctx.shadowBlur = 30 * gfx;
    ctx.fillStyle = color;
    ctx.fillRect(x, judgeLineY - barH / 2, w, barH);

    // White hot center
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 2, judgeLineY - 1.5, w - 4, 3);
    ctx.restore();
  }

  /* ── HP Bar — vertical, right of playfield (orthographic = simple rect) ─ */

  _drawHPBar(laneCount) {
    const ctx = this.ctx;
    const sa = this.safeArea;
    const judgeLineY = this._getJudgeLineY();
    const health = this._displayHealth;
    const gfx = this._gfx();

    const barGap = 6;
    const barWidth = 18;

    // Only render in the bottom half of the playfield
    const barTopY = sa.y + sa.h * 0.46;
    const barBotY = judgeLineY;

    const rightGeom = this._getLaneGeometry(laneCount - 1, judgeLineY, laneCount);
    const barX = rightGeom.x + rightGeom.width + barGap;

    // Background bar (empty)
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(barX, barTopY, barWidth, barBotY - barTopY);

    // Health fill — from bottom up
    const fillRatio = health / 100;
    if (fillRatio > 0) {
      const fillHeight = (barBotY - barTopY) * fillRatio;
      const fillTopY = barBotY - fillHeight;

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
      ctx.fillRect(barX, fillTopY, barWidth, fillHeight);
    }

    // Border
    ctx.strokeStyle = 'rgba(170,255,0,0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barTopY, barWidth, barBotY - barTopY);

    ctx.restore();
  }

  /* ── Red vignette when HP is low ───────────────────────────────── */

  _drawRedVignette() {
    const health = this._displayHealth;
    if (health > 40) return; // Only show when HP < 40%

    const ctx = this.ctx;
    const sa = this.safeArea;
    const cx = sa.x + sa.w / 2;
    const cy = sa.y + sa.h / 2;
    const maxR = Math.max(sa.w, sa.h) * 0.8;
    const minR = Math.min(sa.w, sa.h) * 0.25;

    // Intensity ramps from 0 at 40% HP to 1 at 0% HP
    const intensity = (1 - health / 40) * 0.5;

    // Pulse effect when very low HP
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

  /* ── Judge line ─────────────────────────────────────────────────── */

  _drawJudgeLine(laneCount) {
    const ctx = this.ctx;
    const judgeLineY = this._getJudgeLineY();
    const fullGeom = this._getLaneGeometry(0, judgeLineY, laneCount);
    const startX = fullGeom.x;
    const totalWidth = laneCount * fullGeom.width;
    const gfx = this._gfx();

    // Outer white glow bloom — wide, soft
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.shadowBlur = 45 * gfx;
    ctx.shadowColor = 'rgba(255,255,255,0.7)';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(startX - 4, judgeLineY - 6, totalWidth + 8, 12);
    ctx.restore();

    // Main white judgement line — solid and bright
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

    // Core bright white center line — razor sharp
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.shadowBlur = 40 * gfx;
    ctx.shadowColor = 'rgba(255,255,255,0.6)';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(startX + 2, judgeLineY - 1.5, totalWidth - 4, 3);
    ctx.restore();
  }

  /* ── Effects — white, transparent, drawn BEHIND notes ─────────── */

  _drawEffects() {
    if (this._graphicsPreset === 'low') return; // no effects on low
    const ctx = this.ctx;
    const gfx = this._gfx();
    const delta = this._frameDelta || 0.016;
    for (const e of this._effectsPool) {
      if (!e.active) continue;
      e.age += delta; // Frame-rate independent aging
      const dur = 0.3;
      const p = e.age / dur;
      if (p >= 1) { e.active = false; continue; }
      e.radius = e.maxRadius * p;
      e.opacity = 1 - p;

      // White ring
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = e.opacity * 0.35;
      ctx.lineWidth = 2 * (1 - p);
      ctx.shadowBlur = 15 * gfx;
      ctx.shadowColor = e.color;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Inner flash — white (disco only)
      if (p < 0.25 && this._graphicsPreset === 'disco') {
        ctx.save();
        ctx.globalAlpha = (0.25 - p) / 0.25 * 0.2;
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 12 * gfx;
        ctx.shadowColor = e.color;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 18 * (1 - p), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Particles — white (disco only)
      if (e.particles.length > 0 && this._graphicsPreset === 'disco') {
        ctx.save();
        ctx.globalAlpha = e.opacity * 0.4;
        for (const pt of e.particles) {
          const d = pt.speed * p;
          const px = e.x + Math.cos(pt.angle) * d;
          const py = e.y + Math.sin(pt.angle) * d;
          const sz = 2.5 * (1 - p);
          ctx.fillStyle = '#ffffff';
          ctx.shadowBlur = 4 * gfx;
          ctx.shadowColor = e.color;
          ctx.beginPath();
          ctx.arc(px, py, sz, 0, Math.PI * 2);
          ctx.fill();
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

  /* ── Utility ────────────────────────────────────────────────────── */

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
    // Handle hex colors
    if (color.startsWith('#')) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${a})`;
    }
    // Handle rgba/rgb colors — extract rgb values and reapply alpha
    const m = color.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) return `rgba(${m[1]},${m[2]},${m[3]},${a})`;
    return color;
  }
}
