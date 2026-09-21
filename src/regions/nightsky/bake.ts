import { bakeRegion } from '../bakeHelper';
import { progression } from '../../core/progress';
import { generateSkyLevel } from './generator';
import { handcraftedLevels, paramsForChapter } from './levelSpec';
import type { SkyLevel } from './model';

export function bakeNightSky(): SkyLevel[] {
  const levels = bakeRegion('nightsky', handcraftedLevels(), (seed, chapter, slot, ultra) => generateSkyLevel(seed, chapter, paramsForChapter(chapter, seed, slot, ultra)));
  // Star drift belongs to the last two levels only.
  levels.forEach((level, i) => (level.drift = i >= progression.levelsPerRegion - 2));
  return levels;
}
