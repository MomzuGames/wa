import type { RegionId } from './types';
import type { PaletteToken } from '../design/palette';

export const REGION_ORDER: RegionId[] = ['tidepools', 'nightsky', 'stonegarden', 'crystalcaves', 'moonlake'];

export const REGION_ACCENT: Record<RegionId, PaletteToken> = {
  tidepools: 'mint',
  nightsky: 'lavender',
  stonegarden: 'peach',
  crystalcaves: 'sky',
  moonlake: 'rose',
};
