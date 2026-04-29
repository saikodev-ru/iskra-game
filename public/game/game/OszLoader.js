import DifficultyAnalyzer from './DifficultyAnalyzer.js';

// ── IndexedDB-backed storage for beatmap sets ──────────────────────────────

class BeatmapStore {
  static DB_NAME = 'rhythm-os-db';
  static STORE_NAME = 'beatmaps';
  static DB_VERSION = 6; // v6: strip videoData from IndexedDB to save memory

  /** Open (or create) the database */
  static async open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(BeatmapStore.DB_NAME, BeatmapStore.DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(BeatmapStore.STORE_NAME)) {
          db.createObjectStore(BeatmapStore.STORE_NAME, { keyPath: 'id' });
        }
        // v2→v3: clear all stored beatmaps (hold note duration fix)
        if (e.oldVersion < 3) {
          try {
            const tx = e.target.transaction;
            const store = tx.objectStore(BeatmapStore.STORE_NAME);
            store.clear();
            console.log('[BeatmapStore] Cleared cached beatmaps (v3 migration: hold note fix)');
          } catch (err) {
            console.warn('[BeatmapStore] v3 migration clear failed:', err);
          }
        }
        // v4→v5: clear all stored beatmaps (AVI video format fix)
        if (e.oldVersion < 5) {
          try {
            const tx = e.target.transaction;
            const store = tx.objectStore(BeatmapStore.STORE_NAME);
            store.clear();
            console.log('[BeatmapStore] Cleared cached beatmaps (v5 migration: AVI video fix + note conflict resolution)');
          } catch (err) {
            console.warn('[BeatmapStore] v5 migration clear failed:', err);
          }
        }
        // v5→v6: strip videoData from stored beatmaps to save memory
        // Video files can be 50-200MB each and are not needed in IndexedDB
        if (e.oldVersion < 6 && e.oldVersion > 0) {
          try {
            const tx = e.target.transaction;
            const store = tx.objectStore(BeatmapStore.STORE_NAME);
            const request = store.openCursor();
            request.onsuccess = (event) => {
              const cursor = event.target.result;
              if (cursor) {
                const entry = cursor.value;
                if (entry.videoData) {
                  delete entry.videoData;
                  delete entry.videoMime;
                  cursor.update(entry);
                }
                cursor.continue();
              }
            };
            console.log('[BeatmapStore] Stripping videoData from stored beatmaps (v6 migration: memory optimization)');
          } catch (err) {
            console.warn('[BeatmapStore] v6 migration strip failed:', err);
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Serialize an AudioBuffer to a plain object storable in IndexedDB.
   */
  static _serializeAudioBuffer(audioBuffer) {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const sampleRate = audioBuffer.sampleRate;
    const channelData = [];
    for (let ch = 0; ch < numberOfChannels; ch++) {
      const samples = new Float32Array(length);
      audioBuffer.copyFromChannel(samples, ch);
      channelData.push(samples.buffer); // ArrayBuffer
    }
    return { sampleRate, length, numberOfChannels, channelData };
  }

  /**
   * Reconstruct an AudioBuffer from serialized PCM data.
   */
  static _deserializeAudioBuffer(ctx, serialized) {
    const { sampleRate, length, numberOfChannels, channelData } = serialized;
    const buffer = ctx.createBuffer(numberOfChannels, length, sampleRate);
    for (let ch = 0; ch < numberOfChannels; ch++) {
      const samples = new Float32Array(channelData[ch]);
      buffer.copyToChannel(samples, ch);
    }
    return buffer;
  }

  /**
   * Save a BeatmapSet to IndexedDB.
   * Uses structured clone directly (not JSON) so that Uint8Arrays (backgroundData)
   * are preserved natively. Only AudioBuffer needs special handling.
   */
  static async save(beatmapSet) {
    const db = await BeatmapStore.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BeatmapStore.STORE_NAME, 'readwrite');
      const store = tx.objectStore(BeatmapStore.STORE_NAME);

      // Shallow clone so we don't mutate the original
      const storable = Object.assign({}, beatmapSet);

      // Replace AudioBuffer with serialized PCM data (not structured-cloneable)
      if (storable.audioBuffer instanceof AudioBuffer) {
        storable.audioBuffer = BeatmapStore._serializeAudioBuffer(storable.audioBuffer);
        storable._hasAudioBuffer = true;
      }

      // Deep-clone the difficulties array to avoid mutating original
      // (notes arrays etc. may have typed arrays inside)
      // Also serialize per-difficulty AudioBuffers (some maps have different audio per diff)
      storable.difficulties = storable.difficulties.map(diff => {
        const clone = { ...diff };
        if (clone.audioBuffer instanceof AudioBuffer) {
          clone.audioBuffer = BeatmapStore._serializeAudioBuffer(clone.audioBuffer);
          clone._hasDiffAudioBuffer = true;
        }
        // Deep-clone notes and other nested arrays
        clone.notes = JSON.parse(JSON.stringify(clone.notes || []));
        clone.bpmChanges = JSON.parse(JSON.stringify(clone.bpmChanges || []));
        clone.kiaiSections = JSON.parse(JSON.stringify(clone.kiaiSections || []));
        return clone;
      });

      // STRIP videoData from stored object — videos can be 50-200MB each
      // and cause massive memory usage when loaded from IndexedDB.
      // videoUrl (blob: URL) is session-only and will be reconstructed from backgroundData.
      // If the user wants the video back, they can re-download the map.
      delete storable.videoData;
      delete storable.videoMime;

      // backgroundData (Uint8Array) and backgroundMime (string) are
      // structured-clone compatible, so they survive IndexedDB put() natively.
      // backgroundUrl (blob: URL) is also stored but is only valid for current session.

      store.put(storable);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Load all stored beatmap sets, reconstructing AudioBuffers and backgroundUrls.
   * WARNING: This loads ALL AudioBuffers into memory at once — can use GBs of RAM!
   * Use loadAllMetadata() instead for the song list, and loadAudioBuffer() on demand.
   */
  static async loadAll(audioCtx) {
    const db = await BeatmapStore.open();
    const raw = await new Promise((resolve, reject) => {
      const tx = db.transaction(BeatmapStore.STORE_NAME, 'readonly');
      const store = tx.objectStore(BeatmapStore.STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    let ctx = audioCtx;
    let shouldClose = false;
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      shouldClose = true;
    }

    const results = raw.map((entry) => {
      // Reconstruct AudioBuffer (set-level)
      if (entry._hasAudioBuffer && entry.audioBuffer?.sampleRate && entry.audioBuffer?.channelData) {
        try {
          entry.audioBuffer = BeatmapStore._deserializeAudioBuffer(ctx, entry.audioBuffer);
        } catch (err) {
          console.warn(`Failed to reconstruct AudioBuffer for ${entry.id}:`, err);
          entry.audioBuffer = null;
        }
      }

      // Reconstruct per-difficulty AudioBuffers (for maps with different audio per diff)
      if (entry.difficulties && Array.isArray(entry.difficulties)) {
        for (const diff of entry.difficulties) {
          if (diff._hasDiffAudioBuffer && diff.audioBuffer?.sampleRate && diff.audioBuffer?.channelData) {
            try {
              diff.audioBuffer = BeatmapStore._deserializeAudioBuffer(ctx, diff.audioBuffer);
            } catch (err) {
              console.warn(`Failed to reconstruct diff AudioBuffer for ${entry.id}:`, err);
              diff.audioBuffer = null;
            }
          }
        }
      }

      // Reconstruct backgroundUrl from backgroundData
      BeatmapStore._reconstructBlobUrls(entry);

      return entry;
    });

    if (shouldClose) {
      try { await ctx.close(); } catch (_) { /* ignore */ }
    }

    return results;
  }

  /**
   * Load all stored beatmap sets as METADATA ONLY — no AudioBuffers decoded.
   * This is the memory-efficient way to load the song list.
   * AudioBuffers should be loaded on-demand via loadAudioBuffer().
   * Background URLs are reconstructed from stored image data.
   */
  static async loadAllMetadata() {
    const db = await BeatmapStore.open();
    const raw = await new Promise((resolve, reject) => {
      const tx = db.transaction(BeatmapStore.STORE_NAME, 'readonly');
      const store = tx.objectStore(BeatmapStore.STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const results = raw.map((entry) => {
      // Mark that this entry HAS an AudioBuffer available but don't decode it
      // entry._hasAudioBuffer is already true/false
      if (entry._hasAudioBuffer && entry.audioBuffer) {
        entry._audioBufferNeedsDecode = true;
        // CRITICAL: Strip serialized PCM channelData from memory!
        // Each song's channelData can be 30-80MB of Float32Array buffers.
        // Keeping them all in memory causes OOM (8GB+ RAM usage).
        // The data remains in IndexedDB and is loaded on-demand via loadAudioBuffer().
        if (entry.audioBuffer.channelData) {
          for (let i = 0; i < entry.audioBuffer.channelData.length; i++) {
            entry.audioBuffer.channelData[i] = null;
          }
          entry.audioBuffer.channelData = null;
        }
        entry.audioBuffer = null; // Fully null it — loadAudioBuffer() reads from IndexedDB
      }

      // Same for per-difficulty AudioBuffers
      if (entry.difficulties && Array.isArray(entry.difficulties)) {
        for (const diff of entry.difficulties) {
          if (diff._hasDiffAudioBuffer && diff.audioBuffer) {
            diff._audioBufferNeedsDecode = true;
            // Strip per-difficulty serialized PCM data too
            if (diff.audioBuffer.channelData) {
              for (let i = 0; i < diff.audioBuffer.channelData.length; i++) {
                diff.audioBuffer.channelData[i] = null;
              }
              diff.audioBuffer.channelData = null;
            }
            diff.audioBuffer = null;
          }
        }
      }

      // Reconstruct backgroundUrl from backgroundData FIRST (needs the raw data)
      BeatmapStore._reconstructBlobUrls(entry);

      // Now strip backgroundData from in-memory entries to save RAM.
      // The backgroundUrl (blob:) is already reconstructed above.
      // Typical background images are 1-5MB each, but with many maps this adds up.
      if (entry.backgroundData) {
        entry.backgroundData = null;
      }

      return entry;
    });

    console.log(`[BeatmapStore] Loaded ${results.length} beatmap sets (metadata only, AudioBuffers + big data stripped)`);
    return results;
  }

  /**
   * Load and decode the AudioBuffer for a single beatmap set (on demand).
   * This is the memory-efficient replacement for loading all AudioBuffers at once.
   * @param {string} id - The beatmap set ID
   * @param {AudioContext} audioCtx - AudioContext for decoding
   * @returns {{ audioBuffer: AudioBuffer|null, diffAudioBuffers: Map<string, AudioBuffer> }}
   */
  static async loadAudioBuffer(id, audioCtx) {
    const db = await BeatmapStore.open();
    const entry = await new Promise((resolve, reject) => {
      const tx = db.transaction(BeatmapStore.STORE_NAME, 'readonly');
      const store = tx.objectStore(BeatmapStore.STORE_NAME);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    if (!entry) return { audioBuffer: null, diffAudioBuffers: new Map() };

    let ctx = audioCtx;
    let shouldClose = false;
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      shouldClose = true;
    }

    let audioBuffer = null;
    const diffAudioBuffers = new Map(); // diffIndex → AudioBuffer

    // Decode set-level AudioBuffer
    if (entry._hasAudioBuffer && entry.audioBuffer?.sampleRate && entry.audioBuffer?.channelData) {
      try {
        audioBuffer = BeatmapStore._deserializeAudioBuffer(ctx, entry.audioBuffer);
      } catch (err) {
        console.warn(`Failed to decode AudioBuffer for ${id}:`, err);
      }
    }

    // Decode per-difficulty AudioBuffers
    if (entry.difficulties && Array.isArray(entry.difficulties)) {
      for (let i = 0; i < entry.difficulties.length; i++) {
        const diff = entry.difficulties[i];
        if (diff._hasDiffAudioBuffer && diff.audioBuffer?.sampleRate && diff.audioBuffer?.channelData) {
          try {
            diffAudioBuffers.set(i, BeatmapStore._deserializeAudioBuffer(ctx, diff.audioBuffer));
          } catch (err) {
            console.warn(`Failed to decode diff AudioBuffer for ${id}:`, err);
          }
        }
      }
    }

    if (shouldClose) {
      try { await ctx.close(); } catch (_) { /* ignore */ }
    }

    return { audioBuffer, diffAudioBuffers };
  }

  /** Delete a single beatmap set by id */
  static async delete(id) {
    const db = await BeatmapStore.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BeatmapStore.STORE_NAME, 'readwrite');
      const store = tx.objectStore(BeatmapStore.STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /** Clear all stored beatmap sets */
  static async clear() {
    const db = await BeatmapStore.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BeatmapStore.STORE_NAME, 'readwrite');
      const store = tx.objectStore(BeatmapStore.STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Delete ALL beatmap sets from IndexedDB and revoke all blob URLs.
   * Call this when the user wants to wipe their chart library.
   * @param {Object[]} inMemorySets - The current beatmapSets array to revoke blob URLs from
   */
  static async deleteAll(inMemorySets = []) {
    // Revoke all blob URLs to prevent memory leaks
    for (const set of inMemorySets) {
      if (set.backgroundUrl && set.backgroundUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(set.backgroundUrl); } catch (_) {}
      }
      if (set.videoUrl && set.videoUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(set.videoUrl); } catch (_) {}
      }
    }
    // Clear IndexedDB
    return BeatmapStore.clear();
  }

  /**
   * Reconstruct blob URLs (background, video) from stored binary data.
   * Called by both loadAll() and loadAllMetadata().
   */
  static _reconstructBlobUrls(entry) {
    // ── Memory: revoke old blob URLs before creating new ones ──
    if (entry.backgroundUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(entry.backgroundUrl);
    }
    // Reconstruct backgroundUrl from backgroundData
    if (entry.backgroundData && entry.backgroundMime) {
      try {
        let data = entry.backgroundData;
        if (!(data instanceof Uint8Array)) {
          const keys = Object.keys(data).map(Number).sort((a, b) => a - b);
          const arr = new Uint8Array(keys.length);
          keys.forEach(k => { arr[k] = data[k]; });
          data = arr;
        }
        const blob = new Blob([data], { type: entry.backgroundMime });
        entry.backgroundUrl = URL.createObjectURL(blob);
      } catch (err) {
        console.warn(`Failed to reconstruct backgroundUrl for ${entry.id}:`, err);
        entry.backgroundUrl = null;
      }
    }

    // ── Memory: revoke old video blob URL before creating new one ──
    if (entry.videoUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(entry.videoUrl);
    }
    // Reconstruct videoUrl from videoData (only present in older DB versions or current session)
    if (entry.videoData && entry.videoMime) {
      try {
        let data = entry.videoData;
        if (!(data instanceof Uint8Array)) {
          const keys = Object.keys(data).map(Number).sort((a, b) => a - b);
          const arr = new Uint8Array(keys.length);
          keys.forEach(k => { arr[k] = data[k]; });
          data = arr;
        }
        const blob = new Blob([data], { type: entry.videoMime });
        entry.videoUrl = URL.createObjectURL(blob);
      } catch (err) {
        console.warn(`Failed to reconstruct videoUrl for ${entry.id}:`, err);
        entry.videoUrl = null;
      }
    }
  }
}

// ── OszLoader ──────────────────────────────────────────────────────────────

export default class OszLoader {
  constructor(audioEngine) {
    this.audio = audioEngine;
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Load a .osz file, parse all difficulties, decode audio, and store in IndexedDB.
   * @param {File|Blob} file - The .osz file
   * @returns {Object} BeatmapSet
   */
  async load(file) {
    try {
      const arrayBuffer = await file.arrayBuffer();

      let fflate;
      try {
        fflate = await import('fflate');
      } catch (e) {
        throw new Error('fflate not loaded. Check import map.');
      }

      const unzipped = fflate.unzipSync(new Uint8Array(arrayBuffer));

      // ── Categorise files ───────────────────────────────────────────────
      const osuFiles = [];
      const audioFiles = {};
      const imageFiles = {};
      const videoFiles = {}; // .mp4, .avi, .wmv, .flv, .webm

      for (const [filename, data] of Object.entries(unzipped)) {
        const lower = filename.toLowerCase();
        if (lower.endsWith('.osu')) {
          osuFiles.push({ filename, content: new TextDecoder().decode(data) });
        } else if (lower.endsWith('.mp3') || lower.endsWith('.ogg') || lower.endsWith('.wav')) {
          audioFiles[lower] = data;
        } else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png')) {
          imageFiles[lower] = data;
        } else if (lower.endsWith('.mp4') || lower.endsWith('.avi') || lower.endsWith('.wmv') || lower.endsWith('.flv') || lower.endsWith('.webm')) {
          videoFiles[lower] = data;
        }
      }

      if (osuFiles.length === 0) {
        throw new Error('No .osu file found in .osz archive');
      }

      // ── Parse each .osu as a separate difficulty ───────────────────────
      const parsedMaps = [];
      for (const osuFile of osuFiles) {
        const parsed = this._parseOsu(osuFile.content);
        // Only keep standard (0) and mania (3) modes
        if (parsed.mode !== 0 && parsed.mode !== 3) {
          continue;
        }
        parsedMaps.push(parsed);
      }

      if (parsedMaps.length === 0) {
        throw new Error('No supported .osu files found (need Mode 0 or 3)');
      }

      // ── Use the first valid .osu for shared resources (audio / bg) ────
      const firstParsed = parsedMaps[0];

      // ── Decode audio files — support different audio per difficulty ──────
      // Some osu!mania maps have different audio files per difficulty
      // (e.g., normal speed vs. accelerated versions).
      // We decode each unique audio file and store them in a map.

      // Collect all unique audio filenames referenced by difficulties
      const audioFilenames = new Set();
      for (const parsed of parsedMaps) {
        const af = parsed.general.AudioFilename?.toLowerCase();
        if (af) audioFilenames.add(af);
      }

      // Decode each unique audio file
      const audioBufferMap = {}; // filename → AudioBuffer
      for (const filename of audioFilenames) {
        if (audioFiles[filename]) {
          try {
            audioBufferMap[filename] = await this._decodeAudio(audioFiles[filename]);
          } catch (err) {
            console.warn(`[OszLoader] Failed to decode audio "${filename}":`, err);
          }
        }
      }

      // Primary audio buffer: use the first parsed .osu's audio (for preview)
      const primaryAudioFilename = firstParsed.general.AudioFilename?.toLowerCase();
      let audioBuffer = audioBufferMap[primaryAudioFilename] || Object.values(audioBufferMap)[0] || null;

      // Create background Object URL and also store raw data for persistence
      let backgroundUrl = null;
      let backgroundData = null;
      let backgroundMime = null;

      const bgFileName = firstParsed.background?.toLowerCase();
      if (bgFileName && imageFiles[bgFileName]) {
        backgroundData = imageFiles[bgFileName]; // Uint8Array — survives structured clone
        backgroundMime = bgFileName.endsWith('.png') ? 'image/png' : 'image/jpeg';
        backgroundUrl = this._createImageObjectURL(bgFileName, imageFiles[bgFileName]);
      } else {
        const firstImage = Object.entries(imageFiles)[0];
        if (firstImage) {
          backgroundData = firstImage[1]; // Uint8Array
          backgroundMime = firstImage[0].toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
          backgroundUrl = this._createImageObjectURL(firstImage[0], firstImage[1]);
        }
      }

      // Create video Object URL and store raw data for persistence
      // Only process browser-supported video formats (MP4, WebM)
      // AVI, WMV, FLV are NOT supported by browsers — skip them
      let videoUrl = null;
      let videoData = null;
      let videoMime = null;

      const videoFileName = firstParsed.video?.toLowerCase();
      if (videoFileName && videoFiles[videoFileName]) {
        const lowerName = videoFileName.toLowerCase();
        if (lowerName.endsWith('.mp4') || lowerName.endsWith('.webm')) {
          videoData = videoFiles[videoFileName];
          videoMime = this._getVideoMime(videoFileName);
          videoUrl = this._createVideoObjectURL(videoFileName, videoFiles[videoFileName]);
        } else {
          // Unsupported format (AVI, WMV, FLV) — log and skip
          console.log(`[OszLoader] Skipping unsupported video format: ${videoFileName}`);
        }
      } else {
        // Fallback: try the first video file, but only if it's a supported format
        for (const [vidName, vidData] of Object.entries(videoFiles)) {
          const lowerName = vidName.toLowerCase();
          if (lowerName.endsWith('.mp4') || lowerName.endsWith('.webm')) {
            videoData = vidData;
            videoMime = this._getVideoMime(vidName);
            videoUrl = this._createVideoObjectURL(vidName, vidData);
            break;
          }
        }
      }

      // ── Build difficulties array ───────────────────────────────────────
      const difficulties = [];

      for (const parsed of parsedMaps) {
        const diffAudioFilename = parsed.general.AudioFilename?.toLowerCase() || primaryAudioFilename;
        const diffAudioBuffer = audioBufferMap[diffAudioFilename] || audioBuffer;
        const diff = this._buildDifficulty(parsed, diffAudioBuffer);
        if (diff) {
          // Store per-difficulty audio info for correct playback
          diff.audioFilename = diffAudioFilename;
          diff.audioBuffer = diffAudioBuffer;
          // Flag if this difficulty uses a different audio than the set's primary
          diff.hasCustomAudio = diffAudioFilename !== primaryAudioFilename && !!diffAudioBuffer;
          difficulties.push(diff);
        }
      }

      // Sort by star rating ascending
      difficulties.sort((a, b) => a.difficulty.stars - b.difficulty.stars);

      // ── Assemble BeatmapSet ────────────────────────────────────────────
      // Extract online set ID from .osu metadata (for matching with osu! library)
      const onlineSetIdRaw = firstParsed.metadata.BeatmapSetID;
      const onlineSetId = onlineSetIdRaw && onlineSetIdRaw !== '-1'
        ? parseInt(onlineSetIdRaw, 10) || null
        : null;

      const beatmapSet = {
        id: `osz-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        onlineSetId,
        title: firstParsed.metadata.Title || 'Unknown',
        artist: firstParsed.metadata.Artist || 'Unknown',
        creator: firstParsed.metadata.Creator || '',
        backgroundUrl,
        backgroundData,
        backgroundMime,
        videoUrl,
        videoData,
        videoMime,
        audioBuffer,
        difficulties,
        isMania: difficulties.some(d => d.osuMode === 3),
      };

      // ── Persist to IndexedDB ───────────────────────────────────────────
      try {
        await BeatmapStore.save(beatmapSet);
      } catch (err) {
        console.warn('Failed to save beatmap set to IndexedDB:', err);
      }

      return beatmapSet;
    } catch (err) {
      console.error('OszLoader error:', err);
      throw err;
    }
  }

  /**
   * Load all beatmap sets from IndexedDB, reconstructing AudioBuffers and backgroundUrls.
   * WARNING: This loads ALL AudioBuffers into memory — can use GBs of RAM!
   * Use loadFromStoreMetadata() instead for the song list.
   * @returns {Object[]} Array of BeatmapSet objects
   */
  async loadFromStore() {
    try {
      const audioCtx = this.audio?.ctx || this.audio?.context || null;
      return await BeatmapStore.loadAll(audioCtx);
    } catch (err) {
      console.error('OszLoader.loadFromStore error:', err);
      return [];
    }
  }

  /**
   * Load all beatmap sets as METADATA ONLY — no AudioBuffers decoded.
   * This is the memory-efficient way to load the song list.
   * Use loadAudioBufferForSet() to load audio on demand.
   * @returns {Object[]} Array of BeatmapSet objects (audioBuffer will be null/serialized)
   */
  async loadFromStoreMetadata() {
    try {
      return await BeatmapStore.loadAllMetadata();
    } catch (err) {
      console.error('OszLoader.loadFromStoreMetadata error:', err);
      return [];
    }
  }

  /**
   * Load and decode the AudioBuffer for a single beatmap set (on demand).
   * @param {string} id - The beatmap set ID
   * @returns {{ audioBuffer: AudioBuffer|null, diffAudioBuffers: Map<number, AudioBuffer> }}
   */
  async loadAudioBufferForSet(id) {
    try {
      const audioCtx = this.audio?.ctx || this.audio?.context || null;
      return await BeatmapStore.loadAudioBuffer(id, audioCtx);
    } catch (err) {
      console.error('OszLoader.loadAudioBufferForSet error:', err);
      return { audioBuffer: null, diffAudioBuffers: new Map() };
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Decode a Uint8Array of audio bytes into an AudioBuffer.
   */
  async _decodeAudio(uint8Array) {
    const ab = uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength);
    return this.audio.decodeBuffer(ab);
  }

  /**
   * Create an Object URL for an image file stored in the archive.
   */
  _createImageObjectURL(filename, data) {
    const lower = filename.toLowerCase();
    const mime = lower.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const blob = new Blob([data], { type: mime });
    return URL.createObjectURL(blob);
  }

  /**
   * Build a single difficulty object from a parsed .osu map.
   * Handles osu! standard → mania conversion when mode === 0.
   */
  _buildDifficulty(parsed, audioBuffer) {
    let laneCount;
    if (parsed.mode === 3) {
      laneCount = parsed.difficulty.CircleSize || 4;
    } else {
      laneCount = 4;
    }

    const notes = this._convertHitObjects(parsed.hitObjects, laneCount, parsed.mode, parsed.timingPoints, parsed.difficulty);

    if (notes.length === 0) {
      return null;
    }

    // ── Resolve note conflicts (overlap / too-close on same lane) ──
    this._resolveNoteConflicts(notes, laneCount);

    const bpmChanges = parsed.timingPoints
      .filter(tp => tp.msPerBeat > 0)
      .map(tp => ({
        time: tp.offset / 1000,
        bpm: 60000 / tp.msPerBeat,
      }));

    // ── Build kiai sections from timing points' effects flag ──
    const kiaiSections = this._buildKiaiSections(parsed.timingPoints);
    console.log(`[OszLoader] _buildDifficulty: audioBuffer=${audioBuffer ? audioBuffer.duration.toFixed(1) + 's' : 'null'}, notes=${notes.length}, kiaiSections=${kiaiSections.length}`);

    const primaryBpm = bpmChanges.length > 0 ? bpmChanges[0].bpm : 120;

    const sortedNotes = [...notes].sort((a, b) => a.time - b.time);
    const lastNote = sortedNotes[sortedNotes.length - 1];
    const mapDuration = lastNote
      ? (lastNote.time + lastNote.duration + 2) * 1000
      : 0;

    const version = parsed.metadata.Version || 'Normal';

    const difficultyMap = {
      notes,
      laneCount,
      bpmChanges,
      metadata: {
        bpm: Math.round(primaryBpm),
        duration: Math.round(mapDuration),
      },
    };

    const diffResult = DifficultyAnalyzer.analyze(difficultyMap);

    return {
      version,
      laneCount,
      notes,
      bpmChanges,
      kiaiSections,
      metadata: {
        bpm: Math.round(primaryBpm),
        duration: Math.round(mapDuration),
        previewTime: (parseFloat(parsed.general.PreviewTime) || 0) / 1000,
      },
      difficulty: diffResult,
      osuMode: parsed.mode,  // 0 = osu!standard, 3 = osu!mania
    };
  }

  /**
   * Convert raw hit objects from .osu into mania note format.
   */
  _convertHitObjects(hitObjects, laneCount, mode, timingPoints, difficulty) {
    const notes = [];
    let noteId = 0;

    for (const ho of hitObjects) {
      const isCircle = (ho.type & 1) !== 0;
      const isSlider = (ho.type & 2) !== 0;
      const isSpinner = (ho.type & 8) !== 0;
      const isHold = (ho.type & 128) !== 0; // osu!mania hold notes

      if (isSpinner) continue;

      let lane;
      if (mode === 3) {
        lane = Math.min(Math.floor((ho.x * laneCount) / 512), laneCount - 1);
      } else {
        lane = Math.min(Math.floor((ho.x * laneCount) / 512), laneCount - 1);
      }
      lane = Math.max(0, lane);

      const time = ho.time / 1000;
      let duration = 0;
      let noteType = 'tap';

      if ((isSlider || isHold) && ho.endTime > ho.time) {
        duration = (ho.endTime - ho.time) / 1000;
        noteType = 'hold';
      }

      notes.push({
        id: noteId++,
        lane,
        time,
        duration,
        type: noteType,
      });
    }

    notes.sort((a, b) => a.time - b.time || a.lane - b.lane);

    for (let i = 0; i < notes.length; i++) {
      notes[i].id = i;
    }

    return notes;
  }

  /**
   * Resolve note conflicts after conversion.
   * 1. If notes on the same lane overlap (impossible to hold), shift to adjacent lane.
   * 2. If notes on the same lane are too close together (< 80ms), shift to adjacent lane.
   * Uses a greedy lane-assignment algorithm similar to osu!mania import handling.
   */
  _resolveNoteConflicts(notes, laneCount) {
    if (notes.length === 0 || laneCount <= 1) return;

    const MIN_GAP = 0.08; // 80ms minimum gap between notes on same lane

    // Sort by time, then lane
    notes.sort((a, b) => a.time - b.time || a.lane - b.lane);

    // Group notes by lane for fast overlap detection
    const byLane = new Map();
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      if (!byLane.has(n.lane)) byLane.set(n.lane, []);
      byLane.get(n.lane).push(n);
    }

    // Find all conflicts on each lane
    const conflicts = [];
    for (const [lane, laneNotes] of byLane) {
      laneNotes.sort((a, b) => a.time - b.time);
      for (let i = 0; i < laneNotes.length - 1; i++) {
        const curr = laneNotes[i];
        const next = laneNotes[i + 1];
        const currEnd = curr.time + Math.max(curr.duration || 0, 0.05); // hold notes use full duration

        // Check overlap: current note's end overlaps with next note's start
        // OR they're too close together
        if (currEnd > next.time - MIN_GAP) {
          conflicts.push({ note: next, conflictWith: curr, origLane: lane });
        }
      }
    }

    // Resolve each conflict by shifting to the best available lane
    for (const { note: conflictNote, origLane } of conflicts) {
      // Skip if already shifted by a previous resolution
      if (conflictNote.lane !== origLane) continue;

      // Try adjacent lanes: prefer lanes closest to original, then check for new conflicts
      const candidates = [];
      for (let delta = 1; delta < laneCount; delta++) {
        for (const dir of [1, -1]) {
          const newLane = origLane + delta * dir;
          if (newLane < 0 || newLane >= laneCount) continue;
          candidates.push({ lane: newLane, dist: delta });
        }
      }

      // Sort by distance (prefer closer lanes)
      candidates.sort((a, b) => a.dist - b.dist);

      let bestLane = origLane;
      let bestScore = -Infinity;

      for (const { lane: candidateLane, dist } of candidates) {
        const laneNotes = byLane.get(candidateLane) || [];
        let score = 100 - dist * 10; // prefer closer lanes

        // Check if this note would conflict on the candidate lane
        const noteStart = conflictNote.time;
        const noteEnd = conflictNote.time + Math.max(conflictNote.duration || 0, 0.05);

        let hasConflict = false;
        for (const other of laneNotes) {
          const otherEnd = other.time + Math.max(other.duration || 0, 0.05);
          // Check if ranges overlap or are too close
          if (otherEnd > noteStart - MIN_GAP && other.time < noteEnd + MIN_GAP) {
            score -= 50; // heavy penalty for conflict on candidate lane
            hasConflict = true;
          }
        }

        if (!hasConflict && score > bestScore) {
          bestScore = score;
          bestLane = candidateLane;
        }
      }

      // Apply the shift if we found a better lane
      if (bestLane !== origLane && bestLane !== conflictNote.lane) {
        // Remove from old lane group
        const oldGroup = byLane.get(conflictNote.lane);
        if (oldGroup) {
          const idx = oldGroup.indexOf(conflictNote);
          if (idx >= 0) oldGroup.splice(idx, 1);
        }
        // Assign new lane
        conflictNote.lane = bestLane;
        // Add to new lane group
        if (!byLane.has(bestLane)) byLane.set(bestLane, []);
        byLane.get(bestLane).push(conflictNote);
      }
    }
  }

  // ── .osu File Parser ─────────────────────────────────────────────────────

  _parseOsu(content) {
    const result = {
      general: {},
      metadata: {},
      difficulty: {},
      timingPoints: [],
      hitObjects: [],
      background: null,
      video: null, // video filename from Events
      mode: 0,
    };

    const lines = content.split(/\r?\n/);
    let section = '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//')) continue;

      const sectionMatch = line.match(/^\[(\w+)\]$/);
      if (sectionMatch) {
        section = sectionMatch[1];
        continue;
      }

      if (section === 'General') {
        const [key, ...rest] = line.split(':');
        const value = rest.join(':').trim();
        const keyTrimmed = key.trim();
        result.general[keyTrimmed] = value;
        if (keyTrimmed === 'Mode') {
          result.mode = parseInt(value, 10);
        }
      }
      else if (section === 'Metadata') {
        const [key, ...rest] = line.split(':');
        result.metadata[key.trim()] = rest.join(':').trim();
      }
      else if (section === 'Difficulty') {
        const [key, ...rest] = line.split(':');
        result.difficulty[key.trim()] = parseFloat(rest.join(':').trim());
      }
      else if (section === 'TimingPoints') {
        const parts = line.split(',');
        if (parts.length >= 2) {
          const offset = parseFloat(parts[0]);
          const msPerBeat = parseFloat(parts[1]);
          const meter = parts.length > 2 ? parseInt(parts[2], 10) : 4;
          const inherited = msPerBeat < 0;
          // effects is column index 7 (osu! format: offset,beatLength,meter,sampleSet,sampleIndex,volume,uninherited,effects)
          // fallback to index 6 for maps without uninherited column
          const effects = parts.length > 7 ? parseInt(parts[7], 10) : (parts.length > 6 ? parseInt(parts[6], 10) : 0);
          const kiai = !!(effects & 1); // bit 0 = kiai time
          result.timingPoints.push({ offset, msPerBeat, meter, inherited, kiai });
        }
      }
      else if (section === 'HitObjects') {
        const parts = line.split(',');
        if (parts.length < 4) continue;

        const x = parseFloat(parts[0]);
        const y = parseFloat(parts[1]);
        const time = parseFloat(parts[2]);
        const type = parseInt(parts[3], 10);
        let endTime = 0;

        if ((type & 2) && parts.length >= 8) {
          const tp = this._findTimingPoint(result.timingPoints, time);
          const msPerBeat = tp ? tp.msPerBeat : 1000; // keep in ms
          const length = parseFloat(parts[7]) || 0;
          const sliderMult = result.difficulty.SliderMultiplier || 1.4;
          const repeats = parseInt(parts[6], 10) || 1;
          // duration_ms = (length / (sliderMult * 100)) beats * msPerBeat * repeats
          endTime = time + (length / (sliderMult * 100)) * msPerBeat * repeats;
        }
        else if ((type & 8) && parts.length >= 6) {
          endTime = parseFloat(parts[5]);
        }
        if ((type & 128) && parts.length >= 6) {
          const extras = parts[5].split(':');
          if (extras.length >= 1) {
            const holdEnd = parseFloat(extras[0]);
            if (!isNaN(holdEnd) && holdEnd > time) {
              endTime = holdEnd;
            }
          }
        }

        result.hitObjects.push({ x, y, time, type, endTime });
      }
      else if (section === 'Events') {
        if (line.startsWith('0,0,')) {
          result.background = line.substring(4).trim().replace(/^"|"$/g, '');
        }
        // Video line: "Video,0,filename" or "1,0,filename" or "Video,offset,filename"
        else if (line.startsWith('Video,') || line.startsWith('1,')) {
          const parts = line.split(',');
          if (parts.length >= 3) {
            const filename = parts.slice(2).join(',').trim().replace(/^"|"$/g, '');
            if (filename) result.video = filename;
          }
        }
      }
    }

    return result;
  }

  /** Build kiai sections from timing points by tracking effects flag state changes */
  _buildKiaiSections(timingPoints) {
    // Sort by offset and walk through, tracking kiai on/off state
    const sorted = [...timingPoints].sort((a, b) => a.offset - b.offset);
    const sections = [];
    let kiaiStart = null;

    for (const tp of sorted) {
      if (tp.kiai && kiaiStart === null) {
        // Kiai turned ON
        kiaiStart = tp.offset / 1000; // convert ms → seconds
      } else if (!tp.kiai && kiaiStart !== null) {
        // Kiai turned OFF
        sections.push({
          startTime: kiaiStart,
          endTime: tp.offset / 1000,
        });
        kiaiStart = null;
      }
    }

    // If kiai is still on at the end of timing points, close the section at the last note
    // (it will be clamped later by BeatMap)
    if (kiaiStart !== null) {
      sections.push({
        startTime: kiaiStart,
        endTime: kiaiStart + 60, // default 60s cap, will be clamped
      });
    }

    if (sections.length > 0) {
      console.log(`[OszLoader] 🎵 Kiai sections from timing points: ${sections.map(s => s.startTime.toFixed(1) + 's–' + s.endTime.toFixed(1) + 's').join(', ')}`);
    }

    return sections;
  }

  _findTimingPoint(timingPoints, time) {
    let best = null;
    for (const tp of timingPoints) {
      if (tp.msPerBeat > 0 && tp.offset <= time) {
        if (!best || tp.offset > best.offset) {
          best = tp;
        }
      }
    }
    return best;
  }

  /** Get MIME type for a video file based on extension */
  _getVideoMime(filename) {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.mp4')) return 'video/mp4';
    if (lower.endsWith('.webm')) return 'video/webm';
    if (lower.endsWith('.avi')) return 'video/x-msvideo';
    if (lower.endsWith('.wmv')) return 'video/x-ms-wmv';
    if (lower.endsWith('.flv')) return 'video/x-flv';
    // Default to mp4 — most browsers can handle it
    return 'video/mp4';
  }

  /** Create an Object URL for a video file stored in the archive */
  _createVideoObjectURL(filename, data) {
    const mime = this._getVideoMime(filename);
    const blob = new Blob([data], { type: mime });
    return URL.createObjectURL(blob);
  }
}

// Export BeatmapStore alongside OszLoader for external use
export { BeatmapStore };
