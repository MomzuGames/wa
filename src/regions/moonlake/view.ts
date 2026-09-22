import gsap from 'gsap';
import { Container, Graphics } from 'pixi.js';
import type { ClueTier, IntroPage, LevelScene, ShellContext } from '../types';
import { alphas, palette } from '../../design/palette';
import { durations, easings, scaled } from '../../design/motion';
import { layout, puzzleArea } from '../../design/layout';
import { createGlow } from '../../fx/glow';
import { GhostHand } from '../../ui/ghostHand';
import { liftFinger, makeFinger, refuse, tapAt } from '../../ui/introGlyphs';
import { type RippleLevel, affectLists, isLit, press } from './model';
import { countClue, halfClue, nodeClue } from './clues';
import { createMoonVoice, type MoonVoice } from './sound';

const lakeStyle = {
  padRadius: 22,
  minPadRadius: 12,
  edgeAlpha: 0.25,
  darkAlpha: 0.12,
  halfAlpha: 0.45,
  litAlpha: 0.9,
  rippleSeconds: 0.9,
  rippleScale: 3.2,
  clueSeconds: 3,
  tutorialDelay: 1.6,
  dotGap: 12,
  shadowOffset: 4,
  shadowAlpha: 0.45,
} as const;

type Handler = () => void;

interface PadView {
  root: Container;
  shadow: Graphics;
  disc: Graphics;
  ring: Graphics;
  hint: Graphics;
}

export class RippleLevelScene implements LevelScene {
  readonly container = new Container();
  private edges = new Graphics();
  private ripples = new Graphics();
  private dots = new Graphics();
  private padsLayer = new Container();
  private moon = new Graphics();
  private views: PadView[] = [];
  private state: number[];
  private affects: number[][];
  private handlers: Record<'attempt' | 'solved' | 'move', Handler[]> = { attempt: [], solved: [], move: [] };
  private accent = palette.rose;
  private area = { x: 0, y: 0, size: 1 };
  private radius: number = lakeStyle.padRadius;
  private solved = false;
  private time = 0;
  private voice: MoonVoice;
  private hand: GhostHand | null = null;
  private tutorialTimer: gsap.core.Tween | null = null;
  private hinted = new Set<number>();
  private shimmer: { nodes: number[]; until: number } | null = null;
  private countUntil: number | null = null;
  private countValue = 0;
  private live: Array<{ x: number; y: number; t: number }> = [];

  constructor(
    private ctx: ShellContext,
    private level: RippleLevel,
    private isTutorial: boolean,
  ) {
    this.state = level.start.slice();
    this.affects = affectLists(level);
    this.voice = createMoonVoice(ctx.audio);
    this.edges.eventMode = 'none';
    this.ripples.eventMode = 'none';
    this.dots.eventMode = 'none';
    this.moon.eventMode = 'none';
    this.padsLayer.filters = [createGlow(this.accent, { distance: 14, strength: 1, quality: 0.3 })];
    this.container.addChild(this.moon, this.edges, this.ripples, this.padsLayer, this.dots);
    this.buildPads();
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

  private buildPads(): void {
    this.level.nodes.forEach((_, i) => {
      const root = new Container();
      const shadow = new Graphics();
      const ring = new Graphics();
      const disc = new Graphics();
      const hint = new Graphics();
      root.addChild(hint, shadow, ring, disc);
      root.eventMode = 'static';
      root.cursor = 'pointer';
      root.on('pointertap', () => this.pressPad(i));
      this.padsLayer.addChild(root);
      this.views.push({ root, shadow, disc, ring, hint });
    });
  }

  private padPos(i: number): { x: number; y: number } {
    const n = this.level.nodes[i]!;
    return { x: this.area.x + n.x * this.area.size, y: this.area.y + n.y * this.area.size };
  }

  layout(width: number, height: number): void {
    const area = puzzleArea(width, height);
    this.area = { x: area.x, y: area.y, size: area.width };
    // Pads shrink on crowded ponds so neighbours never overlap.
    let minDist = Infinity;
    for (const [a, b] of this.level.edges) {
      const pa = this.level.nodes[a]!;
      const pb = this.level.nodes[b]!;
      minDist = Math.min(minDist, Math.hypot(pa.x - pb.x, pa.y - pb.y) * this.area.size);
    }
    this.radius = Math.max(lakeStyle.minPadRadius, Math.min(lakeStyle.padRadius, minDist * 0.34));
    this.edges.clear();
    for (const [a, b] of this.level.edges) {
      const pa = this.padPos(a);
      const pb = this.padPos(b);
      this.edges.moveTo(pa.x, pa.y).lineTo(pb.x, pb.y);
    }
    this.edges.stroke({ color: palette.dim, width: 1, alpha: lakeStyle.edgeAlpha });
    this.views.forEach((v, i) => {
      v.root.position.copyFrom(this.padPos(i));
      this.drawPad(i);
    });
    this.drawDots(width, height);
  }

  resize(width: number, height: number): void {
    this.layout(width, height);
  }

  private drawPad(i: number): void {
    const v = this.views[i]!;
    const node = this.level.nodes[i]!;
    const s = this.state[i]!;
    const lit = s === this.level.states - 1;
    const alpha = lit ? lakeStyle.litAlpha : s === 0 ? lakeStyle.darkAlpha : lakeStyle.halfAlpha;
    const r = this.radius;
    v.shadow.clear().circle(lakeStyle.shadowOffset * 0.6, lakeStyle.shadowOffset, r).fill({ color: palette.shadow, alpha: lakeStyle.shadowAlpha });
    v.disc.clear();
    v.disc.circle(0, 0, Math.max(layout.minHitSize / 2, r)).fill({ color: palette.pearl, alpha: 0.001 });
    // A lily pad: a disc with a small notch.
    if (node.frozen) {
      // Stone pads: a grey disc with a cracked line; they still light up when lit.
      v.disc.circle(0, 0, r).fill({ color: lit ? this.accent : palette.dim, alpha: lit ? lakeStyle.litAlpha * 0.8 : 0.5 }).stroke({ color: palette.dim, width: 1.5, alpha: 0.9 });
      v.disc.moveTo(-r * 0.5, -r * 0.2).lineTo(-r * 0.1, r * 0.1).lineTo(r * 0.2, -r * 0.15).lineTo(r * 0.5, r * 0.3).stroke({ color: palette.void, width: 1.2, alpha: 0.7 });
      v.root.cursor = 'default';
    } else {
      v.disc.moveTo(0, 0).arc(0, 0, r, -Math.PI * 0.12, Math.PI * 1.88).closePath().fill({ color: this.accent, alpha });
      v.disc.circle(0, 0, r).stroke({ color: lit ? this.accent : palette.dim, width: 1.2, alpha: lit ? 0.9 : 0.7 });
    }
    v.ring.clear();
    if (node.wide) v.ring.circle(0, 0, r * 1.35).stroke({ color: this.accent, width: 1, alpha: 0.35 });
    v.hint.clear();
    const shimmering = this.shimmer && this.shimmer.nodes.includes(i);
    if (this.hinted.has(i) || shimmering) {
      const pulse = 0.35 + 0.25 * Math.sin(this.time * 3 + i);
      v.hint.circle(0, 0, r * 1.7).fill({ color: palette.pearl, alpha: pulse * 0.5 });
    }
  }

  private drawDots(width: number, height: number): void {
    this.dots.clear();
    if (this.countUntil === null) return;
    const n = this.countValue;
    const startX = width / 2 - ((n - 1) * lakeStyle.dotGap) / 2;
    const y = this.area.y + this.area.size + 28;
    for (let k = 0; k < n; k++) this.dots.circle(startX + k * lakeStyle.dotGap, y, 3).fill({ color: this.accent, alpha: alphas.hudHover });
    void height;
  }

  private pressPad(i: number): void {
    if (this.solved) return;
    if (this.level.nodes[i]!.frozen) {
      // A stone pad does not answer to touch: a small dull nudge instead.
      gsap.fromTo(this.views[i]!.root.scale, { x: 0.96, y: 0.96 }, { x: 1, y: 1, duration: durations.microFeedback * 2, ease: easings.response });
      return;
    }
    this.stopTutorial();
    this.state = press(this.level, this.state, i, this.affects);
    this.hinted.delete(i);
    this.emit('move');
    this.voice.press(i);
    const p = this.padPos(i);
    this.live.push({ x: p.x, y: p.y, t: 0 });
    for (const j of this.affects[i]!) {
      this.drawPad(j);
      const v = this.views[j]!;
      gsap.fromTo(v.root.scale, { x: 0.85, y: 0.85 }, { x: 1, y: 1, duration: scaled(durations.pieceMove), ease: easings.tileSnap, delay: j === i ? 0 : 0.08 });
    }
    if (isLit(this.level, this.state)) {
      this.solved = true;
      this.emit('solved');
    }
  }

  update(dt: number): void {
    this.time += dt;
    // Expanding ripple rings from recent presses.
    this.ripples.clear();
    const wideR = this.radius * lakeStyle.rippleScale;
    this.live = this.live.filter((r) => r.t < 1);
    for (const r of this.live) {
      r.t += dt / scaled(lakeStyle.rippleSeconds);
      for (let k = 0; k < 2; k++) {
        const p = r.t - k * 0.25;
        if (p <= 0) continue;
        this.ripples.circle(r.x, r.y, this.radius + p * wideR).stroke({ color: this.accent, width: 1.5, alpha: 0.5 * (1 - p) });
      }
    }
    if (this.hinted.size || this.shimmer) {
      if (this.shimmer && this.time > this.shimmer.until) this.shimmer = null;
      this.views.forEach((_, i) => this.drawPad(i));
    }
    if (this.countUntil !== null && this.time > this.countUntil) {
      this.countUntil = null;
      this.dots.clear();
    }
  }

  restart(): void {
    if (this.solved) return;
    this.stopTutorial();
    this.state = this.level.start.slice();
    this.hinted.clear();
    this.shimmer = null;
    this.countUntil = null;
    this.dots.clear();
    this.views.forEach((_, i) => this.drawPad(i));
    if (this.isTutorial) this.scheduleTutorial();
  }

  showClue(tier: ClueTier): string | void {
    if (this.solved) return;
    let caption: string | undefined;
    switch (tier) {
      case 1:
      case 2: {
        const found = nodeClue(this.level, this.state, 1, this.hinted, `${this.level.seed}:clue${tier}:${this.hinted.size}`);
        if (found.length === 0) return this.hinted.size ? 'Press the pads that are glowing.' : 'No single press helps from here: try restarting the level.';
        for (const i of found) this.hinted.add(i);
        caption = this.hinted.size === 1 ? 'Press the glowing pad.' : 'Another pad glows. Press every glowing pad, in any order.';
        break;
      }
      case 3:
        this.countValue = countClue(this.level, this.state);
        this.countUntil = this.time + lakeStyle.clueSeconds;
        this.drawDots(this.ctx.width, this.ctx.height);
        caption = `The dots below show how many presses are still needed: ${this.countValue}.`;
        break;
      case 4:
        this.shimmer = { nodes: halfClue(this.level, this.state, `${this.level.seed}:clue4`), until: this.time + lakeStyle.clueSeconds };
        caption = 'For a moment, half of the pads still to press shimmer.';
        break;
    }
    this.views.forEach((_, i) => this.drawPad(i));
    return caption;
  }

  private scheduleTutorial(): void {
    this.stopTutorial();
    this.tutorialTimer = gsap.delayedCall(lakeStyle.tutorialDelay, () => {
      const i = this.level.solution.findIndex((c) => c > 0);
      if (i < 0) return;
      if (!this.hand) {
        this.hand = new GhostHand();
        this.container.addChild(this.hand);
      }
      const p = this.padPos(i);
      this.hand.demoTap(p.x, p.y, false);
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
    const cx = this.area.x + this.area.size / 2;
    const cy = this.area.y + this.area.size / 2;
    // Concentric ripples cross the whole lake.
    const state = { t: 0 };
    gsap.to(state, {
      t: 1,
      duration: total,
      ease: easings.ambient,
      onUpdate: () => {
        this.ripples.clear();
        for (let k = 0; k < 5; k++) {
          const p = state.t - k * 0.12;
          if (p <= 0) continue;
          this.ripples.circle(cx, cy, p * this.area.size * 0.9).stroke({ color: this.accent, width: 1.5, alpha: 0.45 * (1 - p) });
        }
      },
    });
    // The moon's reflection rises from below.
    const moonR = this.area.size * 0.22;
    this.moon.clear().ellipse(0, 0, moonR, moonR * 0.55).fill({ color: palette.pearl, alpha: 0.22 });
    this.moon.filters = [createGlow(palette.pearl, { distance: 40, strength: 1.4, quality: 0.3 })];
    this.moon.position.set(cx, cy + this.area.size * 0.7);
    this.moon.alpha = 0;
    gsap.to(this.moon, { y: cy + this.area.size * 0.15, alpha: 1, duration: total, ease: easings.ambient });
    this.views.forEach((v, i) => {
      gsap.to(v.root.scale, { x: 1.15, y: 1.15, duration: total * 0.3, delay: i * 0.03, yoyo: true, repeat: 1, ease: easings.ambient });
    });
    for (let i = 0; i < 30; i++) {
      this.ctx.particles.emit({
        x: cx + (this.ctx.rng.next() - 0.5) * this.area.size,
        y: cy + (this.ctx.rng.next() - 0.3) * this.area.size,
        color: palette.pearl,
        vx: 0,
        vy: -8 - this.ctx.rng.next() * 14,
        life: 1.8 + this.ctx.rng.next(),
        alphaFrom: 0.5,
        scaleFrom: 0.25,
        scaleTo: 0.05,
      });
    }
    return new Promise((resolve) => gsap.delayedCall(total, resolve));
  }

  // ----- instruction pages -----

  // A row of pads joined by lines, with a redraw that takes each pad's state.
  private miniPond(count: number, opts: { wide?: number; frozen?: number; states?: 2 | 3; gap?: number } = {}): { root: Container; pads: Graphics[]; ripple: Graphics; draw: (state: number[]) => void; pos: (i: number) => { x: number; y: number } } {
    const root = new Container();
    const r = 14;
    const gap = opts.gap ?? 50;
    const states = opts.states ?? 2;
    const pos = (i: number) => ({ x: (i - (count - 1) / 2) * gap, y: 0 });
    const lines = new Graphics();
    if (count > 1) lines.moveTo(pos(0).x, 0).lineTo(pos(count - 1).x, 0).stroke({ color: palette.dim, width: 1, alpha: lakeStyle.edgeAlpha });
    const ripple = new Graphics();
    const pads = Array.from({ length: count }, (_, i) => {
      const g = new Graphics();
      g.position.copyFrom(pos(i));
      return g;
    });
    root.addChild(lines, ripple, ...pads);
    const draw = (state: number[]) => {
      pads.forEach((g, i) => {
        g.clear();
        const st = state[i]!;
        const lit = st === states - 1;
        if (opts.frozen === i) {
          g.circle(0, 0, r).fill({ color: lit ? this.accent : palette.dim, alpha: lit ? 0.7 : 0.5 }).stroke({ color: palette.dim, width: 1.5 });
          g.moveTo(-r * 0.5, -r * 0.2).lineTo(-r * 0.1, r * 0.1).lineTo(r * 0.2, -r * 0.15).lineTo(r * 0.5, r * 0.3).stroke({ color: palette.void, width: 1.2, alpha: 0.7 });
          return;
        }
        const alpha = lit ? lakeStyle.litAlpha : st === 0 ? lakeStyle.darkAlpha : lakeStyle.halfAlpha;
        g.circle(0, 0, r).fill({ color: this.accent, alpha }).stroke({ color: lit ? this.accent : palette.dim, width: 1.2 });
        if (opts.wide === i) g.circle(0, 0, r * 1.35).stroke({ color: this.accent, width: 1, alpha: 0.35 });
      });
    };
    return { root, pads, ripple, draw, pos };
  }

  private rippleAt(tl: gsap.core.Timeline, ripple: Graphics, x: number, y: number, reach: number): gsap.core.Timeline {
    const state = { p: 0 };
    return tl.set(state, { p: 0 }).to(state, {
      p: 1,
      duration: 0.8,
      ease: easings.response,
      onUpdate: () => ripple.clear().circle(x, y, 14 + state.p * reach).stroke({ color: this.accent, width: 1.5, alpha: 0.5 * (1 - state.p) }),
    }, '<');
  }

  introPages(): IntroPage[] {
    const pages: IntroPage[] = [];
    pages.push({
      caption: 'Press a lily pad: it flips, and so does every pad joined to it by a line. Dark pads light up, lit pads go dark. Light every pad.',
      glyph: () => {
        const pond = this.miniPond(3);
        const finger = makeFinger();
        pond.root.addChild(finger);
        pond.draw([0, 0, 0]);
        const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.2 });
        tapAt(tl, finger, 0, 0, 0.6).call(() => pond.draw([1, 1, 1]));
        this.rippleAt(tl, pond.ripple, 0, 0, 60);
        liftFinger(tl, finger);
        tl.call(() => pond.draw([0, 0, 0]), undefined, '+=1');
        pond.root.on('destroyed', () => tl.kill());
        return pond.root;
      },
    });
    pages.push({
      caption: 'Pressing the same pad again undoes it. The order of your presses does not matter, only which pads you press.',
      glyph: () => {
        const pond = this.miniPond(3);
        const finger = makeFinger();
        pond.root.addChild(finger);
        pond.draw([1, 0, 0]);
        const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.2 });
        tapAt(tl, finger, 0, 0, 0.6).call(() => pond.draw([0, 1, 1]));
        this.rippleAt(tl, pond.ripple, 0, 0, 60);
        tl.to(finger.scale, { x: 0.7, y: 0.7, duration: 0.14, yoyo: true, repeat: 1, delay: 0.9 }).call(() => pond.draw([1, 0, 0]));
        this.rippleAt(tl, pond.ripple, 0, 0, 60);
        liftFinger(tl, finger);
        pond.root.on('destroyed', () => tl.kill());
        return pond.root;
      },
    });
    if (this.level.states === 3) {
      pages.push({
        caption: 'Here pads have three states: dark, half-lit, then lit. Each press moves every affected pad one step, and a lit pad goes dark again.',
        glyph: () => {
          const pond = this.miniPond(1, { states: 3 });
          const finger = makeFinger();
          pond.root.addChild(finger);
          pond.draw([0]);
          const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.2 });
          tapAt(tl, finger, 0, 0, 0.6).call(() => pond.draw([1]));
          tl.to(finger.scale, { x: 0.7, y: 0.7, duration: 0.14, yoyo: true, repeat: 1, delay: 0.8 }).call(() => pond.draw([2]));
          tl.to(finger.scale, { x: 0.7, y: 0.7, duration: 0.14, yoyo: true, repeat: 1, delay: 0.8 }).call(() => pond.draw([0]));
          liftFinger(tl, finger);
          pond.root.on('destroyed', () => tl.kill());
          return pond.root;
        },
      });
    }
    if (this.level.nodes.some((n) => n.wide)) {
      pages.push({
        caption: 'A pad with an outer ring sends its ripple two pads away, not just one.',
        glyph: () => {
          const pond = this.miniPond(5, { wide: 2, gap: 40 });
          const finger = makeFinger();
          pond.root.addChild(finger);
          pond.draw([0, 0, 0, 0, 0]);
          const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.2 });
          tapAt(tl, finger, 0, 0, 0.6).call(() => pond.draw([1, 1, 1, 1, 1]));
          this.rippleAt(tl, pond.ripple, 0, 0, 90);
          liftFinger(tl, finger);
          tl.call(() => pond.draw([0, 0, 0, 0, 0]), undefined, '+=1');
          pond.root.on('destroyed', () => tl.kill());
          return pond.root;
        },
      });
    }
    if (this.level.nodes.some((n) => n.frozen)) {
      pages.push({
        caption: 'A grey stone pad cannot be pressed. Only the pads beside it can change it, and it still has to end up lit.',
        glyph: () => {
          const pond = this.miniPond(3, { frozen: 1 });
          const finger = makeFinger();
          pond.root.addChild(finger);
          pond.draw([0, 0, 0]);
          const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.2 });
          tapAt(tl, finger, 0, 0, 0.6);
          refuse(tl, pond.pads[1]!);
          liftFinger(tl, finger);
          tapAt(tl, finger, pond.pos(0).x, 0, 0.5).call(() => pond.draw([1, 1, 0]));
          this.rippleAt(tl, pond.ripple, pond.pos(0).x, 0, 60);
          liftFinger(tl, finger);
          tl.call(() => pond.draw([0, 0, 0]), undefined, '+=1');
          pond.root.on('destroyed', () => tl.kill());
          return pond.root;
        },
      });
    }
    return pages;
  }


  // Dev only: faint rings on the pads of the stored solution.
  showSolutionOverlay(): void {
    const g = new Graphics();
    g.eventMode = 'none';
    this.level.solution.forEach((c, i) => {
      if (c <= 0) return;
      const p = this.padPos(i);
      g.circle(p.x, p.y, this.radius * 1.5).stroke({ color: palette.pearl, width: 1, alpha: 0.18 });
    });
    this.container.addChild(g);
  }

  destroy(): void {
    this.stopTutorial();
    this.voice.dispose();
    this.views.forEach((v) => gsap.killTweensOf(v.root.scale));
    gsap.killTweensOf(this.moon);
    this.container.destroy({ children: true });
  }
}
