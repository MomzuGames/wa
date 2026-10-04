import type { RegionId } from '../regions/types';
import { REGION_ORDER } from '../regions/catalog';
import { progression } from '../core/progress';
import type { SceneId } from './script';

export type Solved = Record<RegionId, readonly number[]>;

// A land's free part (its first levels) is done.
export function freeDone(solved: readonly number[]): boolean {
  return Array.from({ length: progression.freeLevels }, (_, i) => i).every((i) => solved.includes(i));
}

export function landDone(solved: readonly number[]): boolean {
  return solved.length >= progression.levelsPerRegion;
}

// Every scene the player has earned so far, in story order.
export function earnedScenes(solved: Solved): SceneId[] {
  const out: SceneId[] = ['prologue'];
  for (const id of REGION_ORDER) if (freeDone(solved[id])) out.push(`asleep:${id}`);
  if (REGION_ORDER.every((id) => freeDone(solved[id]))) out.push('waiting');
  for (const id of REGION_ORDER) if (landDone(solved[id])) out.push(`home:${id}`);
  if (REGION_ORDER.every((id) => landDone(solved[id]))) out.push('finale');
  return out;
}

// The scenes a level just solved in `region` has earned and that have not been seen.
// The prologue belongs to the map, not to a level.
export function scenesAfterLevel(region: RegionId, solved: Solved, seen: ReadonlySet<string>): SceneId[] {
  return earnedScenes(solved).filter((id) => {
    if (seen.has(id) || id === 'prologue') return false;
    // A land's own scenes play when it earns them; the shared ones whenever they are due.
    if (id.startsWith('asleep:') || id.startsWith('home:')) return id.endsWith(`:${region}`);
    return true;
  });
}
