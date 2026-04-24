import EventBus from '../core/EventBus.js';

// osu!mania timing windows (lazer-style)
const WINDOWS = {
  perfect: 0.045,   // ±45ms → MAX
  great:   0.090,   // ±90ms
  good:    0.140,   // ±140ms
  bad:     0.200,   // ±200ms, combo breaks
};

// Judgement score multipliers for 1M base score
const JUDGEMENT_MULT = { perfect: 1.0, great: 0.75, good: 0.5, bad: 0.25, miss: 0 };

// Accuracy weight values
const ACC_WEIGHT = { perfect: 300, great: 200, good: 100, bad: 50, miss: 0 };

export default class JudgementSystem {
  constructor(beatMap) {
    this.map = beatMap;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.hitCounts = { perfect: 0, great: 0, good: 0, bad: 0, miss: 0 };
    this._activeHoldNotes = new Map(); // lane → note
    this._totalJudgements = 0; // total judgement slots (tap=1, hold=2)
    this._judgementsProcessed = 0; // how many judgements have been resolved so far
    this._missCheckIndex = 0; // pointer for O(n) miss check optimization
  }

  reset() {
    this.score = 0; this.combo = 0; this.maxCombo = 0;
    this.hitCounts = { perfect: 0, great: 0, good: 0, bad: 0, miss: 0 };
    this._activeHoldNotes.clear();
    this._totalJudgements = 0;
    this._judgementsProcessed = 0;
    this._missCheckIndex = 0;
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
    const delta = releaseTime - holdEnd;
    const absDelta = Math.abs(delta);

    let judgement;
    if (absDelta <= WINDOWS.perfect) judgement = 'perfect';
    else if (absDelta <= WINDOWS.great) judgement = 'great';
    else if (absDelta <= WINDOWS.good) judgement = 'good';
    else judgement = 'bad';

    note.releaseJudgement = judgement;
    note.released = true;
    this._applyJudgement(judgement);

    EventBus.emit('note:hit', { note, judgement, delta: Math.round(delta * 1000), isRelease: true });
    return { note, judgement, delta };
  }

  /** Apply a judgement: update score, combo, and counts */
  _applyJudgement(judgement) {
    this.hitCounts[judgement]++;
    this._judgementsProcessed++;

    // osu!mania score: 1,000,000 / totalJudgements per slot * multiplier
    const baseScore = 1_000_000 / this._totalJudgements;
    this.score += Math.round(baseScore * JUDGEMENT_MULT[judgement]);

    if (judgement === 'bad' || judgement === 'miss') {
      if (this.combo > 0) EventBus.emit('combo:break', { combo: this.combo });
      this.combo = 0;
    } else {
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    }
  }

  checkMisses(currentTime) {
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

      // Check if a held note's release was missed
      if (note.type === 'hold' && note.duration > 0 && note.hit && note.judgement !== 'miss' && !note.released) {
        const holdEnd = note.time + note.duration;
        if (currentTime - holdEnd > WINDOWS.bad) {
          note.releaseJudgement = 'miss';
          note.released = true;
          this._activeHoldNotes.delete(note.lane);
          this._applyJudgement('miss');
          EventBus.emit('note:miss', { note });
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
   * osu!mania accuracy: starts at 100%, can only decrease
   * accuracy = (sum of weight values) / (totalJudgements * 300) * 100
   */
  getAccuracy() {
    const total = this._totalJudgements;
    if (total === 0) return 100;
    const hitValue = this.hitCounts.perfect * ACC_WEIGHT.perfect
                   + this.hitCounts.great  * ACC_WEIGHT.great
                   + this.hitCounts.good   * ACC_WEIGHT.good
                   + this.hitCounts.bad    * ACC_WEIGHT.bad;
    return (hitValue / (total * 300)) * 100;
  }

  getRank() {
    const acc = this.getAccuracy();
    if (acc >= 100) return 'SS';
    if (acc >= 95)  return 'S';
    if (acc >= 90)  return 'A';
    if (acc >= 80)  return 'B';
    if (acc >= 70)  return 'C';
    return 'D';
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
      hitCounts: { ...this.hitCounts }
    };
  }
}

export { WINDOWS, JUDGEMENT_MULT, ACC_WEIGHT };
