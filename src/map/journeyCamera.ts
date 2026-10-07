import { type Container, type FederatedPointerEvent, Graphics } from 'pixi.js';
import { palette } from '../design/palette';
import { events } from '../core/events';

// The camera over a scrolling journey (the world map and each land's trail on a phone).
// A swipe up or down travels along it and a flick eases out; the camera glides wherever it
// is sent (`focus`), and can pull back to show everything (`zoom`). It moves a "world"
// container, and hands the same camera to the little light ('spirit:camera'), so the
// lights live in the journey's own coordinates and grow and shrink with the view.

export const journeyCameraStyle = {
  glide: 4, // per second: how fast the camera follows its target
  flick: 0.92, // how a released swipe eases out
  slop: 10, // px a finger travels before a touch becomes a swipe
  settled: 0.4, // px per frame below which a flick has come to rest
} as const;

export class JourneyCamera {
  z = 1;
  cy = 0; // the journey's own height shown in the middle of the screen
  target = { z: 1, cy: 0 };
  enabled = false; // only on a phone (portrait); wide screens show everything at once
  locked = false; // no swiping (while a story plays)
  dragMoved = false; // the last touch was a swipe, so it must not also choose something
  onSettle: () => void = () => {}; // the view came to rest after a swipe
  private swipe: { y: number; last: number; moved: boolean; v: number } | null = null;
  private flickV = 0;
  private travelling = false;
  private range = { min: 0, max: 0 };
  private hit = new Graphics();
  private width = 0;
  private height = 0;

  constructor(container: Container) {
    this.hit.eventMode = 'static';
    container.addChildAt(this.hit, 0);
    container.eventMode = 'static';
    container.on('pointerdown', (e: FederatedPointerEvent) => {
      this.dragMoved = false;
      if (!this.enabled || this.locked) return;
      this.swipe = { y: e.global.y, last: e.global.y, moved: false, v: 0 };
      this.flickV = 0;
    });
    container.on('globalpointermove', (e: FederatedPointerEvent) => {
      const s = this.swipe;
      if (!s) return;
      if (!s.moved && Math.abs(e.global.y - s.y) > journeyCameraStyle.slop) s.moved = this.dragMoved = true;
      if (!s.moved) return;
      const dy = (e.global.y - s.last) / this.z;
      s.v = dy;
      s.last = e.global.y;
      this.target.cy = this.clamp(this.target.cy - dy);
      this.cy = this.target.cy;
      this.travelling = true;
    });
    const release = () => {
      if (this.swipe?.moved) this.flickV = this.swipe.v;
      this.swipe = null;
    };
    container.on('pointerup', release);
    container.on('pointerupoutside', release);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.hit.clear().rect(0, 0, width, height).fill({ color: palette.pearl, alpha: 0.001 });
    if (!this.enabled) this.target = { z: 1, cy: height / 2 };
    if (!this.enabled) this.cy = height / 2;
    this.target.cy = this.clamp(this.target.cy);
  }

  // How far the middle of the screen may travel (journey heights).
  setRange(min: number, max: number): void {
    this.range = { min, max: Math.max(min, max) };
  }

  clamp(cy: number): number {
    if (!this.enabled) return this.height / 2;
    return Math.max(this.range.min, Math.min(this.range.max, cy));
  }

  // Glide (or jump) so a journey height sits in the middle of the screen.
  focus(y: number, instant = false): void {
    if (!this.enabled) return;
    this.target = { z: 1, cy: this.clamp(y) };
    if (instant) ({ z: this.z, cy: this.cy } = this.target);
  }

  // Pull back (z below 1) to show more of the journey around a height.
  zoom(z: number, cy: number, instant = false): void {
    if (!this.enabled) return;
    this.target = { z, cy };
    if (instant) ({ z: this.z, cy: this.cy } = this.target);
  }

  // The part of the journey on screen (where the view is heading), in journey heights.
  visible(): { top: number; bottom: number } {
    const half = this.height / 2 / (this.target.z || 1);
    return { top: this.target.cy - half, bottom: this.target.cy + half };
  }

  // Where a journey height shows on the screen right now.
  screenY(y: number): number {
    return this.height / 2 + (y - this.cy) * this.z;
  }

  update(dt: number): void {
    if (!this.swipe && Math.abs(this.flickV) > 0.05) {
      this.target.cy = this.clamp(this.target.cy - this.flickV);
      this.cy = this.target.cy;
      this.flickV *= journeyCameraStyle.flick;
    }
    const k = 1 - Math.exp(-dt * journeyCameraStyle.glide);
    this.z += (this.target.z - this.z) * k;
    this.cy += (this.target.cy - this.cy) * k;
    // A swipe has come to rest: tell the scene, so the lights can come to where we look.
    if (this.travelling && !this.swipe && Math.abs(this.flickV) < journeyCameraStyle.settled) {
      this.travelling = false;
      this.flickV = 0;
      this.onSettle();
    }
  }

  // Moves the world under the camera and gives the lights the same view. `lightSize` is how
  // large the lights are drawn at full zoom (they shrink and grow with the view).
  apply(world: Container, drift: { x: number; y: number }, lightSize = 1): void {
    world.scale.set(this.z);
    world.x = (this.width / 2) * (1 - this.z) + drift.x;
    world.y = this.height / 2 - this.cy * this.z + drift.y;
    events.emit('spirit:camera', { x: world.x, y: world.y, scale: this.z, light: lightSize * this.z });
  }
}
