import { bakeRegion } from '../bakeHelper';
import { generateShadowLevel } from './generator';
import { handcraftedLevels, paramsForChapter } from './levelSpec';
import type { ShadowLevel } from './model';

export function bakeShadowTerrace(): ShadowLevel[] {
  return bakeRegion('shadowterrace', handcraftedLevels(), (seed, chapter, slot, ultra) => generateShadowLevel(seed, chapter, paramsForChapter(chapter, seed, slot, ultra)));
}
