import { createRng } from '../../core/rng';
import type { PrismParams } from './generator';
import { LEMON, type PrismLevel, type PrismPiece, ROSE, SKY, isSolved } from './model';
import { solvePrism } from './solver';

export function paramsForChapter(chapter: number, seed: string, levelInChapter: number): PrismParams {
  const rng = createRng(seed);
  const late = levelInChapter >= 3;
  switch (chapter) {
    case 0:
      return { size: [4, 5], emitters: [1, 1], mirrors: [late ? 3 : 2, late ? 4 : 3], splitters: [0, 0], filters: [0, 0], blockers: [0, 0], targets: [1, late ? 2 : 1], colors: [SKY], requireMix: false };
    case 1:
      return { size: [5, 6], emitters: [2, 3], mirrors: [3, 5], splitters: [1, 2], filters: [0, 0], blockers: [0, 0], targets: [2, 3], colors: [SKY], requireMix: false };
    case 2:
      return { size: [6, 6], emitters: [2, 3], mirrors: [3, 5], splitters: [1, 2], filters: [0, 0], blockers: [0, 1], targets: [2, 3], colors: rng.shuffle([ROSE, SKY, LEMON]), requireMix: true };
    default:
      return { size: [7, 7], emitters: [3, 3], mirrors: [5, 7], splitters: [1, 3], filters: [1, 2], blockers: [1, 3], targets: [3, 4], colors: rng.shuffle([ROSE, SKY, LEMON]), requireMix: true };
  }
}

function handcrafted(seed: string, chapter: number, width: number, height: number, pieces: PrismPiece[], solution: number[]): PrismLevel {
  const level: PrismLevel = { seed, chapter, handcrafted: true, width, height, pieces, solution, difficulty: 0 };
  if (!isSolved(level, solution)) throw new Error(`handcrafted prism level ${seed} has an invalid solution`);
  if (isSolved(level, pieces.map((p) => p.orient))) throw new Error(`handcrafted prism level ${seed} starts solved`);
  const solved = solvePrism(level, pieces.map((p) => p.orient));
  if (!solved.orients) throw new Error(`handcrafted prism level ${seed} is unsolvable`);
  level.difficulty = solved.nodes + 8;
  return level;
}

export function handcraftedLevels(): Record<number, () => PrismLevel> {
  return {
    // One mirror turns a beam down onto a crystal.
    0: () =>
      handcrafted(
        'crystalcaves:hand:1',
        0,
        4,
        4,
        [
          { kind: 'emitter', x: 0, y: 1, orient: 1, rotatable: false, color: SKY },
          { kind: 'mirror', x: 2, y: 1, orient: 0, rotatable: true, color: 0 },
          { kind: 'target', x: 2, y: 3, orient: 0, rotatable: false, color: SKY },
        ],
        [1, 1, 0],
      ),
    // Two mirrors in a row.
    1: () =>
      handcrafted(
        'crystalcaves:hand:2',
        0,
        5,
        5,
        [
          { kind: 'emitter', x: 2, y: 0, orient: 2, rotatable: false, color: SKY },
          { kind: 'mirror', x: 2, y: 2, orient: 0, rotatable: true, color: 0 },
          { kind: 'mirror', x: 4, y: 2, orient: 0, rotatable: true, color: 0 },
          { kind: 'target', x: 4, y: 4, orient: 0, rotatable: false, color: SKY },
        ],
        [2, 1, 1, 0],
      ),
  };
}
