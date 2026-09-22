import gsap from 'gsap';
import { Container, FederatedPointerEvent, Graphics } from 'pixi.js';
import type { ClueTier, IntroPage, LevelScene, ShellContext } from '../types';
import { alphas, palette } from '../../design/palette';
import { durations, easings, reducedMotion, scaled } from '../../design/motion';
import { isTouch, layout, puzzleArea } from '../../design/layout';
import { createGlow } from '../../fx/glow';
import { GhostHand } from '../../ui/ghostHand';
import { type SkyLevel, type Star, type Stroke, beginStroke, edgeBetween, isComplete, newStroke, orderAllows, traverse, undo } from './model';
import { halfPathClue, nextEdgesClue, oddStarsClue, startClue } from './clues';
import { createNightSkyVoice, type NightSkyVoice } from './sound';

const skyStyle = {
  starRadius: 5,
  starHalo: 11,
  lineWidth: 2,
  litWidth: 3,
  edgeAlpha: 0.32,
  doubleEdgeAlpha: 0.7,
  halfTracedAlpha: 0.5,
  snapFraction: 0.085,
  shimmerSpeed: 0.35,
  driftAmount: 0.018,
  driftSpeed: 0.35,
  unravelStep: 0.06,
  replayStep: 0.16,
  clueGhostSeconds: 3,
  tutorialDelay: 1.6,
} as const;

type Handler = () => void;

export class SkyLevelScene implements LevelScene {
  readonly container = new Container();
  private edgesLayer = new Graphics();
  private litLayer = new Graphics();
  private rubber = new Graphics();
  private starsLayer = new Container();
  private starDots: Graphics[] = [];
  private clueLayer = new Graphics();
  private hit = new Graphics();
  private hand: GhostHand | null = null;
  private handlers: Record<'attempt' | 'solved' | 'move', Handler[]> = { attempt: [], solved: [], move: [] };
  private accent = palette.lavender;
  private stroke: Stroke;
  private dragging = false;
  private solved = false;
  private locked = false;
  private time = 0;
  private area = { x: 0, y: 0, size: 1 };
  private snapRadius: number = layout.snapTolerance;
  private voice: NightSkyVoice;
  private phases: number[];
  private pointer = { x: 0, y: 0 };
  private clueRings: number[] = [];
  private clueEdges: number[] = [];
  private tutorialTimer: gsap.core.Tween | null = null;
  private undoArmed = true;

  constructor(
    private ctx: ShellContext,
    private level: SkyLevel,
    private isTutorial: boolean,
  ) {
    this.stroke = newStroke(level);
    this.voice = createNightSkyVoice(ctx.audio);
    this.phases = level.stars.map((_, i) => ctx.rng.next() * Math.PI * 2 + i);
    this.litLayer.filters = [createGlow(this.accent, { distance: 14, strength: 1.4, quality: 0.3 })];
    this.starsLayer.filters = [createGlow(this.accent, { distance: 10, strength: 0.8, quality: 0.3 })];
    this.edgesLayer.eventMode = 'none';
    this.litLayer.eventMode = 'none';
    this.rubber.eventMode = 'none';
    this.clueLayer.eventMode = 'none';
    this.starsLayer.eventMode = 'none';
    this.container.addChild(this.edgesLayer, this.clueLayer, this.litLayer, this.rubber, this.starsLayer);
    level.stars.forEach(() => {
      const dot = new Graphics();
      this.starDots.push(dot);
      this.starsLayer.addChild(dot);
    });
    // One full-screen hit area so a press anywhere near a star starts a stroke.
    this.hit.eventMode = 'static';
    this.hit.on('pointerdown', (e: FederatedPointerEvent) => this.onDown(e));
    this.hit.on('globalpointermove', (e: FederatedPointerEvent) => this.onMove(e));
    this.hit.on('pointerup', () => this.onUp());
    this.hit.on('pointerupoutside', () => this.onUp());
    this.container.addChildAt(this.hit, 0);
    this.layout(ctx.width, ctx.height);
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

  layout(width: number, height: number): void {
    const area = puzzleArea(width, height);
    this.area = { x: area.x, y: area.y, size: area.width };
    this.snapRadius = Math.max(layout.snapTolerance, area.width * skyStyle.snapFraction);
    this.hit.clear().rect(0, 0, width, height).fill({ color: palette.pearl, alpha: 0.001 });
    this.redrawAll();
  }

  resize(width: number, height: number): void {
    this.layout(width, height);
  }

  private starPos(i: number): { x: number; y: number } {
    const s: Star = this.level.stars[i]!;
    let dx = 0;
    let dy = 0;
    if (this.level.drift && !reducedMotion()) {
      const p = this.phases[i]!;
      dx = Math.sin(this.time * skyStyle.driftSpeed + p) * skyStyle.driftAmount;
      dy = Math.cos(this.time * skyStyle.driftSpeed * 0.8 + p) * skyStyle.driftAmount;
    }
    return { x: this.area.x + (s.x + dx) * this.area.size, y: this.area.y + (s.y + dy) * this.area.size };
  }

  private redrawAll(): void {
    this.drawEdges();
    this.drawLit();
    this.drawStars();
    this.drawClues();
  }

  private drawEdges(): void {
    const g = this.edgesLayer;
    g.clear();
    this.level.edges.forEach((e, i) => {
      const a = this.starPos(e.a);
      const b = this.starPos(e.b);
      const remaining = this.stroke.remaining[i]!;
      let alpha: number = skyStyle.edgeAlpha;
      if (e.required === 2) alpha = remaining === 2 ? skyStyle.doubleEdgeAlpha : remaining === 1 ? skyStyle.halfTracedAlpha : skyStyle.edgeAlpha;
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: palette.dim, width: skyStyle.lineWidth, alpha, cap: 'round' });
      if (e.required === 2 && remaining > 0) {
        // Double edges show a faint second line beside the first.
        const nx = -(b.y - a.y);
        const ny = b.x - a.x;
        const len = Math.hypot(nx, ny) || 1;
        const off = 4;
        g.moveTo(a.x + (nx / len) * off, a.y + (ny / len) * off)
          .lineTo(b.x + (nx / len) * off, b.y + (ny / len) * off)
          .stroke({ color: palette.dim, width: 1, alpha: alpha * 0.7, cap: 'round' });
      }
      if (e.oneWay && remaining > 0) {
        // A slow shimmer that travels from a to b marks the allowed direction.
        for (let k = 0; k < 3; k++) {
          const t = ((this.time * skyStyle.shimmerSpeed + k / 3) % 1 + 1) % 1;
          g.circle(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 1.8).fill({ color: this.accent, alpha: 0.5 * (1 - Math.abs(t - 0.5) * 1.2) });
        }
      }
    });
  }

  private drawLit(): void {
    const g = this.litLayer;
    g.clear();
    for (const step of this.stroke.path) {
      const a = this.starPos(step.from);
      const b = this.starPos(step.to);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: this.accent, width: skyStyle.litWidth, cap: 'round' });
    }
    this.rubber.clear();
    if (this.dragging && this.stroke.current !== null) {
      const a = this.starPos(this.stroke.current);
      this.rubber.moveTo(a.x, a.y).lineTo(this.pointer.x, this.pointer.y).stroke({ color: this.accent, width: 1, alpha: 0.3 });
    }
  }

  private drawStars(): void {
    this.level.stars.forEach((_, i) => {
      const p = this.starPos(i);
      const dot = this.starDots[i]!;
      const visited = this.stroke.path.some((s) => s.to === i || s.from === i);
      const isCurrent = this.stroke.current === i;
      dot.clear();
      dot.circle(p.x, p.y, skyStyle.starHalo).fill({ color: this.accent, alpha: isCurrent ? 0.28 : 0.1 });
      dot.circle(p.x, p.y, skyStyle.starRadius).fill({ color: visited || isCurrent ? this.accent : palette.pearl, alpha: visited || isCurrent ? 1 : 0.7 });
      // Ordered stars show their place in the sequence as dots beneath them.
      const position = (this.level.order ?? []).indexOf(i);
      if (position >= 0) {
        const reached = position < this.stroke.reached;
        for (let k = 0; k <= position; k++) {
          dot.circle(p.x + (k - position / 2) * 7, p.y + skyStyle.starHalo + 7, 2).fill({ color: reached ? this.accent : palette.pearl, alpha: reached ? 0.9 : 0.6 });
        }
      }
    });
  }

  private drawClues(): void {
    const g = this.clueLayer;
    g.clear();
    for (const i of this.clueRings) {
      const p = this.starPos(i);
      g.circle(p.x, p.y, skyStyle.starHalo + 6).stroke({ color: this.accent, width: 1, alpha: alphas.hudIdle });
    }
    for (const e of this.clueEdges) {
      const edge = this.level.edges[e]!;
      const a = this.starPos(edge.a);
      const b = this.starPos(edge.b);
      const pulse = 0.25 + 0.2 * Math.sin(this.time * 4);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: this.accent, width: skyStyle.litWidth, alpha: pulse, cap: 'round' });
    }
  }

  private nearestStar(x: number, y: number): number {
    let best = -1;
    let bestD = this.snapRadius;
    for (let i = 0; i < this.level.stars.length; i++) {
      const p = this.starPos(i);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  private onDown(e: FederatedPointerEvent): void {
    if (this.solved || this.locked) return;
    const local = this.container.toLocal(e.global);
    const star = this.nearestStar(local.x, local.y);
    if (star < 0) return;
    this.stopTutorial();
    this.pointer = local;
    this.dragging = true;
    this.stroke = newStroke(this.level);
    if (!beginStroke(this.level, this.stroke, star)) {
      // An ordered star that is not next: a soft refusal instead of a stroke.
      this.dragging = false;
      this.voice.unravel();
      gsap.fromTo(this.starDots[star]!, { alpha: 0.3 }, { alpha: 1, duration: durations.microFeedback * 3 });
      return;
    }
    this.clueEdges = [];
    this.redrawAll();
  }

  private onMove(e: FederatedPointerEvent): void {
    if (!this.dragging || this.solved) return;
    this.pointer = this.container.toLocal(e.global);
    const star = this.nearestStar(this.pointer.x, this.pointer.y);
    if (star < 0) {
      this.undoArmed = true;
      this.drawLit();
      return;
    }
    const last = this.stroke.path[this.stroke.path.length - 1];
    if (last && star === last.from && this.undoArmed) {
      undo(this.stroke);
      this.undoArmed = false;
      this.emit('move');
      this.redrawAll();
      return;
    }
    if (star !== this.stroke.current && orderAllows(this.level, this.stroke, star) && edgeBetween(this.level, this.stroke.current!, star, this.stroke.remaining) >= 0) {
      traverse(this.level, this.stroke, star);
      this.undoArmed = false;
      this.emit('move');
      this.voice.step(this.stroke.path.length - 1);
      this.redrawAll();
      if (isComplete(this.stroke)) {
        this.solved = true;
        this.dragging = false;
        this.rubber.clear();
        this.emit('solved');
      }
    }
  }

  private onUp(): void {
    if (!this.dragging || this.solved) return;
    this.dragging = false;
    this.rubber.clear();
    if (this.stroke.path.length === 0) {
      this.stroke.current = null;
      this.drawStars();
      return;
    }
    this.emit('attempt');
    this.voice.unravel();
    this.unravel();
  }

  // Failed strokes gently retreat back along the path and fade.
  private unravel(): void {
    this.locked = true;
    const steps = this.stroke.path.length;
    const state = { n: steps };
    gsap.to(state, {
      n: 0,
      duration: scaled(skyStyle.unravelStep) * steps + 0.2,
      ease: easings.ambient,
      onUpdate: () => {
        while (this.stroke.path.length > Math.ceil(state.n)) undo(this.stroke);
        this.redrawAll();
      },
      onComplete: () => {
        this.stroke = newStroke(this.level);
        this.locked = false;
        this.redrawAll();
        if (this.isTutorial) this.scheduleTutorial();
      },
    });
  }

  update(dt: number): void {
    this.time += dt;
    const animated = this.level.drift || this.level.edges.some((e) => e.oneWay) || this.clueEdges.length > 0;
    if (animated) this.redrawAll();
  }

  restart(): void {
    if (this.solved) return;
    gsap.killTweensOf(this.stroke);
    this.locked = false;
    this.dragging = false;
    this.stroke = newStroke(this.level);
    this.clueEdges = [];
    this.clueRings = [];
    this.redrawAll();
    if (this.isTutorial) this.scheduleTutorial();
  }

  showClue(tier: ClueTier): string | void {
    if (this.solved) return;
    let caption: string | undefined;
    switch (tier) {
      case 1: {
        const star = startClue(this.level, this.stroke);
        if (star === null) return;
        const dot = this.starDots[star]!;
        gsap.to(dot, { alpha: 0.3, duration: durations.microFeedback * 2, yoyo: true, repeat: 7, ease: easings.ambient });
        caption = this.stroke.current === null ? 'Begin your stroke from the pulsing star.' : 'The pulsing star is where to continue from.';
        break;
      }
      case 2:
        this.clueEdges = nextEdgesClue(this.level, this.stroke);
        caption = this.stroke.current === null ? 'Start at the shimmering lines and follow them.' : 'Follow the shimmering lines next.';
        break;
      case 3:
        this.clueRings = oddStarsClue(this.level);
        caption = this.clueRings.length ? 'Ringed stars have an odd number of lines: a stroke must start or end at one.' : 'Every star has an even number of lines: you can start anywhere.';
        break;
      case 4: {
        const edges = halfPathClue(this.level, this.stroke);
        this.clueEdges = edges;
        gsap.delayedCall(skyStyle.clueGhostSeconds, () => {
          this.clueEdges = this.clueEdges === edges ? [] : this.clueEdges;
          this.redrawAll();
        });
        caption = 'For a moment, half of a working path shimmers.';
        break;
      }
    }
    this.redrawAll();
    return caption;
  }

  private scheduleTutorial(): void {
    this.stopTutorial();
    this.tutorialTimer = gsap.delayedCall(skyStyle.tutorialDelay, () => {
      if (!this.hand) {
        this.hand = new GhostHand();
        this.container.addChild(this.hand);
      }
      this.hand.demoPath(this.level.solution.map((i) => this.starPos(i)));
    });
  }

  private stopTutorial(): void {
    this.tutorialTimer?.kill();
    this.tutorialTimer = null;
    this.hand?.stop();
  }

  playCompletion(): Promise<void> {
    this.stopTutorial();
    const steps = this.stroke.path.length;
    const stepSeconds = scaled(skyStyle.replayStep);
    this.voice.replay(steps, stepSeconds);
    const total = scaled(durations.completion);

    // Replay: each traced line flashes brighter in order, then the whole figure lifts away.
    const flash = new Graphics();
    flash.filters = [createGlow(palette.pearl, { distance: 16, strength: 1.6, quality: 0.3 })];
    flash.eventMode = 'none';
    this.container.addChild(flash);
    const state = { k: 0 };
    gsap.to(state, {
      k: steps,
      duration: stepSeconds * steps,
      ease: 'none',
      onUpdate: () => {
        flash.clear();
        const upto = Math.floor(state.k);
        for (let i = 0; i < upto; i++) {
          const s = this.stroke.path[i]!;
          const a = this.starPos(s.from);
          const b = this.starPos(s.to);
          flash.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: palette.pearl, width: skyStyle.litWidth, alpha: 0.8, cap: 'round' });
        }
      },
    });
    gsap.to(this.container, {
      y: -this.area.size * 0.12,
      alpha: 0,
      duration: total * 0.6,
      delay: stepSeconds * steps + 0.4,
      ease: easings.ambient,
    });
    for (let i = 0; i < 30; i++) {
      const p = this.starPos(this.ctx.rng.int(0, this.level.stars.length - 1));
      this.ctx.particles.emit({
        x: p.x,
        y: p.y,
        color: this.accent,
        vx: (this.ctx.rng.next() - 0.5) * 12,
        vy: -12 - this.ctx.rng.next() * 25,
        life: 1.6 + this.ctx.rng.next() * 1.2,
        alphaFrom: 0.6,
        scaleFrom: 0.35,
        scaleTo: 0.05,
      });
    }
    return new Promise((resolve) => gsap.delayedCall(stepSeconds * steps + total * 0.7, resolve));
  }

  destroy(): void {
    this.stopTutorial();
    this.voice.dispose();
    this.container.destroy({ children: true });
  }

  // ----- instruction pages -----

  // A miniature constellation for the instruction card, with a cursor that can trace it.
  private miniSky(
    pts: Array<{ x: number; y: number }>,
    edges: Array<{ a: number; b: number; oneWay?: boolean; double?: boolean }>,
    opts: { odd?: number[]; order?: number[] } = {},
  ): {
    root: Container;
    cursor: Graphics;
    stars: Graphics;
    traced: Map<string, number>;
    redraw: (shimmer: number) => void;
    trace: (tl: gsap.core.Timeline, from: number, to: number, seconds?: number) => gsap.core.Timeline;
    untrace: (tl: gsap.core.Timeline, from: number, to: number, seconds?: number) => gsap.core.Timeline;
    fade: (tl: gsap.core.Timeline) => gsap.core.Timeline;
  } {
    const root = new Container();
    const lines = new Graphics();
    const lit = new Graphics();
    lit.filters = [createGlow(this.accent, { distance: 10, strength: 1.2, quality: 0.3 })];
    const stars = new Graphics();
    const cursor = new Graphics().circle(0, 0, 6).fill({ color: palette.pearl, alpha: 0.8 });
    cursor.alpha = 0;
    root.addChild(lines, lit, stars, cursor);
    const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
    const traced = new Map<string, number>();
    const partial = { from: -1, to: -1, f: 0 };
    let odd = 0;
    const drawStars = () => {
      stars.clear();
      pts.forEach((p, i) => {
        stars.circle(p.x, p.y, 4).fill({ color: palette.pearl });
        if (opts.odd?.includes(i)) stars.circle(p.x, p.y, 9 + Math.sin(odd) * 1.5).stroke({ color: this.accent, width: 1, alpha: 0.5 + 0.3 * Math.sin(odd) });
        const dots = opts.order ? opts.order.indexOf(i) : -1;
        if (dots >= 0) for (let k = 0; k <= dots; k++) stars.circle(p.x + (k - dots / 2) * 6, p.y + 12, 1.8).fill({ color: palette.pearl, alpha: 0.7 });
      });
    };
    const redraw = (shimmer: number) => {
      lines.clear();
      lit.clear();
      for (const e of edges) {
        const a = pts[e.a]!;
        const b = pts[e.b]!;
        const done = traced.get(key(e.a, e.b)) ?? 0;
        const need = e.double ? 2 : 1;
        const alpha = e.double ? (done === 0 ? skyStyle.doubleEdgeAlpha : done === 1 ? skyStyle.halfTracedAlpha : 0.32) : 0.4;
        lines.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: palette.dim, width: 2, alpha });
        if (e.double && done < 2) lines.moveTo(a.x + 4, a.y + 3).lineTo(b.x + 4, b.y + 3).stroke({ color: palette.dim, width: 1, alpha: 0.5 });
        if (e.oneWay && done < need) lines.circle(a.x + (b.x - a.x) * shimmer, a.y + (b.y - a.y) * shimmer, 1.8).fill({ color: this.accent, alpha: 0.7 });
        if (done >= need) lit.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: this.accent, width: 3, cap: 'round' });
        else if (done === 1 && e.double) lit.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: this.accent, width: 3, cap: 'round', alpha: 0.45 });
      }
      if (partial.from >= 0) {
        const a = pts[partial.from]!;
        const b = pts[partial.to]!;
        lit.moveTo(a.x, a.y).lineTo(a.x + (b.x - a.x) * partial.f, a.y + (b.y - a.y) * partial.f).stroke({ color: this.accent, width: 3, cap: 'round' });
      }
      drawStars();
    };
    const shimmer = { t: 0 };
    const shimmerTween = gsap.to(shimmer, { t: 1, duration: 2.4, ease: 'none', repeat: -1, onUpdate: () => { odd += 0.06; redraw(shimmer.t); } });
    const trace = (tl: gsap.core.Timeline, from: number, to: number, seconds = 0.7) =>
      tl
        .set(cursor, { x: pts[from]!.x, y: pts[from]!.y })
        .to(cursor, { alpha: 1, duration: 0.15 })
        .set(partial, { from, to, f: 0 })
        .to(partial, { f: 1, duration: seconds, ease: 'none', onUpdate: () => { cursor.position.set(pts[from]!.x + (pts[to]!.x - pts[from]!.x) * partial.f, pts[from]!.y + (pts[to]!.y - pts[from]!.y) * partial.f); } })
        .call(() => { traced.set(key(from, to), (traced.get(key(from, to)) ?? 0) + 1); partial.from = -1; redraw(shimmer.t); });
    const untrace = (tl: gsap.core.Timeline, from: number, to: number, seconds = 0.7) =>
      tl
        .call(() => { traced.set(key(from, to), Math.max(0, (traced.get(key(from, to)) ?? 0) - 1)); partial.from = to; partial.to = from; partial.f = 1; redraw(shimmer.t); })
        .to(partial, { f: 0, duration: seconds, ease: 'none', onUpdate: () => { cursor.position.set(pts[to]!.x + (pts[from]!.x - pts[to]!.x) * partial.f, pts[to]!.y + (pts[from]!.y - pts[to]!.y) * partial.f); } })
        .call(() => { partial.from = -1; redraw(shimmer.t); });
    const fade = (tl: gsap.core.Timeline) =>
      tl
        .to(cursor, { alpha: 0, duration: 0.2 })
        .to(lit, { alpha: 0, duration: 0.5, delay: 0.3 })
        .call(() => { traced.clear(); partial.from = -1; redraw(shimmer.t); lit.alpha = 1; });
    root.on('destroyed', () => shimmerTween.kill());
    redraw(0);
    return { root, cursor, stars, traced, redraw, trace, untrace, fade };
  }

  introPages(): IntroPage[] {
    const r = 34;
    const tri = [
      { x: 0, y: -r },
      { x: r * 0.95, y: r * 0.6 },
      { x: -r * 0.95, y: r * 0.6 },
    ];
    const pages: IntroPage[] = [];
    pages.push({
      caption: isTouch()
        ? 'Touch a star and slide through every line without lifting your finger. A line lights only when you reach the star at its other end.'
        : 'Press on a star and drag through every line without letting go. A line lights only when you reach the star at its other end.',
      glyph: () => {
        const sky = this.miniSky(tri, [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 0 }]);
        const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.8, delay: 0.5 });
        sky.trace(tl, 0, 1);
        sky.trace(tl, 1, 2);
        sky.trace(tl, 2, 0);
        tl.to(sky.cursor, { alpha: 0, duration: 0.3, delay: 0.8 });
        sky.fade(tl);
        sky.root.on('destroyed', () => tl.kill());
        return sky.root;
      },
    });
    pages.push({
      caption: 'Each line can be used once. Slide back to the previous star to undo a line. Let go before every line is lit and the whole stroke fades: try again.',
      glyph: () => {
        const sky = this.miniSky(tri, [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 0 }]);
        const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.8, delay: 0.5 });
        sky.trace(tl, 0, 1);
        sky.trace(tl, 1, 2);
        sky.untrace(tl, 1, 2);
        tl.to(sky.cursor, { alpha: 0, duration: 0.2, delay: 0.5 });
        sky.fade(tl);
        sky.root.on('destroyed', () => tl.kill());
        return sky.root;
      },
    });
    if (this.level.chapter === 1) {
      pages.push({
        caption: 'When two stars have an odd number of lines, the stroke must start at one of them and end at the other.',
        glyph: () => {
          const s = 30;
          const pts = [
            { x: -s, y: -s * 0.8 },
            { x: s, y: -s * 0.8 },
            { x: s, y: s * 0.8 },
            { x: -s, y: s * 0.8 },
          ];
          const sky = this.miniSky(pts, [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 3 }, { a: 3, b: 0 }, { a: 0, b: 2 }], { odd: [0, 2] });
          const tl = gsap.timeline({ repeat: -1, repeatDelay: 1, delay: 0.6 });
          sky.trace(tl, 0, 1, 0.5);
          sky.trace(tl, 1, 2, 0.5);
          sky.trace(tl, 2, 3, 0.5);
          sky.trace(tl, 3, 0, 0.5);
          sky.trace(tl, 0, 2, 0.6);
          tl.to(sky.cursor, { alpha: 0, duration: 0.3, delay: 1 });
          sky.fade(tl);
          sky.root.on('destroyed', () => tl.kill());
          return sky.root;
        },
      });
    }
    if (this.level.edges.some((e) => e.oneWay)) {
      pages.push({
        caption: 'A shimmering line can only be crossed the way the shimmer travels. Against it, nothing lights.',
        glyph: () => {
          const pts = [
            { x: -r, y: 0 },
            { x: r, y: 0 },
          ];
          const sky = this.miniSky(pts, [{ a: 0, b: 1, oneWay: true }]);
          const tl = gsap.timeline({ repeat: -1, repeatDelay: 1, delay: 0.5 });
          // The wrong way: the cursor slides but the line stays dark and the star blinks.
          tl.set(sky.cursor, { x: pts[1]!.x, y: pts[1]!.y })
            .to(sky.cursor, { alpha: 1, duration: 0.15 })
            .to(sky.cursor, { x: pts[0]!.x, duration: 0.7, ease: 'none' })
            .to(sky.stars, { alpha: 0.3, duration: 0.12, yoyo: true, repeat: 3 })
            .to(sky.cursor, { alpha: 0, duration: 0.2 });
          sky.trace(tl, 0, 1, 0.7);
          tl.to(sky.cursor, { alpha: 0, duration: 0.3, delay: 0.8 });
          sky.fade(tl);
          sky.root.on('destroyed', () => tl.kill());
          return sky.root;
        },
      });
    }
    if (this.level.edges.some((e) => e.required === 2)) {
      pages.push({
        caption: 'A brighter double line must be traced twice: across, and back again.',
        glyph: () => {
          const pts = [
            { x: -r, y: 0 },
            { x: r, y: 0 },
          ];
          const sky = this.miniSky(pts, [{ a: 0, b: 1, double: true }]);
          const tl = gsap.timeline({ repeat: -1, repeatDelay: 1, delay: 0.5 });
          sky.trace(tl, 0, 1, 0.7);
          sky.trace(tl, 1, 0, 0.7);
          tl.to(sky.cursor, { alpha: 0, duration: 0.3, delay: 0.8 });
          sky.fade(tl);
          sky.root.on('destroyed', () => tl.kill());
          return sky.root;
        },
      });
    }
    if (this.level.order?.length) {
      pages.push({
        caption: 'Stars with dots beneath them must be reached in order: one dot first, then two, then three.',
        glyph: () => {
          const pts = [
            { x: -r * 1.3, y: 0 },
            { x: 0, y: -r * 0.5 },
            { x: r * 1.3, y: 0 },
          ];
          const sky = this.miniSky(pts, [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 0, b: 2 }], { order: [1, 2] });
          const tl = gsap.timeline({ repeat: -1, repeatDelay: 1, delay: 0.5 });
          sky.trace(tl, 0, 1, 0.6);
          sky.trace(tl, 1, 2, 0.6);
          sky.trace(tl, 2, 0, 0.8);
          tl.to(sky.cursor, { alpha: 0, duration: 0.3, delay: 0.8 });
          sky.fade(tl);
          sky.root.on('destroyed', () => tl.kill());
          return sky.root;
        },
      });
    }
    if (this.level.drift) {
      pages.push({
        caption: 'The stars drift slowly here. A line still joins the same two stars wherever they wander.',
        glyph: () => {
          const pts = tri.map((p) => ({ ...p }));
          const sky = this.miniSky(pts, [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 0 }]);
          const state = { t: 0 };
          const drift = gsap.to(state, {
            t: Math.PI * 2,
            duration: 6,
            ease: 'none',
            repeat: -1,
            onUpdate: () => {
              pts.forEach((p, i) => {
                p.x = tri[i]!.x + Math.sin(state.t + i * 2.1) * 7;
                p.y = tri[i]!.y + Math.cos(state.t * 0.8 + i * 1.3) * 7;
              });
            },
          });
          sky.root.on('destroyed', () => drift.kill());
          return sky.root;
        },
      });
    }
    return pages;
  }


  // Dev only: the stored solution as a faint path.
  showSolutionOverlay(): void {
    const g = new Graphics();
    g.eventMode = 'none';
    for (let i = 1; i < this.level.solution.length; i++) {
      const a = this.starPos(this.level.solution[i - 1]!);
      const b = this.starPos(this.level.solution[i]!);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: palette.pearl, width: 1, alpha: 0.15 });
    }
    const start = this.starPos(this.level.solution[0]!);
    g.circle(start.x, start.y, skyStyle.starHalo + 4).stroke({ color: palette.pearl, width: 1, alpha: 0.25 });
    this.container.addChild(g);
  }
}
