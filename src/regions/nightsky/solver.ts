import { type SkyLevel, type Stroke, beginStroke, edgeBetween, isComplete, newStroke, oddStars, orderAllows, traverse, undo } from './model';

export interface SkySolveResult {
  path: number[] | null; // star sequence continuing from the stroke's current star
  nodes: number;
}

function neighbours(level: SkyLevel, from: number, remaining: number[]): number[] {
  const out: number[] = [];
  level.edges.forEach((e, i) => {
    if (remaining[i]! <= 0) return;
    if (e.a === from) out.push(e.b);
    else if (!e.oneWay && e.b === from) out.push(e.a);
  });
  return out;
}

// Depth-first search over remaining edges (Hierholzer's idea with backtracking so
// one-way and double edges are handled). Tries edges that leave the most options last.
export function solveFrom(level: SkyLevel, stroke: Stroke, maxNodes = 150_000): SkySolveResult {
  let nodes = 0;
  const work: Stroke = { remaining: stroke.remaining.slice(), path: stroke.path.slice(), current: stroke.current, reached: stroke.reached };
  const out: number[] = [];

  const dfs = (): boolean => {
    nodes++;
    if (nodes > maxNodes) return false;
    if (isComplete(work)) return true;
    const from = work.current!;
    const options = neighbours(level, from, work.remaining).filter((to) => orderAllows(level, work, to));
    // Prefer continuing to stars with fewer remaining exits (Warnsdorff-style ordering).
    options.sort((a, b) => neighbours(level, a, work.remaining).length - neighbours(level, b, work.remaining).length);
    const seen = new Set<number>();
    for (const to of options) {
      const key = edgeBetween(level, from, to, work.remaining);
      if (seen.has(key)) continue;
      seen.add(key);
      traverse(level, work, to);
      out.push(to);
      if (dfs()) return true;
      out.pop();
      undo(work);
      if (nodes > maxNodes) return false;
    }
    return false;
  };

  if (work.current === null) return { path: null, nodes };
  const ok = dfs();
  return { path: ok ? out : null, nodes };
}

export function solveLevel(level: SkyLevel, start: number, maxNodes?: number): SkySolveResult {
  const stroke = newStroke(level);
  if (!beginStroke(level, stroke, start)) return { path: null, nodes: 0 };
  const result = solveFrom(level, stroke, maxNodes);
  return { path: result.path ? [start, ...result.path] : null, nodes: result.nodes };
}

// Stars from which a full stroke exists. Parity rules out most candidates cheaply.
export function validStarts(level: SkyLevel, maxNodes?: number): number[] {
  const hasOneWay = level.edges.some((e) => e.oneWay);
  let candidates = level.stars.map((_, i) => i).filter((i) => level.edges.some((e) => e.a === i || e.b === i));
  if (!hasOneWay) {
    const odd = oddStars(level);
    if (odd.length === 2) candidates = odd;
    else if (odd.length > 2) return [];
  }
  return candidates.filter((s) => solveLevel(level, s, maxNodes).path !== null);
}
