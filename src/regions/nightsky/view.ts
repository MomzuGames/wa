import gsap from 'gsap';
import { Container, FederatedPointerEvent, Graphics } from 'pixi.js';
import type { ClueTier, LevelScene, ShellContext } from '../types';
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

  introLines(): string[] {
    const lines = [
      isTouch() ? 'Touch a star and slide through every line without lifting your finger.' : 'Press on a star and drag through every line without letting go.',
      'A line lights only when you drag along it to the star at its other end.',
      'Each line can be used once. Drag back to the previous star to undo.',
      'Let go before every line is lit and the stroke fades: try again.',
    ];
    if (this.level.chapter === 1) lines.push('When two stars have an odd number of lines, the stroke must start at one and end at the other.');
    if (this.level.edges.some((e) => e.oneWay)) lines.push('Shimmering lines can only be crossed the way the shimmer travels.');
    if (this.level.edges.some((e) => e.required === 2)) lines.push('Brighter double lines must be traced twice.');
    if (this.level.order?.length) lines.push('Stars with dots beneath them must be reached in order: one dot first, then two, then three.');
    return lines;
  }

  // Intro card: a light traces a small triangle of stars; one-way and double lines appear when relevant.
  introGlyph(): Container {
    const root = new Container();
    const r = 34;
    const pts = [
      { x: 0, y: -r },
      { x: r * 0.95, y: r * 0.6 },
      { x: -r * 0.95, y: r * 0.6 },
    ];
    const hasOneWay = this.level.edges.some((e) => e.oneWay);
    const hasDouble = this.level.edges.some((e) => e.required === 2);
    const hasOrder = (this.level.order?.length ?? 0) > 0;
    const lines = new Graphics();
    const lit = new Graphics();
    lit.filters = [createGlow(this.accent, { distance: 10, strength: 1.2, quality: 0.3 })];
    const stars = new Graphics();
    pts.forEach((p, i) => {
      stars.circle(p.x, p.y, 4).fill({ color: palette.pearl });
      // The demo traces 0 -> 1 -> 2, so dots mark stars 1 and 2 as "first" and "second".
      if (hasOrder && i > 0) for (let k = 0; k < i; k++) stars.circle(p.x + (k - (i - 1) / 2) * 6, p.y + 12, 1.8).fill({ color: palette.pearl, alpha: 0.7 });
    });
    const cursor = new Graphics().circle(0, 0, 6).fill({ color: palette.pearl, alpha: 0.8 });
    root.addChild(lines, lit, stars, cursor);
    const drawLines = (shimmerT: number) => {
      lines.clear();
      for (let i = 0; i < 3; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % 3]!;
        lines.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: palette.dim, width: 2, alpha: hasDouble && i === 0 ? 0.7 : 0.4 });
        if (hasDouble && i === 0) {
          lines.moveTo(a.x + 4, a.y + 2).lineTo(b.x + 4, b.y + 2).stroke({ color: palette.dim, width: 1, alpha: 0.5 });
        }
        if (hasOneWay && i === 1) {
          lines.circle(a.x + (b.x - a.x) * shimmerT, a.y + (b.y - a.y) * shimmerT, 1.8).fill({ color: this.accent, alpha: 0.7 });
        }
      }
    };
    const state = { t: 0, shimmer: 0 };
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.8 });
    tl.to(state, {
      t: 3,
      duration: 2.1,
      ease: 'none',
      onUpdate: () => {
        const seg = Math.min(2, Math.floor(state.t));
        const f = state.t - seg;
        const a = pts[seg]!;
        const b = pts[(seg + 1) % 3]!;
        cursor.position.set(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
        lit.clear();
        for (let i = 0; i < seg; i++) {
          const p = pts[i]!;
          const q = pts[(i + 1) % 3]!;
          lit.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ color: this.accent, width: 3, cap: 'round' });
        }
        lit.moveTo(a.x, a.y).lineTo(cursor.x, cursor.y).stroke({ color: this.accent, width: 3, cap: 'round' });
      },
    }).to(lit, { alpha: 0, duration: 0.4 }).set(lit, { alpha: 1 }).set(state, { t: 0 });
    const shimmer = gsap.to(state, { shimmer: 1, duration: 2.4, ease: 'none', repeat: -1, onUpdate: () => drawLines(state.shimmer) });
    root.on('destroyed', () => {
      tl.kill();
      shimmer.kill();
    });
    drawLines(0);
    return root;
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
