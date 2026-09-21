import * as Tone from 'tone';

// Slow, mutually irrational LFO rates so the bed never audibly repeats.
const ambientConfig = {
  fadeInSeconds: 6,
  fadeOutSeconds: 3,
  droneLevelDb: -22,
  airLevelDb: -34,
  filterBaseHz: 420,
  filterSweepHz: 260,
  filterLfoHz: 0.0137,
  detuneCents: 6,
  detuneLfoHz: 0.0211,
  swellLfoHz: 0.0173,
  airFilterBaseHz: 900,
  airFilterSweepHz: 500,
  airLfoHz: 0.0091,
} as const;

interface Voice {
  osc: Tone.Oscillator;
  detuneLfo: Tone.LFO;
}

export class Ambient {
  private output: Tone.Volume;
  private voices: Voice[] = [];
  private filter: Tone.Filter;
  private filterLfo: Tone.LFO;
  private swell: Tone.Gain;
  private swellLfo: Tone.LFO;
  private air: Tone.Noise;
  private airFilter: Tone.Filter;
  private airLfo: Tone.LFO;
  private airLevel: Tone.Volume;

  constructor(destination: Tone.ToneAudioNode) {
    this.output = new Tone.Volume(-Infinity).connect(destination);

    this.swell = new Tone.Gain(0.85).connect(this.output);
    this.swellLfo = new Tone.LFO({ frequency: ambientConfig.swellLfoHz, min: 0.7, max: 1 }).connect(this.swell.gain);

    this.filter = new Tone.Filter({ type: 'lowpass', frequency: ambientConfig.filterBaseHz, Q: 0.6 }).connect(this.swell);
    this.filterLfo = new Tone.LFO({
      frequency: ambientConfig.filterLfoHz,
      min: ambientConfig.filterBaseHz - ambientConfig.filterSweepHz * 0.5,
      max: ambientConfig.filterBaseHz + ambientConfig.filterSweepHz,
    }).connect(this.filter.frequency);

    const droneLevel = new Tone.Volume(ambientConfig.droneLevelDb).connect(this.filter);
    const notes: Array<{ note: string; type: 'sine' | 'triangle'; lfoRate: number }> = [
      { note: 'D2', type: 'sine', lfoRate: ambientConfig.detuneLfoHz },
      { note: 'D3', type: 'triangle', lfoRate: ambientConfig.detuneLfoHz * 1.31 },
      { note: 'A2', type: 'sine', lfoRate: ambientConfig.detuneLfoHz * 0.83 },
      { note: 'A3', type: 'triangle', lfoRate: ambientConfig.detuneLfoHz * 1.07 },
    ];
    for (const n of notes) {
      const osc = new Tone.Oscillator({ frequency: n.note, type: n.type, volume: -6 }).connect(droneLevel);
      const detuneLfo = new Tone.LFO({
        frequency: n.lfoRate,
        min: -ambientConfig.detuneCents,
        max: ambientConfig.detuneCents,
      }).connect(osc.detune);
      this.voices.push({ osc, detuneLfo });
    }

    this.airLevel = new Tone.Volume(ambientConfig.airLevelDb).connect(this.swell);
    this.airFilter = new Tone.Filter({ type: 'bandpass', frequency: ambientConfig.airFilterBaseHz, Q: 1.2 }).connect(this.airLevel);
    this.airLfo = new Tone.LFO({
      frequency: ambientConfig.airLfoHz,
      min: ambientConfig.airFilterBaseHz - ambientConfig.airFilterSweepHz,
      max: ambientConfig.airFilterBaseHz + ambientConfig.airFilterSweepHz,
    }).connect(this.airFilter.frequency);
    this.air = new Tone.Noise('pink').connect(this.airFilter);
  }

  start(): void {
    const now = Tone.now();
    for (const v of this.voices) {
      v.osc.start(now);
      v.detuneLfo.start(now);
    }
    this.filterLfo.start(now);
    this.swellLfo.start(now);
    this.airLfo.start(now);
    this.air.start(now);
    this.output.volume.rampTo(0, ambientConfig.fadeInSeconds, now);
  }

  stop(): void {
    this.output.volume.rampTo(-Infinity, ambientConfig.fadeOutSeconds);
  }
}
