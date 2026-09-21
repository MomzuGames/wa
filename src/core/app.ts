import gsap from 'gsap';
import { Application, Container, type DestroyOptions } from 'pixi.js';
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

// Any tween still targeting a display object (or its scale/position) dies with it,
// so a late-starting animation can never touch a destroyed object.
export function installTweenSafety(): void {
  const original = Container.prototype.destroy;
  Container.prototype.destroy = function (this: Container, options?: DestroyOptions) {
    if (!this.destroyed) {
      gsap.killTweensOf(this);
      gsap.killTweensOf(this.scale);
      gsap.killTweensOf(this.position);
    }
    original.call(this, options);
  };
}

export function onResize(app: Application, handler: (width: number, height: number) => void): () => void {
  const fire = () => handler(app.screen.width, app.screen.height);
  app.renderer.on('resize', fire);
  fire();
  return () => app.renderer.off('resize', fire);
}
