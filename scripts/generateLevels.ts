import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { freezeLevels } from '../src/regions/bakeHelper';
import { progression } from '../src/core/progress';
import { bakeTidepools } from '../src/regions/tidepools/bake';
import { bakeNightSky } from '../src/regions/nightsky/bake';
import { bakeStoneGarden } from '../src/regions/stonegarden/bake';
import { bakeCrystalCaves } from '../src/regions/crystalcaves/bake';
import { bakeMoonLake } from '../src/regions/moonlake/bake';
import { bakeShadowTerrace } from '../src/regions/shadowterrace/bake';

// Bakes every region's levels into src/regions/<id>/levels.json.
// Each baker verifies its own levels with the region solver.
const regions: Array<{ id: string; bake: () => unknown[] }> = [
  { id: 'tidepools', bake: bakeTidepools },
  { id: 'nightsky', bake: bakeNightSky },
  { id: 'stonegarden', bake: bakeStoneGarden },
  { id: 'crystalcaves', bake: bakeCrystalCaves },
  { id: 'moonlake', bake: bakeMoonLake },
  { id: 'shadowterrace', bake: bakeShadowTerrace },
];

// The free levels are settled: keep them exactly as they are unless --all is passed.
// (Tidepools makes every pool from a fixed seed, so it bakes the same pools anyway.)
// `--only <id>` bakes one region.
const keepFree = !process.argv.includes('--all');
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;

for (const region of regions) {
  if (only && region.id !== only) continue;
  const started = Date.now();
  const file0 = resolve('src/regions', region.id, 'levels.json');
  if (keepFree && existsSync(file0)) freezeLevels(region.id, JSON.parse(readFileSync(file0, 'utf8')).slice(0, progression.freeLevels));
  const levels = region.bake();
  const file = resolve('src/regions', region.id, 'levels.json');
  writeFileSync(file, JSON.stringify(levels));
  console.log(`${region.id}: ${levels.length} levels in ${Date.now() - started} ms -> ${file}`);
}
