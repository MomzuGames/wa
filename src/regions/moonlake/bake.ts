import { bakeRegion } from '../bakeHelper';
import { type LanternParams, generateLanternLevel } from './generator';
import type { LanternLevel } from './model';
import { countSolutions, solveByLogic } from './solver';

// How each chapter's lakes are made.
//   1  small square lakes, plenty of dotted rocks, every step direct
//   2  wider lakes, fewer dots; dark patches that only one place can light
//   3  rounder coves with a ragged shore; now and then a step to think through
//   4  coves where looking ahead ("what if a lantern went here?") is needed
//   the last lake: the widest cove, and the most looking ahead
export function paramsForChapter(chapter: number, ultra: boolean): LanternParams {
  if (ultra) return { width: 8, height: 8, shape: 'cove', rocks: [0.14, 0.2], keepExtra: 0, whatIf: [2, 6] };
  switch (chapter) {
    case 0:
      return { width: 5, height: 5, shape: 'open', rocks: [0.2, 0.28], keepExtra: 0.5, whatIf: [0, 0] };
    case 1:
      return { width: 6, height: 6, shape: 'open', rocks: [0.18, 0.25], keepExtra: 0.2, whatIf: [0, 0] };
    case 2:
      return { width: 7, height: 7, shape: 'cove', rocks: [0.16, 0.24], keepExtra: 0, whatIf: [0, 1] };
    default:
      return { width: 7, height: 7, shape: 'cove', rocks: [0.15, 0.22], keepExtra: 0, whatIf: [1, 4] };
  }
}

// The first lake: one rock with four dots in the middle of a tiny lake. A lantern goes on
// every side of it, and those four light the whole lake.
function tutorial(): LanternLevel {
  const level: LanternLevel = { seed: 'moonlake:tutorial', chapter: 0, handcrafted: true, width: 3, height: 3, grid: ['...', '.4.', '...'], solution: [1, 3, 5, 7], difficulty: 1 };
  if (countSolutions(level, 2) !== 1 || !solveByLogic(level).solved) throw new Error('the first lake must have one answer');
  return level;
}

export function bakeMoonLake(): LanternLevel[] {
  return bakeRegion('moonlake', { 0: tutorial }, (seed, chapter, _slot, ultra) => generateLanternLevel(seed, chapter, paramsForChapter(chapter, ultra)));
}
