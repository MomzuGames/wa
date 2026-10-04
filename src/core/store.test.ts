import { describe, expect, it } from 'vitest';
import { CODE_HASH, normaliseCode, sha256Hex } from './store';

describe('website unlock code', () => {
  it('ignores case, spaces and dashes', () => {
    expect(normaliseCode(' Momo-Family ')).toBe('momofamily');
  });

  it('stores only a SHA-256 fingerprint that matches the code', async () => {
    expect(CODE_HASH).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex(normaliseCode('MOMO family'))).toBe(CODE_HASH);
    expect(await sha256Hex(normaliseCode('wrong'))).not.toBe(CODE_HASH);
  });
});
