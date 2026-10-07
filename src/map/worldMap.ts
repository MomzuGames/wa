import gsap from 'gsap';
import { Container, type FederatedPointerEvent, Graphics } from 'pixi.js';
import type { Scene } from '../core/sceneManager';
import type { RegionId } from '../regions/types';
import { REGION_ORDER } from '../regions/catalog';
import { alphas, palette } from '../design/palette';
import { durations, easings, scaled } from '../design/motion';
import { spiritStyle } from '../ui/spirit';
import { isRegionComplete, regionUnlocked, solvedCount } from '../core/progress';
import { hud, isCompact } from '../design/layout';
import { RegionNode, type RegionState, regionNodeStyle } from './regionNode';
import { events } from '../core/events';
import { reducedMotion } from '../design/motion';
import { createRng } from '../core/rng';
import { OverlayWorld } from '../three/overlayWorld';
import { MAP_MOOD } from '../three/backdrop';
import { stage3d } from '../three/stage3d';
import { type Island, makeIsland } from './islands3d';
import { JourneyCamera } from './journeyCamera';
import { previewEnding } from '../config/platform';

const mapStyle = {
  spreadX: 0.7,
  spreadY: 0.34,
  pathSegments: 40,
  pathAlpha: 0.5,
  driftAmount: 9,
  driftSpeed: 0.12,
  twinkleCount: 90,
  twinkleAlpha: 0.3,
  pulseSpeed: 0.18,
  spiritOffsetY: -78,
  parallax: 22, // px the map shifts toward the pointer
  tourPause: 1.6,
  // The opening's last image: six lights falling, each into its land.
  fallSeconds: 1.7,
  dreamAlpha: 0.14, // the lands while the opening finishes
  landedAlpha: 0.32, // a land once its light has fallen into it
  wakeSeconds: 1.6,
  promptRadius: 26,
  belowHud: 44,
  fallStagger: 0.45,
  fallRadius: 6,
  landRipple: 46,
  // The Silence on the map: the colour drains out of the lands, one after another.
  silenceSeconds: 0.7, // the opening's Silence: how fast the colour goes
  colourReturnSeconds: 2.2, // a finished land's colour washing back
  // The world come alive, once every land is finished.
  aliveFadeSeconds: 4,
  auroraBands: 3,
  sparksPerLand: 7,
  sparkRise: 110, // px a spark climbs above its land before it fades
  sparkSpeed: 0.22, // rises per second
  alivePulses: 3, // lights travelling each trail at once
  waveStagger: 0.35, // seconds between lands as the colour sweeps across them
  // The scrolling journey on a phone: the lands drawn large down a long winding path that a
  // swipe scrolls (`JourneyCamera`); wherever you look, the lights come there.
  journey: {
    islandWidth: 0.48, // of the screen width: how wide a land's island is
    step: 0.37, // of the screen height between one land and the next
    first: 0.3, // of the screen height: where the first land sits when scrolled to the top
    last: 0.68, // and the last when scrolled to the bottom
    swing: 0.5, // how far the path swings from side to side (of the screen width, by LAYOUT)
    lightSize: 1.5, // the lights beside such large lands, at full zoom
    overviewFill: 0.74, // the opening's view of the whole world: this much of the height
  },
} as const;

// Region positions as fractions of the screen, forming a gentle winding journey.
const LAYOUT: Record<RegionId, { x: number; y: number }> = {
  tidepools: { x: 0.0, y: 0.35 },
  nightsky: { x: 0.2, y: -0.4 },
  stonegarden: { x: 0.4, y: 0.3 },
  crystalcaves: { x: 0.6, y: -0.35 },
  moonlake: { x: 0.8, y: 0.25 },
  shadowterrace: { x: 1.0, y: -0.3 },
};

export interface MapReveal {
  completed: RegionId;
}

export class WorldMapScene implements Scene {
  readonly container = new Container();
  private world = new Container();
  private twinkles = new Graphics();
  private pulses = new Graphics();
  // Every land in tune again: aurora ribbons across the sky, sparks rising from each land.
  private aurora = new Graphics();
  private sparks = new Graphics();
  private alive = { v: 0 };
  starDim = 1; // the stars dim when the Silence falls
  private waves: Array<{ x: number; y: number; p: number; color: number }> = [];
  private paths = new Graphics();
  private litPaths = new Graphics();
  private nodes = new Map<RegionId, RegionNode>();
  private width = 0;
  private height = 0;
  private time = 0;
  private seeds: number[] = [];
  private parallax = { x: 0, y: 0 };
  private drift = { x: 0, y: 0 }; // the map's slow drift and lean toward the pointer
  private chosen: RegionId | null = null;
  private unsubscribe: () => void = () => {};
  private world3d: OverlayWorld | null = null;
  private islands = new Map<RegionId, Island>();
  // The region whose completion is still to be shown; its outgoing path stays dark until then.
  private pendingReveal: RegionId | null;

  // Dreaming: the opening's last moments. The lands are dim and cannot be chosen, and the
  // light stays put, until the player taps it and the map wakes (see wakeUp).
  private dreaming: boolean;
  // The camera over the map: zoom, and which local height sits in the middle of the screen.
  private journey = false;
  private camera: JourneyCamera;
  private lightAt: { x: number; y: number } | null = null;
  private tourKey = '';

  constructor(
    private onSelect: (id: RegionId) => void,
    private reveal: MapReveal | null = null,
    dreaming = false,
  ) {
    this.dreaming = dreaming;
    this.pendingReveal = reveal?.completed ?? null;
    this.twinkles.eventMode = 'none';
    this.pulses.eventMode = 'none';
    this.aurora.eventMode = 'none';
    this.sparks.eventMode = 'none';
    const rng = createRng('worldmap');
    for (let i = 0; i < mapStyle.twinkleCount * 3; i++) this.seeds.push(rng.next());
    this.container.addChild(this.twinkles, this.aurora, this.world);
    this.world.addChild(this.paths, this.litPaths, this.pulses, this.sparks);
    for (const id of REGION_ORDER) {
      const node = new RegionNode(id, () => this.select(id));
      this.nodes.set(id, node);
      this.world.addChild(node);
    }
    this.applyStates();
    // In 3D every land is a small floating island right under its place on the map.
    if (stage3d()) {
      this.world3d = new OverlayWorld(MAP_MOOD);
      for (const id of REGION_ORDER) {
        const node = this.nodes.get(id)!;
        const island = makeIsland(id, node.accent);
        node.showFigure(false);
        this.world3d.add(island.group, () => node.getGlobalPosition(), () => regionNodeStyle.size * 0.5 * node.worldTransform.a);
        this.islands.set(id, island);
      }
      this.twinkles.visible = false;
    }
    if (dreaming) {
      // The opening begins on the world as it was: every land bright and in colour, until
      // the Silence falls in the opening (drainNow).
      for (const node of this.nodes.values()) {
        node.eventMode = 'none';
        void node.setColour(1);
      }
    }
    // The map leans toward the pointer, and the regions brighten as the light passes them.
    this.container.eventMode = 'static';
    this.container.on('globalpointermove', (e: FederatedPointerEvent) => {
      this.parallax = { x: e.global.x / Math.max(1, this.width) - 0.5, y: e.global.y / Math.max(1, this.height) - 0.5 };
    });
    // The light moves in the map's own coordinates (the map hands it its camera).
    this.unsubscribe = events.on('spirit:at', ({ x, y }) => {
      this.lightAt = { x, y };
      for (const id of REGION_ORDER) {
        const p = this.position(id);
        const reach = regionNodeStyle.nearRadius * this.nodes.get(id)!.restingScale;
        const d = Math.hypot(p.x - x, p.y - y);
        this.nodes.get(id)!.setNear(1 - Math.min(1, d / reach));
      }
    });
    // A swipe up or down travels the journey; when it comes to rest, the lights come too.
    this.camera = new JourneyCamera(this.container);
    this.camera.onSettle = () => this.roam();
    this.camera.locked = this.dreaming;
  }

  // A land is finished when all its levels are solved (or, in a test build, when the
  // finished-world switch is on).
  private finished(id: RegionId): boolean {
    return previewEnding() || isRegionComplete(solvedCount(id));
  }

  private stateFor(id: RegionId): RegionState {
    if (this.finished(id)) return 'complete';
    return regionUnlocked(id) ? 'unlocked' : 'locked';
  }

  private applyStates(): void {
    for (const id of REGION_ORDER) {
      let state = this.stateFor(id);
      // The freshly completed region (and the one it unlocks) animate in enter().
      if (this.reveal && id === this.reveal.completed) state = 'unlocked';
      if (this.reveal && this.isNextAfter(this.reveal.completed, id)) state = 'locked';
      void this.nodes.get(id)!.setState(state, false);
      // The Silence left every land grey; a finished land has its colour back.
      void this.nodes.get(id)!.setColour(state === 'complete' ? 1 : 0);
    }
  }

  private isNextAfter(completed: RegionId, id: RegionId): boolean {
    return REGION_ORDER[REGION_ORDER.indexOf(completed) + 1] === id;
  }

  private spiritSpot(id: RegionId): { x: number; y: number } {
    const p = this.position(id);
    if (this.journey) return { x: p.x, y: p.y - regionNodeStyle.size * 0.5 * this.nodes.get(id)!.restingScale - 26 };
    // Never up among the icons at the top of the screen.
    return { x: p.x, y: Math.max(p.y + mapStyle.spiritOffsetY, hud.top() + mapStyle.belowHud) };
  }

  // The light roams from region to region, lighting each as it arrives: on a phone, among
  // the lands in view, so wherever you look the lights are there (it starts at `startAt` if
  // that land is in view, otherwise at the one nearest to it).
  private roam(startAt?: RegionId): void {
    if (this.dreaming) return;
    let ids = [...REGION_ORDER];
    if (this.journey) {
      const v = this.camera.visible();
      const margin = (v.bottom - v.top) * 0.12;
      ids = REGION_ORDER.filter((id) => {
        const y = this.position(id).y;
        return y > v.top + margin && y < v.bottom - margin;
      });
      if (ids.length === 0) {
        const mid = (v.top + v.bottom) / 2;
        ids = [REGION_ORDER.reduce((a, b) => (Math.abs(this.position(a).y - mid) < Math.abs(this.position(b).y - mid) ? a : b))];
      }
    }
    const key = ids.join();
    if (startAt === undefined && key === this.tourKey) return;
    this.tourKey = key;
    // Begin with the chosen land, or the one nearest to where the light is now.
    const from = startAt && ids.includes(startAt) ? this.position(startAt) : (this.lightAt ?? this.position(ids[0]!));
    let start = 0;
    ids.forEach((id, k) => {
      const p = this.position(id);
      const q = this.position(ids[start]!);
      if (Math.hypot(p.x - from.x, p.y - from.y) < Math.hypot(q.x - from.x, q.y - from.y)) start = k;
    });
    events.emit('spirit:tour', { points: ids.map((id) => this.spiritSpot(id)), pause: mapStyle.tourPause, start });
  }

  // ----- the opening, told on the map (see opening.ts) -----

  // The middle of the screen, in the map's own coordinates and on the screen.
  centreLocal(): { x: number; y: number } {
    const z = this.world.scale.x || 1;
    return { x: (this.width / 2 - this.world.x) / z, y: (this.height * 0.48 - this.world.y) / z };
  }

  // A screen point in the map's own coordinates (where the light lives on the map).
  toMapLocal(p: { x: number; y: number }): { x: number; y: number } {
    const z = this.world.scale.x || 1;
    return { x: (p.x - this.world.x) / z, y: (p.y - this.world.y) / z };
  }

  // ----- the camera -----

  private journeyBounds(): { top: number; bottom: number } {
    return { top: this.position(REGION_ORDER[0]!).y, bottom: this.position(REGION_ORDER[REGION_ORDER.length - 1]!).y };
  }

  // Glide (or jump) to a land.
  focus(id: RegionId, instant = false): void {
    this.camera.focus(this.position(id).y, instant);
  }

  // The whole world at once, for the opening story.
  overview(instant = false): void {
    if (!this.journey) return;
    const b = this.journeyBounds();
    const span = b.bottom - b.top + regionNodeStyle.size * this.nodes.get(REGION_ORDER[0]!)!.restingScale;
    this.camera.zoom(Math.min(1, (this.height * mapStyle.journey.overviewFill) / span), (b.top + b.bottom) / 2, instant);
  }


  centreScreen(): { x: number; y: number } {
    return { x: this.width / 2, y: this.height * 0.48 };
  }

  landLocal(id: RegionId): { x: number; y: number } {
    return this.position(id);
  }

  addToWorld(c: Container): void {
    this.world.addChild(c);
  }

  addOverlay(c: Container): void {
    this.container.addChild(c);
  }

  // The world as it was: every land bright and in full colour, the stars all out.
  brightNow(): void {
    this.setDreaming(true);
    for (const node of this.nodes.values()) {
      gsap.killTweensOf(node);
      node.alpha = 1;
      void node.setColour(1);
    }
    this.paths.alpha = 1;
    this.starDim = 1;
  }

  // The Silence: every land flickers and loses its colour at once, the trails and stars dim.
  drainNow(instant = false): void {
    for (const node of this.nodes.values()) {
      gsap.killTweensOf(node);
      if (instant) {
        node.alpha = mapStyle.dreamAlpha;
        void node.setColour(0);
        continue;
      }
      void node.setColour(0, mapStyle.silenceSeconds);
      gsap
        .timeline()
        .to(node, { alpha: 0.35, duration: 0.08 })
        .to(node, { alpha: 0.9, duration: 0.08 })
        .to(node, { alpha: 0.25, duration: 0.1 })
        .to(node, { alpha: 0.6, duration: 0.1 })
        .to(node, { alpha: mapStyle.dreamAlpha, duration: scaled(mapStyle.silenceSeconds), ease: easings.ambient });
    }
    gsap.to(this.paths, { alpha: mapStyle.dreamAlpha, duration: instant ? 0 : scaled(mapStyle.silenceSeconds) });
    gsap.to(this, { starDim: 0.25, duration: instant ? 0 : scaled(mapStyle.silenceSeconds) });
  }

  // A family light has sunk into its land: the land glows once in its colour, then sleeps.
  lightLanded(id: RegionId, instant = false): void {
    const node = this.nodes.get(id)!;
    const p = this.position(id);
    if (instant) {
      node.alpha = mapStyle.landedAlpha;
      return;
    }
    const ripple = new Graphics();
    ripple.eventMode = 'none';
    this.world.addChild(ripple);
    const r = { p: 0 };
    gsap.to(r, {
      p: 1,
      duration: scaled(durations.completion) * 0.4,
      ease: easings.response,
      onUpdate: () => ripple.clear().circle(p.x, p.y, 8 + r.p * mapStyle.landRipple).stroke({ color: node.accent, width: 1.5, alpha: 0.6 * (1 - r.p) }),
      onComplete: () => ripple.destroy(),
    });
    gsap.to(node, { alpha: mapStyle.landedAlpha, duration: scaled(durations.pieceMove) * 3 });
    // Its song, one last time, then sleep.
    void node.setColour(0.7, 0.3).then(() => node.setColour(0, 1.8));
  }

  // Lands cannot be chosen while the story is told over the map.
  setDreaming(on: boolean): void {
    this.dreaming = on;
    this.camera.locked = on;
    // The story is told over the whole world, seen from further back.
    if (on) this.overview();
    for (const node of this.nodes.values()) node.eventMode = on ? 'none' : 'static';
  }

  // After a replay: every finished land takes its colour back.
  async restoreColours(): Promise<void> {
    await Promise.all(REGION_ORDER.filter((id) => this.stateFor(id) === 'complete').map((id) => this.nodes.get(id)!.setColour(1, mapStyle.colourReturnSeconds)));
  }

  // Where the light waits while the opening finishes: the middle of the screen.
  get dreamSpot(): { x: number; y: number } {
    return { x: this.width / 2, y: this.height * 0.5 };
  }

  // A faint ring breathes around the light; resolves when the player taps it.
  waitForLightTap(at: { x: number; y: number } = this.dreamSpot): Promise<void> {
    const { x, y } = at;
    const ring = new Graphics().circle(0, 0, mapStyle.promptRadius).stroke({ color: palette.pearl, width: 1, alpha: 0.6 });
    ring.position.set(x, y);
    ring.alpha = 0;
    const hit = new Graphics().circle(0, 0, mapStyle.promptRadius * 2).fill({ color: palette.pearl, alpha: 0.001 });
    hit.position.set(x, y);
    hit.eventMode = 'static';
    hit.cursor = 'pointer';
    this.container.addChild(ring, hit);
    const breath = gsap.to(ring, { alpha: 0.35, duration: 1.6, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    const grow = gsap.fromTo(ring.scale, { x: 0.9, y: 0.9 }, { x: 1.15, y: 1.15, duration: 1.6, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    return new Promise((resolve) => {
      hit.on('pointertap', () => {
        breath.kill();
        grow.kill();
        ring.destroy();
        hit.destroy();
        resolve();
      });
    });
  }

  // The map wakes: the lands brighten, become choosable, and the light starts to roam.
  wakeUp(): void {
    if (!this.dreaming) return;
    this.dreaming = false;
    for (const node of this.nodes.values()) {
      gsap.to(node, { alpha: 1, duration: scaled(mapStyle.wakeSeconds), ease: easings.ambient });
      node.eventMode = 'static';
    }
    gsap.to(this.paths, { alpha: 1, duration: scaled(mapStyle.wakeSeconds) });
    gsap.to(this, { starDim: 1, duration: scaled(mapStyle.wakeSeconds) });
    this.camera.locked = false;
    this.focus(this.firstUnfinished());
    this.roam(this.firstUnfinished());
  }

  // Choosing a region: its name lights fully and the light leaps into the figure.
  private select(id: RegionId): void {
    if (this.chosen || this.camera.dragMoved) return;
    this.chosen = id;
    const p = this.position(id);
    for (const other of REGION_ORDER) this.nodes.get(other)!.setChosen(other === id);
    this.focus(id);
    events.emit('spirit:dive', { x: p.x, y: p.y - regionNodeStyle.size * 0.1 * this.nodes.get(id)!.restingScale });
    gsap.delayedCall(scaled(spiritStyle.diveSeconds) * 1.05, () => this.onSelect(id));
  }

  // Where the journey stands: the first region that is not finished yet.
  private firstUnfinished(): RegionId {
    for (const id of REGION_ORDER) if (!this.finished(id)) return id;
    return REGION_ORDER[0]!;
  }

  enter(): void {
    if (this.dreaming) return;
    if (this.reveal) {
      void this.playReveal(this.reveal.completed);
      return;
    }
    this.roam(this.firstUnfinished());
    if (this.allFinished()) this.celebrate(false);
  }

  private allFinished(): boolean {
    // Dev: ?alive=1 shows the living world without finishing every land.
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('alive')) return true;
    return REGION_ORDER.every((id) => this.finished(id));
  }

  // The whole world in tune: the sky fills with aurora, sparks rise from every land, more
  // light travels the trails. Played as a wave of colour across the lands the moment the
  // last land is finished, and simply present on every visit after.
  private celebrate(animate: boolean): void {
    if (this.alive.v > 0) return;
    for (const node of this.nodes.values()) void node.setColour(1, animate ? mapStyle.colourReturnSeconds : 0);
    if (!animate) {
      this.alive.v = 1;
      return;
    }
    gsap.to(this.alive, { v: 1, duration: scaled(mapStyle.aliveFadeSeconds), ease: easings.ambient });
    REGION_ORDER.forEach((id, i) => {
      gsap.delayedCall(i * mapStyle.waveStagger, () => {
        const node = this.nodes.get(id)!;
        const p = this.position(id);
        const wave = { x: p.x, y: p.y, p: 0, color: node.accent };
        this.waves.push(wave);
        gsap.to(wave, { p: 1, duration: scaled(durations.completion) * 0.6, ease: easings.response, onComplete: () => this.waves.splice(this.waves.indexOf(wave), 1) });
        gsap.fromTo(node.scale, { x: 1, y: 1 }, { x: 1.14, y: 1.14, duration: scaled(durations.pieceMove), yoyo: true, repeat: 1, ease: easings.ambient });
      });
    });
  }

  update(dt: number): void {
    this.time += dt;
    this.camera.update(dt);
    this.camera.apply(this.world, this.drift, this.journey ? mapStyle.journey.lightSize : 1);
    if (this.world3d) {
      for (const id of REGION_ORDER) {
        const node = this.nodes.get(id)!;
        const island = this.islands.get(id)!;
        island.setTint(node.tint, node.colourAmount);
        island.setOpacity(Math.max(0.15, node.alpha) * this.container.alpha);
        island.update(this.time);
      }
      this.world3d.update(dt, this.parallax.x);
    }
    for (const node of this.nodes.values()) node.tick(dt);
    if (reducedMotion()) return;
    const k = Math.min(1, dt * 3);
    const px = -this.parallax.x * mapStyle.parallax;
    const py = -this.parallax.y * mapStyle.parallax * 0.7;
    this.drift.x += (Math.sin(this.time * mapStyle.driftSpeed) * mapStyle.driftAmount + px - this.drift.x) * k;
    this.drift.y += (Math.cos(this.time * mapStyle.driftSpeed * 0.7) * mapStyle.driftAmount * 0.6 + py - this.drift.y) * k;
    // The star field sits further back, so it shifts less than the regions.
    this.twinkles.x = px * 0.35;
    this.twinkles.y = py * 0.35;
    this.drawTwinkles();
    this.drawPulses();
    this.aurora.x = px * 0.5;
    this.aurora.y = py * 0.5;
    this.drawAlive();
  }

  // Aurora ribbons, rising sparks and the colour waves, while the world is alive.
  private drawAlive(): void {
    this.aurora.clear();
    this.sparks.clear();
    const a = this.alive.v;
    if (a <= 0 && this.waves.length === 0) return;
    const accents = REGION_ORDER.map((id) => this.nodes.get(id)!.accent);
    const top = this.height > this.width ? this.height * 0.1 : this.height * 0.08;
    for (let k = 0; k < mapStyle.auroraBands; k++) {
      const color = accents[(k * 2 + Math.floor(this.time / 20)) % accents.length]!;
      const base = top + k * this.height * 0.06;
      const ribbon = () => {
        for (let x = -40; x <= this.width + 40; x += 16) {
          const y = base + Math.sin(x * 0.006 + this.time * 0.25 + k * 1.7) * this.height * 0.035 + Math.sin(x * 0.013 - this.time * 0.17 + k) * this.height * 0.015;
          if (x === -40) this.aurora.moveTo(x, y);
          else this.aurora.lineTo(x, y);
        }
      };
      for (const [w, al] of [[46, 0.05], [22, 0.08], [6, 0.13]] as const) {
        ribbon();
        this.aurora.stroke({ color, width: w, alpha: al * a, cap: 'round', join: 'round' });
      }
    }
    if (a > 0) {
      REGION_ORDER.forEach((id, i) => {
        const p = this.position(id);
        const color = accents[i]!;
        for (let k = 0; k < mapStyle.sparksPerLand; k++) {
          const s1 = this.seeds[(i * mapStyle.sparksPerLand + k) * 3]!;
          const s2 = this.seeds[(i * mapStyle.sparksPerLand + k) * 3 + 1]!;
          const q = (this.time * mapStyle.sparkSpeed * (0.8 + s2 * 0.4) + s1) % 1;
          const x = p.x + (s2 - 0.5) * 70 + Math.sin(this.time * 1.3 + s1 * 9) * 8;
          const y = p.y + 20 - q * mapStyle.sparkRise;
          this.sparks.circle(x, y, 2.2 * (1 - q) + 0.6).fill({ color, alpha: Math.sin(q * Math.PI) * 0.8 * a });
        }
      });
    }
    for (const w of this.waves) this.sparks.circle(w.x, w.y, 20 + w.p * 120).stroke({ color: w.color, width: 2, alpha: 0.6 * (1 - w.p) });
  }

  private drawTwinkles(): void {
    const g = this.twinkles;
    g.clear();
    for (let i = 0; i < mapStyle.twinkleCount; i++) {
      const x = this.seeds[i * 3]! * this.width;
      const y = this.seeds[i * 3 + 1]! * this.height;
      const phase = this.seeds[i * 3 + 2]! * Math.PI * 2;
      const tw = 0.5 + 0.5 * Math.sin(this.time * (0.5 + phase * 0.08) + phase);
      // Once the world is alive, some stars take on the lands' colours.
      const color = this.alive.v > 0.3 && i % 3 === 0 ? this.nodes.get(REGION_ORDER[i % REGION_ORDER.length]!)!.accent : palette.pearl;
      g.circle(x, y, 0.7 + tw * (1 + this.alive.v * 0.4)).fill({ color, alpha: mapStyle.twinkleAlpha * tw * (1 + this.alive.v * 0.5) * this.starDim });
    }
  }

  // A mote of light travels along every completed trail.
  private drawPulses(): void {
    const g = this.pulses;
    g.clear();
    for (let i = 0; i < REGION_ORDER.length - 1; i++) {
      const a = REGION_ORDER[i]!;
      const b = REGION_ORDER[i + 1]!;
      if (!this.finished(a) || a === this.pendingReveal) continue;
      // One pearl light per finished trail; once the world is alive, more, in the lands' colours.
      const count = this.alive.v > 0 ? mapStyle.alivePulses : 1;
      for (let k = 0; k < count; k++) {
        const t = ((this.time * mapStyle.pulseSpeed + i * 0.37 + k / count) % 1 + 1) % 1;
        const p = this.curve(a, b, t);
        const color = k === 0 ? palette.pearl : this.nodes.get(k % 2 ? a : b)!.accent;
        const al = k === 0 ? 1 : this.alive.v;
        g.circle(p.x, p.y, 9).fill({ color, alpha: 0.1 * al }).circle(p.x, p.y, 5).fill({ color, alpha: 0.2 * al });
        g.circle(p.x, p.y, 3).fill({ color, alpha: 0.8 * al });
      }
    }
  }

  private async playReveal(completed: RegionId): Promise<void> {
    await new Promise((r) => gsap.delayedCall(scaled(durations.sceneTransition), r));
    // The land's song is back, and with it its colour.
    const node = this.nodes.get(completed)!;
    await Promise.all([node.setColour(1, mapStyle.colourReturnSeconds), node.setState('complete', true)]);
    const next = REGION_ORDER[REGION_ORDER.indexOf(completed) + 1];
    if (!next) {
      this.pendingReveal = null;
      this.roam(completed);
      if (this.allFinished()) this.celebrate(true);
      return;
    }
    this.focus(next);
    await this.drawLitPath(completed, next);
    this.pendingReveal = null;
    await this.nodes.get(next)!.setState(this.stateFor(next), false);
    this.roam(next);
    if (this.allFinished()) this.celebrate(true);
  }

  private position(id: RegionId): { x: number; y: number } {
    const f = LAYOUT[id];
    if (this.journey) {
      // The scrolling journey: one land after another down a long path, swinging side to side.
      const j = mapStyle.journey;
      return { x: this.width / 2 + f.y * this.width * j.swing, y: this.height * j.first + REGION_ORDER.indexOf(id) * this.height * j.step };
    }
    if (this.height > this.width) {
      // Portrait: the journey winds down the screen instead of across it, swinging wide
      // from side to side so neighbouring figures and names never meet.
      const spanY = this.height * 0.7;
      const spanX = this.width * 0.62;
      return { x: this.width / 2 + f.y * spanX, y: (this.height - spanY) / 2 + 30 + f.x * spanY };
    }
    const spanX = this.width * mapStyle.spreadX;
    const spanY = this.height * mapStyle.spreadY;
    return { x: (this.width - spanX) / 2 + f.x * spanX, y: this.height / 2 + f.y * spanY };
  }

  private curve(from: RegionId, to: RegionId, t: number): { x: number; y: number } {
    const a = { ...this.position(from) };
    const b = { ...this.position(to) };
    if (this.journey) {
      // The path leaves from under one island and arrives at the rim of the next, never
      // crossing over them.
      a.y += regionNodeStyle.size * 0.5 * this.nodes.get(from)!.restingScale * 0.75;
      b.y -= regionNodeStyle.size * 0.5 * this.nodes.get(to)!.restingScale * 0.42;
    }
    const cx = (a.x + b.x) / 2;
    // Cubic ease between the two, bending horizontally so the trail winds rather than zig-zags.
    const u = 1 - t;
    const x = u * u * u * a.x + 3 * u * u * t * cx + 3 * u * t * t * cx + t * t * t * b.x;
    const y = u * u * u * a.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t * t * t * b.y;
    return { x, y };
  }

  private strokePath(g: Graphics, from: RegionId, to: RegionId, progress: number): void {
    const steps = Math.max(1, Math.round(mapStyle.pathSegments * progress));
    for (let i = 0; i <= steps; i++) {
      const p = this.curve(from, to, i / mapStyle.pathSegments);
      if (i === 0) g.moveTo(p.x, p.y);
      else g.lineTo(p.x, p.y);
    }
  }

  private drawLitPath(from: RegionId, to: RegionId): Promise<void> {
    const state = { t: 0 };
    return new Promise((resolve) => {
      gsap.to(state, {
        t: 1,
        duration: scaled(durations.completion),
        ease: easings.ambient,
        onUpdate: () => this.redrawLit(from, to, state.t),
        onComplete: resolve,
      });
    });
  }

  private redrawLit(from: RegionId, to: RegionId, progress: number): void {
    this.litPaths.clear();
    this.drawAllLit(from, to, progress);
  }

  private drawAllLit(animatingFrom: RegionId | null, animatingTo: RegionId | null, progress: number): void {
    for (let i = 0; i < REGION_ORDER.length - 1; i++) {
      const a = REGION_ORDER[i]!;
      const b = REGION_ORDER[i + 1]!;
      const isAnimating = a === animatingFrom && b === animatingTo;
      const settled = this.finished(a) && a !== this.pendingReveal;
      const lit = isAnimating ? progress : settled ? 1 : 0;
      if (lit <= 0) continue;
      // A soft drawn glow under each lit trail (no filter: those cost a full-screen pass a frame).
      for (const [width, alpha] of [[8, 0.06], [4, 0.14]] as const) {
        this.strokePath(this.litPaths, a, b, lit);
        this.litPaths.stroke({ color: this.nodes.get(a)!.accent, width, alpha });
      }
      this.strokePath(this.litPaths, a, b, lit);
      this.litPaths.stroke({ color: this.nodes.get(a)!.accent, width: 1.5, alpha: alphas.hudHover });
    }
  }

  resize(width: number, height: number): void {
    const first = this.width === 0;
    this.width = width;
    this.height = height;
    // Phones (portrait) get the scrolling journey with large lands; wide screens keep the
    // whole world on one screen.
    this.journey = height > width;
    const compact = isCompact(width) || height > width;
    const journeyScale = (width * mapStyle.journey.islandWidth) / regionNodeStyle.size;
    for (const id of REGION_ORDER) {
      const node = this.nodes.get(id)!;
      node.setCompact(compact);
      if (this.journey) node.setJourney(journeyScale);
      node.position.copyFrom(this.position(id));
    }
    const j = mapStyle.journey;
    const b = this.journeyBounds();
    this.camera.enabled = this.journey;
    this.camera.setRange(b.top + height * (0.5 - j.first), b.bottom - height * (j.last - 0.5));
    this.camera.resize(width, height);
    if (this.journey && first) {
      if (this.dreaming) this.overview(true);
      else this.focus(this.reveal?.completed ?? this.firstUnfinished(), true);
    }
    this.paths.clear();
    for (let i = 0; i < REGION_ORDER.length - 1; i++) {
      this.strokePath(this.paths, REGION_ORDER[i]!, REGION_ORDER[i + 1]!, 1);
    }
    this.paths.stroke({ color: palette.dim, width: 1, alpha: mapStyle.pathAlpha });
    this.litPaths.clear();
    this.drawAllLit(null, null, 0);
  }

  destroy(): void {
    this.world3d?.dispose();
    this.unsubscribe();
    this.container.destroy({ children: true });
  }
}
