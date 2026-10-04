import { createRng } from '../../core/rng';
import type { SkyParams } from './generator';
import { type Edge, type SkyLevel, type Star, isSolutionValid } from './model';
import { solveLevel, validStarts } from './solver';

export function paramsForChapter(chapter: number, seed: string, levelInChapter: number, ultra = false): SkyParams {
  const rng = createRng(seed);
  if (ultra) return { stars: [12, 16], edges: [18, 24], crossings: [4, 9], closed: false, oneWayFraction: 0.25, doubleEdges: 3, drift: true, orderedStars: 3 };
  const late = levelInChapter >= 1;
  switch (chapter) {
    case 0:
      return { stars: [6, 9], edges: [8, 11], crossings: [0, 1], closed: true, oneWayFraction: 0, doubleEdges: 0, drift: false };
    case 1:
      return { stars: [8, 11], edges: [10, 14], crossings: [1, late ? 5 : 3], closed: false, oneWayFraction: 0, doubleEdges: 0, drift: false };
    case 2:
      return { stars: [8, 12], edges: [10, 15], crossings: [1, 5], closed: rng.chance(0.4), oneWayFraction: 0.35, doubleEdges: 0, drift: false, orderedStars: 2 };
    default:
      return { stars: [9, 14], edges: [12, 18], crossings: [2, 7], closed: rng.chance(0.3), oneWayFraction: 0.15, doubleEdges: rng.int(1, 2), drift: late, orderedStars: 3 };
  }
}

// Handcrafted figures: star positions plus the stroke that draws them.
// Edges are derived from the stroke, so every figure is solvable by construction.
function figure(
  seed: string,
  chapter: number,
  stars: Star[],
  walk: number[],
  options: { oneWay?: Array<[number, number]>; drift?: boolean } = {},
): SkyLevel {
  const edges: Edge[] = [];
  for (let i = 1; i < walk.length; i++) {
    const a = walk[i - 1]!;
    const b = walk[i]!;
    const existing = edges.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
    if (existing) {
      existing.required = 2;
      continue;
    }
    const oneWay = options.oneWay?.some(([x, y]) => x === a && y === b) ?? false;
    edges.push({ a, b, required: 1, oneWay });
  }
  const level: SkyLevel = { seed, chapter, handcrafted: true, stars, edges, solution: walk, drift: options.drift ?? false, difficulty: 0 };
  if (!isSolutionValid(level)) throw new Error(`handcrafted sky level ${seed} has an invalid stroke`);
  if (validStarts(level).length === 0) throw new Error(`handcrafted sky level ${seed} has no valid start`);
  level.difficulty = solveLevel(level, walk[0]!).nodes + edges.length * 4;
  return level;
}

export function handcraftedLevels(): Record<number, () => SkyLevel> {
  return {
    0: () =>
      figure(
        'nightsky:hand:1',
        0,
        [
          { x: 0.5, y: 0.15 },
          { x: 0.85, y: 0.8 },
          { x: 0.15, y: 0.8 },
        ],
        [0, 1, 2, 0],
      ),
  };
}
