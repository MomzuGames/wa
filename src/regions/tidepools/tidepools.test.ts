import { describe, expect, it } from 'vitest';
import levelsJson from './levels.json';
import { type ShellLevel, isSolved } from './model';
import { countSolutions, solveByLogic } from './solver';
import { generateShellLevel } from './generator';

const levels = levelsJson as ShellLevel[];

describe('tidepools: shells and stones pools', () => {
  it('has ten pools, each at least as hard as the one before (after the teaching pools)', () => {
    expect(levels).toHaveLength(10);
    for (let i = 5; i < levels.length; i++) expect(levels[i]!.difficulty).toBeGreaterThanOrEqual(levels[i - 1]!.difficulty);
  });

  it('a level is deterministic for its seed', () => {
    const params = { width: 5, height: 5, fill: [0.4, 0.65] as [number, number], keepExtra: 0.5, needsInsight: false };
    expect(generateShellLevel('same', 0, params)).toEqual(generateShellLevel('same', 0, params));
  });

  levels.forEach((level, i) => {
    describe(`pool ${i + 1} (${level.seed})`, () => {
      it('its stored loop meets every clue', () => {
        expect(isSolved(level, new Set(level.solution))).toBe(true);
      });
      it('has exactly one answer', () => {
        expect(countSolutions(level, 2)).toBe(1);
      });
      it('can be solved by reasoning alone, no guessing', () => {
        expect(solveByLogic(level).solved).toBe(true);
      });
      it('starts empty and unsolved', () => {
        expect(isSolved(level, new Set())).toBe(false);
      });
    });
  });
});
