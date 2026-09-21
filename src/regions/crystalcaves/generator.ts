import { createRng, type Rng } from '../../core/rng';
import { type Dir, ORIENTATIONS, type PrismLevel, type PrismPiece, isSolved, touchedPieces, trace } from './model';
import { solvePrism } from './solver';

export interface PrismParams {
  size: [number, number];
  emitters: [number, number];
  mirrors: [number, number];
  splitters: [number, number];
  filters: [number, number];
  blockers: [number, number];
  targets: [number, number];
  colors: number[]; // emitter colours to draw from
  requireMix: boolean;
}

function popcount(n: number): number {
  return (n & 1) + ((n >> 1) & 1) + ((n >> 2) & 1);
}

function borderEmitter(rng: Rng, w: number, h: number, taken: Set<number>): { x: number; y: number; dir: Dir } | null {
  for (let tries = 0; tries < 40; tries++) {
    const side = rng.int(0, 3) as Dir;
    let x = 0;
    let y = 0;
    let dir: Dir = 0;
    if (side === 0) {
      x = rng.int(1, w - 2);
      y = 0;
      dir = 2;
    } else if (side === 1) {
      x = w - 1;
      y = rng.int(1, h - 2);
      dir = 3;
    } else if (side === 2) {
      x = rng.int(1, w - 2);
      y = h - 1;
      dir = 0;
    } else {
      x = 0;
      y = rng.int(1, h - 2);
      dir = 1;
    }
    if (!taken.has(y * w + x)) return { x, y, dir };
  }
  return null;
}

function build(rng: Rng, params: PrismParams): PrismLevel | null {
  const w = rng.int(params.size[0], params.size[1]);
  const h = w;
  const taken = new Set<number>();
  const pieces: PrismPiece[] = [];
  const claim = (x: number, y: number) => taken.add(y * w + x);

  const emitterCount = rng.int(params.emitters[0], params.emitters[1]);
  for (let i = 0; i < emitterCount; i++) {
    const spot = borderEmitter(rng, w, h, taken);
    if (!spot) return null;
    claim(spot.x, spot.y);
    pieces.push({ kind: 'emitter', x: spot.x, y: spot.y, orient: spot.dir, rotatable: false, color: params.colors[i % params.colors.length]! });
  }

  const interior = (): { x: number; y: number } | null => {
    for (let tries = 0; tries < 60; tries++) {
      const x = rng.int(1, w - 2);
      const y = rng.int(1, h - 2);
      if (!taken.has(y * w + x)) return { x, y };
    }
    return null;
  };
  const add = (kind: PrismPiece['kind'], count: number, rotatable: boolean, color = 0) => {
    for (let i = 0; i < count; i++) {
      const spot = interior();
      if (!spot) return false;
      claim(spot.x, spot.y);
      pieces.push({ kind, x: spot.x, y: spot.y, orient: rng.int(0, ORIENTATIONS[kind] - 1), rotatable, color: color || pieceColor(rng, params) });
    }
    return true;
  };
  if (!add('mirror', rng.int(params.mirrors[0], params.mirrors[1]), true)) return null;
  if (!add('splitter', rng.int(params.splitters[0], params.splitters[1]), true)) return null;
  if (!add('filter', rng.int(params.filters[0], params.filters[1]), false)) return null;
  if (!add('blocker', rng.int(params.blockers[0], params.blockers[1]), false)) return null;

  const level: PrismLevel = { seed: '', chapter: 0, width: w, height: h, pieces, solution: [], difficulty: 0 };
  const solution = pieces.map((p) => p.orient);

  // Targets sit on cells the solved beams pass through; each absorbs its beam, so re-trace after every one.
  const targetCount = rng.int(params.targets[0], params.targets[1]);
  for (let t = 0; t < targetCount; t++) {
    const tr = trace(level, solution);
    const byCell = new Map<number, { x: number; y: number; color: number; dist: number }>();
    tr.segments.forEach((s, order) => {
      const key = s.y * w + s.x;
      if (taken.has(key)) return;
      const entry = byCell.get(key) ?? { x: s.x, y: s.y, color: 0, dist: order };
      entry.color |= s.color;
      byCell.set(key, entry);
    });
    let candidates = [...byCell.values()];
    if (candidates.length === 0) return null;
    if (params.requireMix && t === 0) {
      const mixed = candidates.filter((c) => popcount(c.color) >= 2);
      if (mixed.length === 0) return null;
      candidates = mixed;
    }
    // Prefer cells further along the beams so the path matters.
    candidates.sort((a, b) => b.dist - a.dist);
    const pick = candidates[rng.int(0, Math.min(candidates.length - 1, 3))]!;
    claim(pick.x, pick.y);
    pieces.push({ kind: 'target', x: pick.x, y: pick.y, orient: 0, rotatable: false, color: pick.color });
    solution.push(0);
  }

  // Final required colours come from the finished solution trace.
  const finalTrace = trace(level, solution);
  pieces.forEach((p, i) => {
    if (p.kind === 'target') p.color = finalTrace.received.get(i) ?? 0;
  });
  if (pieces.some((p) => p.kind === 'target' && p.color === 0)) return null;
  if (params.requireMix && !pieces.some((p) => p.kind === 'target' && popcount(p.color) >= 2)) return null;

  // Rotatable pieces no beam touches would be red herrings: drop them (they change nothing).
  const used = touchedPieces(level, solution);
  for (let i = pieces.length - 1; i >= 0; i--) {
    if (pieces[i]!.rotatable && !used.has(i)) {
      pieces.splice(i, 1);
      solution.splice(i, 1);
    }
  }
  if (pieces.filter((p) => p.rotatable).length < params.mirrors[0]) return null;

  // Scramble rotatable pieces; most must differ from the solution.
  let changed = 0;
  let rotatableCount = 0;
  pieces.forEach((p, i) => {
    if (!p.rotatable) return;
    rotatableCount++;
    const count = ORIENTATIONS[p.kind];
    if (rng.chance(0.8)) {
      p.orient = (solution[i]! + rng.int(1, count - 1)) % count;
      changed++;
    }
  });
  if (rotatableCount === 0 || changed / rotatableCount < 0.6) return null;
  level.solution = solution;
  if (isSolved(level, pieces.map((p) => p.orient))) return null;
  return level;
}

function pieceColor(rng: Rng, params: PrismParams): number {
  return params.colors[rng.int(0, params.colors.length - 1)]!;
}

export function generatePrismLevel(seed: string, chapter: number, params: PrismParams): PrismLevel | null {
  const rng = createRng(seed);
  for (let attempt = 0; attempt < 120; attempt++) {
    const level = build(rng, params);
    if (!level) continue;
    level.seed = seed;
    level.chapter = chapter;
    const solved = solvePrism(level, level.pieces.map((p) => p.orient));
    if (!solved.orients) continue;
    const rotatable = level.pieces.filter((p) => p.rotatable).length;
    const targets = level.pieces.filter((p) => p.kind === 'target').length;
    level.difficulty = solved.nodes + rotatable * 6 + targets * 4 + level.width;
    return level;
  }
  return null;
}
