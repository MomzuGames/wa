import { Container, Graphics } from 'pixi.js';
import type { RegionId } from '../regions/types';
import { REGION_ACCENT } from '../regions/catalog';
import { palette } from '../design/palette';
import { reducedMotion } from '../design/motion';
import type { Rng } from '../core/rng';

export const atmosphereStyle = {
  rippleCount: 5,
  ripplePeriod: 7,
  rippleMaxRadius: 0.18,
  rippleAlpha: 0.07,
  twinkleCount: 70,
  twinkleAlpha: 0.35,
  shootingStarEvery: 9,
  moteCount: 24,
  moteAlpha: 0.14,
} as const;

// Slow, region-flavoured background life drawn behind trails and puzzles.
export class Atmosphere {
  readonly container = new Container();
  private g = new Graphics();
  private time = 0;
  private width = 1;
  private height = 1;
  private accent: number;
  private seeds: number[] = [];
  private shootingStar: { x: number; y: number; dx: number; dy: number; t: number } | null = null;
  private nextShootingStar: number;

  constructor(
    private id: RegionId,
    private rng: Rng,
  ) {
    this.accent = palette[REGION_ACCENT[id]];
    this.container.addChild(this.g);
    this.container.eventMode = 'none';
    for (let i = 0; i < 200; i++) this.seeds.push(rng.next());
    this.nextShootingStar = atmosphereStyle.shootingStarEvery * (0.5 + rng.next());
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.draw();
  }

  update(dt: number): void {
    if (reducedMotion()) return;
    this.time += dt;
    this.draw();
  }

  private draw(): void {
    const g = this.g;
    g.clear();
    switch (this.id) {
      case 'tidepools':
        this.drawRipples(g);
        break;
      case 'nightsky':
        this.drawTwinkles(g);
        break;
      default:
        this.drawMotes(g);
    }
  }

  private drawRipples(g: Graphics): void {
    const max = Math.min(this.width, this.height) * atmosphereStyle.rippleMaxRadius;
    for (let i = 0; i < atmosphereStyle.rippleCount; i++) {
      const cx = this.width * (0.1 + this.seeds[i * 3]! * 0.8);
      const cy = this.height * (0.1 + this.seeds[i * 3 + 1]! * 0.8);
      const phase = ((this.time / atmosphereStyle.ripplePeriod + this.seeds[i * 3 + 2]!) % 1 + 1) % 1;
      for (let k = 0; k < 2; k++) {
        const p = phase - k * 0.28;
        if (p <= 0) continue;
        g.circle(cx, cy, p * max).stroke({ color: this.accent, width: 1, alpha: atmosphereStyle.rippleAlpha * (1 - p) });
      }
    }
  }

  private drawTwinkles(g: Graphics): void {
    for (let i = 0; i < atmosphereStyle.twinkleCount; i++) {
      const x = this.seeds[(i * 3) % this.seeds.length]! * this.width;
      const y = this.seeds[(i * 3 + 1) % this.seeds.length]! * this.height;
      const phase = this.seeds[(i * 3 + 2) % this.seeds.length]! * Math.PI * 2;
      const tw = 0.5 + 0.5 * Math.sin(this.time * (0.6 + phase * 0.1) + phase);
      g.circle(x, y, 0.8 + tw * 0.8).fill({ color: i % 4 === 0 ? this.accent : palette.pearl, alpha: atmosphereStyle.twinkleAlpha * tw });
    }
    if (!this.shootingStar && this.time > this.nextShootingStar) {
      this.shootingStar = {
        x: this.rng.next() * this.width * 0.8,
        y: this.rng.next() * this.height * 0.4,
        dx: 260 + this.rng.next() * 120,
        dy: 90 + this.rng.next() * 60,
        t: 0,
      };
      this.nextShootingStar = this.time + atmosphereStyle.shootingStarEvery * (0.6 + this.rng.next());
    }
    const s = this.shootingStar;
    if (s) {
      s.t += 1 / 60;
      const life = 1.2;
      const p = s.t / life;
      if (p >= 1) {
        this.shootingStar = null;
      } else {
        const hx = s.x + s.dx * p;
        const hy = s.y + s.dy * p;
        const tail = 0.12;
        g.moveTo(hx - s.dx * tail, hy - s.dy * tail).lineTo(hx, hy).stroke({ color: palette.pearl, width: 1.2, alpha: 0.5 * Math.sin(p * Math.PI) });
      }
    }
  }

  private drawMotes(g: Graphics): void {
    for (let i = 0; i < atmosphereStyle.moteCount; i++) {
      const sx = this.seeds[(i * 3) % this.seeds.length]!;
      const sy = this.seeds[(i * 3 + 1) % this.seeds.length]!;
      const phase = this.seeds[(i * 3 + 2) % this.seeds.length]! * Math.PI * 2;
      const x = (sx + Math.sin(this.time * 0.05 + phase) * 0.02) * this.width;
      const y = ((sy - this.time * 0.004 + 1) % 1) * this.height;
      g.circle(x, y, 1.5 + Math.sin(this.time + phase)).fill({ color: this.accent, alpha: atmosphereStyle.moteAlpha });
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
