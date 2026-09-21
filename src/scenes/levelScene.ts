import { Container, Text } from 'pixi.js';
import type { Scene } from '../core/sceneManager';
import type { LevelScene, PuzzleModule, RegionId, ShellContext } from '../regions/types';
import { alphas, palette } from '../design/palette';
import { durations, easings } from '../design/motion';
import { layout } from '../design/layout';
import { createRng } from '../core/rng';
import { events } from '../core/events';
import { getRegion } from '../core/save';
import { markSolved, recordAttempts } from '../core/progress';
import { HintManager } from '../hints/hintManager';
import { HintOrb } from '../hints/hintOrb';
import { IconButton } from '../ui/iconButton';
import type { AudioEngine } from '../audio/engine';
import type { ParticleSystem } from '../fx/particles';
import { devFlags } from '../core/dev';
import { LevelIntro } from '../ui/levelIntro';
import { Atmosphere } from '../fx/atmosphere';
import gsap from 'gsap';

export interface LevelShellDeps {
  audio: AudioEngine;
  particles: ParticleSystem;
  width: number;
  height: number;
}

export interface LevelResult {
  regionId: RegionId;
  levelIndex: number;
  completedRegion: boolean;
}

export class LevelShellScene implements Scene {
  readonly container = new Container();
  private level: LevelScene;
  private hints: HintManager;
  private orb: HintOrb;
  private restartButton: IconButton;
  private label: Text;
  private moveLabel: Text;
  private moves = 0;
  private hud = new Container();
  private atmosphere: Atmosphere;
  private intro: LevelIntro | null = null;
  private width: number;
  private height: number;
  private unsubscribe: Array<() => void> = [];
  private finished = false;
  private onVisibility = () => this.hints.setHidden(document.hidden);

  constructor(
    private module: PuzzleModule,
    private levelIndex: number,
    deps: LevelShellDeps,
    private onDone: (result: LevelResult) => void,
  ) {
    const ctx: ShellContext = {
      palette,
      motion: { durations, easings },
      audio: deps.audio,
      particles: deps.particles,
      rng: createRng(`${module.id}:${levelIndex}`),
      width: deps.width,
      height: deps.height,
    };
    this.width = deps.width;
    this.height = deps.height;
    this.atmosphere = new Atmosphere(module.id, createRng(`${module.id}:atmosphere:${levelIndex}`));
    const saved = getRegion(module.id);
    this.hints = new HintManager(saved.attempts[levelIndex] ?? 0, saved.cluesUsed[levelIndex] ?? 0);
    this.hints.onTierAvailable(() => deps.audio.chime());

    this.level = module.createLevel(ctx, levelIndex);
    this.level.on('attempt', () => {
      this.hints.recordAttempt();
      events.emit('spirit:react', 'attempt');
    });
    this.level.on('move', () => {
      this.hints.recordMove();
      this.countMove();
      events.emit('spirit:react', 'move');
    });
    this.level.on('solved', () => void this.solved());

    const accent = palette[module.accent];
    this.orb = new HintOrb(accent, () => this.revealClue());
    this.restartButton = new IconButton('restart', () => this.restart());
    this.label = new Text({
      text: String(levelIndex + 1),
      style: { fontFamily: 'Quicksand', fontWeight: '300', fontSize: 22, letterSpacing: 4, fill: palette.pearl },
      resolution: window.devicePixelRatio || 1,
    });
    this.label.anchor.set(0.5);
    this.label.alpha = alphas.hudIdle;
    this.moveLabel = new Text({
      text: '',
      style: { fontFamily: 'Quicksand', fontWeight: '300', fontSize: 13, letterSpacing: 2, fill: palette.pearl },
      resolution: window.devicePixelRatio || 1,
    });
    this.moveLabel.anchor.set(0.5);
    this.moveLabel.alpha = alphas.hudIdle * 0.7;

    this.hud.addChild(this.label, this.moveLabel, this.restartButton, this.orb);
    this.container.addChild(this.atmosphere.container, this.level.container, this.hud);

    this.unsubscribe.push(
      events.on('input:restart', () => {
        if (!this.level.usesRotateKey) this.restart();
      }),
      events.on('input:key', (key) => {
        if (key === 'Backspace' && this.level.usesRotateKey) this.restart();
      }),
      events.on('input:hint', () => this.revealClue()),
      events.on('input:key', () => this.hints.recordInput()),
    );
    document.addEventListener('visibilitychange', this.onVisibility);
    this.container.eventMode = 'static';
    this.container.on('pointerdown', () => this.hints.recordInput());

    if (devFlags.enabled) this.installSolutionOverlay();
  }

  get regionId(): RegionId {
    return this.module.id;
  }

  enter(): void {
    const inset = layout.hudInset + layout.hudIconSize / 2;
    events.emit('spirit:glide', { x: this.width / 2 + 52, y: inset });
    this.intro = new LevelIntro(this.levelIndex, palette[this.module.accent], {
      glyph: this.level.introGlyph?.() ?? null,
      lines: this.level.introLines?.() ?? [],
    });
    this.container.addChild(this.intro);
    void this.intro.play(this.width, this.height).then(() => {
      this.intro = null;
      this.level.begin?.();
    });
  }

  private countMove(): void {
    this.moves++;
    this.moveLabel.text = String(this.moves);
    gsap.fromTo(this.moveLabel.scale, { x: 1.25, y: 1.25 }, { x: 1, y: 1, duration: durations.microFeedback, ease: easings.response });
  }

  update(dt: number): void {
    this.hints.tick(dt);
    this.orb.setFill(this.hints.fill, this.hints.hasUnrevealed);
    this.atmosphere.update(dt);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.level.resize?.(width, height);
    this.atmosphere.resize(width, height);
    this.intro?.resize(width, height);
    const inset = layout.hudInset + layout.hudIconSize / 2;
    this.label.position.set(width / 2, inset);
    this.moveLabel.position.set(width / 2, inset + 22);
    this.restartButton.position.set(width - inset, height - inset);
    this.orb.position.set(width - inset - layout.hudIconSize - 16, height - inset);
  }

  private restart(): void {
    if (this.finished) return;
    this.level.restart();
    this.hints.recordRestart();
  }

  private revealClue(): void {
    if (this.finished) return;
    const tier = this.hints.reveal();
    if (tier) this.level.showClue(tier);
  }

  private async solved(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    const state = this.hints.state;
    recordAttempts(this.module.id, this.levelIndex, state.units, state.revealedTier);
    const completedRegion = markSolved(this.module.id, this.levelIndex);
    events.emit('spirit:react', 'solved');
    await this.level.playCompletion();
    this.onDone({ regionId: this.module.id, levelIndex: this.levelIndex, completedRegion });
  }

  private installSolutionOverlay(): void {
    if (!import.meta.env.DEV) return;
    const withOverlay = this.level as LevelScene & { showSolutionOverlay?: () => void };
    withOverlay.showSolutionOverlay?.();
  }

  destroy(): void {
    this.unsubscribe.forEach((u) => u());
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.container.removeChild(this.level.container);
    this.level.destroy();
    this.atmosphere.destroy();
    this.container.destroy({ children: true });
  }
}
