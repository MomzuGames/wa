import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { mixColor, palette } from '../design/palette';
import { Backdrop, moodFor } from './backdrop';
import { type LanternLevel, STEPS, cellCount, clashing, isRock, isSolved, isWater, lightCounts, rockCount, rockState, sightLines } from '../regions/moonlake/model';

// Style samples C and D: the puzzle itself as a small 3D diorama floating in the night. The
// lake is a block of water with a stone rim, the shore is low land on it, the rocks are
// stones with their dots on top, and the lanterns are paper lanterns that bob and glow.
// Swipe sideways to turn it all the way round, up and down to tilt; a tap places a lantern.
//   perspective (C): a normal 3D camera, turning freely
//   isometric  (D): no perspective, like Monument Valley; it settles on each corner

const col = (hex: number) => new THREE.Color(hex);

const style = {
  pitch: { start: 0.95, min: 0.26, max: 1.48 }, // radians above the board: from nearly side-on to straight down
  yawStart: Math.PI / 4,
  turnPerPx: 0.0075,
  tiltPerPx: 0.0065,
  follow: 7, // per second: how quickly the camera glides toward where the finger sends it
  inertia: 0.9, // how much of a flick carries on, per frame, after the finger lifts
  tapSlop: 10, // px a finger may move and still count as a tap
  slabDepth: 0.55,
  topUi: 70, // px of the screen the sample switcher uses
} as const;

function glowTexture(): THREE.Texture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class DioramaSample {
  private canvas = document.createElement('canvas');
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private glow = glowTexture();
  private water: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private lit = new THREE.Group();
  private lanternsGroup = new THREE.Group();
  private dots = new Map<number, THREE.Mesh[]>();
  private views = new Map<number, THREE.Group>();
  private lanterns = new Set<number>();
  private sight: number[][];
  private raf = 0;
  private last = performance.now();
  private time = 0;
  private solved = false;
  private rise = 0;
  // Turning: where the camera sits around the board, and how a swipe is moving it.
  private yaw: number = style.yawStart;
  private pitch: number = style.pitch.start;
  // Where the finger is sending the view; the camera glides toward it, never jumps.
  private targetYaw: number = style.yawStart;
  private targetPitch: number = style.pitch.start;
  private backdrop: Backdrop;
  private spin = 0;
  private drag: { x: number; y: number; startX: number; startY: number; moved: boolean } | null = null;
  private radius: number;
  private ray = new THREE.Raycaster();
  private floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private width = 1;
  private height = 1;

  constructor(
    private host: HTMLElement,
    private level: LanternLevel,
    private onSolved: () => void,
    private isometric: boolean,
    levelName = 'Firefly',
  ) {
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;display:block';
    host.appendChild(this.canvas);
    this.sight = sightLines(level);
    this.radius = Math.hypot(level.width / 2 + 0.6, level.height / 2 + 0.6);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.backdrop = new Backdrop(this.scene, this.glow, moodFor(levelName));
    this.camera = isometric ? new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100) : new THREE.PerspectiveCamera(38, 1, 0.1, 100);

    // Light: a soft sky fill and the moon, high and to one side, so every stone has a lit
    // face and a shaded one.
    this.scene.add(new THREE.HemisphereLight(col(mixColor(palette.sky, palette.pearl, 0.5)), col(palette.ink), 0.75));
    const moon = new THREE.DirectionalLight(col(palette.pearl), 1.2);
    moon.position.set(-6, 10, 4);
    this.scene.add(moon);

    this.water = this.buildDiorama();
    this.scene.add(this.lit, this.lanternsGroup);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.6, 0.7);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.canvas.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('resize', this.onResize);
    this.onResize();
    this.raf = requestAnimationFrame(this.frame);
  }

  private cellPos(i: number): THREE.Vector3 {
    const { width: w, height: h } = this.level;
    return new THREE.Vector3((i % w) - (w - 1) / 2, 0, Math.floor(i / w) - (h - 1) / 2);
  }

  // The diorama: a block of water with a stone rim, low land for the shore, stones with
  // their dots, faint lines between the patches, and a soft glow beneath it all.
  private buildDiorama(): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
    const { width: w, height: h } = this.level;
    const bw = w + 0.5;
    const bh = h + 0.5;
    // The rim and body of the block.
    const rock = new THREE.MeshLambertMaterial({ color: col(mixColor(palette.dim, palette.sky, 0.14)), flatShading: true });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(bw, style.slabDepth, bh), rock);
    slab.position.y = -style.slabDepth / 2 - 0.02;
    this.scene.add(slab);
    // A soft pool of light under the floating block, for depth.
    const under = new THREE.Mesh(new THREE.PlaneGeometry(bw * 2.4, bh * 2.4), new THREE.MeshBasicMaterial({ map: this.glow, color: col(palette.peach), transparent: true, opacity: 0.1, depthWrite: false }));
    under.rotation.x = -Math.PI / 2;
    under.position.y = -style.slabDepth - 0.6;
    this.scene.add(under);
    // The water on top, softly rippling.
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(bw - 0.12, bh - 0.12),
      new THREE.ShaderMaterial({
        uniforms: { time: { value: 0 }, deep: { value: col(mixColor(palette.void, palette.sky, 0.1)) }, sheen: { value: col(mixColor(palette.lavender, palette.sky, 0.5)) } },
        vertexShader: 'varying vec2 vUv; varying vec3 vWorld; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: `uniform float time; uniform vec3 deep; uniform vec3 sheen; varying vec2 vUv; varying vec3 vWorld;
          float wave(vec2 p){ return sin(p.x*2.1+time*0.9)*0.5 + sin(p.y*2.7-time*0.7+p.x*0.6)*0.35 + sin((p.x+p.y)*5.3+time*1.6)*0.15; }
          void main(){ float wv = wave(vWorld.xz); vec3 c = deep + sheen*0.07*smoothstep(0.5,0.95,wv); float edge = smoothstep(0.0,0.06,vUv.x)*smoothstep(0.0,0.06,vUv.y)*smoothstep(1.0,0.94,vUv.x)*smoothstep(1.0,0.94,vUv.y); c = mix(sheen*0.25, c, edge); gl_FragColor = vec4(c,1.0); }`,
      }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0;
    this.scene.add(water);

    const land = new THREE.MeshLambertMaterial({ color: col(mixColor(palette.dim, palette.sage, 0.35)), flatShading: true });
    const stone = new THREE.MeshLambertMaterial({ color: col(mixColor(palette.dim, palette.pearl, 0.28)), flatShading: true });
    const shadow = new THREE.MeshBasicMaterial({ map: this.glow, color: col(palette.void), transparent: true, opacity: 0.6, depthWrite: false });
    const lines: number[] = [];
    for (let i = 0; i < cellCount(this.level); i++) {
      const p = this.cellPos(i);
      if (!isWater(this.level, i) && !isRock(this.level, i)) {
        const bank = new THREE.Mesh(new THREE.BoxGeometry(1, 0.28, 1), land);
        bank.position.set(p.x, 0.1, p.z);
        this.scene.add(bank);
        continue;
      }
      lines.push(p.x - 0.5, 0.01, p.z - 0.5, p.x + 0.5, 0.01, p.z - 0.5, p.x - 0.5, 0.01, p.z - 0.5, p.x - 0.5, 0.01, p.z + 0.5, p.x + 0.5, 0.01, p.z - 0.5, p.x + 0.5, 0.01, p.z + 0.5, p.x - 0.5, 0.01, p.z + 0.5, p.x + 0.5, 0.01, p.z + 0.5);
      if (isRock(this.level, i)) {
        const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadow);
        blob.rotation.x = -Math.PI / 2;
        blob.position.set(p.x + 0.06, 0.012, p.z + 0.06);
        this.scene.add(blob);
        const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.36, 0), stone);
        r.scale.set(1, 0.7, 1);
        r.rotation.set(0.2, i * 1.3, 0.1);
        r.position.set(p.x, 0.16, p.z);
        this.scene.add(r);
        const count = rockCount(this.level, i);
        if (count !== null) this.dots.set(i, this.makeDots(count, p));
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    this.scene.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: col(palette.pearl), transparent: true, opacity: 0.14 })));
    return water;
  }

  private makeDots(count: number, p: THREE.Vector3): THREE.Mesh[] {
    const y = 0.4;
    const mat = () => new THREE.MeshBasicMaterial({ color: col(palette.pearl) });
    if (count === 0) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.022, 8, 24), mat());
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(p.x, y, p.z);
      this.scene.add(ring);
      return [ring];
    }
    const s = 0.11;
    const spots: Record<number, Array<[number, number]>> = { 1: [[0, 0]], 2: [[-s, 0], [s, 0]], 3: [[0, -s], [-s, s * 0.7], [s, s * 0.7]], 4: [[-s, -s], [s, -s], [-s, s], [s, s]] };
    return (spots[count] ?? []).map(([dx, dz]) => {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 8), mat());
      dot.position.set(p.x + dx, y, p.z + dz);
      this.scene.add(dot);
      return dot;
    });
  }

  // A paper lantern: a turned paper body glowing from inside, bamboo ribs, dark caps, a loop;
  // its light: a bright heart, a warm halo, a pool on the water and a soft shadow.
  private makeLantern(i: number): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Group();
    const R = (t: number) => 0.13 + 0.12 * Math.sin(Math.PI * t);
    const profile: THREE.Vector2[] = [];
    for (let k = 0; k <= 18; k++) profile.push(new THREE.Vector2(R(k / 18), -0.28 + 0.56 * (k / 18)));
    body.add(new THREE.Mesh(new THREE.LatheGeometry(profile, 32), new THREE.MeshStandardMaterial({ color: col(palette.peach), emissive: col(mixColor(palette.lemon, palette.peach, 0.35)), emissiveIntensity: 0.72, roughness: 0.75 })));
    const rib = new THREE.MeshBasicMaterial({ color: col(mixColor(palette.peach, palette.rose, 0.55)) });
    for (let k = 1; k < 9; k++) {
      const t = k / 9;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(R(t) + 0.003, 0.005, 4, 32), rib);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -0.28 + 0.56 * t;
      body.add(ring);
    }
    const capMat = new THREE.MeshStandardMaterial({ color: col(palette.void), roughness: 0.35, metalness: 0.3 });
    for (const y of [-0.3, 0.3]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 24), capMat);
      cap.position.y = y;
      body.add(cap);
    }
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.01, 6, 16, Math.PI), capMat);
    loop.position.y = 0.33;
    body.add(loop);
    g.add(body);
    const sprite = (color: number, size: number, opacity: number) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: col(color), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.scale.set(size, size, 1);
      return s;
    };
    const heart = sprite(palette.lemon, 0.75, 0.38);
    const halo = sprite(palette.peach, 2.2, 0.135);
    g.add(halo, heart);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: this.glow, color: col(palette.lemon), transparent: true, opacity: 0.26, depthWrite: false, blending: THREE.AdditiveBlending }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = -0.43;
    g.add(pool);
    g.userData = { body, heart, halo, phase: i * 1.7, drop: 1 };
    const p = this.cellPos(i);
    g.position.set(p.x, 0.45, p.z);
    g.scale.setScalar(1.25);
    return g;
  }

  private redraw(): void {
    this.lit.clear();
    const counts = lightCounts(this.level, this.lanterns, this.sight);
    const warm = new THREE.MeshBasicMaterial({ color: col(palette.lemon), transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending });
    for (let i = 0; i < counts.length; i++) {
      if (!counts[i]) continue;
      const p = this.cellPos(i);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.94), warm);
      m.rotation.x = -Math.PI / 2;
      m.position.set(p.x, 0.015, p.z);
      this.lit.add(m);
    }
    const beam = new THREE.MeshBasicMaterial({ color: col(palette.lemon), transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending });
    const { width: w, height: h } = this.level;
    for (const l of this.lanterns) {
      for (const [dx, dy] of STEPS) {
        let x = l % w;
        let y = Math.floor(l / w);
        while (x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h && isWater(this.level, (y + dy) * w + x + dx)) {
          x += dx;
          y += dy;
        }
        const end = y * w + x;
        if (end === l) continue;
        const a = this.cellPos(l);
        const b = this.cellPos(end);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.14, a.distanceTo(b)), beam);
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = dx !== 0 ? Math.PI / 2 : 0;
        m.position.set((a.x + b.x) / 2, 0.02, (a.z + b.z) / 2);
        this.lit.add(m);
      }
    }
    const clashes = clashing(this.level, this.lanterns, this.sight);
    const rose = new THREE.MeshBasicMaterial({ color: col(palette.rose), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
    for (const a of clashes) {
      for (const b of clashes) {
        if (b <= a || !this.sight[a]!.includes(b)) continue;
        const pa = this.cellPos(a);
        const pb = this.cellPos(b);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.1, pa.distanceTo(pb)), rose);
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = pa.z === pb.z ? Math.PI / 2 : 0;
        m.position.set((pa.x + pb.x) / 2, 0.025, (pa.z + pb.z) / 2);
        this.lit.add(m);
      }
    }
    for (const [r, dots] of this.dots) {
      const state = rockState(this.level, this.lanterns, r);
      const c = state === 'met' && rockCount(this.level, r) ? palette.lemon : state === 'over' ? palette.rose : palette.pearl;
      dots.forEach((d) => (d.material as THREE.MeshBasicMaterial).color.set(c));
    }
  }

  // The view, in degrees: how far above the board (tilt) and how far round (turn).
  get view(): { tilt: number; turn: number } {
    const deg = (r: number) => Math.round((r * 180) / Math.PI);
    return { tilt: deg(this.pitch), turn: ((deg(this.yaw) % 360) + 360) % 360 };
  }

  // Exposed for testing.
  toggle(i: number): void {
    if (this.lanterns.has(i)) {
      this.lanterns.delete(i);
      const v = this.views.get(i);
      if (v) this.lanternsGroup.remove(v);
      this.views.delete(i);
    } else {
      this.lanterns.add(i);
      const v = this.makeLantern(i);
      this.views.set(i, v);
      this.lanternsGroup.add(v);
    }
    this.redraw();
    if (!this.solved && isSolved(this.level, this.lanterns)) {
      this.solved = true;
      this.onSolved();
    }
  }

  // ----- turning and tapping -----

  private onDown = (e: PointerEvent) => {
    this.drag = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false };
    this.spin = 0;
  };

  private onMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > style.tapSlop) d.moved = true;
    if (d.moved) {
      this.spin = -dx * style.turnPerPx;
      this.targetYaw += this.spin;
      this.targetPitch = Math.max(style.pitch.min, Math.min(style.pitch.max, this.targetPitch + dy * style.tiltPerPx));
    }
    d.x = e.clientX;
    d.y = e.clientY;
  };

  private onUp = (e: PointerEvent) => {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.moved) {
      // Isometric: settle on the nearest corner view, the way Monument Valley does.
      if (this.isometric) {
        const step = Math.PI / 2;
        this.targetYaw = Math.round((this.targetYaw + this.spin * 6 - Math.PI / 4) / step) * step + Math.PI / 4;
        this.spin = 0;
      }
      return;
    }
    if (this.solved) return;
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.floor, hit)) return;
    const { width: w, height: h } = this.level;
    const x = Math.round(hit.x + (w - 1) / 2);
    const y = Math.round(hit.z + (h - 1) / 2);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (isWater(this.level, i)) this.toggle(i);
  };

  // The whole board always fits, centred in the space below the switcher, at any angle.
  private placeCamera(): void {
    const target = new THREE.Vector3(0, -0.15, 0);
    const dir = new THREE.Vector3(Math.cos(this.pitch) * Math.sin(this.yaw), Math.sin(this.pitch), Math.cos(this.pitch) * Math.cos(this.yaw));
    const W = this.width;
    const H = this.height;
    const room = Math.max(1, H - style.topUi); // the height left below the switcher
    const R = this.radius + 0.35;
    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.aspect = W / H;
      const vfov = (this.camera.fov * Math.PI) / 180;
      const vfovRoom = 2 * Math.atan(Math.tan(vfov / 2) * (room / H));
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (W / H));
      const dist = R / Math.sin(Math.min(vfovRoom, hfov) / 2);
      this.camera.position.copy(target).addScaledVector(dir, dist);
    } else {
      // Half the visible height, in world units, so R fits both across and in the room left.
      const halfH = Math.max(R * (H / room), R * (H / W));
      const halfW = halfH * (W / H);
      Object.assign(this.camera, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
      this.camera.position.copy(target).addScaledVector(dir, 20);
    }
    this.camera.lookAt(target);
    // Move the picture down by half the switcher's height: the board sits in the middle of
    // the space that is left.
    this.camera.setViewOffset(W, H, 0, -style.topUi / 2, W, H);
    this.camera.updateProjectionMatrix();
  }

  private onResize = () => {
    this.width = this.host.clientWidth;
    this.height = this.host.clientHeight;
    this.renderer.setSize(this.width, this.height, false);
    this.composer.setSize(this.width, this.height);
    this.bloom.resolution.set(this.width / 2, this.height / 2);
    this.backdrop.resize(this.width, this.height);
    this.placeCamera();
  };

  private frame = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    // A swipe's spin carries on and eases away; an isometric view settles on a corner.
    // A flick carries on a little and eases away; the camera always glides toward its target.
    if (!this.drag && Math.abs(this.spin) > 0.0002) {
      this.targetYaw += this.spin;
      this.spin *= style.inertia;
    }
    const k = 1 - Math.exp(-dt * style.follow);
    this.yaw += (this.targetYaw - this.yaw) * k;
    this.pitch += (this.targetPitch - this.pitch) * k;
    this.backdrop.update(dt, this.yaw);
    this.placeCamera();
    this.water.material.uniforms.time!.value = this.time;
    if (this.solved) this.rise = Math.min(0.6, this.rise + dt * 0.25);
    for (const v of this.views.values()) {
      const u = v.userData as { body: THREE.Group; heart: THREE.Sprite; halo: THREE.Sprite; phase: number; drop: number };
      u.drop = Math.max(0, u.drop - dt * 3);
      const t = this.time + u.phase;
      v.position.y = 0.45 + Math.sin(t * 1.2) * 0.03 + u.drop * 0.5 + this.rise;
      u.body.rotation.z = Math.sin(t * 0.8) * 0.06;
      u.body.rotation.y += dt * 0.15;
      const flicker = 0.85 + 0.08 * Math.sin(t * 2.3) + 0.05 * Math.sin(t * 6.1) + 0.03 * Math.sin(t * 13.7);
      u.heart.material.opacity = 0.38 * flicker * (this.solved ? 1.4 : 1);
      u.halo.material.opacity = 0.135 * flicker * (this.solved ? 1.6 : 1);
    }
    this.bloom.strength = this.solved ? 0.75 : 0.47;
    this.composer.render(dt);
    this.raf = requestAnimationFrame(this.frame);
  };

  destroy(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    this.composer.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      mats.forEach((x) => x.dispose());
    });
    this.canvas.remove();
  }
}
