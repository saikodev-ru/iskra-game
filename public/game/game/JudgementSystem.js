import EventBus from '../core/EventBus.js';

// osu!mania timing windows (lazer-style)
const WINDOWS = {
  perfect: 0.045,   // ±45ms → MAX
  great:   0.090,   // ±90ms
  good:    0.140,   // ±140ms
  bad:     0.200,   // ±200ms, combo breaks
};

// Release Window Leniency — ScoreV2: release windows are 1.5× normal hit windows
// This makes it more forgiving to release during complex patterns (ladders, chords)
const RELEASE_WINDOW_LENIENCE = 1.5;
const RELEASE_WINDOWS = {
  perfect: WINDOWS.perfect * RELEASE_WINDOW_LENIENCE,  // ±67.5ms
  great:   WINDOWS.great   * RELEASE_WINDOW_LENIENCE,  // ±135ms
  good:    WINDOWS.good    * RELEASE_WINDOW_LENIENCE,  // ±210ms
  bad:     WINDOWS.bad     * RELEASE_WINDOW_LENIENCE,  // ±300ms
};

// Accuracy weight values — Score V2 style: MAX=305, GREAT=300, GOOD=200, BAD=50, MISS=0
// Denominator is always totalScoringSlots × 305. This means GREAT ≠ MAX (98.36% vs 100%)
const ACC_WEIGHT = { perfect: 305, great: 300, good: 200, bad: 50, miss: 0 };

// HP recovery/loss per judgement (osu!mania drain system)
const HP_JUDGEMENT = { perfect: 2.0, great: 1.2, good: 0.4, bad: -1.2, miss: -2.5 };

// HP drain rate per second (base, before difficulty scaling)
const HP_DRAIN_RATE = 1.0;

// Hold note grace period: if player releases during hold but re-presses
// within this time, no penalty. Increased to 150ms to match release window lenience.
const HOLD_GRACE_PERIOD = 0.150; // 150ms

// LN tick rate: 1 tick per beat during hold (osu!mania standard)
// Minimum hold duration to generate ticks (at least 1 beat long)
const TICK_MIN_HOLD_FOR_TICKS = 0.1; // seconds
// Safety caps to prevent OOM
const MAX_TICKS_PER_NOTE = 30;       // max ticks per single hold note
const MIN_BEAT_INTERVAL = 0.1;       // min beat interval for tick gen (600 BPM cap)
const MAX_TOTAL_TICKS = 2000;        // global cap across all hold notes

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
    this._totalNotes = 0; // total note objects
    this._baseScore = 0; // 1,000,000 / totalScoringSlots — score per slot at MAX
    this._died = false; // true when HP reached 0 (forces D rank)

    // ── Score V2 LN tick system ──
    this.tickHits = 0;       // ticks successfully held through
    this.tickMisses = 0;     // ticks missed (not holding when tick passed)
    this._totalTickCount = 0; // total ticks across all hold notes
    this._totalScoringSlots = 0; // notes + ticks + release slots for Score V2
  }

  reset() {
    this.score = 0; this.combo = 0; this.maxCombo = 0;
    this.hitCounts = { perfect: 0, great: 0, good: 0, bad: 0, miss: 0 };
    this.sliderBreaks = 0;
    this.tickHits = 0;
    this.tickMisses = 0;
    this._activeHoldNotes.clear();
    this._droppedHolds.clear();
    this._missCheckIndex = 0;
    this.hp = 100;
    this._lastDrainTime = 0;
    this._died = false;

    // Reset all note flags and compute tick positions
    this._totalTickCount = 0;
    for (const note of this.map.notes) {
      note.hit = false;
      note.judgement = null;
      note.hitTime = 0;
      note.releaseJudgement = null;
      note.released = false;
      note._sliderBreak = false;

      // ── Compute LN tick positions ──
      // Ticks occur every beat between head and tail.
      // First tick is 1 beat after the head, last tick is 1 beat before the tail.
      if (note.type === 'hold' && note.duration > TICK_MIN_HOLD_FOR_TICKS
          && this._totalTickCount < MAX_TOTAL_TICKS) {
        const bpm = this.map.getBpmAt(note.time);
        // Safety: clamp beat interval to prevent excessive tick generation
        const beatInterval = Math.max(MIN_BEAT_INTERVAL, 60 / Math.max(1, bpm));
        const holdEnd = note.time + note.duration;
        const ticks = [];

        // Generate ticks at each beat during the hold
        // Start 1 beat after head, end before tail
        let tickTime = note.time + beatInterval;
        while (tickTime < holdEnd - beatInterval * 0.5 && ticks.length < MAX_TICKS_PER_NOTE) {
          ticks.push(tickTime);
          tickTime += beatInterval;
        }

        note.ticks = ticks;
        note._tickHit = new Array(ticks.length).fill(false);  // which ticks were held
        note._tickMissed = new Array(ticks.length).fill(false); // which ticks were missed
        note._nextTickIndex = 0; // pointer for tick processing optimization
        this._totalTickCount += ticks.length;
      } else {
        note.ticks = [];
        note._tickHit = [];
        note._tickMissed = [];
        note._nextTickIndex = 0;
      }
    }

    // Score V2: total scoring slots = note heads + ticks + release slots
    // Each hold note has: 1 head + N ticks + 1 release
    // Each tap note has: 1 head
    this._totalNotes = this.map.notes.length;
    const holdNoteCount = this.map.notes.filter(n => n.type === 'hold' && n.duration > 0).length;
    this._totalScoringSlots = this._totalNotes + this._totalTickCount + holdNoteCount;
    this._baseScore = this._totalScoringSlots > 0 ? 1_000_000 / this._totalScoringSlots : 0;
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
    // Grace period uses the release bad window to give more time for recovery
    const releaseWindow = RELEASE_WINDOWS.bad; // ±300ms with 1.5x lenience
    if (releaseTime < holdEnd - 0.01 && releaseTime >= holdEnd - releaseWindow) {
      // Within lenient window of hold end — score the release with lenient windows
      const delta = releaseTime - holdEnd;
      const absDelta = Math.abs(delta);
      let judgement;
      if (absDelta <= RELEASE_WINDOWS.perfect) judgement = 'perfect';
      else if (absDelta <= RELEASE_WINDOWS.great) judgement = 'great';
      else judgement = 'good'; // lenient: anything in the window = good

      note.releaseJudgement = judgement;
      note.released = true;
      this._applyReleaseJudgementV2(judgement);
      EventBus.emit('note:hit', { note, judgement, delta: Math.round(delta * 1000), isRelease: true });
      return { note, judgement, delta };
    }
    if (releaseTime < holdEnd - releaseWindow) {
      // Released way too early — start grace period
      this._droppedHolds.set(lane, { note, dropTime: releaseTime });
      return { note, judgement: 'dropped', dropped: true };
    }

    // ── Released at/after hold end: use lenient release windows (1.5×) — Score V2 ──
    const delta = releaseTime - holdEnd;
    const absDelta = Math.abs(delta);

    let judgement;
    if (absDelta <= RELEASE_WINDOWS.perfect) judgement = 'perfect';
    else if (absDelta <= RELEASE_WINDOWS.great) judgement = 'great';
    else if (absDelta <= RELEASE_WINDOWS.good) judgement = 'good';
    else judgement = 'good'; // Beyond all windows = good (lenient for release)

    note.releaseJudgement = judgement;
    note.released = true;
    // Score V2: Release affects score, accuracy, and combo
    this._applyReleaseJudgementV2(judgement);

    EventBus.emit('note:hit', { note, judgement, delta: Math.round(delta * 1000), isRelease: true });
    return { note, judgement, delta };
  }

  /**
   * Check LN ticks — call each frame.
   * For each actively held note, check if any tick time has passed.
   * If holding through a tick: combo++, score, emit note:tick
   * If not holding (dropped) when tick passes: combo break, emit note:tickmiss
   */
  checkTicks(currentTime) {
    // Check ticks for active (held) hold notes
    for (const [lane, note] of this._activeHoldNotes) {
      if (!note.ticks || note.ticks.length === 0) continue;
      this._processNoteTicks(note, currentTime, true);
    }

    // Check ticks for dropped hold notes (grace period — ticks still pass)
    for (const [lane, dropped] of this._droppedHolds) {
      const note = dropped.note;
      if (!note.ticks || note.ticks.length === 0) continue;
      this._processNoteTicks(note, currentTime, false);
    }

    // Check ticks for missed hold notes (head was missed — all ticks are auto-missed)
    // This is handled by the tick pointer advancing past missed notes
  }

  /** Process ticks for a single note */
  _processNoteTicks(note, currentTime, isHolding) {
    const ticks = note.ticks;
    let i = note._nextTickIndex;

    while (i < ticks.length) {
      const tickTime = ticks[i];

      // If this tick hasn't passed the judge line yet, stop
      if (tickTime > currentTime) break;

      // This tick has passed the judge line
      if (!note._tickHit[i] && !note._tickMissed[i]) {
        if (isHolding) {
          // Tick hit! Player was holding through this tick
          note._tickHit[i] = true;
          this.tickHits++;
          this.combo++;
          if (this.combo > this.maxCombo) this.maxCombo = this.combo;
          // Score for tick: same as a MAX hit per scoring slot
          this.score += Math.round(this._baseScore * (ACC_WEIGHT.perfect / 305));
          // Small HP recovery
          this.hp = Math.max(0, Math.min(100, this.hp + 0.5));
          EventBus.emit('note:tick', { note, tickTime, tickIndex: i });
        } else {
          // Tick missed! Player was not holding when tick passed
          note._tickMissed[i] = true;
          this.tickMisses++;
          // Combo break
          if (this.combo > 0) EventBus.emit('combo:break', { combo: this.combo });
          this.combo = 0;
          // Small HP penalty
          this.hp = Math.max(0, this.hp - 0.8);
          EventBus.emit('note:tickmiss', { note, tickTime, tickIndex: i });
        }
      }

      i++;
    }

    note._nextTickIndex = i;
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
   *  Breaks combo and shows MISS judgement.
   *  Also misses any remaining unprocessed ticks. */
  _applySliderBreak(note) {
    this.sliderBreaks++;
    note._sliderBreak = true;

    // Degrade score: remove head contribution and apply BAD weight
    const headWeight = ACC_WEIGHT[note.judgement] || 0;
    const badWeight = ACC_WEIGHT.bad; // 50
    const scoreDiff = Math.round(this._baseScore * ((badWeight - headWeight) / 305));
    this.score = Math.max(0, this.score + scoreDiff); // scoreDiff is negative

    // HP: moderate penalty (harsher than before)
    this.hp = Math.max(0, Math.min(100, this.hp - 1.5));

    // Break combo on slider break
    if (this.combo > 0) EventBus.emit('combo:break', { combo: this.combo });
    this.combo = 0;

    note.releaseJudgement = 'bad';
    note.released = true;

    // Miss all remaining unprocessed ticks
    if (note.ticks) {
      for (let i = note._nextTickIndex; i < note.ticks.length; i++) {
        if (!note._tickHit[i] && !note._tickMissed[i]) {
          note._tickMissed[i] = true;
          this.tickMisses++;
        }
      }
      note._nextTickIndex = note.ticks.length;
    }

    EventBus.emit('note:sliderbreak', { note });
    // Also emit note:miss so JudgementDisplay shows MISS text
    EventBus.emit('note:miss', { note, sliderBreak: true });
  }

  /** Apply a head judgement: update score, combo, HP, and counts.
   *  This affects accuracy (per-note basis). */
  _applyJudgement(judgement) {
    this.hitCounts[judgement]++;

    // Score: per-scoring-slot, aligned with accuracy weight
    // MAX = 305/305 = 1.0, GREAT = 300/305 ≈ 0.984, etc.
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

  /** Apply a release judgement — Score V2: affects score, accuracy, and combo.
   *  Release is a separate scoring slot from the head. */
  _applyReleaseJudgementV2(judgement) {
    // Score: release counts as its own scoring slot
    const weight = ACC_WEIGHT[judgement] || 0;
    this.score += Math.round(this._baseScore * (weight / 305));

    // HP: same as head judgment
    this.hp = Math.max(0, Math.min(100, this.hp + (HP_JUDGEMENT[judgement] || 0)));

    // Combo: release affects combo (Score V2)
    if (judgement === 'bad' || judgement === 'miss') {
      if (this.combo > 0) EventBus.emit('combo:break', { combo: this.combo });
      this.combo = 0;
    } else {
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    }
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

          // For hold notes, mark tail as resolved and miss all ticks
          if (note.type === 'hold' && note.duration > 0) {
            note.releaseJudgement = 'miss';
            note.released = true;
            // Miss all ticks for this hold note
            if (note.ticks) {
              for (let i = 0; i < note.ticks.length; i++) {
                if (!note._tickHit[i] && !note._tickMissed[i]) {
                  note._tickMissed[i] = true;
                  this.tickMisses++;
                }
              }
              note._nextTickIndex = note.ticks.length;
            }
          }
        }
      }

      // Check if a held note's release was missed (only if still active and not dropped)
      if (note.type === 'hold' && note.duration > 0 && note.hit && note.judgement !== 'miss' && !note.released) {
        const isDropped = this._droppedHolds.has(note.lane);
        if (!isDropped) {
          const holdEnd = note.time + note.duration;
          if (currentTime - holdEnd > RELEASE_WINDOWS.bad) {
            // Held through but didn't release in time — auto-release with perfect
            // (player held the entire duration, which is the ideal behavior)
            note.releaseJudgement = 'perfect';
            note.released = true;
            this._activeHoldNotes.delete(note.lane);
            this._applyReleaseJudgementV2('perfect'); // Score V2: full score for holding through
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
   * Score V2 accuracy: per-scoring-slot (heads + ticks + releases).
   * MAX=305, GREAT=300, GOOD=200, BAD=50, MISS=0
   * Ticks: Held=305, Missed=0
   * Slider breaks degrade the note head to BAD (50).
   * Release judgments contribute independently.
   * Unprocessed (future) slots are assumed to be MAX (305).
   * accuracy = (sum of per-slot weights) / (totalScoringSlots × 305) × 100
   */
  getAccuracy() {
    const notes = this.map.notes;
    const total = this._totalScoringSlots;
    if (total === 0) return 100;

    let totalWeight = 0;
    for (const note of notes) {
      if (!note.hit) {
        // Not yet processed — head assumed perfect (305)
        totalWeight += 305;
        // If hold note, also assume ticks and release are perfect
        if (note.type === 'hold' && note.duration > 0) {
          totalWeight += (note.ticks ? note.ticks.length : 0) * 305; // ticks
          totalWeight += 305; // release
        }
      } else if (note.judgement === 'miss') {
        // Missed head = 0
        totalWeight += 0;
        // Missed hold: ticks are all 0, release is 0
        if (note.type === 'hold' && note.duration > 0) {
          totalWeight += 0; // all ticks missed = 0
          totalWeight += 0; // release missed = 0
        }
      } else if (note._sliderBreak) {
        // Slider break: head degraded to BAD (50)
        totalWeight += 50;
        // Ticks: count hits and misses
        if (note.ticks) {
          for (let i = 0; i < note.ticks.length; i++) {
            totalWeight += note._tickHit[i] ? 305 : 0;
          }
        }
        // Release: BAD (0 for slider break)
        totalWeight += 0;
      } else {
        // Normal hit: use head judgement weight
        totalWeight += ACC_WEIGHT[note.judgement] || 0;

        // Hold note: add tick and release weights
        if (note.type === 'hold' && note.duration > 0) {
          // Ticks
          if (note.ticks) {
            for (let i = 0; i < note.ticks.length; i++) {
              if (note._tickHit[i]) {
                totalWeight += 305;
              } else if (note._tickMissed[i]) {
                totalWeight += 0;
              } else {
                // Unprocessed tick — assume perfect
                totalWeight += 305;
              }
            }
          }

          // Release
          if (note.released && note.releaseJudgement) {
            totalWeight += ACC_WEIGHT[note.releaseJudgement] || 0;
          } else {
            // Not yet released — assume perfect
            totalWeight += 305;
          }
        }
      }
    }

    return (totalWeight / (total * 305)) * 100;
  }

  getRank() {
    // Death always forces D rank regardless of accuracy
    if (this._died) return 'D';
    const acc = this.getAccuracy();
    if (acc >= 100) return 'X';   // Only all MAX (305 each)
    if (acc >= 90)  return 'S';
    if (acc >= 80)  return 'A';
    if (acc >= 70)  return 'B';
    if (acc >= 60)  return 'C';
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
      health: this.hp,
      sliderBreaks: this.sliderBreaks,
      died: this._died,
      hitCounts: { ...this.hitCounts },
      tickHits: this.tickHits,
      tickMisses: this.tickMisses,
      totalNotes: this._totalNotes,
      totalTicks: this._totalTickCount,
    };
  }
}

export { WINDOWS, ACC_WEIGHT };
