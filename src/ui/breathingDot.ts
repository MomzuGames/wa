import gsap from 'gsap';
import { Container, FillGradient, Graphics } from 'pixi.js';
import { palette, rgba, type PaletteToken } from '../design/palette';
import { easings, heroBreathe } from '../design/motion';
import { layout } from '../design/layout';
import { createGlow } from '../fx/glow';

const dotStyle = {
  radius: 24,
  haloRadius: 90,
  glowDistance: 48,
} as const;

export class BreathingDot extends Container {
  private timeline: gsap.core.Timeline;

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

    this.addChild(halo, dot);

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

  override destroy(): void {
    this.timeline.kill();
    super.destroy({ children: true });
  }
}
