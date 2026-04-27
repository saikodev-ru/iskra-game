/**
 * RecordStore — manages full play history in localStorage.
 * Each difficulty stores an array of play records (not just best score).
 * Key format: rhythm-history-{setId}-{diffVersion}
 * Each record: { score, accuracy, maxCombo, rank, died, hitCounts, totalNotes, sliderBreaks, timestamp }
 */

const MAX_RECORDS_PER_DIFF = 50; // Keep at most 50 records per difficulty

export default class RecordStore {
  /** Get all records for a difficulty (sorted by score desc, newest first) */
  static getAll(setId, diffVersion) {
    try {
      const key = RecordStore._key(setId, diffVersion);
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  }

  /** Add a new record. Returns true if it's a new best score. */
  static add(setId, diffVersion, stats) {
    try {
      const records = RecordStore.getAll(setId, diffVersion);
      const isNewBest = records.length === 0 || stats.score > (records[0]?.score || 0);

      const record = {
        score: stats.score,
        accuracy: stats.accuracy,
        maxCombo: stats.maxCombo,
        rank: stats.rank,
        died: !!stats.died,
        hitCounts: stats.hitCounts || {},
        totalNotes: stats.totalNotes || 0,
        sliderBreaks: stats.sliderBreaks || 0,
        timestamp: Date.now(),
      };

      records.push(record);

      // Sort by score desc (new best first), then by timestamp desc for ties
      records.sort((a, b) => b.score - a.score || b.timestamp - a.timestamp);

      // Trim old records
      if (records.length > MAX_RECORDS_PER_DIFF) {
        records.length = MAX_RECORDS_PER_DIFF;
      }

      const key = RecordStore._key(setId, diffVersion);
      localStorage.setItem(key, JSON.stringify(records));

      // Also update the legacy "best record" key for backward compat
      RecordStore._updateLegacyBest(setId, diffVersion, record);

      return isNewBest;
    } catch (_) { return false; }
  }

  /** Get the best record for a difficulty */
  static getBest(setId, diffVersion) {
    const all = RecordStore.getAll(setId, diffVersion);
    return all.length > 0 ? all[0] : null;
  }

  /** Delete a specific record by timestamp */
  static delete(setId, diffVersion, timestamp) {
    try {
      let records = RecordStore.getAll(setId, diffVersion);
      records = records.filter(r => r.timestamp !== timestamp);
      const key = RecordStore._key(setId, diffVersion);
      if (records.length === 0) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, JSON.stringify(records));
      }
      // Update legacy best
      if (records.length > 0) {
        RecordStore._updateLegacyBest(setId, diffVersion, records[0]);
      } else {
        const legacyKey = `rhythm-record-${setId}-${(diffVersion || '').replace(/[^a-zA-Z0-9]/g, '_')}`;
        localStorage.removeItem(legacyKey);
      }
      return true;
    } catch (_) { return false; }
  }

  /** Delete ALL records for a difficulty */
  static deleteAll(setId, diffVersion) {
    try {
      const key = RecordStore._key(setId, diffVersion);
      localStorage.removeItem(key);
      const legacyKey = `rhythm-record-${setId}-${(diffVersion || '').replace(/[^a-zA-Z0-9]/g, '_')}`;
      localStorage.removeItem(legacyKey);
      return true;
    } catch (_) { return false; }
  }

  /** Delete all records for all difficulties of a set */
  static deleteSet(setId, diffVersions) {
    for (const dv of (diffVersions || [])) {
      RecordStore.deleteAll(setId, dv);
    }
  }

  /** Format timestamp to a readable date string */
  static formatTimestamp(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return 'JUST NOW';
    if (diffMin < 60) return `${diffMin}M AGO`;
    if (diffHr < 24) return `${diffHr}H AGO`;
    if (diffDay < 7) return `${diffDay}D AGO`;

    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  /** Build the storage key */
  static _key(setId, diffVersion) {
    return `rhythm-history-${setId}-${(diffVersion || '').replace(/[^a-zA-Z0-9]/g, '_')}`;
  }

  /** Update legacy single-record key for backward compat */
  static _updateLegacyBest(setId, diffVersion, record) {
    try {
      const legacyKey = `rhythm-record-${setId}-${(diffVersion || '').replace(/[^a-zA-Z0-9]/g, '_')}`;
      localStorage.setItem(legacyKey, JSON.stringify({ score: record.score, rank: record.rank }));
    } catch (_) {}
  }
}
