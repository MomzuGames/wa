import './style.css';
import '@fontsource/quicksand/300.css';
import { createApp, installTweenSafety, onResize } from './core/app';
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

async function main() {
  await document.fonts.load("300 64px 'Quicksand'", GAME_TITLE);
  load();

  installTweenSafety();
  installUpdates();
  const app = await createApp(document.querySelector<HTMLDivElement>('#app')!);
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

  game.start();
  // First visit: choose or create a light before playing.
  if (!hasProfiles()) profiles.open();
}

void main();
