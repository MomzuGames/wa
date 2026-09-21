import { Container, FillGradient, Graphics, Sprite, type Texture } from 'pixi.js';
import { alphas, palette, rgba } from '../design/palette';
import { dust, reducedMotion } from '../design/motion';
import type { Rng } from '../core/rng';

interface Mote {
  sprite: Sprite;
  vx: number;
  vy: number;
  phase: number;
  baseAlpha: number;
}

export class Background {
  readonly container = new Container();
  private vignette = new Graphics();
  private motes: Mote[] = [];
  private width = 0;
  private height = 0;
  private time = 0;

  constructor(texture: Texture, private rng: Rng) {
    this.container.addChild(this.vignette);
    for (let i = 0; i < dust.count; i++) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.tint = palette.pearl;
      const radius = rng.next() * (dust.radiusMax - dust.radiusMin) + dust.radiusMin;
      sprite.scale.set(radius / 6);
      sprite.blendMode = 'screen';
      const baseAlpha = rng.next() * (alphas.dustMax - alphas.dustMin) + alphas.dustMin;
      sprite.alpha = baseAlpha;
      this.container.addChild(sprite);
      const angle = rng.next() * Math.PI * 2;
      const speed = rng.next() * (dust.speedMax - dust.speedMin) + dust.speedMin;
      this.motes.push({
        sprite,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        phase: rng.next() * Math.PI * 2,
        baseAlpha,
      });
    }
  }

  resize(width: number, height: number): void {
    const first = this.width === 0;
    this.width = width;
    this.height = height;
    this.drawVignette();
    for (const m of this.motes) {
      if (first) {
        m.sprite.position.set(this.rng.next() * width, this.rng.next() * height);
      } else {
        m.sprite.x = Math.min(m.sprite.x, width);
        m.sprite.y = Math.min(m.sprite.y, height);
      }
    }
  }

  private drawVignette(): void {
    const gradient = new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.5 },
      innerRadius: 0,
      outerCenter: { x: 0.5, y: 0.5 },
      outerRadius: 0.75,
      colorStops: [
        { offset: 0, color: rgba('shadow', 0) },
        { offset: 0.55, color: rgba('shadow', 0) },
        { offset: 1, color: rgba('shadow', alphas.vignette) },
      ],
    });
    this.vignette.clear().rect(0, 0, this.width, this.height).fill(gradient);
  }

  update(dtSeconds: number): void {
    if (reducedMotion()) return;
    this.time += dtSeconds;
    const w = this.width;
    const h = this.height;
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i]!;
      const s = m.sprite;
      s.x += (m.vx + Math.sin(this.time * 0.3 + m.phase) * dust.wobble * 4) * dtSeconds;
      s.y += (m.vy + Math.cos(this.time * 0.23 + m.phase) * dust.wobble * 4) * dtSeconds;
      s.alpha = m.baseAlpha * (0.75 + 0.25 * Math.sin(this.time * 0.5 + m.phase));
      if (s.x < -10) s.x = w + 10;
      else if (s.x > w + 10) s.x = -10;
      if (s.y < -10) s.y = h + 10;
      else if (s.y > h + 10) s.y = -10;
    }
  }
}
