import * as Tone from 'tone';
import type { AudioEngine } from '../../audio/engine';
import { note } from '../../audio/scale';

// Shadow Terrace voice: soft wooden blocks that climb with each stone, a low knock
// when one is taken away, and a slow chord when the shadows agree.
export interface ShadowVoice {
  place(height: number): void;
  remove(): void;
  refuse(): void;
  turn(): void;
  solve(): void;
  dispose(): void;
}

export function createShadowVoice(audio: AudioEngine): ShadowVoice {
  let wood: Tone.PolySynth | null = null;
  let pad: Tone.PolySynth | null = null;

  audio.onReady(() => {
    wood = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 3.01,
      modulationIndex: 6,
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.012, decay: 0.35, sustain: 0, release: 0.6 },
      modulation: { type: 'sine' },
      modulationEnvelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.2 },
      volume: -20,
    }).connect(audio.sfx);
    pad = new Tone.PolySynth(Tone.AMSynth, {
      harmonicity: 2,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.4, decay: 1.5, sustain: 0.3, release: 3 },
      volume: -20,
    }).connect(audio.sfx);
  });

  return {
    place(height) {
      wood?.triggerAttackRelease(note(1 + height, 4), '16n', undefined, 0.45);
    },
    remove() {
      wood?.triggerAttackRelease(note(0, 3), '16n', undefined, 0.35);
    },
    refuse() {
      wood?.triggerAttackRelease(note(0, 2), '32n', undefined, 0.2);
    },
    turn() {
      if (!wood) return;
      const now = Tone.now();
      wood.triggerAttackRelease(note(2, 4), '32n', now, 0.25);
      wood.triggerAttackRelease(note(4, 4), '32n', now + 0.12, 0.25);
    },
    solve() {
      if (!pad) return;
      const now = Tone.now();
      pad.triggerAttackRelease([note(0, 3), note(2, 3), note(4, 4)], '1n', now, 0.6);
      pad.triggerAttackRelease([note(1, 4), note(3, 4), note(5, 4)], '2n', now + 1.1, 0.5);
    },
    dispose() {
      wood?.dispose();
      pad?.dispose();
    },
  };
}
