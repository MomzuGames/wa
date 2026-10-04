import { createRng } from '../../core/rng';
import { type StoneParams } from './generator';
import { type Piece, type StoneLevel, type Tri, isConnected, normalise, triKey } from './model';
import { solveStone } from './solver';

export function paramsForChapter(chapter: number, seed: string, ultra = false): StoneParams {
  const rng = createRng(seed);
  if (ultra) return { cells: [24, 30], pieces: [10, 11], diagonalCuts: [3, 5], diagonalSplits: [3, 4], allowFlip: true, requireFlip: true, holes: [2, 3], fixedPieces: 1 };
  switch (chapter) {
    case 0:
      return { cells: [9, 12], pieces: [4, 4], diagonalCuts: [1, 2], diagonalSplits: [0, 1], allowFlip: false, requireFlip: false };
    case 1:
      return { cells: [11, 15], pieces: [5, 6], diagonalCuts: [1, 3], diagonalSplits: [1, 2], allowFlip: false, requireFlip: false };
    case 2:
      return { cells: [12, 16], pieces: [5, 7], diagonalCuts: [1, 3], diagonalSplits: [1, 2], allowFlip: true, requireFlip: true, holes: [1, 1] };
    default:
      return { cells: [16, 22], pieces: [7, rng.chance(0.5) ? 8 : 9], diagonalCuts: [2, 4], diagonalSplits: [1, 3], allowFlip: true, requireFlip: false, holes: [1, 2], fixedPieces: 1 };
  }
}

// Handcrafted tutorials: a grid of cell tokens. A single letter owns the whole cell;
// two letters "XY" split the cell diagonally, X taking the upper-left half (N+W) and
// Y the lower-right (S+E). '.' is empty.
function fromOwnerGrid(seed: string, chapter: number, rows: string[], tray: Record<string, { rot: number; flip: number }>, allowFlip: boolean): StoneLevel {
  const grid = rows.map((r) => r.trim().split(/\s+/));
  const height = grid.length;
  const width = grid[0]!.length;
  const groups = new Map<string, Tri[]>();
  const silhouette: number[] = [];
  const add = (letter: string, tri: Tri) => {
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter)!.push(tri);
    silhouette.push(triKey(width, tri[0], tri[1], tri[2]));
  };
  grid.forEach((row, y) =>
    row.forEach((token, x) => {
      if (token === '.') return;
      if (token.length === 1) {
        for (let t = 0; t < 4; t++) add(token, [x, y, t]);
      } else {
        add(token[0]!, [x, y, 0]);
        add(token[0]!, [x, y, 3]);
        add(token[1]!, [x, y, 1]);
        add(token[1]!, [x, y, 2]);
      }
    }),
  );
  const pieces: Piece[] = [...groups.entries()].map(([letter, tris]) => {
    if (!isConnected(tris)) throw new Error(`handcrafted stone level ${seed}: piece ${letter} is not connected`);
    const minX = Math.min(...tris.map((t) => t[0]));
    const minY = Math.min(...tris.map((t) => t[1]));
    return { tris: normalise(tris), solution: { x: minX, y: minY }, tray: tray[letter] ?? { rot: 1, flip: 0 } };
  });
  const level: StoneLevel = { seed, chapter, handcrafted: true, width, height, silhouette: silhouette.sort((a, b) => a - b), pieces, allowFlip, difficulty: 0 };
  const solved = solveStone(level);
  if (!solved.placements) throw new Error(`handcrafted stone level ${seed} is unsolvable`);
  level.difficulty = solved.nodes + pieces.length * 20;
  return level;
}

export function handcraftedLevels(): Record<number, () => StoneLevel> {
  return {
    0: () =>
      fromOwnerGrid(
        'stonegarden:hand:1',
        0,
        ['A A', 'A B'],
        { A: { rot: 1, flip: 0 }, B: { rot: 0, flip: 0 } },
        false,
      ),
  };
}
