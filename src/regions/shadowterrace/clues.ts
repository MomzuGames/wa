import { createRng } from '../../core/rng';
import { type ShadowLevel, differingCells } from './model';
import { solveShadow } from './solver';

// All clues come from a solution that keeps as much of the player's terrace as it can.
export function nearestSolution(level: ShadowLevel, heights: number[]): number[] | null {
  return solveShadow(level, heights).heights ?? solveShadow(level).heights;
}

// Tiers 1 and 2: stacks whose correct height is shown as a ghost.
export function stackClue(level: ShadowLevel, heights: number[], count: number, exclude: Set<number>, seed: string): Array<{ cell: number; height: number }> {
  const target = nearestSolution(level, heights);
  if (!target) return [];
  const rng = createRng(seed);
  const wrong = differingCells(heights, target).filter((i) => !exclude.has(i) && level.fixed[i]! < 0);
  return rng.shuffle(wrong).slice(0, count).map((cell) => ({ cell, height: target[cell]! }));
}

// Tier 4: at most half of the stacks that still differ.
export function halfClue(level: ShadowLevel, heights: number[], seed: string): Array<{ cell: number; height: number }> {
  const target = nearestSolution(level, heights);
  if (!target) return [];
  const rng = createRng(seed);
  const wrong = differingCells(heights, target).filter((i) => level.fixed[i]! < 0);
  return rng.shuffle(wrong).slice(0, Math.floor(level.size * level.size / 2)).map((cell) => ({ cell, height: target[cell]! }));
}
