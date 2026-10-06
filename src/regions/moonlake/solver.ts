import { type LanternLevel, besides, cellCount, isSolved, isWater, rockCount, sightLines } from './model';

// A solver that reasons the way a person can: it only applies a rule to what is already
// certain, and records why. It proves a lake can be solved by thinking alone (no guessing),
// counts answers (with a little search on top), and gives the hints their reasons.

export type Reason = 'sees' | 'rock' | 'only-light' | 'what-if';

export interface Deduction {
  cell: number;
  on: boolean; // a lantern goes here (or, false, certainly not)
  reason: Reason;
  at: number; // the cell that gave it away: a lantern, a rock or a dark patch
}

const UNKNOWN = -1;

class Board {
  readonly state: Int8Array;
  readonly deductions: Deduction[] = [];
  contradiction = false;

  constructor(
    readonly level: LanternLevel,
    readonly sight: number[][],
    state?: Int8Array,
  ) {
    if (state) this.state = state.slice();
    else {
      this.state = new Int8Array(cellCount(level));
      for (let i = 0; i < this.state.length; i++) this.state[i] = isWater(level, i) ? UNKNOWN : 0;
    }
  }

  set(i: number, on: boolean, reason: Reason, at: number): boolean {
    const v = on ? 1 : 0;
    if (this.state[i] === v) return false;
    if (this.state[i] !== UNKNOWN) {
      this.contradiction = true;
      return false;
    }
    this.state[i] = v;
    this.deductions.push({ cell: i, on, reason, at });
    return true;
  }
}

function propagate(b: Board): boolean {
  const { level, sight, state } = b;
  const n = state.length;
  for (let guard = 0; guard < 500; guard++) {
    let changed = false;
    // A lantern's light: nothing else in its sight may hold a lantern.
    for (let i = 0; i < n; i++) {
      if (state[i] !== 1) continue;
      for (const j of sight[i]!) {
        if (j === i) continue;
        if (state[j] === 1) b.contradiction = true;
        else changed = b.set(j, false, 'sees', i) || changed;
      }
    }
    // Rocks with dots: exactly that many lanterns beside them.
    for (let r = 0; r < n; r++) {
      const want = rockCount(level, r);
      if (want === null) continue;
      const side = besides(level, r).filter((j) => isWater(level, j));
      const have = side.filter((j) => state[j] === 1).length;
      const open = side.filter((j) => state[j] === UNKNOWN);
      if (have > want || have + open.length < want) b.contradiction = true;
      else if (have === want) for (const j of open) changed = b.set(j, false, 'rock', r) || changed;
      else if (have + open.length === want) for (const j of open) changed = b.set(j, true, 'rock', r) || changed;
    }
    // A dark patch with only one place left that could light it.
    for (let c = 0; c < n; c++) {
      if (!isWater(level, c) || sight[c]!.some((j) => state[j] === 1)) continue;
      const sources = sight[c]!.filter((j) => state[j] === UNKNOWN);
      if (sources.length === 0) b.contradiction = true;
      else if (sources.length === 1) changed = b.set(sources[0]!, true, 'only-light', c) || changed;
    }
    if (b.contradiction) return false;
    if (!changed) return true;
  }
  return true;
}

// When the rules stall, a person tries one lantern in their head: if it leads straight to
// a contradiction, the other choice must be true.
function whatIf(b: Board): boolean {
  for (let i = 0; i < b.state.length; i++) {
    if (b.state[i] !== UNKNOWN) continue;
    for (const v of [1, 0]) {
      const trial = new Board(b.level, b.sight, b.state);
      trial.state[i] = v;
      if (!propagate(trial)) {
        b.set(i, v === 0, 'what-if', i);
        return true;
      }
    }
  }
  return false;
}

export interface LogicResult {
  solved: boolean; // every cell decided by reasoning alone, and the result is the answer
  deductions: Deduction[];
  onlyLightSteps: number;
  whatIfSteps: number;
}

export function solveByLogic(level: LanternLevel): LogicResult {
  const b = new Board(level, sightLines(level));
  let ok = propagate(b);
  while (ok && b.state.some((v) => v === UNKNOWN) && whatIf(b)) ok = propagate(b);
  const decided = ok && b.state.every((v) => v !== UNKNOWN);
  const lanterns = new Set<number>();
  b.state.forEach((v, i) => v === 1 && lanterns.add(i));
  return {
    solved: decided && isSolved(level, lanterns),
    deductions: b.deductions,
    onlyLightSteps: b.deductions.filter((d) => d.reason === 'only-light').length,
    whatIfSteps: b.deductions.filter((d) => d.reason === 'what-if').length,
  };
}

// How many ways to place the lanterns satisfy the lake, up to `limit`.
export function countSolutions(level: LanternLevel, limit = 2, maxNodes = 50_000): number {
  const sight = sightLines(level);
  let found = 0;
  let nodes = 0;
  let cut = false;
  const search = (state?: Int8Array): void => {
    if (found >= limit) return;
    if (nodes++ > maxNodes) {
      cut = true;
      return;
    }
    const b = new Board(level, sight, state);
    if (!propagate(b)) return;
    const open = b.state.findIndex((v) => v === UNKNOWN);
    if (open < 0) {
      const lanterns = new Set<number>();
      b.state.forEach((v, i) => v === 1 && lanterns.add(i));
      if (isSolved(level, lanterns)) found++;
      return;
    }
    for (const v of [1, 0]) {
      const next = b.state.slice();
      next[open] = v;
      search(next);
    }
  };
  search();
  // A search cut short proves nothing: treat it as more than one answer.
  return cut ? limit : found;
}
