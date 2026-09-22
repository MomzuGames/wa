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

// Each level carries a name from its region instead of a number: ten small places
// on the way from the shallows to the deep, from dusk to zenith.
export const LEVEL_NAMES: Record<RegionId, string[]> = {
  tidepools: ['Foam', 'Kelp', 'Anemone', 'Driftwood', 'Limpet', 'Starfish', 'Eddy', 'Barnacle', 'Undertow', 'Deep Pool'],
  nightsky: ['Dusk', 'First Star', 'Comet', 'Pole Star', 'Meteor', 'Milky Way', 'Nebula', 'Aurora', 'Eclipse', 'Zenith'],
  stonegarden: ['Pebble', 'Moss', 'Rake', 'Bonsai', 'Koi', 'Bridge', 'Lantern', 'Pagoda', 'Temple', 'Mountain'],
  crystalcaves: ['Quartz', 'Facet', 'Geode', 'Vein', 'Amethyst', 'Halo', 'Prism', 'Spectrum', 'Lumen', 'Core'],
  moonlake: ['Reed', 'Lotus', 'Heron', 'Mist', 'Firefly', 'Reflection', 'Crescent', 'Harvest Moon', 'Stillness', 'Full Moon'],
  shadowterrace: ['Cairn', 'Step', 'Stair', 'Wall', 'Courtyard', 'Tower', 'Keep', 'Bastion', 'Pinnacle', 'Summit'],
};
