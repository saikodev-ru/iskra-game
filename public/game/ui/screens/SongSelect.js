import EventBus from '../../core/EventBus.js';
import OszLoader from '../../game/OszLoader.js';
import DifficultyAnalyzer from '../../game/DifficultyAnalyzer.js';
import RecordStore from '../../game/RecordStore.js';
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

    // Drag-to-scroll state (osu!-style)
    this._dragScrolling = false;
    this._dragStartY = 0;
    this._dragStartScrollTop = 0;
    this._dragMoved = false;
    this._dragButton = 0;
    this._dragHandler = null;
    this._dragUpHandler = null;

    // Transition state
    this._transitioning = false;
    this._leavingToGame = false;  // true when transitioning to game screen
    this._leavingToMenu = false;  // true when going back to main menu (keep audio playing)
    this._initialized = false;  // true after first init() completes
  }

  /** Navigate back to main menu — keeps music preview playing */
  _goBackToMenu() {
    this._leavingToMenu = true;
    this.screens.show('main-menu');
  }

  /** Get local best record for a beatmap difficulty (legacy compat) */
  _getRecord(setId, diffVersion) {
    return RecordStore.getBest(setId, diffVersion);
  }

  /** Get all records for a beatmap difficulty */
  _getAllRecords(setId, diffVersion) {
    return RecordStore.getAll(setId, diffVersion);
  }

  build() {
    return `
      <div style="width:100%;height:100%;position:relative;display:flex;flex-direction:column;">
        <!-- Loading overlay -->
        <div id="ss-loading" class="ss-loading">
          <div class="ss-loading-spinner"></div>
          <div class="ss-loading-text">RHYMIX</div>
        </div>

        <!-- Slight darken background -->
        <div style="position:absolute;inset:0;z-index:0;background:rgba(0,0,0,0.08);pointer-events:none;"></div>

        <!-- Subtle vignette overlay (behind UI panels) -->
        <div style="position:absolute;inset:0;z-index:0;pointer-events:none;background:radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.06) 72%, rgba(0,0,0,0.15) 100%);"></div>

        <!-- Song info (top-right) with parallax -->
        <div id="ss-song-info" class="parallax-layer" data-parallax="5" style="position:absolute;top:20px;right:20px;z-index:10;width:clamp(280px, 42%, 440px);pointer-events:auto;text-align:right;"></div>

        <!-- PLAY button (bottom-right) with parallax -->
        <div id="ss-play-area" class="parallax-layer" data-parallax="5" style="position:absolute;bottom:28px;right:24px;z-index:10;pointer-events:auto;"></div>

        <!-- Left column: toolbar + search + list + actions -->
        <div id="ss-right-column" class="parallax-layer" data-parallax="2" style="flex:1;display:flex;justify-content:flex-start;overflow:hidden;padding:16px 0 0 24px;z-index:2;position:relative;">
          <!-- Gradient behind the entire left column — fades to black going left -->
          <div style="position:absolute;top:-40px;left:0;right:-80px;bottom:-40px;background:linear-gradient(270deg,transparent 0%,rgba(0,0,0,0.10) 30%,rgba(0,0,0,0.25) 70%,rgba(0,0,0,0.40) 100%);pointer-events:none;z-index:-1;"></div>
          <div class="song-list-column" style="width:100%;max-width:460px;display:flex;flex-direction:column;gap:10px;min-height:0;overflow:hidden;">

            <!-- Top toolbar: glass panel -->
            <div class="ss-toolbar">
              <button id="back-btn" class="ss-toolbar-btn" data-crt-click>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                <span>BACK</span>
              </button>
              <div class="ss-search-wrap">
                <svg class="ss-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" class="ss-search" id="song-search" placeholder="SEARCH SONGS..." />
              </div>
              <span class="ss-beatmap-count" id="ss-map-count"></span>
            </div>

            <!-- Song list with dynamic fade edges -->
            <div id="song-list" class="zzz-scroll ss-list" style="flex:1;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;gap:4px;padding-right:4px;min-height:0;"></div>

            <!-- Bottom action bar: glass panel -->
            <div class="ss-action-bar">
              <label class="ss-action-btn ss-action-btn--primary" style="cursor:pointer;" for="osz-input" data-crt-click>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <span>IMPORT</span>
              </label>
              <input type="file" id="osz-input" accept=".osz" style="display:none;" multiple />
              <button id="create-playlist-btn" class="ss-action-btn ss-action-btn--accent" data-crt-click>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                <span>PLAYLIST</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async init() {
    const loadingEl = document.getElementById('ss-loading');

    if (this._initialized) {
      // Already loaded data — just re-enable UI
      if (loadingEl) loadingEl.style.display = 'none';
      this._reenable();
      return;
    }
    this._initialized = true;

    try {
      const stored = await this.oszLoader.loadFromStore();
      this.beatmapSets = Array.isArray(stored) ? stored : [];
    } catch (err) {
      this.beatmapSets = [];
    }

    // Hide loading overlay
    if (loadingEl) loadingEl.style.display = 'none';

    this._buildFilteredIndices();
    this._renderSongList();
    if (this.beatmapSets.length > 0) this._restoreSelection();
    else this._renderEmptyState();

    document.getElementById('back-btn').addEventListener('click', () => this._goBackToMenu());
    document.getElementById('osz-input').addEventListener('change', (e) => this._handleOszFiles(e.target.files));
    document.getElementById('song-search').addEventListener('input', (e) => this._filterSongs(e.target.value));

    // Dynamic fade edges on song list scroll + drag-to-scroll (osu!-style)
    const songList = document.getElementById('song-list');
    if (songList) {
      songList.addEventListener('scroll', () => this._updateFadeEdges());
      // Initial update after render
      requestAnimationFrame(() => this._updateFadeEdges());

      // ── Drag-to-scroll: left-click or right-click drag ──
      songList.addEventListener('mousedown', (e) => {
        // Only left (0) or right (2) button
        if (e.button !== 0 && e.button !== 2) return;
        // Don't start drag on buttons or inputs
        if (e.target.closest('button, input, label, a')) return;

        this._dragScrolling = true;
        this._dragStartY = e.clientY;
        this._dragStartScrollTop = songList.scrollTop;
        this._dragMoved = false;
        this._dragButton = e.button;
        songList.style.cursor = 'grabbing';
        songList.style.userSelect = 'none';

        e.preventDefault();
      });

      // Prevent context menu on right-click (for right-click drag)
      songList.addEventListener('contextmenu', (e) => {
        e.preventDefault();
      });
    }

    // Global move/up handlers (so drag continues even outside the list)
    this._dragHandler = (e) => {
      if (!this._dragScrolling) return;
      const list = document.getElementById('song-list');
      if (!list) return;

      const dy = e.clientY - this._dragStartY;
      if (Math.abs(dy) > 3) this._dragMoved = true;
      list.scrollTop = this._dragStartScrollTop - dy;
    };
    this._dragUpHandler = (e) => {
      if (!this._dragScrolling) return;
      this._dragScrolling = false;
      const list = document.getElementById('song-list');
      if (list) {
        list.style.cursor = '';
        list.style.userSelect = '';
      }
      // Keep _dragMoved true briefly so the subsequent click event can check it
      setTimeout(() => { this._dragMoved = false; }, 50);
    };
    window.addEventListener('mousemove', this._dragHandler);
    window.addEventListener('mouseup', this._dragUpHandler);

    this._keyHandler = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'ArrowUp') { e.preventDefault(); this._navigateUp(); }
      else if (e.code === 'ArrowDown') { e.preventDefault(); this._navigateDown(); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); this._navigateDiffLeft(); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); this._navigateDiffRight(); }
      else if (e.code === 'Enter') { e.preventDefault(); this._confirmSong(); }
      else if (e.code === 'Escape') { e.preventDefault(); this._goBackToMenu(); }
      else if (e.code === 'Delete') { e.preventDefault(); this._deleteSelected(); }
    };
    window.addEventListener('keydown', this._keyHandler);

    if (this.three) {
      // Enable CRT effect on song select (scanlines, barrel distortion)
      this.three.setCrtIntensity(0.85);
      // Disable chromatic aberration (RGB shift) on song select — keep it clean
      this.three.setChromaticAberration(0);
      // Create CRT overlay for additional scanline effect
      ZZZTheme.createCrtOverlay();
    }

    // Add parallax
    const info = document.getElementById('ss-song-info');
    const playArea = document.getElementById('ss-play-area');
    const right = document.getElementById('ss-right-column');
    if (info) { ZZZTheme.addParallax(info, 5); this._parallaxEls.push(info); }
    if (playArea) { ZZZTheme.addParallax(playArea, 5); this._parallaxEls.push(playArea); }
    if (right) { ZZZTheme.addParallax(right, 2); this._parallaxEls.push(right); }

    // Listen for record changes (deletion from result screen)
    this._recordsChangedHandler = () => {
      if (this.selectedIndex >= 0) {
        this._renderSongInfo(this.beatmapSets[this.selectedIndex]);
        this._renderSongList();
      }
    };
    EventBus.on('records:changed', this._recordsChangedHandler);
  }

  /** Re-enable UI effects after returning from game (without reloading song data).
   *  Called by ScreenManager via main.js cached factory. */
  _reenable() {
    // Refresh the song list display (in case records changed from gameplay)
    this._buildFilteredIndices();
    this._renderSongList();

    // DOM event listeners (re-attach since DOM is rebuilt by build())
    const backBtn = document.getElementById('back-btn');
    if (backBtn) backBtn.addEventListener('click', () => this._goBackToMenu());
    const oszInput = document.getElementById('osz-input');
    if (oszInput) oszInput.addEventListener('change', (e) => this._handleOszFiles(e.target.files));
    const searchInput = document.getElementById('song-search');
    if (searchInput) searchInput.addEventListener('input', (e) => this._filterSongs(e.target.value));

    // Drag-to-scroll setup
    const songList = document.getElementById('song-list');
    if (songList) {
      songList.addEventListener('scroll', () => this._updateFadeEdges());
      requestAnimationFrame(() => this._updateFadeEdges());
      songList.addEventListener('mousedown', (e) => {
        if (e.button !== 0 && e.button !== 2) return;
        if (e.target.closest('button, input, label, a')) return;
        this._dragScrolling = true;
        this._dragStartY = e.clientY;
        this._dragStartScrollTop = songList.scrollTop;
        this._dragMoved = false;
        this._dragButton = e.button;
        songList.style.cursor = 'grabbing';
        songList.style.userSelect = 'none';
        e.preventDefault();
      });
      songList.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    // Window event listeners (re-add since destroy() removes them)
    this._dragHandler = (e) => {
      if (!this._dragScrolling) return;
      const list = document.getElementById('song-list');
      if (!list) return;
      const dy = e.clientY - this._dragStartY;
      if (Math.abs(dy) > 3) this._dragMoved = true;
      list.scrollTop = this._dragStartScrollTop - dy;
    };
    this._dragUpHandler = (e) => {
      if (!this._dragScrolling) return;
      this._dragScrolling = false;
      const list = document.getElementById('song-list');
      if (list) { list.style.cursor = ''; list.style.userSelect = ''; }
      setTimeout(() => { this._dragMoved = false; }, 50);
    };
    window.addEventListener('mousemove', this._dragHandler);
    window.addEventListener('mouseup', this._dragUpHandler);

    this._keyHandler = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'ArrowUp') { e.preventDefault(); this._navigateUp(); }
      else if (e.code === 'ArrowDown') { e.preventDefault(); this._navigateDown(); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); this._navigateDiffLeft(); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); this._navigateDiffRight(); }
      else if (e.code === 'Enter') { e.preventDefault(); this._confirmSong(); }
      else if (e.code === 'Escape') { e.preventDefault(); this._goBackToMenu(); }
      else if (e.code === 'Delete') { e.preventDefault(); this._deleteSelected(); }
    };
    window.addEventListener('keydown', this._keyHandler);

    // CRT effects
    if (this.three) {
      this.three.setCrtIntensity(0.85);
      this.three.setChromaticAberration(0);
      ZZZTheme.createCrtOverlay();
    }

    // Parallax
    const info = document.getElementById('ss-song-info');
    const playArea = document.getElementById('ss-play-area');
    const right = document.getElementById('ss-right-column');
    this._parallaxEls = [];
    if (info) { ZZZTheme.addParallax(info, 5); this._parallaxEls.push(info); }
    if (playArea) { ZZZTheme.addParallax(playArea, 5); this._parallaxEls.push(playArea); }
    if (right) { ZZZTheme.addParallax(right, 2); this._parallaxEls.push(right); }

    // EventBus listener for record changes
    this._recordsChangedHandler = () => {
      if (this.selectedIndex >= 0) {
        this._renderSongInfo(this.beatmapSets[this.selectedIndex]);
        this._renderSongList();
      }
    };
    EventBus.on('records:changed', this._recordsChangedHandler);

    // Render current selection info + auto-play preview
    if (this.selectedIndex >= 0 && this.selectedIndex < this.beatmapSets.length) {
      const set = this.beatmapSets[this.selectedIndex];
      this._renderSongInfo(set);
      this._renderPlayButton(set);
      // Restore Three.js background for selected song
      if (this.three) {
        if (set.videoUrl) {
          this.three.setBackgroundVideo(set.videoUrl, this.audio);
        } else if (set.backgroundUrl) {
          this.three.setTVTexture(set.backgroundUrl);
        } else {
          this.three.setTVStatic();
        }
      }
      this._playPreview(set);
    }
    EventBus.emit('song:select', { map: this.beatmapSets[this.selectedIndex] || null });
  }

  /** Update fade mask based on scroll position */
  _updateFadeEdges() {
    const list = document.getElementById('song-list');
    if (!list) return;

    const fadeSize = 36;
    const threshold = 48;
    const atTop = list.scrollTop < threshold;
    const maxScroll = list.scrollHeight - list.clientHeight;
    const atBottom = maxScroll - list.scrollTop < threshold;

    // Build dynamic mask gradient
    let mask;
    if (atTop && atBottom) {
      // Both edges hidden — no fade needed
      mask = 'none';
    } else if (atTop) {
      // Only fade bottom
      mask = `linear-gradient(to bottom, black 0px, black calc(100% - ${fadeSize}px), transparent 100%)`;
    } else if (atBottom) {
      // Only fade top
      mask = `linear-gradient(to bottom, transparent 0px, black ${fadeSize}px, black 100%)`;
    } else {
      // Fade both edges
      mask = `linear-gradient(to bottom, transparent 0px, black ${fadeSize}px, black calc(100% - ${fadeSize}px), transparent 100%)`;
    }

    list.style.webkitMaskImage = mask;
    list.style.maskImage = mask;
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

    // Update fade edges after content changes
    requestAnimationFrame(() => this._updateFadeEdges());
  }

  _createSongCard(set, setIndex, isSelected, isExpanded) {
    const wrapper = document.createElement('div');
    wrapper.className = 'song-card-wrapper';
    wrapper.dataset.index = setIndex;

    const card = document.createElement('div');
    card.className = 'song-card' + (isSelected ? ' active' : '');

    const maniaBadge = set.isMania
      ? '<span style="font-size:8px;color:var(--zzz-purple);background:rgba(168,85,247,0.15);border:1px solid rgba(168,85,247,0.3);border-radius:6px;padding:1px 5px;vertical-align:middle;margin-left:4px;font-weight:700;letter-spacing:0.05em;">MANIA</span>'
      : '';

    card.innerHTML = `
      <div class="song-card-thumb" style="${set.backgroundUrl ? `background-image:url('${set.backgroundUrl}')` : set.videoUrl ? 'background:linear-gradient(135deg,#1a1a2e,#16213e);' : 'background:var(--zzz-graphite);'}">${set.videoUrl && !set.backgroundUrl ? '<span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:18px;opacity:0.4;">▶</span>' : ''}</div>
      <div class="song-card-info">
        <div class="song-card-title-row">
          <span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this._escHtml(set.title)}${set.videoUrl ? ' <span style="font-size:9px;color:var(--zzz-muted);vertical-align:middle;opacity:0.5;">🎬</span>' : ''}${maniaBadge}</span>
        </div>
        <div class="song-card-artist">${this._escHtml(set.artist)}</div>
      </div>
      <div class="song-card-actions">
        ${set.difficulties.length > 1 ? `<span class="song-card-diff-count">${isExpanded ? '▲' : '▼'} ${set.difficulties.length}</span>` : ''}
        <button class="song-card-menu-btn" data-menu="${setIndex}">⋯</button>
      </div>
    `;

    // Diff count toggle
    const diffCount = card.querySelector('.song-card-diff-count');
    if (diffCount) {
      diffCount.addEventListener('click', (e) => {
        e.stopPropagation(); this._toggleExpand(setIndex);
      });
    }

    // Menu button
    const menuBtn = card.querySelector('.song-card-menu-btn');
    if (menuBtn) {
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation(); this._showContextMenu(e, setIndex);
      });
    }

    card.addEventListener('click', (e) => {
      if (e.target.closest('.song-card-actions')) return;
      // Ignore clicks that were actually drag scrolls
      if (this._dragMoved) return;
      const now = Date.now();
      if (this.selectedIndex === setIndex && now - this._lastSelectTime < 400) this._confirmSong();
      else if (this.selectedIndex !== setIndex) this._selectSong(setIndex);
      this._lastSelectTime = now;
    });

    wrapper.appendChild(card);

    // Always create diff dropdown (collapsed if not expanded)
    if (set.difficulties.length > 1) {
      const diffList = this._buildDiffDropdown(set, setIndex, isSelected, isExpanded);
      wrapper.appendChild(diffList);
    }

    return wrapper;
  }

  /** Grade gradient map for difficulty badges */
  _getGradeGradient(rank) {
    const g = {
      X: 'linear-gradient(180deg, #FFD700, #FFA500)',
      SS: 'linear-gradient(180deg, #67E8F9, #FDA4AF)',
      S: 'linear-gradient(180deg, #FDE68A, #F97316)',
      A: 'linear-gradient(180deg, #86EFAC, #22D3EE)',
      B: 'linear-gradient(180deg, #60A5FA, #A855F7)',
      C: 'linear-gradient(180deg, #C4B5FD, #991B1B)',
      D: 'linear-gradient(180deg, #EF4444, #7F1D1D)',
    };
    return g[rank] || null;
  }

  /** Build a diff dropdown element */
  _buildDiffDropdown(set, setIndex, isSelected, isExpanded) {
    const diffList = document.createElement('div');
    diffList.className = 'diff-dropdown' + (isExpanded ? '' : ' collapsed');

    set.difficulties.forEach((diff, diffIdx) => {
      const s = diff.difficulty?.stars || 0;
      const c = DifficultyAnalyzer.getStarColor(s);
      const isActive = isSelected && diffIdx === this.selectedDiffIndex;

      const starSpectrumHtml = this._buildStarSpectrum(s, c);

      const record = this._getRecord(set.id, diff.version);
      let recordHtml;
      if (record && record.rank) {
        const grad = this._getGradeGradient(record.rank);
        recordHtml = grad
          ? `<span class="diff-grade-icon" style="background:${grad};">${record.rank}</span>`
          : `<span style="font-family:var(--zzz-font);font-weight:700;font-size:11px;color:var(--zzz-muted);flex-shrink:0;">${record.rank}</span>`;
      } else {
        recordHtml = `<span style="font-family:var(--zzz-font);font-size:10px;color:rgba(255,255,255,0.12);flex-shrink:0;width:28px;text-align:center;">—</span>`;
      }

      const diffRow = document.createElement('div');
      diffRow.className = 'diff-dropdown-item' + (isActive ? ' active' : '');
      diffRow.style.cssText = `
        display:flex;align-items:center;gap:10px;
        padding:8px 14px;border-radius:20px;cursor:pointer;
        transition:all 0.15s cubic-bezier(0.4,0,0.2,1);
        background:${isActive ? 'rgba(20,20,20,0.95)' : 'rgba(0,0,0,0.75)'};
        border:2px solid ${isActive ? 'var(--zzz-lime)' : 'transparent'};
        ${isActive ? 'box-shadow:0 0 14px rgba(170,255,0,0.15),inset 0 0 24px rgba(170,255,0,0.04);' : ''}
      `;
      diffRow.innerHTML = `
        <span data-version="${this._escHtml(diff.version || 'NORMAL')}" style="color:${isActive ? c : 'var(--zzz-text)'};font-family:var(--zzz-font);font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap;flex-shrink:0;">${this._escHtml(diff.version || 'NORMAL')}</span>
        <div style="flex:1;display:flex;justify-content:flex-end;min-width:0;">
          ${starSpectrumHtml}
        </div>
        ${recordHtml}
      `;

      diffRow.addEventListener('click', (e) => {
        e.stopPropagation();
        this._selectDifficulty(diffIdx);
      });
      diffRow.addEventListener('mouseenter', () => {
        if (!diffRow.classList.contains('active')) diffRow.style.background = 'rgba(30,30,30,0.9)';
      });
      diffRow.addEventListener('mouseleave', () => {
        if (!diffRow.classList.contains('active')) diffRow.style.background = 'rgba(0,0,0,0.75)';
      });

      diffList.appendChild(diffRow);
    });

    return diffList;
  }

  _toggleExpand(setIndex) {
    const wasExpanded = this._expandedCard;
    this._expandedCard = this._expandedCard === setIndex ? -1 : setIndex;

    // Collapse previously expanded
    if (wasExpanded >= 0 && wasExpanded !== setIndex) {
      const prevWrapper = document.querySelector(`.song-card-wrapper[data-index="${wasExpanded}"]`);
      if (prevWrapper) {
        const dd = prevWrapper.querySelector('.diff-dropdown');
        if (dd) dd.classList.add('collapsed');
        const dc = prevWrapper.querySelector('.song-card-diff-count');
        if (dc) dc.textContent = `▼ ${this.beatmapSets[wasExpanded].difficulties.length}`;
      }
    }

    // Toggle current
    const wrapper = document.querySelector(`.song-card-wrapper[data-index="${setIndex}"]`);
    if (!wrapper) return;
    const dd = wrapper.querySelector('.diff-dropdown');
    const dc = wrapper.querySelector('.song-card-diff-count');
    const set = this.beatmapSets[setIndex];

    if (this._expandedCard === setIndex) {
      // Expanding
      if (dd) dd.classList.remove('collapsed');
      if (dc) dc.textContent = `▲ ${set.difficulties.length}`;
    } else {
      // Collapsing
      if (dd) dd.classList.add('collapsed');
      if (dc) dc.textContent = `▼ ${set.difficulties.length}`;
    }
  }

  /** Show context menu for a song card */
  _showContextMenu(event, setIndex) {
    // Remove any existing menu
    this._closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'song-context-menu';
    menu.id = 'song-context-menu';
    menu.innerHTML = `
      <button class="song-context-item" data-action="reset-scores">RESET SCORES</button>
      <button class="song-context-item" data-action="add-playlist">ADD TO PLAYLIST</button>
      <button class="song-context-item" data-action="edit-chart">EDIT CHART</button>
      <button class="song-context-item song-context-item--danger" data-action="delete-chart">DELETE CHART</button>
    `;

    // Position near the button
    const rect = event.target.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.right = `${window.innerWidth - rect.right}px`;
    document.body.appendChild(menu);

    // Close on outside click
    const closeHandler = (e) => {
      if (!menu.contains(e.target)) {
        this._closeContextMenu();
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
    menu._closeHandler = closeHandler;

    // Action handlers
    menu.querySelectorAll('.song-context-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        this._closeContextMenu();
        if (action === 'delete-chart') this._deleteMap(setIndex);
        else if (action === 'reset-scores') this._resetScores(setIndex);
        // add-playlist and edit-chart are placeholders
      });
    });
  }

  _closeContextMenu() {
    const existing = document.getElementById('song-context-menu');
    if (existing) {
      if (existing._closeHandler) document.removeEventListener('click', existing._closeHandler);
      existing.remove();
    }
  }

  /** Reset all local scores for a beatmap set */
  _resetScores(setIndex) {
    const set = this.beatmapSets[setIndex];
    if (!set) return;
    RecordStore.deleteSet(set.id, set.difficulties.map(d => d.version));
    // Refresh display
    this._renderSongList();
    if (this.selectedIndex === setIndex) {
      this._selectSong(setIndex, true);
    }
  }

  _escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  /** Build a 10-star spectrum bar HTML string */
  _buildStarSpectrum(stars, color, large = false) {
    const partial = stars - Math.floor(stars); // e.g. 0.7 for ★3.7
    const starSize = large ? 16 : 12;
    const numSize = large ? 14 : 11;
    const gap = large ? 0 : -1;
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
        // Immediate glitch on old content (works great for images, and CSS canvas glitch)
        this.three.triggerGlitch(0.5);
        ZZZTheme.glitchTransition(this.three.canvas);
        ZZZTheme.playSwitchSound();
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
    this._saveSelection();
    EventBus.emit('song:select', { map: set });
  }

  /** Save current selection to localStorage */
  _saveSelection() {
    try {
      if (this.selectedIndex >= 0 && this.selectedIndex < this.beatmapSets.length) {
        const set = this.beatmapSets[this.selectedIndex];
        localStorage.setItem('rhythm-os-last-song', JSON.stringify({
          id: set.id,
          diffIndex: this.selectedDiffIndex
        }));
      }
    } catch (_) {}
  }

  /** Restore last selected song from localStorage */
  _restoreSelection() {
    try {
      const raw = localStorage.getItem('rhythm-os-last-song');
      if (!raw) { this._selectSong(0); return; }
      const saved = JSON.parse(raw);
      if (!saved || !saved.id) { this._selectSong(0); return; }
      // Find the set by ID
      const idx = this.beatmapSets.findIndex(s => s.id === saved.id);
      if (idx < 0) { this._selectSong(0); return; }
      this._selectSong(idx);
      // Restore difficulty if valid
      const set = this.beatmapSets[idx];
      if (saved.diffIndex && saved.diffIndex > 0 && saved.diffIndex < set.difficulties.length) {
        this._selectDifficulty(saved.diffIndex);
      }
    } catch (_) {
      this._selectSong(0);
    }
  }

  _selectDifficulty(diffIndex) {
    const set = this.beatmapSets[this.selectedIndex];
    if (!set || diffIndex < 0 || diffIndex >= set.difficulties.length) return;

    // If clicking the already-selected difficulty → start the game
    if (diffIndex === this.selectedDiffIndex) {
      this._confirmSong();
      return;
    }

    this.selectedDiffIndex = diffIndex;
    this._updateSelection();
    this._renderSongInfo(set);
    this._renderPlayButton(set);
    this._saveSelection();

    // Effectful difficulty switch — brief glitch + channel switch sound
    ZZZTheme.playSwitchSound();
    if (this.three) {
      this.three.triggerGlitch(0.35);
    }
    ZZZTheme.glitchTransition(this.three?.canvas);

    // Flash the diff row with a color pulse
    const wrapper = document.querySelector(`.song-card-wrapper[data-index="${this.selectedIndex}"]`);
    if (wrapper) {
      const items = wrapper.querySelectorAll('.diff-dropdown-item');
      // Explicitly update ALL diff item colors (belt-and-suspenders fix for color revert bug)
      items.forEach((item, idx) => {
        const isActive = idx === diffIndex;
        const s = set.difficulties[idx]?.difficulty?.stars || 0;
        const itemColor = DifficultyAnalyzer.getStarColor(s);
        const nameSpan = item.querySelector('span[data-version]');
        if (nameSpan) nameSpan.style.color = isActive ? itemColor : 'var(--zzz-text)';
      });
      const activeItem = items[diffIndex];
      if (activeItem) {
        const c = DifficultyAnalyzer.getStarColor(set.difficulties[diffIndex]?.difficulty?.stars || 0);
        activeItem.style.boxShadow = `0 0 24px ${c}60, inset 0 0 30px ${c}20`;
        setTimeout(() => {
          if (activeItem.classList.contains('active')) {
            activeItem.style.boxShadow = '0 0 12px rgba(170,255,0,0.12), inset 0 0 20px rgba(170,255,0,0.03)';
          }
        }, 300);
      }
    }
  }

  /** Update selection/diff highlight in-place without full re-render */
  _updateSelection() {
    const list = document.getElementById('song-list');
    if (!list) return;

    const wrappers = list.querySelectorAll('.song-card-wrapper');
    wrappers.forEach((wrapper) => {
      const idx = parseInt(wrapper.dataset.index);
      const card = wrapper.querySelector('.song-card');
      if (!card) return;

      const isSelected = idx === this.selectedIndex;
      const isExpanded = idx === this._expandedCard;
      const set = this.beatmapSets[idx];

      // Toggle active class on card
      card.classList.toggle('active', isSelected);

      // Update diff count arrow
      const diffCount = card.querySelector('.song-card-diff-count');
      if (diffCount && set.difficulties.length > 1) {
        diffCount.textContent = `${isExpanded ? '▲' : '▼'} ${set.difficulties.length}`;
      }

      // Toggle diff dropdown visibility
      const dd = wrapper.querySelector('.diff-dropdown');
      if (dd) {
        if (isExpanded) dd.classList.remove('collapsed');
        else dd.classList.add('collapsed');
      }

      // Update active diff item styling
      const diffItems = wrapper.querySelectorAll('.diff-dropdown-item');
      diffItems.forEach((item, diffIdx) => {
        const isActive = isSelected && diffIdx === this.selectedDiffIndex;
        const s = set.difficulties[diffIdx]?.difficulty?.stars || 0;
        const c = DifficultyAnalyzer.getStarColor(s);

        item.classList.toggle('active', isActive);
        item.style.background = isActive ? 'rgba(20,20,20,0.95)' : 'rgba(0,0,0,0.75)';
        item.style.borderColor = isActive ? 'var(--zzz-lime)' : 'transparent';
        item.style.boxShadow = isActive ? '0 0 14px rgba(170,255,0,0.15),inset 0 0 24px rgba(170,255,0,0.04)' : 'none';

        // Update version name color
        const nameSpan = item.querySelector('span[data-version]');
        if (nameSpan) nameSpan.style.color = isActive ? c : 'var(--zzz-text)';
      });
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

    // Dynamic title size — shorter titles get bigger font
    const titleLen = (set.title || '').length;
    const titleSize = titleLen <= 8 ? 'clamp(36px, 6vw, 56px)' :
                      titleLen <= 16 ? 'clamp(30px, 5vw, 44px)' :
                      titleLen <= 28 ? 'clamp(24px, 4vw, 36px)' :
                      'clamp(18px, 3vw, 28px)';

    // Build horizontal scrollable record cards for the selected difficulty
    let resultsHtml = '';
    const currentRecords = this._getAllRecords(set.id, diff.version);

    if (currentRecords.length > 0) {
      const recordCards = currentRecords.map((rec, idx) => {
        const grad = this._getGradeGradient(rec.rank) || 'linear-gradient(180deg, #555, #333)';
        const timeStr = RecordStore.formatTimestamp(rec.timestamp);
        return `
          <div class="rc-history-card" data-rec-idx="${idx}" data-rec-ts="${rec.timestamp}" data-diff="${this._escHtml(diff.version || '')}"
               style="--rc-hc-bg: ${grad}; --rc-hc-delay: ${idx * 0.05}s;">
            <div class="rc-history-card-rank grade-gradient" style="--gg-grad: ${grad}; --gg-stroke: 1.5px rgba(0,0,0,0.5);">
              ${rec.rank || '?'}<span class="gg-fill">${rec.rank || '?'}</span>
            </div>
            <div class="rc-history-card-score">${rec.score.toLocaleString()}</div>
            <div class="rc-history-card-time">${timeStr}</div>
          </div>
        `;
      }).join('');

      resultsHtml = `
        <div style="margin-top:10px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
            <div style="font-family:var(--zzz-font);font-weight:700;font-size:9px;color:var(--zzz-muted);letter-spacing:0.15em;text-transform:uppercase;">PLAY HISTORY</div>
            <div style="font-family:var(--zzz-font);font-weight:600;font-size:9px;color:rgba(255,255,255,0.2);letter-spacing:0.1em;">${currentRecords.length} PLAYS</div>
          </div>
          <div class="rc-history-scroll" id="rc-history-scroll">
            ${recordCards}
          </div>
        </div>
      `;
    }

    // Difficulty name & pattern type
    const diffName = DifficultyAnalyzer.getDiffName(stars);
    const mapperInfo = set.creator ? this._escHtml(set.creator) : '';
    const noteCount = diff.noteCount || 0;
    const laneCount = diff.laneCount || set.laneCount || 4;

    // Mapper line
    const mapperHtml = mapperInfo
      ? `<div class="ss-info-mapper">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <span>${mapperInfo}</span>
      </div>`
      : '';

    info.innerHTML = `
      <div class="ss-info-panel">
        <!-- Glass shine line -->
        <div class="ss-info-panel-shine"></div>

        <!-- Title & Artist -->
        <div class="ss-info-title" style="font-size:${titleSize};">${this._escHtml(set.title)}</div>
        <div class="ss-info-artist">${this._escHtml(set.artist)}</div>
        ${mapperHtml}

        <!-- Star spectrum -->
        <div class="ss-info-stars-row">
          ${infoStarSpectrum}
          <span class="ss-info-diff-label" style="color:${starColor};">${diffName}</span>
        </div>

        <!-- Stats pills -->
        <div class="ss-info-stats">
          <div class="ss-info-pill">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8 4-8 11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            <span>${bpm}</span>
          </div>
          <div class="ss-info-pill">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span>${durationStr}</span>
          </div>
          <div class="ss-info-pill">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            <span>${noteCount > 0 ? noteCount.toLocaleString() : '—'} N</span>
          </div>
          <div class="ss-info-pill">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            <span>${laneCount}K</span>
          </div>
        </div>

        <!-- Score row -->
        <div class="ss-info-score-row">
          <div class="ss-info-score-value">${record ? record.score.toLocaleString() : '—'}</div>
          <div class="ss-info-score-label">${record ? 'BEST SCORE' : 'NO RECORD'}</div>
          ${record && record.rank ? `<div class="ss-info-grade-badge" style="background:${this._getGradeGradient(record.rank)};">${record.rank}</div>` : ''}
        </div>

        ${resultsHtml}
      </div>
    `;

    // Add click listeners for history cards → open result screen
    info.querySelectorAll('.rc-history-card').forEach(card => {
      card.style.cursor = 'pointer';
      card.addEventListener('mouseenter', () => { card.style.transform = 'translateY(-3px) scale(1.04)'; });
      card.addEventListener('mouseleave', () => { card.style.transform = ''; });
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        const recIdx = parseInt(card.dataset.recIdx);
        const records = this._getAllRecords(set.id, diff.version);
        if (records[recIdx]) {
          // Build a minimal map object for the result screen
          const mapForResult = {
            metadata: { ...diff.metadata, setId: set.id, title: set.title, artist: set.artist, version: diff.version, creator: set.creator },
          };
          this.screens.show('result', {
            historyRecord: records[recIdx],
            setId: set.id,
            diffVersion: diff.version,
            map: mapForResult,
          });
        }
      });
    });

    // Update the PLAY button in bottom-left
    this._renderPlayButton(set);
  }

  /** Render/update the PLAY button in the bottom-left corner */
  _renderPlayButton(set) {
    const area = document.getElementById('ss-play-area');
    if (!area) return;

    const diff = set.difficulties[this.selectedDiffIndex] || set.difficulties[0];
    const stars = diff?.difficulty?.stars || 0;
    const starColor = DifficultyAnalyzer.getStarColor(stars);

    area.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <button id="song-play-btn" class="zzz-btn zzz-btn--primary" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;width:84px;height:72px;border-radius:16px;padding:0;box-shadow:0 0 30px ${starColor}30;">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          <span style="font-family:var(--zzz-font);font-weight:900;font-size:11px;letter-spacing:0.08em;">PLAY</span>
        </button>
        <button id="song-mods-btn" class="zzz-btn" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;width:68px;height:68px;border-radius:16px;padding:0;border-color:var(--zzz-purple);color:var(--zzz-purple);">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="4" y1="6" x2="4" y2="18"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="20" y1="8" x2="20" y2="16"/><circle cx="4" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="20" cy="12" r="2" fill="currentColor" stroke="none"/></svg>
          <span style="font-family:var(--zzz-font);font-weight:700;font-size:10px;letter-spacing:0.08em;">MODS</span>
        </button>
        <button id="song-random-btn" class="zzz-btn" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;width:68px;height:68px;border-radius:16px;padding:0;border-color:var(--zzz-yellow);color:var(--zzz-yellow);">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
          <span style="font-family:var(--zzz-font);font-weight:700;font-size:10px;letter-spacing:0.08em;">RANDOM</span>
        </button>
      </div>
    `;
    document.getElementById('song-play-btn')?.addEventListener('click', () => this._confirmSong());
    document.getElementById('song-mods-btn')?.addEventListener('click', () => {
      // Placeholder: open mods overlay
    });
    document.getElementById('song-random-btn')?.addEventListener('click', () => {
      // Select a random song
      if (this.beatmapSets.length > 0) {
        let randomIdx;
        do {
          randomIdx = Math.floor(Math.random() * this.beatmapSets.length);
        } while (randomIdx === this.selectedIndex && this.beatmapSets.length > 1);
        this._selectSong(randomIdx);
      }
    });
  }

  _renderEmptyState() {
    const info = document.getElementById('ss-song-info');
    if (info) info.innerHTML = '';
    const playArea = document.getElementById('ss-play-area');
    if (playArea) playArea.innerHTML = '';

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
      this._syncVideoPreview(set, previewTime);

      // Repeat preview when it ends + ensure video stays synced
      this._previewInterval = setInterval(() => {
        if (set !== this.beatmapSets[this.selectedIndex]) {
          clearInterval(this._previewInterval);
          this._previewInterval = null;
          return;
        }
        if (!this.audio.isPlaying) {
          this.audio.play(set.audioBuffer, Math.max(0, previewTime));
          this._syncVideoPreview(set, previewTime);
        } else {
          // Even while audio is playing, periodically ensure video is synced
          // (handles cases where video loaded late or drifted)
          this._syncVideoPreview(set, previewTime);
        }
      }, 500);
    }, 250);
  }

  /** Sync the video background to the preview time */
  _syncVideoPreview(set, previewTime) {
    if (!this.three || !set.videoUrl || !this.three._videoActive || !this.three._videoElement) return;
    try {
      const video = this.three._videoElement;
      const drift = Math.abs(video.currentTime - previewTime);
      if (drift > 1.0) {
        video.currentTime = Math.max(0, previewTime);
      }
      if (video.paused) {
        video.play().catch(() => {});
      }
    } catch (_) { /* video not seekable yet */ }
  }

  _stopPreview() {
    if (this._previewFadeTimeout) { clearTimeout(this._previewFadeTimeout); this._previewFadeTimeout = null; }
    if (this._previewInterval) { clearInterval(this._previewInterval); this._previewInterval = null; }
    // Cancel any previous pending stop
    if (this._previewStopTimeout) { clearTimeout(this._previewStopTimeout); this._previewStopTimeout = null; }
    this.audio.fadeTo(0, 0.15);
    // Pause video preview
    if (this.three && this.three._videoElement) {
      this.three._videoElement.pause();
    }
    this._previewStopTimeout = setTimeout(() => { this.audio.stop(); this._previewStopTimeout = null; }, 200);
  }

  _confirmSong() {
    const set = this.beatmapSets[this.selectedIndex];
    if (!set) return;
    const diff = set.difficulties[this.selectedDiffIndex];
    if (!diff) return;

    // Prevent double-confirm
    if (this._transitioning) return;
    this._transitioning = true;
    this._leavingToGame = true;

    // Play satisfying game start sound
    ZZZTheme.playGameStartSound();

    this._stopPreview();

    const map = {
      metadata: { ...(set.metadata || {}), ...diff.metadata, setId: set.id, title: set.title, artist: set.artist, version: diff.version, creator: set.creator },
      audioBuffer: set.audioBuffer, backgroundUrl: set.backgroundUrl, videoUrl: set.videoUrl,
      notes: diff.notes, laneCount: diff.laneCount, bpmChanges: diff.bpmChanges, difficulty: diff.difficulty,
      kiaiSections: diff.kiaiSections
    };

    this._playTransition(set, diff, map);
  }

  /** Song → game transition: fade to black then start */
  _playTransition(set, diff, map) {
    // Immediately hide the song select UI (screen container + CRT overlay)
    const screenContainer = document.getElementById('screen');
    if (screenContainer) screenContainer.style.opacity = '0';
    const crtOverlay = document.getElementById('crt-overlay');
    if (crtOverlay) crtOverlay.style.display = 'none';
    // Also hide HUD and judgement overlays to be safe
    const hudContainer = document.getElementById('hud');
    if (hudContainer) hudContainer.style.opacity = '0';
    const judgementContainer = document.getElementById('judgement-overlay');
    if (judgementContainer) judgementContainer.style.opacity = '0';

    // Create the transition overlay
    const overlay = document.createElement('div');
    overlay.className = 'song-transition-overlay';
    overlay.id = 'song-transition-overlay';

    // Create the flying card clone
    const activeCard = document.querySelector(`.song-card-wrapper[data-index="${this.selectedIndex}"] .song-card`);
    const cardRect = activeCard ? activeCard.getBoundingClientRect() : null;

    const card = document.createElement('div');
    card.className = 'song-transition-card';

    // Start at the song card's position (or center-right if no card found)
    const startX = cardRect ? cardRect.left : window.innerWidth * 0.65;
    const startY = cardRect ? cardRect.top : window.innerHeight * 0.3;
    const startW = cardRect ? cardRect.width : 300;
    const startH = cardRect ? cardRect.height : 64;

    card.style.cssText = `
      left:${startX}px; top:${startY}px;
      width:${startW}px; height:${startH}px;
      transition: left 0.5s cubic-bezier(0.22,1,0.36,1),
                  top 0.5s cubic-bezier(0.22,1,0.36,1),
                  width 0.5s cubic-bezier(0.22,1,0.36,1),
                  height 0.5s cubic-bezier(0.22,1,0.36,1);
    `;

    // Dynamic title size based on length
    const titleLen = (set.title || '').length;
    const titleSize = titleLen <= 10 ? '20px' : titleLen <= 20 ? '17px' : titleLen <= 30 ? '14px' : '12px';

    // Stars info
    const stars = diff.difficulty?.stars || 0;
    const starColor = DifficultyAnalyzer.getStarColor(stars);

    // Background image
    const bgUrl = set.backgroundUrl || '';
    card.innerHTML = `
      <div style="display:flex;width:100%;height:100%;position:relative;">
        <!-- Left: background image thumbnail -->
        <div style="flex:0 0 42%;height:100%;background:${bgUrl ? `url('${bgUrl}') center/cover` : 'linear-gradient(135deg,#1a1a2e,#16213e)'};position:relative;">
          <div class="scanline-overlay"></div>
        </div>
        <!-- Right: song info + loading -->
        <div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:20px 24px;position:relative;z-index:2;">
          <div style="font-family:var(--zzz-font);font-weight:900;font-size:${titleSize};color:var(--zzz-text);text-transform:uppercase;letter-spacing:0.06em;line-height:1.1;word-break:break-word;">${this._escHtml(set.title)}</div>
          <div style="font-family:var(--zzz-font);font-weight:500;font-size:12px;color:var(--zzz-muted);margin-top:4px;letter-spacing:0.02em;">${this._escHtml(set.artist)}</div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
            <span style="font-family:var(--zzz-font);font-weight:700;font-size:11px;color:${starColor};letter-spacing:0.06em;text-transform:uppercase;">${this._escHtml(diff.version || 'NORMAL')}</span>
            <span style="font-family:var(--zzz-font);font-size:10px;color:${starColor};opacity:0.7;">★${stars.toFixed(1)}</span>
          </div>
          <div style="margin-top:12px;">
            <div class="song-loading-bar"><div class="song-loading-bar-fill" id="song-loading-fill"></div></div>
          </div>
        </div>
      </div>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Phase 1: fly card to center
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const targetW = Math.min(400, window.innerWidth * 0.6);
        const targetH = targetW * 0.55;
        card.style.left = `${(window.innerWidth - targetW) / 2}px`;
        card.style.top = `${(window.innerHeight - targetH) / 2}px`;
        card.style.width = `${targetW}px`;
        card.style.height = `${targetH}px`;
        overlay.classList.add('fade-bg');
      });
    });

    // Phase 2: show loading bar animation
    setTimeout(() => {
      const fill = document.getElementById('song-loading-fill');
      if (fill) fill.style.width = '100%';
    }, 600);

    // Phase 3: fade overlay to solid black, then start game
    setTimeout(() => {
      card.classList.add('burst');
      overlay.classList.add('fade-to-black');
      // Start the game after fade-to-black completes
      setTimeout(() => {
        overlay.remove();
        this._transitioning = false;
        // startGame handles the game screen setup; ScreenManager.show('game') is instant now
        this.screens.show('game', { map });
      }, 400);
    }, 1200);

    // Backup: force-start game if transition fails
    setTimeout(() => {
      const overlayEl = document.getElementById('song-transition-overlay');
      if (overlayEl) overlayEl.remove();
      this._transitioning = false;
      if (this.screens._transitioning) {
        this.screens._transitioning = false;
      }
    }, 3000);
  }

  async _handleOszFiles(files) {
    if (!files || files.length === 0) return;
    const file = files[0]; // only import first file

    // Show import overlay
    this._showImportOverlay(file.name);
    this._setImportStatus('unpacking', 'Unpacking archive...');

    try {
      await new Promise(resolve => setTimeout(resolve, 50)); // yield to let overlay render

      this._setImportProgress(20);

      const result = await this.oszLoader.load(file);

      this._setImportStatus('analyzing', 'Analyzing difficulties...');
      this._setImportProgress(80);

      await new Promise(resolve => setTimeout(resolve, 100));

      if (result && result.difficulties && result.difficulties.length > 0) {
        this.beatmapSets.push(result);
        this._buildFilteredIndices();
        this._renderSongList();
        this._selectSong(this.beatmapSets.length - 1);
        ZZZTheme.playSwitchSound();
      }

      this._setImportStatus('done', 'Import complete!');
      this._setImportProgress(100);
      await new Promise(resolve => setTimeout(resolve, 600));
      this._hideImportOverlay();
    } catch (err) {
      console.error('[SongSelect] Import failed:', err);
      this._setImportStatus('error', 'Import failed');
      await new Promise(resolve => setTimeout(resolve, 2000));
      this._hideImportOverlay();
    }

    // Reset file input so same file can be re-imported
    const input = document.getElementById('osz-input');
    if (input) input.value = '';
  }

  _showImportOverlay(fileName) {
    this._hideImportOverlay();
    const sa = document.getElementById('screen');
    const overlay = document.createElement('div');
    overlay.id = 'import-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);animation:pause-fade-in 0.2s ease-out forwards;';
    overlay.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:20px;padding:40px 56px;border-radius:16px;background:rgba(17,17,17,0.95);border:1px solid rgba(170,255,0,0.15);box-shadow:0 0 40px rgba(0,0,0,0.5);">
        <div style="font-family:var(--zzz-font);font-weight:900;font-size:14px;color:var(--zzz-lime);letter-spacing:0.25em;text-transform:uppercase;">IMPORTING</div>
        <div id="import-filename" style="font-family:var(--zzz-mono);font-size:12px;color:rgba(255,255,255,0.5);max-width:320px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${fileName}</div>
        <div style="width:240px;height:3px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;">
          <div id="import-progress-bar" style="width:0%;height:100%;background:var(--zzz-lime);border-radius:2px;transition:width 0.4s ease-out;box-shadow:0 0 8px rgba(170,255,0,0.4);"></div>
        </div>
        <div id="import-status" style="font-family:var(--zzz-font);font-weight:500;font-size:11px;color:rgba(255,255,255,0.35);letter-spacing:0.15em;text-transform:uppercase;min-height:18px;">Unpacking archive...</div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      const bar = document.getElementById('import-progress-bar');
      if (bar) bar.style.width = '15%';
    });
  }

  _setImportStatus(stage, text) {
    const bar = document.getElementById('import-progress-bar');
    const status = document.getElementById('import-status');
    if (status) status.textContent = text;
    const pct = { unpacking: 40, analyzing: 80, done: 100, error: 0 };
    if (bar) bar.style.width = (pct[stage] || 0) + '%';
  }

  _setImportProgress(pct) {
    const bar = document.getElementById('import-progress-bar');
    if (bar) bar.style.width = pct + '%';
  }

  _hideImportOverlay() {
    const overlay = document.getElementById('import-overlay');
    if (overlay) overlay.remove();
  }

  destroy() {
    // Clean up parallax
    for (const el of this._parallaxEls) {
      ZZZTheme.removeParallax(el);
    }
    this._parallaxEls = [];

    // Clean up listeners
    if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler);
    if (this._dragHandler) window.removeEventListener('mousemove', this._dragHandler);
    if (this._dragUpHandler) window.removeEventListener('mouseup', this._dragUpHandler);
    if (this._recordsChangedHandler) EventBus.off('records:changed', this._recordsChangedHandler);

    // Stop preview — but if we're leaving to game or main-menu, DON'T call _stopPreview()
    // because it would schedule audio.stop() which would kill ongoing audio.
    if (this._leavingToGame || this._leavingToMenu) {
      // Just clean up timers/intervals without scheduling new audio.stop()
      if (this._previewFadeTimeout) { clearTimeout(this._previewFadeTimeout); this._previewFadeTimeout = null; }
      if (this._previewInterval) { clearInterval(this._previewInterval); this._previewInterval = null; }
      if (this._previewStopTimeout) { clearTimeout(this._previewStopTimeout); this._previewStopTimeout = null; }
    } else {
      this._stopPreview();
    }

    // Clean up CRT — but keep it when going back to main menu
    if (this.three && !this._leavingToMenu) {
      this.three.setCrtIntensity(0);
      ZZZTheme.removeCrtOverlay();
    } else if (this.three && this._leavingToMenu) {
      // Reduce CRT intensity for main menu
      this.three.setCrtIntensity(0.3);
    }

    // Clean up transition overlay if still present
    const transOverlay = document.getElementById('song-transition-overlay');
    if (transOverlay) transOverlay.remove();

    // Reset transitioning state
    this._transitioning = false;
    this._leavingToGame = false;
    this._leavingToMenu = false;
  }
}
