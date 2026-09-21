import * as Tone from 'tone';
import type { RegionId } from '../regions/types';
import { note } from './scale';

// Generative ambient beds, one per region. Everything is pentatonic, slow and quiet,
// and driven by mutually irrational rates or random chance so nothing loops audibly.
export interface Bed {
  start(): void;
  stop(): void;
  dispose(): void;
}

const bedConfig = {
  fadeInSeconds: 5,
  fadeOutSeconds: 3,
} as const;

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

interface Parts {
  out: Tone.Gain;
  disposables: Array<{ dispose(): void }>;
  loops: Tone.Loop[];
  sources: Array<{ start(time?: number): unknown }>;
}

function frame(destination: Tone.ToneAudioNode): Parts {
  const out = new Tone.Gain(0).connect(destination);
  return { out, disposables: [out], loops: [], sources: [] };
}

function finish(parts: Parts): Bed {
  let started = false;
  return {
    start() {
      const now = Tone.now();
      if (!started) {
        started = true;
        parts.sources.forEach((s) => s.start(now));
        Tone.getTransport().start();
        parts.loops.forEach((l) => l.start(0));
      }
      parts.out.gain.cancelScheduledValues(now);
      parts.out.gain.rampTo(1, bedConfig.fadeInSeconds, now);
    },
    stop() {
      const now = Tone.now();
      parts.out.gain.cancelScheduledValues(now);
      parts.out.gain.rampTo(0, bedConfig.fadeOutSeconds, now);
    },
    dispose() {
      parts.loops.forEach((l) => l.dispose());
      parts.disposables.forEach((d) => d.dispose());
    },
  };
}

// Tidepools: lapping filtered noise with occasional water drips.
function tidepools(destination: Tone.ToneAudioNode): Bed {
  const p = frame(destination);
  const lap = new Tone.Gain(0.5).connect(p.out);
  const lapLfo = new Tone.LFO({ frequency: 0.085, min: 0.15, max: 0.6 }).connect(lap.gain);
  const filter = new Tone.Filter({ type: 'lowpass', frequency: 520, Q: 0.8 }).connect(lap);
  const filterLfo = new Tone.LFO({ frequency: 0.031, min: 320, max: 760 }).connect(filter.frequency);
  const noise = new Tone.Noise('pink').connect(filter);
  noise.volume.value = -30;
  const drip = new Tone.MembraneSynth({
    pitchDecay: 0.04,
    octaves: 1.8,
    envelope: { attack: 0.012, decay: 0.3, sustain: 0, release: 0.6 },
    volume: -26,
  }).connect(p.out);
  const loop = new Tone.Loop((time) => {
    if (Math.random() < 0.3) drip.triggerAttackRelease(note(pick([0, 1, 2, 3, 4, 6]), 5), '16n', time + Math.random() * 0.4, 0.5);
  }, '2n');
  loop.humanize = true;
  p.sources.push(noise, lapLfo, filterLfo);
  p.loops.push(loop);
  p.disposables.push(lap, lapLfo, filter, filterLfo, noise, drip);
  return finish(p);
}

// Night Sky: a high shimmering pad with rare glassy bells.
function nightsky(destination: Tone.ToneAudioNode): Bed {
  const p = frame(destination);
  const pad = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 2,
    modulationIndex: 1.2,
    oscillator: { type: 'sine' },
    modulation: { type: 'triangle' },
    envelope: { attack: 4, decay: 2, sustain: 0.6, release: 6 },
    modulationEnvelope: { attack: 3, decay: 1, sustain: 0.4, release: 4 },
    volume: -30,
  });
  const chorus = new Tone.Chorus({ frequency: 0.12, delayTime: 6, depth: 0.5, wet: 0.5 }).connect(p.out);
  pad.connect(chorus);
  const chordLoop = new Tone.Loop((time) => {
    const degrees = [0, 2, 4, 5, 7, 9];
    const chord = [pick(degrees), pick(degrees), pick(degrees)].map((d) => note(d, 5));
    pad.triggerAttackRelease(chord, 10, time, 0.5);
  }, 14);
  const bell = new Tone.FMSynth({
    harmonicity: 3.01,
    modulationIndex: 5,
    envelope: { attack: 0.012, decay: 1.4, sustain: 0, release: 2 },
    modulationEnvelope: { attack: 0.01, decay: 0.4, sustain: 0, release: 0.5 },
    volume: -30,
  }).connect(p.out);
  const bellLoop = new Tone.Loop((time) => {
    if (Math.random() < 0.22) bell.triggerAttackRelease(note(pick([4, 6, 7, 9]), 5), '8n', time, 0.4);
  }, '1n');
  p.sources.push(chorus);
  p.loops.push(chordLoop, bellLoop);
  p.disposables.push(pad, chorus, bell);
  return finish(p);
}

// Stone Garden: a warm low hum with an occasional wooden click.
function stonegarden(destination: Tone.ToneAudioNode): Bed {
  const p = frame(destination);
  const hum = new Tone.Gain(0.7).connect(p.out);
  const humLfo = new Tone.LFO({ frequency: 0.047, min: 0.45, max: 0.9 }).connect(hum.gain);
  const filter = new Tone.Filter({ type: 'lowpass', frequency: 260, Q: 0.5 }).connect(hum);
  const oscA = new Tone.Oscillator({ frequency: 'D2', type: 'sine', volume: -24 }).connect(filter);
  const oscB = new Tone.Oscillator({ frequency: 'A2', type: 'triangle', volume: -30 }).connect(filter);
  const detune = new Tone.LFO({ frequency: 0.019, min: -5, max: 5 }).connect(oscB.detune);
  const wood = new Tone.MembraneSynth({
    pitchDecay: 0.015,
    octaves: 0.4,
    envelope: { attack: 0.012, decay: 0.09, sustain: 0, release: 0.15 },
    volume: -30,
  }).connect(p.out);
  const loop = new Tone.Loop((time) => {
    if (Math.random() < 0.09) wood.triggerAttackRelease(pick(['D3', 'A3', 'E3']), '32n', time);
  }, '4n');
  loop.humanize = true;
  p.sources.push(oscA, oscB, humLfo, detune);
  p.loops.push(loop);
  p.disposables.push(hum, humLfo, filter, oscA, oscB, detune, wood);
  return finish(p);
}

// Crystal Caves: singing-bowl sines with long tails over faint high harmonics.
function crystalcaves(destination: Tone.ToneAudioNode): Bed {
  const p = frame(destination);
  const bowls = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' },
    envelope: { attack: 0.6, decay: 2, sustain: 0.3, release: 6 },
    volume: -26,
  }).connect(p.out);
  const bowlLoop = new Tone.Loop((time) => {
    if (Math.random() < 0.45) bowls.triggerAttackRelease(note(pick([0, 2, 4, 5, 7]), 4), 5, time + Math.random() * 0.6, 0.5);
  }, '1n');
  const shimmer = new Tone.Gain(0.35).connect(p.out);
  const shimmerLfo = new Tone.LFO({ frequency: 0.067, min: 0.1, max: 0.5 }).connect(shimmer.gain);
  const hiA = new Tone.Oscillator({ frequency: 'A5', type: 'sine', volume: -34 }).connect(shimmer);
  const hiB = new Tone.Oscillator({ frequency: 'E6', type: 'sine', volume: -38 }).connect(shimmer);
  const hiLfo = new Tone.LFO({ frequency: 0.023, min: -8, max: 8 }).connect(hiB.detune);
  p.sources.push(hiA, hiB, shimmerLfo, hiLfo);
  p.loops.push(bowlLoop);
  p.disposables.push(bowls, shimmer, shimmerLfo, hiA, hiB, hiLfo);
  return finish(p);
}

// Moon Lake: a warm electric-piano pad in deep, slow swells.
function moonlake(destination: Tone.ToneAudioNode): Bed {
  const p = frame(destination);
  const pad = new Tone.PolySynth(Tone.AMSynth, {
    harmonicity: 1.5,
    oscillator: { type: 'sine' },
    modulation: { type: 'sine' },
    envelope: { attack: 5, decay: 3, sustain: 0.5, release: 7 },
    modulationEnvelope: { attack: 4, decay: 2, sustain: 0.3, release: 5 },
    volume: -28,
  });
  const filter = new Tone.Filter({ type: 'lowpass', frequency: 900, Q: 0.4 }).connect(p.out);
  pad.connect(filter);
  const chords = [
    [note(0, 3), note(3, 3), note(0, 4)],
    [note(0, 3), note(2, 3), note(3, 4)],
    [note(3, 2), note(0, 3), note(1, 4)],
  ];
  let k = 0;
  const swell = new Tone.Loop((time) => {
    pad.triggerAttackRelease(chords[k % chords.length]!, 9, time, 0.6);
    k += 1 + (Math.random() < 0.3 ? 1 : 0);
  }, 13);
  const sub = new Tone.Gain(0.5).connect(p.out);
  const subLfo = new Tone.LFO({ frequency: 0.041, min: 0.2, max: 0.7 }).connect(sub.gain);
  const subOsc = new Tone.Oscillator({ frequency: 'D2', type: 'sine', volume: -26 }).connect(sub);
  p.sources.push(subOsc, subLfo);
  p.loops.push(swell);
  p.disposables.push(pad, filter, sub, subLfo, subOsc);
  return finish(p);
}

export function createBed(id: RegionId, destination: Tone.ToneAudioNode): Bed {
  switch (id) {
    case 'tidepools':
      return tidepools(destination);
    case 'nightsky':
      return nightsky(destination);
    case 'stonegarden':
      return stonegarden(destination);
    case 'crystalcaves':
      return crystalcaves(destination);
    default:
      return moonlake(destination);
  }
}
