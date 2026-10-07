import gsap from 'gsap';
import * as THREE from 'three';
import type { FederatedPointerEvent } from 'pixi.js';
import type { ShellContext } from '../types';
import { mixColor, palette } from '../../design/palette';
import { durations, reducedMotion, scaled } from '../../design/motion';
import { col, glowSprite } from '../../three/kit';
import { Diorama } from '../../three/diorama';
import type { SkyLevel } from './model';
import { SkyLevelScene } from './view';

// Night Sky in 3D: the constellation lies on a dark glassy plate floating in the night. Stars
// are glowing orbs, the lines faint threads between them (a second thread for a line traced
// twice, travelling sparks for a one-way line), the traced path glowing lavender rods. The
// 2D sky asks where each star is on screen; here the answer is the 3D star's place, so the
// whole stroke works as before. Press a star and draw without lifting; a drag that starts
// away from the stars turns and tilts the plate.

const sky3d = {
  size: 6, // the plate, in board units
  starY: 0.12,
  rod: 0.02,
  litRod: 0.05,
  drift: 0.18, // board units a drifting star wanders
} as const;

const UP = new THREE.Vector3(0, 1, 0);

function placeRod(rod: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
  const len = Math.max(0.001, a.distanceTo(b));
  rod.position.copy(a).add(b).multiplyScalar(0.5);
  rod.scale.set(1, len, 1);
  rod.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
}

export class NightSky3DScene extends SkyLevelScene {
  readonly ownsBackdrop = true;
  private d!: Diorama;
  private turning = false;
  private stars3d: Array<{ core: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>; halo: THREE.Sprite; dots: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[] }> = [];
  private edges3d: Array<{ rod: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>; twin: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial> | null; sparks: THREE.Sprite[] }> = [];
  private litPool: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>[] = [];
  private clueRods: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>[] = [];
  private clueRings3d: THREE.Mesh[] = [];
  private unitRod = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
  private flash = 0;

  constructor(ctx: ShellContext, level: SkyLevel, isTutorial: boolean, levelIndex: number, levelName: string) {
    super(ctx, level, isTutorial);
    for (const c of [this.edgesLayer, this.litLayer, this.starsLayer, this.clueLayer]) c.visible = false;
    this.d = new Diorama({ region: 'nightsky', levelIndex, levelName, width: sky3d.size, depth: sky3d.size, slab: { color: mixColor(palette.dim, palette.sky, 0.16), top: mixColor(palette.void, palette.sky, 0.1), depth: 0.3 } });
    const thread = () => new THREE.MeshBasicMaterial({ color: col(mixColor(palette.dim, palette.pearl, 0.35)), transparent: true, opacity: 0.8 });
    level.edges.forEach((e) => {
      const rod = new THREE.Mesh(this.unitRod, thread());
      rod.scale.set(sky3d.rod, 1, sky3d.rod);
      this.d.board.add(rod);
      let twin: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial> | null = null;
      if (e.required === 2) {
        twin = new THREE.Mesh(this.unitRod, thread());
        this.d.board.add(twin);
      }
      const sparks = e.oneWay ? [0, 1, 2].map(() => glowSprite(palette.lavender, 0.22, 0.7)) : [];
      sparks.forEach((s) => this.d.board.add(s));
      this.edges3d.push({ rod, twin, sparks });
    });
    level.stars.forEach((_, i) => {
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 12), new THREE.MeshBasicMaterial({ color: col(palette.pearl) }));
      const halo = glowSprite(palette.lavender, 0.7, 0.35);
      const position = (level.order ?? []).indexOf(i);
      const dots = position < 0 ? [] : Array.from({ length: position + 1 }, () => new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), new THREE.MeshBasicMaterial({ color: col(palette.pearl) })));
      this.d.board.add(core, halo, ...dots);
      this.stars3d.push({ core, halo, dots });
    });
    this.layout(ctx.width, ctx.height);
  }

  // A star's place on the plate (drifting stars wander a little).
  private star3(i: number): THREE.Vector3 {
    const s = this.level.stars[i]!;
    let dx = 0;
    let dy = 0;
    if (this.level.drift && !reducedMotion()) {
      const p = this.phases[i]!;
      dx = Math.sin(this.time * 0.5 + p) * sky3d.drift;
      dy = Math.cos(this.time * 0.4 + p) * sky3d.drift;
    }
    return new THREE.Vector3((s.x - 0.5) * sky3d.size + dx, sky3d.starY, (s.y - 0.5) * sky3d.size + dy);
  }

  // Where a star shows on screen: the 2D stroke logic reads this.
  protected override starPos(i: number): { x: number; y: number } {
    if (!this.d) return super.starPos(i);
    return this.d.toScreen(this.star3(i), this.container);
  }

  // ----- touch: a press on a star draws; anywhere else it turns the plate -----

  protected override onDown(e: FederatedPointerEvent): void {
    if (!this.d) return;
    super.onDown(e);
    this.turning = !this.dragging && !this.locked && !this.solved;
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

  // ----- drawing: the 3D objects follow the stroke every frame -----

  protected override redrawAll(): void {
    if (!this.d) return;
    this.sync3d();
    this.drawRubber();
  }

  protected override drawLit(): void {
    if (!this.d) return;
    this.sync3d();
    this.drawRubber();
  }

  protected override drawStars(): void {
    if (this.d) this.sync3d();
  }

  // The rubber band from the current star to the finger stays a flat line on the glass.
  private drawRubber(): void {
    this.rubber.clear();
    if (this.dragging && this.stroke.current !== null) {
      const a = this.starPos(this.stroke.current);
      this.rubber.moveTo(a.x, a.y).lineTo(this.pointer.x, this.pointer.y).stroke({ color: this.accent, width: 1.5, alpha: 0.4 });
    }
  }

  private sync3d(): void {
    const traced = new Set<number>();
    this.stroke.path.forEach((s) => {
      traced.add(s.from);
      traced.add(s.to);
    });
    this.level.stars.forEach((_, i) => {
      const v = this.stars3d[i]!;
      const p = this.star3(i);
      const lit = traced.has(i) || this.stroke.current === i;
      v.core.position.copy(p);
      v.core.material.color.set(lit ? palette.lavender : palette.pearl);
      v.halo.position.copy(p);
      v.halo.material.opacity = this.stroke.current === i ? 0.7 : lit ? 0.45 : 0.25;
      const position = (this.level.order ?? []).indexOf(i);
      v.dots.forEach((dot, k) => {
        dot.position.set(p.x + (k - position / 2) * 0.12, 0.05, p.z + 0.26);
        dot.material.color.set(position < this.stroke.reached ? palette.lavender : palette.pearl);
      });
    });
    this.level.edges.forEach((e, i) => {
      const v = this.edges3d[i]!;
      const a = this.star3(e.a);
      const b = this.star3(e.b);
      placeRod(v.rod, a, b);
      v.rod.scale.x = v.rod.scale.z = sky3d.rod;
      const remaining = this.stroke.remaining[i]!;
      v.rod.material.opacity = remaining > 0 ? 0.8 : 0.25;
      if (v.twin) {
        const side = new THREE.Vector3(-(b.z - a.z), 0, b.x - a.x).normalize().multiplyScalar(0.07);
        placeRod(v.twin, a.clone().add(side), b.clone().add(side));
        v.twin.scale.x = v.twin.scale.z = sky3d.rod * 0.8;
        v.twin.visible = remaining === 2;
      }
      v.sparks.forEach((s, k) => {
        const t = ((this.time * 0.35 + k / 3) % 1 + 1) % 1;
        s.position.copy(a).lerp(b, t);
        s.visible = remaining > 0;
        s.material.opacity = 0.7 * (1 - Math.abs(t - 0.5) * 1.2);
      });
    });
    // The traced path: glowing rods, one per step.
    while (this.litPool.length < this.stroke.path.length) {
      const rod = new THREE.Mesh(this.unitRod, new THREE.MeshBasicMaterial({ color: col(palette.lavender), transparent: true, opacity: 0.95 }));
      this.d.board.add(rod);
      this.litPool.push(rod);
    }
    this.litPool.forEach((rod, k) => {
      const step = this.stroke.path[k];
      rod.visible = !!step;
      if (!step) return;
      placeRod(rod, this.star3(step.from).setY(sky3d.starY + 0.01), this.star3(step.to).setY(sky3d.starY + 0.01));
      rod.scale.x = rod.scale.z = sky3d.litRod;
      rod.material.color.set(k < this.flash ? palette.pearl : palette.lavender);
    });
    // Hints: a ring around the start, then the guide's lines glowing softly.
    this.clueRings3d.forEach((r) => this.d.marks.remove(r));
    this.clueRings3d = this.clueRings.map((i) => {
      const p = this.star3(i);
      const ring = this.d.ring(p.x, p.z, 0.32, palette.lavender, 0.1);
      ring.material.opacity = 0.5 + 0.3 * Math.sin(this.time * 3);
      return ring;
    });
    while (this.clueRods.length < this.clueEdges.length) {
      const rod = new THREE.Mesh(this.unitRod, new THREE.MeshBasicMaterial({ color: col(palette.lavender), transparent: true, opacity: 0.35, depthWrite: false }));
      this.d.marks.add(rod);
      this.clueRods.push(rod);
    }
    this.clueRods.forEach((rod, k) => {
      const e = this.clueEdges[k];
      rod.visible = e !== undefined;
      if (e === undefined) return;
      const edge = this.level.edges[e]!;
      placeRod(rod, this.star3(edge.a), this.star3(edge.b));
      rod.scale.x = rod.scale.z = sky3d.litRod * 1.4;
      rod.material.opacity = 0.25 + 0.2 * Math.sin(this.time * 4);
    });
  }

  override layout(width: number, height: number): void {
    super.layout(width, height);
    this.d?.place();
  }

  override update(dt: number): void {
    this.time += dt;
    if (!this.d) return;
    this.d.update(dt);
    this.sync3d();
    if (this.dragging) this.drawRubber();
  }

  // The solve: the path replays as a melody, each line flashing pearl in turn, and sparks rise.
  override playCompletion(): Promise<void> {
    this.stopTutorial();
    const steps = this.stroke.path.length;
    const stepSeconds = scaled(0.16);
    this.voice.replay(steps, stepSeconds);
    const total = scaled(durations.completion);
    gsap.to(this, { flash: steps, duration: stepSeconds * steps, ease: 'none' });
    this.d.celebrate(this.level.stars.map((_, i) => this.star3(i)), palette.lavender, total);
    return new Promise((resolve) => gsap.delayedCall(stepSeconds * steps + total * 0.7, resolve));
  }

  override destroy(): void {
    gsap.killTweensOf(this);
    super.destroy();
    this.d.dispose();
  }
}
