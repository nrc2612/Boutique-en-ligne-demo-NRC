// Fond "liquid gradient" VHS cramé pour le hero (Three.js r128) — réagit à la souris / au doigt.
(() => {
  const hero = document.querySelector('.hero');
  if (!hero || typeof THREE === 'undefined') return;

  // ---------- Réglages (à modifier librement) ----------
  const PALETTE = {
    vivid: ['#F15A22', '#bb6dce', '#e02d2d'], // couleurs lumineuses (orange, violet, rouge)
    dark: '#181d25'                            // fond sombre (= --bg)
  };
  const SPEED = 1.5;      // vitesse d'animation
  const INTENSITY = 1.8;  // intensité globale du dégradé
  const GRAIN = 0.08;     // grain de film (0 = aucun)
  const SIZE = 0.45;      // taille des taches de couleur
  const BALANCE = { vivid: 0.5, dark: 1.8 }; // vivid ↑ = plus de couleur, dark ↑ = plus de fond sombre

  const VHS = {
    glitch: 1.0,     // tremblement des lignes + bandes de tracking (0 = aucun)
    split: 1.0,      // décalage rouge/bleu, aberration chromatique (0 = aucun)
    scanlines: 0.18, // force des lignes de balayage (0 = aucune)
    exposure: 1.4,   // > 1 = image plus "cramée"
    burn: 0.7        // 0 à 1 : les zones claires virent au blanc chaud
  };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const vec = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  };

  // ---------- Texture d'interaction (traînée de la souris) ----------
  class TouchTexture {
    constructor() {
      this.size = 64;
      this.maxAge = 64;
      this.radius = 0.25 * this.size;
      this.speed = 1 / this.maxAge;
      this.trail = [];
      this.last = null;
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.canvas.height = this.size;
      this.ctx = this.canvas.getContext('2d');
      this.clear();
      this.texture = new THREE.Texture(this.canvas);
    }
    clear() {
      this.ctx.fillStyle = 'black';
      this.ctx.fillRect(0, 0, this.size, this.size);
    }
    update() {
      this.clear();
      for (let i = this.trail.length - 1; i >= 0; i--) {
        const p = this.trail[i];
        const f = p.force * this.speed * (1 - p.age / this.maxAge);
        p.x += p.vx * f;
        p.y += p.vy * f;
        p.age++;
        if (p.age > this.maxAge) this.trail.splice(i, 1);
        else this.drawPoint(p);
      }
      this.texture.needsUpdate = true;
    }
    addTouch(point) {
      let force = 0, vx = 0, vy = 0;
      if (this.last) {
        const dx = point.x - this.last.x;
        const dy = point.y - this.last.y;
        if (dx === 0 && dy === 0) return;
        const dd = dx * dx + dy * dy;
        const d = Math.sqrt(dd);
        vx = dx / d;
        vy = dy / d;
        force = Math.min(dd * 20000, 2.0);
      }
      this.last = { x: point.x, y: point.y };
      this.trail.push({ x: point.x, y: point.y, age: 0, force, vx, vy });
    }
    drawPoint(p) {
      const pos = { x: p.x * this.size, y: (1 - p.y) * this.size };
      let intensity;
      if (p.age < this.maxAge * 0.3) {
        intensity = Math.sin((p.age / (this.maxAge * 0.3)) * (Math.PI / 2));
      } else {
        const t = 1 - (p.age - this.maxAge * 0.3) / (this.maxAge * 0.7);
        intensity = -t * (t - 2);
      }
      intensity *= p.force;
      const color = `${((p.vx + 1) / 2) * 255}, ${((p.vy + 1) / 2) * 255}, ${intensity * 255}`;
      const offset = this.size * 5;
      this.ctx.shadowOffsetX = offset;
      this.ctx.shadowOffsetY = offset;
      this.ctx.shadowBlur = this.radius;
      this.ctx.shadowColor = `rgba(${color},${0.2 * intensity})`;
      this.ctx.beginPath();
      this.ctx.fillStyle = 'rgba(255,0,0,1)';
      this.ctx.arc(pos.x - offset, pos.y - offset, this.radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  // ---------- Renderer ----------
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: false, // inutile sur un plan plein écran, et ça coûte du GPU
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
      depth: false
    });
  } catch (e) {
    return; // pas de WebGL : le hero garde son fond CSS
  }

  // Qualité : 1 sur mobile, 1.5 max ailleurs ; baisse automatiquement si ça rame (voir adapt())
  let quality = Math.min(window.devicePixelRatio, 1.5);
  if (window.innerWidth < 900) quality = Math.min(quality, 1);
  renderer.setPixelRatio(quality);
  renderer.domElement.classList.add('hero-gl');
  renderer.domElement.setAttribute('aria-hidden', 'true');
  hero.prepend(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
  camera.position.z = 50;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.dark);
  const clock = new THREE.Clock();
  const touch = new TouchTexture();

  const viewSize = () => {
    const h = Math.abs(camera.position.z * Math.tan((camera.fov * Math.PI) / 360) * 2);
    return { width: h * camera.aspect, height: h };
  };

  // ---------- Les 12 taches de couleur : calculées ici (1 fois par image) et non par pixel ----------
  const dark = vec(PALETTE.dark);
  const COLORS = [
    vec(PALETTE.vivid[0]), dark.clone(),
    vec(PALETTE.vivid[1]), dark.clone(),
    vec(PALETTE.vivid[2]), dark.clone()
  ];
  // [mouvement (0 = sin/cos, 1 = cos/sin), fx, fy, ax, ay, pulsation (0 = sin, 1 = cos), fréquence]
  const SPOTS = [
    [0, 0.40, 0.50, 0.40, 0.40, 0, 1.0],
    [1, 0.60, 0.45, 0.50, 0.50, 1, 1.2],
    [0, 0.35, 0.55, 0.45, 0.45, 0, 0.8],
    [1, 0.50, 0.40, 0.40, 0.40, 1, 1.3],
    [0, 0.70, 0.60, 0.35, 0.35, 0, 1.1],
    [1, 0.45, 0.65, 0.50, 0.50, 1, 0.9],
    [0, 0.55, 0.48, 0.38, 0.42, 0, 1.4],
    [1, 0.65, 0.52, 0.36, 0.44, 1, 1.5],
    [0, 0.42, 0.58, 0.41, 0.39, 0, 1.6],
    [1, 0.48, 0.62, 0.37, 0.43, 1, 1.7],
    [0, 0.68, 0.44, 0.33, 0.46, 0, 1.8],
    [1, 0.38, 0.56, 0.39, 0.41, 1, 1.9]
  ];

  const uniforms = {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uColor1: { value: COLORS[0] },
    uColor2: { value: COLORS[1] },
    uColor3: { value: COLORS[2] },
    uColor4: { value: COLORS[3] },
    uCenters: { value: SPOTS.map(() => new THREE.Vector2()) },
    uTints: { value: SPOTS.map(() => new THREE.Vector3()) },
    uIntensity: { value: INTENSITY },
    uTouchTexture: { value: touch.texture },
    uGrainIntensity: { value: GRAIN },
    uDarkNavy: { value: dark.clone() },
    uGradientSize: { value: SIZE },
    uColor1Weight: { value: BALANCE.vivid },
    uColor2Weight: { value: BALANCE.dark },
    uGlitch: { value: VHS.glitch },
    uSplit: { value: VHS.split },
    uScan: { value: VHS.scanlines },
    uExposure: { value: VHS.exposure },
    uBurn: { value: VHS.burn }
  };

  function updateSpots(time) {
    const t = time * SPEED;
    SPOTS.forEach(([kind, fx, fy, ax, ay, wave, freq], i) => {
      const c = uniforms.uCenters.value[i];
      if (kind === 0) c.set(0.5 + Math.sin(t * fx) * ax, 0.5 + Math.cos(t * fy) * ay);
      else c.set(0.5 + Math.cos(t * fx) * ax, 0.5 + Math.sin(t * fy) * ay);
      const pulse = 0.55 + 0.45 * (wave ? Math.cos(t * freq) : Math.sin(t * freq));
      const weight = i % 2 ? BALANCE.dark : BALANCE.vivid;
      uniforms.uTints.value[i].copy(COLORS[i % 6]).multiplyScalar(pulse * weight);
    });
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vUv = uv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec2 uResolution;
      uniform vec3 uColor1, uColor2, uColor3, uColor4;
      uniform vec2 uCenters[12];
      uniform vec3 uTints[12];
      uniform float uIntensity, uGrainIntensity;
      uniform sampler2D uTouchTexture;
      uniform vec3 uDarkNavy;
      uniform float uGradientSize, uColor1Weight, uColor2Weight;
      uniform float uGlitch, uSplit, uScan, uExposure, uBurn;
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }

      float grain(vec2 uv, float time) {
        vec2 g = uv * uResolution * 0.5;
        return hash(g + time) * 2.0 - 1.0;
      }

      float infl(vec2 uv, vec2 c) {
        return 1.0 - smoothstep(0.0, uGradientSize, length(uv - c));
      }

      // Le dégradé lui-même (mêmes réglages qu'avant)
      vec3 grade(vec2 uv) {
        vec3 color = vec3(0.0);
        for (int i = 0; i < 12; i++) {
          color += uTints[i] * infl(uv, uCenters[i]);
        }

        float rad = 1.0 - smoothstep(0.0, 0.8, length(uv - 0.5));
        color += mix(uColor1, uColor3, rad) * 0.45 * uColor1Weight;
        color += mix(uColor2, uColor4, rad) * 0.40 * uColor2Weight;

        color = clamp(color, vec3(0.0), vec3(1.0)) * uIntensity;

        float lum = dot(color, vec3(0.299, 0.587, 0.114));
        color = mix(vec3(lum), color, 1.35);
        color = pow(max(color, vec3(0.0)), vec3(0.92));

        float b1 = length(color);
        color = mix(uDarkNavy, color, max(b1 * 1.2, 0.15));

        float b = length(color);
        if (b > 1.0) color = color / b;
        return color;
      }

      void main() {
        vec2 uv = vUv;
        float t = uTime;
        float tw = mod(t, 600.0); // évite les pertes de précision après longtemps

        // Distorsion de la souris
        vec4 touchTex = texture2D(uTouchTexture, uv);
        float vx = -(touchTex.r * 2.0 - 1.0);
        float vy = -(touchTex.g * 2.0 - 1.0);
        float touch = touchTex.b;
        uv.x += vx * 0.8 * touch;
        uv.y += vy * 0.8 * touch;
        float dist = length(uv - vec2(0.5));
        uv += vec2(sin(dist * 20.0 - t * 3.0) * 0.04 + sin(dist * 15.0 - t * 2.0) * 0.03) * touch;

        // VHS : tremblement des lignes + bandes de tracking
        float row = floor(vUv.y * uResolution.y * 0.5);
        float tick = floor(tw * 24.0);
        float rnd = hash(vec2(row, tick));

        float bandA = 1.0 - smoothstep(0.0, 0.07, abs(vUv.y - fract(1.0 - t * 0.05))); // descend en continu
        float seed = floor(tw * 0.7);
        float bandB = step(0.8, hash(vec2(seed, 1.0)))
                    * (1.0 - smoothstep(0.0, 0.04, abs(vUv.y - hash(vec2(seed, 2.0))))); // déchirure aléatoire
        float g = clamp(max(bandA * 0.6, bandB), 0.0, 1.0) * uGlitch;

        uv.x += ((rnd - 0.5) * 0.0025 + sin(vUv.y * 38.0 + t * 1.7) * 0.0012) * uGlitch;
        uv.x += g * ((rnd - 0.5) * 0.08 + 0.01);

        // VHS : séparation rouge / bleu (plus forte dans les bandes)
        float split = (0.003 + g * 0.02) * uSplit;
        vec3 color = vec3(
          grade(uv + vec2(split, 0.0)).r,
          grade(uv).g,
          grade(uv - vec2(split, 0.0)).b
        );

        // Grain, neige dans les bandes, léger dérapage des couleurs
        color += grain(uv, tw) * uGrainIntensity;
        color += (hash(vUv * uResolution + tw) - 0.5) * g * 0.5;
        color += g * 0.12 * vec3(1.0, 0.85, 0.7);
        float ts = t * 0.5;
        color += vec3(sin(ts), cos(ts * 1.4), sin(ts * 1.2)) * 0.02;

        // Lignes de balayage, surexposition, hautes lumières brûlées, vignette
        color *= 1.0 - uScan * (0.5 + 0.5 * sin(vUv.y * uResolution.y * 1.5708));
        color *= uExposure;
        float lum = dot(color, vec3(0.299, 0.587, 0.114));
        color = mix(color, vec3(1.0, 0.78, 0.5), smoothstep(0.4, 0.9, lum) * uBurn);
        color *= 1.0 - 0.45 * dot(vUv - 0.5, vUv - 0.5);

        gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
      }
    `
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, 1), material);
  scene.add(mesh);

  // ---------- Taille = celle du hero ----------
  function resize() {
    const w = hero.clientWidth;
    const h = hero.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const v = viewSize();
    mesh.geometry.dispose();
    mesh.geometry = new THREE.PlaneGeometry(v.width, v.height, 1, 1);
    uniforms.uResolution.value.set(w, h);
    if (reduceMotion) renderFrame();
  }

  // ---------- Qualité adaptative : si la machine rame, on baisse la résolution ----------
  let frames = 0;
  let slowFrames = 0;
  function adapt(dt) {
    if (dt > 0.25) return; // reprise d'onglet : on ignore
    frames++;
    if (dt > 0.04) slowFrames++; // moins de 25 images/s
    if (frames >= 90) {
      if (slowFrames > 60 && quality > 0.6) {
        quality = Math.max(0.6, quality * 0.75);
        renderer.setPixelRatio(quality);
        resize();
      }
      frames = 0;
      slowFrames = 0;
    }
  }

  function renderFrame() {
    const raw = clock.getDelta();
    const delta = Math.min(raw, 0.1);
    updateSpots(uniforms.uTime.value);
    renderer.render(scene, camera);
    touch.update();
    uniforms.uTime.value += delta;
    if (!reduceMotion) adapt(raw);
  }

  // ---------- Boucle : s'arrête quand le hero n'est plus visible ----------
  let raf = 0;
  let visible = true;

  function frame() {
    raf = 0;
    if (!visible || document.hidden) return;
    renderFrame();
    raf = requestAnimationFrame(frame);
  }
  function start() {
    if (!raf && !reduceMotion) raf = requestAnimationFrame(frame);
  }

  resize();
  renderFrame();
  hero.classList.add('gl-ready');

  new ResizeObserver(resize).observe(hero);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) start();
  }).observe(hero);
  document.addEventListener('visibilitychange', start);
  start();

  // ---------- Interaction (désactivée si "réduire les animations") ----------
  if (!reduceMotion) {
    const toUv = (cx, cy) => {
      const r = hero.getBoundingClientRect();
      return { x: (cx - r.left) / r.width, y: 1 - (cy - r.top) / r.height };
    };
    hero.addEventListener('mousemove', (e) => touch.addTouch(toUv(e.clientX, e.clientY)));
    hero.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      touch.addTouch(toUv(t.clientX, t.clientY));
    }, { passive: true });
  }
})();
