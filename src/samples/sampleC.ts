import * as THREE from 'three';
import { mixColor, palette } from '../design/palette';
import { type LanternLevel, STEPS, cellCount, clashing, isRock, isSolved, isWater, lightCounts, rockCount, rockState, sightLines } from '../regions/moonlake/model';
import { LakeWorld } from './world3d';

// Style sample C: the whole level in 3D. The lake lies tilted in front of the player, the
// rocks are stones with their dots on top, the shore is low land, and the lanterns are 3D
// paper lanterns bobbing on the water, glowing, with soft beams of light across the lake.

const col = (hex: number) => new THREE.Color(hex);

export class SampleC {
  private canvas = document.createElement('canvas');
  private world: LakeWorld;
  private board = new THREE.Group();
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
  private down: { x: number; y: number } | null = null;
  private ray = new THREE.Raycaster();
  private floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(
    private host: HTMLElement,
    private level: LanternLevel,
    private onSolved: () => void,
  ) {
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;display:block';
    host.appendChild(this.canvas);
    this.sight = sightLines(level);
    this.world = new LakeWorld(this.canvas, { cameraHeight: 8, cameraDistance: 8, lookAt: new THREE.Vector3(0, 0, 0.4), fov: 52 });
    this.world.scene.add(this.board, this.lit, this.lanternsGroup);
    this.buildBoard();
    this.canvas.addEventListener('pointerdown', this.onDown);
    this.canvas.addEventListener('pointerup', this.onUp);
    window.addEventListener('resize', this.onResize);
    this.onResize();
    this.raf = requestAnimationFrame(this.frame);
  }

  private cellPos(i: number): THREE.Vector3 {
    const { width: w, height: h } = this.level;
    return new THREE.Vector3((i % w) - (w - 1) / 2, 0, Math.floor(i / w) - (h - 1) / 2);
  }

  private buildBoard(): void {
    const { width: w, height: h } = this.level;
    const patch = new THREE.MeshBasicMaterial({ color: col(mixColor(palette.void, palette.sky, 0.05)), transparent: true, opacity: 0.35, depthWrite: false });
    const land = new THREE.MeshStandardMaterial({ color: col(mixColor(palette.void, palette.sage, 0.18)), roughness: 1, flatShading: true });
    const stone = new THREE.MeshStandardMaterial({ color: col(mixColor(palette.dim, palette.lavender, 0.3)), roughness: 0.9, flatShading: true });
    const lines: number[] = [];
    for (let i = 0; i < cellCount(this.level); i++) {
      const p = this.cellPos(i);
      const inLake = isWater(this.level, i) || isRock(this.level, i);
      if (!inLake) {
        // Shore: a low, rounded bank of land rising out of the water.
        const bank = new THREE.Mesh(new THREE.BoxGeometry(1, 0.32, 1, 1, 1, 1), land);
        bank.position.set(p.x, 0.08, p.z);
        this.board.add(bank);
        continue;
      }
      const tile = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96), patch);
      tile.rotation.x = -Math.PI / 2;
      tile.position.set(p.x, 0.01, p.z);
      this.board.add(tile);
      lines.push(p.x - 0.5, 0.015, p.z - 0.5, p.x + 0.5, 0.015, p.z - 0.5, p.x - 0.5, 0.015, p.z - 0.5, p.x - 0.5, 0.015, p.z + 0.5);
      if (i % w === w - 1 || !(isWater(this.level, i + 1) || isRock(this.level, i + 1))) lines.push(p.x + 0.5, 0.015, p.z - 0.5, p.x + 0.5, 0.015, p.z + 0.5);
      if (Math.floor(i / w) === h - 1 || !(isWater(this.level, i + w) || isRock(this.level, i + w))) lines.push(p.x - 0.5, 0.015, p.z + 0.5, p.x + 0.5, 0.015, p.z + 0.5);
      if (isRock(this.level, i)) {
        const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 0), stone);
        rock.scale.set(1, 0.62, 1);
        rock.rotation.y = i * 1.3;
        rock.position.set(p.x, 0.12, p.z);
        this.board.add(rock);
        const count = rockCount(this.level, i);
        if (count !== null) this.dots.set(i, this.makeDots(count, p));
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    this.board.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: col(palette.pearl), transparent: true, opacity: 0.16 })));
  }

  // A rock's dots sit on its top; a ring means none.
  private makeDots(count: number, p: THREE.Vector3): THREE.Mesh[] {
    const y = 0.36;
    const mat = () => new THREE.MeshBasicMaterial({ color: col(palette.pearl) });
    if (count === 0) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.018, 8, 24), mat());
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(p.x, y, p.z);
      this.board.add(ring);
      return [ring];
    }
    const s = 0.11;
    const spots: Record<number, Array<[number, number]>> = { 1: [[0, 0]], 2: [[-s, 0], [s, 0]], 3: [[0, -s], [-s, s * 0.7], [s, s * 0.7]], 4: [[-s, -s], [s, -s], [-s, s], [s, s]] };
    return (spots[count] ?? []).map(([dx, dz]) => {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), mat());
      dot.position.set(p.x + dx, y, p.z + dz);
      this.board.add(dot);
      return dot;
    });
  }

  // A 3D paper lantern: a turned paper body glowing from inside, dark caps, a loop, and its
  // light: a bright heart, a wide warm halo and a pool of light on the water.
  private makeLantern(i: number): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Group();
    const profile: THREE.Vector2[] = [];
    for (let k = 0; k <= 16; k++) {
      const t = k / 16;
      profile.push(new THREE.Vector2(0.09 + 0.085 * Math.sin(Math.PI * t), -0.2 + 0.4 * t));
    }
    const paper = new THREE.Mesh(
      new THREE.LatheGeometry(profile, 28),
      new THREE.MeshStandardMaterial({ color: col(palette.peach), emissive: col(mixColor(palette.lemon, palette.peach, 0.3)), emissiveIntensity: 0.9, roughness: 0.7, side: THREE.DoubleSide }),
    );
    // Bamboo ribs around the paper.
    for (let k = 1; k < 8; k++) {
      const t = k / 8;
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.09 + 0.085 * Math.sin(Math.PI * t) + 0.002, 0.004, 4, 28), new THREE.MeshBasicMaterial({ color: col(mixColor(palette.peach, palette.rose, 0.5)) }));
      rib.rotation.x = Math.PI / 2;
      rib.position.y = -0.2 + 0.4 * t;
      body.add(rib);
    }
    const capMat = new THREE.MeshStandardMaterial({ color: col(palette.void), roughness: 0.4, metalness: 0.2 });
    for (const y of [-0.215, 0.215]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.035, 20), capMat);
      cap.position.y = y;
      body.add(cap);
    }
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.007, 6, 16, Math.PI), capMat);
    loop.position.y = 0.235;
    body.add(paper, loop);
    g.add(body);
    const sprite = (color: number, size: number, opacity: number) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.world.glow, color: col(color), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.scale.set(size, size, 1);
      return s;
    };
    const heart = sprite(palette.lemon, 0.7, 0.5);
    const halo = sprite(palette.peach, 2.2, 0.2);
    g.add(halo, heart);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: this.world.glow, color: col(palette.lemon), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = -0.26;
    g.add(pool);
    g.userData = { body, heart, halo, phase: i * 1.7 };
    const p = this.cellPos(i);
    g.position.set(p.x, 0.32, p.z);
    g.scale.setScalar(1.55);
    return g;
  }

  // Light on the water: warm patches where it reaches, soft beams along each lantern's lines,
  // a rose beam between lanterns that shine on each other, and the rocks' dots answering.
  private redraw(): void {
    this.lit.clear();
    const counts = lightCounts(this.level, this.lanterns, this.sight);
    const warm = new THREE.MeshBasicMaterial({ color: col(palette.lemon), transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending });
    for (let i = 0; i < counts.length; i++) {
      if (!counts[i]) continue;
      const p = this.cellPos(i);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.94), warm);
      m.rotation.x = -Math.PI / 2;
      m.position.set(p.x, 0.02, p.z);
      this.lit.add(m);
    }
    const beam = new THREE.MeshBasicMaterial({ color: col(palette.lemon), transparent: true, opacity: 0.09, depthWrite: false, blending: THREE.AdditiveBlending });
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
        const len = a.distanceTo(b);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, len), beam);
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = dx !== 0 ? Math.PI / 2 : 0;
        m.position.set((a.x + b.x) / 2, 0.025, (a.z + b.z) / 2);
        this.lit.add(m);
      }
    }
    const clashes = clashing(this.level, this.lanterns, this.sight);
    const rose = new THREE.MeshBasicMaterial({ color: col(palette.rose), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    for (const a of clashes) {
      for (const b of clashes) {
        if (b <= a || !this.sight[a]!.includes(b)) continue;
        const pa = this.cellPos(a);
        const pb = this.cellPos(b);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.1, pa.distanceTo(pb)), rose);
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = pa.z === pb.z ? Math.PI / 2 : 0;
        m.position.set((pa.x + pb.x) / 2, 0.03, (pa.z + pb.z) / 2);
        this.lit.add(m);
      }
    }
    for (const [rock, dots] of this.dots) {
      const state = rockState(this.level, this.lanterns, rock);
      const c = state === 'met' && rockCount(this.level, rock) ? palette.lemon : state === 'over' ? palette.rose : palette.pearl;
      dots.forEach((d) => (d.material as THREE.MeshBasicMaterial).color.set(c));
    }
  }

  private toggle(i: number): void {
    if (this.lanterns.has(i)) {
      this.lanterns.delete(i);
      const v = this.views.get(i);
      if (v) this.lanternsGroup.remove(v);
      this.views.delete(i);
    } else {
      this.lanterns.add(i);
      const v = this.makeLantern(i);
      v.userData.drop = 1;
      this.views.set(i, v);
      this.lanternsGroup.add(v);
    }
    this.redraw();
    if (isSolved(this.level, this.lanterns)) {
      this.solved = true;
      this.onSolved();
    }
  }

  private onDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY };
  };

  private onUp = (e: PointerEvent) => {
    const d = this.down;
    this.down = null;
    if (!d || this.solved || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) return;
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.world.camera);
    const hit = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.floor, hit)) return;
    const { width: w, height: h } = this.level;
    const x = Math.round(hit.x + (w - 1) / 2);
    const y = Math.round(hit.z + (h - 1) / 2);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (isWater(this.level, i)) this.toggle(i);
  };

  // Frame the board: the whole lake fits the screen's width, seen from above at an angle.
  private onResize = () => {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    this.world.resize(w, h);
    const half = this.level.width / 2 + 0.8;
    const vfov = (this.world.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (w / h));
    const dist = Math.max(half / Math.tan(hfov / 2), (this.level.height / 2 + 1.5) / Math.tan(vfov / 2));
    // Low enough to see across the lake to the hills and the moon behind it.
    const tilt = (34 * Math.PI) / 180;
    this.world.setView(new THREE.Vector3(0, Math.sin(tilt) * dist, Math.cos(tilt) * dist + 1.5), new THREE.Vector3(0, 0.6, -9));
  };

  private frame = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    if (this.solved) this.rise = Math.min(0.7, this.rise + dt * 0.25);
    for (const v of this.views.values()) {
      const u = v.userData as { body: THREE.Group; heart: THREE.Sprite; halo: THREE.Sprite; phase: number; drop?: number };
      if (u.drop) u.drop = Math.max(0, u.drop - dt * 3);
      const t = this.time + u.phase;
      v.position.y = 0.42 + Math.sin(t * 1.2) * 0.03 + (u.drop ?? 0) * 0.5 + this.rise;
      u.body.rotation.z = Math.sin(t * 0.8) * 0.06;
      u.body.rotation.y += dt * 0.15;
      const flicker = 0.85 + 0.08 * Math.sin(t * 2.3) + 0.05 * Math.sin(t * 6.1) + 0.03 * Math.sin(t * 13.7);
      u.heart.material.opacity = 0.5 * flicker * (this.solved ? 1.3 : 1);
      u.halo.material.opacity = 0.2 * flicker * (this.solved ? 1.5 : 1);
    }
    this.world.setBloom(this.solved ? 0.9 : 0.6);
    this.world.update(dt);
    this.raf = requestAnimationFrame(this.frame);
  };

  destroy(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.world.dispose();
    this.canvas.remove();
  }
}
