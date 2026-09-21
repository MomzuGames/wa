import type { PuzzleModule, RegionId } from './types';
import { tidepoolsModule } from './tidepools/module';
import { nightskyModule } from './nightsky/module';
import { stonegardenModule } from './stonegarden/module';
import { crystalcavesModule } from './crystalcaves/module';
import { moonlakeModule } from './moonlake/module';

export { REGION_ORDER, REGION_ACCENT } from './catalog';

const modules: Record<RegionId, PuzzleModule> = {
  tidepools: tidepoolsModule,
  nightsky: nightskyModule,
  stonegarden: stonegardenModule,
  crystalcaves: crystalcavesModule,
  moonlake: moonlakeModule,
};

export function getModule(id: RegionId): PuzzleModule {
  return modules[id];
}
