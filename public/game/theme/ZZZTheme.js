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

/* VIGNETTE — subtle, behind UI */
body.zzz-active::before {
  content: '';
  position: fixed; inset: 0; z-index: 9998;
  background: radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.3) 100%);
  pointer-events: none;
}

/* ── CRT OVERLAY FOR SONG SELECT ────────────────────── */
.crt-overlay {
  position: fixed; inset: 0; z-index: 1;
  pointer-events: none;
  background:
    repeating-linear-gradient(0deg, transparent, transparent 4px, rgba(0,0,0,0.14) 4px, rgba(0,0,0,0.14) 6px),
    repeating-linear-gradient(0deg, transparent, transparent 10px, rgba(0,0,0,0.05) 10px, rgba(0,0,0,0.05) 14px);
  mix-blend-mode: multiply;
}
.crt-overlay::before {
  content: '';
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.35) 100%);
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

.judgement--perfect {
  color: transparent;
  -webkit-text-fill-color: transparent;
  background: var(--gg-grad, linear-gradient(180deg, #67E8F9, #FDA4AF));
  -webkit-background-clip: text;
  background-clip: text;
  text-shadow: none;
  filter: drop-shadow(0 0 8px rgba(103,232,249,0.6)) drop-shadow(0 2px 0 rgba(0,0,0,0.8)) drop-shadow(0 4px 0 rgba(0,0,0,0.4));
}
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

/* COMBO BREAK — red vignette overlay on game canvas */
@keyframes combo-fly { to { transform: translateY(-50px); opacity:0; } }
.combo-break-flash {
  position: fixed; z-index: 4;
  pointer-events: none;
  box-shadow: inset 0 0 120px rgba(255,61,61,0.5);
  animation: combo-break-fade 0.35s ease-out forwards;
}
@keyframes combo-break-fade {
  0%   { opacity: 1; }
  100% { opacity: 0; }
}

/* ── DEATH ANIMATION ──────────────────────────── */

/* Game canvas — splits apart with skew */
#game.dying {
  animation: death-canvas-break 2.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
@keyframes death-canvas-break {
  0%   { transform: none; filter: none; opacity: 1; }
  5%   { filter: brightness(2) saturate(0); }
  10%  { filter: brightness(1.2) saturate(0.3); }
  20%  { transform: skewX(1.5deg) translateX(6px); filter: none; }
  30%  { transform: skewX(-2deg) translateX(-8px); }
  40%  { transform: skewX(1deg) translateY(3px) scale(1.01); }
  50%  { transform: skewX(-1.5deg) skewY(0.5deg) translateX(-4px); filter: brightness(0.7) contrast(1.5); }
  65%  { transform: skewX(2deg) skewY(-0.8deg) translateX(6px) scale(0.98); filter: brightness(0.4) contrast(2) saturate(0.5); }
  80%  { transform: skewX(-1deg) skewY(0.5deg) translateX(3px) scale(0.96); filter: brightness(0.2) contrast(2.5) saturate(0.2); }
  100% { transform: skewX(0.5deg) translateX(1px) scale(0.95); filter: brightness(0) contrast(3) saturate(0); opacity: 0.3; }
}

/* Three.js background canvas — milder distortion */
#three.dying {
  animation: death-three-break 2.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}
@keyframes death-three-break {
  0%   { transform: none; filter: none; }
  20%  { transform: scale(1.01) translateX(3px); }
  40%  { transform: scale(1.02) translateX(-4px); filter: hue-rotate(30deg) brightness(0.8); }
  60%  { transform: scale(1.01) translateX(2px); filter: hue-rotate(60deg) brightness(0.5) saturate(0.5); }
  100% { transform: scale(1.03); filter: hue-rotate(90deg) brightness(0.1) saturate(0); }
}

/* Red scanline overlay */
.death-overlay {
  position: fixed; z-index: 4;
  pointer-events: none;
  animation: death-sequence 2.5s ease-in forwards;
}
@keyframes death-sequence {
  0%   { opacity: 0; }
  8%   { opacity: 1; }
  100% { opacity: 1; }
}
.death-overlay::before {
  content: '';
  position: absolute; inset: 0;
  background:
    repeating-linear-gradient(
      0deg,
      transparent,
      transparent 3px,
      rgba(255,50,50,0.2) 3px,
      rgba(255,50,50,0.2) 5px
    );
  animation: death-scanlines 0.12s steps(2) infinite;
}
@keyframes death-scanlines {
  0%   { transform: translateY(0); }
  50%  { transform: translateY(2px); }
  100% { transform: translateY(-1px); }
}
.death-overlay::after {
  content: '';
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at center, transparent 20%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.85) 100%);
  animation: death-vignette-grow 2.5s ease-in forwards;
}
@keyframes death-vignette-grow {
  0%   { opacity: 0; }
  15%  { opacity: 0.2; }
  50%  { opacity: 0.6; }
  100% { opacity: 1; }
}

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
  background: rgba(0,0,0,0.82); border: none; cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative; height: 64px;
  backdrop-filter: blur(12px);
  max-width: 100%; box-sizing: border-box;
}
.song-card:hover {
  background: rgba(20,20,20,0.95);
  box-shadow: 0 2px 16px rgba(0,0,0,0.3);
}
.song-card.active {
  background: rgba(10,10,10,0.95);
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
  display: flex; align-items: center;
}
.song-card-diff-count:hover { background: var(--zzz-lime-dim); color: var(--zzz-bg); }

/* Song card actions — right side, vertically centered */
.song-card-actions {
  display: flex; align-items: center; gap: 4px;
  padding: 0 8px; flex-shrink: 0; height: 100%;
}

/* Menu button — gray, round, horizontal ellipsis */
.song-card-menu-btn {
  width: 28px; height: 28px; border-radius: 50%; border: none;
  background: rgba(255,255,255,0.06); color: var(--zzz-muted);
  font-size: 16px; font-weight: 700; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s ease; padding: 0; line-height: 1;
  letter-spacing: 1px;
}
.song-card-menu-btn:hover {
  background: rgba(255,255,255,0.12); color: var(--zzz-text);
}

/* DELETE BUTTON — removed, now in context menu */

/* ── CONTEXT MENU ──────────────────────────────────── */
.song-context-menu {
  position: fixed; z-index: 50;
  background: rgba(20,20,20,0.95); border: 2px solid var(--zzz-graphite);
  border-radius: 16px; padding: 4px; min-width: 180px;
  backdrop-filter: blur(16px);
  animation: ctx-menu-in 0.15s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
@keyframes ctx-menu-in {
  from { opacity: 0; transform: scale(0.95) translateY(-4px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.song-context-item {
  display: block; width: 100%; padding: 10px 16px;
  font-family: var(--zzz-font); font-weight: 700; font-size: 12px;
  text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--zzz-muted); background: transparent; border: none;
  border-radius: 12px; cursor: pointer; text-align: left;
  transition: all 0.12s ease;
}
.song-context-item:hover {
  background: rgba(255,255,255,0.06); color: var(--zzz-text);
}
.song-context-item--danger { color: var(--zzz-red); }
.song-context-item--danger:hover { background: rgba(255,61,61,0.12); color: #ff6b6b; }

/* ── SONG CARD WRAPPER ──────────────────────────────── */

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
.diff-dropdown-item:hover { background: rgba(30,30,30,0.9) !important; }
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

/* Grade icon in diff panel — osu!mania style badge */
.diff-grade-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 6px; flex-shrink: 0;
  transform: rotate(-12deg);
  font-family: var(--zzz-font); font-weight: 900; font-size: 16px;
  color: transparent; -webkit-text-fill-color: transparent;
  background-clip: text; -webkit-background-clip: text;
  -webkit-text-stroke: 1.5px rgba(0,0,0,0.7);
  filter: drop-shadow(0 1px 3px rgba(0,0,0,0.5));
  line-height: 1;
}

/* IMPORT BUTTON */
.zzz-import-btn { border-radius: 12px !important; font-weight: 900 !important; letter-spacing: 0.08em !important; }

/* ── SONG INFO PANEL (top-left) ────────────────────────── */
.ss-info-panel {
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(20px);
  border-radius: 18px;
  border: 1px solid rgba(255,255,255,0.06);
  padding: 20px 22px 16px;
  position: relative;
  overflow: hidden;
}
.ss-info-panel-shine {
  position: absolute; top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(170,255,0,0.15), transparent);
  pointer-events: none;
}
.ss-info-panel::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(170,255,0,0.02) 0%, transparent 40%);
  pointer-events: none;
}

.ss-info-title {
  font-family: var(--zzz-font); font-weight: 900;
  color: var(--zzz-text); text-transform: uppercase;
  letter-spacing: 0.06em; line-height: 1.08;
  word-break: break-word;
  text-shadow: 0 2px 20px rgba(0,0,0,0.9);
  position: relative;
}
.ss-info-artist {
  font-family: var(--zzz-font); font-weight: 500;
  font-size: 14px; color: var(--zzz-muted);
  margin-top: 3px;
  text-shadow: 0 1px 10px rgba(0,0,0,0.9);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ss-info-mapper {
  display: flex; align-items: center; gap: 5px;
  margin-top: 6px;
  font-family: var(--zzz-font); font-size: 10px;
  color: rgba(255,255,255,0.35);
  letter-spacing: 0.04em;
}
.ss-info-mapper svg { opacity: 0.5; flex-shrink: 0; }
.ss-info-mapper span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.ss-info-stars-row {
  display: flex; align-items: center; gap: 8px;
  margin-top: 12px;
}
.ss-info-diff-label {
  font-family: var(--zzz-font); font-weight: 900;
  font-size: 12px; text-transform: uppercase;
  letter-spacing: 0.12em;
  text-shadow: 0 0 12px currentColor;
  flex-shrink: 0;
}

.ss-info-stats {
  display: flex; flex-wrap: wrap; gap: 6px;
  margin-top: 10px;
}
.ss-info-pill {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 10px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px;
  font-family: var(--zzz-mono); font-weight: 700;
  font-size: 11px; color: var(--zzz-text);
  white-space: nowrap; transition: all 0.15s ease;
}
.ss-info-pill svg { opacity: 0.35; flex-shrink: 0; }
.ss-info-pill span { opacity: 0.7; }
.ss-info-pill:hover {
  background: rgba(255,255,255,0.08);
  border-color: rgba(255,255,255,0.1);
}
.ss-info-pill:hover svg { opacity: 0.6; }
.ss-info-pill:hover span { opacity: 1; }

.ss-info-score-row {
  display: flex; align-items: center; gap: 10px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(255,255,255,0.05);
}
.ss-info-score-value {
  font-family: var(--zzz-font); font-weight: 900;
  font-size: 20px; color: var(--zzz-lime);
  text-shadow: 0 0 16px rgba(170,255,0,0.3);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
.ss-info-score-label {
  font-family: var(--zzz-font); font-weight: 700;
  font-size: 9px; color: var(--zzz-muted);
  letter-spacing: 0.15em; text-transform: uppercase;
  opacity: 0.5;
}
.ss-info-grade-badge {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
  transform: rotate(-12deg);
  font-family: var(--zzz-font); font-weight: 900; font-size: 18px;
  color: transparent; -webkit-text-fill-color: transparent;
  background-clip: text; -webkit-background-clip: text;
  -webkit-text-stroke: 1.5px rgba(0,0,0,0.7);
  filter: drop-shadow(0 1px 4px rgba(0,0,0,0.5));
  line-height: 1; margin-left: auto;
}

@media (max-width: 768px) {
  .ss-info-panel { padding: 14px 16px 12px; border-radius: 14px; }
  .ss-info-title { letter-spacing: 0.04em; }
  .ss-info-stats { gap: 4px; }
  .ss-info-pill { padding: 4px 7px; font-size: 10px; border-radius: 8px; }
  .ss-info-pill svg { width: 9px; height: 9px; }
  .ss-info-score-value { font-size: 16px; }
  .ss-info-mapper { font-size: 9px; }
}

/* ── SONG SELECT TOOLBAR & ACTION BAR ────────────────────────── */
.ss-toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(16px);
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.06);
  position: relative; overflow: hidden;
  flex-shrink: 0;
}
.ss-toolbar::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
}
.ss-toolbar-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  color: var(--zzz-muted);
  font-family: var(--zzz-font); font-weight: 700; font-size: 11px;
  text-transform: uppercase; letter-spacing: 0.06em;
  cursor: pointer; transition: all 0.15s ease;
  white-space: nowrap; outline: none;
}
.ss-toolbar-btn:hover {
  background: rgba(255,255,255,0.1);
  color: var(--zzz-text);
  border-color: rgba(255,255,255,0.14);
}
.ss-toolbar-btn:active {
  transform: scale(0.96);
}
.ss-search-wrap {
  display: flex; align-items: center; gap: 8px;
  flex: 1; min-width: 0;
  padding: 0 12px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  transition: border-color 0.2s;
}
.ss-search-wrap:focus-within {
  border-color: rgba(170,255,0,0.3);
  box-shadow: 0 0 8px rgba(170,255,0,0.08);
}
.ss-search-icon {
  flex-shrink: 0; opacity: 0.4;
}
.ss-search-wrap:focus-within .ss-search-icon { opacity: 0.7; }
.ss-search {
  flex: 1; min-width: 0;
  background: transparent; border: none; outline: none;
  font-family: var(--zzz-font); font-weight: 500; font-size: 12px;
  color: var(--zzz-text); letter-spacing: 0.03em;
}
.ss-search::placeholder { color: rgba(255,255,255,0.25); }
.ss-beatmap-count {
  font-family: var(--zzz-mono); font-weight: 700; font-size: 10px;
  color: var(--zzz-lime); opacity: 0.5;
  white-space: nowrap; flex-shrink: 0;
  padding: 4px 8px;
  background: rgba(170,255,0,0.08);
  border-radius: 8px;
}

.ss-action-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(16px);
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.06);
  position: relative; overflow: hidden;
  flex-shrink: 0;
}
.ss-action-bar::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
}
.ss-action-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  color: var(--zzz-muted);
  font-family: var(--zzz-font); font-weight: 700; font-size: 11px;
  text-transform: uppercase; letter-spacing: 0.06em;
  cursor: pointer; transition: all 0.15s ease;
  white-space: nowrap; outline: none;
}
.ss-action-btn:hover {
  background: rgba(255,255,255,0.1);
  color: var(--zzz-text);
  border-color: rgba(255,255,255,0.14);
}
.ss-action-btn:active {
  transform: scale(0.96);
}
.ss-action-btn--primary {
  background: rgba(170,255,0,0.1);
  border-color: rgba(170,255,0,0.2);
  color: var(--zzz-lime);
}
.ss-action-btn--primary:hover {
  background: rgba(170,255,0,0.18);
  border-color: rgba(170,255,0,0.35);
  box-shadow: 0 0 12px rgba(170,255,0,0.1);
}
.ss-action-btn--accent {
  background: rgba(168,85,247,0.1);
  border-color: rgba(168,85,247,0.2);
  color: var(--zzz-purple);
}
.ss-action-btn--accent:hover {
  background: rgba(168,85,247,0.18);
  border-color: rgba(168,85,247,0.35);
  box-shadow: 0 0 12px rgba(168,85,247,0.1);
}

@media (max-width: 768px) {
  .ss-toolbar { padding: 6px 8px; gap: 6px; }
  .ss-toolbar-btn { padding: 6px 10px; font-size: 10px; }
  .ss-search-wrap { padding: 0 8px; }
  .ss-search { font-size: 11px; }
  .ss-action-bar { padding: 6px 8px; gap: 6px; }
  .ss-action-btn { padding: 6px 10px; font-size: 10px; }
}

/* SONG LIST COLUMN */
.song-list-column { overflow: hidden; }
.song-list-column * { max-width: 100%; box-sizing: border-box; }

/* Song list fade — controlled dynamically via JS mask-image */

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

/* NUMBER INPUT — scroll speed */
.zzz-num-input {
  -webkit-appearance: none; appearance: none;
  width: 72px; padding: 8px 10px;
  background: var(--zzz-graphite); border: 2px solid rgba(255,255,255,0.08);
  border-radius: 10px; color: var(--zzz-text);
  font-family: var(--zzz-mono); font-weight: 700; font-size: 14px;
  text-align: center; outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  -moz-appearance: textfield;
}
.zzz-num-input::-webkit-inner-spin-button,
.zzz-num-input::-webkit-outer-spin-button {
  -webkit-appearance: none; margin: 0;
}
.zzz-num-input:focus {
  border-color: var(--zzz-lime);
  box-shadow: 0 0 12px rgba(170,255,0,0.15);
}
.scroll-speed-control {
  background: rgba(0,0,0,0.3); border-radius: 12px; padding: 12px 14px;
  border: 1px solid rgba(255,255,255,0.04);
}

/* ── RESULT SCREEN ────────────────────────────────── */
@keyframes result-fade-up {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes result-slide-right {
  from { opacity: 0; transform: translateX(-20px); }
  to   { opacity: 1; transform: translateX(0); }
}

.result-screen {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 100%; gap: 14px; padding: 16px 20px; overflow-y: auto;
}
.result-screen > * {
  opacity: 0; animation: result-fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
.result-screen > *:nth-child(1) { animation-delay: 0.05s; }
.result-screen > *:nth-child(2) { animation-delay: 0.15s; }
.result-screen > *:nth-child(3) { animation-delay: 0.25s; }
.result-screen > *:nth-child(4) { animation-delay: 0.32s; }
.result-screen > *:nth-child(5) { animation-delay: 0.4s; }
.result-screen > *:nth-child(6) { animation-delay: 0.48s; }

/* Death result — red tint, glitched entrance */
.result-screen--death > * {
  animation-name: result-death-enter;
}
@keyframes result-death-enter {
  0%   { opacity: 0; transform: translateY(16px) skewX(3deg); filter: blur(4px); }
  40%  { opacity: 0.6; transform: translateY(-4px) skewX(-1deg); filter: blur(1px); }
  70%  { opacity: 0.9; transform: translateY(2px) skewX(0.5deg); filter: blur(0); }
  100% { opacity: 1; transform: translateY(0); filter: blur(0); }
}
.rc-death-label {
  font-family: var(--zzz-font); font-weight: 900; font-size: 12px;
  color: #FF3D3D; letter-spacing: 0.3em; text-transform: uppercase;
  text-shadow: 0 0 12px rgba(255,61,61,0.6), 0 0 24px rgba(255,61,61,0.2);
  margin-bottom: 4px;
  animation: rc-death-pulse 1.5s ease-in-out infinite;
}
@keyframes rc-death-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
.result-score-panel--death {
  border-color: rgba(255,61,61,0.15);
}
.result-score-panel--death::before {
  background: linear-gradient(90deg, transparent, rgba(255,61,61,0.2), transparent);
}

/* ── SONG INFO ── */
.result-song-info {
  text-align: center;
}
.result-song-title {
  font-family: var(--zzz-font); font-weight: 900; font-size: 15px;
  color: var(--zzz-text); text-transform: uppercase; letter-spacing: 0.06em;
  text-shadow: 0 2px 8px rgba(0,0,0,0.8);
}
.result-song-artist {
  font-family: var(--zzz-font); font-weight: 500; font-size: 11px;
  color: rgba(255,255,255,0.35); letter-spacing: 0.04em; margin-top: 1px;
  text-shadow: 0 2px 8px rgba(0,0,0,0.8);
}
.result-song-diff {
  font-family: var(--zzz-font); font-weight: 600; font-size: 11px;
  color: var(--zzz-muted); letter-spacing: 0.08em; text-transform: uppercase;
  margin-top: 2px;
}

/* ── RANK CARDS (horizontal, X → D) ── */
.rc-rank-cards {
  display: flex; gap: 8px; justify-content: center; align-items: stretch;
}
.rc-rank-card {
  flex: 1; max-width: 100px; min-width: 52px;
  background: rgba(17, 17, 17, 0.5);
  border: 1px solid rgba(255,255,255,0.04);
  border-radius: 16px;
  padding: 14px 4px 12px;
  text-align: center;
  position: relative; overflow: hidden;
  backdrop-filter: blur(12px);
  opacity: 0;
  animation: rc-rank-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
  animation-delay: var(--rc-rank-delay, 0s);
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.3s ease;
}
.rc-rank-card:hover {
  transform: translateY(-3px);
}
@keyframes rc-rank-in {
  from { opacity: 0; transform: translateY(16px) scale(0.9); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
/* Active rank card — highlighted, scaled up, glowing */
.rc-rank-card--active {
  background: rgba(25, 25, 25, 0.85);
  border-color: var(--rc-rank-solid, #fff);
  box-shadow:
    0 0 20px var(--rc-rank-glow, rgba(255,255,255,0.2)),
    0 0 40px var(--rc-rank-glow, rgba(255,255,255,0.1)),
    inset 0 1px 0 rgba(255,255,255,0.08);
  transform: scale(1.08) translateY(-2px);
  z-index: 2;
}
.rc-rank-card--active::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: var(--rc-rank-bg, #fff);
  opacity: 0.8;
}
.rc-rank-card--active::after {
  content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  background: linear-gradient(180deg, var(--rc-rank-solid, #fff) 0%, transparent 40%);
  opacity: 0.06; pointer-events: none;
}
.rc-rank-card-letter {
  font-family: var(--zzz-font); font-weight: 900; font-size: 36px;
  line-height: 1; letter-spacing: 0.04em;
  filter: drop-shadow(0 0 6px var(--rc-rank-glow, rgba(255,255,255,0.3)));
}
.rc-rank-card--active .rc-rank-card-letter {
  font-size: 44px;
  filter: drop-shadow(0 0 12px var(--rc-rank-glow, rgba(255,255,255,0.5)));
}
/* Inactive rank card — muted */
.rc-rank-card:not(.rc-rank-card--active) {
  opacity: 0; /* overridden by animation */
}
.rc-rank-card:not(.rc-rank-card--active) .rc-rank-card-letter {
  opacity: 0.25;
  filter: grayscale(0.6) brightness(0.6);
  font-size: 32px;
}

/* ── SCORE PANELS ── */
.result-main-stats {
  display: flex; gap: 12px; width: 100%; max-width: 480px; justify-content: center;
}
.result-score-panel {
  flex: 1;
  background: rgba(17, 17, 17, 0.7); border: 1px solid rgba(255,255,255,0.06);
  border-radius: 20px; padding: 16px 24px; text-align: center;
  backdrop-filter: blur(16px); position: relative; overflow: hidden;
}
.result-score-panel::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
}
.result-score-label {
  font-family: var(--zzz-font); font-weight: 600; font-size: 9px;
  color: var(--zzz-muted); letter-spacing: 0.2em; text-transform: uppercase;
  margin-bottom: 4px;
}
.result-score-value {
  font-family: var(--zzz-font); font-weight: 900; font-size: 36px;
  color: #ffffff; font-variant-numeric: tabular-nums; line-height: 1.1;
  text-shadow: 0 0 30px rgba(255,255,255,0.12), 0 2px 12px rgba(0,0,0,0.9);
}

/* ── SECONDARY STATS (pills) ── */
.result-secondary-stats {
  display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;
}
.result-stat-pill {
  background: rgba(17, 17, 17, 0.5);
  border: 1px solid rgba(255,255,255,0.04);
  border-radius: 9999px; padding: 8px 20px;
  text-align: center; backdrop-filter: blur(8px);
}
.result-stat-pill-label {
  font-family: var(--zzz-font); font-weight: 700; font-size: 8px;
  color: var(--zzz-muted); letter-spacing: 0.12em; text-transform: uppercase;
  margin-bottom: 2px;
}
.result-stat-pill-value {
  font-family: var(--zzz-font); font-weight: 900; font-size: 18px;
  font-variant-numeric: tabular-nums; line-height: 1; color: var(--zzz-text);
}

/* ── JUDGMENT CARDS (horizontal layout, best → worst) ── */
.rc-judge-cards {
  display: flex; gap: 6px; width: 100%; max-width: 560px;
  justify-content: center; flex-wrap: wrap;
}
.rc-judge-card {
  flex: 1; min-width: 60px; max-width: 100px;
  background: rgba(17, 17, 17, 0.6);
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 14px;
  padding: 10px 6px 8px;
  text-align: center;
  position: relative; overflow: hidden;
  backdrop-filter: blur(12px);
  opacity: 0;
  animation: rc-card-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
  animation-delay: var(--rc-jc-delay, 0s);
}
@keyframes rc-card-in {
  from { opacity: 0; transform: translateY(12px) scale(0.95); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.rc-judge-card::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: var(--rc-jc-color, #fff);
  opacity: 0.5;
}
.rc-judge-card::after {
  content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  background: linear-gradient(180deg, var(--rc-jc-color, #fff) 0%, transparent 30%);
  opacity: 0.03; pointer-events: none;
}
.rc-judge-card-label {
  font-family: var(--zzz-font); font-weight: 700; font-size: 7px;
  color: var(--zzz-muted); letter-spacing: 0.1em; text-transform: uppercase;
  margin-bottom: 3px;
}
.rc-judge-card-value {
  font-family: var(--zzz-font); font-weight: 900; font-size: 20px;
  color: var(--rc-jc-color, #fff); line-height: 1;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 0 10px var(--rc-jc-color, #fff);
}
.rc-judge-card-pct {
  font-family: var(--zzz-mono); font-weight: 600; font-size: 8px;
  color: rgba(255,255,255,0.3); margin-top: 1px;
}
.rc-judge-card-bar-track {
  height: 3px; border-radius: 2px; overflow: hidden;
  background: rgba(255,255,255,0.04);
  margin-top: 6px;
}
.rc-judge-card-bar-fill {
  height: 100%; border-radius: 2px; width: 0%;
  background: var(--rc-jc-color, #fff);
  opacity: 0.7;
  transition: width 0.8s cubic-bezier(0.22, 1, 0.36, 1);
  box-shadow: 0 0 6px var(--rc-jc-color, #fff);
}

/* ── BUTTONS ── */
.result-buttons {
  display: flex; gap: 12px; margin-top: 4px;
}
.result-btn {
  font-family: var(--zzz-font); font-weight: 800; text-transform: uppercase;
  letter-spacing: 0.06em; padding: 12px 32px; border-radius: 9999px;
  cursor: pointer; font-size: 13px; transition: all 0.2s;
  border: 2px solid var(--zzz-graphite); background: rgba(17,17,17,0.8);
  color: var(--zzz-text); backdrop-filter: blur(8px);
}
.result-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.3);
}
.result-btn--retry {
  border-color: var(--zzz-lime); color: var(--zzz-lime);
}
.result-btn--retry:hover {
  background: var(--zzz-lime); color: var(--zzz-bg);
  box-shadow: 0 4px 20px rgba(170,255,0,0.3);
}
.result-btn--menu {
  background: var(--zzz-lime); color: var(--zzz-bg);
  border-color: var(--zzz-lime); font-weight: 900;
}
.result-btn--menu:hover {
  background: #BBFF33; border-color: #BBFF33;
  box-shadow: 0 4px 24px rgba(170,255,0,0.4);
}

/* ── RESPONSIVE ── */
@media (max-width: 768px) {
  .result-score-value { font-size: 28px; }
  .result-score-panel { padding: 12px 16px; border-radius: 16px; }
  .rc-rank-cards { gap: 5px; }
  .rc-rank-card { min-width: 40px; max-width: 72px; padding: 10px 2px 8px; border-radius: 12px; }
  .rc-rank-card-letter { font-size: 28px; }
  .rc-rank-card--active .rc-rank-card-letter { font-size: 34px; }
  .rc-judge-cards { gap: 4px; max-width: 100%; }
  .rc-judge-card { min-width: 48px; max-width: 72px; padding: 8px 4px 6px; border-radius: 10px; }
  .rc-judge-card-value { font-size: 16px; }
  .rc-judge-card-label { font-size: 6px; }
  .result-stat-pill { padding: 6px 14px; }
  .result-stat-pill-value { font-size: 15px; }
  .result-buttons { gap: 8px; }
  .result-btn { padding: 10px 20px; font-size: 12px; }
}

/* ── GRADE GRADIENT (two-element approach) ──── */
.grade-gradient {
  position: relative;
  color: transparent;
  -webkit-text-fill-color: transparent;
  background: var(--gg-grad, linear-gradient(180deg, #67E8F9, #FDA4AF));
  -webkit-background-clip: text;
  background-clip: text;
  text-shadow: none;
  filter: drop-shadow(0 0 8px rgba(103,232,249,0.6)) drop-shadow(0 2px 0 rgba(0,0,0,0.8)) drop-shadow(0 4px 0 rgba(0,0,0,0.4));
}
.grade-gradient > .gg-fill {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: visible;
  color: transparent;
  -webkit-text-fill-color: transparent;
  background: var(--gg-grad, linear-gradient(180deg, #67E8F9, #FDA4AF));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-stroke: var(--gg-stroke, 2px rgba(0,0,0,0.6));
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  white-space: inherit;
  line-height: inherit;
}
.grade-gradient--sm > .gg-fill {
  text-shadow: none;
  -webkit-text-stroke: var(--gg-stroke, 1px rgba(0,0,0,0.5));
}

/* PARALLAX layer */
.parallax-layer {
  transition: transform 0.15s ease-out;
  will-change: transform;
}

/* ── MAIN MENU ────────────────────────────── */

/* Grain noise animation */
@keyframes mm-grain {
  0%, 100% { transform: translate(0, 0); }
  25% { transform: translate(-2px, 2px); }
  50% { transform: translate(2px, -1px); }
  75% { transform: translate(-1px, -2px); }
}

/* Fade-up entrance */
@keyframes mm-fade-up {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Title underline expansion */
@keyframes mm-line-expand {
  from { width: 0; }
  to   { width: min(280px, 60vw); }
}

/* Ticker scroll */
@keyframes mm-ticker-scroll {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}

/* Navigation buttons */
.mm-nav-btn {
  display: flex; align-items: center; gap: 14px;
  width: 100%; max-width: 300px;
  padding: 14px 28px;
  background: rgba(26, 26, 26, 0.7);
  border: 2px solid var(--zzz-graphite);
  border-radius: 16px;
  color: var(--zzz-text);
  font-family: var(--zzz-font); font-weight: 800; font-size: 15px;
  letter-spacing: 0.08em; text-transform: uppercase;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  backdrop-filter: blur(12px);
  position: relative; overflow: hidden;
  outline: none;
}
.mm-nav-btn::before {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, rgba(170,255,0,0.05), transparent);
  transform: translateX(-100%);
  transition: transform 0.5s ease;
}
.mm-nav-btn:hover::before { transform: translateX(100%); }
.mm-nav-btn:hover {
  border-color: rgba(170,255,0,0.3);
  transform: translateX(4px);
  box-shadow: 0 0 24px rgba(0,0,0,0.3), -4px 0 0 rgba(170,255,0,0.15);
}
.mm-nav-btn:hover .mm-nav-arrow { opacity: 1; transform: translateX(4px); }
.mm-nav-btn:hover .mm-nav-icon { color: var(--zzz-lime); }
.mm-nav-btn:active { transform: translateX(2px) scale(0.98); }

.mm-nav-btn--primary {
  background: linear-gradient(135deg, rgba(170,255,0,0.12), rgba(170,255,0,0.06));
  border-color: rgba(170,255,0,0.25);
}
.mm-nav-btn--primary:hover {
  border-color: var(--zzz-lime);
  background: linear-gradient(135deg, rgba(170,255,0,0.2), rgba(170,255,0,0.1));
  box-shadow: 0 0 32px rgba(170,255,0,0.15), -4px 0 0 var(--zzz-lime);
}
.mm-nav-btn--primary .mm-nav-icon { color: var(--zzz-lime); }
.mm-nav-btn--primary .mm-nav-text { color: var(--zzz-lime); }

.mm-nav-icon {
  font-size: 16px; flex-shrink: 0;
  transition: color 0.2s, transform 0.2s;
}
.mm-nav-text { flex: 1; text-align: left; }
.mm-nav-arrow {
  font-size: 14px; flex-shrink: 0;
  transition: all 0.25s ease;
}

/* Stat cards */
.mm-stat-card {
  background: rgba(17,17,17,0.6);
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 14px;
  padding: 14px 20px;
  text-align: center;
  backdrop-filter: blur(8px);
  min-width: 100px;
  position: relative; overflow: hidden;
  transition: border-color 0.3s, box-shadow 0.3s;
}
.mm-stat-card::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent);
}
.mm-stat-card:hover {
  border-color: rgba(255,255,255,0.1);
  box-shadow: 0 0 16px rgba(0,0,0,0.2);
}
.mm-stat-label {
  font-family: var(--zzz-font); font-weight: 700; font-size: 9px;
  color: var(--zzz-muted); letter-spacing: 0.15em; text-transform: uppercase;
  margin-bottom: 6px;
}
.mm-stat-value {
  font-family: var(--zzz-font); font-weight: 800; font-size: 24px;
  color: var(--zzz-text); font-variant-numeric: tabular-nums; line-height: 1;
}

/* Featured card */
.mm-featured-card {
  background: rgba(17,17,17,0.5);
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 16px;
  position: relative; overflow: hidden;
  backdrop-filter: blur(12px);
  transition: border-color 0.3s;
}
.mm-featured-card:hover { border-color: rgba(255,255,255,0.1); }
.mm-featured-glow {
  position: absolute; inset: 0;
  background: linear-gradient(135deg, rgba(170,255,0,0.04) 0%, rgba(168,85,247,0.06) 50%, rgba(170,255,0,0.03) 100%);
  pointer-events: none;
}
.mm-featured-label {
  font-family: var(--zzz-font); font-weight: 700; font-size: 9px;
  color: var(--zzz-purple); letter-spacing: 0.2em; text-transform: uppercase;
  margin-bottom: 4px;
}
.mm-featured-title {
  font-family: var(--zzz-font); font-weight: 900; font-size: 15px;
  color: var(--zzz-text); text-transform: uppercase; letter-spacing: 0.06em;
  line-height: 1.2;
}
.mm-featured-desc {
  font-family: var(--zzz-font); font-weight: 500; font-size: 11px;
  color: var(--zzz-muted); margin-top: 3px;
}

/* Bottom bar */
.mm-version {
  font-family: var(--zzz-mono); font-weight: 700; font-size: 10px;
  color: var(--zzz-lime); opacity: 0.6; letter-spacing: 0.05em;
}
.mm-version-sub {
  font-family: var(--zzz-font); font-weight: 600; font-size: 10px;
  color: var(--zzz-muted); opacity: 0.4; letter-spacing: 0.08em;
}
.mm-hint-key {
  display: inline-block;
  font-family: var(--zzz-mono); font-weight: 700; font-size: 9px;
  color: rgba(255,255,255,0.5);
  padding: 2px 8px;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 6px;
  background: rgba(255,255,255,0.04);
  letter-spacing: 0.05em;
}

/* Mobile responsive */
@media (max-width: 768px) {
  .mm-stat-card { padding: 10px 14px; min-width: 70px; }
  .mm-stat-value { font-size: 18px; }
  .mm-stat-label { font-size: 8px; }
  .mm-nav-btn { max-width: 260px; padding: 12px 22px; font-size: 14px; }
  .mm-featured-card > div:last-child > div:last-child { display: none; }
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

/* ── SONG → GAME TRANSITION ────────────────────── */
.song-transition-overlay {
  position: fixed; inset: 0; z-index: 100;
  pointer-events: none;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0);
  transition: background 0.4s ease;
}
.song-transition-overlay.fade-bg {
  background: rgba(0,0,0,0.85);
}

.song-transition-card {
  position: absolute;
  border-radius: 24px;
  overflow: hidden;
  background: rgba(0,0,0,0.92);
  box-shadow: 0 0 40px rgba(0,0,0,0.6), 0 0 20px rgba(170,255,0,0.05);
  will-change: transform, border-radius, width, height, top, left;
  border: 1px solid rgba(170,255,0,0.08);
  transform-origin: center center;
}

/* Phase 1: fly to center — handled by JS transition */

.song-loading-bar {
  width: 60%; height: 3px;
  background: rgba(255,255,255,0.08);
  border-radius: 2px;
  overflow: hidden;
}
.song-loading-bar-fill {
  height: 100%; width: 0%;
  background: var(--zzz-lime);
  border-radius: 2px;
  transition: width 0.8s cubic-bezier(0.4,0,0.2,1);
  box-shadow: 0 0 8px rgba(170,255,0,0.5);
}

/* Phase 4: final glitch burst before game */
@keyframes transition-glitch-burst {
  0%   { transform: scale(1); filter: none; opacity: 1; }
  10%  { transform: scale(1.05) translateX(-4px); filter: hue-rotate(90deg) brightness(2); }
  20%  { transform: scale(1.03) translateX(3px); filter: hue-rotate(-45deg) brightness(1.5); }
  30%  { transform: scale(1.08); filter: brightness(3) saturate(0); }
  50%  { transform: scale(15); filter: brightness(5); opacity: 1; }
  80%  { opacity: 0; transform: scale(25); }
  100% { opacity: 0; transform: scale(30); filter: brightness(10); }
}
.song-transition-card.burst {
  animation: transition-glitch-burst 0.6s cubic-bezier(0.4,0,0.2,1) forwards;
}

/* Scanline shimmer inside the card during loading */
@keyframes scanline-shimmer {
  0%   { background-position: 0 0; }
  100% { background-position: 0 200px; }
}
.song-transition-card .scanline-overlay {
  position: absolute; inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 3px,
    rgba(170,255,0,0.03) 3px,
    rgba(170,255,0,0.03) 4px
  );
  background-size: 100% 200px;
  animation: scanline-shimmer 2s linear infinite;
  pointer-events: none;
  z-index: 2;
}

/* ── SONG SELECT LOADING ────────────────────── */
.ss-loading { position:absolute;inset:0;z-index:100;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:rgba(0,0,0,0.9); }
.ss-loading-spinner { width:40px;height:40px;border:3px solid var(--zzz-graphite);border-top-color:var(--zzz-lime);border-radius:50%;animation:ss-spin 0.8s linear infinite; }
@keyframes ss-spin { to { transform:rotate(360deg); } }
.ss-loading-text { font-family:var(--zzz-font);font-weight:700;font-size:12px;color:var(--zzz-muted);letter-spacing:0.2em;text-transform:uppercase;animation:ss-pulse 1.5s ease-in-out infinite; }
@keyframes ss-pulse { 0%,100%{opacity:0.4;} 50%{opacity:1;} }
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

  /** Play channel switch sound */
  playSwitchSound() {
    if (_crtSounds) _crtSounds.crtSwitch();
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

    // Clean up after animation
    setTimeout(() => {
      canvas.classList.remove('glitch-transition');
    }, 450);
  }
};

export default ZZZTheme;
