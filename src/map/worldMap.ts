import gsap from 'gsap';
import { Container, Graphics } from 'pixi.js';
import type { Scene } from '../core/sceneManager';
import type { RegionId } from '../regions/types';
import { REGION_ORDER } from '../regions/catalog';
import { alphas, palette } from '../design/palette';
import { durations, easings, scaled } from '../design/motion';
import { isRegionComplete, regionUnlocked, solvedCount } from '../core/progress';
import { createGlow } from '../fx/glow';
import { RegionNode, type RegionState } from './regionNode';

const mapStyle = {
  spreadX: 0.7,
  spreadY: 0.34,
  pathSegments: 40,
  pathAlpha: 0.5,
} as const;

// Region positions as fractions of the screen, forming a gentle winding journey.
const LAYOUT: Record<RegionId, { x: number; y: number }> = {
  tidepools: { x: 0.0, y: 0.35 },
  nightsky: { x: 0.25, y: -0.4 },
  stonegarden: { x: 0.5, y: 0.3 },
  crystalcaves: { x: 0.75, y: -0.35 },
  moonlake: { x: 1.0, y: 0.25 },
};

export interface MapReveal {
  completed: RegionId;
}

export class WorldMapScene implements Scene {
  readonly container = new Container();
  private paths = new Graphics();
  private litPaths = new Graphics();
  private nodes = new Map<RegionId, RegionNode>();
  private width = 0;
  private height = 0;
  // The region whose completion is still to be shown; its outgoing path stays dark until then.
  private pendingReveal: RegionId | null;

  constructor(
    private onSelect: (id: RegionId) => void,
    private reveal: MapReveal | null = null,
  ) {
    this.pendingReveal = reveal?.completed ?? null;
    this.litPaths.filters = [createGlow(palette.pearl, { distance: 12, strength: 1 })];
    this.container.addChild(this.paths, this.litPaths);
    for (const id of REGION_ORDER) {
      const node = new RegionNode(id, () => this.onSelect(id));
      this.nodes.set(id, node);
      this.container.addChild(node);
    }
    this.applyStates();
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

  enter(): void {
    if (this.reveal) void this.playReveal(this.reveal.completed);
  }

  private async playReveal(completed: RegionId): Promise<void> {
    await new Promise((r) => gsap.delayedCall(scaled(durations.sceneTransition), r));
    await this.nodes.get(completed)!.setState('complete', true);
    const next = REGION_ORDER[REGION_ORDER.indexOf(completed) + 1];
    if (!next) {
      this.pendingReveal = null;
      return;
    }
    await this.drawLitPath(completed, next);
    this.pendingReveal = null;
    await this.nodes.get(next)!.setState(this.stateFor(next), false);
  }

  private position(id: RegionId): { x: number; y: number } {
    const f = LAYOUT[id];
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
    for (const id of REGION_ORDER) this.nodes.get(id)!.position.copyFrom(this.position(id));
    this.paths.clear();
    for (let i = 0; i < REGION_ORDER.length - 1; i++) {
      this.strokePath(this.paths, REGION_ORDER[i]!, REGION_ORDER[i + 1]!, 1);
    }
    this.paths.stroke({ color: palette.dim, width: 1, alpha: mapStyle.pathAlpha });
    this.litPaths.clear();
    this.drawAllLit(null, null, 0);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
