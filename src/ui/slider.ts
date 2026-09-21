import { Container, FederatedPointerEvent, Graphics } from 'pixi.js';
import { alphas, palette } from '../design/palette';
import { layout } from '../design/layout';

const sliderStyle = {
  width: 180,
  trackWidth: 3,
  handleRadius: 8,
} as const;

export class Slider extends Container {
  private track = new Graphics();
  private fill = new Graphics();
  private handle = new Graphics();
  private hit = new Graphics();
  private dragging = false;
  private _value: number;

  constructor(initial: number, private onChange: (value: number) => void, private onRelease?: () => void) {
    super();
    this._value = initial;
    const w = sliderStyle.width;
    const hitHalf = Math.max(layout.minHitSize, sliderStyle.handleRadius * 3) / 2;
    this.hit.rect(-hitHalf, -hitHalf, w + hitHalf * 2, hitHalf * 2).fill({ color: palette.pearl, alpha: 0.001 });
    this.track.moveTo(0, 0).lineTo(w, 0).stroke({ color: palette.dim, width: sliderStyle.trackWidth, cap: 'round' });
    this.handle.circle(0, 0, sliderStyle.handleRadius).fill({ color: palette.pearl });
    this.addChild(this.hit, this.track, this.fill, this.handle);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerdown', this.onDown, this);
    this.on('globalpointermove', this.onMove, this);
    this.on('pointerup', this.onUp, this);
    this.on('pointerupoutside', this.onUp, this);
    this.redraw();
  }

  get value(): number {
    return this._value;
  }

  private setFromEvent(e: FederatedPointerEvent): void {
    const local = this.toLocal(e.global);
    const v = Math.min(1, Math.max(0, local.x / sliderStyle.width));
    if (v !== this._value) {
      this._value = v;
      this.redraw();
      this.onChange(v);
    }
  }

  private onDown(e: FederatedPointerEvent): void {
    this.dragging = true;
    this.setFromEvent(e);
  }

  private onMove(e: FederatedPointerEvent): void {
    if (this.dragging) this.setFromEvent(e);
  }

  private onUp(): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.onRelease?.();
  }

  private redraw(): void {
    const x = this._value * sliderStyle.width;
    this.fill
      .clear()
      .moveTo(0, 0)
      .lineTo(x, 0)
      .stroke({ color: palette.pearl, width: sliderStyle.trackWidth, cap: 'round', alpha: alphas.hudHover });
    this.handle.x = x;
  }
}
