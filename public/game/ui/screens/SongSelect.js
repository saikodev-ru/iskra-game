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
        <!-- Loading overlay -->
        <div id="ss-loading" class="ss-loading">
          <div class="ss-loading-spinner"></div>
          <div class="ss-loading-text">RHYMIX</div>
        </div>

        <!-- Darken background by 30% -->
        <div style="position:absolute;inset:0;z-index:0;background:rgba(0,0,0,0.3);pointer-events:none;"></div>

        <!-- Enhanced vignette overlay -->
        <div style="position:absolute;inset:0;z-index:1;pointer-events:none;background:radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.35) 70%, rgba(0,0,0,0.7) 100%);"></div>

        <!-- Song info backdrop (top-left) -->
        <div style="position:absolute;top:8px;left:12px;right:55%;bottom:58%;z-index:1;pointer-events:none;background:linear-gradient(135deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 60%, transparent 100%);border-radius:16px;"></div>

        <!-- Song info (top-left) with parallax -->
        <div id="ss-song-info" class="parallax-layer" data-parallax="5" style="position:absolute;top:16px;left:24px;z-index:2;max-width:45%;pointer-events:none;"></div>

        <!-- PLAY button (bottom-left) with parallax -->
        <div id="ss-play-area" class="parallax-layer" data-parallax="5" style="position:absolute;bottom:28px;left:24px;z-index:3;pointer-events:auto;"></div>

        <!-- Right column: toolbar + search + list + actions -->
        <div id="ss-right-column" class="parallax-layer" data-parallax="2" style="flex:1;display:flex;justify-content:flex-end;overflow:hidden;padding:16px 24px 0 0;z-index:2;position:relative;">
          <!-- Gradient behind the entire right column — fades to black going right -->
          <div style="position:absolute;top:-40px;left:-80px;right:0;bottom:-40px;background:linear-gradient(90deg,transparent 0%,rgba(0,0,0,0.25) 30%,rgba(0,0,0,0.6) 70%,rgba(0,0,0,0.85) 100%);pointer-events:none;z-index:-1;"></div>
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
    // Show loading overlay
    const loadingEl = document.getElementById('ss-loading');

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

    document.getElementById('back-btn').addEventListener('click', () => this.screens.show('main-menu'));
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
      else if (e.code === 'Escape') { e.preventDefault(); this.screens.show('main-menu'); }
      else if (e.code === 'Delete') { e.preventDefault(); this._deleteSelected(); }
    };
    window.addEventListener('keydown', this._keyHandler);

    if (this.three) {
      // Enable CRT effect on song select (scanlines, barrel distortion)
      this.three.setCrtIntensity(0.7);
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
    set.difficulties.forEach(diff => {
      try {
        const key = `rhythm-record-${set.id}-${(diff.version || '').replace(/[^a-zA-Z0-9]/g, '_')}`;
        localStorage.removeItem(key);
      } catch (_) {}
    });
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

    // Build results list for all difficulties
    let resultsHtml = '';
    const resultsList = set.difficulties
      .map(diff => {
        const rec = this._getRecord(set.id, diff.version);
        return { version: diff.version, record: rec };
      })
      .filter(r => r.record);

    if (resultsList.length > 0) {
      resultsHtml = `<div style="margin-top:10px;max-height:80px;overflow-y:auto;display:flex;flex-direction:column;gap:3px;" class="zzz-scroll">
        <div style="font-family:var(--zzz-font);font-weight:700;font-size:9px;color:var(--zzz-muted);letter-spacing:0.15em;text-transform:uppercase;margin-bottom:2px;">RECORDS</div>
        ${resultsList.map(r => `
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-family:var(--zzz-font);font-size:10px;color:rgba(255,255,255,0.5);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this._escHtml(r.version)}</span>
            <span style="font-family:var(--zzz-font);font-weight:900;font-size:11px;color:var(--zzz-lime);flex-shrink:0;">${r.record.rank || '?'}</span>
            <button class="result-delete-btn" data-diff="${this._escHtml(r.version)}" style="width:16px;height:16px;border:none;background:rgba(255,61,61,0.1);color:var(--zzz-red);font-size:10px;border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:0;opacity:0.4;transition:opacity 0.15s;">✕</button>
          </div>
        `).join('')}
      </div>`;
    }

    // Remove PLAY button from info panel (moved to bottom-left)
    info.innerHTML = `
      <div style="font-family:var(--zzz-font);font-weight:900;font-size:${titleSize};color:var(--zzz-text);text-transform:uppercase;letter-spacing:0.06em;line-height:1.05;word-break:break-word;text-shadow:0 2px 20px rgba(0,0,0,0.9);">${this._escHtml(set.title)}</div>
      <div style="font-family:var(--zzz-font);font-weight:500;font-size:15px;color:var(--zzz-muted);margin-top:4px;text-shadow:0 1px 10px rgba(0,0,0,0.9);">${this._escHtml(set.artist)}</div>
      <div style="margin-top:10px;">${infoStarSpectrum}</div>
      <div style="display:flex;gap:14px;margin-top:6px;align-items:baseline;flex-wrap:wrap;">
        <span style="color:var(--zzz-muted);font-family:var(--zzz-font);font-size:12px;">${bpm} BPM · ${durationStr}</span>
      </div>
      <div style="margin-top:8px;display:flex;align-items:baseline;gap:4px;">${recordHtml}</div>
      ${resultsHtml}
    `;

    // Add delete button listeners for results
    info.querySelectorAll('.result-delete-btn').forEach(btn => {
      btn.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
      btn.addEventListener('mouseleave', () => { btn.style.opacity = '0.4'; });
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const diffName = btn.dataset.diff;
        try {
          const key = `rhythm-record-${set.id}-${(diffName || '').replace(/[^a-zA-Z0-9]/g, '_')}`;
          localStorage.removeItem(key);
        } catch (_) {}
        // Re-render info to update list
        this._renderSongInfo(set);
        this._renderSongList();
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
      if (this.three && set.videoUrl && this.three._videoActive && this.three._videoElement) {
        try {
          this.three._videoElement.currentTime = Math.max(0, previewTime);
          this.three._videoElement.play().catch(() => {});
        } catch (_) { /* video not seekable yet */ }
      }

      // Repeat preview when it ends
      this._previewInterval = setInterval(() => {
        if (set !== this.beatmapSets[this.selectedIndex]) {
          clearInterval(this._previewInterval);
          this._previewInterval = null;
          return;
        }
        if (!this.audio.isPlaying) {
          this.audio.play(set.audioBuffer, Math.max(0, previewTime));
          // Also loop video
          if (this.three && set.videoUrl && this.three._videoActive && this.three._videoElement) {
            try {
              this.three._videoElement.currentTime = Math.max(0, previewTime);
              this.three._videoElement.play().catch(() => {});
            } catch (_) {}
          }
        }
      }, 500);
    }, 250);
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

    this._stopPreview();

    const map = {
      metadata: { ...(set.metadata || {}), ...diff.metadata, setId: set.id, title: set.title, artist: set.artist, version: diff.version, creator: set.creator },
      audioBuffer: set.audioBuffer, backgroundUrl: set.backgroundUrl, videoUrl: set.videoUrl,
      notes: diff.notes, laneCount: diff.laneCount, bpmChanges: diff.bpmChanges, difficulty: diff.difficulty
    };

    this._playTransition(set, diff, map);
  }

  /** Beautiful song → game transition */
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

    // Find the active song card element to get its position
    const activeCard = document.querySelector(`.song-card-wrapper[data-index="${this.selectedIndex}"] .song-card`);
    const cardRect = activeCard ? activeCard.getBoundingClientRect() : null;

    // Create the transition overlay
    const overlay = document.createElement('div');
    overlay.className = 'song-transition-overlay';
    overlay.id = 'song-transition-overlay';

    // Create the flying card clone
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

    // Phase 3: glitch burst → start game
    setTimeout(() => {
      card.classList.add('burst');
      // Reset screen opacity
      if (screenContainer) screenContainer.style.opacity = '1';

      // Start the game after burst animation
      setTimeout(() => {
        // Clean up transition overlay
        overlay.remove();
        this._transitioning = false;
        // NOTE: Keep _leavingToGame = true so destroy() knows NOT to call _stopPreview()
        // which would schedule audio.stop() and kill the game's audio
        // Force-clear any screen transition animations that might block visibility
        const sc = document.getElementById('screen');
        if (sc) {
          sc.classList.remove('screen-exit', 'screen-enter');
          sc.style.opacity = '';
          sc.style.animation = 'none';
        }
        this.screens.show('game', { map });
      }, 600);
    }, 1200);

    // Backup: force-start game if transition fails
    setTimeout(() => {
      // Fallback: if screens are still transitioning, force cleanup
      const sc = document.getElementById('screen');
      if (sc) {
        sc.classList.remove('screen-exit', 'screen-enter');
        sc.style.opacity = '';
        sc.style.animation = 'none';
      }
      if (this.screens._transitioning) {
        this.screens._transitioning = false;
        this.screens._currentName = '';
        this.screens.show('game', { map });
      }
    }, 3000);
  }

  async _handleOszFiles(files) {
    if (!files || files.length === 0) return;
    for (const file of files) {
      try {
        const newSet = await this.oszLoader.load(file);
        this.beatmapSets.push(newSet);
      } catch (err) {
        console.error('Failed to load .osz:', err);
      }
    }
    this._buildFilteredIndices();
    this._renderSongList();
    if (this.beatmapSets.length > 0) {
      if (this.selectedIndex < 0) this._restoreSelection();
      else this._selectSong(this.selectedIndex, true);
    }
    // Reset file input so the same file can be re-imported
    const input = document.getElementById('osz-input');
    if (input) input.value = '';
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

    // Stop preview — but if we're leaving to game, DON'T call _stopPreview()
    // because it would schedule audio.stop() 200ms later, which would kill
    // the game's audio that startGame() just started playing.
    if (this._leavingToGame) {
      // Just clean up timers/intervals without scheduling new audio.stop()
      if (this._previewFadeTimeout) { clearTimeout(this._previewFadeTimeout); this._previewFadeTimeout = null; }
      if (this._previewInterval) { clearInterval(this._previewInterval); this._previewInterval = null; }
      if (this._previewStopTimeout) { clearTimeout(this._previewStopTimeout); this._previewStopTimeout = null; }
    } else {
      this._stopPreview();
    }

    // Clean up CRT
    if (this.three) {
      this.three.setCrtIntensity(0);
      ZZZTheme.removeCrtOverlay();
    }

    // Reset transitioning state
    this._transitioning = false;
    this._leavingToGame = false;
  }
}
