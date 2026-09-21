import { Container, FillGradient, Graphics, Sprite, Texture, type Renderer } from 'pixi.js';
import { palette, rgba } from '../design/palette';

export const PARTICLE_CAP = 400;

interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  alphaFrom: number;
  alphaTo: number;
  scaleFrom: number;
  scaleTo: number;
  drag: number;
  active: boolean;
}

export interface EmitOptions {
  x: number;
  y: number;
  color?: number;
  vx?: number;
  vy?: number;
  life?: number;
  alphaFrom?: number;
  alphaTo?: number;
  scaleFrom?: number;
  scaleTo?: number;
  drag?: number;
}

export function createSoftDotTexture(renderer: Renderer, radius = 16): Texture {
  const gradient = new FillGradient({
    type: 'radial',
    center: { x: 0.5, y: 0.5 },
    innerRadius: 0,
    outerCenter: { x: 0.5, y: 0.5 },
    outerRadius: 0.5,
    colorStops: [
      { offset: 0, color: rgba('pearl', 1) },
      { offset: 0.4, color: rgba('pearl', 0.6) },
      { offset: 1, color: rgba('pearl', 0) },
    ],
  });
  const g = new Graphics().circle(radius, radius, radius).fill(gradient);
  const texture = renderer.generateTexture({ target: g, resolution: 2 });
  g.destroy();
  return texture;
}

export class ParticleSystem {
  readonly container = new Container();
  private pool: Particle[] = [];
  private liveCount = 0;

  constructor(private texture: Texture) {
    for (let i = 0; i < PARTICLE_CAP; i++) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.visible = false;
      this.container.addChild(sprite);
      this.pool.push({
        sprite,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        alphaFrom: 1,
        alphaTo: 0,
        scaleFrom: 1,
        scaleTo: 1,
        drag: 1,
        active: false,
      });
    }
  }

  get live(): number {
    return this.liveCount;
  }

  emit(options: EmitOptions): void {
    const p = this.pool.find((q) => !q.active);
    if (!p) return;
    p.active = true;
    p.vx = options.vx ?? 0;
    p.vy = options.vy ?? 0;
    p.maxLife = options.life ?? 1.2;
    p.life = p.maxLife;
    p.alphaFrom = options.alphaFrom ?? 0.6;
    p.alphaTo = options.alphaTo ?? 0;
    p.scaleFrom = options.scaleFrom ?? 0.6;
    p.scaleTo = options.scaleTo ?? 0.1;
    p.drag = options.drag ?? 0.98;
    p.sprite.position.set(options.x, options.y);
    p.sprite.tint = options.color ?? palette.pearl;
    p.sprite.alpha = p.alphaFrom;
    p.sprite.scale.set(p.scaleFrom);
    p.sprite.visible = true;
    this.liveCount++;
  }

  update(dtSeconds: number): void {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i]!;
      if (!p.active) continue;
      p.life -= dtSeconds;
      if (p.life <= 0) {
        p.active = false;
        p.sprite.visible = false;
        this.liveCount--;
        continue;
      }
      const t = 1 - p.life / p.maxLife;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.sprite.x += p.vx * dtSeconds;
      p.sprite.y += p.vy * dtSeconds;
      p.sprite.alpha = p.alphaFrom + (p.alphaTo - p.alphaFrom) * t;
      p.sprite.scale.set(p.scaleFrom + (p.scaleTo - p.scaleFrom) * t);
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.texture.destroy(true);
  }
}
