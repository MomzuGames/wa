import { describe, expect, it } from 'vitest';
import { REGION_ORDER } from '../regions/catalog';
import type { RegionId } from '../regions/types';
import { scene, type SceneId } from './script';
import { earnedScenes, missedScenes, scenesAfterLevel, type Solved } from './triggers';

const none = (): Solved => Object.fromEntries(REGION_ORDER.map((id) => [id, []])) as unknown as Solved;
const upTo = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('story', () => {
  it('every scene has beats with one short line each', () => {
    const ids: SceneId[] = ['prologue', 'waiting', 'finale', ...REGION_ORDER.flatMap((id) => [`asleep:${id}`, `home:${id}`] as SceneId[])];
    for (const id of ids) {
      const beats = scene(id);
      expect(beats.length).toBeGreaterThan(0);
      for (const b of beats) expect(b.line.length).toBeLessThanOrEqual(70);
    }
  });

  it('a land plays its sleeping scene once its four free levels are solved', () => {
    const solved = { ...none(), moonlake: upTo(3) };
    expect(scenesAfterLevel('moonlake', solved, new Set())).toEqual([]);
    solved.moonlake = upTo(4);
    expect(scenesAfterLevel('moonlake', solved, new Set())).toEqual(['asleep:moonlake']);
    expect(scenesAfterLevel('moonlake', solved, new Set(['asleep:moonlake']))).toEqual([]);
  });

  it('the free part ends once every land has been visited', () => {
    const solved = Object.fromEntries(REGION_ORDER.map((id) => [id, upTo(4)])) as unknown as Solved;
    const seen = new Set<string>(REGION_ORDER.slice(0, 5).map((id) => `asleep:${id}`));
    expect(scenesAfterLevel('shadowterrace', solved, seen)).toEqual(['asleep:shadowterrace', 'waiting']);
  });

  it('finishing a land brings its light home, and the last land plays the finale', () => {
    const solved = Object.fromEntries(REGION_ORDER.map((id) => [id, upTo(10)])) as unknown as Solved;
    const seen = new Set<string>(['waiting', ...REGION_ORDER.map((id) => `asleep:${id}`), ...REGION_ORDER.slice(1).map((id) => `home:${id}`)]);
    expect(scenesAfterLevel('tidepools' as RegionId, solved, seen)).toEqual(['home:tidepools', 'finale']);
    expect(earnedScenes(solved)).toHaveLength(1 + 6 + 1 + 6 + 1);
  });

  it('catches up on scenes a player earned before seeing them, in story order', () => {
    const solved = { ...none(), tidepools: upTo(10) };
    expect(missedScenes(solved, new Set(['prologue']))).toEqual(['asleep:tidepools', 'home:tidepools']);
    expect(missedScenes(solved, new Set(['prologue', 'asleep:tidepools', 'home:tidepools']))).toEqual([]);
  });
});

describe('whispers on the trail', () => {
  it('says the newest milestone once, and never an older one after it', async () => {
    const { whisperFor } = await import('./whispers');
    expect(whisperFor('moonlake', 0, new Set())!.line).toContain('asleep somewhere');
    const at3 = whisperFor('moonlake', 3, new Set())!;
    expect(at3.line).toContain('Closer now');
    const seen = new Set(at3.ids);
    expect(whisperFor('moonlake', 3, seen)).toBeNull();
    expect(whisperFor('moonlake', 2, seen)).toBeNull();
    expect(whisperFor('moonlake', 4, seen)!.line).toContain('There you are');
  });
});
