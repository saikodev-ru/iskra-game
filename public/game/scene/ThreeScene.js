import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import EventBus from '../core/EventBus.js';

export default class ThreeScene {
  constructor(canvas) {
    this.canvas = canvas;
    this._beatIntensity = 0;
    this._bloomTarget = 0.6;
    this._shakeFrames = [];
    this._tvGroup = null;
    this._tvScreen = null;
    this._tvScreenMaterial = null;
    this._currentTexture = null;
    this._bgMaterial = null;
    
    this._init();
    this._setupListeners();
  }

  _init() {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    
    // Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0A0A0F, 0.02);
    
    // Camera
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 0, 5);
    
    // Lighting
    const ambient = new THREE.AmbientLight(0x111122, 0.3);
    this.scene.add(ambient);
    
    this.pointLight = new THREE.PointLight(0x00C2FF, 2, 50);
    this.pointLight.position.set(0, 0, 4);
    this.scene.add(this.pointLight);
    
    // Background mesh — animated grid
    this._createBackground();
    
    // Post-processing
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);
    
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.6,  // strength
      0.3,  // radius
      0.4   // threshold
    );
    this.composer.addPass(this.bloomPass);
    
    this.filmPass = new FilmPass(0.15, false);
    this.composer.addPass(this.filmPass);
    
    // Resize handler
    window.addEventListener('resize', () => this.resize());
  }

  _createBackground() {
    // Custom shader for animated grid
    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
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
        
        // Animated grid
        float g1 = grid(uv, 10.0);
        float g2 = grid(uv + 0.05 * uTime, 20.0) * 0.3;
        
        // Beat pulse
        float pulse = uBeatIntensity * 0.5;
        
        // Color
        vec3 baseColor = vec3(0.04, 0.06, 0.09);
        vec3 gridColor = vec3(0.0, 0.5, 0.6);
        vec3 beatColor = vec3(0.0, 0.9, 1.0);
        
        vec3 color = baseColor + gridColor * (g1 + g2) * 0.3 + beatColor * pulse;
        
        // Vignette
        float vig = distance(vUv, vec2(0.5));
        color *= smoothstep(0.8, 0.3, vig);
        
        gl_FragColor = vec4(color, 1.0);
      }
    `;
    
    this._bgMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBeatIntensity: { value: 0 }
      },
      vertexShader,
      fragmentShader,
      side: THREE.DoubleSide
    });
    
    const bgGeo = new THREE.PlaneGeometry(20, 15);
    const bgMesh = new THREE.Mesh(bgGeo, this._bgMaterial);
    bgMesh.position.z = -8;
    this.scene.add(bgMesh);
  }

  _setupListeners() {
    EventBus.on('note:hit', ({ judgement }) => {
      if (judgement === 'perfect') {
        this._bloomTarget = 1.4;
        setTimeout(() => this._bloomTarget = 0.6, 200);
        // Yellow emissive flash
        this.pointLight.color.set(0xF5C518);
        this.pointLight.intensity = 4;
        setTimeout(() => {
          this.pointLight.color.set(0x00C2FF);
          this.pointLight.intensity = 2;
        }, 200);
      } else if (judgement === 'great') {
        this._bloomTarget = 1.0;
        setTimeout(() => this._bloomTarget = 0.6, 150);
        // Cyan flash
        this.pointLight.intensity = 3;
        setTimeout(() => this.pointLight.intensity = 2, 150);
      } else if (judgement === 'bad') {
        // Dim red flash
        this.pointLight.color.set(0xFF3D3D);
        this.pointLight.intensity = 1.5;
        setTimeout(() => {
          this.pointLight.color.set(0x00C2FF);
          this.pointLight.intensity = 2;
        }, 100);
      }
    });
    
    EventBus.on('note:miss', () => {
      // Camera shake: +4,-4,+2,-2,0 over 5 frames
      this._shakeFrames = [4, -4, 2, -2, 0];
    });
    
    EventBus.on('beat:pulse', () => {
      this._beatIntensity = 1;
    });
    
    EventBus.on('combo:break', () => {
      // Red vignette spike via film pass
      if (this.filmPass.uniforms && this.filmPass.uniforms.intensity) {
        this.filmPass.uniforms.intensity.value = 0.8;
        setTimeout(() => {
          if (this.filmPass.uniforms && this.filmPass.uniforms.intensity) {
            this.filmPass.uniforms.intensity.value = 0.15;
          }
        }, 300);
      }
    });
  }

  // TV Monitor for Song Select
  createTVMonitor() {
    if (this._tvGroup) return;
    
    this._tvGroup = new THREE.Group();
    
    // Frame
    const frameGeo = new THREE.BoxGeometry(3.2, 2.4, 0.4);
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x1a1f2e,
      roughness: 0.8,
      metalness: 0.2
    });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    this._tvGroup.add(frame);
    
    // Screen
    const screenGeo = new THREE.PlaneGeometry(2.9, 2.1);
    this._tvScreenMaterial = new THREE.MeshBasicMaterial({
      color: 0x0D1117,
      side: THREE.DoubleSide
    });
    this._tvScreen = new THREE.Mesh(screenGeo, this._tvScreenMaterial);
    this._tvScreen.position.z = 0.21;
    this._tvGroup.add(this._tvScreen);
    
    // Screen glow
    const glowLight = new THREE.PointLight(0x00E5FF, 0.5, 3);
    glowLight.position.z = 0.5;
    this._tvGroup.add(glowLight);
    this._tvGlowLight = glowLight;
    
    // Position
    this._tvGroup.position.set(-3, 0.5, 0);
    this._tvGroup.rotation.y = 0.2;
    this.scene.add(this._tvGroup);
  }

  removeTVMonitor() {
    if (this._tvGroup) {
      this.scene.remove(this._tvGroup);
      this._tvGroup = null;
      this._tvScreen = null;
      this._tvScreenMaterial = null;
      if (this._currentTexture) {
        this._currentTexture.dispose();
        this._currentTexture = null;
      }
    }
  }

  setTVTexture(imageUrl) {
    if (!this._tvScreenMaterial) return;
    
    const loader = new THREE.TextureLoader();
    loader.load(imageUrl, (texture) => {
      if (this._currentTexture) this._currentTexture.dispose();
      this._currentTexture = texture;
      this._tvScreenMaterial.map = texture;
      this._tvScreenMaterial.color.set(0xffffff);
      this._tvScreenMaterial.needsUpdate = true;
      
      // Channel switch spin animation
      if (this._tvGroup) {
        const startRot = this._tvGroup.rotation.y;
        this._tvSpinAnim = { start: performance.now(), duration: 200, startRot };
      }
    });
  }

  setTVStatic() {
    if (!this._tvScreenMaterial) return;
    if (this._currentTexture) {
      this._currentTexture.dispose();
      this._currentTexture = null;
    }
    this._tvScreenMaterial.map = null;
    this._tvScreenMaterial.color.set(0x0D1117);
    this._tvScreenMaterial.needsUpdate = true;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  update(time) {
    // Update background shader
    if (this._bgMaterial) {
      this._bgMaterial.uniforms.uTime.value = time * 0.001;
      this._bgMaterial.uniforms.uBeatIntensity.value = this._beatIntensity;
      this._beatIntensity *= 0.9; // decay
    }
    
    // Bloom interpolation
    this.bloomPass.strength += (this._bloomTarget - this.bloomPass.strength) * 0.15;
    
    // Camera shake
    if (this._shakeFrames.length > 0) {
      this.camera.position.x = this._shakeFrames.shift();
    } else {
      this.camera.position.x *= 0.8; // settle
    }
    
    // TV idle rotation
    if (this._tvGroup && !this._tvSpinAnim) {
      this._tvGroup.rotation.y = 0.2 + Math.sin(time * 0.001 * 0.5 * Math.PI) * 0.05;
    }
    
    // TV spin animation
    if (this._tvSpinAnim) {
      const elapsed = performance.now() - this._tvSpinAnim.start;
      const progress = Math.min(1, elapsed / this._tvSpinAnim.duration);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      this._tvGroup.rotation.y = this._tvSpinAnim.startRot + eased * Math.PI * 2;
      if (progress >= 1) {
        this._tvGroup.rotation.y = this._tvSpinAnim.startRot;
        this._tvSpinAnim = null;
      }
    }
    
    // Render
    this.composer.render();
  }
}
