---
Task ID: 1
Agent: Main Agent
Task: Complete rhythm game refactor with all user-requested changes

Work Log:
- Audited existing project structure (20 game files in public/game/)
- Rewrote HitSounds.js — added fail() method (subtle descending tone, 1.5s, not distracting)
- Created DifficultyAnalyzer.js — star rating, density, stamina, pattern analysis
- Rewrote OszLoader.js — multi-difficulty support, osu!→mania conversion, IndexedDB storage (BeatmapStore), DifficultyAnalyzer integration
- Rewrote NoteRenderer.js — Project Sekai perspective tilt (lanes converge to vanishing point at 40% width at top), trapezoid lanes, perspective-scaled notes, safeArea support
- Rewrote HUD.js — score on LEFT side, combo on RIGHT side, animated number counting (smooth interpolation), pop animations on milestone combos
- Rewrote JudgementDisplay.js — positioned on RIGHT side of playfield, combo break display repositioned
- Rewrote SongSelect.js — osu!lazer-style (blurred background, song cards with thumbnails, difficulty tabs, empty state prompt, IndexedDB persistence, no demo songs, multi-.osz import)
- Rewrote ThreeScene.js — TV monitor repositioned to bottom-left corner (as if sitting in front of it), angled at 0.35rad yaw, -0.1rad pitch
- Rewrote Settings.js — added aspect ratio selector (16:9, 16:10, 4:3, 21:9, Fill), resolution scale slider (50-150%)
- Rewrote MainMenu.js — updated version string, removed demo song references
- Updated ZZZTheme.js — added .song-card, .diff-tabs CSS classes, repositioned judgement/combo CSS to right side, added CRT click delegation for new elements
- Rewrote main.js — added calcSafeArea() for 16:9 aspect ratio, settings:changed listener for aspect ratio/resolution changes, fail sound trigger on health<=0
- Updated page.tsx — kept same structure, added fflate to import map

Stage Summary:
- All 17 game files updated/created
- Game field now has Project Sekai-style perspective tilt
- Score left, combo+judgement right layout
- Animated number updates with smooth counting
- Fail sound added (subtle, not distracting)
- SongSelect redesigned as osu!lazer style with blurred background, no grid
- 3D TV in bottom-left corner
- DifficultyAnalyzer with star rating system
- osu! standard → mania conversion
- Multi-difficulty support with tabs
- IndexedDB storage for beatmaps
- 16:9 default aspect ratio with settings
- Removed Neon Pulse/Cyber Drift demo songs
- Removed PREVIEW placeholder panel
- Lint passes clean

---
Task ID: 2
Agent: Main Agent
Task: Fix three user-reported issues: 1) OSZ preview images not persisting, 2) 3D TV not visible, 3) SongSelect layout redesign

Work Log:
- Fixed OszLoader.js: Added backgroundData/backgroundMime fields to store raw image bytes alongside Object URLs. Changed BeatmapStore.save() from JSON serialization to structured clone (Object.assign + explicit AudioBuffer/difficulties handling) so Uint8Array survives IndexedDB. BeatmapStore.loadAll() now recreates Object URLs from stored image data. DB_VERSION bumped to 2. Added backward compatibility for old JSON-serialized Uint8Array format.
- Fixed ThreeScene.js: Increased camera FOV from 60→75 so more of the scene is visible. Repositioned TV from (-4.5, -2.5, 1) to (-3.8, -2.0, 1.0). Enlarged TV geometry (3.0x2.2x0.3 vs 2.0x1.5x0.25). Added bezel, stand, and neck for better CRT aesthetic. Added brighter glow light on texture change.
- Redesigned SongSelect.js: Removed song-info-panel left sidebar. Added top-left song info overlay (title, artist, difficulty/BPM/length). Added difficulty dropdown that expands from song cards (osu!lazer style) when clicking diff count badge. Moved back button + search to centered top bar. Moved import button to top-right. Made background gradient transparent in bottom-left so 3D TV shows through.
- Updated page.tsx: Removed background from #screen div so each screen manages its own background transparency.
- Updated MainMenu.js, Settings.js, ResultScreen.js: Added explicit background:rgba(17,17,17,0.85) to each screen's root div.
- Updated ZZZTheme.js: Replaced diff-tabs CSS with .song-card-wrapper and .diff-dropdown CSS. Updated CRT click delegation to include .diff-dropdown-item. Made .song-card-diff-count look clickable with hover effects.

Stage Summary:
- OSZ preview images now persist across page reloads (backgroundData stored in IndexedDB)
- 3D TV is visible in bottom-left corner of SongSelect (FOV 75, proper positioning)
- SongSelect redesigned: no left panel, top-left info, difficulty dropdown from song cards
- All screens have self-managed backgrounds, #screen is now transparent
- Lint passes clean

---
Task ID: 3
Agent: Main Agent
Task: Fix hold note rendering (drawn below judge line / reverse order), remove flash effects, add reactive camera glow

Work Log:
- Rewrote NoteRenderer.js _drawHoldNote(): Added judge line clipping — `drawBottomY = Math.min(rawBottomY, judgeLineY)` so the hold body never extends below the judge line. The head cap is also clamped: `headY = Math.min(noteY, judgeLineY)`. This fixes the "long notes drawn below judgement line" issue.
- Removed _drawLaneFlash() and _beatPulse from NoteRenderer — all flash/pulse effects on the 2D canvas are gone. flashLane() is now a no-op.
- Cleaned up _drawBackground() — removed beat-dependent brightness and separator opacity. Lanes are now static and clean.
- Added AnalyserNode to AudioEngine.js — `_analyser` with fftSize=256, connected in the audio graph (gain → analyser → destination). Added `getAudioLevels()` method returning `{ intensity, bass, mid, high }` with smoothed values.
- Rewrote ThreeScene.js with reactive camera glow:
  - Added `setAudioEngine()` to receive the audio engine reference
  - Added `_bassLight` (PointLight) for bass-reactive glow at camera-facing position
  - Background shader now uses `uBassIntensity` and `uAudioIntensity` uniforms for audio-reactive color
  - Camera FOV pulses on beats (`_fovPulse`) and subtly follows bass intensity continuously
  - Bloom strength is audio-reactive: base + audioPulse*0.3 + bassPulse*0.4
  - Point light intensity follows bass + audio levels
  - Accent light pulses with audio intensity
  - Hit feedback: perfect=1.4 bloom + 2.5 FOV pulse, great=1.0 bloom + 1.5 FOV pulse, good=0.7 bloom + 0.8 FOV pulse
  - Miss: red light + camera shake + reduced bloom
  - All light colors interpolate back to lime green after color flashes
  - Particles: size pulses with bass, opacity follows bass+beat
- Updated main.js:
  - Added `three.setAudioEngine(audio)` to connect audio analysis
  - Removed `noteRenderer.beatPulse()` forwarding (no longer needed)
  - Improved endGame() canvas cleanup: explicit clearRect after noteRenderer.clear()

Stage Summary:
- Hold notes now properly clip at the judge line — body never extends below it
- All flash/pulse effects removed from the 2D canvas playfield
- Camera glow is now reactive to audio: bloom, FOV, and light intensity all respond to music
- Bass frequencies drive the most visible effects (FOV pulse, bloom, bass light)
- Hit feedback moved entirely to the 3D scene (bloom spikes, FOV pulses, light color changes)
- Lint passes clean
