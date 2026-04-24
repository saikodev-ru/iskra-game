import EventBus from '../core/EventBus.js';

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700;900&display=swap');

:root {
  --zzz-bg:        #111111;
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
  --zzz-muted:     #888888;
  --zzz-font:      'Google Sans', 'Segoe UI', sans-serif;
  --zzz-mono:      'JetBrains Mono', 'Fira Code', monospace;
}

/* SCANLINES - subtle */
body.zzz-active::after {
  content: '';
  position: fixed; inset: 0; z-index: 9999;
  background: repeating-linear-gradient(
    0deg, transparent, transparent 2px,
    rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px
  );
  pointer-events: none;
}

/* VIGNETTE */
body.zzz-active::before {
  content: '';
  position: fixed; inset: 0; z-index: 9998;
  background: radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.4) 100%);
  pointer-events: none;
}

/* PANEL - graphite with lime corner accents */
.zzz-panel {
  background: rgba(26,26,26,0.85);
  border: 2px solid var(--zzz-graphite);
  border-radius: 16px;
  position: relative;
  overflow: hidden;
  transition: border-color 0.2s, box-shadow 0.2s;
  backdrop-filter: blur(12px);
}
.zzz-panel:hover {
  border-color: var(--zzz-graphite-2);
}
.zzz-panel::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--zzz-lime), transparent);
  opacity: 0.4;
}

/* TV MONITOR TILE */
.tv-tile {
  background: var(--zzz-panel-2);
  border-radius: 16px;
  border: 2px solid var(--zzz-graphite);
  box-shadow: 0 4px 24px rgba(0,0,0,0.5);
  overflow: hidden;
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
}
.tv-tile:hover, .tv-tile.active {
  border-color: var(--zzz-lime);
  box-shadow: 0 0 20px rgba(170,255,0,0.15), 0 4px 24px rgba(0,0,0,0.5);
  transform: scale(1.01);
}

/* PILL BUTTONS */
.zzz-btn {
  font-family: var(--zzz-font);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 12px 32px;
  background: rgba(26,26,26,0.85);
  border: 3px solid var(--zzz-graphite);
  border-radius: 9999px;
  color: var(--zzz-text);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none;
  font-size: 14px;
  position: relative;
  overflow: hidden;
  backdrop-filter: blur(8px);
}
.zzz-btn::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--zzz-lime);
  opacity: 0;
  transition: opacity 0.2s;
}
.zzz-btn:hover {
  border-color: var(--zzz-lime);
  color: var(--zzz-bg);
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(170,255,0,0.2);
}
.zzz-btn:hover::after {
  opacity: 1;
}
.zzz-btn:hover > * {
  position: relative;
  z-index: 1;
}
.zzz-btn:active {
  transform: translateY(0) scale(0.97);
  box-shadow: 0 2px 8px rgba(170,255,0,0.15);
}
.zzz-btn:active::after {
  opacity: 0.8;
}

/* Primary - lime filled */
.zzz-btn--primary {
  background: var(--zzz-lime);
  color: var(--zzz-bg);
  border-color: var(--zzz-lime);
  font-weight: 900;
}
.zzz-btn--primary:hover {
  background: #BBFF33;
  border-color: #BBFF33;
  box-shadow: 0 4px 20px rgba(170,255,0,0.4);
}
.zzz-btn--primary::after {
  display: none;
}

/* Danger */
.zzz-btn--danger {
  border-color: var(--zzz-red);
  color: var(--zzz-red);
}
.zzz-btn--danger:hover {
  background: var(--zzz-red);
  border-color: var(--zzz-red);
  color: #fff;
  box-shadow: 0 4px 16px rgba(255,61,61,0.3);
}
.zzz-btn--danger::after {
  display: none;
}

/* Small button */
.zzz-btn--sm {
  padding: 8px 20px;
  font-size: 12px;
}

/* GLITCH CLICK */
@keyframes click-pulse {
  0%   { transform: scale(1); }
  50%  { transform: scale(0.95); }
  100% { transform: scale(1); }
}
.zzz-btn:active {
  animation: click-pulse 0.1s ease;
}

/* JUDGEMENT — right side of playfield */
.judgement-text {
  font-family: var(--zzz-font);
  font-weight: 900;
  font-size: 36px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  text-shadow: 0 0 24px currentColor, 0 0 48px currentColor;
  pointer-events: none;
  user-select: none;
  position: absolute;
  right: 6%;
  top: 42%;
  transform: translateY(-50%);
  white-space: nowrap;
}
.judgement--perfect { color: #AAFF00; }
.judgement--great   { color: #00E5FF; }
.judgement--good    { color: #F5C518; }
.judgement--bad     { color: #FF8C00; }
.judgement--miss    { color: #FF3D3D; }

@keyframes judge-in  { 
  from { transform: translateY(-50%) scale(1.8) translateX(20px); opacity:0; } 
  to   { transform: translateY(-50%) scale(1) translateX(0); opacity:1; } 
}
@keyframes judge-out { 
  from { opacity:1; transform: translateY(-50%) translateY(0); } 
  to   { opacity:0; transform: translateY(-50%) translateY(-20px); } 
}

.judgement--in  { animation: judge-in  0.1s ease-out forwards; }
.judgement--out { animation: judge-out 0.25s ease-in  forwards; }

/* COMBO BREAK */
@keyframes combo-fly { to { transform: translateY(-50px); opacity:0; } }
@keyframes vignette-red {
  0%,100% { box-shadow: inset 0 0 0px rgba(255,61,61,0); }
  50%      { box-shadow: inset 0 0 100px rgba(255,61,61,0.5); }
}
body.combo-break { animation: vignette-red 0.3s ease; }

.combo-break-x {
  position: absolute;
  right: 6%; top: 42%;
  transform: translateY(-50%);
  font-family: var(--zzz-font);
  font-weight: 900;
  font-size: 56px;
  color: var(--zzz-red);
  text-shadow: 0 0 40px var(--zzz-red);
  pointer-events: none;
  animation: combo-break-x-anim 0.5s ease-out forwards;
}
@keyframes combo-break-x-anim {
  0%   { transform: translateY(-50%) scale(2.5); opacity: 0; }
  15%  { transform: translateY(-50%) scale(1.3); opacity: 1; }
  100% { transform: translateY(-50%) scale(1); opacity: 0; }
}

/* MILESTONE BANNER */
@keyframes banner-in  { from { transform: translateX(100%); opacity:0; } to { transform: translateX(0); opacity:1; } }
@keyframes banner-out { from { opacity:1; } to { transform: translateX(100%); opacity:0; } }
.milestone-banner {
  position: fixed; right: 24px; top: 40%;
  font-family: var(--zzz-font); font-weight: 900;
  font-size: 28px; text-transform: uppercase;
  padding: 10px 24px;
  background: var(--zzz-panel);
  border: 2px solid var(--zzz-lime);
  border-radius: 9999px;
  color: var(--zzz-lime);
  z-index: 100;
  animation: banner-in 0.3s ease-out forwards;
  pointer-events: none;
  box-shadow: 0 0 20px rgba(170,255,0,0.3);
}
.milestone-banner.out {
  animation: banner-out 0.3s ease-in forwards;
}

/* HEALTH BAR */
.health-bar {
  height: 8px;
  background: rgba(255,255,255,0.08);
  border-radius: 9999px;
  overflow: hidden;
}
.health-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--zzz-lime), #CCFF66);
  box-shadow: 0 0 12px rgba(170,255,0,0.5);
  transition: width 0.1s linear;
  border-radius: 9999px;
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
#countdown-overlay > div {
  animation: countdown-pulse 0.8s ease-out forwards;
}

/* DELTA DISPLAY */
.delta-display {
  font-family: var(--zzz-mono);
  font-size: 14px;
  color: var(--zzz-muted);
  position: absolute;
  right: 6%;
  top: calc(42% + 36px);
  pointer-events: none;
  white-space: nowrap;
}

/* SCREEN TRANSITIONS */
@keyframes screen-fade-in  { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
@keyframes screen-fade-out { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.98); } }
.screen-enter { animation: screen-fade-in 0.25s ease-out forwards; }
.screen-exit  { animation: screen-fade-out 0.2s ease-in forwards; }

/* SCROLLBAR */
.zzz-scroll::-webkit-scrollbar { width: 6px; }
.zzz-scroll::-webkit-scrollbar-track { background: var(--zzz-panel); border-radius: 3px; }
.zzz-scroll::-webkit-scrollbar-thumb { background: var(--zzz-lime-dim); border-radius: 3px; }
.zzz-scroll::-webkit-scrollbar-thumb:hover { background: rgba(170,255,0,0.5); }

/* SONG LIST ITEM (legacy, kept for compat) */
.song-item {
  padding: 14px 20px;
  border-left: 4px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  gap: 16px;
  border-radius: 0 12px 12px 0;
}
.song-item:hover {
  background: rgba(170,255,0,0.05);
  border-left-color: var(--zzz-lime-dim);
  transform: translateX(4px);
}
.song-item.active {
  background: rgba(170,255,0,0.08);
  border-left-color: var(--zzz-lime);
  box-shadow: inset 0 0 20px rgba(170,255,0,0.05);
}

/* SONG CARD — osu!lazer style beatmap cards */
.song-card {
  display: flex;
  align-items: stretch;
  gap: 0;
  border-radius: 18px;
  overflow: hidden;
  background: rgba(26,26,26,0.75);
  border: none;
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  min-height: 68px;
  backdrop-filter: blur(8px);
}
.song-card:hover {
  background: rgba(42,42,42,0.85);
  box-shadow: 0 4px 20px rgba(0,0,0,0.3), 0 0 12px rgba(170,255,0,0.05);
  transform: translateX(4px);
}
.song-card.active {
  background: rgba(170,255,0,0.08);
  box-shadow: 0 0 20px rgba(170,255,0,0.10), 0 4px 16px rgba(0,0,0,0.4);
  transform: translateX(6px) scale(1.01);
}
.song-card-thumb {
  flex: 0 0 72px;
  background-size: cover;
  background-position: center;
  position: relative;
  border-radius: 18px 0 0 18px;
}
.song-card-thumb::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 50%, rgba(26,26,26,0.95) 100%);
  border-radius: 18px 0 0 18px;
}
.song-card.active .song-card-thumb::after {
  background: linear-gradient(90deg, transparent 50%, rgba(170,255,0,0.06) 100%);
}
.song-card-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 10px 16px;
  gap: 2px;
  overflow: hidden;
}
.song-card-title {
  font-family: var(--zzz-font);
  font-weight: 900;
  font-size: 15px;
  color: var(--zzz-text);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.song-card-artist {
  font-family: var(--zzz-font);
  font-size: 12px;
  color: var(--zzz-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.song-card-diff-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}
.song-card-stars {
  font-family: var(--zzz-font);
  font-weight: 900;
  font-size: 13px;
}
.song-card-diff-name {
  font-family: var(--zzz-font);
  font-weight: 700;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.song-card-diff-count {
  font-family: var(--zzz-font);
  font-size: 11px;
  color: var(--zzz-lime);
  background: var(--zzz-graphite);
  border-radius: 9999px;
  padding: 2px 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}
.song-card-diff-count:hover {
  background: var(--zzz-lime-dim);
  color: var(--zzz-bg);
}

/* SONG CARD DELETE BUTTON */
.song-card-delete {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: rgba(255,61,61,0.12);
  color: var(--zzz-red);
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.15s ease;
  z-index: 2;
  padding: 0;
  line-height: 1;
}
.song-card:hover .song-card-delete {
  opacity: 0.5;
}
.song-card-delete:hover {
  opacity: 1 !important;
  background: rgba(255,61,61,0.3);
  transform: scale(1.15);
}

/* SONG CARD WRAPPER — container for card + dropdown */
.song-card-wrapper {
  display: flex;
  flex-direction: column;
}

/* DIFFICULTY DROPDOWN — osu!lazer style expand below card */
.diff-dropdown {
  animation: dropdown-in 0.15s ease-out forwards;
}
@keyframes dropdown-in {
  from { opacity: 0; max-height: 0; transform: translateY(-8px); }
  to   { opacity: 1; max-height: 600px; transform: translateY(0); }
}
.diff-dropdown-item {
  transition: all 0.12s ease;
}
.diff-dropdown-item:hover {
  transform: translateX(4px);
}

/* IMPORT BUTTON — full width at bottom of list */
.zzz-import-btn {
  border-radius: 14px !important;
  font-weight: 900 !important;
  letter-spacing: 0.08em !important;
}

/* SONG LIST CONTAINER — responsive */
.song-list-container {
  transition: width 0.2s ease;
}
@media (max-width: 768px) {
  .song-list-container {
    width: 100% !important;
    max-width: 100% !important;
  }
  .song-card {
    min-height: 60px;
  }
  .song-card-thumb {
    flex: 0 0 56px;
  }
  .song-card-title {
    font-size: 13px;
  }
  .song-card-artist {
    font-size: 11px;
  }
  .song-card-info {
    padding: 8px 12px;
  }
}

/* DIFFICULTY STARS (legacy) */
.diff-star {
  display: inline-block;
  width: 10px; height: 10px;
  border-radius: 50%;
  margin-right: 3px;
}
.diff-star.filled { background: var(--zzz-lime); box-shadow: 0 0 6px var(--zzz-lime); }
.diff-star.empty  { background: var(--zzz-graphite); }

/* TEXT STYLES */
.zzz-title {
  font-family: var(--zzz-font);
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.15em;
}
.zzz-label {
  font-family: var(--zzz-font);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 11px;
  color: var(--zzz-muted);
}
.zzz-value {
  font-family: var(--zzz-font);
  font-weight: 700;
  color: var(--zzz-text);
}

/* SEARCH INPUT */
.zzz-search {
  background: rgba(26,26,26,0.85);
  border: 2px solid var(--zzz-graphite);
  border-radius: 9999px;
  padding: 10px 20px;
  font-family: var(--zzz-font);
  font-weight: 500;
  font-size: 14px;
  color: var(--zzz-text);
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  backdrop-filter: blur(8px);
}
.zzz-search:focus {
  border-color: var(--zzz-lime);
  box-shadow: 0 0 12px rgba(170,255,0,0.15);
}
.zzz-search::placeholder { color: var(--zzz-muted); }

/* BREATHING ANIMATION for idle elements */
@keyframes breathe {
  0%, 100% { box-shadow: 0 0 0 rgba(170,255,0,0); }
  50%      { box-shadow: 0 0 16px rgba(170,255,0,0.08); }
}
.zzz-breathe {
  animation: breathe 3s ease-in-out infinite;
}

/* SLIDER */
input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  height: 6px;
  background: var(--zzz-graphite);
  border-radius: 9999px;
  outline: none;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--zzz-lime);
  cursor: pointer;
  box-shadow: 0 0 8px rgba(170,255,0,0.4);
  transition: transform 0.15s, box-shadow 0.15s;
}
input[type="range"]::-webkit-slider-thumb:hover {
  transform: scale(1.2);
  box-shadow: 0 0 16px rgba(170,255,0,0.6);
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
    document.body.style.background = '#111111';
    document.body.style.fontFamily = "var(--zzz-font)";
    
    // CRT click delegation
    document.addEventListener('click', (e) => {
      if (!_crtSounds) return;
      const target = e.target.closest('button, .zzz-btn, .song-item, .song-card, .diff-tab, .diff-dropdown-item, [data-crt-click]');
      if (target) _crtSounds.crtClick();
    });
  },
  
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
