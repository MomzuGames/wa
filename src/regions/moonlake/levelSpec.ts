import { createRng } from '../../core/rng';
import type { PondShape, RippleParams } from './generator';
import { type PadNode, type RippleLevel, applyPresses, isConnected, isLit, pressCount } from './model';
import { solveRipple } from './solver';

export function paramsForChapter(chapter: number, seed: string, levelInChapter: number, ultra = false): RippleParams {
  const rng = createRng(seed);
  if (ultra) return { shape: 'grid', size: [5, 5], states: 3, wideNodes: [2, 3], frozenNodes: [2, 4], presses: [8, 12], minSolution: 8 };
  void levelInChapter;
  switch (chapter) {
    case 0:
      return { shape: 'grid', size: [4, 4], states: 2, wideNodes: [0, 0], presses: [4, 6], minSolution: 4 };
    case 1:
      return { shape: rng.chance(0.5) ? 'ring' : 'cluster', size: [8, 11], states: 2, wideNodes: [0, 0], presses: [4, 7], minSolution: 4 };
    case 2: {
      const shape: PondShape = rng.chance(0.4) ? 'grid' : 'cluster';
      return { shape, size: shape === 'grid' ? [3, 4] : [8, 11], states: 3, wideNodes: [0, 0], frozenNodes: [1, 2], presses: [3, 7], minSolution: 4 };
    }
    default: {
      const shape: PondShape = rng.chance(0.5) ? 'grid' : 'cluster';
      return { shape, size: shape === 'grid' ? [4, 5] : [11, 14], states: rng.chance(0.4) ? 3 : 2, wideNodes: [1, 3], frozenNodes: [1, 3], presses: [5, 9], minSolution: 5 };
    }
  }
}

// Handcrafted ponds: node positions and edges by hand; the scramble comes from the seed.
function pond(seed: string, chapter: number, states: 2 | 3, nodes: PadNode[], edges: Array<[number, number]>, presses: number[]): RippleLevel {
  const level: RippleLevel = { seed, chapter, handcrafted: true, states, nodes, edges, start: nodes.map(() => states - 1), solution: [], difficulty: 0 };
  if (!isConnected(level)) throw new Error(`handcrafted pond ${seed} is not connected`);
  level.start = applyPresses(level, level.start, presses);
  if (isLit(level, level.start)) throw new Error(`handcrafted pond ${seed} starts lit`);
  const solved = solveRipple(level, level.start);
  if (!solved.presses) throw new Error(`handcrafted pond ${seed} is unsolvable`);
  level.solution = solved.presses;
  level.difficulty = pressCount(solved.presses) * 12 + nodes.length * 2;
  return level;
}

export function handcraftedLevels(): Record<number, () => RippleLevel> {
  return {
    0: () =>
      pond('moonlake:hand:1', 0, 2, [{ x: 0.2, y: 0.5, wide: false }, { x: 0.5, y: 0.5, wide: false }, { x: 0.8, y: 0.5, wide: false }], [[0, 1], [1, 2]], [0, 1, 0]),
  };
}
