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
  three.setSafeArea(initialSA.x, initialSA.y, initialSA.w, initialSA.h);
  const applySafeAreaToContainers = (sa) => {
    [screenContainer, hudContainer, judgementContainer].forEach(c => {
      c.style.left = sa.x + 'px'; c.style.top = sa.y + 'px';
      c.style.width = sa.w + 'px'; c.style.height = sa.h + 'px';
    });
  };
  applySafeAreaToContainers(initialSA);

  let gameLoop = null, currentBeatMap = null, currentJudgement = null, gameActive = false;
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
    }
  });

  const startGame = (map) => {
    if (gameActive) endGame();
    initAudio();

    currentMapData = map;
    currentBeatMap = new BeatMap(map);
    currentJudgement = new JudgementSystem(currentBeatMap);
    currentJudgement.reset();

    input.setLaneCount(currentBeatMap.laneCount);
    currentLaneCount = currentBeatMap.laneCount;
    const scrollSpeed = parseInt(localStorage.getItem('rhythm-os-scroll-speed') || '400');
    noteRenderer.scrollSpeed = scrollSpeed;
    noteRenderer.resize();

    if (map.backgroundUrl) noteRenderer.setBackgroundImage(map.backgroundUrl);
    else noteRenderer.clearBackground();

    // Use the same Three.js background system for gameplay
    if (map.backgroundUrl) three.setBackgroundImage(map.backgroundUrl);
    else three._clearBackgroundImage();

    _showCountdown(() => _actuallyStartGame(map));
  };

  const _showCountdown = (callback) => {
    const overlay = document.createElement('div');
    overlay.id = 'countdown-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:50;background:rgba(17,17,17,0.7);';
    overlay.innerHTML = '<div class="zzz-title" style="font-size:100px;color:var(--zzz-lime);text-shadow:0 0 50px rgba(170,255,0,0.5);">3</div>';
    document.body.appendChild(overlay);
    let count = 3;
    const el = overlay.firstElementChild;
    const tick = () => {
      count--;
      if (count > 0) { el.textContent = count; el.style.animation = 'none'; void el.offsetHeight; el.style.animation = ''; }
      else { el.textContent = 'GO!'; el.style.color = 'var(--zzz-yellow)'; setTimeout(() => { overlay.remove(); callback(); }, 400); return; }
      setTimeout(tick, 800);
    };
    setTimeout(tick, 800);
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

    if (map.audioBuffer) {
      audio.play(map.audioBuffer);
      const vol = parseInt(localStorage.getItem('rhythm-os-volume') || '70') / 100;
      audio.fadeTo(vol, 0.1);
    }

    audio.startBeatScheduler(currentBeatMap.metadata.bpm);

    let health = 100;
    gameLoop = new GameLoop({
      update(delta) {
        if (!gameActive) return;
        const ct = audio.currentTime;
        currentJudgement.checkMisses(ct);
        health = Math.max(0, Math.min(100, 100 - currentJudgement.hitCounts.miss * 5 + currentJudgement.hitCounts.perfect * 0.3));
        const stats = currentJudgement.getStats();
        stats.health = health;
        noteRenderer.setHealth(health);
        hud.update(stats);
        if (currentBeatMap.notes.length > 0) {
          const last = currentBeatMap.notes[currentBeatMap.notes.length - 1];
          hud.setProgress(Math.min(1, ct / (last.time + last.duration + 2)));
        }
        if (currentJudgement.isComplete(ct) || health <= 0) {
          if (health <= 0 && hitSounds) hitSounds.fail();
          endGame();
        }
      },
      render() {
        if (!gameActive) return;
        const ct = audio.currentTime;
        noteRenderer.render({ notes: currentBeatMap.getNotesInWindow(ct), currentTime: ct, laneCount: currentLaneCount });
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
    gameActive = false;
    input.disable();
    if (gameLoop) { gameLoop.stop(); gameLoop = null; }
    audio.stop();
    audio.stopBeatScheduler();
    hud.hide();
    noteRenderer.clearBackground();
    noteRenderer.clear();
    noteRenderer.clearLaneGlows();
    three._clearBackgroundImage();
    if (startGame._cleanup) { startGame._cleanup(); startGame._cleanup = null; }
    const stats = currentJudgement.getStats();
    EventBus.emit('game:over', stats);
    screens.show('result', { stats, map: currentMapData });
  };

  let _pauseOverlay = null;
  let _pauseSettingsInstance = null;

  const pauseGame = () => {
    if (!gameActive) return;
    gameActive = false;
    audio.pause();
    if (gameLoop) gameLoop.stop();

    const sa = calcSafeArea();
    const overlay = document.createElement('div');
    overlay.id = 'pause-overlay';
    overlay.style.cssText = `position:fixed;left:${sa.x}px;top:${sa.y}px;width:${sa.w}px;height:${sa.h}px;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:50;animation:pause-fade-in 0.2s ease-out forwards;`;
    overlay.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:24px;animation:pause-panel-in 0.3s cubic-bezier(0.22,1,0.36,1) forwards;">
        <div style="font-family:var(--zzz-font);font-weight:900;font-size:14px;color:var(--zzz-muted);letter-spacing:0.3em;text-transform:uppercase;">PAUSED</div>
        <div style="display:flex;flex-direction:column;gap:12px;min-width:240px;">
          <button class="zzz-btn zzz-btn--primary" id="resume-btn" style="width:100%;font-size:15px;padding:14px 32px;">▶ RESUME</button>
          <button class="zzz-btn" id="settings-btn" style="width:100%;">⚙ SETTINGS</button>
          <div style="height:1px;background:var(--zzz-graphite);margin:4px 0;"></div>
          <button class="zzz-btn zzz-btn--danger" id="quit-btn" style="width:100%;">✕ QUIT</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    _pauseOverlay = overlay;

    document.getElementById('resume-btn').addEventListener('click', () => { _closePause(); resumeGame(); });
    document.getElementById('settings-btn').addEventListener('click', () => { _openPauseSettings(); });
    document.getElementById('quit-btn').addEventListener('click', () => { _closePause(); endGame(); screens.show('song-select'); });
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

  const resumeGame = () => {
    gameActive = true;
    audio.resume();
    const vol = parseInt(localStorage.getItem('rhythm-os-volume') || '70') / 100;
    audio.fadeTo(vol, 0.1);
    if (gameLoop) gameLoop.start();
    EventBus.emit('game:resume');
  };

  EventBus.on('game:pause', pauseGame);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      e.preventDefault();
      if (_pauseSettingsInstance) { _closePauseSettings(); return; }
      if (_pauseOverlay) { _closePause(); resumeGame(); return; }
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
  screens.register('settings', () => new Settings({ audio, input, screens }));
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
