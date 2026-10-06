import { generateShellLevel, type ShellParams } from './generator';
import type { ShellLevel } from './model';
import { countSolutions, solveByLogic } from './solver';

// Tidepools, Shells and Stones: a teaching ramp, then pools that ask for more reasoning.
//   1  a tiny pool of four stones (the tutorial, with a hand that draws it)
//   2  shells only        3  stones only        4  both, gently
//   5  gentle             6  fewest clues       7  needs the "no small loop" insight
//   8  a wider pool       9  wider, deeper      10 the deep pool: the widest, the most insight
// Every pool is made from its seed, so baking again gives the very same pools.
type Trial = { name: string; params: ShellParams; tries: number; pick: 'easiest' | 'hardest' | number; wants?: (l: ShellLevel) => boolean };

const insight = (steps: number) => (l: ShellLevel) => {
  const logic = solveByLogic(l);
  return logic.smallLoopSteps + logic.whatIfSteps >= steps;
};

const TRIALS: Trial[] = [
  { name: 'shells-only', params: { width: 4, height: 4, fill: [0.4, 0.8], keepExtra: 1, needsInsight: false, kinds: ['shell'] }, tries: 300, pick: 'easiest' },
  { name: 'stones-only', params: { width: 4, height: 4, fill: [0.5, 0.8], keepExtra: 1, needsInsight: false, kinds: ['stone'] }, tries: 300, pick: 'easiest' },
  { name: 'both', params: { width: 5, height: 5, fill: [0.4, 0.7], keepExtra: 0.6, needsInsight: false }, tries: 600, pick: 'easiest' },
  { name: 'gentle', params: { width: 5, height: 5, fill: [0.4, 0.65], keepExtra: 0.5, needsInsight: false }, tries: 1500, pick: 'hardest' },
  { name: 'medium', params: { width: 6, height: 6, fill: [0.4, 0.65], keepExtra: 0, needsInsight: false }, tries: 3000, pick: 'hardest' },
  {
    name: 'insight',
    params: { width: 6, height: 6, fill: [0.4, 0.7], keepExtra: 0, needsInsight: false },
    tries: 6000,
    pick: 'hardest',
    wants: insight(2),
  },
  // A number aims at that difficulty (the nearest pool wins), so the climb stays steady.
  { name: 'wide', params: { width: 7, height: 7, fill: [0.4, 0.7], keepExtra: 0, needsInsight: false }, tries: 4000, pick: 260, wants: insight(2) },
  { name: 'wide-deep', params: { width: 7, height: 7, fill: [0.4, 0.7], keepExtra: 0, needsInsight: false }, tries: 6000, pick: 330, wants: insight(3) },
  { name: 'deep-pool', params: { width: 8, height: 8, fill: [0.4, 0.7], keepExtra: 0, needsInsight: false }, tries: 4000, pick: 'hardest', wants: insight(3) },
];

// The tutorial: four stones at the corners of a 3×3 pool. The only loop is its edge.
function tutorial(): ShellLevel {
  const w = 3;
  const h = 3;
  const level: ShellLevel = {
    seed: 'tidepools:shells:tutorial',
    chapter: 0,
    width: w,
    height: h,
    clues: [
      { x: 0, y: 0, kind: 'stone' },
      { x: 2, y: 0, kind: 'stone' },
      { x: 0, y: 2, kind: 'stone' },
      { x: 2, y: 2, kind: 'stone' },
    ],
    // Top row, bottom row, left column, right column of a 3×3 pool.
    solution: [0, 1, 4, 5, 6, 8, 9, 11].sort((a, b) => a - b),
    difficulty: 1,
  };
  if (countSolutions(level, 2) !== 1 || !solveByLogic(level).solved) throw new Error('the tutorial pool must have one answer');
  return level;
}

// The teaching pools keep their places; the pools after them climb, easiest first.
const SETTLED = 7;

export function bakeTidepools(): ShellLevel[] {
  const pools = [
    tutorial(),
    ...TRIALS.map((trial, i) => {
      let best: ShellLevel | null = null;
      for (let k = 0; k < trial.tries; k++) {
        const level = generateShellLevel(`tidepools:shells:${trial.name}:${k}`, i, trial.params);
        if (!level || (trial.wants && !trial.wants(level))) continue;
        const pick = trial.pick;
        const better =
          !best ||
          (pick === 'hardest' ? level.difficulty > best.difficulty : pick === 'easiest' ? level.difficulty < best.difficulty : Math.abs(level.difficulty - pick) < Math.abs(best.difficulty - pick));
        if (better) best = level;
      }
      if (!best) throw new Error(`no ${trial.name} shell pool found`);
      return best;
    }),
  ];
  return [...pools.slice(0, SETTLED), ...pools.slice(SETTLED).sort((a, b) => a.difficulty - b.difficulty)];
}
