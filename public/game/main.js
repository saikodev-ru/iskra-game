import ZZZTheme      from './theme/ZZZTheme.js';
import AudioEngine   from './core/AudioEngine.js';
import ThreeScene    from './scene/ThreeScene.js';
import GameLoop      from './core/GameLoop.js';
import InputManager  from './core/InputManager.js';
import EventBus      from './core/EventBus.js';
import HitSounds, { preloadHitSounds } from './game/HitSounds.js';
import LoadingScreen  from './ui/screens/LoadingScreen.js';
import BeatMap       from './game/BeatMap.js';
import JudgementSystem from './game/JudgementSystem.js';
import NoteRenderer  from './game/NoteRenderer.js';
import ColorExtractor from './game/ColorExtractor.js';
import RecordStore   from './game/RecordStore.js';
import JudgementDisplay from './ui/JudgementDisplay.js';
import HUD           from './ui/HUD.js';
import ScreenManager from './ui/ScreenManager.js';
import LatencyCalibrator from './game/LatencyCalibrator.js';
import MainMenu      from './ui/screens/MainMenu.js';
import SongSelect    from './ui/screens/SongSelect.js';
import Settings      from './ui/screens/Settings.js';
import ResultScreen  from './ui/screens/ResultScreen.js';
import { GameCursor }     from './game/GameCursor.js';

/**
 * Calculate the safe area based on aspect ratio.
 * This determines the LOGICAL visible area of the game.
 * Resolution scale is NOT applied here — it only affects canvas pixel density.
 */
function calcSafeArea() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const ar = localStorage.getItem('rhythm-os-aspect-ratio') || '16:9';

  let targetW, targetH;
  if (ar === 'Fill') {
    targetW = w; targetH = h;
  } else {
    const parts = ar.split(':');
    const arW = parseInt(parts[0]) || 16;
    const arH = parseInt(parts[1]) || 9;
    const targetAR = arW / arH;
    const screenAR = w / h;
    if (screenAR > targetAR) { targetH = h; targetW = h * targetAR; }
    else { targetW = w; targetH = w / targetAR; }
  }
  // DO NOT apply resScale here — safe area is always the full visible area
  targetW = Math.round(targetW);
  targetH = Math.round(targetH);
  const x = Math.round((w - targetW) / 2);
  const y = Math.round((h - targetH) / 2);
  return { x, y, w: targetW, h: targetH };
}

/** Get the resolution scale (affects canvas render resolution only) */
function getResScale() {
  return parseInt(localStorage.getItem('rhythm-os-res-scale') || '100') / 100;
}

async function boot() {
  console.log('[RHYMIX] Booting...');

  if (window.__rhythmOsBooted) {
    try {
      if (window.__threeSceneInstances) {
        for (const inst of window.__threeSceneInstances) { try { inst.dispose(); } catch (_) {} }
        window.__threeSceneInstances.length = 0;
      }
    } catch (_) {}
  }
  window.__rhythmOsBooted = true;

  const audio = new AudioEngine();
  let hitSounds = null;
  const initAudio = () => { audio._ensureCtx(); if (!hitSounds && audio.ctx) hitSounds = new HitSounds(audio.ctx); return hitSounds; };

  ZZZTheme.init({
    crtClick: () => { const s = initAudio(); if(s) s.crtClick(); },
    crtSwitch: () => { const s = initAudio(); if(s) s.crtSwitch(); },
    gameStart: () => { const s = initAudio(); if(s) s.gameStart(); }
  });

  const threeCanvas = document.getElementById('three');
  const three = new ThreeScene(threeCanvas);
  three.setAudioEngine(audio);

  const savedAR = localStorage.getItem('rhythm-os-aspect-ratio') || '16:9';
  three.setAspectRatio(savedAR);

  const savedGraphics = localStorage.getItem('rhythm-os-graphics') || 'disco';
  three.setGraphicsPreset(savedGraphics);

  const gameCanvas = document.getElementById('game');
  const noteRenderer = new NoteRenderer(gameCanvas);
  const input = new InputManager(audio);
  const calibrator = new LatencyCalibrator(audio);
  const hudContainer = document.getElementById('hud');
  const hud = new HUD(hudContainer);
  const judgementContainer = document.getElementById('judgement-overlay');
  const judgementDisplay = new JudgementDisplay(judgementContainer);
  const screenContainer = document.getElementById('screen');
  const screens = new ScreenManager(screenContainer);

  const initialSA = calcSafeArea();
  noteRenderer.setSafeArea(initialSA.x, initialSA.y, initialSA.w, initialSA.h);
  noteRenderer.setResScale(getResScale());
  noteRenderer.setGraphicsPreset(savedGraphics);
  three.setSafeArea(initialSA.x, initialSA.y, initialSA.w, initialSA.h);
  const applySafeAreaToContainers = (sa) => {
    [screenContainer, hudContainer, judgementContainer].forEach(c => {
      c.style.left = sa.x + 'px'; c.style.top = sa.y + 'px';
      c.style.width = sa.w + 'px'; c.style.height = sa.h + 'px';
    });
  };
  applySafeAreaToContainers(initialSA);

  const LEAD_IN = 1.0; // 1 second lead-in before notes arrive

  let gameLoop = null, currentBeatMap = null, currentJudgement = null, gameActive = false;
  let _endingGame = false;  // guard against double-calling endGame()
  let _inCountdown = false; // true during 3-2-1 countdown (after resume)
  let _dying = false;       // true during death animation (HP depleted)
  let _deadPause = false;    // true when pause menu is shown after death (no resume)
  let _deathTimeout = null; // timeout ID for death sequence → endGame
  let _deathFreezeTime = 0; // frozen game time when death starts (notes stop moving)
  let _skipResult = false;  // when true, endGame() rAF won't show result screen (restart)
  let _quitGame = false;    // when true, endGame() skips saving result to records
  let _quickRestartKey = null; // key code for quick restart (e.g. 'ShiftLeft')
  let _quickRestartHeld = false;
  let _quickRestartStart = 0;
  let _quickRestartOverlay = null;
  const QUICK_RESTART_HOLD_MS = 500; // hold duration to trigger restart
  let currentMapData = null;
  let currentLaneCount = 4;

  const savedVolume = parseInt(localStorage.getItem('rhythm-os-volume') || '70') / 100;
  const savedGameVolume = parseInt(localStorage.getItem('rhythm-os-game-volume') || '70') / 100;
  const savedMusicVolume = parseInt(localStorage.getItem('rhythm-os-music-volume') || '100') / 100;
  audio._ensureCtx();
  audio.setVolume(savedVolume);
  audio.setMusicVolume(savedMusicVolume);
  initAudio();
  if (hitSounds) hitSounds.setVolume(savedGameVolume);

  const updateSafeArea = () => {
    const sa = calcSafeArea();
    noteRenderer.setSafeArea(sa.x, sa.y, sa.w, sa.h);
    noteRenderer.setResScale(getResScale());
    noteRenderer.resize();
    applySafeAreaToContainers(sa);
    three.setSafeArea(sa.x, sa.y, sa.w, sa.h);
  };

  EventBus.on('settings:changed', ({ key, value }) => {
    if (key === 'aspectRatio') {
      updateSafeArea(); three.setAspectRatio(value);
      if (!gameActive) noteRenderer.clear();
    } else if (key === 'resScale') {
      // Only affects canvas resolution, not layout
      noteRenderer.setResScale(getResScale());
      noteRenderer.resize();
      if (!gameActive) noteRenderer.clear();
    } else if (key === 'graphics') {
      noteRenderer.setGraphicsPreset(value);
      three.setGraphicsPreset(value);
      if (!gameActive) noteRenderer.clear();
    } else if (key === 'scrollSpeed') {
      // Apply scroll speed immediately (works mid-game from pause settings)
      noteRenderer.scrollSpeed = value;
    } else if (key === 'gameVolume') {
      if (hitSounds) hitSounds.setVolume(value / 100);
    } else if (key === 'bgDim') {
      noteRenderer.setBackgroundDim(value);
    }
  });

  const startGame = (map) => {
    if (gameActive) { _skipResult = true; endGame(); }
    _dying = false;
    if (_deathTimeout) { clearTimeout(_deathTimeout); _deathTimeout = null; }
    GameCursor.hide(); // Hide cursor during gameplay
    initAudio();

    // Restore HUD and judgement container opacity (hidden during song-select transition)
    hudContainer.style.opacity = '';
    judgementContainer.style.opacity = '';

    currentMapData = map;

    // Shift all notes by LEAD_IN so the first second has no notes (player prep time).
    // CRITICAL: We also prepend LEAD_IN seconds of silence to the audio buffer so that
    // audio content time aligns with note times. Without this, notes would be 1s late!
    //   audio.currentTime = 6.0 → audio content at original t=5.0 (due to 1s silence prefix)
    //   note shifted from t=5.0 to t=6.0 → at judgeLine when currentTime = 6.0 → SYNC ✓
    const shiftedMap = {
      ...map,
      notes: map.notes.map(n => ({ ...n, time: n.time + LEAD_IN })),
      bpmChanges: (map.bpmChanges || []).map(b => ({ ...b, time: b.time + LEAD_IN })),
      kiaiSections: (map.kiaiSections || []).map(s => ({
        startTime: s.startTime + LEAD_IN,
        endTime: s.endTime + LEAD_IN
      })),
    };

    // Create audio buffer with silence prepended — this is what makes note shifting work
    if (map.audioBuffer) {
      shiftedMap.audioBuffer = audio.createLeadInBuffer(map.audioBuffer, LEAD_IN);
    }

    currentBeatMap = new BeatMap(shiftedMap);
    currentJudgement = new JudgementSystem(currentBeatMap);
    currentJudgement.reset();

    input.setLaneCount(currentBeatMap.laneCount);
    currentLaneCount = currentBeatMap.laneCount;
    const scrollSpeed = parseInt(localStorage.getItem('rhythm-os-scroll-speed') || '400');
    noteRenderer.scrollSpeed = scrollSpeed;
    noteRenderer.resize();

    // Hide screen container during gameplay — prevents stale menu overlays from showing
    const screenContainer = document.getElementById('screen');
    if (screenContainer) { screenContainer.style.opacity = '0'; screenContainer.style.visibility = 'hidden'; }

    // Clear previous background state
    noteRenderer.clearBackground();

    // Disable CRT effect during gameplay — CRT is only for song select background
    three.setCrtIntensity(0);
    ZZZTheme.removeCrtOverlay();

    // Enable lead-in offset for video sync (game has 1s silence prepended to audio)
    three._leadInOffset = LEAD_IN;

    // Hide Three.js dark gradient bg mesh to prevent "double background"
    three.hideBgMesh();

    // Use video background if available, otherwise use image background
    if (map.videoUrl) {
      three.setBackgroundVideo(map.videoUrl, audio);
      // For video maps, grab a frame for the frosted glass blur in NoteRenderer
      three.setBackgroundImage(map.backgroundUrl); // fallback still image if available
      noteRenderer.setBackgroundImage(map.backgroundUrl);
    } else if (map.backgroundUrl) {
      three.setBackgroundImage(map.backgroundUrl);
      // Also set on NoteRenderer for frosted glass blur effect
      noteRenderer.setBackgroundImage(map.backgroundUrl);
    } else {
      three._clearBackgroundImage();
      three._clearBackgroundVideo();
    }

    // Extract accent colors from background for note colors
    if (map.backgroundUrl) {
      const bgImg = new Image();
      bgImg.crossOrigin = 'anonymous';
      bgImg.onload = () => {
        try {
          const colors = ColorExtractor.extract(bgImg);
          const extended = [];
          while (extended.length < 8) extended.push(...colors);
          NoteRenderer.setLaneColors(extended);
        } catch (_) {}
      };
      bgImg.src = map.backgroundUrl;
    }

    // Start the game immediately — the song-select transition already
    // provides the visual delay. Audio starts only in _actuallyStartGame.
    _actuallyStartGame(shiftedMap);
  };

  const _actuallyStartGame = (map) => {
    const hitHandler = ({ lane, hitTime }) => {
      if (!gameActive || _inCountdown) return;
      const result = currentJudgement.judgeHit(lane, hitTime);

      // Always show a visual effect on the lane when a key is pressed
      const pos = noteRenderer.getLaneHitPosition(lane, currentLaneCount);

      if (result) {
        if (result.recovered) {
          // Hold note recovered after drop — subtle green flash, no judgement
          noteRenderer.addLaneGlow(lane, currentLaneCount, '#AAFF00');
          return;
        }
        // Note was hit — show lane-colored effect + lane glow
        const laneColors = NoteRenderer.LANE_COLORS;
        const hitColor = laneColors[lane % laneColors.length] || '#AAFF00';
        noteRenderer.addEffect(pos.x, pos.y, hitColor, result.judgement);
        // Project Sekai-style lane glow on hit
        noteRenderer.addLaneGlow(lane, currentLaneCount, hitColor);

        if (hitSounds) {
          if (result.judgement === 'perfect') hitSounds.perfect();
          else if (result.judgement === 'great') hitSounds.great();
          else if (result.judgement === 'good') hitSounds.good();
          else if (result.judgement === 'bad') hitSounds.emptyHit();
        }
        judgementDisplay.checkMilestone(currentJudgement.combo);
        if (hitSounds && [50, 100, 200, 500].includes(currentJudgement.combo)) hitSounds.milestone(currentJudgement.combo);
      } else {
        // Empty key press — still play quiet sound and show subtle visual feedback
        if (hitSounds) hitSounds.emptyHit();
        noteRenderer.addLaneGlow(lane, currentLaneCount, '#FFFFFF');
      }
    };

    const missHandler = ({ sliderBreak } = {}) => { if (!gameActive || _inCountdown) return; if (hitSounds) hitSounds.miss(); };
    const sliderBreakHandler = ({ note }) => {
      if (!gameActive || _inCountdown) return;
      if (hitSounds) hitSounds.miss();
      // Red flash on the lane at judge line
      noteRenderer.addMissFlash(note.lane, currentLaneCount);
    };
    const comboBreakHandler = ({ combo }) => { judgementDisplay.showComboBreak(combo); };

    // Kiai beat pulse: on each beat during kiai, trigger a visual pulse on the renderer
    const kiaiBeatHandler = () => {
      if (!gameActive || !currentBeatMap) return;
      const kiaiIntensity = currentBeatMap.getKiaiIntensity(audio.currentTime);
      if (kiaiIntensity > 0.05) {
        noteRenderer.triggerKiaiBeatPulse(kiaiIntensity);
      }
    };

    const releaseHandler = ({ lane, releaseTime }) => {
      if (!gameActive || _inCountdown) return;
      const result = currentJudgement.judgeRelease(lane, releaseTime);
      if (!result) return;

      // Dropped hold (released before end) — no immediate effect, grace period started
      if (result.dropped) return;

      const pos = noteRenderer.getLaneHitPosition(lane, currentLaneCount);
      const laneColors = NoteRenderer.LANE_COLORS;
      const hitColor = laneColors[lane % laneColors.length] || '#AAFF00';
      noteRenderer.addEffect(pos.x, pos.y, hitColor, result.judgement);

      if (hitSounds) {
        if (result.judgement === 'perfect') hitSounds.perfect();
        else if (result.judgement === 'great') hitSounds.great();
        else if (result.judgement === 'good') hitSounds.good();
      }
      judgementDisplay.checkMilestone(currentJudgement.combo);
    };

    EventBus.on('input:hit', hitHandler);
    EventBus.on('input:release', releaseHandler);
    EventBus.on('note:miss', missHandler);
    EventBus.on('note:sliderbreak', sliderBreakHandler);
    EventBus.on('combo:break', comboBreakHandler);
    EventBus.on('beat:pulse', kiaiBeatHandler);

    hud.show();
    input.enable();
    gameActive = true;

    // Get audio duration for progress bar + end-of-map detection
    // Use the shiftedMap's audioBuffer (with lead-in silence) so duration includes lead-in
    const audioDuration = map.audioBuffer ? map.audioBuffer.duration : 0;

    if (map.audioBuffer) {
      // Play the LEAD-IN buffer (1s silence prepended) — this is critical for sync!
      // Without it, notes shifted by +1s would arrive 1 second late relative to audio.
      audio.play(map.audioBuffer);
      const vol = parseInt(localStorage.getItem('rhythm-os-volume') || '70') / 100;
      audio.fadeTo(vol, 0.1);
    }

    audio.startBeatScheduler(currentBeatMap.metadata.bpm);

    gameLoop = new GameLoop({
      update(delta) {
        if (!gameActive) return;
        // During death animation, freeze game time so notes stop being judged
        const ct = _dying ? _deathFreezeTime : audio.currentTime;
        // During countdown (after resume), skip game logic
        if (_inCountdown) return;

        // ── Focus guard: prevent any element from stealing keyboard focus during gameplay ──
        const ae = document.activeElement;
        if (ae && ae !== document.body && ae !== document.documentElement) {
          ae.blur();
        }

        _updateQuickRestart();
        currentJudgement.checkMisses(ct);
        // osu!mania HP drain: tick per frame
        currentJudgement.tickHP(delta);
        const stats = currentJudgement.getStats();
        noteRenderer.setHealth(stats.health);
        hud.update(stats);

        // Progress bar
        if (audioDuration > 0) {
          hud.setProgress(Math.min(1, ct / audioDuration));
        }

        // End map when audio finishes
        const songFinished = !audio.isPlaying || (audioDuration > 0 && ct >= audioDuration - 0.1);
        if (songFinished) {
          // Don't end if audio hasn't actually started yet
          if (ct > 0.5) endGame();
          return; // Prevent death check from running in same frame after endGame()
        }
        // Death: HP depleted — start death sequence (once only)
        if (gameActive && stats.health <= 0 && !_dying) {
          _dying = true;
          _deathFreezeTime = ct; // Freeze game time — notes stop moving
          currentJudgement._died = true; // Force D rank
          if (hitSounds) hitSounds.fail();
          input.disable();
          // Slow music down over 2.5 seconds (audio-only effect)
          audio.slowDown(2.5);
          // Fade canvases to dark (CSS animation — no skew distortion)
          const gameCanvasEl = document.getElementById('game');
          const threeCanvasEl = document.getElementById('three');
          if (gameCanvasEl) gameCanvasEl.classList.add('dying');
          if (threeCanvasEl) threeCanvasEl.classList.add('dying');
          // Red scanline overlay
          const deathEl = document.createElement('div');
          deathEl.className = 'death-overlay';
          deathEl.id = 'death-overlay';
          // Constrain to safe area
          const dSa = calcSafeArea();
          deathEl.style.left = dSa.x + 'px';
          deathEl.style.top = dSa.y + 'px';
          deathEl.style.width = dSa.w + 'px';
          deathEl.style.height = dSa.h + 'px';
          document.body.appendChild(deathEl);
          // After music finishes slowing, show pause menu (no continue button)
          _deathTimeout = setTimeout(() => {
            _deathTimeout = null;
            // Reset death visual state before showing pause menu
            _dying = false;
            const deathOverlay = document.getElementById('death-overlay');
            if (deathOverlay) deathOverlay.remove();
            const gcEl = document.getElementById('game');
            const tcEl = document.getElementById('three');
            if (gcEl) gcEl.classList.remove('dying');
            if (tcEl) tcEl.classList.remove('dying');
            // Show pause menu without Continue button (mark as quit so result not saved)
            _quitGame = true;
            pauseGame({ noResume: true });
          }, 2800);
        }
      },
      render(delta) {
        if (!gameActive) return;
        // During death animation, freeze game time so notes stop moving
        const ct = _dying ? _deathFreezeTime : audio.currentTime;
        // Compute kiai intensity for the renderer
        const kiaiIntensity = currentBeatMap ? currentBeatMap.getKiaiIntensity(ct) : 0;
        noteRenderer.setKiaiIntensity(kiaiIntensity);
        noteRenderer.render({ notes: currentBeatMap.getNotesInWindow(ct), currentTime: ct, laneCount: currentLaneCount, delta, bpm: currentBeatMap.metadata.bpm || 120, bpmChanges: currentBeatMap.bpmChanges });
        three.update(performance.now());
      }
    });
    gameLoop.start();
    EventBus.emit('game:start', { map });

    startGame._cleanup = () => {
      EventBus.off('input:hit', hitHandler);
      EventBus.off('input:release', releaseHandler);
      EventBus.off('note:miss', missHandler);
      EventBus.off('note:sliderbreak', sliderBreakHandler);
      EventBus.off('combo:break', comboBreakHandler);
      EventBus.off('beat:pulse', kiaiBeatHandler);
    };
  };

  const endGame = () => {
    if (_endingGame) return;  // prevent double-call
    _endingGame = true;
    _inCountdown = false;
    _dying = false;
    _deadPause = false;
    _quickRestartHeld = false;
    _quickRestartKey = null;
    _removeQuickRestartOverlay();
    gameActive = false;
    input.disable();
    // Cancel pending death timeout (if endGame was called manually before timeout fired)
    if (_deathTimeout) { clearTimeout(_deathTimeout); _deathTimeout = null; }
    // Remove overlays
    const cdOverlay = document.getElementById('countdown-overlay');
    if (cdOverlay) cdOverlay.remove();
    const deathOverlay = document.getElementById('death-overlay');
    if (deathOverlay) deathOverlay.remove();
    // Remove dying classes from canvases (in case endGame called during death animation)
    const gameCanvasEl = document.getElementById('game');
    const threeCanvasEl = document.getElementById('three');
    if (gameCanvasEl) gameCanvasEl.classList.remove('dying');
    if (threeCanvasEl) threeCanvasEl.classList.remove('dying');
    if (gameLoop) { gameLoop.stop(); gameLoop = null; }
    audio.stop();
    audio.stopBeatScheduler();
    judgementDisplay.reset();
    hud.hide();
    noteRenderer.clearBackground();
    noteRenderer.clear();
    noteRenderer.clearLaneGlows();
    noteRenderer.setKiaiIntensity(0);
    noteRenderer._kiaiBeatPulse = 0;
    three._clearBackgroundImage();
    three._clearBackgroundVideo();
    three._leadInOffset = 0; // Reset lead-in offset for preview mode
    three.showBgMesh(); // Restore dark gradient bg mesh for menus
    if (startGame._cleanup) { startGame._cleanup(); startGame._cleanup = null; }
    const stats = currentJudgement.getStats();
    // Save result ONLY if the game was played to completion (song end / death), not on quit
    if (!_quitGame && currentMapData && stats) {
      try {
        const setId = currentMapData.metadata?.setId || currentMapData.metadata?.title || '';
        const diffVersion = currentMapData.metadata?.version || '';
        RecordStore.add(setId, diffVersion, stats);
      } catch (_) {}
    }
    _quitGame = false; // Reset flag
    // Restore screen container for menus
    const screenEl = document.getElementById('screen');
    if (screenEl) { screenEl.style.opacity = ''; screenEl.style.visibility = ''; }
    GameCursor.show(); // Show custom cursor back on menus
    EventBus.emit('game:over', stats);
    // Use a small delay to ensure ScreenManager transition completes
    // and avoid race conditions with the game loop's requestAnimationFrame
    requestAnimationFrame(() => {
      _endingGame = false;
      // If restart was triggered, skip showing the result screen
      if (_skipResult) { _skipResult = false; return; }
      screens.show('result', { stats, map: currentMapData });
    });
    // Safety: ensure death timeout is always cleared (belt-and-suspenders)
    if (_deathTimeout) { clearTimeout(_deathTimeout); _deathTimeout = null; }
  };

  let _pauseOverlay = null;
  let _pauseSettingsInstance = null;

  const pauseGame = (opts = {}) => {
    if (!gameActive) return;
    gameActive = false;
    audio.pause();
    if (gameLoop) gameLoop.stop();
    three.pauseVideo();
    hud.freeze(); // Stop score/combo animation while paused

    const { noResume = false } = opts;
    const sa = calcSafeArea();
    const overlay = document.createElement('div');
    overlay.id = 'pause-overlay';
    overlay.style.cssText = `position:fixed;left:${sa.x}px;top:${sa.y}px;width:${sa.w}px;height:${sa.h}px;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:50;animation:pause-fade-in 0.2s ease-out forwards;`;
    overlay.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:24px;animation:pause-panel-in 0.3s cubic-bezier(0.22,1,0.36,1) forwards;">
        <div style="font-family:var(--zzz-font);font-weight:900;font-size:14px;color:var(--zzz-muted);letter-spacing:0.3em;text-transform:uppercase;">${noResume ? 'GAME OVER' : 'PAUSED'}</div>
        <div style="display:flex;flex-direction:column;gap:12px;min-width:240px;">
          ${noResume ? '' : '<button class="zzz-btn zzz-btn--primary" id="resume-btn" style="width:100%;font-size:15px;padding:14px 32px;">▶ RESUME</button>'}
          <button class="zzz-btn" id="restart-btn" style="width:100%;border-color:var(--zzz-lime);color:var(--zzz-lime);">↻ RESTART</button>
          <button class="zzz-btn" id="settings-btn" style="width:100%;">⚙ SETTINGS</button>
          <div style="height:1px;background:var(--zzz-graphite);margin:4px 0;"></div>
          <button class="zzz-btn zzz-btn--danger" id="quit-btn" style="width:100%;">✕ QUIT</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    _pauseOverlay = overlay;
    _deadPause = noResume;
    GameCursor.show(); // Show cursor to interact with pause buttons

    if (!noResume) {
      document.getElementById('resume-btn').addEventListener('click', () => { _closePause(); resumeGame(); });
    }
    document.getElementById('restart-btn').addEventListener('click', () => { _closePause(); _skipResult = true; _quitGame = true; endGame(); startGame(currentMapData); });
    document.getElementById('settings-btn').addEventListener('click', () => { _openPauseSettings(); });
    document.getElementById('quit-btn').addEventListener('click', () => { _closePause(); _skipResult = true; _quitGame = true; endGame(); screens.show('song-select'); });
    EventBus.emit('game:pause');
  };

  const _closePause = () => {
    if (_pauseSettingsInstance) { _pauseSettingsInstance.destroy(); _pauseSettingsInstance = null; }
    if (_pauseOverlay) { _pauseOverlay.remove(); _pauseOverlay = null; }
    _deadPause = false;
  };

  const _openPauseSettings = () => {
    if (!_pauseOverlay) return;
    const sa = calcSafeArea();
    const panelWidth = Math.max(Math.min(380, sa.w * 0.7), Math.min(240, sa.w * 0.5));
    const settingsPanel = document.createElement('div');
    settingsPanel.id = 'pause-settings';
    settingsPanel.style.cssText = `position:fixed;left:${sa.x}px;top:${sa.y}px;width:${sa.w}px;height:${sa.h}px;z-index:60;display:flex;overflow:hidden;`;
    settingsPanel.innerHTML = `
      <div id="pause-settings-inner" style="width:${panelWidth}px;min-width:${Math.min(240, sa.w * 0.5)}px;height:100%;background:rgba(17,17,17,0.95);backdrop-filter:blur(20px);border-right:2px solid var(--zzz-graphite);overflow-y:auto;padding:28px 20px;animation:settings-slide-in 0.25s ease-out forwards;" class="zzz-scroll"></div>
      <div id="pause-settings-bg" style="flex:1;min-width:0;"></div>
    `;
    _pauseOverlay.style.display = 'none';
    document.body.appendChild(settingsPanel);

    // Build settings into the panel
    const settings = new Settings({ audio, input, screens, overlayMode: true });
    // Set close callback so Settings._closeOverlay knows to use pause cleanup
    settings._onClose = _closePauseSettings;
    const inner = document.getElementById('pause-settings-inner');
    inner.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;">
        <h2 class="zzz-title" style="font-size:24px;color:var(--zzz-lime);margin:0;">SETTINGS</h2>
        <button id="pause-settings-close" class="zzz-btn zzz-btn--sm" style="pointer-events:all;">✕</button>
      </div>
    `;
    // Append the settings content
    const aspectRatios = ['16:9', '16:10', '4:3', '21:9', 'Fill'];
    const savedAspect = localStorage.getItem('rhythm-os-aspect-ratio') || '16:9';
    const savedResScale = localStorage.getItem('rhythm-os-res-scale') || '100';
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = settings._buildSettingsContent(aspectRatios, savedAspect, savedResScale);
    inner.appendChild(tempDiv);
    settings.init();
    _pauseSettingsInstance = settings;

    // Close handlers — delegate to Settings._closeOverlay which uses _onClose callback
    const closeBtn = document.getElementById('pause-settings-close');
    const bgBtn = document.getElementById('pause-settings-bg');
    if (closeBtn) closeBtn.addEventListener('click', () => settings._closeOverlay());
    if (bgBtn) bgBtn.addEventListener('click', () => settings._closeOverlay());
  };

  const _closePauseSettings = () => {
    const panel = document.getElementById('pause-settings');
    if (panel) panel.remove();
    if (_pauseSettingsInstance) { _pauseSettingsInstance.destroy(); _pauseSettingsInstance = null; }
    if (_pauseOverlay) {
      // Reposition pause overlay to match current safe area
      const sa = calcSafeArea();
      _pauseOverlay.style.left = sa.x + 'px';
      _pauseOverlay.style.top = sa.y + 'px';
      _pauseOverlay.style.width = sa.w + 'px';
      _pauseOverlay.style.height = sa.h + 'px';
      _pauseOverlay.style.display = '';
    }
    // Re-apply safe area in case aspect ratio changed
    updateSafeArea();
  };

  EventBus.on('settings:open-overlay', () => {
    // Don't open main-menu context settings overlay during gameplay or pause
    if (gameActive || _pauseOverlay) return;
    const settings = new Settings({ audio, input, screens, overlayMode: true });
    screens._showOverlay(settings);
  });

  const resumeGame = () => {
    // Show countdown before resuming — map stays paused during countdown
    const sa = calcSafeArea();
    const countdownOverlay = document.createElement('div');
    countdownOverlay.id = 'countdown-overlay';
    countdownOverlay.style.cssText = `position:fixed;left:${sa.x}px;top:${sa.y}px;width:${sa.w}px;height:${sa.h}px;display:flex;align-items:center;justify-content:center;z-index:55;pointer-events:none;`;
    document.body.appendChild(countdownOverlay);

    // DON'T resume audio yet — keep the map paused during countdown.
    // The game loop will render a frozen frame since audio.currentTime is static.

    // Start game loop in countdown mode (renders frozen frame, skips judgement)
    gameActive = true;
    _inCountdown = true;
    GameCursor.hide(); // Hide custom cursor during gameplay
    hud.freeze(); // Keep frozen during countdown
    if (gameLoop) gameLoop.start();

    // 3-2-1 countdown (3 beats at ~600ms each = 1.8s total)
    const steps = ['3', '2', '1'];
    let stepIndex = 0;

    const showStep = () => {
      if (stepIndex >= steps.length) {
        // Countdown done — NOW resume audio and video for real
        countdownOverlay.remove();
        _inCountdown = false;
        hud.unfreeze(); // Resume score/combo animation
        audio.resume();
        three.resumeVideo();
        const vol = parseInt(localStorage.getItem('rhythm-os-volume') || '70') / 100;
        audio.fadeTo(vol, 0.15);
        EventBus.emit('game:resume');
        return;
      }

      const num = steps[stepIndex];
      countdownOverlay.innerHTML = `
        <div style="font-family:var(--zzz-font);font-weight:900;font-size:120px;color:var(--zzz-lime);
          text-shadow:0 0 40px rgba(170,255,0,0.5),0 0 80px rgba(170,255,0,0.2),-4px -4px 0 #000,4px -4px 0 #000,-4px 4px 0 #000,4px 4px 0 #000;
          letter-spacing:0.1em;line-height:1;user-select:none;">${num}</div>
      `;

      // Play subtle tick sound
      if (hitSounds) hitSounds.hit();

      stepIndex++;
      setTimeout(showStep, 600);
    };

    showStep();
  };

  // ── Quick Restart System ──
  // Hold a configurable key (default: LSHIFT) for 500ms to instantly restart
  // Visual progress indicator appears on screen during hold

  /** Get the quick restart key from settings */
  const _getQuickRestartKey = () => {
    return localStorage.getItem('rhythm-os-quick-restart-key') || 'ShiftLeft';
  };

  /** Show quick restart progress overlay */
  const _showQuickRestartOverlay = (progress) => {
    if (!_quickRestartOverlay) {
      const sa = calcSafeArea();
      const overlay = document.createElement('div');
      overlay.id = 'quick-restart-overlay';
      overlay.style.cssText = `position:fixed;left:${sa.x}px;top:${sa.y}px;width:${sa.w}px;height:${sa.h}px;display:flex;align-items:center;justify-content:center;z-index:45;pointer-events:none;`;
      overlay.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;gap:12px;">
          <div style="font-family:var(--zzz-font);font-weight:900;font-size:18px;color:var(--zzz-lime);letter-spacing:0.2em;text-transform:uppercase;text-shadow:0 0 20px rgba(170,255,0,0.4);opacity:0.9;">QUICK RESTART</div>
          <div style="width:200px;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden;">
            <div id="qr-progress" style="width:0%;height:100%;background:var(--zzz-lime);border-radius:2px;transition:width 50ms linear;box-shadow:0 0 8px rgba(170,255,0,0.6);"></div>
          </div>
          <div style="font-family:var(--zzz-mono);font-size:10px;color:var(--zzz-muted);letter-spacing:0.1em;">HOLD TO RESTART</div>
        </div>
      `;
      document.body.appendChild(overlay);
      _quickRestartOverlay = overlay;
    }
    const bar = document.getElementById('qr-progress');
    if (bar) bar.style.width = (progress * 100) + '%';
  };

  /** Remove quick restart overlay */
  const _removeQuickRestartOverlay = () => {
    if (_quickRestartOverlay) {
      _quickRestartOverlay.remove();
      _quickRestartOverlay = null;
    }
  };

  /** Trigger quick restart */
  const _triggerQuickRestart = () => {
    _removeQuickRestartOverlay();
    _quickRestartHeld = false;
    if (currentMapData && gameActive) {
      _skipResult = true;
      _quitGame = true; // Don't save result for quick restart
      endGame();
      startGame(currentMapData);
    }
  };

  // Quick restart keydown/keyup handlers (capture phase, before InputManager)
  window.addEventListener('keydown', (e) => {
    if (!gameActive || _inCountdown || _dying) return;
    const qrKey = _getQuickRestartKey();
    if (e.code === qrKey && !_quickRestartHeld) {
      e.preventDefault();
      e.stopPropagation();
      _quickRestartHeld = true;
      _quickRestartStart = performance.now();
      _showQuickRestartOverlay(0);
    }
  }, true);

  window.addEventListener('keyup', (e) => {
    if (!_quickRestartHeld) return;
    const qrKey = _getQuickRestartKey();
    if (e.code === qrKey) {
      e.preventDefault();
      e.stopPropagation();
      // If held long enough, trigger restart
      const elapsed = performance.now() - _quickRestartStart;
      _quickRestartHeld = false;
      if (elapsed >= QUICK_RESTART_HOLD_MS) {
        _triggerQuickRestart();
      } else {
        _removeQuickRestartOverlay();
      }
    }
  }, true);

  // Animate quick restart progress bar (runs via game loop)
  const _updateQuickRestart = () => {
    if (_quickRestartHeld && _quickRestartOverlay) {
      const elapsed = performance.now() - _quickRestartStart;
      const progress = Math.min(1, elapsed / QUICK_RESTART_HOLD_MS);
      _showQuickRestartOverlay(progress);
      if (progress >= 1) {
        // Auto-trigger if still held (in case keyup missed)
        _triggerQuickRestart();
      }
    }
  };

  // ── Prevent browser defaults on game keys when game is active ──
  // This fixes the issue where keypresses stop working after browser shortcuts
  // (Space scrolling, Tab focus, Ctrl+D bookmark, F5 refresh, etc.)
  window.addEventListener('keydown', (e) => {
    if (!gameActive) return;
    // Block keys that can steal focus or cause browser navigation
    const blockedCodes = ['Space', 'Tab', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'];
    if (blockedCodes.includes(e.code)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
  });

  // ── Rotary Knob Volume Control (overhauled) ──
  let _volumeOverlay = null;
  let _volumeHideTimer = null;
  let _hoveredKnob = null;

  const KNOB_R = 40;
  const KNOB_CIRC = 2 * Math.PI * KNOB_R;
  const KNOB_ARC = KNOB_CIRC * 0.75;
  const KNOB_GAP = KNOB_CIRC - KNOB_ARC;

  const KNOBS = [
    { id: 'system', label: 'SYSTEM', color: '#00E5FF', rgb: '0,229,255', key: 'rhythm-os-game-volume', def: 70 },
    { id: 'master', label: 'MASTER', color: '#AAFF00', rgb: '170,255,0', key: 'rhythm-os-volume', def: 70, isMaster: true },
    { id: 'music',  label: 'MUSIC',  color: '#FF6B9D', rgb: '255,107,157', key: 'rhythm-os-music-volume', def: 100 },
  ];

  const _playVolTick = (volumePercent) => {
    try {
      const actx = audio.ctx;
      if (!actx || actx.state === 'suspended') return;
      const pct = Math.max(0, Math.min(100, volumePercent ?? 50));
      // Map volume percentage to frequency: 200Hz at 0%, 1200Hz at 100%
      const freq = 200 + (pct / 100) * 1000;
      // Soft sine blip with fast decay
      const o = actx.createOscillator();
      const oEnv = actx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq, actx.currentTime);
      o.connect(oEnv);
      oEnv.gain.setValueAtTime(0.22, actx.currentTime);
      oEnv.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.06);
      o.start(); o.stop(actx.currentTime + 0.06);
      oEnv.connect(actx.destination);
    } catch (_) {}
  };

  const _readKnob = (k) => parseInt(localStorage.getItem(k.key) || k.def.toString());
  const _applyKnob = (k, v) => {
    v = Math.max(0, Math.min(100, v));
    localStorage.setItem(k.key, v.toString());
    if (k.id === 'master') audio.setVolume(v / 100);
    else if (k.id === 'system') { if (hitSounds) hitSounds.setVolume(v / 100); EventBus.emit('settings:changed', { key: 'gameVolume', value: v }); }
    else if (k.id === 'music') audio.setMusicVolume(v / 100);
  };

  const _knobSVG = (k, vol, active, size) => {
    const filled = KNOB_ARC * (vol / 100);
    const indAngle = -135 + (vol / 100) * 270;
    const glowA = active ? 0.18 : 0.06;
    const isMaster = k.isMaster;
    const labelSize = isMaster ? 9 : 7;
    return `
    <div class="vol-knob-wrap ${active ? 'vol-knob--active' : ''} ${isMaster ? 'vol-knob--master' : ''}" data-knob="${k.id}">
      <div class="vol-knob-bg" style="width:${size + 16}px;height:${size + 16}px;background:radial-gradient(circle at 50% 45%,rgba(30,30,34,0.96) 0%,rgba(14,14,16,0.98) 100%);border-radius:50%;box-shadow:0 4px 24px rgba(0,0,0,0.55),0 0 0 1px rgba(255,255,255,${active ? 0.09 : 0.04}),inset 0 1px 0 rgba(255,255,255,0.04);display:flex;align-items:center;justify-content:center;transition:box-shadow 0.25s ease,transform 0.2s ease;">
        <svg viewBox="0 0 100 100" width="${size}" height="${size}" style="filter:drop-shadow(0 0 ${active ? 14 : 6}px rgba(${k.rgb},${glowA}));">
          <circle cx="50" cy="50" r="${KNOB_R}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="5"
            stroke-dasharray="${KNOB_ARC} ${KNOB_GAP}" stroke-linecap="round" transform="rotate(135 50 50)" />
          <circle cx="50" cy="50" r="${KNOB_R}" fill="none" stroke="${k.color}" stroke-width="5"
            stroke-linecap="round"
            transform="rotate(135 50 50)" class="vk-prog" data-knob="${k.id}"
            style="stroke-dasharray:${filled} ${KNOB_CIRC};transition:stroke-dasharray 0.15s cubic-bezier(0.25,0.46,0.45,0.94);" />
          <circle cx="50" cy="50" r="28" fill="rgba(14,14,16,0.95)" stroke="rgba(255,255,255,${active ? 0.12 : 0.06})" stroke-width="1.2" class="vk-face" data-knob="${k.id}" />
          <circle cx="50" cy="50" r="25" fill="none" stroke="rgba(255,255,255,0.025)" stroke-width="0.5" />
          <text x="50" y="54" text-anchor="middle" fill="${active ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.35)'}" font-family="var(--zzz-font)" font-weight="800" font-size="${labelSize}" letter-spacing="0.18em" class="vk-inner-label" data-knob="${k.id}">${k.label}</text>
          <line x1="50" y1="50" x2="50" y2="24" stroke="${k.color}" stroke-width="2.5" stroke-linecap="round"
            transform="rotate(${indAngle} 50 50)" class="vk-ind" data-knob="${k.id}"
            style="transition:transform 0.15s cubic-bezier(0.25,0.46,0.45,0.94);" />
          <circle cx="50" cy="50" r="2.5" fill="rgba(255,255,255,0.1)" />
        </svg>
      </div>
      <span class="vk-val" data-knob="${k.id}">${vol}%</span>
      <span class="vk-label" data-knob="${k.id}">${k.label}</span>
    </div>`;
  };

  const _showVol = (activeId = 'master') => {
    if (_volumeOverlay) {
      _volumeOverlay.remove();
      _volumeOverlay = null;
    }
    _volumeHideTimer && clearTimeout(_volumeHideTimer);
    const sa = calcSafeArea();
    // Master knob is larger than the others
    const masterSz = Math.min(100, Math.floor(sa.w * 0.10));
    const smallSz = Math.min(72, Math.floor(sa.w * 0.07));
    const gap = Math.max(12, masterSz * 0.35);
    const padH = Math.max(16, masterSz * 0.3);
    const wrap = document.createElement('div');
    wrap.id = 'volume-overlay';
    // Positioned on the right side of the screen, centered vertically
    wrap.style.cssText = `position:fixed;top:50%;right:${sa.x + 20}px;transform:translateY(-50%) translateX(100%);z-index:200;pointer-events:auto;transition:transform 0.35s cubic-bezier(0.22,1,0.36,1),opacity 0.35s ease;opacity:0;`;
    let knobs = '';
    for (const k of KNOBS) {
      const sz = k.isMaster ? masterSz : smallSz;
      knobs += _knobSVG(k, _readKnob(k), k.id === activeId, sz);
    }
    wrap.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:${gap}px;padding:${padH}px 0;">${knobs}</div>`;
    wrap.querySelectorAll('.vol-knob-wrap').forEach(el => {
      el.addEventListener('mouseenter', () => { _hoveredKnob = el.dataset.knob; _hlKnob(_hoveredKnob); });
      el.addEventListener('mouseleave', () => { _hoveredKnob = null; _hlKnob(null); });
    });
    document.body.appendChild(wrap);
    _volumeOverlay = wrap;
    // Trigger slide-in animation on next frame
    requestAnimationFrame(() => {
      if (_volumeOverlay) {
        _volumeOverlay.style.transform = 'translateY(-50%) translateX(0)';
        _volumeOverlay.style.opacity = '1';
      }
    });
    _volumeHideTimer = setTimeout(_hideVol, 2200);
  };

  const _hlKnob = (id) => {
    if (!_volumeOverlay) return;
    _volumeOverlay.querySelectorAll('.vol-knob-wrap').forEach(el => {
      const on = el.dataset.knob === id;
      el.classList.toggle('vol-knob--active', on);
      const k = KNOBS.find(x => x.id === el.dataset.knob);
      const lbl = el.querySelector('.vk-inner-label');
      const bg = el.querySelector('.vol-knob-bg');
      const face = el.querySelector('.vk-face');
      const vkLabel = el.querySelector('.vk-label');
      if (lbl && k) lbl.setAttribute('fill', on ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.35)');
      if (bg && k) {
        const a = on ? 0.09 : 0.04;
        const gl = on ? 0.35 : 0.18;
        bg.style.boxShadow = `0 4px 24px rgba(0,0,0,0.55),0 0 0 1px rgba(255,255,255,${a}),0 0 ${on ? 16 : 0}px rgba(${k.rgb},${gl}),inset 0 1px 0 rgba(255,255,255,0.04)`;
      }
      if (face && k) face.setAttribute('stroke', `rgba(255,255,255,${on ? 0.12 : 0.06})`);
      if (vkLabel && k) vkLabel.style.color = on ? k.color : 'rgba(255,255,255,0.4)';
    });
  };

  const _updKnob = (id, v) => {
    const filled = KNOB_ARC * (v / 100);
    const ang = -135 + (v / 100) * 270;
    const prog = _volumeOverlay?.querySelector(`.vk-prog[data-knob="${id}"]`);
    if (prog) prog.style.strokeDasharray = `${filled} ${KNOB_CIRC}`;
    const ind = _volumeOverlay?.querySelector(`.vk-ind[data-knob="${id}"]`);
    if (ind) ind.setAttribute('transform', `rotate(${ang} 50 50)`);
    const val = _volumeOverlay?.querySelector(`.vk-val[data-knob="${id}"]`);
    if (val) val.textContent = v + '%';
  };

  const _hideVol = () => {
    if (_volumeOverlay) {
      _volumeOverlay.style.transform = 'translateY(-50%) translateX(100%)';
      _volumeOverlay.style.opacity = '0';
      const ref = _volumeOverlay; _volumeOverlay = null; _hoveredKnob = null;
      setTimeout(() => { if (ref.parentNode) ref.remove(); }, 400);
    }
  };

  const _adjKnob = (id, delta) => {
    const k = KNOBS.find(x => x.id === id);
    if (!k) return;
    const cur = _readKnob(k);
    const nv = Math.max(0, Math.min(100, cur + delta));
    if (nv === cur) return;
    _applyKnob(k, nv);
    _playVolTick(nv);
    if (!_volumeOverlay) _showVol(id);
    else {
      _hlKnob(id);
      _volumeHideTimer && clearTimeout(_volumeHideTimer);
      _volumeHideTimer = setTimeout(_hideVol, 2200);
    }
    _updKnob(id, nv);
  };

  // Hover on knob + scroll wheel = change that knob's volume
  window.addEventListener('wheel', (e) => {
    // Alt + scroll anywhere = Master Volume
    if (e.altKey) {
      e.preventDefault(); e.stopPropagation();
      const d = e.deltaY > 0 ? -3 : 3;
      _adjKnob('master', d);
      return;
    }
    // Hover on knob + scroll = that knob's volume
    if (_hoveredKnob && _volumeOverlay) {
      e.preventDefault(); e.stopPropagation();
      const d = e.deltaY > 0 ? -3 : 3;
      _adjKnob(_hoveredKnob, d);
    }
  }, { passive: false });

  // Block Ctrl+key and Meta+key combinations (but allow plain Alt for volume)
  window.addEventListener('keydown', (e) => {
    if (!gameActive) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true); // capture phase — runs before InputManager's handler

  // Keep focus on document.body during gameplay — prevent any element from stealing focus
  // This catches clicks that land on overlay divs, canvases, or any other element
  document.addEventListener('mousedown', () => {
    if (gameActive && document.activeElement && document.activeElement !== document.body && document.activeElement !== document.documentElement) {
      document.activeElement.blur();
    }
  });

  // Keep focus on the game when window regains focus during gameplay
  window.addEventListener('focus', () => {
    if (gameActive) {
      // Re-assert input manager is enabled
      if (!input._enabled) input.enable();
      // Clear stale key states from before the tab switch
      input._active.clear();
      // Resume AudioContext if browser suspended it
      if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
    }
  });

  // Auto-pause when tab becomes hidden (prevents audio desync and stale input state)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && gameActive && !_dying && !_inCountdown) {
      pauseGame();
    }
  });

  // Prevent context menu during gameplay (right-click)
  window.addEventListener('contextmenu', (e) => {
    if (gameActive) e.preventDefault();
  });

  EventBus.on('game:pause', pauseGame);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      e.preventDefault();
      if (_pauseSettingsInstance) { _pauseSettingsInstance._closeOverlay(); return; }
      if (_pauseOverlay) {
        if (_deadPause) {
          // Game over menu — ESC does nothing (must use buttons)
          return;
        }
        _closePause();
        resumeGame();
        return;
      }
      if (_inCountdown) {
        // During countdown after resume — cancel countdown and show pause menu
        const cd = document.getElementById('countdown-overlay');
        if (cd) cd.remove();
        _inCountdown = false;
        // Stop the game loop (it was running for the countdown)
        if (gameLoop) gameLoop.stop();
        // Now gameActive is still true from resumeGame(), so pauseGame() will work
        pauseGame();
        return;
      }
      if (gameActive) { pauseGame(); }
    }
  });

  // Particle visibility control: only show on main menu
  three.setParticlesVisible(true);
  EventBus.on('screen:change', ({ to }) => {
    three.setParticlesVisible(to === 'main-menu');
    // Reset cursor BPM when leaving song select (no song playing)
    if (to !== 'song-select') GameCursor.setBPM(0);
  });

  // Sync cursor BPM with selected song
  EventBus.on('song:select', ({ map }) => {
    if (map && map.difficulties) {
      const diff = map.difficulties[0];
      if (diff?.metadata?.bpm) GameCursor.setBPM(diff.metadata.bpm);
    }
  });

  screens.register('main-menu', () => new MainMenu({ audio, screens }));
  let _songSelectInstance = null;
  screens.register('song-select', () => {
    if (_songSelectInstance) {
      _songSelectInstance._reenable();
      return _songSelectInstance;
    }
    _songSelectInstance = new SongSelect({ audio, three, screens });
    return _songSelectInstance;
  });
  screens.register('settings', () => new Settings({ audio, input, screens, overlayMode: true }));
  screens.register('result', (data) => {
    const rs = new ResultScreen({ screens });
    if (data && data.historyRecord) {
      // Viewing a historical record from song select
      rs.setupHistory(data.setId, data.diffVersion, data.historyRecord, data.map);
    } else if (data && data.stats) {
      rs.setStats(data.stats, data.map);
    }
    return rs;
  });
  screens.register('game', (data) => { if (data && data.map) startGame(data.map); return { build: () => '', init: () => {}, destroy: () => {} }; });

  // ── Custom Cursor ──
  GameCursor.init();

  // ── Loading Screen ──
  // Show loading screen, preload resources, then transition to main menu
  const loadingScreen = new LoadingScreen({
    onReady: () => {
      // Resume audio context on user click
      audio._ensureCtx();
      if (hitSounds) hitSounds.gameStart();
      loadingScreen.destroy();
      screens.show('main-menu');
    }
  });
  screens.register('loading', () => loadingScreen);
  screens.show('loading');

  // Preload hit sounds in the background
  const loadingContainer = document.getElementById('screen');
  const doLoad = async () => {
    try {
      // Wait a frame so the loading screen renders
      await new Promise(r => requestAnimationFrame(r));

      if (loadingScreen.setProgress) loadingScreen.setProgress(5);
      if (loadingScreen.setDetails) loadingScreen.setDetails('Initializing audio...');

      // Ensure AudioContext (may need user gesture on mobile)
      audio._ensureCtx();

      if (loadingScreen.setProgress) loadingScreen.setProgress(15);
      if (loadingScreen.setDetails) loadingScreen.setDetails('Loading hit sounds...');

      // Preload hit sound files
      if (audio.ctx) {
        await preloadHitSounds(audio.ctx);
      }

      if (loadingScreen.setProgress) loadingScreen.setProgress(70);
      if (loadingScreen.setDetails) loadingScreen.setDetails('Initializing renderer...');

      // Small delay to let renderer warm up
      await new Promise(r => setTimeout(r, 300));

      if (loadingScreen.setProgress) loadingScreen.setProgress(85);
      if (loadingScreen.setDetails) loadingScreen.setDetails('Setting up scene...');

      // Ensure ThreeScene is ready
      three.update(performance.now());
      noteRenderer.clear();

      if (loadingScreen.setProgress) loadingScreen.setProgress(95);
      if (loadingScreen.setDetails) loadingScreen.setDetails('Almost ready...');

      await new Promise(r => setTimeout(r, 200));

      if (loadingScreen.setProgress) loadingScreen.setProgress(100);
      if (loadingScreen.setDetails) loadingScreen.setDetails('Ready!');

      // Show the "Click to Start" button
      await new Promise(r => setTimeout(r, 300));
      if (loadingScreen.complete) loadingScreen.complete();
    } catch (err) {
      console.error('[RHYMIX] Loading error:', err);
      // Even on error, show the start button
      if (loadingScreen.setProgress) loadingScreen.setProgress(100);
      if (loadingScreen.complete) loadingScreen.complete();
    }
  };
  doLoad();

  const bgLoop = () => {
    if (!gameActive) three.update(performance.now());
    requestAnimationFrame(bgLoop);
  };
  bgLoop();

  noteRenderer.clear();
  window.addEventListener('resize', () => {
    updateSafeArea(); three.resize();
    if (!gameActive) noteRenderer.clear();
  });

  console.log('[RHYMIX] Ready!');
}

boot().catch(err => console.error('[RHYMIX] Boot failed:', err));
