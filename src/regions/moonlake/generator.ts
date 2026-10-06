import { createRng, type Rng } from '../../core/rng';
import { type LanternLevel, besides, cellCount, isWater, lightCounts, sightLines } from './model';
import { countSolutions, solveByLogic } from './solver';

export interface LanternParams {
  width: number;
  height: number;
  shape: 'open' | 'cove'; // a square lake, or a rounder one with shore biting into it
  rocks: [number, number]; // share of the lake that is rock
  keepExtra: number; // 0..1: dotted rocks kept beyond the fewest needed (gentler lakes keep more)
  whatIf: [number, number]; // how many "try it in your head" steps the lake may (and must) need
}

// Which cells are lake: all of them, or a rounded cove with a ragged shore.
function lakeMask(rng: Rng, w: number, h: number, shape: LanternParams['shape']): boolean[] {
  const mask = Array.from({ length: w * h }, () => true);
  if (shape === 'open') return mask;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = ((x - cx) / (w / 2)) ** 2 + ((y - cy) / (h / 2)) ** 2;
      if (d > 0.95 + rng.next() * 0.35) mask[y * w + x] = false;
    }
  }
  return mask;
}

// Lakes are made backwards: lay out rocks, float lanterns until the water is lit, then put
// dots on the rocks and take away as many as possible while the lake keeps one answer that
// can be reasoned out.
export function generateLanternLevel(seed: string, chapter: number, params: LanternParams): LanternLevel | null {
  const rng = createRng(seed);
  const { width: w, height: h } = params;
  const mask = lakeMask(rng, w, h, params.shape);
  const lakeCells = mask.filter(Boolean).length;
  const rows: string[][] = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (mask[y * w + x] ? '.' : ' ')));
  const rockShare = params.rocks[0] + rng.next() * (params.rocks[1] - params.rocks[0]);
  const lake = rng.shuffle(mask.flatMap((m, i) => (m ? [i] : [])));
  for (const i of lake.slice(0, Math.round(lakeCells * rockShare))) rows[Math.floor(i / w)]![i % w] = '#';
  const make = (r: string[][], solution: number[]): LanternLevel => ({ seed, chapter, width: w, height: h, grid: r.map((row) => row.join('')), solution, difficulty: 0 });

  // Float lanterns: any patch still dark gets one, in a random order.
  const bare = make(rows, []);
  const sight = sightLines(bare);
  const lanterns = new Set<number>();
  for (const i of rng.shuffle([...Array(cellCount(bare)).keys()])) {
    if (!isWater(bare, i)) continue;
    if (lightCounts(bare, lanterns, sight)[i] === 0) lanterns.add(i);
  }
  if (lanterns.size < 3) return null;
  const solution = [...lanterns].sort((a, b) => a - b);

  // Every rock shows how many lanterns sit beside it...
  const rocks = [...Array(cellCount(bare)).keys()].filter((i) => rows[Math.floor(i / w)]![i % w] === '#');
  for (const r of rocks) rows[Math.floor(r / w)]![r % w] = String(besides(bare, r).filter((j) => lanterns.has(j)).length);
  const fair = (r: string[][]) => {
    const level = make(r, solution);
    const logic = solveByLogic(level);
    return logic.solved && logic.whatIfSteps <= params.whatIf[1] && countSolutions(level, 2) === 1;
  };
  if (!fair(rows)) return null;
  // ...then as many dots as possible go, while the lake stays fair.
  const removable: number[] = [];
  for (const r of rng.shuffle(rocks.slice())) {
    const keep = rows[Math.floor(r / w)]![r % w]!;
    rows[Math.floor(r / w)]![r % w] = '#';
    if (fair(rows)) removable.push(r);
    else rows[Math.floor(r / w)]![r % w] = keep;
  }
  // Gentler lakes get some dots back.
  for (const r of removable.slice(0, Math.round(removable.length * params.keepExtra))) {
    rows[Math.floor(r / w)]![r % w] = String(besides(bare, r).filter((j) => lanterns.has(j)).length);
  }
  const level = make(rows, solution);
  const logic = solveByLogic(level);
  if (!logic.solved || logic.whatIfSteps < params.whatIf[0] || logic.whatIfSteps > params.whatIf[1]) return null;
  // Difficulty: how much reasoning the lake asks for, the harder kinds weighing more.
  const weight = { sees: 0, rock: 1, 'only-light': 3, 'what-if': 14 } as const;
  const effort = logic.deductions.reduce((sum, d) => sum + weight[d.reason], 0);
  return { ...level, difficulty: Math.round(effort + lakeCells / 3) };
}
