import { ORIENTATIONS, type PrismLevel, isSolved } from './model';

export interface PrismSolveResult {
  orients: number[] | null;
  nodes: number;
}

// Rotatable pieces have at most four orientations, so a depth-first search over them
// is exact. Orders each piece's current orientation first so solutions stay close to
// the player's state.
export function solvePrism(level: PrismLevel, current: number[], maxNodes = 200_000): PrismSolveResult {
  const rotatable = level.pieces.map((p, i) => (p.rotatable ? i : -1)).filter((i) => i >= 0);
  const orients = current.slice();
  let nodes = 0;
  const search = (k: number): boolean => {
    nodes++;
    if (nodes > maxNodes) return false;
    if (k === rotatable.length) return isSolved(level, orients);
    const i = rotatable[k]!;
    const count = ORIENTATIONS[level.pieces[i]!.kind];
    const start = current[i]!;
    for (let step = 0; step < count; step++) {
      orients[i] = (start + step) % count;
      if (search(k + 1)) return true;
      if (nodes > maxNodes) return false;
    }
    orients[i] = start;
    return false;
  };
  return { orients: search(0) ? orients : null, nodes };
}

export function countSolutions(level: PrismLevel, limit = 2): number {
  const rotatable = level.pieces.map((p, i) => (p.rotatable ? i : -1)).filter((i) => i >= 0);
  const orients = level.pieces.map((p) => p.orient);
  let found = 0;
  const search = (k: number): void => {
    if (found >= limit) return;
    if (k === rotatable.length) {
      if (isSolved(level, orients)) found++;
      return;
    }
    const i = rotatable[k]!;
    for (let o = 0; o < ORIENTATIONS[level.pieces[i]!.kind]; o++) {
      orients[i] = o;
      search(k + 1);
    }
  };
  search(0);
  return found;
}
