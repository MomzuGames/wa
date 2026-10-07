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
import { type StepStone, makeLevelIsland } from './islands3d';
import { JourneyCamera } from './journeyCamera';
import { StoryLight } from '../story/art';
import { familyColor } from '../story/family';
import { whisperFor } from '../story/whispers';
import { currentProfile, getRegion, markStorySeen, seenStory } from '../core/save';
import { layout } from '../design/layout';

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
  // The scrolling journey on a phone: large stones down a winding path, one level about
  // every fifth of the screen height; a swipe scrolls it, and the lights come to the view.
  journey: {
    stoneWidth: 0.3, // of the screen width
    step: 0.2, // of the screen height between levels
    first: 0.36, // where the first level sits when scrolled to the top
    last: 0.7, // and the last when scrolled to the bottom
    swing: 0.24, // of the screen width, side to side
    lightSize: 1.3, // the lights beside the larger stones
    hop: 0.5, // seconds for the lights to reach the levels in view after a swipe
    sleeperSize: 1.9, // the sleeping family member at the end of the trail, beside the large stones
  },
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
  hit: Graphics;
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
  // The trail lives in `world`, moved by the camera; the sleeper stays up in the sky.
  private world = new Container();
  private camera: JourneyCamera;
  private journey = false;
  private stoneScale = 1;
  private tourKey = '';
  private sleeperScale = 1;
  private sleeperTrail = new Graphics(); // the faint last stretch, from the last level to the sleeper
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
    this.container.addChild(this.atmosphere.container, this.world);
    this.world.addChild(this.trail, this.sleeperTrail, this.pulse);
    this.camera = new JourneyCamera(this.container);
    this.camera.onSettle = () => this.roam(false);
    this.camera.onMove = () => this.roam(false);
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
      this.nodes.push({ root, disc, label, state: 'locked', radius, near: 0, glow, hit });
      this.world.addChild(root);
    }
    // In 3D the levels are floating stepping stones under the trail, in the land's own night.
    if (stage3d()) {
      this.world3d = new OverlayWorld(moodFor(regionId, getRegion(regionId).solved.length, ''));
      this.atmosphere.container.visible = false;
      this.nodes.forEach((node, i) => {
        const stone = makeLevelIsland(regionId, i);
        this.world3d!.add(stone.group, () => node.root.getGlobalPosition(), () => node.radius * 1.45 * this.stoneScale * node.root.worldTransform.a);
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
      // It waits at the end of the trail: finishing the last level reaches it and wakes it.
      this.world.addChild(sleeper);
      this.sleeperScale = sleeper.scale.x;
      this.sleeper = sleeper;
      this.tweens.push(gsap.to(sleeper.body.scale, { x: 1.07, y: 1.07, duration: durations.breathe / 2, yoyo: true, repeat: -1, ease: easings.ambient }));
    }
    // Levels brighten as the light passes over them.
    this.unsubscribe = events.on('spirit:at', ({ x, y }) => {
      this.nodes.forEach((node, i) => {
        const p = this.points[i];
        if (!p) return;
        node.near = 1 - Math.min(1, Math.hypot(p.x - x, p.y - y) / (trailStyle.nearRadius * this.stoneScale));
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
    if (this.journey) return { x: p.x, y: p.y - this.nodes[i]!.radius * 1.45 * this.stoneScale - 22 };
    return { x: p.x, y: p.y + trailStyle.spiritOffsetY };
  }

  update(dt: number): void {
    this.time += dt;
    this.camera.update(dt);
    this.camera.apply(this.world, { x: 0, y: 0 }, this.journey ? trailStyle.journey.lightSize : 1);
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

  // The light wanders the open part of the trail: on a phone, the open levels in view, so
  // wherever you look the lights are there. It starts where the player stands (or, after
  // a swipe, at the open level nearest the middle of the view).
  private roam(fromCurrent: boolean): void {
    let open = this.nodes.map((n, i) => (n.state === 'locked' ? -1 : i)).filter((i) => i >= 0);
    if (this.journey) {
      const v = this.camera.visible();
      const margin = (v.bottom - v.top) * 0.1;
      const seen = open.filter((i) => this.points[i]!.y > v.top + margin && this.points[i]!.y < v.bottom - margin);
      const mid = (v.top + v.bottom) / 2;
      open = seen.length > 0 ? seen : open.length > 0 ? [open.reduce((a, b) => (Math.abs(this.points[a]!.y - mid) < Math.abs(this.points[b]!.y - mid) ? a : b))] : [];
    }
    const key = open.join();
    if (!fromCurrent && key === this.tourKey) return;
    this.tourKey = key;
    const v = this.camera.visible();
    const mid = (v.top + v.bottom) / 2;
    const want = fromCurrent && open.includes(this.currentNode()) ? this.currentNode() : open.reduce((a, b) => (Math.abs(this.points[a]!.y - mid) < Math.abs(this.points[b]!.y - mid) ? a : b), open[0] ?? 0);
    events.emit('spirit:tour', { points: open.map((i) => this.spiritSpot(i)), pause: trailStyle.tourPause, start: Math.max(0, open.indexOf(want)), first: fromCurrent ? undefined : trailStyle.journey.hop });
  }

  enter(): void {
    this.roam(true);
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
    if (this.nodes[i]!.state === 'locked' || this.chosen >= 0 || this.camera.dragMoved) return;
    this.chosen = i;
    const p = this.points[i]!;
    events.emit('spirit:dive', { x: p.x, y: p.y });
    gsap.delayedCall(scaled(spiritStyle.diveSeconds) * 1.05, () => this.onSelect(i));
  }

  resize(width: number, height: number): void {
    const first = this.screen.x === 1 && this.screen.y === 1;
    this.screen = { x: width, y: height };
    this.atmosphere.resize(width, height);
    this.journey = height > width;
    if (this.journey) this.layoutJourney(width, height);
    else this.layoutRows(width, height);
    // Each stone's name sits beneath it and its touch area covers it, at whatever size.
    this.nodes.forEach((node) => {
      const r = node.radius * this.stoneScale;
      node.label.y = r * (this.journey ? 1.45 : 1) + trailStyle.nameOffsetY - 12;
      node.hit.clear().circle(0, 0, Math.max(layout.minHitSize / 2, r * (this.journey ? 1.45 : 1) + 6)).fill({ color: palette.pearl, alpha: 0.001 });
    });
    this.trail.clear();
    // On a phone each stretch leaves from under one stone and arrives at the rim of the next.
    const under = (i: number) => (this.journey ? this.nodes[i]!.radius * 1.45 * this.stoneScale : 0);
    this.points.forEach((p, i) => {
      if (i === 0) return;
      const prev = this.points[i - 1]!;
      const a = { x: prev.x, y: prev.y + under(i - 1) * 0.55 };
      const b = { x: p.x, y: p.y - under(i) * 0.3 };
      const cx = (a.x + b.x) / 2;
      if (i === 1 || this.journey) this.trail.moveTo(a.x, a.y);
      this.trail.bezierCurveTo(cx, a.y, cx, b.y, b.x, b.y);
    });
    this.trail.stroke({ color: palette.dim, width: 1, alpha: trailStyle.lineAlpha });
    // The sleeper floats at the end of the trail, past the last level: the journey's goal.
    const j = trailStyle.journey;
    const last = this.points[this.points.length - 1]!;
    const sleeperAt = this.journey
      ? { x: width / 2, y: last.y + height * j.step * 1.15 }
      : { x: last.x + (last.x > width / 2 ? -1 : 1) * width * 0.09, y: last.y + height * trailStyle.rowFraction * 0.55 };
    this.sleeperTrail.clear();
    if (this.sleeper) {
      this.sleeper.position.set(sleeperAt.x, sleeperAt.y);
      this.sleeper.scale.set(this.sleeperScale * (this.journey ? j.sleeperSize : 1));
      // A faint dotted stretch leads on from the last level to it.
      const from = { x: last.x, y: last.y + (this.journey ? this.nodes[this.nodes.length - 1]!.radius * 1.45 * this.stoneScale * 0.55 : 0) };
      for (let k = 1; k < 9; k++) {
        const t = k / 9;
        this.sleeperTrail.circle(from.x + (sleeperAt.x - from.x) * t, from.y + (sleeperAt.y - from.y) * t, 1.4).fill({ color: palette.pearl, alpha: 0.25 });
      }
    }
    // The camera: on a phone, the journey scrolls, opening on where the player stands.
    const ys = [...this.points.map((p) => p.y), ...(this.sleeper ? [sleeperAt.y] : [])];
    this.camera.enabled = this.journey;
    this.camera.setRange(Math.min(...ys) + height * (0.5 - j.first), Math.max(...ys) - height * (j.last - 0.5));
    this.camera.resize(width, height);
    if (this.journey && first) this.camera.focus(this.points[this.currentNode()]!.y, true);
  }

  // A phone: one level after another down a long winding path, the stones drawn large.
  private layoutJourney(width: number, height: number): void {
    const j = trailStyle.journey;
    this.stoneScale = (width * j.stoneWidth) / 2 / (trailStyle.nodeRadius * 1.45);
    this.points = [];
    this.nodes.forEach((node, i) => {
      const x = width / 2 + Math.sin(i * 1.15 + 0.4) * width * j.swing;
      const y = height * j.first + i * height * j.step;
      node.root.position.set(x, y);
      this.points.push({ x, y });
    });
  }

  // A wide screen: the whole trail in winding rows on one screen.
  private layoutRows(width: number, height: number): void {
    this.stoneScale = 1;
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
  }

  destroy(): void {
    this.world3d?.dispose();
    this.unsubscribe();
    this.tweens.forEach((t) => t.kill());
    this.atmosphere.destroy();
    this.container.destroy({ children: true });
  }
}
