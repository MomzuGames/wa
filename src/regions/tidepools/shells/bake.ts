import { generateShellLevel, type ShellParams } from './generator';
import type { ShellLevel } from './model';
import { solveByLogic } from './solver';

// The three test pools: gentle, medium, and one that needs a real insight. Each searches
// seeded pools and keeps the one that asks for the most reasoning within its brief.
const TRIALS: Array<{ name: string; params: ShellParams; tries: number; wants: (l: ShellLevel) => boolean }> = [
  { name: 'gentle', params: { width: 5, height: 5, fill: [0.4, 0.65], keepExtra: 0.5, needsInsight: false }, tries: 1500, wants: () => true },
  { name: 'medium', params: { width: 6, height: 6, fill: [0.4, 0.65], keepExtra: 0, needsInsight: false }, tries: 3000, wants: () => true },
  {
    name: 'insight',
    params: { width: 6, height: 6, fill: [0.4, 0.7], keepExtra: 0, needsInsight: false },
    tries: 6000,
    wants: (l) => {
      const logic = solveByLogic(l);
      return logic.smallLoopSteps + logic.whatIfSteps >= 2;
    },
  },
];

export function bakeShellTrials(): ShellLevel[] {
  return TRIALS.map((trial, i) => {
    let best: ShellLevel | null = null;
    for (let k = 0; k < trial.tries; k++) {
      const level = generateShellLevel(`tidepools:shells:${trial.name}:${k}`, i, trial.params);
      if (!level || !trial.wants(level)) continue;
      if (!best || level.difficulty > best.difficulty) best = level;
    }
    if (!best) throw new Error(`no ${trial.name} shell pool found`);
    return best;
  });
}
