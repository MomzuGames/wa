import * as Tone from 'tone';
import { events } from '../core/events';
import { getSettings, type Settings } from '../core/save';
import { Ambient } from './ambient';

export const audioConfig = {
  limiterCeilingDb: -12,
  reverbDecaySeconds: 7,
  reverbWet: 0.42,
  lowCutHz: 60,
  highCutHz: 8000,
  minSliderDb: -36,
} as const;

function sliderToDb(value: number): number {
  if (value <= 0) return -Infinity;
  return audioConfig.minSliderDb * (1 - value);
}

export class AudioEngine {
  private started = false;
  private master!: Tone.Volume;
  private musicBus!: Tone.Volume;
  private sfxBus!: Tone.Volume;
  private ambient: Ambient | null = null;
  private uiVoice: Tone.PolySynth | null = null;

  get isStarted(): boolean {
    return this.started;
  }

  get music(): Tone.ToneAudioNode {
    return this.musicBus;
  }

  get sfx(): Tone.ToneAudioNode {
    return this.sfxBus;
  }

  async start(): Promise<void> {
    if (this.started) return;
    await Tone.start();

    const limiter = new Tone.Limiter(audioConfig.limiterCeilingDb);
    const reverb = new Tone.Reverb({ decay: audioConfig.reverbDecaySeconds, wet: audioConfig.reverbWet });
    const lowCut = new Tone.Filter({ type: 'highpass', frequency: audioConfig.lowCutHz, rolloff: -24 });
    const highCut = new Tone.Filter({ type: 'lowpass', frequency: audioConfig.highCutHz, rolloff: -24 });

    this.master = new Tone.Volume(0);
    this.musicBus = new Tone.Volume(0);
    this.sfxBus = new Tone.Volume(0);

    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.master.chain(lowCut, highCut, limiter, reverb, Tone.getDestination());

    await reverb.ready;

    this.ambient = new Ambient(this.musicBus);
    this.ambient.start();

    this.uiVoice = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.02, decay: 0.4, sustain: 0, release: 1.2 },
      volume: -14,
    }).connect(this.sfxBus);

    this.started = true;
    this.applySettings(getSettings());
    events.on('settings:changed', (s) => this.applySettings(s));
    events.emit('audio:started');
  }

  // A single soft pentatonic tone for UI feedback.
  pluck(noteName: string): void {
    this.uiVoice?.triggerAttackRelease(noteName, '8n');
  }

  applySettings(settings: Settings): void {
    if (!this.started) return;
    Tone.getDestination().mute = settings.muted;
    this.musicBus.volume.rampTo(sliderToDb(settings.music), 0.2);
    this.sfxBus.volume.rampTo(sliderToDb(settings.sfx), 0.2);
  }
}
