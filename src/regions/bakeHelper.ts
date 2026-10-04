import { chapterRange, progression } from '../core/progress';

const bakeStyle = {
  candidates: 7,
  quantileFrom: 0.15, // level 2 takes a gentler candidate...
  quantileTo: 1, // ...the last levels the hardest
} as const;

export interface Bakeable {
  difficulty: number;
}

// Shared baking recipe: handcrafted levels keep their slots; generated levels fill the
// rest of each chapter sorted easiest to hardest; the region's final level is generated
// with "ultra" parameters and always sits last.
export function bakeRegion<T extends Bakeable>(
  id: string,
  handcrafted: Record<number, () => T>,
  generate: (seed: string, chapter: number, slot: number, ultra: boolean) => T | null,
  afterSort?: (levels: T[], chapter: number) => void,
): T[] {
  const out: T[] = [];
  for (let chapter = 0; chapter < progression.chapters; chapter++) {
    const { start, end } = chapterRange(chapter);
    const generated: T[] = [];
    const slots: number[] = [];
    let ultraLevel: T | null = null;
    for (let levelIndex = start; levelIndex < end; levelIndex++) {
      if (handcrafted[levelIndex]) continue;
      const ultra = levelIndex === progression.levelsPerRegion - 1;
      // Several candidates per slot; the later the level, the harder the one chosen, so
      // difficulty climbs steadily through the land (a gentle ramp from level 2 on).
      const candidates: T[] = [];
      const wanted = ultra ? 1 : bakeStyle.candidates;
      for (let variant = 0; candidates.length < wanted && variant < 60; variant++) {
        const made = generate(`${id}:${chapter + 1}:${levelIndex - start + 1}:${variant}`, chapter, levelIndex - start, ultra);
        if (made) candidates.push(made);
      }
      if (candidates.length === 0) throw new Error(`failed to generate ${id} level ${levelIndex + 1}`);
      candidates.sort((a, b) => a.difficulty - b.difficulty);
      const q = bakeStyle.quantileFrom + (bakeStyle.quantileTo - bakeStyle.quantileFrom) * (levelIndex / (progression.levelsPerRegion - 1));
      const level = candidates[Math.min(candidates.length - 1, Math.round(q * (candidates.length - 1)))]!;
      if (ultra) ultraLevel = level;
      else {
        slots.push(levelIndex);
        generated.push(level);
      }
    }
    generated.sort((a, b) => a.difficulty - b.difficulty);
    afterSort?.(generated, chapter);
    const byIndex = new Map<number, T>();
    slots.forEach((slot, k) => byIndex.set(slot, generated[k]!));
    for (let levelIndex = start; levelIndex < end; levelIndex++) {
      if (handcrafted[levelIndex]) out.push(handcrafted[levelIndex]!());
      else if (levelIndex === progression.levelsPerRegion - 1 && ultraLevel) out.push(ultraLevel);
      else out.push(byIndex.get(levelIndex)!);
    }
  }
  return out;
}
