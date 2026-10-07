import { Graphics } from 'pixi.js';
import { palette } from '../design/palette';
import { Atmosphere } from '../fx/atmosphere';
import { createRng } from '../core/rng';
import type { LanternLevel } from '../regions/moonlake/model';
import { flatLake } from './flatLake';

// Style sample A: the game as it is (2D), with more depth: the land's own night scenery,
// plus light shafts falling from the moon, banks of mist drifting at different speeds and
// a soft shadow under the lake. Still flat underneath.
export class SampleA {
  private destroyFn: () => void = () => {};
  private alive = true;

  constructor(host: HTMLElement, level: LanternLevel, onSolved: () => void) {
    void flatLake(host, level, false, onSolved).then(({ app, under, destroy }) => {
      if (!this.alive) return destroy();
      const atmosphere = new Atmosphere('moonlake', createRng('sample:a'));
      const rays = new Graphics();
      const mist = new Graphics();
      const shadow = new Graphics();
      rays.blendMode = 'add';
      under.addChild(atmosphere.container, rays, mist, shadow);
      let t = 0;
      const draw = () => {
        const w = app.screen.width;
        const h = app.screen.height;
        // Shafts of moonlight, slowly swaying.
        rays.clear();
        const mx = w * 0.78;
        const my = h * 0.08;
        for (let k = 0; k < 5; k++) {
          const a = 1.75 + k * 0.16 + Math.sin(t * 0.15 + k) * 0.03;
          const spread = 0.05 + k * 0.01;
          const len = h * 1.1;
          rays.poly([mx, my, mx + Math.cos(a - spread) * len, my + Math.sin(a - spread) * len, mx + Math.cos(a + spread) * len, my + Math.sin(a + spread) * len]).fill({ color: palette.lavender, alpha: 0.025 + 0.01 * Math.sin(t * 0.4 + k) });
        }
        // Mist: wide soft banks drifting at three depths.
        mist.clear();
        for (let k = 0; k < 7; k++) {
          const depth = 0.4 + (k % 3) * 0.3;
          const x = ((k * 173 + t * 12 * depth) % (w + 400)) - 200;
          const y = h * (0.35 + (k % 4) * 0.15);
          for (const [r, al] of [[1, 0.025], [0.65, 0.03]] as const) mist.ellipse(x, y, 220 * r * depth + 60, 34 * r * depth + 10).fill({ color: palette.pearl, alpha: al * depth });
        }
        shadow.clear();
      };
      const tick = () => {
        t += app.ticker.deltaMS / 1000;
        atmosphere.update(app.ticker.deltaMS / 1000);
        draw();
      };
      atmosphere.resize(app.screen.width, app.screen.height);
      app.renderer.on('resize', (w: number, h: number) => atmosphere.resize(w, h));
      app.ticker.add(tick);
      this.destroyFn = () => {
        app.ticker.remove(tick);
        atmosphere.destroy();
        destroy();
      };
    });
  }

  destroy(): void {
    this.alive = false;
    this.destroyFn();
  }
}
