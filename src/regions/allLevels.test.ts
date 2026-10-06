import { describe, expect, it } from 'vitest';
import { progression } from '../core/progress';
import { REGION_ORDER } from './catalog';
import tidepools from './tidepools/levels.json';
import nightsky from './nightsky/levels.json';
import stonegarden from './stonegarden/levels.json';
import crystalcaves from './crystalcaves/levels.json';
import moonlake from './moonlake/levels.json';
import shadowterrace from './shadowterrace/levels.json';
import { type ShellLevel } from './tidepools/model';
import { solveByLogic as solvePool } from './tidepools/solver';
import { type SkyLevel } from './nightsky/model';
import { validStarts } from './nightsky/solver';
import { type StoneLevel } from './stonegarden/model';
import { solveStone } from './stonegarden/solver';
import { initialOrients, type PrismLevel } from './crystalcaves/model';
import { solvePrism } from './crystalcaves/solver';
import { type LanternLevel } from './moonlake/model';
import { solveByLogic as solveLake } from './moonlake/solver';
import { type ShadowLevel } from './shadowterrace/model';
import { solveShadow } from './shadowterrace/solver';

// One place that states the guarantee: every level of every region is solvable
// from its starting state, as checked by that region's solver.
describe('every level in every region', () => {
  const counts: Record<string, number> = {
    tidepools: tidepools.length,
    nightsky: nightsky.length,
    stonegarden: stonegarden.length,
    crystalcaves: crystalcaves.length,
    moonlake: moonlake.length,
    shadowterrace: shadowterrace.length,
  };

  it('has exactly ten levels per region', () => {
    for (const id of REGION_ORDER) expect(counts[id]).toBe(progression.levelsPerRegion);
  });

  it('is solvable from its start state', () => {
    (tidepools as ShellLevel[]).forEach((l) => expect(solvePool(l).solved, l.seed).toBe(true));
    (nightsky as SkyLevel[]).forEach((l) => expect(validStarts(l).length, l.seed).toBeGreaterThan(0));
    (stonegarden as StoneLevel[]).forEach((l) => expect(solveStone(l).placements, l.seed).not.toBeNull());
    (crystalcaves as PrismLevel[]).forEach((l) => expect(solvePrism(l, initialOrients(l)).orients, l.seed).not.toBeNull());
    (moonlake as LanternLevel[]).forEach((l) => expect(solveLake(l).solved, l.seed).toBe(true));
    (shadowterrace as ShadowLevel[]).forEach((l) => expect(solveShadow(l).heights, l.seed).not.toBeNull());
  });
});
