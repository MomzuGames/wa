import type { Application } from 'pixi.js';
import { SceneManager } from './sceneManager';
import { events } from './events';
import { devFlags } from './dev';
import { createRng } from './rng';
import { levelUnlocked, progression, setBypassLocks } from './progress';
import { currentProfile } from './save';
import type { RegionId, ShellContext } from '../regions/types';
import { REGION_ORDER } from '../regions/catalog';
import { getModule } from '../regions/registry';
import { palette } from '../design/palette';
import { durations, easings } from '../design/motion';
import type { AudioEngine } from '../audio/engine';
import type { ParticleSystem } from '../fx/particles';
import type { Hud } from '../ui/hud';
import type { SettingsPanel } from '../ui/settings';
import { TitleScene } from '../scenes/title';
import { WorldMapScene, type MapReveal } from '../map/worldMap';
import { RegionScene } from '../map/regionScene';
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
  constructor(private deps: GameDeps) {
    events.on('input:back', () => this.back());
    // Browsers only allow audio after a gesture; the first one anywhere unlocks it.
    // iOS Safari counts touchend/click (not touchstart), so listen to all of them.
    const unlock = () => {
      void deps.audio.start();
      for (const type of ['pointerdown', 'touchend', 'click', 'keydown']) window.removeEventListener(type, unlock);
    };
    for (const type of ['pointerdown', 'touchend', 'click', 'keydown']) window.addEventListener(type, unlock);
  }

  start(): void {
    this.applyProfileTint();
    if (devFlags.enabled) {
      setBypassLocks(true);
      const jump = new URLSearchParams(location.search).get('level');
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
    this.deps.hud.setBackVisible(false);
    this.deps.hud.setLevelButtons(null);
    this.deps.hud.setAccountButton(() => this.deps.openAccount());
    this.deps.audio.setScene('title');
    void this.deps.scenes.go(new TitleScene(() => this.showMap()));
  }

  showMap(reveal: MapReveal | null = null): void {
    this.deps.hud.setBackVisible(true);
    this.deps.hud.setLevelButtons(null);
    this.deps.hud.setAccountButton(() => this.deps.openAccount());
    this.deps.audio.setScene('quiet');
    void this.deps.scenes.go(new WorldMapScene((id) => this.showRegion(id), reveal));
  }

  showRegion(id: RegionId, justSolved: number | null = null): void {
    this.deps.hud.setBackVisible(true);
    this.deps.hud.setLevelButtons(null);
    this.deps.hud.setAccountButton(null);
    this.deps.audio.setScene(id);
    void this.deps.scenes.go(new RegionScene(id, (level) => this.showLevel(id, level), justSolved));
  }

  showLevel(id: RegionId, levelIndex: number): void {
    this.deps.hud.setBackVisible(true);
    this.deps.hud.setAccountButton(null);
    this.deps.audio.setScene(id);
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
      await getModule(regionId).playRegionFinale(ctx);
      this.showMap({ completed: regionId });
      return;
    }
    const next = levelIndex + 1;
    const chapterEnded = next % progression.levelsPerChapter === 0;
    if (!chapterEnded && next < progression.levelsPerRegion && levelUnlocked(regionId, next)) {
      this.showLevel(regionId, next);
    } else {
      this.showRegion(regionId, levelIndex);
    }
  }

  private back(): void {
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
