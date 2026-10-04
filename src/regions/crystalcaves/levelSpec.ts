import { createRng } from '../../core/rng';
import type { PrismParams } from './generator';
import { LEMON, type PrismLevel, type PrismPiece, ROSE, SKY, isSolved } from './model';
import { solvePrism } from './solver';

export function paramsForChapter(chapter: number, seed: string, levelInChapter: number, ultra = false): PrismParams {
  const rng = createRng(seed);
  // The finale is hard by its routing, not by clutter: fewer filters and blockers.
  if (ultra) return { size: [8, 8], emitters: [3, 3], mirrors: [7, 9], splitters: [2, 3], filters: [1, 1], blockers: [1, 2], targets: [3, 4], colors: rng.shuffle([ROSE, SKY, LEMON]), requireMix: true, dichroics: [1, 2] };
  const late = levelInChapter >= 1;
  switch (chapter) {
    case 0:
      // One light, one crystal, but a longer path of mirrors to set.
      return { size: [5, 6], emitters: [1, 1], mirrors: [late ? 4 : 3, late ? 5 : 4], splitters: [0, 0], filters: [0, 0], blockers: [0, 0], targets: [1, 1], colors: [SKY], requireMix: false };
    case 1:
      return { size: [6, 6], emitters: [2, 3], mirrors: [4, 6], splitters: [1, 2], filters: [0, 0], blockers: [0, 0], targets: [2, 3], colors: [SKY], requireMix: false };
    case 2:
      return { size: [6, 6], emitters: [2, 3], mirrors: [3, 5], splitters: [1, 2], filters: [0, 0], blockers: [0, 1], targets: [2, 3], colors: rng.shuffle([ROSE, SKY, LEMON]), requireMix: true };
    default:
      return { size: [7, 7], emitters: [3, 3], mirrors: [4, 6], splitters: [1, 2], filters: [1, 2], blockers: [1, 3], targets: [3, 4], colors: rng.shuffle([ROSE, SKY, LEMON]), requireMix: true, dichroics: [1, 2] };
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
  };
}
