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
    this.resize();
  }

  /* ── Public API ─────────────────────────────────────────────────── */

  setSafeArea(x, y, w, h) {
    this.safeArea = { x, y, w, h };
    this._safeAreaExplicit = true;
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

  flashLane() { /* no-op */ }

  getLaneHitPosition(lane, laneCount) {
    const sa = this.safeArea;
    const judgeLineY = sa.y + sa.h * 0.92;
    const geom = this._getLaneGeometry(lane, judgeLineY, laneCount);
    return { x: geom.centerX, y: judgeLineY };
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    this.ctx.scale(dpr, dpr);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
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
    this._drawNotes(notes, currentTime, laneCount);
    this._drawJudgeLine(laneCount);
    this._drawEffects();
    this._drawBlackBars();
  }

  /* ── Perspective ────────────────────────────────────────────────── */

  _getPerspectiveScale(y) {
    const sa = this.safeArea;
    const topY = sa.y;
    const judgeLineY = sa.y + sa.h * 0.92;
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
    const topY = sa.y;
    const judgeLineY = sa.y + sa.h * 0.92;

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
    const sa = this.safeArea;
    const judgeLineY = sa.y + sa.h * 0.92;

    for (const note of notes) {
      const color = LANE_COLORS[note.lane % LANE_COLORS.length];

      if (note.type === 'hold' && note.duration > 0) {
        this._drawHoldNote(note, currentTime, laneCount, color, judgeLineY);
      } else {
        // Tap note: skip if already hit (non-miss), or if miss has faded
        if (note.hit && note.judgement !== 'miss') continue;
        if (note.judgement === 'miss' && currentTime - note.time > 0.5) continue;

        const noteY = this._noteY(note.time, currentTime, judgeLineY);
        if (noteY < -80 || noteY > judgeLineY + 30) continue;

        const fadeIn = this._fadeIn(noteY, judgeLineY);
        const alpha = note.judgement === 'miss' ? 0.3 : 1;
        this._drawTapNote(note.lane, noteY, laneCount, color, fadeIn * alpha);
      }
    }
  }

  /** Convert note time to screen Y. Notes above judge line are < judgeLineY. */
  _noteY(time, currentTime, judgeLineY) {
    return judgeLineY - (time - currentTime) * this.scrollSpeed;
  }

  _fadeIn(noteY, judgeLineY) {
    return Math.min(1, (judgeLineY - noteY) / (this.scrollSpeed * 0.3));
  }

  /* ── Tap note ───────────────────────────────────────────────────── */

  _drawTapNote(ctx_or_lane, laneIndex_or_noteY, laneCount, color, alpha) {
    // Support both calling conventions
    const lane = typeof ctx_or_lane === 'number' ? ctx_or_lane : 0;
    const noteY = typeof laneIndex_or_noteY === 'number' ? laneIndex_or_noteY : 0;
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
  /*
    In osu!mania, notes scroll from top to bottom toward the judge line.
    For a hold note:
    - The HEAD (start time) is at the BOTTOM of the hold body (closer to judge line)
    - The TAIL (end time) is at the TOP of the hold body (further from judge line)
    
    When the head is being held:
    - The body extends FROM the judge line UPWARD to wherever the tail currently is
    - The head cap stays at the judge line
    - The tail cap scrolls down normally
    
    When released early or head missed:
    - The body should not be shown below the judge line
  */

  _drawHoldNote(note, currentTime, laneCount, color, judgeLineY) {
    const headTime = note.time;
    const tailTime = note.time + note.duration;
    const isHolding = note.hit && note.judgement !== 'miss' && !note.released;
    const isMissed = note.judgement === 'miss';

    // Skip fully faded misses
    if (isMissed && currentTime - headTime > 0.5) return;
    // Released notes (head was hit, then released) — just disappear like osu!mania
    if (note.released && !isMissed) return;

    const alpha = isMissed ? 0.3 : 1;

    // Head Y: if held, clamp to judge line. Otherwise compute normally.
    const headY = isHolding ? judgeLineY : this._noteY(headTime, currentTime, judgeLineY);
    // Tail Y: always computed from time
    const tailY = this._noteY(tailTime, currentTime, judgeLineY);

    // In our coordinate system:
    // tailY < headY (tail is above, further from judge line)
    // headY approaches judgeLineY from above as note reaches judge line

    // Clip the body: only draw between topBound and judgeLineY
    const topBound = this.safeArea.y - 40;
    const bodyTop = Math.max(tailY, topBound);    // top of visible body (narrow end)
    const bodyBottom = Math.min(headY, judgeLineY); // bottom of visible body (wide end)

    // Draw body if visible
    if (bodyTop < bodyBottom && bodyBottom > topBound && bodyTop < judgeLineY) {
      this._drawHoldBody(note, laneCount, color, bodyTop, bodyBottom, alpha, isHolding);
    }

    // Draw tail cap if within visible bounds
    if (tailY >= topBound && tailY <= judgeLineY) {
      this._drawHoldCap(note.lane, tailY, laneCount, color, alpha);
    }

    // Draw head cap ONLY if not held and within visible bounds above judge line
    if (!isHolding && headY >= topBound && headY <= judgeLineY) {
      this._drawHoldCap(note.lane, headY, laneCount, color, alpha);
    }
  }

  _drawHoldBody(note, laneCount, color, topY, bottomY, alpha, isHolding) {
    const ctx = this.ctx;
    const topGeom = this._getLaneGeometry(note.lane, topY, laneCount);
    const botGeom = this._getLaneGeometry(note.lane, bottomY, laneCount);
    const topScale = this._getPerspectiveScale(topY);
    const botScale = this._getPerspectiveScale(bottomY);
    const topPad = 4 * topScale;
    const botPad = 4 * botScale;

    ctx.save();
    ctx.globalAlpha = alpha * (isHolding ? 0.95 : 0.85);

    // Body fill — trapezoid
    ctx.beginPath();
    ctx.moveTo(topGeom.x + topPad, topY);
    ctx.lineTo(topGeom.x + topGeom.width - topPad, topY);
    ctx.lineTo(botGeom.x + botGeom.width - botPad, bottomY);
    ctx.lineTo(botGeom.x + botPad, bottomY);
    ctx.closePath();
    ctx.fillStyle = isHolding ? this._withAlpha(color, 0.45) : this._withAlpha(color, 0.30);
    ctx.fill();
    ctx.strokeStyle = isHolding ? this._withAlpha(color, 0.7) : this._withAlpha(color, 0.5);
    ctx.lineWidth = isHolding ? 2 : 1.5;
    ctx.stroke();
    ctx.restore();

    // Center glow line
    const topCX = topGeom.x + topGeom.width / 2;
    const botCX = botGeom.x + botGeom.width / 2;
    ctx.save();
    ctx.globalAlpha = alpha * (isHolding ? 0.4 : 0.2);
    ctx.shadowBlur = isHolding ? 16 : 10;
    ctx.shadowColor = color;
    ctx.strokeStyle = this._withAlpha(color, 0.5);
    ctx.lineWidth = isHolding ? 5 : 3;
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
    ctx.shadowBlur = 10 * scale;
    ctx.shadowColor = color;
    ctx.fillStyle = color;
    this._roundRect(ctx, x, y - h / 2, w, h, r);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    const grad = ctx.createLinearGradient(x, y - h / 2, x, y + h / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.3)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.15)');
    ctx.fillStyle = grad;
    this._roundRect(ctx, x, y - h / 2, w, h, r);
    ctx.fill();
    ctx.restore();
  }

  /* ── Judge line ─────────────────────────────────────────────────── */

  _drawJudgeLine(laneCount) {
    const ctx = this.ctx;
    const sa = this.safeArea;
    const judgeLineY = sa.y + sa.h * 0.92;
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

  /* ── Effects ────────────────────────────────────────────────────── */

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

      // Ring
      ctx.save();
      ctx.strokeStyle = e.color;
      ctx.globalAlpha = e.opacity * 0.8;
      ctx.lineWidth = 3 * (1 - p);
      ctx.shadowBlur = 12;
      ctx.shadowColor = e.color;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Inner flash
      if (p < 0.3) {
        ctx.save();
        ctx.globalAlpha = (0.3 - p) / 0.3 * 0.4;
        ctx.fillStyle = e.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = e.color;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 20 * (1 - p), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Particles
      if (e.particles.length > 0) {
        ctx.save();
        ctx.globalAlpha = e.opacity * 0.8;
        for (const pt of e.particles) {
          const d = pt.speed * p;
          const px = e.x + Math.cos(pt.angle) * d;
          const py = e.y + Math.sin(pt.angle) * d;
          const sz = 3 * (1 - p);
          ctx.fillStyle = e.color;
          ctx.shadowBlur = 6;
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
