// Silhouette puzzle: each grid cell is split by its diagonals into four triangles
// (N, E, S, W). Pieces are connected sets of triangles; they must cover the
// silhouette exactly.

export type Tri = [number, number, number]; // x, y, t (0 N, 1 E, 2 S, 3 W)

export interface Piece {
  tris: Tri[]; // normalised, in solution orientation
  solution: { x: number; y: number };
  tray: { rot: number; flip: number };
}

export interface StoneLevel {
  seed: string;
  chapter: number;
  handcrafted?: boolean;
  width: number;
  height: number;
  silhouette: number[]; // tri keys
  pieces: Piece[];
  allowFlip: boolean;
  difficulty: number;
}

export interface Placement {
  x: number;
  y: number;
  rot: number;
  flip: number;
}

export function triKey(width: number, x: number, y: number, t: number): number {
  return (y * width + x) * 4 + t;
}

export function fromKey(width: number, key: number): Tri {
  const cell = Math.floor(key / 4);
  return [cell % width, Math.floor(cell / width), key % 4];
}

// Rotates a triangle 90 degrees clockwise about the origin (screen coordinates, y down).
export function rotateTri([x, y, t]: Tri): Tri {
  return [0 - y, x, (t + 1) % 4];
}

export function flipTri([x, y, t]: Tri): Tri {
  return [0 - x, y, (4 - t) % 4];
}

export function normalise(tris: Tri[]): Tri[] {
  let minX = Infinity;
  let minY = Infinity;
  for (const [x, y] of tris) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
  }
  return tris.map(([x, y, t]) => [x - minX, y - minY, t] as Tri).sort(compareTri);
}

export function compareTri(a: Tri, b: Tri): number {
  return a[1] - b[1] || a[0] - b[0] || a[2] - b[2];
}

// Applies flip (first) then `rot` clockwise quarter turns, then normalises.
export function transform(tris: Tri[], rot: number, flip: number): Tri[] {
  let out = flip ? tris.map(flipTri) : tris.slice();
  for (let k = 0; k < ((rot % 4) + 4) % 4; k++) out = out.map(rotateTri);
  return normalise(out);
}

export function shapeKey(tris: Tri[]): string {
  return normalise(tris)
    .map((t) => t.join(','))
    .join(';');
}

// The smallest key over every orientation (and flips when allowed).
export function canonical(tris: Tri[], allowFlip: boolean): string {
  let best = '';
  for (let flip = 0; flip <= (allowFlip ? 1 : 0); flip++) {
    for (let rot = 0; rot < 4; rot++) {
      const key = shapeKey(transform(tris, rot, flip));
      if (!best || key < best) best = key;
    }
  }
  return best;
}

export function isChiral(tris: Tri[]): boolean {
  return canonical(tris, false) !== canonical(tris.map(flipTri), false);
}

// Distinct orientations of a shape, so the solver never tries the same placement twice.
export function distinctOrientations(tris: Tri[], allowFlip: boolean): Array<{ rot: number; flip: number; tris: Tri[] }> {
  const seen = new Map<string, { rot: number; flip: number; tris: Tri[] }>();
  for (let flip = 0; flip <= (allowFlip ? 1 : 0); flip++) {
    for (let rot = 0; rot < 4; rot++) {
      const shaped = transform(tris, rot, flip);
      const key = shapeKey(shaped);
      if (!seen.has(key)) seen.set(key, { rot, flip, tris: shaped });
    }
  }
  return [...seen.values()];
}

// Edge neighbours of a triangle: the two beside it in the same cell and the one across the cell edge.
export function neighbours([x, y, t]: Tri): Tri[] {
  const out: Tri[] = [
    [x, y, (t + 1) % 4],
    [x, y, (t + 3) % 4],
  ];
  switch (t) {
    case 0:
      out.push([x, y - 1, 2]);
      break;
    case 1:
      out.push([x + 1, y, 3]);
      break;
    case 2:
      out.push([x, y + 1, 0]);
      break;
    default:
      out.push([x - 1, y, 1]);
  }
  return out;
}

export function isConnected(tris: Tri[]): boolean {
  if (tris.length === 0) return false;
  const set = new Set(tris.map((t) => t.join(',')));
  const seen = new Set<string>([tris[0]!.join(',')]);
  const stack: Tri[] = [tris[0]!];
  while (stack.length) {
    const tri = stack.pop()!;
    for (const n of neighbours(tri)) {
      const key = n.join(',');
      if (set.has(key) && !seen.has(key)) {
        seen.add(key);
        stack.push(n);
      }
    }
  }
  return seen.size === set.size;
}

// Keys covered by a piece at a placement, or null if any triangle falls outside the board.
export function placedKeys(level: StoneLevel, piece: Piece, placement: Placement): number[] | null {
  const shaped = transform(piece.tris, placement.rot, placement.flip);
  const keys: number[] = [];
  for (const [x, y, t] of shaped) {
    const px = x + placement.x;
    const py = y + placement.y;
    if (px < 0 || py < 0 || px >= level.width || py >= level.height) return null;
    keys.push(triKey(level.width, px, py, t));
  }
  return keys;
}

export function isSolutionValid(level: StoneLevel): boolean {
  const covered = new Set<number>();
  for (const piece of level.pieces) {
    const keys = placedKeys(level, piece, { ...piece.solution, rot: 0, flip: 0 });
    if (!keys) return false;
    for (const k of keys) {
      if (covered.has(k)) return false;
      covered.add(k);
    }
  }
  const target = new Set(level.silhouette);
  if (covered.size !== target.size) return false;
  for (const k of covered) if (!target.has(k)) return false;
  return true;
}

// Whether a set of placements (piece index -> placement) exactly covers the silhouette.
export function isCover(level: StoneLevel, placements: Map<number, Placement>): boolean {
  if (placements.size !== level.pieces.length) return false;
  const covered = new Set<number>();
  for (const [i, placement] of placements) {
    const keys = placedKeys(level, level.pieces[i]!, placement);
    if (!keys) return false;
    for (const k of keys) {
      if (covered.has(k)) return false;
      covered.add(k);
    }
  }
  const target = new Set(level.silhouette);
  return covered.size === target.size && [...covered].every((k) => target.has(k));
}

// Screen-space corners of a triangle inside a unit cell at (x, y).
export function triCorners([x, y, t]: Tri): Array<[number, number]> {
  const cx = x + 0.5;
  const cy = y + 0.5;
  switch (t) {
    case 0:
      return [[x, y], [x + 1, y], [cx, cy]];
    case 1:
      return [[x + 1, y], [x + 1, y + 1], [cx, cy]];
    case 2:
      return [[x + 1, y + 1], [x, y + 1], [cx, cy]];
    default:
      return [[x, y + 1], [x, y], [cx, cy]];
  }
}
