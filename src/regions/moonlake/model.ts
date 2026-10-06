// Lanterns on the lake: float paper lanterns on the dark water until every patch glows.
// A lantern's light runs straight across the water in four directions until it meets a
// rock or the shore. Two lanterns may never shine on each other. A rock with dots has
// exactly that many lanterns right beside it (above, below, left, right; a ring means none).

export interface LanternLevel {
  seed: string;
  chapter: number;
  handcrafted?: boolean;
  width: number;
  height: number;
  // One string per row: '.' water, '#' a rock, '0'–'4' a rock with that many lanterns
  // beside it, ' ' shore (outside the lake).
  grid: string[];
  solution: number[]; // the cells (y * width + x) that hold the lanterns
  difficulty: number;
}

export const STEPS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

export function cellChar(level: Pick<LanternLevel, 'grid' | 'width'>, i: number): string {
  return level.grid[Math.floor(i / level.width)]![i % level.width] ?? ' ';
}

export const isWater = (level: Pick<LanternLevel, 'grid' | 'width'>, i: number): boolean => cellChar(level, i) === '.';

// The number on a rock, or null for a plain rock, water or shore.
export function rockCount(level: Pick<LanternLevel, 'grid' | 'width'>, i: number): number | null {
  const c = cellChar(level, i);
  return c >= '0' && c <= '4' ? Number(c) : null;
}

export const isRock = (level: Pick<LanternLevel, 'grid' | 'width'>, i: number): boolean => {
  const c = cellChar(level, i);
  return c === '#' || (c >= '0' && c <= '4');
};

export function cellCount(level: Pick<LanternLevel, 'width' | 'height'>): number {
  return level.width * level.height;
}

// The cells right beside a cell (no diagonals), inside the grid.
export function besides(level: Pick<LanternLevel, 'width' | 'height'>, i: number): number[] {
  const x = i % level.width;
  const y = Math.floor(i / level.width);
  const out: number[] = [];
  for (const [dx, dy] of STEPS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < level.width && ny < level.height) out.push(ny * level.width + nx);
  }
  return out;
}

// For every water cell, the water cells a lantern there would light (itself included).
export function sightLines(level: Pick<LanternLevel, 'grid' | 'width' | 'height'>): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < cellCount(level); i++) {
    if (!isWater(level, i)) {
      out.push([]);
      continue;
    }
    const seen = [i];
    const x0 = i % level.width;
    const y0 = Math.floor(i / level.width);
    for (const [dx, dy] of STEPS) {
      for (let x = x0 + dx, y = y0 + dy; x >= 0 && y >= 0 && x < level.width && y < level.height; x += dx, y += dy) {
        const j = y * level.width + x;
        if (!isWater(level, j)) break;
        seen.push(j);
      }
    }
    out.push(seen);
  }
  return out;
}

// How many lanterns light each cell.
export function lightCounts(level: LanternLevel, lanterns: ReadonlySet<number>, sight = sightLines(level)): Uint8Array {
  const lit = new Uint8Array(cellCount(level));
  for (const l of lanterns) for (const j of sight[l] ?? []) lit[j]!++;
  return lit;
}

// Lanterns that shine on another lantern.
export function clashing(level: LanternLevel, lanterns: ReadonlySet<number>, sight = sightLines(level)): Set<number> {
  const out = new Set<number>();
  for (const l of lanterns) if ((sight[l] ?? []).some((j) => j !== l && lanterns.has(j))) out.add(l);
  return out;
}

export function lanternsBeside(level: LanternLevel, lanterns: ReadonlySet<number>, rock: number): number {
  return besides(level, rock).filter((j) => lanterns.has(j)).length;
}

// How a rock with dots stands right now: met, over (too many lanterns), or still open.
export function rockState(level: LanternLevel, lanterns: ReadonlySet<number>, rock: number): 'met' | 'over' | 'open' {
  const want = rockCount(level, rock);
  if (want === null) return 'open';
  const have = lanternsBeside(level, lanterns, rock);
  return have === want ? 'met' : have > want ? 'over' : 'open';
}

export function allLit(level: LanternLevel, lanterns: ReadonlySet<number>, sight = sightLines(level)): boolean {
  const lit = lightCounts(level, lanterns, sight);
  for (let i = 0; i < cellCount(level); i++) if (isWater(level, i) && lit[i] === 0) return false;
  return true;
}

export function isSolved(level: LanternLevel, lanterns: ReadonlySet<number>): boolean {
  if ([...lanterns].some((l) => !isWater(level, l))) return false;
  const sight = sightLines(level);
  if (!allLit(level, lanterns, sight) || clashing(level, lanterns, sight).size > 0) return false;
  for (let i = 0; i < cellCount(level); i++) {
    const want = rockCount(level, i);
    if (want !== null && lanternsBeside(level, lanterns, i) !== want) return false;
  }
  return true;
}
