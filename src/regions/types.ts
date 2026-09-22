import type { Container } from 'pixi.js';
import type { palette } from '../design/palette';
import type { durations, easings } from '../design/motion';
import type { AudioEngine } from '../audio/engine';
import type { ParticleSystem } from '../fx/particles';
import type { Rng } from '../core/rng';

export type RegionId = 'tidepools' | 'nightsky' | 'stonegarden' | 'crystalcaves' | 'moonlake' | 'shadowterrace';
export type ClueTier = 1 | 2 | 3 | 4;

export interface IntroPage {
  caption: string;
  glyph: () => Container; // built fresh each time the page is shown
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
  // Shows a clue and returns a one-line caption explaining what just happened.
  showClue(tier: ClueTier): string | void;
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
