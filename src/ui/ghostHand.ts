import gsap from 'gsap';
import { Container, Graphics } from 'pixi.js';
import { palette } from '../design/palette';
import { durations, easings } from '../design/motion';
import { createGlow } from '../fx/glow';

export const ghostHandStyle = {
  radius: 10,
  alpha: 0.55,
  tapScale: 0.7,
  moveSeconds: 0.9,
  pauseSeconds: 0.6,
  loopPauseSeconds: 1.4,
} as const;

// A soft pearl dot that demonstrates an interaction until the player makes a move.
export class GhostHand extends Container {
  private dot = new Graphics();
  private timeline: gsap.core.Timeline | null = null;

  constructor() {
    super();
    this.dot.circle(0, 0, ghostHandStyle.radius).fill({ color: palette.pearl });
    this.dot.filters = [createGlow(palette.pearl, { distance: 14, strength: 1 })];
    this.addChild(this.dot);
    this.alpha = 0;
    this.eventMode = 'none';
  }

  // Moves to a point, taps, and optionally spins a quarter turn; loops forever.
  demoTap(x: number, y: number, spin = true): void {
    this.stop();
    this.position.set(x, y - 40);
    const tl = gsap.timeline({ repeat: -1, repeatDelay: ghostHandStyle.loopPauseSeconds });
    tl.to(this, { alpha: ghostHandStyle.alpha, duration: durations.pieceMove })
      .to(this, { y, duration: ghostHandStyle.moveSeconds, ease: easings.ambient }, '<')
      .to(this.dot.scale, { x: ghostHandStyle.tapScale, y: ghostHandStyle.tapScale, duration: durations.microFeedback, yoyo: true, repeat: 1 });
    if (spin) {
      tl.to(this, { rotation: Math.PI / 2, duration: durations.pieceMove, ease: easings.tileSnap });
    }
    tl.to(this, { alpha: 0, duration: durations.pieceMove, delay: ghostHandStyle.pauseSeconds }).set(this, { rotation: 0 });
    this.timeline = tl;
  }

  // Presses at the first point and glides through the rest; loops forever.
  demoPath(points: Array<{ x: number; y: number }>): void {
    this.stop();
    if (points.length === 0) return;
    const first = points[0]!;
    this.position.set(first.x, first.y);
    const tl = gsap.timeline({ repeat: -1, repeatDelay: ghostHandStyle.loopPauseSeconds });
    tl.to(this, { alpha: ghostHandStyle.alpha, duration: durations.pieceMove })
      .to(this.dot.scale, { x: ghostHandStyle.tapScale, y: ghostHandStyle.tapScale, duration: durations.microFeedback });
    for (let i = 1; i < points.length; i++) {
      tl.to(this, { x: points[i]!.x, y: points[i]!.y, duration: ghostHandStyle.moveSeconds * 0.7, ease: easings.ambient });
    }
    tl.to(this.dot.scale, { x: 1, y: 1, duration: durations.microFeedback })
      .to(this, { alpha: 0, duration: durations.pieceMove, delay: ghostHandStyle.pauseSeconds })
      .set(this, { x: first.x, y: first.y });
    this.timeline = tl;
  }

  stop(): void {
    this.timeline?.kill();
    this.timeline = null;
    gsap.to(this, { alpha: 0, duration: durations.microFeedback });
  }

  override destroy(): void {
    this.timeline?.kill();
    super.destroy({ children: true });
  }
}
