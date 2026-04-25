/**
 * GameCursor — custom animated cursor in RHYMIX style
 *
 * Renders a neon lime crosshair cursor with glow trail.
 * Hides automatically during gameplay, shows on menus.
 *
 * Usage:
 *   GameCursor.init();   // call once at startup
 *   GameCursor.hide();   // hide during gameplay
 *   GameCursor.show();   // show on menus
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

  static init() {
    if (GameCursor._el) return;

    // Create cursor container
    const cursor = document.createElement('div');
    cursor.id = 'game-cursor';
    cursor.style.cssText = `
      position: fixed; top: 0; left: 0;
      width: 28px; height: 28px;
      pointer-events: none;
      z-index: 9999;
      transform: translate(-50%, -50%);
      opacity: 0;
      transition: opacity 0.25s ease;
      will-change: transform, opacity;
    `;
    cursor.innerHTML = `
      <!-- Outer ring -->
      <div style="
        position:absolute;inset:0;
        border: 2px solid rgba(170,255,0,0.6);
        border-radius: 50%;
        box-shadow: 0 0 8px rgba(170,255,0,0.3), inset 0 0 4px rgba(170,255,0,0.1);
        transition: transform 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease;
      " class="cursor-ring"></div>
      <!-- Center dot -->
      <div style="
        position:absolute;
        top:50%;left:50%;
        width: 4px; height: 4px;
        margin: -2px 0 0 -2px;
        background: #AAFF00;
        border-radius: 50%;
        box-shadow: 0 0 6px rgba(170,255,0,0.8), 0 0 12px rgba(170,255,0,0.4);
      "></div>
      <!-- Crosshair lines -->
      <div style="
        position:absolute;
        top:50%;left:50%;
        width: 2px; height: 10px;
        margin: -5px 0 0 -1px;
        background: linear-gradient(to bottom, rgba(170,255,0,0), rgba(170,255,0,0.7), rgba(170,255,0,0));
      "></div>
      <div style="
        position:absolute;
        top:50%;left:50%;
        width: 10px; height: 2px;
        margin: -1px 0 0 -5px;
        background: linear-gradient(to right, rgba(170,255,0,0), rgba(170,255,0,0.7), rgba(170,255,0,0));
      "></div>
    `;
    document.body.appendChild(cursor);
    GameCursor._el = cursor;

    // Create trail dots
    const trailCount = 5;
    for (let i = 0; i < trailCount; i++) {
      const dot = document.createElement('div');
      const size = Math.max(2, 6 - i);
      const alpha = 0.4 - i * 0.07;
      dot.style.cssText = `
        position:fixed;top:0;left:0;
        width:${size}px;height:${size}px;
        margin:-${size / 2}px 0 0 -${size / 2}px;
        background:rgba(170,255,0,${alpha});
        border-radius:50%;
        pointer-events:none;
        z-index:9998;
        opacity:0;
        transition:opacity 0.25s ease;
        will-change:transform;
      `;
      document.body.appendChild(dot);
      GameCursor._trailEls.push(dot);
    }

    // Track mouse position
    document.addEventListener('mousemove', (e) => {
      GameCursor._tX = e.clientX;
      GameCursor._tY = e.clientY;
    });

    // Hide system cursor globally
    document.documentElement.style.cursor = 'none';
    document.body.style.cursor = 'none';

    // Hover effect: scale up ring on clickable elements
    document.addEventListener('mouseover', (e) => {
      const target = e.target;
      if (!target) return;
      const clickable = target.closest('button, a, [role="button"], .song-card, .difficulty-item, .zzz-btn, input, select, [data-clickable]');
      const ring = cursor.querySelector('.cursor-ring');
      if (clickable && ring) {
        ring.style.transform = 'scale(1.3)';
        ring.style.borderColor = 'rgba(170,255,0,0.9)';
        ring.style.boxShadow = '0 0 14px rgba(170,255,0,0.5), inset 0 0 6px rgba(170,255,0,0.2)';
      }
    });
    document.addEventListener('mouseout', (e) => {
      const target = e.target;
      if (!target) return;
      const clickable = target.closest('button, a, [role="button"], .song-card, .difficulty-item, .zzz-btn, input, select, [data-clickable]');
      if (clickable) {
        const ring = cursor.querySelector('.cursor-ring');
        if (ring) {
          ring.style.transform = '';
          ring.style.borderColor = '';
          ring.style.boxShadow = '';
        }
      }
    });

    // Active (press) effect
    document.addEventListener('mousedown', () => {
      if (GameCursor._el && GameCursor._visible) {
        GameCursor._el.style.transform = 'translate(-50%, -50%) scale(0.8)';
      }
    });
    document.addEventListener('mouseup', () => {
      if (GameCursor._el && GameCursor._visible) {
        GameCursor._el.style.transform = 'translate(-50%, -50%) scale(1)';
      }
    });

    // Initialize trail
    for (let i = 0; i < trailCount; i++) {
      GameCursor._trail.push({ x: -100, y: -100 });
    }

    // Start animation loop
    GameCursor._lastTime = performance.now();
    GameCursor._animate(GameCursor._lastTime);

    // Show cursor after a short delay
    setTimeout(() => GameCursor.show(), 100);
  }

  static _animate(now) {
    const delta = Math.min(0.05, (now - GameCursor._lastTime) / 1000);
    GameCursor._lastTime = now;

    // Smooth follow (lerp with slight lag)
    const smoothing = 0.35;
    GameCursor._rX += (GameCursor._tX - GameCursor._rX) * smoothing;
    GameCursor._rY += (GameCursor._tY - GameCursor._rY) * smoothing;

    // Update main cursor position
    if (GameCursor._el) {
      GameCursor._el.style.transform = `translate(${GameCursor._rX - 14}px, ${GameCursor._rY - 14}px)`;
    }

    // Update trail (each dot follows the previous with more lag)
    const trail = GameCursor._trail;
    trail[0].x += (GameCursor._rX - trail[0].x) * 0.3;
    trail[0].y += (GameCursor._rY - trail[0].y) * 0.3;
    for (let i = 1; i < trail.length; i++) {
      trail[i].x += (trail[i - 1].x - trail[i].x) * 0.2;
      trail[i].y += (trail[i - 1].y - trail[i].y) * 0.2;
    }
    for (let i = 0; i < GameCursor._trailEls.length; i++) {
      const el = GameCursor._trailEls[i];
      const p = trail[i];
      el.style.transform = `translate(${p.x}px, ${p.y}px)`;
    }

    GameCursor._animId = requestAnimationFrame(GameCursor._animate);
  }

  static show() {
    GameCursor._visible = true;
    if (GameCursor._el) GameCursor._el.style.opacity = '1';
    for (const el of GameCursor._trailEls) el.style.opacity = '1';
    document.documentElement.style.cursor = 'none';
  }

  static hide() {
    GameCursor._visible = false;
    if (GameCursor._el) GameCursor._el.style.opacity = '0';
    for (const el of GameCursor._trailEls) el.style.opacity = '0';
  }
}
