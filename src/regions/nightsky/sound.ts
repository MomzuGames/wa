import * as Tone from 'tone';
import type { AudioEngine } from '../../audio/engine';
import { note } from '../../audio/scale';

// Night Sky voice: a glassy FM celesta. Each traced line plays the next note of a rising line.
export interface NightSkyVoice {
  step(index: number): void;
  unravel(): void;
  replay(count: number, stepSeconds: number): void;
  dispose(): void;
}

function degreeFor(index: number): number {
  // Rise through two octaves of the pentatonic, then fold back down gently.
  const span = 10;
  const k = index % (span * 2);
  return k < span ? k : span * 2 - k;
}

export function createNightSkyVoice(audio: AudioEngine): NightSkyVoice {
  let celesta: Tone.PolySynth | null = null;

  audio.onReady(() => {
    celesta = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 3.01,
      modulationIndex: 6,
      oscillator: { type: 'sine' },
      modulation: { type: 'sine' },
      envelope: { attack: 0.012, decay: 0.9, sustain: 0, release: 1.6 },
      modulationEnvelope: { attack: 0.01, decay: 0.3, sustain: 0, release: 0.5 },
      volume: -20,
    }).connect(audio.sfx);
  });

  return {
    step(index) {
      celesta?.triggerAttackRelease(note(degreeFor(index), 5), '8n', undefined, 0.5);
    },
    unravel() {
      if (!celesta) return;
      const now = Tone.now();
      celesta.triggerAttackRelease(note(2, 4), '8n', now, 0.2);
      celesta.triggerAttackRelease(note(0, 4), '4n', now + 0.25, 0.15);
    },
    replay(count, stepSeconds) {
      if (!celesta) return;
      const now = Tone.now();
      for (let i = 0; i < count; i++) {
        celesta.triggerAttackRelease(note(degreeFor(i), 5), '8n', now + i * stepSeconds, 0.45);
      }
    },
    dispose() {
      celesta?.dispose();
    },
  };
}
