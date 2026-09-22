import gsap from 'gsap';
import { Container, type FederatedPointerEvent, Graphics, Text } from 'pixi.js';
import { alphas, palette } from '../design/palette';
import { breathe, durations, easings, scaled } from '../design/motion';
import { isCompact, layout } from '../design/layout';
import { events } from '../core/events';
import { drawIcon } from './icons';
import type { IntroPage } from '../regions/types';

export const introStyle = {
  numberSize: 26,
  numberOffsetY: -212,
  glyphOffsetY: -92,
  glyphScale: 1.5,
  captionOffsetY: 34,
  captionSize: 18,
  captionMaxWidth: 460,
  dotsGap: 14,
  dotRadius: 3,
  arrowOffsetX: 250,
  arrowSize: 30,
  buttonGap: 44,
  buttonRadius: 26,
  backdropAlpha: 0.8,
  swipeDistance: 40,
  pageSlide: 60,
} as const;

// The instruction card shown as a level begins: one page per mechanic in the level,
// each with a looping demonstration and a caption. Pages turn with the arrows, a swipe
// or the arrow keys; the play button (or Enter) closes the card.
export class LevelIntro extends Container {
  private backdrop = new Graphics();
  private card = new Container();
  private pageLayer = new Container();
  private current: { root: Container; glyph: Container; caption: Text } | null = null;
  private dots = new Graphics();
  private prev: Container;
  private next: Container;
  private button = new Container();
  private index: number;
  private done = false;
  private turning = false;
  private finish: () => void = () => {};
  private unsubscribe: () => void = () => {};
  private buttonTween: gsap.core.Tween | null = null;
  private compactScale = 1;
  private screenWidth = 0;
  private wrapWidth: number = introStyle.captionMaxWidth;
  private dragStart: { x: number; y: number } | null = null;

  constructor(
    levelName: string,
    private accent: number,
    private pages: IntroPage[],
    startPage = 0,
  ) {
    super();
    this.index = Math.max(0, Math.min(startPage, pages.length - 1));
    this.backdrop.eventMode = 'static';
    this.addChild(this.backdrop, this.card);

    const number = new Text({
      text: levelName,
      style: { fontFamily: 'Quicksand', fontWeight: '300', fontSize: introStyle.numberSize - 4, letterSpacing: 6, fill: palette.pearl },
      resolution: window.devicePixelRatio || 1,
    });
    number.anchor.set(0.5);
    number.y = introStyle.numberOffsetY;
    number.alpha = alphas.hudHover;

    this.prev = this.arrow(-1);
    this.next = this.arrow(1);
    this.card.addChild(number, this.pageLayer, this.dots, this.prev, this.next);

    const ring = new Graphics().circle(0, 0, introStyle.buttonRadius).fill({ color: palette.ink }).stroke({ color: accent, width: 1.5 });
    const icon = drawIcon(new Graphics(), 'play', introStyle.buttonRadius, palette.pearl);
    icon.x = 2;
    const hit = new Graphics().circle(0, 0, Math.max(layout.minHitSize, introStyle.buttonRadius + 8)).fill({ color: palette.pearl, alpha: 0.001 });
    this.button.addChild(hit, ring, icon);
    this.button.eventMode = 'static';
    this.button.cursor = 'pointer';
    this.button.alpha = alphas.hudHover;
    this.button.on('pointerover', () => gsap.to(this.button, { alpha: 1, duration: durations.hudHover }));
    this.button.on('pointerout', () => gsap.to(this.button, { alpha: alphas.hudHover, duration: durations.hudHover }));
    this.button.on('pointertap', () => this.dismiss());
    this.card.addChild(this.button);

    // Swiping anywhere on the card turns the page.
    this.backdrop.on('pointerdown', (e: FederatedPointerEvent) => {
      this.dragStart = { x: e.global.x, y: e.global.y };
    });
    const endDrag = (e: FederatedPointerEvent) => {
      if (!this.dragStart) return;
      const dx = e.global.x - this.dragStart.x;
      const dy = e.global.y - this.dragStart.y;
      this.dragStart = null;
      if (Math.abs(dx) > introStyle.swipeDistance && Math.abs(dx) > Math.abs(dy) * 1.5) this.turn(dx < 0 ? 1 : -1);
    };
    this.backdrop.on('pointerup', endDrag);
    this.backdrop.on('pointerupoutside', endDrag);

    this.showPage(this.index, 0);
    this.alpha = 0;
    this.card.scale.set(0.96);
  }

  private arrow(direction: -1 | 1): Container {
    const root = new Container();
    const size = introStyle.arrowSize;
    const hit = new Graphics().circle(0, 0, Math.max(layout.minHitSize, size)).fill({ color: palette.pearl, alpha: 0.001 });
    const chevron = new Graphics()
      .moveTo(-direction * size * 0.18, -size * 0.32)
      .lineTo(direction * size * 0.18, 0)
      .lineTo(-direction * size * 0.18, size * 0.32)
      .stroke({ color: palette.pearl, width: 2, cap: 'round', join: 'round' });
    root.addChild(hit, chevron);
    root.eventMode = 'static';
    root.cursor = 'pointer';
    root.alpha = alphas.hudIdle;
    root.on('pointerover', () => gsap.to(root, { alpha: alphas.hudHover, duration: durations.hudHover }));
    root.on('pointerout', () => gsap.to(root, { alpha: alphas.hudIdle, duration: durations.hudHover }));
    root.on('pointertap', () => this.turn(direction));
    return root;
  }

  private buildPage(i: number): { root: Container; glyph: Container; caption: Text } {
    const page = this.pages[i]!;
    const root = new Container();
    const glyph = page.glyph();
    glyph.y = introStyle.glyphOffsetY;
    glyph.scale.set(introStyle.glyphScale);
    const caption = new Text({
      text: page.caption,
      style: {
        fontFamily: 'Quicksand',
        fontWeight: '300',
        fontSize: introStyle.captionSize,
        letterSpacing: 1,
        fill: palette.pearl,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: this.wrapWidth,
      },
      resolution: window.devicePixelRatio || 1,
    });
    caption.anchor.set(0.5, 0);
    caption.y = introStyle.captionOffsetY;
    caption.alpha = alphas.logo;
    root.addChild(glyph, caption);
    return { root, glyph, caption };
  }

  private showPage(i: number, direction: -1 | 0 | 1): void {
    const old = this.current;
    this.index = i;
    const page = this.buildPage(i);
    this.pageLayer.addChild(page.root);
    this.current = page;
    this.drawDots();
    this.placeButton();
    this.prev.visible = i > 0;
    this.next.visible = i < this.pages.length - 1;
    // The next arrow breathes on every page but the last, to show there is more to read.
    gsap.killTweensOf(this.next.scale);
    this.next.scale.set(1);
    if (this.next.visible) gsap.to(this.next.scale, { x: 1.15, y: 1.15, duration: durations.breathe / 3, yoyo: true, repeat: -1, ease: easings.ambient });
    if (direction === 0 || !old) return;
    this.turning = true;
    page.root.alpha = 0;
    page.root.x = direction * introStyle.pageSlide;
    gsap.to(page.root, { alpha: 1, x: 0, duration: scaled(durations.pieceMove), ease: easings.response, onComplete: () => (this.turning = false) });
    gsap.to(old.root, {
      alpha: 0,
      x: -direction * introStyle.pageSlide,
      duration: scaled(durations.pieceMove) * 0.8,
      ease: easings.response,
      onComplete: () => old.root.destroy({ children: true }),
    });
  }

  private turn(direction: -1 | 1): void {
    if (this.done || this.turning) return;
    const target = this.index + direction;
    if (target < 0 || target >= this.pages.length) return;
    this.showPage(target, direction);
  }

  private drawDots(): void {
    const g = this.dots;
    g.clear();
    const count = this.pages.length;
    if (count <= 1) return;
    const startX = (-(count - 1) * introStyle.dotsGap) / 2;
    for (let i = 0; i < count; i++) {
      const x = startX + i * introStyle.dotsGap;
      if (i === this.index) g.circle(x, 0, introStyle.dotRadius).fill({ color: this.accent });
      else g.circle(x, 0, introStyle.dotRadius).stroke({ color: palette.dim, width: 1 });
    }
  }

  // Resolves when the card has been dismissed and faded out.
  play(width: number, height: number): Promise<void> {
    if (isCompact(width)) {
      this.card.scale.set(0.8);
      this.compactScale = 0.8;
    }
    this.resize(width, height);
    return new Promise((resolve) => {
      this.finish = resolve;
      gsap.to(this, { alpha: 1, duration: scaled(durations.pieceMove) * 1.5, ease: easings.ambient });
      gsap.to(this.card.scale, { x: this.compactScale, y: this.compactScale, duration: scaled(durations.pieceMove) * 2, ease: easings.response });
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
        if (key === 'ArrowRight') this.turn(1);
        if (key === 'ArrowLeft') this.turn(-1);
      });
    });
  }

  private placeButton(): void {
    if (!this.current) return;
    const caption = this.current.caption;
    caption.style.wordWrapWidth = this.wrapWidth;
    const bottom = introStyle.captionOffsetY + caption.height;
    this.dots.y = bottom + 26;
    this.button.y = bottom + introStyle.buttonGap + 30;
    const arrowX = Math.min(introStyle.arrowOffsetX, this.screenWidth / this.compactScale / 2 - 28);
    this.prev.position.set(-arrowX, introStyle.glyphOffsetY);
    this.next.position.set(arrowX, introStyle.glyphOffsetY);
  }

  resize(width: number, height: number): void {
    this.screenWidth = width;
    this.backdrop.clear().rect(0, 0, width, height).fill({ color: palette.shadow, alpha: introStyle.backdropAlpha });
    this.card.position.set(width / 2, height / 2);
    // Captions wrap to the screen, leaving room for the arrows on either side.
    this.wrapWidth = Math.min(introStyle.captionMaxWidth, (width - 32) / this.compactScale);
    this.placeButton();
  }

  private dismiss(): void {
    if (this.done) return;
    this.done = true;
    this.unsubscribe();
    this.buttonTween?.kill();
    gsap.killTweensOf(this.next.scale);
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
