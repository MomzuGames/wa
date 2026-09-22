import type { Settings } from './save';
import type { PaletteToken } from '../design/palette';
import type { QualityTier } from '../design/quality';

export type SpiritReaction = 'move' | 'attempt' | 'solved' | 'hide' | 'show';

export interface GameEvents {
  'settings:changed': Settings;
  'spirit:glide': { x: number; y: number; duration?: number; hop?: boolean };
  'spirit:orbit': { x: number; y: number; radius: number };
  // Roam a loop of places, pausing at each; the map and the level trail use this.
  'spirit:tour': { points: Array<{ x: number; y: number }>; pause?: number; start?: number };
  // A gleeful burst (the title click) and a leap into a place (choosing a region or level).
  'spirit:joy': { x: number; y: number };
  'spirit:dive': { x: number; y: number };
  // Where the light is, every frame, so scenes can brighten what it passes.
  'spirit:at': { x: number; y: number };
  'spirit:tint': PaletteToken;
  'spirit:react': SpiritReaction;
  'audio:started': void;
  'progress:changed': void;
  'profile:changed': void;
  'input:back': void;
  'input:mute': void;
  'input:hint': void;
  'input:restart': void;
  'input:key': string;
  // A level explaining something about the current state (shown as a toast by the shell).
  'level:note': string;
  // The visual tier changed (measured or chosen): effects rebuild themselves.
  'quality:changed': QualityTier;
}

type Handler<T> = (payload: T) => void;

class EventBus {
  private handlers = new Map<keyof GameEvents, Set<Handler<unknown>>>();

  on<K extends keyof GameEvents>(event: K, handler: Handler<GameEvents[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<unknown>);
    return () => set!.delete(handler as Handler<unknown>);
  }

  emit<K extends keyof GameEvents>(event: K, ...args: GameEvents[K] extends void ? [] : [GameEvents[K]]): void {
    this.handlers.get(event)?.forEach((h) => h(args[0]));
  }
}

export const events = new EventBus();
