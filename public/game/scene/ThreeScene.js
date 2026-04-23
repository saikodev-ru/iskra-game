import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import EventBus from '../core/EventBus.js';

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
    this._init();
    this._setupListeners();
  }

  _init() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0A0A0A, 0.015);
    
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 0, 5);
    
    // Lighting — lime accent
    const ambient = new THREE.AmbientLight(0x111111, 0.4);
    this.scene.add(ambient);
    this.pointLight = new THREE.PointLight(0xAAFF00, 1.5, 50);
    this.pointLight.position.set(0, 0, 4);
    this.scene.add(this.pointLight);
    
    this._createBackground();
    
    // Post-processing
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.3, 0.4);
    this.composer.addPass(this.bloomPass);
    
    window.addEventListener('resize', () => this.resize());
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
      float grid(vec2 uv, float size) {
        vec2 g = abs(fract(uv * size - 0.5) - 0.5) / fwidth(uv * size);
        return 1.0 - min(min(g.x, g.y), 1.0);
      }
      void main() {
        vec2 uv = vUv;
        float g1 = grid(uv, 8.0);
        float g2 = grid(uv + 0.03 * uTime, 16.0) * 0.2;
        float pulse = uBeatIntensity * 0.4;
        vec3 baseColor = vec3(0.04, 0.04, 0.04);
        vec3 gridColor = vec3(0.3, 0.5, 0.0);
        vec3 beatColor = vec3(0.67, 1.0, 0.0);
        vec3 color = baseColor + gridColor * (g1 + g2) * 0.2 + beatColor * pulse;
        float vig = distance(vUv, vec2(0.5));
        color *= smoothstep(0.8, 0.3, vig);
        gl_FragColor = vec4(color, 1.0);
      }
    `;
    this._bgMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uBeatIntensity: { value: 0 } },
      vertexShader, fragmentShader, side: THREE.DoubleSide
    });
    const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(20, 15), this._bgMaterial);
    bgMesh.position.z = -8;
    this.scene.add(bgMesh);
  }

  _setupListeners() {
    EventBus.on('note:hit', ({ judgement }) => {
      if (judgement === 'perfect') {
        this._bloomTarget = 1.2;
        setTimeout(() => this._bloomTarget = 0.5, 200);
        this.pointLight.color.set(0xAAFF00);
        this.pointLight.intensity = 4;
        setTimeout(() => { this.pointLight.color.set(0xAAFF00); this.pointLight.intensity = 1.5; }, 200);
      } else if (judgement === 'great') {
        this._bloomTarget = 0.9;
        setTimeout(() => this._bloomTarget = 0.5, 150);
        this.pointLight.intensity = 3;
        setTimeout(() => this.pointLight.intensity = 1.5, 150);
      } else if (judgement === 'bad') {
        this.pointLight.color.set(0xFF3D3D);
        this.pointLight.intensity = 1.5;
        setTimeout(() => { this.pointLight.color.set(0xAAFF00); this.pointLight.intensity = 1.5; }, 100);
      }
    });
    EventBus.on('note:miss', () => { this._shakeFrames = [4, -4, 2, -2, 0]; });
    EventBus.on('beat:pulse', () => { this._beatIntensity = 1; });
  }

  createTVMonitor() {
    if (this._tvGroup) return;
    this._tvGroup = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7, metalness: 0.3 });
    this._tvGroup.add(new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.5, 0.25), frameMat));
    this._tvScreenMaterial = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide });
    this._tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.25), this._tvScreenMaterial);
    this._tvScreen.position.z = 0.13;
    this._tvGroup.add(this._tvScreen);
    const glowLight = new THREE.PointLight(0xAAFF00, 0.3, 2);
    glowLight.position.z = 0.3;
    this._tvGroup.add(glowLight);
    // Bottom-left corner, angled as if sitting in front of it
    this._tvGroup.position.set(-4.5, -2.5, 1);
    this._tvGroup.rotation.y = 0.35;
    this._tvGroup.rotation.x = -0.1;
    this.scene.add(this._tvGroup);
  }

  removeTVMonitor() {
    if (this._tvGroup) {
      this.scene.remove(this._tvGroup);
      this._tvGroup = null; this._tvScreen = null; this._tvScreenMaterial = null;
      if (this._currentTexture) { this._currentTexture.dispose(); this._currentTexture = null; }
    }
  }

  setTVTexture(imageUrl) {
    if (!this._tvScreenMaterial) return;
    new THREE.TextureLoader().load(imageUrl, (texture) => {
      if (this._currentTexture) this._currentTexture.dispose();
      this._currentTexture = texture;
      this._tvScreenMaterial.map = texture;
      this._tvScreenMaterial.color.set(0xffffff);
      this._tvScreenMaterial.needsUpdate = true;
      if (this._tvGroup) this._tvSpinAnim = { start: performance.now(), duration: 200, startRot: this._tvGroup.rotation.y };
    });
  }

  setTVStatic() {
    if (!this._tvScreenMaterial) return;
    if (this._currentTexture) { this._currentTexture.dispose(); this._currentTexture = null; }
    this._tvScreenMaterial.map = null;
    this._tvScreenMaterial.color.set(0x111111);
    this._tvScreenMaterial.needsUpdate = true;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  update(time) {
    if (this._bgMaterial) {
      this._bgMaterial.uniforms.uTime.value = time * 0.001;
      this._bgMaterial.uniforms.uBeatIntensity.value = this._beatIntensity;
      this._beatIntensity *= 0.9;
    }
    this.bloomPass.strength += (this._bloomTarget - this.bloomPass.strength) * 0.15;
    if (this._shakeFrames.length > 0) this.camera.position.x = this._shakeFrames.shift();
    else this.camera.position.x *= 0.8;
    // Subtle idle sway for TV
    if (this._tvGroup && !this._tvSpinAnim) {
      this._tvGroup.rotation.y = 0.35 + Math.sin(time * 0.001 * 0.3 * Math.PI) * 0.03;
    }
    if (this._tvSpinAnim) {
      const elapsed = performance.now() - this._tvSpinAnim.start;
      const progress = Math.min(1, elapsed / this._tvSpinAnim.duration);
      this._tvGroup.rotation.y = this._tvSpinAnim.startRot + (1 - Math.pow(1 - progress, 3)) * Math.PI * 2;
      if (progress >= 1) { this._tvGroup.rotation.y = this._tvSpinAnim.startRot; this._tvSpinAnim = null; }
    }
    this.composer.render();
  }
}
