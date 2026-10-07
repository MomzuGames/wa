import { type Container, type FederatedPointerEvent, Graphics } from 'pixi.js';
import { palette } from '../design/palette';
import { events } from '../core/events';

// The camera over a scrolling journey (the world map and each land's trail on a phone).
// A swipe up or down travels along it and a flick eases out; the camera glides wherever it
// is sent (`focus`), and can pull back to show everything (`zoom`). It moves a "world"
// container, and hands the same camera to the little light ('spirit:camera'), so the
// lights live in the journey's own coordinates and grow and shrink with the view.

export const journeyCameraStyle = {
  glide: 4, // per second: how fast the camera travels to a land it is sent to
  follow: 12, // per second: how softly the view trails the finger and a flick
  friction: 2.4, // per second: how a flick slows (low: a long, soft glide to rest)
  stopSpeed: 18, // px per second below which a flick has come to rest
  edgeGive: 0.35, // past either end the journey gives only this much to the finger
  edgeReach: 0.16, // of the screen height: how far past an end it can be pulled
  springBack: 7, // per second: how it eases back from past an end
  slop: 10, // px a finger travels before a touch becomes a swipe
  moved: 1.5, // px of travel that counts as the view moving (to bring the lights along)
} as const;

export class JourneyCamera {
  z = 1;
  cy = 0; // the journey's own height shown in the middle of the screen
  target = { z: 1, cy: 0 };
  enabled = false; // only on a phone (portrait); wide screens show everything at once
  locked = false; // no swiping (while a story plays)
  dragMoved = false; // the last touch was a swipe, so it must not also choose something
  onSettle: () => void = () => {}; // the view came to rest after a swipe
  onMove: () => void = () => {}; // the view moved (every frame it does): the lights come along
  private swipe: { y: number; last: number; at: number; moved: boolean } | null = null;
  private velocity = 0; // journey px per second, while a flick carries on
  private flicking = false;
  private gliding = false; // sent somewhere (focus/zoom) rather than swiped
  private lastCy = 0;
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
      // A touch catches a gliding journey, as a hand stops a drawer.
      this.swipe = { y: e.global.y, last: e.global.y, at: performance.now(), moved: false };
      this.velocity = 0;
      this.flicking = false;
      this.gliding = false;
    });
    container.on('globalpointermove', (e: FederatedPointerEvent) => {
      const s = this.swipe;
      if (!s) return;
      if (!s.moved && Math.abs(e.global.y - s.y) > journeyCameraStyle.slop) {
        s.moved = this.dragMoved = true;
        s.last = e.global.y;
      }
      if (!s.moved) return;
      const now = performance.now();
      const dt = Math.max(1, now - s.at) / 1000;
      let d = -(e.global.y - s.last) / this.z;
      // Past either end the journey gives a little, then less and less.
      if (this.outside(this.target.cy) !== 0) d *= journeyCameraStyle.edgeGive;
      this.target.cy = this.limit(this.target.cy + d);
      // The speed of the finger, smoothed, carries on after it lifts.
      this.velocity = this.velocity * 0.6 + (d / dt) * 0.4;
      s.last = e.global.y;
      s.at = now;
    });
    const release = () => {
      const s = this.swipe;
      this.swipe = null;
      if (!s?.moved) return;
      // A finger that rested before lifting does not flick.
      if (performance.now() - s.at > 90) this.velocity = 0;
      this.flicking = true;
    };
    container.on('pointerup', release);
    container.on('pointerupoutside', release);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.hit.clear().rect(0, 0, width, height).fill({ color: palette.pearl, alpha: 0.001 });
    if (!this.enabled) {
      this.target = { z: 1, cy: height / 2 };
      this.cy = height / 2;
      this.z = 1;
      return;
    }
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

  // How far past an end (negative above the top, positive below the bottom).
  private outside(cy: number): number {
    return cy - this.clamp(cy);
  }

  // Never further past an end than a finger can pull it.
  private limit(cy: number): number {
    const reach = this.height * journeyCameraStyle.edgeReach;
    return Math.max(this.range.min - reach, Math.min(this.range.max + reach, cy));
  }

  // Glide (or jump) so a journey height sits in the middle of the screen.
  focus(y: number, instant = false): void {
    if (!this.enabled) return;
    this.target = { z: 1, cy: this.clamp(y) };
    this.flicking = false;
    this.velocity = 0;
    this.gliding = !instant;
    if (instant) ({ z: this.z, cy: this.cy } = this.target);
  }

  // Pull back (z below 1) to show more of the journey around a height.
  zoom(z: number, cy: number, instant = false): void {
    if (!this.enabled) return;
    this.target = { z, cy };
    this.flicking = false;
    this.velocity = 0;
    this.gliding = !instant;
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
    const st = journeyCameraStyle;
    if (this.flicking) {
      // The flick carries on and slows softly; past an end it is caught and eased back.
      this.target.cy = this.limit(this.target.cy + this.velocity * dt);
      const past = this.outside(this.target.cy);
      this.velocity *= Math.exp(-(past !== 0 ? st.friction * 6 : st.friction) * dt);
      if (Math.abs(this.velocity) < st.stopSpeed && past === 0) {
        this.flicking = false;
        this.velocity = 0;
        this.onSettle();
      }
    }
    if (!this.swipe && !this.gliding) {
      const past = this.outside(this.target.cy);
      if (past !== 0) this.target.cy -= past * (1 - Math.exp(-st.springBack * dt));
    }
    const k = 1 - Math.exp(-dt * (this.gliding ? st.glide : st.follow));
    this.z += (this.target.z - this.z) * k;
    this.cy += (this.target.cy - this.cy) * k;
    if (this.gliding && Math.abs(this.target.cy - this.cy) < 0.5 && Math.abs(this.target.z - this.z) < 0.001) this.gliding = false;
    if (Math.abs(this.cy - this.lastCy) > st.moved) {
      this.lastCy = this.cy;
      this.onMove();
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
