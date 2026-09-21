import gsap from 'gsap';
import { Container, Text } from 'pixi.js';
import type { Scene } from '../core/sceneManager';
import { alphas, palette } from '../design/palette';
import { durations, easings, scaled } from '../design/motion';
import { BreathingDot } from '../ui/breathingDot';

export const GAME_TITLE = 'LUMA';

const titleStyle = {
  fontSize: 64,
  letterSpacing: 22,
  logoOffsetY: -120,
  dotOffsetY: 40,
} as const;

export class TitleScene implements Scene {
  readonly container = new Container();
  private logo: Text;
  private dot: BreathingDot;
  private pressed = false;

  constructor(private onStart: () => void) {
    this.logo = new Text({
      text: GAME_TITLE,
      style: {
        fontFamily: 'Quicksand',
        fontWeight: '300',
        fontSize: titleStyle.fontSize,
        letterSpacing: titleStyle.letterSpacing,
        fill: palette.pearl,
      },
      resolution: window.devicePixelRatio || 1,
    });
    this.logo.anchor.set(0.5);
    this.logo.alpha = 0;

    this.dot = new BreathingDot('mint', () => this.press());
    this.container.addChild(this.logo, this.dot);
  }

  enter(): void {
    gsap.to(this.logo, {
      alpha: alphas.logo,
      duration: scaled(durations.logoFadeIn),
      ease: easings.ambient,
      delay: 0.3,
    });
  }

  private press(): void {
    if (this.pressed) return;
    this.pressed = true;
    this.onStart();
  }

  resize(width: number, height: number): void {
    const cx = width / 2;
    const cy = height / 2;
    // Nudge the letter-spacing trailing gap so the word looks centred.
    this.logo.position.set(cx + titleStyle.letterSpacing / 2, cy + titleStyle.logoOffsetY);
    this.dot.position.set(cx, cy + titleStyle.dotOffsetY);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
