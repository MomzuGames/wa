import { createRng } from '../../core/rng';
import { type RippleLevel } from './model';
import { solveRipple } from './solver';

// Every hint comes from the fewest presses that light the lake from the current state.
export function remainingPresses(level: RippleLevel, state: number[]): number[] | null {
  return solveRipple(level, state).presses;
}

// One more pad to glow (with how many presses it needs), or null when at most one pad of
// the shortest way is left unlit by hints: that last press is the player's.
export function stepClue(level: RippleLevel, state: number[], hinted: ReadonlySet<number>, seed: string): { pad: number; presses: number } | null {
  const presses = remainingPresses(level, state);
  if (!presses) return null;
  const open = presses.map((c, i) => (c > 0 && !hinted.has(i) ? i : -1)).filter((i) => i >= 0);
  if (open.length <= 1) return null;
  const pad = createRng(seed).pick(open);
  return { pad, presses: presses[pad]! };
}

// After the lake changes, glowing pads that are no longer part of a shortest way go dark.
export function stillHelpful(level: RippleLevel, state: number[], hinted: ReadonlySet<number>): Set<number> {
  const presses = remainingPresses(level, state);
  return new Set([...hinted].filter((i) => presses && presses[i]! > 0));
}
