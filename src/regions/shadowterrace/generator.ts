import { createRng, type Rng } from '../../core/rng';
import { type ShadowLevel, cellIndex, frontProfile, isSolved, sideProfile, stoneCount } from './model';
import { minimumStones, solveShadow } from './solver';

export interface ShadowParams {
  size: number;
  maxHeight: number;
  density: [number, number]; // fraction of cells that carry stones
  count: 'none' | 'exact' | 'minimum'; // the signature twist: how many stones the terrace holds
  fixedStones: [number, number]; // stacks already set and immovable
  minStones: number;
}

function randomHeights(rng: Rng, params: ShadowParams): number[] {
  const n = params.size;
  const heights = new Array<number>(n * n).fill(0);
  const density = params.density[0] + rng.next() * (params.density[1] - params.density[0]);
  const cells = rng.shuffle(heights.map((_, i) => i)).slice(0, Math.max(1, Math.round(n * n * density)));
  for (const i of cells) heights[i] = rng.int(1, params.maxHeight);
  return heights;
}

// A level is only interesting if filling every stack to its ceiling is not the answer
// (unless the chapter has no count rule yet, where that is the gentle way in).
function ceilingFill(level: ShadowLevel): number[] {
  const n = level.size;
  const out = new Array<number>(n * n).fill(0);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = cellIndex(n, x, y);
      out[i] = Math.min(level.front[x]!, level.side[y]!);
    }
  }
  return out;
}

function build(rng: Rng, params: ShadowParams): ShadowLevel | null {
  const n = params.size;
  const heights = randomHeights(rng, params);
  if (stoneCount(heights) < params.minStones) return null;
  const front = frontProfile(n, heights);
  const side = sideProfile(n, heights);
  // Every column and row should cast something, or the terrace looks half-finished.
  if (front.some((h) => h === 0) || side.some((h) => h === 0)) return null;
  const fixed = heights.map(() => -1);
  const fixedCount = rng.int(params.fixedStones[0], params.fixedStones[1]);
  const stoneCells = rng.shuffle(heights.map((h, i) => (h > 0 ? i : -1)).filter((i) => i >= 0));
  for (const i of stoneCells.slice(0, fixedCount)) fixed[i] = heights[i]!;
  const level: ShadowLevel = {
    seed: '',
    chapter: 0,
    size: n,
    maxHeight: params.maxHeight,
    front,
    side,
    count: null,
    fixed,
    solution: heights,
    difficulty: 0,
  };
  if (params.count === 'exact') level.count = stoneCount(heights);
  if (params.count === 'minimum') {
    const min = minimumStones(level);
    if (min === null) return null;
    level.count = min;
    const solved = solveShadow(level).heights;
    if (!solved) return null;
    level.solution = solved;
  }
  if (!isSolved(level, level.solution)) return null;
  const trivial = isSolved(level, ceilingFill(level));
  if (params.count !== 'none' && trivial) return null;
  const check = solveShadow(level);
  if (!check.heights) return null;
  level.difficulty = check.nodes + n * n * 3 + (level.count !== null ? 40 : 0) + fixedCount * 6;
  return level;
}

export function generateShadowLevel(seed: string, chapter: number, params: ShadowParams): ShadowLevel | null {
  const rng = createRng(seed);
  for (let attempt = 0; attempt < 120; attempt++) {
    const level = build(rng, params);
    if (!level) continue;
    level.seed = seed;
    level.chapter = chapter;
    return level;
  }
  return null;
}
