import EventBus from '../core/EventBus.js';

// osu!mania timing windows (lazer-style)
const WINDOWS = {
  perfect: 0.045,   // ±45ms → MAX
  great:   0.090,   // ±90ms
  good:    0.140,   // ±140ms
  bad:     0.200,   // ±200ms, combo breaks
};

// Release timing windows for hold note tails (~1.2× normal, tightened from 1.5×)
const RELEASE_WINDOWS = {
  perfect: 0.055,   // ±55ms
  great:   0.110,   // ±110ms
  good:    0.170,   // ±170ms
};

// Accuracy weight values — Score V2 style: PERFECT=305, GREAT=300, GOOD=200, BAD=50, MISS=0
// Denominator is always totalNotes × 305. This means GREAT ≠ PERFECT (98.36% vs 100%)
const ACC_WEIGHT = { perfect: 305, great: 300, good: 200, bad: 50, miss: 0 };

// HP recovery/loss per judgement (osu!mania drain system)
const HP_JUDGEMENT = { perfect: 2.0, great: 1.5, good: 0.8, bad: -0.5, miss: -1.5 };

// HP drain rate per second (base, before difficulty scaling)
const HP_DRAIN_RATE = 0.8;

// Hold note grace period: if player releases during hold but re-presses
// within this time, no penalty. Tightened from 150ms to 80ms.
const HOLD_GRACE_PERIOD = 0.08; // 80ms

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
    this._missCheckIndex = 0; // pointer for O(n) miss check optimization
    this.hp = 100; // osu!mania-style HP (0–100, drain-based)
    this._totalNotes = 0; // total note objects (per-note, not per-judgement-slot)
    this._baseScore = 0; // 1,000,000 / totalNotes — score per note at PERFECT
  }

  reset() {
    this.score = 0; this.combo = 0; this.maxCombo = 0;
    this.hitCounts = { perfect: 0, great: 0, good: 0, bad: 0, miss: 0 };
    this.sliderBreaks = 0;
    this._activeHoldNotes.clear();
    this._droppedHolds.clear();
    this._missCheckIndex = 0;
    this.hp = 100;
    this._lastDrainTime = 0;

    // Reset all note flags
    for (const note of this.map.notes) {
      note.hit = false;
      note.judgement = null;
      note.hitTime = 0;
      note.releaseJudgement = null;
      note.released = false;
      note._sliderBreak = false;
    }

    // Total notes = number of note objects (per-note scoring, not per-judgement-slot)
    this._totalNotes = this.map.notes.length;
    this._baseScore = this._totalNotes > 0 ? 1_000_000 / this._totalNotes : 0;
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
    // Release only affects HP — does NOT affect score, accuracy, or combo
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
   *  Degrades note to BAD for accuracy (50/305), reduces score, moderate HP penalty.
   *  Does NOT break combo. */
  _applySliderBreak(note) {
    this.sliderBreaks++;
    note._sliderBreak = true;

    // Degrade score: remove head contribution and apply BAD weight
    const headWeight = ACC_WEIGHT[note.judgement] || 0;
    const badWeight = ACC_WEIGHT.bad; // 50
    const scoreDiff = Math.round(this._baseScore * ((badWeight - headWeight) / 305));
    this.score = Math.max(0, this.score + scoreDiff); // scoreDiff is negative

    // HP: moderate penalty (harsher than before)
    this.hp = Math.max(0, Math.min(100, this.hp - 0.8));

    // DON'T break combo from slider break!

    note.releaseJudgement = 'bad';
    note.released = true;

    EventBus.emit('note:sliderbreak', { note });
  }

  /** Apply a head judgement: update score, combo, HP, and counts.
   *  This is the ONLY place that affects accuracy (per-note basis). */
  _applyJudgement(judgement) {
    this.hitCounts[judgement]++;

    // Score: per-note, aligned with accuracy weight
    // PERFECT = 305/305 = 1.0, GREAT = 300/305 ≈ 0.984, etc.
    const weight = ACC_WEIGHT[judgement] || 0;
    this.score += Math.round(this._baseScore * (weight / 305));

    // osu!mania HP drain system: restore/drain HP on each judgement
    this.hp = Math.max(0, Math.min(100, this.hp + (HP_JUDGEMENT[judgement] || 0)));

    // Combo: only head hits affect combo
    if (judgement === 'bad' || judgement === 'miss') {
      if (this.combo > 0) EventBus.emit('combo:break', { combo: this.combo });
      this.combo = 0;
    } else {
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    }
  }

  /** Apply a release judgement — only affects HP.
   *  Does NOT affect score, accuracy, or combo (per-note system). */
  _applyReleaseJudgement(judgement) {
    this.hp = Math.max(0, Math.min(100, this.hp + (HP_JUDGEMENT[judgement] || 0)));
  }

  /** Tick HP drain — call once per frame with delta time in seconds */
  tickHP(delta) {
    if (this._totalNotes === 0) return;
    // Drain HP continuously (only if there are notes to judge)
    this.hp = Math.max(0, this.hp - HP_DRAIN_RATE * delta);
  }

  checkMisses(currentTime) {
    // Also check dropped holds that might have expired
    this.checkDroppedHolds(currentTime);

    // O(n) optimization: use pointer since notes are time-sorted.
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

          // For hold notes, mark tail as resolved (but DON'T double-count as miss)
          if (note.type === 'hold' && note.duration > 0) {
            note.releaseJudgement = 'miss';
            note.released = true;
            // Per-note system: only one miss per note (head)
          }
        }
      }

      // Check if a held note's release was missed (only if still active and not dropped)
      if (note.type === 'hold' && note.duration > 0 && note.hit && note.judgement !== 'miss' && !note.released) {
        const isDropped = this._droppedHolds.has(note.lane);
        if (!isDropped) {
          const holdEnd = note.time + note.duration;
          if (currentTime - holdEnd > WINDOWS.bad) {
            // Held through but didn't release in time — lenient: auto-release as GOOD
            note.releaseJudgement = 'good';
            note.released = true;
            this._activeHoldNotes.delete(note.lane);
            this._applyReleaseJudgement('good'); // Only HP recovery
          }
        }
      }

      // Advance pointer if this note is fully resolved
      const isFullyResolved = note.hit && (note.type !== 'hold' || note.duration <= 0 || note.released);
      if (isFullyResolved) {
        this._missCheckIndex++;
      } else {
        break; // Can't skip past unresolved notes
      }
    }
  }

  /**
   * Score V2 accuracy: per-note, not per-judgement-slot.
   * PERFECT=305, GREAT=300, GOOD=200, BAD=50, MISS=0
   * Slider breaks degrade the note to BAD (50).
   * Unprocessed (future) notes are assumed to be PERFECT (305).
   * accuracy = (sum of per-note weights) / (totalNotes × 305) × 100
   *
   * Key insight: GREAT (300) ≠ PERFECT (305), so having any GREAT
   * makes SS impossible at exactly 100%.
   */
  getAccuracy() {
    const notes = this.map.notes;
    const total = notes.length;
    if (total === 0) return 100;

    let totalWeight = 0;
    for (const note of notes) {
      if (!note.hit) {
        // Not yet processed — assume perfect (305)
        totalWeight += 305;
      } else if (note.judgement === 'miss') {
        // Missed head = 0 accuracy
        totalWeight += 0;
      } else if (note._sliderBreak) {
        // Slider break: degrade to BAD (50) regardless of head judgement
        totalWeight += 50;
      } else {
        // Use head judgement weight (PERFECT=305, GREAT=300, GOOD=200, BAD=50)
        totalWeight += ACC_WEIGHT[note.judgement] || 0;
      }
    }

    return (totalWeight / (total * 305)) * 100;
  }

  getRank() {
    const acc = this.getAccuracy();
    if (acc >= 100) return 'X';   // Only all PERFECT (305 each)
    if (acc >= 95)  return 'SS';  // Almost perfect
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
      hitCounts: { ...this.hitCounts },
      totalNotes: this._totalNotes,
    };
  }
}

export { WINDOWS, ACC_WEIGHT };
