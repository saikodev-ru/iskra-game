/**
 * ChorusDetector — automatic chorus detection for rhythm game songs.
 *
 * Core insight: rhythm game maps have UNIFORM note density throughout.
 * So note-density thresholds are useless. Instead, use audio energy LOCAL CONTRAST:
 * a chorus is louder than the verse immediately before/after it.
 *
 * Algorithm:
 *  1. Compute RMS energy in short windows (no smoothing — preserve dynamics)
 *  2. For each window, compute ratio to the average energy in a ±20s surrounding window
 *  3. Regions where ratio > threshold for sustained periods are chorus candidates
 *  4. Filter by minimum duration, intro/outro position
 *  5. Repetition heuristic: choruses repeat with similar duration
 */
export default class ChorusDetector {

  /**
   * Detect chorus sections from audio buffer (and optionally notes).
   *
   * @param {AudioBuffer|null} audioBuffer - Audio buffer for energy analysis
   * @param {Array}       notes       - [{ time, lane, type, duration }, ...]
   * @returns {Array<{startTime: number, endTime: number}>}
   */
  static detect(audioBuffer, notes) {
    console.log('[ChorusDetector] Starting detection...');
    console.log(`[ChorusDetector] Notes: ${notes?.length || 0}, AudioBuffer: ${audioBuffer ? audioBuffer.duration.toFixed(1) + 's' : 'null'}`);

    if (!audioBuffer || audioBuffer.duration < 20) {
      console.log('[ChorusDetector] No audio buffer or song too short, skipping');
      return [];
    }

    const sr  = audioBuffer.sampleRate;
    const len = audioBuffer.length;
    const nch = audioBuffer.numberOfChannels;
    const dur = audioBuffer.duration;

    // ── 1. Mix down to mono ──
    const mono = new Float32Array(len);
    for (let ch = 0; ch < nch; ch++) {
      const d = new Float32Array(len);
      audioBuffer.copyFromChannel(d, ch);
      for (let i = 0; i < len; i++) mono[i] += d[i] / nch;
    }

    // ── 2. Compute RMS energy in short windows ──
    // Short windows (0.25s) with small hop (0.1s) to preserve dynamics
    const WIN_SMP = Math.floor(0.25 * sr);
    const HOP_SMP = Math.floor(0.1 * sr);
    const HT = 0.1; // hop time in seconds
    const N = Math.floor((len - WIN_SMP) / HOP_SMP);

    if (N < 50) {
      console.log('[ChorusDetector] Too few analysis windows, skipping');
      return [];
    }

    const energy = new Float32Array(N);
    for (let w = 0; w < N; w++) {
      const s0 = w * HOP_SMP;
      const s1 = Math.min(s0 + WIN_SMP, len);
      let sum = 0;
      for (let i = s0; i < s1; i++) sum += mono[i] * mono[i];
      energy[w] = sum / (s1 - s0); // raw power (not sqrt — better dynamic range)
    }

    // ── 3. Note density (secondary signal — used to reject quiet instrumental sections) ──
    let hasNotes = false;
    const noteDensity = new Float32Array(N);
    if (notes && notes.length > 0) {
      hasNotes = true;
      for (const note of notes) {
        const t0 = note.time;
        const t1 = note.time + Math.max(note.duration || 0, 0.1);
        const w0 = Math.max(0, Math.floor(t0 / HT));
        const w1 = Math.min(N - 1, Math.floor(t1 / HT));
        for (let w = w0; w <= w1; w++) noteDensity[w] += 1;
      }
      // Normalize to 0-1
      let maxNd = 0;
      for (let w = 0; w < N; w++) if (noteDensity[w] > maxNd) maxNd = noteDensity[w];
      if (maxNd > 0) for (let w = 0; w < N; w++) noteDensity[w] /= maxNd;
    }

    // ── 4. Local contrast: energy relative to surrounding ±20s ──
    // This is the KEY idea: we find parts that are louder than their immediate context.
    const RADIUS = Math.floor(20 / HT); // ±20s worth of windows
    const contrast = new Float32Array(N);

    for (let w = 0; w < N; w++) {
      const lo = Math.max(0, w - RADIUS);
      const hi = Math.min(N - 1, w + RADIUS);
      let localSum = 0, localCnt = 0;
      for (let s = lo; s <= hi; s++) {
        localSum += energy[s];
        localCnt++;
      }
      const localAvg = localSum / localCnt;
      contrast[w] = localAvg > 0 ? energy[w] / localAvg : 0;
    }

    // ── 5. Smooth the contrast signal slightly (2s rolling average) ──
    const SM_HALF = Math.floor(2 / HT); // ±2s
    const smooth = new Float32Array(N);
    for (let w = 0; w < N; w++) {
      let sum = 0, cnt = 0;
      const lo = Math.max(0, w - SM_HALF);
      const hi = Math.min(N - 1, w + SM_HALF);
      for (let s = lo; s <= hi; s++) { sum += contrast[s]; cnt++; }
      smooth[w] = sum / cnt;
    }

    // ── 6. Adaptive threshold based on contrast distribution ──
    // We want the top ~25% of contrast values
    const allContrast = [];
    for (let w = 0; w < N; w++) allContrast.push(smooth[w]);
    allContrast.sort((a, b) => a - b);

    const p60 = allContrast[Math.floor(allContrast.length * 0.60)];
    const p75 = allContrast[Math.floor(allContrast.length * 0.75)];
    const p90 = allContrast[Math.floor(allContrast.length * 0.90)];

    // Threshold: must be above p60 AND at least 70% of the way from p60 to p90
    const dynamicRange = p90 - p60;
    const threshold = p60 + dynamicRange * 0.3;

    console.log(`[ChorusDetector] Contrast percentiles: p60=${p60.toFixed(3)}, p75=${p75.toFixed(3)}, p90=${p90.toFixed(3)}, range=${dynamicRange.toFixed(3)}, threshold=${threshold.toFixed(3)}`);

    // If dynamic range is too small (uniform energy), lower threshold
    // This handles songs that are consistently loud
    const effectiveThreshold = dynamicRange < 0.05
      ? p75  // very uniform — use 75th percentile
      : threshold;

    console.log(`[ChorusDetector] Effective threshold: ${effectiveThreshold.toFixed(3)} (dynamicRange=${dynamicRange.toFixed(3)})`);

    // ── 7. Compute note density threshold ──
    // Choruses should have at least some notes (not instrumental breaks)
    let ndThreshold = 0;
    if (hasNotes) {
      // Median note density — chorus should be at or above this
      const sortedNd = [...noteDensity].sort((a, b) => a - b);
      ndThreshold = sortedNd[Math.floor(sortedNd.length * 0.3)] * 0.5;
      console.log(`[ChorusDetector] Note density threshold: ${ndThreshold.toFixed(3)}`);
    }

    // ── 8. Extract sustained high-contrast regions ──
    const MIN_DUR = 5;    // minimum 5 seconds
    const MAX_DUR = 65;   // maximum 65 seconds
    const MERGE_GAP = 3;  // merge dips shorter than 3s

    const raw = [];
    let active = false, secStart = 0, secSum = 0, secCnt = 0;

    for (let w = 0; w < N; w++) {
      const t = w * HT;
      const isChorus = smooth[w] >= effectiveThreshold &&
        (!hasNotes || noteDensity[w] >= ndThreshold);

      if (isChorus) {
        if (!active) { active = true; secStart = t; secSum = 0; secCnt = 0; }
        secSum += smooth[w];
        secCnt++;
      } else if (active) {
        const gap = t - (secStart + (secCnt - 1) * HT);
        if (gap < MERGE_GAP) {
          // Small dip — keep section alive (reduced weight)
          secCnt++;
          secSum += smooth[w] * 0.3;
        } else {
          active = false;
          raw.push({
            startTime: secStart,
            endTime: secStart + secCnt * HT,
            avg: secSum / secCnt
          });
        }
      }
    }
    if (active) {
      raw.push({
        startTime: secStart,
        endTime: secStart + secCnt * HT,
        avg: secSum / secCnt
      });
    }

    console.log(`[ChorusDetector] Raw sections: ${raw.length} (${raw.map(s => (s.endTime - s.startTime).toFixed(1) + 's').join(', ')})`);

    // ── 9. Filter by duration & position ──
    const introCut = dur * 0.08;
    let sections = raw.filter(s => {
      const d = s.endTime - s.startTime;
      return d >= MIN_DUR && d <= MAX_DUR && s.startTime > introCut;
    });
    console.log(`[ChorusDetector] After duration filter: ${sections.length}`);

    // ── 10. Fallback: if no sections, try much lower threshold ──
    if (sections.length === 0) {
      console.log('[ChorusDetector] No sections — trying lower threshold');
      const lowThreshold = p60 * 1.02; // barely above median

      const raw2 = [];
      active = false; secStart = 0; secSum = 0; secCnt = 0;
      for (let w = 0; w < N; w++) {
        const t = w * HT;
        const isChorus = smooth[w] >= lowThreshold &&
          (!hasNotes || noteDensity[w] >= ndThreshold * 0.3);

        if (isChorus) {
          if (!active) { active = true; secStart = t; secSum = 0; secCnt = 0; }
          secSum += smooth[w]; secCnt++;
        } else if (active) {
          const gap = t - (secStart + (secCnt - 1) * HT);
          if (gap < MERGE_GAP * 1.5) {
            secCnt++; secSum += smooth[w] * 0.2;
          } else {
            active = false;
            raw2.push({ startTime: secStart, endTime: secStart + secCnt * HT, avg: secSum / secCnt });
          }
        }
      }
      if (active) raw2.push({ startTime: secStart, endTime: secStart + secCnt * HT, avg: secSum / secCnt });

      sections = raw2.filter(s => {
        const d = s.endTime - s.startTime;
        return d >= MIN_DUR && d <= MAX_DUR && s.startTime > introCut;
      });
      console.log(`[ChorusDetector] Fallback sections: ${sections.length}`);

      // If still nothing, take the longest raw section regardless of threshold
      if (sections.length === 0 && raw2.length > 0) {
        raw2.sort((a, b) => (b.endTime - b.startTime) - (a.endTime - a.startTime));
        const best = raw2[0];
        if (best.endTime - best.startTime >= 3) {
          sections = [best];
          console.log(`[ChorusDetector] Using longest section as fallback: ${(best.endTime - best.startTime).toFixed(1)}s`);
        }
      }
    }

    if (sections.length === 0) {
      console.log('[ChorusDetector] No chorus sections detected');
      return [];
    }

    // ── 11. Keep top candidates by contrast score ──
    sections.sort((a, b) => b.avg - a.avg);
    if (sections.length > 6) sections = sections.slice(0, 6);

    // ── 12. Repetition heuristic ──
    if (sections.length >= 2) {
      const avgDur = sections.reduce((s, sec) => s + (sec.endTime - sec.startTime), 0) / sections.length;
      const before = sections.length;
      sections = sections.filter(s => {
        const d = s.endTime - s.startTime;
        return d >= avgDur * 0.3 && d <= avgDur * 2.5;
      });
      console.log(`[ChorusDetector] Repetition filter: ${before} → ${sections.length}`);
    }

    if (sections.length === 0) {
      console.log('[ChorusDetector] All sections filtered by repetition heuristic');
      return [];
    }

    // Final sort by time, add padding
    sections.sort((a, b) => a.startTime - b.startTime);
    const PAD = 0.5;

    const result = sections.map(s => ({
      startTime: Math.max(0, s.startTime - PAD),
      endTime:   Math.min(dur, s.endTime + PAD),
    }));

    console.log(`[RHYMIX] 🎵 Auto-detected ${result.length} chorus section(s): ${result.map(s => s.startTime.toFixed(1) + 's–' + s.endTime.toFixed(1) + 's').join(', ')}`);

    return result;
  }
}
