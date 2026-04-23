import EventBus from '../core/EventBus.js';

const WINDOWS = {
  perfect: 0.030,   // ±30ms → 300pts
  great:   0.060,   // ±60ms → 200pts
  good:    0.100,   // ±100ms → 100pts
  bad:     0.140,   // ±140ms → 50pts, combo breaks
  // > 140ms or no input → miss → 0pts, combo breaks
};

const SCORE_VALUES = {
  perfect: 300,
  great:   200,
  good:    100,
  bad:     50,
  miss:    0
};

export default class JudgementSystem {
  constructor(beatMap) {
    this.map = beatMap;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.hitCounts = { perfect: 0, great: 0, good: 0, bad: 0, miss: 0 };
    this._activeHoldNotes = new Map(); // lane → note
    this._missCheckTimer = null;
  }

  reset() {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.hitCounts = { perfect: 0, great: 0, good: 0, bad: 0, miss: 0 };
    this._activeHoldNotes.clear();
    // Reset note hit state
    for (const note of this.map.notes) {
      note.hit = false;
      note.judgement = null;
    }
  }

  // Called on input:hit
  judgeHit(lane, hitTime) {
    const result = this.map.findClosestNote(lane, hitTime, 0.15);
    if (!result) return; // No note in range

    const { note, delta } = result;
    const absDelta = Math.abs(delta);
    
    let judgement;
    if (absDelta <= WINDOWS.perfect) {
      judgement = 'perfect';
    } else if (absDelta <= WINDOWS.great) {
      judgement = 'great';
    } else if (absDelta <= WINDOWS.good) {
      judgement = 'good';
    } else if (absDelta <= WINDOWS.bad) {
      judgement = 'bad';
    } else {
      return; // Outside all windows, ignore
    }
    
    note.hit = true;
    note.judgement = judgement;
    
    // Score
    this.score += SCORE_VALUES[judgement];
    
    // Combo
    if (judgement === 'bad') {
      // Combo breaks on bad
      if (this.combo > 0) {
        EventBus.emit('combo:break', { combo: this.combo });
      }
      this.combo = 0;
    } else {
      this.combo++;
      if (this.combo > this.maxCombo) {
        this.maxCombo = this.combo;
      }
    }
    
    this.hitCounts[judgement]++;
    
    // Check for hold note
    if (note.type === 'hold') {
      this._activeHoldNotes.set(lane, note);
    }
    
    EventBus.emit('note:hit', {
      note,
      judgement,
      delta: Math.round(delta * 1000) // ms
    });
  }

  // Called on input:release (for hold notes)
  judgeRelease(lane, releaseTime) {
    const note = this._activeHoldNotes.get(lane);
    if (!note) return;
    
    this._activeHoldNotes.delete(lane);
    
    const holdEnd = note.time + note.duration;
    const delta = Math.abs(releaseTime - holdEnd);
    
    let judgement;
    if (delta <= WINDOWS.perfect) {
      judgement = 'perfect';
    } else if (delta <= WINDOWS.great) {
      judgement = 'great';
    } else if (delta <= WINDOWS.good) {
      judgement = 'good';
    } else {
      judgement = 'bad';
    }
    
    // Additional score for hold note release
    this.score += SCORE_VALUES[judgement];
    
    EventBus.emit('note:hit', {
      note,
      judgement,
      delta: Math.round(delta * 1000)
    });
  }

  // Check for missed notes (called each frame)
  checkMisses(currentTime) {
    for (const note of this.map.notes) {
      if (note.hit || note.judgement === 'miss') continue;
      
      // If the note time has passed by more than the bad window, it's a miss
      if (currentTime - note.time > WINDOWS.bad) {
        note.hit = true;
        note.judgement = 'miss';
        this.hitCounts.miss++;
        
        if (this.combo > 0) {
          EventBus.emit('combo:break', { combo: this.combo });
        }
        this.combo = 0;
        
        EventBus.emit('note:miss', { note });
      }
    }
  }

  // Calculate accuracy percentage
  getAccuracy() {
    const total = this.map.totalNotes;
    if (total === 0) return 100;
    
    const hitValue = this.hitCounts.perfect * 300 +
                     this.hitCounts.great * 200 +
                     this.hitCounts.good * 100 +
                     this.hitCounts.bad * 50;
    
    return (hitValue / (total * 300)) * 100;
  }

  // Get letter rank
  getRank() {
    const acc = this.getAccuracy();
    if (acc >= 100) return 'SS';
    if (acc >= 95) return 'S';
    if (acc >= 90) return 'A';
    if (acc >= 80) return 'B';
    if (acc >= 70) return 'C';
    return 'D';
  }

  // Check if game is over (all notes processed)
  isComplete(currentTime) {
    const lastNote = this.map.notes[this.map.notes.length - 1];
    if (!lastNote) return true;
    return currentTime > lastNote.time + lastNote.duration + 2; // 2s after last note
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
