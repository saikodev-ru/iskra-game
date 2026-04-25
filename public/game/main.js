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
  audio._ensureCtx();
  audio.setVolume(savedVolume);
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

    // Only use canvas background when ThreeScene has no background
    if (!map.videoUrl && !map.backgroundUrl) noteRenderer.clearBackground();
    else noteRenderer.clearBackground();

    // Enable lead-in offset for video sync (game has 1s silence prepended to audio)
    three._leadInOffset = LEAD_IN;

    // Hide Three.js dark gradient bg mesh to prevent "double background"
    // (NoteRenderer's lane fills will be the only visible background)
    three.hideBgMesh();

    // Use video background if available, otherwise use image background
    if (map.videoUrl) {
      three.setBackgroundVideo(map.videoUrl, audio);
    } else if (map.backgroundUrl) {
      three.setBackgroundImage(map.backgroundUrl);
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
        const ct = audio.currentTime; // Single source of truth: game time = audio time
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
          currentJudgement._died = true; // Force D rank
          if (hitSounds) hitSounds.fail();
          input.disable();
          // Slow music down over 2.5 seconds
          audio.slowDown(2.5);
          // Slow note scroll to a crawl
          noteRenderer.scrollSpeed = 40; // was ~400
          // Break the game canvases (CSS animation)
          const gameCanvas = document.getElementById('game');
          const threeCanvas = document.getElementById('three');
          if (gameCanvas) gameCanvas.classList.add('dying');
          if (threeCanvas) threeCanvas.classList.add('dying');
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
            const gameCanvas = document.getElementById('game');
            const threeCanvas = document.getElementById('three');
            if (gameCanvas) gameCanvas.classList.remove('dying');
            if (threeCanvas) threeCanvas.classList.remove('dying');
            noteRenderer.scrollSpeed = 400;
            // Show pause menu without Continue button (mark as quit so result not saved)
            _quitGame = true;
            pauseGame({ noResume: true });
          }, 2800);
        }
      },
      render(delta) {
        if (!gameActive) return;
        const ct = audio.currentTime;
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
    // Remove dying classes from canvases
    const gameCanvas = document.getElementById('game');
    const threeCanvas = document.getElementById('three');
    if (gameCanvas) gameCanvas.classList.remove('dying');
    if (threeCanvas) threeCanvas.classList.remove('dying');
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
    if (_pauseOverlay) _pauseOverlay.style.display = '';
    // Re-apply safe area in case aspect ratio changed
    updateSafeArea();
  };

  EventBus.on('settings:open-overlay', () => {
    const settings = new Settings({ audio, input, screens, overlayMode: true });
    // No _onClose — Settings._closeOverlay will use screens._closeOverlay (main menu context)
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

  // ── osu!-style Volume Control (LAlt + Mouse Wheel) ──
  let _volumeOverlay = null;
  let _volumeHideTimer = null;

  const _showVolumeOverlay = () => {
    const vol = parseInt(localStorage.getItem('rhythm-os-volume') || '70');
    if (_volumeOverlay) _volumeOverlay.remove();
    _volumeHideTimer && clearTimeout(_volumeHideTimer);
    const sa = calcSafeArea();
    const overlay = document.createElement('div');
    overlay.id = 'volume-overlay';
    overlay.style.cssText = `position:fixed;bottom:${sa.y + 60}px;left:50%;transform:translateX(-50%);z-index:200;pointer-events:none;animation:pause-fade-in 0.15s ease-out forwards;`;
    overlay.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;padding:12px 24px;border-radius:14px;background:rgba(0,0,0,0.88);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.06);">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 15 20 9"/><line x1="4" y1="9" x2="20" y2="9"/></svg>
        <div style="width:180px;height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;">
          <div id="vol-bar" style="width:${vol}%;height:100%;border-radius:3px;background:linear-gradient(90deg,var(--zzz-lime),rgba(200,255,100,0.9));box-shadow:0 0 10px rgba(170,255,0,0.4);transition:width 0.06s linear;"></div>
        </div>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 19 18 15 22 9 4 9 20"/><line x1="4" y1="15" x2="20" y2="15"/></svg>
        <div id="vol-pct" style="font-family:var(--zzz-font);font-weight:900;font-size:13px;color:rgba(255,255,255,0.55);min-width:32px;text-align:center;letter-spacing:0.05em;">${vol}%</div>
      </div>
    `;
    document.body.appendChild(overlay);
    _volumeOverlay = overlay;
    _volumeHideTimer = setTimeout(_hideVolumeOverlay, 1200);
  };

  const _updateVolumeOverlay = (vol) => {
    const bar = document.getElementById('vol-bar');
    const pct = document.getElementById('vol-pct');
    if (bar) bar.style.width = vol + '%';
    if (pct) pct.textContent = vol + '%';
  };

  const _hideVolumeOverlay = () => {
    if (_volumeOverlay) {
      _volumeOverlay.style.transition = 'opacity 0.25s ease-out';
      _volumeOverlay.style.opacity = '0';
      const ref = _volumeOverlay;
      _volumeOverlay = null;
      setTimeout(() => { if (ref.parentNode) ref.remove(); }, 300);
    }
  };

  const _adjustVolume = (delta) => {
    let vol = parseInt(localStorage.getItem('rhythm-os-volume') || '70');
    vol = Math.max(0, Math.min(100, vol + delta));
    localStorage.setItem('rhythm-os-volume', vol.toString());
    audio.setVolume(vol / 100);
    if (hitSounds) hitSounds.setVolume(vol / 100);
    _showVolumeOverlay();
    _updateVolumeOverlay(vol);
  };

  // LAlt + wheel: osu!-style volume control
  window.addEventListener('wheel', (e) => {
    if (!e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -5 : 5; // scroll down = volume up
    _adjustVolume(delta);
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
