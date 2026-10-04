import { describe, expect, it } from 'vitest';
import { LIGHT_COLORS, familyColors } from './family';

describe('the family of lights', () => {
  it('always wears the six colours the player did not choose', () => {
    for (const player of LIGHT_COLORS) {
      const family = familyColors(player);
      expect(family).not.toContain(player);
      expect(new Set([player, ...family]).size).toBe(7);
    }
  });
});
