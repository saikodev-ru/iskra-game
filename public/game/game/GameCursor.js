/**
 * GameCursor — RHYMIX neon pulsing circle cursor with glowing comet trail
 *
 * A ring cursor that pulses in sync with the song BPM, featuring a smooth
 * tapered trail, dual-contrast visibility (dark outline + inner glow), and
 * interactive hover/click feedback. Hides system cursor globally.
 *
 * API:
 *   static init()       — Create cursor, inject styles, start animation
 *   static show()       — Make cursor visible
 *   static hide()       — Hide cursor
 *   static setBPM(bpm)  — Update BPM for pulsing (0 → default 60 BPM)
 */

export class GameCursor {
  /* ── Constants ── */
  static _ACCENT      = '#AAFF00';
  static _ACCENT_RGB  = '170,255,0';
  static _RING_SIZE   = 28;           // base diameter in px
  static _TRAIL_COUNT = 14;           // number of trail segments
  static _TRAIL_MAX   = 26;           // max trail element width in px
  static _DEFAULT_BPM = 60;

  /* ── State ── */
  static _el          = null;         // cursor container
  static _svgRing     = null;         // the SVG <circle> element
  static _svgGlow     = null;         // outer glow ring
  static _svgInner    = null;         // inner fill circle (hover)
  static _svgDot      = null;         // center dot
  static _trailEls    = [];           // trail DOM elements
  static _trail       = [];           // trail position data [{x,y}]
  static _visible     = true;
  static _bpm         = 0;            // 0 = use default
  static _hovered     = false;
  static _clicked     = false;
  static _clickTime   = 0;
  static _rX          = -200;
  static _rY          = -200;
  static _tX          = -200;
  static _tY          = -200;
  static _animId      = null;
  static _startTime   = 0;

  /* ── Init ── */
  static init() {
    if (GameCursor._el) return;

    GameCursor._startTime = performance.now();

    // ── Inject global cursor-hiding + trail keyframe stylesheet ──
    const style = document.createElement('style');
    style.id = 'game-cursor-hide';
    style.textContent = `
      *, *::before, *::after {
        cursor: none !important;
      }
    `;
    document.head.appendChild(style);

    // ── Create cursor container ──
    const container = document.createElement('div');
    container.id = 'game-cursor';
    container.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      width: ${GameCursor._RING_SIZE + 16}px;
      height: ${GameCursor._RING_SIZE + 16}px;
      pointer-events: none;
      z-index: 99999;
      opacity: 0;
      transition: opacity 0.25s ease;
      will-change: transform, opacity;
    `;
    container.setAttribute('aria-hidden', 'true');

    // ── SVG ring cursor ──
    const svgNS = 'http://www.w3.org/2000/svg';
    const half = (GameCursor._RING_SIZE + 16) / 2;
    const r = GameCursor._RING_SIZE / 2;

    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${GameCursor._RING_SIZE + 16} ${GameCursor._RING_SIZE + 16}`);
    svg.setAttribute('width', GameCursor._RING_SIZE + 16);
    svg.setAttribute('height', GameCursor._RING_SIZE + 16);
    svg.style.cssText = 'display:block;width:100%;height:100%;overflow:visible;';

    // Defs: filters
    const defs = document.createElementNS(svgNS, 'defs');

    // Outer glow filter (accent color, soft spread)
    const glowFilter = document.createElementNS(svgNS, 'filter');
    glowFilter.setAttribute('id', 'cursor-glow');
    glowFilter.setAttribute('x', '-50%');
    glowFilter.setAttribute('y', '-50%');
    glowFilter.setAttribute('width', '200%');
    glowFilter.setAttribute('height', '200%');
    glowFilter.innerHTML = `
      <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur1"/>
      <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur2"/>
      <feMerge>
        <feMergeNode in="blur2"/>
        <feMergeNode in="blur1"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    `;
    defs.appendChild(glowFilter);

    // Hover glow filter (brighter)
    const hoverGlowFilter = document.createElementNS(svgNS, 'filter');
    hoverGlowFilter.setAttribute('id', 'cursor-hover-glow');
    hoverGlowFilter.setAttribute('x', '-80%');
    hoverGlowFilter.setAttribute('y', '-80%');
    hoverGlowFilter.setAttribute('width', '260%');
    hoverGlowFilter.setAttribute('height', '260%');
    hoverGlowFilter.innerHTML = `
      <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur1"/>
      <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur2"/>
      <feMerge>
        <feMergeNode in="blur2"/>
        <feMergeNode in="blur1"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    `;
    defs.appendChild(hoverGlowFilter);

    svg.appendChild(defs);

    // 1) Dark outline ring (outer shadow for visibility on light backgrounds)
    const outline = document.createElementNS(svgNS, 'circle');
    outline.setAttribute('cx', half);
    outline.setAttribute('cy', half);
    outline.setAttribute('r', r + 2);
    outline.setAttribute('fill', 'none');
    outline.setAttribute('stroke', 'rgba(0,0,0,0.55)');
    outline.setAttribute('stroke-width', '4');
    outline.style.cssText = 'transition: stroke-width 0.15s ease;';
    svg.appendChild(outline);

    // 2) Accent glow ring (main colored ring)
    const glowRing = document.createElementNS(svgNS, 'circle');
    glowRing.setAttribute('cx', half);
    glowRing.setAttribute('cy', half);
    glowRing.setAttribute('r', r);
    glowRing.setAttribute('fill', 'none');
    glowRing.setAttribute('stroke', GameCursor._ACCENT);
    glowRing.setAttribute('stroke-width', '2');
    glowRing.setAttribute('filter', 'url(#cursor-glow)');
    glowRing.setAttribute('opacity', '0.85');
    glowRing.style.cssText = 'transition: stroke-width 0.15s ease, opacity 0.15s ease;';
    GameCursor._svgGlow = glowRing;
    svg.appendChild(glowRing);

    // 3) White core ring (inner brightness for dark backgrounds)
    const whiteRing = document.createElementNS(svgNS, 'circle');
    whiteRing.setAttribute('cx', half);
    whiteRing.setAttribute('cy', half);
    whiteRing.setAttribute('r', r);
    whiteRing.setAttribute('fill', 'none');
    whiteRing.setAttribute('stroke', 'rgba(255,255,255,0.7)');
    whiteRing.setAttribute('stroke-width', '1');
    whiteRing.style.cssText = 'transition: stroke-width 0.15s ease;';
    GameCursor._svgRing = whiteRing;
    svg.appendChild(whiteRing);

    // 4) Inner fill (subtle, shows on hover)
    const innerFill = document.createElementNS(svgNS, 'circle');
    innerFill.setAttribute('cx', half);
    innerFill.setAttribute('cy', half);
    innerFill.setAttribute('r', r - 3);
    innerFill.setAttribute('fill', `rgba(${GameCursor._ACCENT_RGB},0)`);
    innerFill.style.cssText = 'transition: fill 0.2s ease;';
    GameCursor._svgInner = innerFill;
    svg.appendChild(innerFill);

    // 5) Center dot
    const dot = document.createElementNS(svgNS, 'circle');
    dot.setAttribute('cx', half);
    dot.setAttribute('cy', half);
    dot.setAttribute('r', '1.8');
    dot.setAttribute('fill', `rgba(${GameCursor._ACCENT_RGB},0.9)`);
    dot.setAttribute('filter', 'url(#cursor-glow)');
    dot.style.cssText = 'transition: r 0.15s ease;';
    GameCursor._svgDot = dot;
    svg.appendChild(dot);

    container.appendChild(svg);
    document.body.appendChild(container);
    GameCursor._el = container;

    // ── Create trail elements (comet-like tapered trail) ──
    for (let i = 0; i < GameCursor._TRAIL_COUNT; i++) {
      const seg = document.createElement('div');
      const t = i / (GameCursor._TRAIL_COUNT - 1); // 0..1 from newest to oldest
      const width = Math.max(2, GameCursor._TRAIL_MAX * (1 - t * 0.9));
      const alpha = 0.5 * (1 - t);
      const blur = 2 + t * 6;

      seg.style.cssText = `
        position: fixed;
        top: 0; left: 0;
        width: ${width}px;
        height: ${width}px;
        margin: ${-width / 2}px 0 0 ${-width / 2}px;
        border-radius: 50%;
        background: radial-gradient(
          circle,
          rgba(${GameCursor._ACCENT_RGB},${alpha}) 0%,
          rgba(${GameCursor._ACCENT_RGB},${alpha * 0.4}) 50%,
          transparent 100%
        );
        pointer-events: none;
        z-index: 99998;
        opacity: 0;
        transition: opacity 0.25s ease;
        will-change: transform;
        box-shadow: 0 0 ${blur}px rgba(${GameCursor._ACCENT_RGB},${alpha * 0.5});
      `;
      seg.setAttribute('aria-hidden', 'true');
      document.body.appendChild(seg);
      GameCursor._trailEls.push(seg);
      GameCursor._trail.push({ x: -200, y: -200 });
    }

    // ── Mouse tracking ──
    document.addEventListener('mousemove', (e) => {
      GameCursor._tX = e.clientX;
      GameCursor._tY = e.clientY;
    });

    // ── Hover detection on clickable elements ──
    document.addEventListener('mouseover', (e) => {
      if (!GameCursor._visible) return;
      const target = e.target && e.target.closest(
        'button, a, [role="button"], .song-card, .difficulty-item, .zzz-btn, input, select, [data-clickable], canvas, [onclick], summary, label'
      );
      GameCursor._hovered = !!target;
    });

    document.addEventListener('mouseout', (e) => {
      if (!GameCursor._visible) return;
      const target = e.target && e.target.closest(
        'button, a, [role="button"], .song-card, .difficulty-item, .zzz-btn, input, select, [data-clickable], canvas, [onclick], summary, label'
      );
      if (target) GameCursor._hovered = false;
    });

    // ── Click snap ──
    document.addEventListener('mousedown', () => {
      GameCursor._clicked = true;
      GameCursor._clickTime = performance.now();
    });
    document.addEventListener('mouseup', () => {
      GameCursor._clicked = false;
    });

    // ── Start animation loop ──
    GameCursor._animate(performance.now());

    // Show after a short delay to avoid flash
    setTimeout(() => GameCursor.show(), 120);
  }

  /* ── Animation Loop ── */
  static _animate(now) {
    const elapsed = (now - GameCursor._startTime) / 1000; // seconds since init
    const bpm = GameCursor._bpm > 0 ? GameCursor._bpm : GameCursor._DEFAULT_BPM;

    // Smooth cursor interpolation
    const lerp = 0.35;
    GameCursor._rX += (GameCursor._tX - GameCursor._rX) * lerp;
    GameCursor._rY += (GameCursor._tY - GameCursor._rY) * lerp;

    // ── BPM-based pulse ──
    // Two phases: sin wave gives smooth breathe; abs gives double-time "heartbeat"
    const beatPhase = (elapsed * bpm / 60) * Math.PI * 2;
    const pulseRaw = Math.sin(beatPhase);
    const pulse = Math.abs(pulseRaw); // 0..1 pulsing at double BPM frequency
    const pulseScale = 1 + pulse * 0.15; // scale from 1.0 to 1.15
    const glowIntensity = 0.6 + pulse * 0.4; // 0.6..1.0

    // ── Click snap ──
    const clickAge = (now - GameCursor._clickTime) / 1000;
    const clickSnap = GameCursor._clicked
      ? 0.75
      : clickAge < 0.15
        ? 0.75 + 0.25 * Math.min(1, clickAge / 0.15)
        : 1;

    // ── Hover fill ──
    const hoverFill = GameCursor._hovered ? 0.12 + pulse * 0.06 : 0;
    const hoverStroke = GameCursor._hovered ? 3 : 2;

    // ── Combined scale ──
    const hoverScale = GameCursor._hovered ? 1.08 : 1;
    const finalScale = pulseScale * hoverScale * clickSnap;

    // ── Position offset (center the ring on cursor point) ──
    const halfSize = (GameCursor._RING_SIZE + 16) / 2;
    const tx = GameCursor._rX - halfSize;
    const ty = GameCursor._rY - halfSize;

    // ── Apply transforms to cursor ──
    if (GameCursor._el) {
      GameCursor._el.style.transform = `translate(${tx}px, ${ty}px) scale(${finalScale})`;
    }

    // ── Update SVG elements ──
    if (GameCursor._svgGlow) {
      GameCursor._svgGlow.setAttribute('stroke-width', hoverStroke);
      GameCursor._svgGlow.setAttribute('opacity', glowIntensity.toFixed(3));
      if (GameCursor._hovered) {
        GameCursor._svgGlow.setAttribute('filter', 'url(#cursor-hover-glow)');
      } else {
        GameCursor._svgGlow.setAttribute('filter', 'url(#cursor-glow)');
      }
    }

    if (GameCursor._svgRing) {
      GameCursor._svgRing.setAttribute('stroke-width', GameCursor._hovered ? 1.5 : 1);
    }

    if (GameCursor._svgInner) {
      GameCursor._svgInner.setAttribute(
        'fill',
        `rgba(${GameCursor._ACCENT_RGB},${hoverFill.toFixed(3)})`
      );
    }

    // ── Update trail ──
    const trail = GameCursor._trail;
    // Head follows cursor with slight lag
    trail[0].x += (GameCursor._rX - trail[0].x) * 0.45;
    trail[0].y += (GameCursor._rY - trail[0].y) * 0.45;
    // Each subsequent point follows the previous
    for (let i = 1; i < trail.length; i++) {
      const follow = 0.28 - i * 0.008; // decreasing follow speed for taper
      trail[i].x += (trail[i - 1].x - trail[i].x) * Math.max(0.08, follow);
      trail[i].y += (trail[i - 1].y - trail[i].y) * Math.max(0.08, follow);
    }

    // Position trail elements with subtle BPM-synced size pulse
    for (let i = 0; i < GameCursor._trailEls.length; i++) {
      const el = GameCursor._trailEls[i];
      const t = i / (GameCursor._TRAIL_COUNT - 1);
      // Trail size pulses with beat (delayed slightly per segment)
      const trailPulse = 1 + pulse * 0.12 * (1 - t * 0.7);
      const size = Math.max(2, GameCursor._TRAIL_MAX * (1 - t * 0.9)) * trailPulse;

      el.style.transform = `translate(${trail[i].x}px, ${trail[i].y}px)`;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.marginTop = `${-size / 2}px`;
      el.style.marginLeft = `${-size / 2}px`;
    }

    GameCursor._animId = requestAnimationFrame(GameCursor._animate);
  }

  /* ── Public API ── */

  static show() {
    GameCursor._visible = true;
    if (GameCursor._el) GameCursor._el.style.opacity = '1';
    for (const el of GameCursor._trailEls) el.style.opacity = '1';
  }

  static hide() {
    GameCursor._visible = false;
    if (GameCursor._el) GameCursor._el.style.opacity = '0';
    for (const el of GameCursor._trailEls) el.style.opacity = '0';
  }

  static setBPM(bpm) {
    GameCursor._bpm = bpm || 0;
  }
}
