import gsap from 'gsap';
import { Container, type FederatedPointerEvent, Graphics } from 'pixi.js';
import type { ClueTier, IntroPage, LevelScene, ShellContext } from '../types';
import { alphas, palette } from '../../design/palette';
import { durations, easings, scaled } from '../../design/motion';
import { isTouch, layout, puzzleArea } from '../../design/layout';
import { createGlow } from '../../fx/glow';
import { GhostHand } from '../../ui/ghostHand';
import { holdAt, liftFinger, makeFinger, refuse, tapAt } from '../../ui/introGlyphs';
import { events } from '../../core/events';
import { type ShadowLevel, frontProfile, isSolved, sideProfile, startHeights, stoneCount } from './model';
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
  swipeStart: 14, // px of sideways travel before a press becomes a swipe
  swipeQuarter: 220, // px of swipe for a quarter turn
  growSeconds: 0.28,
  longPressSeconds: 0.55,
  clueSeconds: 3,
  tutorialDelay: 1.6,
  gaugeWidth: 6,
  shadowLength: 0.42, // ground shadow per stone, in cells
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
  // Dragging sideways across the terrace turns it; the drag starts as a possible tap.
  private press: { x: number; y: number; angle: number; swiping: boolean } | null = null;
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
    this.hit.on('pointerupoutside', () => this.onRelease(null));
    this.hit.on('globalpointermove', (e: FederatedPointerEvent) => this.onMove(e));
    this.container.addChild(this.hit, this.moon, this.walls, this.floor, this.stones, this.ghosts, this.gauge);
    this.layout(ctx.width, ctx.height);
    // The arrow keys turn the terrace for keyboard players.
    this.unsubscribe = events.on('input:key', (key) => {
      if (key === 'ArrowRight' || key === 'r') this.turnView(1);
      if (key === 'ArrowLeft') this.turnView(-1);
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
        const corners = [this.project(x, y, 0), this.project(x + 1, y, 0), this.project(x + 1, y + 1, 0), this.project(x, y + 1, 0)];
        this.poly(g, corners).fill({ color: palette.ink, alpha: terraceStyle.floorAlpha * 0.5 });
        this.poly(g, corners).stroke({ color: palette.dim, width: 1, alpha: terraceStyle.floorAlpha });
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
    gsap.killTweensOf(this);
    this.press = { x: e.global.x, y: e.global.y, angle: this.angle, swiping: false };
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

  private onMove(e: FederatedPointerEvent): void {
    const press = this.press;
    if (!press) return;
    const dx = e.global.x - press.x;
    const dy = e.global.y - press.y;
    if (!press.swiping) {
      if (Math.abs(dx) < terraceStyle.swipeStart || Math.abs(dx) < Math.abs(dy)) return;
      press.swiping = true;
      this.pressHandled = true;
      this.pressTimer?.kill();
      this.pressTimer = null;
      this.stopTutorial();
    }
    // The terrace follows the finger: a quarter turn per swipe width.
    this.angle = press.angle + dx / terraceStyle.swipeQuarter;
    this.dirty = true;
  }

  private onUp(e: FederatedPointerEvent): void {
    this.onRelease(e);
  }

  // Ends a press: a swipe settles on the nearest quarter turn, a tap adds a stone.
  private onRelease(e: FederatedPointerEvent | null): void {
    this.pressTimer?.kill();
    this.pressTimer = null;
    const press = this.press;
    this.press = null;
    if (press?.swiping) {
      this.settleView();
      return;
    }
    if (!e || this.solved || this.pressHandled) return;
    const local = this.container.toLocal(e.global);
    const i = this.cellAt(local);
    if (i < 0 || i !== this.pressedCell) return;
    this.change(i, 1);
  }

  private settleView(): void {
    const target = Math.round(this.angle);
    if (Math.abs(target - this.angle) > 0.01) this.voice.turn();
    gsap.to(this, { angle: target, duration: scaled(terraceStyle.turnSeconds) * 0.6, ease: easings.response, overwrite: true, onUpdate: () => (this.dirty = true) });
  }

  // Stacks may climb to the level's full height: too tall is a mistake the shadows show.
  private change(i: number, direction: 1 | -1): void {
    this.stopTutorial();
    const cap = this.level.maxHeight;
    if (this.level.fixed[i]! >= 0) {
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

  private turnView(direction: 1 | -1): void {
    this.voice.turn();
    gsap.to(this, { angle: Math.round(this.angle) + direction, duration: scaled(terraceStyle.turnSeconds), ease: easings.response, overwrite: true, onUpdate: () => (this.dirty = true) });
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

  // ----- instruction pages -----

  // A miniature terrace for the instruction card: draws stacks, lanterns and ground shadows
  // for any heights and view angle, so each page can show exactly one idea.
  private miniTerrace(n: number, opts: { want?: { front: number[]; side: number[] }; fixed?: number[]; gauge?: number } = {}): {
    root: Container;
    g: Graphics;
    draw: (heights: number[], angle?: number) => void;
    floorAt: (x: number, y: number, angle?: number) => Point;
  } {
    const cell = n >= 3 ? 24 : 32;
    const cubeH = cell * terraceStyle.cubeHeight;
    const len = terraceStyle.shadowLength;
    const half = n / 2;
    const yShift = 8;
    const rot = (gx: number, gy: number, angle: number) => {
      const th = (angle * Math.PI) / 2;
      const u0 = gx - half;
      const v0 = gy - half;
      return { u: u0 * Math.cos(th) - v0 * Math.sin(th), v: u0 * Math.sin(th) + v0 * Math.cos(th) };
    };
    const pr = (u: number, v: number, z: number): Point => ({ x: ((u - v) * cell) / 2, y: ((u + v) * cell) / 4 - z * cubeH + yShift });
    const project = (gx: number, gy: number, z: number, angle: number): Point => {
      const r = rot(gx, gy, angle);
      return pr(r.u, r.v, z);
    };
    const root = new Container();
    const g = new Graphics();
    root.addChild(g);
    const draw = (heights: number[], angle = 0) => {
      g.clear();
      const k = ((Math.round(angle) % 4) + 4) % 4;
      const fade = Math.max(0, 1 - Math.abs(angle - Math.round(angle)) * 3);
      // Floor.
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const corners = [project(x, y, 0, angle), project(x + 1, y, 0, angle), project(x + 1, y + 1, 0, angle), project(x, y + 1, 0, angle)];
          this.poly(g, corners).fill({ color: palette.ink, alpha: 0.2 }).stroke({ color: palette.dim, width: 1 });
        }
      }
      // Ground shadows for the nearest resting view, from the wanted and the cast profiles.
      if (fade > 0) {
        const castFront = frontProfile(n, heights.map((h) => Math.round(h)));
        const castSide = sideProfile(n, heights.map((h) => Math.round(h)));
        const th = (k * Math.PI) / 2;
        const world = (i: number, j: number) => {
          const u = i + 0.5 - half;
          const v = j + 0.5 - half;
          const u0 = u * Math.cos(th) + v * Math.sin(th);
          const v0 = -u * Math.sin(th) + v * Math.cos(th);
          return { x: Math.round(u0 - 0.5 + half), y: Math.round(v0 - 0.5 + half) };
        };
        const bar = (family: 'u' | 'v', j: number, want: number, cast: number) => {
          const at = (sv: number, reach: number) => (family === 'v' ? pr(sv, half + reach, 0) : pr(half + reach, sv, 0));
          const s0 = j - half + 0.06;
          const s1 = j + 1 - half - 0.06;
          if (want > 0) this.poly(g, [at(s0, 0), at(s1, 0), at(s1, want * len), at(s0, want * len)]).fill({ color: this.accent, alpha: (want === cast ? terraceStyle.shadowMatchedAlpha : terraceStyle.shadowAlpha) * fade });
          if (cast > 0) this.poly(g, [at(s0, 0), at(s1, 0), at(s1, cast * len), at(s0, cast * len)]).stroke({ color: palette.pearl, width: 1, alpha: 0.65 * fade });
        };
        for (let j = 0; j < n; j++) {
          // 'v' bars index the rotated u axis (slot i = j), 'u' bars the rotated v axis.
          const a = world(j, 0);
          const b = world(j, 1);
          const vWant = a.x === b.x ? opts.want?.front[a.x] : opts.want?.side[a.y];
          const vCast = a.x === b.x ? castFront[a.x]! : castSide[a.y]!;
          bar('v', j, vWant ?? vCast, vCast);
          const c = world(0, j);
          const d = world(1, j);
          const uWant = c.x === d.x ? opts.want?.front[c.x] : opts.want?.side[c.y];
          const uCast = c.x === d.x ? castFront[c.x]! : castSide[c.y]!;
          bar('u', j, uWant ?? uCast, uCast);
        }
      }
      // Stacks, back to front.
      const order = heights.map((_, i) => i).sort((p, q) => {
        const rp = rot((p % n) + 0.5, Math.floor(p / n) + 0.5, angle);
        const rq = rot((q % n) + 0.5, Math.floor(q / n) + 0.5, angle);
        return rp.u + rp.v - (rq.u + rq.v);
      });
      for (const i of order) {
        const h = heights[i]!;
        if (h <= 0.01) continue;
        const x = i % n;
        const y = Math.floor(i / n);
        const isFixed = (opts.fixed?.[i] ?? -1) >= 0;
        const color = isFixed ? palette.dim : this.accent;
        const corners = [
          [x, y],
          [x + 1, y],
          [x + 1, y + 1],
          [x, y + 1],
        ] as const;
        const cc = rot(x + 0.5, y + 0.5, angle);
        for (let e = 0; e < 4; e++) {
          const p0 = corners[e]!;
          const p1 = corners[(e + 1) % 4]!;
          const mid = rot((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, angle);
          const nu = mid.u - cc.u;
          const nv = mid.v - cc.v;
          if (nu + nv <= 0) continue;
          const left = nu - nv < 0;
          const pts = [project(p0[0], p0[1], 0, angle), project(p1[0], p1[1], 0, angle), project(p1[0], p1[1], h, angle), project(p0[0], p0[1], h, angle)];
          this.poly(g, pts).fill({ color, alpha: (left ? terraceStyle.leftAlpha : terraceStyle.rightAlpha) * (isFixed ? 1.4 : 1) });
          for (let z = 1; z < h; z++) {
            const q0 = project(p0[0], p0[1], z, angle);
            const q1 = project(p1[0], p1[1], z, angle);
            g.moveTo(q0.x, q0.y).lineTo(q1.x, q1.y).stroke({ color: palette.void, width: 1, alpha: 0.5 });
          }
        }
        const top = corners.map(([px, py]) => project(px, py, h, angle));
        this.poly(g, top).fill({ color, alpha: terraceStyle.topAlpha }).stroke({ color: isFixed ? palette.pearl : this.accent, width: 1, alpha: 0.6 });
        if (isFixed) {
          const c0 = project(x + 0.25, y + 0.35, h, angle);
          const c1 = project(x + 0.5, y + 0.55, h, angle);
          const c2 = project(x + 0.75, y + 0.4, h, angle);
          g.moveTo(c0.x, c0.y).lineTo(c1.x, c1.y).lineTo(c2.x, c2.y).stroke({ color: palette.void, width: 1, alpha: 0.7 });
        }
      }
      // The lantern gauge.
      if (opts.gauge) {
        const want = opts.gauge;
        const placed = Math.round(heights.reduce((p, q) => p + q, 0));
        const gx = cell * (half + 1.6);
        const bottom = yShift + cell * 0.6;
        const unit = 7;
        g.roundRect(gx - 3, bottom - unit * want, 6, unit * want, 3).fill({ color: palette.ink, alpha: 0.8 }).stroke({ color: palette.dim, width: 1 });
        const fill = Math.min(placed, want) * unit;
        if (fill > 0) g.roundRect(gx - 3, bottom - fill, 6, fill, 3).fill({ color: placed === want ? palette.pearl : this.accent, alpha: 0.75 });
        if (placed > want) g.roundRect(gx - 3, bottom - unit * want - (placed - want) * unit, 6, (placed - want) * unit, 3).fill({ color: palette.pearl, alpha: 0.35 });
        for (let t = 1; t < want; t++) g.moveTo(gx - 3, bottom - t * unit).lineTo(gx + 3, bottom - t * unit).stroke({ color: palette.void, width: 1, alpha: 0.6 });
      }
    };
    const floorAt = (x: number, y: number, angle = 0) => project(x + 0.5, y + 0.5, 0, angle);
    return { root, g, draw, floorAt };
  }

  introPages(): IntroPage[] {
    const pages: IntroPage[] = [];
    // 1. Shadows: two stacks rise and their shadows grow to meet the shaded ones.
    pages.push({
      caption: 'Light falls on the terrace from behind. Stack stones until the shadows they throw on the sand match the shaded ones. Only the tallest stone in a row sets how long its shadow is.',
      glyph: () => {
        const t = this.miniTerrace(2, { want: { front: [2, 1], side: [2, 1] } });
        const finger = makeFinger();
        t.root.addChild(finger);
        const state = { h0: 0, h3: 0 };
        const redraw = () => t.draw([state.h0, 0, 0, state.h3]);
        redraw();
        const p0 = t.floorAt(0, 0);
        const p3 = t.floorAt(1, 1);
        const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.4 });
        tapAt(tl, finger, p0.x, p0.y, 0.5).to(state, { h0: 1, duration: 0.3, ease: easings.tileSnap, onUpdate: redraw });
        tl.to(finger.scale, { x: 0.7, y: 0.7, duration: 0.14, yoyo: true, repeat: 1, delay: 0.5 }).to(state, { h0: 2, duration: 0.3, ease: easings.tileSnap, onUpdate: redraw });
        tl.to(finger, { x: p3.x, y: p3.y, duration: 0.6, ease: easings.ambient, delay: 0.3 });
        tl.to(finger.scale, { x: 0.7, y: 0.7, duration: 0.14, yoyo: true, repeat: 1 }).to(state, { h3: 1, duration: 0.3, ease: easings.tileSnap, onUpdate: redraw });
        liftFinger(tl, finger, 0.8);
        tl.call(() => { state.h0 = 0; state.h3 = 0; redraw(); }, undefined, '+=0.6');
        t.root.on('destroyed', () => tl.kill());
        return t.root;
      },
    });
    // 2. Controls: climb, wrap to nothing, hold to take one away; too tall shows in the shadow.
    pages.push({
      caption: isTouch()
        ? 'Tap a tile to add a stone. Keep tapping and the stack climbs, then clears. Hold a stack to take one stone away. A stack that is too tall throws a shadow past the shaded one.'
        : 'Click a tile to add a stone. Keep clicking and the stack climbs, then clears. Right-click a stack to take one stone away. A stack that is too tall throws a shadow past the shaded one.',
      glyph: () => {
        const t = this.miniTerrace(1, { want: { front: [2], side: [2] } });
        const finger = makeFinger();
        const ring = new Graphics();
        t.root.addChild(ring, finger);
        const state = { h: 0 };
        const redraw = () => t.draw([state.h]);
        redraw();
        const p = t.floorAt(0, 0);
        const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.2 });
        tapAt(tl, finger, p.x, p.y, 0.5).to(state, { h: 1, duration: 0.25, ease: easings.tileSnap, onUpdate: redraw });
        for (const h of [2, 3]) tl.to(finger.scale, { x: 0.7, y: 0.7, duration: 0.14, yoyo: true, repeat: 1, delay: 0.5 }).to(state, { h, duration: 0.25, ease: easings.tileSnap, onUpdate: redraw });
        tl.to(finger.scale, { x: 0.7, y: 0.7, duration: 0.14, yoyo: true, repeat: 1, delay: 0.8 }).to(state, { h: 0, duration: 0.25, ease: easings.tileSnap, onUpdate: redraw });
        tl.to(finger.scale, { x: 0.7, y: 0.7, duration: 0.14, yoyo: true, repeat: 1, delay: 0.6 }).to(state, { h: 1, duration: 0.25, ease: easings.tileSnap, onUpdate: redraw });
        tl.to(finger.scale, { x: 0.7, y: 0.7, duration: 0.14, yoyo: true, repeat: 1, delay: 0.4 }).to(state, { h: 2, duration: 0.25, ease: easings.tileSnap, onUpdate: redraw });
        tl.to(finger.scale, { x: 0.7, y: 0.7, duration: 0.14, yoyo: true, repeat: 1, delay: 0.4 }).to(state, { h: 3, duration: 0.25, ease: easings.tileSnap, onUpdate: redraw });
        if (isTouch()) holdAt(tl, finger, ring, p.x, p.y, 0.7, 0.6);
        else tapAt(tl, finger, p.x, p.y, 0.6);
        tl.to(state, { h: 2, duration: 0.25, ease: easings.tileSnap, onUpdate: redraw });
        liftFinger(tl, finger, 0.8);
        tl.call(() => { state.h = 0; redraw(); }, undefined, '+=0.4');
        t.root.on('destroyed', () => tl.kill());
        return t.root;
      },
    });
    // 3. Turning the view.
    pages.push({
      caption: isTouch()
        ? 'Swipe sideways across the terrace to turn it and look at it from every side. Stacks in front can hide the ones behind.'
        : 'Drag sideways across the terrace to turn it and look at it from every side. Stacks in front can hide the ones behind.',
      glyph: () => {
        const t = this.miniTerrace(2);
        const finger = makeFinger();
        t.root.addChild(finger);
        const state = { a: 0 };
        const heights = [2, 0, 0, 1];
        t.draw(heights, 0);
        const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.2 });
        // The finger presses beside the stones and pulls across; the terrace follows it.
        tl.set(finger, { x: -55, y: 40 })
          .to(finger, { alpha: 1, duration: 0.2, delay: 0.5 })
          .to(finger.scale, { x: 0.7, y: 0.7, duration: 0.14 })
          .to(finger, { x: 55, duration: 1.1, ease: easings.ambient })
          .to(state, { a: 1, duration: 1.1, ease: easings.ambient, onUpdate: () => t.draw(heights, state.a) }, '<')
          .to(finger.scale, { x: 1, y: 1, duration: 0.14 });
        liftFinger(tl, finger);
        tl.set(finger, { x: -55 })
          .to(finger, { alpha: 1, duration: 0.2, delay: 0.5 })
          .to(finger.scale, { x: 0.7, y: 0.7, duration: 0.14 })
          .to(finger, { x: 55, duration: 1.1, ease: easings.ambient })
          .to(state, { a: 2, duration: 1.1, ease: easings.ambient, onUpdate: () => t.draw(heights, state.a) }, '<')
          .to(finger.scale, { x: 1, y: 1, duration: 0.14 });
        liftFinger(tl, finger);
        tl.call(() => { state.a = 0; t.draw(heights, 0); }, undefined, '+=0.8');
        t.root.on('destroyed', () => tl.kill());
        return t.root;
      },
    });
    // 4. The lantern gauge.
    if (this.level.count !== null) {
      pages.push({
        caption: 'The lantern beside the terrace fills as you place stones. It must be exactly full: not one stone more, not one fewer.',
        glyph: () => {
          const t = this.miniTerrace(2, { want: { front: [2, 1], side: [2, 1] }, gauge: 3 });
          const finger = makeFinger();
          t.root.addChild(finger);
          const state = { h0: 0, h3: 0, h1: 0 };
          const redraw = () => t.draw([state.h0, state.h1, 0, state.h3]);
          redraw();
          const p0 = t.floorAt(0, 0);
          const p1 = t.floorAt(1, 0);
          const p3 = t.floorAt(1, 1);
          const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.4 });
          tapAt(tl, finger, p0.x, p0.y, 0.5).to(state, { h0: 1, duration: 0.25, ease: easings.tileSnap, onUpdate: redraw });
          tl.to(finger.scale, { x: 0.7, y: 0.7, duration: 0.14, yoyo: true, repeat: 1, delay: 0.4 }).to(state, { h0: 2, duration: 0.25, ease: easings.tileSnap, onUpdate: redraw });
          tl.to(finger, { x: p3.x, y: p3.y, duration: 0.5, ease: easings.ambient, delay: 0.3 });
          tl.to(finger.scale, { x: 0.7, y: 0.7, duration: 0.14, yoyo: true, repeat: 1 }).to(state, { h3: 1, duration: 0.25, ease: easings.tileSnap, onUpdate: redraw });
          // One stone too many: the lantern spills over.
          tl.to(finger, { x: p1.x, y: p1.y, duration: 0.5, ease: easings.ambient, delay: 0.8 });
          tl.to(finger.scale, { x: 0.7, y: 0.7, duration: 0.14, yoyo: true, repeat: 1 }).to(state, { h1: 1, duration: 0.25, ease: easings.tileSnap, onUpdate: redraw });
          liftFinger(tl, finger, 0.9);
          tl.call(() => { state.h0 = 0; state.h1 = 0; state.h3 = 0; redraw(); }, undefined, '+=0.4');
          t.root.on('destroyed', () => tl.kill());
          return t.root;
        },
      });
    }
    // 5. Fixed stacks.
    if (this.level.fixed.some((f) => f >= 0)) {
      pages.push({
        caption: 'A grey stack is set already and cannot be changed. Build the rest around it.',
        glyph: () => {
          const t = this.miniTerrace(2, { fixed: [-1, -1, 2, -1] });
          const finger = makeFinger();
          t.root.addChild(finger);
          const heights = [0, 0, 2, 0];
          t.draw(heights);
          const p = t.floorAt(0, 1);
          const top = { x: p.x, y: p.y - 26 * terraceStyle.cubeHeight * 2 };
          const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.2 });
          tapAt(tl, finger, top.x, top.y, 0.6);
          refuse(tl, t.g);
          liftFinger(tl, finger);
          t.root.on('destroyed', () => tl.kill());
          return t.root;
        },
      });
    }
    return pages;
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
