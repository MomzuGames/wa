import type { Container } from 'pixi.js';
import type { palette } from '../design/palette';
import type { durations, easings } from '../design/motion';
import type { AudioEngine } from '../audio/engine';
import type { ParticleSystem } from '../fx/particles';
import type { Rng } from '../core/rng';

export type RegionId = 'tidepools' | 'nightsky' | 'stonegarden' | 'crystalcaves' | 'moonlake' | 'shadowterrace';

export interface IntroPage {
  caption: string;
  glyph: () => Container; // built fresh each time the page is shown
}

// A gentle one-line tip about how to approach the puzzle. Each is shown once per player,
// as a quiet caption, when the player has struggled for `after` units (0: as play begins).
export interface Tip {
  id: string;
  text: string;
  after: number;
}

export interface ShellContext {
  palette: typeof palette;
  motion: { durations: typeof durations; easings: typeof easings };
  audio: AudioEngine;
  particles: ParticleSystem;
  rng: Rng;
  width: number;
  height: number;
}

export interface LevelScene {
  container: Container;
  on(event: 'attempt' | 'solved' | 'move', cb: () => void): void;
  restart(): void;
  // Moves the player one concrete, visible step closer to a solution from where they are
  // now (a tile turns, a stone settles, a pad glows) and returns a short caption saying what
  // changed and why. Never takes the final step: the finish is always the player's.
  hint(): string;
  // Strategy tips for this level, shown once each as the player struggles.
  tips?(): Tip[];
  playCompletion(): Promise<void>;
  resize?(width: number, height: number): void;
  // Called every frame with the elapsed seconds, for ripples, drift, timed clues and the like.
  update?(dt: number): void;
  // For the instruction card: one page per mechanic present in this level, each with a
  // looping demonstration and a short caption. Never more than the level actually uses.
  introPages?(): IntroPage[];
  // Called once the instruction card has been dismissed and play can begin.
  begin?(): void;
  // Regions that use R to rotate: restart is the icon or Backspace instead.
  usesRotateKey?: boolean;
  destroy(): void;
}

export interface PuzzleModule {
  id: RegionId;
  accent: keyof typeof palette;
  levelCount: number;
  createLevel(ctx: ShellContext, levelIndex: number): LevelScene;
  playRegionFinale(ctx: ShellContext): Promise<void>;
}
