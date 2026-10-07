import gsap from 'gsap';
import { Container, FederatedPointerEvent, Graphics } from 'pixi.js';
import type { IntroPage, LevelScene, ShellContext, Tip } from '../types';
import { palette } from '../../design/palette';
import { durations, easings, scaled } from '../../design/motion';
import { isCompact, isTouch, puzzleArea } from '../../design/layout';
import { GhostHand } from '../../ui/ghostHand';
import { glyphStyle, holdAt, liftFinger, makeFinger, miniButton, refuse, tapAt } from '../../ui/introGlyphs';
import { IconButton } from '../../ui/iconButton';
import { layout } from '../../design/layout';
import { events } from '../../core/events';
import {
  type Placement,
  type StoneLevel,
  type Tri,
  fromKey,
  isCover,
  mirrorOrientation,
  placedKeys,
  transform,
  triCorners,
} from './model';
import { type StoneStep, moreSteps, stepClue } from './clues';
import { createStoneVoice, type StoneVoice } from './sound';

const stoneStyle = {
  maxCell: 68,
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
  tapDistance: 14,
  turnSeconds: 0.28,
  settleSeconds: 0.32,
  returnSeconds: 0.4,
  tutorialDelay: 1.6,
  wheelCooldown: 0.18,
  shadowOffset: 5,
  shadowAlpha: 0.5,
  longPressSeconds: 0.7,
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
  protected silhouette = new Graphics();
  protected rake = new Graphics();
  protected piecesLayer = new Container();
  protected hit = new Graphics();
  protected views: PieceView[] = [];
  protected hand: GhostHand | null = null;
  protected handlers: Record<'attempt' | 'solved' | 'move', Handler[]> = { attempt: [], solved: [], move: [] };
  protected accent = palette.peach;
  protected cell = 40;
  protected origin = { x: 0, y: 0 };
  protected trayScale: number = stoneStyle.trayScale;
  protected dragging: PieceView | null = null;
  protected grabOffset = { x: 0, y: 0 };
  protected grabStart = { x: 0, y: 0 };
  protected magnet = new Graphics();
  protected turnButton: IconButton;
  protected flipButton: IconButton | null = null;
  protected controls = new Container();
  protected hovered: PieceView | null = null;
  protected lastTouched: PieceView | null = null;
  protected solved = false;
  protected placedCount = 0;
  protected voice: StoneVoice;
  protected tutorialTimer: gsap.core.Tween | null = null;
  protected unsubscribe: Array<() => void> = [];
  protected wheelClock = 0;
  protected time = 0;
  // Hints never move a stone: a nudge makes the stone to try pulse, then an outline on the
  // board shows where it belongs (later, a few more). Outlines go once a stone is set there.
  protected hintTarget: StoneStep | null = null;
  protected nudge: { piece: number; tween: gsap.core.Tween } | null = null;
  protected ghosts = new Map<number, Placement>();
  protected ghostLayer = new Graphics();
  protected hintCount = 0;
  protected onWheel = (e: WheelEvent) => this.wheel(e);
  // Pixi never hears a cancelled touch (iOS sends one when the system takes the gesture),
  // so the drag would otherwise stay open with the stone floating under nobody's finger.
  protected onCancel = () => this.onUp();
  protected pressTimer: gsap.core.Tween | null = null;
  protected compact = false;

  constructor(
    protected ctx: ShellContext,
    protected level: StoneLevel,
    protected isTutorial: boolean,
  ) {
    this.voice = createStoneVoice(ctx.audio);
    this.silhouette.eventMode = 'none';
    this.rake.eventMode = 'none';
    this.hit.eventMode = 'static';
    this.hit.on('globalpointermove', (e: FederatedPointerEvent) => this.onMove(e));
    this.hit.on('pointerup', () => this.onUp());
    this.hit.on('pointerupoutside', () => this.onUp());
    this.magnet.eventMode = 'none';
    this.ghostLayer.eventMode = 'none';
    this.container.addChild(this.hit, this.rake, this.silhouette, this.ghostLayer, this.magnet, this.piecesLayer, this.controls);
    // On-screen turn and flip buttons act on the stone you touched last.
    this.turnButton = new IconButton('turn', () => this.turn(1, this.lastTouched ?? this.firstMovable()));
    this.controls.addChild(this.turnButton);
    if (level.allowFlip) {
      this.flipButton = new IconButton('flip', () => this.flip(this.lastTouched ?? this.firstMovable()));
      this.controls.addChild(this.flipButton);
    }
    this.buildPieces();
    this.layout(ctx.width, ctx.height);
    this.unsubscribe.push(
      events.on('input:key', (key) => {
        if (key === 'r') this.turn(1);
        if (key === 'f') this.flip();
      }),
    );
    window.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('pointercancel', this.onCancel);
    this.unsubscribe.push(events.on('input:cancel', this.onCancel));
    window.addEventListener('blur', this.onCancel);
  }

  begin(): void {
    if (this.isTutorial) this.scheduleTutorial();
  }

  on(event: 'attempt' | 'solved' | 'move', cb: Handler): void {
    this.handlers[event].push(cb);
  }

  protected emit(event: 'attempt' | 'solved' | 'move'): void {
    this.handlers[event].forEach((h) => h());
  }

  protected buildPieces(): void {
    this.level.pieces.forEach((piece, i) => {
      const root = new Container();
      const shadow = new Graphics();
      const body = new Graphics();
      shadow.position.set(stoneStyle.shadowOffset * 0.6, stoneStyle.shadowOffset);
      root.addChild(shadow, body);
      root.eventMode = piece.fixed ? 'none' : 'static';
      root.cursor = 'grab';
      root.on('pointerdown', (e: FederatedPointerEvent) => this.onDown(i, e));
      // The stone under the finger is the release target, so it must hear the release itself.
      root.on('pointerup', () => this.onUp());
      root.on('pointerupoutside', () => this.onUp());
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
      const placed = piece.fixed ? { ...piece.solution, rot: 0, flip: 0 } : null;
      if (placed) this.placedCount++;
      this.views.push({ root, shadow, body, rot: piece.tray.rot, flip: piece.tray.flip, placed, slot: { x: 0, y: 0 }, animating: false, lastPlacement: null });
    });
  }

  // ----- geometry -----

  protected shapeOf(i: number, rot: number, flip: number): Tri[] {
    return transform(this.level.pieces[i]!.tris, rot, flip);
  }

  protected bbox(tris: Tri[]): { w: number; h: number } {
    let w = 0;
    let h = 0;
    for (const [x, y] of tris) {
      w = Math.max(w, x + 1);
      h = Math.max(h, y + 1);
    }
    return { w, h };
  }

  protected drawShape(g: Graphics, tris: Tri[], color: number, alpha: number, cell: number, seams: boolean): void {
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
  protected strokeOutline(g: Graphics, tris: Tri[], cell: number, ox: number, oy: number, color: number, alpha: number): void {
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

  protected redrawPiece(i: number): void {
    const v = this.views[i]!;
    const tris = this.shapeOf(i, v.rot, v.flip);
    const fixed = this.level.pieces[i]!.fixed === true;
    this.drawShape(v.body, tris, fixed ? palette.dim : this.accent, fixed ? 0.9 : v.placed ? stoneStyle.placedAlpha : stoneStyle.pieceAlpha, this.cell, true);
    if (this.lastTouched === v) {
      const { w, h } = this.bbox(tris);
      this.strokeOutline(v.body, tris, this.cell, (-w / 2) * this.cell, (-h / 2) * this.cell, palette.pearl, 0.7);
    }
    this.drawShape(v.shadow, tris, palette.shadow, stoneStyle.shadowAlpha, this.cell, false);
    // Lifted stones cast a longer shadow.
    const lift = v.placed ? 1 : 1.8;
    v.shadow.position.set(stoneStyle.shadowOffset * 0.6 * lift, stoneStyle.shadowOffset * lift);
  }

  protected boardCenterFor(i: number, placement: Placement): { x: number; y: number } {
    const { w, h } = this.bbox(this.shapeOf(i, placement.rot, placement.flip));
    return { x: this.origin.x + (placement.x + w / 2) * this.cell, y: this.origin.y + (placement.y + h / 2) * this.cell };
  }

  layout(width: number, height: number): void {
    const area = puzzleArea(width, height);
    const boardHeight = height * (isCompact(width) && this.views.length > 5 ? stoneStyle.boardFraction - 0.14 : stoneStyle.boardFraction);
    this.cell = Math.min(stoneStyle.maxCell, area.width / this.level.width, boardHeight / this.level.height);
    this.origin = {
      x: width / 2 - (this.level.width * this.cell) / 2,
      y: height * 0.09 + boardHeight / 2 - (this.level.height * this.cell) / 2,
    };
    this.hit.clear().rect(0, 0, width, height).fill({ color: palette.pearl, alpha: 0.001 });
    const inset = layout.hudInset + layout.hudIconSize / 2;
    this.turnButton.position.set(inset, height - inset);
    this.flipButton?.position.set(inset + layout.hudIconSize + 16, height - inset);
    this.drawSilhouette();
    this.drawGhosts();
    // Tray slots along the bottom; two rows on narrow screens with many stones.
    const movable = this.views.filter((_, i) => !this.level.pieces[i]!.fixed);
    const count = movable.length;
    this.compact = isCompact(width);
    const rows = this.compact && count > 5 ? 2 : 1;
    const perRow = Math.ceil(count / rows);
    const trayY = height - height * stoneStyle.trayFraction * (rows === 2 ? 1.25 : 0.55);
    const rowGap = height * stoneStyle.trayFraction * 0.55;
    const clearOfIcons = rows === 1 ? width - 260 : width;
    const span = Math.min(width * stoneStyle.trayWidthFraction, perRow * this.cell * 3.2, clearOfIcons);
    const left = width / 2 - span / 2;
    // Shrink tray pieces further when the widest one would not fit its slot.
    const widest = Math.max(...movable.map((v) => Math.max(this.bbox(this.shapeOf(this.views.indexOf(v), v.rot, v.flip)).w, 1)));
    this.trayScale = Math.min(stoneStyle.trayScale, (span / perRow) * 0.85 / (widest * this.cell));
    let slot = 0;
    this.views.forEach((v, i) => {
      const k = this.level.pieces[i]!.fixed ? 0 : slot++;
      const row = Math.floor(k / perRow);
      const col = k % perRow;
      v.slot = { x: left + ((col + 0.5) / perRow) * span, y: trayY + row * rowGap };
      this.redrawPiece(i);
      if (v.placed) {
        v.root.position.copyFrom(this.boardCenterFor(i, v.placed));
        v.root.scale.set(1);
      } else if (v !== this.dragging) {
        v.root.position.set(v.slot.x, v.slot.y);
        v.root.scale.set(this.trayScale);
      }
    });
  }

  resize(width: number, height: number): void {
    this.layout(width, height);
  }

  protected drawSilhouette(): void {
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

  protected onDown(i: number, e: FederatedPointerEvent): void {
    if (this.solved) return;
    const v = this.views[i]!;
    if (v.animating) return;
    this.stopTutorial();
    this.setLastTouched(v);
    this.dragging = v;
    const local = this.container.toLocal(e.global);
    this.grabStart = { x: local.x, y: local.y };
    v.lastPlacement = v.placed;
    // Holding a stone still flips it (the touch equivalent of a double-click).
    this.pressTimer?.kill();
    if (this.level.allowFlip) {
      this.pressTimer = gsap.delayedCall(stoneStyle.longPressSeconds, () => {
        if (this.dragging !== v) return;
        const moved = Math.hypot(v.root.x - this.grabOffset.x - this.grabStart.x, v.root.y - this.grabOffset.y - this.grabStart.y);
        if (moved >= stoneStyle.tapDistance) return;
        this.dragging = null;
        this.magnet.clear();
        v.root.cursor = 'grab';
        if (v.lastPlacement) {
          v.placed = v.lastPlacement;
          this.placedCount++;
        }
        this.flip(v);
      });
    }
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

  // The stone the turn/flip buttons act on is drawn with a brighter edge.
  protected firstMovable(): PieceView | null {
    const i = this.level.pieces.findIndex((p) => !p.fixed);
    return i >= 0 ? this.views[i]! : null;
  }

  protected setLastTouched(v: PieceView): void {
    const previous = this.lastTouched;
    this.lastTouched = v;
    if (previous && previous !== v) this.redrawPiece(this.views.indexOf(previous));
    this.redrawPiece(this.views.indexOf(v));
  }

  protected onMove(e: FederatedPointerEvent): void {
    if (!this.dragging) return;
    const v = this.dragging;
    const local = this.container.toLocal(e.global);
    let x = local.x + this.grabOffset.x;
    let y = local.y + this.grabOffset.y;
    // Magnetism: near a spot where the stone fits, it is drawn toward it and the spot is outlined.
    v.root.position.set(x, y);
    const i = this.views.indexOf(v);
    const placement = this.overTray(v) ? null : this.snapPlacement(i, v);
    this.magnet.clear();
    if (placement && this.canPlace(i, placement)) {
      const target = this.boardCenterFor(i, placement);
      const fits = this.fitsOutline(i, placement);
      x += (target.x - x) * (fits ? stoneStyle.magnetPull : stoneStyle.magnetPull * 0.5);
      y += (target.y - y) * (fits ? stoneStyle.magnetPull : stoneStyle.magnetPull * 0.5);
      const tris = this.shapeOf(i, placement.rot, placement.flip);
      this.strokeOutline(this.magnet, tris, this.cell, this.origin.x + placement.x * this.cell, this.origin.y + placement.y * this.cell, fits ? this.accent : palette.pearl, fits ? 0.6 : 0.25);
    }
    v.root.position.set(x, y);
  }

  protected onUp(): void {
    this.pressTimer?.kill();
    this.pressTimer = null;
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
    const placement = this.overTray(v) ? null : this.snapPlacement(i, v);
    if (placement && this.canPlace(i, placement)) {
      this.place(i, placement);
    } else {
      if (placement) {
        // Only a stone dropped on top of another one is refused.
        this.voice.miss();
        this.emit('attempt');
        events.emit('spirit:react', 'attempt');
      }
      this.returnToTray(i);
    }
  }

  protected wheel(e: WheelEvent): void {
    if (this.solved) return;
    if (this.time - this.wheelClock < stoneStyle.wheelCooldown) return;
    const target = this.dragging ?? this.hovered;
    if (!target) return;
    this.wheelClock = this.time;
    this.turn(e.deltaY > 0 ? 1 : -1, target);
  }

  // Nearest whole-cell placement for the dragged piece, if it is over the board.
  protected snapPlacement(i: number, v: PieceView): Placement | null {
    const { w, h } = this.bbox(this.shapeOf(i, v.rot, v.flip));
    const ox = (v.root.x - (w / 2) * this.cell - this.origin.x) / this.cell;
    const oy = (v.root.y - (h / 2) * this.cell - this.origin.y) / this.cell;
    const x = Math.round(ox);
    const y = Math.round(oy);
    if (Math.abs(ox - x) > stoneStyle.snapFraction || Math.abs(oy - y) > stoneStyle.snapFraction) return null;
    return { x, y, rot: v.rot, flip: v.flip };
  }

  // Stones may rest on any cell of the sand, not only inside the outline's box, so the
  // view keys triangles on a padded grid; the model's keys stay for the solve check.
  protected looseKey(x: number, y: number, t: number): number {
    const pad = Math.max(this.level.width, this.level.height) * 2 + 4;
    return ((y + pad) * (this.level.width + pad * 2) + (x + pad)) * 4 + t;
  }

  protected looseKeys(i: number, placement: Placement): number[] {
    return transform(this.level.pieces[i]!.tris, placement.rot, placement.flip).map(([x, y, t]) => this.looseKey(x + placement.x, y + placement.y, t));
  }

  protected occupied(): Set<number> {
    const set = new Set<number>();
    this.views.forEach((v, i) => {
      if (!v.placed) return;
      for (const k of this.looseKeys(i, v.placed)) set.add(k);
    });
    return set;
  }

  // A stone may rest anywhere on the sand as long as it does not overlap another stone.
  protected canPlace(i: number, placement: Placement): boolean {
    const taken = this.occupied();
    return this.looseKeys(i, placement).every((k) => !taken.has(k));
  }

  // Dropped back among the tray slots: the stone goes home instead of resting there.
  protected overTray(v: PieceView): boolean {
    const trayTop = Math.min(...this.views.map((o) => o.slot.y)) - this.cell * 0.9;
    return v.root.y > trayTop;
  }

  // Whether every triangle of the stone lies inside the outline (used for the magnet preview).
  protected fitsOutline(i: number, placement: Placement): boolean {
    const keys = placedKeys(this.level, this.level.pieces[i]!, placement);
    if (!keys) return false;
    const target = new Set(this.level.silhouette);
    return keys.every((k) => target.has(k));
  }

  protected place(i: number, placement: Placement, silent = false): void {
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
    if (!silent) {
      this.voice.settle(this.placedCount);
      this.emit('move');
    }
    this.settleHints();
    this.checkSolved();
  }

  protected unplace(i: number): void {
    const v = this.views[i]!;
    v.placed = null;
    this.placedCount--;
    this.redrawPiece(i);
    this.emit('move');
    this.settleHints();
  }

  protected returnToTray(i: number): void {
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

  protected turn(direction: 1 | -1, target: PieceView | null = this.dragging ?? this.hovered ?? this.lastTouched): void {
    if (this.solved || !target || target.animating || this.level.pieces[this.views.indexOf(target)]!.fixed) return;
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

  protected flip(target: PieceView | null = this.dragging ?? this.hovered ?? this.lastTouched): void {
    if (this.solved || !this.level.allowFlip || !target || target.animating || this.level.pieces[this.views.indexOf(target)]!.fixed) return;
    const i = this.views.indexOf(target);
    const wasAt = target.placed;
    if (target.placed) this.unplace(i);
    // Mirror the stone as it looks now. A shape is stored as "mirror, then turn", so a
    // turned stone that flips must also turn the other way to stay where it was.
    const mirrored = mirrorOrientation(target.rot, target.flip);
    target.rot = mirrored.rot;
    target.flip = mirrored.flip;
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
        if (this.dragging === target || target.placed) return;
        const again = wasAt ? { ...wasAt, rot: target.rot, flip: target.flip } : null;
        if (again && this.canPlace(i, again)) this.place(i, again, true);
        else this.returnToTray(i);
      },
    });
  }

  protected checkSolved(): void {
    if (this.solved || this.placedCount !== this.views.length) return;
    const placements = new Map<number, Placement>();
    this.views.forEach((v, i) => v.placed && placements.set(i, v.placed));
    if (!isCover(this.level, placements)) return;
    this.solved = true;
    this.emit('solved');
  }

  // ----- clues -----

  protected currentPlacements(): Map<number, Placement> {
    const placed = new Map<number, Placement>();
    this.views.forEach((v, i) => v.placed && placed.set(i, v.placed));
    return placed;
  }

  hint(): string {
    if (this.solved) return '';
    this.hintCount++;
    const placed = this.currentPlacements();
    if (this.hintTarget && this.stepDone(this.hintTarget)) this.hintTarget = null;
    // First: which stone to try (or which one is in the way), and why.
    if (!this.hintTarget) {
      const step = stepClue(this.level, placed);
      if (!step) return 'One stone left: turn it, or flip it, until it fits the last gap.';
      this.hintTarget = step;
      this.showNudge(step.piece);
      if (step.kind === 'lift') return 'The pulsing stone cannot stay where it is: no finished garden has it there. Take it back out.';
      return step.biggest
        ? 'Try the pulsing stone next. Big stones have the fewest places to go, so set them first.'
        : 'Try the pulsing stone next: it is the biggest one still waiting.';
    }
    if (this.hintTarget.kind === 'lift') return 'Take the pulsing stone out of the shape first: drag it back to the tray.';
    // Then: exactly where it belongs.
    if (!this.ghosts.has(this.hintTarget.piece)) {
      this.ghosts.set(this.hintTarget.piece, this.hintTarget.placement);
      this.drawGhosts();
      return 'The outline shows where the pulsing stone belongs, turned and flipped as it should be. Set it there.';
    }
    // After that: a few more at a time, never more than half of the stones still waiting.
    const more = moreSteps(this.level, placed, new Set(this.ghosts.keys()), 2);
    if (more.length === 0) return 'That is all I can show. The rest is yours.';
    more.forEach((m) => this.ghosts.set(m.piece, m.placement));
    this.drawGhosts();
    return more.length === 1 ? 'One more outline shows where a stone belongs.' : 'Two more outlines show where stones belong.';
  }

  protected stepDone(step: StoneStep): boolean {
    const v = this.views[step.piece]!;
    if (step.kind === 'lift') return !v.placed;
    return !!v.placed && samePlacement(v.placed, step.placement);
  }

  protected showNudge(piece: number): void {
    this.clearNudge();
    const body = this.views[piece]!.body;
    const tween = gsap.fromTo(body, { alpha: 0.45 }, { alpha: 1, duration: 0.7, yoyo: true, repeat: -1, ease: easings.ambient });
    this.nudge = { piece, tween };
  }

  protected clearNudge(): void {
    if (!this.nudge) return;
    this.nudge.tween.kill();
    this.views[this.nudge.piece]!.body.alpha = 1;
    this.nudge = null;
  }

  protected drawGhosts(): void {
    const g = this.ghostLayer;
    g.clear();
    for (const [piece, at] of this.ghosts) {
      const tris = this.shapeOf(piece, at.rot, at.flip);
      this.strokeOutline(g, tris, this.cell, this.origin.x + at.x * this.cell, this.origin.y + at.y * this.cell, palette.pearl, 0.6);
    }
  }

  // After each change: outlines whose stone is now set there go, and so does a nudge whose
  // stone has done what it asked.
  protected settleHints(): void {
    let changed = false;
    for (const [piece, at] of this.ghosts) {
      const v = this.views[piece]!;
      if (v.placed && samePlacement(v.placed, at)) {
        this.ghosts.delete(piece);
        changed = true;
      }
    }
    if (changed) this.drawGhosts();
    if (this.hintTarget && this.stepDone(this.hintTarget)) {
      this.clearNudge();
      this.hintTarget = null;
    }
  }

  protected clearHints(): void {
    this.clearNudge();
    this.ghosts.clear();
    this.drawGhosts();
    this.hintTarget = null;
  }

  tips(): Tip[] {
    const tips: Tip[] = [
      { id: 'stone:big', text: 'Tip: place the biggest stones first. They fit in the fewest places.', after: 1 },
      { id: 'stone:corners', text: 'Tip: look at narrow tips and corners of the shape. Only a few stones can fill them.', after: 3 },
      { id: 'stone:turn', text: isTouch() ? 'Tip: tap a stone to turn it. It need not be in the shape to turn.' : 'Tip: click a stone, scroll or press R to turn it.', after: 2 },
    ];
    if (this.level.allowFlip) tips.push({ id: 'stone:flip', text: isTouch() ? 'Tip: some stones only fit as their mirror image. Hold a stone, or use the flip button, to flip it.' : 'Tip: some stones only fit as their mirror image. Double-click or press F to flip one.', after: 2 });
    return tips;
  }

  update(dt: number): void {
    this.time += dt;
  }

  restart(): void {
    if (this.solved) return;
    this.stopTutorial();
    this.dragging = null;
    this.clearHints();
    this.views.forEach((v, i) => {
      if (this.level.pieces[i]!.fixed) return;
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
    this.placedCount = this.level.pieces.filter((p) => p.fixed).length;
    if (this.isTutorial) this.scheduleTutorial();
  }

  // ----- tutorial, completion, intro -----

  protected scheduleTutorial(): void {
    this.stopTutorial();
    this.tutorialTimer = gsap.delayedCall(stoneStyle.tutorialDelay, () => {
      const i = this.views.findIndex((v, k) => !v.placed && !this.level.pieces[k]!.fixed);
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

  protected stopTutorial(): void {
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

  // Whether the silhouette encloses an empty cell (a gap that must stay empty).
  protected hasHole(): boolean {
    const set = new Set(this.level.silhouette);
    for (let y = 1; y < this.level.height - 1; y++) {
      for (let x = 1; x < this.level.width - 1; x++) {
        const key = (dx: number, dy: number, t: number) => ((y + dy) * this.level.width + (x + dx)) * 4 + t;
        const empty = [0, 1, 2, 3].every((t) => !set.has(key(0, 0, t)));
        const ringed = set.has(key(0, -1, 2)) && set.has(key(0, 1, 0)) && set.has(key(-1, 0, 1)) && set.has(key(1, 0, 3));
        if (empty && ringed) return true;
      }
    }
    return false;
  }

  // ----- instruction pages -----

  protected cellTris(cells: Array<[number, number]>, skip: Array<[number, number, number]> = []): Tri[] {
    const out: Tri[] = [];
    for (const [x, y] of cells) for (let t = 0; t < 4; t++) if (!skip.some(([sx, sy, st]) => sx === x && sy === y && st === t)) out.push([x, y, t]);
    return out;
  }

  // An outline of `cells` (minus any gap), drawn at the card's centre, plus its top-left in card space.
  protected miniOutline(cell: number, cells: Array<[number, number]>, gap: Array<[number, number]> = []): { root: Graphics; ox: number; oy: number } {
    const tris = this.cellTris(cells.filter(([x, y]) => !gap.some(([gx, gy]) => gx === x && gy === y)));
    const maxX = Math.max(...cells.map(([x]) => x)) + 1;
    const maxY = Math.max(...cells.map(([, y]) => y)) + 1;
    const ox = (-maxX / 2) * cell;
    const oy = (-maxY / 2) * cell;
    const g = new Graphics();
    for (const tri of tris) {
      const c = triCorners(tri);
      g.moveTo(ox + c[0]![0] * cell, oy + c[0]![1] * cell);
      for (const [px, py] of c.slice(1)) g.lineTo(ox + px * cell, oy + py * cell);
      g.closePath();
    }
    g.fill({ color: palette.ink, alpha: stoneStyle.silhouetteAlpha });
    this.strokeOutline(g, tris, cell, ox, oy, palette.dim, 0.9);
    return { root: g, ox, oy };
  }

  protected miniStone(cell: number, tris: Tri[], color: number = this.accent, alpha: number = stoneStyle.pieceAlpha): Graphics {
    const g = new Graphics();
    this.drawShape(g, tris, color, alpha, cell, true);
    return g;
  }

  introPages(): IntroPage[] {
    const cell = 24;
    const pages: IntroPage[] = [];
    // 1. Drag a stone into the outline.
    pages.push({
      caption: 'Drag the stones from below into the outline until it is filled exactly. A stone settles wherever you drop it, as long as it is not on top of another stone.',
      glyph: () => {
        const root = new Container();
        const outline = this.miniOutline(cell, [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]]);
        outline.root.y = -14;
        const stone = this.miniStone(cell, this.cellTris([[0, 0], [1, 0]]));
        const home = { x: 0, y: 40 };
        stone.position.set(home.x, home.y);
        stone.scale.set(stoneStyle.trayScale);
        const finger = makeFinger();
        root.addChild(outline.root, stone, finger);
        const target = { x: outline.ox + cell, y: -14 + outline.oy + cell / 2 };
        const tl = gsap.timeline({ repeat: -1, repeatDelay: 1 });
        tapAt(tl, finger, home.x, home.y, 0.5)
          .to(stone.scale, { x: 1, y: 1, duration: 0.25 }, '<')
          .to([stone, finger], { x: target.x, y: target.y, duration: 0.9, ease: easings.ambient })
          .to(finger, { alpha: 0, duration: 0.2 })
          .to(stone, { alpha: stoneStyle.placedAlpha, duration: 0.3 })
          .to(stone, { alpha: 0, duration: 0.4, delay: 1 })
          .set(stone, { x: home.x, y: home.y, alpha: 1 })
          .set(stone.scale, { x: stoneStyle.trayScale, y: stoneStyle.trayScale });
        root.on('destroyed', () => tl.kill());
        return root;
      },
    });
    // 2. Turning.
    pages.push({
      caption: isTouch()
        ? 'Tap a stone to turn it. The turn button at the bottom left turns the stone you touched last.'
        : 'Click a stone to turn it (or scroll over it, or press R). The turn button at the bottom left turns the stone you touched last.',
      glyph: () => {
        const root = new Container();
        const stone = this.miniStone(cell, this.cellTris([[0, 0], [1, 0], [1, 1]]));
        const button = miniButton('turn', this.accent);
        button.position.set(cell * 2.6, cell * 0.8);
        const finger = makeFinger();
        root.addChild(stone, button, finger);
        const tl = gsap.timeline({ repeat: -1, repeatDelay: 1 });
        tapAt(tl, finger, 0, 0, 0.5).to(stone, { rotation: `+=${Math.PI / 2}`, duration: stoneStyle.turnSeconds, ease: easings.tileSnap }, '<');
        liftFinger(tl, finger);
        tapAt(tl, finger, button.x, button.y, 0.4).to(stone, { rotation: `+=${Math.PI / 2}`, duration: stoneStyle.turnSeconds, ease: easings.tileSnap }, '<');
        liftFinger(tl, finger);
        root.on('destroyed', () => tl.kill());
        return root;
      },
    });
    // 3. Flipping.
    if (this.level.allowFlip) {
      pages.push({
        caption: isTouch()
          ? 'Hold a stone still to flip it over, or use the flip button. Some stones only fit flipped.'
          : 'Double-click a stone (or press F) to flip it over, or use the flip button. Some stones only fit flipped.',
        glyph: () => {
          const root = new Container();
          const stone = this.miniStone(cell, this.cellTris([[0, 0], [1, 0], [1, 1]]));
          const button = miniButton('flip', this.accent);
          button.position.set(cell * 2.6, cell * 0.8);
          const finger = makeFinger();
          const ring = new Graphics();
          root.addChild(stone, button, ring, finger);
          const tl = gsap.timeline({ repeat: -1, repeatDelay: 1 });
          if (isTouch()) holdAt(tl, finger, ring, 0, 0, 0.7, 0.5);
          else tapAt(tl, finger, 0, 0, 0.5).to(finger.scale, { x: glyphStyle.tapScale, y: glyphStyle.tapScale, duration: 0.12, yoyo: true, repeat: 1 });
          tl.to(stone.scale, { x: -1, duration: stoneStyle.turnSeconds, ease: easings.tileSnap });
          liftFinger(tl, finger);
          tapAt(tl, finger, button.x, button.y, 0.4).to(stone.scale, { x: 1, duration: stoneStyle.turnSeconds, ease: easings.tileSnap }, '<');
          liftFinger(tl, finger);
          root.on('destroyed', () => tl.kill());
          return root;
        },
      });
    }
    // 4. Look-alikes.
    if (this.level.chapter >= 3) {
      pages.push({
        caption: 'Some stones look alike but differ by a single corner. Look closely before you place them.',
        glyph: () => {
          const root = new Container();
          const a = this.miniStone(cell, this.cellTris([[0, 0], [1, 0]]));
          const b = this.miniStone(cell, this.cellTris([[0, 0], [1, 0]], [[1, 0, 0]]));
          a.x = -cell * 1.5;
          b.x = cell * 1.5;
          const mark = new Graphics();
          mark.position.set(cell * 1.5 + cell * 0.5, -cell * 0.3);
          root.addChild(a, b, mark);
          const state = { p: 0 };
          const tw = gsap.to(state, { p: 1, duration: 1.4, yoyo: true, repeat: -1, ease: easings.ambient, onUpdate: () => mark.clear().circle(0, 0, 5 + state.p * 4).stroke({ color: palette.pearl, width: 1, alpha: 0.7 - state.p * 0.5 }) });
          root.on('destroyed', () => tw.kill());
          return root;
        },
      });
    }
    // 5. A fixed stone.
    if (this.level.pieces.some((p) => p.fixed)) {
      pages.push({
        caption: 'A grey stone is already set in place and cannot move. Build around it.',
        glyph: () => {
          const root = new Container();
          const outline = this.miniOutline(cell, [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]]);
          const fixed = this.miniStone(cell, this.cellTris([[0, 0]]), palette.dim, 0.9);
          fixed.position.set(outline.ox + cell / 2, outline.oy + cell / 2);
          const finger = makeFinger();
          root.addChild(outline.root, fixed, finger);
          const tl = gsap.timeline({ repeat: -1, repeatDelay: 1 });
          tapAt(tl, finger, fixed.x, fixed.y, 0.6);
          refuse(tl, fixed);
          liftFinger(tl, finger);
          root.on('destroyed', () => tl.kill());
          return root;
        },
      });
    }
    // 6. A gap in the outline.
    if (this.hasHole()) {
      pages.push({
        caption: 'This outline has a gap in it. The gap must stay empty: no stone may cover it.',
        glyph: () => {
          const root = new Container();
          const cells: Array<[number, number]> = [];
          for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) cells.push([x, y]);
          const outline = this.miniOutline(cell, cells, [[1, 1]]);
          const mark = new Graphics();
          root.addChild(outline.root, mark);
          const state = { p: 0 };
          const cx = outline.ox + 1.5 * cell;
          const cy = outline.oy + 1.5 * cell;
          const tw = gsap.to(state, { p: 1, duration: 1.2, yoyo: true, repeat: -1, ease: easings.ambient, onUpdate: () => mark.clear().rect(cx - cell / 2 + 3, cy - cell / 2 + 3, cell - 6, cell - 6).stroke({ color: palette.pearl, width: 1, alpha: 0.2 + state.p * 0.5 }) });
          root.on('destroyed', () => tw.kill());
          return root;
        },
      });
    }
    return pages;
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
    this.pressTimer?.kill();
    this.unsubscribe.forEach((u) => u());
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('pointercancel', this.onCancel);
    window.removeEventListener('blur', this.onCancel);
    this.voice.dispose();
    this.views.forEach((v) => gsap.killTweensOf([v.root, v.root.scale]));
    this.container.destroy({ children: true });
  }
}

function samePlacement(a: Placement, b: Placement): boolean {
  return a.x === b.x && a.y === b.y && a.rot === b.rot && a.flip === b.flip;
}
