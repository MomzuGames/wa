import gsap from 'gsap';
import { Graphics } from 'pixi.js';
import type { PuzzleModule, ShellContext } from '../types';
import { palette } from '../../design/palette';
import { durations, easings, scaled } from '../../design/motion';
import { progression } from '../../core/progress';
import levelsJson from './levels.json';
import type { ShadowLevel } from './model';
import { ShadowLevelScene } from './view';

const levels = levelsJson as ShadowLevel[];

// Region finale: a wide moon rises and long shadows sweep across the terrace floor.
function playFinale(ctx: ShellContext): Promise<void> {
  const total = scaled(durations.completion) * 1.4;
  const moon = new Graphics().circle(0, 0, Math.min(ctx.width, ctx.height) * 0.14).fill({ color: palette.pearl, alpha: 0.3 });
  moon.eventMode = 'none';
  moon.position.set(ctx.width * 0.5, ctx.height * 0.95);
  moon.alpha = 0;
  ctx.particles.container.addChildAt(moon, 0);
  const bands = new Graphics();
  bands.eventMode = 'none';
  ctx.particles.container.addChildAt(bands, 0);
  const state = { t: 0 };
  return new Promise((resolve) => {
    gsap.to(moon, { y: ctx.height * 0.28, alpha: 1, duration: total, ease: easings.ambient });
    gsap.to(state, {
      t: 1,
      duration: total,
      ease: easings.ambient,
      onUpdate: () => {
        bands.clear();
        for (let k = 0; k < 7; k++) {
          const p = state.t - k * 0.08;
          if (p <= 0) continue;
          const y = ctx.height * (0.55 + k * 0.06);
          const reach = p * ctx.width;
          bands.moveTo(ctx.width / 2 - reach, y).lineTo(ctx.width / 2 + reach, y).stroke({ color: palette.sage, width: 2, alpha: 0.35 * (1 - p) });
        }
      },
      onComplete: () => {
        bands.destroy();
        gsap.to(moon, { alpha: 0, duration: 1, onComplete: () => moon.destroy() });
        resolve();
      },
    });
    for (let i = 0; i < 70; i++) {
      ctx.particles.emit({
        x: ctx.rng.next() * ctx.width,
        y: ctx.height * (0.4 + ctx.rng.next() * 0.6),
        color: ctx.rng.chance(0.7) ? palette.sage : palette.pearl,
        vx: 0,
        vy: -10 - ctx.rng.next() * 18,
        life: 2 + ctx.rng.next() * 1.5,
        alphaFrom: 0.5,
        scaleFrom: 0.3,
        scaleTo: 0.05,
      });
    }
  });
}

export const shadowterraceModule: PuzzleModule = {
  id: 'shadowterrace',
  accent: 'sage',
  levelCount: progression.levelsPerRegion,
  createLevel: (ctx, levelIndex) => new ShadowLevelScene(ctx, levels[levelIndex]!, levelIndex === 0),
  playRegionFinale: playFinale,
};
