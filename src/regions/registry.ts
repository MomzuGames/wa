import type { PuzzleModule, RegionId } from './types';
import { createPlaceholderModule } from './placeholder/module';

export { REGION_ORDER, REGION_ACCENT } from './catalog';

// Every region starts as the placeholder; each is replaced as its phase lands.
const modules: Record<RegionId, PuzzleModule> = {
  tidepools: createPlaceholderModule('tidepools'),
  nightsky: createPlaceholderModule('nightsky'),
  stonegarden: createPlaceholderModule('stonegarden'),
  crystalcaves: createPlaceholderModule('crystalcaves'),
  moonlake: createPlaceholderModule('moonlake'),
};

export function getModule(id: RegionId): PuzzleModule {
  return modules[id];
}
