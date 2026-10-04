import { describe, expect, it } from 'vitest';
import levelsJson from './levels.json';
import {
  type Placement,
  type StoneLevel,
  type Tri,
  canonical,
  flipTri,
  mirrorOrientation,
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
import { stepClue } from './clues';
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
  it('has 10 levels', () => {
    expect(levels).toHaveLength(10);
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

      it('hints settle one stone at a time and leave the last one to the player', () => {
        const placed = new Map<number, Placement>();
        level.pieces.forEach((p, i) => p.fixed && placed.set(i, { ...p.solution, rot: 0, flip: 0 }));
        const movable = level.pieces.filter((p) => !p.fixed).length;
        for (let step = stepClue(level, placed); step; step = stepClue(level, placed)) {
          expect(step.kind).toBe('settle');
          if (step.kind !== 'settle') break;
          expect(placed.has(step.piece)).toBe(false);
          placed.set(step.piece, step.placement);
          expect(solveStone(level, placed).placements).not.toBeNull();
        }
        expect(placed.size).toBe(level.pieces.length - 1);
        expect(movable).toBeGreaterThan(0);
      });

      it('a hint lifts a stone the player has put where no solution can keep it', () => {
        const piece = level.pieces.findIndex((p) => !p.fixed);
        const placed = new Map<number, Placement>();
        level.pieces.forEach((p, i) => p.fixed && placed.set(i, { ...p.solution, rot: 0, flip: 0 }));
        // Far outside the silhouette: no finished garden keeps it there.
        placed.set(piece, { x: level.width + 5, y: level.height + 5, rot: 0, flip: 0 });
        expect(stepClue(level, placed)).toEqual({ kind: 'lift', piece });
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

describe('flipping a turned stone', () => {
  it('mirrors the stone as it looks now, for every turn', () => {
    const L: Tri[] = [[0, 0, 0], [0, 0, 1], [0, 1, 1], [1, 1, 0], [1, 1, 3]];
    for (const flip of [0, 1]) {
      for (let rot = 0; rot < 4; rot++) {
        const seen = transform(L, rot, flip);
        const next = mirrorOrientation(rot, flip);
        expect(transform(L, next.rot, next.flip)).toEqual(normalise(seen.map(flipTri)));
      }
    }
  });
});
