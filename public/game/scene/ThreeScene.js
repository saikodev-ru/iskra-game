import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import EventBus from '../core/EventBus.js';

// Global registry to prevent duplicate WebGL contexts
if (!window.__threeSceneInstances) window.__threeSceneInstances = [];

export default class ThreeScene {
  constructor(canvas) {
    this.canvas = canvas;
    this._beatIntensity = 0;
    this._beatPulse = 0;
    this._bloomBase = 0.18;
    this._bloomTarget = 0.18;
    this._shakeFrames = [];
    this._tvGroup = null;
    this._tvScreen = null;
    this._tvScreenMaterial = null;
    this._currentTexture = null;
    this._bgMaterial = null;
    this._tvSpinAnim = null;
    this._particles = null;
    this._particlesVisible = false; // hidden by default — only shown on main menu
    this._aspectRatio = '16:9';
    this._disposed = false;
    this._contextLost = false;
    this._resizeHandler = null;
    // Audio levels for reactive glow
    this._audioLevels = { intensity: 0, bass: 0, mid: 0, high: 0 };
    this._audioEngine = null;
    // Camera animation state
    this._baseFOV = 70;
    this._fovPulse = 0;
    this._glowHue = 0;
    // Chorus/fever state — scene-level amplification
    this._chorusIntensity = 0;      // 0-1, smoothed chorus intensity from BeatMap
    this._chorusBeatPulse = 0;      // spikes on beat during chorus
    this._chorusExposure = 1.0;     // tone mapping exposure (1.0 = normal, >1 = brighter)
    // Pre-allocated color objects to avoid per-frame GC
    this._targetColor = new THREE.Color(0xAAFF00);
    this._bassTargetColor = new THREE.Color(0xAAFF00);
    // Background image for song select
    this._bgImageMesh = null;
    this._bgImageMaterial = null;
    this._bgImageTexture = null;
    this._safeArea = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
    this._graphicsPreset = 'disco'; // 'low' | 'standard' | 'disco'
    this._missFlash = 0; // red overlay flash intensity on miss (0-1, decays)
    this._particleFrame = 0;

    // Video background state
    this._videoElement = null;   // hidden HTML5 <video> element
    this._videoTexture = null;   // THREE.VideoTexture from the video
    this._videoMesh = null;      // mesh for the video plane
    this._videoMaterial = null;  // shader material for the video plane
    this._videoActive = false;   // whether video is currently playing as bg
    this._videoPaused = false;   // true when game explicitly paused video (prevents auto-resume in update)
    this._audioEngineRef = null; // for syncing video to audio time
    this._videoLoadId = 0;      // generation counter to prevent stale video loads
    this._leadInOffset = 0;     // seconds to subtract from audio time for video sync (0 for preview, 1.0 in-game)
    this._skipVideoFrame = false; // frame-skip toggle for video texture updates (performance)

    // CRT / Glitch state
    this._crtIntensity = 0;     // 0-1, CRT overlay intensity (scanlines, barrel distortion)
    this._glitchIntensity = 0;  // 0-1, glitch effect intensity (RGB split, scan disruption)
    this._glitchSeed = 0;       // random seed for glitch patterns

    // Reverse parallax — mouse tracking for background offset
    this._mouseX = 0;  // -1 to 1
    this._mouseY = 0;  // -1 to 1
    this._bgOffsetX = 0; // smoothed offset
    this._bgOffsetY = 0;
    this._parallaxIntensity = 0.15; // how far the bg shifts (world units at z=-4)
    this._cachedBgGeom = null; // cached bg plane geometry

    this._init();
    this._setupListeners();
  }

  /** Set the audio engine reference for reactive analysis */
  setAudioEngine(audioEngine) {
    this._audioEngine = audioEngine;
  }

  /** Set graphics quality preset */
  setGraphicsPreset(preset) {
    this._graphicsPreset = preset;
    if (preset === 'low') {
      this._bloomBase = 0;
      this.bloomPass.strength = 0;
    } else if (preset === 'standard') {
      this._bloomBase = 0.08;
    } else {
      this._bloomBase = 0.18;
    }
    // Toggle particles visibility based on preset
    if (this._particles) {
      this._particles.visible = this._particlesVisible && preset === 'disco';
    }
  }

  /** Returns a multiplier for effects intensity based on preset */
  _gfx() {
    if (this._graphicsPreset === 'low') return 0;
    if (this._graphicsPreset === 'standard') return 0.4;
    return 1; // disco
  }

  /** Set the safe area for background image positioning */
  setSafeArea(x, y, w, h) {
    this._safeArea = { x, y, w, h };
    this._invalidateBgGeom();
    this._resizeBackgroundImage();
  }

  _init() {
    this._disposePreviousInstances();

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.setClearColor(0x000000, 1);

    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this._contextLost = true;
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this._contextLost = false;
      this._rebuildScene();
    });

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(this._baseFOV, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 0, 5);

    // Lighting
    const ambient = new THREE.AmbientLight(0x222222, 0.6);
    this.scene.add(ambient);
    this.pointLight = new THREE.PointLight(0xAAFF00, 1.5, 50);
    this.pointLight.position.set(0, 0, 4);
    this.scene.add(this.pointLight);

    this._accentLight = new THREE.PointLight(0x00E5FF, 0.4, 30);
    this._accentLight.position.set(3, -2, 3);
    this.scene.add(this._accentLight);

    // Secondary glow light for bass reactivity
    this._bassLight = new THREE.PointLight(0xAAFF00, 0, 20);
    this._bassLight.position.set(0, 1, 6);
    this.scene.add(this._bassLight);

    this._createBackground();
    this._createParticles();

    // Post-processing
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.18, 0.3, 0.6);
    this.composer.addPass(this.bloomPass);

    this._resizeHandler = () => this.resize();
    window.addEventListener('resize', this._resizeHandler);

    // Mouse tracking for reverse parallax — throttled via rAF
    this._mouseRAF = null;
    this._mouseHandler = (e) => {
      this._mouseX = (e.clientX / window.innerWidth - 0.5) * 2;  // -1 to 1
      this._mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', this._mouseHandler);

    window.__threeSceneInstances.push(this);
  }

  _disposePreviousInstances() {
    const instances = window.__threeSceneInstances || [];
    for (const inst of instances) {
      try { inst.dispose(); } catch (_) {}
    }
    window.__threeSceneInstances.length = 0;
  }

  _rebuildScene() {
    if (this._disposed) return;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  _createBackground() {
    const vertexShader = `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `;
    const fragmentShader = `
      uniform float uTime;
      uniform float uBeatIntensity;
      uniform float uBassIntensity;
      uniform float uAudioIntensity;
      uniform float uMissFlash;
      varying vec2 vUv;
      void main() {
        vec2 uv = vUv;

        // Base dark color
        vec3 baseColor = vec3(0.02, 0.02, 0.04);
        float vig = distance(vUv, vec2(0.5));
        baseColor *= smoothstep(0.9, 0.3, vig);

        // Audio-reactive green glow from center — AMPLIFIED
        float audioPulse = uAudioIntensity;
        float bassPulse = uBassIntensity;

        // Green glow that pulses with overall audio
        vec3 audioColor = vec3(0.4, 0.7, 0.0) * audioPulse * 0.5 * smoothstep(0.85, 0.0, vig);

        // Bass-reactive deep glow
        vec3 bassColor = vec3(0.25, 0.5, 0.0) * bassPulse * 0.6 * smoothstep(0.95, 0.0, vig);

        // Beat-reactive flash — moderate punch
        vec3 beatColor = vec3(0.6, 1.0, 0.0) * uBeatIntensity * 0.4 * smoothstep(0.75, 0.0, vig);

        // Radial beat wave — concentric ring that pulses out from center on beat
        float beatWave = 0.0;
        if (uBeatIntensity > 0.05) {
          float dist = vig;
          float ring = abs(dist - (1.0 - uBeatIntensity) * 0.6);
          beatWave = smoothstep(0.08, 0.0, ring) * uBeatIntensity * 0.35;
        }
        vec3 waveColor = vec3(0.5, 0.9, 0.1) * beatWave;

        // Subtle shimmer
        float shimmer = fract(sin(dot(uv * 100.0 + uTime * 0.1, vec2(12.9898, 78.233))) * 43758.5453);
        baseColor += vec3(0.008) * shimmer;

        // Edge glow on bass
        float edge = smoothstep(0.3, 0.7, vig);
        vec3 edgeColor = vec3(0.15, 0.35, 0.0) * bassPulse * edge * 0.35;

        vec3 color = baseColor + audioColor + bassColor + beatColor + waveColor + edgeColor;

        // Miss flash — brief red overlay tint, stronger at edges
        float missVig = smoothstep(0.2, 0.9, vig);
        color += vec3(1.0, 0.1, 0.05) * uMissFlash * (0.6 + 0.4 * missVig);

        gl_FragColor = vec4(color, 1.0);
      }
    `;
    this._bgMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBeatIntensity: { value: 0 },
        uBassIntensity: { value: 0 },
        uAudioIntensity: { value: 0 },
        uMissFlash: { value: 0 },
      },
      vertexShader, fragmentShader, side: THREE.DoubleSide
    });
    this._bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), this._bgMaterial);
    this._bgMesh.position.z = -10;
    this.scene.add(this._bgMesh);
  }

  _createParticles() {
    const count = 200;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 10 - 3;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xAAFF00, size: 0.04, transparent: true, opacity: 0.3,
      sizeAttenuation: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this._particles = new THREE.Points(geom, mat);
    this._particles.visible = this._particlesVisible;
    this.scene.add(this._particles);
  }

  /** Show/hide particles — used to hide them outside main menu */
  setParticlesVisible(visible) {
    this._particlesVisible = visible;
    if (this._particles) {
      this._particles.visible = visible;
    }
  }

  /** Set a background image — safe-area cover, audio-reactive, fade±swipe transition */
  setBackgroundImage(url, useSwipe = false) {
    if (!url) {
      this._clearBackgroundImage();
      return;
    }

    new THREE.TextureLoader().load(url, (texture) => {
      if (this._disposed) return;

      const imgAspect = texture.image ? texture.image.width / texture.image.height : 16 / 9;

      // ── Keep old image for transition ──
      const oldMesh = this._bgImageMesh;
      const oldMaterial = this._bgImageMaterial;
      const oldTexture = this._bgImageTexture;
      const oldPlaneGeom = oldMesh ? this._calcBgPlaneGeometry() : null;

      this._bgImageMesh = null;
      this._bgImageMaterial = null;
      this._bgImageTexture = null;
      this._bgImageTexture = texture;

      const fragmentShader = `
        uniform sampler2D uTexture;
        uniform float uBass;
        uniform float uAudioIntensity;
        uniform float uCoverScale;
        uniform float uPlaneAspect;
        uniform float uBrightness;
        uniform float uOpacity;
        uniform float uMissFlash;
        uniform float uBeatIntensity;
        uniform float uCrtIntensity;
        uniform float uGlitchIntensity;
        uniform float uGlitchSeed;
        uniform float uTime;
        varying vec2 vUv;

        float hash(float n) { return fract(sin(n) * 43758.5453); }

        void main() {
          vec2 uv = vUv;
          float planeAspect = uPlaneAspect;
          float imgAspect = uCoverScale;
          if (planeAspect > imgAspect) {
            float scale = planeAspect / imgAspect;
            uv.y = (uv.y - 0.5) / scale + 0.5;
          } else {
            float scale = imgAspect / planeAspect;
            uv.x = (uv.x - 0.5) / scale + 0.5;
          }
          float zoom = 1.0 + uBass * 0.03 + uBeatIntensity * 0.06;
          uv = (uv - 0.5) / zoom + 0.5;

          // CRT: barrel distortion (TV edge warp)
          if (uCrtIntensity > 0.01) {
            vec2 d = uv - 0.5;
            float r2 = dot(d, d);
            float barrel = 1.0 - uCrtIntensity * 0.35 * r2;
            uv = 0.5 + d * barrel;
          }

          // Glitch: horizontal offset per scanline
          if (uGlitchIntensity > 0.01) {
            float lineHash = hash(floor(uv.y * 80.0) + uGlitchSeed);
            float blockHash = hash(floor(uv.y * 8.0) + uGlitchSeed * 3.7);
            float offset = (lineHash - 0.5) * uGlitchIntensity * 0.08;
            offset += (blockHash - 0.5) * uGlitchIntensity * 0.15 * step(0.7, blockHash);
            uv.x += offset;
          }

          uv = clamp(uv, 0.0, 1.0);

          vec3 texRgb = texture2D(uTexture, uv).rgb;

          vec3 color = texRgb * 0.3;
          float glow = uBass * 0.35 + uAudioIntensity * 0.15;
          color += texRgb * glow;
          color += vec3(uBrightness * 0.18);

          // ── Vignette (pure black, subtle) ──
          float vig = distance(vUv, vec2(0.5));
          float vigDark = smoothstep(0.5, 1.0, vig);
          color *= 1.0 - vigDark * 0.5;

          // Rounded corners — soft darkening
          vec2 cornerDist = max(abs(vUv - 0.5) - 0.38, vec2(0.0));
          float cornerLen = length(cornerDist);
          float cornerDark = smoothstep(0.0, 0.12, cornerLen);
          color *= 1.0 - cornerDark * 0.5;

          // CRT: scanlines + phosphor flicker + color fringing
          if (uCrtIntensity > 0.01) {
            float scanline = sin(vUv.y * 600.0 + uTime * 2.0) * 0.5 + 0.5;
            float scanDark = 1.0 - scanline * 0.18 * uCrtIntensity;
            color *= scanDark;
            float flicker = 1.0 - 0.04 * uCrtIntensity * hash(uTime * 60.0);
            color *= flicker;
            // Subtle RGB shift for CRT color fringing
            color.r *= 1.0 + 0.015 * uCrtIntensity;
            color.b *= 1.0 - 0.015 * uCrtIntensity;
          }

          // Miss flash — red overlay
          float missVig = smoothstep(0.2, 0.9, vig);
          color += vec3(1.0, 0.1, 0.05) * uMissFlash * (0.6 + 0.4 * missVig);

          gl_FragColor = vec4(color, uOpacity);
        }
      `;

      this._bgImageMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uTexture: { value: texture },
          uBass: { value: 0 },
          uBeatIntensity: { value: 0 },
          uAudioIntensity: { value: 0 },
          uCoverScale: { value: imgAspect },
          uPlaneAspect: { value: 1.0 },
          uBrightness: { value: 0 },
          uOpacity: { value: 0 },
          uMissFlash: { value: 0 },
          uCrtIntensity: { value: this._crtIntensity },
          uGlitchIntensity: { value: 0 },
          uGlitchSeed: { value: 0 },
          uTime: { value: 0 },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader,
        side: THREE.DoubleSide,
        depthWrite: false,
        transparent: true,
      });

      // ── Calculate plane geometry based on safe area ──
      const planeGeom = this._calcBgPlaneGeometry();
      this._bgImageMaterial.uniforms.uPlaneAspect.value = planeGeom.safeAreaAspect;

      this._bgImageMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(planeGeom.width, planeGeom.height),
        this._bgImageMaterial
      );
      this._bgImageMesh.position.set(planeGeom.cx, planeGeom.cy, -4);

      // ── No old image: simple fade-in ──
      if (!oldMesh) {
        this.scene.add(this._bgImageMesh);
        const fadeDuration = 350;
        const startTime = performance.now();
        const animateFadeIn = () => {
          if (this._disposed) return;
          const elapsed = performance.now() - startTime;
          const t = Math.min(1, elapsed / fadeDuration);
          if (this._bgImageMesh?.material?.uniforms) {
            this._bgImageMesh.material.uniforms.uOpacity.value = 1 - Math.pow(1 - t, 3);
          }
          if (t < 1) requestAnimationFrame(animateFadeIn);
        };
        requestAnimationFrame(animateFadeIn);
        return;
      }

      // ── Transition: seamless crossfade (+ optional swipe) ──
      this._bgImageMesh.material.uniforms.uOpacity.value = 0;
      if (useSwipe) {
        this._bgImageMesh.position.x = planeGeom.cx + planeGeom.viewWidth * 0.3;
      }
      this.scene.add(this._bgImageMesh);

      const oldStartX = oldMesh.position.x;
      const fadeDuration = 380;
      const startTime = performance.now();
      const animateTransition = () => {
        if (this._disposed) return;
        const elapsed = performance.now() - startTime;
        const t = Math.min(1, elapsed / fadeDuration);
        const ease = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;

        // ── New image: fade in (+ swipe if enabled) ──
        if (this._bgImageMesh) {
          this._bgImageMesh.material.uniforms.uOpacity.value = ease;
          if (useSwipe) {
            const startX = planeGeom.cx + planeGeom.viewWidth * 0.3;
            this._bgImageMesh.position.x = startX + (planeGeom.cx - startX) * ease;
            const sc = 1.03 - 0.03 * ease;
            this._bgImageMesh.scale.set(sc, sc, 1);
          }
          const flash = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;
          this._bgImageMesh.material.uniforms.uBrightness.value = Math.max(0, flash) * (1 - t) * 0.4;
        }

        // ── Old image: fade out (+ swipe if enabled) ──
        if (oldMesh) {
          if (oldMaterial?.uniforms?.uOpacity) {
            oldMaterial.uniforms.uOpacity.value = 1 - ease;
          } else if (oldMaterial?.uniforms?.uBrightness) {
            oldMaterial.uniforms.uBrightness.value = -ease * 0.9;
          }
          if (useSwipe) {
            oldMesh.position.x = oldStartX - (oldPlaneGeom ? oldPlaneGeom.viewWidth * 0.3 * ease : 0);
            const oldSc = 1 - 0.02 * ease;
            oldMesh.scale.set(oldSc, oldSc, 1);
          }
        }

        if (t < 1) {
          requestAnimationFrame(animateTransition);
        } else {
          if (oldMesh) { this.scene.remove(oldMesh); oldMesh.geometry.dispose(); }
          if (oldMaterial) oldMaterial.dispose();
          if (oldTexture) oldTexture.dispose();
          if (this._bgImageMesh) {
            this._bgImageMesh.position.set(planeGeom.cx, planeGeom.cy, -4);
            this._bgImageMesh.scale.set(1, 1, 1);
            this._bgImageMesh.material.uniforms.uOpacity.value = 1;
            this._bgImageMesh.material.uniforms.uBrightness.value = 0;
          }
        }
      };
      requestAnimationFrame(animateTransition);
    });
  }

  /** Calculate background plane geometry to match safe area (cached) */
  _calcBgPlaneGeometry() {
    if (this._cachedBgGeom) return this._cachedBgGeom;
    const cam = this.camera;
    const dist = cam.position.z - (-4);
    const vFov = cam.fov * Math.PI / 180;
    const halfH = Math.tan(vFov / 2) * dist;
    const halfW = halfH * cam.aspect;
    const sa = this._safeArea;
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    // Safe area in NDC
    const l = (2 * sa.x / winW) - 1;
    const r = (2 * (sa.x + sa.w) / winW) - 1;
    const t = 1 - (2 * sa.y / winH);
    const b = 1 - (2 * (sa.y + sa.h) / winH);
    // 3D at z=-4
    const rawW = (r - l) * halfW;
    const rawH = (t - b) * halfH;
    const result = {
      width: rawW * 1.12, height: rawH * 1.12,
      cx: ((l + r) / 2) * halfW, cy: ((t + b) / 2) * halfH,
      safeAreaAspect: sa.w / sa.h, viewWidth: rawW
    };
    this._cachedBgGeom = result;
    return result;
  }

  _invalidateBgGeom() { this._cachedBgGeom = null; }

  _clearBackgroundImage() {
    if (this._bgImageMesh) {
      this.scene.remove(this._bgImageMesh);
      this._bgImageMesh = null;
    }
    if (this._bgImageMaterial) {
      this._bgImageMaterial.dispose();
      this._bgImageMaterial = null;
    }
    if (this._bgImageTexture) {
      this._bgImageTexture.dispose();
      this._bgImageTexture = null;
    }
  }

  /** Hide the dark animated gradient background mesh (used during gameplay to prevent double background) */
  hideBgMesh() {
    if (this._bgMesh) this._bgMesh.visible = false;
  }

  /** Show the dark animated gradient background mesh */
  showBgMesh() {
    if (this._bgMesh) this._bgMesh.visible = true;
  }

  /** Set a video as the background — synced to audio playback time */
  setBackgroundVideo(url, audioEngine) {
    // Increment generation counter to invalidate any pending loads
    const loadId = ++this._videoLoadId;

    this._clearBackgroundImage(); // remove any image bg
    if (!url) { this._clearBackgroundVideo(); return; }

    this._audioEngineRef = audioEngine || this._audioEngine;

    // Create hidden <video> element
    const video = document.createElement('video');
    video.src = url;
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.loop = true;  // Loop in song-select preview mode
    video.tabIndex = -1; // prevent video element from stealing keyboard focus
    video.style.display = 'none';
    document.body.appendChild(video);

    const pendingVideo = video;
    let videoInitialized = false;

    const initVideo = () => {
      if (videoInitialized) return;
      videoInitialized = true;
      // Stale load — discard
      if (this._disposed || loadId !== this._videoLoadId) {
        pendingVideo.pause();
        pendingVideo.src = '';
        if (pendingVideo.parentNode) pendingVideo.parentNode.removeChild(pendingVideo);
        return;
      }

      // Optimize video playback for stability
      video.muted = true;
      video.playbackRate = 1.0;

      // Save reference to OLD video mesh — keep it visible during fade-in
      const oldVideoMesh = this._videoMesh;
      const oldVideoMaterial = this._videoMaterial;
      const oldVideoTexture = this._videoTexture;
      const oldVideoElement = this._videoElement;

      // Clear old video RESOURCES (elements, textures) but NOT the mesh yet
      // We'll remove the old mesh after the new one has faded in
      this._videoMesh = null;
      this._videoMaterial = null;
      this._videoTexture = null;
      this._videoElement = pendingVideo;

      // Create VideoTexture
      const texture = new THREE.VideoTexture(video);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.format = THREE.RGBAFormat;
      texture.colorSpace = THREE.SRGBColorSpace;
      this._videoTexture = texture;

      // Calculate video aspect
      const videoAspect = video.videoWidth / video.videoHeight || 16 / 9;

      // Shader material for video — with CRT + glitch support (no chromatic aberration)
      const fragmentShader = `
        uniform sampler2D uTexture;
        uniform float uBass;
        uniform float uAudioIntensity;
        uniform float uCoverScale;
        uniform float uPlaneAspect;
        uniform float uBrightness;
        uniform float uOpacity;
        uniform float uMissFlash;
        uniform float uBeatIntensity;
        uniform float uCrtIntensity;
        uniform float uGlitchIntensity;
        uniform float uGlitchSeed;
        uniform float uTime;
        varying vec2 vUv;

        float hash(float n) { return fract(sin(n) * 43758.5453); }

        void main() {
          vec2 uv = vUv;
          float planeAspect = uPlaneAspect;
          float imgAspect = uCoverScale;
          if (planeAspect > imgAspect) {
            float scale = planeAspect / imgAspect;
            uv.y = (uv.y - 0.5) / scale + 0.5;
          } else {
            float scale = imgAspect / planeAspect;
            uv.x = (uv.x - 0.5) / scale + 0.5;
          }
          float zoom = 1.0 + uBass * 0.03 + uBeatIntensity * 0.06;
          uv = (uv - 0.5) / zoom + 0.5;

          // CRT: barrel distortion (TV edge warp)
          if (uCrtIntensity > 0.01) {
            vec2 d = uv - 0.5;
            float r2 = dot(d, d);
            float barrel = 1.0 - uCrtIntensity * 0.35 * r2;
            uv = 0.5 + d * barrel;
          }

          // Glitch: horizontal offset per scanline
          if (uGlitchIntensity > 0.01) {
            float lineHash = hash(floor(uv.y * 80.0) + uGlitchSeed);
            float blockHash = hash(floor(uv.y * 8.0) + uGlitchSeed * 3.7);
            float offset = (lineHash - 0.5) * uGlitchIntensity * 0.08;
            offset += (blockHash - 0.5) * uGlitchIntensity * 0.15 * step(0.7, blockHash);
            uv.x += offset;
          }

          // Clamp UVs to prevent wrapping
          uv = clamp(uv, 0.0, 1.0);

          vec3 texRgb = texture2D(uTexture, uv).rgb;

          vec3 color = texRgb * 0.65;
          float glow = uBass * 0.35 + uAudioIntensity * 0.15;
          color += texRgb * glow;
          color += vec3(uBrightness * 0.18);

          // ── Vignette (pure black, subtle) ──
          float vig = distance(vUv, vec2(0.5));
          float vigDark = smoothstep(0.55, 1.0, vig);
          color *= 1.0 - vigDark * 0.55;

          // Rounded corners — soft darkening
          vec2 cornerDist = max(abs(vUv - 0.5) - 0.38, vec2(0.0));
          float cornerLen = length(cornerDist);
          float cornerDark = smoothstep(0.0, 0.12, cornerLen);
          color *= 1.0 - cornerDark * 0.5;

          // CRT: scanlines + phosphor flicker + color fringing
          if (uCrtIntensity > 0.01) {
            float scanline = sin(vUv.y * 600.0 + uTime * 2.0) * 0.5 + 0.5;
            float scanDark = 1.0 - scanline * 0.18 * uCrtIntensity;
            color *= scanDark;
            float flicker = 1.0 - 0.04 * uCrtIntensity * hash(uTime * 60.0);
            color *= flicker;
            // Subtle RGB shift for CRT color fringing
            color.r *= 1.0 + 0.015 * uCrtIntensity;
            color.b *= 1.0 - 0.015 * uCrtIntensity;
          }

          // Miss flash — red overlay
          float missVig = smoothstep(0.2, 0.9, vig);
          color += vec3(1.0, 0.1, 0.05) * uMissFlash * (0.6 + 0.4 * missVig);

          gl_FragColor = vec4(color, uOpacity);
        }
      `;

      this._videoMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uTexture: { value: texture },
          uBass: { value: 0 },
          uBeatIntensity: { value: 0 },
          uAudioIntensity: { value: 0 },
          uCoverScale: { value: videoAspect },
          uPlaneAspect: { value: 1.0 },
          uBrightness: { value: 0 },
          uOpacity: { value: 0 },
          uMissFlash: { value: 0 },
          uCrtIntensity: { value: this._crtIntensity },
          uGlitchIntensity: { value: 0 },
          uGlitchSeed: { value: 0 },
          uTime: { value: 0 },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader,
        side: THREE.DoubleSide,
        depthWrite: false,
        transparent: true,
      });

      // Create mesh
      const planeGeom = this._calcBgPlaneGeometry();
      this._videoMaterial.uniforms.uPlaneAspect.value = planeGeom.safeAreaAspect;

      this._videoMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(planeGeom.width, planeGeom.height),
        this._videoMaterial
      );
      this._videoMesh.position.set(planeGeom.cx, planeGeom.cy, -4);
      this.scene.add(this._videoMesh);

      // Fade in — old video stays visible behind during transition
      const fadeDuration = 300;
      const startTime = performance.now();
      const animateFadeIn = () => {
        if (this._disposed) return;
        const elapsed = performance.now() - startTime;
        const t = Math.min(1, elapsed / fadeDuration);
        if (this._videoMaterial?.uniforms) {
          this._videoMaterial.uniforms.uOpacity.value = 1 - Math.pow(1 - t, 3);
        }
        if (t < 1) {
          requestAnimationFrame(animateFadeIn);
        } else {
          // Fade complete — now safely remove old video mesh and resources
          if (oldVideoMesh) {
            this.scene.remove(oldVideoMesh);
            oldVideoMesh.geometry.dispose();
          }
          if (oldVideoMaterial) oldVideoMaterial.dispose();
          if (oldVideoTexture) oldVideoTexture.dispose();
          if (oldVideoElement) {
            oldVideoElement.pause();
            oldVideoElement.src = '';
            oldVideoElement.load();
            if (oldVideoElement.parentNode) oldVideoElement.parentNode.removeChild(oldVideoElement);
          }
        }
      };
      requestAnimationFrame(animateFadeIn);

      // Trigger glitch on the NEW video mesh right as it becomes visible
      // The old mesh is still behind it, creating a seamless transition
      this.triggerGlitch(0.6);
      EventBus.emit('background:changed', { type: 'video' });

      // Start playing at offset 0 (will be synced in update loop)
      video.currentTime = 0;
      video.play().then(() => {
        this._videoActive = true;
      }).catch((err) => {
        // Autoplay may be blocked — retry once after a short delay
        console.warn('[ThreeScene] video.play() rejected, retrying...', err.message);
        setTimeout(() => {
          if (this._videoElement === video && !video.paused) return;
          video.play().then(() => {
            this._videoActive = true;
          }).catch(() => {
            console.warn('[ThreeScene] video.play() retry failed');
            this._videoActive = true; // still mark active so sync can try later
          });
        }, 300);
        this._videoActive = true;
      });

      // Fallback: if video reaches end without loop support, restart it
      video.addEventListener('ended', () => {
        if (this._videoElement !== video || !this._videoActive) return;
        video.currentTime = 0;
        video.play().catch(() => {});
      });
    };

    // Use both loadeddata and canplay as triggers (some formats fire one but not the other)
    video.addEventListener('loadeddata', initVideo);
    video.addEventListener('canplay', initVideo);

    video.addEventListener('error', () => {
      if (loadId !== this._videoLoadId) return; // stale
      console.warn('[ThreeScene] Failed to load video background (format may not be supported by browser)');
      this._clearBackgroundVideo();
    });

    // Also handle codec issues: if the video loads metadata but can't decode frames
    video.addEventListener('loadedmetadata', () => {
      if (loadId !== this._videoLoadId) return; // stale
      // Check if the video has valid dimensions
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        console.warn('[ThreeScene] Video has invalid dimensions — likely unsupported codec');
        this._clearBackgroundVideo();
      }
    });

    video.load();
  }

  /** Clear the video background and release resources */
  _clearBackgroundVideo() {
    this._videoActive = false;
    this._videoPaused = false;
    this._skipVideoFrame = false;
    if (this._videoMesh) {
      this.scene.remove(this._videoMesh);
      this._videoMesh.geometry.dispose();
      this._videoMesh = null;
    }
    if (this._videoMaterial) {
      this._videoMaterial.dispose();
      this._videoMaterial = null;
    }
    if (this._videoTexture) {
      this._videoTexture.dispose();
      this._videoTexture = null;
    }
    if (this._videoElement) {
      this._videoElement.pause();
      this._videoElement.src = '';
      this._videoElement.load();
      if (this._videoElement.parentNode) {
        this._videoElement.parentNode.removeChild(this._videoElement);
      }
      this._videoElement = null;
    }
  }

  /** Pause the video background (when game is paused) */
  pauseVideo() {
    this._videoPaused = true;
    if (this._videoElement && !this._videoElement.paused) {
      this._videoElement.pause();
    }
  }

  /** Resume the video background (when game is resumed) */
  resumeVideo() {
    this._videoPaused = false;
    if (this._videoElement && this._videoElement.paused && this._videoActive) {
      this._videoElement.play().catch(() => {});
    }
  }

  _setupListeners() {
    EventBus.on('note:hit', ({ judgement }) => {
      if (this._disposed) return;
      // Subtle bloom boost on hit — no harsh flash
      if (judgement === 'perfect') {
        this._bloomTarget = 0.5;
        this._beatIntensity = 0.3;
      } else if (judgement === 'great') {
        this._bloomTarget = 0.38;
        this._beatIntensity = 0.18;
      } else if (judgement === 'good') {
        this._bloomTarget = 0.28;
        this._beatIntensity = 0.08;
      }
    });
    EventBus.on('note:miss', () => {
      if (!this._disposed) {
        // Red overlay flash instead of camera shake
        this._missFlash = 0.5;
      }
    });
  }

  createTVMonitor() {
    // TV monitor is temporarily disabled
    return;
  }

  removeTVMonitor() {
    if (this._tvGroup) {
      this.scene.remove(this._tvGroup);
      this._tvGroup = null; this._tvScreen = null; this._tvScreenMaterial = null;
      this._tvGlowLight = null;
      if (this._currentTexture) { this._currentTexture.dispose(); this._currentTexture = null; }
    }
  }

  setTVTexture(imageUrl, useSwipe = false) {
    // TV disabled — use background image instead for song select
    this.setBackgroundImage(imageUrl, useSwipe);
  }

  setTVStatic() {
    this._clearBackgroundImage();
    this._clearBackgroundVideo();
  }

  /** Set CRT overlay intensity (0-1) — used in song select for that retro TV feel */
  setCrtIntensity(intensity) {
    this._crtIntensity = Math.max(0, Math.min(1, intensity));
  }

  /** Set chromatic aberration — REMOVED, kept as no-op for compatibility */
  setChromaticAberration(intensity) {
    // Chromatic aberration removed — no-op
  }

  /** Trigger a glitch transition effect */
  triggerGlitch(intensity = 0.8) {
    this._glitchIntensity = intensity;
    this._glitchSeed = Math.random() * 100;
  }

  /** Trigger a beat pulse — called on each music beat */
  triggerBeatPulse(intensity = 1.0) {
    this._beatPulse = Math.max(this._beatPulse, intensity);
  }

  /** Set chorus/fever intensity (0-1) — called from game loop each frame */
  setChorusIntensity(intensity) {
    this._chorusIntensity = Math.max(0, Math.min(1, intensity));
  }

  /** Trigger chorus beat pulse — called on each beat during chorus */
  triggerChorusBeatPulse(intensity = 1.0) {
    this._chorusBeatPulse = Math.max(this._chorusBeatPulse, intensity);
  }

  setAspectRatio(ar) { this._aspectRatio = ar; this.resize(); }

  resize() {
    if (this._disposed) return;
    const w = window.innerWidth, h = window.innerHeight;
    // Camera aspect always matches actual window ratio — safe area handles the rest
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.renderer.setClearColor(0x000000, 1);
    this._invalidateBgGeom();
    this._resizeBackgroundImage();
  }

  /** Resize the background image/video plane to match safe area */
  _resizeBackgroundImage() {
    if (this._bgImageMesh) {
      const pg = this._calcBgPlaneGeometry();
      this._bgImageMesh.geometry.dispose();
      this._bgImageMesh.geometry = new THREE.PlaneGeometry(pg.width, pg.height);
      this._bgImageMesh.position.set(pg.cx, pg.cy, this._bgImageMesh.position.z);
      if (this._bgImageMaterial?.uniforms) {
        this._bgImageMaterial.uniforms.uPlaneAspect.value = pg.safeAreaAspect;
      }
    }
    // Also resize video mesh if present
    if (this._videoMesh) {
      const pg = this._calcBgPlaneGeometry();
      this._videoMesh.geometry.dispose();
      this._videoMesh.geometry = new THREE.PlaneGeometry(pg.width, pg.height);
      this._videoMesh.position.set(pg.cx, pg.cy, this._videoMesh.position.z);
      if (this._videoMaterial?.uniforms) {
        this._videoMaterial.uniforms.uPlaneAspect.value = pg.safeAreaAspect;
      }
    }
  }

  update(time) {
    if (this._disposed || this._contextLost) return;

    // Get audio levels for reactive effects
    if (this._audioEngine) {
      this._audioLevels = this._audioEngine.getAudioLevels();
    }

    const gfx = this._gfx();
    const levels = this._audioLevels;
    const bassPulse = levels.bass * gfx;
    const audioPulse = levels.intensity * gfx;

    // ── Background shader ──
    if (this._bgMaterial) {
      this._bgMaterial.uniforms.uTime.value = time * 0.001;
      this._bgMaterial.uniforms.uBeatIntensity.value = this._beatIntensity * gfx;
      this._bgMaterial.uniforms.uBassIntensity.value = bassPulse;
      this._bgMaterial.uniforms.uAudioIntensity.value = audioPulse;
      this._beatIntensity *= 0.88;
    }

    // ── Beat pulse (from beat:pulse events) ──
    if (this._beatPulse > 0.01) {
      this._beatPulse *= 0.82; // Fast decay — sharp beat feel
    } else {
      this._beatPulse = 0;
    }

    // ── Background image — audio-reactive cover with glow + zoom ──
    if (this._bgImageMesh && this._bgImageMaterial && this._bgImageMaterial.uniforms) {
      this._bgImageMaterial.uniforms.uBass.value = bassPulse;
      this._bgImageMaterial.uniforms.uAudioIntensity.value = audioPulse;
      this._bgImageMaterial.uniforms.uBeatIntensity.value = this._beatPulse;
    }

    // ── Particles — audio-reactive (only on disco + visible) ──
    if (this._particles && this._particlesVisible && this._graphicsPreset === 'disco') {
      this._particleFrame++;
      if (this._particleFrame % 2 === 0) { // Only update every 2nd frame
        const pos = this._particles.geometry.attributes.position.array;
        const rawBass = this._audioLevels.bass;
        const drift = 0.001 + rawBass * 0.004;
        for (let i = 0; i < pos.length; i += 3) {
          pos[i + 1] += Math.sin(time * 0.0003 + i) * drift * 2; // *2 to compensate for half the updates
          pos[i] += Math.cos(time * 0.0002 + i * 0.5) * drift;
        }
        this._particles.geometry.attributes.position.needsUpdate = true;
      }
      this._particles.material.opacity = 0.1 + this._audioLevels.bass * 0.2 + this._beatIntensity * 0.1;
      this._particles.material.size = 0.04 + this._audioLevels.bass * 0.02;
    }

    // ── Chorus intensity — smooth ramp ──
    if (this._chorusIntensity > 0.01) {
      this._chorusBeatPulse *= 0.85;
    } else {
      this._chorusBeatPulse = 0;
    }
    const chorusBoost = this._chorusIntensity;
    const chorusBeat = this._chorusBeatPulse;

    // ── Camera FOV — smooth audio-reactive (skip updateProjectionMatrix when barely changed) ──
    {
      // FOV punch — amplified 4x on beat, extra during chorus
      const targetFOV = this._baseFOV
        + this._beatPulse * (2.0 + chorusBoost * 0.8)   // moderate beat punch
        + bassPulse * (0.5 + chorusBoost * 0.2)         // bass breathing
        + chorusBeat * 0.8;                               // subtle chorus kick
      const newFov = this.camera.fov + (targetFOV - this.camera.fov) * 0.12;
      if (Math.abs(newFov - this.camera.fov) > 0.01) {
        this.camera.fov = newFov;
        this.camera.updateProjectionMatrix();
      }
      this._fovPulse = 0;

      // ── Beat wobble — subtle camera shake ──
      if (this._beatPulse > 0.1 || chorusBeat > 0.1) {
        const shakeAmp = (0.02 + chorusBoost * 0.01);
        const wobbleX = Math.sin(time * 0.047) * this._beatPulse * shakeAmp
                       + Math.sin(time * 0.071) * chorusBeat * 0.012;
        const wobbleY = Math.cos(time * 0.031) * this._beatPulse * shakeAmp * 0.8
                       + Math.cos(time * 0.053) * chorusBeat * 0.01;
        this.camera.position.x = wobbleX;
        this.camera.position.y = wobbleY;
      } else {
        this.camera.position.x *= 0.9;
        this.camera.position.y *= 0.9;
      }
    }

    // ── Bloom — reactive to audio + hits + chorus — AMPLIFIED ──
    const audioBloom = this._bloomBase
      + this._beatPulse * (0.3 + chorusBoost * 0.15)  // beat bloom moderate
      + audioPulse * (0.1 + chorusBoost * 0.05)        // audio bloom subtle
      + bassPulse * (0.15 + chorusBoost * 0.08)        // bass bloom subtle
      + chorusBeat * 0.2;                               // chorus beat bloom gentle
    this._bloomTarget = Math.max(this._bloomTarget, audioBloom);
    this.bloomPass.strength += (this._bloomTarget - this.bloomPass.strength) * 0.14;
    this._bloomTarget += (this._bloomBase - this._bloomTarget) * 0.05;

    // ── Chorus exposure boost — brighter during fever ──
    const targetExposure = 1.0 + chorusBoost * 0.12 + chorusBeat * 0.08;
    this._chorusExposure += (targetExposure - this._chorusExposure) * 0.08;
    if (Math.abs(this._chorusExposure - this.renderer.toneMappingExposure) > 0.005) {
      this.renderer.toneMappingExposure = this._chorusExposure;
    }

    // ── Point light — reactive glow — AMPLIFIED ──
    const targetIntensity = 0.6 + bassPulse * (1.0 + chorusBoost * 0.3) + audioPulse * (0.5 + chorusBoost * 0.2) + chorusBeat * 0.6;
    this.pointLight.intensity += (targetIntensity - this.pointLight.intensity) * 0.12;
    if (this.pointLight.color.r > 0.67 || this.pointLight.color.b > 0.1) {
      this.pointLight.color.lerp(this._targetColor, 0.08);
    }

    // ── Bass light ──
    const bassLightTarget = bassPulse * 1.2;
    this._bassLight.intensity += (bassLightTarget - this._bassLight.intensity) * 0.15;
    this._bassLight.color.lerp(this._bassTargetColor, 0.05);

    // ── Accent light pulse ──
    this._accentLight.intensity = 0.15 + audioPulse * 0.3;

    // ── Miss flash — decay the red overlay ──
    if (this._missFlash > 0.005) {
      this._missFlash *= 0.88;
    } else {
      this._missFlash = 0;
    }
    if (this._bgMaterial) {
      this._bgMaterial.uniforms.uMissFlash.value = this._missFlash * gfx;
    }
    if (this._bgImageMaterial && this._bgImageMaterial.uniforms && this._bgImageMaterial.uniforms.uMissFlash) {
      this._bgImageMaterial.uniforms.uMissFlash.value = this._missFlash * gfx;
    }

    // ── Video background — sync to audio time + audio-reactive effects ──
    if (this._videoActive && this._videoElement && this._videoMaterial) {
      // Sync video position to audio time
      if (this._audioEngineRef && this._audioEngineRef.isPlaying) {
        // The audio buffer has 1s of silence prepended (lead-in), so
        // audio.currentTime includes this offset. Video starts at its own t=0,
        // so we subtract the lead-in to get the correct video position.
        const audioContentTime = Math.max(0, this._audioEngineRef.currentTime - this._leadInOffset);
        const videoTime = this._videoElement.currentTime;
        const drift = audioContentTime - videoTime;
        const absDrift = Math.abs(drift);

        if (drift < -0.5) {
          // Audio jumped backward (restart/loop) — let preview handler sync video
          this._videoElement.playbackRate = 1.0;
        } else if (absDrift > 0.5) {
          // Large drift: hard seek to correct position
          this._videoElement.currentTime = audioContentTime;
          this._videoElement.playbackRate = 1.0;
        } else if (absDrift > 0.05) {
          // Moderate drift: gradual correction via playback rate adjustment
          const rate = drift > 0 ? 1.05 : 0.95;
          this._videoElement.playbackRate = rate;
        } else {
          // In sync: normal playback
          this._videoElement.playbackRate = 1.0;
        }
      }
      // Always ensure video is playing (not just when audio is syncing)
      // Respect the explicit pause flag — don't auto-resume if game is paused
      if (this._videoElement.paused && this._videoActive && !this._videoPaused) {
        this._videoElement.play().catch(() => {});
      }
      // Update video texture every 2nd frame for performance
      if (this._videoTexture && !this._skipVideoFrame) {
        this._videoTexture.needsUpdate = true;
      }
      this._skipVideoFrame = !this._skipVideoFrame;
      // Audio-reactive uniforms
      this._videoMaterial.uniforms.uBass.value = bassPulse;
      this._videoMaterial.uniforms.uAudioIntensity.value = audioPulse;
      this._videoMaterial.uniforms.uBeatIntensity.value = this._beatPulse;
      this._videoMaterial.uniforms.uMissFlash.value = this._missFlash * gfx;
      // CRT + Glitch uniforms
      this._videoMaterial.uniforms.uCrtIntensity.value = this._crtIntensity;
      this._videoMaterial.uniforms.uGlitchIntensity.value = this._glitchIntensity;
      this._videoMaterial.uniforms.uGlitchSeed.value = this._glitchSeed;
      this._videoMaterial.uniforms.uTime.value = time * 0.001;
    }

    // ── Background image — CRT + glitch uniforms ──
    if (this._bgImageMesh && this._bgImageMaterial && this._bgImageMaterial.uniforms) {
      this._bgImageMaterial.uniforms.uBass.value = bassPulse;
      this._bgImageMaterial.uniforms.uAudioIntensity.value = audioPulse;
      this._bgImageMaterial.uniforms.uBeatIntensity.value = this._beatPulse;
      if (this._bgImageMaterial.uniforms.uCrtIntensity) this._bgImageMaterial.uniforms.uCrtIntensity.value = this._crtIntensity;
      if (this._bgImageMaterial.uniforms.uGlitchIntensity) this._bgImageMaterial.uniforms.uGlitchIntensity.value = this._glitchIntensity;
      if (this._bgImageMaterial.uniforms.uGlitchSeed) this._bgImageMaterial.uniforms.uGlitchSeed.value = this._glitchSeed;
      if (this._bgImageMaterial.uniforms.uTime) this._bgImageMaterial.uniforms.uTime.value = time * 0.001;
    }

    // ── Glitch decay ──
    if (this._glitchIntensity > 0.01) {
      this._glitchIntensity *= 0.88;
      this._glitchSeed = Math.random() * 100;
    } else {
      this._glitchIntensity = 0;
    }

    // ── Reverse parallax — move bg opposite to mouse (use cached geom) ──
    const targetX = -this._mouseX * this._parallaxIntensity;
    const targetY = this._mouseY * this._parallaxIntensity;
    this._bgOffsetX += (targetX - this._bgOffsetX) * 0.06;
    this._bgOffsetY += (targetY - this._bgOffsetY) * 0.06;
    const pg = this._calcBgPlaneGeometry();
    if (this._bgImageMesh) {
      this._bgImageMesh.position.x = pg.cx + this._bgOffsetX;
      this._bgImageMesh.position.y = pg.cy + this._bgOffsetY;
    }
    if (this._videoMesh) {
      this._videoMesh.position.x = pg.cx + this._bgOffsetX;
      this._videoMesh.position.y = pg.cy + this._bgOffsetY;
    }

    // Camera position: smoothly return to center when no beat wobble active
    if (this._beatPulse <= 0.1) {
      this.camera.position.x *= 0.85;
      this.camera.position.y *= 0.85;
    }

    try {
      this.composer.render();
    } catch (e) {
      // Silently skip frames on context issues
    }
  }

  /** Full cleanup — disposes all GPU resources and removes event listeners */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;

    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
    if (this._mouseHandler) {
      window.removeEventListener('mousemove', this._mouseHandler);
      this._mouseHandler = null;
    }

    this.removeTVMonitor();
    this._clearBackgroundVideo();
    this._clearBackgroundImage();

    if (this._particles) {
      this._particles.geometry.dispose();
      this._particles.material.dispose();
      this._particles = null;
    }

    if (this._bgMaterial) {
      this._bgMaterial.dispose();
      this._bgMaterial = null;
    }

    this.scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });

    if (this.composer) {
      this.composer.passes.forEach(p => { if (p.dispose) p.dispose(); });
    }

    if (this.renderer) {
      this.renderer.dispose();
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    }

    const idx = window.__threeSceneInstances.indexOf(this);
    if (idx >= 0) window.__threeSceneInstances.splice(idx, 1);
  }
}
