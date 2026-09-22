import { Container, Graphics } from 'pixi.js';
import type { RegionId } from '../regions/types';
import { REGION_ACCENT } from '../regions/catalog';
import { palette } from '../design/palette';
import { reducedMotion } from '../design/motion';
import type { Rng } from '../core/rng';

export const sceneryStyle = {
  farAlpha: 0.75,
  nearAlpha: 0.95,
  rimAlpha: 0.22,
  plantCount: 46,
  plantAlpha: 0.7,
  windSpeed: 0.9,
  birdEvery: [14, 26] as const,
  birdSpeed: 26,
  birdAlpha: 0.55,
  parallaxFar: 0.35,
  parallaxNear: 1.4,
} as const;

interface Bird {
  x: number;
  y: number;
  vx: number;
  size: number;
  phase: number;
}

interface Plant {
  x: number;
  height: number;
  lean: number;
  phase: number;
  width: number;
}

// Calm night landscapes: far silhouettes, near ground, water, plants in the wind and
// birds passing now and then. Everything is soft, slow and drawn in the region's colours.
export class Scenery {
  // Far layers go behind the region's twinkles and ripples; near layers in front.
  readonly back = new Container();
  readonly front = new Container();
  private far = new Graphics();
  private near = new Graphics();
  private dyn = new Graphics();
  private width = 1;
  private height = 1;
  private time = 0;
  private accent: number;
  private seeds: number[] = [];
  private plants: Plant[] = [];
  private birds: Bird[] = [];
  private nextFlock: number;
  private parallax = { x: 0, y: 0 };

  constructor(
    private id: RegionId,
    private rng: Rng,
  ) {
    this.accent = palette[REGION_ACCENT[id]];
    for (let i = 0; i < 160; i++) this.seeds.push(rng.next());
    this.back.eventMode = 'none';
    this.front.eventMode = 'none';
    this.back.addChild(this.far);
    this.front.addChild(this.near, this.dyn);
    const [min, max] = sceneryStyle.birdEvery;
    this.nextFlock = 3 + rng.next() * (max - min);
  }

  setParallax(nx: number, ny: number): void {
    this.parallax = { x: nx, y: ny };
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.plants = [];
    for (let i = 0; i < sceneryStyle.plantCount; i++) {
      this.plants.push({
        x: this.seeds[i * 2]! * width,
        height: 18 + this.seeds[i * 2 + 1]! * 38,
        lean: (this.seeds[(i * 3) % 160]! - 0.5) * 0.6,
        phase: this.seeds[(i * 5) % 160]! * Math.PI * 2,
        width: 1 + this.seeds[(i * 7) % 160]! * 1.2,
      });
    }
    this.drawStatic();
  }

  private seed(i: number): number {
    return this.seeds[i % this.seeds.length]!;
  }

  // A ridge line across the screen: gentle for hills, jagged for mountains.
  private ridge(g: Graphics, baseY: number, amplitude: number, jag: number, offset: number, steps: number): void {
    g.moveTo(-40, this.height + 40);
    g.lineTo(-40, baseY);
    for (let k = 0; k <= steps; k++) {
      const x = (k / steps) * (this.width + 80) - 40;
      const smooth = Math.sin(k * 0.9 + offset) * amplitude + Math.sin(k * 0.37 + offset * 2) * amplitude * 0.6;
      const spike = (this.seed(k + Math.floor(offset * 10)) - 0.5) * jag;
      g.lineTo(x, baseY + smooth + spike);
    }
    g.lineTo(this.width + 40, this.height + 40);
    g.closePath();
  }

  private drawStatic(): void {
    const far = this.far;
    const near = this.near;
    far.clear();
    near.clear();
    const h = this.height;
    switch (this.id) {
      case 'tidepools': {
        // Low headland far away, a sandy shore near.
        this.ridge(far, h * 0.62, 14, 6, 1.7, 14);
        far.fill({ color: palette.ink, alpha: sceneryStyle.farAlpha });
        near.moveTo(-40, h * 0.86);
        for (let x = -40; x <= this.width + 40; x += 40) near.lineTo(x, h * 0.86 + Math.sin(x / 160) * 6);
        near.lineTo(this.width + 40, h + 40).lineTo(-40, h + 40).closePath().fill({ color: palette.ink, alpha: sceneryStyle.nearAlpha });
        for (let i = 0; i < 5; i++) {
          const rx = this.seed(i + 40) * this.width;
          near.ellipse(rx, h * 0.87 + this.seed(i + 50) * 20, 14 + this.seed(i + 60) * 22, 6 + this.seed(i + 70) * 8).fill({ color: palette.void, alpha: 0.9 }).stroke({ color: this.accent, width: 1, alpha: sceneryStyle.rimAlpha });
        }
        break;
      }
      case 'nightsky': {
        // Three ranges of mountains with a rim of starlight, pines on the nearest.
        this.ridge(far, h * 0.5, 40, 60, 0.4, 16);
        far.fill({ color: palette.ink, alpha: sceneryStyle.farAlpha * 0.6 });
        this.ridge(far, h * 0.62, 34, 44, 2.3, 18);
        far.fill({ color: palette.ink, alpha: sceneryStyle.farAlpha });
        this.ridge(near, h * 0.8, 18, 18, 4.1, 20);
        near.fill({ color: palette.ink, alpha: sceneryStyle.nearAlpha }).stroke({ color: this.accent, width: 1, alpha: sceneryStyle.rimAlpha });
        for (let i = 0; i < 14; i++) {
          const x = this.seed(i + 80) * this.width;
          const base = h * 0.8 + Math.sin(x / 90) * 10;
          const size = 10 + this.seed(i + 90) * 18;
          near.moveTo(x - size * 0.45, base + 6).lineTo(x, base - size).lineTo(x + size * 0.45, base + 6).closePath().fill({ color: palette.void, alpha: 0.95 });
        }
        break;
      }
      case 'stonegarden': {
        // Rolling hills and a garden floor.
        this.ridge(far, h * 0.6, 26, 4, 0.9, 10);
        far.fill({ color: palette.ink, alpha: sceneryStyle.farAlpha });
        this.ridge(near, h * 0.78, 16, 2, 2.8, 8);
        near.fill({ color: palette.ink, alpha: sceneryStyle.nearAlpha }).stroke({ color: this.accent, width: 1, alpha: sceneryStyle.rimAlpha });
        for (let i = 0; i < 3; i++) {
          const x = this.width * (0.2 + i * 0.3) + this.seed(i + 30) * 60;
          near.ellipse(x, h * 0.84, 22 + this.seed(i + 33) * 20, 9 + this.seed(i + 36) * 7).fill({ color: palette.void, alpha: 0.9 }).stroke({ color: this.accent, width: 1, alpha: sceneryStyle.rimAlpha });
        }
        break;
      }
      case 'crystalcaves': {
        // A cave: stalactites hanging from above, a glowing floor below.
        far.moveTo(-40, -40).lineTo(this.width + 40, -40).lineTo(this.width + 40, h * 0.08);
        for (let k = 30; k >= 0; k--) {
          const x = (k / 30) * (this.width + 80) - 40;
          const drop = h * (0.04 + this.seed(k + 100) * 0.09);
          far.lineTo(x, k % 2 === 0 ? drop : h * 0.03);
        }
        far.closePath().fill({ color: palette.ink, alpha: sceneryStyle.farAlpha * 0.7 }).stroke({ color: this.accent, width: 1, alpha: sceneryStyle.rimAlpha * 0.5 });
        this.ridge(near, h * 0.84, 10, 26, 3.3, 22);
        near.fill({ color: palette.ink, alpha: sceneryStyle.nearAlpha }).stroke({ color: this.accent, width: 1, alpha: sceneryStyle.rimAlpha });
        break;
      }
      case 'shadowterrace': {
        // Terraced hillside: stepped ridges climbing to a pagoda on the skyline.
        this.ridge(far, h * 0.48, 30, 10, 0.6, 12);
        far.fill({ color: palette.ink, alpha: sceneryStyle.farAlpha * 0.7 });
        for (let step = 0; step < 4; step++) {
          const y = h * (0.6 + step * 0.085);
          far.moveTo(-40, y + 20 + step * 4).lineTo(-40, y);
          for (let x = -40; x <= this.width + 40; x += 60) far.lineTo(x, y + Math.sin(x / 210 + step) * 7);
          far.lineTo(this.width + 40, h + 40).lineTo(-40, h + 40).closePath();
          far.fill({ color: palette.ink, alpha: sceneryStyle.farAlpha * (0.8 + step * 0.1) }).stroke({ color: this.accent, width: 1, alpha: sceneryStyle.rimAlpha * (0.6 + step * 0.1) });
        }
        // Pagoda: three roofs narrowing toward the top.
        const px = this.width * 0.78;
        const base = h * 0.48 + Math.sin(12 * 0.9 + 0.6) * 30 * 0.3;
        for (let tier = 0; tier < 3; tier++) {
          const y = base - tier * 26;
          const wdt = 46 - tier * 10;
          near.moveTo(px - wdt, y).quadraticCurveTo(px, y - 6, px + wdt, y).lineTo(px + wdt * 0.6, y - 14).lineTo(px - wdt * 0.6, y - 14).closePath().fill({ color: palette.void, alpha: 0.95 }).stroke({ color: this.accent, width: 1, alpha: sceneryStyle.rimAlpha });
        }
        near.moveTo(px, base - 78).lineTo(px, base - 92).stroke({ color: this.accent, width: 1, alpha: sceneryStyle.rimAlpha });
        this.ridge(near, h * 0.88, 8, 3, 3.9, 10);
        near.fill({ color: palette.ink, alpha: sceneryStyle.nearAlpha }).stroke({ color: this.accent, width: 1, alpha: sceneryStyle.rimAlpha });
        break;
      }
      default: {
        // Moon Lake: distant hills behind a wide, still lake.
        this.ridge(far, h * 0.52, 22, 8, 1.2, 12);
        far.fill({ color: palette.ink, alpha: sceneryStyle.farAlpha });
        near.rect(-40, h * 0.58, this.width + 80, h * 0.5).fill({ color: palette.ink, alpha: 0.35 });
        near.moveTo(-40, h * 0.58).lineTo(this.width + 40, h * 0.58).stroke({ color: this.accent, width: 1, alpha: sceneryStyle.rimAlpha });
      }
    }
  }

  update(dt: number): void {
    if (reducedMotion()) return;
    this.time += dt;
    const px = this.parallax.x * 10;
    const py = this.parallax.y * 6;
    this.far.position.set(-px * sceneryStyle.parallaxFar, -py * sceneryStyle.parallaxFar);
    this.near.position.set(-px * sceneryStyle.parallaxNear, -py * sceneryStyle.parallaxNear);
    this.dyn.position.copyFrom(this.near.position);
    this.spawnBirds(dt);
    const g = this.dyn;
    g.clear();
    this.drawWater(g);
    this.drawPlants(g);
    this.drawBirds(g, dt);
  }

  private drawWater(g: Graphics): void {
    const h = this.height;
    if (this.id === 'tidepools') {
      // Waves rolling up the shore and sliding back.
      for (let i = 0; i < 3; i++) {
        const phase = (this.time * 0.18 + i / 3) % 1;
        const reach = h * (0.72 + phase * 0.13);
        const alpha = 0.35 * Math.sin(phase * Math.PI);
        g.moveTo(-40, reach);
        for (let x = -40; x <= this.width + 40; x += 30) g.lineTo(x, reach + Math.sin(x / 70 + this.time * 0.6 + i) * 4);
        g.stroke({ color: this.accent, width: 1.2, alpha });
      }
    } else if (this.id === 'nightsky') {
      // A river winding down from the mountains with a slow shimmer along it.
      const pts: Array<[number, number]> = [];
      for (let k = 0; k <= 12; k++) {
        const t = k / 12;
        pts.push([this.width * (0.55 + Math.sin(t * 4.2) * 0.12 * (1 - t) + t * 0.1), h * (0.62 + t * 0.4)]);
      }
      g.moveTo(pts[0]![0], pts[0]![1]);
      for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
      g.stroke({ color: this.accent, width: 3, alpha: 0.12 });
      for (let k = 0; k < 6; k++) {
        const t = ((this.time * 0.07 + k / 6) % 1) * 12;
        const i = Math.min(11, Math.floor(t));
        const f = t - i;
        const x = pts[i]![0] + (pts[i + 1]![0] - pts[i]![0]) * f;
        const y = pts[i]![1] + (pts[i + 1]![1] - pts[i]![1]) * f;
        g.circle(x, y, 1.5).fill({ color: palette.pearl, alpha: 0.35 });
      }
    } else if (this.id === 'crystalcaves') {
      // An underground stream glowing faintly along the floor.
      g.moveTo(-40, h * 0.9);
      for (let x = -40; x <= this.width + 40; x += 24) g.lineTo(x, h * 0.9 + Math.sin(x / 120 + this.time * 0.4) * 5);
      g.stroke({ color: this.accent, width: 2, alpha: 0.18 });
    } else if (this.id === 'shadowterrace') {
      // Mist drifting between the terrace steps.
      for (let i = 0; i < 3; i++) {
        const y = h * (0.64 + i * 0.085);
        const drift = ((this.time * (6 + i * 2) + i * 300) % (this.width + 400)) - 200;
        g.ellipse(drift, y, 120 + i * 30, 5).fill({ color: this.accent, alpha: 0.06 });
        g.ellipse(this.width - drift, y + 12, 90, 4).fill({ color: palette.pearl, alpha: 0.04 });
      }
    } else if (this.id === 'moonlake') {
      // The moon's reflection, a column of light broken by ripples.
      const cx = this.width * 0.68;
      for (let i = 0; i < 9; i++) {
        const y = h * (0.6 + i * 0.045);
        const w = 26 + i * 9 + Math.sin(this.time * 0.8 + i) * 6;
        g.moveTo(cx - w, y).lineTo(cx + w, y).stroke({ color: palette.pearl, width: 1.5, alpha: 0.16 - i * 0.012 });
      }
    }
  }

  private drawPlants(g: Graphics): void {
    if (this.id === 'crystalcaves') return;
    const h = this.height;
    const baseY = this.id === 'moonlake' ? h * 0.93 : this.id === 'tidepools' ? h * 0.9 : h * 0.86;
    const wind = Math.sin(this.time * sceneryStyle.windSpeed) * 0.5 + Math.sin(this.time * sceneryStyle.windSpeed * 0.37) * 0.5;
    for (const p of this.plants) {
      const y0 = baseY + Math.sin(p.x / 140) * 8;
      const sway = (wind + Math.sin(this.time * 1.7 + p.phase) * 0.35) * 0.35 + p.lean;
      const tipX = p.x + sway * p.height;
      const tipY = y0 - p.height;
      g.moveTo(p.x, y0).quadraticCurveTo(p.x + sway * p.height * 0.3, y0 - p.height * 0.6, tipX, tipY).stroke({ color: palette.void, width: p.width + 0.6, alpha: sceneryStyle.plantAlpha });
      g.moveTo(p.x, y0).quadraticCurveTo(p.x + sway * p.height * 0.3, y0 - p.height * 0.6, tipX, tipY).stroke({ color: this.accent, width: p.width * 0.5, alpha: 0.28 });
      if (this.id === 'stonegarden') {
        // Bamboo joints.
        for (let s = 0.3; s < 1; s += 0.3) g.circle(p.x + sway * p.height * s * 0.5, y0 - p.height * s, 1).fill({ color: this.accent, alpha: 0.25 });
      }
    }
  }

  private spawnBirds(dt: number): void {
    this.nextFlock -= dt;
    if (this.nextFlock > 0) return;
    const [min, max] = sceneryStyle.birdEvery;
    this.nextFlock = min + this.rng.next() * (max - min);
    const count = 3 + this.rng.int(0, 4);
    const dir = this.rng.chance(0.5) ? 1 : -1;
    const y = this.height * (0.12 + this.rng.next() * 0.3);
    const startX = dir > 0 ? -60 : this.width + 60;
    for (let i = 0; i < count; i++) {
      this.birds.push({
        x: startX - dir * i * 18,
        y: y + (i % 2 === 0 ? i * 7 : -i * 5),
        vx: dir * sceneryStyle.birdSpeed * (0.9 + this.rng.next() * 0.2),
        size: 5 + this.rng.next() * 3,
        phase: this.rng.next() * Math.PI * 2,
      });
    }
  }

  private drawBirds(g: Graphics, dt: number): void {
    this.birds = this.birds.filter((b) => b.x > -100 && b.x < this.width + 100);
    for (const b of this.birds) {
      b.x += b.vx * dt;
      b.y += Math.sin(this.time * 0.7 + b.phase) * 4 * dt;
      const flap = Math.sin(this.time * 6 + b.phase) * 0.6;
      const s = b.size;
      g.moveTo(b.x - s, b.y - flap * s * 0.6)
        .quadraticCurveTo(b.x - s * 0.5, b.y + s * 0.2, b.x, b.y)
        .quadraticCurveTo(b.x + s * 0.5, b.y + s * 0.2, b.x + s, b.y - flap * s * 0.6)
        .stroke({ color: palette.void, width: 1.4, alpha: sceneryStyle.birdAlpha + 0.3, cap: 'round' });
      g.moveTo(b.x - s, b.y - flap * s * 0.6)
        .quadraticCurveTo(b.x - s * 0.5, b.y + s * 0.2, b.x, b.y)
        .quadraticCurveTo(b.x + s * 0.5, b.y + s * 0.2, b.x + s, b.y - flap * s * 0.6)
        .stroke({ color: this.accent, width: 0.8, alpha: sceneryStyle.birdAlpha, cap: 'round' });
    }
  }

  destroy(): void {
    this.back.destroy({ children: true });
    this.front.destroy({ children: true });
  }
}
