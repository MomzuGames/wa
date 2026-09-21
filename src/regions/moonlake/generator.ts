import { createRng, type Rng } from '../../core/rng';
import { type PadNode, type RippleLevel, applyPresses, isConnected, isLit, pressCount } from './model';
import { solveRipple } from './solver';

export type PondShape = 'grid' | 'ring' | 'cluster';

export interface RippleParams {
  shape: PondShape;
  size: [number, number]; // grid side, ring count, or cluster node count
  states: 2 | 3;
  wideNodes: [number, number];
  presses: [number, number]; // presses applied from the solved board
  minSolution: number; // reject boards solvable in fewer presses
}

interface Pond {
  nodes: PadNode[];
  edges: Array<[number, number]>;
}

function grid(n: number): Pond {
  const nodes: PadNode[] = [];
  const edges: Array<[number, number]> = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      nodes.push({ x: (x + 0.5) / n, y: (y + 0.5) / n, wide: false });
      if (x > 0) edges.push([y * n + x - 1, y * n + x]);
      if (y > 0) edges.push([(y - 1) * n + x, y * n + x]);
    }
  }
  return { nodes, edges };
}

function ring(rng: Rng, n: number): Pond {
  const nodes: PadNode[] = [];
  const edges: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    nodes.push({ x: 0.5 + Math.cos(a) * 0.42, y: 0.5 + Math.sin(a) * 0.42, wide: false });
    edges.push([i, (i + 1) % n]);
  }
  // A centre pad joined to a few petals, or a couple of chords, keeps rings from being trivial.
  if (rng.chance(0.6)) {
    nodes.push({ x: 0.5, y: 0.5, wide: false });
    for (let i = 0; i < n; i += rng.chance(0.5) ? 1 : 2) edges.push([i, n]);
  } else {
    for (let k = 0; k < rng.int(1, 2); k++) {
      const a = rng.int(0, n - 1);
      const b = (a + Math.floor(n / 2) + rng.int(-1, 1) + n) % n;
      if (a !== b && !edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) edges.push([a, b]);
    }
  }
  return { nodes, edges };
}

function cluster(rng: Rng, count: number): Pond {
  const nodes: PadNode[] = [];
  let guard = 0;
  while (nodes.length < count && guard++ < 2000) {
    const p = { x: 0.1 + rng.next() * 0.8, y: 0.1 + rng.next() * 0.8, wide: false };
    if (nodes.every((n) => Math.hypot(n.x - p.x, n.y - p.y) > 0.17)) nodes.push(p);
  }
  const edges: Array<[number, number]> = [];
  const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const have = new Set<string>();
  nodes.forEach((n, i) => {
    const near = nodes
      .map((m, j) => ({ j, d: Math.hypot(m.x - n.x, m.y - n.y) }))
      .filter((c) => c.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, rng.int(2, 3));
    for (const c of near) {
      if (!have.has(key(i, c.j))) {
        have.add(key(i, c.j));
        edges.push([i, c.j]);
      }
    }
  });
  return { nodes, edges };
}

function build(rng: Rng, params: RippleParams): RippleLevel | null {
  const size = rng.int(params.size[0], params.size[1]);
  const pond = params.shape === 'grid' ? grid(size) : params.shape === 'ring' ? ring(rng, size) : cluster(rng, size);
  if (pond.nodes.length < 3 || !isConnected(pond)) return null;
  const wideCount = rng.int(params.wideNodes[0], params.wideNodes[1]);
  for (const i of rng.shuffle(pond.nodes.map((_, i) => i)).slice(0, wideCount)) pond.nodes[i]!.wide = true;

  const level: RippleLevel = {
    seed: '',
    chapter: 0,
    states: params.states,
    nodes: pond.nodes,
    edges: pond.edges,
    start: pond.nodes.map(() => params.states - 1),
    solution: [],
    difficulty: 0,
  };
  // Scramble by pressing from the solved board; the reverse presses are one solution.
  const count = Math.min(pond.nodes.length, rng.int(params.presses[0], params.presses[1]));
  const presses = pond.nodes.map(() => 0);
  for (const i of rng.shuffle(pond.nodes.map((_, i) => i)).slice(0, count)) presses[i] = rng.int(1, params.states - 1);
  level.start = applyPresses(level, level.start, presses);
  if (isLit(level, level.start)) return null;
  const solved = solveRipple(level, level.start);
  if (!solved.presses) return null;
  if (pressCount(solved.presses) < params.minSolution) return null;
  level.solution = solved.presses;
  level.difficulty = pressCount(solved.presses) * 12 + pond.nodes.length * 2 + (params.states === 3 ? 20 : 0) + wideCount * 8;
  return level;
}

export function generateRippleLevel(seed: string, chapter: number, params: RippleParams): RippleLevel | null {
  const rng = createRng(seed);
  for (let attempt = 0; attempt < 100; attempt++) {
    const level = build(rng, params);
    if (!level) continue;
    level.seed = seed;
    level.chapter = chapter;
    return level;
  }
  return null;
}
