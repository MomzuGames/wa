import gsap from 'gsap';
import { Container, Graphics, Text } from 'pixi.js';
import { alphas, palette } from '../design/palette';
import { durations, easings, scaled } from '../design/motion';
import { IconButton } from './iconButton';

const confirmStyle = {
  width: 260,
  height: 120,
  radius: 16,
  iconSize: 26,
} as const;

// A small card that asks a yes/no question with two icon buttons.
export class ConfirmCard extends Container {
  private backdrop = new Graphics();
  private card = new Container();

  constructor(question: string, accent: number, onAnswer: (yes: boolean) => void) {
    super();
    this.backdrop.eventMode = 'static';
    this.backdrop.on('pointertap', () => this.close(false, onAnswer));
    const panel = new Graphics()
      .roundRect(-confirmStyle.width / 2, -confirmStyle.height / 2, confirmStyle.width, confirmStyle.height, confirmStyle.radius)
      .fill({ color: palette.ink })
      .stroke({ color: accent, width: 1, alpha: 0.6 });
    panel.eventMode = 'static';
    const text = new Text({
      text: question,
      style: { fontFamily: 'Quicksand', fontWeight: '300', fontSize: 18, letterSpacing: 1, fill: palette.pearl },
      resolution: window.devicePixelRatio || 1,
    });
    text.anchor.set(0.5);
    text.y = -confirmStyle.height / 2 + 36;
    text.alpha = alphas.logo;
    const yes = new IconButton('yes', () => this.close(true, onAnswer), confirmStyle.iconSize, accent);
    const no = new IconButton('no', () => this.close(false, onAnswer), confirmStyle.iconSize);
    yes.position.set(-40, confirmStyle.height / 2 - 36);
    no.position.set(40, confirmStyle.height / 2 - 36);
    this.card.addChild(panel, text, yes, no);
    this.addChild(this.backdrop, this.card);
    this.alpha = 0;
    this.card.scale.set(0.95);
  }

  open(width: number, height: number): void {
    this.backdrop.clear().rect(0, 0, width, height).fill({ color: palette.shadow, alpha: 0.45 });
    this.card.position.set(width / 2, height / 2);
    gsap.to(this, { alpha: 1, duration: scaled(durations.panelToggle), ease: easings.response });
    gsap.to(this.card.scale, { x: 1, y: 1, duration: scaled(durations.panelToggle), ease: easings.response });
  }

  private close(answer: boolean, onAnswer: (yes: boolean) => void): void {
    this.backdrop.eventMode = 'none';
    gsap.to(this, {
      alpha: 0,
      duration: scaled(durations.panelToggle),
      ease: easings.response,
      onComplete: () => {
        onAnswer(answer);
        this.destroy({ children: true });
      },
    });
  }
}
