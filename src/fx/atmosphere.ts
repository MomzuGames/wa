import { Container, FillGradient, Graphics } from 'pixi.js';
import type { RegionId } from '../regions/types';
import { REGION_ACCENT } from '../regions/catalog';
import { palette, rgba } from '../design/palette';
import { reducedMotion } from '../design/motion';
import type { Rng } from '../core/rng';
import { Scenery } from './scenery';
import { WaterFilter } from './waterFilter';
import { isHigh } from '../design/quality';
import { events } from '../core/events';

export const atmosphereStyle = {
  tintAlpha: 0.11,
  rippleCount: 5,
  ripplePeriod: 7,
  rippleMaxRadius: 0.18,
  rippleAlpha: 0.07,
  twinkleCount: 70,
  twinkleAlpha: 0.35,
  shootingStarEvery: 9,
  grainCount: 40,
  grainAlpha: 0.16,
  rakeLines: 7,
  rakeAlpha: 0.08,
  facetCount: 7,
  facetAlpha: 0.08,
  sparkCount: 26,
  waveLines: 4,
  waveAlpha: 0.1,
  fireflyCount: 18,
  parallax: 14,
  causticStrength: 1.15,
  causticHorizon: 0.62, // the waterline, as a fraction of the screen height
} as const;

// Slow, region-flavoured background life drawn behind trails and puzzles: a colour
// wash, a few large slow shapes and small drifting motes, all in the region's accent.
export class Atmosphere {
  readonly container = new Container();
  private tint = new Graphics();
  private g = new Graphics();
  private time = 0;
  private width = 1;
  private height = 1;
  private accent: number;
  private seeds: number[] = [];
  private shootingStar: { x: number; y: number; dx: number; dy: number; t: number } | null = null;
  private nextShootingStar: number;
  private parallax = { x: 0, y: 0 };
  private scenery: Scenery;
  // Tidepools only: the moving net of light on the floor of the pool, a real shader.
  private caustics: WaterFilter | null = null;
  private causticLayer: Container | null = null;
  private unsubscribe: () => void;

  constructor(
    private id: RegionId,
    private rng: Rng,
  ) {
    this.accent = palette[REGION_ACCENT[id]];
    this.scenery = new Scenery(id, rng);
    this.container.addChild(this.tint, this.scenery.back, this.g, this.scenery.front);
    this.container.eventMode = 'none';
    for (let i = 0; i < 240; i++) this.seeds.push(rng.next());
    this.nextShootingStar = atmosphereStyle.shootingStarEvery * (0.5 + rng.next());
    this.buildCaustics();
    this.unsubscribe = events.on('quality:changed', () => this.buildCaustics());
  }

  // The caustics sit on their own layer between the tint and the drawn atmosphere, so
  // only the water is affected and the scenery in front stays crisp.
  private buildCaustics(): void {
    const want = this.id === 'tidepools' && isHigh() && !reducedMotion();
    if (want === !!this.causticLayer) return;
    if (!want) {
      this.causticLayer?.destroy();
      this.causticLayer = null;
      this.caustics?.destroy();
      this.caustics = null;
      return;
    }
    const tint = palette[REGION_ACCENT[this.id]];
    this.caustics = new WaterFilter({
      size: [this.width, this.height],
      tint: [((tint >> 16) & 255) / 255, ((tint >> 8) & 255) / 255, (tint & 255) / 255],
      strength: atmosphereStyle.causticStrength,
      horizon: atmosphereStyle.causticHorizon,
    });
    const layer = new Container();
    layer.eventMode = 'none';
    // A filter needs something to draw on; a transparent rectangle is enough.
    layer.addChild(new Graphics().rect(0, 0, Math.max(1, this.width), Math.max(1, this.height)).fill({ color: palette.void, alpha: 0.001 }));
    layer.filters = [this.caustics];
    this.causticLayer = layer;
    this.container.addChildAt(layer, 1);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    const gradient = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: rgba(REGION_ACCENT[this.id], 0) },
        { offset: 0.55, color: rgba(REGION_ACCENT[this.id], atmosphereStyle.tintAlpha * 0.35) },
        { offset: 1, color: rgba(REGION_ACCENT[this.id], atmosphereStyle.tintAlpha) },
      ],
    });
    this.tint.clear().rect(-atmosphereStyle.parallax, -atmosphereStyle.parallax, width + atmosphereStyle.parallax * 2, height + atmosphereStyle.parallax * 2).fill(gradient);
    if (this.causticLayer) {
      const plate = this.causticLayer.children[0] as Graphics;
      plate.clear().rect(0, 0, width, height).fill({ color: palette.void, alpha: 0.001 });
      this.caustics?.setSize(width, height);
    }
    this.scenery.resize(width, height);
    this.draw();
  }

  // Pointer parallax: nudges the whole layer a little against the cursor.
  setParallax(nx: number, ny: number): void {
    this.parallax = { x: -nx * atmosphereStyle.parallax, y: -ny * atmosphereStyle.parallax };
    this.scenery.setParallax(nx, ny);
  }

  update(dt: number): void {
    if (reducedMotion()) return;
    this.time += dt;
    if (this.caustics) this.caustics.time = this.time;
    this.container.x += (this.parallax.x - this.container.x) * Math.min(1, dt * 4);
    this.container.y += (this.parallax.y - this.container.y) * Math.min(1, dt * 4);
    this.scenery.update(dt);
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
      case 'stonegarden':
        this.drawSand(g);
        break;
      case 'crystalcaves':
        this.drawFacets(g);
        break;
      case 'shadowterrace':
        this.drawLanterns(g);
        break;
      default:
        this.drawLake(g);
    }
  }

  // Shadow Terrace: distant paper lanterns drifting up far behind the terrace. They are
  // warm, dim and out of focus (stacked soft discs, no edges) so the puzzle stays in front.
  private drawLanterns(g: Graphics): void {
    for (let i = 0; i < 6; i++) {
      const speed = 0.008 + this.seed(i * 3 + 200) * 0.006;
      const p = ((this.time * speed + this.seed(i * 3 + 201)) % 1 + 1) % 1;
      const x = this.width * (0.06 + this.seed(i * 3 + 202) * 0.88) + Math.sin(this.time * 0.2 + i) * 18;
      const y = this.height * (1.05 - p * 1.1);
      const glow = 0.6 + 0.4 * Math.sin(this.time * 0.7 + i * 2);
      const size = 10 + this.seed(i * 3 + 203) * 8;
      for (let k = 4; k >= 1; k--) {
        g.circle(x, y, size * k * 0.55).fill({ color: palette.peach, alpha: 0.018 * glow });
      }
      g.circle(x, y, size * 0.35).fill({ color: palette.peach, alpha: 0.09 * glow });
    }
  }

  private seed(i: number): number {
    return this.seeds[i % this.seeds.length]!;
  }

  private drawRipples(g: Graphics): void {
    const max = Math.min(this.width, this.height) * atmosphereStyle.rippleMaxRadius;
    for (let i = 0; i < atmosphereStyle.rippleCount; i++) {
      const cx = this.width * (0.1 + this.seed(i * 3) * 0.8);
      const cy = this.height * (0.1 + this.seed(i * 3 + 1) * 0.8);
      const phase = ((this.time / atmosphereStyle.ripplePeriod + this.seed(i * 3 + 2)) % 1 + 1) % 1;
      for (let k = 0; k < 2; k++) {
        const p = phase - k * 0.28;
        if (p <= 0) continue;
        g.circle(cx, cy, p * max).stroke({ color: this.accent, width: 1, alpha: atmosphereStyle.rippleAlpha * (1 - p) });
      }
    }
    // Caustic light: a few slow drifting soft blobs.
    for (let i = 0; i < 6; i++) {
      const x = this.width * ((this.seed(i * 5 + 40) + Math.sin(this.time * 0.05 + i) * 0.05 + 1) % 1);
      const y = this.height * ((this.seed(i * 5 + 41) + Math.cos(this.time * 0.04 + i) * 0.05 + 1) % 1);
      g.circle(x, y, 40 + 20 * Math.sin(this.time * 0.3 + i)).fill({ color: this.accent, alpha: 0.025 });
    }
  }

  private drawTwinkles(g: Graphics): void {
    for (let i = 0; i < atmosphereStyle.twinkleCount; i++) {
      const x = this.seed(i * 3) * this.width;
      const y = this.seed(i * 3 + 1) * this.height;
      const phase = this.seed(i * 3 + 2) * Math.PI * 2;
      const tw = 0.5 + 0.5 * Math.sin(this.time * (0.6 + phase * 0.1) + phase);
      g.circle(x, y, 0.8 + tw * 0.8).fill({ color: i % 4 === 0 ? this.accent : palette.pearl, alpha: atmosphereStyle.twinkleAlpha * tw });
    }
    if (!this.shootingStar && this.time > this.nextShootingStar) {
      this.shootingStar = { x: this.rng.next() * this.width * 0.8, y: this.rng.next() * this.height * 0.4, dx: 260 + this.rng.next() * 120, dy: 90 + this.rng.next() * 60, t: 0 };
      this.nextShootingStar = this.time + atmosphereStyle.shootingStarEvery * (0.6 + this.rng.next());
    }
    const s = this.shootingStar;
    if (s) {
      s.t += 1 / 60;
      const p = s.t / 1.2;
      if (p >= 1) this.shootingStar = null;
      else {
        const hx = s.x + s.dx * p;
        const hy = s.y + s.dy * p;
        g.moveTo(hx - s.dx * 0.12, hy - s.dy * 0.12).lineTo(hx, hy).stroke({ color: palette.pearl, width: 1.2, alpha: 0.5 * Math.sin(p * Math.PI) });
      }
    }
  }

  // Stone Garden: raked sand lines drifting across the lower half, with grains settling.
  private drawSand(g: Graphics): void {
    for (let i = 0; i < atmosphereStyle.rakeLines; i++) {
      const y = this.height * (0.45 + (i / atmosphereStyle.rakeLines) * 0.6);
      const drift = Math.sin(this.time * 0.08 + i) * 30;
      g.moveTo(-20, y);
      for (let x = 0; x <= this.width + 20; x += 40) {
        g.lineTo(x, y + Math.sin((x + drift) / 90 + i) * 6);
      }
      g.stroke({ color: this.accent, width: 1, alpha: atmosphereStyle.rakeAlpha });
    }
    for (let i = 0; i < atmosphereStyle.grainCount; i++) {
      const x = ((this.seed(i * 3) + Math.sin(this.time * 0.03 + i) * 0.01 + 1) % 1) * this.width;
      const y = ((this.seed(i * 3 + 1) + this.time * 0.006 * (0.5 + this.seed(i * 3 + 2))) % 1) * this.height;
      g.circle(x, y, 1 + this.seed(i * 3 + 2)).fill({ color: this.accent, alpha: atmosphereStyle.grainAlpha });
    }
  }

  // Crystal Caves: tall faint facets rising from the bottom edge, with glints and rising sparks.
  private drawFacets(g: Graphics): void {
    for (let i = 0; i < atmosphereStyle.facetCount; i++) {
      const x = this.width * (0.05 + (i / (atmosphereStyle.facetCount - 1)) * 0.9 + (this.seed(i) - 0.5) * 0.06);
      const h = this.height * (0.18 + this.seed(i + 20) * 0.28);
      const w = 24 + this.seed(i + 40) * 40;
      const lean = (this.seed(i + 60) - 0.5) * 30;
      g.moveTo(x - w, this.height + 10).lineTo(x + lean, this.height - h).lineTo(x + w, this.height + 10).closePath();
      g.fill({ color: this.accent, alpha: atmosphereStyle.facetAlpha }).stroke({ color: this.accent, width: 1, alpha: atmosphereStyle.facetAlpha * 2 });
      const glint = Math.max(0, Math.sin(this.time * 0.7 + i * 1.9));
      g.circle(x + lean, this.height - h, 1.5 + glint * 3).fill({ color: palette.pearl, alpha: 0.5 * glint });
    }
    for (let i = 0; i < atmosphereStyle.sparkCount; i++) {
      const x = ((this.seed(i * 3 + 90) + Math.sin(this.time * 0.05 + i) * 0.015 + 1) % 1) * this.width;
      const y = ((this.seed(i * 3 + 91) - this.time * 0.008 * (0.5 + this.seed(i * 3 + 92)) + 10) % 1) * this.height;
      const tw = 0.5 + 0.5 * Math.sin(this.time * 2 + i);
      g.circle(x, y, 1 + tw).fill({ color: i % 3 === 0 ? palette.pearl : this.accent, alpha: 0.3 * tw });
    }
  }

  // Moon Lake: gentle waves across the lower half and slow blinking fireflies.
  private drawLake(g: Graphics): void {
    for (let i = 0; i < atmosphereStyle.waveLines; i++) {
      const y = this.height * (0.55 + (i / atmosphereStyle.waveLines) * 0.42);
      g.moveTo(-20, y);
      for (let x = 0; x <= this.width + 20; x += 30) {
        g.lineTo(x, y + Math.sin(x / 110 + this.time * 0.35 + i * 1.3) * 5 + Math.sin(x / 41 - this.time * 0.2) * 2);
      }
      g.stroke({ color: this.accent, width: 1, alpha: atmosphereStyle.waveAlpha * (1 - i / atmosphereStyle.waveLines) });
    }
    for (let i = 0; i < atmosphereStyle.fireflyCount; i++) {
      const x = ((this.seed(i * 3 + 120) + Math.sin(this.time * 0.07 + i) * 0.03 + 1) % 1) * this.width;
      const y = ((this.seed(i * 3 + 121) + Math.cos(this.time * 0.05 + i * 2) * 0.03 + 1) % 1) * this.height;
      const blink = Math.max(0, Math.sin(this.time * 0.9 + this.seed(i * 3 + 122) * 20));
      g.circle(x, y, 1.6).fill({ color: palette.lemon, alpha: 0.45 * blink * blink });
      g.circle(x, y, 6).fill({ color: palette.lemon, alpha: 0.08 * blink });
    }
  }

  destroy(): void {
    this.unsubscribe();
    this.caustics?.destroy();
    this.scenery.destroy();
    this.container.destroy({ children: true });
  }
}
