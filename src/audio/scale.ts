// D major pentatonic: D E F# A B. Everything in the game is drawn from this set.
export const PENTATONIC = ['D', 'E', 'F#', 'A', 'B'] as const;
export type PentatonicNote = (typeof PENTATONIC)[number];

export function note(degree: number, octave: number): string {
  const wrapped = ((degree % PENTATONIC.length) + PENTATONIC.length) % PENTATONIC.length;
  const octaveShift = Math.floor(degree / PENTATONIC.length);
  return `${PENTATONIC[wrapped]}${octave + octaveShift}`;
}

export function scaleNotes(octave: number, count: number, startDegree = 0): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(note(startDegree + i, octave));
  return out;
}

export const ROOT = 'D';
export const FIFTH = 'A';
