import { createRng } from '../../core/rng';
import { DELTA, DIRS, type Board, currentMask, rotateMask } from './model';
import { forcedCells, solve } from './solver';

// A hint points at one tile that is wrong right now, and can show its place in a solution.
export interface LoopStep {
  cell: number;
  rotation: number;
  // forced: only one way fits (edges, blanks or fixed neighbours decide it);
  // neighbour: it joins tiles that are already right; any: neither, but it is still right.
  reason: 'forced' | 'neighbour' | 'any';
}

function wrongCells(board: Board, solution: number[]): number[] {
  const out: number[] = [];
  board.cells.forEach((tile, i) => {
    if (!tile || tile.locked || tile.mask === 0) return;
    if (currentMask(tile) !== rotateMask(tile.mask, solution[i]!)) out.push(i);
  });
  return out;
}

function touchesSettled(board: Board, i: number, wrong: Set<number>): boolean {
  const x = i % board.width;
  const y = Math.floor(i / board.width);
  return DIRS.some((d) => {
    const nx = x + DELTA[d].dx;
    const ny = y + DELTA[d].dy;
    if (nx < 0 || ny < 0 || nx >= board.width || ny >= board.height) return false;
    const j = ny * board.width + nx;
    const t = board.cells[j];
    return !!t && t.mask !== 0 && !wrong.has(j);
  });
}

// The next step from the player's current board, or null when at most one tile is left
// to turn: the last move is always the player's own.
export function stepClue(board: Board, seed: string): LoopStep | null {
  const { solution } = solve(board);
  if (!solution) return null;
  const wrong = wrongCells(board, solution);
  if (wrong.length <= 1) return null;
  const rng = createRng(seed);
  const wrongSet = new Set(wrong);
  const forced = new Set(forcedCells(board));
  const pick = (cells: number[], reason: LoopStep['reason']): LoopStep | null => {
    if (cells.length === 0) return null;
    const cell = rng.pick(cells);
    return { cell, rotation: solution[cell]!, reason };
  };
  return (
    pick(wrong.filter((i) => forced.has(i)), 'forced') ??
    pick(wrong.filter((i) => touchesSettled(board, i, wrongSet)), 'neighbour') ??
    pick(wrong, 'any')
  );
}

// For a later hint: up to `count` more wrong tiles to show, never taking the shown total
// past half of the tiles still wrong. Neighbours of settled tiles come first.
export function moreSteps(board: Board, shown: ReadonlySet<number>, count: number): LoopStep[] {
  const { solution } = solve(board);
  if (!solution) return [];
  const wrong = wrongCells(board, solution);
  const room = Math.floor(wrong.length / 2) - [...shown].filter((i) => wrong.includes(i)).length;
  const wrongSet = new Set(wrong);
  const open = wrong.filter((i) => !shown.has(i));
  const near = open.filter((i) => touchesSettled(board, i, wrongSet));
  const ordered = [...near, ...open.filter((i) => !near.includes(i))];
  return ordered.slice(0, Math.max(0, Math.min(count, room))).map((cell) => ({ cell, rotation: solution[cell]!, reason: 'any' as const }));
}
