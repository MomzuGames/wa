import { createRng } from '../../core/rng';
import type { SkyParams } from './generator';
import { type Edge, type SkyLevel, type Star, isSolutionValid } from './model';
import { solveLevel, validStarts } from './solver';

export function paramsForChapter(chapter: number, seed: string, levelInChapter: number): SkyParams {
  const rng = createRng(seed);
  const late = levelInChapter >= 3;
  switch (chapter) {
    case 0:
      return { stars: [4, 8], edges: [4, 8], crossings: [0, 1], closed: true, oneWayFraction: 0, doubleEdges: 0, drift: false };
    case 1:
      return { stars: [7, 11], edges: [8, 13], crossings: [1, late ? 5 : 3], closed: false, oneWayFraction: 0, doubleEdges: 0, drift: false };
    case 2:
      return { stars: [8, 12], edges: [10, 15], crossings: [1, 5], closed: rng.chance(0.4), oneWayFraction: 0.35, doubleEdges: 0, drift: false };
    default:
      return { stars: [9, 14], edges: [12, 18], crossings: [2, 7], closed: rng.chance(0.3), oneWayFraction: 0.15, doubleEdges: rng.int(1, 2), drift: late };
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
    1: () =>
      figure(
        'nightsky:hand:2',
        0,
        [
          { x: 0.15, y: 0.2 },
          { x: 0.85, y: 0.2 },
          { x: 0.15, y: 0.8 },
          { x: 0.85, y: 0.8 },
        ],
        [0, 3, 2, 1, 0],
      ),
    5: () =>
      figure(
        'nightsky:hand:6',
        0,
        [
          { x: 0.05, y: 0.5 }, // beak
          { x: 0.2, y: 0.4 }, // head
          { x: 0.45, y: 0.35 }, // back
          { x: 0.85, y: 0.3 }, // tail
          { x: 0.95, y: 0.45 }, // tail tip
          { x: 0.5, y: 0.6 }, // belly
          { x: 0.4, y: 0.1 }, // wing tip
        ],
        [0, 1, 6, 2, 3, 4, 5, 0],
      ),
    11: () =>
      figure(
        'nightsky:hand:12',
        1,
        [
          { x: 0.05, y: 0.5 }, // nose
          { x: 0.35, y: 0.25 }, // top
          { x: 0.75, y: 0.3 }, // tail top
          { x: 0.65, y: 0.5 }, // tail join
          { x: 0.75, y: 0.7 }, // tail bottom
          { x: 0.35, y: 0.75 }, // bottom
          { x: 0.45, y: 0.12 }, // fin
        ],
        [5, 0, 1, 6, 3, 2, 4, 3, 5, 1],
      ),
    17: () =>
      figure(
        'nightsky:hand:18',
        2,
        [
          { x: 0.1, y: 0.6 }, // nose
          { x: 0.3, y: 0.15 }, // left ear
          { x: 0.6, y: 0.15 }, // right ear
          { x: 0.75, y: 0.5 }, // cheek
          { x: 0.45, y: 0.85 }, // chin
          { x: 0.38, y: 0.45 }, // left eye
          { x: 0.55, y: 0.45 }, // right eye
        ],
        [0, 1, 5, 2, 3, 4, 0, 6, 5],
        { oneWay: [[0, 1], [3, 4]] },
      ),
    23: () =>
      figure(
        'nightsky:hand:24',
        3,
        [
          { x: 0.1, y: 0.45 }, // head
          { x: 0.35, y: 0.25 }, // top
          { x: 0.6, y: 0.3 }, // back
          { x: 0.8, y: 0.45 }, // tail join
          { x: 0.95, y: 0.3 }, // fluke top
          { x: 0.95, y: 0.65 }, // fluke bottom
          { x: 0.5, y: 0.7 }, // belly
          { x: 0.2, y: 0.65 }, // chin
          { x: 0.3, y: 0.05 }, // spout
        ],
        [0, 1, 2, 3, 4, 5, 3, 6, 7, 0, 1, 8],
        { drift: true },
      ),
  };
}
