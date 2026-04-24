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
    this._bloomBase = 0.4;
    this._bloomTarget = 0.4;
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
    // Background image for song select
    this._bgImageMesh = null;
    this._bgImageMaterial = null;
    this._bgImageTexture = null;
    this._safeArea = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
    this._graphicsPreset = 'disco'; // 'low' | 'standard' | 'disco'
    this._missFlash = 0; // red overlay flash intensity on miss (0-1, decays)

    // Video background state
    this._videoElement = null;   // hidden HTML5 <video> element
    this._videoTexture = null;   // THREE.VideoTexture from the video
    this._videoMesh = null;      // mesh for the video plane
    this._videoMaterial = null;  // shader material for the video plane
    this._videoActive = false;   // whether video is currently playing as bg
    this._audioEngineRef = null; // for syncing video to audio time

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
      this._bloomBase = 0.15;
    } else {
      this._bloomBase = 0.4;
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
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.4, 0.4, 0.5);
    this.composer.addPass(this.bloomPass);

    this._resizeHandler = () => this.resize();
    window.addEventListener('resize', this._resizeHandler);

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

        // Audio-reactive green glow from center (main effect)
        float audioPulse = uAudioIntensity;
        float bassPulse = uBassIntensity;

        // Green glow that pulses with overall audio
        vec3 audioColor = vec3(0.4, 0.7, 0.0) * audioPulse * 0.6 * smoothstep(0.8, 0.0, vig);

        // Bass-reactive deep glow — more intense
        vec3 bassColor = vec3(0.2, 0.4, 0.0) * bassPulse * 0.8 * smoothstep(0.9, 0.0, vig);

        // Beat-reactive flash (from hit judgements)
        vec3 beatColor = vec3(0.5, 0.8, 0.0) * uBeatIntensity * 0.4 * smoothstep(0.7, 0.0, vig);

        // Subtle shimmer
        float shimmer = fract(sin(dot(uv * 100.0 + uTime * 0.1, vec2(12.9898, 78.233))) * 43758.5453);
        baseColor += vec3(0.008) * shimmer;

        // Edge glow on bass
        float edge = smoothstep(0.3, 0.7, vig);
        vec3 edgeColor = vec3(0.1, 0.2, 0.0) * bassPulse * edge * 0.5;

        vec3 color = baseColor + audioColor + bassColor + beatColor + edgeColor;

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
    const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), this._bgMaterial);
    bgMesh.position.z = -10;
    this.scene.add(bgMesh);
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
        varying vec2 vUv;
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
          float zoom = 1.0 + uBass * 0.06;
          uv = (uv - 0.5) / zoom + 0.5;
          vec4 tex = texture2D(uTexture, uv);
          vec3 color = tex.rgb * 0.25;
          float glow = uBass * 0.2 + uAudioIntensity * 0.08;
          color += tex.rgb * glow;
          color += vec3(uBrightness * 0.15);
          float vig = distance(vUv, vec2(0.5));
          color *= smoothstep(0.9, 0.3, vig) * 0.5 + 0.5;

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
          uAudioIntensity: { value: 0 },
          uCoverScale: { value: imgAspect },
          uPlaneAspect: { value: 1.0 },
          uBrightness: { value: 0 },
          uOpacity: { value: 0 },
          uMissFlash: { value: 0 },
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

  /** Calculate background plane geometry to match safe area */
  _calcBgPlaneGeometry() {
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
    return {
      width: rawW * 1.12, height: rawH * 1.12,
      cx: ((l + r) / 2) * halfW, cy: ((t + b) / 2) * halfH,
      safeAreaAspect: sa.w / sa.h, viewWidth: rawW
    };
  }

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

  /** Set a video as the background — synced to audio playback time */
  setBackgroundVideo(url, audioEngine) {
    this._clearBackgroundVideo();
    this._clearBackgroundImage(); // remove any image bg
    if (!url) return;

    this._audioEngineRef = audioEngine || this._audioEngine;

    // Create hidden <video> element
    const video = document.createElement('video');
    video.src = url;
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.loop = false;
    video.style.display = 'none';
    document.body.appendChild(video);
    this._videoElement = video;

    video.addEventListener('loadeddata', () => {
      if (this._disposed) return;

      // Create VideoTexture
      const texture = new THREE.VideoTexture(video);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.format = THREE.RGBAFormat;
      texture.colorSpace = THREE.SRGBColorSpace;
      this._videoTexture = texture;

      // Calculate video aspect
      const videoAspect = video.videoWidth / video.videoHeight || 16 / 9;

      // Shader material for video — similar to bg image but using video texture
      const fragmentShader = `
        uniform sampler2D uTexture;
        uniform float uBass;
        uniform float uAudioIntensity;
        uniform float uCoverScale;
        uniform float uPlaneAspect;
        uniform float uBrightness;
        uniform float uOpacity;
        uniform float uMissFlash;
        varying vec2 vUv;
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
          float zoom = 1.0 + uBass * 0.06;
          uv = (uv - 0.5) / zoom + 0.5;

          // Clamp UVs to prevent wrapping
          uv = clamp(uv, 0.0, 1.0);

          vec4 tex = texture2D(uTexture, uv);
          vec3 color = tex.rgb * 0.3;
          float glow = uBass * 0.2 + uAudioIntensity * 0.08;
          color += tex.rgb * glow;
          color += vec3(uBrightness * 0.15);
          float vig = distance(vUv, vec2(0.5));
          color *= smoothstep(0.9, 0.3, vig) * 0.5 + 0.5;

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
          uAudioIntensity: { value: 0 },
          uCoverScale: { value: videoAspect },
          uPlaneAspect: { value: 1.0 },
          uBrightness: { value: 0 },
          uOpacity: { value: 0 },
          uMissFlash: { value: 0 },
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

      // Fade in
      const fadeDuration = 350;
      const startTime = performance.now();
      const animateFadeIn = () => {
        if (this._disposed) return;
        const elapsed = performance.now() - startTime;
        const t = Math.min(1, elapsed / fadeDuration);
        if (this._videoMaterial?.uniforms) {
          this._videoMaterial.uniforms.uOpacity.value = 1 - Math.pow(1 - t, 3);
        }
        if (t < 1) requestAnimationFrame(animateFadeIn);
      };
      requestAnimationFrame(animateFadeIn);

      // Start playing at offset 0 (will be synced in update loop)
      video.currentTime = 0;
      video.play().catch(() => {});
      this._videoActive = true;
    });

    video.addEventListener('error', () => {
      console.warn('[ThreeScene] Failed to load video background');
      this._clearBackgroundVideo();
    });

    video.load();
  }

  /** Clear the video background and release resources */
  _clearBackgroundVideo() {
    this._videoActive = false;
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
    if (this._videoElement && !this._videoElement.paused) {
      this._videoElement.pause();
    }
  }

  /** Resume the video background (when game is resumed) */
  resumeVideo() {
    if (this._videoElement && this._videoElement.paused && this._videoActive) {
      this._videoElement.play().catch(() => {});
    }
  }

  _setupListeners() {
    EventBus.on('note:hit', ({ judgement }) => {
      if (this._disposed) return;
      // Subtle bloom boost on hit — no harsh flash
      if (judgement === 'perfect') {
        this._bloomTarget = 0.9;
        this._beatIntensity = 0.6;
      } else if (judgement === 'great') {
        this._bloomTarget = 0.75;
        this._beatIntensity = 0.4;
      } else if (judgement === 'good') {
        this._bloomTarget = 0.6;
        this._beatIntensity = 0.2;
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

  setTVTexture(imageUrl, useSwipe = true) {
    // TV disabled — use background image instead for song select
    this.setBackgroundImage(imageUrl, useSwipe);
  }

  setTVStatic() {
    this._clearBackgroundImage();
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

    // ── Background image — audio-reactive cover with glow + zoom ──
    if (this._bgImageMesh && this._bgImageMaterial && this._bgImageMaterial.uniforms) {
      this._bgImageMaterial.uniforms.uBass.value = bassPulse;
      this._bgImageMaterial.uniforms.uAudioIntensity.value = audioPulse;
    }

    // ── Particles — audio-reactive (only on disco + visible) ──
    if (this._particles && this._particlesVisible && this._graphicsPreset === 'disco') {
      const pos = this._particles.geometry.attributes.position.array;
      const rawBass = this._audioLevels.bass;
      const drift = 0.001 + rawBass * 0.004;
      for (let i = 0; i < pos.length; i += 3) {
        pos[i + 1] += Math.sin(time * 0.0003 + i) * drift;
        pos[i] += Math.cos(time * 0.0002 + i * 0.5) * drift * 0.5;
      }
      this._particles.geometry.attributes.position.needsUpdate = true;
      this._particles.material.opacity = 0.15 + rawBass * 0.35 + this._beatIntensity * 0.2;
      this._particles.material.size = 0.04 + rawBass * 0.03;
    }

    // ── Camera FOV — smooth audio-reactive ──
    {
      const targetFOV = this._baseFOV + bassPulse * 1.5;
      this.camera.fov += (targetFOV - this.camera.fov) * 0.1;
      this.camera.updateProjectionMatrix();
      this._fovPulse = 0;
    }

    // ── Bloom — reactive to audio + hits ──
    const audioBloom = this._bloomBase + audioPulse * 0.3 + bassPulse * 0.4;
    this._bloomTarget = Math.max(this._bloomTarget, audioBloom);
    this.bloomPass.strength += (this._bloomTarget - this.bloomPass.strength) * 0.12;
    this._bloomTarget += (this._bloomBase - this._bloomTarget) * 0.06;

    // ── Point light — reactive glow ──
    const targetIntensity = 1.5 + bassPulse * 2.0 + audioPulse * 1.0;
    this.pointLight.intensity += (targetIntensity - this.pointLight.intensity) * 0.1;
    if (this.pointLight.color.r > 0.67 || this.pointLight.color.b > 0.1) {
      this.pointLight.color.lerp(new THREE.Color(0xAAFF00), 0.08);
    }

    // ── Bass light ──
    const bassLightTarget = bassPulse * 3.0;
    this._bassLight.intensity += (bassLightTarget - this._bassLight.intensity) * 0.15;
    this._bassLight.color.lerp(new THREE.Color(0xAAFF00), 0.05);

    // ── Accent light pulse ──
    this._accentLight.intensity = 0.4 + audioPulse * 0.8;

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
        const audioTime = this._audioEngineRef.currentTime;
        const videoTime = this._videoElement.currentTime;
        const drift = Math.abs(audioTime - videoTime);
        // Only resync if drift is significant (>0.3s) to avoid stutter
        if (drift > 0.3) {
          this._videoElement.currentTime = audioTime;
        }
        // Ensure playing
        if (this._videoElement.paused) {
          this._videoElement.play().catch(() => {});
        }
      }
      // Update video texture
      if (this._videoTexture) {
        this._videoTexture.needsUpdate = true;
      }
      // Audio-reactive uniforms
      this._videoMaterial.uniforms.uBass.value = bassPulse;
      this._videoMaterial.uniforms.uAudioIntensity.value = audioPulse;
      this._videoMaterial.uniforms.uMissFlash.value = this._missFlash * gfx;
    }

    // Camera position: always smoothly return to center (no shake)
    this.camera.position.x *= 0.85;

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
