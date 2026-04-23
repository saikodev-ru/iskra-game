# RHYTHM::OS - Game Development Worklog

## Project Overview
Building a 2D rhythm game with 3D elements (Zenless Zone Zero visual style)
- Stack: Vanilla JS, Three.js (CDN), Canvas 2D, Web Audio API
- No frameworks, no React in game code
- Served from public/game/ as static ES modules
- Next.js page.tsx is just the shell container

## Architecture
public/game/
├── core/        — EventBus, AudioEngine, GameLoop, InputManager
├── game/        — OszLoader, BeatMap, NoteRenderer, JudgementSystem, HitSounds, LatencyCalibrator
├── scene/       — ThreeScene (3D background + TV monitor)
├── ui/          — HUD, JudgementDisplay, ScreenManager
│   └── screens/ — MainMenu, SongSelect, Settings, ResultScreen
├── theme/       — ZZZTheme, CRTSounds
└── main.js      — Bootstrap

---
Task ID: 0
Agent: Main
Task: Project audit and infrastructure setup

Work Log:
- Audited existing Next.js project structure
- Created public/game/ directory tree
- Dev server running on port 3000

Stage Summary:
- Project is standard Next.js 16 with shadcn/ui
- No game-related code exists yet
- Directory structure created: public/game/{core,game,scene,ui/screens,theme}

---
Task ID: 2
Agent: Core + Audio + Theme Subagent
Task: Build core modules (EventBus, AudioEngine, GameLoop, InputManager) + HitSounds + LatencyCalibrator + ZZZTheme

Work Log:
- Wrote EventBus.js (pub/sub, ~10 lines)
- Wrote AudioEngine.js (Web Audio API, master clock)
- Wrote GameLoop.js (single rAF loop)
- Wrote InputManager.js (raw keydown/keyup, no debounce)
- Wrote HitSounds.js (Web Audio API generated sounds)
- Wrote LatencyCalibrator.js (audio offset calibration)
- Wrote ZZZTheme.js (CSS injection + CRT sound delegation)

Stage Summary:
- All core infrastructure modules complete
- All audio/sound modules complete
- ZZZ visual theme system complete

---
Task ID: 3
Agent: Game Logic + Rendering Subagent
Task: Build game modules (OszLoader, BeatMap, JudgementSystem, NoteRenderer, JudgementDisplay, HUD)

Work Log:
- Wrote OszLoader.js (.osz parser with fflate)
- Wrote BeatMap.js (normalized beat-map model)
- Wrote JudgementSystem.js (timing windows, combo, score)
- Wrote NoteRenderer.js (Canvas 2D stateless renderer)
- Wrote JudgementDisplay.js (center judgement display)
- Wrote HUD.js (direct DOM writes)

Stage Summary:
- All game logic modules complete
- All rendering modules complete

---
Task ID: 4
Agent: Scene + UI Subagent
Task: Build ThreeScene, ScreenManager, MainMenu, SongSelect, Settings, ResultScreen, main.js

Work Log:
- Wrote ThreeScene.js (Three.js 3D scene with bloom, film pass, TV monitor)
- Wrote ScreenManager.js (screen transitions with fade)
- Wrote MainMenu.js (ZZZ-styled main menu)
- Wrote SongSelect.js (TV preview + song list + .osz import)
- Wrote Settings.js (key bindings, audio offset, volume, scroll speed)
- Wrote ResultScreen.js (score, accuracy, rank display)
- Wrote main.js (bootstrap + game loop + demo audio generation)

Stage Summary:
- Complete 3D scene with post-processing and TV monitor
- All UI screens implemented
- Bootstrap with demo songs and .osz import support

---
Task ID: 5
Agent: Main
Task: Integration, bug fixes, and polish

Work Log:
- Fixed double-start bug (SongSelect was calling both EventBus.emit and screens.show)
- Fixed RETRY button (was not passing map data to result screen)
- Fixed FilmPass constructor for Three.js r170 compatibility (2-arg version)
- Added defensive check for FilmPass uniforms access
- Added fflate to import map for .osz file support
- Added 3-2-1 countdown before game starts with animated CSS
- Added countdown CSS animation (countdown-pulse keyframes)
- Added BACK button on song select screen for better UX
- Improved demo song note generation with musical patterns (quarter notes, eighth notes, hold notes, chords, staircase)
- Increased demo song note count (120 and 90 notes) and duration (120s and 100s)
- Updated layout.tsx to remove default styling that conflicts with game
- Created page.tsx with import map injection and game script loading
- Comprehensive browser testing passed: all screens, navigation, game loop, ZZZ theme

Stage Summary:
- All bugs fixed, game fully functional
- RETRY button now works correctly
- Countdown adds polish before game start
- Song select has visible back navigation
- Demo songs have musical patterns instead of random notes
- Game tested end-to-end: Menu → Song Select → Game → Results → Menu
