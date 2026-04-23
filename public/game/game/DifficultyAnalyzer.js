// DifficultyAnalyzer — computes star rating and difficulty attributes for mania beatmaps
// Based on osu! mania star rating algorithm (simplified)

export default class DifficultyAnalyzer {
  
  /**
   * Analyze a beatmap and return difficulty info
   * @param {Object} map - Parsed beatmap with notes[], laneCount, bpmChanges, metadata
   * @returns {{ stars: number, sr: number, density: number, stamina: number, pattern: string }}
   */
  static analyze(map) {
    const notes = map.notes;
    if (!notes || notes.length === 0) {
      return { stars: 0, sr: 0, density: 0, stamina: 0, pattern: '—' };
    }
    
    const laneCount = map.laneCount || 4;
    const sorted = [...notes].sort((a, b) => a.time - b.time);
    const duration = sorted.length > 1 
      ? sorted[sorted.length - 1].time - sorted[0].time 
      : 1;
    
    // NPS (Notes Per Second)
    const nps = sorted.length / Math.max(duration, 1);
    
    // Chord density — average simultaneous notes per beat
    const bpm = map.metadata?.bpm || 120;
    const beatInterval = 60 / bpm;
    let chordCount = 0;
    let totalChordSize = 0;
    let i = 0;
    while (i < sorted.length) {
      const chordStart = sorted[i].time;
      const chordNotes = [];
      while (i < sorted.length && sorted[i].time - chordStart < 0.02) {
        chordNotes.push(sorted[i]);
        i++;
      }
      chordCount++;
      totalChordSize += chordNotes.length;
    }
    const avgChordSize = chordCount > 0 ? totalChordSize / chordCount : 1;
    
    // Stream detection — consecutive 1-note-per-beat patterns
    let streamLength = 0;
    let maxStream = 0;
    for (let j = 1; j < sorted.length; j++) {
      const gap = sorted[j].time - sorted[j-1].time;
      if (gap > 0 && gap < beatInterval * 1.2) {
        streamLength++;
        if (streamLength > maxStream) maxStream = streamLength;
      } else {
        streamLength = 0;
      }
    }
    
    // Jack detection — same-lane consecutive hits
    const laneStreaks = new Array(laneCount).fill(0);
    const maxLaneStreaks = new Array(laneCount).fill(0);
    let prevLane = -1;
    for (const note of sorted) {
      if (note.lane === prevLane) {
        laneStreaks[note.lane]++;
        if (laneStreaks[note.lane] > maxLaneStreaks[note.lane]) {
          maxLaneStreaks[note.lane] = laneStreaks[note.lane];
        }
      } else {
        if (prevLane >= 0 && prevLane < laneCount) laneStreaks[prevLane] = 0;
        laneStreaks[note.lane] = 1;
      }
      prevLane = note.lane;
    }
    const maxJack = Math.max(...maxLaneStreaks);
    
    // Hold note ratio
    const holdCount = sorted.filter(n => n.type === 'hold' || n.duration > 0).length;
    const holdRatio = holdCount / sorted.length;
    
    // Stamina factor — sustained high NPS over time
    const windows = 8; // 8-second windows
    const windowNPS = [];
    for (let w = 0; w < Math.ceil(duration / windows); w++) {
      const wStart = sorted[0].time + w * windows;
      const wEnd = wStart + windows;
      const count = sorted.filter(n => n.time >= wStart && n.time < wEnd).length;
      windowNPS.push(count / windows);
    }
    const avgWindowNPS = windowNPS.length > 0 ? windowNPS.reduce((a, b) => a + b, 0) / windowNPS.length : 0;
    const maxWindowNPS = windowNPS.length > 0 ? Math.max(...windowNPS) : 0;
    const staminaFactor = avgWindowNPS / Math.max(maxWindowNPS, 0.1);
    
    // Star Rating Calculation (simplified osu! mania formula)
    // Base: NPS scaling
    let starBase = Math.pow(Math.max(0, nps - 2) / 4, 2) * 2;
    
    // Chord bonus
    starBase += Math.pow(Math.max(0, avgChordSize - 1.5), 1.5) * 0.8;
    
    // Stream bonus
    if (maxStream > 8) {
      starBase += Math.pow((maxStream - 8) / 16, 1.2) * 0.5;
    }
    
    // Jack bonus  
    if (maxJack > 3) {
      starBase += Math.pow((maxJack - 3) / 8, 1.3) * 0.6;
    }
    
    // Hold bonus
    starBase += holdRatio * 1.2;
    
    // Stamina bonus
    starBase *= (0.8 + staminaFactor * 0.4);
    
    // Lane count scaling
    const laneMultiplier = laneCount <= 4 ? 0.9 : laneCount <= 6 ? 1.0 : laneCount <= 7 ? 1.05 : 1.1;
    starBase *= laneMultiplier;
    
    // Clamp
    const stars = Math.round(Math.min(Math.max(starBase, 0), 12) * 10) / 10;
    const sr = Math.round(stars * 100) / 100;
    
    // Pattern type
    let pattern = 'BALANCED';
    if (maxStream > 16 && avgChordSize < 1.8) pattern = 'STREAM';
    else if (maxJack > 6) pattern = 'JACK';
    else if (avgChordSize > 2.2) pattern = 'CHORD';
    else if (holdRatio > 0.3) pattern = 'HOLD';
    else if (nps > 10) pattern = 'SPEED';
    
    return {
      stars,
      sr,
      density: Math.round(nps * 10) / 10,
      stamina: Math.round(staminaFactor * 100),
      pattern
    };
  }
  
  /**
   * Get star color based on rating
   */
  static getStarColor(stars) {
    if (stars >= 8) return '#FF3D3D';   // Red
    if (stars >= 6.5) return '#A855F7'; // Purple
    if (stars >= 5) return '#F5C518';   // Gold
    if (stars >= 3.5) return '#00E5FF'; // Cyan
    if (stars >= 2) return '#AAFF00';   // Lime
    return '#888888';                     // Gray
  }
  
  /**
   * Get difficulty name from stars
   */
  static getDiffName(stars) {
    if (stars >= 8) return 'INSANE';
    if (stars >= 6.5) return 'EXPERT';
    if (stars >= 5) return 'HARD';
    if (stars >= 3.5) return 'ADVANCED';
    if (stars >= 2) return 'NORMAL';
    return 'EASY';
  }
  
  /**
   * Format star display string
   */
  static formatStars(stars) {
    return '★'.repeat(Math.min(10, Math.ceil(stars))) + '☆'.repeat(Math.max(0, 10 - Math.ceil(stars)));
  }
}
