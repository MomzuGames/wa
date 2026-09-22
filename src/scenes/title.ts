import gsap from 'gsap';
import { Container, Text } from 'pixi.js';
import type { Scene } from '../core/sceneManager';
import { alphas, palette } from '../design/palette';
import { durations, easings, scaled } from '../design/motion';
import { BreathingDot } from '../ui/breathingDot';
import { isCompact } from '../design/layout';
import { GAME_TITLE } from '../config/game';
import { events } from '../core/events';


const titleStyle = {
  fontSize: 64,
  letterSpacing: 22,
  logoOffsetY: -120,
  dotOffsetY: 40,
  floatAmount: 10,
  anticEvery: 5,
  compactFontSize: 42,
  compactLetterSpacing: 12,
} as const;

export class TitleScene implements Scene {
  readonly container = new Container();
  private logo: Text;
  private dot: BreathingDot;
  private pressed = false;
  private anticTimer: gsap.core.Tween | null = null;
  private floatTween: gsap.core.Tween | null = null;

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
    this.logo.eventMode = 'none';

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
    // The title drifts like something floating on water.
    this.floatTween = gsap.to(this.logo, {
      y: `+=${titleStyle.floatAmount}`,
      rotation: 0.012,
      duration: durations.breathe,
      ease: easings.ambient,
      yoyo: true,
      repeat: -1,
    });
    this.scheduleAntic();
  }

  // Every so often the light hops up onto a letter of the title, wobbles, and hops back.
  private scheduleAntic(): void {
    this.anticTimer?.kill();
    this.anticTimer = gsap.delayedCall(titleStyle.anticEvery, () => {
      if (this.pressed || this.container.destroyed || this.logo.destroyed) return;
      const letters = GAME_TITLE.length;
      const k = Math.floor(Math.random() * letters);
      const x = this.logo.x - this.logo.width / 2 + ((k + 0.5) / letters) * this.logo.width;
      const y = this.logo.y - this.logo.height / 2 - 26;
      void this.dot.visit(x, y).then(() => {
        if (!this.container.destroyed) this.scheduleAntic();
      });
    });
  }

  // The title dot becomes the travelling spirit on the spot: it bursts with joy, loops
  // once around, and the map fades in beneath it while it sets off to tour the regions.
  private press(): void {
    if (this.pressed) return;
    this.pressed = true;
    const global = this.dot.getGlobalPosition();
    events.emit('spirit:joy', { x: global.x, y: global.y });
    gsap.to(this.dot.scale, { x: 0.2, y: 0.2, duration: scaled(durations.pieceMove), ease: easings.response });
    gsap.to(this.dot, { alpha: 0, duration: scaled(durations.pieceMove) });
    gsap.delayedCall(scaled(durations.pieceMove) * 1.5, () => this.onStart());
  }

  resize(width: number, height: number): void {
    const cx = width / 2;
    const cy = height / 2;
    // Nudge the letter-spacing trailing gap so the word looks centred.
    const compact = isCompact(width);
    this.logo.style.fontSize = compact ? titleStyle.compactFontSize : titleStyle.fontSize;
    this.logo.style.letterSpacing = compact ? titleStyle.compactLetterSpacing : titleStyle.letterSpacing;
    const spacing = compact ? titleStyle.compactLetterSpacing : titleStyle.letterSpacing;
    this.logo.position.set(cx + spacing / 2, cy + titleStyle.logoOffsetY);
    this.dot.settle(cx, cy + titleStyle.dotOffsetY);
  }

  destroy(): void {
    this.anticTimer?.kill();
    this.floatTween?.kill();
    this.container.destroy({ children: true });
  }
}
