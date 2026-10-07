import gsap from 'gsap';
import { Container, FederatedPointerEvent, Graphics, Text } from 'pixi.js';
import type { Scene } from '../core/sceneManager';
import type { RegionId } from '../regions/types';
import { LEVEL_NAMES, REGION_ACCENT } from '../regions/catalog';
import { spiritStyle } from '../ui/spirit';
import { alphas, palette } from '../design/palette';
import { breathe, durations, easings, reducedMotion, scaled } from '../design/motion';
import { createGlow } from '../fx/glow';
import { earliestUnsolved, isChapterEnd, levelUnlocked, progression } from '../core/progress';
import { events } from '../core/events';
import { Atmosphere } from '../fx/atmosphere';
import { createRng } from '../core/rng';
import { OverlayWorld } from '../three/overlayWorld';
import { moodFor } from '../three/backdrop';
import { stage3d } from '../three/stage3d';
import { type StepStone, makeStepStone } from './islands3d';
import { StoryLight } from '../story/art';
import { familyColor } from '../story/family';
import { whisperFor } from '../story/whispers';
import { currentProfile, getRegion, markStorySeen, seenStory } from '../core/save';
import { hud, layout } from '../design/layout';

const trailStyle = {
  nodeRadius: 15,
  chapterEndRadius: 19,
  rowFraction: 0.22,
  widthFraction: 0.66,
  waveAmplitude: 0.35,
  lineAlpha: 0.5,
  pulseSpeed: 0.05,
  spiritOffsetY: -34,
  perRow: 5,
  nameOffsetY: 30,
  nameIdleAlpha: 0.35,
  nameNearAlpha: 0.95,
  nearRadius: 120,
  tourPause: 1.2,
  // The family member asleep in this land, in the sky above the trail: faint at first,
  // brighter and larger with every level solved.
  sleeperRadius: 11,
  sleeperAlpha: [0.22, 0.9] as const,
  sleeperScale: [0.85, 1.2] as const,
  whisperDelay: 1.4,
} as const;

type NodeState = 'locked' | 'unlocked' | 'solved';

interface TrailNode {
  root: Container;
  disc: Graphics;
  label: Text;
  state: NodeState;
  radius: number;
  near: number; // 0..1: how close the light is
  glow: Graphics;
}

export class RegionScene implements Scene {
  readonly container = new Container();
  private trail = new Graphics();
  private nodes: TrailNode[] = [];
  private accent: number;
  private tweens: gsap.core.Tween[] = [];
  private points: Array<{ x: number; y: number }> = [];
  private atmosphere: Atmosphere;
  private pulse = new Graphics();
  private time = 0;
  private screen = { x: 1, y: 1 };
  private unsubscribe: () => void = () => {};
  private sleeper: StoryLight | null = null;
  private chosen = -1;
  private world3d: OverlayWorld | null = null;
  private stones: StepStone[] = [];

  constructor(
    private regionId: RegionId,
    private onSelect: (levelIndex: number) => void,
    private justSolved: number | null = null,
  ) {
    this.accent = palette[REGION_ACCENT[regionId]];
    this.atmosphere = new Atmosphere(regionId, createRng(`${regionId}:trail`));
    this.pulse.eventMode = 'none';
    this.pulse.filters = [createGlow(this.accent, { distance: 10, strength: 1.2 })];
    this.container.addChild(this.atmosphere.container, this.trail, this.pulse);
    this.container.eventMode = 'static';
    this.container.on('globalpointermove', (e: FederatedPointerEvent) => {
      this.atmosphere.setParallax(e.global.x / Math.max(1, this.screen.x) - 0.5, e.global.y / Math.max(1, this.screen.y) - 0.5);
    });
    for (let i = 0; i < progression.levelsPerRegion; i++) {
      const radius = isChapterEnd(i) ? trailStyle.chapterEndRadius : trailStyle.nodeRadius;
      const root = new Container();
      const disc = new Graphics();
      // Each level carries a name from its region, written beneath its stone.
      const label = new Text({
        text: LEVEL_NAMES[regionId][i] ?? String(i + 1),
        style: { fontFamily: 'Quicksand', fontWeight: '300', fontSize: 12, letterSpacing: 2, fill: palette.pearl },
        resolution: window.devicePixelRatio || 1,
      });
      label.anchor.set(0.5);
      label.y = radius + trailStyle.nameOffsetY - 12;
      const glow = new Graphics();
      glow.eventMode = 'none';
      const hit = new Graphics()
        .circle(0, 0, Math.max(layout.minHitSize / 2, radius + 6))
        .fill({ color: palette.pearl, alpha: 0.001 });
      root.addChild(glow, hit, disc, label);
      root.eventMode = 'static';
      root.cursor = 'pointer';
      root.on('pointertap', () => this.press(i));
      root.on('pointerover', () => this.hover(i, true));
      root.on('pointerout', () => this.hover(i, false));
      this.nodes.push({ root, disc, label, state: 'locked', radius, near: 0, glow });
      this.container.addChild(root);
    }
    // In 3D the levels are floating stepping stones under the trail, in the land's own night.
    if (stage3d()) {
      this.world3d = new OverlayWorld(moodFor(regionId, getRegion(regionId).solved.length, ''));
      this.atmosphere.container.visible = false;
      this.nodes.forEach((node, i) => {
        const stone = makeStepStone(i);
        this.world3d!.add(stone.group, () => node.root.getGlobalPosition(), () => node.radius * 1.45 * node.root.scale.x);
        this.stones.push(stone);
      });
    }
    this.refreshStates();
    // Until the land is finished, its sleeping family member waits in the sky above the trail.
    const solved = getRegion(regionId).solved.length;
    if (solved < progression.levelsPerRegion) {
      const sleeper = new StoryLight(familyColor(regionId, currentProfile()?.color ?? 'mint'), trailStyle.sleeperRadius, true);
      const f = solved / progression.levelsPerRegion;
      const [a0, a1] = trailStyle.sleeperAlpha;
      const [s0, s1] = trailStyle.sleeperScale;
      sleeper.alpha = a0 + (a1 - a0) * f;
      sleeper.scale.set(s0 + (s1 - s0) * f);
      sleeper.eventMode = 'none';
      this.container.addChild(sleeper);
      this.sleeper = sleeper;
      this.tweens.push(gsap.to(sleeper.body.scale, { x: 1.07, y: 1.07, duration: durations.breathe / 2, yoyo: true, repeat: -1, ease: easings.ambient }));
    }
    // Levels brighten as the light passes over them.
    this.unsubscribe = events.on('spirit:at', ({ x, y }) => {
      this.nodes.forEach((node, i) => {
        const p = this.points[i];
        if (!p) return;
        node.near = 1 - Math.min(1, Math.hypot(p.x - x, p.y - y) / trailStyle.nearRadius);
      });
    });
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
    const stone = this.stones[this.nodes.indexOf(node)];
    if (stone) {
      stone.set(state, this.accent);
      disc.visible = false;
      node.glow.visible = false;
    }
    disc.clear();
    switch (state) {
      case 'locked':
        disc.circle(0, 0, radius).fill({ color: palette.void }).stroke({ color: palette.dim, width: 1.5 });
        disc.filters = [];
        node.label.alpha = alphas.hudIdle * 0.5;
        node.root.cursor = 'default';
        break;
      case 'unlocked':
        disc.circle(0, 0, radius).fill({ color: palette.void }).stroke({ color: this.accent, width: 1.5 });
        disc.filters = [];
        node.label.alpha = trailStyle.nameIdleAlpha;
        node.root.cursor = 'pointer';
        break;
      case 'solved':
        disc.circle(0, 0, radius).fill({ color: this.accent, alpha: 0.85 });
        disc.filters = [createGlow(this.accent, { distance: 14, strength: 1 })];
        node.label.alpha = trailStyle.nameIdleAlpha;
        node.root.cursor = 'pointer';
        break;
    }
  }

  // Where the player "is": the earliest unsolved level, or the one just solved.
  private currentNode(): number {
    if (this.justSolved !== null) return Math.min(this.justSolved + 1, progression.levelsPerRegion - 1);
    return Math.min(earliestUnsolved(getRegion(this.regionId).solved), progression.levelsPerRegion - 1);
  }

  private spiritSpot(i: number): { x: number; y: number } {
    const p = this.points[i] ?? { x: 0, y: 0 };
    return { x: p.x, y: p.y + trailStyle.spiritOffsetY };
  }

  update(dt: number): void {
    this.time += dt;
    if (this.world3d) {
      this.stones.forEach((st) => st.update(this.time));
      this.world3d.update(dt);
    }
    this.atmosphere.update(dt);
    // Names and a soft pool of light follow the spirit along the trail.
    const k = Math.min(1, dt * 5);
    this.nodes.forEach((node, i) => {
      if (node.state === 'locked') return;
      const lift = this.chosen === i ? 1 : node.near;
      node.label.alpha += (trailStyle.nameIdleAlpha + (trailStyle.nameNearAlpha - trailStyle.nameIdleAlpha) * lift - node.label.alpha) * k;
      node.glow.clear();
      if (lift > 0.02) node.glow.circle(0, 0, node.radius * 2.4).fill({ color: this.accent, alpha: 0.18 * lift });
    });
    if (reducedMotion()) return;
    // A soft pulse of light drifts along the solved part of the trail.
    const solvedUpTo = this.nodes.findIndex((n) => n.state !== 'solved');
    const reach = solvedUpTo === -1 ? this.points.length - 1 : Math.max(0, solvedUpTo - 1);
    this.pulse.clear();
    if (reach <= 0) return;
    const t = ((this.time * trailStyle.pulseSpeed) % 1 + 1) % 1;
    const f = t * reach;
    const i = Math.min(reach - 1, Math.floor(f));
    const a = this.points[i]!;
    const b = this.points[i + 1]!;
    const u = f - i;
    this.pulse.circle(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, 2.5).fill({ color: this.accent, alpha: 0.7 });
  }

  enter(): void {
    // The light wanders the open part of the trail, starting from where the player stands.
    const open = this.nodes.map((n, i) => (n.state === 'locked' ? -1 : i)).filter((i) => i >= 0);
    const points = open.map((i) => this.spiritSpot(i));
    const start = Math.max(0, open.indexOf(this.currentNode()));
    events.emit('spirit:tour', { points, pause: trailStyle.tourPause, start });
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
    // Back from a level: the sleeper stirs, a little brighter than before.
    if (this.justSolved !== null && this.sleeper) {
      const sleeper = this.sleeper;
      this.tweens.push(gsap.fromTo(sleeper, { alpha: Math.min(1, sleeper.alpha + 0.35) }, { alpha: sleeper.alpha, duration: durations.completion, delay: scaled(durations.sceneTransition) * 0.6, ease: easings.ambient }));
    }
    // Now and then the light says something to itself about how close it is.
    const solvedHere = getRegion(this.regionId).solved.length;
    const whisper = solvedHere < progression.levelsPerRegion ? whisperFor(this.regionId, solvedHere, seenStory()) : null;
    if (whisper) {
      this.tweens.push(
        gsap.delayedCall(trailStyle.whisperDelay, () => {
          whisper.ids.forEach((id) => markStorySeen(id));
          events.emit('spirit:say', { lines: [whisper.line] });
        }),
      );
    }
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

  // Choosing a level: its name lights fully and the light leaps into its stone.
  private press(i: number): void {
    if (this.nodes[i]!.state === 'locked' || this.chosen >= 0) return;
    this.chosen = i;
    const p = this.points[i]!;
    events.emit('spirit:dive', { x: p.x, y: p.y });
    gsap.delayedCall(scaled(spiritStyle.diveSeconds) * 1.05, () => this.onSelect(i));
  }

  resize(width: number, height: number): void {
    this.screen = { x: width, y: height };
    this.atmosphere.resize(width, height);
    const perRow = trailStyle.perRow;
    const rows = Math.ceil(progression.levelsPerRegion / perRow);
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
    // The sleeper floats in the sky between the icons and the first row of the trail.
    const firstRow = Math.min(...this.points.map((p) => p.y));
    this.sleeper?.position.set(width / 2, (hud.top() + 30 + firstRow - trailStyle.chapterEndRadius * 2) / 2);
  }

  destroy(): void {
    this.world3d?.dispose();
    this.unsubscribe();
    this.tweens.forEach((t) => t.kill());
    this.atmosphere.destroy();
    this.container.destroy({ children: true });
  }
}
