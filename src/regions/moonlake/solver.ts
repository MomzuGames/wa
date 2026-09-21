import { type RippleLevel, affectLists, pressCount } from './model';

export interface RippleSolveResult {
  presses: number[] | null; // minimum presses per node from the given state
  nodes: number; // work done: rows reduced plus free-variable combinations tried
}

function modInverse(a: number, p: number): number {
  for (let x = 1; x < p; x++) if ((a * x) % p === 1) return x;
  return 1;
}

// Solves A x = b over GF(p) (p = 2 or 3) with Gaussian elimination, then searches the
// null space for the fewest total presses. Returns null when the state is unreachable.
export function solveRipple(level: RippleLevel, state: number[], maxCombos = 20_000): RippleSolveResult {
  const p = level.states;
  const n = level.nodes.length;
  const affects = affectLists(level);
  // rows: one equation per pad; columns: one variable per press site, plus the constant.
  const rows: number[][] = level.nodes.map((_, i) => {
    const row = new Array<number>(n + 1).fill(0);
    affects.forEach((list, j) => {
      if (list.includes(i)) row[j] = 1;
    });
    row[n] = (((p - 1 - state[i]!) % p) + p) % p;
    return row;
  });

  let nodes = 0;
  const pivotCol: number[] = [];
  let r = 0;
  for (let c = 0; c < n && r < n; c++) {
    let pivot = -1;
    for (let i = r; i < n; i++) {
      if (rows[i]![c]! % p !== 0) {
        pivot = i;
        break;
      }
    }
    if (pivot < 0) continue;
    [rows[r], rows[pivot]] = [rows[pivot]!, rows[r]!];
    const inv = modInverse(rows[r]![c]!, p);
    for (let k = 0; k <= n; k++) rows[r]![k] = (rows[r]![k]! * inv) % p;
    for (let i = 0; i < n; i++) {
      if (i === r || rows[i]![c] === 0) continue;
      const f = rows[i]![c]!;
      for (let k = 0; k <= n; k++) rows[i]![k] = (((rows[i]![k]! - f * rows[r]![k]!) % p) + p) % p;
      nodes++;
    }
    pivotCol.push(c);
    r++;
  }
  // Inconsistent system: a zero row with a non-zero constant.
  for (let i = r; i < n; i++) if (rows[i]![n]! % p !== 0) return { presses: null, nodes };

  const free: number[] = [];
  for (let c = 0; c < n; c++) if (!pivotCol.includes(c)) free.push(c);
  const combos = Math.pow(p, free.length);
  let best: number[] | null = null;
  const limit = Math.min(combos, maxCombos);
  for (let combo = 0; combo < limit; combo++) {
    nodes++;
    const x = new Array<number>(n).fill(0);
    let rest = combo;
    for (const c of free) {
      x[c] = rest % p;
      rest = Math.floor(rest / p);
    }
    pivotCol.forEach((c, i) => {
      let v = rows[i]![n]!;
      for (const f of free) v -= rows[i]![f]! * x[f]!;
      x[c] = ((v % p) + p) % p;
    });
    if (!best || pressCount(x) < pressCount(best)) best = x;
  }
  return { presses: best, nodes };
}
