import { createRng } from '../../core/rng';
import { type ShadowLevel, differingCells } from './model';
import { solveShadow } from './solver';

// Hints come from a solution that keeps as much of the player's terrace as it can.
export function nearestSolution(level: ShadowLevel, heights: number[]): number[] | null {
  return solveShadow(level, heights).heights ?? solveShadow(level).heights;
}

// One stack to build (or take down) to its height in that solution, tallest first since
// tall stacks are the ones the shadows pin down. Stacks earlier hints built stay as they
// are. Null when at most one stack is left wrong: the last one is the player's.
export function stepClue(level: ShadowLevel, heights: number[], seed: string, built: ReadonlyMap<number, number> = new Map()): { cell: number; height: number } | null {
  const pinned = { ...level, fixed: level.fixed.map((f, i) => built.get(i) ?? f) };
  const target = nearestSolution(pinned, heights);
  if (!target) return null;
  const wrong = differingCells(heights, target).filter((i) => pinned.fixed[i]! < 0);
  if (wrong.length <= 1) return null;
  const tallest = Math.max(...wrong.map((i) => target[i]!));
  const cell = createRng(seed).pick(wrong.filter((i) => target[i] === tallest));
  return { cell, height: target[cell]! };
}
