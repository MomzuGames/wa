import { bakeRegion } from '../bakeHelper';
import { generatePrismLevel } from './generator';
import { handcraftedLevels, paramsForChapter } from './levelSpec';
import { type PrismLevel, cropToPieces } from './model';

export function bakeCrystalCaves(): PrismLevel[] {
  // Every board is trimmed to the cells its pieces use, so the puzzle sits centred.
  const hand = Object.fromEntries(Object.entries(handcraftedLevels()).map(([k, make]) => [k, () => cropToPieces(make())]));
  return bakeRegion('crystalcaves', hand, (seed, chapter, slot, ultra) => {
    const level = generatePrismLevel(seed, chapter, paramsForChapter(chapter, seed, slot, ultra));
    return level ? cropToPieces(level) : null;
  });
}
