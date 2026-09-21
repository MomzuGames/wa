import { createRng } from '../../core/rng';
import { type RippleLevel, pressCount } from './model';
import { solveRipple } from './solver';

// All Moon Lake clues come from the minimum solution for the current state.
export function remainingPresses(level: RippleLevel, state: number[]): number[] | null {
  return solveRipple(level, state).presses;
}

// Tiers 1 and 2: one, then two more, pads from the minimum solution.
export function nodeClue(level: RippleLevel, state: number[], count: number, exclude: Set<number>, seed: string): number[] {
  const presses = remainingPresses(level, state);
  if (!presses) return [];
  const rng = createRng(seed);
  const candidates = presses.map((c, i) => (c > 0 && !exclude.has(i) ? i : -1)).filter((i) => i >= 0);
  return rng.shuffle(candidates).slice(0, count);
}

// Tier 3: how many presses remain, shown as dots.
export function countClue(level: RippleLevel, state: number[]): number {
  const presses = remainingPresses(level, state);
  return presses ? pressCount(presses) : 0;
}

// Tier 4: at most half of the remaining presses.
export function halfClue(level: RippleLevel, state: number[], seed: string): number[] {
  const presses = remainingPresses(level, state);
  if (!presses) return [];
  const rng = createRng(seed);
  const sites = presses.map((c, i) => (c > 0 ? i : -1)).filter((i) => i >= 0);
  return rng.shuffle(sites).slice(0, Math.floor(sites.length / 2));
}
