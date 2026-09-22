// Shadow puzzle: stack stones on a square terrace until the two wall shadows (one
// per side) match, every moonlit floor tile carries a stone, and the count is right.
//
// The terrace is an n×n heightmap. The "front" shadow gives, for each column x, the
// tallest stack in that column; the "side" shadow gives the same for each row y.

export interface ShadowLevel {
  seed: string;
  chapter: number;
  handcrafted?: boolean;
  size: number; // n
  maxHeight: number;
  front: number[]; // per x: max over y of height
  side: number[]; // per y: max over x of height
  footprint: boolean[] | null; // per cell (y * n + x): must carry a stone; others must stay empty
  count: number | null; // exact number of stones, when the level asks for it
  fixed: number[]; // per cell: -1 free, otherwise a height that cannot be changed
  solution: number[]; // one valid heightmap
  difficulty: number;
}

export function cellIndex(n: number, x: number, y: number): number {
  return y * n + x;
}

export function frontProfile(n: number, heights: number[]): number[] {
  const out = new Array<number>(n).fill(0);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out[x] = Math.max(out[x]!, heights[cellIndex(n, x, y)]!);
  return out;
}

export function sideProfile(n: number, heights: number[]): number[] {
  const out = new Array<number>(n).fill(0);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out[y] = Math.max(out[y]!, heights[cellIndex(n, x, y)]!);
  return out;
}

export function stoneCount(heights: number[]): number {
  return heights.reduce((a, b) => a + b, 0);
}

// The tallest a stack may ever be: it can never rise above either shadow.
export function ceiling(level: ShadowLevel, x: number, y: number): number {
  if (level.footprint && !level.footprint[cellIndex(level.size, x, y)]) return 0;
  return Math.min(level.front[x]!, level.side[y]!);
}

export function isSolved(level: ShadowLevel, heights: number[]): boolean {
  const n = level.size;
  if (heights.length !== n * n) return false;
  for (let i = 0; i < n * n; i++) {
    const h = heights[i]!;
    if (h < 0 || h > level.maxHeight) return false;
    if (level.footprint && (h > 0) !== level.footprint[i]) return false;
    if (level.fixed[i]! >= 0 && level.fixed[i] !== h) return false;
  }
  const front = frontProfile(n, heights);
  const side = sideProfile(n, heights);
  for (let i = 0; i < n; i++) if (front[i] !== level.front[i] || side[i] !== level.side[i]) return false;
  if (level.count !== null && stoneCount(heights) !== level.count) return false;
  return true;
}

export function startHeights(level: ShadowLevel): number[] {
  return level.fixed.map((f) => (f >= 0 ? f : 0));
}

export function isSolutionValid(level: ShadowLevel): boolean {
  return isSolved(level, level.solution);
}

// Which stacks are still wrong compared with a target heightmap.
export function differingCells(a: number[], b: number[]): number[] {
  const out: number[] = [];
  a.forEach((h, i) => {
    if (h !== b[i]) out.push(i);
  });
  return out;
}
