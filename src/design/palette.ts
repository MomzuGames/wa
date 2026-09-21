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
} as const;

export type PaletteToken = keyof typeof palette;
