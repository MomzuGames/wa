import { DIRS, type Dir, STEP, type ShellLevel, clueAt, edgeAt, edgeCount, edgeEnds, horizontal, isSolved, opposite } from './model';

// A solver that reasons the way a person can: it only ever applies a rule to what is
// already certain, and records why. It is used three ways: to prove a level can be solved
// by logic alone (no guessing), to count solutions (with a little search on top), and to
// give hints that explain themselves.

export type Reason = 'point' | 'stone' | 'shell' | 'shell-turn' | 'small-loop' | 'what-if';

export interface Deduction {
  edge: number;
  on: boolean;
  reason: Reason;
  x: number; // the point or clue that gave it away
  y: number;
}

const UNKNOWN = -1;

class Grid {
  readonly state: Int8Array;
  readonly deductions: Deduction[] = [];
  contradiction = false;

  constructor(
    readonly level: ShellLevel,
    state?: Int8Array,
  ) {
    this.state = state ? state.slice() : new Int8Array(edgeCount(level.width, level.height)).fill(UNKNOWN);
  }

  edge(x: number, y: number, d: Dir): number {
    return edgeAt(this.level.width, this.level.height, x, y, d);
  }

  value(e: number): number {
    return e < 0 ? 0 : this.state[e]!;
  }

  set(e: number, on: boolean, reason: Reason, x: number, y: number): boolean {
    if (e < 0) {
      if (on) this.contradiction = true;
      return false;
    }
    const v = on ? 1 : 0;
    if (this.state[e] === v) return false;
    if (this.state[e] !== UNKNOWN) {
      this.contradiction = true;
      return false;
    }
    this.state[e] = v;
    this.deductions.push({ edge: e, on, reason, x, y });
    return true;
  }
}

// Every point has 0 or 2 lines; clue points have exactly 2.
function pointRule(g: Grid, x: number, y: number): boolean {
  const edges = DIRS.map((d) => g.edge(x, y, d));
  const on = edges.filter((e) => g.value(e) === 1).length;
  const open = edges.filter((e) => e >= 0 && g.value(e) === UNKNOWN);
  const needed = clueAt(g.level, x, y) !== null;
  let changed = false;
  if (on > 2 || (on === 1 && open.length === 0) || (needed && on + open.length < 2)) {
    g.contradiction = true;
    return false;
  }
  if (on === 2) for (const e of open) changed = g.set(e, false, 'point', x, y) || changed;
  else if (on === 1 && open.length === 1) changed = g.set(open[0]!, true, 'point', x, y) || changed;
  else if (on === 0 && open.length < 2) for (const e of open) changed = g.set(e, false, 'point', x, y) || changed;
  else if (needed && on + open.length === 2) for (const e of open) changed = g.set(e, true, 'point', x, y) || changed;
  return changed;
}

// A stone turns, and each leg runs one more step straight on.
function stoneRule(g: Grid, x: number, y: number): boolean {
  let changed = false;
  // A leg needs the next point to run straight on: not a stone (stones turn), and not
  // already bent across.
  const legPossible = (d: Dir) => {
    const e = g.edge(x, y, d);
    const { dx, dy } = STEP[d];
    const nx = x + dx;
    const ny = y + dy;
    const beyond = g.edge(nx, ny, d);
    if (e < 0 || beyond < 0 || g.value(e) === 0 || g.value(beyond) === 0) return false;
    if (clueAt(g.level, nx, ny) === 'stone') return false;
    const across = ([0, 1, 2, 3] as Dir[]).filter((k) => horizontal(k) !== horizontal(d));
    return across.every((k) => g.value(g.edge(nx, ny, k)) !== 1);
  };
  for (const d of DIRS) {
    const e = g.edge(x, y, d);
    const { dx, dy } = STEP[d];
    if (!legPossible(d)) {
      changed = g.set(e, false, 'stone', x, y) || changed;
      // The leg on this axis must go the other way, with its step beyond.
      const o = opposite(d);
      const { dx: ox, dy: oy } = STEP[o];
      changed = g.set(g.edge(x, y, o), true, 'stone', x, y) || changed;
      changed = g.set(g.edge(x + ox, y + oy, o), true, 'stone', x, y) || changed;
    } else if (g.value(e) === 1) {
      changed = g.set(g.edge(x + dx, y + dy, d), true, 'stone', x, y) || changed;
      changed = g.set(g.edge(x, y, opposite(d)), false, 'stone', x, y) || changed;
    }
  }
  return changed;
}

// A shell is passed straight through, and the loop turns beside it on at least one side.
function shellRule(g: Grid, x: number, y: number): boolean {
  let changed = false;
  const axisOpen = (h: boolean) => {
    const [a, b] = (h ? [1, 3] : [0, 2]) as Dir[];
    return [a, b].every((d) => g.edge(x, y, d!) >= 0 && g.value(g.edge(x, y, d!)) !== 0);
  };
  const h = axisOpen(true);
  const v = axisOpen(false);
  if (!h && !v) {
    g.contradiction = true;
    return false;
  }
  let axis: boolean | null = null;
  if (!h) axis = false;
  else if (!v) axis = true;
  else if (DIRS.some((d) => g.value(g.edge(x, y, d)) === 1)) axis = DIRS.find((d) => g.value(g.edge(x, y, d)) === 1)! % 2 === 1;
  else if (DIRS.some((d) => g.value(g.edge(x, y, d)) === 0)) axis = DIRS.find((d) => g.value(g.edge(x, y, d)) === 0)! % 2 === 0;
  if (axis === null) return false;
  for (const d of DIRS) changed = g.set(g.edge(x, y, d), horizontal(d) === axis, 'shell', x, y) || changed;
  // Turning beside it: if one side runs straight on, the other side must turn.
  const along = (axis ? [1, 3] : [0, 2]) as Dir[];
  for (const d of along) {
    const { dx, dy } = STEP[d];
    const beyond = g.edge(x + dx, y + dy, d);
    if (g.value(beyond) === 1) {
      const o = opposite(d);
      const { dx: ox, dy: oy } = STEP[o];
      changed = g.set(g.edge(x + ox, y + oy, o), false, 'shell-turn', x, y) || changed;
    }
  }
  return changed;
}

// An open line may not close into a loop unless that loop would be the whole answer.
function smallLoopRule(g: Grid): boolean {
  const { width: w, height: h } = g.level;
  // Chains of drawn edges: find each chain's two ends.
  const parent = new Map<string, string>();
  const key = (x: number, y: number) => `${x},${y}`;
  const find = (k: string): string => {
    while (parent.get(k) !== k) k = parent.get(k)!;
    return k;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  let onCount = 0;
  for (let e = 0; e < g.state.length; e++) {
    if (g.state[e] !== 1) continue;
    onCount++;
    const [a, b] = edgeEnds(w, h, e);
    for (const p of [a, b]) if (!parent.has(key(p.x, p.y))) parent.set(key(p.x, p.y), key(p.x, p.y));
    union(key(a.x, a.y), key(b.x, b.y));
  }
  let changed = false;
  for (let e = 0; e < g.state.length; e++) {
    if (g.state[e] !== UNKNOWN) continue;
    const [a, b] = edgeEnds(w, h, e);
    const ka = key(a.x, a.y);
    const kb = key(b.x, b.y);
    if (!parent.has(ka) || !parent.has(kb) || find(ka) !== find(kb)) continue;
    // Closing here makes a loop of this chain. Fine only if nothing else is (or must be) drawn.
    const chain = find(ka);
    const chainEdges = [...g.state.keys()].filter((f) => {
      if (g.state[f] !== 1) return false;
      const [p] = edgeEnds(w, h, f);
      return find(key(p.x, p.y)) === chain;
    }).length;
    const cluesOff = g.level.clues.some((c) => !parent.has(key(c.x, c.y)) || find(key(c.x, c.y)) !== chain);
    if (chainEdges < onCount || cluesOff) changed = g.set(e, false, 'small-loop', a.x, a.y) || changed;
  }
  return changed;
}

// Apply every rule until nothing more follows. Returns false on a contradiction.
function propagate(g: Grid): boolean {
  const { width: w, height: h } = g.level;
  for (let guard = 0; guard < 400; guard++) {
    let changed = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        changed = pointRule(g, x, y) || changed;
        const clue = clueAt(g.level, x, y);
        if (clue === 'stone') changed = stoneRule(g, x, y) || changed;
        if (clue === 'shell') changed = shellRule(g, x, y) || changed;
        if (g.contradiction) return false;
      }
    }
    if (!changed) changed = smallLoopRule(g);
    if (g.contradiction) return false;
    if (!changed) return true;
  }
  return true;
}

export interface LogicResult {
  solved: boolean; // every edge decided by reasoning alone, and the result is the loop
  deductions: Deduction[];
  smallLoopSteps: number; // how often the "no small loop" insight was needed
  whatIfSteps: number; // how often a short "what if this were drawn?" was needed
}

// When the rules alone stall, a person tries one line in their head: if drawing (or not
// drawing) it leads straight to a contradiction, the other choice must be true.
function whatIf(g: Grid): boolean {
  for (let e = 0; e < g.state.length; e++) {
    if (g.state[e] !== UNKNOWN) continue;
    for (const v of [1, 0]) {
      const trial = new Grid(g.level, g.state);
      trial.state[e] = v;
      if (!propagate(trial)) {
        const [a] = edgeEnds(g.level.width, g.level.height, e);
        g.set(e, v === 0, 'what-if', a.x, a.y);
        return true;
      }
    }
  }
  return false;
}

// Pure reasoning from a starting state (default: an empty pool).
export function solveByLogic(level: ShellLevel, start?: Int8Array): LogicResult {
  const g = new Grid(level, start);
  let ok = propagate(g);
  while (ok && g.state.some((v) => v === UNKNOWN) && whatIf(g)) ok = propagate(g);
  const decided = ok && g.state.every((v) => v !== UNKNOWN);
  const on = new Set<number>();
  g.state.forEach((v, e) => v === 1 && on.add(e));
  return {
    solved: decided && isSolved(level, on),
    deductions: g.deductions,
    smallLoopSteps: g.deductions.filter((d) => d.reason === 'small-loop').length,
    whatIfSteps: g.deductions.filter((d) => d.reason === 'what-if').length,
  };
}

// How many loops satisfy the clues, up to `limit` (reasoning, then branching).
export function countSolutions(level: ShellLevel, limit = 2, maxNodes = 20_000): number {
  let found = 0;
  let nodes = 0;
  const search = (state: Int8Array): void => {
    if (found >= limit || nodes++ > maxNodes) return;
    const g = new Grid(level, state);
    if (!propagate(g)) return;
    const open = g.state.findIndex((v) => v === UNKNOWN);
    if (open < 0) {
      const on = new Set<number>();
      g.state.forEach((v, e) => v === 1 && on.add(e));
      if (isSolved(level, on)) found++;
      return;
    }
    for (const v of [1, 0]) {
      const next = g.state.slice();
      next[open] = v;
      search(next);
    }
  };
  search(new Int8Array(edgeCount(level.width, level.height)).fill(UNKNOWN));
  return found;
}
