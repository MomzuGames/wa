import * as Tone from 'tone';
import type { AudioEngine } from '../../audio/engine';
import { note } from '../../audio/scale';

// Stone Garden voice: a kalimba-like pluck for handling pieces and a soft wooden tap for misses.
export interface StoneVoice {
  lift(): void;
  turn(): void;
  settle(count: number): void;
  miss(): void;
  solve(): void;
  dispose(): void;
}

export function createStoneVoice(audio: AudioEngine): StoneVoice {
  let kalimba: Tone.PolySynth | null = null;
  let wood: Tone.MembraneSynth | null = null;

  audio.onReady(() => {
    kalimba = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.012, decay: 0.6, sustain: 0, release: 1.1 },
      volume: -17,
    }).connect(audio.sfx);
    wood = new Tone.MembraneSynth({
      pitchDecay: 0.02,
      octaves: 0.6,
      envelope: { attack: 0.012, decay: 0.12, sustain: 0, release: 0.2 },
      volume: -22,
    }).connect(audio.sfx);
  });

  return {
    lift() {
      kalimba?.triggerAttackRelease(note(4, 4), '16n', undefined, 0.35);
    },
    turn() {
      kalimba?.triggerAttackRelease(note(2, 5), '32n', undefined, 0.25);
    },
    settle(count) {
      kalimba?.triggerAttackRelease(note(count % 5, 4), '8n', undefined, 0.6);
    },
    miss() {
      wood?.triggerAttackRelease('D3', '16n');
    },
    solve() {
      if (!kalimba) return;
      const now = Tone.now();
      [0, 2, 4, 7, 9].forEach((d, i) => kalimba!.triggerAttackRelease(note(d, 4), '4n', now + i * 0.15, 0.55));
    },
    dispose() {
      kalimba?.dispose();
      wood?.dispose();
    },
  };
}
