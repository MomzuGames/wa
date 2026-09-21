import gsap from 'gsap';
import { Container, Graphics } from 'pixi.js';
import { alphas, palette } from '../design/palette';
import { durations, easings } from '../design/motion';
import { layout } from '../design/layout';
import { drawIcon, type IconName } from './icons';

export class IconButton extends Container {
  private icon = new Graphics();
  private hit = new Graphics();
  private iconName: IconName;
  private iconSize: number;
  private iconColor: number;

  constructor(name: IconName, onPress: () => void, size: number = layout.hudIconSize, color: number = palette.pearl) {
    super();
    this.iconName = name;
    this.iconSize = size;
    this.iconColor = color;
    const hitRadius = Math.max(layout.minHitSize, size) * 0.75;
    this.hit.circle(0, 0, hitRadius).fill({ color: palette.pearl, alpha: 0.001 });
    this.addChild(this.hit, this.icon);
    this.redraw();
    this.alpha = alphas.hudIdle;
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerover', () => this.fadeTo(alphas.hudHover));
    this.on('pointerout', () => this.fadeTo(alphas.hudIdle));
    this.on('pointertap', onPress);
  }

  setIcon(name: IconName): void {
    this.iconName = name;
    this.redraw();
  }

  private redraw(): void {
    drawIcon(this.icon, this.iconName, this.iconSize, this.iconColor);
  }

  private fadeTo(alpha: number): void {
    gsap.to(this, { alpha, duration: durations.hudHover, ease: easings.response });
  }
}
