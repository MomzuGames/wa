import gsap from 'gsap';
import { Container, type FederatedPointerEvent, Graphics } from 'pixi.js';
import type { ClueTier, LevelScene, ShellContext } from '../types';
import { alphas, palette } from '../../design/palette';
import { durations, easings, scaled } from '../../design/motion';
import { layout, puzzleArea } from '../../design/layout';
import { createGlow } from '../../fx/glow';
import { GhostHand } from '../../ui/ghostHand';
import { events } from '../../core/events';
import { IconButton } from '../../ui/iconButton';
import { type ShadowLevel, ceiling, cellIndex, frontProfile, isSolved, sideProfile, startHeights, stoneCount } from './model';
import { halfClue, stackClue } from './clues';
import { createShadowVoice, type ShadowVoice } from './sound';

const terraceStyle = {
  maxCell: 92,
  cubeHeight: 0.46, // of a cell
  topAlpha: 0.88,
  leftAlpha: 0.55,
  rightAlpha: 0.34,
  edgeAlpha: 0.55,
  floorAlpha: 0.35,
  litFloorAlpha: 0.14,
  wallAlpha: 0.32,
  shadowAlpha: 0.2,
  shadowMatchedAlpha: 0.34,
  castAlpha: 0.7,
  ghostAlpha: 0.4,
  turnSeconds: 0.65,
  growSeconds: 0.28,
  longPressSeconds: 0.55,
  clueSeconds: 3,
  tutorialDelay: 1.6,
  gaugeWidth: 6,
  shadowLength: 0.42, // ground shadow per stone, in cells
  lanternOffset: 0.9,
} as const;

type Handler = () => void;
type Point = { x: number; y: number };

export class ShadowLevelScene implements LevelScene {
  readonly container = new Container();
  readonly usesRotateKey = true;
  private floor = new Graphics();
  private walls = new Graphics();
  private stones = new Graphics();
  private ghosts = new Graphics();
  private gauge = new Graphics();
  private moon = new Graphics();
  private hit = new Graphics();
  private controls = new Container();
  private turnButton: IconButton;
  private heights: number[];
  private shown: number[]; // tweened heights for the growth animation
  private handlers: Record<'attempt' | 'solved' | 'move', Handler[]> = { attempt: [], solved: [], move: [] };
  private accent = palette.sage;
  private cell = 40;
  private centre: Point = { x: 0, y: 0 };
  private angle = 0; // view rotation in quarter turns (fractional while turning)
  private solved = false;
  private time = 0;
  private dirty = true;
  private voice: ShadowVoice;
  private hand: GhostHand | null = null;
  private tutorialTimer: gsap.core.Tween | null = null;
  private pressTimer: gsap.core.Tween | null = null;
  private pressHandled = false;
  private pressedCell = -1;
  private ghostStacks = new Map<number, { height: number; until: number | null }>();
  private glowLines: { until: number } | null = null;
  private brightUntil = 0;
  private unsubscribe: () => void;
  private screenWidth = 0;

  constructor(
    private ctx: ShellContext,
    private level: ShadowLevel,
    private isTutorial: boolean,
  ) {
    this.heights = startHeights(level);
    this.shown = this.heights.slice();
    this.voice = createShadowVoice(ctx.audio);
    for (const g of [this.floor, this.walls, this.stones, this.ghosts, this.gauge, this.moon]) g.eventMode = 'none';
    this.stones.filters = [createGlow(this.accent, { distance: 10, strength: 0.8, quality: 0.3 })];
    this.hit.eventMode = 'static';
    this.hit.cursor = 'pointer';
    this.hit.on('pointerdown', (e: FederatedPointerEvent) => this.onDown(e));
    this.hit.on('pointerup', (e: FederatedPointerEvent) => this.onUp(e));
    this.hit.on('pointerupoutside', () => this.cancelPress());
    this.turnButton = new IconButton('turn', () => this.turnView());
    this.controls.addChild(this.turnButton);
    this.container.addChild(this.hit, this.moon, this.walls, this.floor, this.stones, this.ghosts, this.gauge, this.controls);
    this.layout(ctx.width, ctx.height);
    this.unsubscribe = events.on('input:key', (key) => {
      if (key === 'r') this.turnView();
    });
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

  // ----- geometry -----

  private get n(): number {
    return this.level.size;
  }

  private get cubeH(): number {
    return this.cell * terraceStyle.cubeHeight;
  }

  // World (grid units, centred on the terrace) to screen, through the current view angle.
  private project(gx: number, gy: number, z: number): Point {
    const th = (this.angle * Math.PI) / 2;
    const u0 = gx - this.n / 2;
    const v0 = gy - this.n / 2;
    const u = u0 * Math.cos(th) - v0 * Math.sin(th);
    const v = u0 * Math.sin(th) + v0 * Math.cos(th);
    return { x: this.centre.x + ((u - v) * this.cell) / 2, y: this.centre.y + ((u + v) * this.cell) / 4 - z * this.cubeH };
  }

  // Rotated coordinates of a cell centre, for depth sorting and face visibility.
  private rotated(gx: number, gy: number): { u: number; v: number } {
    const th = (this.angle * Math.PI) / 2;
    const u0 = gx - this.n / 2;
    const v0 = gy - this.n / 2;
    return { u: u0 * Math.cos(th) - v0 * Math.sin(th), v: u0 * Math.sin(th) + v0 * Math.cos(th) };
  }

  private depthOrder(): number[] {
    const cells = this.heights.map((_, i) => i);
    const depth = cells.map((i) => {
      const r = this.rotated((i % this.n) + 0.5, Math.floor(i / this.n) + 0.5);
      return r.u + r.v;
    });
    return cells.sort((a, b) => depth[a]! - depth[b]!);
  }

  layout(width: number, height: number): void {
    this.screenWidth = width;
    const area = puzzleArea(width, height);
    const n = this.n;
    const reach = this.level.maxHeight * terraceStyle.shadowLength;
    // Fit the terrace, its stacks and the ground shadows in front of it into the puzzle area.
    const half = n / 2;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const [u, v, z] of [
      [-half, -half, this.level.maxHeight],
      [half + reach, -half, 0],
      [-half, half + reach, 0],
      [half + reach, half + reach, 0],
      [-half - terraceStyle.lanternOffset, 0, this.level.maxHeight * 0.8],
    ] as Array<[number, number, number]>) {
      xs.push((u - v) / 2);
      ys.push((u + v) / 4 - z * terraceStyle.cubeHeight);
    }
    const boxW = Math.max(...xs) - Math.min(...xs);
    const boxH = Math.max(...ys) - Math.min(...ys) + 0.3;
    this.cell = Math.min(terraceStyle.maxCell, area.width / boxW, area.height / boxH);
    const midY = (Math.max(...ys) + Math.min(...ys)) / 2;
    this.centre = { x: width / 2, y: area.y + area.height / 2 - midY * this.cell };
    this.hit.clear().rect(0, 0, width, height).fill({ color: palette.pearl, alpha: 0.001 });
    const inset = layout.hudInset + layout.hudIconSize / 2;
    this.turnButton.position.set(inset, height - inset);
    this.dirty = true;
    this.draw();
  }

  resize(width: number, height: number): void {
    this.layout(width, height);
  }

  // ----- drawing -----

  private draw(): void {
    this.drawWalls();
    this.drawFloor();
    this.drawStones();
    this.drawGhosts();
    this.drawGauge();
    this.dirty = false;
  }

  private nearestQuarter(): number {
    return ((Math.round(this.angle) % 4) + 4) % 4;
  }

  // For the two far walls at the nearest resting view: the moon's shadow per wall slot,
  // and the shadow the player's stones cast right now.
  private wallData(k: number): { u: { want: number[]; cast: number[] }; v: { want: number[]; cast: number[] } } {
    const n = this.n;
    const saved = this.angle;
    this.angle = k;
    const castFront = frontProfile(n, this.heights);
    const castSide = sideProfile(n, this.heights);
    // Map a rotated slot back to world cells to see whether it is a world column or row.
    const th = (k * Math.PI) / 2;
    const world = (i: number, j: number) => {
      const u = i + 0.5 - n / 2;
      const v = j + 0.5 - n / 2;
      const u0 = u * Math.cos(th) + v * Math.sin(th);
      const v0 = -u * Math.sin(th) + v * Math.cos(th);
      return { x: Math.round(u0 - 0.5 + n / 2), y: Math.round(v0 - 0.5 + n / 2) };
    };
    const u = { want: [] as number[], cast: [] as number[] };
    const v = { want: [] as number[], cast: [] as number[] };
    for (let j = 0; j < n; j++) {
      const a = world(0, j);
      const b = world(1, j);
      if (a.x === b.x) {
        u.want.push(this.level.front[a.x]!);
        u.cast.push(castFront[a.x]!);
      } else {
        u.want.push(this.level.side[a.y]!);
        u.cast.push(castSide[a.y]!);
      }
    }
    for (let i = 0; i < n; i++) {
      const a = world(i, 0);
      const b = world(i, 1);
      if (a.x === b.x) {
        v.want.push(this.level.front[a.x]!);
        v.cast.push(castFront[a.x]!);
      } else {
        v.want.push(this.level.side[a.y]!);
        v.cast.push(castSide[a.y]!);
      }
    }
    this.angle = saved;
    return { u, v };
  }

  // Projects a point given in rotated coordinates (u, v, z).
  private projectRotated(u: number, v: number, z: number): Point {
    return { x: this.centre.x + ((u - v) * this.cell) / 2, y: this.centre.y + ((u + v) * this.cell) / 4 - z * this.cubeH };
  }

  private poly(g: Graphics, pts: Point[]): Graphics {
    g.moveTo(pts[0]!.x, pts[0]!.y);
    for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
    return g.closePath();
  }

  // Two lanterns stand behind the terrace, one on each far side, and every stack throws
  // a shadow across the sand in front. The moon's shadows (what the level asks for) are
  // filled; the shadows the stones cast right now are pale outlines the player lines up.
  private drawWalls(): void {
    const g = this.walls;
    g.clear();
    const n = this.n;
    const half = n / 2;
    const k = this.nearestQuarter();
    const frac = Math.abs(this.angle - Math.round(this.angle));
    const fade = Math.max(0, 1 - frac * 3);
    if (fade <= 0) return;
    const data = this.wallData(k);
    const bright = this.time < this.brightUntil ? 1.6 : 1;
    const len = terraceStyle.shadowLength;
    // Lanterns: soft lights behind the far edges, the sources of the shadows.
    for (const [u, v] of [
      [-half - terraceStyle.lanternOffset, 0],
      [0, -half - terraceStyle.lanternOffset],
    ]) {
      const p = this.projectRotated(u!, v!, this.level.maxHeight * 0.8);
      const glow = 0.8 + 0.2 * Math.sin(this.time * 1.3 + u!);
      g.circle(p.x, p.y, this.cell * 0.28).fill({ color: this.accent, alpha: 0.08 * glow * fade });
      g.roundRect(p.x - this.cell * 0.06, p.y - this.cell * 0.09, this.cell * 0.12, this.cell * 0.18, this.cell * 0.04).fill({ color: this.accent, alpha: 0.55 * glow * fade });
      const foot = this.projectRotated(u!, v!, 0);
      g.moveTo(p.x, p.y + this.cell * 0.09).lineTo(foot.x, foot.y).stroke({ color: palette.dim, width: 1, alpha: 0.8 * fade });
    }
    // Shadows along each near edge: bars indexed by the slot they belong to.
    const edge = (family: 'u' | 'v') => {
      // 'v' bars run along the rotated u axis and stretch away in +v; 'u' bars the other way.
      const at = (s: number, reach: number) => (family === 'v' ? this.projectRotated(s, half + reach, 0) : this.projectRotated(half + reach, s, 0));
      const d = data[family];
      for (let j = 0; j < n; j++) {
        const s0 = j - half;
        const s1 = j + 1 - half;
        const want = d.want[j]!;
        const cast = d.cast[j]!;
        const matched = want === cast;
        const inset = 0.06;
        if (want > 0) {
          this.poly(g, [at(s0 + inset, 0), at(s1 - inset, 0), at(s1 - inset, want * len), at(s0 + inset, want * len)]).fill({ color: this.accent, alpha: (matched ? terraceStyle.shadowMatchedAlpha : terraceStyle.shadowAlpha) * fade * bright });
          for (let z = 1; z < want; z++) {
            const a = at(s0 + inset, z * len);
            const b = at(s1 - inset, z * len);
            g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: palette.void, width: 1, alpha: 0.35 * fade });
          }
        }
        if (cast > 0) {
          this.poly(g, [at(s0 + inset, 0), at(s1 - inset, 0), at(s1 - inset, cast * len), at(s0 + inset, cast * len)]).stroke({ color: palette.pearl, width: matched ? 1.6 : 1.1, alpha: (matched ? terraceStyle.castAlpha : terraceStyle.castAlpha * 0.6) * fade });
        }
      }
    };
    edge('u');
    edge('v');
  }

  private drawFloor(): void {
    const g = this.floor;
    g.clear();
    const n = this.n;
    const glow = this.glowLines && this.time < this.glowLines.until;
    const castFront = frontProfile(n, this.heights);
    const castSide = sideProfile(n, this.heights);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = cellIndex(n, x, y);
        const corners = [this.project(x, y, 0), this.project(x + 1, y, 0), this.project(x + 1, y + 1, 0), this.project(x, y + 1, 0)];
        const lit = this.level.footprint ? this.level.footprint[i] : false;
        this.poly(g, corners).fill({ color: lit ? this.accent : palette.ink, alpha: lit ? terraceStyle.litFloorAlpha : terraceStyle.floorAlpha * 0.5 });
        this.poly(g, corners).stroke({ color: palette.dim, width: 1, alpha: terraceStyle.floorAlpha + (lit ? 0.2 : 0) });
        if (glow && (castFront[x] !== this.level.front[x] || castSide[y] !== this.level.side[y])) {
          const pulse = 0.25 + 0.2 * Math.sin(this.time * 4 + x + y);
          this.poly(g, corners).fill({ color: palette.pearl, alpha: pulse });
        }
      }
    }
  }

  private drawStones(): void {
    const g = this.stones;
    g.clear();
    const n = this.n;
    for (const i of this.depthOrder()) {
      const h = this.shown[i]!;
      if (h <= 0.01) continue;
      const x = i % n;
      const y = Math.floor(i / n);
      const fixed = this.level.fixed[i]! >= 0;
      const color = fixed ? palette.dim : this.accent;
      const edge = fixed ? palette.pearl : this.accent;
      const corners = [
        [x, y],
        [x + 1, y],
        [x + 1, y + 1],
        [x, y + 1],
      ] as const;
      const cx = x + 0.5;
      const cy = y + 0.5;
      // Side faces: visible when their outward normal points toward the viewer.
      for (let e = 0; e < 4; e++) {
        const a = corners[e]!;
        const b = corners[(e + 1) % 4]!;
        const mid = this.rotated((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        const c = this.rotated(cx, cy);
        const nu = mid.u - c.u;
        const nv = mid.v - c.v;
        if (nu + nv <= 0) continue;
        const left = nu - nv < 0;
        const pts = [this.project(a[0], a[1], 0), this.project(b[0], b[1], 0), this.project(b[0], b[1], h), this.project(a[0], a[1], h)];
        this.poly(g, pts).fill({ color, alpha: (left ? terraceStyle.leftAlpha : terraceStyle.rightAlpha) * (fixed ? 1.4 : 1) });
        this.poly(g, pts).stroke({ color: edge, width: 1, alpha: terraceStyle.edgeAlpha * 0.6 });
        // Seams between stones, so a stack can be counted at a glance.
        for (let z = 1; z < h; z++) {
          const p = this.project(a[0], a[1], z);
          const q = this.project(b[0], b[1], z);
          g.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ color: palette.void, width: 1, alpha: 0.5 });
        }
      }
      const top = corners.map(([px, py]) => this.project(px, py, h));
      this.poly(g, top).fill({ color, alpha: terraceStyle.topAlpha * (fixed ? 1.1 : 1) });
      this.poly(g, top).stroke({ color: edge, width: 1.2, alpha: terraceStyle.edgeAlpha });
      if (fixed) {
        // A cracked line marks a stone that is set for good.
        const c0 = this.project(x + 0.25, y + 0.35, h);
        const c1 = this.project(x + 0.5, y + 0.55, h);
        const c2 = this.project(x + 0.75, y + 0.4, h);
        g.moveTo(c0.x, c0.y).lineTo(c1.x, c1.y).lineTo(c2.x, c2.y).stroke({ color: palette.void, width: 1, alpha: 0.7 });
      }
    }
  }

  private drawGhosts(): void {
    const g = this.ghosts;
    g.clear();
    const n = this.n;
    for (const [i, ghost] of this.ghostStacks) {
      if (ghost.until !== null && this.time > ghost.until) continue;
      const x = i % n;
      const y = Math.floor(i / n);
      const h = Math.max(ghost.height, 0.08);
      const pulse = 0.7 + 0.3 * Math.sin(this.time * 3 + i);
      const alpha = terraceStyle.ghostAlpha * pulse;
      const corners = [
        [x, y],
        [x + 1, y],
        [x + 1, y + 1],
        [x, y + 1],
      ] as const;
      const top = corners.map(([px, py]) => this.project(px, py, h));
      this.poly(g, top).stroke({ color: palette.pearl, width: 1.2, alpha });
      for (const [px, py] of corners) {
        const a = this.project(px, py, 0);
        const b = this.project(px, py, h);
        g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: palette.pearl, width: 1, alpha: alpha * 0.7 });
      }
      if (ghost.height === 0) {
        // An empty ghost: a small cross on the floor means "take these away".
        const c = this.project(x + 0.5, y + 0.5, 0);
        g.moveTo(c.x - 5, c.y - 3).lineTo(c.x + 5, c.y + 3).moveTo(c.x - 5, c.y + 3).lineTo(c.x + 5, c.y - 3).stroke({ color: palette.pearl, width: 1.2, alpha });
      }
    }
  }

  // The lantern gauge: fills as stones are placed; full means the count is right.
  private drawGauge(): void {
    const g = this.gauge;
    g.clear();
    if (this.level.count === null) return;
    const placed = stoneCount(this.heights);
    const want = this.level.count;
    const n = this.n;
    const reach = this.level.maxHeight * terraceStyle.shadowLength;
    const right = this.projectRotated(n / 2 + reach, -n / 2, 0);
    // Never off the edge on narrow screens.
    const x = Math.min(right.x + this.cell * 0.45, this.screenWidth - layout.hudInset);
    const bottom = this.projectRotated(n / 2 + reach, n / 2, 0).y;
    const unit = Math.min(10, (this.cubeH * this.level.maxHeight * 1.4) / want);
    const heightPx = unit * want;
    const w = terraceStyle.gaugeWidth;
    g.roundRect(x - w / 2, bottom - heightPx, w, heightPx, w / 2).fill({ color: palette.ink, alpha: 0.8 }).stroke({ color: palette.dim, width: 1 });
    const fill = Math.min(placed, want) * unit;
    const done = placed === want;
    if (fill > 0) g.roundRect(x - w / 2, bottom - fill, w, fill, w / 2).fill({ color: done ? palette.pearl : this.accent, alpha: done ? 0.9 : 0.6 });
    if (placed > want) {
      const over = Math.min(placed - want, want) * unit;
      g.roundRect(x - w / 2, bottom - heightPx - over, w, over, w / 2).fill({ color: palette.pearl, alpha: 0.35 });
    }
    // Ticks every stone, so the count can be read without numbers.
    for (let k = 1; k < want; k++) g.moveTo(x - w / 2, bottom - k * unit).lineTo(x + w / 2, bottom - k * unit).stroke({ color: palette.void, width: 1, alpha: 0.6 });
    g.circle(x, bottom - heightPx - 6, 2.2).fill({ color: done ? palette.pearl : this.accent, alpha: done ? 1 : alphas.hudIdle });
  }

  // ----- input -----

  private cellAt(local: Point): number {
    const n = this.n;
    const order = this.depthOrder().reverse();
    for (const i of order) {
      const x = i % n;
      const y = Math.floor(i / n);
      const h = Math.max(this.shown[i]!, 0);
      const corners = [
        [x, y],
        [x + 1, y],
        [x + 1, y + 1],
        [x, y + 1],
      ] as const;
      const top = corners.map(([px, py]) => this.project(px, py, h));
      if (pointInPolygon(local, top)) return i;
      if (h > 0) {
        for (let e = 0; e < 4; e++) {
          const a = corners[e]!;
          const b = corners[(e + 1) % 4]!;
          const pts = [this.project(a[0], a[1], 0), this.project(b[0], b[1], 0), this.project(b[0], b[1], h), this.project(a[0], a[1], h)];
          if (pointInPolygon(local, pts)) return i;
        }
      }
    }
    return -1;
  }

  private onDown(e: FederatedPointerEvent): void {
    if (this.solved) return;
    const local = this.container.toLocal(e.global);
    const i = this.cellAt(local);
    this.pressedCell = i;
    this.pressHandled = false;
    this.pressTimer?.kill();
    if (i < 0) return;
    if (e.button === 2 || e.shiftKey) {
      this.pressHandled = true;
      this.change(i, -1);
      return;
    }
    // Holding a stack takes a stone away (the touch equivalent of a right-click).
    this.pressTimer = gsap.delayedCall(terraceStyle.longPressSeconds, () => {
      this.pressHandled = true;
      this.change(i, -1);
    });
  }

  private onUp(e: FederatedPointerEvent): void {
    this.pressTimer?.kill();
    this.pressTimer = null;
    if (this.solved || this.pressHandled) return;
    const local = this.container.toLocal(e.global);
    const i = this.cellAt(local);
    if (i < 0 || i !== this.pressedCell) return;
    this.change(i, 1);
  }

  private cancelPress(): void {
    this.pressTimer?.kill();
    this.pressTimer = null;
  }

  private change(i: number, direction: 1 | -1): void {
    this.stopTutorial();
    const n = this.n;
    const x = i % n;
    const y = Math.floor(i / n);
    const cap = ceiling(this.level, x, y);
    if (this.level.fixed[i]! >= 0 || cap === 0) {
      this.nudge(i);
      return;
    }
    const before = this.heights[i]!;
    let next = before + direction;
    if (next > cap) next = 0;
    if (next < 0) next = cap;
    this.heights[i] = next;
    this.ghostStacks.delete(i);
    this.emit('move');
    if (next > before) this.voice.place(next);
    else this.voice.remove();
    gsap.to(this.shown, { [i]: next, duration: scaled(terraceStyle.growSeconds), ease: easings.tileSnap, onUpdate: () => (this.dirty = true) });
    this.dirty = true;
    if (isSolved(this.level, this.heights)) {
      this.solved = true;
      this.emit('solved');
    }
  }

  // A stack that cannot change answers with a small dull dip.
  private nudge(i: number): void {
    const from = this.shown[i]!;
    gsap.fromTo(this.shown, { [i]: from - 0.12 }, { [i]: from, duration: durations.microFeedback * 2, ease: easings.response, onUpdate: () => (this.dirty = true) });
    this.voice.refuse();
  }

  private turnView(): void {
    this.voice.turn();
    gsap.to(this, { angle: Math.round(this.angle) + 1, duration: scaled(terraceStyle.turnSeconds), ease: easings.response, overwrite: true, onUpdate: () => (this.dirty = true) });
  }

  update(dt: number): void {
    this.time += dt;
    if (this.ghostStacks.size || this.glowLines || this.time < this.brightUntil + 0.1) this.dirty = true;
    if (this.glowLines && this.time > this.glowLines.until) this.glowLines = null;
    for (const [i, g] of this.ghostStacks) if (g.until !== null && this.time > g.until) this.ghostStacks.delete(i);
    if (this.dirty) this.draw();
  }

  restart(): void {
    if (this.solved) return;
    this.stopTutorial();
    this.heights = startHeights(this.level);
    gsap.killTweensOf(this.shown);
    this.shown = this.heights.slice();
    this.ghostStacks.clear();
    this.glowLines = null;
    this.dirty = true;
    if (this.isTutorial) this.scheduleTutorial();
  }

  showClue(tier: ClueTier): string | void {
    if (this.solved) return;
    let caption: string | undefined;
    switch (tier) {
      case 1:
      case 2: {
        const exclude = new Set([...this.ghostStacks.keys()]);
        const found = stackClue(this.level, this.heights, tier === 1 ? 1 : 2, exclude, `${this.level.seed}:clue${tier}:${exclude.size}`);
        if (found.length === 0) return exclude.size ? 'Build the outlined stacks to the height of their outline.' : 'Every stack already matches a solution.';
        for (const f of found) this.ghostStacks.set(f.cell, { height: f.height, until: null });
        const removing = found.every((f) => f.height < this.heights[f.cell]!);
        caption = removing
          ? 'An outline marks a stack that is too tall. Take stones away until it matches.'
          : found.length === 1
            ? 'The pale outline shows how tall one stack should be. Build it to that height.'
            : 'Two more outlines show the height of their stacks. Build each to its outline.';
        break;
      }
      case 3:
        this.glowLines = { until: this.time + terraceStyle.clueSeconds };
        caption = 'For a moment, tiles in every row and column whose shadow is still wrong shimmer. Remember: no stack can rise above either of its shadows.';
        break;
      case 4:
        for (const f of halfClue(this.level, this.heights, `${this.level.seed}:clue4`)) {
          if (!this.ghostStacks.has(f.cell)) this.ghostStacks.set(f.cell, { height: f.height, until: this.time + terraceStyle.clueSeconds });
        }
        caption = 'For a moment, outlines show the right height of half the stacks.';
        break;
    }
    this.dirty = true;
    return caption;
  }

  private scheduleTutorial(): void {
    this.stopTutorial();
    this.tutorialTimer = gsap.delayedCall(terraceStyle.tutorialDelay, () => {
      const i = this.level.solution.findIndex((h, k) => h > 0 && this.level.fixed[k]! < 0);
      if (i < 0) return;
      if (!this.hand) {
        this.hand = new GhostHand();
        this.container.addChild(this.hand);
      }
      const p = this.project((i % this.n) + 0.5, Math.floor(i / this.n) + 0.5, 0);
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
    this.brightUntil = this.time + total;
    // The moon climbs behind the terrace and the whole view turns once, slowly.
    const moonR = this.cell * this.n * 0.28;
    this.moon.clear().circle(0, 0, moonR).fill({ color: palette.pearl, alpha: 0.16 });
    this.moon.filters = [createGlow(palette.pearl, { distance: 40, strength: 1.3, quality: 0.3 })];
    this.moon.position.set(this.centre.x, this.centre.y + this.cell);
    this.moon.alpha = 0;
    gsap.to(this.moon, { y: this.centre.y - this.cell * this.n * 0.5, alpha: 1, duration: total, ease: easings.ambient });
    gsap.to(this, { angle: Math.round(this.angle) + 1, duration: total * 0.9, ease: easings.ambient, overwrite: true, onUpdate: () => (this.dirty = true) });
    for (let i = 0; i < 40; i++) {
      const p = this.project(this.ctx.rng.next() * this.n, this.ctx.rng.next() * this.n, this.ctx.rng.next() * this.level.maxHeight);
      this.ctx.particles.emit({
        x: p.x,
        y: p.y,
        color: this.ctx.rng.chance(0.6) ? this.accent : palette.pearl,
        vx: (this.ctx.rng.next() - 0.5) * 6,
        vy: -8 - this.ctx.rng.next() * 16,
        life: 1.8 + this.ctx.rng.next(),
        alphaFrom: 0.6,
        scaleFrom: 0.25,
        scaleTo: 0.05,
      });
    }
    return new Promise((resolve) => gsap.delayedCall(total, resolve));
  }

  introLines(): string[] {
    const lines = [
      'Two lanterns stand behind the terrace. Stack stones until the shadows they throw on the sand match the shaded ones.',
      'Tap a tile to add a stone. Keep tapping and the stack climbs, then clears. Hold a stack (or right-click) to take one stone away.',
      'The pale outline in front of each row is the shadow your stones throw right now. Only the tallest stone in a row sets how long its shadow is.',
      'The button at the bottom left turns the terrace so you can see it from every side.',
    ];
    if (this.level.footprint) lines.push('Every moonlit tile must carry at least one stone. Dark tiles stay empty.');
    if (this.level.count !== null) lines.push('The lantern beside the terrace fills as you place stones. It must be exactly full: no stone more, no stone fewer.');
    if (this.level.fixed.some((f) => f >= 0)) lines.push('Grey stacks are set already and cannot be changed.');
    return lines;
  }

  introGlyph(): Container {
    const root = new Container();
    const cell = 26;
    const cubeH = cell * terraceStyle.cubeHeight;
    const len = terraceStyle.shadowLength;
    const n = 2;
    const half = n / 2;
    const pr = (u: number, v: number, z: number): Point => ({ x: ((u - v) * cell) / 2, y: ((u + v) * cell) / 4 - z * cubeH - 4 });
    const project = (gx: number, gy: number, z: number): Point => pr(gx - half, gy - half, z);
    const g = new Graphics();
    const tap = new Graphics().circle(0, 0, 7).fill({ color: palette.pearl, alpha: 0.6 });
    tap.alpha = 0;
    root.addChild(g, tap);
    const footprint = !!this.level.footprint;
    const counted = this.level.count !== null;
    const fixed = this.level.fixed.some((f) => f >= 0);
    const target = [2, 0, fixed ? 1 : 0, 1]; // cell (0,0) climbs to two; (1,1) to one
    const state = { h: 0, h2: 0 };
    const draw = () => {
      g.clear();
      const heights = [state.h, 0, target[2]!, state.h2];
      const front = [Math.max(heights[0]!, heights[2]!), Math.max(heights[1]!, heights[3]!)];
      const side = [Math.max(heights[0]!, heights[1]!), Math.max(heights[2]!, heights[3]!)];
      const wantFront = [2, 1];
      const wantSide = [2, 1];
      // Lanterns behind the far edges.
      for (const [u, v] of [
        [-half - 0.8, 0],
        [0, -half - 0.8],
      ]) {
        const p = pr(u!, v!, 1.6);
        g.circle(p.x, p.y, 7).fill({ color: this.accent, alpha: 0.1 });
        g.roundRect(p.x - 2, p.y - 3, 4, 6, 1.5).fill({ color: this.accent, alpha: 0.6 });
      }
      // Floor.
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const i = y * n + x;
          const corners = [project(x, y, 0), project(x + 1, y, 0), project(x + 1, y + 1, 0), project(x, y + 1, 0)];
          const lit = footprint && target[i]! > 0;
          this.poly(g, corners).fill({ color: lit ? this.accent : palette.ink, alpha: lit ? terraceStyle.litFloorAlpha : 0.2 }).stroke({ color: palette.dim, width: 1 });
        }
      }
      // Ground shadows: 'v' bars (per x) stretch away in +v; 'u' bars (per y) in +u.
      const bar = (family: 'u' | 'v', j: number, want: number, cast: number) => {
        const at = (sv: number, reach: number) => (family === 'v' ? pr(sv, half + reach, 0) : pr(half + reach, sv, 0));
        const s0 = j - half + 0.06;
        const s1 = j + 1 - half - 0.06;
        if (want > 0) this.poly(g, [at(s0, 0), at(s1, 0), at(s1, want * len), at(s0, want * len)]).fill({ color: this.accent, alpha: want === cast ? terraceStyle.shadowMatchedAlpha : terraceStyle.shadowAlpha });
        if (cast > 0.05) this.poly(g, [at(s0, 0), at(s1, 0), at(s1, cast * len), at(s0, cast * len)]).stroke({ color: palette.pearl, width: 1, alpha: 0.65 });
      };
      for (let j = 0; j < n; j++) {
        bar('v', j, wantFront[j]!, front[j]!);
        bar('u', j, wantSide[j]!, side[j]!);
      }
      // Stones, back to front.
      for (const i of [0, 1, 2, 3]) {
        const h = heights[i]!;
        if (h <= 0.01) continue;
        const x = i % n;
        const y = Math.floor(i / n);
        const isFixed = fixed && i === 2;
        const color = isFixed ? palette.dim : this.accent;
        const right = [project(x + 1, y, 0), project(x + 1, y + 1, 0), project(x + 1, y + 1, h), project(x + 1, y, h)];
        const left = [project(x, y + 1, 0), project(x + 1, y + 1, 0), project(x + 1, y + 1, h), project(x, y + 1, h)];
        this.poly(g, left).fill({ color, alpha: terraceStyle.leftAlpha * (isFixed ? 1.4 : 1) });
        this.poly(g, right).fill({ color, alpha: terraceStyle.rightAlpha * (isFixed ? 1.4 : 1) });
        const top = [project(x, y, h), project(x + 1, y, h), project(x + 1, y + 1, h), project(x, y + 1, h)];
        this.poly(g, top).fill({ color, alpha: terraceStyle.topAlpha }).stroke({ color: isFixed ? palette.pearl : this.accent, width: 1, alpha: 0.6 });
      }
      if (counted) {
        const x = cell * 2.1;
        const bottom = 14;
        const placed = Math.round(heights.reduce((a, b) => a + b, 0));
        const want = 3 + (fixed ? 1 : 0);
        const unit = 7;
        g.roundRect(x - 3, bottom - unit * want, 6, unit * want, 3).fill({ color: palette.ink, alpha: 0.8 }).stroke({ color: palette.dim, width: 1 });
        const fill = Math.min(placed, want) * unit;
        if (fill > 0) g.roundRect(x - 3, bottom - fill, 6, fill, 3).fill({ color: placed === want ? palette.pearl : this.accent, alpha: 0.7 });
      }
    };
    draw();
    const p0 = project(0.5, 0.5, 0);
    const p3 = project(1.5, 1.5, 0);
    const tl = gsap
      .timeline({ repeat: -1, repeatDelay: 1.2 })
      .set(tap, { x: p0.x, y: p0.y })
      .to(tap, { alpha: 1, duration: 0.2, delay: 0.5 })
      .to(tap.scale, { x: 0.7, y: 0.7, duration: 0.15, yoyo: true, repeat: 1 })
      .to(state, { h: 1, duration: 0.3, ease: easings.tileSnap, onUpdate: draw })
      .to(tap.scale, { x: 0.7, y: 0.7, duration: 0.15, yoyo: true, repeat: 1, delay: 0.5 })
      .to(state, { h: 2, duration: 0.3, ease: easings.tileSnap, onUpdate: draw })
      .to(tap, { x: p3.x, y: p3.y, duration: 0.6, ease: easings.ambient, delay: 0.3 })
      .to(tap.scale, { x: 0.7, y: 0.7, duration: 0.15, yoyo: true, repeat: 1 })
      .to(state, { h2: 1, duration: 0.3, ease: easings.tileSnap, onUpdate: draw })
      .to(tap, { alpha: 0, duration: 0.3, delay: 0.8 })
      .call(() => {
        state.h = 0;
        state.h2 = 0;
        draw();
      }, undefined, '+=0.6');
    root.on('destroyed', () => tl.kill());
    return root;
  }

  // Dev only: faint outlines of the stored solution's stacks.
  showSolutionOverlay(): void {
    this.level.solution.forEach((h, i) => {
      if (h !== this.heights[i]) this.ghostStacks.set(i, { height: h, until: null });
    });
    this.dirty = true;
  }

  destroy(): void {
    this.stopTutorial();
    this.pressTimer?.kill();
    this.unsubscribe();
    this.voice.dispose();
    gsap.killTweensOf(this.shown);
    gsap.killTweensOf(this);
    gsap.killTweensOf(this.moon);
    this.container.destroy({ children: true });
  }
}

function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
