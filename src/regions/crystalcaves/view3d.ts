import gsap from 'gsap';
import * as THREE from 'three';
import { Container, type FederatedPointerEvent, Graphics } from 'pixi.js';
import type { ShellContext } from '../types';
import { mixColor, palette } from '../../design/palette';
import { durations, easings, scaled } from '../../design/motion';
import { GhostHand } from '../../ui/ghostHand';
import { col, glowSprite } from '../../three/kit';
import { Diorama } from '../../three/diorama';
import { DIR_DELTA, LEMON, ORIENTATIONS, type PieceKind, type PrismLevel, ROSE, SKY } from './model';
import { PrismLevelScene, colorOf } from './view';

// Crystal Caves in 3D: the cave floor is a diorama; lights are glowing orbs with a nozzle
// that shows their way; mirrors stand as reflective panes, splitters and colour mirrors as
// tinted glass; filters are coloured glass blocks, blockers dark stones; target crystals are
// real crystals that fill with the colour they receive, small beads at their base showing
// the colours they need. Beams are glowing rays across the floor. Swipe to turn and tilt;
// tap a ringed piece to turn it (or a light to switch it off and on). Rules and hints are
// the 2D cave's.

const cave3d = {
  beamY: 0.3,
  beamRadius: 0.035,
  turnSeconds: 0.3,
} as const;

interface Piece3D {
  root: THREE.Group; // stays put
  spin: THREE.Group; // turns with the piece's orientation
  crystal?: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshStandardMaterial>;
  core?: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
}

// The angle (about the vertical) a piece faces for an orientation.
function yawFor(kind: PieceKind, orient: number): number {
  if (kind === 'emitter') return [Math.PI / 2, 0, -Math.PI / 2, Math.PI][orient] ?? 0;
  if (kind === 'mirror' || kind === 'splitter' || kind === 'dichroic') return orient === 0 ? Math.PI / 4 : -Math.PI / 4;
  return 0;
}

export class Prism3DScene extends PrismLevelScene {
  readonly ownsBackdrop = true;
  private d!: Diorama;
  private hit = new Graphics();
  private pieces3d: Piece3D[] = [];
  private beams3d = new THREE.Group();
  private beamMats: THREE.MeshBasicMaterial[] = [];
  private ghosts3d = new Map<number, THREE.Object3D>();
  private nudge3d: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial> | null = null;

  constructor(ctx: ShellContext, level: PrismLevel, isTutorial: boolean, levelIndex: number, levelName: string) {
    super(ctx, level, isTutorial);
    for (const c of [this.grid, this.beams, this.piecesLayer, this.hintLayer]) c.visible = false;
    this.d = new Diorama({ region: 'crystalcaves', levelIndex, levelName, width: level.width, depth: level.height, slab: { color: mixColor(palette.dim, palette.sky, 0.2), top: mixColor(palette.dim, palette.sky, 0.12) } });
    // The cave floor: one soft tile per cell.
    const tile = new THREE.MeshLambertMaterial({ color: col(mixColor(palette.ink, palette.sky, 0.12)) });
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.04, 0.92), tile);
        t.position.copy(this.cellPos(x, y)).setY(0.02);
        this.d.board.add(t);
      }
    }
    level.pieces.forEach((p, i) => this.pieces3d.push(this.makePiece(i, p.kind, p.color, this.orients[i]!, false)));
    this.d.board.add(this.beams3d);
    // Touch: swipe to turn the cave, tap a piece.
    this.hit.eventMode = 'static';
    this.hit.on('pointerdown', (e: FederatedPointerEvent) => this.d.orbit.down(e.global.x, e.global.y));
    this.hit.on('globalpointermove', (e: FederatedPointerEvent) => this.d.orbit.move(e.global.x, e.global.y));
    this.hit.on('pointerup', (e: FederatedPointerEvent) => this.onTap(e));
    this.hit.on('pointerupoutside', () => this.d.orbit.up());
    this.container.addChildAt(this.hit, 0);
    this.layout(ctx.width, ctx.height);
    this.retrace(true);
  }

  private cellPos(x: number, y: number): THREE.Vector3 {
    return new THREE.Vector3(x - (this.level.width - 1) / 2, 0.04, y - (this.level.height - 1) / 2);
  }

  // ----- the pieces -----

  private makePiece(i: number, kind: PieceKind, color: number, orient: number, ghost: boolean): Piece3D {
    const p = this.level.pieces[i]!;
    const root = new THREE.Group();
    const spin = new THREE.Group();
    root.position.copy(this.cellPos(p.x, p.y));
    root.add(spin);
    const fade = ghost ? { transparent: true, opacity: 0.3, depthWrite: false } : {};
    const tint = colorOf(color);
    const out: Piece3D = { root, spin };
    switch (kind) {
      case 'emitter': {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.18, 20), new THREE.MeshLambertMaterial({ color: col(mixColor(palette.dim, palette.pearl, 0.25)), ...fade }));
        base.position.y = 0.09;
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), new THREE.MeshBasicMaterial({ color: col(tint), ...fade }));
        core.position.y = cave3d.beamY;
        const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 14), new THREE.MeshBasicMaterial({ color: col(tint), ...fade }));
        nozzle.rotation.z = -Math.PI / 2;
        nozzle.position.set(0.22, cave3d.beamY, 0);
        spin.add(nozzle);
        root.add(base, core);
        if (!ghost) {
          const halo = glowSprite(tint, 1.1, 0.45);
          halo.position.set(0, cave3d.beamY, 0);
          root.add(halo);
        }
        out.core = core;
        break;
      }
      case 'mirror':
      case 'splitter':
      case 'dichroic': {
        const glassy = kind !== 'mirror';
        const paneColor = kind === 'dichroic' ? tint : glassy ? palette.sky : palette.pearl;
        const pane = new THREE.Mesh(
          new THREE.BoxGeometry(0.86, 0.5, 0.05),
          new THREE.MeshStandardMaterial({ color: col(paneColor), metalness: glassy ? 0.1 : 0.85, roughness: glassy ? 0.2 : 0.15, transparent: glassy || ghost, opacity: ghost ? 0.3 : glassy ? 0.5 : 1, emissive: col(paneColor), emissiveIntensity: 0.15, depthWrite: !ghost }),
        );
        pane.position.y = cave3d.beamY;
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.12), new THREE.MeshLambertMaterial({ color: col(palette.dim), ...fade }));
        foot.position.y = 0.06;
        spin.add(pane, foot);
        break;
      }
      case 'filter': {
        const block = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.55), new THREE.MeshStandardMaterial({ color: col(tint), transparent: true, opacity: ghost ? 0.25 : 0.55, roughness: 0.2, emissive: col(tint), emissiveIntensity: 0.2 }));
        block.position.y = 0.27;
        root.add(block);
        break;
      }
      case 'blocker': {
        const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34, 0), new THREE.MeshLambertMaterial({ color: col(mixColor(palette.dim, palette.ink, 0.4)), flatShading: true, ...fade }));
        stone.scale.set(1, 0.9, 1);
        stone.position.y = 0.3;
        root.add(stone);
        break;
      }
      case 'target': {
        const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), new THREE.MeshStandardMaterial({ color: col(palette.pearl), transparent: true, opacity: 0.4, roughness: 0.15, metalness: 0.1, emissive: col(palette.pearl), emissiveIntensity: 0.05, flatShading: true }));
        crystal.scale.set(0.8, 1.35, 0.8);
        crystal.position.y = 0.42;
        root.add(crystal);
        // The colours it needs, as small beads around its base (for colour-blind players too).
        const needs = [ROSE, SKY, LEMON].filter((c) => color & c);
        needs.forEach((c, k) => {
          const a = (k / needs.length) * Math.PI * 2 + Math.PI / 4;
          const bead = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), new THREE.MeshBasicMaterial({ color: col(colorOf(c)) }));
          bead.position.set(Math.cos(a) * 0.3, 0.08, Math.sin(a) * 0.3);
          root.add(bead);
        });
        out.crystal = crystal;
        break;
      }
    }
    // A soft ring on the floor marks a piece that turns.
    if (p.rotatable && !ghost) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.015, 6, 40), new THREE.MeshBasicMaterial({ color: col(palette.pearl), transparent: true, opacity: 0.3 }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      root.add(ring);
    }
    spin.rotation.y = yawFor(kind, orient);
    (ghost ? this.d.marks : this.d.board).add(root);
    return out;
  }

  // ----- the 2D drawing becomes a 3D refresh -----

  protected override drawPiece(i: number): void {
    const v = this.views[i];
    const p3 = this.pieces3d?.[i];
    if (!p3 || !v || v.animating) return;
    const p = this.level.pieces[i]!;
    gsap.killTweensOf(p3.spin.rotation);
    p3.spin.rotation.y = yawFor(p.kind, this.orients[i]!);
    if (p3.core) p3.core.material.opacity = this.off.has(i) ? 0.25 : 1;
    if (p3.core) p3.core.material.transparent = true;
    this.drawTargetFill(i);
  }

  protected override drawTargetFill(i: number): void {
    const crystal = this.pieces3d?.[i]?.crystal;
    if (!crystal) return;
    const p = this.level.pieces[i]!;
    const got = this.received.get(i) ?? 0;
    const exact = got === p.color;
    const m = crystal.material;
    m.color.set(got ? colorOf(got) : palette.pearl);
    m.emissive.set(got ? colorOf(got) : palette.pearl);
    m.emissiveIntensity = exact ? 0.9 : got ? 0.25 : 0.05;
    m.opacity = exact ? 0.95 : got ? 0.6 : 0.4;
  }

  // Beams: glowing rods from where light enters a cell to where it leaves (or stops at a piece).
  protected override drawBeams(): void {
    if (!this.d) return;
    this.d.clearGroup(this.beams3d);
    this.beamMats = [];
    const mats = new Map<number, THREE.MeshBasicMaterial>();
    const occupied = new Set(this.level.pieces.map((p) => p.y * this.level.width + p.x));
    for (const seg of this.segments) {
      const [dx, dy] = DIR_DELTA[seg.dir]!;
      const c = this.cellPos(seg.x, seg.y).setY(cave3d.beamY);
      const exit = occupied.has(seg.y * this.level.width + seg.x) ? 0 : 0.5;
      const a = c.clone().add(new THREE.Vector3(-dx * 0.5, 0, -dy * 0.5));
      const b = c.clone().add(new THREE.Vector3(dx * exit, 0, dy * exit));
      let mat = mats.get(seg.color);
      if (!mat) {
        mat = new THREE.MeshBasicMaterial({ color: col(colorOf(seg.color)), transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
        mats.set(seg.color, mat);
        this.beamMats.push(mat);
      }
      const len = a.distanceTo(b);
      if (len < 0.01) continue;
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(cave3d.beamRadius, cave3d.beamRadius, len, 8, 1, true), mat);
      rod.position.copy(a).add(b).multiplyScalar(0.5);
      rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      this.beams3d.add(rod);
    }
  }

  // Turning a piece: the 3D piece swings to its new angle, then the light is traced again.
  protected override turn(i: number, forced: number | null = null): void {
    if (this.solved || !this.d) return;
    const v = this.views[i]!;
    if (v.animating) return;
    this.stopTutorial();
    const p = this.level.pieces[i]!;
    const count = ORIENTATIONS[p.kind];
    const next = forced ?? (this.orients[i]! + 1) % count;
    if (next === this.orients[i]) return;
    this.orients[i] = next;
    if (forced === null) {
      this.emit('move');
      this.voice.turn(i);
    }
    v.animating = true;
    const spin = this.pieces3d[i]!.spin;
    // Always swing forward a quarter turn, so the motion reads as "it turned".
    gsap.to(spin.rotation, {
      y: spin.rotation.y - Math.PI / 2,
      duration: scaled(cave3d.turnSeconds),
      ease: easings.tileSnap,
      onComplete: () => {
        v.animating = false;
        this.drawPiece(i);
        this.retrace(forced !== null && this.solved);
        this.settleHints();
      },
    });
  }

  private onTap(e: FederatedPointerEvent): void {
    if (!this.d.orbit.up() || this.solved) return;
    const hit = this.d.pick(e.global.x, e.global.y, 0.04);
    if (!hit) return;
    const x = Math.round(hit.x + (this.level.width - 1) / 2);
    const y = Math.round(hit.z + (this.level.height - 1) / 2);
    const i = this.level.pieces.findIndex((p) => p.x === x && p.y === y);
    if (i < 0) return;
    const p = this.level.pieces[i]!;
    if (p.rotatable) this.turn(i);
    else if (p.kind === 'emitter' && this.level.pieces.filter((q) => q.kind === 'emitter').length > 1) this.toggleLight(i);
  }

  // ----- hints: a ring on the floor, then a faint piece at the right angle -----

  protected override showNudge(piece: number): void {
    this.clearNudge();
    if (!this.d) return;
    const p = this.level.pieces[piece]!;
    const c = this.cellPos(p.x, p.y);
    this.nudge3d = this.d.ring(c.x, c.z, 0.5, palette.pearl, 0.06);
    this.nudge = { piece, g: new Graphics(), tween: gsap.to({}, { duration: 0 }) };
  }

  protected override clearNudge(): void {
    if (this.nudge3d) this.d?.marks.remove(this.nudge3d);
    this.nudge3d = null;
    this.nudge = null;
  }

  protected override addGhost(piece: number, orient: number): void {
    if (this.ghosts.has(piece) || this.orients[piece] === orient || !this.d) return;
    const p = this.level.pieces[piece]!;
    const ghost = this.makePiece(piece, p.kind, p.color, orient, true);
    ghost.root.position.y += 0.02;
    this.ghosts3d.set(piece, ghost.root);
    this.ghosts.set(piece, { orient, root: new Container() });
  }

  protected override settleHints(): void {
    for (const [piece, ghost] of this.ghosts) {
      if (this.orients[piece] !== ghost.orient) continue;
      const g3 = this.ghosts3d.get(piece);
      if (g3) this.d.marks.remove(g3);
      this.ghosts3d.delete(piece);
      this.ghosts.delete(piece);
    }
    if (this.hintTarget && this.orients[this.hintTarget.piece] === this.hintTarget.orient) {
      this.clearNudge();
      this.hintTarget = null;
    }
  }

  protected override clearHints(): void {
    this.clearNudge();
    this.ghosts3d.forEach((g) => this.d?.marks.remove(g));
    this.ghosts3d.clear();
    this.ghosts.clear();
    this.hintTarget = null;
  }

  // ----- frame, layout, tutorial, solve -----

  override layout(width: number, height: number): void {
    super.layout(width, height);
    this.hit?.clear().rect(0, -height, width, height * 3).fill({ color: palette.pearl, alpha: 0.001 });
    this.d?.place();
  }

  override update(dt: number): void {
    this.time += dt;
    if (!this.d) return;
    this.d.update(dt);
    const shimmer = 0.75 + 0.2 * Math.sin(this.time * 3);
    this.beamMats.forEach((m) => (m.opacity = 0.85 * shimmer));
    if (this.nudge3d) this.nudge3d.material.opacity = 0.45 + 0.4 * Math.sin(this.time * 3);
    for (const p of this.pieces3d) if (p.crystal) p.crystal.rotation.y += dt * 0.4;
  }

  protected override scheduleTutorial(): void {
    this.stopTutorial();
    this.tutorialTimer = gsap.delayedCall(1.6, () => {
      const i = this.level.pieces.findIndex((p, k) => p.rotatable && this.orients[k] !== this.level.solution[k]);
      if (i < 0 || !this.d) return;
      if (!this.hand) {
        this.hand = new GhostHand();
        this.container.addChild(this.hand);
      }
      const p = this.level.pieces[i]!;
      const at = this.d.toScreen(this.cellPos(p.x, p.y).setY(0.3), this.container);
      this.hand.demoTap(at.x, at.y);
    });
  }

  override playCompletion(): Promise<void> {
    this.stopTutorial();
    this.voice.solve();
    const total = scaled(durations.completion);
    const targets = this.level.pieces.map((p, i) => ({ p, i })).filter(({ p }) => p.kind === 'target');
    for (const { i } of targets) {
      const c = this.pieces3d[i]!.crystal;
      if (c) gsap.to(c.scale, { x: 1.2, y: 1.9, z: 1.2, duration: total * 0.4, ease: easings.response, yoyo: true, repeat: 1 });
    }
    this.d.celebrate(targets.map(({ p }) => this.cellPos(p.x, p.y).setY(0.6)), palette.pearl, total);
    return new Promise((resolve) => gsap.delayedCall(total, resolve));
  }

  override showSolutionOverlay(): void {
    this.level.pieces.forEach((p, i) => {
      if (p.rotatable && this.orients[i] !== this.level.solution[i]) this.addGhost(i, this.level.solution[i]!);
    });
  }

  override destroy(): void {
    this.pieces3d.forEach((p) => gsap.killTweensOf(p.spin.rotation));
    super.destroy();
    this.d.dispose();
  }
}

