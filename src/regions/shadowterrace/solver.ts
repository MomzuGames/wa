import { type ShadowLevel, ceiling, cellIndex } from './model';

export interface ShadowSolveResult {
  heights: number[] | null;
  nodes: number;
}

// Backtracking over cells with a small amount of look-ahead: every column and row must
// still be able to reach its shadow height, and the stone count must stay reachable.
// `prefer` lists heights to try first per cell, so hints stay close to what the player built.
export function solveShadow(level: ShadowLevel, prefer?: number[], maxNodes = 200_000): ShadowSolveResult {
  const n = level.size;
  const total = n * n;
  const heights = new Array<number>(total).fill(0);
  const caps = new Array<number>(total);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) caps[cellIndex(n, x, y)] = ceiling(level, x, y);
  const floor = (i: number) => (level.fixed[i]! >= 0 ? level.fixed[i]! : level.footprint && level.footprint[i] ? 1 : 0);
  const cap = (i: number) => (level.fixed[i]! >= 0 ? level.fixed[i]! : caps[i]!);
  // Suffix sums of floors and caps, for the count look-ahead.
  const minAfter = new Array<number>(total + 1).fill(0);
  const maxAfter = new Array<number>(total + 1).fill(0);
  for (let i = total - 1; i >= 0; i--) {
    minAfter[i] = minAfter[i + 1]! + floor(i);
    maxAfter[i] = maxAfter[i + 1]! + cap(i);
  }
  // Per column/row: how many unassigned cells could still reach the shadow height.
  const colChances = new Array<number>(n).fill(0);
  const rowChances = new Array<number>(n).fill(0);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = cellIndex(n, x, y);
      if (cap(i) >= level.front[x]! && floor(i) <= level.front[x]!) colChances[x]!++;
      if (cap(i) >= level.side[y]! && floor(i) <= level.side[y]!) rowChances[y]!++;
    }
  }
  const colDone = new Array<boolean>(n).fill(false);
  const rowDone = new Array<boolean>(n).fill(false);
  let nodes = 0;
  let sum = 0;

  const search = (i: number): boolean => {
    nodes++;
    if (nodes > maxNodes) return false;
    if (i === total) {
      if (level.count !== null && sum !== level.count) return false;
      return colDone.every(Boolean) && rowDone.every(Boolean);
    }
    const x = i % n;
    const y = Math.floor(i / n);
    const lo = floor(i);
    const hi = cap(i);
    const canReachCol = hi >= level.front[x]! && lo <= level.front[x]!;
    const canReachRow = hi >= level.side[y]! && lo <= level.side[y]!;
    if (canReachCol) colChances[x]!--;
    if (canReachRow) rowChances[y]!--;
    const order: number[] = [];
    const first = prefer ? Math.min(hi, Math.max(lo, prefer[i]!)) : -1;
    if (first >= 0) order.push(first);
    for (let h = hi; h >= lo; h--) if (h !== first) order.push(h);
    for (const h of order) {
      // The column and row must still be able to reach their shadows after this choice.
      const hitsCol = h === level.front[x];
      const hitsRow = h === level.side[y];
      if (!colDone[x] && !hitsCol && colChances[x] === 0) continue;
      if (!rowDone[y] && !hitsRow && rowChances[y] === 0) continue;
      if (level.count !== null) {
        const rest = sum + h;
        if (rest + minAfter[i + 1]! > level.count || rest + maxAfter[i + 1]! < level.count) continue;
      }
      const wasCol = colDone[x]!;
      const wasRow = rowDone[y]!;
      if (hitsCol) colDone[x] = true;
      if (hitsRow) rowDone[y] = true;
      heights[i] = h;
      sum += h;
      if (search(i + 1)) return true;
      sum -= h;
      colDone[x] = wasCol;
      rowDone[y] = wasRow;
      if (nodes > maxNodes) break;
    }
    if (canReachCol) colChances[x]!++;
    if (canReachRow) rowChances[y]!++;
    return false;
  };

  const ok = search(0);
  return { heights: ok ? heights : null, nodes };
}

// The fewest stones that can cast these shadows (footprint and fixed stones respected).
export function minimumStones(level: ShadowLevel, maxNodes = 200_000): number | null {
  const upper = level.solution.length ? level.solution.reduce((a, b) => a + b, 0) : level.size * level.size * level.maxHeight;
  for (let c = 0; c <= upper; c++) {
    const trial: ShadowLevel = { ...level, count: c };
    if (solveShadow(trial, undefined, maxNodes).heights) return c;
  }
  return null;
}
