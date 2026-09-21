import gsap from 'gsap';
import { Container, Graphics } from 'pixi.js';
import type { Scene } from '../core/sceneManager';
import { palette, type PaletteToken } from '../design/palette';
import { breathe, durations, easings } from '../design/motion';
import { createGlow } from '../fx/glow';

// Placeholder map for Phase 1: five region markers on a gentle arc.
// Phase 2 replaces this with the real line-art world and region shapes.
const REGION_ACCENTS: PaletteToken[] = ['mint', 'lavender', 'peach', 'sky', 'rose'];

const mapStyle = {
  nodeRadius: 26,
  spread: 0.62,
  arcDepth: 0.12,
} as const;

export class WorldMapScene implements Scene {
  readonly container = new Container();
  private nodes: Container[] = [];
  private path = new Graphics();
  private tweens: gsap.core.Tween[] = [];

  constructor() {
    this.container.addChild(this.path);
    REGION_ACCENTS.forEach((token, i) => {
      const node = new Container();
      const ring = new Graphics().circle(0, 0, mapStyle.nodeRadius).fill({ color: palette.void });
      if (i === 0) {
        ring.stroke({ color: palette[token], width: 2 });
        ring.filters = [createGlow(palette[token], { distance: 18, strength: 1.2 })];
      } else {
        ring.stroke({ color: palette.dim, width: 2 });
      }
      node.addChild(ring);
      this.nodes.push(node);
      this.container.addChild(node);
    });
  }

  enter(): void {
    const first = this.nodes[0]!;
    this.tweens.push(
      gsap.to(first.scale, {
        x: breathe.scaleTo,
        y: breathe.scaleTo,
        duration: durations.breathe / 2,
        ease: easings.ambient,
        yoyo: true,
        repeat: -1,
      }),
    );
  }

  resize(width: number, height: number): void {
    const count = this.nodes.length;
    const span = width * mapStyle.spread;
    const left = (width - span) / 2;
    const cy = height / 2;
    this.path.clear();
    this.nodes.forEach((node, i) => {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const x = left + span * t;
      const y = cy + Math.sin(t * Math.PI) * -height * mapStyle.arcDepth;
      node.position.set(x, y);
      if (i > 0) {
        const prev = this.nodes[i - 1]!;
        this.path.moveTo(prev.x, prev.y).lineTo(x, y);
      }
    });
    this.path.stroke({ color: palette.dim, width: 1, alpha: 0.6 });
  }

  destroy(): void {
    this.tweens.forEach((t) => t.kill());
    this.container.destroy({ children: true });
  }
}
