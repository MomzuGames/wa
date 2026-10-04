import { type Placement, type StoneLevel } from './model';
import { solveStone } from './solver';

// A hint either settles one stone into its place in a solution that keeps every stone the
// player has placed, or, when no solution can keep them all, lifts one misplaced stone
// back to the tray. The last stone is always the player's to place.
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
