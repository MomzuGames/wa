// Prism puzzle: emitters shoot coloured beams; rotatable mirrors and splitters steer
// them so every target receives exactly its required colour mix.

export const ROSE = 1;
export const SKY = 2;
export const LEMON = 4;

export type Dir = 0 | 1 | 2 | 3; // N E S W
export const DIR_DELTA: Array<[number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export type PieceKind = 'emitter' | 'mirror' | 'splitter' | 'filter' | 'blocker' | 'target';

export interface PrismPiece {
  kind: PieceKind;
  x: number;
  y: number;
  // Emitters: beam direction. Mirrors/splitters: 0 = '/', 1 = '\'.
  orient: number;
  rotatable: boolean;
  color: number; // emitter beam colour, filter pass colour, or target's required mask
}

export interface PrismLevel {
  seed: string;
  chapter: number;
  handcrafted?: boolean;
  width: number;
  height: number;
  pieces: PrismPiece[];
  solution: number[]; // orient per piece (only rotatable ones matter)
  difficulty: number;
}

export interface Segment {
  x: number;
  y: number;
  dir: Dir;
  color: number;
}

export interface Trace {
  segments: Segment[]; // one per cell a beam passes through, in order
  received: Map<number, number>; // piece index -> mixed colour mask
}

export const ORIENTATIONS: Record<PieceKind, number> = {
  emitter: 4,
  mirror: 2,
  splitter: 2,
  filter: 1,
  blocker: 1,
  target: 1,
};

// '/' (orient 0): E->N, N->E, W->S, S->W.  '\' (orient 1): E->S, S->E, W->N, N->W.
export function reflect(dir: Dir, orient: number): Dir {
  if (orient === 0) return ([1, 0, 3, 2] as Dir[])[dir]!;
  return ([3, 2, 1, 0] as Dir[])[dir]!;
}

export function pieceAt(level: PrismLevel, x: number, y: number): number {
  return level.pieces.findIndex((p) => p.x === x && p.y === y);
}

const MAX_STEPS = 4000;

// Deterministic beam tracing with loop detection. Beams pass through each other.
export function trace(level: PrismLevel, orients: number[]): Trace {
  const segments: Segment[] = [];
  const received = new Map<number, number>();
  const grid = new Map<number, number>();
  level.pieces.forEach((p, i) => grid.set(p.y * level.width + p.x, i));
  const seen = new Set<string>();
  const queue: Segment[] = [];
  level.pieces.forEach((p, i) => {
    if (p.kind !== 'emitter') return;
    const dir = orients[i]! as Dir;
    const [dx, dy] = DIR_DELTA[dir]!;
    queue.push({ x: p.x + dx, y: p.y + dy, dir, color: p.color });
  });
  let steps = 0;
  while (queue.length && steps++ < MAX_STEPS) {
    const seg = queue.shift()!;
    if (seg.x < 0 || seg.y < 0 || seg.x >= level.width || seg.y >= level.height || seg.color === 0) continue;
    const key = `${seg.x},${seg.y},${seg.dir},${seg.color}`;
    if (seen.has(key)) continue;
    seen.add(key);
    segments.push(seg);
    const idx = grid.get(seg.y * level.width + seg.x);
    const advance = (dir: Dir, color: number) => {
      const [dx, dy] = DIR_DELTA[dir]!;
      queue.push({ x: seg.x + dx, y: seg.y + dy, dir, color });
    };
    if (idx === undefined) {
      advance(seg.dir, seg.color);
      continue;
    }
    const piece = level.pieces[idx]!;
    switch (piece.kind) {
      case 'mirror':
        advance(reflect(seg.dir, orients[idx]!), seg.color);
        break;
      case 'splitter':
        advance(seg.dir, seg.color);
        advance(reflect(seg.dir, orients[idx]!), seg.color);
        break;
      case 'filter':
        advance(seg.dir, seg.color & piece.color);
        break;
      case 'target':
        received.set(idx, (received.get(idx) ?? 0) | seg.color);
        break;
      default:
        break; // emitters and blockers absorb
    }
  }
  return { segments, received };
}

export function isSolved(level: PrismLevel, orients: number[]): boolean {
  const t = trace(level, orients);
  return level.pieces.every((p, i) => p.kind !== 'target' || (t.received.get(i) ?? 0) === p.color);
}

export function initialOrients(level: PrismLevel): number[] {
  return level.pieces.map((p) => p.orient);
}

export function isSolutionValid(level: PrismLevel): boolean {
  return isSolved(level, level.solution);
}

// Cells a piece's beam touches, for "is this rotatable piece used" checks.
export function touchedPieces(level: PrismLevel, orients: number[]): Set<number> {
  const t = trace(level, orients);
  const used = new Set<number>();
  for (const s of t.segments) {
    const idx = pieceAt(level, s.x, s.y);
    if (idx >= 0) used.add(idx);
  }
  return used;
}

export const COLOR_NAMES: Record<number, 'rose' | 'sky' | 'lemon' | 'lavender' | 'mint' | 'peach' | 'pearl'> = {
  1: 'rose',
  2: 'sky',
  4: 'lemon',
  3: 'lavender',
  6: 'mint',
  5: 'peach',
  7: 'pearl',
};
