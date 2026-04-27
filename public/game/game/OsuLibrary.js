import DifficultyAnalyzer from './DifficultyAnalyzer.js';

/**
 * OsuLibrary — Browse and download beatmaps from osu! via the catboy.best mirror API.
 * Provides a full-screen overlay panel with search, map tiles, and radial-progress download.
 */
export default class OsuLibrary {
  constructor({ audio, oszLoader, onImported }) {
    this.audio = audio;
    this.oszLoader = oszLoader;
    this.onImported = onImported;
    this._overlay = null;
    this._searchTimeout = null;
    this._results = [];
    this._downloadStates = new Map(); // setId → { state, progress }
  }

  /** Open the library panel */
  open() {
    if (this._overlay) return;
    this._createOverlay();
  }

  /** Close and remove the library panel */
  close() {
    if (this._searchTimeout) { clearTimeout(this._searchTimeout); this._searchTimeout = null; }
    if (this._overlay) { this._overlay.remove(); this._overlay = null; }
    if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler);
    this._keyHandler = null;
  }

  _createOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'lib-overlay';
    overlay.innerHTML = `
      <div class="lib-header">
        <span class="lib-title">LIBRARY</span>
        <input type="text" class="lib-search" id="lib-search-input" placeholder="Search osu! beatmaps..." />
        <span class="lib-count" id="lib-count"></span>
        <button class="lib-close-btn" id="lib-close-btn">✕</button>
      </div>
      <div class="lib-grid zzz-scroll" id="lib-grid">
        <div class="lib-empty">TYPE TO SEARCH FOR BEATMAPS</div>
      </div>
    `;
    document.body.appendChild(overlay);
    this._overlay = overlay;

    // Focus search input
    requestAnimationFrame(() => {
      const input = document.getElementById('lib-search-input');
      if (input) input.focus();
    });

    // Search on input (debounced)
    const searchInput = document.getElementById('lib-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        if (this._searchTimeout) clearTimeout(this._searchTimeout);
        this._searchTimeout = setTimeout(() => this.search(e.target.value), 400);
      });
      // Enter to search immediately
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          if (this._searchTimeout) clearTimeout(this._searchTimeout);
          this.search(searchInput.value);
        }
      });
    }

    // Close button
    const closeBtn = document.getElementById('lib-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());

    // ESC to close
    this._keyHandler = (e) => {
      if (e.key === 'Escape') this.close();
    };
    window.addEventListener('keydown', this._keyHandler);

    // Prevent clicks from propagating to the game
    overlay.addEventListener('click', (e) => e.stopPropagation());
  }

  async search(query) {
    const grid = document.getElementById('lib-grid');
    if (!grid) return;

    if (!query.trim()) {
      grid.innerHTML = '<div class="lib-empty">TYPE TO SEARCH FOR BEATMAPS</div>';
      return;
    }

    grid.innerHTML = '<div class="lib-loading"><div class="lib-loading-spinner"></div><div style="color:var(--zzz-muted);font-size:13px;">SEARCHING...</div></div>';

    try {
      const response = await fetch(`/api/osu-search?q=${encodeURIComponent(query)}&m=3&limit=50&offset=0`);
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const data = await response.json();

      // API returns normalized array directly (already filtered to mania)
      const sets = Array.isArray(data) ? data : (data.beatmapsets || data.data || []);

      if (sets.length === 0) {
        grid.innerHTML = '<div class="lib-empty">NO RESULTS FOUND</div>';
        return;
      }

      // Further filter to mania maps (belt-and-suspenders — API already filters)
      const maniaSets = sets.filter(s => s.beatmaps && s.beatmaps.length > 0);

      if (maniaSets.length === 0) {
        grid.innerHTML = '<div class="lib-empty">NO MANIA MAPS FOUND</div>';
        return;
      }

      this._results = maniaSets;
      const countEl = document.getElementById('lib-count');
      if (countEl) countEl.textContent = `${maniaSets.length} maps`;

      grid.innerHTML = '';
      maniaSets.forEach((set, i) => {
        const tile = this._createTile(set, i);
        grid.appendChild(tile);
      });
    } catch (err) {
      console.error('[OsuLibrary] Search error:', err);
      grid.innerHTML = `<div class="lib-empty">SEARCH FAILED: ${err.message}</div>`;
    }
  }

  _createTile(set, index) {
    const tile = document.createElement('div');
    tile.className = 'lib-tile';
    tile.style.animationDelay = `${Math.min(index * 30, 300)}ms`;

    // Get the highest mania difficulty
    const maniaMaps = (set.beatmaps || []).filter(b => b.mode === 3);
    const maxStars = maniaMaps.reduce((max, b) => Math.max(max, b.difficulty_rating || 0), 0);
    const starColor = DifficultyAnalyzer.getStarColor(maxStars);

    const coverUrl = set.covers?.['list@2x'] || set.covers?.list || '';
    const hasVideo = set.has_video || false;

    const dlState = this._downloadStates.get(set.id);
    const stateClass = dlState?.state === 'done' ? ' lib-dl-btn--done' :
                       dlState?.state === 'error' ? ' lib-dl-btn--error' : '';

    tile.innerHTML = `
      <div class="lib-tile-cover" style="background-image:url('${coverUrl}');"></div>
      <div class="lib-tile-info">
        <div class="lib-tile-title">${this._escHtml(set.title || 'Unknown')}</div>
        <div class="lib-tile-artist">${this._escHtml(set.artist || 'Unknown')}</div>
        <div class="lib-tile-meta">
          <span class="lib-tile-stars" style="color:${starColor};">★${maxStars.toFixed(1)}</span>
          ${maniaMaps.length > 1 ? `<span style="font-size:9px;color:var(--zzz-muted);">${maniaMaps.length} diffs</span>` : ''}
          ${hasVideo ? '<span class="lib-tile-video">🎬</span>' : ''}
        </div>
      </div>
      <div class="lib-tile-actions">
        <button class="lib-dl-btn${stateClass}" data-set-id="${set.id}" aria-label="Download">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <svg class="lib-dl-progress" viewBox="0 0 48 48" style="display:none;">
            <circle class="progress-bg" cx="24" cy="24" r="21"/>
            <circle class="progress-fill" cx="24" cy="24" r="21"
              stroke-dasharray="${2 * Math.PI * 21}"
              stroke-dashoffset="${2 * Math.PI * 21}"/>
          </svg>
        </button>
      </div>
    `;

    // Download button click handler
    const dlBtn = tile.querySelector('.lib-dl-btn');
    if (dlBtn) {
      dlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dlBtn.disabled) return;
        this.download(set.id, dlBtn);
      });
    }

    return tile;
  }

  async download(setId, btnElement) {
    if (this._downloadStates.get(setId)?.state === 'downloading') return;

    this._downloadStates.set(setId, { state: 'downloading', progress: 0 });

    // Update button appearance
    btnElement.disabled = true;
    const progressSvg = btnElement.querySelector('.lib-dl-progress');
    const progressCircle = btnElement.querySelector('.progress-fill');
    const circumference = 2 * Math.PI * 21;

    if (progressSvg) progressSvg.style.display = '';
    if (progressCircle) progressCircle.style.strokeDashoffset = circumference;

    try {
      const response = await fetch(`/api/osu-download/${setId}`);
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);

      const contentLength = parseInt(response.headers.get('Content-Length') || '0');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      let received = 0;
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;

        if (contentLength > 0) {
          const progress = received / contentLength;
          this._downloadStates.set(setId, { state: 'downloading', progress });
          if (progressCircle) {
            progressCircle.style.strokeDashoffset = circumference * (1 - progress);
          }
        }
      }

      // Combine chunks into a Blob
      const blob = new Blob(chunks);
      const file = new File([blob], `${setId}.osz`, { type: 'application/octet-stream' });

      // Import via OszLoader
      const beatmapSet = await this.oszLoader.load(file);

      // Update button to "done" state
      this._downloadStates.set(setId, { state: 'done', progress: 1 });
      btnElement.classList.add('lib-dl-btn--done');
      if (progressSvg) progressSvg.style.display = 'none';

      // Replace SVG icon with checkmark
      const iconSvg = btnElement.querySelector('svg:first-child');
      if (iconSvg) {
        iconSvg.innerHTML = '<polyline points="20 6 9 17 4 12" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
        iconSvg.setAttribute('viewBox', '0 0 24 24');
      }

      // Notify parent
      if (this.onImported) this.onImported(beatmapSet);

    } catch (err) {
      console.error('[OsuLibrary] Download error:', err);
      this._downloadStates.set(setId, { state: 'error', progress: 0 });

      btnElement.classList.add('lib-dl-btn--error');
      if (progressSvg) progressSvg.style.display = 'none';

      // Replace icon with X
      const iconSvg = btnElement.querySelector('svg:first-child');
      if (iconSvg) {
        iconSvg.innerHTML = '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>';
        iconSvg.setAttribute('viewBox', '0 0 24 24');
      }

      // Re-enable after 3s
      setTimeout(() => {
        btnElement.classList.remove('lib-dl-btn--error');
        btnElement.disabled = false;
        // Restore download icon
        if (iconSvg) {
          iconSvg.innerHTML = '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>';
        }
        this._downloadStates.delete(setId);
      }, 3000);
    }
  }

  _escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
}
