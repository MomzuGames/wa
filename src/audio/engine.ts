import * as Tone from 'tone';
import { events } from '../core/events';
import { getSettings, type Settings } from '../core/save';
import { Ambient } from './ambient';
import { note } from './scale';

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
  private starting = false;
  private master!: Tone.Volume;
  private musicBus!: Tone.Volume;
  private sfxBus!: Tone.Volume;
  private ambient: Ambient | null = null;
  private uiVoice: Tone.PolySynth | null = null;

  private readyCallbacks: Array<() => void> = [];

  get isStarted(): boolean {
    return this.started;
  }

  // Runs immediately if audio is up, otherwise once the first gesture has unlocked it.
  onReady(cb: () => void): void {
    if (this.started) cb();
    else this.readyCallbacks.push(cb);
  }

  get music(): Tone.ToneAudioNode {
    return this.musicBus;
  }

  get sfx(): Tone.ToneAudioNode {
    return this.sfxBus;
  }

  private ambientWanted = false;

  async start(): Promise<void> {
    if (this.started || this.starting) return;
    this.starting = true;
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
    if (this.ambientWanted) this.ambient.start();

    this.uiVoice = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.02, decay: 0.4, sustain: 0, release: 1.2 },
      volume: -14,
    }).connect(this.sfxBus);

    this.started = true;
    this.starting = false;
    this.applySettings(getSettings());
    events.on('settings:changed', (s) => this.applySettings(s));
    events.emit('audio:started');
    this.readyCallbacks.forEach((cb) => cb());
    this.readyCallbacks = [];
  }

  // The drone is title-screen only; it fades out as the player enters the game.
  setAmbient(on: boolean): void {
    this.ambientWanted = on;
    if (!this.ambient) return;
    if (on) this.ambient.start();
    else this.ambient.stop();
  }

  // A single soft pentatonic tone for UI feedback.
  pluck(noteName: string, velocity = 0.8): void {
    this.uiVoice?.triggerAttackRelease(noteName, '8n', undefined, velocity);
  }

  // A quiet descending three-note breath.
  failure(): void {
    if (!this.uiVoice) return;
    const now = Tone.now();
    this.uiVoice.triggerAttackRelease(note(3, 4), '8n', now, 0.25);
    this.uiVoice.triggerAttackRelease(note(2, 4), '8n', now + 0.22, 0.2);
    this.uiVoice.triggerAttackRelease(note(0, 4), '4n', now + 0.46, 0.16);
  }

  // A single wind-chime tone for a newly available clue.
  chime(): void {
    if (!this.uiVoice) return;
    const now = Tone.now();
    this.uiVoice.triggerAttackRelease(note(4, 5), '2n', now, 0.35);
    this.uiVoice.triggerAttackRelease(note(6, 5), '2n', now + 0.03, 0.18);
  }

  // A short rising phrase for a solved level.
  solvePhrase(): void {
    if (!this.uiVoice) return;
    const now = Tone.now();
    [0, 2, 4, 5].forEach((degree, i) => {
      this.uiVoice!.triggerAttackRelease(note(degree, 4), '4n', now + i * 0.16, 0.5);
    });
  }

  applySettings(settings: Settings): void {
    if (!this.started) return;
    Tone.getDestination().mute = settings.muted;
    this.musicBus.volume.rampTo(sliderToDb(settings.music), 0.2);
    this.sfxBus.volume.rampTo(sliderToDb(settings.sfx), 0.2);
  }
}
