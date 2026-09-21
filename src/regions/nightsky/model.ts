// Constellation puzzle: trace every line between stars in one continuous stroke.

export interface Star {
  x: number;
  y: number;
}

export interface Edge {
  a: number;
  b: number;
  required: 1 | 2;
  oneWay: boolean; // only traversable from a to b
}

export interface SkyLevel {
  seed: string;
  chapter: number;
  handcrafted?: boolean;
  stars: Star[];
  edges: Edge[];
  solution: number[]; // star indices in stroke order
  drift: boolean;
  difficulty: number;
}

export interface Step {
  edge: number;
  from: number;
  to: number;
}

export interface Stroke {
  remaining: number[];
  path: Step[];
  current: number | null;
}

export function newStroke(level: SkyLevel): Stroke {
  return { remaining: level.edges.map((e) => e.required), path: [], current: null };
}

export function edgeBetween(level: SkyLevel, from: number, to: number, remaining: number[]): number {
  for (let i = 0; i < level.edges.length; i++) {
    const e = level.edges[i]!;
    if (remaining[i]! <= 0) continue;
    if (e.a === from && e.b === to) return i;
    if (!e.oneWay && e.b === from && e.a === to) return i;
  }
  return -1;
}

export function traverse(level: SkyLevel, stroke: Stroke, to: number): boolean {
  if (stroke.current === null) return false;
  const edge = edgeBetween(level, stroke.current, to, stroke.remaining);
  if (edge < 0) return false;
  stroke.remaining[edge]!--;
  stroke.path.push({ edge, from: stroke.current, to });
  stroke.current = to;
  return true;
}

export function undo(stroke: Stroke): Step | null {
  const step = stroke.path.pop();
  if (!step) return null;
  stroke.remaining[step.edge]!++;
  stroke.current = step.from;
  return step;
}

export function isComplete(stroke: Stroke): boolean {
  return stroke.remaining.every((r) => r === 0);
}

// Degree of each star counting required multiplicity (one-way edges count on both ends).
export function degrees(level: SkyLevel): number[] {
  const deg = new Array<number>(level.stars.length).fill(0);
  for (const e of level.edges) {
    deg[e.a]! += e.required;
    deg[e.b]! += e.required;
  }
  return deg;
}

export function oddStars(level: SkyLevel): number[] {
  return degrees(level)
    .map((d, i) => (d % 2 === 1 ? i : -1))
    .filter((i) => i >= 0);
}

export function isSolutionValid(level: SkyLevel): boolean {
  const stroke = newStroke(level);
  const [first, ...rest] = level.solution;
  if (first === undefined) return false;
  stroke.current = first;
  for (const next of rest) if (!traverse(level, stroke, next)) return false;
  return isComplete(stroke);
}

// Geometry helpers shared by the generator and its tests.
export function segmentsCross(p1: Star, p2: Star, p3: Star, p4: Star): boolean {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  const eps = 1e-6;
  return t > eps && t < 1 - eps && u > eps && u < 1 - eps;
}

export function pointSegmentDistance(p: Star, a: Star, b: Star): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2));
  return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
}

export function crossingCount(level: SkyLevel): number {
  let n = 0;
  for (let i = 0; i < level.edges.length; i++) {
    for (let j = i + 1; j < level.edges.length; j++) {
      const e = level.edges[i]!;
      const f = level.edges[j]!;
      if (e.a === f.a || e.a === f.b || e.b === f.a || e.b === f.b) continue;
      if (segmentsCross(level.stars[e.a]!, level.stars[e.b]!, level.stars[f.a]!, level.stars[f.b]!)) n++;
    }
  }
  return n;
}

// Every star must keep this much clearance (in unit-square units) from lines it is not on.
export const MIN_STAR_LINE_CLEARANCE = 20 / 600;

export function minStarLineClearance(level: SkyLevel): number {
  let min = Infinity;
  level.edges.forEach((e) => {
    level.stars.forEach((s, i) => {
      if (i === e.a || i === e.b) return;
      min = Math.min(min, pointSegmentDistance(s, level.stars[e.a]!, level.stars[e.b]!));
    });
  });
  return min;
}
