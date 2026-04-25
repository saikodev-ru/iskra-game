export default class BeatMap {
  constructor(parsedMap) {
    this.metadata = parsedMap.metadata;
    this.audioBuffer = parsedMap.audioBuffer;
    this.backgroundUrl = parsedMap.backgroundUrl;
    this.videoUrl = parsedMap.videoUrl;
    this.bpmChanges = parsedMap.bpmChanges;
    this.kiaiSections = parsedMap.kiaiSections || [];
    this.notes = parsedMap.notes;
    this.laneCount = parsedMap.laneCount || 4;
    
    this.notes.sort((a, b) => a.time - b.time);
    
    this._byLane = {};
    for (const note of this.notes) {
      if (!this._byLane[note.lane]) this._byLane[note.lane] = [];
      this._byLane[note.lane].push(note);
    }
    
    // Determine lane count from notes if not provided
    if (this.notes.length > 0 && !parsedMap.laneCount) {
      const maxLane = Math.max(...this.notes.map(n => n.lane));
      this.laneCount = maxLane + 1;
    }

    // Debug: log hold note stats
    const holdNotes = this.notes.filter(n => n.type === 'hold' && n.duration > 0);
    if (this.notes.length > 0) {
      console.log(`[BeatMap] Total notes: ${this.notes.length}, Hold notes: ${holdNotes.length}, Lanes: ${this.laneCount}`);
      if (holdNotes.length > 0) {
        console.log(`[BeatMap] Sample hold:`, JSON.stringify(holdNotes[0]));
      }
    }
  }

  getNotesInWindow(currentTime, lookahead = 3.0) {
    const start = currentTime - 0.5;
    const end = currentTime + lookahead;
    return this.notes.filter(n => {
      // Include notes whose start time is in the window
      if (n.time >= start && n.time <= end) return true;
      // Hold notes that started earlier but tail hasn't passed yet
      if (n.type === 'hold' && n.duration > 0 && n.time < start && (n.time + n.duration) >= start) return true;
      // Hold notes being actively held (head hit but not released)
      if (n.type === 'hold' && n.duration > 0 && n.hit && n.judgement !== 'miss' && !n.released) return true;
      return false;
    });
  }

  findClosestNote(lane, currentTime, window = 0.25) {
    const laneNotes = this._byLane[lane] || [];
    let closest = null;
    let closestAbsDelta = Infinity;
    let closestDelta = 0;
    for (const note of laneNotes) {
      if (note.hit) continue;
      const delta = note.time - currentTime; // Signed: positive = hit early, negative = hit late
      const absDelta = Math.abs(delta);
      if (absDelta < closestAbsDelta && absDelta <= window) {
        closest = note;
        closestDelta = delta;
        closestAbsDelta = absDelta;
      }
    }
    return closest ? { note: closest, delta: closestDelta } : null;
  }

  getBpmAt(time) {
    let bpm = this.metadata.bpm || 120;
    for (const change of this.bpmChanges) {
      if (change.time <= time) bpm = change.bpm;
      else break;
    }
    return bpm;
  }

  /** Check if a given time falls within any kiai section */
  isKiai(time) {
    for (const section of this.kiaiSections) {
      if (time >= section.startTime && time < section.endTime) return true;
    }
    return false;
  }

  /** Get the kiai intensity at a given time (0 = no kiai, 1 = full kiai).
   *  Smoothly transitions in/out over 0.3s at section boundaries. */
  getKiaiIntensity(time) {
    const FADE = 0.3; // fade in/out duration in seconds
    for (const section of this.kiaiSections) {
      const sectionEnd = section.endTime;
      if (time >= section.startTime && time < sectionEnd) {
        // Fade in at start
        if (time < section.startTime + FADE) {
          return (time - section.startTime) / FADE;
        }
        // Fade out at end
        if (time > sectionEnd - FADE) {
          return (sectionEnd - time) / FADE;
        }
        return 1.0;
      }
    }
    return 0;
  }

  get totalNotes() { return this.notes.length; }
  get maxScore() { return this.notes.length * 300; }
}
