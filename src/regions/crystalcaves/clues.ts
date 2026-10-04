import { createRng } from '../../core/rng';
import { type PrismLevel, touchedPieces } from './model';
import { solvePrism } from './solver';

// A hint turns one piece that is wrong right now to its angle in a solution that keeps
// every piece earlier hints set. It prefers the first wrong piece a beam reaches today,
// so the light visibly travels further. The last piece is always the player's to turn.
export interface PrismStep {
  piece: number;
  orient: number;
  onBeam: boolean;
}

export function stepClue(level: PrismLevel, current: number[], locked: ReadonlySet<number>, seed: string): PrismStep | null {
  const solved = solvePrism(level, current, undefined, locked).orients;
  if (!solved) return null;
  const wrong = level.pieces.map((p, i) => (p.rotatable && !locked.has(i) && current[i] !== solved[i] ? i : -1)).filter((i) => i >= 0);
  if (wrong.length <= 1) return null;
  // touchedPieces lists pieces in the order the beams reach them.
  const lit = [...touchedPieces(level, current)].find((i) => wrong.includes(i));
  const piece = lit ?? createRng(seed).pick(wrong);
  return { piece, orient: solved[piece]!, onBeam: lit !== undefined };
}
