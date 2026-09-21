// The only place colours are defined. See CLAUDE.md §4.
export const palette = {
  void: 0x0b0b10,
  ink: 0x15151d,
  dim: 0x2a2a36,
  mint: 0xb8f2e6,
  lavender: 0xcdb8ff,
  peach: 0xffd6c2,
  sky: 0xbde0fe,
  rose: 0xffc8dd,
  lemon: 0xfff1b8,
  pearl: 0xf7f4ff,
  shadow: 0x000000, // only ever used at partial alpha, to darken (vignette, backdrops)
} as const;

export type PaletteToken = keyof typeof palette;

// Alpha levels for UI states, so the same "quietness" is used everywhere.
export const alphas = {
  hudIdle: 0.45,
  hudHover: 0.95,
  panelBackdrop: 0.6,
  dustMin: 0.14,
  dustMax: 0.42,
  vignette: 0.55,
  logo: 0.85,
} as const;

export function rgba(token: PaletteToken, alpha: number): string {
  const hex = palette[token];
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function cssHex(token: PaletteToken): string {
  return `#${palette[token].toString(16).padStart(6, '0')}`;
}
