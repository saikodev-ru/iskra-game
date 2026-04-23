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

// Screens
import MainMenu      from './ui/screens/MainMenu.js';
import SongSelect    from './ui/screens/SongSelect.js';
import Settings      from './ui/screens/Settings.js';
import ResultScreen  from './ui/screens/ResultScreen.js';

async function boot() {
  console.log('[RHYTHM::OS] Booting...');
  
  // 1. Audio Engine
  const audio = new AudioEngine();
  
  // 2. Hit Sounds (needs audio context, created on first user gesture)
  let hitSounds = null;
  const initAudio = () => {
    audio._ensureCtx();
    if (!hitSounds && audio.ctx) {
      hitSounds = new HitSounds(audio.ctx);
    }
    return hitSounds;
  };
  
  // 3. Theme (inject CSS, CRT sound delegation)
  ZZZTheme.init({
    crtClick: () => { const s = initAudio(); if(s) s.crtClick(); },
    crtSwitch: () => { const s = initAudio(); if(s) s.crtSwitch(); }
  });
  
  // 4. Three.js Scene
  const threeCanvas = document.getElementById('three');
  const three = new ThreeScene(threeCanvas);
  
  // 5. Game Canvas
  const gameCanvas = document.getElementById('game');
  const noteRenderer = new NoteRenderer(gameCanvas);
  
  // 6. Input Manager
  const input = new InputManager(audio);
  
  // 7. Latency Calibrator
  const calibrator = new LatencyCalibrator(audio);
  
  // 8. HUD
  const hudContainer = document.getElementById('hud');
  const hud = new HUD(hudContainer);
  
  // 9. Judgement Display
  const judgementContainer = document.getElementById('judgement-overlay');
  const judgementDisplay = new JudgementDisplay(judgementContainer);
  
  // 10. Screen Manager
  const screenContainer = document.getElementById('screen');
  const screens = new ScreenManager(screenContainer);
  
  // Game state
  let gameLoop = null;
  let currentBeatMap = null;
  let currentJudgement = null;
  let gameActive = false;
  
  // Game Screen (created dynamically when starting a game)
  const startGame = (map) => {
    // Prevent double start
    if (gameActive) {
      endGame();
    }
    
    initAudio();
    
    // Create BeatMap
    currentBeatMap = new BeatMap(map);
    currentJudgement = new JudgementSystem(currentBeatMap);
    currentJudgement.reset();
    
    // Configure input for lane count
    input.setLaneCount(currentBeatMap.laneCount);
    
    // Configure scroll speed
    const scrollSpeed = parseInt(localStorage.getItem('rhythm-os-scroll-speed') || '400');
    noteRenderer.scrollSpeed = scrollSpeed;
    noteRenderer.resize();
    
    // Show countdown before starting
    _showCountdown(() => {
      _actuallyStartGame(map);
    });
  };
  
  const _showCountdown = (callback) => {
    const overlay = document.createElement('div');
    overlay.id = 'countdown-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:50;background:rgba(0,0,0,0.6);';
    overlay.innerHTML = '<div class="zzz-title" style="font-size:96px;color:var(--zzz-cyan);text-shadow:0 0 40px rgba(0,229,255,0.6);">3</div>';
    document.body.appendChild(overlay);
    
    let count = 3;
    const countEl = overlay.firstElementChild;
    
    const tick = () => {
      count--;
      if (count > 0) {
        countEl.textContent = count;
        countEl.style.animation = 'none';
        void countEl.offsetHeight; // trigger reflow
        countEl.style.animation = '';
      } else {
        countEl.textContent = 'GO!';
        countEl.style.color = 'var(--zzz-yellow)';
        countEl.style.textShadow = '0 0 40px rgba(245,197,24,0.6)';
        setTimeout(() => {
          overlay.remove();
          callback();
        }, 400);
        return;
      }
      setTimeout(tick, 800);
    };
    
    setTimeout(tick, 800);
  };
  
  const _actuallyStartGame = (map) => {
    const hitHandler = ({ lane, hitTime }) => {
      if (!gameActive) return;
      currentJudgement.judgeHit(lane, hitTime);
      
      // Visual feedback
      const laneWidth = window.innerWidth * 0.5 / currentBeatMap.laneCount;
      const startX = window.innerWidth * 0.25;
      const laneX = startX + lane * laneWidth + laneWidth / 2;
      
      const result = currentBeatMap.findClosestNote(lane, hitTime);
      if (result) {
        const noteY = noteRenderer.judgeLineY;
        const colors = { perfect: '#FFD700', great: '#00E5FF', good: '#A0FF80', bad: '#FF8C00' };
        const judgement = result.note.judgement || 'good';
        noteRenderer.addEffect(laneX, noteY, colors[judgement] || '#00E5FF', judgement === 'perfect');
        noteRenderer.flashLane(lane, laneX, laneWidth);
      }
      
      // Hit sound
      if (hitSounds) {
        const result2 = currentBeatMap.findClosestNote(lane, hitTime);
        if (result2 && result2.note.judgement === 'perfect') {
          hitSounds.perfect();
        } else {
          hitSounds.hit();
        }
      }
    };
    
    const missHandler = () => {
      if (!gameActive) return;
      if (hitSounds) hitSounds.miss();
    };
    
    const comboBreakHandler = ({ combo }) => {
      if (hitSounds) hitSounds.miss();
      judgementDisplay.showComboBreak(combo);
    };
    
    const noteHitHandler = ({ judgement, delta }) => {
      // Check milestones
      if (currentJudgement) {
        judgementDisplay.checkMilestone(currentJudgement.combo);
        if (hitSounds && [50, 100, 200, 500].includes(currentJudgement.combo)) {
          hitSounds.milestone(currentJudgement.combo);
        }
      }
    };
    
    EventBus.on('input:hit', hitHandler);
    EventBus.on('note:miss', missHandler);
    EventBus.on('combo:break', comboBreakHandler);
    EventBus.on('note:hit', noteHitHandler);
    
    // Show game UI
    hud.show();
    input.enable();
    gameActive = true;
    
    // Start audio
    if (map.audioBuffer) {
      audio.play(map.audioBuffer);
    } else if (map.isDemo) {
      // Generate demo audio
      _generateDemoAudio(audio, map.metadata.bpm, map.metadata.duration / 1000);
    }
    
    // Start beat scheduler
    audio.startBeatScheduler(currentBeatMap.metadata.bpm);
    
    // Create game loop
    let health = 100;
    gameLoop = new GameLoop({
      update(delta) {
        if (!gameActive) return;
        
        const currentTime = audio.currentTime;
        
        // Check for missed notes
        currentJudgement.checkMisses(currentTime);
        
        // Update health
        // Miss reduces health, good hits restore a little
        // Simplified: health = 100 - (misses * 5) + (perfects * 0.5)
        health = Math.max(0, Math.min(100, 100 - currentJudgement.hitCounts.miss * 5 + currentJudgement.hitCounts.perfect * 0.3));
        
        // Update HUD
        const stats = currentJudgement.getStats();
        stats.health = health;
        hud.update(stats);
        
        // Progress
        if (currentBeatMap.notes.length > 0) {
          const lastNote = currentBeatMap.notes[currentBeatMap.notes.length - 1];
          const progress = currentTime / (lastNote.time + lastNote.duration + 2);
          hud.setProgress(Math.min(1, progress));
        }
        
        // Check game over
        if (currentJudgement.isComplete(currentTime) || health <= 0) {
          endGame();
        }
      },
      render() {
        if (!gameActive) return;
        
        const currentTime = audio.currentTime;
        const notes = currentBeatMap.getNotesInWindow(currentTime);
        
        noteRenderer.render({
          notes,
          currentTime,
          laneCount: currentBeatMap.laneCount,
          combo: currentJudgement.combo
        });
        
        three.update(performance.now());
      }
    });
    
    gameLoop.start();
    
    EventBus.emit('game:start', { map });
    
    // Store cleanup function
    startGame._cleanup = () => {
      EventBus.off('input:hit', hitHandler);
      EventBus.off('note:miss', missHandler);
      EventBus.off('combo:break', comboBreakHandler);
      EventBus.off('note:hit', noteHitHandler);
    };
  };
  
  const endGame = () => {
    gameActive = false;
    input.disable();
    
    if (gameLoop) {
      gameLoop.stop();
      gameLoop = null;
    }
    
    audio.stop();
    audio.stopBeatScheduler();
    
    hud.hide();
    
    if (startGame._cleanup) {
      startGame._cleanup();
      startGame._cleanup = null;
    }
    
    const stats = currentJudgement.getStats();
    EventBus.emit('game:over', stats);
    
    // Pass map data to result screen for retry functionality
    const mapData = currentBeatMap ? {
      notes: currentBeatMap.notes,
      metadata: currentBeatMap.metadata,
      audioBuffer: currentBeatMap.audioBuffer,
      backgroundUrl: currentBeatMap.backgroundUrl,
      videoUrl: currentBeatMap.videoUrl,
      bpmChanges: currentBeatMap.bpmChanges,
      isDemo: !currentBeatMap.audioBuffer,
      laneCount: currentBeatMap.laneCount
    } : null;
    
    // Show result screen with both stats and map data
    screens.show('result', { stats, map: mapData });
  };
  
  const pauseGame = () => {
    if (!gameActive) return;
    gameActive = false;
    audio.pause();
    if (gameLoop) gameLoop.stop();
    
    // Show pause overlay
    const overlay = document.createElement('div');
    overlay.id = 'pause-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:50;gap:24px;';
    overlay.innerHTML = `
      <h2 class="zzz-title" style="font-size:48px;color:var(--zzz-cyan);">PAUSED</h2>
      <button class="zzz-btn zzz-btn--primary" id="resume-btn">RESUME</button>
      <button class="zzz-btn zzz-btn--danger" id="quit-btn">QUIT</button>
    `;
    document.body.appendChild(overlay);
    
    document.getElementById('resume-btn').addEventListener('click', () => {
      overlay.remove();
      resumeGame();
    });
    
    document.getElementById('quit-btn').addEventListener('click', () => {
      overlay.remove();
      endGame();
      screens.show('song-select');
    });
    
    EventBus.emit('game:pause');
  };
  
  const resumeGame = () => {
    gameActive = true;
    audio.resume();
    if (gameLoop) gameLoop.start();
    EventBus.emit('game:resume');
  };
  
  // Pause listener
  EventBus.on('game:pause', pauseGame);
  
  // Escape key for pause
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && gameActive) {
      e.preventDefault();
      pauseGame();
    }
  });
  
  // Register screens
  screens.register('main-menu', () => new MainMenu({ audio, screens }));
  screens.register('song-select', () => new SongSelect({ audio, three, screens }));
  screens.register('settings', () => new Settings({ audio, input, screens }));
  screens.register('result', (data) => {
    const rs = new ResultScreen({ screens });
    if (data && data.stats) rs.setStats(data.stats, data.map);
    return rs;
  });
  
  // Game screen is handled by startGame, not a screen class
  screens.register('game', (data) => {
    if (data && data.map) {
      startGame(data.map);
    }
    return { build: () => '', init: () => {}, destroy: () => {} };
  });
  
  // Handle resize
  window.addEventListener('resize', () => {
    noteRenderer.resize();
    three.resize();
  });
  
  // Show main menu
  screens.show('main-menu');
  
  // Start 3D background rendering
  const bgLoop = () => {
    if (!gameActive) {
      three.update(performance.now());
    }
    requestAnimationFrame(bgLoop);
  };
  bgLoop();
  
  console.log('[RHYTHM::OS] Ready!');
}

function _generateDemoAudio(audio, bpm, durationSec) {
  // Generate a simple drum-like beat
  const ctx = audio.ctx;
  if (!ctx) return;
  
  const sampleRate = ctx.sampleRate;
  const totalSamples = Math.floor(sampleRate * durationSec);
  const buffer = ctx.createBuffer(2, totalSamples, sampleRate);
  
  const beatInterval = 60 / bpm;
  const totalBeats = Math.floor(durationSec / beatInterval);
  
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    
    for (let beat = 0; beat < totalBeats; beat++) {
      const beatStart = Math.floor(beat * beatInterval * sampleRate);
      
      // Kick drum (every beat)
      for (let i = 0; i < Math.min(sampleRate * 0.15, totalSamples - beatStart); i++) {
        const t = i / sampleRate;
        const freq = 150 * Math.exp(-t * 20);
        const amp = Math.exp(-t * 15) * 0.3;
        data[beatStart + i] += Math.sin(2 * Math.PI * freq * t) * amp;
      }
      
      // Hi-hat (every half beat)
      if (beat % 2 === 0) {
        const halfStart = beatStart + Math.floor(beatInterval * 0.5 * sampleRate);
        for (let i = 0; i < Math.min(sampleRate * 0.05, totalSamples - halfStart); i++) {
          const t = i / sampleRate;
          const amp = Math.exp(-t * 40) * 0.1;
          data[halfStart + i] += (Math.random() * 2 - 1) * amp;
        }
      }
      
      // Snare (every other beat)
      if (beat % 4 === 2) {
        for (let i = 0; i < Math.min(sampleRate * 0.1, totalSamples - beatStart); i++) {
          const t = i / sampleRate;
          const amp = Math.exp(-t * 20) * 0.15;
          data[beatStart + i] += (Math.random() * 2 - 1) * amp;
          data[beatStart + i] += Math.sin(2 * Math.PI * 200 * t) * amp * 0.5;
        }
      }
      
      // Bass note (every 4 beats)
      if (beat % 4 === 0) {
        const bassNotes = [65.41, 73.42, 82.41, 87.31]; // C2, D2, E2, F2
        const noteFreq = bassNotes[Math.floor(beat / 4) % bassNotes.length];
        for (let i = 0; i < Math.min(sampleRate * beatInterval * 2, totalSamples - beatStart); i++) {
          const t = i / sampleRate;
          const amp = Math.exp(-t * 2) * 0.2;
          data[beatStart + i] += Math.sin(2 * Math.PI * noteFreq * t) * amp;
        }
      }
    }
  }
  
  audio.play(buffer);
}

// Start
boot().catch(err => console.error('[RHYTHM::OS] Boot failed:', err));
