import EventBus from '../core/EventBus.js';

// osu!mania timing windows (lazer-style)
const WINDOWS = {
  perfect: 0.045,   // ±45ms → MAX
  great:   0.090,   // ±90ms
  good:    0.140,   // ±140ms
  bad:     0.200,   // ±200ms, combo breaks
};

// Lenient release timing windows for hold note tails (1.5× normal)
const RELEASE_WINDOWS = {
  perfect: 0.068,   // ±68ms
  great:   0.135,   // ±135ms
  good:    0.210,   // ±210ms
};

// Judgement score multipliers for 1M base score
const JUDGEMENT_MULT = { perfect: 1.0, great: 0.75, good: 0.5, bad: 0.25, miss: 0 };

// Accuracy weight values — osu!mania standard: perfect and great both weight 300
const ACC_WEIGHT = { perfect: 300, great: 300, good: 200, bad: 100, miss: 0 };

// HP recovery/loss per judgement (osu!mania drain system)
const HP_JUDGEMENT = { perfect: 2.0, great: 1.5, good: 0.8, bad: -0.5, miss: -1.5 };

// HP drain rate per second (base, before difficulty scaling)
const HP_DRAIN_RATE = 0.8;

// Hold note grace period: if player releases during hold but re-presses
// within this time, no penalty (like osu!mania 4K lenient system)
const HOLD_GRACE_PERIOD = 0.15; // 150ms

export default class JudgementSystem {
  constructor(beatMap) {
    this.map = beatMap;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.hitCounts = { perfect: 0, great: 0, good: 0, bad: 0, miss: 0 };
    this.sliderBreaks = 0; // slider breaks (hold note drops)
    this._activeHoldNotes = new Map(); // lane → note
    this._droppedHolds = new Map(); // lane → { note, dropTime }
    this._totalJudgements = 0; // total judgement slots (tap=1, hold=2)
    this._judgementsProcessed = 0; // how many judgements have been resolved so far
    this._missCheckIndex = 0; // pointer for O(n) miss check optimization
    this.hp = 100; // osu!mania-style HP (0–100, drain-based)
  }

  reset() {
    this.score = 0; this.combo = 0; this.maxCombo = 0;
    this.hitCounts = { perfect: 0, great: 0, good: 0, bad: 0, miss: 0 };
    this.sliderBreaks = 0;
    this._activeHoldNotes.clear();
    this._droppedHolds.clear();
    this._totalJudgements = 0;
    this._judgementsProcessed = 0;
    this._missCheckIndex = 0;
    this.hp = 100;
    this._lastDrainTime = 0;
    for (const note of this.map.notes) {
      note.hit = false;
      note.judgement = null;
      note.hitTime = 0;
      note.releaseJudgement = null;
      note.released = false;
    }
    // Count total judgement slots: tap=1, hold=2 (head + tail)
    for (const note of this.map.notes) {
      this._totalJudgements += (note.type === 'hold' && note.duration > 0) ? 2 : 1;
    }
  }

  judgeHit(lane, hitTime) {
    // ── Check for dropped hold recovery (grace period) ──
    const dropped = this._droppedHolds.get(lane);
    if (dropped) {
      const elapsed = hitTime - dropped.dropTime;
      if (elapsed <= HOLD_GRACE_PERIOD) {
        // Recovered! Re-add to active holds — no penalty
        this._droppedHolds.delete(lane);
        this._activeHoldNotes.set(lane, dropped.note);
        EventBus.emit('hold:recovered', { note: dropped.note, lane });
        return { note: dropped.note, judgement: null, recovered: true };
      } else {
        // Grace period already expired — slider break was applied in checkDroppedHolds
        this._droppedHolds.delete(lane);
      }
    }

    const result = this.map.findClosestNote(lane, hitTime, 0.25);
    if (!result) return null;

    const { note, delta } = result;
    if (note.hit) return null; // Already hit

    const absDelta = Math.abs(delta);
    let judgement;
    if (absDelta <= WINDOWS.perfect) judgement = 'perfect';
    else if (absDelta <= WINDOWS.great) judgement = 'great';
    else if (absDelta <= WINDOWS.good) judgement = 'good';
    else if (absDelta <= WINDOWS.bad) judgement = 'bad';
    else return null; // Outside all windows

    // Determine early/late: delta > 0 means player hit BEFORE note time (early)
    // delta < 0 means player hit AFTER note time (late)
    const timing = delta > 0.005 ? 'early' : delta < -0.005 ? 'late' : null;

    note.hit = true;
    note.judgement = judgement;
    note.hitTime = hitTime;
    this._applyJudgement(judgement);

    // For hold notes, register the active hold so we can judge the release
    if (note.type === 'hold' && note.duration > 0) {
      this._activeHoldNotes.set(lane, note);
    }

    EventBus.emit('note:hit', { note, judgement, delta: Math.round(delta * 1000), timing });
    return { note, judgement, delta, timing };
  }

  judgeRelease(lane, releaseTime) {
    const note = this._activeHoldNotes.get(lane);
    if (!note) return null;
    this._activeHoldNotes.delete(lane);

    const holdEnd = note.time + note.duration;

    // ── Released BEFORE hold end: start grace period (lenient) ──
    if (releaseTime < holdEnd - 0.01) {
      this._droppedHolds.set(lane, { note, dropTime: releaseTime });
      return { note, judgement: 'dropped', dropped: true };
    }

    // ── Released at/after hold end: use lenient release windows ──
    const delta = releaseTime - holdEnd;
    const absDelta = Math.abs(delta);

    let judgement;
    if (absDelta <= RELEASE_WINDOWS.perfect) judgement = 'perfect';
    else if (absDelta <= RELEASE_WINDOWS.great) judgement = 'great';
    else if (absDelta <= RELEASE_WINDOWS.good) judgement = 'good';
    else judgement = 'good'; // Lenient: even very late release = good (no combo break)

    note.releaseJudgement = judgement;
    note.released = true;
    // Use lenient apply for release — NEVER breaks combo
    this._applyReleaseJudgement(judgement);

    EventBus.emit('note:hit', { note, judgement, delta: Math.round(delta * 1000), isRelease: true });
    return { note, judgement, delta };
  }

  /**
   * Check dropped holds — call each frame.
   * If grace period expired without re-press, apply slider break.
   */
  checkDroppedHolds(currentTime) {
    for (const [lane, dropped] of this._droppedHolds) {
      if (currentTime - dropped.dropTime > HOLD_GRACE_PERIOD) {
        this._droppedHolds.delete(lane);
        this._applySliderBreak(dropped.note);
      }
    }
  }

  /** Apply a slider break (hold note dropped after grace period).
   *  Treated as "good" for scoring — lenient, no combo break. */
  _applySliderBreak(note) {
    this.sliderBreaks++;
    this._judgementsProcessed++;
    // Treat as "good" for scoring (lenient, like osu!mania 4K)
    this.hitCounts.good++;
    // HP: mild penalty (not as harsh as bad)
    this.hp = Math.max(0, Math.min(100, this.hp - 0.3));
    // DON'T break combo from slider break!
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;

    note.releaseJudgement = 'good'; // Mark as judged (lenient)
    note.released = true;

    EventBus.emit('note:sliderbreak', { note });
  }

  /** Apply a judgement: update score, combo, HP, and counts */
  _applyJudgement(judgement) {
    this.hitCounts[judgement]++;
    this._judgementsProcessed++;

    // osu!mania score: 1,000,000 / totalJudgements per slot * multiplier
    const baseScore = 1_000_000 / this._totalJudgements;
    this.score += Math.round(baseScore * JUDGEMENT_MULT[judgement]);

    // osu!mania HP drain system: restore/drain HP on each judgement
    this.hp = Math.max(0, Math.min(100, this.hp + (HP_JUDGEMENT[judgement] || 0)));

    if (judgement === 'bad' || judgement === 'miss') {
      if (this.combo > 0) EventBus.emit('combo:break', { combo: this.combo });
      this.combo = 0;
    } else {
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    }
  }

  /** Apply a release judgement — NEVER breaks combo (lenient hold system) */
  _applyReleaseJudgement(judgement) {
    this.hitCounts[judgement]++;
    this._judgementsProcessed++;

    const baseScore = 1_000_000 / this._totalJudgements;
    this.score += Math.round(baseScore * JUDGEMENT_MULT[judgement]);
    this.hp = Math.max(0, Math.min(100, this.hp + (HP_JUDGEMENT[judgement] || 0)));

    // Never break combo from hold release (osu!mania 4K lenient)
    if (judgement === 'miss') {
      if (this.combo > 0) EventBus.emit('combo:break', { combo: this.combo });
      this.combo = 0;
    } else {
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    }
  }

  /** Tick HP drain — call once per frame with delta time in seconds */
  tickHP(delta) {
    if (this._totalJudgements === 0) return;
    // Drain HP continuously (only if there are notes to judge)
    this.hp = Math.max(0, this.hp - HP_DRAIN_RATE * delta);
  }

  checkMisses(currentTime) {
    // Also check dropped holds that might have expired
    this.checkDroppedHolds(currentTime);

    // O(n) optimization: use pointer since notes are time-sorted.
    // We only need to check from _missCheckIndex forward.
    const notes = this.map.notes;

    while (this._missCheckIndex < notes.length) {
      const note = notes[this._missCheckIndex];

      // If note is far enough in the future, stop checking
      if (note.time - currentTime > WINDOWS.bad) break;

      // Check if the head was missed
      if (!note.hit) {
        if (currentTime - note.time > WINDOWS.bad) {
          note.hit = true;
          note.judgement = 'miss';
          this._applyJudgement('miss');
          EventBus.emit('note:miss', { note });

          // For hold notes, if the head was missed, the tail is also a miss
          if (note.type === 'hold' && note.duration > 0) {
            note.releaseJudgement = 'miss';
            note.released = true;
            this._applyJudgement('miss');
          }
        }
      }

      // Check if a held note's release was missed (only if still active)
      if (note.type === 'hold' && note.duration > 0 && note.hit && note.judgement !== 'miss' && !note.released) {
        // Skip if this note was dropped (slider break already applied)
        const isDropped = this._droppedHolds.has(note.lane);
        if (!isDropped) {
          const holdEnd = note.time + note.duration;
          if (currentTime - holdEnd > WINDOWS.bad) {
            note.releaseJudgement = 'miss';
            note.released = true;
            this._activeHoldNotes.delete(note.lane);
            this._applyJudgement('miss');
            EventBus.emit('note:miss', { note });
          }
        }
      }

      // Advance pointer if this note is fully resolved (hit + no pending hold release)
      const isFullyResolved = note.hit && (note.type !== 'hold' || note.duration <= 0 || note.released);
      if (isFullyResolved) {
        this._missCheckIndex++;
      } else {
        break; // Can't skip past unresolved notes
      }
    }
  }

  /**
   * osu!mania accuracy: starts at 100%, can only decrease.
   * Unprocessed (future) notes are assumed to be perfect.
   * accuracy = (processed hit value + unprocessed * 300) / (total * 300) * 100
   */
  getAccuracy() {
    const total = this._totalJudgements;
    if (total === 0) return 100;
    const processed = this._judgementsProcessed;
    const unprocessed = total - processed;
    // Treat unprocessed notes as perfect (weight 300) — accuracy starts at 100% and decreases
    const hitValue = this.hitCounts.perfect * ACC_WEIGHT.perfect
                   + this.hitCounts.great  * ACC_WEIGHT.great
                   + this.hitCounts.good   * ACC_WEIGHT.good
                   + this.hitCounts.bad    * ACC_WEIGHT.bad
                   + unprocessed * ACC_WEIGHT.perfect;
    return (hitValue / (total * ACC_WEIGHT.perfect)) * 100;
  }

  getRank() {
    const acc = this.getAccuracy();
    if (acc >= 100) return 'X';
    if (acc >= 95)  return 'SS';
    if (acc >= 90)  return 'S';
    if (acc >= 80)  return 'A';
    if (acc >= 70)  return 'B';
    return 'C';
  }

  isComplete(currentTime) {
    const lastNote = this.map.notes[this.map.notes.length - 1];
    if (!lastNote) return true;
    return currentTime > lastNote.time + lastNote.duration + 2;
  }

  getStats() {
    return {
      score: this.score,
      accuracy: this.getAccuracy(),
      maxCombo: this.maxCombo,
      combo: this.combo,
      rank: this.getRank(),
      health: this.hp,
      sliderBreaks: this.sliderBreaks,
      hitCounts: { ...this.hitCounts }
    };
  }
}

export { WINDOWS, JUDGEMENT_MULT, ACC_WEIGHT };
