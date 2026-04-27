/**
 * KickDrumDetector — Offline analysis of an AudioBuffer to detect kick drum (бочка) hit positions.
 *
 * This runs ONCE before the map starts and returns an array of time points.
 * No real-time analysis is performed.
 *
 * Algorithm overview:
 *   1. Mix audio to mono
 *   2. Decimate (crude low-pass) to focus on sub-bass (20-120 Hz)
 *   3. Compute RMS energy in short windows (50 ms window, 30 ms hop)
 *   4. Compute onset function — rapid energy INCREASES
 *   5. Peak-pick onsets with ≥ 100 ms minimum spacing
 *   6. Adaptive threshold based on the song's energy distribution
 *   7. Return array of time positions (seconds)
 */
export default class KickDrumDetector {
  /* ------------------------------------------------------------------ */
  /*  Public API                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Detect kick drum hit times from an audio buffer.
   * @param {AudioBuffer} audioBuffer - The decoded audio buffer
   * @returns {number[]} Array of time positions (seconds) where kicks were detected
   */
  static detect(audioBuffer) {
    // ---- Guard clauses ------------------------------------------------
    if (!audioBuffer) return [];
    if (audioBuffer.length < 1) return [];

    const sampleRate = audioBuffer.sampleRate;
    const duration = audioBuffer.duration;

    // Skip analysis if too short (< 10 s)
    if (duration < 10) return [];

    // ---- 1. Mix to mono -----------------------------------------------
    const mono = KickDrumDetector._mixToMono(audioBuffer);

    // ---- 2. Crude low-pass via decimation -----------------------------
    // Target: keep frequencies below ~150 Hz to isolate kick sub-bass.
    // Decimate by a factor that keeps Nyquist above 150 Hz.
    // Decimation factor D = floor(sampleRate / 300)  (Nyquist = SR/D ≈ 150+ Hz)
    const decimationFactor = Math.max(1, Math.floor(sampleRate / 300));
    const decimated = KickDrumDetector._decimate(mono, decimationFactor);
    const decimatedRate = sampleRate / decimationFactor;

    // ---- 3. RMS energy in short windows --------------------------------
    const windowSize = Math.round(0.050 * decimatedRate); // 50 ms
    const hopSize    = Math.round(0.030 * decimatedRate); // 30 ms
    const energy = KickDrumDetector._computeRmsEnergy(decimated, windowSize, hopSize);

    // ---- 4. Onset detection — energy rises -----------------------------
    const onset = KickDrumDetector._onsetFunction(energy);

    // ---- 5 & 6. Peak-pick with adaptive threshold ----------------------
    const hopDuration = hopSize / decimatedRate; // seconds per onset frame
    const minSpacingFrames = Math.ceil(0.100 / hopDuration); // 100 ms minimum
    const kicks = KickDrumDetector._peakPick(onset, minSpacingFrames, hopDuration);

    return kicks;
  }

  /* ------------------------------------------------------------------ */
  /*  Internal helpers                                                   */
  /* ------------------------------------------------------------------ */

  /**
   * Mix all channels of the AudioBuffer into a single mono Float32Array.
   * @param {AudioBuffer} audioBuffer
   * @returns {Float32Array}
   */
  static _mixToMono(audioBuffer) {
    const length = audioBuffer.length;
    const numChannels = audioBuffer.numberOfChannels;

    if (numChannels === 1) {
      // Fast path — just copy
      return new Float32Array(audioBuffer.getChannelData(0));
    }

    const mono = new Float32Array(length);
    const scale = 1.0 / numChannels;

    for (let ch = 0; ch < numChannels; ch++) {
      const channelData = audioBuffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        mono[i] += channelData[i] * scale;
      }
    }
    return mono;
  }

  /**
   * Decimate a signal by averaging blocks of `factor` consecutive samples.
   * This acts as a crude low-pass filter that suppresses high-frequency content.
   *
   * @param {Float32Array} signal
   * @param {number} factor - Decimation factor (≥ 1)
   * @returns {Float32Array}
   */
  static _decimate(signal, factor) {
    if (factor <= 1) return new Float32Array(signal);

    const outLength = Math.floor(signal.length / factor);
    const out = new Float32Array(outLength);
    const invFactor = 1.0 / factor;

    for (let i = 0; i < outLength; i++) {
      let sum = 0.0;
      const base = i * factor;
      for (let j = 0; j < factor; j++) {
        sum += signal[base + j];
      }
      out[i] = sum * invFactor;
    }
    return out;
  }

  /**
   * Compute RMS energy in short overlapping windows.
   *
   * @param {Float32Array} signal
   * @param {number} windowSize - Samples per window
   * @param {number} hopSize    - Samples between successive windows
   * @returns {Float32Array} energy array (one value per hop)
   */
  static _computeRmsEnergy(signal, windowSize, hopSize) {
    const numFrames = Math.floor((signal.length - windowSize) / hopSize) + 1;
    if (numFrames <= 0) return new Float32Array(0);

    const energy = new Float32Array(numFrames);
    const invWin = 1.0 / windowSize;

    for (let f = 0; f < numFrames; f++) {
      const offset = f * hopSize;
      let sumSq = 0.0;
      for (let i = 0; i < windowSize; i++) {
        const s = signal[offset + i];
        sumSq += s * s;
      }
      energy[f] = Math.sqrt(sumSq * invWin);
    }
    return energy;
  }

  /**
   * Compute onset strength function from energy curve.
   * We look for rapid energy INCREASES (first-order positive difference),
   * half-wave rectified (ignore decreases).
   *
   * @param {Float32Array} energy
   * @returns {Float32Array} onset strength (same length as energy)
   */
  static _onsetFunction(energy) {
    const len = energy.length;
    const onset = new Float32Array(len);

    if (len === 0) return onset;

    // First frame has no previous value
    onset[0] = 0.0;

    for (let i = 1; i < len; i++) {
      const diff = energy[i] - energy[i - 1];
      // Half-wave rectify: only keep increases
      onset[i] = diff > 0 ? diff : 0.0;
    }
    return onset;
  }

  /**
   * Peak-pick onsets with adaptive threshold and minimum spacing.
   *
   * Adaptive threshold:
   *   - Compute the median of all non-zero onset values
   *   - Threshold = median * multiplier  (multiplier tuned to ~1.4)
   *   - This adapts to each song's overall kick energy profile
   *
   * @param {Float32Array} onset
   * @param {number} minSpacingFrames - Minimum frames between detected peaks
   * @param {number} hopDuration     - Duration of one hop frame in seconds
   * @returns {number[]} Array of kick hit times in seconds
   */
  static _peakPick(onset, minSpacingFrames, hopDuration) {
    const len = onset.length;
    if (len === 0) return [];

    // ---- Adaptive threshold based on median of non-zero values ---------
    const nonZero = [];
    for (let i = 0; i < len; i++) {
      if (onset[i] > 0) nonZero.push(onset[i]);
    }

    if (nonZero.length === 0) return [];

    nonZero.sort((a, b) => a - b);
    const median = nonZero[Math.floor(nonZero.length * 0.5)];

    // Multiplier tuned so that only the most prominent kicks pass.
    // A value of 1.4 works well for most popular music: it's above the
    // "average" onset but below the strongest transients.
    const multiplier = 1.4;
    const threshold = median * multiplier;

    // ---- Peak picking with minimum spacing -----------------------------
    const kicks = [];
    let lastPickedFrame = -minSpacingFrames - 1; // ensure first hit can be picked

    // We scan with a sliding window to find local maxima
    const localWindow = Math.max(1, Math.floor(minSpacingFrames / 2));

    for (let i = localWindow; i < len - localWindow; i++) {
      if (onset[i] < threshold) continue;

      // Check if this is a local maximum within the window
      let isLocalMax = true;
      for (let j = i - localWindow; j <= i + localWindow; j++) {
        if (j === i) continue;
        if (onset[j] > onset[i]) {
          isLocalMax = false;
          break;
        }
      }
      if (!isLocalMax) continue;

      // Enforce minimum spacing
      if (i - lastPickedFrame < minSpacingFrames) continue;

      kicks.push(i * hopDuration);
      lastPickedFrame = i;
    }

    return kicks;
  }
}
