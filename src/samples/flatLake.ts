import { Application, Container } from 'pixi.js';
import { palette } from '../design/palette';
import { durations, easings } from '../design/motion';
import { createRng } from '../core/rng';
import type { ShellContext } from '../regions/types';
import type { LanternLevel } from '../regions/moonlake/model';
import { LanternLakeScene } from '../regions/moonlake/view';

// The real Moon Lake puzzle, exactly as in the game, in its own small Pixi app: samples A and
// B draw around it. Sound is left out of the samples.
export async function flatLake(host: HTMLElement, level: LanternLevel, transparent: boolean, onSolved: () => void): Promise<{ app: Application; scene: LanternLakeScene; under: Container; destroy: () => void }> {
  const app = new Application();
  await app.init({
    resizeTo: host,
    backgroundColor: palette.void,
    backgroundAlpha: transparent ? 0 : 1,
    antialias: true,
    resolution: Math.min(2, window.devicePixelRatio || 1),
    autoDensity: true,
    preference: 'webgl',
  });
  app.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;display:block';
  host.appendChild(app.canvas);
  const silent = { onReady: () => {}, guard: <T,>(v: T) => v, sfx: {} };
  const ctx: ShellContext = {
    palette,
    motion: { durations, easings },
    audio: silent as never,
    particles: { emit: () => {}, container: new Container() } as never,
    rng: createRng('sample'),
    width: app.screen.width,
    height: app.screen.height,
  };
  const under = new Container();
  const scene = new LanternLakeScene(ctx, level, false);
  scene.container.y = 40; // below the sample switcher
  app.stage.addChild(under, scene.container);
  scene.on('solved', () => {
    void scene.playCompletion();
    onSolved();
  });
  const tick = () => scene.update(app.ticker.deltaMS / 1000);
  app.ticker.add(tick);
  const onResize = () => scene.layout(app.screen.width, app.screen.height - 40);
  app.renderer.on('resize', onResize);
  return {
    app,
    scene,
    under,
    destroy: () => {
      app.ticker.remove(tick);
      app.renderer.off('resize', onResize);
      scene.destroy();
      app.destroy(true, { children: true });
    },
  };
}
