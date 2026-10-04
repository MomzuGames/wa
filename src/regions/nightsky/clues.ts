import { type SkyLevel, edgeBetween, newStroke } from './model';
import { solveLevel, validStarts } from './solver';

// Hints build a guide: the start of one working stroke, two lines at a time, never more
// than half of it, so most of the drawing is always the player's.
export const GUIDE_STEP = 2;

// One full working stroke as a star sequence, from the first valid start.
export function guidePath(level: SkyLevel): number[] | null {
  const starts = validStarts(level);
  if (starts.length === 0) return null;
  return solveLevel(level, starts[0]!).path;
}

export interface SkyGuide {
  start: number;
  edges: number[]; // in stroke order; a double line appears twice
  capped: boolean; // nothing more will be shown
}

// The guide after `hints` line-showing hints (0 shows only the start).
export function guideClue(level: SkyLevel, hints: number): SkyGuide | null {
  const path = guidePath(level);
  if (!path) return null;
  const limit = Math.floor((path.length - 1) / 2);
  const count = Math.min(hints * GUIDE_STEP, limit);
  const remaining = newStroke(level).remaining.slice();
  const edges: number[] = [];
  for (let i = 1; i <= count; i++) {
    const e = edgeBetween(level, path[i - 1]!, path[i]!, remaining);
    if (e < 0) break;
    remaining[e]!--;
    edges.push(e);
  }
  return { start: path[0]!, edges, capped: count >= limit };
}
