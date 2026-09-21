import gsap from 'gsap';
import { Container, Graphics, Text } from 'pixi.js';
import { alphas, palette } from '../design/palette';
import { durations, easings, scaled } from '../design/motion';

const toastStyle = {
  holdSeconds: 4.5,
  padding: 18,
  fontSize: 16,
  bottomOffset: 84,
} as const;

// A quiet one-line message that fades in near the bottom of the screen and out again.
export class Toast extends Container {
  private panel = new Graphics();
  private text: Text;
  private hide: gsap.core.Tween | null = null;

  constructor(accent: number) {
    super();
    this.text = new Text({
      text: '',
      style: { fontFamily: 'Quicksand', fontWeight: '300', fontSize: toastStyle.fontSize, letterSpacing: 1, fill: palette.pearl, align: 'center', wordWrap: true, wordWrapWidth: Math.min(560, window.innerWidth - 48) },
      resolution: window.devicePixelRatio || 1,
    });
    this.text.anchor.set(0.5);
    this.panel.eventMode = 'none';
    this.eventMode = 'none';
    this.addChild(this.panel, this.text);
    this.alpha = 0;
    this.accent = accent;
  }

  private accent: number;

  show(message: string, width: number, height: number): void {
    this.text.text = message;
    const w = this.text.width + toastStyle.padding * 2;
    const h = this.text.height + toastStyle.padding;
    this.panel.clear().roundRect(-w / 2, -h / 2, w, h, h / 2).fill({ color: palette.ink, alpha: 0.92 }).stroke({ color: this.accent, width: 1, alpha: 0.5 });
    this.position.set(width / 2, height - toastStyle.bottomOffset);
    this.hide?.kill();
    gsap.to(this, { alpha: alphas.hudHover + 0.05, duration: scaled(durations.pieceMove), ease: easings.response });
    this.hide = gsap.to(this, { alpha: 0, duration: scaled(durations.pieceMove) * 2, delay: toastStyle.holdSeconds, ease: easings.ambient });
  }
}
