import gsap from 'gsap';
import { Graphics } from 'pixi.js';
import type { PuzzleModule, ShellContext } from '../types';
import { palette } from '../../design/palette';
import { durations, easings, scaled } from '../../design/motion';
import { progression } from '../../core/progress';
import levelsJson from './levels.json';
import type { StoneLevel } from './model';
import { StoneLevelScene } from './view';

const levels = levelsJson as StoneLevel[];

// Region finale: raked sand lines sweep across the screen while warm motes rise.
function playFinale(ctx: ShellContext): Promise<void> {
  const total = scaled(durations.completion) * 1.2;
  const lines = new Graphics();
  lines.eventMode = 'none';
  ctx.particles.container.addChildAt(lines, 0);
  const state = { t: 0 };
  return new Promise((resolve) => {
    gsap.to(state, {
      t: 1,
      duration: total,
      ease: easings.ambient,
      onUpdate: () => {
        lines.clear();
        for (let k = 0; k < 9; k++) {
          const p = state.t - k * 0.07;
          if (p <= 0) continue;
          const y = ctx.height * (0.5 + (p - 0.5) * 1.6);
          lines.moveTo(0, y);
          lines.quadraticCurveTo(ctx.width * 0.5, y - 40 * Math.sin(p * Math.PI), ctx.width, y);
          lines.stroke({ color: palette.peach, width: 1, alpha: 0.35 * (1 - p) });
        }
      },
      onComplete: () => {
        lines.destroy();
        resolve();
      },
    });
    for (let i = 0; i < 100; i++) {
      ctx.particles.emit({
        x: ctx.rng.next() * ctx.width,
        y: ctx.height * (0.5 + ctx.rng.next() * 0.5),
        color: palette.peach,
        vx: (ctx.rng.next() - 0.5) * 6,
        vy: -12 - ctx.rng.next() * 30,
        life: 1.5 + ctx.rng.next() * 1.4,
        alphaFrom: 0.5,
        scaleFrom: 0.3,
        scaleTo: 0.05,
        drag: 0.996,
      });
    }
  });
}

export const stonegardenModule: PuzzleModule = {
  id: 'stonegarden',
  accent: 'peach',
  levelCount: progression.levelsPerRegion,
  createLevel: (ctx, levelIndex) => new StoneLevelScene(ctx, levels[levelIndex]!, levelIndex === 0),
  playRegionFinale: playFinale,
};
