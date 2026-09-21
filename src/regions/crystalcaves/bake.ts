import { bakeRegion } from '../bakeHelper';
import { generatePrismLevel } from './generator';
import { handcraftedLevels, paramsForChapter } from './levelSpec';
import type { PrismLevel } from './model';

export function bakeCrystalCaves(): PrismLevel[] {
  return bakeRegion('crystalcaves', handcraftedLevels(), (seed, chapter, slot, ultra) => generatePrismLevel(seed, chapter, paramsForChapter(chapter, seed, slot, ultra)));
}
