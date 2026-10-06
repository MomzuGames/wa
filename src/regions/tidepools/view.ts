import gsap from 'gsap';
import { Container, FederatedPointerEvent, Graphics } from 'pixi.js';
import type { IntroPage, LevelScene, ShellContext, Tip } from '../types';
import { palette } from '../../design/palette';
import { durations, easings, scaled } from '../../design/motion';
import { isTouch, puzzleArea } from '../../design/layout';
import { createGlow } from '../../fx/glow';
import { GhostHand } from '../../ui/ghostHand';
import { holdAt, liftFinger, makeFinger, refuse, tapAt } from '../../ui/introGlyphs';
import {
  DELTA,
  DIRS,
  E,
  N,
  S,
  W,
  type Board,
  type LoopLevel,
  boardFromLevel,
  components,
  connectorMatched,
  currentMask,
  index,
  isSolved,
  linkGroup,
  linkPartner,
  rotateMask,
  tileKind,
} from './model';
import { type LoopStep, moreSteps, stepClue } from './clues';
import { createTidepoolsVoice, type TidepoolsVoice } from './sound';

const loopStyle = {
  maxCell: 92,
  gapFraction: 0.07,
  cornerFraction: 0.22,
  pipeFraction: 0.16,
  hubFraction: 0.11,
  endFraction: 0.17,
  rotateSeconds: 0.34,
  flowSpeed: 2.6,
  flowSpacing: 0.9,
  tutorialDelay: 1.6,
  shadowOffset: 4,
  shadowAlpha: 0.45,
  longPressSeconds: 0.42,
} as const;

type Handler = () => void;

// One colour per linked pair (never the land's own mint, which lights finished loops).
const LINK_COLORS = [palette.lavender, palette.peach, palette.sky, palette.rose, palette.lemon] as const;
function linkColor(group: number): number {
  return LINK_COLORS[group % LINK_COLORS.length]!;
}

interface TileView {
  root: Container;
  shadow: Graphics;
  base: Graphics;
  pipes: Graphics;
  lit: Graphics;
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
  // Hints never turn a tile: a nudge rings the tile to look at, then faint ghost lines show
  // how it (and later a few more) should face. Ghosts fade once a tile matches.
  private hintTarget: LoopStep | null = null;
  private nudge: { cell: number; g: Graphics; tween: gsap.core.Tween } | null = null;
  private ghosts = new Map<number, { rotation: number; g: Graphics }>();
  private hintCount = 0;
  private voice: TidepoolsVoice;
  private tutorialTimer: gsap.core.Tween | null = null;
  private pressTimer: gsap.core.Tween | null = null;
  private pressHandled = false;

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
    this.clearHints();
    this.matchedCount = this.countMatched();
    this.completeCount = components(this.board).filter((c) => c.complete).length;
    this.refreshLit();
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

  private buildTiles(): void {
    this.board.cells.forEach((tile, i) => {
      if (!tile) {
        this.views.push(null);
        return;
      }
      const root = new Container();
      const shadow = new Graphics();
      const base = new Graphics();
      const pipes = new Graphics();
      const lockDot = new Graphics();
      const lit = new Graphics();
      lit.visible = false;
      root.addChild(shadow, base, pipes, lockDot);
      this.boardLayer.addChild(root);
      this.litLayer.addChild(lit);
      root.eventMode = 'static';
      root.cursor = tile.locked ? 'default' : 'pointer';
      root.on('pointerdown', (e: FederatedPointerEvent) => this.onPress(i, e));
      root.on('pointerup', () => this.onRelease(i));
      root.on('pointerupoutside', () => this.cancelPress());
      this.views.push({ root, shadow, base, pipes, lit, lockDot, flowPhase: 0, animating: false, spin: 0 });
    });
  }

  layout(width: number, height: number): void {
    const area = puzzleArea(width, height);
    const fit = Math.min(area.width / this.board.width, area.height / this.board.height);
    const cell = Math.min(loopStyle.maxCell, fit);
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
      this.drawTile(i);
    });
    // Hints follow their tiles to the new size and place.
    for (const [i, ghost] of this.ghosts) {
      ghost.g.position.copyFrom(this.views[i]!.root.position);
      this.drawPipes(ghost.g, rotateMask(this.board.cells[i]!.mask, ghost.rotation), this.accent, 0.45);
    }
    if (this.nudge) this.showNudge(this.nudge.cell);
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
    v.shadow
      .clear()
      .roundRect(-half + gap + loopStyle.shadowOffset * 0.6, -half + gap + loopStyle.shadowOffset, size, size, this.cell * loopStyle.cornerFraction)
      .fill({ color: palette.shadow, alpha: loopStyle.shadowAlpha });
    v.base
      .clear()
      .roundRect(-half + gap, -half + gap, size, size, this.cell * loopStyle.cornerFraction)
      .fill({ color: palette.ink })
      .stroke({ color: palette.dim, width: 1, alpha: 0.5 });
    this.drawPipes(v.pipes, tile.mask, palette.dim, 1);
    v.spin = (tile.rotation * Math.PI) / 2;
    v.pipes.rotation = v.spin;
    this.drawPipes(v.lit, tile.mask, this.accent, 1);
    v.lit.rotation = v.spin;
    v.lockDot.clear();
    // A tile that cannot turn wears a small hollow ring in its corner.
    if (tile.locked) {
      v.lockDot.circle(half - gap * 2.4, -half + gap * 2.4, this.cell * 0.05).stroke({ color: palette.pearl, width: 1.5, alpha: 0.6 });
    }
    // Linked tiles share a coloured border, one colour per pair, so a pair is easy to spot.
    const group = linkGroup(this.board, i);
    if (group >= 0) {
      v.lockDot.roundRect(-half + gap, -half + gap, size, size, this.cell * loopStyle.cornerFraction).stroke({ color: linkColor(group), width: 2.5, alpha: 0.9 });
    }
  }

  // When one of a linked pair turns, its partner's border flashes as it turns too.
  private flashLink(i: number): void {
    const group = linkGroup(this.board, i);
    if (group < 0) return;
    const half = this.cell / 2;
    const gap = this.cell * loopStyle.gapFraction;
    const size = this.cell - gap * 2;
    const flash = new Graphics().roundRect(-half + gap, -half + gap, size, size, this.cell * loopStyle.cornerFraction).fill({ color: linkColor(group), alpha: 0.3 });
    flash.position.copyFrom(this.views[i]!.root.position);
    this.ghostLayer.addChild(flash);
    gsap.to(flash, { alpha: 0, duration: scaled(durations.pieceMove) * 3, ease: easings.ambient, onComplete: () => flash.destroy() });
  }

  // Click turns clockwise; right-click, shift-click or a long press turns the other way.
  private onPress(i: number, e: FederatedPointerEvent): void {
    if (this.solved) return;
    const tile = this.board.cells[i]!;
    if (tile.locked || tile.mask === 0) return;
    if (e.button === 2 || e.shiftKey) {
      this.pressHandled = true;
      this.rotate(i, -1);
      return;
    }
    this.pressHandled = false;
    this.pressTimer?.kill();
    this.pressTimer = gsap.delayedCall(loopStyle.longPressSeconds, () => {
      this.pressHandled = true;
      this.rotate(i, -1);
    });
  }

  private onRelease(i: number): void {
    this.pressTimer?.kill();
    this.pressTimer = null;
    if (this.pressHandled) return;
    this.pressHandled = true;
    this.rotate(i, 1);
  }

  private cancelPress(): void {
    this.pressTimer?.kill();
    this.pressTimer = null;
    this.pressHandled = true;
  }

  private rotate(i: number, direction: 1 | -1): void {
    this.stopTutorial();
    this.emit('move');
    this.voice.rotate(i % this.board.width);
    this.spin(i, direction);
    const partner = linkPartner(this.board, i);
    if (partner !== null && !this.board.cells[partner]!.locked) {
      this.spin(partner, direction);
      this.flashLink(partner);
    }
  }

  // Turns one tile's model and animates it; linked partners are spun by the caller.
  private spin(i: number, direction: 1 | -1): void {
    const tile = this.board.cells[i]!;
    const v = this.views[i]!;
    tile.rotation = (tile.rotation + direction + 4) % 4;

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
    this.settleHints();
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
      const v = this.views[i]!;
      gsap.killTweensOf(v.pipes);
      v.animating = false;
      v.root.cursor = tile.locked ? 'default' : 'pointer';
      this.drawTile(i);
    });
    this.matchedCount = this.countMatched();
    this.completeCount = components(this.board).filter((c) => c.complete).length;
    this.refreshLit();
    if (this.isTutorial) this.scheduleTutorial();
  }

  hint(): string {
    if (this.solved) return '';
    this.hintCount++;
    const seed = `${this.level.seed}:hint:${this.hintCount}`;
    if (this.hintTarget && this.faces(this.hintTarget.cell, this.hintTarget.rotation)) this.hintTarget = null;
    // First: where to look, and why.
    if (!this.hintTarget) {
      const step = stepClue(this.board, seed);
      if (!step) return 'Just one tile left to turn. You can do this one!';
      this.hintTarget = step;
      this.showNudge(step.cell);
      switch (step.reason) {
        case 'forced':
          return 'Look at the ringed tile. No line may point off the board or into an empty space, so only one way fits.';
        case 'neighbour':
          return 'Look at the ringed tile. The tiles beside it are already right: which way meets their lines?';
        default:
          return 'Look at the ringed tile. Try turning it until its lines meet its neighbours.';
      }
    }
    // Then: how that tile should face.
    if (!this.ghosts.has(this.hintTarget.cell)) {
      this.addGhost(this.hintTarget.cell, this.hintTarget.rotation);
      return 'The faint lines show which way the ringed tile should face. Turn it to match.';
    }
    // After that: a few more tiles at a time, never more than half of what is left.
    const more = moreSteps(this.board, new Set(this.ghosts.keys()), 2);
    if (more.length === 0) return 'That is all I can show. The rest is yours.';
    more.forEach((m) => this.addGhost(m.cell, m.rotation));
    return more.length === 1 ? 'One more tile shows its shape. Turn it to match.' : 'Two more tiles show their shape. Turn each to match.';
  }

  private faces(i: number, rotation: number): boolean {
    const tile = this.board.cells[i]!;
    return currentMask(tile) === rotateMask(tile.mask, rotation);
  }

  private showNudge(i: number): void {
    this.clearNudge();
    const v = this.views[i]!;
    const size = this.cell * 1.02;
    const g = new Graphics().roundRect(-size / 2, -size / 2, size, size, this.cell * loopStyle.cornerFraction).stroke({ color: palette.pearl, width: 1.5, alpha: 0.9 });
    g.position.copyFrom(v.root.position);
    this.ghostLayer.addChild(g);
    const tween = gsap.fromTo(g, { alpha: 0.25 }, { alpha: 0.9, duration: 0.9, yoyo: true, repeat: -1, ease: easings.ambient });
    this.nudge = { cell: i, g, tween };
  }

  private clearNudge(): void {
    this.nudge?.tween.kill();
    this.nudge?.g.destroy();
    this.nudge = null;
  }

  private addGhost(i: number, rotation: number): void {
    if (this.ghosts.has(i) || this.faces(i, rotation)) return;
    const g = new Graphics();
    g.position.copyFrom(this.views[i]!.root.position);
    this.drawPipes(g, rotateMask(this.board.cells[i]!.mask, rotation), this.accent, 0.45);
    g.alpha = 0;
    this.ghostLayer.addChild(g);
    gsap.to(g, { alpha: 1, duration: scaled(durations.pieceMove) });
    this.ghosts.set(i, { rotation, g });
  }

  // Ghosts (and the nudge) go once their tile faces the way they showed.
  private settleHints(): void {
    for (const [i, ghost] of this.ghosts) {
      if (!this.faces(i, ghost.rotation)) continue;
      gsap.to(ghost.g, { alpha: 0, duration: scaled(durations.pieceMove), onComplete: () => ghost.g.destroy() });
      this.ghosts.delete(i);
    }
    if (this.nudge && this.hintTarget && this.faces(this.hintTarget.cell, this.hintTarget.rotation)) {
      this.clearNudge();
      this.hintTarget = null;
    }
  }

  private clearHints(): void {
    this.clearNudge();
    this.ghosts.forEach((g) => g.g.destroy());
    this.ghosts.clear();
    this.hintTarget = null;
  }

  tips(): Tip[] {
    const tips: Tip[] = [
      { id: 'loop:edges', text: 'Tip: start at the edges and corners. A line can never point off the board.', after: 1 },
      { id: 'loop:back', text: isTouch() ? 'Tip: hold a tile to turn it back the other way.' : 'Tip: right-click a tile to turn it back the other way.', after: 2 },
      { id: 'loop:follow', text: 'Tip: once a tile is right, its lines tell its neighbours which way to face. Work outward from it.', after: 4 },
    ];
    if (this.level.links?.length) tips.push({ id: 'loop:links', text: 'Tip: tiles with the same coloured border always turn together. Set the harder one; the other follows.', after: 2 });
    return tips;
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
    this.pressTimer?.kill();
    this.voice.dispose();
    this.views.forEach((v) => v && gsap.killTweensOf([v.pipes, v.root, v.lit]));
    this.container.destroy({ children: true });
  }

  // ----- instruction pages -----

  // A miniature tile for the instruction card: base, pipes (turnable) and an optional lit copy.
  private miniTile(cell: number, mask: number, opts: { locked?: boolean; links?: number } = {}): { root: Container; pipes: Graphics; lit: Graphics } {
    const root = new Container();
    const base = new Graphics()
      .roundRect(-cell / 2 + 4, -cell / 2 + 4, cell - 8, cell - 8, cell * loopStyle.cornerFraction)
      .fill({ color: palette.ink })
      .stroke({ color: palette.dim, width: 1 });
    const pipes = new Graphics();
    const lit = new Graphics();
    const savedCell = this.cell;
    this.cell = cell;
    this.drawPipes(pipes, mask, opts.locked ? this.accent : palette.dim, opts.locked ? 0.8 : 1);
    this.drawPipes(lit, mask, this.accent, 1);
    this.cell = savedCell;
    lit.alpha = 0;
    root.addChild(base, pipes, lit);
    if (opts.locked) root.addChild(new Graphics().circle(cell / 2 - 11, -cell / 2 + 11, 3).stroke({ color: palette.pearl, width: 1.5, alpha: 0.6 }));
    if (opts.links) root.addChild(new Graphics().roundRect(-cell / 2 + 4, -cell / 2 + 4, cell - 8, cell - 8, cell * loopStyle.cornerFraction).stroke({ color: linkColor(opts.links - 1), width: 2.5, alpha: 0.9 }));
    return { root, pipes, lit };
  }

  introPages(): IntroPage[] {
    const cell = 56;
    const pages: IntroPage[] = [];
    // 1. Lines must meet: the left tile turns until its line meets the right tile's line.
    pages.push({
      caption: 'Turn the tiles until every line meets a line on the next tile. A line pointing at the edge, or at nothing, is not connected.',
      glyph: () => {
        const root = new Container();
        const left = this.miniTile(cell, N);
        const right = this.miniTile(cell, W);
        left.root.x = -cell * 0.6;
        right.root.x = cell * 0.6;
        const finger = makeFinger();
        root.addChild(left.root, right.root, finger);
        const tl = gsap.timeline({ repeat: -1, repeatDelay: 1 });
        tapAt(tl, finger, -cell * 0.6, 0, 0.6)
          .to(left.pipes, { rotation: Math.PI / 2, duration: loopStyle.rotateSeconds, ease: easings.tileSnap }, '<')
          .set(left.lit, { rotation: Math.PI / 2 })
          .to([left.lit, right.lit], { alpha: 1, duration: 0.5 })
          .call(() => liftFinger(gsap.timeline(), finger, 0))
          .to([left.lit, right.lit], { alpha: 0, duration: 0.4, delay: 1.2 })
          .set(left.pipes, { rotation: 0 });
        root.on('destroyed', () => tl.kill());
        return root;
      },
    });
    // 2. Controls.
    pages.push({
      caption: isTouch() ? 'Tap a tile to turn it. Hold a tile to turn it the other way.' : 'Click a tile to turn it. Right-click (or shift-click) to turn it the other way.',
      glyph: () => {
        const root = new Container();
        const tile = this.miniTile(cell, N | E);
        const finger = makeFinger();
        const ring = new Graphics();
        root.addChild(tile.root, ring, finger);
        const tl = gsap.timeline({ repeat: -1, repeatDelay: 1 });
        tapAt(tl, finger, 0, 0, 0.5).to(tile.pipes, { rotation: `+=${Math.PI / 2}`, duration: loopStyle.rotateSeconds, ease: easings.tileSnap }, '<');
        liftFinger(tl, finger);
        if (isTouch()) holdAt(tl, finger, ring, 0, 0, 0.7, 0.6);
        else tapAt(tl, finger, 0, 0, 0.6).set(finger, { tint: this.accent });
        tl.to(tile.pipes, { rotation: `-=${Math.PI / 2}`, duration: loopStyle.rotateSeconds, ease: easings.tileSnap });
        liftFinger(tl, finger).set(finger, { tint: 0xffffff });
        root.on('destroyed', () => tl.kill());
        return root;
      },
    });
    // 3. Locked tiles.
    if (this.level.chapter >= 2 && this.level.cells.some((c) => c?.locked)) {
      pages.push({
        caption: 'A tile with a small ring in its corner is already correct and cannot turn.',
        glyph: () => {
          const root = new Container();
          const tile = this.miniTile(cell, N | S, { locked: true });
          const finger = makeFinger();
          root.addChild(tile.root, finger);
          const tl = gsap.timeline({ repeat: -1, repeatDelay: 1 });
          tapAt(tl, finger, 0, 0, 0.6);
          refuse(tl, tile.root);
          liftFinger(tl, finger);
          root.on('destroyed', () => tl.kill());
          return root;
        },
      });
    }
    // 4. Linked tiles.
    if (this.level.links?.length) {
      pages.push({
        caption: 'Two tiles with the same coloured border are linked: turning one turns the other as well.',
        glyph: () => {
          const root = new Container();
          const a = this.miniTile(cell, N | E, { links: 1 });
          const b = this.miniTile(cell, S | W, { links: 1 });
          a.root.x = -cell * 0.6;
          b.root.x = cell * 0.6;
          const finger = makeFinger();
          root.addChild(a.root, b.root, finger);
          const tl = gsap.timeline({ repeat: -1, repeatDelay: 1 });
          tapAt(tl, finger, -cell * 0.6, 0, 0.6).to([a.pipes, b.pipes], { rotation: `+=${Math.PI / 2}`, duration: loopStyle.rotateSeconds, ease: easings.tileSnap }, '<');
          liftFinger(tl, finger);
          root.on('destroyed', () => tl.kill());
          return root;
        },
      });
    }
    // 5. Several loops.
    if (this.level.chapter >= 3) {
      pages.push({
        caption: 'A larger board may hold more than one separate loop. Every line still has to meet another.',
        glyph: () => {
          const root = new Container();
          const small = 30;
          const loops = [
            { x: -small * 1.6, masks: [E | S, S | W, N | E, N | W] },
            { x: small * 1.6, masks: [E | S, S | W, N | E, N | W] },
          ];
          loops.forEach((loop, n) => {
            loop.masks.forEach((mask, k) => {
              const t = this.miniTile(small, mask);
              t.root.position.set(loop.x + ((k % 2) - 0.5) * small, (Math.floor(k / 2) - 0.5) * small);
              t.lit.alpha = 1;
              root.addChild(t.root);
              gsap.to(t.lit, { alpha: 0.5, duration: 1.6 + n * 0.4, yoyo: true, repeat: -1, ease: easings.ambient });
            });
          });
          root.on('destroyed', () => gsap.killTweensOf(root.children));
          return root;
        },
      });
    }
    return pages;
  }


  // Dev only: faint correct connectors on every tile. Stripped from production by the caller's DEV guard.
  showSolutionOverlay(): void {
    this.views.forEach((v, i) => {
      if (!v) return;
      const tile = this.board.cells[i]!;
      const ghost = new Graphics();
      ghost.position.copyFrom(v.root.position);
      this.drawPipes(ghost, rotateMask(tile.mask, this.level.solution[i]!), palette.pearl, 0.18);
      this.ghostLayer.addChild(ghost);
    });
  }
}
