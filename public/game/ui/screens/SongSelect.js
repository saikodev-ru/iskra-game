import EventBus from '../../core/EventBus.js';
import OszLoader from '../../game/OszLoader.js';
import HitSounds from '../../game/HitSounds.js';
import ZZZTheme from '../../theme/ZZZTheme.js';

// Demo songs (built-in)
const DEMO_SONGS = [
  {
    id: 'demo-1',
    metadata: {
      title: 'NEON PULSE',
      artist: 'RHYTHM::OS',
      version: 'HARD',
      creator: 'System',
      previewTime: 0,
      bpm: 140,
      duration: 120000,
    },
    notes: generateDemoNotes(140, 120),
    bpmChanges: [],
    audioBuffer: null, // Will be generated
    backgroundUrl: null,
    videoUrl: null,
    isDemo: true,
    laneCount: 4
  },
  {
    id: 'demo-2',
    metadata: {
      title: 'CYBER DRIFT',
      artist: 'RHYTHM::OS',
      version: 'INSANE',
      creator: 'System',
      previewTime: 0,
      bpm: 175,
      duration: 100000,
    },
    notes: generateDemoNotes(175, 90),
    bpmChanges: [],
    audioBuffer: null,
    backgroundUrl: null,
    videoUrl: null,
    isDemo: true,
    laneCount: 4
  }
];

function generateDemoNotes(bpm, count) {
  const notes = [];
  const beatInterval = 60 / bpm;
  let id = 0;
  
  // Generate more musical patterns
  // Pattern: groups of 4 beats with varying patterns
  const patterns = [
    // Simple quarter notes
    (beat, bi) => [{ lane: beat % 4, time: bi, duration: 0 }],
    // Eighth notes pairs
    (beat, bi) => [
      { lane: beat % 4, time: bi, duration: 0 },
      { lane: (beat + 1) % 4, time: bi + beatInterval * 0.5, duration: 0 }
    ],
    // Hold notes
    (beat, bi) => [{ lane: beat % 4, time: bi, duration: beatInterval * 2 }],
    // Chords (two lanes)
    (beat, bi) => [
      { lane: beat % 4, time: bi, duration: 0 },
      { lane: (beat + 2) % 4, time: bi, duration: 0 }
    ],
    // Staircase pattern
    (beat, bi) => [
      { lane: beat % 4, time: bi, duration: 0 },
      { lane: (beat + 1) % 4, time: bi + beatInterval * 0.25, duration: 0 },
      { lane: (beat + 2) % 4, time: bi + beatInterval * 0.5, duration: 0 },
      { lane: (beat + 3) % 4, time: bi + beatInterval * 0.75, duration: 0 }
    ]
  ];
  
  let noteIdx = 0;
  for (let beat = 4; noteIdx < count; beat++) {
    const patternIdx = Math.floor(beat / 4) % patterns.length;
    const pattern = patterns[patternIdx];
    const patternNotes = pattern(beat, (beat) * beatInterval);
    
    for (const p of patternNotes) {
      if (noteIdx >= count) break;
      notes.push({
        id: id++,
        lane: p.lane,
        time: p.time,
        duration: p.duration,
        type: p.duration > 0 ? 'hold' : 'tap'
      });
      noteIdx++;
    }
  }
  
  return notes;
}

export default class SongSelect {
  constructor({ audio, three, screens }) {
    this.audio = audio;
    this.three = three;
    this.screens = screens;
    this.oszLoader = new OszLoader(audio);
    this.songs = [...DEMO_SONGS];
    this.selectedIndex = 0;
    this._previewTimer = null;
    this._lastSelectTime = 0;
    this._keyHandler = null;
    this._loadedMaps = new Map();
  }

  build() {
    return `
      <div style="display:flex;height:100%;padding:24px;gap:24px;box-sizing:border-box;">
        <!-- LEFT PANEL: TV + Song Info -->
        <div style="flex:0 0 45%;display:flex;flex-direction:column;gap:16px;">
          <!-- Back button + Title -->
          <div style="display:flex;align-items:center;gap:16px;">
            <button id="back-btn" class="zzz-btn" style="padding:6px 16px;font-size:12px;">← BACK</button>
            <span class="zzz-title" style="font-size:20px;color:var(--zzz-cyan);">SONG SELECT</span>
          </div>
          
          <!-- TV Monitor area (3D renders here) -->
          <div class="zzz-panel" style="flex:1;display:flex;align-items:center;justify-content:center;min-height:300px;">
            <div style="text-align:center;">
              <div class="zzz-label" style="margin-bottom:8px;">PREVIEW</div>
              <div style="color:var(--zzz-muted);font-family:var(--zzz-mono);font-size:12px;">3D TV MONITOR</div>
            </div>
          </div>
          
          <!-- Song Info -->
          <div class="zzz-panel" style="padding:20px;">
            <div id="song-artist" class="zzz-label" style="margin-bottom:4px;">ARTIST</div>
            <div id="song-title" style="font-family:var(--zzz-font);font-weight:900;font-size:28px;color:var(--zzz-text);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:12px;">
              TITLE
            </div>
            <div style="display:flex;gap:24px;margin-bottom:16px;">
              <div>
                <div class="zzz-label">DIFFICULTY</div>
                <div id="song-diff" style="display:flex;gap:2px;margin-top:4px;"></div>
              </div>
              <div>
                <div class="zzz-label">BPM</div>
                <div id="song-bpm" class="zzz-value" style="font-size:20px;">---</div>
              </div>
              <div>
                <div class="zzz-label">LENGTH</div>
                <div id="song-length" class="zzz-value" style="font-size:20px;">---</div>
              </div>
            </div>
            <button id="song-play-btn" class="zzz-btn zzz-btn--primary" style="width:100%;">
              ▶ PLAY
            </button>
          </div>
          
          <!-- Load .osz -->
          <div class="zzz-panel" style="padding:16px;text-align:center;">
            <div class="zzz-label" style="margin-bottom:8px;">LOAD BEATMAP</div>
            <label class="zzz-btn" style="cursor:pointer;display:inline-block;" for="osz-input">
              IMPORT .OSZ
            </label>
            <input type="file" id="osz-input" accept=".osz" style="display:none;" />
          </div>
        </div>
        
        <!-- RIGHT PANEL: Song List -->
        <div style="flex:1;display:flex;flex-direction:column;gap:8px;">
          <!-- Search + Sort -->
          <div style="display:flex;gap:8px;margin-bottom:8px;">
            <input type="text" class="zzz-search" id="song-search" placeholder="SEARCH..." style="flex:1;" />
            <button class="zzz-btn" id="sort-btn" style="padding:8px 12px;font-size:12px;">SORT</button>
          </div>
          
          <!-- Song list -->
          <div id="song-list" class="zzz-scroll" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:2px;">
          </div>
        </div>
      </div>
    `;
  }

  init() {
    this.container = document.getElementById('screen');
    
    // Build song list
    this._renderSongList();
    
    // Select first song
    this._selectSong(0);
    
    // Back button
    document.getElementById('back-btn').addEventListener('click', () => {
      this.screens.show('main-menu');
    });
    
    // Play button
    document.getElementById('song-play-btn').addEventListener('click', () => {
      this._confirmSong();
    });
    
    // OSZ file input
    document.getElementById('osz-input').addEventListener('change', (e) => {
      this._loadOszFile(e.target.files[0]);
    });
    
    // Search
    document.getElementById('song-search').addEventListener('input', (e) => {
      this._filterSongs(e.target.value);
    });
    
    // Keyboard navigation
    this._keyHandler = (e) => {
      if (e.code === 'ArrowUp') {
        e.preventDefault();
        this._selectSong(Math.max(0, this.selectedIndex - 1));
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        this._selectSong(Math.min(this.songs.length - 1, this.selectedIndex + 1));
      } else if (e.code === 'Enter') {
        e.preventDefault();
        this._confirmSong();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        this.screens.show('main-menu');
      }
    };
    window.addEventListener('keydown', this._keyHandler);
    
    // Show TV monitor in 3D scene
    if (this.three) {
      this.three.createTVMonitor();
    }
  }

  _renderSongList(filter = '') {
    const list = document.getElementById('song-list');
    if (!list) return;
    
    const lowerFilter = filter.toLowerCase();
    list.innerHTML = '';
    
    this.songs.forEach((song, i) => {
      const meta = song.metadata;
      if (lowerFilter && !meta.title.toLowerCase().includes(lowerFilter) && !meta.artist.toLowerCase().includes(lowerFilter)) {
        return;
      }
      
      const item = document.createElement('div');
      item.className = 'song-item' + (i === this.selectedIndex ? ' active' : '');
      item.dataset.index = i;
      
      const diffStars = this._renderDiffStars(meta.version);
      
      item.innerHTML = `
        <div style="flex:1;">
          <div style="font-family:var(--zzz-font);font-weight:700;font-size:16px;color:var(--zzz-text);text-transform:uppercase;">${meta.title}</div>
          <div style="font-family:var(--zzz-font);font-size:13px;color:var(--zzz-muted);">${meta.artist}</div>
          <div style="display:flex;gap:12px;margin-top:4px;align-items:center;">
            ${diffStars}
            <span class="zzz-value" style="font-size:12px;">${meta.bpm} BPM</span>
          </div>
        </div>
      `;
      
      item.addEventListener('click', () => {
        const now = Date.now();
        if (this.selectedIndex === i && now - this._lastSelectTime < 400) {
          // Double click → confirm
          this._confirmSong();
        } else {
          this._selectSong(i);
        }
        this._lastSelectTime = now;
      });
      
      list.appendChild(item);
    });
  }

  _renderDiffStars(version) {
    let count = 1;
    const v = (version || '').toUpperCase();
    if (v.includes('INSANE') || v.includes('EXPERT')) count = 4;
    else if (v.includes('HARD')) count = 3;
    else if (v.includes('NORMAL')) count = 2;
    else if (v.includes('EASY')) count = 1;
    
    let html = '';
    for (let i = 0; i < 5; i++) {
      html += `<span class="diff-star ${i < count ? 'filled' : 'empty'}"></span>`;
    }
    return html;
  }

  _selectSong(index) {
    this.selectedIndex = index;
    const song = this.songs[index];
    if (!song) return;
    
    // Update song info panel
    const artistEl = document.getElementById('song-artist');
    const titleEl = document.getElementById('song-title');
    const bpmEl = document.getElementById('song-bpm');
    const lengthEl = document.getElementById('song-length');
    const diffEl = document.getElementById('song-diff');
    
    if (artistEl) artistEl.textContent = song.metadata.artist;
    if (titleEl) titleEl.textContent = song.metadata.title;
    if (bpmEl) bpmEl.textContent = song.metadata.bpm;
    if (lengthEl) {
      const dur = song.metadata.duration / 1000;
      const min = Math.floor(dur / 60);
      const sec = Math.floor(dur % 60);
      lengthEl.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
    }
    if (diffEl) diffEl.innerHTML = this._renderDiffStars(song.metadata.version).replace(/display:flex;gap:2px;/g, '');
    
    // Update song list active state
    document.querySelectorAll('.song-item').forEach((el, i) => {
      el.classList.toggle('active', parseInt(el.dataset.index) === index);
    });
    
    // Update 3D TV
    if (this.three) {
      if (song.backgroundUrl) {
        this.three.setTVTexture(song.backgroundUrl);
      } else {
        this.three.setTVStatic();
      }
    }
    
    // Play preview audio
    this._playPreview(song);
    
    EventBus.emit('song:select', { map: song });
  }

  _playPreview(song) {
    // Stop current preview
    this.audio.stop();
    
    // For demo songs, generate a simple tone preview
    if (song.isDemo) {
      this._generatePreviewTone(song.metadata.bpm);
      return;
    }
    
    // For loaded songs, play from previewTime
    if (song.audioBuffer) {
      const startOffset = (song.metadata.previewTime || 0) / 1000;
      this.audio.fadeTo(0, 0);
      setTimeout(() => {
        this.audio.play(song.audioBuffer, startOffset);
        this.audio.fadeTo(0.7, 0.5);
      }, 100);
    }
  }

  _generatePreviewTone(bpm) {
    // Create a simple rhythmic preview using Web Audio API
    if (!this.audio.ctx) {
      this.audio._ensureCtx();
    }
    const ctx = this.audio.ctx;
    if (!ctx) return;
    
    // Simple metronome-like click
    const interval = 60 / bpm;
    let beat = 0;
    
    const playClick = () => {
      if (beat > 16) return; // Preview 16 beats
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.frequency.value = beat % 4 === 0 ? 880 : 660;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
      
      beat++;
    };
    
    // Play first click immediately
    playClick();
    this._previewInterval = setInterval(playClick, interval * 1000);
  }

  _confirmSong() {
    const song = this.songs[this.selectedIndex];
    if (!song) return;
    
    // Stop preview
    this.audio.stop();
    if (this._previewInterval) {
      clearInterval(this._previewInterval);
      this._previewInterval = null;
    }
    
    this.screens.show('game', { map: song });
  }

  async _loadOszFile(file) {
    if (!file) return;
    
    try {
      const map = await this.oszLoader.load(file);
      map.id = 'osz-' + Date.now();
      this.songs.push(map);
      this._renderSongList();
      this._selectSong(this.songs.length - 1);
    } catch (err) {
      console.error('Failed to load .osz:', err);
      alert('Failed to load .osz file: ' + err.message);
    }
  }

  _filterSongs(query) {
    this._renderSongList(query);
  }

  destroy() {
    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler);
    }
    if (this._previewInterval) {
      clearInterval(this._previewInterval);
      this._previewInterval = null;
    }
    this.audio.stop();
    
    if (this.three) {
      this.three.removeTVMonitor();
    }
  }
}
