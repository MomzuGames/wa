import { Container, FederatedPointerEvent, FillGradient, Graphics, Text } from 'pixi.js';
import type { Scene } from '../core/sceneManager';
import type { LevelScene, PuzzleModule, RegionId, ShellContext } from '../regions/types';
import { alphas, palette, rgba } from '../design/palette';
import { durations, easings, tipTiming } from '../design/motion';
import { headerBand, hud, safeArea } from '../design/layout';
import { createRng } from '../core/rng';
import { events } from '../core/events';
import { getRegion, markIntroSeen, markTipSeen } from '../core/save';
import { LEVEL_NAMES } from '../regions/catalog';
import { ConfirmCard } from '../ui/confirm';
import { Toast } from '../ui/toast';
import { markSolved, recordAttempts } from '../core/progress';
import { HintManager, hintRules } from '../hints/hintManager';
import { IconButton } from '../ui/iconButton';
import type { AudioEngine } from '../audio/engine';
import type { ParticleSystem } from '../fx/particles';
import { devFlags } from '../core/dev';
import { LevelIntro } from '../ui/levelIntro';
import { Atmosphere } from '../fx/atmosphere';
import gsap from 'gsap';
import { haptic } from '../core/native';



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
  private begun = false;
  private tipClock = 0;
  private lastToastAt = 0;
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
      // Puzzles lay out in the part of the screen clear of the Dynamic Island and home bar.
      width: deps.width,
      height: deps.height - safeArea.top - safeArea.bottom,
    };
    this.width = deps.width;
    this.height = deps.height;
    this.atmosphere = new Atmosphere(module.id, createRng(`${module.id}:atmosphere:${levelIndex}`));
    const saved = getRegion(module.id);
    this.hints = new HintManager(saved.attempts[levelIndex] ?? 0, saved.cluesUsed[levelIndex] ?? 0);
    this.hints.onUnits((units) => {
      // When a hint would likely help: a soft chime, and the bulb begins to glow.
      if (units === hintRules.readyUnits) {
        deps.audio.chime();
        events.emit('hint:ready', true);
      }
      this.offerTip();
    });

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
    this.restartButton = new IconButton('restart', () => this.restart());
    this.label = new Text({
      text: LEVEL_NAMES[module.id][levelIndex] ?? String(levelIndex + 1),
      style: { fontFamily: 'Quicksand', fontWeight: '300', fontSize: 17, letterSpacing: 4, fill: palette.pearl },
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
    this.hud.addChild(this.label, this.moveLabel, this.restartButton, this.toast);
    this.spotlight.eventMode = 'none';
    this.level.container.y = safeArea.top;
    this.stage.addChild(this.level.container);
    this.container.addChild(this.atmosphere.container, this.spotlight, this.stage, this.hud);

    this.unsubscribe.push(
      events.on('level:note', (text) => this.toast.show(text, this.width, this.height)),
      events.on('input:restart', () => {
        if (!this.level.usesRotateKey) this.restart();
      }),
      events.on('input:key', (key) => {
        if (key === 'Backspace' && this.level.usesRotateKey) this.restart();
      }),
      events.on('input:hint', () => this.giveHint()),
      events.on('level:tip', ({ id, text }) => this.showTip(id, text)),
      events.on('input:key', () => this.hints.recordInput()),
    );
    document.addEventListener('visibilitychange', this.onVisibility);
    this.container.eventMode = 'static';
    this.container.on('pointerdown', () => this.hints.recordInput());
    this.container.on('globalpointermove', (e: FederatedPointerEvent) => {
      this.parallax = { x: e.global.x / this.width - 0.5, y: e.global.y / this.height - 0.5 };
      this.atmosphere.setParallax(this.parallax.x, this.parallax.y);
    });

    if (devFlags.solution) this.installSolutionOverlay();
  }

  get regionId(): RegionId {
    return this.module.id;
  }

  enter(): void {
    // The light has dived into the puzzle: it stays out of sight until the level is solved.
    events.emit('spirit:react', 'hide');
    events.emit('hint:ready', this.hints.ready);
    // The card appears on its own only when a level introduces something new for this region.
    // It opens on the first page the player has not seen yet; earlier pages stay a swipe away.
    const pages = this.level.introPages?.() ?? [];
    const firstNew = markIntroSeen(this.module.id, pages.map((p) => p.caption));
    if (firstNew >= 0) this.showInstructions(true, firstNew);
    else this.startPlay();
  }

  // Opens the instruction card; the ? button uses this at any time.
  showInstructions(first = false, startPage = 0): void {
    if (this.intro || this.finished) return;
    const pages = this.level.introPages?.() ?? [];
    if (pages.length === 0) {
      if (first) this.startPlay();
      return;
    }
    this.intro = new LevelIntro(LEVEL_NAMES[this.module.id][this.levelIndex] ?? String(this.levelIndex + 1), palette[this.module.accent], pages, startPage);
    this.container.addChild(this.intro);
    void this.intro.play(this.width, this.height).then(() => {
      this.intro = null;
      if (first) this.startPlay();
    });
  }

  // Play begins once the instruction card (if any) is closed; a first tip may follow shortly.
  private startPlay(): void {
    this.level.begin?.();
    this.begun = true;
    this.lastToastAt = performance.now() - (tipTiming.gap - tipTiming.firstDelay) * 1000;
  }

  // The bulb asks first; H gives a hint straight away.
  askHint(): void {
    if (this.finished || this.intro) return;
    const card = new ConfirmCard('Would you like a hint?', palette[this.module.accent], (yes) => {
      if (yes) this.giveHint();
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
    this.tipClock += dt;
    if (this.tipClock >= tipTiming.retry) {
      this.tipClock = 0;
      this.offerTip();
    }
    this.atmosphere.update(dt);
    this.level.update?.(dt);
    // The puzzle itself leans very slightly toward the pointer: the opposite of the backdrop.
    this.stage.x += (this.parallax.x * 5 - this.stage.x) * Math.min(1, dt * 4);
    this.stage.y += (this.parallax.y * 5 - this.stage.y) * Math.min(1, dt * 4);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.level.container.y = safeArea.top;
    this.level.resize?.(width, height - safeArea.top - safeArea.bottom);
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
    this.placeHeader(width);
    this.restartButton.position.set(hud.right(width), hud.bottom(height));
  }

  // The level name sits centred in the top row, shrinking to fit between the icons.
  private placeHeader(width: number): void {
    const band = headerBand(width);
    this.label.scale.set(1);
    const natural = this.label.width;
    const scale = Math.min(1, (band.right - band.left) / natural);
    this.label.scale.set(scale);
    const half = (natural * scale) / 2;
    const x = Math.max(band.left + half, Math.min(width / 2, band.right - half));
    this.label.position.set(x, hud.top());
    this.moveLabel.position.set(x, hud.top() + 22);
  }

  private restart(): void {
    if (this.finished) return;
    this.level.restart();
    this.hints.recordRestart();
  }

  // One concrete step forward, with a caption saying what changed and why.
  private giveHint(): void {
    if (this.finished || this.intro) return;
    const caption = this.level.hint();
    this.hints.recordHint();
    this.lastToastAt = performance.now();
    this.toast.show(caption, this.width, this.height);
    events.emit('spirit:react', 'move');
  }

  // Tips wait their turn: never over the instruction card, and never hard on the heels of
  // another caption. Each is shown once per player, ever.
  private offerTip(): void {
    if (this.finished || this.intro || !this.begun) return;
    if (performance.now() - this.lastToastAt < tipTiming.gap * 1000) return;
    const units = this.hints.state.units;
    const tip = (this.level.tips?.() ?? []).find((t) => t.after <= units && markTipSeen(this.module.id, t.id));
    if (tip) this.showCaption(tip.text);
  }

  private showTip(id: string, text: string): void {
    if (this.finished || !markTipSeen(this.module.id, id)) return;
    this.showCaption(text);
  }

  private showCaption(text: string): void {
    this.lastToastAt = performance.now();
    this.toast.show(text, this.width, this.height);
  }

  private async solved(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    const state = this.hints.state;
    recordAttempts(this.module.id, this.levelIndex, state.units, state.used);
    const completedRegion = markSolved(this.module.id, this.levelIndex);
    // The light bursts out of the puzzle to celebrate.
    events.emit('spirit:joy', { x: this.width / 2, y: this.height / 2 });
    haptic('light');
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
