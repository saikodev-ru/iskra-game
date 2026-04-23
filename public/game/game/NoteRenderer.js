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
    this._laneFlash = new Array(8).fill(0);
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
    const effect = this._effectsPool[this._effectIndex % 48];
    effect.active = true;
    effect.x = x;
    effect.y = y;
    effect.radius = 5;
    effect.maxRadius = type === 'perfect' ? 70 : type === 'great' ? 55 : 40;
    effect.opacity = 1;
    effect.color = color;
    effect.age = 0;
    effect.type = type;
    if (type === 'perfect' || type === 'great') {
      effect.particles = [];
      const count = type === 'perfect' ? 8 : 6;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 / count) * i + Math.random() * 0.3;
        const speed = 80 + Math.random() * 60;
        effect.particles.push({ angle, speed, x: 0, y: 0, life: 1 });
      }
    } else {
      effect.particles = [];
    }
    this._effectIndex++;
  }

  flashLane(lane) {
    this._laneFlash[lane] = 1;
  }

  /** Returns the perspective-corrected hit position for a lane at the judge line. */
  getLaneHitPosition(lane, laneCount) {
    const sa = this.safeArea;
    const judgeLineY = sa.y + sa.h * 0.88;
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

  render({ notes, currentTime, laneCount, combo }) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    this._drawBackground(laneCount);
    this._drawLaneFlash(laneCount);
    this._drawNotes(notes, currentTime, laneCount);
    this._drawJudgeLine(laneCount);
    this._drawEffects();
  }

  /* ------------------------------------------------------------------ */
  /*  Perspective helpers                                                */
  /* ------------------------------------------------------------------ */

  /**
   * Returns the perspective scale factor for a given screen-Y position.
   * 0.4 at the playfield top, 1.0 at the judge line.
   */
  _getPerspectiveScale(y) {
    const sa = this.safeArea;
    const topY = sa.y;
    const judgeLineY = sa.y + sa.h * 0.88;
    const progress = Math.max(0, Math.min(1, (y - topY) / (judgeLineY - topY)));
    return 0.4 + 0.6 * progress;
  }

  /**
   * Returns { x, width, centerX } for a lane at a given screen-Y.
   * `x` is the left edge of the lane, `width` is the lane width,
   * `centerX` is the horizontal center of the lane.
   */
  _getLaneGeometry(laneIndex, y, laneCount) {
    const sa = this.safeArea;
    const playfieldWidth = sa.w * 0.5;
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
  /*  Background / lanes                                                 */
  /* ------------------------------------------------------------------ */

  _drawBackground(laneCount) {
    const ctx = this.ctx;
    const sa = this.safeArea;
    const topY = sa.y;
    const judgeLineY = sa.y + sa.h * 0.88;

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

    /* Lane trapezoids */
    for (let i = 0; i < laneCount; i++) {
      const topGeom = this._getLaneGeometry(i, topY, laneCount);
      const botGeom = this._getLaneGeometry(i, judgeLineY, laneCount);

      ctx.beginPath();
      ctx.moveTo(topGeom.x, topY);
      ctx.lineTo(topGeom.x + topGeom.width, topY);
      ctx.lineTo(botGeom.x + botGeom.width, judgeLineY);
      ctx.lineTo(botGeom.x, judgeLineY);
      ctx.closePath();

      ctx.fillStyle = i % 2 === 0 ? 'rgba(10,10,10,0.88)' : 'rgba(20,20,20,0.88)';
      ctx.fill();
    }

    /* Lane separators (converging lines) */
    ctx.strokeStyle = 'rgba(170,255,0,0.07)';
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
  /*  Lane flash                                                         */
  /* ------------------------------------------------------------------ */

  _drawLaneFlash(laneCount) {
    const ctx = this.ctx;
    const sa = this.safeArea;
    const judgeLineY = sa.y + sa.h * 0.88;

    for (let i = 0; i < laneCount; i++) {
      if (this._laneFlash[i] <= 0) continue;

      const flashTop = judgeLineY - 60;
      const flashBottom = judgeLineY + 20;
      const topGeom = this._getLaneGeometry(i, flashTop, laneCount);
      const botGeom = this._getLaneGeometry(i, flashBottom, laneCount);

      ctx.save();
      ctx.globalAlpha = this._laneFlash[i] * 0.3;
      ctx.fillStyle = '#AAFF00';

      ctx.beginPath();
      ctx.moveTo(topGeom.x, flashTop);
      ctx.lineTo(topGeom.x + topGeom.width, flashTop);
      ctx.lineTo(botGeom.x + botGeom.width, flashBottom);
      ctx.lineTo(botGeom.x, flashBottom);
      ctx.closePath();
      ctx.fill();

      /* Brighter core near judge line */
      const coreTop = judgeLineY - 20;
      const coreBot = judgeLineY + 8;
      const coreTopGeom = this._getLaneGeometry(i, coreTop, laneCount);
      const coreBotGeom = this._getLaneGeometry(i, coreBot, laneCount);
      ctx.globalAlpha = this._laneFlash[i] * 0.45;
      ctx.beginPath();
      ctx.moveTo(coreTopGeom.x, coreTop);
      ctx.lineTo(coreTopGeom.x + coreTopGeom.width, coreTop);
      ctx.lineTo(coreBotGeom.x + coreBotGeom.width, coreBot);
      ctx.lineTo(coreBotGeom.x, coreBot);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
      this._laneFlash[i] = Math.max(0, this._laneFlash[i] - 0.045);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Notes                                                              */
  /* ------------------------------------------------------------------ */

  _drawNotes(notes, currentTime, laneCount) {
    const ctx = this.ctx;
    const sa = this.safeArea;
    const judgeLineY = sa.y + sa.h * 0.88;

    for (const note of notes) {
      if (note.hit && note.judgement !== 'miss') continue;
      if (note.judgement === 'miss' && currentTime - note.time > 0.5) continue;

      const noteY = judgeLineY - (note.time - currentTime) * this.scrollSpeed;
      if (noteY < -80 || noteY > this.h + 50) continue;

      const color = LANE_COLORS[note.lane % LANE_COLORS.length];

      /* Fade-in: notes gradually appear as they approach */
      const distToJudge = judgeLineY - noteY;
      const fadeIn = Math.min(1, distToJudge / (this.scrollSpeed * 0.3));

      /* Dim missed notes */
      const alpha = note.judgement === 'miss' ? 0.3 : 1;

      if (note.type === 'hold') {
        this._drawHoldNote(ctx, note, noteY, note.lane, laneCount, color, fadeIn * alpha, currentTime);
      } else {
        this._drawTapNote(ctx, note.lane, noteY, laneCount, color, fadeIn * alpha);
      }
    }
  }

  _drawTapNote(ctx, laneIndex, noteY, laneCount, color, alpha) {
    const scale = this._getPerspectiveScale(noteY);
    const geom = this._getLaneGeometry(laneIndex, noteY, laneCount);
    const padding = 6 * scale;
    const x = geom.x + padding;
    const w = geom.width - padding * 2;
    const h = this.noteHeight * scale;
    const radius = Math.max(2, 6 * scale);

    ctx.save();
    ctx.globalAlpha = alpha;

    /* Subtle glow / bloom */
    ctx.shadowBlur = 10 * scale;
    ctx.shadowColor = color;

    /* Note body */
    ctx.fillStyle = color;
    this._roundRect(ctx, x, noteY - h / 2, w, h, radius);
    ctx.fill();

    /* Gradient highlight */
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    const grad = ctx.createLinearGradient(x, noteY - h / 2, x, noteY + h / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.35)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.05)');
    grad.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = grad;
    this._roundRect(ctx, x, noteY - h / 2, w, h, radius);
    ctx.fill();

    /* Border */
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    this._roundRect(ctx, x, noteY - h / 2, w, h, radius);
    ctx.stroke();

    ctx.restore();
  }

  _drawHoldNote(ctx, note, noteY, laneIndex, laneCount, color, alpha, currentTime) {
    const sa = this.safeArea;
    const judgeLineY = sa.y + sa.h * 0.88;

    const holdEndY = judgeLineY - ((note.time + note.duration) - currentTime) * this.scrollSpeed;
    const topY = Math.min(noteY, holdEndY);
    const bottomY = Math.max(noteY, holdEndY);

    const topScale = this._getPerspectiveScale(topY);
    const bottomScale = this._getPerspectiveScale(bottomY);
    const topGeom = this._getLaneGeometry(laneIndex, topY, laneCount);
    const bottomGeom = this._getLaneGeometry(laneIndex, bottomY, laneCount);

    const topPad = 6 * topScale;
    const bottomPad = 6 * bottomScale;

    ctx.save();
    ctx.globalAlpha = alpha * 0.7;

    /* Hold body — trapezoid narrowing towards the top */
    ctx.beginPath();
    ctx.moveTo(topGeom.x + topPad, topY);
    ctx.lineTo(topGeom.x + topGeom.width - topPad, topY);
    ctx.lineTo(bottomGeom.x + bottomGeom.width - bottomPad, bottomY);
    ctx.lineTo(bottomGeom.x + bottomPad, bottomY);
    ctx.closePath();

    ctx.fillStyle = this._withAlpha(color, 0.18);
    ctx.fill();

    ctx.strokeStyle = this._withAlpha(color, 0.35);
    ctx.lineWidth = 1;
    ctx.stroke();

    /* Center guide line */
    const topCenterX = topGeom.x + topGeom.width / 2;
    const bottomCenterX = bottomGeom.x + bottomGeom.width / 2;
    ctx.strokeStyle = this._withAlpha(color, 0.12);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(topCenterX, topY);
    ctx.lineTo(bottomCenterX, bottomY);
    ctx.stroke();

    ctx.restore();

    /* Start cap (at noteY — the leading edge of the hold) */
    this._drawHoldCap(ctx, laneIndex, noteY, laneCount, color, alpha);

    /* End cap */
    this._drawHoldCap(ctx, laneIndex, holdEndY, laneCount, color, alpha);
  }

  _drawHoldCap(ctx, laneIndex, y, laneCount, color, alpha) {
    const scale = this._getPerspectiveScale(y);
    const geom = this._getLaneGeometry(laneIndex, y, laneCount);
    const padding = 6 * scale;
    const x = geom.x + padding;
    const w = geom.width - padding * 2;
    const h = this.noteHeight * scale;
    const radius = Math.max(2, 6 * scale);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = 8 * scale;
    ctx.shadowColor = color;

    ctx.fillStyle = color;
    this._roundRect(ctx, x, y - h / 2, w, h, radius);
    ctx.fill();

    /* Highlight */
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
  /*  Judge line                                                         */
  /* ------------------------------------------------------------------ */

  _drawJudgeLine(laneCount) {
    const ctx = this.ctx;
    const sa = this.safeArea;
    const judgeLineY = sa.y + sa.h * 0.88;

    /* Full playfield width at the judge line */
    const fullGeom = this._getLaneGeometry(0, judgeLineY, laneCount);
    const startX = fullGeom.x;
    const totalWidth = laneCount * fullGeom.width;

    /* Glowing line */
    ctx.save();
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#AAFF00';

    const gradient = ctx.createLinearGradient(startX, judgeLineY, startX + totalWidth, judgeLineY);
    gradient.addColorStop(0, 'rgba(170,255,0,0)');
    gradient.addColorStop(0.08, 'rgba(170,255,0,0.6)');
    gradient.addColorStop(0.5, '#AAFF00');
    gradient.addColorStop(0.92, 'rgba(170,255,0,0.6)');
    gradient.addColorStop(1, 'rgba(170,255,0,0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(startX, judgeLineY - 2.5, totalWidth, 5);
    ctx.restore();

    /* Second softer glow pass */
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.shadowBlur = 30;
    ctx.shadowColor = '#AAFF00';
    ctx.fillStyle = '#AAFF00';
    ctx.fillRect(startX, judgeLineY - 1, totalWidth, 2);
    ctx.restore();

    /* Arrow / triangle markers at lane boundaries */
    ctx.fillStyle = 'rgba(170,255,0,0.45)';
    for (let i = 0; i <= laneCount; i++) {
      const x = startX + i * fullGeom.width;
      ctx.beginPath();
      ctx.moveTo(x, judgeLineY + 10);
      ctx.lineTo(x - 6, judgeLineY + 20);
      ctx.lineTo(x + 6, judgeLineY + 20);
      ctx.closePath();
      ctx.fill();
    }

    /* Lane center dots */
    ctx.fillStyle = 'rgba(170,255,0,0.25)';
    for (let i = 0; i < laneCount; i++) {
      const geom = this._getLaneGeometry(i, judgeLineY, laneCount);
      ctx.beginPath();
      ctx.arc(geom.centerX, judgeLineY, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Effects                                                            */
  /* ------------------------------------------------------------------ */

  _drawEffects() {
    const ctx = this.ctx;
    for (const effect of this._effectsPool) {
      if (!effect.active) continue;
      effect.age += 0.016;
      const duration = 0.25;
      const progress = effect.age / duration;
      if (progress >= 1) { effect.active = false; continue; }

      effect.radius = effect.maxRadius * progress;
      effect.opacity = 1 - progress;

      /* Expanding ring */
      ctx.save();
      ctx.strokeStyle = effect.color;
      ctx.globalAlpha = effect.opacity * 0.8;
      ctx.lineWidth = 3 * (1 - progress);
      ctx.shadowBlur = 14;
      ctx.shadowColor = effect.color;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      /* Inner flash */
      if (progress < 0.3) {
        ctx.save();
        ctx.globalAlpha = (0.3 - progress) / 0.3 * 0.45;
        ctx.fillStyle = effect.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = effect.color;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, 22 * (1 - progress), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      /* Great / Perfect — cyan glow ring */
      if (effect.type === 'great' || effect.type === 'perfect') {
        ctx.save();
        const glowColor = effect.type === 'perfect' ? '#00E5FF' : '#00E5FF';
        ctx.globalAlpha = effect.opacity * (effect.type === 'perfect' ? 0.5 : 0.3);
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 2 * (1 - progress);
        ctx.shadowBlur = 18;
        ctx.shadowColor = glowColor;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, effect.radius * 1.3, 0, Math.PI * 2);
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
          const size = 4 * (1 - progress);
          ctx.fillStyle = effect.color;
          ctx.shadowBlur = 6;
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
