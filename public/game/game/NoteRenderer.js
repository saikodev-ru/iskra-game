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

  /* ── Lane Glows — strip near judge line ────────────────────────── */

  _drawLaneGlows(laneCount) {
    const ctx = this.ctx;
    const judgeLineY = this._getJudgeLineY();
    const sa = this.safeArea;

    // Glow strip: centered on judge line, height = 15% of safe area
    const stripHalfH = sa.h * 0.075;
    const stripTopY = judgeLineY - stripHalfH;
    const stripBotY = judgeLineY + stripHalfH;

    for (const [lane, glow] of this._laneGlows) {
      if (glow.intensity <= 0.01) {
        this._laneGlows.delete(lane);
        continue;
      }

      const tg = this._getLaneGeometry(lane, stripTopY, laneCount);
      const bg = this._getLaneGeometry(lane, stripBotY, laneCount);

      ctx.save();

      // Glow fill — gradient fading from edges
      const grad = ctx.createLinearGradient(0, stripTopY, 0, stripBotY);
      grad.addColorStop(0, 'transparent');
      grad.addColorStop(0.2, glow.color);
      grad.addColorStop(0.5, glow.color);
      grad.addColorStop(0.8, glow.color);
      grad.addColorStop(1, 'transparent');

      ctx.globalAlpha = glow.intensity * 0.35;
      ctx.beginPath();
      ctx.moveTo(tg.x, stripTopY);
      ctx.lineTo(tg.x + tg.width, stripTopY);
      ctx.lineTo(bg.x + bg.width, stripBotY);
      ctx.lineTo(bg.x, stripBotY);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.shadowBlur = 25 * glow.intensity;
      ctx.shadowColor = glow.color;
      ctx.fill();

      // Bright center line at judge line
      const midGeom = this._getLaneGeometry(lane, judgeLineY, laneCount);
      ctx.globalAlpha = glow.intensity * 0.7;
      ctx.shadowBlur = 15 * glow.intensity;
      ctx.shadowColor = glow.color;
      ctx.strokeStyle = glow.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(midGeom.x + 3, judgeLineY);
      ctx.lineTo(midGeom.x + midGeom.width - 3, judgeLineY);
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

  _drawNotes(notes, currentTime, laneCount) {
    const judgeLineY = this._getJudgeLineY();
    const topY = this._getTopY();

    // Debug: log hold note presence once
    if (!this._holdNoteDebugLogged) {
      const holdCount = notes.filter(n => n.type === 'hold' && n.duration > 0).length;
      const totalCount = notes.length;
      if (totalCount > 0) {
        console.log(`[NoteRenderer] Notes in window: ${totalCount}, hold notes: ${holdCount}`);
        if (holdCount > 0) {
          const sample = notes.find(n => n.type === 'hold' && n.duration > 0);
          console.log(`[NoteRenderer] Sample hold note:`, JSON.stringify({ lane: sample.lane, time: sample.time, duration: sample.duration, type: sample.type, hit: sample.hit, released: sample.released }));
        }
        this._holdNoteDebugLogged = true;
      }
    }

    const holdNotes = [];
    const tapNotes = [];

    for (const note of notes) {
      if (note.type === 'hold' && note.duration > 0) {
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
    return judgeLineY - (time - currentTime) * this.scrollSpeed;
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
    ctx.shadowBlur = 14 * scale;
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
    if (isHolding) {
      this._drawHoldGlow(note.lane, judgeLineY, laneCount, color);
    }
  }

  _drawHoldBody(note, laneCount, color, topY, bottomY, alpha, isHolding) {
    const ctx = this.ctx;
    const topGeom = this._getLaneGeometry(note.lane, topY, laneCount);
    const botGeom = this._getLaneGeometry(note.lane, bottomY, laneCount);
    const topScale = this._getPerspectiveScale(topY);
    const botScale = this._getPerspectiveScale(bottomY);
    const topPad = 3 * topScale;
    const botPad = 3 * botScale;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Body fill — trapezoid with MUCH higher opacity
    ctx.beginPath();
    ctx.moveTo(topGeom.x + topPad, topY);
    ctx.lineTo(topGeom.x + topGeom.width - topPad, topY);
    ctx.lineTo(botGeom.x + botGeom.width - botPad, bottomY);
    ctx.lineTo(botGeom.x + botPad, bottomY);
    ctx.closePath();

    // Fill: solid lane color with strong alpha
    ctx.fillStyle = isHolding ? this._withAlpha(color, 0.65) : this._withAlpha(color, 0.50);
    ctx.shadowBlur = isHolding ? 20 : 8;
    ctx.shadowColor = color;
    ctx.fill();

    // Border: bright and visible
    ctx.strokeStyle = isHolding ? this._withAlpha(color, 0.9) : this._withAlpha(color, 0.7);
    ctx.lineWidth = isHolding ? 2.5 : 2;
    ctx.stroke();
    ctx.restore();

    // Center glow line
    const topCX = topGeom.x + topGeom.width / 2;
    const botCX = botGeom.x + botGeom.width / 2;
    ctx.save();
    ctx.globalAlpha = alpha * (isHolding ? 0.6 : 0.35);
    ctx.shadowBlur = isHolding ? 20 : 12;
    ctx.shadowColor = color;
    ctx.strokeStyle = isHolding ? '#ffffff' : this._withAlpha(color, 0.8);
    ctx.lineWidth = isHolding ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(topCX, topY);
    ctx.lineTo(botCX, bottomY);
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
    ctx.shadowBlur = 12 * scale;
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
    const pad = 3 * scale;
    const x = geom.x + pad;
    const w = geom.width - pad * 2;
    const h = 6 * scale;

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.shadowBlur = 25 * scale;
    ctx.shadowColor = color;
    ctx.fillStyle = color;
    ctx.fillRect(x, judgeLineY - h / 2, w, h);

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 2, judgeLineY - 1, w - 4, 2);
    ctx.restore();
  }

  /* ── HP Bar — vertical, right of playfield, 3x wider, half height ─ */

  _drawHPBar(laneCount) {
    const ctx = this.ctx;
    const sa = this.safeArea;
    const judgeLineY = this._getJudgeLineY();
    const health = this._health;

    // HP bar: 3x wider than before, only bottom half of playfield height
    const barGap = 6;
    const barWidth = 18; // was 6, now 3x

    // Only render in the bottom half of the playfield
    const barTopY = sa.y + sa.h * 0.46; // center of playfield
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
      ctx.shadowBlur = 16;
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

    ctx.save();
    ctx.shadowBlur = 20;
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
    ctx.shadowBlur = 35;
    ctx.shadowColor = '#AAFF00';
    ctx.fillStyle = '#AAFF00';
    ctx.fillRect(startX, judgeLineY - 1, totalWidth, 2);
    ctx.restore();
  }

  /* ── Effects — white, transparent, drawn BEHIND notes ─────────── */

  _drawEffects() {
    const ctx = this.ctx;
    for (const e of this._effectsPool) {
      if (!e.active) continue;
      e.age += 0.016;
      const dur = 0.3;
      const p = e.age / dur;
      if (p >= 1) { e.active = false; continue; }
      e.radius = e.maxRadius * p;
      e.opacity = 1 - p;

      // White ring — more transparent
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = e.opacity * 0.35;
      ctx.lineWidth = 2 * (1 - p);
      ctx.shadowBlur = 15;
      ctx.shadowColor = e.color;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Inner flash — white
      if (p < 0.25) {
        ctx.save();
        ctx.globalAlpha = (0.25 - p) / 0.25 * 0.2;
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 12;
        ctx.shadowColor = e.color;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 18 * (1 - p), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Particles — white
      if (e.particles.length > 0) {
        ctx.save();
        ctx.globalAlpha = e.opacity * 0.4;
        for (const pt of e.particles) {
          const d = pt.speed * p;
          const px = e.x + Math.cos(pt.angle) * d;
          const py = e.y + Math.sin(pt.angle) * d;
          const sz = 2.5 * (1 - p);
          ctx.fillStyle = '#ffffff';
          ctx.shadowBlur = 4;
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

  _withAlpha(hex, a) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
}
