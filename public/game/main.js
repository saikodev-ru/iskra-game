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

// ── Safe area calculation for aspect ratio ──
function calcSafeArea() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const ar = localStorage.getItem('rhythm-os-aspect-ratio') || '16:9';
  const resScale = parseInt(localStorage.getItem('rhythm-os-res-scale') || '100') / 100;

  let targetW, targetH;
  if (ar === 'Fill') {
    targetW = w; targetH = h;
  } else {
    const parts = ar.split(':');
    const arW = parseInt(parts[0]) || 16;
    const arH = parseInt(parts[1]) || 9;
    const targetAR = arW / arH;
    const screenAR = w / h;
    if (screenAR > targetAR) {
      targetH = h;
      targetW = h * targetAR;
    } else {
      targetW = w;
      targetH = w / targetAR;
    }
  }
  targetW = Math.round(targetW * resScale);
  targetH = Math.round(targetH * resScale);

  const x = Math.round((w - targetW) / 2);
  const y = Math.round((h - targetH) / 2);
  return { x, y, w: targetW, h: targetH };
}

async function boot() {
  console.log('[RHYTHM::OS] Booting...');

  // ── Cleanup any previous instance (HMR safety) ──
  if (window.__rhythmOsBooted) {
    console.warn('[RHYTHM::OS] Previous instance detected, cleaning up...');
    try {
      // Dispose any old ThreeScene instances to free WebGL contexts
      if (window.__threeSceneInstances) {
        for (const inst of window.__threeSceneInstances) {
          try { inst.dispose(); } catch (_) {}
        }
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

  // Apply saved aspect ratio to 3D scene
  const savedAR = localStorage.getItem('rhythm-os-aspect-ratio') || '16:9';
  const savedResScale = parseInt(localStorage.getItem('rhythm-os-res-scale') || '100') / 100;
  three.setAspectRatio(savedAR);
  three.setResScale(savedResScale);

  const gameCanvas = document.getElementById('game');
  const noteRenderer = new NoteRenderer(gameCanvas);
  const safeArea = calcSafeArea();
  noteRenderer.setSafeArea(safeArea.x, safeArea.y, safeArea.w, safeArea.h);

  const input = new InputManager(audio);
  const calibrator = new LatencyCalibrator(audio);
  const hudContainer = document.getElementById('hud');
  const hud = new HUD(hudContainer);
  const judgementContainer = document.getElementById('judgement-overlay');
  const judgementDisplay = new JudgementDisplay(judgementContainer);
  const screenContainer = document.getElementById('screen');
  const screens = new ScreenManager(screenContainer);

  let gameLoop = null, currentBeatMap = null, currentJudgement = null, gameActive = false;
  let currentMapData = null;

  // ── Apply saved volume on boot ──
  const savedVolume = parseInt(localStorage.getItem('rhythm-os-volume') || '70') / 100;
  audio._ensureCtx();
  audio.setVolume(savedVolume);

  // ── Safe area + 3D update helper ──
  const updateSafeArea = () => {
    const sa = calcSafeArea();
    noteRenderer.setSafeArea(sa.x, sa.y, sa.w, sa.h);
    noteRenderer.resize();
  };

  EventBus.on('settings:changed', ({ key, value }) => {
    if (key === 'aspectRatio') {
      updateSafeArea();
      three.setAspectRatio(value);
    } else if (key === 'resScale') {
      updateSafeArea();
      three.setResScale(parseInt(value) / 100);
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
    const scrollSpeed = parseInt(localStorage.getItem('rhythm-os-scroll-speed') || '400');
    noteRenderer.scrollSpeed = scrollSpeed;
    noteRenderer.resize();

    if (map.backgroundUrl) noteRenderer.setBackgroundImage(map.backgroundUrl);
    else noteRenderer.clearBackground();

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
      else { el.textContent = 'GO!'; el.style.color = 'var(--zzz-yellow)'; el.style.textShadow = '0 0 50px rgba(245,197,24,0.5)'; setTimeout(() => { overlay.remove(); callback(); }, 400); return; }
      setTimeout(tick, 800);
    };
    setTimeout(tick, 800);
  };

  const _actuallyStartGame = (map) => {
    const hitHandler = ({ lane, hitTime }) => {
      if (!gameActive) return;
      const result = currentJudgement.judgeHit(lane, hitTime);
      if (!result) return;

      const pos = noteRenderer.getLaneHitPosition(lane, currentBeatMap.laneCount);
      const effectColors = { perfect: '#AAFF00', great: '#00E5FF', good: '#F5C518', bad: '#FF8C00' };
      noteRenderer.addEffect(pos.x, pos.y, effectColors[result.judgement] || '#AAFF00', result.judgement);
      noteRenderer.flashLane(lane);

      if (hitSounds) { if (result.judgement === 'perfect') hitSounds.perfect(); else if (result.judgement !== 'miss') hitSounds.hit(); }

      judgementDisplay.checkMilestone(currentJudgement.combo);
      if (hitSounds && [50, 100, 200, 500].includes(currentJudgement.combo)) hitSounds.milestone(currentJudgement.combo);
    };

    const missHandler = () => { if (!gameActive) return; if (hitSounds) hitSounds.miss(); };
    const comboBreakHandler = ({ combo }) => { judgementDisplay.showComboBreak(combo); };

    // Hold note release handler
    const releaseHandler = ({ lane, releaseTime }) => {
      if (!gameActive) return;
      const result = currentJudgement.judgeRelease(lane, releaseTime);
      if (!result) return;

      const pos = noteRenderer.getLaneHitPosition(lane, currentBeatMap.laneCount);
      const effectColors = { perfect: '#AAFF00', great: '#00E5FF', good: '#F5C518', bad: '#FF8C00' };
      noteRenderer.addEffect(pos.x, pos.y, effectColors[result.judgement] || '#AAFF00', result.judgement);

      if (hitSounds && result.judgement !== 'bad') hitSounds.hit();
      judgementDisplay.checkMilestone(currentJudgement.combo);
    };

    EventBus.on('input:hit', hitHandler);
    EventBus.on('input:release', releaseHandler);
    EventBus.on('note:miss', missHandler);
    EventBus.on('combo:break', comboBreakHandler);

    hud.show();
    input.enable();
    gameActive = true;

    // Play audio and RESTORE volume (was faded to 0 by preview stop)
    if (map.audioBuffer) {
      audio.play(map.audioBuffer);
      // Restore volume to saved setting
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
        noteRenderer.render({ notes: currentBeatMap.getNotesInWindow(ct), currentTime: ct, laneCount: currentBeatMap.laneCount, combo: currentJudgement.combo });
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
    if (startGame._cleanup) { startGame._cleanup(); startGame._cleanup = null; }
    const stats = currentJudgement.getStats();
    EventBus.emit('game:over', stats);
    screens.show('result', { stats, map: currentMapData });
  };

  const pauseGame = () => {
    if (!gameActive) return;
    gameActive = false;
    audio.pause();
    if (gameLoop) gameLoop.stop();
    const overlay = document.createElement('div');
    overlay.id = 'pause-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(17,17,17,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:50;gap:28px;';
    overlay.innerHTML = `<h2 class="zzz-title" style="font-size:56px;color:var(--zzz-lime);">PAUSED</h2><button class="zzz-btn zzz-btn--primary" id="resume-btn" style="font-size:16px;">RESUME</button><button class="zzz-btn zzz-btn--danger" id="quit-btn">QUIT</button>`;
    document.body.appendChild(overlay);
    document.getElementById('resume-btn').addEventListener('click', () => { overlay.remove(); resumeGame(); });
    document.getElementById('quit-btn').addEventListener('click', () => { overlay.remove(); endGame(); screens.show('song-select'); });
    EventBus.emit('game:pause');
  };

  const resumeGame = () => {
    gameActive = true;
    audio.resume();
    // Restore volume on resume too
    const vol = parseInt(localStorage.getItem('rhythm-os-volume') || '70') / 100;
    audio.fadeTo(vol, 0.1);
    if (gameLoop) gameLoop.start();
    EventBus.emit('game:resume');
  };

  EventBus.on('game:pause', pauseGame);
  window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && gameActive) { e.preventDefault(); pauseGame(); } });

  screens.register('main-menu', () => new MainMenu({ audio, screens }));
  screens.register('song-select', () => new SongSelect({ audio, three, screens }));
  screens.register('settings', () => new Settings({ audio, input, screens }));
  screens.register('result', (data) => { const rs = new ResultScreen({ screens }); if (data && data.stats) rs.setStats(data.stats, data.map); return rs; });
  screens.register('game', (data) => { if (data && data.map) startGame(data.map); return { build: () => '', init: () => {}, destroy: () => {} }; });

  window.addEventListener('resize', () => {
    updateSafeArea();
    three.resize();
  });
  screens.show('main-menu');

  const bgLoop = () => { if (!gameActive) three.update(performance.now()); requestAnimationFrame(bgLoop); };
  bgLoop();

  console.log('[RHYTHM::OS] Ready!');
}

boot().catch(err => console.error('[RHYTHM::OS] Boot failed:', err));
