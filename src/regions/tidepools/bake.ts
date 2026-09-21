import { bakeRegion } from '../bakeHelper';
import { generateLoopLevel } from './generator';
import { handcraftedLevels, paramsForChapter } from './levelSpec';
import type { LoopLevel } from './model';

export function bakeTidepools(): LoopLevel[] {
  return bakeRegion('tidepools', handcraftedLevels(), (seed, chapter, _slot, ultra) => generateLoopLevel(seed, chapter, paramsForChapter(chapter, seed, ultra)));
}
