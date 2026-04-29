import DifficultyAnalyzer from './DifficultyAnalyzer.js';
import EventBus from '../core/EventBus.js';

/**
 * OsuLibrary — Browse and download beatmaps from osu! via the catboy.best mirror API.
 * Provides a safe-area-aware overlay panel with search, list-style card tiles,
 * radial-progress download, audio preview, owned-map indicators,
 * and a global notification system that hides during gameplay.
 */
export default class OsuLibrary {
  /**
   * @param {Object} opts
   * @param {Object} opts.audio          - AudioEngine reference
   * @param {Object} opts.oszLoader      - OszLoader reference
   * @param {Function} opts.onImported   - Callback(beatmapSet, { skipSelect }) after import
   * @param {Function} opts.existingSetIds - () => Set<number> of online set IDs already owned
   * @param {Function} opts.isGameActive - () => boolean, true when a game is in progress
   */
  constructor({ audio, oszLoader, onImported, existingSetIds, isGameActive }) {
    this.audio = audio;
    this.oszLoader = oszLoader;
    this.onImported = onImported;
    this.existingSetIds = existingSetIds || (() => new Set());
    this.isGameActive = isGameActive || (() => false);

    this._overlay = null;
    this._searchTimeout = null;
    this._results = [];
    this._downloadStates = new Map(); // setId → { state, progress }
    this._downloadQueue = [];         // array of { setId, btnElement, title }
    this._downloading = false;
    this._previewAudio = null;
    this._previewSetId = null;
    this._keyHandler = null;

    // ── Global Notification System ──
    this._notifContainer = null;
    this._notifications = [];  // array of { el, id, status, timeout }
    this._notifIdCounter = 0;
    this._notifVisible = true;
    this._notifGameCheckInterval = null;
  }

  // ─── Safe Area Helper ──────────────────────────────────────────────

  /** Calculate the safe area from localStorage settings (same logic as main.js) */
  _calcSafeArea() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ar = localStorage.getItem('rhythm-os-aspect-ratio') || '16:9';

    let targetW, targetH;
    if (ar === 'Fill') {
      targetW = w; targetH = h;
    } else {
      const parts = ar.split(':');
      const arW = parseInt(parts[0]) || 16;
      const arH = parseInt(parts[1]) || 9;
      const targetAR = arW / arH;
      const screenAR = w / h;
      if (screenAR > targetAR) { targetH = h; targetW = h * targetAR; }
      else { targetW = w; targetH = w / targetAR; }
    }
    targetW = Math.round(targetW);
    targetH = Math.round(targetH);
    const x = Math.round((w - targetW) / 2);
    const y = Math.round((h - targetH) / 2);
    return { x, y, w: targetW, h: targetH };
  }

  /** Open the library panel */
  open() {
    if (this._overlay) return;
    this._createOverlay();
    this._ensureNotifContainer();
  }

  /** Close and remove the library panel with animated transition */
  close() {
    this._stopPreview();

    if (this._searchTimeout) { clearTimeout(this._searchTimeout); this._searchTimeout = null; }
    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }

    // Animate out the overlay
    if (this._overlay) {
      this._overlay.classList.add('lib-overlay-closing');
      const overlay = this._overlay;
      const onEnd = () => {
        overlay.remove();
      };
      overlay.addEventListener('animationend', onEnd, { once: true });
      // Fallback remove
      setTimeout(onEnd, 400);
      this._overlay = null;
    }
  }

  // ─── Preview Audio ──────────────────────────────────────────────────

  _stopPreview() {
    if (this._previewAudio) {
      this._previewAudio.pause();
      this._previewAudio.src = '';
      this._previewAudio = null;
    }
    this._previewSetId = null;
    // Remove all playing indicators
    if (this._overlay) {
      this._overlay.querySelectorAll('.lib-tile-playing').forEach(el =>
        el.classList.remove('lib-tile-playing'));
    }
  }

  _playPreview(setId) {
    // Toggle off if same tile
    if (this._previewSetId === setId && this._previewAudio && !this._previewAudio.paused) {
      this._stopPreview();
      return;
    }

    this._stopPreview();

    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    // Use osu! official preview endpoint
    audio.src = `https://b.ppy.sh/preview/${setId}.mp3`;
    audio.volume = 0.5;

    audio.play().catch(err => {
      console.warn('[OsuLibrary] Preview play failed:', err);
    });

    this._previewAudio = audio;
    this._previewSetId = setId;

    // Mark tile as playing
    const tile = this._overlay?.querySelector(`.lib-tile[data-set-id="${setId}"]`);
    if (tile) tile.classList.add('lib-tile-playing');

    audio.addEventListener('ended', () => {
      if (this._previewSetId === setId) this._stopPreview();
    });
  }

  // ─── Global Notification System ─────────────────────────────────────

  /** Ensure the global notification container exists (persists beyond library close) */
  _ensureNotifContainer() {
    if (this._notifContainer && this._notifContainer.parentNode) return;

    const sa = this._calcSafeArea();
    const container = document.createElement('div');
    container.className = 'lib-notif-container';
    container.style.left = (sa.x + 16) + 'px';
    container.style.top = (sa.y + 16) + 'px';
    document.body.appendChild(container);
    this._notifContainer = container;

    // Start checking if game is active — hide notifications during gameplay
    if (!this._notifGameCheckInterval) {
      this._notifGameCheckInterval = setInterval(() => this._updateNotifVisibility(), 500);
    }

    // Listen for safe area changes
    this._notifResizeHandler = () => {
      if (!this._notifContainer) return;
      const sa = this._calcSafeArea();
      this._notifContainer.style.left = (sa.x + 16) + 'px';
      this._notifContainer.style.top = (sa.y + 16) + 'px';
    };
    window.addEventListener('resize', this._notifResizeHandler);
    EventBus.on('settings:changed', this._notifResizeHandler);
  }

  /** Update notification visibility based on game state */
  _updateNotifVisibility() {
    const gameActive = this.isGameActive();
    if (gameActive && this._notifVisible) {
      // Hide notifications — game is active
      this._notifVisible = false;
      if (this._notifContainer) {
        this._notifContainer.classList.add('lib-notif-hidden');
      }
    } else if (!gameActive && !this._notifVisible) {
      // Show notifications — game is not active
      this._notifVisible = true;
      if (this._notifContainer) {
        this._notifContainer.classList.remove('lib-notif-hidden');
      }
    }
  }

  /** Show a notification. Returns notification ID for updates. */
  _showNotification(title, status, progress) {
    this._ensureNotifContainer();
    if (!this._notifContainer) return null;

    const id = ++this._notifIdCounter;
    const notif = document.createElement('div');
    notif.className = 'lib-notification lib-notification--' + status;
    notif.dataset.notifId = id;

    let iconSvg = '';
    let iconColor = '';
    let prefix = '';
    if (status === 'queued') {
      iconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
      iconColor = '#FFC107'; prefix = 'Queued: ';
    } else if (status === 'downloading') {
      iconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
      iconColor = '#00E5FF'; prefix = '';
    } else if (status === 'done') {
      iconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>';
      iconColor = '#AAFF00'; prefix = '';
    } else if (status === 'error') {
      iconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
      iconColor = '#FF3D3D'; prefix = 'Failed: ';
    }

    const progressPercent = (typeof progress === 'number' && progress >= 0)
      ? Math.round(progress * 100) : -1;

    notif.innerHTML = `
      <div class="lib-notif-row">
        <span class="lib-notif-icon" style="color:${iconColor};">${iconSvg}</span>
        <span class="lib-notif-title">${prefix}${this._escHtml(title)}</span>
        ${status === 'downloading' && progressPercent >= 0 ? `<span class="lib-notif-pct">${progressPercent}%</span>` : ''}
        <button class="lib-notif-close" data-notif-close="${id}">&times;</button>
      </div>
      ${status === 'downloading' || status === 'queued' ? `
        <div class="lib-notif-bar">
          <div class="lib-notif-bar-fill" style="width:${progressPercent >= 0 ? progressPercent : 0}%;${status === 'queued' ? 'animation:lib-notif-pulse 1.5s ease-in-out infinite;' : ''}"></div>
        </div>
      ` : ''}
    `;

    // Close button handler
    notif.querySelector('.lib-notif-close')?.addEventListener('click', () => {
      this._dismissNotification(id);
    });

    this._notifContainer.appendChild(notif);

    const notifObj = { el: notif, id, status, timeout: null };
    this._notifications.push(notifObj);

    // Auto-dismiss success/error (errors stay longer so user can read them)
    const dismissMs = status === 'error' ? 8000 : status === 'done' ? 3000 : 0;
    if (dismissMs > 0) {
      notifObj.timeout = setTimeout(() => this._dismissNotification(id), dismissMs);
    }

    return id;
  }

  /** Update an existing notification (e.g. progress) */
  _updateNotification(id, status, progress) {
    const notifObj = this._notifications.find(n => n.id === id);
    if (!notifObj) return;

    const notif = notifObj.el;
    notifObj.status = status;
    notif.className = 'lib-notification lib-notification--' + status;

    const progressPercent = (typeof progress === 'number' && progress >= 0)
      ? Math.round(progress * 100) : -1;

    // Update percentage text
    const pctEl = notif.querySelector('.lib-notif-pct');
    if (pctEl && progressPercent >= 0) {
      pctEl.textContent = progressPercent + '%';
    }

    // Update progress bar
    const fillEl = notif.querySelector('.lib-notif-bar-fill');
    if (fillEl) {
      fillEl.style.width = (progressPercent >= 0 ? progressPercent : 0) + '%';
      fillEl.style.animation = '';
    }

    // If status changed to done/error, auto-dismiss
    if (status === 'done' || status === 'error') {
      if (notifObj.timeout) clearTimeout(notifObj.timeout);
      const dismissMs = status === 'error' ? 8000 : 3000;
      notifObj.timeout = setTimeout(() => this._dismissNotification(id), dismissMs);

      // Re-render the notification for done/error
      let iconSvg = '';
      let iconColor = '';
      let prefix = '';
      if (status === 'done') {
        iconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>';
        iconColor = '#AAFF00'; prefix = '';
      } else {
        iconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
        iconColor = '#FF3D3D'; prefix = 'Failed: ';
      }

      const titleEl = notif.querySelector('.lib-notif-title');
      if (titleEl) titleEl.textContent = prefix + titleEl.textContent.replace(/^(Queued: |Failed: )/, '');

      const iconEl = notif.querySelector('.lib-notif-icon');
      if (iconEl) { iconEl.style.color = iconColor; iconEl.innerHTML = iconSvg; }

      // Remove progress bar
      const barEl = notif.querySelector('.lib-notif-bar');
      if (barEl) barEl.remove();
      const pctRemoveEl = notif.querySelector('.lib-notif-pct');
      if (pctRemoveEl) pctRemoveEl.remove();
    }
  }

  /** Dismiss a notification by ID */
  _dismissNotification(id) {
    const idx = this._notifications.findIndex(n => n.id === id);
    if (idx === -1) return;

    const notifObj = this._notifications[idx];
    this._notifications.splice(idx, 1);

    if (notifObj.timeout) clearTimeout(notifObj.timeout);

    const notif = notifObj.el;
    if (!notif || !notif.parentNode) return;
    notif.classList.add('lib-notif-out');
    const onEnd = () => notif.remove();
    notif.addEventListener('animationend', onEnd, { once: true });
    setTimeout(onEnd, 400);
  }

  /** Destroy the notification system completely */
  destroyNotifications() {
    if (this._notifGameCheckInterval) {
      clearInterval(this._notifGameCheckInterval);
      this._notifGameCheckInterval = null;
    }
    if (this._notifResizeHandler) {
      window.removeEventListener('resize', this._notifResizeHandler);
      EventBus.off('settings:changed', this._notifResizeHandler);
    }
    this._notifications.forEach(n => {
      if (n.timeout) clearTimeout(n.timeout);
    });
    this._notifications = [];
    if (this._notifContainer) {
      this._notifContainer.remove();
      this._notifContainer = null;
    }
  }

  // ─── Overlay ────────────────────────────────────────────────────────

  _createOverlay() {
    const sa = this._calcSafeArea();

    const overlay = document.createElement('div');
    overlay.className = 'lib-overlay';
    overlay.style.left = sa.x + 'px';
    overlay.style.top = sa.y + 'px';
    overlay.style.width = sa.w + 'px';
    overlay.style.height = sa.h + 'px';

    const circumference = 2 * Math.PI * 16;

    overlay.innerHTML = `
      <style>
        /* ── Radial progress ring — contained within download button ── */
        .lib-dl-progress {
          position: absolute;
          top: 0; left: 0; width: 36px; height: 36px;
          pointer-events: none;
          overflow: hidden;
        }
        .lib-dl-progress circle {
          fill: none; stroke-width: 2.5;
          stroke-linecap: round;
          transform-box: fill-box;
          transform-origin: center;
        }
        .lib-dl-progress .progress-bg {
          stroke: rgba(0,229,255,0.12);
        }
        .lib-dl-progress .progress-fill {
          stroke: #00E5FF;
          transition: stroke-dashoffset 0.12s linear;
          transform: rotate(-90deg);
        }

        /* Indeterminate animation — beautiful looping arc spin */
        .lib-dl-progress.indeterminate .progress-fill {
          animation: lib-indeterminate-spin 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          stroke-dasharray: 35 65;
        }
        @keyframes lib-indeterminate-spin {
          0%   { stroke-dashoffset: 0; }
          50%  { stroke-dashoffset: -50; }
          100% { stroke-dashoffset: -100; }
        }

        /* ── Playing indicator on cover ── */
        .lib-tile-playing .lib-tile-cover::after {
          content: '';
          position: absolute; inset: 0;
          background: rgba(0,229,255,0.12);
          border: 2px solid rgba(0,229,255,0.35);
          border-radius: inherit;
          z-index: 2;
          animation: lib-playing-pulse 1.5s ease-in-out infinite;
        }
        @keyframes lib-playing-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        /* Speaker icon overlay */
        .lib-tile-playing .lib-tile-cover::before {
          content: '♫';
          position: absolute;
          bottom: 6px; left: 6px;
          font-size: 12px; z-index: 3;
          color: #00E5FF;
          filter: drop-shadow(0 1px 4px rgba(0,0,0,0.9));
          animation: lib-note-bounce 0.8s ease-in-out infinite alternate;
        }
        @keyframes lib-note-bounce {
          from { transform: translateY(0); }
          to { transform: translateY(-2px); }
        }

        /* ── Owned badge ── */
        .lib-owned-badge {
          display: inline-flex; align-items: center; gap: 3px;
          font-size: 9px; font-weight: 700;
          color: #AAFF00;
          background: rgba(170,255,0,0.12);
          border: 1px solid rgba(170,255,0,0.25);
          border-radius: 4px; padding: 2px 7px;
          letter-spacing: 0.06em;
        }

        /* ── Owned download button (green checkmark) ── */
        .lib-dl-btn--owned {
          background: rgba(170,255,0,0.1) !important;
          border-color: rgba(170,255,0,0.3) !important;
          color: #AAFF00 !important;
          cursor: default !important;
        }

        /* ── Tile download progress bar (right edge) ── */
        .lib-tile-progress {
          position: absolute; top: 0; right: 0; bottom: 0;
          width: 3px; background: rgba(0,0,0,0.6);
          z-index: 3; overflow: hidden;
        }
        .lib-tile-progress-fill {
          position: absolute; bottom: 0; width: 100%;
          background: #00E5FF;
          transition: height 0.12s linear;
          box-shadow: 0 0 6px rgba(0,229,255,0.5);
        }

        /* ── Notification pulse for queued ── */
        @keyframes lib-notif-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      </style>
      <div class="lib-header">
        <div style="display:flex;align-items:center;gap:10px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00E5FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          <span class="lib-title">LIBRARY</span>
        </div>
        <input type="text" class="lib-search" id="lib-search-input" placeholder="Search osu! beatmaps..." />
        <span class="lib-count" id="lib-count"></span>
        <button class="lib-close-btn" id="lib-close-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="lib-grid zzz-scroll" id="lib-grid">
        <div class="lib-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <div style="margin-top:12px;">TYPE TO SEARCH FOR BEATMAPS</div>
        </div>
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

  // ─── Search ─────────────────────────────────────────────────────────

  async search(query) {
    const grid = document.getElementById('lib-grid');
    if (!grid) return;

    if (!query.trim()) {
      grid.innerHTML = `
        <div class="lib-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <div style="margin-top:12px;">TYPE TO SEARCH FOR BEATMAPS</div>
        </div>`;
      return;
    }

    grid.innerHTML = `
      <div class="lib-loading">
        <div class="lib-loading-spinner"></div>
        <div style="color:var(--zzz-muted);font-size:13px;margin-top:12px;">SEARCHING...</div>
      </div>`;

    try {
      const response = await fetch(`/api/osu-search?q=${encodeURIComponent(query)}&m=3&limit=50&offset=0`);
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const data = await response.json();

      // API returns normalized array directly (already filtered to mania)
      const sets = Array.isArray(data) ? data : (data.beatmapsets || data.data || []);

      if (sets.length === 0) {
        grid.innerHTML = `
          <div class="lib-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <div style="margin-top:12px;">NO RESULTS FOUND</div>
          </div>`;
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

      // Get existing set IDs to mark owned maps
      const existingIds = this.existingSetIds();

      grid.innerHTML = '';
      maniaSets.forEach((set, i) => {
        const tile = this._createTile(set, i, existingIds);
        grid.appendChild(tile);
      });
    } catch (err) {
      console.error('[OsuLibrary] Search error:', err);
      grid.innerHTML = `<div class="lib-empty">SEARCH FAILED: ${err.message}</div>`;
    }
  }

  // ─── Tile Creation ──────────────────────────────────────────────────

  _createTile(set, index, existingIds) {
    const tile = document.createElement('div');
    tile.className = 'lib-tile';
    tile.dataset.setId = set.id;
    tile.style.animationDelay = `${Math.min(index * 30, 300)}ms`;

    // Get the highest mania difficulty
    const maniaMaps = (set.beatmaps || []).filter(b => b.mode === 3);
    const maxStars = maniaMaps.reduce((max, b) => Math.max(max, b.difficulty_rating || 0), 0);
    const starColor = DifficultyAnalyzer.getStarColor(maxStars);

    // Build difficulty dots
    const diffDots = maniaMaps.length > 1
      ? maniaMaps.slice(0, 8).map(b => {
          const s = b.difficulty_rating || 0;
          const c = DifficultyAnalyzer.getStarColor(s);
          return `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${c};opacity:${0.4 + (s / 10) * 0.6};" title="${b.version || '?'} ★${s.toFixed(1)}"></span>`;
        }).join('')
      : '';

    const coverUrl = set.covers?.['list@2x'] || set.covers?.list || '';
    const hasVideo = set.has_video || false;
    const isOwned = existingIds && existingIds.has(set.id);

    const dlState = this._downloadStates.get(set.id);

    const circumference = 2 * Math.PI * 16;

    tile.innerHTML = `
      <div class="lib-tile-cover" style="background-image:url('${coverUrl}');">
        ${isOwned ? '<div class="lib-tile-owned-overlay"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#AAFF00" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>' : ''}
        <div class="lib-tile-progress" style="display:none;"><div class="lib-tile-progress-fill" style="height:0%;"></div></div>
      </div>
      <div class="lib-tile-info">
        <div class="lib-tile-title">${this._escHtml(set.title || 'Unknown')}</div>
        <div class="lib-tile-artist">${this._escHtml(set.artist || 'Unknown')}</div>
        <div class="lib-tile-meta">
          <span class="lib-tile-stars" style="color:${starColor};">★ ${maxStars.toFixed(1)}</span>
          ${maniaMaps.length > 1 ? `<span class="lib-tile-diff-count">${maniaMaps.length} diffs</span>` : ''}
          ${diffDots ? `<span style="display:flex;gap:2px;align-items:center;">${diffDots}</span>` : ''}
          ${hasVideo ? '<span class="lib-tile-video">🎬</span>' : ''}
          ${isOwned ? '<span class="lib-owned-badge">✓ OWNED</span>' : ''}
        </div>
      </div>
      <div class="lib-tile-actions">
        ${isOwned ? `
          <button class="lib-dl-btn lib-dl-btn--owned" aria-label="Already owned">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </button>
        ` : `
          <button class="lib-dl-btn" data-set-id="${set.id}" aria-label="Download">
            <svg class="lib-dl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <svg class="lib-dl-progress" viewBox="0 0 36 36" style="display:none;">
              <circle class="progress-bg" cx="18" cy="18" r="16"/>
              <circle class="progress-fill" cx="18" cy="18" r="16"
                stroke-dasharray="${circumference}"
                stroke-dashoffset="${circumference}"/>
            </svg>
          </button>
        `}
      </div>
    `;

    // Tile click — play audio preview (not on download button)
    tile.addEventListener('click', (e) => {
      if (e.target.closest('.lib-dl-btn')) return;
      this._playPreview(set.id);
    });

    // Download button click handler (only for non-owned)
    const dlBtn = tile.querySelector('.lib-dl-btn:not(.lib-dl-btn--owned)');
    if (dlBtn) {
      dlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dlBtn.disabled) return;
        this.enqueueDownload(set.id, dlBtn, set.title || 'Unknown');
      });
    }

    // Restore playing state if this tile was playing before re-render
    if (this._previewSetId === set.id) {
      tile.classList.add('lib-tile-playing');
    }

    // Restore download state if applicable
    if (dlState?.state === 'downloading' || dlState?.state === 'queued') {
      const dlBtnEl = tile.querySelector('.lib-dl-btn:not(.lib-dl-btn--owned)');
      if (dlBtnEl) {
        dlBtnEl.disabled = true;
        const progressSvg = dlBtnEl.querySelector('.lib-dl-progress');
        const progressCircle = dlBtnEl.querySelector('.progress-fill');
        const dlIcon = dlBtnEl.querySelector('.lib-dl-icon');
        if (dlIcon) dlIcon.style.display = 'none';
        if (progressSvg) {
          progressSvg.style.display = 'block';
          if (dlState.state === 'queued' || dlState.progress < 0) {
            progressSvg.classList.add('indeterminate');
          }
        }
        if (progressCircle && dlState.progress >= 0) {
          progressCircle.style.strokeDashoffset = circumference * (1 - dlState.progress);
        }
        // Show progress bar
        const progressBar = tile.querySelector('.lib-tile-progress');
        const progressFill = tile.querySelector('.lib-tile-progress-fill');
        if (progressBar && dlState.progress >= 0) {
          progressBar.style.display = '';
          if (progressFill) progressFill.style.height = `${dlState.progress * 100}%`;
        }
      }
    }

    return tile;
  }

  // ─── Download Queue ─────────────────────────────────────────────────

  /** Add a download to the queue. Processes immediately if idle. */
  enqueueDownload(setId, btnElement, title) {
    const existing = this._downloadStates.get(setId);
    if (existing?.state === 'downloading' || existing?.state === 'queued') return;

    this._downloadStates.set(setId, { state: 'queued', progress: 0 });
    this._downloadQueue.push({ setId, btnElement, title });

    // Show queued visual state on button — indeterminate radial animation
    btnElement.disabled = true;
    const progressSvg = btnElement.querySelector('.lib-dl-progress');
    const progressCircle = btnElement.querySelector('.progress-fill');
    const dlIcon = btnElement.querySelector('.lib-dl-icon');
    if (dlIcon) dlIcon.style.display = 'none';
    if (progressSvg) {
      progressSvg.style.display = 'block';
      progressSvg.classList.add('indeterminate');
    }
    if (progressCircle) {
      const circumference = 2 * Math.PI * 16;
      progressCircle.style.strokeDashoffset = circumference;
    }

    // Show progress bar on tile (right edge)
    const tile = btnElement.closest('.lib-tile');
    const progressBar = tile?.querySelector('.lib-tile-progress');
    if (progressBar) progressBar.style.display = '';

    // Show notification
    this._showNotification(title, 'queued', 0);

    // Process queue if idle
    this._processQueue();
  }

  /** Process the next item in the download queue */
  async _processQueue() {
    if (this._downloading || this._downloadQueue.length === 0) return;
    this._downloading = true;

    const { setId, btnElement, title } = this._downloadQueue.shift();
    try {
      await this._download(setId, btnElement, title);
    } catch (err) {
      console.error('[OsuLibrary] Queue download error:', err);
    }

    this._downloading = false;
    // Process next in queue
    this._processQueue();
  }

  /** Perform the actual download with radial progress animation */
  async _download(setId, btnElement, title) {
    this._downloadStates.set(setId, { state: 'downloading', progress: 0 });

    const progressSvg = btnElement.querySelector('.lib-dl-progress');
    const progressCircle = btnElement.querySelector('.progress-fill');
    const circumference = 2 * Math.PI * 16;

    const tile = btnElement.closest('.lib-tile');
    const progressBar = tile?.querySelector('.lib-tile-progress');
    const progressFill = tile?.querySelector('.lib-tile-progress-fill');

    // Show downloading notification
    const notifId = this._showNotification(title, 'downloading', 0);

    try {
      const response = await fetch(`/api/osu-download/${setId}`);
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);

      const contentLength = parseInt(response.headers.get('Content-Length') || '0');
      const hasKnownSize = contentLength > 0;

      // Switch to determinate if we have Content-Length, else keep indeterminate
      if (hasKnownSize && progressSvg) {
        progressSvg.classList.remove('indeterminate');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      let received = 0;
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;

        if (hasKnownSize) {
          const progress = Math.min(1, received / contentLength);
          this._downloadStates.set(setId, { state: 'downloading', progress });

          // Update radial progress
          if (progressCircle) {
            progressCircle.style.strokeDashoffset = circumference * (1 - progress);
          }

          // Update tile progress bar (vertical, right edge)
          if (progressFill) {
            progressFill.style.height = `${progress * 100}%`;
          }

          // Update notification
          if (notifId) {
            this._updateNotification(notifId, 'downloading', progress);
          }
        } else {
          // No Content-Length — keep indeterminate with pulse effect
          this._downloadStates.set(setId, { state: 'downloading', progress: -1 });
        }
      }

      // Combine chunks into a Blob
      const blob = new Blob(chunks);
      const file = new File([blob], `${setId}.osz`, { type: 'application/octet-stream' });

      // Import via OszLoader
      const beatmapSet = await this.oszLoader.load(file);

      // Store the online set ID for future matching
      beatmapSet.onlineSetId = setId;

      // Update button to "done" state
      this._downloadStates.set(setId, { state: 'done', progress: 1 });
      // ── Memory: clean up download state after a delay ──
      setTimeout(() => this._downloadStates.delete(setId), 10000);
      btnElement.classList.add('lib-dl-btn--done');
      if (progressSvg) {
        progressSvg.style.display = 'none';
        progressSvg.classList.remove('indeterminate');
      }

      // Complete the tile progress bar
      if (progressFill) {
        progressFill.style.height = '100%';
        progressFill.style.background = '#AAFF00';
        setTimeout(() => {
          if (progressBar) progressBar.style.display = 'none';
          if (progressFill) progressFill.style.background = '#00E5FF';
        }, 1500);
      }

      // Replace SVG icon with checkmark
      const iconSvg = btnElement.querySelector('.lib-dl-icon');
      if (iconSvg) {
        iconSvg.innerHTML = '<polyline points="20 6 9 17 4 12" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
        iconSvg.style.display = '';
      }

      // Update notification to done
      if (notifId) {
        this._updateNotification(notifId, 'done', 1);
      } else {
        this._showNotification(title, 'done');
      }

      // Notify parent — pass skipSelect flag if game is active
      const skipSelect = this.isGameActive();
      if (this.onImported) this.onImported(beatmapSet, { skipSelect });

    } catch (err) {
      console.error('[OsuLibrary] Download error:', err);
      this._downloadStates.set(setId, { state: 'error', progress: 0 });

      btnElement.classList.add('lib-dl-btn--error');
      if (progressSvg) {
        progressSvg.style.display = 'none';
        progressSvg.classList.remove('indeterminate');
      }

      // Hide progress bar on error
      if (progressBar) progressBar.style.display = 'none';

      // Replace icon with X
      const iconSvg = btnElement.querySelector('.lib-dl-icon');
      if (iconSvg) {
        iconSvg.innerHTML = '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>';
        iconSvg.style.display = '';
      }

      // Update notification to error — include error message for diagnosis
      const errMsg = err?.message || String(err) || 'Unknown error';
      if (notifId) {
        this._updateNotification(notifId, 'error', 0);
        // Also show a more detailed error notification
        this._showNotification(`${title}: ${errMsg}`, 'error');
      } else {
        this._showNotification(`${title}: ${errMsg}`, 'error');
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

  // ─── Utility ────────────────────────────────────────────────────────

  _escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
}
