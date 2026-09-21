import gsap from 'gsap';
import { Container, Graphics, Text } from 'pixi.js';
import { alphas, palette } from '../design/palette';
import { breathe, durations, easings, scaled } from '../design/motion';
import { progression } from '../core/progress';
import { layout } from '../design/layout';
import { events } from '../core/events';
import { drawIcon } from './icons';

export const introStyle = {
  numberSize: 26,
  numberOffsetY: -196,
  glyphOffsetY: -92,
  glyphScale: 1.5,
  captionOffsetY: 34,
  captionSize: 19,
  captionLineHeight: 30,
  captionMaxWidth: 520,
  dotsOffsetY: -152,
  dotRadius: 3,
  dotGap: 14,
  buttonGap: 44,
  buttonRadius: 26,
  backdropAlpha: 0.8,
} as const;

export interface IntroContent {
  glyph: Container | null;
  lines: string[];
}

// The instruction card shown as a level begins: level number, chapter dots, a looping
// demonstration, a short caption, and a continue button that must be pressed.
export class LevelIntro extends Container {
  private backdrop = new Graphics();
  private card = new Container();
  private button = new Container();
  private done = false;
  private finish: () => void = () => {};
  private unsubscribe: () => void = () => {};
  private buttonTween: gsap.core.Tween | null = null;

  constructor(levelIndex: number, accent: number, content: IntroContent) {
    super();
    this.backdrop.eventMode = 'static';
    this.addChild(this.backdrop, this.card);

    const number = new Text({
      text: String(levelIndex + 1),
      style: { fontFamily: 'Quicksand', fontWeight: '300', fontSize: introStyle.numberSize, letterSpacing: 6, fill: palette.pearl },
      resolution: window.devicePixelRatio || 1,
    });
    number.anchor.set(0.5);
    number.y = introStyle.numberOffsetY;
    number.alpha = alphas.hudHover;
    this.card.addChild(number);

    const chapter = Math.floor(levelIndex / progression.levelsPerChapter);
    const dots = new Graphics();
    const startX = (-(progression.chapters - 1) * introStyle.dotGap) / 2;
    for (let i = 0; i < progression.chapters; i++) {
      const x = startX + i * introStyle.dotGap;
      if (i === chapter) dots.circle(x, introStyle.dotsOffsetY, introStyle.dotRadius).fill({ color: accent });
      else dots.circle(x, introStyle.dotsOffsetY, introStyle.dotRadius).stroke({ color: palette.dim, width: 1 });
    }
    this.card.addChild(dots);

    if (content.glyph) {
      content.glyph.y = introStyle.glyphOffsetY;
      content.glyph.scale.set(introStyle.glyphScale);
      this.card.addChild(content.glyph);
    }

    content.lines.forEach((line, i) => {
      const text = new Text({
        text: line,
        style: {
          fontFamily: 'Quicksand',
          fontWeight: '300',
          fontSize: i === 0 ? introStyle.captionSize : introStyle.captionSize - 3,
          letterSpacing: 1,
          fill: palette.pearl,
          align: 'center',
          wordWrap: true,
          wordWrapWidth: introStyle.captionMaxWidth,
        },
        resolution: window.devicePixelRatio || 1,
      });
      text.anchor.set(0.5);
      text.y = introStyle.captionOffsetY + i * introStyle.captionLineHeight;
      text.alpha = i === 0 ? alphas.logo : alphas.hudHover * 0.75;
      this.card.addChild(text);
    });

    const ring = new Graphics().circle(0, 0, introStyle.buttonRadius).fill({ color: palette.ink }).stroke({ color: accent, width: 1.5 });
    const icon = drawIcon(new Graphics(), 'play', introStyle.buttonRadius, palette.pearl);
    icon.x = 2;
    const hit = new Graphics().circle(0, 0, Math.max(layout.minHitSize, introStyle.buttonRadius + 8)).fill({ color: palette.pearl, alpha: 0.001 });
    this.button.addChild(hit, ring, icon);
    this.button.y = introStyle.captionOffsetY + Math.max(1, content.lines.length) * introStyle.captionLineHeight + introStyle.buttonGap;
    this.button.eventMode = 'static';
    this.button.cursor = 'pointer';
    this.button.alpha = alphas.hudHover;
    this.button.on('pointerover', () => gsap.to(this.button, { alpha: 1, duration: durations.hudHover }));
    this.button.on('pointerout', () => gsap.to(this.button, { alpha: alphas.hudHover, duration: durations.hudHover }));
    this.button.on('pointertap', () => this.dismiss());
    this.card.addChild(this.button);

    this.alpha = 0;
    this.card.scale.set(0.96);
  }

  // Resolves when the card has been dismissed and faded out.
  play(width: number, height: number): Promise<void> {
    this.resize(width, height);
    return new Promise((resolve) => {
      this.finish = resolve;
      gsap.to(this, { alpha: 1, duration: scaled(durations.pieceMove) * 1.5, ease: easings.ambient });
      gsap.to(this.card.scale, { x: 1, y: 1, duration: scaled(durations.pieceMove) * 2, ease: easings.response });
      this.buttonTween = gsap.to(this.button.scale, {
        x: breathe.scaleTo + 0.03,
        y: breathe.scaleTo + 0.03,
        duration: durations.breathe / 2,
        ease: easings.ambient,
        yoyo: true,
        repeat: -1,
      });
      this.unsubscribe = events.on('input:key', (key) => {
        if (key === 'Enter' || key === ' ') this.dismiss();
      });
    });
  }

  resize(width: number, height: number): void {
    this.backdrop.clear().rect(0, 0, width, height).fill({ color: palette.shadow, alpha: introStyle.backdropAlpha });
    this.card.position.set(width / 2, height / 2);
  }

  private dismiss(): void {
    if (this.done) return;
    this.done = true;
    this.unsubscribe();
    this.buttonTween?.kill();
    this.backdrop.eventMode = 'none';
    this.button.eventMode = 'none';
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
