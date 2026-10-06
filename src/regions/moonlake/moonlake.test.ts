import { describe, expect, it } from 'vitest';
import levelsJson from './levels.json';
import { type LanternLevel, clashing, isSolved, lightCounts, rockState, sightLines } from './model';
import { countSolutions, solveByLogic } from './solver';
import { generateLanternLevel } from './generator';
import { paramsForChapter } from './bake';

const levels = levelsJson as LanternLevel[];

describe('lantern rules', () => {
  const lake: LanternLevel = { seed: 'rules', chapter: 0, width: 3, height: 1, grid: ['.#.'], solution: [], difficulty: 0 };

  it('light stops at a rock, so lanterns on either side do not clash', () => {
    expect(clashing(lake, new Set([0, 2])).size).toBe(0);
    const open = { ...lake, grid: ['...'] };
    expect(clashing(open, new Set([0, 2])).size).toBe(2);
  });

  it('a lantern lights its own row and column up to rocks and the shore', () => {
    const square: LanternLevel = { seed: 'sq', chapter: 0, width: 3, height: 3, grid: ['...', '.#.', '. .'], solution: [], difficulty: 0 };
    const lit = lightCounts(square, new Set([0]), sightLines(square));
    expect([...lit]).toEqual([1, 1, 1, 1, 0, 0, 1, 0, 0]);
  });

  it('a rock with dots wants exactly that many lanterns beside it, corners not counting', () => {
    const rock: LanternLevel = { seed: 'r', chapter: 0, width: 3, height: 2, grid: ['.2.', '...'], solution: [], difficulty: 0 };
    expect(rockState(rock, new Set([0, 2]), 1)).toBe('met');
    expect(rockState(rock, new Set([0]), 1)).toBe('open');
    expect(rockState(rock, new Set([0, 2, 4]), 1)).toBe('over');
    expect(rockState(rock, new Set([3, 5]), 1)).toBe('open');
  });
});

describe('lantern generator', () => {
  it('is deterministic for a seed', () => {
    expect(generateLanternLevel('same', 0, paramsForChapter(0, false))).toEqual(generateLanternLevel('same', 0, paramsForChapter(0, false)));
  });
});

describe('baked moon lake levels', () => {
  it('has ten lakes that never get easier after the first few', () => {
    expect(levels).toHaveLength(10);
    for (let i = 4; i < levels.length; i++) expect(levels[i]!.difficulty).toBeGreaterThanOrEqual(levels[i - 1]!.difficulty);
  });

  levels.forEach((level, i) => {
    describe(`lake ${i + 1} (${level.seed})`, () => {
      it('its stored lanterns solve it', () => {
        expect(isSolved(level, new Set(level.solution))).toBe(true);
      });
      it('has exactly one answer', () => {
        expect(countSolutions(level, 2)).toBe(1);
      });
      it('can be solved by reasoning alone, no guessing', () => {
        expect(solveByLogic(level).solved).toBe(true);
      });
      it('starts dark and unsolved', () => {
        expect(isSolved(level, new Set())).toBe(false);
      });
      it('the last lakes ask for looking ahead', () => {
        if (i >= 8) expect(solveByLogic(level).whatIfSteps).toBeGreaterThan(0);
      });
    });
  });
});
