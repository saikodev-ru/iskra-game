const LANE_COLORS = ['#00E5FF', '#F5C518', '#FF3D3D', '#A855F7', '#00E5FF', '#F5C518', '#FF3D3D', '#A855F7'];
const LANE_COLORS_DIM = ['rgba(0,229,255,0.15)', 'rgba(245,197,24,0.15)', 'rgba(255,61,61,0.15)', 'rgba(168,85,247,0.15)', 'rgba(0,229,255,0.15)', 'rgba(245,197,24,0.15)', 'rgba(255,61,61,0.15)', 'rgba(168,85,247,0.15)'];

export default class NoteRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scrollSpeed = 400; // px/s, configurable
    this.judgeLineY = 0;
    this.noteHeight = 18;
    this.holdWidth = 0;
    this._laneFlash = new Array(8).fill(0); // opacity per lane, 0-1
    this._effectsPool = new Array(32);
    for (let i = 0; i < 32; i++) {
      this._effectsPool[i] = { active: false, x: 0, y: 0, radius: 0, maxRadius: 0, opacity: 0, color: '', age: 0 };
    }
    this._effectIndex = 0;
    
    this.resize();
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
    this.judgeLineY = this.h * 0.85;
  }

  addEffect(x, y, color, isPerfect = false) {
    const effect = this._effectsPool[this._effectIndex % 32];
    effect.active = true;
    effect.x = x;
    effect.y = y;
    effect.radius = 5;
    effect.maxRadius = isPerfect ? 60 : 40;
    effect.opacity = 1;
    effect.color = color;
    effect.age = 0;
    effect.isPerfect = isPerfect;
    this._effectIndex++;
  }

  flashLane(lane, laneX, laneWidth) {
    this._laneFlash[lane] = 1;
  }

  render({ notes, currentTime, laneCount, combo }) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    
    const laneWidth = this.w * 0.5 / laneCount;
    const startX = this.w * 0.25;
    this.holdWidth = laneWidth - 8;
    
    this._drawBackground(laneCount, startX, laneWidth);
    this._drawLaneFlash(laneCount, startX, laneWidth);
    this._drawJudgeLine(laneCount, startX, laneWidth);
    this._drawNotes(notes, currentTime, laneCount, startX, laneWidth);
    this._drawEffects();
  }

  _drawBackground(laneCount, startX, laneWidth) {
    const ctx = this.ctx;
    
    // Draw lane areas
    for (let i = 0; i < laneCount; i++) {
      const x = startX + i * laneWidth;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(13,17,23,0.8)' : 'rgba(19,26,36,0.8)';
      ctx.fillRect(x, 0, laneWidth, this.h);
      
      // Lane separator
      ctx.strokeStyle = 'rgba(0,229,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.h);
      ctx.stroke();
    }
    
    // Right edge
    ctx.beginPath();
    ctx.moveTo(startX + laneCount * laneWidth, 0);
    ctx.lineTo(startX + laneCount * laneWidth, this.h);
    ctx.stroke();
  }

  _drawLaneFlash(laneCount, startX, laneWidth) {
    const ctx = this.ctx;
    for (let i = 0; i < laneCount; i++) {
      if (this._laneFlash[i] > 0) {
        const x = startX + i * laneWidth;
        ctx.fillStyle = `rgba(0,229,255,${this._laneFlash[i] * 0.2})`;
        ctx.fillRect(x, this.judgeLineY - 30, laneWidth, 60);
        this._laneFlash[i] = Math.max(0, this._laneFlash[i] - 0.06);
      }
    }
  }

  _drawJudgeLine(laneCount, startX, laneWidth) {
    const ctx = this.ctx;
    const totalWidth = laneCount * laneWidth;
    const y = this.judgeLineY;
    
    // Glow line
    ctx.save();
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#00E5FF';
    
    const gradient = ctx.createLinearGradient(startX, y, startX + totalWidth, y);
    gradient.addColorStop(0, 'rgba(0,229,255,0)');
    gradient.addColorStop(0.1, 'rgba(0,229,255,0.8)');
    gradient.addColorStop(0.5, '#00E5FF');
    gradient.addColorStop(0.9, 'rgba(0,229,255,0.8)');
    gradient.addColorStop(1, 'rgba(0,229,255,0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(startX, y - 2, totalWidth, 4);
    ctx.restore();
    
    // Lane boundary markers (▲)
    ctx.fillStyle = 'rgba(0,229,255,0.5)';
    for (let i = 0; i <= laneCount; i++) {
      const x = startX + i * laneWidth;
      ctx.beginPath();
      ctx.moveTo(x, y + 8);
      ctx.lineTo(x - 4, y + 14);
      ctx.lineTo(x + 4, y + 14);
      ctx.closePath();
      ctx.fill();
    }
  }

  _drawNotes(notes, currentTime, laneCount, startX, laneWidth) {
    const ctx = this.ctx;
    
    for (const note of notes) {
      if (note.judgement === 'miss') continue;
      
      const noteY = this.judgeLineY - (note.time - currentTime) * this.scrollSpeed;
      
      // Only draw if on screen
      if (noteY < -50 || noteY > this.h + 50) continue;
      
      const laneX = startX + note.lane * laneWidth;
      const color = LANE_COLORS[note.lane % LANE_COLORS.length];
      
      // Fade in as notes approach
      const distToJudge = this.judgeLineY - noteY;
      const fadeIn = Math.min(1, distToJudge / (this.scrollSpeed * 0.3));
      
      if (note.type === 'hold') {
        this._drawHoldNote(ctx, note, noteY, laneX, laneWidth, color, fadeIn, currentTime);
      } else {
        this._drawTapNote(ctx, note, noteY, laneX, laneWidth, color, fadeIn);
      }
    }
  }

  _drawTapNote(ctx, note, noteY, laneX, laneWidth, color, fadeIn) {
    const padding = 4;
    const x = laneX + padding;
    const w = laneWidth - padding * 2;
    const h = this.noteHeight;
    const radius = 4;
    
    ctx.save();
    ctx.globalAlpha = fadeIn;
    
    // Note body
    ctx.fillStyle = color;
    this._roundRect(ctx, x, noteY - h / 2, w, h, radius);
    ctx.fill();
    
    // Outline (lighter)
    ctx.strokeStyle = this._lighten(color, 0.3);
    ctx.lineWidth = 1;
    this._roundRect(ctx, x, noteY - h / 2, w, h, radius);
    ctx.stroke();
    
    // Inner highlight
    const grad = ctx.createLinearGradient(x, noteY - h / 2, x, noteY + h / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.2)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(255,255,255,0.1)');
    ctx.fillStyle = grad;
    this._roundRect(ctx, x, noteY - h / 2, w, h, radius);
    ctx.fill();
    
    ctx.restore();
  }

  _drawHoldNote(ctx, note, noteY, laneX, laneWidth, color, fadeIn, currentTime) {
    const padding = 4;
    const x = laneX + padding;
    const w = laneWidth - padding * 2;
    const holdEnd = this.judgeLineY - ((note.time + note.duration) - currentTime) * this.scrollSpeed;
    const holdHeight = Math.abs(noteY - holdEnd);
    const topY = Math.min(noteY, holdEnd);
    const radius = 4;
    
    ctx.save();
    ctx.globalAlpha = fadeIn * 0.8;
    
    // Hold body (semi-transparent)
    ctx.fillStyle = this._withAlpha(color, 0.3);
    this._roundRect(ctx, x, topY, w, holdHeight, radius);
    ctx.fill();
    
    // Hold body border
    ctx.strokeStyle = this._withAlpha(color, 0.5);
    ctx.lineWidth = 1;
    this._roundRect(ctx, x, topY, w, holdHeight, radius);
    ctx.stroke();
    
    // Start cap (solid)
    ctx.globalAlpha = fadeIn;
    ctx.fillStyle = color;
    this._roundRect(ctx, x, noteY - this.noteHeight / 2, w, this.noteHeight, radius);
    ctx.fill();
    
    // End cap (solid)
    ctx.fillStyle = color;
    this._roundRect(ctx, x, holdEnd - this.noteHeight / 2, w, this.noteHeight, radius);
    ctx.fill();
    
    ctx.restore();
  }

  _drawEffects() {
    const ctx = this.ctx;
    
    for (const effect of this._effectsPool) {
      if (!effect.active) continue;
      
      effect.age += 0.016; // ~60fps
      const progress = effect.age / 0.2; // 200ms duration
      
      if (progress >= 1) {
        effect.active = false;
        continue;
      }
      
      effect.radius = effect.maxRadius * progress;
      effect.opacity = 1 - progress;
      
      // Expanding ring
      ctx.save();
      ctx.strokeStyle = effect.color;
      ctx.globalAlpha = effect.opacity;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 8;
      ctx.shadowColor = effect.color;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      
      // Perfect: particles shooting outward
      if (effect.isPerfect) {
        ctx.save();
        ctx.globalAlpha = effect.opacity * 0.8;
        const particleCount = 6;
        for (let i = 0; i < particleCount; i++) {
          const angle = (Math.PI * 2 / particleCount) * i;
          const dist = effect.radius * 0.8;
          const px = effect.x + Math.cos(angle) * dist;
          const py = effect.y + Math.sin(angle) * dist;
          
          ctx.fillStyle = effect.color;
          ctx.beginPath();
          ctx.arc(px, py, 3 * (1 - progress), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  _roundRect(ctx, x, y, w, h, r) {
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

  _lighten(hex, amount) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const nr = Math.min(255, r + (255 - r) * amount);
    const ng = Math.min(255, g + (255 - g) * amount);
    const nb = Math.min(255, b + (255 - b) * amount);
    return `rgb(${Math.round(nr)},${Math.round(ng)},${Math.round(nb)})`;
  }

  _withAlpha(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
}
