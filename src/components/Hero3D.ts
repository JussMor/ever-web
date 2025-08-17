import * as THREE from 'three';

type Options = { domElement: HTMLElement };

class HeroSketch {
  container: HTMLElement;
  canvas!: HTMLCanvasElement;
  width!: number;
  height!: number;
  renderer!: THREE.WebGLRenderer;
  scene!: THREE.Scene;
  camera!: THREE.OrthographicCamera;
  material!: THREE.ShaderMaterial;
  mesh!: THREE.Mesh;
  prefersReducedMotion = false;
  isMobile = false;
  uniforms: any;
  onResize?: () => void;
  mouse = new THREE.Vector2(-1, -1);
  targetMouse = new THREE.Vector2(-1, -1);
  onMouseMove?: (e: MouseEvent) => void;
  onMouseLeave?: () => void;

  constructor(options: Options) {
    this.container = options.domElement;
    if (!this.container) throw new Error('HeroSketch: container not provided');

    // responsive flags
    this.isMobile = window.innerWidth < 900 || window.matchMedia('(pointer:coarse)').matches;
    this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.init();
    this.setupResize();
    this.setupThemeObserver();
    this.setupMouse();
    // Always draw at least one frame so users with reduced motion still see the background
    this.renderFrame();
    if (!this.prefersReducedMotion) this.render();
  }

  init() {
    // create or use existing canvas; support when the container itself is a canvas
    if (this.container instanceof HTMLCanvasElement) {
      this.canvas = this.container;
    } else {
      const existing = this.container.querySelector('canvas');
      if (existing && existing instanceof HTMLCanvasElement) {
        this.canvas = existing;
      } else {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'hero-canvas';
    // Inherit hero-canvas styling
    this.canvas.classList.add('hero-canvas');
    this.container.appendChild(this.canvas);
      }
    }

    // sizing from host
    const host = this.container.parentElement || this.container;
    const rect = host.getBoundingClientRect();
    this.width = Math.max(1, Math.floor(rect.width || this.canvas.clientWidth || window.innerWidth));
    this.height = Math.max(1, Math.floor(rect.height || this.canvas.clientHeight || Math.round(window.innerHeight * 0.6)));

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.width, this.height, false);
    this.renderer.setClearColor(0x000000, 0);

    // Camera: full-screen quad uses an orthographic camera
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Scene
    this.scene = new THREE.Scene();

    // Uniforms
    this.uniforms = {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(this.width, this.height) },
      uColor: { value: new THREE.Color(this.getAccentColor()) },
      uSpacing: { value: this.isMobile ? 28.0 : 36.0 },
      uLineWidth: { value: 1.0 },
      uSweepSpeed: { value: 0.06 },
      uSweepIntensity: { value: 1.2 },
      uMouse: { value: new THREE.Vector2(-1, -1) },
      uHoverRadius: { value: 0.15 },
      uHoverIntensity: { value: 0.8 },
      uWaveSpeed: { value: 3.0 },
      uWaveFrequency: { value: 8.0 },
    uWaveAmplitude: { value: 0.5 }
    };    const vertex = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    const fragment = `
      precision highp float;
      varying vec2 vUv;
      uniform float uTime;
      uniform vec2 uResolution;
      uniform vec3 uColor;
      uniform float uSpacing;
      uniform float uLineWidth;
      uniform float uSweepSpeed;
      uniform float uSweepIntensity;
      uniform vec2 uMouse;
      uniform float uHoverRadius;
      uniform float uHoverIntensity;
      uniform float uWaveSpeed;
      uniform float uWaveFrequency;
      uniform float uWaveAmplitude;

      float line(float coord, float spacing, float width) {
        float m = mod(coord, spacing);
        float d = abs(m - spacing * 0.5);
        return 1.0 - smoothstep(width - 0.5, width + 0.5, d);
      }

      void main() {
        vec2 uvPixels = vUv * uResolution;
        float lx = line(uvPixels.x, uSpacing, uLineWidth);
        float ly = line(uvPixels.y, uSpacing, uLineWidth);
        float grid = max(lx, ly);

        // Animated sweep
        float sweepPos = mod(uTime * uSweepSpeed * uResolution.x, uResolution.x);
        float sweepDist = abs(uvPixels.x - sweepPos);
        float sweep = 1.0 - smoothstep(0.0, uResolution.x * 0.12, sweepDist);
        sweep *= uSweepIntensity;

        // Interactive hover wave effect
        float hoverGlow = 0.0;
        if (uMouse.x >= 0.0 && uMouse.y >= 0.0) {
          vec2 mousePixels = uMouse * uResolution;
          float mouseDist = distance(uvPixels, mousePixels);
          float hoverRadius = uHoverRadius * min(uResolution.x, uResolution.y);
          
          // Create wave ripples emanating from mouse
          float wave = sin(mouseDist * uWaveFrequency - uTime * uWaveSpeed) * 0.5 + 0.5;
          wave *= uWaveAmplitude;
          
          // Combine wave with distance falloff
          float falloff = 1.0 - smoothstep(0.0, hoverRadius * 2.0, mouseDist);
          hoverGlow = wave * falloff * uHoverIntensity;
          
          // Add a subtle center glow
          float centerGlow = 1.0 - smoothstep(0.0, hoverRadius * 0.3, mouseDist);
          hoverGlow += centerGlow * 0.4 * uHoverIntensity;
        }

        float intensity = grid * (0.8 + hoverGlow * 0.6) + sweep * 0.9 * grid + hoverGlow * grid * 1.2;
        vec3 col = vec3(0.2) + uColor * intensity * (1.5 + hoverGlow * 0.8);
        float alpha = intensity * (0.5 + hoverGlow * 0.3);
        gl_FragColor = vec4(col, alpha);
      }
    `;

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthTest: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.scene.add(this.mesh);

    // listeners (bound but setup will trigger initial size)
    this.onResize = this.resize.bind(this);
    window.addEventListener('resize', this.onResize, { passive: true });
  }

  setupResize() {
    // ensure initial sizing is correct
    this.resize();
  }

  setupMouse() {
    // Skip mouse interactions on mobile or when user prefers reduced motion
    if (this.isMobile || this.prefersReducedMotion) return;

    this.onMouseMove = (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const inside = (
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom
      );
      if (!inside) {
        this.targetMouse.set(-1, -1);
        return;
      }
      // Convert to normalized coordinates (0-1), flipping Y for shader space
      this.targetMouse.x = (e.clientX - rect.left) / rect.width;
      this.targetMouse.y = 1.0 - (e.clientY - rect.top) / rect.height;
    };

    this.onMouseLeave = () => {
      this.targetMouse.set(-1, -1); // hide hover effect when leaving viewport
    };

    window.addEventListener('mousemove', this.onMouseMove, { passive: true });
    window.addEventListener('mouseleave', this.onMouseLeave, { passive: true });
  }

  getAccentColor() {
    try {
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--accent');
      if (raw) return raw.trim();
    } catch (e) {
      // ignore
    }
    return '#9fb7ff';
  }

  setupThemeObserver() {
    const update = () => {
      const col = new THREE.Color(this.getAccentColor());
      if (this.uniforms && this.uniforms.uColor) {
        this.uniforms.uColor.value.copy(col);
      }
    };
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === 'data-theme') update();
      }
    });
    obs.observe(document.documentElement, { attributes: true });
  }

  resize() {
    const host = this.container.parentElement || this.container;
    const rect = host.getBoundingClientRect();
    this.width = Math.max(1, Math.floor(rect.width || this.canvas.clientWidth || window.innerWidth));
    this.height = Math.max(1, Math.floor(rect.height || this.canvas.clientHeight || Math.round(window.innerHeight * 0.6)));
    this.renderer.setSize(this.width, this.height, false);
    this.uniforms.uResolution.value.set(this.width, this.height);
  }

  render() {
    let last = performance.now();
    const loop = () => {
      const now = performance.now();
      const dt = (now - last) * 0.001;
      last = now;
      
      // Update time
      this.uniforms.uTime.value += dt;
      
      // Smooth mouse following with easing
      this.mouse.lerp(this.targetMouse, 0.1);
      this.uniforms.uMouse.value.copy(this.mouse);
      
      this.renderer.render(this.scene, this.camera);
      if (!this.prefersReducedMotion) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  renderFrame() {
    // Render a single frame without advancing time much
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
  if (this.onResize) window.removeEventListener('resize', this.onResize);
  if (this.onMouseMove) window.removeEventListener('mousemove', this.onMouseMove);
  if (this.onMouseLeave) window.removeEventListener('mouseleave', this.onMouseLeave);
    this.scene.remove(this.mesh);
    this.material.dispose();
    (this.mesh.geometry as THREE.BufferGeometry).dispose();
    this.renderer.dispose();
  }
}

// Safe boot
const boot = () => {
  console.log('🚀 Initializing Hero3D...');
  const container = (document.getElementById('hero-canvas') as HTMLElement | null)
    || (document.querySelector('.hero-canvas') as HTMLElement | null)
    || (document.getElementById('hero') as HTMLElement | null);
  if (!container) {
    console.error('❌ Hero container not found');
    return;
  }
  try {
    console.log('✅ Found hero container:', container);
    new HeroSketch({ domElement: container });
  } catch (e) {
    console.warn('Hero3D: initialization failed', e);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

