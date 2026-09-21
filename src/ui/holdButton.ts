import gsap from 'gsap';
import { Container, Graphics } from 'pixi.js';
import { alphas, palette } from '../design/palette';
import { durations, easings } from '../design/motion';
import { layout } from '../design/layout';
import { drawIcon, type IconName } from './icons';

export const holdStyle = {
  seconds: 1.5,
  ringRadius: 22,
  ringWidth: 2,
} as const;

// Press-and-hold confirmation: a ring fills while held and fires on completion.
export class HoldButton extends Container {
  private icon = new Graphics();
  private ring = new Graphics();
  private hit = new Graphics();
  private progress = { t: 0 };
  private tween: gsap.core.Tween | null = null;

  constructor(name: IconName, size: number, private onComplete: () => void) {
    super();
    this.hit.circle(0, 0, Math.max(layout.minHitSize / 2, holdStyle.ringRadius + 4)).fill({ color: palette.pearl, alpha: 0.001 });
    drawIcon(this.icon, name, size, palette.pearl);
    this.addChild(this.hit, this.ring, this.icon);
    this.alpha = alphas.hudIdle;
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerdown', () => this.begin());
    this.on('pointerup', () => this.cancel());
    this.on('pointerupoutside', () => this.cancel());
    this.on('pointerover', () => gsap.to(this, { alpha: alphas.hudHover, duration: durations.hudHover }));
    this.on('pointerout', () => gsap.to(this, { alpha: alphas.hudIdle, duration: durations.hudHover }));
  }

  private begin(): void {
    this.tween?.kill();
    this.progress.t = 0;
    this.tween = gsap.to(this.progress, {
      t: 1,
      duration: holdStyle.seconds,
      ease: 'none',
      onUpdate: () => this.drawRing(),
      onComplete: () => {
        this.drawRing();
        this.onComplete();
        gsap.to(this.progress, { t: 0, duration: durations.panelToggle, ease: easings.response, onUpdate: () => this.drawRing() });
      },
    });
  }

  private cancel(): void {
    if (!this.tween || this.progress.t >= 1) return;
    this.tween.kill();
    this.tween = gsap.to(this.progress, { t: 0, duration: durations.microFeedback, onUpdate: () => this.drawRing() });
  }

  private drawRing(): void {
    this.ring.clear();
    if (this.progress.t <= 0) return;
    const end = -Math.PI / 2 + this.progress.t * Math.PI * 2;
    this.ring.arc(0, 0, holdStyle.ringRadius, -Math.PI / 2, end).stroke({ color: palette.pearl, width: holdStyle.ringWidth, cap: 'round' });
  }
}
