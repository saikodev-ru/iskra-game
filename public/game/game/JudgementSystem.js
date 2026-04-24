import EventBus from '../core/EventBus.js';

// osu!mania timing windows
const WINDOWS = {
  perfect: 0.045,   // ±45ms → MAX/300
  great:   0.090,   // ±90ms → 200
  good:    0.140,   // ±140ms → 100
  bad:     0.200,   // ±200ms → 50, combo breaks
};

// osu!mania score values per judgement
const SCORE_VALUES = { perfect: 300, great: 200, good: 100, bad: 50, miss: 0 };

export default class JudgementSystem {
  constructor(beatMap) {
    this.map = beatMap;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.hitCounts = { perfect: 0, great: 0, good: 0, bad: 0, miss: 0 };
    this._activeHoldNotes = new Map(); // lane → note
    this._totalJudgements = 0; // total judgement slots (tap=1, hold=2)
  }

  reset() {
    this.score = 0; this.combo = 0; this.maxCombo = 0;
    this.hitCounts = { perfect: 0, great: 0, good: 0, bad: 0, miss: 0 };
    this._activeHoldNotes.clear();
    this._totalJudgements = 0;
    for (const note of this.map.notes) {
      note.hit = false;
      note.judgement = null;
      note.hitTime = 0;
      note.releaseJudgement = null; // for hold note tail
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
    
    note.hit = true;
    note.judgement = judgement;
    note.hitTime = hitTime;
    this.score += SCORE_VALUES[judgement];
    
    if (judgement === 'bad') {
      if (this.combo > 0) EventBus.emit('combo:break', { combo: this.combo });
      this.combo = 0;
    } else {
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    }
    this.hitCounts[judgement]++;
    
    // For hold notes, register the active hold so we can judge the release
    if (note.type === 'hold' && note.duration > 0) {
      this._activeHoldNotes.set(lane, note);
    }
    
    EventBus.emit('note:hit', { note, judgement, delta: Math.round(delta * 1000) });
    return { note, judgement, delta };
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
    this.score += SCORE_VALUES[judgement];

    if (judgement === 'bad') {
      if (this.combo > 0) EventBus.emit('combo:break', { combo: this.combo });
      this.combo = 0;
    } else {
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    }
    this.hitCounts[judgement]++;

    EventBus.emit('note:hit', { note, judgement, delta: Math.round(delta * 1000), isRelease: true });
    return { note, judgement, delta };
  }

  checkMisses(currentTime) {
    for (const note of this.map.notes) {
      if (note.hit && note.judgement === 'miss') continue;

      // Check if the head was missed (note not hit and past the window)
      if (!note.hit) {
        if (currentTime - note.time > WINDOWS.bad) {
          note.hit = true;
          note.judgement = 'miss';
          this.hitCounts.miss++;
          if (this.combo > 0) EventBus.emit('combo:break', { combo: this.combo });
          this.combo = 0;
          EventBus.emit('note:miss', { note });

          // For hold notes, if the head was missed, the tail is also a miss
          if (note.type === 'hold' && note.duration > 0) {
            note.releaseJudgement = 'miss';
            note.released = true;
            this.hitCounts.miss++;
          }
        }
      }

      // Check if a held note's release was missed (key held past end + window)
      if (note.type === 'hold' && note.duration > 0 && note.hit && note.judgement !== 'miss' && !note.released) {
        const holdEnd = note.time + note.duration;
        if (currentTime - holdEnd > WINDOWS.bad) {
          // Player held too long without releasing — judge as bad
          note.releaseJudgement = 'bad';
          note.released = true;
          this.score += SCORE_VALUES.bad;
          this.hitCounts.bad++;
          if (this.combo > 0) EventBus.emit('combo:break', { combo: this.combo });
          this.combo = 0;
          this._activeHoldNotes.delete(note.lane);
        }
      }
    }
  }

  /**
   * osu!mania accuracy calculation:
   * accuracy = (300*perfect + 200*great + 100*good + 50*bad) / (300 * totalJudgements)
   * where totalJudgements counts hold note heads AND tails as separate judgements.
   */
  getAccuracy() {
    const total = this._totalJudgements;
    if (total === 0) return 100;
    const hitValue = this.hitCounts.perfect * 300
                   + this.hitCounts.great  * 200
                   + this.hitCounts.good   * 100
                   + this.hitCounts.bad    * 50;
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

export { WINDOWS, SCORE_VALUES };
