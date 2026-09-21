import { progression } from '../../core/progress';
import { generateSkyLevel } from './generator';
import { handcraftedLevels, paramsForChapter } from './levelSpec';
import type { SkyLevel } from './model';

export function bakeNightSky(): SkyLevel[] {
  const handcrafted = handcraftedLevels();
  const out: SkyLevel[] = [];
  for (let chapter = 0; chapter < progression.chapters; chapter++) {
    const generated: SkyLevel[] = [];
    const slots: number[] = [];
    for (let i = 0; i < progression.levelsPerChapter; i++) {
      const levelIndex = chapter * progression.levelsPerChapter + i;
      if (handcrafted[levelIndex]) continue;
      slots.push(levelIndex);
      let level: SkyLevel | null = null;
      for (let variant = 0; !level && variant < 30; variant++) {
        const seed = `nightsky:${chapter + 1}:${i + 1}:${variant}`;
        level = generateSkyLevel(seed, chapter, paramsForChapter(chapter, seed, i));
      }
      if (!level) throw new Error(`failed to generate nightsky chapter ${chapter + 1} level ${i + 1}`);
      generated.push(level);
    }
    generated.sort((a, b) => a.difficulty - b.difficulty);
    // Star drift belongs to the hardest generated levels of the final chapter.
    generated.forEach((level, k) => (level.drift = chapter === progression.chapters - 1 && k >= generated.length - 2));
    const byIndex = new Map<number, SkyLevel>();
    slots.forEach((slot, k) => byIndex.set(slot, generated[k]!));
    for (let i = 0; i < progression.levelsPerChapter; i++) {
      const levelIndex = chapter * progression.levelsPerChapter + i;
      out.push(handcrafted[levelIndex] ? handcrafted[levelIndex]!() : byIndex.get(levelIndex)!);
    }
  }
  return out;
}
