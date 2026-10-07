import type { Settings } from './save';
import type { PaletteToken } from '../design/palette';

export type SpiritReaction = 'move' | 'attempt' | 'solved' | 'hide' | 'show';

export interface GameEvents {
  'settings:changed': Settings;
  'spirit:hide': void; // the companion steps out of sight (the opening tells its own story)
  'spirit:show': { x: number; y: number };
  'spirit:glide': { x: number; y: number; duration?: number; hop?: boolean };
  'spirit:orbit': { x: number; y: number; radius: number };
  // Roam a loop of places, pausing at each; the map and the level trail use this.
  'spirit:tour': { points: Array<{ x: number; y: number }>; pause?: number; start?: number };
  // A gleeful burst (the title click) and a leap into a place (choosing a region or level).
  'spirit:joy': { x: number; y: number };
  'spirit:dive': { x: number; y: number };
  // Where the light is, every frame, so scenes can brighten what it passes.
  'spirit:at': { x: number; y: number };
  // The scene's camera: the light's coordinates are the scene's; on screen they are scaled by
  // `scale` and moved by (x, y). The scrolling world map sets it every frame; a scene change resets it.
  'spirit:camera': { x: number; y: number; scale: number; light?: number }; // light: how large the lights are drawn (screen scale), the camera's scale if left out
  'spirit:tint': PaletteToken;
  // The family lights that follow the light (one per land finished), in their colours.
  'spirit:family': PaletteToken[];
  // The light says something to itself in a small bubble, one line after another.
  'spirit:say': { lines: string[]; done?: () => void };
  'spirit:react': SpiritReaction;
  'audio:started': void;
  'progress:changed': void;
  'profile:changed': void;
  'input:back': void;
  'input:mute': void;
  'input:hint': void;
  'input:restart': void;
  // A touch was cut short (the phone locked, the app went to the background, iOS cancelled it):
  // any drag in progress must end, or the next touches are read as part of it.
  'input:cancel': void;
  'input:key': string;
  // A level explaining something about the current state (shown as a toast by the shell).
  'level:note': string;
  // A hint would likely help now: the bulb glows (false when a level starts fresh).
  'hint:ready': boolean;
  // A paid level was chosen: open the unlock card. And: the full journey was unlocked or locked again.
  // The book icon: replay the story so far.
  'story:book': void;
  'test:map': void; // test builds: show the map again (after the finished-world switch)
  'test:opening': void; // test builds: play the first-time opening
  'test:ending': void; // test builds: play the last land coming home and the ending
  // A situational tip from a region (a refused star, a stroke let go too soon); shown once ever.
  'level:tip': { id: string; text: string };
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
