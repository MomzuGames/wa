import gsap from 'gsap';
import type { PuzzleModule, ShellContext } from '../types';
import { palette } from '../../design/palette';
import { durations, scaled } from '../../design/motion';
import { progression } from '../../core/progress';
import levelsJson from './levels.json';
import type { PrismLevel } from './model';
import { PrismLevelScene } from './view';

const levels = levelsJson as PrismLevel[];

// Region finale: refraction sparkles in every beam colour rise across the cave.
function playFinale(ctx: ShellContext): Promise<void> {
  const total = scaled(durations.completion) * 1.2;
  const colors = [palette.rose, palette.sky, palette.lemon, palette.pearl];
  for (let i = 0; i < 180; i++) {
    ctx.particles.emit({
      x: ctx.rng.next() * ctx.width,
      y: ctx.height * (0.4 + ctx.rng.next() * 0.7),
      color: colors[i % colors.length]!,
      vx: (ctx.rng.next() - 0.5) * 10,
      vy: -25 - ctx.rng.next() * 50,
      life: 1.4 + ctx.rng.next() * 1.6,
      alphaFrom: 0.8,
      scaleFrom: 0.15 + ctx.rng.next() * 0.3,
      scaleTo: 0.05,
      drag: 0.996,
    });
  }
  return new Promise((resolve) => gsap.delayedCall(total, resolve));
}

export const crystalcavesModule: PuzzleModule = {
  id: 'crystalcaves',
  accent: 'sky',
  levelCount: progression.levelsPerRegion,
  createLevel: (ctx, levelIndex) => new PrismLevelScene(ctx, levels[levelIndex]!, levelIndex === 0),
  playRegionFinale: playFinale,
};
