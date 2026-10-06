import * as Tone from 'tone';
import { events } from '../core/events';
import { getSettings, type Settings } from '../core/save';
import { Ambient } from './ambient';
import { createBed, type Bed } from './beds';
import { StoryScore, type StoryMood } from './storyScore';

export type MusicScene = 'title' | 'map' | 'celebration' | 'quiet' | RegionId;
import type { RegionId } from '../regions/types';
import { note } from './scale';
import { IS_APP } from '../config/platform';
import { dlog } from '../core/debugLog';

export const audioConfig = {
  limiterCeilingDb: -12,
  reverbDecaySeconds: 7,
  reverbWet: 0.42,
  lowCutHz: 60,
  highCutHz: 8000,
  minSliderDb: -36,
  resumeChecks: [0, 300, 900, 1800, 3000], // ms after coming back
  kickAfter: 1200, // ms after coming back: restart the output once the app has settled
} as const;

// iOS mutes Web Audio when the ringer switch is on silent, unless the page has played
// through a media element. A looping silent clip flips the audio session to "playback".
let mediaUnlocked = false;
function unlockMediaSession(): void {
  if (mediaUnlocked) return;
  mediaUnlocked = true;
  try {
    const el = document.createElement('audio');
    el.setAttribute('playsinline', '');
    el.loop = true;
    el.volume = 0.01;
    // A tiny silent WAV.
    el.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
    void el.play().catch(() => undefined);
  } catch {
    // Not available; the game still works, just subject to the silent switch.
  }
}

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

  // Whether sound can play right now. After the phone was locked iOS keeps the audio clock
  // frozen until the next tap; scheduling notes then throws ("start time must be strictly
  // greater than previous start time"), which used to break the move that played them.
  get running(): boolean {
    return this.started && Tone.getContext().state === 'running';
  }

  // Region voices go through this: sound must never interrupt play. While the audio clock is
  // not running, notes are skipped; any other sound error is swallowed.
  guard<T extends object>(voice: T): T {
    return new Proxy(voice, {
      get: (target, key) => {
        const value = Reflect.get(target, key) as unknown;
        if (typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          if (key !== 'dispose' && !this.running) return undefined;
          try {
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          } catch {
            return undefined;
          }
        };
      },
    });
  }

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
  private scene: MusicScene = 'quiet';
  private beds = new Map<RegionId | 'map' | 'celebration', Bed>();
  // The story's score; while it plays, the scene's own music rests.
  private score: StoryScore | null = null;
  private storyOn = false;
  private storyMoodNow: StoryMood = 'harmony'; // remembered, in case sound starts mid-story

  // Silence while the game is in the background (another app, the lock screen) and pick
  // up again on return; iOS may have interrupted the audio context in between.
  private followingVisibility = false;

  // Sound across the app going to the background and back.
  // - Website: pause on leaving, resume on return (a tap may be needed, as browsers require).
  // - App: never pause it ourselves. iOS silences a backgrounded app anyway, and it only
  //   brings back audio that iOS itself interrupted; a context the page suspended stays
  //   suspended. On return, check a few times over the next seconds (iOS reactivates the
  //   app's sound a moment after the page becomes visible) and resume if needed.
  private followVisibility(): void {
    if (this.followingVisibility) return;
    this.followingVisibility = true;
    document.addEventListener('visibilitychange', () => {
      const context = Tone.getContext().rawContext as AudioContext;
      if (document.hidden) {
        if (!IS_APP) void context.suspend().catch(() => undefined);
        return;
      }
      // Re-declare the kind of sound this is (the app's native side reopens the session).
      const nav = navigator as Navigator & { audioSession?: { type: string; state?: string } };
      if (IS_APP && nav.audioSession) nav.audioSession.type = 'ambient';
      for (const ms of audioConfig.resumeChecks) {
        setTimeout(() => {
          dlog('audio-check', { after: ms, context: context.state, session: nav.audioSession?.state ?? 'n/a' });
          if (context.state === 'running') return;
          void context
            .resume()
            .catch(() => undefined)
            .then(() => dlog('audio-resume', { after: ms, state: context.state }));
        }, ms);
      }
      // After the lock screen iOS can leave the audio clock "running" with its output cut.
      // A full pause and restart once the app is settled reconnects it.
      if (IS_APP) setTimeout(() => void this.kick('return'), audioConfig.kickAfter);
    });
    // A tap is always a good moment to try again, should the checks above not take.
    const retry = () => {
      if (this.started && Tone.getContext().state !== 'running') void Tone.getContext().resume().catch(() => undefined);
    };
    for (const type of ['touchend', 'click', 'keydown']) window.addEventListener(type, retry);
  }

  // Pause and restart the audio output, then play a moment of silence through it: the
  // known cure for WebKit audio that reports "running" but makes no sound after an
  // interruption. Harmless when the sound was fine.
  private async kick(why: string): Promise<void> {
    const context = Tone.getContext().rawContext as AudioContext;
    const t0 = context.currentTime;
    try {
      await context.suspend();
      await context.resume();
      const blip = context.createBufferSource();
      blip.buffer = context.createBuffer(1, 1, context.sampleRate);
      blip.connect(context.destination);
      blip.start();
    } catch (e) {
      dlog('audio-kick-failed', { why, message: String((e as Error)?.message ?? e) });
      return;
    }
    // Whether the clock is really moving tells us if the output is alive.
    setTimeout(() => dlog('audio-kick', { why, state: context.state, clockMoved: +(context.currentTime - t0).toFixed(2) }), 500);
  }

  async start(): Promise<void> {
    if (this.started || this.starting) return;
    this.starting = true;
    // The app follows the silent switch like other games (see core/native.ts); the website plays through it.
    if (!IS_APP) unlockMediaSession();
    this.followVisibility();
    try {
      await Tone.start();
    } catch {
      this.starting = false;
      return;
    }
    dlog('audio-start', { state: Tone.getContext().state, app: IS_APP });
    // A start that follows a reload on unlock can hit the same cut output: restart it once.
    if (IS_APP) setTimeout(() => void this.kick('launch'), audioConfig.kickAfter);
    // Some browsers resolve start() without actually running; try again on the next gesture.
    if (Tone.getContext().state !== 'running') {
      this.starting = false;
      return;
    }

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
    if (this.scene !== 'title' && this.scene !== 'quiet' && !this.storyOn) this.bedFor(this.scene).start();
    if (this.storyOn) {
      this.scoreFor().start();
      this.scoreFor().setMood(this.storyMoodNow);
    }

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

  private bedFor(id: RegionId | 'map' | 'celebration'): Bed {
    let bed = this.beds.get(id);
    if (!bed) {
      bed = createBed(id, this.musicBus);
      this.beds.set(id, bed);
    }
    return bed;
  }

  // Which music plays: the title drone, the map's theme, a region's bed, or nothing.
  // Cross-fades. While the story plays its score, the scene's music waits.
  setScene(scene: MusicScene): void {
    if (scene === this.scene) return;
    const previous = this.scene;
    this.scene = scene;
    if (this.storyOn) return;
    this.setAmbient(scene === 'title');
    if (!this.started) return;
    if (previous !== 'title' && previous !== 'quiet') this.beds.get(previous)?.stop();
    if (scene !== 'title' && scene !== 'quiet') this.bedFor(scene).start();
  }

  private scoreFor(): StoryScore {
    this.score ??= new StoryScore(this.musicBus);
    return this.score;
  }

  // The story begins: the scene's music fades out and the story's score fades in.
  storyStart(): void {
    if (this.storyOn) return;
    this.storyOn = true;
    this.setAmbient(false);
    if (!this.started) return;
    if (this.scene !== 'title' && this.scene !== 'quiet') this.beds.get(this.scene)?.stop();
    this.scoreFor().start();
  }

  // Each beat of the story turns the score toward its mood.
  storyMood(mood: StoryMood): void {
    this.storyMoodNow = mood;
    if (!this.started) return;
    this.scoreFor().setMood(mood);
  }

  // The Silence falls in the opening: the score stops at once with a deep boom.
  storyHush(): void {
    if (!this.started) return;
    this.scoreFor().hush();
  }

  // The story ends: the score fades and the scene's music comes back.
  storyEnd(): void {
    if (!this.storyOn) return;
    this.storyOn = false;
    this.score?.stop();
    this.setAmbient(this.scene === 'title');
    if (this.started && this.scene !== 'title' && this.scene !== 'quiet') this.bedFor(this.scene).start();
  }

  // A single soft pentatonic tone for UI feedback.
  pluck(noteName: string, velocity = 0.8): void {
    if (!this.running) return;
    this.uiVoice?.triggerAttackRelease(noteName, '8n', undefined, velocity);
  }

  // A quiet descending three-note breath.
  failure(): void {
    if (!this.running) return;
    if (!this.uiVoice) return;
    const now = Tone.now();
    this.uiVoice.triggerAttackRelease(note(3, 4), '8n', now, 0.25);
    this.uiVoice.triggerAttackRelease(note(2, 4), '8n', now + 0.22, 0.2);
    this.uiVoice.triggerAttackRelease(note(0, 4), '4n', now + 0.46, 0.16);
  }

  // A single wind-chime tone for a newly available clue.
  chime(): void {
    if (!this.running) return;
    if (!this.uiVoice) return;
    const now = Tone.now();
    this.uiVoice.triggerAttackRelease(note(4, 5), '2n', now, 0.35);
    this.uiVoice.triggerAttackRelease(note(6, 5), '2n', now + 0.03, 0.18);
  }

  // A short rising phrase for a solved level.
  solvePhrase(): void {
    if (!this.running) return;
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
