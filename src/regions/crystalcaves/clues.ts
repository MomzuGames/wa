import { createRng } from '../../core/rng';
import { type PrismLevel, touchedPieces } from './model';
import { solvePrism } from './solver';

// A hint points at one piece that is wrong right now and knows its angle in a solution that
// agrees with every angle earlier hints showed. It prefers the first wrong piece a beam
// reaches today, so following the hint visibly sends the light further. Hints never turn
// a piece, and the last piece is always the player's.
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

// The player's angles with every hinted angle in place: what later hints build on.
export function withShown(current: number[], shown: ReadonlyMap<number, number>): number[] {
  return current.map((o, i) => shown.get(i) ?? o);
}

// For a later hint: up to `count` more wrong pieces and their angles, never taking the shown
// total past half of the pieces still wrong.
export function moreSteps(level: PrismLevel, current: number[], shown: ReadonlyMap<number, number>, count: number): PrismStep[] {
  const assumed = withShown(current, shown);
  const solved = solvePrism(level, assumed, undefined, new Set(shown.keys())).orients;
  if (!solved) return [];
  const wrong = level.pieces.map((p, i) => (p.rotatable && current[i] !== solved[i] ? i : -1)).filter((i) => i >= 0);
  const room = Math.floor(wrong.length / 2) - wrong.filter((i) => shown.has(i)).length;
  return wrong
    .filter((i) => !shown.has(i))
    .slice(0, Math.max(0, Math.min(count, room)))
    .map((piece) => ({ piece, orient: solved[piece]!, onBeam: false }));
}
