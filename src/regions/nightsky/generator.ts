import { createRng, type Rng } from '../../core/rng';
import {
  MIN_STAR_LINE_CLEARANCE,
  type Edge,
  type SkyLevel,
  type Star,
  crossingCount,
  minStarLineClearance,
  pointSegmentDistance,
  segmentsCross,
} from './model';
import { solveLevel, validStarts } from './solver';

export interface SkyParams {
  stars: [number, number];
  edges: [number, number];
  crossings: [number, number];
  closed: boolean; // prefer a closed walk (any start works)
  oneWayFraction: number;
  doubleEdges: number;
  drift: boolean;
}

const NEIGHBOUR_RADIUS = 0.42;
const MAX_NEIGHBOURS = 6;

// Bridson's Poisson-disk sampling inside the unit square.
export function poissonDisk(rng: Rng, radius: number, limit: number): Star[] {
  const cell = radius / Math.SQRT2;
  const cols = Math.ceil(1 / cell);
  const grid = new Array<number>(cols * cols).fill(-1);
  const points: Star[] = [];
  const active: number[] = [];
  const insert = (p: Star) => {
    points.push(p);
    grid[Math.floor(p.y / cell) * cols + Math.floor(p.x / cell)] = points.length - 1;
    active.push(points.length - 1);
  };
  insert({ x: 0.3 + rng.next() * 0.4, y: 0.3 + rng.next() * 0.4 });
  while (active.length && points.length < limit) {
    const idx = rng.int(0, active.length - 1);
    const p = points[active[idx]!]!;
    let placed = false;
    for (let k = 0; k < 20; k++) {
      const angle = rng.next() * Math.PI * 2;
      const dist = radius * (1 + rng.next());
      const q = { x: p.x + Math.cos(angle) * dist, y: p.y + Math.sin(angle) * dist };
      if (q.x < 0.04 || q.y < 0.04 || q.x > 0.96 || q.y > 0.96) continue;
      const gx = Math.floor(q.x / cell);
      const gy = Math.floor(q.y / cell);
      let ok = true;
      for (let y = Math.max(0, gy - 2); y <= Math.min(cols - 1, gy + 2) && ok; y++) {
        for (let x = Math.max(0, gx - 2); x <= Math.min(cols - 1, gx + 2); x++) {
          const other = grid[y * cols + x]!;
          if (other >= 0 && Math.hypot(points[other]!.x - q.x, points[other]!.y - q.y) < radius) {
            ok = false;
            break;
          }
        }
      }
      if (!ok) continue;
      insert(q);
      placed = true;
      break;
    }
    if (!placed) {
      active[idx] = active[active.length - 1]!;
      active.pop();
    }
  }
  return points;
}

function clearanceOk(stars: Star[], a: number, b: number): boolean {
  for (let i = 0; i < stars.length; i++) {
    if (i === a || i === b) continue;
    if (pointSegmentDistance(stars[i]!, stars[a]!, stars[b]!) < MIN_STAR_LINE_CLEARANCE) return false;
  }
  return true;
}

function crossesExisting(stars: Star[], edges: Edge[], a: number, b: number): number {
  let n = 0;
  for (const e of edges) {
    if (e.a === a || e.a === b || e.b === a || e.b === b) continue;
    if (segmentsCross(stars[a]!, stars[b]!, stars[e.a]!, stars[e.b]!)) n++;
  }
  return n;
}

interface Walk {
  stars: Star[];
  edges: Edge[];
  sequence: number[];
}

function buildWalk(rng: Rng, params: SkyParams): Walk | null {
  const starTarget = rng.int(params.stars[0], params.stars[1]);
  const radius = 0.9 / Math.sqrt(starTarget) * 0.8;
  const stars = poissonDisk(rng, radius, starTarget);
  if (stars.length < params.stars[0]) return null;

  const edgeTarget = rng.int(params.edges[0], params.edges[1]);
  const edges: Edge[] = [];
  const findEdge = (a: number, b: number) => edges.findIndex((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  const sequence = [rng.int(0, stars.length - 1)];
  let crossings = 0;
  let doubles = 0;

  while (edges.reduce((n, e) => n + e.required, 0) < edgeTarget) {
    const from = sequence[sequence.length - 1]!;
    const candidates = stars
      .map((s, i) => ({ i, d: Math.hypot(s.x - stars[from]!.x, s.y - stars[from]!.y) }))
      .filter((c) => c.i !== from && c.d < NEIGHBOUR_RADIUS)
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX_NEIGHBOURS)
      .map((c) => c.i);
    rng.shuffle(candidates);

    // Closing the loop early is fine only once we have enough edges.
    let chosen = -1;
    for (const to of candidates) {
      const existing = findEdge(from, to);
      if (existing >= 0) {
        const e = edges[existing]!;
        if (e.required === 2 || doubles >= params.doubleEdges) continue;
        e.required = 2;
        doubles++;
        chosen = to;
        break;
      }
      if (!clearanceOk(stars, from, to)) continue;
      const newCrossings = crossesExisting(stars, edges, from, to);
      if (crossings + newCrossings > params.crossings[1]) continue;
      crossings += newCrossings;
      edges.push({ a: from, b: to, required: 1, oneWay: false });
      chosen = to;
      break;
    }
    if (chosen < 0) break;
    sequence.push(chosen);
  }

  const total = edges.reduce((n, e) => n + e.required, 0);
  if (total < params.edges[0]) return null;
  if (crossings < params.crossings[0]) return null;
  if (params.closed && sequence[0] !== sequence[sequence.length - 1]) {
    // Try to close: one more edge back to the start if it is legal.
    const from = sequence[sequence.length - 1]!;
    const start = sequence[0]!;
    if (findEdge(from, start) >= 0 || !clearanceOk(stars, from, start)) return null;
    if (Math.hypot(stars[from]!.x - stars[start]!.x, stars[from]!.y - stars[start]!.y) > NEIGHBOUR_RADIUS) return null;
    if (crossings + crossesExisting(stars, edges, from, start) > params.crossings[1]) return null;
    edges.push({ a: from, b: start, required: 1, oneWay: false });
    sequence.push(start);
  }

  // One-way edges follow the walk's direction, so the walk stays a valid solution.
  if (params.oneWayFraction > 0) {
    for (let i = 1; i < sequence.length; i++) {
      const a = sequence[i - 1]!;
      const b = sequence[i]!;
      const idx = findEdge(a, b);
      const e = edges[idx]!;
      if (e.required !== 1 || !rng.chance(params.oneWayFraction)) continue;
      edges[idx] = { a, b, required: 1, oneWay: true };
    }
  }

  // Drop stars that ended up unused so the sky is not littered with dead points.
  const used = new Set(sequence);
  const remap = new Map<number, number>();
  const kept: Star[] = [];
  stars.forEach((s, i) => {
    if (used.has(i)) {
      remap.set(i, kept.length);
      kept.push(s);
    }
  });
  return {
    stars: kept,
    edges: edges.map((e) => ({ ...e, a: remap.get(e.a)!, b: remap.get(e.b)! })),
    sequence: sequence.map((i) => remap.get(i)!),
  };
}

// Re-centres and scales the figure to fill the unit square with a margin.
function normalise(stars: Star[]): Star[] {
  const xs = stars.map((s) => s.x);
  const ys = stars.map((s) => s.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 0.2);
  const margin = 0.08;
  const scale = (1 - margin * 2) / span;
  const offX = (1 - (maxX - minX) * scale) / 2;
  const offY = (1 - (maxY - minY) * scale) / 2;
  return stars.map((s) => ({ x: offX + (s.x - minX) * scale, y: offY + (s.y - minY) * scale }));
}

export function generateSkyLevel(seed: string, chapter: number, params: SkyParams): SkyLevel | null {
  const rng = createRng(seed);
  for (let attempt = 0; attempt < 80; attempt++) {
    const walk = buildWalk(rng, params);
    if (!walk) continue;
    const level: SkyLevel = {
      seed,
      chapter,
      stars: normalise(walk.stars),
      edges: walk.edges,
      solution: walk.sequence,
      drift: params.drift,
      difficulty: 0,
    };
    if (minStarLineClearance(level) < MIN_STAR_LINE_CLEARANCE) continue;
    const crossings = crossingCount(level);
    if (crossings < params.crossings[0] || crossings > params.crossings[1]) continue;
    const starts = validStarts(level);
    if (starts.length === 0) continue;
    const solved = solveLevel(level, level.solution[0]!);
    if (!solved.path) continue;
    level.difficulty = solved.nodes + level.edges.length * 4 + crossings * 6 + (starts.length === level.stars.length ? 0 : 10);
    return level;
  }
  return null;
}
