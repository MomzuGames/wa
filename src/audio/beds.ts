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
  level: 1.5, // the whole bed, a little above its quiet textures alone
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
      parts.out.gain.rampTo(bedConfig.level, bedConfig.fadeInSeconds, now);
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

interface Voice {
  triggerAttackRelease(note: string, duration: Tone.Unit.Time, time?: Tone.Unit.Time, velocity?: number): unknown;
}

// Each land's signature: a short melody on its own instrument, at its own pace, that comes
// back after a quiet stretch, alternating between its phrases so it is recognisable
// without looping audibly. Phrases are pentatonic degrees (7 is the octave above 2).
function melody(p: Parts, voice: Voice, octave: number, phrases: number[][], step: number, rest: [number, number], velocity = 0.5): void {
  let phrase = 0;
  let i = 0;
  let wait = Math.round(rest[0] / 2 / step);
  const loop = new Tone.Loop((time) => {
    if (wait > 0) {
      wait--;
      return;
    }
    const notes = phrases[phrase % phrases.length]!;
    voice.triggerAttackRelease(note(notes[i]!, octave), step * 1.8, time, velocity * (0.85 + Math.random() * 0.3));
    i++;
    if (i >= notes.length) {
      i = 0;
      phrase++;
      wait = Math.round((rest[0] + Math.random() * (rest[1] - rest[0])) / step);
    }
  }, step);
  p.loops.push(loop);
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
  // Melody: a soft marimba rocking like small waves.
  const marimba = new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.012, decay: 0.7, sustain: 0, release: 0.8 }, volume: -19 }).connect(p.out);
  melody(p, marimba, 4, [[0, 2, 4, 2, 1, 0], [4, 5, 4, 2, 3, 2]], 0.42, [7, 11]);
  p.sources.push(noise, lapLfo, filterLfo);
  p.loops.push(loop);
  p.disposables.push(lap, lapLfo, filter, filterLfo, noise, drip, marimba);
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
  // Melody: a twinkling celesta, high and quick, like stars coming out.
  const celesta = new Tone.FMSynth({
    harmonicity: 4,
    modulationIndex: 2,
    envelope: { attack: 0.012, decay: 0.9, sustain: 0, release: 1.4 },
    modulationEnvelope: { attack: 0.01, decay: 0.3, sustain: 0, release: 0.4 },
    volume: -21,
  }).connect(chorus);
  melody(p, celesta, 5, [[4, 7, 9, 7, 5, 4], [2, 4, 7, 9, 10, 9, 7]], 0.28, [8, 13], 0.45);
  p.sources.push(chorus);
  p.loops.push(chordLoop, bellLoop);
  p.disposables.push(pad, chorus, bell, celesta);
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
  // Melody: a warm kalimba, unhurried, settling back onto the root like a stone set down.
  const kalimba = new Tone.FMSynth({
    harmonicity: 5.07,
    modulationIndex: 1.4,
    envelope: { attack: 0.012, decay: 1.1, sustain: 0, release: 1.2 },
    modulationEnvelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.2 },
    volume: -18,
  }).connect(p.out);
  melody(p, kalimba, 4, [[0, 0, 2, 4, 2], [3, 2, 1, 0]], 0.55, [8, 12]);
  p.sources.push(oscA, oscB, humLfo, detune);
  p.loops.push(loop);
  p.disposables.push(hum, humLfo, filter, oscA, oscB, detune, wood, kalimba);
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
  // Melody: slow glassy rings, notes leaning on each other, echoing in the cave.
  const glass = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.02, decay: 2.8, sustain: 0, release: 3 }, volume: -18 }).connect(p.out);
  const echo = new Tone.FeedbackDelay({ delayTime: 0.75, feedback: 0.35, wet: 0.35 }).connect(p.out);
  glass.connect(echo);
  melody(p, glass, 5, [[0, 3, 2], [4, 3, 1, 0]], 1.3, [6, 10], 0.55);
  p.sources.push(hiA, hiB, shimmerLfo, hiLfo);
  p.loops.push(bowlLoop);
  p.disposables.push(bowls, shimmer, shimmerLfo, hiA, hiB, hiLfo, glass, echo);
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
  // Melody: a gentle electric piano drifting down, like moonlight on water.
  const piano = new Tone.FMSynth({
    harmonicity: 1,
    modulationIndex: 2.2,
    envelope: { attack: 0.02, decay: 2.2, sustain: 0.15, release: 2.5 },
    modulationEnvelope: { attack: 0.01, decay: 1.2, sustain: 0.1, release: 1.5 },
    volume: -19,
  }).connect(filter);
  melody(p, piano, 4, [[7, 5, 4, 2, 1, 0], [4, 5, 7, 5, 4]], 0.75, [9, 14], 0.55);
  p.sources.push(subOsc, subLfo);
  p.loops.push(swell);
  p.disposables.push(pad, filter, sub, subLfo, subOsc, piano);
  return finish(p);
}

// Shadow Terrace: a slow koto-like pluck wandering the scale over a breathy low pad.
function shadowterrace(destination: Tone.ToneAudioNode): Bed {
  const p = frame(destination);
  const pluck = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 2,
    modulationIndex: 3,
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.02, decay: 1.6, sustain: 0, release: 2.5 },
    modulation: { type: 'sine' },
    modulationEnvelope: { attack: 0.01, decay: 0.6, sustain: 0, release: 0.5 },
    volume: -27,
  });
  const pluckFilter = new Tone.Filter({ type: 'lowpass', frequency: 1800, Q: 0.3 }).connect(p.out);
  pluck.connect(pluckFilter);
  const degrees = [0, 1, 2, 4, 5, 7, 4, 2];
  let k = 0;
  const wander = new Tone.Loop((time) => {
    if (Math.random() < 0.25) return;
    const step = Math.random() < 0.7 ? 1 : -1;
    k = (k + step + degrees.length) % degrees.length;
    pluck.triggerAttackRelease(note(degrees[k]!, 4), '2n', time, 0.35 + Math.random() * 0.2);
  }, 1.9);
  const pad = new Tone.PolySynth(Tone.AMSynth, {
    harmonicity: 1,
    oscillator: { type: 'sine' },
    envelope: { attack: 6, decay: 2, sustain: 0.6, release: 8 },
    volume: -30,
  });
  const padFilter = new Tone.Filter({ type: 'lowpass', frequency: 600, Q: 0.3 }).connect(p.out);
  pad.connect(padFilter);
  const chords = [
    [note(0, 2), note(4, 3), note(1, 4)],
    [note(3, 2), note(0, 3), note(2, 4)],
  ];
  let c = 0;
  const swell = new Tone.Loop((time) => {
    pad.triggerAttackRelease(chords[c % chords.length]!, 12, time, 0.5);
    c++;
  }, 17);
  const breath = new Tone.Noise({ type: 'brown', volume: -40 });
  const breathFilter = new Tone.Filter({ type: 'bandpass', frequency: 300, Q: 0.6 }).connect(p.out);
  breath.connect(breathFilter);
  const breathLfo = new Tone.LFO({ frequency: 0.05, min: 180, max: 420 }).connect(breathFilter.frequency);
  // Melody: a koto figure climbing the terrace step by step, then resting.
  melody(p, pluck, 4, [[0, 1, 2, 4, 5, 4], [2, 4, 5, 7, 5]], 0.45, [10, 15], 0.6);
  p.sources.push(breath, breathLfo);
  p.loops.push(wander, swell);
  p.disposables.push(pluck, pluckFilter, pad, padFilter, breath, breathFilter, breathLfo);
  return finish(p);
}

// The world map: the journey's own theme. A warm, slow pad moving between open chords, a
// soft low drone, and a gentle music-box tune that wanders and rests, calm enough to sit
// under the light's tour of the lands.
function map(destination: Tone.ToneAudioNode): Bed {
  const p = frame(destination);
  const pad = new Tone.PolySynth(Tone.AMSynth, {
    harmonicity: 1.5,
    oscillator: { type: 'sine' },
    modulation: { type: 'sine' },
    envelope: { attack: 4, decay: 2, sustain: 0.6, release: 6 },
    modulationEnvelope: { attack: 3, decay: 1.5, sustain: 0.4, release: 4 },
    volume: -27,
  });
  const padFilter = new Tone.Filter({ type: 'lowpass', frequency: 1100, Q: 0.4 }).connect(p.out);
  pad.connect(padFilter);
  const chords = [
    [note(0, 3), note(2, 3), note(3, 3), note(0, 4)],
    [note(4, 2), note(0, 3), note(2, 3), note(4, 3)],
    [note(3, 2), note(0, 3), note(1, 3), note(3, 3)],
    [note(1, 3), note(3, 3), note(4, 3)],
  ];
  let c = 0;
  const swell = new Tone.Loop((time) => {
    pad.triggerAttackRelease(chords[c % chords.length]!, 10, time, 0.55);
    c += Math.random() < 0.25 ? 2 : 1;
  }, 12);
  const ground = new Tone.Gain(0.5).connect(p.out);
  const groundLfo = new Tone.LFO({ frequency: 0.037, min: 0.25, max: 0.6 }).connect(ground.gain);
  const groundOsc = new Tone.Oscillator({ frequency: 'D2', type: 'sine', volume: -27 }).connect(ground);
  // Melody: a music box, unhurried, like a path unfolding between the lands.
  const box = new Tone.FMSynth({
    harmonicity: 4.01,
    modulationIndex: 1.1,
    envelope: { attack: 0.012, decay: 1.5, sustain: 0, release: 1.8 },
    modulationEnvelope: { attack: 0.01, decay: 0.3, sustain: 0, release: 0.4 },
    volume: -20,
  });
  const echo = new Tone.FeedbackDelay({ delayTime: 0.66, feedback: 0.28, wet: 0.28 }).connect(p.out);
  box.connect(p.out);
  box.connect(echo);
  melody(p, box, 4, [[0, 2, 3, 4, 3, 2], [5, 4, 3, 2, 3], [3, 4, 5, 7, 5, 4, 3], [2, 3, 2, 0]], 0.6, [6, 10], 0.5);
  p.sources.push(groundOsc, groundLfo);
  p.loops.push(swell);
  p.disposables.push(pad, padFilter, ground, groundLfo, groundOsc, box, echo);
  return finish(p);
}

// The world, every land in tune again: the journey theme in full swing, upbeat yet serene.
// A soft bass walks under warm open chords, a gentle shaker and wood keep an easy pulse,
// and the family's tune passes from land to land, each phrase on one land's own voice
// (marimba, celesta, kalimba, glass, electric piano, koto), with a high bell now and then.
function celebration(destination: Tone.ToneAudioNode): Bed {
  const p = frame(destination);
  const eighth = 0.36; // seconds: an unhurried, lilting pulse
  const pad = new Tone.PolySynth(Tone.AMSynth, {
    harmonicity: 1.5,
    oscillator: { type: 'sine' },
    modulation: { type: 'sine' },
    envelope: { attack: 1.5, decay: 1.5, sustain: 0.6, release: 4 },
    volume: -23,
  });
  const padFilter = new Tone.Filter({ type: 'lowpass', frequency: 1700, Q: 0.4 }).connect(p.out);
  pad.connect(padFilter);
  const echo = new Tone.FeedbackDelay({ delayTime: eighth * 3, feedback: 0.25, wet: 0.22 }).connect(p.out);
  // Chords (degrees from octave 3) and their bass roots, one per bar of eight eighths.
  const bars = [
    { chord: [0, 2, 3, 5], root: note(0, 2) },
    { chord: [4, 5, 7, 9], root: note(4, 2) },
    { chord: [3, 5, 6, 8], root: note(3, 2) },
    { chord: [1, 3, 4, 6], root: note(1, 2) },
  ];
  const bass = new Tone.MonoSynth({
    oscillator: { type: 'triangle' },
    filter: { Q: 1, type: 'lowpass', rolloff: -24 },
    envelope: { attack: 0.02, decay: 0.4, sustain: 0.4, release: 0.8 },
    filterEnvelope: { attack: 0.02, decay: 0.3, sustain: 0.3, release: 0.6, baseFrequency: 180, octaves: 2 },
    volume: -17,
  }).connect(p.out);
  const shaker = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.012, decay: 0.07, sustain: 0, release: 0.05 }, volume: -36 });
  const shakerFilter = new Tone.Filter({ type: 'bandpass', frequency: 5200, Q: 0.8 }).connect(p.out);
  shaker.connect(shakerFilter);
  const wood = new Tone.MembraneSynth({ pitchDecay: 0.015, octaves: 0.4, envelope: { attack: 0.012, decay: 0.1, sustain: 0, release: 0.15 }, volume: -29 }).connect(p.out);
  // The six lands' voices, in journey order.
  const fm = (harmonicity: number, index: number, decay: number, volume: number) =>
    new Tone.FMSynth({ harmonicity, modulationIndex: index, envelope: { attack: 0.012, decay, sustain: 0, release: decay }, modulationEnvelope: { attack: 0.01, decay: 0.3, sustain: 0, release: 0.3 }, volume });
  const voices = [
    new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.012, decay: 0.7, sustain: 0, release: 0.8 }, volume: -13 }), // marimba
    fm(4, 2, 0.9, -16), // celesta
    fm(5.07, 1.4, 1.1, -13), // kalimba
    new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.02, decay: 1.6, sustain: 0, release: 1.8 }, volume: -12 }), // glass
    fm(1, 2.2, 1.6, -14), // electric piano
    fm(2, 3, 1.4, -16), // koto
  ];
  voices.forEach((v) => {
    v.connect(p.out);
    v.connect(echo);
  });
  const bell = fm(3.01, 5, 1.4, -27);
  bell.connect(echo);
  // The family's tune and its answers, each sixteen eighths long (null: a rest).
  const phrases: Array<Array<number | null>> = [
    [7, null, 6, null, 5, null, 3, null, 5, null, 4, 3, 2, null, null, null],
    [5, null, 7, null, 9, null, 7, 6, 5, null, 3, null, 5, null, null, null],
    [3, null, 5, 6, 5, null, 3, null, 2, null, 0, null, 2, null, null, null],
    [7, null, 9, null, 10, null, 9, 7, 6, null, 5, null, 7, null, null, null],
  ];
  let step = 0;
  const loop = new Tone.Loop((time) => {
    const bar = bars[Math.floor(step / 8) % bars.length]!;
    const inBar = step % 8;
    if (inBar === 0) pad.triggerAttackRelease(bar.chord.map((d) => note(d, 3)), eighth * 7.5, time, 0.5);
    // Bass: on the beat, with a light lift on the way to the next bar.
    if (inBar === 0 || inBar === 4) bass.triggerAttackRelease(bar.root, eighth * 1.6, time, 0.7);
    if (inBar === 7) bass.triggerAttackRelease(bar.root.replace(/\d$/, (o) => String(Number(o) + 1)), eighth * 0.8, time, 0.45);
    // Shaker on every eighth, softer off the beat; wood on two and four.
    shaker.triggerAttackRelease(eighth * 0.4, time, inBar % 2 === 0 ? 0.6 : 0.3);
    if (inBar === 2 || inBar === 6) wood.triggerAttackRelease('A3', '32n', time, 0.5);
    // The tune: one phrase per two bars, each on the next land's voice.
    const phraseIndex = Math.floor(step / 16);
    const degree = phrases[phraseIndex % phrases.length]![step % 16];
    if (degree !== null && degree !== undefined) voices[phraseIndex % voices.length]!.triggerAttackRelease(note(degree, 4), eighth * 1.8, time, 0.5 + Math.random() * 0.15);
    if (inBar === 5 && Math.random() < 0.18) bell.triggerAttackRelease(note([7, 9, 10][Math.floor(Math.random() * 3)]!, 5), eighth * 2, time, 0.35);
    step++;
  }, eighth);
  p.loops.push(loop);
  p.disposables.push(pad, padFilter, echo, bass, shaker, shakerFilter, wood, ...voices, bell);
  return finish(p);
}

export function createBed(id: RegionId | 'map' | 'celebration', destination: Tone.ToneAudioNode): Bed {
  switch (id) {
    case 'map':
      return map(destination);
    case 'celebration':
      return celebration(destination);
    case 'tidepools':
      return tidepools(destination);
    case 'nightsky':
      return nightsky(destination);
    case 'stonegarden':
      return stonegarden(destination);
    case 'crystalcaves':
      return crystalcaves(destination);
    case 'shadowterrace':
      return shadowterrace(destination);
    default:
      return moonlake(destination);
  }
}
