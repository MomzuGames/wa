import { type SkyLevel, type Stroke, edgeBetween, newStroke, oddStars } from './model';
import { solveFrom, solveLevel, validStarts } from './solver';

// Clues are computed from the player's current stroke where it can still be completed,
// falling back to a fresh stroke otherwise.
function bestPath(level: SkyLevel, stroke: Stroke): { path: number[]; fresh: boolean } | null {
  if (stroke.current !== null) {
    const fromHere = solveFrom(level, stroke);
    if (fromHere.path) return { path: [stroke.current, ...fromHere.path], fresh: false };
  }
  const starts = validStarts(level);
  if (starts.length === 0) return null;
  const solved = solveLevel(level, starts[0]!);
  return solved.path ? { path: solved.path, fresh: true } : null;
}

// Tier 1: a star the player can start from (or continue from).
export function startClue(level: SkyLevel, stroke: Stroke): number | null {
  const best = bestPath(level, stroke);
  return best ? best.path[0]! : null;
}

// Tier 2: the next two edges along a valid path.
export function nextEdgesClue(level: SkyLevel, stroke: Stroke): number[] {
  const best = bestPath(level, stroke);
  if (!best) return [];
  const remaining = best.fresh ? newStroke(level).remaining.slice() : stroke.remaining.slice();
  const out: number[] = [];
  for (let i = 1; i < best.path.length && out.length < 2; i++) {
    const e = edgeBetween(level, best.path[i - 1]!, best.path[i]!, remaining);
    if (e < 0) break;
    remaining[e]!--;
    out.push(e);
  }
  return out;
}

// Tier 3: stars with an odd number of lines.
export function oddStarsClue(level: SkyLevel): number[] {
  return oddStars(level);
}

// Tier 4: at most half of the edges along a valid path.
export function halfPathClue(level: SkyLevel, stroke: Stroke): number[] {
  const best = bestPath(level, stroke);
  if (!best) return [];
  const remaining = best.fresh ? newStroke(level).remaining.slice() : stroke.remaining.slice();
  const edges: number[] = [];
  for (let i = 1; i < best.path.length; i++) {
    const e = edgeBetween(level, best.path[i - 1]!, best.path[i]!, remaining);
    if (e < 0) break;
    remaining[e]!--;
    if (!edges.includes(e)) edges.push(e);
  }
  return edges.slice(0, Math.floor(level.edges.length / 2));
}

export function revealFraction(level: SkyLevel, edges: number[]): number {
  return level.edges.length === 0 ? 0 : edges.length / level.edges.length;
}
