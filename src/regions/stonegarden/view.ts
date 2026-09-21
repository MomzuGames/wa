import gsap from 'gsap';
import { Container, FederatedPointerEvent, Graphics } from 'pixi.js';
import type { ClueTier, LevelScene, ShellContext } from '../types';
import { alphas, palette } from '../../design/palette';
import { durations, easings, scaled } from '../../design/motion';
import { puzzleArea } from '../../design/layout';
import { GhostHand } from '../../ui/ghostHand';
import { events } from '../../core/events';
import {
  type Placement,
  type StoneLevel,
  type Tri,
  fromKey,
  isCover,
  placedKeys,
  transform,
  triCorners,
} from './model';
import { halfClue, pieceClue, solutionFor } from './clues';
import { createStoneVoice, type StoneVoice } from './sound';

const stoneStyle = {
  maxCell: 68,
  minCell: 30,
  boardFraction: 0.62,
  trayFraction: 0.2,
  trayScale: 0.62,
  trayWidthFraction: 0.72,
  pieceAlpha: 0.6,
  placedAlpha: 0.78,
  seamAlpha: 0.55,
  silhouetteAlpha: 0.9,
  snapFraction: 0.5,
  magnetPull: 0.35,
  tapDistance: 6,
  turnSeconds: 0.28,
  settleSeconds: 0.32,
  returnSeconds: 0.4,
  clueGhostSeconds: 3,
  tutorialDelay: 1.6,
  wheelCooldown: 0.18,
  shadowOffset: 5,
  shadowAlpha: 0.5,
} as const;

type Handler = () => void;

interface PieceView {
  root: Container;
  shadow: Graphics;
  body: Graphics;
  rot: number;
  flip: number;
  placed: Placement | null;
  slot: { x: number; y: number };
  animating: boolean;
  lastPlacement: Placement | null;
}

export class StoneLevelScene implements LevelScene {
  readonly container = new Container();
  readonly usesRotateKey = true;
  private silhouette = new Graphics();
  private clueLayer = new Graphics();
  private rake = new Graphics();
  private piecesLayer = new Container();
  private hit = new Graphics();
  private views: PieceView[] = [];
  private hand: GhostHand | null = null;
  private handlers: Record<'attempt' | 'solved' | 'move', Handler[]> = { attempt: [], solved: [], move: [] };
  private accent = palette.peach;
  private cell = 40;
  private origin = { x: 0, y: 0 };
  private trayScale: number = stoneStyle.trayScale;
  private dragging: PieceView | null = null;
  private grabOffset = { x: 0, y: 0 };
  private grabStart = { x: 0, y: 0 };
  private magnet = new Graphics();
  private hovered: PieceView | null = null;
  private lastTouched: PieceView | null = null;
  private solved = false;
  private placedCount = 0;
  private voice: StoneVoice;
  private tutorialTimer: gsap.core.Tween | null = null;
  private unsubscribe: Array<() => void> = [];
  private wheelClock = 0;
  private time = 0;
  private ghosts: Array<{ piece: number; placement: Placement; until: number | null }> = [];
  private seamsUntil: number | null = null;
  private seamSolution: Map<number, Placement> | null = null;
  private onWheel = (e: WheelEvent) => this.wheel(e);

  constructor(
    private ctx: ShellContext,
    private level: StoneLevel,
    private isTutorial: boolean,
  ) {
    this.voice = createStoneVoice(ctx.audio);
    this.silhouette.eventMode = 'none';
    this.clueLayer.eventMode = 'none';
    this.rake.eventMode = 'none';
    this.hit.eventMode = 'static';
    this.hit.on('globalpointermove', (e: FederatedPointerEvent) => this.onMove(e));
    this.hit.on('pointerup', () => this.onUp());
    this.hit.on('pointerupoutside', () => this.onUp());
    this.magnet.eventMode = 'none';
    this.container.addChild(this.hit, this.rake, this.silhouette, this.clueLayer, this.magnet, this.piecesLayer);
    this.buildPieces();
    this.layout(ctx.width, ctx.height);
    this.unsubscribe.push(
      events.on('input:key', (key) => {
        if (key === 'r') this.turn(1);
        if (key === 'f') this.flip();
      }),
    );
    window.addEventListener('wheel', this.onWheel, { passive: true });
  }

  begin(): void {
    if (this.isTutorial) this.scheduleTutorial();
  }

  on(event: 'attempt' | 'solved' | 'move', cb: Handler): void {
    this.handlers[event].push(cb);
  }

  private emit(event: 'attempt' | 'solved' | 'move'): void {
    this.handlers[event].forEach((h) => h());
  }

  private buildPieces(): void {
    this.level.pieces.forEach((piece, i) => {
      const root = new Container();
      const shadow = new Graphics();
      const body = new Graphics();
      shadow.position.set(stoneStyle.shadowOffset * 0.6, stoneStyle.shadowOffset);
      root.addChild(shadow, body);
      root.eventMode = 'static';
      root.cursor = 'grab';
      root.on('pointerdown', (e: FederatedPointerEvent) => this.onDown(i, e));
      root.on('pointerover', () => {
        this.hovered = this.views[i]!;
      });
      root.on('pointerout', () => {
        if (this.hovered === this.views[i]) this.hovered = null;
      });
      root.on('pointertap', (e: FederatedPointerEvent) => {
        if (e.detail === 2) this.flip(this.views[i]!);
      });
      this.piecesLayer.addChild(root);
      this.views.push({ root, shadow, body, rot: piece.tray.rot, flip: piece.tray.flip, placed: null, slot: { x: 0, y: 0 }, animating: false, lastPlacement: null });
    });
  }

  // ----- geometry -----

  private shapeOf(i: number, rot: number, flip: number): Tri[] {
    return transform(this.level.pieces[i]!.tris, rot, flip);
  }

  private bbox(tris: Tri[]): { w: number; h: number } {
    let w = 0;
    let h = 0;
    for (const [x, y] of tris) {
      w = Math.max(w, x + 1);
      h = Math.max(h, y + 1);
    }
    return { w, h };
  }

  private drawShape(g: Graphics, tris: Tri[], color: number, alpha: number, cell: number, seams: boolean): void {
    const { w, h } = this.bbox(tris);
    const ox = (-w / 2) * cell;
    const oy = (-h / 2) * cell;
    g.clear();
    for (const tri of tris) {
      const c = triCorners(tri);
      g.moveTo(ox + c[0]![0] * cell, oy + c[0]![1] * cell);
      g.lineTo(ox + c[1]![0] * cell, oy + c[1]![1] * cell);
      g.lineTo(ox + c[2]![0] * cell, oy + c[2]![1] * cell);
      g.closePath();
    }
    g.fill({ color, alpha });
    if (seams) this.strokeOutline(g, tris, cell, ox, oy, color, stoneStyle.seamAlpha);
  }

  // Strokes only the outer boundary of a triangle set.
  private strokeOutline(g: Graphics, tris: Tri[], cell: number, ox: number, oy: number, color: number, alpha: number): void {
    const set = new Set(tris.map((t) => t.join(',')));
    const has = (x: number, y: number, t: number) => set.has(`${x},${y},${t}`);
    for (const [x, y, t] of tris) {
      const c = triCorners([x, y, t]);
      // Outer edge (the cell side) is shared with the neighbouring cell's opposite triangle.
      const across: Tri = t === 0 ? [x, y - 1, 2] : t === 1 ? [x + 1, y, 3] : t === 2 ? [x, y + 1, 0] : [x - 1, y, 1];
      if (!has(...across)) {
        g.moveTo(ox + c[0]![0] * cell, oy + c[0]![1] * cell).lineTo(ox + c[1]![0] * cell, oy + c[1]![1] * cell);
      }
      // Diagonal edges are shared with the next triangle in the same cell.
      if (!has(x, y, (t + 1) % 4)) g.moveTo(ox + c[1]![0] * cell, oy + c[1]![1] * cell).lineTo(ox + c[2]![0] * cell, oy + c[2]![1] * cell);
      if (!has(x, y, (t + 3) % 4)) g.moveTo(ox + c[2]![0] * cell, oy + c[2]![1] * cell).lineTo(ox + c[0]![0] * cell, oy + c[0]![1] * cell);
    }
    g.stroke({ color, width: 1.5, alpha, cap: 'round', join: 'round' });
  }

  private redrawPiece(i: number): void {
    const v = this.views[i]!;
    const tris = this.shapeOf(i, v.rot, v.flip);
    this.drawShape(v.body, tris, this.accent, v.placed ? stoneStyle.placedAlpha : stoneStyle.pieceAlpha, this.cell, true);
    this.drawShape(v.shadow, tris, palette.shadow, stoneStyle.shadowAlpha, this.cell, false);
    // Lifted stones cast a longer shadow.
    const lift = v.placed ? 1 : 1.8;
    v.shadow.position.set(stoneStyle.shadowOffset * 0.6 * lift, stoneStyle.shadowOffset * lift);
  }

  private boardCenterFor(i: number, placement: Placement): { x: number; y: number } {
    const { w, h } = this.bbox(this.shapeOf(i, placement.rot, placement.flip));
    return { x: this.origin.x + (placement.x + w / 2) * this.cell, y: this.origin.y + (placement.y + h / 2) * this.cell };
  }

  layout(width: number, height: number): void {
    const area = puzzleArea(width, height);
    const boardHeight = height * stoneStyle.boardFraction;
    this.cell = Math.max(stoneStyle.minCell, Math.min(stoneStyle.maxCell, area.width / this.level.width, boardHeight / this.level.height));
    this.origin = {
      x: width / 2 - (this.level.width * this.cell) / 2,
      y: height * 0.09 + boardHeight / 2 - (this.level.height * this.cell) / 2,
    };
    this.hit.clear().rect(0, 0, width, height).fill({ color: palette.pearl, alpha: 0.001 });
    this.drawSilhouette();
    // Tray slots along the bottom.
    const count = this.views.length;
    const trayY = height - height * stoneStyle.trayFraction * 0.55;
    const span = Math.min(width * stoneStyle.trayWidthFraction, count * this.cell * 3.2);
    const left = width / 2 - span / 2;
    // Shrink tray pieces further when the widest one would not fit its slot.
    const widest = Math.max(...this.views.map((_, i) => Math.max(this.bbox(this.shapeOf(i, this.views[i]!.rot, this.views[i]!.flip)).w, 1)));
    this.trayScale = Math.min(stoneStyle.trayScale, (span / count) * 0.85 / (widest * this.cell));
    this.views.forEach((v, i) => {
      v.slot = { x: left + ((i + 0.5) / count) * span, y: trayY };
      this.redrawPiece(i);
      if (v.placed) {
        v.root.position.copyFrom(this.boardCenterFor(i, v.placed));
        v.root.scale.set(1);
      } else if (v !== this.dragging) {
        v.root.position.set(v.slot.x, v.slot.y);
        v.root.scale.set(this.trayScale);
      }
    });
    this.drawClues();
  }

  resize(width: number, height: number): void {
    this.layout(width, height);
  }

  private drawSilhouette(): void {
    const g = this.silhouette;
    g.clear();
    const tris = this.level.silhouette.map((k) => fromKey(this.level.width, k));
    for (const tri of tris) {
      const c = triCorners(tri);
      g.moveTo(this.origin.x + c[0]![0] * this.cell, this.origin.y + c[0]![1] * this.cell);
      g.lineTo(this.origin.x + c[1]![0] * this.cell, this.origin.y + c[1]![1] * this.cell);
      g.lineTo(this.origin.x + c[2]![0] * this.cell, this.origin.y + c[2]![1] * this.cell);
      g.closePath();
    }
    g.fill({ color: palette.ink, alpha: stoneStyle.silhouetteAlpha });
    this.strokeOutline(g, tris, this.cell, this.origin.x, this.origin.y, palette.dim, 0.9);
  }

  // ----- input -----

  private onDown(i: number, e: FederatedPointerEvent): void {
    if (this.solved) return;
    const v = this.views[i]!;
    if (v.animating) return;
    this.stopTutorial();
    this.lastTouched = v;
    this.dragging = v;
    const local = this.container.toLocal(e.global);
    this.grabStart = { x: local.x, y: local.y };
    v.lastPlacement = v.placed;
    if (v.placed) {
      this.unplace(i);
    }
    this.grabOffset = { x: v.root.x - local.x, y: v.root.y - local.y };
    // Lift: bring to front at full size.
    this.piecesLayer.addChild(v.root);
    v.root.cursor = 'grabbing';
    gsap.to(v.root.scale, { x: 1, y: 1, duration: scaled(durations.microFeedback), ease: easings.response, overwrite: true });
    // The grab offset was measured at tray scale; shrink it so the piece stays under the pointer.
    if (v.root.scale.x < 1) {
      this.grabOffset = { x: this.grabOffset.x / this.trayScale, y: this.grabOffset.y / this.trayScale };
    }
    this.voice.lift();
  }

  private onMove(e: FederatedPointerEvent): void {
    if (!this.dragging) return;
    const v = this.dragging;
    const local = this.container.toLocal(e.global);
    let x = local.x + this.grabOffset.x;
    let y = local.y + this.grabOffset.y;
    // Magnetism: near a spot where the stone fits, it is drawn toward it and the spot is outlined.
    v.root.position.set(x, y);
    const i = this.views.indexOf(v);
    const placement = this.snapPlacement(i, v);
    this.magnet.clear();
    if (placement && this.canPlace(i, placement)) {
      const target = this.boardCenterFor(i, placement);
      x += (target.x - x) * stoneStyle.magnetPull;
      y += (target.y - y) * stoneStyle.magnetPull;
      const tris = this.shapeOf(i, placement.rot, placement.flip);
      this.strokeOutline(this.magnet, tris, this.cell, this.origin.x + placement.x * this.cell, this.origin.y + placement.y * this.cell, this.accent, 0.5);
    }
    v.root.position.set(x, y);
  }

  private onUp(): void {
    const v = this.dragging;
    if (!v) return;
    this.dragging = null;
    this.magnet.clear();
    v.root.cursor = 'grab';
    const i = this.views.indexOf(v);
    const moved = Math.hypot(v.root.x - this.grabOffset.x - this.grabStart.x, v.root.y - this.grabOffset.y - this.grabStart.y);
    if (moved < stoneStyle.tapDistance) {
      // A plain click turns the stone where it is.
      if (v.lastPlacement) {
        v.placed = v.lastPlacement;
        this.placedCount++;
      }
      this.turn(1, v);
      return;
    }
    const placement = this.snapPlacement(i, v);
    if (placement && this.canPlace(i, placement)) {
      this.place(i, placement);
    } else {
      if (placement) {
        this.voice.miss();
        this.emit('attempt');
        events.emit('spirit:react', 'attempt');
      }
      this.returnToTray(i);
    }
  }

  private wheel(e: WheelEvent): void {
    if (this.solved) return;
    if (this.time - this.wheelClock < stoneStyle.wheelCooldown) return;
    const target = this.dragging ?? this.hovered;
    if (!target) return;
    this.wheelClock = this.time;
    this.turn(e.deltaY > 0 ? 1 : -1, target);
  }

  // Nearest whole-cell placement for the dragged piece, if it is over the board.
  private snapPlacement(i: number, v: PieceView): Placement | null {
    const { w, h } = this.bbox(this.shapeOf(i, v.rot, v.flip));
    const ox = (v.root.x - (w / 2) * this.cell - this.origin.x) / this.cell;
    const oy = (v.root.y - (h / 2) * this.cell - this.origin.y) / this.cell;
    const x = Math.round(ox);
    const y = Math.round(oy);
    if (Math.abs(ox - x) > stoneStyle.snapFraction || Math.abs(oy - y) > stoneStyle.snapFraction) return null;
    if (x < -1 || y < -1 || x > this.level.width || y > this.level.height) return null;
    return { x, y, rot: v.rot, flip: v.flip };
  }

  private occupied(): Set<number> {
    const set = new Set<number>();
    this.views.forEach((v, i) => {
      if (!v.placed) return;
      for (const k of placedKeys(this.level, this.level.pieces[i]!, v.placed) ?? []) set.add(k);
    });
    return set;
  }

  private canPlace(i: number, placement: Placement): boolean {
    const keys = placedKeys(this.level, this.level.pieces[i]!, placement);
    if (!keys) return false;
    const target = new Set(this.level.silhouette);
    const taken = this.occupied();
    return keys.every((k) => target.has(k) && !taken.has(k));
  }

  private place(i: number, placement: Placement, silent = false): void {
    const v = this.views[i]!;
    v.placed = placement;
    v.rot = placement.rot;
    v.flip = placement.flip;
    this.placedCount++;
    this.redrawPiece(i);
    const center = this.boardCenterFor(i, placement);
    v.animating = true;
    gsap.to(v.root, {
      x: center.x,
      y: center.y,
      duration: scaled(stoneStyle.settleSeconds),
      ease: easings.tileSnap,
      overwrite: true,
      onComplete: () => {
        v.animating = false;
      },
    });
    gsap.to(v.root.scale, { x: 1, y: 1, duration: scaled(stoneStyle.settleSeconds), overwrite: true });
    this.ghosts = this.ghosts.filter((g) => g.piece !== i);
    this.drawClues();
    if (!silent) {
      this.voice.settle(this.placedCount);
      this.emit('move');
    }
    this.checkSolved();
  }

  private unplace(i: number): void {
    const v = this.views[i]!;
    v.placed = null;
    this.placedCount--;
    this.redrawPiece(i);
    this.emit('move');
  }

  private returnToTray(i: number): void {
    const v = this.views[i]!;
    v.animating = true;
    gsap.to(v.root, {
      x: v.slot.x,
      y: v.slot.y,
      duration: scaled(stoneStyle.returnSeconds),
      ease: easings.response,
      overwrite: true,
      onComplete: () => {
        v.animating = false;
      },
    });
    gsap.to(v.root.scale, { x: this.trayScale, y: this.trayScale, duration: scaled(stoneStyle.returnSeconds), overwrite: true });
  }

  private turn(direction: 1 | -1, target: PieceView | null = this.dragging ?? this.hovered ?? this.lastTouched): void {
    if (this.solved || !target || target.animating) return;
    const i = this.views.indexOf(target);
    const wasAt = target.placed;
    if (target.placed) this.unplace(i);
    target.rot = (target.rot + direction + 4) % 4;
    this.voice.turn();
    this.emit('move');
    target.animating = true;
    gsap.to(target.root, {
      rotation: (direction * Math.PI) / 2,
      duration: scaled(stoneStyle.turnSeconds),
      ease: easings.tileSnap,
      overwrite: true,
      onComplete: () => {
        target.root.rotation = 0;
        target.animating = false;
        this.redrawPiece(i);
        if (this.dragging === target || target.placed) return;
        const again = wasAt ? { ...wasAt, rot: target.rot } : null;
        if (again && this.canPlace(i, again)) this.place(i, again, true);
        else this.returnToTray(i);
      },
    });
  }

  private flip(target: PieceView | null = this.dragging ?? this.hovered ?? this.lastTouched): void {
    if (this.solved || !this.level.allowFlip || !target || target.animating) return;
    const i = this.views.indexOf(target);
    if (target.placed) this.unplace(i);
    target.flip = target.flip ? 0 : 1;
    this.voice.turn();
    this.emit('move');
    target.animating = true;
    const s = target.root.scale.x;
    gsap.to(target.root.scale, {
      x: -s,
      duration: scaled(stoneStyle.turnSeconds),
      ease: easings.ambient,
      overwrite: true,
      onComplete: () => {
        target.root.scale.x = s;
        target.animating = false;
        this.redrawPiece(i);
        if (!this.dragging && !target.placed) this.returnToTray(i);
      },
    });
  }

  private checkSolved(): void {
    if (this.solved || this.placedCount !== this.views.length) return;
    const placements = new Map<number, Placement>();
    this.views.forEach((v, i) => v.placed && placements.set(i, v.placed));
    if (!isCover(this.level, placements)) return;
    this.solved = true;
    this.emit('solved');
  }

  // ----- clues -----

  private currentPlacements(): Map<number, Placement> {
    const placed = new Map<number, Placement>();
    this.views.forEach((v, i) => v.placed && placed.set(i, v.placed));
    return placed;
  }

  showClue(tier: ClueTier): string | void {
    if (this.solved) return;
    const placed = this.currentPlacements();
    let caption: string | undefined;
    switch (tier) {
      case 1: {
        const clue = pieceClue(this.level, placed, `${this.level.seed}:clue1`);
        if (!clue) return 'Every stone is already on the board.';
        this.ghosts = this.ghosts.filter((g) => g.until !== null);
        this.ghosts.push({ ...clue, until: null });
        caption = 'The outline shows where one of your stones belongs. Match its shape exactly.';
        break;
      }
      case 2: {
        const clue = pieceClue(this.level, placed, `${this.level.seed}:clue2:${this.placedCount}`);
        if (!clue) return 'Every stone is already on the board.';
        const v = this.views[clue.piece]!;
        if (this.dragging === v) this.dragging = null;
        this.place(clue.piece, clue.placement, true);
        this.voice.settle(this.placedCount);
        caption = 'One stone has settled into its place by itself.';
        break;
      }
      case 3:
        this.seamSolution = solutionFor(this.level, placed);
        this.seamsUntil = this.time + stoneStyle.clueGhostSeconds;
        caption = 'For a moment, the seams show how the shape divides into stones.';
        break;
      case 4:
        for (const g of halfClue(this.level, placed, `${this.level.seed}:clue4`)) {
          this.ghosts.push({ ...g, until: this.time + stoneStyle.clueGhostSeconds });
        }
        caption = 'For a moment, outlines show where half of the stones belong.';
        break;
    }
    this.drawClues();
    return caption;
  }

  private drawClues(): void {
    const g = this.clueLayer;
    g.clear();
    for (const ghost of this.ghosts) {
      const tris = this.shapeOf(ghost.piece, ghost.placement.rot, ghost.placement.flip);
      const ox = this.origin.x + ghost.placement.x * this.cell;
      const oy = this.origin.y + ghost.placement.y * this.cell;
      this.strokeOutline(g, tris, this.cell, ox, oy, this.accent, alphas.hudIdle);
    }
    if (this.seamSolution && this.seamsUntil !== null) {
      for (const [i, placement] of this.seamSolution) {
        const tris = this.shapeOf(i, placement.rot, placement.flip);
        this.strokeOutline(g, tris, this.cell, this.origin.x + placement.x * this.cell, this.origin.y + placement.y * this.cell, this.accent, 0.22);
      }
    }
  }

  update(dt: number): void {
    this.time += dt;
    let changed = false;
    const before = this.ghosts.length;
    this.ghosts = this.ghosts.filter((g) => g.until === null || g.until > this.time);
    if (this.ghosts.length !== before) changed = true;
    if (this.seamsUntil !== null && this.time > this.seamsUntil) {
      this.seamsUntil = null;
      this.seamSolution = null;
      changed = true;
    }
    if (changed) this.drawClues();
  }

  restart(): void {
    if (this.solved) return;
    this.stopTutorial();
    this.dragging = null;
    this.ghosts = [];
    this.seamsUntil = null;
    this.seamSolution = null;
    this.views.forEach((v, i) => {
      gsap.killTweensOf([v.root, v.root.scale]);
      v.root.rotation = 0;
      v.placed = null;
      v.rot = this.level.pieces[i]!.tray.rot;
      v.flip = this.level.pieces[i]!.tray.flip;
      v.animating = false;
      this.redrawPiece(i);
      v.root.position.set(v.slot.x, v.slot.y);
      v.root.scale.set(this.trayScale);
    });
    this.placedCount = 0;
    this.drawClues();
    if (this.isTutorial) this.scheduleTutorial();
  }

  // ----- tutorial, completion, intro -----

  private scheduleTutorial(): void {
    this.stopTutorial();
    this.tutorialTimer = gsap.delayedCall(stoneStyle.tutorialDelay, () => {
      const i = this.views.findIndex((v) => !v.placed);
      if (i < 0) return;
      if (!this.hand) {
        this.hand = new GhostHand();
        this.container.addChild(this.hand);
      }
      const piece = this.level.pieces[i]!;
      const target = this.boardCenterFor(i, { ...piece.solution, rot: 0, flip: 0 });
      this.hand.demoPath([this.views[i]!.slot, target]);
    });
  }

  private stopTutorial(): void {
    this.tutorialTimer?.kill();
    this.tutorialTimer = null;
    this.hand?.stop();
  }

  playCompletion(): Promise<void> {
    this.stopTutorial();
    this.voice.solve();
    const total = scaled(durations.completion);
    // Seams dissolve into one stone.
    this.views.forEach((v, i) => {
      const tris = this.shapeOf(i, v.rot, v.flip);
      const fresh = new Graphics();
      this.drawShape(fresh, tris, this.accent, stoneStyle.placedAlpha, this.cell, false);
      fresh.alpha = 0;
      v.root.addChild(fresh);
      gsap.to(fresh, { alpha: 1, duration: total * 0.4, ease: easings.ambient });
      gsap.to(v.body, { alpha: 0, duration: total * 0.4, ease: easings.ambient });
    });
    // Sand-rake lines ripple outward around the silhouette.
    const cx = this.origin.x + (this.level.width * this.cell) / 2;
    const cy = this.origin.y + (this.level.height * this.cell) / 2;
    const baseW = this.level.width * this.cell;
    const baseH = this.level.height * this.cell;
    const state = { t: 0 };
    gsap.to(state, {
      t: 1,
      duration: total,
      ease: easings.ambient,
      onUpdate: () => {
        this.rake.clear();
        for (let k = 0; k < 6; k++) {
          const p = state.t - k * 0.1;
          if (p <= 0) continue;
          const grow = p * this.cell * 5;
          this.rake
            .roundRect(cx - baseW / 2 - grow, cy - baseH / 2 - grow, baseW + grow * 2, baseH + grow * 2, this.cell + grow)
            .stroke({ color: this.accent, width: 1, alpha: 0.35 * (1 - p) });
        }
      },
    });
    for (let i = 0; i < 20; i++) {
      this.ctx.particles.emit({
        x: cx + (this.ctx.rng.next() - 0.5) * baseW,
        y: cy + (this.ctx.rng.next() - 0.5) * baseH,
        color: this.accent,
        vx: 0,
        vy: -8 - this.ctx.rng.next() * 14,
        life: 1.6 + this.ctx.rng.next(),
        alphaFrom: 0.4,
        scaleFrom: 0.25,
        scaleTo: 0.05,
      });
    }
    return new Promise((resolve) => gsap.delayedCall(total, resolve));
  }

  introLines(): string[] {
    const lines = [
      'Drag the stones from below into the outline until it is filled exactly.',
      'A stone only settles when all of it fits inside the outline on empty ground.',
      'If it does not fit, it slides back down. Feel for the pull when it is close.',
      'Click a stone to turn it. Scroll over it or press R to turn it too.',
    ];
    if (this.level.allowFlip) lines.push('Double-click a stone, or press F, to flip it over. Some stones only fit flipped.');
    if (this.level.chapter >= 3) lines.push('Some stones look alike but differ by one corner. Look closely.');
    return lines;
  }

  introGlyph(): Container {
    const root = new Container();
    const cell = 22;
    const outline = new Graphics();
    const target: Tri[] = [];
    for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) for (let t = 0; t < 4; t++) target.push([x, y, t]);
    this.drawShape(outline, target, palette.ink, 0.9, cell, false);
    this.strokeOutline(outline, target, cell, -1.5 * cell, -cell, palette.dim, 0.9);
    outline.y = -12;
    const pieceTris: Tri[] = [];
    for (let t = 0; t < 4; t++) pieceTris.push([0, 0, t], [1, 0, t]);
    const piece = new Graphics();
    this.drawShape(piece, pieceTris, this.accent, stoneStyle.pieceAlpha, cell, true);
    piece.position.set(-1.5 * cell + cell, 44);
    piece.scale.set(stoneStyle.trayScale);
    root.addChild(outline, piece);
    const tl = gsap
      .timeline({ repeat: -1, repeatDelay: 0.8 })
      .to(piece.scale, { x: 1, y: 1, duration: 0.3 })
      .to(piece, { rotation: Math.PI / 2, duration: stoneStyle.turnSeconds, ease: easings.tileSnap })
      .to(piece, { x: -1.5 * cell + cell / 2, y: -12, duration: 0.9, ease: easings.ambient })
      .to(piece, { alpha: 0, duration: 0.4, delay: 0.5 })
      .set(piece, { x: -1.5 * cell + cell, y: 44, rotation: 0, alpha: 1 })
      .set(piece.scale, { x: stoneStyle.trayScale, y: stoneStyle.trayScale });
    root.on('destroyed', () => tl.kill());
    return root;
  }

  // Dev only: faint outlines of every piece in its solved place.
  showSolutionOverlay(): void {
    const g = new Graphics();
    g.eventMode = 'none';
    this.level.pieces.forEach((p, i) => {
      const tris = this.shapeOf(i, 0, 0);
      this.strokeOutline(g, tris, this.cell, this.origin.x + p.solution.x * this.cell, this.origin.y + p.solution.y * this.cell, palette.pearl, 0.15);
    });
    this.container.addChild(g);
  }

  destroy(): void {
    this.stopTutorial();
    this.unsubscribe.forEach((u) => u());
    window.removeEventListener('wheel', this.onWheel);
    this.voice.dispose();
    this.views.forEach((v) => gsap.killTweensOf([v.root, v.root.scale]));
    this.container.destroy({ children: true });
  }
}
