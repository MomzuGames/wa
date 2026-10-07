import type { FederatedPointerEvent } from 'pixi.js';
import type { ShellContext } from '../types';
import { mixColor, palette } from '../../design/palette';
import { reducedMotion } from '../../design/motion';
import * as THREE from 'three';
import { Diorama } from '../../three/diorama';
import type { SkyLevel } from './model';
import { SkyLevelScene } from './view';

// Night Sky in 3D: the constellation lies on a dark glass plate floating in the night, and
// the stars and lines are the original soft 2D ones (the owner loved how the lines light up
// with a gentle glow as you draw), drawn exactly where each star sits on the plate. When the
// plate turns or tilts the drawing follows it. Press a star and draw without lifting; a drag
// that starts away from the stars turns the plate (not in the top-down view).

const sky3d = {
  size: 6, // the plate, in board units
  drift: 0.18, // board units a drifting star wanders
} as const;

export class NightSky3DScene extends SkyLevelScene {
  readonly ownsBackdrop = true;
  private d!: Diorama;
  private turning = false;
  private viewKey = '';
  // The stars' own box (level units), so the plate fits the constellation snugly.
  private box = { cx: 0.5, cy: 0.5, scale: 6 };

  constructor(ctx: ShellContext, level: SkyLevel, isTutorial: boolean, levelIndex: number, levelName: string) {
    super(ctx, level, isTutorial);
    const xs = level.stars.map((st) => st.x);
    const ys = level.stars.map((st) => st.y);
    const spanX = Math.max(0.1, Math.max(...xs) - Math.min(...xs));
    const spanY = Math.max(0.1, Math.max(...ys) - Math.min(...ys));
    const scale = sky3d.size / Math.max(spanX, spanY);
    this.box = { cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2, scale };
    const margin = 1.3 + (level.drift ? sky3d.drift * 2 : 0);
    this.d = new Diorama({
      region: 'nightsky',
      levelIndex,
      levelName,
      width: spanX * scale + margin,
      depth: spanY * scale + margin,
      high: 0.1,
      slab: { color: mixColor(palette.void, palette.sky, 0.22), top: mixColor(palette.void, palette.sky, 0.12), depth: 0.3 },
    });
    this.layout(ctx.width, ctx.height);
  }

  // A star's place on the plate (drifting stars wander a little).
  private star3(i: number): THREE.Vector3 {
    const s = this.level.stars[i]!;
    let dx = 0;
    let dy = 0;
    if (this.level.drift && !reducedMotion()) {
      const p = this.phases[i]!;
      dx = Math.sin(this.time * 0.5 + p) * sky3d.drift;
      dy = Math.cos(this.time * 0.4 + p) * sky3d.drift;
    }
    return new THREE.Vector3((s.x - this.box.cx) * this.box.scale + dx, 0.02, (s.y - this.box.cy) * this.box.scale + dy);
  }

  // Where a star shows on screen: the 2D drawing and the stroke both read this.
  protected override starPos(i: number): { x: number; y: number } {
    if (!this.d) return super.starPos(i);
    return this.d.toScreen(this.star3(i), this.container);
  }

  // ----- touch: a press on a star draws; anywhere else it turns the plate -----

  protected override onDown(e: FederatedPointerEvent): void {
    if (!this.d) return;
    super.onDown(e);
    this.turning = !this.dragging && !this.locked && !this.solved;
    if (this.turning) this.d.orbit.down(e.global.x, e.global.y);
  }

  protected override onMove(e: FederatedPointerEvent): void {
    if (!this.d) return;
    if (this.turning) this.d.orbit.move(e.global.x, e.global.y);
    else super.onMove(e);
  }

  protected override onUp(): void {
    if (!this.d) return;
    if (this.turning) {
      this.d.orbit.up();
      this.turning = false;
      return;
    }
    super.onUp();
  }

  override layout(width: number, height: number): void {
    super.layout(width, height);
    this.d?.place();
    if (this.d) this.redrawAll();
  }

  override update(dt: number): void {
    super.update(dt);
    if (!this.d) return;
    this.d.update(dt);
    // The drawing follows the plate whenever the view moves.
    const v = this.d.orbit;
    const key = `${v.yaw.toFixed(4)}|${v.pitch.toFixed(4)}|${this.d.size.width}|${this.d.size.height}`;
    if (key !== this.viewKey) {
      this.viewKey = key;
      this.redrawAll();
    }
  }

  override destroy(): void {
    super.destroy();
    this.d.dispose();
  }
}
