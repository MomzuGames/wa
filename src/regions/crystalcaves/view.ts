import gsap from 'gsap';
import { Container, Graphics } from 'pixi.js';
import type { ClueTier, LevelScene, ShellContext } from '../types';
import { alphas, palette } from '../../design/palette';
import { durations, easings, reducedMotion, scaled } from '../../design/motion';
import { isTouch, layout, puzzleArea } from '../../design/layout';
import { createGlow } from '../../fx/glow';
import { GhostHand } from '../../ui/ghostHand';
import { COLOR_NAMES, DIR_DELTA, LEMON, ORIENTATIONS, type PrismLevel, ROSE, SKY, type Segment, isSolved, trace } from './model';
import { ghostClue, lockClue, routeClue } from './clues';
import { createCrystalVoice, type CrystalVoice } from './sound';

const prismStyle = {
  maxCell: 76,
  minCell: 40,
  gridAlpha: 0.22,
  beamWidth: 3,
  beamAlpha: 0.75,
  flowSpeed: 3,
  ringAlpha: 0.35,
  turnSeconds: 0.3,
  clueSeconds: 3,
  tutorialDelay: 1.6,
  glyphSize: 3.2,
} as const;

type Handler = () => void;

interface PieceView {
  root: Container;
  body: Graphics; // rotates
  ring: Graphics;
  glyph: Graphics;
  fill: Graphics; // target fill
  animating: boolean;
}

export function colorOf(mask: number): number {
  return palette[COLOR_NAMES[mask] ?? 'pearl'];
}

export class PrismLevelScene implements LevelScene {
  readonly container = new Container();
  private grid = new Graphics();
  private beams = new Graphics();
  private clueLayer = new Graphics();
  private piecesLayer = new Container();
  private views: PieceView[] = [];
  private orients: number[];
  private locked = new Set<number>();
  private handlers: Record<'attempt' | 'solved' | 'move', Handler[]> = { attempt: [], solved: [], move: [] };
  private accent = palette.sky;
  private cell = 50;
  private origin = { x: 0, y: 0 };
  private time = 0;
  private solved = false;
  private segments: Segment[] = [];
  private received = new Map<number, number>();
  private litCount = 0;
  private voice: CrystalVoice;
  private hand: GhostHand | null = null;
  private tutorialTimer: gsap.core.Tween | null = null;
  private routeUntil: number | null = null;
  private routeSegments: Segment[] = [];
  private ghostUntil: number | null = null;
  private ghostPieces: Array<{ piece: number; orient: number }> = [];

  constructor(
    private ctx: ShellContext,
    private level: PrismLevel,
    private isTutorial: boolean,
  ) {
    this.orients = level.pieces.map((p) => p.orient);
    this.voice = createCrystalVoice(ctx.audio);
    this.beams.filters = [createGlow(palette.pearl, { distance: 12, strength: 1.2, quality: 0.3 })];
    this.grid.eventMode = 'none';
    this.beams.eventMode = 'none';
    this.clueLayer.eventMode = 'none';
    this.container.addChild(this.grid, this.beams, this.clueLayer, this.piecesLayer);
    this.buildPieces();
    this.layout(ctx.width, ctx.height);
    this.retrace(true);
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
      const ring = new Graphics();
      const fill = new Graphics();
      const body = new Graphics();
      const glyph = new Graphics();
      root.addChild(ring, fill, body, glyph);
      if (piece.rotatable) {
        root.eventMode = 'static';
        root.cursor = 'pointer';
        root.on('pointertap', () => this.turn(i));
      }
      this.piecesLayer.addChild(root);
      this.views.push({ root, body, ring, glyph, fill, animating: false });
    });
  }

  private cellCenter(x: number, y: number): { x: number; y: number } {
    return { x: this.origin.x + (x + 0.5) * this.cell, y: this.origin.y + (y + 0.5) * this.cell };
  }

  layout(width: number, height: number): void {
    const area = puzzleArea(width, height);
    this.cell = Math.max(prismStyle.minCell, Math.min(prismStyle.maxCell, area.width / this.level.width, area.height / this.level.height));
    this.origin = { x: width / 2 - (this.level.width * this.cell) / 2, y: height / 2 - (this.level.height * this.cell) / 2 };
    const g = this.grid;
    g.clear();
    for (let y = 0; y <= this.level.height; y++) {
      g.moveTo(this.origin.x, this.origin.y + y * this.cell).lineTo(this.origin.x + this.level.width * this.cell, this.origin.y + y * this.cell);
    }
    for (let x = 0; x <= this.level.width; x++) {
      g.moveTo(this.origin.x + x * this.cell, this.origin.y).lineTo(this.origin.x + x * this.cell, this.origin.y + this.level.height * this.cell);
    }
    g.stroke({ color: palette.dim, width: 1, alpha: prismStyle.gridAlpha });
    this.views.forEach((v, i) => {
      const p = this.level.pieces[i]!;
      v.root.position.copyFrom(this.cellCenter(p.x, p.y));
      this.drawPiece(i);
    });
    this.drawBeams();
    this.drawClues();
  }

  resize(width: number, height: number): void {
    this.layout(width, height);
  }

  private drawPiece(i: number): void {
    const v = this.views[i]!;
    const p = this.level.pieces[i]!;
    const s = this.cell;
    const half = s / 2;
    v.body.clear();
    v.ring.clear();
    v.glyph.clear();
    v.body.rotation = 0;
    if (p.rotatable) {
      const hitR = Math.max(layout.minHitSize / 2, half * 0.9);
      v.ring.circle(0, 0, hitR).fill({ color: palette.pearl, alpha: 0.001 });
      v.ring.circle(0, 0, half * 0.8).stroke({ color: this.locked.has(i) ? this.accent : palette.dim, width: 1, alpha: this.locked.has(i) ? 0.8 : prismStyle.ringAlpha });
    }
    switch (p.kind) {
      case 'emitter': {
        const [dx, dy] = DIR_DELTA[this.orients[i]!]!;
        const color = colorOf(p.color);
        // A shard pointing along its beam.
        v.body.moveTo(dx * half * 0.7, dy * half * 0.7);
        v.body.lineTo(-dy * half * 0.35 - dx * half * 0.4, dx * half * 0.35 - dy * half * 0.4);
        v.body.lineTo(dy * half * 0.35 - dx * half * 0.4, -dx * half * 0.35 - dy * half * 0.4);
        v.body.closePath().fill({ color, alpha: 0.9 });
        v.body.filters = [createGlow(color, { distance: 12, strength: 1.2, quality: 0.3 })];
        break;
      }
      case 'mirror':
      case 'splitter': {
        const o = this.orients[i]!;
        const sign = o === 0 ? -1 : 1; // '/' rises to the right, '\' falls
        const len = half * 0.7;
        if (p.kind === 'mirror') {
          v.body.moveTo(-len, -sign * len).lineTo(len, sign * len).stroke({ color: palette.pearl, width: 3.5, cap: 'round', alpha: 0.9 });
        } else {
          const off = 3;
          v.body.moveTo(-len - off * sign, -sign * len + off).lineTo(len - off * sign, sign * len + off).stroke({ color: palette.pearl, width: 2, cap: 'round', alpha: 0.75 });
          v.body.moveTo(-len + off * sign, -sign * len - off).lineTo(len + off * sign, sign * len - off).stroke({ color: palette.pearl, width: 2, cap: 'round', alpha: 0.75 });
        }
        break;
      }
      case 'filter': {
        const color = colorOf(p.color);
        v.body.roundRect(-half * 0.42, -half * 0.42, half * 0.84, half * 0.84, 4).fill({ color, alpha: 0.18 }).stroke({ color, width: 1.5, alpha: 0.8 });
        break;
      }
      case 'blocker':
        v.body.roundRect(-half * 0.5, -half * 0.5, half, half, half * 0.3).fill({ color: palette.ink }).stroke({ color: palette.dim, width: 1.5 });
        break;
      case 'target': {
        const color = colorOf(p.color);
        v.body.moveTo(0, -half * 0.6).lineTo(half * 0.45, 0).lineTo(0, half * 0.6).lineTo(-half * 0.45, 0).closePath().stroke({ color, width: 1.5, alpha: 0.9 });
        // Colour-blind glyphs beneath the crystal: circle = rose, triangle = sky, square = lemon.
        const glyphs: number[] = [];
        if (p.color & ROSE) glyphs.push(ROSE);
        if (p.color & SKY) glyphs.push(SKY);
        if (p.color & LEMON) glyphs.push(LEMON);
        const gs = prismStyle.glyphSize;
        glyphs.forEach((m, k) => {
          const gx = (k - (glyphs.length - 1) / 2) * gs * 3;
          const gy = half * 0.82;
          if (m === ROSE) v.glyph.circle(gx, gy, gs).fill({ color: palette.rose });
          else if (m === SKY) v.glyph.moveTo(gx, gy - gs).lineTo(gx + gs, gy + gs).lineTo(gx - gs, gy + gs).closePath().fill({ color: palette.sky });
          else v.glyph.rect(gx - gs, gy - gs, gs * 2, gs * 2).fill({ color: palette.lemon });
        });
        break;
      }
    }
    this.drawTargetFill(i);
  }

  private drawTargetFill(i: number): void {
    const v = this.views[i]!;
    const p = this.level.pieces[i]!;
    v.fill.clear();
    if (p.kind !== 'target') return;
    const got = this.received.get(i) ?? 0;
    if (got === 0) return;
    const half = this.cell / 2;
    const exact = got === p.color;
    v.fill.moveTo(0, -half * 0.6).lineTo(half * 0.45, 0).lineTo(0, half * 0.6).lineTo(-half * 0.45, 0).closePath().fill({ color: colorOf(got), alpha: exact ? 0.85 : 0.35 });
    v.fill.filters = exact ? [createGlow(colorOf(got), { distance: 16, strength: 1.4, quality: 0.3 })] : [];
  }

  private drawBeams(): void {
    const g = this.beams;
    g.clear();
    const s = this.cell;
    const occupied = new Set(this.level.pieces.map((p) => p.y * this.level.width + p.x));
    this.segments.forEach((seg, k) => {
      const c = this.cellCenter(seg.x, seg.y);
      const [dx, dy] = DIR_DELTA[seg.dir]!;
      const shimmer = reducedMotion() ? 1 : 0.7 + 0.3 * Math.sin(this.time * prismStyle.flowSpeed - k * 0.6);
      // Beams stop at a piece's centre; the piece decides what leaves it.
      const exit = occupied.has(seg.y * this.level.width + seg.x) ? 0 : 0.5;
      g.moveTo(c.x - dx * s * 0.5, c.y - dy * s * 0.5)
        .lineTo(c.x + dx * s * exit, c.y + dy * s * exit)
        .stroke({ color: colorOf(seg.color), width: prismStyle.beamWidth, alpha: prismStyle.beamAlpha * shimmer, cap: 'round' });
    });
  }

  private drawClues(): void {
    const g = this.clueLayer;
    g.clear();
    if (this.routeUntil !== null) {
      for (const seg of this.routeSegments) {
        const c = this.cellCenter(seg.x, seg.y);
        g.circle(c.x, c.y, 2).fill({ color: this.accent, alpha: alphas.hudIdle });
      }
    }
    if (this.ghostUntil !== null) {
      for (const ghost of this.ghostPieces) {
        const p = this.level.pieces[ghost.piece]!;
        const c = this.cellCenter(p.x, p.y);
        const len = this.cell * 0.35;
        const sign = ghost.orient === 0 ? -1 : 1;
        g.moveTo(c.x - len, c.y - sign * len).lineTo(c.x + len, c.y + sign * len).stroke({ color: this.accent, width: 2, alpha: 0.4, cap: 'round' });
      }
    }
  }

  private retrace(silent: boolean): void {
    const t = trace(this.level, this.orients);
    this.segments = t.segments;
    this.received = t.received;
    let lit = 0;
    this.level.pieces.forEach((p, i) => {
      if (p.kind === 'target') {
        this.drawTargetFill(i);
        if ((this.received.get(i) ?? 0) === p.color) lit++;
      }
    });
    if (!silent && lit > this.litCount) this.voice.targetLit(lit);
    this.litCount = lit;
    this.drawBeams();
    if (!silent && !this.solved && isSolved(this.level, this.orients)) {
      this.solved = true;
      this.emit('solved');
    }
  }

  private turn(i: number, forced: number | null = null): void {
    if (this.solved || (this.locked.has(i) && forced === null)) return;
    const v = this.views[i]!;
    if (v.animating) return;
    this.stopTutorial();
    const count = ORIENTATIONS[this.level.pieces[i]!.kind];
    const next = forced ?? (this.orients[i]! + 1) % count;
    if (next === this.orients[i]) return;
    this.orients[i] = next;
    if (forced === null) {
      this.emit('move');
      this.voice.turn(i);
    }
    v.animating = true;
    gsap.to(v.body, {
      rotation: Math.PI / 2,
      duration: scaled(prismStyle.turnSeconds),
      ease: easings.tileSnap,
      onComplete: () => {
        v.animating = false;
        this.drawPiece(i);
        this.retrace(forced !== null && this.solved);
      },
    });
  }

  update(dt: number): void {
    this.time += dt;
    if (this.segments.length && !reducedMotion()) this.drawBeams();
    let changed = false;
    if (this.routeUntil !== null && this.time > this.routeUntil) {
      this.routeUntil = null;
      changed = true;
    }
    if (this.ghostUntil !== null && this.time > this.ghostUntil) {
      this.ghostUntil = null;
      changed = true;
    }
    if (changed) this.drawClues();
  }

  restart(): void {
    if (this.solved) return;
    this.stopTutorial();
    this.orients = this.level.pieces.map((p) => p.orient);
    this.locked.clear();
    this.routeUntil = null;
    this.ghostUntil = null;
    this.views.forEach((v, i) => {
      gsap.killTweensOf(v.body);
      v.animating = false;
      this.drawPiece(i);
    });
    this.drawClues();
    this.retrace(true);
    if (this.isTutorial) this.scheduleTutorial();
  }

  showClue(tier: ClueTier): string | void {
    if (this.solved) return;
    let caption: string | undefined;
    switch (tier) {
      case 1:
      case 2: {
        const clue = lockClue(this.level, this.orients, this.locked, tier === 1 ? 1 : 2, `${this.level.seed}:clue${tier}:${this.locked.size}`);
        if (!clue || clue.pieces.length === 0) return 'Every piece that can be fixed already is.';
        clue.pieces.forEach((i, k) => {
          const target = clue.orients[k]!;
          if (this.orients[i] !== target) this.turn(i, target);
          this.locked.add(i);
          if (this.orients[i] === target && !this.views[i]!.animating) this.drawPiece(i);
          this.views[i]!.root.cursor = 'default';
        });
        caption = clue.pieces.length === 1 ? 'That piece has turned to its correct angle and will stay put.' : 'Two more pieces have turned to their correct angles and will stay put.';
        break;
      }
      case 3:
        this.routeSegments = routeClue(this.level, this.orients);
        this.routeUntil = this.time + prismStyle.clueSeconds;
        caption = 'For a moment, dots trace the path each beam should take.';
        break;
      case 4: {
        const clue = ghostClue(this.level, this.orients, `${this.level.seed}:clue4`);
        if (!clue) return;
        this.ghostPieces = clue.pieces.map((piece, k) => ({ piece, orient: clue.orients[k]! }));
        this.ghostUntil = this.time + prismStyle.clueSeconds;
        caption = 'For a moment, half the pieces show the angle they should have.';
        break;
      }
    }
    this.drawClues();
    return caption;
  }

  private scheduleTutorial(): void {
    this.stopTutorial();
    this.tutorialTimer = gsap.delayedCall(prismStyle.tutorialDelay, () => {
      const i = this.level.pieces.findIndex((p, k) => p.rotatable && this.orients[k] !== this.level.solution[k]);
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
    this.level.pieces.forEach((p, i) => {
      if (p.kind !== 'target') return;
      const v = this.views[i]!;
      gsap.to(v.root.scale, { x: 1.6, y: 1.6, duration: total * 0.4, ease: easings.response, yoyo: true, repeat: 1 });
      for (let k = 0; k < 18; k++) {
        this.ctx.particles.emit({
          x: v.root.x + (this.ctx.rng.next() - 0.5) * this.cell,
          y: v.root.y,
          color: colorOf(p.color),
          vx: (this.ctx.rng.next() - 0.5) * 20,
          vy: -20 - this.ctx.rng.next() * 40,
          life: 1.5 + this.ctx.rng.next(),
          alphaFrom: 0.8,
          scaleFrom: 0.3,
          scaleTo: 0.05,
        });
      }
    });
    gsap.to(this.beams, { alpha: 1.4, duration: total * 0.5, yoyo: true, repeat: 1, ease: easings.ambient });
    return new Promise((resolve) => gsap.delayedCall(total, resolve));
  }

  introLines(): string[] {
    const lines = [
      'Turn the mirrors so a beam reaches every crystal.',
      `${isTouch() ? 'Tap' : 'Click'} a piece with a ring around it to turn it. Pieces without a ring are fixed.`,
      'A beam bounces off a mirror, passes straight through empty cells, and stops at a crystal, a stone or the edge.',
      'A crystal lights fully only when it receives exactly the colour its marks show.',
    ];
    if (this.level.pieces.some((p) => p.kind === 'splitter')) lines.push('A double line lets half the beam through and bounces the other half.');
    if (this.level.chapter >= 2) lines.push('Two beams meeting at a crystal mix: pink and blue make violet, blue and yellow make green.');
    if (this.level.pieces.some((p) => p.kind === 'filter')) lines.push('A tinted square lets only its own colour pass.');
    return lines;
  }

  introGlyph(): Container {
    const root = new Container();
    const s = 26;
    const emitter = new Graphics().moveTo(-s * 2.2 + s * 0.4, 0).lineTo(-s * 2.2 - s * 0.3, -s * 0.3).lineTo(-s * 2.2 - s * 0.3, s * 0.3).closePath().fill({ color: palette.sky });
    const ring = new Graphics().circle(0, 0, s * 0.8).stroke({ color: palette.dim, width: 1, alpha: prismStyle.ringAlpha });
    const mirror = new Graphics().moveTo(-s * 0.7, s * 0.7).lineTo(s * 0.7, -s * 0.7).stroke({ color: palette.pearl, width: 3, cap: 'round' });
    const target = new Graphics().moveTo(0, -s * 0.6).lineTo(s * 0.45, 0).lineTo(0, s * 0.6).lineTo(-s * 0.45, 0).closePath().stroke({ color: palette.sky, width: 1.5 });
    target.position.set(0, s * 2.2);
    const beam = new Graphics();
    const tap = new Graphics().circle(0, 0, 8).fill({ color: palette.pearl, alpha: 0.6 });
    tap.alpha = 0;
    root.addChild(beam, emitter, ring, mirror, target, tap);
    const state = { turned: 0 };
    const drawBeam = () => {
      beam.clear();
      beam.moveTo(-s * 2.2, 0).lineTo(0, 0).stroke({ color: palette.sky, width: 3, alpha: 0.8, cap: 'round' });
      if (state.turned >= 1) beam.moveTo(0, 0).lineTo(0, s * 1.7).stroke({ color: palette.sky, width: 3, alpha: 0.8, cap: 'round' });
      else beam.moveTo(0, 0).lineTo(0, -s * 2.2).stroke({ color: palette.sky, width: 3, alpha: 0.5, cap: 'round' });
    };
    drawBeam();
    const tl = gsap
      .timeline({ repeat: -1, repeatDelay: 1 })
      .to(tap, { alpha: 1, duration: 0.2, delay: 0.8 })
      .to(tap.scale, { x: 0.7, y: 0.7, duration: 0.15, yoyo: true, repeat: 1 })
      .to(mirror, { rotation: Math.PI / 2, duration: prismStyle.turnSeconds, ease: easings.tileSnap, onComplete: () => { state.turned = 1; drawBeam(); } }, '<')
      .to(tap, { alpha: 0, duration: 0.3 })
      .to(target, { alpha: 0.5, duration: 0.3, yoyo: true, repeat: 3 })
      .set(mirror, { rotation: 0 })
      .call(() => { state.turned = 0; drawBeam(); });
    root.on('destroyed', () => tl.kill());
    return root;
  }

  // Dev only: faint solved orientation on every rotatable piece.
  showSolutionOverlay(): void {
    const g = new Graphics();
    g.eventMode = 'none';
    this.level.pieces.forEach((p, i) => {
      if (!p.rotatable) return;
      const c = this.cellCenter(p.x, p.y);
      const len = this.cell * 0.3;
      const sign = this.level.solution[i] === 0 ? -1 : 1;
      g.moveTo(c.x - len, c.y - sign * len).lineTo(c.x + len, c.y + sign * len).stroke({ color: palette.pearl, width: 1, alpha: 0.18 });
    });
    this.container.addChild(g);
  }

  destroy(): void {
    this.stopTutorial();
    this.voice.dispose();
    this.views.forEach((v) => gsap.killTweensOf([v.body, v.root.scale]));
    this.container.destroy({ children: true });
  }
}

