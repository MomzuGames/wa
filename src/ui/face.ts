import gsap from 'gsap';
import { Container, Graphics } from 'pixi.js';
import { palette } from '../design/palette';

export const faceStyle = {
  eyeOffsetX: 0.34, // fractions of the body radius
  eyeOffsetY: -0.08,
  eyeRadius: 0.13,
  blinkEvery: [2.5, 5.5] as const,
  lookRange: 0.18,
} as const;

// Two small eyes that blink and glance around: the difference between a dot and a creature.
export class Face extends Container {
  private left = new Graphics();
  private right = new Graphics();
  private blinkTimer: gsap.core.Tween | null = null;
  private look = { x: 0, y: 0 };

  constructor(private radius: number) {
    super();
    this.eventMode = 'none';
    for (const eye of [this.left, this.right]) {
      eye.circle(0, 0, radius * faceStyle.eyeRadius).fill({ color: palette.void, alpha: 0.85 });
      this.addChild(eye);
    }
    this.place();
    this.scheduleBlink();
  }

  private place(): void {
    const r = this.radius;
    this.left.position.set(-r * faceStyle.eyeOffsetX + this.look.x * r, r * faceStyle.eyeOffsetY + this.look.y * r);
    this.right.position.set(r * faceStyle.eyeOffsetX + this.look.x * r, r * faceStyle.eyeOffsetY + this.look.y * r);
  }

  // Glance toward a direction (-1..1 each axis); eases back to centre when called with zeros.
  lookAt(dx: number, dy: number): void {
    if (this.destroyed) return;
    gsap.to(this.look, {
      x: dx * faceStyle.lookRange,
      y: dy * faceStyle.lookRange,
      duration: 0.35,
      ease: 'sine.out',
      onUpdate: () => this.place(),
      overwrite: true,
    });
  }

  blink(): void {
    if (this.destroyed) return;
    gsap.to([this.left.scale, this.right.scale], { y: 0.1, duration: 0.07, yoyo: true, repeat: 1, ease: 'sine.inOut' });
  }

  // Happy: eyes squeeze into little arcs by squashing.
  squint(seconds: number): void {
    if (this.destroyed) return;
    gsap.to([this.left.scale, this.right.scale], { y: 0.35, x: 1.3, duration: 0.15, yoyo: true, repeat: 1, repeatDelay: seconds });
  }

  private scheduleBlink(): void {
    const [min, max] = faceStyle.blinkEvery;
    this.blinkTimer = gsap.delayedCall(min + Math.random() * (max - min), () => {
      if (this.destroyed) return;
      this.blink();
      if (Math.random() < 0.25) gsap.delayedCall(0.25, () => this.blink());
      this.scheduleBlink();
    });
  }

  override destroy(): void {
    this.blinkTimer?.kill();
    gsap.killTweensOf([this.left.scale, this.right.scale, this.look]);
    super.destroy({ children: true });
  }
}
