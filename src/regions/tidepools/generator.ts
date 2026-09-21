import { createRng, type Rng } from '../../core/rng';
import { DELTA, DIRS, type Board, type Dir, type LoopLevel, type Tile, distinctRotations, isSolved } from './model';
import { forcedCells, solve } from './solver';

export interface LoopParams {
  width: number;
  height: number;
  irregular: boolean;
  loopiness: number;
  components: number;
  lockedFraction: number;
  // Pairs of tiles that turn together.
  links?: number;
  // A handcrafted silhouette of present cells (row-major), overriding `irregular`.
  present?: boolean[];
}

export const MAX_BLANK_FRACTION = 0.2;
const MIN_COMPONENT_SIZE = 4;
const MIN_SCRAMBLED_FRACTION = 0.6;

function carveShape(rng: Rng, width: number, height: number): boolean[] {
  const present = new Array<boolean>(width * height).fill(true);
  const bites = rng.int(2, 4);
  for (let b = 0; b < bites; b++) {
    const cornerX = rng.chance(0.5) ? 0 : width - 1;
    const cornerY = rng.chance(0.5) ? 0 : height - 1;
    const size = rng.int(1, Math.max(1, Math.floor(Math.min(width, height) / 3)));
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size - dy; dx++) {
        const x = cornerX === 0 ? dx : cornerX - dx;
        const y = cornerY === 0 ? dy : cornerY - dy;
        present[y * width + x] = false;
      }
    }
  }
  return present;
}

function isConnected(present: boolean[], width: number, height: number): boolean {
  const start = present.indexOf(true);
  if (start < 0) return false;
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % width;
    const y = Math.floor(i / width);
    for (const d of DIRS) {
      const nx = x + DELTA[d].dx;
      const ny = y + DELTA[d].dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (present[ni] && !seen.has(ni)) {
        seen.add(ni);
        stack.push(ni);
      }
    }
  }
  return seen.size === present.filter(Boolean).length;
}

interface Attempt {
  cells: (Tile | null)[];
  solvedMasks: number[];
  links: Array<[number, number]>;
}

function buildAttempt(rng: Rng, params: LoopParams): Attempt | null {
  const { width, height } = params;
  const present = params.present ?? (params.irregular ? carveShape(rng, width, height) : new Array<boolean>(width * height).fill(true));
  if (!isConnected(present, width, height)) return null;

  const cellIndices = present.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
  const component = new Array<number>(width * height).fill(-1);
  const edges = new Set<string>();
  const edgeKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

  // Multi-source randomised Prim: a spanning forest with one tree per component.
  const roots = rng.shuffle(cellIndices.slice()).slice(0, params.components);
  const frontier: Array<{ from: number; to: number }> = [];
  const pushFrontier = (i: number) => {
    const x = i % width;
    const y = Math.floor(i / width);
    for (const d of DIRS) {
      const nx = x + DELTA[d].dx;
      const ny = y + DELTA[d].dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (present[ni] && component[ni] === -1) frontier.push({ from: i, to: ni });
    }
  };
  roots.forEach((r, k) => {
    component[r] = k;
    pushFrontier(r);
  });
  while (frontier.length) {
    const pick = rng.int(0, frontier.length - 1);
    const edge = frontier[pick]!;
    frontier[pick] = frontier[frontier.length - 1]!;
    frontier.pop();
    if (component[edge.to] !== -1) continue;
    component[edge.to] = component[edge.from]!;
    edges.add(edgeKey(edge.from, edge.to));
    pushFrontier(edge.to);
  }

  const sizes = new Array<number>(params.components).fill(0);
  for (const i of cellIndices) sizes[component[i]!]++;
  if (sizes.some((s) => s < MIN_COMPONENT_SIZE)) return null;

  // Extra edges within a component create loops.
  for (const i of cellIndices) {
    const x = i % width;
    const y = Math.floor(i / width);
    for (const d of [DIRS[1], DIRS[2]] as Dir[]) {
      const nx = x + DELTA[d].dx;
      const ny = y + DELTA[d].dy;
      if (nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (!present[ni] || component[ni] !== component[i]) continue;
      if (rng.chance(params.loopiness)) edges.add(edgeKey(i, ni));
    }
  }

  const solvedMasks = new Array<number>(width * height).fill(0);
  for (const i of cellIndices) {
    const x = i % width;
    const y = Math.floor(i / width);
    for (const d of DIRS) {
      const nx = x + DELTA[d].dx;
      const ny = y + DELTA[d].dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (edges.has(edgeKey(i, ni))) solvedMasks[i] |= d;
    }
  }

  const blanks = cellIndices.filter((i) => solvedMasks[i] === 0).length;
  if (blanks / cellIndices.length > MAX_BLANK_FRACTION) return null;

  const cells: (Tile | null)[] = solvedMasks.map((mask, i) => (present[i] ? { mask, rotation: 0, locked: false } : null));

  // Scramble: every non-symmetric tile gets a rotation that changes its look.
  let scrambled = 0;
  let scramblable = 0;
  for (const i of cellIndices) {
    const tile = cells[i]!;
    const distinct = distinctRotations(tile.mask);
    if (distinct === 1) continue;
    scramblable++;
    if (rng.chance(0.85)) {
      tile.rotation = rng.int(1, 3);
      scrambled++;
    }
  }
  if (scramblable === 0 || scrambled / scramblable < MIN_SCRAMBLED_FRACTION) return null;

  // Locked tiles sit in their solved orientation from the start.
  const lockCount = Math.round(cellIndices.length * params.lockedFraction);
  for (const i of rng.shuffle(cellIndices.slice()).slice(0, lockCount)) {
    cells[i]!.rotation = 0;
    cells[i]!.locked = true;
  }

  // Linked pairs: two unlocked, asymmetric tiles that start at the same rotation and turn together.
  const links: Array<[number, number]> = [];
  const linkable = rng.shuffle(cellIndices.filter((i) => !cells[i]!.locked && distinctRotations(cells[i]!.mask) === 4));
  for (let k = 0; k < (params.links ?? 0) && linkable.length >= 2; k++) {
    const a = linkable.pop()!;
    const b = linkable.pop()!;
    cells[b]!.rotation = cells[a]!.rotation;
    links.push([a, b]);
  }

  return { cells, solvedMasks, links };
}

export function generateLoopLevel(seed: string, chapter: number, params: LoopParams): LoopLevel | null {
  const rng = createRng(seed);
  for (let attempt = 0; attempt < 60; attempt++) {
    const built = buildAttempt(rng, params);
    if (!built) continue;
    const board: Board = { width: params.width, height: params.height, cells: built.cells, links: built.links };
    if (isSolved(board)) continue;
    const result = solve(board);
    if (!result.solution) continue;
    const tiles = built.cells.filter((c) => c && c.mask !== 0).length;
    const undetermined = tiles - forcedCells(board).length;
    return {
      seed,
      chapter,
      width: params.width,
      height: params.height,
      cells: built.cells,
      links: built.links,
      solution: built.cells.map(() => 0),
      difficulty: result.nodes * 10 + tiles + undetermined * 3 + built.links.length * 12,
    };
  }
  return null;
}
