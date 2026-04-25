/**
 * ColorExtractor — extracts 4 beautiful accent colors from an image.
 * Uses a smart algorithm:
 *   1. Sample pixels from the image at strategic regions
 *   2. Cluster colors using k-means (k=8)
 *   3. Filter out near-black, near-white, and low-saturation colors
 *   4. Sort remaining by saturation + brightness (most vivid first)
 *   5. Pick 4 that are maximally spread on the hue wheel for contrast
 *   6. Boost saturation slightly for punchier note colors
 */

const DEFAULT_COLORS = ['#CCFF33', '#FFD700', '#FF3355', '#BF5FFF'];

export default class ColorExtractor {
  /**
   * Extract 4 accent colors from an image element.
   * Falls back to DEFAULT_COLORS if extraction fails.
   * @param {HTMLImageElement} img
   * @returns {string[]} array of 4 hex color strings
   */
  static extract(img) {
    try {
      if (!img || !img.naturalWidth || !img.naturalHeight) return DEFAULT_COLORS;

      // Downscale for speed — sample at most 100x100
      const maxDim = 100;
      const scale = Math.min(maxDim / img.naturalWidth, maxDim / img.naturalHeight, 1);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      const imageData = ctx.getImageData(0, 0, w, h);
      const pixels = imageData.data;

      // Sample every 2nd pixel for speed (skip alpha=0)
      const samples = [];
      for (let i = 0; i < pixels.length; i += 8) { // step 8 = every 2nd pixel
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const a = pixels[i + 3];
        if (a < 128) continue;

        // Skip very dark or very bright
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum < 20 || lum > 240) continue;

        samples.push([r, g, b]);
      }

      if (samples.length < 20) return DEFAULT_COLORS;

      // K-means clustering (k=8)
      const clusters = ColorExtractor._kMeans(samples, 8, 12);

      // Filter and score clusters
      const scored = clusters
        .map(c => ({
          color: c.center,
          hsl: ColorExtractor._rgbToHsl(c.center[0], c.center[1], c.center[2]),
          weight: c.count
        }))
        .filter(c => {
          const { h, s, l } = c.hsl;
          // Must have some saturation and reasonable lightness
          return s > 0.12 && l > 0.15 && l < 0.85;
        })
        .sort((a, b) => {
          // Score by: vividness (saturation) + brightness + cluster weight
          const scoreA = a.hsl.s * 1.5 + a.hsl.l * 0.5 + Math.log(a.weight + 1) * 0.1;
          const scoreB = b.hsl.s * 1.5 + b.hsl.l * 0.5 + Math.log(b.weight + 1) * 0.1;
          return scoreB - scoreA;
        });

      if (scored.length < 4) return DEFAULT_COLORS;

      // Pick 4 colors that are maximally spread on the hue wheel
      const selected = ColorExtractor._maxHueSpread(scored.slice(0, Math.min(scored.length, 10)), 4);

      // Boost saturation and convert to hex
      return selected.map(c => {
        const { h, s, l } = c.hsl;
        // Boost saturation by 20%, cap at 1
        const newS = Math.min(1, s * 1.2 + 0.05);
        // Keep lightness in a good range for visibility
        const newL = Math.max(0.45, Math.min(0.65, l));
        const rgb = ColorExtractor._hslToRgb(h, newS, newL);
        return ColorExtractor._rgbToHex(rgb[0], rgb[1], rgb[2]);
      });
    } catch (e) {
      console.warn('[ColorExtractor] Failed:', e);
      return DEFAULT_COLORS;
    }
  }

  /**
   * K-means clustering in RGB space.
   * @param {number[][]} points — [[r,g,b], ...]
   * @param {number} k — number of clusters
   * @param {number} iterations
   * @returns {{center: number[], count: number}[]}
   */
  static _kMeans(points, k, iterations) {
    // Initialize centers using k-means++ style
    const centers = [points[Math.floor(Math.random() * points.length)].slice()];
    for (let c = 1; c < k; c++) {
      // Pick the point farthest from its nearest center
      let maxDist = -1;
      let bestPoint = null;
      const step = Math.max(1, Math.floor(points.length / 200)); // subsample for speed
      for (let i = 0; i < points.length; i += step) {
        let minD = Infinity;
        for (const center of centers) {
          const dr = points[i][0] - center[0];
          const dg = points[i][1] - center[1];
          const db = points[i][2] - center[2];
          minD = Math.min(minD, dr * dr + dg * dg + db * db);
        }
        if (minD > maxDist) {
          maxDist = minD;
          bestPoint = points[i];
        }
      }
      if (bestPoint) centers.push(bestPoint.slice());
    }

    // Iterate
    const assignments = new Int32Array(points.length);
    const counts = new Float64Array(k);
    const sums = Array.from({ length: k }, () => [0, 0, 0]);

    for (let iter = 0; iter < iterations; iter++) {
      // Assign points to nearest center
      for (let i = 0; i < points.length; i++) {
        let minD = Infinity;
        let bestC = 0;
        for (let c = 0; c < k; c++) {
          const dr = points[i][0] - centers[c][0];
          const dg = points[i][1] - centers[c][1];
          const db = points[i][2] - centers[c][2];
          const d = dr * dr + dg * dg + db * db;
          if (d < minD) { minD = d; bestC = c; }
        }
        assignments[i] = bestC;
      }

      // Recompute centers
      counts.fill(0);
      for (const s of sums) { s[0] = 0; s[1] = 0; s[2] = 0; }

      for (let i = 0; i < points.length; i++) {
        const c = assignments[i];
        counts[c]++;
        sums[c][0] += points[i][0];
        sums[c][1] += points[i][1];
        sums[c][2] += points[i][2];
      }

      for (let c = 0; c < k; c++) {
        if (counts[c] > 0) {
          centers[c][0] = sums[c][0] / counts[c];
          centers[c][1] = sums[c][1] / counts[c];
          centers[c][2] = sums[c][2] / counts[c];
        }
      }
    }

    // Build result
    const result = [];
    const finalCounts = new Float64Array(k);
    for (let i = 0; i < points.length; i++) finalCounts[assignments[i]]++;
    for (let c = 0; c < k; c++) {
      if (finalCounts[c] > 0) {
        result.push({ center: centers[c].map(Math.round), count: finalCounts[c] });
      }
    }
    return result;
  }

  /**
   * Greedy selection: pick k colors that are maximally spread on the hue wheel.
   */
  static _maxHueSpread(candidates, k) {
    if (candidates.length <= k) return candidates;

    // Start with the most vivid one
    const selected = [candidates[0]];

    while (selected.length < k) {
      let bestIdx = -1;
      let bestMinDist = -1;

      for (let i = 0; i < candidates.length; i++) {
        if (selected.includes(candidates[i])) continue;

        // Find minimum angular distance to any selected color
        const hue = candidates[i].hsl.h;
        let minDist = Infinity;
        for (const s of selected) {
          let diff = Math.abs(hue - s.hsl.h);
          if (diff > 0.5) diff = 1 - diff; // wrap around
          minDist = Math.min(minDist, diff);
        }

        if (minDist > bestMinDist) {
          bestMinDist = minDist;
          bestIdx = i;
        }
      }

      if (bestIdx >= 0) selected.push(candidates[bestIdx]);
      else break;
    }

    // Sort by hue for consistent lane assignment
    selected.sort((a, b) => a.hsl.h - b.hsl.h);
    return selected;
  }

  // ── Color conversions ──

  static _rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return { h, s, l };
  }

  static _hslToRgb(h, s, l) {
    if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [
      Math.round(hue2rgb(p, q, h + 1/3) * 255),
      Math.round(hue2rgb(p, q, h) * 255),
      Math.round(hue2rgb(p, q, h - 1/3) * 255)
    ];
  }

  static _rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
  }
}

export { DEFAULT_COLORS };
