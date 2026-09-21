import gsap from 'gsap';
import { Graphics } from 'pixi.js';
import type { PuzzleModule, ShellContext } from '../types';
import { palette } from '../../design/palette';
import { durations, easings, scaled } from '../../design/motion';
import { progression } from '../../core/progress';
import levelsJson from './levels.json';
import type { LoopLevel } from './model';
import { LoopLevelScene } from './view';

const levels = levelsJson as LoopLevel[];

// Region finale: concentric ripples spread across the whole screen while light motes rise.
function playFinale(ctx: ShellContext): Promise<void> {
  const total = scaled(durations.completion) * 1.2;
  const cx = ctx.width / 2;
  const cy = ctx.height / 2;
  const maxR = Math.hypot(ctx.width, ctx.height) / 2;
  const rings = new Graphics();
  const state = { t: 0 };
  ctx.particles.container.addChildAt(rings, 0);
  let finish: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  gsap.to(state, {
    t: 1,
    duration: total,
    ease: easings.ambient,
    onUpdate: () => {
      rings.clear();
      for (let k = 0; k < 4; k++) {
        const p = state.t - k * 0.12;
        if (p <= 0) continue;
        rings.circle(cx, cy, p * maxR).stroke({ color: palette.mint, width: 2, alpha: (1 - p) * 0.5 });
      }
    },
    onComplete: () => {
      rings.destroy();
      finish();
    },
  });
  for (let i = 0; i < 120; i++) {
    const a = ctx.rng.next() * Math.PI * 2;
    const r = ctx.rng.next() * maxR * 0.5;
    ctx.particles.emit({
      x: cx + Math.cos(a) * r,
      y: cy + Math.sin(a) * r,
      color: palette.mint,
      vx: (ctx.rng.next() - 0.5) * 10,
      vy: -15 - ctx.rng.next() * 30,
      life: 1.4 + ctx.rng.next() * 1.4,
      alphaFrom: 0.6,
      scaleFrom: 0.4,
      scaleTo: 0.05,
      drag: 0.995,
    });
  }
  return done;
}

export const tidepoolsModule: PuzzleModule = {
  id: 'tidepools',
  accent: 'mint',
  levelCount: progression.levelsPerRegion,
  createLevel: (ctx, levelIndex) => new LoopLevelScene(ctx, levels[levelIndex]!, levelIndex === 0),
  playRegionFinale: playFinale,
};
