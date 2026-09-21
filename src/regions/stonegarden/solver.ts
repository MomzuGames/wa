import { type Placement, type StoneLevel, distinctOrientations, placedKeys } from './model';

interface Option {
  piece: number;
  placement: Placement;
  keys: number[];
}

export interface StoneSolveResult {
  placements: Map<number, Placement> | null;
  nodes: number;
}

function buildOptions(level: StoneLevel, fixed: Map<number, Placement>): Option[] | null {
  const target = new Set(level.silhouette);
  const options: Option[] = [];
  level.pieces.forEach((piece, i) => {
    if (fixed.has(i)) return;
    for (const orientation of distinctOrientations(piece.tris, level.allowFlip)) {
      for (let y = 0; y < level.height; y++) {
        for (let x = 0; x < level.width; x++) {
          const placement = { x, y, rot: orientation.rot, flip: orientation.flip };
          const keys = placedKeys(level, piece, placement);
          if (!keys || !keys.every((k) => target.has(k))) continue;
          options.push({ piece: i, placement, keys });
        }
      }
    }
  });
  return options;
}

// Exact cover (Algorithm X): every silhouette triangle and every piece must be used exactly once.
// `fixed` pins pieces the player has already placed, so clues follow the current state.
export function solveStone(level: StoneLevel, placed: Map<number, Placement> = new Map(), maxNodes = 300_000): StoneSolveResult {
  let nodes = 0;
  const fixed = new Map(placed);
  level.pieces.forEach((p, i) => {
    if (p.fixed && !fixed.has(i)) fixed.set(i, { ...p.solution, rot: 0, flip: 0 });
  });
  const covered = new Set<number>();
  for (const [i, placement] of fixed) {
    const keys = placedKeys(level, level.pieces[i]!, placement);
    if (!keys) return { placements: null, nodes };
    for (const k of keys) {
      if (covered.has(k) || !level.silhouette.includes(k)) return { placements: null, nodes };
      covered.add(k);
    }
  }
  const remainingTris = new Set(level.silhouette.filter((k) => !covered.has(k)));
  const remainingPieces = new Set(level.pieces.map((_, i) => i).filter((i) => !fixed.has(i)));
  const all = buildOptions(level, fixed);
  if (!all) return { placements: null, nodes };
  const chosen = new Map<number, Placement>(fixed);

  const search = (options: Option[], tris: Set<number>, pieces: Set<number>): boolean => {
    nodes++;
    if (nodes > maxNodes) return false;
    if (tris.size === 0 && pieces.size === 0) return true;
    // Pick the most constrained item: a triangle or a piece with the fewest options.
    let bestItem: { kind: 'tri' | 'piece'; id: number } | null = null;
    let bestCount = Infinity;
    for (const k of tris) {
      let n = 0;
      for (const o of options) if (o.keys.includes(k)) n++;
      if (n < bestCount) {
        bestCount = n;
        bestItem = { kind: 'tri', id: k };
        if (n === 0) return false;
      }
    }
    for (const p of pieces) {
      let n = 0;
      for (const o of options) if (o.piece === p) n++;
      if (n < bestCount) {
        bestCount = n;
        bestItem = { kind: 'piece', id: p };
        if (n === 0) return false;
      }
    }
    if (!bestItem) return false;
    const candidates = options.filter((o) => (bestItem!.kind === 'tri' ? o.keys.includes(bestItem!.id) : o.piece === bestItem!.id));
    for (const c of candidates) {
      const cKeys = new Set(c.keys);
      const nextOptions = options.filter((o) => o.piece !== c.piece && !o.keys.some((k) => cKeys.has(k)));
      const nextTris = new Set([...tris].filter((k) => !cKeys.has(k)));
      const nextPieces = new Set([...pieces].filter((p) => p !== c.piece));
      chosen.set(c.piece, c.placement);
      if (search(nextOptions, nextTris, nextPieces)) return true;
      chosen.delete(c.piece);
      if (nodes > maxNodes) return false;
    }
    return false;
  };

  const ok = search(all, remainingTris, remainingPieces);
  return { placements: ok ? chosen : null, nodes };
}
