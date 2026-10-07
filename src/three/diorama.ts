import gsap from 'gsap';
import * as THREE from 'three';
import type { Container } from 'pixi.js';
import { mixColor, palette } from '../design/palette';
import { hud } from '../design/layout';
import type { RegionId } from '../regions/types';
import { stage3d, type World3D } from './stage3d';
import { OrbitView, col, glowTexture } from './kit';
import { Backdrop, moodFor } from './backdrop';

// What every 3D land shares: a small diorama floating in a pastel night (a slab with a rim,
// set by the land and the level), soft light from the sky and the moon, the turning camera,
// and little helpers for rings on the board, faint ghosts and a solve's rising sparks. Each
// land builds its own pieces on top (in `scene`), in board units: one cell is one unit, the
// board's top surface is y = 0, centred on the origin.

export interface DioramaSpec {
  region: RegionId;
  levelIndex: number;
  levelName: string;
  width: number; // board size in cells
  depth: number;
  slab?: { color: number; top?: number; depth?: number } | null; // null: no slab (a floating sky)
}

const dioramaStyle = {
  belowHud: 30,
  aboveHud: 30,
  slabDepth: 0.55,
} as const;

export class Diorama {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  readonly orbit: OrbitView;
  readonly world: World3D;
  readonly board = new THREE.Group(); // the land's own pieces
  readonly marks = new THREE.Group(); // hint rings and ghosts
  private backdrop: Backdrop;
  private sparks: THREE.Points | null = null;
  private time = 0;
  glow = { v: 1 };
  solved = false;

  constructor(readonly spec: DioramaSpec) {
    this.orbit = new OrbitView(this.camera, Math.hypot(spec.width / 2 + 0.6, spec.depth / 2 + 0.6));
    this.backdrop = new Backdrop(this.scene, glowTexture(), moodFor(spec.region, spec.levelIndex, spec.levelName));
    this.scene.add(new THREE.HemisphereLight(col(mixColor(palette.sky, palette.pearl, 0.5)), col(palette.ink), 0.75));
    const moon = new THREE.DirectionalLight(col(palette.pearl), 1.2);
    moon.position.set(-6, 10, 4);
    this.scene.add(moon);
    if (spec.slab !== null) this.addSlab(spec.slab?.color ?? mixColor(palette.dim, palette.sky, 0.14), spec.slab?.top, spec.slab?.depth);
    this.scene.add(this.board, this.marks);
    this.world = { scene: this.scene, camera: this.camera, bloom: () => (this.solved ? 0.75 : 0.47) * this.glow.v };
    stage3d()?.show(this.world);
  }

  // The floating block the board sits on, and a soft pool of light beneath it.
  private addSlab(color: number, top?: number, depth: number = dioramaStyle.slabDepth): void {
    const bw = this.spec.width + 0.5;
    const bd = this.spec.depth + 0.5;
    const sides = new THREE.MeshLambertMaterial({ color: col(color), flatShading: true });
    const topMat = top === undefined ? sides : new THREE.MeshLambertMaterial({ color: col(top), flatShading: true });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(bw, depth, bd), [sides, sides, topMat, sides, sides, sides]);
    slab.position.y = -depth / 2 - 0.02;
    this.scene.add(slab);
    const under = new THREE.Mesh(new THREE.PlaneGeometry(bw * 2.4, bd * 2.4), new THREE.MeshBasicMaterial({ map: glowTexture(), color: col(palette.peach), transparent: true, opacity: 0.1, depthWrite: false }));
    under.rotation.x = -Math.PI / 2;
    under.position.y = -depth - 0.6;
    this.scene.add(under);
  }

  get size(): { width: number; height: number } {
    return stage3d()?.size ?? { width: window.innerWidth, height: window.innerHeight };
  }

  // Frame the board between the top and bottom rows of buttons.
  place(): void {
    const s = this.size;
    this.backdrop.resize(s.width, s.height);
    this.orbit.place(s.width, s.height, hud.top() + dioramaStyle.belowHud, hud.bottom(s.height) - dioramaStyle.aboveHud);
  }

  update(dt: number): void {
    this.time += dt;
    this.orbit.update(dt);
    this.place();
    this.backdrop.update(dt, this.orbit.yaw);
    if (this.sparks) {
      const pos = this.sparks.geometry.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < pos.count; k++) pos.setY(k, pos.getY(k) + dt * (0.4 + (k % 5) * 0.08));
      pos.needsUpdate = true;
      const m = this.sparks.material as THREE.PointsMaterial;
      m.opacity = Math.max(0, m.opacity - dt * 0.25);
    }
  }

  get clock(): number {
    return this.time;
  }

  // Where a screen point (px) lands on a horizontal plane at height y, in board units.
  pick(x: number, y: number, planeY = 0): THREE.Vector3 | null {
    const s = this.size;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((x / s.width) * 2 - 1, -(y / s.height) * 2 + 1), this.camera);
    const hit = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY), hit) ? hit : null;
  }

  // The nearest of some objects under a screen point.
  pickObjects(x: number, y: number, objects: THREE.Object3D[]): THREE.Intersection | null {
    const s = this.size;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((x / s.width) * 2 - 1, -(y / s.height) * 2 + 1), this.camera);
    return ray.intersectObjects(objects, true)[0] ?? null;
  }

  // Where a board point shows on screen, in a 2D container's own coordinates.
  toScreen(p: THREE.Vector3, into: Container): { x: number; y: number } {
    const s = this.size;
    return into.toLocal(this.orbit.project(p, s.width, s.height));
  }

  // A ring lying on the board (hints, marks). Its opacity can be pulsed by the caller.
  ring(x: number, z: number, radius: number, color: number, y = 0.05): THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial> {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.025, 8, 40), new THREE.MeshBasicMaterial({ color: col(color), transparent: true, opacity: 0.8, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y, z);
    this.marks.add(ring);
    return ring;
  }

  // A flat strip on the board from a to b (beams, lines, paths).
  strip(a: THREE.Vector3, b: THREE.Vector3, width: number, material: THREE.Material, group: THREE.Group = this.board): THREE.Mesh {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, Math.max(0.001, len)), material);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = -Math.atan2(b.x - a.x, b.z - a.z) + Math.PI;
    m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    group.add(m);
    return m;
  }

  // A solve: the glow swells and sparks of the land's colour rise from given points.
  celebrate(points: THREE.Vector3[], color: number, seconds: number): void {
    this.solved = true;
    gsap.to(this.glow, { v: 1.4, duration: seconds * 0.4, ease: 'sine.inOut' });
    const n = 90;
    const pos = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      const p = points[k % Math.max(1, points.length)] ?? new THREE.Vector3();
      pos.set([p.x + (Math.random() - 0.5) * 0.8, p.y + 0.2 + Math.random() * 0.4, p.z + (Math.random() - 0.5) * 0.8], k * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.sparks = new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTexture(), color: col(color), size: 0.18, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.sparks);
  }

  clearGroup(g: THREE.Group): void {
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    g.clear();
  }

  // The 3D layer fades out first; then the scene is taken apart.
  dispose(): void {
    gsap.killTweensOf(this.glow);
    stage3d()?.hide(this.world);
    const scene = this.scene;
    setTimeout(() => {
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        mats.forEach((x) => x.dispose());
      });
    }, 1000);
  }
}
