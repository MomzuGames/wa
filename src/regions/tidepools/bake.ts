import { progression } from '../../core/progress';
import { generateLoopLevel } from './generator';
import { handcraftedLevels, paramsForChapter } from './levelSpec';
import type { LoopLevel } from './model';

// Produces all 24 levels: handcrafted ones stay in place, generated ones are
// sorted easiest-to-hardest within their chapter.
export function bakeTidepools(): LoopLevel[] {
  const handcrafted = handcraftedLevels();
  const out: LoopLevel[] = [];
  for (let chapter = 0; chapter < progression.chapters; chapter++) {
    const generated: LoopLevel[] = [];
    const slots: number[] = [];
    for (let i = 0; i < progression.levelsPerChapter; i++) {
      const levelIndex = chapter * progression.levelsPerChapter + i;
      if (handcrafted[levelIndex]) continue;
      slots.push(levelIndex);
      let level: LoopLevel | null = null;
      for (let variant = 0; !level && variant < 20; variant++) {
        const seed = `tidepools:${chapter + 1}:${i + 1}:${variant}`;
        level = generateLoopLevel(seed, chapter, paramsForChapter(chapter, seed));
      }
      if (!level) throw new Error(`failed to generate tidepools chapter ${chapter + 1} level ${i + 1}`);
      generated.push(level);
    }
    generated.sort((a, b) => a.difficulty - b.difficulty);
    const byIndex = new Map<number, LoopLevel>();
    slots.forEach((slot, k) => byIndex.set(slot, generated[k]!));
    for (let i = 0; i < progression.levelsPerChapter; i++) {
      const levelIndex = chapter * progression.levelsPerChapter + i;
      out.push(handcrafted[levelIndex] ? handcrafted[levelIndex]!() : byIndex.get(levelIndex)!);
    }
  }
  return out;
}
