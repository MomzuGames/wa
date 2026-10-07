import gsap from 'gsap';
import * as THREE from 'three';
import { FederatedPointerEvent } from 'pixi.js';
import type { ShellContext } from '../types';
import { mixColor, palette } from '../../design/palette';
import { durations, scaled } from '../../design/motion';
import { GhostHand } from '../../ui/ghostHand';
import { col } from '../../three/kit';
import { Diorama } from '../../three/diorama';
import { type Placement, type StoneLevel, type Tri, fromKey, triCorners } from './model';
import { StoneLevelScene } from './view';

// Stone Garden in 3D: a garden of raked sand floating in the night, the outline to fill
// sunk into it, and a stone shelf in front where the stones wait. Each stone is a carved
// mosaic of triangles; it lifts as you drag it, swings round as it turns and over as it
// flips, and settles into the sand. The 2D garden still decides everything (where a stone
// may rest, snapping, the solve): it works on a flat plan of the garden, and the 3D garden
// is that plan laid out in the world. A drag that starts away from the stones turns and
// tilts the garden.

const garden3d = {
  stoneHeight: 0.22,
  lift: 0.45, // how high a dragged stone rises
  inset: 0.03, // the seam between a stone's triangles
} as const;

interface Stone3D {
  root: THREE.Group; // placed at the stone's position
  spin: THREE.Group; // turns and flips with it
  mesh: THREE.Mesh | null;
  material: THREE.MeshStandardMaterial;
  height: number;
}

export class Garden3DScene extends StoneLevelScene {
  readonly ownsBackdrop = true;
  private d!: Diorama;
  private stones3d: Stone3D[] = [];
  private magnet3d: THREE.LineSegments | null = null;
  private ghosts3d = new THREE.Group();
  private turning = false;
  private nudgePulse: gsap.core.Tween | null = null;
  private planHeight = 0; // how deep (in cells) the plan reaches, tray included

  constructor(ctx: ShellContext, level: StoneLevel, isTutorial: boolean, levelIndex: number, levelName: string) {
    super(ctx, level, isTutorial);
    for (const c of [this.silhouette, this.rake, this.ghostLayer, this.magnet, this.piecesLayer]) c.visible = false;
    // The plan reaches from the garden down to the tray; the 3D garden covers all of it.
    const trayDepth = this.toPlan(0, Math.max(...this.views.map((v) => v.slot.y)) + this.cell).y;
    this.planHeight = Math.max(level.height, trayDepth);
    const width = Math.max(level.width, this.toPlan(this.ctx.width, 0).x) + 1;
    this.d = new Diorama({ region: 'stonegarden', levelIndex, levelName, width: Math.min(width, level.width + 4), depth: this.planHeight + 1, slab: { color: mixColor(palette.dim, palette.peach, 0.2), top: mixColor(palette.dim, palette.peach, 0.32) } });
    this.buildGarden();
    this.views.forEach((_, i) => this.stones3d.push(this.makeStone(i)));
    this.d.marks.add(this.ghosts3d);
    this.hit.on('pointerdown', (e: FederatedPointerEvent) => this.onPress(e));
    this.layout(ctx.width, ctx.height);
  }

  // ----- the plan (the 2D garden's flat coordinates) and the world -----

  // A 2D-plan point (px) in cells, measured from the garden's top-left corner.
  private toPlan(px: number, py: number): { x: number; y: number } {
    return { x: (px - this.origin.x) / this.cell, y: (py - this.origin.y) / this.cell };
  }

  // Cells of the plan to board units: the garden is centred left to right; the tray lies in
  // front of it.
  private toWorld(cx: number, cy: number, y = 0): THREE.Vector3 {
    return new THREE.Vector3(cx - this.level.width / 2, y, cy - this.planHeight / 2);
  }

  // A screen point under the finger, as the 2D plan's own coordinates.
  private screenToPlanGlobal(gx: number, gy: number, height = 0): { x: number; y: number } | null {
    const hit = this.d.pick(gx, gy, height);
    if (!hit) return null;
    const local = { x: this.origin.x + (hit.x + this.level.width / 2) * this.cell, y: this.origin.y + (hit.z + this.planHeight / 2) * this.cell };
    return this.container.toGlobal(local);
  }

  // ----- the garden -----

  private buildGarden(): void {
    // The outline to fill, sunk a little into the sand, with a soft edge.
    const tris = this.level.silhouette.map((k) => fromKey(this.level.width, k));
    const shape = this.trisGeometry(tris, 0, 0.004);
    const sunk = new THREE.Mesh(shape, new THREE.MeshBasicMaterial({ color: col(mixColor(palette.void, palette.peach, 0.12)), transparent: true, opacity: 0.85 }));
    sunk.position.copy(this.toWorld(0, 0, 0.005));
    this.d.board.add(sunk);
    const edge = this.outlineGeometry(tris);
    const line = new THREE.LineSegments(edge, new THREE.LineBasicMaterial({ color: col(palette.pearl), transparent: true, opacity: 0.4 }));
    line.position.copy(this.toWorld(0, 0, 0.012));
    this.d.board.add(line);
    // Raked lines in the sand, curving around the garden.
    const rake = new THREE.MeshBasicMaterial({ color: col(palette.pearl), transparent: true, opacity: 0.06 });
    for (let k = 1; k <= 3; k++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(Math.max(this.level.width, this.level.height) * 0.55 + k * 0.35, Math.max(this.level.width, this.level.height) * 0.55 + k * 0.35 + 0.03, 64), rake);
      ring.rotation.x = -Math.PI / 2;
      ring.scale.set(1, (this.level.height / this.level.width) * 1.05, 1);
      ring.position.copy(this.toWorld(this.level.width / 2, this.level.height / 2, 0.003));
      this.d.board.add(ring);
    }
  }

  // Triangles as a flat mesh (or, with depth, a carved slab), corners in cells.
  private trisGeometry(tris: Tri[], depth: number, inset: number): THREE.BufferGeometry {
    const shapes = tris.map((tri) => {
      const c = triCorners(tri);
      const cx = (c[0]![0] + c[1]![0] + c[2]![0]) / 3;
      const cy = (c[0]![1] + c[1]![1] + c[2]![1]) / 3;
      const pull = (p: [number, number]) => new THREE.Vector2(p[0] + (cx - p[0]) * inset * 3, -(p[1] + (cy - p[1]) * inset * 3));
      return new THREE.Shape([pull(c[0]!), pull(c[1]!), pull(c[2]!)]);
    });
    const geo = depth > 0 ? new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 }) : new THREE.ShapeGeometry(shapes);
    // Shapes are drawn in x / -y; lay them on the ground (x, z), with the slab rising up.
    geo.rotateX(-Math.PI / 2);
    return geo;
  }

  // Only the outer boundary of a set of triangles, as line segments on the ground.
  private outlineGeometry(tris: Tri[]): THREE.BufferGeometry {
    const set = new Set(tris.map((t) => t.join(',')));
    const has = (x: number, y: number, t: number) => set.has(`${x},${y},${t}`);
    const pts: THREE.Vector3[] = [];
    const v = (p: [number, number]) => new THREE.Vector3(p[0], 0, p[1]);
    for (const [x, y, t] of tris) {
      const c = triCorners([x, y, t]);
      const across: Tri = t === 0 ? [x, y - 1, 2] : t === 1 ? [x + 1, y, 3] : t === 2 ? [x, y + 1, 0] : [x - 1, y, 1];
      if (!has(...across)) pts.push(v(c[0]!), v(c[1]!));
      if (!has(x, y, (t + 1) % 4)) pts.push(v(c[1]!), v(c[2]!));
      if (!has(x, y, (t + 3) % 4)) pts.push(v(c[2]!), v(c[0]!));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }

  // ----- the stones -----

  private makeStone(i: number): Stone3D {
    const fixed = this.level.pieces[i]!.fixed === true;
    const material = new THREE.MeshStandardMaterial({ color: col(fixed ? mixColor(palette.dim, palette.pearl, 0.25) : mixColor(palette.peach, palette.dim, 0.25)), roughness: 0.8, flatShading: true, emissive: col(palette.peach), emissiveIntensity: 0 });
    const root = new THREE.Group();
    const spin = new THREE.Group();
    root.add(spin);
    this.d.board.add(root);
    const s: Stone3D = { root, spin, mesh: null, material, height: 0 };
    return s;
  }

  // The 2D garden redraws a stone after every turn and flip: the 3D stone takes the new shape.
  protected override redrawPiece(i: number): void {
    super.redrawPiece(i);
    const s = this.stones3d?.[i];
    if (!s || !this.d) return;
    const v = this.views[i]!;
    const tris = this.shapeOf(i, v.rot, v.flip);
    const { w, h } = this.bbox(tris);
    if (s.mesh) {
      s.spin.remove(s.mesh);
      s.mesh.geometry.dispose();
    }
    const geo = this.trisGeometry(tris, garden3d.stoneHeight, garden3d.inset);
    geo.translate(-w / 2, 0, -h / 2);
    s.mesh = new THREE.Mesh(geo, s.material);
    s.spin.add(s.mesh);
    // The stone you touched last (the one the turn and flip buttons act on) glows faintly.
    s.material.emissiveIntensity = this.lastTouched === v ? 0.12 : 0;
  }

  // Every frame the 3D stones follow the plan: position, size, lift, turn and flip.
  private followPlan(dt: number): void {
    this.views.forEach((v, i) => {
      const s = this.stones3d[i]!;
      const p = this.toPlan(v.root.x, v.root.y);
      const lifted = v === this.dragging ? garden3d.lift : 0;
      s.height += (lifted - s.height) * Math.min(1, dt * 12);
      s.root.position.copy(this.toWorld(p.x, p.y, 0.01 + s.height));
      s.root.scale.set(Math.abs(v.root.scale.y), 1, Math.abs(v.root.scale.y));
      s.spin.rotation.y = -v.root.rotation;
      // A flip squashes the stone through its middle, as the 2D stone did.
      s.spin.scale.x = v.root.scale.x / Math.abs(v.root.scale.y || 1);
    });
  }

  // ----- touch: a press on a stone picks it up; anywhere else turns the garden -----

  private onPress(e: FederatedPointerEvent): void {
    if (!this.d) return;
    const hit = this.d.pickObjects(e.global.x, e.global.y, this.stones3d.map((s) => s.root));
    const i = hit ? this.stones3d.findIndex((s) => s.root === hit.object.parent?.parent || s.spin === hit.object.parent) : -1;
    if (i >= 0 && !this.level.pieces[i]!.fixed && !this.solved) {
      const at = this.screenToPlanGlobal(e.global.x, e.global.y, garden3d.stoneHeight);
      if (!at) return;
      this.turning = false;
      this.onDown(i, Object.assign(new FederatedPointerEvent(e.manager), { global: at, button: e.button, detail: e.detail }) as FederatedPointerEvent);
      return;
    }
    this.turning = true;
    this.d.orbit.down(e.global.x, e.global.y);
  }

  protected override onMove(e: FederatedPointerEvent): void {
    if (!this.d) return;
    if (this.turning) {
      this.d.orbit.move(e.global.x, e.global.y);
      return;
    }
    if (!this.dragging) return;
    const at = this.screenToPlanGlobal(e.global.x, e.global.y, garden3d.lift);
    if (!at) return;
    super.onMove(Object.assign(new FederatedPointerEvent(e.manager), { global: at }) as FederatedPointerEvent);
    this.drawMagnet();
  }

  protected override onUp(): void {
    if (!this.d) {
      super.onUp();
      return;
    }
    if (this.turning) {
      this.d.orbit.up();
      this.turning = false;
      return;
    }
    super.onUp();
    this.clearMagnet();
  }

  // While dragging: the spot the stone would settle into is outlined on the sand.
  private drawMagnet(): void {
    this.clearMagnet();
    const v = this.dragging;
    if (!v) return;
    const i = this.views.indexOf(v);
    const placement = this.overTray(v) ? null : this.snapPlacement(i, v);
    if (!placement || !this.canPlace(i, placement)) return;
    const fits = this.fitsOutline(i, placement);
    this.magnet3d = this.outlineAt(i, placement, fits ? palette.peach : palette.pearl, fits ? 0.9 : 0.4);
  }

  private clearMagnet(): void {
    if (this.magnet3d) this.d.marks.remove(this.magnet3d);
    this.magnet3d = null;
  }

  private outlineAt(i: number, at: Placement, color: number, opacity: number): THREE.LineSegments {
    const tris = this.shapeOf(i, at.rot, at.flip);
    const line = new THREE.LineSegments(this.outlineGeometry(tris), new THREE.LineBasicMaterial({ color: col(color), transparent: true, opacity }));
    line.position.copy(this.toWorld(at.x, at.y, 0.03));
    this.d.marks.add(line);
    return line;
  }

  // ----- hints: the stone to try pulses; outlines show where stones belong -----

  protected override showNudge(piece: number): void {
    this.clearNudge();
    const m = this.stones3d[piece]?.material;
    if (!m) return;
    this.nudgePulse = gsap.fromTo(m, { emissiveIntensity: 0 }, { emissiveIntensity: 0.5, duration: 0.7, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    this.nudge = { piece, tween: this.nudgePulse };
  }

  protected override clearNudge(): void {
    if (!this.nudge) return;
    this.nudgePulse?.kill();
    this.nudgePulse = null;
    const m = this.stones3d[this.nudge.piece]?.material;
    if (m) m.emissiveIntensity = 0;
    this.nudge = null;
  }

  protected override drawGhosts(): void {
    super.drawGhosts();
    if (!this.d) return;
    this.ghosts3d.clear();
    for (const [piece, at] of this.ghosts) {
      const tris = this.shapeOf(piece, at.rot, at.flip);
      const line = new THREE.LineSegments(this.outlineGeometry(tris), new THREE.LineBasicMaterial({ color: col(palette.pearl), transparent: true, opacity: 0.75 }));
      line.position.copy(this.toWorld(at.x, at.y, 0.035));
      this.ghosts3d.add(line);
    }
  }

  // ----- frame, layout, tutorial, solve -----

  override layout(width: number, height: number): void {
    super.layout(width, height);
    this.d?.place();
  }

  override update(dt: number): void {
    super.update(dt);
    if (!this.d) return;
    this.followPlan(dt);
    this.d.update(dt);
  }

  // The first garden: the ghost hand drags the first stone from the shelf into the outline.
  protected override scheduleTutorial(): void {
    this.stopTutorial();
    this.tutorialTimer = gsap.delayedCall(1.6, () => {
      const i = this.views.findIndex((v, k) => !v.placed && !this.level.pieces[k]!.fixed);
      if (i < 0 || !this.d) return;
      if (!this.hand) {
        this.hand = new GhostHand();
        this.container.addChild(this.hand);
      }
      const v = this.views[i]!;
      const piece = this.level.pieces[i]!;
      const target = this.boardCenterFor(i, { ...piece.solution, rot: 0, flip: 0 });
      const a = this.toPlan(v.slot.x, v.slot.y);
      const b = this.toPlan(target.x, target.y);
      this.hand.demoPath([this.d.toScreen(this.toWorld(a.x, a.y), this.container), this.d.toScreen(this.toWorld(b.x, b.y), this.container)]);
    });
  }

  override playCompletion(): Promise<void> {
    this.stopTutorial();
    this.voice.solve();
    const total = scaled(durations.completion);
    // The seams close: every stone glows warm and the garden breathes out sparks of sand.
    this.stones3d.forEach((s) => gsap.to(s.material, { emissiveIntensity: 0.35, duration: total * 0.4, yoyo: true, repeat: 1 }));
    const tops = this.views.filter((v) => v.placed).map((v) => {
      const p = this.toPlan(v.root.x, v.root.y);
      return this.toWorld(p.x, p.y, garden3d.stoneHeight);
    });
    this.d.celebrate(tops, palette.peach, total);
    return new Promise((resolve) => gsap.delayedCall(total, resolve));
  }

  override destroy(): void {
    this.clearNudge();
    super.destroy();
    this.d.dispose();
  }
}
