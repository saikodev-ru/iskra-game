import DifficultyAnalyzer from './DifficultyAnalyzer.js';

// ── IndexedDB-backed storage for beatmap sets ──────────────────────────────

class BeatmapStore {
  static DB_NAME = 'rhythm-os-db';
  static STORE_NAME = 'beatmaps';
  static DB_VERSION = 1;

  /** Open (or create) the database */
  static async open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(BeatmapStore.DB_NAME, BeatmapStore.DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(BeatmapStore.STORE_NAME)) {
          db.createObjectStore(BeatmapStore.STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Serialize an AudioBuffer to a plain object storable in IndexedDB.
   * Extracts raw PCM via copyFromChannel, stores metadata alongside.
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
   * AudioBuffers are serialized to raw PCM ArrayBuffers.
   */
  static async save(beatmapSet) {
    const db = await BeatmapStore.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BeatmapStore.STORE_NAME, 'readwrite');
      const store = tx.objectStore(BeatmapStore.STORE_NAME);

      // Deep-clone so we don't mutate the original object
      const serializable = JSON.parse(JSON.stringify(beatmapSet, (key, value) => {
        // Skip non-serializable items; we'll handle them explicitly
        if (value instanceof AudioBuffer) return '__AUDIO_BUFFER__';
        return value;
      }));

      // Replace the __AUDIO_BUFFER__ placeholder with actual serialized data
      if (beatmapSet.audioBuffer instanceof AudioBuffer) {
        serializable.audioBuffer = BeatmapStore._serializeAudioBuffer(beatmapSet.audioBuffer);
      }

      store.put(serializable);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Load all stored beatmap sets, reconstructing AudioBuffers.
   * @param {AudioContext} [audioCtx] - Optional AudioContext for AudioBuffer reconstruction.
   *   If not provided, a temporary one will be created.
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

    // Reconstruct AudioBuffers
    let ctx = audioCtx;
    let shouldClose = false;
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      shouldClose = true;
    }

    const results = raw.map((entry) => {
      if (entry.audioBuffer && entry.audioBuffer.sampleRate && entry.audioBuffer.channelData) {
        try {
          entry.audioBuffer = BeatmapStore._deserializeAudioBuffer(ctx, entry.audioBuffer);
        } catch (err) {
          console.warn(`Failed to reconstruct AudioBuffer for ${entry.id}:`, err);
          entry.audioBuffer = null;
        }
      }
      return entry;
    });

    if (shouldClose) {
      try { await ctx.close(); } catch (_) { /* ignore */ }
    }

    return results;
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

      for (const [filename, data] of Object.entries(unzipped)) {
        const lower = filename.toLowerCase();
        if (lower.endsWith('.osu')) {
          osuFiles.push({ filename, content: new TextDecoder().decode(data) });
        } else if (lower.endsWith('.mp3') || lower.endsWith('.ogg') || lower.endsWith('.wav')) {
          audioFiles[lower] = data;
        } else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png')) {
          imageFiles[lower] = data;
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

      // Decode audio
      let audioBuffer = null;
      const audioFileName = firstParsed.general.AudioFilename?.toLowerCase();
      if (audioFileName && audioFiles[audioFileName]) {
        const audioData = audioFiles[audioFileName];
        audioBuffer = await this._decodeAudio(audioData);
      } else {
        // Fallback: use the first audio file found
        const firstAudio = Object.values(audioFiles)[0];
        if (firstAudio) {
          audioBuffer = await this._decodeAudio(firstAudio);
        }
      }

      // Create background Object URL
      let backgroundUrl = null;
      const bgFileName = firstParsed.background?.toLowerCase();
      if (bgFileName && imageFiles[bgFileName]) {
        backgroundUrl = this._createImageObjectURL(bgFileName, imageFiles[bgFileName]);
      } else {
        const firstImage = Object.entries(imageFiles)[0];
        if (firstImage) {
          backgroundUrl = this._createImageObjectURL(firstImage[0], firstImage[1]);
        }
      }

      // ── Build difficulties array ───────────────────────────────────────
      const difficulties = [];

      for (const parsed of parsedMaps) {
        const diff = this._buildDifficulty(parsed);
        if (diff) {
          difficulties.push(diff);
        }
      }

      // Sort by star rating ascending
      difficulties.sort((a, b) => a.difficulty.stars - b.difficulty.stars);

      // ── Assemble BeatmapSet ────────────────────────────────────────────
      const beatmapSet = {
        id: `osz-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: firstParsed.metadata.Title || 'Unknown',
        artist: firstParsed.metadata.Artist || 'Unknown',
        creator: firstParsed.metadata.Creator || '',
        backgroundUrl,
        audioBuffer,
        difficulties,
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
   * Load all beatmap sets from IndexedDB, reconstructing AudioBuffers.
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

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Decode a Uint8Array of audio bytes into an AudioBuffer.
   */
  async _decodeAudio(uint8Array) {
    // Slice to get a proper ArrayBuffer (not a view)
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
  _buildDifficulty(parsed) {
    let laneCount;
    if (parsed.mode === 3) {
      // Native mania: CircleSize is the key count
      laneCount = parsed.difficulty.CircleSize || 4;
    } else {
      // Converted standard map: default to 4 lanes
      laneCount = 4;
    }

    const notes = this._convertHitObjects(parsed.hitObjects, laneCount, parsed.mode, parsed.timingPoints, parsed.difficulty);

    if (notes.length === 0) {
      return null;
    }

    // BPM changes
    const bpmChanges = parsed.timingPoints
      .filter(tp => tp.msPerBeat > 0)
      .map(tp => ({
        time: tp.offset / 1000,
        bpm: 60000 / tp.msPerBeat,
      }));

    const primaryBpm = bpmChanges.length > 0 ? bpmChanges[0].bpm : 120;

    // Duration: from first to last note, plus 2 s padding
    const sortedNotes = [...notes].sort((a, b) => a.time - b.time);
    const lastNote = sortedNotes[sortedNotes.length - 1];
    const firstNote = sortedNotes[0];
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
      metadata: {
        bpm: Math.round(primaryBpm),
        duration: Math.round(mapDuration),
        previewTime: (parseFloat(parsed.general.PreviewTime) || 0) / 1000,
      },
      difficulty: diffResult,
    };
  }

  /**
   * Convert raw hit objects from .osu into mania note format.
   *
   * Standard (mode 0):
   *   - Circles → tap notes, X position mapped to lane
   *   - Sliders → hold notes, duration = endTime − startTime
   *   - Spinners → skipped
   *
   * Mania (mode 3):
   *   - X position maps to lane directly
   *   - Sliders → hold notes
   *   - Spinners → skipped
   */
  _convertHitObjects(hitObjects, laneCount, mode, timingPoints, difficulty) {
    const notes = [];
    let noteId = 0;

    for (const ho of hitObjects) {
      // Type bitflags: 1 = circle, 2 = slider, 8 = spinner
      const isCircle = (ho.type & 1) !== 0;
      const isSlider = (ho.type & 2) !== 0;
      const isSpinner = (ho.type & 8) !== 0;

      // Skip spinners — they don't map to mania
      if (isSpinner) continue;

      // Lane mapping from X position (0-512)
      let lane;
      if (mode === 3) {
        // Native mania: X position already encodes column
        lane = Math.min(Math.floor((ho.x * laneCount) / 512), laneCount - 1);
      } else {
        // Converted standard: same X → lane mapping
        lane = Math.min(Math.floor((ho.x * laneCount) / 512), laneCount - 1);
      }
      lane = Math.max(0, lane);

      const time = ho.time / 1000; // ms → seconds
      let duration = 0;
      let noteType = 'tap';

      if (isSlider && ho.endTime > ho.time) {
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

    // Sort by time then lane
    notes.sort((a, b) => a.time - b.time || a.lane - b.lane);

    // Reassign IDs after sorting
    for (let i = 0; i < notes.length; i++) {
      notes[i].id = i;
    }

    return notes;
  }

  // ── .osu File Parser ─────────────────────────────────────────────────────

  /**
   * Parse a single .osu file content into a structured object.
   * Now includes Mode detection from the [General] section.
   */
  _parseOsu(content) {
    const result = {
      general: {},
      metadata: {},
      difficulty: {},
      timingPoints: [],
      hitObjects: [],
      background: null,
      mode: 0, // default: standard osu!
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

      // ── General ─────────────────────────────────────────────────────
      if (section === 'General') {
        const [key, ...rest] = line.split(':');
        const value = rest.join(':').trim();
        const keyTrimmed = key.trim();

        result.general[keyTrimmed] = value;

        if (keyTrimmed === 'Mode') {
          result.mode = parseInt(value, 10);
        }
      }

      // ── Metadata ────────────────────────────────────────────────────
      else if (section === 'Metadata') {
        const [key, ...rest] = line.split(':');
        result.metadata[key.trim()] = rest.join(':').trim();
      }

      // ── Difficulty ──────────────────────────────────────────────────
      else if (section === 'Difficulty') {
        const [key, ...rest] = line.split(':');
        result.difficulty[key.trim()] = parseFloat(rest.join(':').trim());
      }

      // ── TimingPoints ────────────────────────────────────────────────
      else if (section === 'TimingPoints') {
        const parts = line.split(',');
        if (parts.length >= 2) {
          const offset = parseFloat(parts[0]);
          const msPerBeat = parseFloat(parts[1]);
          const meter = parts.length > 2 ? parseInt(parts[2], 10) : 4;
          const inherited = msPerBeat < 0;
          result.timingPoints.push({ offset, msPerBeat, meter, inherited });
        }
      }

      // ── HitObjects ──────────────────────────────────────────────────
      else if (section === 'HitObjects') {
        const parts = line.split(',');
        if (parts.length < 4) continue;

        const x = parseFloat(parts[0]);
        const y = parseFloat(parts[1]);
        const time = parseFloat(parts[2]);
        const type = parseInt(parts[3], 10);
        let endTime = 0;

        // Slider: compute end time from timing + length
        if ((type & 2) && parts.length >= 8) {
          const tp = this._findTimingPoint(result.timingPoints, time);
          const sv = tp ? (tp.msPerBeat / 1000) : 1;
          const length = parseFloat(parts[7]) || 0;
          const sliderMult = result.difficulty.SliderMultiplier || 1.4;
          const repeats = parseInt(parts[6], 10) || 1;
          endTime = time + (length * sv * repeats) / (sliderMult * 100);
        }
        // Spinner: endTime from parts[5]
        else if ((type & 8) && parts.length >= 6) {
          endTime = parseFloat(parts[5]);
        }
        // Mania hold note: endTime from parts[5] (colon-delimited extras)
        // Some mania maps encode endTime in the extras field (parts[5])
        if ((type & 128) && parts.length >= 6) {
          // type bit 128 = mania hold
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

      // ── Events ──────────────────────────────────────────────────────
      else if (section === 'Events') {
        if (line.startsWith('0,0,')) {
          result.background = line.substring(4).trim().replace(/^"|"$/g, '');
        }
      }
    }

    return result;
  }

  /**
   * Find the last uninherited timing point at or before `time`.
   */
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
}

// Export BeatmapStore alongside OszLoader for external use
export { BeatmapStore };
