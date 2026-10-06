import './style.css';
import '@fontsource/quicksand/300.css';
import { createApp, installResumeGuard, installTweenSafety, onResize } from './core/app';
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
import { UnlockCard } from './ui/unlockCard';
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
  const app = await createApp(document.querySelector<HTMLDivElement>('#app')!);
  installResumeGuard(app, () => events.emit('input:cancel'));
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
  const unlockCard = new UnlockCard();
  events.on('unlock:ask', () => unlockCard.open());
  const game = new Game({ app, scenes, audio, particles, hud, settings, openAccount: () => profiles.open() });

  app.stage.addChild(background.container, scenes.root, particles.container, spirit, hud, settings);

  onResize(app, (w, h) => {
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
