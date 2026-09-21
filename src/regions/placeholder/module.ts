import gsap from 'gsap';
import { Container, Graphics } from 'pixi.js';
import type { ClueTier, LevelScene, PuzzleModule, RegionId, ShellContext } from '../types';
import { REGION_ACCENT } from '../catalog';
import { alphas, palette } from '../../design/palette';
import { breathe, durations, easings, scaled } from '../../design/motion';
import { layout, puzzleArea } from '../../design/layout';
import { createGlow } from '../../fx/glow';
import { progression } from '../../core/progress';

// "Click the glowing dot": a stand-in puzzle that exercises the whole shell
// (attempts, clues, completion, finale) until the real regions arrive.

const placeholderStyle = {
  dotRadius: 18,
  minDots: 3,
  maxDots: 9,
  correctBrightness: 0.55,
  wrongBrightness: 0.3,
  clueGhostSeconds: 3,
} as const;

type Handler = () => void;

class PlaceholderLevel implements LevelScene {
  readonly container = new Container();
  private dots: Graphics[] = [];
  private correct = 0;
  private handlers: Record<'attempt' | 'solved' | 'move', Handler[]> = { attempt: [], solved: [], move: [] };
  private tweens: gsap.core.Tween[] = [];
  private solved = false;
  private accent: number;
  private ring = new Graphics();

  constructor(private ctx: ShellContext, id: RegionId, levelIndex: number) {
    this.accent = palette[REGION_ACCENT[id]];
    const count = Math.min(
      placeholderStyle.maxDots,
      placeholderStyle.minDots + Math.floor(levelIndex / progression.levelsPerChapter) * 2,
    );
    const area = puzzleArea(ctx.width, ctx.height);
    const radius = area.width * 0.38;
    this.correct = ctx.rng.int(0, count - 1);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2 + ctx.rng.next() * 0.3;
      const r = radius * (0.7 + ctx.rng.next() * 0.3);
      const dot = new Graphics();
      dot.position.set(ctx.width / 2 + Math.cos(angle) * r, ctx.height / 2 + Math.sin(angle) * r);
      dot.eventMode = 'static';
      dot.cursor = 'pointer';
      dot.on('pointertap', () => this.press(i));
      this.dots.push(dot);
      this.container.addChild(dot);
    }
    this.ring.visible = false;
    this.container.addChild(this.ring);
    this.drawAll();
    this.startBreathing();
  }

  on(event: 'attempt' | 'solved' | 'move', cb: Handler): void {
    this.handlers[event].push(cb);
  }

  private emit(event: 'attempt' | 'solved' | 'move'): void {
    this.handlers[event].forEach((h) => h());
  }

  private drawAll(): void {
    this.dots.forEach((dot, i) => this.drawDot(dot, i === this.correct));
  }

  private drawDot(dot: Graphics, isCorrect: boolean): void {
    const brightness = isCorrect ? placeholderStyle.correctBrightness : placeholderStyle.wrongBrightness;
    dot
      .clear()
      .circle(0, 0, Math.max(layout.minHitSize / 2, placeholderStyle.dotRadius))
      .fill({ color: palette.ink })
      .circle(0, 0, placeholderStyle.dotRadius)
      .fill({ color: this.accent, alpha: brightness });
    dot.filters = isCorrect ? [createGlow(this.accent, { distance: 20, strength: 0.9 })] : [];
  }

  private startBreathing(): void {
    this.dots.forEach((dot, i) => {
      this.tweens.push(
        gsap.to(dot.scale, {
          x: breathe.scaleTo,
          y: breathe.scaleTo,
          duration: durations.breathe / 2,
          ease: easings.ambient,
          yoyo: true,
          repeat: -1,
          delay: (i / this.dots.length) * durations.breathe,
        }),
      );
    });
  }

  private press(index: number): void {
    if (this.solved) return;
    this.emit('move');
    if (index === this.correct) {
      this.solved = true;
      this.emit('solved');
      return;
    }
    const dot = this.dots[index]!;
    this.ctx.audio.failure();
    this.emit('attempt');
    gsap.to(dot, {
      alpha: 0.15,
      duration: scaled(durations.pieceMove),
      ease: easings.response,
      yoyo: true,
      repeat: 1,
    });
  }

  restart(): void {
    this.solved = false;
    this.ring.visible = false;
    this.dots.forEach((d) => {
      d.alpha = 1;
      d.visible = true;
    });
    this.drawAll();
  }

  showClue(tier: ClueTier): void {
    const target = this.dots[this.correct]!;
    switch (tier) {
      case 1:
        gsap.to(target.scale, { x: 1.35, y: 1.35, duration: durations.microFeedback, yoyo: true, repeat: 3 });
        break;
      case 2: {
        const wrong = this.dots.findIndex((_, i) => i !== this.correct && this.dots[i]!.visible);
        if (wrong >= 0) gsap.to(this.dots[wrong]!, { alpha: 0.25, duration: scaled(durations.pieceMove) });
        break;
      }
      case 3:
        this.ring
          .clear()
          .circle(0, 0, placeholderStyle.dotRadius * 2)
          .stroke({ color: this.accent, width: 1.5, alpha: alphas.hudIdle });
        this.ring.position.copyFrom(target.position);
        this.ring.visible = true;
        break;
      case 4:
        this.dots.forEach((d, i) => {
          if (i !== this.correct && i % 2 === 0) {
            gsap.to(d, { alpha: 0.2, duration: scaled(durations.pieceMove) });
            gsap.to(d, { alpha: 1, duration: scaled(durations.pieceMove), delay: placeholderStyle.clueGhostSeconds });
          }
        });
        break;
    }
  }

  playCompletion(): Promise<void> {
    const target = this.dots[this.correct]!;
    this.ctx.audio.solvePhrase();
    for (let i = 0; i < 40; i++) {
      const a = this.ctx.rng.next() * Math.PI * 2;
      const speed = 40 + this.ctx.rng.next() * 90;
      this.ctx.particles.emit({
        x: target.x,
        y: target.y,
        color: this.accent,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 20,
        life: 1.6 + this.ctx.rng.next(),
        alphaFrom: 0.7,
        scaleFrom: 0.5,
        scaleTo: 0.05,
      });
    }
    return new Promise((resolve) => {
      gsap
        .timeline({ onComplete: resolve })
        .to(target.scale, { x: 2.2, y: 2.2, duration: scaled(durations.completion) * 0.4, ease: easings.response })
        .to(
          this.dots.filter((d) => d !== target),
          { alpha: 0, duration: scaled(durations.completion) * 0.3, ease: easings.ambient },
          0,
        )
        .to(target, { alpha: 0, duration: scaled(durations.completion) * 0.5, ease: easings.ambient }, '>-0.2');
    });
  }

  destroy(): void {
    this.tweens.forEach((t) => t.kill());
    this.container.destroy({ children: true });
  }

  // Dev only: a faint ring around the correct dot.
  showSolutionOverlay(): void {
    const target = this.dots[this.correct]!;
    const ring = new Graphics().circle(0, 0, placeholderStyle.dotRadius * 1.6).stroke({ color: palette.pearl, width: 1, alpha: 0.25 });
    ring.position.copyFrom(target.position);
    this.container.addChild(ring);
  }
}

export function createPlaceholderModule(id: RegionId): PuzzleModule {
  return {
    id,
    accent: REGION_ACCENT[id],
    levelCount: progression.levelsPerRegion,
    createLevel: (ctx, levelIndex) => new PlaceholderLevel(ctx, id, levelIndex),
    playRegionFinale: (ctx) => {
      const accent = palette[REGION_ACCENT[id]];
      for (let i = 0; i < 160; i++) {
        const a = ctx.rng.next() * Math.PI * 2;
        const speed = 30 + ctx.rng.next() * 140;
        ctx.particles.emit({
          x: ctx.width / 2,
          y: ctx.height / 2,
          color: accent,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed - 30,
          life: 1.2 + ctx.rng.next() * 1.2,
          alphaFrom: 0.8,
          scaleFrom: 0.7,
          scaleTo: 0.05,
          drag: 0.985,
        });
      }
      return new Promise((resolve) => setTimeout(resolve, scaled(durations.completion) * 1000));
    },
  };
}
