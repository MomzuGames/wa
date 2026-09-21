// Loop puzzle: a grid of tiles with connectors that must all meet a partner.

export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;
export const DIRS = [N, E, S, W] as const;
export type Dir = (typeof DIRS)[number];

export const DELTA: Record<Dir, { dx: number; dy: number }> = {
  [N]: { dx: 0, dy: -1 },
  [E]: { dx: 1, dy: 0 },
  [S]: { dx: 0, dy: 1 },
  [W]: { dx: -1, dy: 0 },
};

export function opposite(dir: Dir): Dir {
  return (((dir << 2) | (dir >> 2)) & 15) as Dir;
}

// Rotates a connector mask clockwise by `quarterTurns`.
export function rotateMask(mask: number, quarterTurns: number): number {
  const k = ((quarterTurns % 4) + 4) % 4;
  return ((mask << k) | (mask >> (4 - k))) & 15;
}

export function bitCount(mask: number): number {
  let n = 0;
  for (const d of DIRS) if (mask & d) n++;
  return n;
}

export type TileKind = 'blank' | 'end' | 'straight' | 'corner' | 'tee' | 'cross';

export function tileKind(mask: number): TileKind {
  switch (bitCount(mask)) {
    case 0:
      return 'blank';
    case 1:
      return 'end';
    case 2:
      return mask === (N | S) || mask === (E | W) ? 'straight' : 'corner';
    case 3:
      return 'tee';
    default:
      return 'cross';
  }
}

// Number of visually distinct rotations for a mask (a straight has 2, a cross 1).
export function distinctRotations(mask: number): number {
  const seen = new Set<number>();
  for (let k = 0; k < 4; k++) seen.add(rotateMask(mask, k));
  return seen.size;
}

export interface Tile {
  mask: number;
  rotation: number;
  locked: boolean;
}

export interface Board {
  width: number;
  height: number;
  cells: (Tile | null)[];
}

export interface LoopLevel {
  seed: string;
  chapter: number;
  handcrafted?: boolean;
  width: number;
  height: number;
  cells: (Tile | null)[];
  solution: number[];
  difficulty: number;
}

export function index(board: Board, x: number, y: number): number {
  return y * board.width + x;
}

export function inBounds(board: Board, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < board.width && y < board.height;
}

export function tileAt(board: Board, x: number, y: number): Tile | null {
  return inBounds(board, x, y) ? board.cells[index(board, x, y)]! : null;
}

export function currentMask(tile: Tile): number {
  return rotateMask(tile.mask, tile.rotation);
}

export function cloneBoard(board: Board): Board {
  return { width: board.width, height: board.height, cells: board.cells.map((c) => (c ? { ...c } : null)) };
}

// True when every connector meets a connector on the neighbouring tile.
export function connectorMatched(board: Board, x: number, y: number, dir: Dir): boolean {
  const tile = tileAt(board, x, y);
  if (!tile) return false;
  const has = (currentMask(tile) & dir) !== 0;
  const { dx, dy } = DELTA[dir];
  const other = tileAt(board, x + dx, y + dy);
  const otherHas = other ? (currentMask(other) & opposite(dir)) !== 0 : false;
  return has === otherHas;
}

export function tileMatched(board: Board, x: number, y: number): boolean {
  return DIRS.every((d) => connectorMatched(board, x, y, d));
}

export function isSolved(board: Board): boolean {
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      if (board.cells[index(board, x, y)] && !tileMatched(board, x, y)) return false;
    }
  }
  return true;
}

// Connected groups of tiles joined by matched connectors, with each group's "all satisfied" flag.
export interface Component {
  cells: number[];
  complete: boolean;
}

export function components(board: Board): Component[] {
  const seen = new Set<number>();
  const out: Component[] = [];
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      const start = index(board, x, y);
      const tile = board.cells[start];
      if (!tile || seen.has(start) || currentMask(tile) === 0) continue;
      const cells: number[] = [];
      const stack = [start];
      seen.add(start);
      let complete = true;
      while (stack.length) {
        const i = stack.pop()!;
        const cx = i % board.width;
        const cy = Math.floor(i / board.width);
        cells.push(i);
        const t = board.cells[i]!;
        if (!tileMatched(board, cx, cy)) complete = false;
        for (const d of DIRS) {
          if (!(currentMask(t) & d)) continue;
          const { dx, dy } = DELTA[d];
          const nx = cx + dx;
          const ny = cy + dy;
          const nt = tileAt(board, nx, ny);
          if (!nt || !(currentMask(nt) & opposite(d))) continue;
          const ni = index(board, nx, ny);
          if (!seen.has(ni)) {
            seen.add(ni);
            stack.push(ni);
          }
        }
      }
      out.push({ cells, complete });
    }
  }
  return out;
}

export function boardFromLevel(level: LoopLevel): Board {
  return { width: level.width, height: level.height, cells: level.cells.map((c) => (c ? { ...c } : null)) };
}

export function isSolutionValid(level: LoopLevel): boolean {
  const board = boardFromLevel(level);
  board.cells.forEach((c, i) => {
    if (c) c.rotation = level.solution[i]!;
  });
  return isSolved(board);
}
