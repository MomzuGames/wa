import gsap from 'gsap';
import { Container, Graphics } from 'pixi.js';
import type { ClueTier, IntroPage, LevelScene, ShellContext } from '../types';
import { alphas, palette } from '../../design/palette';
import { durations, easings, reducedMotion, scaled } from '../../design/motion';
import { isTouch, layout, puzzleArea } from '../../design/layout';
import { createGlow } from '../../fx/glow';
import { GhostHand } from '../../ui/ghostHand';
import { liftFinger, makeFinger, tapAt } from '../../ui/introGlyphs';
import { COLOR_NAMES, DIR_DELTA, LEMON, ORIENTATIONS, type PieceKind, type PrismLevel, ROSE, SKY, type Segment, isSolved, trace } from './model';
import { ghostClue, lockClue, routeClue } from './clues';
import { createCrystalVoice, type CrystalVoice } from './sound';

const prismStyle = {
  maxCell: 76,
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
    const fit = Math.min(area.width / this.level.width, area.height / this.level.height);
    this.cell = Math.min(prismStyle.maxCell, fit);
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

  // Draws a piece's body and colour marks: shared by the board and the instruction pages.
  private paintPiece(body: Graphics, glyph: Graphics, kind: PieceKind, color: number, orient: number, s: number): void {
    const half = s / 2;
    switch (kind) {
      case 'emitter': {
        const [dx, dy] = DIR_DELTA[orient]!;
        const tint = colorOf(color);
        // A shard pointing along its beam.
        body.moveTo(dx * half * 0.7, dy * half * 0.7);
        body.lineTo(-dy * half * 0.35 - dx * half * 0.4, dx * half * 0.35 - dy * half * 0.4);
        body.lineTo(dy * half * 0.35 - dx * half * 0.4, -dx * half * 0.35 - dy * half * 0.4);
        body.closePath().fill({ color: tint, alpha: 0.9 });
        body.filters = [createGlow(tint, { distance: 12, strength: 1.2, quality: 0.3 })];
        break;
      }
      case 'mirror':
      case 'splitter':
      case 'dichroic': {
        const o = orient;
        const sign = o === 0 ? -1 : 1; // '/' rises to the right, '\' falls
        const len = half * 0.7;
        if (kind === 'dichroic') {
          // A tinted mirror: its own colour bounces, the rest passes.
          const tint = colorOf(color);
          body.moveTo(-len, -sign * len).lineTo(len, sign * len).stroke({ color: tint, width: 4, cap: 'round', alpha: 0.85 });
          body.moveTo(-len, -sign * len).lineTo(len, sign * len).stroke({ color: palette.pearl, width: 1, cap: 'round', alpha: 0.5 });
        } else if (kind === 'mirror') {
          body.moveTo(-len, -sign * len).lineTo(len, sign * len).stroke({ color: palette.pearl, width: 3.5, cap: 'round', alpha: 0.9 });
        } else {
          const off = 3;
          body.moveTo(-len - off * sign, -sign * len + off).lineTo(len - off * sign, sign * len + off).stroke({ color: palette.pearl, width: 2, cap: 'round', alpha: 0.75 });
          body.moveTo(-len + off * sign, -sign * len - off).lineTo(len + off * sign, sign * len - off).stroke({ color: palette.pearl, width: 2, cap: 'round', alpha: 0.75 });
        }
        break;
      }
      case 'filter': {
        const tint = colorOf(color);
        body.roundRect(-half * 0.42, -half * 0.42, half * 0.84, half * 0.84, 4).fill({ color: tint, alpha: 0.18 }).stroke({ color: tint, width: 1.5, alpha: 0.8 });
        break;
      }
      case 'blocker':
        body.roundRect(-half * 0.5, -half * 0.5, half, half, half * 0.3).fill({ color: palette.ink }).stroke({ color: palette.dim, width: 1.5 });
        break;
      case 'target': {
        const tint = colorOf(color);
        body.moveTo(0, -half * 0.6).lineTo(half * 0.45, 0).lineTo(0, half * 0.6).lineTo(-half * 0.45, 0).closePath().stroke({ color: tint, width: 1.5, alpha: 0.9 });
        // Colour-blind glyphs beneath the crystal: circle = rose, triangle = sky, square = lemon.
        const glyphs: number[] = [];
        if (color & ROSE) glyphs.push(ROSE);
        if (color & SKY) glyphs.push(SKY);
        if (color & LEMON) glyphs.push(LEMON);
        const gs = prismStyle.glyphSize;
        glyphs.forEach((m, k) => {
          const gx = (k - (glyphs.length - 1) / 2) * gs * 3;
          const gy = half * 0.82;
          if (m === ROSE) glyph.circle(gx, gy, gs).fill({ color: palette.rose });
          else if (m === SKY) glyph.moveTo(gx, gy - gs).lineTo(gx + gs, gy + gs).lineTo(gx - gs, gy + gs).closePath().fill({ color: palette.sky });
          else glyph.rect(gx - gs, gy - gs, gs * 2, gs * 2).fill({ color: palette.lemon });
        });
        break;
      }
    }
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
    this.paintPiece(v.body, v.glyph, p.kind, p.color, this.orients[i]!, s);
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

  // ----- instruction pages -----

  private miniPiece(kind: PieceKind, color: number, orient: number, s: number, ringed = false): { root: Container; body: Graphics } {
    const root = new Container();
    const ring = new Graphics();
    if (ringed) ring.circle(0, 0, s * 0.4).stroke({ color: palette.dim, width: 1, alpha: prismStyle.ringAlpha });
    const body = new Graphics();
    const glyph = new Graphics();
    this.paintPiece(body, glyph, kind, color, orient, s);
    root.addChild(ring, body, glyph);
    return { root, body };
  }

  private crystalFill(s: number, got: number, want: number): Graphics {
    const half = s / 2;
    const g = new Graphics();
    if (got === 0) return g;
    const exact = got === want;
    g.moveTo(0, -half * 0.6).lineTo(half * 0.45, 0).lineTo(0, half * 0.6).lineTo(-half * 0.45, 0).closePath().fill({ color: colorOf(got), alpha: exact ? 0.85 : 0.35 });
    if (exact) g.filters = [createGlow(colorOf(got), { distance: 16, strength: 1.4, quality: 0.3 })];
    return g;
  }

  private beamLine(g: Graphics, from: { x: number; y: number }, to: { x: number; y: number }, color: number, alpha: number = prismStyle.beamAlpha): void {
    g.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ color: colorOf(color), width: prismStyle.beamWidth, alpha, cap: 'round' });
  }

  introPages(): IntroPage[] {
    const s = 44;
    const pages: IntroPage[] = [];
    const has = (kind: PieceKind) => this.level.pieces.some((p) => p.kind === kind);
    // 1. Turn a ringed mirror so the beam reaches the crystal.
    pages.push({
      caption: `${isTouch() ? 'Tap' : 'Click'} a piece with a ring around it to turn it, and guide the beam to every crystal. Pieces without a ring are fixed.`,
      glyph: () => {
        const root = new Container();
        const beam = new Graphics();
        const emitter = this.miniPiece('emitter', SKY, 1, s);
        emitter.root.x = -s * 2;
        const mirror = this.miniPiece('mirror', 0, 0, s, true);
        const target = this.miniPiece('target', SKY, 0, s);
        target.root.y = s * 1.6;
        const fill = new Container();
        fill.y = s * 1.6;
        const finger = makeFinger();
        root.addChild(beam, emitter.root, mirror.root, target.root, fill, finger);
        const draw = (turned: boolean) => {
          beam.clear();
          this.beamLine(beam, { x: -s * 1.6, y: 0 }, { x: 0, y: 0 }, SKY);
          if (turned) this.beamLine(beam, { x: 0, y: 0 }, { x: 0, y: s * 1.3 }, SKY);
          else this.beamLine(beam, { x: 0, y: 0 }, { x: 0, y: -s * 1.6 }, SKY, 0.5);
          fill.removeChildren().forEach((ch) => ch.destroy());
          if (turned) fill.addChild(this.crystalFill(s, SKY, SKY));
        };
        draw(false);
        const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.2 });
        tapAt(tl, finger, 0, 0, 0.8)
          .to(mirror.body, { rotation: Math.PI / 2, duration: prismStyle.turnSeconds, ease: easings.tileSnap, onComplete: () => draw(true) }, '<');
        liftFinger(tl, finger);
        tl.call(() => draw(false), undefined, '+=1.4').set(mirror.body, { rotation: 0 });
        root.on('destroyed', () => tl.kill());
        return root;
      },
    });
    // 2. What a beam does.
    pages.push({
      caption: 'A beam travels straight through empty cells, bounces off a mirror, and stops at a crystal, a stone or the edge of the cave.',
      glyph: () => {
        const root = new Container();
        const beam = new Graphics();
        const emitter = this.miniPiece('emitter', ROSE, 1, s);
        emitter.root.position.set(-s * 2, -s * 0.7);
        const stone = this.miniPiece('blocker', 0, 0, s);
        stone.root.position.set(s * 1.2, -s * 0.7);
        const emitter2 = this.miniPiece('emitter', SKY, 1, s);
        emitter2.root.position.set(-s * 2, s * 0.7);
        const mirror = this.miniPiece('mirror', 0, 1, s);
        mirror.root.position.set(0, s * 0.7);
        root.addChild(beam, emitter.root, stone.root, emitter2.root, mirror.root);
        const state = { p: 0 };
        const draw = () => {
          beam.clear();
          const p = state.p;
          // The rose beam runs until the stone; the sky beam bounces down off the mirror and leaves.
          this.beamLine(beam, { x: -s * 1.6, y: -s * 0.7 }, { x: -s * 1.6 + Math.min(p, 1) * (s * 2.4), y: -s * 0.7 }, ROSE);
          this.beamLine(beam, { x: -s * 1.6, y: s * 0.7 }, { x: -s * 1.6 + Math.min(p, 1) * (s * 1.6), y: s * 0.7 }, SKY);
          if (p > 1) this.beamLine(beam, { x: 0, y: s * 0.7 }, { x: 0, y: s * 0.7 + (p - 1) * s * 1.2 }, SKY);
        };
        const tw = gsap.to(state, { p: 2, duration: 1.6, ease: 'none', repeat: -1, repeatDelay: 1.2, onUpdate: draw });
        root.on('destroyed', () => tw.kill());
        return root;
      },
    });
    // 3. Colour marks.
    pages.push({
      caption: 'A crystal lights fully only when it receives exactly the colour its marks show. The wrong colour leaves it dull.',
      glyph: () => {
        const root = new Container();
        const beam = new Graphics();
        const good = this.miniPiece('target', SKY, 0, s);
        good.root.x = -s * 1.2;
        const bad = this.miniPiece('target', ROSE, 0, s);
        bad.root.x = s * 1.2;
        const fills = new Container();
        root.addChild(beam, good.root, bad.root, fills);
        const state = { p: 0 };
        const draw = () => {
          beam.clear();
          const y0 = -s * 1.6;
          const reach = Math.min(state.p, 1) * (s * 1.6 - s * 0.35);
          this.beamLine(beam, { x: -s * 1.2, y: y0 }, { x: -s * 1.2, y: y0 + reach }, SKY);
          this.beamLine(beam, { x: s * 1.2, y: y0 }, { x: s * 1.2, y: y0 + reach }, SKY);
          fills.removeChildren().forEach((ch) => ch.destroy());
          if (state.p >= 1) {
            const a = this.crystalFill(s, SKY, SKY);
            a.x = -s * 1.2;
            const b = this.crystalFill(s, SKY, ROSE);
            b.x = s * 1.2;
            fills.addChild(a, b);
          }
        };
        const tw = gsap.to(state, { p: 1, duration: 1, ease: 'none', repeat: -1, repeatDelay: 2, onUpdate: draw });
        root.on('destroyed', () => tw.kill());
        return root;
      },
    });
    // 4. Splitter.
    if (has('splitter')) {
      pages.push({
        caption: 'A double line is a splitter: half the beam passes straight through, the other half bounces.',
        glyph: () => this.legendGlyph('splitter', SKY, s),
      });
    }
    // 5. Mixing.
    if (this.level.chapter >= 2 && this.level.pieces.some((p) => p.kind === 'target' && (p.color & (p.color - 1)) !== 0)) {
      pages.push({
        caption: 'Two beams meeting at a crystal mix their colours: pink and blue make violet, blue and yellow make green, pink and yellow make peach.',
        glyph: () => {
          const root = new Container();
          const beam = new Graphics();
          const target = this.miniPiece('target', ROSE | SKY, 0, s);
          const fills = new Container();
          root.addChild(beam, target.root, fills);
          const state = { p: 0 };
          const draw = () => {
            beam.clear();
            const p = Math.min(state.p, 1);
            this.beamLine(beam, { x: -s * 2, y: 0 }, { x: -s * 2 + p * (s * 2 - s * 0.35), y: 0 }, ROSE);
            this.beamLine(beam, { x: 0, y: -s * 1.8 }, { x: 0, y: -s * 1.8 + p * (s * 1.8 - s * 0.5) }, SKY);
            fills.removeChildren().forEach((ch) => ch.destroy());
            if (state.p >= 1) fills.addChild(this.crystalFill(s, ROSE | SKY, ROSE | SKY));
          };
          const tw = gsap.to(state, { p: 1, duration: 1, ease: 'none', repeat: -1, repeatDelay: 2, onUpdate: draw });
          root.on('destroyed', () => tw.kill());
          return root;
        },
      });
    }
    // 6. Filter.
    if (has('filter')) {
      const sample = this.level.pieces.find((p) => p.kind === 'filter')!;
      pages.push({
        caption: 'A tinted square is a filter: only its own colour passes through it. Every other colour is stopped.',
        glyph: () => this.legendGlyph('filter', sample.color, s),
      });
    }
    // 7. Dichroic mirror.
    if (has('dichroic')) {
      const sample = this.level.pieces.find((p) => p.kind === 'dichroic')!;
      pages.push({
        caption: 'A coloured mirror bounces only its own colour. Every other colour passes straight through it, so one mixed beam can be split by colour.',
        glyph: () => this.legendGlyph('dichroic', sample.color, s),
      });
    }
    return pages;
  }

  // A special piece with a beam arriving from the left, animated so its behaviour is clear.
  private legendGlyph(kind: 'splitter' | 'filter' | 'dichroic', color: number, s: number): Container {
    const root = new Container();
    const beam = new Graphics();
    const piece = this.miniPiece(kind, color, 0, s, kind !== 'filter');
    root.addChild(beam, piece.root);
    const inColor = kind === 'dichroic' ? 7 : kind === 'filter' ? 7 : SKY;
    const state = { p: 0 };
    const draw = () => {
      beam.clear();
      const p = state.p;
      const reach = Math.min(p, 1) * s * 2;
      this.beamLine(beam, { x: -s * 2, y: 0 }, { x: -s * 2 + reach, y: 0 }, inColor);
      if (p > 1) {
        const out = (p - 1) * s * 1.6;
        if (kind === 'splitter') {
          this.beamLine(beam, { x: 0, y: 0 }, { x: out, y: 0 }, SKY, 0.55);
          this.beamLine(beam, { x: 0, y: 0 }, { x: 0, y: -out }, SKY, 0.55);
        } else if (kind === 'filter') {
          this.beamLine(beam, { x: 0, y: 0 }, { x: out, y: 0 }, color);
        } else {
          this.beamLine(beam, { x: 0, y: 0 }, { x: 0, y: -out }, color);
          this.beamLine(beam, { x: 0, y: 0 }, { x: out, y: 0 }, 7 & ~color);
        }
      }
    };
    const tw = gsap.to(state, { p: 2, duration: 1.6, ease: 'none', repeat: -1, repeatDelay: 1.4, onUpdate: draw });
    root.on('destroyed', () => tw.kill());
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

