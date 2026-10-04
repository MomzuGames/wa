import type { RegionId } from '../regions/types';

// The story of Chōwa: a family of lights scattered when the world's song broke. The
// smallest light wakes alone and travels the six lands; in each, one of its family sleeps.
// The free part finds them; the full journey wakes them and brings them home.
// Each scene is a few beats; each beat is one short line over a small animation.

export type Art =
  | { kind: 'harmony'; finale?: boolean } // seven lights singing in a ring
  | { kind: 'scatter' } // the ring breaks and the lights fly apart
  | { kind: 'wake' } // the smallest light blinks awake on a shore
  | { kind: 'asleep'; region: RegionId } // a family light sleeping in a land
  | { kind: 'waiting' } // six sleeping lights around the little one
  | { kind: 'home'; region: RegionId } // a family light wakes and joins
  | { kind: 'together' }; // the whole family circling together

export interface Beat {
  line: string;
  art: Art;
}

export type SceneId = 'prologue' | 'waiting' | 'finale' | `asleep:${RegionId}` | `home:${RegionId}`;

const ASLEEP_LINE: Record<RegionId, string> = {
  tidepools: 'Beneath the tide, someone is sleeping.',
  nightsky: 'Among the stars, someone is sleeping.',
  stonegarden: 'Inside the old stones, someone is sleeping.',
  crystalcaves: 'Deep in the crystal, someone is sleeping.',
  moonlake: 'Under the still water, someone is sleeping.',
  shadowterrace: 'High on the terrace, someone is sleeping.',
};

const HOME_LINE: Record<RegionId, string> = {
  tidepools: 'From beneath the tide, one more light comes home.',
  nightsky: 'From among the stars, one more light comes home.',
  stonegarden: 'From inside the old stones, one more light comes home.',
  crystalcaves: 'From deep in the crystal, one more light comes home.',
  moonlake: 'From under the still water, one more light comes home.',
  shadowterrace: 'From high on the terrace, one more light comes home.',
};

export function scene(id: SceneId): Beat[] {
  if (id === 'prologue') {
    return [
      { line: 'Once, the whole world sang together.', art: { kind: 'harmony' } },
      { line: 'Then the song broke, and a family of lights was scattered.', art: { kind: 'scatter' } },
      { line: 'The smallest light woke alone.', art: { kind: 'wake' } },
    ];
  }
  if (id === 'waiting') return [{ line: 'They are all still here, waiting to be woken.', art: { kind: 'waiting' } }];
  if (id === 'finale') {
    return [
      { line: 'At last, the whole family was together.', art: { kind: 'together' } },
      { line: 'Together again, the whole world sang.', art: { kind: 'harmony', finale: true } },
    ];
  }
  const [kind, region] = id.split(':') as ['asleep' | 'home', RegionId];
  return kind === 'asleep'
    ? [{ line: ASLEEP_LINE[region], art: { kind: 'asleep', region } }]
    : [{ line: HOME_LINE[region], art: { kind: 'home', region } }];
}
