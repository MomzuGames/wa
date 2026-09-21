import type { Settings } from './save';

export type SpiritReaction = 'move' | 'attempt' | 'solved' | 'hide' | 'show';

export interface GameEvents {
  'settings:changed': Settings;
  'spirit:glide': { x: number; y: number; duration?: number; hop?: boolean };
  'spirit:orbit': { x: number; y: number; radius: number };
  'spirit:react': SpiritReaction;
  'audio:started': void;
  'progress:changed': void;
  'sync:state': 'synced' | 'offline' | 'signed-out';
  'auth:changed': { email: string | null };
  'input:back': void;
  'input:mute': void;
  'input:hint': void;
  'input:restart': void;
  'input:key': string;
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
