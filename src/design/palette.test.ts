import { describe, expect, it } from 'vitest';
import { palette, rgba } from './palette';

describe('palette', () => {
  it('has no pure white, and pure black only as the shadow token', () => {
    for (const [token, value] of Object.entries(palette)) {
      expect(value).not.toBe(0xffffff);
      if (token !== 'shadow') expect(value).not.toBe(0x000000);
    }
  });

  it('defines every documented token', () => {
    const tokens = ['void', 'ink', 'dim', 'mint', 'lavender', 'peach', 'sky', 'rose', 'sage', 'lemon', 'pearl'];
    for (const token of tokens) {
      expect(palette).toHaveProperty(token);
    }
  });

  it('converts tokens to rgba strings', () => {
    expect(rgba('void', 0.5)).toBe('rgba(11,11,16,0.5)');
  });
});
