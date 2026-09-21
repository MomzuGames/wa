import { Application } from 'pixi.js';
import { palette } from '../design/palette';

export async function createApp(mount: HTMLElement): Promise<Application> {
  const app = new Application();
  await app.init({
    resizeTo: window,
    backgroundColor: palette.void,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    preference: 'webgl',
  });
  mount.appendChild(app.canvas);
  // Right-click is a game input (counter-clockwise rotation), not a menu.
  app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  return app;
}

export function onResize(app: Application, handler: (width: number, height: number) => void): () => void {
  const fire = () => handler(app.screen.width, app.screen.height);
  app.renderer.on('resize', fire);
  fire();
  return () => app.renderer.off('resize', fire);
}
