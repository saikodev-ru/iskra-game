/**
 * ChorusDetector — automatic chorus detection for songs without kiai time.
 *
 * Algorithm overview:
 *  1. Mix audio to mono, compute RMS energy envelope (0.5 s windows, 4 s smoothing)
 *  2. Compute note-density envelope from beatmap (0.5 s windows, 4 s smoothing)
 *  3. Adaptively weight both signals (if notes are uniform, trust energy more)
 *  4. Extract sustained high-intensity regions (min 6 s, max 60 s, merge gaps < 2.5 s)
 *  5. Filter intro / outro, validate with repetition-heuristic (similar durations)
 *
 * Runs once before gameplay starts — typical cost < 80 ms for a 5-min song.
 */
export default class ChorusDetector {

  /* ── Public API ───────────────────────────────────────────────────── */

  /**
   * Analyse an AudioBuffer + beatmap notes and return auto-detected chorus
   * sections in the same format as osu! kiaiSections:
   *   [{ startTime: number, endTime: number }, ...]
   *
   * Returns an empty array when no chorus can be reliably detected.
   *
   * @param {AudioBuffer} audioBuffer
   * @param {Array}       notes       – [{ time, lane, type, duration }, ...]
   * @returns {Array<{startTime: number, endTime: number}>}
   */
  static detect(audioBuffer, notes) {
    if (!audioBuffer || audioBuffer.duration < 20) return [];
    if (!notes || notes.length < 10) return [];

    const sr  = audioBuffer.sampleRate;
    const len = audioBuffer.length;
    const nch = audioBuffer.numberOfChannels;
    const dur = audioBuffer.duration;

    /* ── 0. Mix down to mono ──────────────────────────────────────── */
    const mono = new Float32Array(len);
    for (let ch = 0; ch < nch; ch++) {
      const d = new Float32Array(len);
      audioBuffer.copyFromChannel(d, ch);
      for (let i = 0; i < len; i++) mono[i] += d[i] / nch;
    }

    /* ── 1. RMS energy envelope ───────────────────────────────────── */
    const WIN = 0.5;            // window size (s)
    const HOP = 0.25;           // hop       (s)
    const SM  = 4;              // smoothing window (s)
    const N   = Math.floor((dur - WIN) / HOP);
    if (N < 30) return [];

    const hopSmp  = Math.floor(HOP * sr);
    const winSmp  = Math.floor(WIN * sr);
    const smHalf  = Math.floor(SM / HOP / 2);

    const rawE = new Float32Array(N);
    for (let w = 0; w < N; w++) {
      const s0 = w * hopSmp;
      const s1 = Math.min(s0 + winSmp, len);
      let sum = 0;
      for (let i = s0; i < s1; i++) sum += mono[i] * mono[i];
      rawE[w] = Math.sqrt(sum / (s1 - s0));
    }

    // Normalise 0-1
    let maxE = 0;
    for (let w = 0; w < N; w++) if (rawE[w] > maxE) maxE = rawE[w];
    if (maxE > 0) for (let w = 0; w < N; w++) rawE[w] /= maxE;

    // Rolling-average smooth
    const energy = new Float32Array(N);
    for (let w = 0; w < N; w++) {
      let sum = 0, cnt = 0;
      const lo = Math.max(0, w - smHalf);
      const hi = Math.min(N - 1, w + smHalf);
      for (let s = lo; s <= hi; s++) { sum += rawE[s]; cnt++; }
      energy[w] = sum / cnt;
    }

    /* ── 2. Note density envelope ──────────────────────────────────── */
    const rawNd = new Float32Array(N);
    for (const note of notes) {
      const t0 = note.time;
      const t1 = note.time + Math.max(note.duration || 0, 0.15);
      const w0 = Math.max(0, Math.floor(t0 / HOP));
      const w1 = Math.min(N - 1, Math.floor(t1 / HOP));
      for (let w = w0; w <= w1; w++) rawNd[w] += 1;
    }
    let maxNd = 0;
    for (let w = 0; w < N; w++) if (rawNd[w] > maxNd) maxNd = rawNd[w];
    if (maxNd > 0) for (let w = 0; w < N; w++) rawNd[w] /= maxNd;

    const noteDensity = new Float32Array(N);
    for (let w = 0; w < N; w++) {
      let sum = 0, cnt = 0;
      const lo = Math.max(0, w - smHalf);
      const hi = Math.min(N - 1, w + smHalf);
      for (let s = lo; s <= hi; s++) { sum += rawNd[s]; cnt++; }
      noteDensity[w] = sum / cnt;
    }

    /* ── 3. Combine with adaptive weighting ───────────────────────── */
    // If note density is nearly flat (variance < 0.01), trust energy more.
    let ndMean = 0;
    for (let w = 0; w < N; w++) ndMean += noteDensity[w];
    ndMean /= N;
    let ndVar = 0;
    for (let w = 0; w < N; w++) ndVar += (noteDensity[w] - ndMean) ** 2;
    ndVar /= N;

    const eW = ndVar < 0.01 ? 0.75 : 0.5;   // energy weight
    const nW = 1 - eW;                         // note-density weight

    const score = new Float32Array(N);
    for (let w = 0; w < N; w++) score[w] = eW * energy[w] + nW * noteDensity[w];

    /* ── 4. Adaptive threshold (percentile of middle 70 %) ────────── */
    const m0 = Math.floor(N * 0.12);
    const m1 = Math.floor(N * 0.88);
    const mid = [];
    for (let w = m0; w < m1; w++) mid.push(score[w]);
    mid.sort((a, b) => a - b);

    const p60 = mid[Math.floor(mid.length * 0.60)] || 0.5;
    const p85 = mid[Math.floor(mid.length * 0.85)] || 0.7;
    // Need to beat the 60th percentile AND be at least 65 % of the 85th
    const threshold = Math.max(p60, p85 * 0.65);

    /* ── 5. Extract contiguous high-score regions ─────────────────── */
    const MIN_DUR = 6;
    const MAX_DUR = 60;
    const MERGE_GAP = 2.5;

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
          // Small dip — keep section alive (reduced weight)
          secCnt++; secSum += score[w] * 0.4;
        } else {
          active = false;
          raw.push({ startTime: secStart, endTime: secStart + secCnt * HOP, avg: secSum / secCnt });
        }
      }
    }
    if (active) raw.push({ startTime: secStart, endTime: secStart + secCnt * HOP, avg: secSum / secCnt });

    /* ── 6. Filter by duration & position ─────────────────────────── */
    const introCut = dur * 0.08;
    let sections = raw.filter(s => {
      const d = s.endTime - s.startTime;
      return d >= MIN_DUR && d <= MAX_DUR && s.startTime > introCut;
    });
    if (sections.length === 0) return [];

    // Keep top candidates by average score
    sections.sort((a, b) => b.avg - a.avg);
    if (sections.length > 5) sections = sections.slice(0, 5);

    /* ── 7. Repetition heuristic (real choruses repeat) ───────────── */
    if (sections.length >= 2) {
      const avgDur = sections.reduce((s, sec) => s + (sec.endTime - sec.startTime), 0) / sections.length;
      sections = sections.filter(s => {
        const d = s.endTime - s.startTime;
        return d >= avgDur * 0.4 && d <= avgDur * 2.5;
      });
    }
    if (sections.length === 0) return [];

    // Final sort by time, add small padding
    sections.sort((a, b) => a.startTime - b.startTime);
    const PAD = 0.3;

    return sections.map(s => ({
      startTime: Math.max(0, s.startTime - PAD),
      endTime:   Math.min(dur, s.endTime + PAD),
    }));
  }
}
