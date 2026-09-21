import { describe, expect, it } from 'vitest';
import levelsJson from './levels.json';
import {
  type StoneLevel,
  type Tri,
  canonical,
  isChiral,
  isConnected,
  isCover,
  isSolutionValid,
  neighbours,
  normalise,
  rotateTri,
  transform,
} from './model';
import { solveStone } from './solver';
import { halfClue, pieceClue, revealFraction } from './clues';
import { generateStoneLevel } from './generator';

const levels = levelsJson as StoneLevel[];

describe('stone model', () => {
  it('rotates triangles clockwise', () => {
    expect(rotateTri([1, 0, 0])).toEqual([0, 1, 1]);
    expect(normalise([rotateTri([0, 0, 3])])).toEqual([[0, 0, 0]]);
  });

  it('identifies shapes regardless of orientation', () => {
    const cell = (x: number, y: number): Tri[] => [0, 1, 2, 3].map((t) => [x, y, t] as Tri);
    const l = [...cell(0, 0), ...cell(1, 0), ...cell(0, 1)];
    const s = [...cell(0, 0), ...cell(1, 0), ...cell(1, 1), ...cell(2, 1)];
    expect(canonical(transform(l, 1, 0), false)).toBe(canonical(l, false));
    expect(isChiral(l)).toBe(false);
    expect(isChiral(s)).toBe(true);
  });

  it('connects triangles across cell edges', () => {
    expect(neighbours([0, 0, 1])).toContainEqual([1, 0, 3]);
    expect(isConnected([[0, 0, 1], [1, 0, 3]])).toBe(true);
    expect(isConnected([[0, 0, 0], [0, 0, 2]])).toBe(false);
  });
});

describe('stone generator', () => {
  it('is deterministic for a seed', () => {
    const params = { cells: [8, 10] as [number, number], pieces: [4, 4] as [number, number], diagonalCuts: [1, 2] as [number, number], diagonalSplits: [0, 1] as [number, number], allowFlip: false, requireFlip: false };
    expect(generateStoneLevel('det', 1, params)).toEqual(generateStoneLevel('det', 1, params));
  });
});

describe('baked stonegarden levels', () => {
  it('has 24 levels', () => {
    expect(levels).toHaveLength(24);
  });

  levels.forEach((level, i) => {
    describe(`level ${i + 1} (${level.seed})`, () => {
      it('has a valid stored solution that covers the silhouette exactly', () => {
        expect(isSolutionValid(level)).toBe(true);
        const placements = new Map(level.pieces.map((p, k) => [k, { ...p.solution, rot: 0, flip: 0 }]));
        expect(isCover(level, placements)).toBe(true);
      });

      it('is solvable by the exact-cover solver', () => {
        expect(solveStone(level).placements).not.toBeNull();
      });

      it('starts with every piece in the tray, not on the board', () => {
        expect(isCover(level, new Map())).toBe(false);
        expect(level.pieces.some((p) => p.tray.rot !== 0 || p.tray.flip !== 0)).toBe(true);
      });

      it('has no two identical pieces', () => {
        const keys = level.pieces.map((p) => canonical(p.tris, level.allowFlip));
        expect(new Set(keys).size).toBe(keys.length);
      });

      it('offers a piece clue and reveals at most half in tier 4', () => {
        expect(pieceClue(level, new Map(), 'test')).not.toBeNull();
        expect(revealFraction(level, halfClue(level, new Map(), 'test'))).toBeLessThanOrEqual(0.5);
      });

      if (level.chapter === 2) {
        it('needs a flip somewhere in chapter 3', () => {
          expect(level.allowFlip).toBe(true);
          expect(level.pieces.some((p) => isChiral(p.tris) && p.tray.flip === 1)).toBe(true);
        });
      }
    });
  });
});
