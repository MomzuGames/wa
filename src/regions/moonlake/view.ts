import gsap from 'gsap';
import { Container, type FederatedPointerEvent, Graphics } from 'pixi.js';
import type { IntroPage, LevelScene, ShellContext, Tip } from '../types';
import { palette } from '../../design/palette';
import { durations, easings, scaled } from '../../design/motion';
import { puzzleArea } from '../../design/layout';
import { createGlow } from '../../fx/glow';
import { liftFinger, makeFinger, tapAt } from '../../ui/introGlyphs';
import { events } from '../../core/events';
import { type LanternLevel, STEPS, allLit, cellCount, clashing, isRock, isSolved, isWater, lightCounts, rockCount, rockState, sightLines } from './model';
import { type Deduction, type Reason, solveByLogic } from './solver';
import { createMoonVoice, type MoonVoice } from './sound';

// Lanterns on the lake: tap the water to float a paper lantern, tap it again to take it
// away. Warm light runs straight across the water from every lantern; the lake is done
// when every patch glows, no lantern shines on another and every rock's dots are met.

const lakeStyle = {
  maxCell: 64,
  lanternHeight: 0.62, // of a cell
  lightAlpha: 0.11,
  beamAlpha: 0.14,
  beamWidth: 0.16, // of a cell
  bob: 1.6, // px
  rippleEvery: [3.5, 7.5], // seconds between the lake's own quiet ripples
  rippleSeconds: 2.8,
  rippleAlpha: 0.14,
  placeRippleSeconds: 1.1,
  lightFade: 0.35, // seconds for new light to spread in
  dropFrom: 0.3, // of a cell: a new lantern settles onto the water from this high
  tutorialDelay: 0.6,
} as const;

type Handler = () => void;

const NUDGE: Record<Reason, string> = {
  rock: 'Look at the ringed rock. Count its dots and the open water right beside it: only one way fits.',
  'only-light': 'Look at the ringed dark patch. Only one place can still light it.',
  sees: 'Look at the ringed lantern. Nothing in its light can hold another lantern.',
  'what-if': 'Imagine the ringed spot without a lantern: some patch could never be lit, or a rock could not be met. So a lantern belongs there.',
};

// A Japanese paper lantern (chōchin), centred on (0, 0), `h` tall: a ribbed paper body
// glowing warm from inside, dark caps top and bottom, a hanging loop and a short tassel.
export function drawLantern(g: Graphics, h: number, alpha = 1): void {
  const w = h * 0.74;
  const line = Math.max(0.8, h * 0.035);
  g.moveTo(-w * 0.13, -h * 0.5).quadraticCurveTo(0, -h * 0.74, w * 0.13, -h * 0.5).stroke({ color: palette.dim, width: line * 1.2, alpha });
  g.ellipse(0, 0, w / 2, h * 0.42).fill({ color: palette.peach, alpha: 0.95 * alpha });
  g.ellipse(0, h * 0.03, w * 0.35, h * 0.3).fill({ color: palette.lemon, alpha: 0.85 * alpha });
  g.ellipse(0, h * 0.05, w * 0.17, h * 0.15).fill({ color: palette.pearl, alpha: 0.5 * alpha });
  for (const k of [-0.27, -0.135, 0, 0.135, 0.27]) {
    const y = k * h;
    const half = (w / 2) * Math.sqrt(Math.max(0, 1 - (y / (h * 0.42)) ** 2));
    g.moveTo(-half, y).quadraticCurveTo(0, y + h * 0.035, half, y);
  }
  g.stroke({ color: palette.shadow, width: line * 0.7, alpha: 0.18 * alpha });
  g.roundRect(-w * 0.3, -h * 0.5, w * 0.6, h * 0.11, h * 0.03).fill({ color: palette.void, alpha: 0.92 * alpha }).stroke({ color: palette.rose, width: line * 0.6, alpha: 0.35 * alpha });
  g.roundRect(-w * 0.3, h * 0.39, w * 0.6, h * 0.11, h * 0.03).fill({ color: palette.void, alpha: 0.92 * alpha }).stroke({ color: palette.rose, width: line * 0.6, alpha: 0.35 * alpha });
  g.moveTo(0, h * 0.5).lineTo(0, h * 0.64).stroke({ color: palette.rose, width: line, alpha: 0.75 * alpha, cap: 'round' });
}

// A rock in the lake, centred on (0, 0), with its dots (or a ring for none) on top.
function drawRock(g: Graphics, size: number, seed: number, count: number | null, dotColor: number = palette.pearl): void {
  const r = size * 0.42;
  const pts: number[] = [];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    const wob = 0.86 + 0.14 * Math.sin(seed * 12.9898 + k * 78.233);
    pts.push(Math.cos(a) * r * wob, Math.sin(a) * r * wob * 0.88);
  }
  g.poly(pts.map((v, i) => v + (i % 2 ? size * 0.06 : size * 0.03))).fill({ color: palette.shadow, alpha: 0.45 });
  g.poly(pts).fill({ color: palette.dim, alpha: 1 }).poly(pts).fill({ color: palette.lavender, alpha: 0.06 }).poly(pts).stroke({ color: palette.pearl, width: 1, alpha: 0.16 });
  g.ellipse(-r * 0.35, -r * 0.42, r * 0.3, r * 0.12).fill({ color: palette.pearl, alpha: 0.1 });
  if (count === null) return;
  const d = size * 0.07;
  if (count === 0) {
    g.circle(0, 0, size * 0.12).stroke({ color: dotColor, width: Math.max(1.2, size * 0.035), alpha: 0.85 });
    return;
  }
  const s = size * 0.13;
  const spots: Record<number, Array<[number, number]>> = {
    1: [[0, 0]],
    2: [[-s, 0], [s, 0]],
    3: [[0, -s * 0.9], [-s, s * 0.6], [s, s * 0.6]],
    4: [[-s, -s], [s, -s], [-s, s], [s, s]],
  };
  for (const [x, y] of spots[count] ?? []) g.circle(x, y, d).fill({ color: dotColor, alpha: 0.95 });
}

interface LanternView {
  root: Container;
  body: Graphics;
  glow: Container; // fades in and out as a whole
  flame: Graphics; // inside it, flickers
  reflection: Graphics;
  phase: number;
}

interface Ripple {
  x: number;
  y: number;
  t: number;
  seconds: number;
  reach: number;
  color: number;
  alpha: number;
}

export class LanternLakeScene implements LevelScene {
  readonly container = new Container();
  private hit = new Graphics();
  private water = new Graphics();
  private ripples = new Graphics();
  private lights = [new Graphics(), new Graphics()];
  private front = 0;
  private clash = new Graphics();
  private rocks = new Container();
  private over = new Graphics();
  private reflections = new Container();
  private glows = new Container();
  private lanternsLayer = new Container();
  private hintLayer = new Container();
  private moon = new Graphics();
  private views = new Map<number, LanternView>();
  private lanterns = new Set<number>();
  private sight: number[][];
  private handlers: Record<'attempt' | 'solved' | 'move', Handler[]> = { attempt: [], solved: [], move: [] };
  private cell = 40;
  private origin = { x: 0, y: 0 };
  private solved = false;
  private time = 0;
  private rise = 0;
  private live: Ripple[] = [];
  private nextRipple = 2;
  private voice: MoonVoice;
  private allLitNote = '';
  // Hints never place a lantern: a nudge rings where to look and why, then a faint lantern
  // shows where one goes (or a lantern that cannot stay pulses), then a few more.
  private logic: Deduction[];
  private hintTarget: { cell: number; on: boolean; at: number; reason: Reason | 'wrong' } | null = null;
  private nudge: { g: Graphics; tween: gsap.core.Tween } | null = null;
  private ghosts = new Map<number, Graphics>();
  private demo: { layer: Container; tl: gsap.core.Timeline } | null = null;

  constructor(
    private ctx: ShellContext,
    private level: LanternLevel,
    private tutorial = false,
  ) {
    this.voice = createMoonVoice(ctx.audio);
    this.sight = sightLines(level);
    this.logic = solveByLogic(level).deductions;
    for (const g of [this.water, this.ripples, ...this.lights, this.clash, this.over, this.moon]) g.eventMode = 'none';
    for (const c of [this.rocks, this.reflections, this.glows, this.lanternsLayer, this.hintLayer]) c.eventMode = 'none';
    this.glows.blendMode = 'add';
    this.hit.eventMode = 'static';
    this.hit.cursor = 'pointer';
    this.hit.on('pointertap', (e: FederatedPointerEvent) => this.onTap(e));
    this.container.addChild(this.hit, this.moon, this.water, this.ripples, ...this.lights, this.clash, this.reflections, this.rocks, this.over, this.glows, this.lanternsLayer, this.hintLayer);
    this.layout(ctx.width, ctx.height);
  }

  on(event: 'attempt' | 'solved' | 'move', cb: Handler): void {
    this.handlers[event].push(cb);
  }

  private emit(event: 'attempt' | 'solved' | 'move'): void {
    this.handlers[event].forEach((h) => h());
  }

  // ----- layout and drawing -----

  private cx(i: number): number {
    return this.origin.x + ((i % this.level.width) + 0.5) * this.cell;
  }

  private cy(i: number): number {
    return this.origin.y + (Math.floor(i / this.level.width) + 0.5) * this.cell;
  }

  layout(width: number, height: number): void {
    const area = puzzleArea(width, height);
    const { width: w, height: h } = this.level;
    this.cell = Math.min(lakeStyle.maxCell, area.width / w, area.height / h);
    this.origin = { x: width / 2 - (w * this.cell) / 2, y: area.y + area.height / 2 - (h * this.cell) / 2 };
    this.hit.clear().rect(this.origin.x, this.origin.y, w * this.cell, h * this.cell).fill({ color: palette.pearl, alpha: 0.001 });
    // The lake: one dark body of water with a soft shoreline, faint lines between the
    // patches and a few moonlit streaks; the shore stays the night.
    const c = this.cell;
    const lake = (i: number) => i >= 0 && (isWater(this.level, i) || isRock(this.level, i));
    const inLake = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && lake(y * w + x);
    this.water.clear();
    for (let i = 0; i < cellCount(this.level); i++) {
      if (!lake(i)) continue;
      const x = this.origin.x + (i % w) * c;
      const y = this.origin.y + Math.floor(i / w) * c;
      this.water.rect(x - 0.5, y - 0.5, c + 1, c + 1).fill({ color: palette.void, alpha: 1 });
      this.water.rect(x - 0.5, y - 0.5, c + 1, c + 1).fill({ color: palette.sky, alpha: 0.045 });
    }
    // Faint seams between neighbouring patches, so every patch reads as its own place.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!inLake(x, y)) continue;
        const px = this.origin.x + x * c;
        const py = this.origin.y + y * c;
        if (inLake(x + 1, y)) this.water.moveTo(px + c, py + c * 0.12).lineTo(px + c, py + c * 0.88);
        if (inLake(x, y + 1)) this.water.moveTo(px + c * 0.12, py + c).lineTo(px + c * 0.88, py + c);
      }
    }
    this.water.stroke({ color: palette.pearl, width: 1, alpha: 0.07 });
    // The shoreline: every edge where the lake meets the land, with a soft glow.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!inLake(x, y)) continue;
        const px = this.origin.x + x * c;
        const py = this.origin.y + y * c;
        if (!inLake(x, y - 1)) this.water.moveTo(px, py).lineTo(px + c, py);
        if (!inLake(x + 1, y)) this.water.moveTo(px + c, py).lineTo(px + c, py + c);
        if (!inLake(x, y + 1)) this.water.moveTo(px, py + c).lineTo(px + c, py + c);
        if (!inLake(x - 1, y)) this.water.moveTo(px, py).lineTo(px, py + c);
      }
    }
    this.water.stroke({ color: palette.rose, width: 6, alpha: 0.06, cap: 'round', join: 'round' });
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!inLake(x, y)) continue;
        const px = this.origin.x + x * c;
        const py = this.origin.y + y * c;
        if (!inLake(x, y - 1)) this.water.moveTo(px, py).lineTo(px + c, py);
        if (!inLake(x + 1, y)) this.water.moveTo(px + c, py).lineTo(px + c, py + c);
        if (!inLake(x, y + 1)) this.water.moveTo(px, py + c).lineTo(px + c, py + c);
        if (!inLake(x - 1, y)) this.water.moveTo(px, py).lineTo(px, py + c);
      }
    }
    this.water.stroke({ color: palette.pearl, width: 1.2, alpha: 0.22, cap: 'round', join: 'round' });
    // Moonlit streaks on the water, the same every time for this lake.
    let seed = 0;
    for (const ch of this.level.seed) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    for (let i = 0; i < cellCount(this.level); i++) {
      if (!isWater(this.level, i) || rand() > 0.4) continue;
      const x = this.origin.x + (i % w) * c + c * (0.2 + rand() * 0.3);
      const y = this.origin.y + Math.floor(i / w) * c + c * (0.25 + rand() * 0.5);
      this.water.moveTo(x, y).lineTo(x + c * (0.15 + rand() * 0.25), y);
    }
    this.water.stroke({ color: palette.pearl, width: 1, alpha: 0.07, cap: 'round' });
    this.views.forEach((v, i) => this.placeView(v, i));
    this.redraw(false);
    this.rebuildHints();
  }

  resize(width: number, height: number): void {
    this.layout(width, height);
  }

  // Light, clashes and rocks follow the lanterns; new light spreads in softly.
  private redraw(fade = true): void {
    const lit = lightCounts(this.level, this.lanterns, this.sight);
    const old = this.lights[this.front]!;
    this.front = 1 - this.front;
    const g = this.lights[this.front]!;
    g.clear();
    const c = this.cell;
    for (let i = 0; i < lit.length; i++) {
      if (!lit[i]) continue;
      g.roundRect(this.cx(i) - c * 0.47, this.cy(i) - c * 0.47, c * 0.94, c * 0.94, c * 0.2).fill({ color: palette.lemon, alpha: lakeStyle.lightAlpha });
    }
    // A soft beam from each lantern to the end of its light, in all four directions.
    for (const l of this.lanterns) {
      for (const [dx, dy] of STEPS) {
        let x = l % this.level.width;
        let y = Math.floor(l / this.level.width);
        while (x + dx >= 0 && x + dx < this.level.width && y + dy >= 0 && y + dy < this.level.height && isWater(this.level, (y + dy) * this.level.width + x + dx)) {
          x += dx;
          y += dy;
        }
        const end = y * this.level.width + x;
        if (end !== l) g.moveTo(this.cx(l), this.cy(l)).lineTo(this.cx(end), this.cy(end));
      }
    }
    g.stroke({ color: palette.lemon, width: c * lakeStyle.beamWidth, alpha: lakeStyle.beamAlpha, cap: 'round' });
    gsap.killTweensOf(old);
    gsap.killTweensOf(g);
    if (fade) {
      g.alpha = 0;
      gsap.to(g, { alpha: 1, duration: lakeStyle.lightFade, ease: easings.ambient });
      gsap.to(old, { alpha: 0, duration: lakeStyle.lightFade, ease: easings.ambient });
    } else {
      g.alpha = 1;
      old.alpha = 0;
    }
    // Lanterns that shine on each other: a rose beam between them, pulsing gently.
    this.clash.clear();
    const clashes = clashing(this.level, this.lanterns, this.sight);
    for (const a of clashes) {
      for (const b of clashes) {
        if (b > a && this.sight[a]!.includes(b)) this.clash.moveTo(this.cx(a), this.cy(a)).lineTo(this.cx(b), this.cy(b));
      }
    }
    this.clash.stroke({ color: palette.rose, width: c * 0.12, alpha: 0.6, cap: 'round' });
    this.drawRocks();
  }

  private drawRocks(): void {
    this.rocks.removeChildren().forEach((c) => c.destroy());
    this.over.clear();
    for (let i = 0; i < cellCount(this.level); i++) {
      if (!isRock(this.level, i)) continue;
      const count = rockCount(this.level, i);
      const state = rockState(this.level, this.lanterns, i);
      // Dots glow warm once the rock has its lanterns (a ring stays quiet), rose when over.
      const dots = state === 'met' && count ? palette.lemon : palette.pearl;
      const g = new Graphics();
      drawRock(g, this.cell, i + 1, count, dots);
      g.position.set(this.cx(i), this.cy(i));
      this.rocks.addChild(g);
      if (state === 'over') this.over.circle(this.cx(i), this.cy(i), this.cell * 0.5).stroke({ color: palette.rose, width: 2, alpha: 0.8 }).circle(this.cx(i), this.cy(i), this.cell * 0.5).fill({ color: palette.rose, alpha: 0.12 });
    }
  }

  private makeView(i: number): LanternView {
    const h = this.cell * lakeStyle.lanternHeight;
    const root = new Container();
    const body = new Graphics();
    drawLantern(body, h);
    root.addChild(body);
    const glow = new Container();
    const flame = new Graphics();
    for (const [k, a, color] of [
      [0.95, 0.05, palette.peach],
      [0.7, 0.07, palette.lemon],
      [0.45, 0.1, palette.lemon],
    ] as const) {
      flame.circle(0, 0, this.cell * k).fill({ color, alpha: a });
    }
    glow.addChild(flame);
    const reflection = new Graphics();
    reflection.ellipse(0, 0, h * 0.24, h * 0.16).fill({ color: palette.lemon, alpha: 0.14 });
    for (const k of [-0.08, 0.02, 0.12]) reflection.moveTo(-h * 0.2, k * h).lineTo(h * 0.2, k * h);
    reflection.stroke({ color: palette.lemon, width: 1, alpha: 0.12 });
    const view = { root, body, glow, flame, reflection, phase: (i * 2.399) % (Math.PI * 2) };
    this.lanternsLayer.addChild(root);
    this.glows.addChild(glow);
    this.reflections.addChild(reflection);
    this.placeView(view, i);
    return view;
  }

  private placeView(v: LanternView, i: number): void {
    v.root.position.set(this.cx(i), this.cy(i) - this.cell * 0.04);
    v.glow.position.set(this.cx(i), this.cy(i));
    v.reflection.position.set(this.cx(i), this.cy(i) + this.cell * 0.36);
  }

  // ----- play -----

  private cellAt(e: FederatedPointerEvent): number | null {
    const p = this.container.toLocal(e.global);
    const x = Math.floor((p.x - this.origin.x) / this.cell);
    const y = Math.floor((p.y - this.origin.y) / this.cell);
    if (x < 0 || y < 0 || x >= this.level.width || y >= this.level.height) return null;
    return y * this.level.width + x;
  }

  private onTap(e: FederatedPointerEvent): void {
    if (this.solved) return;
    const i = this.cellAt(e);
    if (i === null || !isWater(this.level, i)) return;
    this.stopDemo();
    if (this.lanterns.has(i)) this.lift(i);
    else this.float(i);
    this.changed();
  }

  private float(i: number): void {
    this.lanterns.add(i);
    const v = this.makeView(i);
    this.views.set(i, v);
    const y = v.root.y;
    gsap.fromTo(v.root, { alpha: 0, y: y - this.cell * lakeStyle.dropFrom }, { alpha: 1, y, duration: scaled(durations.pieceMove) * 1.4, ease: easings.tileSnap });
    gsap.fromTo(v.glow, { alpha: 0 }, { alpha: 1, duration: lakeStyle.lightFade * 1.5, ease: easings.ambient });
    this.ripple(this.cx(i), this.cy(i), this.cell * 1.1, palette.lemon, 0.35, lakeStyle.placeRippleSeconds);
    this.voice.press(i % this.level.width + Math.floor(i / this.level.width));
  }

  private lift(i: number, quiet = false): void {
    this.lanterns.delete(i);
    const v = this.views.get(i);
    this.views.delete(i);
    if (v) {
      gsap.killTweensOf(v.root);
      gsap.to([v.root, v.glow, v.reflection], { alpha: 0, duration: durations.microFeedback * 1.5, ease: easings.ambient, onComplete: () => [v.root, v.glow, v.reflection].forEach((d) => d.destroy({ children: true })) });
    }
    this.ripple(this.cx(i), this.cy(i), this.cell * 0.8, palette.pearl, 0.2, lakeStyle.placeRippleSeconds);
    if (!quiet) this.voice.lift();
  }

  private changed(): void {
    this.emit('move');
    this.redraw();
    this.settleHints();
    if (isSolved(this.level, this.lanterns)) {
      this.solved = true;
      this.emit('solved');
      return;
    }
    // Every patch glows but something is not right yet: say what, gently, once per layout.
    if (allLit(this.level, this.lanterns, this.sight)) {
      const key = [...this.lanterns].sort((a, b) => a - b).join(',');
      if (key === this.allLitNote) return;
      this.allLitNote = key;
      events.emit(
        'level:note',
        clashing(this.level, this.lanterns, this.sight).size > 0
          ? 'The whole lake glows, but two lanterns shine on each other. The rose light shows which.'
          : 'The whole lake glows, but a rock does not have its number of lanterns beside it.',
      );
    }
  }

  private ripple(x: number, y: number, reach: number, color: number, alpha: number, seconds: number): void {
    this.live.push({ x, y, t: 0, seconds, reach, color, alpha });
  }

  update(dt: number): void {
    this.time += dt;
    // Now and then the lake stirs by itself: one faint ring on open water.
    this.nextRipple -= dt;
    if (this.nextRipple <= 0) {
      const [lo, hi] = lakeStyle.rippleEvery;
      this.nextRipple = lo + this.ctx.rng.next() * (hi - lo);
      const water = [...Array(cellCount(this.level)).keys()].filter((i) => isWater(this.level, i) && !this.lanterns.has(i));
      if (water.length) {
        const i = water[Math.floor(this.ctx.rng.next() * water.length)]!;
        this.ripple(this.cx(i), this.cy(i), this.cell * 1.3, palette.pearl, lakeStyle.rippleAlpha, lakeStyle.rippleSeconds);
      }
    }
    this.ripples.clear();
    this.live = this.live.filter((r) => r.t < 1);
    for (const r of this.live) {
      r.t += dt / scaled(r.seconds);
      for (let k = 0; k < 2; k++) {
        const p = r.t - k * 0.22;
        if (p <= 0 || p >= 1) continue;
        const rad = r.reach * (0.15 + p);
        this.ripples.ellipse(r.x, r.y, rad, rad * 0.5).stroke({ color: r.color, width: 1.2, alpha: r.alpha * (1 - p) });
      }
    }
    // Lanterns bob on the water, sway a little, and their light breathes like a flame.
    for (const v of this.views.values()) {
      const t = this.time + v.phase;
      v.body.y = Math.sin(t * 1.2) * lakeStyle.bob - this.rise;
      v.body.rotation = Math.sin(t * 0.8) * 0.045;
      v.flame.alpha = 0.88 + 0.08 * Math.sin(t * 3.1) + 0.04 * Math.sin(t * 7.3);
      v.reflection.scale.set(1 + 0.08 * Math.sin(t * 1.6), 1);
    }
    this.clash.alpha = 0.55 + 0.45 * Math.sin(this.time * 2.4);
    this.over.alpha = 0.55 + 0.45 * Math.sin(this.time * 2.4);
  }

  restart(): void {
    if (this.solved) return;
    for (const i of [...this.lanterns]) this.lift(i, true);
    this.clearHints();
    this.allLitNote = '';
    this.redraw();
  }

  // ----- the first lake's demonstration -----

  begin(): void {
    if (this.tutorial && this.lanterns.size === 0) gsap.delayedCall(lakeStyle.tutorialDelay, () => this.startDemo());
  }

  private startDemo(): void {
    if (this.demo || this.lanterns.size > 0 || this.solved) return;
    const layer = new Container();
    const finger = makeFinger();
    const ghosts = this.level.solution.map((i) => {
      const g = new Graphics();
      drawLantern(g, this.cell * lakeStyle.lanternHeight, 0.4);
      g.position.set(this.cx(i), this.cy(i));
      g.alpha = 0;
      layer.addChild(g);
      return g;
    });
    layer.addChild(finger);
    this.hintLayer.addChild(layer);
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.2 });
    this.level.solution.forEach((i, k) => {
      tapAt(tl, finger, this.cx(i), this.cy(i), k === 0 ? 0.3 : 0.45);
      tl.to(ghosts[k]!, { alpha: 1, duration: 0.3 });
    });
    liftFinger(tl, finger);
    tl.to(ghosts, { alpha: 0, duration: 0.6 });
    this.demo = { layer, tl };
  }

  private stopDemo(): void {
    if (!this.demo) return;
    this.demo.tl.kill();
    this.demo.layer.destroy({ children: true });
    this.demo = null;
  }

  // ----- hints -----

  // The first step the player has not made: a lantern that cannot stay, or one that belongs.
  private nextStep(): LanternLakeScene['hintTarget'] {
    const answer = new Set(this.level.solution);
    const wrong = [...this.lanterns].find((l) => !answer.has(l));
    if (wrong !== undefined) return { cell: wrong, on: false, at: wrong, reason: 'wrong' };
    const d = this.logic.find((k) => k.on && !this.lanterns.has(k.cell));
    return d ? { cell: d.cell, on: true, at: d.at, reason: d.reason } : null;
  }

  private stepDone(t: NonNullable<LanternLakeScene['hintTarget']>): boolean {
    return t.on ? this.lanterns.has(t.cell) : !this.lanterns.has(t.cell);
  }

  hint(): string {
    if (this.solved) return '';
    this.stopDemo();
    if (this.hintTarget && this.stepDone(this.hintTarget)) this.hintTarget = null;
    if (!this.hintTarget) {
      const step = this.nextStep();
      const left = this.level.solution.filter((l) => !this.lanterns.has(l)).length;
      if (!step || (step.on && left <= 1)) return 'Just one lantern left. You can find this one!';
      this.hintTarget = step;
      this.showNudge(step.at);
      return step.reason === 'wrong' ? 'One of your lanterns cannot stay where it is. Look at the ringed one.' : NUDGE[step.reason];
    }
    if (!this.ghosts.has(this.hintTarget.cell)) {
      this.addGhost(this.hintTarget.cell, this.hintTarget.on);
      return this.hintTarget.on ? 'The faint lantern shows where one belongs. Tap the water there.' : 'Tap the pulsing lantern to take it away.';
    }
    // A couple more at a time, never more than half of the lanterns still to place.
    const left = this.level.solution.filter((l) => !this.lanterns.has(l));
    const room = Math.floor(left.length / 2) - [...this.ghosts.keys()].filter((g) => left.includes(g)).length;
    const more = this.logic.filter((d) => d.on && !this.lanterns.has(d.cell) && !this.ghosts.has(d.cell)).slice(0, Math.max(0, Math.min(2, room)));
    if (more.length === 0) return 'That is all I can show. The rest is yours.';
    more.forEach((d) => this.addGhost(d.cell, true));
    return more.length === 1 ? 'One more faint lantern shows where it belongs.' : 'Two more faint lanterns show where they belong.';
  }

  private showNudge(i: number): void {
    this.clearNudge();
    const g = new Graphics().circle(0, 0, this.cell * 0.55).stroke({ color: palette.pearl, width: 1.5, alpha: 0.9 });
    g.position.set(this.cx(i), this.cy(i));
    this.hintLayer.addChild(g);
    const tween = gsap.fromTo(g, { alpha: 0.25 }, { alpha: 0.9, duration: 0.9, yoyo: true, repeat: -1, ease: easings.ambient });
    this.nudge = { g, tween };
  }

  private clearNudge(): void {
    this.nudge?.tween.kill();
    this.nudge?.g.destroy();
    this.nudge = null;
  }

  private addGhost(i: number, on: boolean): void {
    const g = new Graphics();
    if (on) drawLantern(g, this.cell * lakeStyle.lanternHeight, 0.35);
    else g.circle(0, 0, this.cell * 0.48).stroke({ color: palette.rose, width: 2, alpha: 0.9 });
    g.position.set(this.cx(i), this.cy(i));
    this.hintLayer.addChild(g);
    if (!on) gsap.fromTo(g, { alpha: 0.2 }, { alpha: 0.9, duration: 0.7, yoyo: true, repeat: -1, ease: easings.ambient });
    this.ghosts.set(i, g);
  }

  private settleHints(): void {
    const answer = new Set(this.level.solution);
    for (const [i, g] of this.ghosts) {
      if (this.lanterns.has(i) === answer.has(i)) {
        gsap.killTweensOf(g);
        g.destroy();
        this.ghosts.delete(i);
      }
    }
    if (this.hintTarget && this.stepDone(this.hintTarget)) {
      this.clearNudge();
      this.hintTarget = null;
    }
  }

  private rebuildHints(): void {
    const kept = [...this.ghosts.keys()];
    this.ghosts.forEach((g) => {
      gsap.killTweensOf(g);
      g.destroy();
    });
    this.ghosts.clear();
    const answer = new Set(this.level.solution);
    kept.forEach((i) => this.addGhost(i, answer.has(i)));
    if (this.hintTarget) this.showNudge(this.hintTarget.at);
  }

  private clearHints(): void {
    this.clearNudge();
    this.ghosts.forEach((g) => {
      gsap.killTweensOf(g);
      g.destroy();
    });
    this.ghosts.clear();
    this.hintTarget = null;
  }

  tips(): Tip[] {
    const tips: Tip[] = [
      { id: 'lantern:many', text: 'Tip: start at rocks with many dots. When a rock has as many dots as open water beside it, every side gets a lantern.', after: 1 },
      { id: 'lantern:dark', text: 'Tip: look for a dark patch that only one place can still light. Its lantern must go there.', after: 2 },
      { id: 'lantern:ahead', text: 'Tip: stuck? Imagine a lantern on a spot and follow its light. If that leaves a patch nothing can light, it does not belong there.', after: 3 },
    ];
    if (this.level.grid.some((row) => row.includes('0'))) tips.push({ id: 'lantern:ring', text: 'Tip: no lantern sits right beside a rock with a ring, so the water around it can be ruled out.', after: 1 });
    return tips;
  }

  // ----- completion -----

  playCompletion(): Promise<void> {
    this.clearHints();
    this.voice.solve();
    const total = scaled(durations.completion);
    const { width: w, height: h } = this.level;
    const mx = this.origin.x + (w * this.cell) / 2;
    const my = this.origin.y + (h * this.cell) / 2;
    // The lanterns brighten and lift a little off the water, as if about to float away.
    gsap.to(this, { rise: this.cell * 0.18, duration: total * 0.6, ease: easings.ambient });
    for (const v of this.views.values()) gsap.to(v.glow.scale, { x: 1.35, y: 1.35, duration: total * 0.5, ease: easings.ambient });
    // Wide ripples cross the whole lake, and the moon's reflection rises.
    for (let k = 0; k < 4; k++) gsap.delayedCall(k * 0.35, () => this.ripple(mx, my, Math.max(w, h) * this.cell * 0.7, palette.lemon, 0.3, total * 0.8));
    const moonR = Math.min(w, h) * this.cell * 0.22;
    this.moon.clear().ellipse(0, 0, moonR, moonR * 0.55).fill({ color: palette.pearl, alpha: 0.2 });
    this.moon.filters = [createGlow(palette.pearl, { distance: 40, strength: 1.4, quality: 0.3 })];
    this.moon.position.set(mx, my + h * this.cell * 0.55);
    this.moon.alpha = 0;
    gsap.to(this.moon, { y: my + h * this.cell * 0.1, alpha: 1, duration: total, ease: easings.ambient });
    // Warm sparks drift up from every lantern.
    for (const l of this.lanterns) {
      for (let k = 0; k < 6; k++) {
        this.ctx.particles.emit({
          x: this.cx(l) + (this.ctx.rng.next() - 0.5) * this.cell * 0.4,
          y: this.cy(l) - this.cell * 0.2,
          color: this.ctx.rng.chance(0.6) ? palette.lemon : palette.peach,
          vx: (this.ctx.rng.next() - 0.5) * 6,
          vy: -10 - this.ctx.rng.next() * 16,
          life: 1.6 + this.ctx.rng.next() * 1.2,
          alphaFrom: 0.6,
          scaleFrom: 0.25,
          scaleTo: 0.05,
        });
      }
    }
    return new Promise((resolve) => gsap.delayedCall(total, resolve));
  }

  // ----- instruction card -----

  // A small lake for the instruction card: rows as in a level, plus lanterns and a verdict.
  private miniLake(rows: string[], lanterns: number[], s = 30): { root: Container; draw: (ls: number[]) => void } {
    const level: LanternLevel = { seed: 'mini', chapter: 0, width: rows[0]!.length, height: rows.length, grid: rows, solution: [], difficulty: 0 };
    const sight = sightLines(level);
    const root = new Container();
    const base = new Graphics();
    const light = new Graphics();
    const top = new Container();
    root.addChild(base, light, top);
    const ox = -(level.width * s) / 2;
    const oy = -(level.height * s) / 2;
    const at = (i: number) => ({ x: ox + ((i % level.width) + 0.5) * s, y: oy + (Math.floor(i / level.width) + 0.5) * s });
    for (let i = 0; i < cellCount(level); i++) {
      if (!isWater(level, i) && !isRock(level, i)) continue;
      const p = at(i);
      base.roundRect(p.x - s * 0.48, p.y - s * 0.48, s * 0.96, s * 0.96, s * 0.18).fill({ color: palette.void, alpha: 1 }).roundRect(p.x - s * 0.48, p.y - s * 0.48, s * 0.96, s * 0.96, s * 0.18).stroke({ color: palette.pearl, width: 1, alpha: 0.18 });
    }
    const draw = (ls: number[]) => {
      const set = new Set(ls);
      light.clear();
      top.removeChildren().forEach((c) => c.destroy());
      const lit = lightCounts(level, set, sight);
      for (let i = 0; i < lit.length; i++) {
        if (!lit[i]) continue;
        const p = at(i);
        light.roundRect(p.x - s * 0.47, p.y - s * 0.47, s * 0.94, s * 0.94, s * 0.2).fill({ color: palette.lemon, alpha: 0.16 });
      }
      const clashes = clashing(level, set, sight);
      for (const a of clashes) for (const b of clashes) if (b > a && sight[a]!.includes(b)) light.moveTo(at(a).x, at(a).y).lineTo(at(b).x, at(b).y);
      light.stroke({ color: palette.rose, width: 3, alpha: 0.8, cap: 'round' });
      for (let i = 0; i < cellCount(level); i++) {
        if (!isRock(level, i)) continue;
        const g = new Graphics();
        const state = rockState(level, set, i);
        drawRock(g, s, i + 1, rockCount(level, i), state === 'met' && rockCount(level, i) ? palette.lemon : state === 'over' ? palette.rose : palette.pearl);
        g.position.copyFrom(at(i));
        top.addChild(g);
      }
      for (const l of set) {
        const g = new Graphics();
        g.circle(0, 0, s * 0.6).fill({ color: palette.lemon, alpha: 0.08 });
        drawLantern(g, s * 0.66);
        g.position.copyFrom(at(l));
        top.addChild(g);
      }
    };
    draw(lanterns);
    return { root, draw };
  }

  // Examples side by side, each with a soft tick or cross below.
  private examples(items: Array<{ rows: string[]; lanterns: number[]; ok: boolean }>): () => Container {
    return () => {
      const root = new Container();
      const s = 26;
      const gap = 30;
      const widths = items.map((e) => e.rows[0]!.length * s);
      let x0 = -(widths.reduce((a, w) => a + w, 0) + gap * (items.length - 1)) / 2;
      items.forEach((e, i) => {
        const lake = this.miniLake(e.rows, e.lanterns, s);
        lake.root.position.set(x0 + widths[i]! / 2, -10);
        const mark = new Graphics();
        const my = (e.rows.length * s) / 2 + 14;
        if (e.ok) mark.moveTo(-7, my).lineTo(-2, my + 5).lineTo(8, my - 6).stroke({ color: palette.mint, width: 2.5, cap: 'round', join: 'round' });
        else mark.moveTo(-6, my - 6).lineTo(6, my + 6).moveTo(6, my - 6).lineTo(-6, my + 6).stroke({ color: palette.rose, width: 2.5, cap: 'round' });
        lake.root.addChild(mark);
        lake.root.alpha = 0;
        root.addChild(lake.root);
        gsap.to(lake.root, { alpha: 1, duration: 0.5, delay: i * 0.35 });
        x0 += widths[i]! + gap;
      });
      return root;
    };
  }

  introPages(): IntroPage[] {
    const pages: IntroPage[] = [
      {
        caption: 'Tap the water to float a lantern there, and tap it again to take it away. Light up every patch of water.',
        glyph: () => {
          // Three taps light a small lake: the middle, then two corners.
          const s = 34;
          const lake = this.miniLake(['...', '...', '...'], [], s);
          const finger = makeFinger();
          lake.root.addChild(finger);
          const at = (i: number) => ({ x: ((i % 3) - 1) * s, y: (Math.floor(i / 3) - 1) * s });
          const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.4 });
          const order = [4, 0, 8];
          order.forEach((cell, k) => {
            tapAt(tl, finger, at(cell).x, at(cell).y, k === 0 ? 0.5 : 0.6).call(() => lake.draw(order.slice(0, k + 1)));
          });
          liftFinger(tl, finger);
          tl.call(() => lake.draw([]), undefined, '+=1.2');
          lake.root.on('destroyed', () => tl.kill());
          return lake.root;
        },
      },
      {
        caption: 'Light runs straight across the water until it meets a rock or the shore. Two lanterns may never shine on each other.',
        glyph: this.examples([
          { rows: ['.#.'], lanterns: [0, 2], ok: true },
          { rows: ['...'], lanterns: [0, 2], ok: false },
        ]),
      },
    ];
    if (this.level.grid.some((row) => /[0-4]/.test(row))) {
      pages.push({
        caption: 'Dots on a rock: exactly that many lanterns sit right beside it, above, below, left or right. Corners do not count. A ring means none.',
        glyph: this.examples([
          { rows: ['.2.'], lanterns: [0, 2], ok: true },
          { rows: ['.2.'], lanterns: [0], ok: false },
          { rows: ['.0.'], lanterns: [0], ok: false },
        ]),
      });
    }
    return pages;
  }

  // Dev only: faint rings where the stored answer's lanterns go.
  showSolutionOverlay(): void {
    const g = new Graphics();
    g.eventMode = 'none';
    for (const i of this.level.solution) g.circle(this.cx(i), this.cy(i), this.cell * 0.4).stroke({ color: palette.pearl, width: 1, alpha: 0.2 });
    this.container.addChild(g);
  }

  destroy(): void {
    this.stopDemo();
    this.clearHints();
    this.voice.dispose();
    gsap.killTweensOf(this);
    gsap.killTweensOf(this.moon);
    this.lights.forEach((g) => gsap.killTweensOf(g));
    for (const v of this.views.values()) [v.root, v.glow, v.glow.scale, v.reflection].forEach((d) => gsap.killTweensOf(d));
    this.container.destroy({ children: true });
  }
}
