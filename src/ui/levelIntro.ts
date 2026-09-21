import gsap from 'gsap';
import { Container, Graphics, Text } from 'pixi.js';
import { alphas, palette } from '../design/palette';
import { durations, easings, scaled } from '../design/motion';
import { progression } from '../core/progress';

export const introStyle = {
  holdSeconds: 2.2,
  numberSize: 72,
  glyphOffsetY: -120,
  dotsOffsetY: 64,
  dotRadius: 3.5,
  dotGap: 16,
  backdropAlpha: 0.74,
} as const;

// A wordless card shown as a level begins: the level number, which chapter it belongs
// to, and a small looping demonstration of the mechanic. Any click dismisses it.
export class LevelIntro extends Container {
  private backdrop = new Graphics();
  private card = new Container();
  private done = false;
  private finish: () => void = () => {};

  constructor(levelIndex: number, accent: number, glyph: Container | null) {
    super();
    this.backdrop.eventMode = 'static';
    this.backdrop.on('pointerdown', () => this.dismiss());
    this.addChild(this.backdrop, this.card);

    const number = new Text({
      text: String(levelIndex + 1),
      style: { fontFamily: 'Quicksand', fontWeight: '300', fontSize: introStyle.numberSize, letterSpacing: 6, fill: palette.pearl },
      resolution: window.devicePixelRatio || 1,
    });
    number.anchor.set(0.5);
    number.alpha = alphas.logo;
    this.card.addChild(number);

    const chapter = Math.floor(levelIndex / progression.levelsPerChapter);
    const dots = new Graphics();
    const total = progression.chapters;
    const startX = (-(total - 1) * introStyle.dotGap) / 2;
    for (let i = 0; i < total; i++) {
      const x = startX + i * introStyle.dotGap;
      if (i === chapter) dots.circle(x, introStyle.dotsOffsetY, introStyle.dotRadius).fill({ color: accent });
      else dots.circle(x, introStyle.dotsOffsetY, introStyle.dotRadius).stroke({ color: palette.dim, width: 1 });
    }
    this.card.addChild(dots);

    if (glyph) {
      glyph.y = introStyle.glyphOffsetY;
      this.card.addChild(glyph);
    }

    this.alpha = 0;
    this.card.scale.set(0.96);
  }

  // Resolves when the card has faded out.
  play(width: number, height: number): Promise<void> {
    this.resize(width, height);
    return new Promise((resolve) => {
      this.finish = resolve;
      gsap.to(this, { alpha: 1, duration: scaled(durations.pieceMove) * 1.5, ease: easings.ambient });
      gsap.to(this.card.scale, { x: 1, y: 1, duration: scaled(durations.pieceMove) * 2, ease: easings.response });
      gsap.delayedCall(scaled(introStyle.holdSeconds), () => this.dismiss());
    });
  }

  resize(width: number, height: number): void {
    this.backdrop.clear().rect(0, 0, width, height).fill({ color: palette.shadow, alpha: introStyle.backdropAlpha });
    this.card.position.set(width / 2, height / 2);
  }

  private dismiss(): void {
    if (this.done) return;
    this.done = true;
    this.backdrop.eventMode = 'none';
    gsap.to(this, {
      alpha: 0,
      duration: scaled(durations.pieceMove) * 2,
      ease: easings.ambient,
      onComplete: () => {
        this.finish();
        this.destroy({ children: true });
      },
    });
  }
}
