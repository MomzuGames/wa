// Shells and stones: draw one closed loop of tide through the pool, from clues.
// The pool is a grid of points (cells); the loop runs along the lines between neighbours,
// enters and leaves every point it visits exactly once, and must pass every clue:
//   shell — the loop goes straight through it, and turns on at least one point beside it;
//   stone — the loop turns on it, and runs straight on for one more step on both sides.

export type ClueKind = 'shell' | 'stone';

export interface Clue {
  x: number;
  y: number;
  kind: ClueKind;
}

export interface ShellLevel {
  seed: string;
  chapter: number;
  width: number;
  height: number;
  clues: Clue[];
  solution: number[]; // the edges of the one loop
  difficulty: number;
}

export type Dir = 0 | 1 | 2 | 3; // N, E, S, W
export const DIRS: readonly Dir[] = [0, 1, 2, 3];
export const STEP: Record<Dir, { dx: number; dy: number }> = { 0: { dx: 0, dy: -1 }, 1: { dx: 1, dy: 0 }, 2: { dx: 0, dy: 1 }, 3: { dx: -1, dy: 0 } };
export const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir;
export const horizontal = (d: Dir) => d === 1 || d === 3;

export function edgeCount(w: number, h: number): number {
  return h * (w - 1) + (h - 1) * w;
}

// The edge leaving (x, y) in direction d, or -1 off the pool.
export function edgeAt(w: number, h: number, x: number, y: number, d: Dir): number {
  const { dx, dy } = STEP[d];
  const nx = x + dx;
  const ny = y + dy;
  if (nx < 0 || ny < 0 || nx >= w || ny >= h) return -1;
  if (dy === 0) return y * (w - 1) + Math.min(x, nx);
  return h * (w - 1) + Math.min(y, ny) * w + x;
}

// The two points an edge joins.
export function edgeEnds(w: number, h: number, e: number): [{ x: number; y: number }, { x: number; y: number }] {
  const horizontalCount = h * (w - 1);
  if (e < horizontalCount) {
    const y = Math.floor(e / (w - 1));
    const x = e % (w - 1);
    return [{ x, y }, { x: x + 1, y }];
  }
  const k = e - horizontalCount;
  const y = Math.floor(k / w);
  const x = k % w;
  return [{ x, y }, { x, y: y + 1 }];
}

export function clueAt(level: Pick<ShellLevel, 'clues'>, x: number, y: number): ClueKind | null {
  return level.clues.find((c) => c.x === x && c.y === y)?.kind ?? null;
}

// Which directions the drawn loop leaves a point by.
export function exits(level: Pick<ShellLevel, 'width' | 'height'>, on: ReadonlySet<number>, x: number, y: number): Dir[] {
  return DIRS.filter((d) => {
    const e = edgeAt(level.width, level.height, x, y, d);
    return e >= 0 && on.has(e);
  });
}

const straightThrough = (ds: Dir[]) => ds.length === 2 && ds[0] === opposite(ds[1]!);
const turnsAt = (ds: Dir[]) => ds.length === 2 && ds[0] !== opposite(ds[1]!);

// Whether one clue is met by the drawn lines (used for the gentle glow on satisfied clues).
export function clueMet(level: Pick<ShellLevel, 'width' | 'height'>, on: ReadonlySet<number>, clue: Clue): boolean {
  const here = exits(level, on, clue.x, clue.y);
  if (clue.kind === 'shell') {
    if (!straightThrough(here)) return false;
    return here.some((d) => {
      const { dx, dy } = STEP[d];
      return turnsAt(exits(level, on, clue.x + dx, clue.y + dy));
    });
  }
  if (!turnsAt(here)) return false;
  return here.every((d) => {
    const { dx, dy } = STEP[d];
    const beyond = edgeAt(level.width, level.height, clue.x + dx, clue.y + dy, d);
    return beyond >= 0 && on.has(beyond);
  });
}

// The drawn lines make one closed loop (clues aside): used to say "closed, but not right yet".
export function isClosedLoop(level: Pick<ShellLevel, 'width' | 'height'>, on: ReadonlySet<number>): boolean {
  if (on.size < 4) return false;
  const { width: w, height: h } = level;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = exits(level, on, x, y).length;
      if (n !== 0 && n !== 2) return false;
    }
  }
  const start = [...on][0]!;
  const seen = new Set<number>([start]);
  const queue = [start];
  while (queue.length) {
    for (const p of edgeEnds(w, h, queue.pop()!)) {
      for (const d of DIRS) {
        const n = edgeAt(w, h, p.x, p.y, d);
        if (n >= 0 && on.has(n) && !seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
  }
  return seen.size === on.size;
}

// How a clue stands right now, for live feedback while drawing: met, broken (the lines
// already drawn cannot be part of an answer that meets it), or still open.
export function clueState(level: Pick<ShellLevel, 'width' | 'height'>, on: ReadonlySet<number>, clue: Clue): 'met' | 'broken' | 'open' {
  if (clueMet(level, on, clue)) return 'met';
  const here = exits(level, on, clue.x, clue.y);
  const beyondOn = (d: Dir) => {
    const { dx, dy } = STEP[d];
    const e = edgeAt(level.width, level.height, clue.x + dx, clue.y + dy, d);
    return e >= 0 && on.has(e);
  };
  const neighbourTurns = (d: Dir) => {
    const { dx, dy } = STEP[d];
    return exits(level, on, clue.x + dx, clue.y + dy).some((k) => horizontal(k) !== horizontal(d));
  };
  if (clue.kind === 'shell') {
    if (turnsAt(here)) return 'broken';
    if (straightThrough(here) && here.every((d) => beyondOn(d))) return 'broken';
    return 'open';
  }
  if (straightThrough(here)) return 'broken';
  if (here.some((d) => neighbourTurns(d))) return 'broken';
  return 'open';
}

// One closed loop, every point visited in and out once, every clue met.
export function isSolved(level: ShellLevel, on: ReadonlySet<number>): boolean {
  if (on.size === 0) return false;
  const { width: w, height: h } = level;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = exits(level, on, x, y).length;
      if (n !== 0 && n !== 2) return false;
    }
  }
  if (!level.clues.every((c) => clueMet(level, on, c))) return false;
  // A single cycle: walk from one edge and count.
  const start = [...on][0]!;
  const seen = new Set<number>([start]);
  const queue = [start];
  while (queue.length) {
    const e = queue.pop()!;
    for (const p of edgeEnds(w, h, e)) {
      for (const d of DIRS) {
        const n = edgeAt(w, h, p.x, p.y, d);
        if (n >= 0 && on.has(n) && !seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
  }
  return seen.size === on.size;
}
