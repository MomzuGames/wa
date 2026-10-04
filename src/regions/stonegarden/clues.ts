import { type Placement, type StoneLevel } from './model';
import { solveStone } from './solver';

// A hint points at one stone: either the next to place (biggest first) with where it
// belongs in a solution that keeps every stone the player has placed, or, when no solution
// can keep them all, a misplaced stone to take back out. Hints never move a stone.
export type StoneStep =
  | { kind: 'settle'; piece: number; placement: Placement; biggest: boolean }
  | { kind: 'lift'; piece: number };

const size = (level: StoneLevel, i: number) => level.pieces[i]!.tris.length;

export function stepClue(level: StoneLevel, placed: Map<number, Placement>): StoneStep | null {
  const movable = level.pieces.map((_, i) => i).filter((i) => !level.pieces[i]!.fixed);
  const solution = solveStone(level, placed).placements;
  if (!solution) {
    // Lift the stone whose removal opens a way to finish, biggest first.
    const resting = movable.filter((i) => placed.has(i)).sort((a, b) => size(level, b) - size(level, a));
    for (const piece of resting) {
      const without = new Map(placed);
      without.delete(piece);
      if (solveStone(level, without).placements) return { kind: 'lift', piece };
    }
    return resting.length ? { kind: 'lift', piece: resting[0]! } : null;
  }
  const waiting = movable.filter((i) => !placed.has(i));
  if (waiting.length <= 1) return null;
  const largest = Math.max(...waiting.map((i) => size(level, i)));
  const piece = waiting.find((i) => size(level, i) === largest)!;
  const biggest = Math.max(...movable.map((i) => size(level, i))) === largest;
  return { kind: 'settle', piece, placement: solution.get(piece)!, biggest };
}

// For a later hint: up to `count` more waiting stones and where they belong, never taking
// the shown total past half of the stones still waiting.
export function moreSteps(level: StoneLevel, placed: Map<number, Placement>, shown: ReadonlySet<number>, count: number): Array<{ piece: number; placement: Placement }> {
  const solution = solveStone(level, placed).placements;
  if (!solution) return [];
  const waiting = level.pieces.map((_, i) => i).filter((i) => !level.pieces[i]!.fixed && !placed.has(i));
  const room = Math.floor(waiting.length / 2) - waiting.filter((i) => shown.has(i)).length;
  return waiting
    .filter((i) => !shown.has(i))
    .sort((a, b) => size(level, b) - size(level, a))
    .slice(0, Math.max(0, Math.min(count, room)))
    .map((piece) => ({ piece, placement: solution.get(piece)! }));
}
