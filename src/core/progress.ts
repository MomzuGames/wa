import { getRegion, isFullGame, persist } from './save';
import { events } from './events';
import type { RegionId } from '../regions/types';
import { REGION_ORDER } from '../regions/catalog';

// Ten levels per region in four short chapters (3, 3, 2, 2). Each chapter adds one
// twist; the last level of a region is generated to be the hardest.
export const progression = {
  levelsPerRegion: 10,
  chapters: 4,
  chapterStarts: [0, 3, 6, 8] as const,
  lookahead: 2,
  // The free part of every region: chapter 1 and the first level of chapter 2 (24 of 60).
  freeLevels: 4,
  unlockNextAt: 8,
} as const;

export function chapterOf(levelIndex: number): number {
  let c = 0;
  progression.chapterStarts.forEach((start, i) => {
    if (levelIndex >= start) c = i;
  });
  return c;
}

export function chapterRange(chapter: number): { start: number; end: number } {
  const start = progression.chapterStarts[chapter]!;
  const end = chapter + 1 < progression.chapters ? progression.chapterStarts[chapter + 1]! : progression.levelsPerRegion;
  return { start, end };
}

export function isChapterEnd(levelIndex: number): boolean {
  return chapterRange(chapterOf(levelIndex)).end === levelIndex + 1;
}

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

// Every region is open from the start: the owner does not want the journey gated.
// The trail still lights up from region to region as each one is finished.
export function isRegionUnlocked(solvedCounts: readonly number[], regionIndex: number): boolean {
  void solvedCounts;
  return regionIndex >= 0;
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

// Levels past the free part belong to the full journey.
export function isPaidLevel(levelIndex: number): boolean {
  return levelIndex >= progression.freeLevels;
}

// A paid level the full journey has not unlocked yet (never in dev mode).
export function paywalled(levelIndex: number): boolean {
  return !bypassLocks && isPaidLevel(levelIndex) && !isFullGame();
}

// Whether a level can be opened right now: reached by progress, and free or unlocked.
export function levelPlayable(id: RegionId, levelIndex: number): boolean {
  return levelUnlocked(id, levelIndex) && !paywalled(levelIndex);
}

// Returns true when this solve completed the region.
export function markSolved(id: RegionId, levelIndex: number): boolean {
  const region = getRegion(id);
  const wasComplete = isRegionComplete(region.solved.length);
  if (!region.solved.includes(levelIndex)) {
    region.solved.push(levelIndex);
    region.solved.sort((a, b) => a - b);
    persist();
    events.emit('progress:changed');
  }
  return !wasComplete && isRegionComplete(region.solved.length);
}

export function recordAttempts(id: RegionId, levelIndex: number, attempts: number, cluesUsed: number): void {
  const region = getRegion(id);
  region.attempts[levelIndex] = attempts;
  region.cluesUsed[levelIndex] = cluesUsed;
  persist();
  events.emit('progress:changed');
}

// Dev mode: everything reachable, nothing marked solved.
let bypassLocks = false;
export function setBypassLocks(value: boolean): void {
  bypassLocks = value;
}
