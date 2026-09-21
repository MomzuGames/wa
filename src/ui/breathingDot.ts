import gsap from 'gsap';
import { Container, FillGradient, Graphics } from 'pixi.js';
import { palette, rgba, type PaletteToken } from '../design/palette';
import { easings, heroBreathe } from '../design/motion';
import { layout } from '../design/layout';
import { createGlow } from '../fx/glow';
import { Face } from './face';

const dotStyle = {
  radius: 24,
  haloRadius: 90,
  glowDistance: 48,
} as const;

export class BreathingDot extends Container {
  private timeline: gsap.core.Timeline;
  private body = new Container();
  private face: Face;
  private home = { x: 0, y: 0 };

  constructor(token: PaletteToken, onPress?: () => void) {
    super();
    const color = palette[token];

    const haloGradient = new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.5 },
      innerRadius: 0,
      outerCenter: { x: 0.5, y: 0.5 },
      outerRadius: 0.5,
      textureSize: 512,
      colorStops: [
        { offset: 0, color: rgba(token, 1) },
        { offset: 0.35, color: rgba(token, 1) },
        { offset: 1, color: rgba(token, 0) },
      ],
    });
    const halo = new Graphics().circle(0, 0, dotStyle.haloRadius).fill(haloGradient);
    halo.blendMode = 'screen';
    halo.alpha = heroBreathe.haloFrom;

    const dot = new Graphics().circle(0, 0, dotStyle.radius).fill({ color });
    const glow = createGlow(color, { distance: dotStyle.glowDistance, strength: heroBreathe.glowFrom });
    dot.filters = [glow];
    this.face = new Face(dotStyle.radius);

    this.body.addChild(halo, dot, this.face);
    this.addChild(this.body);

    if (onPress) {
      const hit = new Graphics()
        .circle(0, 0, Math.max(layout.minHitSize, dotStyle.radius * 2))
        .fill({ color: palette.pearl, alpha: 0.001 });
      this.addChild(hit);
      this.eventMode = 'static';
      this.cursor = 'pointer';
      this.on('pointertap', onPress);
    }

    const e = easings.ambient;
    this.timeline = gsap
      .timeline({ repeat: -1 })
      .to(dot.scale, { x: heroBreathe.scaleTo, y: heroBreathe.scaleTo, duration: heroBreathe.inhale, ease: e })
      .to(glow, { outerStrength: heroBreathe.glowTo, duration: heroBreathe.inhale, ease: e }, 0)
      .to(halo, { alpha: heroBreathe.haloTo, duration: heroBreathe.inhale, ease: e }, 0)
      .to(halo.scale, { x: heroBreathe.haloScaleTo, y: heroBreathe.haloScaleTo, duration: heroBreathe.inhale, ease: e }, 0)
      .to(dot.scale, { x: heroBreathe.scaleFrom, y: heroBreathe.scaleFrom, duration: heroBreathe.exhale, ease: e })
      .to(glow, { outerStrength: heroBreathe.glowFrom, duration: heroBreathe.exhale, ease: e }, '<')
      .to(halo, { alpha: heroBreathe.haloFrom, duration: heroBreathe.exhale, ease: e }, '<')
      .to(halo.scale, { x: heroBreathe.scaleFrom, y: heroBreathe.scaleFrom, duration: heroBreathe.exhale, ease: e }, '<');
  }

  // Remembers where it lives so antics can return home.
  settle(x: number, y: number): void {
    this.home = { x, y };
    this.position.set(x, y);
  }

  // Hops up to a point, wobbles happily, and hops back home.
  visit(x: number, y: number): Promise<void> {
    const lift = 70;
    return new Promise((resolve) => {
      gsap
        .timeline({ onComplete: resolve })
        .to(this.body.scale, { x: 1.2, y: 0.8, duration: 0.12 })
        .to(this.body.scale, { x: 0.9, y: 1.15, duration: 0.2 })
        .to(this, { x, duration: 0.6, ease: 'sine.inOut' }, '<')
        .to(this, { y: Math.min(this.y, y) - lift, duration: 0.3, ease: 'sine.out' }, '<')
        .to(this, { y, duration: 0.3, ease: 'sine.in' })
        .to(this.body.scale, { x: 1.25, y: 0.75, duration: 0.1 })
        .to(this.body.scale, { x: 1, y: 1, duration: 0.3, ease: 'back.out(2)' })
        .to(this.body, { rotation: 0.25, duration: 0.12, yoyo: true, repeat: 5, ease: 'sine.inOut' })
        .set(this.body, { rotation: 0 })
        .call(() => this.face.squint(0.5))
        .to(this.body.scale, { x: 1.2, y: 0.8, duration: 0.12 }, '+=0.9')
        .to(this.body.scale, { x: 0.9, y: 1.15, duration: 0.2 })
        .to(this, { x: this.home.x, duration: 0.6, ease: 'sine.inOut' }, '<')
        .to(this, { y: y - lift, duration: 0.3, ease: 'sine.out' }, '<')
        .to(this, { y: this.home.y, duration: 0.3, ease: 'sine.in' })
        .to(this.body.scale, { x: 1.25, y: 0.75, duration: 0.1 })
        .to(this.body.scale, { x: 1, y: 1, duration: 0.3, ease: 'back.out(2)' });
    });
  }

  lookAt(dx: number, dy: number): void {
    this.face.lookAt(dx, dy);
  }

  override destroy(): void {
    this.timeline.kill();
    gsap.killTweensOf([this, this.body, this.body.scale]);
    super.destroy({ children: true });
  }
}
