import ZZZTheme      from './theme/ZZZTheme.js';
import AudioEngine   from './core/AudioEngine.js';
import ThreeScene    from './scene/ThreeScene.js';
import GameLoop      from './core/GameLoop.js';
import InputManager  from './core/InputManager.js';
import EventBus      from './core/EventBus.js';
import HitSounds     from './game/HitSounds.js';
import BeatMap       from './game/BeatMap.js';
import JudgementSystem from './game/JudgementSystem.js';
import NoteRenderer  from './game/NoteRenderer.js';
import JudgementDisplay from './ui/JudgementDisplay.js';
import HUD           from './ui/HUD.js';
import ScreenManager from './ui/ScreenManager.js';
import LatencyCalibrator from './game/LatencyCalibrator.js';
import MainMenu      from './ui/screens/MainMenu.js';
import SongSelect    from './ui/screens/SongSelect.js';
import Settings      from './ui/screens/Settings.js';
import ResultScreen  from './ui/screens/ResultScreen.js';

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
  console.log('[RHYTHM::OS] Booting...');

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
    crtSwitch: () => { const s = initAudio(); if(s) s.crtSwitch(); }
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
  let _deathTimeout = null; // timeout ID for death sequence → endGame
  let _skipResult = false;  // when true, endGame() rAF won't show result screen (restart)
  let currentMapData = null;
  let currentLaneCount = 4;

  const savedVolume = parseInt(localStorage.getItem('rhythm-os-volume') || '70') / 100;
  audio._ensureCtx();
  audio.setVolume(savedVolume);

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
      bpmChanges: (map.bpmChanges || []).map(b => ({ ...b, time: b.time + LEAD_IN }))
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

    if (map.backgroundUrl) noteRenderer.setBackgroundImage(map.backgroundUrl);
    else noteRenderer.clearBackground();

    // Enable lead-in offset for video sync (game has 1s silence prepended to audio)
    three._leadInOffset = LEAD_IN;

    // Use video background if available, otherwise use image background
    if (map.videoUrl) {
      three.setBackgroundVideo(map.videoUrl, audio);
    } else if (map.backgroundUrl) {
      three.setBackgroundImage(map.backgroundUrl);
    } else {
      three._clearBackgroundImage();
      three._clearBackgroundVideo();
    }

    // Start the game immediately — the song-select transition already
    // provides the visual delay. Audio starts only in _actuallyStartGame.
    _actuallyStartGame(shiftedMap);
  };

  const _actuallyStartGame = (map) => {
    const hitHandler = ({ lane, hitTime }) => {
      if (!gameActive) return;
      const result = currentJudgement.judgeHit(lane, hitTime);

      // Always show a visual effect on the lane when a key is pressed
      const pos = noteRenderer.getLaneHitPosition(lane, currentLaneCount);

      if (result) {
        // Note was hit — show judgment-colored effect + lane glow
        const effectColors = { perfect: '#AAFF00', great: '#00E5FF', good: '#F5C518', bad: '#FF8C00' };
        noteRenderer.addEffect(pos.x, pos.y, effectColors[result.judgement] || '#AAFF00', result.judgement);
        // Project Sekai-style lane glow on hit
        noteRenderer.addLaneGlow(lane, currentLaneCount, effectColors[result.judgement] || '#AAFF00');

        if (hitSounds) {
          if (result.judgement === 'perfect') hitSounds.perfect();
          else if (result.judgement !== 'miss') hitSounds.hit();
        }
        judgementDisplay.checkMilestone(currentJudgement.combo);
        if (hitSounds && [50, 100, 200, 500].includes(currentJudgement.combo)) hitSounds.milestone(currentJudgement.combo);
      } else {
        // Empty key press — still play quiet sound and show subtle visual feedback
        if (hitSounds) hitSounds.emptyHit();
        noteRenderer.addLaneGlow(lane, currentLaneCount, '#FFFFFF');
      }
    };

    const missHandler = () => { if (!gameActive) return; if (hitSounds) hitSounds.miss(); };
    const comboBreakHandler = ({ combo }) => { judgementDisplay.showComboBreak(combo); };

    const releaseHandler = ({ lane, releaseTime }) => {
      if (!gameActive) return;
      const result = currentJudgement.judgeRelease(lane, releaseTime);
      if (!result) return;

      const pos = noteRenderer.getLaneHitPosition(lane, currentLaneCount);
      const effectColors = { perfect: '#AAFF00', great: '#00E5FF', good: '#F5C518', bad: '#FF8C00' };
      noteRenderer.addEffect(pos.x, pos.y, effectColors[result.judgement] || '#AAFF00', result.judgement);

      if (hitSounds && result.judgement !== 'bad' && result.judgement !== 'miss') hitSounds.hit();
      judgementDisplay.checkMilestone(currentJudgement.combo);
    };

    EventBus.on('input:hit', hitHandler);
    EventBus.on('input:release', releaseHandler);
    EventBus.on('note:miss', missHandler);
    EventBus.on('combo:break', comboBreakHandler);

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

    let health = 100;
    gameLoop = new GameLoop({
      update(delta) {
        if (!gameActive) return;
        const ct = audio.currentTime; // Single source of truth: game time = audio time
        // During countdown (after resume), skip game logic
        if (_inCountdown) return;
        currentJudgement.checkMisses(ct);
        health = Math.max(0, Math.min(100, 100 - currentJudgement.hitCounts.miss * 5 + currentJudgement.hitCounts.perfect * 0.3));
        const stats = currentJudgement.getStats();
        stats.health = health;
        noteRenderer.setHealth(health);
        hud.update(stats);

        // Progress bar
        if (audioDuration > 0) {
          hud.setProgress(Math.min(1, ct / audioDuration));
        }

        // End map when audio finishes (or health depleted)
        const songFinished = !audio.isPlaying || (audioDuration > 0 && ct >= audioDuration - 0.1);
        if (songFinished) {
          // Don't end if audio hasn't actually started yet
          if (ct > 0.5) endGame();
        }
        // Death: HP depleted — start death sequence (once only)
        if (health <= 0 && !_dying) {
          _dying = true;
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
          // After music finishes slowing, show result
          _deathTimeout = setTimeout(() => endGame(), 2800);
        }
      },
      render(delta) {
        if (!gameActive) return;
        const ct = audio.currentTime;
        noteRenderer.render({ notes: currentBeatMap.getNotesInWindow(ct), currentTime: ct, laneCount: currentLaneCount, delta });
        three.update(performance.now());
      }
    });
    gameLoop.start();
    EventBus.emit('game:start', { map });

    startGame._cleanup = () => {
      EventBus.off('input:hit', hitHandler);
      EventBus.off('input:release', releaseHandler);
      EventBus.off('note:miss', missHandler);
      EventBus.off('combo:break', comboBreakHandler);
    };
  };

  const endGame = () => {
    if (_endingGame) return;  // prevent double-call
    _endingGame = true;
    _inCountdown = false;
    _dying = false;
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
    hud.hide();
    noteRenderer.clearBackground();
    noteRenderer.clear();
    noteRenderer.clearLaneGlows();
    three._clearBackgroundImage();
    three._clearBackgroundVideo();
    three._leadInOffset = 0; // Reset lead-in offset for preview mode
    if (startGame._cleanup) { startGame._cleanup(); startGame._cleanup = null; }
    const stats = currentJudgement.getStats();
    // Save local record
    if (currentMapData && stats) {
      try {
        const setId = currentMapData.metadata?.setId || currentMapData.metadata?.title || '';
        const diffVersion = currentMapData.metadata?.version || '';
        const key = `rhythm-record-${setId}-${diffVersion.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const existing = JSON.parse(localStorage.getItem(key) || 'null');
        if (!existing || stats.score > existing.score) {
          localStorage.setItem(key, JSON.stringify({ score: stats.score, rank: stats.rank }));
        }
      } catch (_) {}
    }
    EventBus.emit('game:over', stats);
    // Use a small delay to ensure ScreenManager transition completes
    // and avoid race conditions with the game loop's requestAnimationFrame
    requestAnimationFrame(() => {
      _endingGame = false;
      // If restart was triggered, skip showing the result screen
      if (_skipResult) { _skipResult = false; return; }
      screens.show('result', { stats, map: currentMapData });
    });
  };

  let _pauseOverlay = null;
  let _pauseSettingsInstance = null;

  const pauseGame = () => {
    if (!gameActive) return;
    gameActive = false;
    audio.pause();
    if (gameLoop) gameLoop.stop();
    three.pauseVideo();

    const sa = calcSafeArea();
    const overlay = document.createElement('div');
    overlay.id = 'pause-overlay';
    overlay.style.cssText = `position:fixed;left:${sa.x}px;top:${sa.y}px;width:${sa.w}px;height:${sa.h}px;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:50;animation:pause-fade-in 0.2s ease-out forwards;`;
    overlay.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:24px;animation:pause-panel-in 0.3s cubic-bezier(0.22,1,0.36,1) forwards;">
        <div style="font-family:var(--zzz-font);font-weight:900;font-size:14px;color:var(--zzz-muted);letter-spacing:0.3em;text-transform:uppercase;">PAUSED</div>
        <div style="display:flex;flex-direction:column;gap:12px;min-width:240px;">
          <button class="zzz-btn zzz-btn--primary" id="resume-btn" style="width:100%;font-size:15px;padding:14px 32px;">▶ RESUME</button>
          <button class="zzz-btn" id="restart-btn" style="width:100%;border-color:var(--zzz-lime);color:var(--zzz-lime);">↻ RESTART</button>
          <button class="zzz-btn" id="settings-btn" style="width:100%;">⚙ SETTINGS</button>
          <div style="height:1px;background:var(--zzz-graphite);margin:4px 0;"></div>
          <button class="zzz-btn zzz-btn--danger" id="quit-btn" style="width:100%;">✕ QUIT</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    _pauseOverlay = overlay;

    document.getElementById('resume-btn').addEventListener('click', () => { _closePause(); resumeGame(); });
    document.getElementById('restart-btn').addEventListener('click', () => { _closePause(); _skipResult = true; endGame(); startGame(currentMapData); });
    document.getElementById('settings-btn').addEventListener('click', () => { _openPauseSettings(); });
    document.getElementById('quit-btn').addEventListener('click', () => { _closePause(); _skipResult = true; endGame(); screens.show('song-select'); });
    EventBus.emit('game:pause');
  };

  const _closePause = () => {
    if (_pauseSettingsInstance) { _pauseSettingsInstance.destroy(); _pauseSettingsInstance = null; }
    if (_pauseOverlay) { _pauseOverlay.remove(); _pauseOverlay = null; }
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

    document.getElementById('pause-settings-close').addEventListener('click', _closePauseSettings);
    document.getElementById('pause-settings-bg').addEventListener('click', _closePauseSettings);
  };

  const _closePauseSettings = () => {
    const panel = document.getElementById('pause-settings');
    if (panel) panel.remove();
    if (_pauseSettingsInstance) { _pauseSettingsInstance.destroy(); _pauseSettingsInstance = null; }
    if (_pauseOverlay) _pauseOverlay.style.display = '';
    // Re-apply safe area in case aspect ratio changed
    updateSafeArea();
  };

  EventBus.on('settings:close-overlay', () => { _closePauseSettings(); });

  EventBus.on('settings:open-overlay', () => {
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
    if (gameLoop) gameLoop.start();

    // 3-2-1 countdown (3 beats at ~600ms each = 1.8s total)
    const steps = ['3', '2', '1'];
    let stepIndex = 0;

    const showStep = () => {
      if (stepIndex >= steps.length) {
        // Countdown done — NOW resume audio and video for real
        countdownOverlay.remove();
        _inCountdown = false;
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

  EventBus.on('game:pause', pauseGame);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      e.preventDefault();
      if (_pauseSettingsInstance) { _closePauseSettings(); return; }
      if (_pauseOverlay) { _closePause(); resumeGame(); return; }
      if (_inCountdown) {
        // During countdown after resume — re-pause
        const cd = document.getElementById('countdown-overlay');
        if (cd) cd.remove();
        _inCountdown = false;
        gameActive = false;
        audio.pause();
        if (gameLoop) gameLoop.stop();
        three.pauseVideo();
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
  });

  screens.register('main-menu', () => new MainMenu({ audio, screens }));
  screens.register('song-select', () => new SongSelect({ audio, three, screens }));
  screens.register('settings', () => new Settings({ audio, input, screens, overlayMode: true }));
  screens.register('result', (data) => { const rs = new ResultScreen({ screens }); if (data && data.stats) rs.setStats(data.stats, data.map); return rs; });
  screens.register('game', (data) => { if (data && data.map) startGame(data.map); return { build: () => '', init: () => {}, destroy: () => {} }; });

  screens.show('main-menu');

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

  console.log('[RHYTHM::OS] Ready!');
}

boot().catch(err => console.error('[RHYTHM::OS] Boot failed:', err));
