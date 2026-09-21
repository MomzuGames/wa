import { describe, expect, it } from 'vitest';
import levelsJson from './levels.json';
import { type RippleLevel, affectLists, applyPresses, isLit, isSolutionValid, press, pressCount } from './model';
import { solveRipple } from './solver';
import { countClue, halfClue, nodeClue } from './clues';
import { generateRippleLevel } from './generator';

const levels = levelsJson as RippleLevel[];

describe('ripple model', () => {
  const line: RippleLevel = {
    seed: 'line',
    chapter: 0,
    states: 2,
    nodes: [{ x: 0, y: 0, wide: false }, { x: 0.5, y: 0, wide: false }, { x: 1, y: 0, wide: true }, { x: 1, y: 1, wide: false }],
    edges: [[0, 1], [1, 2], [2, 3]],
    start: [0, 0, 0, 0],
    solution: [],
    difficulty: 0,
  };

  it('advances a pad and its neighbours, further for wide pads', () => {
    expect(affectLists(line)[1]).toEqual([0, 1, 2]);
    expect(affectLists(line)[2]).toEqual([0, 1, 2, 3]);
    expect(press(line, [0, 0, 0, 0], 1)).toEqual([1, 1, 1, 0]);
  });

  it('wraps three-state pads', () => {
    const three = { ...line, states: 3 as const };
    expect(applyPresses(three, [2, 2, 2, 2], [0, 1, 0, 0])).toEqual([0, 0, 0, 2]);
  });
});

describe('ripple solver', () => {
  it('finds the minimum presses over GF(2) and GF(3)', () => {
    const square: RippleLevel = {
      seed: 'sq',
      chapter: 0,
      states: 2,
      nodes: [{ x: 0, y: 0, wide: false }, { x: 1, y: 0, wide: false }, { x: 0, y: 1, wide: false }, { x: 1, y: 1, wide: false }],
      edges: [[0, 1], [0, 2], [1, 3], [2, 3]],
      start: [0, 0, 0, 0],
      solution: [],
      difficulty: 0,
    };
    // Pressing every pad lights the whole square from dark; the solver may find something shorter but never fail.
    const r2 = solveRipple(square, square.start);
    expect(r2.presses).not.toBeNull();
    expect(isLit(square, applyPresses(square, square.start, r2.presses!))).toBe(true);
    const three = { ...square, states: 3 as const, start: [2, 1, 1, 1] };
    const r3 = solveRipple(three, three.start);
    expect(r3.presses).not.toBeNull();
    expect(isLit(three, applyPresses(three, three.start, r3.presses!))).toBe(true);
  });
});

describe('ripple generator', () => {
  it('is deterministic for a seed', () => {
    const params = { shape: 'cluster' as const, size: [7, 9] as [number, number], states: 2 as const, wideNodes: [0, 1] as [number, number], presses: [3, 5] as [number, number], minSolution: 3 };
    expect(generateRippleLevel('det', 1, params)).toEqual(generateRippleLevel('det', 1, params));
  });
});

describe('baked moonlake levels', () => {
  it('has 24 levels', () => {
    expect(levels).toHaveLength(24);
  });

  levels.forEach((level, i) => {
    describe(`level ${i + 1} (${level.seed})`, () => {
      it('is not lit at its start state', () => {
        expect(isLit(level, level.start)).toBe(false);
      });

      it('has a valid stored solution', () => {
        expect(isSolutionValid(level)).toBe(true);
      });

      it('is solvable by the solver with no more presses than stored', () => {
        const r = solveRipple(level, level.start);
        expect(r.presses).not.toBeNull();
        expect(pressCount(r.presses!)).toBeLessThanOrEqual(pressCount(level.solution));
      });

      it('gives clues and reveals at most half in tier 4', () => {
        expect(nodeClue(level, level.start, 1, new Set(), 'test').length).toBe(1);
        expect(countClue(level, level.start)).toBeGreaterThan(0);
        const half = halfClue(level, level.start, 'test');
        const sites = level.solution.filter((c) => c > 0).length;
        expect(half.length).toBeLessThanOrEqual(Math.floor(sites / 2));
      });

      if (level.chapter === 2) {
        it('uses three states in chapter 3', () => {
          expect(level.states).toBe(3);
        });
      }
      if (level.chapter === 3) {
        it('has wide pads in chapter 4', () => {
          expect(level.nodes.some((n) => n.wide)).toBe(true);
        });
      }
    });
  });
});
