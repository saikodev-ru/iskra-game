export default class BeatMap {
  constructor(parsedMap) {
    this.metadata = parsedMap.metadata;
    this.audioBuffer = parsedMap.audioBuffer;
    this.backgroundUrl = parsedMap.backgroundUrl;
    this.videoUrl = parsedMap.videoUrl;
    this.bpmChanges = parsedMap.bpmChanges;
    this.notes = parsedMap.notes;
    
    // Sort notes by time
    this.notes.sort((a, b) => a.time - b.time);
    
    // Pre-compute: group notes by lane for faster lookup
    this._byLane = {};
    for (const note of this.notes) {
      if (!this._byLane[note.lane]) this._byLane[note.lane] = [];
      this._byLane[note.lane].push(note);
    }
    
    this.laneCount = 4;
    // Determine lane count from notes
    if (this.notes.length > 0) {
      const maxLane = Math.max(...this.notes.map(n => n.lane));
      this.laneCount = maxLane + 1;
    }
  }

  // Get notes within a time window (for rendering)
  getNotesInWindow(currentTime, lookahead = 3.0) {
    const start = currentTime - 0.5; // show notes that just passed
    const end = currentTime + lookahead;
    return this.notes.filter(n => n.time >= start && n.time <= end);
  }

  // Get notes for a specific lane within a time window
  getLaneNotes(lane, currentTime, lookahead = 3.0) {
    const laneNotes = this._byLane[lane] || [];
    const start = currentTime - 0.5;
    const end = currentTime + lookahead;
    return laneNotes.filter(n => n.time >= start && n.time <= end);
  }

  // Find the closest unhit note in a lane for judgement
  findClosestNote(lane, currentTime, window = 0.15) {
    const laneNotes = this._byLane[lane] || [];
    let closest = null;
    let closestDelta = Infinity;
    
    for (const note of laneNotes) {
      if (note.hit) continue; // skip already hit notes
      const delta = Math.abs(note.time - currentTime);
      if (delta < closestDelta && delta <= window) {
        closest = note;
        closestDelta = delta;
      }
    }
    
    return closest ? { note: closest, delta: closestDelta } : null;
  }

  // Get BPM at a given time
  getBpmAt(time) {
    let bpm = this.metadata.bpm || 120;
    for (const change of this.bpmChanges) {
      if (change.time <= time) {
        bpm = change.bpm;
      } else {
        break;
      }
    }
    return bpm;
  }

  get totalNotes() {
    return this.notes.length;
  }

  get maxScore() {
    return this.notes.length * 300;
  }
}
