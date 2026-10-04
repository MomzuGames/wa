import { chapterRange, progression } from '../core/progress';

const bakeStyle = {
  candidates: 7, // per early slot
  quantileFrom: 0.15, // level 2 takes a gentler candidate...
  quantileTo: 1, // ...later early levels harder ones
  rampCandidates: 12, // per slot after the free levels
  maxVariants: 90,
} as const;

export interface Bakeable {
  difficulty: number;
}

// Levels kept exactly as they are when a region is baked again (the free levels the owner
// has settled), by region id. The level script fills this from the current levels.json.
const frozen = new Map<string, Bakeable[]>();

export function freezeLevels(id: string, levels: Bakeable[]): void {
  frozen.set(id, levels);
}

// Shared baking recipe.
// - Level 1 (and any other handcrafted slot) is fixed; the last level is generated with
//   "ultra" parameters and is the hardest.
// - Free levels: several candidates per slot, a harder one the later the slot (unless
//   frozen, when the settled levels are kept as they are).
// - Every level after the free ones aims at a target that climbs steadily, in proportion,
//   from the last free level to the final one; of a dozen candidates the one nearest the
//   target is kept, never easier than the level before it.
export function bakeRegion<T extends Bakeable>(
  id: string,
  handcrafted: Record<number, () => T>,
  generate: (seed: string, chapter: number, slot: number, ultra: boolean) => T | null,
): T[] {
  const kept = (frozen.get(id) ?? []) as T[];
  const last = progression.levelsPerRegion - 1;
  const chapterOfIndex = (levelIndex: number): { chapter: number; slot: number } => {
    for (let c = progression.chapters - 1; c >= 0; c--) {
      const { start } = chapterRange(c);
      if (levelIndex >= start) return { chapter: c, slot: levelIndex - start };
    }
    return { chapter: 0, slot: levelIndex };
  };
  const candidatesFor = (levelIndex: number, wanted: number, ultra: boolean): T[] => {
    const { chapter, slot } = chapterOfIndex(levelIndex);
    const out: T[] = [];
    for (let variant = 0; out.length < wanted && variant < bakeStyle.maxVariants; variant++) {
      const made = generate(`${id}:${chapter + 1}:${slot + 1}:${variant}`, chapter, slot, ultra);
      if (made) out.push(made);
    }
    if (out.length === 0) throw new Error(`failed to generate ${id} level ${levelIndex + 1}`);
    return out.sort((a, b) => a.difficulty - b.difficulty);
  };

  const out: T[] = [];
  // The free levels.
  for (let levelIndex = 0; levelIndex < progression.freeLevels; levelIndex++) {
    if (kept[levelIndex]) out.push(kept[levelIndex]!);
    else if (handcrafted[levelIndex]) out.push(handcrafted[levelIndex]!());
    else {
      const pool = candidatesFor(levelIndex, bakeStyle.candidates, false);
      const q = bakeStyle.quantileFrom + (bakeStyle.quantileTo - bakeStyle.quantileFrom) * (levelIndex / last);
      out.push(pool[Math.min(pool.length - 1, Math.round(q * (pool.length - 1)))]!);
    }
  }
  // The final level first: the ramp climbs toward it.
  const finale = handcrafted[last] ? handcrafted[last]!() : candidatesFor(last, 1, true)[0]!;
  const from = Math.max(1, out[out.length - 1]!.difficulty);
  const to = Math.max(from * 1.5, finale.difficulty);
  // The levels in between, each aiming a step higher.
  for (let levelIndex = progression.freeLevels; levelIndex < last; levelIndex++) {
    if (handcrafted[levelIndex]) {
      out.push(handcrafted[levelIndex]!());
      continue;
    }
    const step = (levelIndex - (progression.freeLevels - 1)) / (last - (progression.freeLevels - 1));
    const target = from * Math.pow(to / from, step);
    const previous = out[out.length - 1]!.difficulty;
    const pool = candidatesFor(levelIndex, bakeStyle.rampCandidates, false);
    const fair = pool.filter((l) => l.difficulty >= previous);
    const choices = fair.length ? fair : [pool[pool.length - 1]!];
    const near = (l: T) => Math.abs(Math.log(Math.max(1, l.difficulty)) - Math.log(target));
    out.push(choices.reduce((best, l) => (near(l) < near(best) ? l : best)));
  }
  out.push(finale);
  // Within a chapter (same rules, same kinds of pieces), easiest first.
  for (let c = 0; c < progression.chapters; c++) {
    const { start, end } = chapterRange(c);
    const slots: number[] = [];
    for (let i = Math.max(start, progression.freeLevels); i < Math.min(end, last); i++) if (!handcrafted[i]) slots.push(i);
    const sorted = slots.map((i) => out[i]!).sort((a, b) => a.difficulty - b.difficulty);
    slots.forEach((i, k) => (out[i] = sorted[k]!));
  }
  return out;
}
