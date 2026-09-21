import gsap from 'gsap';
import { Container, Text } from 'pixi.js';
import type { Scene } from '../core/sceneManager';
import { alphas, palette } from '../design/palette';
import { durations, easings, scaled } from '../design/motion';
import { BreathingDot } from '../ui/breathingDot';
import { GAME_TITLE } from '../config/game';
import { events } from '../core/events';


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
    events.emit('spirit:react', 'hide');
    gsap.to(this.logo, {
      alpha: alphas.logo,
      duration: scaled(durations.logoFadeIn),
      ease: easings.ambient,
      delay: 0.3,
    });
  }

  // The title dot shrinks away and the travelling spirit takes over from the same spot.
  private press(): void {
    if (this.pressed) return;
    this.pressed = true;
    const global = this.dot.getGlobalPosition();
    events.emit('spirit:glide', { x: global.x, y: global.y, duration: 0.01 });
    gsap.to(this.dot.scale, { x: 0.2, y: 0.2, duration: scaled(durations.pieceMove) * 2, ease: easings.response });
    gsap.to(this.dot, { alpha: 0, duration: scaled(durations.pieceMove) * 2 });
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
