import * as Tone from 'tone';
import { note } from './scale';

// The story's music: a small generative film score that plays through the whole story and
// follows its mood, beat by beat. Strings-like pads swell between chords, a low drone holds
// the ground, a soft harp rises through each chord and a glassy celesta carries the tune.
// The Silence darkens and hushes it; departures, homecomings and the finale lift it. Every
// note is from the pentatonic scale, every attack is soft, and nothing loops audibly.

export type StoryMood = 'harmony' | 'silence' | 'depart' | 'sleeping' | 'shore' | 'wake' | 'asleep' | 'waiting' | 'home' | 'together' | 'finale';

interface Mood {
  chords: number[][]; // pentatonic degrees from D3 (5 is the D above)
  bright: number; // the pad's filter cutoff, Hz: low is dark and distant, high is open
  level: number; // the pad's loudness, 0..1
  drone: number; // the low drone's loudness, 0..1
  tune: number[] | null; // the celesta's tune, degrees from D4, or none
  pace: number; // seconds per tune note
  harp: boolean; // a harp rises through each new chord
  boom: boolean; // a soft low drum as the beat begins
}

const MOODS: Record<StoryMood, Mood> = {
  // Seven lights singing: warm, open, the family's theme.
  harmony: { chords: [[0, 2, 3, 5], [4, 5, 7, 9], [3, 5, 6, 8], [0, 2, 3, 5]], bright: 1900, level: 0.75, drone: 0.5, tune: [7, 6, 5, 3, 5, 4, 3, 2], pace: 0.95, harp: true, boom: false },
  // The Silence falls: the chords thin to bare fifths, the light closes, a deep drum.
  silence: { chords: [[0, 3], [-1, 3], [0, 3], [-2, 1]], bright: 520, level: 0.4, drone: 1, tune: [9, 8, 7], pace: 2.4, harp: false, boom: true },
  // The family flies out: rising, wider, hopeful but brave.
  depart: { chords: [[0, 2, 3, 5], [1, 3, 4, 6], [3, 5, 6, 8], [4, 5, 7, 9]], bright: 2300, level: 0.85, drone: 0.6, tune: [5, 6, 7, 9, 8, 7], pace: 0.7, harp: true, boom: true },
  // They sing until they fall asleep: a lullaby, slow and low.
  sleeping: { chords: [[0, 2, 3], [4, 5, 7], [3, 5, 6], [0, 2, 3]], bright: 1100, level: 0.55, drone: 0.6, tune: [7, 5, 6, 5, 3, 2, 3], pace: 1.25, harp: false, boom: false },
  // The smallest asleep on the shore: almost nothing, a few far notes.
  shore: { chords: [[0, 3], [1, 3]], bright: 800, level: 0.4, drone: 0.5, tune: [7, 9, 8], pace: 1.8, harp: false, boom: false },
  // It wakes: the light opens, the tune climbs.
  wake: { chords: [[0, 3, 5], [1, 3, 4], [0, 2, 3, 5]], bright: 1700, level: 0.6, drone: 0.4, tune: [5, 7, 9, 10, 9], pace: 0.9, harp: true, boom: false },
  // Someone sleeping in a land: the lullaby, a touch more distant.
  asleep: { chords: [[0, 2, 3], [4, 5, 7]], bright: 1000, level: 0.5, drone: 0.6, tune: [7, 5, 6, 5, 3], pace: 1.3, harp: false, boom: false },
  // All still here, waiting: suspended chords that do not resolve.
  waiting: { chords: [[1, 3, 4], [3, 5, 6], [1, 3, 4]], bright: 1300, level: 0.6, drone: 0.5, tune: [9, 7, 8, 6], pace: 1.3, harp: false, boom: false },
  // One more light comes home: rising and resolving.
  home: { chords: [[3, 5, 6], [4, 5, 7], [0, 2, 3, 5]], bright: 2100, level: 0.8, drone: 0.5, tune: [5, 7, 9, 12, 10, 9], pace: 0.75, harp: true, boom: true },
  // The family together again.
  together: { chords: [[0, 2, 3, 5], [4, 5, 7, 9], [3, 5, 6, 8], [0, 2, 3, 5]], bright: 2400, level: 0.9, drone: 0.6, tune: [7, 9, 10, 9, 7, 5, 7], pace: 0.85, harp: true, boom: true },
  // The whole world sings: the family's theme at its fullest.
  finale: { chords: [[0, 2, 3, 5, 7], [4, 5, 7, 9], [3, 5, 6, 8, 10], [0, 2, 3, 5, 7]], bright: 2800, level: 1, drone: 0.7, tune: [7, 6, 5, 3, 5, 7, 9, 10], pace: 0.8, harp: true, boom: true },
};

const scoreConfig = {
  chordSeconds: 6, // each chord holds this long before the next swells in
  fadeInSeconds: 3,
  fadeOutSeconds: 3.5,
  moodSeconds: 2.5, // how long a change of mood takes to settle
  tick: 0.1, // seconds between scheduler checks
  ahead: 0.08, // schedule this far ahead of now
} as const;

const chordNotes = (degrees: number[], octave: number) => degrees.map((d) => note(d, octave));

export class StoryScore {
  private out: Tone.Gain;
  private padLevel: Tone.Gain;
  private padFilter: Tone.Filter;
  private pad: Tone.PolySynth;
  private droneLevel: Tone.Gain;
  private drone: Tone.Oscillator[];
  private harp: Tone.PolySynth;
  private celesta: Tone.FMSynth;
  private drum: Tone.MembraneSynth;
  private air: Tone.Noise;
  private airFilter: Tone.Filter;
  private airLevel: Tone.Gain;
  private echo: Tone.FeedbackDelay;
  private timer: ReturnType<typeof setInterval> | null = null;
  private mood: Mood = MOODS.harmony;
  private chord = 0;
  private nextChord = 0;
  private tuneAt = 0;
  private nextNote = 0;
  private held: string[] = [];
  private playing = false;

  constructor(destination: Tone.ToneAudioNode) {
    this.out = new Tone.Gain(0).connect(destination);
    this.echo = new Tone.FeedbackDelay({ delayTime: 0.6, feedback: 0.3, wet: 0.3 }).connect(this.out);
    // Strings: a soft ensemble of slightly detuned saws through a slowly moving filter.
    this.padLevel = new Tone.Gain(0).connect(this.out);
    this.padFilter = new Tone.Filter({ type: 'lowpass', frequency: 1200, Q: 0.5, rolloff: -24 }).connect(this.padLevel);
    this.pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fatsawtooth', count: 3, spread: 18 },
      envelope: { attack: 2.4, decay: 1.5, sustain: 0.8, release: 4.5 },
      volume: -19,
    }).connect(this.padFilter);
    // The ground: a low drone on D and A.
    this.droneLevel = new Tone.Gain(0).connect(this.out);
    this.drone = [
      new Tone.Oscillator({ frequency: 'D2', type: 'sine', volume: -22 }).connect(this.droneLevel),
      new Tone.Oscillator({ frequency: 'A2', type: 'triangle', volume: -30 }).connect(this.droneLevel),
    ];
    // A harp for rising chords.
    this.harp = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.012, decay: 1.4, sustain: 0, release: 1.8 },
      volume: -19,
    }).connect(this.out);
    this.harp.connect(this.echo);
    // The tune: a glassy celesta.
    this.celesta = new Tone.FMSynth({
      harmonicity: 3.01,
      modulationIndex: 1.6,
      envelope: { attack: 0.015, decay: 1.8, sustain: 0, release: 2.4 },
      modulationEnvelope: { attack: 0.01, decay: 0.5, sustain: 0, release: 0.6 },
      volume: -16,
    }).connect(this.out);
    this.celesta.connect(this.echo);
    // A deep, soft drum, felt more than heard.
    this.drum = new Tone.MembraneSynth({
      pitchDecay: 0.6,
      octaves: 1.2,
      envelope: { attack: 0.02, decay: 2.6, sustain: 0, release: 2 },
      volume: -18,
    }).connect(this.out);
    // Air: filtered noise that swells as each beat turns, like a breath before a line.
    this.airLevel = new Tone.Gain(0).connect(this.out);
    this.airFilter = new Tone.Filter({ type: 'bandpass', frequency: 900, Q: 0.7 }).connect(this.airLevel);
    this.air = new Tone.Noise({ type: 'pink', volume: -26 }).connect(this.airFilter);
  }

  start(): void {
    if (this.playing) return;
    this.playing = true;
    const now = Tone.now();
    if (this.air.state !== 'started') {
      this.air.start(now);
      this.drone.forEach((o) => o.start(now));
    }
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.rampTo(1, scoreConfig.fadeInSeconds, now);
    this.nextChord = now + 0.2;
    this.nextNote = now + 1.4;
    this.timer ??= setInterval(() => this.schedule(), scoreConfig.tick * 1000);
  }

  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    const now = Tone.now();
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.rampTo(0, scoreConfig.fadeOutSeconds, now);
    this.pad.releaseAll(now);
    this.held = [];
    const timer = this.timer;
    this.timer = null;
    setTimeout(() => {
      if (timer) clearInterval(timer);
    }, scoreConfig.fadeOutSeconds * 1000);
  }

  // A new beat of the story: the music turns toward its mood with a breath of air.
  setMood(kind: StoryMood): void {
    this.mood = MOODS[kind];
    if (!this.playing) return;
    const now = Tone.now();
    const m = this.mood;
    const settle = scoreConfig.moodSeconds;
    this.padFilter.frequency.rampTo(m.bright, settle, now);
    this.padLevel.gain.rampTo(m.level, settle, now);
    this.droneLevel.gain.rampTo(m.drone * 0.8, settle, now);
    // The breath: air swells and falls as the beat turns.
    this.airLevel.gain.cancelScheduledValues(now);
    this.airLevel.gain.setValueAtTime(this.airLevel.gain.value, now);
    this.airLevel.gain.linearRampToValueAtTime(0.5, now + 1.2);
    this.airLevel.gain.linearRampToValueAtTime(0.06, now + 3.5);
    this.airFilter.frequency.cancelScheduledValues(now);
    this.airFilter.frequency.setValueAtTime(500, now);
    this.airFilter.frequency.exponentialRampToValueAtTime(m.bright > 1500 ? 2600 : 900, now + 1.4);
    if (m.boom) this.drum.triggerAttackRelease('D2', 2, now + 0.05, 0.6);
    this.chord = 0;
    this.nextChord = now + 0.15;
    this.tuneAt = 0;
    this.nextNote = now + 1.2;
  }

  private schedule(): void {
    if (!this.playing || Tone.getContext().state !== 'running') return;
    const now = Tone.now();
    const m = this.mood;
    try {
      if (now + scoreConfig.ahead >= this.nextChord) {
        const at = Math.max(now, this.nextChord);
        const notes = chordNotes(m.chords[this.chord % m.chords.length]!, 3);
        // Legato: the old chord releases as the new one swells in over it.
        if (this.held.length) this.pad.triggerRelease(this.held, at);
        this.pad.triggerAttack(notes, at, 0.5);
        this.held = notes;
        if (m.harp) notes.concat(chordNotes(m.chords[this.chord % m.chords.length]!, 4)).forEach((n, k) => this.harp.triggerAttackRelease(n, 2, at + 0.3 + k * 0.17, 0.35 + k * 0.03));
        this.chord++;
        this.nextChord = at + scoreConfig.chordSeconds;
      }
      if (m.tune && now + scoreConfig.ahead >= this.nextNote) {
        const at = Math.max(now, this.nextNote);
        const degree = m.tune[this.tuneAt % m.tune.length]!;
        this.celesta.triggerAttackRelease(note(degree, 4), m.pace * 1.6, at, 0.4 + Math.random() * 0.15);
        this.tuneAt++;
        // Breathe at the end of each phrase.
        const phraseEnd = this.tuneAt % m.tune.length === 0;
        this.nextNote = at + m.pace * (phraseEnd ? 4 + Math.random() * 2 : 0.92 + Math.random() * 0.16);
      }
    } catch {
      // Sound must never interrupt the story.
    }
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    [this.pad, this.padFilter, this.padLevel, ...this.drone, this.droneLevel, this.harp, this.celesta, this.drum, this.air, this.airFilter, this.airLevel, this.echo, this.out].forEach((n) => n.dispose());
  }
}
