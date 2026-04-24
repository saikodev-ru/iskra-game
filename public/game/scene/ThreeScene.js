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
    this._bloomTarget = 0.5;
    this._shakeFrames = [];
    this._tvGroup = null;
    this._tvScreen = null;
    this._tvScreenMaterial = null;
    this._currentTexture = null;
    this._bgMaterial = null;
    this._tvSpinAnim = null;
    this._particles = null;
    this._aspectRatio = '16:9';
    this._resScale = 1.0;
    this._disposed = false;
    this._contextLost = false;
    this._resizeHandler = null;

    this._init();
    this._setupListeners();
  }

  _init() {
    // Dispose any previous instances to free WebGL contexts
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

    // Handle context loss
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this._contextLost = true;
      console.warn('[ThreeScene] WebGL context lost');
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this._contextLost = false;
      console.log('[ThreeScene] WebGL context restored');
      this._rebuildScene();
    });

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
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

    this._createBackground();
    this._createParticles();

    // Post-processing
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.3, 0.4);
    this.composer.addPass(this.bloomPass);

    this._resizeHandler = () => this.resize();
    window.addEventListener('resize', this._resizeHandler);

    // Register this instance
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
    // Re-initialize renderer state after context restore
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
      varying vec2 vUv;
      void main() {
        vec2 uv = vUv;
        float pulse = uBeatIntensity * 0.3;
        vec3 baseColor = vec3(0.03, 0.03, 0.05);
        float vig = distance(vUv, vec2(0.5));
        baseColor *= smoothstep(0.9, 0.3, vig);
        vec3 beatColor = vec3(0.4, 0.7, 0.0) * pulse * smoothstep(0.7, 0.0, vig);
        float shimmer = fract(sin(dot(uv * 100.0 + uTime * 0.1, vec2(12.9898, 78.233))) * 43758.5453);
        baseColor += vec3(0.01) * shimmer;
        vec3 color = baseColor + beatColor;
        gl_FragColor = vec4(color, 1.0);
      }
    `;
    this._bgMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uBeatIntensity: { value: 0 } },
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
    this.scene.add(this._particles);
  }

  _setupListeners() {
    EventBus.on('note:hit', ({ judgement }) => {
      if (this._disposed) return;
      if (judgement === 'perfect') {
        this._bloomTarget = 1.2;
        setTimeout(() => this._bloomTarget = 0.5, 200);
        this.pointLight.intensity = 4;
        setTimeout(() => { this.pointLight.intensity = 1.5; }, 200);
      } else if (judgement === 'great') {
        this._bloomTarget = 0.9;
        setTimeout(() => this._bloomTarget = 0.5, 150);
        this.pointLight.intensity = 3;
        setTimeout(() => { this.pointLight.intensity = 1.5; }, 150);
      } else if (judgement === 'bad') {
        this.pointLight.color.set(0xFF3D3D);
        this.pointLight.intensity = 1.5;
        setTimeout(() => { this.pointLight.color.set(0xAAFF00); this.pointLight.intensity = 1.5; }, 100);
      }
    });
    EventBus.on('note:miss', () => { if (!this._disposed) this._shakeFrames = [4, -4, 2, -2, 0]; });
    EventBus.on('beat:pulse', () => { if (!this._disposed) this._beatIntensity = 1; });
  }

  createTVMonitor() {
    if (this._disposed || this._tvGroup) return;
    this._tvGroup = new THREE.Group();

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7, metalness: 0.3 });
    this._tvGroup.add(new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.0, 0.25), frameMat));

    const bezelMat = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.9, metalness: 0.1 });
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.75, 0.04), bezelMat);
    bezel.position.z = 0.14;
    this._tvGroup.add(bezel);

    this._tvScreenMaterial = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide });
    this._tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.55), this._tvScreenMaterial);
    this._tvScreen.position.z = 0.17;
    this._tvGroup.add(this._tvScreen);

    const glowLight = new THREE.PointLight(0xAAFF00, 0.4, 3);
    glowLight.position.set(0, 0, 0.5);
    this._tvGroup.add(glowLight);
    this._tvGlowLight = glowLight;

    const standMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8, metalness: 0.2 });
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.5), standMat);
    stand.position.set(0, -1.1, 0.1);
    this._tvGroup.add(stand);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.45, 0.15), standMat);
    neck.position.set(0, -0.85, 0.05);
    this._tvGroup.add(neck);

    this._tvGroup.position.set(-3.5, -1.8, 0.5);
    this._tvGroup.rotation.y = 0.35;
    this._tvGroup.rotation.x = -0.05;
    this.scene.add(this._tvGroup);
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
    if (this._disposed || !this._tvScreenMaterial) return;
    new THREE.TextureLoader().load(imageUrl, (texture) => {
      if (this._disposed) return;
      if (this._currentTexture) this._currentTexture.dispose();
      this._currentTexture = texture;
      this._tvScreenMaterial.map = texture;
      this._tvScreenMaterial.color.set(0xffffff);
      this._tvScreenMaterial.needsUpdate = true;
      if (this._tvGroup) this._tvSpinAnim = { start: performance.now(), duration: 200, startRot: this._tvGroup.rotation.y };
      if (this._tvGlowLight) {
        this._tvGlowLight.intensity = 1.5;
        setTimeout(() => { if (this._tvGlowLight && !this._disposed) this._tvGlowLight.intensity = 0.4; }, 300);
      }
    });
  }

  setTVStatic() {
    if (this._disposed || !this._tvScreenMaterial) return;
    if (this._currentTexture) { this._currentTexture.dispose(); this._currentTexture = null; }
    this._tvScreenMaterial.map = null;
    this._tvScreenMaterial.color.set(0x111111);
    this._tvScreenMaterial.needsUpdate = true;
  }

  setAspectRatio(ar) { this._aspectRatio = ar; this.resize(); }
  setResScale(scale) { this._resScale = scale; this.resize(); }

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
  }

  update(time) {
    if (this._disposed || this._contextLost) return;

    if (this._bgMaterial) {
      this._bgMaterial.uniforms.uTime.value = time * 0.001;
      this._bgMaterial.uniforms.uBeatIntensity.value = this._beatIntensity;
      this._beatIntensity *= 0.9;
    }

    if (this._particles) {
      const pos = this._particles.geometry.attributes.position.array;
      for (let i = 0; i < pos.length; i += 3) {
        pos[i + 1] += Math.sin(time * 0.0003 + i) * 0.002;
        pos[i] += Math.cos(time * 0.0002 + i * 0.5) * 0.001;
      }
      this._particles.geometry.attributes.position.needsUpdate = true;
      this._particles.material.opacity = 0.15 + this._beatIntensity * 0.2;
    }

    this.bloomPass.strength += (this._bloomTarget - this.bloomPass.strength) * 0.15;
    if (this._shakeFrames.length > 0) this.camera.position.x = this._shakeFrames.shift();
    else this.camera.position.x *= 0.8;

    if (this._tvGroup && !this._tvSpinAnim) {
      this._tvGroup.rotation.y = 0.35 + Math.sin(time * 0.001 * 0.3 * Math.PI) * 0.03;
    }
    if (this._tvSpinAnim) {
      const elapsed = performance.now() - this._tvSpinAnim.start;
      const progress = Math.min(1, elapsed / this._tvSpinAnim.duration);
      this._tvGroup.rotation.y = this._tvSpinAnim.startRot + (1 - Math.pow(1 - progress, 3)) * Math.PI * 2;
      if (progress >= 1) { this._tvGroup.rotation.y = this._tvSpinAnim.startRot; this._tvSpinAnim = null; }
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

    // Remove resize listener
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }

    // Dispose TV
    this.removeTVMonitor();

    // Dispose particles
    if (this._particles) {
      this._particles.geometry.dispose();
      this._particles.material.dispose();
      this._particles = null;
    }

    // Dispose background material
    if (this._bgMaterial) {
      this._bgMaterial.dispose();
      this._bgMaterial = null;
    }

    // Dispose scene objects
    this.scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });

    // Dispose composer (frees render targets)
    if (this.composer) {
      this.composer.passes.forEach(p => { if (p.dispose) p.dispose(); });
    }

    // Dispose renderer — THIS frees the WebGL context
    if (this.renderer) {
      this.renderer.dispose();
      // Force context loss to free GPU resources
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    }

    // Remove from global registry
    const idx = window.__threeSceneInstances.indexOf(this);
    if (idx >= 0) window.__threeSceneInstances.splice(idx, 1);
  }
}
