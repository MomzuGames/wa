import { createRng, type Rng } from '../../core/rng';
import {
  type Piece,
  type StoneLevel,
  type Tri,
  canonical,
  fromKey,
  isChiral,
  isConnected,
  normalise,
  triKey,
} from './model';
import { solveStone } from './solver';

export interface StoneParams {
  cells: [number, number]; // silhouette size in whole cells
  pieces: [number, number];
  diagonalCuts: [number, number]; // half-cells shaved off the outline
  diagonalSplits: [number, number]; // full cells split between two pieces
  allowFlip: boolean;
  requireFlip: boolean;
  // A handcrafted silhouette (tri keys on a width x height board) overriding growth.
  silhouette?: { width: number; height: number; keys: number[] };
}

const MIN_PIECE_TRIS = 4;

// Why the last generateStoneLevel call rejected attempts; handy when tuning silhouettes.
export const lastRejections: Record<string, number> = {};
function reject(reason: string): void {
  lastRejections[reason] = (lastRejections[reason] ?? 0) + 1;
}

function growCells(rng: Rng, count: number, width: number, height: number): Set<number> {
  const cells = new Set<number>();
  const start = Math.floor(height / 2) * width + Math.floor(width / 2);
  cells.add(start);
  let guard = 0;
  while (cells.size < count && guard++ < 5000) {
    const from = [...cells][rng.int(0, cells.size - 1)]!;
    const x = from % width;
    const y = Math.floor(from / width);
    const dirs = rng.shuffle([
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]);
    for (const [dx, dy] of dirs) {
      const nx = x + dx!;
      const ny = y + dy!;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const key = ny * width + nx;
      if (!cells.has(key)) {
        cells.add(key);
        break;
      }
    }
  }
  return cells;
}

// Shaves two outer triangles off an edge cell so the outline gains a diagonal.
function cutCorners(rng: Rng, tris: Set<number>, width: number, height: number, cuts: number): void {
  const hasCell = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && tris.has(triKey(width, x, y, 0)) && tris.has(triKey(width, x, y, 1)) && tris.has(triKey(width, x, y, 2)) && tris.has(triKey(width, x, y, 3));
  const candidates: Array<[number, number, number, number]> = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!hasCell(x, y)) continue;
      const n = hasCell(x, y - 1);
      const e = hasCell(x + 1, y);
      const s = hasCell(x, y + 1);
      const w = hasCell(x - 1, y);
      if (!n && !e && s && w) candidates.push([x, y, 0, 1]);
      if (!e && !s && w && n) candidates.push([x, y, 1, 2]);
      if (!s && !w && n && e) candidates.push([x, y, 2, 3]);
      if (!w && !n && e && s) candidates.push([x, y, 3, 0]);
    }
  }
  rng.shuffle(candidates);
  const usedCells = new Set<number>();
  let done = 0;
  for (const [x, y, a, b] of candidates) {
    if (done >= cuts) break;
    const cell = y * width + x;
    if (usedCells.has(cell)) continue;
    usedCells.add(cell);
    tris.delete(triKey(width, x, y, a));
    tris.delete(triKey(width, x, y, b));
    done++;
  }
}

function partition(rng: Rng, width: number, keys: number[], pieceCount: number): number[] | null {
  // Region growing over whole cells first; each cell's triangles follow their cell.
  const cellSet = new Set(keys.map((k) => Math.floor(k / 4)));
  const keySet = new Set(keys);
  const cells = [...cellSet];
  const triCount = new Map<number, number>();
  for (const k of keys) triCount.set(Math.floor(k / 4), (triCount.get(Math.floor(k / 4)) ?? 0) + 1);
  const fullCells = cells.filter((c) => triCount.get(c) === 4);
  if (fullCells.length < pieceCount) return null;
  const owner = new Map<number, number>();
  const seeds: number[] = [];
  // Farthest-first seeds on full cells so pieces spread across the silhouette.
  seeds.push(fullCells[rng.int(0, fullCells.length - 1)]!);
  while (seeds.length < pieceCount) {
    let best = -1;
    let bestD = -1;
    for (const c of fullCells) {
      if (seeds.includes(c)) continue;
      const cx = c % width;
      const cy = Math.floor(c / width);
      let d = Infinity;
      for (const s of seeds) d = Math.min(d, Math.abs(cx - (s % width)) + Math.abs(cy - Math.floor(s / width)));
      const jitter = rng.next() * 0.5;
      if (d + jitter > bestD) {
        bestD = d + jitter;
        best = c;
      }
    }
    seeds.push(best);
  }
  seeds.forEach((s, i) => owner.set(s, i));
  const frontier = seeds.map((s) => [s]);
  const sizes = seeds.map((s) => triCount.get(s)!);
  let remaining = cells.length - seeds.length;
  let guard = 0;
  while (remaining > 0 && guard++ < 10000) {
    // Grow the smallest piece that can still grow, with a little randomness.
    const order = frontier
      .map((edge, i) => ({ i, size: sizes[i]! + rng.next() * 3, alive: edge.length > 0 }))
      .filter((f) => f.alive)
      .sort((a, b) => a.size - b.size);
    if (order.length === 0) break;
    const p = order[0]!.i;
    const edge = frontier[p]!;
    const from = edge[rng.int(0, edge.length - 1)]!;
    const x = from % width;
    const y = Math.floor(from / width);
    // A neighbour only counts if the two cells actually share a triangle edge.
    const has = (cx: number, cy: number, t: number) => keySet.has(triKey(width, cx, cy, t));
    const options = [
      [x + 1, y, 1, 3],
      [x - 1, y, 3, 1],
      [x, y + 1, 2, 0],
      [x, y - 1, 0, 2],
    ]
      .filter(([nx, ny, mine, theirs]) => nx! >= 0 && ny! >= 0 && nx! < width && has(x, y, mine!) && has(nx!, ny!, theirs!))
      .map(([nx, ny]) => ny! * width + nx!)
      .filter((c) => cellSet.has(c) && !owner.has(c));
    if (options.length === 0) {
      edge.splice(edge.indexOf(from), 1);
      continue;
    }
    const pick = options[rng.int(0, options.length - 1)]!;
    owner.set(pick, p);
    sizes[p]! += triCount.get(pick)!;
    edge.push(pick);
    remaining--;
  }
  if (remaining > 0) return null;
  return keys.map((k) => owner.get(Math.floor(k / 4))!);
}

// Splits some full cells along a diagonal between two neighbouring pieces.
function splitDiagonals(rng: Rng, width: number, keys: number[], owner: number[], splits: number): void {
  const index = new Map<number, number>();
  keys.forEach((k, i) => index.set(k, i));
  const cells = [...new Set(keys.map((k) => Math.floor(k / 4)))];
  rng.shuffle(cells);
  let done = 0;
  for (const cell of cells) {
    if (done >= splits) break;
    const x = cell % width;
    const y = Math.floor(cell / width);
    const ids = [0, 1, 2, 3].map((t) => index.get(triKey(width, x, y, t)));
    if (ids.some((i) => i === undefined)) continue;
    const mine = owner[ids[0]!]!;
    // Neighbouring piece across the east or south edge, giving a diagonal split with it.
    const east = index.get(triKey(width, x + 1, y, 3));
    const south = index.get(triKey(width, x, y + 1, 0));
    const target = rng.chance(0.5) ? east : south;
    if (target === undefined || owner[target] === mine) continue;
    const other = owner[target]!;
    // Give the two triangles facing the other piece to it, but only if both pieces stay connected.
    const give = target === east ? [1, rng.chance(0.5) ? 0 : 2] : [2, rng.chance(0.5) ? 1 : 3];
    for (const t of give) owner[ids[t]!] = other;
    const trisOf = (p: number) => keys.filter((_, i) => owner[i] === p).map((k) => fromKey(width, k));
    if (!isConnected(trisOf(mine)) || !isConnected(trisOf(other))) {
      for (const t of give) owner[ids[t]!] = mine;
      continue;
    }
    done++;
  }
}

export function generateStoneLevel(seed: string, chapter: number, params: StoneParams): StoneLevel | null {
  const rng = createRng(seed);
  for (const k of Object.keys(lastRejections)) delete lastRejections[k];
  for (let attempt = 0; attempt < 80; attempt++) {
    let width: number;
    let height: number;
    let tris: Set<number>;
    if (params.silhouette) {
      width = params.silhouette.width;
      height = params.silhouette.height;
      tris = new Set(params.silhouette.keys);
    } else {
      const cellCount = rng.int(params.cells[0], params.cells[1]);
      width = Math.ceil(Math.sqrt(cellCount)) + 2;
      height = width;
      const cells = growCells(rng, cellCount, width, height);
      if (cells.size < cellCount) {
        reject('growth');
        continue;
      }
      tris = new Set();
      for (const c of cells) for (let t = 0; t < 4; t++) tris.add(c * 4 + t);
      cutCorners(rng, tris, width, height, rng.int(params.diagonalCuts[0], params.diagonalCuts[1]));
    }
    const keys = [...tris].sort((a, b) => a - b);
    const pieceCount = rng.int(params.pieces[0], params.pieces[1]);
    const owner = partition(rng, width, keys, pieceCount);
    if (!owner) {
      reject('partition');
      continue;
    }
    splitDiagonals(rng, width, keys, owner, rng.int(params.diagonalSplits[0], params.diagonalSplits[1]));

    const groups: Tri[][] = Array.from({ length: pieceCount }, () => []);
    keys.forEach((k, i) => groups[owner[i]!]!.push(fromKey(width, k)));
    if (groups.some((g) => g.length < MIN_PIECE_TRIS)) {
      reject('tiny piece');
      continue;
    }
    if (groups.some((g) => !isConnected(g))) {
      reject('disconnected');
      continue;
    }

    const pieces: Piece[] = groups.map((g) => {
      let minX = Infinity;
      let minY = Infinity;
      for (const [x, y] of g) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
      }
      return {
        tris: normalise(g),
        solution: { x: minX, y: minY },
        tray: { rot: rng.int(0, 3), flip: params.allowFlip && rng.chance(0.5) ? 1 : 0 },
      };
    });

    // No two pieces may be the same shape.
    const canon = pieces.map((p) => canonical(p.tris, params.allowFlip));
    if (new Set(canon).size !== canon.length) {
      reject('duplicate shape');
      continue;
    }

    if (params.requireFlip) {
      const chiral = pieces.filter((p) => isChiral(p.tris));
      if (chiral.length === 0) {
        reject('no chiral piece');
        continue;
      }
      if (!chiral.some((p) => p.tray.flip === 1)) chiral[rng.int(0, chiral.length - 1)]!.tray.flip = 1;
    }

    // Every piece should start visibly out of place.
    if (pieces.every((p) => p.tray.rot === 0 && p.tray.flip === 0)) {
      reject('unscrambled');
      continue;
    }

    const level: StoneLevel = { seed, chapter, width, height, silhouette: keys, pieces, allowFlip: params.allowFlip, difficulty: 0 };
    const solved = solveStone(level);
    if (!solved.placements) {
      reject('unsolvable');
      continue;
    }
    level.difficulty = solved.nodes + pieces.length * 20 + keys.length;
    return level;
  }
  return null;
}

