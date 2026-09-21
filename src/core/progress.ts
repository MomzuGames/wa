import { getRegion, persist } from './save';
import type { RegionId } from '../regions/types';
import { REGION_ORDER } from '../regions/catalog';

export const progression = {
  levelsPerRegion: 24,
  chapters: 4,
  levelsPerChapter: 6,
  lookahead: 2,
  unlockNextAt: 20,
} as const;

export function earliestUnsolved(solved: readonly number[], levelCount = progression.levelsPerRegion): number {
  const set = new Set(solved);
  for (let i = 0; i < levelCount; i++) if (!set.has(i)) return i;
  return levelCount;
}

export function isLevelUnlocked(solved: readonly number[], levelIndex: number): boolean {
  if (levelIndex === 0) return true;
  if (solved.includes(levelIndex - 1)) return true;
  return levelIndex <= earliestUnsolved(solved) + progression.lookahead;
}

export function isRegionUnlocked(solvedCounts: readonly number[], regionIndex: number): boolean {
  if (regionIndex === 0) return true;
  const previous = solvedCounts[regionIndex - 1] ?? 0;
  return previous >= progression.unlockNextAt;
}

export function isRegionComplete(solvedCount: number): boolean {
  return solvedCount >= progression.levelsPerRegion;
}

export function solvedCount(id: RegionId): number {
  return getRegion(id).solved.length;
}

export function solvedCounts(): number[] {
  return REGION_ORDER.map((id) => solvedCount(id));
}

export function regionUnlocked(id: RegionId): boolean {
  if (bypassLocks) return true;
  return isRegionUnlocked(solvedCounts(), REGION_ORDER.indexOf(id));
}

export function levelUnlocked(id: RegionId, levelIndex: number): boolean {
  if (bypassLocks) return true;
  return isLevelUnlocked(getRegion(id).solved, levelIndex);
}

// Returns true when this solve completed the region.
export function markSolved(id: RegionId, levelIndex: number): boolean {
  const region = getRegion(id);
  const wasComplete = isRegionComplete(region.solved.length);
  if (!region.solved.includes(levelIndex)) {
    region.solved.push(levelIndex);
    region.solved.sort((a, b) => a - b);
    persist();
  }
  return !wasComplete && isRegionComplete(region.solved.length);
}

export function recordAttempts(id: RegionId, levelIndex: number, attempts: number, cluesUsed: number): void {
  const region = getRegion(id);
  region.attempts[levelIndex] = attempts;
  region.cluesUsed[levelIndex] = cluesUsed;
  persist();
}

// Dev mode: everything reachable, nothing marked solved.
let bypassLocks = false;
export function setBypassLocks(value: boolean): void {
  bypassLocks = value;
}
