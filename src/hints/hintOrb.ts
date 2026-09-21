import gsap from 'gsap';
import { Container, Graphics } from 'pixi.js';
import { alphas, palette } from '../design/palette';
import { durations, easings } from '../design/motion';
import { layout } from '../design/layout';
import { createGlow } from '../fx/glow';

const orbStyle = {
  radius: 12,
  ringWidth: 1.5,
} as const;

export class HintOrb extends Container {
  private ring = new Graphics();
  private light = new Graphics();
  private hit = new Graphics();
  private readyTween: gsap.core.Tween | null = null;
  private accent: number;

  constructor(accent: number, onPress: () => void) {
    super();
    this.accent = accent;
    const hitRadius = Math.max(layout.minHitSize / 2, orbStyle.radius * 1.6);
    this.hit.circle(0, 0, hitRadius).fill({ color: palette.pearl, alpha: 0.001 });
    this.ring.circle(0, 0, orbStyle.radius).stroke({ color: palette.dim, width: orbStyle.ringWidth });
    this.addChild(this.hit, this.light, this.ring);
    this.alpha = alphas.hudIdle;
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerover', () => gsap.to(this, { alpha: alphas.hudHover, duration: durations.hudHover }));
    this.on('pointerout', () => gsap.to(this, { alpha: alphas.hudIdle, duration: durations.hudHover }));
    this.on('pointertap', onPress);
    this.setFill(0, false);
  }

  // fill 0..1 rises from the bottom of the orb; ready adds glow and a slow pulse.
  setFill(fill: number, ready: boolean): void {
    const r = orbStyle.radius - orbStyle.ringWidth;
    const clamped = Math.min(1, Math.max(0, fill));
    this.light.clear();
    if (clamped > 0) {
      const top = r - clamped * 2 * r;
      this.light.circle(0, 0, r).fill({ color: this.accent, alpha: ready ? 0.9 : 0.45 });
      // Mask the unfilled top by painting it back in ink.
      if (clamped < 1) this.light.rect(-r, -r, 2 * r, top + r).fill({ color: palette.ink });
    }
    if (ready) {
      this.light.filters = [createGlow(this.accent, { distance: 16, strength: 1.4 })];
      if (!this.readyTween) {
        this.readyTween = gsap.to(this.scale, {
          x: 1.15,
          y: 1.15,
          duration: durations.breathe / 3,
          ease: easings.ambient,
          yoyo: true,
          repeat: -1,
        });
      }
    } else {
      this.light.filters = [];
      this.readyTween?.kill();
      this.readyTween = null;
      this.scale.set(1);
    }
  }

  override destroy(): void {
    this.readyTween?.kill();
    super.destroy({ children: true });
  }
}
