import type { RegionId } from './types';
import type { PaletteToken } from '../design/palette';

export const REGION_ORDER: RegionId[] = ['tidepools', 'nightsky', 'stonegarden', 'crystalcaves', 'moonlake', 'shadowterrace'];

export const REGION_NAME: Record<RegionId, string> = {
  tidepools: 'Tidepools',
  nightsky: 'Night Sky',
  stonegarden: 'Stone Garden',
  crystalcaves: 'Crystal Caves',
  moonlake: 'Moon Lake',
  shadowterrace: 'Shadow Terrace',
};

export const REGION_ACCENT: Record<RegionId, PaletteToken> = {
  tidepools: 'mint',
  nightsky: 'lavender',
  stonegarden: 'peach',
  crystalcaves: 'sky',
  moonlake: 'rose',
  shadowterrace: 'sage',
};
