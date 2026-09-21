import { createRng } from '../../core/rng';
import type { PondShape, RippleParams } from './generator';
import { type PadNode, type RippleLevel, applyPresses, isConnected, isLit, pressCount } from './model';
import { solveRipple } from './solver';

export function paramsForChapter(chapter: number, seed: string, levelInChapter: number, ultra = false): RippleParams {
  const rng = createRng(seed);
  if (ultra) return { shape: 'grid', size: [5, 5], states: 3, wideNodes: [2, 3], presses: [8, 12], minSolution: 8 };
  const late = levelInChapter >= 1;
  switch (chapter) {
    case 0:
      return { shape: 'grid', size: [3, late ? 4 : 3], states: 2, wideNodes: [0, 0], presses: [2, late ? 5 : 3], minSolution: late ? 3 : 2 };
    case 1:
      return { shape: rng.chance(0.5) ? 'ring' : 'cluster', size: [7, 10], states: 2, wideNodes: [0, 0], presses: [3, 6], minSolution: 3 };
    case 2: {
      const shape: PondShape = rng.chance(0.4) ? 'grid' : 'cluster';
      return { shape, size: shape === 'grid' ? [3, 4] : [8, 11], states: 3, wideNodes: [0, 0], presses: [3, 7], minSolution: 4 };
    }
    default: {
      const shape: PondShape = rng.chance(0.5) ? 'grid' : 'cluster';
      return { shape, size: shape === 'grid' ? [4, 5] : [11, 14], states: rng.chance(0.4) ? 3 : 2, wideNodes: [1, 3], presses: [5, 9], minSolution: 5 };
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

function circle(count: number, radius: number, cx = 0.5, cy = 0.5, phase = -Math.PI / 2): PadNode[] {
  return Array.from({ length: count }, (_, i) => {
    const a = phase + (i / count) * Math.PI * 2;
    return { x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius, wide: false };
  });
}

function loop(count: number, offset = 0): Array<[number, number]> {
  return Array.from({ length: count }, (_, i) => [offset + i, offset + ((i + 1) % count)] as [number, number]);
}

export function handcraftedLevels(): Record<number, () => RippleLevel> {
  return {
    0: () =>
      pond('moonlake:hand:1', 0, 2, [{ x: 0.2, y: 0.5, wide: false }, { x: 0.5, y: 0.5, wide: false }, { x: 0.8, y: 0.5, wide: false }], [[0, 1], [1, 2]], [0, 1, 0]),
    1: () =>
      pond(
        'moonlake:hand:2',
        0,
        2,
        [{ x: 0.3, y: 0.3, wide: false }, { x: 0.7, y: 0.3, wide: false }, { x: 0.3, y: 0.7, wide: false }, { x: 0.7, y: 0.7, wide: false }],
        [[0, 1], [0, 2], [1, 3], [2, 3]],
        [1, 0, 0, 1],
      ),
    // A flower: a centre pad ringed by six petals.
    2: () => {
      const nodes = [{ x: 0.5, y: 0.5, wide: false }, ...circle(6, 0.36)];
      const edges: Array<[number, number]> = [...loop(6, 1), ...Array.from({ length: 6 }, (_, i) => [0, i + 1] as [number, number])];
      return pond('moonlake:hand:3', 0, 2, nodes, edges, [0, 1, 0, 1, 0, 1, 0]);
    },
    // A fish: an oval body, a tail fork and an eye.
    5: () => {
      const body = circle(8, 0.3, 0.42, 0.5, 0);
      const nodes: PadNode[] = [...body, { x: 0.88, y: 0.3, wide: false }, { x: 0.88, y: 0.7, wide: false }, { x: 0.3, y: 0.44, wide: false }];
      const edges: Array<[number, number]> = [...loop(8), [0, 8], [0, 9], [8, 9], [10, 3], [10, 5]];
      return pond('moonlake:hand:6', 1, 2, nodes, edges, [1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]);
    },
    // A lotus in three states: an inner ring of five and an outer ring of ten.
    7: () => {
      const inner = circle(5, 0.18);
      const outer = circle(10, 0.4, 0.5, 0.5, -Math.PI / 2 + Math.PI / 10);
      const nodes = [...inner, ...outer];
      const edges: Array<[number, number]> = [...loop(5), ...loop(10, 5)];
      for (let i = 0; i < 5; i++) edges.push([i, 5 + i * 2], [i, 5 + ((i * 2 + 1) % 10)]);
      return pond('moonlake:hand:8', 2, 3, nodes, edges, [1, 2, 0, 1, 0, 2, 0, 1, 0, 0, 1, 2, 0, 0, 1]);
    },
  };
}
