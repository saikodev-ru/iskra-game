export default class BeatMap {
  constructor(parsedMap) {
    this.metadata = parsedMap.metadata;
    this.audioBuffer = parsedMap.audioBuffer;
    this.backgroundUrl = parsedMap.backgroundUrl;
    this.videoUrl = parsedMap.videoUrl;
    this.bpmChanges = parsedMap.bpmChanges;
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
    let closestDelta = Infinity;
    for (const note of laneNotes) {
      if (note.hit) continue;
      const delta = Math.abs(note.time - currentTime);
      if (delta < closestDelta && delta <= window) {
        closest = note;
        closestDelta = delta;
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

  get totalNotes() { return this.notes.length; }
  get maxScore() { return this.notes.length * 300; }
}
