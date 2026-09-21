import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
}

describe('save', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', makeStorage());
  });

  it('starts from defaults when nothing is stored', async () => {
    const { load } = await import('./save');
    const data = load();
    expect(data.version).toBe(1);
    expect(data.regions.tidepools.solved).toEqual([]);
    expect(data.settings.muted).toBe(false);
  });

  it('persists settings and reloads them', async () => {
    const first = await import('./save');
    first.updateSettings({ muted: true, music: 0.25 });
    vi.resetModules();
    const second = await import('./save');
    const s = second.getSettings();
    expect(s.muted).toBe(true);
    expect(s.music).toBe(0.25);
  });

  it('ignores corrupt data', async () => {
    localStorage.setItem('luma.save.v1', '{not json');
    const { load } = await import('./save');
    expect(load().version).toBe(1);
  });
});
