import type { PuzzleModule, RegionId } from './types';
import { createPlaceholderModule } from './placeholder/module';
import { tidepoolsModule } from './tidepools/module';
import { nightskyModule } from './nightsky/module';
import { stonegardenModule } from './stonegarden/module';

export { REGION_ORDER, REGION_ACCENT } from './catalog';

// Every region starts as the placeholder; each is replaced as its phase lands.
const modules: Record<RegionId, PuzzleModule> = {
  tidepools: tidepoolsModule,
  nightsky: nightskyModule,
  stonegarden: stonegardenModule,
  crystalcaves: createPlaceholderModule('crystalcaves'),
  moonlake: createPlaceholderModule('moonlake'),
};

export function getModule(id: RegionId): PuzzleModule {
  return modules[id];
}
