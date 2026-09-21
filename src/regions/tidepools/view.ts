import gsap from 'gsap';
import { Container, FederatedPointerEvent, Graphics } from 'pixi.js';
import type { ClueTier, LevelScene, ShellContext } from '../types';
import { palette } from '../../design/palette';
import { durations, easings, scaled } from '../../design/motion';
import { puzzleArea } from '../../design/layout';
import { createGlow } from '../../fx/glow';
import { GhostHand } from '../../ui/ghostHand';
import {
  DELTA,
  DIRS,
  type Board,
  type LoopLevel,
  boardFromLevel,
  components,
  connectorMatched,
  currentMask,
  index,
  isSolved,
  rotateMask,
  tileKind,
} from './model';
import { forcedClue, ghostClue, lockClue } from './clues';
import { createTidepoolsVoice, type TidepoolsVoice } from './sound';

const loopStyle = {
  maxCell: 92,
  minCell: 40,
  gapFraction: 0.07,
  cornerFraction: 0.22,
  pipeFraction: 0.16,
  hubFraction: 0.11,
  endFraction: 0.17,
  rotateSeconds: 0.34,
  flowSpeed: 2.6,
  flowSpacing: 0.9,
  clueGhostSeconds: 3,
  tutorialDelay: 1.6,
} as const;

type Handler = () => void;

interface TileView {
  root: Container;
  base: Graphics;
  pipes: Graphics;
  lit: Graphics;
  mark: Graphics;
  ghost: Graphics;
  lockDot: Graphics;
  flowPhase: number;
  animating: boolean;
  spin: number;
}

export class LoopLevelScene implements LevelScene {
  readonly container = new Container();
  private board: Board;
  private views: (TileView | null)[] = [];
  private boardLayer = new Container();
  private litLayer = new Container();
  private ghostLayer = new Container();
  private ripple = new Graphics();
  private hand: GhostHand | null = null;
  private handlers: Record<'attempt' | 'solved' | 'move', Handler[]> = { attempt: [], solved: [], move: [] };
  private accent: number;
  private cell = 60;
  private origin = { x: 0, y: 0 };
  private time = 0;
  private solved = false;
  private matchedCount = 0;
  private completeCount = 0;
  private clueLocked = new Set<number>();
  private voice: TidepoolsVoice;
  private tutorialTimer: gsap.core.Tween | null = null;

  constructor(
    private ctx: ShellContext,
    private level: LoopLevel,
    private isTutorial: boolean,
  ) {
    this.accent = palette.mint;
    this.board = boardFromLevel(level);
    this.voice = createTidepoolsVoice(ctx.audio);
    this.litLayer.filters = [createGlow(this.accent, { distance: 18, strength: 1.3, quality: 0.3 })];
    // Overlays must never intercept pointer input meant for the tiles.
    this.litLayer.eventMode = 'none';
    this.ghostLayer.eventMode = 'none';
    this.ripple.eventMode = 'none';
    this.container.addChild(this.ripple, this.boardLayer, this.litLayer, this.ghostLayer);
    this.buildTiles();
    this.layout(ctx.width, ctx.height);
    this.matchedCount = this.countMatched();
    this.completeCount = components(this.board).filter((c) => c.complete).length;
    this.refreshLit();
    if (isTutorial) this.scheduleTutorial();
  }

  on(event: 'attempt' | 'solved' | 'move', cb: Handler): void {
    this.handlers[event].push(cb);
  }

  private emit(event: 'attempt' | 'solved' | 'move'): void {
    this.handlers[event].forEach((h) => h());
  }

  private buildTiles(): void {
    this.board.cells.forEach((tile, i) => {
      if (!tile) {
        this.views.push(null);
        return;
      }
      const root = new Container();
      const base = new Graphics();
      const pipes = new Graphics();
      const mark = new Graphics();
      const lockDot = new Graphics();
      const lit = new Graphics();
      const ghost = new Graphics();
      mark.visible = false;
      ghost.visible = false;
      lit.visible = false;
      root.addChild(base, mark, pipes, lockDot);
      this.boardLayer.addChild(root);
      this.litLayer.addChild(lit);
      this.ghostLayer.addChild(ghost);
      root.eventMode = 'static';
      root.cursor = tile.locked ? 'default' : 'pointer';
      root.on('pointerdown', (e: FederatedPointerEvent) => this.onPress(i, e));
      this.views.push({ root, base, pipes, lit, mark, ghost, lockDot, flowPhase: 0, animating: false, spin: 0 });
    });
  }

  layout(width: number, height: number): void {
    const area = puzzleArea(width, height);
    const cell = Math.max(
      loopStyle.minCell,
      Math.min(loopStyle.maxCell, Math.min(area.width / this.board.width, area.height / this.board.height)),
    );
    this.cell = cell;
    this.origin = {
      x: width / 2 - (this.board.width * cell) / 2 + cell / 2,
      y: height / 2 - (this.board.height * cell) / 2 + cell / 2,
    };
    this.views.forEach((v, i) => {
      if (!v) return;
      const x = this.origin.x + (i % this.board.width) * cell;
      const y = this.origin.y + Math.floor(i / this.board.width) * cell;
      v.root.position.set(x, y);
      v.lit.position.set(x, y);
      v.ghost.position.set(x, y);
      this.drawTile(i);
    });
  }

  resize(width: number, height: number): void {
    this.layout(width, height);
  }

  private drawPipes(g: Graphics, mask: number, color: number, alpha: number): void {
    const half = this.cell / 2;
    const w = this.cell * loopStyle.pipeFraction;
    g.clear();
    if (mask === 0) return;
    for (const d of DIRS) {
      if (!(mask & d)) continue;
      const { dx, dy } = DELTA[d];
      g.moveTo(0, 0).lineTo(dx * half, dy * half).stroke({ color, width: w, cap: 'round', alpha });
    }
    const kind = tileKind(mask);
    const hub = kind === 'end' ? loopStyle.endFraction : loopStyle.hubFraction;
    g.circle(0, 0, this.cell * hub).fill({ color, alpha });
  }

  private drawTile(i: number): void {
    const v = this.views[i]!;
    const tile = this.board.cells[i]!;
    const half = this.cell / 2;
    const gap = this.cell * loopStyle.gapFraction;
    const size = this.cell - gap * 2;
    v.base
      .clear()
      .roundRect(-half + gap, -half + gap, size, size, this.cell * loopStyle.cornerFraction)
      .fill({ color: palette.ink });
    this.drawPipes(v.pipes, tile.mask, palette.dim, 1);
    v.spin = (tile.rotation * Math.PI) / 2;
    v.pipes.rotation = v.spin;
    this.drawPipes(v.lit, tile.mask, this.accent, 1);
    v.lit.rotation = v.spin;
    v.lockDot.clear();
    if (tile.locked) {
      v.lockDot.circle(half - gap * 2.2, -half + gap * 2.2, this.cell * 0.035).fill({ color: this.accent, alpha: 0.6 });
    }
    v.mark.clear().roundRect(-half + gap * 1.6, -half + gap * 1.6, size - gap * 1.2, size - gap * 1.2, this.cell * loopStyle.cornerFraction * 0.8);
    v.mark.stroke({ color: this.accent, width: 1, alpha: 0.35 });
  }

  private onPress(i: number, e: FederatedPointerEvent): void {
    if (this.solved) return;
    const tile = this.board.cells[i]!;
    if (tile.locked || tile.mask === 0) return;
    const counter = e.button === 2 || e.shiftKey;
    this.rotate(i, counter ? -1 : 1);
  }

  private rotate(i: number, direction: 1 | -1): void {
    const tile = this.board.cells[i]!;
    const v = this.views[i]!;
    this.stopTutorial();
    tile.rotation = (tile.rotation + direction + 4) % 4;
    this.emit('move');
    this.voice.rotate(i % this.board.width);

    v.animating = true;
    v.lit.visible = false;
    // Always tween toward the model's angle so rapid clicks never drift.
    v.spin += (direction * Math.PI) / 2;
    gsap.to(v.pipes, {
      rotation: v.spin,
      duration: scaled(loopStyle.rotateSeconds),
      ease: easings.tileSnap,
      overwrite: true,
      onComplete: () => {
        v.animating = false;
        v.lit.rotation = v.spin;
        this.afterChange();
      },
    });
  }

  private countMatched(): number {
    let n = 0;
    for (let y = 0; y < this.board.height; y++) {
      for (let x = 0; x < this.board.width; x++) {
        const tile = this.board.cells[index(this.board, x, y)];
        if (!tile) continue;
        for (const d of DIRS) if (currentMask(tile) & d && connectorMatched(this.board, x, y, d)) n++;
      }
    }
    return n;
  }

  private afterChange(): void {
    const matched = this.countMatched();
    const comps = components(this.board);
    const complete = comps.filter((c) => c.complete).length;
    if (matched > this.matchedCount) this.voice.connect(matched);
    if (complete > this.completeCount) {
      const newest = comps.filter((c) => c.complete).sort((a, b) => b.cells.length - a.cells.length)[0]!;
      this.voice.loopClosed(newest.cells.length);
    }
    this.matchedCount = matched;
    this.completeCount = complete;
    this.refreshLit();
    if (!this.solved && isSolved(this.board)) {
      this.solved = true;
      this.emit('solved');
    }
  }

  // Lights every tile in a fully satisfied group; flow phase comes from distance within the group.
  private refreshLit(): void {
    this.views.forEach((v) => {
      if (v) v.lit.visible = false;
    });
    for (const comp of components(this.board)) {
      if (!comp.complete) continue;
      const dist = new Map<number, number>();
      const start = comp.cells[0]!;
      dist.set(start, 0);
      const queue = [start];
      while (queue.length) {
        const i = queue.shift()!;
        const x = i % this.board.width;
        const y = Math.floor(i / this.board.width);
        const tile = this.board.cells[i]!;
        for (const d of DIRS) {
          if (!(currentMask(tile) & d)) continue;
          const ni = index(this.board, x + DELTA[d].dx, y + DELTA[d].dy);
          if (comp.cells.includes(ni) && !dist.has(ni)) {
            dist.set(ni, dist.get(i)! + 1);
            queue.push(ni);
          }
        }
      }
      for (const i of comp.cells) {
        const v = this.views[i]!;
        if (v.animating) continue;
        v.lit.visible = true;
        v.flowPhase = dist.get(i) ?? 0;
      }
    }
  }

  update(dt: number): void {
    this.time += dt;
    for (const v of this.views) {
      if (!v || !v.lit.visible) continue;
      v.lit.alpha = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(this.time * loopStyle.flowSpeed - v.flowPhase * loopStyle.flowSpacing));
    }
  }

  restart(): void {
    if (this.solved) return;
    this.stopTutorial();
    this.board.cells.forEach((tile, i) => {
      const original = this.level.cells[i];
      if (!tile || !original) return;
      tile.rotation = original.rotation;
      if (this.clueLocked.has(i)) tile.locked = false;
      const v = this.views[i]!;
      gsap.killTweensOf(v.pipes);
      v.animating = false;
      v.root.cursor = tile.locked ? 'default' : 'pointer';
      v.mark.visible = false;
      v.ghost.visible = false;
      this.drawTile(i);
    });
    this.clueLocked.clear();
    this.matchedCount = this.countMatched();
    this.completeCount = components(this.board).filter((c) => c.complete).length;
    this.refreshLit();
    if (this.isTutorial) this.scheduleTutorial();
  }

  showClue(tier: ClueTier): void {
    if (this.solved) return;
    switch (tier) {
      case 1:
      case 2: {
        const clue = lockClue(this.board, tier === 1 ? 1 : 2, `${this.level.seed}:clue${tier}`);
        if (!clue) return;
        clue.cells.forEach((i, k) => this.lockTile(i, clue.rotations[k]!));
        break;
      }
      case 3: {
        for (const i of forcedClue(this.board).cells) {
          const v = this.views[i]!;
          v.mark.visible = true;
          v.mark.alpha = 0;
          gsap.to(v.mark, { alpha: 1, duration: scaled(durations.pieceMove) });
        }
        break;
      }
      case 4: {
        const clue = ghostClue(this.board, `${this.level.seed}:clue4`);
        if (!clue) return;
        clue.cells.forEach((i, k) => {
          const v = this.views[i]!;
          this.drawPipes(v.ghost, clue.masks[k]!, this.accent, 0.4);
          v.ghost.rotation = 0;
          v.ghost.visible = true;
          v.ghost.alpha = 0;
          gsap.to(v.ghost, { alpha: 1, duration: scaled(durations.pieceMove) });
          gsap.to(v.ghost, {
            alpha: 0,
            duration: scaled(durations.pieceMove) * 2,
            delay: loopStyle.clueGhostSeconds,
            onComplete: () => {
              v.ghost.visible = false;
            },
          });
        });
        break;
      }
    }
  }

  private lockTile(i: number, rotation: number): void {
    const tile = this.board.cells[i]!;
    const v = this.views[i]!;
    const turns = (rotation - tile.rotation + 4) % 4;
    tile.rotation = rotation;
    tile.locked = true;
    this.clueLocked.add(i);
    v.root.cursor = 'default';
    v.animating = true;
    v.lit.visible = false;
    v.spin += (turns * Math.PI) / 2;
    gsap.to(v.pipes, {
      rotation: v.spin,
      duration: scaled(loopStyle.rotateSeconds) * Math.max(1, turns),
      ease: easings.tileSnap,
      overwrite: true,
      onComplete: () => {
        v.animating = false;
        this.drawTile(i);
        this.shimmer(i);
        this.afterChange();
      },
    });
  }

  private shimmer(i: number): void {
    const v = this.views[i]!;
    const flash = new Graphics().roundRect(-this.cell / 2, -this.cell / 2, this.cell, this.cell, this.cell * loopStyle.cornerFraction).fill({ color: this.accent, alpha: 0.35 });
    flash.position.copyFrom(v.root.position);
    this.ghostLayer.addChild(flash);
    gsap.to(flash, { alpha: 0, duration: scaled(durations.pieceMove) * 3, ease: easings.ambient, onComplete: () => flash.destroy() });
  }

  private scheduleTutorial(): void {
    this.stopTutorial();
    this.tutorialTimer = gsap.delayedCall(loopStyle.tutorialDelay, () => {
      const i = this.board.cells.findIndex((t, k) => t && !t.locked && t.mask !== 0 && currentMask(t) !== rotateMask(t.mask, this.level.solution[k]!));
      if (i < 0) return;
      if (!this.hand) {
        this.hand = new GhostHand();
        this.container.addChild(this.hand);
      }
      const v = this.views[i]!;
      this.hand.demoTap(v.root.x, v.root.y);
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
    const cx = this.origin.x + ((this.board.width - 1) * this.cell) / 2;
    const cy = this.origin.y + ((this.board.height - 1) * this.cell) / 2;
    const maxDist = Math.hypot(this.board.width, this.board.height) * this.cell;

    // Ripple ring radiating outward from the board centre.
    const ring = { r: 0, alpha: 0.5 };
    gsap.to(ring, {
      r: maxDist,
      alpha: 0,
      duration: total * 0.8,
      ease: easings.response,
      onUpdate: () => {
        this.ripple.clear().circle(cx, cy, ring.r).stroke({ color: this.accent, width: 2, alpha: ring.alpha });
      },
    });

    // Tiles bob like water, staggered by distance from the centre.
    this.views.forEach((v) => {
      if (!v) return;
      const dist = Math.hypot(v.root.x - cx, v.root.y - cy) / maxDist;
      const bob = this.cell * 0.12;
      gsap.to([v.root, v.lit], {
        y: `-=${bob}`,
        duration: total * 0.22,
        delay: dist * total * 0.35,
        ease: easings.ambient,
        yoyo: true,
        repeat: 1,
      });
      v.lit.visible = true;
      v.flowPhase = dist * 6;
    });

    for (let i = 0; i < 24; i++) {
      const a = this.ctx.rng.next() * Math.PI * 2;
      const r = this.ctx.rng.next() * maxDist * 0.4;
      this.ctx.particles.emit({
        x: cx + Math.cos(a) * r,
        y: cy + Math.sin(a) * r,
        color: this.accent,
        vx: 0,
        vy: -10 - this.ctx.rng.next() * 20,
        life: 1.5 + this.ctx.rng.next(),
        alphaFrom: 0.5,
        scaleFrom: 0.3,
        scaleTo: 0.05,
      });
    }

    return new Promise((resolve) => gsap.delayedCall(total, resolve));
  }

  destroy(): void {
    this.stopTutorial();
    this.voice.dispose();
    this.views.forEach((v) => v && gsap.killTweensOf([v.pipes, v.root, v.lit, v.ghost, v.mark]));
    this.container.destroy({ children: true });
  }

  // Dev only: faint correct connectors on every tile. Stripped from production by the caller's DEV guard.
  showSolutionOverlay(): void {
    this.views.forEach((v, i) => {
      if (!v) return;
      const tile = this.board.cells[i]!;
      this.drawPipes(v.ghost, rotateMask(tile.mask, this.level.solution[i]!), palette.pearl, 0.18);
      v.ghost.visible = true;
    });
  }
}
