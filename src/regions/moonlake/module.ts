import gsap from 'gsap';
import { Graphics } from 'pixi.js';
import type { PuzzleModule, ShellContext } from '../types';
import { palette } from '../../design/palette';
import { durations, easings, scaled } from '../../design/motion';
import { progression } from '../../core/progress';
import levelsJson from './levels.json';
import type { RippleLevel } from './model';
import { RippleLevelScene } from './view';

const levels = levelsJson as RippleLevel[];

// Region finale: a full moon rises over the whole lake while ripples cross the screen.
function playFinale(ctx: ShellContext): Promise<void> {
  const total = scaled(durations.completion) * 1.4;
  const moon = new Graphics().circle(0, 0, Math.min(ctx.width, ctx.height) * 0.12).fill({ color: palette.pearl, alpha: 0.35 });
  moon.eventMode = 'none';
  moon.position.set(ctx.width / 2, ctx.height * 0.9);
  moon.alpha = 0;
  ctx.particles.container.addChildAt(moon, 0);
  const rings = new Graphics();
  rings.eventMode = 'none';
  ctx.particles.container.addChildAt(rings, 0);
  const state = { t: 0 };
  return new Promise((resolve) => {
    gsap.to(moon, { y: ctx.height * 0.35, alpha: 1, duration: total, ease: easings.ambient });
    gsap.to(state, {
      t: 1,
      duration: total,
      ease: easings.ambient,
      onUpdate: () => {
        rings.clear();
        for (let k = 0; k < 6; k++) {
          const p = state.t - k * 0.1;
          if (p <= 0) continue;
          rings.ellipse(ctx.width / 2, ctx.height * 0.7, p * ctx.width * 0.7, p * ctx.height * 0.3).stroke({ color: palette.rose, width: 1.5, alpha: 0.4 * (1 - p) });
        }
      },
      onComplete: () => {
        rings.destroy();
        gsap.to(moon, { alpha: 0, duration: 1, onComplete: () => moon.destroy() });
        resolve();
      },
    });
    for (let i = 0; i < 80; i++) {
      ctx.particles.emit({
        x: ctx.rng.next() * ctx.width,
        y: ctx.height * (0.5 + ctx.rng.next() * 0.5),
        color: ctx.rng.chance(0.7) ? palette.rose : palette.pearl,
        vx: 0,
        vy: -10 - ctx.rng.next() * 20,
        life: 2 + ctx.rng.next() * 1.5,
        alphaFrom: 0.5,
        scaleFrom: 0.3,
        scaleTo: 0.05,
      });
    }
  });
}

export const moonlakeModule: PuzzleModule = {
  id: 'moonlake',
  accent: 'rose',
  levelCount: progression.levelsPerRegion,
  createLevel: (ctx, levelIndex) => new RippleLevelScene(ctx, levels[levelIndex]!, levelIndex === 0),
  playRegionFinale: playFinale,
};
