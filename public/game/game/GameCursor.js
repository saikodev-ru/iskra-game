/**
 * GameCursor — RHYMIX minimal neon ring cursor
 *
 * A thin luminous ring that breathes in sync with the song's beat (half-BPM),
 * leaving a smooth fading comet trail. Dual-contrast design ensures visibility
 * on any background surface.
 *
 * API:
 *   static init()       — Create cursor, inject styles, start animation
 *   static show()       — Make cursor visible
 *   static hide()       — Hide cursor
 *   static setBPM(bpm)  — Update BPM for pulsing (0 → gentle default)
 */

export class GameCursor {
  static _ACCENT     = '#AAFF00';
  static _AR         = '170,255,0';
  static _SIZE       = 32;
  static _TRAIL_N    = 12;
  static _DEF_BPM    = 72;

  static _el         = null;
  static _ring       = null;
  static _glow       = null;
  static _fill       = null;
  static _dot        = null;
  static _trailEls   = [];
  static _trail      = [];
  static _visible    = true;
  static _bpm        = 0;
  static _hovered    = false;
  static _pressed    = false;
  static _pressT     = 0;
  static _rX = -300;  static _rY = -300;
  static _tX = -300;  static _tY = -300;
  static _animId     = null;
  static _t0         = 0;

  /* ───────────── init ───────────── */
  static init() {
    if (GameCursor._el) return;
    GameCursor._t0 = performance.now();

    // hide system cursor
    const css = document.createElement('style');
    css.id = 'game-cursor-css';
    css.textContent = `*,*::before,*::after{cursor:none!important}`;
    document.head.appendChild(css);

    // container
    const el = document.createElement('div');
    el.id = 'game-cursor';
    Object.assign(el.style, {
      position: 'fixed', top: 0, left: 0,
      width: GameCursor._SIZE + 'px', height: GameCursor._SIZE + 'px',
      pointerEvents: 'none', zIndex: 99999,
      opacity: 0, transition: 'opacity .2s',
      willChange: 'transform',
    });

    // svg
    const ns = 'http://www.w3.org/2000/svg';
    const s = GameCursor._SIZE;
    const c = s / 2;
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${s} ${s}`);
    svg.setAttribute('width', s);
    svg.setAttribute('height', s);
    svg.style.cssText = 'display:block;width:100%;height:100%;overflow:visible;';

    // glow filter
    const defs = document.createElementNS(ns, 'defs');

    const f1 = document.createElementNS(ns, 'filter');
    f1.setAttribute('id', 'cg');
    f1.setAttribute('x', '-60%'); f1.setAttribute('y', '-60%');
    f1.setAttribute('width', '220%'); f1.setAttribute('height', '220%');
    f1.innerHTML = `<feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="a"/>
      <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="a"/><feMergeNode in="SourceGraphic"/></feMerge>`;
    defs.appendChild(f1);

    const f2 = document.createElementNS(ns, 'filter');
    f2.setAttribute('id', 'cgh');
    f2.setAttribute('x', '-80%'); f2.setAttribute('y', '-80%');
    f2.setAttribute('width', '260%'); f2.setAttribute('height', '260%');
    f2.innerHTML = `<feGaussianBlur in="SourceGraphic" stdDeviation="4" result="a"/>
      <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="a"/><feMergeNode in="SourceGraphic"/></feMerge>`;
    defs.appendChild(f2);
    svg.appendChild(defs);

    // 1 — dark drop-shadow ring (light-bg visibility)
    const shadow = document.createElementNS(ns, 'circle');
    Object.entries({ cx: c, cy: c, r: c - 1, fill: 'none',
      stroke: 'rgba(0,0,0,.5)', 'stroke-width': 3.5 }).forEach(([k, v]) => shadow.setAttribute(k, v));
    svg.appendChild(shadow);

    // 2 — accent ring (main)
    const ring = document.createElementNS(ns, 'circle');
    Object.entries({ cx: c, cy: c, r: c - 2, fill: 'none',
      stroke: GameCursor._ACCENT, 'stroke-width': 1.8,
      filter: 'url(#cg)', opacity: .9 }).forEach(([k, v]) => ring.setAttribute(k, v));
    GameCursor._ring = ring;
    svg.appendChild(ring);

    // 3 — white inner ring (dark-bg readability)
    const inner = document.createElementNS(ns, 'circle');
    Object.entries({ cx: c, cy: c, r: c - 2, fill: 'none',
      stroke: 'rgba(255,255,255,.55)', 'stroke-width': .8 }).forEach(([k, v]) => inner.setAttribute(k, v));
    svg.appendChild(inner);

    // 4 — hover fill
    const fill = document.createElementNS(ns, 'circle');
    Object.entries({ cx: c, cy: c, r: c - 4, fill: 'rgba(170,255,0,0)' }).forEach(([k, v]) => fill.setAttribute(k, v));
    GameCursor._fill = fill;
    svg.appendChild(fill);

    // 5 — center dot
    const dot = document.createElementNS(ns, 'circle');
    Object.entries({ cx: c, cy: c, r: 1.6, fill: GameCursor._ACCENT,
      filter: 'url(#cg)', opacity: .85 }).forEach(([k, v]) => dot.setAttribute(k, v));
    GameCursor._dot = dot;
    svg.appendChild(dot);

    el.appendChild(svg);
    document.body.appendChild(el);
    GameCursor._el = el;

    // trail
    for (let i = 0; i < GameCursor._TRAIL_N; i++) {
      const d = document.createElement('div');
      const t = i / (GameCursor._TRAIL_N - 1);
      const sz = Math.max(2, 22 * (1 - t * .88));
      const a = .38 * (1 - t);
      const bl = 1.5 + t * 5;
      Object.assign(d.style, {
        position: 'fixed', top: 0, left: 0,
        width: sz + 'px', height: sz + 'px',
        marginTop: -sz / 2 + 'px', marginLeft: -sz / 2 + 'px',
        borderRadius: '50%', pointerEvents: 'none', zIndex: 99998,
        opacity: 0, transition: 'opacity .2s', willChange: 'transform',
        background: `radial-gradient(circle,rgba(${GameCursor._AR},${a}) 0%,rgba(${GameCursor._AR},${a * .3}) 55%,transparent 100%)`,
        boxShadow: `0 0 ${bl}px rgba(${GameCursor._AR},${a * .45})`,
      });
      document.body.appendChild(d);
      GameCursor._trailEls.push(d);
      GameCursor._trail.push({ x: -300, y: -300 });
    }

    // events
    document.addEventListener('mousemove', e => { GameCursor._tX = e.clientX; GameCursor._tY = e.clientY; });
    const clickable = 'button,a,[role="button"],.song-card,.diff-dropdown-item,.zzz-btn,input,select,[data-clickable],canvas,[onclick],summary,label,.ss-toolbar-btn,.ss-action-btn,.rc-history-card';
    document.addEventListener('mouseover', e => {
      if (!GameCursor._visible) return;
      GameCursor._hovered = !!(e.target && e.target.closest(clickable));
    });
    document.addEventListener('mouseout', e => {
      if (!GameCursor._visible) return;
      if (e.target && e.target.closest(clickable)) GameCursor._hovered = false;
    });
    document.addEventListener('mousedown', () => { GameCursor._pressed = true; GameCursor._pressT = performance.now(); });
    document.addEventListener('mouseup', () => { GameCursor._pressed = false; });

    GameCursor._animate(performance.now());
    setTimeout(() => GameCursor.show(), 100);
  }

  /* ───────────── animation ───────────── */
  static _animate(now) {
    const dt = (now - GameCursor._t0) / 1000;
    const bpm = GameCursor._bpm > 0 ? GameCursor._bpm : GameCursor._DEF_BPM;

    // smooth follow
    const lr = .32;
    GameCursor._rX += (GameCursor._tX - GameCursor._rX) * lr;
    GameCursor._rY += (GameCursor._tY - GameCursor._rY) * lr;

    // ── beat pulse (once per beat, smooth cosine wave) ──
    // bpm/2 so for 180 BPM song → 90 pulses/min → 1 pulse per beat
    const phase = (dt * bpm / 120) * Math.PI * 2;
    const pulse = (Math.cos(phase) + 1) * .5;  // 0→1→0 once per beat

    const scale = 1 + pulse * .12;              // 1.0 .. 1.12
    const glow  = .65 + pulse * .35;            // .65 .. 1.0

    // click snap
    const age = (now - GameCursor._pressT) / 1000;
    const snap = GameCursor._pressed
      ? .72
      : age < .12 ? .72 + .28 * Math.min(1, age / .12) : 1;

    // hover
    const hv = GameCursor._hovered;
    const hScale = hv ? 1.06 : 1;
    const fScale = scale * hScale * snap;

    const half = GameCursor._SIZE / 2;
    const tx = GameCursor._rX - half;
    const ty = GameCursor._rY - half;
    if (GameCursor._el) GameCursor._el.style.transform = `translate(${tx}px,${ty}px) scale(${fScale})`;

    // ring visuals
    if (GameCursor._ring) {
      GameCursor._ring.setAttribute('stroke-width', hv ? 2.6 : 1.8);
      GameCursor._ring.setAttribute('opacity', glow.toFixed(2));
      GameCursor._ring.setAttribute('filter', hv ? 'url(#cgh)' : 'url(#cg)');
    }
    if (GameCursor._fill) {
      GameCursor._fill.setAttribute('fill', hv
        ? `rgba(${GameCursor._AR},${(.08 + pulse * .05).toFixed(3)})` : 'rgba(170,255,0,0)');
    }
    if (GameCursor._dot) {
      GameCursor._dot.setAttribute('r', hv ? '2.2' : '1.6');
      GameCursor._dot.setAttribute('opacity', (.7 + pulse * .3).toFixed(2));
    }

    // trail
    const tr = GameCursor._trail;
    tr[0].x += (GameCursor._rX - tr[0].x) * .4;
    tr[0].y += (GameCursor._rY - tr[0].y) * .4;
    for (let i = 1; i < tr.length; i++) {
      const f = Math.max(.06, .25 - i * .007);
      tr[i].x += (tr[i - 1].x - tr[i].x) * f;
      tr[i].y += (tr[i - 1].y - tr[i].y) * f;
    }
    for (let i = 0; i < GameCursor._trailEls.length; i++) {
      const el = GameCursor._trailEls[i];
      const t = i / (GameCursor._TRAIL_N - 1);
      const tp = 1 + pulse * .08 * (1 - t * .6);
      const sz = Math.max(2, 22 * (1 - t * .88)) * tp;
      el.style.transform = `translate(${tr[i].x}px,${tr[i].y}px)`;
      el.style.width = sz + 'px';
      el.style.height = sz + 'px';
      el.style.marginTop = -sz / 2 + 'px';
      el.style.marginLeft = -sz / 2 + 'px';
    }

    GameCursor._animId = requestAnimationFrame(GameCursor._animate);
  }

  /* ───────────── API ───────────── */
  static show() {
    GameCursor._visible = true;
    if (GameCursor._el) GameCursor._el.style.opacity = '1';
    for (const e of GameCursor._trailEls) e.style.opacity = '1';
  }
  static hide() {
    GameCursor._visible = false;
    if (GameCursor._el) GameCursor._el.style.opacity = '0';
    for (const e of GameCursor._trailEls) e.style.opacity = '0';
  }
  static setBPM(bpm) { GameCursor._bpm = bpm || 0; }
}
