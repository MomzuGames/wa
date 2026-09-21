import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bakeTidepools } from '../src/regions/tidepools/bake';
import { bakeNightSky } from '../src/regions/nightsky/bake';
import { bakeStoneGarden } from '../src/regions/stonegarden/bake';
import { bakeCrystalCaves } from '../src/regions/crystalcaves/bake';
import { bakeMoonLake } from '../src/regions/moonlake/bake';

// Bakes every region's levels into src/regions/<id>/levels.json.
// Each baker verifies its own levels with the region solver.
const regions: Array<{ id: string; bake: () => unknown[] }> = [
  { id: 'tidepools', bake: bakeTidepools },
  { id: 'nightsky', bake: bakeNightSky },
  { id: 'stonegarden', bake: bakeStoneGarden },
  { id: 'crystalcaves', bake: bakeCrystalCaves },
  { id: 'moonlake', bake: bakeMoonLake },
];

for (const region of regions) {
  const started = Date.now();
  const levels = region.bake();
  const file = resolve('src/regions', region.id, 'levels.json');
  writeFileSync(file, JSON.stringify(levels));
  console.log(`${region.id}: ${levels.length} levels in ${Date.now() - started} ms -> ${file}`);
}
