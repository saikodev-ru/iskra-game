/**
 * GameCursor — custom animated arrow cursor in RHYMIX style
 *
 * Renders a neon lime arrow cursor with glow trail.
 * Hides system cursor globally via injected <style>.
 * Hides automatically during gameplay, shows on menus.
 */

export class GameCursor {
  static _el = null;
  static _trail = [];
  static _trailEls = [];
  static _visible = true;
  static _rX = -100;
  static _rY = -100;
  static _tX = -100;
  static _tY = -100;
  static _animId = null;
  static _lastTime = 0;
  static _styleTag = null;

  static init() {
    if (GameCursor._el) return;

    // ── Inject global cursor-hiding stylesheet ──
    const style = document.createElement('style');
    style.id = 'game-cursor-hide';
    style.textContent = `
      *, *::before, *::after {
        cursor: none !important;
      }
    `;
    document.head.appendChild(style);
    GameCursor._styleTag = style;

    // ── Create SVG arrow cursor ──
    const cursor = document.createElement('div');
    cursor.id = 'game-cursor';
    cursor.style.cssText = `
      position: fixed; top: 0; left: 0;
      width: 24px; height: 24px;
      pointer-events: none;
      z-index: 9999;
      opacity: 0;
      transition: opacity 0.2s ease;
      will-change: transform, opacity;
      filter: drop-shadow(0 0 3px rgba(170,255,0,0.6)) drop-shadow(0 0 8px rgba(170,255,0,0.3));
    `;
    cursor.innerHTML = `
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Arrow shape -->
        <path d="M4 2L4 18L9 13L15 22L18 20L12 12L20 11L4 2Z"
              fill="rgba(170,255,0,0.9)"
              stroke="rgba(170,255,0,1)"
              stroke-width="0.5"
              stroke-linejoin="round"/>
        <!-- Inner highlight edge -->
        <path d="M5.5 5L5.5 16L9.5 12L14 19.5L15.5 18.5L11 11.5L17.5 11L5.5 5Z"
              fill="rgba(255,255,255,0.35)"/>
      </svg>
    `;
    document.body.appendChild(cursor);
    GameCursor._el = cursor;

    // ── Create trail dots ──
    const trailCount = 4;
    for (let i = 0; i < trailCount; i++) {
      const dot = document.createElement('div');
      const size = Math.max(2, 5 - i);
      const alpha = 0.35 - i * 0.08;
      dot.style.cssText = `
        position:fixed;top:0;left:0;
        width:${size}px;height:${size}px;
        margin:-${size / 2}px 0 0 -${size / 2}px;
        background:rgba(170,255,0,${alpha});
        border-radius:50%;
        pointer-events:none;
        z-index:9998;
        opacity:0;
        transition:opacity 0.2s ease;
        will-change:transform;
        filter: drop-shadow(0 0 2px rgba(170,255,0,0.4));
      `;
      document.body.appendChild(dot);
      GameCursor._trailEls.push(dot);
    }

    // ── Track mouse ──
    document.addEventListener('mousemove', (e) => {
      GameCursor._tX = e.clientX;
      GameCursor._tY = e.clientY;
    });

    // ── Hover: scale up on clickable ──
    document.addEventListener('mouseover', (e) => {
      if (!GameCursor._visible) return;
      const clickable = e.target && e.target.closest(
        'button, a, [role="button"], .song-card, .difficulty-item, .zzz-btn, input, select, [data-clickable], canvas'
      );
      if (clickable && GameCursor._el) {
        GameCursor._el.style.transform = `translate(${GameCursor._rX}px, ${GameCursor._rY}px) scale(1.2)`;
      }
    });
    document.addEventListener('mouseout', (e) => {
      if (!GameCursor._visible) return;
      const clickable = e.target && e.target.closest(
        'button, a, [role="button"], .song-card, .difficulty-item, .zzz-btn, input, select, [data-clickable], canvas'
      );
      if (clickable && GameCursor._el) {
        GameCursor._el.style.transform = `translate(${GameCursor._rX}px, ${GameCursor._rY}px) scale(1)`;
      }
    });

    // ── Click squeeze ──
    document.addEventListener('mousedown', () => {
      if (GameCursor._el && GameCursor._visible) {
        GameCursor._el.style.transform = `translate(${GameCursor._rX}px, ${GameCursor._rY}px) scale(0.85)`;
      }
    });
    document.addEventListener('mouseup', () => {
      if (GameCursor._el && GameCursor._visible) {
        GameCursor._el.style.transform = `translate(${GameCursor._rX}px, ${GameCursor._rY}px) scale(1)`;
      }
    });

    // ── Trail init ──
    for (let i = 0; i < trailCount; i++) {
      GameCursor._trail.push({ x: -100, y: -100 });
    }

    // ── Start animation ──
    GameCursor._lastTime = performance.now();
    GameCursor._animate(GameCursor._lastTime);

    setTimeout(() => GameCursor.show(), 100);
  }

  static _animate(now) {
    const delta = Math.min(0.05, (now - GameCursor._lastTime) / 1000);
    GameCursor._lastTime = now;

    const smoothing = 0.4;
    GameCursor._rX += (GameCursor._tX - GameCursor._rX) * smoothing;
    GameCursor._rY += (GameCursor._tY - GameCursor._rY) * smoothing;

    // Update arrow position (offset by ~3px to align arrow tip with pointer)
    if (GameCursor._el) {
      const tx = GameCursor._rX - 3;
      const ty = GameCursor._rY - 3;
      GameCursor._el.style.transform = `translate(${tx}px, ${ty}px)`;
    }

    // Trail
    const trail = GameCursor._trail;
    trail[0].x += (GameCursor._rX - trail[0].x) * 0.25;
    trail[0].y += (GameCursor._rY - trail[0].y) * 0.25;
    for (let i = 1; i < trail.length; i++) {
      trail[i].x += (trail[i - 1].x - trail[i].x) * 0.18;
      trail[i].y += (trail[i - 1].y - trail[i].y) * 0.18;
    }
    for (let i = 0; i < GameCursor._trailEls.length; i++) {
      GameCursor._trailEls[i].style.transform = `translate(${trail[i].x}px, ${trail[i].y}px)`;
    }

    GameCursor._animId = requestAnimationFrame(GameCursor._animate);
  }

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
}
