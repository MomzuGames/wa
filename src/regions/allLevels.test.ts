import { describe, expect, it } from 'vitest';
import { progression } from '../core/progress';
import { REGION_ORDER } from './catalog';
import tidepools from './tidepools/levels.json';
import nightsky from './nightsky/levels.json';
import stonegarden from './stonegarden/levels.json';
import crystalcaves from './crystalcaves/levels.json';
import moonlake from './moonlake/levels.json';
import { boardFromLevel, type LoopLevel } from './tidepools/model';
import { solve as solveLoop } from './tidepools/solver';
import { type SkyLevel } from './nightsky/model';
import { validStarts } from './nightsky/solver';
import { type StoneLevel } from './stonegarden/model';
import { solveStone } from './stonegarden/solver';
import { initialOrients, type PrismLevel } from './crystalcaves/model';
import { solvePrism } from './crystalcaves/solver';
import { type RippleLevel } from './moonlake/model';
import { solveRipple } from './moonlake/solver';

// One place that states the guarantee: every level of every region is solvable
// from its starting state, as checked by that region's solver.
describe('every level in every region', () => {
  const counts: Record<string, number> = {
    tidepools: tidepools.length,
    nightsky: nightsky.length,
    stonegarden: stonegarden.length,
    crystalcaves: crystalcaves.length,
    moonlake: moonlake.length,
  };

  it('has exactly 24 levels per region', () => {
    for (const id of REGION_ORDER) expect(counts[id]).toBe(progression.levelsPerRegion);
  });

  it('is solvable from its start state', () => {
    (tidepools as LoopLevel[]).forEach((l) => expect(solveLoop(boardFromLevel(l)).solution, l.seed).not.toBeNull());
    (nightsky as SkyLevel[]).forEach((l) => expect(validStarts(l).length, l.seed).toBeGreaterThan(0));
    (stonegarden as StoneLevel[]).forEach((l) => expect(solveStone(l).placements, l.seed).not.toBeNull());
    (crystalcaves as PrismLevel[]).forEach((l) => expect(solvePrism(l, initialOrients(l)).orients, l.seed).not.toBeNull());
    (moonlake as RippleLevel[]).forEach((l) => expect(solveRipple(l, l.start).presses, l.seed).not.toBeNull());
  });
});
