import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bakeTidepools } from '../src/regions/tidepools/bake';

// Bakes every region's levels into src/regions/<id>/levels.json.
// Each baker verifies its own levels with the region solver.
const regions: Array<{ id: string; bake: () => unknown[] }> = [{ id: 'tidepools', bake: bakeTidepools }];

for (const region of regions) {
  const started = Date.now();
  const levels = region.bake();
  const file = resolve('src/regions', region.id, 'levels.json');
  writeFileSync(file, JSON.stringify(levels));
  console.log(`${region.id}: ${levels.length} levels in ${Date.now() - started} ms -> ${file}`);
}
