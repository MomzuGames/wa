import gsap from 'gsap';
import { Container, FillGradient, Graphics } from 'pixi.js';
import { palette, rgba } from '../design/palette';
import { breathe, durations, easings, scaled } from '../design/motion';
import { createGlow } from '../fx/glow';
import type { ParticleSystem } from '../fx/particles';
import { events } from '../core/events';

export const spiritStyle = {
  radius: 8,
  haloRadius: 26,
  glideSeconds: 1.1,
  hopSeconds: 0.55,
  arcLift: 40,
  reactScale: 1.35,
  dimAlpha: 0.35,
  trailInterval: 0.05,
} as const;

// The light that travels with the player: a small breathing dot with a halo.
// It listens to spirit events so scenes never need a reference to it.
export class Spirit extends Container {
  private dot = new Graphics();
  private halo = new Graphics();
  private body = new Container();
  private breatheTween: gsap.core.Tween;
  private moving: gsap.core.Timeline | null = null;
  private trailClock = 0;
  private lastPos = { x: 0, y: 0 };

  constructor(private particles: ParticleSystem) {
    super();
    const gradient = new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.5 },
      innerRadius: 0,
      outerCenter: { x: 0.5, y: 0.5 },
      outerRadius: 0.5,
      colorStops: [
        { offset: 0, color: rgba('mint', 0.8) },
        { offset: 1, color: rgba('mint', 0) },
      ],
    });
    this.halo.circle(0, 0, spiritStyle.haloRadius).fill(gradient);
    this.halo.blendMode = 'screen';
    this.dot.circle(0, 0, spiritStyle.radius).fill({ color: palette.pearl });
    this.dot.filters = [createGlow(palette.mint, { distance: 16, strength: 1.4 })];
    this.body.addChild(this.halo, this.dot);
    this.addChild(this.body);
    this.eventMode = 'none';
    this.alpha = 0;
    this.breatheTween = gsap.to(this.body.scale, {
      x: breathe.scaleTo + 0.05,
      y: breathe.scaleTo + 0.05,
      duration: durations.breathe / 2,
      ease: easings.ambient,
      yoyo: true,
      repeat: -1,
    });
    events.on('spirit:glide', ({ x, y, duration, hop }) => (hop ? this.hop(x, y) : this.glideTo(x, y, duration)));
    events.on('spirit:react', (r) => this.react(r));
  }

  show(x?: number, y?: number): void {
    if (x !== undefined && y !== undefined) this.position.set(x, y);
    gsap.to(this, { alpha: 1, duration: scaled(durations.pieceMove), overwrite: 'auto' });
  }

  hide(): void {
    gsap.to(this, { alpha: 0, duration: scaled(durations.pieceMove), overwrite: 'auto' });
  }

  glideTo(x: number, y: number, duration: number = spiritStyle.glideSeconds): Promise<void> {
    this.moving?.kill();
    if (this.alpha === 0) this.show();
    const d = scaled(duration);
    return new Promise((resolve) => {
      this.moving = gsap
        .timeline({ onComplete: resolve })
        .to(this, { x, duration: d, ease: easings.ambient }, 0)
        .to(this, { y: y - spiritStyle.arcLift * 0.5, duration: d * 0.5, ease: 'sine.out' }, 0)
        .to(this, { y, duration: d * 0.5, ease: 'sine.in' }, d * 0.5);
    });
  }

  hop(x: number, y: number): Promise<void> {
    this.moving?.kill();
    const d = scaled(spiritStyle.hopSeconds);
    return new Promise((resolve) => {
      this.moving = gsap
        .timeline({ onComplete: resolve })
        .to(this, { x, duration: d, ease: 'sine.inOut' }, 0)
        .to(this, { y: Math.min(this.y, y) - spiritStyle.arcLift, duration: d * 0.5, ease: 'sine.out' }, 0)
        .to(this, { y, duration: d * 0.5, ease: 'sine.in' }, d * 0.5);
    });
  }

  private react(reaction: 'move' | 'attempt' | 'solved' | 'hide' | 'show'): void {
    switch (reaction) {
      case 'move':
        gsap.fromTo(this.dot.scale, { x: 1.25, y: 1.25 }, { x: 1, y: 1, duration: durations.microFeedback * 2, ease: easings.response });
        break;
      case 'attempt':
        gsap.to(this.body, { alpha: spiritStyle.dimAlpha, duration: durations.microFeedback, yoyo: true, repeat: 1 });
        gsap.to(this, { y: this.y + 6, duration: durations.microFeedback, yoyo: true, repeat: 1 });
        break;
      case 'solved':
        gsap
          .timeline()
          .to(this, { y: this.y - spiritStyle.arcLift * 0.8, duration: durations.pieceMove, ease: 'sine.out' })
          .to(this, { y: this.y, duration: durations.pieceMove, ease: 'bounce.out' })
          .to(this.body.scale, { x: spiritStyle.reactScale, y: spiritStyle.reactScale, duration: durations.microFeedback, yoyo: true, repeat: 1 }, 0);
        for (let i = 0; i < 14; i++) {
          const a = Math.random() * Math.PI * 2;
          this.particles.emit({
            x: this.x,
            y: this.y,
            color: palette.mint,
            vx: Math.cos(a) * 40,
            vy: Math.sin(a) * 40 - 20,
            life: 0.9,
            alphaFrom: 0.7,
            scaleFrom: 0.3,
            scaleTo: 0.05,
          });
        }
        break;
      case 'hide':
        this.hide();
        break;
      case 'show':
        this.show();
        break;
    }
  }

  // Leaves a faint trail of motes while it travels.
  update(dt: number): void {
    if (this.alpha <= 0) return;
    const moved = Math.hypot(this.x - this.lastPos.x, this.y - this.lastPos.y);
    this.lastPos = { x: this.x, y: this.y };
    if (moved < 1.5) return;
    this.trailClock += dt;
    if (this.trailClock < spiritStyle.trailInterval) return;
    this.trailClock = 0;
    this.particles.emit({
      x: this.x,
      y: this.y,
      color: palette.mint,
      vx: 0,
      vy: -6,
      life: 0.7,
      alphaFrom: 0.35,
      scaleFrom: 0.25,
      scaleTo: 0.05,
    });
  }

  override destroy(): void {
    this.breatheTween.kill();
    this.moving?.kill();
    super.destroy({ children: true });
  }
}
