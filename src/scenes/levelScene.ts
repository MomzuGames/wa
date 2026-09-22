import { Container, FederatedPointerEvent, FillGradient, Graphics, Text } from 'pixi.js';
import type { Scene } from '../core/sceneManager';
import type { ClueTier, LevelScene, PuzzleModule, RegionId, ShellContext } from '../regions/types';
import { alphas, palette, rgba } from '../design/palette';
import { durations, easings } from '../design/motion';
import { isCompact, layout } from '../design/layout';
import { createRng } from '../core/rng';
import { events } from '../core/events';
import { getRegion, markIntroSeen } from '../core/save';
import { ConfirmCard } from '../ui/confirm';
import { Toast } from '../ui/toast';
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
  private spotlight = new Graphics();
  private stage = new Container();
  private parallax = { x: 0, y: 0 };
  private intro: LevelIntro | null = null;
  private toast: Toast;
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

    this.toast = new Toast(accent);
    this.hud.addChild(this.label, this.moveLabel, this.restartButton, this.orb, this.toast);
    this.spotlight.eventMode = 'none';
    this.stage.addChild(this.level.container);
    this.container.addChild(this.atmosphere.container, this.spotlight, this.stage, this.hud);

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
    this.container.on('globalpointermove', (e: FederatedPointerEvent) => {
      this.parallax = { x: e.global.x / this.width - 0.5, y: e.global.y / this.height - 0.5 };
      this.atmosphere.setParallax(this.parallax.x, this.parallax.y);
    });

    if (devFlags.enabled) this.installSolutionOverlay();
  }

  get regionId(): RegionId {
    return this.module.id;
  }

  enter(): void {
    const inset = layout.hudInset + layout.hudIconSize / 2;
    events.emit('spirit:glide', { x: isCompact(this.width) ? this.width / 2 - 56 : this.width / 2 + 52, y: inset });
    // The card appears on its own only when a level introduces something new for this region.
    // It opens on the first page the player has not seen yet; earlier pages stay a swipe away.
    const pages = this.level.introPages?.() ?? [];
    const firstNew = markIntroSeen(this.module.id, pages.map((p) => p.caption));
    if (firstNew >= 0) this.showInstructions(true, firstNew);
    else this.level.begin?.();
  }

  // Opens the instruction card; the ? button uses this at any time.
  showInstructions(first = false, startPage = 0): void {
    if (this.intro || this.finished) return;
    const pages = this.level.introPages?.() ?? [];
    if (pages.length === 0) {
      if (first) this.level.begin?.();
      return;
    }
    this.intro = new LevelIntro(this.levelIndex, palette[this.module.accent], pages, startPage);
    this.container.addChild(this.intro);
    void this.intro.play(this.width, this.height).then(() => {
      this.intro = null;
      if (first) this.level.begin?.();
    });
  }

  // The hint button asks first, then reveals the next tier even if it is not earned yet.
  askHint(): void {
    if (this.finished || this.intro) return;
    const card = new ConfirmCard('Would you like a hint?', palette[this.module.accent], (yes) => {
      if (!yes) return;
      this.applyClue(this.hints.forceReveal());
    });
    this.container.addChild(card);
    card.open(this.width, this.height);
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
    this.level.update?.(dt);
    // The puzzle itself leans very slightly toward the pointer: the opposite of the backdrop.
    this.stage.x += (this.parallax.x * 5 - this.stage.x) * Math.min(1, dt * 4);
    this.stage.y += (this.parallax.y * 5 - this.stage.y) * Math.min(1, dt * 4);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.level.resize?.(width, height);
    this.atmosphere.resize(width, height);
    const radius = Math.min(width, height) * 0.46;
    const token = this.module.accent;
    const gradient = new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.5 },
      innerRadius: 0,
      outerCenter: { x: 0.5, y: 0.5 },
      outerRadius: 0.5,
      colorStops: [
        { offset: 0, color: rgba(token, 0.09) },
        { offset: 0.6, color: rgba(token, 0.03) },
        { offset: 1, color: rgba(token, 0) },
      ],
    });
    this.spotlight.clear().circle(width / 2, height / 2, radius).fill(gradient);
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
    if (tier) this.applyClue(tier);
  }

  private applyClue(tier: ClueTier): void {
    const caption = this.level.showClue(tier);
    if (caption) this.toast.show(caption, this.width, this.height);
    events.emit('spirit:react', 'move');
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
    this.stage.removeChild(this.level.container);
    this.level.destroy();
    this.atmosphere.destroy();
    this.container.destroy({ children: true });
  }
}
