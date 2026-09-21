import { progression } from '../../core/progress';
import { generatePrismLevel } from './generator';
import { handcraftedLevels, paramsForChapter } from './levelSpec';
import type { PrismLevel } from './model';

export function bakeCrystalCaves(): PrismLevel[] {
  const handcrafted = handcraftedLevels();
  const out: PrismLevel[] = [];
  for (let chapter = 0; chapter < progression.chapters; chapter++) {
    const generated: PrismLevel[] = [];
    const slots: number[] = [];
    for (let i = 0; i < progression.levelsPerChapter; i++) {
      const levelIndex = chapter * progression.levelsPerChapter + i;
      if (handcrafted[levelIndex]) continue;
      slots.push(levelIndex);
      let level: PrismLevel | null = null;
      for (let variant = 0; !level && variant < 30; variant++) {
        const seed = `crystalcaves:${chapter + 1}:${i + 1}:${variant}`;
        level = generatePrismLevel(seed, chapter, paramsForChapter(chapter, seed, i));
      }
      if (!level) throw new Error(`failed to generate crystalcaves chapter ${chapter + 1} level ${i + 1}`);
      generated.push(level);
    }
    generated.sort((a, b) => a.difficulty - b.difficulty);
    const byIndex = new Map<number, PrismLevel>();
    slots.forEach((slot, k) => byIndex.set(slot, generated[k]!));
    for (let i = 0; i < progression.levelsPerChapter; i++) {
      const levelIndex = chapter * progression.levelsPerChapter + i;
      out.push(handcrafted[levelIndex] ? handcrafted[levelIndex]!() : byIndex.get(levelIndex)!);
    }
  }
  return out;
}
