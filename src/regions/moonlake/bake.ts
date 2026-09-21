import { bakeRegion } from '../bakeHelper';
import { generateRippleLevel } from './generator';
import { handcraftedLevels, paramsForChapter } from './levelSpec';
import type { RippleLevel } from './model';

export function bakeMoonLake(): RippleLevel[] {
  return bakeRegion('moonlake', handcraftedLevels(), (seed, chapter, slot, ultra) => generateRippleLevel(seed, chapter, paramsForChapter(chapter, seed, slot, ultra)));
}
