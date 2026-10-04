import { describe, expect, it } from 'vitest';
import levelsJson from './levels.json';
import {
  MIN_STAR_LINE_CLEARANCE,
  type SkyLevel,
  crossingCount,
  isComplete,
  isSolutionValid,
  minStarLineClearance,
  newStroke,
  oddStars,
  segmentsCross,
  slideAction,
  beginStroke,
  traverse,
  undo,
} from './model';
import { solveLevel, validStarts } from './solver';
import { generateSkyLevel } from './generator';
import { guideClue } from './clues';

const levels = levelsJson as SkyLevel[];

describe('sky model', () => {
  it('detects crossing segments', () => {
    expect(segmentsCross({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 0 })).toBe(true);
    expect(segmentsCross({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 })).toBe(false);
  });

  it('traverses, undoes and respects one-way edges', () => {
    const level: SkyLevel = {
      seed: 't',
      chapter: 0,
      stars: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
      edges: [
        { a: 0, b: 1, required: 1, oneWay: true },
        { a: 1, b: 2, required: 2, oneWay: false },
      ],
      solution: [0, 1, 2, 1],
      drift: false,
      difficulty: 0,
    };
    const stroke = newStroke(level);
    stroke.current = 1;
    expect(traverse(level, stroke, 0)).toBe(false); // against the one-way edge
    expect(traverse(level, stroke, 2)).toBe(true);
    expect(traverse(level, stroke, 1)).toBe(true);
    expect(isComplete(stroke)).toBe(false);
    expect(undo(stroke)!.to).toBe(1);
    expect(stroke.current).toBe(2);
    expect(isSolutionValid(level)).toBe(true);
    expect(validStarts(level)).toEqual([0]);
  });
});

describe('sky generator', () => {
  it('is deterministic for a seed', () => {
    const params = { stars: [6, 9] as [number, number], edges: [7, 10] as [number, number], crossings: [0, 3] as [number, number], closed: false, oneWayFraction: 0, doubleEdges: 0, drift: false };
    expect(generateSkyLevel('det', 1, params)).toEqual(generateSkyLevel('det', 1, params));
  });
});

describe('baked nightsky levels', () => {
  it('has 10 levels', () => {
    expect(levels).toHaveLength(10);
  });

  levels.forEach((level, i) => {
    describe(`level ${i + 1} (${level.seed})`, () => {
      it('has a valid stored solution', () => {
        expect(isSolutionValid(level)).toBe(true);
      });

      it('is solvable by the solver from a valid start', () => {
        const starts = validStarts(level);
        expect(starts.length).toBeGreaterThan(0);
        expect(solveLevel(level, starts[0]!).path).not.toBeNull();
      });

      it('is not solved at its start state', () => {
        expect(isComplete(newStroke(level))).toBe(false);
      });

      it('keeps every star clear of unrelated lines', () => {
        expect(minStarLineClearance(level)).toBeGreaterThanOrEqual(MIN_STAR_LINE_CLEARANCE - 1e-9);
      });

      it('hints grow a guide that can be traced and never shows more than half', () => {
        const total = level.edges.reduce((n, e) => n + e.required, 0);
        let previous = -1;
        for (let hints = 1; hints <= total; hints++) {
          const guide = guideClue(level, hints)!;
          expect(guide.edges.length).toBeGreaterThanOrEqual(previous);
          expect(guide.edges.length).toBeLessThanOrEqual(Math.floor(total / 2));
          // The guide is the start of a real stroke: it can be drawn as shown.
          const stroke = newStroke(level);
          expect(beginStroke(level, stroke, guide.start)).toBe(true);
          for (const e of guide.edges) {
            const edge = level.edges[e]!;
            const to = edge.a === stroke.current ? edge.b : edge.a;
            expect(traverse(level, stroke, to)).toBe(true);
          }
          previous = guide.edges.length;
        }
        expect(guideClue(level, 1)!.edges.length).toBeGreaterThan(0);
      });


      if (level.chapter === 1 && !level.handcrafted) {
        it('has exactly two odd stars in chapter 2', () => {
          expect(oddStars(level)).toHaveLength(2);
        });
      }

      if (level.chapter === 0) {
        it('has at most one crossing in chapter 1', () => {
          expect(crossingCount(level)).toBeLessThanOrEqual(1);
        });
      }
    });
  });
});

describe('drag gestures', () => {
  const level: SkyLevel = {
    seed: 't',
    chapter: 0,
    stars: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
    edges: [
      { a: 0, b: 1, required: 1, oneWay: false },
      { a: 1, b: 2, required: 2, oneWay: false },
    ],
    solution: [0, 1, 2, 1],
    drift: false,
    difficulty: 0,
  };

  it('slides back along a single line to undo it', () => {
    const stroke = newStroke(level);
    beginStroke(level, stroke, 0);
    traverse(level, stroke, 1);
    expect(slideAction(level, stroke, 0, true)).toBe('undo');
  });

  it('traces the second pass of a double line, then undoes it', () => {
    const stroke = newStroke(level);
    beginStroke(level, stroke, 0);
    traverse(level, stroke, 1);
    traverse(level, stroke, 2);
    expect(slideAction(level, stroke, 1, true)).toBe('traverse');
    traverse(level, stroke, 1);
    expect(slideAction(level, stroke, 2, true)).toBe('undo');
  });

  // The pointer leaves every star between steps, so undo is always armed: the worst case.
  it.each(levels.map((l, i) => [i + 1, l] as const))('level %i can be drawn by dragging', (_, l) => {
    const stroke = newStroke(l);
    const [first, ...rest] = l.solution;
    expect(beginStroke(l, stroke, first!)).toBe(true);
    for (const star of rest) {
      expect(slideAction(l, stroke, star, true)).toBe('traverse');
      traverse(l, stroke, star);
    }
    expect(isComplete(stroke)).toBe(true);
  });
});
