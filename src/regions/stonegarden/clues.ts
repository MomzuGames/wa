import { createRng } from '../../core/rng';
import { type Placement, type StoneLevel } from './model';
import { solveStone } from './solver';

export interface PieceGhost {
  piece: number;
  placement: Placement;
}

// A full solution that keeps the player's placed pieces where they are when possible.
export function solutionFor(level: StoneLevel, placed: Map<number, Placement>): Map<number, Placement> | null {
  const kept = solveStone(level, placed).placements;
  if (kept) return kept;
  return solveStone(level).placements;
}

function unplacedGhosts(level: StoneLevel, placed: Map<number, Placement>, seed: string): PieceGhost[] {
  const solution = solutionFor(level, placed);
  if (!solution) return [];
  const rng = createRng(seed);
  const candidates = level.pieces.map((_, i) => i).filter((i) => !placed.has(i));
  return rng.shuffle(candidates).map((piece) => ({ piece, placement: solution.get(piece)! }));
}

// Tier 1: where one piece belongs. Tier 2: the same, to be settled automatically.
export function pieceClue(level: StoneLevel, placed: Map<number, Placement>, seed: string): PieceGhost | null {
  return unplacedGhosts(level, placed, seed)[0] ?? null;
}

// Tier 4: ghosts for at most half of all pieces.
export function halfClue(level: StoneLevel, placed: Map<number, Placement>, seed: string): PieceGhost[] {
  return unplacedGhosts(level, placed, seed).slice(0, Math.floor(level.pieces.length / 2));
}

export function revealFraction(level: StoneLevel, ghosts: PieceGhost[]): number {
  return level.pieces.length === 0 ? 0 : ghosts.length / level.pieces.length;
}
