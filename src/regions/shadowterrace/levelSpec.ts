import { createRng } from '../../core/rng';
import type { ShadowParams } from './generator';
import { type ShadowLevel, frontProfile, isSolutionValid, sideProfile, stoneCount } from './model';
import { minimumStones, solveShadow } from './solver';

export function paramsForChapter(chapter: number, seed: string, levelInChapter: number, ultra = false): ShadowParams {
  const rng = createRng(seed);
  // Minimum-count terraces stay 4×4: the search for the fewest stones grows fast with size.
  if (ultra) return { size: 4, maxHeight: 4, density: [0.55, 0.75], count: 'minimum', fixedStones: [1, 2], minStones: 12 };
  const late = levelInChapter >= 1;
  switch (chapter) {
    case 0:
      return { size: 4, maxHeight: 2, density: [0.45, 0.7], count: 'none', fixedStones: [0, 0], minStones: 5 };
    case 1:
      return { size: late ? 4 : 3, maxHeight: 3, density: [0.45, 0.7], count: 'exact', fixedStones: [0, 0], minStones: 5 };
    case 2:
      return { size: 4, maxHeight: 3, density: [0.45, 0.7], count: 'exact', fixedStones: [1, 1], minStones: 7 };
    default:
      return { size: 4, maxHeight: rng.chance(0.5) ? 3 : 4, density: [0.45, 0.65], count: 'minimum', fixedStones: [1, 2], minStones: 8 };
  }
}

// Handcrafted terraces from a drawn heightmap (rows top to bottom).
function terrace(seed: string, chapter: number, rows: number[][], options: { count?: 'exact' | 'minimum'; fixed?: Array<[number, number]> } = {}): ShadowLevel {
  const n = rows.length;
  const heights = rows.flat();
  const fixed = heights.map(() => -1);
  for (const [x, y] of options.fixed ?? []) fixed[y * n + x] = heights[y * n + x]!;
  const level: ShadowLevel = {
    seed,
    chapter,
    handcrafted: true,
    size: n,
    maxHeight: Math.max(...heights),
    front: frontProfile(n, heights),
    side: sideProfile(n, heights),
    count: options.count === 'exact' ? stoneCount(heights) : null,
    fixed,
    solution: heights,
    difficulty: 0,
  };
  if (options.count === 'minimum') {
    const min = minimumStones(level);
    if (min === null) throw new Error(`handcrafted terrace ${seed} has no minimum`);
    level.count = min;
    level.solution = solveShadow(level).heights ?? heights;
  }
  if (!isSolutionValid(level)) throw new Error(`handcrafted terrace ${seed} is not valid`);
  level.difficulty = solveShadow(level).nodes;
  return level;
}

export function handcraftedLevels(): Record<number, () => ShadowLevel> {
  return {
    // One stone on a tiny terrace: the ghost hand shows a tap.
    0: () =>
      terrace('shadowterrace:hand:1', 0, [
        [1, 0],
        [0, 0],
      ]),
  };
}
