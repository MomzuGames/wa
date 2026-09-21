import { bakeRegion } from '../bakeHelper';
import { generateStoneLevel } from './generator';
import { handcraftedLevels, paramsForChapter } from './levelSpec';
import type { StoneLevel } from './model';

export function bakeStoneGarden(): StoneLevel[] {
  return bakeRegion('stonegarden', handcraftedLevels(), (seed, chapter, _slot, ultra) => generateStoneLevel(seed, chapter, paramsForChapter(chapter, seed, ultra)));
}
