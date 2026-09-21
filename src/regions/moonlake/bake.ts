import { progression } from '../../core/progress';
import { generateRippleLevel } from './generator';
import { handcraftedLevels, paramsForChapter } from './levelSpec';
import type { RippleLevel } from './model';

export function bakeMoonLake(): RippleLevel[] {
  const handcrafted = handcraftedLevels();
  const out: RippleLevel[] = [];
  for (let chapter = 0; chapter < progression.chapters; chapter++) {
    const generated: RippleLevel[] = [];
    const slots: number[] = [];
    for (let i = 0; i < progression.levelsPerChapter; i++) {
      const levelIndex = chapter * progression.levelsPerChapter + i;
      if (handcrafted[levelIndex]) continue;
      slots.push(levelIndex);
      let level: RippleLevel | null = null;
      for (let variant = 0; !level && variant < 30; variant++) {
        const seed = `moonlake:${chapter + 1}:${i + 1}:${variant}`;
        level = generateRippleLevel(seed, chapter, paramsForChapter(chapter, seed, i));
      }
      if (!level) throw new Error(`failed to generate moonlake chapter ${chapter + 1} level ${i + 1}`);
      generated.push(level);
    }
    generated.sort((a, b) => a.difficulty - b.difficulty);
    const byIndex = new Map<number, RippleLevel>();
    slots.forEach((slot, k) => byIndex.set(slot, generated[k]!));
    for (let i = 0; i < progression.levelsPerChapter; i++) {
      const levelIndex = chapter * progression.levelsPerChapter + i;
      out.push(handcrafted[levelIndex] ? handcrafted[levelIndex]!() : byIndex.get(levelIndex)!);
    }
  }
  return out;
}
