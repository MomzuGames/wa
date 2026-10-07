import gsap from 'gsap';
import * as THREE from 'three';
import type { FederatedPointerEvent } from 'pixi.js';
import type { ShellContext } from '../types';
import { mixColor, palette } from '../../design/palette';
import { durations, scaled } from '../../design/motion';
import { GhostHand } from '../../ui/ghostHand';
import { col } from '../../three/kit';
import { Diorama } from '../../three/diorama';
import { type ShadowLevel, frontProfile, sideProfile, stoneCount } from './model';
import { ShadowLevelScene } from './view';

// Shadow Terrace in 3D: the terrace is a diorama of stone stacks. Each stack is real stone
// blocks; along two edges lie the shadows the rows and columns throw (a faint outline where
// each should reach, a soft dark strip for where it reaches now, glowing sage once they
// match); the stone count is a small glass lantern at a corner. Swipe to turn and tilt; tap
// a stack to add a stone, hold it to take one away. The rules and hints are the 2D terrace's.

const terrace3d = {
  block: 0.42, // height of one stone
  gap: 0.035,
  shadowPerStone: 0.45, // how far a shadow reaches per stone, in cells
  longPress: 0.55,
} as const;

export class Shadow3DScene extends ShadowLevelScene {
  readonly ownsBackdrop = true;
  private d!: Diorama;
  private stacks = new THREE.Group();
  private shadows = new THREE.Group();
  private ghostsGroup = new THREE.Group();
  private gaugeGroup = new THREE.Group();
  private tiles: THREE.Mesh[] = [];
  private markRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial> | null = null;
  private holdTimer: gsap.core.Tween | null = null;
  private held = false;
  private pressCell = -1;
  private stone!: THREE.MeshLambertMaterial;
  private fixedStone!: THREE.MeshLambertMaterial;
  private blockGeo!: THREE.BoxGeometry;

  constructor(ctx: ShellContext, level: ShadowLevel, isTutorial: boolean, levelIndex: number, levelName: string) {
    super(ctx, level, isTutorial);
    // The 2D drawing steps aside; its touch surface stays and feeds the 3D view.
    for (const g of [this.floor, this.walls, this.stones, this.ghosts, this.gauge, this.moon]) g.visible = false;
    const n = level.size;
    this.d = new Diorama({ region: 'shadowterrace', levelIndex, levelName, width: n + 2.4, depth: n + 2.4, high: level.maxHeight * terrace3d.block * 0.7, flat: { pitch: 0.95, yaw: Math.PI / 4 }, slab: { color: mixColor(palette.earth, palette.sage, 0.22), top: mixColor(palette.earth, palette.peach, 0.18) } });
    this.stone = new THREE.MeshLambertMaterial({ color: col(mixColor(palette.earth, palette.sage, 0.55)), flatShading: true });
    this.fixedStone = new THREE.MeshLambertMaterial({ color: col(mixColor(palette.earth, palette.pearl, 0.25)), flatShading: true });
    this.blockGeo = new THREE.BoxGeometry(1 - terrace3d.gap * 4, terrace3d.block - terrace3d.gap, 1 - terrace3d.gap * 4);
    // The terrace floor: one tile per cell (also what a tap lands on).
    const tileMat = new THREE.MeshLambertMaterial({ color: col(mixColor(palette.earth, palette.sage, 0.3)) });
    for (let i = 0; i < n * n; i++) {
      const p = this.cellPos(i);
      const tile = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.06, 0.96), tileMat);
      tile.position.set(p.x, 0.03, p.z);
      tile.userData.cell = i;
      this.tiles.push(tile);
      this.d.board.add(tile);
    }
    this.d.board.add(this.stacks, this.shadows, this.gaugeGroup);
    this.d.marks.add(this.ghostsGroup);
    this.layout(ctx.width, ctx.height);
  }

  // Cell i's centre on the terrace floor, in board units (the terrace sits a little back
  // from the middle so the shadows in front of it fit too).
  private cellPos(i: number): THREE.Vector3 {
    const n = this.level.size;
    return new THREE.Vector3((i % n) - (n - 1) / 2 - 0.6, 0.06, Math.floor(i / n) - (n - 1) / 2 - 0.6);
  }

  // ----- drawing: the 2D draw() becomes a 3D refresh -----

  protected override draw(): void {
    if (!this.d) return;
    this.drawStacks();
    this.drawShadows();
    this.drawGhosts3d();
    this.drawGauge3d();
    this.dirty = false;
  }

  private drawStacks(): void {
    this.d.clearGroup(this.stacks);
    this.shown.forEach((h, i) => {
      const p = this.cellPos(i);
      const mat = this.level.fixed[i]! >= 0 ? this.fixedStone : this.stone;
      const whole = Math.floor(Math.max(0, h) + 1e-6);
      const part = Math.max(0, h) - whole;
      for (let k = 0; k < whole; k++) {
        const b = new THREE.Mesh(this.blockGeo, mat);
        b.position.set(p.x, p.y + terrace3d.block * (k + 0.5), p.z);
        b.userData.cell = i;
        this.stacks.add(b);
      }
      if (part > 0.02) {
        const b = new THREE.Mesh(this.blockGeo, mat);
        b.scale.y = part;
        b.position.set(p.x, p.y + terrace3d.block * (whole + part / 2), p.z);
        b.userData.cell = i;
        this.stacks.add(b);
      }
    });
  }

  // The shadows: per column along the front edge, per row along the side edge.
  private drawShadows(): void {
    this.d.clearGroup(this.shadows);
    const n = this.level.size;
    const front = frontProfile(n, this.heights);
    const side = sideProfile(n, this.heights);
    // Soft, rounded and faint: where a shadow should reach is a pale sage wash, the shadow
    // cast now a gentle darkening, a shadow that matches a soft sage glow.
    const want = new THREE.MeshBasicMaterial({ color: col(mixColor(palette.sage, palette.pearl, 0.3)), transparent: true, opacity: 0.08, depthWrite: false });
    const cast = new THREE.MeshBasicMaterial({ color: col(palette.void), transparent: true, opacity: 0.45, depthWrite: false });
    const met = new THREE.MeshBasicMaterial({ color: col(palette.sage), transparent: true, opacity: 0.26, depthWrite: false });
    const edge = n / 2 - 0.6 + 0.1;
    const strip = (along: 'x' | 'z', k: number, length: number, mat: THREE.Material, y: number) => {
      if (length <= 0) return;
      const m = new THREE.Mesh(roundedPlane(0.8, length, 0.16), mat);
      m.rotation.x = -Math.PI / 2;
      const c = k - (n - 1) / 2 - 0.6;
      if (along === 'z') m.position.set(c, y, edge + length / 2);
      else {
        m.rotation.z = Math.PI / 2;
        m.position.set(edge + length / 2, y, c);
      }
      this.shadows.add(m);
    };
    for (let k = 0; k < n; k++) {
      const fWant = this.level.front[k]! * terrace3d.shadowPerStone;
      const fCast = front[k]! * terrace3d.shadowPerStone;
      strip('z', k, fWant, front[k] === this.level.front[k] ? met : want, 0.008);
      strip('z', k, fCast, cast, 0.01);
      const sWant = this.level.side[k]! * terrace3d.shadowPerStone;
      const sCast = side[k]! * terrace3d.shadowPerStone;
      strip('x', k, sWant, side[k] === this.level.side[k] ? met : want, 0.008);
      strip('x', k, sCast, cast, 0.01);
    }
  }

  // Hints: a ring around the marked stack with its row and column faintly lit, and pale
  // outlines of the right heights (a cross on the floor means "take these away").
  private drawGhosts3d(): void {
    this.d.clearGroup(this.ghostsGroup);
    const n = this.level.size;
    const line = new THREE.LineBasicMaterial({ color: col(palette.pearl), transparent: true, opacity: 0.7 });
    for (const [i, g] of this.ghostStacks) {
      const p = this.cellPos(i);
      if (g.height === 0) {
        const s = 0.18;
        const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p.x - s, 0.08, p.z - s), new THREE.Vector3(p.x + s, 0.08, p.z + s), new THREE.Vector3(p.x - s, 0.08, p.z + s), new THREE.Vector3(p.x + s, 0.08, p.z - s)]);
        this.ghostsGroup.add(new THREE.LineSegments(geo, line));
        continue;
      }
      const h = g.height * terrace3d.block;
      const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.9, h, 0.9)), line);
      box.position.set(p.x, p.y + h / 2, p.z);
      this.ghostsGroup.add(box);
    }
    if (this.markRing) {
      this.d.marks.remove(this.markRing);
      this.markRing = null;
    }
    if (this.hintMark) {
      const p = this.cellPos(this.hintMark.cell);
      this.markRing = this.d.ring(p.x, p.z, 0.55, palette.pearl, 0.08);
      const glow = new THREE.MeshBasicMaterial({ color: col(palette.sage), transparent: true, opacity: 0.14, depthWrite: false });
      const x = this.hintMark.cell % n;
      const y = Math.floor(this.hintMark.cell / n);
      const row = new THREE.Mesh(new THREE.PlaneGeometry(n, 0.9), glow);
      row.rotation.x = -Math.PI / 2;
      row.position.set(-0.6, 0.07, y - (n - 1) / 2 - 0.6);
      const colm = new THREE.Mesh(new THREE.PlaneGeometry(0.9, n), glow);
      colm.rotation.x = -Math.PI / 2;
      colm.position.set(x - (n - 1) / 2 - 0.6, 0.07, -0.6);
      this.ghostsGroup.add(row, colm);
    }
  }

  // The count lantern: a small glass column at a corner, one tick per stone, full when right.
  private drawGauge3d(): void {
    this.d.clearGroup(this.gaugeGroup);
    if (this.level.count === null) return;
    const n = this.level.size;
    const want = this.level.count;
    const placed = stoneCount(this.heights);
    const unit = Math.min(0.12, 1.6 / want);
    const x = n / 2 - 0.6 + 0.9;
    const z = -n / 2 - 0.6 + 0.5;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, unit * want, 16, 1, true), new THREE.MeshBasicMaterial({ color: col(palette.pearl), transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
    glass.position.set(x, 0.06 + (unit * want) / 2, z);
    this.gaugeGroup.add(glass);
    const done = placed === want;
    const fill = new THREE.MeshBasicMaterial({ color: col(done ? palette.pearl : palette.sage), transparent: true, opacity: done ? 0.9 : 0.7 });
    for (let k = 0; k < Math.min(placed, want); k++) {
      const tick = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, unit * 0.82, 14), fill);
      tick.position.set(x, 0.06 + unit * (k + 0.5), z);
      this.gaugeGroup.add(tick);
    }
    // Too many: the extra stones float above the lantern as small bright blocks.
    const spill = new THREE.MeshBasicMaterial({ color: col(palette.pearl), transparent: true, opacity: 0.85 });
    for (let k = 0; k < Math.min(placed - want, want); k++) {
      const extra = new THREE.Mesh(new THREE.BoxGeometry(0.16, unit * 0.8, 0.16), spill);
      extra.position.set(x, 0.06 + unit * want + 0.12 + unit * (k + 0.5) * 1.15, z);
      this.gaugeGroup.add(extra);
    }
  }

  // ----- touch: tap a stack to add, hold to take away, swipe to turn and tilt -----

  private cellUnder(x: number, y: number): number {
    const hit = this.d.pickObjects(x, y, [...this.stacks.children, ...this.tiles]);
    return (hit?.object.userData.cell as number | undefined) ?? -1;
  }

  protected override onDown(e: FederatedPointerEvent): void {
    if (!this.d) return;
    this.stopTutorial();
    this.d.orbit.down(e.global.x, e.global.y);
    if (this.solved) return;
    const i = this.cellUnder(e.global.x, e.global.y);
    this.pressCell = i;
    this.held = false;
    this.holdTimer?.kill();
    if (i < 0) return;
    if (e.button === 2 || e.shiftKey) {
      this.held = true;
      this.change(i, -1);
      return;
    }
    this.holdTimer = gsap.delayedCall(terrace3d.longPress, () => {
      if (this.d.orbit.dragging && !this.d.orbit.moved && this.pressCell === i) {
        this.held = true;
        this.change(i, -1);
      }
    });
  }

  protected override onMove(e: FederatedPointerEvent): void {
    if (!this.d) return;
    this.d.orbit.move(e.global.x, e.global.y);
  }

  protected override onRelease(e: FederatedPointerEvent | null): void {
    if (!this.d) return;
    this.holdTimer?.kill();
    this.holdTimer = null;
    const tap = this.d.orbit.up();
    if (!e || !tap || this.held || this.solved) return;
    const i = this.cellUnder(e.global.x, e.global.y);
    if (i >= 0 && i === this.pressCell) this.change(i, 1);
  }

  // A swipe that moved means the press was a turn: no stone is taken away by holding.
  protected override settleView(): void {}

  protected override turnView(direction: 1 | -1): void {
    this.voice.turn();
    this.d?.orbit.turnBy(direction);
  }

  override layout(width: number, height: number): void {
    super.layout(width, height);
    this.d?.place();
  }

  override update(dt: number): void {
    super.update(dt);
    if (!this.d) return;
    this.d.update(dt);
    if (this.markRing) this.markRing.material.opacity = 0.45 + 0.4 * Math.sin(this.d.clock * 3);
  }

  // The first terrace: a ghost hand taps the first stack to build.
  protected override scheduleTutorial(): void {
    this.stopTutorial();
    this.tutorialTimer = gsap.delayedCall(1.6, () => {
      const i = this.level.solution.findIndex((h, k) => h > 0 && this.level.fixed[k]! < 0);
      if (i < 0 || !this.d) return;
      if (!this.hand) {
        this.hand = new GhostHand();
        this.container.addChild(this.hand);
      }
      const p = this.d.toScreen(this.cellPos(i), this.container);
      this.hand.demoTap(p.x, p.y, false);
    });
  }

  override playCompletion(): Promise<void> {
    this.stopTutorial();
    this.voice.solve();
    const total = scaled(durations.completion);
    // The terrace turns once, slowly, and sparks rise from the tops of the stacks.
    this.d.orbit.turnBy(4);
    const tops = this.heights.map((h, i) => this.cellPos(i).setY(0.06 + h * terrace3d.block)).filter((_, i) => this.heights[i]! > 0);
    this.d.celebrate(tops, palette.sage, total);
    return new Promise((resolve) => gsap.delayedCall(total, resolve));
  }

  override destroy(): void {
    this.holdTimer?.kill();
    super.destroy();
    this.d.dispose();
  }
}

// A flat rectangle with softly rounded corners (w across, l along), lying in its own xy plane.
function roundedPlane(w: number, l: number, r: number): THREE.ShapeGeometry {
  const k = Math.min(r, w / 2, l / 2);
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + k, -l / 2);
  s.lineTo(w / 2 - k, -l / 2);
  s.quadraticCurveTo(w / 2, -l / 2, w / 2, -l / 2 + k);
  s.lineTo(w / 2, l / 2 - k);
  s.quadraticCurveTo(w / 2, l / 2, w / 2 - k, l / 2);
  s.lineTo(-w / 2 + k, l / 2);
  s.quadraticCurveTo(-w / 2, l / 2, -w / 2, l / 2 - k);
  s.lineTo(-w / 2, -l / 2 + k);
  s.quadraticCurveTo(-w / 2, -l / 2, -w / 2 + k, -l / 2);
  return new THREE.ShapeGeometry(s, 6);
}
