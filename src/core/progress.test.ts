import { describe, expect, it } from 'vitest';
import { chapterOf, earliestUnsolved, isChapterEnd, isLevelUnlocked, isRegionComplete, isRegionUnlocked } from './progress';

describe('level unlocking', () => {
  it('unlocks the first level and two ahead of the earliest unsolved', () => {
    expect(isLevelUnlocked([], 0)).toBe(true);
    expect(isLevelUnlocked([], 1)).toBe(true);
    expect(isLevelUnlocked([], 2)).toBe(true);
    expect(isLevelUnlocked([], 3)).toBe(false);
  });

  it('unlocks the level after any solved level', () => {
    expect(isLevelUnlocked([0, 1, 2, 3], 4)).toBe(true);
    expect(isLevelUnlocked([0, 1, 2, 3], 5)).toBe(true);
    expect(isLevelUnlocked([0, 1, 2, 3], 6)).toBe(true);
    expect(isLevelUnlocked([0, 1, 2, 3], 7)).toBe(false);
  });

  it('lets one hard level be skipped without blocking progress', () => {
    const solved = [0, 2, 3, 4];
    expect(earliestUnsolved(solved)).toBe(1);
    expect(isLevelUnlocked(solved, 5)).toBe(true);
    expect(isLevelUnlocked(solved, 6)).toBe(false);
  });
});

describe('region unlocking', () => {
  it('always unlocks the first region', () => {
    expect(isRegionUnlocked([0, 0, 0, 0, 0], 0)).toBe(true);
  });

  it('unlocks the next region at 8 of 10', () => {
    expect(isRegionUnlocked([7, 0, 0, 0, 0], 1)).toBe(false);
    expect(isRegionUnlocked([8, 0, 0, 0, 0], 1)).toBe(true);
    expect(isRegionUnlocked([10, 7, 0, 0, 0], 2)).toBe(false);
  });

  it('completes at 10', () => {
    expect(isRegionComplete(9)).toBe(false);
    expect(isRegionComplete(10)).toBe(true);
  });

  it('groups levels into chapters of 3, 3, 2 and 2', () => {
    expect([0, 2, 3, 5, 6, 7, 8, 9].map(chapterOf)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect([2, 5, 7, 9].every(isChapterEnd)).toBe(true);
    expect(isChapterEnd(4)).toBe(false);
  });
});
