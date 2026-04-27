/**
 * TransitionFX — TV static / glitch screen transition effect
 *
 * Creates a full-viewport overlay canvas that renders authentic
 * TV static noise with horizontal glitch lines, color channel split,
 * scan lines, and a VHS-style tracking distortion.
 *
 * Usage:
 *   await TransitionFX.play({ duration: 800, color: '#AAFF00' });
 *   // screen switch happens at the midpoint
 */

export class TransitionFX {
  /** @type {HTMLCanvasElement|null} */
  static _canvas = null;
  static _ctx = null;
  static _animId = null;
  static _active = false;

  /** Lazily create the overlay canvas (z-index 4, between HUD and screen) */
  static _ensure() {
    if (TransitionFX._canvas) return;
    const c = document.createElement('canvas');
    c.id = 'tv-static-overlay';
    c.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:4;pointer-events:none;opacity:0;transition:opacity 0.08s;';
    document.body.appendChild(c);
    TransitionFX._canvas = c;
    TransitionFX._ctx = c.getContext('2d');
  }

  static _resize() {
    const c = TransitionFX._canvas;
    if (!c) return;
    // Use a lower resolution for authentic chunky noise
    const scale = 0.35;
    c.width = Math.round(window.innerWidth * scale);
    c.height = Math.round(window.innerHeight * scale);
    TransitionFX._ctx.imageSmoothingEnabled = false;
  }

  /**
   * Play a TV static transition.
   * @param {Object} opts
   * @param {number} opts.duration — total duration in ms (default 800)
   * @param {string} opts.color — accent color hex (default '#AAFF00')
   * @param {number} opts.splitCount — how many horizontal glitch lines (default 12)
   * @returns {Promise<void>}
   */
  static play(opts = {}) {
    if (TransitionFX._active) return Promise.resolve();
    return new Promise((resolve) => {
      TransitionFX._ensure();
      TransitionFX._resize();
      TransitionFX._active = true;

      const c = TransitionFX._canvas;
      const ctx = TransitionFX._ctx;
      const w = c.width, h = c.height;
      const duration = opts.duration || 800;
      const splitCount = opts.splitCount || 12;
      const startTime = performance.now();

      // Parse accent color
      const accent = opts.color || '#AAFF00';
      const ar = parseInt(accent.slice(1, 3), 16);
      const ag = parseInt(accent.slice(3, 5), 16);
      const ab = parseInt(accent.slice(5, 7), 16);

      // Pre-generate noise ImageData buffer for performance
      const imgData = ctx.createImageData(w, h);
      const buf = imgData.data;

      // Glitch state — updated each frame
      let glitchLines = [];
      let glitchPhase = 0;

      const _genGlitchLines = () => {
        glitchLines = [];
        const count = splitCount + Math.floor(Math.random() * 8);
        for (let i = 0; i < count; i++) {
          glitchLines.push({
            y: Math.floor(Math.random() * h),
            h: 1 + Math.floor(Math.random() * 6),
            offset: (Math.random() - 0.5) * w * 0.12,
            brightness: 0.3 + Math.random() * 0.7,
          });
        }
      };

      const animate = (now) => {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / duration);

        // Phase curve: fast attack, slow middle, fast exit
        // 0.0→0.15: fade in, 0.15→0.45: full static, 0.45→0.55: peak glitch, 0.55→0.85: full static, 0.85→1.0: fade out
        let opacity;
        if (t < 0.12) {
          opacity = t / 0.12; // fade in
        } else if (t < 0.5) {
          opacity = 1; // full
        } else if (t < 0.88) {
          opacity = 1; // full
        } else {
          opacity = 1 - (t - 0.88) / 0.12; // fade out
        }
        c.style.opacity = String(Math.max(0, Math.min(1, opacity)));

        // Regenerate glitch lines periodically
        glitchPhase++;
        if (glitchPhase % 3 === 0) _genGlitchLines();

        // === Render noise ===
        // Fill with random grayscale noise
        const noiseIntensity = 0.6 + Math.sin(t * Math.PI) * 0.4;
        for (let i = 0; i < buf.length; i += 4) {
          const v = Math.random() * 255;
          buf[i] = v * noiseIntensity;
          buf[i + 1] = v * noiseIntensity;
          buf[i + 2] = v * noiseIntensity;
          buf[i + 3] = 255;
        }

        // Apply glitch line offsets — shift horizontal bands
        for (const line of glitchLines) {
          const lineOpacity = line.brightness * (0.5 + Math.random() * 0.5);
          for (let row = line.y; row < Math.min(h, line.y + line.h); row++) {
            for (let col = 0; col < w; col++) {
              const srcCol = Math.floor(col + line.offset + w) % w;
              const srcIdx = (row * w + srcCol) * 4;
              const dstIdx = (row * w + col) * 4;
              // Tint towards accent color for some lines
              if (Math.random() < 0.3) {
                buf[dstIdx] = buf[srcIdx] * 0.5 + ar * lineOpacity * 0.5;
                buf[dstIdx + 1] = buf[srcIdx + 1] * 0.5 + ag * lineOpacity * 0.5;
                buf[dstIdx + 2] = buf[srcIdx + 2] * 0.5 + ab * lineOpacity * 0.5;
              } else {
                buf[dstIdx] = buf[srcIdx];
                buf[dstIdx + 1] = buf[srcIdx + 1];
                buf[dstIdx + 2] = buf[srcIdx + 2];
              }
            }
          }
        }

        // Color channel split (RGB offset)
        const splitAmt = Math.floor(2 + Math.random() * 3);
        // Shift red channel left
        for (let row = 0; row < h; row++) {
          for (let col = 0; col < w - splitAmt; col++) {
            const dstIdx = (row * w + col) * 4;
            const srcIdx = (row * w + col + splitAmt) * 4;
            buf[dstIdx] = buf[srcIdx]; // R from right
          }
        }
        // Shift blue channel right
        for (let row = 0; row < h; row++) {
          for (let col = splitAmt; col < w; col++) {
            const dstIdx = (row * w + col) * 4;
            const srcIdx = (row * w + col - splitAmt) * 4;
            buf[dstIdx + 2] = buf[srcIdx + 2]; // B from left
          }
        }

        // Scan lines overlay
        for (let row = 0; row < h; row += 2) {
          for (let col = 0; col < w; col++) {
            const idx = (row * w + col) * 4;
            buf[idx] = buf[idx] * 0.7;
            buf[idx + 1] = buf[idx + 1] * 0.7;
            buf[idx + 2] = buf[idx + 2] * 0.7;
          }
        }

        // VHS tracking distortion — bright horizontal bar sweeping
        if (t > 0.1 && t < 0.9) {
          const trackY = Math.floor(((elapsed * 0.3) % 1) * (h + 40)) - 20;
          for (let row = Math.max(0, trackY); row < Math.min(h, trackY + 6); row++) {
            for (let col = 0; col < w; col++) {
              const idx = (row * w + col) * 4;
              const boost = 1.5 + Math.random() * 0.5;
              buf[idx] = Math.min(255, buf[idx] * boost);
              buf[idx + 1] = Math.min(255, buf[idx + 1] * boost);
              buf[idx + 2] = Math.min(255, buf[idx + 2] * boost);
            }
          }
        }

        ctx.putImageData(imgData, 0, 0);

        if (t < 1) {
          TransitionFX._animId = requestAnimationFrame(animate);
        } else {
          c.style.opacity = '0';
          TransitionFX._active = false;
          resolve();
        }
      };

      c.style.opacity = '0';
      TransitionFX._animId = requestAnimationFrame(animate);
    });
  }

  /** Stop any running transition */
  static stop() {
    if (TransitionFX._animId) {
      cancelAnimationFrame(TransitionFX._animId);
      TransitionFX._animId = null;
    }
    if (TransitionFX._canvas) {
      TransitionFX._canvas.style.opacity = '0';
    }
    TransitionFX._active = false;
  }
}
