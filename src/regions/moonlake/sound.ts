import * as Tone from 'tone';
import type { AudioEngine } from '../../audio/engine';
import { note } from '../../audio/scale';

// Moon Lake voice: a warm electric-piano tone for each press and a swell on solve.
export interface MoonVoice {
  press(index: number): void;
  solve(): void;
  dispose(): void;
}

export function createMoonVoice(audio: AudioEngine): MoonVoice {
  let piano: Tone.PolySynth | null = null;

  audio.onReady(() => {
    piano = new Tone.PolySynth(Tone.AMSynth, {
      harmonicity: 2,
      oscillator: { type: 'sine' },
      modulation: { type: 'sine' },
      envelope: { attack: 0.02, decay: 0.8, sustain: 0.1, release: 1.8 },
      modulationEnvelope: { attack: 0.02, decay: 0.4, sustain: 0.2, release: 1 },
      volume: -18,
    }).connect(audio.sfx);
  });

  return {
    press(index) {
      piano?.triggerAttackRelease(note(index % 5, 4), '8n', undefined, 0.5);
    },
    solve() {
      if (!piano) return;
      const now = Tone.now();
      piano.triggerAttackRelease([note(0, 3), note(2, 4), note(4, 4), note(7, 4)], '1n', now, 0.6);
      piano.triggerAttackRelease([note(0, 4), note(3, 4), note(5, 5)], '2n', now + 1.2, 0.5);
    },
    dispose() {
      piano?.dispose();
    },
  };
}
