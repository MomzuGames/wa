import { DELTA, DIRS, type Board, type Dir, currentMask, index, opposite, rotateMask, tileAt } from './model';

interface Candidate {
  mask: number;
  rotation: number;
}

type Domains = (Candidate[] | null)[];

export interface SolveResult {
  solution: number[] | null;
  nodes: number;
}

function initialDomains(board: Board): Domains {
  return board.cells.map((tile) => {
    if (!tile) return null;
    if (tile.locked) return [{ mask: currentMask(tile), rotation: tile.rotation }];
    const seen = new Map<number, number>();
    // Start from the current rotation so solutions stay close to what the player has.
    for (let k = 0; k < 4; k++) {
      const rotation = (tile.rotation + k) % 4;
      const mask = rotateMask(tile.mask, rotation);
      if (!seen.has(mask)) seen.set(mask, rotation);
    }
    return [...seen.entries()].map(([mask, rotation]) => ({ mask, rotation }));
  });
}

function neighbourAllows(board: Board, domains: Domains, x: number, y: number, dir: Dir): { yes: boolean; no: boolean } {
  const { dx, dy } = DELTA[dir];
  const nx = x + dx;
  const ny = y + dy;
  if (!tileAt(board, nx, ny)) return { yes: false, no: true };
  const dom = domains[index(board, nx, ny)]!;
  const back = opposite(dir);
  let yes = false;
  let no = false;
  for (const c of dom) {
    if (c.mask & back) yes = true;
    else no = true;
    if (yes && no) break;
  }
  return { yes, no };
}

// Narrows every domain against its neighbours until nothing changes. False on contradiction.
function propagate(board: Board, domains: Domains): boolean {
  let changed = true;
  while (changed) {
    changed = false;
    for (let y = 0; y < board.height; y++) {
      for (let x = 0; x < board.width; x++) {
        const i = index(board, x, y);
        const dom = domains[i];
        if (!dom) continue;
        const allowed: Record<number, { yes: boolean; no: boolean }> = {};
        for (const d of DIRS) allowed[d] = neighbourAllows(board, domains, x, y, d);
        const next = dom.filter((c) => DIRS.every((d) => (c.mask & d ? allowed[d]!.yes : allowed[d]!.no)));
        if (next.length === 0) return false;
        if (next.length !== dom.length) {
          domains[i] = next;
          changed = true;
        }
      }
    }
  }
  return true;
}

function cloneDomains(domains: Domains): Domains {
  return domains.map((d) => (d ? d.slice() : null));
}

export function solve(board: Board, maxNodes = 200_000): SolveResult {
  let nodes = 0;
  const domains = initialDomains(board);
  if (!propagate(board, domains)) return { solution: null, nodes };

  const search = (doms: Domains): Domains | null => {
    nodes++;
    if (nodes > maxNodes) return null;
    let best = -1;
    let bestSize = Infinity;
    for (let i = 0; i < doms.length; i++) {
      const d = doms[i];
      if (d && d.length > 1 && d.length < bestSize) {
        best = i;
        bestSize = d.length;
      }
    }
    if (best === -1) return doms;
    for (const choice of doms[best]!) {
      const next = cloneDomains(doms);
      next[best] = [choice];
      if (propagate(board, next)) {
        const found = search(next);
        if (found) return found;
        if (nodes > maxNodes) return null;
      }
    }
    return null;
  };

  const found = search(domains);
  if (!found) return { solution: null, nodes };
  return { solution: found.map((d) => (d ? d[0]!.rotation : 0)), nodes };
}

// Cells whose rotation is fixed by propagation alone (board edges and locked tiles).
export function forcedCells(board: Board): number[] {
  const domains = initialDomains(board);
  if (!propagate(board, domains)) return [];
  const out: number[] = [];
  domains.forEach((d, i) => {
    if (d && d.length === 1 && !board.cells[i]!.locked) out.push(i);
  });
  return out;
}

export function countSolutions(board: Board, limit = 2, maxNodes = 200_000): number {
  let nodes = 0;
  let found = 0;
  const domains = initialDomains(board);
  if (!propagate(board, domains)) return 0;
  const search = (doms: Domains): void => {
    if (found >= limit || nodes > maxNodes) return;
    nodes++;
    let best = -1;
    let bestSize = Infinity;
    for (let i = 0; i < doms.length; i++) {
      const d = doms[i];
      if (d && d.length > 1 && d.length < bestSize) {
        best = i;
        bestSize = d.length;
      }
    }
    if (best === -1) {
      found++;
      return;
    }
    for (const choice of doms[best]!) {
      const next = cloneDomains(doms);
      next[best] = [choice];
      if (propagate(board, next)) search(next);
      if (found >= limit) return;
    }
  };
  search(domains);
  return found;
}
