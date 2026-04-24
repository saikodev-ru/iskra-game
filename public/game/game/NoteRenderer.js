const LANE_COLORS = [
  '#CCFF33', // Vibrant lime
  '#FFD700', // Vibrant gold
  '#FF3355', // Vibrant red-pink
  '#BF5FFF', // Vibrant purple
  '#CCFF33', '#FFD700', '#FF3355', '#BF5FFF'
];

export default class NoteRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scrollSpeed = 400;
    this.noteHeight = 20;
    this._effectsPool = new Array(64);
    for (let i = 0; i < 64; i++) {
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

  /* ------------------------------------------------------------------ */
  /*  Public API                                                         */
  /* ------------------------------------------------------------------ */

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
    const effect = this._effectsPool[this._effectIndex % 64];
    effect.active = true;
    effect.x = x;
    effect.y = y;
    effect.radius = 5;
    effect.maxRadius = type === 'perfect' ? 90 : type === 'great' ? 70 : 50;
    effect.opacity = 1;
    effect.color = color;
    effect.age = 0;
    effect.type = type;
    if (type === 'perfect' || type === 'great') {
      effect.particles = [];
      const count = type === 'perfect' ? 12 : 8;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 / count) * i + Math.random() * 0.4;
        const speed = 100 + Math.random() * 80;
        effect.particles.push({ angle, speed, x: 0, y: 0, life: 1 });
      }
    } else {
      effect.particles = [];
    }
    this._effectIndex++;
  }

  flashLane(lane) {
    // No-op: flash effects moved to Three.js camera glow
  }

  /** Returns the perspective-corrected hit position for a lane at the judge line. */
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

  /** Clear the entire canvas and draw black bars outside safe area */
  clear() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    this._drawBlackBars();
  }

  render({ notes, currentTime, laneCount, combo }) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    this._drawBackground(laneCount);
    this._drawNotes(notes, currentTime, laneCount);
    this._drawJudgeLine(laneCount);
    this._drawEffects();
    this._drawBlackBars();
  }

  /** Draw black bars outside the safe area (letterbox/pillarbox) */
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

  /* ------------------------------------------------------------------ */
  /*  Perspective helpers — tilted playfield fills screen vertically     */
  /* ------------------------------------------------------------------ */

  _getPerspectiveScale(y) {
    const sa = this.safeArea;
    const topY = sa.y;
    const judgeLineY = sa.y + sa.h * 0.92;
    const progress = Math.max(0, Math.min(1, (y - topY) / (judgeLineY - topY)));
    return 0.18 + 0.82 * progress;
  }

  _getLaneGeometry(laneIndex, y, laneCount) {
    const sa = this.safeArea;
    const playfieldWidth = sa.w * 0.55;
    const playfieldCenterX = sa.x + sa.w / 2;
    const scale = this._getPerspectiveScale(y);
    const currentWidth = playfieldWidth * scale;
    const laneWidth = currentWidth / laneCount;
    const leftEdge = playfieldCenterX - currentWidth / 2;
    return {
      x: leftEdge + laneIndex * laneWidth,
      width: laneWidth,
      centerX: leftEdge + (laneIndex + 0.5) * laneWidth
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Background / lanes — clean static rendering, no flash/pulse       */
  /* ------------------------------------------------------------------ */

  _drawBackground(laneCount) {
    const ctx = this.ctx;
    const sa = this.safeArea;
    const topY = sa.y;
    const judgeLineY = sa.y + sa.h * 0.92;

    /* Dimmed background image */
    if (this._bgImage) {
      ctx.save();
      ctx.globalAlpha = 0.15;
      const imgAspect = this._bgImage.width / this._bgImage.height;
      const canvasAspect = this.w / this.h;
      let drawW, drawH, drawX, drawY;
      if (canvasAspect > imgAspect) {
        drawW = this.w; drawH = this.w / imgAspect;
        drawX = 0; drawY = (this.h - drawH) / 2;
      } else {
        drawH = this.h; drawW = this.h * imgAspect;
        drawX = (this.w - drawW) / 2; drawY = 0;
      }
      ctx.drawImage(this._bgImage, drawX, drawY, drawW, drawH);
      ctx.restore();
    }

    /* Lane trapezoids — clean static rendering */
    for (let i = 0; i < laneCount; i++) {
      const topGeom = this._getLaneGeometry(i, topY, laneCount);
      const botGeom = this._getLaneGeometry(i, judgeLineY, laneCount);

      ctx.beginPath();
      ctx.moveTo(topGeom.x, topY);
      ctx.lineTo(topGeom.x + topGeom.width, topY);
      ctx.lineTo(botGeom.x + botGeom.width, judgeLineY);
      ctx.lineTo(botGeom.x, judgeLineY);
      ctx.closePath();

      const base = i % 2 === 0 ? 10 : 18;
      ctx.fillStyle = `rgba(${base},${Math.round(base * 0.7)},${Math.round(base * 0.5)},0.88)`;
      ctx.fill();
    }

    /* Lane separators */
    ctx.strokeStyle = 'rgba(170,255,0,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= laneCount; i++) {
      const topGeom = this._getLaneGeometry(i, topY, laneCount);
      const botGeom = this._getLaneGeometry(i, judgeLineY, laneCount);
      ctx.beginPath();
      ctx.moveTo(topGeom.x, topY);
      ctx.lineTo(botGeom.x, judgeLineY);
      ctx.stroke();
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Notes — hold notes clipped at judge line                           */
  /* ------------------------------------------------------------------ */

  _drawNotes(notes, currentTime, laneCount) {
    const ctx = this.ctx;
    const sa = this.safeArea;
    const judgeLineY = sa.y + sa.h * 0.92;
    const topBound = sa.y - 40;

    for (const note of notes) {
      if (note.type !== 'hold') {
        if (note.hit && note.judgement !== 'miss') continue;
        if (note.judgement === 'miss' && currentTime - note.time > 0.5) continue;
      } else {
        if (note.judgement === 'miss' && currentTime - note.time > 0.5) continue;
        if (note.released && note.hit && note.judgement !== 'miss' && currentTime - (note.time + note.duration) > 0.5) continue;
      }

      const color = LANE_COLORS[note.lane % LANE_COLORS.length];

      if (note.type === 'hold' && note.duration > 0) {
        this._drawHoldNote(ctx, note, currentTime, note.lane, laneCount, color, judgeLineY, topBound);
      } else {
        const noteY = judgeLineY - (note.time - currentTime) * this.scrollSpeed;
        if (noteY < -80 || noteY > judgeLineY + 30) continue;

        const distToJudge = judgeLineY - noteY;
        const fadeIn = Math.min(1, distToJudge / (this.scrollSpeed * 0.3));
        const alpha = note.judgement === 'miss' ? 0.3 : 1;

        this._drawTapNote(ctx, note.lane, noteY, laneCount, color, fadeIn * alpha);
      }
    }
  }

  _drawTapNote(ctx, laneIndex, noteY, laneCount, color, alpha) {
    const scale = this._getPerspectiveScale(noteY);
    const geom = this._getLaneGeometry(laneIndex, noteY, laneCount);
    const padding = 5 * scale;
    const x = geom.x + padding;
    const w = geom.width - padding * 2;
    const h = this.noteHeight * scale;
    const radius = Math.max(2, 8 * scale);

    ctx.save();
    ctx.globalAlpha = alpha;

    /* Glow */
    ctx.shadowBlur = 14 * scale;
    ctx.shadowColor = color;

    /* Note body */
    ctx.fillStyle = color;
    this._roundRect(ctx, x, noteY - h / 2, w, h, radius);
    ctx.fill();

    /* Gradient highlight */
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    const grad = ctx.createLinearGradient(x, noteY - h / 2, x, noteY + h / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.4)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.05)');
    grad.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = grad;
    this._roundRect(ctx, x, noteY - h / 2, w, h, radius);
    ctx.fill();

    ctx.restore();
  }

  _drawHoldNote(ctx, note, currentTime, laneIndex, laneCount, color, judgeLineY, topBound) {
    // noteY = position of the hold note HEAD (start time)
    const noteY = note.hit && note.judgement !== 'miss'
      ? judgeLineY // head was hit, clamp to judge line
      : judgeLineY - (note.time - currentTime) * this.scrollSpeed;

    // holdEndY = position of the hold note TAIL (end time)
    const holdEndY = judgeLineY - ((note.time + note.duration) - currentTime) * this.scrollSpeed;

    // Skip if both head and tail are far below judge line and not held
    if (noteY > judgeLineY + 50 && holdEndY > judgeLineY + 50 && !note.hit) return;
    // Skip if both head and tail are way above the screen and note is done
    if (holdEndY < -200 && noteY < -200 && note.released) return;

    const isHolding = note.hit && note.judgement !== 'miss' && !note.released;
    const alpha = note.judgement === 'miss' ? 0.3 : 1;

    // The tail (holdEndY) is further in the future → higher on screen (smaller Y)
    // The head (noteY) is closer to now → lower on screen (larger Y)
    // rawTopY = the topmost point (smallest Y = tail end)
    // rawBottomY = the bottommost point (largest Y = head end)
    const rawTopY = Math.min(noteY, holdEndY);
    const rawBottomY = Math.max(noteY, holdEndY);

    // Clip: don't draw below judge line, don't draw above top bound
    const drawTopY = Math.max(rawTopY, topBound);
    const drawBottomY = Math.min(rawBottomY, judgeLineY);

    // Nothing visible
    if (drawTopY >= drawBottomY) return;

    // Get geometry at draw points
    const topGeom = this._getLaneGeometry(laneIndex, drawTopY, laneCount);
    const bottomGeom = this._getLaneGeometry(laneIndex, drawBottomY, laneCount);
    const topScale = this._getPerspectiveScale(drawTopY);
    const bottomScale = this._getPerspectiveScale(drawBottomY);

    const topPad = 4 * topScale;
    const bottomPad = 4 * bottomScale;

    ctx.save();
    ctx.globalAlpha = alpha * (isHolding ? 0.95 : 0.85);

    /* Hold body — trapezoid from top (narrow) to bottom (wide) */
    ctx.beginPath();
    ctx.moveTo(topGeom.x + topPad, drawTopY);
    ctx.lineTo(topGeom.x + topGeom.width - topPad, drawTopY);
    ctx.lineTo(bottomGeom.x + bottomGeom.width - bottomPad, drawBottomY);
    ctx.lineTo(bottomGeom.x + bottomPad, drawBottomY);
    ctx.closePath();

    ctx.fillStyle = isHolding ? this._withAlpha(color, 0.45) : this._withAlpha(color, 0.30);
    ctx.fill();

    ctx.strokeStyle = isHolding ? this._withAlpha(color, 0.7) : this._withAlpha(color, 0.5);
    ctx.lineWidth = isHolding ? 2 : 1.5;
    ctx.stroke();

    ctx.restore();

    /* Center glow line */
    const topCenterX = topGeom.x + topGeom.width / 2;
    const bottomCenterX = bottomGeom.x + bottomGeom.width / 2;

    ctx.save();
    ctx.globalAlpha = alpha * (isHolding ? 0.4 : 0.2);
    ctx.shadowBlur = isHolding ? 16 : 10;
    ctx.shadowColor = color;
    ctx.strokeStyle = this._withAlpha(color, 0.5);
    ctx.lineWidth = isHolding ? 5 : 3;
    ctx.beginPath();
    ctx.moveTo(topCenterX, drawTopY);
    ctx.lineTo(bottomCenterX, drawBottomY);
    ctx.stroke();
    ctx.restore();

    /* Start cap (head) — only if head not hit yet AND head is within visible bounds above judge line */
    if (!note.hit || note.judgement === 'miss') {
      const headY = Math.min(noteY, judgeLineY); // clamp head to judge line
      if (headY >= topBound && headY <= judgeLineY) {
        this._drawHoldCap(ctx, laneIndex, headY, laneCount, color, alpha);
      }
    }

    /* End cap (tail) — only if within visible bounds above judge line */
    if (holdEndY >= topBound && holdEndY <= judgeLineY) {
      this._drawHoldCap(ctx, laneIndex, holdEndY, laneCount, color, alpha);
    }
  }

  _drawHoldCap(ctx, laneIndex, y, laneCount, color, alpha) {
    const scale = this._getPerspectiveScale(y);
    const geom = this._getLaneGeometry(laneIndex, y, laneCount);
    const padding = 5 * scale;
    const x = geom.x + padding;
    const w = geom.width - padding * 2;
    const h = this.noteHeight * scale;
    const radius = Math.max(2, 8 * scale);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = 10 * scale;
    ctx.shadowColor = color;

    ctx.fillStyle = color;
    this._roundRect(ctx, x, y - h / 2, w, h, radius);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    const grad = ctx.createLinearGradient(x, y - h / 2, x, y + h / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.3)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.15)');
    ctx.fillStyle = grad;
    this._roundRect(ctx, x, y - h / 2, w, h, radius);
    ctx.fill();

    ctx.restore();
  }

  /* ------------------------------------------------------------------ */
  /*  Judge line — clean glow, no arrows                                 */
  /* ------------------------------------------------------------------ */

  _drawJudgeLine(laneCount) {
    const ctx = this.ctx;
    const sa = this.safeArea;
    const judgeLineY = sa.y + sa.h * 0.92;

    const fullGeom = this._getLaneGeometry(0, judgeLineY, laneCount);
    const startX = fullGeom.x;
    const totalWidth = laneCount * fullGeom.width;

    /* Glowing line */
    ctx.save();
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#AAFF00';

    const gradient = ctx.createLinearGradient(startX, judgeLineY, startX + totalWidth, judgeLineY);
    gradient.addColorStop(0, 'rgba(170,255,0,0)');
    gradient.addColorStop(0.06, 'rgba(170,255,0,0.5)');
    gradient.addColorStop(0.5, '#AAFF00');
    gradient.addColorStop(0.94, 'rgba(170,255,0,0.5)');
    gradient.addColorStop(1, 'rgba(170,255,0,0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(startX, judgeLineY - 2.5, totalWidth, 5);
    ctx.restore();

    /* Soft outer glow */
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.shadowBlur = 35;
    ctx.shadowColor = '#AAFF00';
    ctx.fillStyle = '#AAFF00';
    ctx.fillRect(startX, judgeLineY - 1, totalWidth, 2);
    ctx.restore();
  }

  /* ------------------------------------------------------------------ */
  /*  Effects — hit animations                                           */
  /* ------------------------------------------------------------------ */

  _drawEffects() {
    const ctx = this.ctx;
    for (const effect of this._effectsPool) {
      if (!effect.active) continue;
      effect.age += 0.016;
      const duration = 0.35;
      const progress = effect.age / duration;
      if (progress >= 1) { effect.active = false; continue; }

      effect.radius = effect.maxRadius * progress;
      effect.opacity = 1 - progress;

      /* Expanding ring */
      ctx.save();
      ctx.strokeStyle = effect.color;
      ctx.globalAlpha = effect.opacity * 0.9;
      ctx.lineWidth = 4 * (1 - progress);
      ctx.shadowBlur = 16;
      ctx.shadowColor = effect.color;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      /* Inner flash */
      if (progress < 0.35) {
        ctx.save();
        ctx.globalAlpha = (0.35 - progress) / 0.35 * 0.5;
        ctx.fillStyle = effect.color;
        ctx.shadowBlur = 12;
        ctx.shadowColor = effect.color;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, 28 * (1 - progress), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      /* Great / Perfect — outer glow ring */
      if (effect.type === 'great' || effect.type === 'perfect') {
        ctx.save();
        ctx.globalAlpha = effect.opacity * (effect.type === 'perfect' ? 0.5 : 0.3);
        ctx.strokeStyle = '#00E5FF';
        ctx.lineWidth = 2 * (1 - progress);
        ctx.shadowBlur = 22;
        ctx.shadowColor = '#00E5FF';
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, effect.radius * 1.4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      /* Perfect — second expanding ring */
      if (effect.type === 'perfect') {
        ctx.save();
        ctx.strokeStyle = '#AAFF00';
        ctx.globalAlpha = effect.opacity * 0.35;
        ctx.lineWidth = 2 * (1 - progress);
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#AAFF00';
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, effect.radius * 0.7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      /* Burst particles */
      if (effect.particles && effect.particles.length > 0) {
        ctx.save();
        ctx.globalAlpha = effect.opacity;
        for (const p of effect.particles) {
          const dist = p.speed * progress;
          const px = effect.x + Math.cos(p.angle) * dist;
          const py = effect.y + Math.sin(p.angle) * dist;
          const size = (4 + (effect.type === 'perfect' ? 2 : 0)) * (1 - progress);
          ctx.fillStyle = effect.color;
          ctx.shadowBlur = 8;
          ctx.shadowColor = effect.color;
          ctx.beginPath();
          ctx.arc(px, py, size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Utility                                                            */
  /* ------------------------------------------------------------------ */

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

  _withAlpha(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
}
