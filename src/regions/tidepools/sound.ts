import * as Tone from 'tone';
import type { AudioEngine } from '../../audio/engine';
import { note } from '../../audio/scale';

// Tidepools voice: a water-droplet tap for rotations and a soft marimba for connections.
export interface TidepoolsVoice {
  rotate(column: number): void;
  connect(count: number): void;
  loopClosed(size: number): void;
  solve(): void;
  dispose(): void;
}

export function createTidepoolsVoice(audio: AudioEngine): TidepoolsVoice {
  let droplet: Tone.MembraneSynth | null = null;
  let marimba: Tone.PolySynth | null = null;

  audio.onReady(() => {
    droplet = new Tone.MembraneSynth({
      pitchDecay: 0.03,
      octaves: 1.5,
      envelope: { attack: 0.012, decay: 0.25, sustain: 0, release: 0.4 },
      volume: -18,
    }).connect(audio.sfx);
    marimba = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.012, decay: 0.45, sustain: 0, release: 0.9 },
      volume: -16,
    }).connect(audio.sfx);
  });

  return {
    rotate(column) {
      droplet?.triggerAttackRelease(note(column % 5, 5), '16n');
    },
    connect(count) {
      marimba?.triggerAttackRelease(note(count % 5, 4), '8n', undefined, 0.6);
    },
    loopClosed(size) {
      if (!marimba) return;
      const now = Tone.now();
      const steps = Math.min(4, 2 + Math.floor(size / 4));
      for (let i = 0; i < steps; i++) marimba.triggerAttackRelease(note(i * 2, 4), '8n', now + i * 0.11, 0.55);
    },
    solve() {
      if (!marimba) return;
      const now = Tone.now();
      [0, 2, 4, 5, 7].forEach((d, i) => marimba!.triggerAttackRelease(note(d, 4), '4n', now + i * 0.17, 0.6));
    },
    dispose() {
      droplet?.dispose();
      marimba?.dispose();
    },
  };
}
