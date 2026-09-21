import { createRng } from '../../core/rng';
import { type Board, currentMask, rotateMask } from './model';
import { forcedCells, solve } from './solver';

export interface LoopClueTier1 {
  kind: 'lock';
  cells: number[];
  rotations: number[];
}
export interface LoopClueTier3 {
  kind: 'forced';
  cells: number[];
}
export interface LoopClueTier4 {
  kind: 'ghost';
  cells: number[];
  masks: number[];
}
export type LoopClue = LoopClueTier1 | LoopClueTier3 | LoopClueTier4;

// Tiles whose current orientation already matches a solution close to the player's state.
function tilesAgreeing(board: Board, solution: number[]): number[] {
  const out: number[] = [];
  board.cells.forEach((tile, i) => {
    if (!tile || tile.locked || tile.mask === 0) return;
    if (currentMask(tile) === rotateMask(tile.mask, solution[i]!)) out.push(i);
  });
  return out;
}

function lockable(board: Board): number[] {
  const out: number[] = [];
  board.cells.forEach((tile, i) => {
    if (tile && !tile.locked && tile.mask !== 0) out.push(i);
  });
  return out;
}

// Tier 1 locks one tile, tier 2 locks two more. Prefers tiles the player already has right.
export function lockClue(board: Board, count: number, seed: string): LoopClueTier1 | null {
  const result = solve(board);
  if (!result.solution) return null;
  const rng = createRng(seed);
  const agreeing = rng.shuffle(tilesAgreeing(board, result.solution));
  const others = rng.shuffle(lockable(board).filter((i) => !agreeing.includes(i)));
  const cells = [...agreeing, ...others].slice(0, count);
  return { kind: 'lock', cells, rotations: cells.map((i) => result.solution![i]!) };
}

export function forcedClue(board: Board): LoopClueTier3 {
  return { kind: 'forced', cells: forcedCells(board) };
}

// Tier 4 ghosts the correct connectors on at most half of the unlocked tiles.
export function ghostClue(board: Board, seed: string): LoopClueTier4 | null {
  const result = solve(board);
  if (!result.solution) return null;
  const rng = createRng(seed);
  const candidates = rng.shuffle(lockable(board));
  const cells = candidates.slice(0, Math.floor(candidates.length / 2));
  return { kind: 'ghost', cells, masks: cells.map((i) => rotateMask(board.cells[i]!.mask, result.solution![i]!)) };
}

export function revealFraction(board: Board, clue: LoopClueTier4): number {
  const total = lockable(board).length;
  return total === 0 ? 0 : clue.cells.length / total;
}
