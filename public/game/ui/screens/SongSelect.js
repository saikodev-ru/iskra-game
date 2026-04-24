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
    this._expandedCard = -1;
  }

  build() {
    return `
      <div style="width:100%;height:100%;position:relative;display:flex;flex-direction:column;">
        <!-- Top bar -->
        <div style="display:flex;align-items:center;gap:12px;padding:16px 24px;flex-shrink:0;">
          <button id="back-btn" class="zzz-btn zzz-btn--sm">← BACK</button>
          <input type="text" class="zzz-search" id="song-search" placeholder="SEARCH..." style="flex:1;max-width:320px;" />
        </div>

        <!-- Song info (top-left) -->
        <div id="ss-song-info" style="position:absolute;top:64px;left:24px;z-index:2;max-width:40%;pointer-events:none;"></div>

        <!-- Song list (right-aligned) -->
        <div style="flex:1;display:flex;justify-content:flex-end;overflow:hidden;padding:0 24px 0 0;">
          <div class="song-list-container" style="width:min(100%, 480px);display:flex;flex-direction:column;gap:8px;min-height:0;">
            <div id="song-list" class="zzz-scroll" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:6px;padding-right:4px;"></div>
            <!-- Import button at bottom of list, full width -->
            <div style="flex-shrink:0;padding:4px 0;">
              <label class="zzz-btn zzz-btn--primary zzz-btn--sm zzz-import-btn" style="cursor:pointer;display:block;width:100%;text-align:center;" for="osz-input">IMPORT .OSZ</label>
              <input type="file" id="osz-input" accept=".osz" style="display:none;" multiple />
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async init() {
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
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'ArrowUp') { e.preventDefault(); this._navigateUp(); }
      else if (e.code === 'ArrowDown') { e.preventDefault(); this._navigateDown(); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); this._navigateDiffLeft(); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); this._navigateDiffRight(); }
      else if (e.code === 'Enter') { e.preventDefault(); this._confirmSong(); }
      else if (e.code === 'Escape') { e.preventDefault(); this.screens.show('main-menu'); }
      else if (e.code === 'Delete') { e.preventDefault(); this._deleteSelected(); }
    };
    window.addEventListener('keydown', this._keyHandler);

    if (this.three) this.three.createTVMonitor();
  }

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
    if (this._filteredIndices.length > 0 && !this._filteredIndices.includes(this.selectedIndex)) {
      this._selectSong(this._filteredIndices[0]);
    } else if (this._filteredIndices.length === 0) {
      this._renderEmptyState();
    }
  }

  _navigateUp() {
    const pos = this._filteredIndices.indexOf(this.selectedIndex);
    if (pos > 0) this._selectSong(this._filteredIndices[pos - 1]);
  }
  _navigateDown() {
    const pos = this._filteredIndices.indexOf(this.selectedIndex);
    if (pos < this._filteredIndices.length - 1) this._selectSong(this._filteredIndices[pos + 1]);
  }
  _navigateDiffLeft() {
    if (this.selectedDiffIndex > 0) this._selectDifficulty(this.selectedDiffIndex - 1);
  }
  _navigateDiffRight() {
    const set = this.beatmapSets[this.selectedIndex];
    if (set && this.selectedDiffIndex < set.difficulties.length - 1) this._selectDifficulty(this.selectedDiffIndex + 1);
  }

  _renderSongList() {
    const list = document.getElementById('song-list');
    if (!list) return;
    list.innerHTML = '';

    if (this._filteredIndices.length === 0 && this.beatmapSets.length > 0) {
      list.innerHTML = `<div style="text-align:center;padding:40px;color:var(--zzz-muted);font-family:var(--zzz-font);font-size:14px;">NO MATCHES FOUND</div>`;
      return;
    }
    if (this._filteredIndices.length === 0 && this.beatmapSets.length === 0) {
      this._renderEmptyState();
      return;
    }

    this._filteredIndices.forEach((setIndex) => {
      const set = this.beatmapSets[setIndex];
      const isSelected = setIndex === this.selectedIndex;
      const isExpanded = setIndex === this._expandedCard;
      const card = this._createSongCard(set, setIndex, isSelected, isExpanded);
      list.appendChild(card);
    });
  }

  _createSongCard(set, setIndex, isSelected, isExpanded) {
    const wrapper = document.createElement('div');
    wrapper.className = 'song-card-wrapper';
    wrapper.dataset.index = setIndex;

    const card = document.createElement('div');
    card.className = 'song-card' + (isSelected ? ' active' : '');

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
          ${set.difficulties.length > 1 ? `<span class="song-card-diff-count">${isExpanded ? '▲' : '▼'} ${set.difficulties.length}</span>` : ''}
        </div>
      </div>
      <button class="song-card-delete" data-delete="${setIndex}" title="Delete">✕</button>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('song-card-delete') || e.target.closest('.song-card-delete')) return;
      if (e.target.classList.contains('song-card-diff-count') && set.difficulties.length > 1) {
        e.stopPropagation();
        this._toggleExpand(setIndex);
        return;
      }
      const now = Date.now();
      if (this.selectedIndex === setIndex && now - this._lastSelectTime < 400) {
        this._confirmSong();
      } else {
        this._selectSong(setIndex);
      }
      this._lastSelectTime = now;
    });

    // Delete button
    const deleteBtn = card.querySelector('.song-card-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._deleteMap(setIndex);
      });
    }

    wrapper.appendChild(card);

    // Difficulty dropdown (simplified: stars + name only)
    if (isExpanded && set.difficulties.length > 1) {
      const diffList = document.createElement('div');
      diffList.className = 'diff-dropdown';
      diffList.style.cssText = `display:flex;flex-direction:column;gap:3px;padding:4px 8px 8px 72px;`;

      set.difficulties.forEach((diff, diffIdx) => {
        const s = diff.difficulty?.stars || 0;
        const c = DifficultyAnalyzer.getStarColor(s);
        const n = DifficultyAnalyzer.getDiffName(s);
        const isActive = isSelected && diffIdx === this.selectedDiffIndex;

        const diffRow = document.createElement('div');
        diffRow.className = 'diff-dropdown-item' + (isActive ? ' active' : '');
        diffRow.style.cssText = `
          display:flex;align-items:center;gap:10px;
          padding:8px 14px;border-radius:12px;cursor:pointer;
          transition:all 0.12s ease;
          background:${isActive ? 'rgba(170,255,0,0.08)' : 'rgba(26,26,26,0.6)'};
          border:none;
        `;
        diffRow.innerHTML = `
          <span style="color:${c};font-family:var(--zzz-font);font-weight:900;font-size:13px;min-width:48px;">★ ${s.toFixed(1)}</span>
          <span style="color:${isActive ? c : 'var(--zzz-text)'};font-family:var(--zzz-font);font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">${this._escHtml(diff.version || n)}</span>
        `;

        diffRow.addEventListener('click', (e) => {
          e.stopPropagation();
          this._selectSong(setIndex);
          this._selectDifficulty(diffIdx);
        });
        diffRow.addEventListener('mouseenter', () => {
          if (!isActive) { diffRow.style.background = 'rgba(42,42,42,0.7)'; }
        });
        diffRow.addEventListener('mouseleave', () => {
          if (!isActive) { diffRow.style.background = 'rgba(26,26,26,0.6)'; }
        });

        diffList.appendChild(diffRow);
      });
      wrapper.appendChild(diffList);
    }

    return wrapper;
  }

  _toggleExpand(setIndex) {
    this._expandedCard = this._expandedCard === setIndex ? -1 : setIndex;
    this._renderSongList();
  }

  _escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // ─── Delete ──────────────────────────────────────────────────────

  async _deleteMap(setIndex) {
    const set = this.beatmapSets[setIndex];
    if (!set) return;
    try {
      const { BeatmapStore } = await import('../../game/OszLoader.js');
      await BeatmapStore.delete(set.id);
    } catch (err) {
      console.warn('Failed to delete from IndexedDB:', err);
    }
    this.beatmapSets.splice(setIndex, 1);
    if (this.selectedIndex === setIndex) {
      this.selectedIndex = -1;
      this.selectedDiffIndex = 0;
      this._expandedCard = -1;
    } else if (this.selectedIndex > setIndex) {
      this.selectedIndex--;
    }
    this._buildFilteredIndices();
    this._renderSongList();
    if (this.beatmapSets.length > 0 && this.selectedIndex >= 0) {
      this._selectSong(Math.min(this.selectedIndex, this.beatmapSets.length - 1));
    } else if (this.beatmapSets.length > 0) {
      this._selectSong(0);
    } else {
      this._renderEmptyState();
      const info = document.getElementById('ss-song-info');
      if (info) info.innerHTML = '';
    }
  }

  _deleteSelected() {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.beatmapSets.length) {
      this._deleteMap(this.selectedIndex);
    }
  }

  // ─── Song Selection ───────────────────────────────────────────────

  _selectSong(setIndex) {
    if (setIndex < 0 || setIndex >= this.beatmapSets.length) return;
    this.selectedIndex = setIndex;
    this.selectedDiffIndex = 0;
    this._expandedCard = setIndex;
    const set = this.beatmapSets[setIndex];

    this._renderSongList();

    const activeCard = document.querySelector(`.song-card-wrapper[data-index="${setIndex}"]`);
    if (activeCard) activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Update TV
    if (this.three) {
      if (set.backgroundUrl) this.three.setTVTexture(set.backgroundUrl);
      else this.three.setTVStatic();
    }

    this._renderSongInfo(set);
    this._playPreview(set);
    EventBus.emit('song:select', { map: set });
  }

  _selectDifficulty(diffIndex) {
    const set = this.beatmapSets[this.selectedIndex];
    if (!set || diffIndex < 0 || diffIndex >= set.difficulties.length) return;
    this.selectedDiffIndex = diffIndex;
    this._renderSongInfo(set);
    this._renderSongList();
  }

  // ─── Song Info (top-left) ────────────────────────────────────

  _renderSongInfo(set) {
    const info = document.getElementById('ss-song-info');
    if (!info) return;

    const diff = set.difficulties[this.selectedDiffIndex] || set.difficulties[0];
    if (!diff) return;

    const stars = diff.difficulty?.stars || 0;
    const starColor = DifficultyAnalyzer.getStarColor(stars);
    const diffName = DifficultyAnalyzer.getDiffName(stars);
    const bpm = diff.metadata?.bpm || 0;
    const duration = diff.metadata?.duration || 0;
    const durationSec = Math.floor(duration / 1000);
    const durationStr = `${Math.floor(durationSec / 60)}:${(durationSec % 60).toString().padStart(2, '0')}`;

    info.innerHTML = `
      <div style="font-family:var(--zzz-font);font-weight:900;font-size:26px;color:var(--zzz-text);text-transform:uppercase;letter-spacing:0.06em;line-height:1.1;word-break:break-word;text-shadow:0 2px 16px rgba(0,0,0,0.9);">${this._escHtml(set.title)}</div>
      <div style="font-family:var(--zzz-font);font-weight:500;font-size:14px;color:var(--zzz-muted);margin-top:3px;text-shadow:0 1px 8px rgba(0,0,0,0.9);">${this._escHtml(set.artist)}</div>
      <div style="display:flex;gap:16px;margin-top:8px;align-items:baseline;flex-wrap:wrap;">
        <span style="color:${starColor};font-family:var(--zzz-font);font-weight:900;font-size:18px;text-shadow:0 0 12px ${starColor}40;">★ ${stars.toFixed(1)}</span>
        <span style="color:${starColor};font-family:var(--zzz-font);font-weight:700;font-size:12px;text-transform:uppercase;">${diffName}</span>
        <span style="color:var(--zzz-muted);font-family:var(--zzz-font);font-size:12px;">${bpm} BPM · ${durationStr}</span>
      </div>
      <button id="song-play-btn" class="zzz-btn zzz-btn--primary zzz-btn--sm" style="margin-top:10px;pointer-events:auto;">▶ PLAY</button>
    `;
    document.getElementById('song-play-btn')?.addEventListener('click', () => this._confirmSong());
  }

  _renderEmptyState() {
    const info = document.getElementById('ss-song-info');
    if (info) info.innerHTML = '';

    const list = document.getElementById('song-list');
    if (!list) return;

    list.innerHTML = `
      <div style="text-align:center;padding:60px 0;display:flex;flex-direction:column;align-items:center;gap:20px;">
        <div class="zzz-title" style="font-size:24px;color:var(--zzz-muted);">NO BEATMAPS LOADED</div>
        <div style="color:var(--zzz-muted);font-size:14px;">Import .osz files to get started</div>
        <label class="zzz-btn zzz-btn--primary" style="cursor:pointer;display:inline-block;" for="osz-input">IMPORT .OSZ</label>
      </div>
    `;
  }

  // ─── Audio Preview ────────────────────────────────────────────────

  _playPreview(set) {
    this._stopPreview();
    if (!set.audioBuffer) return;

    const previewTime = set.difficulties[this.selectedDiffIndex]?.metadata?.previewTime || 0;
    this.audio._ensureCtx();
    this.audio.fadeTo(0, 0.2);
    this._previewFadeTimeout = setTimeout(() => {
      if (set !== this.beatmapSets[this.selectedIndex]) return;
      this.audio.play(set.audioBuffer, Math.max(0, previewTime));
      this.audio.fadeTo(0.4, 0.4);
    }, 250);
  }

  _stopPreview() {
    if (this._previewFadeTimeout) { clearTimeout(this._previewFadeTimeout); this._previewFadeTimeout = null; }
    if (this._previewInterval) { clearInterval(this._previewInterval); this._previewInterval = null; }
    this.audio.fadeTo(0, 0.15);
    setTimeout(() => { this.audio.stop(); }, 200);
  }

  // ─── Confirm / Play ───────────────────────────────────────────────

  _confirmSong() {
    const set = this.beatmapSets[this.selectedIndex];
    if (!set) return;
    const diff = set.difficulties[this.selectedDiffIndex];
    if (!diff) return;

    this._stopPreview();

    const map = {
      metadata: { ...(set.metadata || {}), ...diff.metadata, title: set.title, artist: set.artist, version: diff.version, creator: set.creator },
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
      try { this.beatmapSets.push(await this.oszLoader.load(file)); }
      catch (err) { console.error('Failed to load .osz:', err); }
    }
    const oszInput = document.getElementById('osz-input');
    if (oszInput) oszInput.value = '';
    this._buildFilteredIndices();
    this._renderSongList();
    if (this.beatmapSets.length > 0) this._selectSong(this.beatmapSets.length - 1);
  }

  // ─── Destroy ──────────────────────────────────────────────────────

  destroy() {
    if (this._keyHandler) { window.removeEventListener('keydown', this._keyHandler); this._keyHandler = null; }
    this._stopPreview();
    if (this.three) this.three.removeTVMonitor();
  }
}
