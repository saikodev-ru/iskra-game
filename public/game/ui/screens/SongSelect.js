import EventBus from '../../core/EventBus.js';
import OszLoader from '../../game/OszLoader.js';
import DifficultyAnalyzer from '../../game/DifficultyAnalyzer.js';
import ZZZTheme from '../../theme/ZZZTheme.js';

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
    this._parallaxEls = [];
  }

  /** Get local record for a beatmap difficulty */
  _getRecord(setId, diffVersion) {
    try {
      const key = `rhythm-record-${setId}-${(diffVersion || '').replace(/[^a-zA-Z0-9]/g, '_')}`;
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  /** Save local record for a beatmap difficulty */
  static saveRecord(setId, diffVersion, score, rank) {
    try {
      const key = `rhythm-record-${setId}-${(diffVersion || '').replace(/[^a-zA-Z0-9]/g, '_')}`;
      const existing = JSON.parse(localStorage.getItem(key) || 'null');
      if (!existing || score > existing.score) {
        localStorage.setItem(key, JSON.stringify({ score, rank }));
      }
    } catch (_) {}
  }

  build() {
    return `
      <div style="width:100%;height:100%;position:relative;display:flex;flex-direction:column;">
        <!-- Song info (top-left) with parallax -->
        <div id="ss-song-info" class="parallax-layer" data-parallax="5" style="position:absolute;top:16px;left:24px;z-index:2;max-width:45%;pointer-events:none;"></div>

        <!-- Right column: back + search + list -->
        <div id="ss-right-column" class="parallax-layer" data-parallax="2" style="flex:1;display:flex;justify-content:flex-end;overflow:hidden;padding:16px 24px 0 0;">
          <div class="song-list-column" style="width:100%;max-width:460px;display:flex;flex-direction:column;gap:8px;min-height:0;overflow:hidden;">
            <!-- Top bar -->
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
              <button id="back-btn" class="zzz-btn zzz-btn--sm">← BACK</button>
              <input type="text" class="zzz-search" id="song-search" placeholder="SEARCH..." style="flex:1;min-width:0;font-size:13px;padding:8px 16px;" />
            </div>
            <!-- Song list — osu!lazer carousel style -->
            <div id="song-list" class="zzz-scroll" style="flex:1;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;gap:4px;padding-right:4px;min-height:0;"></div>
            <!-- Import button -->
            <div style="flex-shrink:0;padding:4px 0 6px;">
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
      this.beatmapSets = [];
    }

    this._buildFilteredIndices();
    this._renderSongList();
    if (this.beatmapSets.length > 0) this._selectSong(0);
    else this._renderEmptyState();

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

    if (this.three) {
      // Enable CRT effect on song select
      this.three.setCrtIntensity(0.7);
      // Create CRT overlay for additional scanline effect
      ZZZTheme.createCrtOverlay();
    }

    // Add parallax
    const info = document.getElementById('ss-song-info');
    const right = document.getElementById('ss-right-column');
    if (info) { ZZZTheme.addParallax(info, 5); this._parallaxEls.push(info); }
    if (right) { ZZZTheme.addParallax(right, 2); this._parallaxEls.push(right); }
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
      list.appendChild(this._createSongCard(set, setIndex, isSelected, isExpanded));
    });
  }

  _createSongCard(set, setIndex, isSelected, isExpanded) {
    const wrapper = document.createElement('div');
    wrapper.className = 'song-card-wrapper';
    wrapper.dataset.index = setIndex;

    const card = document.createElement('div');
    card.className = 'song-card' + (isSelected ? ' active' : '');

    card.innerHTML = `
      <div class="song-card-thumb" style="${set.backgroundUrl ? `background-image:url('${set.backgroundUrl}')` : set.videoUrl ? 'background:linear-gradient(135deg,#1a1a2e,#16213e);' : 'background:var(--zzz-graphite);'}">${set.videoUrl && !set.backgroundUrl ? '<span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:18px;opacity:0.4;">▶</span>' : ''}</div>
      <div class="song-card-info">
        <div class="song-card-title-row">
          <span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this._escHtml(set.title)}${set.videoUrl ? ' <span style="font-size:9px;color:var(--zzz-muted);vertical-align:middle;opacity:0.5;">🎬</span>' : ''}</span>
          ${set.difficulties.length > 1 ? `<span class="song-card-diff-count">${isExpanded ? '▲' : '▼'} ${set.difficulties.length}</span>` : ''}
        </div>
        <div class="song-card-artist">${this._escHtml(set.artist)}</div>
      </div>
      <button class="song-card-delete" data-delete="${setIndex}" title="Delete">✕</button>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('song-card-delete') || e.target.closest('.song-card-delete')) return;
      if (e.target.classList.contains('song-card-diff-count') && set.difficulties.length > 1) {
        e.stopPropagation(); this._toggleExpand(setIndex); return;
      }
      const now = Date.now();
      if (this.selectedIndex === setIndex && now - this._lastSelectTime < 400) this._confirmSong();
      else this._selectSong(setIndex);
      this._lastSelectTime = now;
    });

    const deleteBtn = card.querySelector('.song-card-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); this._deleteMap(setIndex); });
    }

    wrapper.appendChild(card);

    // Difficulty dropdown
    if (isExpanded && set.difficulties.length > 1) {
      const diffList = document.createElement('div');
      diffList.className = 'diff-dropdown';
      diffList.style.cssText = `display:flex;flex-direction:column;gap:4px;padding:4px 8px 6px;`;

      set.difficulties.forEach((diff, diffIdx) => {
        const s = diff.difficulty?.stars || 0;
        const c = DifficultyAnalyzer.getStarColor(s);
        const isActive = isSelected && diffIdx === this.selectedDiffIndex;

        // Build 10-star spectrum
        const starSpectrumHtml = this._buildStarSpectrum(s, c);

        // Get local record
        const record = this._getRecord(set.id, diff.version);
        const recordHtml = record
          ? `<span class="diff-record diff-record--has">${record.score.toLocaleString()}</span>`
          : `<span class="diff-record diff-record--none">?</span>`;

        const diffRow = document.createElement('div');
        diffRow.className = 'diff-dropdown-item' + (isActive ? ' active' : '');
        diffRow.style.cssText = `
          display:flex;align-items:center;gap:8px;
          padding:7px 12px;border-radius:16px;cursor:pointer;
          transition:all 0.15s cubic-bezier(0.4,0,0.2,1);
          background:${isActive ? 'rgba(170,255,0,0.08)' : 'rgba(0,0,0,0.6)'};
          border:2px solid ${isActive ? 'var(--zzz-lime)' : 'transparent'};
          ${isActive ? 'box-shadow:0 0 12px rgba(170,255,0,0.12),inset 0 0 20px rgba(170,255,0,0.03);' : ''}
        `;
        diffRow.innerHTML = `
          <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;">
            <span style="color:${isActive ? c : 'var(--zzz-text)'};font-family:var(--zzz-font);font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this._escHtml(diff.version || 'NORMAL')}</span>
            ${starSpectrumHtml}
          </div>
          ${recordHtml}
        `;

        diffRow.addEventListener('click', (e) => {
          e.stopPropagation();
          // Don't call _selectSong — we're on the same track, just change difficulty
          this._selectDifficulty(diffIdx);
        });
        diffRow.addEventListener('mouseenter', () => {
          if (!isActive) diffRow.style.background = 'rgba(30,30,30,0.8)';
        });
        diffRow.addEventListener('mouseleave', () => {
          if (!diffRow.classList.contains('active')) diffRow.style.background = 'rgba(0,0,0,0.6)';
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

  /** Build a 10-star spectrum bar HTML string */
  _buildStarSpectrum(stars, color, large = false) {
    const partial = stars - Math.floor(stars); // e.g. 0.7 for ★3.7
    const starSize = large ? 16 : 10;
    const numSize = large ? 14 : 10;
    const gap = large ? 2 : 1;
    let html = `<div class="star-spectrum" style="gap:${gap}px;">`;
    for (let i = 1; i <= 10; i++) {
      if (i <= Math.floor(stars)) {
        // Fully filled star
        html += `<span class="star filled" style="color:${color};font-size:${starSize}px;">★</span>`;
      } else if (i === Math.ceil(stars) && partial >= 0.3) {
        // Partially filled star — show filled but slightly dimmer
        html += `<span class="star filled" style="color:${color};opacity:${0.4 + partial * 0.6};font-size:${starSize}px;">★</span>`;
      } else {
        // Empty star
        html += `<span class="star empty" style="color:${color};font-size:${starSize}px;">★</span>`;
      }
    }
    html += `<span style="font-family:var(--zzz-font);font-weight:700;font-size:${numSize}px;color:${color};margin-left:4px;opacity:0.8;">${stars.toFixed(1)}</span>`;
    html += '</div>';
    return html;
  }

  async _deleteMap(setIndex) {
    const set = this.beatmapSets[setIndex];
    if (!set) return;
    try {
      const { BeatmapStore } = await import('../../game/OszLoader.js');
      await BeatmapStore.delete(set.id);
    } catch (err) { console.warn('Failed to delete:', err); }
    this.beatmapSets.splice(setIndex, 1);
    if (this.selectedIndex === setIndex) { this.selectedIndex = -1; this.selectedDiffIndex = 0; this._expandedCard = -1; }
    else if (this.selectedIndex > setIndex) this.selectedIndex--;
    this._buildFilteredIndices();
    this._renderSongList();
    if (this.beatmapSets.length > 0 && this.selectedIndex >= 0) this._selectSong(Math.min(this.selectedIndex, this.beatmapSets.length - 1));
    else if (this.beatmapSets.length > 0) this._selectSong(0);
    else { this._renderEmptyState(); const info = document.getElementById('ss-song-info'); if (info) info.innerHTML = ''; }
  }

  _deleteSelected() {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.beatmapSets.length) this._deleteMap(this.selectedIndex);
  }

  _selectSong(setIndex, fromDiffSwitch = false) {
    if (setIndex < 0 || setIndex >= this.beatmapSets.length) return;
    const isSongChange = setIndex !== this.selectedIndex;
    this.selectedIndex = setIndex;
    if (!fromDiffSwitch) this.selectedDiffIndex = 0;
    this._expandedCard = setIndex;
    const set = this.beatmapSets[setIndex];

    this._updateSelection();

    const activeCard = document.querySelector(`.song-card-wrapper[data-index="${setIndex}"]`);
    if (activeCard) activeCard.scrollIntoView({ behavior: fromDiffSwitch ? 'auto' : 'smooth', block: 'nearest' });

    if (this.three) {
      // Trigger glitch transition when switching to a different song
      if (isSongChange) {
        this.three.triggerGlitch(0.8);
        ZZZTheme.glitchTransition(this.three.canvas);
      }

      // Use video if available, otherwise use image background
      if (set.videoUrl) {
        this.three.setBackgroundVideo(set.videoUrl, this.audio);
      } else if (set.backgroundUrl) {
        this.three.setTVTexture(set.backgroundUrl);
      } else {
        this.three.setTVStatic();
      }
    }

    this._renderSongInfo(set);
    this._playPreview(set);
    EventBus.emit('song:select', { map: set });
  }

  _selectDifficulty(diffIndex) {
    const set = this.beatmapSets[this.selectedIndex];
    if (!set || diffIndex < 0 || diffIndex >= set.difficulties.length) return;
    this.selectedDiffIndex = diffIndex;
    this._updateSelection();
    this._renderSongInfo(set);
    // Don't restart preview when just switching difficulty on same song
    // — just update the info, preview keeps playing
  }

  /** Update selection/diff highlight in-place without full re-render */
  _updateSelection() {
    const list = document.getElementById('song-list');
    if (!list) return;

    // Update active class on song cards
    const wrappers = list.querySelectorAll('.song-card-wrapper');
    wrappers.forEach((wrapper) => {
      const idx = parseInt(wrapper.dataset.index);
      const card = wrapper.querySelector('.song-card');
      if (!card) return;

      const isSelected = idx === this.selectedIndex;
      const isExpanded = idx === this._expandedCard;
      const set = this.beatmapSets[idx];

      // Toggle active class
      card.classList.toggle('active', isSelected);

      // Update diff count arrow
      const diffCount = card.querySelector('.song-card-diff-count');
      if (diffCount && set.difficulties.length > 1) {
        diffCount.textContent = `${isExpanded ? '▲' : '▼'} ${set.difficulties.length}`;
      }

      // Rebuild diff dropdown only for the relevant wrappers
      const existingDropdown = wrapper.querySelector('.diff-dropdown');
      if (existingDropdown) existingDropdown.remove();

      if (isExpanded && set.difficulties.length > 1) {
        const diffList = document.createElement('div');
        diffList.className = 'diff-dropdown';
        diffList.style.cssText = `display:flex;flex-direction:column;gap:4px;padding:4px 8px 6px;`;

        set.difficulties.forEach((diff, diffIdx) => {
          const s = diff.difficulty?.stars || 0;
          const c = DifficultyAnalyzer.getStarColor(s);
          const isActive = isSelected && diffIdx === this.selectedDiffIndex;

          const starSpectrumHtml = this._buildStarSpectrum(s, c);

          const record = this._getRecord(set.id, diff.version);
          const recordHtml = record
            ? `<span class="diff-record diff-record--has">${record.score.toLocaleString()}</span>`
            : `<span class="diff-record diff-record--none">?</span>`;

          const diffRow = document.createElement('div');
          diffRow.className = 'diff-dropdown-item' + (isActive ? ' active' : '');
          diffRow.style.cssText = `
            display:flex;align-items:center;gap:8px;
            padding:7px 12px;border-radius:16px;cursor:pointer;
            transition:all 0.15s cubic-bezier(0.4,0,0.2,1);
            background:${isActive ? 'rgba(170,255,0,0.08)' : 'rgba(0,0,0,0.6)'};
            border:2px solid ${isActive ? 'var(--zzz-lime)' : 'transparent'};
            ${isActive ? 'box-shadow:0 0 12px rgba(170,255,0,0.12),inset 0 0 20px rgba(170,255,0,0.03);' : ''}
          `;
          diffRow.innerHTML = `
            <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;">
              <span style="color:${isActive ? c : 'var(--zzz-text)'};font-family:var(--zzz-font);font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this._escHtml(diff.version || 'NORMAL')}</span>
              ${starSpectrumHtml}
            </div>
            ${recordHtml}
          `;

          diffRow.addEventListener('click', (e) => {
            e.stopPropagation();
            this._selectDifficulty(diffIdx);
          });
          diffRow.addEventListener('mouseenter', () => {
            if (!isActive) diffRow.style.background = 'rgba(30,30,30,0.8)';
          });
          diffRow.addEventListener('mouseleave', () => {
            if (!diffRow.classList.contains('active')) diffRow.style.background = 'rgba(0,0,0,0.6)';
          });

          diffList.appendChild(diffRow);
        });
        wrapper.appendChild(diffList);
      }
    });
  }

  _renderSongInfo(set) {
    const info = document.getElementById('ss-song-info');
    if (!info) return;

    const diff = set.difficulties[this.selectedDiffIndex] || set.difficulties[0];
    if (!diff) return;

    const stars = diff.difficulty?.stars || 0;
    const starColor = DifficultyAnalyzer.getStarColor(stars);
    const bpm = diff.metadata?.bpm || 0;
    const duration = diff.metadata?.duration || 0;
    const durationSec = Math.floor(duration / 1000);
    const durationStr = `${Math.floor(durationSec / 60)}:${(durationSec % 60).toString().padStart(2, '0')}`;

    // Local record for selected difficulty
    const record = this._getRecord(set.id, diff.version);
    const recordHtml = record
      ? `<span style="color:var(--zzz-lime);font-family:var(--zzz-font);font-weight:900;font-size:14px;">${record.score.toLocaleString()}</span><span style="color:var(--zzz-muted);font-family:var(--zzz-font);font-size:11px;margin-left:6px;">BEST</span>`
      : `<span style="color:rgba(255,255,255,0.15);font-family:var(--zzz-font);font-weight:700;font-size:14px;">—</span><span style="color:rgba(255,255,255,0.15);font-family:var(--zzz-font);font-size:11px;margin-left:6px;">NO RECORD</span>`;

    // Star spectrum for the info panel (larger stars)
    const infoStarSpectrum = this._buildStarSpectrum(stars, starColor, true);

    info.innerHTML = `
      <div style="font-family:var(--zzz-font);font-weight:900;font-size:40px;color:var(--zzz-text);text-transform:uppercase;letter-spacing:0.06em;line-height:1.05;word-break:break-word;text-shadow:0 2px 20px rgba(0,0,0,0.9);">${this._escHtml(set.title)}</div>
      <div style="font-family:var(--zzz-font);font-weight:500;font-size:15px;color:var(--zzz-muted);margin-top:4px;text-shadow:0 1px 10px rgba(0,0,0,0.9);">${this._escHtml(set.artist)}</div>
      <div style="margin-top:10px;">${infoStarSpectrum}</div>
      <div style="display:flex;gap:14px;margin-top:6px;align-items:baseline;flex-wrap:wrap;">
        <span style="color:var(--zzz-muted);font-family:var(--zzz-font);font-size:12px;">${bpm} BPM · ${durationStr}</span>
      </div>
      <div style="margin-top:8px;display:flex;align-items:baseline;gap:4px;">${recordHtml}</div>
      <button id="song-play-btn" class="zzz-btn zzz-btn--primary" style="margin-top:16px;pointer-events:auto;font-size:28px;padding:20px 56px;letter-spacing:0.12em;border-radius:16px;">▶ PLAY</button>
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

  _playPreview(set) {
    this._stopPreview();
    if (!set.audioBuffer) return;
    const previewTime = set.difficulties[this.selectedDiffIndex]?.metadata?.previewTime || 0;
    const savedVolume = parseInt(localStorage.getItem('rhythm-os-volume') || '70') / 100;
    const previewVolume = savedVolume * 0.5;
    this.audio._ensureCtx();
    this.audio.fadeTo(0, 0.2);
    this._previewFadeTimeout = setTimeout(() => {
      if (set !== this.beatmapSets[this.selectedIndex]) return;
      this.audio.play(set.audioBuffer, Math.max(0, previewTime));
      this.audio.fadeTo(previewVolume, 0.4);
      // Sync video to preview time if video is playing
      // Note: video may not be ready yet (async load), ThreeScene.update() handles sync once it's ready
      if (this.three && set.videoUrl && this.three._videoActive && this.three._videoElement) {
        try {
          this.three._videoElement.currentTime = Math.max(0, previewTime);
          this.three._videoElement.play().catch(() => {});
        } catch (_) { /* video not seekable yet */ }
      }
    }, 250);
  }

  _stopPreview() {
    if (this._previewFadeTimeout) { clearTimeout(this._previewFadeTimeout); this._previewFadeTimeout = null; }
    if (this._previewInterval) { clearInterval(this._previewInterval); this._previewInterval = null; }
    this.audio.fadeTo(0, 0.15);
    // Pause video preview
    if (this.three && this.three._videoElement) {
      this.three._videoElement.pause();
    }
    setTimeout(() => { this.audio.stop(); }, 200);
  }

  _confirmSong() {
    const set = this.beatmapSets[this.selectedIndex];
    if (!set) return;
    const diff = set.difficulties[this.selectedDiffIndex];
    if (!diff) return;
    this._stopPreview();
    const map = {
      metadata: { ...(set.metadata || {}), ...diff.metadata, setId: set.id, title: set.title, artist: set.artist, version: diff.version, creator: set.creator },
      audioBuffer: set.audioBuffer, backgroundUrl: set.backgroundUrl, videoUrl: set.videoUrl,
      notes: diff.notes, laneCount: diff.laneCount, bpmChanges: diff.bpmChanges, difficulty: diff.difficulty
    };
    this.screens.show('game', { map });
  }

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

  destroy() {
    if (this._keyHandler) { window.removeEventListener('keydown', this._keyHandler); this._keyHandler = null; }
    this._stopPreview();
    if (this.three) {
      this.three.removeTVMonitor(); // no-op but safe
      this.three._clearBackgroundVideo();
      this.three._clearBackgroundImage();
      // Disable CRT effect when leaving song select
      this.three.setCrtIntensity(0);
    }
    // Remove CRT overlay
    ZZZTheme.removeCrtOverlay();
    // Clean up parallax
    for (const el of this._parallaxEls) ZZZTheme.removeParallax(el);
    this._parallaxEls = [];
  }
}
