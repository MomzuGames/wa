import gsap from 'gsap';
import { Container, type FederatedPointerEvent, Graphics } from 'pixi.js';
import type { IntroPage, LevelScene, ShellContext, Tip } from '../../types';
import { palette } from '../../../design/palette';
import { durations, easings, scaled } from '../../../design/motion';
import { puzzleArea } from '../../../design/layout';
import { liftFinger, makeFinger } from '../../../ui/introGlyphs';
import { createTidepoolsVoice, type TidepoolsVoice } from '../sound';
import { type ClueKind, DIRS, type ShellLevel, clueMet, edgeAt, edgeEnds, exits, isSolved } from './model';
import { type Deduction, type Reason, solveByLogic } from './solver';

// Shells and stones: the player draws one closed loop of tide through the pool's points.
// Drag from point to point to draw; drag back over a line to erase it; tap a point to
// clear the lines at it. Clues glow softly once they are met.

const poolStyle = {
  maxCell: 74,
  pointRadius: 2.6,
  lineWidth: 0.13, // of a cell
  clueRadius: 0.27, // of a cell
  snap: 0.42, // of a cell: how close the finger must come to a point
} as const;

type Handler = () => void;

const NUDGE: Record<Reason, string> = {
  point: 'Look at the ringed point. Every point the tide visits has exactly one way in and one way out.',
  stone: 'Look at the ringed stone. It turns the tide and runs straight on one more step each side, and only one way fits.',
  shell: 'Look at the ringed shell. The tide passes straight through, and one direction is blocked.',
  'shell-turn': 'Look at the ringed shell. The tide must turn just before or just after it.',
  'small-loop': 'Look at the ringed point. Joining there would close a small loop and leave the rest of the tide out.',
  'what-if': 'Try the ringed spot in your head: one way leads straight to a dead end.',
};

export class ShellPoolScene implements LevelScene {
  readonly container = new Container();
  private water = new Graphics();
  private points = new Graphics();
  private glow = new Graphics();
  private lines = new Graphics();
  private clueLayer = new Graphics();
  private hintLayer = new Container();
  private hit = new Graphics();
  private drawn = new Set<number>();
  private handlers: Record<'attempt' | 'solved' | 'move', Handler[]> = { attempt: [], solved: [], move: [] };
  private cell = 40;
  private origin = { x: 0, y: 0 };
  private dragging: { last: { x: number; y: number }; mode: 'draw' | 'erase' | null; changed: boolean; start: { x: number; y: number } } | null = null;
  private solved = false;
  private voice: TidepoolsVoice;
  private accent = palette.mint;
  private time = 0;
  // Hints never draw for the player: a nudge rings where to look, then a faint line shows
  // the next stretch of tide (or a drawn line pulses when it cannot be right).
  private logic: Deduction[];
  private hintTarget: Deduction | null = null;
  private nudge: { g: Graphics; tween: gsap.core.Tween } | null = null;
  private ghosts = new Map<number, Graphics>();
  private hintCount = 0;

  constructor(
    ctx: ShellContext,
    private level: ShellLevel,
  ) {
    this.voice = createTidepoolsVoice(ctx.audio);
    this.logic = solveByLogic(level).deductions;
    for (const g of [this.water, this.points, this.glow, this.lines, this.clueLayer]) g.eventMode = 'none';
    this.hintLayer.eventMode = 'none';
    this.hit.eventMode = 'static';
    this.hit.on('pointerdown', (e: FederatedPointerEvent) => this.onDown(e));
    this.hit.on('globalpointermove', (e: FederatedPointerEvent) => this.onMove(e));
    this.hit.on('pointerup', () => this.onUp());
    this.hit.on('pointerupoutside', () => this.onUp());
    this.container.addChild(this.hit, this.water, this.points, this.glow, this.lines, this.clueLayer, this.hintLayer);
    this.layout(ctx.width, ctx.height);
  }

  on(event: 'attempt' | 'solved' | 'move', cb: Handler): void {
    this.handlers[event].push(cb);
  }

  private emit(event: 'attempt' | 'solved' | 'move'): void {
    this.handlers[event].forEach((h) => h());
  }

  // ----- layout and drawing -----

  layout(width: number, height: number): void {
    const area = puzzleArea(width, height);
    const { width: w, height: h } = this.level;
    this.cell = Math.min(poolStyle.maxCell, area.width / w, area.height / h);
    this.origin = { x: width / 2 - ((w - 1) * this.cell) / 2, y: area.y + area.height / 2 - ((h - 1) * this.cell) / 2 };
    this.hit.clear().rect(0, 0, width, height).fill({ color: palette.pearl, alpha: 0.001 });
    const pad = this.cell * 0.55;
    this.water
      .clear()
      .roundRect(this.origin.x - pad, this.origin.y - pad, (w - 1) * this.cell + pad * 2, (h - 1) * this.cell + pad * 2, this.cell * 0.5)
      .fill({ color: palette.ink, alpha: 0.75 })
      .stroke({ color: palette.dim, width: 1, alpha: 0.8 });
    this.points.clear();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) this.points.circle(this.px(x), this.py(y), poolStyle.pointRadius).fill({ color: palette.pearl, alpha: 0.25 });
    this.redraw();
    this.rebuildHints();
  }

  resize(width: number, height: number): void {
    this.layout(width, height);
  }

  private px(x: number): number {
    return this.origin.x + x * this.cell;
  }

  private py(y: number): number {
    return this.origin.y + y * this.cell;
  }

  private redraw(): void {
    const { width: w, height: h } = this.level;
    const lw = this.cell * poolStyle.lineWidth;
    this.lines.clear();
    this.glow.clear();
    for (const e of this.drawn) {
      const [a, b] = edgeEnds(w, h, e);
      this.glow.moveTo(this.px(a.x), this.py(a.y)).lineTo(this.px(b.x), this.py(b.y));
      this.lines.moveTo(this.px(a.x), this.py(a.y)).lineTo(this.px(b.x), this.py(b.y));
    }
    this.glow.stroke({ color: this.accent, width: lw * 3, alpha: 0.12, cap: 'round' });
    this.lines.stroke({ color: this.accent, width: lw, alpha: 0.95, cap: 'round', join: 'round' });
    // Open ends of the drawn tide show as small dots.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (exits(this.level, this.drawn, x, y).length === 1) this.lines.circle(this.px(x), this.py(y), lw * 0.9).fill({ color: this.accent });
      }
    }
    this.drawClues();
  }

  private drawClues(): void {
    const g = this.clueLayer;
    g.clear();
    const r = this.cell * poolStyle.clueRadius;
    for (const c of this.level.clues) {
      const met = clueMet(this.level, this.drawn, c);
      const x = this.px(c.x);
      const y = this.py(c.y);
      if (met) g.circle(x, y, r * 1.6).fill({ color: this.accent, alpha: 0.14 });
      if (c.kind === 'shell') {
        g.circle(x, y, r).fill({ color: palette.ink }).stroke({ color: met ? this.accent : palette.pearl, width: 2.2, alpha: 0.95 });
      } else {
        g.circle(x, y, r).fill({ color: met ? this.accent : palette.pearl, alpha: met ? 0.9 : 0.85 });
      }
    }
  }

  // ----- drawing the tide -----

  private pointNear(gx: number, gy: number): { x: number; y: number } | null {
    const local = this.container.toLocal({ x: gx, y: gy });
    const x = Math.round((local.x - this.origin.x) / this.cell);
    const y = Math.round((local.y - this.origin.y) / this.cell);
    if (x < 0 || y < 0 || x >= this.level.width || y >= this.level.height) return null;
    if (Math.hypot(local.x - this.px(x), local.y - this.py(y)) > this.cell * poolStyle.snap) return null;
    return { x, y };
  }

  private onDown(e: FederatedPointerEvent): void {
    if (this.solved) return;
    const p = this.pointNear(e.global.x, e.global.y);
    if (!p) return;
    this.dragging = { last: p, mode: null, changed: false, start: p };
  }

  private onMove(e: FederatedPointerEvent): void {
    const drag = this.dragging;
    if (!drag || this.solved) return;
    const p = this.pointNear(e.global.x, e.global.y);
    if (!p || (p.x === drag.last.x && p.y === drag.last.y)) return;
    // Walk one step at a time toward the finger, so fast strokes leave no gaps.
    while (drag.last.x !== p.x || drag.last.y !== p.y) {
      const dx = Math.sign(p.x - drag.last.x);
      const dy = dx === 0 ? Math.sign(p.y - drag.last.y) : 0;
      const next = { x: drag.last.x + dx, y: drag.last.y + dy };
      this.stroke(drag, drag.last, next);
      drag.last = next;
    }
  }

  private stroke(drag: NonNullable<ShellPoolScene['dragging']>, a: { x: number; y: number }, b: { x: number; y: number }): void {
    const dir = DIRS.find((d) => edgeAt(this.level.width, this.level.height, a.x, a.y, d) === edgeAt(this.level.width, this.level.height, b.x, b.y, ((d + 2) % 4) as 0))!;
    const e = edgeAt(this.level.width, this.level.height, a.x, a.y, dir);
    if (e < 0) return;
    drag.mode ??= this.drawn.has(e) ? 'erase' : 'draw';
    if (drag.mode === 'erase') {
      if (!this.drawn.has(e)) return;
      this.drawn.delete(e);
    } else {
      if (this.drawn.has(e)) return;
      // A point never takes a third line: the tide passes through each point once.
      if (exits(this.level, this.drawn, a.x, a.y).length >= 2 || exits(this.level, this.drawn, b.x, b.y).length >= 2) return;
      this.drawn.add(e);
      this.voice.rotate(b.x);
    }
    drag.changed = true;
    this.changed();
  }

  private onUp(): void {
    const drag = this.dragging;
    this.dragging = null;
    if (!drag || this.solved || drag.changed) return;
    // A tap on a point clears the lines that meet there.
    const { x, y } = drag.start;
    let cleared = false;
    for (const d of DIRS) {
      const e = edgeAt(this.level.width, this.level.height, x, y, d);
      if (e >= 0 && this.drawn.delete(e)) cleared = true;
    }
    if (cleared) this.changed();
  }

  private changed(): void {
    this.emit('move');
    this.redraw();
    this.settleHints();
    if (isSolved(this.level, this.drawn)) {
      this.solved = true;
      this.voice.loopClosed(this.drawn.size);
      this.emit('solved');
    }
  }

  restart(): void {
    if (this.solved) return;
    this.drawn.clear();
    this.clearHints();
    this.redraw();
  }

  update(dt: number): void {
    this.time += dt;
  }

  // ----- hints -----

  // The first step of pure reasoning the player has not made yet: a line that should be
  // drawn, or one they drew that cannot be part of the tide.
  private nextStep(): Deduction | null {
    const wrong = this.logic.find((d) => !d.on && this.drawn.has(d.edge));
    if (wrong) return wrong;
    return this.logic.find((d) => d.on && !this.drawn.has(d.edge)) ?? null;
  }

  private stepDone(d: Deduction): boolean {
    return d.on ? this.drawn.has(d.edge) : !this.drawn.has(d.edge);
  }

  hint(): string {
    if (this.solved) return '';
    this.hintCount++;
    if (this.hintTarget && this.stepDone(this.hintTarget)) this.hintTarget = null;
    if (!this.hintTarget) {
      const step = this.nextStep();
      const left = this.level.solution.filter((e) => !this.drawn.has(e)).length;
      if (!step || left <= 1) return 'Just one line left. You can do this one!';
      this.hintTarget = step;
      if (!step.on) {
        this.showNudge(step.x, step.y);
        return 'One of your lines cannot be part of the tide. Look near the ringed point.';
      }
      this.showNudge(step.x, step.y);
      return NUDGE[step.reason];
    }
    if (!this.ghosts.has(this.hintTarget.edge)) {
      this.addGhost(this.hintTarget.edge, this.hintTarget.on);
      return this.hintTarget.on ? 'The faint line shows where the tide runs. Draw it.' : 'The pulsing line cannot be part of the tide. Drag back over it to erase it.';
    }
    // A few more lines at a time, never more than half of what is still to draw.
    const left = this.level.solution.filter((e) => !this.drawn.has(e));
    const room = Math.floor(left.length / 2) - [...this.ghosts.keys()].filter((e) => left.includes(e)).length;
    const more = this.logic.filter((d) => d.on && !this.drawn.has(d.edge) && !this.ghosts.has(d.edge)).slice(0, Math.max(0, Math.min(2, room)));
    if (more.length === 0) return 'That is all I can show. The rest is yours.';
    more.forEach((d) => this.addGhost(d.edge, true));
    return more.length === 1 ? 'One more stretch of tide shows faintly.' : 'Two more stretches of tide show faintly.';
  }

  private showNudge(x: number, y: number): void {
    this.clearNudge();
    const g = new Graphics().circle(0, 0, this.cell * 0.42).stroke({ color: palette.pearl, width: 1.5, alpha: 0.9 });
    g.position.set(this.px(x), this.py(y));
    this.hintLayer.addChild(g);
    const tween = gsap.fromTo(g, { alpha: 0.25 }, { alpha: 0.9, duration: 0.9, yoyo: true, repeat: -1, ease: easings.ambient });
    this.nudge = { g, tween };
  }

  private clearNudge(): void {
    this.nudge?.tween.kill();
    this.nudge?.g.destroy();
    this.nudge = null;
  }

  private addGhost(e: number, on: boolean): void {
    const [a, b] = edgeEnds(this.level.width, this.level.height, e);
    const g = new Graphics()
      .moveTo(this.px(a.x), this.py(a.y))
      .lineTo(this.px(b.x), this.py(b.y))
      .stroke({ color: on ? palette.pearl : palette.peach, width: this.cell * poolStyle.lineWidth * (on ? 0.7 : 1.6), alpha: on ? 0.4 : 0.5, cap: 'round' });
    this.hintLayer.addChild(g);
    if (!on) gsap.fromTo(g, { alpha: 0.2 }, { alpha: 0.8, duration: 0.7, yoyo: true, repeat: -1, ease: easings.ambient });
    this.ghosts.set(e, g);
  }

  private settleHints(): void {
    for (const [e, g] of this.ghosts) {
      const shouldBeOn = this.level.solution.includes(e);
      if (this.drawn.has(e) === shouldBeOn) {
        gsap.killTweensOf(g);
        g.destroy();
        this.ghosts.delete(e);
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
    kept.forEach((e) => this.addGhost(e, this.level.solution.includes(e)));
    if (this.hintTarget) this.showNudge(this.hintTarget.x, this.hintTarget.y);
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
    return [
      { id: 'pool:edge', text: 'Tip: start with clues near the edge of the pool. The tide cannot leave it, so they have fewer ways to go.', after: 1 },
      { id: 'pool:stone', text: 'Tip: a stone sends the tide straight on for a step each side. If a side has no room, the tide must go the other way.', after: 2 },
      { id: 'pool:loop', text: 'Tip: the tide is one loop. Never close a small loop while clues are still left outside it.', after: 3 },
    ];
  }

  // ----- completion -----

  playCompletion(): Promise<void> {
    this.clearHints();
    this.voice.solve();
    const total = scaled(durations.completion);
    const { width: w, height: h } = this.level;
    const ripple = new Graphics();
    this.hintLayer.addChild(ripple);
    const cx = this.px((w - 1) / 2);
    const cy = this.py((h - 1) / 2);
    const reach = Math.hypot(w, h) * this.cell;
    const state = { p: 0 };
    gsap.to(state, {
      p: 1,
      duration: total * 0.8,
      ease: easings.response,
      onUpdate: () => {
        ripple.clear().circle(cx, cy, state.p * reach).stroke({ color: this.accent, width: 2, alpha: 0.5 * (1 - state.p) });
        this.glow.alpha = 1 + Math.sin(state.p * Math.PI) * 4;
      },
    });
    return new Promise((resolve) => gsap.delayedCall(total, resolve));
  }

  // ----- instruction card -----

  introPages(): IntroPage[] {
    const s = 34;
    const dot = (g: Graphics, x: number, y: number) => g.circle(x, y, 2.4).fill({ color: palette.pearl, alpha: 0.35 });
    const grid = (g: Graphics, n: number) => {
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) dot(g, (x - (n - 1) / 2) * s, (y - (n - 1) / 2) * s);
    };
    const path = (g: Graphics, pts: Array<[number, number]>, upTo: number, color = this.accent) => {
      g.clear();
      for (let i = 1; i <= upTo && i < pts.length; i++) g.moveTo(pts[i - 1]![0] * s, pts[i - 1]![1] * s).lineTo(pts[i]![0] * s, pts[i]![1] * s);
      g.stroke({ color, width: 4, alpha: 0.95, cap: 'round', join: 'round' });
    };
    const clue = (g: Graphics, x: number, y: number, kind: ClueKind) => {
      if (kind === 'shell') g.circle(x * s, y * s, s * 0.27).fill({ color: palette.ink }).stroke({ color: palette.pearl, width: 2 });
      else g.circle(x * s, y * s, s * 0.27).fill({ color: palette.pearl, alpha: 0.85 });
    };
    const demo = (pts: Array<[number, number]>, kinds: Array<[number, number, ClueKind]>, n: number) => () => {
      const root = new Container();
      const dots = new Graphics();
      grid(dots, n);
      const line = new Graphics();
      const marks = new Graphics();
      kinds.forEach(([x, y, k]) => clue(marks, x, y, k));
      const finger = makeFinger();
      root.addChild(dots, line, marks, finger);
      const state = { k: 0 };
      const tl = gsap.timeline({ repeat: -1, repeatDelay: 1 });
      tl.set(finger, { x: pts[0]![0] * s, y: pts[0]![1] * s })
        .set(state, { k: 0 })
        .call(() => path(line, pts, 0))
        .to(finger, { alpha: 1, duration: 0.2 });
      for (let i = 1; i < pts.length; i++) {
        tl.to(finger, { x: pts[i]![0] * s, y: pts[i]![1] * s, duration: 0.32, ease: 'none', onComplete: () => path(line, pts, i) });
      }
      liftFinger(tl, finger);
      tl.to({}, { duration: 1.2 });
      root.on('destroyed', () => tl.kill());
      return root;
    };
    return [
      {
        caption: 'Drag from point to point to draw one closed loop of tide. Drag back over a line to erase it.',
        glyph: demo([[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]], [], 3),
      },
      {
        caption: 'A shell: the tide passes straight through it, and turns just before or just after it.',
        glyph: demo([[-1.5, 1], [-1.5, 0], [-0.5, 0], [0.5, 0], [1.5, 0], [1.5, -1]], [[-0.5, 0, 'shell']], 1),
      },
      {
        caption: 'A stone: the tide turns on it, and runs straight on for one more step on both sides.',
        glyph: demo([[1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]], [[-1, -1, 'stone']], 1),
      },
    ];
  }

  destroy(): void {
    this.clearHints();
    this.voice.dispose();
    this.container.destroy({ children: true });
  }
}
