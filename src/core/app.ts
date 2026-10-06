import gsap from 'gsap';
import { Application, Container, type DestroyOptions } from 'pixi.js';
import { palette } from '../design/palette';
import { readSafeArea } from '../design/layout';
import { dlog, flush } from './debugLog';

const resumeChecks = [0, 250, 700, 1500];

export async function createApp(mount: HTMLElement): Promise<Application> {
  const app = new Application();
  await app.init({
    resizeTo: window,
    backgroundColor: palette.void,
    antialias: true,
    // Phones report a 3x pixel ratio; 2x is indistinguishable on this art and needs
    // less than half the pixels (and every glow filter renders at this scale too).
    resolution: Math.min(2, window.devicePixelRatio || 1),
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

// Coming back after the phone was locked or the app was in the background:
// - every drag still in progress is cancelled, so the next touch starts fresh;
// - if iOS threw away the game's graphics memory meanwhile (the screen would stay frozen
//   and taps would seem to do nothing), the game reloads into the same place: saves are
//   kept on every change, so nothing is lost but an unfinished drawing.
export function installResumeGuard(app: Application, cancel: () => void): void {
  const canvas = app.canvas;
  let lost = false;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
  });
  const gl = (app.renderer as unknown as { gl?: WebGLRenderingContext }).gl;
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('blur', cancel);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancel();
      return;
    }
    if (lost || gl?.isContextLost()) {
      dlog('reload-after-lost-context');
      flush();
      location.reload();
      return;
    }
    app.ticker.start();
    // iOS can report a passing size while the lock screen slides away: measure again a few
    // times over the next moments, so the game and the glass agree on where things are.
    for (const ms of resumeChecks) setTimeout(() => app.resize(), ms);
  });
  window.addEventListener('pageshow', (e) => {
    if ((e as PageTransitionEvent).persisted && (lost || gl?.isContextLost())) {
      dlog('reload-after-pageshow');
      flush();
      location.reload();
    }
  });
}

export function onResize(app: Application, handler: (width: number, height: number) => void): () => void {
  const fire = () => {
    readSafeArea();
    handler(app.screen.width, app.screen.height);
  };
  app.renderer.on('resize', fire);
  fire();
  return () => app.renderer.off('resize', fire);
}
