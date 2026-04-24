import EventBus from '../core/EventBus.js';

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700;900&display=swap');

:root {
  --zzz-bg:        #000000;
  --zzz-panel:     #1A1A1A;
  --zzz-panel-2:   #222222;
  --zzz-border:    rgba(170,255,0,0.15);
  --zzz-lime:      #AAFF00;
  --zzz-lime-dim:  rgba(170,255,0,0.3);
  --zzz-yellow:    #F5C518;
  --zzz-red:       #FF3D3D;
  --zzz-purple:    #A855F7;
  --zzz-graphite:  #2D2D2D;
  --zzz-graphite-2:#3A3A3A;
  --zzz-text:      #F0F0F0;
  --zzz-muted:     #CCCCCC;
  --zzz-font:      'Google Sans', 'Segoe UI', sans-serif;
  --zzz-mono:      'JetBrains Mono', 'Fira Code', monospace;
}

/* SCANLINES */
body.zzz-active::after {
  content: '';
  position: fixed; inset: 0; z-index: 9999;
  background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px);
  pointer-events: none;
}

/* VIGNETTE — pure black */
body.zzz-active::before {
  content: '';
  position: fixed; inset: 0; z-index: 9998;
  background: radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.5) 100%);
  pointer-events: none;
}

/* ── CRT OVERLAY FOR SONG SELECT ────────────────────── */
.crt-overlay {
  position: fixed; inset: 0; z-index: 1;
  pointer-events: none;
  background:
    repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,0,0,0.06) 1px, rgba(0,0,0,0.06) 2px),
    repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.02) 3px, rgba(0,0,0,0.02) 6px);
  mix-blend-mode: multiply;
}
.crt-overlay::before {
  content: '';
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.55) 100%);
}
.crt-overlay::after {
  content: '';
  position: absolute; inset: 0;
  animation: crt-flicker 0.15s infinite;
  opacity: 0.015;
  background: white;
}
@keyframes crt-flicker {
  0%, 100% { opacity: 0.01; }
  50% { opacity: 0.025; }
}

/* ── GLITCH TRANSITION ────────────────────── */
@keyframes glitch-bg {
  0%   { transform: translate(0); filter: none; }
  7%   { transform: translate(-3px, 1px); filter: hue-rotate(90deg) saturate(2); }
  10%  { transform: translate(2px, -1px); }
  14%  { transform: translate(-1px, 2px); filter: hue-rotate(-60deg); }
  17%  { transform: translate(3px, 0px); filter: none; }
  20%  { transform: translate(0); }
  40%  { transform: translate(0); }
  42%  { transform: translate(-2px, 1px) scaleX(1.02); filter: hue-rotate(30deg); }
  44%  { transform: translate(1px, -1px) scaleX(0.99); }
  46%  { transform: translate(0) scaleX(1); filter: none; }
  100% { transform: translate(0); filter: none; }
}
.glitch-transition {
  animation: glitch-bg 0.4s ease-out forwards;
}

/* RGB split overlay during glitch */
.glitch-rgb-overlay {
  position: fixed; inset: 0; z-index: 2;
  pointer-events: none;
  animation: glitch-rgb 0.35s ease-out forwards;
}
@keyframes glitch-rgb {
  0%   { opacity: 0; }
  5%   { opacity: 1; background: linear-gradient(90deg, rgba(255,0,0,0.03), transparent 30%, rgba(0,255,0,0.03) 50%, transparent 70%, rgba(0,0,255,0.03)); }
  15%  { opacity: 0.8; background: linear-gradient(90deg, transparent, rgba(255,0,0,0.05) 20%, transparent 40%, rgba(0,0,255,0.05) 60%, transparent); }
  30%  { opacity: 0.3; }
  50%  { opacity: 0; }
  100% { opacity: 0; }
}

/* PANEL */
.zzz-panel {
  background: rgba(26,26,26,0.85);
  border: 2px solid var(--zzz-graphite);
  border-radius: 16px;
  position: relative; overflow: hidden;
  transition: border-color 0.2s, box-shadow 0.2s;
  backdrop-filter: blur(12px);
}
.zzz-panel:hover { border-color: var(--zzz-graphite-2); }
.zzz-panel::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, transparent, var(--zzz-lime), transparent); opacity: 0.4;
}

/* PILL BUTTONS */
.zzz-btn {
  font-family: var(--zzz-font); font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
  padding: 12px 32px; background: rgba(26,26,26,0.85); border: 3px solid var(--zzz-graphite);
  border-radius: 9999px; color: var(--zzz-text); cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); outline: none; font-size: 14px;
  position: relative; overflow: hidden; backdrop-filter: blur(8px);
}
.zzz-btn::after {
  content: ''; position: absolute; inset: 0; border-radius: inherit;
  background: var(--zzz-lime); opacity: 0; transition: opacity 0.2s;
}
.zzz-btn:hover {
  border-color: var(--zzz-lime); color: var(--zzz-bg); transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(170,255,0,0.2);
}
.zzz-btn:hover::after { opacity: 1; }
.zzz-btn:hover > * { position: relative; z-index: 1; }
.zzz-btn:active { transform: translateY(0) scale(0.97); box-shadow: 0 2px 8px rgba(170,255,0,0.15); }
.zzz-btn:active::after { opacity: 0.8; }

.zzz-btn--primary {
  background: var(--zzz-lime); color: var(--zzz-bg); border-color: var(--zzz-lime); font-weight: 900;
}
.zzz-btn--primary:hover { background: #BBFF33; border-color: #BBFF33; box-shadow: 0 4px 20px rgba(170,255,0,0.4); }
.zzz-btn--primary::after { display: none; }

.zzz-btn--danger { border-color: var(--zzz-red); color: var(--zzz-red); }
.zzz-btn--danger:hover { background: var(--zzz-red); border-color: var(--zzz-red); color: #fff; box-shadow: 0 4px 16px rgba(255,61,61,0.3); }
.zzz-btn--danger::after { display: none; }

.zzz-btn--sm { padding: 8px 20px; font-size: 12px; }

/* JUDGEMENT — bigger, bolder */
.judgement-text {
  font-family: var(--zzz-font);
  font-weight: 900;
  font-size: 38px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  text-shadow: 0 0 20px currentColor, 0 3px 0 #000, 0 6px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000;
  pointer-events: none; user-select: none;
  position: absolute;
  left: 50%; top: 45%;
  transform: translate(-50%, -50%);
  white-space: nowrap;
}
.judgement--perfect { color: #AAFF00; }
.judgement--great   { color: #00E5FF; }
.judgement--good    { color: #F5C518; }
.judgement--bad     { color: #FF8C00; }
.judgement--miss    { color: #FF3D3D; }

@keyframes judge-in  { 
  from { transform: translate(-50%, -50%) scale(1.5); opacity:0; } 
  to   { transform: translate(-50%, -50%) scale(1); opacity:1; } 
}
@keyframes judge-out { 
  from { opacity:1; transform: translate(-50%, -50%); } 
  to   { opacity:0; transform: translate(-50%, -50%) translateY(-16px); } 
}
.judgement--in  { animation: judge-in  0.08s ease-out forwards; }
.judgement--out { animation: judge-out 0.2s ease-in forwards; }

/* COMBO BREAK */
@keyframes combo-fly { to { transform: translateY(-50px); opacity:0; } }
@keyframes vignette-red {
  0%,100% { box-shadow: inset 0 0 0px rgba(255,61,61,0); }
  50%      { box-shadow: inset 0 0 100px rgba(255,61,61,0.5); }
}
body.combo-break { animation: vignette-red 0.3s ease; }

/* MILESTONE BANNER */
@keyframes banner-in  { from { transform: translateX(100%); opacity:0; } to { transform: translateX(0); opacity:1; } }
@keyframes banner-out { from { opacity:1; } to { transform: translateX(100%); opacity:0; } }
.milestone-banner {
  position: fixed; right: 24px; top: 40%;
  font-family: var(--zzz-font); font-weight: 900;
  font-size: 28px; text-transform: uppercase;
  padding: 10px 24px; background: var(--zzz-panel);
  border: 2px solid var(--zzz-lime); border-radius: 9999px;
  color: var(--zzz-lime); z-index: 100;
  animation: banner-in 0.3s ease-out forwards; pointer-events: none;
  box-shadow: 0 0 20px rgba(170,255,0,0.3);
}
.milestone-banner.out { animation: banner-out 0.3s ease-in forwards; }

/* HEALTH BAR */
.health-bar { height: 6px; background: rgba(255,255,255,0.08); border-radius: 9999px; overflow: hidden; }
.health-bar-fill {
  height: 100%; background: linear-gradient(90deg, var(--zzz-lime), #CCFF66);
  box-shadow: 0 0 12px rgba(170,255,0,0.5); transition: width 0.1s linear; border-radius: 9999px;
}

/* CRT TRANSITION */
@keyframes crt-switch {
  0%   { opacity:1; transform: scaleY(1); filter: none; }
  30%  { opacity:1; transform: scaleY(0.02); filter: brightness(3) saturate(0); }
  60%  { opacity:0; transform: scaleY(0.02); }
  100% { opacity:1; transform: scaleY(1); filter: none; }
}
.crt-switching { animation: crt-switch 0.25s ease-in-out; }

/* COUNTDOWN */
@keyframes countdown-pulse {
  0%   { transform: scale(2); opacity: 0; }
  40%  { transform: scale(1); opacity: 1; }
  100% { transform: scale(0.95); opacity: 0.9; }
}
#countdown-overlay > div { animation: countdown-pulse 0.8s ease-out forwards; }

/* DELTA DISPLAY */
.delta-display {
  font-family: var(--zzz-mono); font-size: 10px; color: var(--zzz-muted);
  position: absolute; left: 50%; top: calc(45% + 14px);
  transform: translateX(-50%); pointer-events: none; white-space: nowrap;
}

/* SCREEN TRANSITIONS */
@keyframes screen-fade-in  { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
@keyframes screen-fade-out { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.98); } }
.screen-enter { animation: screen-fade-in 0.25s ease-out forwards; }
.screen-exit  { animation: screen-fade-out 0.2s ease-in forwards; }

/* SCROLLBAR */
.zzz-scroll::-webkit-scrollbar { width: 4px; }
.zzz-scroll::-webkit-scrollbar-track { background: transparent; }
.zzz-scroll::-webkit-scrollbar-thumb { background: var(--zzz-lime-dim); border-radius: 2px; }
.zzz-scroll::-webkit-scrollbar-thumb:hover { background: rgba(170,255,0,0.5); }

/* ── SONG CARD — compact, rounded ─────────────────────────────────── */

.song-card {
  display: flex; align-items: center; gap: 0;
  border-radius: 24px; overflow: hidden;
  background: rgba(0,0,0,0.65); border: none; cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative; height: 64px;
  backdrop-filter: blur(12px);
  max-width: 100%; box-sizing: border-box;
}
.song-card:hover {
  background: rgba(20,20,20,0.9);
  box-shadow: 0 2px 16px rgba(0,0,0,0.3);
}
.song-card.active {
  background: rgba(10,10,10,0.9);
  box-shadow: 0 0 16px rgba(0,0,0,0.3), 0 0 8px rgba(170,255,0,0.08);
}

/* Active card left accent bar */
.song-card.active::before {
  content: ''; position: absolute; left: 0; top: 8px; bottom: 8px; width: 3px;
  background: var(--zzz-lime); border-radius: 0 2px 2px 0;
  box-shadow: 0 0 8px rgba(170,255,0,0.4);
}

.song-card-thumb {
  flex: 0 0 110px; height: 100%; background-size: cover; background-position: center;
  position: relative; border-radius: 24px 0 0 24px;
  -webkit-mask-image: linear-gradient(90deg, black 25%, transparent 100%);
  mask-image: linear-gradient(90deg, black 25%, transparent 100%);
}
.song-card-thumb::after {
  display: none;
}

.song-card-info {
  flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 2px;
  padding: 6px 12px; overflow: hidden; height: 100%;
}
.song-card-title-row {
  font-family: var(--zzz-font); font-weight: 900; font-size: 13px; color: var(--zzz-text);
  text-transform: uppercase; letter-spacing: 0.04em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  transition: color 0.2s; flex: 1; min-width: 0;
  display: flex; align-items: center; gap: 8px;
}
.song-card.active .song-card-title-row { color: #ffffff; }

.song-card-artist {
  font-family: var(--zzz-font); font-weight: 500; font-size: 11px; color: var(--zzz-muted);
  letter-spacing: 0.02em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  min-width: 0;
}

.song-card-diff-count {
  font-family: var(--zzz-font); font-size: 11px; font-weight: 700; color: var(--zzz-lime);
  background: rgba(170,255,0,0.12); border-radius: 9999px; padding: 2px 8px;
  cursor: pointer; transition: all 0.15s ease; user-select: none; flex-shrink: 0;
}
.song-card-diff-count:hover { background: var(--zzz-lime-dim); color: var(--zzz-bg); }

/* DELETE BUTTON */
.song-card-delete {
  position: absolute; top: 50%; right: 8px; transform: translateY(-50%);
  width: 20px; height: 20px;
  border-radius: 50%; border: none; background: rgba(255,61,61,0.1);
  color: var(--zzz-red); font-size: 10px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: all 0.15s ease; z-index: 2; padding: 0; line-height: 1;
}
.song-card:hover .song-card-delete { opacity: 0.3; }
.song-card-delete:hover { opacity: 1 !important; background: rgba(255,61,61,0.25); transform: translateY(-50%) scale(1.1); }

/* ── SONG CARD WRAPPER — osu!lazer carousel animation ────────────── */

.song-card-wrapper {
  display: flex; flex-direction: column;
  opacity: 0; transform: translateY(12px);
  animation: card-appear 0.35s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
@keyframes card-appear {
  from { opacity: 0; transform: translateY(12px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
/* Stagger */
.song-card-wrapper:nth-child(1) { animation-delay: 0ms; }
.song-card-wrapper:nth-child(2) { animation-delay: 25ms; }
.song-card-wrapper:nth-child(3) { animation-delay: 50ms; }
.song-card-wrapper:nth-child(4) { animation-delay: 75ms; }
.song-card-wrapper:nth-child(5) { animation-delay: 100ms; }
.song-card-wrapper:nth-child(6) { animation-delay: 125ms; }
.song-card-wrapper:nth-child(7) { animation-delay: 150ms; }
.song-card-wrapper:nth-child(8) { animation-delay: 175ms; }
.song-card-wrapper:nth-child(n+9) { animation-delay: 200ms; }

/* DIFFICULTY DROPDOWN */
.diff-dropdown {
  display: flex; flex-direction: column; gap: 4px;
  padding: 4px 8px 6px;
  overflow: hidden;
  max-height: 500px; opacity: 1;
  transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              padding 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.diff-dropdown.collapsed {
  max-height: 0; opacity: 0; padding-top: 0; padding-bottom: 0;
}
.diff-dropdown-item {
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  border: 2px solid transparent;
}
.diff-dropdown-item:hover { background: rgba(30,30,30,0.8) !important; }
.diff-dropdown-item.active {
  border-color: var(--zzz-lime);
  box-shadow: 0 0 12px rgba(170,255,0,0.12), inset 0 0 20px rgba(170,255,0,0.03);
}

/* Star spectrum bar — 10 stars */
.star-spectrum {
  display: flex; gap: 1px; align-items: center;
}
.star-spectrum .star {
  font-size: 10px; line-height: 1; transition: all 0.2s;
}
.star-spectrum .star.filled {
  text-shadow: 0 0 4px currentColor;
}
.star-spectrum .star.empty {
  opacity: 0.2;
}

/* Local record badge in diff panel */
.diff-record {
  font-family: var(--zzz-font); font-weight: 700; font-size: 11px;
  padding: 2px 8px; border-radius: 8px;
  white-space: nowrap; flex-shrink: 0;
}
.diff-record--none {
  color: rgba(255,255,255,0.15); background: rgba(255,255,255,0.04);
}
.diff-record--has {
  color: var(--zzz-lime); background: rgba(170,255,0,0.1);
}

/* IMPORT BUTTON */
.zzz-import-btn { border-radius: 12px !important; font-weight: 900 !important; letter-spacing: 0.08em !important; }

/* SONG LIST COLUMN */
.song-list-column { overflow: hidden; }
.song-list-column * { max-width: 100%; box-sizing: border-box; }

/* Song list fade edges via CSS mask */
.song-list-fade {
  -webkit-mask-image: linear-gradient(to bottom, transparent 0px, black 36px, black calc(100% - 36px), transparent 100%);
  mask-image: linear-gradient(to bottom, transparent 0px, black 36px, black calc(100% - 36px), transparent 100%);
}

@media (max-width: 768px) {
  .song-list-column { width: 100% !important; max-width: 100% !important; }
  .song-card { height: 52px; border-radius: 20px; }
  .song-card-thumb { flex: 0 0 80px; border-radius: 20px 0 0 20px; }
  .song-card-title-row { font-size: 11px; }
  .song-card-artist { font-size: 10px; }
  .song-card-info { padding: 4px 8px; }
}

/* TEXT STYLES */
.zzz-title { font-family: var(--zzz-font); font-weight: 900; text-transform: uppercase; letter-spacing: 0.15em; }
.zzz-label { font-family: var(--zzz-font); font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px; color: var(--zzz-muted); }
.zzz-value { font-family: var(--zzz-font); font-weight: 700; color: var(--zzz-text); }

/* SEARCH INPUT */
.zzz-search {
  background: rgba(26,26,26,0.85); border: 2px solid var(--zzz-graphite);
  border-radius: 9999px; padding: 10px 20px; font-family: var(--zzz-font);
  font-weight: 500; font-size: 14px; color: var(--zzz-text); outline: none;
  transition: border-color 0.2s, box-shadow 0.2s; backdrop-filter: blur(8px);
}
.zzz-search:focus { border-color: var(--zzz-lime); box-shadow: 0 0 12px rgba(170,255,0,0.15); }
.zzz-search::placeholder { color: var(--zzz-muted); }

/* BREATHING */
@keyframes breathe {
  0%, 100% { box-shadow: 0 0 0 rgba(170,255,0,0); }
  50%      { box-shadow: 0 0 16px rgba(170,255,0,0.08); }
}
.zzz-breathe { animation: breathe 3s ease-in-out infinite; }

/* SLIDER */
input[type="range"] {
  -webkit-appearance: none; appearance: none;
  height: 6px; background: var(--zzz-graphite); border-radius: 9999px; outline: none;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none; width: 20px; height: 20px;
  border-radius: 50%; background: var(--zzz-lime); cursor: pointer;
  box-shadow: 0 0 8px rgba(170,255,0,0.4); transition: transform 0.15s, box-shadow 0.15s;
}
input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.2); box-shadow: 0 0 16px rgba(170,255,0,0.6); }

/* PARALLAX layer */
.parallax-layer {
  transition: transform 0.15s ease-out;
  will-change: transform;
}

/* Settings slide-in */
@keyframes settings-slide-in {
  from { transform: translateX(-100%); }
  to   { transform: translateX(0); }
}

/* Pause overlay */
@keyframes pause-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes pause-panel-in {
  from { transform: translateY(20px) scale(0.95); opacity: 0; }
  to   { transform: translateY(0) scale(1); opacity: 1; }
}
`;

let _crtSounds = null;

const ZZZTheme = {
  init(crtSounds) {
    _crtSounds = crtSounds;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    document.body.classList.add('zzz-active');
    document.body.style.margin = '0';
    document.body.style.overflow = 'hidden';
    document.body.style.background = '#000000';
    document.body.style.fontFamily = "var(--zzz-font)";

    // CRT click delegation
    document.addEventListener('click', (e) => {
      if (!_crtSounds) return;
      const target = e.target.closest('button, .zzz-btn, .song-card, .diff-dropdown-item, [data-crt-click]');
      if (target) _crtSounds.crtClick();
    });

    // Global parallax mouse tracking
    this._parallaxEls = [];
    document.addEventListener('mousemove', (e) => {
      const cx = (e.clientX / window.innerWidth - 0.5) * 2;  // -1 to 1
      const cy = (e.clientY / window.innerHeight - 0.5) * 2;
      for (const el of this._parallaxEls) {
        const intensity = el.dataset.parallax || 8;
        const x = cx * intensity;
        const y = cy * intensity;
        el.style.transform = `translate(${x}px, ${y}px)`;
      }
    });
  },

  /** Register an element for parallax effect */
  addParallax(el, intensity = 8) {
    el.classList.add('parallax-layer');
    el.dataset.parallax = intensity;
    this._parallaxEls.push(el);
  },

  removeParallax(el) {
    this._parallaxEls = this._parallaxEls.filter(e => e !== el);
  },

  crtTransition(element, callback) {
    if (_crtSounds) _crtSounds.crtSwitch();
    element.classList.add('crt-switching');
    element.addEventListener('animationend', () => {
      element.classList.remove('crt-switching');
      if (callback) callback();
    }, { once: true });
  },

  /** Create a CRT overlay element for the song select screen */
  createCrtOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'crt-overlay';
    overlay.id = 'crt-overlay';
    document.body.appendChild(overlay);
    return overlay;
  },

  /** Remove the CRT overlay */
  removeCrtOverlay() {
    const overlay = document.getElementById('crt-overlay');
    if (overlay) overlay.remove();
  },

  /** Trigger a glitch transition on the Three.js canvas */
  glitchTransition(canvas) {
    if (!canvas) return;
    // Remove previous glitch classes
    canvas.classList.remove('glitch-transition');
    // Force reflow
    void canvas.offsetWidth;
    canvas.classList.add('glitch-transition');

    // Add RGB overlay
    let rgbOverlay = document.getElementById('glitch-rgb-overlay');
    if (rgbOverlay) rgbOverlay.remove();
    rgbOverlay = document.createElement('div');
    rgbOverlay.className = 'glitch-rgb-overlay';
    rgbOverlay.id = 'glitch-rgb-overlay';
    document.body.appendChild(rgbOverlay);

    // Clean up after animation
    setTimeout(() => {
      canvas.classList.remove('glitch-transition');
      if (rgbOverlay.parentNode) rgbOverlay.remove();
    }, 450);
  }
};

export default ZZZTheme;
