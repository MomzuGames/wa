import { createRng } from '../../core/rng';
import { generateStoneLevel, type StoneParams } from './generator';
import { type Piece, type StoneLevel, type Tri, isConnected, normalise, triKey } from './model';
import { solveStone } from './solver';

export function paramsForChapter(chapter: number, seed: string): StoneParams {
  const rng = createRng(seed);
  switch (chapter) {
    case 0:
      return { cells: [6, 9], pieces: [3, 4], diagonalCuts: [0, 2], diagonalSplits: [0, 0], allowFlip: false, requireFlip: false };
    case 1:
      return { cells: [9, 14], pieces: [5, 6], diagonalCuts: [1, 3], diagonalSplits: [0, 1], allowFlip: false, requireFlip: false };
    case 2:
      return { cells: [10, 15], pieces: [5, 7], diagonalCuts: [1, 3], diagonalSplits: [1, 2], allowFlip: true, requireFlip: true };
    default:
      return { cells: [14, 22], pieces: [7, rng.chance(0.5) ? 8 : 9], diagonalCuts: [2, 4], diagonalSplits: [1, 3], allowFlip: true, requireFlip: false };
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

// Chapter-final figures as silhouettes: '#' full cell; 'a' 'b' 'c' 'd' keep only the
// NW, NE, SE or SW half of the cell; '.' empty. Pieces are generated from the seed.
function fromSilhouette(seed: string, chapter: number, rows: string[], params: Omit<StoneParams, 'silhouette' | 'cells'>): StoneLevel {
  const height = rows.length;
  const width = rows[0]!.length;
  const keys: number[] = [];
  const halves: Record<string, number[]> = { a: [0, 3], b: [0, 1], c: [1, 2], d: [2, 3] };
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '#') for (let t = 0; t < 4; t++) keys.push(triKey(width, x, y, t));
      else if (halves[ch]) for (const t of halves[ch]!) keys.push(triKey(width, x, y, t));
    }),
  );
  const level = generateStoneLevel(seed, chapter, { ...params, cells: [0, 0], silhouette: { width, height, keys } });
  if (!level) throw new Error(`could not partition handcrafted silhouette ${seed}`);
  level.handcrafted = true;
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
    1: () =>
      fromOwnerGrid(
        'stonegarden:hand:2',
        0,
        ['A A B', 'A AC C'],
        { A: { rot: 2, flip: 0 }, B: { rot: 0, flip: 0 }, C: { rot: 3, flip: 0 } },
        false,
      ),
    5: () =>
      fromSilhouette(
        'stonegarden:hand:6',
        0,
        [
          '.b#a.', // stone
          '#####',
          '#####',
          '.c#d.',
        ],
        { pieces: [4, 4], diagonalCuts: [0, 0], diagonalSplits: [0, 0], allowFlip: false, requireFlip: false },
      ),
    11: () =>
      fromSilhouette(
        'stonegarden:hand:12',
        1,
        [
          'd...c', // fox
          '##.##',
          '#####',
          '#####',
          'c###d',
          '.c#d.',
        ],
        { pieces: [6, 6], diagonalCuts: [0, 0], diagonalSplits: [0, 1], allowFlip: false, requireFlip: false },
      ),
    17: () =>
      fromSilhouette(
        'stonegarden:hand:18',
        2,
        [
          '..b#a..', // lotus
          '.b###a.',
          'b#####a',
          '#######',
          'c#####d',
          '.c###d.',
        ],
        { pieces: [7, 7], diagonalCuts: [0, 0], diagonalSplits: [1, 2], allowFlip: true, requireFlip: true },
      ),
    23: () =>
      fromSilhouette(
        'stonegarden:hand:24',
        3,
        [
          '.....b#', // bird
          '..b###a',
          'b######',
          '#######',
          'c#####d',
          '.c###d.',
          '...#...',
          '..c#d..',
        ],
        { pieces: [9, 9], diagonalCuts: [0, 0], diagonalSplits: [2, 3], allowFlip: true, requireFlip: false },
      ),
  };
}
