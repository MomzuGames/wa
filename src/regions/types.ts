import type { Container } from 'pixi.js';
import type { palette } from '../design/palette';
import type { durations, easings } from '../design/motion';
import type { AudioEngine } from '../audio/engine';
import type { ParticleSystem } from '../fx/particles';
import type { Rng } from '../core/rng';

export type RegionId = 'tidepools' | 'nightsky' | 'stonegarden' | 'crystalcaves' | 'moonlake';
export type ClueTier = 1 | 2 | 3 | 4;

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
  showClue(tier: ClueTier): void;
  playCompletion(): Promise<void>;
  resize?(width: number, height: number): void;
  destroy(): void;
}

export interface PuzzleModule {
  id: RegionId;
  accent: keyof typeof palette;
  levelCount: number;
  createLevel(ctx: ShellContext, levelIndex: number): LevelScene;
  playRegionFinale(ctx: ShellContext): Promise<void>;
}
