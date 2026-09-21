import gsap from 'gsap';
import { Container, Graphics, Text } from 'pixi.js';
import type { Scene } from '../core/sceneManager';
import type { RegionId } from '../regions/types';
import { REGION_ACCENT } from '../regions/catalog';
import { alphas, palette } from '../design/palette';
import { breathe, durations, easings, scaled } from '../design/motion';
import { layout } from '../design/layout';
import { createGlow } from '../fx/glow';
import { getRegion } from '../core/save';
import { levelUnlocked, progression } from '../core/progress';

const trailStyle = {
  nodeRadius: 15,
  chapterEndRadius: 19,
  rowFraction: 0.16,
  widthFraction: 0.66,
  waveAmplitude: 0.35,
  lineAlpha: 0.5,
} as const;

type NodeState = 'locked' | 'unlocked' | 'solved';

interface TrailNode {
  root: Container;
  disc: Graphics;
  label: Text;
  state: NodeState;
  radius: number;
}

export class RegionScene implements Scene {
  readonly container = new Container();
  private trail = new Graphics();
  private nodes: TrailNode[] = [];
  private accent: number;
  private tweens: gsap.core.Tween[] = [];
  private points: Array<{ x: number; y: number }> = [];

  constructor(
    private regionId: RegionId,
    private onSelect: (levelIndex: number) => void,
    private justSolved: number | null = null,
  ) {
    this.accent = palette[REGION_ACCENT[regionId]];
    this.container.addChild(this.trail);
    for (let i = 0; i < progression.levelsPerRegion; i++) {
      const isChapterEnd = (i + 1) % progression.levelsPerChapter === 0;
      const radius = isChapterEnd ? trailStyle.chapterEndRadius : trailStyle.nodeRadius;
      const root = new Container();
      const disc = new Graphics();
      const label = new Text({
        text: String(i + 1),
        style: { fontFamily: 'Quicksand', fontWeight: '300', fontSize: 13, fill: palette.pearl },
        resolution: window.devicePixelRatio || 1,
      });
      label.anchor.set(0.5);
      const hit = new Graphics()
        .circle(0, 0, Math.max(layout.minHitSize / 2, radius + 6))
        .fill({ color: palette.pearl, alpha: 0.001 });
      root.addChild(hit, disc, label);
      root.eventMode = 'static';
      root.cursor = 'pointer';
      root.on('pointertap', () => this.press(i));
      root.on('pointerover', () => this.hover(i, true));
      root.on('pointerout', () => this.hover(i, false));
      this.nodes.push({ root, disc, label, state: 'locked', radius });
      this.container.addChild(root);
    }
    this.refreshStates();
  }

  private stateOf(i: number): NodeState {
    if (getRegion(this.regionId).solved.includes(i)) return 'solved';
    return levelUnlocked(this.regionId, i) ? 'unlocked' : 'locked';
  }

  private refreshStates(): void {
    this.nodes.forEach((node, i) => {
      node.state = this.stateOf(i);
      if (this.justSolved === i) node.state = 'unlocked';
      this.draw(node);
    });
  }

  private draw(node: TrailNode): void {
    const { disc, radius, state } = node;
    disc.clear();
    switch (state) {
      case 'locked':
        disc.circle(0, 0, radius).fill({ color: palette.void }).stroke({ color: palette.dim, width: 1.5 });
        disc.filters = [];
        node.label.alpha = alphas.hudIdle * 0.6;
        node.root.cursor = 'default';
        break;
      case 'unlocked':
        disc.circle(0, 0, radius).fill({ color: palette.void }).stroke({ color: this.accent, width: 1.5 });
        disc.filters = [];
        node.label.alpha = alphas.hudHover;
        node.root.cursor = 'pointer';
        break;
      case 'solved':
        disc.circle(0, 0, radius).fill({ color: this.accent, alpha: 0.85 });
        disc.filters = [createGlow(this.accent, { distance: 14, strength: 1 })];
        node.label.alpha = 0;
        node.root.cursor = 'pointer';
        break;
    }
  }

  enter(): void {
    this.nodes.forEach((node, i) => {
      if (node.state !== 'unlocked') return;
      this.tweens.push(
        gsap.to(node.root.scale, {
          x: breathe.scaleTo,
          y: breathe.scaleTo,
          duration: durations.breathe / 2,
          ease: easings.ambient,
          yoyo: true,
          repeat: -1,
          delay: (i % 7) * 0.5,
        }),
      );
    });
    if (this.justSolved !== null) {
      const node = this.nodes[this.justSolved]!;
      gsap.delayedCall(scaled(durations.sceneTransition) * 0.6, () => {
        node.state = 'solved';
        this.draw(node);
        node.root.scale.set(0.6);
        gsap.to(node.root.scale, { x: 1, y: 1, duration: scaled(durations.pieceMove) * 2, ease: easings.tileSnap });
      });
    }
  }

  private hover(i: number, over: boolean): void {
    const node = this.nodes[i]!;
    if (node.state === 'locked') return;
    gsap.to(node.root, { alpha: over ? 1 : 0.85, duration: durations.hudHover });
  }

  private press(i: number): void {
    if (this.nodes[i]!.state === 'locked') return;
    this.onSelect(i);
  }

  resize(width: number, height: number): void {
    const perRow = progression.levelsPerChapter;
    const rows = progression.chapters;
    const span = width * trailStyle.widthFraction;
    const left = (width - span) / 2;
    const rowGap = height * trailStyle.rowFraction;
    const top = height / 2 - (rowGap * (rows - 1)) / 2;
    this.points = [];
    this.nodes.forEach((node, i) => {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const t = col / (perRow - 1);
      const dir = row % 2 === 0 ? t : 1 - t;
      const x = left + span * dir;
      const y = top + row * rowGap + Math.sin(dir * Math.PI * 2 + row) * rowGap * trailStyle.waveAmplitude * 0.5;
      node.root.position.set(x, y);
      this.points.push({ x, y });
    });
    this.trail.clear();
    this.points.forEach((p, i) => {
      if (i === 0) this.trail.moveTo(p.x, p.y);
      else {
        const prev = this.points[i - 1]!;
        const cx = (prev.x + p.x) / 2;
        this.trail.bezierCurveTo(cx, prev.y, cx, p.y, p.x, p.y);
      }
    });
    this.trail.stroke({ color: palette.dim, width: 1, alpha: trailStyle.lineAlpha });
  }

  destroy(): void {
    this.tweens.forEach((t) => t.kill());
    this.container.destroy({ children: true });
  }
}
