import type { Application } from 'pixi.js';
import { SceneManager } from './sceneManager';
import { events } from './events';
import { devFlags } from './dev';
import { createRng } from './rng';
import { levelPlayable, paywalled, progression, setBypassLocks } from './progress';
import { currentProfile, getRegion, markStorySeen, seenStory } from './save';
import { applyUpdateIfReady } from './updates';
import type { RegionId, ShellContext } from '../regions/types';
import { REGION_ACCENT, REGION_ORDER } from '../regions/catalog';
import type { PaletteToken } from '../design/palette';
import { StoryPlayer } from '../story/storyPlayer';
import { StoryBook } from '../ui/storyBook';
import type { SceneId } from '../story/script';
import { earnedScenes, landDone, scenesAfterLevel, type Solved } from '../story/triggers';
import { getModule } from '../regions/registry';
import { palette } from '../design/palette';
import { durations, easings, scaled } from '../design/motion';
import gsap from 'gsap';
import type { AudioEngine } from '../audio/engine';
import type { ParticleSystem } from '../fx/particles';
import type { Hud } from '../ui/hud';
import type { SettingsPanel } from '../ui/settings';
import { TitleScene } from '../scenes/title';
import { WorldMapScene, type MapReveal } from '../map/worldMap';
import { RegionScene } from '../map/regionScene';
import { haptic } from './native';
import { LevelShellScene, type LevelResult } from '../scenes/levelScene';

export interface GameDeps {
  openAccount: () => void;
  app: Application;
  scenes: SceneManager;
  audio: AudioEngine;
  particles: ParticleSystem;
  hud: Hud;
  settings: SettingsPanel;
}

export class Game {
  private storyPlaying = false;
  private previewingStory = false;
  private storyBook = new StoryBook();

  constructor(private deps: GameDeps) {
    events.on('input:back', () => this.back());
    // The book icon: every chapter reached so far, any of which plays again when tapped.
    events.on('story:book', () => this.storyBook.open(new Set(earnedScenes(this.solved()))));
    events.on('story:play', (id) => void this.replay(id as SceneId));
    events.on('progress:changed', () => this.showFamily(!(this.deps.scenes.scene instanceof LevelShellScene)));
    // Browsers only allow audio after a gesture. iOS Safari accepts only a finished
    // tap (touchend/click) or a key, never touchstart/pointerdown, so listen to those
    // and keep trying until the audio context is really running.
    const types = ['touchend', 'click', 'keydown'];
    const unlock = () => {
      void deps.audio.start().then(() => {
        if (deps.audio.isStarted) for (const type of types) window.removeEventListener(type, unlock);
      });
    };
    for (const type of types) window.addEventListener(type, unlock);
  }

  start(): void {
    this.applyProfileTint();
    if (devFlags.enabled) {
      const params = new URLSearchParams(location.search);
      // ?locks=1 keeps progress and the paywall in force, to test them in dev.
      setBypassLocks(!params.has('locks'));
      const trail = params.get('trail');
      if (trail && REGION_ORDER.includes(trail as RegionId)) {
        this.showRegion(trail as RegionId);
        return;
      }
      // ?story=all (or a scene id such as asleep:moonlake) previews the story.
      const story = params.get('story');
      if (story) {
        this.previewingStory = true;
        this.showMap();
        const all: SceneId[] = ['prologue', ...REGION_ORDER.map((id) => `asleep:${id}` as SceneId), 'waiting', ...REGION_ORDER.map((id) => `home:${id}` as SceneId), 'finale'];
        void this.playStory(story === 'all' ? all : [story as SceneId], false);
        return;
      }
      const jump = params.get('level');
      if (jump) {
        const [region, index] = jump.split(':');
        if (REGION_ORDER.includes(region as RegionId)) {
          this.showLevel(region as RegionId, Math.max(0, (Number(index) || 1) - 1));
          return;
        }
      }
    }
    this.showTitle();
  }

  private get width(): number {
    return this.deps.app.screen.width;
  }

  private get height(): number {
    return this.deps.app.screen.height;
  }

  showTitle(): void {
    applyUpdateIfReady();
    this.deps.hud.setBackVisible(false);
    this.deps.hud.setLevelButtons(null);
    this.deps.hud.setAccountButton(() => this.deps.openAccount());
    this.deps.audio.setScene('title');
    this.showFamily(true);
    void this.deps.scenes.go(new TitleScene(() => this.showMap()));
  }

  showMap(reveal: MapReveal | null = null): void {
    if (!reveal) applyUpdateIfReady();
    this.deps.hud.setBackVisible(true);
    this.deps.hud.setLevelButtons(null);
    this.deps.hud.setAccountButton(() => this.deps.openAccount());
    this.deps.audio.setScene('quiet');
    this.showFamily(true);
    const map = new WorldMapScene((id) => this.showRegion(id), reveal);
    void this.deps.scenes.go(map);
    // A new light's journey opens with the story of how it began.
    if (!seenStory().has('prologue') && !this.previewingStory) void this.openJourney(map);
  }

  showRegion(id: RegionId, justSolved: number | null = null): void {
    this.deps.hud.setBackVisible(true);
    this.deps.hud.setLevelButtons(null);
    this.deps.hud.setAccountButton(null);
    this.deps.audio.setScene(id);
    this.showFamily(true);
    void this.deps.scenes.go(new RegionScene(id, (level) => this.showLevel(id, level), justSolved));
  }

  showLevel(id: RegionId, levelIndex: number): void {
    this.deps.hud.setBackVisible(true);
    this.deps.hud.setAccountButton(null);
    this.deps.audio.setScene(id);
    // In a level the light sits by the level's name: the family waits off stage.
    this.showFamily(false);
    const module = getModule(id);
    const scene = new LevelShellScene(
      module,
      levelIndex,
      { audio: this.deps.audio, particles: this.deps.particles, width: this.width, height: this.height },
      (result) => void this.afterLevel(result),
    );
    this.deps.hud.setLevelButtons({ onHelp: () => scene.showInstructions(), onHint: () => scene.askHint() });
    void this.deps.scenes.go(scene);
  }

  private async afterLevel(result: LevelResult): Promise<void> {
    const { regionId, levelIndex, completedRegion } = result;
    const story = scenesAfterLevel(regionId, this.solved(), seenStory());
    if (completedRegion) {
      const ctx: ShellContext = {
        palette,
        motion: { durations, easings },
        audio: this.deps.audio,
        particles: this.deps.particles,
        rng: createRng(`${regionId}:finale`),
        width: this.width,
        height: this.height,
      };
      haptic('medium');
      await getModule(regionId).playRegionFinale(ctx);
      await this.playStory(story);
      this.showMap({ completed: regionId });
      return;
    }
    await this.playStory(story);
    const next = levelIndex + 1;
    // A solved level leads straight into the next one; only the last level returns to the trail.
    if (next < progression.levelsPerRegion && levelPlayable(regionId, next)) {
      this.showLevel(regionId, next);
    } else {
      this.showRegion(regionId, levelIndex);
      // The free part of this land is done: offer the rest of the journey, gently.
      if (next < progression.levelsPerRegion && paywalled(next)) gsap.delayedCall(scaled(durations.sceneTransition) * 2, () => events.emit('unlock:ask'));
    }
  }

  // The opening: the story, then on the map six lights fall into their lands, and the
  // smallest light makes up its mind.
  private async openJourney(map: WorldMapScene): Promise<void> {
    await this.playStory(['prologue']);
    if (this.deps.scenes.scene !== map) return;
    await map.playArrival();
    events.emit('spirit:say', ['They are out there, asleep in the six lands.', 'I will find every one of them.']);
  }

  // A chapter from the book; the opening also shows its fall into the lands again.
  private async replay(id: SceneId): Promise<void> {
    await this.playStory([id], false);
    const map = this.deps.scenes.scene;
    if (id === 'prologue' && map instanceof WorldMapScene) await map.playArrival();
  }

  private solved(): Solved {
    return Object.fromEntries(REGION_ORDER.map((id) => [id, getRegion(id).solved])) as unknown as Solved;
  }

  // One family light per finished land follows the player's light.
  private showFamily(visible: boolean): void {
    const solved = this.solved();
    const tokens: PaletteToken[] = visible ? REGION_ORDER.filter((id) => landDone(solved[id])).map((id) => REGION_ACCENT[id]) : [];
    events.emit('spirit:family', tokens);
  }

  // Plays story scenes over the current screen; they are remembered as seen.
  private async playStory(ids: SceneId[], remember = true): Promise<void> {
    if (ids.length === 0 || this.storyPlaying) return;
    this.storyPlaying = true;
    if (remember) ids.forEach((id) => markStorySeen(id));
    const player = new StoryPlayer(this.deps.app, currentProfile()?.color ?? 'mint', this.deps.audio);
    const stage = this.deps.app.stage;
    // The scene, the light and the HUD rest out of sight while the story plays; only the
    // drifting dust of the background (the stage's first layer) stays behind it.
    const resting = stage.children.slice(1).filter((c) => c.visible);
    stage.addChild(player);
    await player.fadedIn;
    resting.forEach((c) => (c.visible = false));
    await player.play(ids);
    resting.forEach((c) => (c.visible = true));
    await player.fadeOut();
    player.destroy();
    this.storyPlaying = false;
  }

  private back(): void {
    if (this.storyPlaying) return;
    const { settings, scenes } = this.deps;
    if (settings.isOpen) {
      settings.toggle();
      return;
    }
    const scene = scenes.scene;
    if (scene instanceof LevelShellScene) this.showRegion(scene.regionId);
    else if (scene instanceof RegionScene) this.showMap();
    else if (scene instanceof WorldMapScene) this.showTitle();
  }

  // Used by the settings reset so the player lands back on a fresh map.
  restartJourney(): void {
    this.showMap();
  }

  private applyProfileTint(): void {
    events.emit('spirit:tint', currentProfile()?.color ?? 'mint');
  }

  // A different light was chosen: recolour the companion and start from its map.
  profileChanged(): void {
    this.applyProfileTint();
    if (this.deps.scenes.scene instanceof TitleScene) return;
    this.showMap();
  }
}
