import gsap from 'gsap';
import { Text, type Application } from 'pixi.js';
import { alphas, palette } from '../design/palette';
import type { SceneManager } from './sceneManager';
import type { AudioEngine } from '../audio/engine';

export const devFlags = {
  enabled: import.meta.env.DEV && new URLSearchParams(location.search).get('dev') === '1',
};

// FPS meter: the one place text appears outside the title and level numbers, dev builds only.
export function installFpsMeter(app: Application): void {
  if (!devFlags.enabled) return;
  const label = new Text({
    text: '',
    style: { fontFamily: 'Quicksand', fontSize: 12, fill: palette.pearl },
    resolution: window.devicePixelRatio || 1,
  });
  label.alpha = alphas.hudIdle;
  label.position.set(10, app.screen.height - 22);
  app.stage.addChild(label);

  let frames = 0;
  let elapsed = 0;
  app.ticker.add((ticker) => {
    frames++;
    elapsed += ticker.deltaMS;
    if (elapsed >= 500) {
      label.text = `${Math.round((frames * 1000) / elapsed)} fps`;
      frames = 0;
      elapsed = 0;
    }
    label.y = app.screen.height - 22;
  });
}

// Exposes internals on window for poking at the game from the console in dev builds.
export function exposeDevHandles(app: Application, scenes: SceneManager, audio: AudioEngine): void {
  if (!devFlags.enabled) return;
  (window as unknown as { __luma: unknown }).__luma = { app, scenes, audio, gsap };
}
