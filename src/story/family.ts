import type { PaletteToken } from '../design/palette';
import { REGION_ACCENT, REGION_ORDER } from '../regions/catalog';
import type { RegionId } from '../regions/types';

// Seven lights, seven colours. The player chooses one for the smallest light; the family
// wears the other six. Each land's sleeper wears the land's own colour, unless the player
// has taken it, in which case it wears the one colour no land uses.
export const LIGHT_COLORS = ['mint', 'lavender', 'peach', 'sky', 'rose', 'sage', 'lemon'] as const;
export type LightColor = (typeof LIGHT_COLORS)[number];

const SPARE: LightColor = LIGHT_COLORS.find((c) => !REGION_ORDER.some((id) => REGION_ACCENT[id] === c))!;

export function familyColor(region: RegionId, player: PaletteToken): PaletteToken {
  const own = REGION_ACCENT[region];
  return own === player ? SPARE : own;
}

// The six family colours, in land order.
export function familyColors(player: PaletteToken): PaletteToken[] {
  return REGION_ORDER.map((id) => familyColor(id, player));
}
