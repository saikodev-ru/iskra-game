/**
 * ChorusDetector — automatic chorus detection for rhythm game songs.
 *
 * Strategy: note-density-first approach.
 *   1. Compute note density in sliding windows (primary signal)
 *   2. Optionally: compute RMS energy from audio buffer (secondary signal)
 *   3. Combine with adaptive weighting
 *   4. Extract sustained high-intensity regions
 *   5. Filter intro/outro, apply repetition heuristic
 *
 * Key insight: in rhythm games, choruses always have the highest note density.
 * Even if audio energy analysis fails, note density alone is reliable.
 */
export default class ChorusDetector {

  /**
   * Detect chorus sections from notes (and optionally audio).
   *
   * @param {AudioBuffer|null} audioBuffer - Audio buffer for energy analysis (optional)
   * @param {Array}       notes       - [{ time, lane, type, duration }, ...]
   * @returns {Array<{startTime: number, endTime: number}>}
   */
  static detect(audioBuffer, notes) {
    console.log('[ChorusDetector] Starting detection...');
    console.log(`[ChorusDetector] Notes: ${notes?.length || 0}, AudioBuffer: ${audioBuffer ? audioBuffer.duration.toFixed(1) + 's' : 'null'}`);

    if (!notes || notes.length < 10) {
      console.log('[ChorusDetector] Not enough notes (< 10), skipping');
      return [];
    }

    // Determine song duration from audio buffer or from notes
    const dur = audioBuffer ? audioBuffer.duration : (notes[notes.length - 1].time + 3);
    console.log(`[ChorusDetector] Song duration: ${dur.toFixed(1)}s`);

    if (dur < 20) {
      console.log('[ChorusDetector] Song too short (< 20s), skipping');
      return [];
    }

    // ── Parameters ──
    const WIN  = 1.0;   // analysis window (s)
    const HOP  = 0.5;   // hop (s)
    const SM   = 4;     // smoothing window (s)
    const N    = Math.floor((dur - WIN) / HOP);

    if (N < 20) {
      console.log(`[ChorusDetector] Too few windows (${N}), skipping`);
      return [];
    }

    const smHalf = Math.floor(SM / HOP / 2);

    // ── 1. Note density envelope ──
    const rawNd = new Float32Array(N);
    for (const note of notes) {
      const t0 = note.time;
      const t1 = note.time + Math.max(note.duration || 0, 0.15);
      const w0 = Math.max(0, Math.floor(t0 / HOP));
      const w1 = Math.min(N - 1, Math.floor(t1 / HOP));
      for (let w = w0; w <= w1; w++) rawNd[w] += 1;
    }

    // Normalize 0-1
    let maxNd = 0;
    for (let w = 0; w < N; w++) if (rawNd[w] > maxNd) maxNd = rawNd[w];
    if (maxNd <= 0) {
      console.log('[ChorusDetector] Note density is zero everywhere');
      return [];
    }
    for (let w = 0; w < N; w++) rawNd[w] /= maxNd;

    // Smooth
    const noteDensity = new Float32Array(N);
    for (let w = 0; w < N; w++) {
      let sum = 0, cnt = 0;
      const lo = Math.max(0, w - smHalf);
      const hi = Math.min(N - 1, w + smHalf);
      for (let s = lo; s <= hi; s++) { sum += rawNd[s]; cnt++; }
      noteDensity[w] = sum / cnt;
    }

    // ── 2. Audio energy envelope (optional, secondary signal) ──
    let energy = null;
    let hasEnergy = false;

    if (audioBuffer && audioBuffer.duration >= 10) {
      try {
        const sr  = audioBuffer.sampleRate;
        const len = audioBuffer.length;
        const nch = audioBuffer.numberOfChannels;

        // Mix down to mono
        const mono = new Float32Array(len);
        for (let ch = 0; ch < nch; ch++) {
          const d = new Float32Array(len);
          audioBuffer.copyFromChannel(d, ch);
          for (let i = 0; i < len; i++) mono[i] += d[i] / nch;
        }

        const hopSmp = Math.floor(HOP * sr);
        const winSmp = Math.floor(WIN * sr);

        const rawE = new Float32Array(N);
        for (let w = 0; w < N; w++) {
          const s0 = w * hopSmp;
          const s1 = Math.min(s0 + winSmp, len);
          if (s1 <= s0) continue;
          let sum = 0;
          for (let i = s0; i < s1; i++) sum += mono[i] * mono[i];
          rawE[w] = Math.sqrt(sum / (s1 - s0));
        }

        let maxE = 0;
        for (let w = 0; w < N; w++) if (rawE[w] > maxE) maxE = rawE[w];
        if (maxE > 0) {
          for (let w = 0; w < N; w++) rawE[w] /= maxE;
          energy = new Float32Array(N);
          for (let w = 0; w < N; w++) {
            let sum = 0, cnt = 0;
            const lo = Math.max(0, w - smHalf);
            const hi = Math.min(N - 1, w + smHalf);
            for (let s = lo; s <= hi; s++) { sum += rawE[s]; cnt++; }
            energy[w] = sum / cnt;
          }
          hasEnergy = true;
        }
      } catch (err) {
        console.warn('[ChorusDetector] Audio energy analysis failed:', err);
      }
    }

    console.log(`[ChorusDetector] Note density: computed, Audio energy: ${hasEnergy ? 'computed' : 'skipped'}`);

    // ── 3. Combine signals ──
    const score = new Float32Array(N);
    if (hasEnergy) {
      // If note density variance is high, trust it more. If uniform, rely on energy.
      let ndMean = 0;
      for (let w = 0; w < N; w++) ndMean += noteDensity[w];
      ndMean /= N;
      let ndVar = 0;
      for (let w = 0; w < N; w++) ndVar += (noteDensity[w] - ndMean) ** 2;
      ndVar /= N;

      // Higher ndVar = note density is discriminative = trust it more
      const nW = Math.max(0.4, Math.min(0.8, ndVar * 10 + 0.4));
      const eW = 1 - nW;
      console.log(`[ChorusDetector] Weights: note=${nW.toFixed(2)}, energy=${eW.toFixed(2)} (ndVar=${ndVar.toFixed(4)})`);

      for (let w = 0; w < N; w++) score[w] = nW * noteDensity[w] + eW * energy[w];
    } else {
      // No audio energy — use note density alone (still very reliable for rhythm games)
      console.log('[ChorusDetector] Using note density only (no audio energy)');
      for (let w = 0; w < N; w++) score[w] = noteDensity[w];
    }

    // ── 4. Adaptive threshold ──
    // Use middle 70% of the song (skip intro and outro)
    const m0 = Math.floor(N * 0.12);
    const m1 = Math.floor(N * 0.88);
    const mid = [];
    for (let w = m0; w < m1; w++) mid.push(score[w]);
    mid.sort((a, b) => a - b);

    const p50 = mid[Math.floor(mid.length * 0.50)] || 0.3;
    const p75 = mid[Math.floor(mid.length * 0.75)] || 0.5;
    const p90 = mid[Math.floor(mid.length * 0.90)] || 0.7;

    // Threshold: must exceed the median AND be at least 55% of the 90th percentile
    // This is more lenient than the previous version (was 60th + 65% of 85th)
    const threshold = Math.max(p50 * 1.15, p90 * 0.55);
    console.log(`[ChorusDetector] Percentiles: p50=${p50.toFixed(3)}, p75=${p75.toFixed(3)}, p90=${p90.toFixed(3)}, threshold=${threshold.toFixed(3)}`);

    // ── 5. Extract contiguous high-score regions ──
    const MIN_DUR   = 5;    // minimum chorus duration (s) — was 6, reduced for shorter choruses
    const MAX_DUR   = 60;
    const MERGE_GAP = 3;    // merge small dips (s)

    const raw = [];
    let active = false, secStart = 0, secSum = 0, secCnt = 0;

    for (let w = 0; w < N; w++) {
      const t = w * HOP;
      if (score[w] >= threshold) {
        if (!active) { active = true; secStart = t; secSum = 0; secCnt = 0; }
        secSum += score[w]; secCnt++;
      } else if (active) {
        const gap = t - (secStart + (secCnt - 1) * HOP);
        if (gap < MERGE_GAP) {
          // Small dip — keep section alive
          secCnt++; secSum += score[w] * 0.3;
        } else {
          active = false;
          raw.push({ startTime: secStart, endTime: secStart + secCnt * HOP, avg: secSum / secCnt });
        }
      }
    }
    if (active) raw.push({ startTime: secStart, endTime: secStart + secCnt * HOP, avg: secSum / secCnt });

    console.log(`[ChorusDetector] Raw sections before filtering: ${raw.length}`);

    // ── 6. Filter by duration & position ──
    const introCut = dur * 0.08;
    let sections = raw.filter(s => {
      const d = s.endTime - s.startTime;
      return d >= MIN_DUR && d <= MAX_DUR && s.startTime > introCut;
    });
    console.log(`[ChorusDetector] After duration filter (>${MIN_DUR}s, <${MAX_DUR}s, after ${introCut.toFixed(1)}s): ${sections.length}`);

    // Fallback: if no sections found with current threshold, try a much lower threshold
    if (sections.length === 0) {
      console.log('[ChorusDetector] No sections found — trying relaxed threshold');
      const relaxedThreshold = Math.max(p50 * 0.85, p75 * 0.5);
      console.log(`[ChorusDetector] Relaxed threshold: ${relaxedThreshold.toFixed(3)} (was ${threshold.toFixed(3)})`);

      const raw2 = [];
      active = false; secStart = 0; secSum = 0; secCnt = 0;
      for (let w = 0; w < N; w++) {
        const t = w * HOP;
        if (score[w] >= relaxedThreshold) {
          if (!active) { active = true; secStart = t; secSum = 0; secCnt = 0; }
          secSum += score[w]; secCnt++;
        } else if (active) {
          const gap = t - (secStart + (secCnt - 1) * HOP);
          if (gap < MERGE_GAP) {
            secCnt++; secSum += score[w] * 0.3;
          } else {
            active = false;
            raw2.push({ startTime: secStart, endTime: secStart + secCnt * HOP, avg: secSum / secCnt });
          }
        }
      }
      if (active) raw2.push({ startTime: secStart, endTime: secStart + secCnt * HOP, avg: secSum / secCnt });

      sections = raw2.filter(s => {
        const d = s.endTime - s.startTime;
        return d >= MIN_DUR && d <= MAX_DUR && s.startTime > introCut;
      });
      console.log(`[ChorusDetector] After relaxed filter: ${sections.length} sections`);
    }

    // Second fallback: just find the highest density peaks even with very low threshold
    if (sections.length === 0) {
      console.log('[ChorusDetector] Still no sections — finding density peaks as absolute fallback');
      const MIN_DUR_FB = 4; // even shorter
      const minThreshold = p50 * 0.7;

      const raw3 = [];
      active = false; secStart = 0; secSum = 0; secCnt = 0;
      for (let w = 0; w < N; w++) {
        const t = w * HOP;
        if (score[w] >= minThreshold) {
          if (!active) { active = true; secStart = t; secSum = 0; secCnt = 0; }
          secSum += score[w]; secCnt++;
        } else if (active) {
          const gap = t - (secStart + (secCnt - 1) * HOP);
          if (gap < MERGE_GAP) {
            secCnt++; secSum += score[w] * 0.2;
          } else {
            active = false;
            raw3.push({ startTime: secStart, endTime: secStart + secCnt * HOP, avg: secSum / secCnt });
          }
        }
      }
      if (active) raw3.push({ startTime: secStart, endTime: secStart + secCnt * HOP, avg: secSum / secCnt });

      sections = raw3.filter(s => {
        const d = s.endTime - s.startTime;
        return d >= MIN_DUR_FB && d <= MAX_DUR && s.startTime > introCut;
      });
      console.log(`[ChorusDetector] Absolute fallback: ${sections.length} sections`);
    }

    if (sections.length === 0) {
      console.log('[ChorusDetector] No chorus sections detected');
      return [];
    }

    // Keep top candidates by average score
    sections.sort((a, b) => b.avg - a.avg);
    if (sections.length > 6) sections = sections.slice(0, 6);

    // ── 7. Repetition heuristic ──
    if (sections.length >= 2) {
      const avgDur = sections.reduce((s, sec) => s + (sec.endTime - sec.startTime), 0) / sections.length;
      // Filter sections whose duration is within 30-250% of average
      const before = sections.length;
      sections = sections.filter(s => {
        const d = s.endTime - s.startTime;
        return d >= avgDur * 0.3 && d <= avgDur * 2.5;
      });
      console.log(`[ChorusDetector] Repetition filter: ${before} → ${sections.length} (avgDur=${avgDur.toFixed(1)}s)`);
    }

    if (sections.length === 0) {
      console.log('[ChorusDetector] All sections filtered by repetition heuristic');
      return [];
    }

    // Final sort by time, add small padding
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
