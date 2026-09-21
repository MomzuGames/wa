import { createRng } from '../../core/rng';
import { generateLoopLevel, type LoopParams } from './generator';
import { E, N, S, W, type Board, type LoopLevel, type Tile, distinctRotations, isSolved } from './model';
import { solve } from './solver';

// Chapter parameters: sizes and features per CLAUDE.md §8.
const chapterParams: Array<(rng: { int(a: number, b: number): number }) => LoopParams> = [
  (rng) => {
    const size = rng.int(3, 4);
    return { width: size, height: size, irregular: false, loopiness: 0.08, components: 1, lockedFraction: 0 };
  },
  (rng) => {
    const size = rng.int(5, 6);
    return { width: size, height: size, irregular: false, loopiness: 0.18, components: 1, lockedFraction: 0 };
  },
  (rng) => {
    const size = rng.int(5, 6);
    return { width: size, height: size, irregular: true, loopiness: 0.2, components: 1, lockedFraction: 0.12 };
  },
  (rng) => {
    const size = rng.int(7, 9);
    return { width: size, height: size, irregular: false, loopiness: 0.28, components: rng.int(2, 3), lockedFraction: 0.05 };
  },
];

export function paramsForChapter(chapter: number, seed: string, ultra = false): LoopParams {
  if (ultra) return { width: 10, height: 10, irregular: false, loopiness: 0.34, components: 3, lockedFraction: 0.03 };
  return chapterParams[chapter]!(createRng(seed));
}

// Handcrafted patterns use a doubled ASCII grid: 'o' tile, 'x' blank tile, '.' hole,
// '-' and '|' links between tiles.
function parsePattern(rows: string[]): { width: number; height: number; cells: (Tile | null)[] } {
  const height = (rows.length + 1) / 2;
  const width = (rows[0]!.length + 1) / 2;
  const cells: (Tile | null)[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = rows[y * 2]![x * 2];
      if (ch === '.') {
        cells.push(null);
        continue;
      }
      let mask = 0;
      if (rows[y * 2]![x * 2 + 1] === '-') mask |= E;
      if (x > 0 && rows[y * 2]![x * 2 - 1] === '-') mask |= W;
      if (rows[y * 2 + 1]?.[x * 2] === '|') mask |= S;
      if (y > 0 && rows[y * 2 - 1]![x * 2] === '|') mask |= N;
      cells.push({ mask, rotation: 0, locked: false });
    }
  }
  return { width, height, cells };
}

function scramble(cells: (Tile | null)[], seed: string): void {
  const rng = createRng(seed);
  for (const tile of cells) {
    if (!tile || tile.locked || distinctRotations(tile.mask) === 1) continue;
    tile.rotation = rng.int(1, 3);
  }
}

function handcraftedPattern(seed: string, chapter: number, rows: string[]): LoopLevel {
  const { width, height, cells } = parsePattern(rows);
  scramble(cells, seed);
  const board: Board = { width, height, cells };
  if (isSolved(board)) throw new Error(`handcrafted level ${seed} is already solved`);
  const result = solve(board);
  if (!result.solution) throw new Error(`handcrafted level ${seed} is unsolvable`);
  return { seed, chapter, handcrafted: true, width, height, cells, solution: cells.map(() => 0), difficulty: 0 };
}

// Silhouettes for chapter finals: '#' present, '.' hole.
function silhouette(rows: string[]): { width: number; height: number; present: boolean[] } {
  const height = rows.length;
  const width = rows[0]!.length;
  const present: boolean[] = [];
  for (const row of rows) for (const ch of row) present.push(ch === '#');
  return { width, height, present };
}

function handcraftedShape(seed: string, chapter: number, rows: string[], loopiness: number, components: number, lockedFraction: number): LoopLevel {
  const { width, height, present } = silhouette(rows);
  const level = generateLoopLevel(seed, chapter, { width, height, irregular: false, loopiness, components, lockedFraction, present });
  if (!level) throw new Error(`could not generate shaped level ${seed}`);
  level.handcrafted = true;
  return level;
}

export function handcraftedLevels(): Record<number, () => LoopLevel> {
  return {
    0: () =>
      handcraftedPattern('tidepools:hand:1', 0, [
        'o-o-o', //
        '|   |',
        'o x o',
        '|   |',
        'o-o-o',
      ]),
    1: () =>
      handcraftedPattern('tidepools:hand:2', 0, [
        'o-o-o', //
        '  |  ',
        'o-o-o',
        '|   |',
        'o x o',
      ]),
    2: () =>
      handcraftedPattern('tidepools:hand:3', 0, [
        'o-o-o-o', //
        '|     |',
        'o-o o-o',
        '| | | |',
        'o-o o-o',
        '|     |',
        'o-o-o-o',
      ]),
    5: () =>
      handcraftedShape(
        'tidepools:hand:6',
        1,
        [
          '..####', // bird
          '.#####',
          '######',
          '.####.',
          '..##..',
          '.####.',
        ],
        0.2,
        1,
        0,
      ),
    7: () =>
      handcraftedShape(
        'tidepools:hand:8',
        2,
        [
          '.#.#.#.', // lotus
          '.#####.',
          '#######',
          '#######',
          '.#####.',
          '..###..',
          '...#...',
        ],
        0.22,
        1,
        0.1,
      ),
  };
}
