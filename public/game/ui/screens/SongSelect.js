import EventBus from '../../core/EventBus.js';
import OszLoader from '../../game/OszLoader.js';
import DifficultyAnalyzer from '../../game/DifficultyAnalyzer.js';

export default class SongSelect {
  constructor({ audio, three, screens }) {
    this.audio = audio;
    this.three = three;
    this.screens = screens;
    this.oszLoader = new OszLoader(audio);
    this.beatmapSets = [];
    this.selectedIndex = -1;
    this.selectedDiffIndex = 0;
    this._lastSelectTime = 0;
    this._keyHandler = null;
    this._previewInterval = null;
    this._previewFadeTimeout = null;
    this._filterText = '';
    this._filteredIndices = [];
  }

  build() {
    return `
      <div style="width:100%;height:100%;position:relative;">
        <!-- Blurred background -->
        <div id="ss-bg" style="position:absolute;inset:0;background-size:cover;background-position:center;filter:blur(40px) brightness(0.3);transform:scale(1.1);background-color:#111;"></div>
        <!-- Dark overlay -->
        <div style="position:absolute;inset:0;background:rgba(0,0,0,0.5);"></div>

        <!-- Content -->
        <div style="position:relative;z-index:1;display:flex;height:100%;padding:24px;gap:24px;box-sizing:border-box;">
          <!-- LEFT: Song details + difficulty dropdown + import -->
          <div style="flex:0 0 40%;display:flex;flex-direction:column;gap:16px;">
            <div style="display:flex;align-items:center;gap:12px;">
              <button id="back-btn" class="zzz-btn zzz-btn--sm">← BACK</button>
              <span class="zzz-title" style="font-size:16px;color:var(--zzz-lime);">SONG SELECT</span>
            </div>

            <!-- Song Info Panel -->
            <div id="song-info-panel" class="zzz-panel" style="padding:24px;flex:1;display:flex;flex-direction:column;gap:16px;overflow-y:auto;">
              <!-- Populated by JS -->
            </div>

            <!-- Import -->
            <div class="zzz-panel" style="padding:16px;text-align:center;">
              <label class="zzz-btn zzz-btn--primary zzz-btn--sm" style="cursor:pointer;display:inline-block;" for="osz-input">IMPORT .OSZ</label>
              <input type="file" id="osz-input" accept=".osz" style="display:none;" multiple />
            </div>
          </div>

          <!-- RIGHT: Song list -->
          <div style="flex:1;display:flex;flex-direction:column;gap:10px;">
            <input type="text" class="zzz-search" id="song-search" placeholder="SEARCH..." />
            <div id="song-list" class="zzz-scroll" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:6px;padding-right:4px;"></div>
          </div>
        </div>
      </div>
    `;
  }

  async init() {
    // Load stored beatmaps from IndexedDB
    try {
      const stored = await this.oszLoader.loadFromStore();
      this.beatmapSets = Array.isArray(stored) ? stored : [];
    } catch (err) {
      console.warn('Failed to load stored beatmaps:', err);
      this.beatmapSets = [];
    }

    this._buildFilteredIndices();
    this._renderSongList();
    if (this.beatmapSets.length > 0) {
      this._selectSong(0);
    } else {
      this._renderEmptyState();
    }

    document.getElementById('back-btn').addEventListener('click', () => this.screens.show('main-menu'));
    document.getElementById('osz-input').addEventListener('change', (e) => this._handleOszFiles(e.target.files));
    document.getElementById('song-search').addEventListener('input', (e) => this._filterSongs(e.target.value));

    this._keyHandler = (e) => {
      if (e.target.tagName === 'INPUT') return; // Don't capture when typing in search
      if (e.code === 'ArrowUp') {
        e.preventDefault();
        this._navigateUp();
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        this._navigateDown();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        this._navigateDiffLeft();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        this._navigateDiffRight();
      } else if (e.code === 'Enter') {
        e.preventDefault();
        this._confirmSong();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        this.screens.show('main-menu');
      }
    };
    window.addEventListener('keydown', this._keyHandler);

    if (this.three) this.three.createTVMonitor();
  }

  // ─── Filtering ────────────────────────────────────────────────────

  _buildFilteredIndices() {
    const lf = this._filterText.toLowerCase();
    this._filteredIndices = [];
    this.beatmapSets.forEach((set, i) => {
      if (lf && !set.title.toLowerCase().includes(lf) && !set.artist.toLowerCase().includes(lf)) return;
      this._filteredIndices.push(i);
    });
  }

  _filterSongs(query) {
    this._filterText = query;
    this._buildFilteredIndices();
    this._renderSongList();
    // Keep selection if still visible, otherwise select first
    if (this._filteredIndices.length > 0 && !this._filteredIndices.includes(this.selectedIndex)) {
      this._selectSong(this._filteredIndices[0]);
    } else if (this._filteredIndices.length === 0) {
      this._renderEmptyState();
    }
  }

  // ─── Navigation ───────────────────────────────────────────────────

  _navigateUp() {
    const pos = this._filteredIndices.indexOf(this.selectedIndex);
    if (pos > 0) {
      this._selectSong(this._filteredIndices[pos - 1]);
    }
  }

  _navigateDown() {
    const pos = this._filteredIndices.indexOf(this.selectedIndex);
    if (pos < this._filteredIndices.length - 1) {
      this._selectSong(this._filteredIndices[pos + 1]);
    }
  }

  _navigateDiffLeft() {
    if (this.selectedDiffIndex > 0) {
      this._selectDifficulty(this.selectedDiffIndex - 1);
    }
  }

  _navigateDiffRight() {
    const set = this.beatmapSets[this.selectedIndex];
    if (set && this.selectedDiffIndex < set.difficulties.length - 1) {
      this._selectDifficulty(this.selectedDiffIndex + 1);
    }
  }

  // ─── Song List Rendering ──────────────────────────────────────────

  _renderSongList() {
    const list = document.getElementById('song-list');
    if (!list) return;
    list.innerHTML = '';

    if (this._filteredIndices.length === 0 && this.beatmapSets.length > 0) {
      list.innerHTML = `<div style="text-align:center;padding:40px;color:var(--zzz-muted);font-family:var(--zzz-font);font-size:14px;">NO MATCHES FOUND</div>`;
      return;
    }

    this._filteredIndices.forEach((setIndex) => {
      const set = this.beatmapSets[setIndex];
      const isSelected = setIndex === this.selectedIndex;
      const card = this._createSongCard(set, setIndex, isSelected);
      list.appendChild(card);
    });
  }

  _createSongCard(set, setIndex, isSelected) {
    const card = document.createElement('div');
    card.className = 'song-card' + (isSelected ? ' active' : '');
    card.dataset.index = setIndex;

    // Determine display difficulty (highest or selected)
    const dispDiff = isSelected && set.difficulties[this.selectedDiffIndex]
      ? set.difficulties[this.selectedDiffIndex]
      : set.difficulties[0] || { difficulty: { stars: 0 } };
    const stars = dispDiff.difficulty?.stars || 0;
    const starColor = DifficultyAnalyzer.getStarColor(stars);
    const diffName = DifficultyAnalyzer.getDiffName(stars);

    card.innerHTML = `
      <div class="song-card-thumb" style="${set.backgroundUrl ? `background-image:url('${set.backgroundUrl}')` : 'background:var(--zzz-graphite);'}"></div>
      <div class="song-card-info">
        <div class="song-card-title">${this._escHtml(set.title)}</div>
        <div class="song-card-artist">${this._escHtml(set.artist)}</div>
        <div class="song-card-diff-row">
          <span class="song-card-stars" style="color:${starColor};">★ ${stars.toFixed(1)}</span>
          <span class="song-card-diff-name" style="color:${starColor};">${diffName}</span>
          ${set.difficulties.length > 1 ? `<span class="song-card-diff-count">+${set.difficulties.length - 1}</span>` : ''}
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      const now = Date.now();
      if (this.selectedIndex === setIndex && now - this._lastSelectTime < 400) {
        this._confirmSong();
      } else {
        this._selectSong(setIndex);
      }
      this._lastSelectTime = now;
    });

    return card;
  }

  _escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // ─── Song Selection ───────────────────────────────────────────────

  _selectSong(setIndex) {
    if (setIndex < 0 || setIndex >= this.beatmapSets.length) return;
    this.selectedIndex = setIndex;
    this.selectedDiffIndex = 0;
    const set = this.beatmapSets[setIndex];

    // Update card highlights
    document.querySelectorAll('.song-card').forEach((el) => {
      const idx = parseInt(el.dataset.index);
      el.classList.toggle('active', idx === setIndex);
    });

    // Scroll selected card into view
    const activeCard = document.querySelector(`.song-card[data-index="${setIndex}"]`);
    if (activeCard) {
      activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Update background
    this._updateBackground(set.backgroundUrl);

    // Update TV monitor
    if (this.three) {
      if (set.backgroundUrl) {
        this.three.setTVTexture(set.backgroundUrl);
      } else {
        this.three.setTVStatic();
      }
    }

    // Render song info panel
    this._renderSongInfo(set);

    // Play preview
    this._playPreview(set);

    EventBus.emit('song:select', { map: set });
  }

  _selectDifficulty(diffIndex) {
    const set = this.beatmapSets[this.selectedIndex];
    if (!set || diffIndex < 0 || diffIndex >= set.difficulties.length) return;
    this.selectedDiffIndex = diffIndex;
    this._renderSongInfo(set);
  }

  // ─── Song Info Panel ──────────────────────────────────────────────

  _renderSongInfo(set) {
    const panel = document.getElementById('song-info-panel');
    if (!panel) return;

    const diff = set.difficulties[this.selectedDiffIndex] || set.difficulties[0];
    if (!diff) return;

    const stars = diff.difficulty?.stars || 0;
    const starColor = DifficultyAnalyzer.getStarColor(stars);
    const diffName = DifficultyAnalyzer.getDiffName(stars);
    const bpm = diff.metadata?.bpm || 0;
    const duration = diff.metadata?.duration || 0;
    const pattern = diff.difficulty?.pattern || '—';
    const density = diff.difficulty?.density || 0;
    const stamina = diff.difficulty?.stamina || 0;
    const durationSec = Math.floor(duration / 1000);
    const durationStr = `${Math.floor(durationSec / 60)}:${(durationSec % 60).toString().padStart(2, '0')}`;

    let diffTabsHtml = '';
    if (set.difficulties.length > 1) {
      diffTabsHtml = `<div class="diff-tabs">${set.difficulties.map((d, i) => {
        const s = d.difficulty?.stars || 0;
        const c = DifficultyAnalyzer.getStarColor(s);
        const n = DifficultyAnalyzer.getDiffName(s);
        const active = i === this.selectedDiffIndex;
        return `<button class="diff-tab${active ? ' active' : ''}" data-diff="${i}" style="${active ? `border-color:${c};color:${c};` : ''}">` +
          `<span class="diff-tab-name">${this._escHtml(d.version || n)}</span>` +
          `<span class="diff-tab-stars" style="color:${c};">★${s.toFixed(1)}</span>` +
          `</button>`;
      }).join('')}</div>`;
    }

    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <span class="zzz-label">ARTIST</span>
      </div>
      <div style="font-family:var(--zzz-font);font-weight:900;font-size:28px;color:var(--zzz-text);text-transform:uppercase;letter-spacing:0.06em;line-height:1.1;word-break:break-word;">${this._escHtml(set.title)}</div>
      <div style="font-family:var(--zzz-font);font-weight:500;font-size:14px;color:var(--zzz-muted);margin-top:2px;">${this._escHtml(set.artist)}${set.creator ? ' // ' + this._escHtml(set.creator) : ''}</div>

      <div style="display:flex;gap:24px;margin-top:8px;flex-wrap:wrap;">
        <div>
          <div class="zzz-label">DIFFICULTY</div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:4px;">
            <span style="color:${starColor};font-family:var(--zzz-font);font-weight:900;font-size:20px;">★ ${stars.toFixed(1)}</span>
            <span style="color:${starColor};font-family:var(--zzz-font);font-weight:700;font-size:14px;">${diffName}</span>
          </div>
        </div>
        <div>
          <div class="zzz-label">BPM</div>
          <div class="zzz-value" style="font-size:20px;margin-top:4px;">${bpm || '---'}</div>
        </div>
        <div>
          <div class="zzz-label">LENGTH</div>
          <div class="zzz-value" style="font-size:20px;margin-top:4px;">${duration ? durationStr : '---'}</div>
        </div>
      </div>

      <div style="display:flex;gap:24px;flex-wrap:wrap;">
        <div>
          <div class="zzz-label">PATTERN</div>
          <div class="zzz-value" style="font-size:14px;margin-top:4px;">${pattern}</div>
        </div>
        <div>
          <div class="zzz-label">DENSITY</div>
          <div class="zzz-value" style="font-size:14px;margin-top:4px;">${density.toFixed(1)} NPS</div>
        </div>
        <div>
          <div class="zzz-label">STAMINA</div>
          <div class="zzz-value" style="font-size:14px;margin-top:4px;">${stamina}%</div>
        </div>
      </div>

      ${diffTabsHtml}

      <button id="song-play-btn" class="zzz-btn zzz-btn--primary" style="width:100%;font-size:16px;margin-top:auto;">▶ PLAY</button>
    `;

    // Rebind play button
    document.getElementById('song-play-btn')?.addEventListener('click', () => this._confirmSong());

    // Rebind difficulty tabs
    panel.querySelectorAll('.diff-tab').forEach((tab) => {
      tab.addEventListener('click', (e) => {
        const diffIdx = parseInt(e.currentTarget.dataset.diff);
        this._selectDifficulty(diffIdx);
      });
    });
  }

  _renderEmptyState() {
    const panel = document.getElementById('song-info-panel');
    if (!panel) return;

    panel.innerHTML = `
      <div style="text-align:center;padding:40px 0;">
        <div class="zzz-title" style="font-size:24px;color:var(--zzz-muted);margin-bottom:16px;">NO BEATMAPS LOADED</div>
        <div style="color:var(--zzz-muted);font-size:14px;margin-bottom:24px;">Import .osz files to get started</div>
        <label class="zzz-btn zzz-btn--primary" style="cursor:pointer;display:inline-block;" for="osz-input">IMPORT .OSZ</label>
      </div>
    `;
  }

  // ─── Background ───────────────────────────────────────────────────

  _updateBackground(url) {
    const bg = document.getElementById('ss-bg');
    if (!bg) return;
    if (url) {
      bg.style.backgroundImage = `url('${url}')`;
    } else {
      bg.style.backgroundImage = 'none';
      bg.style.backgroundColor = '#111';
    }
  }

  // ─── Audio Preview ────────────────────────────────────────────────

  _playPreview(set) {
    // Fade out current audio
    this._stopPreview();

    if (!set.audioBuffer) return;

    const previewTime = set.difficulties[this.selectedDiffIndex]?.metadata?.previewTime || 0;

    // Small delay for fade-out, then fade in new audio
    this.audio._ensureCtx();
    this.audio.fadeTo(0, 0.2);
    this._previewFadeTimeout = setTimeout(() => {
      if (set !== this.beatmapSets[this.selectedIndex]) return; // Stale
      this.audio.play(set.audioBuffer, Math.max(0, previewTime));
      this.audio.fadeTo(0.5, 0.4);
    }, 250);
  }

  _stopPreview() {
    if (this._previewFadeTimeout) {
      clearTimeout(this._previewFadeTimeout);
      this._previewFadeTimeout = null;
    }
    if (this._previewInterval) {
      clearInterval(this._previewInterval);
      this._previewInterval = null;
    }
    this.audio.fadeTo(0, 0.15);
    setTimeout(() => {
      this.audio.stop();
    }, 200);
  }

  // ─── Confirm / Play ───────────────────────────────────────────────

  _confirmSong() {
    const set = this.beatmapSets[this.selectedIndex];
    if (!set) return;

    const diff = set.difficulties[this.selectedDiffIndex];
    if (!diff) return;

    this._stopPreview();

    const map = {
      metadata: {
        ...(set.metadata || {}),
        ...diff.metadata,
        title: set.title,
        artist: set.artist,
        version: diff.version,
        creator: set.creator
      },
      audioBuffer: set.audioBuffer,
      backgroundUrl: set.backgroundUrl,
      notes: diff.notes,
      laneCount: diff.laneCount,
      bpmChanges: diff.bpmChanges,
      difficulty: diff.difficulty
    };

    this.screens.show('game', { map });
  }

  // ─── .osz Import ──────────────────────────────────────────────────

  async _handleOszFiles(files) {
    if (!files || files.length === 0) return;

    for (const file of files) {
      try {
        const beatmapSet = await this.oszLoader.load(file);
        this.beatmapSets.push(beatmapSet);
      } catch (err) {
        console.error('Failed to load .osz:', err);
      }
    }

    // Reset file input so the same file can be re-imported
    const oszInput = document.getElementById('osz-input');
    if (oszInput) oszInput.value = '';

    // Refresh
    this._buildFilteredIndices();
    this._renderSongList();
    if (this.beatmapSets.length > 0) {
      this._selectSong(this.beatmapSets.length - 1);
    }
  }

  // ─── Destroy ──────────────────────────────────────────────────────

  destroy() {
    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
    this._stopPreview();
    if (this.three) this.three.removeTVMonitor();
  }
}
