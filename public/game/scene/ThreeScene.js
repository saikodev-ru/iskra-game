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

    this._init();
    this._setupListeners();
  }

  /** Set the audio engine reference for reactive analysis */
  setAudioEngine(audioEngine) {
    this._audioEngine = audioEngine;
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
        gl_FragColor = vec4(color, 1.0);
      }
    `;
    this._bgMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBeatIntensity: { value: 0 },
        uBassIntensity: { value: 0 },
        uAudioIntensity: { value: 0 },
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

  /** Set a background image for song select — full-screen cover, audio-reactive glow + zoom */
  setBackgroundImage(url) {
    this._clearBackgroundImage();
    if (!url) return;

    new THREE.TextureLoader().load(url, (texture) => {
      if (this._disposed) return;
      this._bgImageTexture = texture;

      // Calculate "cover" UV offset based on image vs plane aspect ratio
      const imgAspect = texture.image ? texture.image.width / texture.image.height : 16 / 9;
      this._bgImageCoverScale = imgAspect;

      this._bgImageMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uTexture: { value: texture },
          uBass: { value: 0 },
          uAudioIntensity: { value: 0 },
          uCoverScale: { value: imgAspect },
          uPlaneAspect: { value: 1.0 }, // will be set when creating mesh
        },
        vertexShader: `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: `
          uniform sampler2D uTexture;
          uniform float uBass;
          uniform float uAudioIntensity;
          uniform float uCoverScale;
          uniform float uPlaneAspect;
          varying vec2 vUv;
          void main() {
            vec2 uv = vUv;

            // ── Cover-fit: adjust UVs so image fills the plane (like background-size: cover) ──
            float planeAspect = uPlaneAspect;
            float imgAspect = uCoverScale;
            if (planeAspect > imgAspect) {
              // Plane is wider than image → scale UVs vertically, crop top/bottom
              float scale = planeAspect / imgAspect;
              uv.y = (uv.y - 0.5) / scale + 0.5;
            } else {
              // Plane is taller than image → scale UVs horizontally, crop left/right
              float scale = imgAspect / planeAspect;
              uv.x = (uv.x - 0.5) / scale + 0.5;
            }

            // ── Subtle zoom on bass (z-scale effect) ──
            float zoom = 1.0 + uBass * 0.02;
            uv = (uv - 0.5) / zoom + 0.5;

            vec4 tex = texture2D(uTexture, uv);

            // ── Darken base so UI is readable ──
            vec3 color = tex.rgb * 0.35;

            // ── Glow: brighten on audio ──
            float glow = uBass * 0.25 + uAudioIntensity * 0.1;
            color += tex.rgb * glow;

            // ── Subtle vignette overlay for depth ──
            float vig = distance(vUv, vec2(0.5));
            color *= smoothstep(0.9, 0.3, vig) * 0.5 + 0.5;

            gl_FragColor = vec4(color, 1.0);
          }
        `,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      // Create a plane that covers the full camera viewport
      const cam = this.camera;
      const dist = 9;
      const vFov = cam.fov * Math.PI / 180;
      const planeH = 2 * Math.tan(vFov / 2) * dist;
      const planeW = planeH * cam.aspect;
      this._bgImageMaterial.uniforms.uPlaneAspect.value = planeW / planeH;

      this._bgImageMesh = new THREE.Mesh(new THREE.PlaneGeometry(planeW, planeH), this._bgImageMaterial);
      this._bgImageMesh.position.z = -dist;
      this.scene.add(this._bgImageMesh);
    });
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
        this._shakeFrames = [3, -3, 1.5, -1.5, 0];
        this._bloomTarget = 0.3;
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

  setTVTexture(imageUrl) {
    // TV disabled — use background image instead for song select
    this.setBackgroundImage(imageUrl);
  }

  setTVStatic() {
    this._clearBackgroundImage();
  }

  setAspectRatio(ar) { this._aspectRatio = ar; this.resize(); }

  resize() {
    if (this._disposed) return;
    const w = window.innerWidth, h = window.innerHeight;
    const ar = this._aspectRatio;
    if (ar !== 'Fill') {
      const parts = ar.split(':');
      const arW = parseInt(parts[0]) || 16;
      const arH = parseInt(parts[1]) || 9;
      this.camera.aspect = arW / arH;
    } else {
      this.camera.aspect = w / h;
    }
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.renderer.setClearColor(0x000000, 1);
  }

  update(time) {
    if (this._disposed || this._contextLost) return;

    // Get audio levels for reactive effects
    if (this._audioEngine) {
      this._audioLevels = this._audioEngine.getAudioLevels();
    }

    const levels = this._audioLevels;
    const bassPulse = levels.bass;
    const audioPulse = levels.intensity;

    // ── Background shader ──
    if (this._bgMaterial) {
      this._bgMaterial.uniforms.uTime.value = time * 0.001;
      this._bgMaterial.uniforms.uBeatIntensity.value = this._beatIntensity;
      this._bgMaterial.uniforms.uBassIntensity.value = bassPulse;
      this._bgMaterial.uniforms.uAudioIntensity.value = audioPulse;
      this._beatIntensity *= 0.88;
    }

    // ── Background image — audio-reactive cover with glow + zoom ──
    if (this._bgImageMesh && this._bgImageMaterial && this._bgImageMaterial.uniforms) {
      this._bgImageMaterial.uniforms.uBass.value = bassPulse;
      this._bgImageMaterial.uniforms.uAudioIntensity.value = audioPulse;
    }

    // ── Particles — audio-reactive (only when visible) ──
    if (this._particles && this._particlesVisible) {
      const pos = this._particles.geometry.attributes.position.array;
      const drift = 0.001 + bassPulse * 0.004;
      for (let i = 0; i < pos.length; i += 3) {
        pos[i + 1] += Math.sin(time * 0.0003 + i) * drift;
        pos[i] += Math.cos(time * 0.0002 + i * 0.5) * drift * 0.5;
      }
      this._particles.geometry.attributes.position.needsUpdate = true;
      this._particles.material.opacity = 0.15 + bassPulse * 0.35 + this._beatIntensity * 0.2;
      this._particles.material.size = 0.04 + bassPulse * 0.03;
    }

    // ── Camera FOV — smooth audio-reactive, NO hit-driven FOV pulse ──
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

    // ── Camera shake ──
    if (this._shakeFrames.length > 0) {
      this.camera.position.x = this._shakeFrames.shift();
    } else {
      this.camera.position.x *= 0.8;
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

    this.removeTVMonitor();
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
