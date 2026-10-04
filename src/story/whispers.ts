import type { RegionId } from '../regions/types';

// What the light says to itself as it walks a land's trail toward the family member asleep
// there: one line per milestone, each said once, when the player next enters the land.
const WHISPERS: Array<{ at: number; line: string }> = [
  { at: 0, line: 'Someone is asleep somewhere in this land.' },
  { at: 1, line: 'A little warmth… further along the path.' },
  { at: 3, line: 'Closer now. I can almost see them.' },
  { at: 4, line: 'There you are. Still asleep.' },
  { at: 7, line: 'They are stirring. Keep going.' },
  { at: 9, line: 'One more. Just one more.' },
];

export function whisperId(region: RegionId, at: number): string {
  return `whisper:${region}:${at}`;
}

// The newest milestone reached and not yet said (older unsaid ones are skipped: only the
// latest is worth saying), plus every id it covers, to be marked as said.
export function whisperFor(region: RegionId, solved: number, seen: ReadonlySet<string>): { line: string; ids: string[] } | null {
  const reached = WHISPERS.filter((w) => w.at <= solved);
  const latest = reached[reached.length - 1];
  if (!latest || seen.has(whisperId(region, latest.at))) return null;
  return { line: latest.line, ids: reached.map((w) => whisperId(region, w.at)) };
}
