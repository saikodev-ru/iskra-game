/**
 * ChorusDetector v3 — automatic chorus detection for rhythm game songs.
 *
 * Core insight: Choruses are the LOUDEST, most REPEATED sections of a song.
 * They typically occur 2-3 times with similar duration (15-40s each).
 *
 * Algorithm:
 *  1. Compute smoothed RMS energy across the song
 *  2. Compute note density signal (rhythm game maps have more notes in choruses)
 *  3. Combine signals: energy peaks weighted by note density
 *  4. Find sustained above-threshold regions using global energy percentiles
 *  5. Filter by duration (8-50s), reject intro/outro
 *  6. Repetition heuristic: prefer groups of similarly-sized sections
 *  7. Progressive fallback: lower threshold if no sections found
 */
export default class ChorusDetector {

  /**
   * Detect chorus sections from audio buffer and notes.
   *
   * @param {AudioBuffer|null} audioBuffer
   * @param {Array} notes — [{ time, lane, type, duration }, ...]
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

    // ── 2. Compute RMS energy in windows ──
    const HT = 0.1;                           // hop time
    const WIN_SMP = Math.floor(0.4 * sr);      // 0.4s window
    const HOP_SMP = Math.floor(HT * sr);
    const N = Math.floor((len - WIN_SMP) / HOP_SMP);

    if (N < 50) {
      console.log('[ChorusDetector] Too few analysis windows, skipping');
      return [];
    }

    const rawEnergy = new Float32Array(N);
    for (let w = 0; w < N; w++) {
      const s0 = w * HOP_SMP;
      const s1 = Math.min(s0 + WIN_SMP, len);
      let sum = 0;
      for (let i = s0; i < s1; i++) sum += mono[i] * mono[i];
      rawEnergy[w] = sum / (s1 - s0);
    }

    // ── 3. Smooth energy with 3s rolling average ──
    const SM_HALF = Math.floor(3 / HT); // ±3s → 6s total smoothing
    const energy = new Float32Array(N);
    for (let w = 0; w < N; w++) {
      let sum = 0, cnt = 0;
      const lo = Math.max(0, w - SM_HALF);
      const hi = Math.min(N - 1, w + SM_HALF);
      for (let s = lo; s <= hi; s++) { sum += rawEnergy[s]; cnt++; }
      energy[w] = sum / cnt;
    }

    // ── 4. Compute note density signal ──
    let hasNotes = false;
    const noteDensity = new Float32Array(N);
    if (notes && notes.length > 0) {
      hasNotes = true;
      for (const note of notes) {
        const t0 = note.time;
        const t1 = note.time + Math.max(note.duration || 0, 0.05);
        const w0 = Math.max(0, Math.floor(t0 / HT));
        const w1 = Math.min(N - 1, Math.floor(t1 / HT));
        for (let w = w0; w <= w1; w++) noteDensity[w] += 1;
      }
      // Smooth note density with 2s window
      const ndSm = Math.floor(2 / HT);
      const smoothed = new Float32Array(N);
      for (let w = 0; w < N; w++) {
        let sum = 0, cnt = 0;
        const lo = Math.max(0, w - ndSm);
        const hi = Math.min(N - 1, w + ndSm);
        for (let s = lo; s <= hi; s++) { sum += noteDensity[s]; cnt++; }
        smoothed[w] = sum / cnt;
      }
      // Copy smoothed back
      for (let w = 0; w < N; w++) noteDensity[w] = smoothed[w];

      // Normalize note density to 0-1
      let maxNd = 0;
      for (let w = 0; w < N; w++) if (noteDensity[w] > maxNd) maxNd = noteDensity[w];
      if (maxNd > 0) for (let w = 0; w < N; w++) noteDensity[w] /= maxNd;
    }

    // ── 5. Build combined signal ──
    // Normalize energy to 0-1
    let maxE = 0, minE = Infinity;
    for (let w = 0; w < N; w++) {
      if (energy[w] > maxE) maxE = energy[w];
      if (energy[w] < minE) minE = energy[w];
    }
    const eRange = maxE - minE || 1;
    const normEnergy = new Float32Array(N);
    for (let w = 0; w < N; w++) normEnergy[w] = (energy[w] - minE) / eRange;

    // Combined: 60% energy + 40% note density (or 100% energy if no notes)
    const combined = new Float32Array(N);
    for (let w = 0; w < N; w++) {
      combined[w] = hasNotes
        ? normEnergy[w] * 0.6 + noteDensity[w] * 0.4
        : normEnergy[w];
    }

    // ── 6. Find energy distribution for adaptive thresholds ──
    const sorted = [];
    for (let w = 0; w < N; w++) sorted.push(combined[w]);
    sorted.sort((a, b) => a - b);

    const p25 = sorted[Math.floor(sorted.length * 0.25)];
    const p50 = sorted[Math.floor(sorted.length * 0.50)];
    const p65 = sorted[Math.floor(sorted.length * 0.65)];
    const p75 = sorted[Math.floor(sorted.length * 0.75)];
    const p90 = sorted[Math.floor(sorted.length * 0.90)];

    console.log(`[ChorusDetector] Distribution: p25=${p25.toFixed(3)}, p50=${p50.toFixed(3)}, p65=${p65.toFixed(3)}, p75=${p75.toFixed(3)}, p90=${p90.toFixed(3)}`);
    console.log(`[ChorusDetector] Dynamic range: p90-p25 = ${(p90 - p25).toFixed(3)}`);

    // ── 7. Try multiple threshold levels ──
    const thresholds = [
      { value: p75,                    label: 'p75' },
      { value: p50 + (p75 - p50) * 0.4, label: 'p60' },
      { value: p65,                    label: 'p65' },
      { value: p50,                    label: 'p50' },
    ];

    const introCut = Math.max(5, dur * 0.08); // skip intro
    const MIN_DUR = 8;    // minimum chorus duration
    const MAX_DUR = 50;   // maximum chorus duration (choruses don't last 50s+)
    const MERGE_GAP = 3;  // merge dips shorter than 3s

    for (const { value: thresh, label } of thresholds) {
      const sections = this._extractSections(combined, thresh, N, HT, MERGE_GAP, MIN_DUR, MAX_DUR, introCut);
      if (sections.length >= 2) {
        // Best case: multiple sections — likely real choruses
        const refined = this._applyRepetitionHeuristic(sections);
        if (refined.length >= 1) {
          console.log(`[ChorusDetector] ✓ Found ${refined.length} chorus(es) at threshold ${label}=${thresh.toFixed(3)}`);
          return this._finalize(refined, dur);
        }
      } else if (sections.length === 1) {
        // Single section — acceptable if well-formed
        const s = sections[0];
        const d = s.endTime - s.startTime;
        if (d >= 10 && d <= 45) {
          console.log(`[ChorusDetector] ✓ Found 1 chorus at threshold ${label}=${thresh.toFixed(3)}: ${s.startTime.toFixed(1)}s–${s.endTime.toFixed(1)}s (${d.toFixed(1)}s)`);
          return this._finalize(sections, dur);
        }
        // Single section but weird duration — try lower threshold
        console.log(`[ChorusDetector] 1 section at ${label} but duration ${(s.endTime - s.startTime).toFixed(1)}s is suspicious, trying lower threshold`);
      }
    }

    // ── 8. Last resort: find the 2 loudest peaks ──
    console.log('[ChorusDetector] Standard thresholds failed — using peak detection');
    const peaks = this._findTopEnergyPeaks(combined, N, HT, introCut, MIN_DUR, MAX_DUR, 2);
    if (peaks.length >= 1) {
      console.log(`[ChorusDetector] ✓ Peak detection found ${peaks.length} section(s)`);
      return this._finalize(peaks, dur);
    }

    console.log('[ChorusDetector] No chorus sections detected');
    return [];
  }

  /**
   * Extract sustained above-threshold regions from a signal.
   */
  static _extractSections(signal, threshold, N, HT, mergeGap, minDur, maxDur, introCut) {
    const raw = [];
    let active = false, secStart = 0, secSum = 0, secCnt = 0;

    for (let w = 0; w < N; w++) {
      const t = w * HT;
      const above = signal[w] >= threshold;

      if (above) {
        if (!active) { active = true; secStart = t; secSum = 0; secCnt = 0; }
        secSum += signal[w];
        secCnt++;
      } else if (active) {
        // Calculate gap from last above-threshold window
        const lastT = secStart + (secCnt - 1) * HT;
        const gap = t - lastT;
        if (gap < mergeGap) {
          // Small dip — extend section through it
          secCnt++;
          secSum += signal[w] * 0.2;
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

    // Filter by duration and position
    const filtered = raw.filter(s => {
      const d = s.endTime - s.startTime;
      return d >= minDur && d <= maxDur && s.startTime > introCut;
    });

    console.log(`[ChorusDetector] _extractSections: threshold=${threshold.toFixed(3)}, raw=${raw.length} [${raw.map(s => (s.endTime - s.startTime).toFixed(1) + 's').join(', ')}], filtered=${filtered.length}`);

    return filtered;
  }

  /**
   * Apply repetition heuristic: keep sections that form a consistent group.
   * Choruses repeat with similar duration, so we look for a cluster.
   */
  static _applyRepetitionHeuristic(sections) {
    if (sections.length <= 1) return sections;

    // Sort by duration
    const byDur = [...sections].sort((a, b) => (a.endTime - a.startTime) - (b.endTime - b.startTime));
    const durs = byDur.map(s => s.endTime - s.startTime);
    const medianDur = durs[Math.floor(durs.length / 2)];

    // Keep sections within 60% of median duration
    const tolerance = 0.6;
    const cluster = byDur.filter(s => {
      const d = s.endTime - s.startTime;
      return d >= medianDur * (1 - tolerance) && d <= medianDur * (1 + tolerance);
    });

    if (cluster.length >= 2) {
      console.log(`[ChorusDetector] Repetition cluster: ${cluster.length} sections, median duration ${medianDur.toFixed(1)}s`);
      return cluster.sort((a, b) => a.startTime - b.startTime);
    }

    // No good cluster — keep top 2 by average intensity
    sections.sort((a, b) => b.avg - a.avg);
    const best = sections.slice(0, Math.min(2, sections.length));
    console.log(`[ChorusDetector] No repetition cluster — keeping top ${best.length} by intensity`);
    return best.sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * Find the top N energy peaks using a sliding maximum window approach.
   * This is the last-resort fallback.
   */
  static _findTopEnergyPeaks(signal, N, HT, introCut, minDur, maxDur, maxCount) {
    // Find the window with maximum energy
    const introW = Math.floor(introCut / HT);

    // Compute rolling maximum over 8s windows to find peak regions
    const WIN = Math.floor(8 / HT); // 8s peak window
    const peaks = [];

    // Skip intro
    for (let w = introW; w < N - WIN; w += Math.floor(WIN / 2)) {
      let sum = 0;
      for (let s = w; s < Math.min(w + WIN, N); s++) sum += signal[s];
      peaks.push({
        startTime: w * HT,
        endTime: Math.min(w + WIN, N) * HT,
        avg: sum / WIN,
        center: (w + WIN / 2) * HT
      });
    }

    // Sort by average energy, take top candidates
    peaks.sort((a, b) => b.avg - a.avg);

    // Pick non-overlapping top peaks
    const result = [];
    for (const p of peaks) {
      if (result.length >= maxCount) break;

      // Check overlap with already-selected peaks (must be at least 15s apart)
      const overlaps = result.some(r =>
        p.startTime < r.endTime + 10 && p.endTime > r.startTime - 10
      );
      if (!overlaps) {
        // Expand the peak window to find the actual chorus boundaries
        const expanded = this._expandPeak(signal, p, N, HT, minDur, maxDur);
        if (expanded) result.push(expanded);
      }
    }

    return result;
  }

  /**
   * Expand a peak window outward to find natural boundaries (where signal drops).
   */
  static _expandPeak(signal, peak, N, HT, minDur, maxDur) {
    const center = peak.center;
    const threshold = peak.avg * 0.7; // 70% of peak energy

    // Expand left
    let left = Math.floor(peak.startTime / HT);
    while (left > 0 && (left * HT) > peak.startTime - 15) {
      left--;
      if (signal[left] < threshold * 0.5) break;
    }

    // Expand right
    let right = Math.min(N - 1, Math.floor(peak.endTime / HT));
    while (right < N - 1 && (right * HT) < peak.endTime + 15) {
      right++;
      if (signal[right] < threshold * 0.5) break;
    }

    const startTime = left * HT;
    const endTime = right * HT;
    const d = endTime - startTime;

    if (d < minDur) {
      // Pad to minimum duration
      const pad = (minDur - d) / 2;
      return { startTime: Math.max(0, startTime - pad), endTime: endTime + pad, avg: peak.avg };
    }
    if (d > maxDur) {
      // Clamp to maximum duration, centered on peak
      const excess = d - maxDur;
      return { startTime: startTime + excess / 2, endTime: endTime - excess / 2, avg: peak.avg };
    }

    return { startTime, endTime, avg: peak.avg };
  }

  /**
   * Finalize sections: sort by time, add padding, clamp to song duration.
   */
  static _finalize(sections, dur) {
    const PAD = 0.5;
    sections.sort((a, b) => a.startTime - b.startTime);

    const result = sections.map(s => ({
      startTime: Math.max(0, s.startTime - PAD),
      endTime: Math.min(dur, s.endTime + PAD),
    }));

    console.log(`[RHYMIX] 🎵 Auto-detected ${result.length} chorus section(s): ${result.map(s => s.startTime.toFixed(1) + 's–' + s.endTime.toFixed(1) + 's').join(', ')}`);
    return result;
  }
}
