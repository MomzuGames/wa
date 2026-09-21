import { describe, expect, it } from 'vitest';
import { palette } from './palette';

describe('palette', () => {
  it('has no pure white and no pure black', () => {
    for (const value of Object.values(palette)) {
      expect(value).not.toBe(0xffffff);
      expect(value).not.toBe(0x000000);
    }
  });

  it('defines every documented token', () => {
    const tokens = ['void', 'ink', 'dim', 'mint', 'lavender', 'peach', 'sky', 'rose', 'lemon', 'pearl'];
    for (const token of tokens) {
      expect(palette).toHaveProperty(token);
    }
  });
});
