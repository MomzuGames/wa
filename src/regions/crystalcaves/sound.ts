import * as Tone from 'tone';
import type { AudioEngine } from '../../audio/engine';
import { note } from '../../audio/scale';

// Crystal Caves voice: singing-bowl sines with long tails.
export interface CrystalVoice {
  turn(index: number): void;
  targetLit(count: number): void;
  solve(): void;
  dispose(): void;
}

export function createCrystalVoice(audio: AudioEngine): CrystalVoice {
  let bowl: Tone.PolySynth | null = null;
  let tick: Tone.Synth | null = null;

  audio.onReady(() => {
    bowl = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.05, decay: 1.5, sustain: 0.2, release: 4 },
      volume: -18,
    }).connect(audio.sfx);
    tick = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.012, decay: 0.15, sustain: 0, release: 0.3 },
      volume: -24,
    }).connect(audio.sfx);
  });

  return {
    turn(index) {
      tick?.triggerAttackRelease(note(index % 5, 5), '32n');
    },
    targetLit(count) {
      bowl?.triggerAttackRelease(note(count % 5, 4), '2n', undefined, 0.5);
    },
    solve() {
      if (!bowl) return;
      const now = Tone.now();
      [0, 2, 4, 7].forEach((d, i) => bowl!.triggerAttackRelease(note(d, 4), '1n', now + i * 0.25, 0.5));
    },
    dispose() {
      bowl?.dispose();
      tick?.dispose();
    },
  };
}
