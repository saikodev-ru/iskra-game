import EventBus from '../core/EventBus.js';

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;900&family=Share+Tech+Mono&display=swap');

:root {
  --zzz-bg:        #0D1117;
  --zzz-panel:     #131A24;
  --zzz-panel-2:   #1A2233;
  --zzz-border:    rgba(0,229,255,0.12);
  --zzz-cyan:      #00E5FF;
  --zzz-yellow:    #F5C518;
  --zzz-red:       #FF3D3D;
  --zzz-purple:    #A855F7;
  --zzz-text:      #E8EDF5;
  --zzz-muted:     #6B7A8D;
  --zzz-font:      'Barlow Condensed', sans-serif;
  --zzz-mono:      'Share Tech Mono', monospace;
}

/* SCANLINES */
body.zzz-active::after {
  content: '';
  position: fixed; inset: 0; z-index: 9999;
  background: repeating-linear-gradient(
    0deg, transparent, transparent 2px,
    rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 4px
  );
  pointer-events: none;
}

/* VIGNETTE */
body.zzz-active::before {
  content: '';
  position: fixed; inset: 0; z-index: 9998;
  background: radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.5) 100%);
  pointer-events: none;
}

/* CRT PANEL */
.zzz-panel {
  background: var(--zzz-panel);
  border: 1px solid var(--zzz-border);
  border-radius: 8px;
  position: relative;
}
.zzz-panel::before, .zzz-panel::after {
  content: '';
  position: absolute;
  width: 12px; height: 12px;
  border-color: var(--zzz-cyan);
  border-style: solid;
  pointer-events: none;
}
.zzz-panel::before { top:-1px; left:-1px; border-width: 2px 0 0 2px; }
.zzz-panel::after  { bottom:-1px; right:-1px; border-width: 0 2px 2px 0; }

/* TV MONITOR TILE (song select cards) */
.tv-tile {
  background: var(--zzz-panel-2);
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.06);
  box-shadow: inset 0 0 20px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.4);
  overflow: hidden;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.tv-tile:hover, .tv-tile.active {
  border-color: var(--zzz-cyan);
  box-shadow: inset 0 0 20px rgba(0,0,0,0.5), 0 0 12px rgba(0,229,255,0.25);
}

/* BUTTONS */
.zzz-btn {
  font-family: var(--zzz-font);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 10px 28px;
  background: transparent;
  border: 1px solid var(--zzz-cyan);
  color: var(--zzz-cyan);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, box-shadow 0.15s;
  clip-path: polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%);
  font-size: 16px;
  outline: none;
}
.zzz-btn:hover {
  background: var(--zzz-cyan);
  color: #000;
  box-shadow: 0 0 16px rgba(0,229,255,0.4);
}
.zzz-btn:active { animation: glitch-flash 0.08s; }
.zzz-btn:focus-visible {
  box-shadow: 0 0 0 2px var(--zzz-cyan);
}

.zzz-btn--primary {
  background: var(--zzz-cyan);
  color: #000;
}
.zzz-btn--primary:hover {
  background: #33EBFF;
  box-shadow: 0 0 24px rgba(0,229,255,0.6);
}

.zzz-btn--danger {
  border-color: var(--zzz-red);
  color: var(--zzz-red);
}
.zzz-btn--danger:hover {
  background: var(--zzz-red);
  color: #fff;
  box-shadow: 0 0 16px rgba(255,61,61,0.4);
}

/* GLITCH */
@keyframes glitch-flash {
  0%   { transform: translateX(0); filter: none; }
  25%  { transform: translateX(-3px); filter: hue-rotate(90deg); }
  50%  { transform: translateX(3px); filter: hue-rotate(-90deg) brightness(1.5); }
  75%  { transform: translateX(-1px); filter: none; }
  100% { transform: translateX(0); }
}

/* JUDGEMENT */
.judgement-text {
  font-family: var(--zzz-font);
  font-weight: 900;
  font-size: 36px;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  text-shadow: 0 0 20px currentColor;
  pointer-events: none;
  user-select: none;
  position: absolute;
  left: 50%;
  top: 65%;
  transform: translate(-50%, -50%);
  white-space: nowrap;
}
.judgement--perfect { color: #FFD700; }
.judgement--great   { color: #00E5FF; }
.judgement--good    { color: #A0FF80; }
.judgement--bad     { color: #FF8C00; }
.judgement--miss    { color: #FF3D3D; }

@keyframes judge-in  { from { transform: translate(-50%, -50%) scale(1.5) translateY(-10px); opacity:0; } to { transform: translate(-50%, -50%) scale(1) translateY(0); opacity:1; } }
@keyframes judge-out { from { opacity:1; transform: translate(-50%, -50%) translateY(0); } to { opacity:0; transform: translate(-50%, -50%) translateY(-20px); } }

.judgement--in  { animation: judge-in  0.08s ease-out forwards; }
.judgement--out { animation: judge-out 0.20s ease-in  forwards; }

/* COMBO BREAK */
@keyframes combo-fly { to { transform: translateY(-40px); opacity:0; } }
@keyframes vignette-red {
  0%,100% { box-shadow: inset 0 0 0px rgba(255,61,61,0); }
  50%      { box-shadow: inset 0 0 80px rgba(255,61,61,0.4); }
}
body.combo-break { animation: vignette-red 0.3s ease; }

/* COMBO BREAK X */
.combo-break-x {
  position: absolute;
  left: 50%; top: 65%;
  transform: translate(-50%, -50%);
  font-family: var(--zzz-font);
  font-weight: 900;
  font-size: 48px;
  color: var(--zzz-red);
  text-shadow: 0 0 30px var(--zzz-red);
  pointer-events: none;
  animation: combo-break-x-anim 0.4s ease-out forwards;
}
@keyframes combo-break-x-anim {
  0%   { transform: translate(-50%, -50%) scale(2); opacity: 0; }
  20%  { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
}

/* MILESTONE BANNER */
@keyframes banner-in  { from { transform: translateX(100%); opacity:0; } to { transform: translateX(0); opacity:1; } }
@keyframes banner-out { from { opacity:1; } to { transform: translateX(100%); opacity:0; } }
.milestone-banner {
  position: fixed; right: 24px; top: 40%;
  font-family: var(--zzz-font); font-weight: 900;
  font-size: 28px; text-transform: uppercase;
  padding: 8px 20px;
  background: var(--zzz-panel);
  border-left: 3px solid var(--zzz-cyan);
  color: var(--zzz-cyan);
  z-index: 100;
  animation: banner-in 0.3s ease-out forwards;
  pointer-events: none;
}
.milestone-banner.out {
  animation: banner-out 0.3s ease-in forwards;
}

/* HEALTH BAR */
.health-bar {
  height: 6px;
  background: rgba(255,255,255,0.1);
  border-radius: 3px;
  overflow: hidden;
}
.health-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--zzz-cyan), #80f0ff);
  box-shadow: 0 0 8px var(--zzz-cyan);
  transition: width 0.1s linear;
  border-radius: 3px;
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
  0%   { transform: scale(1.5); opacity: 0; }
  50%  { transform: scale(1.0); opacity: 1; }
  100% { transform: scale(0.9); opacity: 0.8; }
}
#countdown-overlay > div {
  animation: countdown-pulse 0.8s ease-out forwards;
}

/* DELTA DISPLAY */
.delta-display {
  font-family: var(--zzz-mono);
  font-size: 14px;
  color: var(--zzz-muted);
  position: absolute;
  left: 50%;
  top: calc(65% + 28px);
  transform: translateX(-50%);
  pointer-events: none;
  white-space: nowrap;
}

/* SCREEN TRANSITIONS */
@keyframes screen-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes screen-fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}
.screen-enter { animation: screen-fade-in 0.2s ease-out forwards; }
.screen-exit { animation: screen-fade-out 0.2s ease-in forwards; }

/* SCROLLBAR STYLING */
.zzz-scroll::-webkit-scrollbar {
  width: 6px;
}
.zzz-scroll::-webkit-scrollbar-track {
  background: var(--zzz-panel);
}
.zzz-scroll::-webkit-scrollbar-thumb {
  background: rgba(0,229,255,0.3);
  border-radius: 3px;
}
.zzz-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(0,229,255,0.5);
}

/* SONG LIST ITEM */
.song-item {
  padding: 10px 16px;
  border-left: 3px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  gap: 12px;
}
.song-item:hover {
  background: rgba(0,229,255,0.05);
  border-left-color: rgba(0,229,255,0.3);
}
.song-item.active {
  background: rgba(0,229,255,0.1);
  border-left-color: var(--zzz-cyan);
}

/* DIFFICULTY STARS */
.diff-star {
  display: inline-block;
  width: 10px; height: 10px;
  border-radius: 50%;
  margin-right: 2px;
}
.diff-star.filled { background: var(--zzz-yellow); box-shadow: 0 0 4px var(--zzz-yellow); }
.diff-star.empty { background: rgba(255,255,255,0.15); }

/* TITLE TEXT */
.zzz-title {
  font-family: var(--zzz-font);
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.2em;
}

/* LABEL TEXT */
.zzz-label {
  font-family: var(--zzz-font);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: 12px;
  color: var(--zzz-muted);
}

/* VALUE TEXT */
.zzz-value {
  font-family: var(--zzz-mono);
  color: var(--zzz-text);
}

/* SEARCH INPUT */
.zzz-search {
  background: var(--zzz-panel);
  border: 1px solid var(--zzz-border);
  border-radius: 4px;
  padding: 8px 12px;
  font-family: var(--zzz-font);
  font-size: 14px;
  color: var(--zzz-text);
  outline: none;
  transition: border-color 0.15s;
}
.zzz-search:focus {
  border-color: var(--zzz-cyan);
}
.zzz-search::placeholder {
  color: var(--zzz-muted);
}
`;

let _crtSounds = null; // Will be set by init()

const ZZZTheme = {
  init(crtSounds) {
    _crtSounds = crtSounds;

    // Inject CSS
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    // Add body class
    document.body.classList.add('zzz-active');
    document.body.style.margin = '0';
    document.body.style.overflow = 'hidden';
    document.body.style.background = '#0D1117';
    document.body.style.fontFamily = "var(--zzz-font)";

    // CRT click delegation for all interactive elements
    document.addEventListener('click', (e) => {
      if (!_crtSounds) return;
      const target = e.target.closest('button, .zzz-btn, .song-item, [data-crt-click]');
      if (target) {
        _crtSounds.crtClick();
      }
    });
  },

  // Utility: create a CRT switch animation on an element
  crtTransition(element, callback) {
    if (_crtSounds) _crtSounds.crtSwitch();
    element.classList.add('crt-switching');
    element.addEventListener('animationend', () => {
      element.classList.remove('crt-switching');
      if (callback) callback();
    }, { once: true });
  }
};

export default ZZZTheme;
