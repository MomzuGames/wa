import gsap from 'gsap';
import type { PuzzleModule, ShellContext } from '../types';
import { palette } from '../../design/palette';
import { durations, scaled } from '../../design/motion';
import { progression } from '../../core/progress';
import levelsJson from './levels.json';
import type { SkyLevel } from './model';
import { SkyLevelScene } from './view';

const levels = levelsJson as SkyLevel[];

// Region finale: a slow shower of stars drifting upward across the whole sky.
function playFinale(ctx: ShellContext): Promise<void> {
  const total = scaled(durations.completion) * 1.2;
  for (let i = 0; i < 160; i++) {
    ctx.particles.emit({
      x: ctx.rng.next() * ctx.width,
      y: ctx.height * (0.3 + ctx.rng.next() * 0.8),
      color: ctx.rng.chance(0.8) ? palette.lavender : palette.pearl,
      vx: (ctx.rng.next() - 0.5) * 8,
      vy: -20 - ctx.rng.next() * 45,
      life: 1.5 + ctx.rng.next() * 1.6,
      alphaFrom: 0.7,
      scaleFrom: 0.2 + ctx.rng.next() * 0.3,
      scaleTo: 0.05,
      drag: 0.997,
    });
  }
  return new Promise((resolve) => gsap.delayedCall(total, resolve));
}

export const nightskyModule: PuzzleModule = {
  id: 'nightsky',
  accent: 'lavender',
  levelCount: progression.levelsPerRegion,
  createLevel: (ctx, levelIndex) => new SkyLevelScene(ctx, levels[levelIndex]!, levelIndex === 0),
  playRegionFinale: playFinale,
};
