import * as THREE from 'three';

type Options = { domElement: HTMLElement };

class ParticlesSketch {
  container: HTMLElement;
  width!: number;
  height!: number;
  camera!: THREE.PerspectiveCamera;
  scene!: THREE.Scene;
  renderer!: THREE.WebGLRenderer;
  isMobile = false;
  prefersReducedMotion = false;
  geometry?: THREE.BufferGeometry;
  material?: THREE.PointsMaterial;
  points?: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  accent!: THREE.Color;
  colors?: Float32Array;
  targetRot = new THREE.Vector2(0, 0);
  onMouseMove?: (e: MouseEvent) => void;

  constructor(options: Options) {
    this.container = options.domElement;
    if (!this.container) {
      console.error('❌ Container element not found');
      return;
    }

    // Prefer sizing from parent box; fallback to viewport for robustness
    const host = this.container.parentElement || this.container;
    const rect = host.getBoundingClientRect();
  this.width = Math.max(1, Math.floor(rect.width || (this.container as HTMLElement).clientWidth || window.innerWidth));
  const measuredHeight = Math.max(1, Math.floor(rect.height || (this.container as HTMLElement).clientHeight || Math.round(window.innerHeight * 0.7)));
  // cap the canvas height to the viewport height to avoid overflow on small screens
  this.height = Math.min(measuredHeight, Math.max(1, Math.round(window.innerHeight)));

  // responsive flags
  this.isMobile = window.innerWidth < 900 || window.matchMedia('(pointer:coarse)').matches;
  this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    console.log('📐 Initial canvas dimensions:', { width: this.width, height: this.height });

    this.init();
    this.addParticles();
  this.setupResize();
    this.setupMouse();
    this.render();
  }

  init() {
    // Camera
    this.camera = new THREE.PerspectiveCamera(60, this.width / this.height, 0.1, 1000);
    this.camera.position.z = 80;

    // Scene
    this.scene = new THREE.Scene();

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.width, this.height);
    this.container.appendChild(this.renderer.domElement);

    console.log('✅ Three.js initialized');
  }

  setupResize() {
    window.addEventListener('resize', this.resize.bind(this));
  }

  createPointSprite(): THREE.Texture {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.6, 'rgba(255,255,255,0.6)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
    ctx.fill();
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  addParticles() {
    // Brand colors from CSS variables
    const getCssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const parseColor = (cssColor: string) => new THREE.Color(cssColor || '#791ddb');
    
    this.accent = parseColor(getCssVar('--accent'));
    console.log('🎨 Using accent color:', this.accent.getHexString());

  // Galaxy params — tightened for a cleaner, more elegant spiral
  const COUNT = (this.isMobile ? 900 : 2800);
  const RADIUS = 120;
  const BRANCHES = 3;
  const SPIN = 1.6; // stronger spiral winding
  const RANDOMNESS = (this.isMobile ? 0.35 : 0.45); // keep particles closer to arms on mobile
  const RANDOMNESS_POWER = (this.isMobile ? 2.0 : 2.2); // less extreme outliers

    this.geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);

    // Outer color: slight hue shift from accent
    const colorInside = this.accent.clone();
    const colorOutside = this.accent.clone();
    colorOutside.offsetHSL(0.08, -0.2, 0.15); // subtle complementary shift

    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3;
      const radius = Math.random() * RADIUS;
      const branchAngle = ((i % BRANCHES) / BRANCHES) * Math.PI * 2;
      const spinAngle = radius * SPIN;
      const angle = branchAngle + spinAngle;

      // Random offsets with controllable power to keep near arms
      const randomX = Math.pow(Math.random(), RANDOMNESS_POWER) * (Math.random() < 0.5 ? 1 : -1) * RANDOMNESS * radius;
      const randomY = Math.pow(Math.random(), RANDOMNESS_POWER) * (Math.random() < 0.5 ? 1 : -1) * RANDOMNESS * 0.4 * radius;
      const randomZ = Math.pow(Math.random(), RANDOMNESS_POWER) * (Math.random() < 0.5 ? 1 : -1) * RANDOMNESS * radius;

      positions[i3] = Math.cos(angle) * radius + randomX;
      positions[i3 + 1] = randomY; // keep thin disk
      positions[i3 + 2] = Math.sin(angle) * radius + randomZ;

      // Color gradient center -> outside
      const mixed = colorInside.clone().lerp(colorOutside, radius / RADIUS);
      colors[i3] = mixed.r;
      colors[i3 + 1] = mixed.g;
      colors[i3 + 2] = mixed.b;
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.colors = colors;

    this.material = new THREE.PointsMaterial({
      size: 1.2, // smaller, crisper points
      sizeAttenuation: true,
      vertexColors: true,
      map: this.createPointSprite(),
      transparent: true,
      opacity: 0.65, // lighter overall so text reads
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      alphaTest: 0.02,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.scene.add(this.points);
    console.log('🎭 Created galaxy particles:', COUNT);

  // Slightly lower the galaxy so it sits under the hero copy
  if (this.points) this.points.position.y = 28;

  // Theme observer
    this.setupThemeObserver();
  }

  setupThemeObserver() {
    const getCssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const parseColor = (cssColor: string) => new THREE.Color(cssColor || '#791ddb');
    
    const updateAccent = () => {
      this.accent = parseColor(getCssVar('--accent'));
      if (this.geometry && this.colors) {
        const colorInside = this.accent.clone();
        const colorOutside = this.accent.clone();
        colorOutside.offsetHSL(0.08, -0.2, 0.15);

        const positions = this.geometry.getAttribute('position') as THREE.BufferAttribute;
        const count = positions.count;
        for (let i = 0; i < count; i++) {
          const i3 = i * 3;
          const x = positions.array[i3] as number;
          const z = positions.array[i3 + 2] as number;
          const radius = Math.sqrt(x * x + z * z);
          const mixed = colorInside.clone().lerp(colorOutside, Math.min(1, radius / 120));
          this.colors[i3] = mixed.r;
          this.colors[i3 + 1] = mixed.g;
          this.colors[i3 + 2] = mixed.b;
        }
        (this.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
      }
    };
    
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === 'data-theme') updateAccent();
      }
    });
    observer.observe(document.documentElement, { attributes: true });
  }

  setupMouse() {
    // Subtle, decaying mouse influence (parallax) — not a direct grab of the spiral
    // Skip mouse handlers on mobile or when user prefers reduced motion
    if (this.isMobile || this.prefersReducedMotion) return;

    this.onMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) - 0.5;
      const y = (e.clientY / window.innerHeight) - 0.5;
      // keep influence small so the spiral remains a gentle, professional motion
      this.targetRot.y = x * 0.14; // small yaw influence
      this.targetRot.x = -y * 0.08; // slight pitch influence
    };
    window.addEventListener('mousemove', this.onMouseMove);
  }

  resize() {
    const host = this.container.parentElement || this.container;
    const rect = host.getBoundingClientRect();
    this.width = Math.max(1, Math.floor(rect.width || (this.container as HTMLElement).clientWidth || window.innerWidth));
    this.height = Math.max(1, Math.floor(rect.height || (this.container as HTMLElement).clientHeight || Math.round(window.innerHeight * 0.7)));
    this.renderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  render() {
    if (this.points) {
  // Base tilt and slow auto-rotation to maintain spiral character
  const BASE_TILT = -0.6; // inclination in radians
  // slightly faster spin on desktop, and zero when reduced-motion requested
  const SPIN_SPEED = this.prefersReducedMotion ? 0 : (this.isMobile ? 0.00045 : 0.0012);

  // ease toward the small mouse influence while preserving the base tilt
  this.points.rotation.y += (this.targetRot.y - this.points.rotation.y) * 0.06 + SPIN_SPEED;
  this.points.rotation.x += (this.targetRot.x - this.points.rotation.x) * 0.06;
  // apply constant tilt (kept stable)
  this.points.rotation.x = BASE_TILT + (this.points.rotation.x - BASE_TILT) * 0.95;
    }
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.render.bind(this));
  }
}

// Initialize when DOM is ready
const boot = () => {
  console.log('🚀 Initializing particles...');
  const container = document.querySelector('.particles-canvas') as HTMLElement | null;
  if (container) {
    new ParticlesSketch({ domElement: container });
  } else {
    console.error('❌ Particles container not found');
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}


