import { createRng } from '../../core/rng';
import { type PrismLevel, type Segment, trace } from './model';
import { solvePrism } from './solver';

export interface LockClue {
  pieces: number[];
  orients: number[];
}

function solution(level: PrismLevel, current: number[]): number[] | null {
  return solvePrism(level, current).orients ?? solvePrism(level, level.pieces.map((p) => p.orient)).orients;
}

function rotatableUnlocked(level: PrismLevel, locked: Set<number>): number[] {
  return level.pieces.map((p, i) => (p.rotatable && !locked.has(i) ? i : -1)).filter((i) => i >= 0);
}

// Tiers 1 and 2: lock one, then two more, correctly oriented pieces (prefer ones already right).
export function lockClue(level: PrismLevel, current: number[], locked: Set<number>, count: number, seed: string): LockClue | null {
  const solved = solution(level, current);
  if (!solved) return null;
  const rng = createRng(seed);
  const candidates = rotatableUnlocked(level, locked);
  const right = rng.shuffle(candidates.filter((i) => current[i] === solved[i]));
  const wrong = rng.shuffle(candidates.filter((i) => current[i] !== solved[i]));
  const pieces = [...right, ...wrong].slice(0, count);
  return { pieces, orients: pieces.map((i) => solved[i]!) };
}

// Tier 3: the solved beam routes, drawn as dotted paths for a few seconds.
export function routeClue(level: PrismLevel, current: number[]): Segment[] {
  const solved = solution(level, current);
  return solved ? trace(level, solved).segments : [];
}

// Tier 4: at most half of the rotatable pieces ghost their correct orientation.
export function ghostClue(level: PrismLevel, current: number[], seed: string): LockClue | null {
  const solved = solution(level, current);
  if (!solved) return null;
  const rng = createRng(seed);
  const all = level.pieces.map((p, i) => (p.rotatable ? i : -1)).filter((i) => i >= 0);
  const pieces = rng.shuffle(all).slice(0, Math.floor(all.length / 2));
  return { pieces, orients: pieces.map((i) => solved[i]!) };
}

export function revealFraction(level: PrismLevel, clue: LockClue): number {
  const total = level.pieces.filter((p) => p.rotatable).length;
  return total === 0 ? 0 : clue.pieces.length / total;
}
