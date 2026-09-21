import { describe, expect, it } from 'vitest';
import levelsJson from './levels.json';
import { E, N, S, W, boardFromLevel, isSolutionValid, isSolved, rotateMask, tileKind, type LoopLevel } from './model';
import { countSolutions, solve } from './solver';
import { generateLoopLevel } from './generator';
import { ghostClue, revealFraction } from './clues';

const levels = levelsJson as LoopLevel[];

describe('loop model', () => {
  it('rotates masks clockwise', () => {
    expect(rotateMask(N, 1)).toBe(E);
    expect(rotateMask(E, 1)).toBe(S);
    expect(rotateMask(S, 1)).toBe(W);
    expect(rotateMask(W, 1)).toBe(N);
    expect(rotateMask(N | E, 2)).toBe(S | W);
  });

  it('classifies tiles', () => {
    expect(tileKind(0)).toBe('blank');
    expect(tileKind(N)).toBe('end');
    expect(tileKind(N | S)).toBe('straight');
    expect(tileKind(N | E)).toBe('corner');
    expect(tileKind(N | E | S)).toBe('tee');
    expect(tileKind(15)).toBe('cross');
  });
});

describe('loop solver', () => {
  it('solves a scrambled ring', () => {
    const level = levels[0]!;
    const board = boardFromLevel(level);
    const result = solve(board);
    expect(result.solution).not.toBeNull();
    board.cells.forEach((c, i) => {
      if (c) c.rotation = result.solution![i]!;
    });
    expect(isSolved(board)).toBe(true);
  });

  it('reports no solution for an impossible board', () => {
    const board = { width: 1, height: 1, cells: [{ mask: N, rotation: 0, locked: false }] };
    expect(solve(board).solution).toBeNull();
    expect(countSolutions(board)).toBe(0);
  });
});

describe('loop generator', () => {
  it('is deterministic for a seed', () => {
    const params = { width: 5, height: 5, irregular: false, loopiness: 0.2, components: 1, lockedFraction: 0 };
    const a = generateLoopLevel('det', 1, params);
    const b = generateLoopLevel('det', 1, params);
    expect(a).toEqual(b);
  });
});

describe('baked tidepools levels', () => {
  it('has 10 levels', () => {
    expect(levels).toHaveLength(10);
  });

  levels.forEach((level, i) => {
    describe(`level ${i + 1} (${level.seed})`, () => {
      it('is not solved at its start state', () => {
        expect(isSolved(boardFromLevel(level))).toBe(false);
      });

      it('has a valid stored solution', () => {
        expect(isSolutionValid(level)).toBe(true);
      });

      it('is solvable by the solver', () => {
        expect(solve(boardFromLevel(level)).solution).not.toBeNull();
      });

      it('never reveals more than half in clue tier 4', () => {
        const board = boardFromLevel(level);
        const clue = ghostClue(board, 'test');
        expect(clue).not.toBeNull();
        expect(revealFraction(board, clue!)).toBeLessThanOrEqual(0.5);
      });

      it('keeps blanks under 20% of tiles', () => {
        const present = level.cells.filter((c) => c);
        const blanks = present.filter((c) => c!.mask === 0);
        expect(blanks.length / present.length).toBeLessThanOrEqual(0.2);
      });
    });
  });
});
