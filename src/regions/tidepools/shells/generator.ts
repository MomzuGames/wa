import { createRng, type Rng } from '../../../core/rng';
import { type Clue, type ClueKind, DIRS, type Dir, STEP, type ShellLevel, edgeAt, edgeCount, edgeEnds, exits, opposite } from './model';
import { countSolutions, solveByLogic } from './solver';

export interface ShellParams {
  width: number;
  height: number;
  fill: [number, number]; // share of the pool's squares inside the loop
  keepExtra: number; // 0..1: clues kept beyond the fewest needed (gentler levels keep more)
  needsInsight: boolean; // require the "no small loop" realisation at least once
  kinds?: ClueKind[]; // only these clues (early pools teach one at a time)
}

// The loop is the outline of a region of squares (the pool's squares lie between its
// points). Growing a region one square at a time, keeping its outline a single simple
// loop, gives a random tide line that never touches itself.
function outline(w: number, h: number, inside: Set<number>): Set<number> {
  const fw = w - 1;
  const fh = h - 1;
  const has = (fx: number, fy: number) => fx >= 0 && fy >= 0 && fx < fw && fy < fh && inside.has(fy * fw + fx);
  const on = new Set<number>();
  // A line between two points lies between two squares; it is on the loop when exactly one is inside.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 1; x++) {
      if (has(x, y - 1) !== has(x, y)) on.add(edgeAt(w, h, x, y, 1));
    }
  }
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w; x++) {
      if (has(x - 1, y) !== has(x, y)) on.add(edgeAt(w, h, x, y, 2));
    }
  }
  return on;
}

// One closed loop that never touches itself (a hole inside the region would add a second).
function isSimpleLoop(w: number, h: number, on: Set<number>): boolean {
  if (on.size === 0) return false;
  const level = { width: w, height: h };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = exits(level, on, x, y).length;
      if (n !== 0 && n !== 2) return false;
    }
  }
  const start = [...on][0]!;
  const seen = new Set<number>([start]);
  const queue = [start];
  while (queue.length) {
    const [a, b] = edgeEnds(w, h, queue.pop()!);
    for (const p of [a, b]) {
      for (const d of DIRS) {
        const e = edgeAt(w, h, p.x, p.y, d);
        if (e >= 0 && on.has(e) && !seen.has(e)) {
          seen.add(e);
          queue.push(e);
        }
      }
    }
  }
  return seen.size === on.size;
}

export function growLoop(rng: Rng, w: number, h: number, fill: number): Set<number> | null {
  const fw = w - 1;
  const fh = h - 1;
  const target = Math.max(2, Math.round(fw * fh * fill));
  const inside = new Set<number>([rng.int(0, fw * fh - 1)]);
  for (let tries = 0; inside.size < target && tries < 600; tries++) {
    const frontier: number[] = [];
    for (const f of inside) {
      const fx = f % fw;
      const fy = Math.floor(f / fw);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = fx + dx!;
        const ny = fy + dy!;
        if (nx >= 0 && ny >= 0 && nx < fw && ny < fh && !inside.has(ny * fw + nx)) frontier.push(ny * fw + nx);
      }
    }
    if (frontier.length === 0) break;
    // Squares touching the region on one side only make a wigglier, more clue-rich loop.
    const touching = (f: number) => {
      const fx = f % fw;
      const fy = Math.floor(f / fw);
      return [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => inside.has((fy + dy!) * fw + fx + dx!) && fx + dx! >= 0 && fx + dx! < fw).length;
    };
    const lean = frontier.filter((f) => touching(f) === 1);
    const pick = rng.pick(lean.length && rng.chance(0.8) ? lean : frontier);
    inside.add(pick);
    if (!isSimpleLoop(w, h, outline(w, h, inside))) inside.delete(pick);
  }
  const on = outline(w, h, inside);
  return isSimpleLoop(w, h, on) ? on : null;
}

// Every spot on the loop where a shell or a stone would be true.
export function candidateClues(w: number, h: number, on: Set<number>): Clue[] {
  const level = { width: w, height: h };
  const out: Clue[] = [];
  const straight = (x: number, y: number) => {
    const ds = exits(level, on, x, y);
    return ds.length === 2 && ds[0] === opposite(ds[1]!);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ds = exits(level, on, x, y);
      if (ds.length !== 2) continue;
      const step = (d: Dir) => ({ x: x + STEP[d].dx, y: y + STEP[d].dy });
      if (straight(x, y)) {
        if (ds.some((d) => !straight(step(d).x, step(d).y))) out.push({ x, y, kind: 'shell' });
      } else if (ds.every((d) => straight(step(d).x, step(d).y))) {
        out.push({ x, y, kind: 'stone' });
      }
    }
  }
  return out;
}

export function generateShellLevel(seed: string, chapter: number, params: ShellParams): ShellLevel | null {
  const rng = createRng(seed);
  const { width: w, height: h } = params;
  const loop = growLoop(rng, w, h, params.fill[0] + rng.next() * (params.fill[1] - params.fill[0]));
  if (!loop) return null;
  const solution = [...loop].sort((a, b) => a - b);
  let clues = candidateClues(w, h, loop).filter((c) => !params.kinds || params.kinds.includes(c.kind));
  const level = (cs: Clue[]): ShellLevel => ({ seed, chapter, width: w, height: h, clues: cs, solution, difficulty: 0 });
  const fair = (cs: Clue[]) => countSolutions(level(cs), 2) === 1 && solveByLogic(level(cs)).solved;
  if (!fair(clues)) return null;
  // Take clues away while the pool stays one-answer and solvable by reasoning.
  const removable: Clue[] = [];
  for (const c of rng.shuffle(clues.slice())) {
    const without = clues.filter((k) => k !== c);
    if (fair(without)) {
      clues = without;
      removable.push(c);
    }
  }
  // Gentler pools get some of them back.
  const extra = Math.round(removable.length * params.keepExtra);
  clues = [...clues, ...removable.slice(0, extra)];
  const logic = solveByLogic(level(clues));
  if (params.needsInsight && logic.smallLoopSteps === 0) return null;
  // Difficulty: how far reasoning must travel, with the loop insight weighing most.
  const rounds = new Set(logic.deductions.map((d) => `${d.x},${d.y}`)).size;
  return { ...level(clues), difficulty: Math.round(logic.deductions.length / Math.max(1, clues.length) * 10 + rounds + logic.smallLoopSteps * 15) };
}

// Unused here, but handy when checking a pool by hand.
export function edgesFor(level: Pick<ShellLevel, 'width' | 'height'>): number {
  return edgeCount(level.width, level.height);
}

export { DIRS };
