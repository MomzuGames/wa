import gsap from 'gsap';
import { Container } from 'pixi.js';
import './style.css';
import { Stage3D, setStage3D } from './three/stage3d';
import '@fontsource/quicksand/300.css';
import { createApp, installResumeGuard, installTweenSafety, onResize } from './core/app';
import { installDebugLog } from './core/debugLog';
import { SceneManager } from './core/sceneManager';
import { installKeyboard } from './core/input';
import { createRng } from './core/rng';
import { hasProfiles, load } from './core/save';
import { exposeDevHandles, installFpsMeter } from './core/dev';
import { Game } from './core/game';
import { Background } from './fx/background';
import { ParticleSystem, createSoftDotTexture } from './fx/particles';
import { AudioEngine } from './audio/engine';
import { SettingsPanel } from './ui/settings';
import { Hud } from './ui/hud';
import { Spirit } from './ui/spirit';
import { GAME_TITLE } from './config/game';
import { ProfileOverlay } from './ui/profileOverlay';
import { installUpdates } from './core/updates';
import { type InstallContext, INSTALL_PARAM, captureInstallPrompt, installContext, isStandalone, wantsInstallGuide } from './core/install';
import { InstallGuide } from './ui/installGuide';
import { IS_APP } from './config/platform';
import { initNative } from './core/native';
import { showStudioCard } from './ui/studioCard';
import { events } from './core/events';

// Chrome may offer its install prompt before the game has loaded; hold on to it.
captureInstallPrompt();

async function main() {
  // The studio card covers the screen while everything below loads.
  const studio = skipStudioCard() ? null : showStudioCard();
  await document.fonts.load("300 64px 'Quicksand'", GAME_TITLE);
  // In the iPhone app, saves are restored from the app's own storage before they are read.
  await initNative();
  load();

  installTweenSafety();
  if (!IS_APP) installUpdates();
  const mount = document.querySelector<HTMLDivElement>('#app')!;
  const app = await createApp(mount);
  // The 3D layer under the game's canvas (puzzle dioramas, and later the world map).
  const stage3D = new Stage3D(mount);
  setStage3D(stage3D);
  installResumeGuard(app, () => events.emit('input:cancel'));
  installDebugLog(app, () => {
    const scene = scenes.scene as unknown as { constructor: { name: string }; regionId?: string; levelIndex?: number } | null;
    return scene ? `${scene.constructor.name}${scene.regionId ? `:${scene.regionId}:${(scene.levelIndex ?? -1) + 1}` : ''}` : 'none';
  });
  const rng = createRng('chowa');
  const audio = new AudioEngine();

  const softDot = createSoftDotTexture(app.renderer);
  const background = new Background(softDot, rng);
  const particles = new ParticleSystem(softDot);
  const scenes = new SceneManager();
  const settings = new SettingsPanel(audio, () => game.restartJourney());
  const hud = new Hud(settings);
  const spirit = new Spirit(particles);
  const profiles = new ProfileOverlay(() => game.profileChanged());
  const game = new Game({ app, scenes, audio, particles, hud, settings, openAccount: () => profiles.open() });

  // The light sits in its own layer, which the scrolling world map moves and zooms.
  const spiritLayer = new Container();
  spiritLayer.addChild(spirit);
  app.stage.addChild(background.container, scenes.root, particles.container, spiritLayer, hud, settings);
  // The 2D vignette and dust would grey out the 3D world: they fade away while it shows.
  stage3D.onActive = (active) => gsap.to(background.container, { alpha: active ? 0 : 1, duration: 0.8, ease: 'sine.inOut' });

  onResize(app, (w, h) => {
    stage3D.resize(w, h);
    background.resize(w, h);
    scenes.resize(w, h);
    hud.resize(w);
    settings.resize(w, h);
  });

  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS / 1000;
    background.update(dt);
    scenes.update(dt);
    spirit.update(dt);
    particles.update(dt);
    // The 3D layer draws last, once the scene has moved this frame.
    stage3D.render(dt);
  });

  installKeyboard();
  installFpsMeter(app);
  exposeDevHandles(app, scenes, audio, game);

  await studio?.held;
  game.start();
  studio?.dismiss();
  // First visit: choose or create a light before playing.
  const welcome = () => {
    if (!hasProfiles()) profiles.open();
  };
  if (!showInstallGuide(welcome)) welcome();
}

// The install link (`?install`) opens a guide for putting the game on a phone's home
// screen. Laptops and already-installed copies skip it and simply play.
function showInstallGuide(then: () => void): boolean {
  if (IS_APP || !wantsInstallGuide(location.search)) return false;
  const forced = new URLSearchParams(location.search).get(INSTALL_PARAM);
  // Dev only: `?install=ios-safari` (or android, android-inapp, ios-other) previews a phone's guide.
  const context =
    import.meta.env.DEV && forced ? (forced as InstallContext) : installContext(navigator.userAgent, isStandalone(), navigator.maxTouchPoints);
  if (context === 'installed' || context === 'desktop') {
    const url = new URL(location.href);
    url.searchParams.delete(INSTALL_PARAM);
    history.replaceState(null, '', url);
    return false;
  }
  new InstallGuide(context, then);
  return true;
}

void main();

// Dev jumps straight into a level skip the studio card.
function skipStudioCard(): boolean {
  return import.meta.env.DEV && new URLSearchParams(location.search).has('level');
}
