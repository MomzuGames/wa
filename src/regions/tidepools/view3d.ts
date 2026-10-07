import gsap from 'gsap';
import * as THREE from 'three';
import { type FederatedPointerEvent, Graphics } from 'pixi.js';
import type { ShellContext } from '../types';
import { mixColor, palette } from '../../design/palette';
import { durations, scaled } from '../../design/motion';
import { makeFinger } from '../../ui/introGlyphs';
import { col, glowTexture } from '../../three/kit';
import { Diorama } from '../../three/diorama';
import { type ShellLevel, clueMet, clueState, edgeEnds, exits } from './model';
import { ShellPoolScene } from './view';

// Tidepools in 3D: the pool is a diorama of wet sand and shallow water; the points are small
// drops; shells (○) are pale rings and stones (●) round pebbles, mint once met and peach as
// soon as a line breaks them; the drawn tide is glowing water running between the points,
// with glints of light flowing along it. Drag from point to point to draw (a drag that
// starts away from the points turns the pool); drag back over a line to erase; tap a point
// to clear it. The rules, hints and notes are the 2D pool's.

const pool3d = {
  waterY: 0.05,
  snap: 0.42, // of a cell: how close the finger must come to a point
  glintSpacing: 0.85,
  glintSpeed: 0.9,
} as const;

export class Pool3DScene extends ShellPoolScene {
  readonly ownsBackdrop = true;
  private d!: Diorama;
  private water3d = new THREE.Group();
  private clues3d = new THREE.Group();
  private ghosts3d = new Map<number, THREE.Mesh>();
  private nudge3d: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial> | null = null;
  private glints!: THREE.Points;
  private turning = false;
  private demoLine: THREE.Group | null = null;

  constructor(ctx: ShellContext, level: ShellLevel, tutorial: boolean, levelIndex: number, levelName: string) {
    super(ctx, level, tutorial);
    for (const g of [this.water, this.points, this.glow, this.lines, this.flow, this.clueLayer, this.hintLayer]) g.visible = false;
    const w = level.width - 1;
    const h = level.height - 1;
    this.d = new Diorama({ region: 'tidepools', levelIndex, levelName, width: w + 1, depth: h + 1, slab: { color: mixColor(palette.dim, palette.peach, 0.2), top: mixColor(palette.dim, palette.peach, 0.28) } });
    // Shallow water over the sand, and the points as small drops.
    const shallow = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.6, h + 0.6), new THREE.MeshBasicMaterial({ color: col(mixColor(palette.void, palette.mint, 0.18)), transparent: true, opacity: 0.55, depthWrite: false }));
    shallow.rotation.x = -Math.PI / 2;
    shallow.position.y = 0.005;
    this.d.board.add(shallow);
    const drop = new THREE.MeshBasicMaterial({ color: col(palette.mint), transparent: true, opacity: 0.55 });
    const dropGeo = new THREE.SphereGeometry(0.045, 10, 8);
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const d = new THREE.Mesh(dropGeo, drop);
        d.position.copy(this.at(x, y)).setY(0.03);
        this.d.board.add(d);
      }
    }
    const n = 120;
    const glintGeo = new THREE.BufferGeometry();
    glintGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3).fill(-99), 3));
    this.glints = new THREE.Points(glintGeo, new THREE.PointsMaterial({ map: glowTexture(), color: col(palette.pearl), size: 0.14, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.d.board.add(this.water3d, this.clues3d, this.glints);
    this.layout(ctx.width, ctx.height);
  }

  // A point of the pool in board units.
  private at(x: number, y: number): THREE.Vector3 {
    return new THREE.Vector3(x - (this.level.width - 1) / 2, pool3d.waterY, y - (this.level.height - 1) / 2);
  }

  // ----- the finger: the 2D pool asks which point is under it; the 3D pool answers -----

  protected override pointNear(gx: number, gy: number): { x: number; y: number } | null {
    if (!this.d) return null;
    const hit = this.d.pick(gx, gy, pool3d.waterY);
    if (!hit) return null;
    const x = Math.round(hit.x + (this.level.width - 1) / 2);
    const y = Math.round(hit.z + (this.level.height - 1) / 2);
    if (x < 0 || y < 0 || x >= this.level.width || y >= this.level.height) return null;
    const p = this.at(x, y);
    if (Math.hypot(hit.x - p.x, hit.z - p.z) > pool3d.snap) return null;
    return { x, y };
  }

  // A press on a point draws; anywhere else it turns and tilts the pool.
  protected override onDown(e: FederatedPointerEvent): void {
    if (!this.d) return;
    super.onDown(e);
    this.turning = !this.dragging;
    if (this.turning) this.d.orbit.down(e.global.x, e.global.y);
  }

  protected override onMove(e: FederatedPointerEvent): void {
    if (!this.d) return;
    if (this.turning) this.d.orbit.move(e.global.x, e.global.y);
    else super.onMove(e);
  }

  protected override onUp(): void {
    if (!this.d) return;
    if (this.turning) {
      this.d.orbit.up();
      this.turning = false;
      return;
    }
    super.onUp();
  }

  // ----- drawing: the 2D redraw becomes a 3D refresh -----

  protected override redraw(): void {
    if (!this.d) return;
    this.d.clearGroup(this.water3d);
    const { width: w, height: h } = this.level;
    const glow = new THREE.MeshBasicMaterial({ color: col(palette.mint), transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
    const body = new THREE.MeshBasicMaterial({ color: col(palette.mint), transparent: true, opacity: 0.85, depthWrite: false });
    for (const e of this.drawn) {
      const [a, b] = edgeEnds(w, h, e);
      const pa = this.at(a.x, a.y);
      const pb = this.at(b.x, b.y);
      this.d.strip(pa.clone().setY(0.055), pb.clone().setY(0.055), 0.34, glow, this.water3d);
      this.d.strip(pa.clone().setY(0.06), pb.clone().setY(0.06), 0.11, body, this.water3d);
    }
    // Open ends: a drop of water where a stream stops.
    const endMat = new THREE.MeshBasicMaterial({ color: col(palette.mint) });
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (exits(this.level, this.drawn, x, y).length !== 1) continue;
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), endMat);
        dot.position.copy(this.at(x, y)).setY(0.07);
        this.water3d.add(dot);
      }
    }
    this.runs = this.findRuns();
    this.drawClues();
  }

  // Shells as pale rings, stones as round pebbles; mint once met, peach once broken.
  protected override drawClues(): void {
    if (!this.d) return;
    this.d.clearGroup(this.clues3d);
    for (const c of this.level.clues) {
      const state = clueState(this.level, this.drawn, c);
      const color = state === 'met' ? palette.mint : state === 'broken' ? palette.peach : palette.pearl;
      const p = this.at(c.x, c.y);
      if (state !== 'open') {
        const halo = new THREE.Mesh(new THREE.CircleGeometry(0.42, 28), new THREE.MeshBasicMaterial({ color: col(color), transparent: true, opacity: 0.16, depthWrite: false }));
        halo.rotation.x = -Math.PI / 2;
        halo.position.copy(p).setY(0.065);
        this.clues3d.add(halo);
      }
      if (c.kind === 'shell') {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.06, 12, 32), new THREE.MeshStandardMaterial({ color: col(color), roughness: 0.4, emissive: col(color), emissiveIntensity: state === 'open' ? 0.1 : 0.35 }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.copy(p).setY(0.12);
        this.clues3d.add(ring);
      } else {
        const pebble = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), new THREE.MeshStandardMaterial({ color: col(color), roughness: 0.5, emissive: col(color), emissiveIntensity: state === 'open' ? 0.08 : 0.3 }));
        pebble.scale.set(1, 0.7, 1);
        pebble.position.copy(p).setY(0.16);
        this.clues3d.add(pebble);
      }
    }
  }

  // Glints of light flowing along every stream and around closed loops.
  protected override drawFlow(): void {
    if (!this.d) return;
    const pos = this.glints.geometry.attributes.position as THREE.BufferAttribute;
    let k = 0;
    const shift = (this.time * pool3d.glintSpeed * this.flowBoost) % pool3d.glintSpacing;
    for (const run of this.runs) {
      for (let s = shift; s < run.length - 1 && k < pos.count; s += pool3d.glintSpacing) {
        const i = Math.floor(s);
        const f = s - i;
        const a = this.at(run[i]!.x, run[i]!.y);
        const b = this.at(run[i + 1]!.x, run[i + 1]!.y);
        pos.setXYZ(k++, a.x + (b.x - a.x) * f, 0.08, a.z + (b.z - a.z) * f);
      }
    }
    for (; k < pos.count; k++) pos.setXYZ(k, 0, -99, 0);
    pos.needsUpdate = true;
  }

  // A closed loop that is not right: the clues it misses pulse peach for a moment.
  protected override pulseUnmet(): void {
    for (const c of this.level.clues) {
      if (clueMet(this.level, this.drawn, c)) continue;
      const p = this.at(c.x, c.y);
      const ring = this.d.ring(p.x, p.z, 0.45, palette.peach, 0.1);
      gsap.fromTo(ring.material, { opacity: 0 }, { opacity: 0.9, duration: 0.45, yoyo: true, repeat: 3, onComplete: () => this.d.marks.remove(ring) });
    }
  }

  // ----- hints -----

  protected override showNudge(x: number, y: number): void {
    this.clearNudge();
    if (!this.d) return;
    const p = this.at(x, y);
    this.nudge3d = this.d.ring(p.x, p.z, 0.4, palette.pearl, 0.1);
    this.nudge = { g: new Graphics(), tween: gsap.to({}, { duration: 0 }) };
  }

  protected override clearNudge(): void {
    if (this.nudge3d) this.d?.marks.remove(this.nudge3d);
    this.nudge3d = null;
    this.nudge = null;
  }

  protected override addGhost(e: number, on: boolean): void {
    if (!this.d) return;
    const [a, b] = edgeEnds(this.level.width, this.level.height, e);
    const mat = new THREE.MeshBasicMaterial({ color: col(on ? palette.pearl : palette.peach), transparent: true, opacity: on ? 0.4 : 0.6, depthWrite: false });
    const m = this.d.strip(this.at(a.x, a.y).setY(0.09), this.at(b.x, b.y).setY(0.09), on ? 0.09 : 0.2, mat, this.d.marks);
    this.ghosts3d.set(e, m);
    this.ghosts.set(e, new Graphics());
  }

  protected override settleHints(): void {
    for (const [e] of this.ghosts) {
      if (this.drawn.has(e) !== this.level.solution.includes(e)) continue;
      const m = this.ghosts3d.get(e);
      if (m) this.d.marks.remove(m);
      this.ghosts3d.delete(e);
      this.ghosts.delete(e);
    }
    if (this.hintTarget && this.stepDone(this.hintTarget)) {
      this.clearNudge();
      this.hintTarget = null;
    }
  }

  protected override rebuildHints(): void {
    if (this.hintTarget && this.d) this.showNudge(this.hintTarget.x, this.hintTarget.y);
  }

  protected override clearHints(): void {
    this.clearNudge();
    this.ghosts3d.forEach((m) => this.d?.marks.remove(m));
    this.ghosts3d.clear();
    this.ghosts.clear();
    this.hintTarget = null;
  }

  // ----- the first pool: the whole loop shows faintly and a finger traces it -----

  protected override startDemo(): void {
    if (this.demo || this.drawn.size > 0 || this.solved || !this.d) return;
    const pts = this.loopPoints();
    const faint = new THREE.MeshBasicMaterial({ color: col(palette.pearl), transparent: true, opacity: 0.25, depthWrite: false });
    this.demoLine = new THREE.Group();
    for (let i = 1; i < pts.length; i++) this.d.strip(this.at(pts[i - 1]!.x, pts[i - 1]!.y).setY(0.07), this.at(pts[i]!.x, pts[i]!.y).setY(0.07), 0.09, faint, this.demoLine);
    this.d.marks.add(this.demoLine);
    const finger = makeFinger();
    this.hintLayer.visible = true;
    this.hintLayer.addChild(finger);
    const where = (i: number) => this.d.toScreen(this.at(pts[i]!.x, pts[i]!.y), this.hintLayer);
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.2 });
    tl.call(() => {
      const p = where(0);
      finger.position.set(p.x, p.y);
    }).to(finger, { alpha: 1, duration: 0.25 });
    for (let i = 1; i < pts.length; i++) {
      const target = { t: 0 };
      tl.to(target, {
        t: 1,
        duration: 0.35,
        ease: 'none',
        onUpdate: () => {
          const a = where(i - 1);
          const b = where(i);
          finger.position.set(a.x + (b.x - a.x) * target.t, a.y + (b.y - a.y) * target.t);
        },
      });
    }
    tl.to(finger, { alpha: 0, duration: 0.3, delay: 0.3 });
    this.demo = { line: new Graphics(), finger, tl };
  }

  protected override stopDemo(): void {
    if (!this.demo) return;
    this.demo.tl.kill();
    this.demo.finger.destroy();
    this.demo = null;
    if (this.demoLine) this.d.marks.remove(this.demoLine);
    this.demoLine = null;
  }

  // ----- frame, layout, solve -----

  override layout(width: number, height: number): void {
    super.layout(width, height);
    this.d?.place();
  }

  override update(dt: number): void {
    super.update(dt);
    if (!this.d) return;
    this.d.update(dt);
    if (this.nudge3d) this.nudge3d.material.opacity = 0.45 + 0.4 * Math.sin(this.time * 3);
  }

  override playCompletion(): Promise<void> {
    this.clearHints();
    this.voice.solve();
    const total = scaled(durations.completion);
    gsap.timeline().to(this, { flowBoost: 4, duration: total * 0.3 }).to(this, { flowBoost: 1.5, duration: total * 0.6 });
    const loop = this.runs.flat().map((p) => this.at(p.x, p.y));
    this.d.celebrate(loop, palette.mint, total);
    return new Promise((resolve) => gsap.delayedCall(total, resolve));
  }

  override destroy(): void {
    super.destroy();
    this.d.dispose();
  }
}
