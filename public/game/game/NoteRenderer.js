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
    this._laneGlows = new Map();
    this._holdNoteDebugLogged = false;
    this._graphicsPreset = 'disco'; // 'low' | 'standard' | 'disco'
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
  }

  setBackgroundImage(url) {
    if (!url || this._bgLoadAttempted) return;
    this._bgLoadAttempted = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { this._bgImage = img; };
    img.src = url;
  }

  clearBackground() {
    this._bgImage = null;
    this._bgLoadAttempted = false;
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
  }

  clear() {
    this.ctx.clearRect(0, 0, this.w, this.h);
    this._drawBlackBars();
  }

  render({ notes, currentTime, laneCount }) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    this._drawBackground(laneCount);
    this._drawEffects();         // Effects BEHIND notes (white, transparent)
    this._drawLaneGlows(laneCount);
    this._drawNotes(notes, currentTime, laneCount);
    this._drawJudgeLine(laneCount);
    this._drawHPBar(laneCount);
    this._drawBlackBars();
  }

  /* ── Perspective ────────────────────────────────────────────────── */

  _getJudgeLineY() {
    return this.safeArea.y + this.safeArea.h * 0.92;
  }

  _getTopY() {
    return this.safeArea.y;
  }

  _getPerspectiveScale(y) {
    const topY = this._getTopY();
    const judgeLineY = this._getJudgeLineY();
    const p = Math.max(0, Math.min(1, (y - topY) / (judgeLineY - topY)));
    return 0.18 + 0.82 * p;
  }

  _getLaneGeometry(laneIndex, y, laneCount) {
    const sa = this.safeArea;
    const pw = sa.w * 0.55;
    const cx = sa.x + sa.w / 2;
    const scale = this._getPerspectiveScale(y);
    const cw = pw * scale;
    const lw = cw / laneCount;
    const le = cx - cw / 2;
    return { x: le + laneIndex * lw, width: lw, centerX: le + (laneIndex + 0.5) * lw };
  }

  /* ── Background ─────────────────────────────────────────────────── */

  _drawBackground(laneCount) {
    const ctx = this.ctx;
    const sa = this.safeArea;
    const topY = this._getTopY();
    const judgeLineY = this._getJudgeLineY();

    if (this._bgImage) {
      ctx.save();
      ctx.globalAlpha = 0.15;
      const ia = this._bgImage.width / this._bgImage.height;
      const ca = this.w / this.h;
      let dw, dh, dx, dy;
      if (ca > ia) { dw = this.w; dh = this.w / ia; dx = 0; dy = (this.h - dh) / 2; }
      else { dh = this.h; dw = this.h * ia; dx = (this.w - dw) / 2; dy = 0; }
      ctx.drawImage(this._bgImage, dx, dy, dw, dh);
      ctx.restore();
    }

    for (let i = 0; i < laneCount; i++) {
      const tg = this._getLaneGeometry(i, topY, laneCount);
      const bg = this._getLaneGeometry(i, judgeLineY, laneCount);
      ctx.beginPath();
      ctx.moveTo(tg.x, topY);
      ctx.lineTo(tg.x + tg.width, topY);
      ctx.lineTo(bg.x + bg.width, judgeLineY);
      ctx.lineTo(bg.x, judgeLineY);
      ctx.closePath();
      const b = i % 2 === 0 ? 10 : 18;
      ctx.fillStyle = `rgba(${b},${Math.round(b * 0.7)},${Math.round(b * 0.5)},0.88)`;
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(170,255,0,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= laneCount; i++) {
      const tg = this._getLaneGeometry(i, topY, laneCount);
      const bg = this._getLaneGeometry(i, judgeLineY, laneCount);
      ctx.beginPath();
      ctx.moveTo(tg.x, topY);
      ctx.lineTo(bg.x, judgeLineY);
      ctx.stroke();
    }
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
      glow.intensity -= glow.decay;
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

    const holdNotes = [];
    const tapNotes = [];

    for (const note of notes) {
      // Treat very short holds as tap notes visually
      if (note.type === 'hold' && note.duration >= NoteRenderer.MIN_HOLD_DURATION) {
        holdNotes.push(note);
      } else {
        tapNotes.push(note);
      }
    }

    // Draw hold note bodies first
    for (const note of holdNotes) {
      this._drawHoldNote(note, currentTime, laneCount, judgeLineY, topY);
    }

    // Draw tap notes
    for (const note of tapNotes) {
      if (note.hit && note.judgement !== 'miss') continue;
      if (note.judgement === 'miss' && currentTime - note.time > 0.5) continue;

      const noteY = this._noteY(note.time, currentTime, judgeLineY);
      if (noteY < topY - 80 || noteY > judgeLineY + 30) continue;

      const fadeIn = this._fadeIn(noteY, judgeLineY);
      const alpha = note.judgement === 'miss' ? 0.3 : 1;
      const color = LANE_COLORS[note.lane % LANE_COLORS.length];
      this._drawTapNote(note.lane, noteY, laneCount, color, fadeIn * alpha);
    }
  }

  _noteY(time, currentTime, judgeLineY) {
    const topY = this._getTopY();
    const travelH = judgeLineY - topY;
    const distFromJudge = (time - currentTime) * this.scrollSpeed;
    if (distFromJudge <= 0) return judgeLineY - distFromJudge; // past judge line — no curve
    const t = Math.min(1, distFromJudge / travelH);
    // Exponent < 1 creates proper perspective: notes accelerate toward judge line
    // (spend more screen time at top where they're small, rush past near bottom)
    const curvedT = Math.pow(t, 0.65);
    return judgeLineY - curvedT * travelH;
  }

  _fadeIn(noteY, judgeLineY) {
    return Math.min(1, (judgeLineY - noteY) / (this.scrollSpeed * 0.3));
  }

  /* ── Tap note ───────────────────────────────────────────────────── */

  _drawTapNote(lane, noteY, laneCount, color, alpha) {
    const ctx = this.ctx;
    const scale = this._getPerspectiveScale(noteY);
    const geom = this._getLaneGeometry(lane, noteY, laneCount);
    const pad = 5 * scale;
    const x = geom.x + pad;
    const w = geom.width - pad * 2;
    const h = this.noteHeight * scale;
    const r = Math.max(2, 8 * scale);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = 14 * scale * this._gfx();
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
    const segments = 10;
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const y = topY + (bottomY - topY) * t;
      const geom = this._getLaneGeometry(note.lane, y, laneCount);
      const scale = this._getPerspectiveScale(y);
      const pad = 3 * scale;
      points.push({ lx: geom.x + pad, rx: geom.x + geom.width - pad, cx: geom.x + geom.width / 2, y });
    }

    const gfx = this._gfx();

    ctx.save();
    ctx.globalAlpha = alpha;

    // Body fill — smooth polygon following perspective curves
    ctx.beginPath();
    ctx.moveTo(points[0].lx, points[0].y);
    for (let i = 1; i <= segments; i++) ctx.lineTo(points[i].lx, points[i].y);
    for (let i = segments; i >= 0; i--) ctx.lineTo(points[i].rx, points[i].y);
    ctx.closePath();

    ctx.fillStyle = isHolding ? this._withAlpha(color, 0.30) : this._withAlpha(color, 0.18);
    ctx.shadowBlur = (isHolding ? 20 : 8) * gfx;
    ctx.shadowColor = color;
    ctx.fill();

    ctx.strokeStyle = isHolding ? this._withAlpha(color, 0.7) : this._withAlpha(color, 0.45);
    ctx.lineWidth = isHolding ? 2 : 1.5;
    ctx.stroke();
    ctx.restore();

    // Center glow line
    ctx.save();
    ctx.globalAlpha = alpha * (isHolding ? 0.4 : 0.2);
    ctx.shadowBlur = (isHolding ? 20 : 12) * gfx;
    ctx.shadowColor = color;
    ctx.strokeStyle = isHolding ? '#ffffff' : this._withAlpha(color, 0.8);
    ctx.lineWidth = isHolding ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(points[0].cx, points[0].y);
    for (let i = 1; i <= segments; i++) ctx.lineTo(points[i].cx, points[i].y);
    ctx.stroke();
    ctx.restore();
  }

  _drawHoldCap(laneIndex, y, laneCount, color, alpha) {
    const ctx = this.ctx;
    const scale = this._getPerspectiveScale(y);
    const geom = this._getLaneGeometry(laneIndex, y, laneCount);
    const pad = 5 * scale;
    const x = geom.x + pad;
    const w = geom.width - pad * 2;
    const h = this.noteHeight * scale;
    const r = Math.max(2, 8 * scale);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = 12 * scale * this._gfx();
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
    const scale = this._getPerspectiveScale(judgeLineY);
    const geom = this._getLaneGeometry(laneIndex, judgeLineY, laneCount);
    const pad = 4 * scale;
    const x = geom.x + pad;
    const w = geom.width - pad * 2;
    const gfx = this._gfx();

    // Tall vertical glow column while holding
    const columnH = 140 * scale;
    ctx.save();
    const grad = ctx.createLinearGradient(0, judgeLineY - columnH, 0, judgeLineY);
    grad.addColorStop(0, 'transparent');
    grad.addColorStop(0.4, this._withAlpha(color, 0.12));
    grad.addColorStop(1, this._withAlpha(color, 0.45));
    ctx.fillStyle = grad;
    ctx.shadowBlur = 30 * scale * gfx;
    ctx.shadowColor = color;
    ctx.fillRect(x - 3, judgeLineY - columnH, w + 6, columnH);

    // Bright bar at judge line
    const barH = 10 * scale;
    ctx.globalAlpha = 0.95;
    ctx.shadowBlur = 30 * scale * gfx;
    ctx.fillStyle = color;
    ctx.fillRect(x, judgeLineY - barH / 2, w, barH);

    // White hot center
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 2, judgeLineY - 1.5, w - 4, 3);
    ctx.restore();
  }

  /* ── HP Bar — vertical, right of playfield, 3x wider, half height ─ */

  _drawHPBar(laneCount) {
    const ctx = this.ctx;
    const sa = this.safeArea;
    const judgeLineY = this._getJudgeLineY();
    const health = this._health;
    const gfx = this._gfx();

    // HP bar: 3x wider than before, only bottom half of playfield height
    const barGap = 6;
    const barWidth = 18;

    // Only render in the bottom half of the playfield
    const barTopY = sa.y + sa.h * 0.46;
    const barBotY = judgeLineY;

    const topRightGeom = this._getLaneGeometry(laneCount - 1, barTopY, laneCount);
    const botRightGeom = this._getLaneGeometry(laneCount - 1, barBotY, laneCount);

    const topBarX = topRightGeom.x + topRightGeom.width + barGap * this._getPerspectiveScale(barTopY);
    const botBarX = botRightGeom.x + botRightGeom.width + barGap * this._getPerspectiveScale(barBotY);

    const topScale = this._getPerspectiveScale(barTopY);
    const botScale = this._getPerspectiveScale(barBotY);
    const topW = barWidth * topScale;
    const botW = barWidth * botScale;

    // Background bar (empty)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(topBarX, barTopY);
    ctx.lineTo(topBarX + topW, barTopY);
    ctx.lineTo(botBarX + botW, barBotY);
    ctx.lineTo(botBarX, barBotY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fill();

    // Health fill — from bottom up
    const fillRatio = health / 100;
    if (fillRatio > 0) {
      const fillHeight = (barBotY - barTopY) * fillRatio;
      const fillTopY = barBotY - fillHeight;

      const fillTopT = (fillTopY - barTopY) / (barBotY - barTopY);
      const fillTopScale = topScale + (botScale - topScale) * fillTopT;
      const fillTopBarX = topBarX + (botBarX - topBarX) * fillTopT;
      const fillTopW = topW + (botW - topW) * fillTopT;

      ctx.beginPath();
      ctx.moveTo(fillTopBarX, fillTopY);
      ctx.lineTo(fillTopBarX + fillTopW, fillTopY);
      ctx.lineTo(botBarX + botW, barBotY);
      ctx.lineTo(botBarX, barBotY);
      ctx.closePath();

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
      ctx.fill();
    }

    // Border
    ctx.beginPath();
    ctx.moveTo(topBarX, barTopY);
    ctx.lineTo(topBarX + topW, barTopY);
    ctx.lineTo(botBarX + botW, barBotY);
    ctx.lineTo(botBarX, barBotY);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(170,255,0,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

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

    ctx.save();
    ctx.shadowBlur = 20 * gfx;
    ctx.shadowColor = '#AAFF00';
    const grad = ctx.createLinearGradient(startX, judgeLineY, startX + totalWidth, judgeLineY);
    grad.addColorStop(0, 'rgba(170,255,0,0)');
    grad.addColorStop(0.06, 'rgba(170,255,0,0.5)');
    grad.addColorStop(0.5, '#AAFF00');
    grad.addColorStop(0.94, 'rgba(170,255,0,0.5)');
    grad.addColorStop(1, 'rgba(170,255,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(startX, judgeLineY - 2.5, totalWidth, 5);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.shadowBlur = 35 * gfx;
    ctx.shadowColor = '#AAFF00';
    ctx.fillStyle = '#AAFF00';
    ctx.fillRect(startX, judgeLineY - 1, totalWidth, 2);
    ctx.restore();
  }

  /* ── Effects — white, transparent, drawn BEHIND notes ─────────── */

  _drawEffects() {
    if (this._graphicsPreset === 'low') return; // no effects on low
    const ctx = this.ctx;
    const gfx = this._gfx();
    for (const e of this._effectsPool) {
      if (!e.active) continue;
      e.age += 0.016;
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
