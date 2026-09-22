import gsap from 'gsap';
import { Container, type FederatedPointerEvent, Graphics } from 'pixi.js';
import type { Scene } from '../core/sceneManager';
import type { RegionId } from '../regions/types';
import { REGION_ORDER } from '../regions/catalog';
import { alphas, palette } from '../design/palette';
import { durations, easings, scaled } from '../design/motion';
import { spiritStyle } from '../ui/spirit';
import { isRegionComplete, regionUnlocked, solvedCount } from '../core/progress';
import { createGlow } from '../fx/glow';
import { isCompact } from '../design/layout';
import { RegionNode, type RegionState, regionNodeStyle } from './regionNode';
import { events } from '../core/events';
import { reducedMotion } from '../design/motion';
import { createRng } from '../core/rng';

const mapStyle = {
  spreadX: 0.7,
  spreadY: 0.34,
  pathSegments: 40,
  pathAlpha: 0.5,
  driftAmount: 9,
  driftSpeed: 0.12,
  twinkleCount: 90,
  twinkleAlpha: 0.3,
  pulseSpeed: 0.18,
  spiritOffsetY: -78,
  parallax: 22, // px the map shifts toward the pointer
  tourPause: 1.6,
} as const;

// Region positions as fractions of the screen, forming a gentle winding journey.
const LAYOUT: Record<RegionId, { x: number; y: number }> = {
  tidepools: { x: 0.0, y: 0.35 },
  nightsky: { x: 0.2, y: -0.4 },
  stonegarden: { x: 0.4, y: 0.3 },
  crystalcaves: { x: 0.6, y: -0.35 },
  moonlake: { x: 0.8, y: 0.25 },
  shadowterrace: { x: 1.0, y: -0.3 },
};

export interface MapReveal {
  completed: RegionId;
}

export class WorldMapScene implements Scene {
  readonly container = new Container();
  private world = new Container();
  private twinkles = new Graphics();
  private pulses = new Graphics();
  private paths = new Graphics();
  private litPaths = new Graphics();
  private nodes = new Map<RegionId, RegionNode>();
  private width = 0;
  private height = 0;
  private time = 0;
  private seeds: number[] = [];
  private parallax = { x: 0, y: 0 };
  private chosen: RegionId | null = null;
  private unsubscribe: () => void = () => {};
  // The region whose completion is still to be shown; its outgoing path stays dark until then.
  private pendingReveal: RegionId | null;

  constructor(
    private onSelect: (id: RegionId) => void,
    private reveal: MapReveal | null = null,
  ) {
    this.pendingReveal = reveal?.completed ?? null;
    this.litPaths.filters = [createGlow(palette.pearl, { distance: 12, strength: 1 })];
    this.pulses.filters = [createGlow(palette.pearl, { distance: 10, strength: 1.2 })];
    this.twinkles.eventMode = 'none';
    this.pulses.eventMode = 'none';
    const rng = createRng('worldmap');
    for (let i = 0; i < mapStyle.twinkleCount * 3; i++) this.seeds.push(rng.next());
    this.container.addChild(this.twinkles, this.world);
    this.world.addChild(this.paths, this.litPaths, this.pulses);
    for (const id of REGION_ORDER) {
      const node = new RegionNode(id, () => this.select(id));
      this.nodes.set(id, node);
      this.world.addChild(node);
    }
    this.applyStates();
    // The map leans toward the pointer, and the regions brighten as the light passes them.
    this.container.eventMode = 'static';
    this.container.on('globalpointermove', (e: FederatedPointerEvent) => {
      this.parallax = { x: e.global.x / Math.max(1, this.width) - 0.5, y: e.global.y / Math.max(1, this.height) - 0.5 };
    });
    this.unsubscribe = events.on('spirit:at', ({ x, y }) => {
      for (const id of REGION_ORDER) {
        const p = this.position(id);
        const d = Math.hypot(p.x + this.world.x - x, p.y + this.world.y - y);
        this.nodes.get(id)!.setNear(1 - Math.min(1, d / regionNodeStyle.nearRadius));
      }
    });
  }

  private stateFor(id: RegionId): RegionState {
    if (isRegionComplete(solvedCount(id))) return 'complete';
    return regionUnlocked(id) ? 'unlocked' : 'locked';
  }

  private applyStates(): void {
    for (const id of REGION_ORDER) {
      let state = this.stateFor(id);
      // The freshly completed region (and the one it unlocks) animate in enter().
      if (this.reveal && id === this.reveal.completed) state = 'unlocked';
      if (this.reveal && this.isNextAfter(this.reveal.completed, id)) state = 'locked';
      void this.nodes.get(id)!.setState(state, false);
    }
  }

  private isNextAfter(completed: RegionId, id: RegionId): boolean {
    return REGION_ORDER[REGION_ORDER.indexOf(completed) + 1] === id;
  }

  private spiritSpot(id: RegionId): { x: number; y: number } {
    const p = this.position(id);
    return { x: p.x, y: p.y + mapStyle.spiritOffsetY };
  }

  // The light roams from region to region, lighting each as it arrives.
  private roam(startAt: RegionId): void {
    const points = REGION_ORDER.map((id) => this.spiritSpot(id));
    events.emit('spirit:tour', { points, pause: mapStyle.tourPause, start: REGION_ORDER.indexOf(startAt) });
  }

  // Choosing a region: its name lights fully and the light leaps into the figure.
  private select(id: RegionId): void {
    if (this.chosen) return;
    this.chosen = id;
    const p = this.position(id);
    for (const other of REGION_ORDER) this.nodes.get(other)!.setChosen(other === id);
    events.emit('spirit:dive', { x: p.x + this.world.x, y: p.y + this.world.y - regionNodeStyle.size * 0.1 });
    gsap.delayedCall(scaled(spiritStyle.diveSeconds) * 1.05, () => this.onSelect(id));
  }

  // Where the journey stands: the first region that is not finished yet.
  private firstUnfinished(): RegionId {
    for (const id of REGION_ORDER) if (!isRegionComplete(solvedCount(id))) return id;
    return REGION_ORDER[0]!;
  }

  enter(): void {
    if (this.reveal) {
      void this.playReveal(this.reveal.completed);
      return;
    }
    this.roam(this.firstUnfinished());
  }

  update(dt: number): void {
    this.time += dt;
    for (const node of this.nodes.values()) node.tick(dt);
    if (reducedMotion()) return;
    const k = Math.min(1, dt * 3);
    const px = -this.parallax.x * mapStyle.parallax;
    const py = -this.parallax.y * mapStyle.parallax * 0.7;
    this.world.x += (Math.sin(this.time * mapStyle.driftSpeed) * mapStyle.driftAmount + px - this.world.x) * k;
    this.world.y += (Math.cos(this.time * mapStyle.driftSpeed * 0.7) * mapStyle.driftAmount * 0.6 + py - this.world.y) * k;
    // The star field sits further back, so it shifts less than the regions.
    this.twinkles.x = px * 0.35;
    this.twinkles.y = py * 0.35;
    this.drawTwinkles();
    this.drawPulses();
  }

  private drawTwinkles(): void {
    const g = this.twinkles;
    g.clear();
    for (let i = 0; i < mapStyle.twinkleCount; i++) {
      const x = this.seeds[i * 3]! * this.width;
      const y = this.seeds[i * 3 + 1]! * this.height;
      const phase = this.seeds[i * 3 + 2]! * Math.PI * 2;
      const tw = 0.5 + 0.5 * Math.sin(this.time * (0.5 + phase * 0.08) + phase);
      g.circle(x, y, 0.7 + tw).fill({ color: palette.pearl, alpha: mapStyle.twinkleAlpha * tw });
    }
  }

  // A mote of light travels along every completed trail.
  private drawPulses(): void {
    const g = this.pulses;
    g.clear();
    for (let i = 0; i < REGION_ORDER.length - 1; i++) {
      const a = REGION_ORDER[i]!;
      const b = REGION_ORDER[i + 1]!;
      if (!isRegionComplete(solvedCount(a)) || a === this.pendingReveal) continue;
      const t = ((this.time * mapStyle.pulseSpeed + i * 0.37) % 1 + 1) % 1;
      const p = this.curve(a, b, t);
      g.circle(p.x, p.y, 3).fill({ color: palette.pearl, alpha: 0.8 });
    }
  }

  private async playReveal(completed: RegionId): Promise<void> {
    await new Promise((r) => gsap.delayedCall(scaled(durations.sceneTransition), r));
    await this.nodes.get(completed)!.setState('complete', true);
    const next = REGION_ORDER[REGION_ORDER.indexOf(completed) + 1];
    if (!next) {
      this.pendingReveal = null;
      this.roam(completed);
      return;
    }
    await this.drawLitPath(completed, next);
    this.pendingReveal = null;
    await this.nodes.get(next)!.setState(this.stateFor(next), false);
    this.roam(next);
  }

  private position(id: RegionId): { x: number; y: number } {
    const f = LAYOUT[id];
    if (this.height > this.width) {
      // Portrait: the journey winds down the screen instead of across it, swinging wide
      // from side to side so neighbouring figures and names never meet.
      const spanY = this.height * 0.7;
      const spanX = this.width * 0.62;
      return { x: this.width / 2 + f.y * spanX, y: (this.height - spanY) / 2 + 30 + f.x * spanY };
    }
    const spanX = this.width * mapStyle.spreadX;
    const spanY = this.height * mapStyle.spreadY;
    return { x: (this.width - spanX) / 2 + f.x * spanX, y: this.height / 2 + f.y * spanY };
  }

  private curve(from: RegionId, to: RegionId, t: number): { x: number; y: number } {
    const a = this.position(from);
    const b = this.position(to);
    const cx = (a.x + b.x) / 2;
    // Cubic ease between the two, bending horizontally so the trail winds rather than zig-zags.
    const u = 1 - t;
    const x = u * u * u * a.x + 3 * u * u * t * cx + 3 * u * t * t * cx + t * t * t * b.x;
    const y = u * u * u * a.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t * t * t * b.y;
    return { x, y };
  }

  private strokePath(g: Graphics, from: RegionId, to: RegionId, progress: number): void {
    const steps = Math.max(1, Math.round(mapStyle.pathSegments * progress));
    for (let i = 0; i <= steps; i++) {
      const p = this.curve(from, to, i / mapStyle.pathSegments);
      if (i === 0) g.moveTo(p.x, p.y);
      else g.lineTo(p.x, p.y);
    }
  }

  private drawLitPath(from: RegionId, to: RegionId): Promise<void> {
    const state = { t: 0 };
    return new Promise((resolve) => {
      gsap.to(state, {
        t: 1,
        duration: scaled(durations.completion),
        ease: easings.ambient,
        onUpdate: () => this.redrawLit(from, to, state.t),
        onComplete: resolve,
      });
    });
  }

  private redrawLit(from: RegionId, to: RegionId, progress: number): void {
    this.litPaths.clear();
    this.drawAllLit(from, to, progress);
  }

  private drawAllLit(animatingFrom: RegionId | null, animatingTo: RegionId | null, progress: number): void {
    for (let i = 0; i < REGION_ORDER.length - 1; i++) {
      const a = REGION_ORDER[i]!;
      const b = REGION_ORDER[i + 1]!;
      const isAnimating = a === animatingFrom && b === animatingTo;
      const settled = isRegionComplete(solvedCount(a)) && a !== this.pendingReveal;
      const lit = isAnimating ? progress : settled ? 1 : 0;
      if (lit <= 0) continue;
      this.strokePath(this.litPaths, a, b, lit);
      this.litPaths.stroke({ color: this.nodes.get(a)!.accent, width: 1.5, alpha: alphas.hudHover });
    }
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    const compact = isCompact(width) || height > width;
    for (const id of REGION_ORDER) {
      const node = this.nodes.get(id)!;
      node.setCompact(compact);
      node.position.copyFrom(this.position(id));
    }
    this.paths.clear();
    for (let i = 0; i < REGION_ORDER.length - 1; i++) {
      this.strokePath(this.paths, REGION_ORDER[i]!, REGION_ORDER[i + 1]!, 1);
    }
    this.paths.stroke({ color: palette.dim, width: 1, alpha: mapStyle.pathAlpha });
    this.litPaths.clear();
    this.drawAllLit(null, null, 0);
  }

  destroy(): void {
    this.unsubscribe();
    this.container.destroy({ children: true });
  }
}
