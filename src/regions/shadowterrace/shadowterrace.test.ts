import { describe, expect, it } from 'vitest';
import levelsJson from './levels.json';
import { type ShadowLevel, ceiling, frontProfile, isSolutionValid, isSolved, sideProfile, startHeights } from './model';
import { minimumStones, solveShadow } from './solver';
import { halfClue, stackClue } from './clues';
import { generateShadowLevel } from './generator';
import { paramsForChapter } from './levelSpec';

const levels = levelsJson as ShadowLevel[];

function make(rows: number[][], extra: Partial<ShadowLevel> = {}): ShadowLevel {
  const n = rows.length;
  const heights = rows.flat();
  return {
    seed: 't',
    chapter: 0,
    size: n,
    maxHeight: Math.max(...heights),
    front: frontProfile(n, heights),
    side: sideProfile(n, heights),
    count: null,
    fixed: heights.map(() => -1),
    solution: heights,
    difficulty: 0,
    ...extra,
  };
}

describe('shadow model', () => {
  const stairs = make([
    [1, 2, 3],
    [0, 1, 2],
    [0, 0, 1],
  ]);

  it('casts a shadow on each wall', () => {
    expect(stairs.front).toEqual([1, 2, 3]);
    expect(stairs.side).toEqual([3, 2, 1]);
  });

  it('accepts any terrace that casts the same shadows', () => {
    expect(isSolved(stairs, [1, 2, 3, 0, 0, 2, 0, 0, 1])).toBe(true);
    expect(isSolved(stairs, [1, 2, 3, 0, 2, 2, 1, 1, 1])).toBe(true);
    expect(isSolved(stairs, [1, 2, 2, 0, 1, 2, 0, 0, 1])).toBe(false);
  });

  it('a stack can never rise above either shadow', () => {
    expect(ceiling(stairs, 0, 2)).toBe(1);
    expect(ceiling(stairs, 2, 0)).toBe(3);
  });

  it('respects the count and fixed stones', () => {
    const counted = make(
      [
        [2, 0],
        [0, 1],
      ],
      { count: 3 },
    );
    expect(isSolved(counted, [2, 0, 0, 1])).toBe(true);
    expect(isSolved(counted, [2, 1, 0, 1])).toBe(false); // one stone too many
    expect(isSolved(counted, [2, 0, 0, 0])).toBe(false); // wrong shadow
    const fixed = make([[1, 2]], { fixed: [1, -1] });
    expect(startHeights(fixed)).toEqual([1, 0]);
  });
});

describe('shadow solver', () => {
  it('finds a terrace for the stored shadows and stays close to the player', () => {
    const level = make([
      [1, 2, 3],
      [0, 1, 2],
      [0, 0, 1],
    ]);
    const any = solveShadow(level).heights!;
    expect(isSolved(level, any)).toBe(true);
    const near = solveShadow(level, [1, 2, 3, 0, 0, 2, 0, 0, 1]).heights!;
    expect(near).toEqual([1, 2, 3, 0, 0, 2, 0, 0, 1]);
  });

  it('honours an exact count', () => {
    const level = make(
      [
        [2, 0],
        [0, 2],
      ],
      { count: 5 },
    );
    const r = solveShadow(level).heights!;
    expect(r.reduce((a, b) => a + b, 0)).toBe(5);
    expect(isSolved(level, r)).toBe(true);
    expect(solveShadow({ ...level, count: 3 }).heights).toBeNull();
  });

  it('finds the fewest stones that cast the shadows', () => {
    const level = make([
      [3, 3],
      [3, 3],
    ]);
    expect(minimumStones(level)).toBe(6); // two stacks of three on a diagonal
  });
});

describe('shadow clues', () => {
  it('points at stacks that differ from a nearby solution and never fixed ones', () => {
    const level = make(
      [
        [1, 2, 3],
        [0, 1, 2],
        [0, 0, 1],
      ],
      { fixed: [-1, -1, 3, -1, -1, -1, -1, -1, -1] },
    );
    const heights = startHeights(level);
    const clues = stackClue(level, heights, 2, new Set(), 's');
    expect(clues.length).toBe(2);
    for (const c of clues) expect(level.fixed[c.cell]).toBe(-1);
    const half = halfClue(level, heights, 's');
    expect(half.length).toBeLessThanOrEqual(4);
  });
});

describe('shadow generator', () => {
  it('is deterministic for a seed and produces solvable, non-trivial counted levels', () => {
    const params = paramsForChapter(1, 'x', 0);
    const a = generateShadowLevel('det', 2, params);
    expect(a).toEqual(generateShadowLevel('det', 2, params));
    expect(a).not.toBeNull();
    expect(isSolutionValid(a!)).toBe(true);
    expect(a!.count).not.toBeNull();
  });
});

describe('baked shadow terrace levels', () => {
  it('are all valid, solvable and not solved at the start', () => {
    for (const level of levels) {
      expect(isSolutionValid(level), level.seed).toBe(true);
      expect(solveShadow(level).heights, level.seed).not.toBeNull();
      expect(isSolved(level, startHeights(level)), level.seed).toBe(false);
    }
  });

  it('clue tier 4 never reveals more than half of the stacks', () => {
    for (const level of levels) {
      const ghosts = halfClue(level, startHeights(level), 'q');
      expect(ghosts.length).toBeLessThanOrEqual(Math.floor((level.size * level.size) / 2));
    }
  });

  it('introduces the count from chapter 2 and fixed stones from chapter 3', () => {
    expect(levels.slice(3).every((l) => l.count !== null)).toBe(true);
    expect(levels.slice(6).every((l) => l.fixed.some((f) => f >= 0))).toBe(true);
  });
});
