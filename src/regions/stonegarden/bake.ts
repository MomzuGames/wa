import { progression } from '../../core/progress';
import { generateStoneLevel } from './generator';
import { handcraftedLevels, paramsForChapter } from './levelSpec';
import type { StoneLevel } from './model';

export function bakeStoneGarden(): StoneLevel[] {
  const handcrafted = handcraftedLevels();
  const out: StoneLevel[] = [];
  for (let chapter = 0; chapter < progression.chapters; chapter++) {
    const generated: StoneLevel[] = [];
    const slots: number[] = [];
    for (let i = 0; i < progression.levelsPerChapter; i++) {
      const levelIndex = chapter * progression.levelsPerChapter + i;
      if (handcrafted[levelIndex]) continue;
      slots.push(levelIndex);
      let level: StoneLevel | null = null;
      for (let variant = 0; !level && variant < 30; variant++) {
        const seed = `stonegarden:${chapter + 1}:${i + 1}:${variant}`;
        level = generateStoneLevel(seed, chapter, paramsForChapter(chapter, seed));
      }
      if (!level) throw new Error(`failed to generate stonegarden chapter ${chapter + 1} level ${i + 1}`);
      generated.push(level);
    }
    generated.sort((a, b) => a.difficulty - b.difficulty);
    const byIndex = new Map<number, StoneLevel>();
    slots.forEach((slot, k) => byIndex.set(slot, generated[k]!));
    for (let i = 0; i < progression.levelsPerChapter; i++) {
      const levelIndex = chapter * progression.levelsPerChapter + i;
      out.push(handcrafted[levelIndex] ? handcrafted[levelIndex]!() : byIndex.get(levelIndex)!);
    }
  }
  return out;
}
