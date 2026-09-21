import { describe, expect, it } from 'vitest';
import { earliestUnsolved, isLevelUnlocked, isRegionComplete, isRegionUnlocked } from './progress';

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

  it('unlocks the next region at 20 of 24', () => {
    expect(isRegionUnlocked([19, 0, 0, 0, 0], 1)).toBe(false);
    expect(isRegionUnlocked([20, 0, 0, 0, 0], 1)).toBe(true);
    expect(isRegionUnlocked([24, 19, 0, 0, 0], 2)).toBe(false);
  });

  it('completes at 24', () => {
    expect(isRegionComplete(23)).toBe(false);
    expect(isRegionComplete(24)).toBe(true);
  });
});
