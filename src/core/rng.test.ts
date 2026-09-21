import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

describe('rng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng('tidepools:3');
    const b = createRng('tidepools:3');
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
  });

  it('differs between seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('keeps int() inside the inclusive range', () => {
    const rng = createRng('range');
    for (let i = 0; i < 500; i++) {
      const v = rng.int(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
    }
  });

  it('shuffles in place and keeps every item', () => {
    const rng = createRng('shuffle');
    const items = [1, 2, 3, 4, 5, 6];
    const out = rng.shuffle(items);
    expect(out).toBe(items);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
