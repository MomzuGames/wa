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
  sage: 0xd0e8bf,
  lemon: 0xfff1b8,
  pearl: 0xf7f4ff,
  earth: 0x26241f, // 3D stone, sand and rock: a warm neutral, never purple (the owner asked for no dark purples)
  earthLight: 0x4a4740, // lit stone in 3D
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

// The Silence: a colour drained to grey of the same lightness, a little dimmer.
export function drained(color: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const l = Math.round((0.299 * r + 0.587 * g + 0.114 * b) * 0.72);
  return (l << 16) | (l << 8) | l;
}

// Between two colours: t = 0 gives a, t = 1 gives b.
export function mixColor(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const ch = (shift: number) => Math.round(((a >> shift) & 0xff) * (1 - k) + ((b >> shift) & 0xff) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export function cssHex(token: PaletteToken): string {
  return `#${palette[token].toString(16).padStart(6, '0')}`;
}
