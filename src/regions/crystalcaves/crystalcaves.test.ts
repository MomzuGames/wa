import { describe, expect, it } from 'vitest';
import levelsJson from './levels.json';
import { LEMON, type PrismLevel, ROSE, SKY, initialOrients, isSolutionValid, isSolved, reflect, trace } from './model';
import { solvePrism } from './solver';
import { ghostClue, lockClue, revealFraction } from './clues';
import { generatePrismLevel } from './generator';

const levels = levelsJson as PrismLevel[];

describe('prism model', () => {
  it('reflects beams off both mirror orientations', () => {
    expect(reflect(1, 0)).toBe(0); // east into '/' goes north
    expect(reflect(1, 1)).toBe(2); // east into '\' goes south
    expect(reflect(2, 0)).toBe(3);
    expect(reflect(0, 1)).toBe(3);
  });

  it('mixes colours at targets and filters beams', () => {
    const level: PrismLevel = {
      seed: 't',
      chapter: 0,
      width: 5,
      height: 5,
      pieces: [
        { kind: 'emitter', x: 0, y: 2, orient: 1, rotatable: false, color: ROSE },
        { kind: 'emitter', x: 2, y: 0, orient: 2, rotatable: false, color: SKY },
        { kind: 'filter', x: 1, y: 2, orient: 0, rotatable: false, color: ROSE | LEMON },
        { kind: 'target', x: 2, y: 2, orient: 0, rotatable: false, color: ROSE | SKY },
      ],
      solution: [1, 2, 0, 0],
      difficulty: 0,
    };
    const t = trace(level, level.solution);
    expect(t.received.get(3)).toBe(ROSE | SKY);
    expect(isSolved(level, level.solution)).toBe(true);
    level.pieces[2]!.color = LEMON;
    expect(trace(level, level.solution).received.get(3)).toBe(SKY);
  });

  it('terminates on beam loops', () => {
    const level: PrismLevel = {
      seed: 'loop',
      chapter: 0,
      width: 4,
      height: 4,
      pieces: [
        { kind: 'emitter', x: 0, y: 1, orient: 1, rotatable: false, color: SKY },
        { kind: 'splitter', x: 1, y: 1, orient: 1, rotatable: true, color: 0 },
        { kind: 'mirror', x: 2, y: 1, orient: 1, rotatable: true, color: 0 },
        { kind: 'mirror', x: 2, y: 2, orient: 0, rotatable: true, color: 0 },
        { kind: 'mirror', x: 1, y: 2, orient: 1, rotatable: true, color: 0 },
      ],
      solution: [1, 1, 1, 0, 1],
      difficulty: 0,
    };
    expect(() => trace(level, level.solution)).not.toThrow();
  });
});

describe('prism generator', () => {
  it('is deterministic for a seed', () => {
    const params = { size: [5, 5] as [number, number], emitters: [2, 2] as [number, number], mirrors: [3, 4] as [number, number], splitters: [0, 1] as [number, number], filters: [0, 0] as [number, number], blockers: [0, 0] as [number, number], targets: [2, 2] as [number, number], colors: [SKY], requireMix: false };
    expect(generatePrismLevel('det', 1, params)).toEqual(generatePrismLevel('det', 1, params));
  });
});

describe('baked crystalcaves levels', () => {
  it('has 10 levels', () => {
    expect(levels).toHaveLength(10);
  });

  levels.forEach((level, i) => {
    describe(`level ${i + 1} (${level.seed})`, () => {
      it('has a valid stored solution', () => {
        expect(isSolutionValid(level)).toBe(true);
      });

      it('is not solved at its start state', () => {
        expect(isSolved(level, initialOrients(level))).toBe(false);
      });

      it('is solvable by the solver', () => {
        expect(solvePrism(level, initialOrients(level)).orients).not.toBeNull();
      });

      it('offers a lock clue and reveals at most half in tier 4', () => {
        expect(lockClue(level, initialOrients(level), new Set(), 1, 'test')).not.toBeNull();
        const ghost = ghostClue(level, initialOrients(level), 'test');
        expect(ghost).not.toBeNull();
        expect(revealFraction(level, ghost!)).toBeLessThanOrEqual(0.5);
      });

      it('has every target requiring some colour', () => {
        expect(level.pieces.filter((p) => p.kind === 'target').every((p) => p.color > 0)).toBe(true);
      });

      if (level.chapter >= 2) {
        it('needs colour mixing from chapter 3', () => {
          expect(level.pieces.some((p) => p.kind === 'target' && [3, 5, 6, 7].includes(p.color))).toBe(true);
        });
      }
    });
  });
});
